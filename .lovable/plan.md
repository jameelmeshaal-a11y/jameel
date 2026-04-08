

# Total Cost Distribution with Deterministic AI Fallback

## Summary

Add a "التكلفة الإجمالية / Total Cost" input to the Price Breakdown Modal. When entered, distribute across breakdown components using item-specific ratios. AI fallback generates ratios only once — they are persisted to the item and reused forever.

## Architecture

```text
User enters Total Cost
        │
  Resolve Ratios (priority)
        │
  1. Current item breakdown → compute ratios
  2. Linked rate_library → use *_pct columns
  3. Item's saved ai_generated ratios → reuse (NO re-generation)
  4. AI generates once → persist to item → distribute
        │
  Normalize → Distribute → Round → Remainder to last field
        │
  Sum === Total Cost (exact, deterministic)
```

## Changes

### 1. `src/lib/pricing/smartRecalculator.ts` — Add distribution logic

New types and functions:

```typescript
type RatioSource = 'current_item' | 'linked_library' | 'ai_generated' | 'none';

interface RatioResolution {
  ratios: Record<BreakdownField, number>;  // normalized to sum=1.0
  source: RatioSource;
  normalized: boolean;
}

function distributeTotal(totalCost: number, ratios: Record<BreakdownField, number>): BreakdownValues
```

- `distributeTotal`: normalize ratios to sum=1.0, multiply × totalCost, round to 2 decimals, apply remainder to last non-zero component
- `resolveRatiosFromValues(values: BreakdownValues)`: compute ratios from current item if any field > 0
- `resolveRatiosFromLibrary(pcts)`: convert `*_pct` fields to ratio map

### 2. `supabase/functions/generate-breakdown/index.ts` — New edge function (AI fallback)

Called ONLY when no saved ratios exist anywhere. Uses Lovable AI gateway (`google/gemini-3-flash-preview`).

- Input: `{ description, description_en, unit, category }`
- System prompt: Saudi construction cost estimator generating realistic breakdown percentages
- Uses tool calling to extract structured output: `{ materials_pct, labor_pct, equipment_pct, logistics_pct, risk_pct, profit_pct }`
- Returns normalized percentages

**AI determinism guarantee**: The modal calls this ONCE, then immediately persists the returned ratios to `boq_items` (as breakdown values based on a unit total of 100). On next open, ratios are read from the item — AI is never called again for the same item.

### 3. `src/components/PriceBreakdownModal.tsx` — Add Total Cost field + distribution UI

**New state:**
- `totalCostInput: string`
- `ratioSource: RatioSource`
- `ratioWarning: string | null`
- `ratioPercentages: Record<BreakdownField, number>` — for display

**Ratio resolution on modal open (editing mode):**
1. Compute from `initial` values (current item) — if sum > 0, use these
2. If all zeros + `linked_rate_id` exists → fetch `rate_library` row for `*_pct` columns
3. If still no ratios → check if item already has AI-generated ratios stored (source field or manual_overrides flag)
4. If truly nothing → call `generate-breakdown` edge function → **immediately persist** generated ratios to `boq_items` as breakdown values (scaled to sum=100) so they're saved for reuse. Set `source` to `"ai_generated"` on the item.

**Determinism flow:**
- First time with no ratios: AI generates → ratios saved to item → distributed
- Every subsequent time: ratios read from item → distributed (AI never called again)
- If user later edits and saves manually, those become the new ratios

**UI additions (editing mode):**
- "التكلفة الإجمالية / Total Cost" prominent input field with SAR label, above component rows
- On change: `distributeTotal()` → update all component values live
- Each component row shows percentage beside value
- Ratio source badge: "من البند الحالي" / "من مكتبة الأسعار" / "توزيع ذكاء اصطناعي"
- Warning banners:
  - Yellow: "تم تطبيع نسب التوزيع المحفوظة" (normalized)
  - Orange: "لا توجد نسب محفوظة — تم استخدام توزيع الذكاء الاصطناعي" (AI used, first time only)
  - Red: "لا توجد نسب ولا يمكن توليدها" (edge function failed — allow manual entry only)

**Save behavior:**
- Existing `handleSave` persists all breakdown fields — no change needed
- If AI ratios were generated, they're already persisted before distribution
- Total = sum of components (no new column)

## Guarantees

- **Deterministic AI**: AI generates ratios once per item. Ratios are persisted to the item record. Same item always gets same ratios across sessions.
- **Sum accuracy**: Rounding remainder applied to last component. `sum === totalCost` always.
- **No generic defaults**: Each item uses its own structure. AI generates item-specific ratios based on description and category.
- **Priority enforcement**: Current item → Library → Persisted AI → Generate (once) → Manual only

## Files Changed

| File | Change |
|---|---|
| `src/lib/pricing/smartRecalculator.ts` | Add `distributeTotal()`, `resolveRatiosFromValues()`, types |
| `src/components/PriceBreakdownModal.tsx` | Add Total Cost input, ratio resolution with AI persistence, live distribution, warnings |
| `supabase/functions/generate-breakdown/index.ts` | New edge function for one-time AI ratio generation |


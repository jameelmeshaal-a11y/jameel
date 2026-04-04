

# Semantic Row Grouping — Full-Stack Implementation

## Confirmed Scope

All changes happen in the **database-backed pricing pipeline**. Nothing is UI-only.

- `groupSemanticRows()` runs inside `runPricingEngine()` before classification/pricing
- Merged descriptions are used for real `detectCategory()` and `findRateLibraryMatch()` calls
- Pricing results are written to real `boq_items` records via Supabase
- Contributor rows are marked `status: 'descriptive'` in the database
- Low-confidence merged items are priced but flagged `status: 'needs_review'` with a note in the database
- Manual overrides (`source === 'manual_override'` or non-empty `manual_overrides`) are preserved — never overwritten
- On reopen, all statuses and notes come from the database — no frontend-only state

## Files

| File | Action |
|------|--------|
| `src/lib/boqRowGrouping.ts` | **New** — `groupSemanticRows()` + types |
| `src/lib/boqRowGrouping.test.ts` | **New** — 4 mandatory test cases |
| `src/lib/pricingEngine.ts` | **Modified** — replace raw row loop with semantic block loop |

No database migration needed — uses existing columns.

## `src/lib/boqRowGrouping.ts`

```typescript
interface SemanticBlock {
  primaryRow: BoQItem;         // qty > 0 — receives pricing
  contributorRows: BoQItem[];  // qty = 0 above — marked descriptive
  mergedDescription: string;
  mergedDescriptionEn: string;
  quantity: number;
  unit: string;
  itemNo: string;
}
```

**Algorithm** (iterate rows by `row_index` ascending):

1. Accumulate consecutive zero-quantity rows into a buffer
2. When a priced row (qty > 0) appears:
   - Check if buffered rows belong to the same item (no new `item_no`, no section-title patterns like "أعمال", "القسم", "SECTION", all-caps headers)
   - If related: create a `SemanticBlock` with `mergedDescription = buffer descriptions + " — " + priced row description`
   - If unrelated (section headers/notes): flush buffer as standalone descriptive rows, priced row gets its own block
3. Standalone priced rows (no buffer) pass through unchanged

**Section-title detection** (prevents merging unrelated headers):
- Row text matches patterns: starts with "أعمال", "القسم", "باب", "SECTION", numbered headings like "1-", "أولاً"
- Row has no `item_no` and text is very short (< 5 words) and generic

## `src/lib/pricingEngine.ts` Changes

Replace the current `for (let i = 0; i < items.length; i++)` loop (lines 193–280) with:

```
const blocks = groupSemanticRows(items);

for (const block of blocks) {
  // 1. Mark contributor rows as descriptive in DB
  for (const contributor of block.contributorRows) {
    await supabase.from("boq_items").update({
      status: "descriptive",
      notes: `وصف مدمج مع البند ${block.itemNo}`,
      unit_rate: null, total_price: null, ...nullFields
    }).eq("id", contributor.id);
  }

  // 2. Manual override protection
  if (block.primaryRow.source === "manual_override" 
      || (block.primaryRow.manual_overrides && Object.keys(block.primaryRow.manual_overrides).length > 0)) {
    // Skip — preserve existing pricing, flag for review
    await supabase.from("boq_items").update({
      status: "needs_review",
      notes: "تم تخطي إعادة التسعير — يوجد تعديل يدوي محفوظ"
    }).eq("id", block.primaryRow.id);
    continue;
  }

  // 3. Classify using merged description
  const detection = detectCategory(block.mergedDescription, block.mergedDescriptionEn);

  // 4. Price using merged description + primary row's quantity
  // ... existing library match / AI fallback logic, but using block.mergedDescription

  // 5. Low confidence adjustment (user's clarification)
  if (detection.confidence < 60 || cost.confidence < 70) {
    cost.confidence = Math.min(cost.confidence, 65);
    status = "needs_review";
    cost.explanation += " | ⚠️ تسعير بثقة منخفضة — وصف مدمج";
  }

  // 6. Write to primary row in DB
  await supabase.from("boq_items").update({ ...pricingFields }).eq("id", block.primaryRow.id);
}
```

Key: non-priced rows that are NOT part of any block (standalone descriptive) continue to be handled exactly as before (marked descriptive, pricing cleared).

## Test Cases (`boqRowGrouping.test.ts`)

| # | Input | Expected |
|---|-------|----------|
| 1 | Row A: title, qty=0 → Row B: continuation, qty>0 | One block, merged description, priced on B |
| 2 | Two rows each with item_no + qty>0 | Two separate blocks, no merge |
| 3 | Row A: heading qty=0 → Row B: scope qty=0 → Row C: qty>0 | One block, A+B+C merged, priced on C |
| 4 | Row with `manual_overrides` set | Block created but pricing skipped |

## Safety Guarantees

- **Quantity**: never aggregated — always from `primaryRow.quantity` only
- **Zero-qty rows**: never priced — always marked `descriptive`
- **Low confidence**: priced but flagged `needs_review` with explanatory note in DB
- **Manual overrides**: detected and skipped, flagged `needs_review`
- **Section headers**: excluded from merging via pattern detection
- **Read path**: all statuses, notes, confidence come from `boq_items` table — no frontend state


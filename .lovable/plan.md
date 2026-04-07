

# Deterministic Pricing System — Strict Enforcement (Revised)

## Summary

Remove all AI price generation, enforce exact `target_rate` from library, raise thresholds, block unmatched from totals. **Fuzzy matching kept for item identification only** — never for price generation.

## Changes

### 1. `src/lib/pricingEngine.ts` — 7 edits

**1a. Remove AI fallback (lines ~593-637)**
Replace the `else` block calling `calculateItemPrice()` with NO MATCH handler:
- `unit_rate: null`, `total_price: null`, all breakdowns null
- `source: "no_match"`, `status: "unmatched"`, `confidence: 0`
- Note: `🔴 NO MATCH — لم يتم العثور على البند في مكتبة الأسعار`

**1b. Remove `priceFromLibrary()` function (lines ~213-249)**
Delete entirely — it applies complexity/quantity multipliers violating zero-deviation rule.

**1c. Force exact rate for all matches (lines ~563-592)**
Replace non-approved branch with `priceFromApprovedRate()`. Every matched item uses `target_rate` exactly.

**1d. Raise matching thresholds (NOT remove fuzzy matching)**
Keep all fuzzy matching logic (aliases, description, text similarity, n-grams, Jaccard) — these are for **item identification only**.
- Change Path B threshold from `>= 30` to `>= 50`
- Change Path C approved fallback threshold from `>= 15` to `>= 50`
- Keep historical Pass 2 fuzzy (Jaccard ≥ 0.85) — it identifies items, doesn't generate prices

Matching finds the library entry → `target_rate` used exactly. No price is ever generated.

**1e. Update status logic (lines ~639-657)**
- `confidence >= 70` → `"approved"`
- `confidence 50-69` → `"needs_review"`
- No match → `"unmatched"` (handled in 1a)
- Remove all AI confidence/deviation checks

**1f. Remove `calculateItemPrice` import (line 18)**

**1g. Block unmatched from total (line ~693)**
Only add to `totalValue` if matched. Unmatched = 0 contribution.

**1h. Audit fields on every DB write**
Confirm each item stores: `source`, `linked_rate_id`, `confidence`, `updated_at`.

### 2. `src/components/BoQTable.tsx` — Export + UI

- Export only `status === "approved"` items; warn about excluded count
- 🔴 indicator for unmatched items with manual price input field

### No database changes needed

## Files Changed

| File | Change |
|---|---|
| `src/lib/pricingEngine.ts` | Remove AI fallback + `priceFromLibrary()`, raise thresholds to 50, exact rates for all matches |
| `src/components/BoQTable.tsx` | Export restriction, unmatched item UI |

## Key Distinction

| Action | Allowed? |
|---|---|
| Fuzzy/alias/description matching to **find** library item | Yes |
| Historical Jaccard ≥0.85 to **identify** same item | Yes |
| Using `target_rate` exactly once item is found | Yes |
| AI generating a price when no match found | **No — removed** |
| Multipliers adjusting matched rate | **No — removed** |

## Validation

| Scenario | Before | After |
|---|---|---|
| Library item at 31 SAR | 31 × 1.08 × 1.06 = 35.5 | **31 SAR exactly** |
| No library match | AI generates 852 SAR | **NULL — 🔴 manual** |
| Similarity 55% via alias match | Auto-approved | **needs_review** |
| Similarity 40% | Matched via Path C | **NO MATCH** |
| Historical fuzzy 0.87 Jaccard | Matched + multiplied | **Matched → exact rate** |


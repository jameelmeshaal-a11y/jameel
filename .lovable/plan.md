

# Reprice Unpriced BoQ Items Only

## Summary

Add a new button "تسعير البنود غير المسعرة" in the BoQ table that re-runs the pricing engine exclusively on unpriced rows, leaving all existing priced rows untouched.

## Changes

### 1. `src/lib/pricingEngine.ts` — Add `repriceUnpricedItems()` function

New exported function that:
- Fetches only unpriced items from `boq_items` where `boq_file_id` matches AND (`unit_rate IS NULL` OR `unit_rate = 0` OR `status = 'unmatched'`) AND `quantity > 0`
- Fetches the latest `rate_library`, location factors, sources, and historical map (same as `runPricingEngine`)
- Runs the same matching + pricing logic (semantic grouping, `findRateLibraryMatch`, `priceFromApprovedRate`) on only those rows
- Updates only the rows that get a match; leaves still-unmatched rows as-is
- Calls `recalculate_project_total` at the end
- Returns count of newly priced items and count of still-unmatched items

### 2. `src/components/BoQTable.tsx` — Add button + handler

**Handler `handleRepriceUnpriced`**:
- Calls `repriceUnpricedItems(boqFileId, cities, onProgress)`
- Shows toast with results: "تم تسعير X بند — Y بند لا يزال بدون سعر"
- Refetches queries

**Button placement**: After the "إعادة التسعير" button, before export buttons. Shows only when there are unpriced items (`priceableCount - pricedCount > 0`).

```
<Button variant="secondary" size="sm" className="gap-1" onClick={handleRepriceUnpriced} disabled={pricing}>
  <Play className="w-3 h-3" /> تسعير البنود غير المسعرة ({unpricedCount})
</Button>
```

### Technical Detail

The `repriceUnpricedItems` function filters at the DB level:
```sql
SELECT * FROM boq_items 
WHERE boq_file_id = ? 
  AND quantity > 0 
  AND (unit_rate IS NULL OR unit_rate = 0 OR status = 'unmatched')
ORDER BY row_index
```

It reuses the same `findRateLibraryMatch` + `priceFromApprovedRate` pipeline. Already-priced rows are never fetched, so they cannot be modified.

## Files Changed

| File | Change |
|---|---|
| `src/lib/pricingEngine.ts` | Add `repriceUnpricedItems()` export |
| `src/components/BoQTable.tsx` | Add button + handler for repricing unpriced items |

## What Is NOT Changed

- `runPricingEngine` — untouched
- Export logic — untouched
- Already priced rows — never queried or modified
- Schema/tables — no changes




# Reset Price Library + Bulk Approve Pending Items

## Summary

1. Clear all data from `rate_library` and `rate_sources` (data only, no schema changes)
2. Add a "اعتماد جميع البنود المعلقة" (Approve All Pending) button to the Rate Library page
3. Preserve all existing individual item actions (edit, approve, delete)

## Current Approval Model

Items use `approved_at` (timestamp) and `approved_by` (uuid) fields — not a `status` column. An item is "pending" when `approved_at IS NULL`.

## Changes

### 1. Data Reset (via insert tool)

```sql
DELETE FROM rate_sources;
DELETE FROM rate_library;
```

No schema changes. Tables remain intact.

### 2. `src/hooks/usePriceLibrary.ts` — Add `useBulkApprovePending` hook

New mutation that:
- Updates all `rate_library` rows where `approved_at IS NULL`
- Sets `approved_at = now()`, `approved_by = userId`, `source_type = 'Approved'`
- Returns count of affected items
- Invalidates `price-library` query cache

### 3. `src/pages/RateLibraryPage.tsx` — Add bulk approve button

- Add a "✅ اعتماد جميع البنود المعلقة" button in the header action bar (next to export/import buttons)
- Only visible when there are pending items (`items.filter(i => !i.approved_at).length > 0`)
- Shows confirmation dialog before execution
- Shows count: "اعتماد X بند معلق؟"
- After success: toast with count of approved items
- All existing individual actions (pencil edit, single approve ✓, delete 🗑) remain unchanged

### Flow After Implementation

1. Upload new price library via "رفع ملف أسعار" → items arrive as pending
2. Review items in the table
3. Click "اعتماد جميع البنود المعلقة" → all pending → approved in one action
4. Individual items can still be edited, approved one-by-one, or deleted as before

## Files Changed

| File | Change |
|---|---|
| Data operation | DELETE from `rate_sources`, `rate_library` |
| `src/hooks/usePriceLibrary.ts` | Add `useBulkApprovePending` mutation |
| `src/pages/RateLibraryPage.tsx` | Add bulk approve button with confirmation |


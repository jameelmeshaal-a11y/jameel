

# Fix Porcelain Item Units and Reprice

## Problem
Two porcelain BoQ items have incorrect units due to a parsing/typographical error:
- **بورسلين أرضيات... نموذج -1**: unit = `م131` (should be `م²`)
- **بورسلين أرضيات... نموذج -21**: unit = `م132` (should be `م²`)

## Changes

### 1. Database Migration — Fix units
```sql
UPDATE boq_items SET unit = 'م²' WHERE id = 'b3352e25-0270-431c-a8fe-c5d859c04d68';
UPDATE boq_items SET unit = 'م²' WHERE id = 'e84df4cd-2a09-4710-8108-b025e47eb945';
```

### 2. Reprice these two items
After fixing the units, call the `repriceUnpricedItems` function (already implemented) on `boq_file_id = fbd1ba8d-09fc-408c-9383-7a2e85e1c2a8`. Since these two items have `unit_rate = NULL` and `status = 'pending'`, they will be picked up and matched against the rate library. With the correct unit (`م²`), they should now match the library entries.

### 3. Parser improvement — Handle merged unit+number in future uploads
Add a cleanup rule in `boqParser.ts` to detect and fix common parsing artifacts where a unit character gets concatenated with adjacent cell numbers (e.g., `م131` → `م²`). This prevents recurrence.

## Files Changed

| File | Change |
|---|---|
| Migration SQL | Fix unit for 2 items to `م²` |
| `src/lib/boqParser.ts` | Add unit cleanup for merged unit+number artifacts |

## What Is NOT Changed
- Already priced rows — untouched
- Rate library — untouched
- Export logic — untouched


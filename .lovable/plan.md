

# Fix: BMS source value violates database constraint

## Problem
The BMS pricing engine sets `source: "bms-points-engine"` when updating `boq_items`, but the database has a CHECK constraint (`boq_items_source_check`) that only allows these values:
`library`, `library-high`, `library-medium`, `ai`, `manual`, `project_override`, `master_update`

## Solution — Two changes needed

### 1. Add `"bms-points-engine"` to the database constraint
Run a migration to drop and recreate the CHECK constraint with the new value included.

```sql
ALTER TABLE public.boq_items DROP CONSTRAINT boq_items_source_check;
ALTER TABLE public.boq_items ADD CONSTRAINT boq_items_source_check 
  CHECK (source IN ('library', 'library-high', 'library-medium', 'ai', 'manual', 'project_override', 'master_update', 'bms-points-engine'));
```

### 2. No code changes needed
The `source: "bms-points-engine"` value in `pricingEngine.ts` is correct and descriptive. We just need the database to accept it.

## Files affected

| File | Change |
|---|---|
| Database migration | Add `bms-points-engine` to `boq_items_source_check` constraint |

After this fix, pressing the reprice button on a BMS item will successfully save the calculated price to the database.


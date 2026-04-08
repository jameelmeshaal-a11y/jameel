

# Clear Stale BoQ Data

## What

Delete all rows from `boq_items` and `boq_files` tables so you can re-upload fresh. No code changes. Rate library stays intact.

## Steps

1. **Delete all `boq_items`** (1,839 rows) — must go first since items reference files
2. **Delete all `boq_files`** (5 rows)
3. **Reset project totals** to 0 and `boq_count` to 0 on all projects (so the UI doesn't show stale totals)

## SQL Operations

```sql
-- Step 1: Clear all BoQ items
DELETE FROM boq_items;

-- Step 2: Clear all BoQ files  
DELETE FROM boq_files;

-- Step 3: Reset project counters
UPDATE projects SET total_value = 0, boq_count = 0;
```

## What stays unchanged

- `rate_library` — completely untouched
- `pricingEngine.ts` — no code changes
- All other tables (documents, profiles, etc.)

## After completion

You re-upload each BoQ file fresh. The deterministic engine will price every item using exact `target_rate` from the library, with no AI fallback.


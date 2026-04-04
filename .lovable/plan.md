

# Auto-Sync Manual Edits to Rate Library — Implementation Plan

## What This Does
Every manual price save (QuickSave, Approve, Propagate) automatically syncs the approved price to the central rate library. The synced rate becomes the highest-priority "Approved" source, immediately reusable in current repricing and all future projects.

## Files

| File | Action |
|------|--------|
| `src/lib/pricing/rateSyncService.ts` | **New** — core `syncToRateLibrary()` function |
| `src/components/PriceBreakdownModal.tsx` | **Modified** — call sync from QuickSave, Approve, and Propagation flows |
| `src/lib/pricing/propagationService.ts` | **Modified** — call sync after source item update |

No database migration needed — all required columns already exist.

## New: `src/lib/pricing/rateSyncService.ts`

Creates a `syncToRateLibrary()` function that:

1. **Fetches real context** — queries `boq_files` for real `name` and `city` (never hardcoded)
2. **Optionally re-fetches item pricing** — when called without explicit values (Approve flow), fetches latest pricing from `boq_items` to guarantee freshness
3. **Safe multi-factor matching** — queries `rate_library` by normalized `unit` + `category`, then scores by `textSimilarity` (reused from `similarItemMatcher.ts`). Only updates existing if similarity ≥ 0.7 AND `is_locked !== true`. Otherwise inserts new entry.
4. **Upserts `rate_library`** — update: `source_type = "Revised"`, `last_reviewed_at = now()`; insert: `source_type = "Field-Approved"`, `min/max = rate ± 10%`
5. **Inserts `rate_sources`** — `source_type: "Approved"`, `is_verified: true`, `city` from DB, `source_name` = real BoQ file name
6. **Links item** — updates `boq_items.linked_rate_id` to library entry ID
7. **Guards** — skips if `quantity <= 0` or `unitRate <= 0`

## Modified: `PriceBreakdownModal.tsx`

### `handleQuickSave` (after successful DB update, ~line 145)
Calls `syncToRateLibrary()` passing the in-memory `values` and computed `unitRate` (these are fresh — just saved to DB).

### `handleApprove` (~line 211, after successful status update)
Calls `syncToRateLibrary()` with only `itemId` and `boqFileId` — the service re-fetches latest pricing from `boq_items` to guarantee no stale state.

### `handlePropagationConfirm` (~line 200, after propagation succeeds)
Calls `syncToRateLibrary()` passing the propagated `values`.

## Modified: `propagationService.ts`

After the source item update succeeds (~line 64), fetches the source item's `description`, `description_en`, `unit`, `quantity` (extending existing query at line 67), then calls `syncToRateLibrary()` with the propagated values.

## Why the Synced Rate Is Immediately Trusted

The existing pricing engine already:
1. `findRateLibraryMatch()` finds entries by category + keywords
2. `resolveFromSources()` prioritizes `source_type = "Approved"` over Supplier/Historical
3. Uses the resolved rate as `target_rate`

The inserted `rate_sources` entry with `"Approved"` + `is_verified: true` automatically becomes the highest-priority rate — no engine changes needed.

## Technical Details

- Text similarity functions (`textSimilarity`, `normalizeUnit`, `tokenize`) are imported from `similarItemMatcher.ts` — they need to be exported from there
- Category is detected via `detectCategory()` from `pricingEngine.ts` at sync time (not stored on `boq_items`)
- City comes from `boq_files.city` (real DB value, empty string if not set)
- RLS on `rate_library` and `rate_sources` requires admin role for writes — this is correct for the approval workflow


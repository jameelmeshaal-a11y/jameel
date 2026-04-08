

# BoQ Management Module — UI/UX Enhancement Plan

## Summary

Layer BoQ management features (archive, delete, filtered export, pricing sync, rename, breadcrumbs) on top of the existing project/BoQ infrastructure. No changes to pricing engine internals.

## What Already Exists (No Changes Needed)
- Project CRUD, BoQ file upload/parse, BoQ items table, Excel export, pricing engine

## New Features to Build

### 1. Database: Add `is_archived` boolean to `boq_files`

```sql
ALTER TABLE boq_files ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
```

Using a separate boolean instead of overloading `status` (which tracks processing state). No new tables needed — `pricingStatus` will be computed client-side from items data.

### 2. `src/hooks/useSupabase.ts` — Add mutations

- **`useDeleteBoQ`**: Delete all `boq_items` where `boq_file_id = id`, delete the `boq_files` row, invalidate all related query keys (`boq-files`, `boq-items`, `projects`)
- **`useDeleteProject`**: Delete all items for all BoQs in project, delete all BoQs, delete project, invalidate and navigate to `/projects`
- **`useArchiveBoQ`**: Update `is_archived = true`, invalidate queries
- **`useRestoreBoQ`**: Update `is_archived = false`, invalidate queries
- **`useRenameBoQ`**: Update `name` field, invalidate queries
- **`useBoQFiles`**: Update to accept optional `archived` filter parameter

### 3. `src/pages/ProjectDetail.tsx` — Major UI updates

**Breadcrumb**: Always-visible breadcrumb: `المشاريع > [Project Name] > [BoQ Name]` (BoQ name appears when one is selected)

**Active/Archived tabs**: Two tabs above the BoQ list filtering by `is_archived`. Show counts for each.

**BoQ card actions**: Add action buttons per BoQ card:
- 🗄 Archive (active tab) / Restore (archived tab)
- 🗑 Delete (with confirmation dialog)
- Inline rename (click-to-edit on BoQ name)

**Pricing status badge**: Computed from items — count items with `unit_rate > 0` vs total priceable items → show "غير مسعّر" / "مسعّر جزئياً" / "مسعّر بالكامل"

**Delete Project button**: In the Settings tab with confirmation dialog

### 4. `src/components/BoQTable.tsx` — New action buttons

**Export Unpriced Only**: New button that filters `items.filter(i => !i.unit_rate || i.unit_rate === 0)` and calls `exportStyledBoQ` with only those items. File name: `[BoQName]_unpriced_[date].xlsx`

**Apply Pricing from Library**: New button that runs pricing engine ONLY on items where `unit_rate` is null/0. After completion, shows summary toast: "X items priced, Y items still unpriced". This reuses the existing `runPricingEngine` but passes a filter flag.

**Archive button**: Archive/restore the current BoQ from within the detail view.

**Delete button**: Delete current BoQ with confirmation, navigate back to BoQ list.

**Read-only mode**: If BoQ is archived, disable pricing buttons, show "archived" banner, keep export buttons enabled.

### 5. `src/pages/ProjectsPage.tsx` — Minor updates

- Add delete project button per project card (with cascade confirmation dialog)
- Show BoQ count badge (already exists)
- Clear all query cache after deletion

### 6. `src/lib/pricingEngine.ts` — Add unpriced-only filter

Add optional parameter `unpricedOnly?: boolean` to `runPricingEngine`. When true, only process items where `unit_rate` is null or 0. This is a filter on the item selection, not a change to pricing logic itself.

## Files Changed

| File | Change |
|---|---|
| Migration SQL | Add `is_archived` to `boq_files` |
| `src/hooks/useSupabase.ts` | Add delete/archive/restore/rename mutations |
| `src/pages/ProjectDetail.tsx` | Breadcrumbs, active/archived tabs, action buttons, pricing status, delete project |
| `src/pages/ProjectsPage.tsx` | Delete project button per card |
| `src/components/BoQTable.tsx` | Export unpriced, apply pricing (unpriced only), archive/delete buttons, read-only mode |
| `src/lib/pricingEngine.ts` | Add `unpricedOnly` filter parameter (no logic change) |

## Strict Boundaries Respected
- No changes to pricing algorithm internals
- No changes to rate library
- No changes to auth or settings
- No new AI features
- Existing components only modified where explicitly required


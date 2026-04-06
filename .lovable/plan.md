

# Integrated Pricing System Enhancement

## Overview

This plan adds 6 interconnected features to the pricing system. The existing `rate_library` table already covers most of the requested `price_library` functionality, so we'll extend it rather than duplicate. The existing `RateLibraryPage` currently uses mock data — we'll rewire it to use real database data.

## Database Changes (3 new tables, 1 table extension)

### New Table: `project_budget_distribution`
```sql
CREATE TABLE project_budget_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  materials_percentage numeric NOT NULL DEFAULT 45,
  labor_percentage numeric NOT NULL DEFAULT 30,
  equipment_percentage numeric NOT NULL DEFAULT 15,
  other_percentage numeric NOT NULL DEFAULT 10,
  materials_amount numeric NOT NULL DEFAULT 0,
  labor_amount numeric NOT NULL DEFAULT 0,
  equipment_amount numeric NOT NULL DEFAULT 0,
  other_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: user_id = auth.uid() for all ops
```

### New Table: `price_change_log`
```sql
CREATE TABLE price_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  rate_library_id uuid,
  old_price numeric,
  new_price numeric,
  changed_by uuid NOT NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: changed_by = auth.uid() for insert, select via project ownership
```

### Extend `rate_library` table
Add columns to support the `price_library` concept without creating a duplicate table:
```sql
ALTER TABLE rate_library
  ADD COLUMN item_code text DEFAULT '',
  ADD COLUMN item_name_aliases text[] DEFAULT '{}',
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz;
```

The existing columns already cover: `standard_name_ar` (= item_name), `category`, `unit`, `target_rate` (= unit_price), `is_locked`, `source_type`.

## Edge Function: `match-price-item`

A new edge function that receives an item description and returns best matches from the library using fuzzy matching:

- Fetches all approved items from `rate_library`
- Implements Levenshtein distance + token overlap scoring (no external dependency needed — pure Deno)
- Uses existing `normalizeArabicText` logic server-side
- Returns matches with confidence scores:
  - ≥70% → auto-match
  - 50-70% → suggestion needing confirmation
  - <50% → not found
- Checks `standard_name_ar`, `standard_name_en`, `item_name_aliases`, and `keywords`

## Frontend Changes

### File 1: `src/hooks/usePriceLibrary.ts` (NEW)
React Query hooks for the price library:
- `usePriceLibrary()` — fetch all rate_library items with search/filter/category
- `useUpdatePriceItem()` — inline edit mutation + writes to `price_change_log`
- `useApprovePriceItem()` — mark as approved
- `useBudgetDistribution(projectId)` — fetch/create budget distribution
- `useUpdateBudgetDistribution()` — update percentages and amounts
- `useMatchPriceItem()` — calls the edge function with debounce

### File 2: `src/pages/RateLibraryPage.tsx` (REWRITE)
Replace mock data with real database queries:
- Table with inline editing (click cell → input → save)
- Search with 300ms debounce
- Category filter tabs from real data
- Status badges: ✅ Approved / ⏳ Pending
- **Export button**: generates Excel using SheetJS with columns: [Code | Name | Aliases | Category | Unit | Price | Currency | Approved]
- **Import button**: file upload → SheetJS parse → diff preview dialog → confirm → upsert
- Add/delete items

### File 3: `src/components/BudgetDistributionPanel.tsx` (NEW)
Panel shown in project pricing view:
- Total amount input field
- 4 editable percentage fields (materials/labor/equipment/other) with validation (must sum to 100%)
- "Distribute" button → calculates amounts → saves to DB
- Results table showing distributed amounts
- Manual override of individual amounts with auto-recalculate of total

### File 4: `src/components/PriceLibraryImportDialog.tsx` (NEW)
Dialog for Excel import:
- File drop zone
- SheetJS parsing
- Preview table showing: new items (green), updated items (yellow), unchanged (gray)
- Summary: "X new, Y updated, Z unchanged"
- Confirm button → batch upsert to `rate_library`

### File 5: `src/components/BoQTable.tsx` (UPDATE)
Add to the pricing table:
- Match status column: ✅ (library match) / 🟡 (suggestion) / 🔴 (not found)
- For unpriced items: manual input field + "Save to Library" button
- Progress bar showing % of priced vs unpriced items
- Integrate budget distribution panel above the table

### File 6: `src/pages/ProjectDetail.tsx` (UPDATE)
- Add "Budget" tab or integrate `BudgetDistributionPanel` into the pricing view
- Pass budget context to BoQTable

### File 7: `src/lib/pricing/priceMatchService.ts` (NEW)
Client-side matching service:
- Calls the `match-price-item` edge function
- Caches results per session
- Provides `matchItemToLibrary(description, unit)` → returns matches with confidence
- 300ms debounce wrapper for real-time search

## Integration Flow

```text
User enters total budget
  → BudgetDistributionPanel saves to project_budget_distribution
  → Amounts shown in pricing context

User opens BoQ for pricing
  → Each item checked against rate_library via edge function
  → ✅ Found → auto-fill price (approved rate used directly)
  → 🟡 Suggestion → show suggested price, user confirms
  → 🔴 Not found → empty price field with warning icon

User enters manual price for unpriced item
  → "Save to Library" button appears
  → On click → upsert to rate_library + write price_change_log
  → Item becomes ✅ for future use

Price library page
  → Full CRUD on rate_library
  → Excel export/import
  → Inline editing with change logging
```

## Technical Notes

- SheetJS (`xlsx` package) is already available or will be added as a dependency for Excel operations
- All mutations use React Query with `invalidateQueries` for automatic UI refresh
- The edge function uses the existing `SUPABASE_SERVICE_ROLE_KEY` secret (already configured)
- RLS policies ensure data isolation per user
- The existing `rateSyncService.ts` continues to handle the auto-sync on price approval — the new "Save to Library" button in BoQTable will call the same service


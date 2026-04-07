

# Comprehensive Pricing Fix: 3 Interconnected Problems

## Overview

Three problems to solve together: (1) approved rates bypassed by multipliers, (2) BoQ parser loses parent context causing wrong matches, (3) missing alias/description matching + re-pricing support.

## Execution Order

### Step 1: Database Migration

Add `item_description` column to `rate_library`:

```sql
ALTER TABLE rate_library ADD COLUMN IF NOT EXISTS item_description text DEFAULT '';
```

No other tables needed — `project_budget_distribution` and `price_change_log` already exist.

### Step 2: Fix `src/lib/pricingEngine.ts` — 4 changes

**2a. Extend `approvedRateIds` set** (after line 397):
Add library-level approval detection so items with `approved_at` or `source_type` in `['Approved','Field-Approved','Revised']` are included in the approved set — not just items with a `rate_sources` entry.

**2b. Extend `RateLibraryItem` interface** (line 44):
Add `approved_at`, `approved_by`, `item_name_aliases`, `item_code`, `item_description` fields.

**2c. Add alias + description matching in `findRateLibraryMatch()`** (after line 136):
For each candidate, check `item_name_aliases` array (weight: `aliasSim * 60`) and `item_description` field (weight: `descSim * 40`). Take the max across all text comparisons.

**2d. Extend approved-rate branch** (line 491):
After checking `sourceResolution.method === "approved"`, also check:
```
matchedItem.source_type in ['Approved','Field-Approved','Revised']
|| !!matchedItem.approved_at
```
If any is true, use `priceFromApprovedRate()` with `matchedItem.target_rate` directly.

### Step 3: Fix BoQ Parser — Parent Context Collection

**File: `src/lib/boqParser.ts`**

In `parseBoQExcel()`, after building the initial rows array (line 57), add a post-processing pass:

1. Also detect a `unitPrice` column (patterns: `"price"`, `"سعر"`, `"unit price"`, `"سعر الوحدة"`)
2. Walk rows in order. Track a `parentDescriptions: string[]` buffer
3. For each row:
   - If it has NO quantity AND NO unit price → it's a parent description row. Push its description to the buffer.
   - If it HAS quantity OR unit price → it's a pricing row. Store `parentDescriptions.join(" | ")` as a new field `parent_context` on the parsed row. Reset the buffer.
4. Update `ParsedBoQRow` interface to include `parent_context: string`.

**Update `uploadAndParseBoQ()`** (line 138-148):
When building DB insert objects, include `notes` field with parent context for later use by the pricing engine. The `description` field keeps the child text; parent context goes into `notes` as structured prefix like `[PARENT: ...]`.

**Update `groupSemanticRows()`** in `boqRowGrouping.ts`:
When building `mergedDescription`, also prepend any `[PARENT: ...]` text from `notes` field. This ensures the pricing engine sees the full parent+child description for matching.

### Step 4: Update Rate Library Sync

**File: `src/lib/pricing/rateSyncService.ts`**

When syncing a manually priced item to `rate_library`, also populate `item_description` from the item's parent context (extracted from notes field).

### Step 5: Add Re-Price Support

**File: `src/components/BoQTable.tsx`**

The existing "Start Pricing" button already calls `runPricingEngine()` which overwrites all prices. Add a separate "Re-Price" button (🔄 إعادة التسعير) that:

1. Shows a confirmation dialog: "This will re-price all items using current library rates. Manual overrides will be preserved."
2. Before re-pricing, snapshots current prices to `price_change_log` for audit
3. Calls `runPricingEngine()` (same function — it already overwrites)
4. After completion, shows summary: "X items updated, Y prices changed"

**Audit trail**: Add a pre-pricing snapshot function that reads all current `boq_items` with `unit_rate > 0`, then after re-pricing, compares old vs new rates and bulk-inserts differences into `price_change_log`.

### Step 6: Rate Library Page — Show `item_description`

**File: `src/pages/RateLibraryPage.tsx`**

Add an expandable row or tooltip showing `item_description` for each library item. When editing, allow editing `item_description`.

## Files Changed

| File | Change Type |
|---|---|
| Migration SQL | Add `item_description` column |
| `src/lib/pricingEngine.ts` | Approved detection, alias matching, description matching |
| `src/lib/boqParser.ts` | Parent context collection during parsing |
| `src/lib/boqRowGrouping.ts` | Include parent context in merged descriptions |
| `src/lib/pricing/rateSyncService.ts` | Sync `item_description` to library |
| `src/components/BoQTable.tsx` | Re-price button + audit snapshot |
| `src/pages/RateLibraryPage.tsx` | Show/edit `item_description` |

## Expected Outcome

| Scenario | Before | After |
|---|---|---|
| "تحت البلاطات" without parent context | Matches slab → 852 SAR | Parent "معالجة التربة ضد النمل" → matches termite → 31 SAR |
| Library item with `approved_at` set, no `rate_sources` entry | Gets multipliers → inflated | Direct rate, no multipliers |
| Same item, different alias wording | Falls to AI | Alias match → library rate |
| Re-pricing old BoQ | No button, must re-upload | One-click re-price with audit trail |


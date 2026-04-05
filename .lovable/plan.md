

# Warning-Only Classification — Implementation

## File 1: `src/lib/boqRowClassification.ts` — Full rewrite of classification logic

### 1a. Remove `"invalid"` from `BoQRowType` (line 1)
Change to: `export type BoQRowType = "priced" | "descriptive";`

### 1b. Add `warnings` to `BoQRowClassification` (lines 23-34)
Add `warnings?: string[]` field. Remove `"missing_unit"`, `"missing_item_code"`, `"broken_payable_structure"` from reason union — those become warnings instead.

### 1c. Add `BoQExportWarningRow` type and update `BoQExportSummary` (lines 36-53)
- Add `BoQExportWarningRow` interface (same shape as `BoQExportBlockingRow`)
- Add `warningRowsCount: number` and `warningRows: BoQExportWarningRow[]` to summary
- Change `exportStatus` type to `"ready" | "warning"` — remove `"blocked"`
- Keep `blockingRows` for backward compat (always empty array)
- Keep `invalidRowsCount` (always 0)

### 1d. Remove `isRealItemCode` function (lines 94-108)
No longer needed — qty > 0 is the only gate.

### 1e. Rewrite `classifyBoQRow` (lines 110-126)
```typescript
export function classifyBoQRow(row: BoQRowLike): BoQRowClassification {
  const quantity = parseQuantity(row.quantity);
  const hasUnit = hasText(row.unit);
  const hasDescription = hasText(row.description) || hasText(row.description_en);
  const hasRowContent = hasText(row.item_no) || hasUnit || hasDescription || quantity != null;

  if (!hasRowContent) return { type: "descriptive", reason: "empty_row" };
  if (quantity == null) return { type: "descriptive", reason: hasDescription ? "text_block" : "empty_quantity" };
  if (quantity <= 0) return { type: "descriptive", reason: "zero_quantity" };

  // quantity > 0 → ALWAYS priced. Collect warnings for missing fields.
  const warnings: string[] = [];
  if (!hasUnit) warnings.push("missing_unit");
  if (!hasText(row.item_no)) warnings.push("missing_item_code");
  if (!hasDescription) warnings.push("no_description");

  return { type: "priced", reason: "priceable_item", warnings: warnings.length > 0 ? warnings : undefined };
}
```

### 1f. Update `getRowPersistenceStatus` (lines 137-142)
- Priced with warnings → `"needs_review"`
- Priced without warnings → `"pending"`
- Descriptive → `"descriptive"`
- Remove `"invalid"` path

### 1g. Update `getRowClassificationNote` (lines 144-153)
For priced rows with warnings: bilingual note listing the warnings.
Remove the `"invalid"` branch entirely.

### 1h. Remove `getBlockingReason` and `toBlockingRow` functions (lines 159-180)
Replace with a `toWarningRow` helper and `getWarningReason` that returns warning text for rows missing pricing data.

### 1i. Rewrite `buildBoQExportSummary` (lines 182-236)
- All qty > 0 rows count as `pricedItemsCount`
- Rows missing pricing data → `warningRows` (informational only)
- `invalidRowsCount` always 0
- `blockingRows` always empty array
- `canExport = pricedItemsCount > 0`
- `exportStatus` is `"ready"` or `"warning"`, never `"blocked"`

## File 2: `src/lib/boqRowClassification.test.ts` — Update all tests

- **Test A & B**: Unchanged (already pass)
- **Test C** (line 37-51): missing unit → `canExport: true`, `exportStatus: "warning"`, `pricedItemsCount: 1`, `invalidRowsCount: 0`, `warningRowsCount: 1`
- **Test D** (line 53-70): mixed workbook → `canExport: true`, `pricedItemsCount: 2` (both qty>0 rows are priced), `invalidRowsCount: 0`
- **"price mapping failed" test** (line 72-88): → `canExport: true`, `pricedItemsCount: 2`, warning row for incomplete pricing
- **New test**: qty > 0 + no description → still priced and exportable with severe warning

## File 3: `src/components/BoQBlockingRowsDialog.tsx` — Warning tone

- Title → "Rows with Warnings" / "صفوف تحتاج مراجعة"
- Description → "These rows were priced but need review due to missing or incomplete data."
- Accept `BoQExportWarningRow[]` type (same shape)
- Keep layout, change border styling to amber/warning

## File 4: `src/components/BoQTable.tsx` — UI updates

- **Line 34**: Keep `blockingRowsOpen` state name (rename semantically harmless)
- **Lines 70-74**: Remove export blocking for warnings. Only block if `pricedItemsCount === 0`. Show warning toast if warnings exist.
- **Line 239**: Remove `disabled={!canExport}` — export always enabled when items exist
- **Line 251**: Change "Invalid payable rows" to "Rows with warnings"
- **Lines 253-255**: Remove `"blocked"` / destructive badge — only Ready/Warning
- **Lines 263-284**: Change "Blocking reasons" to "Warnings" section, use `warningRows`
- **Line 277-278**: "View Warnings" instead of "View Blocking Rows"
- **Line 325**: Remove `isInvalid` variable
- **Line 336**: Replace `Invalid` badge with amber "Needs Review" badge for rows with warnings
- **Lines 382-388**: Pass `warningRows` to dialog

## File 5: `src/lib/boqParser.ts` — Line 204-207

Change the export guard: remove the `canExport` check that throws. Replace with a warning-only check — if `pricedItemsCount === 0` throw, otherwise proceed.

## What stays the same
- Pricing engine (`isPriceableBoQRow` delegates to `classifyBoQRow` — will now correctly price all qty > 0 rows)
- Semantic row grouping (groups by qty > 0, unaffected)
- `getPricedAnalysisRows` (filters for complete pricing data — used for analysis, not export gating)
- Confidence rounding/clamping
- Rate library matching and AI fallback

## Validation guarantee
No code path exists where `quantity > 0` leads to anything other than `type: "priced"`. Every such row is counted in `pricedItemsCount` and is exportable. The `"invalid"` type is removed from the system entirely.


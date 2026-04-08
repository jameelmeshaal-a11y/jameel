

# Add Section Number Column with Dynamic Detection

## Summary

Add `section_no` column to `boq_items`, detect it dynamically during parsing from the uploaded file's header row, display it in the UI table, and include it in the Excel export as the first column (17 columns total).

## Database Migration

```sql
ALTER TABLE boq_items ADD COLUMN section_no text NOT NULL DEFAULT '';
```

## Changes

### 1. `src/lib/boqParser.ts` — Detect and populate section_no

**ParsedBoQRow interface**: Add `section_no: string` field.

**detectColumns function**: Add detection for a section/division column using keywords: `"division"`, `"section"`, `"قسم"`, `"رقم القسم"`, `"div"`. This is separate from the existing `itemNo` detection. Return type gains `sectionNo: number` (can be `-1` if not found in the file).

**parseBoQExcel function**: Read `section_no` from the detected column index. If no section column exists in the file, default to empty string `""`.

**uploadAndParseBoQ function** (line ~165): Include `section_no: row.section_no` in the insert object alongside existing fields.

### 2. `src/components/BoQTable.tsx` — Add column to UI table

Add "رقم القسم" as the first data column in the table header and rows, displaying `item.section_no`. Only show the column if at least one item has a non-empty `section_no` (to avoid an empty column when the uploaded file didn't have one).

### 3. `src/lib/boqExcelExport.ts` — Add column to Excel export

- Add `section_no` to `BoQExportItem` interface
- Update HEADERS: insert "رقم القسم" as first column (17 total)
- Update data row: `item.section_no` as first cell
- Shift all cell index references by +1 (currency formatting cols become 8-15, confidence becomes 16)
- Update column widths array: add 12 for section_no at index 0
- Update totals row: add empty first cell
- Only include the column if data has non-empty section numbers (same conditional as UI)

### 4. Handling dynamic column structure

The key design: the parser already uses keyword-based header detection (not fixed column indices). The new `sectionNo` detection follows the same pattern — scan headers for matching keywords. If the uploaded file has no section column, `section_no` stays as `""` and the column is hidden in both UI and export. This naturally handles varying BoQ layouts across projects.

## Files Changed

| File | Change |
|---|---|
| Migration SQL | Add `section_no` column to `boq_items` |
| `src/lib/boqParser.ts` | Add section column detection + populate `section_no` |
| `src/components/BoQTable.tsx` | Conditionally show "رقم القسم" column |
| `src/lib/boqExcelExport.ts` | Conditionally add "رقم القسم" as first column |


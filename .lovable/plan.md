

# Professional BoQ Excel Export

## Summary

Replace the current export logic with a fully styled, RTL Arabic Excel export that matches the UI table layout exactly. Since `xlsx` (SheetJS community edition) does not support cell styling, we need to switch to `exceljs` which provides full formatting control.

## Changes

### 1. Install `exceljs` package

Add `exceljs` as a dependency. It supports cell styles, RTL sheets, freeze panes, and conditional formatting — all required features that `xlsx` community edition cannot provide.

### 2. Create `src/lib/boqExcelExport.ts` — New dedicated export module

A new file containing the full styled export logic:

**Main sheet (BoQ data):**
- RTL sheet direction, frozen header row
- 16 columns in order: رقم البند, الوصف, المطابقة, الوحدة, الكمية, الفئة, سعر الوحدة, الإجمالي, مواد, عمالة, معدات, نقل, مخاطر, ربح, الثقة%, الحالة
- Header: Bold Calibri 12, white text on navy (#1e3a5f)
- Row coloring: white for matched (✅), #ffe6e6 for unmatched (🔴), #fff9e6 for needs_review (🟡)
- Confidence color coding: green ≥90%, orange 70-89%, red <70%
- Unmatched items: "غير موجود في المكتبة" in unit price and total cells
- Numbers with thousands separator, SAR prefix on price columns
- Auto-fit column widths (min 15 chars for description)
- Totals row at bottom: bold, light gray background, sums for numeric columns
- Sheet name: `[ProjectName] - [BoQFileName]`

**Summary sheet (ملخص التسعير):**
- Total priced items count
- Total unmatched items count (🔴)
- Total needs_review count (🟡)
- Grand total value (SAR)
- Breakdown by category (sum per category)

**File name:** `[ProjectName]_BoQ_[YYYY-MM-DD].xlsx`

**Key rules:**
- Export ALL items (approved + needs_review + unmatched) — user needs to see what requires manual entry
- No locked/protected cells

### 3. Update `src/components/BoQTable.tsx` — `handleExport`

- Remove the approved-only filter — export all items
- Call the new `exportStyledBoQ()` from `boqExcelExport.ts` instead of `exportBoQExcel()`
- Pass project name, BoQ file name, and all items
- Keep warning toasts for unmatched/needs_review counts

### 4. Update `src/lib/boqParser.ts` — Keep existing function

Keep `exportBoQExcel` for backward compatibility but the new export path will use the new module. No changes needed here.

## Files Changed

| File | Change |
|---|---|
| `package.json` | Add `exceljs` dependency |
| `src/lib/boqExcelExport.ts` | New file — full styled export with ExcelJS |
| `src/components/BoQTable.tsx` | Update `handleExport` to use new export, include all items |


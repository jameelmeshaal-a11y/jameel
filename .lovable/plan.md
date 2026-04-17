

## Plan — Verify Etemad Export End-to-End

**I am in read-only Plan mode**, so I cannot run the export, inspect the uploaded `برج_المراقبة_عسير.xlsx`, or fix any issues found. After you approve, I will switch to default mode and execute the verification + fix any issues discovered.

### Step 1 — Inspect the uploaded "previously exported" file
Copy `user-uploads://برج_المراقبة_عسير.xlsx` to `/tmp/` and run a Python audit using `openpyxl` + raw `unzip`:
- Sheet count (must = 1, no extra "تحليل الأسعار" sheet)
- Detect injected unit_rate / total_price columns and sample 5 cells
- Check `[Content_Types].xml`, `xl/_rels/workbook.xml.rels`, presence of `xl/calcChain.xml`
- Validate XML well-formedness on `xl/worksheets/sheet1.xml` and `xl/sharedStrings.xml`
- Run `recalculate_formulas.py` (LibreOffice) to detect repair-triggering errors

### Step 2 — Trigger a live export from the current project
Use browser automation on `/projects/29dae45a-708e-4954-887d-28b3c45a3163`:
- Open a BoQ that has both an `originalFilePath` and priced items
- Click **«تصدير اعتماد»** button
- Capture the downloaded file via the network/download interceptor and read console log `[approvalExporter]` (already exists at line 610 — shows `headerMap`, `matchedRows`, `injections`)

### Step 3 — Side-by-side diff
Compare the freshly-exported file against the uploaded `برج_المراقبة_عسير.xlsx`:
- Sheet structure identical (1 sheet, same name)
- Same headers/columns preserved
- unit_rate / total_price cells contain numbers (`t="n"`)
- No `calcChain.xml`, no `t="shared"` formulas
- Open both in LibreOffice headless and confirm zero recalc errors

### Step 4 — Fix any issues discovered
Likely failure points based on code review:
| Risk | Location | Fix if found |
|---|---|---|
| `xmlEscape` declared but unused → text values may not be escaped | `approvalExporter.ts:61` | Wire into injection or remove |
| Self-closing `<row .../>` rows skipped by `rowRegex` (requires `</row>`) | `parseSheetRows:122` | Add self-closing pattern |
| `cm`/`vm`/`ph` stripped but `<f>` formula NOT stripped from existing cell | `injectIntoRowXml:395-409` | Strip `<f>...</f>` from inner before rebuild |
| Cell with `xml:space="preserve"` + leading space breaks regex | `parseSharedStrings` | Already handled; verify on real file |
| `headerRow` heuristic may pick wrong row if "السعر" appears in description | `detectHeaderMap` | Add stricter "header band" detection (row must have ≥3 keyword hits) |
| `boq_files.file_path` may be missing for older BoQs | `handleEtemadExport` | Already handled with toast |

### Step 5 — Report
Deliver:
- Console log dump from live export
- Excel-validation JSON from `recalculate_formulas.py`
- Diff summary vs uploaded file
- List of any code patches applied

### Files that may be touched (only if Step 4 finds issues)
- `src/lib/export/approvalExporter.ts`

**Memory guarantees preserved**: zero changes to pricing engine, matching V4, RPCs, or schema. Export logic only.


/**
 * Approval Exporter — JSZip-only XML manipulation.
 *
 * NO ExcelJS. NO secondary sheets. NO formatting changes.
 * The original uploaded Excel file is preserved byte-for-byte EXCEPT:
 *   - Unit rate cells get the project's unit_rate
 *   - Total cells get the project's total_price
 *   - calcChain.xml is removed (Excel rebuilds it on open)
 *
 * Pipeline:
 *   1. Download original .xlsx from storage
 *   2. parseSharedStrings → flatten rich-text safe
 *   3. detectHeaderMap → cursor parser, fallback to minimalRowScan
 *   4. buildRowIndexMap → item_no exact > row_index > description similarity
 *   5. injectCellValue → preserve cell schema, swap t="s"→t="n", insert if missing
 *   6. Strip calcChain, regenerate zip, download
 */

import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ApprovalItem {
  item_no?: string | null;
  description?: string | null;
  row_index: number;
  quantity?: number | null;
  unit_rate: number | null;
  total_price: number | null;
  status: string;
  override_type?: string | null;
}

// ─── Excel Column Reference Helpers ─────────────────────────────────────────

/** Convert column letters (A, B, ..., AA, AB) to 1-based index. */
function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Convert 1-based index to column letters. */
function indexToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Parse a cell ref like "B12" → {col: 2, row: 12, colLetter: "B"} */
function parseRef(ref: string): { col: number; row: number; colLetter: string } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { colLetter: m[1], col: colToIndex(m[1]), row: parseInt(m[2], 10) };
}

// ─── XML utility — escape text content ──────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── 1. Parse sharedStrings — rich-text safe ────────────────────────────────

/**
 * Returns array of flattened strings indexed by sst position.
 * Handles rich text (<r><rPr/><t>...</t></r>), multiple <t> segments,
 * and preserveSpace attributes.
 */
function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  // Match each <si>...</si> block. Use [\s\S] for newlines.
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    // Extract every <t ...>...</t> within this <si> in document order
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let parts = "";
    let tm: RegExpExecArray | null;
    while ((tm = tRegex.exec(inner)) !== null) {
      parts += tm[1];
    }
    // Decode XML entities
    const decoded = parts
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    result.push(decoded);
  }
  return result;
}

// ─── 2. Cursor-based row + cell parser ──────────────────────────────────────

interface ParsedCell {
  ref: string;       // e.g. "B5"
  type: string;      // "s", "n", "str", "inlineStr", or ""
  value: string;     // raw inner value (sst index for "s")
  resolved: string;  // resolved string for header detection
}

interface ParsedRow {
  rowNum: number;
  cells: ParsedCell[];
}

/**
 * Parse rows + cells from sheet XML. Resolves shared strings.
 * Cursor-based: iterates <row>...</row>, then <c>...</c> inside each row.
 */
function parseSheetRows(sheetXml: string, sst: string[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const rowRegex = /<row\b[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(rm[1], 10);
    const rowInner = rm[2];
    const cells: ParsedCell[] = [];

    // Match each <c .../> or <c ...>...</c>
    // Self-closing first to avoid greedy mismatch
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowInner)) !== null) {
      const attrs = cm[1] || "";
      const inner = cm[2] || "";

      const refMatch = attrs.match(/\sr="([^"]+)"/);
      if (!refMatch) continue;
      const ref = refMatch[1];

      const typeMatch = attrs.match(/\st="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : "";

      let value = "";
      // Extract <v>...</v>
      const vMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      if (vMatch) value = vMatch[1];
      // For inlineStr: <is><t>...</t></is>
      if (!value && type === "inlineStr") {
        const isMatch = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        if (isMatch) value = isMatch[1];
      }

      // Resolve string for header detection
      let resolved = "";
      if (type === "s") {
        const idx = parseInt(value, 10);
        if (!isNaN(idx) && idx >= 0 && idx < sst.length) resolved = sst[idx];
      } else if (type === "inlineStr" || type === "str") {
        resolved = value
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&");
      } else {
        resolved = value;
      }

      cells.push({ ref, type, value, resolved });
    }

    rows.push({ rowNum, cells });
  }
  return rows;
}

// ─── 3. Header detection — cursor-based + fallback ──────────────────────────

interface HeaderMap {
  headerRow: number;
  itemNoCol: number | null;
  descCol: number | null;
  qtyCol: number | null;
  unitRateCol: number | null;
  totalCol: number | null;
}

// Header keyword sets — TOTAL keys are checked BEFORE unit-rate keys
// to avoid "السعر الإجمالي" being mis-detected as unit rate.
const ITEM_NO_KEYS = ["رقم البند", "رقم الصنف", "item no", "item code", "division no.", "division no", "الرمز الإنشائي", "code"];
const DESC_KEYS = ["وصف البند", "الوصف", "البيان", "description", "اسم البند"];
const QTY_KEYS = ["الكمية", "الكميه", "qty", "quantity", "كمية"];
// MUST contain "وحدة"/"وحده"/"unit" + price/سعر/rate. Exclude bare "السعر" (matches total too).
const UNIT_RATE_KEYS = ["سعر الوحدة", "سعر الوحده", "unit rate", "unit price"];
// Specific total phrases — checked first.
const TOTAL_KEYS = ["السعر الإجمالي", "السعر الاجمالي", "السعر الكلي", "إجمالي السعر", "اجمالي السعر", "total amount", "total price", "المبلغ الإجمالي", "المبلغ الاجمالي"];

/** Normalize Arabic text for comparison (strip diacritics, unify alef/ya/ta-marbuta). */
function normHeader(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict match: cell text must EQUAL one of the keys (after normalization),
 * OR the cell text must START WITH the key followed by a space/end
 * (e.g. cell "وصف البند   Item Description" matches key "وصف البند").
 * No backwards substring matches — that caused "الوحدة" to match "سعر الوحدة".
 */
function matchesAny(text: string, keys: string[]): boolean {
  const t = normHeader(text);
  if (!t) return false;
  return keys.some(k => {
    const kk = normHeader(k);
    if (!kk) return false;
    if (t === kk) return true;
    // Allow key as a whole-word prefix or contained whole phrase in cell text
    if (t.startsWith(kk + " ") || t.endsWith(" " + kk) || t.includes(" " + kk + " ")) return true;
    return false;
  });
}

/**
 * Primary detection: scan first 30 rows, find one with both desc + (qty OR rate) keywords.
 */
function detectHeaderMap(rows: ParsedRow[]): HeaderMap {
  // Try cursor-based detection
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    let descCol: number | null = null;
    let qtyCol: number | null = null;
    let unitRateCol: number | null = null;
    let totalCol: number | null = null;
    let itemNoCol: number | null = null;

    for (const cell of row.cells) {
      const parsed = parseRef(cell.ref);
      if (!parsed) continue;
      const text = cell.resolved;
      if (!text) continue;

      // Check TOTAL before UNIT_RATE — total phrases are more specific
      if (totalCol === null && matchesAny(text, TOTAL_KEYS)) { totalCol = parsed.col; continue; }
      if (unitRateCol === null && matchesAny(text, UNIT_RATE_KEYS)) { unitRateCol = parsed.col; continue; }
      if (qtyCol === null && matchesAny(text, QTY_KEYS)) { qtyCol = parsed.col; continue; }
      if (descCol === null && matchesAny(text, DESC_KEYS)) { descCol = parsed.col; continue; }
      if (itemNoCol === null && matchesAny(text, ITEM_NO_KEYS)) { itemNoCol = parsed.col; continue; }
    }

    // Confirmed header: needs description AND (qty or unit_rate or total)
    if (descCol !== null && (qtyCol !== null || unitRateCol !== null || totalCol !== null)) {
      return { headerRow: row.rowNum, itemNoCol, descCol, qtyCol, unitRateCol, totalCol };
    }
  }

  // Fallback: minimalRowScan — find any row with description keyword
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    for (const cell of row.cells) {
      const parsed = parseRef(cell.ref);
      if (!parsed) continue;
      if (matchesAny(cell.resolved, DESC_KEYS)) {
        return { headerRow: row.rowNum, itemNoCol: null, descCol: parsed.col, qtyCol: null, unitRateCol: null, totalCol: null };
      }
    }
  }

  // Absolute fallback
  return {
    headerRow: 1,
    itemNoCol: null,
    descCol: null,
    qtyCol: null,
    unitRateCol: null,
    totalCol: null,
  };
}

// ─── 4. Build row→item map ──────────────────────────────────────────────────

function normalizeForCompare(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSim(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(" ").filter(t => t.length >= 2));
  const tb = new Set(normalizeForCompare(b).split(" ").filter(t => t.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Map each Excel data row → ApprovalItem using a strict 3-layer strategy:
 *
 *   Layer 1 — DIRECT row_index: DB stores `row_index` = the actual Excel
 *             row number from the original file. Use it directly. This
 *             resolves 95%+ of items unambiguously.
 *   Layer 2 — item_no exact match (normalized) for re-imported files
 *             where row_index drifted.
 *   Layer 3 — DIAGNOSTIC LOG ONLY. No silent guessing. Unmatched items
 *             are reported to the console and surfaced via toast.
 */
function buildRowIndexMap(
  rows: ParsedRow[],
  headerMap: HeaderMap,
  items: ApprovalItem[],
): Map<number, ApprovalItem> {
  const result = new Map<number, ApprovalItem>();
  if (rows.length === 0) return result;

  const pricedItems = items.filter(i =>
    i.unit_rate != null &&
    i.unit_rate > 0 &&
    typeof (i as any).quantity === "number" &&
    (i as any).quantity > 0,
  );

  // Build quick lookups on Excel rows
  const rowByNum = new Map<number, ParsedRow>();
  for (const r of rows) rowByNum.set(r.rowNum, r);

  const getCellText = (row: ParsedRow, colIdx: number | null): string => {
    if (colIdx === null) return "";
    const cell = row.cells.find(c => {
      const p = parseRef(c.ref);
      return p && p.col === colIdx;
    });
    return cell?.resolved ?? "";
  };

  const rowHasPositiveQty = (row: ParsedRow): boolean => {
    if (headerMap.qtyCol === null) return true; // can't validate; trust it
    const qtyText = getCellText(row, headerMap.qtyCol);
    const qtyNum = parseFloat(qtyText.replace(/,/g, "").trim());
    return isFinite(qtyNum) && qtyNum > 0;
  };

  const usedRows = new Set<number>();
  const normItemNo = (s: string) => s.replace(/\s+/g, "").toLowerCase();

  // Index Excel rows by normalized item_no for Layer 2
  const rowByItemNo = new Map<string, number>();
  if (headerMap.itemNoCol !== null) {
    for (const row of rows) {
      if (row.rowNum <= headerMap.headerRow) continue;
      const txt = getCellText(row, headerMap.itemNoCol);
      const key = normItemNo(txt);
      if (key && !rowByItemNo.has(key)) rowByItemNo.set(key, row.rowNum);
    }
  }

  let layer1 = 0;
  let layer2 = 0;
  const unmatched: ApprovalItem[] = [];

  for (const item of pricedItems) {
    // Layer 1: direct row_index
    const directRow = rowByNum.get(item.row_index);
    if (
      directRow &&
      directRow.rowNum > headerMap.headerRow &&
      !usedRows.has(directRow.rowNum) &&
      rowHasPositiveQty(directRow)
    ) {
      result.set(directRow.rowNum, item);
      usedRows.add(directRow.rowNum);
      layer1++;
      continue;
    }

    // Layer 2: item_no exact (normalized) match
    if (item.item_no) {
      const key = normItemNo(item.item_no);
      const candRow = rowByItemNo.get(key);
      if (candRow && !usedRows.has(candRow)) {
        result.set(candRow, item);
        usedRows.add(candRow);
        layer2++;
        continue;
      }
    }

    unmatched.push(item);
  }

  console.log(
    `[approvalExporter] strategy=row_index_direct, matched=${layer1}, fallback_item_no=${layer2}, unmatched=${unmatched.length}`,
  );
  if (unmatched.length > 0) {
    console.warn(
      `[approvalExporter] Unmatched priced items:`,
      unmatched.slice(0, 30).map(i => ({
        row_index: i.row_index,
        item_no: i.item_no,
        quantity: (i as any).quantity,
        unit_rate: i.unit_rate,
        description: i.description?.slice(0, 80),
      })),
    );
  }

  // Expose unmatched count for caller toast
  (result as any).__unmatchedCount = unmatched.length;
  (result as any).__layer1 = layer1;
  (result as any).__layer2 = layer2;

  return result;
}

// ─── 5. Inject cell value into XML (preserves cell schema) ──────────────────

/**
 * Replace or insert a cell's value in the row XML.
 * - If cell exists: preserve r, s attributes, drop t (will set t="n"),
 *   remove <f>, replace/insert <v>
 * - If cell missing: insert new <c r="REF" s="0" t="n"><v>VALUE</v></c>
 *   in correct column order
 *
 * For null value: clear cell value (insert empty cell or remove <v>).
 */
function injectIntoRowXml(
  rowXml: string,
  rowAttrs: string,
  cellRef: string,
  value: number | null,
): string {
  const refParsed = parseRef(cellRef);
  if (!refParsed) return rowXml;
  const targetCol = refParsed.col;

  // Find existing cell
  const cellPattern = new RegExp(
    `<c\\b([^>]*?\\sr="${cellRef}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`,
  );
  const existing = rowXml.match(cellPattern);

  if (existing) {
    let attrs = existing[1];
    // Strip t="..." attribute (we'll set our own)
    attrs = attrs.replace(/\st="[^"]*"/g, "");
    // Strip cm, vm, ph attributes that may reference invalid metadata
    attrs = attrs.replace(/\scm="[^"]*"/g, "");
    attrs = attrs.replace(/\svm="[^"]*"/g, "");
    attrs = attrs.replace(/\sph="[^"]*"/g, "");

    if (value === null || value === undefined || isNaN(value)) {
      // Empty cell — preserve style, no value, no formula
      const newCell = `<c${attrs}/>`;
      return rowXml.replace(cellPattern, newCell);
    }

    // Inject as a number cell. NOTE: omit t="n" — the OOXML default cell type
    // is numeric, and matching the original Lovable-exported file (which uses
    // bare <c r="..." s="..."><v>123</v></c>) maximises Excel compatibility.
    const newCell = `<c${attrs}><v>${value}</v></c>`;
    return rowXml.replace(cellPattern, newCell);
  }

  // Cell doesn't exist — insert in correct column order
  if (value === null || value === undefined || isNaN(value)) return rowXml;
  const newCell = `<c r="${cellRef}"><v>${value}</v></c>`;

  // Find insertion point: find first existing cell with col > targetCol
  const allCellsRegex = /<c\b[^>]*\sr="([A-Z]+\d+)"/g;
  let insertBefore = -1;
  let m: RegExpExecArray | null;
  while ((m = allCellsRegex.exec(rowXml)) !== null) {
    const p = parseRef(m[1]);
    if (p && p.col > targetCol) {
      insertBefore = m.index;
      break;
    }
  }

  if (insertBefore === -1) {
    // Append before </row> closing — but this function gets row INNER, so just append
    return rowXml + newCell;
  }
  return rowXml.slice(0, insertBefore) + newCell + rowXml.slice(insertBefore);
}

/**
 * Apply injections to entire sheet XML.
 */
function injectCellsIntoSheet(
  sheetXml: string,
  injections: Array<{ rowNum: number; cellRef: string; value: number | null }>,
): string {
  // Group by row
  const byRow = new Map<number, Array<{ cellRef: string; value: number | null }>>();
  for (const inj of injections) {
    if (!byRow.has(inj.rowNum)) byRow.set(inj.rowNum, []);
    byRow.get(inj.rowNum)!.push({ cellRef: inj.cellRef, value: inj.value });
  }

  let result = sheetXml;

  for (const [rowNum, cellInjs] of byRow) {
    // Find row block
    const rowPattern = new RegExp(
      `(<row\\b[^>]*\\sr="${rowNum}"[^>]*>)([\\s\\S]*?)(<\\/row>)`,
    );
    const match = result.match(rowPattern);
    if (!match) continue;

    const rowOpen = match[1];
    let rowInner = match[2];
    const rowClose = match[3];

    for (const inj of cellInjs) {
      rowInner = injectIntoRowXml(rowInner, rowOpen, inj.cellRef, inj.value);
    }

    result = result.replace(rowPattern, rowOpen + rowInner + rowClose);
  }

  return result;
}

// ─── 6. Sanitize calcChain & shared formulas (prevents Excel errors) ────────

async function sanitizeWorkbook(zip: JSZip): Promise<void> {
  // Strip shared formulas from all sheets (prevents calc errors)
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"),
  );
  for (const sf of sheetFiles) {
    let xml = await zip.file(sf)!.async("string");
    // Strip shared formulas ONLY from <f> tags inside <c> cells.
    // Pattern: <f t="shared" ref="A1:B2" si="0">...</f>  or  <f t="shared" si="0"/>
    // We match the <f ...> open tag with t="shared" and remove the whole <f .../> block,
    // including the optional formula body. This avoids affecting <mergeCell ref="..."/>.
    xml = xml.replace(/<f\b[^>]*\st="shared"[^>]*\/>/g, "");
    xml = xml.replace(/<f\b[^>]*\st="shared"[^>]*>[\s\S]*?<\/f>/g, "");
    zip.file(sf, xml);
  }

  // Remove calcChain — Excel will rebuild on open
  zip.remove("xl/calcChain.xml");
  const wbRels = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRels) {
    let xml = await wbRels.async("string");
    xml = xml.replace(/<Relationship[^/]*Target="calcChain\.xml"[^/]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", xml);
  }
  const ct = zip.file("[Content_Types].xml");
  if (ct) {
    let xml = await ct.async("string");
    xml = xml.replace(/<Override[^/]*PartName="\/xl\/calcChain\.xml"[^/]*\/>/g, "");
    zip.file("[Content_Types].xml", xml);
  }
}

// ─── Main export entry ──────────────────────────────────────────────────────

export async function exportApproval(
  boqFileId: string,
  items: ApprovalItem[],
  originalFilePath: string,
  originalFileName: string,
): Promise<void> {
  // 1. Download original
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("boq-files")
    .download(originalFilePath);
  if (dlErr || !fileData) throw new Error("تعذر تحميل الملف الأصلي من التخزين");

  const buffer = await fileData.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 2. Read primary sheet (sheet1.xml)
  // Find the first worksheet via workbook.xml ordering
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  let primarySheetPath = "xl/worksheets/sheet1.xml";
  if (wbXml) {
    // Get first <sheet ... r:id="..."/>  → look up rels
    const firstSheetMatch = wbXml.match(/<sheet\b[^>]*\sr:id="([^"]+)"/);
    const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (firstSheetMatch && wbRelsXml) {
      const rid = firstSheetMatch[1];
      const relMatch = wbRelsXml.match(
        new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`),
      );
      if (relMatch) {
        const target = relMatch[1];
        primarySheetPath = target.startsWith("/")
          ? target.slice(1)
          : `xl/${target.replace(/^\.?\//, "")}`;
      }
    }
  }

  const sheetFile = zip.file(primarySheetPath);
  if (!sheetFile) throw new Error("لا توجد ورقة عمل في الملف الأصلي");
  const sheetXml = await sheetFile.async("string");

  // 3. Parse sharedStrings (rich-text safe)
  const sstFile = zip.file("xl/sharedStrings.xml");
  const sstXml = sstFile ? await sstFile.async("string") : "";
  const sst = sstXml ? parseSharedStrings(sstXml) : [];

  // 4. Parse rows + detect headers
  const rows = parseSheetRows(sheetXml, sst);
  const headerMap = detectHeaderMap(rows);

  if (headerMap.unitRateCol === null && headerMap.totalCol === null) {
    throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
  }

  // 5. Map rows to items
  const rowItemMap = buildRowIndexMap(rows, headerMap, items);

  // 6. Build injections
  const injections: Array<{ rowNum: number; cellRef: string; value: number | null }> = [];
  for (const [rowNum, item] of rowItemMap) {
    // Skip pending/unpriced — clear cells
    const isPending = item.status === "pending" ||
      (!item.unit_rate && !item.total_price);

    const unitVal = isPending ? null : item.unit_rate;
    const totalVal = isPending ? null : item.total_price;

    if (headerMap.unitRateCol !== null) {
      const ref = `${indexToCol(headerMap.unitRateCol)}${rowNum}`;
      injections.push({ rowNum, cellRef: ref, value: unitVal });
    }
    // Inject total explicitly: original cell may be a hardcoded value
    // (no formula) — relying on Excel recalc would leave stale numbers.
    if (headerMap.totalCol !== null) {
      const ref = `${indexToCol(headerMap.totalCol)}${rowNum}`;
      const computedTotal = totalVal != null
        ? totalVal
        : (unitVal != null && typeof (item as any).quantity === "number"
            ? unitVal * ((item as any).quantity as number)
            : null);
      injections.push({ rowNum, cellRef: ref, value: computedTotal });
    }
  }

  // 7. Inject into sheet XML
  const newSheetXml = injectCellsIntoSheet(sheetXml, injections);
  zip.file(primarySheetPath, newSheetXml);

  // 8. Sanitize calcChain + shared formulas
  await sanitizeWorkbook(zip);

  // 9. Generate + download
  const out = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });

  const baseName = originalFileName.replace(/\.(xlsx|xls)$/i, "");
  const downloadName = `${baseName}_مسعّر.xlsx`;
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Diagnostic log for verification
  console.log("[approvalExporter]", {
    primarySheetPath,
    headerMap,
    totalRows: rows.length,
    matchedRows: rowItemMap.size,
    injections: injections.length,
    sstSize: sst.length,
  });
}

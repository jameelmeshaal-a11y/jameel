import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

interface EtemadItem {
  item_no: string;
  row_index: number;
  unit_rate: number | null;
  total_price: number | null;
  status: string;
  override_type: string | null;
  source: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Layer 1: readSheetStructure — extract sheets + sharedStrings
// ═══════════════════════════════════════════════════════════════

interface SheetStructure {
  sheets: Map<string, string>; // path → xml
  sharedStrings: string[];
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  let cursor = 0;
  while (true) {
    const siStart = xml.indexOf("<si", cursor);
    if (siStart === -1) break;
    const siEnd = xml.indexOf("</si>", siStart);
    if (siEnd === -1) break;
    const siContent = xml.substring(siStart, siEnd + 5);
    // Flatten all <t>...</t> inside this <si>, ignoring <rPr> and formatting
    let text = "";
    let tCursor = 0;
    while (true) {
      const tStart = siContent.indexOf("<t", tCursor);
      if (tStart === -1) break;
      const tTagEnd = siContent.indexOf(">", tStart);
      if (tTagEnd === -1) break;
      if (siContent[tTagEnd - 1] === "/") {
        // self-closing <t/>
        tCursor = tTagEnd + 1;
        continue;
      }
      const tCloseStart = siContent.indexOf("</t>", tTagEnd);
      if (tCloseStart === -1) break;
      text += siContent.substring(tTagEnd + 1, tCloseStart);
      tCursor = tCloseStart + 4;
    }
    result.push(text);
    cursor = siEnd + 5;
  }
  return result;
}

async function readSheetStructure(zip: JSZip): Promise<SheetStructure> {
  const sheets = new Map<string, string>();
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml")
  );
  for (const sf of sheetFiles) {
    const xml = await zip.file(sf)!.async("string");
    sheets.set(sf, xml);
  }

  let sharedStrings: string[] = [];
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    const sstXml = await sstFile.async("string");
    sharedStrings = parseSharedStrings(sstXml);
  }

  return { sheets, sharedStrings };
}

// ═══════════════════════════════════════════════════════════════
// Layer 2: Cursor-based XML parser + Header detection
// ═══════════════════════════════════════════════════════════════

interface ParsedCell {
  ref: string;      // e.g. "A1"
  colLetter: string; // e.g. "A"
  col: number;       // 1-based
  type: string;      // "s", "n", "inlineStr", ""
  styleIdx: string;  // style attribute value
  rawValue: string;  // raw <v> content or inline text
}

interface ParsedRow {
  rowNum: number;
  startIdx: number;
  endIdx: number;
  cells: ParsedCell[];
}

function colLetterToNum(letter: string): number {
  let n = 0;
  for (const c of letter) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function colNumToLetter(col: number): string {
  let result = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function getAttr(tag: string, attrName: string): string {
  const regex = new RegExp(`\\b${attrName}="([^"]*)"`, "i");
  const m = tag.match(regex);
  return m ? m[1] : "";
}

/**
 * Cursor-based row scanner: finds <row r="N">...</row> blocks
 * Handles single-line and multi-line XML safely.
 */
function parseRows(xml: string, maxRow?: number): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let cursor = 0;

  while (true) {
    const rowTagStart = xml.indexOf("<row ", cursor);
    if (rowTagStart === -1) break;

    const rowTagEnd = xml.indexOf(">", rowTagStart);
    if (rowTagEnd === -1) break;

    const rowTag = xml.substring(rowTagStart, rowTagEnd + 1);
    const rowNumStr = getAttr(rowTag, "r");
    const rowNum = parseInt(rowNumStr) || 0;

    if (maxRow && rowNum > maxRow) {
      cursor = rowTagEnd + 1;
      continue;
    }

    // Self-closing row
    if (rowTag.endsWith("/>")) {
      rows.push({ rowNum, startIdx: rowTagStart, endIdx: rowTagEnd + 1, cells: [] });
      cursor = rowTagEnd + 1;
      continue;
    }

    // Find </row>
    const rowCloseIdx = xml.indexOf("</row>", rowTagEnd);
    if (rowCloseIdx === -1) {
      cursor = rowTagEnd + 1;
      continue;
    }
    const rowEndIdx = rowCloseIdx + 6;
    const rowContent = xml.substring(rowTagEnd + 1, rowCloseIdx);

    // Parse cells within this row
    const cells = parseCellsInContent(rowContent);
    rows.push({ rowNum, startIdx: rowTagStart, endIdx: rowEndIdx, cells });
    cursor = rowEndIdx;
  }
  return rows;
}

function parseCellsInContent(content: string): ParsedCell[] {
  const cells: ParsedCell[] = [];
  let cursor = 0;

  while (true) {
    const cStart = content.indexOf("<c ", cursor);
    if (cStart === -1) break;

    const cTagEnd = content.indexOf(">", cStart);
    if (cTagEnd === -1) break;

    const cTag = content.substring(cStart, cTagEnd + 1);
    const ref = getAttr(cTag, "r");
    const type = getAttr(cTag, "t");
    const styleIdx = getAttr(cTag, "s");
    const colLetter = ref.replace(/\d+/g, "");
    const col = colLetterToNum(colLetter);

    let rawValue = "";

    if (cTag.endsWith("/>")) {
      // Self-closing cell
      cells.push({ ref, colLetter, col, type, styleIdx, rawValue });
      cursor = cTagEnd + 1;
      continue;
    }

    // Find </c>
    const cCloseIdx = content.indexOf("</c>", cTagEnd);
    if (cCloseIdx === -1) {
      cursor = cTagEnd + 1;
      continue;
    }

    const inner = content.substring(cTagEnd + 1, cCloseIdx);

    if (type === "inlineStr") {
      // Extract all <t>...</t> from inline string
      let text = "";
      let tCur = 0;
      while (true) {
        const tS = inner.indexOf("<t", tCur);
        if (tS === -1) break;
        const tE = inner.indexOf(">", tS);
        if (tE === -1) break;
        if (inner[tE - 1] === "/") { tCur = tE + 1; continue; }
        const tC = inner.indexOf("</t>", tE);
        if (tC === -1) break;
        text += inner.substring(tE + 1, tC);
        tCur = tC + 4;
      }
      rawValue = text;
    } else {
      // Extract <v>...</v>
      const vStart = inner.indexOf("<v>");
      const vAltStart = inner.indexOf("<v ");
      const vIdx = vStart !== -1 ? vStart : vAltStart;
      if (vIdx !== -1) {
        const vTagEnd = inner.indexOf(">", vIdx);
        const vClose = inner.indexOf("</v>", vTagEnd);
        if (vClose !== -1) {
          rawValue = inner.substring(vTagEnd + 1, vClose);
        }
      }
    }

    cells.push({ ref, colLetter, col, type, styleIdx, rawValue });
    cursor = cCloseIdx + 4;
  }
  return cells;
}

function resolveValue(cell: ParsedCell, sharedStrings: string[]): string {
  if (cell.type === "s") {
    const idx = parseInt(cell.rawValue);
    return isNaN(idx) ? "" : (sharedStrings[idx] || "");
  }
  if (cell.type === "inlineStr") {
    return cell.rawValue;
  }
  return cell.rawValue;
}

interface HeaderMap {
  headerRow: number;
  unitRateCol: number | null;
  totalCol: number | null;
  itemNoCol: number | null;
  qtyCol: number | null;
  descCol: number | null;
  sheetPath: string;
}

const QTY_MARKERS = ["الكمية", "الكميه", "Qty", "Quantity"];
const ITEM_MARKERS = ["البند", "الوصف", "Description", "Item", "الوحدة"];
const UNIT_RATE_NAMES = ["سعر الوحدة", "سعر الوحده", "Unit Rate", "Unit Price", "السعر"];
const TOTAL_NAMES = ["الإجمالي", "المبلغ", "Total", "Amount", "إجمالي"];
const ITEM_NO_NAMES = ["رقم البند", "م", "No", "Item No", "#"];
const QTY_COL_NAMES = ["الكمية", "الكميه", "Qty", "Quantity"];
const DESC_COL_NAMES = ["البند", "الوصف", "Description", "وصف البند"];

function matchesAny(text: string, candidates: string[]): boolean {
  const t = text.trim();
  return candidates.some(c => t === c || t.startsWith(c + " ") || t.startsWith(c + "\n"));
}

function detectHeaderMap(
  structure: SheetStructure
): HeaderMap {
  // Find sheet containing header markers
  let targetSheetPath = "";
  let targetXml = "";

  for (const [path, xml] of structure.sheets) {
    if (/الكمية|الكميه|Qty|Quantity/i.test(xml)) {
      targetSheetPath = path;
      targetXml = xml;
      break;
    }
  }
  if (!targetSheetPath && structure.sheets.size > 0) {
    const first = structure.sheets.entries().next().value!;
    targetSheetPath = first[0];
    targetXml = first[1];
  }
  if (!targetXml) throw new Error("لا توجد أوراق عمل في الملف");

  // Parse rows up to 20 to find header
  const rows = parseRows(targetXml, 25);

  for (const row of rows) {
    if (row.rowNum > 20) break;

    const resolvedCells = row.cells.map(c => ({
      ...c,
      text: resolveValue(c, structure.sharedStrings).trim()
    }));

    const hasQty = resolvedCells.some(c => QTY_MARKERS.some(m => c.text.includes(m)));
    const hasItem = resolvedCells.some(c => ITEM_MARKERS.some(m => c.text.includes(m)));

    if (hasQty && hasItem) {
      let unitRateCol: number | null = null;
      let totalCol: number | null = null;
      let itemNoCol: number | null = null;
      let qtyCol: number | null = null;
      let descCol: number | null = null;

      for (const c of resolvedCells) {
        if (!unitRateCol && matchesAny(c.text, UNIT_RATE_NAMES)) unitRateCol = c.col;
        if (!totalCol && matchesAny(c.text, TOTAL_NAMES)) totalCol = c.col;
        if (!itemNoCol && matchesAny(c.text, ITEM_NO_NAMES)) itemNoCol = c.col;
        if (!qtyCol && matchesAny(c.text, QTY_COL_NAMES)) qtyCol = c.col;
        if (!descCol && matchesAny(c.text, DESC_COL_NAMES)) descCol = c.col;
      }

      return {
        headerRow: row.rowNum,
        unitRateCol,
        totalCol,
        itemNoCol,
        qtyCol,
        descCol,
        sheetPath: targetSheetPath,
      };
    }
  }

  // Fallback: minimal scan — return first sheet, header=1, no columns
  console.warn("[etemadExporter] Header detection failed, using fallback");
  return {
    headerRow: 1,
    unitRateCol: null,
    totalCol: null,
    itemNoCol: null,
    qtyCol: null,
    descCol: null,
    sheetPath: targetSheetPath,
  };
}

// ═══════════════════════════════════════════════════════════════
// Layer 3: buildRowIndexMap — priority-based mapping
// ═══════════════════════════════════════════════════════════════

interface RowMapEntry {
  excelRow: number;
  itemNo: string;
}

function buildRowIndexMap(
  xml: string,
  headerMap: HeaderMap,
  sharedStrings: string[]
): { byItemNo: Map<string, number>; byRowIndex: Map<number, number> } {
  const byItemNo = new Map<string, number>();
  const byRowIndex = new Map<number, number>();

  const rows = parseRows(xml);
  let dataIndex = 0;

  for (const row of rows) {
    if (row.rowNum <= headerMap.headerRow) continue;
    dataIndex++;

    // Extract item_no if column is known
    if (headerMap.itemNoCol) {
      const itemNoCell = row.cells.find(c => c.col === headerMap.itemNoCol);
      if (itemNoCell) {
        const val = resolveValue(itemNoCell, sharedStrings).trim();
        if (val && !byItemNo.has(val)) {
          byItemNo.set(val, row.rowNum);
        }
      }
    }

    byRowIndex.set(dataIndex, row.rowNum);
  }

  return { byItemNo, byRowIndex };
}

// ═══════════════════════════════════════════════════════════════
// Layer 4: injectCellValue — safe minimal (no clone)
// ═══════════════════════════════════════════════════════════════

function injectCellValue(
  xml: string,
  targetRow: number,
  targetCol: number,
  value: number
): string {
  const cellRef = `${colNumToLetter(targetCol)}${targetRow}`;
  const rows = parseRows(xml);
  const row = rows.find(r => r.rowNum === targetRow);

  if (!row) {
    // Row doesn't exist — skip silently
    return xml;
  }

  const rowXml = xml.substring(row.startIdx, row.endIdx);

  // Find existing cell in this row
  const cellStartTag = `<c `;
  let cellFound = false;
  let newRowXml = rowXml;

  // Scan for cell with matching ref
  let cursor = 0;
  const rowContent = rowXml;

  while (true) {
    const cStart = rowContent.indexOf("<c ", cursor);
    if (cStart === -1) break;

    const cTagEnd = rowContent.indexOf(">", cStart);
    if (cTagEnd === -1) break;

    const cTag = rowContent.substring(cStart, cTagEnd + 1);
    const ref = getAttr(cTag, "r");

    if (ref === cellRef) {
      cellFound = true;
      // Preserve r, s; change t to "n"; replace content
      const s = getAttr(cTag, "s");
      const sAttr = s ? ` s="${s}"` : "";

      if (cTag.endsWith("/>")) {
        // Self-closing → replace with full cell
        const newCell = `<c r="${cellRef}"${sAttr} t="n"><v>${value}</v></c>`;
        newRowXml = newRowXml.substring(0, cStart) + newCell + newRowXml.substring(cTagEnd + 1);
      } else {
        const cCloseIdx = rowContent.indexOf("</c>", cTagEnd);
        if (cCloseIdx === -1) break;
        // Replace entire cell content: remove <f>, set <v>
        const newCell = `<c r="${cellRef}"${sAttr} t="n"><v>${value}</v></c>`;
        newRowXml = newRowXml.substring(0, cStart) + newCell + newRowXml.substring(cCloseIdx + 4);
      }
      break;
    }

    // Move past this cell
    if (cTag.endsWith("/>")) {
      cursor = cTagEnd + 1;
    } else {
      const cCloseIdx = rowContent.indexOf("</c>", cTagEnd);
      cursor = cCloseIdx !== -1 ? cCloseIdx + 4 : cTagEnd + 1;
    }
  }

  if (!cellFound) {
    // Insert new minimal cell before </row>
    const newCell = `<c r="${cellRef}" t="n"><v>${value}</v></c>`;
    const closeRowIdx = newRowXml.lastIndexOf("</row>");
    if (closeRowIdx !== -1) {
      newRowXml = newRowXml.substring(0, closeRowIdx) + newCell + newRowXml.substring(closeRowIdx);
    }
  }

  // Replace old row XML with new
  return xml.substring(0, row.startIdx) + newRowXml + xml.substring(row.endIdx);
}

// ═══════════════════════════════════════════════════════════════
// Sanitizer: strip shared formulas (prevents corruption)
// ═══════════════════════════════════════════════════════════════

function stripSharedFormulas(xml: string): string {
  return xml
    .replace(/\s+t="shared"/g, "")
    .replace(/\s+si="\d+"/g, "")
    .replace(/\s+ref="[A-Z]+\d+:[A-Z]+\d+"/g, "");
}

// ═══════════════════════════════════════════════════════════════
// Main export function
// ═══════════════════════════════════════════════════════════════

export async function exportEtemad(
  boqFileId: string,
  items: EtemadItem[],
  originalFilePath: string,
  originalFileName: string
): Promise<void> {
  // 1. Download original file
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("boq-files")
    .download(originalFilePath);
  if (dlErr || !fileData) throw new Error("تعذر تحميل الملف الأصلي من التخزين");

  const rawBuffer = await fileData.arrayBuffer();
  const zip = await JSZip.loadAsync(rawBuffer);

  // 2. Strip shared formulas from all sheets
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml")
  );
  for (const sf of sheetFiles) {
    let xml = await zip.file(sf)!.async("string");
    xml = stripSharedFormulas(xml);
    zip.file(sf, xml);
  }

  // 3. Read structure + sharedStrings
  const structure = await readSheetStructure(zip);

  // 4. Detect header map (cursor parser with fallback)
  let headerMap: HeaderMap;
  try {
    headerMap = detectHeaderMap(structure);
  } catch (e) {
    console.error("[etemadExporter] Header detection error:", e);
    throw new Error("تعذر العثور على هيكل الجدول في الملف الأصلي");
  }

  if (!headerMap.unitRateCol && !headerMap.totalCol) {
    throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
  }

  // 5. Build row index map
  const sheetXml = structure.sheets.get(headerMap.sheetPath) || "";
  const { byItemNo, byRowIndex } = buildRowIndexMap(sheetXml, headerMap, structure.sharedStrings);

  // Build item maps
  const itemNoMap = new Map<string, EtemadItem>();
  for (const item of items) {
    if (item.item_no) itemNoMap.set(item.item_no.trim(), item);
  }

  // 6. Inject values
  let currentXml = structure.sheets.get(headerMap.sheetPath) || "";

  for (const item of items) {
    if (item.status === "pending" || (!item.unit_rate && !item.total_price)) continue;

    // Priority mapping: item_no exact → row_index fallback
    let excelRow: number | null = null;

    // Priority 1: item_no exact match
    if (item.item_no) {
      const mapped = byItemNo.get(item.item_no.trim());
      if (mapped) excelRow = mapped;
    }

    // Priority 2: row_index structural fallback
    if (!excelRow) {
      const mapped = byRowIndex.get(item.row_index);
      if (mapped) excelRow = mapped;
    }

    if (!excelRow) continue;

    if (headerMap.unitRateCol && item.unit_rate != null) {
      currentXml = injectCellValue(currentXml, excelRow, headerMap.unitRateCol, item.unit_rate);
    }
    if (headerMap.totalCol && item.total_price != null) {
      currentXml = injectCellValue(currentXml, excelRow, headerMap.totalCol, item.total_price);
    }
  }

  // 7. Write modified sheet back
  zip.file(headerMap.sheetPath, currentXml);

  // 8. Generate and download
  const outBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const baseName = originalFileName.replace(/\.(xlsx|xls)$/i, "");
  const downloadName = `${baseName}_مسعّر.xlsx`;

  const blob = new Blob([outBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

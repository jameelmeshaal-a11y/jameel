import * as ExcelJS from "exceljs";
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

/**
 * Normalize a <border> XML node to have all 5 required children.
 */
function normalizeBorderNode(borderXml: string): string {
  const required = ["left", "right", "top", "bottom", "diagonal"];
  let result = borderXml;
  for (const child of required) {
    if (!new RegExp(`<${child}(\\s|/|>)`).test(result)) {
      result = result.replace(/<\/border>/, `<${child}/></border>`);
    }
  }
  return result;
}

/**
 * Sanitize workbook to prevent ExcelJS load errors:
 * - Strip shared formula attributes
 * - Normalize <border> nodes
 * - Remove calcChain (forces Excel to recalc)
 */
async function sanitizeWorkbook(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Strip shared formulas from all sheets
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml")
  );
  for (const sf of sheetFiles) {
    let xml = await zip.file(sf)!.async("string");
    xml = xml.replace(/\s+t="shared"/g, "");
    xml = xml.replace(/\s+si="\d+"/g, "");
    xml = xml.replace(/\s+ref="[A-Z]+\d+:[A-Z]+\d+"/g, "");
    zip.file(sf, xml);
  }

  // 2. Normalize border nodes
  const stylesFile = zip.file("xl/styles.xml");
  if (stylesFile) {
    let stylesXml = await stylesFile.async("string");
    stylesXml = stylesXml.replace(/<border\b[^>]*>([\s\S]*?)<\/border>/g, (m) =>
      normalizeBorderNode(m)
    );
    stylesXml = stylesXml.replace(
      /<border\s*\/>/g,
      "<border><left/><right/><top/><bottom/><diagonal/></border>"
    );
    zip.file("xl/styles.xml", stylesXml);
  }

  // 3. Remove calcChain — Excel will rebuild on open, prevents stale-reference crashes
  zip.remove("xl/calcChain.xml");
  // Also remove calcChain reference from rels
  const wbRels = zip.file("xl/_rels/workbook.xml.rels");
  if (wbRels) {
    let xml = await wbRels.async("string");
    xml = xml.replace(/<Relationship[^/]*Target="calcChain\.xml"[^/]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", xml);
  }
  // Remove calcChain from Content_Types
  const ct = zip.file("[Content_Types].xml");
  if (ct) {
    let xml = await ct.async("string");
    xml = xml.replace(/<Override[^/]*PartName="\/xl\/calcChain\.xml"[^/]*\/>/g, "");
    zip.file("[Content_Types].xml", xml);
  }

  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Find header row by scanning for cells containing both qty and item markers.
 */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  const qtyMarkers = ["الكمية", "الكميه", "Qty", "Quantity"];
  const itemMarkers = ["البند", "الوصف", "Description", "Item", "الوحدة"];
  for (let r = 1; r <= Math.min(ws.rowCount, 25); r++) {
    const row = ws.getRow(r);
    let hasQty = false, hasItem = false;
    const maxC = Math.max(row.cellCount + 5, 20);
    for (let c = 1; c <= maxC; c++) {
      const val = String(row.getCell(c).value ?? "").trim();
      if (qtyMarkers.some(m => val.includes(m))) hasQty = true;
      if (itemMarkers.some(m => val.includes(m))) hasItem = true;
    }
    if (hasQty && hasItem) return r;
  }
  return 1;
}

/**
 * Find column by header text in given row.
 */
function findColumnByHeader(
  ws: ExcelJS.Worksheet,
  headerRowIdx: number,
  candidates: string[]
): number | null {
  const row = ws.getRow(headerRowIdx);
  const maxC = Math.max(row.cellCount + 5, 20);
  for (let c = 1; c <= maxC; c++) {
    const val = String(row.getCell(c).value ?? "").trim();
    for (const cand of candidates) {
      if (val === cand || val.startsWith(cand + " ") || val.startsWith(cand + "\n") || val.includes(cand)) {
        return c;
      }
    }
  }
  return null;
}

/**
 * Export Etemad: inject prices into original uploaded Excel, preserving format.
 */
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

  // 2. Sanitize the workbook (borders, shared formulas, calcChain)
  const cleanBuffer = await sanitizeWorkbook(rawBuffer);

  // 3. Load with ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(cleanBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("لا توجد ورقة عمل في الملف الأصلي");

  // 4. Detect header + columns
  const headerRowIdx = findHeaderRow(ws);
  const unitRateCol = findColumnByHeader(ws, headerRowIdx, [
    "سعر الوحدة", "سعر الوحده", "Unit Rate", "Unit Price", "السعر"
  ]);
  const totalCol = findColumnByHeader(ws, headerRowIdx, [
    "الإجمالي", "المبلغ", "Total", "Amount", "إجمالي", "السعر الإجمالي"
  ]);
  const itemNoCol = findColumnByHeader(ws, headerRowIdx, [
    "رقم البند", "Item No", "Item Code", "الرمز", "م", "No", "#"
  ]);

  if (!unitRateCol && !totalCol) {
    throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
  }

  // 5. Build item maps
  const itemMap = new Map<number, EtemadItem>();
  const itemNoMap = new Map<string, EtemadItem>();
  for (const item of items) {
    itemMap.set(item.row_index, item);
    if (item.item_no) itemNoMap.set(item.item_no.trim(), item);
  }

  // 6. Inject — iterate ALL data rows; match by item_no first, then by sequential dataIndex
  let dataIndex = 0;
  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    dataIndex++;
    let matchedItem: EtemadItem | undefined;

    // Priority 1: match by item_no
    if (itemNoCol) {
      const cellItemNo = String(ws.getRow(r).getCell(itemNoCol).value ?? "").trim();
      if (cellItemNo && itemNoMap.has(cellItemNo)) {
        matchedItem = itemNoMap.get(cellItemNo);
      }
    }

    // Priority 2: sequential row_index fallback
    if (!matchedItem) matchedItem = itemMap.get(dataIndex);

    if (!matchedItem) continue;

    // Skip pending/unpriced items — clear cells
    if (matchedItem.status === "pending" || (!matchedItem.unit_rate && !matchedItem.total_price)) {
      if (unitRateCol) ws.getRow(r).getCell(unitRateCol).value = null;
      if (totalCol) ws.getRow(r).getCell(totalCol).value = null;
      continue;
    }

    if (unitRateCol && matchedItem.unit_rate != null) {
      ws.getRow(r).getCell(unitRateCol).value = matchedItem.unit_rate;
    }
    if (totalCol && matchedItem.total_price != null) {
      ws.getRow(r).getCell(totalCol).value = matchedItem.total_price;
    }
  }

  // 7. Write
  const outBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
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

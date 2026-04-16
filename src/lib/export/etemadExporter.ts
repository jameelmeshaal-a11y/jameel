import ExcelJS from "exceljs";
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
 * Find a column by header text — stops at first match.
 */
function findColumnByHeader(
  ws: ExcelJS.Worksheet,
  headerRowIdx: number,
  candidates: string[]
): number | null {
  const row = ws.getRow(headerRowIdx);
  for (let c = 1; c <= row.cellCount + 5; c++) {
    const val = String(row.getCell(c).value ?? "").trim();
    for (const cand of candidates) {
      if (val === cand || val.startsWith(cand + " ") || val.startsWith(cand + "\n")) {
        return c; // return found — stop at first match
      }
    }
  }
  return null;
}

/**
 * Find header row index dynamically by searching for rows containing both quantity and item markers.
 */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  const qtyMarkers = ["الكمية", "الكميه", "Qty", "Quantity"];
  const itemMarkers = ["البند", "الوصف", "Description", "Item"];
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    let hasQty = false, hasItem = false;
    for (let c = 1; c <= row.cellCount + 5; c++) {
      const val = String(row.getCell(c).value ?? "").trim();
      if (qtyMarkers.some(m => val.includes(m))) hasQty = true;
      if (itemMarkers.some(m => val.includes(m))) hasItem = true;
    }
    if (hasQty && hasItem) return r;
  }
  return 1; // fallback
}

/**
 * Strip shared formula attributes from Excel XML to prevent crashes.
 */
async function sanitizeSharedFormulas(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));

  for (const sf of sheetFiles) {
    let xml = await zip.file(sf)!.async("string");
    // Strip shared formula attributes: t="shared" si="..." ref="..."
    xml = xml.replace(/\s+t="shared"/g, "");
    xml = xml.replace(/\s+si="\d+"/g, "");
    xml = xml.replace(/\s+ref="[A-Z]+\d+:[A-Z]+\d+"/g, "");
    zip.file(sf, xml);
  }

  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Export Etemad-ready Excel: inject prices into original uploaded file.
 */
export async function exportEtemad(
  boqFileId: string,
  items: EtemadItem[],
  originalFilePath: string,
  originalFileName: string
): Promise<void> {
  // 1. Download original file from storage
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("boq-files")
    .download(originalFilePath);
  if (dlErr || !fileData) throw new Error("تعذر تحميل الملف الأصلي من التخزين");

  // 2. Sanitize shared formulas
  const rawBuffer = await fileData.arrayBuffer();
  const cleanBuffer = await sanitizeSharedFormulas(rawBuffer);

  // 3. Load workbook
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(cleanBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("لا توجد ورقة عمل في الملف الأصلي");

  // 4. Find header row
  const headerRowIdx = findHeaderRow(ws);

  // 5. Find columns
  const unitRateCol = findColumnByHeader(ws, headerRowIdx, ["سعر الوحدة", "سعر الوحده", "Unit Rate", "Unit Price", "السعر"]);
  const totalCol = findColumnByHeader(ws, headerRowIdx, ["الإجمالي", "المبلغ", "Total", "Amount", "إجمالي"]);
  const itemNoCol = findColumnByHeader(ws, headerRowIdx, ["رقم البند", "م", "No", "Item No", "#"]);

  if (!unitRateCol && !totalCol) {
    throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
  }

  // 6. Build row_index → item mapping
  const itemMap = new Map<number, EtemadItem>();
  const itemNoMap = new Map<string, EtemadItem>();
  for (const item of items) {
    itemMap.set(item.row_index, item);
    if (item.item_no) itemNoMap.set(item.item_no.trim(), item);
  }

  // 7. Inject prices into rows after header
  let injectedCount = 0;
  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const dataRowIdx = r - headerRowIdx; // 1-based data row index
    
    // Try to match by item_no first (sanity check), then by row_index
    let matchedItem: EtemadItem | undefined;
    
    if (itemNoCol) {
      const cellItemNo = String(ws.getRow(r).getCell(itemNoCol).value ?? "").trim();
      if (cellItemNo && itemNoMap.has(cellItemNo)) {
        matchedItem = itemNoMap.get(cellItemNo);
      }
    }
    
    if (!matchedItem) {
      matchedItem = itemMap.get(dataRowIdx);
    }

    if (!matchedItem) continue;

    // Pending items → leave cell empty
    if (matchedItem.status === "pending" || (!matchedItem.unit_rate && !matchedItem.total_price)) {
      if (unitRateCol) ws.getRow(r).getCell(unitRateCol).value = null;
      if (totalCol) ws.getRow(r).getCell(totalCol).value = null;
      continue;
    }

    // Inject prices
    if (unitRateCol && matchedItem.unit_rate != null) {
      ws.getRow(r).getCell(unitRateCol).value = matchedItem.unit_rate;
    }
    if (totalCol && matchedItem.total_price != null) {
      ws.getRow(r).getCell(totalCol).value = matchedItem.total_price;
    }
    injectedCount++;
  }

  // 8. Generate and download
  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  // Build filename: originalName_مسعّر.xlsx
  const baseName = originalFileName.replace(/\.(xlsx|xls)$/i, "");
  const downloadName = `${baseName}_مسعّر.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return;
}

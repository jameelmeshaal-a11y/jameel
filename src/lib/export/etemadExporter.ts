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
        return c;
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
  return 1;
}

/**
 * Normalize a single <border> XML node so it has all six expected child elements
 * (left, right, top, bottom, diagonal, vertical/horizontal optional).
 * ExcelJS crashes with "Cannot read properties of undefined (reading 'top')"
 * when borders are missing child elements.
 */
function normalizeBorderNode(borderXml: string): string {
  const requiredChildren = ["left", "right", "top", "bottom", "diagonal"];
  let result = borderXml;
  for (const child of requiredChildren) {
    // Check if child exists (either self-closing or with content)
    const hasChild = new RegExp(`<${child}(\\s|/|>)`).test(result);
    if (!hasChild) {
      // Insert empty self-closing tag before </border>
      result = result.replace(/<\/border>/, `<${child}/></border>`);
    }
  }
  return result;
}

/**
 * Sanitize the workbook XML to prevent ExcelJS crashes:
 * 1. Strip shared formula attributes from sheet XMLs.
 * 2. Normalize <border> nodes in styles.xml so every border has all child elements.
 */
async function sanitizeWorkbook(buffer: ArrayBuffer): Promise<{ cleanBuffer: ArrayBuffer; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Strip shared formula attributes from all worksheets
  const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));
  for (const sf of sheetFiles) {
    let xml = await zip.file(sf)!.async("string");
    xml = xml.replace(/\s+t="shared"/g, "");
    xml = xml.replace(/\s+si="\d+"/g, "");
    xml = xml.replace(/\s+ref="[A-Z]+\d+:[A-Z]+\d+"/g, "");
    zip.file(sf, xml);
  }

  // 2. Normalize <border> nodes in styles.xml
  const stylesFile = zip.file("xl/styles.xml");
  if (stylesFile) {
    let stylesXml = await stylesFile.async("string");
    // Match all <border ...>...</border> nodes (including self-closing)
    stylesXml = stylesXml.replace(/<border\b[^>]*>([\s\S]*?)<\/border>/g, (match) => {
      return normalizeBorderNode(match);
    });
    // Replace self-closing <border/> with full empty border
    stylesXml = stylesXml.replace(/<border\s*\/>/g, "<border><left/><right/><top/><bottom/><diagonal/></border>");
    zip.file("xl/styles.xml", stylesXml);
  }

  const cleanBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return { cleanBuffer, zip };
}

/**
 * Convert column number (1-based) to Excel column letter (A, B, ..., Z, AA, AB, ...).
 */
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

/**
 * Fallback path: use JSZip directly to inject cell values into sheet1.xml without ExcelJS.
 * This is used when ExcelJS fails to load/save the workbook due to style corruption.
 */
async function fallbackInjectViaJSZip(
  zip: JSZip,
  injections: Array<{ row: number; col: number; value: number }>,
  sheetPath: string = "xl/worksheets/sheet1.xml"
): Promise<ArrayBuffer> {
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("لا توجد ورقة عمل في الملف الأصلي");

  let xml = await sheetFile.async("string");

  for (const inj of injections) {
    const cellRef = `${colNumToLetter(inj.col)}${inj.row}`;
    const newCellXml = `<c r="${cellRef}" t="n"><v>${inj.value}</v></c>`;

    // Try to find existing cell and replace it
    const cellRegex = new RegExp(`<c\\s+r="${cellRef}"(?:\\s+[^>]*)?(?:/>|>[\\s\\S]*?</c>)`, "g");
    if (cellRegex.test(xml)) {
      xml = xml.replace(cellRegex, newCellXml);
    } else {
      // Cell doesn't exist; inject into the row
      const rowRegex = new RegExp(`(<row\\s+r="${inj.row}"[^>]*>)([\\s\\S]*?)(</row>)`);
      const rowMatch = xml.match(rowRegex);
      if (rowMatch) {
        xml = xml.replace(rowRegex, `$1$2${newCellXml}$3`);
      }
      // If row also doesn't exist, skip silently
    }
  }

  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Discover header row + key columns by parsing sheet1.xml and sharedStrings.xml directly.
 * Used by the fallback path when ExcelJS cannot load the workbook.
 */
async function discoverColumnsViaJSZip(zip: JSZip): Promise<{
  headerRow: number;
  unitRateCol: number | null;
  totalCol: number | null;
  itemNoCol: number | null;
  sheetPath: string;
}> {
  // Find the first sheet that contains header markers
  const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith("xl/worksheets/sheet") && f.endsWith(".xml"));
  let sheetXml = "";
  let sheetPath = "xl/worksheets/sheet1.xml";
  for (const sf of sheetFiles) {
    const xml = await zip.file(sf)!.async("string");
    if (/الكمية|الكميه|Qty|Quantity/i.test(xml)) {
      sheetXml = xml;
      sheetPath = sf;
      break;
    }
  }
  if (!sheetXml && sheetFiles.length > 0) {
    sheetPath = sheetFiles[0];
    sheetXml = await zip.file(sheetPath)!.async("string");
  }
  if (!sheetXml) throw new Error("لا توجد أوراق عمل في الملف");

  let sharedStrings: string[] = [];
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    const sstXml = await sstFile.async("string");
    const matches = sstXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    sharedStrings = matches.map(si => {
      const tParts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      return tParts.map(t => t.replace(/<t[^>]*>/, "").replace(/<\/t>/, "")).join("");
    });
  }

  const qtyMarkers = ["الكمية", "الكميه", "Qty", "Quantity"];
  const itemMarkers = ["البند", "الوصف", "Description", "Item", "الوحدة"];
  const unitRateNames = ["سعر الوحدة", "سعر الوحده", "Unit Rate", "Unit Price", "السعر"];
  const totalNames = ["الإجمالي", "المبلغ", "Total", "Amount", "إجمالي"];
  const itemNoNames = ["رقم البند", "م", "No", "Item No", "#"];

  const colLetterToNum = (letter: string): number => {
    let n = 0;
    for (const c of letter) n = n * 26 + (c.charCodeAt(0) - 64);
    return n;
  };

  // Parse rows 1..20 to find header row
  const rowRegex = /<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let headerRow = 1;
  let unitRateCol: number | null = null;
  let totalCol: number | null = null;
  let itemNoCol: number | null = null;

  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(m[1]);
    if (rowNum > 20 && headerRow === 1) continue;
    const rowContent = m[2];
    const cellRegex = /<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\bt="([^"]+)")?[^>]*(?:\/>|>([\s\S]*?)<\/c>)/g;
    const cellTexts: Array<{ col: number; text: string }> = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const col = colLetterToNum(cm[1]);
      const cellType = cm[2] || "";
      const inner = cm[3];
      let text = "";
      if (cellType === "s") {
        const vMatch = inner.match(/<v>(\d+)<\/v>/);
        if (vMatch) text = sharedStrings[parseInt(vMatch[1])] || "";
      } else if (cellType === "inlineStr") {
        const tMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (tMatch) text = tMatch[1];
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) text = vMatch[1];
      }
      cellTexts.push({ col, text: text.trim() });
    }

    const hasQty = cellTexts.some(ct => qtyMarkers.some(mm => ct.text.includes(mm)));
    const hasItem = cellTexts.some(ct => itemMarkers.some(mm => ct.text.includes(mm)));

    if (hasQty && hasItem && headerRow === 1) {
      headerRow = rowNum;
      for (const ct of cellTexts) {
        if (!unitRateCol && unitRateNames.some(n => ct.text === n || ct.text.startsWith(n + " ") || ct.text.startsWith(n + "\n"))) {
          unitRateCol = ct.col;
        }
        if (!totalCol && totalNames.some(n => ct.text === n || ct.text.startsWith(n + " ") || ct.text.startsWith(n + "\n"))) {
          totalCol = ct.col;
        }
        if (!itemNoCol && itemNoNames.some(n => ct.text === n || ct.text.startsWith(n + " ") || ct.text.startsWith(n + "\n"))) {
          itemNoCol = ct.col;
        }
      }
      break;
    }
  }

  return { headerRow, unitRateCol, totalCol, itemNoCol, sheetPath };
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

  // 2. Sanitize: strip shared formulas + normalize border nodes
  const rawBuffer = await fileData.arrayBuffer();
  const { cleanBuffer, zip } = await sanitizeWorkbook(rawBuffer);

  // Build itemNo + row_index maps
  const itemMap = new Map<number, EtemadItem>();
  const itemNoMap = new Map<string, EtemadItem>();
  for (const item of items) {
    itemMap.set(item.row_index, item);
    if (item.item_no) itemNoMap.set(item.item_no.trim(), item);
  }

  const baseName = originalFileName.replace(/\.(xlsx|xls)$/i, "");
  const downloadName = `${baseName}_مسعّر.xlsx`;

  // 3. Try ExcelJS path first
  let outBuffer: ArrayBuffer;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(cleanBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("لا توجد ورقة عمل في الملف الأصلي");

    const headerRowIdx = findHeaderRow(ws);
    const unitRateCol = findColumnByHeader(ws, headerRowIdx, ["سعر الوحدة", "سعر الوحده", "Unit Rate", "Unit Price", "السعر"]);
    const totalCol = findColumnByHeader(ws, headerRowIdx, ["الإجمالي", "المبلغ", "Total", "Amount", "إجمالي"]);
    const itemNoCol = findColumnByHeader(ws, headerRowIdx, ["رقم البند", "م", "No", "Item No", "#"]);

    if (!unitRateCol && !totalCol) {
      throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
    }

    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const dataRowIdx = r - headerRowIdx;
      let matchedItem: EtemadItem | undefined;

      if (itemNoCol) {
        const cellItemNo = String(ws.getRow(r).getCell(itemNoCol).value ?? "").trim();
        if (cellItemNo && itemNoMap.has(cellItemNo)) {
          matchedItem = itemNoMap.get(cellItemNo);
        }
      }
      if (!matchedItem) matchedItem = itemMap.get(dataRowIdx);
      if (!matchedItem) continue;

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

    outBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer;
  } catch (excelJsErr) {
    // 4. Fallback path: use JSZip directly to inject values into sheet1.xml
    console.warn("[etemadExporter] ExcelJS failed, using JSZip fallback:", excelJsErr);

    const { headerRow, unitRateCol, totalCol, itemNoCol, sheetPath } = await discoverColumnsViaJSZip(zip);

    if (!unitRateCol && !totalCol) {
      throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي (fallback)");
    }

    // Build injections by row_index (item_no matching not feasible without re-parsing every row)
    const injections: Array<{ row: number; col: number; value: number }> = [];
    for (const item of items) {
      if (item.status === "pending") continue;
      const excelRow = headerRow + item.row_index;
      if (unitRateCol && item.unit_rate != null) {
        injections.push({ row: excelRow, col: unitRateCol, value: item.unit_rate });
      }
      if (totalCol && item.total_price != null) {
        injections.push({ row: excelRow, col: totalCol, value: item.total_price });
      }
    }

    outBuffer = await fallbackInjectViaJSZip(zip, injections, sheetPath);
  }

  // 5. Download
  const blob = new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

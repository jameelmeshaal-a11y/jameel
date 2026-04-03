import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedBoQRow {
  item_no: string;
  description: string;
  description_en: string;
  unit: string;
  quantity: number;
  row_index: number;
}

/**
 * Parse an Excel BoQ file and detect columns for:
 *  - item number, description (Arabic), unit, quantity
 * Returns parsed rows without modifying the original structure.
 */
export function parseBoQExcel(buffer: ArrayBuffer): ParsedBoQRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (raw.length < 2) return [];

  // Detect header row and columns
  const headerIdx = findHeaderRow(raw);
  const headers = raw[headerIdx].map((h: any) => String(h).trim().toLowerCase());

  const colMap = detectColumns(headers);

  const rows: ParsedBoQRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    const desc = String(row[colMap.description] ?? "").trim();
    const qty = parseFloat(String(row[colMap.quantity] ?? "0")) || 0;

    if (!desc && qty === 0) continue; // skip empty rows

    rows.push({
      item_no: String(row[colMap.itemNo] ?? "").trim() || String(rows.length + 1),
      description: desc,
      description_en: "",
      unit: String(row[colMap.unit] ?? "").trim(),
      quantity: qty,
      row_index: i,
    });
  }

  return rows;
}

function findHeaderRow(data: any[][]): number {
  const keywords = ["item", "بند", "description", "وصف", "unit", "وحدة", "qty", "quantity", "كمية", "no", "رقم"];
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const rowStr = data[i].map((c: any) => String(c).toLowerCase()).join(" ");
    const matches = keywords.filter(k => rowStr.includes(k));
    if (matches.length >= 2) return i;
  }
  return 0;
}

function detectColumns(headers: string[]): { itemNo: number; description: number; unit: number; quantity: number } {
  const find = (patterns: string[]): number => {
    for (const p of patterns) {
      const idx = headers.findIndex(h => h.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  let itemNo = find(["item", "no", "رقم", "م", "#"]);
  let description = find(["description", "وصف", "بند", "desc", "بيان"]);
  let unit = find(["unit", "وحدة"]);
  let quantity = find(["qty", "quantity", "كمية", "الكمية"]);

  // Fallback: assume columns 0-3
  if (itemNo < 0) itemNo = 0;
  if (description < 0) description = 1;
  if (unit < 0) unit = 2;
  if (quantity < 0) quantity = 3;

  return { itemNo, description, unit, quantity };
}

/**
 * Upload a BoQ Excel file, parse it, and store items in the database.
 */
export async function uploadAndParseBoQ(
  projectId: string,
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ boqFileId: string; rowCount: number }> {
  onProgress?.("Uploading file...");

  const fileExt = file.name.split(".").pop()?.trim() || "xlsx";
  const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
  const filePath = `${projectId}/${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("boq-files")
    .upload(filePath, file);
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  onProgress?.("Creating BoQ record...");
  const { data: boqFile, error: dbError } = await supabase
    .from("boq_files")
    .insert({
      project_id: projectId,
      name: file.name,
      file_path: filePath,
      status: "uploaded",
    })
    .select()
    .single();
  if (dbError) throw new Error(`Database error: ${dbError.message}`);

  onProgress?.("Parsing Excel structure...");
  const buffer = await file.arrayBuffer();
  const parsed = parseBoQExcel(buffer);

  if (parsed.length === 0) {
    await supabase.from("boq_files").update({ status: "error" }).eq("id", boqFile.id);
    throw new Error("No valid BoQ rows detected in the file.");
  }

  onProgress?.(`Saving ${parsed.length} items...`);
  const items = parsed.map(row => ({
    boq_file_id: boqFile.id,
    item_no: row.item_no,
    description: row.description,
    description_en: row.description_en,
    unit: row.unit,
    quantity: row.quantity,
    row_index: row.row_index,
    status: "pending",
  }));

  // Insert in batches of 100
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100);
    const { error } = await supabase.from("boq_items").insert(batch);
    if (error) throw new Error(`Failed to save items: ${error.message}`);
  }

  await supabase.from("boq_files").update({ status: "parsed" }).eq("id", boqFile.id);

  // Update project boq_count
  const { data: allFiles } = await supabase
    .from("boq_files")
    .select("id")
    .eq("project_id", projectId);
  await supabase
    .from("projects")
    .update({ boq_count: allFiles?.length || 1, status: "active" })
    .eq("id", projectId);

  return { boqFileId: boqFile.id, rowCount: parsed.length };
}

/**
 * Export a priced BoQ by downloading the original uploaded workbook,
 * editing pricing cells in-place, and saving a copy.
 * Falls back to a generated workbook only if the original cannot be retrieved.
 */
export async function exportBoQExcel(
  items: any[],
  fileName: string,
  boqFileId?: string
): Promise<void> {
  if (!boqFileId) {
    throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
  }

  try {
    const [{ data: boqFile, error: boqFileError }, { data: latestItems, error: itemsError }] = await Promise.all([
      supabase
        .from("boq_files")
        .select("file_path")
        .eq("id", boqFileId)
        .single(),
      supabase
        .from("boq_items")
        .select("*")
        .eq("boq_file_id", boqFileId)
        .order("row_index", { ascending: true }),
    ]);

    if (boqFileError || !boqFile?.file_path || itemsError) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    const exportItems = latestItems?.length ? latestItems : items;
    if (!exportItems.length) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("boq-files")
      .download(boqFile.file_path);

    if (downloadError || !blob) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, {
      type: "array",
      cellStyles: true,
      cellDates: true,
      cellNF: true,
      sheetStubs: true,
    });

    const originalSheetNames = [...wb.SheetNames];
    const originalMerges = new Map(
      wb.SheetNames.map((sheetName) => [
        sheetName,
        JSON.stringify((wb.Sheets[sheetName]["!merges"] || []).map((range) => XLSX.utils.encode_range(range))),
      ])
    );

    const targetSheet = findBestPricingSheet(wb);
    if (!targetSheet) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    const { ws, range, headerRow } = targetSheet;
    const fieldConfigs = getExportFieldConfigs();
    const columnMap = resolveExportColumns(ws, range, headerRow, fieldConfigs);

    let headerWrites = 0;
    for (const field of fieldConfigs) {
      const colIndex = columnMap.get(field.key);
      if (colIndex == null) continue;
      const addr = XLSX.utils.encode_cell({ r: headerRow, c: colIndex });
      const existingHeader = ws[addr]?.v == null ? "" : String(ws[addr].v).trim();
      if (!existingHeader) {
        ws[addr] = { t: "s", v: field.header };
        headerWrites++;
      }
    }

    let writtenCells = 0;
    let expectedWrites = 0;
    let maxRow = range.e.r;

    for (let i = 0; i < exportItems.length; i++) {
      const item = exportItems[i];
      const targetRow = typeof item.row_index === "number" && item.row_index > headerRow
        ? item.row_index
        : headerRow + 1 + i;
      maxRow = Math.max(maxRow, targetRow);
      expectedWrites += countExportableValues(item, fieldConfigs);
      writtenCells += writeExportRow(ws, item, targetRow, fieldConfigs, columnMap);
    }

    range.e.r = maxRow;
    range.e.c = Math.max(range.e.c, ...Array.from(columnMap.values()));
    ws["!ref"] = XLSX.utils.encode_range(range);

    if (!ws["!cols"]) ws["!cols"] = [];
    for (const field of fieldConfigs) {
      const colIndex = columnMap.get(field.key);
      if (colIndex != null && !ws["!cols"][colIndex]) {
        ws["!cols"][colIndex] = { wch: 14 };
      }
    }

    const mergesPreserved = wb.SheetNames.every(
      (sheetName) =>
        originalMerges.get(sheetName) ===
        JSON.stringify((wb.Sheets[sheetName]["!merges"] || []).map((merge) => XLSX.utils.encode_range(merge)))
    );
    const workbookPreserved =
      wb.SheetNames.length === originalSheetNames.length &&
      wb.SheetNames.every((sheetName, index) => sheetName === originalSheetNames[index]) &&
      mergesPreserved;
    const writeBackComplete = expectedWrites > 0 && writtenCells > 0 && writtenCells === expectedWrites;

    if (!workbookPreserved || !writeBackComplete) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    console.log(`[BoQ Export] headers=${headerWrites} expected=${expectedWrites} written=${writtenCells} file=${boqFileId}`);
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
  }
}

function getExportFieldConfigs() {
  return [
    { key: "unit_rate", header: "سعر الوحدة / Unit Price", type: "number", patterns: ["unit rate", "rate", "سعر الوحدة", "unit price"] },
    { key: "total_price", header: "السعر الإجمالي / Total Amount", type: "number", patterns: ["total price", "amount", "الإجمالي", "total amount", "السعر الإجمالي"] },
    { key: "materials", header: "مواد / Materials", type: "number", patterns: ["materials", "material", "مواد"] },
    { key: "labor", header: "عمالة / Labor", type: "number", patterns: ["labor", "labour", "عمالة"] },
    { key: "equipment", header: "معدات / Equipment", type: "number", patterns: ["equipment", "معدات"] },
    { key: "logistics", header: "نقل / Logistics", type: "number", patterns: ["logistics", "transport", "لوجستيات", "نقل"] },
    { key: "risk", header: "مخاطر / Risk %", type: "number", patterns: ["risk", "مخاطر"] },
    { key: "profit", header: "ربح / Profit %", type: "number", patterns: ["profit", "ربح"] },
    { key: "confidence", header: "الثقة / Confidence %", type: "number", patterns: ["confidence", "الثقة"] },
    { key: "notes", header: "ملاحظات / Notes", type: "text", patterns: ["notes", "note", "ملاحظات", "ملاحظة"] },
    { key: "location_factor", header: "معامل الموقع / Location Factor", type: "number", patterns: ["location factor", "معامل الموقع"] },
    { key: "status", header: "الحالة / Status", type: "text", patterns: ["status", "approval", "review", "الحالة", "اعتماد", "مراجعة"] },
  ] as const;
}

function findBestPricingSheet(wb: XLSX.WorkBook): { ws: XLSX.WorkSheet; range: XLSX.Range; headerRow: number } | null {
  let bestMatch: { ws: XLSX.WorkSheet; range: XLSX.Range; headerRow: number; score: number } | null = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const match = findHeaderRowInSheet(ws, range);
    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = { ws, range, headerRow: match.row, score: match.score };
    }
  }

  return bestMatch && bestMatch.score >= 2
    ? { ws: bestMatch.ws, range: bestMatch.range, headerRow: bestMatch.headerRow }
    : null;
}

function resolveExportColumns(
  ws: XLSX.WorkSheet,
  range: XLSX.Range,
  headerRow: number,
  fieldConfigs: ReadonlyArray<{ key: string; header: string; patterns: readonly string[] }>
): Map<string, number> {
  const columnMap = new Map<string, number>();
  let nextCol = findLastMeaningfulColumn(ws, range, headerRow) + 1;

  for (const field of fieldConfigs) {
    let foundCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })] || ws[XLSX.utils.encode_cell({ r: Math.min(headerRow + 1, range.e.r), c })];
      const headerText = normalizeHeader(cell?.v);
      if (headerText && field.patterns.some((pattern) => headerText.includes(normalizeHeader(pattern)))) {
        foundCol = c;
        break;
      }
    }

    if (foundCol === -1) foundCol = nextCol++;
    columnMap.set(field.key, foundCol);
  }

  return columnMap;
}

function countExportableValues(
  item: any,
  fieldConfigs: ReadonlyArray<{ key: string }>
): number {
  return fieldConfigs.reduce((count, field) => {
    const value = getExportValue(field.key, item[field.key]);
    return value == null || value === "" ? count : count + 1;
  }, 0);
}

function writeExportRow(
  ws: XLSX.WorkSheet,
  item: any,
  rowIdx: number,
  fieldConfigs: ReadonlyArray<{ key: string; type: string }>,
  columnMap: Map<string, number>
): number {
  let count = 0;

  for (const field of fieldConfigs) {
    const value = getExportValue(field.key, item[field.key]);
    if (value == null || value === "") continue;

    const colIdx = columnMap.get(field.key);
    if (colIdx == null) continue;

    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
    if (field.type === "number") {
      const numericValue = typeof value === "number" ? value : parseFloat(String(value));
      if (!Number.isNaN(numericValue)) {
        ws[addr] = { ...(ws[addr] || {}), t: "n", v: numericValue };
        count++;
        continue;
      }
    }

    ws[addr] = { ...(ws[addr] || {}), t: "s", v: String(value) };
    count++;
  }

  return count;
}

function findLastMeaningfulColumn(ws: XLSX.WorkSheet, range: XLSX.Range, headerRow: number): number {
  let lastCol = range.s.c;
  const endRow = Math.min(range.e.r, headerRow + 1);

  for (let c = range.s.c; c <= range.e.c; c++) {
    let hasValue = false;
    for (let r = headerRow; r <= endRow; r++) {
      const value = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (String(value ?? "").trim() !== "") {
        hasValue = true;
        break;
      }
    }
    if (hasValue) lastCol = c;
  }

  return lastCol;
}

function getExportValue(fieldKey: string, rawValue: unknown): unknown {
  if (rawValue == null || rawValue === "") return rawValue;

  if (fieldKey === "status") {
    const normalized = String(rawValue).trim().toLowerCase();
    if (normalized === "approved") return "معتمد";
    if (normalized === "review") return "تمت المراجعة";
    if (normalized === "conflict") return "تعارض";
    if (normalized === "pending") return "قيد الانتظار";
  }

  return rawValue;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Find the header row index within an existing worksheet */
function findHeaderRowInSheet(ws: XLSX.WorkSheet, range: XLSX.Range): { row: number; score: number } {
  const keywords = ["item", "بند", "description", "وصف", "unit", "وحدة", "qty", "quantity", "كمية", "no", "رقم"];
  let best = { row: 0, score: 0 };

  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    let rowText = "";
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) rowText += ` ${String(cell.v).toLowerCase()}`;
    }
    const score = keywords.filter((k) => rowText.includes(k)).length;
    if (score > best.score) best = { row: r, score };
  }

  return best;
}

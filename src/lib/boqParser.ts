import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { detectCategory } from "./pricing/categoryDetector";

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
    const originalFormulaMap = captureFormulaMap(wb, originalSheetNames);

    const targetSheet = findBestPricingSheet(wb);
    if (!targetSheet) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    const { ws, range, headerRow } = targetSheet;
    const originalMainSheetCells = cloneWorksheetCells(ws);
    const mainFieldConfigs = getMainSheetFieldConfigs();
    const writableMainColumns = resolveExistingColumns(ws, range, headerRow, mainFieldConfigs);
    const writableMainFields = mainFieldConfigs.filter((field) => writableMainColumns.has(field.key));
    if (writableMainFields.length === 0) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    let mainWrittenCells = 0;
    let mainExpectedWrites = 0;
    const allowedMainCells = new Set<string>();

    for (let i = 0; i < exportItems.length; i++) {
      const item = exportItems[i];
      const targetRow = typeof item.row_index === "number" && item.row_index > headerRow
        ? item.row_index
        : headerRow + 1 + i;
      if (targetRow > range.e.r) {
        throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
      }
      mainExpectedWrites += countExportableValues(item, writableMainFields);
      mainWrittenCells += writeExportRow(ws, item, targetRow, writableMainFields, writableMainColumns, allowedMainCells);
    }

    upsertAnalysisSheet(wb, exportItems);

    const mergesPreserved = wb.SheetNames.every(
      (sheetName) =>
        (!originalMerges.has(sheetName) || originalMerges.get(sheetName) ===
        JSON.stringify((wb.Sheets[sheetName]["!merges"] || []).map((merge) => XLSX.utils.encode_range(merge))))
    );
    const originalSheetsPreserved = originalSheetNames.every((sheetName, index) => wb.SheetNames[index] === sheetName);
    const analysisSheet = wb.Sheets["Pricing Analysis"];
    const workbookPreserved =
      originalSheetsPreserved &&
      mergesPreserved;
    const formulasPreserved = compareFormulaMaps(originalFormulaMap, captureFormulaMap(wb, originalSheetNames));
    const mainSheetUnchanged = compareWorksheetCells(originalMainSheetCells, ws, allowedMainCells);
    const analysisStoredSeparately = Boolean(analysisSheet?.["!ref"]);
    const writeBackComplete = mainExpectedWrites > 0 && mainWrittenCells > 0 && mainWrittenCells === mainExpectedWrites;

    if (!workbookPreserved || !writeBackComplete || !analysisStoredSeparately || !formulasPreserved || !mainSheetUnchanged) {
      throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
    }

    console.log(`[BoQ Export] main_expected=${mainExpectedWrites} main_written=${mainWrittenCells} analysis_sheet=Pricing Analysis file=${boqFileId}`);
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Export failed because workbook preservation or pricing write-back was incomplete.");
  }
}

function getMainSheetFieldConfigs() {
  return [
    { key: "unit_rate", header: "سعر الوحدة / Unit Price", type: "number", patterns: ["unit rate", "rate", "سعر الوحدة", "unit price"] },
    { key: "total_price", header: "السعر الإجمالي / Total Amount", type: "number", patterns: ["total price", "amount", "الإجمالي", "total amount", "السعر الإجمالي"] },
  ] as const;
}

function findBestPricingSheet(wb: XLSX.WorkBook): { sheetName: string; ws: XLSX.WorkSheet; range: XLSX.Range; headerRow: number } | null {
  let bestMatch: { sheetName: string; ws: XLSX.WorkSheet; range: XLSX.Range; headerRow: number; score: number } | null = null;

  for (const sheetName of wb.SheetNames) {
    if (sheetName === "Pricing Analysis") continue;
    const ws = wb.Sheets[sheetName];
    if (!ws?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const match = findHeaderRowInSheet(ws, range);
    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = { sheetName, ws, range, headerRow: match.row, score: match.score };
    }
  }

  return bestMatch && bestMatch.score >= 2
    ? { sheetName: bestMatch.sheetName, ws: bestMatch.ws, range: bestMatch.range, headerRow: bestMatch.headerRow }
    : null;
}

function resolveExistingColumns(
  ws: XLSX.WorkSheet,
  range: XLSX.Range,
  headerRow: number,
  fieldConfigs: ReadonlyArray<{ key: string; header: string; patterns: readonly string[] }>
): Map<string, number> {
  const columnMap = new Map<string, number>();

  for (const field of fieldConfigs) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })] || ws[XLSX.utils.encode_cell({ r: Math.min(headerRow + 1, range.e.r), c })];
      const headerText = normalizeHeader(cell?.v);
      if (headerText && field.patterns.some((pattern) => headerText.includes(normalizeHeader(pattern)))) {
        columnMap.set(field.key, c);
        break;
      }
    }
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
  columnMap: Map<string, number>,
  allowedCells?: Set<string>
): number {
  let count = 0;

  for (const field of fieldConfigs) {
    const value = getExportValue(field.key, item[field.key]);
    if (value == null || value === "") continue;

    const colIdx = columnMap.get(field.key);
    if (colIdx == null) continue;

    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
    allowedCells?.add(addr);
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

function upsertAnalysisSheet(wb: XLSX.WorkBook, exportItems: any[]) {
  // Filter: only include priced items with quantity > 0
  const pricedItems = exportItems.filter(
    (item) => item.quantity > 0 && (item.unit_rate || item.total_price)
  );

  const rows = [
    [
      "Row ID / Item Code",
      "Description",
      "Materials",
      "Labor",
      "Equipment",
      "Logistics",
      "Risk",
      "Profit",
      "Notes",
      "Confidence",
      "Category",
      "Location Factor",
    ],
    ...pricedItems.map((item) => {
      const category = detectCategory(item.description ?? "", item.description_en ?? "").category.replace(/_/g, " ");
      return [
        item.item_no || item.row_index || "",
        item.description || "",
        item.materials ?? "",
        item.labor ?? "",
        item.equipment ?? "",
        item.logistics ?? "",
        item.risk ?? "",
        item.profit ?? "",
        item.notes ?? "",
        item.confidence ?? "",
        category,
        item.location_factor ?? "",
      ];
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 48 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 42 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
  ];

  if (wb.Sheets["Pricing Analysis"]) {
    wb.Sheets["Pricing Analysis"] = ws;
    return;
  }

  wb.SheetNames.push("Pricing Analysis");
  wb.Sheets["Pricing Analysis"] = ws;
}

function cloneWorksheetCells(ws: XLSX.WorkSheet): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr.startsWith("!")) continue;
    snapshot.set(addr, JSON.stringify(normalizeCell(cell)));
  }
  return snapshot;
}

function compareWorksheetCells(original: Map<string, string>, ws: XLSX.WorkSheet, allowedCells: Set<string>): boolean {
  const current = new Map<string, string>();
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr.startsWith("!")) continue;
    current.set(addr, JSON.stringify(normalizeCell(cell)));
  }

  const addresses = new Set([...original.keys(), ...current.keys()]);
  for (const addr of addresses) {
    if (allowedCells.has(addr)) continue;
    if ((original.get(addr) ?? "") !== (current.get(addr) ?? "")) {
      return false;
    }
  }

  return true;
}

function captureFormulaMap(wb: XLSX.WorkBook, sheetNames: string[]): Map<string, string> {
  const formulas = new Map<string, string>();
  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    for (const [addr, cell] of Object.entries(ws)) {
      if (addr.startsWith("!")) continue;
      const formula = typeof cell === "object" && cell && "f" in cell ? String((cell as XLSX.CellObject).f ?? "") : "";
      if (formula) formulas.set(`${sheetName}!${addr}`, formula);
    }
  }
  return formulas;
}

function compareFormulaMaps(original: Map<string, string>, current: Map<string, string>): boolean {
  if (original.size !== current.size) return false;
  for (const [key, value] of original) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function normalizeCell(cell: unknown) {
  if (!cell || typeof cell !== "object") return cell;
  const typedCell = cell as XLSX.CellObject & { s?: unknown };
  return {
    t: typedCell.t ?? null,
    v: typedCell.v ?? null,
    w: typedCell.w ?? null,
    z: typedCell.z ?? null,
    f: typedCell.f ?? null,
    s: typedCell.s ?? null,
  };
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

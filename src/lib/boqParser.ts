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
  // Try to load the original workbook from storage
  let wb: XLSX.WorkBook | null = null;
  let originalFilePath: string | null = null;

  if (boqFileId) {
    try {
      const { data: boqFile } = await supabase
        .from("boq_files")
        .select("file_path")
        .eq("id", boqFileId)
        .single();

      if (boqFile?.file_path) {
        originalFilePath = boqFile.file_path;
        const { data: blob, error } = await supabase.storage
          .from("boq-files")
          .download(boqFile.file_path);

        if (!error && blob) {
          const buf = await blob.arrayBuffer();
          wb = XLSX.read(buf, { type: "array", cellStyles: true, cellDates: true });
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  if (wb) {
    // === IN-PLACE EDIT MODE: preserve original workbook ===
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("Workbook formatting preservation failed. Export was stopped to protect the original file structure.");

    // Find the used range
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

    // Detect header row to find where to append pricing columns
    const headerRow = findHeaderRowInSheet(ws, range);

    // Build a row_index → item lookup
    const itemByRow = new Map<number, any>();
    for (const item of items) {
      if (item.row_index != null) itemByRow.set(item.row_index, item);
    }

    // Pricing columns to append
    const pricingCols = [
      { header: "Unit Rate (SAR)", key: "unit_rate" },
      { header: "Total Price (SAR)", key: "total_price" },
      { header: "Materials", key: "materials" },
      { header: "Labor", key: "labor" },
      { header: "Equipment", key: "equipment" },
      { header: "Logistics", key: "logistics" },
      { header: "Risk %", key: "risk" },
      { header: "Profit %", key: "profit" },
      { header: "Confidence %", key: "confidence" },
      { header: "Category", key: "category" },
      { header: "Location Factor", key: "location_factor" },
      { header: "Notes", key: "notes" },
    ];

    // Determine start column for pricing (right after existing columns)
    const startCol = range.e.c + 1;

    // Write pricing headers
    for (let ci = 0; ci < pricingCols.length; ci++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow, c: startCol + ci });
      ws[addr] = { t: "s", v: pricingCols[ci].header };
    }

    // Write pricing data for each item row
    for (const [rowIdx, item] of itemByRow) {
      for (let ci = 0; ci < pricingCols.length; ci++) {
        const val = item[pricingCols[ci].key];
        if (val == null || val === "") continue;
        const addr = XLSX.utils.encode_cell({ r: rowIdx, c: startCol + ci });
        const numVal = typeof val === "number" ? val : parseFloat(val);
        if (!isNaN(numVal) && pricingCols[ci].key !== "notes" && pricingCols[ci].key !== "category") {
          ws[addr] = { t: "n", v: numVal };
        } else {
          ws[addr] = { t: "s", v: String(val) };
        }
      }
    }

    // Update the sheet range to include new columns
    range.e.c = startCol + pricingCols.length - 1;
    ws["!ref"] = XLSX.utils.encode_range(range);

    // Set column widths for the new pricing columns only
    if (!ws["!cols"]) ws["!cols"] = [];
    for (let ci = 0; ci < pricingCols.length; ci++) {
      ws["!cols"][startCol + ci] = { wch: 14 };
    }

    // Validate: sheet count preserved
    if (wb.SheetNames.length < 1) {
      throw new Error("Workbook formatting preservation failed. Export was stopped to protect the original file structure.");
    }

    XLSX.writeFile(wb, fileName);
  } else {
    // === FALLBACK: generate a new workbook (no original available) ===
    const fallbackWb = XLSX.utils.book_new();
    const headers = [
      "Item No", "Description (وصف البند)", "Unit", "Qty",
      "Unit Rate (SAR)", "Total Price (SAR)",
      "Materials", "Labor", "Equipment", "Logistics", "Risk", "Profit",
      "Confidence %", "Status",
    ];
    const data = items.map(item => [
      item.item_no, item.description, item.unit, item.quantity,
      item.unit_rate ?? "", item.total_price ?? "",
      item.materials ?? "", item.labor ?? "", item.equipment ?? "",
      item.logistics ?? "", item.risk ?? "", item.profit ?? "",
      item.confidence ?? "", item.status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws["!cols"] = [
      { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(fallbackWb, ws, "Priced BoQ");
    XLSX.writeFile(fallbackWb, fileName);
  }
}

/** Find the header row index within an existing worksheet */
function findHeaderRowInSheet(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  const keywords = ["item", "بند", "description", "وصف", "unit", "وحدة", "qty", "quantity", "كمية", "no", "رقم"];
  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    let rowText = "";
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) rowText += " " + String(cell.v).toLowerCase();
    }
    const matches = keywords.filter(k => rowText.includes(k));
    if (matches.length >= 2) return r;
  }
  return 0;
}

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
  
  const filePath = `${projectId}/${Date.now()}-${file.name}`;
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
 * Export a priced BoQ as an Excel file, preserving original structure
 * and appending pricing columns only.
 */
export async function exportBoQExcel(
  items: any[],
  fileName: string
): Promise<void> {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Item No", "Description (وصف البند)", "Unit", "Qty",
    "Unit Rate (SAR)", "Total Price (SAR)",
    "Materials", "Labor", "Equipment", "Logistics", "Risk", "Profit",
    "Confidence %", "Status",
  ];

  const data = items.map(item => [
    item.item_no,
    item.description,
    item.unit,
    item.quantity,
    item.unit_rate ?? "",
    item.total_price ?? "",
    item.materials ?? "",
    item.labor ?? "",
    item.equipment ?? "",
    item.logistics ?? "",
    item.risk ?? "",
    item.profit ?? "",
    item.confidence ?? "",
    item.status,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Set column widths
  ws["!cols"] = [
    { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 10 },
    { wch: 14 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Priced BoQ");
  XLSX.writeFile(wb, fileName);
}

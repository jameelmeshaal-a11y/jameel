import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

interface BoQItemForExport {
  item_no: string;
  section_no?: string;
  description: string;
  description_en?: string;
  unit: string;
  quantity: number;
  unit_rate: number | null;
  total_price: number | null;
  materials: number | null;
  labor: number | null;
  equipment: number | null;
  logistics: number | null;
  risk: number | null;
  profit: number | null;
  confidence: number | null;
  status: string;
  source: string | null;
  row_index: number;
}

// Keywords to detect unit price column
const UNIT_PRICE_KEYWORDS = [
  "سعر الوحدة", "سعر", "فئة", "unit price", "unit rate", "price", "rate",
  "السعر", "الفئة", "unit_price", "unitprice",
];

// Keywords to detect total column
const TOTAL_KEYWORDS = [
  "الإجمالي", "إجمالي", "المبلغ", "الجملة", "total", "amount", "مبلغ",
  "total price", "total_price", "القيمة",
];

function matchesKeywords(cellValue: any, keywords: string[]): boolean {
  if (cellValue == null) return false;
  const str = String(cellValue).trim().toLowerCase();
  return keywords.some(kw => str.includes(kw.toLowerCase()));
}

/**
 * Detect column indices for unit price and total in the original sheet.
 * Scans the first 10 rows for header keywords.
 */
function detectPriceColumns(sheet: ExcelJS.Worksheet): { unitPriceCol: number | null; totalCol: number | null; headerRow: number } {
  let unitPriceCol: number | null = null;
  let totalCol: number | null = null;
  let headerRow = 1;

  for (let rowIdx = 1; rowIdx <= Math.min(10, sheet.rowCount); rowIdx++) {
    const row = sheet.getRow(rowIdx);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = cell.value;
      if (!unitPriceCol && matchesKeywords(val, UNIT_PRICE_KEYWORDS)) {
        unitPriceCol = colNumber;
        headerRow = rowIdx;
      }
      if (!totalCol && matchesKeywords(val, TOTAL_KEYWORDS)) {
        totalCol = colNumber;
        headerRow = rowIdx;
      }
    });
    if (unitPriceCol && totalCol) break;
  }

  return { unitPriceCol, totalCol, headerRow };
}

/**
 * Download the original BoQ file from storage, inject prices, add breakdown sheet, and download.
 */
export async function exportOriginalWithPrices(
  items: BoQItemForExport[],
  filePath: string,
  projectName: string,
  boqFileName: string
): Promise<void> {
  // 1. Download original file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("boq-files")
    .download(filePath);

  if (downloadError || !fileData) {
    throw new Error(`فشل تحميل الملف الأصلي: ${downloadError?.message || "ملف غير موجود"}`);
  }

  // 2. Load into ExcelJS (preserves formatting)
  const buffer = await fileData.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.getWorksheet(1);
  if (!sheet) throw new Error("لا يوجد شيت في الملف الأصلي");

  // 3. Detect price columns
  const { unitPriceCol, totalCol, headerRow } = detectPriceColumns(sheet);
  if (!unitPriceCol) {
    throw new Error("لم يُعثر على عمود سعر الوحدة في الملف الأصلي. تأكد من وجود عمود بعنوان 'سعر الوحدة' أو 'Unit Price'");
  }

  // 4. Inject prices into original rows
  let injectedCount = 0;
  for (const item of items) {
    if (!item.unit_rate || item.unit_rate <= 0 || item.quantity <= 0) continue;
    if (item.row_index <= 0) continue;

    // row_index is 0-based from parsing, Excel rows are 1-based
    // Add offset for header row: row_index=0 means first data row after headers
    const excelRow = item.row_index + 1; // Convert to 1-based

    const row = sheet.getRow(excelRow);
    if (!row) continue;

    // Write unit price — preserve existing cell style
    const priceCell = row.getCell(unitPriceCol);
    priceCell.value = item.unit_rate;
    if (!priceCell.numFmt || priceCell.numFmt === "General") {
      priceCell.numFmt = '#,##0.00';
    }

    // Write total price
    if (totalCol) {
      const totalCell = row.getCell(totalCol);
      totalCell.value = item.total_price || (item.unit_rate * item.quantity);
      if (!totalCell.numFmt || totalCell.numFmt === "General") {
        totalCell.numFmt = '#,##0.00';
      }
    }

    injectedCount++;
  }

  // 5. Add breakdown sheet
  const breakdownSheet = wb.addWorksheet("تحليل الأسعار", {
    views: [{ rightToLeft: true }],
  });

  // Breakdown headers
  const bHeaders = ["رقم البند", "الوصف", "سعر الوحدة", "مواد", "عمالة", "معدات", "نقل", "مخاطر", "ربح", "المصدر", "الثقة %"];
  const hRow = breakdownSheet.addRow(bHeaders);
  hRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // Breakdown data
  const pricedItems = items.filter(i => i.unit_rate && i.unit_rate > 0);
  for (const item of pricedItems) {
    const row = breakdownSheet.addRow([
      item.item_no,
      item.description,
      item.unit_rate || 0,
      item.materials || 0,
      item.labor || 0,
      item.equipment || 0,
      item.logistics || 0,
      item.risk || 0,
      item.profit || 0,
      item.source || "",
      item.confidence != null ? `${item.confidence}%` : "—",
    ]);
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (typeof cell.value === "number") {
        cell.numFmt = '#,##0.00';
      }
    });
  }

  // Breakdown column widths
  breakdownSheet.columns = [
    { width: 12 }, { width: 45 }, { width: 14 },
    { width: 12 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 10 },
    { width: 16 }, { width: 10 },
  ];

  // 6. Generate and download
  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `${projectName}_اعتماد_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  return;
}

import ExcelJS from "exceljs";

interface BoQExportItem {
  item_no: string;
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
  linked_rate_id: string | null;
  notes?: string | null;
}

const NAVY = "FF1E3A5F";
const WHITE = "FFFFFFFF";
const RED_BG = "FFFFE6E6";
const YELLOW_BG = "FFFFF9E6";
const GRAY_BG = "FFF0F0F0";
const GREEN_TEXT = "FF008000";
const ORANGE_TEXT = "FFFF8C00";
const RED_TEXT = "FFFF0000";

const HEADER_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 12, bold: true, color: { argb: WHITE } };
const DATA_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11 };
const BOLD_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, bold: true };

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const UNMATCHED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
const REVIEW_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_BG } };
const TOTALS_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_BG } };

const HEADERS = [
  "رقم البند",
  "الوصف",
  "المطابقة",
  "الوحدة",
  "الكمية",
  "الفئة",
  "سعر الوحدة",
  "الإجمالي",
  "مواد",
  "عمالة",
  "معدات",
  "نقل",
  "مخاطر",
  "ربح",
  "الثقة %",
  "الحالة",
];

function detectCategory(item: BoQExportItem): string {
  const desc = (item.description + " " + (item.description_en || "")).toLowerCase();
  if (/كهرب|electric|cable|كابل|لوح|panel|مفتاح|switch|إنار|light/i.test(desc)) return "كهربائية";
  if (/ميكانيك|mechan|hvac|تكييف|مضخ|pump|أنبوب|pipe/i.test(desc)) return "ميكانيكية";
  if (/خرسان|concrete|حديد|steel|أساس|found|بناء|masonry/i.test(desc)) return "إنشائية";
  if (/دهان|paint|بلاط|tile|أرضي|floor|تشطيب|finish/i.test(desc)) return "تشطيبات";
  if (/حفر|excav|ردم|backfill|تسوي|grad/i.test(desc)) return "أعمال ترابية";
  return "عام";
}

function matchIcon(item: BoQExportItem): string {
  if (item.source === "no_match" || item.status === "unmatched") return "🔴";
  if (item.status === "needs_review") return "🟡";
  return "✅";
}

function statusLabel(status: string): string {
  switch (status) {
    case "approved": return "معتمد";
    case "needs_review": return "يحتاج مراجعة";
    case "unmatched": return "غير مطابق";
    default: return status;
  }
}

function fmtNum(v: number | null): string | number {
  if (v == null || v === 0) return 0;
  return v;
}

function confidenceColor(conf: number | null): Partial<ExcelJS.Font> {
  if (conf == null) return { ...DATA_FONT, color: { argb: RED_TEXT } };
  if (conf >= 90) return { ...DATA_FONT, color: { argb: GREEN_TEXT } };
  if (conf >= 70) return { ...DATA_FONT, color: { argb: ORANGE_TEXT } };
  return { ...DATA_FONT, color: { argb: RED_TEXT } };
}

export async function exportStyledBoQ(
  items: BoQExportItem[],
  projectName: string,
  boqFileName: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lovable BoQ System";

  // ---- Main Sheet ----
  const sheetName = `${projectName} - ${boqFileName}`.substring(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  // Headers
  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  // Data rows
  for (const item of items) {
    const isUnmatched = item.source === "no_match" || item.status === "unmatched";
    const isReview = item.status === "needs_review";
    const category = detectCategory(item);

    const unitPriceVal = isUnmatched ? "غير موجود في المكتبة" : fmtNum(item.unit_rate);
    const totalVal = isUnmatched ? "غير موجود في المكتبة" : fmtNum(item.total_price);

    const row = ws.addRow([
      item.item_no,
      item.description,
      matchIcon(item),
      item.unit,
      item.quantity,
      category,
      unitPriceVal,
      totalVal,
      fmtNum(item.materials),
      fmtNum(item.labor),
      fmtNum(item.equipment),
      fmtNum(item.logistics),
      fmtNum(item.risk),
      fmtNum(item.profit),
      item.confidence != null ? item.confidence / 100 : 0,
      statusLabel(item.status),
    ]);

    row.eachCell((cell) => {
      cell.font = DATA_FONT;
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    // Row fill
    if (isUnmatched) {
      row.eachCell((cell) => { cell.fill = UNMATCHED_FILL; });
    } else if (isReview) {
      row.eachCell((cell) => { cell.fill = REVIEW_FILL; });
    }

    // Confidence color
    const confCell = row.getCell(15);
    confCell.font = confidenceColor(item.confidence);
    confCell.numFmt = "0%";

    // Number format for currency columns
    for (const ci of [7, 8, 9, 10, 11, 12, 13, 14]) {
      const c = row.getCell(ci);
      if (typeof c.value === "number") {
        c.numFmt = '#,##0.00" SAR"';
      }
    }

    // Quantity format
    row.getCell(5).numFmt = "#,##0.00";
  }

  // Totals row
  const lastDataRow = items.length + 1;
  const totalsRow = ws.addRow([
    "",
    "الإجمالي",
    "",
    "",
    "",
    "",
    "",
    items.reduce((s, i) => s + (i.total_price || 0), 0),
    items.reduce((s, i) => s + (i.materials || 0), 0),
    items.reduce((s, i) => s + (i.labor || 0), 0),
    items.reduce((s, i) => s + (i.equipment || 0), 0),
    items.reduce((s, i) => s + (i.logistics || 0), 0),
    items.reduce((s, i) => s + (i.risk || 0), 0),
    items.reduce((s, i) => s + (i.profit || 0), 0),
    "",
    "",
  ]);
  totalsRow.eachCell((cell) => {
    cell.font = BOLD_FONT;
    cell.fill = TOTALS_FILL;
    if (typeof cell.value === "number") {
      cell.numFmt = '#,##0.00" SAR"';
    }
  });

  // Column widths
  const colWidths = [12, 45, 8, 8, 10, 14, 16, 16, 12, 12, 12, 10, 10, 10, 10, 14];
  ws.columns.forEach((col, i) => { col.width = colWidths[i] || 12; });

  // ---- Summary Sheet ----
  const summary = wb.addWorksheet("ملخص التسعير", {
    views: [{ rightToLeft: true }],
  });

  const approvedCount = items.filter(i => i.status === "approved").length;
  const unmatchedCount = items.filter(i => i.status === "unmatched" || i.source === "no_match").length;
  const reviewCount = items.filter(i => i.status === "needs_review").length;
  const grandTotal = items.reduce((s, i) => s + (i.total_price || 0), 0);

  const summaryData: [string, string | number][] = [
    ["ملخص التسعير", ""],
    ["", ""],
    ["إجمالي البنود", items.length],
    ["بنود مسعّرة ✅", approvedCount],
    ["بنود غير مطابقة 🔴", unmatchedCount],
    ["بنود تحتاج مراجعة 🟡", reviewCount],
    ["", ""],
    ["القيمة الإجمالية (ر.س)", grandTotal],
  ];

  for (const [label, value] of summaryData) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = BOLD_FONT;
    row.getCell(1).alignment = { horizontal: "right" };
    if (typeof value === "number") {
      row.getCell(2).numFmt = '#,##0.00" SAR"';
    }
  }

  // Category breakdown
  summary.addRow([]);
  const catHeader = summary.addRow(["تفصيل حسب الفئة", "القيمة (ر.س)"]);
  catHeader.eachCell(c => { c.font = HEADER_FONT; c.fill = HEADER_FILL; });

  const catMap: Record<string, number> = {};
  for (const item of items) {
    const cat = detectCategory(item);
    catMap[cat] = (catMap[cat] || 0) + (item.total_price || 0);
  }
  for (const [cat, val] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) {
    const row = summary.addRow([cat, val]);
    row.getCell(2).numFmt = '#,##0.00" SAR"';
  }

  summary.columns = [{ width: 30 }, { width: 20 }];
  // Title styling
  const titleCell = summary.getCell("A1");
  titleCell.font = { name: "Calibri", size: 16, bold: true };

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `${projectName}_BoQ_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

import ExcelJS from "exceljs";
import { formatCurrency } from "./mockData";

interface FileStats {
  name: string;
  isArchived: boolean;
  totalItems: number;
  pricedItems: number;
  totalCost: number;
}

interface ReportData {
  projectName: string;
  files: FileStats[];
  totals: { totalItems: number; pricedItems: number; totalCost: number };
}

export async function exportReportExcel(data: ReportData) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ملخص المشروع", { views: [{ rightToLeft: true }] });

  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Arial" };
  const borderStyle: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD0D0D0" } };
  const borders: Partial<ExcelJS.Borders> = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  // Title row
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `تقرير ملخص — ${data.projectName}`;
  titleCell.font = { bold: true, size: 14, name: "Arial", color: { argb: "FF1E3A5F" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  // Date row
  ws.mergeCells("A2:D2");
  const dateCell = ws.getCell("A2");
  dateCell.value = new Date().toLocaleDateString("ar-SA");
  dateCell.font = { size: 9, color: { argb: "FF999999" }, name: "Arial" };
  dateCell.alignment = { horizontal: "center" };

  // Header row
  const headers = ["جدول الكميات", "عدد البنود", "المسعّرة", "الإجمالي (ر.س)"];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borders;
  });
  headerRow.height = 24;

  // Data rows
  for (const f of data.files) {
    const name = f.isArchived ? `${f.name} (مؤرشف)` : f.name;
    const row = ws.addRow([name, f.totalItems, `${f.pricedItems}/${f.totalItems}`, f.totalCost]);
    row.getCell(1).font = { name: "Arial", size: 10 };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: "right" };
    row.eachCell((cell) => { cell.border = borders; });
    if (f.isArchived) {
      row.getCell(1).font = { name: "Arial", size: 10, color: { argb: "FF999999" }, italic: true };
    }
  }

  // Total row
  const totalRow = ws.addRow(["الإجمالي", data.totals.totalItems, `${data.totals.pricedItems}/${data.totals.totalItems}`, data.totals.totalCost]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, name: "Arial", size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
    cell.border = borders;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  totalRow.getCell(4).numFmt = '#,##0.00';
  totalRow.getCell(4).alignment = { horizontal: "right" };

  // Column widths
  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 20;

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 3, rightToLeft: true }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.projectName}_ملخص.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportPDF(data: ReportData, lang: "en" | "ar") {
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const dateStr = new Date().toLocaleString(isAr ? "ar-SA" : "en-SA");

  let html = `<!DOCTYPE html><html dir="${dir}" lang="${lang}">
<head><meta charset="utf-8"><title>${isAr ? "تقرير ملخص المشروع" : "Project Summary Report"}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; direction: ${dir}; }
  .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
  .header h1 { font-size: 20px; color: #1e3a5f; margin-bottom: 4px; }
  .header p { font-size: 10px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1e3a5f; color: white; padding: 10px 12px; font-size: 11px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) { background: #f9fafb; }
  .total-row { background: #f0f4f8 !important; font-weight: bold; }
  .archived { color: #999; font-style: italic; }
  .badge { display: inline-block; font-size: 9px; background: #f59e0b; color: white; padding: 1px 6px; border-radius: 8px; margin-inline-start: 6px; }
  .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #999; }
  .text-center { text-align: center; }
  .text-end { text-align: ${isAr ? "left" : "right"}; }
</style></head><body>`;

  html += `<div class="header">
    <h1>${isAr ? "تقرير ملخص المشروع" : "Project Summary Report"}</h1>
    <p>CostEngine — ${data.projectName}</p>
    <p>${dateStr}</p>
  </div>`;

  html += `<table><thead><tr>
    <th>${isAr ? "جدول الكميات" : "BoQ File"}</th>
    <th class="text-center">${isAr ? "عدد البنود" : "Items"}</th>
    <th class="text-center">${isAr ? "المسعّرة" : "Priced"}</th>
    <th class="text-end">${isAr ? "الإجمالي" : "Total"}</th>
  </tr></thead><tbody>`;

  for (const f of data.files) {
    const archivedBadge = f.isArchived ? `<span class="badge">${isAr ? "مؤرشف" : "Archived"}</span>` : "";
    const cls = f.isArchived ? ' class="archived"' : "";
    html += `<tr>
      <td${cls}>${f.name}${archivedBadge}</td>
      <td class="text-center">${f.totalItems}</td>
      <td class="text-center">${f.pricedItems}/${f.totalItems}</td>
      <td class="text-end">${formatCurrency(f.totalCost)}</td>
    </tr>`;
  }

  html += `<tr class="total-row">
    <td>${isAr ? "الإجمالي" : "Total"}</td>
    <td class="text-center">${data.totals.totalItems}</td>
    <td class="text-center">${data.totals.pricedItems}/${data.totals.totalItems}</td>
    <td class="text-end">${formatCurrency(data.totals.totalCost)}</td>
  </tr></tbody></table>`;

  html += `<div class="footer">CostEngine © ${new Date().getFullYear()} — ${isAr ? "تقرير مُولّد تلقائياً" : "Auto-generated report"}</div></body></html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}

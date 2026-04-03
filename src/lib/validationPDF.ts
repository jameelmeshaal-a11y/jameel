import type { ValidationReport } from "./validationEngine";

export function downloadValidationPDF(report: ValidationReport, lang: "en" | "ar") {
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const overallLabels: Record<string, { en: string; ar: string; color: string }> = {
    ready: { en: "System Ready", ar: "النظام جاهز", color: "#10b981" },
    partially_ready: { en: "Partially Ready", ar: "جاهز جزئياً", color: "#f59e0b" },
    not_ready: { en: "Not Ready", ar: "غير جاهز", color: "#ef4444" },
  };

  const statusSymbols: Record<string, { symbol: string; color: string }> = {
    pass: { symbol: "✓", color: "#10b981" },
    fail: { symbol: "✕", color: "#ef4444" },
    warn: { symbol: "⚠", color: "#f59e0b" },
  };

  const scores = [
    { key: "functional" as const, en: "Functional Score", ar: "النتيجة الوظيفية" },
    { key: "dataIntegrity" as const, en: "Data Integrity", ar: "سلامة البيانات" },
    { key: "uiReliability" as const, en: "UI Reliability", ar: "موثوقية الواجهة" },
    { key: "pricingLogic" as const, en: "Pricing Logic", ar: "منطق التسعير" },
    { key: "performance" as const, en: "Performance", ar: "الأداء" },
  ];

  const categories = [...new Set(report.tests.map(t => t.category))];

  const ol = overallLabels[report.overallStatus];
  const dateStr = new Date(report.timestamp).toLocaleString(isAr ? "ar-SA" : "en-SA");

  let html = `<!DOCTYPE html><html dir="${dir}" lang="${lang}">
<head><meta charset="utf-8"><title>${isAr ? "تقرير فحص النظام" : "System Validation Report"}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, 'Segoe UI', Tahoma, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; direction: ${dir}; }
  .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #1e3a5f; margin-bottom: 20px; }
  .header h1 { font-size: 22px; color: #1e3a5f; margin-bottom: 4px; }
  .header p { font-size: 11px; color: #666; }
  .status-badge { display: inline-block; padding: 6px 20px; border-radius: 20px; color: white; font-weight: bold; font-size: 14px; margin: 10px 0; }
  .summary { display: flex; justify-content: center; gap: 30px; margin: 16px 0 20px; }
  .summary-item { text-align: center; }
  .summary-item .num { font-size: 24px; font-weight: bold; }
  .summary-item .lbl { font-size: 10px; color: #666; }
  .scores { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .score-card { flex: 1; min-width: 100px; text-align: center; padding: 12px 8px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .score-card .val { font-size: 22px; font-weight: bold; }
  .score-card .lbl { font-size: 9px; color: #666; margin-top: 2px; }
  .cat-section { margin-bottom: 14px; page-break-inside: avoid; }
  .cat-header { font-size: 13px; font-weight: bold; color: #1e3a5f; padding: 6px 10px; background: #f0f4f8; border-radius: 6px; margin-bottom: 6px; }
  .test-row { display: flex; align-items: flex-start; gap: 8px; padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
  .test-icon { font-size: 13px; flex-shrink: 0; width: 18px; text-align: center; }
  .test-info { flex: 1; }
  .test-name { font-weight: 600; font-size: 11px; }
  .test-msg { font-size: 10px; color: #666; }
  .test-dur { font-size: 9px; color: #999; flex-shrink: 0; }
  .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #999; }
</style></head><body>`;

  // Header
  html += `<div class="header">
    <h1>${isAr ? "تقرير فحص جاهزية النظام" : "System Validation Report"}</h1>
    <p>CostEngine — ${isAr ? "تقدير التكاليف بالذكاء الاصطناعي" : "AI Cost Estimation"}</p>
    <div class="status-badge" style="background:${ol.color}">${isAr ? ol.ar : ol.en}</div>
    <p>${dateStr}</p>
  </div>`;

  // Summary
  html += `<div class="summary">
    <div class="summary-item"><div class="num" style="color:#10b981">${report.totalPassed}</div><div class="lbl">${isAr ? "ناجح" : "Passed"}</div></div>
    <div class="summary-item"><div class="num" style="color:#f59e0b">${report.totalWarnings}</div><div class="lbl">${isAr ? "تحذيرات" : "Warnings"}</div></div>
    <div class="summary-item"><div class="num" style="color:#ef4444">${report.totalFailed}</div><div class="lbl">${isAr ? "فشل" : "Failed"}</div></div>
  </div>`;

  // Scores
  html += `<div class="scores">`;
  for (const s of scores) {
    const val = report.scores[s.key];
    const color = val >= 80 ? "#10b981" : val >= 50 ? "#f59e0b" : "#ef4444";
    html += `<div class="score-card"><div class="val" style="color:${color}">${val}%</div><div class="lbl">${isAr ? s.ar : s.en}</div></div>`;
  }
  html += `</div>`;

  // Detailed Results
  html += `<h2 style="font-size:14px;color:#1e3a5f;margin-bottom:10px">${isAr ? "النتائج التفصيلية" : "Detailed Results"}</h2>`;
  for (const cat of categories) {
    const tests = report.tests.filter(t => t.category === cat);
    html += `<div class="cat-section"><div class="cat-header">${cat}</div>`;
    for (const test of tests) {
      const s = statusSymbols[test.status] || statusSymbols.pass;
      html += `<div class="test-row">
        <div class="test-icon" style="color:${s.color}">${s.symbol}</div>
        <div class="test-info">
          <div class="test-name">${isAr ? test.nameAr : test.name}</div>
          <div class="test-msg">${isAr ? test.messageAr : test.message}</div>
        </div>
        ${test.duration !== undefined ? `<div class="test-dur">${test.duration}ms</div>` : ""}
      </div>`;
    }
    html += `</div>`;
  }

  // Issues section
  const issues = report.tests.filter(t => t.status === "fail" || t.status === "warn");
  if (issues.length > 0) {
    html += `<h2 style="font-size:14px;color:#1e3a5f;margin:16px 0 10px">${isAr ? "المشاكل المكتشفة" : "Detected Issues"}</h2>`;
    for (const issue of issues) {
      const s = statusSymbols[issue.status];
      html += `<div class="test-row" style="background:${issue.status === 'fail' ? '#fef2f2' : '#fffbeb'};border-radius:6px;margin-bottom:4px">
        <div class="test-icon" style="color:${s.color}">${s.symbol}</div>
        <div class="test-info">
          <div class="test-name">${isAr ? issue.nameAr : issue.name} — ${issue.category}</div>
          <div class="test-msg">${isAr ? issue.messageAr : issue.message}</div>
        </div>
      </div>`;
    }
  }

  // Footer
  html += `<div class="footer">
    CostEngine © ${new Date().getFullYear()} — ${isAr ? "تقرير مُولّد تلقائياً" : "Auto-generated report"}
  </div></body></html>`;

  // Open print dialog
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}

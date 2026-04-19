/**
 * Approval Exporter — ExcelJS-based.
 *
 * Pipeline:
 *   1. Download original .xlsx from Supabase Storage
 *   2. Load with ExcelJS (preserves formatting, merged cells, styles)
 *   3. Pick the worksheet with the strongest item_no coverage
 *   4. Detect header columns (Arabic-aware) — fallback to fixed COL (C/G/I, row 8)
 *   5. Build item_no → row map with normalization (NBSP, Arabic digits, spaces)
 *   6. Inject unit_rate + total_price; remove other sheets
 *   7. Validate exported total ≈ system total (±0.5%)
 *   8. Download to user
 *
 * Same signature as before — no caller changes needed.
 */

import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ApprovalItem {
  item_no?: string | null;
  description?: string | null;
  row_index: number;
  quantity?: number | null;
  unit_rate: number | null;
  total_price: number | null;
  status: string;
  override_type?: string | null;
}

// ─── Fixed-column fallback (Etemad standard layout) ────────────────────────
// Used ONLY when auto-detection fails entirely.
const COL_FALLBACK = {
  ITEM_NO: 3,      // C
  DESC: 4,         // D
  QTY: 6,          // F
  UNIT_PRICE: 7,   // G
  TOTAL: 9,        // I
  HEADER_ROW: 7,   // data starts at row 8
};

// ─── Normalization helpers ─────────────────────────────────────────────────

function normHeader(s: string): string {
  return String(s ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digitsToAscii(s: string): string {
  return String(s ?? "")
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
}

function normalizeItemNo(s: string | null | undefined): string {
  return digitsToAscii(String(s ?? ""))
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function roundCurrency(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: any) => r.text ?? "").join("");
    }
    if ("text" in v) return String((v as any).text ?? "");
    if ("result" in v) return String((v as any).result ?? "");
    if ("formula" in v) return String((v as any).formula ?? "");
  }
  return String(v);
}

// ─── Header keyword sets ───────────────────────────────────────────────────

const ITEM_NO_KEYS = ["رقم البند", "رقم الصنف", "item no", "item code", "division no.", "division no", "الرمز الإنشائي", "code", "#", "no", "no.", "serial"];
const DESC_KEYS = ["وصف البند", "الوصف", "البيان", "description", "اسم البند"];
const QTY_KEYS = ["الكمية", "الكميه", "qty", "quantity", "كمية"];
const UNIT_RATE_KEYS = ["سعر الوحدة", "سعر الوحده", "unit rate", "unit price"];
const TOTAL_KEYS = ["السعر الإجمالي", "السعر الاجمالي", "السعر الكلي", "إجمالي السعر", "اجمالي السعر", "total amount", "total price", "المبلغ الإجمالي", "المبلغ الاجمالي"];

function matchesAny(text: string, keys: string[]): boolean {
  const t = normHeader(text);
  if (!t) return false;
  return keys.some(k => {
    const kk = normHeader(k);
    if (!kk) return false;
    if (t === kk) return true;
    if (t.startsWith(kk + " ") || t.endsWith(" " + kk) || t.includes(" " + kk + " ")) return true;
    return false;
  });
}

interface HeaderMap {
  headerRow: number;
  itemNoCol: number | null;
  descCol: number | null;
  qtyCol: number | null;
  unitRateCol: number | null;
  totalCol: number | null;
}

function detectHeaderMap(ws: ExcelJS.Worksheet): HeaderMap {
  const maxScan = Math.min(ws.actualRowCount || ws.rowCount || 30, 30);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    let descCol: number | null = null;
    let qtyCol: number | null = null;
    let unitRateCol: number | null = null;
    let totalCol: number | null = null;
    let itemNoCol: number | null = null;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      if (!text) return;
      // TOTAL before UNIT_RATE (more specific)
      if (totalCol === null && matchesAny(text, TOTAL_KEYS)) { totalCol = colNumber; return; }
      if (unitRateCol === null && matchesAny(text, UNIT_RATE_KEYS)) { unitRateCol = colNumber; return; }
      if (qtyCol === null && matchesAny(text, QTY_KEYS)) { qtyCol = colNumber; return; }
      if (descCol === null && matchesAny(text, DESC_KEYS)) { descCol = colNumber; return; }
      if (itemNoCol === null && matchesAny(text, ITEM_NO_KEYS)) { itemNoCol = colNumber; return; }
    });

    if (descCol !== null && (qtyCol !== null || unitRateCol !== null || totalCol !== null)) {
      return { headerRow: r, itemNoCol, descCol, qtyCol, unitRateCol, totalCol };
    }
  }
  return { headerRow: 0, itemNoCol: null, descCol: null, qtyCol: null, unitRateCol: null, totalCol: null };
}

/** Apply COL fallback when auto-detect produces nothing usable. */
function applyFallback(hm: HeaderMap): HeaderMap {
  if (hm.descCol !== null && (hm.unitRateCol !== null || hm.totalCol !== null)) return hm;
  return {
    headerRow: COL_FALLBACK.HEADER_ROW,
    itemNoCol: hm.itemNoCol ?? COL_FALLBACK.ITEM_NO,
    descCol: hm.descCol ?? COL_FALLBACK.DESC,
    qtyCol: hm.qtyCol ?? COL_FALLBACK.QTY,
    unitRateCol: hm.unitRateCol ?? COL_FALLBACK.UNIT_PRICE,
    totalCol: hm.totalCol ?? COL_FALLBACK.TOTAL,
  };
}

// ─── Item-no column inference (in case header detect picked wrong column) ──

function inferItemNoCol(ws: ExcelJS.Worksheet, hm: HeaderMap, items: ApprovalItem[]): { col: number | null; matches: number } {
  const pricedItemNos = new Set(items.map(i => normalizeItemNo(i.item_no)).filter(Boolean));
  if (pricedItemNos.size === 0) return { col: hm.itemNoCol, matches: 0 };

  const scores = new Map<number, number>();
  const lastRow = ws.actualRowCount || ws.rowCount || 0;
  for (let r = (hm.headerRow || 0) + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    // Quantity gate
    if (hm.qtyCol !== null) {
      const qtyText = cellText(row.getCell(hm.qtyCol));
      const qtyNum = parseFloat(digitsToAscii(qtyText).replace(/,/g, "").trim());
      if (!isFinite(qtyNum) || qtyNum <= 0) continue;
    }
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (hm.descCol !== null && colNumber >= hm.descCol) return;
      const key = normalizeItemNo(cellText(cell));
      if (!key || !pricedItemNos.has(key)) return;
      scores.set(colNumber, (scores.get(colNumber) ?? 0) + 1);
    });
  }

  let bestCol = hm.itemNoCol;
  let bestMatches = bestCol ? scores.get(bestCol) ?? 0 : 0;
  for (const [col, m] of scores) {
    if (m > bestMatches) { bestCol = col; bestMatches = m; }
  }
  return { col: bestCol, matches: bestMatches };
}

// ─── Row → Item map ────────────────────────────────────────────────────────

function buildRowItemMap(
  ws: ExcelJS.Worksheet,
  hm: HeaderMap,
  pricedItems: ApprovalItem[],
): { map: Map<number, ApprovalItem>; unmatched: ApprovalItem[]; itemNoCol: number | null } {
  const map = new Map<number, ApprovalItem>();
  const unmatched: ApprovalItem[] = [];
  const detection = inferItemNoCol(ws, hm, pricedItems);
  const itemNoCol = detection.col;

  const queues = new Map<string, number[]>();
  if (itemNoCol !== null) {
    const lastRow = ws.actualRowCount || ws.rowCount || 0;
    for (let r = (hm.headerRow || 0) + 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      if (hm.qtyCol !== null) {
        const qtyText = cellText(row.getCell(hm.qtyCol));
        const qtyNum = parseFloat(digitsToAscii(qtyText).replace(/,/g, "").trim());
        if (!isFinite(qtyNum) || qtyNum <= 0) continue;
      }
      const key = normalizeItemNo(cellText(row.getCell(itemNoCol)));
      if (!key) continue;
      const q = queues.get(key) ?? [];
      q.push(r);
      queues.set(key, q);
    }
  }

  for (const item of pricedItems) {
    const key = normalizeItemNo(item.item_no);
    if (!key) { unmatched.push(item); continue; }
    const q = queues.get(key);
    const matchedRow = q?.shift();
    if (matchedRow) map.set(matchedRow, item);
    else unmatched.push(item);
  }

  return { map, unmatched, itemNoCol };
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function exportApproval(
  boqFileId: string,
  items: ApprovalItem[],
  originalFilePath: string,
  originalFileName: string,
): Promise<void> {
  // 1. Download
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("boq-files")
    .download(originalFilePath);
  if (dlErr || !fileData) throw new Error("تعذر تحميل الملف الأصلي من التخزين");

  const buffer = await fileData.arrayBuffer();

  // 2. Load with ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // 3. Filter priced items
  const pricedItems = items.filter(i =>
    i.unit_rate != null &&
    i.unit_rate > 0 &&
    typeof i.quantity === "number" &&
    i.quantity > 0 &&
    i.status !== "descriptive",
  );

  // 4. Pick best worksheet (highest item_no coverage + has price columns)
  let bestWs: ExcelJS.Worksheet | null = null;
  let bestHm: HeaderMap | null = null;
  let bestScore = -1;

  wb.eachSheet(ws => {
    const hmRaw = detectHeaderMap(ws);
    const hm = applyFallback(hmRaw);
    const det = inferItemNoCol(ws, hm, pricedItems);
    const hasPrice = hm.unitRateCol !== null || hm.totalCol !== null;
    const score = (hasPrice ? 100000 : 0) + det.matches;
    if (score > bestScore) {
      bestScore = score;
      bestWs = ws;
      bestHm = hm;
    }
  });

  if (!bestWs || !bestHm) throw new Error("لا توجد ورقة عمل صالحة في الملف الأصلي");
  if (bestHm.unitRateCol === null && bestHm.totalCol === null) {
    throw new Error("تعذر العثور على أعمدة السعر في الملف الأصلي");
  }

  const ws = bestWs as ExcelJS.Worksheet;
  const hm = bestHm as HeaderMap;
  const detectionUsed = bestScore >= 100000 ? "auto" : "fallback";

  // 5. Build map
  const { map: rowItemMap, unmatched, itemNoCol } = buildRowItemMap(ws, hm, pricedItems);

  // 6. Inject + DEBUG log
  let injectedSum = 0;
  const injectedItemNos: string[] = [];
  for (const [rowNum, item] of rowItemMap) {
    const row = ws.getRow(rowNum);
    if (hm.unitRateCol !== null) {
      row.getCell(hm.unitRateCol).value = item.unit_rate;
    }
    const qty = (item.quantity ?? 0) as number;
    const totalVal = (item.total_price != null && item.total_price > 0)
      ? item.total_price
      : (item.unit_rate! * qty);
    if (hm.totalCol !== null) {
      row.getCell(hm.totalCol).value = totalVal;
    }
    row.commit();
    injectedSum += totalVal;
    injectedItemNos.push(String(item.item_no ?? "?"));
  }
  injectedSum = roundCurrency(injectedSum);

  // DEBUG: log every injected item_no (per user request — verify 102 missing now covered)
  console.debug("[approvalExporter] INJECTED item_no list", {
    count: injectedItemNos.length,
    item_nos: injectedItemNos,
  });

  // 7. Remove all other worksheets — keep only the chosen one
  const keepName = ws.name;
  const toRemove: string[] = [];
  wb.eachSheet(sheet => { if (sheet.name !== keepName) toRemove.push(sheet.name); });
  for (const n of toRemove) {
    const s = wb.getWorksheet(n);
    if (s) wb.removeWorksheet(s.id);
  }

  // 8. Validate
  const systemTotal = roundCurrency(items.reduce((s, i) => {
    const q = typeof i.quantity === "number" ? i.quantity : 0;
    if (q > 0 && i.unit_rate != null && i.unit_rate > 0) {
      return s + (i.total_price != null && i.total_price > 0 ? i.total_price : i.unit_rate * q);
    }
    return s;
  }, 0));
  const varianceAmount = roundCurrency(Math.abs(systemTotal - injectedSum));
  const variancePct = systemTotal > 0 ? (varianceAmount / systemTotal) : 0;

  console.log("[approvalExporter] REPORT", {
    detectionUsed,
    sheet: keepName,
    headerMap: hm,
    itemNoCol,
    expectedPriced: pricedItems.length,
    injected: rowItemMap.size,
    missing_in_excel: unmatched.map(i => i.item_no),
    systemTotal,
    exportedTotal: injectedSum,
    variancePct: (variancePct * 100).toFixed(3) + "%",
    warning: variancePct > 0.005 ? "VARIANCE > 0.5%" : null,
  });

  // Hard fail if variance too high or items unmatched
  if (unmatched.length > 0 || variancePct > 0.005) {
    throw new Error(
      `فشل تصدير الاعتماد: مطابقة ${rowItemMap.size}/${pricedItems.length} — الإجمالي ${systemTotal.toLocaleString("ar-SA")} ر.س مقابل ${injectedSum.toLocaleString("ar-SA")} ر.س (انحراف ${(variancePct * 100).toFixed(2)}%)` +
      (unmatched.length ? ` — غير مربوط: ${unmatched.slice(0, 10).map(i => i.item_no).join(", ")}` : "")
    );
  }

  // 9. Generate + download
  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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

  const fmt = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });
  toast({
    title: "تم تصدير ملف الاعتماد بنجاح",
    description: `✅ ${rowItemMap.size} بند | الإجمالي ${fmt(injectedSum)} ر.س | الورقة: ${keepName}`,
  });
}

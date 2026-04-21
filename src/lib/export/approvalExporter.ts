/**
 * Approval Exporter V5 — Library-only, formula-preserving, multi-sheet.
 *
 * Pipeline:
 *   1. Download original .xlsx from Supabase Storage
 *   2. Load with ExcelJS (preserves formatting, merged cells, styles, formulas)
 *   3. Detect header columns on EVERY worksheet (Arabic-aware)
 *   4. Build a workbook-wide row map: best row per (item_no | description) across ALL sheets
 *   5. Inject ONLY into unitRateCol — never touch the total column (keeps original formula)
 *   6. Keep ALL worksheets — never remove any sheet
 *   7. Validate: count + missing + variance computed against system unit_rate * qty
 *   8. Download
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

const COL_FALLBACK = {
  ITEM_NO: 3,
  DESC: 4,
  QTY: 6,
  UNIT_PRICE: 7,
  TOTAL: 9,
  HEADER_ROW: 7,
};

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
    .replace(/^0+(?=\d)/, "")  // strip leading zeros for code matching
    .trim()
    .toLowerCase();
}

function normalizeDesc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
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
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: any) => r.text ?? "").join("");
    }
    if ("text" in v) return String((v as any).text ?? "");
    if ("result" in v && (v as any).result != null) return String((v as any).result ?? "");
    if ("formula" in v) return String((v as any).formula ?? "");
  }
  return String(v);
}

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

function applyFallback(hm: HeaderMap): HeaderMap {
  if (hm.descCol !== null && hm.unitRateCol !== null) return hm;
  return {
    headerRow: hm.headerRow || COL_FALLBACK.HEADER_ROW,
    itemNoCol: hm.itemNoCol ?? COL_FALLBACK.ITEM_NO,
    descCol: hm.descCol ?? COL_FALLBACK.DESC,
    qtyCol: hm.qtyCol ?? COL_FALLBACK.QTY,
    unitRateCol: hm.unitRateCol ?? COL_FALLBACK.UNIT_PRICE,
    totalCol: hm.totalCol ?? COL_FALLBACK.TOTAL,
  };
}

function inferItemNoCol(ws: ExcelJS.Worksheet, hm: HeaderMap, items: ApprovalItem[]): { col: number | null; matches: number } {
  const pricedItemNos = new Set(items.map(i => normalizeItemNo(i.item_no)).filter(Boolean));
  if (pricedItemNos.size === 0) return { col: hm.itemNoCol, matches: 0 };

  const scores = new Map<number, number>();
  const lastRow = ws.actualRowCount || ws.rowCount || 0;
  for (let r = (hm.headerRow || 0) + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
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

interface SheetContext {
  ws: ExcelJS.Worksheet;
  hm: HeaderMap;
  itemNoCol: number | null;
  itemNoQueues: Map<string, number[]>;
  rowDescNorm: Map<number, string>;
  rowFullTextNorm: Map<number, string>;
}

function buildSheetContext(ws: ExcelJS.Worksheet, items: ApprovalItem[]): SheetContext | null {
  const hmRaw = detectHeaderMap(ws);
  const hm = applyFallback(hmRaw);
  if (hm.unitRateCol === null) return null;

  const detection = inferItemNoCol(ws, hm, items);
  const itemNoCol = detection.col;

  const itemNoQueues = new Map<string, number[]>();
  const rowDescNorm = new Map<number, string>();
  const rowFullTextNorm = new Map<number, string>();
  const lastRow = ws.actualRowCount || ws.rowCount || 0;

  for (let r = (hm.headerRow || 0) + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    if (hm.qtyCol !== null) {
      const qtyText = cellText(row.getCell(hm.qtyCol));
      const qtyNum = parseFloat(digitsToAscii(qtyText).replace(/,/g, "").trim());
      if (!isFinite(qtyNum) || qtyNum <= 0) continue;
    }
    if (itemNoCol !== null) {
      const key = normalizeItemNo(cellText(row.getCell(itemNoCol)));
      if (key) {
        const q = itemNoQueues.get(key) ?? [];
        q.push(r);
        itemNoQueues.set(key, q);
      }
    }
    const descText = hm.descCol !== null ? cellText(row.getCell(hm.descCol)) : "";
    rowDescNorm.set(r, normalizeDesc(descText));
    let full = "";
    row.eachCell({ includeEmpty: false }, c => { full += " " + cellText(c); });
    rowFullTextNorm.set(r, normalizeDesc(full));
  }

  return { ws, hm, itemNoCol, itemNoQueues, rowDescNorm, rowFullTextNorm };
}

interface Hit { sheet: SheetContext; row: number; mode: "item_no" | "desc_exact" | "desc_contains"; }

function findRowAcrossWorkbook(
  item: ApprovalItem,
  sheets: SheetContext[],
  usedKeys: Set<string>,
): Hit | null {
  const keyOf = (s: SheetContext, r: number) => `${s.ws.id}:${r}`;
  const itemKey = normalizeItemNo(item.item_no);

  // Pass 1 — item_no exact, across all sheets
  if (itemKey) {
    for (const sheet of sheets) {
      const q = sheet.itemNoQueues.get(itemKey);
      if (!q || q.length === 0) continue;
      for (let i = 0; i < q.length; i++) {
        const r = q[i];
        if (!usedKeys.has(keyOf(sheet, r))) {
          q.splice(i, 1);
          return { sheet, row: r, mode: "item_no" };
        }
      }
    }
  }

  const candidates: string[] = [];
  if (item.description) candidates.push(normalizeDesc(item.description));
  const itemAsDesc = normalizeDesc(item.item_no);
  if (itemAsDesc.length > 3) candidates.push(itemAsDesc);

  // Pass 2 — exact description match
  for (const cand of candidates) {
    if (!cand || cand.length < 4) continue;
    for (const sheet of sheets) {
      for (const [r, dn] of sheet.rowDescNorm) {
        if (usedKeys.has(keyOf(sheet, r))) continue;
        if (dn && dn === cand) return { sheet, row: r, mode: "desc_exact" };
      }
    }
  }

  // Pass 3 — containment in full row text
  for (const cand of candidates) {
    if (!cand || cand.length < 4) continue;
    for (const sheet of sheets) {
      for (const [r, ft] of sheet.rowFullTextNorm) {
        if (usedKeys.has(keyOf(sheet, r)) || !ft) continue;
        const a = cand;
        const b = ft;
        if (a.length <= b.length && b.includes(a) && a.length >= 4) {
          return { sheet, row: r, mode: "desc_contains" };
        }
        if (b.length < a.length && a.includes(b) && b.length >= 4) {
          return { sheet, row: r, mode: "desc_contains" };
        }
      }
    }
  }

  return null;
}

export async function exportApproval(
  boqFileId: string,
  items: ApprovalItem[],
  originalFilePath: string,
  originalFileName: string,
): Promise<void> {
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("boq-files")
    .download(originalFilePath);
  if (dlErr || !fileData) throw new Error("تعذر تحميل الملف الأصلي من التخزين");

  const buffer = await fileData.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const pricedItems = items.filter(i =>
    i.unit_rate != null &&
    i.unit_rate > 0 &&
    typeof i.quantity === "number" &&
    i.quantity > 0 &&
    i.status !== "descriptive",
  );

  // Build context for every sheet that has a unit-rate column
  const sheets: SheetContext[] = [];
  wb.eachSheet(ws => {
    const ctx = buildSheetContext(ws, pricedItems);
    if (ctx) sheets.push(ctx);
  });

  if (sheets.length === 0) {
    throw new Error("تعذر العثور على عمود سعر الوحدة في أي ورقة من الملف الأصلي");
  }

  // Workbook-wide matching
  const usedKeys = new Set<string>();
  const hits: { item: ApprovalItem; hit: Hit }[] = [];
  const unmatched: ApprovalItem[] = [];
  const matchModes = { item_no: 0, desc_exact: 0, desc_contains: 0 };

  for (const item of pricedItems) {
    const hit = findRowAcrossWorkbook(item, sheets, usedKeys);
    if (hit) {
      usedKeys.add(`${hit.sheet.ws.id}:${hit.row}`);
      hits.push({ item, hit });
      matchModes[hit.mode]++;
    } else {
      unmatched.push(item);
    }
  }

  // Diagnostic probe for unmatched items
  if (unmatched.length > 0) {
    const probe: Record<string, string[]> = {};
    for (const u of unmatched) {
      const target = normalizeItemNo(u.item_no);
      const targetDesc = normalizeDesc(u.description);
      const hitsArr: string[] = [];
      wb.eachSheet(sheet => {
        const last = sheet.actualRowCount || sheet.rowCount || 0;
        for (let r = 1; r <= last; r++) {
          sheet.getRow(r).eachCell({ includeEmpty: false }, c => {
            const t = cellText(c);
            if (!t) return;
            if (target && normalizeItemNo(t) === target) {
              hitsArr.push(`${sheet.name}!${c.address} [item_no] = "${t.slice(0, 60)}"`);
            } else if (targetDesc && targetDesc.length >= 6 && normalizeDesc(t).includes(targetDesc.slice(0, 30))) {
              hitsArr.push(`${sheet.name}!${c.address} [desc~] = "${t.slice(0, 60)}"`);
            }
          });
        }
      });
      probe[String(u.item_no ?? "?")] = hitsArr.length ? hitsArr.slice(0, 6) : ["NOT FOUND ANYWHERE IN WORKBOOK"];
    }
    console.warn("[approvalExporter] PROBE missing items", probe);
  }

  // INJECT — only into unitRateCol. Never touch the total column.
  const injectedItemNos: string[] = [];
  let injectedSum = 0;
  for (const { item, hit } of hits) {
    const { sheet, row: rowNum } = hit;
    const row = sheet.ws.getRow(rowNum);
    if (sheet.hm.unitRateCol !== null) {
      const cell = row.getCell(sheet.hm.unitRateCol);
      // Plain numeric value — let any existing total formula recompute naturally
      cell.value = item.unit_rate;
    }
    row.commit();

    const qty = (item.quantity ?? 0) as number;
    injectedSum += (item.unit_rate ?? 0) * qty;
    injectedItemNos.push(String(item.item_no ?? "?"));
  }
  injectedSum = roundCurrency(injectedSum);

  // System-wide system total (for reporting only)
  const systemTotal = roundCurrency(items.reduce((sum, item) => {
    const q = typeof item.quantity === "number" ? item.quantity : 0;
    if (q > 0 && item.unit_rate != null && item.unit_rate > 0) {
      return sum + item.unit_rate * q;
    }
    return sum;
  }, 0));

  const matchedSystemTotal = roundCurrency(
    hits.reduce((sum, { item }) => {
      const q = (item.quantity ?? 0) as number;
      return sum + (item.unit_rate ?? 0) * q;
    }, 0)
  );

  const variance = systemTotal > 0 ? Math.abs(systemTotal - injectedSum) / systemTotal : 0;

  console.log("[approvalExporter] REPORT", {
    boqFileId,
    sheets: sheets.map(s => ({ name: s.ws.name, hm: s.hm, itemNoCol: s.itemNoCol })),
    matchModes,
    expectedPriced: pricedItems.length,
    injected: hits.length,
    missing_count: unmatched.length,
    missing_in_excel: unmatched.map(i => i.item_no),
    systemTotal,
    matchedSystemTotal,
    injectedSum,
    variancePct: (variance * 100).toFixed(3) + "%",
  });

  if (hits.length === 0) {
    throw new Error("فشل تصدير الاعتماد: لم يتم مطابقة أي بند في الملف الأصلي");
  }

  // Write — formulas preserved, all sheets kept
  let outBuffer: ArrayBuffer;
  try {
    outBuffer = await wb.xlsx.writeBuffer();
  } catch (error) {
    console.error("[approvalExporter] writeBuffer failed", error);
    throw new Error("تعذر إنتاج الملف النهائي — قد يحتوي الملف الأصلي على معادلات تالفة");
  }

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
  if (unmatched.length > 0) {
    toast({
      title: "تم التصدير مع تنبيهات",
      description: `✅ ${hits.length}/${pricedItems.length} بند | غير موجود بالملف الأصلي: ${unmatched.length} | الإجمالي ${fmt(injectedSum)} ر.س`,
    });
  } else {
    toast({
      title: "تم تصدير ملف الاعتماد بنجاح",
      description: `✅ ${hits.length} بند | الإجمالي ${fmt(injectedSum)} ر.س`,
    });
  }
}

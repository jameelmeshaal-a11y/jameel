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
 *   7. Validate exported total against matched system total
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

function isFormulaLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && (
    "formula" in (value as Record<string, unknown>) ||
    "sharedFormula" in (value as Record<string, unknown>) ||
    "arrayFormula" in (value as Record<string, unknown>)
  );
}

function coerceDisplayedCellValue(text: string): string | number | boolean | Date | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  if (trimmed === "TRUE") return true;
  if (trimmed === "FALSE") return false;

  const normalizedNumeric = digitsToAscii(trimmed)
    .replace(/[٬,]/g, "")
    .replace(/[−–—]/g, "-");
  const asNumber = Number(normalizedNumeric);
  if (Number.isFinite(asNumber)) return asNumber;

  return trimmed;
}

function materializeWorksheetFormulas(ws: ExcelJS.Worksheet): { converted: number; unresolved: string[] } {
  let converted = 0;
  const unresolved: string[] = [];

  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const raw = cell.value as unknown;
      if (!isFormulaLike(raw)) return;

      const formulaValue = raw as Record<string, unknown>;
      if (formulaValue.result !== undefined && formulaValue.result !== null) {
        cell.value = formulaValue.result as ExcelJS.CellValue;
        converted++;
        return;
      }

      const displayed = cellText(cell);
      const coerced = coerceDisplayedCellValue(displayed);
      cell.value = coerced as ExcelJS.CellValue;
      converted++;
      if (coerced === null) unresolved.push(cell.address);
    });
  });

  return { converted, unresolved };
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
    if (m > bestMatches) {
      bestCol = col;
      bestMatches = m;
    }
  }

  return { col: bestCol, matches: bestMatches };
}

function buildRowItemMap(
  ws: ExcelJS.Worksheet,
  hm: HeaderMap,
  pricedItems: ApprovalItem[],
): { map: Map<number, ApprovalItem>; unmatched: ApprovalItem[]; itemNoCol: number | null; matchModes: Record<string, number> } {
  const map = new Map<number, ApprovalItem>();
  const usedRows = new Set<number>();
  const matchModes = { item_no: 0, desc_exact: 0, desc_contains: 0 };
  const detection = inferItemNoCol(ws, hm, pricedItems);
  const itemNoCol = detection.col;

  const lastRow = ws.actualRowCount || ws.rowCount || 0;
  const itemNoQueues = new Map<string, number[]>();
  const rowDescNorm = new Map<number, string>();
  const rowFullTextNorm = new Map<number, string>();

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
    row.eachCell({ includeEmpty: false }, c => {
      full += " " + cellText(c);
    });
    rowFullTextNorm.set(r, normalizeDesc(full));
  }

  const remaining: ApprovalItem[] = [];
  for (const item of pricedItems) {
    const key = normalizeItemNo(item.item_no);
    if (key) {
      const q = itemNoQueues.get(key);
      const matchedRow = q?.shift();
      if (matchedRow && !usedRows.has(matchedRow)) {
        map.set(matchedRow, item);
        usedRows.add(matchedRow);
        matchModes.item_no++;
        continue;
      }
    }
    remaining.push(item);
  }

  const unmatched: ApprovalItem[] = [];
  for (const item of remaining) {
    const candidates: string[] = [];
    if (item.description) candidates.push(normalizeDesc(item.description));
    const itemNoAsDesc = normalizeDesc(item.item_no);
    if (itemNoAsDesc.length > 3) candidates.push(itemNoAsDesc);

    let matchedRow: number | null = null;
    let matchMode: "desc_exact" | "desc_contains" | null = null;

    for (const cand of candidates) {
      if (!cand || cand.length < 4) continue;
      for (const [r, dn] of rowDescNorm) {
        if (usedRows.has(r)) continue;
        if (dn && dn === cand) {
          matchedRow = r;
          matchMode = "desc_exact";
          break;
        }
      }
      if (matchedRow) break;
    }

    if (!matchedRow) {
      for (const cand of candidates) {
        if (!cand || cand.length < 4) continue;
        for (const [r, ft] of rowFullTextNorm) {
          if (usedRows.has(r) || !ft) continue;
          const a = cand;
          const b = ft;
          if (a.length <= b.length && b.includes(a) && a.length >= 4) {
            matchedRow = r;
            matchMode = "desc_contains";
            break;
          }
          if (b.length < a.length && a.includes(b) && b.length >= 4) {
            matchedRow = r;
            matchMode = "desc_contains";
            break;
          }
        }
        if (matchedRow) break;
      }
    }

    if (matchedRow && matchMode) {
      map.set(matchedRow, item);
      usedRows.add(matchedRow);
      matchModes[matchMode]++;
    } else {
      unmatched.push(item);
    }
  }

  return { map, unmatched, itemNoCol, matchModes };
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

  let bestWs: ExcelJS.Worksheet | null = null;
  let bestHm: HeaderMap | null = null;
  let bestScore = -1;

  wb.eachSheet(sheet => {
    const hmRaw = detectHeaderMap(sheet);
    const hm = applyFallback(hmRaw);
    const det = inferItemNoCol(sheet, hm, pricedItems);
    const hasPrice = hm.unitRateCol !== null || hm.totalCol !== null;
    const score = (hasPrice ? 100000 : 0) + det.matches;
    if (score > bestScore) {
      bestScore = score;
      bestWs = sheet;
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

  const { map: rowItemMap, unmatched, itemNoCol, matchModes } = buildRowItemMap(ws, hm, pricedItems);

  if (unmatched.length > 0) {
    const probe: Record<string, string[]> = {};
    for (const u of unmatched) {
      const target = normalizeItemNo(u.item_no);
      const targetDesc = normalizeDesc(u.description);
      const targetItemAsDesc = normalizeDesc(u.item_no);
      const hits: string[] = [];
      wb.eachSheet(sheet => {
        const last = sheet.actualRowCount || sheet.rowCount || 0;
        for (let r = 1; r <= last; r++) {
          sheet.getRow(r).eachCell({ includeEmpty: false }, c => {
            const t = cellText(c);
            if (!t) return;
            if (target && normalizeItemNo(t) === target) {
              hits.push(`${sheet.name}!${c.address} [item_no exact] = "${t.slice(0, 60)}"`);
            } else if (targetDesc && targetDesc.length >= 4 && normalizeDesc(t).includes(targetDesc)) {
              hits.push(`${sheet.name}!${c.address} [desc contains] = "${t.slice(0, 60)}"`);
            } else if (targetItemAsDesc && targetItemAsDesc.length >= 4 && normalizeDesc(t).includes(targetItemAsDesc)) {
              hits.push(`${sheet.name}!${c.address} [item_no-as-desc] = "${t.slice(0, 60)}"`);
            }
          });
        }
      });
      probe[String(u.item_no ?? "?")] = hits.length ? hits.slice(0, 8) : ["NOT FOUND ANYWHERE IN WORKBOOK"];
    }
    console.warn("[approvalExporter] PROBE missing items", probe);
  }

  const formulaPrep = materializeWorksheetFormulas(ws);
  console.log("[approvalExporter] FORMULA_PREP", {
    converted: formulaPrep.converted,
    unresolved: formulaPrep.unresolved.slice(0, 20),
  });

  let injectedSum = 0;
  const injectedItemNos: string[] = [];
  for (const [rowNum, item] of rowItemMap) {
    const row = ws.getRow(rowNum);
    if (hm.unitRateCol !== null) {
      row.getCell(hm.unitRateCol).value = item.unit_rate;
    }

    const qty = (item.quantity ?? 0) as number;
    const totalVal = item.total_price != null && item.total_price > 0
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

  console.debug("[approvalExporter] INJECTED item_no list", {
    count: injectedItemNos.length,
    item_nos: injectedItemNos,
  });

  const keepName = ws.name;
  const toRemove: string[] = [];
  wb.eachSheet(sheet => {
    if (sheet.name !== keepName) toRemove.push(sheet.name);
  });
  for (const name of toRemove) {
    const sheet = wb.getWorksheet(name);
    if (sheet) wb.removeWorksheet(sheet.id);
  }

  const systemTotal = roundCurrency(items.reduce((sum, item) => {
    const q = typeof item.quantity === "number" ? item.quantity : 0;
    if (q > 0 && item.unit_rate != null && item.unit_rate > 0) {
      return sum + (item.total_price != null && item.total_price > 0 ? item.total_price : item.unit_rate * q);
    }
    return sum;
  }, 0));

  const matchedSystemTotal = roundCurrency(
    Array.from(rowItemMap.values()).reduce((sum, item) => {
      const q = (item.quantity ?? 0) as number;
      return sum + (item.total_price != null && item.total_price > 0 ? item.total_price : (item.unit_rate ?? 0) * q);
    }, 0)
  );

  const varianceAmount = roundCurrency(Math.abs(systemTotal - injectedSum));
  const variancePct = systemTotal > 0 ? varianceAmount / systemTotal : 0;
  const matchedVarianceAmount = roundCurrency(Math.abs(matchedSystemTotal - injectedSum));
  const matchedVariancePct = matchedSystemTotal > 0 ? matchedVarianceAmount / matchedSystemTotal : 0;

  const HARD_MISSING_LIMIT = 5;
  const HARD_VARIANCE_LIMIT = 0.05;
  const SOFT_VARIANCE_WARN = 0.005;

  console.log("[approvalExporter] REPORT", {
    boqFileId,
    detectionUsed,
    sheet: keepName,
    headerMap: hm,
    itemNoCol,
    matchModes,
    expectedPriced: pricedItems.length,
    injected: rowItemMap.size,
    missing_count: unmatched.length,
    missing_in_excel: unmatched.map(i => i.item_no),
    systemTotal,
    matchedSystemTotal,
    exportedTotal: injectedSum,
    overallVariancePct: (variancePct * 100).toFixed(3) + "%",
    matchedVariancePct: (matchedVariancePct * 100).toFixed(3) + "%",
    warning: matchedVariancePct > SOFT_VARIANCE_WARN ? "MATCHED VARIANCE > 0.5%" : null,
  });

  if (unmatched.length > HARD_MISSING_LIMIT || matchedVariancePct > HARD_VARIANCE_LIMIT) {
    throw new Error(
      `فشل تصدير الاعتماد: مطابقة ${rowItemMap.size}/${pricedItems.length} — انحراف على المربوط ${(matchedVariancePct * 100).toFixed(2)}%` +
      (unmatched.length ? ` — غير مربوط (${unmatched.length}): ${unmatched.slice(0, 10).map(i => i.item_no).join("، ")}` : "")
    );
  }

  if (unmatched.length > 0 || matchedVariancePct > SOFT_VARIANCE_WARN) {
    console.warn("[approvalExporter] MINOR ISSUES — proceeding with download", {
      missing: unmatched.map(i => i.item_no),
      matchedVariancePct: (matchedVariancePct * 100).toFixed(3) + "%",
    });
  }

  let outBuffer: ArrayBuffer;
  try {
    outBuffer = await wb.xlsx.writeBuffer();
  } catch (error) {
    console.warn("[approvalExporter] writeBuffer failed — retrying after aggressive formula materialization", error);
    const retryPrep = materializeWorksheetFormulas(ws);
    console.warn("[approvalExporter] FORMULA_PREP_RETRY", {
      converted: retryPrep.converted,
      unresolved: retryPrep.unresolved.slice(0, 20),
    });
    outBuffer = await wb.xlsx.writeBuffer();
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
      description: `✅ ${rowItemMap.size}/${pricedItems.length} بند | غير مربوط: ${unmatched.map(i => i.item_no).join("، ")} | الإجمالي ${fmt(injectedSum)} ر.س`,
    });
    return;
  }

  toast({
    title: "تم تصدير ملف الاعتماد بنجاح",
    description: `✅ ${rowItemMap.size} بند | الإجمالي ${fmt(injectedSum)} ر.س | الورقة: ${keepName}`,
  });
}

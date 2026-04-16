/**
 * Pricing Integrity Checker — validates all priced BoQ items against
 * the approved rate library and detects inconsistencies.
 */

import { supabase } from "@/integrations/supabase/client";
import { detectCategory } from "./categoryDetector";
import { getCostModel } from "./costModels";

// ─── Types ──────────────────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "warning";
export type IssueType =
  | "rate_deviation"      // unit_rate ≠ target_rate × location_factor
  | "breakdown_mismatch"  // sum of components ≠ unit_rate
  | "low_confidence"      // confidence 50-69%
  | "zero_price"          // unit_rate = 0 on priceable item
  | "zero_breakdown";     // materials+labor+equipment+logistics = 0 with price > 0

export type FixAction = "reprice" | "redistribute" | "unlink" | "manual";

export interface IntegrityIssue {
  itemId: string;
  itemNo: string;
  description: string;
  issueType: IssueType;
  severity: IssueSeverity;
  currentValue: number;
  expectedValue: number;
  detail: string;
  fixAction: FixAction;
  linkedRateId: string | null;
}

export interface IntegrityReport {
  passed: boolean;
  totalChecked: number;
  healthyCount: number;
  issues: IntegrityIssue[];
  summary: {
    critical: number;
    warning: number;
    byType: Record<IssueType, number>;
    totalDeviation: number; // SAR
  };
}

// ─── Main Check ─────────────────────────────────────────────────────────────

export async function runIntegrityCheck(boqFileId: string): Promise<IntegrityReport> {
  // Fetch items + linked library entries in parallel
  const [itemsRes, libraryRes, boqFileRes] = await Promise.all([
    supabase
      .from("boq_items")
      .select("*")
      .eq("boq_file_id", boqFileId)
      .order("row_index", { ascending: true }),
    supabase.from("rate_library").select("*"),
    supabase.from("boq_files").select("location_factor").eq("id", boqFileId).single(),
  ]);

  const items = itemsRes.data || [];
  const library = libraryRes.data || [];
  const boqLocFactor = boqFileRes.data?.location_factor ?? 1.0;

  // Build library lookup
  const libMap = new Map(library.map(l => [l.id, l]));

  const issues: IntegrityIssue[] = [];
  let healthyCount = 0;
  let totalDeviation = 0;

  // Only check priceable items (has quantity > 0 and has a price or should have one)
  const priceableItems = items.filter(i =>
    i.quantity > 0 && i.status !== "descriptive"
  );

  for (const item of priceableItems) {
    const itemIssues: IntegrityIssue[] = [];

    // ── Check 1: Rate deviation from library ──
    if (item.linked_rate_id && item.unit_rate && item.unit_rate > 0) {
      const lib = libMap.get(item.linked_rate_id);
      if (lib) {
        const expectedRate = +(lib.target_rate * (item.location_factor || 1.0)).toFixed(2);
        const deviation = Math.abs(item.unit_rate - expectedRate);
        // Allow 0.02 SAR tolerance for rounding
        if (deviation > 0.02 && !item.override_type) {
          itemIssues.push({
            itemId: item.id,
            itemNo: item.item_no,
            description: item.description,
            issueType: "rate_deviation",
            severity: "critical",
            currentValue: item.unit_rate,
            expectedValue: expectedRate,
            detail: `سعر الوحدة ${item.unit_rate} ≠ سعر المكتبة ${expectedRate} (فرق: ${deviation.toFixed(2)} ريال)`,
            fixAction: "reprice",
            linkedRateId: item.linked_rate_id,
          });
          totalDeviation += deviation * item.quantity;
        }
      }
    }

    // ── Check 2: Breakdown sum ≠ unit_rate ──
    if (item.unit_rate && item.unit_rate > 0) {
      const componentSum = +(
        (item.materials || 0) + (item.labor || 0) + (item.equipment || 0) +
        (item.logistics || 0) + (item.risk || 0) + (item.profit || 0)
      ).toFixed(2);
      const breakdownDiff = Math.abs(componentSum - item.unit_rate);
      if (breakdownDiff > 0.05) {
        itemIssues.push({
          itemId: item.id,
          itemNo: item.item_no,
          description: item.description,
          issueType: "breakdown_mismatch",
          severity: "warning",
          currentValue: componentSum,
          expectedValue: item.unit_rate,
          detail: `مجموع التوزيع ${componentSum} ≠ سعر الوحدة ${item.unit_rate} (فرق: ${breakdownDiff.toFixed(2)})`,
          fixAction: "redistribute",
          linkedRateId: item.linked_rate_id,
        });
      }
    }

    // ── Check 3: Low confidence match ──
    if (item.confidence && item.confidence >= 50 && item.confidence < 70 && item.linked_rate_id) {
      itemIssues.push({
        itemId: item.id,
        itemNo: item.item_no,
        description: item.description,
        issueType: "low_confidence",
        severity: "warning",
        currentValue: item.confidence,
        expectedValue: 70,
        detail: `نسبة تطابق ${item.confidence}% — قد يكون مطابقاً لبند خاطئ`,
        fixAction: "manual",
        linkedRateId: item.linked_rate_id,
      });
    }

    // ── Check 4: Zero price on priceable item ──
    if ((!item.unit_rate || item.unit_rate === 0) && item.status !== "unmatched") {
      itemIssues.push({
        itemId: item.id,
        itemNo: item.item_no,
        description: item.description,
        issueType: "zero_price",
        severity: "critical",
        currentValue: 0,
        expectedValue: -1, // unknown
        detail: `بند بدون سعر رغم أنه قابل للتسعير`,
        fixAction: "reprice",
        linkedRateId: item.linked_rate_id,
      });
    }

    // ── Check 5: Zero breakdown with price > 0 ──
    if (item.unit_rate && item.unit_rate > 0) {
      const costComponents = (item.materials || 0) + (item.labor || 0) +
        (item.equipment || 0) + (item.logistics || 0);
      if (costComponents === 0) {
        itemIssues.push({
          itemId: item.id,
          itemNo: item.item_no,
          description: item.description,
          issueType: "zero_breakdown",
          severity: "warning",
          currentValue: 0,
          expectedValue: item.unit_rate,
          detail: `مواد + عمالة + معدات + نقل = 0 رغم وجود سعر ${item.unit_rate}`,
          fixAction: "redistribute",
          linkedRateId: item.linked_rate_id,
        });
      }
    }

    if (itemIssues.length === 0 && item.unit_rate && item.unit_rate > 0) {
      healthyCount++;
    }
    issues.push(...itemIssues);
  }

  // Build summary
  const byType: Record<IssueType, number> = {
    rate_deviation: 0,
    breakdown_mismatch: 0,
    low_confidence: 0,
    zero_price: 0,
    zero_breakdown: 0,
  };
  let critical = 0;
  let warning = 0;
  for (const issue of issues) {
    byType[issue.issueType]++;
    if (issue.severity === "critical") critical++;
    else warning++;
  }

  return {
    passed: critical === 0,
    totalChecked: priceableItems.length,
    healthyCount,
    issues,
    summary: { critical, warning, byType, totalDeviation },
  };
}

// ─── Fix Functions ──────────────────────────────────────────────────────────

/**
 * Fix a single issue or a batch of issues of the same type.
 */
export async function fixIntegrityIssues(
  issues: IntegrityIssue[],
  boqFileId: string,
): Promise<{ fixed: number; failed: number }> {
  let fixed = 0;
  let failed = 0;

  // Load library for reprice/redistribute actions
  const { data: library } = await supabase.from("rate_library").select("*");
  const libMap = new Map((library || []).map(l => [l.id, l]));

  // Load items for context
  const { data: items } = await supabase
    .from("boq_items")
    .select("*")
    .eq("boq_file_id", boqFileId);
  const itemMap = new Map((items || []).map(i => [i.id, i]));

  for (const issue of issues) {
    try {
      const item = itemMap.get(issue.itemId);
      if (!item) { failed++; continue; }

      if (issue.fixAction === "reprice" && issue.linkedRateId) {
        const lib = libMap.get(issue.linkedRateId);
        if (!lib) { failed++; continue; }

        const locFactor = item.location_factor || 1.0;
        const adjustedRate = +(lib.target_rate * locFactor).toFixed(2);

        // Redistribute using category-based logic
        const breakdown = calculateBreakdown(adjustedRate, lib, item);

        await supabase.from("boq_items").update({
          unit_rate: adjustedRate,
          total_price: +(adjustedRate * item.quantity).toFixed(2),
          ...breakdown,
        }).eq("id", item.id);

        fixed++;
      } else if (issue.fixAction === "redistribute") {
        const unitRate = item.unit_rate || 0;
        if (unitRate <= 0) { failed++; continue; }

        const lib = issue.linkedRateId ? libMap.get(issue.linkedRateId) : null;
        const breakdown = calculateBreakdown(unitRate, lib, item);

        await supabase.from("boq_items").update(breakdown).eq("id", item.id);
        fixed++;
      } else if (issue.fixAction === "unlink") {
        await supabase.from("boq_items").update({
          linked_rate_id: null,
          unit_rate: null,
          total_price: null,
          materials: null, labor: null, equipment: null,
          logistics: null, risk: null, profit: null,
          confidence: null,
          source: null,
          status: "unmatched",
        }).eq("id", item.id);
        fixed++;
      } else {
        // manual — skip
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Recalculate project total
  const { data: boqFile } = await supabase
    .from("boq_files")
    .select("project_id")
    .eq("id", boqFileId)
    .single();
  if (boqFile) {
    await supabase.rpc("recalculate_project_total", { p_project_id: boqFile.project_id });
  }

  return { fixed, failed };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateBreakdown(
  unitRate: number,
  lib: any | null,
  item: any,
): { materials: number; labor: number; equipment: number; logistics: number; risk: number; profit: number } {
  // Check library percentages
  const costPctSum = lib
    ? (lib.materials_pct || 0) + (lib.labor_pct || 0) + (lib.equipment_pct || 0) + (lib.logistics_pct || 0)
    : 0;
  const totalPct = costPctSum + (lib?.risk_pct || 0) + (lib?.profit_pct || 0);

  let materials: number, labor: number, equipment: number, logistics: number, risk: number, profit: number;

  if (costPctSum > 0 && totalPct > 0 && lib) {
    materials = +(unitRate * lib.materials_pct / totalPct).toFixed(2);
    labor     = +(unitRate * lib.labor_pct / totalPct).toFixed(2);
    equipment = +(unitRate * lib.equipment_pct / totalPct).toFixed(2);
    logistics = +(unitRate * lib.logistics_pct / totalPct).toFixed(2);
    risk      = +(unitRate * lib.risk_pct / totalPct).toFixed(2);
    profit    = +(unitRate * lib.profit_pct / totalPct).toFixed(2);
  } else {
    // Category-based smart distribution
    const riskPct = lib?.risk_pct || 3;
    const profitPct = lib?.profit_pct || 5;

    risk   = +(unitRate * riskPct / 100).toFixed(2);
    profit = +(unitRate * profitPct / 100).toFixed(2);

    const costPool = +(unitRate - risk - profit).toFixed(2);

    const detection = detectCategory(item.description || "", item.description_en || "");
    const model = getCostModel(detection.category);
    const bd = model.breakdown;

    const matAvg = (bd.materials[0] + bd.materials[1]) / 2;
    const labAvg = (bd.labor[0] + bd.labor[1]) / 2;
    const eqAvg  = (bd.equipment[0] + bd.equipment[1]) / 2;
    const logAvg = (bd.logistics[0] + bd.logistics[1]) / 2;
    const totalWeight = matAvg + labAvg + eqAvg + logAvg;

    if (totalWeight > 0) {
      materials = +(costPool * matAvg / totalWeight).toFixed(2);
      labor     = +(costPool * labAvg / totalWeight).toFixed(2);
      equipment = +(costPool * eqAvg / totalWeight).toFixed(2);
      logistics = +(costPool * logAvg / totalWeight).toFixed(2);
    } else {
      materials = costPool;
      labor = 0; equipment = 0; logistics = 0;
    }
  }

  // Rounding correction
  const sum = +(materials + labor + equipment + logistics + risk + profit).toFixed(2);
  const diff = +(unitRate - sum).toFixed(2);
  if (diff !== 0) materials = +(materials + diff).toFixed(2);

  return { materials, labor, equipment, logistics, risk, profit };
}

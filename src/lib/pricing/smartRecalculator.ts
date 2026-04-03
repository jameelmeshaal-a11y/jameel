/**
 * Smart recalculation engine for price breakdown adjustments.
 * When a user edits one cost component (e.g. Materials), this engine
 * recalculates all other components using category-specific ratios
 * from cost models. Materials DRIVES the cost — total is recalculated, not fixed.
 */

import type { ItemCategory } from "./categoryDetector";
import { getCostModel } from "./costModels";

export interface BreakdownValues {
  materials: number;
  labor: number;
  equipment: number;
  logistics: number;
  risk: number;
  profit: number;
}

export type BreakdownField = keyof BreakdownValues;

const COST_FIELDS: BreakdownField[] = ["materials", "labor", "equipment", "logistics"];
const OVERHEAD_FIELDS: BreakdownField[] = ["risk", "profit"];

/**
 * Recalculates breakdown when a single field is edited.
 *
 * CORE LOGIC — Materials as cost driver:
 * When a cost field is edited, the OTHER cost fields are recalculated
 * using category-specific ratios relative to the edited field's new value.
 * Risk and Profit are then applied as percentages of the new cost subtotal.
 * Total Price is NEVER held fixed — it is always recalculated.
 *
 * rebalanceAll: scales ALL fields proportionally (used for full rebalance).
 */
export function recalculateBreakdown(
  original: BreakdownValues,
  editedField: BreakdownField,
  newValue: number,
  category: ItemCategory,
  rebalanceAll: boolean = false,
): BreakdownValues {
  const model = getCostModel(category);
  const result = { ...original };
  result[editedField] = newValue;

  if (rebalanceAll) {
    // Full rebalance: scale everything proportionally
    const originalGrand = sumFields(original, [...COST_FIELDS, ...OVERHEAD_FIELDS]);
    if (originalGrand === 0) return result;
    const ratio = newValue / (original[editedField] || 1);
    for (const f of [...COST_FIELDS, ...OVERHEAD_FIELDS]) {
      if (f !== editedField) {
        result[f] = +Math.max(0, original[f] * ratio).toFixed(2);
      }
    }
    return result;
  }

  if (OVERHEAD_FIELDS.includes(editedField)) {
    // Only overhead changed — keep cost fields, just recalculate total
    return result;
  }

  // === COST FIELD CHANGED — Use category ratios to derive other components ===
  const breakdown = model.breakdown;

  // Get midpoint ratios for all cost fields from the category model
  const midRatios: Record<string, number> = {};
  for (const f of COST_FIELDS) {
    const range = breakdown[f as keyof typeof breakdown];
    midRatios[f] = (range[0] + range[1]) / 2;
  }

  // The edited field's ratio tells us what fraction of cost it represents
  const editedRatio = midRatios[editedField];

  if (editedRatio > 0) {
    // Derive the implied total cost from the edited field
    // e.g., if Materials = 500 and materials ratio = 0.50, implied cost = 1000
    const impliedCostTotal = newValue / editedRatio;

    // Calculate other cost fields based on their category ratios
    for (const f of COST_FIELDS) {
      if (f !== editedField) {
        result[f] = +Math.max(0, impliedCostTotal * midRatios[f]).toFixed(2);
      }
    }
  }

  // Recalculate Risk and Profit based on new cost subtotal
  const newCostTotal = sumFields(result, COST_FIELDS);

  // Use model's default risk/profit percentages (typically 3% and 5%)
  const riskPct = model.breakdown.materials ? 0.03 : 0.03; // default
  const profitPct = 0.05; // default

  // Try to preserve original risk/profit ratios if they existed
  const origCost = sumFields(original, COST_FIELDS);
  const origGrand = origCost + original.risk + original.profit;

  let effectiveRiskPct = riskPct;
  let effectiveProfitPct = profitPct;

  if (origGrand > 0 && origCost > 0) {
    effectiveRiskPct = original.risk / origGrand;
    effectiveProfitPct = original.profit / origGrand;
  }

  if (editedField !== "risk") {
    // Risk as % of total (cost / (1 - risk% - profit%))
    const denominator = 1 - effectiveRiskPct - effectiveProfitPct;
    if (denominator > 0) {
      result.risk = +(newCostTotal * effectiveRiskPct / denominator).toFixed(2);
    } else {
      result.risk = +(newCostTotal * riskPct).toFixed(2);
    }
  }
  if (editedField !== "profit") {
    const denominator = 1 - effectiveRiskPct - effectiveProfitPct;
    if (denominator > 0) {
      result.profit = +(newCostTotal * effectiveProfitPct / denominator).toFixed(2);
    } else {
      result.profit = +(newCostTotal * profitPct).toFixed(2);
    }
  }

  // Validation: ensure no field is negative
  for (const f of [...COST_FIELDS, ...OVERHEAD_FIELDS]) {
    if (result[f] < 0) result[f] = 0;
  }

  return result;
}

export function getUnitRate(values: BreakdownValues): number {
  return +(values.materials + values.labor + values.equipment + values.logistics + values.risk + values.profit).toFixed(2);
}

function sumFields(values: BreakdownValues, fields: BreakdownField[]): number {
  return fields.reduce((s, f) => s + (values[f] || 0), 0);
}

/**
 * Detect which fields have been manually overridden compared to auto-calculated values.
 */
export function detectManualOverrides(
  current: BreakdownValues,
  autoCalculated: BreakdownValues,
  threshold: number = 0.01,
): BreakdownField[] {
  const overrides: BreakdownField[] = [];
  for (const f of [...COST_FIELDS, ...OVERHEAD_FIELDS]) {
    if (Math.abs(current[f] - autoCalculated[f]) > threshold) {
      overrides.push(f);
    }
  }
  return overrides;
}

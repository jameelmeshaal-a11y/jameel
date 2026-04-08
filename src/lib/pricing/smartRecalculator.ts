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

// ============================================================
// Total Cost Distribution — Deterministic Workflow
// ============================================================

export type RatioSource = 'current_item' | 'linked_library' | 'ai_generated' | 'none';

export interface RatioResolution {
  ratios: Record<BreakdownField, number>; // normalized to sum=1.0
  source: RatioSource;
  normalized: boolean;
}

const ALL_FIELDS: BreakdownField[] = [...COST_FIELDS, ...OVERHEAD_FIELDS];

/**
 * Resolve ratios from current item's breakdown values.
 * Returns null if all values are zero.
 */
export function resolveRatiosFromValues(values: BreakdownValues): RatioResolution | null {
  const total = sumFields(values, ALL_FIELDS);
  if (total <= 0) return null;

  const ratios = {} as Record<BreakdownField, number>;
  let needsNormalization = false;
  const rawSum = ALL_FIELDS.reduce((s, f) => s + (values[f] || 0), 0);

  for (const f of ALL_FIELDS) {
    ratios[f] = values[f] / total;
  }

  // Check if raw percentages didn't sum to ~100% (relevant for display)
  if (Math.abs(rawSum - total) > 0.01) {
    needsNormalization = true;
  }

  return { ratios, source: 'current_item', normalized: needsNormalization };
}

/**
 * Resolve ratios from rate library percentage columns.
 * Expects values like materials_pct=45 (meaning 45%).
 */
export function resolveRatiosFromLibrary(pcts: {
  materials_pct: number;
  labor_pct: number;
  equipment_pct: number;
  logistics_pct: number;
  risk_pct: number;
  profit_pct: number;
}): RatioResolution | null {
  const rawSum = pcts.materials_pct + pcts.labor_pct + pcts.equipment_pct +
    pcts.logistics_pct + pcts.risk_pct + pcts.profit_pct;

  if (rawSum <= 0) return null;

  const normalized = Math.abs(rawSum - 100) > 0.1;
  const ratios: Record<BreakdownField, number> = {
    materials: pcts.materials_pct / rawSum,
    labor: pcts.labor_pct / rawSum,
    equipment: pcts.equipment_pct / rawSum,
    logistics: pcts.logistics_pct / rawSum,
    risk: pcts.risk_pct / rawSum,
    profit: pcts.profit_pct / rawSum,
  };

  return { ratios, source: 'linked_library', normalized };
}

/**
 * Distribute a total cost across breakdown fields using given ratios.
 * 
 * GUARANTEES:
 * - Sum of all output values === totalCost (exact, after rounding)
 * - Rounding remainder applied to last non-zero component
 * - All values rounded to 2 decimal places
 * - Deterministic — same input always produces same output
 */
export function distributeTotal(
  totalCost: number,
  ratios: Record<BreakdownField, number>,
): BreakdownValues {
  // Normalize ratios to sum to 1.0
  const ratioSum = ALL_FIELDS.reduce((s, f) => s + (ratios[f] || 0), 0);
  const normalizedRatios: Record<string, number> = {};

  if (ratioSum <= 0) {
    // Equal distribution as absolute fallback
    for (const f of ALL_FIELDS) {
      normalizedRatios[f] = 1 / ALL_FIELDS.length;
    }
  } else {
    for (const f of ALL_FIELDS) {
      normalizedRatios[f] = (ratios[f] || 0) / ratioSum;
    }
  }

  // Distribute and round
  const result: BreakdownValues = {
    materials: 0, labor: 0, equipment: 0,
    logistics: 0, risk: 0, profit: 0,
  };

  let runningSum = 0;
  let lastNonZeroField: BreakdownField = "profit";

  for (const f of ALL_FIELDS) {
    const raw = totalCost * normalizedRatios[f];
    const rounded = Math.round(raw * 100) / 100;
    result[f] = rounded;
    runningSum += rounded;
    if (normalizedRatios[f] > 0) {
      lastNonZeroField = f;
    }
  }

  // Apply rounding remainder to last non-zero component
  const remainder = Math.round((totalCost - runningSum) * 100) / 100;
  if (remainder !== 0) {
    result[lastNonZeroField] = Math.round((result[lastNonZeroField] + remainder) * 100) / 100;
  }

  return result;
}

/**
 * Smart recalculation engine for price breakdown adjustments.
 * When a user edits one cost component, this engine rebalances others
 * using category-specific logic from cost models.
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
 * - If a cost field (materials/labor/equipment/logistics) is edited:
 *   redistributes remaining cost proportionally among other cost fields
 * - If risk/profit is edited: only updates totals
 * - rebalanceAll: redistributes ALL fields proportionally to match new total
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

  const originalTotal = sumFields(original, COST_FIELDS);
  const originalOverhead = original.risk + original.profit;
  const originalGrand = originalTotal + originalOverhead;

  if (rebalanceAll) {
    // Full rebalance: treat the edited field's new value as anchor,
    // scale everything else proportionally
    if (originalGrand === 0) return result;
    const ratio = newValue / (original[editedField] || 1);
    for (const f of [...COST_FIELDS, ...OVERHEAD_FIELDS]) {
      if (f !== editedField) {
        result[f] = +(original[f] * ratio).toFixed(2);
      }
    }
    return result;
  }

  if (OVERHEAD_FIELDS.includes(editedField)) {
    // Only overhead changed — keep cost fields, just update totals
    return result;
  }

  // Cost field changed — redistribute remaining cost among other cost fields
  const delta = newValue - (original[editedField] || 0);
  const otherCostFields = COST_FIELDS.filter(f => f !== editedField);
  const otherTotal = sumFields(original, otherCostFields);

  if (otherTotal === 0) {
    // Can't redistribute if others are zero — use model ratios
    const breakdown = model.breakdown;
    const ratios: Record<string, number> = {};
    let ratioSum = 0;
    for (const f of otherCostFields) {
      const mid = (breakdown[f as keyof typeof breakdown][0] + breakdown[f as keyof typeof breakdown][1]) / 2;
      ratios[f] = mid;
      ratioSum += mid;
    }
    const remaining = Math.max(0, originalTotal - newValue);
    for (const f of otherCostFields) {
      result[f] = +((ratios[f] / ratioSum) * remaining).toFixed(2);
    }
  } else {
    // Proportionally absorb the delta from other cost fields
    for (const f of otherCostFields) {
      const share = original[f] / otherTotal;
      result[f] = +Math.max(0, original[f] - delta * share).toFixed(2);
    }
  }

  // Recalculate risk and profit based on new cost subtotal
  const newCostTotal = sumFields(result, COST_FIELDS);
  const riskRate = originalGrand > 0 ? original.risk / originalGrand : 0.03;
  const profitRate = originalGrand > 0 ? original.profit / originalGrand : 0.05;

  if (editedField !== "risk") {
    result.risk = +(newCostTotal * riskRate / (1 - riskRate - profitRate)).toFixed(2);
  }
  if (editedField !== "profit") {
    result.profit = +(newCostTotal * profitRate / (1 - riskRate - profitRate)).toFixed(2);
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

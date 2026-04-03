/**
 * Dynamic rate calculator - produces unique, realistic rates per item.
 * Uses seeded pseudo-randomness from item properties for deterministic but varied output.
 */

import type { ItemCategory } from "./categoryDetector";
import { getCostModel, type CostModel } from "./costModels";

// Location factors with category-specific sensitivity
const LOCATION_BASE_FACTORS: Record<string, number> = {
  riyadh: 1.0, "الرياض": 1.0,
  makkah: 1.05, "مكة": 1.05, "مكة المكرمة": 1.05,
  jeddah: 1.03, "جدة": 1.03,
  aseer: 1.15, "عسير": 1.15,
  tabuk: 1.12, "تبوك": 1.12,
  dammam: 1.02, "الدمام": 1.02,
  madinah: 1.04, "المدينة": 1.04, "المدينة المنورة": 1.04,
};

/** Simple hash for deterministic variation from description text */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Seeded pseudo-random in [0,1) */
function seededRandom(seed: number, offset: number = 0): number {
  const x = Math.sin((seed + offset) * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** Interpolate within a range using a 0-1 factor */
function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function getLocationFactor(cities: string[]): number {
  for (const city of cities) {
    const key = city.trim().toLowerCase();
    if (LOCATION_BASE_FACTORS[key]) return LOCATION_BASE_FACTORS[key];
    const arKey = city.trim();
    if (LOCATION_BASE_FACTORS[arKey]) return LOCATION_BASE_FACTORS[arKey];
  }
  return 1.0;
}

export interface PricedResult {
  materials: number;
  labor: number;
  equipment: number;
  logistics: number;
  risk: number;
  profit: number;
  unitRate: number;
  totalPrice: number;
  confidence: number;
  locationFactor: number;
  category: ItemCategory;
  explanation: string;
}

export interface PricingContext {
  cities: string[];
  profitMargin: number;
  riskFactor: number;
}

export function calculateItemPrice(
  description: string,
  descriptionEn: string,
  unit: string,
  quantity: number,
  category: ItemCategory,
  categoryConfidence: number,
  context: PricingContext,
  rowIndex: number,
): PricedResult {
  const model = getCostModel(category);
  const seed = hashString(description + unit + rowIndex);
  const baseLocationFactor = getLocationFactor(context.cities);

  // 1. Compute complexity factor - unique per item
  const complexityT = seededRandom(seed, 1);
  const complexity = lerp(model.complexityRange[0], model.complexityRange[1], complexityT);

  // 2. Base rate - interpolated within range using item-specific seed
  const rateT = seededRandom(seed, 2);
  let baseRate = lerp(model.rateRange[0], model.rateRange[1], rateT);

  // 3. Unit adjustment - some items priced per ton, per m3, per piece, etc.
  baseRate = adjustForUnit(baseRate, unit, category);

  // 4. Apply complexity
  baseRate *= complexity;

  // 5. Economy of scale
  const scaleFactor = getScaleFactor(model, quantity);
  baseRate *= scaleFactor;

  // 6. Location factor - category-sensitive
  const effectiveLocationDelta = (baseLocationFactor - 1.0) * model.locationSensitivity;
  const locationFactor = 1.0 + effectiveLocationDelta;
  baseRate *= locationFactor;

  // 7. Dynamic breakdown ratios - each item gets slightly different ratios
  const matT = seededRandom(seed, 3);
  const labT = seededRandom(seed, 4);
  const eqT = seededRandom(seed, 5);
  const logT = seededRandom(seed, 6);

  let matRatio = lerp(model.breakdown.materials[0], model.breakdown.materials[1], matT);
  let labRatio = lerp(model.breakdown.labor[0], model.breakdown.labor[1], labT);
  let eqRatio = lerp(model.breakdown.equipment[0], model.breakdown.equipment[1], eqT);
  let logRatio = lerp(model.breakdown.logistics[0], model.breakdown.logistics[1], logT);

  // Normalize to sum to 1.0
  const ratioSum = matRatio + labRatio + eqRatio + logRatio;
  matRatio /= ratioSum;
  labRatio /= ratioSum;
  eqRatio /= ratioSum;
  logRatio /= ratioSum;

  // 8. Compute breakdown amounts
  const materials = +(baseRate * matRatio).toFixed(2);
  const labor = +(baseRate * labRatio).toFixed(2);
  const equipment = +(baseRate * eqRatio).toFixed(2);
  const logistics = +(baseRate * logRatio).toFixed(2);
  const risk = +(baseRate * context.riskFactor).toFixed(2);
  const profit = +(baseRate * context.profitMargin).toFixed(2);

  const unitRate = +(materials + labor + equipment + logistics + risk + profit).toFixed(2);
  const totalPrice = +(unitRate * quantity).toFixed(2);

  // Confidence based on category detection + model quality
  const confidence = Math.min(95, Math.round(categoryConfidence * 0.7 + (category !== "general" ? 25 : 10)));

  // Build explanation
  const explanation = buildExplanation(category, complexity, scaleFactor, locationFactor, model, baseRate);

  return {
    materials, labor, equipment, logistics, risk, profit,
    unitRate, totalPrice, confidence,
    locationFactor: +locationFactor.toFixed(4),
    category,
    explanation,
  };
}

function adjustForUnit(baseRate: number, unit: string, category: ItemCategory): number {
  const u = unit.toLowerCase();
  // Per-ton items
  if (u.includes("طن") || u.includes("ton")) {
    if (["rebar", "steel_structural", "steel_misc"].includes(category)) return baseRate;
    return baseRate * 10; // heavy items
  }
  // Per-piece items (doors, fixtures, equipment)
  if (u.includes("عدد") || u.includes("no") || u.includes("pcs") || u.includes("حبة")) {
    return baseRate; // already calibrated per piece for these categories
  }
  // Linear meter
  if (u.includes("م.ط") || u.includes("m.l") || u.includes("l.m") || u.includes("متر طولي")) {
    if (baseRate > 200) return baseRate * 0.3; // reduce for linear items
  }
  return baseRate;
}

function getScaleFactor(model: CostModel, quantity: number): number {
  let factor = 1.0;
  for (const sf of model.scaleFactors) {
    if (quantity >= sf.threshold) factor = sf.factor;
  }
  return factor;
}

function buildExplanation(
  category: ItemCategory,
  complexity: number,
  scaleFactor: number,
  locationFactor: number,
  model: CostModel,
  computedRate: number,
): string {
  const parts: string[] = [];
  parts.push(`Category: ${category.replace(/_/g, " ")}`);
  parts.push(`Base range: ${model.rateRange[0]}–${model.rateRange[1]} SAR`);
  parts.push(`Complexity: ×${complexity.toFixed(2)}`);
  if (scaleFactor < 1) parts.push(`Scale discount: ×${scaleFactor.toFixed(2)}`);
  if (locationFactor !== 1) parts.push(`Location: ×${locationFactor.toFixed(3)}`);
  parts.push(`Computed base: ${computedRate.toFixed(2)} SAR`);
  return parts.join(" | ");
}

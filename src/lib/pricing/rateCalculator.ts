/**
 * Dynamic rate calculator - produces unique, realistic rates per item.
 * Uses seeded pseudo-randomness from item properties for deterministic but varied output.
 * Implements weight-based logistics, category-aware location factors, and price range validation.
 */

import type { ItemCategory } from "./categoryDetector";
import { getCostModel, type CostModel } from "./costModels";

// Location factors with category-specific sensitivity
const LOCATION_BASE_FACTORS: Record<string, number> = {
  riyadh: 1.0, "الرياض": 1.0,
  makkah: 1.05, "مكة": 1.05, "مكة المكرمة": 1.05,
  jeddah: 1.03, "جدة": 1.03,
  aseer: 1.18, "عسير": 1.18,
  tabuk: 1.14, "تبوك": 1.14,
  dammam: 1.02, "الدمام": 1.02,
  madinah: 1.04, "المدينة": 1.04, "المدينة المنورة": 1.04,
  abha: 1.16, "أبها": 1.16,
  najran: 1.12, "نجران": 1.12,
  jazan: 1.10, "جازان": 1.10,
  hail: 1.08, "حائل": 1.08,
};

// Logistics multiplier based on weight class — heavier items cost more to transport
const LOGISTICS_WEIGHT_MULTIPLIERS: Record<string, number> = {
  light: 0.65,
  medium: 1.0,
  heavy: 1.45,
  bulk: 1.75,
};

/** Simple hash for deterministic variation from description text */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Seeded pseudo-random in [0,1) — uses multiple rounds for better distribution */
function seededRandom(seed: number, offset: number = 0): number {
  let x = Math.sin((seed + offset) * 9301 + 49297) * 49297;
  x = Math.sin(x * 2137 + 13) * 49297;
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
  priceFlag: "normal" | "low" | "high";
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

  // 3. Unit adjustment
  baseRate = adjustForUnit(baseRate, unit, category);

  // 4. Apply complexity
  baseRate *= complexity;

  // 5. Economy of scale
  const scaleFactor = getScaleFactor(model, quantity);
  baseRate *= scaleFactor;

  // 6. Category-aware location factor
  // Heavy/bulk items are much more affected by remote locations
  const logisticsMultiplier = LOGISTICS_WEIGHT_MULTIPLIERS[model.logisticsWeight] || 1.0;
  const rawLocationDelta = baseLocationFactor - 1.0;
  const effectiveLocationDelta = rawLocationDelta * model.locationSensitivity * (0.7 + 0.3 * logisticsMultiplier);
  const locationFactor = 1.0 + effectiveLocationDelta;
  baseRate *= locationFactor;

  // 7. Dynamic breakdown ratios - each item gets unique ratios within category bounds
  const matT = seededRandom(seed, 3);
  const labT = seededRandom(seed, 4);
  const eqT = seededRandom(seed, 5);
  const logT = seededRandom(seed, 6);

  let matRatio = lerp(model.breakdown.materials[0], model.breakdown.materials[1], matT);
  let labRatio = lerp(model.breakdown.labor[0], model.breakdown.labor[1], labT);
  let eqRatio = lerp(model.breakdown.equipment[0], model.breakdown.equipment[1], eqT);
  let logRatio = lerp(model.breakdown.logistics[0], model.breakdown.logistics[1], logT);

  // Apply logistics weight class to the logistics ratio
  logRatio *= logisticsMultiplier;

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

  // Price range validation
  const priceFlag = validatePriceRange(unitRate, model);

  // Build detailed explanation
  const explanation = buildExplanation(category, complexity, scaleFactor, locationFactor, model, baseRate, matRatio, labRatio, eqRatio, logRatio, priceFlag);

  return {
    materials, labor, equipment, logistics, risk, profit,
    unitRate, totalPrice, confidence,
    locationFactor: +locationFactor.toFixed(4),
    category,
    explanation,
    priceFlag,
  };
}

function validatePriceRange(unitRate: number, model: CostModel): "normal" | "low" | "high" {
  if (unitRate < model.validRange[0] * 0.8) return "low";
  if (unitRate > model.validRange[1] * 1.2) return "high";
  return "normal";
}

function adjustForUnit(baseRate: number, unit: string, category: ItemCategory): number {
  const u = unit.toLowerCase();
  if (u.includes("طن") || u.includes("ton")) {
    if (["rebar", "steel_structural", "steel_misc"].includes(category)) return baseRate;
    return baseRate * 10;
  }
  if (u.includes("عدد") || u.includes("no") || u.includes("pcs") || u.includes("حبة")) {
    return baseRate;
  }
  if (u.includes("م.ط") || u.includes("m.l") || u.includes("l.m") || u.includes("متر طولي")) {
    if (baseRate > 200) return baseRate * 0.3;
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
  matR: number,
  labR: number,
  eqR: number,
  logR: number,
  priceFlag: string,
): string {
  const parts: string[] = [];
  parts.push(`Category: ${category.replace(/_/g, " ")}`);
  parts.push(`Range: ${model.rateRange[0]}–${model.rateRange[1]} SAR`);
  parts.push(`Complexity: ×${complexity.toFixed(2)}`);

  // Show dominant cost driver
  const drivers = [
    { name: "Materials", ratio: matR },
    { name: "Labor", ratio: labR },
    { name: "Equipment", ratio: eqR },
    { name: "Logistics", ratio: logR },
  ].sort((a, b) => b.ratio - a.ratio);
  parts.push(`Cost driver: ${drivers[0].name} (${(drivers[0].ratio * 100).toFixed(0)}%)`);

  if (scaleFactor < 1) parts.push(`Scale: ×${scaleFactor.toFixed(2)}`);
  if (locationFactor !== 1) parts.push(`Location: ×${locationFactor.toFixed(3)} [${model.logisticsWeight}]`);
  parts.push(`Base: ${computedRate.toFixed(2)} SAR`);
  if (priceFlag !== "normal") parts.push(`⚠ Price ${priceFlag}`);
  return parts.join(" | ");
}

/**
 * Main pricing engine - orchestrates category detection, rate calculation,
 * rate library lookup, and quality validation for BoQ items.
 *
 * Priority: Rate Library → AI Calculation → General Fallback
 */

import { supabase } from "@/integrations/supabase/client";
import { detectCategory } from "./pricing/categoryDetector";
import { calculateItemPrice, type PricingContext, type PricedResult } from "./pricing/rateCalculator";
import { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";

export { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";
export { detectCategory } from "./pricing/categoryDetector";

interface RateLibraryItem {
  id: string;
  category: string;
  standard_name_ar: string;
  standard_name_en: string;
  unit: string;
  base_rate: number;
  target_rate: number;
  min_rate: number;
  max_rate: number;
  materials_pct: number;
  labor_pct: number;
  equipment_pct: number;
  logistics_pct: number;
  risk_pct: number;
  profit_pct: number;
  keywords: string[];
  is_locked: boolean;
  weight_class: string;
  complexity: string;
  source_type: string;
}

/**
 * Search the rate library for a matching item.
 */
function findRateLibraryMatch(
  description: string,
  category: string,
  rateLibrary: RateLibraryItem[]
): RateLibraryItem | null {
  const descLower = description.toLowerCase();
  const descAr = description;

  // Score each library item
  let bestMatch: RateLibraryItem | null = null;
  let bestScore = 0;

  for (const rate of rateLibrary) {
    let score = 0;
    const matchedKw = (rate.keywords || []).filter(kw =>
      descLower.includes(kw.toLowerCase()) || descAr.includes(kw)
    );
    score += matchedKw.length * 10;

    // Bonus for matching category
    if (rate.category.toLowerCase().includes(category.replace(/_/g, " ").split(" ")[0])) {
      score += 5;
    }

    // Bonus for name match
    if (descAr.includes(rate.standard_name_ar.substring(0, 10))) {
      score += 15;
    }

    if (score > bestScore && score >= 10) {
      bestScore = score;
      bestMatch = rate;
    }
  }

  return bestMatch;
}

/**
 * Calculate price from rate library item with context adjustments.
 */
function priceFromLibrary(
  libraryItem: RateLibraryItem,
  quantity: number,
  locationFactor: number,
): Omit<PricedResult, "category" | "explanation" | "priceFlag"> {
  let baseRate = libraryItem.target_rate;

  // Economy of scale
  if (quantity > 1000) baseRate *= 0.88;
  else if (quantity > 500) baseRate *= 0.92;
  else if (quantity > 100) baseRate *= 0.95;

  // Location adjustment
  baseRate *= locationFactor;

  // Complexity adjustment
  if (libraryItem.complexity === "High") baseRate *= 1.08;
  else if (libraryItem.complexity === "Low") baseRate *= 0.95;

  const totalPct = libraryItem.materials_pct + libraryItem.labor_pct +
    libraryItem.equipment_pct + libraryItem.logistics_pct;
  const materials = +(baseRate * libraryItem.materials_pct / totalPct).toFixed(2);
  const labor = +(baseRate * libraryItem.labor_pct / totalPct).toFixed(2);
  const equipment = +(baseRate * libraryItem.equipment_pct / totalPct).toFixed(2);
  const logistics = +(baseRate * libraryItem.logistics_pct / totalPct).toFixed(2);
  const risk = +(baseRate * (libraryItem.risk_pct / 100)).toFixed(2);
  const profit = +(baseRate * (libraryItem.profit_pct / 100)).toFixed(2);
  const unitRate = +(materials + labor + equipment + logistics + risk + profit).toFixed(2);
  const totalPrice = +(unitRate * quantity).toFixed(2);

  return {
    materials, labor, equipment, logistics, risk, profit,
    unitRate, totalPrice,
    confidence: 92,
    locationFactor: +locationFactor.toFixed(4),
  };
}

/**
 * Run pricing on all items in a BoQ file.
 */
export async function runPricingEngine(
  boqFileId: string,
  cities: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ totalValue: number; itemCount: number; validation: ValidationResult; libraryHits: number }> {
  const [itemsResult, libraryResult] = await Promise.all([
    supabase.from("boq_items").select("*").eq("boq_file_id", boqFileId).order("row_index", { ascending: true }),
    supabase.from("rate_library").select("*"),
  ]);

  if (itemsResult.error) throw new Error(`Failed to load items: ${itemsResult.error.message}`);
  const items = itemsResult.data;
  if (!items || items.length === 0) throw new Error("No items found to price.");

  const rateLibrary = (libraryResult.data || []) as unknown as RateLibraryItem[];

  const context: PricingContext = { cities, profitMargin: 0.05, riskFactor: 0.03 };

  // Location factor
  const remoteLocations = ["عسير", "تبوك", "أبها", "نجران", "جازان", "aseer", "tabuk", "abha"];
  const isRemote = cities.some(c => remoteLocations.includes(c.trim().toLowerCase()) || remoteLocations.includes(c.trim()));
  const locationFactor = isRemote ? 1.12 : 1.0;

  let totalValue = 0;
  let libraryHits = 0;
  const pricedItems: { unitRate: number; category: string; description: string; priceFlag?: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const detection = detectCategory(item.description, item.description_en);

    const libraryMatch = findRateLibraryMatch(item.description, detection.category, rateLibrary);
    let cost: PricedResult;

    if (libraryMatch) {
      libraryHits++;
      const libResult = priceFromLibrary(libraryMatch, item.quantity, locationFactor);
      cost = {
        ...libResult,
        category: detection.category,
        priceFlag: "normal" as const,
        explanation: `📚 Library V1: "${libraryMatch.standard_name_ar}" | Target: ${libraryMatch.target_rate} SAR | Range: ${libraryMatch.min_rate}–${libraryMatch.max_rate} | ${libraryMatch.is_locked ? "🔒" : "🔓"} | Source: ${libraryMatch.source_type}`,
      };
    } else {
      cost = calculateItemPrice(
        item.description, item.description_en, item.unit, item.quantity,
        detection.category, detection.confidence, context, item.row_index,
      );
    }

    const { error: updateError } = await supabase
      .from("boq_items")
      .update({
        materials: cost.materials, labor: cost.labor, equipment: cost.equipment,
        logistics: cost.logistics, risk: cost.risk, profit: cost.profit,
        unit_rate: cost.unitRate, total_price: cost.totalPrice,
        confidence: cost.confidence, location_factor: cost.locationFactor,
        source: libraryMatch ? "library" : "ai",
        status: cost.confidence >= 80 ? "approved" : "review",
        notes: cost.explanation,
      })
      .eq("id", item.id);

    if (updateError) throw new Error(`Failed to update item: ${updateError.message}`);

    totalValue += cost.totalPrice;
    pricedItems.push({ unitRate: cost.unitRate, category: cost.category, description: item.description, priceFlag: cost.priceFlag });
    onProgress?.(i + 1, items.length);
  }

  const validation = validatePricingQuality(pricedItems);
  await supabase.from("boq_files").update({ status: "priced" }).eq("id", boqFileId);

  const { data: boqFile } = await supabase.from("boq_files").select("project_id").eq("id", boqFileId).single();
  if (boqFile) {
    const { data: allItems } = await supabase
      .from("boq_items")
      .select("total_price, boq_file_id, boq_files!inner(project_id)")
      .eq("boq_files.project_id", boqFile.project_id);
    const projectTotal = (allItems || []).reduce((sum, item) => sum + (item.total_price || 0), 0);
    await supabase.from("projects").update({ total_value: projectTotal }).eq("id", boqFile.project_id);
  }

  return { totalValue, itemCount: items.length, validation, libraryHits };
}

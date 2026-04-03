/**
 * Main pricing engine - orchestrates category detection, rate calculation,
 * and quality validation for BoQ items.
 *
 * This engine behaves like a real cost engineer:
 * - Detects item type from Arabic/English descriptions
 * - Applies category-specific cost models with realistic ranges
 * - Varies rates based on quantity, complexity, and location
 * - Validates output quality to prevent template-like patterns
 */

import { supabase } from "@/integrations/supabase/client";
import { detectCategory } from "./pricing/categoryDetector";
import { calculateItemPrice, type PricingContext } from "./pricing/rateCalculator";
import { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";

export { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";
export { detectCategory } from "./pricing/categoryDetector";

/**
 * Run pricing on all items in a BoQ file.
 */
export async function runPricingEngine(
  boqFileId: string,
  cities: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ totalValue: number; itemCount: number; validation: ValidationResult }> {
  // Get all items
  const { data: items, error } = await supabase
    .from("boq_items")
    .select("*")
    .eq("boq_file_id", boqFileId)
    .order("row_index", { ascending: true });

  if (error) throw new Error(`Failed to load items: ${error.message}`);
  if (!items || items.length === 0) throw new Error("No items found to price.");

  const context: PricingContext = {
    cities,
    profitMargin: 0.05,
    riskFactor: 0.03,
  };

  let totalValue = 0;
  const pricedItems: { unitRate: number; category: string; description: string; priceFlag?: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Detect category from description
    const detection = detectCategory(item.description, item.description_en);

    // Calculate price using category-specific model
    const cost = calculateItemPrice(
      item.description,
      item.description_en,
      item.unit,
      item.quantity,
      detection.category,
      detection.confidence,
      context,
      item.row_index,
    );

    const { error: updateError } = await supabase
      .from("boq_items")
      .update({
        materials: cost.materials,
        labor: cost.labor,
        equipment: cost.equipment,
        logistics: cost.logistics,
        risk: cost.risk,
        profit: cost.profit,
        unit_rate: cost.unitRate,
        total_price: cost.totalPrice,
        confidence: cost.confidence,
        location_factor: cost.locationFactor,
        source: "ai",
        status: cost.confidence >= 80 ? "approved" : "review",
        notes: cost.explanation,
      })
      .eq("id", item.id);

    if (updateError) throw new Error(`Failed to update item: ${updateError.message}`);

    totalValue += cost.totalPrice;
    pricedItems.push({ unitRate: cost.unitRate, category: cost.category, description: item.description, priceFlag: cost.priceFlag });
    onProgress?.(i + 1, items.length);
  }

  // Validate pricing quality
  const validation = validatePricingQuality(pricedItems);

  // Update BoQ file status
  await supabase.from("boq_files").update({ status: "priced" }).eq("id", boqFileId);

  // Update project total value
  const { data: boqFile } = await supabase
    .from("boq_files")
    .select("project_id")
    .eq("id", boqFileId)
    .single();

  if (boqFile) {
    const { data: allItems } = await supabase
      .from("boq_items")
      .select("total_price, boq_file_id, boq_files!inner(project_id)")
      .eq("boq_files.project_id", boqFile.project_id);

    const projectTotal = (allItems || []).reduce((sum, item) => sum + (item.total_price || 0), 0);
    await supabase.from("projects").update({ total_value: projectTotal }).eq("id", boqFile.project_id);
  }

  return { totalValue, itemCount: items.length, validation };
}

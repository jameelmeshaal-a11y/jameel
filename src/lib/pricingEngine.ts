import { supabase } from "@/integrations/supabase/client";

// Location factors for Saudi cities
const LOCATION_FACTORS: Record<string, number> = {
  riyadh: 1.0, "الرياض": 1.0,
  makkah: 1.05, "مكة": 1.05, "مكة المكرمة": 1.05,
  jeddah: 1.03, "جدة": 1.03,
  aseer: 1.15, "عسير": 1.15,
  tabuk: 1.12, "تبوك": 1.12,
  dammam: 1.02, "الدمام": 1.02,
  madinah: 1.04, "المدينة": 1.04, "المدينة المنورة": 1.04,
};

function getLocationFactor(cities: string[]): number {
  for (const city of cities) {
    const key = city.trim().toLowerCase();
    if (LOCATION_FACTORS[key]) return LOCATION_FACTORS[key];
    // Try Arabic match
    const arKey = city.trim();
    if (LOCATION_FACTORS[arKey]) return LOCATION_FACTORS[arKey];
  }
  return 1.0; // default to Riyadh
}

interface PricingConfig {
  profitMargin: number;     // e.g. 0.05
  riskFactor: number;       // e.g. 0.03
  locationFactor: number;
}

/**
 * Generate realistic cost breakdown for a BoQ item based on its description and unit.
 * This uses heuristic-based estimation logic.
 */
function estimateItemCost(
  description: string,
  unit: string,
  quantity: number,
  config: PricingConfig
): {
  materials: number;
  labor: number;
  equipment: number;
  logistics: number;
  risk: number;
  profit: number;
  unitRate: number;
  totalPrice: number;
  confidence: number;
} {
  const desc = description.toLowerCase();

  // Base rate estimation by category keywords
  let baseRate = 100; // default SAR per unit
  let matRatio = 0.45, labRatio = 0.30, eqRatio = 0.15, logRatio = 0.10;
  let confidence = 70;

  // Concrete works
  if (desc.includes("خرسان") || desc.includes("concrete") || desc.includes("صب")) {
    baseRate = unit.includes("م3") || unit.includes("m3") ? 850 : 250;
    matRatio = 0.50; labRatio = 0.25; eqRatio = 0.15; logRatio = 0.10;
    confidence = 82;
  }
  // Rebar / reinforcement
  else if (desc.includes("حديد") || desc.includes("تسليح") || desc.includes("rebar") || desc.includes("steel")) {
    baseRate = unit.includes("طن") || unit.includes("ton") ? 4500 : 15;
    matRatio = 0.65; labRatio = 0.20; eqRatio = 0.05; logRatio = 0.10;
    confidence = 85;
  }
  // Excavation / earthwork
  else if (desc.includes("حفر") || desc.includes("excavat") || desc.includes("ردم") || desc.includes("أعمال ترابية")) {
    baseRate = unit.includes("م3") || unit.includes("m3") ? 35 : 20;
    matRatio = 0.10; labRatio = 0.35; eqRatio = 0.45; logRatio = 0.10;
    confidence = 78;
  }
  // Formwork
  else if (desc.includes("شدات") || desc.includes("قوالب") || desc.includes("formwork")) {
    baseRate = unit.includes("م2") || unit.includes("m2") ? 120 : 80;
    matRatio = 0.40; labRatio = 0.40; eqRatio = 0.10; logRatio = 0.10;
    confidence = 75;
  }
  // Painting
  else if (desc.includes("دهان") || desc.includes("طلاء") || desc.includes("paint")) {
    baseRate = unit.includes("م2") || unit.includes("m2") ? 45 : 35;
    matRatio = 0.35; labRatio = 0.50; eqRatio = 0.05; logRatio = 0.10;
    confidence = 80;
  }
  // Tiling / flooring
  else if (desc.includes("بلاط") || desc.includes("أرضيات") || desc.includes("tile") || desc.includes("floor")) {
    baseRate = unit.includes("م2") || unit.includes("m2") ? 180 : 100;
    matRatio = 0.55; labRatio = 0.30; eqRatio = 0.05; logRatio = 0.10;
    confidence = 77;
  }
  // Electrical
  else if (desc.includes("كهرب") || desc.includes("electric") || desc.includes("توصيل")) {
    baseRate = 200;
    matRatio = 0.50; labRatio = 0.35; eqRatio = 0.05; logRatio = 0.10;
    confidence = 72;
  }
  // Plumbing
  else if (desc.includes("سباكة") || desc.includes("مواسير") || desc.includes("plumb") || desc.includes("pipe")) {
    baseRate = 150;
    matRatio = 0.45; labRatio = 0.35; eqRatio = 0.10; logRatio = 0.10;
    confidence = 74;
  }
  // Insulation
  else if (desc.includes("عزل") || desc.includes("insul")) {
    baseRate = unit.includes("م2") || unit.includes("m2") ? 65 : 50;
    matRatio = 0.55; labRatio = 0.30; eqRatio = 0.05; logRatio = 0.10;
    confidence = 76;
  }
  // Supply and install (generic)
  else if (desc.includes("توريد") || desc.includes("تركيب") || desc.includes("supply")) {
    baseRate = 300;
    matRatio = 0.50; labRatio = 0.30; eqRatio = 0.10; logRatio = 0.10;
    confidence = 65;
  }

  // Apply location factor
  baseRate *= config.locationFactor;

  const materials = +(baseRate * matRatio).toFixed(2);
  const labor = +(baseRate * labRatio).toFixed(2);
  const equipment = +(baseRate * eqRatio).toFixed(2);
  const logistics = +(baseRate * logRatio).toFixed(2);
  const risk = +(baseRate * config.riskFactor).toFixed(2);
  const profit = +(baseRate * config.profitMargin).toFixed(2);

  const unitRate = +(materials + labor + equipment + logistics + risk + profit).toFixed(2);
  const totalPrice = +(unitRate * quantity).toFixed(2);

  return { materials, labor, equipment, logistics, risk, profit, unitRate, totalPrice, confidence };
}

/**
 * Run pricing on all items in a BoQ file.
 */
export async function runPricingEngine(
  boqFileId: string,
  cities: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ totalValue: number; itemCount: number }> {
  // Get all items
  const { data: items, error } = await supabase
    .from("boq_items")
    .select("*")
    .eq("boq_file_id", boqFileId)
    .order("row_index", { ascending: true });

  if (error) throw new Error(`Failed to load items: ${error.message}`);
  if (!items || items.length === 0) throw new Error("No items found to price.");

  const locationFactor = getLocationFactor(cities);
  const config: PricingConfig = {
    profitMargin: 0.05,
    riskFactor: 0.03,
    locationFactor,
  };

  let totalValue = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cost = estimateItemCost(item.description, item.unit, item.quantity, config);

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
        location_factor: locationFactor,
        source: "ai",
        status: cost.confidence >= 80 ? "approved" : "review",
      })
      .eq("id", item.id);

    if (updateError) throw new Error(`Failed to update item: ${updateError.message}`);

    totalValue += cost.totalPrice;
    onProgress?.(i + 1, items.length);
  }

  // Update BoQ file status
  await supabase.from("boq_files").update({ status: "priced" }).eq("id", boqFileId);

  // Update project total value
  const { data: boqFile } = await supabase
    .from("boq_files")
    .select("project_id")
    .eq("id", boqFileId)
    .single();

  if (boqFile) {
    // Sum all priced items across all BoQ files for this project
    const { data: allItems } = await supabase
      .from("boq_items")
      .select("total_price, boq_file_id, boq_files!inner(project_id)")
      .eq("boq_files.project_id", boqFile.project_id);

    const projectTotal = (allItems || []).reduce((sum, item) => sum + (item.total_price || 0), 0);
    await supabase.from("projects").update({ total_value: projectTotal }).eq("id", boqFile.project_id);
  }

  return { totalValue, itemCount: items.length };
}

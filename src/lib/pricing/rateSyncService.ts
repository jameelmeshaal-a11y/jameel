/**
 * Rate Sync Service — auto-syncs manual BoQ price edits to the central rate library.
 * Any manually edited and approved price becomes the new trusted rate
 * for current repricing and all future projects.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeUnit, textSimilarity, tokenize } from "./similarItemMatcher";
import { detectCategory } from "@/lib/pricingEngine";
import type { BreakdownValues } from "./smartRecalculator";
import { getUnitRate } from "./smartRecalculator";

export interface SyncParams {
  itemId: string;
  boqFileId: string;
  /** If provided, these are used directly (QuickSave / Propagation). If omitted, re-fetched from DB (Approve). */
  values?: BreakdownValues;
  unitRate?: number;
}

export interface SyncResult {
  libraryId: string;
  isNew: boolean;
  boqFileName: string;
}

const SIMILARITY_THRESHOLD = 0.7;

export async function syncToRateLibrary(params: SyncParams): Promise<SyncResult | null> {
  const { itemId, boqFileId } = params;

  // 1. Fetch real BoQ file context (name + city)
  const [boqFileRes, itemRes] = await Promise.all([
    supabase.from("boq_files").select("name, city").eq("id", boqFileId).single(),
    // Always fetch the item for description/unit; also for fresh pricing if values not provided
    supabase.from("boq_items").select("*").eq("id", itemId).single(),
  ]);

  const boqFile = boqFileRes.data;
  const itemData = itemRes.data;
  if (!boqFile || !itemData) {
    console.warn("[RateSync] Could not fetch BoQ file or item data");
    return null;
  }

  // Resolve pricing values: use provided or fresh from DB
  const values: BreakdownValues = params.values ?? {
    materials: itemData.materials || 0,
    labor: itemData.labor || 0,
    equipment: itemData.equipment || 0,
    logistics: itemData.logistics || 0,
    risk: itemData.risk || 0,
    profit: itemData.profit || 0,
  };
  const unitRate = params.unitRate ?? getUnitRate(values);

  // Guards
  if (unitRate <= 0 || itemData.quantity <= 0) {
    console.log("[RateSync] Skipped — unitRate or quantity <= 0");
    return null;
  }

  const detected = detectCategory(itemData.description, itemData.description_en);
  const normalizedUnit = normalizeUnit(itemData.unit);
  const realCity = boqFile.city || "";

  // 2. Safe matching — find candidates in rate_library by unit + category
  const { data: candidates } = await supabase
    .from("rate_library")
    .select("*")
    .eq("category", detected.category)
    .eq("unit", itemData.unit);

  let bestMatch: { id: string; similarity: number; is_locked: boolean } | null = null;

  if (candidates && candidates.length > 0) {
    for (const c of candidates) {
      if (normalizeUnit(c.unit) !== normalizedUnit) continue;

      const simAr = textSimilarity(itemData.description, c.standard_name_ar);
      const simEn = textSimilarity(itemData.description_en, c.standard_name_en);
      const best = Math.max(simAr, simEn);

      if (best >= SIMILARITY_THRESHOLD && (!bestMatch || best > bestMatch.similarity)) {
        bestMatch = { id: c.id, similarity: best, is_locked: c.is_locked };
      }
    }
  }

  let libraryId: string;
  let isNew: boolean;

  if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLD && !bestMatch.is_locked) {
    // 3a. Update existing library entry
    const pcts = unitRate > 0 ? {
      materials_pct: +((values.materials / unitRate) * 100).toFixed(1),
      labor_pct: +((values.labor / unitRate) * 100).toFixed(1),
      equipment_pct: +((values.equipment / unitRate) * 100).toFixed(1),
      logistics_pct: +((values.logistics / unitRate) * 100).toFixed(1),
      risk_pct: +((values.risk / unitRate) * 100).toFixed(1),
      profit_pct: +((values.profit / unitRate) * 100).toFixed(1),
    } : {};

    const { error } = await supabase
      .from("rate_library")
      .update({
        base_rate: unitRate,
        target_rate: unitRate,
        ...pcts,
        source_type: "Revised",
        last_reviewed_at: new Date().toISOString(),
      })
      .eq("id", bestMatch.id);

    if (error) {
      console.error("[RateSync] Update rate_library failed:", error.message);
      return null;
    }
    libraryId = bestMatch.id;
    isNew = false;
  } else if (bestMatch && bestMatch.is_locked) {
    // Locked item — skip update, still insert source and link
    libraryId = bestMatch.id;
    isNew = false;
    console.log("[RateSync] Best match is locked, skipping library update but recording source");
  } else {
    // 3b. Insert new library entry
    const keywords = tokenize(itemData.description + " " + (itemData.description_en || ""));
    const pcts = unitRate > 0 ? {
      materials_pct: +((values.materials / unitRate) * 100).toFixed(1),
      labor_pct: +((values.labor / unitRate) * 100).toFixed(1),
      equipment_pct: +((values.equipment / unitRate) * 100).toFixed(1),
      logistics_pct: +((values.logistics / unitRate) * 100).toFixed(1),
      risk_pct: +((values.risk / unitRate) * 100).toFixed(1),
      profit_pct: +((values.profit / unitRate) * 100).toFixed(1),
    } : {};

    const { data: inserted, error } = await supabase
      .from("rate_library")
      .insert({
        standard_name_ar: itemData.description,
        standard_name_en: itemData.description_en || "",
        category: detected.category,
        unit: itemData.unit,
        base_rate: unitRate,
        target_rate: unitRate,
        min_rate: +(unitRate * 0.9).toFixed(2),
        max_rate: +(unitRate * 1.1).toFixed(2),
        ...pcts,
        source_type: "Field-Approved",
        base_city: realCity || "",
        keywords,
        last_reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("[RateSync] Insert rate_library failed:", error?.message);
      return null;
    }
    libraryId = inserted.id;
    isNew = true;
  }

  // 4. Insert rate_sources — "Approved" source with real BoQ name and city
  await supabase.from("rate_sources").insert({
    rate_library_id: libraryId,
    source_type: "Approved",
    rate: unitRate,
    is_verified: true,
    city: realCity || "Riyadh",
    source_name: boqFile.name,
    notes: `Synced from BoQ item ${itemData.item_no || itemId}`,
  });

  // 5. Link boq_item to library entry
  await supabase
    .from("boq_items")
    .update({ linked_rate_id: libraryId })
    .eq("id", itemId);

  console.log(`[RateSync] ${isNew ? "Created" : "Updated"} rate_library ${libraryId} from BoQ "${boqFile.name}" (city: ${realCity})`);
  return { libraryId, isNew, boqFileName: boqFile.name };
}

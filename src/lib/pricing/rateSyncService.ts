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
import { parseDimensions, compareDimensions } from "./synonyms";

export interface SyncParams {
  itemId: string;
  boqFileId: string;
  /** If provided, these are used directly (QuickSave / Propagation). If omitted, re-fetched from DB (Approve). */
  values?: BreakdownValues;
  unitRate?: number;
  /** User correction note explaining why the price was wrong — enriches the library for future matching */
  correctionNote?: string;
  /** User ID for approval tracking */
  userId?: string;
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
    const itemDims = parseDimensions(itemData.description + " " + (itemData.description_en || ""));

    for (const c of candidates) {
      if (normalizeUnit(c.unit) !== normalizedUnit) continue;

      // Dimension gate: if both have WxH dimensions and they differ, skip
      const candDims = parseDimensions((c.standard_name_ar || "") + " " + (c.standard_name_en || ""));
      const dimResult = compareDimensions(itemDims, candDims);
      const bothHaveWxH = itemDims.some(d => d.type === "dimensions" && d.values.length >= 2)
        && candDims.some(d => d.type === "dimensions" && d.values.length >= 2);
      if (dimResult === -1 && bothHaveWxH) {
        console.log(`[RateSync] Dimension mismatch — skipping candidate ${c.id}`);
        continue;
      }

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

    // Enrich with correction note
    const correctionEnrichment = await buildCorrectionEnrichment(bestMatch.id, params.correctionNote, itemData.description);

    const { error } = await supabase
      .from("rate_library")
      .update({
        base_rate: unitRate,
        target_rate: unitRate,
        ...pcts,
        source_type: "Approved",
        last_reviewed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        ...(params.userId ? { approved_by: params.userId } : {}),
        ...correctionEnrichment,
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

    // Extract parent context from notes for item_description
    const parentMatch = itemData.notes?.match(/\[PARENT:\s*(.+?)\]/);
    const itemDescription = parentMatch ? parentMatch[1].trim() : "";
    // Build aliases from short name + parent context snippet
    const aliases: string[] = [];
    if (itemDescription) {
      aliases.push(itemData.description + " " + itemDescription.slice(0, 60));
    }

    // Build notes for new items from correction note
    const newItemNotes = params.correctionNote
      ? `[تصحيح ${new Date().toISOString().split("T")[0]}]: ${params.correctionNote}`
      : undefined;

    // Extract keywords from correction note for new items
    const noteKeywords = params.correctionNote
      ? tokenize(params.correctionNote).filter(k => k.length > 2)
      : [];
    const allKeywords = [...new Set([...keywords, ...noteKeywords])];

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
        source_type: "Approved",
        base_city: realCity || "",
        keywords: allKeywords,
        item_description: itemDescription,
        item_name_aliases: aliases,
        last_reviewed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        ...(params.userId ? { approved_by: params.userId, created_by: params.userId } : {}),
        ...(newItemNotes ? { notes: newItemNotes } : {}),
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
  const { error: sourceError } = await supabase.from("rate_sources").insert({
    rate_library_id: libraryId,
    source_type: "Approved",
    rate: unitRate,
    is_verified: true,
    city: realCity || "",
    source_name: boqFile.name,
    notes: `Synced from BoQ item ${itemData.item_no || itemId}`,
  });

  if (sourceError) {
    console.error("[RateSync] Insert rate_sources failed:", sourceError.message);
    return null;
  }

  // 5. Link boq_item to library entry
  const { error: linkError } = await supabase
    .from("boq_items")
    .update({ linked_rate_id: libraryId })
    .eq("id", itemId);

  if (linkError) {
    console.error("[RateSync] Update linked_rate_id failed:", linkError.message);
    return null;
  }

  console.log(`[RateSync] ${isNew ? "Created" : "Updated"} rate_library ${libraryId} from BoQ "${boqFile.name}" (city: ${realCity})`);
  return { libraryId, isNew, boqFileName: boqFile.name };
}

// ─── Correction Note Enrichment ─────────────────────────────────────────────

async function buildCorrectionEnrichment(
  libraryId: string,
  correctionNote?: string,
  itemDescription?: string,
): Promise<Record<string, any>> {
  if (!correctionNote) return {};

  // Fetch current library entry for appending
  const { data: current } = await supabase
    .from("rate_library")
    .select("notes, keywords, item_name_aliases")
    .eq("id", libraryId)
    .single();

  const result: Record<string, any> = {};

  // Append correction note to notes (cumulative)
  const timestamp = new Date().toISOString().split("T")[0];
  const correctionEntry = `[تصحيح ${timestamp}]: ${correctionNote}`;
  const existingNotes = current?.notes || "";
  result.notes = existingNotes
    ? `${existingNotes}\n${correctionEntry}`
    : correctionEntry;

  // Extract keywords from correction note and add to keywords array
  const noteKeywords = tokenize(correctionNote).filter(k => k.length > 2);
  if (noteKeywords.length > 0) {
    const existingKeywords = current?.keywords || [];
    const mergedKeywords = [...new Set([...existingKeywords, ...noteKeywords])];
    result.keywords = mergedKeywords;
  }

  // Add item description as alias if not already present
  if (itemDescription) {
    const existingAliases: string[] = current?.item_name_aliases || [];
    if (!existingAliases.some(a => a === itemDescription)) {
      result.item_name_aliases = [...existingAliases, itemDescription];
    }
  }

  return result;
}

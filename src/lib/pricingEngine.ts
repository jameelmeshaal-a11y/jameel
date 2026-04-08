/**
 * Main pricing engine V2.0 — DETERMINISTIC PRICING
 *
 * ALL prices come from the approved rate library. NO AI price generation.
 * AI is used ONLY for item classification/matching — never for pricing.
 *
 * Priority: Rate Library (Path A → A.5 → B → C) → NO MATCH
 *
 * V2.0 changes:
 * - Removed all AI price generation (calculateItemPrice deleted)
 * - Removed priceFromLibrary() multipliers (complexity/quantity)
 * - All matched items use target_rate EXACTLY via priceFromApprovedRate()
 * - Raised thresholds: Path B ≥50, Path C ≥50
 * - Unmatched items get unit_rate=NULL, status="unmatched"
 * - Only "approved" (≥70) items contribute to totals
 */

import { supabase } from "@/integrations/supabase/client";
import { textSimilarity, normalizeUnit, tokenize, normalizeArabicText, charNgramSimilarity, overlapCoefficient, extractModelCodes } from "./pricing/similarItemMatcher";
import { detectCategory } from "./pricing/categoryDetector";
import type { PricedResult } from "./pricing/rateCalculator";
import { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";
import {
  fetchLocationFactors,
  resolveLocationFactor,
  calculateProjectOverhead,
  VAT_RATE,
  type LocationFactor,
  type ProjectType,
  type ProjectSummary,
} from "./pricing/locationEngine";
import { fetchAllSources, resolveFromSources } from "./pricing/sourceResolver";
import { classifyBoQRow, getRowClassificationNote, isPriceableBoQRow } from "./boqRowClassification";
import { groupSemanticRows, hasManualOverride, type SemanticBlock } from "./boqRowGrouping";

export { validatePricingQuality, type ValidationResult } from "./pricing/pricingValidator";
export { detectCategory } from "./pricing/categoryDetector";
export { calculateProjectOverhead, VAT_RATE, type ProjectSummary, type ProjectType } from "./pricing/locationEngine";

/** Check if a row is a valid priceable item (quantity > 0, has unit and item code) */
export function isPriceableItem(item: { quantity: number; unit?: string; item_no?: string }): boolean {
  return isPriceableBoQRow(item);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RateLibraryItem {
  id: string;
  category: string;
  standard_name_ar: string;
  standard_name_en: string;
  unit: string;
  base_rate: number;
  base_city: string;
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
  approved_at?: string | null;
  approved_by?: string | null;
  item_name_aliases?: string[] | null;
  item_code?: string | null;
  item_description?: string | null;
}

export interface PricingResult {
  totalValue: number;
  itemCount: number;
  validation: ValidationResult;
  libraryHits: number;
  locationApplied: LocationFactor;
  summary: ProjectSummary;
}

// ─── Historical Mapping Types ───────────────────────────────────────────────

interface HistoricalMapping {
  normalizedDesc: string;
  tokens: string[];
  linkedRateId: string;
  unit: string;
}

// ─── Rate Library Matching ──────────────────────────────────────────────────

function findRateLibraryMatch(
  description: string,
  descriptionEn: string,
  unit: string,
  category: string,
  rateLibrary: RateLibraryItem[],
  linkedRateId?: string | null,
  approvedRateIds?: Set<string>,
): { item: RateLibraryItem; confidence: number } | null {
  // Path A — Direct lookup (trusted, not scored)
  if (linkedRateId) {
    const linked = rateLibrary.find((rate) => rate.id === linkedRateId);
    if (linked) return { item: linked, confidence: 95 };
  }

  // Path B — Similarity scoring (0–100) — threshold raised to 50
  let bestMatch: RateLibraryItem | null = null;
  let bestScore = 0;

  // Extract model codes from BoQ description once
  const boqCodes = extractModelCodes(description + " " + (descriptionEn || ""));
  const boqTokens = tokenize(description + " " + (descriptionEn || ""));

  for (const candidate of rateLibrary) {
    if (normalizeUnit(candidate.unit) !== normalizeUnit(unit)) continue;

    let score = 0;

    // Text similarity via max(Jaccard, overlap coeff) (max 60 pts)
    let textScore = Math.max(
      textSimilarity(description, candidate.standard_name_ar || ""),
      textSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
    ) * 60;

    // Check item_name_aliases (weight: aliasSim * 60)
    if (candidate.item_name_aliases?.length) {
      for (const alias of candidate.item_name_aliases) {
        const aliasSim = textSimilarity(description, alias);
        textScore = Math.max(textScore, aliasSim * 60);
      }
    }

    // Check item_description (weight: descSim * 60)
    if (candidate.item_description) {
      const descSim = Math.max(
        textSimilarity(description, candidate.item_description),
        textSimilarity(descriptionEn || "", candidate.item_description),
      );
      textScore = Math.max(textScore, descSim * 60);
    }

    // Character n-gram similarity as secondary scorer (max 30 pts)
    const ngramScore = Math.max(
      charNgramSimilarity(description, candidate.standard_name_ar || ""),
      charNgramSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
    ) * 30;

    // Use the better of the two approaches
    score += Math.max(textScore, ngramScore);

    // Category match (+15 pts)
    if (candidate.category.toLowerCase().includes(category.replace(/_/g, " ").split(" ")[0])) {
      score += 15;
    }

    // Keyword overlap via tokenize (max 25 pts)
    const candTokens = tokenize((candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || ""));
    const overlapCount = boqTokens.filter(t => candTokens.includes(t)).length;
    score += Math.min(25, overlapCount * 5);

    // ── NEW: Model/code match (+40 pts) ──
    if (boqCodes.length > 0) {
      const candText = [
        candidate.standard_name_ar || "",
        candidate.standard_name_en || "",
        candidate.item_code || "",
        candidate.item_description || "",
        ...(candidate.item_name_aliases || []),
      ].join(" ");
      const candCodes = extractModelCodes(candText);
      const hasCodeMatch = boqCodes.some(c => candCodes.includes(c));
      if (hasCodeMatch) {
        score += 40;
      }
    }

    // ── NEW: Containment bonus (+20 pts) ──
    const overlapCoeff = Math.max(
      overlapCoefficient(description, candidate.standard_name_ar || ""),
      overlapCoefficient(description, candidate.item_description || ""),
      overlapCoefficient(descriptionEn || "", candidate.standard_name_en || ""),
    );
    if (overlapCoeff >= 0.8) {
      score += 20;
    }

    // ── NEW: Library keywords field matching (+15 pts) ──
    if (candidate.keywords?.length > 0) {
      const kwSet = new Set(candidate.keywords.map(k => k.toLowerCase()));
      const kwHits = boqTokens.filter(t => kwSet.has(t)).length;
      score += Math.min(15, kwHits * 5);
    }

    score = Math.min(score, 99);

    if (score > bestScore && score >= 50) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    return { item: bestMatch, confidence: bestScore };
  }

  // Path C — Approved-rate fallback (threshold raised to 50)
  if (approvedRateIds && approvedRateIds.size > 0) {
    const normalizedUnit_ = normalizeUnit(unit);

    for (const candidate of rateLibrary) {
      if (!approvedRateIds.has(candidate.id)) continue;
      if (normalizeUnit(candidate.unit) !== normalizedUnit_) continue;

      const textScore = Math.max(
        textSimilarity(description, candidate.standard_name_ar || ""),
        textSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
      ) * 60;

      const ngramScore = Math.max(
        charNgramSimilarity(description, candidate.standard_name_ar || ""),
        charNgramSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
      ) * 30;

      const srcTokens = tokenize(description + " " + (descriptionEn || ""));
      const candTokens = tokenize((candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || ""));
      const overlapCount = srcTokens.filter(t => candTokens.includes(t)).length;
      const kwScore = Math.min(25, overlapCount * 5);

      const score = Math.min(Math.max(textScore, ngramScore) + kwScore, 55);

      if (score >= 50 && score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      return { item: bestMatch, confidence: Math.min(bestScore, 55) };
    }
  }

  return null;
}

// ─── priceFromLibrary REMOVED — all items now use priceFromApprovedRate() ───

// ─── Approved Rate Direct Pricing (NO multipliers) ──────────────────────────

/**
 * Price using an approved rate DIRECTLY — no complexity, quantity, or overhead multipliers.
 * Only applies location factor if project city differs from the library's base_city.
 */
function priceFromApprovedRate(
  approvedRate: number,
  libraryItem: RateLibraryItem,
  quantity: number,
  locationFactor: number,
  baseCity: string,
  projectCity: string,
): Omit<PricedResult, "category" | "explanation" | "priceFlag"> {
  // Only apply location factor if cities differ
  const needsLocationAdj = baseCity && projectCity &&
    baseCity.toLowerCase().trim() !== projectCity.toLowerCase().trim();
  const adjustedRate = needsLocationAdj ? +(approvedRate * locationFactor).toFixed(2) : approvedRate;

  // Breakdown is DISPLAY ONLY — adjustedRate IS the unit rate
  const totalPct = libraryItem.materials_pct + libraryItem.labor_pct +
    libraryItem.equipment_pct + libraryItem.logistics_pct +
    libraryItem.risk_pct + libraryItem.profit_pct;

  let materials: number, labor: number, equipment: number, logistics: number, risk: number, profit: number;

  if (totalPct > 0) {
    // Distribute the rate proportionally (all components sum to adjustedRate)
    materials  = +(adjustedRate * libraryItem.materials_pct / totalPct).toFixed(2);
    labor      = +(adjustedRate * libraryItem.labor_pct / totalPct).toFixed(2);
    equipment  = +(adjustedRate * libraryItem.equipment_pct / totalPct).toFixed(2);
    logistics  = +(adjustedRate * libraryItem.logistics_pct / totalPct).toFixed(2);
    risk       = +(adjustedRate * libraryItem.risk_pct / totalPct).toFixed(2);
    profit     = +(adjustedRate * libraryItem.profit_pct / totalPct).toFixed(2);
  } else {
    // No breakdown info — full rate goes to materials (display convention)
    materials = adjustedRate;
    labor = 0; equipment = 0; logistics = 0; risk = 0; profit = 0;
  }

  const unitRate = adjustedRate;  // ALWAYS equals the approved rate
  const totalPrice = +(unitRate * quantity).toFixed(2);

  return {
    materials, labor, equipment, logistics, risk, profit,
    unitRate, totalPrice,
    confidence: 95,
    locationFactor: needsLocationAdj ? +locationFactor.toFixed(4) : 1.0,
  };
}

/** Helper to get risk pct from library item */
function libraryItem_risk(item: RateLibraryItem): number {
  return item.risk_pct;
}

// ─── Historical Mapping (Path A.5) ──────────────────────────────────────────

/**
 * Build a map of previously approved items that have a linked_rate_id.
 * Used for deterministic matching: if an item was approved before,
 * any future occurrence with the same description inherits the mapping.
 */
async function buildHistoricalMap(): Promise<HistoricalMapping[]> {
  const { data } = await supabase
    .from("boq_items")
    .select("description, description_en, unit, linked_rate_id, source")
    .not("linked_rate_id", "is", null)
    .in("source", ["library-high", "manual", "project_override", "master_update"])
    .limit(2000);

  if (!data) return [];

  const seen = new Set<string>();
  return data
    .filter(d => {
      if (!d.linked_rate_id || seen.has(d.linked_rate_id)) return false;
      seen.add(d.linked_rate_id);
      return true;
    })
    .map(d => ({
      normalizedDesc: normalizeArabicText(d.description + " " + (d.description_en || "")),
      tokens: tokenize(d.description + " " + (d.description_en || "")),
      linkedRateId: d.linked_rate_id!,
      unit: d.unit,
    }));
}

/**
 * Find a deterministic match from historical approved items.
 * First: exact normalized text match. Then: high-threshold Jaccard (≥0.85).
 */
function findHistoricalMatch(
  description: string,
  descriptionEn: string,
  unit: string,
  historicalMap: HistoricalMapping[],
  rateLibrary: RateLibraryItem[],
): { item: RateLibraryItem; confidence: number } | null {
  const itemText = normalizeArabicText(description + " " + (descriptionEn || ""));
  const itemTokens = tokenize(description + " " + (descriptionEn || ""));
  const normalizedItemUnit = normalizeUnit(unit);

  // Pass 1: exact normalized text match
  for (const hist of historicalMap) {
    if (normalizeUnit(hist.unit) !== normalizedItemUnit) continue;
    if (hist.normalizedDesc === itemText) {
      const linked = rateLibrary.find(r => r.id === hist.linkedRateId);
      if (linked) return { item: linked, confidence: 93 };
    }
  }

  // Pass 2: high-threshold Jaccard (≥0.85)
  for (const hist of historicalMap) {
    if (normalizeUnit(hist.unit) !== normalizedItemUnit) continue;
    const setA = new Set(itemTokens);
    const setB = new Set(hist.tokens);
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    if (jaccard >= 0.85) {
      const linked = rateLibrary.find(r => r.id === hist.linkedRateId);
      if (linked) return { item: linked, confidence: 90 };
    }
  }

  return null;
}

// ─── Null fields for clearing descriptive rows ──────────────────────────────

const NULL_PRICING_FIELDS = {
  unit_rate: null,
  total_price: null,
  materials: null,
  labor: null,
  equipment: null,
  logistics: null,
  risk: null,
  profit: null,
  confidence: null,
  source: null,
  linked_rate_id: null,
  location_factor: null,
};

// ─── Main Engine ────────────────────────────────────────────────────────────

export async function runPricingEngine(
  boqFileId: string,
  cities: string[],
  onProgress?: (current: number, total: number) => void,
  projectType: ProjectType = "government_civil"
): Promise<PricingResult> {
  // Fetch items, library, location factors, sources, file metadata, AND historical map in parallel
  const [itemsResult, libraryResult, locationFactors, sourcesMap, boqFileResult, historicalMap] = await Promise.all([
    supabase.from("boq_items").select("*").eq("boq_file_id", boqFileId).order("row_index", { ascending: true }),
    supabase.from("rate_library").select("*"),
    fetchLocationFactors(),
    fetchAllSources(),
    supabase.from("boq_files").select("*").eq("id", boqFileId).single(),
    buildHistoricalMap(),
  ]);

  if (itemsResult.error) throw new Error(`Failed to load items: ${itemsResult.error.message}`);
  const items = itemsResult.data;
  if (!items || items.length === 0) throw new Error("No items found to price.");

  const rateLibrary = (libraryResult.data || []) as unknown as RateLibraryItem[];
  const ownerMaterials = !!(boqFileResult.data as any)?.owner_materials;
  const projectCity = cities[0] || "";

  // Build set of approved rate IDs from sources AND library-level approval
  const approvedRateIds = new Set<string>();
  for (const [rateId, sources] of sourcesMap.entries()) {
    if (sources.some(s => s.source_type === 'Approved')) {
      approvedRateIds.add(rateId);
    }
  }
  // Also include library items with library-level approval metadata
  for (const libItem of rateLibrary) {
    if (libItem.approved_at || ['Approved', 'Field-Approved', 'Revised'].includes(libItem.source_type)) {
      approvedRateIds.add(libItem.id);
    }
  }

  // Resolve location from DB table
  const locationMatch = resolveLocationFactor(cities, locationFactors);
  const locFactor = locationMatch.location_factor;

  // PricingContext no longer needed — no AI pricing

  // ── Semantic Row Grouping ──────────────────────────────────────────────
  const blocks = groupSemanticRows(items as any);

  let totalValue = 0;
  let libraryHits = 0;
  const pricedItems: { unitRate: number; category: string; description: string; priceFlag?: string }[] = [];
  let processedCount = 0;

  for (const block of blocks) {
    // 1. Mark contributor rows as descriptive in DB
    for (const contributor of block.contributorRows) {
      await supabase.from("boq_items").update({
        status: "descriptive",
        notes: `وصف مدمج مع البند ${block.itemNo || block.primaryRow.item_no || "—"}`,
        ...NULL_PRICING_FIELDS,
      }).eq("id", contributor.id);
    }

    processedCount += block.contributorRows.length;

    // 2. Non-priced blocks (standalone descriptive / section headers with qty=0)
    if (block.quantity <= 0) {
      const classification = classifyBoQRow(block.primaryRow as any);
      await supabase.from("boq_items").update({
        status: classification.type === "descriptive" ? "descriptive" : "needs_review",
        notes: getRowClassificationNote(block.primaryRow as any),
        ...NULL_PRICING_FIELDS,
      }).eq("id", block.primaryRow.id);
      processedCount++;
      onProgress?.(processedCount, items.length);
      continue;
    }

    // 3. Manual override protection
    if (hasManualOverride(block.primaryRow)) {
      await supabase.from("boq_items").update({
        status: "needs_review",
        notes: "تم تخطي إعادة التسعير — يوجد تعديل يدوي محفوظ",
      }).eq("id", block.primaryRow.id);
      processedCount++;
      onProgress?.(processedCount, items.length);
      continue;
    }

    // 4. Classify using MERGED description
    const detection = detectCategory(block.mergedDescription, block.mergedDescriptionEn);

    // 5a. Rate library match (Path A + B + C)
    let libraryMatchResult = findRateLibraryMatch(
      block.mergedDescription,
      block.mergedDescriptionEn,
      block.primaryRow.unit,
      detection.category,
      rateLibrary,
      (block.primaryRow as any).linked_rate_id,
      approvedRateIds,
    );

    // 5b. Historical mapping fallback (Path A.5) — deterministic, before AI
    if (!libraryMatchResult) {
      libraryMatchResult = findHistoricalMatch(
        block.mergedDescription,
        block.mergedDescriptionEn,
        block.primaryRow.unit,
        historicalMap,
        rateLibrary,
      );
      if (libraryMatchResult) {
        console.log(`📎 Historical match: "${block.mergedDescription.slice(0, 40)}..." → ${libraryMatchResult.item.standard_name_ar} (confidence: ${libraryMatchResult.confidence})`);
      }
    }

    const matchedItem = libraryMatchResult?.item ?? null;
    const matchConfidence = libraryMatchResult?.confidence ?? 0;

    let cost: PricedResult;

    if (matchedItem) {
      libraryHits++;

      const itemSources = sourcesMap.get(matchedItem.id) || [];
      const sourceResolution = resolveFromSources(itemSources, matchedItem.target_rate);

      const displayedSourceCount = Math.max(1, sourceResolution.sourceCount);

      // Check if this item is approved via sources OR library-level metadata
      const isApprovedRate = sourceResolution.method === "approved"
        || ['Approved', 'Field-Approved', 'Revised'].includes(matchedItem.source_type)
        || !!matchedItem.approved_at;

      if (isApprovedRate) {
        // ✅ APPROVED = use rate directly, NO multipliers
        const approvedRate = sourceResolution.method === "approved"
          ? sourceResolution.resolvedRate
          : matchedItem.target_rate;

        const libResult = priceFromApprovedRate(
          approvedRate,
          matchedItem,
          block.quantity,
          locFactor,
          sourceResolution.baseCity || matchedItem.base_city || "",
          projectCity,
        );

        const sourceLabel = sourceResolution.method === "approved"
          ? `✅ Approved Rate: ${sourceResolution.approvedRate} SAR (used directly)`
          : `✅ Library-Approved (${matchedItem.source_type}): ${approvedRate} SAR (used directly)`;

        cost = {
          ...libResult,
          category: detection.category,
          priceFlag: "normal" as const,
          explanation: [
            `📚 Library V2: "${matchedItem.standard_name_ar}"`,
            sourceLabel,
            `Sources: ${displayedSourceCount}`,
            sourceResolution.highVariance ? `⚠️ High variance ${sourceResolution.variance}%` : "",
            `Range: ${matchedItem.min_rate}–${matchedItem.max_rate}`,
            `Region: ${locationMatch.region_ar} (×${libResult.locationFactor})`,
            `Zone: ${locationMatch.zone_class}`,
            `Profit: ${matchedItem.profit_pct}% | Risk: ${libraryItem_risk(matchedItem)}%`,
            `${matchedItem.is_locked ? "🔒 Locked" : "🔓 Open"}`,
            `🎯 Match: ${matchConfidence}% | Ref: ${matchedItem.id}`,
            block.contributorRows.length > 0
              ? `🔗 وصف مدمج من ${block.contributorRows.length + 1} صفوف`
              : "",
          ].filter(Boolean).join(" | "),
        };
      } else {
        // Non-approved match: STILL use exact target_rate — NO multipliers
        const effectiveRate = sourceResolution.resolvedRate || matchedItem.target_rate;
        const libResult = priceFromApprovedRate(
          effectiveRate,
          matchedItem,
          block.quantity,
          locFactor,
          matchedItem.base_city || "",
          projectCity,
        );

        const sourceLabel = sourceResolution.method === "weighted"
          ? `⚖️ Weighted (S:${sourceResolution.supplierAvg ?? "—"} H:${sourceResolution.historicalAvg ?? "—"})`
          : `📚 Library`;

        cost = {
          ...libResult,
          category: detection.category,
          priceFlag: "normal" as const,
          explanation: [
            `📚 Library V2: "${matchedItem.standard_name_ar}"`,
            sourceLabel,
            `Sources: ${Math.max(1, sourceResolution.sourceCount)}`,
            sourceResolution.highVariance ? `⚠️ High variance ${sourceResolution.variance}%` : "",
            `Range: ${matchedItem.min_rate}–${matchedItem.max_rate}`,
            `Region: ${locationMatch.region_ar} (×${libResult.locationFactor})`,
            `Zone: ${locationMatch.zone_class}`,
            `Profit: ${matchedItem.profit_pct}% | Risk: ${libraryItem_risk(matchedItem)}%`,
            `${matchedItem.is_locked ? "🔒 Locked" : "🔓 Open"}`,
            `🎯 Match: ${matchConfidence}% | Ref: ${matchedItem.id}`,
            block.contributorRows.length > 0
              ? `🔗 وصف مدمج من ${block.contributorRows.length + 1} صفوف`
              : "",
          ].filter(Boolean).join(" | "),
        };
      }
    } else {
      // ═══ NO MATCH — no AI fallback, no price generation ═══
      await supabase.from("boq_items").update({
        unit_rate: null,
        total_price: null,
        materials: null,
        labor: null,
        equipment: null,
        logistics: null,
        risk: null,
        profit: null,
        confidence: 0,
        source: "no_match",
        linked_rate_id: null,
        location_factor: null,
        status: "unmatched",
        notes: `🔴 NO MATCH — لم يتم العثور على البند في مكتبة الأسعار | "${block.mergedDescription.slice(0, 80)}"`,
      }).eq("id", block.primaryRow.id);

      processedCount++;
      onProgress?.(processedCount, items.length);
      continue;
    }

    // 6. Deterministic status assignment — no AI confidence checks
    let itemStatus: string;
    if (matchConfidence >= 70) {
      itemStatus = "approved";
    } else {
      // 50-69 range (guaranteed since unmatched items already continued above)
      itemStatus = "needs_review";
      cost.explanation += " | ⚠️ تطابق متوسط — يحتاج مراجعة";
    }

    // 7. Owner-supplied materials: zero out materials and recalculate
    if (ownerMaterials) {
      cost = {
        ...cost,
        materials: 0,
        unitRate: +(cost.labor + cost.equipment + cost.logistics + cost.risk + cost.profit).toFixed(2),
        totalPrice: +(((cost.labor + cost.equipment + cost.logistics + cost.risk + cost.profit) * block.quantity)).toFixed(2),
        explanation: cost.explanation + " | 📦 Owner-supplied materials",
      };
    }

    // 8. Write to primary row in DB
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
        confidence: Math.max(0, Math.min(100, Math.round(matchConfidence))),
        location_factor: cost.locationFactor,
        source: matchConfidence >= 70 ? "library-high" : "library-medium",
        linked_rate_id: matchedItem?.id ?? null,
        status: itemStatus,
        notes: cost.explanation,
      })
      .eq("id", block.primaryRow.id);

    if (updateError) throw new Error(`Failed to update item: ${updateError.message}`);

    totalValue += cost.totalPrice;
    pricedItems.push({
      unitRate: cost.unitRate,
      category: cost.category,
      description: block.mergedDescription,
      priceFlag: cost.priceFlag,
    });

    processedCount++;
    onProgress?.(processedCount, items.length);
  }

  const validation = validatePricingQuality(pricedItems);
  await supabase.from("boq_files").update({ status: "priced" }).eq("id", boqFileId);

  // Update project total using server-side aggregation (no row-limit issues)
  const { data: boqFile } = await supabase.from("boq_files").select("project_id").eq("id", boqFileId).single();
  if (boqFile) {
    await supabase.rpc("recalculate_project_total", { p_project_id: boqFile.project_id });
  }

  const summary = calculateProjectOverhead(totalValue, projectType);

  return {
    totalValue,
    itemCount: pricedItems.length,
    validation,
    libraryHits,
    locationApplied: locationMatch,
    summary,
  };
}

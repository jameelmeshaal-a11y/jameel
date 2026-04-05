/**
 * Main pricing engine V1.3 — orchestrates category detection, rate library lookup,
 * AI fallback calculation, location factors, VAT, and project overhead.
 *
 * Priority: Rate Library → AI Calculation → General Fallback
 *
 * V1.3 changes:
 * - Semantic row grouping: merges zero-qty description rows with priced rows
 * - Manual override protection during repricing
 * - Low-confidence merged items flagged as needs_review
 */

import { supabase } from "@/integrations/supabase/client";
import { textSimilarity, normalizeUnit, tokenize } from "./pricing/similarItemMatcher";
import { detectCategory } from "./pricing/categoryDetector";
import { calculateItemPrice, type PricingContext, type PricedResult } from "./pricing/rateCalculator";
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

export interface PricingResult {
  totalValue: number;
  itemCount: number;
  validation: ValidationResult;
  libraryHits: number;
  locationApplied: LocationFactor;
  summary: ProjectSummary;
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

  // Path B — Similarity scoring (0–100)
  let bestMatch: RateLibraryItem | null = null;
  let bestScore = 0;

  for (const candidate of rateLibrary) {
    // Mandatory: unit must match
    if (normalizeUnit(candidate.unit) !== normalizeUnit(unit)) continue;

    let score = 0;

    // Text similarity (max 60 pts)
    const textScore = Math.max(
      textSimilarity(description, candidate.standard_name_ar || ""),
      textSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
    ) * 60;
    score += textScore;

    // Category match (+15 pts)
    if (candidate.category.toLowerCase().includes(category.replace(/_/g, " ").split(" ")[0])) {
      score += 15;
    }

    // Keyword overlap via tokenize (max 25 pts)
    const srcTokens = tokenize(description + " " + (descriptionEn || ""));
    const candTokens = tokenize((candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || ""));
    const overlapCount = srcTokens.filter(t => candTokens.includes(t)).length;
    score += Math.min(25, overlapCount * 5);

    // Cap at 99
    score = Math.min(score, 99);

    if (score > bestScore && score >= 40) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    return { item: bestMatch, confidence: bestScore };
  }

  // Path C — Approved-rate fallback (lower threshold, only approved entries)
  if (approvedRateIds && approvedRateIds.size > 0) {
    const stripPrefix = (t: string) => t.replace(/^(ال|و|لل|بال)/, "");
    const normalizedUnit_ = normalizeUnit(unit);

    for (const candidate of rateLibrary) {
      if (!approvedRateIds.has(candidate.id)) continue;
      if (normalizeUnit(candidate.unit) !== normalizedUnit_) continue;

      const textScore = Math.max(
        textSimilarity(description, candidate.standard_name_ar || ""),
        textSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
      ) * 60;

      const srcTokens = tokenize(description + " " + (descriptionEn || "")).map(stripPrefix);
      const candTokens = tokenize((candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || "")).map(stripPrefix);
      const overlapCount = srcTokens.filter(t => candTokens.includes(t)).length;
      const kwScore = Math.min(25, overlapCount * 5);

      const score = Math.min(textScore + kwScore, 55);

      if (score >= 20 && score > bestScore) {
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

// ─── Library Pricing ────────────────────────────────────────────────────────

function priceFromLibrary(
  libraryItem: RateLibraryItem,
  quantity: number,
  locationFactor: number,
): Omit<PricedResult, "category" | "explanation" | "priceFlag"> {
  let baseRate = libraryItem.target_rate;

  const complexityFactors: Record<string, number> = { Low: 1.00, Medium: 1.08, High: 1.18 };
  baseRate *= complexityFactors[libraryItem.complexity] ?? 1.08;

  let qtyFactor = 1.00;
  if (quantity > 500) qtyFactor = 0.94;
  else if (quantity > 200) qtyFactor = 0.97;
  else if (quantity < 20) qtyFactor = 1.06;
  baseRate *= qtyFactor;

  baseRate *= locationFactor;

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

/** Helper to get risk pct from library item */
function libraryItem_risk(item: RateLibraryItem): number {
  return item.risk_pct;
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
  // Fetch items, library, location factors, and BoQ file metadata in parallel
  const [itemsResult, libraryResult, locationFactors, sourcesMap, boqFileResult] = await Promise.all([
    supabase.from("boq_items").select("*").eq("boq_file_id", boqFileId).order("row_index", { ascending: true }),
    supabase.from("rate_library").select("*"),
    fetchLocationFactors(),
    fetchAllSources(),
    supabase.from("boq_files").select("*").eq("id", boqFileId).single(),
  ]);

  if (itemsResult.error) throw new Error(`Failed to load items: ${itemsResult.error.message}`);
  const items = itemsResult.data;
  if (!items || items.length === 0) throw new Error("No items found to price.");

  const rateLibrary = (libraryResult.data || []) as unknown as RateLibraryItem[];
  const ownerMaterials = !!(boqFileResult.data as any)?.owner_materials;

  // Build set of approved rate IDs from sources
  const approvedRateIds = new Set<string>();
  for (const [rateId, sources] of sourcesMap.entries()) {
    if (sources.some(s => s.source_type === 'Approved')) {
      approvedRateIds.add(rateId);
    }
  }

  // Resolve location from DB table
  const locationMatch = resolveLocationFactor(cities, locationFactors);
  const locFactor = locationMatch.location_factor;

  const context: PricingContext = { cities, profitMargin: 0.05, riskFactor: 0.03 };

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

    // 5. Rate library match using merged description
    const libraryResult = findRateLibraryMatch(
      block.mergedDescription,
      block.mergedDescriptionEn,
      block.primaryRow.unit,
      detection.category,
      rateLibrary,
      (block.primaryRow as any).linked_rate_id,
      approvedRateIds,
    );
    const matchedItem = libraryResult?.item ?? null;
    const matchConfidence = libraryResult?.confidence ?? 0;

    let cost: PricedResult;
    let extremeDeviation = false;

    if (matchedItem) {
      libraryHits++;

      const itemSources = sourcesMap.get(matchedItem.id) || [];
      const sourceResolution = resolveFromSources(itemSources, matchedItem.target_rate);
      const effectiveLibraryItem = { ...matchedItem, target_rate: sourceResolution.resolvedRate };
      const libResult = priceFromLibrary(effectiveLibraryItem, block.quantity, locFactor);

      const displayedSourceCount = Math.max(1, sourceResolution.sourceCount);
      const sourceLabel = sourceResolution.method === "approved"
        ? `✅ Approved (${sourceResolution.approvedRate} SAR)`
        : sourceResolution.method === "weighted"
        ? `⚖️ Weighted (S:${sourceResolution.supplierAvg ?? "—"} H:${sourceResolution.historicalAvg ?? "—"})`
        : `📚 Library`;

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
          `Region: ${locationMatch.region_ar} (×${locFactor})`,
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
      cost = calculateItemPrice(
        block.mergedDescription,
        block.mergedDescriptionEn,
        block.primaryRow.unit,
        block.quantity,
        detection.category,
        detection.confidence,
        context,
        block.primaryRow.row_index,
      );
      // Apply DB location factor for AI-priced items too
      if (locFactor !== 1.0) {
        const adjustedRate = +(cost.unitRate * locFactor / (cost.locationFactor || 1)).toFixed(2);
        const adjustedTotal = +(adjustedRate * block.quantity).toFixed(2);
        cost = { ...cost, unitRate: adjustedRate, totalPrice: adjustedTotal, locationFactor: locFactor };
        cost.explanation += ` | 📍 Region: ${locationMatch.region_ar} (×${locFactor})`;
      }
      if (block.contributorRows.length > 0) {
        cost.explanation += ` | 🔗 وصف مدمج من ${block.contributorRows.length + 1} صفوف`;
      }

      // Deviation protection: compare AI price against closest library entry
      const normalizedUnit_ = normalizeUnit(block.primaryRow.unit);
      const sameUnitRates = rateLibrary.filter(l => normalizeUnit(l.unit) === normalizedUnit_);
      if (sameUnitRates.length > 0 && cost.unitRate > 0) {
        const closest = sameUnitRates.reduce((a, b) =>
          Math.abs(a.target_rate - cost.unitRate) < Math.abs(b.target_rate - cost.unitRate) ? a : b
        );
        if (closest.target_rate > 0) {
          const deviation = Math.abs(cost.unitRate - closest.target_rate) / closest.target_rate;
          if (deviation > 3.0) {
            extremeDeviation = true;
            cost.confidence = Math.min(cost.confidence, 40);
            cost.explanation += ` | ⚠️ انحراف ${Math.round(deviation * 100)}% عن "${closest.standard_name_ar}" (${closest.target_rate} SAR)`;
          }
        }
      }
    }

    // 6. Confidence-based status assignment
    let itemStatus: string;
    if (matchedItem) {
      if (matchConfidence >= 70) {
        itemStatus = "approved";
      } else {
        itemStatus = "needs_review";
        cost.explanation += " | ⚠️ تطابق متوسط — يحتاج مراجعة";
      }
    } else if (extremeDeviation) {
      itemStatus = "needs_review";
      cost.explanation += " | 🚫 تسعير AI مرفوض — انحراف كبير عن مكتبة الأسعار";
    } else if (detection.confidence < 60 || cost.confidence < 70) {
      cost.confidence = Math.min(cost.confidence, 65);
      itemStatus = "needs_review";
      cost.explanation += " | ⚠️ تسعير بثقة منخفضة — وصف مدمج";
    } else {
      itemStatus = cost.confidence >= 80 ? "approved" : "review";
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
        confidence: matchedItem ? matchConfidence : cost.confidence,
        location_factor: cost.locationFactor,
        source: matchedItem ? (matchConfidence >= 70 ? "library-high" : "library-medium") : "ai",
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

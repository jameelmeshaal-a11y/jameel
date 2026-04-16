/**
 * Matching Engine V3 — Multi-layer rate library matching.
 * 
 * Scoring Pipeline (strict order):
 *   A: item_no exact match → 98 (bypasses all gates)
 *   B: INCOMPATIBLE_GROUPS hard gate → 0
 *   C: extractCleanSegment + textScore < 50 → 0
 *   D: hasConceptConflict → 0
 *   E: historicalMap lookup → 95
 *   → remaining points (dimensions, keywords, codes, containment)
 * 
 * @module matchingV3
 * @version 3.1
 */

import {
  textSimilarity,
  normalizeUnit,
  tokenize,
  charNgramSimilarity,
  overlapCoefficient,
  extractModelCodes,
} from "./similarItemMatcher";

import {
  parseDimensions,
  compareDimensions,
  detectConcepts,
  hasConceptConflict,
  hasSynonymOverlap,
  buildEnrichedDescription,
} from "./synonyms";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  notes?: string | null;
}

export interface MatchResultV3 {
  item: RateLibraryItem;
  confidence: number;
  matchNotes: string;
}

// ─── Historical Mapping Types ───────────────────────────────────────────────

export interface HistoricalMappingV3 {
  normalizedDesc: string;
  tokens: string[];
  linkedRateId: string;
  unit: string;
}

// ─── INCOMPATIBLE_GROUPS ────────────────────────────────────────────────────
// If BoQ category is key, candidate categories in the set are blocked.

export const INCOMPATIBLE_GROUPS: Record<string, Set<string>> = {
  doors:       new Set(["windows", "plumbing", "hvac", "electrical", "concrete", "earthworks"]),
  windows:     new Set(["doors", "plumbing", "hvac", "electrical", "concrete", "earthworks"]),
  plumbing:    new Set(["doors", "windows", "hvac", "electrical", "concrete", "earthworks"]),
  hvac:        new Set(["doors", "windows", "plumbing", "electrical", "concrete", "earthworks"]),
  electrical:  new Set(["doors", "windows", "plumbing", "hvac", "concrete", "earthworks"]),
  concrete:    new Set(["doors", "windows", "plumbing", "hvac", "electrical", "earthworks"]),
  earthworks:  new Set(["doors", "windows", "plumbing", "hvac", "electrical", "concrete"]),
};

/**
 * Check if two categories are compatible (not in each other's incompatible set).
 */
export function areCategoriesCompatible(catA: string, catB: string): boolean {
  const normA = catA.toLowerCase().split("_")[0];
  const normB = catB.toLowerCase().split("_")[0];
  if (normA === normB) return true;
  const blocked = INCOMPATIBLE_GROUPS[normA];
  if (blocked && blocked.has(normB)) return false;
  return true;
}

// ─── extractCleanSegment ────────────────────────────────────────────────────

/**
 * Extract the last meaningful segment from a hierarchical description.
 * E.g. "أعمال معمارية — أبواب — باب خشب MD-05" → "باب خشب MD-05"
 */
export function extractCleanSegment(desc: string): string {
  if (!desc) return desc;
  // Split by common Arabic hierarchy separators
  const separators = /[—\/\-–]/;
  const parts = desc.split(separators).map(p => p.trim()).filter(p => p.length >= 3);
  if (parts.length === 0) return desc;
  return parts[parts.length - 1];
}

// ─── Scoring Weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  TEXT_SIMILARITY: 50,
  CATEGORY_MATCH: 15,
  KEYWORD_OVERLAP: 20,
  EXACT_CODE_MATCH: 40,
  CODE_MISMATCH: -25,
  DIMENSION_MATCH: 15,
  DIMENSION_MISMATCH: -20,
  SYNONYM_BOOST: 10,
  CONTAINMENT_BONUS: 20,
  LIBRARY_KEYWORDS: 15,
  PARENT_CONTEXT_BOOST: 10,
  CORRECTION_NOTES_BOOST: 12,
} as const;

// ─── Main V3 Matcher ────────────────────────────────────────────────────────

/**
 * Find the best rate library match using V3 multi-layer scoring.
 * Updated signature: accepts item_no and historicalMap for stages A and E.
 */
export function findRateLibraryMatchV3(
  description: string,
  descriptionEn: string,
  unit: string,
  category: string,
  rateLibrary: RateLibraryItem[],
  linkedRateId?: string | null,
  approvedRateIds?: Set<string>,
  notes?: string | null,
  itemNo?: string | null,
  historicalMap?: HistoricalMappingV3[],
): { item: RateLibraryItem; confidence: number } | null {
  // Path A — Direct lookup (trusted, not scored)
  if (linkedRateId) {
    const linked = rateLibrary.find((rate) => rate.id === linkedRateId);
    if (linked) return { item: linked, confidence: 95 };
  }

  // Enrich description with parent context if short
  const enrichedDesc = buildEnrichedDescription(description, notes);
  const useEnriched = enrichedDesc !== description;

  // Pre-compute BoQ item features
  const fullText = enrichedDesc + " " + (descriptionEn || "");
  const boqCodes = extractModelCodes(fullText);
  const boqTokens = tokenize(fullText);
  const boqDimensions = parseDimensions(fullText);
  const boqConcepts = detectConcepts(fullText);
  const cleanSegment = extractCleanSegment(enrichedDesc);

  let bestMatch: RateLibraryItem | null = null;
  let bestScore = 0;
  let bestNotes = "";

  for (const candidate of rateLibrary) {
    // Unit gate — hard gate
    const unitMatch = normalizeUnit(candidate.unit) === normalizeUnit(unit);
    if (!unitMatch) continue;

    const result = scoreCandidate(
      enrichedDesc, descriptionEn, category, cleanSegment,
      boqCodes, boqTokens, boqDimensions, boqConcepts,
      candidate, useEnriched, itemNo, historicalMap,
    );

    if (result.score > bestScore && result.score >= 50) {
      bestScore = result.score;
      bestMatch = candidate;
      bestNotes = result.notes;
    }
  }

  if (bestMatch) {
    return { item: bestMatch, confidence: bestScore };
  }

  // Path C — Approved-rate fallback (threshold 50, capped at 55)
  if (approvedRateIds && approvedRateIds.size > 0) {
    const normalizedUnit_ = normalizeUnit(unit);
    let fallbackMatch: RateLibraryItem | null = null;
    let fallbackScore = 0;

    for (const candidate of rateLibrary) {
      if (!approvedRateIds.has(candidate.id)) continue;
      if (normalizeUnit(candidate.unit) !== normalizedUnit_) continue;

      const result = scoreCandidate(
        enrichedDesc, descriptionEn, category, cleanSegment,
        boqCodes, boqTokens, boqDimensions, boqConcepts,
        candidate, useEnriched, itemNo, historicalMap,
      );

      const cappedScore = Math.min(result.score, 55);
      if (cappedScore >= 50 && cappedScore > fallbackScore) {
        fallbackScore = cappedScore;
        fallbackMatch = candidate;
      }
    }

    if (fallbackMatch) {
      return { item: fallbackMatch, confidence: Math.min(fallbackScore, 55) };
    }
  }

  return null;
}

// ─── Candidate Scoring (Stages A→E + remaining) ────────────────────────────

interface ScoringResult {
  score: number;
  notes: string;
}

function scoreCandidate(
  description: string,
  descriptionEn: string,
  category: string,
  cleanSegment: string,
  boqCodes: string[],
  boqTokens: string[],
  boqDimensions: ReturnType<typeof parseDimensions>,
  boqConcepts: string[],
  candidate: RateLibraryItem,
  usedParentContext: boolean,
  itemNo?: string | null,
  historicalMap?: HistoricalMappingV3[],
): ScoringResult {
  const parts: string[] = [];

  // ════════════════════════════════════════════════════════════════════
  // STAGE A: item_no exact match → 98 (bypasses ALL other stages)
  // ════════════════════════════════════════════════════════════════════
  if (itemNo && itemNo.trim().length > 0 && candidate.item_code && candidate.item_code.trim().length > 0) {
    const normalizedItemNo = itemNo.trim().toLowerCase();
    const normalizedCandCode = candidate.item_code.trim().toLowerCase();
    // Check ≥95% similarity (for near-exact matches like "MD-05" vs "MD-05")
    if (normalizedItemNo === normalizedCandCode) {
      parts.push(`⚡ item_no exact: ${itemNo} = ${candidate.item_code} → 98`);
      return { score: 98, notes: parts.join(" | ") };
    }
    // Also check if one contains the other (e.g., "J2-MD-05" contains "MD-05")
    if (normalizedItemNo.includes(normalizedCandCode) || normalizedCandCode.includes(normalizedItemNo)) {
      const shorter = Math.min(normalizedItemNo.length, normalizedCandCode.length);
      const longer = Math.max(normalizedItemNo.length, normalizedCandCode.length);
      if (shorter / longer >= 0.95) {
        parts.push(`⚡ item_no ~exact: ${itemNo} ≈ ${candidate.item_code} → 98`);
        return { score: 98, notes: parts.join(" | ") };
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STAGE B: INCOMPATIBLE_GROUPS hard gate → 0
  // ════════════════════════════════════════════════════════════════════
  if (!areCategoriesCompatible(category, candidate.category)) {
    parts.push(`⛔ category-gate: ${category} ↔ ${candidate.category}`);
    return { score: 0, notes: parts.join(" | ") };
  }

  // ════════════════════════════════════════════════════════════════════
  // STAGE C: extractCleanSegment + text similarity
  // ════════════════════════════════════════════════════════════════════
  const candCleanSegment = extractCleanSegment(
    (candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || "")
  );

  // For merged descriptions (Header — Sub — Item), also try the last segment
  const descSegments = [description];
  if (cleanSegment !== description && cleanSegment.length > 3) {
    descSegments.push(cleanSegment);
  }

  const candFullText = [
    candidate.standard_name_ar || "",
    candidate.standard_name_en || "",
    candidate.item_description || "",
    ...(candidate.item_name_aliases || []),
  ];

  let textScore = 0;
  for (const candText of candFullText) {
    if (!candText) continue;
    for (const descVariant of descSegments) {
      textScore = Math.max(
        textScore,
        textSimilarity(descVariant, candText) * WEIGHTS.TEXT_SIMILARITY,
      );
    }
    textScore = Math.max(
      textScore,
      textSimilarity(descriptionEn || "", candText) * WEIGHTS.TEXT_SIMILARITY,
    );
  }

  // Also try char n-gram (max 30 pts, take better of token vs ngram)
  const ngramScore = Math.max(
    charNgramSimilarity(description, candidate.standard_name_ar || ""),
    charNgramSimilarity(descriptionEn || "", candidate.standard_name_en || ""),
  ) * 30;

  const effectiveTextScore = Math.max(textScore, ngramScore);

  // ════════════════════════════════════════════════════════════════════
  // STAGE D: hasConceptConflict on clean segment → 0
  // ════════════════════════════════════════════════════════════════════
  const candConcepts = detectConcepts(
    (candidate.standard_name_ar || "") + " " +
    (candidate.standard_name_en || "") + " " +
    (candidate.item_description || "")
  );

  if (boqConcepts.length > 0 && candConcepts.length > 0) {
    if (hasConceptConflict(boqConcepts, candConcepts)) {
      parts.push(`⛔ anti-confusion: ${boqConcepts[0]}↔${candConcepts[0]}`);
      return { score: 0, notes: parts.join(" | ") };
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STAGE E: historicalMap lookup → 95
  // ════════════════════════════════════════════════════════════════════
  if (historicalMap && historicalMap.length > 0) {
    for (const hist of historicalMap) {
      if (hist.linkedRateId === candidate.id) {
        // Check if this historical mapping matches our description
        const histTokens = new Set(hist.tokens);
        const matchTokens = boqTokens.filter(t => histTokens.has(t)).length;
        const union = new Set([...boqTokens, ...hist.tokens]).size;
        const jaccard = union > 0 ? matchTokens / union : 0;
        if (jaccard >= 0.85) {
          parts.push(`📎 historical: jaccard=${(jaccard * 100).toFixed(0)}% → 95`);
          return { score: 95, notes: parts.join(" | ") };
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Remaining scoring layers
  // ════════════════════════════════════════════════════════════════════
  let score = 0;

  // Text similarity score
  score += effectiveTextScore;
  parts.push(`text:${effectiveTextScore.toFixed(0)}`);

  // Category match (+15 pts)
  const catFirst = category.replace(/_/g, " ").split(" ")[0];
  if (candidate.category.toLowerCase().includes(catFirst)) {
    score += WEIGHTS.CATEGORY_MATCH;
    parts.push(`cat:+${WEIGHTS.CATEGORY_MATCH}`);
  }

  // Keyword overlap (max 20 pts)
  const candTokens = tokenize(
    (candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || "")
  );
  const overlapCount = boqTokens.filter(t => candTokens.includes(t)).length;
  const kwScore = Math.min(WEIGHTS.KEYWORD_OVERLAP, overlapCount * 5);
  score += kwScore;
  if (kwScore > 0) parts.push(`kw:+${kwScore}`);

  // Model/code matching — EXACT match required
  if (boqCodes.length > 0) {
    const candText = [
      candidate.standard_name_ar || "",
      candidate.standard_name_en || "",
      candidate.item_code || "",
      candidate.item_description || "",
      ...(candidate.item_name_aliases || []),
    ].join(" ");
    const candCodes = extractModelCodes(candText);

    if (candCodes.length > 0) {
      const hasExactMatch = boqCodes.some(c => candCodes.includes(c));
      if (hasExactMatch) {
        score += WEIGHTS.EXACT_CODE_MATCH;
        parts.push(`code:+${WEIGHTS.EXACT_CODE_MATCH}`);
      } else {
        score += WEIGHTS.CODE_MISMATCH;
        parts.push(`code:${WEIGHTS.CODE_MISMATCH}`);
      }
    }
  }

  // Dimension comparison
  const candDimensions = parseDimensions(
    (candidate.standard_name_ar || "") + " " +
    (candidate.standard_name_en || "") + " " +
    (candidate.item_description || "")
  );
  const dimResult = compareDimensions(boqDimensions, candDimensions);
  if (dimResult === 1) {
    score += WEIGHTS.DIMENSION_MATCH;
    parts.push(`dim:+${WEIGHTS.DIMENSION_MATCH}`);
  } else if (dimResult === -1) {
    const boqHasWxH = boqDimensions.some(d => d.type === "dimensions" && d.values.length >= 2);
    const candHasWxH = candDimensions.some(d => d.type === "dimensions" && d.values.length >= 2);
    if (boqHasWxH && candHasWxH) {
      parts.push(`⛔ dim-mismatch: hard skip (WxH differs)`);
      return { score: 0, notes: parts.join(" | ") };
    }
    score += WEIGHTS.DIMENSION_MISMATCH;
    parts.push(`dim:${WEIGHTS.DIMENSION_MISMATCH}`);
  }

  // Synonym boost
  if (boqConcepts.length > 0 && candConcepts.length > 0) {
    if (hasSynonymOverlap(boqConcepts, candConcepts)) {
      score += WEIGHTS.SYNONYM_BOOST;
      parts.push(`syn:+${WEIGHTS.SYNONYM_BOOST}`);
    }
  }

  // Containment bonus
  const overlapCoeff = Math.max(
    overlapCoefficient(description, candidate.standard_name_ar || ""),
    overlapCoefficient(description, candidate.item_description || ""),
    overlapCoefficient(descriptionEn || "", candidate.standard_name_en || ""),
  );
  if (overlapCoeff >= 0.8) {
    score += WEIGHTS.CONTAINMENT_BONUS;
    parts.push(`contain:+${WEIGHTS.CONTAINMENT_BONUS}`);
  }

  // Library keywords field
  if (candidate.keywords?.length > 0) {
    const kwSet = new Set(candidate.keywords.map(k => k.toLowerCase()));
    const kwHits = boqTokens.filter(t => kwSet.has(t)).length;
    const libKwScore = Math.min(WEIGHTS.LIBRARY_KEYWORDS, kwHits * 5);
    score += libKwScore;
    if (libKwScore > 0) parts.push(`libkw:+${libKwScore}`);
  }

  // Parent context boost
  if (usedParentContext && effectiveTextScore > 20) {
    score += WEIGHTS.PARENT_CONTEXT_BOOST;
    parts.push(`parent:+${WEIGHTS.PARENT_CONTEXT_BOOST}`);
  }

  // Correction notes boost
  if (candidate.notes) {
    const correctionMatches = candidate.notes.match(/\[تصحيح[^\]]*\]:\s*(.+)/g);
    if (correctionMatches && correctionMatches.length > 0) {
      const correctionText = correctionMatches.join(" ");
      const correctionTokens = new Set(tokenize(correctionText));
      const corrHits = boqTokens.filter(t => correctionTokens.has(t)).length;
      const corrScore = Math.min(WEIGHTS.CORRECTION_NOTES_BOOST, corrHits * 4);
      if (corrScore > 0) {
        score += corrScore;
        parts.push(`corr:+${corrScore}`);
      }
    }
  }

  // Cap at 99
  score = Math.min(score, 99);
  score = Math.max(score, 0);

  return { score, notes: parts.join(" | ") };
}

/**
 * Matching Engine V4 — STRICT 4-stage pipeline (each stage is a gate).
 *
 * Stage 1 — item_no ≥95% (scoped to same boq_file_id) → confidence 99, STOP
 * Stage 2 — Category + Unit gate (filter pool, no score)
 * Stage 3 — Description (normalized + synonyms + similarity) → confidence ≥85, STOP
 * Stage 4 — Bundled strict composite (≥75) → confidence, STOP
 * Else   — null (item stays pending). NO loose fallback below 75.
 *
 * @module matchingV3
 * @version 4.0
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

// ─── Spec-aware Hard Gates (V4.2) ──────────────────────────────────────────

/**
 * Extract wall/element thickness in mm from Arabic/English text.
 * Matches: "بسمك 200 مم", "200mm", "thickness 150mm", "سمك 100"
 * Returns the FIRST thickness found (typically the most relevant — wall body).
 */
export function extractThickness(text: string): number | null {
  if (!text) return null;
  const t = String(text).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
  // Patterns covering Arabic and English
  const patterns = [
    /(?:بسمك|سمك|سماكة|thickness|thick)\s*[:\-]?\s*(\d{2,4})\s*(?:مم|mm|ملم|mil)?/i,
    /(\d{2,4})\s*(?:مم|mm|ملم)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (isFinite(n) && n >= 20 && n <= 2000) return n;
    }
  }
  return null;
}

/**
 * Detect fire-rating in description.
 * Returns 0 (none), or rating in minutes (60, 90, 120, 180, 240).
 */
export function extractFireRating(text: string): number {
  if (!text) return 0;
  const t = String(text).toLowerCase().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
  const hasFireKeyword = /(مقاوم.{0,10}حريق|fire[\s-]?rated?|fire[\s-]?resist|مقاومة\s*للحريق)/i.test(t);
  if (!hasFireKeyword) return 0;
  // Extract minutes — Arabic word boundary doesn't work, use lookahead/start
  const mm = t.match(/(\d{2,3})\s*(?:دقيقة|دقائق|دقيقه|min(?:ute)?s?|m(?=in))/i);
  if (mm) {
    const n = parseInt(mm[1], 10);
    if ([30, 45, 60, 90, 120, 180, 240].includes(n)) return n;
  }
  return 1;
}

// ─── extractCleanSegment ────────────────────────────────────────────────────

/**
 * Extract the last meaningful segment from a hierarchical description.
 * E.g. "أعمال معمارية — أبواب — باب خشب MD-05" → "باب خشب MD-05"
 */
export function extractCleanSegment(desc: string): string {
  if (!desc) return desc;
  // Split by common Arabic hierarchy separators (— and –) but NOT single hyphen (used in codes like MD-05)
  const separators = /[—–\/]/;
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

// ─── Main V4 Matcher (strict 4-stage pipeline) ─────────────────────────────

/**
 * Find the best rate library match using V4 strict pipeline.
 *
 * @param sameFileLibraryIds  Set of rate_library IDs that already have a linked
 *                            BoQ item in the SAME boq_file. Stage 1 (item_no
 *                            ≥95% → 99) only fires for candidates in this set
 *                            to prevent cross-file item_no leakage.
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
  sameFileLibraryIds?: Set<string>,
): { item: RateLibraryItem; confidence: number } | null {
  // linked_rate_id is a HINT (validated), not a hard override.
  let linkedHint: RateLibraryItem | null = null;
  if (linkedRateId) {
    const linked = rateLibrary.find((rate) => rate.id === linkedRateId);
    if (linked) linkedHint = linked;
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
    // ── Stage 2 GATE — Unit (hard) ──
    if (normalizeUnit(candidate.unit) !== normalizeUnit(unit)) continue;

    // ── Stage 1 scope: item_no Hard Override only for same-file candidates ──
    // For other candidates we skip Stage A inside scoreCandidate by clearing itemNo.
    const allowItemNoStage =
      !!itemNo &&
      !!sameFileLibraryIds &&
      sameFileLibraryIds.has(candidate.id);

    const result = scoreCandidate(
      enrichedDesc, descriptionEn, category, cleanSegment,
      boqCodes, boqTokens, boqDimensions, boqConcepts,
      candidate, useEnriched,
      allowItemNoStage ? itemNo : null,
      historicalMap,
    );

    // linked_rate_id bonus (+5) only if no conflict triggered
    let finalScore = result.score;
    if (linkedHint && candidate.id === linkedHint.id && result.score > 0) {
      finalScore = Math.min(99, result.score + 5);
    }

    // ── Stage 4 STRICT THRESHOLD: minimum 80. No loose fallback. ──
    if (finalScore > bestScore && finalScore >= 80) {
      bestScore = finalScore;
      bestMatch = candidate;
      bestNotes = result.notes + (finalScore !== result.score ? ` | 📎 linked-hint:+5` : "");
    }
  }

  if (bestMatch) {
    return { item: bestMatch, confidence: bestScore };
  }

  // NO loose approved-rate fallback below 75 (removed in V4 strict pipeline).
  // Items that don't reach 75 stay pending for manual review.
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
  // STAGE 1: item_no exact match (≥95%) → 99 (HARD OVERRIDE, scoped by caller)
  // GOVERNANCE LAYER 5: requires Category + Unit compatibility before firing,
  // so the first wrong link cannot lock the rest of the file on a wrong category.
  // ════════════════════════════════════════════════════════════════════
  if (itemNo && itemNo.trim().length > 0 && candidate.item_code && candidate.item_code.trim().length > 0) {
    const stage1CategoryOk = areCategoriesCompatible(category, candidate.category);
    // Unit was already gated upstream, but assert again here defensively
    if (stage1CategoryOk) {
      const normalizedItemNo = itemNo.trim().toLowerCase();
      const normalizedCandCode = candidate.item_code.trim().toLowerCase();
      if (normalizedItemNo === normalizedCandCode) {
        parts.push(`⚡ item_no exact (cat+unit OK): ${itemNo} = ${candidate.item_code} → 99`);
        return { score: 99, notes: parts.join(" | ") };
      }
      if (normalizedItemNo.includes(normalizedCandCode) || normalizedCandCode.includes(normalizedItemNo)) {
        const shorter = Math.min(normalizedItemNo.length, normalizedCandCode.length);
        const longer = Math.max(normalizedItemNo.length, normalizedCandCode.length);
        if (shorter / longer >= 0.95) {
          parts.push(`⚡ item_no ~exact (cat+unit OK): ${itemNo} ≈ ${candidate.item_code} → 99`);
          return { score: 99, notes: parts.join(" | ") };
        }
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
  // STAGE B.1: SPEC GATES (V4.2) — thickness + fire-rating
  // Prevents "wall 100mm", "wall 200mm", "wall 200mm fire-60", "wall 200mm fire-120"
  // from all matching the same candidate (most common cause of identical pricing
  // across distinct items).
  // ════════════════════════════════════════════════════════════════════
  const candFullSpec =
    (candidate.standard_name_ar || "") + " " +
    (candidate.standard_name_en || "") + " " +
    (candidate.item_description || "") + " " +
    (candidate.item_name_aliases || []).join(" ");

  // Fire-rating — HARD BLOCK on mismatch
  const boqFire = extractFireRating(description + " " + (descriptionEn || ""));
  const candFire = extractFireRating(candFullSpec);
  // If either side flags fire, both must agree (or both have specific minutes that match)
  if (boqFire > 0 || candFire > 0) {
    if (boqFire !== candFire) {
      // Allow generic-flag (1) to match any specific rating only when the other is 0
      // i.e. enforce: presence-of-fire must match
      const boqHasFire = boqFire > 0;
      const candHasFire = candFire > 0;
      if (boqHasFire !== candHasFire) {
        parts.push(`⛔ fire-gate: BoQ=${boqFire} vs Lib=${candFire}`);
        return { score: 0, notes: parts.join(" | ") };
      }
      // Both have fire flag, but specific minutes differ → also block
      if (boqFire > 1 && candFire > 1 && boqFire !== candFire) {
        parts.push(`⛔ fire-min-gate: ${boqFire}min ≠ ${candFire}min`);
        return { score: 0, notes: parts.join(" | ") };
      }
    }
  }

  // Thickness — HARD PENALTY (-40) on mismatch
  // Prevents wall 100mm matching wall 200mm at same score
  const boqThk = extractThickness(description + " " + (descriptionEn || ""));
  const candThk = extractThickness(candFullSpec);
  let thicknessPenalty = 0;
  if (boqThk !== null && candThk !== null && boqThk !== candThk) {
    thicknessPenalty = -40;
    parts.push(`⚠ thickness-mismatch: ${boqThk}mm≠${candThk}mm (-40)`);
  } else if (boqThk !== null && candThk !== null && boqThk === candThk) {
    parts.push(`✓ thickness-match: ${boqThk}mm`);
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

  // Apply spec-aware penalties (V4.2 — thickness mismatch)
  score += thicknessPenalty;

  // Cap at 99
  score = Math.min(score, 99);
  score = Math.max(score, 0);

  return { score, notes: parts.join(" | ") };
}

/**
 * Matching Engine V3 — Multi-layer rate library matching.
 * 
 * ISOLATED MODULE: Does NOT modify any existing matching logic.
 * Called via feature flag in pricingEngine.ts.
 * 
 * Improvements over V2:
 * 1. Dimension-aware scoring (diameter/size match/mismatch)
 * 2. Anti-confusion gate (prevents wrong category matches)
 * 3. Synonym boost (equivalent terms score higher)
 * 4. Parent context enrichment (short items inherit context)
 * 5. Exact code match vs code mismatch penalty
 * 
 * @module matchingV3
 * @version 3.0
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
  matchNotes: string; // human-readable explanation of scoring
}

// ─── Scoring Weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  TEXT_SIMILARITY: 50,       // max points from text comparison
  CATEGORY_MATCH: 15,       // category alignment
  KEYWORD_OVERLAP: 20,      // keyword token hits (max)
  EXACT_CODE_MATCH: 40,     // exact model/ref code match
  CODE_MISMATCH: -25,       // both have codes but they differ
  DIMENSION_MATCH: 15,      // dimensions match exactly
  DIMENSION_MISMATCH: -20,  // dimensions conflict
  SYNONYM_BOOST: 10,        // synonym concept overlap
  CONTAINMENT_BONUS: 20,    // overlap coefficient ≥ 0.8
  LIBRARY_KEYWORDS: 15,     // hits against library keywords field
  PARENT_CONTEXT_BOOST: 10, // enriched description improved the score
  CORRECTION_NOTES_BOOST: 12, // correction notes keyword match
} as const;

// ─── Main V3 Matcher ────────────────────────────────────────────────────────

/**
 * Find the best rate library match using V3 multi-layer scoring.
 * Contract: same signature and return type as legacy findRateLibraryMatch.
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
): { item: RateLibraryItem; confidence: number } | null {
  // Path A — Direct lookup with dimension validation
  if (linkedRateId) {
    const linked = rateLibrary.find((rate) => rate.id === linkedRateId);
    if (linked) {
      // Validate dimensions match before trusting the link
      const boqDimsCheck = parseDimensions(description + " " + (descriptionEn || ""));
      const linkedDimsCheck = parseDimensions(
        (linked.standard_name_ar || "") + " " + (linked.standard_name_en || "")
      );
      const boqHasWxH = boqDimsCheck.some(d => d.type === "dimensions" && d.values.length >= 2);
      const linkedHasWxH = linkedDimsCheck.some(d => d.type === "dimensions" && d.values.length >= 2);
      const boqHasThick = boqDimsCheck.some(d => d.type === "thickness");
      const linkedHasThick = linkedDimsCheck.some(d => d.type === "thickness");
      const wxhConflict = boqHasWxH && linkedHasWxH && compareDimensions(boqDimsCheck, linkedDimsCheck) === -1;
      const thickConflict = boqHasThick && linkedHasThick && 
        boqDimsCheck.filter(d => d.type === "thickness").some(bT =>
          linkedDimsCheck.filter(d => d.type === "thickness").some(cT => Math.abs(bT.values[0] - cT.values[0]) >= 1)
        );
      
      if (wxhConflict || thickConflict) {
        // Dimensions mismatch — fall through to scoring instead of blind trust
        console.log(`[V3] linked_rate_id ${linkedRateId} dimension mismatch, re-scoring`);
      } else {
        return { item: linked, confidence: 95 };
      }
    }
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

  // Collect all viable candidates for magnitude guard
  interface ScoredCandidate {
    candidate: RateLibraryItem;
    score: number;
    textScore: number;
    notes: string;
  }
  const viableCandidates: ScoredCandidate[] = [];

  for (const candidate of rateLibrary) {
    // Unit gate — hard gate for units
    const unitMatch = normalizeUnit(candidate.unit) === normalizeUnit(unit);
    if (!unitMatch) continue;

    const result = scoreCandidate(
      enrichedDesc, descriptionEn, category,
      boqCodes, boqTokens, boqDimensions, boqConcepts,
      candidate, useEnriched,
    );

    if (result.score >= 50) {
      viableCandidates.push({
        candidate,
        score: result.score,
        textScore: result.textScore,
        notes: result.notes,
      });
    }
  }

  if (viableCandidates.length > 0) {
    // Sort by total score descending
    viableCandidates.sort((a, b) => b.score - a.score);
    let best = viableCandidates[0];

    // ── Sub-item vs System Guard ───────────────────────────────────────
    // When description contains "—" (enriched with parent), the full text
    // may match a system-level library entry perfectly. Extract the last
    // segment (actual item) and re-score — prefer cheaper items that match
    // the last segment better.
    if (enrichedDesc.includes("—") && viableCandidates.length >= 1) {
      const lastSegment = enrichedDesc.split("—").pop()?.trim();
      if (lastSegment && lastSegment.length > 3) {
        const bestPrice = best.candidate.target_rate || best.candidate.base_rate;
        
        // Re-score all candidates using ONLY the last segment
        let segmentBest: typeof best | null = null;
        for (const vc of viableCandidates) {
          const vcPrice = vc.candidate.target_rate || vc.candidate.base_rate;
          // Only consider if significantly cheaper (>5x difference)
          if (bestPrice > 0 && vcPrice > 0 && bestPrice / vcPrice > 5) {
            const candTexts = [
              vc.candidate.standard_name_ar || "",
              vc.candidate.standard_name_en || "",
              ...(vc.candidate.item_name_aliases || []),
            ];
            const segSim = Math.max(...candTexts.map(t => t ? textSimilarity(lastSegment, t) : 0));
            if (segSim > 0.3 && (!segmentBest || segSim > (segmentBest as any)._segSim)) {
              segmentBest = { ...vc, score: Math.max(vc.score - 10, 50) } as any;
              (segmentBest as any)._segSim = segSim;
            }
          }
        }
        
        if (segmentBest && segmentBest.candidate.id !== best.candidate.id) {
          const segPrice = segmentBest.candidate.target_rate || segmentBest.candidate.base_rate;
          console.log(
            `[V3] ⚠️ Sub-item Guard: "${lastSegment}" — system price ${bestPrice} → item price ${segPrice}`
          );
          best = segmentBest;
          best.notes += ` | ⚠️ sub-item-guard: last-segment match, price ${bestPrice}→${segPrice}`;
        }
      }
    }

    // ── Price Magnitude Guard ──────────────────────────────────────────
    // If multiple candidates exist with extreme price variance (>10x),
    // prefer the one with highest text similarity to avoid catastrophic mismatch.
    if (viableCandidates.length >= 2) {
      const prices = viableCandidates
        .map(c => c.candidate.target_rate || c.candidate.base_rate)
        .filter(p => p > 0);
      
      if (prices.length >= 2) {
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        
        if (minPrice > 0 && maxPrice / minPrice > 10) {
          // Extreme variance detected — pick highest text score instead
          const textBest = viableCandidates.reduce((prev, curr) =>
            curr.textScore > prev.textScore ? curr : prev
          );
          
          if (textBest.candidate.id !== best.candidate.id) {
            const bestPrice = best.candidate.target_rate || best.candidate.base_rate;
            const textBestPrice = textBest.candidate.target_rate || textBest.candidate.base_rate;
            console.log(
              `[V3] ⚠️ Price Magnitude Guard: ${maxPrice}/${minPrice} = ${(maxPrice/minPrice).toFixed(0)}x. ` +
              `Switching from ${bestPrice} to ${textBestPrice} (higher text score)`
            );
            best = textBest;
          }
          // Reduce confidence by 15 to flag for review
          best = { ...best, score: Math.max(best.score - 15, 50) };
          best.notes += ` | ⚠️ magnitude-guard: ${(maxPrice/minPrice).toFixed(0)}x variance, confidence -15`;
        }
      }
    }

    // ── Absolute Price Cap Guard ───────────────────────────────────────
    // For common unit items (عدد/Each), if price > 20,000 and there's only
    // one candidate, cap confidence at 70 to force review
    const finalPrice = best.candidate.target_rate || best.candidate.base_rate;
    if (finalPrice > 20000 && viableCandidates.length === 1 && best.score > 70) {
      best = { ...best, score: 70 };
      best.notes += ` | ⚠️ high-price-cap: single match at ${finalPrice}, confidence capped at 70`;
      console.log(`[V3] ⚠️ High Price Cap: single match at ${finalPrice}, confidence capped at 70`);
    }

    return { item: best.candidate, confidence: best.score };
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
        enrichedDesc, descriptionEn, category,
        boqCodes, boqTokens, boqDimensions, boqConcepts,
        candidate, useEnriched,
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

// ─── Candidate Scoring ──────────────────────────────────────────────────────

interface ScoringResult {
  score: number;
  textScore: number;
  notes: string;
}

function scoreCandidate(
  description: string,
  descriptionEn: string,
  category: string,
  boqCodes: string[],
  boqTokens: string[],
  boqDimensions: ReturnType<typeof parseDimensions>,
  boqConcepts: string[],
  candidate: RateLibraryItem,
  usedParentContext: boolean,
): ScoringResult {
  const parts: string[] = [];
  let score = 0;

  // 1. Text similarity (max WEIGHTS.TEXT_SIMILARITY pts)
  // For merged descriptions (Header — Sub — Item), also try the last segment
  const descSegments = [description];
  if (description.includes("—")) {
    const lastSegment = description.split("—").pop()?.trim();
    if (lastSegment && lastSegment.length > 3) {
      descSegments.push(lastSegment);
    }
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
  score += effectiveTextScore;
  parts.push(`text:${effectiveTextScore.toFixed(0)}`);

  // 2. Category match (+15 pts)
  const catFirst = category.replace(/_/g, " ").split(" ")[0];
  if (candidate.category.toLowerCase().includes(catFirst)) {
    score += WEIGHTS.CATEGORY_MATCH;
    parts.push(`cat:+${WEIGHTS.CATEGORY_MATCH}`);
  }

  // 3. Keyword overlap (max 20 pts)
  const candTokens = tokenize(
    (candidate.standard_name_ar || "") + " " + (candidate.standard_name_en || "")
  );
  const overlapCount = boqTokens.filter(t => candTokens.includes(t)).length;
  const kwScore = Math.min(WEIGHTS.KEYWORD_OVERLAP, overlapCount * 5);
  score += kwScore;
  if (kwScore > 0) parts.push(`kw:+${kwScore}`);

  // 4. Model/code matching — EXACT match required
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
        // Both have codes but they differ — penalty
        score += WEIGHTS.CODE_MISMATCH;
        parts.push(`code:${WEIGHTS.CODE_MISMATCH}`);
      }
    }
  }

  // 5. Dimension comparison
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
    // Hard gate: if both have explicit WxH dimensions and they differ, zero out (like anti-confusion)
    const boqHasWxH = boqDimensions.some(d => d.type === "dimensions" && d.values.length >= 2);
    const candHasWxH = candDimensions.some(d => d.type === "dimensions" && d.values.length >= 2);
    if (boqHasWxH && candHasWxH) {
      parts.push(`⛔ dim-mismatch: hard skip (WxH differs)`);
      return { score: 0, textScore: 0, notes: parts.join(" | ") };
    }
    // Hard gate: if both have explicit thickness and they differ, zero out
    const boqHasThickness = boqDimensions.some(d => d.type === "thickness");
    const candHasThickness = candDimensions.some(d => d.type === "thickness");
    if (boqHasThickness && candHasThickness) {
      const thickConflict = boqDimensions
        .filter(d => d.type === "thickness")
        .some(bT => candDimensions
          .filter(d => d.type === "thickness")
          .some(cT => Math.abs(bT.values[0] - cT.values[0]) >= 1)
        );
      if (thickConflict) {
        parts.push(`⛔ thickness-mismatch: hard skip`);
        return { score: 0, textScore: 0, notes: parts.join(" | ") };
      }
    }
    score += WEIGHTS.DIMENSION_MISMATCH;
    parts.push(`dim:${WEIGHTS.DIMENSION_MISMATCH}`);
  }

  // 6. Synonym / Anti-confusion
  const candConcepts = detectConcepts(
    (candidate.standard_name_ar || "") + " " +
    (candidate.standard_name_en || "") + " " +
    (candidate.item_description || "")
  );

  if (boqConcepts.length > 0 && candConcepts.length > 0) {
    // Anti-confusion gate — zero score if conflicting concepts
    if (hasConceptConflict(boqConcepts, candConcepts)) {
      parts.push(`⛔ anti-confusion: ${boqConcepts[0]}↔${candConcepts[0]}`);
      return { score: 0, textScore: 0, notes: parts.join(" | ") };
    }

    // Synonym boost
    if (hasSynonymOverlap(boqConcepts, candConcepts)) {
      score += WEIGHTS.SYNONYM_BOOST;
      parts.push(`syn:+${WEIGHTS.SYNONYM_BOOST}`);
    }
  }

  // 7. Containment bonus
  const overlapCoeff = Math.max(
    overlapCoefficient(description, candidate.standard_name_ar || ""),
    overlapCoefficient(description, candidate.item_description || ""),
    overlapCoefficient(descriptionEn || "", candidate.standard_name_en || ""),
  );
  if (overlapCoeff >= 0.8) {
    score += WEIGHTS.CONTAINMENT_BONUS;
    parts.push(`contain:+${WEIGHTS.CONTAINMENT_BONUS}`);
  }

  // 8. Library keywords field
  if (candidate.keywords?.length > 0) {
    const kwSet = new Set(candidate.keywords.map(k => k.toLowerCase()));
    const kwHits = boqTokens.filter(t => kwSet.has(t)).length;
    const libKwScore = Math.min(WEIGHTS.LIBRARY_KEYWORDS, kwHits * 5);
    score += libKwScore;
    if (libKwScore > 0) parts.push(`libkw:+${libKwScore}`);
  }

  // 9. Parent context boost
  if (usedParentContext && effectiveTextScore > 20) {
    score += WEIGHTS.PARENT_CONTEXT_BOOST;
    parts.push(`parent:+${WEIGHTS.PARENT_CONTEXT_BOOST}`);
  }

  // 10. Correction notes boost — leverage user corrections for better matching
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

  return { score, textScore: effectiveTextScore, notes: parts.join(" | ") };
}

/**
 * Similar item matching logic for propagation.
 * Matches items by category, unit, and description similarity.
 * V2: Enhanced Arabic normalization + deterministic matching support.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SimilarItem {
  id: string;
  item_no: string;
  description: string;
  description_en: string;
  unit: string;
  unit_rate: number | null;
  total_price: number | null;
  quantity: number;
  boq_file_id: string;
  confidence: number; // match confidence 0-100
  project_name?: string;
  project_id?: string;
}

// ─── Arabic Normalization ───────────────────────────────────────────────────

/**
 * Aggressive Arabic text normalization for deterministic comparison.
 * Strips diacritics, normalizes letter variants, removes prefixes,
 * and sorts tokens alphabetically for order-independent matching.
 */
export function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")       // strip tashkeel + tatweel
    .replace(/[أإآ]/g, "ا")             // normalize alef variants
    .replace(/ة/g, "ه")                 // taa marbuta → haa
    .replace(/ى/g, "ي")                 // alef maqsura → yaa
    .replace(/\s+/g, " ")
    .trim()
    .split(/[\s,،./-]+/)
    .map(w => w.replace(/^(ال|وال|بال|لل|و|ب|ل|ك|ف)/, ""))
    .filter(w => w.length > 1)
    .sort()
    .join(" ");
}

/**
 * Tokenize text with Arabic-aware normalization.
 * Strips diacritics, normalizes letter variants, removes common prefixes.
 * Min token length: 2 characters.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")       // strip tashkeel
    .replace(/[أإآ]/g, "ا")             // normalize alef
    .replace(/ة/g, "ه")                 // taa marbuta
    .replace(/ى/g, "ي")                 // alef maqsura
    .split(/[\s,،./-]+/)
    .map(w => w.replace(/^(ال|وال|بال|لل|و|ب)/, ""))
    .filter(w => w.length > 1);          // min 2 chars (was 3)
}

/**
 * Character-level trigram Jaccard similarity.
 * Catches reformulated Arabic text with different word boundaries.
 */
export function charNgramSimilarity(a: string, b: string, n: number = 3): number {
  if (!a || !b) return 0;
  const norm = (s: string) => s.toLowerCase()
    .replace(/[ًٌٍَُِّْـ\s]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

  const na = norm(a);
  const nb = norm(b);
  if (na.length < n || nb.length < n) return 0;

  const ngrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) {
      set.add(s.substring(i, i + n));
    }
    return set;
  };

  const setA = ngrams(na);
  const setB = ngrams(nb);
  const intersection = [...setA].filter(g => setB.has(g)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Unit Normalization ─────────────────────────────────────────────────────

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase()
    .replace(/م3|m3|م\.م/g, "m3")
    .replace(/م2|m2/g, "m2")
    .replace(/م\.ط|m\.l|l\.m/g, "ml")
    .replace(/عدد|no|pcs/g, "no");
}

// ─── Overlap Coefficient ────────────────────────────────────────────────────

/**
 * Overlap coefficient: intersection / min(|A|, |B|).
 * Scores 1.0 when all tokens of the shorter text exist in the longer text.
 * Fixes the "short BoQ vs long library" mismatch problem.
 */
export function overlapCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? intersection / minSize : 0;
}

// ─── Model/Code Extraction ─────────────────────────────────────────────────

/**
 * Extract alphanumeric model/reference codes from text.
 * Matches: TSD-2, HOK-2, REF-1, CA-1, WT01, نموذج -1, نموذج-21
 */
export function extractModelCodes(text: string): string[] {
  if (!text) return [];
  const codes: string[] = [];

  // Latin codes: 2+ letters followed by optional separator and digits
  const latinPattern = /\b([A-Za-z]{2,}\s*-?\s*\d+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = latinPattern.exec(text)) !== null) {
    codes.push(match[1].replace(/\s+/g, "").toLowerCase());
  }

  // Arabic model pattern: نموذج followed by separator and number
  const modelPattern = /نموذج\s*[-.‐–]\s*(\d+)/g;
  while ((match = modelPattern.exec(text)) !== null) {
    codes.push(`model-${match[1]}`);
  }

  // Standalone patterns like "مقاس 30X600X600" → extract dimension code
  const dimPattern = /(\d+[Xx×]\d+[Xx×]?\d*)/g;
  while ((match = dimPattern.exec(text)) !== null) {
    codes.push(match[1].toLowerCase().replace(/[x×]/g, "x"));
  }

  return [...new Set(codes)];
}

// ─── Text Similarity ────────────────────────────────────────────────────────

/**
 * Returns max of Jaccard similarity and overlap coefficient.
 * This ensures short-but-correct descriptions still score high.
 */
export function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const minSize = Math.min(setA.size, setB.size);
  const overlap = minSize > 0 ? intersection / minSize : 0;
  return Math.max(jaccard, overlap);
}

// ─── Similar Item Search ────────────────────────────────────────────────────

/**
 * Find similar items within a single project's BoQ file.
 */
export async function findSimilarInProject(
  sourceItem: { description: string; description_en: string; unit: string; id: string },
  boqFileId: string,
): Promise<SimilarItem[]> {
  const { data: items } = await supabase
    .from("boq_items")
    .select("*")
    .eq("boq_file_id", boqFileId)
    .neq("id", sourceItem.id);

  if (!items) return [];
  return scoreAndFilter(sourceItem, items);
}

/**
 * Find similar items across ALL projects.
 */
export async function findSimilarGlobally(
  sourceItem: { description: string; description_en: string; unit: string; id: string },
): Promise<SimilarItem[]> {
  const { data: items } = await supabase
    .from("boq_items")
    .select("*")
    .neq("id", sourceItem.id)
    .limit(500);

  if (!items) return [];

  const fileIds = [...new Set(items.map(i => i.boq_file_id))];
  const { data: files } = await supabase
    .from("boq_files")
    .select("id, project_id, name")
    .in("id", fileIds);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name");

  const fileProjectMap = new Map<string, { projectId: string; projectName: string }>();
  if (files && projects) {
    const projMap = new Map(projects.map(p => [p.id, p.name]));
    for (const f of files) {
      fileProjectMap.set(f.id, {
        projectId: f.project_id,
        projectName: projMap.get(f.project_id) || "Unknown",
      });
    }
  }

  const scored = scoreAndFilter(sourceItem, items);
  return scored.map(item => {
    const proj = fileProjectMap.get(item.boq_file_id);
    return { ...item, project_name: proj?.projectName, project_id: proj?.projectId };
  });
}

function scoreAndFilter(
  source: { description: string; description_en: string; unit: string },
  candidates: any[],
): SimilarItem[] {
  const results: SimilarItem[] = [];

  for (const item of candidates) {
    let score = 0;

    if (normalizeUnit(item.unit) !== normalizeUnit(source.unit)) continue;
    score += 20;

    const descSim = textSimilarity(source.description, item.description);
    const descEnSim = textSimilarity(source.description_en || "", item.description_en || "");
    const bestSim = Math.max(descSim, descEnSim);

    if (bestSim < 0.3) continue;
    score += Math.round(bestSim * 60);

    const srcWords = tokenize(source.description + " " + (source.description_en || ""));
    const candWords = tokenize(item.description + " " + (item.description_en || ""));
    const overlap = srcWords.filter(w => candWords.includes(w)).length;
    score += Math.min(20, overlap * 5);

    score = Math.min(99, score);

    results.push({
      id: item.id,
      item_no: item.item_no,
      description: item.description,
      description_en: item.description_en,
      unit: item.unit,
      unit_rate: item.unit_rate,
      total_price: item.total_price,
      quantity: item.quantity,
      boq_file_id: item.boq_file_id,
      confidence: score,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

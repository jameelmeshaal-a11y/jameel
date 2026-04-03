/**
 * Similar item matching logic for propagation.
 * Matches items by category, unit, and description similarity.
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
  // Get all boq items across all files
  const { data: items } = await supabase
    .from("boq_items")
    .select("*")
    .neq("id", sourceItem.id)
    .limit(500);

  if (!items) return [];

  // Get project info for context
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

    // Unit match (required — skip if different)
    if (normalizeUnit(item.unit) !== normalizeUnit(source.unit)) continue;
    score += 20;

    // Description similarity
    const descSim = textSimilarity(source.description, item.description);
    const descEnSim = textSimilarity(source.description_en || "", item.description_en || "");
    const bestSim = Math.max(descSim, descEnSim);

    if (bestSim < 0.3) continue; // Too different
    score += Math.round(bestSim * 60);

    // Keyword overlap boost
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

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase()
    .replace(/م3|m3|م\.م/g, "m3")
    .replace(/م2|m2/g, "m2")
    .replace(/م\.ط|m\.l|l\.m/g, "ml")
    .replace(/عدد|no|pcs/g, "no");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s,،./-]+/).filter(w => w.length > 2);
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union; // Jaccard similarity
}

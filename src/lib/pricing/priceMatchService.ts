import { supabase } from "@/integrations/supabase/client";

export interface PriceMatch {
  id: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit: string;
  unit_price: number;
  item_code: string;
  confidence: number;
  match_level: "auto" | "suggestion" | "none";
}

const cache = new Map<string, { matches: PriceMatch[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function matchItemToLibrary(
  description: string,
  unit?: string,
  opts?: { item_no?: string; boq_file_id?: string; category?: string },
): Promise<PriceMatch[]> {
  if (!description || description.length < 3) return [];

  const key = `${description}|${unit || ""}|${opts?.item_no || ""}|${opts?.boq_file_id || ""}|${opts?.category || ""}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.matches;

  try {
    const { data, error } = await supabase.functions.invoke("match-price-item", {
      body: {
        item_name: description,
        unit,
        item_no: opts?.item_no,
        boq_file_id: opts?.boq_file_id,
        category: opts?.category,
      },
    });
    if (error) return [];
    const matches: PriceMatch[] = data?.matches || [];
    cache.set(key, { matches, ts: Date.now() });
    return matches;
  } catch {
    return [];
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function matchItemDebounced(
  description: string,
  unit: string | undefined,
  callback: (matches: PriceMatch[]) => void,
  delay = 300,
  opts?: { item_no?: string; boq_file_id?: string; category?: string },
) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const matches = await matchItemToLibrary(description, unit, opts);
    callback(matches);
  }, delay);
}

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

export async function matchItemToLibrary(description: string, unit?: string): Promise<PriceMatch[]> {
  if (!description || description.length < 3) return [];

  const key = `${description}|${unit || ""}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.matches;

  try {
    const { data, error } = await supabase.functions.invoke("match-price-item", {
      body: { item_name: description, unit, item_no: itemNo },
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
  itemNo?: string,
) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const matches = await matchItemToLibrary(description, unit, itemNo);
    callback(matches);
  }, delay);
}

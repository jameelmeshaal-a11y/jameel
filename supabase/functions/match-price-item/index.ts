import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Arabic normalization (mirrors client-side logic)
function normalizeArabicText(text: string): string {
  if (!text) return "";
  let t = text;
  // Strip tashkeel
  t = t.replace(/[\u064B-\u065F\u0670]/g, "");
  // Normalize alef variants
  t = t.replace(/[أإآ]/g, "ا");
  // Taa marbuta → haa
  t = t.replace(/ة/g, "ه");
  // Alef maqsura → yaa
  t = t.replace(/ى/g, "ي");
  // Strip common prefixes per token
  const tokens = t
    .split(/\s+/)
    .map((w) => w.replace(/^(وال|بال|لل|ال|و)/, ""))
    .filter((w) => w.length >= 2)
    .sort();
  return tokens.join(" ");
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeArabicText(text);
  return normalized.split(/\s+/).filter((t) => t.length >= 2);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function jaccardTokens(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a), setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

interface LibraryItem {
  id: string;
  standard_name_ar: string;
  standard_name_en: string;
  item_name_aliases: string[] | null;
  keywords: string[] | null;
  category: string;
  unit: string;
  base_rate: number;
  target_rate: number;
  item_code: string | null;
  is_locked: boolean;
}

interface MatchResult {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { item_name, unit } = await req.json();
    if (!item_name || typeof item_name !== "string") {
      return new Response(JSON.stringify({ error: "item_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: items, error } = await supabase
      .from("rate_library")
      .select("id, standard_name_ar, standard_name_en, item_name_aliases, keywords, category, unit, base_rate, target_rate, item_code, is_locked");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queryNorm = normalizeArabicText(item_name);
    const queryTokens = tokenize(item_name);
    const queryLower = item_name.toLowerCase();

    const matches: MatchResult[] = [];

    for (const item of (items || []) as LibraryItem[]) {
      let bestScore = 0;

      // Score against Arabic name
      const arNorm = normalizeArabicText(item.standard_name_ar);
      const arTokens = tokenize(item.standard_name_ar);
      
      // Exact normalized match
      if (queryNorm === arNorm && queryNorm.length > 0) {
        bestScore = 98;
      } else {
        // Jaccard token similarity
        const jaccard = jaccardTokens(queryTokens, arTokens);
        bestScore = Math.max(bestScore, jaccard * 100);

        // Levenshtein-based similarity on normalized text
        if (queryNorm.length > 0 && arNorm.length > 0) {
          const maxLen = Math.max(queryNorm.length, arNorm.length);
          const levSim = (1 - levenshtein(queryNorm, arNorm) / maxLen) * 100;
          bestScore = Math.max(bestScore, levSim);
        }
      }

      // Score against English name
      if (item.standard_name_en) {
        const enLower = item.standard_name_en.toLowerCase();
        if (queryLower === enLower) {
          bestScore = Math.max(bestScore, 98);
        } else {
          const enTokens = tokenize(item.standard_name_en);
          const jaccard = jaccardTokens(queryTokens.map(t => t.toLowerCase()), enTokens.map(t => t.toLowerCase()));
          bestScore = Math.max(bestScore, jaccard * 100);
        }
      }

      // Score against aliases
      if (item.item_name_aliases && item.item_name_aliases.length > 0) {
        for (const alias of item.item_name_aliases) {
          const aliasNorm = normalizeArabicText(alias);
          if (queryNorm === aliasNorm && queryNorm.length > 0) {
            bestScore = Math.max(bestScore, 95);
          } else {
            const aliasTokens = tokenize(alias);
            const jaccard = jaccardTokens(queryTokens, aliasTokens);
            bestScore = Math.max(bestScore, jaccard * 95);
          }
        }
      }

      // Unit bonus/penalty
      if (unit && item.unit) {
        const normUnit = (u: string) => u.toLowerCase().replace(/[^a-z0-9أ-ي]/g, "");
        if (normUnit(unit) === normUnit(item.unit)) {
          bestScore = Math.min(100, bestScore + 3);
        } else {
          bestScore = Math.max(0, bestScore - 10);
        }
      }

      if (bestScore >= 50) {
        matches.push({
          id: item.id,
          name_ar: item.standard_name_ar,
          name_en: item.standard_name_en,
          category: item.category,
          unit: item.unit,
          unit_price: item.target_rate || item.base_rate,
          item_code: item.item_code || "",
          confidence: Math.round(bestScore),
          match_level: bestScore >= 70 ? "auto" : "suggestion",
        });
      }
    }

    // Sort by confidence descending, limit to top 5
    matches.sort((a, b) => b.confidence - a.confidence);
    const topMatches = matches.slice(0, 5);

    return new Response(JSON.stringify({ matches: topMatches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

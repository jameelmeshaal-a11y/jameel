import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Arabic normalization (mirrors client-side logic)
function normalizeArabicText(text: string): string {
  if (!text) return "";
  let t = text;
  t = t.replace(/[\u064B-\u065F\u0670]/g, "");
  t = t.replace(/[أإآ]/g, "ا");
  t = t.replace(/ة/g, "ه");
  t = t.replace(/ى/g, "ي");
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

// ─── Category Detection (regex-based, mirrors categoryDetector.ts) ──────────

type DetectedCategory = string;

function detectItemCategory(name: string): DetectedCategory {
  const text = (name || "").toLowerCase();
  
  const rules: [DetectedCategory, RegExp][] = [
    ["doors", /باب|أبواب|door/i],
    ["windows", /نافذة|شباك|نوافذ|window/i],
    ["plumbing_fixtures", /مغسلة|حوض|مرحاض|toilet|basin|sink|خلاط|صنبور|أدوات صحية|sanitary|حنفية|مرايات/i],
    ["plumbing_pipes", /مواسير صرف|مواسير مياه|pipe|أنابيب|سباكة|plumb/i],
    ["hvac_equipment", /تكييف|مكيف|air condition|chiller|وحدة تبريد|split unit|مراوح|طرد هواء/i],
    ["hvac_ductwork", /مجاري هواء|duct|دكت|مجلفن|مخرج هواء/i],
    ["fire_fighting", /إطفاء|fire|حريق|رشاش|sprinkler|إنذار|alarm/i],
    ["electrical_fixtures", /إنارة|light|مفتاح|switch|بريزة|socket|outlet|كشاف|luminaire/i],
    ["electrical_panels", /لوحة كهرب|panel|لوحة توزيع|distribution board|MDB|SDB/i],
    ["steel_misc", /فتحة\s*وصول|access\s*hatch|roof\s*hatch/i],
    ["steel_structural", /هيكل حديد|steel structure|حديد إنشائي/i],
    ["blockwork", /بلوك|طوب|block|brick|حوائط سمك/i],
    ["tiling", /بلاط|سيراميك|رخام|tile|ceramic|marble|granite|بورسلين|porcelain/i],
    ["painting", /دهان|طلاء|paint|بويه|ايبوكسي|إيبوكسي|epoxy/i],
    ["plastering", /لياسة|بياض|plaster|render/i],
    ["waterproofing", /عزل مائي|waterproof|ممبرين|membrane/i],
    ["ceiling", /أسقف مستعارة|سقف مستعار|ceiling|جبس بورد|gypsum/i],
  ];

  for (const [cat, regex] of rules) {
    if (regex.test(text)) return cat;
  }
  return "general";
}

// ─── Arabic General Categories (treated as compatible with everything) ───────

const ARABIC_GENERAL_CATEGORIES = new Set([
  'تشطيبات', 'عام', 'أعمال معمارية', 'أعمال كهربائية',
  'أعمال ميكانيكية', 'أعمال صحية', 'أعمال مدنية',
]);

// ─── Category Compatibility Gate ────────────────────────────────────────────

const INCOMPATIBLE_GROUPS: Record<string, string[]> = {
  doors: ['windows', 'plumbing_fixtures', 'plumbing_pipes', 'hvac_equipment', 'hvac_ductwork'],
  windows: ['doors', 'plumbing_fixtures', 'plumbing_pipes', 'hvac_equipment', 'steel_misc'],
  plumbing_fixtures: ['doors', 'windows', 'hvac_equipment', 'steel_misc', 'electrical_fixtures'],
  plumbing_pipes: ['doors', 'windows', 'hvac_equipment', 'steel_misc', 'electrical_fixtures'],
  hvac_equipment: ['doors', 'windows', 'plumbing_fixtures', 'steel_misc'],
  hvac_ductwork: ['doors', 'windows', 'plumbing_fixtures', 'steel_misc'],
  electrical_fixtures: ['plumbing_fixtures', 'plumbing_pipes', 'hvac_equipment'],
  electrical_panels: ['plumbing_fixtures', 'plumbing_pipes', 'doors', 'windows'],
};

function areCategoriesCompatible(queryCategory: string, libraryCategory: string): boolean {
  if (queryCategory === "general" || libraryCategory === "general") return true;
  // Arabic library categories are treated as general — always compatible
  if (ARABIC_GENERAL_CATEGORIES.has(libraryCategory)) return true;
  if (ARABIC_GENERAL_CATEGORIES.has(queryCategory)) return true;
  // If category not in INCOMPATIBLE_GROUPS at all, treat as general
  if (!(queryCategory in INCOMPATIBLE_GROUPS) && !(libraryCategory in INCOMPATIBLE_GROUPS)) return true;
  const blocked = INCOMPATIBLE_GROUPS[queryCategory];
  if (blocked && blocked.includes(libraryCategory)) return false;
  const reverseBlocked = INCOMPATIBLE_GROUPS[libraryCategory];
  if (reverseBlocked && reverseBlocked.includes(queryCategory)) return false;
  return true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { item_name, unit, item_no } = await req.json();
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

    // ── Layer 3: Detect query category for gate ──
    const queryCategory = detectItemCategory(item_name);

    // ── Pre-scan: item_no Hard Override ──────────────────────────────
    // If item_no matches a library name at ≥95% with unit match → return immediately
    const cleanItemNo = (item_no || "").trim();
    if (cleanItemNo && cleanItemNo.length >= 4) {
      const itemNoNorm = normalizeArabicText(cleanItemNo);
      const itemNoTokens = tokenize(cleanItemNo);

      for (const item of (items || []) as LibraryItem[]) {
        // Unit gate
        if (unit && item.unit) {
          const normUnit = (u: string) => u.toLowerCase().replace(/[^a-z0-9أ-ي]/g, "");
          if (normUnit(unit) !== normUnit(item.unit)) continue;
        }
        // Category gate
        if (!areCategoriesCompatible(queryCategory, item.category)) continue;

        // Check item_no against library names
        const namesToCheck = [
          item.standard_name_ar,
          item.standard_name_en,
          ...(item.item_name_aliases || []),
        ].filter(Boolean);

        let bestItemNoScore = 0;
        for (const name of namesToCheck) {
          const nameNorm = normalizeArabicText(name);
          if (itemNoNorm === nameNorm && itemNoNorm.length > 0) {
            bestItemNoScore = 100;
            break;
          }
          const nameTokens = tokenize(name);
          const jaccard = jaccardTokens(itemNoTokens, nameTokens);
          bestItemNoScore = Math.max(bestItemNoScore, jaccard * 100);
          if (itemNoNorm.length > 0 && nameNorm.length > 0) {
            const maxLen = Math.max(itemNoNorm.length, nameNorm.length);
            const levSim = (1 - levenshtein(itemNoNorm, nameNorm) / maxLen) * 100;
            bestItemNoScore = Math.max(bestItemNoScore, levSim);
          }
        }

        if (bestItemNoScore >= 95) {
          return new Response(JSON.stringify({
            matches: [{
              id: item.id,
              name_ar: item.standard_name_ar,
              name_en: item.standard_name_en,
              category: item.category,
              unit: item.unit,
              unit_price: item.target_rate || item.base_rate,
              item_code: item.item_code || "",
              confidence: 99,
              match_level: "auto" as const,
            }],
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const matches: MatchResult[] = [];

    for (const item of (items || []) as LibraryItem[]) {
      // ⛔ Category Hard Gate — skip incompatible categories
      if (!areCategoriesCompatible(queryCategory, item.category)) {
        continue;
      }

      let bestScore = 0;

      // Score against Arabic name
      const arNorm = normalizeArabicText(item.standard_name_ar);
      const arTokens = tokenize(item.standard_name_ar);
      
      if (queryNorm === arNorm && queryNorm.length > 0) {
        bestScore = 98;
      } else {
        const jaccard = jaccardTokens(queryTokens, arTokens);
        bestScore = Math.max(bestScore, jaccard * 100);

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

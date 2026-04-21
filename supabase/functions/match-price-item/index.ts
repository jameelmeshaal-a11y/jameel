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

// ─── INCOMPATIBLE_GROUPS (mirrors client-side matchingV3) ───────────────────
const INCOMPATIBLE_GROUPS: Record<string, Set<string>> = {
  doors:       new Set(["windows", "plumbing", "hvac", "electrical", "concrete", "earthworks"]),
  windows:     new Set(["doors", "plumbing", "hvac", "electrical", "concrete", "earthworks"]),
  plumbing:    new Set(["doors", "windows", "hvac", "electrical", "concrete", "earthworks"]),
  hvac:        new Set(["doors", "windows", "plumbing", "electrical", "concrete", "earthworks"]),
  electrical:  new Set(["doors", "windows", "plumbing", "hvac", "concrete", "earthworks"]),
  concrete:    new Set(["doors", "windows", "plumbing", "hvac", "electrical", "earthworks"]),
  earthworks:  new Set(["doors", "windows", "plumbing", "hvac", "electrical", "concrete"]),
};

function areCategoriesCompatible(catA: string, catB: string): boolean {
  const normA = catA.toLowerCase().split("_")[0];
  const normB = catB.toLowerCase().split("_")[0];
  if (normA === normB) return true;
  const blocked = INCOMPATIBLE_GROUPS[normA];
  if (blocked && blocked.has(normB)) return false;
  return true;
}

// ─── V4.3 SPEC GATES (mirrors client-side matchingV3) ─────────────────────
function toAscii(s: string): string {
  return String(s ?? "").replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
                        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
}

function extractThickness(text: string): number | null {
  if (!text) return null;
  const t = toAscii(text);
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

function extractFireRating(text: string): number {
  if (!text) return 0;
  const t = toAscii(text).toLowerCase();
  if (!/(مقاوم.{0,10}حريق|fire[\s-]?rated?|fire[\s-]?resist|مقاومة\s*للحريق)/i.test(t)) return 0;
  const mm = t.match(/(\d{2,3})\s*(?:دقيقة|دقائق|دقيقه|min(?:ute)?s?|m(?=in))/i);
  if (mm) {
    const n = parseInt(mm[1], 10);
    if ([30, 45, 60, 90, 120, 180, 240].includes(n)) return n;
  }
  return 1;
}

function extractItemModelCodes(text: string): string[] {
  if (!text) return [];
  const t = toAscii(text);
  const re = /\b([A-Za-z]{1,5})[-_ ]?(\d{1,4})([A-Za-z])?\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const letters = m[1].toUpperCase();
    if (["MM","CM","KG","KW","HP","HZ","VA","KV","CV","MT","ML"].includes(letters)) continue;
    out.add(`${letters}${m[2]}${(m[3] || "").toUpperCase()}`);
  }
  return [...out];
}

function extractDiameters(text: string): number[] {
  if (!text) return [];
  const t = toAscii(text).toLowerCase();
  const re = /(?:قطر|dia(?:meter)?|d|ø|⌀|nb|dn)\s*[:\-]?\s*(\d{2,4})\s*(?:مم|mm|ملم)?/gi;
  const out = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const n = parseInt(m[1], 10);
    if (isFinite(n) && n >= 10 && n <= 2000) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function extractSizeTuples(text: string): string[] {
  if (!text) return [];
  const t = toAscii(text);
  const re = /(\d{2,5})\s*[x×*]\s*(\d{2,5})(?:\s*[x×*]\s*(\d{2,5}))?/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const dims = [m[1], m[2], m[3]].filter(Boolean).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    out.add(dims.join("x"));
  }
  return [...out];
}

function extractRanges(text: string): string[] {
  if (!text) return [];
  const t = toAscii(text);
  const re = /(\d{1,5})\s*[-–]\s*(\d{1,5})\s*(l\/s|cfm|cmh|m3\/h|كجم|kg|kw|w|hp)?/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    if (!isFinite(lo) || !isFinite(hi) || lo >= hi || lo < 1 || hi - lo < 2) continue;
    out.add(`${lo}-${hi}${(m[3] || "").toLowerCase()}`);
  }
  return [...out];
}

// Simple category detection from Arabic text
function detectCategoryFromText(text: string): string {
  const t = text.toLowerCase();
  if (/باب|أبواب|door/.test(t)) return "doors";
  if (/نافذة|شباك|نوافذ|window/.test(t)) return "windows";
  if (/صمام|أنابيب|مواسير|صرف|plumbing|pipe/.test(t)) return "plumbing";
  if (/تكييف|مجاري هواء|hvac|duct/.test(t)) return "hvac";
  if (/كابل|كهرب|لوحة توزيع|electrical/.test(t)) return "electrical";
  if (/خرسانة|concrete|بلاطة|slab/.test(t)) return "concrete";
  if (/حفر|ردم|earthwork/.test(t)) return "earthworks";
  return "general";
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
    const { item_name, unit, category: reqCategory, item_no, boq_file_id } = await req.json();
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

    // Stage 1 scope: rate_library IDs already linked in the same boq_file
    const sameFileLibIds = new Set<string>();
    if (boq_file_id && typeof boq_file_id === "string") {
      const { data: linked } = await supabase
        .from("boq_items")
        .select("linked_rate_id")
        .eq("boq_file_id", boq_file_id)
        .not("linked_rate_id", "is", null);
      for (const r of (linked || []) as Array<{ linked_rate_id: string | null }>) {
        if (r.linked_rate_id) sameFileLibIds.add(r.linked_rate_id);
      }
    }

    const queryNorm = normalizeArabicText(item_name);
    const queryTokens = tokenize(item_name);
    const queryLower = item_name.toLowerCase();
    const boqCategory = reqCategory || detectCategoryFromText(item_name);
    const normUnit = (u: string) => (u || "").toLowerCase().replace(/[^a-z0-9أ-ي]/g, "");
    const reqUnitNorm = unit ? normUnit(unit) : "";

    const matches: MatchResult[] = [];

    for (const item of (items || []) as LibraryItem[]) {
      // ── Stage 2 GATE: Category compatibility ──
      if (!areCategoriesCompatible(boqCategory, item.category)) continue;

      // ── Stage 2 GATE: Unit must match (when provided) ──
      if (reqUnitNorm && item.unit && normUnit(item.unit) !== reqUnitNorm) continue;

      // ── Stage 1 (item_no Hard Override → 99) — scoped to same boq_file ──
      if (item_no && item.item_code && sameFileLibIds.has(item.id)) {
        const a = String(item_no).trim().toLowerCase();
        const b = item.item_code.trim().toLowerCase();
        if (a && b && (a === b ||
          ((a.includes(b) || b.includes(a)) &&
            Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.95))) {
          matches.push({
            id: item.id,
            name_ar: item.standard_name_ar,
            name_en: item.standard_name_en,
            category: item.category,
            unit: item.unit,
            unit_price: item.target_rate || item.base_rate,
            item_code: item.item_code || "",
            confidence: 99,
            match_level: "auto",
          });
          continue;
        }
      }

      // ── V4.3 SPEC GATES — applied before scoring ──
      const candFullSpec = `${item.standard_name_ar || ""} ${item.standard_name_en || ""} ${(item.item_name_aliases || []).join(" ")} ${item.item_code || ""}`;
      const boqFire = extractFireRating(item_name);
      const candFire = extractFireRating(candFullSpec);
      if ((boqFire > 0) !== (candFire > 0)) continue;
      if (boqFire > 1 && candFire > 1 && boqFire !== candFire) continue;

      const boqThk = extractThickness(item_name);
      const candThk = extractThickness(candFullSpec);
      if (boqThk !== null && candThk !== null && boqThk !== candThk) continue;

      const boqCodes = extractItemModelCodes(item_name);
      const candCodes = extractItemModelCodes(candFullSpec);
      if (boqCodes.length > 0 && candCodes.length > 0 && !boqCodes.some(c => candCodes.includes(c))) continue;

      const boqDia = extractDiameters(item_name);
      const candDia = extractDiameters(candFullSpec);
      if (boqDia.length > 0 && candDia.length > 0 && !boqDia.some(d => candDia.includes(d))) continue;

      const boqTuples = extractSizeTuples(item_name);
      const candTuples = extractSizeTuples(candFullSpec);
      if (boqTuples.length > 0 && candTuples.length > 0 && !boqTuples.some(t => candTuples.includes(t))) continue;

      const boqRanges = extractRanges(item_name);
      const candRanges = extractRanges(candFullSpec);
      if (boqRanges.length > 0 && candRanges.length > 0 && !boqRanges.some(r => candRanges.includes(r))) continue;

      // ── Stage 3 + 4: Description scoring on the gated pool ──
      let bestScore = 0;

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

      if (item.standard_name_en) {
        const enLower = item.standard_name_en.toLowerCase();
        if (queryLower === enLower) {
          bestScore = Math.max(bestScore, 98);
        } else {
          const enTokens = tokenize(item.standard_name_en);
          const jaccard = jaccardTokens(
            queryTokens.map((t) => t.toLowerCase()),
            enTokens.map((t) => t.toLowerCase())
          );
          bestScore = Math.max(bestScore, jaccard * 100);
        }
      }

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

      // Unit was already gated; small bonus for explicit confirmation
      if (reqUnitNorm && item.unit && normUnit(item.unit) === reqUnitNorm) {
        bestScore = Math.min(100, bestScore + 3);
      }

      // ── STRICT THRESHOLD: ≥80 (governance V4.1). Below = no match ──
      if (bestScore >= 80) {
        matches.push({
          id: item.id,
          name_ar: item.standard_name_ar,
          name_en: item.standard_name_en,
          category: item.category,
          unit: item.unit,
          unit_price: item.target_rate || item.base_rate,
          item_code: item.item_code || "",
          confidence: Math.round(bestScore),
          match_level: "auto",
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

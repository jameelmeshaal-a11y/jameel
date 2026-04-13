/**
 * Synonym dictionary & dimension parser for Matching V3.
 * Isolated module — does NOT modify any existing logic.
 * 
 * @module synonyms
 * @version 3.0
 */

// ─── Synonym Groups ────────────────────────────────────────────────────────
// Each key is a canonical concept. Values are all known expressions for it.
// Used for: (1) boosting matches between equivalent terms, (2) anti-confusion gating.

export const SYNONYM_GROUPS: Record<string, string[]> = {
  // ── Plumbing ──
  "صمام_بوابة": ["صمام بوابة", "gate valve", "محبس بوابة", "محبس", "بوابي"],
  "صمام_فراشة": ["صمام فراشة", "butterfly valve", "محبس فراشة"],
  "صمام_عدم_رجوع": ["صمام عدم رجوع", "check valve", "صمام ارتداد", "non return valve"],
  "منفس_هواء": ["منفس هواء", "AAV", "air admittance valve", "صمام تهوية", "air vent"],
  "مصفاة": ["مصفاة", "strainer", "فلتر", "مرشح"],
  
  // ── Pipes ──
  "انابيب_UPVC": ["أنابيب UPVC", "مواسير UPVC", "انابيب يو بي في سي", "UPVC pipe", "مواسير صرف"],
  "انابيب_PPR": ["أنابيب PPR", "مواسير PPR", "أنابيب بولي بروبلين", "PPR pipe"],
  "انابيب_حديد": ["أنابيب حديد", "مواسير حديد", "أنابيب حديد مجلفن", "GI pipe", "galvanized pipe"],
  "انابيب_نحاس": ["أنابيب نحاس", "مواسير نحاس", "copper pipe", "copper tube"],

  // ── Fire Protection ──
  "رشاش_متدلي": ["رشاش متدلي", "pendent sprinkler", "رشاش معلق", "pendent", "متدلي"],
  "رشاش_جانبي": ["رشاش جانبي", "sidewall sprinkler", "رشاش حائطي", "sidewall", "جانبي"],
  "رشاش_قائم": ["رشاش قائم", "upright sprinkler", "رشاش عمودي", "upright"],
  "رشاش_حريق": ["رشاش حريق", "sprinkler", "رشاش", "fire sprinkler"],
  "طفاية_حريق": ["طفاية حريق", "fire extinguisher", "طفاية"],
  "خرطوم_حريق": ["خرطوم حريق", "fire hose", "بكرة حريق", "hose reel"],

  // ── Structural ──
  "خرسانة": ["خرسانة", "concrete", "كونكريت", "صب خرسانة"],
  "حديد_تسليح": ["حديد تسليح", "rebar", "تسليح", "reinforcement", "حديد"],
  "كمرات": ["كمرات", "beams", "جسور", "عتبات", "كمرة"],
  "اعمدة": ["أعمدة", "columns", "عمود", "اعمدة خرسانية"],
  "قواعد": ["قواعد", "foundations", "أساسات", "قاعدة"],
  "بلاطات": ["بلاطات", "slabs", "سقف", "بلاطة", "سقف خرساني"],

  // ── Finishes ──
  "بلاط_ارضي": ["بلاط أرضي", "floor tiles", "بلاط ارضيات", "سيراميك أرضي"],
  "بلاط_جداري": ["بلاط جداري", "wall tiles", "بلاط حوائط", "سيراميك جداري"],
  "دهان": ["دهان", "paint", "طلاء", "بوية", "دهانات"],
  "جبس": ["جبس", "gypsum", "جبس بورد", "gypsum board", "أسقف مستعارة"],

  // ── Electrical ──
  "كابل_كهرباء": ["كابل كهرباء", "cable", "كيبل", "سلك كهربائي", "electric cable"],
  "لوحة_كهرباء": ["لوحة كهربائية", "panel board", "لوحة توزيع", "distribution board", "DB"],
  "مفتاح_كهرباء": ["مفتاح كهربائي", "switch", "قاطع", "circuit breaker", "MCB"],
  "انارة": ["إنارة", "lighting", "إضاءة", "لمبة", "كشاف"],

  // ── Communication / PA Systems ──
  "سماعة_سقفية": ["سماعة سقفية", "سماعات سقفية", "ceiling speaker", "CEILING SPEAKER", "LOUD SPEAKER", "سماعة سقف"],
  "سماعة_جدارية": ["سماعة جدارية", "سماعات جدارية", "wall speaker", "wall mounted speaker"],
  "سماعة_بوقية": ["سماعة بوقية", "horn speaker", "سماعة بوق", "horn loudspeaker"],
  "نظام_اذاعة_داخلية": ["نظام الاذاعة الداخلية", "نظام إذاعة", "PA system", "public address system", "نظام النداء الداخلي", "نظام الاستدعاء"],
  "كاميرا_مراقبة": ["كاميرا مراقبة", "CCTV camera", "كاميرا", "camera", "دائرة تلفزيونية مغلقة"],
  "نظام_انذار_حريق": ["نظام إنذار حريق", "fire alarm system", "نظام الكشف والإنذار", "fire detection"],

  // ── Fire Suppression Systems (distinct from sprinklers) ──
  "نظام_غاز_اطفاء": ["NOVEC", "NOVEC-1230", "FM200", "FM-200", "غاز صافي", "غاز صافى", "نظام إطفاء بالغاز", "gas suppression", "clean agent", "إطفاء بالغاز"],
  "نظام_رغوي": ["إطفاء رغوي", "foam system", "رغوه", "رغوية", "foam", "فوم"],

  // ── HVAC ──
  "تكييف": ["تكييف", "AC", "air conditioning", "مكيف", "تبريد"],
  "مجاري_هواء": ["مجاري هواء", "duct", "دكت", "مجرى هواء", "ductwork"],
  "مروحة": ["مروحة", "fan", "مروحة شفط", "exhaust fan"],
  
  // ── Doors & Windows ──
  "باب_خشب": ["باب خشب", "wooden door", "باب خشبي", "أبواب خشب"],
  "باب_حديد": ["باب حديد", "steel door", "باب معدني", "باب فولاذي"],
  "باب_المنيوم": ["باب ألمنيوم", "aluminum door", "باب المنيوم"],
  "نافذة": ["نافذة", "window", "شباك", "نوافذ"],
};

// ─── Anti-Confusion Pairs ──────────────────────────────────────────────────
// If item matches concept A and candidate matches concept B, block the match.

export const ANTI_CONFUSION_PAIRS: [string, string][] = [
  ["صمام_بوابة", "منفس_هواء"],
  ["صمام_بوابة", "صمام_فراشة"],
  ["صمام_بوابة", "صمام_عدم_رجوع"],
  ["صمام_فراشة", "منفس_هواء"],
  ["صمام_عدم_رجوع", "منفس_هواء"],
  ["رشاش_متدلي", "رشاش_جانبي"],
  ["رشاش_متدلي", "رشاش_قائم"],
  ["رشاش_جانبي", "رشاش_قائم"],
  ["كابل_كهرباء", "انابيب_UPVC"],
  ["كابل_كهرباء", "انابيب_PPR"],
  ["بلاط_ارضي", "بلاط_جداري"],
  ["باب_خشب", "باب_حديد"],
  ["باب_خشب", "باب_المنيوم"],
  ["باب_حديد", "باب_المنيوم"],
  ["انابيب_UPVC", "انابيب_PPR"],
  ["انابيب_UPVC", "انابيب_حديد"],
  ["انابيب_PPR", "انابيب_حديد"],
  ["انابيب_نحاس", "انابيب_حديد"],
  // Fire suppression systems — must not cross-match
  ["نظام_غاز_اطفاء", "رشاش_حريق"],
  ["نظام_غاز_اطفاء", "رشاش_جانبي"],
  ["نظام_غاز_اطفاء", "رشاش_متدلي"],
  ["نظام_غاز_اطفاء", "رشاش_قائم"],
  ["نظام_غاز_اطفاء", "نظام_رغوي"],
  ["نظام_رغوي", "رشاش_حريق"],
  ["نظام_رغوي", "رشاش_جانبي"],
  ["نظام_رغوي", "رشاش_متدلي"],
  ["نظام_رغوي", "رشاش_قائم"],
  // Speaker types — individual speakers vs full systems
  ["سماعة_سقفية", "سماعة_جدارية"],
  ["سماعة_سقفية", "سماعة_بوقية"],
  ["سماعة_جدارية", "سماعة_بوقية"],
  // Speakers vs fire systems
  ["سماعة_سقفية", "نظام_غاز_اطفاء"],
  ["سماعة_جدارية", "نظام_غاز_اطفاء"],
  ["سماعة_سقفية", "نظام_رغوي"],
  // Camera vs fire
  ["كاميرا_مراقبة", "نظام_غاز_اطفاء"],
  ["كاميرا_مراقبة", "رشاش_حريق"],
];

// ─── Dimension Parser ──────────────────────────────────────────────────────

export interface ParsedDimension {
  type: "diameter" | "dimensions" | "thickness" | "size";
  values: number[];
  raw: string;
}

/**
 * Extract dimensions, diameters, and sizes from Arabic/English text.
 * Returns all found dimensions sorted by value for deterministic comparison.
 */
export function parseDimensions(text: string): ParsedDimension[] {
  if (!text) return [];
  const results: ParsedDimension[] = [];

  // Diameter: "قطر 20 مم", "Ø25", "DN50", "قطر20مم", "20mm dia"
  const diaPatterns = [
    /قطر\s*(\d+(?:\.\d+)?)\s*(?:مم|mm|ملم)?/g,
    /[Øø]\s*(\d+(?:\.\d+)?)/g,
    /DN\s*(\d+)/gi,
    /(\d+(?:\.\d+)?)\s*(?:مم|mm)\s*(?:قطر|dia(?:meter)?)/gi,
    /diameter\s*(\d+(?:\.\d+)?)/gi,
    /(\d+)\s*(?:انش|inch|")/g,
  ];
  for (const pat of diaPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      results.push({ type: "diameter", values: [parseFloat(m[1])], raw: m[0] });
    }
  }

  // Dimensions: "600x600", "1200*2000مم", "30X600X600"
  const dimPattern = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)(?:\s*[xX×*]\s*(\d+(?:\.\d+)?))?/g;
  let m: RegExpExecArray | null;
  while ((m = dimPattern.exec(text)) !== null) {
    const vals = [parseFloat(m[1]), parseFloat(m[2])];
    if (m[3]) vals.push(parseFloat(m[3]));
    results.push({ type: "dimensions", values: vals.sort((a, b) => a - b), raw: m[0] });
  }

  // Thickness: "سمك 3 مم", "thickness 5mm"
  const thickPattern = /(?:بسمك|سمك|سماكة|سماكه|thickness|thk)\s*(\d+(?:\.\d+)?)\s*(?:مم|mm)?/gi;
  while ((m = thickPattern.exec(text)) !== null) {
    results.push({ type: "thickness", values: [parseFloat(m[1])], raw: m[0] });
  }

  // Size: "مقاس 30", "size 25"
  const sizePattern = /(?:مقاس|size|no\.|رقم)\s*(\d+(?:\.\d+)?)/gi;
  while ((m = sizePattern.exec(text)) !== null) {
    results.push({ type: "size", values: [parseFloat(m[1])], raw: m[0] });
  }

  return results;
}

/**
 * Compare two sets of dimensions. Returns:
 *  +1 if matching dimensions found
 *   0 if no dimensions to compare
 *  -1 if conflicting dimensions found
 */
export function compareDimensions(dimsA: ParsedDimension[], dimsB: ParsedDimension[]): number {
  if (dimsA.length === 0 || dimsB.length === 0) return 0; // no data to compare

  let hasMatch = false;
  let hasConflict = false;

  for (const dA of dimsA) {
    for (const dB of dimsB) {
      if (dA.type !== dB.type) continue;
      
      // Same type — compare values
      const valsMatch = dA.values.length === dB.values.length &&
        dA.values.every((v, i) => Math.abs(v - dB.values[i]) < 0.5);
      
      if (valsMatch) {
        hasMatch = true;
      } else {
        hasConflict = true;
      }
    }
  }

  if (hasMatch && !hasConflict) return 1;
  if (hasConflict) return -1;
  return 0;
}

// ─── Concept Detection ─────────────────────────────────────────────────────

/**
 * Identify which synonym concepts a text matches.
 * Returns canonical concept keys (e.g., "صمام_بوابة").
 */
export function detectConcepts(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const normalized = lower
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "");

  const matched: string[] = [];

  for (const [concept, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    for (const syn of synonyms) {
      const synNorm = syn.toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[ًٌٍَُِّْـ]/g, "");
      if (normalized.includes(synNorm)) {
        matched.push(concept);
        break; // one match per concept is enough
      }
    }
  }

  return matched;
}

/**
 * Check if two texts have conflicting concepts (anti-confusion gate).
 * Returns true if they should NOT be matched.
 */
export function hasConceptConflict(conceptsA: string[], conceptsB: string[]): boolean {
  for (const cA of conceptsA) {
    for (const cB of conceptsB) {
      if (cA === cB) continue; // same concept = no conflict
      const isPair = ANTI_CONFUSION_PAIRS.some(
        ([x, y]) => (x === cA && y === cB) || (x === cB && y === cA)
      );
      if (isPair) return true;
    }
  }
  return false;
}

/**
 * Check if two texts share at least one synonym concept.
 */
export function hasSynonymOverlap(conceptsA: string[], conceptsB: string[]): boolean {
  return conceptsA.some(c => conceptsB.includes(c));
}

// ─── Parent Context Extraction ─────────────────────────────────────────────

/**
 * Extract parent context from notes field [PARENT: ...] tag.
 */
export function extractParentContext(notes: string | null | undefined): string {
  if (!notes) return "";
  const match = notes.match(/\[PARENT:\s*(.+?)\]/);
  return match ? match[1].trim() : "";
}

/**
 * Build enriched description by merging parent context when the description is short.
 */
export function buildEnrichedDescription(
  description: string,
  notes: string | null | undefined,
  threshold: number = 4, // tokens
): string {
  const parentCtx = extractParentContext(notes);
  if (!parentCtx) return description;
  
  // Count meaningful tokens
  const tokens = description
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .split(/[\s,،./-]+/)
    .filter(t => t.length > 1);
  
  // Only enrich if description is short
  if (tokens.length <= threshold) {
    return `${parentCtx} — ${description}`;
  }
  return description;
}

/**
 * Synonym dictionary, deep normalization & dimension parser for Matching V3.
 * Isolated module — does NOT modify any existing logic.
 * 
 * @module synonyms
 * @version 4.0 — Deep normalization + prefix-agnostic parsing
 */

// ─── Deep Normalization ────────────────────────────────────────────────────
// Strips Arabic prefixes, normalizes characters, removes diacritics.
// This makes the system "understand" rather than "memorize" — any prefix
// combination (ب، ال، بال، وال، لل، ف، ك، و) is handled automatically.

const ARABIC_PREFIX_PATTERN = /(?<=\s|^)(?:بال|وال|فال|كال|ولل|بلل|لل|ال|وب|فب|بـ|و|ب|ف|ك|ل)(?=[أإاآ-ي])/g;

/**
 * Deep normalize Arabic/English text for matching.
 * Strips prefixes, normalizes characters, removes noise.
 * Use this BEFORE regex matching or concept detection.
 */
export function deepNormalize(text: string): string {
  if (!text) return "";
  
  let normalized = text.toLowerCase();
  
  // 1. Remove tashkeel (diacritics)
  normalized = normalized.replace(/[ًٌٍَُِّْـ]/g, "");
  
  // 2. Normalize Hamza variants → ا
  normalized = normalized.replace(/[أإآ]/g, "ا");
  
  // 3. Normalize Taa Marbuta → ه
  normalized = normalized.replace(/ة/g, "ه");
  
  // 4. Normalize Alef Maqsura → ي
  normalized = normalized.replace(/ى/g, "ي");
  
  // 5. Strip Arabic prefixes (ب، ال، بال، وال، لل، ف، ك، و)
  // Apply twice to catch nested prefixes like "وبالسمك" → "وسمك" → "سمك"
  normalized = normalized.replace(ARABIC_PREFIX_PATTERN, "");
  normalized = normalized.replace(ARABIC_PREFIX_PATTERN, "");
  
  // 6. Remove punctuation except digits, letters, and basic separators
  normalized = normalized.replace(/[()[\]{}«»؟!،,;:\.\/\\]/g, " ");
  
  // 7. Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

// ─── Synonym Groups ────────────────────────────────────────────────────────
// Each key is a canonical concept. Values are all known expressions for it.

export const SYNONYM_GROUPS: Record<string, string[]> = {
  // ── Plumbing ──
  "صمام_بوابة": ["صمام بوابة", "gate valve", "محبس بوابة", "محبس", "بوابي"],
  "صمام_فراشة": ["صمام فراشة", "butterfly valve", "محبس فراشة"],
  "صمام_عدم_رجوع": ["صمام عدم رجوع", "check valve", "صمام ارتداد", "non return valve"],
  "منفس_هواء": ["منفس هواء", "AAV", "air admittance valve", "صمام تهوية", "air vent"],
  "مصفاة": ["مصفاة", "strainer", "فلتر", "مرشح"],
  
  // ── Pipes ──
  "انابيب_UPVC": ["انابيب UPVC", "مواسير UPVC", "انابيب يو بي في سي", "UPVC pipe", "مواسير صرف"],
  "انابيب_PPR": ["انابيب PPR", "مواسير PPR", "انابيب بولي بروبلين", "PPR pipe"],
  "انابيب_حديد": ["انابيب حديد", "مواسير حديد", "انابيب حديد مجلفن", "GI pipe", "galvanized pipe"],
  "انابيب_نحاس": ["انابيب نحاس", "مواسير نحاس", "copper pipe", "copper tube"],

  // ── Fire Protection ──
  "رشاش_متدلي": ["رشاش متدلي", "pendent sprinkler", "رشاش معلق", "pendent", "متدلي"],
  "رشاش_جانبي": ["رشاش جانبي", "sidewall sprinkler", "رشاش حائطي", "sidewall", "جانبي"],
  "رشاش_قائم": ["رشاش قائم", "upright sprinkler", "رشاش عمودي", "upright"],
  "رشاش_حريق": ["رشاش حريق", "sprinkler", "رشاش", "fire sprinkler"],
  "طفاية_حريق": ["طفاية حريق", "fire extinguisher", "طفايه"],
  "خرطوم_حريق": ["خرطوم حريق", "fire hose", "بكرة حريق", "hose reel"],

  // ── Structural ──
  "خرسانة": ["خرسانه", "concrete", "كونكريت", "صب خرسانه"],
  "حديد_تسليح": ["حديد تسليح", "rebar", "تسليح", "reinforcement", "حديد"],
  "كمرات": ["كمرات", "beams", "جسور", "عتبات", "كمره"],
  "اعمدة": ["اعمده", "columns", "عمود", "اعمده خرسانيه"],
  "قواعد": ["قواعد", "foundations", "اساسات", "قاعده"],
  "بلاطات": ["بلاطات", "slabs", "سقف", "بلاطه", "سقف خرساني"],

  // ── Blockwork by thickness ──
  "بلوك": ["بلوك", "block", "طابوق", "بلك", "blockwork", "طوب"],
  "بلوك_مقاوم_حريق": ["بلوك مقاوم حريق", "بلوك مقاوم للحريق", "fire rated block", "fire resistant block", "بلك مقاوم"],
  "جدار_بلوك": ["جدار", "حوائط", "حائط", "wall", "جدران", "حيطان", "جدار بلوك", "حوائط بلوك"],
  "بلاطة_مجوفة": ["بلاطه مجوفه", "بلاطة مجوفة", "hollow core slab", "هولوكور", "hollow slab", "بلاطه هولوكور"],
  "بلاطات_خرسانية": ["بلاطات خرسانيه", "بلاطه خرسانيه", "concrete slab", "slab", "بلاطه ارضيه", "بلاطات"],
  "كمرات_خرسانية": ["كمرات", "كمره", "beam", "كمرات نقل", "كمرات معلقه", "كمرات ارضيه", "transfer beam"],

  // ── Finishes ──
  "بلاط_ارضي": ["بلاط ارضي", "floor tiles", "بلاط ارضيات", "سيراميك ارضي"],
  "بلاط_جداري": ["بلاط جداري", "wall tiles", "بلاط حوائط", "سيراميك جداري"],
  "دهان": ["دهان", "paint", "طلاء", "بويه", "دهانات"],
  "جبس": ["جبس", "gypsum", "جبس بورد", "gypsum board", "اسقف مستعاره"],
  "رخام": ["رخام", "marble", "ماربل"],
  "جرانيت": ["جرانيت", "granite", "قرانيت"],
  "بورسلان": ["بورسلان", "porcelain", "بورسلين", "porcelain tiles"],
  "لياسه": ["لياسه", "plaster", "محاره", "بياض", "لياسه اسمنتيه"],

  // ── Insulation ──
  "عزل_مائي": ["عزل مائي", "waterproofing", "عزل ماء", "عزل رطوبه", "membrane"],
  "عزل_حراري": ["عزل حراري", "thermal insulation", "عزل حرارى", "insulation"],

  // ── Electrical ──
  "كابل_كهرباء": ["كابل كهرباء", "cable", "كيبل", "سلك كهربائي", "electric cable"],
  "لوحة_كهرباء": ["لوحه كهربائيه", "panel board", "لوحه توزيع", "distribution board", "DB"],
  "مفتاح_كهرباء": ["مفتاح كهربائي", "switch", "قاطع", "circuit breaker", "MCB"],
  "انارة": ["اناره", "lighting", "اضاءه", "لمبه", "كشاف"],

  // ── Communication / PA Systems ──
  "سماعة_سقفية": ["سماعه سقفيه", "سماعات سقفيه", "ceiling speaker", "CEILING SPEAKER", "LOUD SPEAKER", "سماعه سقف"],
  "سماعة_جدارية": ["سماعه جداريه", "سماعات جداريه", "wall speaker", "wall mounted speaker"],
  "سماعة_بوقية": ["سماعه بوقيه", "horn speaker", "سماعه بوق", "horn loudspeaker"],
  "نظام_اذاعة_داخلية": ["نظام اذاعه داخليه", "نظام اذاعه", "PA system", "public address system", "نظام نداء داخلي", "نظام استدعاء"],
  "كاميرا_مراقبة": ["كاميرا مراقبه", "CCTV camera", "كاميرا", "camera", "دائره تلفزيونيه مغلقه"],
  "نظام_انذار_حريق": ["نظام انذار حريق", "fire alarm system", "نظام كشف وانذار", "fire detection"],
  "نظام_تحكم_ابواب": ["تحكم في الابواب", "access control", "تحكم ابواب", "door control", "نظام دخول"],
  "نظام_CCTV": ["دائره تلفزيونيه مغلقه", "CCTV", "كاميرات مراقبه", "مراقبه تلفزيونيه", "نظام مراقبه"],
  "بوابة_كشف_معادن": ["بوابه كشف معادن", "metal detector", "كشف معادن", "بوابه امنيه"],
  "مواسير_صرف": ["مواسير صرف", "drainage pipe", "صرف صحي", "مواسير HDPE", "مواسير صرف صحي"],
  "عزل_مجاري_هواء": ["عزل مجاري هواء", "duct insulation", "عزل دكت", "عزل مجاري"],

  // ── Fire Suppression Systems ──
  "نظام_غاز_اطفاء": ["NOVEC", "NOVEC-1230", "FM200", "FM-200", "غاز صافي", "غاز صافى", "نظام اطفاء غاز", "gas suppression", "clean agent", "اطفاء غاز"],
  "نظام_رغوي": ["اطفاء رغوي", "foam system", "رغوه", "رغويه", "foam", "فوم"],

  // ── HVAC ──
  "تكييف": ["تكييف", "AC", "air conditioning", "مكيف", "تبريد"],
  "مجاري_هواء": ["مجاري هواء", "duct", "دكت", "مجري هواء", "ductwork"],
  "مروحة": ["مروحه", "fan", "مروحه شفط", "exhaust fan"],
  
  // ── Doors & Windows ──
  "باب_خشب": ["باب خشب", "wooden door", "باب خشبي", "ابواب خشب"],
  "باب_حديد": ["باب حديد", "steel door", "باب معدني", "باب فولاذي"],
  "باب_المنيوم": ["باب المنيوم", "aluminum door", "باب المنيوم"],
  "نافذة": ["نافذه", "window", "شباك", "نوافذ"],

  // ── Mechanical Equipment ──
  "مضخة": ["مضخه", "pump", "طلمبه", "مضخه مياه"],
  "خزان": ["خزان", "tank", "خزان مياه", "تانك", "خزان تجميع"],
};

// ─── Anti-Confusion Pairs ──────────────────────────────────────────────────

export const ANTI_CONFUSION_PAIRS: [string, string][] = [
  // Valves
  ["صمام_بوابة", "منفس_هواء"],
  ["صمام_بوابة", "صمام_فراشة"],
  ["صمام_بوابة", "صمام_عدم_رجوع"],
  ["صمام_فراشة", "منفس_هواء"],
  ["صمام_عدم_رجوع", "منفس_هواء"],
  // Sprinkler types
  ["رشاش_متدلي", "رشاش_جانبي"],
  ["رشاش_متدلي", "رشاش_قائم"],
  ["رشاش_جانبي", "رشاش_قائم"],
  // Cables vs pipes
  ["كابل_كهرباء", "انابيب_UPVC"],
  ["كابل_كهرباء", "انابيب_PPR"],
  // Tiles
  ["بلاط_ارضي", "بلاط_جداري"],
  // Doors
  ["باب_خشب", "باب_حديد"],
  ["باب_خشب", "باب_المنيوم"],
  ["باب_حديد", "باب_المنيوم"],
  // Pipes
  ["انابيب_UPVC", "انابيب_PPR"],
  ["انابيب_UPVC", "انابيب_حديد"],
  ["انابيب_PPR", "انابيب_حديد"],
  ["انابيب_نحاس", "انابيب_حديد"],
  // Fire suppression — must not cross-match
  ["نظام_غاز_اطفاء", "رشاش_حريق"],
  ["نظام_غاز_اطفاء", "رشاش_جانبي"],
  ["نظام_غاز_اطفاء", "رشاش_متدلي"],
  ["نظام_غاز_اطفاء", "رشاش_قائم"],
  ["نظام_غاز_اطفاء", "نظام_رغوي"],
  ["نظام_رغوي", "رشاش_حريق"],
  ["نظام_رغوي", "رشاش_جانبي"],
  ["نظام_رغوي", "رشاش_متدلي"],
  ["نظام_رغوي", "رشاش_قائم"],
  // Speaker types
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
  // Insulation types
  ["عزل_مائي", "عزل_حراري"],
  // Finishes — different materials
  ["رخام", "جرانيت"],
  ["رخام", "بورسلان"],
  ["جرانيت", "بورسلان"],
  ["رخام", "بلاط_ارضي"],
  ["جرانيت", "بلاط_ارضي"],
  // Blockwork vs fire-rated blockwork
  ["بلوك_مقاوم_حريق", "بلوك"],
  // Walls vs slabs/tiles — prevent cross-matching
  ["جدار_بلوك", "بلاطة_مجوفة"],
  ["جدار_بلوك", "بلاط_ارضي"],
  ["جدار_بلوك", "بلاط_جداري"],
  ["جدار_بلوك", "بورسلان"],
  ["جدار_بلوك", "رخام"],
  ["جدار_بلوك", "جرانيت"],
  ["بلاطة_مجوفة", "بلوك"],
  ["بلاطة_مجوفة", "بلاط_ارضي"],
  ["بلاطة_مجوفة", "بلاط_جداري"],
  // Structural elements — prevent cross-matching
  ["بلاطات_خرسانية", "كمرات_خرسانية"],
  ["بلاطات_خرسانية", "اعمدة"],
  ["بلاطات_خرسانية", "قواعد"],
  ["كمرات_خرسانية", "اعمدة"],
  ["كمرات_خرسانية", "قواعد"],
  ["كمرات_خرسانية", "بلاطة_مجوفة"],
  // Security systems — prevent cross-matching
  ["نظام_تحكم_ابواب", "نظام_CCTV"],
  ["نظام_تحكم_ابواب", "كاميرا_مراقبة"],
  ["بوابة_كشف_معادن", "نظام_CCTV"],
  ["بوابة_كشف_معادن", "كاميرا_مراقبة"],
  ["بوابة_كشف_معادن", "نظام_تحكم_ابواب"],
  // Drainage vs structural
  ["مواسير_صرف", "خرسانة"],
  ["مواسير_صرف", "حديد_تسليح"],
  ["مواسير_صرف", "كمرات_خرسانية"],
  // Duct insulation vs other insulation/finishes
  ["عزل_مجاري_هواء", "عزل_مائي"],
  ["عزل_مجاري_هواء", "لياسه"],
  ["عزل_مجاري_هواء", "دهان"],
  // Equipment
  ["مضخة", "خزان"],
];

// ─── Dimension Parser ──────────────────────────────────────────────────────

export interface ParsedDimension {
  type: "diameter" | "dimensions" | "thickness" | "size";
  values: number[];
  raw: string;
}

/**
 * Extract dimensions, diameters, and sizes from Arabic/English text.
 * Uses deepNormalize to strip prefixes BEFORE regex matching.
 * This means "بسمك", "والسمك", "بالسمك" all become "سمك" automatically.
 */
export function parseDimensions(text: string): ParsedDimension[] {
  if (!text) return [];
  const results: ParsedDimension[] = [];

  // Deep normalize to strip Arabic prefixes before dimension parsing
  const normalized = deepNormalize(text);
  // Keep original for raw match extraction
  const original = text;

  // Diameter: "قطر 20 مم", "Ø25", "DN50", "20mm dia"
  // After normalization: "بقطر" → "قطر", "بالقطر" → "قطر"
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
    while ((m = pat.exec(normalized)) !== null) {
      results.push({ type: "diameter", values: [parseFloat(m[1])], raw: m[0] });
    }
  }

  // Dimensions: "600x600", "1200*2000مم", "30X600X600"
  const dimPattern = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)(?:\s*[xX×*]\s*(\d+(?:\.\d+)?))?/g;
  let m: RegExpExecArray | null;
  while ((m = dimPattern.exec(normalized)) !== null) {
    const vals = [parseFloat(m[1]), parseFloat(m[2])];
    if (m[3]) vals.push(parseFloat(m[3]));
    results.push({ type: "dimensions", values: vals.sort((a, b) => a - b), raw: m[0] });
  }

  // Thickness: "سمك 3 مم", "thickness 5mm"
  // After normalization: "بسمك" → "سمك", "بالسمك" → "سمك", "والسمك" → "سمك"
  const thickPattern = /(?:سمك|سماك[هة]|thickness|thk)\s*(\d+(?:\.\d+)?)\s*(?:مم|mm)?/gi;
  while ((m = thickPattern.exec(normalized)) !== null) {
    results.push({ type: "thickness", values: [parseFloat(m[1])], raw: m[0] });
  }

  // Size: "مقاس 30", "size 25"
  // After normalization: "بمقاس" → "مقاس"
  const sizePattern = /(?:مقاس|size|no\.|رقم)\s*(\d+(?:\.\d+)?)/gi;
  while ((m = sizePattern.exec(normalized)) !== null) {
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
  if (dimsA.length === 0 || dimsB.length === 0) return 0;

  let hasMatch = false;
  let hasConflict = false;

  for (const dA of dimsA) {
    for (const dB of dimsB) {
      if (dA.type !== dB.type) continue;
      
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
 * Uses deepNormalize for prefix-agnostic matching.
 */
export function detectConcepts(text: string): string[] {
  if (!text) return [];
  const normalized = deepNormalize(text);

  const matched: string[] = [];

  for (const [concept, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    for (const syn of synonyms) {
      const synNorm = deepNormalize(syn);
      if (synNorm && normalized.includes(synNorm)) {
        matched.push(concept);
        break;
      }
    }
  }

  return matched;
}

/**
 * Check if two texts have conflicting concepts (anti-confusion gate).
 */
export function hasConceptConflict(conceptsA: string[], conceptsB: string[]): boolean {
  for (const cA of conceptsA) {
    for (const cB of conceptsB) {
      if (cA === cB) continue;
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

export function extractParentContext(notes: string | null | undefined): string {
  if (!notes) return "";
  const match = notes.match(/\[PARENT:\s*(.+?)\]/);
  return match ? match[1].trim() : "";
}

export function buildEnrichedDescription(
  description: string,
  notes: string | null | undefined,
  threshold: number = 4,
): string {
  const parentCtx = extractParentContext(notes);
  if (!parentCtx) return description;
  
  const tokens = description
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .split(/[\s,،./-]+/)
    .filter(t => t.length > 1);
  
  if (tokens.length <= threshold) {
    return `${parentCtx} — ${description}`;
  }
  return description;
}

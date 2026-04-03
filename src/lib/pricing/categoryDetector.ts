/**
 * Category detection from Arabic/English BoQ item descriptions.
 * Each category drives completely different pricing logic.
 */

export type ItemCategory =
  | "excavation"
  | "backfill"
  | "blinding_concrete"
  | "foundation_concrete"
  | "column_concrete"
  | "beam_concrete"
  | "slab_concrete"
  | "shear_wall_concrete"
  | "general_concrete"
  | "rebar"
  | "formwork"
  | "blockwork"
  | "plastering"
  | "painting"
  | "tiling"
  | "waterproofing"
  | "thermal_insulation"
  | "electrical_conduit"
  | "electrical_wiring"
  | "electrical_panels"
  | "electrical_fixtures"
  | "plumbing_pipes"
  | "plumbing_fixtures"
  | "hvac_ductwork"
  | "hvac_equipment"
  | "fire_fighting"
  | "doors"
  | "windows"
  | "aluminum"
  | "steel_structural"
  | "steel_misc"
  | "cladding"
  | "ceiling"
  | "landscaping"
  | "asphalt"
  | "curbs"
  | "general";

interface CategoryRule {
  category: ItemCategory;
  keywords: string[];
  priority: number; // higher = matched first
}

const RULES: CategoryRule[] = [
  // Earthworks - specific first
  { category: "backfill", keywords: ["ردم", "backfill", "إعادة ردم", "ردم دمك"], priority: 95 },
  { category: "excavation", keywords: ["حفر", "excavat", "أعمال ترابية", "نقل مخلفات", "تكسير", "معالجة التربة"], priority: 90 },

  // Concrete - specific types before general
  { category: "blinding_concrete", keywords: ["خرسانة نظافة", "blinding", "خرسانة عادية", "plain concrete"], priority: 88 },
  { category: "column_concrete", keywords: ["أعمدة", "column", "عمود", "رقاب الأعمدة"], priority: 87 },
  { category: "beam_concrete", keywords: ["كمرة", "كمرات", "beam", "جسر", "الكمرات"], priority: 87 },
  { category: "slab_concrete", keywords: ["سقف", "بلاطة", "slab", "بلاطات", "أسقف", "بلاطة أرضية", "بلاطة مجوفة"], priority: 87 },
  { category: "shear_wall_concrete", keywords: ["جدار قص", "shear wall", "حوائط قص", "رقاب الحوائط"], priority: 87 },
  { category: "foundation_concrete", keywords: ["أساس", "قواعد", "foundation", "لبشة", "raft", "footing", "أساسات", "القواعد المنفصلة", "القواعد الشريطية"], priority: 86 },
  { category: "general_concrete", keywords: ["خرسان", "concrete", "صب", "فرشة خرسانية", "فرشة اسمنتية"], priority: 80 },

  // Reinforcement
  { category: "rebar", keywords: ["حديد تسليح", "تسليح", "rebar", "reinforc", "steel bar"], priority: 85 },

  // Formwork
  { category: "formwork", keywords: ["شدات", "قوالب", "formwork", "shuttering"], priority: 84 },

  // Masonry
  { category: "blockwork", keywords: ["بلوك", "طوب", "block", "brick", "مباني", "بناء جدران", "حوائط سمك", "جدار مزدوج", "حوائط مزدوجة"], priority: 82 },

  // Finishes
  { category: "plastering", keywords: ["لياسة", "بياض", "plaster", "render"], priority: 80 },
  { category: "painting", keywords: ["دهان", "طلاء", "paint", "بويه", "ايبوكسي", "إيبوكسي", "epoxy"], priority: 80 },
  { category: "tiling", keywords: ["بلاط", "سيراميك", "رخام", "tile", "ceramic", "marble", "granite", "أرضيات", "floor", "بورسلين", "porcelain", "فينيل", "vinyl", "وزرة"], priority: 80 },
  { category: "ceiling", keywords: ["أسقف مستعارة", "سقف مستعار", "ceiling", "جبس بورد", "gypsum"], priority: 78 },
  { category: "cladding", keywords: ["تكسية", "كلادينج", "cladding", "واجهات", "facade", "تجاليد", "حجر"], priority: 78 },

  // Insulation
  { category: "waterproofing", keywords: ["عزل مائي", "waterproof", "عزل رطوبة", "ممبرين", "membrane", "للمناطق الرطبة"], priority: 82 },
  { category: "thermal_insulation", keywords: ["عزل حراري", "thermal insul", "فوم", "بولي", "polystyrene", "عزل"], priority: 78 },

  // Electrical
  { category: "electrical_panels", keywords: ["لوحة كهرب", "panel", "لوحة توزيع", "distribution board", "MDB", "SDB", "مرجع EPP", "مرجع PP", "مرجع UPP", "طاقة الكهربائية"], priority: 85 },
  { category: "electrical_wiring", keywords: ["كابل", "cable", "سلك", "wire", "توصيل كهرب", "موصلات", "مم2"], priority: 82 },
  { category: "electrical_conduit", keywords: ["مواسير كهرب", "conduit", "قناة كهرب", "أنابيب كهرب"], priority: 82 },
  { category: "electrical_fixtures", keywords: ["إنارة", "light", "مفتاح", "switch", "بريزة", "socket", "outlet", "كشاف", "luminaire", "مخرج قوى"], priority: 80 },

  // Plumbing
  { category: "plumbing_fixtures", keywords: ["مغسلة", "حوض", "مرحاض", "toilet", "basin", "sink", "خلاط", "صنبور", "tap", "أدوات صحية", "sanitary", "صمام", "حنفية", "مرايات", "مرآة"], priority: 82 },
  { category: "plumbing_pipes", keywords: ["مواسير صرف", "مواسير مياه", "pipe", "أنابيب", "سباكة", "plumb", "مواسير", "قطر", "تنفيس"], priority: 78 },

  // HVAC
  { category: "hvac_equipment", keywords: ["تكييف", "مكيف", "AC", "air condition", "chiller", "وحدة تبريد", "split unit", "مراوح", "طرد هواء", "إدخال الهواء"], priority: 82 },
  { category: "hvac_ductwork", keywords: ["مجاري هواء", "duct", "دكت", "مجلفن", "مخرج هواء"], priority: 78 },

  // Fire
  { category: "fire_fighting", keywords: ["إطفاء", "fire", "حريق", "رشاش", "sprinkler", "إنذار", "alarm"], priority: 80 },

  // Doors & Windows
  { category: "doors", keywords: ["باب", "أبواب", "door"], priority: 80 },
  { category: "windows", keywords: ["نافذة", "شباك", "نوافذ", "window"], priority: 80 },
  { category: "aluminum", keywords: ["ألمنيوم", "aluminum", "aluminium"], priority: 78 },

  // Steel
  { category: "steel_structural", keywords: ["هيكل حديد", "steel structure", "حديد إنشائي", "structural steel"], priority: 82 },
  { category: "steel_misc", keywords: ["حديد", "steel", "معدن", "metal", "درابزين", "railing", "handrail", "سلم حديد", "فتحة وصول"], priority: 70 },

  // External
  { category: "asphalt", keywords: ["أسفلت", "asphalt", "إسفلت"], priority: 80 },
  { category: "curbs", keywords: ["بردورة", "curb", "كيرب", "رصيف", "sidewalk"], priority: 78 },
  { category: "landscaping", keywords: ["تنسيق موقع", "landscap", "زراعة", "حديقة", "garden"], priority: 76 },
];

export interface DetectionResult {
  category: ItemCategory;
  confidence: number;
  matchedKeywords: string[];
  explanation: string;
}

export function detectCategory(description: string, descriptionEn?: string): DetectionResult {
  const combined = `${description} ${descriptionEn || ""}`.toLowerCase();
  const arabicText = description;

  let bestMatch: { rule: CategoryRule; matchedKeywords: string[] } | null = null;

  // Sort by priority descending
  const sorted = [...RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    const matched: string[] = [];
    for (const kw of rule.keywords) {
      if (combined.includes(kw.toLowerCase()) || arabicText.includes(kw)) {
        matched.push(kw);
      }
    }
    if (matched.length > 0) {
      if (!bestMatch || matched.length > bestMatch.matchedKeywords.length ||
          (matched.length === bestMatch.matchedKeywords.length && rule.priority > bestMatch.rule.priority)) {
        bestMatch = { rule, matchedKeywords: matched };
      }
    }
  }

  if (bestMatch) {
    const kwCount = bestMatch.matchedKeywords.length;
    const confidence = Math.min(95, bestMatch.rule.priority + kwCount * 3);
    return {
      category: bestMatch.rule.category,
      confidence,
      matchedKeywords: bestMatch.matchedKeywords,
      explanation: `Detected as "${bestMatch.rule.category}" based on keywords: ${bestMatch.matchedKeywords.join(", ")}`,
    };
  }

  return {
    category: "general",
    confidence: 30,
    matchedKeywords: [],
    explanation: "No specific category detected, using general pricing",
  };
}

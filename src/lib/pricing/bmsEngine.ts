/**
 * BMS (Building Management System) Points-Based Pricing Engine
 * 
 * Converts HVAC, Fire, and Electrical items from a BoQ into I/O Points,
 * then calculates BMS cost based on total points + multipliers.
 * 
 * This is an ADDITIVE layer — it reads existing priced items and generates
 * a BMS cost estimate. It does NOT modify any existing pricing logic.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BMSPointRule {
  /** Pattern keywords (Arabic + English) */
  keywords: string[];
  /** Points range [min, max] — midpoint used by default */
  pointsRange: [number, number];
  /** BMS system classification */
  system: "hvac" | "fire" | "electrical" | "security" | "plumbing";
  /** Human-readable label */
  label: string;
  labelAr: string;
}

export type ProjectTypeMultiplier = "government" | "security" | "healthcare" | "commercial" | "residential";

export interface BMSCalculationInput {
  items: {
    id: string;
    description: string;
    description_en: string;
    quantity: number;
    unit: string;
    unit_rate: number | null;
    total_price: number | null;
    status: string;
  }[];
  projectType?: ProjectTypeMultiplier;
  buildingCount?: number;
  ratePerPoint?: number; // SAR per point, default 500
}

export interface BMSPointMatch {
  itemId: string;
  description: string;
  quantity: number;
  matchedRule: string;
  pointsPerUnit: number;
  totalPoints: number;
  system: string;
}

export interface BMSSystemBreakdown {
  system: string;
  systemLabel: string;
  totalPoints: number;
  itemCount: number;
  cost: number;
}

export interface BMSCalculationResult {
  totalPoints: number;
  matches: BMSPointMatch[];
  systemBreakdown: BMSSystemBreakdown[];
  baseCost: number;
  integrationCost: number;
  programmingCost: number;
  serverCost: number;
  subtotal: number;
  projectMultiplier: number;
  buildingMultiplier: number;
  totalCost: number;
  ratePerPoint: number;
  hasBMSItems: boolean;
}

// ─── Points Dictionary ─────────────────────────────────────────────────────

const BMS_POINT_RULES: BMSPointRule[] = [
  // HVAC — discrete equipment only
  { keywords: ["ahu", "air handling unit", "وحدة مناولة هواء", "مناولة هواء"], pointsRange: [15, 25], system: "hvac", label: "AHU", labelAr: "وحدة مناولة هواء" },
  { keywords: ["fcu", "fan coil", "فان كويل", "وحدة ملف مروحة"], pointsRange: [2, 4], system: "hvac", label: "FCU", labelAr: "فان كويل" },
  { keywords: ["chiller", "تشلر", "مبرد مياه", "وحدة تبريد مركزي", "وحدة تبريد"], pointsRange: [15, 40], system: "hvac", label: "Chiller", labelAr: "تشلر" },
  { keywords: ["vav", "variable air volume", "حجم هواء متغير"], pointsRange: [2, 3], system: "hvac", label: "VAV Box", labelAr: "صندوق VAV" },
  { keywords: ["exhaust fan", "مروحة طرد", "مروحة شفط", "طرد هواء", "مراوح طرد", "مراوح شفط"], pointsRange: [2, 4], system: "hvac", label: "Exhaust Fan", labelAr: "مروحة طرد" },
  { keywords: ["supply fan", "مروحة إدخال", "مروحة تغذية", "إدخال الهواء", "مراوح تغذية", "مراوح إدخال"], pointsRange: [2, 4], system: "hvac", label: "Supply Fan", labelAr: "مروحة تغذية" },
  { keywords: ["pump", "مضخة", "مضخات", "طلمبة"], pointsRange: [3, 6], system: "hvac", label: "Pump", labelAr: "مضخة" },
  { keywords: ["cooling tower", "برج تبريد"], pointsRange: [8, 15], system: "hvac", label: "Cooling Tower", labelAr: "برج تبريد" },
  { keywords: ["split unit", "سبلت", "مكيف سبلت", "وحدة منفصلة"], pointsRange: [1, 2], system: "hvac", label: "Split Unit", labelAr: "مكيف سبلت" },
  { keywords: ["package unit", "مكيف مركزي صغير", "باكج"], pointsRange: [5, 10], system: "hvac", label: "Package Unit", labelAr: "باكج" },

  // Fire — discrete equipment only
  { keywords: ["fire damper", "صمام حريق", "بوابة حريق"], pointsRange: [1, 1], system: "fire", label: "Fire Damper", labelAr: "صمام حريق" },
  { keywords: ["smoke detector", "كاشف دخان", "حساس دخان"], pointsRange: [1, 1], system: "fire", label: "Smoke Detector", labelAr: "كاشف دخان" },
  { keywords: ["heat detector", "كاشف حرارة", "حساس حرارة"], pointsRange: [1, 1], system: "fire", label: "Heat Detector", labelAr: "كاشف حرارة" },
  { keywords: ["sprinkler", "رشاش", "رشاشات"], pointsRange: [0, 0], system: "fire", label: "Sprinkler (monitored)", labelAr: "رشاش (مراقب)" },
  { keywords: ["fire alarm panel", "لوحة إنذار", "لوحة حريق"], pointsRange: [5, 10], system: "fire", label: "Fire Alarm Panel", labelAr: "لوحة إنذار حريق" },
  { keywords: ["manual call point", "نقطة استدعاء", "زر إنذار"], pointsRange: [1, 1], system: "fire", label: "Manual Call Point", labelAr: "نقطة استدعاء يدوية" },
  { keywords: ["كابينة خرطوم", "خرطوم حريق", "hose reel", "hose cabinet"], pointsRange: [1, 1], system: "fire", label: "Hose Cabinet", labelAr: "كابينة خرطوم" },
  { keywords: ["fire pump", "مضخة حريق", "مضخات حريق"], pointsRange: [4, 8], system: "fire", label: "Fire Pump", labelAr: "مضخة حريق" },

  // Electrical Controls — discrete equipment only
  { keywords: ["control valve", "صمام تحكم", "صمام كهربائي"], pointsRange: [1, 1], system: "electrical", label: "Control Valve", labelAr: "صمام تحكم" },
  { keywords: ["temperature sensor", "حساس حرارة", "مستشعر حرارة", "ترموستات"], pointsRange: [1, 1], system: "electrical", label: "Temperature Sensor", labelAr: "حساس حرارة" },
  { keywords: ["pressure sensor", "حساس ضغط", "مستشعر ضغط"], pointsRange: [1, 1], system: "electrical", label: "Pressure Sensor", labelAr: "حساس ضغط" },
  { keywords: ["flow meter", "عداد تدفق", "مقياس تدفق"], pointsRange: [1, 2], system: "electrical", label: "Flow Meter", labelAr: "عداد تدفق" },
  { keywords: ["vfd", "variable frequency drive", "محرك تردد متغير", "انفرتر"], pointsRange: [2, 4], system: "electrical", label: "VFD", labelAr: "محرك تردد متغير" },
  { keywords: ["ddc", "direct digital control", "تحكم رقمي", "وحدة تحكم"], pointsRange: [3, 8], system: "electrical", label: "DDC Controller", labelAr: "وحدة تحكم رقمي" },
  { keywords: ["actuator", "محرك صمام", "مشغل"], pointsRange: [1, 1], system: "electrical", label: "Actuator", labelAr: "محرك صمام" },
  { keywords: ["energy meter", "عداد طاقة", "عداد كهرباء ذكي"], pointsRange: [2, 3], system: "electrical", label: "Energy Meter", labelAr: "عداد طاقة" },
  { keywords: ["لوحة تحكم", "لوحات تحكم", "control panel"], pointsRange: [3, 6], system: "electrical", label: "Control Panel", labelAr: "لوحة تحكم" },

  // Security
  { keywords: ["cctv", "كاميرا مراقبة", "كاميرات", "كاميرا", "تلفزيونية مغلقة", "closed circuit"], pointsRange: [1, 2], system: "security", label: "CCTV Camera", labelAr: "كاميرا مراقبة" },
  { keywords: ["access control", "تحكم وصول", "بوابة تحكم", "قارئ بطاقة", "نظام دخول"], pointsRange: [2, 3], system: "security", label: "Access Control", labelAr: "تحكم وصول" },

  // Plumbing
  { keywords: ["خزان مياه", "water tank", "خزانات"], pointsRange: [2, 4], system: "plumbing", label: "Water Tank", labelAr: "خزان مياه" },
  { keywords: ["محطة معالجة", "sewage treatment", "معالجة مياه"], pointsRange: [3, 6], system: "plumbing", label: "Treatment Plant", labelAr: "محطة معالجة" },
];

// ─── Multipliers ────────────────────────────────────────────────────────────

const PROJECT_TYPE_MULTIPLIERS: Record<ProjectTypeMultiplier, number> = {
  government: 1.0,
  commercial: 1.0,
  residential: 0.9,
  healthcare: 1.15,
  security: 1.3,
};

const SYSTEM_LABELS: Record<string, string> = {
  hvac: "تكييف وتبريد (HVAC)",
  fire: "إنذار وإطفاء حريق (Fire)",
  electrical: "تحكم كهربائي (Electrical)",
  security: "أمن ومراقبة (Security)",
  plumbing: "سباكة (Plumbing)",
};

// ─── BMS Item Detection ────────────────────────────────────────────────────

const BMS_ITEM_KEYWORDS = [
  "bms", "building management system",
  "إدارة المباني", "نظام إدارة المباني",
  "نظام تحكم مركزي", "نظام التحكم والمراقبة",
  "أنظمة التحكم والمراقبة",
];

/**
 * Detect if a BoQ item description refers to a BMS system line item.
 * This is the umbrella item that should be priced via the points engine.
 */
export function isBMSItem(description: string): boolean {
  const lower = description.toLowerCase();
  return BMS_ITEM_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Core Engine ────────────────────────────────────────────────────────────

/**
 * Scan BoQ items and calculate BMS cost using Points-based methodology.
 */
export function calculateBMSCost(input: BMSCalculationInput): BMSCalculationResult {
  const {
    items,
    projectType = "government",
    buildingCount = 1,
    ratePerPoint = 500,
  } = input;

  const matches: BMSPointMatch[] = [];

  // Scan each item against BMS rules
  for (const item of items) {
    // Skip non-priced / zero-quantity items
    if (item.quantity <= 0) continue;

    const combined = `${item.description} ${item.description_en || ""}`.toLowerCase();

    for (const rule of BMS_POINT_RULES) {
      const matched = rule.keywords.some(kw => combined.includes(kw.toLowerCase()));
      if (matched) {
        const pointsMid = rule.pointsRange[0] === rule.pointsRange[1]
          ? rule.pointsRange[0]
          : Math.round((rule.pointsRange[0] + rule.pointsRange[1]) / 2);

        // Skip zero-point items (e.g., sprinklers that are only monitored)
        if (pointsMid === 0) continue;

        matches.push({
          itemId: item.id,
          description: item.description.slice(0, 80),
          quantity: item.quantity,
          matchedRule: rule.label,
          pointsPerUnit: pointsMid,
          totalPoints: pointsMid * item.quantity,
          system: rule.system,
        });
        break; // first match wins per item
      }
    }
  }

  // No BMS-relevant items found
  if (matches.length === 0) {
    return {
      totalPoints: 0,
      matches: [],
      systemBreakdown: [],
      baseCost: 0,
      integrationCost: 0,
      programmingCost: 0,
      serverCost: 0,
      subtotal: 0,
      projectMultiplier: 1,
      buildingMultiplier: 1,
      totalCost: 0,
      ratePerPoint,
      hasBMSItems: false,
    };
  }

  const totalPoints = matches.reduce((sum, m) => sum + m.totalPoints, 0);

  // System breakdown
  const systemMap = new Map<string, { points: number; count: number }>();
  for (const m of matches) {
    const existing = systemMap.get(m.system) || { points: 0, count: 0 };
    existing.points += m.totalPoints;
    existing.count++;
    systemMap.set(m.system, existing);
  }

  const baseCost = totalPoints * ratePerPoint;

  // Integration: 15% for small, 20% for medium, 25% for large
  const integrationPct = totalPoints > 500 ? 0.25 : totalPoints > 200 ? 0.20 : 0.15;
  const integrationCost = Math.round(baseCost * integrationPct);

  // Programming & Commissioning: 10%
  const programmingCost = Math.round(baseCost * 0.10);

  // Server/Gateway: fixed cost if > 200 points
  const serverCost = totalPoints > 500 ? 150000
    : totalPoints > 200 ? 100000
    : totalPoints > 50 ? 50000
    : 0;

  const subtotal = baseCost + integrationCost + programmingCost + serverCost;

  const projectMultiplier = PROJECT_TYPE_MULTIPLIERS[projectType] || 1.0;
  const buildingMultiplier = buildingCount > 3 ? 1.2
    : buildingCount > 1 ? 1.1
    : 1.0;

  const totalCost = Math.round(subtotal * projectMultiplier * buildingMultiplier);

  const systemBreakdown: BMSSystemBreakdown[] = Array.from(systemMap.entries()).map(([sys, data]) => ({
    system: sys,
    systemLabel: SYSTEM_LABELS[sys] || sys,
    totalPoints: data.points,
    itemCount: data.count,
    cost: Math.round((data.points / totalPoints) * baseCost),
  }));

  return {
    totalPoints,
    matches,
    systemBreakdown,
    baseCost,
    integrationCost,
    programmingCost,
    serverCost,
    subtotal,
    projectMultiplier,
    buildingMultiplier,
    totalCost,
    ratePerPoint,
    hasBMSItems: true,
  };
}

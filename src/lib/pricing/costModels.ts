/**
 * Real construction cost models per category.
 * Each model defines base rate ranges, breakdown ratios, and adjustment factors.
 * Breakdown ratios are calibrated to match real Saudi construction market data.
 */

import type { ItemCategory } from "./categoryDetector";

export interface CostModel {
  /** Base rate range [min, max] in SAR per standard unit */
  rateRange: [number, number];
  /** Typical breakdown ratios - these VARY per category */
  breakdown: {
    materials: [number, number]; // [min%, max%]
    labor: [number, number];
    equipment: [number, number];
    logistics: [number, number];
  };
  /** Quantity breakpoints for economy of scale */
  scaleFactors: { threshold: number; factor: number }[];
  /** How sensitive this category is to remote locations (0-1) */
  locationSensitivity: number;
  /** Complexity variance - adds randomness within realistic bounds */
  complexityRange: [number, number];
  /** Logistics weight class: affects transport cost calculation */
  logisticsWeight: "light" | "medium" | "heavy" | "bulk";
  /** Acceptable price range per unit for validation [min, max] SAR */
  validRange: [number, number];
}

const MODELS: Record<ItemCategory, CostModel> = {
  // === EARTHWORKS ===
  excavation: {
    rateRange: [28, 65],
    breakdown: {
      materials: [0.02, 0.06],   // minimal materials (fuel only)
      labor: [0.18, 0.28],
      equipment: [0.45, 0.60],   // equipment-dominant
      logistics: [0.15, 0.25],   // disposal transport
    },
    scaleFactors: [
      { threshold: 500, factor: 0.92 },
      { threshold: 2000, factor: 0.85 },
      { threshold: 10000, factor: 0.78 },
    ],
    locationSensitivity: 0.75,
    complexityRange: [0.82, 1.30],
    logisticsWeight: "bulk",
    validRange: [15, 120],
  },
  backfill: {
    rateRange: [12, 28],
    breakdown: {
      materials: [0.25, 0.40],   // fill material cost
      labor: [0.15, 0.25],
      equipment: [0.25, 0.38],   // compaction equipment
      logistics: [0.04, 0.08],   // minimal transport
    },
    scaleFactors: [
      { threshold: 500, factor: 0.90 },
      { threshold: 2000, factor: 0.82 },
      { threshold: 10000, factor: 0.75 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.90, 1.12],
    logisticsWeight: "bulk",
    validRange: [8, 55],
  },

  // === CONCRETE ===
  blinding_concrete: {
    rateRange: [250, 380],
    breakdown: {
      materials: [0.55, 0.68],   // cement, aggregate
      labor: [0.12, 0.20],       // simple pour
      equipment: [0.06, 0.12],   // mixer, pump
      logistics: [0.04, 0.08],   // low logistics
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.45,
    complexityRange: [0.92, 1.08],
    logisticsWeight: "heavy",
    validRange: [180, 500],
  },
  foundation_concrete: {
    rateRange: [780, 1150],
    breakdown: {
      materials: [0.50, 0.62],   // concrete + rebar share
      labor: [0.18, 0.28],       // formwork + pour
      equipment: [0.10, 0.18],   // pump, crane
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.88 },
    ],
    locationSensitivity: 0.60,
    complexityRange: [0.85, 1.22],
    logisticsWeight: "heavy",
    validRange: [550, 1600],
  },
  column_concrete: {
    rateRange: [1050, 1550],
    breakdown: {
      materials: [0.38, 0.48],   // higher rebar density
      labor: [0.28, 0.38],       // complex formwork, height
      equipment: [0.12, 0.20],   // crane for height
      logistics: [0.06, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.50,
    complexityRange: [0.90, 1.28],
    logisticsWeight: "heavy",
    validRange: [700, 2200],
  },
  beam_concrete: {
    rateRange: [980, 1400],
    breakdown: {
      materials: [0.40, 0.52],
      labor: [0.25, 0.35],       // complex formwork
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.50,
    complexityRange: [0.88, 1.25],
    logisticsWeight: "heavy",
    validRange: [650, 2000],
  },
  slab_concrete: {
    rateRange: [820, 1180],
    breakdown: {
      materials: [0.48, 0.60],   // large volume concrete
      labor: [0.18, 0.28],       // simpler formwork than columns
      equipment: [0.12, 0.22],   // pump, vibrator
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.94 },
      { threshold: 500, factor: 0.87 },
    ],
    locationSensitivity: 0.55,
    complexityRange: [0.85, 1.18],
    logisticsWeight: "heavy",
    validRange: [550, 1650],
  },
  shear_wall_concrete: {
    rateRange: [1100, 1650],
    breakdown: {
      materials: [0.36, 0.46],   // dense rebar
      labor: [0.28, 0.38],       // most complex formwork
      equipment: [0.12, 0.20],   // crane, pump
      logistics: [0.08, 0.14],   // heavy logistics
    },
    scaleFactors: [
      { threshold: 50, factor: 0.96 },
      { threshold: 200, factor: 0.91 },
    ],
    locationSensitivity: 0.55,
    complexityRange: [0.90, 1.32],
    logisticsWeight: "heavy",
    validRange: [750, 2400],
  },
  general_concrete: {
    rateRange: [650, 1050],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.15, 0.25],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.94 },
      { threshold: 500, factor: 0.88 },
    ],
    locationSensitivity: 0.55,
    complexityRange: [0.88, 1.20],
    logisticsWeight: "heavy",
    validRange: [400, 1500],
  },

  // === REINFORCEMENT ===
  rebar: {
    rateRange: [4200, 5800],
    breakdown: {
      materials: [0.62, 0.75],   // steel price dominant
      labor: [0.12, 0.22],       // cutting, bending, tying
      equipment: [0.02, 0.06],   // bar bender
      logistics: [0.06, 0.12],   // heavy transport
    },
    scaleFactors: [
      { threshold: 10, factor: 0.96 },
      { threshold: 50, factor: 0.92 },
      { threshold: 200, factor: 0.87 },
    ],
    locationSensitivity: 0.80,
    complexityRange: [0.92, 1.12],
    logisticsWeight: "heavy",
    validRange: [3200, 7500],
  },

  // === FORMWORK ===
  formwork: {
    rateRange: [90, 190],
    breakdown: {
      materials: [0.28, 0.40],   // plywood, timber
      labor: [0.40, 0.55],       // labor-intensive
      equipment: [0.04, 0.10],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.93 },
      { threshold: 1000, factor: 0.86 },
    ],
    locationSensitivity: 0.25,
    complexityRange: [0.82, 1.35],
    logisticsWeight: "medium",
    validRange: [55, 300],
  },

  // === MASONRY ===
  blockwork: {
    rateRange: [80, 155],
    breakdown: {
      materials: [0.42, 0.58],   // blocks, mortar
      labor: [0.30, 0.42],       // bricklaying
      equipment: [0.02, 0.06],   // minimal
      logistics: [0.04, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.40,
    complexityRange: [0.90, 1.15],
    logisticsWeight: "medium",
    validRange: [50, 250],
  },

  // === FINISHES ===
  plastering: {
    rateRange: [32, 68],
    breakdown: {
      materials: [0.22, 0.32],   // plaster mix
      labor: [0.48, 0.62],       // LABOR DOMINANT
      equipment: [0.02, 0.05],
      logistics: [0.03, 0.07],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.20,
    complexityRange: [0.88, 1.18],
    logisticsWeight: "light",
    validRange: [20, 110],
  },
  painting: {
    rateRange: [22, 52],
    breakdown: {
      materials: [0.25, 0.38],   // paint, primer
      labor: [0.48, 0.62],       // LABOR DOMINANT
      equipment: [0.01, 0.04],
      logistics: [0.02, 0.06],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.93 },
      { threshold: 2000, factor: 0.87 },
    ],
    locationSensitivity: 0.15,
    complexityRange: [0.85, 1.22],
    logisticsWeight: "light",
    validRange: [15, 90],
  },
  tiling: {
    rateRange: [110, 340],
    breakdown: {
      materials: [0.52, 0.68],   // tile material dominant
      labor: [0.22, 0.35],       // skilled tiling labor
      equipment: [0.01, 0.04],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.95 },
      { threshold: 1000, factor: 0.90 },
    ],
    locationSensitivity: 0.30,
    complexityRange: [0.78, 1.38],
    logisticsWeight: "medium",
    validRange: [70, 550],
  },
  ceiling: {
    rateRange: [60, 150],
    breakdown: {
      materials: [0.42, 0.58],   // gypsum boards, frames
      labor: [0.30, 0.42],
      equipment: [0.04, 0.10],   // scaffolding
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.25,
    complexityRange: [0.85, 1.25],
    logisticsWeight: "light",
    validRange: [40, 250],
  },
  cladding: {
    rateRange: [200, 500],
    breakdown: {
      materials: [0.52, 0.68],   // stone/composite panels
      labor: [0.18, 0.30],
      equipment: [0.06, 0.14],   // scaffolding, cranes
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.90 },
    ],
    locationSensitivity: 0.42,
    complexityRange: [0.82, 1.32],
    logisticsWeight: "medium",
    validRange: [120, 800],
  },

  // === INSULATION ===
  waterproofing: {
    rateRange: [42, 100],
    breakdown: {
      materials: [0.52, 0.68],   // membrane materials
      labor: [0.22, 0.35],
      equipment: [0.01, 0.05],
      logistics: [0.03, 0.07],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.90, 1.15],
    logisticsWeight: "light",
    validRange: [25, 160],
  },
  thermal_insulation: {
    rateRange: [38, 90],
    breakdown: {
      materials: [0.55, 0.68],   // insulation boards
      labor: [0.18, 0.28],
      equipment: [0.01, 0.05],
      logistics: [0.05, 0.10],   // bulky, volume-based
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.32,
    complexityRange: [0.90, 1.15],
    logisticsWeight: "light",
    validRange: [22, 140],
  },

  // === ELECTRICAL ===
  electrical_conduit: {
    rateRange: [16, 48],
    breakdown: {
      materials: [0.38, 0.52],
      labor: [0.35, 0.48],       // installation labor
      equipment: [0.01, 0.04],
      logistics: [0.03, 0.07],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.93 },
      { threshold: 2000, factor: 0.87 },
    ],
    locationSensitivity: 0.18,
    complexityRange: [0.88, 1.18],
    logisticsWeight: "light",
    validRange: [10, 80],
  },
  electrical_wiring: {
    rateRange: [22, 95],
    breakdown: {
      materials: [0.58, 0.72],   // MATERIALS DOMINANT - copper cable
      labor: [0.18, 0.28],
      equipment: [0.01, 0.04],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.82, 1.28],
    logisticsWeight: "medium",
    validRange: [12, 160],
  },
  electrical_panels: {
    rateRange: [3500, 22000],
    breakdown: {
      materials: [0.62, 0.78],   // MATERIALS DOMINANT - panel cost
      labor: [0.10, 0.20],
      equipment: [0.02, 0.06],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 5, factor: 0.96 },
      { threshold: 20, factor: 0.92 },
    ],
    locationSensitivity: 0.48,
    complexityRange: [0.75, 1.45],
    logisticsWeight: "heavy",
    validRange: [2000, 40000],
  },
  electrical_fixtures: {
    rateRange: [75, 380],
    breakdown: {
      materials: [0.58, 0.72],   // MATERIALS DOMINANT
      labor: [0.16, 0.28],
      equipment: [0.01, 0.04],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.22,
    complexityRange: [0.78, 1.38],
    logisticsWeight: "light",
    validRange: [40, 650],
  },

  // === PLUMBING ===
  plumbing_pipes: {
    rateRange: [32, 130],
    breakdown: {
      materials: [0.42, 0.58],
      labor: [0.28, 0.42],       // skilled pipe fitting
      equipment: [0.04, 0.10],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.85, 1.22],
    logisticsWeight: "medium",
    validRange: [18, 220],
  },
  plumbing_fixtures: {
    rateRange: [250, 1400],
    breakdown: {
      materials: [0.62, 0.78],   // fixture cost dominant
      labor: [0.12, 0.22],
      equipment: [0.01, 0.05],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.32,
    complexityRange: [0.72, 1.45],
    logisticsWeight: "medium",
    validRange: [120, 2500],
  },

  // === HVAC ===
  hvac_ductwork: {
    rateRange: [80, 240],
    breakdown: {
      materials: [0.48, 0.60],   // galvanized sheet
      labor: [0.22, 0.32],
      equipment: [0.05, 0.12],
      logistics: [0.06, 0.12],   // bulky items
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.38,
    complexityRange: [0.82, 1.28],
    logisticsWeight: "medium",
    validRange: [50, 400],
  },
  hvac_equipment: {
    rateRange: [2500, 18000],
    breakdown: {
      materials: [0.62, 0.78],   // equipment cost dominant
      labor: [0.08, 0.18],
      equipment: [0.05, 0.12],   // crane for installation
      logistics: [0.08, 0.16],   // heavy equipment transport
    },
    scaleFactors: [
      { threshold: 5, factor: 0.96 },
      { threshold: 20, factor: 0.92 },
    ],
    locationSensitivity: 0.65,
    complexityRange: [0.78, 1.38],
    logisticsWeight: "heavy",
    validRange: [1500, 35000],
  },

  // === FIRE ===
  fire_fighting: {
    rateRange: [140, 550],
    breakdown: {
      materials: [0.52, 0.68],   // sprinklers, pipes, valves
      labor: [0.18, 0.28],
      equipment: [0.04, 0.10],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.82, 1.28],
    logisticsWeight: "medium",
    validRange: [80, 900],
  },

  // === DOORS & WINDOWS ===
  doors: {
    rateRange: [800, 3800],
    breakdown: {
      materials: [0.62, 0.78],   // door + hardware
      labor: [0.10, 0.20],
      equipment: [0.01, 0.05],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.72, 1.42],
    logisticsWeight: "medium",
    validRange: [400, 6500],
  },
  windows: {
    rateRange: [550, 2800],
    breakdown: {
      materials: [0.60, 0.75],   // glass + frame
      labor: [0.12, 0.22],
      equipment: [0.03, 0.08],   // crane for large windows
      logistics: [0.05, 0.10],   // fragile transport
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.32,
    complexityRange: [0.78, 1.38],
    logisticsWeight: "medium",
    validRange: [300, 5000],
  },
  aluminum: {
    rateRange: [320, 950],
    breakdown: {
      materials: [0.58, 0.72],
      labor: [0.15, 0.26],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.38,
    complexityRange: [0.82, 1.28],
    logisticsWeight: "medium",
    validRange: [180, 1600],
  },

  // === STEEL ===
  steel_structural: {
    rateRange: [8000, 15000],
    breakdown: {
      materials: [0.55, 0.68],
      labor: [0.14, 0.24],
      equipment: [0.10, 0.18],   // heavy crane
      logistics: [0.08, 0.14],   // heavy transport
    },
    scaleFactors: [
      { threshold: 20, factor: 0.95 },
      { threshold: 100, factor: 0.88 },
    ],
    locationSensitivity: 0.78,
    complexityRange: [0.85, 1.22],
    logisticsWeight: "heavy",
    validRange: [5500, 22000],
  },
  steel_misc: {
    rateRange: [180, 850],
    breakdown: {
      materials: [0.48, 0.65],
      labor: [0.22, 0.35],
      equipment: [0.02, 0.08],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.38,
    complexityRange: [0.82, 1.28],
    logisticsWeight: "medium",
    validRange: [100, 1400],
  },

  // === EXTERNAL ===
  asphalt: {
    rateRange: [42, 95],
    breakdown: {
      materials: [0.48, 0.60],   // bitumen, aggregate
      labor: [0.12, 0.22],
      equipment: [0.20, 0.30],   // paver, roller
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.92 },
      { threshold: 2000, factor: 0.85 },
    ],
    locationSensitivity: 0.52,
    complexityRange: [0.90, 1.15],
    logisticsWeight: "bulk",
    validRange: [25, 150],
  },
  curbs: {
    rateRange: [48, 115],
    breakdown: {
      materials: [0.42, 0.55],
      labor: [0.28, 0.40],
      equipment: [0.04, 0.10],
      logistics: [0.04, 0.08],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.32,
    complexityRange: [0.90, 1.15],
    logisticsWeight: "medium",
    validRange: [30, 180],
  },
  landscaping: {
    rateRange: [55, 220],
    breakdown: {
      materials: [0.38, 0.52],   // plants, soil, irrigation
      labor: [0.32, 0.45],       // planting labor
      equipment: [0.06, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.78, 1.35],
    logisticsWeight: "medium",
    validRange: [30, 400],
  },

  // === FURNITURE & EQUIPMENT ===
  furniture: {
    rateRange: [150, 2800],
    breakdown: {
      materials: [0.68, 0.82],   // product cost dominant
      labor: [0.06, 0.12],       // assembly only
      equipment: [0.01, 0.04],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.28,
    complexityRange: [0.68, 1.55],
    logisticsWeight: "medium",
    validRange: [60, 5000],
  },

  // === GENERAL FALLBACK ===
  general: {
    rateRange: [45, 420],
    breakdown: {
      materials: [0.35, 0.55],
      labor: [0.22, 0.38],
      equipment: [0.05, 0.15],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.90 },
    ],
    locationSensitivity: 0.40,
    complexityRange: [0.78, 1.32],
    logisticsWeight: "medium",
    validRange: [15, 800],
  },
};

export function getCostModel(category: ItemCategory): CostModel {
  return MODELS[category] || MODELS.general;
}

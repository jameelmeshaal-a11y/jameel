/**
 * Real construction cost models per category.
 * Each model defines base rate ranges, breakdown ratios, and adjustment factors.
 * NO fixed templates - rates are computed dynamically.
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
}

const MODELS: Record<ItemCategory, CostModel> = {
  // === EARTHWORKS ===
  excavation: {
    rateRange: [28, 55],
    breakdown: {
      materials: [0.03, 0.08],
      labor: [0.25, 0.35],
      equipment: [0.40, 0.55],
      logistics: [0.12, 0.20],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.92 },
      { threshold: 2000, factor: 0.85 },
      { threshold: 10000, factor: 0.78 },
    ],
    locationSensitivity: 0.7,
    complexityRange: [0.85, 1.25],
  },
  backfill: {
    rateRange: [15, 32],
    breakdown: {
      materials: [0.20, 0.35],
      labor: [0.20, 0.30],
      equipment: [0.25, 0.40],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.90 },
      { threshold: 2000, factor: 0.82 },
      { threshold: 10000, factor: 0.75 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.90, 1.15],
  },

  // === CONCRETE ===
  blinding_concrete: {
    rateRange: [280, 420],
    breakdown: {
      materials: [0.55, 0.65],
      labor: [0.15, 0.25],
      equipment: [0.08, 0.15],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.90, 1.10],
  },
  foundation_concrete: {
    rateRange: [750, 1100],
    breakdown: {
      materials: [0.45, 0.55],
      labor: [0.20, 0.30],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.88 },
    ],
    locationSensitivity: 0.6,
    complexityRange: [0.85, 1.20],
  },
  column_concrete: {
    rateRange: [950, 1400],
    breakdown: {
      materials: [0.40, 0.50],
      labor: [0.25, 0.35],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.90, 1.25],
  },
  beam_concrete: {
    rateRange: [900, 1350],
    breakdown: {
      materials: [0.42, 0.52],
      labor: [0.22, 0.32],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.88, 1.22],
  },
  slab_concrete: {
    rateRange: [800, 1200],
    breakdown: {
      materials: [0.45, 0.55],
      labor: [0.20, 0.30],
      equipment: [0.12, 0.20],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.94 },
      { threshold: 500, factor: 0.87 },
    ],
    locationSensitivity: 0.55,
    complexityRange: [0.85, 1.18],
  },
  shear_wall_concrete: {
    rateRange: [1000, 1500],
    breakdown: {
      materials: [0.40, 0.50],
      labor: [0.25, 0.35],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.96 },
      { threshold: 200, factor: 0.91 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.90, 1.30],
  },
  general_concrete: {
    rateRange: [650, 1050],
    breakdown: {
      materials: [0.45, 0.55],
      labor: [0.20, 0.30],
      equipment: [0.10, 0.18],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.94 },
      { threshold: 500, factor: 0.88 },
    ],
    locationSensitivity: 0.55,
    complexityRange: [0.88, 1.20],
  },

  // === REINFORCEMENT ===
  rebar: {
    rateRange: [4200, 5800],
    breakdown: {
      materials: [0.60, 0.72],
      labor: [0.15, 0.25],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 10, factor: 0.96 },
      { threshold: 50, factor: 0.92 },
      { threshold: 200, factor: 0.87 },
    ],
    locationSensitivity: 0.8,
    complexityRange: [0.92, 1.12],
  },

  // === FORMWORK ===
  formwork: {
    rateRange: [90, 180],
    breakdown: {
      materials: [0.30, 0.45],
      labor: [0.35, 0.50],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.93 },
      { threshold: 1000, factor: 0.86 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.85, 1.30],
  },

  // === MASONRY ===
  blockwork: {
    rateRange: [80, 145],
    breakdown: {
      materials: [0.40, 0.55],
      labor: [0.30, 0.42],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.90, 1.15],
  },

  // === FINISHES ===
  plastering: {
    rateRange: [35, 65],
    breakdown: {
      materials: [0.30, 0.40],
      labor: [0.45, 0.55],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.25,
    complexityRange: [0.88, 1.15],
  },
  painting: {
    rateRange: [25, 55],
    breakdown: {
      materials: [0.30, 0.42],
      labor: [0.42, 0.55],
      equipment: [0.02, 0.06],
      logistics: [0.03, 0.08],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.93 },
      { threshold: 2000, factor: 0.87 },
    ],
    locationSensitivity: 0.2,
    complexityRange: [0.85, 1.20],
  },
  tiling: {
    rateRange: [120, 320],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.22, 0.35],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.95 },
      { threshold: 1000, factor: 0.90 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.80, 1.35],
  },
  ceiling: {
    rateRange: [65, 140],
    breakdown: {
      materials: [0.40, 0.55],
      labor: [0.30, 0.42],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.88, 1.20],
  },
  cladding: {
    rateRange: [180, 450],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.20, 0.32],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.90 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.85, 1.30],
  },

  // === INSULATION ===
  waterproofing: {
    rateRange: [45, 95],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.22, 0.35],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.90, 1.15],
  },
  thermal_insulation: {
    rateRange: [40, 85],
    breakdown: {
      materials: [0.50, 0.62],
      labor: [0.22, 0.32],
      equipment: [0.02, 0.06],
      logistics: [0.06, 0.12],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.90, 1.15],
  },

  // === ELECTRICAL ===
  electrical_conduit: {
    rateRange: [18, 45],
    breakdown: {
      materials: [0.35, 0.48],
      labor: [0.35, 0.48],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.93 },
      { threshold: 2000, factor: 0.87 },
    ],
    locationSensitivity: 0.2,
    complexityRange: [0.88, 1.18],
  },
  electrical_wiring: {
    rateRange: [25, 85],
    breakdown: {
      materials: [0.55, 0.70],
      labor: [0.20, 0.30],
      equipment: [0.02, 0.05],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.94 },
      { threshold: 2000, factor: 0.88 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.85, 1.25],
  },
  electrical_panels: {
    rateRange: [3500, 18000],
    breakdown: {
      materials: [0.60, 0.75],
      labor: [0.12, 0.22],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 5, factor: 0.96 },
      { threshold: 20, factor: 0.92 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.80, 1.40],
  },
  electrical_fixtures: {
    rateRange: [80, 350],
    breakdown: {
      materials: [0.55, 0.70],
      labor: [0.18, 0.30],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.25,
    complexityRange: [0.80, 1.35],
  },

  // === PLUMBING ===
  plumbing_pipes: {
    rateRange: [35, 120],
    breakdown: {
      materials: [0.40, 0.55],
      labor: [0.28, 0.40],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.85, 1.20],
  },
  plumbing_fixtures: {
    rateRange: [250, 1200],
    breakdown: {
      materials: [0.60, 0.75],
      labor: [0.15, 0.25],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.75, 1.40],
  },

  // === HVAC ===
  hvac_ductwork: {
    rateRange: [85, 220],
    breakdown: {
      materials: [0.45, 0.58],
      labor: [0.25, 0.35],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.85, 1.25],
  },
  hvac_equipment: {
    rateRange: [2500, 15000],
    breakdown: {
      materials: [0.60, 0.75],
      labor: [0.10, 0.20],
      equipment: [0.05, 0.12],
      logistics: [0.08, 0.15],
    },
    scaleFactors: [
      { threshold: 5, factor: 0.96 },
      { threshold: 20, factor: 0.92 },
    ],
    locationSensitivity: 0.6,
    complexityRange: [0.80, 1.35],
  },

  // === FIRE ===
  fire_fighting: {
    rateRange: [150, 500],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.20, 0.30],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.85, 1.25],
  },

  // === DOORS & WINDOWS ===
  doors: {
    rateRange: [800, 3500],
    breakdown: {
      materials: [0.60, 0.75],
      labor: [0.12, 0.22],
      equipment: [0.02, 0.06],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.75, 1.40],
  },
  windows: {
    rateRange: [600, 2500],
    breakdown: {
      materials: [0.58, 0.72],
      labor: [0.15, 0.25],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.80, 1.35],
  },
  aluminum: {
    rateRange: [350, 900],
    breakdown: {
      materials: [0.55, 0.70],
      labor: [0.18, 0.28],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.85, 1.25],
  },

  // === STEEL ===
  steel_structural: {
    rateRange: [8000, 14000],
    breakdown: {
      materials: [0.55, 0.68],
      labor: [0.15, 0.25],
      equipment: [0.08, 0.15],
      logistics: [0.08, 0.12],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.95 },
      { threshold: 100, factor: 0.88 },
    ],
    locationSensitivity: 0.75,
    complexityRange: [0.85, 1.20],
  },
  steel_misc: {
    rateRange: [200, 800],
    breakdown: {
      materials: [0.50, 0.65],
      labor: [0.20, 0.32],
      equipment: [0.03, 0.08],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 50, factor: 0.95 },
      { threshold: 200, factor: 0.90 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.85, 1.25],
  },

  // === EXTERNAL ===
  asphalt: {
    rateRange: [45, 90],
    breakdown: {
      materials: [0.45, 0.58],
      labor: [0.15, 0.25],
      equipment: [0.18, 0.28],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 500, factor: 0.92 },
      { threshold: 2000, factor: 0.85 },
    ],
    locationSensitivity: 0.5,
    complexityRange: [0.90, 1.15],
  },
  curbs: {
    rateRange: [50, 110],
    breakdown: {
      materials: [0.40, 0.52],
      labor: [0.28, 0.40],
      equipment: [0.05, 0.12],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.35,
    complexityRange: [0.90, 1.15],
  },
  landscaping: {
    rateRange: [60, 200],
    breakdown: {
      materials: [0.35, 0.50],
      labor: [0.30, 0.42],
      equipment: [0.08, 0.15],
      logistics: [0.05, 0.10],
    },
    scaleFactors: [
      { threshold: 200, factor: 0.94 },
      { threshold: 1000, factor: 0.88 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.80, 1.30],
  },

  // === FURNITURE & EQUIPMENT ===
  furniture: {
    rateRange: [150, 2500],
    breakdown: {
      materials: [0.65, 0.80],
      labor: [0.08, 0.15],
      equipment: [0.02, 0.05],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 20, factor: 0.96 },
      { threshold: 100, factor: 0.92 },
    ],
    locationSensitivity: 0.3,
    complexityRange: [0.70, 1.50],
  },

  // === GENERAL FALLBACK ===
  general: {
    rateRange: [50, 400],
    breakdown: {
      materials: [0.35, 0.55],
      labor: [0.20, 0.35],
      equipment: [0.05, 0.15],
      logistics: [0.05, 0.12],
    },
    scaleFactors: [
      { threshold: 100, factor: 0.95 },
      { threshold: 500, factor: 0.90 },
    ],
    locationSensitivity: 0.4,
    complexityRange: [0.80, 1.30],
  },
};

export function getCostModel(category: ItemCategory): CostModel {
  return MODELS[category] || MODELS.general;
}

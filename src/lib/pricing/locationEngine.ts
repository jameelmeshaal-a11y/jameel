/**
 * Location Engine V1.2 — Fetches region-specific cost multipliers
 * from the location_factors table. Falls back to sensible defaults.
 */

import { supabase } from "@/integrations/supabase/client";

export interface LocationFactor {
  region: string;
  region_ar: string;
  zone_class: string;
  location_factor: number;
  logistics_adder: number;
  labor_adder: number;
  accommodation_adder: number;
  risk_adder: number;
  notes: string | null;
}

// Aliases for fuzzy matching city names to regions
const CITY_ALIASES: Record<string, string> = {
  // Arabic
  "الرياض": "Riyadh",
  "جدة": "Jeddah",
  "جده": "Jeddah",
  "الدمام": "Dammam / Eastern Province",
  "المنطقة الشرقية": "Dammam / Eastern Province",
  "الخبر": "Dammam / Eastern Province",
  "الظهران": "Dammam / Eastern Province",
  "المدينة المنورة": "Madinah",
  "المدينة": "Madinah",
  "مكة المكرمة": "Makkah",
  "مكة": "Makkah",
  "الطائف": "Taif",
  "تبوك": "Tabuk",
  "حائل": "Hail",
  "عسير": "Asir (Abha / Khamis)",
  "أبها": "Asir (Abha / Khamis)",
  "خميس مشيط": "Asir (Abha / Khamis)",
  "جازان": "Jizan",
  "جيزان": "Jizan",
  "نجران": "Najran",
  "عرعر": "Northern Borders (Arar / Rafha)",
  "رفحاء": "Northern Borders (Arar / Rafha)",
  "الحدود الشمالية": "Northern Borders (Arar / Rafha)",
  "القريات": "Al-Qurayyat / Turaif",
  "طريف": "Al-Qurayyat / Turaif",
  // English lower
  "riyadh": "Riyadh",
  "jeddah": "Jeddah",
  "jidda": "Jeddah",
  "dammam": "Dammam / Eastern Province",
  "khobar": "Dammam / Eastern Province",
  "dhahran": "Dammam / Eastern Province",
  "madinah": "Madinah",
  "medina": "Madinah",
  "makkah": "Makkah",
  "mecca": "Makkah",
  "taif": "Taif",
  "tabuk": "Tabuk",
  "hail": "Hail",
  "aseer": "Asir (Abha / Khamis)",
  "asir": "Asir (Abha / Khamis)",
  "abha": "Asir (Abha / Khamis)",
  "khamis mushait": "Asir (Abha / Khamis)",
  "jizan": "Jizan",
  "jazan": "Jizan",
  "najran": "Najran",
  "arar": "Northern Borders (Arar / Rafha)",
  "rafha": "Northern Borders (Arar / Rafha)",
  "qurayyat": "Al-Qurayyat / Turaif",
  "turaif": "Al-Qurayyat / Turaif",
  "neom": "Remote Military / NEOM / Mega-Project Site",
};

const DEFAULT_FACTOR: LocationFactor = {
  region: "Riyadh",
  region_ar: "الرياض",
  zone_class: "A",
  location_factor: 1.0,
  logistics_adder: 0,
  labor_adder: 0,
  accommodation_adder: 0,
  risk_adder: 0,
  notes: "Default base",
};

/**
 * Fetch all location factors from the DB (cached per engine run).
 */
export async function fetchLocationFactors(): Promise<LocationFactor[]> {
  const { data, error } = await supabase
    .from("location_factors")
    .select("*");
  if (error || !data) return [];
  return data as unknown as LocationFactor[];
}

/**
 * Resolve the best matching location factor for a list of project cities.
 */
export function resolveLocationFactor(
  cities: string[],
  allFactors: LocationFactor[]
): LocationFactor {
  for (const city of cities) {
    const trimmed = city.trim();
    const lower = trimmed.toLowerCase();

    // Direct alias lookup
    const aliasRegion = CITY_ALIASES[trimmed] || CITY_ALIASES[lower];
    if (aliasRegion) {
      const match = allFactors.find(f => f.region === aliasRegion);
      if (match) return match;
    }

    // Fuzzy match against region_ar
    for (const f of allFactors) {
      if (f.region_ar.includes(trimmed) || trimmed.includes(f.region_ar)) return f;
      if (f.region.toLowerCase().includes(lower) || lower.includes(f.region.toLowerCase())) return f;
    }
  }

  return allFactors.find(f => f.region === "Riyadh") || DEFAULT_FACTOR;
}

/**
 * Project overhead rates by project type.
 */
export type ProjectType = "government_civil" | "government_military" | "commercial" | "infrastructure";

const OVERHEAD_RATES: Record<ProjectType, number> = {
  government_civil: 0.12,
  government_military: 0.14,
  commercial: 0.10,
  infrastructure: 0.13,
};

export function getOverheadRate(projectType: ProjectType): number {
  return OVERHEAD_RATES[projectType] ?? 0.12;
}

export const VAT_RATE = 0.15;

export interface ProjectSummary {
  subtotal: number;
  overhead: number;
  overheadRate: number;
  totalBeforeVat: number;
  vat: number;
  grandTotal: number;
}

export function calculateProjectOverhead(
  subtotalBeforeVat: number,
  projectType: ProjectType = "government_civil"
): ProjectSummary {
  const overheadRate = getOverheadRate(projectType);
  const overhead = +(subtotalBeforeVat * overheadRate).toFixed(2);
  const totalBeforeVat = +(subtotalBeforeVat + overhead).toFixed(2);
  const vat = +(totalBeforeVat * VAT_RATE).toFixed(2);
  return {
    subtotal: +subtotalBeforeVat.toFixed(2),
    overhead,
    overheadRate,
    totalBeforeVat,
    vat,
    grandTotal: +(totalBeforeVat + vat).toFixed(2),
  };
}

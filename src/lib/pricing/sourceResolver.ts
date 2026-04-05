/**
 * Multi-source pricing intelligence resolver.
 * Priority: Approved > Weighted Average (Supplier 40% + Historical 30% + AI/Target 30%)
 */

import { supabase } from "@/integrations/supabase/client";

interface RateSource {
  id: string;
  rate_library_id: string;
  source_type: string;
  rate: number;
  is_verified: boolean;
  city: string;
}

export interface SourceResolution {
  resolvedRate: number;
  method: "approved" | "weighted" | "target";
  approvedRate: number | null;
  supplierAvg: number | null;
  historicalAvg: number | null;
  sourceCount: number;
  variance: number;
  highVariance: boolean;
  baseCity: string;
}

const avg = (arr: number[]): number =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

/**
 * Resolve the best rate for a library item from multiple sources.
 */
export function resolveFromSources(
  sources: RateSource[],
  targetRate: number,
): SourceResolution {
  const supplierRates = sources.filter(s => s.source_type === "Supplier").map(s => s.rate);
  const historicalRates = sources.filter(s => s.source_type === "Historical").map(s => s.rate);
  const approvedSources = sources.filter(s => s.source_type === "Approved");
  const approvedRates = approvedSources.map(s => s.rate);

  const supplierAvg = supplierRates.length > 0 ? avg(supplierRates) : null;
  const historicalAvg = historicalRates.length > 0 ? avg(historicalRates) : null;
  const approvedRate = approvedRates.length > 0 ? approvedRates[approvedRates.length - 1] : null;

  // Variance check
  const allRates = [...sources.map(s => s.rate), targetRate];
  const maxR = Math.max(...allRates);
  const minR = Math.min(...allRates);
  const variance = maxR > 0 ? ((maxR - minR) / maxR) * 100 : 0;

  let resolvedRate = targetRate;
  let method: SourceResolution["method"] = "target";

  // Determine base city from approved source or first available
  const baseCity = approvedSources.length > 0
    ? approvedSources[approvedSources.length - 1].city
    : sources.length > 0
    ? sources[0].city
    : "";

  if (approvedRate !== null) {
    resolvedRate = approvedRate;
    method = "approved";
  } else if (supplierAvg !== null || historicalAvg !== null) {
    const sW = supplierAvg !== null ? 0.4 : 0;
    const hW = historicalAvg !== null ? 0.3 : 0;
    const tW = 1 - sW - hW;
    resolvedRate =
      (supplierAvg ?? 0) * sW +
      (historicalAvg ?? 0) * hW +
      targetRate * tW;
    method = "weighted";
  }

  return {
    resolvedRate: +resolvedRate.toFixed(2),
    method,
    approvedRate,
    supplierAvg: supplierAvg !== null ? +supplierAvg.toFixed(2) : null,
    historicalAvg: historicalAvg !== null ? +historicalAvg.toFixed(2) : null,
    sourceCount: sources.length,
    variance: +variance.toFixed(1),
    highVariance: variance > 30,
    baseCity,
  };
}

/**
 * Fetch all sources for all library items in one query, grouped by rate_library_id.
 */
export async function fetchAllSources(): Promise<Map<string, RateSource[]>> {
  const { data, error } = await supabase
    .from("rate_sources")
    .select("id, rate_library_id, source_type, rate, is_verified, city");
  if (error) {
    console.error("Failed to fetch rate sources:", error.message);
    return new Map();
  }
  const map = new Map<string, RateSource[]>();
  for (const row of (data || [])) {
    const list = map.get(row.rate_library_id) || [];
    list.push(row as RateSource);
    map.set(row.rate_library_id, list);
  }
  return map;
}

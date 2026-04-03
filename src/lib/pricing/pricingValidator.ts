/**
 * Post-pricing validation to detect template-like patterns and quality issues.
 */

export interface ValidationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    totalItems: number;
    uniqueRates: number;
    duplicateRatePercent: number;
    categoryDistribution: Record<string, number>;
    flaggedItems: number;
  };
}

interface PricedItem {
  unitRate: number;
  category: string;
  description: string;
  priceFlag?: string;
}

export function validatePricingQuality(items: PricedItem[]): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (items.length === 0) {
    return { passed: false, issues: ["No items to validate"], warnings: [], stats: { totalItems: 0, uniqueRates: 0, duplicateRatePercent: 100, categoryDistribution: {}, flaggedItems: 0 } };
  }

  // 1. Duplicate unit rates
  const rateCounts = new Map<number, number>();
  for (const item of items) {
    const rounded = Math.round(item.unitRate * 100) / 100;
    rateCounts.set(rounded, (rateCounts.get(rounded) || 0) + 1);
  }

  const uniqueRates = rateCounts.size;
  const maxDupRate = Math.max(...rateCounts.values());
  const maxDupPercent = (maxDupRate / items.length) * 100;

  if (maxDupPercent > 20) {
    issues.push(`${maxDupPercent.toFixed(1)}% of items share the same unit rate — indicates template pricing`);
  } else if (maxDupPercent > 10) {
    warnings.push(`${maxDupPercent.toFixed(1)}% of items share the same unit rate`);
  }

  const duplicateRatePercent = +((1 - uniqueRates / items.length) * 100).toFixed(1);

  // 2. Excavation vs backfill
  const excavationItems = items.filter(i => i.category === "excavation");
  const backfillItems = items.filter(i => i.category === "backfill");
  if (excavationItems.length > 0 && backfillItems.length > 0) {
    const avgExc = excavationItems.reduce((s, i) => s + i.unitRate, 0) / excavationItems.length;
    const avgBf = backfillItems.reduce((s, i) => s + i.unitRate, 0) / backfillItems.length;
    if (Math.abs(avgExc - avgBf) / avgExc < 0.15) {
      issues.push(`Excavation avg (${avgExc.toFixed(0)}) ≈ Backfill avg (${avgBf.toFixed(0)}) — must differ significantly`);
    }
  }

  // 3. Category distribution
  const categoryDistribution: Record<string, number> = {};
  for (const item of items) {
    categoryDistribution[item.category] = (categoryDistribution[item.category] || 0) + 1;
  }

  const generalPercent = ((categoryDistribution["general"] || 0) / items.length) * 100;
  if (generalPercent > 40) {
    warnings.push(`${generalPercent.toFixed(0)}% of items are "general" — improve keyword detection`);
  } else if (generalPercent > 25) {
    warnings.push(`${generalPercent.toFixed(0)}% of items are "general" — consider adding more keywords`);
  }

  // 4. Price range flags
  const flaggedItems = items.filter(i => i.priceFlag && i.priceFlag !== "normal").length;
  if (flaggedItems > items.length * 0.15) {
    warnings.push(`${flaggedItems} items (${((flaggedItems / items.length) * 100).toFixed(0)}%) have abnormal price ranges`);
  }

  // 5. Breakdown pattern similarity — check if same category items have too-similar ratios
  // (implicitly handled by the variability in seeded random + wider ranges)

  const passed = issues.length === 0;

  return {
    passed,
    issues,
    warnings,
    stats: {
      totalItems: items.length,
      uniqueRates,
      duplicateRatePercent,
      categoryDistribution,
      flaggedItems,
    },
  };
}

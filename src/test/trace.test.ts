import { describe, it, expect } from "vitest";
import { findRateLibraryMatchV3 } from "@/lib/pricing/matchingV3";
import { detectConcepts } from "@/lib/pricing/synonyms";
import { tokenize, normalizeUnit, textSimilarity, charNgramSimilarity, overlapCoefficient } from "@/lib/pricing/similarItemMatcher";

const ceramicLibEntry = {
  id: "lib-ceramic-tile", category: "finishing",
  standard_name_ar: "بلاط سيراميك للحوائط", standard_name_en: "Ceramic Wall Tiles",
  unit: "م2", base_rate: 120, base_city: "الرياض", target_rate: 120, min_rate: 80, max_rate: 180,
  materials_pct: 65, labor_pct: 20, equipment_pct: 5, logistics_pct: 5, risk_pct: 3, profit_pct: 2,
  keywords: ["بلاط", "سيراميك", "حوائط", "ceramic", "tiles"],
  is_locked: false, weight_class: "medium", complexity: "low", source_type: "Approved",
  item_name_aliases: null, item_code: null, item_description: null,
} as any;

describe("trace", () => {
  it("traces pipe-only case", () => {
    const desc = "إجمالي النوافذ | بلاط سيراميك للحوائط";
    const clean = "بلاط سيراميك للحوائط";
    console.log("normalizeUnit م2:", normalizeUnit("م2"));
    console.log("textSim clean vs lib:", textSimilarity(clean, ceramicLibEntry.standard_name_ar));
    console.log("textSim full vs lib:", textSimilarity(desc, ceramicLibEntry.standard_name_ar));
    console.log("ngramSim clean vs lib:", charNgramSimilarity(clean, ceramicLibEntry.standard_name_ar));
    console.log("boqConcepts (clean):", detectConcepts(clean));
    console.log("boqConcepts (full):", detectConcepts(desc));
    console.log("candConcepts:", detectConcepts(ceramicLibEntry.standard_name_ar + " " + ceramicLibEntry.standard_name_en));
    console.log("boqTokens (clean):", tokenize(clean));
    const result = findRateLibraryMatchV3(desc, "", "م2", "finishing", [ceramicLibEntry]);
    console.log("RESULT:", result);
    expect(true).toBe(true);
  });
});

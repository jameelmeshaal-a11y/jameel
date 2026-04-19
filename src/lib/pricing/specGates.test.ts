/**
 * V4.2 spec-gate regression tests
 * Proves: wall 100mm, wall 200mm, wall 200mm fire-60, wall 200mm fire-120
 *         each resolve to a DIFFERENT library item — never collapse to one rate.
 */
import { describe, expect, it } from "vitest";
import { findRateLibraryMatchV3, extractThickness, extractFireRating } from "./matchingV3";

const baseLib: any = {
  category: "concrete",
  unit: "م2",
  base_rate: 0,
  base_city: "Riyadh",
  min_rate: 0,
  max_rate: 99999,
  materials_pct: 0, labor_pct: 0, equipment_pct: 0,
  logistics_pct: 0, risk_pct: 3, profit_pct: 5,
  keywords: [],
  is_locked: false,
  weight_class: "Medium",
  complexity: "Medium",
  source_type: "Manual",
  item_name_aliases: [],
  item_code: null,
  item_description: "",
};

const W100 = { ...baseLib, id: "lib-w100", standard_name_ar: "جدار بسمك 100 مم", standard_name_en: "Wall 100mm", target_rate: 110 };
const W200 = { ...baseLib, id: "lib-w200", standard_name_ar: "جدار بسمك 200 مم", standard_name_en: "Wall 200mm", target_rate: 180 };
const W200_F60 = { ...baseLib, id: "lib-w200-f60", standard_name_ar: "جدار بسمك 200 مم مقاوم للحريق لمدة 60 دقيقة", standard_name_en: "Wall 200mm fire rated 60min", target_rate: 230 };
const W200_F120 = { ...baseLib, id: "lib-w200-f120", standard_name_ar: "جدار بسمك 200 مم مقاوم للحريق لمدة 120 دقيقة", standard_name_en: "Wall 200mm fire rated 120min", target_rate: 280 };

const lib = [W100, W200, W200_F60, W200_F120];

describe("V4.2 — extractThickness", () => {
  it("extracts mm from Arabic 'بسمك 200 مم'", () => expect(extractThickness("جدار بسمك 200 مم")).toBe(200));
  it("extracts mm from 'بسمك 100 مم'", () => expect(extractThickness("جدار بسمك 100 مم")).toBe(100));
  it("extracts mm from English '150mm'", () => expect(extractThickness("Wall thickness 150mm")).toBe(150));
  it("returns null when no thickness", () => expect(extractThickness("جدار خرساني")).toBe(null));
});

describe("V4.2 — extractFireRating", () => {
  it("returns 60 for 'مقاوم للحريق لمدة 60 دقيقة'", () => expect(extractFireRating("جدار مقاوم للحريق لمدة 60 دقيقة")).toBe(60));
  it("returns 120 for 'مقاوم للحريق لمدة 120 دقيقة'", () => expect(extractFireRating("مقاوم للحريق لمدة 120 دقيقة")).toBe(120));
  it("returns 0 when no fire rating", () => expect(extractFireRating("جدار بسمك 200 مم")).toBe(0));
  it("returns 1 (generic) for fire keyword without minutes", () => expect(extractFireRating("جدار مقاوم للحريق")).toBe(1));
});

describe("V4.2 — Spec gates (the bug the user reported)", () => {
  it("Wall 100mm → matches W100 (NOT W200)", () => {
    const r = findRateLibraryMatchV3("جدار بسمك 100 مم", "Wall 100mm", "م2", "concrete", lib);
    expect(r?.item.id).toBe("lib-w100");
  });

  it("Wall 200mm → matches W200 (NOT W100, NOT fire variants)", () => {
    const r = findRateLibraryMatchV3("جدار بسمك 200 مم", "Wall 200mm", "م2", "concrete", lib);
    expect(r?.item.id).toBe("lib-w200");
  });

  it("Wall 200mm fire-60 → matches W200_F60 (NOT W200, NOT W200_F120)", () => {
    const r = findRateLibraryMatchV3("جدار بسمك 200 مم مقاوم للحريق لمدة 60 دقيقة", "Wall 200mm fire 60min", "م2", "concrete", lib);
    expect(r?.item.id).toBe("lib-w200-f60");
  });

  it("Wall 200mm fire-120 → matches W200_F120 (NOT W200_F60)", () => {
    const r = findRateLibraryMatchV3("جدار بسمك 200 مم مقاوم للحريق لمدة 120 دقيقة", "Wall 200mm fire 120min", "م2", "concrete", lib);
    expect(r?.item.id).toBe("lib-w200-f120");
  });

  it("Non-fire wall 200mm must NOT match fire-rated variant", () => {
    // Even with only fire-rated candidates available, should return null (no match)
    const onlyFireLib = [W200_F60, W200_F120];
    const r = findRateLibraryMatchV3("جدار بسمك 200 مم", "Wall 200mm", "م2", "concrete", onlyFireLib);
    expect(r).toBeNull();
  });

  it("4 distinct walls → 4 DISTINCT rates (the original bug)", () => {
    const r1 = findRateLibraryMatchV3("جدار بسمك 100 مم", "Wall 100mm", "م2", "concrete", lib);
    const r2 = findRateLibraryMatchV3("جدار بسمك 200 مم", "Wall 200mm", "م2", "concrete", lib);
    const r3 = findRateLibraryMatchV3("جدار بسمك 200 مم مقاوم للحريق لمدة 60 دقيقة", "Wall 200mm fire 60", "م2", "concrete", lib);
    const r4 = findRateLibraryMatchV3("جدار بسمك 200 مم مقاوم للحريق لمدة 120 دقيقة", "Wall 200mm fire 120", "م2", "concrete", lib);
    const rates = new Set([r1?.item.target_rate, r2?.item.target_rate, r3?.item.target_rate, r4?.item.target_rate]);
    expect(rates.size).toBe(4); // ALL DIFFERENT — bug fixed
    expect(rates.has(110)).toBe(true);
    expect(rates.has(180)).toBe(true);
    expect(rates.has(230)).toBe(true);
    expect(rates.has(280)).toBe(true);
  });
});

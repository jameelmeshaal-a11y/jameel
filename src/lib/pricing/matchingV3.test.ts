/**
 * Matching V3 — Comprehensive test suite.
 * Tests: dimension parsing, synonym detection, anti-confusion, scoring.
 * Regression: ensures V3 logic doesn't break expected behaviors.
 */
import { describe, it, expect } from "vitest";
import {
  parseDimensions,
  compareDimensions,
  detectConcepts,
  hasConceptConflict,
  hasSynonymOverlap,
  buildEnrichedDescription,
  extractParentContext,
} from "./synonyms";
import { findRateLibraryMatchV3 } from "./matchingV3";

// ─── Dimension Parsing ──────────────────────────────────────────────────────

describe("parseDimensions", () => {
  it("extracts Arabic diameter", () => {
    const dims = parseDimensions("قطر 20 مم");
    expect(dims.length).toBeGreaterThan(0);
    expect(dims[0].type).toBe("diameter");
    expect(dims[0].values[0]).toBe(20);
  });

  it("extracts diameter without spaces", () => {
    const dims = parseDimensions("قطر20مم");
    expect(dims.length).toBeGreaterThan(0);
    expect(dims[0].values[0]).toBe(20);
  });

  it("extracts DN format", () => {
    const dims = parseDimensions("DN50 valve");
    expect(dims.some(d => d.type === "diameter" && d.values[0] === 50)).toBe(true);
  });

  it("extracts WxH dimensions", () => {
    const dims = parseDimensions("1200x2000مم");
    expect(dims.some(d => d.type === "dimensions")).toBe(true);
  });

  it("extracts 3D dimensions", () => {
    const dims = parseDimensions("30X600X600");
    const dim3d = dims.find(d => d.type === "dimensions" && d.values.length === 3);
    expect(dim3d).toBeTruthy();
  });

  it("extracts thickness", () => {
    const dims = parseDimensions("سمك 3 مم");
    expect(dims.some(d => d.type === "thickness" && d.values[0] === 3)).toBe(true);
  });

  it("returns empty for text without dimensions", () => {
    expect(parseDimensions("خرسانة عادية")).toEqual([]);
  });
});

// ─── Dimension Comparison ───────────────────────────────────────────────────

describe("compareDimensions", () => {
  it("returns +1 for matching diameters", () => {
    const a = parseDimensions("قطر 20 مم");
    const b = parseDimensions("قطر 20 مم");
    expect(compareDimensions(a, b)).toBe(1);
  });

  it("returns -1 for conflicting diameters", () => {
    const a = parseDimensions("قطر 20 مم");
    const b = parseDimensions("قطر 32 مم");
    expect(compareDimensions(a, b)).toBe(-1);
  });

  it("returns 0 when no dimensions to compare", () => {
    const a = parseDimensions("خرسانة");
    const b = parseDimensions("قطر 20 مم");
    expect(compareDimensions(a, b)).toBe(0);
  });

  it("returns 0 when both have no dimensions", () => {
    expect(compareDimensions([], [])).toBe(0);
  });
});

// ─── Concept Detection ─────────────────────────────────────────────────────

describe("detectConcepts", () => {
  it("detects gate valve", () => {
    expect(detectConcepts("صمام بوابة قطر 25مم")).toContain("صمام_بوابة");
  });

  it("detects air admittance valve", () => {
    expect(detectConcepts("منفس هواء AAV قطر 25مم")).toContain("منفس_هواء");
  });

  it("detects pendent sprinkler", () => {
    expect(detectConcepts("رشاش حريق متدلي")).toContain("رشاش_متدلي");
  });

  it("detects sidewall sprinkler", () => {
    expect(detectConcepts("رشاش حريق جانبي")).toContain("رشاش_جانبي");
  });

  it("detects UPVC pipes", () => {
    expect(detectConcepts("أنابيب UPVC قطر 110مم")).toContain("انابيب_UPVC");
  });

  it("returns empty for unrecognized text", () => {
    expect(detectConcepts("some random text 12345")).toEqual([]);
  });
});

// ─── Anti-Confusion Gate ────────────────────────────────────────────────────

describe("Anti-Confusion Gate", () => {
  it("blocks gate valve ↔ air vent", () => {
    expect(hasConceptConflict(["صمام_بوابة"], ["منفس_هواء"])).toBe(true);
  });

  it("blocks pendent ↔ sidewall sprinkler", () => {
    expect(hasConceptConflict(["رشاش_متدلي"], ["رشاش_جانبي"])).toBe(true);
  });

  it("allows same concept", () => {
    expect(hasConceptConflict(["صمام_بوابة"], ["صمام_بوابة"])).toBe(false);
  });

  it("allows unrelated concepts", () => {
    expect(hasConceptConflict(["خرسانة"], ["حديد_تسليح"])).toBe(false);
  });
});

// ─── Synonym Overlap ────────────────────────────────────────────────────────

describe("Synonym Overlap", () => {
  it("detects synonym overlap for same concept", () => {
    const a = detectConcepts("صمام بوابة");
    const b = detectConcepts("gate valve حديد");
    expect(hasSynonymOverlap(a, b)).toBe(true);
  });

  it("no overlap for different concepts", () => {
    const a = detectConcepts("صمام بوابة");
    const b = detectConcepts("رشاش حريق");
    expect(hasSynonymOverlap(a, b)).toBe(false);
  });
});

// ─── Parent Context ─────────────────────────────────────────────────────────

describe("Parent Context", () => {
  it("extracts PARENT tag from notes", () => {
    expect(extractParentContext("[PARENT: أنابيب صرف صحي UPVC]")).toBe("أنابيب صرف صحي UPVC");
  });

  it("returns empty for no tag", () => {
    expect(extractParentContext("normal note")).toBe("");
  });

  it("returns empty for null", () => {
    expect(extractParentContext(null)).toBe("");
  });

  it("enriches short description", () => {
    const result = buildEnrichedDescription("قطر 20 مم", "[PARENT: أنابيب صرف UPVC]", 4);
    expect(result).toContain("أنابيب صرف UPVC");
    expect(result).toContain("قطر 20 مم");
  });

  it("does not enrich long description", () => {
    const longDesc = "توريد وتركيب أنابيب صرف صحي UPVC قطر 20 مم";
    const result = buildEnrichedDescription(longDesc, "[PARENT: header]", 4);
    expect(result).toBe(longDesc);
  });
});

// ─── V3 Matching Integration ────────────────────────────────────────────────

const mockLibrary = [
  {
    id: "lib-gate-valve-25",
    category: "plumbing",
    standard_name_ar: "صمام بوابة نحاسي قطر 25 مم",
    standard_name_en: "Brass Gate Valve 25mm",
    unit: "عدد",
    base_rate: 150,
    base_city: "الرياض",
    target_rate: 150,
    min_rate: 100,
    max_rate: 200,
    materials_pct: 60,
    labor_pct: 20,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 5,
    profit_pct: 5,
    keywords: ["صمام", "بوابة", "نحاس", "valve"],
    is_locked: false,
    weight_class: "light",
    complexity: "low",
    source_type: "Approved",
    item_name_aliases: ["محبس بوابة 25مم"],
    item_code: null,
    item_description: "صمام بوابة من النحاس قطر 25 ملم",
  },
  {
    id: "lib-aav-25",
    category: "plumbing",
    standard_name_ar: "منفس هواء AAV قطر 25 مم",
    standard_name_en: "Air Admittance Valve AAV 25mm",
    unit: "عدد",
    base_rate: 80,
    base_city: "الرياض",
    target_rate: 80,
    min_rate: 50,
    max_rate: 120,
    materials_pct: 70,
    labor_pct: 15,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 3,
    profit_pct: 2,
    keywords: ["منفس", "هواء", "AAV"],
    is_locked: false,
    weight_class: "light",
    complexity: "low",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: null,
    item_description: null,
  },
  {
    id: "lib-upvc-20",
    category: "plumbing",
    standard_name_ar: "أنابيب صرف صحي UPVC قطر 20 مم",
    standard_name_en: "UPVC Drainage Pipe 20mm",
    unit: "م.ط",
    base_rate: 25,
    base_city: "الرياض",
    target_rate: 25,
    min_rate: 15,
    max_rate: 40,
    materials_pct: 65,
    labor_pct: 20,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 3,
    profit_pct: 2,
    keywords: ["أنابيب", "صرف", "UPVC"],
    is_locked: false,
    weight_class: "medium",
    complexity: "low",
    source_type: "Approved",
    item_name_aliases: ["مواسير صرف UPVC 20مم"],
    item_code: null,
    item_description: null,
  },
  {
    id: "lib-upvc-32",
    category: "plumbing",
    standard_name_ar: "أنابيب صرف صحي UPVC قطر 32 مم",
    standard_name_en: "UPVC Drainage Pipe 32mm",
    unit: "م.ط",
    base_rate: 30,
    base_city: "الرياض",
    target_rate: 30,
    min_rate: 20,
    max_rate: 45,
    materials_pct: 65,
    labor_pct: 20,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 3,
    profit_pct: 2,
    keywords: ["أنابيب", "صرف", "UPVC"],
    is_locked: false,
    weight_class: "medium",
    complexity: "low",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: null,
    item_description: null,
  },
  {
    id: "lib-door-md05",
    category: "doors",
    standard_name_ar: "باب خشب نموذج MD-05 مقاس 900*2100مم",
    standard_name_en: "Wooden Door Model MD-05 900x2100mm",
    unit: "عدد",
    base_rate: 1200,
    base_city: "الرياض",
    target_rate: 1200,
    min_rate: 800,
    max_rate: 1600,
    materials_pct: 55,
    labor_pct: 25,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 5,
    profit_pct: 5,
    keywords: ["باب", "خشب", "MD-05"],
    is_locked: false,
    weight_class: "medium",
    complexity: "medium",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: "MD-05",
    item_description: null,
  },
  {
    id: "lib-door-md14",
    category: "doors",
    standard_name_ar: "باب خشب نموذج MD-14 مقاس 1200*2100مم",
    standard_name_en: "Wooden Door Model MD-14 1200x2100mm",
    unit: "عدد",
    base_rate: 1500,
    base_city: "الرياض",
    target_rate: 1500,
    min_rate: 1000,
    max_rate: 2000,
    materials_pct: 55,
    labor_pct: 25,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 5,
    profit_pct: 5,
    keywords: ["باب", "خشب", "MD-14"],
    is_locked: false,
    weight_class: "medium",
    complexity: "medium",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: "MD-14",
    item_description: null,
  },
  {
    id: "lib-door-1000x2350",
    category: "doors",
    standard_name_ar: "باب خشب مقاس 1000×2350مم",
    standard_name_en: "Wooden Door 1000x2350mm",
    unit: "عدد",
    base_rate: 9000,
    base_city: "الرياض",
    target_rate: 9000,
    min_rate: 6000,
    max_rate: 12000,
    materials_pct: 55,
    labor_pct: 25,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 5,
    profit_pct: 5,
    keywords: ["باب", "خشب"],
    is_locked: false,
    weight_class: "medium",
    complexity: "medium",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: null,
    item_description: null,
  },
  {
    id: "lib-door-900x2150",
    category: "doors",
    standard_name_ar: "باب خشب مقاس 900×2150مم",
    standard_name_en: "Wooden Door 900x2150mm",
    unit: "عدد",
    base_rate: 3200,
    base_city: "الرياض",
    target_rate: 3200,
    min_rate: 2000,
    max_rate: 5000,
    materials_pct: 55,
    labor_pct: 25,
    equipment_pct: 5,
    logistics_pct: 5,
    risk_pct: 5,
    profit_pct: 5,
    keywords: ["باب", "خشب"],
    is_locked: false,
    weight_class: "medium",
    complexity: "medium",
    source_type: "Approved",
    item_name_aliases: null,
    item_code: null,
    item_description: null,
  },
] as any[];

describe("findRateLibraryMatchV3", () => {
  // ── Direct lookup ──
  it("returns linked rate directly with 95% confidence", () => {
    const result = findRateLibraryMatchV3(
      "أي وصف", "", "عدد", "plumbing",
      mockLibrary, "lib-gate-valve-25",
    );
    expect(result?.confidence).toBe(95);
    expect(result?.item.id).toBe("lib-gate-valve-25");
  });

  // ── Anti-confusion: gate valve ≠ air vent ──
  it("does NOT match gate valve to air vent despite shared diameter", () => {
    const result = findRateLibraryMatchV3(
      "صمام بوابة قطر 25مم", "", "عدد", "plumbing",
      mockLibrary,
    );
    expect(result?.item.id).not.toBe("lib-aav-25");
    expect(result?.item.id).toBe("lib-gate-valve-25");
  });

  // ── Dimension match: correct diameter ──
  it("matches UPVC 20mm to correct diameter", () => {
    const result = findRateLibraryMatchV3(
      "أنابيب صرف UPVC قطر 20 مم", "", "م.ط", "plumbing",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-upvc-20");
  });

  // ── Dimension mismatch: different diameter preference ──
  it("prefers matching diameter over mismatching one", () => {
    const result = findRateLibraryMatchV3(
      "أنابيب صرف صحي UPVC قطر 32 مم", "", "م.ط", "plumbing",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-upvc-32");
  });

  // ── Short description with parent context ──
  it("boosts short description using parent context", () => {
    const result = findRateLibraryMatchV3(
      "قطر 20 مم", "", "م.ط", "plumbing",
      mockLibrary, null, undefined,
      "[PARENT: أنابيب صرف صحي UPVC]",
    );
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe("lib-upvc-20");
  });

  // ── Exact code match ──
  it("matches exact model code MD-05", () => {
    const result = findRateLibraryMatchV3(
      "باب خشب نموذج MD-05", "", "عدد", "doors",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-door-md05");
    expect(result!.confidence).toBeGreaterThanOrEqual(70);
  });

  // ── Code mismatch penalty ──
  it("MD-14 matches MD-14 not MD-05", () => {
    const result = findRateLibraryMatchV3(
      "باب خشب نموذج MD-14 مقاس 1200*2100مم", "", "عدد", "doors",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-door-md14");
  });

  // ── Full description high confidence ──
  it("full description gets high confidence ≥70", () => {
    const result = findRateLibraryMatchV3(
      "توريد وتركيب صمام بوابة نحاسي قطر 25 مم", "", "عدد", "plumbing",
      mockLibrary,
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(70);
  });

  // ── Synonym match ──
  it("matches synonym 'محبس بوابة' to gate valve", () => {
    const result = findRateLibraryMatchV3(
      "محبس بوابة 25مم", "", "عدد", "plumbing",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-gate-valve-25");
  });

  // ── No match for unrelated ──
  it("returns null for completely unrelated description", () => {
    const result = findRateLibraryMatchV3(
      "نظام مراقبة كاميرات CCTV", "", "مجموعة", "electrical",
      mockLibrary,
    );
    expect(result).toBeNull();
  });

  // ── Short description without context → lower confidence ──
  it("short description without context gets lower or equal score", () => {
    const withCtx = findRateLibraryMatchV3(
      "قطر 20 مم", "", "م.ط", "plumbing",
      mockLibrary, null, undefined,
      "[PARENT: أنابيب صرف صحي UPVC]",
    );
    const noCtx = findRateLibraryMatchV3(
      "قطر 20 مم", "", "م.ط", "plumbing",
      mockLibrary,
    );
    // With context should match the correct item
    expect(withCtx).not.toBeNull();
    expect(withCtx?.item.id).toBe("lib-upvc-20");
    // Both may hit the 99 cap, so just verify context produces a valid match
    expect(withCtx!.confidence).toBeGreaterThanOrEqual(noCtx?.confidence ?? 0);
  });

  // ── WxH Dimension Tests ──

  it("WxH mismatch: 1000×2350 door does NOT match 900×2150 library entry", () => {
    const result = findRateLibraryMatchV3(
      "باب خشب مقاس 1000×2350مم", "", "عدد", "doors",
      mockLibrary,
    );
    expect(result?.item.id).not.toBe("lib-door-900x2150");
    expect(result?.item.id).toBe("lib-door-1000x2350");
  });

  it("WxH match: 900×2150 door matches 900×2150 library entry", () => {
    const result = findRateLibraryMatchV3(
      "باب خشب مقاس 900×2150مم", "", "عدد", "doors",
      mockLibrary,
    );
    expect(result?.item.id).toBe("lib-door-900x2150");
  });

  it("linked_rate_id with dimension mismatch falls through to re-score", () => {
    // Item is 1000×2350 but linked to 900×2150 entry — should NOT trust the link
    const result = findRateLibraryMatchV3(
      "باب خشب مقاس 1000×2350مم", "", "عدد", "doors",
      mockLibrary, "lib-door-900x2150",
    );
    // Should re-score and find the correct 1000×2350 entry
    expect(result?.item.id).toBe("lib-door-1000x2350");
    expect(result?.confidence).not.toBe(95); // not the blind 95
  });

  it("linked_rate_id with matching dimensions returns 95 confidence", () => {
    const result = findRateLibraryMatchV3(
      "باب خشب مقاس 900×2150مم", "", "عدد", "doors",
      mockLibrary, "lib-door-900x2150",
    );
    expect(result?.item.id).toBe("lib-door-900x2150");
    expect(result?.confidence).toBe(95);
  });
});

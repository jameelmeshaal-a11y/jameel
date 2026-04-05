import { describe, expect, it } from "vitest";
import { normalizeArabicText, tokenize, charNgramSimilarity, textSimilarity, normalizeUnit } from "./similarItemMatcher";

describe("Deterministic pricing — Arabic normalization", () => {
  it("normalizes alef variants, taa marbuta, alef maqsura", () => {
    const a = normalizeArabicText("معالجة التربة ضد النمل الأبيض");
    const b = normalizeArabicText("معالجه الأبيض ضد التربه النمل");
    // After normalization + sorting, these should be identical
    expect(a).toBe(b);
  });

  it("handles tashkeel stripping", () => {
    const a = normalizeArabicText("مُعَالَجَة");
    const b = normalizeArabicText("معالجه");
    expect(a).toBe(b);
  });

  it("strips common prefixes (ال، و، بال، لل)", () => {
    const a = normalizeArabicText("التوريد والتركيب");
    const b = normalizeArabicText("توريد تركيب");
    expect(a).toBe(b);
  });

  it("sorts tokens for order-independent matching", () => {
    const a = normalizeArabicText("كابلات نحاسية كهربائية");
    const b = normalizeArabicText("كهربائية كابلات نحاسية");
    expect(a).toBe(b);
  });
});

describe("Deterministic pricing — tokenize v2", () => {
  it("produces tokens with min length 2", () => {
    const tokens = tokenize("في م ضد النمل");
    // "في" stripped as prefix, "م" too short (1 char), "ضد" = 2 chars OK
    expect(tokens).toContain("ضد");
    expect(tokens).toContain("نمل");
    expect(tokens.every(t => t.length >= 2)).toBe(true);
  });

  it("normalizes Arabic letters in tokens", () => {
    const a = tokenize("الأبيض");
    const b = tokenize("ابيض");
    // Both should produce the same token after stripping ال and normalizing أ
    expect(a).toEqual(b);
  });
});

describe("Deterministic pricing — charNgramSimilarity", () => {
  it("returns high similarity for same text with minor differences", () => {
    const sim = charNgramSimilarity(
      "معالجة التربة ضد النمل الأبيض",
      "معالجه التربه ضد النمل الابيض",
    );
    expect(sim).toBeGreaterThan(0.7);
  });

  it("returns low similarity for unrelated text", () => {
    const sim = charNgramSimilarity("كابلات كهربائية", "أعمال حفر");
    expect(sim).toBeLessThan(0.3);
  });

  it("handles empty strings", () => {
    expect(charNgramSimilarity("", "test")).toBe(0);
    expect(charNgramSimilarity("test", "")).toBe(0);
  });
});

describe("Deterministic pricing — approved rate bypass", () => {
  it("normalizeUnit handles Arabic/English unit variants", () => {
    expect(normalizeUnit("م3")).toBe("m3");
    expect(normalizeUnit("M3")).toBe("m3");
    expect(normalizeUnit("م2")).toBe("m2");
    expect(normalizeUnit("عدد")).toBe("no");
  });
});

describe("Deterministic pricing — textSimilarity with normalization", () => {
  it("matches items with same meaning but different Arabic spelling", () => {
    const sim = textSimilarity(
      "معالجة التربة ضد النمل الأبيض تحت البلاط",
      "معالجه التربه ضد النمل الابيض تحت البلاط",
    );
    expect(sim).toBeGreaterThan(0.8);
  });

  it("matches despite word order differences after tokenization", () => {
    const sim = textSimilarity("توريد وتركيب كابلات", "كابلات توريد تركيب");
    expect(sim).toBeGreaterThan(0.6);
  });
});

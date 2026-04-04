import { describe, it, expect } from "vitest";
import { groupSemanticRows, type BoQItemLike, hasManualOverride } from "./boqRowGrouping";

function makeRow(overrides: Partial<BoQItemLike> & { id: string }): BoQItemLike {
  return {
    item_no: "",
    description: "",
    description_en: "",
    unit: "",
    quantity: 0,
    row_index: 0,
    source: null,
    manual_overrides: null,
    ...overrides,
  };
}

describe("groupSemanticRows", () => {
  it("Case 1: merges title row (qty=0) with continuation row (qty>0)", () => {
    const items: BoQItemLike[] = [
      makeRow({ id: "a", row_index: 1, description: "معالجة التربة ضد النمل الأبيض", quantity: 0 }),
      makeRow({ id: "b", row_index: 2, description: "تحت البلاطات الأرضية وعلى طول محيط المبنى", quantity: 50, unit: "م2" }),
    ];

    const blocks = groupSemanticRows(items);
    // The zero-qty row becomes a standalone descriptive block, then the priced row gets a merged block
    const pricedBlocks = blocks.filter((b) => b.quantity > 0);
    expect(pricedBlocks).toHaveLength(1);
    expect(pricedBlocks[0].primaryRow.id).toBe("b");
    expect(pricedBlocks[0].contributorRows).toHaveLength(1);
    expect(pricedBlocks[0].contributorRows[0].id).toBe("a");
    expect(pricedBlocks[0].mergedDescription).toContain("معالجة التربة");
    expect(pricedBlocks[0].mergedDescription).toContain("تحت البلاطات");
    expect(pricedBlocks[0].quantity).toBe(50);
  });

  it("Case 2: two standalone priced rows — no merge", () => {
    const items: BoQItemLike[] = [
      makeRow({ id: "a", row_index: 1, item_no: "1.1", description: "بند أول", quantity: 10, unit: "م2" }),
      makeRow({ id: "b", row_index: 2, item_no: "1.2", description: "بند ثاني", quantity: 20, unit: "م3" }),
    ];

    const blocks = groupSemanticRows(items);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].contributorRows).toHaveLength(0);
    expect(blocks[1].contributorRows).toHaveLength(0);
    expect(blocks[0].quantity).toBe(10);
    expect(blocks[1].quantity).toBe(20);
  });

  it("Case 3: heading + scope + qty row — all grouped", () => {
    const items: BoQItemLike[] = [
      makeRow({ id: "a", row_index: 1, description: "توريد وتركيب عزل مائي", quantity: 0 }),
      makeRow({ id: "b", row_index: 2, description: "للأسطح والحمامات", quantity: 0 }),
      makeRow({ id: "c", row_index: 3, description: "شاملة المواد والعمالة", quantity: 100, unit: "م2" }),
    ];

    const blocks = groupSemanticRows(items);
    const pricedBlocks = blocks.filter((b) => b.quantity > 0);
    expect(pricedBlocks).toHaveLength(1);
    expect(pricedBlocks[0].primaryRow.id).toBe("c");
    expect(pricedBlocks[0].contributorRows).toHaveLength(2);
    expect(pricedBlocks[0].mergedDescription).toContain("توريد وتركيب عزل مائي");
    expect(pricedBlocks[0].mergedDescription).toContain("للأسطح والحمامات");
    expect(pricedBlocks[0].mergedDescription).toContain("شاملة المواد والعمالة");
  });

  it("Case 4: manual override is detected and preserved", () => {
    const row = makeRow({ id: "x", source: "manual_override", manual_overrides: { unit_rate: 150 } });
    expect(hasManualOverride(row)).toBe(true);

    const normalRow = makeRow({ id: "y", source: "library" });
    expect(hasManualOverride(normalRow)).toBe(false);
  });

  it("does not merge section headers into the next item", () => {
    const items: BoQItemLike[] = [
      makeRow({ id: "a", row_index: 1, description: "أعمال الخرسانة", quantity: 0 }),
      makeRow({ id: "b", row_index: 2, description: "صب خرسانة مسلحة", quantity: 30, unit: "م3" }),
    ];

    const blocks = groupSemanticRows(items);
    const pricedBlocks = blocks.filter((b) => b.quantity > 0);
    expect(pricedBlocks).toHaveLength(1);
    // Section header should NOT be merged
    expect(pricedBlocks[0].contributorRows).toHaveLength(0);
    expect(pricedBlocks[0].mergedDescription).not.toContain("أعمال الخرسانة");
  });
});

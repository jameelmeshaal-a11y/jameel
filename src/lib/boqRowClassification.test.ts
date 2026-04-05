import { describe, expect, it } from "vitest";
import { buildBoQExportSummary, classifyBoQRow, getPricedAnalysisRows } from "./boqRowClassification";

describe("boq row classification — warning-only policy", () => {
  it("Test A: allows export when zero-quantity descriptive rows are present", () => {
    const rows = [
      { item_no: "1", description: "Concrete", unit: "m3", quantity: 10, unit_rate: 100, total_price: 1000 },
      { item_no: "", description: "Section header", unit: "", quantity: 0 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(true);
    expect(summary.exportStatus).toBe("warning");
    expect(summary.pricedItemsCount).toBe(1);
    expect(summary.descriptiveRowsSkippedCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.blockingRows).toHaveLength(0);
    expect(getPricedAnalysisRows(rows)).toHaveLength(1);
  });

  it("Test B: allows export when empty-quantity descriptive rows are present", () => {
    const rows = [
      { item_no: "1", description: "Cable", unit: "m", quantity: 20, unit_rate: 50, total_price: 1000 },
      { item_no: "", description: "Specification text", unit: "", quantity: null },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(true);
    expect(summary.exportStatus).toBe("warning");
    expect(summary.descriptiveRowsSkippedCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.blockingRows).toHaveLength(0);
  });

  it("Test C: allows export with warnings when unit is missing", () => {
    const rows = [
      { item_no: "2", description: "Steel", unit: "", quantity: 5 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(true);
    expect(summary.exportStatus).toBe("warning");
    expect(summary.pricedItemsCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.warningRowsCount).toBeGreaterThanOrEqual(1);
    expect(summary.blockingRows).toHaveLength(0);
  });

  it("Test D: allows export with warnings in mixed workbooks", () => {
    const rows = [
      { item_no: "1", description: "Excavation", unit: "m3", quantity: 12, unit_rate: 40, total_price: 480 },
      { item_no: "", description: "Section notes", unit: "", quantity: 0 },
      { item_no: "3", description: "Broken row", unit: "", quantity: 7 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.pricedItemsCount).toBe(2);
    expect(summary.descriptiveRowsSkippedCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.canExport).toBe(true);
    expect(summary.exportStatus).toBe("warning");
    expect(summary.blockingRows).toHaveLength(0);
    expect(summary.warningRowsCount).toBeGreaterThanOrEqual(1);
  });

  it("warns for payable rows with missing pricing data (never blocks)", () => {
    const rows = [
      { item_no: "1", description: "Concrete", unit: "m3", quantity: 10, unit_rate: 100, total_price: 1000 },
      { item_no: "2", description: "Cable tray", unit: "m", quantity: 8, unit_rate: null, total_price: null },
      { item_no: "", description: "Header", unit: "", quantity: 0 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(true);
    expect(summary.exportStatus).toBe("warning");
    expect(summary.pricedItemsCount).toBe(2);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.blockingRows).toHaveLength(0);
    expect(summary.warningRows).toEqual([
      expect.objectContaining({ itemCode: "2", reason: expect.stringContaining("pricing_incomplete") }),
    ]);
  });

  it("prices rows with qty > 0 even without description", () => {
    const rows = [
      { item_no: "", description: "", unit: "", quantity: 3 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(true);
    expect(summary.pricedItemsCount).toBe(1);
    expect(summary.warningRowsCount).toBeGreaterThanOrEqual(1);
    expect(summary.invalidRowsCount).toBe(0);
    expect(summary.blockingRows).toHaveLength(0);
  });

  it("classifies qty > 0 rows as priced regardless of missing fields", () => {
    expect(classifyBoQRow({ quantity: 5 }).type).toBe("priced");
    expect(classifyBoQRow({ quantity: 1, unit: "" }).type).toBe("priced");
    expect(classifyBoQRow({ quantity: 10, item_no: "", description: "", unit: "" }).type).toBe("priced");
    expect(classifyBoQRow({ quantity: 2, description: "Steel", unit: "kg" }).type).toBe("priced");
  });

  it("never returns invalid type", () => {
    const edgeCases = [
      { quantity: 5, unit: "" },
      { quantity: 3, item_no: "" },
      { quantity: 1 },
      { quantity: 10, description: "", unit: "", item_no: "" },
    ];
    for (const row of edgeCases) {
      const result = classifyBoQRow(row);
      expect(result.type).not.toBe("invalid");
    }
  });
});

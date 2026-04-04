import { describe, expect, it } from "vitest";
import { buildBoQExportSummary, getPricedAnalysisRows } from "./boqRowClassification";

describe("boq row classification export regression", () => {
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

  it("Test C: blocks export for invalid payable rows", () => {
    const rows = [
      { item_no: "2", description: "Steel", unit: "", quantity: 5 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.canExport).toBe(false);
    expect(summary.exportStatus).toBe("blocked");
    expect(summary.invalidRowsCount).toBe(1);
    expect(summary.blockingRows).toEqual([
      expect.objectContaining({ itemCode: "2", reason: "missing unit" }),
    ]);
    expect(summary.errorMessage).toContain("invalid payable item");
  });

  it("Test D: blocks only because invalid payable rows exist in mixed workbooks", () => {
    const rows = [
      { item_no: "1", description: "Excavation", unit: "m3", quantity: 12, unit_rate: 40, total_price: 480 },
      { item_no: "", description: "Section notes", unit: "", quantity: 0 },
      { item_no: "3", description: "Broken row", unit: "", quantity: 7 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.pricedItemsCount).toBe(1);
    expect(summary.descriptiveRowsSkippedCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(1);
    expect(summary.canExport).toBe(false);
    expect(summary.blockingRows).toEqual([
      expect.objectContaining({ itemCode: "3", reason: "missing unit" }),
    ]);
    expect(getPricedAnalysisRows(rows)).toHaveLength(1);
  });

  it("blocks payable rows with missing mapped pricing only", () => {
    const rows = [
      { item_no: "1", description: "Concrete", unit: "m3", quantity: 10, unit_rate: 100, total_price: 1000 },
      { item_no: "2", description: "Cable tray", unit: "m", quantity: 8, unit_rate: null, total_price: null },
      { item_no: "", description: "Header", unit: "", quantity: 0 },
    ];

    const summary = buildBoQExportSummary(rows);

    expect(summary.exportStatus).toBe("blocked");
    expect(summary.pricedItemsCount).toBe(1);
    expect(summary.descriptiveRowsSkippedCount).toBe(1);
    expect(summary.invalidRowsCount).toBe(1);
    expect(summary.blockingRows).toEqual([
      expect.objectContaining({ itemCode: "2", reason: "price mapping failed" }),
    ]);
  });
});
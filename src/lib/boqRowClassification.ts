export type BoQRowType = "priced" | "descriptive" | "invalid";

export interface BoQRowLike {
  item_no?: string | null;
  description?: string | null;
  description_en?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unit_rate?: number | null;
  total_price?: number | null;
  materials?: number | null;
  labor?: number | null;
  equipment?: number | null;
  logistics?: number | null;
  risk?: number | null;
  profit?: number | null;
  confidence?: number | null;
  source?: string | null;
  linked_rate_id?: string | null;
}

export interface BoQRowClassification {
  type: BoQRowType;
  reason:
    | "priceable_item"
    | "zero_quantity"
    | "empty_quantity"
    | "text_block"
    | "empty_row"
    | "missing_unit"
    | "missing_item_code"
    | "broken_payable_structure";
}

export interface BoQExportSummary {
  pricedItemsCount: number;
  descriptiveRowsSkippedCount: number;
  invalidRowsCount: number;
  descriptiveRowsWithPricingCount: number;
  exportStatus: "ready" | "warning" | "blocked";
  canExport: boolean;
  warningMessage: string | null;
  errorMessage: string | null;
}

const PRICING_FIELDS: Array<keyof BoQRowLike> = [
  "unit_rate",
  "total_price",
  "materials",
  "labor",
  "equipment",
  "logistics",
  "risk",
  "profit",
  "confidence",
  "source",
  "linked_rate_id",
];

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function parseQuantity(value: BoQRowLike["quantity"]): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasStoredPricingData(row: BoQRowLike): boolean {
  return PRICING_FIELDS.some((field) => {
    const value = row[field];
    return value != null && value !== "";
  });
}

export function classifyBoQRow(row: BoQRowLike): BoQRowClassification {
  const quantity = parseQuantity(row.quantity);
  const hasItemCode = hasText(row.item_no);
  const hasUnit = hasText(row.unit);
  const hasDescription = hasText(row.description) || hasText(row.description_en);
  const hasRowContent = hasItemCode || hasUnit || hasDescription || quantity != null;

  if (!hasRowContent) return { type: "descriptive", reason: "empty_row" };
  if (quantity == null) return { type: "descriptive", reason: hasDescription ? "text_block" : "empty_quantity" };
  if (quantity <= 0) return { type: "descriptive", reason: "zero_quantity" };
  if (hasItemCode && hasUnit) return { type: "priced", reason: "priceable_item" };
  if (hasItemCode && !hasUnit) return { type: "invalid", reason: "missing_unit" };
  if (!hasItemCode && hasUnit) return { type: "invalid", reason: "missing_item_code" };
  return { type: "invalid", reason: "broken_payable_structure" };
}

export function isPriceableBoQRow(row: BoQRowLike): boolean {
  return classifyBoQRow(row).type === "priced";
}

export function getRowPersistenceStatus(row: BoQRowLike): string {
  const classification = classifyBoQRow(row);
  if (classification.type === "descriptive") return "description";
  if (classification.type === "invalid") return "invalid";
  return "pending";
}

export function getRowClassificationNote(row: BoQRowLike): string | null {
  const classification = classifyBoQRow(row);
  if (classification.type === "descriptive") {
    return "وصف / بند غير مسعّر — Description / Non-priced";
  }
  if (classification.type === "invalid") {
    return "بند غير صالح للتسعير — Invalid payable item (missing item code/unit or broken structure)";
  }
  return null;
}

export function getPricedAnalysisRows<T extends BoQRowLike>(rows: T[]): T[] {
  return rows.filter((row) => classifyBoQRow(row).type === "priced" && hasStoredPricingData(row));
}

export function buildBoQExportSummary(rows: BoQRowLike[]): BoQExportSummary {
  let pricedItemsCount = 0;
  let descriptiveRowsSkippedCount = 0;
  let invalidRowsCount = 0;
  let descriptiveRowsWithPricingCount = 0;

  for (const row of rows) {
    const classification = classifyBoQRow(row);
    if (classification.type === "priced") pricedItemsCount++;
    if (classification.type === "descriptive") {
      descriptiveRowsSkippedCount++;
      if (hasStoredPricingData(row)) descriptiveRowsWithPricingCount++;
    }
    if (classification.type === "invalid") invalidRowsCount++;
  }

  const canExport = invalidRowsCount === 0 && descriptiveRowsWithPricingCount === 0;
  const exportStatus = !canExport
    ? "blocked"
    : descriptiveRowsSkippedCount > 0
    ? "warning"
    : "ready";

  return {
    pricedItemsCount,
    descriptiveRowsSkippedCount,
    invalidRowsCount,
    descriptiveRowsWithPricingCount,
    exportStatus,
    canExport,
    warningMessage:
      canExport && descriptiveRowsSkippedCount > 0
        ? "Descriptive rows with zero/empty quantity were excluded from pricing."
        : null,
    errorMessage: canExport
      ? null
      : "Export failed because one or more invalid payable item rows could not be priced or written safely.",
  };
}
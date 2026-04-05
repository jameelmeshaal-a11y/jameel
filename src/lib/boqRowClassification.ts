export type BoQRowType = "priced" | "descriptive";

export interface BoQRowLike {
  item_no?: string | null;
  description?: string | null;
  description_en?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  row_index?: number | null;
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
    | "empty_row";
  warnings?: string[];
}

export interface BoQExportWarningRow {
  rowNumber: number | null;
  itemCode: string;
  description: string;
  reason: string;
}

/** @deprecated Use BoQExportWarningRow instead */
export interface BoQExportBlockingRow {
  rowNumber: number | null;
  itemCode: string;
  description: string;
  reason: string;
}

export interface BoQExportSummary {
  pricedItemsCount: number;
  descriptiveRowsSkippedCount: number;
  /** @deprecated Always 0 — no rows are invalid under warning-only policy */
  invalidRowsCount: number;
  descriptiveRowsWithPricingCount: number;
  /** @deprecated Always empty — use warningRows instead */
  blockingRows: BoQExportBlockingRow[];
  warningRows: BoQExportWarningRow[];
  warningRowsCount: number;
  exportStatus: "ready" | "warning";
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

function hasValue(value: unknown): boolean {
  return value != null && value !== "";
}

function parseQuantity(value: BoQRowLike["quantity"]): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasStoredPricingData(row: BoQRowLike): boolean {
  return PRICING_FIELDS.some((field) => {
    const value = row[field];
    return hasValue(value);
  });
}

export function hasCompletePricingData(row: BoQRowLike): boolean {
  return hasValue(row.unit_rate) && hasValue(row.total_price);
}

export function classifyBoQRow(row: BoQRowLike): BoQRowClassification {
  const quantity = parseQuantity(row.quantity);
  const hasUnit = hasText(row.unit);
  const hasDescription = hasText(row.description) || hasText(row.description_en);
  const hasRowContent = hasText(row.item_no) || hasUnit || hasDescription || quantity != null;

  if (!hasRowContent) return { type: "descriptive", reason: "empty_row" };
  if (quantity == null) return { type: "descriptive", reason: hasDescription ? "text_block" : "empty_quantity" };
  if (quantity <= 0) return { type: "descriptive", reason: "zero_quantity" };

  // quantity > 0 → ALWAYS priced. Collect warnings for missing fields.
  const warnings: string[] = [];
  if (!hasUnit) warnings.push("missing_unit");
  if (!hasText(row.item_no)) warnings.push("missing_item_code");
  if (!hasDescription) warnings.push("no_description");

  return {
    type: "priced",
    reason: "priceable_item",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function isPriceableBoQRow(row: BoQRowLike): boolean {
  return classifyBoQRow(row).type === "priced";
}

/**
 * Canonical DB status values (must match boq_items_status_check constraint):
 * pending, approved, review, conflict, descriptive, invalid,
 * needs_review, manual_override, project_override, priced
 */
export function getRowPersistenceStatus(row: BoQRowLike): string {
  const classification = classifyBoQRow(row);
  if (classification.type === "descriptive") return "descriptive";
  // Priced with warnings → needs_review; otherwise → pending
  if (classification.warnings && classification.warnings.length > 0) return "needs_review";
  return "pending";
}

export function getRowClassificationNote(row: BoQRowLike): string | null {
  const classification = classifyBoQRow(row);
  if (classification.type === "descriptive") {
    return "وصف / بند غير مسعّر — Description / Non-priced";
  }
  if (classification.warnings && classification.warnings.length > 0) {
    const warningList = classification.warnings.join(", ");
    return `بند مسعّر يحتاج مراجعة — Priced with warnings: ${warningList}`;
  }
  return null;
}

export function getPricedAnalysisRows<T extends BoQRowLike>(rows: T[]): T[] {
  return rows.filter((row) => classifyBoQRow(row).type === "priced" && hasCompletePricingData(row));
}

function toWarningRow(row: BoQRowLike, reason: string): BoQExportWarningRow {
  return {
    rowNumber: typeof row.row_index === "number" ? row.row_index + 1 : null,
    itemCode: String(row.item_no ?? "").trim(),
    description: String(row.description ?? row.description_en ?? "").trim(),
    reason,
  };
}

export function buildBoQExportSummary(rows: BoQRowLike[]): BoQExportSummary {
  let pricedItemsCount = 0;
  let descriptiveRowsSkippedCount = 0;
  let descriptiveRowsWithPricingCount = 0;
  const warningRows: BoQExportWarningRow[] = [];

  for (const row of rows) {
    const classification = classifyBoQRow(row);

    if (classification.type === "priced") {
      pricedItemsCount++;

      // Collect warnings for informational purposes (never blocking)
      const reasons: string[] = [];
      if (classification.warnings) {
        reasons.push(...classification.warnings);
      }
      if (!hasCompletePricingData(row)) {
        reasons.push("pricing_incomplete");
      }
      if (reasons.length > 0) {
        warningRows.push(toWarningRow(row, reasons.join(", ")));
      }
    }

    if (classification.type === "descriptive") {
      descriptiveRowsSkippedCount++;
      if (hasStoredPricingData(row)) descriptiveRowsWithPricingCount++;
    }
  }

  const canExport = pricedItemsCount > 0;
  const exportStatus: "ready" | "warning" = warningRows.length > 0 || descriptiveRowsSkippedCount > 0 ? "warning" : "ready";

  return {
    pricedItemsCount,
    descriptiveRowsSkippedCount,
    invalidRowsCount: 0,
    descriptiveRowsWithPricingCount,
    blockingRows: [],
    warningRows,
    warningRowsCount: warningRows.length,
    exportStatus,
    canExport,
    warningMessage:
      warningRows.length > 0
        ? `${warningRows.length} row(s) priced with warnings — review recommended.`
        : descriptiveRowsSkippedCount > 0
        ? "Descriptive rows with zero/empty quantity were excluded from pricing."
        : null,
    errorMessage: canExport
      ? null
      : "No priced items found in this workbook.",
  };
}

/**
 * Semantic Row Grouping for BoQ Pricing
 *
 * Groups adjacent rows so that zero-quantity description rows above a
 * priced row (quantity > 0) contribute their meaning to that row's
 * classification and pricing — without aggregating quantities.
 *
 * Rules:
 * - Quantity row (qty > 0) is the primaryRow that receives pricing
 * - Zero-qty rows above it contribute merged description text
 * - Section headers / titles are NOT merged into the next item
 * - Standalone priced rows pass through unchanged
 */

export interface BoQItemLike {
  id: string;
  item_no: string;
  description: string;
  description_en: string;
  unit: string;
  quantity: number;
  row_index: number;
  source?: string | null;
  manual_overrides?: Record<string, unknown> | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface SemanticBlock {
  /** The row with qty > 0 that receives the pricing result */
  primaryRow: BoQItemLike;
  /** Zero-qty rows above that contribute meaning — marked descriptive */
  contributorRows: BoQItemLike[];
  /** Combined description text used for classification */
  mergedDescription: string;
  mergedDescriptionEn: string;
  /** Quantity from primaryRow only */
  quantity: number;
  unit: string;
  itemNo: string;
}

// ─── Section-title detection ────────────────────────────────────────────────

const SECTION_PATTERNS_AR = [
  /^أعمال\s/,
  /^القسم\s/,
  /^باب\s/,
  /^أولاً/,
  /^ثانياً/,
  /^ثالثاً/,
  /^رابعاً/,
  /^خامساً/,
  /^ملاحظة/,
  /^ملحوظة/,
];

const SECTION_PATTERNS_EN = [
  /^SECTION\s/i,
  /^PART\s/i,
  /^DIVISION\s/i,
  /^NOTE[S]?\s*:/i,
  /^GENERAL\s/i,
];

const NUMBERED_HEADING = /^\d+[\-\.]\s/;

function isSectionTitle(description: string, descriptionEn: string): boolean {
  const trimmed = description.trim();
  const trimmedEn = descriptionEn.trim();

  // Short generic text with no item code → likely a heading
  const wordCount = trimmed.split(/\s+/).length;

  for (const pat of SECTION_PATTERNS_AR) {
    if (pat.test(trimmed)) return true;
  }
  for (const pat of SECTION_PATTERNS_EN) {
    if (pat.test(trimmedEn)) return true;
  }

  // Numbered heading like "1- " at very short length
  if (NUMBERED_HEADING.test(trimmed) && wordCount <= 5) return true;

  // All-caps English heading
  if (trimmedEn.length > 3 && trimmedEn === trimmedEn.toUpperCase() && wordCount <= 6) return true;

  return false;
}

// ─── Grouping algorithm ─────────────────────────────────────────────────────

/**
 * Groups BoQ items into SemanticBlocks.
 *
 * Items MUST be pre-sorted by row_index ascending.
 *
 * Zero-quantity rows accumulate in a buffer. When a priced row (qty > 0)
 * appears, the buffer is checked: if the rows are related (not section
 * headers), they become contributorRows and their descriptions are merged
 * with the priced row. Otherwise the buffer is flushed as standalone
 * descriptive blocks and the priced row stands alone.
 */
export function groupSemanticRows(items: BoQItemLike[]): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];
  let buffer: BoQItemLike[] = [];

  for (const item of items) {
    const qty = Number(item.quantity) || 0;

    if (qty <= 0) {
      // Zero-quantity row → buffer it
      buffer.push(item);
      continue;
    }

    // We have a priced row (qty > 0)
    // Determine which buffered rows can merge
    const relatedRows: BoQItemLike[] = [];
    const unrelatedRows: BoQItemLike[] = [];

    for (const buf of buffer) {
      const isHeader = isSectionTitle(buf.description, buf.description_en);
      // If the buffer row has a different item_no from the priced row and
      // that item_no is non-empty, it's likely a separate item → don't merge
      const hasDifferentItemNo =
        buf.item_no && item.item_no && buf.item_no !== item.item_no && buf.item_no.trim() !== "";

      if (isHeader || hasDifferentItemNo) {
        unrelatedRows.push(buf);
      } else {
        relatedRows.push(buf);
      }
    }

    // Flush unrelated rows as standalone descriptive blocks (no primaryRow)
    for (const ur of unrelatedRows) {
      blocks.push({
        primaryRow: ur,
        contributorRows: [],
        mergedDescription: ur.description,
        mergedDescriptionEn: ur.description_en,
        quantity: 0,
        unit: ur.unit,
        itemNo: ur.item_no,
      });
    }

    // Build merged description from related rows + priced row
    // Also prepend parent context from notes if available
    const parentContext = extractParentContext(item.notes);
    const descParts = relatedRows.map((r) => r.description.trim()).filter(Boolean);
    if (parentContext) descParts.unshift(parentContext);
    descParts.push(item.description.trim());
    const mergedDescription = descParts.join(" — ");

    const descEnParts = relatedRows.map((r) => r.description_en.trim()).filter(Boolean);
    descEnParts.push(item.description_en.trim());
    const mergedDescriptionEn = descEnParts.join(" — ");

    blocks.push({
      primaryRow: item,
      contributorRows: relatedRows,
      mergedDescription,
      mergedDescriptionEn,
      quantity: qty,
      unit: item.unit,
      itemNo: item.item_no,
    });

    buffer = [];
  }

  // Flush remaining buffer (trailing zero-qty rows with no priced row after)
  for (const remaining of buffer) {
    blocks.push({
      primaryRow: remaining,
      contributorRows: [],
      mergedDescription: remaining.description,
      mergedDescriptionEn: remaining.description_en,
      quantity: 0,
      unit: remaining.unit,
      itemNo: remaining.item_no,
    });
  }

  return blocks;
}

/**
 * Check if a block has a manual override that should be preserved.
 */
export function hasManualOverride(item: BoQItemLike): boolean {
  if (item.source === "manual_override") return true;
  if (
    item.manual_overrides &&
    typeof item.manual_overrides === "object" &&
    Object.keys(item.manual_overrides).length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Extract parent context from notes field.
 * Notes may contain `[PARENT: ...]` prefix from the parser.
 */
function extractParentContext(notes?: string | null): string {
  if (!notes) return "";
  const match = notes.match(/\[PARENT:\s*(.+?)\]/);
  return match ? match[1].trim() : "";
}
  if (item.source === "manual_override") return true;
  if (
    item.manual_overrides &&
    typeof item.manual_overrides === "object" &&
    Object.keys(item.manual_overrides).length > 0
  ) {
    return true;
  }
  return false;
}

import type { ValidationWarning } from "./types";
import type { ParsedOrder, ParsedItem } from "./types";
import type { DraftRow } from "../db/database";

/**
 * Tolerance in paise for arithmetic mismatches. Bills often round line
 * totals; a small tolerance prevents noisy warnings while still catching
 * real errors.
 */
const TOTAL_DISCREPANCY_TOLERANCE = 200; // ₹2
const PER_ITEM_TOLERANCE = 100;          // ₹1

function fmt(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function warn(
  severity: "info" | "warning" | "error",
  code: string,
  message: string,
  field?: string,
  allowOverride = true,
): ValidationWarning {
  return { id: `w-${code}:${field ?? "global"}`, severity, code, message, field, allowOverride };
}

/** Backwards-compatible no-op: ids are now deterministic. */
export function resetWarningIds(): void {
  /* keep for older callers/tests */
}

function paise(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  return null;
}

export function sumLineTotals(items: ParsedItem[]): number {
  return items.reduce((acc, i) => acc + (i.lineTotal ?? 0), 0);
}

/** Sum of preserved-but-unclassified fees. */
export function sumUnclassifiedFees(parsed: Pick<ParsedOrder, "unclassifiedFees">): number {
  return (parsed.unclassifiedFees ?? []).reduce((acc, f) => acc + Math.abs(f.value), 0);
}

/**
 * Expected final total from the individual components, using integer
 * paise throughout: subtotal + fees + tax - discount. Uses the sum of
 * line items as a fallback base when a subtotal is not stated.
 */
export function expectedTotal(parsed: ParsedOrder, itemsTotal?: number): number | null {
  const base = paise(parsed.subtotal) ?? (itemsTotal ?? sumLineTotals(parsed.items));
  if (base === null || base === undefined) return null;
  return candidatesFromBase(base, parsed)[0];
}

/**
 * Some platforms embed discounts into the item prices (Blinkit shows
 * "Product discount -₹4" already applied on top of an item-total of ₹363),
 * so the printed discount must not be subtracted a second time; others list
 * it as a credit. Both candidates are valid bills, and the printed total is
 * accepted when it reconciles with either.
 */
function candidatesFromBase(base: number, parsed: ParsedOrder): [number, number] {
  const fees =
    (paise(parsed.deliveryFee) ?? 0) +
    (paise(parsed.handlingFee) ?? 0) +
    (paise(parsed.packagingFee) ?? 0) +
    (paise(parsed.tax) ?? 0) +
    sumUnclassifiedFees(parsed);
  return [base + fees - (paise(parsed.discount) ?? 0), base + fees];
}

function within(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Validate a freshly parsed order candidate. Returns warnings; empty
 * array means no issues. Does **not** modify the candidate.
 */
export function validateParsedOrder(parsed: ParsedOrder): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (parsed.itemsUnreliable) {
    warnings.push(
      warn("error", "ITEMS_UNRELIABLE",
        "Couldn't reliably identify the items. Please review or try again.", "items"),
    );
  } else if (parsed.items.length === 0) {
    if (parsed.total !== null && parsed.total > 0) {
      warnings.push(
        warn("error", "ITEMS_NOT_FOUND",
          "Total found, but no line items could be identified.", "items"),
      );
    } else {
      warnings.push(warn("error", "EMPTY_ITEMS", "No items were found on the bill.", "items"));
    }
  }

  for (const [idx, item] of parsed.items.entries()) {
    if (item.quantity <= 0) {
      warnings.push(
        warn("warning", "ITEM_INVALID_QTY", `Item ${idx + 1} (${item.name}) has an invalid quantity.`, `items.${idx}.quantity`),
      );
    }
    if (item.unitPrice === null) {
      warnings.push(
        warn("warning", "ITEM_UNIT_PRICE_MISSING", `Item ${idx + 1} (${item.name}) is missing a unit price.`, `items.${idx}.unitPrice`),
      );
    }
    if (item.lineTotal !== null && item.unitPrice !== null) {
      const expected = Math.round(item.unitPrice) * Math.max(1, Math.round(item.quantity));
      if (!within(item.lineTotal, expected, PER_ITEM_TOLERANCE)) {
        warnings.push(
          warn("warning", "ITEM_LINE_TOTAL_MISMATCH",
            `Item ${idx + 1} (${item.name}): line total ${fmt(item.lineTotal)} ≠ ${item.quantity} × ${fmt(item.unitPrice)} = ${fmt(expected)}. Please check.`,
            `items.${idx}.lineTotal`),
        );
      }
    }
  }

  // Items total vs stated subtotal
  const itemsTotal = sumLineTotals(parsed.items);
  const subtotal = paise(parsed.subtotal);
  if (subtotal !== null && itemsTotal > 0 && !within(itemsTotal, subtotal, TOTAL_DISCREPANCY_TOLERANCE)) {
    const diff = Math.abs(itemsTotal - subtotal);
    warnings.push(
      warn("warning", "ITEMS_VS_SUBTOTAL",
        `Items total ${fmt(itemsTotal)} · bill subtotal ${fmt(subtotal)} · ${fmt(diff)} difference — please review.`,
        "subtotal"),
    );
  }

  // Some items were found, but the read is incomplete — flag for review.
  if (
    parsed.items.length > 0 &&
    (parsed.items.some((i) => i.unitPrice === null) ||
      (subtotal !== null && itemsTotal < subtotal - TOTAL_DISCREPANCY_TOLERANCE))
  ) {
    warnings.push(
      warn("info", "ITEMS_PARTIAL",
        "Some items may be missing. Please review before confirming.", "items"),
    );
  }

  for (const [idx, fee] of (parsed.unclassifiedFees ?? []).entries()) {
    warnings.push(
      warn("warning", "UNCLASSIFIED_FEE",
        `${fee.label} ${fmt(Math.abs(fee.value))} could not be classified. It is included in the total but assigned for review.`,
        `fees.unclassified.${idx}`),
    );
  }

  // Total reconciliation. Accept the printed total when it reconciles with
  // either subtotal + fees − discount (discount as a credit) or
  // subtotal + fees (discount already embedded in the item prices).
  const total = paise(parsed.total);
  if (total === null) {
    warnings.push(warn("error", "TOTAL_MISSING", "No total found on the bill.", "total"));
  } else {
    const base = paise(parsed.subtotal) ?? itemsTotal;
    if (base !== null && base !== undefined) {
      const [exclusive, inclusive] = candidatesFromBase(base, parsed);
      const reconciled = within(total, exclusive, TOTAL_DISCREPANCY_TOLERANCE) ||
        within(total, inclusive, TOTAL_DISCREPANCY_TOLERANCE);
      if (!reconciled) {
        const diff = Math.min(Math.abs(total - exclusive), Math.abs(total - inclusive));
        warnings.push(
          warn("warning", "TOTAL_MISMATCH",
            `Expected total ${fmt(exclusive)} or ${fmt(inclusive)} but the bill says ${fmt(total)} (${fmt(diff)} difference). Please review before confirming.`,
            "total"),
        );
      }
    }
  }

  if (parsed.platform === null) {
    warnings.push(warn("warning", "PLATFORM_MISSING", "Could not identify the shopping platform.", "platform", false));
  }

  if (parsed.orderedAt === null) {
    warnings.push(warn("warning", "ORDER_DATE_MISSING", "Could not determine the order date.", "orderedAt"));
  }

  return warnings;
}

/**
 * Re-validate a draft after user edits. Produces warnings for the
 * current state of the draft.
 */
export function validateDraft(draft: DraftRow): ValidationWarning[] {
  return validateParsedOrder({
    platform: draft.platform,
    orderedAt: draft.orderedAt,
    items: draft.items,
    subtotal: draft.subtotal,
    deliveryFee: draft.deliveryFee,
    handlingFee: draft.handlingFee,
    packagingFee: draft.packagingFee,
    tax: draft.tax,
    discount: draft.discount,
    unclassifiedFees: draft.unclassifiedFees ?? [],
    total: draft.total,
  });
}

/**
 * True when all critical errors are resolved. Blocks confirmation if
 * any "error" severity warnings remain that are not overridden by the user.
 */
export function hasBlockingErrors(
  warnings: ValidationWarning[],
  overrides: Set<string> = new Set(),
): boolean {
  return warnings.some(
    (w) => w.severity === "error" && w.allowOverride && !overrides.has(w.id),
  );
}

/**
 * Platform detection heuristic: scans raw text for known platform names.
 */
export function detectPlatform(text: string): import("../domain/types").Platform | null {
  const lower = text.toLowerCase();
  if (lower.includes("blinkit")) return "blinkit";
  if (lower.includes("zepto")) return "zepto";
  if (lower.includes("instamart") || lower.includes("swiggy")) return "instamart";
  if (lower.includes("bigbasket") || lower.includes("big basket")) return "bigbasket";
  if (lower.includes("amazon")) return "amazon";
  return null;
}
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

function warn(
  severity: "info" | "warning" | "error",
  code: string,
  message: string,
  field?: string,
  allowOverride = true,
): ValidationWarning {
  // Deterministic id so overrides (keyed by id in the review UI) survive
  // re-validation on every render. One warning per (code, field).
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

function sumLineTotals(items: ParsedItem[]): number {
  return items.reduce((acc, i) => acc + (i.lineTotal ?? 0), 0);
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

  if (parsed.items.length === 0) {
    warnings.push(warn("error", "EMPTY_ITEMS", "No items were found on the bill.", "items"));
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
            `Item ${idx + 1} (${item.name}): line total ${item.lineTotal / 100} ≠ ${item.quantity} × ${(item.unitPrice) / 100} = ${expected / 100}.`,
            `items.${idx}.lineTotal`),
        );
      }
    }
  }

  // Items total vs stated subtotal
  const itemsTotal = sumLineTotals(parsed.items);
  const subtotal = paise(parsed.subtotal);
  if (subtotal !== null && itemsTotal > 0 && !within(itemsTotal, subtotal, TOTAL_DISCREPANCY_TOLERANCE)) {
    warnings.push(
      warn("warning", "ITEMS_VS_SUBTOTAL",
        `Items total ₹${(itemsTotal / 100).toFixed(2)} but bill subtotal says ₹${(subtotal / 100).toFixed(2)}.`,
        "subtotal"),
    );
  }

  // Total
  const total = paise(parsed.total);
  if (total === null) {
    warnings.push(warn("error", "TOTAL_MISSING", "No total found on the bill.", "total"));
  } else {
    const fees =
      (subtotal ?? itemsTotal) +
      (paise(parsed.deliveryFee) ?? 0) +
      (paise(parsed.handlingFee) ?? 0) +
      (paise(parsed.packagingFee) ?? 0) +
      (paise(parsed.tax) ?? 0) -
      (paise(parsed.discount) ?? 0);
    if (!within(total, fees, TOTAL_DISCREPANCY_TOLERANCE)) {
      warnings.push(
        warn("warning", "TOTAL_MISMATCH",
          `Expected total ₹${(fees / 100).toFixed(2)} but bill says ₹${(total / 100).toFixed(2)}.`,
          "total"),
      );
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
import type { Paise } from "./money";

/**
 * Format integer paise as a human-readable rupee string.
 *
 * Always two decimal places: 20250 => "₹202.50", 500 => "₹5.00"
 */
export function formatRupee(amount: Paise): string {
  return `₹${formatRupeeNumber(amount)}`;
}

/**
 * Same as `formatRupee` without the ₹ prefix.
 */
export function formatRupeeNumber(amount: Paise): string {
  const rupees = amount / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact form: "₹202" when zero paise, else full.
 */
export function formatRupeeCompact(amount: Paise): string {
  if (amount % 100 === 0) {
    return `₹${(amount / 100).toLocaleString("en-IN")}`;
  }
  return formatRupee(amount);
}

/**
 * Parse a user-facing rupee string into integer paise.
 * Accepts: "202", "202.5", "202.50", "₹202.50", "₹ 202", "2,02,500"
 * Throws if unparseable.
 */
export function parseRupeeInput(raw: string): Paise {
  const cleaned = raw
    .replace(/\u20B9/g, "") // ₹
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .trim();
  if (cleaned === "") throw new Error("parseRupeeInput: empty string");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`parseRupeeInput: "${raw}" is not a valid number`);
  }
  if (n < 0) {
    throw new Error("parseRupeeInput: negative amount");
  }
  return Math.round(n * 100);
}

/**
 * Best-effort parse that returns null for clearly invalid values rather
 * than throwing. Used when parsing raw OCR output.
 */
export function tryParseRupee(raw: string): Paise | null {
  try {
    return parseRupeeInput(raw);
  } catch {
    return null;
  }
}

/**
 * Format a rupee amount as the negative form used for discounts.
 * 2000 => "−₹20"
 */
export function formatDiscount(amount: Paise): string {
  return `−${formatRupeeCompact(amount)}`;
}
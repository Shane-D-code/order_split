import type { ParsedOrder, ParsedItem, UnclassifiedFee } from "./types";
import { detectPlatform } from "./validate-import";
import type { Platform } from "../domain/types";

/**
 * Pure text -> structured candidate order parser.
 *
 * No I/O. Consumes normalized OCR / PDF text and produces a ParsedOrder
 * where every missing field is explicitly `null` (never inferred to make
 * arithmetic work). Bill formats differ per platform; the parser is
 * intentionally conservative: it prefers an honest `null` (or an
 * "unclassified fee") over a wrong guess.
 */

function roundPaise(n: number): number {
  return Math.round(n * 100);
}

function toPaise(num: string): number {
  const cleaned = num
    .replace(/,/g, "")
    .replace(/^\s*-{1,2}/, "-")
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Math.round(n * 100);
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    // Normalize explicit quantity marks ("2x₹30", "2 × ₹30", "₹82×2")
    // but never touch plain spaces before rupees: that would corrupt
    // item totals, and never split digits-glued-to-digits ("2009x171"
    // is OCR garbage; the item matchers handle `x`/`×` directly).
    .replace(/(\d)\s*[×⨯✕xX]\s*(?=₹)/gi, "$1 x ")
    .replace(/[×⨯✕](?=\s*₹)/g, " x ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n");
}

export function linesOf(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/* --------------------------- Money tokens --------------------------- */

function signOf(raw: string): number {
  return /^[−−-]/.test(raw) ? -1 : 1;
}

/**
 * ₹120 | -₹5 | Rs 30 | 30.50 | 1,200.00
 *
 * Also tolerates common OCR manglings of the ₹ glyph: ¥ % ~ ' Z.
 * The `₹` prefix is optional for bare decimal amounts.
 */
function findMoneyTokens(line: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const re =
    /-?\s*(?:₹|rs\.?|inr|rupees?|[¥%'~Z])\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?|[-−–]?\s*[0-9]{1,6}(?:,[0-9]{2,3})*\.[0-9]{1,2}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const raw = m[0];
    const cleaned = raw
      .replace(/[₹^¥%'~Z]/g, "")
      .replace(/rs\.?|inr|rupees?/gi, "")
      .replace(/[\s,−–]/g, "")
      .replace(/^-+/, "");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) continue;
    out.push({ value: signOf(raw) * Math.round(n * 100), index: m.index, raw });
  }
  return out;
}

/** Does the line carry numbers (a ₹, a decimal amount, or tabular columns)? */
function hasNumericContent(line: string): boolean {
  if (/[₹¥%]/.test(line)) return true;
  if (/\d+\.\d{1,2}/.test(line)) return true;
  // Digit-leading lines are tabular/qty-first ("400g x1 ¥95", "2 x ₹30").
  if (/^\s*\d/.test(line)) return true;
  // Two or more bare numbers at the end of the line → tabular columns.
  if (/(^|\s)\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)+\s*$/.test(line)) return true;
  // Explicit quantity mark with a count ("… 2 x …", "… 500g × 1 …").
  return /[×x]\s*\d+(?:\.\d+)?/.test(line);
}

/* --------------------------- Date parsing --------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDateFromText(text: string): string | null {
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return dateToISO(y, m, null, d);
    }
  }
  const dm = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})\b/i);
  if (dm) {
    return dateToISO(Number(dm[3]), MONTHS[dm[2].toLowerCase()]!, null, Number(dm[1]));
  }
  const md = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/i);
  if (md) {
    return dateToISO(Number(md[3]), MONTHS[md[1].toLowerCase()]!, null, Number(md[2]));
  }
  return null;
}

function parseTimeFromText(text: string): string | null {
  const m =
    text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i) ??
    text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  if (min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function dateToISO(year: number, month: number, day: number | null, altDay?: number): string {
  const d = day ?? altDay ?? 1;
  return `${year}-${pad(month)}-${pad(d)}`;
}

function buildOrderedAt(text: string): string | null {
  const date = parseDateFromText(text);
  if (!date) return null;
  const time = parseTimeFromText(text);
  return time ? `${date}T${time}:00` : `${date}T12:00:00`;
}

/* --------------------------- Summary parsing --------------------------- */

type SummaryField =
  | "subtotal"
  | "deliveryFee"
  | "handlingFee"
  | "packagingFee"
  | "tax"
  | "discount"
  | "total"
  | "unclassified";

interface SummaryLine {
  field: SummaryField | "unclassified";
  label: string;
  value: number;
  index: number;
  raw: string;
}

/**
 * Anchored label -> field patterns. Only the text between the start of the
 * line and the first money token is inspected, so item lines that merely
 * contain a fee word ("Delivery Milkshake 2 ₹120 ₹240") never classify.
 */
const SUMMARY_PATTERNS: Array<{ field: SummaryField; re: RegExp }> = [
  {
    field: "subtotal",
    re: /^(?:sub[\s-]?total|items?\s+total|item\s*total|basket\s+total|total\s*\([^)]*items[^)]*\))/i,
  },
  { field: "deliveryFee", re: /^(?:delivery|shipping)\s*(?:fee|fees|charges?|amount|cost)?/i },
  { field: "handlingFee", re: /^handling\s*(?:fee|fees|charges?|amount|cost)?/i },
  { field: "packagingFee", re: /^(?:packag|packin)g(?:ing|e)?\s*(?:fee|fees|charges?|amount|cost)?|^bag\s*(?:fee|fees|charges?)?/i },
  { field: "tax", re: /^(?:gst|tax|vat|igst|sgst|cgst|taxes|goods\s+and\s+services\s+tax)\s*(?:\([^)]*\))?/i },
  { field: "discount", re: /^(?:product\s+discount|price\s+discount|discount|savings|coupon|offer|you\s+saved|item\s+discount|discount\s+applied)/i },
  { field: "total", re: /^(?:to\s+pay|grand\s+total|bill\s+total|net\s+total|order\s+total|amount\s+(?:due|paid)|payable|due|grand\s+total|total\s+amount|total)/i },
];

/**
 * Labels that describe SOME fee but do not tell us which bucket — kept
 * as unclassified money so the total still reconciles.
 */
const UNCLASSIFIED_PATTERNS: RegExp[] = [
  /^(?:platform|convenience|service|membership|surge|processing|handling\s+&\s+delivery|delivery\s+&\s+handling|shipping\s+&\s+handling)\s*(?:fee|fees|charge|charges|amount|cost)?/i,
  /^(?:other|miscellaneous|misc\.?|others)\s*(?:fee|fees|charge|charges|amount|cost)?/i,
];

/** After a tax label, an optional percentage word is allowed. */
const TAX_PERCENT_REST = /^\d+(?:\.\d+)?\s*%?\s*$/;

/**
 * Match a summary label against the prefix before the first amount.
 * Requires the label to consume the entire prefix (with the tax %
 * exception) so half-matching item lines never classify.
 */
function matchSummaryPrefix(prefix: string): { field: SummaryField } | null {
  for (const pattern of UNCLASSIFIED_PATTERNS) {
    const m = prefix.match(pattern);
    if (m && prefix.slice(m[0].length).trim().length === 0) {
      return { field: "unclassified" };
    }
  }
  for (const pattern of SUMMARY_PATTERNS) {
    const m = prefix.match(pattern.re);
    if (!m) continue;
    const rest = prefix.slice(m[0].length).trim();
    if (rest.length === 0) return { field: pattern.field };
    if (pattern.field === "tax" && TAX_PERCENT_REST.test(rest)) {
      return { field: pattern.field };
    }
    // A lone sign or punctuation between the label and the amount is OCR
    // residue ("Handling charge +₹11", "Total: ₹45") — not part of the label.
    if (/^[+\-.,:;()=%*~'¥%]*$/.test(rest)) return { field: pattern.field };
  }
  return null;
}

/**
 * OCR frequently mangles the ₹ glyph into ¥, %, ~, ' or fuses it into a
 * stray digit ("Handling charge +311", "Product discount -Z4",
 * "Bill total %374" for "… +₹11 / -₹4 / ₹374"). When the amount is
 * anchored to a recognized label, allow one short glyph remnant between
 * the label and the amount (" +", " -Z", " %", " ¥") before giving up.
 */
function matchSummaryPrefixLenient(prefix: string): { field: SummaryField } | null {
  const strict = matchSummaryPrefix(prefix);
  if (strict) return strict;
  const trimmed = prefix
    .trim()
    .replace(/[.+\-:,%'*~¥=()]+[a-z]?$/i, "")
    .trimEnd();
  if (trimmed.length >= 2 && trimmed !== prefix.trim()) {
    return matchSummaryPrefix(trimmed);
  }
  return null;
}

const BARE_LABEL_RE =
  /^(?:sub[\s-]?total|items?\s+total|item\s*total|delivery\s*(?:fee|fees|charges?|amount)?|shipping\s*(?:fee|fees|charges?|amount)?|handling\s*(?:fee|fees|charges?|amount)?|packag(?:ing|e)\s*(?:fee|fees|charges?|amount)?|bag\s*(?:fee|fees|charges?)?|gst|gst\s*\([^)]*\)|tax|taxes|vat|igst|sgst|cgst|discount|savings|coupon|offer|you\s+saved|item\s+discount|to\s+pay|grand\s+total|bill\s+total|net\s+total|order\s+total|amount\s+(?:due|paid)|payable|total|grand|platform\s*(?:fee|fees|charges?|amount)?|convenience\s*(?:fee|fees|charges?|amount)?|service\s*(?:fee|fees|charges?|amount)?|membership\s*(?:fee|fees|charges?|amount)?|processing\s*(?:fee|fees|charges?|amount)?|other\s*(?:fee|fees|charges?|amount)?|misc(?:ellaneous)?\.?\s*(?:fee|fees|charges?|amount)?)[\s:]*$/i;

/**
 * Recognize a label on its own line with the amount on the following line
 * (right-aligned invoices): "Subtotal" then "₹165".
 */
function bareLabelFor(line: string): { label: string } | null {
  const m = line.match(BARE_LABEL_RE);
  if (!m) return null;
  const label = m[0].replace(/[\s:]+$/g, "").trim();
  return label.length >= 2 ? { label } : null;
}

function classifySummaryLine(
  line: string,
  index: number,
  labelAbove: { label: string } | null,
): SummaryLine | null {
  const hasDigit = /\d/.test(line);

  // "Delivery charges FREE" — a label followed by FREE means ₹0.
  if (!hasDigit && /\bfree\b/i.test(line)) {
    const labelText = line.replace(/\bfree\b/gi, "").replace(/[\s:+]+$/, "").trim();
    if (labelText.length >= 2) {
      const hit = matchSummaryPrefixLenient(labelText);
      if (hit) return { field: hit.field, label: labelText, value: 0, index, raw: line };
    }
    if (labelAbove) {
      const hit = matchSummaryPrefix(labelAbove.label);
      if (hit) return { field: hit.field, label: labelAbove.label, value: 0, index, raw: line };
    }
    return null;
  }
  if (!hasDigit) return null;

  const amounts = findMoneyTokens(line);

  if (amounts.length > 0) {
    const prefix = line.slice(0, amounts[0]!.index);
    if (prefix.length > 80) return null;

    // Amount-only line preceded by a bare label on its own line.
    if (prefix.trim().length === 0 && labelAbove) {
      const hit = matchSummaryPrefix(labelAbove.label);
      if (hit) {
        const value =
          hit.field === "tax"
            ? amounts.reduce((a, t) => a + Math.abs(t.value), 0)
            : Math.abs(amounts[amounts.length - 1]!.value);
        return { field: hit.field, label: labelAbove.label, value, index, raw: line };
      }
      return null;
    }

    if (prefix.trim().length === 0) return null;
    const hit = matchSummaryPrefix(prefix);
    if (!hit) return null;
    // Summary lines carry a single money amount; multiple amounts are items
    // (qty × unit / rate + amount), except combined tax lines (CGST + SGST).
    if (amounts.length > 1 && hit.field !== "tax") return null;
    const value =
      hit.field === "tax"
        ? amounts.reduce((a, t) => a + Math.abs(t.value), 0)
        : Math.abs(amounts[amounts.length - 1]!.value);
    return { field: hit.field, label: prefix.trim(), value, index, raw: line };
  }

  return null;
}

function foldSummary(lines: SummaryLine[]): {
  fields: Partial<Record<SummaryField, number>>;
  unclassified: UnclassifiedFee[];
} {
  const fields: Partial<Record<SummaryField, number>> = {};
  const candidates = new Set<SummaryField>([
    "subtotal", "deliveryFee", "handlingFee", "packagingFee", "total",
  ]);

  // LAST occurrence wins for the scalar buckets.
  const sorted = [...lines].sort((a, b) => a.index - b.index);
  let sawTax = false;
  let sawDiscount = false;
  let taxSum = 0;
  let discountSum = 0;
  for (const l of sorted) {
    if (l.field === "tax") {
      sawTax = true;
      taxSum += Math.abs(l.value);
      continue;
    }
    if (l.field === "discount") {
      if (!/you\s+saved/i.test(l.label)) discountSum += Math.abs(l.value);
      sawDiscount = true;
      continue;
    }
    if (candidates.has(l.field)) {
      fields[l.field as SummaryField] = Math.abs(l.value);
    }
  }
  if (sawTax) fields.tax = taxSum;
  if (discountSum > 0 || sawDiscount) fields.discount = discountSum;

  const unclassified = lines
    .filter((l) => l.field === "unclassified")
    .map((l) => ({ label: l.label, value: Math.abs(l.value) }));
  return { fields, unclassified };
}

/* --------------------------- Item parsing --------------------------- */

interface ParsedItemLine {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

const M = "(-?\\s*(?:₹\\s*|rs\\.?\\s*|inr\\s*)?[0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
const Q = "(\\d+(?:\\.\\d+)?)";

/** Price token tolerant of OCR-mangled ₹ glyphs (¥ % ' ~). */
const PRICE =
  "(-?\\s*(?:₹\\s*|rs\\.?\\s*|inr\\s*|[¥%'~]\\s*)?[0-9][0-9,]*(?:\\.[0-9]{1,2})?)";

/** Net-weight / pack-size units that must never be read as a quantity. */
const SIZE_UNIT =
  "g|gm|gr(?:am)?s?|grams?|kg|kgs?|ml|l|millilit(?:er|re)s?|lit(?:er|re)s?|oz|pcs?|pieces?|ct|" +
  "packs?|packets?|box|bottles?|tin|cans?|jar|bags?|strip|sachets?|cartons?|bar|trays?|rolls?|tubes?";

/** Strip a leading barcode/SKU/product code: "8901234567890 Amul Milk 2 ₹120". */
function stripSku(line: string): string {
  return line.replace(/^\d{6,}\s+/, "");
}

/** Exact integer division => derived quantity; else null (unknown). */
function deriveQuantity(lineTotal: number, unitPrice: number): number | null {
  if (unitPrice <= 0 || lineTotal <= 0) return null;
  const q = lineTotal / unitPrice;
  if (Math.abs(q - Math.round(q)) < 0.001 && q >= 1 && q <= 1000) {
    return Math.round(q);
  }
  return null;
}

const hasLetter = (s: string): boolean => /[a-zA-Z]/.test(s);

/** Quantities are small counts or fractional packs; never weights. */
function plausibleQty(q: number): boolean {
  return Number.isFinite(q) && q > 0 && q <= 300;
}

/**
 * Finds an explicitly declared item count ("5 items in this order" or a bare
 * "11 items" line). Returns null when nothing credible is declared. Matching
 * is per line so numbers followed by "Item" on the *next* line never count.
 */
function detectDeclaredCount(text: string): number | null {
  const clamped = (n: number) => (Number.isFinite(n) && n >= 1 && n <= 300 ? n : null);
  for (const line of linesOf(text)) {
    const s = line.trim();
    const explicit = s.match(/^(\d+)\s+(?:items?|products?)\s+in\s+(?:this|your)\s+(?:order|bill)\b/i);
    if (explicit) return clamped(Number(explicit[1]));
  }
  for (const line of linesOf(text)) {
    const s = line.trim();
    const bare = s.match(/^(\d+)\s+items?\s*$/i);
    if (!bare) continue;
    const n = Number(bare[1]);
    if (n <= 6) return n;
  }
  return null;
}

/** Matches an optional whole-per-unit total against qty × unit. */
function qtyConsistent(qty: number, unit: number, line: number): boolean {
  return Math.abs(qty * unit - line) <= 30 || qty <= 2 || line === unit;
}

function match(re: RegExp, text: string): RegExpMatchArray | null {
  const m = text.match(re);
  return m;
}

/**
 * Parse a single numeric line into an item. `inferredName` is the name
 * accumulated from lines above (wrapped names). Returns null when the line
 * is not an item line. Returns an empty-name item for price-only lines.
 */
function parseItemLine(line: string, inferredName: string): ParsedItemLine | null {
  const text = stripSku(line);
  if (/^(mrp|max\s+retail|incl\.?|inclusive|w\.?e\.?f|rate)\b/i.test(text)) return null;

  const digitStart = /^\s*\d/.test(text);
  let m: RegExpMatchArray | null;

  if (!digitStart) {
    /* ---- name-first layouts ---- */

    // "Name 2 x ₹30 ₹60" | "Amul Milk 500ml 2 x ₹30 ₹60"
    m = match(new RegExp(`^(.+?)\\s+${Q}\\s*[x×X]\\s*${M}(?:\\s+${M})?$`), text);
    if (m && hasLetter(m[1]) && plausibleQty(Number(m[2]))) {
      return {
        name: m[1].trim(),
        quantity: Number(m[2]),
        unitPrice: toPaise(m[3]),
        lineTotal: m[4] ? toPaise(m[4]) : null,
      };
    }

    // "Name 400g x1 ₹95" — size + qty mark + price on one concatenated line.
    m = match(new RegExp(`^(.+?)\\s+${Q}\\s*(${SIZE_UNIT})\\.?\\s*[x×X]\\s*${Q}(?:\\s+${PRICE})?$`, "i"), text);
    if (m && hasLetter(m[1]) && plausibleProductName(m[1])) {
      const qty = Number(m[4]);
      if (plausibleQty(qty)) {
        return {
          name: m[1].trim(),
          quantity: qty,
          unitPrice: m[5] ? toPaise(m[5]) : null,
          lineTotal: m[5] ? toPaise(m[5]) : null,
        };
      }
    }
    // When the captured name is an OCR stray char (e.g. "a 500g x1 135"),
    // fall back to the name accumulated from lines above.
    if (m && inferredName && plausibleProductName(inferredName)) {
      const qty = Number(m[4]);
      if (plausibleQty(qty)) {
        return {
          name: inferredName,
          quantity: qty,
          unitPrice: m[5] ? toPaise(m[5]) : null,
          lineTotal: m[5] ? toPaise(m[5]) : null,
        };
      }
    }

    // "Name ₹30 x 2 ₹60"
    m = match(new RegExp(`^(.+?)\\s+${M}\\s*[x×X]\\s*${Q}(?:\\s+${M})?$`), text);
    if (m && hasLetter(m[1]) && plausibleQty(Number(m[3]))) {
      return {
        name: m[1].trim(),
        quantity: Number(m[3]),
        unitPrice: toPaise(m[2]),
        lineTotal: m[4] ? toPaise(m[4]) : null,
      };
    }

    // "Name 2 ₹30 ₹60" (qty + unit + amount, no × mark)
    m = match(new RegExp(`^(.+?)\\s+(\\d{1,3}(?:\\.\\d+)?)\\s+${M}\\s+${M}$`), text);
    if (m && hasLetter(m[1])) {
      const qty = Number(m[2]);
      if (qty === Math.floor(qty) && qty >= 1 && qty <= 300) {
        const unit = toPaise(m[3]);
        const line = toPaise(m[4]);
        if (qtyConsistent(qty, unit, line)) {
          return { name: m[1].trim(), quantity: qty, unitPrice: unit, lineTotal: line };
        }
      }
    }

    // "Name ₹130 ₹120 ₹240" — crossed/original price present; drop first.
    m = match(new RegExp(`^(.+?)\\s+${M}\\s+${M}\\s+${M}$`), text);
    if (m && hasLetter(m[1])) {
      const unit = toPaise(m[3]);
      const line = toPaise(m[4]);
      return { name: m[1].trim(), quantity: deriveQuantity(line, unit) ?? 1, unitPrice: unit, lineTotal: line };
    }

    // "Name ₹60 ₹120"
    m = match(new RegExp(`^(.+?)\\s+${M}\\s+${M}$`), text);
    if (m && hasLetter(m[1])) {
      const unit = toPaise(m[2]);
      const line = toPaise(m[3]);
      return { name: m[1].trim(), quantity: deriveQuantity(line, unit) ?? 1, unitPrice: unit, lineTotal: line };
    }

    // "Name" + price on same line, single price: "Bread ₹45"
    m = match(new RegExp(`^(.+?)\\s+${M}$`), text);
    if (m && hasLetter(m[1]) && plausibleProductName(m[1]) && m[1].trim().length <= 60) {
      // Guard: "a 500g x1" is a size-qty fragment, not a product name.
      if (/\d+\s*(?:g|gm|kg|ml|l|oz|pcs?)\s*\d*\s*[x×X]\s*\d+/i.test(m[1])) return null;
      return { name: m[1].trim(), quantity: null, unitPrice: null, lineTotal: toPaise(m[2]) };
    }

    // Lone price lines with the name stacked above: "₹60 ₹120" | "₹60"
    m = match(new RegExp(`^${M}\\s+${M}$`), text);
    if (m) {
      const unit = toPaise(m[1]);
      const line = toPaise(m[2]);
      return { name: inferredName, quantity: deriveQuantity(line, unit) ?? 1, unitPrice: unit, lineTotal: line };
    }
    m = match(new RegExp(`^${M}$`), text);
    if (m) {
      return { name: inferredName, quantity: null, unitPrice: null, lineTotal: toPaise(m[1]) };
    }
    return null;
  }

  /* ---- digit-first layouts ---- */

  // "400g x1 ¥95" | "79g x1 ₹28" | "500g x 1 ₹135" — net weight, qty mark,
  // price. The weight is pack size, never the quantity.
  m = match(new RegExp(`^${Q}\\s*(${SIZE_UNIT})\\.?\\s*[x×X]\\s*${Q}(?:\\s+${PRICE})?$`, "i"), text);
  if (m) {
    const qty = Number(m[3]);
    if (plausibleQty(qty)) {
      return {
        name: inferredName,
        quantity: qty,
        unitPrice: m[4] ? toPaise(m[4]) : null,
        lineTotal: m[4] ? toPaise(m[4]) : null,
      };
    }
  }

  // "2 x 400g ₹95" — qty mark × weight + price.
  m = match(new RegExp(`^${Q}\\s*[x×X]\\s*${Q}\\s*(${SIZE_UNIT})\\s*,?\\s*(?:${PRICE})?$`, "i"), text);
  if (m) {
    const qty = Number(m[1]);
    if (plausibleQty(qty)) {
      return {
        name: inferredName,
        quantity: qty,
        unitPrice: m[4] ? toPaise(m[4]) : null,
        lineTotal: m[4] ? toPaise(m[4]) : null,
      };
    }
  }

  // "2 x ₹30 ₹60" (name above)
  m = match(new RegExp(`^${Q}\\s*[x×X]\\s*${M}(?:\\s+${M})?$`), text);
  if (m && plausibleQty(Number(m[1]))) {
    return {
      name: inferredName,
      quantity: Number(m[1]),
      unitPrice: toPaise(m[2]),
      lineTotal: m[3] ? toPaise(m[3]) : null,
    };
  }

  // "2 x ₹30 Milk ₹60"
  m = match(new RegExp(`^${Q}\\s*[x×X]\\s*${M}\\s+(.+?)(?:\\s+${M})?$`), text);
  if (m && hasLetter(m[3]) && plausibleQty(Number(m[1]))) {
    return {
      name: m[3].trim(),
      quantity: Number(m[1]),
      unitPrice: toPaise(m[2]),
      lineTotal: m[4] ? toPaise(m[4]) : null,
    };
  }

  // "2 ₹120 ₹240" — qty + amount + line (name above)
  if (inferredName) {
    m = match(new RegExp(`^${Q}\\s+${M}\\s+${M}$`), text);
    if (m) {
      const qty = Number(m[1]);
      const unit = toPaise(m[2]);
      const line = toPaise(m[3]);
      if (plausibleQty(qty) && qtyConsistent(qty, unit, line)) {
        return { name: inferredName, quantity: qty, unitPrice: unit, lineTotal: line };
      }
    }
  }

  // Tabular, no ₹: "2 Milk 30 60" | "2 Milk 30.00 60.00"
  m = match(new RegExp(`^${Q}\\s+(.+?)\\s+${M}\\s+${M}$`), text);
  if (m && hasLetter(m[2]) && m[2].trim().length <= 40) {
    const qty = Number(m[1]);
    const unit = toPaise(m[3]);
    const line = toPaise(m[4]);
    if (plausibleQty(qty) && qtyConsistent(qty, unit, line)) {
      return { name: m[2].trim(), quantity: qty, unitPrice: unit, lineTotal: line };
    }
  }

  // Tabular two columns: "1 Bread 45" | "1 Bread 45.00"
  m = match(new RegExp(`^${Q}\\s+(.+?)\\s+${M}$`), text);
  if (m && hasLetter(m[2]) && m[2].trim().length <= 40 && m[2].trim().length >= 2) {
    const qty = Number(m[1]);
    if (plausibleQty(qty)) {
      return { name: m[2].trim(), quantity: qty, unitPrice: null, lineTotal: toPaise(m[3]) };
    }
  }

  // "2 x ₹30" (qty × unit, no line total; name above)
  m = match(new RegExp(`^${Q}\\s*[x×X]\\s*${M}$`), text);
  if (m && plausibleQty(Number(m[1]))) {
    const qty = Number(m[1]);
    const unit = toPaise(m[2]);
    return { name: inferredName, quantity: qty, unitPrice: unit, lineTotal: unit * qty };
  }

  // Lone price with name above (digit or decimal start): "60 120" | "120.00"
  m = match(new RegExp(`^${M}\\s+${M}$`), text);
  if (m && inferredName) {
    const unit = toPaise(m[1]);
    const line = toPaise(m[2]);
    return { name: inferredName, quantity: deriveQuantity(line, unit) ?? 1, unitPrice: unit, lineTotal: line };
  }
  m = match(new RegExp(`^${M}$`), text);
  if (m && inferredName) {
    return { name: inferredName, quantity: null, unitPrice: null, lineTotal: toPaise(m[1]) };
  }
  return null;
}

/** Lines that are structure/noise rather than items. */
const NOISE_RE =
  /^(invoice|order\s+id|order\s+no|invoice\s+no|invoice\s+number|order\s+number|receipt\s+no|receipt\s+number|transaction\s+(id|no)|order\s+(placed|date|details)|placed\s+on|bill\s+no|bill\s+number|payment|paid\s+via|\bupi\b|\bcod\b|\bcash\b|delivery\s+in|estimated\s+(delivery|time|arrival)|thank|thanks|terms+|gstin|phone|address|mob\.?|mobile|your\s+order|qty|quantity\b|s\.?no|sl\.?\s*no|title|tally\.?|\bgst\b|\btax\b|invoice\s+value|\d+\s*(?:items?|products?|orders?)\b|in\s+this\s+order|\bmrp\b|delivery\s+charges?|\bscan\b|checkout|notifications?|blinkit\.com|orders?[\s/:]\d{6,}|ask\s+gemini|search)\b/i;

const BRAND_RE =
  /^(blinkit|zepto|instamart|swiggy|big\s*basket|bigbasket|amazon( fresh)?|dmart|reliance|jio\s*smart|flipkart|groceries|billing\s+software)/i;

const ITEM_SECTION_RE = /^(your\s+)?(bought\s+items|order\s+items|listed\s+items|purchased\s+items)\b/i;

function looksLikeHeader(line: string): boolean {
  return /(item\s+list|order\s+summary|bill\s+details|price\s+details|invoice\s+details|delivery\s+address|billing\s+address|shipped\s+to|sold\s+by|seller\s*:|fulfilled\s+by|net\s+quantity|items?):?$/i.test(line);
}

/**
 * UI/navigation chrome that an OCR pass can glue onto a bill: page chrome,
 * account menus and the app sidebar. Matches anywhere in the text (not just
 * a line start) because OCR fuses columns, e.g. "& Account privacy 200g x1".
 */
function isNoiseText(line: string): boolean {
  return (
    NOISE_RE.test(line) ||
    /(^|\s)(?:account\s+privacy|login|logout|sign\s*out|google\s+account|prescriptions?|e-?gift\s+cards?|gift\s+cards?|my\s+(?:orders?|accounts?|addresses?|payments?|favorites?|wishlist|profile)|your\s+(?:orders?|account|cart|profile)|favorites?|wishlists?|search|help\s+center|terms\b|privacy\b|address(?:es)?\b|payments?\b|notification(?:s)?\b|cart\b|orders?\b)(\s|$)/i.test(line)
  );
}

/**
 * A captured "name" must actually look like a product. Guards the loose
 * single-price form ("Name ₹45") against OCR trivia being parsed as items,
 * e.g. "Home - Block 4, 20/2, NR Col.. ₹1308".
 */
function plausibleProductName(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (isNoiseText(t)) return false;
  if (BRAND_RE.test(t) && t.split(/\s+/).length <= 3) return false;
  if (looksLikeHeader(t)) return false;
  if (/\b\d{1,3}\s*\/\s*\d{1,3}\b/.test(t)) return false;
  if (/\b(?:block|house|flat|apt|nr|road|street|col(?:ony|\.))\b/i.test(t)) return false;
  return true;
}

function isNameFragment(line: string): boolean {
  if (line.length < 2 || line.length > 70) return false;
  if (/^[0-9.,₹/-]+$/.test(line)) return false;
  if (isNoiseText(line)) return false;
  if (BRAND_RE.test(line) && line.split(/\s+/).length <= 3) return false;
  if (looksLikeHeader(line)) return false;
  if (/^[/\-.·•*~]\s*/.test(line)) return false;
  return true;
}

/**
 * A merchant-suffix line ("Some Shop", "Fresh Store", "City Mart") is only a
 * merchant header when another product-name fragment follows it. If it sits
 * directly above its own price line ("Coffee Shop 1 x ₹99") it is the item
 * name under name-above-quantity layout alias-grec0ac1.
 */
const SHOP_SUFFIX_RE = /\b(?:shop|store|mart|supermarket|hypermarket|kirana|bazaar|grocery)\b\s*$/i;
function isShopSuffix(line: string): boolean {
  return (
    line.split(/\s+/).length <= 3 &&
    SHOP_SUFFIX_RE.test(line)
  );
}

/**
 * Anything above this count can't be a real bill line: it means UI chrome,
 * sidebar nav or whole pages are being misread as items, so the parse is
 * unreliable and must be flagged rather than presented as a 799-item order.
 */
const MAX_BILL_ITEMS = 100;

/**
 * Parse item lines from the whole text, skipping classified summary lines
 * and structure noise. Wrapped names accumulate until a numeric line.
 */
function parseItems(
  lines: string[],
  summaryIndices: Set<number>,
): { items: ParsedItem[]; unreliable: boolean } {
  const items: ParsedItem[] = [];
  let pendingName: string[] = [];
  const flush = () => (pendingName = []);

  const push = (item: ParsedItem): boolean => {
    if (items.length >= MAX_BILL_ITEMS) return false;
    items.push(item);
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (summaryIndices.has(i)) {
      flush();
      continue;
    }
    if (ITEM_SECTION_RE.test(line)) {
      flush();
      continue;
    }
    if (NOISE_RE.test(line) || BRAND_RE.test(line) || looksLikeHeader(line)) {
      if (line.length < 40) flush();
      continue;
    }
    if (!hasNumericContent(line)) {
      const t = line.trim();
      if (isNameFragment(t)) {
        // A short shop-suffix line directly followed by another product
        // fragment was a merchant header ("Some Shop" above "Milk"),
        // never part of the item name.
        if (isShopSuffix(pendingName[pendingName.length - 1] ?? "")) {
          pendingName.pop();
        }
        // Wrapped names span at most a couple of OCR lines; cap the buffer
        // so unmatched preamble cannot accumulate into a phantom name.
        if (pendingName.length >= 3) pendingName.shift();
        pendingName.push(t);
      } else {
        flush();
      }
      continue;
    }
    // A trailing 1-2 letter fragment in the name buffer is usually OCR
    // chrome ("Be") fused into the item section, not part of the product.
    const lastFragment = pendingName[pendingName.length - 1] ?? "";
    if (pendingName.length > 1 && /^[a-zA-Z]{1,2}$/.test(lastFragment)) {
      pendingName.pop();
    }
    const inferred = pendingName.join(" ").trim();
    const parsed = parseItemLine(line, inferred);
    if (parsed) {
      const name = parsed.name.trim();
      if (name.length >= 2 && !/^\d+(\.\d+)?$/.test(name)) {
        let unitPrice = parsed.unitPrice;
        let lineTotal = parsed.lineTotal;
        let qty = parsed.quantity;
        if (qty === null) {
          qty = unitPrice !== null && lineTotal !== null
            ? (deriveQuantity(lineTotal, unitPrice) ?? 1)
            : 1;
        }
        if (lineTotal === null && unitPrice !== null && Number.isFinite(qty)) {
          lineTotal = roundPaise(unitPrice * qty);
        }
        if (unitPrice === null && lineTotal !== null && Number.isFinite(qty) && qty > 0) {
          const derived = lineTotal / qty;
          if (Math.abs(derived - Math.round(derived)) < 0.001) {
            unitPrice = Math.round(derived);
          }
        }
        if (!push({
          name,
          quantity: qty,
          unitPrice,
          lineTotal,
        })) {
          return { items: [], unreliable: true };
        }
      }
      flush();
    } else if (line.length < 20) {
      flush();
    }
  }
  return { items, unreliable: false };
}

/* --------------------------- Public API --------------------------- */

export function parseBillText(text: string): ParsedOrder {
  const lines = linesOf(text);

  // Detect bare labels ("Subtotal") that own the following amount line.
  const labelsAbove = new Map<number, { label: string }>();
  for (let i = 1; i < lines.length; i++) {
    const label = bareLabelFor(lines[i - 1]!);
    if (label && !hasNumericContent(lines[i - 1]!)) {
      labelsAbove.set(i, label);
    }
  }

  const summaryLines: SummaryLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cls = classifySummaryLine(lines[i], i, labelsAbove.get(i) ?? null);
    if (cls) summaryLines.push(cls);
  }
  const summaryIndices = new Set(summaryLines.map((l) => l.index));
  const { fields, unclassified } = foldSummary(summaryLines);

  const platform: Platform | null = detectPlatform(text);
  const { items, unreliable } = parseItems(lines, summaryIndices);

  // Sanity: a bill may declare "5 items in this order". If we extracted far
  // fewer or far more than that, present the honest "couldn't reliably
  // identify the items" path instead of a wrong order. Prefer the explicit
  // "N items in this order" phrasing over bare cart counts like "11 items".
  // Everything is matched per line so a stray "72\nItem" cannot be read as
  // a declared count of 72.
  let flaggedUnreliable = unreliable;
  const declared = detectDeclaredCount(text);
  if (!flaggedUnreliable && declared !== null && items.length > 0) {
    if (items.length * 2 < declared || items.length > declared * 2 + 1) {
      flaggedUnreliable = true;
    }
  }

  return {
    platform,
    orderedAt: buildOrderedAt(text),
    items,
    itemsUnreliable: flaggedUnreliable,
    subtotal: fields.subtotal === undefined ? null : Math.abs(fields.subtotal),
    deliveryFee: fields.deliveryFee === undefined ? null : Math.abs(fields.deliveryFee),
    handlingFee: fields.handlingFee === undefined ? null : Math.abs(fields.handlingFee),
    packagingFee: fields.packagingFee === undefined ? null : Math.abs(fields.packagingFee),
    tax: fields.tax === undefined ? null : Math.abs(fields.tax),
    discount: fields.discount === undefined ? null : Math.abs(fields.discount),
    unclassifiedFees: unclassified,
    total: fields.total === undefined || Math.abs(fields.total) < 1 ? null : Math.abs(fields.total),
  };
}
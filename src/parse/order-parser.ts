import type { ParsedOrder, ParsedItem } from "./types";
import { detectPlatform } from "./validate-import";
import type { Platform } from "../domain/types";

/**
 * Pure text -> structured candidate order parser.
 *
 * No I/O. Consumes normalized OCR / PDF text and produces a ParsedOrder
 * where every missing field is explicitly `null` (never inferred to make
 * arithmetic work). Bill formats differ per platform; the parser handles
 * the most common quick-commerce patterns and is voluntarily
 * conservative: it prefers a null field over a wrong guess.
 */

function toPaise(num: string): number {
  const n = parseFloat(num);
  return Math.round(n * 100);
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    // Normalize explicit quantity marks ("2x₹30", "2 x ₹30") but never
    // touch plain spaces before rupees: that would corrupt item totals.
    .replace(/(\d)\s*[×⨯xX]\s*(?=₹)/g, "$1 x ")
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

/* --------------------------- Date parsing --------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDateFromText(text: string): string | null {
  // 12/08/2026, 12-08-2026, 2026-08-12
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return dateToISO(y, m, null, d);
    }
  }
  // 12 Aug 2026 / Aug 12, 2026
  const dm = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})\b/i);
  if (dm) {
    return dateToISO(Number(dm[3]), MONTHS[dm[2].toLowerCase()]!, null, Number(dm[1]));
  }
  const md = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/i);
  if (md) {
    return dateToISO(Number(md[3]), MONTHS[md[1].toLowerCase()]!, null, Number(md[2]));
  }
  // "today" reference: use now
  return null;
}

function parseTimeFromText(text: string): string | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i) ??
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

interface LabelDef {
  /** lower-cased label synonyms. */
  labels: string[];
  field: keyof Pick<ParsedOrder, "subtotal" | "deliveryFee" | "handlingFee" | "packagingFee" | "tax" | "discount" | "total">;
}

const LABELS: LabelDef[] = [
  { labels: ["subtotal", "item total", "item(s) total", "items total", "sub-total", "total (items)"], field: "subtotal" },
  { labels: ["delivery fee", "delivery charge", "delivery charges", "delivery", "shipping", "shipping & handling", "shipping fee", "postage"], field: "deliveryFee" },
  { labels: ["platform fee", "platform fees", "handling fee", "handling", "service fee", "service fees", "membership fee", "convenience fee", "surge"], field: "handlingFee" },
  { labels: ["packaging fee", "packaging fees", "packaging", "packing", "bag fee", "bag charges", "bags", "eco-packaging"], field: "packagingFee" },
  { labels: ["tax", "gst", "vat", "taxes", "gst (5%)", "gst (12%)", "gst (18%)", "igst", "sgst", "cgst", "goods and services tax"], field: "tax" },
  { labels: ["discount", "savings", "coupon", "coupon discount", "offer", "you saved", "discount applied", "item discount"], field: "discount" },
];

const TOTAL_LABELS = [
  "total", "to pay", "amount due", "amount paid", "bill total", "grand total",
  "payable", "total amount", "due", "paid", "net total", "order total",
];

interface ScannedValue {
  field: keyof ParsedOrder | "total";
  value: number;
  index: number;
  raw: string;
}

interface TextAmount {
  /** Value in paise. */
  value: number;
  /** Character index of the amount within the line. */
  index: number;
}

/**
 * Find the last money-looking token in a line: `₹105.00`, `105.00`, `105`,
 * with optional `rs`/`inr`/`rupees` suffix.
 */
function trailingAmount(line: string): TextAmount | null {
  const matches = [
    ...line.matchAll(/([₹][\s]?[0-9][0-9,]*(?:\.[0-9]{1,2})?|[0-9][0-9,]*(?:\.[0-9]{1,2})?)(\s*(?:rs|inr|rupees?))?/gi),
  ];
  if (matches.length === 0) return null;
  const m = matches[matches.length - 1];
  const token = (m[1] ?? "").replace(/[₹\s]/g, "");
  const n = parseFloat(token.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { value: Math.round(n * 100), index: m.index ?? 0 };
}

function hasLabelToken(cleaned: string, label: string): boolean {
  if (/[^a-z0-9%()]/.test(label)) {
    return cleaned.includes(label);
  }
  return cleaned.split(/[^a-z0-9%()]/).includes(label);
}

function scanSummary(lines: string[]): ScannedValue[] {
  const found: ScannedValue[] = [];
  lines.forEach((line, index) => {
    const cleaned = line.toLowerCase();
    const amount = trailingAmount(line);
    if (amount === null) return;
    const preceding = cleaned.slice(0, amount.index);
    if (preceding.length > 50) return;

    for (const def of LABELS) {
      const label = def.labels.find((l) =>
        precededByLabel(preceding, l, cleaned),
      );
      if (label) {
        found.push({ field: def.field, value: amount.value, index, raw: line });
        return;
      }
    }

    if (TOTAL_LABELS.some((t) => precededByLabel(preceding, t, cleaned))) {
      found.push({ field: "total", value: amount.value, index, raw: line });
    }
  });
  return found;
}

function precededByLabel(preceding: string, label: string, cleaned: string): boolean {
  if (!hasLabelToken(cleaned, label)) return false;
  const firstWord = label.split(/\s+/)[0]!;
  return hasLabelToken(preceding, firstWord);
}

function preferMax(values: ScannedValue[]): ScannedValue | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => (b.value >= a.value ? b : a));
}

function pickValue(
  found: ScannedValue[],
  field: ScannedValue["field"],
): number | null {
  const matches = found.filter((f) => f.field === field);
  return preferMax(matches)?.value ?? null;
}

/* --------------------------- Item parsing --------------------------- */

interface ParsedItemLine {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

const ITEM_LINE_FORMS: Array<(line: string) => ParsedItemLine | null> = [
  // "Name 2 x ₹82 ₹164" | "Name 2 × ₹82 ₹164"
  (line) => {
    const m = line.match(/^(.+?)\s+(\d+)\s*[x×]\s*₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))?$/);
    if (!m) return null;
    return {
      name: m[1].trim(),
      quantity: Number(m[2]),
      unitPrice: toPaise(m[3]),
      lineTotal: m[4] ? toPaise(m[4]) : null,
    };
  },
  // "Name ₹82 x 2 ₹164"
  (line) => {
    const m = line.match(/^(.+?)\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*[x×]\s*(\d+)(?:\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))?$/);
    if (!m) return null;
    return {
      name: m[1].trim(),
      quantity: Number(m[3]),
      unitPrice: toPaise(m[2]),
      lineTotal: m[4] ? toPaise(m[4]) : null,
    };
  },
  // "2 x ₹82 ₹164" (qty first, name on its own line above)
  (line) => {
    const m = line.match(/^(\d+)\s*[x×]\s*₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))?$/);
    if (!m) return null;
    return {
      name: "",
      quantity: Number(m[1]),
      unitPrice: toPaise(m[2]),
      lineTotal: m[3] ? toPaise(m[3]) : null,
    };
  },
  // "2 x ₹82 Milk ₹164" (qty first)
  (line) => {
    const m = line.match(/^(\d+)\s*[x×]\s*₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s+(.+?)(?:\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))?$/);
    if (!m) return null;
    return {
      name: m[3].trim(),
      quantity: Number(m[1]),
      unitPrice: toPaise(m[2]),
      lineTotal: m[4] ? toPaise(m[4]) : null,
    };
  },
  // "Name ₹60 ₹120" (unit + line, no qty)
  (line) => {
    const m = line.match(/^(.+?)\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
    if (!m) return null;
    return {
      name: m[1].trim(),
      quantity: 1,
      unitPrice: toPaise(m[2]),
      lineTotal: toPaise(m[3]),
    };
  },
  // "Qty Name Unit Amount" tabular (no ₹): "2 Milk 30.00 60.00"
  (line) => {
    if (/^\s*\d/.test(line) === false) return null;
    const m = line.match(/^(\d+)\s+(.+?)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
    if (!m) return null;
    const name = m[2].trim();
    if (name.length > 40) return null;
    return {
      name,
      quantity: Number(m[1]),
      unitPrice: toPaise(m[3]),
      lineTotal: toPaise(m[4]),
    };
  },
  // "Qty Name Amount" tabular (no ₹): "2 Milk 60.00"
  (line) => {
    if (/^\s*\d/.test(line) === false) return null;
    const m = line.match(/^(\d+)\s+(.+?)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
    if (!m) return null;
    const name = m[2].trim();
    if (name.length > 40) return null;
    return {
      name,
      quantity: Number(m[1]),
      unitPrice: null,
      lineTotal: toPaise(m[3]),
    };
  },
  // "Name ₹60" (single price -> line total, unit unknown)
  (line) => {
    if (/^\s*\d/.test(line)) return null;
    const m = line.match(/^(.+?)\s+₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
    if (!m) return null;
    const name = m[1];
    if (name.length > 40) return null;
    return {
      name,
      quantity: 1,
      unitPrice: null,
      lineTotal: toPaise(m[2]),
    };
  },
];

const SUMMARY_WORDS = new Set([
  "subtotal", "delivery", "tax", "gst", "discount", "total", "to pay",
  "handling", "platform", "packaging", "bill", "fees", "savings", "coupon",
  "vat", "amount", "pay", "due", "shipping", "grand", "paid", "balance",
  "change", "round", "items", "order", "incl", "free", "you saved",
]);

function looksLikeSummaryLabel(line: string): boolean {
  const lower = line.toLowerCase();
  for (const word of SUMMARY_WORDS) {
    if (lower.split(/[\s:.₹]+/).includes(word)) return true;
  }
  return false;
}

function parseItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let pendingName: string | null = null;
  const activeRegion = lines.slice(0, firstSummaryLine(lines));
  for (const line of activeRegion) {
    if (looksLikeSummaryLabel(line)) continue;
    if (/invoice|order id|order date|placed|receipt|blinkit|zepto|instamart|bigbasket|amazon|thank|delivered|paid via|payment|\bupi\b|\bcash\b/i.test(line)) {
      continue;
    }
    // A money-less content line before a qty-first price line is the name.
    if (!hasMoneyToken(line)) {
      const t = line.trim();
      if (t.length >= 2 && t.length <= 60 && !/^([0-9.,₹/-]+)$/.test(t)) {
        pendingName = t;
        continue;
      }
    }
    for (const form of ITEM_LINE_FORMS) {
      const parsed = form(line);
      if (parsed) {
        const name = parsed.name || pendingName;
        if (name && name.length >= 2 && !/^\d+$/.test(name)) {
          items.push({
            name,
            quantity: parsed.quantity ?? 1,
            unitPrice: parsed.unitPrice,
            lineTotal: parsed.lineTotal,
          });
        }
        pendingName = null;
        break;
      }
    }
  }
  return mergeConsecutive(items);
}

function hasMoneyToken(line: string): boolean {
  return /[₹]/.test(line) || /\d+\.\d{2}/.test(line);
}

function firstSummaryLine(lines: string[]): number {
  const idx = lines.findIndex((l) => {
    const lower = l.toLowerCase();
    return /(bill details|order summary|price details|bill summary|item total|subtotal|items total|to pay)/.test(lower);
  });
  return idx === -1 ? lines.length : idx;
}

function mergeConsecutive(items: ParsedItem[]): ParsedItem[] {
  // No-op rope to make intent explicit; real dedup handled in review.
  return items;
}

/* --------------------------- Public API --------------------------- */

export function parseBillText(text: string): ParsedOrder {
  const lines = linesOf(text);
  const found = scanSummary(lines);
  const platform: Platform | null = detectPlatform(text);

  const total = pickValue(found, "total");
  const subtotal = pickValue(found, "subtotal");
  const deliveryFee = pickValue(found, "deliveryFee");
  const handlingFee = pickValue(found, "handlingFee");
  const packagingFee = pickValue(found, "packagingFee");
  const tax = pickValue(found, "tax");
  const discount = pickValue(found, "discount");

  const items = parseItems(lines);

  return {
    platform,
    orderedAt: buildOrderedAt(text),
    items,
    subtotal: subtotal === null ? null : Math.abs(subtotal),
    deliveryFee,
    handlingFee,
    packagingFee,
    tax,
    discount: discount === null ? null : Math.abs(discount),
    total,
  };
}
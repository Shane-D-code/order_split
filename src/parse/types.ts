import type { Platform } from "../domain/types";
import type { Paise } from "../money/money";

/**
 * Result of text extraction from a document (OCR or embedded text).
 * Always resolves to plain normalized text; the parser is pure text -> data.
 */
export interface DocumentExtractResult {
  text: string;
  sourceKind: "text" | "ocr";
  /** Average OCR confidence 0..100, when available. */
  confidence?: number;
}

/**
 * The raw text produced by OCR / PDF text extraction. Normalized line
 * separated text; the parser consumes exactly this.
 */
export type ExtractedDocument = DocumentExtractResult;

/** A line item extracted from a bill, still unvalidated. */
export interface ParsedItem {
  name: string;
  quantity: number;
  /** Null when the value could not be identified. */
  unitPrice: Paise | null;
  /** Null when the value could not be identified. */
  lineTotal: Paise | null;
}

/**
 * A fee-like line whose category could not be inferred from the invoice
 * text (platform / convenience / service / membership …). The amount is
 * preserved so the final total can still reconcile; the UI asks the user
 * to classify it before confirming.
 */
export interface UnclassifiedFee {
  /** The label text as printed, e.g. "Platform fee". */
  label: string;
  /** Integer paise. */
  value: Paise;
}

/**
 * Structured candidate order produced by the parser. `null` fields mean
 * "not found on the bill" — they become warnings at validation time.
 * No field here is ever silently filled to make arithmetic work.
 */
export interface ParsedOrder {
  platform: Platform | null;
  orderedAt: string | null;
  items: ParsedItem[];
  /**
   * True when the item scan ran away (far more "items" than any real bill
   * could contain, e.g. 799) or otherwise failed in a way that makes the
   * item list untrustworthy. The UI should say so instead of showing them.
   */
  itemsUnreliable?: boolean;
  subtotal: Paise | null;
  deliveryFee: Paise | null;
  handlingFee: Paise | null;
  packagingFee: Paise | null;
  tax: Paise | null;
  discount: Paise | null;
  /**
   * Fees that could not be confidently classified into the categories
   * above. Preserved amounts, never merged into handlingFee silently.
   */
  unclassifiedFees: UnclassifiedFee[];
  total: Paise | null;
}

export type WarningSeverity = "info" | "warning" | "error";

export interface ValidationWarning {
  /** Stable id so the UI can dedup and track resolution. */
  id: string;
  severity: WarningSeverity;
  /** Machine-readable code, e.g. TOTAL_MISMATCH. */
  code: string;
  message: string;
  /** The field this warning is about, when applicable. */
  field?: string;
  /** Whether the user may explicitly override this warning. */
  allowOverride: boolean;
}
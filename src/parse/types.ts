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
 * Structured candidate order produced by the parser. `null` fields mean
 * "not found on the bill" — they become warnings at validation time.
 * No field here is ever silently filled to make arithmetic work.
 */
export interface ParsedOrder {
  platform: Platform | null;
  orderedAt: string | null;
  items: ParsedItem[];
  subtotal: Paise | null;
  deliveryFee: Paise | null;
  handlingFee: Paise | null;
  packagingFee: Paise | null;
  tax: Paise | null;
  discount: Paise | null;
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
import { extractDocument } from "./extractors";
import { parseBillText } from "./order-parser";
import { validateParsedOrder } from "./validate-import";
import type { ParsedOrder, ValidationWarning } from "./types";
import type { DocumentExtractResult } from "./types";

export interface ImportResult {
  text: string;
  sourceKind: "text" | "ocr";
  confidence?: number;
  parsed: ParsedOrder;
  warnings: ValidationWarning[];
}

/**
 * document -> text -> parsed order -> validation.
 * Pure orchestration; never persists anything.
 */
export async function importBill(file: File): Promise<ImportResult> {
  const extracted = await extractDocument(file);
  return finalizeImport(extracted);
}

export function finalizeImport(extracted: DocumentExtractResult): ImportResult {
  const parsed = parseBillText(extracted.text);
  const warnings = validateParsedOrder(parsed);
  return {
    text: extracted.text,
    sourceKind: extracted.sourceKind,
    confidence: extracted.confidence,
    parsed,
    warnings,
  };
}

/**
 * Build a continuation for manual entry: an empty parsed order where
 * everything is null so the review screen can be reached from a blank
 * slate too.
 */
export function emptyParsedOrder(): ParsedOrder {
  return {
    platform: null,
    orderedAt: null,
    items: [],
    subtotal: null,
    deliveryFee: null,
    handlingFee: null,
    packagingFee: null,
    tax: null,
    discount: null,
    unclassifiedFees: [],
    total: null,
  };
}
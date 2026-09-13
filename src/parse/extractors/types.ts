import type { DocumentExtractResult } from "../types";

/**
 * A document extractor turns a bill/screenshot file into normalized text.
 * Implementations are swappable: PDF text first, OCR for images/scans,
 * arbitrary future extractors.
 */
export interface DocumentExtractor {
  /** Whether this extractor can handle the given file. */
  canHandle(file: File): boolean;
  extract(file: File): Promise<DocumentExtractResult>;
}

export interface OcrEngine {
  recognize(image: Blob | HTMLImageElement | HTMLCanvasElement): Promise<{
    text: string;
    confidence: number;
  }>;
  terminate(): Promise<void>;
}

export const MIN_MEANINGFUL_TEXT_LENGTH = 12;

export function isMeaningfulText(text: string): boolean {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z]/.test(w));
  return words.length >= 2 && text.trim().length >= MIN_MEANINGFUL_TEXT_LENGTH;
}
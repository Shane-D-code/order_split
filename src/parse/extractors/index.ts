import type { DocumentExtractor, OcrEngine } from "./types";
import { PdfExtractor } from "./pdf-extractor";
import { ScreenshotExtractor, getTesseractEngine } from "./ocr-extractor";
import type { DocumentExtractResult } from "../types";

export type { DocumentExtractor, OcrEngine } from "./types";
export { isMeaningfulText } from "./types";
export { getTesseractEngine } from "./ocr-extractor";
export { PdfExtractor } from "./pdf-extractor";
export { ScreenshotExtractor } from "./ocr-extractor";

const formats = new Map<string, string>([
  ["image/png", "PNG"],
  ["image/jpeg", "JPEG"],
  ["image/webp", "WEBP"],
  ["image/gif", "GIF"],
  ["application/pdf", "PDF"],
]);

export function fileLabel(file: File): string {
  return formats.get(file.type) ?? "File";
}

class NoExtractorError extends Error {
  constructor(public readonly file: File) {
    super(`Unsupported file type: ${file.type}`);
    this.name = "NoExtractorError";
  }
}

export function isSupportedFile(file: File): boolean {
  return /^image\//.test(file.type) || file.type === "application/pdf" ||
    /\.(png|jpe?g|webp|pdf)$/i.test(file.name);
}

/**
 * Pick an extractor for a file and run it. Watches for browser-only
 * capabilities (canvas, tesseract WASM) without breaking type checks.
 */
export async function extractDocument(file: File): Promise<DocumentExtractResult> {
  let extractors: DocumentExtractor[];
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    extractors = [new PdfExtractor(() => getTesseractEngine())];
  } else if (isSupportedFile(file)) {
    extractors = [new ScreenshotExtractor()];
  } else {
    throw new Error("Unsupported file type. Please use a PNG, JPEG, WEBP, or PDF.");
  }

  for (const extractor of extractors) {
    if (extractor.canHandle(file)) {
      return extractor.extract(file);
    }
  }
  throw new NoExtractorError(file);
}

export function makeOcrEngine(): Promise<OcrEngine> {
  return getTesseractEngine();
}
import type { DocumentExtractor, OcrEngine } from "./types";
import type { DocumentExtractResult } from "../types";
import { preprocessImage } from "./preprocess";

let cachedEngine: OcrEngine | null = null;

/**
 * OCR engine backed by tesseract.js. Lazy: the heavy WASM bundle and
 * language data are only pulled in when a screenshot is actually imported.
 */
export async function getTesseractEngine(): Promise<OcrEngine> {
  if (cachedEngine) return cachedEngine;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: () => {},
  });
  const engine: OcrEngine = {
    async recognize(image) {
      const preprocessed = image instanceof Blob ? await preprocessImage(image) : image;
      const { data } = await worker.recognize(preprocessed);
      return { text: data.text ?? "", confidence: data.confidence ?? 0 };
    },
    async terminate() {
      cachedEngine = null;
      await worker.terminate();
    },
  };
  cachedEngine = engine;
  return engine;
}

export class ScreenshotExtractor implements DocumentExtractor {
  private readonly engines: () => Promise<OcrEngine>;

  constructor(engines: () => Promise<OcrEngine> = getTesseractEngine) {
    this.engines = engines;
  }

  canHandle(file: File): boolean {
    return /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  }

  async extract(file: File): Promise<DocumentExtractResult> {
    const engine = await this.engines();
    try {
      const result = await engine.recognize(file);
      return {
        text: result.text.trim(),
        sourceKind: "ocr",
        confidence: result.confidence,
      };
    } finally {
      // Keep the engine warm for consecutive imports.
    }
  }
}
import * as pdfjs from "pdfjs-dist";
import type { DocumentExtractResult } from "../types";
import type { DocumentExtractor, OcrEngine } from "./types";
import { isMeaningfulText } from "./types";

/**
 * PDF extractor. Extracts the embedded text layer first; when the PDF
 * has no usable text (scanned PDFs), renders pages and delegates to OCR.
 */

let workerPromise: Promise<string> | null = null;

async function workerSrc(): Promise<string> {
  if (!workerPromise) {
    const url = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    workerPromise = Promise.resolve(url);
  }
  return workerPromise;
}

export class PdfExtractor implements DocumentExtractor {
  readonly mimeTypes = ["application/pdf"];

  constructor(private readonly ocr: () => Promise<OcrEngine>) {}

  canHandle(file: File): boolean {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  async extract(file: File): Promise<DocumentExtractResult> {
    const url = await workerSrc();
    pdfjs.GlobalWorkerOptions.workerSrc = url;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;

    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = content.items
        .filter((item): item is Extract<typeof item, { str: string }> => "str" in item)
        .map((item) => item.str)
        .join(" ");
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 0) pageTexts.push(text);
      page.cleanup();
    }

    const textLayer = pageTexts.join("\n");
    if (isMeaningfulText(textLayer)) {
      return { text: textLayer, sourceKind: "text" };
    }

    // Scanned PDF: OCR each page, reusing one engine.
    const engine = await this.ocr();
    try {
      const ocrPages: string[] = [];
      let totalConfidence = 0;
      let pages = 0;
      for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          const result = await engine.recognize(canvas);
          ocrPages.push(result.text);
          totalConfidence += result.confidence;
          pages++;
        }
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      const confidence = pages > 0 ? totalConfidence / pages : undefined;
      return { text: ocrPages.join("\n"), sourceKind: "ocr", confidence };
    } finally {
      await engine.terminate();
    }
  }
}
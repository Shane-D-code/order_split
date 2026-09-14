/** In-browser image preprocessing before OCR. Pure browser APIs. */

/**
 * Upscale small images (small phone photos / crops) and downscale only
 * absurd scans. Screenshots are kept near native resolution: downscaling a
 * full-window screenshot like Blinkit's (2940×1912) to a 1400px cap made
 * the item prices illegible to tesseract, so coins and total vanished.
 */
const MIN_DIMENSION = 1400;
const MAX_DIMENSION = 4096;

export async function preprocessImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return blob;

  const longest = Math.max(bitmap.width, bitmap.height);
  let scale = 1;
  if (longest < MIN_DIMENSION) {
    scale = MIN_DIMENSION / longest;
  } else if (longest > MAX_DIMENSION) {
    scale = MAX_DIMENSION / longest;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  return png ?? blob;
}
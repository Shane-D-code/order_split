/** In-browser image preprocessing before OCR. Pure browser APIs. */

const MAX_DIMENSION = 1400;

export async function preprocessImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return blob;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
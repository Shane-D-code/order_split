// Generates the PWA install icons from pwa_final.png (the final app artwork)
// using pure Node + pngjs. No native deps, no network.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const src = PNG.sync.read(readFileSync(join(root, "pwa_final.png")));

// Bilinear downscale of src into a dstW x dstH canvas.
function bilinear(src, dstW, dstH) {
  const out = new PNG({ width: dstW, height: dstH });
  const sw = src.width;
  const sh = src.height;
  const scaleX = sw / dstW;
  const scaleY = sh / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * scaleY - 0.5;
    const y0 = Math.max(Math.floor(sy), 0);
    const y1 = Math.min(y0 + 1, sh - 1);
    const fy = sy - Math.floor(sy);
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) * scaleX - 0.5;
      const x0 = Math.max(Math.floor(sx), 0);
      const x1 = Math.min(x0 + 1, sw - 1);
      const fx = sx - Math.floor(sx);
      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src.data[i00 + c] * (1 - fx) + src.data[i01 + c] * fx;
        const bot = src.data[i10 + c] * (1 - fx) + src.data[i11 + c] * fx;
        out.data[o + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return out;
}

// Maskable-safe version: artwork shrunk to the central 80% safe zone on a
// flat background so the platform mask (circle / squirckle) never clips it.
function maskable(size) {
  const out = new PNG({ width: size, height: size });
  // background = average corner colour of the artwork
  const sw = src.width;
  let br = 0, bg = 0, bb = 0;
  for (const [x, y] of [[1, 1], [sw - 2, 1], [1, sw - 2], [sw - 2, sw - 2]]) {
    const i = (y * sw + x) * 4;
    br += src.data[i];
    bg += src.data[i + 1];
    bb += src.data[i + 2];
  }
  br = Math.round(br / 4);
  bg = Math.round(bg / 4);
  bb = Math.round(bb / 4);
  for (let i = 0; i < size * size; i++) {
    out.data[i * 4] = br;
    out.data[i * 4 + 1] = bg;
    out.data[i * 4 + 2] = bb;
    out.data[i * 4 + 3] = 255;
  }
  const inner = Math.floor(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  const art = bilinear(src, inner, inner);
  for (let y = 0; y < inner; y++) {
    const srcRow = y * inner * 4;
    const dstRow = ((y + offset) * size + offset) * 4;
    for (let x = 0; x < inner * 4; x++) out.data[dstRow + x] = art.data[srcRow + x];
  }
  return out;
}

function save(name, png) {
  writeFileSync(join(publicDir, name), PNG.sync.write(png));
  console.log(`wrote public/${name}`);
}

save("pwa-512.png", bilinear(src, 512, 512));
save("pwa-192.png", bilinear(src, 192, 192));
save("maskable-512.png", maskable(512));
console.log("pwa icons complete");
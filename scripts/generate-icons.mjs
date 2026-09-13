// Generates the PWA PNG icons (and apple touch icon) from an SVG sprite
// using pure Node + pngjs. No native deps, no network.
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

// Icon: rounded square, deep slate background, a white "basket/receipt" glyph.
// We rasterize a small 32x32 design by supersampling and downscaling so we
// need no external rasterizer: draw the SVG-like shapes manually.
function render(size) {
  const S = 8; // design grid size
  const png = new PNG({ width: size, height: size });
  const bg = [15, 23, 42]; // slate-900
  const card = [248, 250, 252]; // slate-50 (receipt)
  const accent = [52, 211, 153]; // emerald-400 (check)
  // radial-ish rounded square background
  const pad = Math.round(size * 0.06);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let idx = (y * size + x) * 4;
      const inside = inRR(x, y, pad, pad, size - pad, size - pad, r);
      const c = inside ? bg : [0, 0, 0];
      png.data[idx] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = inside ? 255 : 0;
    }
  }
  // receipt shape
  const rx = size * 0.22;
  const ry = size * 0.18;
  const rw = size * 0.56;
  const rh = size * 0.64;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (insideRect(x, y, rx, ry, rw, rh)) {
        png.data[idx] = card[0];
        png.data[idx + 1] = card[1];
        png.data[idx + 2] = card[2];
        // bumpy receipt bottom: two notches
        const localY = y - ry;
        const rowHeight = rh;
        const pct = localY / rowHeight;
        if (pct > 0.62) {
          const notchW = rw * 0.16;
          const notchH = rh * 0.1;
          for (const nx of [0, 1]) {
            const cx = rx + rw / 2 + (nx === 0 ? -1 : 1) * (rw * 0.2);
            if (
              x > cx - notchW / 2 &&
              x < cx + notchW / 2 &&
              y > ry + rh - notchH
            ) {
              png.data[idx] = bg[0];
              png.data[idx + 1] = bg[1];
              png.data[idx + 2] = bg[2];
            }
          }
        }
      }
    }
  }
  // accent checkmark in the receipt
  const cy = ry + rh * 0.62;
  const sz = size * 0.16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (
        x > rx + rw * 0.28 &&
        x < rx + rw * 0.72 &&
        y > cy - sz &&
        y < cy + sz
      ) {
        // approximate check path: |/_  between (rx+rw*0.36,cy) and (rx+rw*0.64,cy)
        const nx = (x - (rx + rw * 0.3)) / (rw * 0.4);
        const ny = (y - cy) / sz;
        if (nx + ny > 0.55 && nx - ny > 0.3 && nx < 1.15) {
          png.data[idx] = accent[0];
          png.data[idx + 1] = accent[1];
          png.data[idx + 2] = accent[2];
        }
      }
    }
  }
  return png;
}

function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const cx = x < x0 + r ? x0 + r : x1 - r;
  const cy = y < y0 + r ? y0 + r : y1 - r;
  return dx2(x, cx) + dy2(y, cy) <= r * r;
}
function insideRect(x, y, x0, y0, w, h) {
  return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
}
const dx2 = (a, b) => (a - b) ** 2;
const dy2 = (a, b) => (a - b) ** 2;

mkdirSync(publicDir, { recursive: true });

function save(name, size) {
  const png = render(size);
  writeFileSync(join(publicDir, name), PNG.sync.write(png));
  console.log(`wrote public/${name}`);
}

save("pwa-192.png", 192);
save("pwa-512.png", 512);
save("apple-touch-icon.png", 180);
save("favicon-180.png", 180);
console.log("icons complete");
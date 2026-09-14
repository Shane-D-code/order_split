// Generates the PWA PNG icons (and apple touch icons) from the same design
// as public/favicon.svg using pure Node + pngjs. No native deps, no network.
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

// Icon: amber rounded square, a cream "receipt" card with an ink outline, a
// few faint ink lines and a red mini cart/down-tick line. Mirrors
// public/favicon.svg (viewBox 0 0 64 64). We rasterize the 64x64 design with
// supersampling so we need no external rasterizer: shapes are drawn by
// sampling design-space coordinates.
const AMBER = [242, 167, 27]; // #f2a71b
const CREAM = [255, 249, 234]; // #fff9ea
const INK = [42, 28, 14]; // #2a1c0e
const RED = [239, 64, 32]; // #ef4020

const BG = [0, 0, 64, 64, 16]; // rounded square, rx 16
const RC = [15, 11, 49, 51, 4]; // receipt card, rx 4
const STROKE = 2.4; // receipt outline width

// faint horizontal lines (opacity 0.5): y=21, y=28 from x21..x43, y=35 x21..x35
const LINES = [
  [21, 21, 43, 21],
  [21, 28, 43, 28],
  [21, 35, 35, 35],
];
const LINE_W = 2.4;

// red down-tick line: M22 44 l5-4 8 5 6-6 4 3
const CHART = [
  [22, 44],
  [27, 40],
  [35, 45],
  [41, 39],
  [45, 42],
];
const CHART_W = 2.8;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const cx = x < x0 + r ? x0 + r : x1 - r;
  const cy = y < y0 + r ? y0 + r : y1 - r;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSeg(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  let t = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1);
  t = Math.max(0, Math.min(1, t));
  const dx = x - (ax + t * vx);
  const dy = y - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function inStroke(x, y, segs, half) {
  for (const s of segs) {
    if (distToSeg(x, y, s[0], s[1], s[2], s[3]) <= half) return true;
  }
  return false;
}

function sampleColor(x, y) {
  if (!inRoundRect(x, y, ...BG)) return null; // transparent outside
  let [r, g, b] = AMBER;
  // receipt outline (2.4 wide band) sits over the amber background
  const outer = inRoundRect(x, y, RC[0] - STROKE / 2, RC[1] - STROKE / 2, RC[2] + STROKE / 2, RC[3] + STROKE / 2, RC[4] + STROKE / 2);
  const inner = inRoundRect(x, y, RC[0] + STROKE / 2, RC[1] + STROKE / 2, RC[2] - STROKE / 2, RC[3] - STROKE / 2, Math.max(RC[4] - STROKE / 2, 0));
  if (outer && !inner) {
    [r, g, b] = INK;
  } else if (inRoundRect(x, y, ...RC)) {
    [r, g, b] = CREAM;
  }
  // faint ink lines, blended at 50% over whatever is below
  if (inStroke(x, y, LINES, LINE_W / 2)) {
    [r, g, b] = [0.5 * r + 0.5 * INK[0], 0.5 * g + 0.5 * INK[1], 0.5 * b + 0.5 * INK[2]];
  }
  // red chart line on top
  if (inStroke(x, y, CHART.slice(0, -1).map((p, i) => [...p, ...CHART[i + 1]]), CHART_W / 2)) {
    [r, g, b] = RED;
  }
  return [r, g, b];
}

// Supersample the 64x64 design into `size`x`size` pixels for smooth edges.
function render(size) {
  const SS = 6;
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 64;
          const y = ((py + (sy + 0.5) / SS) / size) * 64;
          const c = sampleColor(x, y);
          if (c) {
            ar += c[0];
            ag += c[1];
            ab += c[2];
            aa += 1;
          }
        }
      }
      const n = SS * SS;
      const idx = (py * size + px) * 4;
      png.data[idx] = Math.round(ar / n);
      png.data[idx + 1] = Math.round(ag / n);
      png.data[idx + 2] = Math.round(ab / n);
      png.data[idx + 3] = Math.round((aa / n) * 255);
    }
  }
  return png;
}

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
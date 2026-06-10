import { PNG } from "pngjs";

export interface ImageStats {
  width: number;
  height: number;
  /** Essentially a single flat color. */
  blank: boolean;
  /** % of pixels meaningfully different from the background (modal) color. */
  coverage_pct: number;
  /** Distinct colors after 5-bit/channel quantization. */
  unique_colors: number;
  /** Fraction (0..1) of pixels with a strong neighbor delta. */
  edge_density: number;
  background_color: string;
  verdict: "blank" | "nearly-blank" | "low-detail" | "ok";
}

const SAMPLE_MAX = 96;
const BG_DISTANCE = 12;
const EDGE_DELTA = 24;

/** Pure-function heuristics over a PNG screenshot (tech-agnostic). */
export function analyzeImage(pngBuffer: Buffer): ImageStats {
  const png = PNG.sync.read(pngBuffer);
  const sx = Math.max(1, Math.floor(png.width / SAMPLE_MAX));
  const sy = Math.max(1, Math.floor(png.height / SAMPLE_MAX));
  const w = Math.floor(png.width / sx);
  const h = Math.floor(png.height / sy);

  // Downsample (nearest) into a small RGB grid.
  const r = new Uint8Array(w * h);
  const g = new Uint8Array(w * h);
  const b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = ((y * sy * png.width) + x * sx) * 4;
      const i = y * w + x;
      r[i] = png.data[off];
      g[i] = png.data[off + 1];
      b[i] = png.data[off + 2];
    }
  }
  const n = w * h;

  // Modal (background) color via 5-bit/channel quantization.
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const key = ((r[i] >> 3) << 10) | ((g[i] >> 3) << 5) | (b[i] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let modalKey = 0;
  let modalCount = 0;
  for (const [key, count] of counts) {
    if (count > modalCount) {
      modalKey = key;
      modalCount = count;
    }
  }
  const bg = {
    r: ((modalKey >> 10) & 31) << 3,
    g: ((modalKey >> 5) & 31) << 3,
    b: (modalKey & 31) << 3,
  };

  // Coverage: pixels far enough from the background color.
  let covered = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const dist = Math.hypot(r[i] - bg.r, g[i] - bg.g, b[i] - bg.b);
    if (dist > BG_DISTANCE) covered++;
    const lum = (r[i] + g[i] + b[i]) / 3;
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const coveragePct = (covered / n) * 100;

  // Edge density: strong luminance/channel deltas to right/down neighbors.
  let edges = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const right = i + 1;
      const down = i + w;
      const d = Math.max(
        Math.abs(r[i] - r[right]), Math.abs(g[i] - g[right]), Math.abs(b[i] - b[right]),
        Math.abs(r[i] - r[down]), Math.abs(g[i] - g[down]), Math.abs(b[i] - b[down])
      );
      if (d > EDGE_DELTA) edges++;
    }
  }
  const edgeDensity = edges / ((w - 1) * (h - 1));

  // blank = essentially nothing differs from the background; the variance
  // guard catches "everything is one dim gradient" screenshots too.
  const blank = coveragePct < 0.5 || variance < 2.0;
  let verdict: ImageStats["verdict"] = "ok";
  if (blank) verdict = "blank";
  else if (coveragePct < 3) verdict = "nearly-blank";
  else if (counts.size < 8 || edgeDensity < 0.015) verdict = "low-detail";

  return {
    width: png.width,
    height: png.height,
    blank,
    coverage_pct: Math.round(coveragePct * 10) / 10,
    unique_colors: counts.size,
    edge_density: Math.round(edgeDensity * 1000) / 1000,
    background_color: `rgb(${bg.r},${bg.g},${bg.b})`,
    verdict,
  };
}

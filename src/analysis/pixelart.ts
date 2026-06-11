import { PNG } from "pngjs";
import type { Issue, PixInfo } from "../types.js";

export interface PixelArtStats {
  grid: { width: number; height: number };
  cell_size: number;
  non_uniform_cells_pct: number;
  distinct_colors: number;
  declared_palette: number;
}

/**
 * Pixel-art checks over the display-canvas screenshot (PNG, lossless).
 * The display canvas is logical-grid * scale, so each logical pixel maps to an
 * exact cell of the image; any color variation INSIDE a cell means smoothing /
 * off-grid drawing — the cardinal sin of pixel art.
 */
export function analyzePixelArt(pngBuffer: Buffer, pix: PixInfo): { stats: PixelArtStats; issues: Issue[] } {
  const png = PNG.sync.read(pngBuffer);
  const issues: Issue[] = [];

  const cellW = png.width / pix.width;
  const cellH = png.height / pix.height;
  const cell = Math.min(cellW, cellH);

  let nonUniform = 0;
  const colors = new Set<number>();
  const TOL = 8; // per-channel tolerance: absorbs PNG/compositor rounding

  for (let gy = 0; gy < pix.height; gy++) {
    for (let gx = 0; gx < pix.width; gx++) {
      // sample a few interior points of the cell (avoid the 1px borders where
      // fractional cell sizes could bleed)
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      let baseR = -1;
      let baseG = 0;
      let baseB = 0;
      let uniform = true;
      for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]]) {
        const px = Math.min(png.width - 1, Math.floor(x0 + fx * cellW));
        const py = Math.min(png.height - 1, Math.floor(y0 + fy * cellH));
        const off = (py * png.width + px) * 4;
        const r = png.data[off];
        const g = png.data[off + 1];
        const b = png.data[off + 2];
        if (baseR < 0) {
          baseR = r; baseG = g; baseB = b;
        } else if (Math.abs(r - baseR) > TOL || Math.abs(g - baseG) > TOL || Math.abs(b - baseB) > TOL) {
          uniform = false;
        }
      }
      if (!uniform) nonUniform++;
      colors.add(((baseR >> 3) << 10) | ((baseG >> 3) << 5) | (baseB >> 3));
    }
  }

  const totalCells = pix.width * pix.height;
  const nonUniformPct = (nonUniform / totalCells) * 100;

  if (cell >= 3 && nonUniformPct > 2) {
    issues.push({
      id: "ANTI_ALIASING",
      severity: "warning",
      message: `${nonUniformPct.toFixed(1)}% of logical pixels are not a single flat color — something is drawing smooth/off-grid (anti-aliasing, gradients, sub-pixel coordinates).`,
      suggestion:
        "Draw only through the PIX grid API (px/line/rect/circle/fill) and never directly on the display canvas; keep imageSmoothingEnabled = false when scaling images.",
    });
  }

  // The checkerboard transparency background adds 2 colors; allow slack for it.
  if (pix.palette_size > 0 && colors.size > pix.palette_size + 4) {
    issues.push({
      id: "PALETTE_OVERFLOW",
      severity: "warning",
      message: `~${colors.size} distinct colors on screen, but the declared palette has ${pix.palette_size}. Discipline is what makes pixel art read.`,
      suggestion:
        "Stick to palette indices (avoid ad-hoc #hex colors); create shading with dithering (p.dither) instead of new colors.",
    });
  }

  return {
    stats: {
      grid: { width: pix.width, height: pix.height },
      cell_size: Math.round(cell * 10) / 10,
      non_uniform_cells_pct: Math.round(nonUniformPct * 10) / 10,
      distinct_colors: colors.size,
      declared_palette: pix.palette_size,
    },
    issues,
  };
}

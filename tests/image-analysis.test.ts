import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { analyzeImage } from "../src/analysis/image.js";

function makePng(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      png.data[off] = r;
      png.data[off + 1] = g;
      png.data[off + 2] = b;
      png.data[off + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe("analyzeImage", () => {
  it("flags a solid color as blank", () => {
    const stats = analyzeImage(makePng(200, 150, () => [40, 40, 60]));
    expect(stats.blank).toBe(true);
    expect(stats.verdict).toBe("blank");
  });

  it("flags a tiny dot on a flat background as blank", () => {
    const stats = analyzeImage(
      makePng(200, 150, (x, y) => (x < 3 && y < 3 ? [255, 0, 0] : [30, 30, 30]))
    );
    expect(stats.verdict).toBe("blank");
  });

  it("flags a small patch on a flat background as nearly blank", () => {
    const stats = analyzeImage(
      makePng(200, 150, (x, y) => (x < 25 && y < 25 ? [255, 60, 60] : [30, 30, 30]))
    );
    expect(stats.blank).toBe(false);
    expect(stats.verdict).toBe("nearly-blank");
    expect(stats.coverage_pct).toBeLessThan(3);
  });

  it("accepts a rich gradient as ok", () => {
    const stats = analyzeImage(
      makePng(200, 150, (x, y) => [
        Math.floor((x / 200) * 255),
        Math.floor((y / 150) * 255),
        Math.floor(((x + y) / 350) * 255),
      ])
    );
    expect(stats.blank).toBe(false);
    expect(stats.unique_colors).toBeGreaterThan(50);
  });

  it("flags low color/edge variety as low-detail", () => {
    // two flat halves: decent coverage but almost no colors/edges
    const stats = analyzeImage(makePng(200, 150, (x) => (x < 100 ? [50, 50, 70] : [90, 90, 110])));
    expect(stats.verdict).toBe("low-detail");
  });
});

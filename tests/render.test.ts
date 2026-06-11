import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { renderScene } from "../src/tools/render.js";
import { inspectScene } from "../src/tools/inspect.js";
import { analyzeImage } from "../src/analysis/image.js";
import { closeBrowser } from "../src/browser/manager.js";

const DEFAULTS = {
  views: ["front", "three-quarter", "side", "top"] as never,
  animation_frames: 1,
  frame_interval_ms: 150,
  format: "png" as const, // png so analyzeImage can verify content
  width: 800,
  height: 600,
  settle_frames: 10,
  extra_wait_ms: 0,
  timeout_ms: 25000,
};

const example = (name: string) => path.resolve("examples", name);

afterAll(async () => {
  await closeBrowser();
});

describe("render_scene", () => {
  it("threejs robot: 4 auto-orbit views, all with real content", async () => {
    const result = await renderScene({ ...DEFAULTS, file_path: example("good-threejs-robot.html") });
    expect(result.meta.engine).toBe("threejs");
    expect(result.images).toHaveLength(4);
    for (const img of result.images) {
      expect(img.target).toBe("canvas");
      expect(analyzeImage(img.buffer).blank).toBe(false);
    }
  });

  it("canvas2d house: multi-view via __setView hook", async () => {
    const result = await renderScene({ ...DEFAULTS, file_path: example("good-canvas2d-house.html") });
    expect(result.meta.engine).toBe("canvas2d");
    expect(String(result.meta.view_mode)).toContain("__setView");
    expect(result.images).toHaveLength(4);
    for (const img of result.images) {
      expect(analyzeImage(img.buffer).blank).toBe(false);
    }
  });

  it("webgl stack: multi-view via __setView hook, never blank", async () => {
    const result = await renderScene({ ...DEFAULTS, file_path: example("good-webgl-cube.html") });
    expect(result.meta.engine).toBe("webgl");
    expect(result.images).toHaveLength(4);
    for (const img of result.images) {
      expect(analyzeImage(img.buffer).blank).toBe(false);
    }
  });

  it("close-up view (distance_factor < 1) zooms in", async () => {
    const wide = await renderScene({
      ...DEFAULTS,
      views: [{ azimuth_deg: 35, elevation_deg: 20, distance_factor: 1 }] as never,
      file_path: example("good-threejs-textured.html"),
    });
    const close = await renderScene({
      ...DEFAULTS,
      views: [{ azimuth_deg: 35, elevation_deg: 20, distance_factor: 0.35 }] as never,
      file_path: example("good-threejs-textured.html"),
    });
    const wideStats = analyzeImage(wide.images[0].buffer);
    const closeStats = analyzeImage(close.images[0].buffer);
    expect(closeStats.coverage_pct).toBeGreaterThan(wideStats.coverage_pct);
  });

  it("2d scene: single view, no multi-view nagging", async () => {
    const result = await renderScene({ ...DEFAULTS, file_path: example("good-2d-scene.html") });
    expect(result.meta.mode).toBe("2d");
    expect(result.images).toHaveLength(1);
    expect((result.meta.notes as string[]).join(" ")).not.toContain("__setView");
    expect(analyzeImage(result.images[0].buffer).blank).toBe(false);
  });

  it("animation_frames captures sequential, differing frames", async () => {
    const result = await renderScene({
      ...DEFAULTS,
      animation_frames: 3,
      frame_interval_ms: 300, // slime idles at 4 fps (250ms)
      file_path: example("good-pixelart-slime.html"),
    });
    expect(result.images).toHaveLength(3);
    expect(result.images.map((i) => i.name)).toEqual(["frame-1", "frame-2", "frame-3"]);
    const sizes = new Set(result.images.map((i) => i.buffer.length));
    expect(sizes.size).toBeGreaterThan(1); // squash & stretch actually changes pixels
  });

  it("scene without hooks falls back to a single shot with guidance", async () => {
    const result = await renderScene({ ...DEFAULTS, file_path: example("defects/blank-canvas.html") });
    expect(result.images).toHaveLength(1);
    expect((result.meta.notes as string[]).join(" ")).toContain("__setView");
  });
});

describe("inspect_scene", () => {
  it("dumps the registered three.js scene graph", async () => {
    const result = await inspectScene({
      file_path: example("good-threejs-textured.html"),
      max_depth: 6,
      width: 800,
      height: 600,
      settle_frames: 10,
      extra_wait_ms: 0,
      timeout_ms: 25000,
    });
    expect(result.ok).toBe(true);
    const tree = result.tree as { children?: Array<{ name?: string }> };
    const names = (tree.children ?? []).map((c) => c.name);
    expect(names).toContain("table_top");
    expect(names).toContain("vase");
  });

  it("explains itself for non-three.js scenes", async () => {
    const result = await inspectScene({
      file_path: example("good-canvas2d-house.html"),
      max_depth: 6,
      width: 800,
      height: 600,
      settle_frames: 10,
      extra_wait_ms: 0,
      timeout_ms: 25000,
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("__scene");
  });
});

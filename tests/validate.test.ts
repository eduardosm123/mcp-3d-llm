import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateScene } from "../src/tools/validate.js";
import { closeBrowser } from "../src/browser/manager.js";
import type { Issue } from "../src/types.js";

const DEFAULTS = {
  include_screenshot: false,
  width: 800,
  height: 600,
  settle_frames: 10,
  extra_wait_ms: 0,
  timeout_ms: 25000,
};

const example = (name: string) => path.resolve("examples", name);

function ids(report: Record<string, unknown>): string[] {
  return (report.issues as Issue[]).map((i) => i.id);
}

afterAll(async () => {
  await closeBrowser();
});

describe("validate_scene on defect examples", () => {
  it("detects a blank canvas", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/blank-canvas.html") });
    expect(report.ok).toBe(false);
    expect(ids(report)).toContain("BLANK_CANVAS");
  });

  it("detects lit materials without lights", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/no-lights.html") });
    expect(report.ok).toBe(false);
    expect(ids(report)).toContain("NO_LIGHTS");
  });

  it("detects a floating object", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/floating-parts.html") });
    const issues = (report.issues as Issue[]).filter((i) => i.id === "FLOATING_OBJECT");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].objects?.[0]).toContain("floater");
  });

  it("detects a NaN transform", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/nan-transform.html") });
    expect(report.ok).toBe(false);
    expect(ids(report)).toContain("NAN_TRANSFORM");
  });

  it("detects the camera pointing away from everything", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/out-of-frustum.html") });
    expect(report.ok).toBe(false);
    const frustum = (report.issues as Issue[]).filter((i) => i.id === "OUT_OF_FRUSTUM");
    expect(frustum.some((i) => i.severity === "error")).toBe(true);
  });

  it("captures uncaught page exceptions", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/js-exception.html") });
    expect(report.ok).toBe(false);
    expect(ids(report)).toContain("PAGE_ERROR");
  });

  it("detects a texture map without UVs", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/missing-uvs.html") });
    expect(ids(report)).toContain("MISSING_UVS");
  });

  it("detects smooth/off-grid drawing in pixel art", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("defects/pixelart-blurry.html") });
    expect(ids(report)).toContain("ANTI_ALIASING");
    expect(ids(report)).toContain("PALETTE_OVERFLOW");
  });

  it("survives an infinite loop within the hard timeout", async () => {
    const start = Date.now();
    const timeout = 8000;
    await expect(
      validateScene({ ...DEFAULTS, timeout_ms: timeout, file_path: example("defects/infinite-loop.html") })
    ).rejects.toThrow(/unresponsive/i);
    expect(Date.now() - start).toBeLessThan(timeout + 10000);
  }, 30000);
});

describe("validate_scene on good examples", () => {
  it("threejs textured table: ok, deep engine, no error issues", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("good-threejs-textured.html") });
    expect(report.engine).toBe("threejs-deep");
    expect(report.ok).toBe(true);
    const stats = report.scene_stats as Record<string, unknown>;
    expect((stats.lights as unknown[]).length).toBeGreaterThan(0);
    expect(stats.textured_meshes as number).toBeGreaterThan(0);
  });

  it("canvas2d house: ok, no error issues", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("good-canvas2d-house.html") });
    expect(report.engine).toBe("canvas2d");
    expect(report.ok).toBe(true);
    const image = report.image as Record<string, unknown>;
    expect(image.blank).toBe(false);
  });

  it("pixel art slime: ok, pixel checks clean, grid stats reported", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("good-pixelart-slime.html") });
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("2d");
    expect(ids(report)).not.toContain("ANTI_ALIASING");
    const pixel = report.pixel_art as Record<string, unknown>;
    expect((pixel.grid as Record<string, number>).width).toBe(32);
  });

  it("2d illustration scene: ok, mode 2d", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("good-2d-scene.html") });
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("2d");
    const image = report.image as Record<string, unknown>;
    expect(image.blank).toBe(false);
  });

  it("webgl textured stack: ok, no error issues", async () => {
    const { report } = await validateScene({ ...DEFAULTS, file_path: example("good-webgl-cube.html") });
    expect(report.engine).toBe("webgl");
    expect(report.ok).toBe(true);
    const image = report.image as Record<string, unknown>;
    expect(image.blank).toBe(false);
  });

  it("missing file raises a clear error", async () => {
    await expect(validateScene({ ...DEFAULTS, file_path: example("does-not-exist.html") })).rejects.toThrow(
      /not found/i
    );
  });
});

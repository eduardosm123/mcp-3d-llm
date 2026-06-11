import { z } from "zod";
import { withScene, captureCanvas } from "../browser/session.js";
import { callInjected } from "../probe/loader.js";
import { analyzeImage, type ImageStats } from "../analysis/image.js";
import { analyzePixelArt, type PixelArtStats } from "../analysis/pixelart.js";
import { pageIssues, imageIssues, sortIssues } from "../analysis/report.js";
import { renderOptionsShape } from "./render.js";
import type { Issue, RenderOptions } from "../types.js";

export const validateSceneShape = {
  file_path: z.string().describe("Absolute path to a self-contained .html file that renders a 3D scene into a <canvas>"),
  include_screenshot: z.boolean().default(false).describe("Also return the current-frame screenshot"),
  ...renderOptionsShape,
};

export interface ValidateArgs {
  file_path: string;
  include_screenshot: boolean;
  width: number;
  height: number;
  settle_frames: number;
  extra_wait_ms: number;
  timeout_ms: number;
}

interface ThreeChecksResult {
  ok: boolean;
  error?: string;
  stats?: Record<string, unknown>;
  issues?: Issue[];
}

export interface ValidateResult {
  report: Record<string, unknown>;
  screenshot?: { buffer: Buffer; format: "png" };
}

export async function validateScene(args: ValidateArgs): Promise<ValidateResult> {
  const opts: RenderOptions = {
    width: args.width,
    height: args.height,
    settle_frames: args.settle_frames,
    extra_wait_ms: args.extra_wait_ms,
    timeout_ms: args.timeout_ms,
    format: "png", // validation analyzes pixels — lossless
  };

  return withScene(args.file_path, opts, async (session) => {
    const { snapshot, log, notes } = session;
    const issues: Issue[] = [];

    // Pixel analysis of the current frame (ask the page to repaint first so a
    // render-once WebGL scene isn't captured blank).
    await session.page.evaluate(callInjected("redraw.js")).catch(() => {});
    let stats: ImageStats | null = null;
    let pixelStats: PixelArtStats | undefined;
    let shot: { buffer: Buffer; target: "canvas" | "page" } | null = null;
    try {
      shot = await captureCanvas(session, opts);
      stats = analyzeImage(shot.buffer);
      issues.push(...imageIssues(stats, snapshot));
      if (snapshot.pix && shot.target === "canvas") {
        const pixelArt = analyzePixelArt(shot.buffer, snapshot.pix);
        pixelStats = pixelArt.stats;
        issues.push(...pixelArt.issues);
      }
    } catch {
      notes.push("Could not capture/analyze a screenshot.");
    }

    // Deep Three.js checks when the scene is registered.
    let engineLabel: string = snapshot.engine;
    let sceneStats: Record<string, unknown> | undefined;
    if (snapshot.deep) {
      engineLabel = "threejs-deep";
      const result = (await session.page
        .evaluate(callInjected("three-checks.js"))
        .catch((e) => ({ ok: false, error: String(e) }))) as ThreeChecksResult;
      if (result.ok && result.issues && result.stats) {
        issues.push(...result.issues);
        sceneStats = result.stats;
      } else {
        notes.push(`Deep Three.js checks failed: ${result.error ?? "unknown"}`);
      }
    } else if (snapshot.engine === "threejs-detected") {
      engineLabel = "threejs-detected-no-__scene";
      issues.push({
        id: "SCENE_NOT_REGISTERED",
        severity: "info",
        message: "Three.js detected, but deep validation needs window.__scene = {scene, camera, renderer}.",
        suggestion: "Register it (threeHelpers register() does this) to unlock scene-graph checks and auto-orbit views.",
      });
    }

    issues.push(...pageIssues(log, snapshot, notes));
    const sorted = sortIssues(issues);

    const report = {
      ok: !sorted.some((i) => i.severity === "error"),
      engine: engineLabel,
      page: log,
      canvas: {
        found: snapshot.canvases.length > 0,
        count: snapshot.canvases.length,
        contexts: snapshot.canvases,
        animation_loop: snapshot.rafTicked,
        multi_view_capable: snapshot.deep || snapshot.hasSetView,
      },
      image: stats,
      pixel_art: pixelStats,
      mode: snapshot.mode,
      scene_stats: sceneStats,
      issues: sorted,
      notes,
    };

    return {
      report,
      screenshot: args.include_screenshot && shot ? { buffer: shot.buffer, format: "png" as const } : undefined,
    };
  });
}

import { z } from "zod";
import { withScene, captureCanvas, type Session } from "../browser/session.js";
import { callInjected } from "../probe/loader.js";
import {
  DEFAULT_RENDER_OPTIONS,
  NAMED_VIEWS,
  resolveView,
  type RenderOptions,
  type ViewSpec,
} from "../types.js";

export const renderOptionsShape = {
  width: z.number().int().min(64).max(1920).default(DEFAULT_RENDER_OPTIONS.width)
    .describe("Viewport width in px"),
  height: z.number().int().min(64).max(1080).default(DEFAULT_RENDER_OPTIONS.height)
    .describe("Viewport height in px"),
  settle_frames: z.number().int().min(0).max(120).default(DEFAULT_RENDER_OPTIONS.settle_frames)
    .describe("requestAnimationFrame frames to wait after load before capturing"),
  extra_wait_ms: z.number().int().min(0).max(30000).default(DEFAULT_RENDER_OPTIONS.extra_wait_ms)
    .describe("Extra fixed wait after settling, for slow async scenes"),
  timeout_ms: z.number().int().min(1000).max(120000).default(DEFAULT_RENDER_OPTIONS.timeout_ms)
    .describe("Hard cap for the whole operation"),
};

const viewSchema = z.union([
  z.enum(["front", "back", "left", "right", "side", "top", "bottom", "three-quarter"]),
  z
    .object({
      name: z.string().optional(),
      azimuth_deg: z.number().describe("Horizontal orbit angle: 0 = front (+Z), 90 = right, 180 = back"),
      elevation_deg: z.number().min(-89).max(89).describe("Vertical angle above the horizon"),
      distance_factor: z.number().min(0.05).max(10).optional()
        .describe("1.0 = auto-framed to fit the scene; <1 = close-up (inspect textures/details), >1 = far"),
    })
    .describe("Custom camera angle"),
]);

export const renderSceneShape = {
  file_path: z.string().describe("Absolute path to a self-contained .html file that renders a 3D scene into a <canvas>"),
  views: z.array(viewSchema).min(1).max(8).default(["front", "three-quarter", "side", "top"])
    .describe("Camera views to capture (requires window.__scene or window.__setView; see get_guidelines topic 'workflow'). Ignored for 2D scenes and when animation_frames > 1."),
  animation_frames: z.number().int().min(1).max(16).default(1)
    .describe("Capture N sequential frames of an animated scene instead of multiple camera views"),
  frame_interval_ms: z.number().int().min(16).max(5000).default(150)
    .describe("Delay between animation frame captures"),
  format: z.enum(["jpeg", "png"]).default("jpeg"),
  ...renderOptionsShape,
};

// "side" is a friendlier alias users/AIs reach for; map it to "right".
function normalizeViews(views: Array<ViewSpec | "side">): ViewSpec[] {
  return views.map((v) => (v === "side" ? "right" : v)) as ViewSpec[];
}

export interface RenderArgs {
  file_path: string;
  views: Array<ViewSpec | "side">;
  animation_frames: number;
  frame_interval_ms: number;
  format: "jpeg" | "png";
  width: number;
  height: number;
  settle_frames: number;
  extra_wait_ms: number;
  timeout_ms: number;
}

interface CapturedView {
  name: string;
  buffer: Buffer;
  target: "canvas" | "page";
}

export interface RenderResult {
  meta: Record<string, unknown>;
  images: CapturedView[];
  format: "jpeg" | "png";
}

export async function renderScene(args: RenderArgs): Promise<RenderResult> {
  const opts: RenderOptions = {
    width: args.width,
    height: args.height,
    settle_frames: args.settle_frames,
    extra_wait_ms: args.extra_wait_ms,
    timeout_ms: args.timeout_ms,
    format: args.format,
  };
  const views = normalizeViews(args.views).map(resolveView);

  return withScene(args.file_path, opts, async (session) => {
    const { snapshot, log, notes } = session;
    const images: CapturedView[] = [];
    let viewMode: string;

    if (args.animation_frames > 1) {
      viewMode = `animation frames (every ${args.frame_interval_ms}ms)`;
      for (let i = 1; i <= args.animation_frames; i++) {
        if (i > 1) await session.page.waitForTimeout(args.frame_interval_ms);
        const shot = await captureCanvas(session, opts);
        images.push({ name: `frame-${i}`, ...shot });
      }
      if (!snapshot.rafTicked) {
        notes.push(
          "animation_frames requested but the page never used requestAnimationFrame — all frames are likely identical."
        );
      }
    } else if (snapshot.mode === "2d") {
      viewMode = "2d (single view)";
      await session.page.evaluate(callInjected("redraw.js")).catch(() => {});
      const shot = await captureCanvas(session, opts);
      images.push({ name: "default", ...shot });
    } else if (snapshot.deep) {
      viewMode = "auto-orbit (window.__scene)";
      for (const view of views) {
        const result = (await session.page
          .evaluate(
            callInjected("orbit.js", {
              azimuthDeg: view.azimuth_deg,
              elevationDeg: view.elevation_deg,
              distanceFactor: view.distance_factor,
            })
          )
          .catch((e) => ({ ok: false, error: String(e) }))) as { ok: boolean; error?: string };
        if (!result.ok) {
          notes.push(`View "${view.name}" failed: ${result.error}`);
          continue;
        }
        const shot = await captureCanvas(session, opts);
        images.push({ name: view.name, ...shot });
      }
      await session.page.evaluate(callInjected("restore-camera.js")).catch(() => {});
    } else if (snapshot.hasSetView) {
      viewMode = "page hook (window.__setView)";
      for (const view of views) {
        const result = (await session.page
          .evaluate(callInjected("set-view.js", view))
          .catch((e) => ({ ok: false, error: String(e) }))) as { ok: boolean; error?: string };
        if (!result.ok) {
          notes.push(`View "${view.name}" failed: ${result.error}`);
          continue;
        }
        const shot = await captureCanvas(session, opts);
        images.push({ name: view.name, ...shot });
      }
    } else {
      viewMode = "single shot (no multi-view hook)";
      await session.page.evaluate(callInjected("redraw.js")).catch(() => {});
      const shot = await captureCanvas(session, opts);
      images.push({ name: "default", ...shot });
      if (views.length > 1) {
        notes.push(
          "Multi-view unavailable: register your scene to enable it. Three.js: window.__scene = {scene, camera, renderer} " +
            "(or threeHelpers.register()). Other tech: implement window.__setView({azimuth_deg, elevation_deg, distance_factor}) " +
            "that repositions the camera and re-renders. See get_guidelines topic 'workflow'."
        );
      }
    }

    if (images.length > 0 && images.every((i) => i.target === "page")) {
      notes.push("No <canvas> element found — captured the full page. Is the scene actually creating a canvas?");
    }
    if (
      snapshot.engine === "webgl" &&
      !snapshot.rafTicked &&
      !snapshot.hasSetView &&
      !snapshot.hasRedraw
    ) {
      notes.push(
        "WebGL scene renders once with no animation loop: the screenshot may be blank because the drawing buffer is " +
          "discarded after presentation. Either render inside a requestAnimationFrame loop or expose window.__redraw = () => draw()."
      );
    }
    if (snapshot.engine === "threejs-detected") {
      notes.push(
        "Three.js detected but window.__scene is not registered. Add `window.__scene = {scene, camera, renderer}` " +
          "(or use threeHelpers.register()) to unlock multi-angle capture and deep validation."
      );
    }

    const meta = {
      engine: snapshot.engine,
      mode: snapshot.mode,
      pixel_art: snapshot.pix,
      view_mode: viewMode,
      views_captured: images.map((i) => i.name),
      canvas_found: snapshot.canvases.length > 0,
      canvases: snapshot.canvases,
      console_errors: log.console_errors.slice(0, 10),
      page_errors: log.page_errors.slice(0, 10),
      failed_requests: log.failed_requests.slice(0, 10),
      notes,
    };
    return { meta, images, format: args.format };
  });
}

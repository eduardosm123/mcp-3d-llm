import { z } from "zod";
import { withScene } from "../browser/session.js";
import { callInjected } from "../probe/loader.js";
import { renderOptionsShape } from "./render.js";
import type { RenderOptions } from "../types.js";

export const inspectSceneShape = {
  file_path: z.string().describe("Absolute path to the scene .html file (must register window.__scene)"),
  max_depth: z.number().int().min(1).max(20).default(6).describe("Maximum tree depth to dump"),
  filter: z.string().optional().describe("Only include subtrees whose name/type contains this substring"),
  ...renderOptionsShape,
};

export interface InspectArgs {
  file_path: string;
  max_depth: number;
  filter?: string;
  width: number;
  height: number;
  settle_frames: number;
  extra_wait_ms: number;
  timeout_ms: number;
}

export async function inspectScene(args: InspectArgs): Promise<Record<string, unknown>> {
  const opts: RenderOptions = {
    width: args.width,
    height: args.height,
    settle_frames: args.settle_frames,
    extra_wait_ms: args.extra_wait_ms,
    timeout_ms: args.timeout_ms,
    format: "png",
  };

  return withScene(args.file_path, opts, async (session) => {
    if (!session.snapshot.deep) {
      return {
        ok: false,
        engine: session.snapshot.engine,
        error:
          "inspect_scene needs a registered Three.js scene: window.__scene = {scene, camera, renderer} " +
          "(threeHelpers register() does this). For other tech there is no scene graph to dump — use render_scene + validate_scene.",
        page_errors: session.log.page_errors.slice(0, 5),
      };
    }
    const result = await session.page
      .evaluate(callInjected("three-dump.js", { maxDepth: args.max_depth, filter: args.filter ?? "" }))
      .catch((e) => ({ ok: false, error: String(e) }));
    return result as Record<string, unknown>;
  });
}

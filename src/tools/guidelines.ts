import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDELINES_DIR = path.join(ROOT, "guidelines");
const HELPERS_DIR = path.join(ROOT, "helpers");

export const GUIDELINE_TOPICS = [
  "workflow",
  "general",
  "texturing",
  "threejs",
  "canvas2d",
  "webgl",
  "art2d",
  "pixelart",
  "gamedev",
  "helpers",
] as const;
export type GuidelineTopic = (typeof GUIDELINE_TOPICS)[number];

export const guidelinesShape = {
  topic: z.enum(GUIDELINE_TOPICS).describe(
    "workflow = the write→render→validate loop and server conventions (START HERE); general = 3D modeling craft; " +
      "texturing = procedural textures/UVs; threejs/canvas2d/webgl = per-tech 3D pitfalls; " +
      "art2d = flat 2D illustration + game UI/HUD; pixelart = pixel-art craft, palettes and animation; " +
      "gamedev = 2D/3D games: game loop, input, collision, playtesting with interact_scene, multi-file structure; " +
      "helpers = helper library source code"
  ),
};

export const HELPER_FILES = [
  "three-helpers.js",
  "canvas3d.js",
  "webgl-helpers.js",
  "texture-helpers.js",
  "draw2d.js",
  "pixel-helpers.js",
  "game2d.js",
  "game3d.js",
] as const;

export function getGuideline(topic: GuidelineTopic): string {
  if (topic === "helpers") {
    return HELPER_FILES.map((f) => `// ==== /__helpers/${f} ====\n\n${readHelper(f)}`).join("\n\n");
  }
  return readFileSync(path.join(GUIDELINES_DIR, `${topic}.md`), "utf8");
}

export function readHelper(file: string): string {
  return readFileSync(path.join(HELPERS_DIR, file), "utf8");
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDELINES_DIR = path.join(ROOT, "guidelines");
const HELPERS_DIR = path.join(ROOT, "helpers");

export const GUIDELINE_TOPICS = ["workflow", "general", "texturing", "threejs", "canvas2d", "webgl", "helpers"] as const;
export type GuidelineTopic = (typeof GUIDELINE_TOPICS)[number];

export const guidelinesShape = {
  topic: z.enum(GUIDELINE_TOPICS).describe(
    "workflow = the write→render→validate loop and server conventions (START HERE); general = modeling craft; " +
      "texturing = procedural textures/UVs; threejs/canvas2d/webgl = per-tech pitfalls; helpers = helper library source code"
  ),
};

export const HELPER_FILES = ["three-helpers.js", "canvas3d.js", "webgl-helpers.js", "texture-helpers.js"] as const;

export function getGuideline(topic: GuidelineTopic): string {
  if (topic === "helpers") {
    return HELPER_FILES.map((f) => `// ==== /__helpers/${f} ====\n\n${readHelper(f)}`).join("\n\n");
  }
  return readFileSync(path.join(GUIDELINES_DIR, `${topic}.md`), "utf8");
}

export function readHelper(file: string): string {
  return readFileSync(path.join(HELPERS_DIR, file), "utf8");
}

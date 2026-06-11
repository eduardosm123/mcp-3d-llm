/** Direct smoke test of the render pipeline (no MCP layer). */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { renderScene } from "../src/tools/render.js";
import { closeBrowser } from "../src/browser/manager.js";

const file = process.argv[2] ?? path.resolve("examples/good-threejs-robot.html");
const outDir = path.resolve("scripts/.smoke-out");
mkdirSync(outDir, { recursive: true });

const frames = Number(process.argv[3] ?? 1);

const result = await renderScene({
  file_path: file,
  views: ["front", "three-quarter", "side", "top"],
  animation_frames: frames,
  frame_interval_ms: 250,
  format: "jpeg",
  width: 800,
  height: 600,
  settle_frames: 10,
  extra_wait_ms: 0,
  timeout_ms: 20000,
});

console.log(JSON.stringify(result.meta, null, 2));
for (const img of result.images) {
  const out = path.join(outDir, `${img.name}.${result.format === "jpeg" ? "jpg" : "png"}`);
  writeFileSync(out, img.buffer);
  console.log(`${img.name}: ${img.buffer.length} bytes (${img.target}) -> ${out}`);
}
await closeBrowser();

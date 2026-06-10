import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderScene, renderSceneShape, type RenderArgs } from "./tools/render.js";
import { validateScene, validateSceneShape, type ValidateArgs } from "./tools/validate.js";
import { inspectScene, inspectSceneShape, type InspectArgs } from "./tools/inspect.js";
import {
  getGuideline,
  guidelinesShape,
  GUIDELINE_TOPICS,
  HELPER_FILES,
  readHelper,
  type GuidelineTopic,
} from "./tools/guidelines.js";
import { SceneError } from "./browser/session.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function textBlock(value: unknown): Content {
  return { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
}

function errorResult(e: unknown): { content: Content[]; isError: true } {
  const message = e instanceof SceneError ? e.message : `Unexpected error: ${e instanceof Error ? e.stack : String(e)}`;
  return { content: [textBlock(message)], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "canvas3d", version: "0.1.0" });

  server.registerTool(
    "render_scene",
    {
      title: "Render a 3D canvas scene and see it from multiple angles",
      description:
        "Renders an HTML file containing a 3D <canvas> scene (Three.js, raw WebGL or Canvas 2D) in a headless browser " +
        "and returns screenshots from multiple camera angles, so you can SEE what you built. " +
        "ALWAYS call this after writing or editing scene HTML, look hard at every angle, fix problems and render again. " +
        "Multi-angle needs window.__scene (Three.js) or window.__setView (other tech) — call get_guidelines topic 'workflow' first if unsure. " +
        "Use distance_factor < 1 in a custom view for close-ups of textures/details.",
      inputSchema: renderSceneShape,
    },
    async (args) => {
      try {
        const result = await renderScene(args as RenderArgs);
        const content: Content[] = [textBlock(result.meta)];
        for (const img of result.images) {
          content.push(textBlock(`view: ${img.name}`));
          content.push({
            type: "image",
            data: img.buffer.toString("base64"),
            mimeType: result.format === "jpeg" ? "image/jpeg" : "image/png",
          });
        }
        return { content };
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "validate_scene",
    {
      title: "Run structured diagnostics on a 3D canvas scene",
      description:
        "Loads the scene HTML and returns a JSON report: page/console errors, blank-canvas and detail analysis of the " +
        "rendered pixels, and — when window.__scene is registered (Three.js) — deep scene-graph checks: floating objects, " +
        "missing lights, out-of-frustum meshes, NaN transforms, missing UVs/normals, camera clipping, texture problems. " +
        "Each issue has a severity and a concrete fix suggestion. Fix errors first, then warnings. " +
        "Call this after render_scene whenever something looks wrong, and at least once before declaring the scene done.",
      inputSchema: validateSceneShape,
    },
    async (args) => {
      try {
        const result = await validateScene(args as ValidateArgs);
        const content: Content[] = [textBlock(result.report)];
        if (result.screenshot) {
          content.push({
            type: "image",
            data: result.screenshot.buffer.toString("base64"),
            mimeType: "image/png",
          });
        }
        return { content };
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "inspect_scene",
    {
      title: "Dump the Three.js scene graph with world-space data",
      description:
        "Returns the scene tree (names, types, positions, rotations, world bounding boxes, geometry and material info) " +
        "for a scene that registers window.__scene. Use it to reason about EXACT placement and sizes when fixing issues " +
        "reported by validate_scene (e.g. which Y puts the hat on the head). Three.js only.",
      inputSchema: inspectSceneShape,
    },
    async (args) => {
      try {
        return { content: [textBlock(await inspectScene(args as InspectArgs))] };
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "get_guidelines",
    {
      title: "Get 3D modeling guidelines and helper library docs",
      description:
        "Returns curated guides for building good 3D canvas scenes. Call topic 'workflow' BEFORE writing your first scene " +
        "— it explains the write→render→validate loop, the helper libraries served at /__helpers/, and the conventions " +
        "(window.__scene / __setView / __ready) that unlock multi-angle screenshots and deep validation.",
      inputSchema: guidelinesShape,
    },
    async (args) => {
      try {
        return { content: [textBlock(getGuideline(args.topic as GuidelineTopic))] };
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  for (const topic of GUIDELINE_TOPICS) {
    server.registerResource(
      `guidelines-${topic}`,
      `guidelines://${topic}`,
      { title: `3D canvas guidelines: ${topic}`, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: getGuideline(topic) }] })
    );
  }
  for (const file of HELPER_FILES) {
    server.registerResource(
      `helpers-${file}`,
      `helpers://${file}`,
      { title: `Helper library source: ${file}`, mimeType: "text/javascript" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/javascript", text: readHelper(file) }] })
    );
  }

  return server;
}

import type { ImageStats } from "./image.js";
import type { Issue, PageLog, ProbeSnapshot } from "../types.js";

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function sortIssues(issues: Issue[]): Issue[] {
  return issues.slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

const IMAGE_URL = /\.(png|jpe?g|gif|webp|svg|ktx2|hdr|exr|basis)(\?|$)/i;

/** Issues derivable from page logs and the probe — tech-agnostic. */
export function pageIssues(log: PageLog, snapshot: ProbeSnapshot, notes: string[]): Issue[] {
  const issues: Issue[] = [];

  for (const err of log.page_errors.slice(0, 5)) {
    issues.push({
      id: "PAGE_ERROR",
      severity: "error",
      message: `Uncaught exception: ${err}`,
      suggestion: "Fix the JavaScript error — the scene setup likely stopped at this point.",
    });
  }
  for (const err of log.console_errors.slice(0, 5)) {
    issues.push({
      id: "CONSOLE_ERROR",
      severity: "error",
      message: `console.error: ${err}`,
      suggestion: "Resolve the logged error.",
    });
  }
  for (const req of log.failed_requests.slice(0, 8)) {
    const isImage = IMAGE_URL.test(req);
    issues.push({
      id: isImage ? "TEXTURE_LOAD_FAILED" : "REQUEST_FAILED",
      severity: isImage ? "error" : "warning",
      message: `Failed request: ${req}`,
      suggestion: isImage
        ? "External texture failed to load. Prefer procedural textures (TEX from /__helpers/texture-helpers.js) — they never depend on the network."
        : "Check the URL; if it is a CDN library, the network may be unavailable.",
    });
  }
  for (const err of snapshot.contextCreationErrors) {
    issues.push({
      id: "WEBGL_CONTEXT_ERROR",
      severity: "error",
      message: `WebGL context creation failed: ${err}`,
      suggestion: "The environment may lack GPU/WebGL support — try a simpler context or canvas 2D.",
    });
  }
  if (snapshot.contextLost) {
    issues.push({
      id: "WEBGL_CONTEXT_LOST",
      severity: "error",
      message: "The WebGL context was lost while rendering.",
      suggestion: "The scene may be too heavy for the (software) GPU — reduce geometry/texture sizes.",
    });
  }
  if (snapshot.canvases.length === 0) {
    issues.push({
      id: "NO_CANVAS",
      severity: "error",
      message: "The page never created a rendering context on any <canvas>.",
      suggestion: "Make sure the HTML creates a <canvas> and calls getContext (or a library does it).",
    });
  }
  for (const note of notes) {
    if (note.includes("unresponsive") || note.includes("did not settle") || note.includes("did not finish")) {
      issues.push({
        id: "RENDER_TIMEOUT",
        severity: "error",
        message: note,
        suggestion: "Avoid blocking loops; do continuous animation with requestAnimationFrame.",
      });
    }
  }
  return issues;
}

/** Issues from the screenshot pixel analysis — tech-agnostic. */
export function imageIssues(stats: ImageStats, snapshot: ProbeSnapshot): Issue[] {
  const issues: Issue[] = [];
  if (stats.verdict === "blank") {
    issues.push({
      id: "BLANK_CANVAS",
      severity: "error",
      message: `The rendered image is a single flat color (${stats.background_color}) — nothing is visible.`,
      suggestion:
        snapshot.engine === "webgl" && !snapshot.rafTicked
          ? "Likely the WebGL buffer was presented and discarded before capture: render inside a requestAnimationFrame loop or expose window.__redraw."
          : "Check camera position/direction, object placement and lighting — the scene is rendering nothing.",
    });
  } else if (stats.verdict === "nearly-blank") {
    issues.push({
      id: "NEARLY_BLANK",
      severity: "warning",
      message: `Only ${stats.coverage_pct}% of pixels differ from the background — the scene is barely visible.`,
      suggestion: "The camera may be too far away or most objects may be out of view. Frame the scene tighter.",
    });
  } else if (stats.verdict === "low-detail") {
    issues.push({
      id: "LOW_DETAIL",
      severity: "info",
      message: `Image has low visual richness (${stats.unique_colors} distinct colors, edge density ${stats.edge_density}).`,
      suggestion:
        "Consider more geometry detail, textures (TEX helpers), color variety and directional lighting with shading contrast.",
    });
  }
  return issues;
}

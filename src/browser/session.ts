import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright";
import { getBrowser } from "./manager.js";
import { serveDirectory } from "./staticServer.js";
import { injectedScript, callInjected } from "../probe/loader.js";
import type { PageLog, ProbeSnapshot, RenderOptions } from "../types.js";

const HELPERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "helpers");

export interface Session {
  page: Page;
  log: PageLog;
  snapshot: ProbeSnapshot;
  /** Non-fatal notes accumulated during the session (timeouts, fallbacks). */
  notes: string[];
}

export class SceneError extends Error {}

/**
 * Opens the HTML file in a fresh context, waits for the scene to settle and
 * hands a live Session to `fn`. Everything is wrapped in a hard outer timeout
 * (timeout_ms + grace) that force-closes the context, so a wedged page
 * (infinite loop) can never hang the server.
 */
export async function withScene<T>(
  filePath: string,
  opts: RenderOptions,
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const absPath = path.resolve(filePath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw new SceneError(`File not found: ${absPath}`);
  }
  if (!stat.isFile() || !/\.html?$/i.test(absPath)) {
    throw new SceneError(`Expected a path to an .html file, got: ${absPath}`);
  }

  const server = await serveDirectory(path.dirname(absPath), HELPERS_DIR);
  const browser = await getBrowser();
  let context: BrowserContext | null = null;

  const hardTimeoutMs = opts.timeout_ms + 5000;
  let hardTimer: NodeJS.Timeout | undefined;
  const hardTimeout = new Promise<never>((_, reject) => {
    hardTimer = setTimeout(() => {
      context?.close().catch(() => {});
      reject(
        new SceneError(
          `Page unresponsive after ${hardTimeoutMs}ms (likely an infinite loop or extremely heavy scene). ` +
            `Check for while(true)-style loops or reduce scene complexity.`
        )
      );
    }, hardTimeoutMs);
  });

  const run = async (): Promise<T> => {
    context = await browser.newContext({ viewport: { width: opts.width, height: opts.height } });
    context.setDefaultTimeout(opts.timeout_ms);
    await context.addInitScript(injectedScript("init-probe.js"));

    const page = await context.newPage();
    const log: PageLog = { console_errors: [], console_warnings: [], page_errors: [], failed_requests: [] };
    const notes: string[] = [];

    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error") log.console_errors.push(clip(msg.text()));
      else if (type === "warning") log.console_warnings.push(clip(msg.text()));
    });
    page.on("pageerror", (err) => log.page_errors.push(clip(err.message)));
    page.on("requestfailed", (req) => {
      log.failed_requests.push(clip(`${req.url()} — ${req.failure()?.errorText ?? "failed"}`));
    });

    const fileUrl = `${server.baseUrl}/${encodeURIComponent(path.basename(absPath))}`;

    const loadAndSettle = async () => {
      try {
        await page.goto(fileUrl, { waitUntil: "load", timeout: opts.timeout_ms });
      } catch {
        notes.push(`Page load did not finish within ${opts.timeout_ms}ms; continuing with whatever rendered.`);
      }
      try {
        await page.evaluate(
          callInjected("settle.js", {
            frames: opts.settle_frames,
            readyCapMs: Math.min(opts.timeout_ms, 10000),
          })
        );
      } catch {
        notes.push("Scene did not settle (rAF frames never completed) — page may be blocked or crashed.");
      }
      if (opts.extra_wait_ms > 0) await page.waitForTimeout(opts.extra_wait_ms);

      try {
        return (await page.evaluate(callInjected("snapshot.js"))) as ProbeSnapshot;
      } catch {
        notes.push("Could not inspect the page (snapshot failed) — page may be blocked or crashed.");
        return {
          engine: "none",
          deep: false,
          hasSetView: false,
          hasRedraw: false,
          rafTicked: false,
          canvases: [],
          contextCreationErrors: [],
          contextLost: false,
          mode: null,
          pix: null,
        } satisfies ProbeSnapshot;
      }
    };

    let snapshot = await loadAndSettle();
    if (snapshot.contextLost) {
      // GPU-process startup race can kill the first WebGL context (see
      // manager.warmUpGpu). One reload on a now-warm GPU usually recovers.
      log.console_warnings.length = 0;
      snapshot = await loadAndSettle();
      if (!snapshot.contextLost) {
        notes.push("The WebGL context was lost on first load (GPU warm-up race) — the page was reloaded and recovered.");
      }
    }

    return fn({ page, log, snapshot, notes });
  };

  try {
    return await Promise.race([run(), hardTimeout]);
  } finally {
    clearTimeout(hardTimer);
    await (context as BrowserContext | null)?.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/**
 * Screenshots the largest canvas on the page (the scene), falling back to a
 * full-page screenshot when no canvas exists. Returns the image buffer and
 * which strategy was used.
 */
export async function captureCanvas(
  session: Session,
  opts: RenderOptions
): Promise<{ buffer: Buffer; target: "canvas" | "page" }> {
  const { page } = session;
  const handle = await page
    .evaluateHandle(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      if (canvases.length === 0) return null;
      canvases.sort((a, b) => b.width * b.height - a.width * a.height);
      return canvases[0];
    })
    .catch(() => null);

  const shotOpts =
    opts.format === "jpeg" ? ({ type: "jpeg", quality: 80 } as const) : ({ type: "png" } as const);

  const element = handle?.asElement();
  if (element) {
    try {
      const buffer = await element.screenshot({ ...shotOpts, timeout: opts.timeout_ms });
      return { buffer, target: "canvas" };
    } catch {
      session.notes.push("Canvas element screenshot failed; captured the full page instead.");
    }
  }
  const buffer = await page.screenshot({ ...shotOpts, timeout: opts.timeout_ms });
  return { buffer, target: "page" };
}

function clip(s: string): string {
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}

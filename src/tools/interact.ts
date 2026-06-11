import { z } from "zod";
import { withScene, captureCanvas } from "../browser/session.js";
import { renderOptionsShape } from "./render.js";
import type { RenderOptions } from "../types.js";

const stepSchema = z.union([
  z.object({
    action: z.literal("key"),
    key: z.string().describe('Playwright key name: "ArrowRight", "Space", "w", "Enter"...'),
    hold_ms: z.number().int().min(0).max(10000).optional().describe("Hold duration (keydown→wait→keyup). Default: a single tap"),
  }),
  z.object({ action: z.literal("keydown"), key: z.string() }).describe("Press and keep held (for combos)"),
  z.object({ action: z.literal("keyup"), key: z.string() }),
  z.object({
    action: z.literal("click"),
    x: z.number().describe("Canvas-relative x"),
    y: z.number().describe("Canvas-relative y"),
    button: z.enum(["left", "right", "middle"]).optional(),
  }),
  z.object({ action: z.literal("move"), x: z.number(), y: z.number() }).describe("Move mouse over the canvas"),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(16).max(15000) }),
  z.object({ action: z.literal("screenshot"), label: z.string().optional() }),
  z.object({ action: z.literal("read_state") }).describe(
    "Returns the game's window.__state() (the game must expose it: window.__state = () => ({score, player: {...}}))"
  ),
]);

export const interactSceneShape = {
  file_path: z.string().describe("Absolute path to the game's .html entry file"),
  script: z.array(stepSchema).min(1).max(60).describe(
    "Playtest script, executed in order. Take screenshots and read_state between actions to verify the gameplay actually works."
  ),
  format: z.enum(["jpeg", "png"]).default("jpeg"),
  ...renderOptionsShape,
};

export type InteractStep = z.infer<typeof stepSchema>;

export interface InteractArgs {
  file_path: string;
  script: InteractStep[];
  format: "jpeg" | "png";
  width: number;
  height: number;
  settle_frames: number;
  extra_wait_ms: number;
  timeout_ms: number;
}

interface ShotEntry {
  label: string;
  buffer: Buffer;
}

export interface InteractResult {
  meta: Record<string, unknown>;
  shots: ShotEntry[];
  format: "jpeg" | "png";
}

export async function interactScene(args: InteractArgs): Promise<InteractResult> {
  const opts: RenderOptions = {
    width: args.width,
    height: args.height,
    settle_frames: args.settle_frames,
    extra_wait_ms: args.extra_wait_ms,
    timeout_ms: args.timeout_ms,
    format: args.format,
  };

  return withScene(args.file_path, opts, async (session) => {
    const { page, log, notes, snapshot } = session;
    const shots: ShotEntry[] = [];
    const states: Array<{ step: number; state: unknown }> = [];
    const executed: string[] = [];

    // canvas origin for canvas-relative mouse coordinates
    const canvasBox = await page
      .evaluate(() => {
        const canvases = Array.from(document.querySelectorAll("canvas"));
        if (!canvases.length) return null;
        canvases.sort((a, b) => b.width * b.height - a.width * a.height);
        const r = canvases[0].getBoundingClientRect();
        return { left: r.left, top: r.top };
      })
      .catch(() => null);
    const toPage = (x: number, y: number) => ({
      x: (canvasBox?.left ?? 0) + x,
      y: (canvasBox?.top ?? 0) + y,
    });

    // frame counter for an FPS estimate (init-probe wraps rAF)
    await page
      .evaluate(`(() => {
        window.__c3dFrameCount = 0;
        const orig = window.requestAnimationFrame;
        window.requestAnimationFrame = function (cb) {
          return orig.call(window, function (t) { window.__c3dFrameCount++; return cb(t); });
        };
      })()`)
      .catch(() => {});
    const fpsStart = Date.now();

    let stepIndex = 0;
    for (const step of args.script) {
      stepIndex++;
      try {
        switch (step.action) {
          case "key":
            if (step.hold_ms) {
              await page.keyboard.down(step.key);
              await page.waitForTimeout(step.hold_ms);
              await page.keyboard.up(step.key);
            } else {
              await page.keyboard.press(step.key);
            }
            executed.push(`#${stepIndex} key ${step.key}${step.hold_ms ? ` (${step.hold_ms}ms)` : ""}`);
            break;
          case "keydown":
            await page.keyboard.down(step.key);
            executed.push(`#${stepIndex} keydown ${step.key}`);
            break;
          case "keyup":
            await page.keyboard.up(step.key);
            executed.push(`#${stepIndex} keyup ${step.key}`);
            break;
          case "click": {
            const p = toPage(step.x, step.y);
            await page.mouse.click(p.x, p.y, { button: step.button ?? "left" });
            executed.push(`#${stepIndex} click (${step.x}, ${step.y})`);
            break;
          }
          case "move": {
            const p = toPage(step.x, step.y);
            await page.mouse.move(p.x, p.y);
            executed.push(`#${stepIndex} move (${step.x}, ${step.y})`);
            break;
          }
          case "wait":
            await page.waitForTimeout(step.ms);
            executed.push(`#${stepIndex} wait ${step.ms}ms`);
            break;
          case "screenshot": {
            const shot = await captureCanvas(session, opts);
            shots.push({ label: step.label ?? `step-${stepIndex}`, buffer: shot.buffer });
            executed.push(`#${stepIndex} screenshot "${step.label ?? `step-${stepIndex}`}"`);
            break;
          }
          case "read_state": {
            const state = await page.evaluate(
              `typeof window.__state === "function" ? window.__state() : "__state not exposed — add window.__state = () => ({...}) to the game"`
            );
            states.push({ step: stepIndex, state });
            executed.push(`#${stepIndex} read_state`);
            break;
          }
        }
      } catch (e) {
        notes.push(`Step #${stepIndex} (${step.action}) failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    }

    if (shots.length === 0) {
      const shot = await captureCanvas(session, opts);
      shots.push({ label: "final", buffer: shot.buffer });
    }

    const elapsed = (Date.now() - fpsStart) / 1000;
    const frames = (await page.evaluate("window.__c3dFrameCount ?? 0").catch(() => 0)) as number;
    const fps = elapsed > 0.3 ? Math.round(frames / elapsed) : null;
    if (fps !== null && fps < 30 && snapshot.rafTicked) {
      notes.push(`Low frame rate (~${fps} fps) — the game loop may be too heavy.`);
    }
    if (!snapshot.rafTicked) {
      notes.push("The page never used requestAnimationFrame — is there a game loop running?");
    }

    const meta = {
      engine: snapshot.engine,
      mode: snapshot.mode,
      steps_executed: executed,
      states,
      fps_estimate: fps,
      console_errors: log.console_errors.slice(0, 10),
      page_errors: log.page_errors.slice(0, 10),
      failed_requests: log.failed_requests.slice(0, 10),
      notes,
    };
    return { meta, shots, format: args.format };
  });
}

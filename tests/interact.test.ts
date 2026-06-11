import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { interactScene, type InteractStep } from "../src/tools/interact.js";
import { validateScene } from "../src/tools/validate.js";
import { closeBrowser } from "../src/browser/manager.js";

const DEFAULTS = {
  format: "png" as const,
  width: 800,
  height: 600,
  settle_frames: 10,
  extra_wait_ms: 0,
  timeout_ms: 30000,
};

const example = (name: string) => path.resolve("examples", name);

interface PlayerState2D {
  score: number;
  player: { x: number; y: number; grounded: boolean };
}

afterAll(async () => {
  await closeBrowser();
});

describe("interact_scene", () => {
  it("2d platformer (multi-file): player moves right and jumps on input", async () => {
    const script: InteractStep[] = [
      { action: "wait", ms: 300 },
      { action: "read_state" },
      { action: "key", key: "ArrowRight", hold_ms: 600 },
      { action: "read_state" },
      { action: "key", key: "Space" },
      { action: "wait", ms: 200 },
      { action: "screenshot", label: "mid-air" },
      { action: "read_state" },
    ];
    const result = await interactScene({ ...DEFAULTS, script, file_path: example("platformer-2d/index.html") });

    expect(result.meta.page_errors).toEqual([]);
    expect(result.meta.console_errors).toEqual([]);
    const states = (result.meta.states as Array<{ state: PlayerState2D }>).map((s) => s.state);
    expect(states).toHaveLength(3);
    expect(states[1].player.x).toBeGreaterThan(states[0].player.x + 40); // walked right
    expect(states[2].player.y).toBeLessThan(states[1].player.y - 5); // jumped (y up is negative)
    expect(result.shots.map((s) => s.label)).toContain("mid-air");
  });

  it("2d platformer: walking into a coin increases the score", async () => {
    // player starts at the 'p' marker with a coin 'c' to the right on the same ledge
    const script: InteractStep[] = [
      { action: "wait", ms: 300 },
      { action: "key", key: "ArrowRight", hold_ms: 2500 },
      { action: "read_state" },
    ];
    const result = await interactScene({ ...DEFAULTS, script, file_path: example("platformer-2d/index.html") });
    const states = (result.meta.states as Array<{ state: { score: number } }>).map((s) => s.state);
    expect(states[0].score).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("3d collect game: WASD moves the player on the ground plane", async () => {
    const script: InteractStep[] = [
      { action: "wait", ms: 400 },
      { action: "read_state" },
      { action: "key", key: "d", hold_ms: 700 },
      { action: "key", key: "w", hold_ms: 700 },
      { action: "read_state" },
      { action: "screenshot", label: "after move" },
    ];
    const result = await interactScene({ ...DEFAULTS, script, file_path: example("game-3d-collect.html") });

    expect(result.meta.page_errors).toEqual([]);
    const states = (result.meta.states as Array<{ state: { player: { x: number; z: number } } }>).map(
      (s) => s.state
    );
    const moved =
      Math.abs(states[1].player.x - states[0].player.x) + Math.abs(states[1].player.z - states[0].player.z);
    expect(moved).toBeGreaterThan(2);
  }, 60000);

  it("reports a helpful message when __state is missing", async () => {
    const result = await interactScene({
      ...DEFAULTS,
      script: [{ action: "read_state" }],
      file_path: example("good-threejs-robot.html"),
    });
    const states = result.meta.states as Array<{ state: unknown }>;
    expect(String(states[0].state)).toContain("__state not exposed");
  });
});

describe("game examples validate cleanly", () => {
  const VOPTS = { include_screenshot: false, ...DEFAULTS };

  it("platformer", async () => {
    const { report } = await validateScene({ ...VOPTS, file_path: example("platformer-2d/index.html") });
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("2d");
  });

  it("3d collect", async () => {
    const { report } = await validateScene({ ...VOPTS, file_path: example("game-3d-collect.html") });
    expect(report.ok).toBe(true);
    expect(report.engine).toBe("threejs-deep");
  });
});

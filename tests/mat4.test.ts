import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// webgl-helpers.js is a browser script attaching to `window` — load it with a stub.
function loadGLH(): any {
  const src = readFileSync(path.resolve("helpers/webgl-helpers.js"), "utf8");
  const windowStub: Record<string, unknown> = {};
  new Function("window", "document", src)(windowStub, undefined);
  return windowStub.GLH;
}

const GLH = loadGLH();
const { mat4 } = GLH;

function expectClose(actual: Float32Array, expected: number[], tol = 1e-5) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThan(tol);
  }
}

describe("GLH.mat4", () => {
  it("identity multiplication is a no-op", () => {
    const t = mat4.translate(mat4.identity(), 2, 3, 4);
    expectClose(mat4.multiply(mat4.identity(), t), Array.from(t));
    expectClose(mat4.multiply(t, mat4.identity()), Array.from(t));
  });

  it("translate stores the offset in the last column (column-major)", () => {
    const t = mat4.translate(mat4.identity(), 2, 3, 4);
    expect(t[12]).toBe(2);
    expect(t[13]).toBe(3);
    expect(t[14]).toBe(4);
  });

  it("rotateY(90°) maps +Z to +X", () => {
    const r = mat4.rotateY(mat4.identity(), 90);
    // column-major: v' = M v, with v = (0,0,1,0) → third column
    const vx = r[8];
    const vy = r[9];
    const vz = r[10];
    expect(Math.abs(vx - 1)).toBeLessThan(1e-6);
    expect(Math.abs(vy)).toBeLessThan(1e-6);
    expect(Math.abs(vz)).toBeLessThan(1e-6);
  });

  it("translate then scale composes in call order", () => {
    // M = T * S → applies scale first, then translation
    const m = mat4.scale(mat4.translate(mat4.identity(), 1, 0, 0), 2);
    // point (1,0,0): scale → (2,0,0); translate → (3,0,0)
    const x = m[0] * 1 + m[4] * 0 + m[8] * 0 + m[12];
    expect(x).toBe(3);
  });

  it("lookAt from +Z towards origin keeps +X to the right", () => {
    const v = mat4.lookAt([0, 0, 5], [0, 0, 0]);
    // camera-space of world point (1,0,0) should be (1,0,*)
    const cx = v[0] * 1 + v[4] * 0 + v[8] * 0 + v[12];
    const cy = v[1] * 1 + v[5] * 0 + v[9] * 0 + v[13];
    const cz = v[2] * 1 + v[6] * 0 + v[10] * 0 + v[14];
    expect(Math.abs(cx - 1)).toBeLessThan(1e-6);
    expect(Math.abs(cy)).toBeLessThan(1e-6);
    expect(Math.abs(cz - -5)).toBeLessThan(1e-6);
  });

  it("perspective puts -near on the near plane at z=-1 (NDC)", () => {
    const p = mat4.perspective(90, 1, 1, 100);
    // point at z = -near: clip = P * (0,0,-1,1)
    const clipZ = p[2] * 0 + p[6] * 0 + p[10] * -1 + p[14];
    const clipW = p[3] * 0 + p[7] * 0 + p[11] * -1 + p[15];
    expect(Math.abs(clipZ / clipW - -1)).toBeLessThan(1e-6);
  });
});

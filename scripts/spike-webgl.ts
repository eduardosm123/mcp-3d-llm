/**
 * Fase 0 spike: verifica nesta máquina (Windows 11, Chromium headless via Playwright):
 *  1. WebGL funciona? Com quais flags?
 *  2. Three.js via CDN importmap carrega e renderiza?
 *  3. O screenshot do elemento <canvas> captura o framebuffer WebGL (não preto)?
 *
 * Uso: npm run spike:webgl
 */
import { chromium, type Browser } from "playwright";
import { PNG } from "pngjs";

const RAW_WEBGL_HTML = `<!DOCTYPE html>
<html><body style="margin:0">
<canvas id="c" width="320" height="240"></canvas>
<script>
  const canvas = document.getElementById("c");
  const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");
  if (!gl) {
    window.__result = { ok: false, error: "getContext returned null" };
  } else {
    gl.clearColor(0.9, 0.2, 0.2, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    window.__result = {
      ok: true,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION)
    };
  }
</script>
</body></html>`;

const THREE_CDN_HTML = `<!DOCTYPE html>
<html><head>
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.js" } }
</script>
</head><body style="margin:0">
<canvas id="c" width="320" height="240"></canvas>
<script type="module">
  try {
    const THREE = await import("three");
    const canvas = document.getElementById("c");
    const renderer = new THREE.WebGLRenderer({ canvas });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202040);
    const camera = new THREE.PerspectiveCamera(50, 320 / 240, 0.1, 100);
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0, 0);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x44cc88 })
    );
    scene.add(mesh);
    scene.add(new THREE.DirectionalLight(0xffffff, 2));
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    renderer.render(scene, camera);
    window.__result = { ok: true, revision: THREE.REVISION };
  } catch (e) {
    window.__result = { ok: false, error: String(e) };
  }
</script>
</body></html>`;

function analyzePng(buf: Buffer): { mean: number; variance: number } {
  const png = PNG.sync.read(buf);
  let sum = 0;
  let sumSq = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const lum = (png.data[off] + png.data[off + 1] + png.data[off + 2]) / 3;
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / n;
  return { mean, variance: sumSq / n - mean * mean };
}

async function tryFlagSet(name: string, args: string[]): Promise<boolean> {
  let browser: Browser | undefined;
  console.log(`\n=== Flag set: ${name} (${args.join(" ") || "no flags"}) ===`);
  try {
    browser = await chromium.launch({ headless: true, args });
    const page = await browser.newPage();

    // 1. Raw WebGL
    await page.setContent(RAW_WEBGL_HTML, { waitUntil: "load" });
    const rawResult = await page.waitForFunction(() => (window as any).__result).then((h) => h.jsonValue());
    console.log("raw webgl:", JSON.stringify(rawResult));
    if (!rawResult.ok) return false;

    const rawShot = await page.locator("#c").screenshot({ type: "png" });
    const rawStats = analyzePng(rawShot);
    const rawRed = rawStats.mean > 40; // clear vermelho ~ (230,51,51) → lum ~111
    console.log(`raw screenshot: mean=${rawStats.mean.toFixed(1)} variance=${rawStats.variance.toFixed(1)} nonblack=${rawRed}`);
    if (!rawRed) return false;

    // 2. Three.js via CDN
    const page2 = await browser.newPage();
    await page2.setContent(THREE_CDN_HTML, { waitUntil: "load" });
    const threeResult = await page2
      .waitForFunction(() => (window as any).__result, undefined, { timeout: 20000 })
      .then((h) => h.jsonValue());
    console.log("three.js cdn:", JSON.stringify(threeResult));
    if (!threeResult.ok) return false;

    const threeShot = await page2.locator("#c").screenshot({ type: "png" });
    const threeStats = analyzePng(threeShot);
    const hasContent = threeStats.variance > 10; // fundo + cubo iluminado → variação real
    console.log(`three screenshot: mean=${threeStats.mean.toFixed(1)} variance=${threeStats.variance.toFixed(1)} hasContent=${hasContent}`);
    return hasContent;
  } catch (e) {
    console.log("FAILED:", e instanceof Error ? e.message.split("\n")[0] : String(e));
    return false;
  } finally {
    await browser?.close();
  }
}

const flagSets: Array<[string, string[]]> = [
  ["default", []],
  ["angle-swiftshader", ["--use-angle=swiftshader"]],
  ["angle-swiftshader+unsafe", ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]],
];

for (const [name, args] of flagSets) {
  const ok = await tryFlagSet(name, args);
  if (ok) {
    console.log(`\n>>> SUCCESS with flag set "${name}": ${JSON.stringify(args)}`);
    process.exit(0);
  }
}
console.log("\n>>> ALL FLAG SETS FAILED — headless WebGL needs investigation");
process.exit(1);

import { chromium, type Browser } from "playwright";

// Spike (scripts/spike-webgl.ts) confirmed headless WebGL works on this
// machine with no extra flags (SwiftShader). Override via CANVAS3D_BROWSER_ARGS
// (space-separated) if a different machine needs them.
let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null;
  }
  browserPromise = (async () => {
    const browser = await chromium.launch({
      headless: true,
      args: process.env.CANVAS3D_BROWSER_ARGS?.split(/\s+/).filter(Boolean) ?? [],
    });
    await warmUpGpu(browser);
    return browser;
  })();
  return browserPromise;
}

/**
 * WebGL contexts created in the first ~100ms after browser launch get lost
 * while the GPU process (SwiftShader) spins up — observed deterministically on
 * Windows 11 headless. Create sacrificial contexts until one survives.
 */
async function warmUpGpu(browser: Browser): Promise<void> {
  try {
    const page = await browser.newPage();
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.setContent(
        `<canvas id="c" width="64" height="64"></canvas>
         <script>window.__gl = document.getElementById("c").getContext("webgl2");</script>`
      );
      await page.waitForTimeout(250);
      const ok = await page.evaluate("window.__gl ? !window.__gl.isContextLost() : false");
      if (ok) break;
    }
    await page.close();
  } catch {
    // warmup is best-effort; the per-scene contextLost reload is the fallback
  }
}

export async function closeBrowser(): Promise<void> {
  const promise = browserPromise;
  browserPromise = null;
  if (promise) {
    const browser = await promise.catch(() => null);
    await browser?.close().catch(() => {});
  }
}

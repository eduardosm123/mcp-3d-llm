// Evaluated after page load. Waits for the scene to be "ready":
// awaits window.__ready (if the page exposes a promise), then a fixed number
// of rAF frames. Animating scenes never go idle, so settling is frame-count
// based, not idleness based.
(async ({ frames, readyCapMs }) => {
  if (window.__ready && typeof window.__ready.then === "function") {
    await Promise.race([window.__ready, new Promise((r) => setTimeout(r, readyCapMs))]);
  }
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  return true;
})

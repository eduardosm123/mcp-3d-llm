// Single-view fallback: ask the page to repaint right before capture so a
// "render once" WebGL scene isn't captured blank (drawing buffer already
// discarded). Uses window.__redraw if the page/helpers expose it.
(async () => {
  if (typeof window.__redraw === "function") {
    try {
      await window.__redraw();
    } catch (_) {
      /* best effort */
    }
    await new Promise((r) => requestAnimationFrame(() => r()));
    return true;
  }
  return false;
})

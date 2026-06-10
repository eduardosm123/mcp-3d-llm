// Hook-mode multi-view: delegates camera placement to the page's own
// window.__setView({name, azimuth_deg, elevation_deg, distance_factor}),
// then waits two rAF frames so the new frame is presented before capture.
(async (view) => {
  if (typeof window.__setView !== "function") {
    return { ok: false, error: "window.__setView is not a function" };
  }
  try {
    await window.__setView(view);
  } catch (e) {
    return { ok: false, error: "__setView threw: " + String(e) };
  }
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
  return { ok: true };
})

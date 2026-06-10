// Evaluated after settle: classifies the rendering tech and capabilities.
(() => {
  const p = window.__c3dProbe || { canvases: [], contextCreationErrors: [], contextLost: false, rafTicked: false };
  const reg = window.__scene;
  const deep = !!(reg && reg.scene && reg.camera && reg.renderer);

  let engine = "none";
  if (deep) {
    engine = "threejs";
  } else if (window.__THREE__ || window.THREE) {
    engine = "threejs-detected";
  } else if (p.canvases.some((c) => c.type.indexOf("webgl") === 0 && c.ok)) {
    engine = "webgl";
  } else if (p.canvases.some((c) => c.type === "2d" && c.ok)) {
    engine = "canvas2d";
  }

  return {
    engine,
    deep,
    hasSetView: typeof window.__setView === "function",
    hasRedraw: typeof window.__redraw === "function",
    rafTicked: p.rafTicked,
    canvases: p.canvases,
    contextCreationErrors: p.contextCreationErrors,
    contextLost: p.contextLost,
  };
})

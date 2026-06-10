// Injected via addInitScript BEFORE any page script runs.
// Records canvas/context activity so the server can detect the rendering tech.
(() => {
  const probe = {
    canvases: [],
    contextCreationErrors: [],
    contextLost: false,
    rafTicked: false,
  };
  window.__c3dProbe = probe;

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    // Capture robustness: force preserveDrawingBuffer so render-once WebGL
    // scenes don't screenshot blank, and always pass an attributes object
    // (a bare webgl2 context can get lost on cold SwiftShader starts).
    if (String(type).indexOf("webgl") === 0) {
      rest = [Object.assign({}, rest[0] || {}, { preserveDrawingBuffer: true })];
    }
    const ctx = origGetContext.call(this, type, ...rest);
    try {
      if (!this.__c3dSeen) {
        this.__c3dSeen = {};
      }
      if (!this.__c3dSeen[type]) {
        this.__c3dSeen[type] = true;
        probe.canvases.push({ type: String(type), ok: !!ctx, width: this.width, height: this.height });
        if (String(type).indexOf("webgl") === 0) {
          this.addEventListener("webglcontextcreationerror", (ev) => {
            probe.contextCreationErrors.push(ev.statusMessage || "unknown WebGL context creation error");
          });
          this.addEventListener("webglcontextlost", () => {
            probe.contextLost = true;
          });
        }
      }
    } catch (_) {
      /* never break the page */
    }
    return ctx;
  };

  const origRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return origRaf.call(window, function (t) {
      probe.rafTicked = true;
      return cb(t);
    });
  };
})();

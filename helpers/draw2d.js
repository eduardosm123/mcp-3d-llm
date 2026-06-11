// draw2d.js — layered 2D illustration + game-UI helpers over Canvas 2D.
// Include with: <script src="/__helpers/draw2d.js"></script>
//
//   const d = D2D.scene(document.getElementById("c"), { background: "#10101c" });
//   const sky = d.layer();
//   sky.rect({ x: 0, y: 0, w: 800, h: 600,
//              fill: D2D.linear(0, 0, 0, 600, [[0, "#0b1030"], [1, "#3a2a55"]]) });
//   const fg = d.layer();
//   fg.circle({ cx: 650, cy: 120, r: 50, fill: "#ffe9a8", shadow: { color: "#ffe9a8", blur: 40 } });
//   fg.poly([[0,600],[200,420],[420,600]], { fill: "#1c2a1c" });
//   D2D.ui.healthBar(d.layer(), { x: 20, y: 20, w: 220, h: 22, value: 0.7 });
//   d.render();
//
// Layers draw in creation order; each has its own transform (x, y, scale,
// rotate, alpha). Shapes are retained, so re-rendering (and animation via
// d.animate) replays them. Registers window.__mode = "2d" and window.__redraw.
(() => {
  "use strict";

  function resolveFill(ctx, fill) {
    if (!fill || typeof fill === "string") return fill;
    if (fill.__gradient === "linear") {
      const g = ctx.createLinearGradient(fill.x0, fill.y0, fill.x1, fill.y1);
      for (const [offset, color] of fill.stops) g.addColorStop(offset, color);
      return g;
    }
    if (fill.__gradient === "radial") {
      const g = ctx.createRadialGradient(fill.cx, fill.cy, fill.r0, fill.cx, fill.cy, fill.r1);
      for (const [offset, color] of fill.stops) g.addColorStop(offset, color);
      return g;
    }
    return fill;
  }

  function applyStyle(ctx, opts) {
    if (opts.shadow) {
      ctx.shadowColor = opts.shadow.color ?? "rgba(0,0,0,0.5)";
      ctx.shadowBlur = opts.shadow.blur ?? 8;
      ctx.shadowOffsetX = opts.shadow.dx ?? 0;
      ctx.shadowOffsetY = opts.shadow.dy ?? 0;
    }
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  }

  function paint(ctx, opts) {
    if (opts.fill !== null && opts.fill !== undefined) {
      ctx.fillStyle = resolveFill(ctx, opts.fill);
      ctx.fill();
    }
    if (opts.stroke) {
      ctx.shadowColor = "transparent"; // don't double-shadow the outline
      ctx.strokeStyle = resolveFill(ctx, opts.stroke);
      ctx.lineWidth = opts.lineWidth ?? 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r ?? 0, w / 2, h / 2);
    ctx.beginPath();
    if (radius <= 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }
  }

  class Layer {
    constructor() {
      this.ops = [];
      this.transform = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 };
    }
    at(x, y) { this.transform.x = x; this.transform.y = y; return this; }
    scaleBy(s) { this.transform.scale = s; return this; }
    rotate(deg) { this.transform.rotate = deg; return this; }
    alpha(a) { this.transform.alpha = a; return this; }
    clearOps() { this.ops.length = 0; return this; }

    _op(fn) { this.ops.push(fn); return this; }

    rect(opts) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        roundedRectPath(ctx, opts.x, opts.y, opts.w, opts.h, opts.radius);
        paint(ctx, opts);
        ctx.restore();
      });
    }

    circle(opts) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        ctx.beginPath();
        ctx.arc(opts.cx, opts.cy, opts.r, 0, Math.PI * 2);
        paint(ctx, opts);
        ctx.restore();
      });
    }

    ellipse(opts) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        ctx.beginPath();
        ctx.ellipse(opts.cx, opts.cy, opts.rx, opts.ry, ((opts.rotate ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
        paint(ctx, opts);
        ctx.restore();
      });
    }

    /** points: [[x, y], ...]; closes the path by default. */
    poly(points, opts = {}) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        if (opts.close !== false) ctx.closePath();
        paint(ctx, opts);
        ctx.restore();
      });
    }

    /** Smooth curve through points (quadratic midpoint technique). */
    curve(points, opts = {}) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length - 1; i++) {
          const mx = (points[i][0] + points[i + 1][0]) / 2;
          const my = (points[i][1] + points[i + 1][1]) / 2;
          ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my);
        }
        ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
        if (opts.close) ctx.closePath();
        paint(ctx, opts);
        ctx.restore();
      });
    }

    star({ cx, cy, points = 5, outer, inner, rotate = -90, ...opts }) {
      const pts = [];
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner ?? outer * 0.45;
        const a = ((rotate + (i * 180) / points) * Math.PI) / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return this.poly(pts, opts);
    }

    text(opts) {
      return this._op((ctx) => {
        ctx.save();
        applyStyle(ctx, opts);
        ctx.font = `${opts.weight ?? "bold"} ${opts.size ?? 16}px ${opts.font ?? "system-ui, sans-serif"}`;
        ctx.textAlign = opts.align ?? "left";
        ctx.textBaseline = opts.baseline ?? "alphabetic";
        if (opts.fill !== null) {
          ctx.fillStyle = resolveFill(ctx, opts.fill ?? "#ffffff");
          ctx.fillText(opts.text, opts.x, opts.y);
        }
        if (opts.stroke) {
          ctx.strokeStyle = opts.stroke;
          ctx.lineWidth = opts.lineWidth ?? 2;
          ctx.strokeText(opts.text, opts.x, opts.y);
        }
        ctx.restore();
      });
    }

    /** Raw escape hatch: fn(ctx) runs inside this layer's transform. */
    draw(fn) { return this._op(fn); }
  }

  class Scene2D {
    constructor(canvas, { background = "#181820" } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.background = background;
      this.layers = [];
      window.__mode = "2d";
      window.__redraw = () => this.render();
    }

    layer(transform = {}) {
      const l = new Layer();
      Object.assign(l.transform, transform);
      this.layers.push(l);
      return l;
    }

    render() {
      const { ctx, canvas } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const layer of this.layers) {
        const t = layer.transform;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate((t.rotate * Math.PI) / 180);
        ctx.scale(t.scale, t.scale);
        ctx.globalAlpha = t.alpha;
        for (const op of layer.ops) op(ctx);
        ctx.restore();
      }
      return this;
    }

    /**
     * Animation ticker: fn(t_seconds, scene) runs before each render.
     * Mutate layer transforms or rebuild layer ops inside fn.
     */
    animate(fn, { fps = 30 } = {}) {
      const interval = 1000 / fps;
      let last = 0;
      const tick = (t) => {
        if (t - last >= interval) {
          last = t;
          fn(t / 1000, this);
          this.render();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return this;
    }
  }

  // ---- game UI -----------------------------------------------------------
  const ui = {
    /** Beveled panel (nine-slice look without an image). */
    panel(layer, { x, y, w, h, radius = 8, fill = "#2a2a3a", border = "#11111a", highlight = "rgba(255,255,255,0.12)" }) {
      layer.rect({ x, y, w, h, radius, fill: border });
      layer.rect({ x: x + 3, y: y + 3, w: w - 6, h: h - 6, radius: Math.max(0, radius - 2), fill });
      layer.rect({ x: x + 3, y: y + 3, w: w - 6, h: Math.max(3, h * 0.18), radius: Math.max(0, radius - 2), fill: highlight });
      return layer;
    },

    healthBar(layer, { x, y, w, h = 18, value = 1, fg = "#e8443a", bg = "#1a1020", border = "#0a0a12", label } = {}) {
      const v = Math.max(0, Math.min(1, value));
      layer.rect({ x: x - 2, y: y - 2, w: w + 4, h: h + 4, radius: h / 2 + 2, fill: border });
      layer.rect({ x, y, w, h, radius: h / 2, fill: bg });
      if (v > 0) {
        layer.rect({ x, y, w: Math.max(h, w * v), h, radius: h / 2, fill: fg });
        layer.rect({ x: x + 2, y: y + 2, w: Math.max(h - 4, w * v - 4), h: h * 0.35, radius: h / 2, fill: "rgba(255,255,255,0.25)" });
      }
      if (label) layer.text({ x: x + w / 2, y: y + h / 2 + 1, text: label, size: h * 0.65, align: "center", baseline: "middle", fill: "#ffffff" });
      return layer;
    },

    button(layer, { x, y, w, h = 36, label = "OK", fill = "#3a6ea8", radius = 8 }) {
      layer.rect({ x, y: y + 2, w, h, radius, fill: "rgba(0,0,0,0.45)" });
      layer.rect({ x, y, w, h, radius, fill });
      layer.rect({ x: x + 2, y: y + 2, w: w - 4, h: h * 0.4, radius: Math.max(0, radius - 2), fill: "rgba(255,255,255,0.2)" });
      layer.text({ x: x + w / 2, y: y + h / 2 + 1, text: label, size: h * 0.45, align: "center", baseline: "middle", fill: "#ffffff" });
      return layer;
    },
  };

  window.D2D = {
    scene: (canvas, opts) => new Scene2D(canvas, opts),
    linear: (x0, y0, x1, y1, stops) => ({ __gradient: "linear", x0, y0, x1, y1, stops }),
    radial: (cx, cy, r0, r1, stops) => ({ __gradient: "radial", cx, cy, r0, r1, stops }),
    ui,
  };
})();

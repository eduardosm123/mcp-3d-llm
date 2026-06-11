// pixel-helpers.js — pixel art on a logical grid, displayed crisp (nearest
// neighbor) on a normal-size canvas so screenshots are readable.
// Include with: <script src="/__helpers/pixel-helpers.js"></script>
//
//   const p = PIX.create(document.getElementById("c"), {
//     width: 32, height: 32, scale: 12, palette: PIX.palettes.pico8, background: 0
//   });
//   p.rectFill(12, 18, 8, 10, 8);          // colors are palette indices (or "#hex")
//   p.circleFill(16, 12, 6, 7);
//   p.mirrorX();                            // left half -> right half symmetry
//   p.outline(0);                           // dark outline around everything
//   p.show();                               // REQUIRED: paints the display canvas
//
// Registers window.__pix (grid metadata -> unlocks pixel-art validation),
// window.__mode = "2d" and window.__redraw for the canvas3d MCP server.
(() => {
  "use strict";

  // Curated retro palettes (index 0 is the darkest / classic background).
  const palettes = {
    gameboy: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
    pico8: [
      "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
      "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ],
    nes: [
      "#000000", "#fcfcfc", "#f8f8f8", "#bcbcbc", "#7c7c7c", "#a4e4fc", "#3cbcfc", "#0078f8",
      "#0000fc", "#b8b8f8", "#6888fc", "#0058f8", "#d8b8f8", "#9878f8", "#6844fc", "#f8b8f8",
      "#f878f8", "#d800cc", "#f8a4c0", "#f85898", "#e40058", "#f0d0b0", "#f87858", "#f83800",
      "#fca044", "#e45c10", "#ac7c00", "#f8b800", "#b8f818", "#58d854", "#00b800", "#00a800",
    ],
    sweetie16: [
      "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179",
      "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
    ],
  };

  function parseColor(c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) throw new Error("PIX: use #rrggbb colors or palette indices, got " + c);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Bayer 4x4 threshold matrix, normalized 0..1 (for dithering).
  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ].map((row) => row.map((v) => (v + 0.5) / 16));

  class Grid {
    constructor(width, height, palette) {
      this.width = width;
      this.height = height;
      this.palette = palette;
      // -1 = transparent; >=0 palette index; strings stored in extra map
      this.data = new Int16Array(width * height).fill(-1);
      this.custom = []; // custom color strings, addressed as -(i+2)
    }
    _code(c) {
      if (c === null || c === undefined) return -1;
      if (typeof c === "number") {
        if (!this.palette[c]) throw new Error("PIX: palette index out of range: " + c);
        return c;
      }
      const idx = this.custom.indexOf(String(c));
      if (idx >= 0) return -(idx + 2);
      this.custom.push(String(c));
      return -(this.custom.length + 1);
    }
    _color(code) {
      if (code === -1) return null;
      return code >= 0 ? this.palette[code] : this.custom[-code - 2];
    }
    set(x, y, code) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      this.data[y * this.width + x] = code;
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
      return this.data[y * this.width + x];
    }
  }

  class Pix {
    constructor(canvas, { width = 32, height, scale = 10, palette = palettes.pico8, background = null } = {}) {
      height = height ?? width;
      this.grid = new Grid(width, height, palette);
      this.scale = Math.max(1, Math.round(scale));
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.background = background; // palette index, "#hex" or null (checker)
      canvas.width = width * this.scale;
      canvas.height = height * this.scale;
      this.palette = palette;
      this._frames = null;

      window.__mode = "2d";
      window.__pix = {
        width,
        height,
        scale: this.scale,
        palette_size: palette.length,
      };
      window.__redraw = () => this.show();
      if (background !== null && background !== undefined) this.clear(background);
    }

    // ---- drawing (colors: palette index or "#hex"; integer coordinates) ----
    px(x, y, c) { this.grid.set(x, y, this.grid._code(c)); return this; }
    get(x, y) { return this.grid._color(this.grid.get(x | 0, y | 0)); }
    clear(c = null) { this.grid.data.fill(c === null ? -1 : this.grid._code(c)); return this; }

    line(x0, y0, x1, y1, c) {
      const code = this.grid._code(c);
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.grid.set(x0, y0, code);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return this;
    }

    rect(x, y, w, h, c) {
      this.line(x, y, x + w - 1, y, c);
      this.line(x, y + h - 1, x + w - 1, y + h - 1, c);
      this.line(x, y, x, y + h - 1, c);
      this.line(x + w - 1, y, x + w - 1, y + h - 1, c);
      return this;
    }

    rectFill(x, y, w, h, c) {
      const code = this.grid._code(c);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.grid.set(x + i, y + j, code);
      return this;
    }

    circle(cx, cy, r, c) {
      const code = this.grid._code(c);
      let x = r | 0;
      let y = 0;
      let err = 1 - x;
      while (x >= y) {
        for (const [px, py] of [
          [x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y],
        ]) {
          this.grid.set(cx + px, cy + py, code);
        }
        y++;
        if (err < 0) err += 2 * y + 1;
        else { x--; err += 2 * (y - x) + 1; }
      }
      return this;
    }

    circleFill(cx, cy, r, c) {
      const code = this.grid._code(c);
      for (let y = -r; y <= r; y++) {
        const span = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
        for (let x = -span; x <= span; x++) this.grid.set(cx + x, cy + y, code);
      }
      return this;
    }

    /** Flood fill from (x, y). */
    fill(x, y, c) {
      x |= 0; y |= 0;
      const target = this.grid.get(x, y);
      const code = this.grid._code(c);
      if (target === code) return this;
      const stack = [[x, y]];
      while (stack.length) {
        const [px, py] = stack.pop();
        if (this.grid.get(px, py) !== target) continue;
        if (px < 0 || py < 0 || px >= this.grid.width || py >= this.grid.height) continue;
        this.grid.set(px, py, code);
        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
      }
      return this;
    }

    /** Dither a rect between two colors. pattern: "checker" | "bayer" (density 0..1 for bayer). */
    dither(x, y, w, h, c1, c2, { pattern = "checker", density = 0.5 } = {}) {
      const a = this.grid._code(c1);
      const b = this.grid._code(c2);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const on =
            pattern === "checker" ? (i + j) % 2 === 0 : BAYER4[(y + j) & 3][(x + i) & 3] < density;
          this.grid.set(x + i, y + j, on ? a : b);
        }
      }
      return this;
    }

    /** Copies the left half mirrored onto the right half (or top->bottom with axis "y"). */
    mirrorX() {
      const { width, height } = this.grid;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < Math.floor(width / 2); x++) {
          this.grid.set(width - 1 - x, y, this.grid.get(x, y));
        }
      }
      return this;
    }

    mirrorY() {
      const { width, height } = this.grid;
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < Math.floor(height / 2); y++) {
          this.grid.set(x, height - 1 - y, this.grid.get(x, y));
        }
      }
      return this;
    }

    /** Outlines every non-transparent region with color c. */
    outline(c) {
      const code = this.grid._code(c);
      const { width, height } = this.grid;
      const src = Int16Array.from(this.grid.data);
      const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : src[y * width + x]);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (at(x, y) !== -1) continue;
          if (at(x + 1, y) > -1 && at(x + 1, y) !== code ||
              at(x - 1, y) > -1 && at(x - 1, y) !== code ||
              at(x, y + 1) > -1 && at(x, y + 1) !== code ||
              at(x, y - 1) > -1 && at(x, y - 1) !== code) {
            this.grid.set(x, y, code);
          }
        }
      }
      return this;
    }

    /** Builds a reusable sprite: draw(s) receives a Pix-like surface. */
    sprite(w, h, draw) {
      const s = Object.create(Pix.prototype);
      s.grid = new Grid(w, h, this.palette);
      s.scale = 1;
      draw(s);
      return s;
    }

    /** Stamps a sprite's pixels (transparent skipped). */
    stamp(sprite, x, y, { flipX = false, flipY = false } = {}) {
      for (let j = 0; j < sprite.grid.height; j++) {
        for (let i = 0; i < sprite.grid.width; i++) {
          const code = sprite.grid.get(flipX ? sprite.grid.width - 1 - i : i, flipY ? sprite.grid.height - 1 - j : j);
          if (code === -1) continue;
          this.grid.set(x + i, y + j, this.grid._code(sprite.grid._color(code)));
        }
      }
      return this;
    }

    /** Paints the logical grid to the display canvas, crisp. Call after drawing. */
    show() {
      const { width, height } = this.grid;
      const s = this.scale;
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      // checkerboard for transparency (only where nothing was drawn)
      ctx.fillStyle = "#9a9aa4";
      ctx.fillRect(0, 0, width * s, height * s);
      ctx.fillStyle = "#80808a";
      for (let y = 0; y < height; y++) {
        for (let x = (y % 2); x < width; x += 2) ctx.fillRect(x * s, y * s, s, s);
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const color = this.grid._color(this.grid.get(x, y));
          if (color === null) continue;
          ctx.fillStyle = color;
          ctx.fillRect(x * s, y * s, s, s);
        }
      }
      return this;
    }

    /**
     * Frame animation: frames = array of draw functions fn(p, frameIndex).
     * Each frame starts from a cleared grid. Loops with rAF at the given fps.
     */
    animate(frames, { fps = 8 } = {}) {
      this._frames = frames;
      const interval = 1000 / fps;
      let last = 0;
      let index = 0;
      const tick = (t) => {
        if (t - last >= interval) {
          last = t;
          this.clear(this.background ?? null);
          frames[index % frames.length](this, index % frames.length);
          this.show();
          index++;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return this;
    }
  }

  window.PIX = {
    create: (canvas, opts) => new Pix(canvas, opts),
    palettes,
    parseColor,
  };
})();

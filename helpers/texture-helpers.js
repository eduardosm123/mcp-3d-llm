// texture-helpers.js — procedural texture generation, tech-agnostic.
// Include with: <script src="/__helpers/texture-helpers.js"></script>
// Every generator returns an HTMLCanvasElement you can use as:
//   Three.js : threeHelpers.toTexture(TEX.wood())            (CanvasTexture)
//   WebGL    : GLH.texture(gl, TEX.brick())
//   Canvas2D : mesh.texture(TEX.noise()) with C3D, or ctx.createPattern(...)
// No network, no image files — textures always work in self-contained HTML.
(() => {
  "use strict";

  // Deterministic RNG so renders are reproducible run to run.
  function mulberry32(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }

  function parseColor(color) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  function lerpColor(a, b, t) {
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(
      a[2] + (b[2] - a[2]) * t
    )})`;
  }

  // Smooth value noise in [0,1].
  function valueNoise2D(size, scale, rand) {
    const grid = scale + 2;
    const values = [];
    for (let i = 0; i < grid * grid; i++) values.push(rand());
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = (x / size) * scale;
      const gy = (y / size) * scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const v = (ix, iy) => values[(iy % grid) * grid + (ix % grid)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
      return a + (b - a) * ty;
    };
  }

  function fbm(noiseFns, x, y) {
    let total = 0;
    let amp = 1;
    let ampSum = 0;
    for (const fn of noiseFns) {
      total += fn.noise(x * fn.freq, y * fn.freq) * amp;
      ampSum += amp;
      amp *= 0.5;
    }
    return total / ampSum;
  }

  const TEX = {
    /** Soft random blotches. colors: [low, high]. */
    noise({ size = 256, colors = ["#666666", "#999999"], scale = 8, octaves = 3, seed = 1 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      const layers = [];
      for (let o = 0; o < octaves; o++) {
        layers.push({ noise: valueNoise2D(size, scale * Math.pow(2, o), rand), freq: 1 });
      }
      const a = parseColor(colors[0]);
      const b = parseColor(colors[1]);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const t = fbm(layers, x, y);
          const off = (y * size + x) * 4;
          img.data[off] = a[0] + (b[0] - a[0]) * t;
          img.data[off + 1] = a[1] + (b[1] - a[1]) * t;
          img.data[off + 2] = a[2] + (b[2] - a[2]) * t;
          img.data[off + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },

    checker({ size = 256, colors = ["#888888", "#444444"], tiles = 8 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const t = size / tiles;
      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          ctx.fillStyle = colors[(x + y) % 2];
          ctx.fillRect(x * t, y * t, t + 1, t + 1);
        }
      }
      return canvas;
    },

    stripes({ size = 256, colors = ["#aa3333", "#dddddd"], count = 8, horizontal = false } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const t = size / count;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[i % colors.length];
        if (horizontal) ctx.fillRect(0, i * t, size, t + 1);
        else ctx.fillRect(i * t, 0, t + 1, size);
      }
      return canvas;
    },

    gradient({ size = 256, from = "#335588", to = "#aaccff", vertical = true } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const g = vertical ? ctx.createLinearGradient(0, 0, 0, size) : ctx.createLinearGradient(0, 0, size, 0);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return canvas;
    },

    /** Vertical-grain wood with rings and subtle noise. */
    wood({ size = 256, base = "#8b5a2b", dark = "#5c3a17", rings = 10, seed = 2 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      const wobble = valueNoise2D(size, 4, rand);
      const grain = valueNoise2D(size, 64, rand);
      const a = parseColor(base);
      const b = parseColor(dark);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const w = wobble(x, y) * 0.35;
          const band = Math.abs(Math.sin(((x / size) * rings + w) * Math.PI));
          const g = grain(x, y) * 0.25;
          const t = Math.min(1, band * 0.8 + g);
          const off = (y * size + x) * 4;
          img.data[off] = a[0] + (b[0] - a[0]) * t;
          img.data[off + 1] = a[1] + (b[1] - a[1]) * t;
          img.data[off + 2] = a[2] + (b[2] - a[2]) * t;
          img.data[off + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },

    brick({ size = 256, brick = "#a04030", mortar = "#c8c0b8", rows = 8, jitter = 0.06, seed = 3 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      ctx.fillStyle = mortar;
      ctx.fillRect(0, 0, size, size);
      const bh = size / rows;
      const bw = bh * 2;
      const gap = Math.max(2, size / 64);
      const base = parseColor(brick);
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : -bw / 2;
        for (let cx = offset; cx < size; cx += bw) {
          const shade = (rand() - 0.5) * 2 * jitter * 255;
          ctx.fillStyle = `rgb(${clamp8(base[0] + shade)},${clamp8(base[1] + shade)},${clamp8(base[2] + shade)})`;
          ctx.fillRect(cx + gap / 2, r * bh + gap / 2, bw - gap, bh - gap);
        }
      }
      return canvas;
    },

    marble({ size = 256, base = "#e8e8e8", vein = "#707080", scale = 5, seed = 4 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      const n1 = valueNoise2D(size, scale, rand);
      const n2 = valueNoise2D(size, scale * 3, rand);
      const a = parseColor(base);
      const b = parseColor(vein);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const turb = n1(x, y) * 6 + n2(x, y) * 2;
          const t = Math.pow(Math.abs(Math.sin((x / size) * 2 * Math.PI + turb)), 4);
          const off = (y * size + x) * 4;
          img.data[off] = a[0] + (b[0] - a[0]) * t;
          img.data[off + 1] = a[1] + (b[1] - a[1]) * t;
          img.data[off + 2] = a[2] + (b[2] - a[2]) * t;
          img.data[off + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },

    dots({ size = 256, bg = "#224466", dot = "#88bbee", count = 60, radius = 0, seed = 5 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = dot;
      const r = radius || size / 40;
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        ctx.arc(rand() * size, rand() * size, r * (0.5 + rand()), 0, Math.PI * 2);
        ctx.fill();
      }
      return canvas;
    },

    grid({ size = 256, bg = "#1a1a2e", line = "#4444aa", cells = 8, width = 2 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = line;
      ctx.lineWidth = width;
      const step = size / cells;
      ctx.beginPath();
      for (let i = 0; i <= cells; i++) {
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
      }
      ctx.stroke();
      return canvas;
    },

    /** Grayscale bump/roughness map from noise — pair with Three.js bumpMap/roughnessMap. */
    bump({ size = 256, scale = 12, octaves = 3, seed = 6, contrast = 1 } = {}) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext("2d");
      const rand = mulberry32(seed);
      const layers = [];
      for (let o = 0; o < octaves; o++) {
        layers.push({ noise: valueNoise2D(size, scale * Math.pow(2, o), rand), freq: 1 });
      }
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let t = fbm(layers, x, y);
          t = Math.min(1, Math.max(0, (t - 0.5) * contrast + 0.5));
          const v = Math.round(t * 255);
          const off = (y * size + x) * 4;
          img.data[off] = img.data[off + 1] = img.data[off + 2] = v;
          img.data[off + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },
  };

  function clamp8(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  window.TEX = TEX;
})();

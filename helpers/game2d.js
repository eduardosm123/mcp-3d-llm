// game2d.js — a small 2D game engine over Canvas 2D.
// Include with: <script src="/__helpers/game2d.js"></script>
//
//   const g = G2D.game(document.getElementById("c"));
//   const map = G2D.tilemap(["####", "#..#", "####"], {
//     tileSize: 32, tiles: { "#": { color: "#555", solid: true } } });
//   g.scene("main", {
//     enter(g) {
//       g.spawn({ x: 64, y: 64, w: 24, h: 24, color: "#4c8", tags: ["player"],
//         update(dt, g) {
//           this.vx = (g.keys.held("ArrowRight") - g.keys.held("ArrowLeft")) * 160;
//           if (g.keys.pressed("Space") && this.grounded) this.vy = -360;
//           this.vy += 900 * dt;
//           map.moveEntity(this, dt);
//         } });
//     },
//     draw(ctx, g) { map.draw(ctx); },          // world layer (under entities)
//     drawUI(ctx, g) { /* HUD, no camera */ },
//   });
//   g.start("main");
//
// Fixed-timestep update (60 Hz), rAF rendering, input with edge detection,
// entities with tags, AABB/circle collision, camera follow + shake, tweens,
// particles, timers. Registers window.__mode = "2d", window.__redraw and a
// default window.__state (override it with game-specific state for playtests).
(() => {
  "use strict";

  const STEP = 1 / 60;

  function normKey(e) {
    if (e.key === " ") return "Space";
    return e.key.length > 1 ? e.key : e.key.toLowerCase();
  }

  // ---- collision ----------------------------------------------------------
  const aabb = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const circleHit = (a, b) => {
    const dx = (a.x + (a.w ?? 0) / 2) - (b.x + (b.w ?? 0) / 2);
    const dy = (a.y + (a.h ?? 0) / 2) - (b.y + (b.h ?? 0) / 2);
    const r = (a.r ?? Math.min(a.w, a.h) / 2) + (b.r ?? Math.min(b.w, b.h) / 2);
    return dx * dx + dy * dy < r * r;
  };

  // ---- tilemap ------------------------------------------------------------
  class Tilemap {
    constructor(rows, { tileSize = 32, tiles = {} } = {}) {
      this.rows = rows;
      this.tileSize = tileSize;
      this.tiles = tiles;
      this.width = Math.max(...rows.map((r) => r.length)) * tileSize;
      this.height = rows.length * tileSize;
    }
    tileAt(wx, wy) {
      const tx = Math.floor(wx / this.tileSize);
      const ty = Math.floor(wy / this.tileSize);
      if (ty < 0 || ty >= this.rows.length || tx < 0 || tx >= this.rows[ty].length) return null;
      return this.tiles[this.rows[ty][tx]] ?? null;
    }
    solidAt(wx, wy) {
      const t = this.tileAt(wx, wy);
      return !!(t && t.solid);
    }
    rectHitsSolid(x, y, w, h) {
      const ts = this.tileSize;
      for (let py = Math.floor(y / ts) * ts; py < y + h; py += ts) {
        for (let px = Math.floor(x / ts) * ts; px < x + w; px += ts) {
          if (this.solidAt(px, py)) return true;
        }
      }
      return this.solidAt(x + w - 0.01, y + h - 0.01);
    }
    /**
     * Moves an entity (x, y, w, h, vx, vy) with axis-separated collision
     * against solid tiles. Sets e.grounded. The platformer workhorse.
     */
    moveEntity(e, dt) {
      e.x += e.vx * dt;
      if (this.rectHitsSolid(e.x, e.y, e.w, e.h)) {
        const ts = this.tileSize;
        if (e.vx > 0) e.x = Math.floor((e.x + e.w) / ts) * ts - e.w - 0.01;
        else if (e.vx < 0) e.x = Math.floor(e.x / ts + 1) * ts + 0.01;
        e.vx = 0;
      }
      e.y += e.vy * dt;
      e.grounded = false;
      if (this.rectHitsSolid(e.x, e.y, e.w, e.h)) {
        const ts = this.tileSize;
        if (e.vy > 0) {
          e.y = Math.floor((e.y + e.h) / ts) * ts - e.h - 0.01;
          e.grounded = true;
        } else if (e.vy < 0) {
          e.y = Math.floor(e.y / ts + 1) * ts + 0.01;
        }
        e.vy = 0;
      }
      return e;
    }
    draw(ctx) {
      const ts = this.tileSize;
      for (let ty = 0; ty < this.rows.length; ty++) {
        for (let tx = 0; tx < this.rows[ty].length; tx++) {
          const t = this.tiles[this.rows[ty][tx]];
          if (!t) continue;
          if (t.draw) t.draw(ctx, tx * ts, ty * ts, ts);
          else if (t.color) {
            ctx.fillStyle = t.color;
            ctx.fillRect(tx * ts, ty * ts, ts, ts);
          }
        }
      }
    }
  }

  // ---- game ---------------------------------------------------------------
  class Game {
    constructor(canvas, { background = "#101018" } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.background = background;
      this.entitiesList = [];
      this.scenes = {};
      this.sceneName = null;
      this.tweens = [];
      this.timers = [];
      this.time = 0;

      this.camera = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        zoom: 1,
        _follow: null,
        _lerp: 0.1,
        _shake: 0,
        _shakeMs: 0,
        follow(target, { lerp = 0.1 } = {}) { this._follow = target; this._lerp = lerp; },
        shake(intensity = 6, ms = 250) { this._shake = intensity; this._shakeMs = ms; },
      };

      this.keys = {
        _held: new Set(),
        _pressed: new Set(),
        held: (k) => (this.keys._held.has(k) ? 1 : 0),
        pressed: (k) => this.keys._pressed.has(k),
      };
      this.mouse = { x: 0, y: 0, down: false, pressed: false };

      window.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
        const k = normKey(e);
        if (!e.repeat) this.keys._pressed.add(k);
        this.keys._held.add(k);
        this.keys._held.add(e.code);
      });
      window.addEventListener("keyup", (e) => {
        this.keys._held.delete(normKey(e));
        this.keys._held.delete(e.code);
      });
      canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
      });
      canvas.addEventListener("mousedown", () => { this.mouse.down = true; this.mouse.pressed = true; });
      window.addEventListener("mouseup", () => { this.mouse.down = false; });

      window.__mode = "2d";
      window.__redraw = () => this._draw();
      if (!window.__state) {
        window.__state = () => ({ scene: this.sceneName, entities: this.entitiesList.length, time: Math.round(this.time * 100) / 100 });
      }
    }

    scene(name, def) { this.scenes[name] = def; return this; }

    goto(name) {
      const def = this.scenes[name];
      if (!def) throw new Error("G2D: unknown scene " + name);
      this.entitiesList = [];
      this.tweens = [];
      this.timers = [];
      this.sceneName = name;
      this._scene = def;
      if (def.enter) def.enter(this);
      return this;
    }

    start(name) {
      this.goto(name);
      let acc = 0;
      let last = performance.now();
      const frame = (now) => {
        acc += Math.min((now - last) / 1000, 0.25); // clamp away tab-stall spirals
        last = now;
        while (acc >= STEP) {
          this._update(STEP);
          acc -= STEP;
        }
        this._draw();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      return this;
    }

    spawn(props) {
      const e = Object.assign(
        { x: 0, y: 0, w: 16, h: 16, vx: 0, vy: 0, z: 0, tags: [], dead: false, color: "#cccccc" },
        props
      );
      e.destroy = () => { e.dead = true; };
      this.entitiesList.push(e);
      return e;
    }

    find(tag) { return this.entitiesList.filter((e) => !e.dead && e.tags.includes(tag)); }

    collisions(tagA, tagB, cb, { shape = "aabb" } = {}) {
      const test = shape === "circle" ? circleHit : aabb;
      for (const a of this.find(tagA)) {
        for (const b of this.find(tagB)) {
          if (a !== b && test(a, b)) cb(a, b);
        }
      }
    }

    tween(obj, to, { ms = 300, ease = "outQuad", onDone } = {}) {
      const from = {};
      for (const k of Object.keys(to)) from[k] = obj[k];
      this.tweens.push({ obj, from, to, ms, t: 0, ease, onDone });
    }

    after(ms, fn) { this.timers.push({ at: this.time + ms / 1000, fn }); }

    burst({ x, y, count = 12, color = "#ffcc55", speed = 140, life = 0.5, size = 3, gravity = 300 } = {}) {
      const colors = Array.isArray(color) ? color : [color];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        this.spawn({
          x, y, w: 0, h: 0, z: 5,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          _life: life * (0.5 + Math.random() * 0.5),
          _size: size, _color: colors[i % colors.length],
          tags: ["particle"],
          update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vy += gravity * dt;
            this._life -= dt;
            if (this._life <= 0) this.destroy();
          },
          draw(ctx) {
            ctx.globalAlpha = Math.max(0, Math.min(1, this._life * 3));
            ctx.fillStyle = this._color;
            ctx.fillRect(this.x - this._size / 2, this.y - this._size / 2, this._size, this._size);
            ctx.globalAlpha = 1;
          },
        });
      }
    }

    _update(dt) {
      this.time += dt;
      if (this._scene?.update) this._scene.update(dt, this);
      for (const e of this.entitiesList) if (!e.dead && e.update) e.update.call(e, dt, this);
      this.entitiesList = this.entitiesList.filter((e) => !e.dead);

      for (const tw of this.tweens) {
        tw.t = Math.min(1, tw.t + (dt * 1000) / tw.ms);
        const k = tw.ease === "linear" ? tw.t : tw.ease === "outQuad" ? 1 - (1 - tw.t) ** 2 : tw.t * tw.t;
        for (const key of Object.keys(tw.to)) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
        if (tw.t >= 1 && tw.onDone) tw.onDone();
      }
      this.tweens = this.tweens.filter((tw) => tw.t < 1);

      for (const timer of this.timers.slice()) {
        if (this.time >= timer.at) {
          this.timers.splice(this.timers.indexOf(timer), 1);
          timer.fn(this);
        }
      }

      const cam = this.camera;
      if (cam._follow && !cam._follow.dead) {
        cam.x += ((cam._follow.x + (cam._follow.w ?? 0) / 2) - cam.x) * cam._lerp;
        cam.y += ((cam._follow.y + (cam._follow.h ?? 0) / 2) - cam.y) * cam._lerp;
      }
      if (cam._shakeMs > 0) cam._shakeMs -= dt * 1000;

      this.keys._pressed.clear();
      this.mouse.pressed = false;
    }

    _draw() {
      const { ctx, canvas, camera } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const shakeX = camera._shakeMs > 0 ? (Math.random() - 0.5) * 2 * camera._shake : 0;
      const shakeY = camera._shakeMs > 0 ? (Math.random() - 0.5) * 2 * camera._shake : 0;
      ctx.save();
      ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      if (this._scene?.draw) this._scene.draw(ctx, this);
      const sorted = this.entitiesList.slice().sort((a, b) => a.z - b.z);
      for (const e of sorted) {
        if (e.dead) continue;
        if (e.draw) e.draw.call(e, ctx, this);
        else {
          ctx.fillStyle = e.color;
          ctx.fillRect(e.x, e.y, e.w, e.h);
        }
      }
      ctx.restore();

      if (this._scene?.drawUI) this._scene.drawUI(ctx, this);
    }
  }

  window.G2D = {
    game: (canvas, opts) => new Game(canvas, opts),
    tilemap: (rows, opts) => new Tilemap(rows, opts),
    aabb,
    circleHit,
  };
})();

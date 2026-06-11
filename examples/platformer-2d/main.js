// Coin Run — game logic (separate file to demonstrate multi-file games).
const LEVEL = [
  "#########################",
  "#.......................#",
  "#.......................#",
  "#..........c............#",
  "#.........####..........#",
  "#.....................g.#",
  "#...................#####",
  "#...c...........c.......#",
  "#..###.........###......#",
  "#.......................#",
  "#..............c........#",
  "#.............###.......#",
  "#..p....c...............#",
  "#########################",
];

const TILE = 32;
const g = G2D.game(document.getElementById("game"), { background: "#16203a" });

// extract spawn markers, leave only walls in the map rows
const coins = [];
let playerStart = { x: 64, y: 64 };
let goalPos = { x: 0, y: 0 };
const rows = LEVEL.map((row, ty) =>
  row.replace(/[cpg]/g, (ch, tx) => {
    const wx = tx * TILE;
    const wy = ty * TILE;
    if (ch === "c") coins.push({ x: wx + 8, y: wy + 8 });
    if (ch === "p") playerStart = { x: wx + 5, y: wy + 2 };
    if (ch === "g") goalPos = { x: wx, y: wy };
    return ".";
  })
);

const map = G2D.tilemap(rows, {
  tileSize: TILE,
  tiles: {
    "#": {
      solid: true,
      draw(ctx, x, y, ts) {
        ctx.fillStyle = "#3d4f6e";
        ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = "#4d6285";
        ctx.fillRect(x, y, ts, 5);
      },
    },
  },
});

const state = { score: 0, total: coins.length, won: false };

g.scene("level", {
  enter(g) {
    const player = g.spawn({
      x: playerStart.x, y: playerStart.y, w: 22, h: 28, z: 2,
      tags: ["player"], grounded: false, facing: 1,
      update(dt, g) {
        const dir = g.keys.held("ArrowRight") + g.keys.held("d") - g.keys.held("ArrowLeft") - g.keys.held("a");
        this.vx = dir * 160;
        if (dir !== 0) this.facing = dir;
        if ((g.keys.pressed("Space") || g.keys.pressed("ArrowUp") || g.keys.pressed("w")) && this.grounded) {
          this.vy = -400;
        }
        this.vy = Math.min(this.vy + 980 * dt, 600);
        map.moveEntity(this, dt);
        g.collisions("player", "coin", (p, c) => {
          c.destroy();
          state.score++;
          g.burst({ x: c.x + 8, y: c.y + 8, color: ["#ffd24a", "#fff2b0"], count: 10, speed: 110 });
          g.camera.shake(3, 120);
        });
        g.collisions("player", "goal", () => { state.won = true; });
      },
      draw(ctx) {
        ctx.fillStyle = "#56c271";
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = "#2e3d2e";
        const eye = this.facing > 0 ? this.x + 14 : this.x + 4;
        ctx.fillRect(eye, this.y + 7, 4, 5);
      },
    });

    for (const c of coins) {
      g.spawn({
        x: c.x, y: c.y, w: 16, h: 16, z: 1, tags: ["coin"], _t: Math.random() * 6,
        update(dt) { this._t += dt; },
        draw(ctx) {
          const bob = Math.sin(this._t * 4) * 2;
          ctx.fillStyle = "#ffd24a";
          ctx.beginPath();
          ctx.arc(this.x + 8, this.y + 8 + bob, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#b8901f";
          ctx.fillRect(this.x + 6, this.y + 3 + bob, 4, 10);
        },
      });
    }

    g.spawn({
      x: goalPos.x + 8, y: goalPos.y, w: 16, h: 32, z: 1, tags: ["goal"],
      draw(ctx) {
        ctx.fillStyle = "#cfd6e6";
        ctx.fillRect(this.x, this.y, 3, 32);
        ctx.fillStyle = "#e8554d";
        ctx.beginPath();
        ctx.moveTo(this.x + 3, this.y);
        ctx.lineTo(this.x + 18, this.y + 6);
        ctx.lineTo(this.x + 3, this.y + 12);
        ctx.fill();
      },
    });

    g.camera.follow(player, { lerp: 0.12 });
  },

  draw(ctx) { map.draw(ctx); },

  drawUI(ctx, g) {
    ctx.fillStyle = "rgba(10, 14, 26, 0.7)";
    ctx.fillRect(12, 12, 180, 34);
    ctx.fillStyle = "#ffd24a";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText(`Coins ${state.score}/${state.total}`, 24, 35);
    if (state.won) {
      ctx.fillStyle = "rgba(10, 14, 26, 0.8)";
      ctx.fillRect(0, 180, 800, 110);
      ctx.fillStyle = "#7ee787";
      ctx.font = "bold 48px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("YOU WIN!", 400, 248);
      ctx.textAlign = "left";
    }
  },
});

g.start("level");

// playtest hook: interact_scene's read_state returns this
window.__state = () => {
  const p = g.find("player")[0];
  return {
    score: state.score,
    total: state.total,
    won: state.won,
    coins_left: g.find("coin").length,
    player: p ? { x: Math.round(p.x), y: Math.round(p.y), grounded: p.grounded } : null,
  };
};

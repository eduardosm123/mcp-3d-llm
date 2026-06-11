# Game development guide (2D & 3D)

Games add two things scenes don't have: **a loop** and **input**. The server adds one matching tool: **`interact_scene`** — a scripted playtest (press keys, click, wait, screenshot, read state). The golden rule:

> A game that renders is not a game that plays. After building or changing any mechanic, playtest it with `interact_scene` and verify with `read_state` + screenshots.

## The playtest contract: `window.__state`

Expose a function returning the facts you'd want to assert while testing:

```js
window.__state = () => ({ score, won, player: { x, y, grounded } });
```

Then drive the game and check it reacted:

```json
{ "script": [
  { "action": "read_state" },
  { "action": "key", "key": "ArrowRight", "hold_ms": 600 },
  { "action": "key", "key": "Space" },
  { "action": "wait", "ms": 400 },
  { "action": "screenshot", "label": "after jump" },
  { "action": "read_state" }
] }
```

If `player.x` didn't change, your input handling is broken — no amount of staring at the first frame would have told you that. G2D/G3D register a generic `__state` automatically; **always override it** with game-specific facts.

## Multi-file games

The server serves the **whole folder** of your entry HTML, so split big games:

```
mygame/
  index.html        <script src="/__helpers/game2d.js"></script>
                    <script src="./main.js"></script>
  main.js           (or ES modules: <script type="module" src="./main.js"> + import "./level.js")
  levels.js  art.js
```

Pass the path of `index.html` to the tools. Helpers are always at `/__helpers/...` regardless of folder depth.

## 2D games: `G2D` (`/__helpers/game2d.js`)

Fixed-timestep loop (60 Hz), input with edge detection, entities, collision, tilemap, camera, tweens, particles. See the header of the lib (get_guidelines topic "helpers") and `examples/platformer-2d/` for a complete game. Key patterns:

- **Movement reads input every update**: `this.vx = (g.keys.held("ArrowRight") - g.keys.held("ArrowLeft")) * speed` — never set position from keydown events directly.
- **Jump = edge + grounded**: `if (g.keys.pressed("Space") && this.grounded) this.vy = -400;` (`pressed` fires once per tap).
- **Levels as string tilemaps** with marker extraction (`p` start, `c` coins...) — easy for you to generate and edit.
- **`map.moveEntity(e, dt)`** does axis-separated tile collision and sets `e.grounded` — don't hand-roll platformer physics.
- **Game feel ("juice") is cheap here**: `g.burst(...)` particles on pickup, `g.camera.shake(3, 120)` on impact, `g.tween(...)` for UI pops. A correct-but-dry game still feels broken to players.
- HUD goes in `drawUI` (drawn without camera transform).

## 3D games: `G3D` (`/__helpers/game3d.js`)

ES module over Three.js: `world()` bootstraps renderer/scene/camera/lights/ground and registers `window.__scene` (so render_scene/validate_scene/inspect_scene all still work on your game!). Key patterns:

- `const ctrl = G3D.characterController(player, w, { speed, jump })` — WASD/arrows + Space, camera-relative, gravity, collision. Call `ctrl.update(dt)` in `w.loop`.
- Register every static obstacle with `w.addCollider(mesh)`; the controller and `w.moveAndCollide` resolve against them (AABB).
- `G3D.thirdPersonCamera(w, player, { distance, height })` — smooth follow; call `cam.update(dt)`.
- Pickups/triggers: `w.near(a, b, dist)`; mouse aim: `w.pick(x, y)`.
- Respawn guard: if `player.position.y < -10`, reset — falling through the world is the #1 3D bug.

## Design checklist for a small game

1. **Core loop first**: move → interact → feedback → goal. Get ONE mechanic playtested before adding more.
2. State machine: `playing → won/lost` minimum; G2D scenes (`g.scene`/`g.goto`) for menu/level/gameover.
3. Readability: player visually distinct from background and enemies; collectibles glow/bob.
4. Difficulty: introduce mechanics one at a time; first obstacle should be impossible to fail.
5. Verify the FULL loop with one long `interact_scene` script: can you actually reach a coin? Does score increase? Does the win state trigger?

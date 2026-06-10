# Workflow: building 3D canvas scenes with this server

You write a **self-contained HTML file** that renders a 3D scene into a `<canvas>`. This server gives you eyes (screenshots) and instruments (validation). Use the loop:

1. **Write** the HTML file with your own file tools (any tech: Three.js, Canvas 2D, raw WebGL).
2. **`render_scene`** — look hard at EVERY angle. Does the silhouette read? Are parts floating, misplaced, out of proportion?
3. **`validate_scene`** — fix `error` issues first, then `warning`. `info` items are suggestions.
4. **Fix the worst problem first**, re-render, repeat. Stop when both the images look right *and* validation passes.
5. For placement questions ("where exactly is the arm?"), use **`inspect_scene`** (Three.js only).

Never declare a scene done without at least one render + one validate.

## Critical conventions (enable multi-angle capture + deep validation)

- **Three.js**: register your scene — this is the single highest-value line you can write:
  ```js
  window.__scene = { scene, camera, renderer };
  ```
  Or use the helper, which also registers `window.__redraw`:
  ```js
  import * as H from "/__helpers/three-helpers.js";
  H.register({ scene, camera, renderer });
  ```
- **Canvas 2D / raw WebGL**: expose a view hook so the server can orbit your camera:
  ```js
  window.__setView = ({ azimuth_deg, elevation_deg, distance_factor }) => {
    /* reposition camera, re-render */
  };
  ```
  (`C3D` scenes and `GLH.registerView()` do this automatically.)
- **Async setup?** Expose `window.__ready = somePromise` and the server waits for it.
- **Render-once WebGL scenes** can screenshot blank (the drawing buffer is discarded after presentation). Either animate with `requestAnimationFrame` or expose `window.__redraw = () => draw()`.

## Helper libraries (served at /__helpers/, no install needed)

| Include | Gives you |
|---|---|
| `import * as H from "/__helpers/three-helpers.js"` | `register`, `frameCamera`, `autoGround`, `anchor`, `stackY`, `mirrorX`, `proportion`, `palette`, `makeMaterial`, `threePointLights`, `toTexture`, `applyTexture`, `boxProjectUVs`, `debugAxes`, `debugBoxes` |
| `<script src="/__helpers/canvas3d.js">` | `C3D` — software-3D engine for Canvas 2D: primitives, chainable API, orbit camera, flat shading |
| `<script src="/__helpers/webgl-helpers.js">` | `GLH` — shader compile, default shaders, mesh generators, `mat4`, `orbitCamera`, `texture`, `registerView` |
| `<script src="/__helpers/texture-helpers.js">` | `TEX` — procedural textures: `noise wood brick marble checker stripes gradient dots grid bump` |

Three.js itself comes from a CDN importmap (network required):

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.js" } }
</script>
```

## Reading the render

- Request close-ups with `distance_factor < 1` to inspect textures and small details.
- Default views: front, three-quarter, side, top. The three-quarter view is the best single judge of shape.
- A view that is blank while others are fine = those objects are out of frustum from that side, or the model is paper-thin.

## Other guideline topics

`get_guidelines` topics: `general` (modeling craft), `texturing`, `threejs`, `canvas2d`, `webgl`, `helpers` (API source).

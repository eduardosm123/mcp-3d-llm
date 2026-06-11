# 2D illustration & game-UI guide

For flat scenes (illustrations, backgrounds, HUDs) use `D2D` (`/__helpers/draw2d.js`): retained layers with transforms, shape/gradient/shadow helpers, game UI components and an animation ticker. It registers `window.__mode = "2d"` so the server captures a single view (no orbiting) and `window.__redraw` for reliable screenshots.

## Skeleton

```html
<canvas id="c" width="800" height="600"></canvas>
<script src="/__helpers/draw2d.js"></script>
<script>
  const d = D2D.scene(document.getElementById("c"), { background: "#0b1030" });
  const sky = d.layer();
  sky.rect({ x: 0, y: 0, w: 800, h: 600, fill: D2D.linear(0, 0, 0, 600, [[0, "#0b1030"], [1, "#43355e"]]) });
  const fg = d.layer();
  fg.circle({ cx: 640, cy: 130, r: 46, fill: "#ffe9a8", shadow: { color: "#ffe9a8", blur: 50 } });
  d.render();   // REQUIRED at the end
</script>
```

Layer ops: `rect` (with `radius`), `circle`, `ellipse`, `poly(points)`, `curve(points)` (smooth), `star({cx,cy,points,outer,inner})`, `text`, `draw(ctx => ...)` (escape hatch). Common opts: `fill` (color or `D2D.linear/radial`), `stroke`, `lineWidth`, `shadow:{color,blur,dx,dy}`, `alpha`. Layer transforms: `.at(x,y)`, `.scaleBy(s)`, `.rotate(deg)`, `.alpha(a)`.

## Composition for flat scenes

- **Think in depth bands**: sky → far background → mid → foreground → effects/UI. One layer per band; later layers paint over earlier ones.
- **Atmospheric perspective**: distant bands get lighter, bluer, lower-contrast versions of the palette. This alone makes a scene read as deep.
- **Big-medium-small shapes**: one dominant focal element, supporting medium shapes, sparse small details where the eye lands.
- Light comes from one direction; gradients should agree with it (sky brighter near the sun, hills lit on the sun side via a second overlapping poly with a lighter fill).
- A subtle vignette (radial gradient, transparent center → dark edges, `alpha: 0.3`) ties the picture together.

## Curves and organic shapes

`curve()` smooths through points — use it for hills, clouds, rivers, character blobs. For clouds and bushes: 3–5 overlapping circles with the same fill read better than one complex path.

## Game UI / HUD (`D2D.ui`)

```js
const hud = d.layer();
D2D.ui.panel(hud, { x: 16, y: 16, w: 260, h: 84 });
D2D.ui.healthBar(hud, { x: 32, y: 36, w: 220, h: 18, value: 0.7, label: "HP 70/100" });
D2D.ui.button(hud, { x: 32, y: 62, w: 110, h: 30, label: "ATTACK" });
```

- UI goes on the **last** layer, unaffected by scene transforms.
- Keep a consistent corner radius and a 2-color scheme (panel + accent) across all widgets.
- Text: 2px contrast trick — dark text on light chip or `stroke` behind light text.

## Animation (`d.animate`)

```js
d.animate((t) => {
  cloudLayer.at(((t * 12) % 900) - 100, 0);     // drift
  sunLayer.alpha(0.9 + Math.sin(t * 2) * 0.1);  // pulse
}, { fps: 30 });
```

Mutate layer **transforms** per tick (cheap); rebuild a layer's ops (`layer.clearOps()` + re-add) only when the shapes themselves change. Verify with `render_scene` + `animation_frames: 4`.

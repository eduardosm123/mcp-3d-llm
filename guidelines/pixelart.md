# Pixel art guide

Pixel art is **deliberate placement of individual pixels** — the craft is restraint. Use `PIX` (`/__helpers/pixel-helpers.js`): it gives you a logical grid (e.g. 32×32) displayed crisp at scale, retro palettes, pixel-perfect primitives and animation, and it registers the metadata that turns on pixel-art validation (`ANTI_ALIASING`, `PALETTE_OVERFLOW`).

## Skeleton

```html
<canvas id="c"></canvas>
<script src="/__helpers/pixel-helpers.js"></script>
<script>
  const p = PIX.create(document.getElementById("c"), {
    width: 32, height: 32, scale: 12,        // display = 384×384, crisp
    palette: PIX.palettes.sweetie16,          // or gameboy | pico8 | nes | custom array
    background: 0,                            // palette index; omit for checkerboard
  });
  // ... draw with palette indices ...
  p.show();   // REQUIRED at the end (paints the display canvas)
</script>
```

API: `px(x,y,c)`, `line` (Bresenham), `rect/rectFill`, `circle/circleFill`, `fill` (flood), `dither(x,y,w,h,c1,c2,{pattern:"checker"|"bayer",density})`, `mirrorX/mirrorY`, `outline(c)`, `sprite(w,h,drawFn)` + `stamp(sprite,x,y,{flipX})`, `animate([frameFns],{fps})`, `clear()`, `get(x,y)`.

## The cardinal rules

1. **Never draw on the display canvas directly** — only through the grid API. One smooth `arc()` ruins the crispness (validation flags it as `ANTI_ALIASING`).
2. **Tiny canvas, few colors.** Characters: 16×16 to 32×32. Scenes: 64×64 to 128×96. 4–16 colors. Constraints are the style.
3. **No "jaggies":** lines look clean at 0°, 45°, 90°, or with *consistent* step runs (2-1-2-1 is fine, 3-1-2 is not). Bresenham (`p.line`) handles this.
4. **Shade with the palette ramp, not new colors.** Pick 2–3 ramp steps per material; use `p.dither` for the transition between them.
5. **Outline for readability**: a dark (not black-only) outline (`p.outline(0)`) separates the subject from the background. Selective outlining (darker on shadow side) reads even better.

## Building a character (order matters)

1. **Silhouette first**: fill the readable shape in one dark color. If you can't tell what it is, restart.
2. Big color regions (skin/armor/hair) — flat fills.
3. One light source (top-left convention): add 1 highlight step and 1 shadow step per region.
4. Details last: eyes (often 1–2 px), buckles, trim. **1px of contrast goes a long way.**
5. Symmetric characters: draw the left half, `p.mirrorX()`, then break symmetry slightly (weapon, fringe) so it doesn't look stamped.

## Animation (with `p.animate`)

- 2–4 frames is plenty for idle (1px bob up/down), 4–6 for a walk cycle.
- Keep the silhouette consistent between frames; move grouped regions, don't redraw from scratch.
- Verify with `render_scene` using `animation_frames: 4, frame_interval_ms: 150` — look at the frames side by side.

## Common smells (validation catches some)

- Banding: parallel 1px highlight hugging an outline everywhere → vary the distance.
- Pillow shading: shading every region towards its own center instead of one light direction.
- Noise dithering: dithering without a purpose; use it only on large gradient areas.
- Palette drift: ad-hoc `#hex` colors instead of indices (`PALETTE_OVERFLOW` warns).

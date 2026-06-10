# Texturing guide

Texture = surface detail you don't have to model. The single biggest upgrade from "flat programmer art" to a rich scene.

## Rule 1: procedural over files

Never reference external image files in a self-contained scene — they 404 and you get `TEXTURE_LOAD_FAILED`. Generate textures in code with `TEX` (`/__helpers/texture-helpers.js`):

```html
<script src="/__helpers/texture-helpers.js"></script>
```

| Generator | Use for |
|---|---|
| `TEX.wood({base, dark, rings})` | furniture, floors, trunks |
| `TEX.brick({brick, mortar, rows})` | walls, chimneys |
| `TEX.marble({base, vein})` | floors, columns, counters |
| `TEX.noise({colors, scale, octaves})` | dirt, grass, rust, fabric, any organic surface |
| `TEX.checker / stripes / dots / grid` | tiles, awnings, patterns, sci-fi panels |
| `TEX.gradient({from, to})` | sky domes, fades |
| `TEX.bump({scale, contrast})` | grayscale map for bumpMap/roughnessMap |

All take `{size, seed, ...colors}`. Keep `size` a power of two (256/512) so WebGL1 mipmaps/wrapping work (`NPOT_TEXTURE` warning otherwise).

## Per technology

**Three.js** (with three-helpers):
```js
H.applyTexture(wallMesh, { map: TEX.brick(), repeat: 2 });
H.applyTexture(tableMesh, { map: TEX.wood(), bumpMap: TEX.bump({ contrast: 1.5 }), bumpScale: 0.6 });
```
- `repeat` controls tiling — scale it to the object: a long wall needs more repeats than a crate, or bricks become giant.
- Custom/merged geometry without UVs? `H.boxProjectUVs(geometry)` (applyTexture does it automatically). Validation flags `MISSING_UVS` when a map can't show.
- Subtle `roughnessMap`/`bumpMap` from `TEX.bump()` breaks up big flat surfaces even when the color map is plain.

**Canvas 2D (C3D)**:
```js
C3D.box({ w: 2, h: 1, d: 1 }).texture(TEX.wood(), { scale: 0.5 }).addTo(s);
```
Pattern fill is screen-space (not perspective-correct) — best on small/medium faces; shading is overlaid automatically.

**Raw WebGL (GLH)**:
```js
const wood = GLH.texture(gl, TEX.wood());
GLH.draw(gl, texturedProg, mesh, { u_texture: wood, u_lightDir: [-0.5, -1, -0.3], u_ambient: 0.3 });
```
Use `GLH.defaultShaders.textured` and meshes from `GLH.mesh.*` (they include UVs).

## Texel density and reading distance

- Match texture scale to real-world size: brick courses ~7.5 cm, wood planks ~10–20 cm wide. Wrong scale instantly reads as fake.
- Details smaller than ~2 screen pixels are noise — prefer fewer, bolder features.
- Verify with a close-up render: `views: [{ azimuth_deg: 35, elevation_deg: 20, distance_factor: 0.4 }]`.

## When NOT to texture

- Tiny parts (bolts, eyes): solid color + correct material is cleaner.
- Stylized/toon looks: flat colors with strong palette + lighting can beat textures. `UNTEXTURED_SCENE` is an info hint, not a command.
- Never texture everything with the same noise — variety comes from *different* textures and scales per material family.

# Canvas 2D software-3D pitfalls and patterns

Use `C3D` (`/__helpers/canvas3d.js`) instead of hand-rolling projection math — it gives primitives, an orbit camera, flat shading, painter's-algorithm sorting, and registers `window.__setView`/`window.__redraw` for the MCP server automatically.

## Scene skeleton

```html
<canvas id="c" width="800" height="600"></canvas>
<script src="/__helpers/canvas3d.js"></script>
<script src="/__helpers/texture-helpers.js"></script>
<script>
  const s = C3D.scene(document.getElementById("c"), { background: "#1b1b28" });

  C3D.box({ w: 2.4, h: 0.2, d: 2.4 }).at(0, -0.1, 0).color("#3a3a48").addTo(s);  // ground slab
  C3D.box({ w: 1, h: 0.8, d: 0.8 }).at(0, 0.4, 0).color("#b04030").texture(TEX.brick(), { scale: 0.4 }).addTo(s);
  C3D.cone({ r: 0.8, h: 0.6 }).at(0, 1.1, 0).color("#804020").addTo(s);

  s.light({ dir: [-0.5, -1, -0.3], ambient: 0.35 });
  s.camera({ azimuth_deg: 35, elevation_deg: 25 });   // distance auto-fits the scene
  s.render();
</script>
```

API: `C3D.box/sphere/cylinder/cone/plane/lathe/extrude`, chainable `.at(x,y,z).rotate(rx,ry,rz).scaleBy(s).color("#hex").texture(canvas,{scale}).outline().doubleSided().addTo(scene)`. Angles in degrees, +Y up.

## Painter's algorithm limits (the big one)

Faces are sorted by centroid depth, not pixel depth. This breaks when:
- **Two large faces interpenetrate** → split big geometry into smaller pieces (a long wall = 3 wall segments).
- **A huge ground plane vs small objects** → keep the ground thin (a flat box, not a giant plane), or add it first and keep objects clearly above it.
- Long thin objects crossing others → split them.

If a part "pops" through another from some angles, subdivide one of them.

## Detail strategies without real shading

- Flat shading needs **value contrast**: faces at different angles get different brightness — boxy/faceted shapes read better than near-spherical blobs.
- `.outline(true)` draws dark edges — instant "illustrated" look that hides sorting artifacts.
- Bake detail into textures (`.texture(TEX.wood())`) — pattern fill is screen-space, best on small/medium faces.
- Spheres/cylinders: 12–20 segments are plenty; more just slows sorting.
- `lathe` makes vases/bottles/lamps: `C3D.lathe([[0,0],[0.4,0.1],[0.3,0.8],[0.1,1.0]], 16)`.
- `extrude` makes flat profiles 3D: stars, letters, gears — `C3D.extrude([[x,y],...], depth)` with CCW points.

## Performance

Everything re-renders per frame on the CPU. Keep total faces in the low thousands. No per-pixel lighting, no shadows — fake a shadow with a dark flattened disc (`C3D.cylinder({r, h: 0.01})` in a dark color) under the model.

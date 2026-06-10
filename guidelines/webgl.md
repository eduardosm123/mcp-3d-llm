# Raw WebGL pitfalls and patterns

Use `GLH` (`/__helpers/webgl-helpers.js`) — shader compile/link with readable errors, default shaders, UV'd mesh generators, column-major `mat4`, orbit camera, and `registerView` for multi-angle capture.

## Scene skeleton

```html
<canvas id="c" width="800" height="600"></canvas>
<script src="/__helpers/webgl-helpers.js"></script>
<script src="/__helpers/texture-helpers.js"></script>
<script>
  const gl = GLH.init(document.getElementById("c"), { clear: [0.1, 0.1, 0.16, 1] });
  const prog = GLH.program(gl, GLH.defaultShaders.lambert.vs, GLH.defaultShaders.lambert.fs);
  const cube = GLH.upload(gl, GLH.mesh.cube(1));
  const ball = GLH.upload(gl, GLH.mesh.uvSphere(0.4));

  function draw(view) {
    GLH.clear(gl);
    const proj = GLH.mat4.perspective(50, 800 / 600, 0.1, 100);
    const common = { u_view: view, u_proj: proj, u_lightDir: [-0.5, -1, -0.3], u_ambient: 0.3 };
    GLH.draw(gl, prog, cube, { ...common, u_model: GLH.mat4.translate(GLH.mat4.identity(), 0, 0.5, 0), u_color: [0.7, 0.3, 0.2] });
    GLH.draw(gl, prog, ball, { ...common, u_model: GLH.mat4.translate(GLH.mat4.identity(), 0, 1.4, 0), u_color: [0.3, 0.6, 0.4] });
  }

  GLH.registerView(({ azimuth_deg, elevation_deg, distance_factor }) =>
    draw(GLH.orbitCamera({ azimuth_deg, elevation_deg, distance: 5 * (distance_factor || 1), target: [0, 0.8, 0] })));
  window.__setView({ azimuth_deg: 35, elevation_deg: 25 });   // initial frame
</script>
```

## The classic black/blank causes

1. **Buffer discarded before capture** — WebGL clears the drawing buffer after presenting. `GLH.registerView` fixes this (the server calls `__redraw`/`__setView` before screenshots). Without it, render in a rAF loop.
2. **Winding/culling** — `GLH.init` enables back-face culling; triangles wound clockwise vanish. GLH meshes are CCW-correct; for custom geometry, check winding or `gl.disable(gl.CULL_FACE)`.
3. **Depth test forgotten** (z-fighting/wrong overlap) — `GLH.init` enables it.
4. **Matrix order/layout** — column-major; multiply proj × view × model (in the shader: `u_proj * u_view * u_model * pos`). `mat4.multiply(a, b)` = a·b.
5. **Shader compile errors** — `GLH.program` throws with the info log; read it, fix the line.

## Texturing

```js
const brick = GLH.texture(gl, TEX.brick());
const tProg = GLH.program(gl, GLH.defaultShaders.textured.vs, GLH.defaultShaders.textured.fs);
GLH.draw(gl, tProg, wall, { ...common, u_model: model, u_texture: brick });
```
Power-of-two texture sizes (256/512) — WebGL1 can't mipmap/repeat NPOT textures.

## Building complex models

There is no scene graph: compose transforms by multiplying matrices. Parent-child = `mat4.multiply(parentModel, childLocal)`. Keep a small helper:

```js
const T = (x, y, z) => GLH.mat4.translate(GLH.mat4.identity(), x, y, z);
const chain = (...ms) => ms.reduce(GLH.mat4.multiply);
// arm = chain(torsoModel, T(0.7, 0.5, 0), GLH.mat4.rotateZ(GLH.mat4.identity(), -15), armLocal)
```

uint16 indices cap a single mesh at 65k vertices — split bigger geometry.

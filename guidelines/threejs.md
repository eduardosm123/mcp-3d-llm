# Three.js pitfalls and patterns

## Scene skeleton that always works

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.js" } }
</script>
<canvas id="scene" width="800" height="600"></canvas>
<script type="module">
  import * as THREE from "three";
  import * as H from "/__helpers/three-helpers.js";

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("scene"), antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1d2a);
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);

  // ... build the model ...

  H.autoGround(scene);
  H.threePointLights(scene);
  H.frameCamera(camera, scene);
  H.register({ scene, camera, renderer });   // ← unlocks multi-view + deep validation
</script>
```

## The classic black-screen causes

1. **Lit material, no lights** — `MeshStandardMaterial` & friends need lights. (`NO_LIGHTS` error.)
2. **Camera inside/behind the model** or pointing away — use `H.frameCamera` or `camera.lookAt(center)`. (`OUT_OF_FRUSTUM`.)
3. **near/far clipping** — scene bigger than `far` or closer than `near`. (`CAMERA_CLIPPING`.)
4. **Nothing was rendered** — you must call `renderer.render(scene, camera)` at least once (register() does).

## Structure: use Groups as joints

```js
const arm = new THREE.Group();           // pivot at the shoulder
const upper = new THREE.Mesh(geo, mat);
upper.position.y = -0.4;                 // hang the limb below the pivot
arm.add(upper);
arm.position.set(0.7, 1.5, 0);           // place pivot on the torso
arm.rotation.z = -0.2;                   // rotating the group rotates around the joint
```
Name your groups/meshes (`mesh.name = "arm_L"`) — validation and inspect_scene report paths like `Scene/torso/arm_L`, which makes fixing placement much easier.

## Geometry hygiene

- Primitives (`BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, `LatheGeometry`, `ExtrudeGeometry`) come with UVs and normals. Prefer them over hand-built `BufferGeometry`.
- Custom `BufferGeometry`: call `computeVertexNormals()` (else `MISSING_NORMALS`) and add UVs if texturing (`H.boxProjectUVs`).
- Cheap detail: `EdgesGeometry` + `LineSegments` for panel lines; slightly emissive materials for lights/eyes; `TorusGeometry` for rims and handles.
- Segment counts: 16–24 for spheres/cylinders seen at normal distance; don't ship 64+ everywhere (`HEAVY_SCENE`).

## Materials quick reference

- `MeshStandardMaterial({ color, roughness, metalness })` — default choice. roughness 0.85 = matte, 0.3 = shiny, metalness 0.9 + roughness 0.3 = metal.
- `MeshBasicMaterial` ignores lights (good for emissive screens, sky).
- `H.palette("clay" | "plastic" | "metal" | "toon" | "earth")` returns ready materials; `H.makeMaterial({color, kind})` for one-offs.
- Transparent parts: `transparent: true, opacity: 0.5, side: THREE.DoubleSide`.

## sRGB note

When texturing manually, set `texture.colorSpace = THREE.SRGBColorSpace` on color maps (H.toTexture does it) — otherwise colors look washed out.

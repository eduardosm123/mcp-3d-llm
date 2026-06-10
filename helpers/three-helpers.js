// three-helpers.js — high-level construction utilities for Three.js scenes.
// Import as an ES module (the page must map "three" in its importmap):
//   import * as H from "/__helpers/three-helpers.js";
// Always call H.register({scene, camera, renderer}) — it unlocks the MCP
// server's multi-angle capture and deep validation.
import * as THREE from "three";

/** Registers the scene for the canvas3d MCP server (multi-view + deep checks). */
export function register({ scene, camera, renderer }) {
  window.__scene = { scene, camera, renderer };
  window.__redraw = () => renderer.render(scene, camera);
  renderer.render(scene, camera);
  return { scene, camera, renderer };
}

/** World-space bounding box of an object (or whole scene). */
export function bboxOf(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

/** Fits a perspective camera to see the whole object/scene, with margin. */
export function frameCamera(camera, target, { margin = 1.25, azimuth_deg = 35, elevation_deg = 25 } = {}) {
  const box = bboxOf(target);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * margin;
  const az = (azimuth_deg * Math.PI) / 180;
  const el = (elevation_deg * Math.PI) / 180;
  camera.position.set(
    center.x + dist * Math.cos(el) * Math.sin(az),
    center.y + dist * Math.sin(el),
    center.z + dist * Math.cos(el) * Math.cos(az)
  );
  camera.lookAt(center);
  camera.near = Math.max(dist / 1000, 0.001);
  camera.far = dist + radius * 10;
  camera.updateProjectionMatrix();
  return camera;
}

/** Adds a ground disc right under the scene's lowest point. */
export function autoGround(scene, { color = 0x444450, sizeFactor = 1.6, roughness = 0.95 } = {}) {
  const box = bboxOf(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.5 * sizeFactor || 1;
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, radius * 0.02, 48),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
  ground.name = "ground";
  ground.position.set(center.x, box.min.y - radius * 0.01, center.z);
  scene.add(ground);
  return ground;
}

/**
 * Snaps `child` onto a face of `target` by bounding boxes — the cure for
 * floating parts. face: top|bottom|front|back|left|right. align: how the
 * child centers on that face ("center" or keep its current lateral position).
 */
export function anchor(child, target, { face = "top", align = "center", gap = 0 } = {}) {
  const tb = bboxOf(target);
  const cb = bboxOf(child);
  const tCenter = tb.getCenter(new THREE.Vector3());
  const cCenter = cb.getCenter(new THREE.Vector3());

  const delta = new THREE.Vector3();
  switch (face) {
    case "top": delta.y = tb.max.y - cb.min.y + gap; break;
    case "bottom": delta.y = tb.min.y - cb.max.y - gap; break;
    case "front": delta.z = tb.max.z - cb.min.z + gap; break;
    case "back": delta.z = tb.min.z - cb.max.z - gap; break;
    case "right": delta.x = tb.max.x - cb.min.x + gap; break;
    case "left": delta.x = tb.min.x - cb.max.x - gap; break;
    default: throw new Error("anchor: unknown face " + face);
  }
  if (align === "center") {
    if (face === "top" || face === "bottom") {
      delta.x = tCenter.x - cCenter.x;
      delta.z = tCenter.z - cCenter.z;
    } else if (face === "left" || face === "right") {
      delta.y = tCenter.y - cCenter.y;
      delta.z = tCenter.z - cCenter.z;
    } else {
      delta.x = tCenter.x - cCenter.x;
      delta.y = tCenter.y - cCenter.y;
    }
  }
  child.position.add(delta);
  child.updateWorldMatrix(true, true);
  return child;
}

/** Stacks objects bottom-to-top with touching bounding boxes. */
export function stackY(...objects) {
  for (let i = 1; i < objects.length; i++) anchor(objects[i], objects[i - 1], { face: "top" });
  return objects;
}

/** Clones an object mirrored across the YZ plane (use for arms, legs, wings). */
export function mirrorX(object, { parent } = {}) {
  const clone = object.clone(true);
  clone.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    }
  });
  clone.scale.x *= -1;
  clone.position.x *= -1;
  clone.rotation.y *= -1;
  clone.rotation.z *= -1;
  (parent ?? object.parent)?.add(clone);
  return clone;
}

/** Uniformly scales an object so its bounding box has the given height (or width/depth). */
export function proportion(object, { height, width, depth } = {}) {
  const size = bboxOf(object).getSize(new THREE.Vector3());
  let factor = 1;
  if (height) factor = height / size.y;
  else if (width) factor = width / size.x;
  else if (depth) factor = depth / size.z;
  object.scale.multiplyScalar(factor);
  object.updateWorldMatrix(true, true);
  return object;
}

/** Curated material palettes — pick one, stop fiddling with parameters. */
const PALETTES = {
  clay: { colors: [0xc4866b, 0x8d5a44, 0xe0b9a2, 0x5d4037], roughness: 0.9, metalness: 0.0 },
  plastic: { colors: [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047], roughness: 0.35, metalness: 0.0 },
  metal: { colors: [0x9fa8b2, 0x6b7480, 0xc8cdd4, 0x3e454f], roughness: 0.3, metalness: 0.9 },
  toon: { colors: [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3], roughness: 0.8, metalness: 0.0 },
  earth: { colors: [0x6d8b3c, 0x8b6f47, 0x4a6741, 0xb59e7d], roughness: 0.85, metalness: 0.0 },
};

export function palette(name = "plastic") {
  const p = PALETTES[name];
  if (!p) throw new Error(`palette: unknown "${name}" (have: ${Object.keys(PALETTES).join(", ")})`);
  return p.colors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: p.roughness, metalness: p.metalness }));
}

/** Sane single material: kind = matte | shiny | metal | glow. */
export function makeMaterial({ color = 0x999999, kind = "matte", map = null } = {}) {
  const presets = {
    matte: { roughness: 0.85, metalness: 0 },
    shiny: { roughness: 0.25, metalness: 0 },
    metal: { roughness: 0.3, metalness: 0.9 },
    glow: { roughness: 0.6, metalness: 0, emissive: new THREE.Color(color).multiplyScalar(0.45) },
  };
  return new THREE.MeshStandardMaterial({ color, map, ...(presets[kind] ?? presets.matte) });
}

/** Key + fill + rim light rig sized to the scene. Just works. */
export function threePointLights(scene, { intensity = 1 } = {}) {
  const box = bboxOf(scene);
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length(), 2);
  const key = new THREE.DirectionalLight(0xfff4e5, 2.2 * intensity);
  key.position.set(center.x + r, center.y + r * 1.2, center.z + r * 0.8);
  const fill = new THREE.DirectionalLight(0xdfeaff, 0.7 * intensity);
  fill.position.set(center.x - r, center.y + r * 0.4, center.z + r * 0.6);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9 * intensity);
  rim.position.set(center.x - r * 0.3, center.y + r * 0.8, center.z - r);
  const ambient = new THREE.AmbientLight(0x667788, 0.5 * intensity);
  scene.add(key, fill, rim, ambient);
  return { key, fill, rim, ambient };
}

// ---- Texturing --------------------------------------------------------------

/** Wraps a canvas (e.g. from TEX.*) into a ready CanvasTexture. */
export function toTexture(canvas, { repeat = 1, wrap = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Applies texture canvases/textures to a mesh's material in one call. */
export function applyTexture(mesh, { map, bumpMap, roughnessMap, repeat = 1, bumpScale = 1 } = {}) {
  const asTexture = (t, srgb) => {
    if (!t) return null;
    if (t.isTexture) return t;
    const tex = toTexture(t, { repeat });
    if (!srgb) tex.colorSpace = THREE.NoColorSpace;
    return tex;
  };
  const m = mesh.material;
  if (map) m.map = asTexture(map, true);
  if (bumpMap) {
    m.bumpMap = asTexture(bumpMap, false);
    m.bumpScale = bumpScale;
  }
  if (roughnessMap) m.roughnessMap = asTexture(roughnessMap, false);
  if (m.map && mesh.geometry && !mesh.geometry.attributes.uv) boxProjectUVs(mesh.geometry);
  m.needsUpdate = true;
  return mesh;
}

/** Generates UVs by projecting along the dominant axis per face — for custom geometry without UVs. */
export function boxProjectUVs(geometry) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  size.x = size.x || 1; size.y = size.y || 1; size.z = size.z || 1;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = (pos.getZ(i) - bb.min.z) / size.z;
      v = (pos.getY(i) - bb.min.y) / size.y;
    } else if (ny >= nx && ny >= nz) {
      u = (pos.getX(i) - bb.min.x) / size.x;
      v = (pos.getZ(i) - bb.min.z) / size.z;
    } else {
      u = (pos.getX(i) - bb.min.x) / size.x;
      v = (pos.getY(i) - bb.min.y) / size.y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// ---- Debug ------------------------------------------------------------------

export function debugAxes(scene, size = 2) {
  const axes = new THREE.AxesHelper(size);
  axes.name = "debug-axes";
  scene.add(axes);
  return axes;
}

export function debugBoxes(scene) {
  const helpers = [];
  scene.traverse((o) => {
    if (o.isMesh && o.name !== "ground") helpers.push(new THREE.BoxHelper(o, 0xffff00));
  });
  for (const h of helpers) scene.add(h);
  return helpers;
}

export { THREE };

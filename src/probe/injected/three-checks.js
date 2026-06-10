// Deep Three.js validation. Runs in the page against window.__scene.
// No THREE import needed: only instance methods and raw matrix elements.
// Returns { ok, stats, issues } — issues use the shared {id, severity, message, objects, suggestion} shape.
(() => {
  const reg = window.__scene;
  if (!reg || !reg.scene || !reg.camera || !reg.renderer) {
    return { ok: false, error: "window.__scene not registered" };
  }
  const { scene, camera, renderer } = reg;
  const issues = [];
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const pathOf = (obj) => {
    const parts = [];
    let cur = obj;
    while (cur && cur !== scene) {
      parts.unshift(cur.name || cur.type || "Object3D");
      cur = cur.parent;
    }
    return "Scene/" + parts.join("/");
  };

  // ---- Collect meshes, lights, transforms ----------------------------------
  const meshes = []; // {obj, path, bbox: {min:[..], max:[..]} | null, triangles}
  const lights = [];
  let litMaterialCount = 0;
  let texturedCount = 0;
  let defaultColorCount = 0;
  const materialColors = new Set();
  let totalTriangles = 0;
  const isWebGL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);

  const matIsLit = (m) =>
    !!(m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial));

  scene.traverse((obj) => {
    if (obj.isLight) lights.push({ type: obj.type, intensity: obj.intensity });
    if (!obj.isMesh || !obj.geometry) return;
    const objPath = pathOf(obj);

    // NaN / zero-scale transforms
    const e = obj.matrixWorld.elements;
    let badMatrix = false;
    for (let i = 0; i < 16; i++) if (!isFinite(e[i])) badMatrix = true;
    if (badMatrix) {
      issues.push({
        id: "NAN_TRANSFORM",
        severity: "error",
        message: "Object has a non-finite (NaN/Infinity) world transform — it will not render.",
        objects: [objPath],
        suggestion: "Check position/rotation/scale math feeding this object (division by zero, undefined variables).",
      });
      return; // bbox math would poison everything downstream
    }
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    if (sx < 1e-7 || sy < 1e-7 || sz < 1e-7) {
      issues.push({
        id: "ZERO_SCALE",
        severity: "warning",
        message: "Object has a ~zero scale component — it is invisible or degenerate.",
        objects: [objPath],
        suggestion: "Remove the object or fix its scale.",
      });
    }

    const geo = obj.geometry;
    const pos = geo.attributes && geo.attributes.position;
    const triangles = geo.index ? geo.index.count / 3 : pos ? pos.count / 3 : 0;
    totalTriangles += triangles;

    if (!pos || pos.count === 0) {
      issues.push({
        id: "DEGENERATE_GEOMETRY",
        severity: "warning",
        message: "Geometry has no vertices.",
        objects: [objPath],
        suggestion: "Remove the empty mesh or generate its geometry properly.",
      });
      meshes.push({ obj, path: objPath, bbox: null, triangles: 0 });
      return;
    }

    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    let bbox = null;
    if (bb && isFinite(bb.min.x) && isFinite(bb.max.x)) {
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (let ci = 0; ci < 8; ci++) {
        const x = ci & 1 ? bb.max.x : bb.min.x;
        const y = ci & 2 ? bb.max.y : bb.min.y;
        const z = ci & 4 ? bb.max.z : bb.min.z;
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        min = [Math.min(min[0], wx), Math.min(min[1], wy), Math.min(min[2], wz)];
        max = [Math.max(max[0], wx), Math.max(max[1], wy), Math.max(max[2], wz)];
      }
      bbox = { min, max };
      const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const zeroDims = dims.filter((d) => d < 1e-7).length;
      if (zeroDims >= 2) {
        issues.push({
          id: "DEGENERATE_GEOMETRY",
          severity: "warning",
          message: "Geometry collapses to a line or point in world space.",
          objects: [objPath],
          suggestion: "Check the geometry parameters and the object's scale.",
        });
      }
    } else {
      issues.push({
        id: "DEGENERATE_GEOMETRY",
        severity: "warning",
        message: "Geometry has non-finite vertex positions.",
        objects: [objPath],
        suggestion: "Check the math that generates the vertex positions (NaN coordinates).",
      });
    }

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of materials) {
      if (!m) continue;
      if (matIsLit(m)) {
        litMaterialCount++;
        if (!geo.attributes.normal) {
          issues.push({
            id: "MISSING_NORMALS",
            severity: "warning",
            message: "Lit material on geometry without normals — shading will be wrong or black.",
            objects: [objPath],
            suggestion: "Call geometry.computeVertexNormals() after building the geometry.",
          });
        }
      }
      if (m.map) {
        texturedCount++;
        if (!geo.attributes.uv) {
          issues.push({
            id: "MISSING_UVS",
            severity: "warning",
            message: "Material has a texture map but the geometry has no UV coordinates — the texture cannot show.",
            objects: [objPath],
            suggestion: "Use a primitive with built-in UVs, or generate UVs (e.g. threeHelpers boxProjectUVs(geometry)).",
          });
        }
        const img = m.map.image;
        if (!isWebGL2 && img && img.width && (!isPow2(img.width) || !isPow2(img.height))) {
          issues.push({
            id: "NPOT_TEXTURE",
            severity: "warning",
            message: `Non-power-of-two texture (${img.width}x${img.height}) on WebGL1 — mipmaps/repeat wrapping break.`,
            objects: [objPath],
            suggestion: "Use power-of-two texture sizes (256, 512, 1024...).",
          });
        }
      }
      if (m.color && m.color.getHex) {
        const hex = m.color.getHex();
        materialColors.add(hex);
        if (hex === 0xffffff && !m.map) defaultColorCount++;
      }
    }
    meshes.push({ obj, path: objPath, bbox, triangles });
  });

  function isPow2(v) {
    return (v & (v - 1)) === 0;
  }

  const validBoxes = meshes.filter((m) => m.bbox);

  // ---- Scene bounds + ground detection -------------------------------------
  let sceneMin = [Infinity, Infinity, Infinity];
  let sceneMax = [-Infinity, -Infinity, -Infinity];
  for (const m of validBoxes) {
    for (let a = 0; a < 3; a++) {
      sceneMin[a] = Math.min(sceneMin[a], m.bbox.min[a]);
      sceneMax[a] = Math.max(sceneMax[a], m.bbox.max[a]);
    }
  }
  const sceneSize = [sceneMax[0] - sceneMin[0], sceneMax[1] - sceneMin[1], sceneMax[2] - sceneMin[2]];
  const sceneHeight = Math.max(sceneSize[1], 1e-6);
  const sceneDiag = Math.hypot(sceneSize[0], sceneSize[1], sceneSize[2]) || 1e-6;

  let groundY = sceneMin[1];
  let groundMesh = null;
  for (const m of validBoxes) {
    const fw = m.bbox.max[0] - m.bbox.min[0];
    const fd = m.bbox.max[2] - m.bbox.min[2];
    const fh = m.bbox.max[1] - m.bbox.min[1];
    if (
      fw >= 0.6 * Math.max(sceneSize[0], 1e-6) &&
      fd >= 0.6 * Math.max(sceneSize[2], 1e-6) &&
      fh <= 0.05 * sceneHeight
    ) {
      groundMesh = m;
      groundY = m.bbox.max[1];
      break;
    }
  }

  // ---- Floating objects -----------------------------------------------------
  const eps = 0.01 * sceneDiag;
  const overlaps = (a, b, pad) => {
    for (let axis = 0; axis < 3; axis++) {
      if (a.min[axis] - pad > b.max[axis] || b.min[axis] - pad > a.max[axis]) return false;
    }
    return true;
  };

  if (validBoxes.length > 1) {
    const floatThreshold = groundY + 0.03 * sceneHeight;
    for (const m of validBoxes) {
      if (m === groundMesh) continue;
      if (m.bbox.min[1] <= floatThreshold) continue;
      let supported = false;
      for (const other of validBoxes) {
        if (other === m) continue;
        if (overlaps(m.bbox, other.bbox, eps)) {
          supported = true;
          break;
        }
      }
      if (!supported) {
        issues.push({
          id: "FLOATING_OBJECT",
          severity: "warning",
          message: "Object hovers in mid-air: above the ground and not touching anything.",
          objects: [m.path],
          suggestion:
            "Lower it to rest on the ground/another object (threeHelpers anchor()/stackY() do this by bounding box). Intentional for flying things — then ignore.",
        });
      }
    }
  }

  // ---- Intersecting meshes (info: often intentional kitbashing) -------------
  if (validBoxes.length <= 300) {
    let reported = 0;
    for (let i = 0; i < validBoxes.length && reported < 10; i++) {
      for (let j = i + 1; j < validBoxes.length && reported < 10; j++) {
        const a = validBoxes[i].bbox;
        const b = validBoxes[j].bbox;
        if (validBoxes[i] === groundMesh || validBoxes[j] === groundMesh) continue;
        if (!overlaps(a, b, 0)) continue;
        let overlapVol = 1;
        let volA = 1;
        let volB = 1;
        for (let axis = 0; axis < 3; axis++) {
          overlapVol *= Math.max(0, Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]));
          volA *= Math.max(1e-9, a.max[axis] - a.min[axis]);
          volB *= Math.max(1e-9, b.max[axis] - b.min[axis]);
        }
        if (overlapVol / Math.min(volA, volB) > 0.35) {
          issues.push({
            id: "INTERSECTING_MESHES",
            severity: "info",
            message: "Bounding boxes overlap substantially — often intentional (kitbashing), review only.",
            objects: [validBoxes[i].path, validBoxes[j].path],
            suggestion: "If unintentional, separate the parts or shrink one of them.",
          });
          reported++;
        }
      }
    }
  }

  // ---- Lights ----------------------------------------------------------------
  if (lights.length === 0 && litMaterialCount > 0) {
    issues.push({
      id: "NO_LIGHTS",
      severity: "error",
      message: "Scene uses lit materials (Standard/Phong/Lambert/Toon) but has zero lights — everything renders black.",
      suggestion: "Add a DirectionalLight + AmbientLight (threeHelpers threePointLights()), or switch to MeshBasicMaterial.",
    });
  }

  // ---- Frustum: which meshes does the camera actually see? -------------------
  // planes from M = projectionMatrix * matrixWorldInverse (column-major)
  const pm = camera.projectionMatrix.elements;
  const vm = camera.matrixWorldInverse.elements;
  const M = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += pm[k * 4 + row] * vm[col * 4 + k];
      M[col * 4 + row] = s;
    }
  }
  const planes = [];
  const row = (r) => [M[r], M[4 + r], M[8 + r], M[12 + r]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  for (const [sign, rr] of [[1, r0], [-1, r0], [1, r1], [-1, r1], [1, r2], [-1, r2]]) {
    planes.push([r3[0] + sign * rr[0], r3[1] + sign * rr[1], r3[2] + sign * rr[2], r3[3] + sign * rr[3]]);
  }
  const boxOutside = (bbox) =>
    planes.some((p) => {
      // pick the box corner most aligned with the plane normal; if even that is behind, the box is fully outside
      const x = p[0] > 0 ? bbox.max[0] : bbox.min[0];
      const y = p[1] > 0 ? bbox.max[1] : bbox.min[1];
      const z = p[2] > 0 ? bbox.max[2] : bbox.min[2];
      return p[0] * x + p[1] * y + p[2] * z + p[3] < 0;
    });

  const outside = validBoxes.filter((m) => boxOutside(m.bbox));
  if (validBoxes.length > 0 && outside.length === validBoxes.length) {
    issues.push({
      id: "OUT_OF_FRUSTUM",
      severity: "error",
      message: "No mesh is inside the camera frustum — the camera is pointing away from the entire scene.",
      suggestion: "Point the camera at the scene center (camera.lookAt) or use threeHelpers frameCamera().",
    });
  } else {
    for (const m of outside.slice(0, 8)) {
      issues.push({
        id: "OUT_OF_FRUSTUM",
        severity: "warning",
        message: "Object is completely outside the camera view.",
        objects: [m.path],
        suggestion: "Reposition the object or widen the camera framing if it should be visible.",
      });
    }
  }

  // ---- Camera clipping vs scene bounds ---------------------------------------
  if (validBoxes.length > 0) {
    const center = [(sceneMin[0] + sceneMax[0]) / 2, (sceneMin[1] + sceneMax[1]) / 2, (sceneMin[2] + sceneMax[2]) / 2];
    const radius = sceneDiag / 2;
    const camPos = [camera.position.x, camera.position.y, camera.position.z];
    const dist = Math.hypot(camPos[0] - center[0], camPos[1] - center[1], camPos[2] - center[2]);
    if (typeof camera.near === "number" && dist - radius < camera.near && dist > 1e-6) {
      issues.push({
        id: "CAMERA_CLIPPING",
        severity: "warning",
        message: `Scene geometry may be cut by the near plane (near=${camera.near}, closest geometry ≈ ${(dist - radius).toFixed(3)}).`,
        suggestion: "Reduce camera.near or move the camera back.",
      });
    }
    if (typeof camera.far === "number" && dist + radius > camera.far) {
      issues.push({
        id: "CAMERA_CLIPPING",
        severity: "warning",
        message: `Scene geometry extends beyond the far plane (far=${camera.far}).`,
        suggestion: "Increase camera.far.",
      });
    }
  }

  // ---- Texture / material variety (info) --------------------------------------
  if (meshes.length >= 3 && texturedCount === 0 && materialColors.size <= 2) {
    issues.push({
      id: "UNTEXTURED_SCENE",
      severity: "info",
      message: "No textures and almost no color variety — the model will look flat and monotone.",
      suggestion:
        "Add procedural textures (TEX.wood/brick/noise via /__helpers/texture-helpers.js) or vary material colors/roughness per part. See get_guidelines topic 'texturing'.",
    });
  }
  if (defaultColorCount >= 3) {
    issues.push({
      id: "DEFAULT_MATERIALS",
      severity: "info",
      message: `${defaultColorCount} meshes use plain white untextured materials.`,
      suggestion: "Give parts intentional colors/materials — a 3-color palette with value contrast reads much better.",
    });
  }
  if (totalTriangles > 500000) {
    issues.push({
      id: "HEAVY_SCENE",
      severity: "info",
      message: `Scene has ~${Math.round(totalTriangles / 1000)}k triangles — may render slowly.`,
      suggestion: "Reduce segment counts on spheres/cylinders you don't see up close.",
    });
  }

  const stats = {
    objects: (() => {
      let c = 0;
      scene.traverse(() => c++);
      return c;
    })(),
    meshes: meshes.length,
    lights: lights,
    triangles: Math.round(totalTriangles),
    textured_meshes: texturedCount,
    material_colors: materialColors.size,
    bounding_box:
      validBoxes.length > 0
        ? { min: sceneMin.map(round3), max: sceneMax.map(round3), size: sceneSize.map(round3) }
        : null,
    ground: groundMesh ? { mesh: groundMesh.path, y: round3(groundY) } : { mesh: null, y: round3(groundY) },
    camera: {
      type: camera.type,
      position: [camera.position.x, camera.position.y, camera.position.z].map(round3),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    },
    renderer: { webgl2: isWebGL2 },
  };

  function round3(v) {
    return Math.round(v * 1000) / 1000;
  }

  return { ok: true, stats, issues };
})

// Scene-graph dump for inspect_scene. Requires window.__scene.
(({ maxDepth, filter }) => {
  const reg = window.__scene;
  if (!reg || !reg.scene || !reg.camera) {
    return { ok: false, error: "window.__scene not registered" };
  }
  const { scene, camera } = reg;
  scene.updateMatrixWorld(true);

  let nodeCount = 0;
  let truncated = 0;
  const MAX_NODES = 200;
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const vec = (v) => [round3(v.x), round3(v.y), round3(v.z)];
  const lower = (filter || "").toLowerCase();

  const matchesFilter = (obj) =>
    !lower ||
    (obj.name && obj.name.toLowerCase().includes(lower)) ||
    obj.type.toLowerCase().includes(lower);

  const subtreeMatches = (obj) => matchesFilter(obj) || obj.children.some(subtreeMatches);

  const worldBBox = (obj) => {
    const geo = obj.geometry;
    if (!geo) return null;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb || !isFinite(bb.min.x)) return null;
    const e = obj.matrixWorld.elements;
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
    if (!isFinite(min[0])) return null;
    return {
      min: min.map(round3),
      max: max.map(round3),
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map(round3),
    };
  };

  const dump = (obj, depth) => {
    if (lower && !subtreeMatches(obj)) return null;
    if (nodeCount >= MAX_NODES) {
      truncated++;
      return null;
    }
    nodeCount++;

    const node = {
      name: obj.name || null,
      type: obj.type,
      visible: obj.visible,
      position: vec(obj.position),
      rotation_deg: [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((r) => round3((r * 180) / Math.PI)),
      scale: vec(obj.scale),
    };
    const bbox = obj.isMesh ? worldBBox(obj) : null;
    if (bbox) node.world_bbox = bbox;
    if (obj.isMesh && obj.geometry) {
      const pos = obj.geometry.attributes && obj.geometry.attributes.position;
      node.geometry = {
        type: obj.geometry.type,
        vertices: pos ? pos.count : 0,
        triangles: obj.geometry.index ? obj.geometry.index.count / 3 : pos ? Math.floor(pos.count / 3) : 0,
        has_uv: !!(obj.geometry.attributes && obj.geometry.attributes.uv),
        has_normals: !!(obj.geometry.attributes && obj.geometry.attributes.normal),
      };
      const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (m) {
        node.material = {
          type: m.type,
          color: m.color && m.color.getHexString ? "#" + m.color.getHexString() : null,
          textured: !!m.map,
          metalness: typeof m.metalness === "number" ? round3(m.metalness) : undefined,
          roughness: typeof m.roughness === "number" ? round3(m.roughness) : undefined,
          opacity: m.opacity !== 1 ? m.opacity : undefined,
        };
      }
    }
    if (obj.isLight) {
      node.light = { intensity: obj.intensity, color: obj.color && "#" + obj.color.getHexString() };
    }
    if (depth < maxDepth && obj.children.length > 0) {
      const children = obj.children.map((c) => dump(c, depth + 1)).filter(Boolean);
      if (children.length > 0) node.children = children;
      if (obj.children.length > children.length && nodeCount >= MAX_NODES) {
        node.children_truncated = obj.children.length - children.length;
      }
    } else if (obj.children.length > 0) {
      node.children_omitted = obj.children.length;
    }
    return node;
  };

  const tree = dump(scene, 0);
  return {
    ok: true,
    tree,
    node_count: nodeCount,
    truncated_nodes: truncated,
    camera: {
      type: camera.type,
      position: vec(camera.position),
      rotation_deg: [camera.rotation.x, camera.rotation.y, camera.rotation.z].map((r) => round3((r * 180) / Math.PI)),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    },
  };
})

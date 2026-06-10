// Deep-mode multi-view: positions the registered Three.js camera on an orbit
// around the scene's bounding sphere and forces a fresh render so the
// screenshot captures a just-presented frame (WebGL drawing buffers are
// discarded after compositing — capturing without re-rendering can be blank).
// Works without importing THREE: only instance methods/matrices are used.
(async ({ azimuthDeg, elevationDeg, distanceFactor }) => {
  const reg = window.__scene;
  if (!reg || !reg.scene || !reg.camera || !reg.renderer) {
    return { ok: false, error: "window.__scene not registered" };
  }
  const { scene, camera, renderer } = reg;
  scene.updateMatrixWorld(true);

  // World-space AABB of all visible meshes (manual: corners x matrixWorld).
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  scene.traverse((obj) => {
    if (!obj.visible || !obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb || !isFinite(bb.min.x) || !isFinite(bb.max.x)) return;
    const e = obj.matrixWorld.elements;
    for (let ci = 0; ci < 8; ci++) {
      const x = ci & 1 ? bb.max.x : bb.min.x;
      const y = ci & 2 ? bb.max.y : bb.min.y;
      const z = ci & 4 ? bb.max.z : bb.min.z;
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (!isFinite(wx) || !isFinite(wy) || !isFinite(wz)) return;
      min = [Math.min(min[0], wx), Math.min(min[1], wy), Math.min(min[2], wz)];
      max = [Math.max(max[0], wx), Math.max(max[1], wy), Math.max(max[2], wz)];
      found = true;
    }
  });
  if (!found) return { ok: false, error: "no finite mesh geometry found in scene" };

  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const radius = Math.max(0.001, Math.hypot(size[0], size[1], size[2]) / 2);

  // Save camera state once so repeated views don't drift.
  if (!window.__c3dCamSaved) {
    window.__c3dCamSaved = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      quat: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
      near: camera.near,
      far: camera.far,
    };
  }

  const fovRad = ((camera.fov || 50) * Math.PI) / 180;
  const fitDist = (radius / Math.sin(fovRad / 2)) * 1.25;
  const dist = fitDist * (distanceFactor || 1.0);

  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  camera.position.set(
    center[0] + dist * Math.cos(el) * Math.sin(az),
    center[1] + dist * Math.sin(el),
    center[2] + dist * Math.cos(el) * Math.cos(az)
  );
  camera.lookAt(center[0], center[1], center[2]);
  camera.near = Math.max(dist / 1000, 0.001);
  camera.far = dist + radius * 10;
  if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  return { ok: true, center, radius, distance: dist };
})

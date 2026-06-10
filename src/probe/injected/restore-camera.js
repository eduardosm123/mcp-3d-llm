// Restores the camera saved by orbit.js after all views were captured.
(() => {
  const reg = window.__scene;
  const saved = window.__c3dCamSaved;
  if (!reg || !reg.camera || !saved) return false;
  const { camera } = reg;
  camera.position.set(saved.pos[0], saved.pos[1], saved.pos[2]);
  camera.quaternion.set(saved.quat[0], saved.quat[1], saved.quat[2], saved.quat[3]);
  camera.near = saved.near;
  camera.far = saved.far;
  if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
  if (reg.renderer && reg.scene) reg.renderer.render(reg.scene, camera);
  delete window.__c3dCamSaved;
  return true;
})

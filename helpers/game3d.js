// game3d.js — 3D game scaffolding over Three.js.
// Import as an ES module (the page must map "three" in its importmap):
//   import * as G3D from "/__helpers/game3d.js";
//
//   const w = G3D.world(document.getElementById("c"), { ground: { size: 40 } });
//   const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8), mat);
//   w.scene.add(player);
//   const ctrl = G3D.characterController(player, w, { speed: 6, jump: 8 });
//   G3D.thirdPersonCamera(w, player, { distance: 8, height: 4 });
//   w.loop((dt) => { ctrl.update(dt); });
//
// Provides: world bootstrap (renderer/scene/camera/lights + window.__scene
// registration), fixed input handling, AABB colliders with moveAndCollide,
// a WASD+jump character controller, third-person camera, spawners and
// raycast picking. Registers a default window.__state for playtests.
import * as THREE from "three";

function normKey(e) {
  if (e.key === " ") return "Space";
  return e.key.length > 1 ? e.key : e.key.toLowerCase();
}

export function world(canvas, { background = 0x141925, ground = { size: 40, color: 0x2c3140 }, fog = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(background, 30, 90);
  const camera = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 200);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(10, 18, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8899bb, 0.6));
  scene.add(new THREE.HemisphereLight(0x9db4ff, 0x3a2f28, 0.4));

  const w = {
    THREE,
    renderer,
    scene,
    camera,
    colliders: [],
    time: 0,
    keys: {
      _held: new Set(),
      _pressed: new Set(),
      held: (k) => (w.keys._held.has(k) ? 1 : 0),
      pressed: (k) => w.keys._pressed.has(k),
    },

    addCollider(object) {
      object.updateWorldMatrix(true, true);
      this.colliders.push(object);
      return object;
    },

    /** World-space AABB of an object (cached per call). */
    bbox(object) {
      return new THREE.Box3().setFromObject(object);
    },

    /**
     * Moves `mesh` by `delta` (Vector3) with axis-separated AABB collision
     * against registered colliders. Returns { onGround, hit }.
     */
    moveAndCollide(mesh, delta) {
      const result = { onGround: false, hit: false };
      const boxes = this.colliders.map((c) => this.bbox(c));
      for (const axis of ["x", "y", "z"]) {
        if (delta[axis] === 0) continue;
        mesh.position[axis] += delta[axis];
        mesh.updateWorldMatrix(true, false);
        const mb = this.bbox(mesh);
        for (const cb of boxes) {
          if (!mb.intersectsBox(cb)) continue;
          result.hit = true;
          if (axis === "y") {
            if (delta.y < 0) {
              mesh.position.y += cb.max.y - mb.min.y + 0.0001;
              result.onGround = true;
            } else {
              mesh.position.y -= mb.max.y - cb.min.y + 0.0001;
            }
          } else if (delta[axis] > 0) {
            mesh.position[axis] -= mb.max[axis === "x" ? "x" : "z"] - cb.min[axis === "x" ? "x" : "z"] + 0.0001;
          } else {
            mesh.position[axis] += cb.max[axis === "x" ? "x" : "z"] - mb.min[axis === "x" ? "x" : "z"] + 0.0001;
          }
          mesh.updateWorldMatrix(true, false);
          mb.copy(this.bbox(mesh));
        }
      }
      return result;
    },

    /** Raycast from screen coords (canvas px) into the scene. */
    pick(x, y, objects) {
      const ndc = new THREE.Vector2((x / canvas.width) * 2 - 1, -(y / canvas.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      return ray.intersectObjects(objects ?? this.scene.children, true)[0] ?? null;
    },

    /** Distance check helper for pickups/triggers. */
    near(a, b, dist) {
      return a.position.distanceTo(b.position) < dist;
    },

    /** Starts the game loop. update(dt, world) runs each frame (dt capped). */
    loop(update) {
      const clock = new THREE.Clock();
      const tick = () => {
        const dt = Math.min(clock.getDelta(), 0.05);
        this.time += dt;
        update(dt, this);
        this.keys._pressed.clear();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return this;
    },
  };

  if (ground) {
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(ground.size, 1, ground.size),
      new THREE.MeshStandardMaterial({ color: ground.color ?? 0x2c3140, roughness: 0.95 })
    );
    g.name = "ground";
    g.position.y = -0.5;
    scene.add(g);
    w.addCollider(g);
    w.ground = g;
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    const k = normKey(e);
    if (!e.repeat) w.keys._pressed.add(k);
    w.keys._held.add(k);
    w.keys._held.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    w.keys._held.delete(normKey(e));
    w.keys._held.delete(e.code);
  });

  window.__scene = { scene, camera, renderer };
  window.__redraw = () => renderer.render(scene, camera);
  renderer.render(scene, camera);
  if (!window.__state) {
    window.__state = () => ({ time: Math.round(w.time * 100) / 100, objects: scene.children.length });
  }
  return w;
}

/**
 * WASD/arrows + Space character controller with gravity and collision.
 * Movement uses WORLD axes by default (d = +x, w = -z) — predictable and
 * playtest-friendly. Pass cameraRelative: true for camera-relative movement
 * (note: combined with a following camera it produces curved paths).
 * Call ctrl.update(dt) in loop().
 */
export function characterController(mesh, world, { speed = 6, jump = 8, gravity = 22, keys, cameraRelative = false } = {}) {
  const vel = new THREE.Vector3();
  const ctrl = {
    velocity: vel,
    onGround: false,
    update(dt) {
      const k = keys ?? world.keys;
      const ix = k.held("d") + k.held("ArrowRight") - k.held("a") - k.held("ArrowLeft");
      const iz = k.held("s") + k.held("ArrowDown") - k.held("w") - k.held("ArrowUp");

      const move = new THREE.Vector3();
      if (cameraRelative) {
        const fwd = new THREE.Vector3();
        world.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate();
        move.addScaledVector(fwd, -iz).addScaledVector(right, -ix);
      } else {
        move.set(ix, 0, iz);
      }
      if (move.lengthSq() > 0) {
        move.normalize();
        // face the walk direction
        mesh.rotation.y = Math.atan2(move.x, move.z);
      }
      vel.x = move.x * speed;
      vel.z = move.z * speed;

      vel.y -= gravity * dt;
      if (this.onGround && k.pressed("Space")) vel.y = jump;

      const res = world.moveAndCollide(mesh, new THREE.Vector3(vel.x * dt, vel.y * dt, vel.z * dt));
      this.onGround = res.onGround;
      if (res.onGround && vel.y < 0) vel.y = 0;
    },
  };
  return ctrl;
}

/** Smooth third-person follow camera. Call cam.update(dt) in loop(). */
export function thirdPersonCamera(world, target, { distance = 8, height = 4, lerp = 4 } = {}) {
  const cam = {
    update(dt) {
      const behind = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), target.rotation.y);
      const desired = target.position
        .clone()
        .addScaledVector(behind, -distance)
        .add(new THREE.Vector3(0, height, 0));
      world.camera.position.lerp(desired, Math.min(1, lerp * dt));
      world.camera.lookAt(target.position.x, target.position.y + 1, target.position.z);
    },
  };
  return cam;
}

/** Simple interval spawner: returns a handle; call h.update(dt) in loop(). */
export function spawner({ every = 2, max = 10, create }) {
  let acc = 0;
  const items = [];
  return {
    items,
    update(dt, world) {
      acc += dt;
      items.forEach((it) => it.userData?.update?.(dt, world));
      if (acc >= every && items.length < max) {
        acc = 0;
        const obj = create(items.length);
        if (obj) items.push(obj);
      }
    },
    remove(obj) {
      const i = items.indexOf(obj);
      if (i >= 0) items.splice(i, 1);
      obj.parent?.remove(obj);
    },
  };
}

export { THREE };

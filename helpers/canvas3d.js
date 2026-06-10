// canvas3d.js — a small software-3D engine over the Canvas 2D API.
// Include with: <script src="/__helpers/canvas3d.js"></script>
//
//   const s = C3D.scene(document.getElementById("c"), { background: "#1a1a2e" });
//   C3D.box({ w: 2, h: 1, d: 1 }).at(0, 0.5, 0).color("#c44").addTo(s);
//   C3D.sphere({ r: 0.5 }).at(0, 1.5, 0).color("#4c8").addTo(s);
//   s.light({ dir: [-0.5, -1, -0.3], ambient: 0.35 });
//   s.camera({ azimuth_deg: 35, elevation_deg: 25 });   // distance auto-fits
//   s.render();
//
// World axes: +Y up, +Z towards the default camera. Angles in degrees.
// Rendering: painter's algorithm (faces depth-sorted by centroid), flat
// shading, backface culling for closed meshes. Large interpenetrating faces
// can sort wrongly — split big geometry into smaller parts.
// Registers window.__setView and window.__redraw automatically, so the
// canvas3d MCP server can capture multi-angle screenshots.
(() => {
  "use strict";

  const DEG = Math.PI / 180;

  // ---- color utils ----------------------------------------------------------
  function parseColor(c) {
    if (Array.isArray(c)) return c;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // ---- vector / matrix ------------------------------------------------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  // Newell's method: robust polygon normal.
  function polyNormal(pts) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return normalize([nx, ny, nz]);
  }

  function modelTransform(mesh) {
    const [rx, ry, rz] = mesh._rot.map((d) => d * DEG);
    const [sx, sy, sz] = mesh._scl;
    const [tx, ty, tz] = mesh._pos;
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);
    return (v) => {
      let [x, y, z] = [v[0] * sx, v[1] * sy, v[2] * sz];
      let t = y;
      y = t * cx - z * sxr; // X rotation
      z = t * sxr + z * cx;
      t = x;
      x = t * cy + z * syr; // Y rotation
      z = -t * syr + z * cy;
      t = x;
      x = t * cz - y * szr; // Z rotation
      y = t * szr + y * cz;
      return [x + tx, y + ty, z + tz];
    };
  }

  // ---- mesh -----------------------------------------------------------------
  class Mesh {
    constructor(verts, faces, { doubleSided = false } = {}) {
      this.verts = verts;
      this.faces = faces;
      this._pos = [0, 0, 0];
      this._rot = [0, 0, 0];
      this._scl = [1, 1, 1];
      this._color = [160, 160, 170];
      this._pattern = null;
      this._patternScale = 1;
      this._outline = false;
      this._doubleSided = doubleSided;
    }
    at(x, y, z) { this._pos = [x, y, z]; return this; }
    rotate(rx, ry, rz) { this._rot = [rx, ry, rz]; return this; }
    scaleBy(s) { this._scl = Array.isArray(s) ? s : [s, s, s]; return this; }
    color(c) { this._color = parseColor(c); return this; }
    /** Fill faces with a texture canvas (e.g. TEX.wood()). Shading still applies. */
    texture(canvas, { scale = 1 } = {}) { this._pattern = canvas; this._patternScale = scale; return this; }
    outline(on = true) { this._outline = on; return this; }
    doubleSided(on = true) { this._doubleSided = on; return this; }
    addTo(scene) { scene.add(this); return this; }
    worldVerts() {
      const xf = modelTransform(this);
      return this.verts.map(xf);
    }
  }

  // ---- primitives -----------------------------------------------------------
  function box({ w = 1, h = 1, d = 1 } = {}) {
    const x = w / 2, y = h / 2, z = d / 2;
    const v = [
      [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
      [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    ];
    // counter-clockwise seen from outside
    const f = [
      [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4],
    ];
    return new Mesh(v, f);
  }

  function sphere({ r = 0.5, segments = 16, rings = 12 } = {}) {
    const verts = [];
    const faces = [];
    for (let i = 0; i <= rings; i++) {
      const phi = (i / rings) * Math.PI;
      for (let j = 0; j < segments; j++) {
        const theta = (j / segments) * 2 * Math.PI;
        verts.push([
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        ]);
      }
    }
    const idx = (i, j) => i * segments + (j % segments);
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segments; j++) {
        faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)]);
      }
    }
    return new Mesh(verts, faces);
  }

  function cylinder({ r = 0.5, r2, h = 1, segments = 16 } = {}) {
    const rTop = r2 === undefined ? r : r2;
    const verts = [];
    const faces = [];
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * 2 * Math.PI;
      verts.push([r * Math.cos(a), -h / 2, r * Math.sin(a)]);
    }
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * 2 * Math.PI;
      verts.push([rTop * Math.cos(a), h / 2, rTop * Math.sin(a)]);
    }
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      faces.push([j, j2, segments + j2, segments + j]);
    }
    faces.push(Array.from({ length: segments }, (_, j) => segments - 1 - j)); // bottom cap
    if (rTop > 1e-6) faces.push(Array.from({ length: segments }, (_, j) => segments + j)); // top cap
    return new Mesh(verts, faces);
  }

  const cone = ({ r = 0.5, h = 1, segments = 16 } = {}) => cylinder({ r, r2: 0.0000001, h, segments });

  function plane({ w = 1, d = 1 } = {}) {
    const x = w / 2, z = d / 2;
    return new Mesh(
      [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]],
      [[3, 2, 1, 0]],
      { doubleSided: true }
    );
  }

  /** Revolves a 2D profile ([ [radius, y], ... ]) around the Y axis. */
  function lathe(profile, segments = 16) {
    const verts = [];
    const faces = [];
    const rows = profile.length;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * 2 * Math.PI;
        verts.push([profile[i][0] * Math.cos(a), profile[i][1], profile[i][0] * Math.sin(a)]);
      }
    }
    const idx = (i, j) => i * segments + (j % segments);
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < segments; j++) {
        faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)]);
      }
    }
    return new Mesh(verts, faces, { doubleSided: true });
  }

  /** Extrudes a 2D polygon ([ [x, y], ... ], counter-clockwise) along Z. */
  function extrude(points, depth = 1) {
    const n = points.length;
    const hz = depth / 2;
    const verts = [];
    for (const [x, y] of points) verts.push([x, y, hz]); // front
    for (const [x, y] of points) verts.push([x, y, -hz]); // back
    const faces = [];
    faces.push(Array.from({ length: n }, (_, i) => i)); // front (CCW towards +Z)
    faces.push(Array.from({ length: n }, (_, i) => n + (n - 1 - i))); // back
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([j, i, n + i, n + j]);
    }
    return new Mesh(verts, faces);
  }

  // ---- scene ----------------------------------------------------------------
  class Scene {
    constructor(canvas, { background = "#202028" } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.background = background;
      this.meshes = [];
      this._cam = { azimuth_deg: 35, elevation_deg: 25, distance: 0, target: null, fov: 50 };
      this._light = { dir: normalize([-0.5, -1, -0.4]), ambient: 0.35 };

      // MCP server hooks: multi-angle capture + repaint-before-screenshot.
      window.__setView = ({ azimuth_deg, elevation_deg, distance_factor } = {}) => {
        this.camera({
          azimuth_deg: azimuth_deg ?? this._cam.azimuth_deg,
          elevation_deg: elevation_deg ?? this._cam.elevation_deg,
          distance: (distance_factor || 1) * this._fitDistance(),
        });
        this.render();
      };
      window.__redraw = () => this.render();
    }

    add(mesh) { this.meshes.push(mesh); return this; }

    camera({ azimuth_deg, elevation_deg, distance, target, fov } = {}) {
      const c = this._cam;
      if (azimuth_deg !== undefined) c.azimuth_deg = azimuth_deg;
      if (elevation_deg !== undefined) c.elevation_deg = elevation_deg;
      if (distance !== undefined) c.distance = distance;
      if (target !== undefined) c.target = target;
      if (fov !== undefined) c.fov = fov;
      return this;
    }

    light({ dir, ambient } = {}) {
      if (dir) this._light.dir = normalize(dir);
      if (ambient !== undefined) this._light.ambient = ambient;
      return this;
    }

    _bounds() {
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (const mesh of this.meshes) {
        for (const v of mesh.worldVerts()) {
          for (let a = 0; a < 3; a++) {
            if (v[a] < min[a]) min[a] = v[a];
            if (v[a] > max[a]) max[a] = v[a];
          }
        }
      }
      if (!isFinite(min[0])) { min = [-1, -1, -1]; max = [1, 1, 1]; }
      const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      const radius = Math.max(0.001, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
      return { center, radius };
    }

    _fitDistance() {
      const { radius } = this._bounds();
      return (radius / Math.sin((this._cam.fov * DEG) / 2)) * 1.25;
    }

    render() {
      const { canvas, ctx } = this;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, W, H);

      const bounds = this._bounds();
      const target = this._cam.target ?? bounds.center;
      const distance = this._cam.distance || this._fitDistance();
      const az = this._cam.azimuth_deg * DEG;
      const el = this._cam.elevation_deg * DEG;
      const eye = [
        target[0] + distance * Math.cos(el) * Math.sin(az),
        target[1] + distance * Math.sin(el),
        target[2] + distance * Math.cos(el) * Math.cos(az),
      ];
      // camera basis (right, up, forward)
      const fwd = normalize(sub(target, eye));
      const right = normalize(cross(fwd, [0, 1, 0]));
      const up = cross(right, fwd);
      const toCam = (v) => {
        const d = sub(v, eye);
        return [dot(d, right), dot(d, up), dot(d, fwd)];
      };
      const focal = H / 2 / Math.tan((this._cam.fov * DEG) / 2);
      const NEAR = distance * 0.01;
      const project = (c) => [W / 2 + (c[0] * focal) / c[2], H / 2 - (c[1] * focal) / c[2]];

      // gather faces from all meshes
      const drawList = [];
      for (const mesh of this.meshes) {
        const world = mesh.worldVerts();
        const cam = world.map(toCam);
        for (const face of mesh.faces) {
          if (face.some((i) => cam[i][2] <= NEAR)) continue; // behind camera
          const camPts = face.map((i) => cam[i]);
          const nCam = polyNormal(camPts);
          // backface: normal pointing away from the eye (eye at origin, +z forward)
          const centroidCam = camPts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0])
            .map((s) => s / camPts.length);
          const facing = dot(nCam, centroidCam);
          if (!mesh._doubleSided && facing > 0) continue;
          const worldPts = face.map((i) => world[i]);
          let nWorld = polyNormal(worldPts);
          if (facing > 0) nWorld = [-nWorld[0], -nWorld[1], -nWorld[2]]; // double-sided: flip towards viewer
          const lambert = Math.max(0, -dot(nWorld, this._light.dir));
          const shade = Math.min(1, this._light.ambient + lambert * (1 - this._light.ambient) * 1.25);
          // Sort by the farthest vertex, not the centroid: a centroid sort lets
          // huge faces (ground slabs) jump in front of small nearby objects.
          let depth = -Infinity;
          for (const p of camPts) if (p[2] > depth) depth = p[2];
          drawList.push({
            depth,
            pts2d: camPts.map(project),
            color: mesh._color,
            shade,
            pattern: mesh._pattern,
            patternScale: mesh._patternScale,
            outline: mesh._outline,
          });
        }
      }
      drawList.sort((a, b) => b.depth - a.depth);

      for (const f of drawList) {
        ctx.beginPath();
        ctx.moveTo(f.pts2d[0][0], f.pts2d[0][1]);
        for (let i = 1; i < f.pts2d.length; i++) ctx.lineTo(f.pts2d[i][0], f.pts2d[i][1]);
        ctx.closePath();
        if (f.pattern) {
          ctx.save();
          ctx.clip();
          const pat = ctx.createPattern(f.pattern, "repeat");
          ctx.fillStyle = pat;
          const xs = f.pts2d.map((p) => p[0]);
          const ys = f.pts2d.map((p) => p[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          ctx.translate(minX, minY);
          ctx.scale(f.patternScale, f.patternScale);
          ctx.fillRect(0, 0, (Math.max(...xs) - minX) / f.patternScale + 1, (Math.max(...ys) - minY) / f.patternScale + 1);
          ctx.restore();
          // shading overlay on top of the pattern
          ctx.fillStyle = `rgba(0,0,0,${(1 - f.shade) * 0.5})`;
          ctx.fill();
        } else {
          const c = f.color.map((ch) => ch * f.shade);
          ctx.fillStyle = rgb(c);
          ctx.fill();
          ctx.strokeStyle = rgb(c); // hairline stroke hides AA seams between faces
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (f.outline) {
          ctx.strokeStyle = "rgba(0,0,0,0.55)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      return this;
    }
  }

  window.C3D = {
    scene: (canvas, opts) => new Scene(canvas, opts),
    box,
    sphere,
    cylinder,
    cone,
    plane,
    lathe,
    extrude,
  };
})();

// webgl-helpers.js — boilerplate-killer for raw WebGL scenes.
// Include with: <script src="/__helpers/webgl-helpers.js"></script>
//
//   const gl = GLH.init(document.getElementById("c"), { clear: [0.1, 0.1, 0.18, 1] });
//   const prog = GLH.program(gl, GLH.defaultShaders.lambert.vs, GLH.defaultShaders.lambert.fs);
//   const cube = GLH.upload(gl, GLH.mesh.cube(1));
//   function draw(view) {
//     GLH.clear(gl);
//     const proj = GLH.mat4.perspective(50, gl.canvas.width / gl.canvas.height, 0.1, 100);
//     GLH.draw(gl, prog, cube, {
//       u_model: GLH.mat4.translate(GLH.mat4.identity(), 0, 0.5, 0),
//       u_view: view, u_proj: proj,
//       u_color: [0.8, 0.3, 0.2], u_lightDir: [-0.5, -1, -0.3], u_ambient: 0.3,
//     });
//   }
//   GLH.registerView(({ azimuth_deg, elevation_deg, distance_factor }) => {
//     draw(GLH.orbitCamera({ azimuth_deg, elevation_deg, distance: 4 * (distance_factor || 1) }));
//   });
//   window.__setView({ azimuth_deg: 35, elevation_deg: 25 });  // initial frame
//
// Matrices are column-major Float32Array(16) — pass directly to uniformMatrix4fv.
(() => {
  "use strict";

  // ---- mat4 (column-major) --------------------------------------------------
  const mat4 = {
    identity() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    multiply(a, b) {
      const out = new Float32Array(16);
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
          out[col * 4 + row] = s;
        }
      }
      return out;
    },
    perspective(fovDeg, aspect, near, far) {
      const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
      const m = new Float32Array(16);
      m[0] = f / aspect;
      m[5] = f;
      m[10] = (far + near) / (near - far);
      m[11] = -1;
      m[14] = (2 * far * near) / (near - far);
      return m;
    },
    lookAt(eye, target, upHint = [0, 1, 0]) {
      const fwd = norm3(sub3(target, eye));
      const right = norm3(cross3(fwd, upHint));
      const up = cross3(right, fwd);
      const m = new Float32Array(16);
      m[0] = right[0]; m[4] = right[1]; m[8] = right[2];
      m[1] = up[0]; m[5] = up[1]; m[9] = up[2];
      m[2] = -fwd[0]; m[6] = -fwd[1]; m[10] = -fwd[2];
      m[12] = -dot3(right, eye);
      m[13] = -dot3(up, eye);
      m[14] = dot3(fwd, eye);
      m[15] = 1;
      return m;
    },
    translate(m, x, y, z) {
      const t = mat4.identity();
      t[12] = x; t[13] = y; t[14] = z;
      return mat4.multiply(m, t);
    },
    scale(m, x, y, z) {
      const s = mat4.identity();
      s[0] = x; s[5] = y === undefined ? x : y; s[10] = z === undefined ? x : z;
      return mat4.multiply(m, s);
    },
    rotateX(m, deg) {
      const r = mat4.identity();
      const c = Math.cos(deg * Math.PI / 180);
      const s = Math.sin(deg * Math.PI / 180);
      r[5] = c; r[9] = -s; r[6] = s; r[10] = c;
      return mat4.multiply(m, r);
    },
    rotateY(m, deg) {
      const r = mat4.identity();
      const c = Math.cos(deg * Math.PI / 180);
      const s = Math.sin(deg * Math.PI / 180);
      r[0] = c; r[8] = s; r[2] = -s; r[10] = c;
      return mat4.multiply(m, r);
    },
    rotateZ(m, deg) {
      const r = mat4.identity();
      const c = Math.cos(deg * Math.PI / 180);
      const s = Math.sin(deg * Math.PI / 180);
      r[0] = c; r[4] = -s; r[1] = s; r[5] = c;
      return mat4.multiply(m, r);
    },
    transpose(m) {
      const out = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[r * 4 + c] = m[c * 4 + r];
      return out;
    },
  };
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm3 = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  // ---- context / program ----------------------------------------------------
  function init(canvas, { clear = [0.08, 0.08, 0.12, 1], contextAttributes = {} } = {}) {
    // Always pass an explicit attributes object: some headless/SwiftShader
    // builds lose a webgl2 context created without one. preserveDrawingBuffer
    // keeps screenshots reliable for render-once scenes.
    const attrs = Object.assign({ antialias: true, depth: true, preserveDrawingBuffer: true }, contextAttributes);
    const gl = canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs);
    if (!gl) throw new Error("WebGL not available");
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.viewport(0, 0, canvas.width, canvas.height);
    return gl;
  }

  function clear(gl) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Compiles + links; throws with the shader info log on failure. */
  function program(gl, vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(
          (type === gl.VERTEX_SHADER ? "Vertex" : "Fragment") + " shader error:\n" + gl.getShaderInfoLog(sh)
        );
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error:\n" + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  const defaultShaders = {
    flat: {
      vs: `attribute vec3 a_position;
uniform mat4 u_model, u_view, u_proj;
void main() { gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0); }`,
      fs: `precision mediump float;
uniform vec3 u_color;
void main() { gl_FragColor = vec4(u_color, 1.0); }`,
    },
    lambert: {
      vs: `attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_model, u_view, u_proj;
varying vec3 v_normal;
void main() {
  v_normal = mat3(u_model) * a_normal;
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
}`,
      fs: `precision mediump float;
uniform vec3 u_color;
uniform vec3 u_lightDir;
uniform float u_ambient;
varying vec3 v_normal;
void main() {
  float diff = max(0.0, dot(normalize(v_normal), -normalize(u_lightDir)));
  gl_FragColor = vec4(u_color * (u_ambient + diff * (1.0 - u_ambient)), 1.0);
}`,
    },
    textured: {
      vs: `attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;
uniform mat4 u_model, u_view, u_proj;
varying vec3 v_normal;
varying vec2 v_uv;
void main() {
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
}`,
      fs: `precision mediump float;
uniform sampler2D u_texture;
uniform vec3 u_lightDir;
uniform float u_ambient;
varying vec3 v_normal;
varying vec2 v_uv;
void main() {
  float diff = max(0.0, dot(normalize(v_normal), -normalize(u_lightDir)));
  vec3 tex = texture2D(u_texture, v_uv).rgb;
  gl_FragColor = vec4(tex * (u_ambient + diff * (1.0 - u_ambient)), 1.0);
}`,
    },
  };

  // ---- mesh generators ({positions, normals, uvs, indices}) ------------------
  const mesh = {
    cube(size = 1) {
      const s = size / 2;
      const faces = [
        { n: [0, 0, 1], corners: [[-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]] },
        { n: [0, 0, -1], corners: [[s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, s, -s]] },
        { n: [1, 0, 0], corners: [[s, -s, s], [s, -s, -s], [s, s, -s], [s, s, s]] },
        { n: [-1, 0, 0], corners: [[-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, s, -s]] },
        { n: [0, 1, 0], corners: [[-s, s, s], [s, s, s], [s, s, -s], [-s, s, -s]] },
        { n: [0, -1, 0], corners: [[-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s]] },
      ];
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      let base = 0;
      for (const f of faces) {
        for (let i = 0; i < 4; i++) {
          positions.push(...f.corners[i]);
          normals.push(...f.n);
          uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
      return { positions, normals, uvs, indices };
    },

    uvSphere(r = 0.5, lat = 12, lon = 16) {
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      for (let i = 0; i <= lat; i++) {
        const phi = (i / lat) * Math.PI;
        for (let j = 0; j <= lon; j++) {
          const theta = (j / lon) * 2 * Math.PI;
          const n = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
          positions.push(n[0] * r, n[1] * r, n[2] * r);
          normals.push(...n);
          uvs.push(j / lon, i / lat);
        }
      }
      for (let i = 0; i < lat; i++) {
        for (let j = 0; j < lon; j++) {
          const a = i * (lon + 1) + j;
          const b = a + lon + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      return { positions, normals, uvs, indices };
    },

    cylinder(r = 0.5, h = 1, segments = 16) {
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      // side
      for (let j = 0; j <= segments; j++) {
        const a = (j / segments) * 2 * Math.PI;
        const c = Math.cos(a);
        const s = Math.sin(a);
        positions.push(r * c, -h / 2, r * s, r * c, h / 2, r * s);
        normals.push(c, 0, s, c, 0, s);
        uvs.push(j / segments, 0, j / segments, 1);
      }
      for (let j = 0; j < segments; j++) {
        const a = j * 2;
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
      // caps
      for (const top of [1, -1]) {
        const baseIdx = positions.length / 3;
        positions.push(0, (top * h) / 2, 0);
        normals.push(0, top, 0);
        uvs.push(0.5, 0.5);
        for (let j = 0; j <= segments; j++) {
          const a = (j / segments) * 2 * Math.PI;
          positions.push(r * Math.cos(a), (top * h) / 2, r * Math.sin(a));
          normals.push(0, top, 0);
          uvs.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
        }
        for (let j = 0; j < segments; j++) {
          if (top === 1) indices.push(baseIdx, baseIdx + 2 + j, baseIdx + 1 + j);
          else indices.push(baseIdx, baseIdx + 1 + j, baseIdx + 2 + j);
        }
      }
      return { positions, normals, uvs, indices };
    },

    plane(w = 1, d = 1) {
      const x = w / 2;
      const z = d / 2;
      return {
        positions: [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        uvs: [0, 0, 1, 0, 1, 1, 0, 1],
        indices: [0, 2, 1, 0, 3, 2],
      };
    },
  };

  // ---- GPU upload / draw ------------------------------------------------------
  function upload(gl, meshData) {
    const make = (data, target, Type) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(target, buf);
      gl.bufferData(target, new Type(data), gl.STATIC_DRAW);
      return buf;
    };
    return {
      position: make(meshData.positions, gl.ARRAY_BUFFER, Float32Array),
      normal: meshData.normals ? make(meshData.normals, gl.ARRAY_BUFFER, Float32Array) : null,
      uv: meshData.uvs ? make(meshData.uvs, gl.ARRAY_BUFFER, Float32Array) : null,
      index: make(meshData.indices, gl.ELEMENT_ARRAY_BUFFER, Uint16Array),
      count: meshData.indices.length,
    };
  }

  function draw(gl, prog, gpuMesh, uniforms = {}) {
    gl.useProgram(prog);
    const bindAttr = (name, buf, size) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0 || !buf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bindAttr("a_position", gpuMesh.position, 3);
    bindAttr("a_normal", gpuMesh.normal, 3);
    bindAttr("a_uv", gpuMesh.uv, 2);

    let textureUnit = 0;
    for (const [name, value] of Object.entries(uniforms)) {
      const loc = gl.getUniformLocation(prog, name);
      if (!loc) continue;
      if (value instanceof Float32Array && value.length === 16) gl.uniformMatrix4fv(loc, false, value);
      else if (Array.isArray(value) && value.length === 3) gl.uniform3fv(loc, value);
      else if (Array.isArray(value) && value.length === 4) gl.uniform4fv(loc, value);
      else if (Array.isArray(value) && value.length === 2) gl.uniform2fv(loc, value);
      else if (typeof value === "number") gl.uniform1f(loc, value);
      else if (value && value.__isTexture) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, value.texture);
        gl.uniform1i(loc, textureUnit);
        textureUnit++;
      }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpuMesh.index);
    gl.drawElements(gl.TRIANGLES, gpuMesh.count, gl.UNSIGNED_SHORT, 0);
  }

  /** Uploads an image/canvas (e.g. TEX.brick()) as a texture. Pass as a uniform value. */
  function texture(gl, source, { repeat = true } = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const pow2 = (v) => (v & (v - 1)) === 0;
    if (pow2(source.width) && pow2(source.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return { __isTexture: true, texture: tex };
  }

  /** View matrix for an orbit camera. */
  function orbitCamera({ azimuth_deg = 35, elevation_deg = 25, distance = 5, target = [0, 0, 0] } = {}) {
    const az = (azimuth_deg * Math.PI) / 180;
    const el = (elevation_deg * Math.PI) / 180;
    const eye = [
      target[0] + distance * Math.cos(el) * Math.sin(az),
      target[1] + distance * Math.sin(el),
      target[2] + distance * Math.cos(el) * Math.cos(az),
    ];
    return mat4.lookAt(eye, target);
  }

  /**
   * Wires your draw function into window.__setView (multi-angle screenshots)
   * and window.__redraw (repaint before capture). fn receives the view spec.
   */
  function registerView(fn) {
    let lastView = { azimuth_deg: 35, elevation_deg: 25, distance_factor: 1 };
    window.__setView = (view) => {
      lastView = Object.assign({}, lastView, view);
      fn(lastView);
    };
    window.__redraw = () => fn(lastView);
  }

  window.GLH = { init, clear, program, defaultShaders, mesh, upload, draw, texture, mat4, orbitCamera, registerView };
})();

/* =====================================================================
   RENDERER  —  WebGL2. Chunked voxel draw, procedural night sky with a
   square Minecraft moon and stars, additive particles, bloom, fog.
   ===================================================================== */

(function (root) {
  'use strict';

  /* ---------------- shader sources ---------------------------------- */
  const V_BLOCK = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLayer;
layout(location=3) in vec3 aLight;   // sky, block, ao  (0..1)
layout(location=4) in float aFlags;

uniform mat4 uVP;
uniform vec3 uCam;
uniform float uTime;

out vec2 vUV;
out float vLayer;
out vec3 vLight;
out vec3 vWorld;
out float vFog;

void main(){
  vec3 p = aPos;
  int fl = int(aFlags + 0.5);
  if ((fl & 1) == 1) {                       // foliage / water sway
    float t = uTime * 1.6;
    float s = sin(t + p.x * 0.7 + p.z * 0.55) * 0.045;
    float c = cos(t * 0.83 + p.z * 0.6 - p.x * 0.4) * 0.045;
    float amp = ((fl & 2) == 2) ? 1.0 : 0.55;
    p.x += s * amp; p.z += c * amp;
    p.y += sin(t * 1.3 + p.x) * 0.012 * amp;
  }
  vUV = aUV; vLayer = aLayer; vLight = aLight; vWorld = p;
  float d = distance(p, uCam);
  vFog = d;
  gl_Position = uVP * vec4(p, 1.0);
}`;

  const F_BLOCK = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUV; in float vLayer; in vec3 vLight; in vec3 vWorld; in float vFog;
uniform sampler2DArray uTex;
uniform vec3 uSkyTint;      // colour of ambient sky light at night
uniform vec3 uLampTint;     // colour of torch / lantern light
uniform float uSkyPower;
uniform float uExposure;
uniform vec3 uFogColor;
uniform float uFogStart, uFogEnd;
uniform int uAlphaPass;     // 1 = translucent pass
uniform float uTime;
out vec4 outColor;

void main(){
  vec4 t = texture(uTex, vec3(vUV, vLayer));
  if (uAlphaPass == 0) { if (t.a < 0.5) discard; }
  else { if (t.a < 0.03) discard; }

  // textures are authored in display space: bring them to linear first
  vec3 alb = t.rgb * t.rgb;

  float sky = vLight.x, blk = vLight.y, ao = vLight.z;
  float s = pow(sky, 2.0) * uSkyPower;
  float b = pow(blk, 2.0);
  vec3 lightCol = uSkyTint * s + uLampTint * b * 1.35;
  lightCol += uLampTint * pow(blk, 6.0) * 0.5;            // hot core near sources
  float aoK = mix(0.40, 1.0, ao);
  vec3 col = alb * lightCol * aoK;
  col += alb * pow(blk, 8.0) * 1.15;                      // emissive blocks show their own colour
  col += alb * uSkyTint * 0.010;                          // faint ambient floor

  float f = clamp((vFog - uFogStart) / max(1.0, uFogEnd - uFogStart), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  col = mix(col, uFogColor * uFogColor, f * 0.92);

  outColor = vec4(col * uExposure, uAlphaPass == 1 ? t.a : 1.0);
}`;

  const V_FULL = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
out vec2 vT;
void main(){ vT = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;

  const F_SKY = `#version 300 es
precision highp float;
in vec2 vT;
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uZenith, uHorizon, uFogColor;
uniform vec3 uMoonDir;
out vec4 outColor;

float h21(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }

void main(){
  vec4 nd = uInvVP * vec4(vT * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(nd.xyz / nd.w - uCam);

  float up = clamp(dir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up * 1.15 + 0.06, 0.0, 1.0), 0.62));
  col = mix(col, uFogColor, pow(clamp(1.0 - abs(up) * 4.2, 0.0, 1.0), 2.2) * 0.85);

  // ---- stars (blocky, twinkling) ----
  if (up > -0.02) {
    vec3 sd = dir * 42.0;
    vec2 cell = floor(sd.xz / max(0.28, abs(sd.y) * 0.06 + 0.35));
    float g = h21(cell + floor(sd.y * 0.6) * 37.0);
    if (g > 0.9955) {
      float tw = 0.55 + 0.45 * sin(uTime * 2.1 + g * 90.0);
      float b = (g - 0.9955) / 0.0045;
      col += vec3(0.85, 0.9, 1.0) * b * tw * smoothstep(-0.02, 0.28, up) * 1.4;
    }
    vec2 cell2 = floor(sd.xz * 2.3);
    float g2 = h21(cell2 * 1.7 + floor(sd.y * 1.4) * 11.0);
    if (g2 > 0.9988) col += vec3(0.7, 0.78, 1.0) * smoothstep(-0.02, 0.3, up) * 0.7;
  }

  // ---- square Minecraft moon ----
  vec3 md = normalize(uMoonDir);
  vec3 mu = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
  vec3 mv = cross(mu, md);
  float dm = dot(dir, md);
  if (dm > 0.90) {
    vec2 q = vec2(dot(dir, mu), dot(dir, mv)) / dm;
    float R = 0.085;
    if (abs(q.x) < R && abs(q.y) < R) {
      vec2 uv = (q / R) * 0.5 + 0.5;
      vec2 px = floor(uv * 12.0);
      float n = h21(px * 3.7);
      float shade = 0.80 + 0.20 * n;
      // a few darker maria
      float m = h21(floor(uv * 6.0) * 9.1);
      if (m > 0.72) shade *= 0.74;
      col = mix(col, vec3(0.96, 0.97, 1.0) * shade, 1.0);
      col += vec3(0.25);
    } else {
      float halo = exp(-max(0.0, length(q) - R) * 26.0);
      col += vec3(0.42, 0.5, 0.72) * halo * 0.85;
    }
  }
  outColor = vec4(col, 1.0);
}`;

  const F_BRIGHT = `#version 300 es
precision highp float;
in vec2 vT; uniform sampler2D uSrc; uniform float uThresh; out vec4 o;
void main(){
  vec3 c = texture(uSrc, vT).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThresh, uThresh + 0.55, l);
  o = vec4(c * k, 1.0);
}`;

  const F_BLUR = `#version 300 es
precision highp float;
in vec2 vT; uniform sampler2D uSrc; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 s = texture(uSrc, vT).rgb * 0.2270270;
  s += texture(uSrc, vT + uDir * 1.3846153).rgb * 0.3162162;
  s += texture(uSrc, vT - uDir * 1.3846153).rgb * 0.3162162;
  s += texture(uSrc, vT + uDir * 3.2307692).rgb * 0.0702702;
  s += texture(uSrc, vT - uDir * 3.2307692).rgb * 0.0702702;
  o = vec4(s, 1.0);
}`;

  const F_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vT;
uniform sampler2D uScene, uBloom;
uniform float uBloomAmt, uVignette;
out vec4 o;
void main(){
  vec3 c = texture(uScene, vT).rgb;
  c += texture(uBloom, vT).rgb * uBloomAmt;
  // filmic-ish tonemap
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  vec2 q = vT - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  o = vec4(c, 1.0);
}`;

  const V_PART = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;   // rgb + size
uniform mat4 uVP; uniform vec3 uCam; uniform float uScale;
out vec4 vCol;
void main(){
  vec4 p = uVP * vec4(aPos, 1.0);
  gl_Position = p;
  float d = max(0.6, distance(aPos, uCam));
  gl_PointSize = clamp(aCol.w * uScale / d, 1.0, 110.0);
  vCol = aCol;
}`;
  const F_PART = `#version 300 es
precision highp float;
in vec4 vCol; out vec4 o;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r);
  o = vec4(vCol.rgb * a, a);
}`;

  /* ---------------- helpers ------------------------------------------ */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 6).join('\n'));
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  /* ---------------- matrix maths -------------------------------------- */
  const M = {
    persp(out, fovy, asp, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      out.set([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
      return out;
    },
    lookAt(out, eye, dir, up) {
      let zx = -dir[0], zy = -dir[1], zz = -dir[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      out.set([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
      return out;
    },
    mul(out, a, b) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        out[i * 4 + j] = s;
      }
      return out;
    },
    invert(out, m) {
      const a = m;
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4],
        b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6],
        b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12],
        b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return out; det = 1 / det;
      out[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
      out[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
      out[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
      out[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
      out[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
      out[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
      out[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
      out[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
      out[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
      out[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
      out[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
      out[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
      out[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
      out[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
      out[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
      out[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
      return out;
    },
  };

  /* ---------------- renderer ------------------------------------------ */
  function Renderer(canvas, opts) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is required.');
    this.gl = gl; this.canvas = canvas;
    this.quality = opts && opts.quality || 'high';

    this.progBlock = program(gl, V_BLOCK, F_BLOCK);
    this.progSky = program(gl, V_FULL, F_SKY);
    this.progBright = program(gl, V_FULL, F_BRIGHT);
    this.progBlur = program(gl, V_FULL, F_BLUR);
    this.progComp = program(gl, V_FULL, F_COMPOSITE);
    this.progPart = program(gl, V_PART, F_PART);

    // fullscreen triangle
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    this.chunks = [];
    this.fbos = {};
    this.vp = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.invVP = new Float32Array(16);
    this.moonDir = [-0.42, 0.62, -0.66];
    this.exposure = 1.0;
    this.bloomAmt = 0.42;
    this.fogStart = 60; this.fogEnd = 210;
  }

  Renderer.prototype.uploadTextures = function (atlas) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, atlas.size, atlas.size, atlas.count,
      0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.tex = tex;
  };

  Renderer.prototype._mkVAO = function (part) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, part.data, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.index, gl.STATIC_DRAW);
    const ST = 24;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, ST, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, true, ST, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.UNSIGNED_SHORT, false, ST, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.UNSIGNED_BYTE, true, ST, 18);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, ST, 21);
    gl.bindVertexArray(null);
    return { vao, count: part.count, type: part.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  };

  Renderer.prototype.uploadChunks = function (chunks, worldOrigin) {
    const gl = this.gl;
    this.chunks = [];
    for (const c of chunks) {
      const e = {
        min: [c.x0 + worldOrigin[0], c.miny, c.z0 + worldOrigin[2]],
        max: [c.x1 + worldOrigin[0], c.maxy + 1, c.z1 + worldOrigin[2]],
        solid: c.solid ? this._mkVAO(c.solid) : null,
        trans: c.trans ? this._mkVAO(c.trans) : null,
      };
      e.center = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, (e.min[2] + e.max[2]) / 2];
      e.radius = Math.hypot(e.max[0] - e.center[0], e.max[1] - e.center[1], e.max[2] - e.center[2]);
      this.chunks.push(e);
    }
    void gl;
  };

  Renderer.prototype.initParticles = function (max) {
    const gl = this.gl;
    this.pMax = max;
    this.pData = new Float32Array(max * 7);
    this.pVAO = gl.createVertexArray();
    gl.bindVertexArray(this.pVAO);
    this.pBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferData(gl.ARRAY_BUFFER, max * 28, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  };

  Renderer.prototype.resize = function (w, h, dpr) {
    const gl = this.gl;
    const W = Math.max(2, Math.floor(w * dpr)), H = Math.max(2, Math.floor(h * dpr));
    if (this.W === W && this.H === H) return;
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    const fmt = this.hasFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const mk = (w2, h2, withDepth) => {
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w2, h2, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      let rb = null;
      if (withDepth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w2, h2);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb, t, rb, w: w2, h: h2 };
    };
    for (const k in this.fbos) {
      const f = this.fbos[k];
      gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.t); if (f.rb) gl.deleteRenderbuffer(f.rb);
    }
    const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2);
    this.fbos = { scene: mk(W, H, true), a: mk(bw, bh, false), b: mk(bw, bh, false) };
  };

  const tmpDir = [0, 0, 0];
  Renderer.prototype.frame = function (cam, time, particles, nParticles, env) {
    const gl = this.gl;
    const asp = this.W / this.H;
    M.persp(this.proj, (env.fov || 72) * Math.PI / 180, asp, 0.08, 520);
    const cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
    tmpDir[0] = Math.sin(cam.yaw) * cy; tmpDir[1] = sy; tmpDir[2] = Math.cos(cam.yaw) * cy;
    M.lookAt(this.view, [cam.x, cam.y, cam.z], tmpDir, [0, 1, 0]);
    M.mul(this.vp, this.proj, this.view);
    M.invert(this.invVP, this.vp);

    const F = this.fbos;
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.scene.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* ---- sky ---- */
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    let P = this.progSky; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uInvVP, false, this.invVP);
    gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(P.u.uTime, time);
    gl.uniform3fv(P.u.uZenith, env.zenith);
    gl.uniform3fv(P.u.uHorizon, env.horizon);
    gl.uniform3fv(P.u.uFogColor, env.fog);
    gl.uniform3fv(P.u.uMoonDir, this.moonDir);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* ---- frustum planes from VP ---- */
    const m = this.vp, pl = [];
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? -1 : 1, r = i >> 1;
      const p = [m[3] + s * m[r], m[7] + s * m[4 + r], m[11] + s * m[8 + r], m[15] + s * m[12 + r]];
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      pl.push([p[0] / l, p[1] / l, p[2] / l, p[3] / l]);
    }
    const visible = [];
    for (const c of this.chunks) {
      let vis = true;
      for (const p of pl) {
        if (p[0] * c.center[0] + p[1] * c.center[1] + p[2] * c.center[2] + p[3] < -c.radius) { vis = false; break; }
      }
      if (!vis) continue;
      const d = Math.hypot(c.center[0] - cam.x, c.center[1] - cam.y, c.center[2] - cam.z);
      if (d - c.radius > this.fogEnd * 1.05) continue;
      c.dist = d; visible.push(c);
    }
    visible.sort((a, b) => a.dist - b.dist);
    this.drawn = visible.length;

    /* ---- blocks ---- */
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    P = this.progBlock; gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(P.u.uTime, time);
    gl.uniform3fv(P.u.uSkyTint, env.skyTint);
    gl.uniform3fv(P.u.uLampTint, env.lampTint);
    gl.uniform1f(P.u.uSkyPower, env.skyPower);
    gl.uniform1f(P.u.uExposure, this.exposure);
    gl.uniform3fv(P.u.uFogColor, env.fog);
    gl.uniform1f(P.u.uFogStart, this.fogStart);
    gl.uniform1f(P.u.uFogEnd, this.fogEnd);
    gl.uniform1i(P.u.uAlphaPass, 0);
    let tris = 0;
    for (const c of visible) {
      if (!c.solid) continue;
      gl.bindVertexArray(c.solid.vao);
      gl.drawElements(gl.TRIANGLES, c.solid.count, c.solid.type, 0);
      tris += c.solid.count / 3;
    }

    /* ---- translucent ---- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniform1i(P.u.uAlphaPass, 1);
    for (let i = visible.length - 1; i >= 0; i--) {
      const c = visible[i];
      if (!c.trans) continue;
      gl.bindVertexArray(c.trans.vao);
      gl.drawElements(gl.TRIANGLES, c.trans.count, c.trans.type, 0);
      tris += c.trans.count / 3;
    }
    this.tris = tris;
    gl.depthMask(true);

    /* ---- particles (additive) ---- */
    if (nParticles > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      P = this.progPart; gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
      gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform1f(P.u.uScale, this.H / 1.5);
      gl.bindVertexArray(this.pVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles, 0, nParticles * 7);
      gl.drawArrays(gl.POINTS, 0, nParticles);
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND);

    /* ---- bloom ---- */
    const useBloom = this.bloomAmt > 0.001;
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.quadVAO);
    if (useBloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.a.fb);
      gl.viewport(0, 0, F.a.w, F.a.h);
      P = this.progBright; gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, F.scene.t);
      gl.uniform1i(P.u.uSrc, 0); gl.uniform1f(P.u.uThresh, env.bloomThresh || 0.55);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      P = this.progBlur; gl.useProgram(P.p);
      const passes = this.quality === 'low' ? 1 : 2;
      for (let i = 0; i < passes; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, F.b.fb);
        gl.bindTexture(gl.TEXTURE_2D, F.a.t);
        gl.uniform1i(P.u.uSrc, 0); gl.uniform2f(P.u.uDir, 1 / F.a.w, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, F.a.fb);
        gl.bindTexture(gl.TEXTURE_2D, F.b.t);
        gl.uniform2f(P.u.uDir, 0, 1 / F.a.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    P = this.progComp; gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, F.scene.t); gl.uniform1i(P.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, useBloom ? F.a.t : F.a.t); gl.uniform1i(P.u.uBloom, 1);
    gl.uniform1f(P.u.uBloomAmt, useBloom ? this.bloomAmt : 0);
    gl.uniform1f(P.u.uVignette, env.vignette === undefined ? 0.55 : env.vignette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  root.MCRender = { Renderer, M };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);

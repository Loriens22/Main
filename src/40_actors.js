/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   src/40_actors.js -- Agent E.
   Characters (procedural primitive bodies), faces, weapons, and a fully
   procedural animation system (gait, IK, additive aim, recoil springs,
   jiggle/secondary motion, ragdoll-ish death).

   HARD RULES OBSERVED:
     - one IIFE, no ES modules, no external assets, ASCII only.
     - exposes ONLY IP.Actors.
     - does NOT depend on IP.Geo (private mesh helpers below).
     - allocation-free in pose() / collect() after warmup.

   CONVENTIONS
     - Y up, character faces +Z, metres.
     - Every limb bone points along its own -Y axis; child bones sit at
       (0, -length, 0) in parent space.
     - Node local matrix = T(bind + offset) * BindRot * Rz(rz) * Rx(rx) *
       Ry(ry) * Rx(rx2) * S(scale).
       ry is the twist about the bone axis; rx2 is the post-twist bend used
       by the IK solver.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  var M4 = IP.M4, V3 = IP.V3, U = IP.Util, Noise = IP.Noise;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smoothstep, damp = U.damp;
  var PI = Math.PI, TAU = PI * 2, HALFPI = PI * 0.5;
  var sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, acos = Math.acos,
      asin = Math.asin, sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor,
      mmin = Math.min, mmax = Math.max, mexp = Math.exp;
  var RG = IP.Rand.make(0x51A7E5);
  var EMPTY = {};

  function fract(x) { return x - floor(x); }
  function sq(x) { return x * x; }
  /* smooth 0->1->0 hump */
  function hump(t) { t = clamp(t, 0, 1); return sin(t * PI); }
  /* ease in/out */
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  /* window: 1 inside [a,b] with soft edges of width f */
  function win(t, a, b, f) {
    if (f === undefined) { f = 0.08; }
    return smooth(a - f, a + f, t) * (1 - smooth(b - f, b + f, t));
  }

  /* ======================================================================
     SECTION 1 -- PRIVATE MESH BUILDERS  (produce contract GeoData)
     ====================================================================== */

  function MB() { return { p: [], n: [], u: [], c: [], i: [] }; }

  var _p3 = [0, 0, 0], _n3 = [0, 0, 0], _sv = [1, 1, 1];

  function pushV(mb, xf, x, y, z, nx, ny, nz, u, v, r, g, b) {
    if (xf) {
      _p3[0] = x; _p3[1] = y; _p3[2] = z;
      M4.transformPoint(_p3, xf, _p3);
      x = _p3[0]; y = _p3[1]; z = _p3[2];
      _n3[0] = nx; _n3[1] = ny; _n3[2] = nz;
      M4.transformDir(_n3, xf, _n3);
      nx = _n3[0]; ny = _n3[1]; nz = _n3[2];
    }
    var l = nx * nx + ny * ny + nz * nz;
    if (l > 1e-14) { l = 1 / sqrt(l); nx *= l; ny *= l; nz *= l; }
    else { nx = 0; ny = 1; nz = 0; }
    mb.p.push(x, y, z);
    mb.n.push(nx, ny, nz);
    mb.u.push(u, v);
    mb.c.push(r, g, b);
    return (mb.p.length / 3) - 1;
  }

  function xfMake(out, px, py, pz, rx, ry, rz, s) {
    M4.identity(out);
    out[12] = px || 0; out[13] = py || 0; out[14] = pz || 0;
    if (rz) { M4.rotateZ(out, out, rz); }
    if (rx) { M4.rotateX(out, out, rx); }
    if (ry) { M4.rotateY(out, out, ry); }
    if (s !== undefined && s !== null && s !== 1) {
      _sv[0] = s; _sv[1] = s; _sv[2] = s;
      M4.scale(out, out, _sv);
    }
    return out;
  }
  function xf(px, py, pz, rx, ry, rz, s) {
    return xfMake(M4.create(), px, py, pz, rx, ry, rz, s);
  }

  /* --- box with optional per-face taper (top/bottom XZ scale) ---------- */
  function mkBox(mb, m, hx, hy, hz, col, opts) {
    opts = opts || EMPTY;
    var ts = opts.topScale === undefined ? 1 : opts.topScale;
    var tsz = opts.topScaleZ === undefined ? ts : opts.topScaleZ;
    var bs = opts.botScale === undefined ? 1 : opts.botScale;
    var bsz = opts.botScaleZ === undefined ? bs : opts.botScaleZ;
    var cv = opts.colorVar || 0;
    var r = col[0], g = col[1], b = col[2];
    var xT = hx * ts, zT = hz * tsz, xB = hx * bs, zB = hz * bsz;
    /* 8 corners: bottom(-y) 0..3, top(+y) 4..7 (ccw from -x-z) */
    var c0 = [-xB, -hy, -zB], c1 = [xB, -hy, -zB], c2 = [xB, -hy, zB], c3 = [-xB, -hy, zB];
    var c4 = [-xT, hy, -zT], c5 = [xT, hy, -zT], c6 = [xT, hy, zT], c7 = [-xT, hy, zT];
    var faces = [
      [c3, c2, c6, c7, 0, 0, 1],
      [c1, c0, c4, c5, 0, 0, -1],
      [c2, c1, c5, c6, 1, 0, 0],
      [c0, c3, c7, c4, -1, 0, 0],
      [c4, c7, c6, c5, 0, 1, 0],
      [c0, c1, c2, c3, 0, -1, 0]
    ];
    var uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    for (var f = 0; f < 6; f++) {
      var F = faces[f], base = mb.p.length / 3, k;
      var cvv = cv > 0 ? (RG.f() - 0.5) * cv : 0;
      for (k = 0; k < 4; k++) {
        pushV(mb, m, F[k][0], F[k][1], F[k][2], F[4], F[5], F[6],
              uvs[k * 2], uvs[k * 2 + 1], r + cvv, g + cvv, b + cvv);
      }
      mb.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /* --- surface of revolution; rings = [[y,r,sx,sz], ...] top -> bottom -- */
  function mkLathe(mb, m, rings, segs, col, opts) {
    opts = opts || EMPTY;
    var nr = rings.length;
    if (nr < 2) { return; }
    var capT = !!opts.capTop, capB = !!opts.capBot;
    var vAmp = opts.noise || 0, vFrq = opts.noiseFreq || 5;
    var cv = opts.colorVar || 0;
    var base = mb.p.length / 3;
    var i, s, ring, y, r, sx, sz, pm, pp, dy, dr, nrad, nyy, nl, pole;
    var r0 = col[0], g0 = col[1], b0 = col[2];
    var arc = opts.arc === undefined ? TAU : opts.arc;
    var closed = (arc >= TAU - 1e-6);
    var stride = segs + 1;
    for (i = 0; i < nr; i++) {
      ring = rings[i];
      y = ring[0]; r = ring[1];
      sx = ring.length > 2 && ring[2] !== undefined ? ring[2] : 1;
      sz = ring.length > 3 && ring[3] !== undefined ? ring[3] : 1;
      pm = rings[i > 0 ? i - 1 : i];
      pp = rings[i < nr - 1 ? i + 1 : i];
      dy = pp[0] - pm[0]; dr = pp[1] - pm[1];
      nrad = -dy; nyy = dr;
      nl = sqrt(nrad * nrad + nyy * nyy);
      if (nl < 1e-9) { nrad = 1; nyy = 0; } else { nrad /= nl; nyy /= nl; }
      pole = r < 1e-5;
      for (s = 0; s <= segs; s++) {
        var ang = (s / segs) * arc + (opts.arcOffset || 0);
        var ca = cos(ang), sa = sin(ang);
        var px = ca * r * sx, pz = sa * r * sz, py = y;
        if (vAmp > 0) {
          var w = Noise.perlin3(px * vFrq + 11.3, py * vFrq, pz * vFrq - 4.1) * vAmp;
          px += ca * w; pz += sa * w; py += w * 0.25;
        }
        var nx, ny, nz;
        if (pole) { nx = 0; ny = (i === 0 ? 1 : -1); nz = 0; }
        else { nx = nrad * ca / sx; ny = nyy; nz = nrad * sa / sz; }
        var cvv = cv > 0 ? (RG.f() - 0.5) * cv : 0;
        pushV(mb, m, px, py, pz, nx, ny, nz, s / segs, i / (nr - 1),
              r0 + cvv, g0 + cvv, b0 + cvv);
      }
    }
    for (i = 0; i < nr - 1; i++) {
      for (s = 0; s < segs; s++) {
        var a = base + i * stride + s, bb = a + 1, c = a + stride, d = c + 1;
        mb.i.push(a, bb, c, bb, d, c);
      }
    }
    if (capT && rings[0][1] > 1e-5) {
      var cy = rings[0][0];
      var ci = pushV(mb, m, 0, cy, 0, 0, 1, 0, 0.5, 0.5, r0, g0, b0);
      for (s = 0; s < segs; s++) {
        mb.i.push(ci, base + s + 1, base + s);
      }
      if (!closed) { /* open arc: leave the seam */ }
    }
    if (capB && rings[nr - 1][1] > 1e-5) {
      var by = rings[nr - 1][0];
      var bi = pushV(mb, m, 0, by, 0, 0, -1, 0, 0.5, 0.5, r0, g0, b0);
      var off = base + (nr - 1) * stride;
      for (s = 0; s < segs; s++) {
        mb.i.push(bi, off + s, off + s + 1);
      }
    }
  }

  function mkSphere(mb, m, r, segs, rings, col, opts) {
    opts = opts || EMPTY;
    var sy = opts.sy === undefined ? 1 : opts.sy;
    var sx = opts.sx === undefined ? 1 : opts.sx;
    var sz = opts.sz === undefined ? 1 : opts.sz;
    var arr = [], i, t, a;
    for (i = 0; i <= rings; i++) {
      t = i / rings;
      a = HALFPI - t * PI;
      arr.push([sin(a) * r * sy, cos(a) * r, sx, sz]);
    }
    mkLathe(mb, m, arr, segs, col, opts);
  }

  function mkCylinder(mb, m, rTop, rBot, h, segs, col, opts) {
    opts = opts || EMPTY;
    var rows = opts.rows || 1, arr = [], i, t;
    for (i = 0; i <= rows; i++) {
      t = i / rows;
      arr.push([h * 0.5 - t * h, lerp(rTop, rBot, t),
                opts.sx === undefined ? 1 : opts.sx,
                opts.sz === undefined ? 1 : opts.sz]);
    }
    mkLathe(mb, m, arr, segs, col, {
      capTop: opts.capTop !== false, capBot: opts.capBot !== false,
      noise: opts.noise, colorVar: opts.colorVar
    });
  }

  /* capsule centred on origin, axis Y, h = length between cap centres */
  function mkCapsule(mb, m, r, h, segs, col, opts) {
    opts = opts || EMPTY;
    var caps = opts.capRings || 4;
    var arr = [], i, a;
    for (i = 0; i <= caps; i++) {
      a = HALFPI - (i / caps) * HALFPI;
      arr.push([h * 0.5 + sin(a) * r, cos(a) * r]);
    }
    var mid = opts.rows || 2;
    for (i = 1; i < mid; i++) { arr.push([h * 0.5 - (i / mid) * h, r]); }
    for (i = 0; i <= caps; i++) {
      a = -(i / caps) * HALFPI;
      arr.push([-h * 0.5 + sin(a) * r, cos(a) * r]);
    }
    mkLathe(mb, m, arr, segs, col, opts);
  }

  /* Tapered limb built downward from the node origin along -Y.
     opts: rings, bulge (0..1 muscle swell), bulgeAt (0..1),
           exTop/exBot [sx,sz] cross-section ellipse, curve (forward bow) */
  function mkTaperedLimb(mb, m, len, rTop, rBot, segs, col, opts) {
    opts = opts || EMPTY;
    var rows = opts.rings || 7;
    var bulge = opts.bulge || 0, bAt = opts.bulgeAt === undefined ? 0.35 : opts.bulgeAt;
    var exT = opts.exTop || null, exB = opts.exBot || null;
    var arr = [], i, t, r, sx, sz;
    if (opts.roundTop) {
      for (i = 0; i < 3; i++) {
        var aa = HALFPI - (i / 3) * HALFPI;
        arr.push([sin(aa) * rTop * 0.85, cos(aa) * rTop,
                  exT ? exT[0] : 1, exT ? exT[1] : 1]);
      }
    }
    for (i = 0; i <= rows; i++) {
      t = i / rows;
      r = lerp(rTop, rBot, t * t * (3 - 2 * t));
      r *= 1 + bulge * mmax(0, sin(PI * clamp((t - bAt + 0.5), 0, 1)) - 0.55) * 2.2;
      sx = exT && exB ? lerp(exT[0], exB[0], t) : (exT ? exT[0] : 1);
      sz = exT && exB ? lerp(exT[1], exB[1], t) : (exT ? exT[1] : 1);
      arr.push([-t * len, r, sx, sz]);
    }
    if (opts.roundBot) {
      for (i = 1; i <= 3; i++) {
        var ab = -(i / 3) * HALFPI;
        arr.push([-len + sin(ab) * rBot * 0.85, cos(ab) * rBot,
                  exB ? exB[0] : 1, exB ? exB[1] : 1]);
      }
    }
    mkLathe(mb, m, arr, segs, col, {
      capTop: opts.capTop === true, capBot: opts.capBot !== false,
      noise: opts.noise, noiseFreq: opts.noiseFreq, colorVar: opts.colorVar
    });
  }

  /* thin curved shell (cloth panel): a lathe arc with two skins */
  function mkShell(mb, m, rings, segs, col, opts) {
    opts = opts || EMPTY;
    mkLathe(mb, m, rings, segs, col, opts);
  }

  function mkQuadPanel(mb, m, w, h, d, col, opts) {
    mkBox(mb, m, w * 0.5, h * 0.5, d * 0.5, col, opts);
  }

  function geoFromMB(mb) {
    var np = mb.p.length / 3;
    var g = {
      positions: new Float32Array(mb.p),
      normals: new Float32Array(mb.n),
      uvs: new Float32Array(mb.u),
      colors: new Float32Array(mb.c),
      indices: new Uint32Array(mb.i)
    };
    computeBounds(g);
    g.triCount = g.indices.length / 3;
    g.vertCount = np;
    return g;
  }

  function computeBounds(g) {
    var p = g.positions, n = p.length, i;
    var mnx = 1e30, mny = 1e30, mnz = 1e30, mxx = -1e30, mxy = -1e30, mxz = -1e30;
    for (i = 0; i < n; i += 3) {
      if (p[i] < mnx) { mnx = p[i]; } if (p[i] > mxx) { mxx = p[i]; }
      if (p[i + 1] < mny) { mny = p[i + 1]; } if (p[i + 1] > mxy) { mxy = p[i + 1]; }
      if (p[i + 2] < mnz) { mnz = p[i + 2]; } if (p[i + 2] > mxz) { mxz = p[i + 2]; }
    }
    if (n === 0) { mnx = mny = mnz = mxx = mxy = mxz = 0; }
    g.bounds = { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] };
    return g;
  }

  /* merge GeoData parts:  parts = [{geo, m (Mat4|null), color:[r,g,b]|null}] */
  function mergeParts(parts) {
    var i, k, tp = 0, ti = 0, pr;
    for (i = 0; i < parts.length; i++) {
      pr = parts[i];
      if (!pr || !pr.geo) { continue; }
      tp += pr.geo.positions.length / 3;
      ti += pr.geo.indices.length;
    }
    var out = {
      positions: new Float32Array(tp * 3),
      normals: new Float32Array(tp * 3),
      uvs: new Float32Array(tp * 2),
      colors: new Float32Array(tp * 3),
      indices: new Uint32Array(ti)
    };
    var vo = 0, io = 0;
    var tmp = [0, 0, 0];
    for (i = 0; i < parts.length; i++) {
      pr = parts[i];
      if (!pr || !pr.geo) { continue; }
      var g = pr.geo, cnt = g.positions.length / 3, m = pr.m || null, col = pr.color || null;
      for (k = 0; k < cnt; k++) {
        tmp[0] = g.positions[k * 3]; tmp[1] = g.positions[k * 3 + 1]; tmp[2] = g.positions[k * 3 + 2];
        if (m) { M4.transformPoint(tmp, m, tmp); }
        out.positions[(vo + k) * 3] = tmp[0];
        out.positions[(vo + k) * 3 + 1] = tmp[1];
        out.positions[(vo + k) * 3 + 2] = tmp[2];
        tmp[0] = g.normals[k * 3]; tmp[1] = g.normals[k * 3 + 1]; tmp[2] = g.normals[k * 3 + 2];
        if (m) { M4.transformDir(tmp, m, tmp); }
        var l = sqrt(tmp[0] * tmp[0] + tmp[1] * tmp[1] + tmp[2] * tmp[2]);
        if (l > 1e-12) { l = 1 / l; } else { l = 0; tmp[1] = 1; }
        out.normals[(vo + k) * 3] = tmp[0] * l || (l === 0 ? 0 : 0);
        out.normals[(vo + k) * 3 + 1] = l === 0 ? 1 : tmp[1] * l;
        out.normals[(vo + k) * 3 + 2] = l === 0 ? 0 : tmp[2] * l;
        if (l !== 0) { out.normals[(vo + k) * 3] = tmp[0] * l; }
        out.uvs[(vo + k) * 2] = g.uvs ? g.uvs[k * 2] : 0;
        out.uvs[(vo + k) * 2 + 1] = g.uvs ? g.uvs[k * 2 + 1] : 0;
        var cr = col ? col[0] : (g.colors ? g.colors[k * 3] : 1);
        var cg = col ? col[1] : (g.colors ? g.colors[k * 3 + 1] : 1);
        var cb = col ? col[2] : (g.colors ? g.colors[k * 3 + 2] : 1);
        out.colors[(vo + k) * 3] = cr;
        out.colors[(vo + k) * 3 + 1] = cg;
        out.colors[(vo + k) * 3 + 2] = cb;
      }
      for (k = 0; k < g.indices.length; k++) { out.indices[io + k] = g.indices[k] + vo; }
      vo += cnt; io += g.indices.length;
    }
    computeBounds(out);
    out.triCount = out.indices.length / 3;
    out.vertCount = tp;
    return out;
  }

  /* ======================================================================
     SECTION 2 -- MATERIALS
     ====================================================================== */

  function mat(o) {
    return {
      albedo: o.albedo || [0.8, 0.8, 0.8],
      rough: o.rough === undefined ? 0.8 : o.rough,
      metal: o.metal === undefined ? 0 : o.metal,
      emissive: o.emissive || [0, 0, 0],
      tex: o.tex || 'none',
      texScale: o.texScale === undefined ? 1 : o.texScale,
      alpha: o.alpha === undefined ? 1 : o.alpha,
      doubleSided: !!o.doubleSided,
      emissivePulse: o.emissivePulse || 0
    };
  }

  var MAT = {
    skin:      mat({ albedo: [0.52, 0.36, 0.28], rough: 0.66, tex: 'flesh', texScale: 3.0 }),
    skinPale:  mat({ albedo: [0.66, 0.53, 0.47], rough: 0.60, tex: 'flesh', texScale: 3.0 }),
    skinSick:  mat({ albedo: [0.40, 0.40, 0.31], rough: 0.75, tex: 'flesh', texScale: 3.0 }),
    skinDead:  mat({ albedo: [0.34, 0.33, 0.30], rough: 0.82, tex: 'flesh', texScale: 2.5 }),
    flesh:     mat({ albedo: [0.42, 0.12, 0.12], rough: 0.55, tex: 'flesh', texScale: 4.0 }),
    fleshHot:  mat({ albedo: [0.55, 0.10, 0.12], rough: 0.42, tex: 'flesh', texScale: 5.0,
                     emissive: [0.10, 0.01, 0.01] }),
    cloth:     mat({ albedo: [0.14, 0.16, 0.15], rough: 0.92, tex: 'fabric', texScale: 3.0 }),
    clothDark: mat({ albedo: [0.07, 0.08, 0.09], rough: 0.94, tex: 'fabric', texScale: 3.0 }),
    clothLite: mat({ albedo: [0.72, 0.70, 0.63], rough: 0.88, tex: 'fabric', texScale: 3.0 }),
    clothWhite:mat({ albedo: [0.82, 0.82, 0.80], rough: 0.86, tex: 'fabric', texScale: 3.0 }),
    clothRag:  mat({ albedo: [0.26, 0.22, 0.16], rough: 0.96, tex: 'fabric', texScale: 2.4 }),
    clothBlood:mat({ albedo: [0.24, 0.09, 0.08], rough: 0.90, tex: 'blood', texScale: 2.0 }),
    leather:   mat({ albedo: [0.10, 0.09, 0.08], rough: 0.62, tex: 'fabric', texScale: 4.0 }),
    metal:     mat({ albedo: [0.36, 0.37, 0.39], rough: 0.38, metal: 0.9, tex: 'metal', texScale: 4.0 }),
    metalDark: mat({ albedo: [0.13, 0.13, 0.14], rough: 0.44, metal: 0.85, tex: 'metal', texScale: 4.0 }),
    rust:      mat({ albedo: [0.28, 0.16, 0.09], rough: 0.85, metal: 0.4, tex: 'rust', texScale: 3.0 }),
    wood:      mat({ albedo: [0.22, 0.15, 0.09], rough: 0.88, tex: 'wood', texScale: 3.0 }),
    rubber:    mat({ albedo: [0.05, 0.05, 0.055], rough: 0.95 }),
    eye:       mat({ albedo: [0.86, 0.85, 0.82], rough: 0.18 }),
    iris:      mat({ albedo: [0.16, 0.13, 0.09], rough: 0.14 }),
    hairDark:  mat({ albedo: [0.055, 0.048, 0.045], rough: 0.72, tex: 'fabric', texScale: 6.0 }),
    hairBrown: mat({ albedo: [0.14, 0.10, 0.07], rough: 0.68, tex: 'fabric', texScale: 6.0 }),
    acid:      mat({ albedo: [0.14, 0.30, 0.16], rough: 0.30,
                     emissive: [0.18, 0.95, 0.32], emissivePulse: 0.7 }),
    core:      mat({ albedo: [0.30, 0.05, 0.06], rough: 0.35,
                     emissive: [1.6, 0.22, 0.16], emissivePulse: 1.2 }),
    lamp:      mat({ albedo: [0.7, 0.7, 0.7], rough: 0.2, emissive: [1.4, 1.3, 1.1] }),
    laser:     mat({ albedo: [0.6, 0.05, 0.05], rough: 0.2, emissive: [3.0, 0.15, 0.1] }),
    armor:     mat({ albedo: [0.11, 0.12, 0.11], rough: 0.55, metal: 0.35, tex: 'metal', texScale: 3.0 }),
    glass:     mat({ albedo: [0.5, 0.55, 0.6], rough: 0.12, tex: 'glass', alpha: 0.45 })
  };

  /* ======================================================================
     SECTION 3 -- TEMPLATE / RIG INFRASTRUCTURE
     ====================================================================== */

  var CH = 10;              /* channels per node */
  var C_OX = 0, C_OY = 1, C_OZ = 2, C_RX = 3, C_RY = 4, C_RZ = 5,
      C_RX2 = 6, C_SX = 7, C_SY = 8, C_SZ = 9;

  function Tmpl(kind) {
    return { kind: kind, defs: [], byName: {}, height: 1.75, radius: 0.32, meta: {} };
  }

  /* opts: geo, mat, rot:[x,y,z], hidden, hit (radius), jiggle:{...},
           len (bone length, for IK), tag */
  function tAdd(T, name, parent, x, y, z, opts) {
    opts = opts || EMPTY;
    var d = {
      name: name, parent: parent || null,
      px: x || 0, py: y || 0, pz: z || 0,
      rx: opts.rot ? opts.rot[0] : 0,
      ry: opts.rot ? opts.rot[1] : 0,
      rz: opts.rot ? opts.rot[2] : 0,
      geo: opts.geo || null,
      mat: opts.mat || null,
      hidden: !!opts.hidden,
      hit: opts.hit || 0,
      len: opts.len || 0,
      jiggle: opts.jiggle || null,
      tag: opts.tag || null,
      noShadow: !!opts.noShadow
    };
    if (T.byName[name]) { throw new Error('duplicate node ' + name); }
    T.byName[name] = d;
    T.defs.push(d);
    return d;
  }

  function instantiate(T) {
    var rig = {
      kind: T.kind,
      nodes: {},
      order: [],
      list: [],
      state: newState(),
      height: T.height,
      radius: T.radius,
      meta: T.meta,
      weapon: null,
      _items: [],
      _itemCount: 0,
      _world: null,
      _chanA: null,
      _chanB: null,
      _worldMatrix: M4.create(),
      _jiggles: [],
      _tris: 0
    };
    var i, d, n;
    for (i = 0; i < T.defs.length; i++) {
      d = T.defs[i];
      n = {
        name: d.name,
        parent: d.parent,
        parentNode: null,
        idx: i,
        geo: d.geo,
        mat: d.mat,
        m: M4.create(),
        world: M4.create(),
        bind: M4.create(),
        bx: d.px, by: d.py, bz: d.pz,
        hasBindRot: !!(d.rx || d.ry || d.rz),
        hidden: d.hidden,
        baseHidden: d.hidden,
        hit: d.hit,
        len: d.len,
        tag: d.tag,
        noShadow: d.noShadow,
        jig: null
      };
      M4.identity(n.bind);
      n.bind[12] = d.px; n.bind[13] = d.py; n.bind[14] = d.pz;
      if (d.rz) { M4.rotateZ(n.bind, n.bind, d.rz); }
      if (d.rx) { M4.rotateX(n.bind, n.bind, d.rx); }
      if (d.ry) { M4.rotateY(n.bind, n.bind, d.ry); }
      if (d.jiggle) {
        n.jig = {
          stiff: d.jiggle.stiff === undefined ? 90 : d.jiggle.stiff,
          damp: d.jiggle.damp === undefined ? 11 : d.jiggle.damp,
          maxA: d.jiggle.maxA === undefined ? 0.55 : d.jiggle.maxA,
          gravity: d.jiggle.gravity === undefined ? 0.35 : d.jiggle.gravity,
          mass: d.jiggle.mass === undefined ? 1 : d.jiggle.mass,
          x: 0, z: 0, vx: 0, vz: 0,
          px: 0, py: 0, pz: 0,
          vwx: 0, vwy: 0, vwz: 0,
          init: false
        };
        rig._jiggles.push(n);
      }
      rig.nodes[d.name] = n;
      rig.order.push(d.name);
      rig.list.push(n);
      if (d.geo) { rig._tris += d.geo.triCount || 0; }
    }
    for (i = 0; i < rig.list.length; i++) {
      n = rig.list[i];
      if (n.parent) { n.parentNode = rig.nodes[n.parent] || null; }
    }
    var N = rig.list.length;
    rig._chanA = new Float32Array(N * CH);
    rig._chanB = new Float32Array(N * CH);
    rig._chanC = new Float32Array(N * CH);
    /* preallocate one draw item per node that can ever be visible */
    for (i = 0; i < rig.list.length; i++) {
      n = rig.list[i];
      if (n.geo) {
        rig._items.push({ geo: n.geo, mat: n.mat || MAT.cloth, m: M4.create(),
                          castShadow: !n.noShadow, skin: null, node: n });
      }
    }
    return rig;
  }

  function newState() {
    return {
      dt: 0.016, time: 0,
      anim: 'idle', prevAnim: 'idle', animTime: 0,
      gaitPhase: 0, cadence: 0, stride: 0.9, gndSpeed: 0, speedSm: 0,
      accel: 0, prevSpeed: 0,
      aimPitch: 0, aimYaw: 0, aimW: 0, aimWT: 0,
      lookYaw: 0, lookPitch: 0, lookYawT: 0, lookPitchT: 0,
      eyeYaw: 0, eyePitch: 0,
      breathe: 0, breathePh: 0,
      injured: 0, fear: 0, fearSm: 0,
      /* recoil springs */
      recArm: 0, recArmV: 0, recChest: 0, recChestV: 0,
      recHead: 0, recHeadV: 0, recRoll: 0, recRollV: 0,
      recPush: 0, recPushV: 0,
      lastFireSeq: -1,
      /* hit reaction spring */
      hitX: 0, hitXV: 0, hitZ: 0, hitZV: 0, hitAmt: 0,
      /* death */
      dead: false, deathT: 0, deathKind: 'torso', deathDirX: 0, deathDirZ: 1,
      limpPhase: 0,
      /* expression */
      exFear: 0, exPain: 0, exAnger: 0, exTalk: 0, exBlink: 0,
      tFear: 0, tPain: 0, tAnger: 0, tTalk: 0, tBlink: -1,
      blinkTimer: 1.5, blinkT: -1,
      talkPhase: 0,
      /* weapon part animation */
      wSlide: 0, wMag: 0, wBolt: 0, wCyl: 0, wPump: 0, wHammer: 0, wTrigger: 0,
      /* elena glance */
      glanceTimer: 3, glanceT: -1,
      /* misc */
      mutatePhase: 0, phase2: false,
      seed: (RG.f() * 1000) | 0,
      grabStruggle: 0,
      lastPX: 0, lastPY: 0, lastPZ: 0, havePrevPos: false
    };
  }

  /* ---- channel helpers ------------------------------------------------ */
  function chReset(ch) {
    var i;
    for (i = 0; i < ch.length; i += CH) {
      ch[i] = 0; ch[i + 1] = 0; ch[i + 2] = 0;
      ch[i + 3] = 0; ch[i + 4] = 0; ch[i + 5] = 0; ch[i + 6] = 0;
      ch[i + 7] = 1; ch[i + 8] = 1; ch[i + 9] = 1;
    }
  }
  function chLerp(out, a, b, t) {
    var i, n = out.length;
    for (i = 0; i < n; i++) { out[i] = a[i] + (b[i] - a[i]) * t; }
  }
  function ci(rig, name) {
    var n = rig.nodes[name];
    return n ? n.idx * CH : -1;
  }

  /* set (absolute) rotation channels on a node by name */
  function setR(rig, ch, name, rx, ry, rz) {
    var n = rig.nodes[name];
    if (!n) { return; }
    var o = n.idx * CH;
    ch[o + C_RX] = rx; ch[o + C_RY] = ry || 0; ch[o + C_RZ] = rz || 0;
  }
  function addR(rig, ch, name, rx, ry, rz) {
    var n = rig.nodes[name];
    if (!n) { return; }
    var o = n.idx * CH;
    ch[o + C_RX] += rx; ch[o + C_RY] += ry || 0; ch[o + C_RZ] += rz || 0;
  }
  function setP(rig, ch, name, ox, oy, oz) {
    var n = rig.nodes[name];
    if (!n) { return; }
    var o = n.idx * CH;
    ch[o + C_OX] = ox; ch[o + C_OY] = oy; ch[o + C_OZ] = oz;
  }
  function addP(rig, ch, name, ox, oy, oz) {
    var n = rig.nodes[name];
    if (!n) { return; }
    var o = n.idx * CH;
    ch[o + C_OX] += ox; ch[o + C_OY] += oy; ch[o + C_OZ] += oz;
  }
  function setS(rig, ch, name, sx, sy, sz) {
    var n = rig.nodes[name];
    if (!n) { return; }
    var o = n.idx * CH;
    ch[o + C_SX] = sx; ch[o + C_SY] = sy; ch[o + C_SZ] = sz;
  }

  /* ======================================================================
     SECTION 4 -- BODY GEOMETRY
     ====================================================================== */

  function baseProps() {
    return {
      scale: 1.0,
      height: 1.75,
      /* skeleton */
      hipY: 0.965, spine01Y: 0.10, spine02Y: 0.125, chestY: 0.135,
      neckY: 0.185, headY: 0.088,
      clavX: 0.042, clavY: 0.135, shoulderX: 0.146,
      upperArm: 0.295, forearm: 0.255, hand: 0.098, finger: 0.075,
      hipX: 0.094, thigh: 0.435, shin: 0.415, ankleY: 0.072, foot: 0.135,
      /* radii */
      pelvisW: 0.145, pelvisD: 0.105,
      waistW: 0.128, waistD: 0.098,
      chestW: 0.176, chestD: 0.115,
      shoulderW: 0.205,
      neckR: 0.050, headR: 0.092,
      armRTop: 0.052, armRMid: 0.044, armRBot: 0.036, handR: 0.041,
      legRTop: 0.086, legRMid: 0.062, legRBot: 0.046,
      muscle: 0.10, hunch: 0.0,
      /* look */
      skin: MAT.skin, cloth: MAT.cloth, cloth2: MAT.clothDark,
      hair: MAT.hairDark, boots: MAT.leather, gloves: MAT.leather,
      skinCol: [0.52, 0.36, 0.28],
      clothCol: [0.16, 0.18, 0.17],
      cloth2Col: [0.09, 0.10, 0.11],
      hairCol: [0.06, 0.05, 0.05],
      bootCol: [0.08, 0.075, 0.07],
      segs: 12, ringLo: 5,
      female: false, ragged: false, monster: false,
      noise: 0
    };
  }

  function scaleProps(P, s) {
    var keys = ['hipY', 'spine01Y', 'spine02Y', 'chestY', 'neckY', 'headY',
      'clavX', 'clavY', 'shoulderX', 'upperArm', 'forearm', 'hand', 'finger',
      'hipX', 'thigh', 'shin', 'ankleY', 'foot', 'pelvisW', 'pelvisD',
      'waistW', 'waistD', 'chestW', 'chestD', 'shoulderW', 'neckR', 'headR',
      'armRTop', 'armRMid', 'armRBot', 'handR', 'legRTop', 'legRMid',
      'legRBot', 'height'];
    for (var i = 0; i < keys.length; i++) { P[keys[i]] *= s; }
    return P;
  }

  /* ---- individual part meshes ---------------------------------------- */

  function geoPelvis(P) {
    var mb = MB(), S = P.segs;
    var w = P.pelvisW, d = P.pelvisD;
    mkLathe(mb, null, [
      [0.075, w * 0.80, 1.0, d / w],
      [0.030, w * 0.95, 1.0, d / w],
      [-0.015, w * 1.00, 1.0, (d * 1.02) / w],
      [-0.060, w * 0.93, 1.0, (d * 0.98) / w],
      [-0.095, w * 0.74, 1.0, (d * 0.92) / w],
      [-0.115, w * 0.50, 1.0, (d * 0.90) / w]
    ], S, P.clothCol, { capTop: true, capBot: true, colorVar: 0.012, noise: P.noise });
    /* glute mass */
    mkSphere(mb, xf(0, -0.045, -d * 0.55, 0, 0, 0), w * 0.56, S, 6, P.clothCol,
             { sy: 0.72, sz: 0.62 });
    return geoFromMB(mb);
  }

  function geoSpine(P, seg) {
    var mb = MB(), S = P.segs;
    var w0, w1, d0, d1, h;
    if (seg === 1) {
      h = P.spine02Y; w0 = P.waistW; w1 = P.waistW * 1.02; d0 = P.waistD; d1 = P.waistD * 1.04;
    } else {
      h = P.chestY; w0 = P.waistW * 1.06; w1 = P.chestW * 0.95; d0 = P.waistD * 1.05; d1 = P.chestD * 0.96;
    }
    mkLathe(mb, null, [
      [h * 1.02, w1, 1.0, d1 / w1],
      [h * 0.5, (w0 + w1) * 0.5, 1.0, ((d0 + d1) * 0.5) / ((w0 + w1) * 0.5)],
      [-0.02, w0, 1.0, d0 / w0]
    ], S, P.clothCol, { capTop: false, capBot: false, colorVar: 0.012, noise: P.noise });
    return geoFromMB(mb);
  }

  function geoChest(P) {
    var mb = MB(), S = P.segs;
    var w = P.chestW, d = P.chestD, h = P.neckY;
    mkLathe(mb, null, [
      [h * 0.98, P.shoulderW * 0.72, 1.0, (d * 0.80) / (P.shoulderW * 0.72)],
      [h * 0.80, P.shoulderW * 0.92, 1.0, (d * 0.88) / (P.shoulderW * 0.92)],
      [h * 0.52, w * 1.06, 1.0, (d * 1.00) / (w * 1.06)],
      [h * 0.22, w * 1.02, 1.0, (d * 1.02) / (w * 1.02)],
      [-0.02, w * 0.92, 1.0, (d * 0.95) / (w * 0.92)]
    ], S, P.clothCol, { capTop: true, capBot: false, colorVar: 0.014, noise: P.noise });
    /* trapezius wedge to make the neck read */
    mkSphere(mb, xf(0, h * 0.86, -d * 0.24), w * 0.50, S, 5, P.clothCol,
             { sy: 0.40, sz: 0.78 });
    if (P.female) {
      mkSphere(mb, xf(-w * 0.42, h * 0.42, d * 0.80), w * 0.30, 10, 6, P.clothCol, { sy: 0.75, sz: 0.6 });
      mkSphere(mb, xf(w * 0.42, h * 0.42, d * 0.80), w * 0.30, 10, 6, P.clothCol, { sy: 0.75, sz: 0.6 });
    } else {
      mkBox(mb, xf(-w * 0.44, h * 0.44, d * 0.86), w * 0.36, h * 0.16, d * 0.16, P.clothCol,
            { topScale: 0.8 });
      mkBox(mb, xf(w * 0.44, h * 0.44, d * 0.86), w * 0.36, h * 0.16, d * 0.16, P.clothCol,
            { topScale: 0.8 });
    }
    return geoFromMB(mb);
  }

  function geoNeck(P) {
    var mb = MB();
    mkLathe(mb, null, [
      [P.neckY * 0.62, P.neckR * 0.94, 1.0, 0.92],
      [P.neckY * 0.3, P.neckR * 1.0, 1.0, 0.95],
      [-0.02, P.neckR * 1.18, 1.0, 1.0]
    ], P.segs, P.skinCol, { capTop: false, capBot: false, colorVar: 0.01 });
    return geoFromMB(mb);
  }

  /* Head: cranium + brow + nose + cheeks + ears.  Jaw is a separate node. */
  function geoHead(P) {
    var mb = MB(), S = P.segs, R = P.headR;
    var sc = P.skinCol;
    var shade = [sc[0] * 0.86, sc[1] * 0.84, sc[2] * 0.84];
    /* cranium: slightly egg-shaped, flat at the back */
    mkLathe(mb, xf(0, 0, -R * 0.04), [
      [R * 1.08, 0.0, 1, 1],
      [R * 0.98, R * 0.40, 0.95, 1.02],
      [R * 0.74, R * 0.72, 0.95, 1.05],
      [R * 0.42, R * 0.92, 0.94, 1.06],
      [R * 0.08, R * 0.99, 0.94, 1.05],
      [-R * 0.24, R * 0.95, 0.93, 1.00],
      [-R * 0.52, R * 0.80, 0.90, 0.94],
      [-R * 0.72, R * 0.58, 0.88, 0.88],
      [-R * 0.86, R * 0.30, 0.86, 0.84]
    ], S, sc, { capTop: false, capBot: true, colorVar: 0.012 });
    /* brow ridge */
    mkBox(mb, xf(0, R * 0.30, R * 0.80, -0.18, 0, 0), R * 0.68, R * 0.14, R * 0.20,
          shade, { topScale: 0.82 });
    /* cheekbones */
    mkSphere(mb, xf(-R * 0.62, R * 0.02, R * 0.56), R * 0.34, 8, 5, sc, { sy: 0.62, sz: 0.72 });
    mkSphere(mb, xf(R * 0.62, R * 0.02, R * 0.56), R * 0.34, 8, 5, sc, { sy: 0.62, sz: 0.72 });
    /* eye sockets (dark recessed rims) */
    mkLathe(mb, xf(-R * 0.36, R * 0.14, R * 0.74, 0, 0, 0), [
      [R * 0.20, R * 0.24, 1.0, 0.35],
      [0, R * 0.26, 1.0, 0.35],
      [-R * 0.18, R * 0.22, 1.0, 0.35]
    ], 10, shade, { capTop: false, capBot: false });
    mkLathe(mb, xf(R * 0.36, R * 0.14, R * 0.74, 0, 0, 0), [
      [R * 0.20, R * 0.24, 1.0, 0.35],
      [0, R * 0.26, 1.0, 0.35],
      [-R * 0.18, R * 0.22, 1.0, 0.35]
    ], 10, shade, { capTop: false, capBot: false });
    /* nose: bridge + tip + nostrils */
    mkBox(mb, xf(0, R * 0.10, R * 0.86, 0.10, 0, 0), R * 0.11, R * 0.30, R * 0.13,
          sc, { topScale: 0.55 });
    mkSphere(mb, xf(0, -R * 0.20, R * 0.98), R * 0.15, 8, 5, sc, { sy: 0.85, sz: 1.05 });
    mkSphere(mb, xf(-R * 0.14, -R * 0.23, R * 0.92), R * 0.10, 6, 4, shade, { sy: 0.8 });
    mkSphere(mb, xf(R * 0.14, -R * 0.23, R * 0.92), R * 0.10, 6, 4, shade, { sy: 0.8 });
    /* upper lip / philtrum */
    mkBox(mb, xf(0, -R * 0.44, R * 0.80), R * 0.24, R * 0.09, R * 0.11,
          [sc[0] * 0.95, sc[1] * 0.78, sc[2] * 0.76], { topScale: 1.1 });
    /* ears */
    mkSphere(mb, xf(-R * 0.95, -R * 0.02, -R * 0.02, 0, 0, 0.25), R * 0.26, 8, 5, sc,
             { sx: 0.28, sz: 0.62, sy: 1.15 });
    mkSphere(mb, xf(R * 0.95, -R * 0.02, -R * 0.02, 0, 0, -0.25), R * 0.26, 8, 5, sc,
             { sx: 0.28, sz: 0.62, sy: 1.15 });
    return geoFromMB(mb);
  }

  function geoJaw(P) {
    var mb = MB(), R = P.headR, sc = P.skinCol;
    var stub = P.stubble ? 0.72 : 1.0;
    var jc = [sc[0] * stub, sc[1] * stub * 0.98, sc[2] * stub * 0.98];
    /* mandible: U shape from 3 boxes + chin */
    mkBox(mb, xf(0, -R * 0.30, R * 0.52), R * 0.46, R * 0.32, R * 0.30, jc,
          { topScale: 1.18, botScale: 0.80 });
    mkBox(mb, xf(-R * 0.60, -R * 0.18, R * 0.06, 0, 0.30, 0), R * 0.14, R * 0.34, R * 0.44, jc,
          { topScale: 1.1 });
    mkBox(mb, xf(R * 0.60, -R * 0.18, R * 0.06, 0, -0.30, 0), R * 0.14, R * 0.34, R * 0.44, jc,
          { topScale: 1.1 });
    /* chin */
    mkSphere(mb, xf(0, -R * 0.56, R * 0.60), R * 0.24, 8, 5, jc, { sy: 0.72, sz: 0.85 });
    /* lower lip */
    mkBox(mb, xf(0, -R * 0.20, R * 0.74), R * 0.21, R * 0.07, R * 0.09,
          [sc[0] * 0.92, sc[1] * 0.70, sc[2] * 0.70], {});
    /* mouth cavity (dark) */
    mkBox(mb, xf(0, -R * 0.06, R * 0.55), R * 0.20, R * 0.06, R * 0.16,
          [0.05, 0.02, 0.02], {});
    return geoFromMB(mb);
  }

  function geoEye(P) {
    var mb = MB(), r = P.headR * 0.115;
    mkSphere(mb, null, r, 10, 7, [0.88, 0.87, 0.84], {});
    mkSphere(mb, xf(0, 0, r * 0.80), r * 0.46, 8, 5, [0.13, 0.10, 0.07], { sz: 0.45 });
    mkSphere(mb, xf(0, 0, r * 0.95), r * 0.20, 6, 4, [0.01, 0.01, 0.01], { sz: 0.4 });
    return geoFromMB(mb);
  }

  function geoLid(P) {
    var mb = MB(), r = P.headR * 0.132, sc = P.skinCol;
    /* hemispherical cap that rotates down over the eye */
    mkLathe(mb, null, [
      [r * 0.98, r * 0.16, 1, 1],
      [r * 0.72, r * 0.62, 1, 1],
      [r * 0.30, r * 0.92, 1, 1],
      [-r * 0.05, r * 1.00, 1, 1]
    ], 10, [sc[0] * 0.94, sc[1] * 0.88, sc[2] * 0.88], { capTop: false, capBot: false });
    return geoFromMB(mb);
  }

  function geoBrow(P) {
    var mb = MB(), R = P.headR, hc = P.hairCol;
    mkBox(mb, null, R * 0.26, R * 0.045, R * 0.055,
          [hc[0] * 1.6 + 0.02, hc[1] * 1.5 + 0.02, hc[2] * 1.5 + 0.02], { topScale: 0.7 });
    return geoFromMB(mb);
  }

  function geoHairCap(P) {
    var mb = MB(), R = P.headR, S = P.segs, hc = P.hairCol;
    if (P.longHair) {
      mkLathe(mb, xf(0, 0, -R * 0.06), [
        [R * 1.14, R * 0.22, 1, 1],
        [R * 1.00, R * 0.52, 0.98, 1.05],
        [R * 0.72, R * 0.86, 0.99, 1.08],
        [R * 0.36, R * 1.06, 0.99, 1.08],
        [R * 0.00, R * 1.10, 0.98, 1.06],
        [-R * 0.34, R * 1.06, 0.96, 1.00],
        [-R * 0.62, R * 0.95, 0.94, 0.92]
      ], S, hc, { capTop: false, capBot: false, colorVar: 0.02 });
      /* side curtains framing the face */
      mkLathe(mb, xf(-R * 0.72, -R * 0.10, R * 0.10, 0, 0, -0.10), [
        [R * 0.55, R * 0.30, 0.5, 0.9],
        [0, R * 0.34, 0.5, 1.0],
        [-R * 0.75, R * 0.26, 0.5, 0.9]
      ], 8, hc, { capTop: false, capBot: true, colorVar: 0.02 });
      mkLathe(mb, xf(R * 0.72, -R * 0.10, R * 0.10, 0, 0, 0.10), [
        [R * 0.55, R * 0.30, 0.5, 0.9],
        [0, R * 0.34, 0.5, 1.0],
        [-R * 0.75, R * 0.26, 0.5, 0.9]
      ], 8, hc, { capTop: false, capBot: true, colorVar: 0.02 });
    } else {
      mkLathe(mb, xf(0, 0, -R * 0.05), [
        [R * 1.10, R * 0.26, 1, 1],
        [R * 0.94, R * 0.60, 0.97, 1.04],
        [R * 0.62, R * 0.90, 0.97, 1.06],
        [R * 0.26, R * 1.02, 0.96, 1.05],
        [-R * 0.10, R * 1.00, 0.95, 1.00],
        [-R * 0.44, R * 0.92, 0.93, 0.94]
      ], S, hc, { capTop: false, capBot: false, colorVar: 0.025, noise: P.hairNoise || 0 });
    }
    return geoFromMB(mb);
  }

  function geoHairStrand(P, level) {
    var mb = MB(), R = P.headR, hc = P.hairCol;
    var w = R * (level === 0 ? 0.92 : (level === 1 ? 0.80 : 0.60));
    var len = R * (level === 0 ? 1.15 : (level === 1 ? 1.05 : 0.85));
    mkLathe(mb, null, [
      [0, w, 1, 0.52],
      [-len * 0.35, w * 0.98, 1, 0.50],
      [-len * 0.72, w * 0.86, 1, 0.46],
      [-len, w * 0.60, 1, 0.42]
    ], 10, hc, { capTop: false, capBot: true, colorVar: 0.03 });
    return geoFromMB(mb);
  }

  function geoClav(P, side) {
    var mb = MB();
    var w = P.shoulderX;
    mkLathe(mb, xf(side * w * 0.5, 0, 0, 0, 0, side * -1.45), [
      [w * 0.55, P.armRTop * 0.9, 1, 1],
      [0, P.armRTop * 1.15, 1, 1],
      [-w * 0.55, P.armRTop * 1.0, 1, 1]
    ], 9, P.clothCol, { capTop: false, capBot: false });
    /* deltoid cap */
    mkSphere(mb, xf(side * (w * 0.98), -0.022, 0), P.armRTop * 1.42, 10, 6, P.clothCol,
             { sy: 0.92, sz: 1.0 });
    return geoFromMB(mb);
  }

  function geoUpperArm(P, side) {
    var mb = MB();
    mkTaperedLimb(mb, null, P.upperArm, P.armRTop * 1.05, P.armRMid, 10, P.clothCol, {
      rings: 6, bulge: P.muscle, bulgeAt: 0.30, roundTop: true,
      exTop: [1.0, 0.94], exBot: [1.0, 0.98], colorVar: 0.012, noise: P.noise
    });
    return geoFromMB(mb);
  }

  function geoForearm(P, side) {
    var mb = MB();
    mkTaperedLimb(mb, null, P.forearm, P.armRMid * 1.02, P.armRBot, 10,
                  P.bareArms ? P.skinCol : P.clothCol, {
      rings: 6, bulge: P.muscle * 0.85, bulgeAt: 0.22, roundTop: true,
      exTop: [1.05, 0.92], exBot: [1.0, 0.86], colorVar: 0.012, noise: P.noise
    });
    return geoFromMB(mb);
  }

  function geoHand(P) {
    var mb = MB(), r = P.handR;
    var col = P.gloved ? P.cloth2Col : P.skinCol;
    /* palm */
    mkBox(mb, xf(0, -P.hand * 0.5, 0), r * 1.02, P.hand * 0.55, r * 0.52, col,
          { topScale: 0.94, botScale: 1.0 });
    /* thumb pad */
    mkSphere(mb, xf(0, -P.hand * 0.34, r * 0.52), r * 0.42, 7, 4, col, { sz: 0.7 });
    return geoFromMB(mb);
  }

  function geoFingers(P) {
    var mb = MB(), r = P.handR;
    var col = P.gloved ? P.cloth2Col : P.skinCol;
    var i, x;
    for (i = 0; i < 4; i++) {
      x = (-1.5 + i) * r * 0.46;
      mkLathe(mb, xf(x, 0, 0), [
        [0, r * 0.26, 1, 0.8],
        [-P.finger * 0.5, r * 0.24, 1, 0.8],
        [-P.finger, r * 0.17, 1, 0.8]
      ], 6, col, { capTop: false, capBot: true });
    }
    return geoFromMB(mb);
  }

  function geoThumb(P) {
    var mb = MB(), r = P.handR;
    var col = P.gloved ? P.cloth2Col : P.skinCol;
    mkLathe(mb, null, [
      [0, r * 0.30, 1, 0.85],
      [-P.finger * 0.55, r * 0.26, 1, 0.85],
      [-P.finger * 0.95, r * 0.19, 1, 0.85]
    ], 6, col, { capTop: false, capBot: true });
    return geoFromMB(mb);
  }

  function geoThigh(P) {
    var mb = MB();
    mkTaperedLimb(mb, null, P.thigh, P.legRTop, P.legRMid, 11, P.cloth2Col, {
      rings: 6, bulge: P.muscle * 1.1, bulgeAt: 0.28, roundTop: true,
      exTop: [1.0, 0.96], exBot: [1.0, 0.98], colorVar: 0.012, noise: P.noise
    });
    return geoFromMB(mb);
  }

  function geoShin(P) {
    var mb = MB();
    mkTaperedLimb(mb, null, P.shin, P.legRMid * 1.02, P.legRBot, 10, P.cloth2Col, {
      rings: 6, bulge: P.muscle * 1.3, bulgeAt: 0.18, roundTop: true,
      exTop: [1.0, 1.02], exBot: [1.0, 0.92], colorVar: 0.012, noise: P.noise
    });
    return geoFromMB(mb);
  }

  function geoFoot(P) {
    var mb = MB(), r = P.legRBot, L = P.foot, bc = P.bootCol;
    /* boot upper */
    mkBox(mb, xf(0, -P.ankleY * 0.45, L * 0.12), r * 1.12, P.ankleY * 0.62, L * 0.62, bc,
          { topScale: 0.86, botScale: 1.02 });
    /* ankle collar */
    mkLathe(mb, xf(0, 0, 0), [
      [0.012, r * 1.18, 1, 1],
      [-P.ankleY * 0.55, r * 1.24, 1.02, 1.06]
    ], 10, bc, { capTop: false, capBot: false });
    /* sole */
    mkBox(mb, xf(0, -P.ankleY * 0.90, L * 0.14), r * 1.16, P.ankleY * 0.22, L * 0.70,
          [bc[0] * 0.6, bc[1] * 0.6, bc[2] * 0.62], { topScale: 1.0 });
    return geoFromMB(mb);
  }

  function geoToe(P) {
    var mb = MB(), r = P.legRBot, bc = P.bootCol;
    mkBox(mb, xf(0, -P.ankleY * 0.5, P.foot * 0.30), r * 1.08, P.ankleY * 0.52, P.foot * 0.36,
          bc, { topScale: 0.78, botScale: 0.96, topScaleZ: 0.7 });
    mkBox(mb, xf(0, -P.ankleY * 0.86, P.foot * 0.30), r * 1.10, P.ankleY * 0.20, P.foot * 0.38,
          [bc[0] * 0.6, bc[1] * 0.6, bc[2] * 0.62], {});
    return geoFromMB(mb);
  }

  /* ---- clothing / gear shells ---------------------------------------- */

  function geoVest(P, col, thick) {
    var mb = MB(), S = P.segs, w = P.chestW * (1 + thick), d = P.chestD * (1 + thick * 1.4);
    var h = P.neckY;
    mkLathe(mb, null, [
      [h * 0.80, P.shoulderW * 0.86, 1.0, (d * 0.84) / (P.shoulderW * 0.86)],
      [h * 0.55, w * 1.05, 1.0, (d * 1.02) / (w * 1.05)],
      [h * 0.18, w * 1.03, 1.0, (d * 1.04) / (w * 1.03)],
      [-0.04, w * 0.96, 1.0, (d * 0.98) / (w * 0.96)],
      [-0.08, w * 0.88, 1.0, (d * 0.92) / (w * 0.88)]
    ], S, col, { capTop: false, capBot: false, colorVar: 0.02 });
    return geoFromMB(mb);
  }

  function geoPlateCarrier(P) {
    var mb = MB(), w = P.chestW, d = P.chestD, h = P.neckY;
    var col = [0.085, 0.095, 0.082];
    /* front plate */
    mkBox(mb, xf(0, h * 0.40, d * 1.10, 0.05, 0, 0), w * 0.86, h * 0.44, 0.020, col,
          { topScale: 0.80 });
    /* back plate */
    mkBox(mb, xf(0, h * 0.40, -d * 1.10, -0.05, 0, 0), w * 0.86, h * 0.46, 0.020, col,
          { topScale: 0.82 });
    /* shoulder straps */
    mkBox(mb, xf(-w * 0.52, h * 0.80, 0), 0.030, 0.020, d * 1.10, col, {});
    mkBox(mb, xf(w * 0.52, h * 0.80, 0), 0.030, 0.020, d * 1.10, col, {});
    /* cummerbund */
    mkLathe(mb, null, [
      [h * 0.06, w * 1.06, 1.0, (d * 1.06) / (w * 1.06)],
      [-h * 0.12, w * 1.04, 1.0, (d * 1.05) / (w * 1.04)]
    ], P.segs, col, { capTop: false, capBot: false });
    return geoFromMB(mb);
  }

  function geoMagPouch(P, n) {
    var mb = MB(), col = [0.10, 0.11, 0.095];
    var i;
    for (i = 0; i < n; i++) {
      mkBox(mb, xf((i - (n - 1) * 0.5) * 0.058, 0, 0), 0.026, 0.048, 0.020, col,
            { topScale: 0.95 });
      /* mag lip */
      mkBox(mb, xf((i - (n - 1) * 0.5) * 0.058, 0.052, 0), 0.020, 0.014, 0.014,
            [0.06, 0.06, 0.06], {});
    }
    return geoFromMB(mb);
  }

  function geoRadio(P) {
    var mb = MB();
    mkBox(mb, null, 0.028, 0.042, 0.018, [0.06, 0.065, 0.06], { topScale: 0.9 });
    mkCylinder(mb, xf(0.012, 0.075, 0), 0.0035, 0.005, 0.070, 6, [0.05, 0.05, 0.05], {});
    mkBox(mb, xf(0, 0.012, 0.020), 0.010, 0.008, 0.004, [0.10, 0.55, 0.25], {});
    return geoFromMB(mb);
  }

  function geoHolster(P) {
    var mb = MB(), col = [0.07, 0.065, 0.06];
    mkBox(mb, null, 0.034, 0.075, 0.026, col, { topScale: 1.1, botScale: 0.7 });
    mkBox(mb, xf(0, 0.078, 0), 0.030, 0.018, 0.024, col, {});
    mkBox(mb, xf(0, -0.02, 0.030), 0.020, 0.055, 0.005, col, {});
    return geoFromMB(mb);
  }

  function geoBackpack(P) {
    var mb = MB(), col = [0.10, 0.11, 0.10];
    mkBox(mb, null, P.chestW * 0.78, P.neckY * 0.72, 0.075, col,
          { topScale: 0.90, botScale: 0.94 });
    mkBox(mb, xf(0, -P.neckY * 0.30, -0.082), P.chestW * 0.60, P.neckY * 0.26, 0.030, col, {});
    mkCylinder(mb, xf(P.chestW * 0.52, 0.02, -0.070, 0, 0, HALFPI), 0.016, 0.016, 0.10, 8,
               [0.06, 0.06, 0.06], {});
    return geoFromMB(mb);
  }

  function geoJacketSkirt(P, which, col) {
    var mb = MB();
    var w = P.pelvisW * 1.16, d = P.pelvisD * 1.20;
    var len = P.jacketLen || 0.20;
    if (which === 'F' || which === 'B') {
      mkBox(mb, xf(0, -len * 0.5, (which === 'F' ? 1 : -1) * d * 0.92),
            w * 0.86, len * 0.5, 0.014, col, { topScale: 1.0, botScale: 1.12 });
    } else {
      mkBox(mb, xf((which === 'L' ? -1 : 1) * w * 0.98, -len * 0.5, 0),
            0.014, len * 0.5, d * 0.90, col, { topScale: 1.0, botScale: 1.10 });
    }
    return geoFromMB(mb);
  }

  function geoKneepad(P) {
    var mb = MB();
    mkLathe(mb, null, [
      [P.legRMid * 0.9, P.legRMid * 0.55, 1.1, 1.25],
      [0, P.legRMid * 1.22, 1.1, 1.25],
      [-P.legRMid * 1.0, P.legRMid * 0.95, 1.1, 1.20]
    ], 9, [0.09, 0.10, 0.09], { capTop: false, capBot: false, arc: PI * 1.15, arcOffset: -PI * 0.57 });
    return geoFromMB(mb);
  }

  function geoStump(P, r) {
    var mb = MB();
    mkSphere(mb, null, r, 9, 6, [0.32, 0.06, 0.06], { sy: 0.7 });
    return geoFromMB(mb);
  }

  /*__APPEND__*/
})();

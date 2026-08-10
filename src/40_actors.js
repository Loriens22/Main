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

  /* ======================================================================
     SECTION 5 -- SKELETON ASSEMBLY
     ====================================================================== */

  /* Part builders were authored independently; call them defensively so one
     bad signature cannot take down every character in the game. */
  function tryGeo(fn, P, side) {
    if (typeof fn !== 'function') { return null; }
    try {
      var g = side === undefined ? fn(P) : fn(P, side);
      return (g && g.positions && g.positions.length) ? g : null;
    } catch (e) {
      if (typeof console !== 'undefined') { console.warn('[IP.Actors] part failed', e.message); }
      return null;
    }
  }

  /* Some part builders take extra arguments beyond (P, side). */
  function tryGeoA(fn, args) {
    if (typeof fn !== 'function') { return null; }
    try {
      var g = fn.apply(null, args);
      return (g && g.positions && g.positions.length) ? g : null;
    } catch (e) {
      if (typeof console !== 'undefined') { console.warn('[IP.Actors] part failed', e.message); }
      return null;
    }
  }
  /* Four skirt panels welded into one mesh so it can swing as a single node. */
  function skirtGeo(P, col) {
    var panels = [], which = ['F', 'B', 'L', 'R'], i, g;
    for (i = 0; i < 4; i++) {
      g = tryGeoA(geoJacketSkirt, [P, which[i], col]);
      if (g) { panels.push({ geo: g }); }
    }
    if (!panels.length) { return null; }
    if (panels.length === 1) { return panels[0].geo; }
    if (IP.Geo && IP.Geo.merge) { return IP.Geo.merge(panels); }
    return panels[0].geo;
  }

  function buildTemplate(kind) {
    var P = baseProps();
    var T = Tmpl(kind);
    var isElena = kind === 'elena';
    var hunch = 0, scale = 1;

    switch (kind) {
      case 'player':
        P.skinCol = [0.50, 0.35, 0.27];
        P.clothCol = [0.13, 0.15, 0.14];
        P.hairCol = [0.05, 0.04, 0.04];
        P.muscle = 0.16; P.shoulderW = 0.222; P.chestW = 0.186;
        break;
      case 'elena':
        scale = 0.945;
        P.skinCol = [0.72, 0.56, 0.48];
        P.clothCol = [0.62, 0.61, 0.58];   /* light so she reads in the dark */
        P.hairCol = [0.16, 0.09, 0.06];
        P.shoulderW = 0.168; P.chestW = 0.150; P.pelvisW = 0.150;
        P.muscle = 0.02; P.armRTop = 0.043; P.legRTop = 0.078;
        break;
      case 'ganado':
        P.skinCol = [0.42, 0.36, 0.30];
        P.clothCol = [0.19, 0.16, 0.12];
        P.hairCol = [0.07, 0.06, 0.05];
        hunch = 0.22; P.muscle = 0.06;
        break;
      case 'brute':
        scale = 1.26;
        P.skinCol = [0.40, 0.31, 0.26];
        P.clothCol = [0.15, 0.12, 0.10];
        P.muscle = 0.42; P.shoulderW = 0.30; P.chestW = 0.24;
        P.armRTop = 0.082; P.armRMid = 0.070; P.legRTop = 0.115;
        hunch = 0.30;
        break;
      case 'shielder':
        P.skinCol = [0.40, 0.34, 0.29];
        P.clothCol = [0.17, 0.15, 0.13];
        P.muscle = 0.16; hunch = 0.14;
        break;
      case 'spitter':
        P.skinCol = [0.44, 0.46, 0.33];
        P.clothCol = [0.20, 0.21, 0.15];
        P.neckR = 0.062; P.muscle = 0.04; hunch = 0.34;
        break;
      case 'crawler':
        scale = 0.92;
        P.skinCol = [0.38, 0.34, 0.32];
        P.clothCol = [0.14, 0.13, 0.12];
        P.muscle = 0.20; hunch = 0.75;
        break;
      case 'soldier':
        P.skinCol = [0.48, 0.36, 0.29];
        P.clothCol = [0.16, 0.17, 0.14];
        P.muscle = 0.18; P.shoulderW = 0.226;
        break;
      case 'boss':
        scale = 2.05;
        P.skinCol = [0.44, 0.24, 0.22];
        P.clothCol = [0.20, 0.10, 0.10];
        P.muscle = 0.55; P.shoulderW = 0.34; P.chestW = 0.28;
        P.armRTop = 0.10; P.legRTop = 0.135;
        hunch = 0.18;
        break;
    }
    if (scale !== 1) { scaleProps(P, scale); }
    P.hunch = hunch;
    T.height = P.height;
    T.radius = 0.30 * scale;
    T.meta.scale = scale;
    T.meta.hunch = hunch;

    var skinMat = mat({ albedo: P.skinCol, rough: 0.72, tex: 'flesh', texScale: 2.4 });
    var clothMat = mat({ albedo: P.clothCol, rough: 0.94, tex: 'fabric', texScale: 1.8 });
    var hairMat = mat({ albedo: P.hairCol, rough: 0.68 });
    var bootMat = mat({ albedo: [0.07, 0.065, 0.06], rough: 0.55, tex: 'fabric', texScale: 2 });
    var gearMat = mat({ albedo: [0.10, 0.11, 0.10], rough: 0.72, tex: 'fabric', texScale: 2.2 });

    /* ---- spine ---- */
    tAdd(T, 'root', null, 0, 0, 0, {});
    tAdd(T, 'pelvis', 'root', 0, P.hipY, 0, { geo: tryGeo(geoPelvis, P), mat: clothMat, hit: 0.18 });
    tAdd(T, 'spine01', 'pelvis', 0, P.spine01Y, 0, { geo: tryGeo(geoSpine, P), mat: clothMat, hit: 0.17 });
    tAdd(T, 'spine02', 'spine01', 0, P.spine02Y, 0, { geo: tryGeo(geoSpine, P), mat: clothMat, hit: 0.17 });
    tAdd(T, 'chest', 'spine02', 0, P.chestY, 0, { geo: tryGeo(geoChest, P), mat: clothMat, hit: 0.21, tag: 'hitTorso' });
    tAdd(T, 'neck', 'chest', 0, P.neckY, 0, { geo: tryGeo(geoNeck, P), mat: skinMat });
    tAdd(T, 'head', 'neck', 0, P.headY, 0, { geo: tryGeo(geoHead, P), mat: skinMat, hit: P.headR * 1.15, tag: 'hitHead' });
    tAdd(T, 'jaw', 'head', 0, -P.headR * 0.26, P.headR * 0.30, { geo: tryGeo(geoJaw, P), mat: skinMat });
    tAdd(T, 'eyeL', 'head', -P.headR * 0.34, P.headR * 0.10, P.headR * 0.72,
         { geo: tryGeo(geoEye, P), mat: mat({ albedo: [0.86, 0.85, 0.82], rough: 0.16 }) });
    tAdd(T, 'eyeR', 'head', P.headR * 0.34, P.headR * 0.10, P.headR * 0.72,
         { geo: tryGeo(geoEye, P), mat: mat({ albedo: [0.86, 0.85, 0.82], rough: 0.16 }) });
    tAdd(T, 'lidL', 'eyeL', 0, 0, 0, { geo: tryGeo(geoLid, P), mat: skinMat });
    tAdd(T, 'lidR', 'eyeR', 0, 0, 0, { geo: tryGeo(geoLid, P), mat: skinMat });
    tAdd(T, 'browL', 'head', -P.headR * 0.34, P.headR * 0.30, P.headR * 0.70, { geo: tryGeo(geoBrow, P), mat: hairMat });
    tAdd(T, 'browR', 'head', P.headR * 0.34, P.headR * 0.30, P.headR * 0.70, { geo: tryGeo(geoBrow, P), mat: hairMat });
    tAdd(T, 'hairCap', 'head', 0, 0, 0, { geo: tryGeo(geoHairCap, P), mat: hairMat });

    /* Elena's hair is a three-link chain so it swings - it is the single
       clearest read on her state from behind, which is where the player
       spends the whole game looking at her. */
    if (isElena) {
      var strand = tryGeo(geoHairStrand, P);
      tAdd(T, 'hairA', 'head', 0, -P.headR * 0.15, -P.headR * 0.82,
           { geo: strand, mat: hairMat, jiggle: { stiff: 52, damp: 7.5, max: 0.62 } });
      tAdd(T, 'hairB', 'hairA', 0, -P.headR * 0.95, 0,
           { geo: strand, mat: hairMat, jiggle: { stiff: 44, damp: 6.5, max: 0.70 } });
      tAdd(T, 'hairC', 'hairB', 0, -P.headR * 0.95, 0,
           { geo: strand, mat: hairMat, jiggle: { stiff: 36, damp: 6.0, max: 0.78 } });
    }

    /* ---- arms ---- */
    var sides = [['L', -1], ['R', 1]];
    for (var s = 0; s < 2; s++) {
      var sfx = sides[s][0], sgn = sides[s][1];
      tAdd(T, 'clav' + sfx, 'chest', sgn * P.clavX, P.clavY, 0,
           { geo: tryGeo(geoClav, P, sgn), mat: clothMat });
      tAdd(T, 'upperArm' + sfx, 'clav' + sfx, sgn * (P.shoulderX - P.clavX), 0, 0,
           { geo: tryGeo(geoUpperArm, P, sgn), mat: clothMat, len: P.upperArm, hit: 0.09,
             tag: 'hitLimb' + sfx });
      tAdd(T, 'forearm' + sfx, 'upperArm' + sfx, 0, -P.upperArm, 0,
           { geo: tryGeo(geoForearm, P, sgn), mat: clothMat, len: P.forearm, hit: 0.075 });
      tAdd(T, 'hand' + sfx, 'forearm' + sfx, 0, -P.forearm, 0,
           { geo: tryGeo(geoHand, P, sgn), mat: skinMat, len: P.hand });
      tAdd(T, 'fingers' + sfx, 'hand' + sfx, 0, -P.hand * 0.85, 0,
           { geo: tryGeo(geoFingers, P, sgn), mat: skinMat });
      tAdd(T, 'thumb' + sfx, 'hand' + sfx, sgn * P.handR * 0.6, -P.hand * 0.4, P.handR * 0.3,
           { geo: tryGeo(geoThumb, P, sgn), mat: skinMat });
      /* ---- legs ---- */
      tAdd(T, 'thigh' + sfx, 'pelvis', sgn * P.hipX, 0, 0,
           { geo: tryGeo(geoThigh, P, sgn), mat: clothMat, len: P.thigh, hit: 0.11 });
      tAdd(T, 'shin' + sfx, 'thigh' + sfx, 0, -P.thigh, 0,
           { geo: tryGeo(geoShin, P, sgn), mat: clothMat, len: P.shin, hit: 0.09 });
      tAdd(T, 'foot' + sfx, 'shin' + sfx, 0, -P.shin, 0,
           { geo: tryGeo(geoFoot, P, sgn), mat: bootMat });
      tAdd(T, 'toe' + sfx, 'foot' + sfx, 0, -P.ankleY * 0.4, P.foot * 0.62,
           { geo: tryGeo(geoToe, P, sgn), mat: bootMat });
    }

    /* ---- per-kind gear layers ---- */
    if (kind === 'player' || kind === 'soldier') {
      tAdd(T, 'carrier', 'chest', 0, 0, 0, { geo: tryGeo(geoPlateCarrier, P), mat: gearMat });
      tAdd(T, 'pouchA', 'chest', -0.10, -0.06, P.chestD * 0.92, { geo: tryGeo(geoMagPouch, P), mat: gearMat,
           jiggle: { stiff: 90, damp: 11, max: 0.22 } });
      tAdd(T, 'pouchB', 'chest', 0.10, -0.06, P.chestD * 0.92, { geo: tryGeo(geoMagPouch, P), mat: gearMat,
           jiggle: { stiff: 90, damp: 11, max: 0.22 } });
      tAdd(T, 'radio', 'chest', -0.15, 0.06, 0.02, { geo: tryGeo(geoRadio, P), mat: gearMat });
      tAdd(T, 'holster', 'pelvis', 0.14, -0.10, 0.02, { geo: tryGeo(geoHolster, P), mat: gearMat });
      tAdd(T, 'kneeL', 'shinL', 0, -P.shin * 0.28, P.legRMid * 0.9, { geo: tryGeo(geoKneepad, P), mat: gearMat });
      tAdd(T, 'kneeR', 'shinR', 0, -P.shin * 0.28, P.legRMid * 0.9, { geo: tryGeo(geoKneepad, P), mat: gearMat });
      tAdd(T, 'backpack', 'chest', 0, -0.02, -P.chestD * 1.05, { geo: tryGeo(geoBackpack, P), mat: gearMat });
    } else if (isElena) {
      tAdd(T, 'vest', 'chest', 0, 0, 0, {
        geo: tryGeoA(geoVest, [P, [0.70, 0.69, 0.66], 0.10]),
        mat: mat({ albedo: [0.70, 0.69, 0.66], rough: 0.90, tex: 'fabric', texScale: 2.0 }) });
      tAdd(T, 'skirt', 'pelvis', 0, -0.02, 0, {
        geo: skirtGeo(P, P.clothCol), mat: clothMat,
        jiggle: { stiff: 46, damp: 6.4, max: 0.34 } });
    } else if (kind === 'ganado' || kind === 'brute' || kind === 'shielder' || kind === 'spitter') {
      var ragCol = [P.clothCol[0] * 0.8, P.clothCol[1] * 0.8, P.clothCol[2] * 0.8];
      tAdd(T, 'rags', 'chest', 0, 0, 0, {
        geo: tryGeoA(geoVest, [P, ragCol, 0.06]),
        mat: mat({ albedo: ragCol, rough: 0.97, tex: 'fabric', texScale: 1.6 }) });
      tAdd(T, 'skirt', 'pelvis', 0, -0.02, 0, {
        geo: skirtGeo(P, ragCol), mat: clothMat,
        jiggle: { stiff: 38, damp: 5.6, max: 0.40 } });
    }

    /* the shield is a real node so hit tests can resolve against it */
    if (kind === 'shielder') {
      tAdd(T, 'shield', 'forearmL', 0, -P.forearm * 0.45, P.armRMid * 2.4, {
        geo: shieldGeo(), mat: mat({ albedo: [0.30, 0.20, 0.13], rough: 0.82, metal: 0.5, tex: 'rust', texScale: 1.4 }),
        hit: 0.55, tag: 'shield'
      });
    }
    if (kind === 'spitter') {
      tAdd(T, 'sacL', 'chest', -0.13, -0.05, 0.10, {
        geo: sacGeo(0.11), mat: mat({ albedo: [0.16, 0.30, 0.12], rough: 0.35,
          emissive: [0.10, 0.85, 0.22], emissivePulse: 0.7 }), tag: 'weakpoint',
        jiggle: { stiff: 40, damp: 5, max: 0.4 } });
      tAdd(T, 'sacR', 'chest', 0.13, -0.05, 0.10, {
        geo: sacGeo(0.11), mat: mat({ albedo: [0.16, 0.30, 0.12], rough: 0.35,
          emissive: [0.10, 0.85, 0.22], emissivePulse: 0.7 }), tag: 'weakpoint',
        jiggle: { stiff: 40, damp: 5, max: 0.4 } });
    }
    if (kind === 'boss') {
      /* phase 2 anatomy: hidden until the mutation animation opens the torso */
      tAdd(T, 'coreShellL', 'chest', -0.16, 0, 0.14, {
        geo: shellPlateGeo(P), mat: mat({ albedo: [0.28, 0.14, 0.13], rough: 0.6, tex: 'flesh', texScale: 1.4 }) });
      tAdd(T, 'coreShellR', 'chest', 0.16, 0, 0.14, {
        geo: shellPlateGeo(P), mat: mat({ albedo: [0.28, 0.14, 0.13], rough: 0.6, tex: 'flesh', texScale: 1.4 }) });
      tAdd(T, 'core', 'chest', 0, -0.02, 0.10, {
        geo: sacGeo(0.20), hidden: true, tag: 'weakpoint',
        mat: mat({ albedo: [0.50, 0.10, 0.10], rough: 0.28,
                   emissive: [3.0, 0.35, 0.25], emissivePulse: 1.1 }) });
      for (var e2 = 0; e2 < 2; e2++) {
        var es = e2 ? 1 : -1, en = e2 ? 'R' : 'L';
        tAdd(T, 'extraArm' + en, 'chest', es * P.shoulderW * 0.8, 0.02, -0.06, {
          geo: tryGeo(geoUpperArm, P, es), hidden: true,
          mat: mat({ albedo: [0.34, 0.16, 0.15], rough: 0.6, tex: 'flesh', texScale: 1.6 }),
          len: P.upperArm * 1.1 });
        tAdd(T, 'extraFore' + en, 'extraArm' + en, 0, -P.upperArm * 1.1, 0, {
          geo: tryGeo(geoForearm, P, es), hidden: true,
          mat: mat({ albedo: [0.34, 0.16, 0.15], rough: 0.6, tex: 'flesh', texScale: 1.6 }),
          len: P.forearm * 1.1 });
      }
    }

    /* attachment points (no geometry) */
    tAdd(T, 'weaponGrip', 'handR', 0, -P.hand * 0.55, P.handR * 0.55, {});
    tAdd(T, 'muzzle', 'weaponGrip', 0, 0, 0.42, {});
    tAdd(T, 'lightSource', 'chest', 0, 0.04, P.chestD, {});
    T.meta.props = P;
    return T;
  }

  /* --- small extra meshes the part library does not cover --------------- */
  function shieldGeo() {
    var mb = MB();
    mkBox(mb, xf(0, 0, 0), 0.40, 0.52, 0.035, [0.32, 0.22, 0.15], {});
    mkBox(mb, xf(0, 0.30, 0.01), 0.40, 0.10, 0.05, [0.26, 0.18, 0.12], {});
    mkBox(mb, xf(0, -0.30, 0.01), 0.40, 0.10, 0.05, [0.26, 0.18, 0.12], {});
    mkBox(mb, xf(0, 0, -0.05), 0.06, 0.14, 0.05, [0.20, 0.14, 0.10], {});
    return geoFromMB(mb);
  }
  function sacGeo(r) {
    var mb = MB();
    mkSphere(mb, xf(0, 0, 0), r, 10, 7, [0.30, 0.62, 0.24], { sy: 1.25 });
    return geoFromMB(mb);
  }
  function shellPlateGeo(P) {
    var mb = MB();
    mkBox(mb, xf(0, 0, 0), P.chestW * 0.55, P.chestY * 2.2, 0.05, [0.34, 0.18, 0.16], {});
    return geoFromMB(mb);
  }

  var templates = {};
  var KINDS = ['player', 'elena', 'ganado', 'brute', 'shielder', 'spitter',
               'crawler', 'soldier', 'boss'];

  function getTemplate(kind) {
    if (!templates[kind]) {
      templates[kind] = buildTemplate(KINDS.indexOf(kind) >= 0 ? kind : 'ganado');
    }
    return templates[kind];
  }
  function build() {
    for (var i = 0; i < KINDS.length; i++) { getTemplate(KINDS[i]); }
    return true;
  }
  function makeRig(kind) { return instantiate(getTemplate(kind)); }

  /* ======================================================================
     SECTION 6 -- WEAPONS
     ====================================================================== */
  var weaponCache = {};
  function makeWeapon(id) {
    if (weaponCache[id]) { return weaponCache[id]; }
    var gunMat = mat({ albedo: [0.075, 0.078, 0.082], rough: 0.42, metal: 0.85, tex: 'metal', texScale: 3.0 });
    var gripMat = mat({ albedo: [0.05, 0.05, 0.055], rough: 0.88, tex: 'fabric', texScale: 4.0 });
    var parts = {};
    var mb;
    function body(fn) { mb = MB(); fn(); return geoFromMB(mb); }

    switch (id) {
      case 'knife':
        parts.body = body(function () {
          mkBox(mb, xf(0, 0, 0.06), 0.012, 0.022, 0.075, [0.06, 0.06, 0.06], {});
          mkBox(mb, xf(0, 0, 0.20), 0.006, 0.020, 0.11, [0.62, 0.64, 0.68], {});
        });
        break;
      case 'shotgun':
        parts.body = body(function () {
          mkCylinder(mb, xf(0, 0.012, 0.30, HALFPI, 0, 0), 0.017, 0.017, 0.62, 10, [0.10, 0.10, 0.11], {});
          mkBox(mb, xf(0, -0.01, 0.06), 0.022, 0.048, 0.16, [0.09, 0.09, 0.10], {});
          mkBox(mb, xf(0, -0.045, -0.10, 0.22, 0, 0), 0.020, 0.036, 0.16, [0.14, 0.09, 0.05], {});
        });
        parts.pump = body(function () {
          mkCylinder(mb, xf(0, -0.012, 0, HALFPI, 0, 0), 0.024, 0.024, 0.14, 10, [0.14, 0.10, 0.06], {});
        });
        parts.pumpAt = [0, 0, 0.30];
        break;
      case 'magnum':
        parts.body = body(function () {
          mkCylinder(mb, xf(0, 0.010, 0.20, HALFPI, 0, 0), 0.014, 0.014, 0.30, 10, [0.13, 0.13, 0.14], {});
          mkBox(mb, xf(0, -0.005, 0.05), 0.020, 0.042, 0.10, [0.10, 0.10, 0.11], {});
          mkBox(mb, xf(0, -0.062, -0.03, 0.30, 0, 0), 0.019, 0.058, 0.036, [0.16, 0.11, 0.07], {});
        });
        parts.cylinder = body(function () {
          mkCylinder(mb, xf(0, 0, 0, HALFPI, 0, 0), 0.028, 0.028, 0.055, 8, [0.16, 0.16, 0.17], {});
        });
        parts.cylinderAt = [0, 0.004, 0.075];
        break;
      case 'rifle':
        parts.body = body(function () {
          mkCylinder(mb, xf(0, 0.014, 0.36, HALFPI, 0, 0), 0.011, 0.011, 0.70, 10, [0.10, 0.10, 0.11], {});
          mkBox(mb, xf(0, 0, 0.10), 0.020, 0.046, 0.22, [0.09, 0.09, 0.10], {});
          mkBox(mb, xf(0, -0.05, -0.14, 0.18, 0, 0), 0.020, 0.040, 0.20, [0.12, 0.10, 0.08], {});
          mkCylinder(mb, xf(0, 0.058, 0.16, HALFPI, 0, 0), 0.020, 0.020, 0.20, 10, [0.06, 0.06, 0.07], {});
        });
        parts.bolt = body(function () {
          mkCylinder(mb, xf(0, 0, 0, 0, 0, HALFPI), 0.008, 0.008, 0.05, 6, [0.30, 0.31, 0.33], {});
        });
        parts.boltAt = [0.026, 0.020, 0.10];
        break;
      case 'smg':
        parts.body = body(function () {
          mkCylinder(mb, xf(0, 0.012, 0.20, HALFPI, 0, 0), 0.011, 0.011, 0.26, 10, [0.10, 0.10, 0.11], {});
          mkBox(mb, xf(0, 0, 0.05), 0.020, 0.044, 0.14, [0.09, 0.09, 0.10], {});
          mkBox(mb, xf(0, -0.055, 0.0, 0.12, 0, 0), 0.017, 0.050, 0.032, [0.08, 0.08, 0.09], {});
        });
        parts.mag = body(function () {
          mkBox(mb, xf(0, 0, 0), 0.013, 0.070, 0.020, [0.12, 0.12, 0.13], {});
        });
        parts.magAt = [0, -0.075, 0.05];
        break;
      case 'launcher':
        parts.body = body(function () {
          mkCylinder(mb, xf(0, 0.02, 0.24, HALFPI, 0, 0), 0.045, 0.045, 0.72, 12, [0.14, 0.11, 0.09], {});
          mkBox(mb, xf(0, -0.05, 0.0, 0.10, 0, 0), 0.020, 0.055, 0.05, [0.10, 0.10, 0.11], {});
        });
        break;
      default: /* pistol */
        parts.body = body(function () {
          mkBox(mb, xf(0, 0.012, 0.10), 0.014, 0.026, 0.11, [0.10, 0.10, 0.11], {});
          mkBox(mb, xf(0, -0.048, -0.006, 0.26, 0, 0), 0.016, 0.052, 0.030, [0.07, 0.07, 0.08], {});
          mkBox(mb, xf(0, -0.012, 0.045), 0.010, 0.014, 0.05, [0.08, 0.08, 0.09], {});
        });
        parts.slide = body(function () {
          mkBox(mb, xf(0, 0, 0), 0.016, 0.020, 0.115, [0.14, 0.14, 0.15], {});
        });
        parts.slideAt = [0, 0.034, 0.10];
        parts.mag = body(function () {
          mkBox(mb, xf(0, 0, 0), 0.012, 0.050, 0.018, [0.11, 0.11, 0.12], {});
        });
        parts.magAt = [0, -0.055, -0.006];
        break;
    }
    weaponCache[id] = { id: id, parts: parts, mat: gunMat, gripMat: gripMat };
    return weaponCache[id];
  }

  function setWeapon(rig, id) {
    rig.weapon = id ? makeWeapon(id) : null;
    return rig.weapon;
  }

  /* ======================================================================
     SECTION 7 -- ANIMATION
     ====================================================================== */

  /* Analytic two-bone IK. Returns the root pitch and the knee/elbow bend that
     place the end effector at `dist` from the root. */
  var _ik = { a: 0, b: 0 };
  function solveIK2(dist, l1, l2) {
    var d = Math.min(Math.max(dist, 1e-4), (l1 + l2) * 0.999);
    var cosB = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
    cosB = cosB < -1 ? -1 : (cosB > 1 ? 1 : cosB);
    var bend = Math.PI - Math.acos(cosB);
    var cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    cosA = cosA < -1 ? -1 : (cosA > 1 ? 1 : cosA);
    _ik.a = Math.acos(cosA);
    _ik.b = bend;
    return _ik;
  }

  function spring(cur, vel, target, stiff, damp, dt) {
    var f = (target - cur) * stiff - vel * damp;
    vel += f * dt;
    cur += vel * dt;
    return [cur, vel];
  }

  var ANIM_SPEED = { idle: 0, walk: 1.6, run: 3.4, sprint: 5.0, crouch: 0.9, crawl: 1.0 };

  function pose(rig, ps, dt) {
    if (!rig) { return; }
    ps = ps || EMPTY;
    dt = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 0.016;
    var st = rig.state;
    var ch = rig._chanA;
    var P = rig.meta.props || baseProps();
    var i, o;

    st.dt = dt;
    st.time += dt;
    var anim = ps.anim || 'idle';
    if (anim !== st.anim) { st.prevAnim = st.anim; st.anim = anim; st.animTime = 0; }
    st.animTime += dt;

    chReset(ch);

    /* ---------------- locomotion ---------------- */
    var speed = ps.speed || 0;
    st.speedSm = st.speedSm + (speed - st.speedSm) * Math.min(1, dt * 9);
    st.accel = (st.speedSm - st.prevSpeed) / dt;
    st.prevSpeed = st.speedSm;

    var moving = st.speedSm > 0.06;
    /* Cadence derived from real ground speed keeps the planted foot still. */
    var stride = 0.78 + st.speedSm * 0.10;
    var cadence = moving ? st.speedSm / stride : 0;
    st.gaitPhase += cadence * dt * Math.PI * 2;
    if (st.gaitPhase > Math.PI * 4) { st.gaitPhase -= Math.PI * 4; }
    var gp = st.gaitPhase;
    var swing = Math.min(1, st.speedSm / 3.2);
    var hunch = rig.meta.hunch || 0;

    st.breathePh += dt * (1.1 + st.speedSm * 0.34 + (ps.fear || 0) * 1.5);
    st.breathe = Math.sin(st.breathePh) * (0.012 + (ps.fear || 0) * 0.016 + st.speedSm * 0.004);

    var injured = ps.injured || 0;
    st.fearSm += ((ps.fear || 0) - st.fearSm) * Math.min(1, dt * 3);

    var quad = anim === 'crawl' || (rig.kind === 'crawler' && anim !== 'death');
    var dead = anim === 'death';

    if (!dead) {
      if (quad) {
        poseQuadruped(rig, ch, P, gp, swing, st);
      } else {
        poseBiped(rig, ch, P, gp, swing, st, anim, injured, hunch);
      }
    }

    /* ---------------- upper body additive: aim ---------------- */
    var wantAim = (anim === 'aim' || anim === 'fire' || anim === 'reload' ||
                   ps.aiming || anim === 'melee') ? 1 : 0;
    st.aimW += (wantAim - st.aimW) * Math.min(1, dt * 9);
    if (st.aimW > 0.004 && !dead) {
      applyAim(rig, ch, P, ps.aimPitch || 0, st.aimW, st);
    }

    /* ---------------- recoil impulses ---------------- */
    var r;
    r = spring(st.recArm, st.recArmV, 0, 300, 22, dt); st.recArm = r[0]; st.recArmV = r[1];
    r = spring(st.recChest, st.recChestV, 0, 220, 19, dt); st.recChest = r[0]; st.recChestV = r[1];
    r = spring(st.recHead, st.recHeadV, 0, 260, 20, dt); st.recHead = r[0]; st.recHeadV = r[1];
    if (Math.abs(st.recArm) > 1e-4) {
      addR(rig, ch, 'upperArmR', -st.recArm * 1.3, 0, 0);
      addR(rig, ch, 'upperArmL', -st.recArm * 0.9, 0, 0);
      addR(rig, ch, 'chest', -st.recChest * 0.55, 0, 0);
      addR(rig, ch, 'head', st.recHead * 0.8, 0, 0);
    }

    /* ---------------- hit reaction ---------------- */
    r = spring(st.hitX, st.hitXV, 0, 190, 16, dt); st.hitX = r[0]; st.hitXV = r[1];
    r = spring(st.hitZ, st.hitZV, 0, 190, 16, dt); st.hitZ = r[0]; st.hitZV = r[1];
    if (Math.abs(st.hitX) > 1e-4 || Math.abs(st.hitZ) > 1e-4) {
      addR(rig, ch, 'spine01', st.hitZ * 0.5, 0, st.hitX * 0.5);
      addR(rig, ch, 'chest', st.hitZ * 0.7, 0, st.hitX * 0.7);
      addR(rig, ch, 'head', st.hitZ * 0.5, 0, st.hitX * 0.4);
    }

    /* ---------------- state-specific overlays ---------------- */
    switch (anim) {
      case 'reload': poseReload(rig, ch, P, st); break;
      case 'melee': poseMelee(rig, ch, P, st); break;
      case 'stagger': poseStagger(rig, ch, st); break;
      case 'hurt': poseStagger(rig, ch, st); break;
      case 'cower': poseCower(rig, ch, P, st); break;
      case 'hide': poseCower(rig, ch, P, st); break;
      case 'grabbed': poseGrabbed(rig, ch, st); break;
      case 'climb': poseClimb(rig, ch, P, st); break;
      case 'vault': poseVault(rig, ch, st); break;
      case 'mutate': poseMutate(rig, ch, st); break;
      case 'death': poseDeath(rig, ch, st, ps, dt); break;
    }

    /* ---------------- head look-at ---------------- */
    if (!dead) { applyLookAt(rig, ch, ps, st, dt); }

    /* ---------------- face ---------------- */
    updateFace(rig, ch, ps, st, dt);

    /* ---------------- compose ---------------- */
    composeRig(rig, ch, dt);
  }

  function poseBiped(rig, ch, P, gp, swing, st, anim, injured, hunch) {
    var sinL = Math.sin(gp), sinR = Math.sin(gp + Math.PI);
    var crouch = anim === 'crouch' ? 1 : 0;
    /* limp: the injured leg spends less time in stance */
    var limp = injured * 0.5;
    var legAmp = 0.62 * swing;
    var armAmp = 0.48 * swing;

    /* pelvis: vertical bob at twice cadence, roll into the stance leg */
    var bob = -Math.abs(Math.cos(gp)) * 0.035 * swing - crouch * 0.30 + st.breathe * 0.4;
    setP(rig, ch, 'pelvis', 0, bob, 0);
    setR(rig, ch, 'pelvis',
         hunch * 0.5 + crouch * 0.35 + Math.min(0.22, st.accel * 0.02),
         Math.sin(gp) * 0.10 * swing,
         Math.cos(gp) * 0.07 * swing);

    /* spine counter-rotates against the hips */
    setR(rig, ch, 'spine01', hunch * 0.30 + crouch * 0.14, -Math.sin(gp) * 0.07 * swing, 0);
    setR(rig, ch, 'spine02', hunch * 0.30, -Math.sin(gp) * 0.06 * swing, 0);
    setR(rig, ch, 'chest', hunch * 0.30 + st.breathe * 1.6 + crouch * 0.10,
         -Math.sin(gp) * 0.10 * swing, 0);
    setR(rig, ch, 'neck', -hunch * 0.55 - crouch * 0.18, 0, 0);

    /* legs: pitch swing plus a knee bend that peaks through the swing phase */
    var legs = [['L', sinL, 1], ['R', sinR, 1 - limp]];
    for (var i = 0; i < 2; i++) {
      var sfx = legs[i][0], sv = legs[i][1], amp = legs[i][2];
      var thigh = sv * legAmp * amp - crouch * 0.85;
      var knee = Math.max(0, -sv) * 0.9 * swing * amp + 0.06 + crouch * 1.25;
      /* extra knee lift right after toe-off reads as a real stride */
      knee += Math.max(0, Math.sin(gp + (i ? Math.PI : 0) - 0.9)) * 0.45 * swing * amp;
      setR(rig, ch, 'thigh' + sfx, thigh, 0, 0);
      setR(rig, ch, 'shin' + sfx, knee, 0, 0);
      /* ankle keeps the foot roughly parallel to the ground */
      setR(rig, ch, 'foot' + sfx, -thigh * 0.55 - knee * 0.45 + crouch * 0.3, 0, 0);
      setR(rig, ch, 'toe' + sfx, Math.max(0, sv) * 0.35 * swing, 0, 0);
    }

    /* arms swing opposite the legs */
    setR(rig, ch, 'upperArmL', sinR * armAmp - hunch * 0.35, 0, 0.10 + hunch * 0.20);
    setR(rig, ch, 'upperArmR', sinL * armAmp - hunch * 0.35, 0, -0.10 - hunch * 0.20);
    setR(rig, ch, 'forearmL', -0.22 - Math.max(0, sinR) * 0.42 * swing - hunch * 0.5, 0, 0);
    setR(rig, ch, 'forearmR', -0.22 - Math.max(0, sinL) * 0.42 * swing - hunch * 0.5, 0, 0);

    /* injured: pull the near arm across the ribs */
    if (injured > 0.35) {
      addR(rig, ch, 'upperArmL', 0.35 * injured, 0, 0.42 * injured);
      addR(rig, ch, 'forearmL', -0.85 * injured, 0, 0);
      addR(rig, ch, 'chest', 0.12 * injured, 0, 0.10 * injured);
    }
  }

  function poseQuadruped(rig, ch, P, gp, swing, st) {
    var sinL = Math.sin(gp), sinR = Math.sin(gp + Math.PI);
    setP(rig, ch, 'pelvis', 0, -0.42, 0);
    setR(rig, ch, 'pelvis', 1.15, Math.sin(gp) * 0.14, 0);
    setR(rig, ch, 'spine01', -0.16, 0, 0);
    setR(rig, ch, 'spine02', -0.16, 0, 0);
    setR(rig, ch, 'chest', -0.24, Math.sin(gp) * 0.12, 0);
    setR(rig, ch, 'neck', -0.55, 0, 0);
    setR(rig, ch, 'head', -0.42, 0, 0);
    setR(rig, ch, 'upperArmL', -1.55 + sinL * 0.7 * swing, 0, 0.30);
    setR(rig, ch, 'upperArmR', -1.55 + sinR * 0.7 * swing, 0, -0.30);
    setR(rig, ch, 'forearmL', -0.55 - Math.max(0, sinL) * 0.6 * swing, 0, 0);
    setR(rig, ch, 'forearmR', -0.55 - Math.max(0, sinR) * 0.6 * swing, 0, 0);
    setR(rig, ch, 'thighL', sinR * 0.8 * swing + 0.35, 0, 0);
    setR(rig, ch, 'thighR', sinL * 0.8 * swing + 0.35, 0, 0);
    setR(rig, ch, 'shinL', Math.max(0, -sinR) * 1.1 * swing + 0.45, 0, 0);
    setR(rig, ch, 'shinR', Math.max(0, -sinL) * 1.1 * swing + 0.45, 0, 0);
  }

  /* Aim is additive over whatever the legs are doing, distributed across the
     spine so the character never snaps to face the reticle. */
  function applyAim(rig, ch, P, pitch, w, st) {
    var p = Math.max(-0.9, Math.min(0.9, pitch));
    addR(rig, ch, 'spine01', p * 0.12 * w, 0, 0);
    addR(rig, ch, 'spine02', p * 0.16 * w, 0, 0);
    addR(rig, ch, 'chest', p * 0.26 * w, 0.18 * w, 0);
    addR(rig, ch, 'neck', p * 0.18 * w, -0.08 * w, 0);

    /* right hand drives the weapon; left hand supports it */
    setR(rig, ch, 'upperArmR', -1.32 * w + p * 0.55 * w, 0.30 * w, -0.26 * w);
    setR(rig, ch, 'forearmR', -0.30 * w, 0, 0);
    setR(rig, ch, 'handR', 0.10 * w, 0, 0);
    setR(rig, ch, 'upperArmL', -1.18 * w + p * 0.50 * w, 0.62 * w, 0.42 * w);
    setR(rig, ch, 'forearmL', -0.92 * w, 0, 0);
    setR(rig, ch, 'handL', 0.18 * w, 0, 0);
  }

  function poseReload(rig, ch, P, st) {
    /* 2.3s sequence: mag release -> hand to pouch -> insert -> slap -> rack */
    var t = st.animTime / 2.3;
    var s = t < 1 ? t : 1;
    var handDown = Math.sin(Math.min(Math.PI, s * Math.PI * 1.6));
    addR(rig, ch, 'upperArmL', handDown * 1.05, 0, handDown * 0.55);
    addR(rig, ch, 'forearmL', -handDown * 1.35, 0, 0);
    addR(rig, ch, 'chest', handDown * 0.16, 0, 0);
    addR(rig, ch, 'head', handDown * 0.22, 0, 0);
    st.wMag = s < 0.25 ? -s * 4 * 0.09 : (s < 0.55 ? -0.09 + (s - 0.25) / 0.30 * 0.09 : 0);
    st.wSlide = (s > 0.72 && s < 0.88) ? -0.035 : 0;
    /* the aim is broken through the whole animation - the vulnerability
       window the combat design depends on */
    addR(rig, ch, 'upperArmR', handDown * 0.30, 0, 0);
  }

  function poseMelee(rig, ch, P, st) {
    var t = Math.min(1, st.animTime / 0.55);
    var swingCurve = Math.sin(t * Math.PI);
    var wind = t < 0.28 ? t / 0.28 : 1;
    addR(rig, ch, 'pelvis', 0, -0.55 * wind + swingCurve * 1.1, 0);
    addR(rig, ch, 'chest', -0.2 * wind + swingCurve * 0.5, -0.4 * wind + swingCurve * 0.9, 0);
    addR(rig, ch, 'upperArmR', -0.9 * wind - swingCurve * 0.6, 0, -0.5 * wind + swingCurve * 0.9);
    addR(rig, ch, 'forearmR', -1.4 * wind + swingCurve * 1.2, 0, 0);
    /* weight transfer: back foot pivots, front knee drives */
    addR(rig, ch, 'thighR', swingCurve * 0.75, 0, 0);
    addR(rig, ch, 'shinR', swingCurve * 0.55, 0, 0);
  }

  function poseStagger(rig, ch, st) {
    var t = Math.min(1, st.animTime / 0.45);
    var e = Math.sin(t * Math.PI) * (1 - t * 0.4);
    addR(rig, ch, 'spine01', e * 0.42, 0, 0);
    addR(rig, ch, 'chest', e * 0.55, 0, 0);
    addR(rig, ch, 'head', e * 0.45, 0, 0);
    addR(rig, ch, 'upperArmL', -e * 0.7, 0, e * 0.5);
    addR(rig, ch, 'upperArmR', -e * 0.7, 0, -e * 0.5);
    addP(rig, ch, 'pelvis', 0, -e * 0.10, 0);
  }

  function poseCower(rig, ch, P, st) {
    var f = 0.55 + st.fearSm * 0.45;
    /* high-frequency tremble scaled by fear - reads instantly as terror */
    var tr = Math.sin(st.time * 34) * 0.012 * st.fearSm;
    addP(rig, ch, 'pelvis', tr, -0.42 * f, 0);
    addR(rig, ch, 'pelvis', 0.55 * f, 0, 0);
    addR(rig, ch, 'spine01', 0.30 * f, 0, tr * 2);
    addR(rig, ch, 'chest', 0.42 * f, 0, 0);
    addR(rig, ch, 'neck', 0.30 * f, 0, 0);
    addR(rig, ch, 'head', 0.35 * f, 0, 0);
    addR(rig, ch, 'upperArmL', -2.1 * f, 0, 0.8 * f);
    addR(rig, ch, 'upperArmR', -2.1 * f, 0, -0.8 * f);
    addR(rig, ch, 'forearmL', -1.9 * f, 0, 0);
    addR(rig, ch, 'forearmR', -1.9 * f, 0, 0);
    addR(rig, ch, 'thighL', -1.5 * f, 0, 0.2);
    addR(rig, ch, 'thighR', -1.5 * f, 0, -0.2);
    addR(rig, ch, 'shinL', 1.9 * f, 0, 0);
    addR(rig, ch, 'shinR', 1.9 * f, 0, 0);
  }

  function poseGrabbed(rig, ch, st) {
    st.grabStruggle += st.dt * 9;
    var s = Math.sin(st.grabStruggle), c = Math.cos(st.grabStruggle * 1.37);
    addR(rig, ch, 'pelvis', 0, s * 0.22, c * 0.14);
    addR(rig, ch, 'chest', c * 0.2, s * 0.3, 0);
    addR(rig, ch, 'upperArmL', -1.5 + s * 0.6, 0, 0.7);
    addR(rig, ch, 'upperArmR', -1.5 - s * 0.6, 0, -0.7);
    addR(rig, ch, 'forearmL', -0.9, 0, 0);
    addR(rig, ch, 'forearmR', -0.9, 0, 0);
    addR(rig, ch, 'thighL', -0.5 + s * 0.4, 0, 0);
    addR(rig, ch, 'thighR', -0.5 - s * 0.4, 0, 0);
    addP(rig, ch, 'pelvis', 0, 0.12, 0);
  }

  function poseClimb(rig, ch, P, st) {
    var p = st.time * 3.2;
    var a = Math.sin(p), b = Math.sin(p + Math.PI);
    addR(rig, ch, 'upperArmL', -2.3 + a * 0.5, 0, 0.35);
    addR(rig, ch, 'upperArmR', -2.3 + b * 0.5, 0, -0.35);
    addR(rig, ch, 'forearmL', -0.6, 0, 0);
    addR(rig, ch, 'forearmR', -0.6, 0, 0);
    addR(rig, ch, 'thighL', -0.9 + b * 0.5, 0, 0);
    addR(rig, ch, 'thighR', -0.9 + a * 0.5, 0, 0);
    addR(rig, ch, 'shinL', 1.1, 0, 0);
    addR(rig, ch, 'shinR', 1.1, 0, 0);
  }

  function poseVault(rig, ch, st) {
    var t = Math.min(1, st.animTime / 0.7);
    var e = Math.sin(t * Math.PI);
    addP(rig, ch, 'pelvis', 0, e * 0.45, 0);
    addR(rig, ch, 'pelvis', e * 0.8, 0, 0);
    addR(rig, ch, 'thighL', -e * 1.5, 0, 0);
    addR(rig, ch, 'thighR', -e * 1.1, 0, 0);
    addR(rig, ch, 'shinL', e * 1.4, 0, 0);
    addR(rig, ch, 'upperArmR', -e * 1.6, 0, 0);
  }

  function poseMutate(rig, ch, st) {
    /* 2.5s: torso plates swing open, core exposed, extra arms unfold */
    var t = Math.min(1, st.animTime / 2.5);
    var open = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.45);
    st.mutatePhase = t;
    if (t > 0.35) { st.phase2 = true; }
    var rear = Math.sin(Math.min(Math.PI, t * Math.PI * 1.4));
    addR(rig, ch, 'chest', -rear * 0.55, 0, 0);
    addR(rig, ch, 'head', -rear * 0.7, 0, 0);
    addR(rig, ch, 'upperArmL', -rear * 1.5, 0, rear * 1.1);
    addR(rig, ch, 'upperArmR', -rear * 1.5, 0, -rear * 1.1);
    addR(rig, ch, 'coreShellL', 0, -open * 1.5, 0);
    addR(rig, ch, 'coreShellR', 0, open * 1.5, 0);
    var ea = open * 1.0;
    addR(rig, ch, 'extraArmL', -0.6 - ea * 0.8, 0, 1.2 * open);
    addR(rig, ch, 'extraArmR', -0.6 - ea * 0.8, 0, -1.2 * open);
    addR(rig, ch, 'extraForeL', -0.9 * open, 0, 0);
    addR(rig, ch, 'extraForeR', -0.9 * open, 0, 0);
    if (rig.nodes.core) { rig.nodes.core.hidden = open < 0.25; }
    if (rig.nodes.extraArmL) { rig.nodes.extraArmL.hidden = open < 0.05; }
    if (rig.nodes.extraArmR) { rig.nodes.extraArmR.hidden = open < 0.05; }
    if (rig.nodes.extraForeL) { rig.nodes.extraForeL.hidden = open < 0.05; }
    if (rig.nodes.extraForeR) { rig.nodes.extraForeR.hidden = open < 0.05; }
  }

  /* Death is a damped collapse toward the ground rather than a canned pose,
     so no two deaths look identical. */
  function poseDeath(rig, ch, st, ps, dt) {
    if (!st.dead) {
      st.dead = true; st.deathT = 0;
      st.deathKind = ps.deathKind || 'torso';
      st.deathDirX = ps.hitDir ? ps.hitDir[0] : 0;
      st.deathDirZ = ps.hitDir ? ps.hitDir[2] : 1;
    }
    st.deathT += dt;
    var t = Math.min(1, st.deathT / 1.25);
    var e = t * t * (3 - 2 * t);
    var back = st.deathKind === 'head' ? 1.0 : 0.75;
    addP(rig, ch, 'pelvis', st.deathDirX * e * 0.35, -0.86 * e, st.deathDirZ * e * 0.35);
    addR(rig, ch, 'pelvis', -e * 1.45 * back, 0, st.deathDirX * e * 0.6);
    addR(rig, ch, 'spine01', e * 0.35, 0, 0);
    addR(rig, ch, 'chest', e * 0.45, e * 0.3, 0);
    addR(rig, ch, 'neck', e * (st.deathKind === 'head' ? 0.9 : 0.5), 0, 0);
    addR(rig, ch, 'head', e * 0.7, e * 0.5, 0);
    addR(rig, ch, 'upperArmL', -e * 0.5, 0, e * 1.1);
    addR(rig, ch, 'upperArmR', -e * 0.5, 0, -e * 1.1);
    addR(rig, ch, 'forearmL', -e * 0.6, 0, 0);
    addR(rig, ch, 'forearmR', -e * 0.6, 0, 0);
    addR(rig, ch, 'thighL', -e * 0.9, 0, e * 0.35);
    addR(rig, ch, 'thighR', -e * 0.7, 0, -e * 0.5);
    addR(rig, ch, 'shinL', e * 1.1, 0, 0);
    addR(rig, ch, 'shinR', e * 0.8, 0, 0);
  }

  function applyLookAt(rig, ch, ps, st, dt) {
    var yawT = 0, pitchT = 0;
    if (ps.lookAt && rig.nodes.head) {
      var hw = rig.nodes.head.world;
      var dx = ps.lookAt[0] - hw[12], dy = ps.lookAt[1] - hw[13], dz = ps.lookAt[2] - hw[14];
      var yaw = Math.atan2(dx, dz);
      var hyp = Math.sqrt(dx * dx + dz * dz);
      pitchT = -Math.atan2(dy, hyp || 1e-3);
      yawT = yaw - (ps.bodyYaw || 0);
      while (yawT > Math.PI) { yawT -= Math.PI * 2; }
      while (yawT < -Math.PI) { yawT += Math.PI * 2; }
      /* limit cone: past it, give up rather than snap the neck */
      if (Math.abs(yawT) > 1.5) { yawT = 0; pitchT = 0; }
      yawT = Math.max(-1.0, Math.min(1.0, yawT));
      pitchT = Math.max(-0.6, Math.min(0.6, pitchT));
    }
    /* eyes lead the head - a small but very legible detail */
    st.eyeYaw += (yawT - st.eyeYaw) * Math.min(1, dt * 18);
    st.eyePitch += (pitchT - st.eyePitch) * Math.min(1, dt * 18);
    st.lookYaw += (yawT - st.lookYaw) * Math.min(1, dt * 6.5);
    st.lookPitch += (pitchT - st.lookPitch) * Math.min(1, dt * 6.5);
    addR(rig, ch, 'neck', st.lookPitch * 0.35, st.lookYaw * 0.35, 0);
    addR(rig, ch, 'head', st.lookPitch * 0.65, st.lookYaw * 0.65, 0);
    addR(rig, ch, 'eyeL', st.eyePitch * 0.5, st.eyeYaw * 0.5, 0);
    addR(rig, ch, 'eyeR', st.eyePitch * 0.5, st.eyeYaw * 0.5, 0);

    /* Elena glances back over her shoulder while following */
    if (rig.kind === 'elena') {
      st.glanceTimer -= dt;
      if (st.glanceTimer <= 0 && st.glanceT < 0) {
        st.glanceT = 0; st.glanceTimer = 4 + RG.f() * 6;
      }
      if (st.glanceT >= 0) {
        st.glanceT += dt;
        var g = Math.sin(Math.min(Math.PI, st.glanceT / 1.1 * Math.PI));
        addR(rig, ch, 'neck', 0, -g * 0.5, 0);
        addR(rig, ch, 'head', 0, -g * 0.75, 0);
        if (st.glanceT > 1.1) { st.glanceT = -1; }
      }
    }
  }

  function updateFace(rig, ch, ps, st, dt) {
    st.exFear += ((ps.fear === undefined ? st.tFear : ps.fear) - st.exFear) * Math.min(1, dt * 4);
    st.exPain += (st.tPain - st.exPain) * Math.min(1, dt * 6);
    st.exAnger += (st.tAnger - st.exAnger) * Math.min(1, dt * 5);
    st.exTalk += (st.tTalk - st.exTalk) * Math.min(1, dt * 14);

    /* auto blink */
    st.blinkTimer -= dt;
    if (st.blinkTimer <= 0 && st.blinkT < 0) {
      st.blinkT = 0;
      st.blinkTimer = 1.6 + RG.f() * 3.4 - st.exFear * 0.8;
    }
    var lid = 0;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      lid = Math.sin(Math.min(Math.PI, st.blinkT / 0.13 * Math.PI));
      if (st.blinkT > 0.13) { st.blinkT = -1; }
    }
    /* fear widens the eyes, pain narrows them */
    var aperture = 1 - lid + st.exFear * 0.22 - st.exPain * 0.35;
    setS(rig, ch, 'lidL', 1, Math.max(0.02, 1 - aperture), 1);
    setS(rig, ch, 'lidR', 1, Math.max(0.02, 1 - aperture), 1);
    addR(rig, ch, 'browL', -st.exFear * 0.22 + st.exAnger * 0.30, 0, st.exAnger * 0.22 - st.exFear * 0.16);
    addR(rig, ch, 'browR', -st.exFear * 0.22 + st.exAnger * 0.30, 0, -st.exAnger * 0.22 + st.exFear * 0.16);

    if (st.exTalk > 0.01) { st.talkPhase += dt * 15; }
    var jaw = st.exTalk * (0.5 + 0.5 * Math.sin(st.talkPhase)) * 0.28 +
              st.exPain * 0.20 + st.exFear * 0.06;
    addR(rig, ch, 'jaw', jaw, 0, 0);
  }

  function setExpression(rig, e) {
    if (!rig || !e) { return; }
    var st = rig.state;
    if (e.fear !== undefined) { st.tFear = e.fear; }
    if (e.pain !== undefined) { st.tPain = e.pain; }
    if (e.anger !== undefined) { st.tAnger = e.anger; }
    if (e.talk !== undefined) { st.tTalk = e.talk; }
    if (e.blink) { st.blinkT = 0; }
  }

  function addRecoil(rig, amount) {
    if (!rig) { return; }
    var st = rig.state;
    st.recArmV += amount * 9;
    st.recChestV += amount * 5;
    st.recHeadV += amount * 4;
  }
  function addHit(rig, dirX, dirZ, amount) {
    if (!rig) { return; }
    rig.state.hitXV += dirX * amount * 8;
    rig.state.hitZV += dirZ * amount * 8;
    rig.state.tPain = Math.min(1, rig.state.tPain + amount * 0.5);
  }

  /* ======================================================================
     SECTION 8 -- COMPOSITION AND OUTPUT
     ====================================================================== */
  var _lm = M4.create();

  function composeRig(rig, ch, dt) {
    var list = rig.list, i, n, o, m, pm;
    for (i = 0; i < list.length; i++) {
      n = list[i];
      o = n.idx * CH;
      m = n.m;
      M4.identity(m);
      m[12] = n.bx + ch[o + C_OX];
      m[13] = n.by + ch[o + C_OY];
      m[14] = n.bz + ch[o + C_OZ];
      var ry = ch[o + C_RY], rx = ch[o + C_RX], rz = ch[o + C_RZ];
      if (ry) { M4.rotateY(m, m, ry); }
      if (rx) { M4.rotateX(m, m, rx); }
      if (rz) { M4.rotateZ(m, m, rz); }
      var sx = ch[o + C_SX], sy = ch[o + C_SY], sz = ch[o + C_SZ];
      if (sx !== 1 || sy !== 1 || sz !== 1) {
        m[0] *= sx; m[1] *= sx; m[2] *= sx;
        m[4] *= sy; m[5] *= sy; m[6] *= sy;
        m[8] *= sz; m[9] *= sz; m[10] *= sz;
      }
      if (n.parentNode) { M4.mul(n.world, n.parentNode.world, m); }
      else { M4.copy(n.world, m); }
    }
    if (rig._jiggles.length) { updateJiggle(rig, dt); }
  }

  /* Secondary motion: each jiggle node leans away from its parent's world
     acceleration, damped. Clamped hard - an exploding jiggle chain is far
     worse than none at all. */
  function updateJiggle(rig, dt) {
    var js = rig._jiggles, i, n, j, w;
    var inv = dt > 1e-5 ? 1 / dt : 60;
    for (i = 0; i < js.length; i++) {
      n = js[i]; j = n.jig; w = n.world;
      if (!j.init) {
        j.px = w[12]; j.py = w[13]; j.pz = w[14];
        j.init = true; j.x = 0; j.z = 0; j.vx = 0; j.vz = 0;
        continue;
      }
      var vx = (w[12] - j.px) * inv, vy = (w[13] - j.py) * inv, vz = (w[14] - j.pz) * inv;
      var ax = (vx - j.vwx) * inv, az = (vz - j.vwz) * inv;
      j.vwx = vx; j.vwy = vy; j.vwz = vz;
      j.px = w[12]; j.py = w[13]; j.pz = w[14];
      if (!isFinite(ax)) { ax = 0; } if (!isFinite(az)) { az = 0; }
      ax = Math.max(-60, Math.min(60, ax));
      az = Math.max(-60, Math.min(60, az));
      var stiff = j.stiff || 45, damp = j.damp || 6.5, max = j.max || 0.5;
      j.vx += (-j.x * stiff - j.vx * damp - ax * 0.010) * dt;
      j.vz += (-j.z * stiff - j.vz * damp - az * 0.010) * dt;
      j.x += j.vx * dt; j.z += j.vz * dt;
      if (!isFinite(j.x)) { j.x = 0; j.vx = 0; }
      if (!isFinite(j.z)) { j.z = 0; j.vz = 0; }
      j.x = Math.max(-max, Math.min(max, j.x));
      j.z = Math.max(-max, Math.min(max, j.z));
      /* fold the offset straight into the world matrix of this subtree */
      M4.identity(_lm);
      M4.rotateX(_lm, _lm, j.z);
      M4.rotateZ(_lm, _lm, -j.x);
      M4.mul(n.world, n.world, _lm);
    }
  }

  var _wm = M4.create();

  function collect(rig, worldMatrix, out) {
    if (!rig || !out) { return out; }
    var items = rig._items, i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.node.hidden) { continue; }
      M4.mul(it.m, worldMatrix, it.node.world);
      out.push(it);
    }
    /* the held weapon rides the grip node */
    if (rig.weapon && rig.nodes.weaponGrip) {
      collectWeapon(rig, worldMatrix, out);
    }
    return out;
  }

  function collectWeapon(rig, worldMatrix, out) {
    var w = rig.weapon, st = rig.state;
    if (!w._items) {
      w._items = [];
      var keys = ['body', 'slide', 'mag', 'bolt', 'cylinder', 'pump'];
      for (var k = 0; k < keys.length; k++) {
        if (w.parts[keys[k]]) {
          w._items.push({ geo: w.parts[keys[k]], mat: w.mat, m: M4.create(),
                          castShadow: true, skin: null, part: keys[k] });
        }
      }
    }
    M4.mul(_wm, worldMatrix, rig.nodes.weaponGrip.world);
    for (var i = 0; i < w._items.length; i++) {
      var it = w._items[i];
      var at = w.parts[it.part + 'At'];
      M4.identity(_lm);
      if (at) { _lm[12] = at[0]; _lm[13] = at[1]; _lm[14] = at[2]; }
      /* animated parts: slide cycles on fire, mag drops on reload */
      if (it.part === 'slide') { _lm[14] += st.wSlide; }
      else if (it.part === 'mag') { _lm[13] += st.wMag; }
      else if (it.part === 'bolt') { _lm[14] += st.wBolt; }
      else if (it.part === 'pump') { _lm[14] += st.wPump; }
      else if (it.part === 'cylinder') { M4.rotateZ(_lm, _lm, st.wCyl); }
      M4.mul(it.m, _wm, _lm);
      out.push(it);
    }
  }

  function getBoneWorld(rig, name, outMat) {
    var n = rig && rig.nodes[name];
    if (!n) { return null; }
    if (outMat) { M4.copy(outMat, n.world); return outMat; }
    return n.world;
  }
  function getBonePos(rig, name, worldMatrix, out) {
    var n = rig && rig.nodes[name];
    if (!n) { return null; }
    if (worldMatrix) { M4.mul(_lm, worldMatrix, n.world); }
    else { M4.copy(_lm, n.world); }
    out[0] = _lm[12]; out[1] = _lm[13]; out[2] = _lm[14];
    return out;
  }
  /* Hit resolution against the posed skeleton: which body part did the shot
     land on? Returns the node tag ('hitHead' / 'shield' / 'weakpoint' / ...) */
  function hitTest(rig, worldMatrix, px, py, pz) {
    if (!rig) { return null; }
    var list = rig.list, best = null, bestD = 1e30, i, n;
    for (i = 0; i < list.length; i++) {
      n = list[i];
      if (!n.hit || n.hidden) { continue; }
      M4.mul(_lm, worldMatrix, n.world);
      var dx = px - _lm[12], dy = py - _lm[13], dz = pz - _lm[14];
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < n.hit * n.hit && d2 < bestD) { bestD = d2; best = n; }
    }
    return best ? (best.tag || best.name) : null;
  }

  IP.Actors = {
    build: build,
    makeRig: makeRig,
    pose: pose,
    collect: collect,
    getBoneWorld: getBoneWorld,
    getBonePos: getBonePos,
    hitTest: hitTest,
    setExpression: setExpression,
    setWeapon: setWeapon,
    makeWeapon: makeWeapon,
    addRecoil: addRecoil,
    addHit: addHit,
    solveIK2: solveIK2,
    KINDS: KINDS
  };

})();
if (typeof window !== 'undefined') { window.IP = IP; }

/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   30_geometry.js - IP.Geo  : procedural mesh construction kit (no WebGL)
                    IP.Level: the island itself - geometry, collision,
                              navigation, lighting, props, spawns, triggers.

   Geometry, collision boxes and nav cells are emitted TOGETHER by the same
   room/corridor primitives, so what you see is always what you collide with.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  var M4 = IP.M4, V3 = IP.V3, U = IP.Util, Noise = IP.Noise;
  var TAU = Math.PI * 2;

  /* ====================================================================== */
  /*  BUILDER - growable typed-array accumulator                            */
  /* ====================================================================== */
  function Builder(hintVerts) {
    this.pos = new Float32Array((hintVerts || 512) * 3);
    this.nrm = new Float32Array((hintVerts || 512) * 3);
    this.uv = new Float32Array((hintVerts || 512) * 2);
    this.col = new Float32Array((hintVerts || 512) * 3);
    this.idx = new Uint32Array((hintVerts || 512) * 3);
    this.vc = 0; this.ic = 0;
  }
  Builder.prototype._growV = function (need) {
    var cap = this.pos.length / 3;
    if (this.vc + need <= cap) { return; }
    var n = Math.max(cap * 2, this.vc + need + 64);
    var p = new Float32Array(n * 3); p.set(this.pos); this.pos = p;
    var q = new Float32Array(n * 3); q.set(this.nrm); this.nrm = q;
    var r = new Float32Array(n * 2); r.set(this.uv); this.uv = r;
    var s = new Float32Array(n * 3); s.set(this.col); this.col = s;
  };
  Builder.prototype._growI = function (need) {
    if (this.ic + need <= this.idx.length) { return; }
    var n = Math.max(this.idx.length * 2, this.ic + need + 128);
    var a = new Uint32Array(n); a.set(this.idx); this.idx = a;
  };
  /* Append a GeoData, optionally transformed and tinted. */
  Builder.prototype.push = function (geo, m, color) {
    if (!geo || !geo.positions) { return this; }
    var n = geo.positions.length / 3;
    this._growV(n);
    this._growI(geo.indices.length);
    var base = this.vc, i, o3, o2;
    var nm = m ? normalMat3(m) : null;
    for (i = 0; i < n; i++) {
      o3 = (base + i) * 3; o2 = (base + i) * 2;
      var x = geo.positions[i * 3], y = geo.positions[i * 3 + 1], z = geo.positions[i * 3 + 2];
      if (m) {
        this.pos[o3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        this.pos[o3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        this.pos[o3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      } else { this.pos[o3] = x; this.pos[o3 + 1] = y; this.pos[o3 + 2] = z; }
      var nx = geo.normals ? geo.normals[i * 3] : 0;
      var ny = geo.normals ? geo.normals[i * 3 + 1] : 1;
      var nz = geo.normals ? geo.normals[i * 3 + 2] : 0;
      if (nm) {
        var tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
        var ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
        var tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
        var l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        this.nrm[o3] = tx / l; this.nrm[o3 + 1] = ty / l; this.nrm[o3 + 2] = tz / l;
      } else { this.nrm[o3] = nx; this.nrm[o3 + 1] = ny; this.nrm[o3 + 2] = nz; }
      this.uv[o2] = geo.uvs ? geo.uvs[i * 2] : 0;
      this.uv[o2 + 1] = geo.uvs ? geo.uvs[i * 2 + 1] : 0;
      if (color) {
        this.col[o3] = color[0]; this.col[o3 + 1] = color[1]; this.col[o3 + 2] = color[2];
      } else if (geo.colors) {
        this.col[o3] = geo.colors[i * 3];
        this.col[o3 + 1] = geo.colors[i * 3 + 1];
        this.col[o3 + 2] = geo.colors[i * 3 + 2];
      } else { this.col[o3] = 1; this.col[o3 + 1] = 1; this.col[o3 + 2] = 1; }
    }
    for (i = 0; i < geo.indices.length; i++) { this.idx[this.ic + i] = geo.indices[i] + base; }
    this.vc += n; this.ic += geo.indices.length;
    return this;
  };
  Builder.prototype.isEmpty = function () { return this.ic === 0; };
  Builder.prototype.build = function () {
    var g = {
      positions: this.pos.subarray(0, this.vc * 3),
      normals: this.nrm.subarray(0, this.vc * 3),
      uvs: this.uv.subarray(0, this.vc * 2),
      colors: this.col.subarray(0, this.vc * 3),
      indices: this.idx.subarray(0, this.ic)
    };
    g.bounds = computeBounds(g);
    return g;
  };

  function normalMat3(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2],
        a10 = m[4], a11 = m[5], a12 = m[6],
        a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    var d = a00 * b01 + a01 * b11 + a02 * b21;
    if (!d) { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
    d = 1 / d;
    return [b01 * d, (-a22 * a01 + a02 * a21) * d, (a12 * a01 - a02 * a11) * d,
            b11 * d, (a22 * a00 - a02 * a20) * d, (-a12 * a00 + a02 * a10) * d,
            b21 * d, (-a21 * a00 + a01 * a20) * d, (a11 * a00 - a01 * a10) * d];
  }

  function computeBounds(g) {
    var p = g.positions, mnx = 1e30, mny = 1e30, mnz = 1e30;
    var mxx = -1e30, mxy = -1e30, mxz = -1e30;
    for (var i = 0; i < p.length; i += 3) {
      if (p[i] < mnx) { mnx = p[i]; } if (p[i] > mxx) { mxx = p[i]; }
      if (p[i + 1] < mny) { mny = p[i + 1]; } if (p[i + 1] > mxy) { mxy = p[i + 1]; }
      if (p[i + 2] < mnz) { mnz = p[i + 2]; } if (p[i + 2] > mxz) { mxz = p[i + 2]; }
    }
    if (!p.length) { mnx = mny = mnz = mxx = mxy = mxz = 0; }
    return { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] };
  }

  /* ====================================================================== */
  /*  PRIMITIVES                                                            */
  /* ====================================================================== */
  function mkGeo(vc, ic) {
    return {
      positions: new Float32Array(vc * 3), normals: new Float32Array(vc * 3),
      uvs: new Float32Array(vc * 2), colors: new Float32Array(vc * 3),
      indices: new Uint32Array(ic), _v: 0, _i: 0
    };
  }
  function vert(g, x, y, z, nx, ny, nz, u, v) {
    var i = g._v;
    g.positions[i * 3] = x; g.positions[i * 3 + 1] = y; g.positions[i * 3 + 2] = z;
    g.normals[i * 3] = nx; g.normals[i * 3 + 1] = ny; g.normals[i * 3 + 2] = nz;
    g.uvs[i * 2] = u; g.uvs[i * 2 + 1] = v;
    g.colors[i * 3] = 1; g.colors[i * 3 + 1] = 1; g.colors[i * 3 + 2] = 1;
    g._v++;
    return i;
  }
  function tri(g, a, b, c) { g.indices[g._i++] = a; g.indices[g._i++] = b; g.indices[g._i++] = c; }
  function quad(g, a, b, c, d) { tri(g, a, b, c); tri(g, a, c, d); }
  function finish(g) {
    delete g._v; delete g._i;
    g.bounds = computeBounds(g);
    return g;
  }

  var FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  function box(w, h, d, opts) {
    opts = opts || {};
    var hw = w / 2, hh = h / 2, hd = d / 2;
    var g = mkGeo(24, 36);
    var uvS = opts.uvScale || 1;
    var faces = [
      [[hw, -hh, -hd], [hw, -hh, hd], [hw, hh, hd], [hw, hh, -hd], d, h],
      [[-hw, -hh, hd], [-hw, -hh, -hd], [-hw, hh, -hd], [-hw, hh, hd], d, h],
      [[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd], w, d],
      [[-hw, -hh, hd], [hw, -hh, hd], [hw, -hh, -hd], [-hw, -hh, -hd], w, d],
      [[-hw, -hh, hd], [-hw, hh, hd], [hw, hh, hd], [hw, -hh, hd], w, h],
      [[hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, -hd], w, h]
    ];
    for (var f = 0; f < 6; f++) {
      var fc = faces[f], n = FACE_N[f];
      var uw = fc[4] * uvS, uh = fc[5] * uvS;
      var a = vert(g, fc[0][0], fc[0][1], fc[0][2], n[0], n[1], n[2], 0, 0);
      var b = vert(g, fc[1][0], fc[1][1], fc[1][2], n[0], n[1], n[2], uw, 0);
      var c = vert(g, fc[2][0], fc[2][1], fc[2][2], n[0], n[1], n[2], uw, uh);
      var dd = vert(g, fc[3][0], fc[3][1], fc[3][2], n[0], n[1], n[2], 0, uh);
      quad(g, a, b, c, dd);
    }
    return finish(g);
  }

  function plane(w, d, ws, ds, opts) {
    opts = opts || {};
    ws = Math.max(1, ws | 0); ds = Math.max(1, ds | 0);
    var g = mkGeo((ws + 1) * (ds + 1), ws * ds * 6);
    var uvS = opts.uvScale || 1;
    var up = opts.down ? -1 : 1;
    for (var z = 0; z <= ds; z++) {
      for (var x = 0; x <= ws; x++) {
        var px = (x / ws - 0.5) * w, pz = (z / ds - 0.5) * d;
        var py = opts.heightFn ? opts.heightFn(px, pz) : 0;
        vert(g, px, py, pz, 0, up, 0, px * uvS, pz * uvS);
      }
    }
    for (var zz = 0; zz < ds; zz++) {
      for (var xx = 0; xx < ws; xx++) {
        var i0 = zz * (ws + 1) + xx, i1 = i0 + 1, i2 = i0 + ws + 1, i3 = i2 + 1;
        if (up > 0) { tri(g, i0, i2, i1); tri(g, i1, i2, i3); }
        else { tri(g, i0, i1, i2); tri(g, i1, i3, i2); }
      }
    }
    if (opts.heightFn) { finish(g); computeNormals(g); return g; }
    return finish(g);
  }

  function cylinder(r0, r1, h, rseg, hseg, capped) {
    rseg = Math.max(3, rseg || 12); hseg = Math.max(1, hseg || 1);
    var caps = capped === false ? 0 : 2;
    var g = mkGeo((rseg + 1) * (hseg + 1) + caps * (rseg + 1), rseg * hseg * 6 + caps * rseg * 3);
    var y, s, i;
    var slope = (r0 - r1) / h;
    for (y = 0; y <= hseg; y++) {
      var t = y / hseg, r = r0 + (r1 - r0) * t, py = -h / 2 + h * t;
      for (s = 0; s <= rseg; s++) {
        var a = s / rseg * TAU, ca = Math.cos(a), sa = Math.sin(a);
        var nl = Math.sqrt(1 + slope * slope) || 1;
        vert(g, ca * r, py, sa * r, ca / nl, slope / nl, sa / nl, s / rseg * TAU * (r0 + r1) * 0.5, py);
      }
    }
    for (y = 0; y < hseg; y++) {
      for (s = 0; s < rseg; s++) {
        var i0 = y * (rseg + 1) + s, i1 = i0 + 1, i2 = i0 + rseg + 1, i3 = i2 + 1;
        quad(g, i0, i2, i3, i1);
      }
    }
    if (caps) {
      for (var cIdx = 0; cIdx < 2; cIdx++) {
        var top = cIdx === 0;
        var cy = top ? h / 2 : -h / 2, cr = top ? r1 : r0, ny = top ? 1 : -1;
        var centre = vert(g, 0, cy, 0, 0, ny, 0, 0, 0);
        var first = g._v;
        for (s = 0; s < rseg; s++) {
          var aa = s / rseg * TAU;
          vert(g, Math.cos(aa) * cr, cy, Math.sin(aa) * cr, 0, ny, 0,
               Math.cos(aa) * cr, Math.sin(aa) * cr);
        }
        for (s = 0; s < rseg; s++) {
          var n0 = first + s, n1 = first + ((s + 1) % rseg);
          if (top) { tri(g, centre, n0, n1); } else { tri(g, centre, n1, n0); }
        }
      }
    }
    return finish(g);
  }

  function sphere(r, wseg, hseg) {
    wseg = Math.max(3, wseg || 12); hseg = Math.max(2, hseg || 8);
    var g = mkGeo((wseg + 1) * (hseg + 1), wseg * hseg * 6);
    for (var y = 0; y <= hseg; y++) {
      var v = y / hseg, phi = v * Math.PI;
      for (var x = 0; x <= wseg; x++) {
        var u = x / wseg, theta = u * TAU;
        var nx = Math.sin(phi) * Math.cos(theta);
        var ny = Math.cos(phi);
        var nz = Math.sin(phi) * Math.sin(theta);
        vert(g, nx * r, ny * r, nz * r, nx, ny, nz, u * r * 3, v * r * 3);
      }
    }
    for (var yy = 0; yy < hseg; yy++) {
      for (var xx = 0; xx < wseg; xx++) {
        var i0 = yy * (wseg + 1) + xx, i1 = i0 + 1, i2 = i0 + wseg + 1, i3 = i2 + 1;
        if (yy !== 0) { tri(g, i0, i2, i1); }
        if (yy !== hseg - 1) { tri(g, i1, i2, i3); }
      }
    }
    return finish(g);
  }

  function capsule(r, h, seg) {
    seg = Math.max(4, seg || 10);
    var rings = Math.max(2, seg >> 1);
    var g = mkGeo((seg + 1) * (rings * 2 + 2), seg * (rings * 2 + 1) * 6);
    var half = Math.max(0, h * 0.5 - r);
    var y, x, row = 0, rowsY = [], rowsR = [];
    for (y = 0; y <= rings; y++) {
      var p = y / rings * Math.PI * 0.5;
      rowsY.push(half + Math.sin(p) * r); rowsR.push(Math.cos(p) * r);
    }
    for (y = rings; y >= 0; y--) {
      rowsY.push(-half - Math.sin(y / rings * Math.PI * 0.5) * r);
      rowsR.push(Math.cos(y / rings * Math.PI * 0.5) * r);
    }
    var total = rowsY.length;
    for (row = 0; row < total; row++) {
      for (x = 0; x <= seg; x++) {
        var a = x / seg * TAU, ca = Math.cos(a), sa = Math.sin(a);
        var py = rowsY[row], pr = rowsR[row];
        var ny = py > half ? (py - half) / r : (py < -half ? (py + half) / r : 0);
        var nl = Math.sqrt(ca * ca + ny * ny + sa * sa) || 1;
        vert(g, ca * pr, py, sa * pr, ca / nl, ny / nl, sa / nl, x / seg * 2, py);
      }
    }
    for (row = 0; row < total - 1; row++) {
      for (x = 0; x < seg; x++) {
        var i0 = row * (seg + 1) + x, i1 = i0 + 1, i2 = i0 + seg + 1, i3 = i2 + 1;
        quad(g, i0, i1, i3, i2);
      }
    }
    return finish(g);
  }

  function cone(r, h, seg) { return cylinder(r, 0.001, h, seg || 10, 1, true); }
  function disc(r, seg) { return cylinder(r, r, 0.002, seg || 12, 1, true); }

  function torus(R, r, rseg, tseg) {
    rseg = rseg || 16; tseg = tseg || 8;
    var g = mkGeo((rseg + 1) * (tseg + 1), rseg * tseg * 6);
    for (var i = 0; i <= rseg; i++) {
      var a = i / rseg * TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (var j = 0; j <= tseg; j++) {
        var b = j / tseg * TAU, cb = Math.cos(b), sb = Math.sin(b);
        var nx = ca * cb, ny = sb, nz = sa * cb;
        vert(g, ca * (R + r * cb), r * sb, sa * (R + r * cb), nx, ny, nz, i / rseg * 4, j / tseg);
      }
    }
    for (var ii = 0; ii < rseg; ii++) {
      for (var jj = 0; jj < tseg; jj++) {
        var i0 = ii * (tseg + 1) + jj, i1 = i0 + 1, i2 = i0 + tseg + 1, i3 = i2 + 1;
        quad(g, i0, i2, i3, i1);
      }
    }
    return finish(g);
  }

  /* Solid of revolution from a 2D profile [[r,y],...]. */
  function lathe(profile, seg) {
    seg = Math.max(3, seg || 12);
    var n = profile.length;
    var g = mkGeo((seg + 1) * n, seg * (n - 1) * 6);
    for (var s = 0; s <= seg; s++) {
      var a = s / seg * TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (var i = 0; i < n; i++) {
        var r = profile[i][0], y = profile[i][1];
        var dr = (profile[Math.min(i + 1, n - 1)][0] - profile[Math.max(i - 1, 0)][0]);
        var dy = (profile[Math.min(i + 1, n - 1)][1] - profile[Math.max(i - 1, 0)][1]);
        var nl = Math.sqrt(dr * dr + dy * dy) || 1;
        var nx = ca * dy / nl, ny = -dr / nl, nz = sa * dy / nl;
        vert(g, ca * r, y, sa * r, nx, ny, nz, s / seg * 3, y);
      }
    }
    for (var ss = 0; ss < seg; ss++) {
      for (var ii = 0; ii < n - 1; ii++) {
        var i0 = ss * n + ii, i1 = i0 + 1, i2 = i0 + n, i3 = i2 + 1;
        quad(g, i0, i1, i3, i2);
      }
    }
    return finish(g);
  }

  /* Swept tube along a polyline. */
  function tube(points, r, seg) {
    seg = Math.max(3, seg || 8);
    var n = points.length;
    if (n < 2) { return box(0.01, 0.01, 0.01); }
    var g = mkGeo((seg + 1) * n, seg * (n - 1) * 6);
    var up = [0, 1, 0];
    for (var i = 0; i < n; i++) {
      var p = points[i];
      var a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      var tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      var ref = Math.abs(ty) > 0.94 ? [1, 0, 0] : up;
      var sx = ref[1] * tz - ref[2] * ty, sy = ref[2] * tx - ref[0] * tz, sz = ref[0] * ty - ref[1] * tx;
      var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      var ux = ty * sz - tz * sy, uy = tz * sx - tx * sz, uz = tx * sy - ty * sx;
      for (var s = 0; s <= seg; s++) {
        var ang = s / seg * TAU, c = Math.cos(ang), si = Math.sin(ang);
        var nx = sx * c + ux * si, ny = sy * c + uy * si, nz = sz * c + uz * si;
        vert(g, p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, s / seg * 2, i);
      }
    }
    for (var ii = 0; ii < n - 1; ii++) {
      for (var ss = 0; ss < seg; ss++) {
        var i0 = ii * (seg + 1) + ss, i1 = i0 + 1, i2 = i0 + seg + 1, i3 = i2 + 1;
        quad(g, i0, i2, i3, i1);
      }
    }
    return finish(g);
  }

  function stairs(steps, w, rise, run) {
    var b = new Builder(steps * 24);
    var m = M4.create();
    for (var i = 0; i < steps; i++) {
      M4.identity(m);
      m[12] = 0; m[13] = rise * (i + 0.5); m[14] = -run * (i + 0.5);
      b.push(box(w, rise, run), m);
    }
    return b.build();
  }

  function ladder(h, rungs) {
    var b = new Builder(rungs * 24 + 48), m = M4.create();
    M4.identity(m); m[12] = -0.22; m[13] = h / 2;
    b.push(box(0.06, h, 0.06), m);
    M4.identity(m); m[12] = 0.22; m[13] = h / 2;
    b.push(box(0.06, h, 0.06), m);
    for (var i = 0; i < rungs; i++) {
      M4.identity(m); m[13] = (i + 0.5) * (h / rungs);
      b.push(box(0.5, 0.04, 0.04), m);
    }
    return b.build();
  }

  function railing(points, h) {
    var b = new Builder(points.length * 40), m = M4.create(), i;
    for (i = 0; i < points.length; i++) {
      M4.identity(m);
      m[12] = points[i][0]; m[13] = points[i][1] + h / 2; m[14] = points[i][2];
      b.push(box(0.05, h, 0.05), m);
    }
    for (i = 0; i < points.length - 1; i++) {
      var a = points[i], c = points[i + 1];
      var dx = c[0] - a[0], dz = c[2] - a[2];
      var len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) { continue; }
      var ang = Math.atan2(dx, dz);
      for (var k = 0; k < 2; k++) {
        M4.identity(m);
        M4.rotateY(m, m, ang);
        m[12] = (a[0] + c[0]) / 2; m[13] = a[1] + h * (k ? 0.55 : 1.0); m[14] = (a[2] + c[2]) / 2;
        b.push(box(0.04, 0.04, len), m);
      }
    }
    return b.build();
  }

  function terrain(w, d, cell, heightFn) {
    return plane(w, d, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(d / cell)),
                 { heightFn: heightFn, uvScale: 1 });
  }

  /* ---------------------------------------------------------------- ops -- */
  function transform(geo, m) {
    var b = new Builder(geo.positions.length / 3);
    b.push(geo, m);
    return b.build();
  }
  function merge(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) {
      var gg = list[i].geo || list[i].geoData || list[i];
      if (gg && gg.positions) { total += gg.positions.length / 3; }
    }
    var b = new Builder(Math.max(64, total));
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      b.push(e.geo || e.geoData || e, e.matrix || e.m || null, e.color || null);
    }
    return b.build();
  }
  function computeNormals(g) {
    var p = g.positions, idx = g.indices, n = g.normals;
    for (var i = 0; i < n.length; i++) { n[i] = 0; }
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      var e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      var e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (var v = 0; v < n.length; v += 3) {
      var l = Math.sqrt(n[v] * n[v] + n[v + 1] * n[v + 1] + n[v + 2] * n[v + 2]);
      if (l > 1e-8) { n[v] /= l; n[v + 1] /= l; n[v + 2] /= l; }
      else { n[v] = 0; n[v + 1] = 1; n[v + 2] = 0; }
    }
    return g;
  }
  function noiseDisplace(g, amp, freq) {
    var p = g.positions;
    for (var i = 0; i < p.length; i += 3) {
      var d = Noise.perlin3(p[i] * freq, p[i + 1] * freq, p[i + 2] * freq) * amp;
      p[i] += g.normals[i] * d;
      p[i + 1] += g.normals[i + 1] * d;
      p[i + 2] += g.normals[i + 2] * d;
    }
    computeNormals(g);
    g.bounds = computeBounds(g);
    return g;
  }

  IP.Geo = {
    Builder: Builder, box: box, plane: plane, cylinder: cylinder, sphere: sphere,
    capsule: capsule, cone: cone, disc: disc, torus: torus, lathe: lathe, tube: tube,
    stairs: stairs, ladder: ladder, railing: railing, terrain: terrain,
    merge: merge, transform: transform, computeNormals: computeNormals,
    computeBounds: computeBounds, noiseDisplace: noiseDisplace
  };

  /* ====================================================================== */
  /*  LEVEL CONSTRUCTION                                                    */
  /* ====================================================================== */

  /* Material palette. `tex` ids must exist in the renderer's TEX_IDS list. */
  var MAT = {
    concreteWall: { albedo: [0.30, 0.30, 0.31], rough: 0.92, metal: 0, tex: 'concrete', texScale: 0.35 },
    concreteFloor: { albedo: [0.22, 0.22, 0.23], rough: 0.88, metal: 0, tex: 'concrete', texScale: 0.4 },
    tileWall: { albedo: [0.52, 0.55, 0.52], rough: 0.42, metal: 0, tex: 'tile', texScale: 0.5 },
    tileFloor: { albedo: [0.34, 0.36, 0.34], rough: 0.38, metal: 0, tex: 'tile', texScale: 0.5 },
    metalWall: { albedo: [0.34, 0.36, 0.39], rough: 0.52, metal: 0.85, tex: 'metal', texScale: 0.4 },
    metalFloor: { albedo: [0.28, 0.29, 0.32], rough: 0.55, metal: 0.8, tex: 'grate', texScale: 0.6 },
    rust: { albedo: [0.36, 0.20, 0.12], rough: 0.88, metal: 0.55, tex: 'rust', texScale: 0.45 },
    wood: { albedo: [0.30, 0.21, 0.13], rough: 0.85, metal: 0, tex: 'wood', texScale: 0.5 },
    rock: { albedo: [0.24, 0.24, 0.25], rough: 0.95, metal: 0, tex: 'rock', texScale: 0.22 },
    dirt: { albedo: [0.20, 0.17, 0.13], rough: 0.98, metal: 0, tex: 'dirt', texScale: 0.3 },
    foliage: { albedo: [0.11, 0.19, 0.10], rough: 0.85, metal: 0, tex: 'foliage', texScale: 0.6, doubleSided: true },
    flesh: { albedo: [0.30, 0.11, 0.13], rough: 0.55, metal: 0, tex: 'flesh', texScale: 0.7 },
    growth: { albedo: [0.18, 0.26, 0.14], rough: 0.5, metal: 0, tex: 'flesh', texScale: 0.9,
              emissive: [0.06, 0.30, 0.12], emissivePulse: 0.22 },
    fabric: { albedo: [0.26, 0.24, 0.22], rough: 0.95, metal: 0, tex: 'fabric', texScale: 0.6 },
    glass: { albedo: [0.55, 0.68, 0.66], rough: 0.06, metal: 0, tex: 'glass', texScale: 0.5, alpha: 0.26 },
    tankFluid: { albedo: [0.10, 0.40, 0.22], rough: 0.1, metal: 0, alpha: 0.55,
                 emissive: [0.10, 0.85, 0.35], emissivePulse: 0.15 },
    water: { albedo: [0.05, 0.09, 0.11], rough: 0.05, metal: 0.1, alpha: 0.72 },
    emergency: { albedo: [0.10, 0.02, 0.02], rough: 0.4, metal: 0.2, emissive: [2.4, 0.18, 0.10] },
    screen: { albedo: [0.03, 0.05, 0.06], rough: 0.2, metal: 0.1, emissive: [0.10, 0.75, 0.55], emissivePulse: 0.6 }
  };
  function matOf(m, over) {
    var o = {}, k;
    for (k in m) { if (Object.prototype.hasOwnProperty.call(m, k)) { o[k] = m[k]; } }
    if (over) { for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { o[k] = over[k]; } } }
    return o;
  }

  /* --- section construction context ------------------------------------ */
  function Ctx(id, name, act, theme, rng) {
    this.id = id; this.name = name; this.act = act; this.theme = theme; this.rng = rng;
    this.groups = {};           /* materialKey -> {builder, material} */
    this.transparent = [];
    this.collision = [];
    this.lights = [];
    this.props = [];
    this.spawns = [];
    this.triggers = [];
    this.walk = [];             /* walkable rects {x0,z0,x1,z1,y} */
    this.min = [1e9, 1e9, 1e9];
    this.max = [-1e9, -1e9, -1e9];
    this.indoor = theme.indoor !== false;
  }
  Ctx.prototype.grp = function (key, material) {
    var g = this.groups[key];
    if (!g) { g = this.groups[key] = { b: new Builder(2048), material: material, key: key, n: 0 }; }
    return g;
  };
  /* Add a solid box: geometry + collision, in one call. */
  Ctx.prototype.solid = function (key, material, cx, cy, cz, w, h, d, opts) {
    opts = opts || {};
    var g = this.grp(key + (opts.split ? '_' + ((g && g.n) || 0) : ''), material);
    var m = M4.create();
    if (opts.ry) { M4.rotateY(m, m, opts.ry); }
    m[12] = cx; m[13] = cy; m[14] = cz;
    g.b.push(box(w, h, d, { uvScale: opts.uvScale || 1 }), m, opts.color || null);
    g.n++;
    if (opts.noCollide !== true) {
      this.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2,
               opts.tag || 'wall');
    }
    this.expand(cx - w / 2, cy - h / 2, cz - d / 2);
    this.expand(cx + w / 2, cy + h / 2, cz + d / 2);
    return this;
  };
  Ctx.prototype.mesh = function (key, material, geo, m, color) {
    var g = this.grp(key, material);
    g.b.push(geo, m, color);
    g.n++;
    return this;
  };
  Ctx.prototype.glassMesh = function (material, geo, m, color) {
    var b = new Builder(geo.positions.length / 3);
    b.push(geo, m, color);
    this.transparent.push({ geoData: b.build(), material: material });
    return this;
  };
  Ctx.prototype.box = function (x0, y0, z0, x1, y1, z1, tag) {
    this.collision.push({ min: [x0, y0, z0], max: [x1, y1, z1], tag: tag || 'wall' });
    return this;
  };
  Ctx.prototype.expand = function (x, y, z) {
    if (x < this.min[0]) { this.min[0] = x; } if (x > this.max[0]) { this.max[0] = x; }
    if (y < this.min[1]) { this.min[1] = y; } if (y > this.max[1]) { this.max[1] = y; }
    if (z < this.min[2]) { this.min[2] = z; } if (z > this.max[2]) { this.max[2] = z; }
  };
  Ctx.prototype.light = function (x, y, z, color, range, intensity, opts) {
    opts = opts || {};
    this.lights.push({
      pos: [x, y, z], color: color, range: range, intensity: intensity,
      flicker: opts.flicker || 0, tag: opts.tag || 'mains'
    });
    return this;
  };
  Ctx.prototype.prop = function (type, x, y, z, opts) {
    opts = opts || {};
    this.props.push({
      id: this.id + '_' + type + '_' + this.props.length,
      type: type, pos: [x, y, z], rot: opts.rot || 0, scale: opts.scale || 1,
      interactive: opts.interactive !== false, tag: opts.tag || null,
      hp: opts.hp, loot: opts.loot || null, locked: opts.locked || false
    });
    return this;
  };
  Ctx.prototype.spawn = function (kind, x, y, z, opts) {
    opts = opts || {};
    this.spawns.push({
      kind: kind, pos: [x, y, z], wave: opts.wave || 0,
      trigger: opts.trigger || null, from: opts.from || 'ground'
    });
    return this;
  };
  Ctx.prototype.trigger = function (id, x0, z0, x1, z1, event, once, y0, y1) {
    this.triggers.push({
      id: id, min: [Math.min(x0, x1), y0 === undefined ? -2 : y0, Math.min(z0, z1)],
      max: [Math.max(x0, x1), y1 === undefined ? 6 : y1, Math.max(z0, z1)],
      event: event, once: once !== false
    });
    return this;
  };
  Ctx.prototype.walkable = function (x0, z0, x1, z1, y) {
    this.walk.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1),
                     x1: Math.max(x0, x1), z1: Math.max(z0, z1), y: y || 0 });
    return this;
  };

  /* --- room: floor, ceiling and four walls with door gaps --------------- */
  /* doors: array of {side:'n'|'s'|'e'|'w', at: offset along the wall, w: width} */
  function room(ctx, x, z, w, d, h, opts) {
    opts = opts || {};
    var th = ctx.theme;
    var y = opts.y || 0;
    var wallMat = opts.wallMat || th.wall;
    var floorMat = opts.floorMat || th.floor;
    var key = opts.key || (ctx.id + '_r' + Object.keys(ctx.groups).length);
    var doors = opts.doors || [];
    var t = 0.32; /* wall thickness */

    /* floor */
    if (opts.floor !== false) {
      ctx.solid(key + '_f', floorMat, x, y - 0.15, z, w, 0.3, d, { tag: 'floor', uvScale: 1 });
    }
    ctx.walkable(x - w / 2 + 0.4, z - d / 2 + 0.4, x + w / 2 - 0.4, z + d / 2 - 0.4, y);

    /* ceiling */
    if (opts.ceiling !== false && ctx.indoor) {
      ctx.solid(key + '_c', wallMat, x, y + h + 0.15, z, w, 0.3, d, { tag: 'wall' });
    }

    /* walls with gaps for doors */
    var sides = [
      { s: 'n', cx: x, cz: z - d / 2, len: w, horiz: true, dz: -1 },
      { s: 's', cx: x, cz: z + d / 2, len: w, horiz: true, dz: 1 },
      { s: 'w', cx: x - w / 2, cz: z, len: d, horiz: false, dx: -1 },
      { s: 'e', cx: x + w / 2, cz: z, len: d, horiz: false, dx: 1 }
    ];
    for (var si = 0; si < sides.length; si++) {
      var sd = sides[si];
      if (opts.open && opts.open.indexOf(sd.s) >= 0) { continue; }
      /* collect gaps on this side, sorted along the wall */
      var gaps = [];
      for (var di = 0; di < doors.length; di++) {
        if (doors[di].side === sd.s) {
          var dw = doors[di].w || 1.6;
          gaps.push([doors[di].at - dw / 2, doors[di].at + dw / 2, doors[di].h || 2.3]);
        }
      }
      gaps.sort(function (a, b) { return a[0] - b[0]; });
      var cursor = -sd.len / 2;
      for (var gi = 0; gi <= gaps.length; gi++) {
        var end = gi < gaps.length ? gaps[gi][0] : sd.len / 2;
        var segLen = end - cursor;
        if (segLen > 0.02) {
          var mid = (cursor + end) / 2;
          if (sd.horiz) {
            ctx.solid(key + '_w', wallMat, x + mid, y + h / 2, sd.cz, segLen, h, t, {});
          } else {
            ctx.solid(key + '_w', wallMat, sd.cx, y + h / 2, z + mid, t, h, segLen, {});
          }
        }
        if (gi < gaps.length) {
          /* lintel above the opening */
          var dh = gaps[gi][2];
          var ow = gaps[gi][1] - gaps[gi][0];
          var omid = (gaps[gi][0] + gaps[gi][1]) / 2;
          if (h > dh + 0.05) {
            if (sd.horiz) {
              ctx.solid(key + '_w', wallMat, x + omid, y + dh + (h - dh) / 2, sd.cz, ow, h - dh, t, {});
            } else {
              ctx.solid(key + '_w', wallMat, sd.cx, y + dh + (h - dh) / 2, z + omid, t, h - dh, ow, {});
            }
          }
          /* the doorway itself stays walkable */
          if (sd.horiz) { ctx.walkable(x + omid - ow / 2, sd.cz - 0.6, x + omid + ow / 2, sd.cz + 0.6, y); }
          else { ctx.walkable(sd.cx - 0.6, z + omid - ow / 2, sd.cx + 0.6, z + omid + ow / 2, y); }
          cursor = gaps[gi][1];
        }
      }
    }
    if (opts.detail !== false && ctx.indoor) { detailRoom(ctx, key, x, z, w, d, h, y, wallMat); }
    return { x: x, z: z, w: w, d: d, h: h, y: y };
  }

  /* Architectural greebling. Flat boxes read as untextured cardboard no matter
     how good the shading is; ribs, skirting and fixtures give the eye edges to
     catch and make the lighting legible. Purely visual - no collision, so it
     never interferes with movement or navigation. */
  function detailRoom(ctx, key, x, z, w, d, h, y, wallMat) {
    var m = M4.create();
    var trimMat = matOf(wallMat, { albedo: [wallMat.albedo[0] * 0.72,
                                            wallMat.albedo[1] * 0.72,
                                            wallMat.albedo[2] * 0.72] });
    var g = ctx.grp(key + '_dt', trimMat);
    var i, n, px, pz;

    /* skirting along all four walls */
    var sk = 0.14;
    for (i = 0; i < 2; i++) {
      M4.identity(m); m[12] = x; m[13] = y + sk / 2; m[14] = z + (i ? d / 2 : -d / 2) * 0.97;
      g.b.push(box(w * 0.99, sk, 0.09), m);
      M4.identity(m); m[12] = x + (i ? w / 2 : -w / 2) * 0.97; m[13] = y + sk / 2; m[14] = z;
      g.b.push(box(0.09, sk, d * 0.99), m);
    }

    /* vertical ribs / pilasters at regular intervals */
    var ribW = 0.16, spacing = 3.2;
    n = Math.max(1, Math.floor(w / spacing));
    for (i = 0; i <= n; i++) {
      px = x - w / 2 + (i / n) * w;
      for (var s2 = 0; s2 < 2; s2++) {
        pz = z + (s2 ? d / 2 : -d / 2) * 0.95;
        M4.identity(m); m[12] = px; m[13] = y + h * 0.5; m[14] = pz;
        g.b.push(box(ribW, h * 0.98, 0.11), m);
      }
    }
    n = Math.max(1, Math.floor(d / spacing));
    for (i = 0; i <= n; i++) {
      pz = z - d / 2 + (i / n) * d;
      for (var s3 = 0; s3 < 2; s3++) {
        px = x + (s3 ? w / 2 : -w / 2) * 0.95;
        M4.identity(m); m[12] = px; m[13] = y + h * 0.5; m[14] = pz;
        g.b.push(box(0.11, h * 0.98, ribW), m);
      }
    }

    /* ceiling beams across the short axis, plus a strip-light housing */
    var beams = Math.max(1, Math.floor(Math.max(w, d) / 3.6));
    var along = w >= d;
    for (i = 0; i < beams; i++) {
      var t = (i + 0.5) / beams;
      M4.identity(m);
      if (along) {
        m[12] = x - w / 2 + t * w; m[13] = y + h - 0.16; m[14] = z;
        g.b.push(box(0.22, 0.3, d * 0.98), m);
      } else {
        m[12] = x; m[13] = y + h - 0.16; m[14] = z - d / 2 + t * d;
        g.b.push(box(w * 0.98, 0.3, 0.22), m);
      }
      /* fixture housing under every other beam */
      if (i % 2 === 0) {
        M4.identity(m);
        if (along) { m[12] = x - w / 2 + t * w; m[13] = y + h - 0.36; m[14] = z; }
        else { m[12] = x; m[13] = y + h - 0.36; m[14] = z - d / 2 + t * d; }
        ctx.mesh(key + '_fix', MAT.metalWall,
                 box(along ? 0.34 : Math.min(w * 0.4, 2.2), 0.12,
                     along ? Math.min(d * 0.4, 2.2) : 0.34), m);
      }
    }

    /* wall panel insets - two rows of shallow recessed plates */
    var panelMat = matOf(wallMat, { albedo: [wallMat.albedo[0] * 1.14,
                                             wallMat.albedo[1] * 1.14,
                                             wallMat.albedo[2] * 1.14], rough: 0.7 });
    var pg = ctx.grp(key + '_pan', panelMat);
    var cols = Math.max(1, Math.floor(w / 2.4));
    for (i = 0; i < cols; i++) {
      px = x - w / 2 + (i + 0.5) * (w / cols);
      for (var row = 0; row < 2; row++) {
        var pyy = y + 0.55 + row * (h * 0.42);
        if (pyy + 0.5 > y + h) { continue; }
        M4.identity(m); m[12] = px; m[13] = pyy; m[14] = z - d / 2 * 0.94;
        pg.b.push(box(w / cols * 0.7, h * 0.3, 0.05), m);
        M4.identity(m); m[12] = px; m[13] = pyy; m[14] = z + d / 2 * 0.94;
        pg.b.push(box(w / cols * 0.7, h * 0.3, 0.05), m);
      }
    }
  }

  /* --- corridor between two points (axis aligned) ----------------------- */
  function corridor(ctx, x0, z0, x1, z1, width, h, opts) {
    opts = opts || {};
    var horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    var len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    var w = horiz ? len : width, d = horiz ? width : len;
    return room(ctx, cx, cz, w, d, h, {
      key: opts.key || (ctx.id + '_cor' + ctx.collision.length),
      doors: opts.doors || [],
      open: opts.open || (horiz ? ['w', 'e'] : ['n', 's']),
      y: opts.y || 0,
      wallMat: opts.wallMat, floorMat: opts.floorMat
    });
  }

  /* --- clutter ---------------------------------------------------------- */
  function clutter(ctx, x, z, w, d, density, kinds) {
    var r = ctx.rng;
    var n = Math.max(0, Math.round(w * d * density));
    for (var i = 0; i < n; i++) {
      var px = x + (r.f() - 0.5) * (w - 1.4);
      var pz = z + (r.f() - 0.5) * (d - 1.4);
      var kind = kinds[Math.floor(r.f() * kinds.length) % kinds.length];
      var ry = r.f() * TAU;
      var m = M4.create();
      switch (kind) {
        case 'crate':
          var cs = 0.55 + r.f() * 0.35;
          M4.rotateY(m, m, ry); m[12] = px; m[13] = cs / 2; m[14] = pz;
          ctx.mesh('clutter_wood', MAT.wood, box(cs, cs, cs, { uvScale: 1.5 }), m);
          ctx.box(px - cs / 2, 0, pz - cs / 2, px + cs / 2, cs, pz + cs / 2, 'prop');
          ctx.prop('crate', px, 0, pz, { rot: ry, hp: 25, loot: 'random' });
          break;
        case 'barrel':
          M4.rotateY(m, m, ry); m[12] = px; m[13] = 0.45; m[14] = pz;
          ctx.mesh('clutter_rust', MAT.rust, cylinder(0.3, 0.3, 0.9, 12, 1, true), m);
          ctx.box(px - 0.3, 0, pz - 0.3, px + 0.3, 0.9, pz + 0.3, 'prop');
          ctx.prop('barrel_explosive', px, 0, pz, { rot: ry, hp: 12, tag: 'explosive' });
          break;
        case 'debris':
          for (var k = 0; k < 3; k++) {
            M4.identity(m);
            M4.rotateY(m, m, r.f() * TAU);
            M4.rotateX(m, m, r.f() * 0.6);
            m[12] = px + (r.f() - 0.5) * 1.2; m[13] = 0.05 + r.f() * 0.08;
            m[14] = pz + (r.f() - 0.5) * 1.2;
            ctx.mesh('clutter_rubble', MAT.rock, box(0.2 + r.f() * 0.4, 0.1, 0.18 + r.f() * 0.3), m);
          }
          break;
        case 'locker':
          M4.rotateY(m, m, ry); m[12] = px; m[13] = 0.95; m[14] = pz;
          ctx.mesh('clutter_metal', MAT.metalWall, box(0.7, 1.9, 0.45), m);
          ctx.box(px - 0.4, 0, pz - 0.3, px + 0.4, 1.9, pz + 0.3, 'prop');
          ctx.prop('locker', px, 0, pz, { rot: ry, loot: 'ammo' });
          break;
        case 'table':
          M4.identity(m); M4.rotateY(m, m, ry);
          m[12] = px; m[13] = 0.74; m[14] = pz;
          ctx.mesh('clutter_metal', MAT.metalWall, box(1.5, 0.06, 0.75), m);
          for (var L = 0; L < 4; L++) {
            var lx = px + ((L & 1) ? 0.65 : -0.65), lz = pz + ((L & 2) ? 0.3 : -0.3);
            M4.identity(m); m[12] = lx; m[13] = 0.37; m[14] = lz;
            ctx.mesh('clutter_metal', MAT.metalWall, box(0.06, 0.74, 0.06), m);
          }
          ctx.box(px - 0.75, 0, pz - 0.4, px + 0.75, 0.8, pz + 0.4, 'prop');
          break;
        case 'growth':
          var gs = 0.35 + r.f() * 0.5;
          M4.identity(m); M4.rotateY(m, m, ry);
          m[12] = px; m[13] = gs * 0.5; m[14] = pz;
          var gm = sphere(gs, 9, 6);
          noiseDisplace(gm, gs * 0.35, 2.6);
          ctx.mesh('clutter_growth', MAT.growth, gm, m);
          ctx.prop('growth', px, 0, pz, { hp: 18, tag: 'burnable' });
          break;
        case 'sandbag':
          for (var sbi = 0; sbi < 4; sbi++) {
            M4.identity(m);
            M4.rotateY(m, m, ry + (r.f() - 0.5) * 0.3);
            m[12] = px + Math.cos(ry) * (sbi * 0.55 - 0.8);
            m[13] = 0.18 + (sbi % 2) * 0.32;
            m[14] = pz + Math.sin(ry) * (sbi * 0.55 - 0.8);
            ctx.mesh('clutter_fabric', MAT.fabric, box(0.6, 0.32, 0.36), m);
          }
          ctx.box(px - 1.1, 0, pz - 0.5, px + 1.1, 0.68, pz + 0.5, 'prop');
          break;
      }
    }
  }

  /* --- containment tank (labs signature prop) --------------------------- */
  function tank(ctx, x, z, h) {
    var m = M4.create();
    m[12] = x; m[13] = h / 2 + 0.15; m[14] = z;
    ctx.glassMesh(MAT.glass, cylinder(0.62, 0.62, h, 16, 1, false), m);
    var fm = M4.create();
    fm[12] = x; fm[13] = h / 2 + 0.1; fm[14] = z;
    ctx.glassMesh(MAT.tankFluid, cylinder(0.55, 0.55, h - 0.35, 14, 1, true), fm);
    /* specimen suspended inside */
    var sm = M4.create();
    sm[12] = x; sm[13] = h * 0.55; sm[14] = z;
    var spec = sphere(0.26, 9, 7);
    noiseDisplace(spec, 0.09, 4.0);
    ctx.mesh('tank_flesh', MAT.flesh, spec, sm);
    /* base and cap */
    var bm = M4.create();
    bm[12] = x; bm[13] = 0.08; bm[14] = z;
    ctx.mesh('tank_metal', MAT.metalWall, cylinder(0.72, 0.68, 0.3, 16, 1, true), bm);
    ctx.box(x - 0.7, 0, z - 0.7, x + 0.7, h + 0.3, z + 0.7, 'prop');
    bm[13] = h + 0.25;
    ctx.mesh('tank_metal', MAT.metalWall, cylinder(0.68, 0.72, 0.3, 16, 1, true), bm);
    ctx.light(x, h * 0.6, z, [0.16, 1.0, 0.42], 6.5, 1.5, { flicker: 0.12, tag: 'tank' });
  }

  /* --- pipe runs along a ceiling ---------------------------------------- */
  function pipes(ctx, x0, z0, x1, z1, y, count) {
    var r = ctx.rng;
    for (var i = 0; i < count; i++) {
      var off = (i - count / 2) * 0.26;
      var horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      var pts = [];
      var steps = 6;
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        pts.push([x0 + (x1 - x0) * t + (horiz ? 0 : off),
                  y + Math.sin(t * 3 + i) * 0.04,
                  z0 + (z1 - z0) * t + (horiz ? off : 0)]);
      }
      ctx.mesh('pipes', i % 3 === 0 ? MAT.rust : MAT.metalWall,
               tube(pts, 0.05 + r.f() * 0.05, 7));
    }
  }

  /* ====================================================================== */
  /*  SECTION DEFINITIONS                                                   */
  /* ====================================================================== */
  var THEMES = {
    cells: { wall: MAT.concreteWall, floor: MAT.concreteFloor, indoor: true,
             ambient: [0.03, 0.035, 0.045] },
    labs: { wall: MAT.tileWall, floor: MAT.tileFloor, indoor: true },
    power: { wall: MAT.metalWall, floor: MAT.metalFloor, indoor: true },
    compound: { wall: MAT.concreteWall, floor: MAT.dirt, indoor: false },
    village: { wall: MAT.wood, floor: MAT.dirt, indoor: false },
    cliffs: { wall: MAT.rock, floor: MAT.rock, indoor: false },
    tunnels: { wall: MAT.rock, floor: MAT.dirt, indoor: true },
    docks: { wall: MAT.metalWall, floor: MAT.concreteFloor, indoor: false }
  };

  var RED = [1.0, 0.16, 0.10], SODIUM = [1.0, 0.62, 0.28],
      COLD = [0.62, 0.72, 0.92], GREEN = [0.22, 1.0, 0.48];

  /* ---------------------------------------------------------------------- */
  function buildCells(ctx) {
    /* Holding block: a spine corridor with cells either side, a processing
       room, a collapsed stair forcing a detour, and the service lift. */
    var h = 3.0;
    corridor(ctx, -18, 0, 16, 0, 3.4, h, { key: 'cells_spine' });
    pipes(ctx, -18, 0.9, 16, 0.9, h - 0.35, 4);

    var i, cz;
    for (i = 0; i < 5; i++) {
      var cx = -15 + i * 6;
      for (var side = 0; side < 2; side++) {
        cz = side ? 4.7 : -4.7;
        room(ctx, cx, cz, 4.4, 4.0, h, {
          key: 'cells_c' + i + side,
          doors: [{ side: side ? 'n' : 's', at: 0, w: 1.3, h: 2.2 }]
        });
        ctx.light(cx, h - 0.4, cz, SODIUM, 5.5, 0.55, { flicker: 0.35 });
        if (ctx.rng.f() < 0.55) {
          clutter(ctx, cx, cz, 3.4, 3.0, 0.16, ['debris', 'growth']);
        }
        if (i === 3 && side === 1) { ctx.prop('document', cx, 0, cz, { tag: 'doc_cells_1' }); }
        if (i === 1 && side === 0) { ctx.prop('ammo', cx, 0, cz, { tag: 'pistol_ammo' }); }
      }
    }

    /* processing room at the west end */
    room(ctx, -23, 0, 8, 9, 3.6, {
      key: 'cells_proc', doors: [{ side: 'e', at: 0, w: 1.8, h: 2.4 }]
    });
    clutter(ctx, -23, 0, 6, 7, 0.1, ['table', 'locker', 'debris']);
    ctx.light(-23, 3.1, 0, RED, 9, 1.5, { flicker: 0.5, tag: 'emergency' });
    ctx.prop('document', -25, 0, -3, { tag: 'doc_cells_2' });

    /* collapsed stairwell (blocked) + the working service lift */
    room(ctx, 20, -6, 7, 7, 4.2, { key: 'cells_stair', doors: [{ side: 's', at: 0, w: 1.8 }] });
    ctx.solid('cells_rubble', MAT.rock, 20, 1.2, -7.5, 6, 2.4, 3.5, { tag: 'wall' });
    ctx.light(20, 3.6, -6, RED, 8, 1.1, { flicker: 0.7, tag: 'emergency' });

    room(ctx, 20, 6, 6, 6, 3.4, { key: 'cells_lift', doors: [{ side: 'n', at: 0, w: 1.8 }] });
    corridor(ctx, 16, 0, 20, 0, 3.0, h, { key: 'cells_east' });
    corridor(ctx, 20, 0, 20, 6, 3.0, h, { key: 'cells_liftlink' });
    corridor(ctx, 20, 0, 20, -6, 3.0, h, { key: 'cells_stairlink' });
    ctx.prop('lift', 20, 0, 8, { tag: 'to_labs', interactive: true });
    ctx.light(20, 3.0, 6, GREEN, 7, 1.2, { tag: 'tank' });

    /* story beats */
    ctx.trigger('cells_start', -19, -2, -16, 2, 'game_start');
    ctx.trigger('cells_firstEnemy', -6, -2, -2, 2, 'first_enemy');
    ctx.trigger('cells_toLift', 17, 3, 23, 9, 'objective:p_reach_lift');
    ctx.spawn('ganado', -8, 0, 0, { wave: 0, trigger: 'cells_firstEnemy' });
    ctx.spawn('ganado', 2, 0, 4.7, { wave: 0, trigger: 'cells_firstEnemy' });
    ctx.spawn('ganado', 8, 0, -4.7, { wave: 1, trigger: 'cells_firstEnemy' });
    ctx.prop('save', -23, 0, 3, { tag: 'typewriter' });
  }

  /* ---------------------------------------------------------------------- */
  function buildLabs(ctx) {
    var h = 3.6;
    /* two-storey atrium */
    room(ctx, 0, 0, 22, 18, 8.0, {
      key: 'labs_atrium',
      doors: [{ side: 'w', at: 0, w: 2.4, h: 2.6 }, { side: 'e', at: 0, w: 2.4, h: 2.6 },
              { side: 'n', at: -6, w: 2.0 }, { side: 's', at: 6, w: 2.0 }]
    });
    /* mezzanine walkway around the atrium, reachable by stairs */
    var m = M4.create();
    var wy = 3.9;
    ctx.solid('labs_walk', MAT.metalFloor, 0, wy, -7.6, 20, 0.22, 2.6, { tag: 'floor' });
    ctx.walkable(-10, -8.9, 10, -6.3, wy + 0.11);
    ctx.solid('labs_walk', MAT.metalFloor, -9.6, wy, 0, 2.6, 0.22, 14, { tag: 'floor' });
    ctx.walkable(-10.9, -7, -8.3, 7, wy + 0.11);
    ctx.mesh('labs_rail', MAT.metalWall, railing(
      [[-10, wy + 0.11, -6.3], [10, wy + 0.11, -6.3]], 1.05));
    ctx.mesh('labs_rail', MAT.metalWall, railing(
      [[-8.3, wy + 0.11, -6.3], [-8.3, wy + 0.11, 7]], 1.05));
    M4.identity(m); M4.rotateY(m, m, Math.PI);
    m[12] = 8.5; m[13] = 0; m[14] = -6.0;
    ctx.mesh('labs_stair', MAT.metalFloor, stairs(18, 1.6, wy / 18, 0.30), m);
    ctx.walkable(7.7, -6.4, 9.3, -0.4, wy * 0.5);
    for (var ai = 0; ai < 4; ai++) {
      ctx.light(-7 + ai * 4.7, 7.2, ai % 2 ? -5 : 5, COLD, 12, 1.3, { flicker: ai === 2 ? 0.6 : 0.05 });
    }
    clutter(ctx, 0, 2, 18, 12, 0.05, ['crate', 'debris', 'growth']);

    /* containment wing: the glowing tanks */
    room(ctx, -20, 0, 14, 12, h, {
      key: 'labs_contain', doors: [{ side: 'e', at: 0, w: 2.4, h: 2.6 }]
    });
    for (var t = 0; t < 6; t++) {
      tank(ctx, -24 + (t % 3) * 4.4, -3 + Math.floor(t / 3) * 6, 2.6);
    }
    ctx.light(-20, h - 0.3, 0, GREEN, 10, 0.8, { tag: 'tank' });
    ctx.prop('document', -25, 0, 4, { tag: 'doc_labs_1' });
    ctx.prop('save', -17, 0, 4.5, { tag: 'typewriter' });

    /* autopsy theatre */
    room(ctx, 0, -16, 12, 10, h, {
      key: 'labs_autopsy', doors: [{ side: 's', at: -6, w: 2.0 }]
    });
    clutter(ctx, 0, -16, 10, 8, 0.09, ['table', 'locker']);
    ctx.light(0, h - 0.3, -16, COLD, 9, 1.6, { flicker: 0.25 });
    ctx.prop('document', 4, 0, -19, { tag: 'doc_labs_2' });
    ctx.prop('herb', -4, 0, -18, { tag: 'herb_green' });

    /* server room, gas-leak corridor, and the east exit */
    room(ctx, 20, 0, 12, 12, h, {
      key: 'labs_server', doors: [{ side: 'w', at: 0, w: 2.4, h: 2.6 }]
    });
    for (var sIdx = 0; sIdx < 8; sIdx++) {
      var sx = 16 + (sIdx % 4) * 2.6, sz = -3 + Math.floor(sIdx / 4) * 6;
      M4.identity(m); m[12] = sx; m[13] = 1.05; m[14] = sz;
      ctx.mesh('labs_rack', MAT.metalWall, box(0.7, 2.1, 1.1), m);
      ctx.box(sx - 0.4, 0, sz - 0.6, sx + 0.4, 2.1, sz + 0.6, 'prop');
      M4.identity(m); m[12] = sx + 0.37; m[13] = 1.3; m[14] = sz;
      ctx.mesh('labs_screen', MAT.screen, box(0.02, 0.5, 0.8), m);
    }
    ctx.light(20, h - 0.3, 0, [0.2, 0.9, 0.7], 9, 1.0, { flicker: 0.15 });
    ctx.prop('terminal', 23, 0, 4, { tag: 'merchant' });

    corridor(ctx, 11, 6, 20, 6, 3.2, h, { key: 'labs_gascor' });
    ctx.prop('gasleak', 15, 0, 6, { tag: 'hazard_gas', interactive: false });
    ctx.light(15, h - 0.4, 6, RED, 6, 0.9, { flicker: 0.8, tag: 'emergency' });
    pipes(ctx, 11, 6, 20, 6, h - 0.3, 5);

    corridor(ctx, 0, 9, 0, 20, 3.2, h, { key: 'labs_northlink' });
    ctx.prop('door', 0, 0, 20, { tag: 'to_power', locked: true, interactive: true });

    ctx.trigger('labs_enter', -3, 7, 3, 10, 'labs_enter');
    ctx.trigger('labs_ambush', -4, -3, 4, 3, 'labs_ambush');
    ctx.spawn('ganado', -6, 0, 6, { wave: 0, trigger: 'labs_ambush' });
    ctx.spawn('ganado', 6, 0, 6, { wave: 0, trigger: 'labs_ambush' });
    ctx.spawn('crawler', 0, 4.0, 0, { wave: 0, trigger: 'labs_ambush', from: 'ceiling' });
    ctx.spawn('spitter', -20, 0, 0, { wave: 1, trigger: 'labs_ambush' });
    ctx.spawn('ganado', 20, 0, 0, { wave: 1, trigger: 'labs_ambush' });
  }

  /* ---------------------------------------------------------------------- */
  function buildPower(ctx) {
    var h = 7.5;
    /* turbine hall */
    room(ctx, 0, 0, 26, 20, h, {
      key: 'pw_hall',
      doors: [{ side: 's', at: 0, w: 2.6, h: 2.8 }, { side: 'n', at: 8, w: 2.4 },
              { side: 'e', at: 0, w: 2.4 }]
    });
    var m = M4.create(), i;
    for (i = 0; i < 3; i++) {
      var tx = -8 + i * 8;
      M4.identity(m); M4.rotateZ(m, m, Math.PI / 2);
      m[12] = tx; m[13] = 1.5; m[14] = 0;
      ctx.mesh('pw_turbine', MAT.metalWall, cylinder(1.5, 1.5, 6.5, 16, 1, true), m);
      ctx.box(tx - 1.6, 0, -3.4, tx + 1.6, 3.0, 3.4, 'prop');
      ctx.light(tx, 2.4, 0, i === 1 ? RED : SODIUM, 9, 1.1, { flicker: 0.3 });
    }
    /* catwalk above, reached from the east */
    var cy = 4.6;
    ctx.solid('pw_catwalk', MAT.metalFloor, 0, cy, -8.0, 24, 0.2, 2.2, { tag: 'floor' });
    ctx.walkable(-12, -9.1, 12, -6.9, cy + 0.1);
    ctx.mesh('pw_rail', MAT.metalWall, railing([[-12, cy + 0.1, -6.9], [12, cy + 0.1, -6.9]], 1.05));
    ctx.mesh('pw_ladder', MAT.rust, (function () {
      var lm = M4.create(); lm[12] = 11.5; lm[14] = -7.9;
      return transform(ladder(cy, 9), lm);
    })());
    ctx.prop('ladder', 11.5, 0, -7.9, { tag: 'to_catwalk' });
    pipes(ctx, -13, 8, 13, 8, h - 0.6, 6);

    /* breaker room with the lever puzzle */
    room(ctx, 0, -16, 10, 9, 4.0, {
      key: 'pw_breaker', doors: [{ side: 's', at: 8, w: 2.4 }]
    });
    for (i = 0; i < 3; i++) {
      var lx = -3 + i * 3;
      M4.identity(m); m[12] = lx; m[13] = 1.2; m[14] = -19.6;
      ctx.mesh('pw_panel', MAT.metalWall, box(1.6, 2.2, 0.5), m);
      ctx.prop('lever', lx, 0, -19.2, { tag: 'breaker_' + i, interactive: true });
      ctx.light(lx, 2.4, -19.0, RED, 4, 0.8, { flicker: 0.4, tag: 'emergency' });
    }
    ctx.prop('document', 4, 0, -18, { tag: 'doc_power_1' });

    /* caged control booth: where Elena is left protected */
    room(ctx, 12, 8, 6, 6, 3.2, {
      key: 'pw_booth', doors: [{ side: 'w', at: 0, w: 1.6, h: 2.2 }]
    });
    ctx.prop('cage_door', 9, 0, 8, { tag: 'elena_safe', interactive: true });
    ctx.light(12, 2.9, 8, GREEN, 7, 1.3, { tag: 'tank' });
    ctx.prop('save', 13, 0, 9, { tag: 'typewriter' });

    /* coolant pool: electrified water hazard */
    ctx.solid('pw_pool', MAT.concreteWall, -12, -0.35, 12, 12, 0.5, 8, { tag: 'floor' });
    var wm = M4.create(); wm[12] = -12; wm[13] = 0.02; wm[14] = 12;
    ctx.glassMesh(MAT.water, plane(11.4, 7.4, 8, 6), wm);
    ctx.box(-18, -0.4, 8, -6, 0.05, 16, 'water');
    ctx.prop('water_hazard', -12, 0, 12, { tag: 'electrified', interactive: false });
    ctx.light(-12, 1.6, 12, [0.4, 0.8, 1.0], 10, 1.1, { flicker: 0.6 });

    corridor(ctx, 0, 10, 0, 20, 3.2, 4.0, { key: 'pw_south' });
    corridor(ctx, 0, -10, 0, -12, 3.2, 4.0, { key: 'pw_north' });
    corridor(ctx, 13, 0, 13, 8, 3.2, 3.6, { key: 'pw_boothlink' });

    ctx.trigger('pw_enter', -3, 18, 3, 21, 'power_enter');
    ctx.trigger('pw_restored', -4, -20, 4, -16, 'power_restored');
    for (i = 0; i < 6; i++) {
      ctx.spawn(i % 3 === 0 ? 'brute' : 'ganado',
                -10 + i * 4, 0, i % 2 ? 7 : -7, { wave: i < 3 ? 0 : 1, trigger: 'pw_restored' });
    }
    ctx.spawn('shielder', 0, 0, 6, { wave: 1, trigger: 'pw_restored' });
  }

  /* ---------------------------------------------------------------------- */
  function buildCompound(ctx) {
    var i;
    /* open ground plus a ring of structures - the first big siege arena */
    ctx.solid('cp_ground', MAT.dirt, 0, -0.2, 0, 76, 0.4, 76, { tag: 'floor', uvScale: 0.5 });
    ctx.walkable(-36, -36, 36, 36, 0);

    /* perimeter fence */
    for (i = 0; i < 4; i++) {
      var ang = i * Math.PI / 2;
      var fx = Math.round(Math.cos(ang)) * 37, fz = Math.round(Math.sin(ang)) * 37;
      ctx.solid('cp_fence', MAT.rust, fx, 1.6, fz,
                Math.abs(Math.cos(ang)) > 0.5 ? 0.3 : 76, 3.2,
                Math.abs(Math.cos(ang)) > 0.5 ? 76 : 0.3, {});
    }

    /* hangar */
    room(ctx, -20, -18, 20, 16, 7.5, {
      key: 'cp_hangar', doors: [{ side: 's', at: 0, w: 6.0, h: 5.0 }], floor: true
    });
    clutter(ctx, -20, -18, 16, 12, 0.05, ['crate', 'barrel', 'debris']);
    ctx.light(-20, 6.8, -18, SODIUM, 16, 1.4, { flicker: 0.2 });
    ctx.prop('save', -26, 0, -22, { tag: 'typewriter' });
    ctx.prop('terminal', -14, 0, -22, { tag: 'merchant' });

    /* watchtowers */
    for (i = 0; i < 4; i++) {
      var tAng = Math.PI / 4 + i * Math.PI / 2;
      var tx = Math.cos(tAng) * 26, tz = Math.sin(tAng) * 26;
      ctx.solid('cp_tower', MAT.wood, tx, 3.0, tz, 3.0, 6.0, 3.0, {});
      ctx.solid('cp_tower', MAT.wood, tx, 6.2, tz, 4.2, 0.3, 4.2, { tag: 'floor' });
      ctx.walkable(tx - 1.8, tz - 1.8, tx + 1.8, tz + 1.8, 6.35);
      ctx.light(tx, 7.2, tz, SODIUM, 20, 2.2, { flicker: 0.08 });
      ctx.spawn('soldier', tx, 6.4, tz, { wave: 1, trigger: 'cp_siege' });
    }

    /* motor pool and sandbag emplacements around the courtyard */
    clutter(ctx, 14, -10, 16, 14, 0.05, ['crate', 'barrel', 'sandbag']);
    clutter(ctx, 0, 14, 26, 14, 0.045, ['sandbag', 'debris', 'crate']);
    clutter(ctx, 18, 16, 14, 14, 0.05, ['barrel', 'crate']);

    /* burning fuel depot: light + hazard */
    ctx.solid('cp_depot', MAT.rust, 26, 1.6, -26, 8, 3.2, 8, {});
    ctx.light(26, 3.4, -26, [1.6, 0.55, 0.15], 22, 3.0, { flicker: 0.55 });
    ctx.prop('fire', 26, 0, -26, { tag: 'hazard_fire', interactive: false });

    ctx.trigger('cp_enter', -4, 32, 4, 36, 'act2_start');
    ctx.trigger('cp_siege', -8, -6, 8, 8, 'cp_siege');
    for (i = 0; i < 14; i++) {
      var a2 = i / 14 * TAU;
      ctx.spawn(i % 5 === 0 ? 'brute' : (i % 4 === 0 ? 'shielder' : 'ganado'),
                Math.cos(a2) * 30, 0, Math.sin(a2) * 30,
                { wave: i < 6 ? 0 : (i < 10 ? 1 : 2), trigger: 'cp_siege' });
    }
    ctx.prop('door', 0, 0, 35, { tag: 'to_village', interactive: true });
  }

  /* ---------------------------------------------------------------------- */
  function buildVillage(ctx) {
    var r = ctx.rng, i;
    ctx.solid('vl_ground', MAT.dirt, 0, -0.2, 0, 64, 0.4, 64, { tag: 'floor', uvScale: 0.5 });
    ctx.walkable(-30, -30, 30, 30, 0);

    /* central plaza ringed with enterable houses - the RE4 siege template */
    var houses = [
      [-16, -12, 8, 7], [-4, -18, 7, 6], [10, -14, 9, 7],
      [18, -2, 7, 8], [14, 12, 8, 7], [0, 18, 9, 6],
      [-14, 14, 8, 7], [-20, 2, 7, 8]
    ];
    for (i = 0; i < houses.length; i++) {
      var hx = houses[i][0], hz = houses[i][1], hw = houses[i][2], hd = houses[i][3];
      /* face the door toward the plaza centre */
      var dirX = Math.abs(hx) > Math.abs(hz);
      var side = dirX ? (hx > 0 ? 'w' : 'e') : (hz > 0 ? 'n' : 's');
      room(ctx, hx, hz, hw, hd, 3.2, {
        key: 'vl_h' + i, wallMat: MAT.wood, floorMat: MAT.wood,
        doors: [{ side: side, at: 0, w: 1.5, h: 2.2 },
                { side: dirX ? (hx > 0 ? 'e' : 'w') : (hz > 0 ? 's' : 'n'), at: 1.2, w: 1.2, h: 2.0 }]
      });
      clutter(ctx, hx, hz, hw - 2, hd - 2, 0.09, ['crate', 'table', 'debris', 'growth']);
      ctx.light(hx, 2.9, hz, [1.4, 0.62, 0.24], 7, 1.1, { flicker: 0.45 });
      /* pitched roof */
      var rm = M4.create();
      M4.rotateZ(rm, rm, Math.PI * 0.25);
      rm[12] = hx; rm[13] = 3.9; rm[14] = hz;
      ctx.mesh('vl_roof', MAT.wood, box(hw * 0.72, 0.25, hd + 0.6), rm);
      if (i % 3 === 0) { ctx.prop('document', hx + 1, 0, hz + 1, { tag: 'doc_village_' + i }); }
      if (i % 2 === 0) { ctx.prop('ammo', hx - 1, 0, hz - 1, { tag: 'shotgun_ammo' }); }
      ctx.spawn('ganado', hx, 0, hz, { wave: 0, trigger: 'vl_siege', from: 'door' });
    }

    /* bell tower - the landmark, visible from anywhere in the plaza */
    ctx.solid('vl_tower', MAT.rock, -2, 5.0, -2, 5, 10, 5, {});
    ctx.solid('vl_tower', MAT.wood, -2, 10.4, -2, 6, 0.4, 6, { tag: 'floor' });
    ctx.light(-2, 11.2, -2, [1.5, 0.7, 0.3], 26, 2.6, { flicker: 0.25 });
    var bm = M4.create(); bm[12] = -2; bm[13] = 11.6; bm[14] = -2;
    ctx.mesh('vl_bell', MAT.rust, lathe([[0.05, 1.0], [0.6, 0.4], [0.75, 0.0], [0.0, 0.0]], 12), bm);
    ctx.prop('bell', -2, 10.6, -2, { tag: 'siege_end', interactive: true });

    /* chapel with the cult shrine */
    room(ctx, 24, 20, 10, 12, 4.5, {
      key: 'vl_chapel', wallMat: MAT.rock, doors: [{ side: 'w', at: 0, w: 2.0, h: 2.6 }]
    });
    var shm = M4.create(); shm[12] = 24; shm[13] = 0.9; shm[14] = 24;
    var shrine = sphere(0.9, 12, 9);
    noiseDisplace(shrine, 0.3, 2.2);
    ctx.mesh('vl_shrine', MAT.growth, shrine, shm);
    ctx.light(24, 2.0, 24, GREEN, 9, 2.2, { flicker: 0.18, tag: 'tank' });
    ctx.prop('document', 22, 0, 17, { tag: 'doc_village_shrine' });
    ctx.prop('save', 26, 0, 16, { tag: 'typewriter' });

    /* well, fishing racks, overturned boats */
    var wm2 = M4.create(); wm2[12] = 6; wm2[13] = 0.5; wm2[14] = 4;
    ctx.mesh('vl_well', MAT.rock, cylinder(1.1, 1.1, 1.0, 12, 1, false), wm2);
    ctx.box(5, 0, 3, 7, 1.0, 5, 'prop');
    for (i = 0; i < 5; i++) {
      var bx = -24 + i * 3, bz = 24 + (r.f() - 0.5) * 3;
      var bmm = M4.create();
      M4.rotateZ(bmm, bmm, Math.PI * 0.55 + r.f() * 0.2);
      M4.rotateY(bmm, bmm, r.f() * TAU);
      bmm[12] = bx; bmm[13] = 0.5; bmm[14] = bz;
      ctx.mesh('vl_boat', MAT.wood, box(4.0, 0.3, 1.4), bmm);
      ctx.box(bx - 1.8, 0, bz - 1.0, bx + 1.8, 1.0, bz + 1.0, 'prop');
    }
    clutter(ctx, 0, 0, 20, 20, 0.02, ['barrel', 'crate', 'debris']);

    ctx.trigger('vl_enter', -4, -30, 4, -26, 'village_enter');
    ctx.trigger('vl_siege', -6, -6, 6, 6, 'vl_siege');
    for (i = 0; i < 10; i++) {
      var a3 = i / 10 * TAU;
      ctx.spawn(i % 4 === 0 ? 'brute' : 'ganado',
                Math.cos(a3) * 26, 0, Math.sin(a3) * 26,
                { wave: i < 5 ? 1 : 2, trigger: 'vl_siege' });
    }
    ctx.prop('door', 0, 0, 29, { tag: 'to_cliffs', interactive: true });
  }

  /* ---------------------------------------------------------------------- */
  function buildCliffs(ctx) {
    /* switchback path carved into a noisy cliff face */
    var groundFn = function (x, z) {
      return Noise.fbm2(x * 0.035, z * 0.035, 4, 2.0, 0.5) * 6.0 - Math.abs(x) * 0.06;
    };
    var g = terrain(90, 70, 2.2, groundFn);
    ctx.mesh('cf_rock', MAT.rock, g);
    /* the walkable path itself is a flat ribbon laid over the terrain */
    var segs = [
      [-34, -28, -12, -28], [-12, -28, -8, -10], [-8, -10, 10, -6],
      [10, -6, 14, 8], [14, 8, 30, 12]
    ];
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s];
      var cx = (a[0] + a[2]) / 2, cz = (a[1] + a[3]) / 2;
      var dx = a[2] - a[0], dz = a[3] - a[1];
      var len = Math.sqrt(dx * dx + dz * dz);
      var ang = Math.atan2(dx, dz);
      ctx.solid('cf_path', MAT.dirt, cx, 0.1, cz, 5.0, 0.3, len + 4, { ry: ang, tag: 'floor' });
      ctx.walkable(Math.min(a[0], a[2]) - 2.2, Math.min(a[1], a[3]) - 2.2,
                   Math.max(a[0], a[2]) + 2.2, Math.max(a[1], a[3]) + 2.2, 0.25);
      ctx.light(cx, 3.0, cz, SODIUM, 12, 0.7, { flicker: 0.15 });
    }
    /* the rope bridge that collapses */
    ctx.solid('cf_bridge', MAT.wood, 20, 0.15, 10, 12, 0.25, 2.4, { tag: 'floor' });
    ctx.walkable(14, 8.6, 26, 11.4, 0.3);
    ctx.mesh('cf_rail', MAT.rust, railing(
      [[14, 0.3, 8.9], [26, 0.3, 8.9]], 1.0));
    ctx.mesh('cf_rail', MAT.rust, railing(
      [[14, 0.3, 11.1], [26, 0.3, 11.1]], 1.0));
    ctx.prop('bridge', 20, 0, 10, { tag: 'collapse', interactive: false });
    ctx.trigger('cf_bridge', 16, 8, 24, 12, 'bridge_collapse');

    /* sea stacks for silhouette */
    for (var i = 0; i < 7; i++) {
      var sx = -40 + i * 13, sz = 26 + Math.sin(i) * 6;
      var sm = M4.create(); sm[12] = sx; sm[13] = 3.0; sm[14] = sz;
      var stack = cylinder(2.2 + i * 0.2, 1.0, 9 + i, 8, 3, true);
      noiseDisplace(stack, 0.7, 0.35);
      ctx.mesh('cf_rock', MAT.rock, stack, sm);
    }
    ctx.trigger('cf_enter', -36, -30, -30, -26, 'act3_start');
    ctx.prop('save', -30, 0, -26, { tag: 'typewriter' });
    for (var e = 0; e < 8; e++) {
      ctx.spawn(e % 3 === 0 ? 'spitter' : 'ganado',
                -20 + e * 6, 0, -20 + e * 3, { wave: e < 4 ? 0 : 1, trigger: 'cf_bridge' });
    }
    ctx.prop('door', 30, 0, 13, { tag: 'to_tunnels', interactive: true });
  }

  /* ---------------------------------------------------------------------- */
  function buildTunnels(ctx) {
    var h = 3.4, i;
    corridor(ctx, -26, 0, 26, 0, 4.0, h, { key: 'tn_main', wallMat: MAT.rock, floorMat: MAT.dirt });
    /* ossuary alcoves */
    for (i = 0; i < 8; i++) {
      var ax = -22 + i * 6, az = (i % 2) ? 5.5 : -5.5;
      room(ctx, ax, az, 4.5, 5, h, {
        key: 'tn_a' + i, wallMat: MAT.rock, floorMat: MAT.dirt,
        doors: [{ side: (i % 2) ? 'n' : 's', at: 0, w: 1.6, h: 2.3 }]
      });
      ctx.light(ax, h - 0.5, az, [1.3, 0.5, 0.2], 6, 0.8, { flicker: 0.55 });
      if (i % 2 === 0) {
        clutter(ctx, ax, az, 3.5, 4, 0.22, ['growth', 'debris']);
      }
      if (i === 5) { ctx.prop('document', ax, 0, az, { tag: 'doc_tunnels_1' }); }
    }
    /* parasite growth choking the middle stretch */
    for (i = 0; i < 14; i++) {
      var gx = -18 + i * 2.7, gz = (ctx.rng.f() - 0.5) * 3;
      var gm = M4.create();
      gm[12] = gx; gm[13] = 0.3 + ctx.rng.f() * 1.6; gm[14] = gz;
      var blob = sphere(0.4 + ctx.rng.f() * 0.4, 8, 6);
      noiseDisplace(blob, 0.2, 3.2);
      ctx.mesh('tn_growth', MAT.growth, blob, gm);
      ctx.prop('growth', gx, 0, gz, { hp: 20, tag: 'burnable' });
    }
    /* flooded section */
    var wm = M4.create(); wm[12] = 12; wm[13] = 0.06; wm[14] = 0;
    ctx.glassMesh(MAT.water, plane(14, 3.6, 8, 4), wm);
    ctx.box(5, -0.4, -1.8, 19, 0.1, 1.8, 'water');

    ctx.trigger('tn_enter', -28, -2, -24, 2, 'tunnels_enter');
    ctx.trigger('tn_collapse', 6, -2, 12, 2, 'tunnels_collapse');
    for (i = 0; i < 9; i++) {
      ctx.spawn(i % 3 === 0 ? 'crawler' : 'ganado', -14 + i * 5, i % 3 === 0 ? 2.8 : 0,
                (i % 2) ? 2 : -2,
                { wave: i < 5 ? 0 : 1, trigger: 'tn_collapse', from: i % 3 === 0 ? 'ceiling' : 'ground' });
    }
    ctx.prop('save', 24, 0, 3, { tag: 'typewriter' });
    ctx.prop('door', 26, 0, 0, { tag: 'to_docks', interactive: true });
  }

  /* ---------------------------------------------------------------------- */
  function buildDocks(ctx) {
    var i;
    /* the final defense arena: a pier with container cover and a helipad */
    ctx.solid('dk_pier', MAT.concreteFloor, 0, -0.25, 0, 60, 0.5, 44, { tag: 'floor', uvScale: 0.5 });
    ctx.walkable(-29, -21, 29, 21, 0);

    /* shipping containers as deliberate cover and choke points */
    var conts = [
      [-18, -12, 0], [-18, -6, 0], [-10, -14, Math.PI / 2], [2, -13, 0],
      [12, -10, Math.PI / 2], [18, -2, 0], [14, 8, 0], [4, 12, Math.PI / 2],
      [-8, 10, 0], [-18, 6, Math.PI / 2], [-6, -2, 0], [8, 2, Math.PI / 2]
    ];
    for (i = 0; i < conts.length; i++) {
      var c = conts[i];
      ctx.solid('dk_cont', i % 3 === 0 ? MAT.rust : MAT.metalWall,
                c[0], 1.3, c[1], 6.0, 2.6, 2.4, { ry: c[2] });
      if (i % 4 === 0) {
        ctx.solid('dk_cont', MAT.rust, c[0], 3.9, c[1], 6.0, 2.6, 2.4, { ry: c[2] });
      }
    }
    /* gantry crane landmark */
    ctx.solid('dk_crane', MAT.rust, -24, 6.0, -18, 1.2, 12, 1.2, {});
    ctx.solid('dk_crane', MAT.rust, -24, 6.0, 18, 1.2, 12, 1.2, {});
    ctx.solid('dk_crane', MAT.rust, -24, 12.0, 0, 1.6, 1.2, 38, {});
    ctx.light(-24, 12.5, 0, SODIUM, 30, 2.4, { flicker: 0.1 });

    /* helipad */
    ctx.solid('dk_pad', MAT.concreteFloor, 22, 0.15, 0, 14, 0.3, 14, { tag: 'floor' });
    ctx.walkable(15.5, -6.5, 28.5, 6.5, 0.35);
    for (i = 0; i < 8; i++) {
      var pa = i / 8 * TAU;
      ctx.light(22 + Math.cos(pa) * 6.5, 0.5, Math.sin(pa) * 6.5, RED, 5, 1.6, { flicker: 0.0, tag: 'pad' });
    }
    ctx.prop('extraction', 22, 0, 0, { tag: 'extraction_point', interactive: true });

    /* boathouse */
    room(ctx, -22, -20, 10, 8, 4.0, {
      key: 'dk_boathouse', doors: [{ side: 'e', at: 0, w: 2.2, h: 2.6 }]
    });
    clutter(ctx, -22, -20, 8, 6, 0.07, ['crate', 'barrel']);
    ctx.prop('save', -24, 0, -20, { tag: 'typewriter' });
    ctx.prop('terminal', -20, 0, -22, { tag: 'merchant' });

    /* sea */
    var sm = M4.create(); sm[13] = -0.6;
    ctx.glassMesh(MAT.water, plane(200, 200, 20, 20), sm);

    ctx.trigger('dk_enter', -30, -2, -26, 2, 'docks_enter');
    ctx.trigger('dk_final', 14, -8, 30, 8, 'final_stand');
    for (i = 0; i < 18; i++) {
      var a4 = i / 18 * TAU;
      ctx.spawn(i % 6 === 0 ? 'brute' : (i % 5 === 0 ? 'shielder' : (i % 4 === 0 ? 'spitter' : 'ganado')),
                Math.cos(a4) * 26, 0, Math.sin(a4) * 19,
                { wave: i < 6 ? 0 : (i < 12 ? 1 : 2), trigger: 'dk_final' });
    }
    ctx.spawn('boss', -20, 0, 0, { wave: 3, trigger: 'dk_final' });
  }

  /* ====================================================================== */
  /*  NAVIGATION                                                            */
  /* ====================================================================== */
  var NAV_CELL = 0.6;

  function buildNav(ctx) {
    var mn = ctx.min, mx = ctx.max;
    var ox = mn[0] - 2, oz = mn[2] - 2;
    var w = Math.max(2, Math.ceil((mx[0] - mn[0] + 4) / NAV_CELL));
    var hgt = Math.max(2, Math.ceil((mx[2] - mn[2] + 4) / NAV_CELL));
    /* cap the grid so a huge outdoor section cannot blow up memory */
    if (w * hgt > 260000) {
      var scale = Math.sqrt(260000 / (w * hgt));
      w = Math.max(2, Math.floor(w * scale));
      hgt = Math.max(2, Math.floor(hgt * scale));
    }
    var cellW = (mx[0] - mn[0] + 4) / w, cellH = (mx[2] - mn[2] + 4) / hgt;
    var grid = new Uint8Array(w * hgt);
    var heights = new Float32Array(w * hgt);
    var i, gx, gz;

    /* mark walkable rects */
    for (i = 0; i < ctx.walk.length; i++) {
      var r = ctx.walk[i];
      var gx0 = Math.max(0, Math.floor((r.x0 - ox) / cellW));
      var gx1 = Math.min(w - 1, Math.ceil((r.x1 - ox) / cellW));
      var gz0 = Math.max(0, Math.floor((r.z0 - oz) / cellH));
      var gz1 = Math.min(hgt - 1, Math.ceil((r.z1 - oz) / cellH));
      for (gz = gz0; gz <= gz1; gz++) {
        for (gx = gx0; gx <= gx1; gx++) {
          var id = gz * w + gx;
          if (!grid[id] || r.y > heights[id]) { heights[id] = r.y; }
          grid[id] = 1;
        }
      }
    }
    /* punch out obstructions - anything that blocks at knee-to-chest height */
    for (i = 0; i < ctx.collision.length; i++) {
      var b = ctx.collision[i];
      if (b.tag === 'floor' || b.tag === 'water') { continue; }
      var bx0 = Math.max(0, Math.floor((b.min[0] - ox) / cellW));
      var bx1 = Math.min(w - 1, Math.floor((b.max[0] - ox) / cellW));
      var bz0 = Math.max(0, Math.floor((b.min[2] - oz) / cellH));
      var bz1 = Math.min(hgt - 1, Math.floor((b.max[2] - oz) / cellH));
      for (gz = bz0; gz <= bz1; gz++) {
        for (gx = bx0; gx <= bx1; gx++) {
          var idx2 = gz * w + gx;
          var floorY = heights[idx2];
          /* a box only blocks if it straddles the walking band above the floor */
          if (b.max[1] > floorY + 0.35 && b.min[1] < floorY + 1.7) { grid[idx2] = 0; }
        }
      }
    }
    return { grid: grid, w: w, h: hgt, cellW: cellW, cellH: cellH,
             origin: [ox, oz], heights: heights, cell: NAV_CELL };
  }

  /* A* with a binary heap, preallocated per nav grid, allocation-free after
     the first call. Elena's follow behaviour calls this many times a second. */
  function makePathfinder(nav) {
    var n = nav.w * nav.h;
    var gScore = new Float32Array(n);
    var fScore = new Float32Array(n);
    var cameFrom = new Int32Array(n);
    var stamp = new Int32Array(n);
    var inOpen = new Uint8Array(n);
    var heap = new Int32Array(n + 1);
    var heapLen = 0;
    var run = 0;
    var scratch = [];

    function push(node) {
      heap[++heapLen] = node;
      var i = heapLen;
      while (i > 1) {
        var p = i >> 1;
        if (fScore[heap[p]] <= fScore[heap[i]]) { break; }
        var t = heap[p]; heap[p] = heap[i]; heap[i] = t;
        i = p;
      }
    }
    function pop() {
      var top = heap[1];
      heap[1] = heap[heapLen--];
      var i = 1;
      for (;;) {
        var l = i << 1, r = l + 1, best = i;
        if (l <= heapLen && fScore[heap[l]] < fScore[heap[best]]) { best = l; }
        if (r <= heapLen && fScore[heap[r]] < fScore[heap[best]]) { best = r; }
        if (best === i) { break; }
        var t = heap[best]; heap[best] = heap[i]; heap[i] = t;
        i = best;
      }
      return top;
    }
    function cellOf(x, z) {
      var gx = Math.floor((x - nav.origin[0]) / nav.cellW);
      var gz = Math.floor((z - nav.origin[1]) / nav.cellH);
      if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) { return -1; }
      return gz * nav.w + gx;
    }
    /* nearest walkable cell, spiralling outward - keeps pathing robust when an
       entity is standing slightly inside geometry */
    function nearestWalkable(id) {
      if (id < 0) { return -1; }
      if (nav.grid[id]) { return id; }
      var gx = id % nav.w, gz = (id / nav.w) | 0;
      for (var rad = 1; rad <= 14; rad++) {
        for (var dz = -rad; dz <= rad; dz++) {
          for (var dx = -rad; dx <= rad; dx++) {
            if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) { continue; }
            var nx = gx + dx, nz = gz + dz;
            if (nx < 0 || nz < 0 || nx >= nav.w || nz >= nav.h) { continue; }
            var nid = nz * nav.w + nx;
            if (nav.grid[nid]) { return nid; }
          }
        }
      }
      return -1;
    }
    function worldOf(id, out) {
      var gx = id % nav.w, gz = (id / nav.w) | 0;
      out[0] = nav.origin[0] + (gx + 0.5) * nav.cellW;
      out[1] = nav.heights[id];
      out[2] = nav.origin[1] + (gz + 0.5) * nav.cellH;
      return out;
    }
    function lineClear(ax, az, bx, bz) {
      var dx = bx - ax, dz = bz - az;
      var steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / (nav.cellW * 0.7));
      if (steps < 1) { return true; }
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        var id = cellOf(ax + dx * t, az + dz * t);
        if (id < 0 || !nav.grid[id]) { return false; }
      }
      return true;
    }

    var DX = [1, -1, 0, 0, 1, 1, -1, -1];
    var DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    var COST = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

    return function findPath(from, to, out) {
      out = out || [];
      out.length = 0;
      var startId = nearestWalkable(cellOf(from[0], from[2]));
      var goalId = nearestWalkable(cellOf(to[0], to[2]));
      if (startId < 0 || goalId < 0) { return out; }
      if (startId === goalId) {
        out.push([to[0], nav.heights[goalId], to[2]]);
        return out;
      }
      run++;
      heapLen = 0;
      var gxG = goalId % nav.w, gzG = (goalId / nav.w) | 0;
      stamp[startId] = run; gScore[startId] = 0;
      fScore[startId] = 0; cameFrom[startId] = -1; inOpen[startId] = 1;
      push(startId);

      var iter = 0, MAXITER = 6000;
      var found = false;
      /* Track the closest node reached. If the goal is unreachable (a closed
         door, a different room) we still return a partial path toward it -
         a companion that stops dead is worse than one that walks as far as
         it can. */
      var bestNode = startId, bestH = 1e30;
      while (heapLen > 0 && iter++ < MAXITER) {
        var cur = pop();
        inOpen[cur] = 0;
        if (cur === goalId) { found = true; break; }
        var curH = Math.abs((cur % nav.w) - gxG) + Math.abs(((cur / nav.w) | 0) - gzG);
        if (curH < bestH) { bestH = curH; bestNode = cur; }
        var cx = cur % nav.w, cz = (cur / nav.w) | 0;
        for (var d = 0; d < 8; d++) {
          var nx = cx + DX[d], nz = cz + DZ[d];
          if (nx < 0 || nz < 0 || nx >= nav.w || nz >= nav.h) { continue; }
          var nid = nz * nav.w + nx;
          if (!nav.grid[nid]) { continue; }
          /* no cutting diagonal corners through solid geometry */
          if (d >= 4) {
            if (!nav.grid[cz * nav.w + nx] || !nav.grid[nz * nav.w + cx]) { continue; }
          }
          var ng = gScore[cur] + COST[d];
          if (stamp[nid] !== run || ng < gScore[nid]) {
            stamp[nid] = run;
            gScore[nid] = ng;
            var hx = Math.abs(nx - gxG), hz = Math.abs(nz - gzG);
            fScore[nid] = ng + (hx + hz) + (1.4142 - 2) * Math.min(hx, hz);
            cameFrom[nid] = cur;
            if (!inOpen[nid]) { inOpen[nid] = 1; push(nid); }
          }
        }
      }
      var endNode = found ? goalId : bestNode;
      if (endNode === startId) { return out; }

      /* reconstruct, then string-pull with line-of-sight smoothing */
      scratch.length = 0;
      var node = endNode;
      while (node !== -1 && scratch.length < 4096) {
        scratch.push(node);
        node = cameFrom[node];
      }
      scratch.reverse();
      var p0 = [0, 0, 0], p1 = [0, 0, 0];
      var anchor = 0;
      out.push(worldOf(scratch[0], [0, 0, 0]));
      for (var i = 1; i < scratch.length; i++) {
        worldOf(scratch[anchor], p0);
        worldOf(scratch[i], p1);
        if (!lineClear(p0[0], p0[2], p1[0], p1[2])) {
          out.push(worldOf(scratch[i - 1], [0, 0, 0]));
          anchor = i - 1;
        }
      }
      if (found) { out.push([to[0], nav.heights[goalId], to[2]]); }
      else { out.push(worldOf(endNode, [0, 0, 0])); }
      return out;
    };
  }

  /* ====================================================================== */
  /*  BUILD                                                                 */
  /* ====================================================================== */
  var SECTIONS = [
    { id: 'cells', name: 'Holding Block C', act: 'prologue', fn: buildCells },
    { id: 'labs', name: 'Research Wing', act: 'act1', fn: buildLabs },
    { id: 'power', name: 'Power Station', act: 'act1', fn: buildPower },
    { id: 'compound', name: 'Surface Compound', act: 'act2', fn: buildCompound },
    { id: 'village', name: 'Coastal Village', act: 'act2', fn: buildVillage },
    { id: 'cliffs', name: 'Perimeter Cliffs', act: 'act3', fn: buildCliffs },
    { id: 'tunnels', name: 'Catacombs', act: 'act3', fn: buildTunnels },
    { id: 'docks', name: 'Extraction Docks', act: 'act3', fn: buildDocks }
  ];

  var TRANSITIONS = [
    { from: 'cells', to: 'labs', door: 'to_labs', pos: [20, 0, 8] },
    { from: 'labs', to: 'power', door: 'to_power', pos: [0, 0, 20] },
    { from: 'power', to: 'compound', door: 'to_compound', pos: [0, 0, 20] },
    { from: 'compound', to: 'village', door: 'to_village', pos: [0, 0, 35] },
    { from: 'village', to: 'cliffs', door: 'to_cliffs', pos: [0, 0, 29] },
    { from: 'cliffs', to: 'tunnels', door: 'to_tunnels', pos: [30, 0, 13] },
    { from: 'tunnels', to: 'docks', door: 'to_docks', pos: [26, 0, 0] }
  ];

  var cached = null;

  function build(seed) {
    if (cached && cached.__seed === seed) { return cached; }
    var rngRoot = IP.Rand.make(seed || 1);
    var sections = [], allCollision = [], navBySection = {}, pathBySection = {};
    var i, s;

    for (i = 0; i < SECTIONS.length; i++) {
      var def = SECTIONS[i];
      var ctx = new Ctx(def.id, def.name, def.act, THEMES[def.id] || THEMES.cells,
                        IP.Rand.make((seed || 1) + i * 7919));
      def.fn(ctx);

      /* fold builders into renderable chunks */
      var opaque = [];
      for (var k in ctx.groups) {
        if (!Object.prototype.hasOwnProperty.call(ctx.groups, k)) { continue; }
        var grp = ctx.groups[k];
        if (grp.b.isEmpty()) { continue; }
        opaque.push({ geoData: grp.b.build(), material: grp.material });
      }
      if (ctx.min[0] > ctx.max[0]) { ctx.min = [-10, 0, -10]; ctx.max = [10, 4, 10]; }

      var nav = buildNav(ctx);
      navByModule(navBySection, def.id, nav);
      pathBySection[def.id] = makePathfinder(nav);

      /* tag collision boxes with their section so lookups can be scoped */
      for (var cb = 0; cb < ctx.collision.length; cb++) {
        ctx.collision[cb].section = def.id;
        allCollision.push(ctx.collision[cb]);
      }

      sections.push({
        id: def.id, name: def.name, act: def.act, indoor: ctx.indoor,
        bounds: { min: ctx.min.slice(), max: ctx.max.slice() },
        geo: { opaque: opaque, transparent: ctx.transparent },
        props: ctx.props, lights: ctx.lights, spawns: ctx.spawns,
        triggers: ctx.triggers, collision: ctx.collision, nav: nav
      });
    }

    /* --- global queries, section-aware --------------------------------- */
    function sectionAt(x, z) {
      for (var si = 0; si < sections.length; si++) {
        var b = sections[si].bounds;
        if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]) { return sections[si]; }
      }
      return sections[0];
    }
    function navOf(id) { return navBySection[id] || navBySection[sections[0].id]; }

    var level = {
      __seed: seed,
      sections: sections,
      transitions: TRANSITIONS,
      collision: { boxes: allCollision, ramps: [], water: [], ladders: [], doors: [] },
      navQuery: {
        isWalkable: function (x, z, sectionId) {
          var nav = navOf(sectionId || sectionAt(x, z).id);
          var gx = Math.floor((x - nav.origin[0]) / nav.cellW);
          var gz = Math.floor((z - nav.origin[1]) / nav.cellH);
          if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) { return false; }
          return !!nav.grid[gz * nav.w + gx];
        },
        sampleHeight: function (x, z, sectionId) {
          var nav = navOf(sectionId || sectionAt(x, z).id);
          var gx = Math.floor((x - nav.origin[0]) / nav.cellW);
          var gz = Math.floor((z - nav.origin[1]) / nav.cellH);
          if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) { return 0; }
          return nav.heights[gz * nav.w + gx];
        },
        findPath: function (from, to, out, sectionId) {
          var f = pathBySection[sectionId || sectionAt(from[0], from[2]).id];
          return f ? f(from, to, out) : (out || []);
        },
        sectionAt: sectionAt
      }
    };
    cached = level;
    return level;
  }

  function navByModule(store, id, nav) { store[id] = nav; }

  IP.Level = {
    build: build,
    SECTIONS: SECTIONS,
    TRANSITIONS: TRANSITIONS,
    MAT: MAT,
    NAV_CELL: NAV_CELL
  };

})();
if (typeof window !== 'undefined') { window.IP = IP; }

/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   10_core.js - math, rng, noise, utility, event bus.
   Column-major matrices, GL convention. No dependencies.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  /* ---------------------------------------------------------------- M4 --- */
  var M4 = {};
  M4.create = function () {
    var o = new Float32Array(16);
    o[0] = 1; o[5] = 1; o[10] = 1; o[15] = 1;
    return o;
  };
  M4.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };
  M4.copy = function (o, a) { o.set(a); return o; };
  M4.mul = function (o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    var b0, b1, b2, b3;
    b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
    o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return o;
  };
  M4.translate = function (o, a, v) {
    var x = v[0], y = v[1], z = v[2];
    if (o !== a) { o.set(a); }
    o[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    o[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    o[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return o;
  };
  M4.scale = function (o, a, v) {
    var x = v[0], y = v[1], z = v[2];
    o[0] = a[0] * x; o[1] = a[1] * x; o[2] = a[2] * x; o[3] = a[3] * x;
    o[4] = a[4] * y; o[5] = a[5] * y; o[6] = a[6] * y; o[7] = a[7] * y;
    o[8] = a[8] * z; o[9] = a[9] * z; o[10] = a[10] * z; o[11] = a[11] * z;
    o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
    return o;
  };
  M4.rotateX = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3];
      o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s;
    o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s;
    o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s;
    o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s;
    return o;
  };
  M4.rotateY = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7];
      o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s;
    o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s;
    o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c;
    o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c;
    return o;
  };
  M4.rotateZ = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    if (o !== a) { o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11];
      o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s;
    o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s;
    o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s;
    o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s;
    return o;
  };
  M4.fromTRS = function (o, p, q, s) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var x2 = x + x, y2 = y + y, z2 = z + z;
    var xx = x * x2, xy = x * y2, xz = x * z2;
    var yy = y * y2, yz = y * z2, zz = z * z2;
    var wx = w * x2, wy = w * y2, wz = w * z2;
    var sx = s[0], sy = s[1], sz = s[2];
    o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
    o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
    o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
    return o;
  };
  M4.fromRotationTranslationScale = M4.fromTRS;
  M4.perspective = function (o, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };
  M4.ortho = function (o, l, r, b, t, n, f) {
    var lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  };
  M4.lookAt = function (o, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
    var ex = eye[0], ey = eye[1], ez = eye[2];
    var ux = up[0], uy = up[1], uz = up[2];
    z0 = ex - center[0]; z1 = ey - center[1]; z2 = ez - center[2];
    len = z0 * z0 + z1 * z1 + z2 * z2;
    if (len < 1e-12) { return M4.identity(o); }
    len = 1 / Math.sqrt(len); z0 *= len; z1 *= len; z2 *= len;
    x0 = uy * z2 - uz * z1; x1 = uz * z0 - ux * z2; x2 = ux * z1 - uy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (len < 1e-8) { x0 = 1; x1 = 0; x2 = 0; } else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
    y0 = z1 * x2 - z2 * x1; y1 = z2 * x0 - z0 * x2; y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * ex + x1 * ey + x2 * ez);
    o[13] = -(y0 * ex + y1 * ey + y2 * ez);
    o[14] = -(z0 * ex + z1 * ey + z2 * ez);
    o[15] = 1;
    return o;
  };
  M4.invert = function (o, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) { return M4.identity(o); }
    det = 1.0 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };
  M4.transpose = function (o, a) {
    if (o === a) {
      var a01 = a[1], a02 = a[2], a03 = a[3], a12 = a[6], a13 = a[7], a23 = a[11];
      o[1] = a[4]; o[2] = a[8]; o[3] = a[12]; o[4] = a01; o[6] = a[9];
      o[7] = a[13]; o[8] = a02; o[9] = a12; o[11] = a[14];
      o[12] = a03; o[13] = a13; o[14] = a23;
    } else {
      o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
      o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = a[13];
      o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = a[14];
      o[12] = a[3]; o[13] = a[7]; o[14] = a[11]; o[15] = a[15];
    }
    return o;
  };
  M4.getTranslation = function (o, m) { o[0] = m[12]; o[1] = m[13]; o[2] = m[14]; return o; };
  M4.transformPoint = function (o, m, p) {
    var x = p[0], y = p[1], z = p[2];
    var w = m[3] * x + m[7] * y + m[11] * z + m[15]; w = w || 1;
    var ox = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    var oy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    var oz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    o[0] = ox; o[1] = oy; o[2] = oz; return o;
  };
  M4.transformDir = function (o, m, v) {
    var x = v[0], y = v[1], z = v[2];
    var ox = m[0] * x + m[4] * y + m[8] * z;
    var oy = m[1] * x + m[5] * y + m[9] * z;
    var oz = m[2] * x + m[6] * y + m[10] * z;
    o[0] = ox; o[1] = oy; o[2] = oz; return o;
  };

  /* ---------------------------------------------------------------- V3 --- */
  var V3 = {};
  V3.create = function (x, y, z) {
    var o = new Float32Array(3);
    o[0] = x || 0; o[1] = y || 0; o[2] = z || 0; return o;
  };
  V3.set = function (o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; };
  V3.copy = function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
  V3.add = function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; };
  V3.sub = function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  V3.mul = function (o, a, b) { o[0] = a[0] * b[0]; o[1] = a[1] * b[1]; o[2] = a[2] * b[2]; return o; };
  V3.scale = function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; };
  V3.scaleAndAdd = function (o, a, b, s) {
    o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o;
  };
  V3.negate = function (o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; return o; };
  V3.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  V3.cross = function (o, a, b) {
    var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
    o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; return o;
  };
  V3.len2 = function (a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; };
  V3.len = function (a) { return Math.sqrt(V3.len2(a)); };
  V3.dist2 = function (a, b) {
    var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return x * x + y * y + z * z;
  };
  V3.dist = function (a, b) { return Math.sqrt(V3.dist2(a, b)); };
  V3.normalize = function (o, a) {
    var l = V3.len2(a);
    if (l > 0) { l = 1 / Math.sqrt(l); o[0] = a[0] * l; o[1] = a[1] * l; o[2] = a[2] * l; }
    else { o[0] = 0; o[1] = 0; o[2] = 0; }
    return o;
  };
  V3.lerp = function (o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  };
  for (var _i = 0; _i < 8; _i++) { V3['TMP' + _i] = V3.create(0, 0, 0); }

  /* ----------------------------------------------------------------- Q --- */
  var Q = {};
  Q.create = function () { var o = new Float32Array(4); o[3] = 1; return o; };
  Q.identity = function (o) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; };
  Q.copy = function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; };
  Q.fromEuler = function (o, x, y, z) {
    var c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    var s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    // YXZ order (yaw, pitch, roll) - matches camera convention used by the game
    o[0] = s1 * c2 * c3 + c1 * s2 * s3;
    o[1] = c1 * s2 * c3 - s1 * c2 * s3;
    o[2] = c1 * c2 * s3 - s1 * s2 * c3;
    o[3] = c1 * c2 * c3 + s1 * s2 * s3;
    return o;
  };
  Q.fromAxisAngle = function (o, ax, rad) {
    var h = rad * 0.5, s = Math.sin(h);
    o[0] = ax[0] * s; o[1] = ax[1] * s; o[2] = ax[2] * s; o[3] = Math.cos(h);
    return o;
  };
  Q.mul = function (o, a, b) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3];
    var bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = ax * bw + aw * bx + ay * bz - az * by;
    o[1] = ay * bw + aw * by + az * bx - ax * bz;
    o[2] = az * bw + aw * bz + ax * by - ay * bx;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  };
  Q.normalize = function (o, a) {
    var l = a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3];
    if (l > 0) { l = 1 / Math.sqrt(l); o[0] = a[0] * l; o[1] = a[1] * l; o[2] = a[2] * l; o[3] = a[3] * l; }
    return o;
  };
  Q.slerp = function (o, a, b, t) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3];
    var bx = b[0], by = b[1], bz = b[2], bw = b[3];
    var cosom = ax * bx + ay * by + az * bz + aw * bw;
    if (cosom < 0) { cosom = -cosom; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    var scale0, scale1;
    if (1.0 - cosom > 1e-6) {
      var omega = Math.acos(cosom), sinom = Math.sin(omega);
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else { scale0 = 1.0 - t; scale1 = t; }
    o[0] = scale0 * ax + scale1 * bx;
    o[1] = scale0 * ay + scale1 * by;
    o[2] = scale0 * az + scale1 * bz;
    o[3] = scale0 * aw + scale1 * bw;
    return o;
  };
  Q.rotateVec3 = function (o, q, v) {
    var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    var vx = v[0], vy = v[1], vz = v[2];
    var uvx = qy * vz - qz * vy, uvy = qz * vx - qx * vz, uvz = qx * vy - qy * vx;
    var uuvx = qy * uvz - qz * uvy, uuvy = qz * uvx - qx * uvz, uuvz = qx * uvy - qy * uvx;
    var w2 = qw * 2;
    o[0] = vx + uvx * w2 + uuvx * 2;
    o[1] = vy + uvy * w2 + uuvy * 2;
    o[2] = vz + uvz * w2 + uuvz * 2;
    return o;
  };

  /* -------------------------------------------------------------- RAND --- */
  function makeRand(seed) {
    var s = (seed >>> 0) || 0x2f6e2b1;
    function f() {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    }
    return {
      f: f,
      range: function (a, b) { return a + f() * (b - a); },
      int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; },
      sign: function () { return f() < 0.5 ? -1 : 1; },
      seed: function (n) { s = (n >>> 0) || 1; }
    };
  }
  var Rand = makeRand(1337);
  Rand.make = makeRand;

  /* ------------------------------------------------------------- NOISE --- */
  var Noise = (function () {
    var p = new Uint8Array(512), perm = new Uint8Array(512);
    var r = makeRand(9001), i, j, t;
    for (i = 0; i < 256; i++) { p[i] = i; }
    for (i = 255; i > 0; i--) { j = Math.floor(r.f() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) { perm[i] = p[i & 255]; }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function grad2(h, x, y) {
      switch (h & 3) {
        case 0: return x + y; case 1: return -x + y;
        case 2: return x - y; default: return -x - y;
      }
    }
    function grad3(h, x, y, z) {
      var hh = h & 15;
      var u = hh < 8 ? x : y;
      var v = hh < 4 ? y : (hh === 12 || hh === 14 ? x : z);
      return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
    }
    function perlin2(x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y);
      var A = perm[X] + Y, B = perm[X + 1] + Y;
      return lerp(
        lerp(grad2(perm[A], x, y), grad2(perm[B], x - 1, y), u),
        lerp(grad2(perm[A + 1], x, y - 1), grad2(perm[B + 1], x - 1, y - 1), u), v);
    }
    function perlin3(x, y, z) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      var u = fade(x), v = fade(y), w = fade(z);
      var A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
      var B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
      return lerp(lerp(lerp(grad3(perm[AA], x, y, z), grad3(perm[BA], x - 1, y, z), u),
                       lerp(grad3(perm[AB], x, y - 1, z), grad3(perm[BB], x - 1, y - 1, z), u), v),
                  lerp(lerp(grad3(perm[AA + 1], x, y, z - 1), grad3(perm[BA + 1], x - 1, y, z - 1), u),
                       lerp(grad3(perm[AB + 1], x, y - 1, z - 1), grad3(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    }
    function fbm2(x, y, oct, lac, gain) {
      oct = oct || 4; lac = lac || 2.0; gain = gain === undefined ? 0.5 : gain;
      var amp = 0.5, freq = 1.0, sum = 0, norm = 0;
      for (var k = 0; k < oct; k++) {
        sum += amp * perlin2(x * freq, y * freq);
        norm += amp; amp *= gain; freq *= lac;
      }
      return norm > 0 ? sum / norm : 0;
    }
    function hash2(ix, iy) {
      var h = ix * 374761393 + iy * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) >>> 0) / 4294967296;
    }
    function worley2(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), best = 8;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var cx = ix + dx, cy = iy + dy;
          var px = cx + hash2(cx, cy), py = cy + hash2(cy * 7, cx * 13);
          var ddx = px - x, ddy = py - y, d = ddx * ddx + ddy * ddy;
          if (d < best) { best = d; }
        }
      }
      return Math.min(1, Math.sqrt(best));
    }
    return { perlin2: perlin2, perlin3: perlin3, fbm2: fbm2, worley2: worley2, hash2: hash2 };
  })();

  /* -------------------------------------------------------------- UTIL --- */
  var listeners = {};
  var Util = {
    TAU: Math.PI * 2,
    PI: Math.PI,
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    smoothstep: function (e0, e1, x) {
      var t = Util.clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
      return t * t * (3 - 2 * t);
    },
    damp: function (a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); },
    angleLerp: function (a, b, t) {
      var d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) { d += Math.PI * 2; }
      return a + d * t;
    },
    angleDiff: function (a, b) {
      var d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      return d < -Math.PI ? d + Math.PI * 2 : d;
    },
    now: function () {
      return (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
    },
    aabbOverlap: function (minA, maxA, minB, maxB) {
      return minA[0] <= maxB[0] && maxA[0] >= minB[0] &&
             minA[1] <= maxB[1] && maxA[1] >= minB[1] &&
             minA[2] <= maxB[2] && maxA[2] >= minB[2];
    },
    segIntersectAABB: function (p0, p1, mn, mx) {
      var tmin = 0, tmax = 1, i, d, t1, t2, tmp;
      for (i = 0; i < 3; i++) {
        d = p1[i] - p0[i];
        if (Math.abs(d) < 1e-8) {
          if (p0[i] < mn[i] || p0[i] > mx[i]) { return -1; }
        } else {
          t1 = (mn[i] - p0[i]) / d; t2 = (mx[i] - p0[i]) / d;
          if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > tmin) { tmin = t1; }
          if (t2 < tmax) { tmax = t2; }
          if (tmin > tmax) { return -1; }
        }
      }
      return tmin;
    },
    on: function (name, fn) {
      (listeners[name] || (listeners[name] = [])).push(fn);
      return fn;
    },
    off: function (name, fn) {
      var a = listeners[name]; if (!a) { return; }
      var i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); }
    },
    emit: function (name, payload) {
      var a = listeners[name]; if (!a) { return; }
      for (var i = 0; i < a.length; i++) {
        try { a[i](payload); } catch (e) { if (typeof console !== 'undefined') { console.warn(name, e); } }
      }
    },
    hexToLinear: function (hex) {
      var r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
      return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
    }
  };

  IP.M4 = M4; IP.V3 = V3; IP.Q = Q;
  IP.Rand = Rand; IP.Noise = Noise; IP.Util = Util;
  IP.VERSION = '1.0.0';
})();
if (typeof window !== 'undefined') { window.IP = IP; }

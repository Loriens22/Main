/* =====================================================================
 * 40_physics.js — SG.phys
 *
 * A small, deterministic, allocation-free collision world.
 *
 *   - Static bodies only: Y-axis OBBs and Y-axis ramps (wedges).
 *   - Uniform 2 m grid broadphase over XZ (+ an oversized list for
 *     bodies that would smear across too many cells, e.g. a floor slab).
 *   - Swept collide-and-slide capsule mover with step-up, slope limit,
 *     ground snap and coyote time.
 *   - A tiny cosmetic rigid-body toss for props (sphere vs box only).
 *
 * Everything in the per-frame path uses closure-scope scratch numbers.
 * No Vector3 is constructed after init.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;

  /* ------------------------------------------------------------------ */
  /* Tunables                                                            */
  /* ------------------------------------------------------------------ */

  var GRAVITY = -9.81;
  var CELL = 2.0;                 /* broadphase cell size, metres        */
  var SLOPE_LIMIT_DEG = 50;
  var SLOPE_COS = Math.cos(SLOPE_LIMIT_DEG * Math.PI / 180);  /* 0.6428  */
  var STEP_HEIGHT = 0.30;
  var STEP_SKIN = 0.02;
  var SNAP_DIST = 0.08;
  var COYOTE = 0.10;
  var DEPEN_ITERS = 4;
  var EPS = 1e-6;

  /* Broadphase key packing: world is clamped to +/- 8 km. */
  var KOFF = 4096, KMUL = 8192;
  function cellKey(gx, gz) { return (gx + KOFF) * KMUL + (gz + KOFF); }

  /* ------------------------------------------------------------------ */
  /* Body store                                                          */
  /* ------------------------------------------------------------------ */

  var bodies = [];        /* sparse, indexed by id                       */
  var freeIds = [];
  var liveCount = 0;
  var grid = null;        /* Map<int, int[]>                             */
  var oversized = [];     /* ids tested against every query              */

  /* Broadphase query scratch */
  var stamp = [];
  var stampTick = 0;
  var cand = [];
  var candN = 0;

  /* Contact scratch written by the narrowphase */
  var _nx = 0, _ny = 0, _nz = 0, _depth = 0;
  /* Raycast scratch written by rayWorld() */
  var _rt = 0, _rnx = 0, _rny = 0, _rnz = 0, _rtag = null, _rid = -1;

  function makeBody(id, type) {
    return {
      id: id, type: type, enabled: true, tag: 'static',
      cx: 0, cy: 0, cz: 0, hx: 0.5, hy: 0.5, hz: 0.5,
      yaw: 0, sin: 0, cos: 1, rise: 0, k: 0,
      minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0,
      cells: [], big: false,
      pl: null      /* ramp: 6 planes packed as nx,ny,nz,d               */
    };
  }

  function computeAABB(b) {
    var ac = Math.abs(b.cos), as = Math.abs(b.sin);
    var ex = b.hx * ac + b.hz * as;
    var ez = b.hx * as + b.hz * ac;
    b.minX = b.cx - ex; b.maxX = b.cx + ex;
    b.minZ = b.cz - ez; b.maxZ = b.cz + ez;
    b.minY = b.cy - b.hy; b.maxY = b.cy + b.hy;
  }

  function gridInsert(b) {
    var gx0 = Math.floor(b.minX / CELL), gx1 = Math.floor(b.maxX / CELL);
    var gz0 = Math.floor(b.minZ / CELL), gz1 = Math.floor(b.maxZ / CELL);
    var n = (gx1 - gx0 + 1) * (gz1 - gz0 + 1);
    b.cells.length = 0;
    if (n > 256 || gx0 < -KOFF || gx1 > KOFF || gz0 < -KOFF || gz1 > KOFF) {
      b.big = true;
      oversized.push(b.id);
      return;
    }
    b.big = false;
    for (var gx = gx0; gx <= gx1; gx++) {
      for (var gz = gz0; gz <= gz1; gz++) {
        var k = cellKey(gx, gz);
        var arr = grid.get(k);
        if (!arr) { arr = []; grid.set(k, arr); }
        arr.push(b.id);
        b.cells.push(k);
      }
    }
  }

  function gridRemove(b) {
    if (b.big) {
      var oi = oversized.indexOf(b.id);
      if (oi >= 0) oversized.splice(oi, 1);
      return;
    }
    for (var i = 0; i < b.cells.length; i++) {
      var arr = grid.get(b.cells[i]);
      if (!arr) continue;
      var j = arr.indexOf(b.id);
      if (j >= 0) arr.splice(j, 1);
    }
    b.cells.length = 0;
  }

  /* Collect body ids whose AABB overlaps the query box. Fills cand/candN. */
  function queryAABB(minX, minY, minZ, maxX, maxY, maxZ) {
    candN = 0;
    stampTick++;
    var i, b, id;

    for (i = 0; i < oversized.length; i++) {
      id = oversized[i];
      b = bodies[id];
      if (!b || !b.enabled) continue;
      if (b.maxX < minX || b.minX > maxX) continue;
      if (b.maxY < minY || b.minY > maxY) continue;
      if (b.maxZ < minZ || b.minZ > maxZ) continue;
      stamp[id] = stampTick;
      cand[candN++] = id;
    }

    var gx0 = Math.floor(minX / CELL), gx1 = Math.floor(maxX / CELL);
    var gz0 = Math.floor(minZ / CELL), gz1 = Math.floor(maxZ / CELL);
    var span = (gx1 - gx0 + 1) * (gz1 - gz0 + 1);

    if (span > 4096 || span < 0) {
      /* Pathological query — just scan everything. Never happens in play. */
      for (id = 0; id < bodies.length; id++) {
        b = bodies[id];
        if (!b || !b.enabled || b.big) continue;
        if (stamp[id] === stampTick) continue;
        if (b.maxX < minX || b.minX > maxX) continue;
        if (b.maxY < minY || b.minY > maxY) continue;
        if (b.maxZ < minZ || b.minZ > maxZ) continue;
        stamp[id] = stampTick;
        cand[candN++] = id;
      }
      return;
    }

    for (var gx = gx0; gx <= gx1; gx++) {
      for (var gz = gz0; gz <= gz1; gz++) {
        var arr = grid.get(cellKey(gx, gz));
        if (!arr) continue;
        for (var n = 0; n < arr.length; n++) {
          id = arr[n];
          if (stamp[id] === stampTick) continue;
          stamp[id] = stampTick;
          b = bodies[id];
          if (!b || !b.enabled) continue;
          if (b.maxX < minX || b.minX > maxX) continue;
          if (b.maxY < minY || b.minY > maxY) continue;
          if (b.maxZ < minZ || b.minZ > maxZ) continue;
          cand[candN++] = id;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Narrowphase — sphere vs body                                        */
  /* ------------------------------------------------------------------ */

  /* Returns true and writes _nx/_ny/_nz (unit, pointing out of the body
   * toward the sphere) and _depth (metres of overlap). */
  function sphereVsBox(b, sx, sy, sz, r) {
    var dx = sx - b.cx, dy = sy - b.cy, dz = sz - b.cz;
    var lx, lz;
    if (b.sin === 0) { lx = dx; lz = dz; }
    else { lx = dx * b.cos - dz * b.sin; lz = dx * b.sin + dz * b.cos; }
    var ly = dy;

    var qx = lx < -b.hx ? -b.hx : (lx > b.hx ? b.hx : lx);
    var qy = ly < -b.hy ? -b.hy : (ly > b.hy ? b.hy : ly);
    var qz = lz < -b.hz ? -b.hz : (lz > b.hz ? b.hz : lz);

    var ex = lx - qx, ey = ly - qy, ez = lz - qz;
    var d2 = ex * ex + ey * ey + ez * ez;
    var nlx, nly, nlz;

    if (d2 > 1e-12) {
      if (d2 >= r * r) return false;
      var d = Math.sqrt(d2);
      nlx = ex / d; nly = ey / d; nlz = ez / d;
      _depth = r - d;
    } else {
      /* Centre is inside. Choose the shallowest exit, but bias hard toward
       * "up" when we are in the top half — that is the case where two
       * overlapping floor slabs would otherwise eject the player sideways
       * or, worse, straight down through the world. */
      var px = b.hx - (lx < 0 ? -lx : lx);
      var py = b.hy - (ly < 0 ? -ly : ly);
      var pz = b.hz - (lz < 0 ? -lz : lz);
      var pyE = ly >= 0 ? py * 0.45 : py * 1.75;
      if (pyE <= px && pyE <= pz) {
        nlx = 0; nly = ly >= 0 ? 1 : -1; nlz = 0; _depth = r + py;
      } else if (px <= pz) {
        nlx = lx >= 0 ? 1 : -1; nly = 0; nlz = 0; _depth = r + px;
      } else {
        nlx = 0; nly = 0; nlz = lz >= 0 ? 1 : -1; _depth = r + pz;
      }
    }

    if (b.sin === 0) { _nx = nlx; _nz = nlz; }
    else { _nx = nlx * b.cos + nlz * b.sin; _nz = -nlx * b.sin + nlz * b.cos; }
    _ny = nly;
    return true;
  }

  /* Convex wedge: max over the 6 half-space distances. Exact on faces,
   * slightly conservative on edges — which is stable, and stability is
   * what stops corner jitter. */
  function sphereVsRamp(b, sx, sy, sz, r) {
    var dx = sx - b.cx, dy = sy - b.cy, dz = sz - b.cz;
    var lx, lz;
    if (b.sin === 0) { lx = dx; lz = dz; }
    else { lx = dx * b.cos - dz * b.sin; lz = dx * b.sin + dz * b.cos; }
    var ly = dy;

    var pl = b.pl;
    var best = -1e9, bi = 0;
    for (var i = 0; i < 6; i++) {
      var o = i * 4;
      var sd = pl[o] * lx + pl[o + 1] * ly + pl[o + 2] * lz - pl[o + 3];
      if (sd >= r) return false;
      if (sd > best) { best = sd; bi = i; }
    }
    _depth = r - best;
    var b0 = bi * 4;
    var nlx = pl[b0], nly = pl[b0 + 1], nlz = pl[b0 + 2];
    if (b.sin === 0) { _nx = nlx; _nz = nlz; }
    else { _nx = nlx * b.cos + nlz * b.sin; _nz = -nlx * b.sin + nlz * b.cos; }
    _ny = nly;
    return true;
  }

  function sphereVsBody(b, sx, sy, sz, r) {
    return b.type === 1 ? sphereVsRamp(b, sx, sy, sz, r)
      : sphereVsBox(b, sx, sy, sz, r);
  }

  /* ------------------------------------------------------------------ */
  /* Narrowphase — ray vs body                                           */
  /* ------------------------------------------------------------------ */

  /* Returns t (>=0) or -1. Writes _rnx/_rny/_rnz. dir must be unit. */
  function rayVsBox(b, ox, oy, oz, dx, dy, dz, maxD) {
    var rx = ox - b.cx, ry = oy - b.cy, rz = oz - b.cz;
    var lx, lz, ldx, ldz;
    if (b.sin === 0) { lx = rx; lz = rz; ldx = dx; ldz = dz; }
    else {
      lx = rx * b.cos - rz * b.sin; lz = rx * b.sin + rz * b.cos;
      ldx = dx * b.cos - dz * b.sin; ldz = dx * b.sin + dz * b.cos;
    }
    var t0 = 0, t1 = maxD, axis = -1, sgn = 1, tn, tf, inv, sw;

    /* X slab */
    if (ldx > -1e-9 && ldx < 1e-9) { if (lx < -b.hx || lx > b.hx) return -1; }
    else {
      inv = 1 / ldx;
      tn = (-b.hx - lx) * inv; tf = (b.hx - lx) * inv; sw = 1;
      if (tn > tf) { var q = tn; tn = tf; tf = q; sw = -1; }
      if (tn > t0) { t0 = tn; axis = 0; sgn = -sw; }
      if (tf < t1) t1 = tf;
      if (t0 > t1) return -1;
    }
    /* Y slab */
    if (dy > -1e-9 && dy < 1e-9) { if (ry < -b.hy || ry > b.hy) return -1; }
    else {
      inv = 1 / dy;
      tn = (-b.hy - ry) * inv; tf = (b.hy - ry) * inv; sw = 1;
      if (tn > tf) { var q2 = tn; tn = tf; tf = q2; sw = -1; }
      if (tn > t0) { t0 = tn; axis = 1; sgn = -sw; }
      if (tf < t1) t1 = tf;
      if (t0 > t1) return -1;
    }
    /* Z slab */
    if (ldz > -1e-9 && ldz < 1e-9) { if (lz < -b.hz || lz > b.hz) return -1; }
    else {
      inv = 1 / ldz;
      tn = (-b.hz - lz) * inv; tf = (b.hz - lz) * inv; sw = 1;
      if (tn > tf) { var q3 = tn; tn = tf; tf = q3; sw = -1; }
      if (tn > t0) { t0 = tn; axis = 2; sgn = -sw; }
      if (tf < t1) t1 = tf;
      if (t0 > t1) return -1;
    }
    if (t0 > maxD || t1 < 0) return -1;

    var nlx = 0, nly = 0, nlz = 0;
    if (axis === 0) nlx = sgn;
    else if (axis === 1) nly = sgn;
    else if (axis === 2) nlz = sgn;
    else { nlx = -dx; nly = -dy; nlz = -dz; }   /* origin inside */

    if (axis === 1 || axis < 0) {
      if (axis < 0) { _rnx = nlx; _rny = nly; _rnz = nlz; return t0; }
      _rnx = 0; _rny = nly; _rnz = 0; return t0;
    }
    if (b.sin === 0) { _rnx = nlx; _rnz = nlz; }
    else { _rnx = nlx * b.cos + nlz * b.sin; _rnz = -nlx * b.sin + nlz * b.cos; }
    _rny = 0;
    return t0;
  }

  function rayVsRamp(b, ox, oy, oz, dx, dy, dz, maxD) {
    var rx = ox - b.cx, ry = oy - b.cy, rz = oz - b.cz;
    var lx, lz, ldx, ldz;
    if (b.sin === 0) { lx = rx; lz = rz; ldx = dx; ldz = dz; }
    else {
      lx = rx * b.cos - rz * b.sin; lz = rx * b.sin + rz * b.cos;
      ldx = dx * b.cos - dz * b.sin; ldz = dx * b.sin + dz * b.cos;
    }
    var pl = b.pl;
    var t0 = 0, t1 = maxD, axis = -1;
    for (var i = 0; i < 6; i++) {
      var o = i * 4;
      var den = pl[o] * ldx + pl[o + 1] * dy + pl[o + 2] * ldz;
      var dist = pl[o + 3] - (pl[o] * lx + pl[o + 1] * ry + pl[o + 2] * lz);
      if (den > -1e-9 && den < 1e-9) { if (dist < 0) return -1; continue; }
      var t = dist / den;
      if (den > 0) { if (t < t1) t1 = t; }
      else { if (t > t0) { t0 = t; axis = i; } }
      if (t0 > t1) return -1;
    }
    if (t0 > maxD || t1 < 0) return -1;
    var nlx, nly, nlz;
    if (axis < 0) { nlx = -dx; nly = -dy; nlz = -dz; _rnx = nlx; _rny = nly; _rnz = nlz; return t0; }
    var a = axis * 4;
    nlx = pl[a]; nly = pl[a + 1]; nlz = pl[a + 2];
    if (b.sin === 0) { _rnx = nlx; _rnz = nlz; }
    else { _rnx = nlx * b.cos + nlz * b.sin; _rnz = -nlx * b.sin + nlz * b.cos; }
    _rny = nly;
    return t0;
  }

  function maskAllows(mask, b) {
    if (mask === undefined || mask === null) return true;
    if (typeof mask === 'function') return !!mask(b.tag, b.id, b);
    if (typeof mask === 'string') return b.tag === mask;
    if (mask.length !== undefined) {
      for (var i = 0; i < mask.length; i++) if (mask[i] === b.tag) return true;
      return false;
    }
    return true;
  }

  /* Core raycast. dir need not be unit. Returns distance or -1 and writes
   * _rt/_rnx/_rny/_rnz/_rtag/_rid. Allocation free. */
  function rayWorld(ox, oy, oz, dx, dy, dz, maxD, mask) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) return -1;
    dx /= l; dy /= l; dz /= l;
    if (!(maxD > 0)) return -1;

    var ex = ox + dx * maxD, ey = oy + dy * maxD, ez = oz + dz * maxD;
    queryAABB(
      Math.min(ox, ex), Math.min(oy, ey), Math.min(oz, ez),
      Math.max(ox, ex), Math.max(oy, ey), Math.max(oz, ez));

    var best = -1;
    for (var c = 0; c < candN; c++) {
      var b = bodies[cand[c]];
      if (!b || !b.enabled) continue;
      if (!maskAllows(mask, b)) continue;
      var t = b.type === 1
        ? rayVsRamp(b, ox, oy, oz, dx, dy, dz, maxD)
        : rayVsBox(b, ox, oy, oz, dx, dy, dz, maxD);
      if (t < 0) continue;
      if (best < 0 || t < best) {
        best = t;
        _rt = t; _rtag = b.tag; _rid = b.id;
        /* _rnx.. already written by the ray fn for this body */
        _bnx = _rnx; _bny = _rny; _bnz = _rnz;
      }
    }
    if (best < 0) return -1;
    _rnx = _bnx; _rny = _bny; _rnz = _bnz;
    _rt = best;
    return best;
  }
  var _bnx = 0, _bny = 0, _bnz = 0;

  /* ------------------------------------------------------------------ */
  /* Capsule solver                                                      */
  /* ------------------------------------------------------------------ */

  var _P = { x: 0, y: 0, z: 0 };
  /* contact accumulators */
  var C_ground = false, C_ceil = false, C_wall = false;
  var C_gnx = 0, C_gny = -2, C_gnz = 0;
  var WALL = new Float64Array(18);
  var WALLN = 0;

  function clearContacts() {
    C_ground = false; C_ceil = false; C_wall = false;
    C_gnx = 0; C_gny = -2; C_gnz = 0;
    WALLN = 0;
  }

  function addWall(nx, ny, nz) {
    var l = Math.sqrt(nx * nx + nz * nz);
    if (l < 1e-5) return;
    nx /= l; nz /= l;
    for (var i = 0; i < WALLN; i++) {
      if (WALL[i * 3] * nx + WALL[i * 3 + 2] * nz > 0.985) return;  /* dup */
    }
    if (WALLN >= 6) return;
    WALL[WALLN * 3] = nx; WALL[WALLN * 3 + 1] = ny; WALL[WALLN * 3 + 2] = nz;
    WALLN++;
  }

  /* Sphere sampling along the capsule segment. */
  var S_lo = 0, S_step = 0, S_n = 2;
  function setupSpheres(radius, height) {
    var lo = radius, hi = height - radius;
    if (hi < lo) { lo = hi = height * 0.5; }
    var span = hi - lo;
    var n = Math.ceil(span / (radius * 0.85)) + 1;
    if (n < 2) n = 2;
    if (n > 8) n = 8;
    S_lo = lo; S_n = n; S_step = span / (n - 1);
  }

  function depenetrate(radius, height, iters) {
    queryAABB(
      _P.x - radius - 0.2, _P.y - 0.2, _P.z - radius - 0.2,
      _P.x + radius + 0.2, _P.y + height + 0.2, _P.z + radius + 0.2);
    if (candN === 0) return false;
    var touched = false;
    for (var it = 0; it < iters; it++) {
      var any = false;
      for (var c = 0; c < candN; c++) {
        var b = bodies[cand[c]];
        if (!b || !b.enabled) continue;
        for (var k = 0; k < S_n; k++) {
          var sy = _P.y + S_lo + k * S_step;
          if (!sphereVsBody(b, _P.x, sy, _P.z, radius)) continue;
          if (_depth <= EPS) continue;
          _P.x += _nx * _depth;
          _P.y += _ny * _depth;
          _P.z += _nz * _depth;
          any = true; touched = true;
          if (_ny > SLOPE_COS) {
            C_ground = true;
            if (_ny > C_gny) { C_gnx = _nx; C_gny = _ny; C_gnz = _nz; }
          } else if (_ny < -0.5) {
            C_ceil = true;
          } else {
            C_wall = true;
            addWall(_nx, _ny, _nz);
          }
        }
      }
      if (!any) break;
    }
    return touched;
  }

  /* Move _P by (dx,dy,dz), chunked so nothing thin is ever skipped. */
  function sweep(dx, dy, dz, radius, height) {
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) { depenetrate(radius, height, DEPEN_ITERS); return; }
    var chunk = radius * 0.5;
    var steps = Math.ceil(len / chunk);
    if (steps < 1) steps = 1;
    if (steps > 96) steps = 96;
    var fx = dx / steps, fy = dy / steps, fz = dz / steps;
    for (var i = 0; i < steps; i++) {
      _P.x += fx; _P.y += fy; _P.z += fz;
      depenetrate(radius, height, DEPEN_ITERS);
    }
  }

  function ensureOut(out) {
    if (!out) out = {};
    if (!out.pos) out.pos = new THREE.Vector3();
    if (!out.vel) out.vel = new THREE.Vector3();
    if (!out.groundNormal) out.groundNormal = new THREE.Vector3(0, 1, 0);
    return out;
  }

  var _stepSaveX = 0, _stepSaveY = 0, _stepSaveZ = 0;

  function tryStepUp(sx0, sy0, sz0, dx, dz, wantLen, curGot, radius, height) {
    _stepSaveX = _P.x; _stepSaveY = _P.y; _stepSaveZ = _P.z;

    /* 1. headroom above the start position */
    _P.x = sx0; _P.y = sy0 + STEP_HEIGHT + STEP_SKIN; _P.z = sz0;
    clearContacts();
    depenetrate(radius, height, 3);
    if (Math.abs(_P.x - sx0) > 0.02 || Math.abs(_P.z - sz0) > 0.02 ||
        _P.y < sy0 + STEP_HEIGHT * 0.5) {
      _P.x = _stepSaveX; _P.y = _stepSaveY; _P.z = _stepSaveZ;
      return false;
    }
    var upY = _P.y;

    /* 2. horizontal move at the raised height */
    _P.x = sx0; _P.y = upY; _P.z = sz0;
    clearContacts();
    sweep(dx, 0, dz, radius, height);
    var got = ((_P.x - sx0) * dx + (_P.z - sz0) * dz) / wantLen;
    if (got <= curGot + 1e-4) {
      _P.x = _stepSaveX; _P.y = _stepSaveY; _P.z = _stepSaveZ;
      return false;
    }

    /* 3. drop back down onto the step */
    var t = rayWorld(_P.x, _P.y + radius, _P.z, 0, -1, 0,
      radius + STEP_HEIGHT + STEP_SKIN + 0.05);
    if (t < 0 || _rny < SLOPE_COS) {
      _P.x = _stepSaveX; _P.y = _stepSaveY; _P.z = _stepSaveZ;
      return false;
    }
    var landY = _P.y + radius - t;
    if (landY > sy0 + STEP_HEIGHT + 0.005 || landY < sy0 - 0.05) {
      _P.x = _stepSaveX; _P.y = _stepSaveY; _P.z = _stepSaveZ;
      return false;
    }
    _P.y = landY;
    clearContacts();
    depenetrate(radius, height, 3);
    if (_P.y < sy0 - 0.05) {
      _P.x = _stepSaveX; _P.y = _stepSaveY; _P.z = _stepSaveZ;
      return false;
    }
    C_ground = true;
    if (C_gny < _rny) { C_gnx = _rnx; C_gny = _rny; C_gnz = _rnz; }
    return true;
  }

  function moveCapsule(pos, vel, radius, height, dt, out) {
    out = ensureOut(out);
    if (!(dt > 0)) dt = 0;

    _P.x = pos.x; _P.y = pos.y; _P.z = pos.z;
    var vx = vel.x, vy = vel.y, vz = vel.z;
    var wasGrounded = !!out.groundedRaw;
    setupSpheres(radius, height);

    var grounded = false, hitWall = false, steppedUp = false, ceil = false;
    var gnx = 0, gny = 1, gnz = 0, gbest = -2;

    /* ---- settle first: never start a frame inside geometry ---------- */
    clearContacts();
    depenetrate(radius, height, DEPEN_ITERS);
    if (C_ground) { grounded = true; gbest = C_gny; gnx = C_gnx; gny = C_gny; gnz = C_gnz; }

    /* ---- vertical ---------------------------------------------------- */
    clearContacts();
    sweep(0, vy * dt, 0, radius, height);
    if (C_ground) {
      grounded = true;
      if (C_gny > gbest) { gbest = C_gny; gnx = C_gnx; gny = C_gny; gnz = C_gnz; }
      if (vy < 0) vy = 0;
    }
    if (C_ceil) { ceil = true; if (vy > 0) vy = 0; }
    if (C_wall) hitWall = true;

    /* ---- ground probe ------------------------------------------------ */
    if (!grounded && vy <= 0.01) {
      var tg = rayWorld(_P.x, _P.y + radius, _P.z, 0, -1, 0, radius + 0.05);
      if (tg >= 0 && _rny >= SLOPE_COS) {
        grounded = true;
        if (_rny > gbest) { gbest = _rny; gnx = _rnx; gny = _rny; gnz = _rnz; }
      }
    }

    /* ---- horizontal -------------------------------------------------- */
    var dx = vx * dt, dz = vz * dt;
    var wantLen = Math.sqrt(dx * dx + dz * dz);
    if (wantLen > 1e-7) {
      var sx0 = _P.x, sy0 = _P.y, sz0 = _P.z;
      clearContacts();
      sweep(dx, 0, dz, radius, height);
      if (C_ground) {
        grounded = true;
        if (C_gny > gbest) { gbest = C_gny; gnx = C_gnx; gny = C_gny; gnz = C_gnz; }
      }
      if (C_ceil) ceil = true;
      if (C_wall) hitWall = true;

      var got = ((_P.x - sx0) * dx + (_P.z - sz0) * dz) / wantLen;

      /* Step-up. Only worth trying if we were meaningfully blocked. */
      if (C_wall && grounded && got < wantLen * 0.85) {
        var savedWallN = WALLN;
        if (tryStepUp(sx0, sy0, sz0, dx, dz, wantLen, got, radius, height)) {
          steppedUp = true;
          hitWall = false;
          WALLN = 0;
          if (C_ground && C_gny > gbest) {
            gbest = C_gny; gnx = C_gnx; gny = C_gny; gnz = C_gnz;
          }
        } else {
          WALLN = savedWallN;
        }
      }

      /* Slide the velocity along whatever we are pressed against, twice,
       * so an inside corner resolves to the crease instead of trapping. */
      if (WALLN > 0) {
        for (var pass = 0; pass < 2; pass++) {
          for (var w = 0; w < WALLN; w++) {
            var wnx = WALL[w * 3], wnz = WALL[w * 3 + 2];
            var d = vx * wnx + vz * wnz;
            if (d < 0) { vx -= wnx * d; vz -= wnz * d; }
          }
        }
      }
    }

    /* ---- ground snap ------------------------------------------------- */
    if (!grounded && wasGrounded && vy <= 0.01) {
      var ts = rayWorld(_P.x, _P.y + radius, _P.z, 0, -1, 0, radius + SNAP_DIST);
      if (ts >= 0 && _rny >= SLOPE_COS) {
        _P.y = _P.y + radius - ts;
        grounded = true;
        gnx = _rnx; gny = _rny; gnz = _rnz;
        vy = 0;
        clearContacts();
        depenetrate(radius, height, 2);
      }
    }

    /* ---- coyote ------------------------------------------------------ */
    if (grounded) out._coyote = COYOTE;
    else out._coyote = Math.max(0, (out._coyote || 0) - dt);
    if (vy > 0.1) out._coyote = 0;

    out.pos.set(_P.x, _P.y, _P.z);
    out.vel.set(vx, vy, vz);
    out.groundNormal.set(gnx, gny, gnz);
    out.groundedRaw = grounded;
    out.grounded = grounded || out._coyote > 0;
    out.ceiling = ceil;
    out.hitWall = hitWall;
    out.steppedUp = steppedUp;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Public world                                                        */
  /* ------------------------------------------------------------------ */

  var _rcRes = null, _scRes = null;

  function makeRes() {
    return {
      hit: false, dist: 0, tag: null, id: -1,
      point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0)
    };
  }

  var world = {
    gravity: GRAVITY,
    slopeLimit: SLOPE_LIMIT_DEG,
    stepHeight: STEP_HEIGHT,

    reset: function () {
      bodies.length = 0;
      freeIds.length = 0;
      oversized.length = 0;
      stamp.length = 0;
      stampTick = 0;
      liveCount = 0;
      grid = new Map();
      tossed.length = 0;
      return world;
    },

    addBox: function (cx, cy, cz, hx, hy, hz, yaw, tag) {
      var id = freeIds.length ? freeIds.pop() : bodies.length;
      var b = bodies[id];
      if (!b) { b = makeBody(id, 0); bodies[id] = b; }
      b.type = 0; b.enabled = true; b.pl = null;
      b.cx = cx; b.cy = cy; b.cz = cz;
      b.hx = Math.abs(hx) || 0.001;
      b.hy = Math.abs(hy) || 0.001;
      b.hz = Math.abs(hz) || 0.001;
      b.yaw = yaw || 0;
      b.sin = Math.abs(b.yaw) < 1e-7 ? 0 : Math.sin(b.yaw);
      b.cos = Math.abs(b.yaw) < 1e-7 ? 1 : Math.cos(b.yaw);
      b.tag = tag || 'static';
      computeAABB(b);
      gridInsert(b);
      liveCount++;
      return id;
    },

    /* A wedge: the box, cut by a top plane that rises by `rise` metres
     * from local -Z to local +Z. Use it for stairs, kerbs and ramps. */
    addRamp: function (cx, cy, cz, hx, hy, hz, yaw, rise, tag) {
      var id = world.addBox(cx, cy, cz, hx, hy, hz, yaw, tag || 'ramp');
      var b = bodies[id];
      b.type = 1;
      b.rise = rise || 0;
      var k = b.hz > 1e-6 ? b.rise / (2 * b.hz) : 0;
      b.k = k;
      var inv = 1 / Math.sqrt(1 + k * k);
      if (!b.pl) b.pl = new Float64Array(24);
      var pl = b.pl;
      /* +X */ pl[0] = 1; pl[1] = 0; pl[2] = 0; pl[3] = b.hx;
      /* -X */ pl[4] = -1; pl[5] = 0; pl[6] = 0; pl[7] = b.hx;
      /* +Z */ pl[8] = 0; pl[9] = 0; pl[10] = 1; pl[11] = b.hz;
      /* -Z */ pl[12] = 0; pl[13] = 0; pl[14] = -1; pl[15] = b.hz;
      /* -Y */ pl[16] = 0; pl[17] = -1; pl[18] = 0; pl[19] = b.hy;
      /* top */ pl[20] = 0; pl[21] = inv; pl[22] = -k * inv;
      pl[23] = (b.hy - k * b.hz) * inv;
      return id;
    },

    removeBody: function (id) {
      var b = bodies[id];
      if (!b) return false;
      gridRemove(b);
      bodies[id] = null;
      freeIds.push(id);
      liveCount--;
      return true;
    },

    setEnabled: function (id, on) {
      var b = bodies[id];
      if (!b) return false;
      b.enabled = !!on;
      return true;
    },

    setTag: function (id, tag) {
      var b = bodies[id];
      if (b) b.tag = tag;
      return !!b;
    },

    getBody: function (id) { return bodies[id] || null; },

    count: function () { return liveCount; },

    /* Result object is reused between calls — copy anything you keep. */
    raycast: function (origin, dir, maxDist, mask) {
      if (!_rcRes) _rcRes = makeRes();
      var t = rayWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
        maxDist === undefined ? 100 : maxDist, mask);
      if (t < 0) return null;
      var l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
      _rcRes.hit = true;
      _rcRes.dist = t;
      _rcRes.tag = _rtag;
      _rcRes.id = _rid;
      _rcRes.point.set(origin.x + dir.x / l * t, origin.y + dir.y / l * t,
        origin.z + dir.z / l * t);
      _rcRes.normal.set(_rnx, _rny, _rnz);
      return _rcRes;
    },

    /* Conservative marched sphere cast — used for camera collision. */
    sphereCast: function (origin, dir, radius, maxDist, mask) {
      if (!_scRes) _scRes = makeRes();
      var l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      if (l < 1e-9) return null;
      var dx = dir.x / l, dy = dir.y / l, dz = dir.z / l;
      if (!(maxDist > 0)) maxDist = 10;

      var step = Math.max(0.04, radius * 0.6);
      var prev = 0, t = 0, found = -1;

      while (true) {
        if (deepestAt(origin.x + dx * t, origin.y + dy * t, origin.z + dz * t,
          radius, mask)) { found = t; break; }
        if (t >= maxDist) break;
        prev = t;
        t += step;
        if (t > maxDist) t = maxDist;
      }
      if (found < 0) return null;

      var lo = prev, hi = found;
      for (var i = 0; i < 7; i++) {
        var mid = (lo + hi) * 0.5;
        if (deepestAt(origin.x + dx * mid, origin.y + dy * mid,
          origin.z + dz * mid, radius, mask)) hi = mid;
        else lo = mid;
      }
      deepestAt(origin.x + dx * hi, origin.y + dy * hi, origin.z + dz * hi,
        radius, mask);

      _scRes.hit = true;
      _scRes.dist = lo;
      _scRes.tag = _dTag;
      _scRes.id = _dId;
      _scRes.normal.set(_dnx, _dny, _dnz);
      _scRes.point.set(
        origin.x + dx * hi - _dnx * radius,
        origin.y + dy * hi - _dny * radius,
        origin.z + dz * hi - _dnz * radius);
      return _scRes;
    },

    overlapSphere: function (center, radius, out) {
      out = out || [];
      out.length = 0;
      queryAABB(center.x - radius, center.y - radius, center.z - radius,
        center.x + radius, center.y + radius, center.z + radius);
      for (var c = 0; c < candN; c++) {
        var b = bodies[cand[c]];
        if (!b || !b.enabled) continue;
        if (sphereVsBody(b, center.x, center.y, center.z, radius)) out.push(b.id);
      }
      return out;
    },

    /* Is a capsule at `pos` free of geometry? Used for stand-up checks. */
    capsuleFree: function (px, py, pz, radius, height) {
      setupSpheres(radius, height);
      queryAABB(px - radius, py, pz - radius,
        px + radius, py + height, pz + radius);
      for (var c = 0; c < candN; c++) {
        var b = bodies[cand[c]];
        if (!b || !b.enabled) continue;
        for (var k = 0; k < S_n; k++) {
          if (sphereVsBody(b, px, py + S_lo + k * S_step, pz, radius)) {
            if (_depth > 0.005) return false;
          }
        }
      }
      return true;
    },

    moveCapsule: moveCapsule
  };

  /* Deepest overlapping body at a point. Writes _dnx.. / _dTag / _dId. */
  var _dnx = 0, _dny = 1, _dnz = 0, _dTag = null, _dId = -1;
  function deepestAt(x, y, z, r, mask) {
    queryAABB(x - r, y - r, z - r, x + r, y + r, z + r);
    var best = 0, hit = false;
    for (var c = 0; c < candN; c++) {
      var b = bodies[cand[c]];
      if (!b || !b.enabled) continue;
      if (!maskAllows(mask, b)) continue;
      if (!sphereVsBody(b, x, y, z, r)) continue;
      if (_depth > best) {
        best = _depth; hit = true;
        _dnx = _nx; _dny = _ny; _dnz = _nz; _dTag = b.tag; _dId = b.id;
      }
    }
    return hit;
  }

  /* ------------------------------------------------------------------ */
  /* Cosmetic prop toss (a dropped screw, a knocked-over mug)            */
  /* ------------------------------------------------------------------ */

  var tossed = [];
  var _lastStep = -1;

  SG.phys.tossBody = function (obj, vel, opts) {
    if (!obj) return null;
    opts = opts || {};
    var t = {
      obj: obj,
      vx: vel ? vel.x : 0, vy: vel ? vel.y : 0, vz: vel ? vel.z : 0,
      r: opts.radius === undefined ? 0.035 : opts.radius,
      rest: opts.restitution === undefined ? 0.3 : opts.restitution,
      fric: opts.friction === undefined ? 0.55 : opts.friction,
      wx: opts.spin === undefined ? util.rand(-7, 7) : opts.spin,
      wz: opts.spin === undefined ? util.rand(-7, 7) : opts.spin,
      age: 0,
      sleepAfter: opts.sleep === undefined ? 1.5 : opts.sleep,
      onSleep: opts.onSleep || null,
      onBounce: opts.onBounce || null,
      asleep: false
    };
    tossed.push(t);
    return t;
  };

  SG.phys.tossCount = function () { return tossed.length; };

  function stepTossed(dt) {
    for (var i = tossed.length - 1; i >= 0; i--) {
      var t = tossed[i];
      if (t.asleep) { tossed.splice(i, 1); continue; }
      t.age += dt;

      t.vy += GRAVITY * dt;
      var px = t.obj.position.x, py = t.obj.position.y, pz = t.obj.position.z;
      var nxp = px + t.vx * dt, nyp = py + t.vy * dt, nzp = pz + t.vz * dt;

      if (deepestAt(nxp, nyp, nzp, t.r, undefined)) {
        nxp += _dnx * _depth; nyp += _dny * _depth; nzp += _dnz * _depth;
        var vn = t.vx * _dnx + t.vy * _dny + t.vz * _dnz;
        if (vn < 0) {
          var speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy + t.vz * t.vz);
          t.vx -= _dnx * vn * (1 + t.rest);
          t.vy -= _dny * vn * (1 + t.rest);
          t.vz -= _dnz * vn * (1 + t.rest);
          var damp = 1 - t.fric * dt * 12;
          if (damp < 0) damp = 0;
          t.vx *= damp; t.vz *= damp;
          t.wx *= 0.6; t.wz *= 0.6;
          if (t.onBounce && speed > 0.6) SG.safe('toss.onBounce', function () {
            t.onBounce(speed);
          });
        }
      }

      t.obj.position.set(nxp, nyp, nzp);
      t.obj.rotation.x += t.wx * dt;
      t.obj.rotation.z += t.wz * dt;

      var s2 = t.vx * t.vx + t.vy * t.vy + t.vz * t.vz;
      if (t.age >= t.sleepAfter || (t.age > 0.25 && s2 < 0.0025)) {
        t.asleep = true;
        t.vx = t.vy = t.vz = 0;
        if (t.onSleep) SG.safe('toss.onSleep', function () { t.onSleep(t.obj); });
        tossed.splice(i, 1);
      }
    }
  }

  /* Called by the player each frame. Falls back to wall-clock so props
   * still settle while a cutscene is holding gameplay dt at zero. */
  SG.phys.step = function (dt) {
    if (!tossed.length) { _lastStep = util.now(); return; }
    var now = util.now();
    if (!(dt > 0)) {
      dt = _lastStep < 0 ? 1 / 60 : (now - _lastStep);
    }
    _lastStep = now;
    if (dt > 0.05) dt = 0.05;
    stepTossed(dt);
  };

  /* ------------------------------------------------------------------ */
  /* Module init                                                         */
  /* ------------------------------------------------------------------ */

  SG.phys.GRAVITY = GRAVITY;
  SG.phys.SLOPE_COS = SLOPE_COS;
  SG.phys.world = world;

  SG.phys.init = function () {
    world.reset();
    return SG.phys;
  };

  /* Safe to query before init(). */
  world.reset();

})(window.SG, window.THREE);

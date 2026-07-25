/* ============================================================================
 * STEVE THE PC REPAIR MAN — 30_physics.js
 * Character physics: vertical capsule vs axis-aligned static boxes.
 *
 * Design notes:
 *  - Levels are built from axis-aligned boxes, so we exploit that hard: a
 *    uniform XZ hash grid for broadphase and analytic circle-vs-rect /
 *    slab tests for narrowphase. No GJK, no tunnelling, no jitter.
 *  - Movement is resolved axis-separated (Y first, then XZ) which is the
 *    stable, well-behaved choice for a walking character on boxy geometry.
 *  - Step-up, slope-free stairs, head bonk, coyote time and ground snap are
 *    all handled here so the controller stays dumb.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};
  if (!window.THREE) { STV.warn('[physics] THREE missing'); }

  var SKIN = 0.015;          // penetration slop
  var MAX_STEP = 0.38;       // how tall a ledge we can walk straight up
  var GROUND_SNAP = 0.28;    // stick to the floor when walking down small drops
  var GRID = 4.0;            // broadphase cell size in metres

  /* ---------------------------------------------------------------------- */
  /* Static box                                                             */
  /* ---------------------------------------------------------------------- */
  function Box(cx, cy, cz, hx, hy, hz, tag) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.hx = hx; this.hy = hy; this.hz = hz;
    this.minX = cx - hx; this.maxX = cx + hx;
    this.minY = cy - hy; this.maxY = cy + hy;
    this.minZ = cz - hz; this.maxZ = cz + hz;
    this.tag = tag || '';
    this.enabled = true;
  }

  /* ---------------------------------------------------------------------- */
  /* World                                                                  */
  /* ---------------------------------------------------------------------- */
  function World() {
    this.boxes = [];
    this.cells = {};          // "ix,iz" -> [boxIndex,...]
    this.gravity = -19.6;     // 2g — game gravity reads better than 9.8
    this._tmp = [];
  }

  World.prototype.clear = function () {
    this.boxes.length = 0;
    this.cells = {};
  };

  World.prototype.addBox = function (cx, cy, cz, hx, hy, hz, tag) {
    var b = new Box(cx, cy, cz, hx, hy, hz, tag);
    var idx = this.boxes.length;
    this.boxes.push(b);
    var ix0 = Math.floor(b.minX / GRID), ix1 = Math.floor(b.maxX / GRID);
    var iz0 = Math.floor(b.minZ / GRID), iz1 = Math.floor(b.maxZ / GRID);
    for (var ix = ix0; ix <= ix1; ix++) {
      for (var iz = iz0; iz <= iz1; iz++) {
        var k = ix + ',' + iz;
        (this.cells[k] || (this.cells[k] = [])).push(idx);
      }
    }
    return b;
  };

  /* Accepts the contract's collider shape: {type:'box', c:Vector3, h:Vector3} */
  World.prototype.addColliders = function (list, tag) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c) continue;
      if (c.type && c.type !== 'box') continue;
      var cc = c.c, hh = c.h;
      if (!cc || !hh) continue;
      if (hh.x <= 0 || hh.y <= 0 || hh.z <= 0) continue;
      this.addBox(cc.x, cc.y, cc.z, hh.x, hh.y, hh.z, c.tag || tag);
    }
  };

  /* Bake a prop group's local colliders into world space.
     Only yaw rotation is supported (that is all the levels use); for other
     rotations we fall back to the world-space AABB of the rotated box. */
  World.prototype.addPropColliders = function (group, tag) {
    if (!group || !group.userData || !group.userData.colliders) return;
    var list = group.userData.colliders;
    group.updateMatrixWorld(true);
    var m = group.matrixWorld;
    var pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    var e = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    var yaw = e.y;
    var ca = Math.cos(yaw), sa = Math.sin(yaw);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !c.c || !c.h) continue;
      var lx = c.c.x * scl.x, ly = c.c.y * scl.y, lz = c.c.z * scl.z;
      var wx = pos.x + lx * ca + lz * sa;
      var wz = pos.z - lx * sa + lz * ca;
      var wy = pos.y + ly;
      var hx = c.h.x * scl.x, hy = c.h.y * scl.y, hz = c.h.z * scl.z;
      // yaw-aligned AABB expansion
      var ex = Math.abs(hx * ca) + Math.abs(hz * sa);
      var ez = Math.abs(hx * sa) + Math.abs(hz * ca);
      if (ex <= 0 || hy <= 0 || ez <= 0) continue;
      this.addBox(wx, wy, wz, ex, hy, ez, c.tag || tag || (group.name || ''));
    }
  };

  /* broadphase: gather box indices overlapping an XZ rect */
  World.prototype.query = function (minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    var ix0 = Math.floor(minX / GRID), ix1 = Math.floor(maxX / GRID);
    var iz0 = Math.floor(minZ / GRID), iz1 = Math.floor(maxZ / GRID);
    var seen = World._seen || (World._seen = {});
    var stamp = (World._stamp = (World._stamp || 0) + 1);
    for (var ix = ix0; ix <= ix1; ix++) {
      for (var iz = iz0; iz <= iz1; iz++) {
        var arr = this.cells[ix + ',' + iz];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var bi = arr[i];
          if (seen[bi] === stamp) continue;
          seen[bi] = stamp;
          var b = this.boxes[bi];
          if (b.enabled) out.push(b);
        }
      }
    }
    return out;
  };

  /* ----------------------------------------------------------------------
   * moveCharacter
   *   body = { pos:Vector3 (feet), vel:Vector3, radius, height,
   *            grounded:bool, groundY, headHit:bool, lastNormal:Vector3 }
   * Returns the same body, mutated.
   * -------------------------------------------------------------------- */
  World.prototype.moveCharacter = function (body, dt) {
    if (dt <= 0) return body;
    if (dt > 0.05) dt = 0.05;                    // clamp: never tunnel on a hitch

    var pos = body.pos, vel = body.vel;
    var r = body.radius, h = body.height;
    var cand = this._tmp;

    body.headHit = false;
    var wasGrounded = body.grounded;
    body.grounded = false;

    /* ---------------- vertical ---------------- */
    vel.y += this.gravity * dt;
    if (vel.y < -55) vel.y = -55;
    var dy = vel.y * dt;
    var newY = pos.y + dy;

    this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, cand);

    var i, b;
    if (dy <= 0) {
      // falling: find the highest surface we cross
      var land = -Infinity, landed = false;
      for (i = 0; i < cand.length; i++) {
        b = cand[i];
        if (!circleRectOverlap(pos.x, pos.z, r, b)) continue;
        var top = b.maxY;
        if (pos.y + SKIN >= top && newY <= top && top > land) { land = top; landed = true; }
      }
      // ground snap: keep contact walking down a small step
      if (!landed && wasGrounded && vel.y < 0) {
        for (i = 0; i < cand.length; i++) {
          b = cand[i];
          if (!circleRectOverlap(pos.x, pos.z, r, b)) continue;
          var t2 = b.maxY;
          if (t2 <= pos.y + SKIN && t2 >= pos.y - GROUND_SNAP && t2 > land) { land = t2; landed = true; }
        }
      }
      if (landed) {
        newY = land;
        vel.y = 0;
        body.grounded = true;
        body.groundY = land;
      }
    } else {
      // rising: bonk the lowest ceiling we cross
      var ceil = Infinity, bonk = false;
      for (i = 0; i < cand.length; i++) {
        b = cand[i];
        if (!circleRectOverlap(pos.x, pos.z, r, b)) continue;
        var bot = b.minY;
        if (pos.y + h <= bot + SKIN && newY + h >= bot && bot < ceil) { ceil = bot; bonk = true; }
      }
      if (bonk) { newY = ceil - h - SKIN; vel.y = 0; body.headHit = true; }
    }
    pos.y = newY;

    /* ---------------- horizontal ---------------- */
    var dx = vel.x * dt, dz = vel.z * dt;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var steps = dist > r * 0.5 ? Math.ceil(dist / (r * 0.5)) : 1;
    if (steps > 8) steps = 8;
    var sx = dx / steps, sz = dz / steps;

    for (var s = 0; s < steps; s++) {
      pos.x += sx;
      pos.z += sz;
      // 3 relaxation passes so corners resolve cleanly
      for (var pass = 0; pass < 3; pass++) {
        var moved = false;
        this.query(pos.x - r - 0.6, pos.z - r - 0.6, pos.x + r + 0.6, pos.z + r + 0.6, cand);
        for (i = 0; i < cand.length; i++) {
          b = cand[i];
          // vertical overlap with the body slab?
          var feet = pos.y, head = pos.y + h;
          if (b.maxY <= feet + SKIN) continue;         // below our feet
          if (b.minY >= head - SKIN) continue;         // above our head

          // step-up: a low ledge we can just walk onto
          var ledge = b.maxY - feet;
          if (body.grounded && ledge > 0 && ledge <= MAX_STEP) {
            if (this.hasHeadroom(pos.x, b.maxY, pos.z, r, h)) {
              pos.y = b.maxY;
              body.groundY = b.maxY;
              continue;
            }
          }

          var pen = circleRectPush(pos.x, pos.z, r, b);
          if (pen) {
            pos.x += pen.nx * (pen.depth + SKIN);
            pos.z += pen.nz * (pen.depth + SKIN);
            // kill velocity into the surface (slide)
            var vn = vel.x * pen.nx + vel.z * pen.nz;
            if (vn < 0) { vel.x -= pen.nx * vn; vel.z -= pen.nz * vn; }
            if (body.lastNormal) body.lastNormal.set(pen.nx, 0, pen.nz);
            moved = true;
          }
        }
        if (!moved) break;
      }
    }

    /* re-check ground after horizontal (we may have stepped up) */
    if (!body.grounded) {
      this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, cand);
      for (i = 0; i < cand.length; i++) {
        b = cand[i];
        if (!circleRectOverlap(pos.x, pos.z, r, b)) continue;
        if (Math.abs(b.maxY - pos.y) < SKIN * 2) {
          body.grounded = true; body.groundY = b.maxY; if (vel.y < 0) vel.y = 0;
          break;
        }
      }
    }

    return body;
  };

  World.prototype.hasHeadroom = function (x, y, z, r, h) {
    var cand = [];
    this.query(x - r, z - r, x + r, z + r, cand);
    for (var i = 0; i < cand.length; i++) {
      var b = cand[i];
      if (!circleRectOverlap(x, z, r, b)) continue;
      if (b.minY < y + h - SKIN && b.maxY > y + SKIN) return false;
    }
    return true;
  };

  /* Is a capsule position free? Used for spawn validation and AI. */
  World.prototype.isFree = function (x, y, z, r, h) {
    var cand = [];
    this.query(x - r, z - r, x + r, z + r, cand);
    for (var i = 0; i < cand.length; i++) {
      var b = cand[i];
      if (b.maxY <= y + SKIN || b.minY >= y + h - SKIN) continue;
      if (circleRectOverlap(x, z, r, b)) return false;
    }
    return true;
  };

  /* Drop a point to the floor. Returns floor Y or null. */
  World.prototype.floorAt = function (x, z, fromY, r) {
    var cand = [];
    r = r || 0.05;
    this.query(x - r, z - r, x + r, z + r, cand);
    var best = null;
    for (var i = 0; i < cand.length; i++) {
      var b = cand[i];
      if (!circleRectOverlap(x, z, r, b)) continue;
      if (b.maxY <= fromY + 0.05 && (best === null || b.maxY > best)) best = b.maxY;
    }
    return best;
  };

  /* ----------------------------------------------------------------------
   * Raycast vs static boxes (slab method). Used for interaction and for AI
   * line-of-sight. Returns null or {dist, point, normal, box}.
   * -------------------------------------------------------------------- */
  World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist) {
    maxDist = maxDist || 50;
    // march the grid rather than testing everything
    var cand = [];
    var ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    this.query(Math.min(ox, ex) - 0.5, Math.min(oz, ez) - 0.5,
               Math.max(ox, ex) + 0.5, Math.max(oz, ez) + 0.5, cand);
    var bestT = maxDist, bestB = null, bestAxis = -1, bestSign = 1;
    var idx = 1 / (dx || 1e-9), idy = 1 / (dy || 1e-9), idz = 1 / (dz || 1e-9);
    for (var i = 0; i < cand.length; i++) {
      var b = cand[i];
      var t1 = (b.minX - ox) * idx, t2 = (b.maxX - ox) * idx;
      var t3 = (b.minY - oy) * idy, t4 = (b.maxY - oy) * idy;
      var t5 = (b.minZ - oz) * idz, t6 = (b.maxZ - oz) * idz;
      var ax = 0, sg = 1;
      var tmin = Math.min(t1, t2), tmaxX = Math.max(t1, t2);
      var tminY = Math.min(t3, t4), tmaxY = Math.max(t3, t4);
      var tminZ = Math.min(t5, t6), tmaxZ = Math.max(t5, t6);
      if (tminY > tmin) { tmin = tminY; ax = 1; }
      if (tminZ > tmin) { tmin = tminZ; ax = 2; }
      var tmax = Math.min(tmaxX, Math.min(tmaxY, tmaxZ));
      if (tmax < 0 || tmin > tmax) continue;
      var t = tmin >= 0 ? tmin : tmax;
      if (t < 0 || t >= bestT) continue;
      if (ax === 0) sg = dx > 0 ? -1 : 1;
      else if (ax === 1) sg = dy > 0 ? -1 : 1;
      else sg = dz > 0 ? -1 : 1;
      bestT = t; bestB = b; bestAxis = ax; bestSign = sg;
    }
    if (!bestB) return null;
    return {
      dist: bestT,
      point: new THREE.Vector3(ox + dx * bestT, oy + dy * bestT, oz + dz * bestT),
      normal: new THREE.Vector3(bestAxis === 0 ? bestSign : 0,
                                bestAxis === 1 ? bestSign : 0,
                                bestAxis === 2 ? bestSign : 0),
      box: bestB
    };
  };

  /* Clear line of sight between two world points? (AI vision) */
  var _los = new THREE.Vector3();
  World.prototype.lineOfSight = function (a, b) {
    _los.subVectors(b, a);
    var d = _los.length();
    if (d < 0.001) return true;
    _los.multiplyScalar(1 / d);
    var hit = this.raycast(a.x, a.y, a.z, _los.x, _los.y, _los.z, d - 0.05);
    return !hit;
  };

  /* ---------------------------------------------------------------------- */
  /* narrowphase helpers                                                    */
  /* ---------------------------------------------------------------------- */
  function circleRectOverlap(cx, cz, r, b) {
    var qx = cx < b.minX ? b.minX : (cx > b.maxX ? b.maxX : cx);
    var qz = cz < b.minZ ? b.minZ : (cz > b.maxZ ? b.maxZ : cz);
    var ddx = cx - qx, ddz = cz - qz;
    return (ddx * ddx + ddz * ddz) < r * r;
  }

  /* Minimum translation to push a circle out of a rect (XZ). */
  function circleRectPush(cx, cz, r, b) {
    var qx = cx < b.minX ? b.minX : (cx > b.maxX ? b.maxX : cx);
    var qz = cz < b.minZ ? b.minZ : (cz > b.maxZ ? b.maxZ : cz);
    var ddx = cx - qx, ddz = cz - qz;
    var d2 = ddx * ddx + ddz * ddz;

    if (d2 > r * r) return null;

    if (d2 > 1e-8) {
      // outside the rect: push along the corner/edge normal
      var d = Math.sqrt(d2);
      return { nx: ddx / d, nz: ddz / d, depth: r - d };
    }
    // centre is inside the rect: eject along the shallowest face
    var dl = cx - b.minX, dr = b.maxX - cx;
    var db = cz - b.minZ, df = b.maxZ - cz;
    var m = Math.min(Math.min(dl, dr), Math.min(db, df));
    if (m === dl) return { nx: -1, nz: 0, depth: dl + r };
    if (m === dr) return { nx: 1, nz: 0, depth: dr + r };
    if (m === db) return { nx: 0, nz: -1, depth: db + r };
    return { nx: 0, nz: 1, depth: df + r };
  }

  /* ---------------------------------------------------------------------- */
  /* Debug visualisation                                                    */
  /* ---------------------------------------------------------------------- */
  World.prototype.debugMesh = function () {
    var g = new THREE.Group();
    g.name = '__physdebug';
    var mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35 });
    var geo = new THREE.BoxGeometry(1, 1, 1);
    for (var i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i];
      var m = new THREE.Mesh(geo, mat);
      m.position.set(b.cx, b.cy, b.cz);
      m.scale.set(b.hx * 2, b.hy * 2, b.hz * 2);
      g.add(m);
    }
    return g;
  };

  STV.Physics = {
    World: World,
    Box: Box,
    create: function () { return new World(); },
    MAX_STEP: MAX_STEP
  };

  STV.log('physics loaded');
})();

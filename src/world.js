/* =====================================================================
   WORLD  —  sparse-free flat voxel volume + the global build API
   ---------------------------------------------------------------------
   World volume:   X : -96 .. 95     (192 wide)
                   Z : -96 .. 95     (192 deep)
                   Y :   0 .. 111    (112 tall)
   Plaza ground surface sits at Y = 32.
   ===================================================================== */

(function (root) {
  'use strict';

  const Blocks = root.MCBlocks || (typeof require !== 'undefined' ? require('./blocks.js') : null);
  const B = Blocks.B;
  const BLOCKS = Blocks.BLOCKS;

  const X0 = -96, Z0 = -96, Y0 = 0;
  const SX = 192, SY = 112, SZ = 192;
  const AREA = SX * SZ;

  const ids = new Uint16Array(SX * SY * SZ);
  const states = new Uint8Array(SX * SY * SZ);

  const warnings = [];
  let outOfBounds = 0;

  function idx(x, y, z) {
    return (y - Y0) * AREA + (z - Z0) * SX + (x - X0);
  }
  function inBounds(x, y, z) {
    return x >= X0 && x < X0 + SX && y >= Y0 && y < Y0 + SY && z >= Z0 && z < Z0 + SZ;
  }

  /* ------------------------------------------------------------------ */
  /* core accessors                                                      */
  /* ------------------------------------------------------------------ */
  function set(x, y, z, id, state) {
    x |= 0; y |= 0; z |= 0;
    if (!inBounds(x, y, z)) { outOfBounds++; return false; }
    if (id === undefined || id === null) return false;
    const i = idx(x, y, z);
    ids[i] = id;
    states[i] = state ? (state & 15) : 0;
    return true;
  }
  function get(x, y, z) {
    if (!inBounds(x, y, z)) return 0;
    return ids[idx(x, y, z)];
  }
  function getState(x, y, z) {
    if (!inBounds(x, y, z)) return 0;
    return states[idx(x, y, z)];
  }
  function isAir(x, y, z) { return get(x, y, z) === 0; }
  function isSolid(x, y, z) {
    const d = BLOCKS[get(x, y, z)];
    return d ? d.opaque : false;
  }
  /** place only when target is currently air */
  function setIfAir(x, y, z, id, state) {
    if (isAir(x, y, z)) return set(x, y, z, id, state);
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* deterministic RNG (mulberry32) — reseeded per builder               */
  /* ------------------------------------------------------------------ */
  let _seed = 0x9e3779b9;
  function seed(s) { _seed = (s >>> 0) || 1; }
  function rand() {
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randi(n) { return Math.floor(rand() * n); }
  function randRange(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }
  function chance(p) { return rand() < p; }

  /* ------------------------------------------------------------------ */
  /* volume helpers                                                      */
  /* ------------------------------------------------------------------ */
  function ord(a, b) { return a <= b ? [a, b] : [b, a]; }

  function fill(x0, y0, z0, x1, y1, z1, id, state) {
    const [ax, bx] = ord(x0, x1), [ay, by] = ord(y0, y1), [az, bz] = ord(z0, z1);
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) set(x, y, z, id, state);
  }
  function fillAir(x0, y0, z0, x1, y1, z1, id, state) {
    const [ax, bx] = ord(x0, x1), [ay, by] = ord(y0, y1), [az, bz] = ord(z0, z1);
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) if (isAir(x, y, z)) set(x, y, z, id, state);
  }
  function clear(x0, y0, z0, x1, y1, z1) { fill(x0, y0, z0, x1, y1, z1, 0, 0); }

  /** hollow rectangular shell (all 6 sides) */
  function box(x0, y0, z0, x1, y1, z1, id, state) {
    const [ax, bx] = ord(x0, x1), [ay, by] = ord(y0, y1), [az, bz] = ord(z0, z1);
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++)
          if (x === ax || x === bx || y === ay || y === by || z === az || z === bz)
            set(x, y, z, id, state);
  }
  /** the four vertical walls only (no floor / ceiling) */
  function walls(x0, y0, z0, x1, y1, z1, id, state) {
    const [ax, bx] = ord(x0, x1), [ay, by] = ord(y0, y1), [az, bz] = ord(z0, z1);
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++)
          if (x === ax || x === bx || z === az || z === bz) set(x, y, z, id, state);
  }
  /** solid horizontal slab of blocks at height y */
  function floor(x0, z0, x1, z1, y, id, state) { fill(x0, y, z0, x1, y, z1, id, state); }
  /** outline of a rectangle at height y */
  function rect(x0, z0, x1, z1, y, id, state) {
    const [ax, bx] = ord(x0, x1), [az, bz] = ord(z0, z1);
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++)
        if (x === ax || x === bx || z === az || z === bz) set(x, y, z, id, state);
  }
  /** vertical pillar */
  function column(x, y0, y1, z, id, state) { fill(x, y0, z, x, y1, z, id, state); }

  function line3(x0, y0, z0, x1, y1, z1, id, state) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (n === 0) { set(x0, y0, z0, id, state); return; }
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      set(Math.round(x0 + dx * t), Math.round(y0 + dy * t), Math.round(z0 + dz * t), id, state);
    }
  }

  function cyl(cx, cz, r, y0, y1, id, state, hollow) {
    const [ay, by] = ord(y0, y1);
    const r2 = r * r, ri2 = (r - 1) * (r - 1);
    for (let y = ay; y <= by; y++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = dx * dx + dz * dz;
          if (d <= r2 && (!hollow || d > ri2)) set(cx + dx, y, cz + dz, id, state);
        }
  }
  function disc(cx, y, cz, r, id, state) { cyl(cx, cz, r, y, y, id, state, false); }
  function ring(cx, y, cz, r, id, state) { cyl(cx, cz, r, y, y, id, state, true); }

  function ellipsoid(cx, cy, cz, rx, ry, rz, id, state, hollow) {
    for (let y = -ry; y <= ry; y++)
      for (let z = -rz; z <= rz; z++)
        for (let x = -rx; x <= rx; x++) {
          const d = (x * x) / (rx * rx + 1e-6) + (y * y) / (ry * ry + 1e-6) + (z * z) / (rz * rz + 1e-6);
          if (d <= 1.0 && (!hollow || d > 0.55)) set(cx + x, cy + y, cz + z, id, state);
        }
  }
  function sphere(cx, cy, cz, r, id, state) { ellipsoid(cx, cy, cz, r, r, r, id, state, false); }

  /* ------------------------------------------------------------------ */
  /* oriented placement helpers                                          */
  /* ------------------------------------------------------------------ */
  const DIRS = { n: 0, north: 0, e: 1, east: 1, s: 2, south: 2, w: 3, west: 3 };
  function dirCode(d) {
    if (typeof d === 'number') return d & 3;
    const v = DIRS[String(d).toLowerCase()];
    return v === undefined ? 0 : v;
  }

  /** stairs: dir = the direction the *tall back* faces away from (n/e/s/w); top=true for upside-down */
  function stair(x, y, z, id, dir, top) {
    return set(x, y, z, id, dirCode(dir) | (top ? 4 : 0));
  }
  /** slab: half = 'b'(bottom, default) | 't'(top) */
  function slab(x, y, z, id, half) {
    return set(x, y, z, id, (half === 't' || half === 'top' || half === true) ? 1 : 0);
  }
  /** log / pillar axis: 'y'(default) | 'x' | 'z' */
  function logAxis(x, y, z, id, axis) {
    const a = axis === 'x' ? 1 : axis === 'z' ? 2 : 0;
    return set(x, y, z, id, a);
  }
  /** anything that hangs on / points at a wall: torch, ladder, sign, frame, vine, banner */
  function face(x, y, z, id, dir) { return set(x, y, z, id, dirCode(dir)); }

  /** trapdoor: dir = hinge side, opts {top:bool, open:bool} */
  function trapdoor(x, y, z, id, dir, opts) {
    opts = opts || {};
    return set(x, y, z, id, dirCode(dir) | (opts.open ? 4 : 0) | (opts.top ? 8 : 0));
  }
  /** full 2-block-tall door, y = bottom block */
  function door(x, y, z, id, dir) {
    set(x, y, z, id, dirCode(dir));
    set(x, y + 1, z, id, dirCode(dir) | 8);
  }
  /** 2-block bed. dir points from foot -> head */
  function bed(x, y, z, id, dir) {
    const d = dirCode(dir);
    const dx = d === 1 ? 1 : d === 3 ? -1 : 0;
    const dz = d === 2 ? 1 : d === 0 ? -1 : 0;
    set(x, y, z, id, d);              // foot
    set(x + dx, y, z + dz, id, d | 4); // head
  }

  /* ------------------------------------------------------------------ */
  /* scatter / decoration helpers                                        */
  /* ------------------------------------------------------------------ */
  /** randomly sprinkle blocks on top of the highest solid block in a rect */
  function scatter(x0, z0, x1, z1, yTop, list, density) {
    const [ax, bx] = ord(x0, x1), [az, bz] = ord(z0, z1);
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++) {
        if (rand() >= density) continue;
        for (let y = yTop; y > yTop - 8; y--) {
          if (isSolid(x, y, z)) {
            if (isAir(x, y + 1, z)) set(x, y + 1, z, pick(list));
            break;
          }
        }
      }
  }
  /** highest solid block y at column, or -1 */
  function heightAt(x, z, from) {
    for (let y = (from === undefined ? Y0 + SY - 1 : from); y >= Y0; y--) if (isSolid(x, y, z)) return y;
    return -1;
  }

  /* ------------------------------------------------------------------ */
  /* markers: particle emitters + camera points of interest              */
  /* ------------------------------------------------------------------ */
  const markers = [];   // {type, x, y, z, ...opts}
  const pois = [];      // {name, x, y, z, yaw, pitch, label}

  /** type: 'smoke' | 'lavaDrip' | 'firefly' | 'spark' | 'splash' | 'bee' | 'ambient' */
  function marker(type, x, y, z, opts) {
    markers.push(Object.assign({ type, x, y, z }, opts || {}));
  }
  /** register a camera stop for the cinematic tour + jump menu */
  function poi(label, x, y, z, yaw, pitch) {
    pois.push({ label, x, y, z, yaw: yaw || 0, pitch: pitch || 0 });
  }

  /* ------------------------------------------------------------------ */
  /* stats                                                               */
  /* ------------------------------------------------------------------ */
  function countNonAir() {
    let n = 0;
    for (let i = 0; i < ids.length; i++) if (ids[i]) n++;
    return n;
  }

  const World = {
    X0, Z0, Y0, SX, SY, SZ, AREA,
    ids, states, idx, inBounds,
    set, get, getState, isAir, isSolid, setIfAir,
    seed, rand, randi, randRange, pick, chance,
    fill, fillAir, clear, box, walls, floor, rect, column, line3,
    cyl, disc, ring, ellipsoid, sphere,
    stair, slab, logAxis, face, trapdoor, door, bed,
    scatter, heightAt, marker, poi,
    markers, pois, warnings, countNonAir,
    get outOfBounds() { return outOfBounds; },
    resetOOB() { outOfBounds = 0; },
  };

  /* Expose the whole API as globals so builder files read like a DSL. */
  const GLOBALS = ['set', 'get', 'getState', 'isAir', 'isSolid', 'setIfAir',
    'rand', 'randi', 'randRange', 'pick', 'chance',
    'fill', 'fillAir', 'clear', 'box', 'walls', 'floor', 'rect', 'column', 'line3',
    'cyl', 'disc', 'ring', 'ellipsoid', 'sphere',
    'stair', 'slab', 'logAxis', 'face', 'trapdoor', 'door', 'bed',
    'scatter', 'heightAt', 'marker', 'poi'];
  for (const k of GLOBALS) root[k] = World[k];
  root.World = World;
  root.B = B;

  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);

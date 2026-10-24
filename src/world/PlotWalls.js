// Garden walls and fences in front of detached houses near the route. In the villa districts of
// line 64 (Драгалевци, Бояна, Киноцентър, Кръстова вада) almost every plot is closed to the street
// by a plastered wall, a stone plinth with a metal railing, a panel fence or a hedge, with a
// pedestrian gate and often a driveway gate; OSM maps only a few of them. This layer adds one
// frontage per house (plus short side walls) on the street side, from the real house footprint
// and the nearest street, and keeps clear of carriageways, other buildings, mapped fences, the
// bus's swept path and bus stops. Walls step with the terrain. Deterministic per building.
import * as THREE from 'three';

const STREETS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'trunk']);
const STEP = 2.0; // sampling along the frontage (m); one wall piece per step follows the slope

function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  const S = THREE.MeshStandardMaterial;
  // vertical-bar railing (1 m wide tile): forged bars, top and bottom rails
  const railing = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1d2022';
    g.fillRect(0, 4, w, 7); g.fillRect(0, h - 12, w, 7);
    for (let x = 4; x < w; x += 16) g.fillRect(x, 4, 4, h - 8);
    for (let x = 12; x < w; x += 32) { g.beginPath(); g.arc(x, 18, 4, 0, Math.PI * 2); g.fill(); }
  });
  // vertical metal slat panels (1 m tile)
  const panel = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) { g.fillStyle = x % 24 ? '#55605a' : '#4b5550'; g.fillRect(x + 1, 2, 9, h - 4); }
    g.fillStyle = '#3a423e'; g.fillRect(0, 20, w, 3); g.fillRect(0, h - 24, w, 3);
  });
  // rough stone plinth (2 m tile)
  const stone = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#8f877a'; g.fillRect(0, 0, w, h);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < h; y += 16) {
      for (let x = -(y % 32); x < w; x += 22 + r() * 18) {
        const c = 110 + r() * 50;
        g.fillStyle = `rgb(${c},${c - 6},${c - 16})`;
        g.fillRect(x + 1, y + 1, 20 + r() * 14, 14);
      }
    }
  });
  // closed metal gate (dark, with frame)
  const gate = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#26292b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#34383b'; for (let x = 6; x < w; x += 10) g.fillRect(x, 6, 6, h - 12);
    g.strokeStyle = '#121416'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }, false);
  MATS = {
    plaster: new S({ vertexColors: true, roughness: 0.92 }),
    hedge: new S({ vertexColors: true, roughness: 1 }),
    stone: new S({ map: stone, roughness: 0.95 }),
    railing: new S({ map: railing, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }),
    panel: new S({ map: panel, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }),
    gate: new S({ map: gate, roughness: 0.55, metalness: 0.5 }),
  };
  return MATS;
}

/** Geometry buffers per material for one tile. */
class Bucket {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; }

  quad(a, b, c, d, n, uv, col) {
    for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]]) {
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]);
      this.col.push(col[0], col[1], col[2]);
    }
  }

  /** A wall piece from (ax, az) to (bx, bz): bottom ya/yb, height h, thickness th; u per metre. */
  wall(ax, az, bx, bz, ya, yb, h, th, col, uPerM = 1, top = true) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * th / 2, nz = dx / L * th / 2;
    const u1 = L * uPerM;
    const P = (x, y, z) => [x, y, z];
    const ya0 = ya - 0.3, yb0 = yb - 0.3; // sink into sloping ground
    const ta = ya + h, tb = yb + h;
    const n1 = [-dz / L, 0, dx / L], n2 = [dz / L, 0, -dx / L];
    const uv = [[0, 0], [u1, 0], [u1, 1], [0, 1]];
    this.quad(P(ax + nx, ya0, az + nz), P(bx + nx, yb0, bz + nz), P(bx + nx, tb, bz + nz), P(ax + nx, ta, az + nz), n1, uv, col);
    this.quad(P(bx - nx, yb0, bz - nz), P(ax - nx, ya0, az - nz), P(ax - nx, ta, az - nz), P(bx - nx, tb, bz - nz), n2, uv, col);
    if (top) this.quad(P(ax + nx, ta, az + nz), P(bx + nx, tb, bz + nz), P(bx - nx, tb, bz - nz), P(ax - nx, ta, az - nz), [0, 1, 0], [[0, 0], [u1, 0], [u1, 1], [0, 1]], col);
  }

  /** End cap (pillar face) at a run end. */
  cap(x, z, dx, dz, y, h, th, col) {
    const L = Math.hypot(dx, dz) || 1, nx = -dz / L * th / 2, nz = dx / L * th / 2;
    this.quad([x - nx, y - 0.3, z - nz], [x + nx, y - 0.3, z + nz], [x + nx, y + h, z + nz], [x - nx, y + h, z - nz], [dx / L, 0, dz / L], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  }

  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const PLASTER = [[0.93, 0.9, 0.84], [0.95, 0.93, 0.88], [0.86, 0.78, 0.62], [0.9, 0.84, 0.74], [0.82, 0.8, 0.76], [0.96, 0.88, 0.74], [0.78, 0.74, 0.66]];
const COPING = [[0.55, 0.28, 0.2], [0.42, 0.42, 0.42], [0.62, 0.6, 0.56]];

/**
 * @returns {THREE.Group[]} groups named `plotwalls:tx,tz` (one per 256 m tile)
 */
export function buildPlotWalls({ world, route, sweep, quality }) {
  const d = world.data, roads = world.roads, hf = world.hf;
  const y = (x, z) => hf.heightAt(x, z);
  const M = materials();
  const paths = ['A', 'B'].map((k) => route.direction(k).path);
  const routeD = (x, z) => Math.min(...paths.map((p) => p.nearest(x, z).d));
  const poles = Object.values(route.dirs).flatMap((dir) => dir.stops.map((s) => s.pole));
  // mapped fences and walls: a plot that already has one keeps it
  const mapped = new Map();
  const cell = 8;
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const k of ['fence', 'wall', 'hedge', 'retaining_wall']) {
    for (const p of (d.lines && d.lines[k]) || []) for (let i = 0; i < p.length; i += 2) mapped.set(key(p[i], p[i + 1]), true);
  }
  const nearMapped = (x, z) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (mapped.has(`${Math.floor(x / cell) + a},${Math.floor(z / cell) + b}`)) return true;
    return false;
  };
  // detached-house districts only: few tall buildings around (blocks of flats, offices)
  const dens = new Map();
  const cen = d.buildings.map((b) => {
    const n = b.pts.length / 2;
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) { x += b.pts[2 * i]; z += b.pts[2 * i + 1]; }
    x /= n; z /= n;
    const k = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
    if (!b.part && b.h > 14) dens.set(k, (dens.get(k) || 0) + 1);
    return [x, z];
  });
  const density = (x, z) => {
    let s = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += dens.get(`${Math.floor(x / 40) + a},${Math.floor(z / 40) + b}`) || 0;
    return s;
  };
  const range = quality === 'balanced' ? 70 : 110;
  const tiles = new Map();
  const bucket = (x, z, mat) => {
    const k = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    let t = tiles.get(k);
    if (!t) tiles.set(k, (t = {}));
    return t[mat] || (t[mat] = new Bucket());
  };
  let plots = 0;
  const why = {}; // skip reasons (debug: world.plotWallStats)
  const skip = (k) => { why[k] = (why[k] || 0) + 1; };
  const gardens = []; // [x, z, scale] garden trees for Vegetation
  const clear = (x, z) => !roads.onRoad(x, z, 0.4) && world.bgrid.pointInAny(x, z) < 0 && !(sweep && sweep.hits(x, z, 0.8)) && !poles.some((p) => Math.hypot(p[0] - x, p[1] - z) < 16);

  d.buildings.forEach((b, bi) => {
    if (b.part || b.minH > 0 || b.h > 12.5 || b.pts.length < 6) return;
    let area = 0;
    for (let i = 0, n = b.pts.length; i < n; i += 2) {
      const j = (i + 2) % n;
      area += b.pts[i] * b.pts[j + 1] - b.pts[j] * b.pts[i + 1];
    }
    area = Math.abs(area) / 2;
    if (area < 35 || area > 520) return;
    const [cx, cz] = cen[bi];
    if (routeD(cx, cz) > range) return;
    if (density(cx, cz) > 5) return skip('dense'); // blocks of flats or a dense centre around: no garden plots
    const q = roads.query(cx, cz, 38, (p) => STREETS.has(p.cls) && !p.driveway && !p.bridge);
    if (!q) return skip('no street');
    const p = q.piece, ax = p.pts[q.i], az = p.pts[q.i + 1];
    const tx = q.dir[0], tz = q.dir[1];
    const px = ax + (p.pts[q.i + 2] - ax) * q.t, pz = az + (p.pts[q.i + 3] - az) * q.t;
    let nx = cx - px, nz = cz - pz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const sw = Math.max(p.swLeft || 0, p.swRight || 0);
    const off = p.hw + (sw > 0 ? sw : 0.8) + 0.25;
    // the house's extent along the street and its nearest wall
    let t0 = Infinity, t1 = -Infinity, near = Infinity, far = -Infinity;
    for (let i = 0; i < b.pts.length; i += 2) {
      const rx = b.pts[i] - px, rz = b.pts[i + 1] - pz;
      const along = rx * tx + rz * tz, across = rx * nx + rz * nz;
      t0 = Math.min(t0, along); t1 = Math.max(t1, along); near = Math.min(near, across); far = Math.max(far, across);
    }
    if (near - off < 2.2) return skip('on the street line'); // the facade stands on the street line: it is its own frontage
    const h0 = hash(b.id * 7 + 1), h1 = hash(b.id * 13 + 5), h2 = hash(b.id * 31 + 9);
    // garden trees: front yard, beside the house and in the back garden (planted by Vegetation)
    const tc = (t0 + t1) / 2;
    const yard = [[tc + (h1 - 0.5) * (t1 - t0) * 0.6, (off + near) / 2], [t0 - 2.5, (near + far) / 2], [t1 + 2.5, near + 2], [tc + (h0 - 0.5) * 6, far + 4 + h2 * 3]];
    for (let k = 0; k < yard.length; k++) {
      if (hash(b.id * 3 + k) < (k === 0 ? (near - off > 5 ? 0.55 : 0) : 0.6)) {
        const [ta, ca] = yard[k];
        gardens.push([px + tx * ta + nx * ca, pz + tz * ta + nz * ca, 0.8 + hash(b.id + k) * 0.5]);
      }
    }
    t0 -= 2 + h0 * 3.5; t1 += 2 + h1 * 3.5;
    if (t1 - t0 > 40) { const m = (t0 + t1) / 2; t0 = m - 20; t1 = m + 20; }
    const fx = px + nx * off, fz = pz + nz * off;
    if (nearMapped(fx + tx * (t0 + t1) / 2, fz + tz * (t0 + t1) / 2)) return skip('mapped fence');
    // gates: a pedestrian gate opposite the house, a driveway gate near one end
    const gateT = (t0 + t1) / 2 + (h2 - 0.5) * 3;
    const drive = h1 < 0.6 ? (h0 < 0.5 ? [t0 + 1.2, t0 + 4.4] : [t1 - 4.4, t1 - 1.2]) : null;
    const style = h2 < 0.34 ? 'plaster' : h2 < 0.58 ? 'railing' : h2 < 0.76 ? 'panel' : h2 < 0.9 ? 'hedge' : 'low';
    const col = PLASTER[Math.floor(h0 * PLASTER.length)];
    const cop = COPING[Math.floor(h1 * COPING.length)];
    const green = [0.2 + h0 * 0.06, 0.34 + h1 * 0.08, 0.16 + h2 * 0.04];
    // sample the frontage, keep the clear runs
    const runs = [];
    let cur = null;
    for (let t = t0; t <= t1 + 1e-6; t += STEP) {
      const tt = Math.min(t, t1);
      const x = fx + tx * tt, z = fz + tz * tt;
      const inGate = (tt > gateT - 0.6 && tt < gateT + 0.6) || (drive && tt > drive[0] && tt < drive[1]);
      const ok = !inGate && clear(x, z);
      if (ok) { if (!cur) runs.push((cur = [])); cur.push(tt); } else cur = null;
    }
    const piece = (ta, tb, sideN = 0) => {
      const xa = fx + tx * ta + nx * sideN, za = fz + tz * ta + nz * sideN;
      return [xa, za];
    };
    const emitRun = (pts, dirX, dirZ) => {
      // pts: [[x, z], ...] along the wall
      for (let i = 0; i + 1 < pts.length; i++) {
        const [xa, za] = pts[i], [xb, zb] = pts[i + 1];
        const ya = y(xa, za), yb = y(xb, zb);
        if (style === 'plaster') {
          bucket(xa, za, 'plaster').wall(xa, za, xb, zb, ya, yb, 1.75, 0.24, col);
          bucket(xa, za, 'plaster').wall(xa, za, xb, zb, ya + 1.75, yb + 1.75, 0.07, 0.32, cop);
        } else if (style === 'railing' || style === 'panel') {
          bucket(xa, za, 'stone').wall(xa, za, xb, zb, ya, yb, 0.62, 0.3, [1, 1, 1], 0.5);
          bucket(xa, za, style).wall(xa, za, xb, zb, ya + 0.62, yb + 0.62, style === 'panel' ? 1.1 : 0.95, 0.03, [1, 1, 1], 1, false);
        } else if (style === 'hedge') {
          bucket(xa, za, 'hedge').wall(xa, za, xb, zb, ya, yb, 1.35 + h0 * 0.4, 0.75, green);
        } else {
          bucket(xa, za, 'plaster').wall(xa, za, xb, zb, ya, yb, 0.95, 0.22, col);
          bucket(xa, za, 'railing').wall(xa, za, xb, zb, ya + 0.95, yb + 0.95, 0.7, 0.03, [1, 1, 1], 1, false);
        }
      }
      // pillars at the run ends
      for (const [x, z] of [pts[0], pts[pts.length - 1]]) {
        const yy = y(x, z);
        const hb = bucket(x, z, style === 'hedge' ? 'hedge' : 'plaster');
        if (style !== 'hedge') hb.wall(x - dirX * 0.22, z - dirZ * 0.22, x + dirX * 0.22, z + dirZ * 0.22, yy, yy, style === 'plaster' ? 1.95 : 1.75, 0.44, style === 'plaster' ? col : [0.62, 0.6, 0.57]);
      }
    };
    for (const r of runs) {
      if (r.length < 2) continue;
      emitRun(r.map((t) => piece(t)), tx, tz);
    }
    // closed gates in the gaps
    const gateLeaf = (ta, tb, hgt) => {
      const [xa, za] = piece(ta), [xb, zb] = piece(tb);
      if (!clear((xa + xb) / 2, (za + zb) / 2)) return;
      const ya = y(xa, za), yb = y(xb, zb);
      bucket(xa, za, 'gate').wall(xa, za, xb, zb, Math.min(ya, yb) + 0.05, Math.min(ya, yb) + 0.05, hgt, 0.05, [1, 1, 1], 1);
    };
    if (style !== 'hedge') {
      gateLeaf(gateT - 0.55, gateT + 0.55, 1.6);
      if (drive) gateLeaf(drive[0] + 0.1, drive[1] - 0.1, 1.6);
    }
    // short side walls back towards the house
    const depth = Math.min(near - off + 3, 14);
    for (const t of [t0, t1]) {
      const pts = [];
      for (let s = 0; s <= depth + 1e-6; s += STEP) {
        const [x, z] = piece(t, Math.min(s, depth));
        if (!clear(x, z)) break;
        pts.push([x, z]);
      }
      if (pts.length >= 2) emitRun(pts, nx, nz);
    }
    plots++;
  });

  const out = [];
  for (const [k, t] of tiles) {
    const g = new THREE.Group();
    g.name = `plotwalls:${k}`;
    for (const [mat, b] of Object.entries(t)) {
      const geo = b.geometry();
      if (!geo) continue;
      const m = new THREE.Mesh(geo, M[mat]);
      m.castShadow = mat !== 'railing' && mat !== 'panel';
      m.receiveShadow = true;
      g.add(m);
    }
    out.push(g);
  }
  world.plotWallStats = { plots, gardens: gardens.length, ...why };
  return { groups: out, plots, gardens };
}

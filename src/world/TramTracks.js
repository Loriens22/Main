// Tram tracks and overhead line of a tram line's world (route.tracks from tools/build_tram_route.py: the OSM
// tram network round the line, every track a centre-line polyline flagged as street running or not).
//
// Track: 1 009 mm gauge. In the street the rails are grooved rails laid flush in concrete track panels
// (grey slab band with transverse joints, a dark groove inside each rail head); elsewhere the track lies on a
// raised ballast bed with concrete sleepers every 0.65 m and Vignole rails (head, web, foot) on top.
// Overhead line: a single contact wire 5.6 m above the rails, staggered from side to side at its supports
// (pull-offs every 7.5 m on curves), carried by galvanised tubular poles about every 30 m with a bracket arm
// over the track; in the street the poles stand at the kerb and long spans hang from cross-span wires.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const GAUGE = 1.009;
export const WIRE_H = 5.6; // contact wire above the rail head
const RAIL_C = GAUGE / 2 + 0.03; // rail head centre lines (inner face at gauge / 2)
const ROAD_Y = 0.07;
const BED_H = 0.3; // ballast bed top above the terrain
const STEP = 1.5;
const TILE = 256;

/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Concrete track panel: 2.5 m across (u), 2 m along (v), a joint across, grime between the rails. */
function slabTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8d8b86';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 110 + rnd() * 50;
      g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // oil and brake dust along the middle, tyre polish beside the rails
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(40,38,34,0.05)');
    grd.addColorStop(0.35, 'rgba(40,38,34,0.0)');
    grd.addColorStop(0.5, 'rgba(30,28,25,0.28)');
    grd.addColorStop(0.65, 'rgba(40,38,34,0.0)');
    grd.addColorStop(1, 'rgba(40,38,34,0.05)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(35,34,32,0.55)';
    g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(60,58,54,0.35)';
    g.fillRect(0, h / 2, w, 1);
  });
}

function ballastTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6d6862';
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3800; i++) {
      const v = 70 + rnd() * 95;
      const r = 1.2 + rnd() * 3.2;
      g.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(70,45,25,0.18)'; // rust from the rails
    g.fillRect(w * 0.27, 0, w * 0.06, h);
    g.fillRect(w * 0.67, 0, w * 0.06, h);
  });
}

/* ------------------------------------------------------------------ sampling */
/** Polyline resampled every STEP m: [{x, z, tx, tz, s}] with smoothed tangents. */
function resample(pts) {
  const out = [];
  let acc = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L > 1e-4) segs.push([pts[i - 1], pts[i], L, acc]), (acc += L);
  }
  if (!segs.length) return out;
  const n = Math.max(1, Math.round(acc / STEP));
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const s = (acc * j) / n;
    while (k < segs.length - 1 && segs[k][3] + segs[k][2] < s) k++;
    const [a, b, L, s0] = segs[k];
    const t = Math.min(1, Math.max(0, (s - s0) / L));
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s });
  }
  for (let i = 0; i < out.length; i++) {
    const p = out[Math.max(0, i - 1)], q = out[Math.min(out.length - 1, i + 1)];
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / L;
    out[i].tz = dz / L;
  }
  return out;
}

/* ------------------------------------------------------------------ geometry helpers */
/** Ribbon along samples at lateral offsets [l0, l1] (right of travel = +), height fn, u across 0..1, v = s / vScale. */
function ribbon(S, l0, l1, yAt, vScale = 2, uRange = [0, 1]) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const rx = -p.tz, rz = p.tx;
    for (const [l, u] of [[l0, uRange[0]], [l1, uRange[1]]]) {
      const x = p.x + rx * l, z = p.z + rz * l;
      pos.push(x, yAt(p, l), z);
      uv.push(u, p.s / vScale);
    }
    if (i) {
      const a = 2 * (i - 1);
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Profile [[lateral, dy], ...] swept along samples (closed = false), normals from the geometry. */
function sweepProfile(S, offset, prof, yAt) {
  const pos = [], idx = [];
  const m = prof.length;
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const rx = -p.tz, rz = p.tx;
    const base = yAt(p, offset);
    for (const [l, dy] of prof) pos.push(p.x + rx * (offset + l), base + dy, p.z + rz * (offset + l));
    if (i) {
      const a = (i - 1) * m, b = i * m;
      // profile points run left to right: (along, across) turns upwards / outwards
      for (let k = 0; k < m - 1; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ builder */
export function buildTramInfrastructure(world) {
  const route = world.route;
  if (!route || !route.tracks || !route.tracks.length) return null;
  const hf = world.hf, roads = world.roads;
  const lite = world.quality === 'balanced' || world.quality === 'low';
  const mats = {
    slab: new THREE.MeshStandardMaterial({ map: slabTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    groove: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    railHead: new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.22, metalness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x6a4f3c, roughness: 0.75, metalness: 0.3 }),
    ballast: new THREE.MeshStandardMaterial({ map: ballastTexture(), roughness: 0.97 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.85 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x7f8486, roughness: 0.55, metalness: 0.55 }),
    wire: new THREE.LineBasicMaterial({ color: 0x2a2724 }),
  };
  const groundY = (x, z) => hf.heightAt(x, z);
  const buckets = new Map(); // tile -> {key: [geometries]}
  const push = (x, z, key, g) => {
    const tk = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let b = buckets.get(tk);
    if (!b) buckets.set(tk, (b = {}));
    (b[key] = b[key] || []).push(g);
  };
  const sleepers = new Map(); // tile -> [matrix]
  const poles = []; // {x, z, y, h, ax, az, al} pole + arm towards (ax, az), arm length al
  const wireSegs = new Map(); // tile -> [x, y, z, ...]
  const addWire = (a, b) => {
    const tk = `${Math.floor(a[0] / TILE)},${Math.floor(a[2] / TILE)}`;
    let arr = wireSegs.get(tk);
    if (!arr) wireSegs.set(tk, (arr = []));
    arr.push(...a, ...b);
  };

  // spatial hash of all track samples (which side has a neighbouring track, pole spacing)
  const allSamples = [];
  const tracks = route.tracks.map((t, i) => {
    const S = resample(t.pts);
    for (const p of S) allSamples.push([p.x, p.z, i]);
    return { ...t, S, i };
  });
  const H = new Map();
  const hk = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  for (const p of allSamples) {
    const k = hk(p[0], p[1]);
    if (!H.has(k)) H.set(k, []);
    H.get(k).push(p);
  }
  const otherTrackSide = (p, self) => {
    // +1: a different track lies to the right within 5 m, -1: to the left, 0: none
    let best = 0, bd = 5;
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++) {
        const arr = H.get(`${Math.floor(p.x / 6) + gx},${Math.floor(p.z / 6) + gz}`);
        if (!arr) continue;
        for (const q of arr) {
          if (q[2] === self) continue;
          const dx = q[0] - p.x, dz = q[1] - p.z;
          const lat = dx * -p.tz + dz * p.tx, lon = dx * p.tx + dz * p.tz;
          if (Math.abs(lon) > 3 || Math.abs(lat) < 1.6) continue;
          if (Math.abs(lat) < bd) { bd = Math.abs(lat); best = Math.sign(lat); }
        }
      }
    return best;
  };
  const poleHash = new Set();
  const nearPole = (x, z) => {
    const k = `${Math.floor(x / 9)},${Math.floor(z / 9)}`;
    if (poleHash.has(k)) return true;
    poleHash.add(k);
    return false;
  };

  for (const t of tracks) {
    const S = t.S;
    if (S.length < 2) continue;
    const mid = S[Math.floor(S.length / 2)];
    // chunks of ~40 m so tiles and culling stay fine-grained
    for (let c0 = 0; c0 < S.length - 1; c0 += 26) {
      const C = S.slice(c0, Math.min(S.length, c0 + 27));
      if (C.length < 2) continue;
      const cx = C[Math.floor(C.length / 2)].x, cz = C[Math.floor(C.length / 2)].z;
      if (t.street) {
        const y = (p) => groundY(p.x, p.z) + ROAD_Y + 0.006;
        push(cx, cz, 'slab', ribbon(C, -1.25, 1.25, (p) => y(p), 2, [0, 1]));
        for (const sg of [-1, 1]) {
          const c = sg * RAIL_C;
          push(cx, cz, 'railHead', ribbon(C, c - 0.028, c + 0.028, (p) => y(p) + 0.004, 4));
          // the groove on the inside of the head
          const g0 = c - sg * 0.028, g1 = c - sg * 0.064;
          push(cx, cz, 'groove', ribbon(C, Math.min(g0, g1), Math.max(g0, g1), (p) => y(p) + 0.003, 4));
        }
      } else {
        const gy = (p) => groundY(p.x, p.z);
        // ballast bed: shoulders sloping to the ground, flat top
        const bed = [[-1.75, 0], [-1.35, BED_H], [1.35, BED_H], [1.75, 0]];
        const bg = sweepProfile(C, 0, bed, (p) => gy(p));
        const uv = [];
        for (let i = 0; i < C.length; i++) for (const u of [0, 0.12, 0.88, 1]) uv.push(u, C[i].s / 2.5);
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        push(cx, cz, 'ballast', bg);
        // Vignole rails on the sleepers: foot, web, head
        // clockwise seen along the track (over the top from left to right), like the bed profile
        const prof = [[-0.06, 0], [-0.008, 0.012], [-0.008, 0.11], [-0.03, 0.12], [-0.03, 0.15], [0.03, 0.15], [0.03, 0.12], [0.008, 0.11], [0.008, 0.012], [0.06, 0]];
        for (const sg of [-1, 1]) push(cx, cz, 'rail', sweepProfile(C, sg * RAIL_C, prof, (p) => gy(p) + BED_H + 0.07));
        if (!lite) {
          let list = sleepers.get(`${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`);
          if (!list) sleepers.set(`${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`, (list = []));
          const m = new THREE.Matrix4();
          for (let i = 0; i < C.length - 1; i++) {
            const p = C[i];
            for (let f = 0; f < STEP; f += 0.65) {
              const x = p.x + p.tx * f, z = p.z + p.tz * f;
              m.makeRotationY(Math.atan2(p.tx, p.tz)).setPosition(x, gy(p) + BED_H + 0.035, z);
              list.push(m.clone());
            }
          }
        }
      }
    }

    // ---- overhead line: supports every ~30 m (7.5 m pull-offs between), staggered +-0.15 m
    const railY = (p) => (t.street ? groundY(p.x, p.z) + ROAD_Y + 0.01 : groundY(p.x, p.z) + BED_H + 0.22);
    let prev = null;
    let k = 0;
    for (let i = 0; i < S.length; i += 5) {
      const p = S[i];
      const stag = (k++ % 2 ? 1 : -1) * 0.15;
      const wp = [p.x - p.tz * stag, railY(p) + WIRE_H, p.z + p.tx * stag];
      if (prev) addWire(prev, wp);
      prev = wp;
      if ((k - 1) % 4 !== 0) continue;
      if (nearPole(p.x, p.z)) continue;
      // pole side: the kerb in the street, else away from the neighbouring track
      let side = -otherTrackSide(p, t.i) || 1;
      let lat = 3.0;
      if (t.street && roads) {
        const q = roads.query(p.x, p.z, 25);
        if (q) {
          // centre-line point and the side of the track relative to it
          const ax = q.piece.pts[q.i], az = q.piece.pts[q.i + 1];
          const px = ax + (q.piece.pts[q.i + 2] - ax) * q.t, pz = az + (q.piece.pts[q.i + 3] - az) * q.t;
          const ox = p.x - px, oz = p.z - pz;
          const latC = ox * -p.tz + oz * p.tx; // track offset from the road centre (right +)
          const s0 = Math.abs(latC) > 0.6 ? Math.sign(latC) : side;
          side = s0;
          lat = Math.max(2.4, q.piece.hw + 0.6 - Math.abs(latC));
        }
      }
      const bx = p.x - p.tz * side * lat, bz = p.z + p.tx * side * lat;
      if (world.bgrid && world.bgrid.boxContact && world.bgrid.boxContact(bx, bz, 1, 0, 0.3, 0.3)) continue;
      poles.push({ x: bx, z: bz, y: groundY(bx, bz) + (t.street ? 0.2 : 0), h: railY(p) + WIRE_H + 0.9 - groundY(bx, bz), ax: wp[0], az: wp[2], wy: wp[1] });
    }
    void mid;
  }

  // ---- meshes per tile
  const out = [];
  for (const [tk, b] of buckets) {
    for (const [key, list] of Object.entries(b)) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[key]);
      m.name = `tramTrack:${tk}`;
      m.receiveShadow = true;
      m.castShadow = key === 'rail';
      out.push(m);
    }
  }
  const sleeperGeo = new THREE.BoxGeometry(1.9, 0.07, 0.22);
  for (const [tk, list] of sleepers) {
    const im = new THREE.InstancedMesh(sleeperGeo, mats.sleeper, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.name = `tramTrack:${tk}`;
    im.receiveShadow = true;
    out.push(im);
  }
  // poles (tapered tube) and bracket arms (tube from the pole to above the wire, a tie rod below it)
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 10).translate(0, 0.5, 0);
  const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
  const byTile = new Map();
  for (const p of poles) {
    const tk = `${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`;
    if (!byTile.has(tk)) byTile.set(tk, []);
    byTile.get(tk).push(p);
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), v4 = new THREE.Vector3();
  for (const [tk, list] of byTile) {
    const pm = new THREE.InstancedMesh(poleGeo, mats.pole, list.length);
    const am = new THREE.InstancedMesh(armGeo, mats.pole, list.length * 2);
    const tieSegs = [];
    list.forEach((p, i) => {
      pm.setMatrixAt(i, m4.compose(v4.set(p.x, p.y, p.z), q4.identity(), s4.set(1, p.h, 1)));
      const dx = p.ax - p.x, dz = p.az - p.z, L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(-dz, dx);
      const armY = p.wy + 0.55;
      if (L < 6) {
        // cantilever: horizontal tube and an inclined stay
        am.setMatrixAt(2 * i, m4.compose(v4.set(p.x, armY, p.z), q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), s4.set(L + 0.3, 1, 1)));
        const stayL = Math.hypot(L * 0.6, 0.9);
        const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(0.9, L * 0.6), 'YZX'));
        am.setMatrixAt(2 * i + 1, m4.compose(v4.set(p.x, armY - 0.9, p.z), rot, s4.set(stayL, 0.8, 0.8)));
        // dropper from the arm to the wire
        tieSegs.push(p.ax, armY, p.az, p.ax, p.wy, p.az);
      } else {
        // wide street: cross-span wire from the pole top down to the contact wire
        am.setMatrixAt(2 * i, m4.compose(v4.set(p.x, armY, p.z), q4.identity(), s4.set(0.001, 0.001, 0.001)));
        am.setMatrixAt(2 * i + 1, m4.compose(v4.set(p.x, armY, p.z), q4.identity(), s4.set(0.001, 0.001, 0.001)));
        tieSegs.push(p.x, p.y + p.h - 0.4, p.z, p.ax, p.wy + 0.35, p.az, p.ax, p.wy + 0.35, p.az, p.ax, p.wy, p.az);
      }
    });
    pm.computeBoundingSphere();
    am.computeBoundingSphere();
    pm.name = am.name = `catenary:${tk}`;
    pm.castShadow = true;
    out.push(pm, am);
    if (tieSegs.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(tieSegs, 3));
      const ls = new THREE.LineSegments(lg, mats.wire);
      ls.name = `catenary:${tk}`;
      out.push(ls);
    }
  }
  for (const [tk, arr] of wireSegs) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const ls = new THREE.LineSegments(lg, mats.wire);
    ls.name = `catenary:${tk}`;
    ls.frustumCulled = true;
    lg.computeBoundingSphere();
    out.push(ls);
  }
  for (const o of out) world.addToTile(o.name.split(':')[1], o);
  world.tramMaterials = mats;
  return { meshes: out.length, poles: poles.length };
}

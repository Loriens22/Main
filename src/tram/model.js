// Pesa Swing 122NaSF (Sofia) — five-module, 100 % low-floor tram, ≈31.7 m × 2.4 m.
// Local frame per module: front towards −z, right side +x, rail level y = 0, origin at the module centre
// (bogie centre for the bogie modules A, C, E). Modules B and D hang between their neighbours.
import * as THREE from 'three';
import { Batch, mat, prepGeo, roundedBox, tubePath, xform, clamp, lerp, smoothstep } from '../util.js';
import * as TX from '../textures.js';
import { makeTramMaterials } from './materials.js';
import { TramDisplays, CabScreens } from './displays.js';
import { InformatorFace } from '../bus/displays.js';
import { decalMat } from '../bus/materials.js';

// half cross-section (right side), bottom of the skirt → roof centre. Window band 1.02–2.28 m.
const PROF = [[1.14, 0.2], [1.19, 0.28], [1.2, 0.5], [1.2, 0.8], [1.2, 1.02], [1.199, 1.6], [1.194, 2.28], [1.18, 2.62], [1.152, 2.93], [1.09, 3.12], [0.96, 3.26], [0.72, 3.345], [0.36, 3.372], [0, 3.378]];
const Y_WIN0 = 1.02, Y_WIN1 = 2.28, Y_DOOR = 2.3;

export const TR = {
  hw: 1.2, yFloor: 0.35, roofY: 3.378, gap: 0.36,
  noseZ: -3.95, tip: -5.25,
  modules: [
    { name: 'A', z0: -5.25, z1: 2.65, bogie: true, doors: [[-3.0, -1.7]] },
    { name: 'B', z0: -2.1, z1: 2.1, doors: [[-1.25, 0.05]] },
    { name: 'C', z0: -3.3, z1: 3.3, bogie: true, panto: true, doors: [] },
    { name: 'D', z0: -2.1, z1: 2.1, doors: [[-1.25, 0.05]] },
    { name: 'E', z0: -2.75, z1: 4.65, bogie: true, doors: [[-2.3, -1.0]], rear: true },
  ],
  eye: new THREE.Vector3(0, 1.98, -3.48),
};
// distance from the nose tip back to each module origin (bogie modules) along the train
{
  let d = -TR.modules[0].z0; // tip → A origin
  TR.modules[0].dist = d;
  for (let i = 1; i < TR.modules.length; i++) {
    const p = TR.modules[i - 1], m = TR.modules[i];
    d += p.z1 + TR.gap - m.z0;
    m.dist = d;
  }
  TR.length = TR.modules[4].dist + TR.modules[4].z1;
}

const profX = (y) => {
  if (y <= PROF[0][1]) return PROF[0][0];
  for (let i = 0; i < PROF.length - 1; i++) { const a = PROF[i], b = PROF[i + 1]; if (y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); }
  return 0;
};
const table = (t, x) => { if (x <= t[0][0]) return t[0][1]; for (let i = 0; i < t.length - 1; i++) if (x <= t[i + 1][0]) return lerp(t[i][1], t[i + 1][1], (x - t[i][0]) / (t[i + 1][0] - t[i][0])); return t[t.length - 1][1]; };
const NOSE_D = [[0.2, 1.22], [0.46, 1.3], [0.8, 1.28], [1.25, 1.2], [1.8, 1.02], [2.42, 0.8], [2.95, 0.55], [3.3, 0.3], [3.378, 0.12]];
const REAR_D = [[0.2, 0.3], [0.8, 0.35], [1.4, 0.34], [2.4, 0.28], [3.0, 0.17], [3.378, 0.06]];

/** Superellipse cap surface: point for angle θ∈[0,π] (0 = right edge) at height y. */
function capPoint(y, th, depthTab, zc, dir, p = 2.4) {
  const a = profX(y), b = table(depthTab, y);
  const c = Math.cos(th), s = Math.sin(th);
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
  const zz = b * Math.pow(Math.abs(s), 2 / p);
  return [x, y, zc + dir * zz];
}
/** Loft a cap band between heights ys (rows) — returns geometry with smooth normals. */
function capGeo(ys, depthTab, zc, dir, N = 30, uv = false) {
  const pos = [], uvs = [], idx = [];
  for (let r = 0; r < ys.length; r++) for (let k = 0; k <= N; k++) {
    const th = (k / N) * Math.PI;
    const p = capPoint(ys[r], th, depthTab, zc, dir);
    pos.push(...p); uvs.push(k / N, uv ? ys[r] / 3.4 : r / (ys.length - 1));
  }
  const W = N + 1;
  for (let r = 0; r < ys.length - 1; r++) for (let k = 0; k < N; k++) {
    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
    if (dir < 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Outward normal of the cap surface (finite differences). */
function capFrame(y, th, depthTab, zc, dir) {
  const p = new THREE.Vector3(...capPoint(y, th, depthTab, zc, dir));
  const a = new THREE.Vector3(...capPoint(y, th + 0.01, depthTab, zc, dir)).sub(p);
  const b = new THREE.Vector3(...capPoint(y + 0.01, th, depthTab, zc, dir)).sub(p);
  const n = new THREE.Vector3().crossVectors(b, a).normalize();
  if (n.z * dir < 0) n.negate();
  return { p, n };
}
const sub = (ys, y0, y1) => ys.filter((y) => y >= y0 - 1e-6 && y <= y1 + 1e-6);

/** Intervals of [a,b] not covered by the (sorted) cuts. */
function gaps(a, b, cuts) {
  const out = []; let s = a;
  for (const [c0, c1] of cuts.slice().sort((x, y) => x[0] - y[0])) { if (c0 > s) out.push([s, Math.min(c0, b)]); s = Math.max(s, c1); }
  if (s < b) out.push([s, b]);
  return out.filter(([x, y]) => y - x > 0.01);
}

export function buildTram(line) {
  const M = makeTramMaterials();
  const displays = new TramDisplays(line);
  const informator = new InformatorFace();
  const rig = { kind: 'tram', M, displays, informator, roots: [], bodies: {}, groups: {}, mods: TR.modules, doors: [], seats: [], mirrors: [], stopButtons: [], wheels: [] };
  const ledMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  for (const m of TR.modules) {
    const root = new THREE.Group(); root.name = 'tram' + m.name;
    const body = new THREE.Group(); root.add(body);
    rig.roots.push(root); rig.bodies[m.name] = body; rig.groups[m.name] = root;
    const ext = new Batch(), int = new Batch();
    const isA = m.name === 'A', isE = m.name === 'E';
    const zs0 = isA ? TR.noseZ : m.z0, zs1 = isE ? m.z1 - 0.35 : m.z1; // straight side shell range
    const cabZ = -3.1;

    /* ------------------- window layout per side ------------------- */
    const win = {};
    for (const side of [1, -1]) {
      const cuts = [];
      if (side > 0) for (const [d0, d1] of m.doors) cuts.push([d0 - 0.12, d1 + 0.12]);
      if (isA) cuts.push([zs0, zs0 + 0.08]);
      const free = gaps(zs0 + 0.1, zs1 - 0.12, cuts);
      const panes = [];
      for (const [a, b] of free) {
        const n = Math.max(1, Math.round((b - a) / 1.45));
        const w = (b - a) / n;
        for (let k = 0; k < n; k++) panes.push([a + k * w + (k ? 0.05 : 0), a + (k + 1) * w - (k < n - 1 ? 0.05 : 0)]);
      }
      win[side] = panes;
    }

    /* ------------------- side shell (livery) ------------------- */
    const zb = new Set([zs0, zs1]);
    for (const side of [1, -1]) { for (const [a, b] of win[side]) { zb.add(a); zb.add(b); } }
    for (const [d0, d1] of m.doors) { zb.add(d0); zb.add(d1); }
    const zList = [...zb].sort((a, b) => a - b);
    for (const side of [1, -1]) {
      const pos = [], nrm = [], uv = [];
      const nAt = (i) => { const a = PROF[Math.max(0, i - 1)], b = PROF[Math.min(PROF.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy); return [dy / L * side, -dx / L]; };
      for (let k = 0; k < zList.length - 1; k++) {
        const za = zList[k], zb2 = zList[k + 1], zm = (za + zb2) / 2;
        const inDoor = side > 0 && m.doors.some(([d0, d1]) => zm > d0 && zm < d1);
        const inWin = win[side].some(([a, b]) => zm > a && zm < b);
        for (let j = 0; j < PROF.length - 1; j++) {
          const [x0, y0] = PROF[j], [x1, y1] = PROF[j + 1];
          if (inDoor && y1 <= Y_DOOR + 1e-6) continue;
          if (inWin && y0 >= Y_WIN0 - 1e-6 && y1 <= Y_WIN1 + 1e-6) continue;
          const n0 = nAt(j), n1 = nAt(j + 1);
          const P = [[side * x0, y0, za, n0], [side * x0, y0, zb2, n0], [side * x1, y1, zb2, n1], [side * x1, y1, za, n1]];
          const tri = side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
          for (const t of tri) { const q = P[t]; pos.push(q[0], q[1], q[2]); nrm.push(q[3][0], q[3][1], 0); uv.push(q[2] * 0.3, q[1] / 3.4); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      ext.addRaw(M.paint, prepGeo(g));
      // glazing: panes with black rubber gaskets
      for (const [a, b] of win[side]) {
        const L = b - a, zc = (a + b) / 2, x = side * 1.2005;
        const gl = new THREE.PlaneGeometry(L - 0.04, Y_WIN1 - Y_WIN0 - 0.04); gl.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ext.add(M.glassSide, gl, mat(x - side * 0.012, (Y_WIN0 + Y_WIN1) / 2, zc));
        for (const [yy, hh] of [[Y_WIN0 + 0.015, 0.03], [Y_WIN1 - 0.015, 0.03]]) ext.add(M.black, new THREE.BoxGeometry(0.03, hh, L), mat(x, yy, zc));
        for (const zz of [a + 0.015, b - 0.015]) ext.add(M.black, new THREE.BoxGeometry(0.03, Y_WIN1 - Y_WIN0, 0.03), mat(x, (Y_WIN0 + Y_WIN1) / 2, zz));
        // hopper vent in some panes
        if (L > 1.2 && ((a * 7) | 0) % 2 === 0) ext.add(M.black, new THREE.BoxGeometry(0.025, 0.025, L - 0.06), mat(x, Y_WIN1 - 0.42, zc));
        // interior pillar lining inside the band
      }
      // interior lining of the window band pillars
      for (const [a, b] of gaps(zs0 + 0.1, zs1 - 0.1, [...win[side], ...(side > 0 ? m.doors.map(([d0, d1]) => [d0 - 0.02, d1 + 0.02]) : [])])) {
        const pg = new THREE.PlaneGeometry(b - a, Y_WIN1 - Y_WIN0); pg.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
        int.add(M.wall, pg, mat(side * 1.13, (Y_WIN0 + Y_WIN1) / 2, (a + b) / 2));
      }
    }
    // yellow front mask wraps round the cab sides up to door 1
    if (isA) for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.85, 0.79); g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      ext.add(M.yellow, g, mat(side * 1.2025, 0.855, TR.noseZ + 0.43));
    }

    /* ------------------- end frames at the gangways ------------------- */
    const endFrame = (z, face) => {
      const sh = new THREE.Shape();
      sh.moveTo(PROF[0][0], PROF[0][1]);
      for (const [x, y] of PROF) sh.lineTo(x * 0.995, y - 0.002);
      for (let i = PROF.length - 1; i >= 0; i--) sh.lineTo(-PROF[i][0] * 0.995, PROF[i][1] - 0.002);
      const hole = new THREE.Path(); hole.moveTo(-0.72, 0.35); hole.lineTo(0.72, 0.35); hole.lineTo(0.72, 2.3); hole.absarc(0, 2.3, 0.72, 0, Math.PI, false); hole.lineTo(-0.72, 0.35);
      sh.holes.push(hole);
      const g = new THREE.ShapeGeometry(sh, 6); if (face > 0) g.rotateY(Math.PI);
      ext.add(M.charcoal, g, mat(0, 0, z));
      const gi = g.clone(); gi.rotateY(Math.PI); int.add(M.wallDark, gi, mat(0, 0, z - face * 0.02));
    };
    if (!isA) endFrame(m.z0, -1);
    if (!isE) endFrame(m.z1, 1);

    /* ------------------- nose (module A) ------------------- */
    if (isA) {
      const ys = [0.2, 0.3, 0.46, 0.6, 0.8, 1.0, 1.25, 1.6, 2.0, 2.42, 2.7, 2.95, 3.15, 3.3, 3.378];
      ext.add(M.charcoal, capGeo(sub(ys, 0.2, 0.46), NOSE_D, TR.noseZ, -1));
      ext.add(M.yellow, capGeo(sub(ys, 0.46, 1.25), NOSE_D, TR.noseZ, -1));
      ext.add(M.glassFront, capGeo(sub(ys, 1.25, 2.42), NOSE_D, TR.noseZ, -1));
      ext.add(M.grey, capGeo(sub(ys, 2.42, 3.378), NOSE_D, TR.noseZ, -1));
      // black rubber bumper strip and window gasket lines
      const band = (y0, y1, grow, material) => {
        const g = capGeo([y0, y1], NOSE_D.map(([y, d]) => [y, d + grow]), TR.noseZ, -1, 30);
        const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const s = 1 + grow * 0.8; p.setX(i, p.getX(i) * s); }
        g.computeVertexNormals(); ext.add(material, g);
      };
      band(0.44, 0.52, 0.035, M.rubber);
      band(1.23, 1.27, 0.012, M.black);
      band(2.4, 2.44, 0.012, M.black);
      // headlamp clusters: black rounded plate with two LED lamps and an amber indicator per side
      for (const s of [1, -1]) {
        const th = s > 0 ? 0.47 : Math.PI - 0.47;
        const { p, n } = capFrame(0.86, th, NOSE_D, TR.noseZ, -1);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
        const put = (geo, material, dx, dy, lift) => {
          geo.translate(dx * s, dy, 0); geo.applyQuaternion(q); geo.translate(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift); ext.add(material, geo);
        };
        put(roundedBox(0.46, 0.15, 0.03, 0.02), M.black, 0, 0, 0.005);
        put(new THREE.PlaneGeometry(0.13, 0.085), M.headLo, -0.12, 0.005, 0.022);
        put(new THREE.PlaneGeometry(0.13, 0.085), M.drl, 0.03, 0.005, 0.022);
        put(new THREE.PlaneGeometry(0.08, 0.085), s > 0 ? M.indR : M.indL, 0.165, 0.005, 0.022);
        put(new THREE.PlaneGeometry(0.44, 0.012), M.chrome, 0, -0.065, 0.022);
        // lower LED strips
        const c = capFrame(0.34, s > 0 ? 0.55 : Math.PI - 0.55, NOSE_D, TR.noseZ, -1);
        ext.add(M.drl, new THREE.BoxGeometry(0.28, 0.035, 0.02), mat(c.p.x + c.n.x * 0.01, 0.34, c.p.z + c.n.z * 0.01, 0, Math.atan2(c.n.x, c.n.z) - Math.PI));
      }
      // fleet number + Pesa logo on the yellow mask
      const numTex = TX.textDecal(line.fleet || '2312', { w: 512, h: 160, color: '#141414', font: `800 120px ${TX.FONT}` });
      const num = new THREE.PlaneGeometry(0.46, 0.145); num.rotateY(Math.PI);
      const c0 = capFrame(0.66, Math.PI / 2 + 0.28, NOSE_D, TR.noseZ, -1);
      ext.add(decalMat(numTex), num, mat(c0.p.x, 0.66, c0.p.z - 0.012, 0, 0.12));
      const pesa = TX.textDecal('pesa', { w: 256, h: 96, color: '#1b1b1b', font: `italic 700 70px ${TX.FONT}` });
      const pg = new THREE.PlaneGeometry(0.2, 0.075); pg.rotateY(Math.PI);
      const c1 = capFrame(0.52, Math.PI / 2 + 0.28, NOSE_D, TR.noseZ, -1);
      ext.add(decalMat(pesa), pg, mat(c1.p.x, 0.53, c1.p.z - 0.01, 0, 0.12));
      // destination display behind the top of the windscreen
      const dfr = capFrame(2.33, Math.PI / 2, NOSE_D, TR.noseZ, -1);
      ext.add(M.rubber, new THREE.BoxGeometry(1.36, 0.19, 0.05), mat(0, 2.33, dfr.p.z + 0.1));
      const dg = new THREE.PlaneGeometry(1.3, 0.16); dg.rotateY(Math.PI);
      ext.add(ledMat(displays.front.texture), dg, mat(0, 2.33, dfr.p.z + 0.073));
      // wipers (parked)
      for (const s of [-1, 1]) {
        const w0 = capFrame(1.34, Math.PI / 2 + s * 0.28, NOSE_D, TR.noseZ, -1);
        const w1 = capFrame(1.36, Math.PI / 2 + s * 0.02, NOSE_D, TR.noseZ, -1);
        ext.add(M.black, tubePath([[w0.p.x, 1.33, w0.p.z - 0.03], [w1.p.x, 1.36, w1.p.z - 0.03]], 0.012, 0.1), null);
      }
    }
    /* ------------------- rear cap (module E) ------------------- */
    if (isE) {
      const zc = m.z1 - 0.35;
      ext.add(M.paint, capGeo([0.2, 0.5, 0.8, 1.0, 1.3, 1.8, 2.4, 2.7, 2.93, 3.1, 3.25, 3.378], REAR_D, zc, 1, 30, true));
      const rw = capFrame(1.85, Math.PI / 2, REAR_D, zc, 1);
      const g = new THREE.PlaneGeometry(1.5, 1.0);
      ext.add(M.glassSide, g, mat(0, 1.85, rw.p.z + 0.012));
      ext.add(M.black, new THREE.BoxGeometry(1.58, 1.08, 0.02), mat(0, 1.85, rw.p.z + 0.004));
      const rd = new THREE.PlaneGeometry(0.62, 0.3);
      ext.add(M.dashDark, new THREE.BoxGeometry(0.7, 0.36, 0.02), mat(0, 2.6, rw.p.z - 0.02));
      ext.add(ledMat(displays.rear.texture), rd, mat(0, 2.6, rw.p.z - 0.005));
      for (const s of [1, -1]) {
        const t = capFrame(0.95, s > 0 ? 0.35 : Math.PI - 0.35, REAR_D, zc, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), t.n);
        for (const [dy, mt] of [[0.14, M.tail], [0, M.brake], [-0.14, s > 0 ? M.indR : M.indL]]) {
          const l = new THREE.CircleGeometry(0.055, 16); l.applyQuaternion(q); l.translate(t.p.x + t.n.x * 0.006, t.p.y + dy, t.p.z + t.n.z * 0.006);
          ext.add(mt, l);
        }
      }
    }

    /* ------------------- skirt underside, bogie fairings, bogies ------------------- */
    ext.add(M.under, new THREE.BoxGeometry(2.3, 0.05, (zs1 - zs0) - 0.1), mat(0, 0.22, (zs0 + zs1) / 2));
    if (m.bogie) {
      for (const side of [1, -1]) {
        const sh = new THREE.Shape(); const L = 2.7, H = 0.62, r = 0.34;
        sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.lineTo(L / 2, H - r); sh.quadraticCurveTo(L / 2, H, L / 2 - r, H); sh.lineTo(-L / 2 + r, H); sh.quadraticCurveTo(-L / 2, H, -L / 2, H - r); sh.lineTo(-L / 2, 0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 });
        g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
        ext.add(M.white, g, mat(side * 1.2, 0.16, 0));
        const gr = new THREE.PlaneGeometry(1.5, 0.36); gr.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ext.add(M.grille, gr, mat(side * 1.27, 0.46, 0));
      }
      // bogie: frame + wheels (seen from low angles)
      ext.add(M.steel, new THREE.BoxGeometry(1.9, 0.22, 2.3), mat(0, 0.42, 0));
      for (const zz of [-0.9, 0.9]) {
        ext.add(M.steel, new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10).rotateZ(Math.PI / 2), mat(0, 0.3, zz));
        for (const x of [-0.72, 0.72]) {
          const w = new THREE.CylinderGeometry(0.3, 0.3, 0.13, 20).rotateZ(Math.PI / 2);
          ext.add(M.wheel, w, mat(x, 0.3, zz));
        }
      }
      ext.add(M.steel, new THREE.BoxGeometry(0.25, 0.25, 0.5), mat(0.55, 0.3, 0)); // sander / brake unit
    }

    /* ------------------- roof: side fairings, equipment ------------------- */
    const roofBox = (x, z, w, d, h, grilles = true) => {
      ext.add(M.roof, roundedBox(w, h, d, 0.08), mat(x, TR.roofY + h / 2 - 0.02, z));
      if (grilles) for (let k = -1; k <= 1; k += 2) ext.add(M.dashDark, new THREE.BoxGeometry(w * 0.7, 0.01, d * 0.25), mat(x, TR.roofY + h - 0.01, z + k * d * 0.22));
    };
    if (!m.panto) {
      const fa = isA ? -2.9 : zs0 + 0.15, fb = isE ? zs1 - 0.6 : zs1 - 0.15;
      for (const side of [1, -1]) ext.add(M.grey, new THREE.BoxGeometry(0.04, 0.3, fb - fa), mat(side * 1.02, TR.roofY + 0.1, (fa + fb) / 2));
    }
    if (m.name === 'A') { roofBox(0, -1.2, 1.7, 2.6, 0.42); ext.add(M.steel, new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), mat(0.4, TR.roofY + 0.62, 0.8)); }
    if (m.name === 'B') roofBox(0, 0, 1.6, 2.2, 0.36);
    if (m.name === 'D') roofBox(0, 0, 1.7, 2.6, 0.44);
    if (m.name === 'E') { roofBox(0, 0.4, 1.7, 3.0, 0.44); roofBox(0, 2.9, 1.4, 1.2, 0.3); }
    if (m.name === 'C') {
      roofBox(0, -2.1, 1.8, 1.8, 0.48); roofBox(0, 2.35, 1.6, 1.3, 0.36);
      // cable ducts
      for (const x of [-0.75, 0.75]) ext.add(M.roof, new THREE.BoxGeometry(0.12, 0.08, 6.0), mat(x, TR.roofY + 0.04, 0));
    }

    /* ------------------- interior ------------------- */
    const zi0 = isA ? cabZ : m.z0 + 0.05, zi1 = isE ? m.z1 - 0.4 : m.z1 - 0.05;
    const iw = 1.13;
    const yF = TR.yFloor;
    int.add(M.floor, (() => { const g = new THREE.BoxGeometry(iw * 2, 0.06, zi1 - zi0); const uv = g.attributes.uv; const p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + iw) / (iw * 2), p.getZ(i) / 2.4); return g; })(), mat(0, yF - 0.03, (zi0 + zi1) / 2));
    for (const side of [1, -1]) {
      const segs = side > 0 ? gaps(zi0, zi1, m.doors.map(([d0, d1]) => [d0, d1])) : [[zi0, zi1]];
      for (const [a, b] of segs) {
        const lw = new THREE.PlaneGeometry(b - a, Y_WIN0 - yF); lw.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
        int.add(M.wall, lw, mat(side * iw, (Y_WIN0 + yF) / 2, (a + b) / 2));
        int.add(M.wallDark, new THREE.BoxGeometry(0.12, 0.03, b - a), mat(side * (iw - 0.05), Y_WIN0, (a + b) / 2));
        int.add(M.wallDark, new THREE.BoxGeometry(0.06, 0.12, b - a), mat(side * (iw - 0.02), yF + 0.06, (a + b) / 2));
      }
      const uw = new THREE.PlaneGeometry(zi1 - zi0, 0.34); uw.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
      int.add(M.wall, uw, mat(side * (iw - 0.01), Y_WIN1 + 0.17, (zi0 + zi1) / 2));
    }
    // curved ceiling with LED strips and air vents
    {
      const prof = [[-iw, 2.62], [-0.95, 2.72], [-0.7, 2.78], [0.7, 2.78], [0.95, 2.72], [iw, 2.62]];
      const pos = [], id = [];
      for (const z of [zi0, zi1]) for (const [x, y] of prof) pos.push(x, y, z);
      const C = prof.length;
      for (let j = 0; j < C - 1; j++) { const a = j, b = j + 1, c = j + C, d = c + 1; id.push(a, b, c, b, d, c); }
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(id); cg.computeVertexNormals();
      if (cg.attributes.normal.getY(2) > 0) { const I = cg.index.array; for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } cg.computeVertexNormals(); }
      int.add(M.ceiling, cg);
      for (const s of [-1, 1]) {
        int.add(M.led, new THREE.BoxGeometry(0.1, 0.012, zi1 - zi0 - 0.3), mat(s * 0.62, 2.772, (zi0 + zi1) / 2));
        int.add(M.dashDark, new THREE.BoxGeometry(0.05, 0.01, zi1 - zi0 - 0.5), mat(s * 0.2, 2.777, (zi0 + zi1) / 2));
      }
    }
    // ceiling handrails + hanging straps
    for (const s of [-1, 1]) {
      const a = zi0 + 0.25, b = zi1 - 0.25;
      int.add(M.orange, new THREE.CylinderGeometry(0.018, 0.018, b - a, 8).rotateX(Math.PI / 2), mat(s * 0.56, 2.12, (a + b) / 2));
      for (let z = a + 0.2; z < b - 0.1; z += 0.42) {
        const loop = new THREE.TorusGeometry(0.075, 0.012, 6, 14); loop.scale(1, 1.45, 1); loop.rotateY(Math.PI / 2);
        int.add(M.orange, loop, mat(s * 0.56, 1.9, z));
        int.add(M.orange, new THREE.BoxGeometry(0.02, 0.12, 0.03), mat(s * 0.56, 2.06, z));
      }
      for (let z = a + 0.4; z < b; z += 1.7) int.add(M.orange, new THREE.CylinderGeometry(0.014, 0.014, 0.64, 6), mat(s * 0.56, 2.44, z));
    }
    const stanchion = (x, z, y0 = yF, y1 = 2.12) => {
      int.add(M.orange, new THREE.CylinderGeometry(0.019, 0.019, y1 - y0, 10), mat(x, (y0 + y1) / 2, z));
      int.add(M.dashDark, new THREE.CylinderGeometry(0.03, 0.035, 0.03, 10), mat(x, y0 + 0.015, z));
    };
    // doors: frames, grab poles, stop buttons, validators, glass screens, yellow thresholds
    for (const [d0, d1] of m.doors) {
      for (const z of [d0 - 0.06, d1 + 0.06]) {
        stanchion(0.95, z);
        int.add(M.red, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12).rotateZ(Math.PI / 2), mat(0.93, 1.28, z));
        rig.stopButtons.push({ section: m.name, x: 0.93, z });
        // blue-tinted glass screen beside the door
        const sc = new THREE.PlaneGeometry(0.7, 1.2);
        int.add(M.glassTint, sc, mat(0.72, 1.3, z + (z < d0 ? -0.08 : 0.08)));
        int.add(M.orange, new THREE.CylinderGeometry(0.016, 0.016, 0.7, 8).rotateZ(Math.PI / 2), mat(0.72, 1.92, z + (z < d0 ? -0.08 : 0.08)));
      }
      int.add(M.validator, roundedBox(0.2, 0.28, 0.12, 0.03), mat(0.9, 1.35, d1 + 0.2));
      int.add(M.screen, new THREE.PlaneGeometry(0.12, 0.09).rotateY(-Math.PI / 2), mat(0.795, 1.4, d1 + 0.2));
      int.add(M.yellowStrip, new THREE.BoxGeometry(0.25, 0.01, d1 - d0), mat(iw - 0.12, yF + 0.002, (d0 + d1) / 2));
      int.add(M.dashDark, new THREE.BoxGeometry(0.12, 0.012, d1 - d0), mat(iw - 0.31, yF + 0.002, (d0 + d1) / 2));
      // door-top housing with the door lamp
      int.add(M.wallDark, new THREE.BoxGeometry(0.22, 0.26, d1 - d0 + 0.2), mat(iw - 0.1, Y_DOOR + 0.15, (d0 + d1) / 2));
    }
    // TFT screen hanging from the ceiling
    {
      const zc = isA ? -0.4 : 0;
      int.add(M.dashDark, new THREE.BoxGeometry(0.68, 0.24, 0.06), mat(0, 2.55, zc));
      for (const dir of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.6, 0.19); if (dir < 0) g.rotateY(Math.PI);
        int.add(new THREE.MeshBasicMaterial({ map: displays.tft.texture, toneMapped: false }), g, mat(0, 2.55, zc + dir * 0.032));
      }
      int.add(M.steel, new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), mat(0, 2.72, zc));
    }

    /* ------------------- seats ------------------- */
    const seat = (x, z, base, yaw, fold = false) => {
      const g = mat(x, base, z, 0, yaw);
      const b = (material, geo, lm) => int.add(material, geo, g.clone().multiply(lm));
      b(M.seatShell, roundedBox(0.44, 0.06, 0.44, 0.025), mat(0, 0.42, 0));
      b(M.seatFabric, roundedBox(0.4, 0.05, 0.38, 0.02), mat(0, 0.465, -0.01));
      if (!fold) {
        b(M.seatShell, roundedBox(0.44, 0.7, 0.05, 0.03), mat(0, 0.82, 0.21, -0.14));
        b(M.seatFabric, roundedBox(0.38, 0.5, 0.03, 0.02), mat(0, 0.8, 0.18, -0.14));
        b(M.seatDark, new THREE.TorusGeometry(0.11, 0.018, 8, 16, Math.PI), mat(0, 1.2, 0.27, -0.14));
      }
      b(M.seatDark, new THREE.BoxGeometry(0.08, 0.4, 0.3), mat(0, 0.2, 0));
      rig.seats.push({ section: m.name, x, z, yaw, base });
    };
    const podium = (x0, x1, z0, z1, h = 0.26) => {
      const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0); int.add(M.floor, g, mat((x0 + x1) / 2, yF + h / 2, (z0 + z1) / 2));
      int.add(M.yellowStrip, new THREE.BoxGeometry(0.03, 0.02, z1 - z0), mat(x0 > 0 ? x0 : x1, yF + h + 0.01, (z0 + z1) / 2));
    };
    if (m.bogie) {
      // transverse 2+2 seats on podiums over the bogie
      const zRows = isA ? [-1.2, -0.4, 0.4, 1.2, 2.0] : isE ? [-0.4, 0.4, 1.2, 2.0, 2.8, 3.6] : [-2.6, -1.8, -1.0, -0.2, 0.6, 1.4, 2.2];
      const zMin = zRows[0] - 0.35, zMax = zRows[zRows.length - 1] + 0.35;
      for (const s of [-1, 1]) {
        podium(s > 0 ? 0.42 : -iw, s > 0 ? iw : -0.42, zMin, zMax);
        zRows.forEach((z, i) => {
          const yaw = (i % 2 === 0 && i < zRows.length - 1) ? Math.PI : 0; // facing pairs
          for (const x of [s * 0.62, s * 0.98]) seat(x, z, yF + 0.26, yaw);
          if (i % 2 === 1) stanchion(s * 0.45, z + 0.3);
        });
      }
    } else {
      // suspended modules: longitudinal seats and a multi-purpose area opposite the door
      for (const z of [0.6, 1.1, 1.6]) seat(0.95, z, yF, -Math.PI / 2);
      for (const z of [-1.2, -0.7]) seat(-0.95, z, yF, Math.PI / 2, true);
      int.add(M.wallDark, roundedBox(0.08, 0.5, 0.8, 0.03), mat(-iw + 0.05, 1.0, 0.6));
      int.add(M.orange, tubePath([[-iw + 0.02, 0.95, 0.1], [-iw + 0.12, 0.95, 0.1], [-iw + 0.12, 0.95, 1.2], [-iw + 0.02, 0.95, 1.2]], 0.016, 0.05), null);
      const wcs = new THREE.PlaneGeometry(0.22, 0.22); wcs.rotateY(Math.PI / 2);
      int.add(decalMat(TX.accessPictos ? TX.accessPictos() : TX.textDecal('♿', { w: 128, h: 128 })), wcs, mat(-iw + 0.02, 1.5, 0.6));
      stanchion(0.2, -1.6); stanchion(-0.2, 1.9);
    }
    if (m.name === 'C') { int.add(M.red, new THREE.CylinderGeometry(0.075, 0.075, 0.45, 16), mat(-iw + 0.12, 0.9, -3.05)); int.add(M.red, new THREE.BoxGeometry(0.28, 0.4, 0.1), mat(-iw + 0.06, 1.55, 3.0)); }

    /* ------------------- cab (module A) ------------------- */
    if (isA) {
      // raised cab floor + partition with glass and a sliding door on the right
      int.add(M.floor, new THREE.BoxGeometry(2.2, 0.3, 1.25), mat(0, yF + 0.15, -3.75));
      int.add(M.wall, new THREE.BoxGeometry(1.5, 0.95, 0.04), mat(-0.45, yF + 0.475, cabZ));
      int.add(M.glassTint, new THREE.PlaneGeometry(1.5, 1.2), mat(-0.45, yF + 1.55, cabZ));
      int.add(M.dashDark, new THREE.BoxGeometry(1.5, 0.05, 0.05), mat(-0.45, yF + 2.17, cabZ));
      int.add(M.dashDark, new THREE.BoxGeometry(0.05, 2.2, 0.06), mat(0.3, yF + 1.1, cabZ));
      int.add(M.wallDS, new THREE.BoxGeometry(0.03, 1.9, 0.62), mat(0.62, yF + 0.95, cabZ - 0.35, 0, 1.2)); // cab door, open
      // driver's seat (black/grey, centred)
      const base = yF + 0.3;
      int.add(M.driverSeat, roundedBox(0.55, 0.12, 0.52, 0.05), mat(0, base + 0.45, -3.55));
      int.add(M.driverSeat, roundedBox(0.52, 0.72, 0.12, 0.05), mat(0, base + 0.88, -3.28, -0.12));
      int.add(M.driverSeat, roundedBox(0.28, 0.18, 0.08, 0.04), mat(0, base + 1.32, -3.22));
      int.add(M.steel, new THREE.CylinderGeometry(0.05, 0.08, 0.4, 10), mat(0, base + 0.2, -3.55));
      for (const s of [-1, 1]) int.add(M.driverSeat, roundedBox(0.08, 0.06, 0.4, 0.02), mat(s * 0.32, base + 0.66, -3.55));
      // left console with the master controller (joystick) and orange accents
      int.add(M.dash, roundedBox(0.34, 0.66, 0.7, 0.05), mat(-0.52, base + 0.33, -3.7));
      int.add(M.orange, new THREE.BoxGeometry(0.34, 0.02, 0.7), mat(-0.52, base + 0.665, -3.7));
      const ctl = new THREE.Group(); ctl.position.set(-0.52, base + 0.67, -3.75);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 10), M.dashDark); knob.position.y = 0.1;
      const grip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.orange); grip.position.y = 0.21;
      ctl.add(knob, grip); body.add(ctl); rig.controller = ctl;
      // main desk under the windscreen with screens and switches
      const desk = new THREE.Shape(); desk.moveTo(-1.0, 0); desk.lineTo(1.0, 0); desk.lineTo(0.95, 0.5); desk.lineTo(-0.95, 0.5); desk.lineTo(-1.0, 0);
      const dg2 = new THREE.ExtrudeGeometry(desk, { depth: 0.08, bevelEnabled: false }); dg2.rotateX(-Math.PI / 2 + 0.45);
      int.add(M.dash, dg2, mat(0, base + 0.72, -4.1));
      int.add(M.dash, new THREE.BoxGeometry(2.0, 0.7, 0.5), mat(0, base + 0.35, -4.35));
      rig.cabScreens = new CabScreens();
      for (const [x, w, ct] of [[-0.3, 0.34, rig.cabScreens.left], [0.12, 0.31, rig.cabScreens.right]]) {
        int.add(M.dashDark, new THREE.BoxGeometry(w + 0.04, 0.22, 0.03), mat(x, base + 0.98, -4.16, -0.95));
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.18), new THREE.MeshBasicMaterial({ map: ct.texture, toneMapped: false }));
        scr.position.set(x, base + 0.98 + Math.sin(0.95) * 0.02, -4.16 + Math.cos(0.95) * 0.02); scr.rotation.x = -0.95; body.add(scr);
      }
      for (let k = 0; k < 10; k++) int.add(k % 3 ? M.dashDark : M.orange, new THREE.CylinderGeometry(0.014, 0.014, 0.015, 8), mat(-0.7 + k * 0.08, base + 0.86, -4.02, -0.45));
      // BT902 informator mounted on the right of the desk, turned to the driver
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.155), new THREE.MeshBasicMaterial({ map: informator.ct.texture, toneMapped: false }));
      const infoG = new THREE.Group(); infoG.position.set(0.62, base + 1.02, -3.98); infoG.rotation.set(-0.5, -0.55, 0, 'YXZ');
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.05), M.dashDark); box.position.z = -0.03;
      face.position.z = 0.002; infoG.add(box, face); body.add(infoG);
      rig.informatorMesh = face;
      // sun visor
      int.add(M.dashDark, new THREE.BoxGeometry(0.7, 0.015, 0.22), mat(-0.35, 2.55, -4.25, 0.2));
    }

    /* ------------------- plug doors (right side) ------------------- */
    m.doors.forEach(([d0, d1]) => {
      const leaves = [];
      const w = (d1 - d0) / 2;
      for (const dir of [-1, 1]) {
        const leaf = new THREE.Group();
        const lb = new Batch();
        const H = Y_DOOR - TR.yFloor;
        lb.add(M.black, new THREE.BoxGeometry(0.04, H, 0.05), mat(0, TR.yFloor + H / 2, dir * (w / 2 - 0.02)));
        lb.add(M.black, new THREE.BoxGeometry(0.04, H, 0.05), mat(0, TR.yFloor + H / 2, -dir * (w / 2 - 0.02)));
        lb.add(M.black, new THREE.BoxGeometry(0.04, 0.06, w), mat(0, Y_DOOR - 0.03, 0));
        const low = new THREE.PlaneGeometry(w - 0.06, 0.62); low.rotateY(Math.PI / 2);
        // lower panel keeps the livery (white + stripe)
        const uv = low.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, (0.38 + uv.getY(i) * 0.62) / 3.4);
        lb.add(M.paint, low, mat(0.021, 0.38 + 0.31, 0));
        const gl = new THREE.PlaneGeometry(w - 0.08, H - 0.7); gl.rotateY(Math.PI / 2);
        lb.add(M.glassSide, gl, mat(0.01, 1.0 + (H - 0.7) / 2, 0));
        lb.add(M.rubber, new THREE.BoxGeometry(0.05, H, 0.02), mat(0, TR.yFloor + H / 2, -dir * (w / 2 + 0.005)));
        lb.add(M.orange, new THREE.CylinderGeometry(0.016, 0.016, 0.9, 8), mat(-0.06, 1.35, dir * (w / 2 - 0.12)));
        lb.build(leaf, { name: 'tramDoor' });
        leaf.position.set(1.19, 0, (d0 + d1) / 2 - dir * w / 2);
        body.add(leaf);
        leaves.push({ mesh: leaf, dir, z0: leaf.position.z });
      }
      // door lamp + outside push button
      const lampMat = M.doorLamp.clone();
      ext.add(lampMat, new THREE.BoxGeometry(0.02, 0.05, 0.25), mat(1.205, Y_DOOR + 0.12, (d0 + d1) / 2));
      ext.add(M.black, new THREE.BoxGeometry(0.02, 0.12, 0.12), mat(1.205, 1.22, d1 + 0.12));
      ext.add(M.doorLamp, new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12).rotateZ(Math.PI / 2), mat(1.216, 1.22, d1 + 0.12));
      const door = {
        section: m.name, d0, d1, idx: rig.doors.length, leaves, open: 0, target: 0, lampMat,
        anim(e) { // plug out, then slide apart
          const out = smoothstep(0, 0.25, e) * 0.075, slide = smoothstep(0.18, 1, e) * (w - 0.04);
          for (const l of this.leaves) { l.mesh.position.x = 1.19 + out; l.mesh.position.z = l.z0 - l.dir * slide; }
        },
      };
      rig.doors.push(door);
    });

    /* ------------------- side displays, mirrors, badges ------------------- */
    if (isA) {
      const sd = new THREE.PlaneGeometry(0.9, 0.16); sd.rotateY(Math.PI / 2);
      ext.add(M.dashDark, new THREE.BoxGeometry(0.02, 0.2, 0.96), mat(1.19, 2.12, -1.1));
      ext.add(ledMat(displays.side.texture), sd, mat(1.196, 2.12, -1.1));
      for (const side of [-1, 1]) {
        const arm = [[side * 1.18, 2.35, TR.noseZ - 0.05], [side * 1.45, 2.42, TR.noseZ - 0.35], [side * 1.55, 2.3, TR.noseZ - 0.45]];
        ext.add(M.black, tubePath(arm, 0.025, 0.1), null);
        const head = new THREE.Group(); head.position.set(side * 1.56, 2.05, TR.noseZ - 0.45);
        const hb = new THREE.Mesh(roundedBox(0.2, 0.34, 0.1, 0.03), M.black); head.add(hb);
        const glassMat = M.mirrorGlass.clone();
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), glassMat); glass.position.z = 0.052; head.add(glass);
        body.add(head);
        rig.mirrors.push({ side, head, glass, glassMat });
      }
      const sw = TX.textDecal('SWING', { w: 512, h: 128, color: '#e9eef2', font: `italic 800 96px ${TX.FONT}` });
      for (const side of [1, -1]) {
        const g = new THREE.PlaneGeometry(0.62, 0.155); g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ext.add(decalMat(sw), g, mat(side * 1.207, 1.35, 0.4));
      }
    }
    if (m.name === 'B' || m.name === 'E') {
      const fl = TX.textDecal(line.fleet || '2312', { w: 256, h: 96, color: '#0f0f0f', font: `800 70px ${TX.FONT}` });
      for (const side of [1, -1]) { const g = new THREE.PlaneGeometry(0.34, 0.12); g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2); ext.add(decalMat(fl), g, mat(side * 1.206, 0.9, m.z1 - 0.5)); }
    }

    ext.build(body, { name: 'tramExt' + m.name });
    int.build(body, { name: 'tramInt' + m.name, cast: false });
    body.traverse((o) => { if (o.isMesh && o.material.transparent) { o.castShadow = false; o.receiveShadow = false; } });
  }

  /* ------------------- pantograph on module C ------------------- */
  {
    const C = rig.bodies.C;
    const pg = new THREE.Group(); pg.position.set(0, TR.roofY, 0.6); C.add(pg);
    const pb = new Batch();
    for (const x of [-0.45, 0.45]) {
      pb.add(M.steel, new THREE.BoxGeometry(0.08, 0.08, 1.5), mat(x, 0.2, 0));
      for (const z of [-0.6, 0.6]) {
        pb.add(M.insulator, new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), mat(x, 0.08, z));
        for (let k = 0; k < 3; k++) pb.add(M.insulator, new THREE.CylinderGeometry(0.085, 0.085, 0.015, 12), mat(x, 0.03 + k * 0.045, z));
      }
    }
    pb.add(M.steel, new THREE.BoxGeometry(0.98, 0.08, 0.1), mat(0, 0.24, 0.62));
    pb.build(pg, { name: 'pantoBase' });
    const unit = (r) => { const g = new THREE.CylinderGeometry(r, r, 1, 8); g.translate(0, 0.5, 0); return g; };
    const lower = new THREE.Mesh(unit(0.045), M.steel), upper1 = new THREE.Mesh(unit(0.028), M.steel), upper2 = new THREE.Mesh(unit(0.028), M.steel), damper = new THREE.Mesh(unit(0.03), M.chrome);
    const head = new THREE.Group();
    const hb = new Batch();
    hb.add(M.steel, new THREE.BoxGeometry(1.45, 0.05, 0.08), mat(0, 0, -0.18)); hb.add(M.steel, new THREE.BoxGeometry(1.45, 0.05, 0.08), mat(0, 0, 0.18));
    hb.add(M.carbon, new THREE.BoxGeometry(1.2, 0.04, 0.05), mat(0, 0.045, -0.18)); hb.add(M.carbon, new THREE.BoxGeometry(1.2, 0.04, 0.05), mat(0, 0.045, 0.18));
    for (const s of [-1, 1]) hb.add(M.steel, tubePath([[s * 0.72, 0, -0.18], [s * 0.86, -0.08, -0.1], [s * 0.86, -0.08, 0.1], [s * 0.72, 0, 0.18]], 0.018, 0.05), null);
    hb.add(M.steel, new THREE.BoxGeometry(0.1, 0.06, 0.42), mat(0, -0.03, 0));
    hb.build(head, { name: 'pantoHead' });
    for (const o of [lower, upper1, upper2, damper]) pg.add(o);
    pg.add(head);
    const hinge = V(0, 0.26, 0.62);
    rig.panto = { group: pg, lower, upper1, upper2, damper, head, hinge, l1: 1.62, l2: 1.72, h: 0.5 };
    /** Sets the pantograph head height above rail (world y of the carbon strip). */
    rig.setPantograph = (yWorld) => {
      const P = rig.panto; const hy = clamp(yWorld - TR.roofY - 0.05, 0.42, 3.2); P.h = hy;
      const H0 = P.hinge, T = V(0, hy, 0.05);
      const d = H0.distanceTo(T), a = (P.l1 * P.l1 - P.l2 * P.l2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, P.l1 * P.l1 - a * a));
      const dir = T.clone().sub(H0).normalize();
      const perp = V(0, -dir.z, dir.y); if (perp.z > 0) perp.negate(); // knee points forward (−z)
      const knee = H0.clone().addScaledVector(dir, a).addScaledVector(perp, hgt);
      const orient = (mesh, A, Bv, off = 0) => {
        const v = Bv.clone().sub(A); const L = v.length();
        mesh.position.copy(A); mesh.position.x += off; mesh.scale.set(1, L, 1);
        mesh.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize());
      };
      orient(P.lower, H0, knee); orient(P.upper1, knee, T, -0.08); orient(P.upper2, knee, T, 0.08);
      orient(P.damper, V(0, 0.24, 0.1), knee.clone().lerp(H0, 0.45));
      P.head.position.copy(T);
    };
    rig.setPantograph(TR.roofY + 0.5);
  }

  /* ------------------- bellows (world-space, updated every frame) ------------------- */
  {
    const grp = new THREE.Group(); grp.name = 'tramBellows';
    rig.roots.push(grp);
    const ringExt = [], ringInt = [];
    for (let i = 1; i < PROF.length; i++) ringExt.push([PROF[i][0] * 0.975, PROF[i][1] - 0.01]);
    const extRing = [...ringExt, ...ringExt.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); ringInt.push([Math.cos(a) * 0.74, 2.3 + Math.sin(a) * 0.45]); }
    const intRing = [[0.74, 0.36], ...ringInt, [-0.74, 0.36]];
    const K = 6;
    rig.bellows = [];
    for (let i = 0; i < TR.modules.length - 1; i++) {
      const a = TR.modules[i], b = TR.modules[i + 1];
      for (const [ring, material] of [[extRing, M.bellows], [intRing, M.bellowsIn]]) {
        const R = ring.length;
        const pos = new Float32Array((K + 1) * R * 3), uv = [], idx = [];
        for (let k = 0; k <= K; k++) for (let j = 0; j < R; j++) uv.push((k / K) * 4, j / (R - 1));
        for (let k = 0; k < K; k++) for (let j = 0; j < R - 1; j++) { const p = k * R + j, q = p + 1, r2 = p + R, s2 = r2 + 1; idx.push(p, r2, q, q, r2, s2); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
        const mesh = new THREE.Mesh(g, material); mesh.frustumCulled = false; mesh.castShadow = material === M.bellows; mesh.receiveShadow = true;
        grp.add(mesh);
        rig.bellows.push({ a: a.name, b: b.name, za: a.z1 - 0.01, zb: b.z0 + 0.01, ring, mesh, K });
      }
      // turntable floor plate
    }
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    rig.updateBellows = () => {
      for (const bl of rig.bellows) {
        const A = rig.bodies[bl.a].matrixWorld, Bm = rig.bodies[bl.b].matrixWorld;
        const arr = bl.mesh.geometry.attributes.position.array; const R = bl.ring.length;
        for (let j = 0; j < R; j++) {
          const [x, y] = bl.ring[j];
          va.set(x, y, bl.za).applyMatrix4(A); vb.set(x, y, bl.zb).applyMatrix4(Bm);
          for (let k = 0; k <= bl.K; k++) {
            const t = k / bl.K, i3 = (k * R + j) * 3;
            const bulge = Math.sin(t * Math.PI) * 0.012;
            arr[i3] = va.x + (vb.x - va.x) * t + (x > 0 ? bulge : -bulge) * 0; arr[i3 + 1] = va.y + (vb.y - va.y) * t; arr[i3 + 2] = va.z + (vb.z - va.z) * t;
          }
        }
        bl.mesh.geometry.attributes.position.needsUpdate = true;
        bl.mesh.geometry.computeVertexNormals();
      }
    };
  }

  /* ------------------- generic vehicle description ------------------- */
  rig.hw = TR.hw; rig.yFloor = TR.yFloor;
  const mods = TR.modules;
  rig.sections = mods.map((m, i) => ({
    name: m.name,
    z0: i === 0 ? -3.05 : m.z0 - 0.18, z1: i === mods.length - 1 ? m.z1 - 0.45 : m.z1 + 0.18,
    oz0: m.z0 - 0.2, oz1: m.z1 + 0.2,
    raised: i === 0 ? (x, z) => z < -3.12 : null,
  }));
  // the cab sits in front of the partition; walking in via the gap next to door 1
  rig.sections[0].z0 = -4.2;
  rig.cab = { section: 'A', inside: (x, z) => z < -3.2, partition: { z: -3.1, xMax: 0.32 }, exit: V(0.55, 0, -2.6) };
  rig.eye = { section: 'A', pos: TR.eye.clone() };
  rig.interiorEye = { section: 'E', pos: V(0, 1.68, 3.3) };
  rig.startSpot = { section: 'A', pos: V(TR.hw + 2.3, 0, -1.2), look: V(TR.hw, 0, -2.35) };
  rig.doors.forEach((d) => { d.cabDoor = false; });
  rig.steeringWheel = null; rig.speedNeedle = null;
  return rig;
}
export { xform };

// Trolleybus overhead contact system: poles, span wires, hangers, contact wires, street lamps.
import * as THREE from 'three';
import { WM } from './materials.js';
import { Polyline } from '../path.js';
import { mat, clamp, wrapAngle } from '../util.js';

export const WIRE_Y = 5.8, WIRE_SEP = 0.3;

export function buildCatenary(route, cb, scene, occ) {
  const lines = []; // flat array of segment endpoints
  const seg = (a, b) => { lines.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const poles = [];
  const bus = route.bus;
  const o = {};

  // ---- support points along the bus route ----
  const sup = [];
  let last = -1e9, lastH = null;
  for (let s = 0; s <= bus.length; s += 1) {
    bus.at(s, o);
    const ahead = bus.at(Math.min(bus.length, s + 10), {});
    const curv = Math.abs(wrapAngle(ahead.h - o.h));
    const spacing = curv > 0.12 ? 5.5 : curv > 0.03 ? 12 : 28;
    const turned = lastH !== null && Math.abs(wrapAngle(o.h - lastH)) > 0.16;
    if (s - last >= spacing || turned || s === 0) {
      sup.push({ s, x: o.x, z: o.z, h: o.h });
      last = s; lastH = o.h;
    }
  }
  bus.at(bus.length, o); sup.push({ s: bus.length, x: o.x, z: o.z, h: o.h });

  // contact wire polylines (straight chords between supports) — used by the pole simulation
  const wl = [], wr = [];
  for (const p of sup) {
    const rx = -Math.sin(p.h), rz = Math.cos(p.h);
    wl.push([p.x - rx * WIRE_SEP, p.z - rz * WIRE_SEP]);
    wr.push([p.x + rx * WIRE_SEP, p.z + rz * WIRE_SEP]);
  }
  const wireL = new Polyline(wl), wireR = new Polyline(wr);
  for (const w of [wl, wr]) for (let i = 0; i < w.length - 1; i++) seg([w[i][0], WIRE_Y, w[i][1]], [w[i + 1][0], WIRE_Y, w[i + 1][1]]);

  // opposite direction wires (sampled independently)
  const opp = route.opp;
  const osup = [];
  last = -1e9; lastH = null;
  for (let s = 0; s <= opp.length; s += 1) {
    opp.at(s, o);
    const ahead = opp.at(Math.min(opp.length, s + 10), {});
    const curv = Math.abs(wrapAngle(ahead.h - o.h));
    const spacing = curv > 0.12 ? 5.5 : curv > 0.03 ? 12 : 28;
    if (s - last >= spacing || (lastH !== null && Math.abs(wrapAngle(o.h - lastH)) > 0.16)) { osup.push({ x: o.x, z: o.z, h: o.h }); last = s; lastH = o.h; }
  }
  opp.at(opp.length, o); osup.push({ x: o.x, z: o.z, h: o.h });
  for (const side of [-1, 1]) for (let i = 0; i < osup.length - 1; i++) {
    const a = osup[i], b = osup[i + 1];
    seg([a.x - Math.sin(a.h) * side * WIRE_SEP, WIRE_Y, a.z + Math.cos(a.h) * side * WIRE_SEP], [b.x - Math.sin(b.h) * side * WIRE_SEP, WIRE_Y, b.z + Math.cos(b.h) * side * WIRE_SEP]);
  }
  const oppWire = new Polyline(osup.map((p) => [p.x, p.z]));

  // ---- structures ----
  const R = route.ring;
  const cornerPoles = new Map();
  const inInter = (x, z) => route.inters.find((it) => Math.hypot(x - it.x, z - it.z) < 27);
  const onStreet = (x, z) => {
    let best = null;
    for (const st of route.streets) {
      if (st.minor) continue;
      const pr = st.poly.project(x, z);
      if (pr.d < st.halfW - 0.2 && pr.s > 1 && pr.s < st.poly.length - 1 && (!best || pr.d < best.pr.d)) best = { st, pr };
    }
    return best;
  };
  const addPole = (x, z, h = 8.6, kind = 'steel', lampDir = null) => {
    // avoid duplicates
    for (const p of poles) if (Math.hypot(p.x - x, p.z - z) < 1.5) return p;
    const p = { x, z, h, kind };
    poles.push(p);
    const g = kind === 'concrete' ? new THREE.CylinderGeometry(0.13, 0.2, h, 8) : new THREE.CylinderGeometry(0.1, 0.15, h, 12);
    cb.add(kind === 'concrete' ? WM.concrete : WM.metal, g, mat(x, h / 2, z));
    cb.add(WM.metalDark, new THREE.CylinderGeometry(0.22, 0.24, 0.3, 12), mat(x, 0.15, z));
    cb.add(WM.metal, new THREE.SphereGeometry(0.12, 8, 6), mat(x, h + 0.02, z));
    // span clamp band
    cb.add(WM.metalDark, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), mat(x, 7.0, z));
    if (lampDir !== null) {
      const ax = Math.cos(lampDir), az = Math.sin(lampDir);
      const L = 2.2;
      cb.add(WM.metal, new THREE.CylinderGeometry(0.05, 0.05, L, 8).rotateZ(Math.PI / 2 - 0.12), mat(x + ax * L / 2, h - 0.35, z + az * L / 2, 0, -lampDir));
      cb.add(WM.metalDark, new THREE.BoxGeometry(0.7, 0.12, 0.32), mat(x + ax * (L + 0.2), h - 0.25, z + az * (L + 0.2), 0, -lampDir));
      cb.add(WM.emissive, new THREE.BoxGeometry(0.5, 0.02, 0.22), mat(x + ax * (L + 0.2), h - 0.32, z + az * (L + 0.2), 0, -lampDir), 0x444444);
    }
    occ.markDisc(x, z, 1, 1);
    return p;
  };
  const span = (a, b, points) => {
    // span wire between two anchors with sag, hangers down to contact points
    const ya = 7.0, yb = 7.0;
    const N = 12, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push([a[0] + (b[0] - a[0]) * t, ya + (yb - ya) * t - Math.sin(Math.PI * t) * 0.55, a[1] + (b[1] - a[1]) * t]);
    }
    for (let i = 0; i < N; i++) seg(pts[i], pts[i + 1]);
    for (const c of points) {
      // project c onto the span
      const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1;
      const t = clamp(((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / L2, 0, 1);
      const sy = ya + (yb - ya) * t - Math.sin(Math.PI * t) * 0.55;
      seg([c[0], sy, c[1]], [c[0], WIRE_Y + 0.05, c[1]]);
      cb.add(WM.metalDark, new THREE.BoxGeometry(0.1, 0.06, 0.1), mat(c[0], WIRE_Y + 0.06, c[1]));
    }
  };

  let k = 0;
  for (const p of sup) {
    k++;
    const rx = -Math.sin(p.h), rz = Math.cos(p.h);
    const contacts = [[p.x - rx * WIRE_SEP, p.z - rz * WIRE_SEP], [p.x + rx * WIRE_SEP, p.z + rz * WIRE_SEP]];
    // opposite wires near this support (cross-spans carry both directions)
    const op = oppWire.project(p.x, p.z);
    const it = inInter(p.x, p.z);
    const dRing = Math.hypot(p.x - R.cx, p.z - R.cz);
    if (dRing < R.rOut + 4 && p.z > -26) {
      // Borovo loop: radial span from outer pole to a central mast on the island
      const ux = (p.x - R.cx) / dRing, uz = (p.z - R.cz) / dRing;
      const pole = addPole(R.cx + ux * (R.rOut + 2.2), R.cz + uz * (R.rOut + 2.2), 8.8, 'concrete');
      span([pole.x, pole.z], [R.cx + ux * 0.4, R.cz + uz * 0.4], contacts);
      continue;
    }
    if (it) {
      // intersection: hang from the two nearest corner poles
      if (!cornerPoles.has(it)) {
        const hA = it.a.st.poly.at(it.a.s).h; const E = 7 + it.rc;
        const arr = [];
        for (const su of [-1, 1]) for (const sv of [-1, 1]) {
          const lx = su * (E - (it.rc - 2.2) * 0.72), lz = sv * (E - (it.rc - 2.2) * 0.72);
          const x = it.x + Math.cos(hA) * lx - Math.sin(hA) * lz, z = it.z + Math.sin(hA) * lx + Math.cos(hA) * lz;
          arr.push(addPole(x, z, 9.2, 'steel', null));
        }
        cornerPoles.set(it, arr);
      }
      const cps = cornerPoles.get(it).slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      span([cps[0].x, cps[0].z], [p.x, p.z], contacts);
      span([cps[1].x, cps[1].z], [p.x, p.z], []);
      continue;
    }
    const on = onStreet(p.x, p.z);
    if (on && op.d < 30) {
      const { st, pr } = on;
      const sh = st.poly.at(pr.s).h;
      const same = Math.cos(p.h - sh) > 0;
      const latT = same ? pr.lat : -pr.lat;
      const dR = st.halfW - latT + 0.75, dL = st.halfW + latT + 0.75;
      const lamp = k % 2 === 0;
      const A = addPole(p.x + rx * dR, p.z + rz * dR, 8.6, 'steel', lamp ? Math.atan2(-rz, -rx) : null);
      const Bp = addPole(p.x - rx * dL, p.z - rz * dL, 8.6, 'steel', lamp ? Math.atan2(rz, rx) : null);
      const oc = oppWire.at(op.s);
      const orx = -Math.sin(oc.h), orz = Math.cos(oc.h);
      const opc = [[oc.x - orx * WIRE_SEP, oc.z - orz * WIRE_SEP], [oc.x + orx * WIRE_SEP, oc.z + orz * WIRE_SEP]];
      span([A.x, A.z], [Bp.x, Bp.z], [...contacts, ...(op.d < 16 ? opc : [])]);
      continue;
    }
    // fallback: bracket pole on the outside of the curve
    const ahead = bus.at(Math.min(bus.length, p.s + 8), {});
    const turnRight = wrapAngle(ahead.h - p.h) > 0;
    const side = turnRight ? -1 : 1;
    const d = 4.2;
    const pole = addPole(p.x + rx * side * d, p.z + rz * side * d, 8.2, 'steel');
    span([pole.x, pole.z], [p.x - rx * side * 0.8, p.z - rz * side * 0.8], contacts);
  }

  // section insulators every ~420 m (little dark blocks on the wires)
  for (let s = 200; s < bus.length; s += 420) {
    const q = bus.at(s, {});
    cb.add(WM.metalDark, new THREE.BoxGeometry(1.2, 0.08, 0.8), mat(q.x, WIRE_Y + 0.02, q.z, 0, -q.h));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const wires = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1b1c1e, fog: true }));
  wires.frustumCulled = false;
  wires.name = 'wires';
  scene.add(wires);
  return { wireL, wireR, poles, supports: sup, wires };
}

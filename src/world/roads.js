// Roads, intersections, Borovo terminal plaza, sidewalks, curbs and markings.
import * as THREE from 'three';
import { WM } from './materials.js';
import { stripGeo, polyGeo, circlePts, hmat } from './common.js';
import { smoothstep, clamp } from '../util.js';

const Y_ROAD = 0.0, Y_WALK = 0.15, Y_PAINT = 0.012;

export function streetPts(st, sA, sB, step = 2) {
  const out = []; const o = {};
  const n = Math.max(1, Math.ceil(Math.abs(sB - sA) / step));
  for (let k = 0; k <= n; k++) { st.poly.at(sA + ((sB - sA) * k) / n, o); out.push([o.x, o.z]); }
  return out;
}

/** Road-wear vertex colour across a 4-lane carriageway. */
export function wear(l) {
  const a = Math.abs(l);
  let c = 1;
  for (const lc of [1.75, 5.25]) {
    const d = a - lc;
    c -= 0.07 * Math.exp(-((d / 0.35) ** 2));
    c += 0.04 * Math.exp(-(((Math.abs(d) - 0.95) / 0.3) ** 2));
  }
  c -= 0.08 * smoothstep(6.2, 7.0, a);
  return c;
}

/** Intervals of [0, L] not covered by the given gaps. */
export function openIntervals(L, gaps) {
  gaps.sort((a, b) => a[0] - b[0]);
  const out = []; let s = 0;
  for (const [a, b] of gaps) { if (a > s) out.push([s, Math.min(a, L)]); s = Math.max(s, b); }
  if (s < L) out.push([s, L]);
  return out.filter(([a, b]) => b - a > 0.5);
}

export function buildRoads(route, cb, occ) {
  const info = { walkPaths: [], crossings: [], sideGaps: new Map() };
  const { streets, inters, minors } = route;

  // ---------- gaps per street ----------
  const gapsRoad = new Map(), gapsWalk = new Map();
  for (const st of streets) { gapsRoad.set(st, []); gapsWalk.set(st, { '1': [], '-1': [] }); }
  for (const it of inters) {
    for (const arm of [it.a, it.b]) {
      const E = arm.st.halfW + it.rc;
      gapsRoad.get(arm.st).push([arm.s - E, arm.s + E]);
      for (const side of ['1', '-1']) gapsWalk.get(arm.st)[side].push([arm.s - E, arm.s + E]);
    }
  }
  for (const m of minors) {
    const E = m.halfW + 5;
    gapsWalk.get(m.join.st)[String(m.join.side)].push([m.join.s - E, m.join.s + E]);
  }
  info.sideGaps = gapsWalk;

  // ---------- street ribbons, sidewalks, curbs, markings ----------
  for (const st of streets) {
    const L = st.poly.length;
    const hw = st.halfW, sw = st.sidewalk;
    const minor = st.minor;
    for (const [a, b] of openIntervals(L, gapsRoad.get(st).slice())) {
      const pts = streetPts(st, a, b, 2);
      // carriageway
      const across = minor ? 4 : 28;
      addStrip(cb, WM.asphalt, stripGeo(pts, -hw, hw, Y_ROAD, Y_ROAD, { uvScale: 5, across, vOffset: a, colorFn: minor ? null : (l) => wear(l) }));
      markRoadOcc(occ, pts, hw, 3);
      if (!minor) markings(cb, st, a, b, pts);
      else {
        // dashed centre line on minor streets
        for (let s = a + 2; s < b - 3; s += 6) addStrip(cb, WM.paint, stripGeo(streetPts(st, s, s + 2.5, 2.5), -0.06, 0.06, Y_PAINT));
      }
    }
    for (const side of [1, -1]) {
      for (const [a, b] of openIntervals(L, gapsWalk.get(st)[String(side)].slice())) {
        const pts = streetPts(st, a, b, 2);
        const l0 = side * hw, l1 = side * (hw + sw);
        addStrip(cb, WM.pavers, stripGeo(pts, Math.min(l0, l1), Math.max(l0, l1), Y_WALK, Y_WALK, { uvScale: 2, vOffset: a }));
        // curb top + face
        addStrip(cb, WM.curb, stripGeo(pts, Math.min(l0, l0 + side * 0.2), Math.max(l0, l0 + side * 0.2), Y_WALK + 0.005, Y_WALK + 0.005, { uvScale: 1 }));
        addStrip(cb, WM.curb, stripGeo(pts, l0, l0, Y_ROAD, Y_WALK + 0.005, { uvScale: 1 }));
        // outer edge down to the lawn
        addStrip(cb, WM.curb, stripGeo(pts, l1, l1, -0.06, Y_WALK, { uvScale: 1 }));
        markRoadOcc(occ, pts, 0, 2, l0, l1);
        info.walkPaths.push({ st, side, a, b, lat: side * (hw + sw * 0.55) });
      }
    }
  }

  // ---------- intersections ----------
  for (const it of inters) {
    const hA = it.a.st.poly.at(it.a.s).h;
    const w = 7, E = w + it.rc, rc = it.rc;
    const M = hmat(it.x, 0, it.z, hA);
    const add = (mat, g) => { g.applyMatrix4(M); fixUV(g); addStrip(cb, mat, g); };
    add(WM.asphalt, rectGeo(-E, E, -w, w, Y_ROAD));
    add(WM.asphalt, rectGeo(-w, w, -E, E, Y_ROAD));
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const cx = su * E, cz = sv * E;
      // asphalt corner fan
      const fanPts = cornerArc(cx, cz, rc, su, sv, 16);
      add(WM.asphalt, fanGeo([su * w, sv * w], fanPts, Y_ROAD));
      // sidewalk quarter annulus
      const inner = cornerArc(cx, cz, rc - 4.5, su, sv, 16);
      add(WM.pavers, annulusGeo(fanPts, inner, Y_WALK));
      add(WM.curb, wallAlong(fanPts, Y_ROAD, Y_WALK + 0.005));
      add(WM.curb, wallAlong(inner, -0.06, Y_WALK));
      occ.markDisc(it.x, it.z, E + 2, 3);
    }
    // crossings (for pedestrians) — 4 arms
    for (const arm of [it.a, it.b]) for (const sgn of [-1, 1]) {
      const p = arm.st.poly.at(arm.s + sgn * 22);
      info.crossings.push({ inter: it, st: arm.st, x: p.x, z: p.z, h: p.h, group: it.groups[arm.st.id] === 'A' ? 'B' : 'A', len: 14 });
    }
  }

  // ---------- minor T-junction mouths ----------
  for (const m of minors) {
    const { st, s, side } = m.join;
    const p = st.poly.at(s);
    const h = p.h;
    const M = hmat(p.x, 0, p.z, h);
    const add = (mat, g) => { g.applyMatrix4(M); fixUV(g); addStrip(cb, mat, g); };
    const hwM = m.halfW, rcM = 5, hw = st.halfW;
    // local frame: +x along main street, +z right of main street. minor goes to side*z.
    for (const su of [-1, 1]) {
      const cx = su * (hwM + rcM), cz = side * (hw + rcM);
      const fan = cornerArc(cx, cz, rcM, su, side, 10);
      add(WM.asphalt, fanGeo([su * hwM, side * hw], fan, Y_ROAD + 0.001));
      const inner = cornerArc(cx, cz, Math.max(0.3, rcM - 3.2), su, side, 10);
      add(WM.pavers, annulusGeo(fan, inner, Y_WALK));
      add(WM.curb, wallAlong(fan, Y_ROAD, Y_WALK + 0.005));
    }
  }

  // ---------- Borovo terminal plaza ----------
  const R = route.ring;
  const outline = [];
  outline.push([7, -48], [7, -46]);
  for (let t = 0; t <= 1.0001; t += 0.1) { // bezier to the ring
    const P0 = [7, -46], P1 = [7.5, -33], P2 = [16.2, -23.2];
    outline.push([(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]]);
  }
  const aR = Math.atan2(-23.2, 16.2), aL = Math.atan2(-23.2, -16.2) + Math.PI * 2;
  outline.push(...circlePts(R.cx, R.cz, R.rOut, aR, aL, 72).slice(1));
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const P0 = [-16.2, -23.2], P1 = [-7.5, -33], P2 = [-7, -46];
    outline.push([(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]]);
  }
  outline.push([-7, -48]);
  const island = circlePts(R.cx, R.cz, R.rIn, 0, Math.PI * 2, 64).slice(0, -1);
  const plaza = polyGeo(dedupe(outline), Y_ROAD, [island.slice().reverse()], 5);
  addStrip(cb, WM.asphalt, plaza);
  occ.markDisc(0, 0, R.rOut + 1, 3); occ.markRect(0, -38, Math.PI / 2, 12, 18, 3);
  // island: raised grass + curb
  addStrip(cb, WM.grass, polyGeo(island, Y_WALK - 0.02, [], 6));
  addStrip(cb, WM.curb, wallLoop(island, Y_ROAD, Y_WALK));
  // outer curb & sidewalk band around the plaza (except the S1 mouth)
  const outerPath = dedupe(outline).slice(1, -1);
  addStrip(cb, WM.curb, wallAlong(outerPath, Y_ROAD, Y_WALK + 0.005));
  const walkOuter = offsetPath(outerPath, 5);
  addStrip(cb, WM.pavers, annulusGeo(outerPath, walkOuter, Y_WALK));
  addStrip(cb, WM.curb, wallAlong(walkOuter, -0.06, Y_WALK));
  // stop platform on the west side (Borovo stop) — wide paved area
  addStrip(cb, WM.pavers, polyGeo([[-46, -22], [-31.5, -22], [-29.2, -10], [-28.7, 0], [-29.2, 10], [-31.5, 22], [-46, 22]], Y_WALK + 0.004, [], 2));
  occ.markRect(-38, 0, Math.PI / 2, 24, 9, 2);
  // yellow curb paint at the stop
  const stopCurb = circlePts(0, 0, R.rOut + 0.02, Math.PI * 0.86, Math.PI * 1.1, 12);
  addStrip(cb, WM.painted, wallAlong(stopCurb, Y_ROAD + 0.01, Y_WALK + 0.01), 0xf2c200);
  // ring lane divider (dashed)
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const pts = circlePts(0, 0, 23.9, a, a + 0.1, 3);
    addStrip(cb, WM.paint, stripGeo(pts, -0.06, 0.06, Y_PAINT));
  }
  info.walkPaths.push({ ring: true, pts: offsetPath(outerPath, 2.5) });
  return info;
}

/* ---------------- markings on major streets ---------------- */
function markings(cb, st, a, b, pts) {
  const inters = st._inters || [];
  void inters;
  // centre double solid line
  addStrip(cb, WM.paint, stripGeo(pts, -0.19, -0.07, Y_PAINT));
  addStrip(cb, WM.paint, stripGeo(pts, 0.07, 0.19, Y_PAINT));
  // lane dividers (dashed 3 m / 6 m gap)
  for (let s = Math.ceil(a / 9) * 9 + 1; s < b - 3.5; s += 9) {
    const seg = streetPts(st, s, s + 3, 3);
    for (const l of [-3.5, 3.5]) addStrip(cb, WM.paint, stripGeo(seg, l - 0.06, l + 0.06, Y_PAINT));
  }
}

/** Stop lines and zebra crossings at signalised intersections. */
export function intersectionMarkings(route, cb) {
  for (const it of route.inters) {
    for (const arm of [it.a, it.b]) {
      const st = arm.st;
      for (const dir of [1, -1]) {
        // zebra 20..24 m from centre
        const s0 = arm.s + dir * 20, s1 = arm.s + dir * 24;
        for (let l = -6.6; l <= 6.6; l += 1.1) addStrip(cb, WM.paint, stripGeo(streetPts(st, Math.min(s0, s1), Math.max(s0, s1), 4), l - 0.28, l + 0.28, Y_PAINT));
        // stop line for traffic approaching (travelling towards centre): on the right of that traffic
        const sl = arm.s - dir * 25.5;
        const side = dir; // traffic moving +s (dir=1) is on the right (positive lateral)
        addStrip(cb, WM.paint, stripGeo(streetPts(st, sl - 0.22, sl + 0.22, 0.44), side > 0 ? 0.2 : -6.8, side > 0 ? 6.8 : -0.2, Y_PAINT));
      }
    }
  }
}

/* ---------------- geometry helpers ---------------- */
export function addStrip(cb, mat, g, color) {
  if (color !== undefined) {
    const n = g.attributes.position.count; const c = new THREE.Color(color); const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  cb.add(mat, g);
}
export function rectGeo(u0, u1, v0, v1, y) {
  const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0); g.rotateX(-Math.PI / 2); g.translate((u0 + u1) / 2, y, (v0 + v1) / 2);
  return g;
}
export function cornerArc(cx, cz, r, su, sv, n) {
  // arc of the corner circle facing the intersection centre (from the su-arm edge to the sv-arm edge)
  const aStart = Math.atan2(0, -su), aEnd = Math.atan2(-sv, 0);
  let d = aEnd - aStart; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const out = [];
  for (let i = 0; i <= n; i++) { const a = aStart + (d * i) / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}
export function fanGeo(corner, arc, y) {
  const pos = [];
  for (let i = 0; i < arc.length - 1; i++) pos.push(corner[0], y, corner[1], arc[i][0], y, arc[i][1], arc[i + 1][0], y, arc[i + 1][1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fixUp(g); return g;
}
export function annulusGeo(outer, inner, y) {
  const pos = [];
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i], b = outer[i + 1], c = inner[i], d = inner[i + 1];
    pos.push(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1], b[0], y, b[1], c[0], y, c[1], d[0], y, d[1]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fixUp(g); fixUV(g, 2); return g;
}
export function wallAlong(pts, y0, y1) {
  const pos = [], uv = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    pos.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], a[0], y1, a[1], b[0], y0, b[1], b[0], y1, b[1]);
    uv.push(s, y0, s + L, y0, s, y1, s, y1, s + L, y0, s + L, y1);
    s += L;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
function wallLoop(pts, y0, y1) { return wallAlong([...pts, pts[0]], y0, y1); }
export function fixUp(g) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], bz = p[i + 8] - p[i + 2];
    const ny = az * bx - ax * bz;
    if (ny < 0) { for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } }
  }
  g.computeVertexNormals();
}
export function fixUV(g, scale = 5) {
  const p = g.attributes.position; const n = p.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getZ(i) / scale; }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (!g.attributes.normal) g.computeVertexNormals();
}
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const q = out[out.length - 1]; if (Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) > 0.05) out.push(pts[i]); }
  return out;
}
/** Offset an open path to its left (outwards for a CCW-ish plaza outline) by d. */
function offsetPath(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // outward = away from plaza centre
    let nx = -dz, nz = dx;
    const cx = pts[i][0], cz = pts[i][1];
    if (nx * cx + nz * (cz + 10) < 0) { nx = -nx; nz = -nz; }
    out.push([cx + nx * d, cz + nz * d]);
  }
  return out;
}
export function markRoadOcc(occ, pts, hw, v, l0, l1) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    let dx = q[0] - r[0], dz = q[1] - r[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const a = l0 !== undefined ? Math.min(l0, l1) : -hw, b = l0 !== undefined ? Math.max(l0, l1) : hw;
    for (let l = a; l <= b; l += 1) { const i2 = occ.idx(p[0] - dz * l, p[1] + dx * l); if (i2 >= 0 && occ.a[i2] < v) occ.a[i2] = v; }
  }
}
export { clamp };

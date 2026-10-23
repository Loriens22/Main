// Geometry of the one-piece hard-shell City seat of the MAN Lion's City (light-grey shell, dark charcoal
// cap with a through grab slot, embossed lion oval, recess panel on the back) and of the wheelchair-bay
// fold-up seat with the moquette back. Seat-local frame: origin on the floor under the pan centre,
// x right, y up, +z toward the backrest (yaw 0 faces forward = -z). Dimensions: interior_spec.md section 1.
import * as THREE from 'three';

// side profile of the sitting face (z, y): dished pan, then the raked backrest up to the cap
const FRONT = [[-0.222, 0.458], [-0.12, 0.452], [-0.02, 0.44], [0.1, 0.428], [0.18, 0.436], [0.215, 0.5], [0.238, 0.62], [0.258, 0.8], [0.2765, 0.93]];
// underside and rear face
const BACK = [[-0.225, 0.405], [-0.205, 0.386], [0.205, 0.386], [0.25, 0.47], [0.305, 0.7], [0.3395, 0.93]];
const PAN_END_F = 5, PAN_END_B = 3; // index of the pan/backrest corner in FRONT / BACK (exclusive end of the pan run)
const HW = 0.205; // surface half width (the rim bulges to 0.22)
export const CAP_Y0 = 0.93, CAP_TOP = 1.088;
const CAP_COUNT_Z = 0.3145; // z of the cap mid plane at y = 1.0
const RAKE = 0.1; // dz/dy of the cap

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** n+1 points at uniform arc length along a polyline. */
function resample(poly, n) {
  const len = [0];
  for (let i = 1; i < poly.length; i++) len.push(len[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = len[len.length - 1];
  const out = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * total;
    while (k < poly.length - 2 && len[k + 1] < d) k++;
    const t = (d - len[k]) / (len[k + 1] - len[k] || 1);
    out.push(lerp2(poly[k], poly[k + 1], Math.min(1, Math.max(0, t))));
  }
  return out;
}

/** Pan + backrest shell (grey) as one smooth closed mesh; the top end is hidden under the cap. */
function buildShell(low) {
  const nPan = low ? 4 : 8, nBack = low ? 8 : 14, M = low ? 6 : 12;
  const topPan = resample(FRONT.slice(0, PAN_END_F + 1), nPan), topBack = resample(FRONT.slice(PAN_END_F), nBack);
  const botPan = resample(BACK.slice(0, PAN_END_B + 1), nPan), botBack = resample(BACK.slice(PAN_END_B), nBack);
  const top = [...topPan, ...topBack.slice(1)], bot = [...botPan, ...botBack.slice(1)];
  const C = top.length - 1;
  // outward normals of the sitting face and the dish weights
  const nrm = top.map((p, i) => {
    const a = top[Math.max(0, i - 1)], b = top[Math.min(C, i + 1)];
    const tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty) || 1;
    return [-ty / l, tz / l]; // (z, y)
  });
  const win = top.map((_, i) => {
    const f = i <= nPan ? i / nPan : (i - nPan) / nBack;
    const run = i <= nPan ? 0.0105 : 0.0125;
    return Math.sin(Math.PI * Math.min(1, Math.max(0, f))) * run;
  });
  const pos = [];
  const refs = []; // per vertex: interior reference (x, y, z)
  const vid = (x, y, z, ref) => { pos.push(x, y, z); refs.push(ref); return pos.length / 3 - 1; };
  const xs = Array.from({ length: M + 1 }, (_, j) => -HW + (2 * HW * j) / M);
  const mid = (i) => [(top[i][0] + bot[i][0]) / 2, (top[i][1] + bot[i][1]) / 2];
  const T = [], B = [];
  for (let j = 0; j <= M; j++) {
    T.push([]); B.push([]);
    const u = xs[j] / HW, d = 1 - u * u;
    for (let i = 0; i <= C; i++) {
      const m = mid(i), ref = [0, m[1], m[0]];
      const dd = win[i] * d;
      T[j].push(vid(xs[j], top[i][1] - nrm[i][1] * dd, top[i][0] - nrm[i][0] * dd, ref));
      B[j].push(vid(xs[j], bot[i][1], bot[i][0], ref));
    }
  }
  const idx = [];
  const tri = (a, b, c) => idx.push(a, b, c);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(c, b, d); };
  for (let j = 0; j < M; j++) for (let i = 0; i < C; i++) {
    quad(T[j][i], T[j][i + 1], T[j + 1][i], T[j + 1][i + 1]);
    quad(B[j][i], B[j + 1][i], B[j][i + 1], B[j + 1][i + 1]);
  }
  // side rims (half-round): top edge, bulge, bottom edge
  for (const s of [0, 1]) {
    const j = s ? M : 0, sg = s ? 1 : -1;
    const R = [];
    for (let i = 0; i <= C; i++) {
      const m = mid(i);
      const t = pos.slice(T[j][i] * 3, T[j][i] * 3 + 3), b = pos.slice(B[j][i] * 3, B[j][i] * 3 + 3);
      R.push(vid(sg * (HW + 0.015), (t[1] + b[1]) / 2, (t[2] + b[2]) / 2, [0, m[1], m[0]]));
    }
    for (let i = 0; i < C; i++) {
      quad(T[j][i], T[j][i + 1], R[i], R[i + 1]);
      quad(R[i], R[i + 1], B[j][i], B[j][i + 1]);
    }
  }
  // rounded pan front lip
  const lip = [];
  for (let j = 0; j <= M; j++) {
    const t = pos.slice(T[j][0] * 3, T[j][0] * 3 + 3), b = pos.slice(B[j][0] * 3, B[j][0] * 3 + 3);
    lip.push(vid(t[0], (t[1] + b[1]) / 2, Math.min(t[2], b[2]) - 0.012, [0, mid(0)[1], mid(0)[0]]));
  }
  for (let j = 0; j < M; j++) {
    quad(T[j][0], T[j + 1][0], lip[j], lip[j + 1]);
    quad(lip[j], lip[j + 1], B[j][0], B[j + 1][0]);
  }
  // flat end strip at the top of the shell
  for (let j = 0; j < M; j++) quad(T[j][C], B[j][C], T[j + 1][C], B[j + 1][C]);
  // orient every triangle away from the sheet's mid line
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], pc = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    const r = refs[a];
    const out = [cen[0] - r[0], cen[1] - r[1], cen[2] - r[2]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { idx[k + 1] = c; idx[k + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dark cap with the through grab slot (arched top edge, flat bottom edge). */
function buildCap(low) {
  const hw = 0.209, R = 0.105, bev = 0.006, ytop = CAP_TOP - bev;
  const seg = low ? 4 : 8;
  const s = new THREE.Shape();
  const y0 = CAP_Y0 - 0.012;
  s.moveTo(-hw, y0 + 0.012);
  s.quadraticCurveTo(0, y0 - 0.012, hw, y0 + 0.012); // shallow smile (lower edge)
  s.lineTo(hw, ytop - R);
  for (let i = 1; i <= seg; i++) { const a = (i / seg) * Math.PI / 2; s.lineTo(hw - R + Math.cos(a) * R, ytop - R + Math.sin(a) * R); }
  s.lineTo(-hw + R, ytop);
  for (let i = 1; i <= seg; i++) { const a = Math.PI / 2 + (i / seg) * Math.PI / 2; s.lineTo(-hw + R + Math.cos(a) * R, ytop - R + Math.sin(a) * R); }
  s.lineTo(-hw, y0 + 0.012);
  // slot
  const sw = 0.135, sb = 0.992, se = 0.052, sc = 0.0665;
  const h = new THREE.Path();
  const rr = 0.025;
  h.moveTo(-sw + rr, sb);
  h.lineTo(sw - rr, sb);
  h.quadraticCurveTo(sw, sb, sw, sb + rr);
  h.lineTo(sw, sb + se - 0.01);
  h.quadraticCurveTo(sw - 0.02, sb + se + 0.008, sw - 0.07, sb + sc - 0.001);
  h.quadraticCurveTo(0, sb + sc + 0.004, -sw + 0.07, sb + sc - 0.001);
  h.quadraticCurveTo(-sw + 0.02, sb + se + 0.008, -sw, sb + se - 0.01);
  h.lineTo(-sw, sb + rr);
  h.quadraticCurveTo(-sw, sb, -sw + rr, sb);
  s.holes.push(h);
  const depth = 0.05;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: low ? 1 : 2, curveSegments: low ? 3 : 6 });
  // centre on z = 0, shear along the backrest rake, move to the backrest
  g.translate(0, 0, -depth / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + CAP_COUNT_Z + (p.getY(i) - 1.0) * RAKE);
  g.computeVertexNormals();
  return g;
}

function ellipse(rx, ry, n = 14) {
  const g = new THREE.CircleGeometry(1, n);
  g.scale(rx, ry, 1);
  return g;
}

function roundedRect(w, h, r, topOnly = false, n = 4) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const rb = topOnly ? 0.004 : r;
  s.moveTo(x0 + rb, y0);
  s.lineTo(x1 - rb, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + rb);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + rb);
  s.quadraticCurveTo(x0, y0, x0 + rb, y0);
  return new THREE.ShapeGeometry(s, n);
}

const cache = new Map();

/**
 * Geometries of one ordinary seat, keyed by material name (seat, seatCap, seatMark, seatPanel) plus the
 * placement of the priority sticker. Built once per quality and shared by every bus.
 */
export function seatPieces(quality = 'high') {
  const low = quality === 'low';
  const key = low ? 'low' : 'hi';
  if (cache.has(key)) return cache.get(key);
  const shell = buildShell(low);
  const cap = buildCap(low);
  // embossed lion oval on the back of the cap: a flat raised ellipse (same material as the cap, reads through its bevel)
  const oval = new THREE.Shape();
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; const px = Math.cos(a) * 0.033, py = Math.sin(a) * 0.021; if (i) oval.lineTo(px, py); else oval.moveTo(px, py); }
  const mark = new THREE.ExtrudeGeometry(oval, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 6 });
  mark.rotateX(0.1);
  mark.translate(-0.045, 0.958, CAP_COUNT_Z + (0.958 - 1.0) * RAKE + 0.0305);
  // recess panel on the back, 0.30 x 0.30, centre y 0.72
  const panel = roundedRect(0.3, 0.3, 0.06, false, 3);
  panel.rotateX(0.15);
  panel.translate(0, 0.72, 0.3099);
  // sticker plane on the sitting face (priority seat): centre y 0.78, 0.17 x 0.25
  const sticker = new THREE.PlaneGeometry(0.17, 0.25);
  sticker.rotateX(-0.14);
  sticker.rotateY(Math.PI);
  sticker.translate(0, 0.78, 0.2652);
  const out = { shell, cap, mark, panel, sticker };
  cache.set(key, out);
  return out;
}

/** Wheelchair-bay fold-up seat: moquette back (0.39 x 0.52, rounded top), grey pan, U-hoop frame (parts by material). */
export function foldSeatPieces(quality = 'high') {
  const key = quality === 'low' ? 'fold-low' : 'fold-hi';
  if (cache.has(key)) return cache.get(key);
  // moquette sitting face (normal -z), grey rear skin, thin board between them
  const moq = new THREE.ShapeGeometry(roundedRectShape(0.39, 0.52, 0.08), 5);
  moq.rotateY(Math.PI);
  moq.translate(0, 0.8, 0.28);
  const rear = new THREE.ShapeGeometry(roundedRectShape(0.39, 0.52, 0.08), 5);
  rear.translate(0, 0.8, 0.296);
  const board = new THREE.BoxGeometry(0.386, 0.516, 0.014);
  board.translate(0, 0.8, 0.288);
  // seat pan (grey, folded down)
  const pan = new THREE.BoxGeometry(0.4, 0.03, 0.4);
  pan.translate(0, 0.43, 0.02);
  // U-hoop: 0.47 wide, from y 0.45 up to 1.13, just in front of the back
  const pts = [];
  const hoopW = 0.235, z = 0.245;
  pts.push(new THREE.Vector3(-hoopW, 0.45, z), new THREE.Vector3(-hoopW, 1.0, z));
  for (let i = 1; i < 8; i++) { const a = Math.PI - (i / 8) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * hoopW, 1.0 + Math.sin(a) * 0.13, z)); }
  pts.push(new THREE.Vector3(hoopW, 1.0, z), new THREE.Vector3(hoopW, 0.45, z));
  const hoop = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), quality === 'low' ? 16 : 36, 0.0125, 6, false);
  const out = { moq, rear, board, pan, hoop };
  cache.set(key, out);
  return out;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.closePath();
  return s;
}

// Škoda 27Tr Solaris (Solaris Trollino 18) — fleet no. 1650, Sofia livery.
// Procedural model: body shell lofts, livery, glazing, rigged doors/wheels/poles, deformable bellows, full interior.
import * as THREE from 'three';
import { Batch, mat, roundedBox, tubePath, prepGeo, xform, planarUV, clamp, lerp, smoothstep, DEG, roundRectShape } from '../util.js';
import * as TX from '../textures.js';
import { makeBusMaterials, decalMat } from './materials.js';
import { BusDisplays, InformatorFace } from './displays.js';

export const B = {
  hw: 1.275, yB: 0.30, yFloor: 0.36, yW0: 1.14, yW1: 2.72, yRE: 2.95, yRoof: 3.10,
  wheelR: 0.478, archR: 0.585,
  zS: -8.25, zFront: -8.625, frontEnd: 1.35, hitch: 1.70,
  rearStart: 0.35, zR: 7.45, rearEnd: 7.71,
  axlesF: [-5.9, 0], axlesR: [4.35],
  doorsF: [[-8.22, -7.02], [-3.02, -1.82]], doorsR: [[0.72, 1.92], [5.35, 6.55]],
  pole: { x: 0.29, y: 3.58, z: 1.28, len: 6.1 },
  eye: new THREE.Vector3(-0.66, 1.97, -7.2),
  L1: 5.9, L2: 4.35,
};

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function hwAt(y) {
  if (y <= B.yRE) return B.hw;
  const t = clamp((y - B.yRE) / (B.yRoof - B.yRE), 0, 1);
  return B.hw - 0.22 + 0.22 * Math.cos(Math.asin(t));
}
function interp(table, y) {
  if (y <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (y <= table[i][0]) {
    const [y0, v0] = table[i - 1], [y1, v1] = table[i];
    return lerp(v0, v1, (y - y0) / (y1 - y0));
  }
  return table[table.length - 1][1];
}
const NOSE = [[0.28, -8.56], [0.32, -8.60], [0.50, -8.625], [0.60, -8.625], [0.64, -8.594], [0.70, -8.588], [0.90, -8.586], [1.10, -8.58], [1.16, -8.578], [1.60, -8.56], [2.10, -8.525], [2.49, -8.482], [2.55, -8.472], [2.60, -8.462], [2.92, -8.42], [2.95, -8.41], [3.00, -8.385], [3.05, -8.34], [3.08, -8.295], [3.10, -8.25]];
const REAR = [[0.28, 7.66], [0.32, 7.69], [0.50, 7.71], [0.60, 7.71], [0.64, 7.676], [0.70, 7.67], [1.10, 7.666], [1.22, 7.662], [1.28, 7.66], [2.55, 7.622], [2.62, 7.617], [2.70, 7.612], [2.92, 7.598], [2.95, 7.594], [3.00, 7.575], [3.05, 7.535], [3.08, 7.49], [3.10, 7.45]];
const BULGE = 0.07;

/** Plan outline of a cap at height y. sign -1 = nose (faces -z), +1 = rear (faces +z). */
function capOutline(y, table, zJoin, sign) {
  const hwY = hwAt(y);
  const zc = interp(table, y);
  const flat = smoothstep(2.95, 3.1, y);
  const bulge = BULGE * (1 - flat);
  let r = sign < 0 ? zJoin - zc - bulge : zc - bulge - zJoin;
  r = clamp(r, 0.003, hwY * 0.5);
  const zFace = (x) => zc - sign * bulge * (x / hwY) ** 2;
  const K = 8, F = 14, pts = [];
  const cx = hwY - r, cz = zFace(cx) - sign * r;
  pts.push([-hwY, zJoin]);
  // left corner
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const a = sign < 0 ? Math.PI + t * Math.PI / 2 : Math.PI - t * Math.PI / 2;
    pts.push([-cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  for (let f = 1; f < F; f++) { const x = -cx + (2 * cx * f) / F; pts.push([x, zFace(x)]); }
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const a = sign < 0 ? 1.5 * Math.PI + t * Math.PI / 2 : Math.PI / 2 - t * Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  pts.push([hwY, zJoin]);
  return pts;
}
export function noseZ(x, y) { const hwY = hwAt(y); return interp(NOSE, y) + BULGE * (x / hwY) ** 2; }
export function rearZ(x, y) { const hwY = hwAt(y); return interp(REAR, y) - BULGE * (x / hwY) ** 2; }

/** Loft rows of outline points into a smooth surface. expect: outward direction at centre used to fix winding. */
function loft(rowsY, outlineFn, expect) {
  const pos = [], uv = [];
  let C = 0;
  for (const y of rowsY) {
    const pts = outlineFn(y); C = pts.length;
    pts.forEach(([x, z], j) => { pos.push(x, y, z); uv.push(j / (C - 1), y / 3.3); });
  }
  const idx = [];
  for (let i = 0; i < rowsY.length - 1; i++) for (let j = 0; j < C - 1; j++) {
    const a = i * C + j, b = a + 1, c = a + C, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (expect) {
    const mid = Math.floor(rowsY.length / 2) * C + Math.floor(C / 2);
    const n = g.attributes.normal;
    if (n.getX(mid) * expect.x + n.getY(mid) * expect.y + n.getZ(mid) * expect.z < 0) {
      for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
  }
  return g;
}
const rowsBetween = (table, y0, y1, extra = []) => {
  const ys = new Set([y0, y1, ...extra]);
  for (const [y] of table) if (y > y0 && y < y1) ys.add(y);
  for (let y = y0; y < y1; y += 0.12) ys.add(+y.toFixed(3));
  return [...ys].filter((y) => y >= y0 && y <= y1).sort((a, b) => a - b);
};

/** Extruded side panel (shape in z-y plane) with wheel-arch notches. side: +1 right, -1 left */
function sidePanel(za, zb, y0, y1, arches, side, depth = 0.022) {
  const s = new THREE.Shape();
  const cy = B.wheelR, R = B.archR;
  s.moveTo(za, y0);
  for (const zx of arches.filter((a) => a > za + R && a < zb - R).sort((a, b) => a - b)) {
    const alpha = Math.asin((y0 - cy) / R);
    const dz = Math.sqrt(R * R - (y0 - cy) ** 2);
    s.lineTo(zx - dz, y0);
    s.absarc(zx, cy, R, Math.PI - alpha, alpha, true);
  }
  s.lineTo(zb, y0); s.lineTo(zb, y1); s.lineTo(za, y1); s.lineTo(za, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.009, bevelSegments: 2, curveSegments: 28 });
  const m = new THREE.Matrix4();
  if (side > 0) m.set(0, 0, -1, B.hw - 0.009, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  else m.set(0, 0, 1, -(B.hw - 0.009), 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  xform(g, m);
  planarUV(g, 'zy', 1, 3.3);
  return g;
}

/** Roof shell (rounded edges) from za to zb. */
function roofGeo(za, zb) {
  const prof = [];
  const N = 8;
  for (let k = 0; k <= N; k++) { const th = (k / N) * Math.PI / 2; prof.push([B.hw - 0.22 + 0.22 * Math.cos(th), B.yRE + 0.15 * Math.sin(th)]); }
  const pts = [...prof.map(([x, y]) => [-x, y]), ...prof.slice().reverse().map(([x, y]) => [x, y])];
  const pos = [], uv = [], idx = [];
  const C = pts.length;
  for (const z of [za, zb]) pts.forEach(([x, y]) => { pos.push(x, y, z); uv.push(0.5, y / 3.3); });
  for (let j = 0; j < C - 1; j++) { const a = j, b = j + 1, c = j + C, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // ensure up-facing
  if (g.attributes.normal.getY(Math.floor(C / 2)) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** Decal quad conforming to a cap surface. zfn(x,y) gives surface z; offs pushes it outwards. */
function capDecal(w, h, cx, cy, zfn, sign, segs = 10) {
  const g = new THREE.PlaneGeometry(w, h, segs, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // plane faces +z by default; for the nose mirroring x makes it face -z and stay readable from the front
    const x = (sign < 0 ? -p.getX(i) : p.getX(i)) + cx, y = p.getY(i) + cy;
    p.setXYZ(i, x, y, zfn(x, y) + sign * 0.004);
  }
  g.computeVertexNormals();
  return g;
}

/** Side decal plane on x = ±hw facing outwards, text readable. */
function sideDecal(w, h, z, y, side, off = 0.012) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(side * (B.hw + off), y, z);
  return g;
}

/* ------------------------------------------------------------------ */
function lampGeo(r, depth = 0.05) {
  // chrome reflector cup + lens + bulb
  const cup = new THREE.LatheGeometry([V3(0.001, -depth, 0), V3(r * 0.35, -depth * 0.9, 0), V3(r * 0.8, -depth * 0.45, 0), V3(r, 0, 0)], 20);
  cup.rotateX(-Math.PI / 2);
  const lens = new THREE.CircleGeometry(r * 1.02, 24);
  lens.translate(0, 0, 0.004);
  const bulb = new THREE.SphereGeometry(r * 0.28, 12, 8);
  bulb.translate(0, 0, -depth * 0.55);
  const ring = new THREE.TorusGeometry(r * 1.04, 0.006, 6, 28);
  return { cup, lens, bulb, ring };
}

/** Builds a complete trolleybus. Returns rig handles. */
export function buildTrolleybus() {
  const M = makeBusMaterials();
  const displays = new BusDisplays();
  const informator = new InformatorFace();

  const front = new THREE.Group(); front.name = 'busFront';
  const rear = new THREE.Group(); rear.name = 'busRear';
  const frontBody = new THREE.Group(); front.add(frontBody);
  const rearBody = new THREE.Group(); rear.add(rearBody);

  const rig = { M, displays, informator, front, rear, frontBody, rearBody, wheels: [], doors: [], seats: [], poles: [], lamps: {}, mirrors: [], stopButtons: [] };

  const decals = {
    num: TX.textDecal('1650', { w: 512, h: 160, font: `800 150px ${TX.FONT}` }),
    numSmall: TX.textDecal('1650', { w: 256, h: 96, font: `800 84px ${TX.FONT}` }),
    plate: TX.textDecal('1650', { w: 512, h: 128, font: `800 112px ${TX.FONT}`, bg: '#8fcff0', color: '#0d0d0d' }),
    solaris: TX.solarisBar(), skoda: TX.skodaBadge(), gecko: TX.geckoSticker(), access: TX.accessPictos(),
    eu: TX.euSticker(), bluedrive: TX.blueDriveSticker(), flag: TX.flagBG(), smiley: TX.smiley(), card: TX.routeCard('9'),
    stop: TX.stopButton(false), stopBlue: TX.stopButton(true), hazard: TX.hazardStripes(),
    solarisSide: TX.textDecal('SOLARIS', { w: 512, h: 96, color: '#e9edf0', font: `600 70px ${TX.FONT}` }),
    speedo: TX.speedoDial(),
    noSmoke: TX.signText(['🚭'], { w: 128, h: 128, bg: '#fff', fg: '#c00' }),
    priority: TX.signText(['Места за', 'възрастни и', 'бременни'], { w: 256, h: 192, bg: '#1f5fb0', fg: '#fff' }),
    wheelchairSign: TX.signText(['♿'], { w: 128, h: 128, bg: '#1f5fb0', fg: '#fff' }),
  };
  decals.hazard.repeat.set(4, 1);
  const dm = {};
  for (const [k, t] of Object.entries(decals)) dm[k] = decalMat(t, k === 'solaris' ? { metalness: 0.9, roughness: 0.25 } : {});
  dm.hazard.transparent = false; dm.hazard.depthWrite = true;
  dm.speedo.transparent = false; dm.speedo.depthWrite = true;

  // ================= FRONT SECTION =================
  const fb = new Batch();
  buildShell(fb, 'front');
  buildNose(fb);
  buildInteriorCommon(fb, 'front');
  buildCab(fb);
  fb.build(frontBody, { name: 'busF' });

  // ================= REAR SECTION =================
  const rb = new Batch();
  buildShell(rb, 'rear');
  buildRearCap(rb);
  buildInteriorCommon(rb, 'rear');
  rb.build(rearBody, { name: 'busR' });

  // shadows: glass should not cast
  for (const body of [frontBody, rearBody]) body.traverse((o) => { if (o.isMesh && o.material.transparent) { o.castShadow = false; o.receiveShadow = false; } });

  buildDecals();
  buildLamps();
  buildDisplaysAndDetails();
  buildWheels();
  buildDoors();
  buildRoof();
  buildPoles();
  buildMirrors();
  buildBellows();

  return rig;

  /* =============================================================== */
  function buildShell(b, which) {
    const isF = which === 'front';
    const z0 = isF ? B.zS : B.rearStart;
    const z1 = isF ? B.frontEnd : B.zR;
    const axles = isF ? B.axlesF : B.axlesR;
    const doors = isF ? B.doorsF : B.doorsR;
    // lower panels
    for (const side of [-1, 1]) {
      const cuts = side > 0 ? doors : (isF ? [] : []);
      let za = z0;
      const segs = [];
      for (const [d0, d1] of cuts) { segs.push([za, d0 - 0.006]); za = d1 + 0.006; }
      segs.push([za, z1]);
      for (const [a, c] of segs) if (c - a > 0.05) b.add(M.paint, sidePanel(a, c, B.yB, B.yW0, axles, side));
      // upper band
      b.add(M.paint, sidePanel(z0, z1, B.yW1, B.yRE, [], side, 0.018));
      // glazing + pillars
      const glassSegs = [];
      za = z0;
      for (const [d0, d1] of cuts) { glassSegs.push([za, d0]); za = d1; }
      glassSegs.push([za, z1]);
      for (const [a, c] of glassSegs) {
        const len = c - a; if (len < 0.1) continue;
        const gh = B.yW1 - B.yW0;
        const glass = new THREE.PlaneGeometry(len, gh);
        glass.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        glass.translate(side * (B.hw - 0.004), (B.yW0 + B.yW1) / 2, (a + c) / 2);
        const isCabWin = isF && side < 0 && a <= B.zS + 0.01;
        if (isCabWin) {
          // driver's side window: clearer glass for the cab portion
          const cabLen = 1.28;
          const g1 = new THREE.PlaneGeometry(cabLen, gh); g1.rotateY(-Math.PI / 2); g1.translate(-(B.hw - 0.004), (B.yW0 + B.yW1) / 2, a + cabLen / 2);
          b.add(M.glassFront, g1);
          const g2 = new THREE.PlaneGeometry(len - cabLen, gh); g2.rotateY(-Math.PI / 2); g2.translate(-(B.hw - 0.004), (B.yW0 + B.yW1) / 2, a + cabLen + (len - cabLen) / 2);
          b.add(M.glassSide, g2);
        } else b.add(M.glassSide, glass);
        // frit bands (black) behind glass, top & bottom
        for (const [y, h] of [[B.yW0 + 0.035, 0.07], [B.yW1 - 0.04, 0.08]]) b.add(M.black, new THREE.BoxGeometry(0.02, h, len), mat(side * (B.hw - 0.02), y, (a + c) / 2));
        // pillars
        const nWin = Math.max(1, Math.round(len / 1.42));
        for (let k = 0; k <= nWin; k++) {
          const z = a + (len * k) / nWin;
          const w = k === 0 || k === nWin ? 0.09 : 0.075;
          b.add(M.black, new THREE.BoxGeometry(0.025, gh, w), mat(side * (B.hw - 0.02), (B.yW0 + B.yW1) / 2, clamp(z, a + w / 2, c - w / 2)));
          // hopper vent frame on alternating windows
          if (k < nWin && k % 2 === 1 && !(isF && side < 0 && k === 0)) {
            b.add(M.black, new THREE.BoxGeometry(0.03, 0.03, len / nWin - 0.06), mat(side * (B.hw - 0.012), 2.34, z + len / nWin / 2));
          }
        }
      }
      // underbody skirt return
      b.add(M.under, new THREE.BoxGeometry(0.06, 0.05, z1 - z0), mat(side * (B.hw - 0.06), B.yB + 0.02, (z0 + z1) / 2));
      // wheel arch liners
      for (const ax of axles) {
        const liner = new THREE.CylinderGeometry(B.archR - 0.01, B.archR - 0.01, 0.42, 24, 1, true, 0, Math.PI);
        liner.rotateZ(Math.PI / 2);
        b.add(M.rubberDS, liner, mat(side * (B.hw - 0.23), B.wheelR, ax));
        // blue arch trim ring (livery accent)
        const trim = new THREE.TorusGeometry((B.archR + 0.03) / 0.85, 0.03, 8, 40, Math.PI * 1.2);
        trim.rotateZ(-Math.PI * 0.1); trim.rotateY(Math.PI / 2);
        trim.scale(0.4, 0.85, 0.85);
        b.add(M.paintBlue, trim, mat(side * (B.hw + 0.004), B.wheelR, ax));
        // mud flap
        b.add(M.rubber, new THREE.BoxGeometry(0.34, 0.28, 0.012), mat(side * (B.hw - 0.2), 0.4, ax + 0.62));
      }
      // side marker lamps along the skirt
      for (let z = z0 + 0.8; z < z1 - 0.5; z += 2.9) {
        if (axles.some((a) => Math.abs(a - z) < 0.75) || (side > 0 && doors.some(([d0, d1]) => z > d0 - 0.1 && z < d1 + 0.1))) continue;
        b.add(M.marker, new THREE.BoxGeometry(0.02, 0.035, 0.09), mat(side * (B.hw + 0.012), 0.42, z));
      }
    }
    // roof
    const rz0 = z0, rz1 = z1;
    b.add(M.paint, roofGeo(rz0, rz1));
    // underbody plate
    b.add(M.under, new THREE.BoxGeometry(B.hw * 2 - 0.1, 0.03, z1 - z0), mat(0, B.yB, (z0 + z1) / 2));
    // joint portal frame
    const pz = isF ? B.frontEnd - 0.02 : B.rearStart + 0.02;
    const portal = new THREE.Shape();
    const o = roundRectShape(B.hw * 2, 2.82, 0.22).getPoints(6);
    portal.setFromPoints(o);
    const hole = new THREE.Path(roundRectShape(B.hw * 2 - 0.2, 2.64, 0.16).getPoints(6).reverse());
    portal.holes.push(hole);
    const pg = new THREE.ExtrudeGeometry(portal, { depth: 0.04, bevelEnabled: false });
    pg.translate(0, 1.72, pz - 0.02);
    b.add(M.blackMatte, pg);
  }

  function buildNose(b) {
    const zJ = B.zS;
    const out = (y) => capOutline(y, NOSE, zJ, -1);
    b.add(M.paint, loft(rowsBetween(NOSE, 0.28, 1.10), out, V3(0, 0, -1)));
    b.add(M.black, loft([1.10, 1.16], out, V3(0, 0, -1)));
    b.add(M.glassFront, loft(rowsBetween(NOSE, 1.16, 2.49), out, V3(0, 0, -1)));
    b.add(M.black, loft([2.49, 2.55, 2.60], out, V3(0, 0, -1)));
    b.add(M.glassDark, loft(rowsBetween(NOSE, 2.60, 2.92), out, V3(0, 0, -1)));
    b.add(M.paint, loft(rowsBetween(NOSE, 2.92, 3.10, [2.97, 3.02, 3.04, 3.06, 3.09]), out, V3(0, 1, -1)));
    // A-pillars
    for (const s of [-1, 1]) b.add(M.black, new THREE.BoxGeometry(0.04, 1.62, 0.07), mat(s * (B.hw - 0.012), 1.91, zJ + 0.03));
    // inner black backing behind the destination display zone
    b.add(M.blackMatte, new THREE.PlaneGeometry(B.hw * 2 - 0.3, 0.33), mat(0, 2.76, noseZ(0, 2.76) + 0.06, 0, Math.PI));
    // bumper face detailing: black rubber strip + tow cover
    b.add(M.rubber, new THREE.BoxGeometry(2.1, 0.035, 0.02), mat(0, 0.33, noseZ(0, 0.33) - 0.012));
    b.add(M.black, roundedBox(0.2, 0.1, 0.02, 0.02), mat(0.55, 0.42, noseZ(0.55, 0.42) - 0.006));
  }

  function buildRearCap(b) {
    const zJ = B.zR;
    const out = (y) => capOutline(y, REAR, zJ, 1);
    b.add(M.paint, loft(rowsBetween(REAR, 0.28, 1.22), out, V3(0, 0, 1)));
    b.add(M.black, loft([1.22, 1.28], out, V3(0, 0, 1)));
    b.add(M.glassSide, loft(rowsBetween(REAR, 1.28, 2.55), out, V3(0, 0, 1)));
    b.add(M.black, loft(rowsBetween(REAR, 2.55, 2.92), out, V3(0, 0, 1)));
    b.add(M.paint, loft(rowsBetween(REAR, 2.92, 3.10, [2.97, 3.02, 3.04, 3.06, 3.09]), out, V3(0, 1, 1)));
    for (const s of [-1, 1]) b.add(M.black, new THREE.BoxGeometry(0.04, 1.45, 0.07), mat(s * (B.hw - 0.012), 1.92, zJ - 0.03));
    b.add(M.rubber, new THREE.BoxGeometry(2.1, 0.035, 0.02), mat(0, 0.33, rearZ(0, 0.33) + 0.012));
    // pole retriever reels (two chrome drums on the rear panel)
    for (const s of [-1, 1]) {
      const x = s * 0.44, y = 0.9, z = rearZ(x, y);
      const drum = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 28); drum.rotateX(Math.PI / 2);
      b.add(M.chrome, drum, mat(x, y, z + 0.065));
      const cap = new THREE.CylinderGeometry(0.1, 0.12, 0.03, 28); cap.rotateX(Math.PI / 2);
      b.add(M.alu, cap, mat(x, y, z + 0.14));
      b.add(M.black, new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12).rotateX(Math.PI / 2), mat(x, y, z + 0.16));
      // rope guide on top of drum
      b.add(M.black, new THREE.BoxGeometry(0.05, 0.08, 0.05), mat(x, y + 0.16, z + 0.06));
    }
    // reflectors
    for (const s of [-1, 1]) b.add(M.lensRed, new THREE.BoxGeometry(0.12, 0.04, 0.01), mat(s * 0.95, 0.56, rearZ(s * 0.95, 0.56) + 0.01));
  }

  /* --------------------------- decals ---------------------------- */
  function buildDecals() {
    const add = (parent, geo, m, name) => { const mesh = new THREE.Mesh(geo, m); mesh.name = name || ''; mesh.renderOrder = 2; parent.add(mesh); return mesh; };
    // front
    add(frontBody, capDecal(0.46, 0.15, 0.36, 0.965, noseZ, -1), dm.num, 'num1650');
    add(frontBody, capDecal(0.15, 0.19, -0.12, 0.955, noseZ, -1, 4), dm.skoda);
    add(frontBody, capDecal(0.18, 0.18, -0.86, 0.95, noseZ, -1, 4), dm.gecko);
    add(frontBody, capDecal(1.18, 0.1, 0, 0.74, noseZ, -1, 16), dm.solaris);
    add(frontBody, capDecal(0.48, 0.13, 0, 0.45, noseZ, -1, 8), dm.plate);
    // right side, behind front door: accessibility pictos + number
    add(frontBody, sideDecal(0.34, 0.17, -6.78, 0.93, 1), dm.access);
    add(frontBody, sideDecal(0.26, 0.1, -6.35, 0.99, 1), dm.numSmall);
    add(frontBody, sideDecal(0.26, 0.1, -6.35, 0.99, -1), dm.numSmall);
    add(frontBody, sideDecal(0.2, 0.25, -3.42, 0.86, 1), dm.eu);
    add(frontBody, sideDecal(0.34, 0.17, -1.55, 0.93, 1), dm.access);
    add(frontBody, sideDecal(0.5, 0.09, -7.7, 2.84, -1), dm.solarisSide);
    add(rearBody, sideDecal(0.26, 0.1, 3.0, 0.99, 1), dm.numSmall);
    add(rearBody, sideDecal(0.26, 0.1, 3.0, 0.99, -1), dm.numSmall);
    add(rearBody, sideDecal(0.2, 0.25, 2.3, 0.86, 1), dm.eu);
    // rear
    add(rearBody, capDecal(1.05, 0.09, 0, 0.72, rearZ, 1, 16), dm.solaris);
    add(rearBody, capDecal(0.46, 0.13, 0, 0.45, rearZ, 1, 8), dm.plate);
    add(rearBody, capDecal(0.36, 0.12, 0.0, 1.05, rearZ, 1, 6), dm.num);
    add(rearBody, capDecal(0.84, 0.26, -0.42, 1.5, (x, y) => rearZ(x, y) - 0.012, 1, 8), dm.bluedrive);
    // hazard floor strips at each door threshold
    for (const [sec, doors] of [[frontBody, B.doorsF], [rearBody, B.doorsR]]) for (const [d0, d1] of doors) {
      const g = new THREE.PlaneGeometry(d1 - d0, 0.07); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (d1 - d0) * 3.3);
      g.rotateY(Math.PI / 2); g.translate(B.hw - 0.06, B.yFloor + 0.004, (d0 + d1) / 2);
      const m = dm.hazard.clone(); m.map = decals.hazard;
      add(sec, g, m);
    }
  }

  /* ---------------------------- lamps ---------------------------- */
  function buildLamps() {
    const lamps = rig.lamps;
    const fl = new Batch();
    const addLamp = (batch, r, x, y, zfn, sign, emitter, lens = M.lensClear, tilt = 0) => {
      const L = lampGeo(r);
      const z = zfn(x, y);
      const rot = sign < 0 ? Math.PI : 0;
      const m = mat(x, y, z + sign * 0.002, 0, rot + tilt);
      batch.add(M.chrome, L.cup, m); batch.add(emitter, L.bulb, m); batch.add(lens, L.lens, m); batch.add(M.black, L.ring, m);
    };
    for (const s of [-1, 1]) {
      // housing plate
      const hs = new THREE.Shape();
      hs.moveTo(-0.26, -0.07); hs.lineTo(0.3, -0.09); hs.quadraticCurveTo(0.36, 0.0, 0.3, 0.1); hs.lineTo(-0.2, 0.08); hs.quadraticCurveTo(-0.3, 0.0, -0.26, -0.07);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 2 });
      hg.rotateY(Math.PI);
      if (s < 0) { const m = new THREE.Matrix4().makeScale(-1, 1, 1); xform(hg, m); }
      fl.add(M.black, hg, mat(s * 0.88, 0.79, noseZ(s * 0.88, 0.79) - 0.004, 0, -s * 0.12));
      addLamp(fl, 0.078, s * 1.07, 0.8, noseZ, -1, M.headLo);
      addLamp(fl, 0.064, s * 0.91, 0.785, noseZ, -1, M.headLo);
      addLamp(fl, 0.058, s * 0.775, 0.772, noseZ, -1, M.drl);
      addLamp(fl, 0.042, s * 0.665, 0.765, noseZ, -1, s < 0 ? M.indL : M.indR, M.lensAmber);
      // fog lamp in bumper
      addLamp(fl, 0.045, s * 0.98, 0.46, noseZ, -1, M.drl);
    }
    // side indicators (behind front wheel & mid)
    for (const s of [-1, 1]) {
      fl.add(s < 0 ? M.indL : M.indR, roundedBox(0.03, 0.05, 0.14, 0.012), mat(s * (B.hw + 0.012), 0.95, -4.9));
    }
    fl.build(frontBody, { name: 'lampsF', cast: false });
    const rl = new Batch();
    for (const s of [-1, 1]) {
      const hs = roundedBox(0.44, 0.16, 0.03, 0.05);
      rl.add(M.black, hs, mat(s * 0.9, 0.78, rearZ(s * 0.9, 0.78) + 0.004));
      addLamp(rl, 0.058, s * 1.06, 0.78, rearZ, 1, M.tail, M.lensRed);
      addLamp(rl, 0.058, s * 0.92, 0.78, rearZ, 1, M.brake, M.lensRed);
      addLamp(rl, 0.058, s * 0.78, 0.78, rearZ, 1, s < 0 ? M.indL : M.indR, M.lensAmber);
      addLamp(rl, 0.04, s * 0.68, 0.49, rearZ, 1, M.reverse);
      rl.add(s < 0 ? M.indL : M.indR, roundedBox(0.03, 0.05, 0.14, 0.012), mat(s * (B.hw + 0.012), 0.95, 3.3));
      // upper rear marker lamps
      rl.add(M.tail, roundedBox(0.08, 0.04, 0.02, 0.01), mat(s * 0.95, 3.0, rearZ(s * 0.95, 3.0) + 0.01));
    }
    rl.add(M.brake, roundedBox(0.5, 0.035, 0.02, 0.01), mat(0, 2.66, rearZ(0, 2.66) + 0.008));
    rl.build(rearBody, { name: 'lampsR', cast: false });
    lamps.M = M;
  }

  /* ------------------- displays, wipers, cab bits ----------------- */
  function buildDisplaysAndDetails() {
    const plane = (w, h, tex, parent, m, emissive = 1.6) => {
      const mm = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive, roughness: 0.5, color: 0x111111 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mm); mesh.applyMatrix4(m); parent.add(mesh); return mesh;
    };
    // front destination sign behind the upper dark glass
    plane(2.0, 0.26, displays.front.texture, frontBody, mat(0, 2.765, noseZ(0, 2.765) + 0.035, 0, Math.PI));
    // side sign (right side, first window after door 1)
    plane(1.12, 0.15, displays.side.texture, frontBody, mat(B.hw - 0.05, 2.5, -6.1, 0, Math.PI / 2));
    // rear number
    plane(0.28, 0.18, displays.rear.texture, rearBody, mat(0, 2.76, rearZ(0, 2.76) - 0.03));
    // interior next-stop displays (red LED), facing backwards
    for (const [parent, z] of [[frontBody, -6.72], [rearBody, 0.62]]) {
      const box = new THREE.Mesh(roundedBox(1.02, 0.12, 0.08, 0.02), M.dashDark); box.position.set(0, 2.66, z); parent.add(box);
      plane(0.96, 0.075, displays.interior.texture, parent, mat(0, 2.66, z + 0.042), 2.2);
      const back = plane(0.96, 0.075, displays.interior.texture, parent, mat(0, 2.66, z - 0.042, 0, Math.PI), 2.2); back.name = 'intDispBack';
    }
    // wipers parked at the bottom of the windshield
    const wb = new Batch();
    for (const s of [-1, 1]) {
      const px = s * 0.55, py = 1.2, pz = noseZ(px, py) - 0.03;
      wb.add(M.black, new THREE.BoxGeometry(0.95, 0.018, 0.02), mat(px - s * 0.45, py + 0.05, pz, 0, 0, s * 0.06));
      wb.add(M.blackMatte, new THREE.BoxGeometry(0.9, 0.03, 0.03), mat(px - s * 0.48, py + 0.08, pz - 0.012, 0, 0, s * 0.06));
      wb.add(M.black, new THREE.CylinderGeometry(0.025, 0.025, 0.05, 12).rotateX(Math.PI / 2), mat(px, py, pz + 0.01));
    }
    // front tow hook cover, antenna, number plate lamp
    wb.add(M.black, new THREE.CylinderGeometry(0.008, 0.012, 0.35, 6), mat(-0.6, 3.25, -7.4));
    wb.build(frontBody, { name: 'wipers' });
  }

  /* ----------------------------- wheels ---------------------------- */
  function buildWheels() {
    // tyre: tread band + sidewalls (lathe around Y, then turned to X)
    const prof = [[0.29, -0.118], [0.34, -0.134], [0.41, -0.138], [0.455, -0.13], [0.472, -0.115], [0.478, -0.085], [0.478, 0.085], [0.472, 0.115], [0.455, 0.13], [0.41, 0.138], [0.34, 0.134], [0.29, 0.118]];
    const toV = (a) => a.map(([r, y]) => new THREE.Vector2(r, y));
    const wallA = new THREE.LatheGeometry(toV(prof.slice(0, 5)), 48).rotateZ(-Math.PI / 2);
    const tread = new THREE.LatheGeometry(toV(prof.slice(4, 8)), 48).rotateZ(-Math.PI / 2);
    const wallB = new THREE.LatheGeometry(toV(prof.slice(7)), 48).rotateZ(-Math.PI / 2);
    // front hub cap (domed chrome) with 10 nuts
    const capF = new THREE.LatheGeometry(toV([[0.29, 0.12], [0.27, 0.13], [0.2, 0.145], [0.1, 0.152], [0.0, 0.154]]), 40).rotateZ(-Math.PI / 2);
    const nut = new THREE.CylinderGeometry(0.017, 0.017, 0.03, 6).rotateZ(Math.PI / 2);
    const nuts = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; nuts.push(prepGeo(nut.clone().translate(0.16, Math.cos(a) * 0.12, Math.sin(a) * 0.12))); }
    const hubF = new THREE.CylinderGeometry(0.075, 0.085, 0.07, 24).rotateZ(Math.PI / 2).translate(0.17, 0, 0);
    // rear flat cap with holes look
    const capR = new THREE.LatheGeometry(toV([[0.29, 0.1], [0.275, 0.115], [0.24, 0.118], [0.12, 0.12], [0.1, 0.14], [0.0, 0.142]]), 40).rotateZ(-Math.PI / 2);
    const holes = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; holes.push(prepGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 12).rotateZ(Math.PI / 2).translate(0.122, Math.cos(a) * 0.19, Math.sin(a) * 0.19))); }

    const makeWheel = (kind) => {
      const g = new THREE.Group();
      const b = new Batch();
      b.add(M.tireWall, wallA); b.add(M.tire, tread); b.add(M.tireWall, wallB);
      if (kind === 'front') {
        b.add(M.chrome, capF); for (const n of nuts) b.add(M.chrome, n); b.add(M.hub, hubF);
      } else {
        b.add(M.rim, capR); for (const h of holes) b.add(M.under, h);
        // inner twin tyre
        b.add(M.tireWall, wallA, mat(-0.3, 0, 0)); b.add(M.tire, tread, mat(-0.3, 0, 0)); b.add(M.tireWall, wallB, mat(-0.3, 0, 0));
      }
      b.build(g, { name: 'wheel' });
      return g;
    };
    const place = (parent, section, z, side, kind, steer) => {
      const steerG = new THREE.Group();
      const spin = makeWheel(kind);
      if (side < 0) spin.scale.x = -1;
      steerG.add(spin);
      const x = side * (kind === 'front' ? 1.02 : 0.95);
      steerG.position.set(x, B.wheelR, z);
      parent.add(steerG);
      // suspension/brake details (air bag + damper + brake chamber)
      const det = new Batch();
      det.add(M.rubber, new THREE.CylinderGeometry(0.13, 0.13, 0.22, 16), mat(side * 0.55, 0.62, z + (kind === 'front' ? 0.45 : -0.45)));
      det.add(M.steel, new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), mat(side * 0.62, 0.62, z + 0.3, 0.3, 0, 0));
      det.add(M.steel, new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12).rotateZ(Math.PI / 2), mat(side * 0.5, 0.35, z - 0.18));
      det.add(M.under, new THREE.BoxGeometry(0.9, 0.12, 0.14), mat(side * 0.4, B.wheelR, z));
      det.build(parent, { name: 'susp' });
      rig.wheels.push({ steerG, spin, section, z, side, steer, r: B.wheelR });
    };
    for (const z of B.axlesF) for (const s of [-1, 1]) place(front, 'front', z, s, z < -1 ? 'front' : 'rear', z < -1);
    for (const z of B.axlesR) for (const s of [-1, 1]) place(rear, 'rear', z, s, 'rear', false);
  }

  /* ------------------------------ doors ---------------------------- */
  function buildDoors() {
    const leafW = 0.6, y0 = B.yFloor + 0.01, y1 = 2.66;
    const leafGeo = () => {
      const b = new Batch();
      const t = 0.04, H = y1 - y0;
      const fr = (w, h, x, y) => b.add(M.black, new THREE.BoxGeometry(t, h, w), mat(0, y, x));
      fr(0.055, H, 0.03, y0 + H / 2);            // hinge stile
      fr(0.045, H, leafW - 0.025, y0 + H / 2);  // leading stile
      fr(leafW, 0.07, leafW / 2, y1 - 0.035);   // top rail
      fr(leafW, 0.1, leafW / 2, y0 + 0.05);     // bottom rail / kick plate
      fr(leafW, 0.07, leafW / 2, 1.0);          // mid rail
      const gU = new THREE.PlaneGeometry(leafW - 0.09, y1 - 0.07 - 1.035); gU.rotateY(Math.PI / 2);
      b.add(M.glassSide, gU, mat(0.004, (1.035 + y1 - 0.07) / 2, leafW / 2 - 0.005));
      const gL = new THREE.PlaneGeometry(leafW - 0.09, 0.965 - (y0 + 0.1)); gL.rotateY(Math.PI / 2);
      b.add(M.glassSide, gL, mat(0.004, (0.965 + y0 + 0.1) / 2, leafW / 2 - 0.005));
      // rubber seal on leading edge
      b.add(M.rubber, new THREE.CylinderGeometry(0.018, 0.018, H - 0.04, 8), mat(0, y0 + H / 2, leafW + 0.01));
      // inner handle
      b.add(M.railGrey, tubePath([[-0.05, 1.2, 0.12], [-0.09, 1.2, 0.12], [-0.09, 1.9, 0.12], [-0.05, 1.9, 0.12]], 0.014, 0.04), null);
      // hinge column (rotating tube) inside
      b.add(M.alu, new THREE.CylinderGeometry(0.022, 0.022, H + 0.05, 10), mat(-0.07, y0 + H / 2, 0.03));
      return b;
    };
    const mk = (parent, section, d0, d1, idx) => {
      const leaves = [];
      for (const [hingeZ, dir] of [[d0, 1], [d1, -1]]) {
        const pivot = new THREE.Group(); pivot.position.set(B.hw - 0.015, 0, hingeZ);
        const inner = new THREE.Group(); if (dir < 0) inner.scale.z = -1;
        leafGeo().build(inner, { name: 'doorLeaf' });
        pivot.add(inner); parent.add(pivot);
        leaves.push({ pivot, dir });
      }
      // door warning light above the door (interior + exterior)
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a00, emissiveIntensity: 0, roughness: 0.4 });
      const lamp = new THREE.Mesh(roundedBox(0.2, 0.04, 0.05, 0.015), lampMat); lamp.position.set(B.hw - 0.12, 2.64, (d0 + d1) / 2); parent.add(lamp);
      rig.doors.push({ section, d0, d1, idx, leaves, open: 0, target: 0, lampMat });
    };
    B.doorsF.forEach(([a, c], i) => mk(frontBody, 'front', a, c, i));
    B.doorsR.forEach(([a, c], i) => mk(rearBody, 'rear', a, c, i + 2));
  }

  /* --------------------------- roof gear --------------------------- */
  function buildRoof() {
    const fb2 = new Batch(), rb2 = new Batch();
    const y = B.yRoof;
    const fairing = (b, z0, z1, w, h, ribs = true) => {
      const len = z1 - z0;
      const g = roundedBox(w, h, len, 0.09, 3);
      b.add(M.paintBlue, g, mat(0, y + h / 2 - 0.01, (z0 + z1) / 2));
      if (ribs) for (let z = z0 + 0.45; z < z1 - 0.2; z += 0.9) b.add(M.black, new THREE.BoxGeometry(w + 0.004, 0.012, 0.012), mat(0, y + h - 0.12, z));
      // louvre grilles
      for (const s of [-1, 1]) for (let z = z0 + 0.3; z < z1 - 0.3; z += 1.8) b.add(M.blackMatte, new THREE.BoxGeometry(0.01, h * 0.45, 0.6), mat(s * (w / 2 + 0.002), y + h * 0.45, z + 0.3));
    };
    // front AC unit (Konvekta) above the destination sign
    const ac = roundedBox(2.0, 0.26, 1.7, 0.1, 3);
    fb2.add(M.paintBlue, ac, mat(0, y + 0.12, -7.3));
    for (let k = 0; k < 4; k++) fb2.add(M.blackMatte, new THREE.BoxGeometry(0.22, 0.02, 0.5), mat(-0.45 + k * 0.3, y + 0.255, -7.15));
    for (let k = 0; k < 5; k++) fb2.add(M.blackMatte, new THREE.BoxGeometry(0.2, 0.1, 0.01), mat(-0.5 + k * 0.25, y + 0.14, -8.16));
    fairing(fb2, -6.15, -0.2, 2.1, 0.34);
    fairing(fb2, 0.0, 1.2, 1.6, 0.26, false);
    // rear: pole base platform + HVAC + equipment + hooks
    rb2.add(M.paintBlue, roundedBox(1.7, 0.22, 1.25, 0.08), mat(0, y + 0.1, 1.2));
    const ac2 = roundedBox(1.9, 0.3, 1.9, 0.12, 3);
    rb2.add(M.paintBlue, ac2, mat(0, y + 0.14, 3.2));
    for (let k = 0; k < 3; k++) rb2.add(M.blackMatte, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), mat(-0.5 + k * 0.5, y + 0.29, 3.2));
    fairing(rb2, 4.45, 6.95, 1.9, 0.3);
    // pole retaining hooks frame at the rear
    const hookFrame = [[-0.62, y, 7.05], [-0.62, y + 0.3, 7.1], [0.62, y + 0.3, 7.1], [0.62, y, 7.05]];
    rb2.add(M.black, tubePath(hookFrame, 0.025, 0.08), null);
    for (const s of [-1, 1]) {
      const x = s * B.pole.x;
      rb2.add(M.black, tubePath([[x, y + 0.3, 7.1], [x, y + 0.52, 7.12], [x + s * 0.08, y + 0.6, 7.12], [x + s * 0.12, y + 0.5, 7.12]], 0.018, 0.05), null);
    }
    fb2.build(frontBody, { name: 'roofF' });
    rb2.build(rearBody, { name: 'roofR' });
  }

  /* ---------------------------- poles ------------------------------ */
  function buildPoles() {
    const P = B.pole;
    for (const s of [-1, 1]) {
      const base = new THREE.Group(); base.position.set(s * P.x, P.y, P.z);
      const yaw = new THREE.Group(); base.add(yaw);
      const pitch = new THREE.Group(); yaw.add(pitch);
      const b = new Batch();
      // pole along +z (trailing backwards)
      const pole = new THREE.CylinderGeometry(0.019, 0.03, P.len, 10, 1).rotateX(Math.PI / 2).translate(0, 0, P.len / 2);
      b.add(M.poleMetal, pole);
      b.add(M.black, new THREE.CylinderGeometry(0.036, 0.036, 0.9, 10).rotateX(Math.PI / 2).translate(0, 0, 0.55));
      b.add(M.black, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0, P.len - 0.6));
      // trolley head (swivel + shoe)
      b.add(M.alu, roundedBox(0.07, 0.07, 0.16, 0.02), mat(0, 0.02, P.len));
      b.add(M.black, roundedBox(0.05, 0.035, 0.26, 0.01), mat(0, 0.06, P.len));
      b.add(M.steel, new THREE.BoxGeometry(0.02, 0.02, 0.24), mat(0, 0.085, P.len));
      // light-reflector ring and rope clamp
      b.add(M.alu, new THREE.TorusGeometry(0.035, 0.008, 6, 14).rotateX(0), mat(0, 0, P.len - 0.35));
      b.build(pitch, { name: 'pole' });
      // base spring housing (fixed on roof, rotates with yaw)
      const bb = new Batch();
      bb.add(M.black, new THREE.CylinderGeometry(0.09, 0.11, 0.1, 16), mat(0, -0.02, 0));
      bb.add(M.steel, new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10).rotateX(Math.PI / 2), mat(0, 0.06, -0.25));
      bb.add(M.alu, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12).rotateZ(Math.PI / 2), mat(0, 0.04, 0));
      bb.build(yaw, { name: 'poleBase' });
      rearBody.add(base);
      // retriever rope (dynamic line)
      const rope = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 12), 3)), new THREE.LineBasicMaterial({ color: 0x111111 }));
      rope.frustumCulled = false;
      rearBody.add(rope);
      rig.poles.push({ side: s, base, yaw, pitch, rope, yawA: 0, pitchA: 0.02, retriever: V3(s * 0.44, 1.05, B.rearEnd + 0.06) });
    }
  }

  /* ---------------------------- mirrors ---------------------------- */
  function buildMirrors() {
    for (const s of [-1, 1]) {
      const b = new Batch();
      const top = [s * 1.05, 2.98, -8.18];
      const pts = [top, [s * 1.2, 3.0, -8.45], [s * 1.38, 2.9, -8.72], [s * 1.46, 2.62, -8.8]];
      b.add(M.black, tubePath(pts, 0.022, 0.18), null);
      const head = new THREE.Group();
      head.position.set(s * 1.47, 2.3, -8.78);
      head.rotation.y = s * 0.28;
      const hb = new Batch();
      hb.add(M.black, roundedBox(0.3, 0.46, 0.1, 0.05), mat(0, 0, 0));
      hb.add(M.black, roundedBox(0.24, 0.16, 0.08, 0.04), mat(0, 0.36, 0.0));
      hb.add(s < 0 ? M.indL : M.indR, roundedBox(0.06, 0.03, 0.02, 0.01), mat(s * 0.1, -0.12, -0.055));
      hb.build(head, { name: 'mirrorHead' });
      const glassMat = new THREE.MeshBasicMaterial({ color: 0x7c8a94 });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.4), glassMat);
      glass.position.set(0, 0, 0.052);
      head.add(glass);
      const glass2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), M.mirrorGlass); glass2.position.set(0, 0.36, 0.042); head.add(glass2);
      b.build(frontBody, { name: 'mirrorArm' });
      frontBody.add(head);
      rig.mirrors.push({ side: s, head, glass, glassMat });
    }
  }

  /* --------------------------- bellows ----------------------------- */
  function buildBellows() {
    const mkProfile = (hw, y0, y1, rTop, rBot, n = 7) => {
      const pts = [];
      const arc = (cx, cy, r, a0, a1) => { for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      arc(-hw + rBot, y0 + rBot, rBot, Math.PI * 1.5, Math.PI);
      arc(-hw + rTop, y1 - rTop, rTop, Math.PI, Math.PI / 2);
      arc(hw - rTop, y1 - rTop, rTop, Math.PI / 2, 0);
      arc(hw - rBot, y0 + rBot, rBot, 0, -Math.PI / 2);
      // normals (outward) per point
      return pts.map(([x, y], i) => {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
        let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        return { x, y, nx: -ty, ny: tx }; // outward normal
      });
    };
    const mk = (profile, pleats, depth, material, name) => {
      const rings = pleats * 4 + 1, C = profile.length;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(rings * C * 3);
      const idx = [];
      for (let i = 0; i < rings - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, b, c, b, d, c); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.frustumCulled = false;
      mesh.castShadow = name === 'bellowsExt'; mesh.receiveShadow = true;
      frontBody.add(mesh);
      return { mesh, geo, pos, profile, rings, pleats, depth };
    };
    const ext = mk(mkProfile(B.hw - 0.03, 0.34, 3.04, 0.22, 0.04), 13, 0.05, M.bellowsExt, 'bellowsExt');
    const int = mk(mkProfile(B.hw - 0.14, 0.37, 2.8, 0.26, 0.02), 17, 0.035, M.bellowsInt, 'bellowsInt');
    // turntable floor disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.03, 40), M.turntable);
    disc.position.set(0, B.yFloor + 0.02, B.hitch); disc.receiveShadow = true;
    frontBody.add(disc);
    const ridges = new Batch();
    for (let k = -4; k <= 4; k++) ridges.add(M.alu, new THREE.BoxGeometry(1.7 - Math.abs(k) * 0.12, 0.008, 0.025), mat(0, 0.018, k * 0.2));
    const ridgeG = new THREE.Group(); ridges.build(ridgeG, { name: 'ridges' }); disc.add(ridgeG);
    rig.bellows = { ext, int, disc };
    updateBellows(rig, 0);
  }

  /* ================= INTERIOR ================= */
  function buildInteriorCommon(b, which) {
    const isF = which === 'front';
    const z0 = isF ? -8.2 : B.rearStart + 0.02;
    const z1 = isF ? B.frontEnd - 0.02 : B.zR + 0.2;
    const yF = B.yFloor;
    const iw = B.hw - 0.06;
    // floor slab
    const floor = new THREE.BoxGeometry(iw * 2, 0.06, z1 - z0);
    planarUV(floor, 'xz', 2, 2);
    b.add(M.floor, floor, mat(0, yF - 0.03, (z0 + z1) / 2));
    // inner lower walls + heater ducts
    for (const s of [-1, 1]) {
      const doors = s > 0 ? (isF ? B.doorsF : B.doorsR) : [];
      let za = z0; const segs = [];
      for (const [d0, d1] of doors) { segs.push([za, d0]); za = d1; }
      segs.push([za, z1]);
      for (const [a, c] of segs) {
        if (c - a < 0.05) continue;
        const wall = new THREE.PlaneGeometry(c - a, B.yW0 - yF + 0.02);
        wall.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        b.add(M.wallInt, wall, mat(s * iw, (B.yW0 + yF) / 2, (a + c) / 2));
        b.add(M.wallInt2, new THREE.BoxGeometry(0.1, 0.16, c - a - 0.1), mat(s * (iw - 0.05), yF + 0.08, (a + c) / 2));
        // window sill ledge
        b.add(M.wallInt2, new THREE.BoxGeometry(0.07, 0.025, c - a), mat(s * (iw - 0.03), B.yW0 + 0.012, (a + c) / 2));
        // upper interior panel between window top and ceiling
        const up = new THREE.PlaneGeometry(c - a, 0.06); up.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        b.add(M.wallInt, up, mat(s * iw, B.yW1 - 0.02, (a + c) / 2));
      }
      // door jamb returns
      for (const [d0, d1] of doors) for (const z of [d0, d1]) b.add(M.wallInt2, new THREE.BoxGeometry(0.12, B.yW1 - yF, 0.04), mat(s * (iw + 0.0), (B.yW1 + yF) / 2, z));
    }
    // ceiling (profile extruded along z)
    const prof = [[-iw, 2.72], [-1.06, 2.8], [-0.83, 2.855], [-0.55, 2.875], [0.55, 2.875], [0.83, 2.855], [1.06, 2.8], [iw, 2.72]];
    const cpos = [], cidx = [];
    for (const z of [z0, z1]) for (const [x, y] of prof) cpos.push(x, y, z);
    const C = prof.length;
    for (let j = 0; j < C - 1; j++) { const a = j, bb = j + 1, c = j + C, d = c + 1; cidx.push(a, c, bb, bb, c, d); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); cg.setIndex(cidx); cg.computeVertexNormals();
    if (cg.attributes.normal.getY(3) > 0) { for (let k = 0; k < cidx.length; k += 3) { const t = cidx[k + 1]; cidx[k + 1] = cidx[k + 2]; cidx[k + 2] = t; } cg.setIndex(cidx); cg.computeVertexNormals(); }
    b.add(M.ceiling, cg);
    // LED light strips + air slots
    for (const s of [-1, 1]) {
      b.add(M.led, new THREE.BoxGeometry(0.07, 0.015, z1 - z0 - 0.4), mat(s * 0.8, 2.855, (z0 + z1) / 2, 0, 0, s * 0.2));
      b.add(M.dashDark, new THREE.BoxGeometry(0.05, 0.01, z1 - z0 - 0.6), mat(s * 0.3, 2.87, (z0 + z1) / 2));
    }
    // emergency roof hatch + speakers
    const hz = isF ? -3.8 : 3.9;
    b.add(M.wallInt2, new THREE.BoxGeometry(0.72, 0.02, 0.72), mat(0, 2.865, hz));
    b.add(M.red, new THREE.BoxGeometry(0.18, 0.03, 0.04), mat(0, 2.85, hz + 0.3));
    for (let z = z0 + 1.2; z < z1 - 0.8; z += 2.6) b.add(M.dashDark, new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), mat(0.62, 2.862, z));

    // wheel arch housings / podiums
    const axles = isF ? B.axlesF : B.axlesR;
    for (const ax of axles) for (const s of [-1, 1]) {
      // inner wheel housing (half cylinder hump), closes the arch from the inside
      const hous = new THREE.CylinderGeometry(0.64, 0.64, 0.52, 24, 1, true, 0, Math.PI);
      hous.rotateZ(Math.PI / 2);
      b.add(M.wallInt2DS, hous, mat(s * (iw - 0.26), B.wheelR, ax));
      // inner (aisle-side) cap only; the outer side stays open towards the wheel
      const cap = new THREE.CircleGeometry(0.64, 24, 0, Math.PI);
      cap.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
      b.add(M.wallInt2DS, cap, mat(s * (iw - 0.52), B.wheelR, ax));
    }
    // seats
    const seatDefs = isF ? [
      // left side (behind cab)
      [-1, -6.4, 0.62, 0, 2], [-1, -5.62, 0.62, 0, 2], [-1, -4.84, 0.36, 0, 2],
      [-1, -0.98, 0.62, Math.PI, 2], [-1, -0.2, 0.62, 0, 2], [-1, 0.58, 0.62, 0, 2],
      // right side
      [1, -6.1, 0.62, 0, 2], [1, -5.32, 0.62, 0, 2], [1, -4.54, 0.36, 0, 2], [1, -3.76, 0.36, 0, 1],
      [1, -0.98, 0.62, Math.PI, 2], [1, -0.2, 0.62, 0, 2], [1, 0.58, 0.62, 0, 2],
    ] : [
      [-1, 1.05, 0.36, 0, 2], [-1, 1.83, 0.36, 0, 2], [-1, 2.61, 0.36, 0, 2], [-1, 3.62, 0.62, Math.PI, 2], [-1, 4.4, 0.62, 0, 2], [-1, 5.18, 0.62, 0, 2], [-1, 5.96, 0.36, 0, 2],
      [1, 2.62, 0.36, 0, 2], [1, 3.62, 0.62, Math.PI, 2], [1, 4.4, 0.62, 0, 2], [1, 5.18 - 0.02, 0.62, 0, 1],
    ];
    // podium platforms for raised seats
    const podiums = isF ? [[-1, -6.8, -5.2], [-1, -1.4, 1.0], [1, -6.5, -4.95], [1, -1.4, 1.0]] : [[-1, 3.2, 5.6], [1, 3.2, 5.45]];
    for (const [s, a, c] of podiums) {
      const pg = new THREE.BoxGeometry(1.05, 0.26, c - a); planarUV(pg, 'xz', 2, 2);
      b.add(M.floor, pg, mat(s * (iw - 0.52), yF + 0.13, (a + c) / 2));
      b.add(M.yellowStrip, new THREE.BoxGeometry(0.03, 0.025, c - a), mat(s * (iw - 1.05), yF + 0.255, (a + c) / 2));
    }
    // rear bench platform
    if (!isF) {
      const pg = new THREE.BoxGeometry(iw * 2, 0.26, 0.9); planarUV(pg, 'xz', 2, 2);
      b.add(M.floor, pg, mat(0, yF + 0.13, 7.1));
      b.add(M.yellowStrip, new THREE.BoxGeometry(iw * 2, 0.025, 0.03), mat(0, yF + 0.255, 6.65));
      for (const x of [-0.97, -0.5, 0, 0.5, 0.97]) seatDefs.push([Math.sign(x) || 1, 7.05, 0.62, 0, 0, x]);
    }
    const seatParts = seatGeometry();
    for (const d of seatDefs) {
      const [s, z, base, yaw, n, xOverride] = d;
      const xs = xOverride !== undefined ? [xOverride] : n === 2 ? [s * 0.97, s * 0.53] : [s * 0.97];
      for (const x of xs) {
        const m = mat(x, base, z, 0, yaw);
        b.add(M.seatShell, seatParts.shell, m); b.add(M.seatFabric, seatParts.fabric, m); b.add(M.seatDark, seatParts.handle, m);
        if (base < 0.5) b.add(M.seatDark, new THREE.BoxGeometry(0.08, 0.36, 0.3), mat(x, base + 0.18, z));
        rig.seats.push({ section: which, x, z, yaw, base, taken: false });
      }
    }
    // wheelchair area (front section, left, opposite door 2)
    if (isF) {
      b.add(M.dashDark, roundedBox(0.08, 0.5, 0.7, 0.03), mat(-iw + 0.05, 1.05, -2.4));
      b.add(M.rail, tubePath([[-iw + 0.02, 0.95, -3.2], [-iw + 0.1, 0.95, -3.2], [-iw + 0.1, 0.95, -1.6], [-iw + 0.02, 0.95, -1.6]], 0.016, 0.05), null);
      b.add(M.seatShell, roundedBox(0.45, 0.05, 0.4, 0.02), mat(-iw + 0.3, 0.8, -3.5, -1.2));
      const wcs = new THREE.PlaneGeometry(0.22, 0.22); wcs.rotateY(Math.PI / 2);
      b.add(new THREE.MeshStandardMaterial({ map: decals.wheelchairSign, roughness: 0.5 }), wcs, mat(-iw + 0.005, 1.45, -2.4));
      // fire extinguisher behind driver
      b.add(M.red, new THREE.CylinderGeometry(0.075, 0.075, 0.45, 16), mat(-iw + 0.12, 0.9, -6.85));
      b.add(M.dashDark, new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8), mat(-iw + 0.12, 1.16, -6.85));
    }
    // stanchions & handrails
    const railY = 2.3;
    for (const s of [-1, 1]) {
      const zA = isF ? -6.6 : 0.6, zB = isF ? 1.1 : 6.9;
      b.add(M.rail, tubePath([[s * 0.62, railY, zA], [s * 0.62, railY, zB]], 0.017), null);
      for (let z = zA + 0.2; z < zB; z += 1.4) b.add(M.railGrey, new THREE.CylinderGeometry(0.012, 0.012, 2.87 - railY, 6), mat(s * 0.62, (railY + 2.87) / 2, z));
    }
    const stanch = (x, z, fromY = yF) => {
      const s = Math.sign(x);
      b.add(M.rail, tubePath([[x, fromY, z], [x, railY - 0.1, z], [s * 0.62, railY, z]], 0.018, 0.12), null);
      b.add(M.rail, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), mat(x, fromY + 0.01, z));
    };
    const doors = isF ? B.doorsF : B.doorsR;
    for (const [d0, d1] of doors) {
      if (isF && d0 < -7) { stanch(0.45, d1 + 0.08); continue; }
      stanch(0.42, d0 - 0.06); stanch(0.42, d1 + 0.06);
      // horizontal guard bar at the door edges
      b.add(M.rail, tubePath([[iw, 1.0, d0 - 0.06], [0.45, 1.0, d0 - 0.06]], 0.016, 0.05), null);
    }
    for (const d of seatDefs) {
      const [s, z, , , n] = d;
      if (n === 2 && Math.abs(z * 10) % 2 < 1) stanch(s * 0.27, z + 0.26, yF);
    }
    if (isF) { stanch(-0.27, -6.9); stanch(0.3, -2.2); }
    else { stanch(0.3, 3.4); stanch(-0.27, 6.3); }
    // stop buttons on stanchions
    const btn = new THREE.BoxGeometry(0.06, 0.09, 0.05);
    for (const [x, z] of isF ? [[0.42, -3.08], [0.42, -1.76], [-0.27, -4.58], [0.27, -0.46]] : [[0.42, 0.66], [0.42, 1.98], [0.42, 5.29], [-0.27, 2.87], [-0.27, 5.44]]) {
      b.add(M.red, btn, mat(x, 1.35, z));
      const face = new THREE.PlaneGeometry(0.05, 0.05);
      const m1 = new THREE.MeshStandardMaterial({ map: decals.stop, roughness: 0.4 });
      b.add(m1, face, mat(x - 0.031, 1.36, z, 0, -Math.PI / 2));
      rig.stopButtons.push({ section: which, x, z });
    }
    // validators (yellow) near doors
    for (const [d0] of doors) {
      if (isF && d0 < -7) continue;
      b.add(M.validator, roundedBox(0.16, 0.28, 0.1, 0.03), mat(0.36, 1.3, d0 - 0.2));
      b.add(M.screen, new THREE.PlaneGeometry(0.1, 0.07), mat(0.36, 1.36, d0 - 0.2 + 0.051));
    }
    // trash bin by door
    b.add(M.wallInt2, new THREE.CylinderGeometry(0.1, 0.09, 0.4, 14), mat(iw - 0.12, yF + 0.2, isF ? -4.3 : 2.1));
    // priority seat stickers above windows
    const ps = new THREE.PlaneGeometry(0.3, 0.22); ps.rotateY(Math.PI / 2);
    b.add(new THREE.MeshStandardMaterial({ map: decals.priority, roughness: 0.5 }), ps, mat(-iw + 0.006, 2.55, isF ? -5.8 : 1.4));
  }

  function seatGeometry() {
    const shell = [], fabric = [], handle = [];
    // seat pan
    shell.push(prepGeo(roundedBox(0.44, 0.06, 0.44, 0.025), undefined)); xform(shell[0], mat(0, 0.41, 0.0));
    fabric.push(prepGeo(roundedBox(0.4, 0.055, 0.38, 0.025))); xform(fabric[0], mat(0, 0.465, -0.01));
    // backrest (tilted)
    const back = prepGeo(roundedBox(0.44, 0.66, 0.05, 0.03)); xform(back, mat(0, 0.8, 0.21, -0.2));
    shell.push(back);
    const bf = prepGeo(roundedBox(0.38, 0.52, 0.03, 0.02)); xform(bf, mat(0, 0.78, 0.18, -0.2));
    fabric.push(bf);
    const h = prepGeo(new THREE.TorusGeometry(0.11, 0.018, 8, 16, Math.PI)); xform(h, mat(0, 1.12, 0.28, -0.2));
    handle.push(h);
    const merge = (arr) => { const g = arr.length === 1 ? arr[0] : new THREE.BufferGeometry().copy(mergeArr(arr)); return g; };
    return { shell: merge(shell), fabric: merge(fabric), handle: merge(handle) };
  }

  function buildCab(b) {
    const iw = B.hw - 0.06;
    // driver platform
    const pg = new THREE.BoxGeometry(iw - 0.3, 0.26, 1.3); planarUV(pg, 'xz', 2, 2);
    b.add(M.floor, pg, mat(-(iw + 0.3) / 2, B.yFloor + 0.13, -7.62));
    b.add(M.yellowStrip, new THREE.BoxGeometry(0.03, 0.025, 1.3), mat(-0.31, B.yFloor + 0.255, -7.62));
    // partition behind driver
    b.add(M.wallInt2, new THREE.BoxGeometry(iw - 0.3, 0.9, 0.04), mat(-(iw + 0.3) / 2, 1.07, -6.95));
    const pgl = new THREE.PlaneGeometry(iw - 0.34, 0.62);
    b.add(M.glassFront, pgl, mat(-(iw + 0.3) / 2, 1.83, -6.95));
    b.add(M.black, new THREE.BoxGeometry(iw - 0.3, 0.04, 0.05), mat(-(iw + 0.3) / 2, 2.16, -6.95));
    b.add(M.black, new THREE.BoxGeometry(0.04, 1.54, 0.05), mat(-0.32, 1.39, -6.95));
    // cab side door (half height) on the aisle side, left open
    b.add(M.wallInt2, new THREE.BoxGeometry(0.03, 0.75, 0.62), mat(-0.12, 1.0, -7.2, 0, 0.9));
    // main dashboard in front of the driver
    const dash = new THREE.Shape();
    dash.moveTo(0, 0); dash.lineTo(0.56, 0); dash.lineTo(0.56, 0.38); dash.lineTo(0.3, 0.52); dash.lineTo(0.0, 0.46); dash.lineTo(0, 0);
    const dg = new THREE.ExtrudeGeometry(dash, { depth: iw - 0.28, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    // shape x -> bus -z (depth into dash), shape y -> y, extrusion -> bus x
    const dm4 = new THREE.Matrix4().set(0, 0, 1, -iw + 0.02, 0, 1, 0, B.yFloor + 0.26, -1, 0, 0, -7.9, 0, 0, 0, 1);
    b.add(M.dash, xform(prepGeo(dg), dm4));
    // top shelf under the full windshield width
    b.add(M.dash, roundedBox(iw * 2 - 0.1, 0.05, 0.36, 0.02), mat(0, 1.1, -8.4));
    b.add(M.dashDark, roundedBox(0.9, 0.36, 0.3, 0.03), mat(0.62, 0.88, -8.36));
    // instrument cluster (angled towards driver)
    const clusterM = mat(-0.66, 1.14, -8.02, -0.62);
    b.add(M.dashDark, roundedBox(0.66, 0.28, 0.08, 0.04), clusterM);
    const dial = new THREE.CircleGeometry(0.085, 40);
    b.add(dm.speedo, dial, new THREE.Matrix4().multiplyMatrices(clusterM, mat(-0.13, 0.0, 0.045)));
    b.add(M.screen, new THREE.PlaneGeometry(0.16, 0.1), new THREE.Matrix4().multiplyMatrices(clusterM, mat(0.12, 0.01, 0.045)));
    for (let k = 0; k < 8; k++) b.add(k % 3 === 0 ? M.marker : M.dashDark, new THREE.CircleGeometry(0.008, 10), new THREE.Matrix4().multiplyMatrices(clusterM, mat(-0.26 + k * 0.075, -0.115, 0.046)));
    // left switch console (angled up)
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) b.add(k === 2 && r === 0 ? M.red : M.dashDark, roundedBox(0.035, 0.02, 0.05, 0.006), mat(-1.06 + r * 0.075, 1.06, -7.95 + k * 0.07, 0, 0, 0.35));
    // gear push buttons D N R + door buttons on right console
    const gearsG = new THREE.Group();
    const gearMat = {};
    ['D', 'N', 'R'].forEach((g, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: g === 'N' ? 0x40ff70 : 0x40ff70, emissiveIntensity: 0, roughness: 0.4 });
      const mesh = new THREE.Mesh(roundedBox(0.05, 0.02, 0.05, 0.008), m); mesh.position.set(-0.36, 1.11, -7.9 + i * 0.065); gearsG.add(mesh);
      gearMat[g] = m;
    });
    frontBody.add(gearsG);
    rig.gearMat = gearMat;
    for (let k = 0; k < 5; k++) b.add(k === 4 ? M.red : M.validator, new THREE.CylinderGeometry(0.018, 0.018, 0.015, 12), mat(-0.36, 1.1, -7.62 + k * 0.05));
    // steering column + wheel (wheel is animated → separate group)
    b.add(M.dashDark, new THREE.CylinderGeometry(0.045, 0.06, 0.5, 12), mat(-0.66, 0.92, -7.82, 0.9));
    const wheelG = new THREE.Group(); wheelG.position.set(-0.66, 1.2, -7.6); wheelG.rotation.x = 0.62;
    const wbat = new Batch();
    wbat.add(M.dashDark, new THREE.TorusGeometry(0.25, 0.022, 10, 48).rotateX(Math.PI / 2));
    for (const a of [0, 2.3, 4.0]) wbat.add(M.dashDark, new THREE.BoxGeometry(0.22, 0.02, 0.045), mat(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0, -a));
    wbat.add(M.dashDark, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20), mat(0, 0.01, 0));
    wbat.add(M.chrome, new THREE.CylinderGeometry(0.03, 0.03, 0.055, 16), mat(0, 0.012, 0));
    const wheelSpin = new THREE.Group(); wbat.build(wheelSpin, { name: 'steeringWheel' });
    wheelG.add(wheelSpin); frontBody.add(wheelG);
    rig.steeringWheel = wheelSpin;
    // speedometer needle
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.003).translate(0, 0.033, 0), new THREE.MeshBasicMaterial({ color: 0xff3b1a }));
    const needleG = new THREE.Group(); needleG.applyMatrix4(new THREE.Matrix4().multiplyMatrices(clusterM, mat(-0.13, 0.0, 0.05)));
    needleG.add(needle); frontBody.add(needleG);
    rig.speedNeedle = needle;
    // driver seat
    b.add(M.driverSeat, roundedBox(0.5, 0.12, 0.5, 0.05), mat(-0.66, 1.0, -7.12));
    b.add(M.driverSeat, roundedBox(0.5, 0.7, 0.12, 0.06), mat(-0.66, 1.42, -6.86, -0.18));
    b.add(M.driverSeat, roundedBox(0.28, 0.2, 0.1, 0.04), mat(-0.66, 1.9, -6.8, -0.1));
    b.add(M.rubber, new THREE.CylinderGeometry(0.14, 0.16, 0.3, 14), mat(-0.66, 0.78, -7.1));
    // pedals
    b.add(M.dashDark, roundedBox(0.12, 0.25, 0.03, 0.01), mat(-0.56, 0.8, -8.05, -0.6));
    b.add(M.dashDark, roundedBox(0.2, 0.2, 0.03, 0.01), mat(-0.8, 0.78, -8.05, -0.6));
    // sun blind roller & interior mirror
    b.add(M.dashDark, new THREE.CylinderGeometry(0.03, 0.03, 0.95, 10).rotateZ(Math.PI / 2), mat(-0.65, 2.5, -8.36));
    b.add(M.dashDark, roundedBox(0.38, 0.14, 0.04, 0.03), mat(0.1, 2.42, -8.32, 0.3));
    b.add(M.mirrorGlass, new THREE.PlaneGeometry(0.34, 0.1), mat(0.1, 2.42, -8.295, 0.3));
    // microphone gooseneck
    b.add(M.dashDark, tubePath([[-1.0, 1.1, -7.75], [-1.0, 1.35, -7.72], [-0.9, 1.45, -7.6]], 0.008, 0.08), null);
    // route card in the right windscreen corner (readable from outside), BG flag & smiley
    b.add(dm.card, capDecal(0.26, 0.2, 0.8, 1.32, (x, y) => noseZ(x, y) + 0.03, -1, 4));
    b.add(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), new THREE.PlaneGeometry(0.26, 0.2), mat(0.8, 1.32, noseZ(0.8, 1.32) + 0.028));
    b.add(dm.smiley, capDecal(0.11, 0.11, 1.02, 1.5, (x, y) => noseZ(x, y) + 0.008, -1, 2));
    b.add(M.dashDark, new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), mat(0.38, 1.24, -8.42));
    const flag = new THREE.PlaneGeometry(0.11, 0.07); flag.translate(0.055, 0, 0);
    b.add(new THREE.MeshStandardMaterial({ map: decals.flag, side: THREE.DoubleSide, roughness: 0.8 }), flag, mat(0.38, 1.32, -8.42, 0, 0.5));
    // informator mounted on the left cab wall, angled to the driver
    const infM = mat(-1.12, 1.46, -7.72, -0.35, Math.PI / 2 - 0.55, 0);
    b.add(M.dashDark, roundedBox(0.31, 0.165, 0.05, 0.012), infM);
    const face = new THREE.PlaneGeometry(0.3, 0.155);
    const faceMat = new THREE.MeshStandardMaterial({ map: informator.ct.texture, emissive: 0xffffff, emissiveMap: informator.ct.texture, emissiveIntensity: 0.55, roughness: 0.45 });
    const faceMesh = new THREE.Mesh(face, faceMat); faceMesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(infM, mat(0, 0, 0.027)));
    faceMesh.name = 'informatorFace';
    frontBody.add(faceMesh);
    rig.informatorMesh = faceMesh;
    for (let k = 0; k < 4; k++) b.add(M.dashDark, new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14).rotateX(Math.PI / 2), new THREE.Matrix4().multiplyMatrices(infM, mat(-0.06 + k * 0.045, -0.058, 0.033)));
    b.add(M.dashDark, new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16).rotateX(Math.PI / 2), new THREE.Matrix4().multiplyMatrices(infM, mat(0.12, 0.005, 0.04)));
    // door-side grab poles at door 1
    b.add(M.rail, tubePath([[0.95, B.yFloor, -8.28], [0.95, 2.1, -8.28], [0.6, 2.3, -8.1]], 0.018, 0.12), null);
  }
}

function mergeArr(arr) {
  // local tiny merge (all prepared, non-indexed)
  let n = 0; for (const g of arr) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv', 'color']) {
    const size = arr[0].attributes[key].itemSize; const a = new Float32Array(n * size); let o = 0;
    for (const g of arr) { a.set(g.attributes[key].array, o); o += g.attributes[key].array.length; }
    out.setAttribute(key, new THREE.BufferAttribute(a, size));
  }
  return out;
}

/** Deforms both bellows for articulation angle phi (radians, rear relative to front). */
export function updateBellows(rig, phi) {
  const { ext, int } = rig.bellows;
  for (const bw of [ext, int]) {
    const { pos, profile, rings, pleats, depth, geo } = bw;
    const C = profile.length;
    for (let i = 0; i < rings; i++) {
      const u = i / (rings - 1);
      const a = phi * u, ca = Math.cos(a), sa = Math.sin(a);
      const zc = lerp(-0.35, 0.35, u);
      const pl = (1 - Math.cos(u * pleats * Math.PI * 2)) * 0.5; // 0 at crests
      const inset = pl * depth * (bw === ext ? 1 : -1);
      for (let j = 0; j < C; j++) {
        const p = profile[j];
        const lx = p.x - p.nx * inset, ly = p.y - p.ny * inset;
        const k = (i * C + j) * 3;
        pos[k] = lx * ca + zc * sa;
        pos[k + 1] = ly;
        pos[k + 2] = -lx * sa + zc * ca + B.hitch;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  rig.bellows.disc.rotation.y = phi / 2;
}

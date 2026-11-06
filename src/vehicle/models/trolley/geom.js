// Geometry helpers of the line-9 trolleybus models (no dependency on the MAN constants in BusSpec.js).
import * as THREE from 'three';

export { Parts, M, box, cyl, extrude, rectShape, rectPath, basis, lerp, clamp } from '../../BusGeom.js';

/** Ranges of [a, b] not covered by `ranges` ([[r0, r1], ...]). */
export function gaps(a, b, ranges) {
  const out = [];
  let c = a;
  for (const [r0, r1] of [...ranges].sort((p, q) => p[0] - q[0])) {
    if (r0 > c + 1e-3) out.push([c, Math.min(r0, b)]);
    c = Math.max(c, r1);
  }
  if (b > c + 1e-3) out.push([c, b]);
  return out;
}

/**
 * Side panel outline in the (z, y) plane between z0 and z1 from y0 to y1, with wheel-arch cut-outs of radius
 * archR round the axles (wheel centres at height cy). Arches only partly inside [z0, z1] (next to a door) are
 * clipped; an arch reaching above y1 cuts the panel through.
 */
export function panelShape(z0, z1, y0, y1, axles = [], archR = 0.62, cy = 0.48) {
  const dy = cy - y0;
  const bottom = [[z0, y0]];
  if (dy < archR) {
    const dx = Math.sqrt(archR * archR - dy * dy);
    for (const a of [...axles].sort((p, q) => p - q)) {
      const za = Math.max(z0, a - dx), zb = Math.min(z1, a + dx);
      if (zb - za < 0.02) continue;
      const n = 20;
      for (let i = 0; i <= n; i++) {
        const z = za + ((zb - za) * i) / n;
        const u = Math.min(1, Math.abs(z - a) / archR);
        const y = Math.min(y1, cy + archR * Math.sqrt(Math.max(0, 1 - u * u)));
        if (i === 0 && za > z0) bottom.push([za, y0]);
        bottom.push([z, Math.max(y0, y)]);
        if (i === n && zb < z1) bottom.push([zb, y0]);
      }
    }
  }
  bottom.push([z1, y0]);
  const sh = new THREE.Shape();
  sh.moveTo(bottom[0][0], bottom[0][1]);
  for (let i = 1; i < bottom.length; i++) sh.lineTo(bottom[i][0], bottom[i][1]);
  sh.lineTo(z1, y1);
  sh.lineTo(z0, y1);
  sh.closePath();
  return sh;
}

/**
 * Solaris IV wheel-arch fender (ref02 close-ups): a raised U-shaped moulding round the arch opening (centre ax, cy,
 * radius A) from the skirt bottom y0: a vertical rear leg at ax + rear, a top just above the belt, a front leg whose
 * outer edge runs from ax - front1 at the belt to ax - front0 at bandTop and then straight down. Shape in (z, y).
 */
export function fenderShape(ax, A, cy, y0, bandTop, belt, { rear, front0, front1, rise = 0.05 }) {
  const t0 = Math.asin(Math.max(-1, Math.min(1, (y0 - cy) / A)));
  const zr = ax + rear, zf0 = ax - front0, zf1 = ax - front1;
  const s = new THREE.Shape();
  s.moveTo(zr, y0);
  s.lineTo(zr, belt + rise * 0.3);
  s.bezierCurveTo(zr - 0.08, belt + rise * 1.15, ax + 0.2, belt + rise, ax - 0.05, belt + rise);
  s.quadraticCurveTo(zf1 - 0.06, belt + rise, zf1, belt - 0.03);
  s.lineTo(zf0, bandTop);
  s.lineTo(zf0, y0);
  s.lineTo(ax - A * Math.cos(t0), y0);
  s.absarc(ax, cy, A, Math.PI - t0, t0, true);
  s.lineTo(zr, y0);
  return s;
}

/** A strip following a bowed end outline between x0 and x1 (for decals on the front and the rear), UVs 0..1. */
export function endDecal(hw, r, bulge, zBase, dir, y0, y1, x0, x1, n = 16) {
  const pos = [], uv = [], idx = [];
  const dzAt = (x) => {
    const ax = Math.abs(x), flat = hw - r;
    if (ax <= flat) { const u = x / flat; return -bulge * (1 - u * u); }
    const t = Math.min(1, (ax - flat) / r);
    return r - Math.sqrt(Math.max(0, r * r - (t * r) * (t * r)));
  };
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const z = zBase - dir * (dzAt(x) - 0.006);
    for (const [y, v] of [[y0, 0], [y1, 1]]) { pos.push(x, y, z); uv.push(dir < 0 ? 1 - i / n : i / n, v); }
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    if (dir < 0) idx.push(a, b, c, c, b, d);
    else idx.push(a, c, b, c, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Roof fairing lofted along z: a rounded-shoulder cross-section (width w, corner radius r) whose height follows
 * h(z) (ramps down at the ends). Base at y0.
 */
export function fairingGeom(z0, z1, w, h, r, y0, { rampF = 0.5, rampR = 0.5, steps = 18 } = {}) {
  const hw = w / 2;
  const prof = (H) => {
    const rr = Math.min(r, H * 0.9, hw * 0.5);
    const pts = [[hw, 0]];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([hw - rr + Math.cos(a) * rr, H - rr + Math.sin(a) * rr]); }
    const right = pts;
    const left = right.map(([x, y]) => [-x, y]).reverse();
    return [...right, ...left];
  };
  const zs = [];
  for (let i = 0; i <= steps; i++) zs.push(z0 + ((z1 - z0) * i) / steps);
  const Hz = (z) => {
    const f = Math.min(1, (z - z0) / Math.max(1e-3, rampF)), b = Math.min(1, (z1 - z) / Math.max(1e-3, rampR));
    const k = Math.min(f, b);
    return Math.max(0.02, h * Math.sin((k * Math.PI) / 2));
  };
  const rows = zs.map((z) => prof(Hz(z)).map(([x, y]) => [x, y0 + y, z]));
  const n = rows[0].length;
  const pos = [], idx = [];
  for (const row of rows) for (const p of row) pos.push(...p);
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps
  for (const [ri, flip] of [[0, true], [rows.length - 1, false]]) {
    const base = pos.length / 3;
    const row = rows[ri];
    const cx = 0, cy = y0 + 0.01, cz = row[0][2];
    pos.push(cx, cy, cz);
    for (let j = 0; j < n - 1; j++) {
      if (flip) idx.push(base, ri * n + j + 1, ri * n + j);
      else idx.push(base, ri * n + j, ri * n + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Matrix that lays a (z, y) shape onto a body side: shape x -> section z, shape y -> height, extrusion
 * inwards from the skin at |x| = hw (side +1 right, -1 left).
 */
export function sideMatrix(side, hw) {
  return side > 0
    ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(hw, 0, 0)
    : new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-hw, 0, 0);
}

/** Flips the winding of a geometry made with a mirroring matrix (keeps the faces outward). */
export function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  return g;
}

/** Extruded side panel (shape in (z, y)) on one side; thickness inwards. */
export function sidePanel(shape, side, hw, thick, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 });
  g.applyMatrix4(sideMatrix(side, hw));
  if (side < 0) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

/** Plan outline of a bus end: [[x, dz]] from the left corner round to the right one (dz >= 0 into the body). */
export function endOutline(hw, r = 0.25, n = 8, bulge = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([-hw + r - Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  // the flat middle bows forward by `bulge`
  const m = 8;
  for (let i = 1; i < m; i++) {
    const x = -hw + r + ((2 * hw - 2 * r) * i) / m;
    const u = x / (hw - r);
    pts.push([x, -bulge * (1 - u * u)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI / 2 - (i / n) * (Math.PI / 2);
    pts.push([hw - r + Math.cos(a) * r, r - Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Vertical band following a plan outline between heights y0 and y1 (outline points [x, dz], dz into the body
 * from zBase; dir -1 at the front end (body towards +z), +1 at the rear). rake moves the top edge into the body;
 * inset(y) optionally shrinks the outline with height (rounded roof corners). Normals face outwards.
 */
export function endBand(outline, zBase, dir, y0, y1, { rake = 0, rows = 1, inset = null, curveOut = 0 } = {}) {
  const pos = [], uv = [], idx = [];
  const n = outline.length;
  let u = 0;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, y = y0 + (y1 - y0) * t;
    const k = inset ? inset(y) : 0;
    u = 0;
    for (let i = 0; i < n; i++) {
      const [x, dz] = outline[i];
      if (i > 0) u += Math.hypot(x - outline[i - 1][0], dz - outline[i - 1][1]);
      const sx = Math.sign(x) * Math.max(0, Math.abs(x) - k);
      const bow = curveOut * Math.sin(Math.PI * t); // the windscreen bulges forward in the middle of its height
      const z = zBase - dir * (dz + rake * t + k * 0.6 - bow);
      pos.push(sx, y, z);
      uv.push(u, t);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - 1; i++) {
      const a = r * n + i, b = a + 1, c = a + n, d = c + 1;
      if (dir < 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Body skin lofted along z from z0 to z1 over a cross-section [[x, y], ...] (right half, from the bottom up;
 * mirrored to the left): used for the roof edges, which run the whole section length.
 */
export function loftSection(half, z0, z1) {
  // left bottom -> up over the roof -> right bottom (the centre point once)
  const pts = [...half.map(([x, y]) => [-x, y]), ...half.slice(0, -1).reverse()];
  const pos = [], idx = [];
  const n = pts.length;
  for (const z of [z0, z1]) for (const [x, y] of pts) pos.push(x, y, z);
  for (let i = 0; i < n - 1; i++) {
    const a = i, b = i + 1, c = i + n, d = i + 1 + n;
    idx.push(a, c, b, b, c, d); // faces outwards (up on the roof)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Quarter-round roof edge cross-section (right half) from the window top to the roof. */
export function roofEdge(hw, wtop, roofY, r, n = 6, tumble = 0.02) {
  const pts = [[hw - tumble, wtop]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([hw - tumble - r + Math.cos(a) * r, roofY - r + Math.sin(a) * r]);
  }
  pts.push([0, roofY]);
  return pts;
}

/** Thin cylinder between two points (for ropes, rails, rods). */
export function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, false);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

/** Rounded-rectangle frame (outer minus inner) in the x-y plane, extruded along +z by `depth`. */
export function frameRect(x0, y0, x1, y1, w, r, depth) {
  const THREE_ = THREE;
  const s = new THREE_.Shape();
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + rr, y0); s.lineTo(x1 - rr, y0); s.quadraticCurveTo(x1, y0, x1, y0 + rr);
  s.lineTo(x1, y1 - rr); s.quadraticCurveTo(x1, y1, x1 - rr, y1); s.lineTo(x0 + rr, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - rr); s.lineTo(x0, y0 + rr); s.quadraticCurveTo(x0, y0, x0 + rr, y0);
  const h = new THREE_.Path();
  const a0 = x0 + w, b0 = y0 + w, a1 = x1 - w, b1 = y1 - w, ri = Math.max(0.005, rr - w);
  h.moveTo(a0 + ri, b0); h.quadraticCurveTo(a0, b0, a0, b0 + ri); h.lineTo(a0, b1 - ri);
  h.quadraticCurveTo(a0, b1, a0 + ri, b1); h.lineTo(a1 - ri, b1); h.quadraticCurveTo(a1, b1, a1, b1 - ri);
  h.lineTo(a1, b0 + ri); h.quadraticCurveTo(a1, b0, a1 - ri, b0); h.closePath();
  s.holes.push(h);
  return new THREE_.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
}

/**
 * Solaris IV roof shroud (ref02, ref09, ref13): the body side rises above the windows in a tall convex surface
 * that curves in to a flat roof, its height following top(z) (ramps at the ends). Returns {geom, x(y, H)}.
 * hw = half width at the window top (after tumblehome).
 */
export function shroudX(y, wtop, H, hw) {
  const t = Math.max(0, Math.min(1, (y - wtop) / Math.max(1e-3, H - wtop)));
  return hw - SHROUD_LEAN * Math.pow(t, 1.8);
}
// how far the shroud sides lean in from the window top to the roof crease (ref02, ref13: nearly flat, angular sides)
export const SHROUD_LEAN = 0.2;

/**
 * The Solaris IV roof shroud between z0 and z1: tall, slightly leaning sides from the window top `wtop` up to a crease
 * at height H, then a nearly flat top; it ramps down to `base` over rampF / rampR at its ends. Optional `cut(z, h)`
 * splits the sides: below the cut height they are returned separately as `lower` (the black glazing that rises to
 * the roof over the rear section, ref09). capF / capR close the ends; `breaks` adds rows at those z (sharp steps).
 */
export function shroudGeom(z0, z1, wtop, hw, H, base, { rampF = 0.5, rampR = 0.5, steps = 28, n = 8, n1 = 4, capF = true, capR = true, cut = null, breaks = [] } = {}) {
  const Hz = (z) => {
    const f = Math.min(1, (z - z0) / Math.max(1e-3, rampF)), b = Math.min(1, (z1 - z) / Math.max(1e-3, rampR));
    const k = Math.max(0, Math.min(f, b));
    return base + (H - base) * (1 - Math.pow(1 - k, 2));
  };
  const zs = [];
  for (let i = 0; i <= steps; i++) zs.push(z0 + ((z1 - z0) * i) / steps);
  for (const zb of breaks) if (zb > z0 && zb < z1) zs.push(zb - 0.01, zb);
  zs.sort((a, b) => a - b);
  const rowsU = [], rowsL = [], rowsR = [], caps = [];
  for (const z of zs) {
    const h = Hz(z);
    const yc = cut ? Math.max(wtop, Math.min(h, cut(z, h))) : wtop;
    // right side from the cut up to the crease, over the top to the centre; then mirrored down the left side
    const up = [];
    for (let i = 0; i <= n; i++) {
      const y = yc + ((h - yc) * i) / n;
      up.push([shroudX(y, wtop, h, hw), y]);
    }
    up.push([hw - SHROUD_LEAN - 0.22, h + 0.035], [0, h + 0.05]);
    const upper = [...up, ...up.slice(0, -1).map(([x, y]) => [-x, y]).reverse()];
    rowsU.push(upper.map(([x, y]) => [x, y, z]));
    const low = [];
    for (let i = 0; i <= n1; i++) {
      const y = wtop + ((yc - wtop) * i) / n1;
      low.push([shroudX(y, wtop, h, hw), y]);
    }
    rowsR.push(low.map(([x, y]) => [x, y, z]));
    rowsL.push(low.map(([x, y]) => [-x, y, z]).reverse());
    caps.push([...low.slice(0, -1), ...upper, ...low.slice(0, -1).map(([x, y]) => [-x, y]).reverse()].map(([x, y]) => [x, y, z]));
  }
  const loft = (rows, pos, idx) => {
    const m = rows[0].length, o = pos.length / 3;
    for (const row of rows) for (const q of row) pos.push(...q);
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = o + i * m + j, b = a + 1, c = a + m, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
  };
  // the end caps only close the shroud above the roof line (base - 0.1): below it is the saloon and the passage
  // through the bellows
  const capY = base - 0.1;
  const fan = (rowAll, front, pos, idx) => {
    const z = rowAll[0][2], h = Hz(z);
    if (h <= capY + 0.01) return;
    const xc = shroudX(capY, wtop, h, hw);
    const row = [[xc, capY, z], ...rowAll.filter((q) => q[1] > capY + 1e-4), [-xc, capY, z]];
    const o = pos.length / 3;
    pos.push(0, capY, z);
    for (const q of row) pos.push(...q);
    for (let j = 0; j < row.length - 1; j++) {
      if (front) idx.push(o, o + 2 + j, o + 1 + j);
      else idx.push(o, o + 1 + j, o + 2 + j);
    }
  };
  const mk = (pos, idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const pu = [], iu = [];
  loft(rowsU, pu, iu);
  if (capF) fan(caps[0], true, pu, iu);
  if (capR) fan(caps[caps.length - 1], false, pu, iu);
  let lower = null;
  if (cut) {
    const pl = [], il = [];
    loft(rowsR, pl, il);
    loft(rowsL, pl, il);
    lower = mk(pl, il);
  }
  return { geom: mk(pu, iu), lower, Hz };
}

/**
 * A slanted glass panel set into the side of the shroud: bottom edge from zb0 to zb1 at height y0, top edge at y1
 * shifted forwards by `lean` (a parallelogram leaning towards the front, ref02). side +1 right / -1 left.
 */
export function shroudInsert(side, zb0, zb1, y0, y1, lean, wtop, H, hw, nu = 8, nv = 6) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, y = y0 + (y1 - y0) * v;
    const x = side * (shroudX(y, wtop, H, hw) + 0.008);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      pos.push(x, y, zb0 + (zb1 - zb0) * u - lean * v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if ((side > 0) === (zb1 > zb0)) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

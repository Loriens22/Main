// Furniture generator: chairs, tables (with chairs), sofas, beds, benches,
// lamps, street lamps, bookshelves (filled with baked book-spine textures),
// wardrobes, grand pianos, TVs, fridges, bathtubs, fireplaces (with fire),
// grandfather clocks (swinging pendulum), rugs, mirrors (real reflections)
// and potted plants. Everything is parametric (sizes, legs, cushions,
// materials, colours) and seeded, so repeated prompts differ. The same
// builders are used to furnish building interiors.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { MeshBuilder } from './buildkit.js';
import { G } from '../../core/context.js';
import { buildTree } from '../../world/trees.js';
import { markNoAO } from '../../render/renderer.js';

// Box geometry with metre-scaled UVs.
export function mbox(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
function rbox(sx, sy, sz, r) {
  // Rounded-ish box: chamfer via scaled sphere-cube blend (cheap soft cushion look).
  const g = new THREE.BoxGeometry(sx, sy, sz, 6, 4, 6);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nx = v.x / (sx / 2), ny = v.y / (sy / 2), nz = v.z / (sz / 2);
    const k = r;
    v.x -= Math.sign(v.x) * k * Math.pow(Math.max(Math.abs(ny), Math.abs(nz)), 8) * Math.abs(nx) ** 8 * 0.5;
    v.x *= 1 - k * 0.3 * (ny * ny * nz * nz);
    v.z *= 1 - k * 0.3 * (ny * ny * nx * nx);
    v.y *= 1 - k * 0.2 * (nx * nx * nz * nz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(sx, sz), uv.getY(i) * Math.max(sy, sz));
  return g;
}

// Emitter that places parts into a MeshBuilder under a transform and records colliders.
class Emit {
  constructor(b, matrix, yaw = 0) { this.b = b; this.M = matrix || new THREE.Matrix4(); this.yaw = yaw; }
  box(key, cx, cy, cz, sx, sy, sz, collide = false, extra = {}) {
    const m = this.M.clone().multiply(new THREE.Matrix4().makeTranslation(cx, cy, cz));
    this.b.geometry(key, mbox(sx, sy, sz), m);
    if (collide) {
      const c = new THREE.Vector3(cx, cy - sy / 2, cz).applyMatrix4(this.M);
      this.b.colliders.push({ type: 'box', x: c.x, z: c.z, y0: c.y, y1: c.y + sy, hx: sx / 2, hz: sz / 2, yaw: this.yaw, ...extra });
    }
  }
  geo(key, g, local) { this.b.geometry(key, g, this.M.clone().multiply(local || new THREE.Matrix4())); }
  cyl(key, cx, cy, cz, r0, r1, h, segs = 16, collide = false) {
    const g = new THREE.CylinderGeometry(r1, r0, h, segs);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * Math.max(r0, r1), uv.getY(i) * h);
    this.geo(key, g, new THREE.Matrix4().makeTranslation(cx, cy, cz));
    if (collide) { const c = new THREE.Vector3(cx, cy - h / 2, cz).applyMatrix4(this.M); this.b.colliders.push({ type: 'cyl', x: c.x, z: c.z, y0: c.y, y1: c.y + h, r: Math.max(r0, r1) }); }
  }
}

const WOODS = ['wood', 'darkWood', 'lightWood'];
const FABRIC_COLORS = ['#6a7a8a', '#8a5a4a', '#3a4a5a', '#a89a7a', '#4a6a4a', '#7a3a3a', '#d8d0c0', '#2a2a30', '#5a4a6a', '#c8a060'];

// ---- Individual pieces (local origin at floor centre, facing +Z) ----
export const PIECES = {
  chair(e, r, o = {}) {
    const w = o.w || r.range(0.44, 0.52), d = w * r.range(0.95, 1.1), sh = o.seatH || r.range(0.44, 0.48), bh = r.range(0.4, 0.55);
    const wood = o.wood || 'wood', cushion = o.fabric;
    const legT = r.range(0.035, 0.05);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) e.box(wood, x * (w / 2 - legT), (sh - 0.04) / 2, z * (d / 2 - legT), legT, sh - 0.04, legT);
    e.box(wood, 0, sh - 0.02, 0, w, 0.04, d, true, { tag: 'seat' });
    if (cushion) e.box(cushion, 0, sh + 0.025, 0.01, w * 0.92, 0.05, d * 0.9);
    // Back rest with slats.
    const slats = r.int(2, 4);
    for (const x of [-1, 1]) e.box(wood, x * (w / 2 - legT), sh + bh / 2, -d / 2 + legT, legT, bh, legT);
    for (let i = 0; i < slats; i++) e.box(wood, 0, sh + bh * (0.35 + 0.6 * (i / Math.max(1, slats - 1))) * 0.95, -d / 2 + legT, w - legT * 2, 0.05, 0.02);
    return { seats: [{ x: 0, z: 0.05, y: sh, yaw: 0 }], r: Math.max(w, d) * 0.7, h: sh + bh };
  },
  stool(e, r, o = {}) {
    const sh = o.seatH || r.range(0.6, 0.75), rad = r.range(0.17, 0.22);
    e.cyl(o.wood || 'metal', 0, sh / 2, 0, 0.02, 0.02, sh, 8);
    e.cyl(o.wood || 'metal', 0, 0.02, 0, rad * 1.1, rad * 1.1, 0.03, 16);
    e.cyl(o.fabric || 'leather', 0, sh, 0, rad, rad, 0.06, 20, true);
    return { seats: [{ x: 0, z: 0, y: sh + 0.03, yaw: 0 }], r: rad, h: sh };
  },
  table(e, r, o = {}) {
    const kind = o.kind || 'dining';
    const w = o.w || (kind === 'coffee' ? r.range(0.9, 1.3) : kind === 'desk' ? r.range(1.2, 1.6) : r.range(1.4, 2.0));
    const d = o.d || (kind === 'coffee' ? r.range(0.5, 0.7) : kind === 'desk' ? r.range(0.6, 0.75) : r.range(0.85, 1.05));
    const h = kind === 'coffee' ? r.range(0.38, 0.45) : r.range(0.72, 0.77);
    const top = o.top || o.wood || 'wood', legs = o.legs || o.wood || 'wood';
    const round = kind === 'dining' && r.chance(0.25);
    if (round) {
      const rad = Math.min(w, 1.3) / 2 + 0.1;
      e.cyl(top, 0, h - 0.025, 0, rad, rad, 0.05, 32, true);
      e.cyl(legs, 0, (h - 0.05) / 2, 0, 0.06, 0.05, h - 0.05, 12);
      e.cyl(legs, 0, 0.03, 0, rad * 0.45, rad * 0.45, 0.05, 20);
      return { r: rad, h, round: true, w: rad * 2, d: rad * 2 };
    }
    e.box(top, 0, h - 0.025, 0, w, 0.05, d, true);
    const lt = r.range(0.05, 0.08);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) e.box(legs, x * (w / 2 - lt * 1.2), (h - 0.05) / 2, z * (d / 2 - lt * 1.2), lt, h - 0.05, lt);
    if (kind === 'desk') e.box(top, w / 2 - 0.25, h * 0.7, 0, 0.45, h * 0.35, d * 0.9);
    return { r: Math.hypot(w, d) / 2, h, w, d };
  },
  sofa(e, r, o = {}) {
    const seats = o.seats || r.int(2, 3), sw = r.range(0.6, 0.7);
    const w = seats * sw + 0.4, d = r.range(0.85, 0.95), sh = 0.44, bh = r.range(0.38, 0.5);
    const f = o.fabric || 'fabric', legs = o.wood || 'darkWood';
    e.box(f, 0, 0.26, 0.02, w, 0.28, d, true, { tag: 'seat' });
    for (let i = 0; i < seats; i++) e.geo(f, rbox(sw - 0.02, 0.16, d - 0.2, 0.8), new THREE.Matrix4().makeTranslation(-w / 2 + 0.2 + sw * (i + 0.5), 0.47, 0.08));
    e.box(f, 0, sh + bh / 2 - 0.05, -d / 2 + 0.1, w, bh + 0.2, 0.2);
    for (let i = 0; i < seats; i++) e.geo(f, rbox(sw - 0.04, bh * 0.8, 0.16, 0.8), new THREE.Matrix4().makeTranslation(-w / 2 + 0.2 + sw * (i + 0.5), sh + bh * 0.45, -d / 2 + 0.26));
    for (const x of [-1, 1]) e.geo(f, rbox(0.2, 0.62, d, 0.6), new THREE.Matrix4().makeTranslation(x * (w / 2 - 0.1), 0.31, 0.02));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) e.cyl(legs, x * (w / 2 - 0.08), 0.05, z * (d / 2 - 0.08), 0.02, 0.025, 0.1, 8);
    const seatList = [];
    for (let i = 0; i < seats; i++) seatList.push({ x: -w / 2 + 0.2 + sw * (i + 0.5), z: 0.12, y: sh + 0.06, yaw: 0 });
    return { seats: seatList, r: w / 2 + 0.1, h: sh + bh };
  },
  bed(e, r, o = {}) {
    const dbl = o.single ? false : r.chance(0.7);
    const w = dbl ? r.range(1.5, 1.8) : 0.95, l = 2.05;
    const frame = o.wood || 'wood', sheet = o.sheet || 'cotton', duvet = o.fabric || 'fabric';
    e.box(frame, 0, 0.2, 0, w + 0.08, 0.2, l + 0.08, true, { tag: 'seat' });
    e.box(sheet, 0, 0.38, 0, w, 0.18, l);
    e.geo(duvet, rbox(w + 0.04, 0.08, l * 0.62, 0.5), new THREE.Matrix4().makeTranslation(0, 0.49, l * 0.18));
    for (let i = 0; i < (dbl ? 2 : 1); i++) e.geo(sheet, rbox(dbl ? w * 0.42 : w * 0.8, 0.12, 0.38, 1), new THREE.Matrix4().makeTranslation(dbl ? (i ? 1 : -1) * w * 0.23 : 0, 0.53, -l / 2 + 0.3));
    e.box(frame, 0, 0.55, -l / 2 - 0.03, w + 0.12, 0.9, 0.06, true);
    return { seats: [{ x: 0, z: 0.2, y: 0.47, yaw: 0 }], r: Math.hypot(w, l) / 2, h: 1 };
  },
  bench(e, r, o = {}) {
    const w = r.range(1.4, 1.9), sh = 0.45;
    const wood = o.wood || 'deck', metal = o.metal || 'iron';
    for (let i = 0; i < 4; i++) e.box(wood, 0, sh, -0.18 + i * 0.12, w, 0.035, 0.1, i === 0, { tag: 'seat' });
    e.collider = true;
    for (let i = 0; i < 3; i++) e.box(wood, 0, sh + 0.2 + i * 0.13, -0.28, w, 0.09, 0.03);
    for (const x of [-1, 1]) {
      e.box(metal, x * (w / 2 - 0.1), sh / 2, 0, 0.05, sh, 0.5);
      e.box(metal, x * (w / 2 - 0.1), sh + 0.25, -0.28, 0.05, 0.5, 0.04);
      e.box(metal, x * (w / 2 - 0.1), sh + 0.18, 0.02, 0.05, 0.04, 0.5);
    }
    const c = new THREE.Vector3(0, 0, 0).applyMatrix4(e.M);
    e.b.colliders.push({ type: 'box', x: c.x, z: c.z, y0: c.y, y1: c.y + sh + 0.02, hx: w / 2, hz: 0.28, yaw: e.yaw, tag: 'seat' });
    return { seats: [{ x: -w / 4, z: 0.05, y: sh + 0.03, yaw: 0 }, { x: w / 4, z: 0.05, y: sh + 0.03, yaw: 0 }], r: w / 2, h: 0.95 };
  },
  lamp(e, r, o = {}) {
    const floor = o.floor ?? r.chance(0.7);
    const h = floor ? r.range(1.5, 1.75) : 0.5;
    const metal = o.metal || r.pick(['metal', 'bronze', 'iron']);
    e.cyl(metal, 0, 0.015, 0, floor ? 0.16 : 0.1, floor ? 0.16 : 0.1, 0.03, 20);
    e.cyl(metal, 0, h / 2, 0, 0.012, 0.012, h, 8, floor);
    const shade = new THREE.CylinderGeometry(floor ? 0.14 : 0.1, floor ? 0.22 : 0.15, floor ? 0.26 : 0.18, 24, 1, true);
    e.geo(o.shade || 'shade', shade, new THREE.Matrix4().makeTranslation(0, h, 0));
    e.geo('bulb', new THREE.SphereGeometry(0.045, 12, 8), new THREE.Matrix4().makeTranslation(0, h - 0.03, 0));
    return { r: 0.25, h: h + 0.15, light: { pos: [0, h - 0.05, 0], color: '#ffd6a0', intensity: floor ? 2.2 : 1.2, distance: floor ? 7 : 4 } };
  },
  streetlamp(e, r, o = {}) {
    const h = r.range(3.8, 4.8);
    const metal = o.metal || 'iron';
    e.cyl(metal, 0, 0.3, 0, 0.14, 0.12, 0.6, 12);
    e.cyl(metal, 0, h / 2, 0, 0.07, 0.05, h, 12, true);
    const victorian = r.chance(0.5);
    if (victorian) {
      e.cyl(metal, 0, h + 0.05, 0, 0.12, 0.18, 0.1, 8);
      e.geo('glassGlow', new THREE.CylinderGeometry(0.16, 0.12, 0.4, 8), new THREE.Matrix4().makeTranslation(0, h + 0.3, 0));
      e.geo(metal, new THREE.ConeGeometry(0.26, 0.25, 8), new THREE.Matrix4().makeTranslation(0, h + 0.62, 0));
      return { r: 0.3, h: h + 0.8, light: { pos: [0, h + 0.3, 0], color: '#ffc27a', intensity: 6, distance: 16, nightOnly: true } };
    }
    e.box(metal, 0, h + 0.05, 0.4, 0.08, 0.08, 0.9);
    e.box(metal, 0, h + 0.02, 0.85, 0.3, 0.08, 0.5);
    e.box('glassGlow', 0, h - 0.03, 0.85, 0.24, 0.03, 0.4);
    return { r: 0.3, h: h + 0.1, light: { pos: [0, h - 0.2, 0.85], color: '#ffe0b0', intensity: 7, distance: 18, nightOnly: true } };
  },
  bookshelf(e, r, o = {}) {
    const w = r.range(0.9, 1.6), h = r.range(1.8, 2.3), d = 0.35;
    const wood = o.wood || r.pick(WOODS);
    const shelves = Math.round(h / 0.36);
    e.box(wood, -w / 2 + 0.02, h / 2, 0, 0.04, h, d, true);
    e.box(wood, w / 2 - 0.02, h / 2, 0, 0.04, h, d, true);
    e.box(wood, 0, h / 2, -d / 2 + 0.01, w, h, 0.02);
    e.box(wood, 0, h - 0.02, 0, w, 0.04, d);
    e.box(wood, 0, 0.05, 0, w, 0.1, d);
    for (let i = 1; i < shelves; i++) e.box(wood, 0, (h / shelves) * i, 0, w - 0.08, 0.025, d - 0.02);
    for (let i = 0; i < shelves; i++) {
      const y0 = (h / shelves) * i + (i === 0 ? 0.1 : 0.0125);
      const bh = h / shelves - 0.05;
      // One textured "row of spines" box per shelf.
      const g = mbox(w - 0.1, bh * 0.92, d * 0.75);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + i * 0.37 + r.next() * 0, uv.getY(k));
      e.geo('books', g, new THREE.Matrix4().makeTranslation(0, y0 + bh * 0.46, 0.02));
    }
    return { r: w / 2, h };
  },
  wardrobe(e, r, o = {}) {
    const w = r.range(0.9, 1.6), h = r.range(1.8, 2.1), d = 0.6;
    const wood = o.wood || r.pick(WOODS);
    e.box(wood, 0, h / 2, 0, w, h, d, true);
    const doors = w > 1.2 ? 2 : 1;
    for (let i = 0; i < doors; i++) {
      const dw = w / doors - 0.03, x = -w / 2 + (w / doors) * (i + 0.5);
      e.box(wood, x, h / 2, d / 2 + 0.01, dw, h - 0.06, 0.02);
      e.box('metal', x + (i === 0 && doors === 2 ? dw * 0.4 : -dw * 0.4), h * 0.52, d / 2 + 0.035, 0.02, 0.15, 0.02);
    }
    return { r: w / 2, h };
  },
  piano(e, r, o = {}) {
    const lacquer = o.lacquer || 'lacquer';
    const body = new THREE.Shape();
    body.moveTo(-0.75, -0.8); body.lineTo(0.75, -0.8); body.lineTo(0.75, 0.2); body.bezierCurveTo(0.75, 0.9, 0.2, 1.0, -0.1, 1.2); body.bezierCurveTo(-0.5, 1.4, -0.75, 1.1, -0.75, 0.8); body.lineTo(-0.75, -0.8);
    const g = new THREE.ExtrudeGeometry(body, { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    e.geo(lacquer, g, new THREE.Matrix4().makeTranslation(0, 0.65, 0.2));
    const lid = new THREE.ExtrudeGeometry(body, { depth: 0.02, bevelEnabled: false });
    lid.rotateX(-Math.PI / 2);
    e.geo(lacquer, lid, new THREE.Matrix4().makeTranslation(0, 1.0, 0.2).multiply(new THREE.Matrix4().makeRotationX(0.6)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0)));
    for (const [x, z] of [[-0.65, 0.9], [0.65, 0.9], [0, -1.0]]) e.cyl(lacquer, x, 0.33, -z + 0.2, 0.05, 0.06, 0.66, 12);
    e.box('keysWhite', 0, 0.74, 1.02, 1.4, 0.03, 0.15);
    for (let i = 0; i < 36; i++) if ([1, 2, 4, 5, 6].includes(i % 7)) e.box(lacquer, -0.68 + i * 0.039, 0.765, 0.99, 0.022, 0.025, 0.09);
    e.box(lacquer, 0, 0.9, 0.95, 1.5, 0.2, 0.05);
    const c = new THREE.Vector3(0, 0, 0.2).applyMatrix4(e.M);
    e.b.colliders.push({ type: 'box', x: c.x, z: c.z, y0: c.y, y1: c.y + 1.0, hx: 0.78, hz: 0.95, yaw: e.yaw });
    // Bench.
    e.box(lacquer, 0, 0.48, 1.55, 0.8, 0.06, 0.35, true, { tag: 'seat' });
    for (const x of [-0.35, 0.35]) e.box(lacquer, x, 0.23, 1.55, 0.05, 0.46, 0.3);
    return { r: 1.3, h: 1.4, seats: [{ x: 0, z: 1.62, y: 0.52, yaw: Math.PI }] };
  },
  tv(e, r, o = {}) {
    const w = r.range(1.0, 1.6), h = w * 0.58;
    e.box('darkWood', 0, 0.25, 0, w * 1.2, 0.5, 0.45, true);
    e.box('plasticBlack', 0, 0.55 + h / 2, -0.05, w, h, 0.05);
    e.box('screen', 0, 0.55 + h / 2, -0.02, w * 0.96, h * 0.94, 0.01);
    return { r: w * 0.6, h: 0.6 + h, light: { pos: [0, 0.55 + h / 2, 0.3], color: '#9ac4ff', intensity: 0.8, distance: 4 } };
  },
  fridge(e, r) {
    const h = r.range(1.7, 1.9);
    e.box('appliance', 0, h / 2, 0, 0.7, h, 0.68, true);
    e.box('metal', 0.28, h * 0.72, 0.35, 0.03, 0.4, 0.03);
    e.box('metal', 0.28, h * 0.3, 0.35, 0.03, 0.3, 0.03);
    e.box('plasticBlack', 0, h * 0.58, 0.345, 0.69, 0.01, 0.01);
    return { r: 0.45, h };
  },
  bathtub(e, r) {
    const w = 0.8, l = 1.7, h = 0.58;
    e.box('porcelain', 0, h / 2, -l / 2 + 0.04, w, h, 0.08, true);
    e.box('porcelain', 0, h / 2, l / 2 - 0.04, w, h, 0.08, true);
    e.box('porcelain', -w / 2 + 0.04, h / 2, 0, 0.08, h, l, true);
    e.box('porcelain', w / 2 - 0.04, h / 2, 0, 0.08, h, l, true);
    e.box('porcelain', 0, 0.06, 0, w, 0.12, l);
    e.box('waterTub', 0, h * 0.7, 0, w - 0.1, 0.01, l - 0.1);
    e.cyl('chrome', 0, h + 0.15, -l / 2 + 0.05, 0.02, 0.02, 0.3, 8);
    return { r: 1, h };
  },
  fireplace(e, r) {
    const w = r.range(1.4, 1.8), h = 1.2, d = 0.5;
    const stone = r.pick(['stone', 'brick', 'marble']);
    e.box(stone, -w / 2 + 0.2, h / 2, 0, 0.4, h, d, true);
    e.box(stone, w / 2 - 0.2, h / 2, 0, 0.4, h, d, true);
    e.box(stone, 0, h - 0.15, 0, w, 0.3, d, true);
    e.box(stone, 0, h + 0.03, 0.03, w + 0.15, 0.06, d + 0.1);
    e.box('soot', 0, h * 0.4, -d / 2 + 0.05, w - 0.8, h * 0.8, 0.1);
    e.box(stone, 0, 0.05, 0.1, w + 0.2, 0.1, d + 0.3, true);
    for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8); g.rotateZ(Math.PI / 2); e.geo('logWood', g, new THREE.Matrix4().makeTranslation(0, 0.15 + (i === 2 ? 0.1 : 0), (i - 1) * 0.1).multiply(new THREE.Matrix4().makeRotationY((i - 1) * 0.3))); }
    return { r: w / 2, h: h + 0.1, fire: [0, 0.2, 0], light: { pos: [0, 0.5, 0.4], color: '#ff9a4a', intensity: 4, distance: 8, flicker: true } };
  },
  clock(e, r) {
    const h = 2.0;
    const wood = r.pick(['darkWood', 'wood']);
    e.box(wood, 0, 0.3, 0, 0.5, 0.6, 0.32, true);
    e.box(wood, 0, 1.1, 0, 0.38, 1.0, 0.26, true);
    e.box('glass', 0, 1.1, 0.135, 0.28, 0.85, 0.01);
    e.box(wood, 0, 1.8, 0, 0.5, 0.5, 0.32, true);
    e.cyl('clockFace', 0, 1.82, 0.165, 0.18, 0.18, 0.01, 32);
    e.geo(wood, new THREE.ConeGeometry(0.3, 0.2, 4), new THREE.Matrix4().makeTranslation(0, 2.15, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)));
    return { r: 0.35, h: h + 0.2, pendulum: { pos: [0, 1.5, 0.05], len: 0.55 }, clockHands: { pos: [0, 1.82, 0.175] } };
  },
  rug(e, r, o = {}) {
    const w = r.range(1.6, 3), d = w * r.range(0.6, 0.8);
    e.box(o.rug || 'rug', 0, 0.006, 0, w, 0.012, d);
    return { r: Math.hypot(w, d) / 2, h: 0.02, flat: true };
  },
  plant(e, r, o = {}) {
    const h = r.range(0.35, 0.6), pr = r.range(0.14, 0.24);
    const pot = new THREE.CylinderGeometry(pr, pr * 0.75, h, 20, 1, true);
    e.geo(o.pot || 'terracotta', pot, new THREE.Matrix4().makeTranslation(0, h / 2, 0));
    e.cyl('soil', 0, h - 0.04, 0, pr * 0.95, pr * 0.95, 0.02, 20);
    const t = buildTree('bush', r.nextU32(), 0.7, { height: [0.5, 0.9] });
    if (t.leaves) e.geo('plantLeaves', t.leaves, new THREE.Matrix4().makeTranslation(0, h - 0.05, 0).multiply(new THREE.Matrix4().makeScale(0.8, 0.9, 0.8)));
    const c = new THREE.Vector3(0, 0, 0).applyMatrix4(e.M);
    e.b.colliders.push({ type: 'cyl', x: c.x, z: c.z, y0: c.y, y1: c.y + h, r: pr });
    return { r: pr + 0.15, h: h + 0.8 };
  },
  mirror() { return { r: 0.5, h: 1.9, mirror: true }; },
};

// Material set used by furniture parts.
export function furnitureMaterials(r, o = {}) {
  const M = G.materials;
  const fabricColor = o.fabricColor || r.pick(FABRIC_COLORS);
  const woodType = o.woodType || r.pick(WOODS);
  const mats = {
    wood: M.get(woodType, { seed: r.int(0, 2), color: o.woodColor }),
    darkWood: M.get('darkWood', { seed: r.int(0, 2) }),
    lightWood: M.get('lightWood', { seed: r.int(0, 2) }),
    deck: M.get('deck', { seed: 1 }),
    fabric: M.get(o.fabricType || (r.chance(0.3) ? 'velvet' : 'fabric'), { color: fabricColor }),
    cotton: M.get('cotton', { color: '#f0eee8' }),
    leather: M.get('leather', { color: o.leatherColor || r.pick(['#4a2e1c', '#1a1a1a', '#7a4a2a']) }),
    metal: M.get('metal', { color: '#9a9ea4' }),
    iron: M.get('iron', {}),
    bronze: M.get('bronze', {}),
    chrome: M.get('chrome', {}),
    shade: M.get('fabric', { color: '#f2e8d0', side: THREE.DoubleSide, emissive: '#ffcf90', emissiveIntensity: 0.25 }),
    bulb: M.get('emissive', { color: '#ffe0b0', emissiveIntensity: 4 }),
    glassGlow: M.get('emissive', { color: '#ffd8a0', emissiveIntensity: 3 }),
    books: M.get('books', { seed: r.int(0, 4) }),
    lacquer: M.plain(o.lacquerColor || '#0c0c0e', 0.12, 0.1),
    keysWhite: M.plain('#f4f2ec', 0.3, 0),
    plasticBlack: M.plain('#141416', 0.35, 0),
    screen: M.get('emissive', { color: '#2a3a5a', emissiveIntensity: 0.6 }),
    appliance: M.get('glossyPlastic', { color: r.pick(['#f2f2f2', '#c8c8cc', '#e0dcd0']) }),
    porcelain: M.get('glossyPlastic', { color: '#f4f4f2' }),
    waterTub: M.get('water', { color: '#9ad0e0', opacity: 0.6 }),
    stone: M.get('stone', {}), brick: M.get('brick', {}), marble: M.get('marble', {}),
    soot: M.plain('#141210', 0.95, 0),
    logWood: M.get('logs', {}),
    glass: M.get('glass', {}),
    clockFace: M.plain('#f0e8d8', 0.4, 0),
    rug: M.get(r.chance(0.5) ? 'rug' : 'carpet', { color: r.pick(['#8a2a2a', '#2a3a6a', '#6a5a3a', '#3a5a4a']), color2: '#d8c090' }),
    terracotta: M.get('rooftiles', { color: '#b0603a', p: [1, 1, 0, 0] }),
    soil: M.get('soil', {}),
    plantLeaves: M.get('leaves', { color: '#2e5a18', color2: '#46721e', color3: '#6a8a30', p: [0, 18], alphaTest: 0.42, side: THREE.DoubleSide, foliage: true, translucent: 0x2a4a10 }),
  };
  return mats;
}

// Place a piece into a MeshBuilder at (x, z, yaw) on floor y. Returns info with world-local seats.
export function placePiece(b, kind, r, x, y, z, yaw, opts = {}) {
  const M = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const e = new Emit(b, M, yaw);
  const info = (PIECES[kind] || PIECES.chair)(e, r, opts) || {};
  info.seats = (info.seats || []).map((s) => {
    const p = new THREE.Vector3(s.x, 0, s.z).applyMatrix4(M);
    return { x: p.x, z: p.z, y: y + s.y, yaw: yaw + s.yaw, floorY: y };
  });
  if (info.light) info.light.pos = new THREE.Vector3().fromArray(info.light.pos).applyMatrix4(M).toArray();
  return info;
}

const KIND_MAP = { chair: 'chair', table: 'table', sofa: 'sofa', bed: 'bed', bench: 'bench', lamp: 'lamp', streetlamp: 'streetlamp', bookshelf: 'bookshelf', wardrobe: 'wardrobe', piano: 'piano', tv: 'tv', fridge: 'fridge', bathtub: 'bathtub', fireplace: 'fireplace', clock: 'clock', rug: 'rug', mirror: 'mirror', plant: 'plant' };

export const furnitureGen = {
  maxCount: 16,
  estimate: () => 1.2,
  stages: () => [{ name: 'geometry', label: 'Modelling furniture', weight: 3 }, { name: 'textures', label: 'Baking materials', weight: 1.5 }],
  *build(ctx, item, rng) {
    const a = item.attrs || {};
    let kind = KIND_MAP[item.params.kind] || 'chair';
    const words = a.words || [];
    if (kind === 'chair' && words.includes('stool')) kind = 'stool';
    ctx.stage('geometry', 'Modelling ' + kind);
    const woodType = a.materials.find((m) => ['wood', 'darkWood', 'lightWood', 'planks'].includes(m));
    const fabricType = a.materials.find((m) => ['leather', 'velvet', 'fabric', 'denim', 'knit'].includes(m));
    const mats = furnitureMaterials(rng, {
      fabricColor: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined,
      woodType: woodType === 'planks' ? 'wood' : woodType, fabricType,
      lacquerColor: kind === 'piano' && a.primaryColor ? a.primaryColor : undefined,
    });
    // Metal/gold/glass requests override structural wood.
    const matOverride = a.materials.find((m) => ['gold', 'chrome', 'metal', 'steel', 'glass', 'marble', 'stone', 'crystal', 'ice', 'plastic', 'glossyPlastic'].includes(m));
    if (matOverride) { mats.wood = G.materials.get(matOverride, { color: a.primaryColor && matOverride !== 'glass' ? a.primaryColor : undefined }); mats.darkWood = mats.wood; mats.lightWood = mats.wood; }
    yield;
    const b = new MeshBuilder();
    const root = new THREE.Group();
    const opts = { kind: /coffee/.test(item.clause) ? 'coffee' : /desk|workbench|counter/.test(item.clause) ? 'desk' : kind === 'table' ? 'dining' : undefined };
    if (/office|swivel/.test(item.clause) && kind === 'chair') opts.fabric = 'leather';
    if (/throne/.test(item.clause)) { opts.fabric = 'fabric'; mats.wood = G.materials.get('gold'); }
    if (/armchair|rocking/.test(item.clause) && kind === 'chair') { kind = 'sofa'; opts.seats = 1; }
    const info = placePiece(b, kind, rng, 0, 0, 0, 0, opts);
    let seats = info.seats || [];
    // Dining sets: "a table with four chairs".
    const nChairs = kind === 'table' ? (a.withCounts && (a.withCounts.chair || a.withCounts.stool)) || (/\bchairs?\b/.test(item.clause) ? 4 : 0) : 0;
    if (nChairs) {
      const w = info.w || 1.6, d = info.d || 0.9;
      const cr = rng.fork('chairs');
      const chairOpts = { wood: 'wood', fabric: rng.chance(0.5) ? 'fabric' : null };
      const spots = [];
      const perSide = Math.max(1, Math.ceil(nChairs / 2));
      if (info.round) for (let i = 0; i < nChairs; i++) { const ang = (i / nChairs) * Math.PI * 2; spots.push([Math.sin(ang) * (w / 2 + 0.35), Math.cos(ang) * (w / 2 + 0.35), ang + Math.PI]); }
      else {
        for (let i = 0; i < nChairs; i++) {
          const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
          if (k < perSide) spots.push([(-w / 2 + (w / perSide) * (k + 0.5)), side * (d / 2 + 0.3), side > 0 ? Math.PI : 0]);
        }
      }
      for (const [x, z, yaw] of spots) {
        const ci = placePiece(b, 'chair', cr.fork(String(x)), x, 0, z, yaw, { ...chairOpts, wood: 'wood' });
        seats = seats.concat(ci.seats);
      }
    }
    ctx.progress(0.6);
    ctx.stage('textures', 'Baking materials');
    yield;
    const meshGroup = b.build(mats);
    root.add(meshGroup);
    const data = {
      root, name: (a.primaryColor ? a.colors[0].word + ' ' : '') + (kind === 'table' && nChairs ? 'dining set' : item.concept), category: 'furniture', icon: item.icon,
      height: info.h || 1, footprint: { radius: Math.max(info.r || 0.6, nChairs ? 1.4 : 0) }, colliderDefs: b.colliders,
    };
    if (seats.length) { data.seats = seats; data.seatWorld = seatWorldFn(data); }
    if (info.light) data.lights = [{ ...info.light }];
    if (info.fire) attachFire(root, info.fire, 0.6);
    if (info.pendulum) attachPendulum(data, root, info);
    if (info.mirror) attachMirror(root, rng, mats);
    const sm = Math.max(0.2, Math.min(4, (a.sizeMul || 1)));
    if (sm !== 1) { root.children.forEach((c) => c.scale.multiplyScalar(sm)); data.colliderDefs = data.colliderDefs.map((c) => scaleCollider(c, sm)); data.height *= sm; data.footprint.radius *= sm; if (data.seats) data.seats = data.seats.map((s) => ({ ...s, x: s.x * sm, z: s.z * sm, y: s.y * sm })); }
    if (seats.length) data.interact = { label: () => 'Sit down', action: (e, player) => sitNearest(data, player) };
    return data;
  },
};

export function scaleCollider(c, s) {
  if (c.type === 'cyl') return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, r: c.r * s };
  return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, hx: c.hx * s, hz: c.hz * s };
}

// Seats are stored in entity-local space; convert to a world "sit" descriptor.
export function seatWorldFn(data) {
  return (s) => {
    const root = data.root;
    root.updateMatrixWorld();
    const sc = root.scale.x;
    const seatPos = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(root.matrixWorld);
    const floor = new THREE.Vector3(s.x, s.floorY || 0, s.z).applyMatrix4(root.matrixWorld);
    const yaw = root.rotation.y + s.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const feet = new THREE.Vector3(seatPos.x, floor.y, seatPos.z);
    return { feet, yaw, height: (seatPos.y - floor.y) / Math.max(0.2, sc), eye: seatPos.clone().add(new THREE.Vector3(0, 0.78, 0)).addScaledVector(fwd, 0.05), exit: feet.clone().addScaledVector(fwd, 0.9), src: s };
  };
}

export function sitNearest(data, player) {
  let best = null, bd = Infinity;
  for (const s of data.seats) {
    const w = data.seatWorld(s);
    const d = w.feet.distanceTo(player.position);
    if (d < bd) { bd = d; best = w; }
  }
  if (best) player.sitAt({ ...best, seatHeight: best.height, yaw: best.yaw + Math.PI, lookYaw: best.yaw });
}

// Simple animated fire (flickering emissive cones + ember sprites).
export function attachFire(root, pos, size = 1) {
  const group = new THREE.Group();
  group.position.fromArray(pos);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const mat2 = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flames = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 * size, 0.5 * size, 8, 1, true), i < 3 ? mat2 : mat);
    f.position.set((Math.random() - 0.5) * 0.2 * size, 0.22 * size, (Math.random() - 0.5) * 0.2 * size);
    f.userData.seed = Math.random() * 10;
    f.userData.noRaycast = true;
    group.add(f);
    flames.push(f);
  }
  group.userData.update = (t) => {
    for (const f of flames) {
      const s = f.userData.seed;
      const k = 0.75 + 0.35 * Math.sin(t * 9 + s * 3) * Math.sin(t * 5.3 + s);
      f.scale.set(1 + Math.sin(t * 7 + s) * 0.15, k * (0.8 + (s % 1) * 0.6), 1 + Math.cos(t * 6 + s) * 0.15);
      f.rotation.y = t * (0.5 + s * 0.1);
    }
  };
  markNoAO(group);
  root.add(group);
  root.userData.animated = root.userData.animated || [];
  root.userData.animated.push(group.userData.update);
  return group;
}

function attachPendulum(data, root, info) {
  const pivot = new THREE.Object3D();
  pivot.position.fromArray(info.pendulum.pos);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, info.pendulum.len, 6), G.materials.get('bronze'));
  rod.position.y = -info.pendulum.len / 2;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20), G.materials.get('bronze'));
  bob.rotation.x = Math.PI / 2; bob.position.y = -info.pendulum.len;
  pivot.add(rod, bob);
  root.add(pivot);
  const hands = new THREE.Group();
  hands.position.fromArray(info.clockHands.pos);
  const hm = G.materials.plain('#141414', 0.5, 0.3);
  const hr = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.004), hm); hr.geometry.translate(0, 0.045, 0);
  const mn = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.14, 0.004), hm); mn.geometry.translate(0, 0.07, 0);
  hands.add(hr, mn);
  root.add(hands);
  const prev = data.update;
  data.update = (dt, t) => {
    pivot.rotation.z = Math.sin(t * Math.PI) * 0.18;
    const now = new Date();
    mn.rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
    hr.rotation.z = -((now.getHours() % 12) / 12 + now.getMinutes() / 720) * Math.PI * 2;
    if (prev) prev(dt, t);
  };
}

export function attachMirror(root, rng, mats) {
  const w = 0.8, h = 1.7;
  const frame = new THREE.Group();
  const fm = mats.darkWood || G.materials.get('darkWood');
  const parts = [[0, h / 2 + 0.15, w + 0.1, 0.08], [0, 0.15, w + 0.1, 0.08]];
  for (const [x, y, sx, sy] of parts) { const m = new THREE.Mesh(mbox(sx, sy, 0.06), fm); m.position.set(x, y + 0.02, 0); frame.add(m); }
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) { const m = new THREE.Mesh(mbox(0.08, h + 0.08, 0.06), fm); m.position.set(x, 0.17 + h / 2, 0); frame.add(m); }
  const mirror = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 512, textureHeight: 1024, color: 0xb8bcc0, clipBias: 0.003 });
  mirror.position.set(0, 0.17 + h / 2, 0.01);
  mirror.camera.layers.enable(1); // show the player's head in mirrors
  mirror.userData.noRaycast = true;
  frame.add(mirror);
  for (const x of [-0.3, 0.3]) { const leg = new THREE.Mesh(mbox(0.06, 0.2, 0.4), fm); leg.position.set(x, 0.1, 0); frame.add(leg); }
  frame.traverse((o) => { if (o.isMesh && o !== mirror) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(frame);
  return mirror;
}

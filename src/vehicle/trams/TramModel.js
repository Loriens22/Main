// Shared builder of the tram models (SchindlerModel.js, T6MModel.js): body shells with real window and door
// openings, roof, joint ends, underframe, bogies posed on the track, pantograph reaching for the contact wire,
// folding doors, bellows that follow the sections, the saloon (floors, steps, seats from the seat map, poles,
// lights) and the driver's cab. It implements the vehicle model interface of the buses
// (src/vehicle/models/README.md); the differences: one group per body section (model[sec.id], also front /
// rear), bogies outside the sections (placeBogies), setPantograph and setController.
//
// Section frames (TramSpecs.js): origin on the track centre at rail-head height at the section's front end,
// x right, y up, z backwards. A model supplies its look through `cfg` (body heights, paint bands, windows,
// stripes, roof profile, pantograph) and builds its own cab front, rear end and signs.
import * as THREE from 'three';
import { Parts, M, box, cyl } from '../BusGeom.js';
import { glassMaterial, occludeInterior } from '../Glass.js';
import { LedSign } from '../LedSign.js';
import { makeFloor, drawTramDash } from './TramTextures.js';

export const GAUGE = 1.009;
const UP = new THREE.Vector3(0, 1, 0);

/** Rounded-rectangle path in the (u, v) plane, counter-clockwise. */
export function roundRect(path, u0, v0, u1, v1, r) {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2 - 1e-3, (v1 - v0) / 2 - 1e-3));
  path.moveTo(u0 + r, v0);
  path.lineTo(u1 - r, v0);
  if (r > 0) path.quadraticCurveTo(u1, v0, u1, v0 + r);
  path.lineTo(u1, v1 - r);
  if (r > 0) path.quadraticCurveTo(u1, v1, u1 - r, v1);
  path.lineTo(u0 + r, v1);
  if (r > 0) path.quadraticCurveTo(u0, v1, u0, v1 - r);
  path.lineTo(u0, v0 + r);
  if (r > 0) path.quadraticCurveTo(u0, v0, u0 + r, v0);
  return path;
}

/**
 * Extrudes a (u, v) shape by depth t and maps it with fn(u, v, w) -> [x, y, z]. Returns the outer cap (w = 0),
 * the inner cap (w = t) and the reveals (the side walls of the outline and of every hole) as separate
 * non-indexed geometries. flip: the map mirrors (reverse the winding).
 */
export function extrudeMapped(shape, t, fn, flip = false, curveSegments = 6) {
  const ex = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments });
  const src = ex.index ? ex.toNonIndexed() : ex;
  const P = src.attributes.position.array, UV = src.attributes.uv.array;
  const parts = { outer: [[], []], inner: [[], []], reveal: [[], []] };
  for (let i = 0; i < P.length; i += 9) {
    const ws = [P[i + 2], P[i + 5], P[i + 8]];
    const key = ws.every((w) => w < 1e-5) ? 'outer' : ws.every((w) => w > t - 1e-5) ? 'inner' : 'reveal';
    const [pos, uv] = parts[key];
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      const j = i + k * 3;
      pos.push(...fn(P[j], P[j + 1], P[j + 2]));
      const q = (i / 3 + k) * 2;
      uv.push(UV[q], UV[q + 1]);
    }
  }
  src.dispose();
  const out = {};
  for (const [k, [pos, uv]] of Object.entries(parts)) {
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    out[k] = g;
  }
  return out;
}

/** Flat polygon (u, v) mapped with fn (no thickness). */
export function shapeMapped(shape, fn, flip = false, curveSegments = 6) {
  const sg = new THREE.ShapeGeometry(shape, curveSegments);
  const src = sg.index ? sg.toNonIndexed() : sg;
  const P = src.attributes.position.array, UV = src.attributes.uv.array;
  const pos = [], uv = [];
  for (let i = 0; i < P.length; i += 9) {
    for (const k of flip ? [0, 2, 1] : [0, 1, 2]) {
      const j = i + k * 3;
      pos.push(...fn(P[j], P[j + 1], 0));
      const q = (i / 3 + k) * 2;
      uv.push(UV[q], UV[q + 1]);
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Quad strip swept along z (z0..z1) through a profile [[x, y], ...]; faces wound for the normal e_profile x e_z. */
export function profileStrip(profile, z0, z1, flip = false) {
  const pos = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [ax, ay] = profile[i], [bx, by] = profile[i + 1];
    const A0 = [ax, ay, z0], B0 = [bx, by, z0], A1 = [ax, ay, z1], B1 = [bx, by, z1];
    const tris = [[A0, B0, A1], [B0, B1, A1]];
    for (const t of tris) pos.push(...(flip ? [t[0], t[2], t[1]] : t).flat());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Cylinder mesh stretched between two points (unit cylinder along y, radius in the mesh scale). */
function stretch(mesh, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length() || 1e-3;
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
  mesh.scale.set(r, L, r);
}

/** Intersection of two circles in a plane (2D points), the one on the side of `pick` (+1 / -1). */
function knee(ax, ay, ra, bx, by, rb, pick) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const dd = Math.min(d, ra + rb - 1e-4);
  const a = (ra * ra - rb * rb + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, ra * ra - a * a));
  const mx = ax + (dx * a) / d, my = ay + (dy * a) / d;
  return [mx + (pick * h * -dy) / d, my + (pick * h * dx) / d];
}

export class TramModel {
  /**
   * cfg: {
   *   body: {hw, skirtY, beltY, winBot, winTop, doorBot, doorTop, eaveY, tumble, wall, frontCorner, rearCorner},
   *   sectionBody(sec) -> overrides of body for a section,
   *   bands(sec, side) -> [{y0, y1, mat}] lower body paint bands (skirt .. belt), upperMat,
   *   windows: {[secId]: {left: [[z0, z1, opts]], right: [...]}},
   *   stripes(sec, side) -> [{pts: [[z, y], ...], h, mat}],
   *   roof(sec) -> half profile [[x, y], ...] from the eave to the centre line,
   *   ceilY, floor(sec) -> {y, kind},
   *   panto: {type: 'single' | 'diamond', sec, z, baseY},
   *   colors: {...}
   * }
   */
  constructor(spec, { fleet = null, quality = 'high', interior = true } = {}, cfg = {}) {
    this.spec = spec;
    this.cfg = cfg;
    this.fleet = String(fleet || spec.fleets[0].fleet);
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = `${spec.name} #${this.fleet}`;
    this.sectionIds = spec.sections.map((s) => s.id);
    for (const s of spec.sections) {
      const g = new THREE.Group();
      g.name = `${s.id}Section`;
      this[s.id] = g;
      this.root.add(g);
    }
    if (!this.rear) this.rear = this[this.sectionIds[this.sectionIds.length - 1]];
    this.doorLeaves = {};
    this.doorFolds = {};
    this.wheels = [];
    this.signs = {};
    this.interiorGroups = [];
    this.makeMaterials();
    for (const s of spec.sections) this.buildSection(s);
    this.buildBogies();
    this.buildPantograph();
    this.buildBellows();
    for (const s of spec.sections) for (const d of spec.doors.filter((q) => q.section === s.id)) this.buildDoor(s, d);
    if (interior) for (const s of spec.sections) this.buildInterior(s);
    this.buildCab();
    this.buildSigns();
    occludeInterior(this);
  }

  // ------------------------------------------------------------------ materials
  makeMaterials() {
    const C = this.cfg.colors || {};
    const S = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
    const paint = (c, rough = 0.36) => new P({ color: c, roughness: rough, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.2 });
    const floorTex = makeFloor(C.floorKind || 'ribbed', C.floorCss || '#3a3c3e');
    floorTex.repeat.set(2, 6);
    const lowTex = makeFloor('speckle', C.lowFloorCss || C.floorCss || '#2c3036');
    lowTex.repeat.set(2, 5);
    this.mats = {
      paint: paint(C.paint ?? 0x2f9e46),
      paint2: paint(C.paint2 ?? C.paint ?? 0x2f9e46),
      paint3: paint(C.paint3 ?? 0xe9e8e2),
      stripe: paint(C.stripe ?? 0xf3f3ee, 0.4),
      roof: paint(C.roof ?? C.paint ?? 0x2f9e46, 0.5),
      roofTop: new S({ color: C.roofTop ?? 0x6f7470, roughness: 0.85 }),
      rubber: new S({ color: 0x101112, roughness: 0.75 }),
      black: new S({ color: 0x0d0e0f, roughness: 0.55 }),
      under: new S({ color: 0x1b1d1e, roughness: 0.9 }),
      steel: new S({ color: 0x3a3d3f, roughness: 0.6, metalness: 0.4 }),
      bogie: new S({ color: C.bogie ?? 0x2a2b2c, roughness: 0.75, metalness: 0.2 }),
      rust: new S({ color: 0x5b4636, roughness: 0.9 }),
      wheel: new S({ color: 0x5d5f60, roughness: 0.45, metalness: 0.7 }),
      tread: new S({ color: 0xa9adb0, roughness: 0.25, metalness: 0.9 }),
      spring: new S({ color: 0x8d3a22, roughness: 0.7 }),
      insulator: new S({ color: 0x8a3b22, roughness: 0.4 }),
      panto: new S({ color: C.panto ?? 0x8f9496, roughness: 0.45, metalness: 0.6 }),
      carbon: new S({ color: 0x1a1a1a, roughness: 0.6 }),
      glass: glassMaterial({ transmit: 0.62, side: THREE.DoubleSide }),
      screen: glassMaterial({ transmit: 0.8, color: 0x0d1112, side: THREE.DoubleSide }),
      wall: new S({ color: C.wall ?? 0xd2d4cf, roughness: 0.6 }),
      ceiling: new S({ color: C.ceiling ?? 0xe3e4df, roughness: 0.55 }),
      floor: new S({ color: 0xffffff, map: floorTex, roughness: 0.9 }),
      lowFloor: new S({ color: 0xffffff, map: lowTex, roughness: 0.85 }),
      stepEdge: new S({ color: 0xe0b21a, roughness: 0.5 }),
      seat: new S({ color: C.seat ?? 0x23436e, roughness: 0.6 }),
      seatShell: new S({ color: C.seatShell ?? 0x2c2e31, roughness: 0.45 }),
      fabric: new S({ color: 0xffffff, map: C.fabricTex || null, roughness: 0.95 }),
      pole: new S({ color: C.pole ?? 0xb9bec1, roughness: 0.3, metalness: C.polePaint ? 0.1 : 0.85 }),
      heater: new S({ color: 0x8c9196, roughness: 0.5, metalness: 0.4 }),
      validator: new S({ color: 0x2167c4, roughness: 0.45 }),
      dash: new S({ color: C.dash ?? 0x2b2e31, roughness: 0.75 }),
      desk: new S({ color: C.desk ?? 0x55595c, roughness: 0.7 }),
      bellows: new S({ color: C.bellows ?? 0x272829, roughness: 0.9, side: THREE.DoubleSide }),
      headlamp: new S({ color: 0xe8ecef, roughness: 0.15, metalness: 0.6, emissive: 0xfff4e0, emissiveIntensity: 0 }),
      tail: new S({ color: 0x5a0a0a, emissive: 0xff1a0a, emissiveIntensity: 0.3 }),
      brake: new S({ color: 0x6a0b0b, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, emissive: 0xffffff, emissiveIntensity: 0 }),
      indicatorL: new S({ color: 0xd8780a, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xd8780a, emissive: 0xff8a00, emissiveIntensity: 0 }),
      marker: new S({ color: 0xf2f2ea, emissive: 0xfff6e2, emissiveIntensity: 0 }),
      lightStrip: new S({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1 }),
      stopBtn: new S({ color: 0xe05a10, emissive: 0xff6a10, emissiveIntensity: 0 }),
      decal: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    };
    for (const k of ['lightStrip', 'stopBtn', 'marker']) this.mats[k].userData.noOcclusion = true;
    Object.assign(this.mats, this.extraMaterials ? this.extraMaterials() : {});
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
  }

  // ------------------------------------------------------------------ body
  body(sec) {
    return { ...this.cfg.body, ...(this.cfg.sectionBody ? this.cfg.sectionBody(sec) : {}) };
  }

  /** x of the side surface at height y (vertical below the belt, the window band leans in by `tumble`). */
  sideX(B, y) {
    return y <= B.beltY ? B.hw : B.hw - (y - B.beltY) * Math.tan(B.tumble || 0);
  }

  buildSection(sec) {
    const p = new Parts();
    const B = this.body(sec);
    for (const side of [-1, 1]) this.sideWall(p, sec, side, B);
    this.roof(p, sec, B);
    const i = this.spec.sections.indexOf(sec), n = this.spec.sections.length;
    if (i === 0) this.buildFront(p, sec, B);
    else this.jointEnd(p, sec, B, 0);
    if (i === n - 1) this.buildRearEnd(p, sec, B);
    else this.jointEnd(p, sec, B, sec.length);
    this.underframe(p, sec, B);
    if (this.decorate) this.decorate(p, sec, B);
    const g = p.build(this.mats);
    g.name = `${sec.id}Body`;
    this[sec.id].add(g);
  }

  /** Where the straight side wall of a section starts and ends (the cab and the rear end have round corners). */
  sideSpan(sec, B) {
    const i = this.spec.sections.indexOf(sec), n = this.spec.sections.length;
    return [i === 0 ? B.frontCorner || 0 : 0, i === n - 1 ? sec.length - (B.rearCorner || 0) : sec.length];
  }

  /**
   * Side wall: the lower panels in their paint bands and the window band (with the window openings, black
   * gaskets and glass), split at the door openings; above each door the band continues.
   */
  sideWall(p, sec, side, B) {
    const [za, zb] = this.sideSpan(sec, B);
    const t = B.wall;
    const doors = side > 0 ? this.spec.doors.filter((d) => d.section === sec.id) : [];
    const wins = ((this.cfg.windows || {})[sec.id] || {})[side > 0 ? 'right' : 'left'] || [];
    const cuts = doors.map((d) => [d.z0 - 0.04, d.z1 + 0.04]).sort((a, b) => a[0] - b[0]);
    const spans = [];
    let z = za;
    for (const [c0, c1] of cuts) {
      if (c0 > z + 0.01) spans.push([z, c0]);
      z = Math.max(z, c1);
    }
    if (zb > z + 0.01) spans.push([z, zb]);
    const flip = side < 0;
    const lowMap = (u, v, w) => [side * (B.hw - w), v, u];
    const upMap = (u, v, w) => [side * (this.sideX(B, v) - w), v, u];
    const bands = this.cfg.bands ? this.cfg.bands(sec, side, B) : [{ y0: B.skirtY, y1: B.beltY, mat: 'paint' }];
    const upMat = this.cfg.upperMat ? this.cfg.upperMat(sec, side) : 'paint';
    const addParts = (o, outerMat) => {
      if (o.outer) p.add(outerMat, o.outer);
      if (o.inner) p.add('wall', o.inner);
      if (o.reveal) p.add(outerMat, o.reveal);
    };
    for (const [a, b] of spans) {
      for (const bd of bands) {
        const sh = roundRect(new THREE.Shape(), a, bd.y0, b, bd.y1, 0);
        addParts(extrudeMapped(sh, t, lowMap, flip), bd.mat);
      }
      // window band from the belt to the eave with this span's windows cut out
      const sh = roundRect(new THREE.Shape(), a, B.beltY, b, B.eaveY, 0);
      for (const [w0, w1, o = {}] of wins) {
        if (w0 < a - 1e-3 || w1 > b + 1e-3) continue;
        const bot = o.bot ?? B.winBot, top = o.top ?? B.winTop, r = o.r ?? 0.1;
        sh.holes.push(roundRect(new THREE.Path(), w0, bot, w1, top, r));
        this.windowPane(p, side, B, w0, bot, w1, top, r, o);
      }
      const o = extrudeMapped(sh, t, upMap, flip);
      if (o.outer) p.add(upMat, o.outer);
      if (o.inner) p.add('wall', o.inner);
      if (o.reveal) p.add('rubber', o.reveal);
    }
    // above the door openings
    for (const d of doors) {
      const sh = roundRect(new THREE.Shape(), d.z0 - 0.04, B.doorTop, d.z1 + 0.04, B.eaveY, 0);
      const o = extrudeMapped(sh, t, upMap, flip);
      if (o.outer) p.add(upMat, o.outer);
      if (o.inner) p.add('wall', o.inner);
      if (o.reveal) p.add('rubber', o.reveal);
      // door portal frame (black seal round the opening)
      const x = side * (B.hw + 0.004);
      p.add('rubber', box(0.02, B.doorTop - B.doorBot, 0.035), M(x, (B.doorTop + B.doorBot) / 2, d.z0 - 0.02));
      p.add('rubber', box(0.02, B.doorTop - B.doorBot, 0.035), M(x, (B.doorTop + B.doorBot) / 2, d.z1 + 0.02));
      p.add('rubber', box(0.02, 0.035, d.z1 - d.z0 + 0.08), M(side * (this.sideX(B, B.doorTop) + 0.004), B.doorTop + 0.015, (d.z0 + d.z1) / 2));
      // threshold / lowest step with the yellow edge
      p.add('stepEdge', box(0.06, 0.03, d.z1 - d.z0), M(side * (B.hw - 0.02), B.doorBot + 0.015, (d.z0 + d.z1) / 2));
      p.add('under', box(0.5, 0.04, d.z1 - d.z0), M(side * (B.hw - 0.26), B.doorBot - 0.02, (d.z0 + d.z1) / 2));
    }
    // stripes (Schindler white belt line, T6M none)
    for (const st of this.cfg.stripes ? this.cfg.stripes(sec, side, B) : []) this.stripe(p, side, B, st, doors);
  }

  /** Glass, black surround and (optional) top-hung hopper of one window. */
  windowPane(p, side, B, w0, bot, w1, top, r, o = {}) {
    const flip = side < 0;
    const t = B.wall;
    const inset = o.flush ? 0.008 : t * 0.45;
    const map = (u, v) => [side * (this.sideX(B, v) - inset), v, u];
    p.add(o.glass || 'glass', shapeMapped(roundRect(new THREE.Shape(), w0, bot, w1, top, r), map, flip));
    // black surround proud of the paint
    const ring = roundRect(new THREE.Shape(), w0 - 0.03, bot - 0.03, w1 + 0.03, top + 0.03, r + 0.03);
    ring.holes.push(roundRect(new THREE.Path(), w0, bot, w1, top, r));
    const ringMap = (u, v, w) => [side * (this.sideX(B, v) + 0.006 - w), v, u];
    const rg = extrudeMapped(ring, 0.012, ringMap, flip);
    for (const g of Object.values(rg)) p.add('rubber', g);
    if (o.hopper) {
      const y = top - o.hopper;
      const x = side * (this.sideX(B, y) - inset + 0.012);
      p.add('rubber', box(0.03, 0.045, w1 - w0), M(x, y, (w0 + w1) / 2));
    }
    if (o.mullion) for (const zm of [].concat(o.mullion)) {
      const x = side * (this.sideX(B, (bot + top) / 2) - inset + 0.012);
      p.add('rubber', box(0.03, top - bot, 0.05), M(x, (bot + top) / 2, zm));
    }
  }

  /** A painted stripe following [[z, y], ...] on the lower panel (interrupted by the doors). */
  stripe(p, side, B, st, doors) {
    const h = st.h || 0.05;
    const pts = st.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
      const L = Math.hypot(z1 - z0, y1 - y0);
      const n = Math.max(1, Math.ceil(L / 0.25));
      for (let k = 0; k < n; k++) {
        const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
        const zc = (za + zb) / 2, yc = y0 + ((y1 - y0) * (k + 0.5)) / n;
        if (doors.some((d) => zc > d.z0 - 0.05 && zc < d.z1 + 0.05 && yc < B.doorTop)) continue;
        const ang = Math.atan2(y1 - y0, z1 - z0);
        const len = Math.hypot(zb - za, ((y1 - y0) * 1) / n) + 0.004;
        const m = new THREE.Matrix4().makeRotationX(-ang).setPosition(side * (this.sideX(B, yc) + 0.003), yc, zc);
        p.add(st.mat || 'stripe', box(0.006, h, len), m);
      }
    }
  }

  /** Roof: the eave rounding, fairings and roof top from the model's profile, mirrored; the saloon ceiling. */
  roof(p, sec, B) {
    const prof = this.cfg.roof(sec, B);
    const [za, zb] = this.sideSpan(sec, B);
    // the roof cross-section closed where the roof stops at a rounded end (the model covers the corner)
    const i = this.spec.sections.indexOf(sec), n = this.spec.sections.length;
    const capAt = (z, front) => {
      const sh = new THREE.Shape();
      const full = prof.concat(prof.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
      sh.moveTo(full[0][0], full[0][1]);
      for (let k = 1; k < full.length; k++) sh.lineTo(full[k][0], full[k][1]);
      sh.closePath();
      const o = extrudeMapped(sh, 0.03, front ? (u, v, w) => [u, v, z + w] : (u, v, w) => [u, v, z - w], !front);
      for (const g of Object.values(o)) p.add(this.cfg.roofMat || 'roof', g);
    };
    if (i === 0 && za > 0) capAt(za, true);
    if (i === n - 1 && zb < sec.length) capAt(zb, false);
    const right = prof, left = prof.map(([x, y]) => [-x, y]);
    // right half: profile from the eave inwards (normal outward-up with e_profile x e_z)
    p.add(this.cfg.roofMat || 'roof', profileStrip(right, za, zb));
    p.add(this.cfg.roofMat || 'roof', profileStrip(left, za, zb, true));
    // ceiling inside: coved from the window tops up to a flat middle, one strip across (faces down)
    const xi = this.sideX(B, B.winTop) - B.wall - 0.01, cy = this.cfg.ceilY ?? B.eaveY - 0.12;
    const half = [[xi, B.winTop + 0.04], [xi - 0.06, cy - 0.16], [xi - 0.2, cy - 0.04], [xi - 0.42, cy]];
    const ceil = half.concat(half.slice().reverse().map(([x, y]) => [-x, y]));
    p.add('ceiling', profileStrip(ceil, za + 0.02, zb - 0.02, true));
  }

  /** End wall at a joint (z = 0 or z = length) with the gangway opening. */
  jointEnd(p, sec, B, zEnd) {
    const sh = new THREE.Shape();
    const prof = this.cfg.roof(sec, B);
    const right = [[B.hw, B.skirtY], [B.hw, B.beltY], ...prof];
    const full = right.concat(right.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    sh.moveTo(full[0][0], full[0][1]);
    for (let i = 1; i < full.length; i++) sh.lineTo(full[i][0], full[i][1]);
    sh.closePath();
    const fy = this.floorY(sec, zEnd);
    const gw = this.cfg.gangway || { w: 1.3, h: 2.05 };
    sh.holes.push(roundRect(new THREE.Path(), -gw.w / 2, fy, gw.w / 2, fy + gw.h, 0.18));
    const atRear = zEnd > 0;
    const t = 0.06;
    const map = atRear ? (u, v, w) => [u, v, zEnd - w] : (u, v, w) => [u, v, zEnd + w];
    const o = extrudeMapped(sh, t, map, atRear);
    if (o.outer) p.add(this.cfg.jointMat || 'paint', o.outer);
    if (o.inner) p.add('wall', o.inner);
    if (o.reveal) p.add('wall', o.reveal);
  }

  /** Floor height of a section at z (high floor, low-floor module with steps at its ends). */
  floorY(sec, z) {
    return this.spec.layout.aisleFloorY(sec.id, z);
  }

  /** Body underside: belly pan, side valance below the skirt, equipment boxes between the bogies. */
  underframe(p, sec, B) {
    const L = sec.length;
    p.add('under', box(B.hw * 2 - 0.08, 0.04, L - 0.1), M(0, B.skirtY + 0.03, L / 2));
    const boxes = this.cfg.underBoxes ? this.cfg.underBoxes(sec, B) : [];
    for (const [z0, z1, h, w = 1.6] of boxes) p.add('under', box(w, h, z1 - z0), M(0, B.skirtY - h / 2 + 0.01, (z0 + z1) / 2));
  }

  // ------------------------------------------------------------------ doors
  /** Folding door: each leaf two panels, hinged at the jamb, the free edge running in the guide at the door line. */
  buildDoor(sec, d) {
    const B = this.body(sec);
    const leaves = d.leaves || 2;
    const W = (d.z1 - d.z0) / leaves;
    const group = this[sec.id];
    const folds = [];
    for (let k = 0; k < leaves; k++) {
      // hinge at the jamb: leaf 0 at z0 opening towards +z; leaf 1 at z1 towards -z
      const e = leaves === 1 ? 1 : k === 0 ? 1 : -1;
      const hingeZ = e > 0 ? d.z0 : d.z1;
      const a = new THREE.Group();
      a.position.set(B.hw - 0.035, 0, hingeZ);
      const b = new THREE.Group();
      b.position.set(0, 0, (e * W) / 2);
      a.add(this.doorPanel(B, W / 2, e, 0), b);
      b.add(this.doorPanel(B, W / 2, e, 1));
      group.add(a);
      folds.push({ a, b, e });
    }
    this.doorFolds[d.id] = folds;
    this.doorLeaves[d.id] = folds.map((f) => ({ pivot: f.a, end: f.e }));
  }

  /** One panel of a folding leaf: painted frame with a tall window (the photos), local z from 0 to e*w. */
  doorPanel(B, w, e, which) {
    const p = new Parts();
    const y0 = B.doorBot + 0.04, y1 = B.doorTop - 0.03;
    const frameMat = this.cfg.doorMat || 'paint';
    const sh = roundRect(new THREE.Shape(), 0.025, y0, w - 0.025, y1, 0.02);
    const wb = this.cfg.doorWindow ? this.cfg.doorWindow(B, which) : { bot: B.beltY - 0.25, top: B.doorTop - 0.18, r: 0.08 };
    sh.holes.push(roundRect(new THREE.Path(), 0.07, wb.bot, w - 0.07, wb.top, wb.r));
    if (wb.bot2 != null) sh.holes.push(roundRect(new THREE.Path(), 0.07, wb.bot2, w - 0.07, wb.top2, wb.r));
    const map = (u, v, wv) => [0.015 - wv, v, e > 0 ? u : -u];
    const o = extrudeMapped(sh, 0.03, map, e < 0);
    if (o.outer) p.add(frameMat, o.outer);
    if (o.inner) p.add(this.cfg.doorInner || 'wall', o.inner);
    if (o.reveal) p.add('rubber', o.reveal);
    const gmap = (u, v) => [0, v, e > 0 ? u : -u];
    p.add('glass', shapeMapped(roundRect(new THREE.Shape(), 0.07, wb.bot, w - 0.07, wb.top, wb.r), gmap, e < 0));
    if (wb.bot2 != null) p.add('glass', shapeMapped(roundRect(new THREE.Shape(), 0.07, wb.bot2, w - 0.07, wb.top2, wb.r), gmap, e < 0));
    // rubber edge seal on the free edge, grab handle inside
    p.add('rubber', box(0.05, y1 - y0, 0.03), M(0, (y0 + y1) / 2, e * (w - 0.012)));
    if (which === 1) p.add('pole', cyl(0.014, 0.9, 8), M(-0.06, 1.25, e * (w - 0.12)));
    return p.build(this.mats, { castShadow: false });
  }

  setDoor(id, openness) {
    const folds = this.doorFolds[id];
    if (!folds) return;
    const s = openness < 0.5 ? 2 * openness * openness : 1 - Math.pow(-2 * openness + 2, 2) / 2;
    const th = s * 1.38; // the panels fold to ~80 degrees
    for (const f of folds) {
      f.a.rotation.y = -f.e * th;
      f.b.rotation.y = f.e * 2 * th;
    }
  }

  // ------------------------------------------------------------------ running gear
  /** One group per bogie (outside the body sections, posed from the track every frame). */
  buildBogies() {
    const seen = new Map();
    for (const s of this.spec.sections) for (const q of s.supports) if (q.kind === 'bogie' && !seen.has(q.d)) seen.set(q.d, q);
    this.bogies = [];
    const wb = this.spec.bogies.wheelbase, R = this.spec.bogies.wheelR;
    for (const q of seen.values()) {
      const g = new THREE.Group();
      g.name = `bogie@${q.d}`;
      const p = new Parts();
      const fx = GAUGE / 2 + 0.2; // outside frames
      const fl = wb + 0.95;
      for (const sx of [-1, 1]) {
        // side frame: deep in the middle, swept up over the axle boxes
        p.add('bogie', box(0.12, 0.2, fl * 0.5), M(sx * fx, R + 0.02, 0));
        for (const sz of [-1, 1]) {
          p.add('bogie', box(0.12, 0.14, fl * 0.3), M(sx * fx, R + 0.16, sz * (wb / 2 + 0.05)));
          p.add('bogie', box(0.12, 0.12, 0.3), M(sx * fx, R + 0.08, sz * (wb / 4 + 0.05)));
          // axle box with the primary rubber springs
          p.add('steel', box(0.18, 0.22, 0.28), M(sx * (fx - 0.02), R, sz * wb / 2));
          p.add('black', cyl(0.06, 0.1, 10), M(sx * (fx - 0.02), R + 0.17, sz * (wb / 2 - 0.09)));
          p.add('black', cyl(0.06, 0.1, 10), M(sx * (fx - 0.02), R + 0.17, sz * (wb / 2 + 0.09)));
        }
        // secondary suspension: coil springs on the frame centre
        for (const sz of [-0.18, 0.18]) p.add('spring', cyl(0.085, 0.2, 12), M(sx * (fx - 0.02), R + 0.22, sz));
        // magnetic track brake shoe over the rail
        p.add('black', box(0.09, 0.08, wb - 0.62), M(sx * (GAUGE / 2 + 0.025), 0.085, 0));
        p.add('steel', box(0.03, 0.18, 0.06), M(sx * (GAUGE / 2 + 0.025), 0.2, -wb / 2 + 0.42));
        p.add('steel', box(0.03, 0.18, 0.06), M(sx * (GAUGE / 2 + 0.025), 0.2, wb / 2 - 0.42));
        // sand pipe at the leading wheel
        p.add('black', cyl(0.015, 0.35, 6), M(sx * (GAUGE / 2 + 0.06), 0.22, -wb / 2 - R - 0.05));
      }
      // transom and bolster
      p.add('bogie', box(fx * 2, 0.16, 0.36), M(0, R + 0.06, 0));
      p.add('bogie', box(1.3, 0.1, 0.5), M(0, R + 0.25, 0));
      if (q.powered) {
        // traction motors across the bogie with their gearboxes on the axles
        for (const sz of [-1, 1]) {
          const m = cyl(0.19, 0.62, 16);
          m.rotateZ(Math.PI / 2);
          p.add('steel', m, M(-0.05, R + 0.02, sz * (wb / 2 - 0.42)));
          p.add('steel', box(0.22, 0.34, 0.42), M(0.36, R, sz * (wb / 2 - 0.12)));
        }
      }
      g.add(p.build(this.mats));
      const sets = [];
      for (const sz of [-1, 1]) {
        const spin = new THREE.Group();
        spin.position.set(0, R, sz * wb / 2);
        const wp = new Parts();
        for (const sx of [-1, 1]) {
          const wx = sx * (GAUGE / 2 + 0.03);
          const tyre = cyl(R, 0.1, 24);
          tyre.rotateZ(Math.PI / 2);
          wp.add('tread', tyre, M(wx + sx * 0.005, 0, 0));
          const fl2 = cyl(R + 0.022, 0.022, 24);
          fl2.rotateZ(Math.PI / 2);
          wp.add('wheel', fl2, M(wx - sx * 0.05, 0, 0));
          const disc = cyl(R * 0.72, 0.106, 18);
          disc.rotateZ(Math.PI / 2);
          wp.add('wheel', disc, M(wx + sx * 0.006, 0, 0));
          // spokes / bolts so the rotation reads
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            wp.add('black', box(0.012, 0.04, 0.04), M(wx + sx * 0.06, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5));
          }
        }
        const ax = cyl(0.065, GAUGE + 0.1, 12);
        ax.rotateZ(Math.PI / 2);
        wp.add('steel', ax);
        spin.add(wp.build(this.mats));
        g.add(spin);
        sets.push(spin);
      }
      this.root.add(g);
      this.bogies.push({ d: q.d, group: g, sets });
    }
  }

  /** Bogie poses from the entity: [{d, x, y, z, yaw, pitch}] in the order of this.bogies (matched by d). */
  placeBogiePoses(list) {
    for (const b of this.bogies) {
      const q = list.find((x) => Math.abs(x.d - b.d) < 1e-6);
      if (!q) continue;
      b.group.position.set(q.x, q.y, q.z);
      b.group.rotation.set(q.pitch, q.yaw, 0, 'YXZ');
    }
  }

  spin(distFront) {
    const a = -distFront / this.spec.bogies.wheelR;
    for (const b of this.bogies || []) for (const s of b.sets) s.rotation.x = a;
  }

  // ------------------------------------------------------------------ pantograph
  buildPantograph() {
    const P = this.cfg.panto;
    if (!P) return;
    const sec = this[P.sec];
    const g = new THREE.Group();
    g.position.set(0, P.baseY, P.z);
    sec.add(g);
    const p = new Parts();
    // base frame on four insulators
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('insulator', cyl(0.05, 0.16, 10), M(sx * 0.42, 0.08, sz * 0.45));
    p.add('panto', box(0.92, 0.05, 1.05), M(0, 0.18, 0));
    p.add('panto', box(0.08, 0.08, 1.05), M(-0.44, 0.22, 0));
    p.add('panto', box(0.08, 0.08, 1.05), M(0.44, 0.22, 0));
    // lowering springs / damper box
    p.add('steel', box(0.36, 0.12, 0.28), M(0, 0.26, P.type === 'single' ? 0.3 : 0));
    g.add(p.build(this.mats));
    const tube = () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), this.mats.panto);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const head = new THREE.Group();
    const hp = new Parts();
    // collector head: two pan bars with carbon strips and the horns, on a small frame
    for (const sz of [-0.13, 0.13]) {
      hp.add('panto', box(1.05, 0.035, 0.05), M(0, 0.02, sz));
      hp.add('carbon', box(0.95, 0.02, 0.035), M(0, 0.045, sz));
      for (const sx of [-1, 1]) {
        const horn = cyl(0.014, 0.32, 6);
        horn.rotateZ(sx * 1.05);
        hp.add('panto', horn, M(sx * 0.66, -0.06, sz));
      }
    }
    hp.add('panto', box(0.08, 0.05, 0.32), M(-0.3, -0.02, 0));
    hp.add('panto', box(0.08, 0.05, 0.32), M(0.3, -0.02, 0));
    head.add(hp.build(this.mats));
    g.add(head);
    this.panto = { P, g, head, tubes: Array.from({ length: P.type === 'single' ? 5 : 8 }, tube), h: -1 };
    this.setPantograph(1, 5.6);
  }

  /** k: 0 lowered .. 1 on the wire; wireH: contact wire above the rail head (section frame y). */
  setPantograph(k, wireH = 5.6) {
    const T = this.panto;
    if (!T) return;
    const P = T.P;
    const low = 0.3, high = wireH - P.baseY - 0.05;
    const H = low + (high - low) * Math.max(0, Math.min(1, k));
    if (Math.abs(H - T.h) < 1e-4) return;
    T.h = H;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    if (P.type === 'single') {
      // pivot at the rear of the base, knee forwards; lower arm a, upper arm b; the head stays above zh
      const a = P.a || 1.35, b = P.b || 1.55, py = 0.26, pz = 0.38, zh = P.headZ ?? -0.25;
      const [kz, ky] = knee(pz, py, a, zh, H, b, 1);
      const piv = v(0, py, pz), kn = v(0, ky, kz), hd = v(0, H, zh);
      stretch(T.tubes[0], piv, kn, 0.032);
      stretch(T.tubes[1], v(-0.07, py, pz), v(-0.02, ky, kz), 0.018);
      stretch(T.tubes[2], v(-0.03, ky, kz), v(-0.3, H - 0.04, zh), 0.022);
      stretch(T.tubes[3], v(0.03, ky, kz), v(0.3, H - 0.04, zh), 0.022);
      // the guide rod from the base to the head frame (keeps the head level)
      stretch(T.tubes[4], v(0, py + 0.04, pz - 0.22), v(0, H - 0.08, zh + 0.05), 0.008);
    } else {
      // diamond: lower arms from the base pivots out to the knees, upper arms in to the head
      const a = P.a || 1.1, b = P.b || 1.15, py = 0.24, pz = 0.42;
      let i = 0;
      for (const sx of [-0.36, 0.36]) {
        for (const sz of [-1, 1]) {
          const [kz, ky] = knee(sz * pz, py, a, 0, H, b, sz > 0 ? -1 : 1);
          stretch(T.tubes[i++], v(sx, py, sz * pz), v(sx * 0.8, ky, kz), 0.022);
          stretch(T.tubes[i++], v(sx * 0.8, ky, kz), v(sx * 0.6, H - 0.03, 0), 0.02);
        }
      }
    }
    T.head.position.set(0, H, P.type === 'single' ? P.headZ ?? -0.25 : 0);
  }

  // ------------------------------------------------------------------ bellows
  /** Concertina bellows between consecutive sections; their rings follow the two end walls (afterPose). */
  buildBellows() {
    this.bellows = [];
    const secs = this.spec.sections;
    for (let i = 0; i + 1 < secs.length; i++) {
      const A = secs[i], Bs = secs[i + 1];
      const BA = this.body(A);
      const fy = Math.min(this.floorY(A, A.length), this.floorY(Bs, 0)) - 0.12;
      const top = BA.eaveY + 0.05, hw = BA.hw - 0.07, r = 0.2;
      // ring: rounded rectangle, 36 points
      const ring = [];
      const corner = (cx, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      corner(hw - r, fy + r, -Math.PI / 2);
      corner(hw - r, top - r, 0);
      corner(-hw + r, top - r, Math.PI / 2);
      corner(-hw + r, fy + r, Math.PI);
      const n = ring.length, folds = 9;
      const rows = folds * 2 + 1;
      const pos = new Float32Array(rows * n * 3);
      const idx = [];
      for (let j = 0; j + 1 < rows; j++) for (let k = 0; k < n; k++) {
        const a = j * n + k, b = j * n + ((k + 1) % n), c = (j + 1) * n + k, d = (j + 1) * n + ((k + 1) % n);
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.mats.bellows);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.root.add(mesh);
      // gangway floor plates (turntable halves) in each section
      const plate = (sec, z, sgn) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), this.mats.steel);
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, this.floorY(sec, z) + 0.004, z);
        this[sec.id].add(m);
      };
      plate(A, A.length, 1);
      plate(Bs, 0, -1);
      this.bellows.push({ A, B: Bs, ring, mesh, rows, n });
    }
  }

  updateBellows() {
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    for (const bw of this.bellows || []) {
      const ga = this[bw.A.id], gb = this[bw.B.id];
      const pos = bw.mesh.geometry.attributes.position.array;
      const zA = bw.A.length + 0.02, zB = -0.02;
      for (let k = 0; k < bw.n; k++) {
        const [x, y] = bw.ring[k];
        va.set(x, y, zA).applyMatrix4(ga.matrixWorld);
        vb.set(x, y, zB).applyMatrix4(gb.matrixWorld);
        for (let j = 0; j < bw.rows; j++) {
          const t = j / (bw.rows - 1);
          // the pleats: every other ring 4 cm inside (towards the centre of the ring)
          const inset = j % 2 ? 0.04 : 0;
          const cx = 0, cy = (bw.ring[0][1] + bw.ring[Math.floor(bw.n / 2)][1]) / 2;
          const sx = x - cx, sy = y - cy, sl = Math.hypot(sx, sy) || 1;
          const px = va.x + (vb.x - va.x) * t, py = va.y + (vb.y - va.y) * t, pz = va.z + (vb.z - va.z) * t;
          // inset in the plane of the ring (approximately: world y and the horizontal normal of the ring)
          const hx = vb.x - va.x, hz = vb.z - va.z, hl = Math.hypot(hx, hz) || 1;
          const nx = -hz / hl, nz = hx / hl; // horizontal, across the joint (the sections' -x)
          const o = (j * bw.n + k) * 3;
          pos[o] = px + nx * (sx / sl) * inset;
          pos[o + 1] = py - (sy / sl) * inset;
          pos[o + 2] = pz + nz * (sx / sl) * inset;
        }
      }
      bw.mesh.geometry.attributes.position.needsUpdate = true;
      bw.mesh.geometry.computeVertexNormals();
    }
  }

  // ------------------------------------------------------------------ saloon
  buildInterior(sec) {
    const p = new Parts();
    const B = this.body(sec);
    const L = sec.length;
    const lay = this.spec.layout;
    const xi = B.hw - B.wall - 0.01;
    const zs = sec === this.spec.sections[0] ? (this.cfg.cab || {}).wallZ ?? 2.1 : 0.02;
    const ze = L - 0.02;
    // floor: piecewise from the floor profile (steps at the ends of a low-floor module)
    const steps = this.floorSteps(sec);
    for (const s of steps) {
      p.add(sec.lowFloor && s.y < 0.6 ? 'lowFloor' : 'floor', box(xi * 2, 0.04, s.z1 - s.z0), M(0, s.y - 0.02, (s.z0 + s.z1) / 2));
      if (s.riser) p.add('wall', box(xi * 2, s.riser.h, 0.03), M(0, s.riser.y, s.riser.z));
      if (s.riser) p.add('stepEdge', box(xi * 2, 0.02, 0.04), M(0, s.riser.y + s.riser.h / 2, s.riser.z + s.riser.dz));
    }
    // step wells at the doors of a high floor
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) {
      const fy = this.floorY(sec, (d.z0 + d.z1) / 2);
      const drop = fy - B.doorBot;
      if (drop < 0.12) continue;
      const n = Math.max(1, Math.round(drop / 0.22));
      const depth = 0.3;
      for (let k = 0; k < n; k++) {
        const y = B.doorBot + (drop * k) / n;
        const x0 = xi - depth * (n - k);
        p.add('floor', box(xi - x0, 0.03, d.z1 - d.z0), M((xi + x0) / 2, y + 0.015, (d.z0 + d.z1) / 2));
        p.add('stepEdge', box(0.04, 0.02, d.z1 - d.z0), M(x0 + 0.02, y + 0.035, (d.z0 + d.z1) / 2));
        p.add('wall', box(0.02, drop / n, d.z1 - d.z0), M(x0, y + drop / n / 2 + 0.015, (d.z0 + d.z1) / 2));
      }
      // the well side walls and the handrails at the doors
      p.add('wall', box(depth * n, drop, 0.03), M(xi - (depth * n) / 2, B.doorBot + drop / 2, d.z0 - 0.02));
      p.add('wall', box(depth * n, drop, 0.03), M(xi - (depth * n) / 2, B.doorBot + drop / 2, d.z1 + 0.02));
      for (const zz of [d.z0 - 0.08, d.z1 + 0.08]) p.add('pole', cyl(0.017, B.doorTop - B.doorBot - 0.1, 8), M(xi - 0.05, (B.doorTop + B.doorBot) / 2, zz));
    }
    // seats from the seat map
    for (const st of lay.seats.filter((q) => q.sec === sec.id)) this.seat(p, st);
    // poles: by the seat rows on the aisle side and in the door areas, ceiling rails along both sides
    const ceil = (this.cfg.ceilY ?? B.eaveY - 0.12) - 0.02;
    for (const z of this.poleZs(sec)) {
      const fy = this.floorY(sec, z[0]);
      p.add('pole', cyl(0.019, ceil - fy, 8), M(z[1], (ceil + fy) / 2, z[0]));
      if (z[2]) {
        p.add('stopBtn', box(0.05, 0.08, 0.05), M(z[1], fy + 1.1, z[0] + 0.025));
      }
      if (z[3]) p.add('validator', box(0.17, 0.26, 0.12), M(z[1] + 0.12 * Math.sign(z[1] || 1), fy + 1.2, z[0]));
    }
    for (const sx of [-1, 1]) {
      p.add('pole', cyl(0.016, ze - zs - 0.3, 8).rotateX(Math.PI / 2), M(sx * (xi - 0.38), ceil - 0.28, (zs + ze) / 2));
      // ceiling light strips and air ducts
      p.add('lightStrip', box(0.14, 0.015, ze - zs - 0.6), M(sx * (xi - 0.32), ceil - 0.005, (zs + ze) / 2));
      p.add('ceiling', box(0.3, 0.06, ze - zs - 0.2), M(sx * (xi - 0.6), ceil - 0.03, (zs + ze) / 2));
    }
    // heaters along the walls under the seats (T6M round fan heaters, Schindler wall heaters)
    if (this.cfg.heaters) this.cfg.heaters(p, sec, B, this);
    if (this.cfg.interiorExtra) this.cfg.interiorExtra(p, sec, B, this);
    const g = p.build(this.mats, { castShadow: false });
    g.name = `${sec.id}Interior`;
    this[sec.id].add(g);
    this.interiorGroups.push(g);
  }

  /** Floor pieces of a section: [{z0, z1, y, riser}] from layout.aisleFloorY sampled every 5 cm. */
  floorSteps(sec) {
    const L = sec.length;
    const zs = sec === this.spec.sections[0] ? (this.cfg.cab || {}).wallZ ?? 2.1 : 0;
    const out = [];
    let z0 = zs, y0 = this.floorY(sec, zs);
    for (let z = zs + 0.05; z <= L + 1e-6; z += 0.05) {
      const y = this.floorY(sec, Math.min(z, L - 1e-4));
      if (Math.abs(y - y0) > 0.01 || z >= L - 1e-6) {
        const zEnd = z >= L - 1e-6 ? L : z;
        const piece = { z0, z1: zEnd, y: y0 };
        if (Math.abs(y - y0) > 0.01) {
          const lo = Math.min(y, y0), hi = Math.max(y, y0);
          piece.riser = { y: (lo + hi) / 2, h: hi - lo, z: zEnd, dz: y > y0 ? 0.0 : -0.0 };
        }
        out.push(piece);
        z0 = zEnd;
        y0 = y;
      }
    }
    return out;
  }

  /** Poles of a section: [[z, x, stopButton, validator]] (the model may override). */
  poleZs(sec) {
    if (this.cfg.poles) return this.cfg.poles(sec, this);
    const out = [];
    for (let z = (sec === this.spec.sections[0] ? 2.6 : 0.8); z < sec.length - 0.6; z += 1.7) out.push([z, -0.1, true, false]);
    return out;
  }

  /** One seat of the seat map: shell, cushion and back (moquette or plastic), frame, grab handle. */
  seat(p, st) {
    const fy = st.fy, k = Math.cos(st.yaw || 0) >= 0 ? 1 : -1; // k: facing forward (back towards +z)
    const plastic = this.cfg.plasticSeats;
    const cush = plastic ? 'seatShell' : 'seat';
    const back = plastic ? 'seatShell' : this.mats.fabric.map ? 'fabric' : 'seat';
    const w = 0.44;
    p.add(cush, box(w, 0.07, 0.43, 0.025), M(st.x, fy + 0.44, st.z - k * 0.02));
    const bk = box(w, 0.6, 0.06, 0.025);
    bk.rotateX(k * 0.18);
    p.add(back, bk, M(st.x, fy + 0.78, st.z + k * 0.24));
    if (!plastic) p.add('seatShell', box(w + 0.02, 0.6, 0.02), M(st.x, fy + 0.78, st.z + k * 0.285).multiply(new THREE.Matrix4().makeRotationX(k * 0.18)));
    // pedestal / cantilever frame to the wall
    p.add('steel', box(0.06, 0.38, 0.06), M(st.x, fy + 0.2, st.z));
    p.add('steel', box(0.3, 0.04, 0.04), M(st.x, fy + 0.05, st.z));
    // grab handle on top of the back (photo 3) on the aisle side
    const ax = st.x + (st.x < 0 ? 0.16 : -0.16);
    p.add('pole', box(0.03, 0.12, 0.03), M(ax, fy + 1.12, st.z + k * 0.3));
  }

  // ------------------------------------------------------------------ cab
  buildCab() {
    const sec = this.spec.sections[0];
    const g = this[sec.id];
    const p = new Parts();
    const C = this.cfg.cab || {};
    const fy = C.floorY ?? this.floorY(sec, 1);
    const B = this.body(sec);
    const xi = B.hw - B.wall - 0.01;
    // floor and back wall with the cab door (glazed top)
    p.add('floor', box(xi * 2, 0.04, (C.wallZ ?? 2.1) - 0.1), M(0, fy - 0.02, ((C.wallZ ?? 2.1) + 0.1) / 2));
    const wz = C.wallZ ?? 2.1;
    p.add('wall', box(xi * 2 - 0.8, (B.eaveY - 0.12) - fy, 0.04), M(-0.4, ((B.eaveY - 0.12) + fy) / 2, wz));
    p.add('wall', box(0.8, 0.9, 0.04), M(xi - 0.4, fy + 0.45, wz));
    p.add('glass', box(0.7, 0.85, 0.01), M(xi - 0.42, fy + 1.4, wz));
    p.add('wall', box(0.8, (B.eaveY - 0.12) - fy - 1.85, 0.04), M(xi - 0.4, ((B.eaveY - 0.12) + fy + 1.85) / 2, wz));
    // desk across the front with the instrument panel, controller on the left, buttons on the right
    const dz = C.deskZ ?? 0.55;
    p.add('desk', box(xi * 2 - 0.1, 0.72, 0.5), M(0, fy + 0.36, dz));
    const top = box(xi * 2 - 0.1, 0.05, 0.62);
    top.rotateX(-0.22);
    p.add('dash', top, M(0, fy + 0.78, dz + 0.02));
    // instrument panel low on the desk, below the driver's line of sight to the track
    const panel = box(0.72, 0.26, 0.06);
    panel.rotateX(-0.45);
    p.add('dash', panel, M(C.eyeX ?? -0.42, fy + 0.86, dz - 0.12));
    // switch panel and buttons
    for (let k = 0; k < 10; k++) {
      const x = 0.15 + (k % 5) * 0.11, z = dz - 0.05 + Math.floor(k / 5) * 0.12;
      p.add(k === 0 ? 'stopBtn' : k < 3 ? 'validator' : 'black', cyl(0.022, 0.025, 10), M(x, fy + 0.82, z));
    }
    // driver's seat
    const sx = C.eyeX ?? -0.42, sz = C.seatZ ?? dz + 0.78;
    p.add('seat', box(0.5, 0.1, 0.46, 0.03), M(sx, fy + 0.5, sz));
    p.add('seat', box(0.5, 0.62, 0.1, 0.03), M(sx, fy + 0.86, sz + 0.25));
    p.add('steel', cyl(0.05, 0.42, 10), M(sx, fy + 0.24, sz));
    if (C.extra) C.extra(p, sec, B, fy, this);
    const cab = p.build(this.mats, { castShadow: false });
    cab.name = 'cab';
    g.add(cab);
    this.interiorGroups.push(cab);
    // controller handle (rotates with the notch): on the left of the desk
    const ctl = new THREE.Group();
    ctl.position.set(sx - 0.38, fy + 0.84, dz + 0.05);
    const hp = new Parts();
    hp.add('black', cyl(0.016, 0.16, 8), M(0, 0.08, 0));
    hp.add('black', cyl(0.028, 0.1, 10).rotateZ(Math.PI / 2), M(0, 0.17, 0));
    ctl.add(hp.build(this.mats, { castShadow: false }));
    g.add(ctl);
    this.controller = ctl;
    this.steeringWheel = ctl;
    // instrument panel canvas
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false }));
    cl.position.set(sx, fy + 0.87, dz - 0.085);
    cl.rotation.x = -0.45;
    g.add(cl);
    this.cluster = cl;
    const eye = this.spec.cab.eye;
    this.driverEyeLocal = new THREE.Vector3(eye[0], eye[1], eye[2]);
  }

  drawDash(g, s) {
    drawTramDash(g, s);
  }

  /** Controller handle position (notch / notches, -1 .. 1). */
  setController(f) {
    if (this.controller) this.controller.rotation.x = -f * 0.7;
  }

  // ------------------------------------------------------------------ signs
  /** Interior LED line (the announcements); the destination displays are the model's (buildSigns). */
  interiorSign(sec, z, y) {
    const inner = new LedSign(192, 16, 6);
    inner.on = '#ff9a1a';
    this.signs.interior = inner;
    const im = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.13), new THREE.MeshBasicMaterial({ map: inner.texture, color: new THREE.Color(2.2, 2.2, 2.2) }));
    im.position.set(0, y, z);
    this[sec.id].add(im);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.18, 0.06), this.mats.black);
    back.position.set(0, y, z + 0.032);
    this[sec.id].add(back);
  }

  setInteriorText(a, b = null) {
    if (!this.signs.interior) return;
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  // ------------------------------------------------------------------ state
  setSteer() {}

  setLights({ head = false, brake = false, reverse = false, left = false, right = false, interior = 1 } = {}) {
    const m = this.mats;
    m.headlamp.emissiveIntensity = head ? 3.2 : 0;
    m.marker.emissiveIntensity = head ? 1.6 : 0.25;
    m.brake.emissiveIntensity = brake ? 3 : 0;
    m.tail.emissiveIntensity = head ? 1.4 : 0.3;
    m.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    m.indicatorL.emissiveIntensity = left ? 4 : 0;
    m.indicatorR.emissiveIntensity = right ? 4 : 0;
    m.lightStrip.emissiveIntensity = interior;
    if (this.signMats) for (const sm of this.signMats) sm.color.setScalar(head ? 1.35 : 1.0);
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
  }

  setWiper(angle) {
    if (this.wiper) this.wiper.rotation.z = angle;
  }

  setDetail(cameraDist) {
    const show = cameraDist < 70;
    if (this.interiorGroups.length && this.interiorGroups[0].visible !== show) for (const g of this.interiorGroups) g.visible = show;
    const far = cameraDist > 160;
    if (this.bogies && this.bogies[0].group.visible === far) for (const b of this.bogies) b.group.visible = !far;
  }

  afterPose() {
    this.root.updateMatrixWorld(true);
    this.updateBellows();
  }

  dispose() {
    const mats = new Set(), texs = new Set();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
      m.dispose();
    }
    for (const t of texs) t.dispose();
  }
}

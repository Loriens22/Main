// Passenger saloon of the Yutong ZK6126HGA (photo ref15): dark speckled floor with yellow edge strips, light-grey
// wall panels, white ceiling with sloped coves and LED strips, light-grey hard-shell seats with grey cloth pads (drawn
// FROM spec.layout.seats), wheel-arch podiums, wheelchair bay, brushed-steel poles with yellow stop buttons, yellow
// door poles, validators, raised rear bench platform with the engine tower, interior next-stop display.
// Construction shared with the BMC Procity saloon (../procity/ProcityInterior.js), dimensions from consts.js.
import * as THREE from 'three';
import { LedSign } from '../../LedSign.js';
import { M, Parts, box } from '../../BusGeom.js';
import { texBox, quad, profileStrip, sweep, rod, fillet } from '../../BusInteriorGeom.js';
import spec from './spec.js';
import { FY, PODIUM_Y, AISLE_X, WALL_X, HOUSING_X, HOUSING_HALF, REAR_PLATFORM, cabPartitionZ, rearWallZ } from './layout.js';
import { makeFloorTex, makeCeilTex, makeCoveTex, makeSeatFabric, makeSignSheet, makeBlind } from './YutongInteriorTextures.js';
import { seatPieces, foldSeatPieces } from './YutongSeat.js';
import { buildPoles, decal } from './YutongPoles.js';
import { addCabParts } from './YutongCab.js';
import { K } from './consts.js';

const PANES = { right: K.panesR, left: K.panesL };
const FRONT_Z = K.frontZ;

const D = spec.dims;
export const CEIL_Y = 2.66; // flat centre of the ceiling
export const HEADER_Y = 2.48; // lowered header at the cab bulkhead
const HOUSING_Y = 1.05; // top of the wheel housing (the window seat pan rests on it)
const COVE = [[0.72, 2.66], [0.8, 2.655], [0.92, 2.64], [1.04, 2.61], [1.13, 2.58], [1.2, 2.55]];
const DISPLAY = { x: 0, y: 2.54, tilt: 0.09 };

/** Amber single-line next-stop display. */
class InteriorLed extends LedSign {
  showLines(a, b) {
    const key = `S|${a}|${b}`;
    if (key === this.key) return;
    this.key = key;
    const text = b ? `${a} ${b}` : a;
    const sz = Math.round(this.rows * 0.34);
    this.paint(this.rasterise([{ text, x: 3, y: Math.round((this.rows + sz * 0.72) / 2), size: sz, maxW: this.cols - 8, align: 'center', condensed: 0.92 }]));
  }
}

export const InteriorMixin = {
  interiorMaterials() {
    const S = THREE.MeshStandardMaterial;
    const floor = makeFloorTex();
    const ceil = makeCeilTex();
    const cove = makeCoveTex();
    const fabric = makeSeatFabric();
    const mats = {
      floor: new S({ map: floor, color: 0xffffff, roughness: 0.92 }),
      wall: new S({ color: 0xbfc2c0, roughness: 0.6 }),
      wallLight: new S({ color: 0xc9cbc4, roughness: 0.6 }),
      frame: new S({ color: 0x15171a, roughness: 0.6 }),
      pillar: new S({ color: 0x8c9196, roughness: 0.55 }),
      ceiling: new S({ map: ceil, color: 0xffffff, roughness: 0.8, emissive: 0xd6d4cc, emissiveIntensity: 0.08 }),
      cove: new S({ map: cove, color: 0xffffff, roughness: 0.75, emissive: 0xd4d3cb, emissiveIntensity: 0.06 }),
      lightStrip: new S({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1.0, roughness: 0.5 }),
      seat: new S({ color: 0x9da3a8, roughness: 0.45, envMapIntensity: 0.5 }),
      pad: new S({ map: fabric, color: 0xffffff, roughness: 0.95, envMapIntensity: 0.3, side: THREE.DoubleSide }),
      pole: new S({ color: 0x9fa5aa, roughness: 0.35, metalness: 0.65, envMapIntensity: 0.6 }),
      strap: new S({ color: 0x15171a, roughness: 0.6, side: THREE.DoubleSide }),
      railYellow: new S({ color: 0xf1b90f, roughness: 0.4, metalness: 0.1, envMapIntensity: 0.5 }),
      stripYellow: new S({ color: 0xf2e12c, roughness: 0.7 }),
      redPlastic: new S({ color: 0xc43a30, roughness: 0.5 }),
      buttonBlue: new S({ color: 0x2070d0, roughness: 0.5 }),
      signs: new S({ map: makeSignSheet(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      screen: new S({ color: 0xaeb8ba, roughness: 0.5 }),
      validator: new S({ color: 0x14161a, roughness: 0.4 }),
      validatorBlue: new S({ color: 0x1b4fb0, roughness: 0.4 }),
      dash: new S({ color: 0x2b2e33, roughness: 0.85, envMapIntensity: 0.3 }),
      dashTop: new S({ color: 0xc6c8c6, roughness: 0.8, envMapIntensity: 0.3 }),
      dashPad: new S({ color: 0x1f2328, roughness: 0.85, envMapIntensity: 0.3 }),
      cabPanel: new S({ color: 0xcfd2d3, roughness: 0.7 }),
      glassSmoked: new S({ color: 0x0d1115, roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.86, depthWrite: false, envMapIntensity: 0.8 }),
      glassScreen: new S({ color: 0x9db4bd, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
      mirrorIn: new S({ color: 0x8c979d, roughness: 0.1, metalness: 1 }),
      blind: new S({ map: makeBlind(), roughness: 0.9, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
      plastic: new S({ color: 0x2a2d30, roughness: 0.55 }),
      stopBtn: new S({ color: 0xf0b414, roughness: 0.4, emissive: 0xff3010, emissiveIntensity: 0 }),
      satinChrome: new S({ color: 0xb9bcbe, roughness: 0.35, metalness: 1 }),
    };
    // The scene's ambient light (blue hemisphere + sky IBL) turns neutral greys blue: warm the albedos so the lit
    // result matches the neutral greys of the photos. Emissive / unlit materials are left alone.
    const warm = new THREE.Color(1.2, 1.0, 0.8);
    for (const [k, m] of Object.entries(mats)) if (!['lightStrip', 'ceiling', 'cove', 'glassSmoked', 'glassScreen', 'satinChrome'].includes(k)) m.color.multiply(warm);
    return mats;
  },

  /** Next-stop display face (this.signs.interior): the glowing front; the housing is baked in the cab parts. */
  buildInteriorSigns() {
    const inner = new InteriorLed(176, 32, 6);
    this.signs.interior = inner;
    const imat = new THREE.MeshBasicMaterial({ map: inner.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(1.5) });
    const zc = cabPartitionZ(D) + 0.2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.14), imat);
    face.position.set(DISPLAY.x, DISPLAY.y, zc + 0.0585);
    face.rotation.x = DISPLAY.tilt;
    this.front.add(face);
  },

  buildInterior() {
    const p = new Parts();
    const low = this.lite;
    this.saloon(p, low);
    this.seats(p, low);
    buildPoles(this, p);
    addCabParts(p, low, this);
    const g = p.build(this.mats, { castShadow: false });
    this.front.add(g);
    this.interiorGroups = [g];
  },

  /** Floor, podiums, walls, window pillars, ceiling with coves, rear platform and engine tower. */
  saloon(parts, low) {
    const zS = FRONT_Z + 0.3, zE = rearWallZ(D);
    const zCab = cabPartitionZ(D);
    const doors = spec.doors;
    const axles = [-D.wb1, 0];
    // ---- floor
    parts.add('floor', quad('y', -1.2, 1.2, zS, zE, FY, true, 2));
    // ---- wheel-arch podiums
    for (const pd of spec.layout.podiums) this.podium(parts, pd);
    // ---- lower side walls (floor to sill), cut at doors and wheel housings
    for (const side of [-1, 1]) {
      const cuts = [];
      if (side > 0) for (const d of doors) cuts.push([d.z0 - 0.1, d.z1 + 0.1]);
      for (const az of axles) cuts.push([az - HOUSING_HALF - 0.02, az + HOUSING_HALF + 0.02]);
      cuts.sort((a, b) => a[0] - b[0]);
      let a = zS + 0.1;
      const segs = [];
      for (const [c0, c1] of cuts) { if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
      segs.push([a, zE]);
      for (const [s0, s1] of segs) {
        if (s1 - s0 < 0.05) continue;
        parts.add('wall', box(0.03, D.beltY - FY, s1 - s0), M(side * (WALL_X + 0.015), (D.beltY + FY) / 2, (s0 + s1) / 2));
        parts.add('pillar', box(0.08, 0.035, s1 - s0), M(side * (WALL_X - 0.02), D.beltY - 0.0175, (s0 + s1) / 2));
      }
    }
    // ---- window pillars between the panes, transoms
    for (const side of [-1, 1]) {
      const panes = PANES[side > 0 ? 'right' : 'left'];
      const solid = [];
      let c = zS + 0.2;
      const holes = [...panes, ...(side > 0 ? doors.map((d) => [d.z0 - 0.1, d.z1 + 0.1]) : [])].sort((p, q) => p[0] - q[0]);
      for (const [h0, h1] of holes) { if (h0 > c + 0.01) solid.push([c, h0]); c = Math.max(c, h1); }
      if (zE > c) solid.push([c, zE]);
      for (const [s0, s1] of solid) parts.add('pillar', box(0.1, 2.64 - D.beltY, s1 - s0), M(side * 1.18, (2.64 + D.beltY) / 2, (s0 + s1) / 2));
      for (const [a, b] of panes) parts.add('frame', box(0.03, 0.05, b - a), M(side * 1.203, 1.98, (a + b) / 2));
    }
    // door posts and exit pictograms
    for (const dr of doors) {
      for (const z of [dr.z0 - 0.06, dr.z1 + 0.06]) parts.add('pillar', box(0.1, 2.58 - FY, 0.11), M(1.18, (2.58 + FY) / 2, z));
      const g = decal(0.06, 0.06, 'exit');
      g.rotateY(-Math.PI / 2);
      parts.add('signs', g, M(1.153, 2.1, dr.z1 + 0.06));
    }
    // wheelchair / pram bay pictograms on the left window glass
    if (!low) {
      const put = (name, z, y) => { const g = decal(0.1, 0.1, name); g.rotateY(Math.PI / 2); parts.add('signs', g, M(-1.227, y, z)); };
      put('wheel', -3.0, 1.75); put('pram', -2.86, 1.75);
    }
    // ---- ceiling: flat centre + sloped coves, wall return above the window head
    const cz0 = zCab + 0.2, cz1 = zE;
    const centre = quad('y', -0.72, 0.72, cz0, cz1, CEIL_Y, false);
    const cu = centre.attributes.uv;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 1.4, (cu.getY(i) * (cz1 - cz0)) / 1.2);
    parts.add('ceiling', centre);
    for (const side of [-1, 1]) {
      parts.add('cove', profileStrip(COVE.map(([x, y]) => [side * x, y]), cz0, cz1, 0.5, side > 0));
      parts.add('wall', quad('x', cz0, cz1, 2.55, 2.9, side * 1.23, side < 0));
    }
    // LED strips along the inner cove edge (continuous, short gaps)
    for (const side of [-1, 1]) {
      for (let z = cz0 + 0.2; z < cz1 - 0.9; z += 1.5) {
        parts.add('lightStrip', box(0.045, 0.012, 1.3), M(side * 0.745, CEIL_Y - 0.006, z + 0.65));
        parts.add('frame', box(0.07, 0.006, 1.34), M(side * 0.745, CEIL_Y - 0.0025, z + 0.65));
      }
    }
    if (!low) {
      for (const z of [-5.4, -1.8, 1.3]) parts.add('frame', new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeRotationX(Math.PI).setPosition(0.12, CEIL_Y, z));
      // emergency hammers (red holders) on the window pillars and yellow release tabs
      for (const side of [-1, 1]) for (const z of [-5.5, -1.1]) {
        if (side > 0 && doors.some((d) => z > d.z0 - 0.3 && z < d.z1 + 0.3)) continue;
        parts.add('redPlastic', box(0.05, 0.05, 0.12), M(side * 1.2, 2.45, z));
      }
    }
    // ---- cab bulkhead header is added with the cab; rear wall, engine tower and the bench platform
    this.rearEnd2(parts, zE, low);
  },

  /** Wheel-arch podium: aisle step with yellow edge strips and the closed wheel housing. */
  podium(parts, p) {
    const sg = p.side, { z0, z1, axle } = p;
    const h = PODIUM_Y - FY;
    const hz0 = axle - HOUSING_HALF, hz1 = axle + HOUSING_HALF;
    const bx = (x0, x1, za, zb) => {
      if (zb - za < 0.02) return;
      parts.add('floor', texBox(x1 - x0, h, zb - za), M(sg * (x0 + x1) / 2, FY + h / 2, (za + zb) / 2));
    };
    bx(AISLE_X, HOUSING_X, z0, z1);
    bx(HOUSING_X, WALL_X + 0.01, z0, hz0);
    bx(HOUSING_X, WALL_X + 0.01, hz1, z1);
    const topY = HOUSING_Y;
    parts.add('wall', quad('x', hz0, hz1, PODIUM_Y, topY, sg * HOUSING_X, sg < 0));
    const xa = sg > 0 ? HOUSING_X : -WALL_X, xb = sg > 0 ? WALL_X : -HOUSING_X;
    parts.add('wall', quad('z', xa, xb, PODIUM_Y, topY, hz0, false));
    parts.add('wall', quad('z', xa, xb, PODIUM_Y, topY, hz1, true));
    parts.add('wall', quad('y', xa, xb, hz0, hz1, topY, true));
    const yel = (x0, x1, za, zb) => parts.add('stripYellow', box(x1 - x0, 0.004, zb - za), M(sg * (x0 + x1) / 2, PODIUM_Y + 0.002, (za + zb) / 2));
    yel(AISLE_X, AISLE_X + 0.045, z0, z1);
    yel(AISLE_X, HOUSING_X, z0, z0 + 0.045);
    yel(AISLE_X, HOUSING_X, z1 - 0.045, z1);
    parts.add('stripYellow', box(0.006, 0.045, z1 - z0), M(sg * (AISLE_X - 0.003), PODIUM_Y - 0.0225, (z0 + z1) / 2));
    parts.add('stripYellow', box(HOUSING_X - AISLE_X, 0.045, 0.006), M(sg * (AISLE_X + HOUSING_X) / 2, PODIUM_Y - 0.0225, z0 - 0.003));
  },

  /** Rear wall with the clear window on the right, the engine tower on the left, the raised bench platform. */
  rearEnd2(parts, zE, low) {
    const ceilY = 2.7;
    // wall below and above the window (right half), full height over the engine bay (left half)
    parts.add('wall', quad('z', -1.23, 1.23, FY, 1.55, zE, false));
    parts.add('wall', quad('z', -1.23, 1.23, 2.58, ceilY + 0.2, zE, false));
    parts.add('wall', quad('z', -1.23, 0.02, 1.55, 2.58, zE, false));
    parts.add('wall', quad('z', 1.12, 1.23, 1.55, 2.58, zE, false));
    // engine tower: floor-to-ceiling box in the left rear corner with a vented lower hatch
    const x0 = -1.22, x1 = -0.18, z0 = 1.8;
    parts.add('wall', box(x1 - x0, CEIL_Y - FY, zE - z0), M((x0 + x1) / 2, (CEIL_Y + FY) / 2, (z0 + zE) / 2));
    parts.add('frame', box(x1 - x0 + 0.004, 0.55, 0.01), M((x0 + x1) / 2, FY + 0.3, z0 - 0.003));
    if (!low) for (let i = 0; i < 6; i++) parts.add('frame', box(0.7, 0.012, 0.01), M((x0 + x1) / 2, 1.2 + i * 0.07, z0 - 0.006));
    // raised bench platform right of the engine tower, with a yellow riser edge
    const pz0 = zE - 1.05;
    const px0 = x1 + 0.0, px1 = 1.22;
    parts.add('floor', texBox(px1 - px0, REAR_PLATFORM - FY, zE - pz0), M((px0 + px1) / 2, (REAR_PLATFORM + FY) / 2, (pz0 + zE) / 2));
    parts.add('stripYellow', box(px1 - px0, 0.04, 0.006), M((px0 + px1) / 2, REAR_PLATFORM - 0.02, pz0 - 0.003));
    parts.add('stripYellow', box(px1 - px0, 0.004, 0.045), M((px0 + px1) / 2, REAR_PLATFORM + 0.002, pz0 + 0.0225));
  },

  /** Seats from spec.layout.seats: shell + pad pieces, supports, hoops. */
  seats(parts, low) {
    const P = seatPieces(this.quality);
    const F = foldSeatPieces();
    const m4 = new THREE.Matrix4();
    const blocks = new Map();
    for (const s of spec.layout.seats) {
      m4.makeRotationY(s.yaw).setPosition(s.x, s.fy, s.z);
      const set = s.kind === 'fold' ? F : P;
      for (const g of set.shell) parts.add('seat', g, m4.clone());
      for (const g of set.pad) parts.add('pad', g, m4.clone());
      const key = `${s.z}|${s.yaw}|${s.kind === 'bench' ? 0 : Math.sign(s.x)}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(s);
    }
    for (const list of blocks.values()) {
      const s0 = list[0];
      const sg = Math.sign(s0.x);
      const zc = s0.z + 0.12 * Math.cos(s0.yaw);
      const yb = Math.min(...list.map((q) => q.fy)) + 0.355;
      if (s0.kind === 'bench') {
        parts.add('seat', box(0.04, 0.3, 0.3), M(Math.min(...list.map((q) => q.x)) - 0.2, s0.fy + 0.2, zc));
        continue;
      }
      if (s0.kind === 'fold') {
        parts.add('frame', box(0.04, 0.1, 0.06), M(s0.x - 0.215, s0.fy + 0.8, s0.z + 0.28));
        continue;
      }
      const xo = Math.max(...list.map((q) => Math.abs(q.x))) + 0.2;
      const xi = Math.min(...list.map((q) => Math.abs(q.x))) - 0.2;
      if (xo > 1.1) {
        // cantilever beam under the pans from the wall bracket
        parts.add('seat', rod([sg * Math.min(xo, WALL_X), yb, zc], [sg * xi, yb, zc], 0.016, 8));
        parts.add('frame', box(0.025, 0.14, 0.18), M(sg * (WALL_X - 0.012), s0.fy + 0.31, zc));
      }
      for (const q of list) {
        if (Math.abs(q.x) < 0.7 || list.length === 1) parts.add('seat', box(0.04, 0.385, 0.15), M(q.x - sg * 0.2, q.fy + 0.1925, zc));
      }
      if (s0.hoop && !low) {
        const x = sg * (AISLE_X + 0.012);
        const path = fillet([[x, s0.fy + 0.01, s0.z - 0.19], [x, s0.fy + 0.62, s0.z - 0.21], [x, s0.fy + 1.07, s0.z - 0.1], [x, s0.fy + 1.07, s0.z + 0.28]], 0.14, 6);
        parts.add('pole', sweep(path, 0.0125, 6, { caps: true }));
      }
    }
  },
};

void rod; void sweep;

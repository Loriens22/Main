// Passenger interior and driver's cab of the MAN Lion's City G CNG: floor, walls, podiums, ceiling,
// seats, poles and rails, displays, validators, cab. Mixed into BusModel (see the end of BusModel.js);
// `this` is the BusModel. Reference: data/research/bus/interior/interior_spec.md (photos 4 and 5).
// Poles and straps: BusPoles.js. Driver's cab: BusCab.js. Seat shell: BusSeat.js. Seat map: BusLayout.js.
import * as THREE from 'three';
import { BUS, FRONT_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z } from './BusSpec.js';
import { SEATS, PODIUMS, PODIUM_Y, AISLE_X, WALL_X, REAR_BULKHEAD_Z } from './BusLayout.js';
import { LedSign } from './LedSign.js';
import {
  makeFloor, makeMoquette, makePrioritySticker, makeSignSheet, makeDuct, makeCeilingPanel, makeTurntable,
} from './BusInteriorTextures.js';
import { HW, M, Parts, box } from './BusGeom.js';
import { seatPieces, foldSeatPieces } from './BusSeat.js';
import { busKit, kitSeats, kitInstances } from './BusKit.js';
import { texBox, quad, profileStrip, decal, sweep, rod, fillet, floorPlate, clipFront } from './BusInteriorGeom.js';
import { faceS, hwAt } from './BusFront.js';
import { buildPoles } from './BusPoles.js';
import { addCabParts, buildCabInterior, CAB_PARTITION_Z } from './BusCab.js';

const FY = BUS.floorY;
export const CEIL_Y = 2.76; // flat centre of the ceiling
export const HEADER_Y = 2.52; // lowered header / cab ceiling
const DUCT = [[0.73, 2.76], [0.82, 2.745], [0.92, 2.715], [1.02, 2.675], [1.12, 2.625], [1.2, 2.59], [1.255, 2.575]]; // right side duct profile (x, y)
const HOUSING_X = 0.74; // inner face of the wheel housing (the arch liner disc of the exterior stands at 0.755)
const HOUSING_HALF = 0.64; // half length of the wheel housing around the axle
const HOUSING_Y = 1.045; // top of the wheel housing (the window seat pan rests on it)
// interior next-stop display: light-grey housing 0.95 x 0.21 x 0.10 hung from the lowered header, tilted 5 degrees
const DISPLAY_TILT = 0.087;
const DISPLAY_FRONT = { x: -0.04, y: 2.62, z: CAB_PARTITION_Z + 0.16 + 0.02 + 0.05, k: 1 };
const DISPLAY_REAR = { x: 0, y: 2.62, z: REAR_BODY_START_Z + 0.06 + 0.06, k: 0.8 };

/** Amber single-line next-stop display (light-grey housing, black glass face). */
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
  /** Materials used only by the passenger interior and the cab (merged into this.mats). */
  interiorMaterials() {
    const S = THREE.MeshStandardMaterial;
    const floorTex = makeFloor();
    const moq = makeMoquette();
    moq.repeat.set(2, 2);
    const duct = makeDuct();
    duct.repeat.set(1, 1);
    const ceil = makeCeilingPanel();
    const tt = makeTurntable();
    const sticker = makePrioritySticker();
    const mats = {
      floor: new S({ map: floorTex, color: 0xffffff, roughness: 0.92 }),
      wall: new S({ color: 0xd3d5d0, roughness: 0.62 }),
      frame: new S({ color: 0x15171a, roughness: 0.6 }),
      ceiling: new S({ map: ceil, color: 0xffffff, roughness: 0.8, emissive: 0xd6d4cc, emissiveIntensity: 0.06 }),
      duct: new S({ map: duct, color: 0xffffff, roughness: 0.7, emissive: 0xd4d3cb, emissiveIntensity: 0.05 }),
      lightStrip: new S({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1.0, roughness: 0.5 }),
      seat: new S({ color: 0x90959b, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 }),
      seatCap: new S({ color: 0x3b3e45, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 }),
      seatPanel: new S({ color: 0xa6abb1, roughness: 0.45, envMapIntensity: 0.5 }),
      moquette: new S({ map: moq, roughness: 0.95 }),
      pole: new S({ color: 0xa9adb0, roughness: 0.42, metalness: 0.25, envMapIntensity: 0.35 }),
      strap: new S({ color: 0x7e8387, roughness: 0.75, side: THREE.DoubleSide }),
      railYellow: new S({ color: 0xf1b90f, roughness: 0.4, metalness: 0.1, envMapIntensity: 0.5 }),
      stripYellow: new S({ color: 0xf2e12c, roughness: 0.7 }),
      redPlastic: new S({ color: 0xc43a30, roughness: 0.5 }),
      sticker: new S({ map: sticker, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      signs: new S({ map: makeSignSheet(), roughness: 0.6, transparent: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      dash: new S({ color: 0x2b2e33, roughness: 0.85, envMapIntensity: 0.3 }),
      dashPad: new S({ color: 0x22303f, roughness: 0.8, envMapIntensity: 0.3 }),
      cabPanel: new S({ color: 0xcfd2d3, roughness: 0.7 }),
      glassSmoked: new S({ color: 0x0d1115, roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.88, depthWrite: false, envMapIntensity: 0.8 }),
      mirrorIn: new S({ color: 0x8c979d, roughness: 0.1, metalness: 1 }),
      turntable: new S({ map: tt, color: 0xffffff, roughness: 0.5, metalness: 0.3 }),
      cloth: new S({ color: 0x2f7f86, roughness: 0.95 }),
      blind: new S({ color: 0x4a4d50, roughness: 0.9, side: THREE.DoubleSide }),
    };
    // The scene's ambient light (blue hemisphere + sky IBL) turns neutral greys blue: warm the albedos so the
    // lit result matches the neutral grey of the photos. Emissive / unlit materials are left alone.
    const warm = new THREE.Color(1.2, 1.0, 0.8);
    for (const [k, m] of Object.entries(mats)) if (m.isMeshStandardMaterial && !['lightStrip', 'ceiling', 'duct'].includes(k)) m.color.multiply(warm);
    return mats;
  },

  /** Next-stop LED displays hanging from the ceiling (this.signs.interior): the glowing faces; housings are baked in buildInterior. */
  buildInteriorSigns() {
    const inner = new InteriorLed(176, 32, 6);
    this.signs.interior = inner;
    const imat = new THREE.MeshBasicMaterial({ map: inner.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(1.5) });
    for (const [g, d] of [[this.front, DISPLAY_FRONT], [this.rear, DISPLAY_REAR]]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * d.k, 0.165 * d.k), imat);
      face.position.set(0, 0, 0.0505 * d.k);
      const grp = new THREE.Group();
      grp.add(face);
      grp.position.set(d.x, d.y, d.z);
      grp.rotation.x = DISPLAY_TILT;
      g.add(grp);
    }
  },

  /* ------------------------------------------------------------------ interior */
  buildInterior() {
    const fp = new Parts();
    const rp = new Parts();
    const low = this.quality === 'low';
    this.saloon(fp, 'front', low);
    this.saloon(rp, 'rear', low);
    this.seats(fp, rp, low);
    this.poles(fp, 'front');
    this.poles(rp, 'rear');
    for (const [parts, d] of [[fp, DISPLAY_FRONT], [rp, DISPLAY_REAR]]) {
      parts.add('wall', roundedHousing(0.95 * d.k, 0.21 * d.k, 0.1 * d.k), new THREE.Matrix4().makeRotationX(DISPLAY_TILT).setPosition(d.x, d.y, d.z));
    }
    addCabParts(fp, low);
    // the dash and cab side panels reached past the curved corners of the nose: keep the cabin inside the skin
    clipFront(fp, FRONT_Z + 0.6, (ax, y) => FRONT_Z + faceS(Math.min(HW, (ax * HW) / hwAt(y)), y) + 0.03);
    // defensive: the exterior's underbody pan must not poke above the passenger floor (it hid the floor)
    for (const ext of [this.frontExterior, this.rearExterior]) lowerUnderbodyPan(ext);
    const f = fp.build(this.mats, { castShadow: false });
    const r = rp.build(this.mats, { castShadow: false });
    for (const [g, sec] of [[f, 'front'], [r, 'rear']]) {
      const im = kitSeats('seat_man', this._kitSeats[sec]);
      if (im) g.add(im);
      const iv = this._kitValidators && kitInstances('validator', this._kitValidators[sec]);
      if (iv) g.add(iv);
    }
    this.front.add(f);
    this.rear.add(r);
    this.interiorGroups = [f, r];
  },

  /** Floor, podiums, walls, window trim, ceiling with ducts, end walls of one section. */
  saloon(parts, sec, low) {
    const isF = sec === 'front';
    const zS = isF ? FRONT_Z + 0.3 : REAR_BODY_START_Z; // floor start
    const zE = isF ? FRONT_BODY_END_Z : REAR_BULKHEAD_Z; // floor end
    const doors = BUS.doors.filter((d) => d.section === sec);
    const axles = isF ? [-BUS.wb1, 0] : [0];
    // ---- floor (speckled rubber, 2 tiles per metre), kept out of the wheel arches
    floorPlate(parts, 1.22, zS, zE, FY, axles, HOUSING_X, HOUSING_HALF);
    // ---- podiums over the wheel arches (wall to aisle edge, yellow edge strips)
    for (const p of PODIUMS.filter((q) => q.sec === sec)) this.podium(parts, p);
    // ---- lower side walls (floor to the sill), cut at doors and wheel housings
    const zWall0 = isF ? zS + 0.1 : REAR_BODY_START_Z + 0.06;
    for (const side of [-1, 1]) {
      const cuts = [];
      if (side > 0) for (const d of doors) cuts.push([d.z0, d.z1]);
      for (const az of axles) cuts.push([az - HOUSING_HALF - 0.02, az + HOUSING_HALF + 0.02]);
      cuts.sort((a, b) => a[0] - b[0]);
      let a = zWall0;
      const segs = [];
      for (const [c0, c1] of cuts) { if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
      segs.push([a, zE]);
      for (const [s0, s1] of segs) {
        if (s1 - s0 < 0.05) continue;
        parts.add('wall', box(0.03, BUS.beltY - FY, s1 - s0), M(side * (WALL_X + 0.015), (BUS.beltY + FY) / 2, (s0 + s1) / 2));
        // sill ledge (rounded, slightly darker)
        parts.add('wall', box(0.08, 0.035, s1 - s0), M(side * (WALL_X - 0.02), BUS.beltY - 0.0175, (s0 + s1) / 2));
      }
    }
    // ---- window pillars (light grey, 0.11 wide, 0.10 deep) and the black transom
    const pillarH = 2.58 - BUS.beltY;
    const ranges = (side) => {
      const cuts = side > 0 ? doors.map((d) => [d.z0, d.z1]) : [];
      const out = [];
      let a = isF ? FRONT_Z + 0.24 : REAR_BODY_START_Z + 0.06;
      for (const [d0, d1] of cuts) { out.push([a, d0]); a = d1; }
      out.push([a, zE]);
      return out;
    };
    for (const side of [-1, 1]) {
      for (const [r0, r1] of ranges(side)) {
        const L = r1 - r0;
        if (L < 0.2) continue;
        // transom between the lower and the upper pane
        parts.add('frame', box(0.03, 0.07, L), M(side * 1.225, BUS.beltY + 0.62, (r0 + r1) / 2));
        const n = Math.max(1, Math.round(L / 1.38));
        for (let i = 1; i < n; i++) parts.add('wall', box(0.1, pillarH, 0.11), M(side * 1.205, BUS.beltY + pillarH / 2, r0 + (L * i) / n));
      }
    }
    // door posts: light-grey pillars flanking each door
    for (const d of doors) {
      for (const z of [d.z0 - 0.06, d.z1 + 0.06]) parts.add('wall', box(0.1, 2.58 - FY, 0.11), M(1.205, (2.58 + FY) / 2, z));
      // green exit pictograms on the pillars' faces
      for (const z of [d.z0 - 0.06, d.z1 + 0.06]) {
        const g = decal(0.06, 0.12, 'exit');
        g.rotateY(-Math.PI / 2);
        parts.add('signs', g, M(1.153, 1.6, z));
      }
    }
    if (isF && !low) {
      // wheelchair / pram bay pictograms on the left window glass, small priority sticker on the right glass
      const put = (name, z, y) => { const g = decal(0.1, 0.1, name); g.rotateY(Math.PI / 2); parts.add('signs', g, M(-1.252, y, z)); };
      put('wheel', -2.58, 1.68); put('pram', -2.44, 1.68); put('rule1', -2.58, 1.55); put('rule2', -2.44, 1.55);
      const g = new THREE.PlaneGeometry(0.09, 0.2);
      g.rotateY(-Math.PI / 2);
      parts.add('sticker', g, M(1.252, 1.62, -3.95));
    }
    // ---- ceiling: flat centre + sloped side ducts (pictogram / slot-grille panels)
    const cz0 = isF ? CAB_PARTITION_Z + 0.16 : REAR_BODY_START_Z + 0.06;
    const cz1 = isF ? FRONT_BODY_END_Z - 0.06 : REAR_BULKHEAD_Z;
    const centre = quad('y', -0.73, 0.73, cz0, cz1, CEIL_Y, false);
    const cu = centre.attributes.uv;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * (1.46 / 1.46), (cu.getY(i) * (cz1 - cz0)) / 1.2);
    parts.add('ceiling', centre);
    for (const side of [-1, 1]) {
      const prof = DUCT.map(([x, y]) => [side * x, y]);
      parts.add('duct', profileStrip(prof, cz0, cz1, 0.5, side > 0));
      // wall return above the window head
      parts.add('wall', quad('x', cz0, cz1, 2.575, 2.9, side * 1.255, side < 0));
    }
    // light panels: one row on the bus-left half, 0.55 x 0.14 at x -0.38
    const lz = isF ? [-4.9, -2.9, -0.9, 0.95] : [-4.0, -2.0, 0.0, 2.0];
    for (const z of lz) {
      if (z < cz0 + 0.3 || z > cz1 - 0.3) continue;
      parts.add('lightStrip', box(0.14, 0.012, 0.55), M(-0.38, CEIL_Y - 0.006, z));
      parts.add('frame', box(0.17, 0.006, 0.58), M(-0.38, CEIL_Y - 0.003, z));
    }
    if (!low) {
      // round sensors, hammers (red holders on the window header), yellow release tabs
      for (const z of isF ? [-3.9, -1.9, 0.2] : [-3.3, -0.8, 1.2]) parts.add('frame', new THREE.CylinderGeometry(0.02, 0.02, 0.01, 10), M(0.1, CEIL_Y - 0.003, z));
      for (const side of [-1, 1]) for (const z of isF ? [-5.1, -0.4] : [-4.2, 1.2]) {
        if (side > 0 && doors.some((d) => z > d.z0 - 0.1 && z < d.z1 + 0.1)) continue;
        parts.add('redPlastic', box(0.06, 0.04, 0.1), M(side * 1.2, 2.52, z));
        parts.add('railYellow', box(0.025, 0.02, 0.04), M(side * 1.2, 2.5, z + 0.1));
      }
      // yellow emergency-release pull in the duct above each door, with a red lamp
      for (const d of doors) {
        const zc = (d.z0 + d.z1) / 2 + 0.2;
        const pull = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14);
        pull.scale(1, 1, 0.65);
        pull.rotateZ(0.5);
        parts.add('railYellow', pull, M(0.96, 2.688, zc));
        parts.add('redPlastic', box(0.03, 0.01, 0.015), M(0.98, 2.69, zc + 0.12));
      }
    }
    // ---- end walls
    if (isF) {
      this.endWall(parts, FRONT_BODY_END_Z - 0.06, true, false);
      // lowered header at the cab bulkhead
      parts.add('ceiling', box(2.46, CEIL_Y - HEADER_Y, 0.04), M(0, (CEIL_Y + HEADER_Y) / 2, CAB_PARTITION_Z + 0.16));
      // convex passenger mirror above the end of the front section
      this.convexMirror(parts, 0.12, 2.6, 0.9, 1);
    } else {
      this.endWall(parts, REAR_BODY_START_Z + 0.06, false, true);
      this.convexMirror(parts, 0.1, 2.6, -4.0, 0.7);
      this.rearBulkhead(parts, low);
    }
  },

  /** Wheel-arch podium: aisle step with yellow edge strips, the closed wheel housing on top of the window side. */
  podium(parts, p) {
    const sg = p.side;
    const { z0, z1, axle } = p;
    const h = PODIUM_Y - FY;
    const hz0 = axle - HOUSING_HALF, hz1 = axle + HOUSING_HALF;
    const bx = (x0, x1, za, zb) => {
      if (zb - za < 0.02) return;
      parts.add('floor', texBox(x1 - x0, h, zb - za), M(sg * (x0 + x1) / 2, FY + h / 2, (za + zb) / 2));
    };
    // aisle step (x AISLE_X .. housing) over the whole length; wall side beyond the housing
    bx(AISLE_X, HOUSING_X, z0, z1);
    // (kept 4 cm clear of the wheel arch: their top edge showed through the arch as a plate across the tyre)
    bx(HOUSING_X, WALL_X - 0.01, z0, hz0 - 0.04);
    bx(HOUSING_X, WALL_X - 0.01, hz1 + 0.04, z1);
    // closed housing (inner face, ends, top) over the wheel
    const topY = HOUSING_Y;
    parts.add('wall', quad('x', hz0, hz1, PODIUM_Y, topY, sg * HOUSING_X, sg < 0));
    const xa = sg > 0 ? HOUSING_X : -WALL_X, xb = sg > 0 ? WALL_X : -HOUSING_X;
    parts.add('wall', quad('z', xa, xb, PODIUM_Y, topY, hz0, false));
    parts.add('wall', quad('z', xa, xb, PODIUM_Y, topY, hz1, true));
    parts.add('wall', quad('y', xa, xb, hz0, hz1, topY, true));
    // sloping hump above the wall side flank
    // yellow edge strips (0.045): aisle edge and front edge, turning the corner
    const yel = (x0, x1, za, zb) => parts.add('stripYellow', box(x1 - x0, 0.004, zb - za), M(sg * (x0 + x1) / 2, PODIUM_Y + 0.002, (za + zb) / 2));
    yel(AISLE_X, AISLE_X + 0.045, z0, z1);
    yel(AISLE_X, HOUSING_X, z0, z0 + 0.045);
    if (z0 < hz0 - 0.1) yel(HOUSING_X, WALL_X, z0, z0 + 0.045);
    // rear edge: strip only if the podium does not run into the end wall
    if (p.sec === 'front' && z1 > 1.2) { /* podium meets the portal wall */ } else if (z1 < FRONT_BODY_END_Z - 0.1) yel(AISLE_X, HOUSING_X, z1 - 0.045, z1);
    // vertical yellow edge line on the riser
    parts.add('stripYellow', box(0.006, 0.045, z1 - z0), M(sg * (AISLE_X - 0.003), PODIUM_Y - 0.0225, (z0 + z1) / 2));
    parts.add('stripYellow', box(HOUSING_X - AISLE_X, 0.045, 0.006), M(sg * (AISLE_X + HOUSING_X) / 2, PODIUM_Y - 0.0225, z0 - 0.003));
  },

  /** End wall at the articulation portal (z = plate face); rear one carries the MAN lettering above the arch. */
  endWall(parts, z, facingRear, withLetters) {
    // plate with the portal hole, light grey; black arch around the opening
    const dir = facingRear ? -1 : 1; // the wall is seen from the saloon: normal toward the saloon
    const wall = (x0, x1, y0, y1) => parts.add('wall', quad('z', x0, x1, y0, y1, z, facingRear ? false : true));
    wall(-1.255, -1.05, FY, 2.9);
    wall(1.05, 1.255, FY, 2.9);
    wall(-1.05, 1.05, 2.5, 2.9);
    // black arch band around the opening (0.12)
    const b = (x0, x1, y0, y1) => parts.add('frame', quad('z', x0, x1, y0, y1, z + dir * 0.004, facingRear ? false : true));
    b(-1.05, 1.05, 2.3, 2.5);
    b(-1.05, -0.93, FY, 2.3);
    b(0.93, 1.05, FY, 2.3);
    if (withLetters) {
      const g = decal(0.2, 0.05, 'man');
      parts.add('signs', g, M(0, 2.4, z + 0.006));
    } else {
      const g = decal(0.2, 0.05, 'man');
      g.rotateY(Math.PI);
      parts.add('signs', g, M(0, 2.4, z - 0.006));
    }
  },

  /** Oval silver convex mirror / dome camera hung from the ceiling. */
  convexMirror(parts, x, y, z, k) {
    const dome = new THREE.SphereGeometry(0.5, 16, 8);
    dome.scale(0.14 * k, 0.1 * k, 0.045 * k);
    parts.add('mirrorIn', dome, M(x, y, z));
    parts.add('pole', new THREE.CylinderGeometry(0.015, 0.015, CEIL_Y - y, 6), M(x, (y + CEIL_Y) / 2, z));
  },

  /** Engine bulkhead of the rear section with the engine tower on the bus-left corner. */
  rearBulkhead(parts, low) {
    const z = REAR_BULKHEAD_Z;
    parts.add('wall', quad('z', -1.255, 1.255, FY, 2.9, z, false));
    parts.add('frame', quad('z', -1.255, 1.255, FY, 0.62, z - 0.004, false));
    // engine tower: floor-to-ceiling box in the left rear corner
    const x0 = -1.22, x1 = -0.58, z0 = z - 0.55;
    parts.add('wall', box(x1 - x0, CEIL_Y - FY, z - z0), M((x0 + x1) / 2, (CEIL_Y + FY) / 2, (z0 + z) / 2));
    parts.add('frame', box(x1 - x0 + 0.004, 0.5, 0.01), M((x0 + x1) / 2, FY + 0.25, z0 - 0.003));
    if (!low) for (let i = 0; i < 6; i++) parts.add('frame', box(0.5, 0.012, 0.01), M((x0 + x1) / 2, 1.4 + i * 0.06, z0 - 0.006));
  },

  /** Seats: shell, cap, emblem, recess panel, supports, stickers, fold-up seat. */
  seats(fp, rp, low) {
    const P = seatPieces(this.quality);
    const F = foldSeatPieces(this.quality);
    const m4 = new THREE.Matrix4();
    const blocks = new Map();
    // Blender-modelled shells (kit_bus.glb), instanced per section; the procedural shell is the fallback
    const kit = !!busKit();
    const kitList = (this._kitSeats = { front: [], rear: [] });
    for (const s of SEATS) {
      const parts = s.sec === 'front' ? fp : rp;
      m4.makeRotationY(s.yaw).setPosition(s.x, s.fy, s.z);
      if (s.kind === 'fold') {
        parts.add('moquette', F.moq, m4.clone());
        parts.add('seat', F.rear, m4.clone());
        parts.add('seat', F.board, m4.clone());
        parts.add('seat', F.pan, m4.clone());
        parts.add('pole', F.hoop, m4.clone());
        // wall hinge bracket
        parts.add('frame', box(0.04, 0.1, 0.06), M(s.x - 0.215, s.fy + 0.8, s.z + 0.28));
        continue;
      }
      if (kit) kitList[s.sec].push(s);
      else {
        parts.add('seat', P.shell, m4.clone());
        parts.add('seatCap', P.cap, m4.clone());
        if (!low) {
          parts.add('seatCap', P.mark, m4.clone());
          parts.add('seatPanel', P.panel, m4.clone());
        }
      }
      if (s.sticker) parts.add('sticker', P.sticker, m4.clone());
      const key = `${s.sec}|${s.z}|${s.yaw}|${s.bench ? 0 : Math.sign(s.x)}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(s);
    }
    // supports: cantilever beam under the pans from the wall, black wall bracket, light-grey L-foot on podiums,
    // C-hoop guard, padded armrest flap (the aisle stanchions carry black clamps, see BusPoles.js)
    for (const list of blocks.values()) {
      const s0 = list[0];
      const parts = s0.sec === 'front' ? fp : rp;
      const sg = Math.sign(s0.x);
      const zc = s0.z + 0.12 * Math.cos(s0.yaw);
      const yb = Math.min(...list.map((q) => q.fy)) + 0.355;
      const xo = Math.max(...list.map((q) => Math.abs(q.x))) + 0.2;
      const xi = Math.min(...list.map((q) => Math.abs(q.x))) - 0.18;
      if (s0.bench) {
        parts.add('pole', rod([Math.min(...list.map((q) => q.x)) - 0.2, yb, zc], [Math.max(...list.map((q) => q.x)) + 0.2, yb, zc], 0.016, 8));
        continue;
      }
      if (xo > 1.1) {
        parts.add('pole', rod([sg * Math.min(xo, WALL_X), yb, zc], [sg * xi, yb, zc], 0.016, 8));
        parts.add('frame', box(0.025, 0.14, 0.18), M(sg * (WALL_X - 0.012), s0.fy + 0.31, zc));
      }
      for (const q of list) if (q.fy - FY > 0.05 && Math.abs(q.x) < 0.7) parts.add('seat', box(0.04, 0.385, 0.15), M(q.x - sg * 0.2, q.fy + 0.1925, zc));
      if (s0.hoop && !low) {
        const x = sg * (AISLE_X + 0.012);
        const path = fillet([[x, s0.fy + 0.01, s0.z - 0.19], [x, s0.fy + 0.62, s0.z - 0.21], [x, s0.fy + 1.07, s0.z - 0.1], [x, s0.fy + 1.07, s0.z + 0.28]], 0.14, 6);
        parts.add('pole', sweep(path, 0.0125, 6, { caps: true }));
      }
      if (sg > 0 && !low && s0.sec === 'front' && s0.fy === FY) {
        parts.add('seatCap', box(0.03, 0.07, 0.11), M(sg * (AISLE_X + 0.01), s0.fy + 0.53, zc));
      }
    }
  },

  poles(parts, sec) {
    buildPoles(this, parts, sec);
  },

  buildCab() {
    buildCabInterior(this);
  },
};

/** Flatten the tops of the exterior's underbody pan and wall sills (boxes reaching 0.45-0.47) to just below the floor. */
function lowerUnderbodyPan(group) {
  if (!group) return;
  const mesh = group.children.find((c) => c.name === 'underbody');
  if (!mesh) return;
  const pos = mesh.geometry.attributes.position;
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.44 && y < 0.474) { pos.setY(i, FY - 0.02); n++; } // pan top 0.45, side sills 0.47 (arch rims at 0.478 stay)
  }
  if (n) { pos.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
}

function roundedHousing(w, h, d) {
  const r = 0.035;
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2 + 0.006);
  return g;
}

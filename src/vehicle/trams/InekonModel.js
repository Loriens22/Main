// Inekon T8M-700IT, Sofia livery blue / orange / white (photos 6-10 only: data/research/line7/README.md). The
// two high-floor sections of a T6M-700 with a low-floor centre section between them. Read from the photos: the
// angular cab with the strongly raked windscreen and the yellow-green LED destination display in its top, the
// blue front reaching down to the lamp housings (narrow, slanted, black-rimmed, three lamps each) and the
// orange band with the black fleet number and the black bumper bar, white skirt; the orange rising diagonally
// on the cab sides to the belt line; rectangular windows in black rubber with top hoppers; black-framed folding
// doors with yellow handrails behind the glass; the centre section lower, its blue dipping into the orange in a
// V; exposed bogies under the white skirts; diamond pantograph, roof equipment; the flat rear with its large
// window, round red lamps and the bumper bar (photo 8). Inside (photos 9, 10): grey moquette seats with black
// backs on plinths along the windows, orange poles and ceiling rails, grey walls, white ceiling, light grey
// floor, the steps down into the low centre section with orange railings and the turntable plates.
import * as THREE from 'three';
import { M, box, cyl } from '../BusGeom.js';
import { TramModel, extrudeMapped, roundRect } from './TramModel.js';
import { endOutline } from './SchindlerModel.js';
import { makeNumberBox, makeNumberDecal, makeConfetti, makeLettering } from './TramTextures.js';
import { LedSign } from '../LedSign.js';

const HW = 1.125;
const BODY = {
  hw: HW, skirtY: 0.42, beltY: 1.45, winBot: 1.5, winTop: 2.56, doorBot: 0.4, doorTop: 2.5, eaveY: 2.8,
  tumble: 0.02, wall: 0.05, frontCorner: 0.62, rearCorner: 0.2,
};
const MID = { skirtY: 0.3, doorBot: 0.34, beltY: 1.3, winBot: 1.34 };
const H = { hopper: 0.36, r: 0.05 };
const CABWIN = { glass: 'screen', r: 0.04, bot: 1.5, top: 2.6 };

// windows (photos 6-8; positions estimated from the photos)
const WINDOWS = {
  front: {
    right: [[0.64, 1.62, CABWIN], [3.75, 4.95, H], [5.05, 6.25, H], [6.35, 7.4, H], [8.9, 10.1, H]],
    left: [[0.64, 1.62, CABWIN], [1.95, 3.15, H], [3.25, 4.45, H], [4.55, 5.75, H], [5.85, 7.05, H], [7.15, 8.35, H], [8.45, 10.1, H]],
  },
  middle: {
    right: [[0.35, 1.9, { r: 0.05 }], [3.45, 5.2, { r: 0.05 }]],
    left: [[0.35, 1.9, { r: 0.05 }], [2.0, 3.5, { r: 0.05 }], [3.6, 5.2, { r: 0.05 }]],
  },
  rear: {
    right: [[0.3, 1.55, H], [1.65, 2.9, H], [3.0, 3.88, H], [5.43, 6.65, H], [6.75, 7.95, H]],
    left: [[0.3, 1.55, H], [1.65, 2.9, H], [3.0, 4.25, H], [4.35, 5.6, H], [5.7, 6.95, H], [7.05, 8.3, H], [8.4, 9.85, H]],
  },
};

// the cab: windscreen rake from the top of the blue front (1.46 m) to its top (2.74 m), estimated from photo 6
const RAKE = 0.32;
const rake = (y) => (y <= 1.46 ? 0 : y >= 2.74 ? RAKE : ((y - 1.46) / 1.28) * RAKE);
const SWEEP_Z = 0.62; // the orange rises on the cab side from the corner (0.95 m) to the belt over this length

export class InekonModel extends TramModel {
  constructor(spec, opts = {}) {
    const look = spec.look;
    super(spec, opts, {
      colors: {
        paint: look.blue, paint2: look.orange, paint3: look.white, roof: look.blue, seat: 0x4b4d55, seatShell: 0x1b1c1e,
        pole: look.pole, polePaint: true, wall: 0xc4c7c3, ceiling: 0xeeefec, floorKind: 'speckle', floorCss: '#a9adaa',
        lowFloorCss: '#9ea3a2', bellows: 0x1d1e1f, dash: 0x3a3e41, desk: 0x6a6f72,
        fabricTex: makeConfetti('#4c4e57', ['#7a8fb8', '#b04848', '#d8c070', '#9aa0a8', '#3c7a58'], 1500, 5),
      },
      body: BODY,
      sectionBody: (sec) => (sec.id === 'middle' ? MID : {}),
      bands: (sec, side, B) => (sec.id === 'middle'
        ? [{ y0: B.skirtY, y1: 0.62, mat: 'paint3' }, { y0: 0.62, y1: B.beltY, mat: 'paint2' }]
        : [{ y0: B.skirtY, y1: 0.72, mat: 'paint3' }, { y0: 0.72, y1: B.beltY, mat: 'paint2' }]),
      upperMat: () => 'paint',
      windows: WINDOWS,
      roof: (sec, B) => {
        const sx = HW - (B.eaveY - B.beltY) * Math.tan(B.tumble);
        return [[sx, B.eaveY], [sx - 0.03, B.eaveY + 0.1], [sx - 0.1, B.eaveY + 0.2], [sx - 0.22, B.eaveY + 0.27], [sx - 0.42, B.eaveY + 0.31], [0, 3.12]];
      },
      ceilY: 3.0,
      underBoxes: (sec) => (sec.id === 'front' ? [[6.0, 7.4, 0.24, 1.6]] : sec.id === 'rear' ? [[2.0, 5.4, 0.24, 1.6]] : [[0.5, 1.7, 0.1, 1.8], [3.8, 5.0, 0.1, 1.8]]),
      panto: { type: 'diamond', sec: 'front', z: 4.2, baseY: 3.13, a: 1.12, b: 1.18 },
      gangway: { w: 1.2, h: 1.95 },
      doorMat: 'black',
      doorInner: 'black',
      doorBars: 'yellowRail',
      doorWindow: (B) => ({ bot: B.doorBot + 0.32, top: B.doorTop - 0.14, r: 0.05 }),
      jointMat: 'paint',
      cab: { wallZ: spec.cab.wallZ, deskZ: 0.62, seatZ: 1.38, eyeX: spec.cab.eye[0] },
      poles: (sec, m) => m.poles(sec),
      interiorExtra: (p, sec, B, m) => m.saloonExtra(p, sec, B),
    });
  }

  extraMaterials() {
    const S = THREE.MeshStandardMaterial;
    return {
      bumper: new S({ color: 0x141516, roughness: 0.7 }),
      coupler: new S({ color: 0x5c5f61, roughness: 0.6, metalness: 0.5 }),
      resistor: new S({ color: 0x8a8f92, roughness: 0.7, metalness: 0.3 }),
      cover: new S({ color: 0xd9dcdc, roughness: 0.55 }),
      chrome: new S({ color: 0xd9dde0, roughness: 0.15, metalness: 1.0 }),
      yellowRail: new S({ color: 0xf1c21b, roughness: 0.45 }),
      grilleBlack: new S({ color: 0x1a1b1c, roughness: 0.8 }),
      plinth: new S({ color: 0x8e9290, roughness: 0.7 }),
      amber: new S({ color: 0xe0761a, emissive: 0xff7a10, emissiveIntensity: 0.25 }),
    };
  }

  // ------------------------------------------------------------------ the cab front (photo 6)
  buildFront(p, sec, B) {
    const ws = 0.97;
    const { pts } = endOutline(HW, 0.26, 0.04, 2, [-ws, ws, -0.84, 0.84]);
    const toZ = (dz, y) => dz + rake(y);
    const S = this.endStrips(p, pts, toZ, true);
    const inG = (x) => Math.abs(x) < ws;
    S(0.3, B.skirtY, 'bumper');
    S(B.skirtY, 0.56, 'paint3');
    S(0.56, 0.95, 'paint2');
    S(0.95, 1.46, 'paint');
    S(1.46, 1.5, 'black');
    S(1.5, 2.66, 'screen', inG);
    S(1.5, 2.66, 'black', (x) => !inG(x));
    S(2.66, 2.74, 'black');
    S(2.74, B.eaveY, 'paint');
    this.endCap(p, pts, toZ, SWEEP_Z + 0.02, B, true);
    const inner = this.endStrips(p, pts, (dz, y) => dz + rake(y) + 0.045, false);
    inner(B.skirtY, 1.48, 'dash');
    inner(2.68, B.eaveY, 'dash');
    // the cab sides from the corner of the front to the side wall: white, orange rising diagonally into the blue,
    // the cab side window above (both sides)
    const zc = pts[0][1]; // set-back of the corner
    for (const side of [-1, 1]) {
      const x = side * HW;
      const quad = (z0, y0, z1, y1, z2, y2, z3, y3, mat) => {
        const g = new THREE.BufferGeometry();
        const P = [[x, y0, z0], [x, y1, z1], [x, y2, z2], [x, y3, z3]];
        const order = side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        g.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap((i) => P[i]), 3));
        g.computeVertexNormals();
        p.add(mat, g);
      };
      const zf = (y) => zc + rake(y);
      // bottom up: dark apron, white skirt, orange (its top rising from 0.95 at the corner to the belt), blue
      quad(zf(0.3), 0.3, zf(B.skirtY), B.skirtY, SWEEP_Z, B.skirtY, SWEEP_Z, 0.3, 'bumper');
      quad(zf(B.skirtY), B.skirtY, zf(0.72), 0.72, SWEEP_Z, 0.72, SWEEP_Z, B.skirtY, 'paint3');
      quad(zf(0.72), 0.72, zf(0.95), 0.95, SWEEP_Z, B.beltY, SWEEP_Z, 0.72, 'paint2');
      quad(zf(0.95), 0.95, zf(1.5), 1.5, SWEEP_Z, 1.5, SWEEP_Z, B.beltY, 'paint');
      quad(zf(1.5), 1.5, zf(2.66), 2.66, SWEEP_Z, 2.66, SWEEP_Z, 1.5, 'screen');
      quad(zf(2.66), 2.66, zf(B.eaveY), B.eaveY, SWEEP_Z, B.eaveY, SWEEP_Z, 2.66, 'paint');
      // the pillar between the windscreen and the cab side window
      p.add('black', box(0.03, 1.16, 0.05), M(x + side * 0.003, 2.08, zf(2.08) + 0.03).multiply(new THREE.Matrix4().makeRotationX(-Math.atan(RAKE / 1.28))));
    }
    // lamp housings: slanted black-rimmed plates with three round lamps each (photo 6)
    for (const sx of [-1, 1]) {
      const g = new THREE.Shape();
      const xs = [0.7, 0.98, 0.98, 0.78];
      const ys = [1.36, 1.34, 0.98, 1.0];
      g.moveTo(xs[0], ys[0]);
      for (let k = 1; k < 4; k++) g.lineTo(xs[k], ys[k]);
      g.closePath();
      const zPlate = (x) => 0.04 * (x / HW) ** 2 - 0.012;
      const o = extrudeMapped(g, 0.02, (u, v, w) => [sx * u, v, zPlate(u) + w], sx < 0);
      for (const geo of Object.values(o)) p.add('black', geo);
      const z = zPlate(0.86) - 0.006;
      p.add('headlamp', cyl(0.062, 0.02, 20).rotateX(Math.PI / 2), M(sx * 0.9, 1.1, z));
      p.add('chrome', cyl(0.072, 0.012, 20).rotateX(Math.PI / 2), M(sx * 0.9, 1.1, z + 0.008));
      p.add('headlamp', cyl(0.032, 0.02, 16).rotateX(Math.PI / 2), M(sx * 0.8, 1.06, z));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', cyl(0.03, 0.02, 16).rotateX(Math.PI / 2), M(sx * 0.8, 1.27, z));
      // mirrors on arms at the cab corners
      p.add('black', box(0.05, 0.05, 0.4), M(sx * (HW + 0.06), 2.4, 0.42));
      p.add('black', box(0.15, 0.3, 0.06, 0.02), M(sx * (HW + 0.2), 2.18, 0.24));
      p.add('black', box(0.2, 0.04, 0.04), M(sx * (HW + 0.11), 2.4, 0.24));
    }
    // inspection hatch under the windscreen, black bumper bar, coupler pocket and the step plate (photo 6)
    p.add('paint', box(0.62, 0.3, 0.01), M(0, 1.22, -0.004));
    p.add('rubber', box(0.64, 0.012, 0.012), M(0, 1.37, -0.006));
    p.add('rubber', box(0.64, 0.012, 0.012), M(0, 1.07, -0.006));
    p.add('bumper', box(1.45, 0.12, 0.12, 0.05), M(0, 0.66, -0.03));
    p.add('coupler', box(0.22, 0.14, 0.3), M(0, 0.4, -0.08));
    p.add('under', box(2.0, 0.08, 0.5), M(0, 0.3, 0.3));
    for (const sx of [-1, 1]) p.add('rubber', box(0.012, 0.13, 0.012), M(sx * 0.35, 0.49, -0.004));
  }

  // ------------------------------------------------------------------ the rear end (photo 8)
  buildRearEnd(p, sec, B) {
    const L = sec.length;
    const { pts } = endOutline(HW, 0.18, 0.03, 6, [-0.92, -0.88, 0.88, 0.92]);
    const S = this.endStrips(p, pts, (dz) => L - dz, false);
    const inG = (x) => Math.abs(x) < 0.88, inF = (x) => Math.abs(x) < 0.92;
    S(0.32, B.skirtY, 'bumper');
    S(B.skirtY, 0.72, 'paint3');
    S(0.72, B.beltY, 'paint2');
    S(B.beltY, 1.5, 'paint');
    S(1.5, 2.64, 'glass', inG);
    S(1.5, 2.64, 'rubber', (x) => inF(x) && !inG(x));
    S(1.5, 2.64, 'paint', (x) => !inF(x));
    S(2.64, B.eaveY, 'paint');
    this.endCap(p, pts, (dz) => L - dz, L - B.rearCorner - 0.02, B, false);
    // round red lamps in pairs near the corners, the bumper bar (photo 8)
    for (const sx of [-1, 1]) {
      const z = L - 0.03 * (0.85 / HW) ** 2 + 0.006;
      p.add('chrome', cyl(0.06, 0.015, 18).rotateX(Math.PI / 2), M(sx * 0.94, 1.08, z - 0.004));
      p.add('brake', cyl(0.05, 0.02, 18).rotateX(Math.PI / 2), M(sx * 0.94, 1.08, z + 0.004));
      p.add('chrome', cyl(0.06, 0.015, 18).rotateX(Math.PI / 2), M(sx * 0.8, 1.08, z - 0.004));
      p.add('tail', cyl(0.05, 0.02, 18).rotateX(Math.PI / 2), M(sx * 0.8, 1.08, z + 0.004));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.08, 0.05, 0.02), M(sx * 0.87, 1.22, z + 0.004));
    }
    p.add('bumper', box(1.6, 0.13, 0.12, 0.06), M(0, 0.78, L + 0.04));
    p.add('coupler', box(0.18, 0.12, 0.2), M(0, 0.42, L + 0.08));
  }

  // ------------------------------------------------------------------ body details
  decorate(p, sec, B) {
    const L = sec.length;
    if (sec.id === 'middle') {
      // the blue dipping into the orange in a V on both sides, cut at the door (photos 7, 8)
      const yb = (z) => {
        const e = Math.min(z, L - z);
        return e >= 1.0 ? 0.98 : B.beltY - ((B.beltY - 0.98) * e) / 1.0;
      };
      const door = this.spec.doors.find((d) => d.section === 'middle');
      for (const side of [-1, 1]) {
        const pos = [];
        const x = side * (HW + 0.003);
        for (let z = 0; z < L - 1e-6; z += 0.1) {
          const z1 = Math.min(L, z + 0.1);
          if (side > 0 && z1 > door.z0 - 0.04 && z < door.z1 + 0.04) continue;
          const a = [x, yb(z), z], b = [x, yb(z1), z1], c = [x, B.beltY, z1], d = [x, B.beltY, z];
          if (side > 0) pos.push(...a, ...d, ...b, ...b, ...d, ...c);
          else pos.push(...a, ...b, ...d, ...b, ...c, ...d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        p.add('paint', g);
      }
      // the folding ramp at the low-floor door and a wheelchair sign beside it
      const d = this.spec.doors.find((q) => q.section === 'middle');
      p.add('steel', box(0.04, 0.02, d.z1 - d.z0 - 0.1), M(HW - 0.03, B.doorBot + 0.01, (d.z0 + d.z1) / 2));
      // roof: long light grey cover
      p.add('cover', box(1.5, 0.18, L - 1.0, 0.06), M(0, 3.16, L / 2));
      return;
    }
    // small amber side marker lamps in the orange band, the louvred grille behind the cab on the left (photo 6)
    const marks = sec.id === 'front' ? [1.75, 4.25, 7.45, 9.9] : [0.25, 3.95, 6.7, 9.95];
    for (const side of [-1, 1]) for (const z of marks) {
      if (this.spec.doors.some((d) => d.section === sec.id && z > d.z0 - 0.1 && z < d.z1 + 0.1 && side > 0)) continue;
      p.add('amber', box(0.02, 0.04, 0.08), M(side * (HW + 0.01), 1.27, z));
    }
    if (sec.id === 'front') {
      p.add('grilleBlack', box(0.02, 0.22, 0.24), M(-(HW + 0.004), 1.16, 1.78));
      for (let k = 0; k < 5; k++) p.add('black', box(0.012, 0.012, 0.22), M(-(HW + 0.014), 1.08 + k * 0.04, 1.78));
      // roof: air-conditioning unit over the cab, the converter box and the resistor grids behind the pantograph
      p.add('cover', box(1.4, 0.26, 1.25, 0.06), M(0, 3.24, 1.35));
      for (let k = 0; k < 6; k++) p.add('black', box(1.2, 0.012, 0.03), M(0, 3.375, 0.9 + k * 0.18));
      p.add('cover', box(1.25, 0.3, 2.6, 0.05), M(0, 3.26, 7.6));
      p.add('resistor', box(0.9, 0.16, 1.2), M(0, 3.2, 9.5));
      p.add('steel', cyl(0.03, 2.4, 6).rotateX(Math.PI / 2), M(0.35, 3.18, 5.9));
      // black box with the line number on the roof at the joint (photo 7)
      p.add('black', box(0.5, 0.18, 0.3), M(0, 3.2, 9.9));
    } else {
      p.add('cover', box(1.5, 0.2, 6.2, 0.06), M(0, 3.18, 4.6));
      p.add('resistor', box(0.8, 0.16, 1.1), M(0, 3.2, 8.6));
    }
  }

  /** Poles: by the seat rows on the aisle side, at the doors (validators, stop buttons). */
  poles(sec) {
    const out = [];
    if (sec.id === 'middle') {
      for (const z of [0.15, 1.25, 4.3, 5.37]) out.push([z, 0.45, true, false], [z, -0.45, false, false]);
      out.push([2.0, 0.6, true, true], [3.35, 0.6, true, false]);
      return out;
    }
    const z0 = sec.id === 'front' ? 2.2 : 0.6;
    for (let z = z0; z < sec.length - 0.4; z += 1.6) out.push([z, -0.38, true, false]);
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) out.push([d.z0 - 0.1, 0.55, true, true], [d.z1 + 0.1, 0.55, true, false]);
    return out;
  }

  /** Seat plinths along the windows, orange railings round the steps of the centre section. */
  saloonExtra(p, sec, B) {
    const xi = B.hw - B.wall - 0.01;
    if (sec.id === 'middle') {
      const L = sec.length, hi = this.spec.dims.floorY;
      for (const [za, zb] of [[0.25, 1.25], [L - 1.25, L - 0.25]]) {
        for (const sx of [-1, 1]) {
          p.add('pole', cyl(0.018, zb - za, 8).rotateX(Math.PI / 2), M(sx * 0.45, hi + 0.85, (za + zb) / 2));
          p.add('plinth', box(xi - 0.47, hi - 0.3, zb - za), M(sx * (0.47 + (xi - 0.47) / 2), (hi + 0.3) / 2, (za + zb) / 2));
        }
      }
      return;
    }
    const fy = this.spec.dims.floorY;
    const seats = this.spec.layout.seats.filter((q) => q.sec === sec.id);
    for (const sx of [-1, 1]) {
      const zs = seats.filter((q) => Math.sign(q.x) === sx).map((q) => q.z);
      if (!zs.length) continue;
      const z0 = Math.min(...zs) - 0.35, z1 = Math.max(...zs) + 0.35;
      // continuous runs only (split at the doors)
      const runs = [];
      let a = z0;
      for (const d of this.spec.doors.filter((q) => q.section === sec.id && sx > 0).sort((u, v) => u.z0 - v.z0)) {
        if (d.z0 > a && d.z0 < z1) { runs.push([a, d.z0 - 0.1]); a = d.z1 + 0.1; }
      }
      runs.push([a, z1]);
      for (const [za, zb] of runs) if (zb - za > 0.3) p.add('plinth', box(0.5, 0.1, zb - za), M(sx * (xi - 0.25), fy + 0.05, (za + zb) / 2));
    }
  }

  // ------------------------------------------------------------------ signs
  buildSigns() {
    const f = this.front, r = this.rear;
    const L = this.spec.sections[this.spec.sections.length - 1].length;
    // yellow-green LED destination display behind the top of the windscreen (photos 6, 7)
    const led = new LedSign(128, 16, 8);
    led.on = '#d2e04a';
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), new THREE.MeshBasicMaterial({ map: led.texture, color: new THREE.Color(1.7, 1.7, 1.7) }));
    lm.position.set(0, 2.54, 0.02 + rake(2.54) + 0.08);
    lm.rotation.y = Math.PI;
    lm.rotation.x = -0.05;
    f.add(lm);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.25, 0.04), this.mats.black);
    lb.position.set(0, 2.54, lm.position.z + 0.03);
    f.add(lb);
    // side LED line in a window of each section, the number box in the rear window (photos 7, 8)
    const sideLed = new LedSign(64, 12, 8);
    sideLed.on = '#d2e04a';
    const sm = new THREE.MeshBasicMaterial({ map: sideLed.texture, color: new THREE.Color(1.6, 1.6, 1.6) });
    for (const [secId, z] of [['front', 4.35], ['rear', 1.0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.094), sm);
      m.position.set(HW - 0.075, 2.38, z);
      m.rotation.y = Math.PI / 2;
      this[secId].add(m);
    }
    const nb = makeNumberBox();
    const nm = new THREE.MeshBasicMaterial({ map: nb.tex });
    const box2 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.27), nm);
    box2.position.set(0.0, 2.43, L - 0.07);
    r.add(box2);
    this.signMats = [nm];
    this.signs.front = { showRoute: (n, t) => { led.showRoute(n, t); nb.draw(n); } };
    this.signs.side = { showRoute: (n, t) => sideLed.showRoute(n, t) };
    this.signs.rear = this.signs.side;
    // fleet numbers: black on the orange at the front (centre) and the rear (right), on the cab sides
    const num = makeNumberDecal(this.fleet, { color: '#141414' });
    const dm = this.mats.decal.clone();
    dm.map = num;
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.16), dm);
    fr.position.set(0, 0.82, -0.005);
    fr.rotation.y = Math.PI;
    f.add(fr);
    const rr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.155), dm);
    rr.position.set(0.42, 1.3, L + 0.004);
    r.add(rr);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), dm);
      m.position.set(sx * (HW + 0.006), 2.3, sx > 0 ? 9.6 : 0.95);
      m.rotation.y = sx * Math.PI / 2;
      this.middle.add(m);
    }
    // wheelchair sign beside the low-floor door
    const wc = makeLettering([{ text: '♿', size: 96, x: 64, y: 100, align: 'center', weight: 400 }], { w: 128, h: 128, color: '#ffffff' });
    const wm = this.mats.decal.clone();
    wm.map = wc;
    const d3 = this.spec.doors.find((q) => q.section === 'middle');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), wm);
    sign.position.set(HW + 0.007, 1.6, d3.z1 + 0.16);
    sign.rotation.y = Math.PI / 2;
    this.middle.add(sign);
    const blue = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({ color: 0x1d5fb4 }));
    blue.position.set(HW + 0.0055, 1.6, d3.z1 + 0.16);
    blue.rotation.y = Math.PI / 2;
    this.middle.add(blue);
    this.interiorSign(this.spec.sections[0], this.spec.cab.wallZ + 0.08, 2.45);
    // wiper on the left of the windscreen (photo 6)
    const w = new THREE.Group();
    w.position.set(-0.7, 1.56, rake(1.56) - 0.012);
    w.rotation.x = Math.atan(RAKE / 1.28);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 0.015), this.mats.black);
    arm.position.x = 0.47;
    w.add(arm);
    f.add(w);
    this.wiper = w;
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
  }
}

// PESA Swing 122NaSF, Sofia livery (photos 1-5 only: data/research/line7/README.md). Five sections on three
// fixed bogies, a cab at each end, doors on both sides. Read from the photos: the rounded cab with the large
// panoramic windscreen wrapping round to the cab side windows, the grey hood with its ventilation grille above
// it, the yellow front panel with two rows of three round lamps on a chrome line and the black fleet number,
// the dark grey bumper and skirt; on the sides the light grey roof and skirt, the blue window band with the
// yellow line under the windows, black-framed full-height glazed plug doors, the arched louvred covers over the
// bogies, light grey bellows; "SWING Sofia" and "pesa" lettered on the windows behind the first door, orange
// LED destination displays. Inside (photos 4, 5): orange poles, ceiling rails and hanging loops, dark blue
// accents along the ceiling, light grey walls and ceiling, blue-grey moquette on light grey shells, seats over
// the wheels on podiums, glass screens with white diagonal bands beside the doors, information screens.
import * as THREE from 'three';
import { M, box, cyl } from '../BusGeom.js';
import { TramModel, extrudeMapped, roundRect } from './TramModel.js';
import { makeNumberDecal, makeConfetti, makeStripedGlass, makeLettering, makeInfoScreen, makeGrille } from './TramTextures.js';
import { LedSign } from '../LedSign.js';

const HW = 1.15;
const BLUE = 0x1f86d0, YELLOW = 0xf3a50b, SILVER = 0xc9cdd0, ROOF = 0x8f9498;
const BODY = {
  hw: HW, skirtY: 0.3, beltY: 1.26, winBot: 1.3, winTop: 2.45, doorBot: 0.36, doorTop: 2.4, eaveY: 2.78,
  tumble: 0.035, wall: 0.05, frontCorner: 1.42, rearCorner: 1.42,
};
const CAB = 1.9; // cab length behind each end (the cab wall)
const W = { r: 0.05 };
const CABWIN = { glass: 'screen', bot: 1.3, top: 2.5, r: 0.05 };

// windows [z0, z1, opts] per section; the same on both sides (photos 2, 3; positions estimated)
const sides = (list) => ({ right: list, left: list });
const WINDOWS = {
  front: sides([[1.44, 1.94, CABWIN], [3.0, 4.85, W], [4.95, 6.85, W]]),
  second: sides([[1.68, 2.76, W], [2.84, 3.92, W]]),
  middle: sides([[0.15, 1.58, W], [1.64, 3.07, W]]),
  fourth: sides([[1.68, 2.76, W], [2.84, 3.92, W]]),
  rear: sides([[0.1, 2.0, W], [2.1, 3.95, W], [5.01, 5.51, CABWIN]]),
};

// roof: light grey from the eave, a rounded shoulder up to the equipment covers, flat top (half profile)
const SX = HW - (BODY.eaveY - BODY.beltY) * Math.tan(BODY.tumble);
const ROOF_PROFILE = [[SX, 2.78], [SX - 0.02, 2.86], [SX - 0.07, 2.96], [SX - 0.15, 3.06], [SX - 0.27, 3.16], [SX - 0.38, 3.24],
  [SX - 0.44, 3.3], [SX - 0.5, 3.37], [SX - 0.6, 3.4], [0, 3.42]];

/** Half width of the body at height y (side wall, then the roof profile). */
function halfWidth(y) {
  if (y <= BODY.beltY) return HW;
  if (y <= BODY.eaveY) return HW - (y - BODY.beltY) * Math.tan(BODY.tumble);
  for (let i = 0; i + 1 < ROOF_PROFILE.length; i++) {
    const [x0, y0] = ROOF_PROFILE[i], [x1, y1] = ROOF_PROFILE[i + 1];
    if (y >= y0 && y <= y1) return x0 + ((x1 - x0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0.02;
}

// the cab nose: height y and the set-back zc of its middle from the end (photos 1-3, estimated)
const NOSE = [
  [0.3, 0.1], [0.42, 0.0], [0.62, 0.0], [0.76, 0.03], [0.8, 0.06], [1.05, 0.08], [1.28, 0.12], [1.34, 0.14],
  [1.8, 0.24], [2.3, 0.38], [2.7, 0.52], [2.78, 0.56], [2.95, 0.68], [3.1, 0.85], [3.22, 1.02], [3.32, 1.2], [3.4, 1.38],
].map(([y, zc]) => ({ y, zc, hw: halfWidth(y) }));
const EX = 2.6;

/** Set-back of the nose surface from the end at (x, y). */
function noseZ(x, y) {
  let k = 0;
  while (k + 2 < NOSE.length && NOSE[k + 1].y < y) k++;
  const a = NOSE[k], b = NOSE[k + 1];
  const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
  const zc = a.zc + (b.zc - a.zc) * t, hw = a.hw + (b.hw - a.hw) * t;
  const u = Math.min(1, Math.abs(x) / hw);
  return BODY.frontCorner - (BODY.frontCorner - zc) * Math.sqrt(Math.max(0, 1 - Math.pow(u, EX)));
}

export class PesaModel extends TramModel {
  constructor(spec, opts = {}) {
    const look = spec.look;
    super(spec, opts, {
      colors: {
        paint: look.blue ?? BLUE, paint2: look.yellow ?? YELLOW, paint3: look.silver ?? SILVER, roof: ROOF, seat: 0x3c4a63,
        seatShell: 0xc9cdd1, pole: look.pole ?? 0xf06a14, polePaint: true, wall: 0xdadcda, ceiling: 0xe7e8e6,
        floorKind: 'speckle', floorCss: '#7c8896', lowFloorCss: '#7c8896', bellows: 0xa3a7aa, dash: 0x2e3236, desk: 0x5b6064,
        fabricTex: makeConfetti('#3b4659', ['#d8a43a', '#c9504a', '#5aa0d8', '#e8e2d0'], 900, 11),
      },
      body: BODY,
      // the cab sides between the nose and the first door carry the front's yellow and dark grey (photo 1)
      bands: (sec, side, B, z0, z1) => {
        const L = sec.length;
        const cab = (sec.id === 'front' && z1 <= 2.0) || (sec.id === 'rear' && z0 >= L - 2.0);
        if (cab) return [{ y0: B.skirtY, y1: 0.78, mat: 'bumper' }, { y0: 0.78, y1: B.beltY, mat: 'paint2' }];
        return [{ y0: B.skirtY, y1: 0.98, mat: 'paint3' }, { y0: 0.98, y1: B.beltY, mat: 'paint2' }];
      },
      upperMat: () => 'paint',
      windows: WINDOWS,
      roof: () => ROOF_PROFILE,
      roofMat: 'roof',
      gutterMat: 'roof',
      ceilY: 2.68, // 2.3 m above the floor
      underBoxes: (sec) => (sec.id === 'second' || sec.id === 'fourth' ? [[0.4, 5.2, 0.06, 1.9]] : []),
      panto: { type: 'single', sec: 'front', z: 4.75, baseY: 3.42, a: 1.38, b: 1.6, headZ: -0.2 },
      doorSwing: 'plug',
      doorMat: 'black',
      doorInner: 'black',
      doorWindow: (B) => ({ bot: B.doorBot + 0.16, top: B.doorTop - 0.1, r: 0.05 }),
      gangway: { w: 1.45, h: 2.12 },
      jointMat: 'roof',
      cab: { wallZ: CAB, deskZ: 0.98, seatZ: 1.55, eyeX: spec.cab.eye[0], extra: (p, sec, B, fy, m) => m.cabExtra(p, sec, B, fy, false) },
      poles: (sec, m) => m.poles(sec),
      interiorExtra: (p, sec, B, m) => m.saloonExtra(p, sec, B),
    });
  }

  extraMaterials() {
    const S = THREE.MeshStandardMaterial;
    const sg = new S({ color: 0xffffff, map: makeStripedGlass(), transparent: true, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    sg.userData.noOcclusion = true;
    return {
      bumper: new THREE.MeshPhysicalMaterial({ color: 0x2c2f33, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
      chrome: new S({ color: 0xdfe3e6, roughness: 0.12, metalness: 1.0 }),
      grille: new S({ color: 0xffffff, map: makeGrille('#7f8488', 12), roughness: 0.7 }),
      louvre: new S({ color: 0x3a3d40, roughness: 0.8 }),
      accent: new S({ color: 0x2b3c86, roughness: 0.5 }),
      podium: new S({ color: 0xbfc3c6, roughness: 0.55 }),
      stripedGlass: sg,
      lens: new S({ color: 0xf4f7fa, roughness: 0.05, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.08 }),
      btnOpen: new S({ color: 0xf07a12, emissive: 0xff7a10, emissiveIntensity: 0.4 }),
      orange: new S({ color: 0xf06a14, roughness: 0.55 }),
    };
  }

  // ------------------------------------------------------------------ the cab ends
  /** The lofted nose at the front end (or mirrored at the rear end of a section of length L). */
  nose(p, atRear = false, L = 0) {
    const mat = (x, y, u) => {
      if (y < 0.78) return 'bumper';
      if (y < 1.3) return 'paint2';
      if (y < 1.36) return 'black';
      if (y < 2.7) return u < 0.88 ? 'screen' : 'black';
      if (y < 2.84) return 'black';
      if (y > 2.98 && y < 3.24 && u < 0.3) return 'grille';
      return 'roof';
    };
    this.loftEnd(p, NOSE, BODY.frontCorner, mat, { ex: EX, atRear, L });
    // the lining inside the cab (the glass is double sided)
    const inner = NOSE.map((lv) => ({ y: lv.y, zc: lv.zc + 0.045, hw: Math.max(0.02, lv.hw - 0.045) }));
    this.loftEnd(p, inner, BODY.frontCorner, (x, y, u) => (y >= 1.32 && y < 2.72 && u < 0.88 ? null : 'dash'), { ex: EX, atRear, L, flip: true });
    const Z = (x, y) => (atRear ? L - noseZ(x, y) : noseZ(x, y));
    const out = atRear ? 1 : -1; // outwards along z
    // lamps: three round lamps on a chrome line each side (photo 1); at the rear end two of them are red
    for (const sx of [-1, 1]) {
      const bar = box(0.44, 0.012, 0.012);
      p.add('chrome', bar, M(sx * 0.64, 1.06, Z(sx * 0.64, 1.06) + out * 0.012));
      [0.47, 0.62, 0.78].forEach((ax, k) => {
        const x = sx * ax, z = Z(x, 1.06);
        p.add('chrome', cyl(0.062, 0.03, 20).rotateX(Math.PI / 2), M(x, 1.06, z + out * 0.006));
        const lamp = !atRear ? (k < 2 ? 'headlamp' : 'marker') : (k === 0 ? 'brake' : k === 1 ? 'tail' : 'marker');
        p.add(lamp, cyl(0.048, 0.02, 20).rotateX(Math.PI / 2), M(x, 1.06, z + out * 0.02));
      });
      // indicator at the corner, small fog / signal lamps in the bumper, the bumper's lower edge
      const xi = sx * 1.02;
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.05, 0.12, 0.05), M(xi, 1.1, Z(xi, 1.1) + out * 0.01));
      const xf = sx * 0.78;
      p.add(atRear ? 'tail' : 'headlamp', box(0.12, 0.035, 0.03), M(xf, 0.48, Z(xf, 0.48) + out * 0.012));
    }
    // coupler cover and the step plate under the bumper
    p.add('black', box(0.42, 0.18, 0.02), M(0, 0.52, Z(0, 0.52) + out * 0.006));
    // mirror on the cab's right-hand side (the front cab: the tram's right, the rear cab: the tram's left)
    const ms = atRear ? -1 : 1;
    const mz = Z(ms * 1.02, 2.5);
    p.add('black', box(0.36, 0.04, 0.05), M(ms * 1.2, 2.56, mz + out * 0.1));
    p.add('black', box(0.04, 0.32, 0.05), M(ms * 1.37, 2.42, mz + out * 0.12));
    p.add('black', box(0.12, 0.34, 0.06, 0.02), M(ms * 1.4, 2.2, mz + out * 0.12));
    p.add('glass', box(0.1, 0.3, 0.005), M(ms * 1.4, 2.2, mz + out * 0.088 - out * 0.0));
  }

  buildFront(p, sec, B) {
    this.nose(p, false);
  }

  /** The rear end is a second cab (photos 2, 3: the mirror and windscreen at the far end). */
  buildRearEnd(p, sec, B) {
    const L = sec.length;
    this.nose(p, true, L);
    // the rear cab behind its wall: desk, seat, the closed door
    this.cabExtra(p, sec, B, this.spec.dims.floorY, true, L);
  }

  /** Cab fittings; rear: the second cab (static) at the far end of the last section. */
  cabExtra(p, sec, B, fy, rear = false, L = 0) {
    const zf = (z) => (rear ? L - z : z);
    const xi = B.hw - B.wall - 0.01;
    if (rear) {
      // back wall with the cab door, desk, seat
      p.add('wall', box(xi * 2 - 0.8, 2.68 - fy, 0.04), M(0.4, (2.68 + fy) / 2, zf(CAB)));
      p.add('wall', box(0.8, 0.9, 0.04), M(-xi + 0.4, fy + 0.45, zf(CAB)));
      p.add('glass', box(0.7, 0.85, 0.01), M(-xi + 0.42, fy + 1.4, zf(CAB)));
      p.add('wall', box(0.8, 2.68 - fy - 1.85, 0.04), M(-xi + 0.4, (2.68 + fy + 1.85) / 2, zf(CAB)));
      p.add('desk', box(1.7, 0.72, 0.45), M(0, fy + 0.36, zf(0.98)));
      p.add('seat', box(0.5, 0.1, 0.46, 0.03), M(0.12, fy + 0.5, zf(1.55)));
      p.add('seat', box(0.5, 0.62, 0.1, 0.03), M(0.12, fy + 0.86, zf(1.8)));
      p.add('floor', box(xi * 2, 0.04, CAB - 0.2), M(0, fy - 0.02, zf((CAB + 0.2) / 2)));
    }
    // the console: two displays either side of the controller, the sun blind (photo 1 shows the cab)
    for (const sx of [-1, 1]) {
      const d = box(0.3, 0.2, 0.03);
      d.rotateX(rear ? 0.5 : -0.5);
      p.add('screen', d, M(sx * 0.42 + (rear ? 0.12 : -0.12), fy + 0.93, zf(0.86)));
    }
    p.add('dash', box(1.5, 0.04, 0.3), M(0, 2.72, zf(0.75)));
    p.add('black', cyl(0.03, 1.2, 10).rotateZ(Math.PI / 2), M(0, 2.66, zf(0.66)));
  }

  // ------------------------------------------------------------------ body details
  decorate(p, sec, B) {
    const L = sec.length;
    const bogie = sec.supports.find((q) => q.kind === 'bogie');
    for (const side of [-1, 1]) {
      const x = side * (HW + 0.026);
      if (bogie) {
        // arched cover over the bogie with horizontal louvres (photos 1-3)
        const zc = bogie.d - sec.d0, w = 1.28;
        const sh = roundRect(new THREE.Shape(), zc - w, 0.14, zc + w, 1.0, 0.5);
        const o = extrudeMapped(sh, 0.03, (u, v, wv) => [side * (HW + 0.03 - wv), v, u], side < 0);
        for (const g of Object.values(o)) p.add('paint3', g);
        for (let k = 0; k < 7; k++) p.add('louvre', box(0.012, 0.022, 0.62), M(side * (HW + 0.034), 0.48 + k * 0.055, zc + 0.35));
        // the lower edge of the cover: dark rubber
        p.add('rubber', box(0.04, 0.03, w * 2), M(side * (HW + 0.02), 0.15, zc));
      }
      // door open buttons beside each door (photo 1), both sides
      for (const d of this.spec.doors.filter((q) => q.section === sec.id)) {
        p.add('btnOpen', cyl(0.028, 0.02, 12).rotateZ(Math.PI / 2), M(x + side * 0.004, 1.18, side > 0 ? d.z1 + 0.09 : d.z0 - 0.09));
      }
      // light grey skirt below the band runs on below the doors
      p.add('rubber', box(0.02, 0.025, L - 0.1), M(side * (HW + 0.004), 0.3, L / 2));
    }
    // roof: louvred covers along the equipment fairing, antennae on the cab section, air-conditioning units
    for (const sx of [-1, 1]) p.add('grille', box(0.02, 0.12, L * 0.5), M(sx * (SX - 0.46), 3.3, L / 2));
    if (sec.id === 'front') {
      p.add('black', cyl(0.012, 0.25, 6), M(0.3, 3.55, 2.4));
      p.add('steel', box(0.5, 0.06, 0.9), M(-0.25, 3.45, 3.2));
    }
    if (sec.id === 'second' || sec.id === 'fourth') {
      p.add('roof', box(1.3, 0.08, 2.0, 0.04), M(0, 3.44, L / 2));
      p.add('grille', box(1.1, 0.02, 1.6), M(0, 3.485, L / 2));
    }
  }

  /** Poles: at the seat rows on the aisle side, at the door screens (both sides), validators and buttons. */
  poles(sec) {
    const out = [];
    const xi = HW - BODY.wall - 0.01;
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) {
      for (const sx of [-1, 1]) {
        out.push([d.z0 - 0.08, sx * (xi - 0.58), true, sx > 0 && d.leaves === 2]);
        out.push([d.z1 + 0.08, sx * (xi - 0.58), sx > 0, false]);
      }
    }
    const seats = this.spec.layout.seats.filter((q) => q.sec === sec.id && q.x < 0);
    const rows = [...new Set(seats.map((q) => Math.round(q.z * 10) / 10))];
    for (const z of rows) if (rows.indexOf(z) % 2 === 0) out.push([z + 0.42, -0.16, true, false]);
    if (sec.id === 'middle') out.push([1.6, 0.36, true, true]);
    return out;
  }

  /** Podiums over the wheels, hanging loops, ceiling accents, door screens, info screens. */
  saloonExtra(p, sec, B) {
    const fy = this.spec.dims.floorY, pod = fy + 0.3;
    const xi = B.hw - B.wall - 0.01;
    for (const z of this.spec.layout.podiums.filter((q) => q.sec === sec.id)) {
      const len = z.z1 - z.z0, zc = (z.z0 + z.z1) / 2;
      for (const [x0, x1] of [[-xi, -0.18], [0.4, xi]]) {
        p.add('podium', box(x1 - x0, 0.3, len), M((x0 + x1) / 2, fy + 0.15, zc));
        p.add('floor', box(x1 - x0, 0.012, len), M((x0 + x1) / 2, pod + 0.006, zc));
        const edge = x0 < 0 ? x1 : x0;
        p.add('stepEdge', box(0.04, 0.015, len), M(edge, pod + 0.008, zc));
      }
    }
    const ceil = (this.cfg.ceilY ?? B.eaveY - 0.12) - 0.02;
    const zs = sec.id === 'front' ? CAB + 0.1 : 0.15, ze = sec.id === 'rear' ? sec.length - CAB - 0.1 : sec.length - 0.15;
    // hanging loops along both ceiling rails (photos 4, 5)
    const railY = ceil - 0.28;
    for (const sx of [-1, 1]) {
      const rx = sx * (xi - 0.38);
      for (let z = zs + 0.3; z < ze - 0.2; z += 0.42) {
        p.add('orange', box(0.018, 0.12, 0.008), M(rx, railY - 0.08, z));
        const loop = new THREE.TorusGeometry(0.055, 0.009, 4, 12);
        loop.rotateY(Math.PI / 2);
        p.add('orange', loop, M(rx, railY - 0.19, z));
      }
      // dark blue accent along the top of the side wall and the ceiling cove (photo 4)
      p.add('accent', box(0.04, 0.09, ze - zs), M(sx * (xi - 0.02), B.winTop + 0.1, (zs + ze) / 2));
    }
    // glass screens with white bands beside the doors (photo 5)
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) {
      for (const sx of [-1, 1]) for (const z of [d.z0 - 0.08, d.z1 + 0.08]) {
        p.add('stripedGlass', box(0.54, 1.05, 0.012), M(sx * (xi - 0.3), fy + 0.72, z));
        p.add('pole', box(0.54, 0.025, 0.025), M(sx * (xi - 0.3), fy + 1.26, z));
      }
    }
    // wheelchair / pram spaces opposite the seat bays of the suspended sections: a padded backrest on the wall
    if (sec.id === 'second' || sec.id === 'fourth') {
      p.add('seatShell', box(0.08, 0.5, 0.9), M(xi - 0.05, fy + 0.95, 3.0));
      p.add('pole', cyl(0.016, 0.9, 8).rotateX(Math.PI / 2), M(xi - 0.12, fy + 0.86, 3.0));
    }
  }

  // ------------------------------------------------------------------ signs
  buildSigns() {
    const f = this.front, r = this.rear;
    const L = this.spec.sections[this.spec.sections.length - 1].length;
    const mkLed = (cols, rows, w, h, parent, x, y, z, ry) => {
      const s = new LedSign(cols, rows, 8);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.texture, color: new THREE.Color(1.8, 1.8, 1.8) }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      parent.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), this.mats.black);
      back.position.set(x, y, z + (ry === Math.PI ? 0.025 : ry === 0 ? -0.025 : 0));
      if (ry !== 0 && ry !== Math.PI) back.position.x = x - Math.sign(x) * 0.025;
      back.rotation.y = ry;
      parent.add(back);
      return s;
    };
    // destination displays behind the top of the windscreens (photos 2, 3), the small side displays (photo 3)
    const zt = noseZ(0, 2.56) + 0.07;
    const front = mkLed(128, 16, 1.46, 0.18, f, 0, 2.56, zt, Math.PI);
    const rearS = mkLed(128, 16, 1.46, 0.18, r, 0, 2.56, L - zt, 0);
    const sides = [];
    for (const [secId, z] of [['second', 1.85], ['fourth', 3.0], ['front', 6.2]]) {
      for (const sx of [-1, 1]) sides.push(mkLed(64, 12, 0.46, 0.086, this[secId], sx * (HW - 0.09), 2.28, z, sx * Math.PI / 2));
    }
    this.signs.front = { showRoute: (n, t) => { front.showRoute(n, t); rearS.showRoute(n, t); } };
    this.signs.side = { showRoute: (n, t) => { for (const s of sides) s.showRoute(n, t); } };
    this.signs.rear = this.signs.side;
    // fleet number black on the yellow front panel at both ends (photos 1, 3), the maker's name under it
    const num = makeNumberDecal(this.fleet, { color: '#141414' });
    const dm = this.mats.decal.clone();
    dm.map = num;
    const logo = makeLettering([{ text: 'pesa', size: 64, x: 128, y: 84, italic: true, align: 'center', weight: 600 }], { w: 256, h: 128, color: '#3b3f44' });
    const lm = this.mats.decal.clone();
    lm.map = logo;
    for (const [grp, z, ry] of [[f, noseZ(0, 1.06) - 0.004, Math.PI], [r, L - noseZ(0, 1.06) + 0.004, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), dm);
      m.position.set(0, 1.08, z);
      m.rotation.y = ry;
      grp.add(m);
      const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), lm);
      lg.position.set(0, 0.91, z + (ry === 0 ? 0.002 : -0.002));
      lg.rotation.y = ry;
      grp.add(lg);
    }
    // "SWING Sofia" and "pesa" lettered on the windows behind the first door, both sides (photos 1-3)
    const swing = makeLettering([{ text: 'SWING', size: 86, x: 20, y: 92, weight: 800, italic: true }, { text: 'Sofia', size: 40, x: 180, y: 138, weight: 600 }], { w: 512, h: 160 });
    const pesa = makeLettering([{ text: 'pesa', size: 92, x: 256, y: 104, weight: 600, italic: true, align: 'center' }], { w: 512, h: 160 });
    const wm1 = this.mats.decal.clone(), wm2 = this.mats.decal.clone();
    wm1.map = swing; wm2.map = pesa;
    wm1.opacity = wm2.opacity = 0.85;
    for (const sx of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2), wm1);
      a.position.set(sx * (HW - 0.012), 1.6, 3.9);
      a.rotation.y = sx * Math.PI / 2;
      f.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2), wm2);
      b.position.set(sx * (HW - 0.012), 1.58, 5.9);
      b.rotation.y = sx * Math.PI / 2;
      f.add(b);
    }
    // the interior LED line on the cab wall and the information screens (photo 4)
    this.interiorSign(this.spec.sections[0], CAB + 0.08, 2.5);
    const info = makeInfoScreen();
    const im = new THREE.MeshBasicMaterial({ map: info.tex, color: new THREE.Color(1.15, 1.15, 1.15) });
    for (const [secId, z] of [['second', 0.3], ['middle', 0.25], ['fourth', 0.3], ['rear', 0.3]]) {
      const g = this[secId];
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28), im);
      scr.position.set(0, 2.38, z);
      g.add(scr);
      const hous = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.06), this.mats.wall);
      hous.position.set(0, 2.38, z - 0.032);
      g.add(hous);
      const hang = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), this.mats.steel);
      hang.position.set(0, 2.6, z - 0.03);
      g.add(hang);
    }
    this.info = info;
    this.signMats = [];
    // the wiper parked across the bottom of the windscreen
    const w = new THREE.Group();
    w.position.set(-0.05, 1.42, noseZ(0, 1.42) - 0.012);
    w.rotation.x = 0.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.022, 0.015), this.mats.black);
    arm.position.x = -0.5;
    w.add(arm);
    f.add(w);
    this.wiper = w;
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.routeNo = number;
  }

  setInteriorText(a, b = null) {
    super.setInteriorText(a, b);
    if (this.info && (b || a) !== this.infoKey) {
      this.infoKey = b || a;
      this.info.draw(this.routeNo || '', [b || a]);
    }
  }
}

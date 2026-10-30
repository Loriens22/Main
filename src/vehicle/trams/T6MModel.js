// T6M-700, Sofia livery blue / orange / white (photos 7-10 only: data/research/ref_photos/trams/ref07-10).
// Two equal box sections on three bogies. Read from the photos: blue window band and roof, orange lower body,
// white skirt, the flat front with a large raked windscreen and the line number box at its top, round
// headlamps at the corners of the orange band, the black fleet number, a black bumper bar; side windows with
// small top hoppers; four double folding doors with two windows per panel; diamond pantograph on the front
// section; inside, single grey plastic seats, orange poles, grey walls and floor, round fan heaters.
import * as THREE from 'three';
import { M, box, cyl } from '../BusGeom.js';
import { TramModel, extrudeMapped } from './TramModel.js';
import { endOutline } from './SchindlerModel.js';
import { makeNumberBox, makeRouteCard, makeNumberDecal } from './TramTextures.js';

const HW = 1.125;
const BLUE = 0x3f9fd8, ORANGE = 0xf29a1d, WHITE = 0xe9e8e2;
const BODY = {
  hw: HW, skirtY: 0.42, beltY: 1.45, winBot: 1.5, winTop: 2.56, doorBot: 0.4, doorTop: 2.5, eaveY: 2.8,
  tumble: 0.02, wall: 0.05, frontCorner: 0.2, rearCorner: 0.2,
};
const W = { hopper: 0.36, r: 0.05 };

// windows: front section right side between the doors, both sections left side (photos 8, 10; estimated)
const WINDOWS = {
  front: {
    left: [[0.32, 1.7, { r: 0.05 }], [1.85, 3.15, W], [3.25, 4.55, W], [4.65, 5.95, W], [6.05, 7.35, W], [7.45, 8.75, W], [8.85, 9.95, W]],
    right: [[0.32, 1.7, { r: 0.05 }], [3.35, 4.6, W], [4.7, 5.95, W], [6.05, 7.1, W], [8.65, 9.95, W]],
  },
  rear: {
    left: [[0.25, 1.45, W], [1.55, 2.85, W], [2.95, 4.25, W], [4.35, 5.65, W], [5.75, 7.05, W], [7.15, 8.45, W], [8.55, 9.85, W]],
    right: [[0.25, 1.6, W], [3.2, 4.45, W], [4.55, 5.8, W], [5.9, 7.1, W], [8.7, 9.85, W]],
  },
};

export class T6MModel extends TramModel {
  constructor(spec, opts = {}) {
    super(spec, opts, {
      colors: {
        paint: BLUE, paint2: ORANGE, paint3: WHITE, roof: BLUE, seat: 0x60656b, seatShell: 0x5a5f65, pole: 0xf0a020, polePaint: true,
        wall: 0xb9bcb8, ceiling: 0xdcddd8, floorKind: 'speckle', floorCss: '#5b5f60', lowFloorCss: '#5b5f60', bellows: 0x1f2021,
        dash: 0x3b3f42, desk: 0x6d7275,
      },
      plasticSeats: true,
      body: BODY,
      bands: (sec, side, B) => [{ y0: B.skirtY, y1: 0.72, mat: 'paint3' }, { y0: 0.72, y1: B.beltY, mat: 'paint2' }],
      upperMat: () => 'paint',
      windows: WINDOWS,
      roof: (sec, B) => {
        const sx = HW - (B.eaveY - B.beltY) * Math.tan(B.tumble);
        return [[sx, B.eaveY], [sx - 0.03, B.eaveY + 0.1], [sx - 0.1, B.eaveY + 0.2], [sx - 0.22, B.eaveY + 0.27], [sx - 0.42, B.eaveY + 0.31], [0, 3.13]];
      },
      ceilY: 3.0, // 2.1 m above the floor
      underBoxes: (sec) => (sec.id === 'front' ? [[4.6, 8.4, 0.2, 1.6]] : [[1.0, 5.6, 0.22, 1.6]]),
      panto: { type: 'diamond', sec: 'front', z: 4.4, baseY: 3.13, a: 1.12, b: 1.18 },
      gangway: { w: 1.2, h: 1.95 },
      doorMat: 'paint3',
      doorWindow: (B) => ({ bot: 1.25, top: B.doorTop - 0.16, r: 0.07, bot2: 0.62, top2: 1.1 }),
      jointMat: 'paint',
      cab: { wallZ: spec.cab.wallZ, deskZ: 0.5, seatZ: 1.32, eyeX: spec.cab.eye[0] },
      poles: (sec, m) => m.poles(sec),
      heaters: (p, sec) => {
        // round fan heaters under the seats by the doors (photo 7)
        for (const d of spec.doors.filter((q) => q.section === sec.id)) {
          const g = cyl(0.16, 0.24, 18);
          g.rotateZ(Math.PI / 2);
          p.add('heater', g, M(-0.72, 0.9 + 0.2, (d.z0 + d.z1) / 2));
          p.add('black', cyl(0.12, 0.25, 14).rotateZ(Math.PI / 2), M(-0.72 + 0.01, 1.1, (d.z0 + d.z1) / 2));
        }
      },
    });
  }

  poles(sec) {
    const out = [];
    const z0 = sec.id === 'front' ? 2.2 : 0.5;
    for (let z = z0; z < sec.length - 0.4; z += 1.56) out.push([z, -0.38, true, false]);
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) {
      out.push([d.z0 - 0.1, 0.55, true, false], [d.z1 + 0.1, 0.55, false, true]);
    }
    return out;
  }

  extraMaterials() {
    return {
      bumper: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.7 }),
      coupler: new THREE.MeshStandardMaterial({ color: 0x5c5f61, roughness: 0.6, metalness: 0.5 }),
      resistor: new THREE.MeshStandardMaterial({ color: 0x5f6466, roughness: 0.7, metalness: 0.3 }),
    };
  }

  /** Front band strips across a flat end following its plan outline. */
  endStrips(p, pts, toZ, front) {
    return (y0, y1, mat, pick = () => true) => {
      const pos = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        if (!pick((pts[i][0] + pts[i + 1][0]) / 2)) continue;
        const a0 = [pts[i][0], y0, toZ(pts[i][1], y0)], b0 = [pts[i + 1][0], y0, toZ(pts[i + 1][1], y0)];
        const a1 = [pts[i][0], y1, toZ(pts[i][1], y1)], b1 = [pts[i + 1][0], y1, toZ(pts[i + 1][1], y1)];
        if (front) pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
        else pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      p.add(mat, g);
    };
  }

  /** Corner caps over a rounded end at the eave. */
  endCap(p, pts, toZ, zIn, B, front) {
    const cap = new THREE.Shape();
    cap.moveTo(pts[0][0], toZ(pts[0][1], B.eaveY));
    for (let i = 1; i < pts.length; i++) cap.lineTo(pts[i][0], toZ(pts[i][1], B.eaveY));
    cap.lineTo(HW - 0.05, zIn);
    cap.lineTo(-HW + 0.05, zIn);
    cap.closePath();
    const o = extrudeMapped(cap, 0.04, (u, v, w) => [u, B.eaveY + w, v], front);
    for (const g of Object.values(o)) p.add('roof', g);
  }

  buildFront(p, sec, B) {
    const ws = 0.98;
    const { pts } = endOutline(HW, 0.18, 0.04, 6, [-ws, -ws + 0.05, ws - 0.05, ws, -0.78, 0.78]);
    const rake = (y) => (y <= 1.48 ? 0 : y >= 2.66 ? 0.1 : ((y - 1.48) / 1.18) * 0.1);
    const S = this.endStrips(p, pts, (dz, y) => dz + rake(y), true);
    const inG = (x) => Math.abs(x) < ws - 0.05, inF = (x) => Math.abs(x) < ws;
    S(B.skirtY, 0.72, 'paint3');
    S(0.72, B.beltY, 'paint2');
    S(B.beltY, 1.5, 'paint');
    S(1.5, 1.55, 'rubber', inF);
    S(1.5, 1.55, 'paint', (x) => !inF(x));
    S(1.55, 2.62, 'screen', inG);
    S(1.55, 2.62, 'rubber', (x) => inF(x) && !inG(x));
    S(1.55, 2.62, 'paint', (x) => !inF(x));
    S(2.62, 2.67, 'rubber', inF);
    S(2.62, 2.67, 'paint', (x) => !inF(x));
    S(2.67, B.eaveY, 'paint');
    S(B.skirtY - 0.03, B.skirtY, 'rubber');
    this.endCap(p, pts, (dz, y) => dz + rake(y), B.frontCorner + 0.02, B, true);
    // cab inside of the front wall
    const inner = this.endStrips(p, pts, (dz, y) => dz + rake(y) + 0.04, false);
    inner(B.skirtY, 1.5, 'dash');
    inner(2.67, B.eaveY, 'dash');
    // headlamps (round, at the bottom corners of the orange band) and the small lamps beside them (photos 8, 10)
    for (const sx of [-1, 1]) {
      const x = sx * 0.78, z = 0.04 * (x / HW) ** 2;
      p.add('rubber', cyl(0.11, 0.05, 20).rotateX(Math.PI / 2), M(x, 0.86, z - 0.01));
      p.add('headlamp', cyl(0.085, 0.03, 20).rotateX(Math.PI / 2), M(x, 0.86, z - 0.03));
      p.add('marker', cyl(0.04, 0.03, 12).rotateX(Math.PI / 2), M(sx * 0.55, 0.86, 0.04 * (0.55 / HW) ** 2 - 0.012));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.1, 0.06, 0.03), M(sx * 0.96, 1.08, 0.04 * (0.96 / HW) ** 2 + 0.01 - 0.02));
      // mirror on an arm at the cab corner
      p.add('black', box(0.05, 0.05, 0.42), M(sx * (HW + 0.06), 2.35, 0.05));
      p.add('black', box(0.15, 0.28, 0.05, 0.02), M(sx * (HW + 0.2), 2.15, -0.14));
      p.add('black', box(0.2, 0.04, 0.04), M(sx * (HW + 0.11), 2.35, -0.14));
    }
    // black bumper bar across the skirt with the coupler pocket
    p.add('bumper', box(1.5, 0.16, 0.12, 0.05), M(0, 0.56, -0.03));
    p.add('coupler', box(0.2, 0.14, 0.35), M(0, 0.4, -0.1));
    p.add('under', box(2.0, 0.1, 0.3), M(0, B.skirtY - 0.05, 0.3));
  }

  buildRearEnd(p, sec, B) {
    const L = sec.length;
    const { pts } = endOutline(HW, 0.18, 0.03, 6, [-0.86, -0.82, 0.82, 0.86]);
    const S = this.endStrips(p, pts, (dz) => L - dz, false);
    const inG = (x) => Math.abs(x) < 0.82, inF = (x) => Math.abs(x) < 0.86;
    S(B.skirtY, 0.72, 'paint3');
    S(0.72, B.beltY, 'paint2');
    S(B.beltY, 1.55, 'paint');
    S(1.55, 2.6, 'glass', inG);
    S(1.55, 2.6, 'rubber', (x) => inF(x) && !inG(x));
    S(1.55, 2.6, 'paint', (x) => !inF(x));
    S(2.6, B.eaveY, 'paint');
    S(B.skirtY - 0.03, B.skirtY, 'rubber');
    this.endCap(p, pts, (dz) => L - dz, L - B.rearCorner - 0.02, B, false);
    // tail and brake lamps in the orange band, bumper bar (photo 9)
    for (const sx of [-1, 1]) {
      const z = L - 0.03 * (0.75 / HW) ** 2 + 0.006;
      p.add('tail', box(0.22, 0.09, 0.03), M(sx * 0.75, 1.12, z));
      p.add('brake', box(0.1, 0.09, 0.03), M(sx * 0.95, 1.12, z - 0.004));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.1, 0.06, 0.03), M(sx * 0.95, 1.0, z - 0.004));
    }
    p.add('bumper', box(1.25, 0.15, 0.12, 0.06), M(0, 0.6, L + 0.04));
    p.add('coupler', box(0.18, 0.12, 0.2), M(0, 0.42, L + 0.08));
  }

  decorate(p, sec) {
    // roof: resistor grids and the equipment box behind the pantograph (photos 8-10)
    if (sec.id === 'front') {
      p.add('resistor', box(1.0, 0.22, 1.8), M(0, 3.22, 7.0));
      p.add('resistor', box(0.7, 0.18, 1.0), M(0, 3.2, 2.2));
      p.add('steel', cyl(0.03, 2.2, 6).rotateX(Math.PI / 2), M(0.35, 3.18, 5.8));
    } else {
      p.add('resistor', box(0.9, 0.2, 1.6), M(0, 3.2, 2.0));
    }
  }

  buildSigns() {
    const f = this.front;
    const nb = makeNumberBox();
    const nm = new THREE.MeshBasicMaterial({ map: nb.tex });
    // the number box sits behind the top of the windscreen (photos 8, 10)
    const box1 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), nm);
    box1.position.set(0.0, 2.49, 0.115);
    box1.rotation.y = Math.PI;
    box1.rotation.x = -0.08;
    f.add(box1);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.08), this.mats.black);
    back.position.set(0, 2.49, 0.165);
    f.add(back);
    const L = this.spec.sections[1].length;
    const box2 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.27), nm);
    box2.position.set(0.0, 2.43, L - 0.07);
    this.rear.add(box2);
    // destination card at the bottom of the windscreen and in a side window (photo 10)
    const card = makeRouteCard({ accent: '#1f6fb0' });
    const cm = new THREE.MeshBasicMaterial({ map: card.tex });
    const fc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), cm);
    fc.position.set(0.35, 1.66, 0.06);
    fc.rotation.y = Math.PI;
    f.add(fc);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), cm);
    sc.position.set(HW - 0.07, 1.64, 4.0);
    sc.rotation.y = Math.PI / 2;
    f.add(sc);
    this.signMats = [nm];
    this.signs.front = { showRoute: (n, t) => { nb.draw(n); card.draw(n, t); } };
    this.signs.side = this.signs.front;
    this.signs.rear = this.signs.front;
    // fleet numbers: black in the orange band on the front, the rear and both sides (photos 8-10)
    const num = makeNumberDecal(this.fleet, { color: '#141414' });
    const dm = this.mats.decal.clone();
    dm.map = num;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), dm);
    front.position.set(0, 1.08, -0.004);
    front.rotation.y = Math.PI;
    f.add(front);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), dm);
    rear.position.set(0, 1.12, L + 0.004);
    this.rear.add(rear);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.115), dm);
      m.position.set(sx * (HW + 0.006), 1.3, 1.05);
      m.rotation.y = sx * Math.PI / 2;
      f.add(m);
    }
    this.interiorSign(this.spec.sections[0], this.spec.cab.wallZ + 0.08, 2.45);
    const w = new THREE.Group();
    w.position.set(-0.86, 1.6, -0.012);
    w.rotation.x = 0.085;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.015), this.mats.black);
    arm.position.x = 0.46;
    w.add(arm);
    f.add(w);
    this.wiper = w;
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
  }
}

// Schindler/Siemens Be 4/6 S, Sofia green (photos 1-6 only: data/research/ref_photos/trams/ref01-06).
// Front section with the cab, the low-floor module ("Sänfte") between the halves, the rear section with a rear
// window. Read from the photos: the flat cab front with one large windscreen, the black destination box with two
// white blinds at the top, the louvred roof box above it, the white belt line that runs round the front and
// dips under the low windows of the middle module, the raised roof fairings, black window gaskets with top-hung
// hoppers, folding doors with long windows, the central lamp housing with the fleet number, single-arm
// pantograph above the cab, blue moquette seats, stainless poles and blue validators inside.
import * as THREE from 'three';
import { M, box, cyl } from '../BusGeom.js';
import { TramModel, extrudeMapped } from './TramModel.js';
import { makeBlindDisplay, makeRouteCard, makeNumberDecal, makeMoquette, makeGrille } from './TramTextures.js';

const GREEN = 0x2f9e46;
const HW = 1.1;
const BODY = {
  hw: HW, skirtY: 0.5, beltY: 1.42, winBot: 1.5, winTop: 2.5, doorBot: 0.42, doorTop: 2.42, eaveY: 3.0,
  tumble: 0.03, wall: 0.05, frontCorner: 0.33, rearCorner: 0.3,
};
const H = { hopper: 0.34 }; // top-hung hopper in the upper part of a side window

// windows [z0, z1, opts] in the section frames, from the photos (estimated spacing)
const WINDOWS = {
  front: {
    left: [[0.42, 1.4, { bot: 1.48, r: 0.12, mullion: 0.92 }], [1.6, 3.2, H], [3.35, 5.0, H], [5.15, 6.8, H], [6.95, 8.55, H], [8.7, 10.25, H]],
    right: [[0.42, 1.4, { bot: 1.48, r: 0.12, mullion: 0.92 }], [2.6, 4.15, H], [4.3, 6.1, H], [7.8, 9.0, H], [9.15, 10.25, H]],
  },
  middle: {
    left: [[0.5, 2.1, { r: 0.16 }], [2.25, 3.85, { r: 0.16 }], [4.0, 5.6, { r: 0.16 }], [5.75, 7.25, { r: 0.16 }]],
    right: [[0.5, 1.95, { r: 0.16 }], [2.1, 3.4, { r: 0.16 }], [5.1, 6.15, { r: 0.16 }], [6.3, 7.25, { r: 0.16 }]],
  },
  rear: {
    left: [[0.4, 2.2, H], [2.35, 4.4, H], [4.55, 6.6, H], [6.75, 8.8, H]],
    right: [[0.4, 2.2, H], [3.9, 5.5, H], [5.65, 7.25, H], [7.4, 8.85, H]],
  },
};

/**
 * Plan outline of a rounded end: [x, dz] from the left side round to the right side, dz measured into the body
 * from the foremost point. The face bows back by `bow` towards the corners, which are quarter circles of radius
 * rc; xs are extra sample points across the face (edges of the windscreen).
 */
export function endOutline(hw, rc, bow, n = 7, xs = []) {
  const dj = bow * ((hw - rc) / hw) ** 2;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (1 - k / n) * (Math.PI / 2);
    out.push([-(hw - rc + rc * Math.sin(a)), dj + rc - rc * Math.cos(a)]);
  }
  const xsAll = [...new Set([...xs, -0.6, -0.3, 0, 0.3, 0.6])].filter((x) => Math.abs(x) < hw - rc - 0.01).sort((a, b) => a - b);
  for (const x of xsAll) out.push([x, bow * (x / hw) ** 2]);
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * (Math.PI / 2);
    out.push([hw - rc + rc * Math.sin(a), dj + rc - rc * Math.cos(a)]);
  }
  return { pts: out, fc: dj + rc };
}

export class SchindlerModel extends TramModel {
  constructor(spec, opts = {}) {
    const isSec = (sec, id) => sec.id === id;
    super(spec, opts, {
      colors: {
        paint: GREEN, roof: GREEN, stripe: 0xf3f3ee, seat: 0x23436e, seatShell: 0x2b2f35, pole: 0xc3c8cb, wall: 0xd9dbd6, ceiling: 0xe6e7e2,
        floorKind: 'ribbed', floorCss: '#3b3d3f', lowFloorCss: '#2b2f36', fabricTex: makeMoquette(), bellows: 0x2a2b2c, dash: 0x2f3236, desk: 0x5d6266,
      },
      body: BODY,
      // the low-floor module: windows reach down to 1.0 m (photos 5, 6)
      sectionBody: (sec) => (isSec(sec, 'middle') ? { beltY: 0.95, winBot: 1.02, winTop: 2.45 } : {}),
      windows: WINDOWS,
      stripes: (sec, side, B) => {
        const L = sec.length;
        if (sec.id === 'middle') return [{ pts: [[0, 1.42], [0.3, 1.42], [0.55, 0.9], [L - 0.55, 0.9], [L - 0.3, 1.42], [L, 1.42]], h: 0.05 }];
        const z0 = sec.id === 'front' ? B.frontCorner : 0, z1 = sec.id === 'rear' ? L - B.rearCorner : L;
        return [{ pts: [[z0, 1.4], [z1, 1.4]], h: 0.05 }];
      },
      // eave rounding, ledge, raised fairing, roof top (half profile, eave -> centre line)
      roof: (sec, B) => {
        const sx = HW - (B.eaveY - B.beltY) * Math.tan(B.tumble);
        return [[sx, B.eaveY], [sx - 0.025, B.eaveY + 0.06], [sx - 0.08, B.eaveY + 0.095], [sx - 0.12, B.eaveY + 0.1],
          [sx - 0.13, B.eaveY + 0.12], [sx - 0.13, 3.39], [sx - 0.15, 3.42], [sx - 0.3, 3.43], [0, 3.44]];
      },
      ceilY: 3.02, // 2.16 m above the high floor
      underBoxes: (sec) => sec.id === 'front' ? [[5.0, 8.6, 0.22, 1.5]] : sec.id === 'rear' ? [[0.8, 4.2, 0.24, 1.5], [4.6, 5.6, 0.18, 1.2]] : [[1.2, 6.5, 0.12, 1.7]],
      panto: { type: 'single', sec: 'front', z: 1.95, baseY: 3.44, a: 1.38, b: 1.62, headZ: -0.2 },
      doorSwing: 'out', // outward-swinging leaves (photo 4)
      outerStep: true,
      doorLamp: 1.78,
      gangway: { w: 1.25, h: 2.0 },
      cab: { wallZ: spec.cab.wallZ, deskZ: 0.42, eyeX: spec.cab.eye[0], extra: (p, sec, B, fy, m) => m.cabExtra(p, sec, B, fy) },
      poles: (sec, m) => m.poles(sec),
      heaters: (p, sec, B) => {
        // wall heater covers along the left side below the windows
        if (sec.id === 'middle') return;
        p.add('heater', box(0.06, 0.22, sec.length - 1.2), M(-(HW - 0.08), (sec.id === 'front' ? 0.86 : 0.86) + 0.16, sec.length / 2 + (sec.id === 'front' ? 0.7 : 0)));
      },
    });
  }

  /** Poles: at every seat bay on the aisle side, in the door areas; validators and stop buttons on some. */
  poles(sec) {
    const out = [];
    const L = sec.length;
    if (sec.id === 'middle') {
      for (const z of [1.0, 2.6, 4.25, 5.2, 6.75]) out.push([z, z === 4.25 ? 0.1 : 0.32, true, z === 2.6]);
      return out;
    }
    const z0 = sec.id === 'front' ? 1.9 : 0.5;
    for (let z = z0; z < L - 0.4; z += 1.85) out.push([z, 0.06, true, Math.round(z) % 3 === 0]);
    for (const d of this.spec.doors.filter((q) => q.section === sec.id)) out.push([(d.z0 + d.z1) / 2, 0.42, true, true]);
    return out;
  }

  extraMaterials() {
    const grille = makeGrille('#2c9343');
    return {
      grille: new THREE.MeshStandardMaterial({ color: 0xffffff, map: grille, roughness: 0.6 }),
      coupler: new THREE.MeshStandardMaterial({ color: 0x8a8d8f, roughness: 0.5, metalness: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc8221a, roughness: 0.5 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.15, metalness: 1.0 }),
    };
  }

  /** Cab front (photos 4-6). */
  buildFront(p, sec, B) {
    const rc = 0.3, bow = 0.05;
    const wsHalf = 0.92; // windscreen glass half width
    const { pts } = endOutline(HW, rc, bow, 8, [-wsHalf, -wsHalf + 0.04, wsHalf - 0.04, wsHalf]);
    // rake: the windscreen leans back 0.12 m over its height; the box above stands vertical again
    const rake = (y) => (y <= 1.48 ? 0 : y >= 2.58 ? 0.12 : ((y - 1.48) / 1.1) * 0.12);
    const P = (i, y) => [pts[i][0], y, pts[i][1] + rake(y)];
    const strip = (y0, y1, mat, pick = () => true, off = 0) => {
      const pos = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        if (!pick((pts[i][0] + pts[i + 1][0]) / 2)) continue;
        const a0 = P(i, y0), b0 = P(i + 1, y0), a1 = P(i, y1), b1 = P(i + 1, y1);
        if (off) for (const v of [a0, b0, a1, b1]) v[2] -= off * (1 - Math.max(0, Math.abs(v[0]) - (HW - rc)) / rc);
        // outline runs left -> right seen from the front: (b0 - a0) x (a1 - a0) points forwards (-z)
        pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      p.add(mat, g);
    };
    const inGlass = (x) => Math.abs(x) < wsHalf - 0.001;
    const inFrame = (x) => Math.abs(x) < wsHalf + 0.001;
    // lower front: proud below the knee-height crease (photo 6), then up to the belt, white belt line round it
    strip(B.skirtY, 0.73, 'paint', () => true, 0.03);
    {
      // the crease: a narrow ledge joining the proud lower panel to the face above
      const pos = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = P(i, 0.73), b = P(i + 1, 0.73);
        const k = (v) => 0.03 * (1 - Math.max(0, Math.abs(v[0]) - (HW - rc)) / rc);
        const a2 = [a[0], a[1], a[2] - k(a)], b2 = [b[0], b[1], b[2] - k(b)];
        pos.push(...a2, ...a, ...b2, ...b2, ...a, ...b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      p.add('paint', g);
    }
    strip(0.73, 1.38, 'paint');
    strip(1.38, 1.43, 'stripe');
    strip(1.43, 1.5, 'paint');
    // windscreen: black frame, glass, corner pillars in body colour
    strip(1.5, 1.54, 'rubber', inFrame);
    strip(1.5, 1.54, 'paint', (x) => !inFrame(x));
    strip(1.54, 2.5, 'screen', inGlass);
    strip(1.54, 2.5, 'rubber', (x) => inFrame(x) && !inGlass(x));
    strip(1.54, 2.5, 'paint', (x) => !inFrame(x));
    strip(2.5, 2.55, 'rubber', inFrame);
    strip(2.5, 2.55, 'paint', (x) => !inFrame(x));
    strip(2.55, B.eaveY, 'paint');
    // inside of the front wall (cab)
    const inner = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      for (const [y0, y1] of [[B.skirtY, 1.5], [2.55, B.eaveY]]) {
        const a0 = P(i, y0), b0 = P(i + 1, y0), a1 = P(i, y1), b1 = P(i + 1, y1);
        for (const v of [a0, a1, b0, b0, a1, b1]) v[2] += 0.04;
        inner.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
      }
    }
    const gi = new THREE.BufferGeometry();
    gi.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    gi.computeVertexNormals();
    p.add('dash', gi);
    // roof over the front corner: the roof profile swept round the plan outline is approximated by a cap
    const cap = new THREE.Shape();
    cap.moveTo(pts[0][0], pts[0][1] + rake(B.eaveY));
    for (let i = 1; i < pts.length; i++) cap.lineTo(pts[i][0], pts[i][1] + rake(B.eaveY));
    cap.lineTo(HW - 0.05, B.frontCorner + 0.02);
    cap.lineTo(-HW + 0.05, B.frontCorner + 0.02);
    cap.closePath();
    const capG = extrudeMapped(cap, 0.04, (u, v, w) => [u, B.eaveY + w, v], true);
    for (const g of Object.values(capG)) p.add('roof', g);
    // destination box: black frame proud of the front, the two white blinds (buildSigns), above the windscreen
    const dz = rake(2.7) - 0.05;
    p.add('black', box(1.86, 0.5, 0.12), M(0, 2.83, dz + 0.04));
    this.blindZ = dz + 0.04 - 0.06 - 0.004; // the blinds just ahead of the box (buildSigns)
    // louvred roof box above the cab (photos 4-6) with the ventilation grille at the front and sides
    // the roof box over the cab: narrower than the body, louvres across its front (photos 5, 6)
    p.add('grille', box(1.42, 0.42, 1.3), M(0, 3.18, 0.84));
    p.add('roof', box(1.46, 0.04, 1.34), M(0, 3.6, 0.84));
    p.add('roof', box(1.9, 0.18, 0.2), M(0, 3.12, 0.1));
    // central lamp housing below the windscreen with the headlamp (photo 6), fleet number beside it
    p.add('paint', box(0.44, 0.78, 0.08, 0.02), M(0, 0.98, -0.035));
    p.add('rubber', box(0.24, 0.17, 0.05), M(0, 0.71, -0.08));
    p.add('headlamp', box(0.2, 0.13, 0.03), M(0, 0.71, -0.1));
    p.add('paint', box(0.36, 0.12, 0.1), M(0, 1.3, -0.04));
    // corner lamps: white marker above, amber indicator below (both corners)
    for (const sx of [-1, 1]) {
      const x = sx * (HW - 0.22);
      p.add('marker', cyl(0.045, 0.03, 12).rotateX(Math.PI / 2), M(x, 0.95, bow * (x / HW) ** 2 - 0.005));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.12, 0.06, 0.03), M(x, 0.78, bow * (x / HW) ** 2 - 0.005));
      // mirrors on swan-neck arms from the top of the cab side windows (photos 5, 6)
      const arm = [[sx * (HW + 0.01), 2.45, 0.6], [sx * (HW + 0.18), 2.5, 0.25], [sx * (HW + 0.24), 2.42, -0.08]];
      for (let k = 0; k + 1 < arm.length; k++) {
        const a = new THREE.Vector3(...arm[k]), b = new THREE.Vector3(...arm[k + 1]);
        const L = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        const g = cyl(0.016, L, 6);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        p.add('paint', g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
      }
      p.add('black', box(0.16, 0.3, 0.05, 0.02), M(sx * (HW + 0.25), 2.24, -0.1));
    }
    // skirt bottom: black rubber edge and the coupler with its red tip
    strip(B.skirtY - 0.04, B.skirtY, 'rubber');
    p.add('coupler', box(0.14, 0.12, 0.45), M(0, 0.48, -0.1));
    p.add('coupler', box(0.36, 0.2, 0.08), M(0, 0.48, -0.36));
    p.add('red', box(0.12, 0.08, 0.04), M(-0.1, 0.6, -0.4));
    p.add('red', box(0.12, 0.08, 0.04), M(0.1, 0.6, -0.4));
    p.add('under', box(1.9, 0.12, 0.3), M(0, B.skirtY - 0.06, 0.35));
    // builder's plate (white, lower front on the tram's left: photo 6)
    p.add('stripe', box(0.3, 0.07, 0.01), M(-0.52, 0.6, -0.035));
  }

  /** Rear end with a large rear window, the line number box, tail lamps (not in the photos: estimated). */
  buildRearEnd(p, sec, B) {
    const L = sec.length, rc = 0.3, bow = 0.03;
    const { pts } = endOutline(HW, rc, bow, 7, [-0.75, -0.71, 0.71, 0.75]);
    const P = (i, y) => [pts[i][0], y, L - pts[i][1]];
    const strip = (y0, y1, mat, pick = () => true) => {
      const pos = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        if (!pick((pts[i][0] + pts[i + 1][0]) / 2)) continue;
        const a0 = P(i, y0), b0 = P(i + 1, y0), a1 = P(i, y1), b1 = P(i + 1, y1);
        pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      p.add(mat, g);
    };
    const inG = (x) => Math.abs(x) < 0.71, inF = (x) => Math.abs(x) < 0.75;
    strip(B.skirtY, 1.38, 'paint');
    strip(1.38, 1.43, 'stripe');
    strip(1.43, 1.55, 'paint');
    strip(1.55, 2.45, 'glass', inG);
    strip(1.55, 2.45, 'rubber', (x) => inF(x) && !inG(x));
    strip(1.55, 2.45, 'paint', (x) => !inF(x));
    strip(2.45, B.eaveY, 'paint');
    strip(B.skirtY - 0.04, B.skirtY, 'rubber');
    const cap = new THREE.Shape();
    cap.moveTo(pts[0][0], L - pts[0][1]);
    for (let i = 1; i < pts.length; i++) cap.lineTo(pts[i][0], L - pts[i][1]);
    cap.lineTo(HW - 0.05, L - B.rearCorner - 0.02);
    cap.lineTo(-HW + 0.05, L - B.rearCorner - 0.02);
    cap.closePath();
    const capG = extrudeMapped(cap, 0.04, (u, v, w) => [u, B.eaveY + w, v], false);
    for (const g of Object.values(capG)) p.add('roof', g);
    p.add('roof', box(1.9, 0.4, 0.3), M(0, 3.2, L - 0.45));
    for (const sx of [-1, 1]) {
      const x = sx * (HW - 0.2);
      p.add('tail', box(0.16, 0.1, 0.03), M(x, 1.0, L - bow * (x / HW) ** 2 + 0.005));
      p.add('brake', box(0.16, 0.08, 0.03), M(x, 0.88, L - bow * (x / HW) ** 2 + 0.005));
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.16, 0.07, 0.03), M(x, 0.77, L - bow * (x / HW) ** 2 + 0.005));
    }
    p.add('coupler', box(0.3, 0.16, 0.12), M(0, 0.5, L + 0.04));
    p.add('rubber', box(1.6, 0.08, 0.06), M(0, 0.62, L + 0.02));
  }

  decorate(p, sec, B) {
    // side vent grilles in the lower panel (photos 4, 6) and the fleet numbers
    if (sec.id === 'front') {
      p.add('grille', box(0.02, 0.2, 0.42), M(HW + 0.004, 0.98, 4.6));
      p.add('grille', box(0.02, 0.2, 0.42), M(-HW - 0.004, 0.98, 4.6));
    }
  }

  buildSigns() {
    const f = this.front;
    const blind = makeBlindDisplay();
    const bm = new THREE.MeshBasicMaterial({ map: blind.tex, toneMapped: true });
    // the blinds fill the tram's left two thirds of the box (photo 6)
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), bm);
    front.position.set(-0.25, 2.83, this.blindZ);
    front.rotation.y = Math.PI;
    f.add(front);
    // route card in the first right-hand window and the rear window
    const card = makeRouteCard();
    const cm = new THREE.MeshBasicMaterial({ map: card.tex });
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), cm);
    side.position.set(HW - 0.06, 1.62, 3.2);
    side.rotation.y = Math.PI / 2;
    f.add(side);
    const rearSec = this.rear;
    const L = this.spec.sections[this.spec.sections.length - 1].length;
    const rearCard = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), cm);
    rearCard.position.set(0.3, 2.3, L - 0.08);
    rearSec.add(rearCard);
    this.signMats = [bm];
    this.signs.front = { showRoute: (n, t) => blind.draw(n, t) };
    this.signs.side = { showRoute: (n, t) => card.draw(n, t) };
    this.signs.rear = this.signs.side;
    // fleet numbers: white on both sides behind the cab and on the front left of the lamp housing (photos 4-6)
    const num = makeNumberDecal(this.fleet, { color: '#ffffff' });
    const dm = this.mats.decal.clone();
    dm.map = num;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), dm);
      m.position.set(sx * (HW + 0.006), 1.12, 0.95);
      m.rotation.y = sx * Math.PI / 2;
      f.add(m);
    }
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.135), dm);
    fm.position.set(-0.5, 1.12, 0.004);
    fm.rotation.y = Math.PI;
    f.add(fm);
    this.interiorSign(this.spec.sections[0], 1.62, 2.52);
    // windscreen wiper (pivot below the glass on the driver's side)
    // parked along the bottom of the glass, sweeping up from the left
    const w = new THREE.Group();
    w.position.set(-0.78, 1.56, -0.012);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.02, 0.015), this.mats.black);
    arm.position.x = 0.44;
    w.add(arm);
    w.rotation.x = 0.109; // along the raked windscreen
    f.add(w);
    this.wiper = w;
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
  }

  /** Cab: the desk below the windscreen, the controller on the left, switch panel, sun blind. */
  cabExtra(p, sec, B, fy) {
    // roller sun blind rolled up under the roof, above the windscreen
    p.add('dash', box(1.9, 0.04, 0.3), M(0, 2.62, 0.25));
    p.add('black', cyl(0.035, 1.0, 10).rotateZ(Math.PI / 2), M(-0.3, 2.56, 0.16));
  }
}


// Front end of the BMC Procity: white bumper and cheeks, black mask with fleet number, brushed-silver band
// (rising over the lamp clusters), black base band with the blue pictograms, one large raked windscreen
// with a black header holding the amber LED sign, lamp clusters (two round lenses + LED column), tall black
// mirrors on bent arms, tandem wipers, plate. Everything sits on the surface function of ProcityHull.js.
import * as THREE from 'three';
import { M, Parts, box, surfaceGrid, pchip, lerp, sstep, sweep } from '../../BusGeom.js';
import { HW, FRONT_Z, FACE, hwAt, faceS, facePos, facePatch, COLS, colsBetween } from './ProcityHull.js';

const rise = (x) => 0.1 * sstep(0.9, 1.2, Math.abs(x)); // the silver band lifts over the lamp clusters
const BAND0 = 0.84, BAND1 = 1.12, MASK0 = 0.53;

export const FrontMixin = {
  frontEnd(parts) {
    const lite = this.lite;
    const dr = this.decalRects;
    const left = COLS.filter((x) => x >= 0), right = COLS.filter((x) => x <= 0);
    // ---------------------------------------------------- white lower face (bumper and cheeks)
    parts.add('paint', facePatch({ xs: COLS, y0: 0.34, y1: 0.8, nv: 3 }));
    parts.add('paint', facePatch({ xs: COLS, y0: 0.8, y1: FACE.bandTop, nv: 6 }));
    // dark pan under the bumper
    {
      const xs = COLS;
      const pan = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const x = xs[Math.round(u * (xs.length - 1))];
        const s0 = faceS(Math.abs(x), 0.36);
        return [x * 0.97, 0.35, FRONT_Z + lerp(s0, 1.0, v)];
      }, { flip: true });
      parts.add('underbody', pan);
    }
    // ---------------------------------------------------- black mask between the lamp clusters, silver band, base band
    const maskX = (n) => colsBetween(0.93, -0.93, n);
    parts.add('black', facePatch({ xs: maskX(14), y0: (x) => MASK0 + 0.05 * sstep(0.55, 0.93, Math.abs(x)), y1: BAND0, nv: 2, off: 0.002 }));
    parts.add('silver', facePatch({ xs: colsBetween(1.2, -1.2, 36), y0: (x) => BAND0 + (Math.abs(x) > 0.93 ? rise(x) * 0.9 : 0), y1: (x) => BAND1 + rise(x), nv: 1, off: 0.003, uv: [0, 0, 1, 1] }));
    parts.add('black', facePatch({ xs: COLS, y0: (x) => BAND1 + rise(x), y1: FACE.bandTop, nv: 3, off: 0.002, scale: false }));
    // seam between silver band and mask: thin dark line
    parts.add('matteBlack', facePatch({ xs: colsBetween(0.93, -0.93, 8), y0: BAND0 - 0.004, y1: BAND0 + 0.002, nv: 1, off: 0.004 }));
    // ---------------------------------------------------- panoramic windscreen: black frame with the glass pane
    {
      const gw = pchip([1.3, 1.5, 1.9, 2.2, 2.4], [0.97, 1.08, 1.12, 1.11, 1.06]);
      for (const [xs, sgn] of [[left, 1], [right, -1]]) {
        parts.add('black', facePatch({ xs, y0: FACE.bandTop, y1: FACE.hdrBot - 1e-4, nv: 12, scale: true, clip: gw, clipSign: sgn }));
      }
      const Nc = 44, Nr = 14;
      const mk = () => surfaceGrid(Nc, Nr, (u, v) => {
        const Y = lerp(FACE.bandTop + 0.002, FACE.hdrBot - 0.002, v);
        const x = gw(Y) * Math.sin((1 - 2 * u) * Math.PI / 2);
        return facePos(x, Y, 0.002);
      });
      parts.add('windscreen', mk());
      parts.add('windscreenIn', mk());
    }
    // ---------------------------------------------------- black LED header, rounded top edge, roof cap
    {
      const rows = [FACE.hdrBot, 2.5, 2.7, 2.8, 2.84, 2.868];
      for (let i = 0; i < rows.length - 1; i++) parts.add('black', facePatch({ xs: COLS, y0: rows[i], y1: rows[i + 1], nv: 1, scale: true }));
      parts.add('paint', facePatch({ xs: COLS, y0: 2.868, y1: 2.882, nv: 1, scale: true }));
      const xs = COLS;
      const under = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const q = xs[Math.round(u * (xs.length - 1))];
        const x = (q * hwAt(FACE.hdrBot)) / HW;
        const ax = Math.abs(q);
        const sh = faceS(ax, FACE.hdrBot), sf = faceS(ax, FACE.hdrBot - 1e-4);
        return [x, FACE.hdrBot, FRONT_Z + lerp(sh, sf, v)];
      }, { flip: true });
      parts.add('black', under);
      const cap = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const q = xs[Math.round(u * (xs.length - 1))];
        const x = (q * hwAt(2.882)) / HW;
        const s0 = faceS(Math.abs(q), 2.882);
        return [x, 2.884, FRONT_Z + lerp(s0, Math.max(s0, 0.72), v)];
      });
      parts.add('paint', cap);
    }
    // LED sign frame (satin) around the 1.65 x 0.25 matrix
    parts.add('satin', facePatch({ xs: colsBetween(0.86, -0.86, 8), y0: 2.485, y1: 2.765, nv: 1, off: 0.0012 }));
    // ---------------------------------------------------- plate, number, pictograms, badges
    parts.add('black', facePatch({ xs: colsBetween(0.275, -0.275, 4), y0: 0.395, y1: 0.53, nv: 1, off: 0.003 }));
    parts.add('plate', facePatch({ xs: colsBetween(0.26, -0.26, 4), y0: 0.405, y1: 0.52, nv: 1, off: 0.0045 }));
    parts.add('decals', facePatch({ xs: colsBetween(0.70, 0.36, 8), y0: 0.62, y1: 0.78, nv: 1, off: 0.004, uv: dr.fleetFront }));
    parts.add('decals', facePatch({ xs: colsBetween(0.74, 0.28, 10), y0: 1.075, y1: 1.235, nv: 1, off: 0.004, uv: dr.picto }));
    parts.add('decals', facePatch({ xs: colsBetween(0.68, 0.46, 4), y0: 0.385, y1: 0.505, nv: 1, off: 0.003, uv: dr.diamond }));
    parts.add('decals', facePatch({ xs: colsBetween(0.11, -0.11, 6), y0: 0.86, y1: 0.945, nv: 1, off: 0.0045, uv: dr.bmcFront }));
    // route card behind the glass (lower passenger corner)
    parts.add('routeCard', facePatch({ xs: colsBetween(1.2, 0.74, 6), y0: 1.33, y1: 1.56, nv: 1, off: -0.03 }));
    // ---------------------------------------------------- lamps
    this.lampUnits(parts);
    // washer jets
    if (!lite) {
      for (const sg of [1, -1]) for (const x of [0.28, 0.42]) {
        const c = new THREE.CircleGeometry(0.006, 8);
        const [px, py, pz] = facePos(sg * x, 1.29, 0.004);
        c.rotateY(Math.PI);
        parts.add('black', c, M(px, py, pz));
      }
    }
    this.mirrors(parts);
  },

  lampUnits(parts) {
    const span = (sg, a, b, n) => (sg > 0 ? colsBetween(b, a, n) : colsBetween(-a, -b, n));
    for (const sg of [1, -1]) {
      // cluster: black housing 0.33 x 0.42 with two round lenses and the LED column on the inner edge
      const uv = sg > 0 ? [0, 0, 1, 1] : [1, 0, 0, 1];
      const yb = (x) => 0.58 + 0.02 * sstep(0.95, 1.25, Math.abs(x)), yt = (x) => 1.0 + 0.1 * sstep(0.95, 1.25, Math.abs(x)) - 0.02;
      parts.add('headlamp', facePatch({ xs: span(sg, 0.93, 1.255, 12), y0: yb, y1: yt, nv: 2, off: 0.0035, uv }));
      parts.add('lensClear', facePatch({ xs: span(sg, 0.93, 1.255, 12), y0: yb, y1: yt, nv: 2, off: 0.0065 }));
      // lower corner recess with the small round lamp (indicator)
      parts.add('black', facePatch({ xs: span(sg, 0.93, 1.2, 8), y0: 0.4, y1: 0.52, nv: 1, off: 0.003 }));
      const [px, py, pz] = facePos(sg * 1.1, 0.46, 0.006);
      const g = new THREE.CircleGeometry(0.034, 14);
      g.rotateY(Math.PI);
      parts.add(sg > 0 ? 'indicatorR' : 'indicatorL', g, M(px, py, pz));
      const ring = new THREE.RingGeometry(0.034, 0.042, 14);
      ring.rotateY(Math.PI);
      parts.add('satinChrome', ring, M(px, py, pz + 0.0005 * -1));
    }
  },

  mirrors(parts) {
    const z0 = FRONT_Z;
    for (const sg of [1, -1]) {
      // bent arm from the A-pillar top corner: out, then a short stalk to the head
      const path = [[sg * 1.2, 2.5, z0 + 0.52], [sg * 1.3, 2.52, z0 + 0.5], [sg * 1.42, 2.52, z0 + 0.44], [sg * 1.52, 2.5, z0 + 0.36], [sg * 1.55, 2.44, z0 + 0.33]];
      for (const g of sweep(path, (t) => [0.03 + 0.012 * t, 0.026 + 0.012 * t], 24, 12)) parts.add('satin', g);
      parts.add('satin', box(0.12, 0.1, 0.12, 0.03), M(sg * 1.2, 2.5, z0 + 0.54)); // root boss
      // head: tall black box, slightly rounded, facing the driver
      const hm = new THREE.Matrix4().makeRotationY(-sg * 0.12).setPosition(sg * 1.56, 2.2, z0 + 0.34);
      parts.add('satin', box(0.2, 0.4, 0.11, 0.035), hm);
      const g1 = new THREE.PlaneGeometry(0.17, 0.2); g1.translate(0, 0.08, 0.0565);
      const g2 = new THREE.PlaneGeometry(0.17, 0.11); g2.translate(0, -0.12, 0.0565);
      parts.add('mirror', g1, hm);
      parts.add('mirror', g2, hm);
    }
    // camera dome on the right A-pillar
    const dome = new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.rotateX(-Math.PI / 2);
    parts.add('black', dome, M(1.18, 2.35, z0 + 0.5));
  },

  /** Tandem wipers parked at the lower corners, blades pointing towards the centre. */
  buildWipers() {
    this.wipers = [];
    const defs = [
      { x: 1.02, y: 1.335, len: 0.9, park: Math.PI - 0.17, sweep: -1, dz: 0.03 }, // passenger: parked towards the centre, rising
      { x: -1.02, y: 1.335, len: 0.9, park: 0.17, sweep: 1, dz: 0.05 }, // driver
    ];
    const rake = Math.atan(FACE.rake / (FACE.hdrBot - FACE.bandTop));
    for (const d of defs) {
      const tilt = new THREE.Group();
      const zGlass = FRONT_Z + faceS(Math.abs(d.x), d.y);
      const zArm = FRONT_Z + faceS(0.3, d.y) + d.dz;
      tilt.position.set(d.x, d.y, zArm);
      tilt.rotation.x = rake;
      const L = d.len;
      const p = new Parts();
      p.add('matteBlack', box(L, 0.018, 0.012), M(L / 2, 0, 0));
      p.add('matteBlack', box(L * 0.84, 0.014, 0.022), M(L * 0.58, -0.02, -0.004));
      p.add('matteBlack', new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12).rotateX(Math.PI / 2), M(0, 0, 0));
      const piv = new THREE.Group();
      piv.add(p.build(this.mats, { castShadow: false, receiveShadow: false }));
      piv.rotation.z = d.park;
      tilt.add(piv);
      const sp = new Parts();
      sp.add('matteBlack', new THREE.CylinderGeometry(0.016, 0.016, Math.max(0.01, zArm - zGlass + 0.02), 10).rotateX(Math.PI / 2), M(d.x, d.y, (zArm + zGlass) / 2 - 0.01));
      this.front.add(tilt, sp.build(this.mats, { castShadow: false }));
      this.wipers.push({ piv, park: d.park, sweep: d.sweep });
    }
  },
};

void lerp;

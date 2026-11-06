// Saloons and driver's cabs of the line-9 trolleybuses, from the interior photographs:
//   Solaris IV (images 4-6): light walls, dark trim, red stanchions and rails, dark seat shells with blue fabric
//     on podiums over the wheels, the wheelchair bay opposite door 2, the raised floor over the rear axle.
//   Solaris III (images 9-10): the same layout with grey shells and violet-blue fabric, red-orange stanchions,
//     the red door lamps, pairs facing each other at the bellows end.
//   Ikarus 280.92F (images 15-17, refurbished): high floor 0.88 m with three steps in every door well, grey
//     plastic seats (singles on the left, pairs on the right), orange stanchions, beige walls.
// Seats come from the seat map (spec.layout) as instances of the Blender-modelled shells (kit_trolley.glb).
import * as THREE from 'three';
import { Parts, M, box, gaps, rod, panelShape, sidePanel, rectShape, rectPath } from './geom.js';
import { tkInstances } from './TrolleyKit.js';
import { busKit, kitInstances, kitMesh } from '../../BusKit.js';

/** A flat strip from (x0, y0) to (x1, y1) in the cross-section, running from za to zb; faces both ways. */
function slab(x0, y0, x1, y1, za, zb) {
  const pos = [x0, y0, za, x1, y1, za, x0, y0, zb, x1, y1, zb];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export const InteriorMixin = {
  buildInterior() {
    const groups = [];
    this._validators = { front: [], rear: [] };
    this._straps = { front: [], rear: [] };
    for (const sec of ['front', 'rear']) {
      const p = new Parts();
      this.saloon(p, sec);
      this.stanchions(p, sec);
      const g = p.build(this.mats, { castShadow: false });
      g.name = `${sec}Saloon`;
      const L = this.spec.layout;
      const seats = L.seats.filter((s) => s.sec === sec).map((s) => ({ x: s.x, y: s.fy, z: s.z, yaw: s.yaw || 0 }));
      const im = tkInstances(this.G.seatPiece, seats);
      if (im) g.add(im);
      else {
        const sp = new Parts();
        for (const s of seats) {
          const k = Math.cos(s.yaw) >= 0 ? 1 : -1;
          sp.add('seat', box(0.44, 0.06, 0.42), M(s.x, s.y + 0.42, s.z));
          sp.add(L.fabric ? 'fabric' : 'seat', box(0.44, 0.56, 0.06), M(s.x, s.y + 0.75, s.z + 0.22 * k));
        }
        g.add(sp.build(this.mats, { castShadow: false }));
      }
      if (busKit()) {
        const iv = kitInstances('validator', this._validators[sec]);
        if (iv) g.add(iv);
        const is = kitInstances('strap', this._straps[sec], { color: 0x9da3a8 });
        if (is) g.add(is);
      }
      this.sec(sec).add(g);
      groups.push(g);
    }
    this.interiorGroups = groups;
  },

  /** Floor, podiums, steps, walls, ceiling with its light strips, cab partition. */
  saloon(p, sec) {
    const D = this.D, F = this.F, G = this.G, L = this.spec.layout;
    const hw = D.halfW, FY = D.floorY, wtop = D.windowTopY, belt = D.beltY;
    const isF = sec === 'front';
    const z0 = isF ? F.frontZ + 0.35 : F.rearStart + 0.04, z1 = isF ? F.frontEnd - 0.04 : F.rearZ - 0.12;
    const xi = hw - 0.07; // inner face of the side walls
    const doors = this.spec.doors.filter((d) => d.section === sec);
    const ceilY = D.roofY - 0.14;
    // ---- floor (Ikarus: door wells cut out, three steps down to the street)
    if (L.steps) {
      const well = doors.map((d) => [d.z0, d.z1]);
      const wellX = hw - 0.82;
      p.add('floor', box(wellX + hw - 0.07, 0.02, z1 - z0), M((wellX - (hw - 0.07)) / 2, FY - 0.01, (z0 + z1) / 2));
      for (const [a, b] of gaps(z0, z1, well)) p.add('floor', box(xi - wellX, 0.02, b - a), M((xi + wellX) / 2, FY - 0.01, (a + b) / 2));
      for (const d of doors) {
        const st = L.steps;
        const depth = (xi - wellX) / st.length;
        st.forEach((top, k) => {
          const xa = xi - depth * (k + 1), xb = xi - depth * k;
          p.add('floor', box(xb - xa, top - 0.26, d.z1 - d.z0), M((xa + xb) / 2, (top + 0.26) / 2, (d.z0 + d.z1) / 2));
          p.add('yellowEdge', box(0.04, 0.012, d.z1 - d.z0), M(xb - 0.02, top + 0.004, (d.z0 + d.z1) / 2));
        });
        p.add('yellowEdge', box(0.04, 0.012, d.z1 - d.z0), M(wellX + 0.02, FY + 0.004, (d.z0 + d.z1) / 2));
        // step riser walls and the handrails up the steps
        for (const z of [d.z0 + 0.04, d.z1 - 0.04]) p.add('pole', rod([xi - 0.05, 0.9, z], [wellX + 0.05, 1.6, z], 0.016));
      }
    } else {
      p.add('floor', box(xi * 2, 0.02, z1 - z0), M(0, FY - 0.01, (z0 + z1) / 2));
    }
    // ---- high floor (Ikarus): the wheel housings stand up through the floor
    if (L.steps) {
      for (const az of isF ? [-D.wb1, 0] : [0]) {
        for (const side of [1, -1]) {
          const top = D.wheelR + G.archR + 0.04;
          if (top <= FY) continue;
          p.add('trim', box(0.42, top - FY, (G.archR + 0.04) * 2, 0.05), M(side * (xi - 0.21), (top + FY) / 2, az));
        }
      }
    }
    // ---- low floor: the wheel housings come up through the floor under the podium seats; grey covers hide the
    // black arch liners (ref16)
    if (!L.steps) {
      for (const az of isF ? [-D.wb1, 0] : [0]) {
        for (const side of [1, -1]) {
          const top = D.wheelR + G.archR + 0.02, len = (G.archR + 0.05) * 2;
          p.add('wall', box(0.58, top - FY, len, 0.07), M(side * (xi - 0.27), (top + FY) / 2, az));
        }
      }
    }
    // ---- wheel-arch podiums and the raised rear platform (low-floor Solaris)
    for (const q of L.podiums || []) {
      if (q.sec !== sec) continue;
      const h = L.podiumY - FY, xa = q.side > 0 ? 0.28 : -xi, xb = q.side > 0 ? xi : -0.28;
      p.add('trim', box(xb - xa, h, q.z1 - q.z0, 0.02), M((xa + xb) / 2, FY + h / 2, (q.z0 + q.z1) / 2));
      p.add('floor', box(xb - xa - 0.02, 0.012, q.z1 - q.z0 - 0.02), M((xa + xb) / 2, FY + h + 0.004, (q.z0 + q.z1) / 2));
      p.add('yellowEdge', box(0.012, 0.012, q.z1 - q.z0), M(q.side > 0 ? xa + 0.006 : xb - 0.006, FY + h + 0.006, (q.z0 + q.z1) / 2));
    }
    if (sec === 'rear' && L.platformY > FY + 0.05) {
      const zp = L.platformZ, h = L.platformY - FY;
      p.add('trim', box(xi * 2, h / 2, 0.3), M(0, FY + h / 4, zp + 0.15));
      p.add('trim', box(xi * 2, h, z1 - zp - 0.3), M(0, FY + h / 2, (zp + 0.3 + z1) / 2));
      p.add('floor', box(xi * 2, 0.012, z1 - zp - 0.3), M(0, FY + h + 0.006, (zp + 0.3 + z1) / 2));
      p.add('yellowEdge', box(xi * 2, 0.012, 0.03), M(0, FY + h + 0.008, zp + 0.31));
      p.add('yellowEdge', box(xi * 2, 0.012, 0.03), M(0, FY + h / 2 + 0.008, zp + 0.01));
    }
    // ---- side walls: lower panels between the doors, window pillars, the band over the windows
    for (const side of [1, -1]) {
      const holes = side > 0 ? doors.map((d) => [d.z0 - 0.04, d.z1 + 0.04]) : [];
      const axles = isF ? [-D.wb1, 0] : [0];
      for (const [a, b] of gaps(z0, z1, holes)) {
        // lower wall panel, cut round the wheel arches (the arch liners sit behind it)
        p.add('wall', sidePanel(panelShape(a, b, FY, belt + 0.02, axles, G.archR + 0.03, D.wheelR), side, xi + 0.015, 0.02));
        p.add('trim', box(G.gen === 4 ? 0.06 : 0.12, 0.03, b - a), M(side * (xi - (G.gen === 4 ? 0.02 : 0.05)), belt + 0.02, (a + b) / 2)); // window sill
        p.add('trim', box(0.06, 0.08, b - a), M(side * (xi - 0.02), FY + 0.04, (a + b) / 2)); // skirting
      }
      for (const [a, b] of gaps(z0, z1, holes.map(([u, v]) => [u, v]))) {
        p.add('wall', box(0.03, ceilY - wtop + 0.04, b - a), M(side * (xi - 0.03), (ceilY + wtop) / 2, (a + b) / 2));
        // luggage-rail style trim strip and the advertising frames over the windows
        p.add('trim', box(0.05, 0.03, b - a), M(side * (xi - 0.06), wtop + 0.02, (a + b) / 2));
      }
      // inner lining of the window band, cut round the panes (Ikarus: grey painted metal, ref14; Solaris: the dark
      // trim of the glazing, ref06 / ref10)
      const panes = G.panes[sec][side > 0 ? 'right' : 'left'];
      const sideHoles = side > 0 ? doors.map((d) => [d.z0 - 0.06, d.z1 + 0.06]) : [];
      for (const [a, b] of gaps(z0, z1, sideHoles)) {
        if (b - a < 0.06) continue;
        const sh = rectShape(a, belt, b, wtop);
        for (const [p0, p1, kind] of panes) {
          const q0 = Math.max(p0, a + 0.02), q1 = Math.min(p1, b - 0.02);
          if (q1 - q0 < 0.2) continue;
          const y0 = kind === 'cab' && !G.old ? belt - 0.16 : belt + (G.old ? 0.06 : 0.03), y1 = wtop - (G.old ? 0.08 : 0.04);
          sh.holes.push(rectPath(q0, y0, q1, y1, G.paneR));
        }
        p.add(G.old ? 'wall' : 'trim', sidePanel(sh, side, hw - G.tumble - (G.old ? 0.013 : 0.037), 0.006));
      }
    }
    // ---- ceiling: panels, the two light strips, air ducts
    p.add('ceiling', box(xi * 2, 0.02, z1 - z0), M(0, ceilY, (z0 + z1) / 2));
    for (const side of [1, -1]) {
      if (G.gen === 4) {
        // Solaris IV (ref01, ref06, ref16): light grey coves slope from the band over the windows up to the flat
        // centre of the ceiling, with a continuous bright LED strip along their inner edge
        p.add('ceiling', slab(side * (xi - 0.035), ceilY - 0.3, side * 0.84, ceilY - 0.07, z0, z1));
        p.add('lightStrip', slab(side * 0.84, ceilY - 0.07, side * 0.66, ceilY - 0.016, z0 + 0.15, z1 - 0.15));
        p.add('trim', slab(side * 0.66, ceilY - 0.016, side * 0.6, ceilY - 0.004, z0, z1));
        continue;
      }
      p.add(G.old ? 'ceiling' : 'trim', box(0.36, 0.1, z1 - z0), M(side * (xi - 0.2), ceilY - 0.05, (z0 + z1) / 2)); // duct / cove
      if (G.old) {
        // Ikarus: fluorescent tubes in rectangular diffuser housings, one every couple of metres (ref14)
        for (let z = z0 + 1.0; z < z1 - 0.8; z += 2.1) {
          p.add('trim', box(0.2, 0.05, 1.0), M(side * (xi - 0.44), ceilY - 0.03, z));
          p.add('lightStrip', box(0.16, 0.012, 0.94), M(side * (xi - 0.44), ceilY - 0.06, z));
        }
      } else p.add('lightStrip', box(0.1, 0.015, z1 - z0 - 0.4), M(side * (xi - 0.44), ceilY - 0.01, (z0 + z1) / 2));
    }
    if (G.old) {
      // roof ventilation hatches in the ceiling
      for (const hz of isF ? [-5.95, -2.3] : [0.85]) p.add('trim', box(0.9, 0.04, 0.75), M(0, ceilY - 0.02, hz));
    }
    // ---- ends of the saloon: cab partition (front), rear wall (rear)
    if (isF) {
      const cz = L.walk.front.cabZ;
      const ph = G.gen === 4 ? 1.35 : 1.0; // Solaris IV: tall white partition behind the driver (ref01)
      p.add(G.gen === 4 ? 'cabWhite' : 'trim', box(hw - 0.25, ph, 0.04), M(-(hw + 0.25) / 2 + 0.0, FY + ph / 2, cz + 0.06)); // partition, lower part
      const gp = new THREE.PlaneGeometry(hw - 0.3, 1.8 - ph);
      p.add('glass', gp, M(-(hw + 0.25) / 2, FY + ph + (1.8 - ph) / 2, cz + 0.06));
      p.add('pole', rod([-0.2, FY, cz + 0.06], [-0.2, ceilY, cz + 0.06], 0.02));
      p.add('pole', rod([-hw + 0.1, FY + 1.0, cz + 0.06], [-0.2, FY + 1.0, cz + 0.06], 0.018));
    } else {
      // rear wall of the saloon, kept inside the rounded rear corners of the body
      const rw = hw - G.bodyR - 0.04;
      p.add('wall', box(rw * 2, ceilY - FY, 0.03), M(0, (ceilY + FY) / 2, z1 - 0.04));
      for (const sx of [-1, 1]) p.add('wall', box(0.03, ceilY - FY, G.bodyR + 0.1), M(sx * (rw + 0.01), (ceilY + FY) / 2, z1 - 0.12));
    }
    // wheelchair bay (low floor): wall pad and the request button opposite door 2
    if (isF && !L.steps) {
      // the backrest board (Solaris IV: white, with a black grab bar along its top, ref01)
      p.add(G.gen === 4 ? 'cabWhite' : 'trim', box(0.06, 0.55, 0.9, G.gen === 4 ? 0.02 : 0), M(-xi + 0.03, FY + 0.75, -2.0));
      if (G.gen === 4) p.add('black', box(0.05, 0.05, 0.86, 0.02), M(-xi + 0.08, FY + 1.06, -2.0));
      p.add('stopBtn', box(0.02, 0.06, 0.06), M(-xi + 0.07, FY + 0.95, -1.45));
      const sign = box(0.005, 0.18, 0.18);
      p.add('blue', sign, M(-xi + 0.065, FY + 1.35, -2.0));
    }
  },

  /**
   * Solaris saloon fittings (ref01, ref06, ref16 / ref03, ref10): a stanchion at every seat row on the aisle side,
   * its top curving out to the ceiling rail; the two ceiling rails with hand straps over the standing areas; yellow
   * stop-request boxes and red buttons on the stanchions; red grab hoops beside the seats at the doors; the curved
   * rails round the articulation; heater grilles in the podiums and along the walls; ceiling vents.
   */
  solarisFittings(p, sec) {
    const D = this.D, F = this.F, L = this.spec.layout, G = this.G;
    const hw = D.halfW, FY = D.floorY, ceilY = D.roofY - 0.14;
    const xi = hw - 0.07;
    const isF = sec === 'front';
    const z0 = isF ? F.frontZ + 1.6 : F.rearStart + 0.15, z1 = isF ? F.frontEnd - 0.12 : F.rearZ - 0.6;
    const railY = ceilY - 0.3, railX = 0.6;
    const tube = (pts, r = 0.019, key = 'pole') => p.add(key, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), Math.max(8, pts.length * 6), r, 8, false));
    for (const side of [1, -1]) tube([[side * railX, railY, z0], [side * railX, railY, z1]], 0.017);
    // stanchions at the aisle end of every seat row
    const rows = new Map();
    for (const st of L.seats) {
      if (st.sec !== sec || st.kind === 'bench' || st.z < z0 - 0.2 || st.z > z1 + 0.2) continue;
      const key = `${Math.sign(st.x)}|${st.z.toFixed(2)}`;
      if (!rows.has(key) || Math.abs(st.x) < Math.abs(rows.get(key).x)) rows.set(key, st);
    }
    let k = 0;
    for (const st of [...rows.values()].sort((a, b) => a.z - b.z)) {
      k++;
      const sd = Math.sign(st.x) || 1;
      const x = sd * (Math.abs(st.x) - 0.25), z = st.z + 0.26 * (Math.cos(st.yaw || 0) >= 0 ? 1 : -1);
      // floor (or podium) -> straight up -> the bend out to the ceiling rail
      tube([[x, st.fy, z], [x, railY - 0.42, z], [x + sd * 0.06, railY - 0.16, z], [sd * railX, railY, z]], 0.019);
      if (k % 2 === 0) {
        p.add('yellowEdge', box(0.07, 0.12, 0.05, 0.01), M(x - sd * 0.05, FY + 1.42, z));
        p.add('stopBtn', box(0.012, 0.04, 0.04), M(x - sd * 0.085, FY + 1.42, z));
      } else p.add('stopBtn', box(0.03, 0.045, 0.03), M(x - sd * 0.03, FY + 1.3, z));
    }
    // hand straps on the rails over the standing areas (Blender kit strap, grey)
    const straps = [];
    for (const side of [1, -1]) for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.42) {
      const nearDoor = this.spec.doors.some((d) => d.section === sec && z > d.z0 - 0.8 && z < d.z1 + 0.8);
      if (nearDoor || (side < 0 && isF && z > -3.4 && z < -1.2)) straps.push({ x: side * railX, y: railY, z, yaw: 0 });
    }
    this._straps[sec].push(...straps);
    // door poles with validators, the rail over each door, red grab hoops on the seats beside the door
    for (const d of this.spec.doors.filter((q) => q.section === sec)) {
      const X = hw - 0.36;
      for (const z of [d.z0 - 0.1, d.z1 + 0.1]) tube([[X, FY, z], [X, railY - 0.2, z], [X - 0.1, railY - 0.04, z], [railX, railY, z]], 0.021);
      tube([[X, railY - 0.12, d.z0 - 0.1], [X, railY - 0.12, d.z1 + 0.1]], 0.018);
      if (G.gen === 4) {
        // Solaris IV: the tall validator with the blue frame and the screen on the pole at the front of each door,
        // facing back along the aisle (ref06, ref16)
        const vz = d.z0 - 0.1 + 0.06, vy = FY + 1.22;
        p.add('validatorBlue', box(0.17, 0.36, 0.06, 0.025), M(X - 0.02, vy, vz));
        p.add('black', box(0.12, 0.17, 0.008), M(X - 0.02, vy + 0.06, vz + 0.031));
        p.add('dash', box(0.12, 0.09, 0.012), M(X - 0.02, vy - 0.11, vz + 0.03));
        p.add('steel', box(0.04, 0.05, 0.04), M(X, vy, d.z0 - 0.1));
      } else this._validators[sec].push({ x: X, y: FY + 0.42, z: d.z1 + 0.1, yaw: Math.PI / 2 });
      p.add('stopBtn', box(0.03, 0.045, 0.035), M(X - 0.025, FY + 1.17, d.z0 - 0.1));
      p.add('yellowEdge', box(0.07, 0.12, 0.05, 0.01), M(X - 0.05, FY + 1.42, d.z1 + 0.1));
      for (const z of [d.z0 - 0.32, d.z1 + 0.32]) tube([[0.62, FY + 0.45, z], [0.62, FY + 0.95, z], [0.62, FY + 1.05, z + (z < d.z0 ? -0.12 : 0.12)], [0.62, FY + 0.95, z + (z < d.z0 ? -0.24 : 0.24)], [0.62, FY + 0.55, z + (z < d.z0 ? -0.24 : 0.24)]], 0.016);
    }
    // the articulation: curved rails on both sides of the turntable (ref01)
    const za = isF ? F.frontEnd - 0.08 : F.rearStart + 0.08, dz = isF ? -1 : 1;
    for (const side of [1, -1]) {
      tube([[side * 0.92, FY + 0.3, za], [side * 0.92, FY + 1.5, za], [side * 0.86, FY + 1.75, za + dz * 0.15], [side * 0.8, FY + 1.5, za + dz * 0.32], [side * 0.8, FY + 0.6, za + dz * 0.32]], 0.02);
    }
    // heater grilles along the walls and on the podium faces, vents in the ceiling
    for (const side of [1, -1]) {
      // (not over the wheel arches, which come up through the wall there)
      const arches = (isF ? [-D.wb1, 0] : [0]).map((az) => [az - G.archR - 0.08, az + G.archR + 0.08]);
      const holes = [...(side > 0 ? this.spec.doors.filter((d) => d.section === sec).map((d) => [d.z0 - 0.1, d.z1 + 0.1]) : []), ...arches];
      for (const [a, b] of gaps(isF ? F.frontZ + 1.0 : F.rearStart + 0.15, isF ? F.frontEnd - 0.1 : F.rearZ - 0.3, holes)) if (b - a > 0.3) p.add('grille', box(0.02, 0.12, b - a - 0.1), M(side * (xi - 0.03), FY + 0.12, (a + b) / 2));
    }
    for (const q of L.podiums || []) {
      if (q.sec !== sec) continue;
      const xa = q.side > 0 ? 0.28 : -0.28;
      p.add('grille', box(0.012, (L.podiumY - FY) * 0.55, (q.z1 - q.z0) * 0.6), M(xa - q.side * 0.004, FY + (L.podiumY - FY) * 0.5, (q.z0 + q.z1) / 2));
    }
    for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.6) {
      // Solaris IV: light grey vent panels in a thin dark frame (ref01); Solaris III: dark grilles
      if (G.gen === 4) {
        p.add('trim', box(0.52, 0.008, 0.24), M(0, ceilY - 0.006, z));
        p.add('wall', box(0.46, 0.01, 0.18), M(0, ceilY - 0.01, z));
      } else p.add('grille', box(0.5, 0.012, 0.22), M(0, ceilY - 0.012, z));
    }
    // interior display under the ceiling at the front (and the logo panel over the articulation)
    if (isF) p.add('dashSoft', box(1.12, 0.22, 0.08), M(0, G.interiorSignY ?? D.windowTopY - 0.18, F.frontZ + G.interiorSignZ + 0.05));
    p.add('dash', box(0.9, 0.22, 0.04), M(0, ceilY - 0.14, za + dz * 0.03));
  },

  /** Stanchions by the seats, door poles with validators and buttons, ceiling rails, stop buttons. */
  stanchions(p, sec) {
    if (!this.G.old) return this.solarisFittings(p, sec);
    const D = this.D, F = this.F, L = this.spec.layout;
    const hw = D.halfW, FY = D.floorY, ceilY = D.roofY - 0.14;
    const xi = hw - 0.07;
    const isF = sec === 'front';
    const z0 = isF ? F.frontZ + 0.6 : F.rearStart + 0.1, z1 = isF ? F.frontEnd - 0.1 : F.rearZ - 0.2;
    const railY = ceilY - 0.28;
    // two ceiling rails over the seats
    for (const side of [1, -1]) p.add('pole', rod([side * 0.62, railY, z0], [side * 0.62, railY, z1], 0.017));
    // vertical stanchions at the aisle end of every second seat row (from the seat map)
    const rows = new Map();
    for (const s of L.seats) {
      if (s.sec !== sec || s.kind === 'bench') continue;
      const key = `${Math.sign(s.x)}|${s.z.toFixed(2)}`;
      if (!rows.has(key)) rows.set(key, s);
    }
    let k = 0;
    for (const s of [...rows.values()].sort((a, b) => a.z - b.z)) {
      k++;
      if (k % 2) continue;
      const x = Math.sign(s.x) * 0.3;
      const y0 = s.fy;
      p.add('pole', rod([x, y0, s.z - 0.24], [x, railY, s.z - 0.24], 0.02));
      // stop button (red) on the stanchion
      p.add('stopBtn', box(0.03, 0.045, 0.03), M(x - Math.sign(s.x) * 0.025, FY + 1.45, s.z - 0.24));
    }
    // door poles with validators and the door-open buttons
    for (const d of this.spec.doors.filter((q) => q.section === sec)) {
      const X = L.steps ? hw - 0.84 : hw - 0.36;
      for (const z of [d.z0 - 0.1, d.z1 + 0.1]) p.add('pole', rod([X, FY, z], [X, railY, z], 0.021));
      p.add('pole', rod([X, railY, d.z0 - 0.1], [X, railY, d.z1 + 0.1], 0.019));
      this._validators[sec].push({ x: X, y: FY + 0.42, z: d.z1 + 0.1, yaw: Math.PI / 2 });
      p.add('stopBtn', box(0.03, 0.045, 0.035), M(X - 0.025, FY + 1.17, d.z0 - 0.1));
    }
    // interior display housings: a sign under the ceiling at the front and over door 3
    if (isF) p.add('dashSoft', box(1.12, 0.22, 0.08), M(0, this.G.interiorSignY ?? D.windowTopY - 0.18, F.frontZ + this.G.interiorSignZ + 0.05));
    void xi;
  },

  /** Driver's cab: dashboard with the instrument cluster, steering wheel (kit), driver's seat. */
  buildCab() {
    const D = this.D, F = this.F, G = this.G, L = this.spec.layout;
    const fz = F.frontZ, FY = D.floorY;
    const CAB_Y = G.old ? FY + 0.12 : FY + 0.2; // driver's platform
    const DX = -0.66;
    const p = new Parts();
    p.add('dashSoft', box(0.95, 0.12, 0.62), M(DX, CAB_Y + 0.82, fz + 0.62));
    p.add('dash', box(0.95, 0.75, 0.5), M(DX, CAB_Y + 0.4, fz + 0.55));
    p.add('dash', box(1.2, 0.5, 0.45), M(0.45, CAB_Y + 0.5, fz + 0.45));
    p.add('dashSoft', box(0.36, 0.22, 0.16), M(DX, CAB_Y + 0.98, fz + 0.72)); // binnacle hood
    p.add('dash', box(0.32, 0.06, 0.4), M(DX + 0.5, CAB_Y + 0.75, fz + 0.86)); // switch bank
    p.add('trim', box(0.9, 0.2, 0.9), M(DX, CAB_Y - 0.1, fz + 1.2)); // platform
    // driver's seat: cushion, backrest, headrest on a pedestal
    p.add('dash', box(0.5, 0.12, 0.5, 0.04), M(DX, CAB_Y + 0.48, fz + 1.58));
    p.add('dash', box(0.5, 0.62, 0.12, 0.04), M(DX, CAB_Y + 0.85, fz + 1.86));
    p.add('dash', box(0.28, 0.2, 0.1, 0.04), M(DX, CAB_Y + 1.27, fz + 1.88));
    p.add('steel', box(0.1, 0.42, 0.1), M(DX, CAB_Y + 0.21, fz + 1.6));
    // ticket / cash tray and the door switches
    p.add('steel', box(0.25, 0.04, 0.3), M(-0.05, CAB_Y + 0.85, fz + 1.2));
    for (let i = 0; i < 4; i++) p.add('stopBtn', box(0.04, 0.02, 0.04), M(DX + 0.42 + i * 0.06, CAB_Y + 0.79, fz + 0.86));
    const g = p.build(this.mats, { castShadow: false });
    this.front.add(g);
    this.interiorGroups.push(g);
    // instrument cluster canvas (drawn by Game.updateDashboard)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false }));
    cl.position.set(DX, CAB_Y + 0.92, fz + 0.79);
    cl.rotation.x = -0.45;
    this.front.add(cl);
    this.cluster = cl;
    const sw = new THREE.Group();
    sw.position.set(DX, CAB_Y + 0.78, fz + 0.97);
    sw.rotation.x = -1.0;
    sw.add(kitMesh('steeringWheel') || new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.017, 8, 36), this.mats.dash));
    this.steeringWheel = sw;
    this.front.add(sw);
    this.driverEyeLocal = new THREE.Vector3(DX, CAB_Y + 1.3, fz + 1.5);
    void L;
  },
};

// ---------------------------------------------------------------------------
// Fairground rides you can actually ride: a ferris wheel whose gondolas stay
// level, a carousel with bobbing horses and music, a roller coaster whose
// train follows a generated spline track with gravity-driven speed, a drop
// tower, a swing ride whose chairs fly outwards, and a trampoline that
// launches you into the air. Riding uses the player's seat system with a
// per-frame `follow` so the camera is carried along.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { Kit, solidBounds } from './gadgetkit.js';
import { hsl } from './common.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const X = [0, 0, HALF], Z = [HALF, 0, 0];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }

// Seat the player on a moving object (its local origin is the seat point).
function rideOn(obj, player, exitLocal, root, lookFwd = null) {
  const feet = new THREE.Vector3(), eye = new THREE.Vector3();
  const exit = new THREE.Vector3(...exitLocal);
  root.updateMatrixWorld(true);
  exit.applyMatrix4(root.matrixWorld);
  const seat = {
    feet, eye, exit, height: 0.45, seatHeight: 0.45,
    follow: (s) => {
      obj.updateMatrixWorld(true);
      s.feet.set(0, 0, 0).applyMatrix4(obj.matrixWorld);
      s.eye.set(0, 1.25, 0).applyMatrix4(obj.matrixWorld);
    },
  };
  seat.follow(seat);
  obj.getWorldQuaternion(_q);
  const f = (lookFwd ? lookFwd.clone() : new THREE.Vector3(0, 0, 1)).applyQuaternion(_q);
  const yaw = Math.atan2(-f.x, -f.z);
  player.sitAt({ ...seat, yaw, lookYaw: yaw });
  if (G.ui) G.ui.toast('Enjoy the ride! (Jump or move to get off)');
}

// Bulbs of alternating colours along a list of points (merged per colour).
function bulbs(k, pts, r = 0.08) {
  const cols = ['e:#ffe070', 'e:#ff5a8a', 'e:#5ac8ff'];
  pts.forEach((p, i) => k.ball(cols[i % cols.length], p, r, null, 8));
}

export const RIDES = {
  ferrisWheel(k, a, r) {
    const R = clamp(10 * (a.sizeMul || 1), 5, 40), hubY = R + 2.5;
    const frame = k.body('painted', r.pick(['#f2f0ea', '#c62828', '#2a5ad8']));
    // A-frame supports and platform.
    for (const z of [-1.4, 1.4]) for (const x of [-1, 1]) k.seg(frame, [x * R * 0.55, 0, z * 1.6], [0, hubY, z], 0.35, 0.25);
    k.seg('steel', [0, hubY, -1.8], [0, hubY, 1.8], 0.45);
    k.box('concrete', [0, 0.25, 0], [R * 1.3, 0.5, 5]);
    k.box('planks', [0, 0.52, 3.2], [4, 0.1, 1.6]);
    k.collide([-R * 0.65, 0, -2.5], [R * 0.65, 0.5, 2.5]);
    const wheel = k.sub([0, hubY, 0]);
    const n = Math.round(clamp(R * 1.4, 10, 24));
    for (const z of [-1.2, 1.2]) {
      wheel.torus(frame, [0, 0, z], R, 0.18, null, TAU, 64);
      wheel.torus(frame, [0, 0, z], R * 0.6, 0.12, null, TAU, 48);
      for (let i = 0; i < n; i++) { const an = i / n * TAU; wheel.seg(frame, [0, 0, z * 0.6], [Math.cos(an) * R, Math.sin(an) * R, z], 0.07); }
      bulbs(wheel, Array.from({ length: n * 2 }, (_, i) => { const an = i / (n * 2) * TAU; return [Math.cos(an) * (R + 0.2), Math.sin(an) * (R + 0.2), z * 1.1]; }), 0.1);
    }
    wheel.cyl('steel', [0, 0, 0], 0.9, 2.8, Z, { segs: 20 });
    const gondolas = [];
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU;
      const g = wheel.sub([Math.cos(an) * R, Math.sin(an) * R, 0]);
      g.seg('steel', [0, 0, -1.2], [0, 0, 1.2], 0.05);
      const cabin = g.sub([0, 0, 0]);
      const col = hsl(i / n, 0.75, 0.55);
      cabin.seg('steel', [0, 0, 0], [0, -0.7, 0], 0.04);
      cabin.rbox('g:' + col, [0, -1.6, 0], [1.6, 0.9, 1.6], 0.15);
      cabin.rbox('g:' + col, [0, -0.85, 0], [1.7, 0.12, 1.7], 0.05);
      for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) cabin.seg('steel', [x, -1.2, z], [x, -0.9, z], 0.03);
      const seatObj = new THREE.Object3D(); seatObj.position.set(0, -1.6, -0.1); cabin.group.add(seatObj);
      gondolas.push({ cabin, seatObj });
    }
    let speed = 0.12;
    k.tick((dt) => { wheel.group.rotation.z += dt * speed; for (const g of gondolas) g.cabin.group.rotation.z = -wheel.group.rotation.z; });
    k.light([0, hubY, 2], '#ffd9a0', 2, R * 2, true);
    return {
      name: 'Ferris wheel', height: hubY + R + 1,
      interact: { label: () => 'Ride the ferris wheel', action: (e, player) => {
        // Board the gondola closest to the bottom.
        let best = gondolas[0], by = Infinity;
        for (const g of gondolas) { g.seatObj.getWorldPosition(_v); if (_v.y < by) { by = _v.y; best = g; } }
        rideOn(best.seatObj, player, [0, 0.6, 3.4], e.root);
        sound(e, 'ding');
      } },
    };
  },
  carousel(k, a, r) {
    const Rr = clamp(5 * Math.sqrt(a.sizeMul || 1), 3, 12);
    k.cyl('planks', [0, 0.25, 0], Rr + 0.6, 0.5, null, { segs: 32 });
    k.collideCyl(0, 0, 0, 0.5, Rr + 0.6);
    const plat = k.sub([0, 0.5, 0]);
    plat.cyl('m:#8a1a2a', [0, 0.1, 0], Rr, 0.2, null, { segs: 40 });
    plat.cyl('m:#f2e0b0', [0, 2.4, 0], 0.7, 4.6, null, { segs: 20 });
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; plat.box('mirror', [Math.cos(an) * 0.71, 2.2, Math.sin(an) * 0.71], [0.3, 1.2, 0.02], [0, -an + HALF, 0]); }
    // Canopy with coloured segments and bulbs.
    const segs = 16;
    for (let i = 0; i < segs; i++) plat.cyl(i % 2 ? 'f:#f2f0ea' : 'f:#c62828', [0, 5.4, 0], Rr + 0.3, 1.8, null, { segs: 2, rTop: 0.3, arc: TAU / segs, arcStart: i / segs * TAU });
    plat.cyl('m:#d8b050', [0, 4.6, 0], Rr + 0.35, 0.5, null, { segs: 40, open: true });
    plat.ball('gold', [0, 6.5, 0], 0.35);
    bulbs(plat, Array.from({ length: 40 }, (_, i) => { const an = i / 40 * TAU; return [Math.cos(an) * (Rr + 0.38), 4.45, Math.sin(an) * (Rr + 0.38)]; }), 0.07);
    const horses = [];
    const hcol = ['#f4f2ee', '#2a2420', '#c8a060', '#f4f2ee', '#6a3a1a', '#e8e0d0'];
    for (let ring = 0; ring < 2; ring++) {
      const rr = ring ? Rr * 0.5 : Rr * 0.82, n = ring ? 6 : 10;
      for (let i = 0; i < n; i++) {
        const an = (i + ring * 0.5) / n * TAU;
        const x = Math.cos(an) * rr, z = Math.sin(an) * rr;
        plat.seg('gold', [x, 0.2, z], [x, 4.3, z], 0.035);
        const h = plat.sub([x, 1.2, z], [0, -an, 0]);
        const col = 'g:' + hcol[(i + ring) % hcol.length];
        h.ball(col, [0, 0, 0], 0.32, [0.55, 0.55, 1.2]);
        h.seg(col, [0, 0.1, 0.25], [0, 0.55, 0.45], 0.13, 0.1);
        h.rbox(col, [0, 0.62, 0.62], [0.16, 0.18, 0.36], 0.07, [0.45, 0, 0]);
        h.box('m:#c62828', [0, 0.72, 0.38], [0.05, 0.28, 0.3], [0.3, 0, 0]);
        for (const s of [-1, 1]) { h.seg(col, [s * 0.1, -0.1, 0.25], [s * 0.1, -0.4, 0.55], 0.05); h.seg(col, [s * 0.1, -0.1, -0.25], [s * 0.1, -0.5, -0.35], 0.05); }
        h.seg('m:#d8b050', [0, 0.05, -0.35], [0, -0.3, -0.55], 0.06, 0.02);
        h.rbox('m:#d8b050', [0, 0.18, 0], [0.4, 0.06, 0.4], 0.02);
        const seatObj = new THREE.Object3D(); seatObj.position.set(0, 0.2, 0); h.group.add(seatObj);
        horses.push({ h, ph: i * 1.3 + ring, seatObj });
      }
    }
    let spin = 0.35;
    k.tick((dt, t) => { plat.group.rotation.y += dt * spin; for (const hh of horses) hh.h.group.position.y = 1.2 + Math.sin(t * 2.2 + hh.ph) * 0.25; });
    k.light([0, 4, 0], '#ffe0b0', 2, 12, true);
    return {
      name: 'Carousel', height: 7,
      interact: { label: () => 'Ride a carousel horse', action: (e, player) => {
        let best = horses[0], bd = Infinity;
        for (const hh of horses) { hh.seatObj.getWorldPosition(_v); const d = _v.distanceTo(player.position); if (d < bd) { bd = d; best = hh; } }
        rideOn(best.seatObj, player, [0, 0.6, Rr + 1.2], e.root, new THREE.Vector3(0, 0, 1));
        [0, 4, 7, 12, 7, 4, 0, 4, 7, 4].forEach((n, i) => setTimeout(() => sound(e, 'note', { freq: 392 * Math.pow(2, n / 12), timbre: 'flute' }), i * 260));
      } },
    };
  },
  rollerCoaster(k, a, r) {
    const S = clamp(a.sizeMul || 1, 0.6, 3);
    const A = 30 * S, B = 18 * S, H = 16 * S;
    const col = k.body('painted', r.pick(['#c62828', '#2a5ad8', '#f2c21a', '#2aa84a']));
    const pts = [];
    const N = 160;
    const hills = [0.72, 0.52, 0.38];
    const height = (t) => {
      const u = t / TAU;
      if (u < 0.08) return 2.2;                                   // station
      if (u < 0.28) return 2.2 + (H - 2.2) * ((u - 0.08) / 0.2);  // lift hill
      if (u < 0.34) return H - (H - 1.6) * Math.sin(((u - 0.28) / 0.06) * HALF); // first drop
      let h = 1.6;
      for (let i = 0; i < hills.length; i++) { const c = 0.44 + i * 0.16; h = Math.max(h, 1.6 + (H * hills[i] - 1.6) * Math.max(0, Math.cos(((u - c) / 0.07) * HALF))); }
      if (u > 0.9) h = 1.6 + (2.2 - 1.6) * ((u - 0.9) / 0.1);
      return h;
    };
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU;
      const wob = 1 + 0.18 * Math.sin(t * 3 + 0.6);
      pts.push(new THREE.Vector3(Math.cos(t) * A * wob, height(t), Math.sin(t) * B * wob));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const len = curve.getLength();
    const up = new THREE.Vector3(0, 1, 0);
    const M = Math.round(len / 1.0);
    const L = [], R = [], P = [];
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      const p = curve.getPointAt(u % 1), tg = curve.getTangentAt(u % 1);
      const lat = new THREE.Vector3().crossVectors(tg, up).normalize();
      P.push(p); L.push(p.clone().addScaledVector(lat, 0.55)); R.push(p.clone().addScaledVector(lat, -0.55));
      if (i % 1 === 0 && i < M) { const yaw = Math.atan2(lat.x, lat.z); k.box('darkWood', [p.x, p.y - 0.08, p.z], [1.4, 0.08, 0.18], [0, yaw, 0]); }
    }
    k.tube('steel', L, 0.07, M, true, 6);
    k.tube('steel', R, 0.07, M, true, 6);
    k.tube(col, P.map((p) => p.clone().add(new THREE.Vector3(0, -0.35, 0))), 0.16, M, true, 8);
    // Supports every few metres (down into the ground to cover slopes).
    for (let i = 0; i < M; i += 4) { const p = P[i]; if (p.y < 1) continue; k.seg(col, [p.x, p.y - 0.4, p.z], [p.x, -3, p.z], 0.16); if (p.y > 8) k.seg(col, [p.x, p.y * 0.5, p.z], [p.x * 0.9, -3, p.z * 0.9], 0.1); }
    // Station.
    const st = curve.getPointAt(0.03);
    k.box('planks', [st.x, 1.7, st.z + 1.8], [8, 0.2, 2.2]);
    k.box('m:#f2f0ea', [st.x, 4.2, st.z], [9, 0.2, 5]);
    for (const x of [-4, 4]) for (const z of [-2, 2]) k.seg('steel', [st.x + x, 0, st.z + z], [st.x + x, 4.2, st.z + z], 0.1);
    k.label('THE GENESIS', [st.x, 4.6, st.z + 2.52], 6, 0.8, null, { bg: '#1a1a3a', fg: '#ffe070', emissive: 0.8 });
    k.collide([st.x - 4, 0, st.z + 0.7], [st.x + 4, 1.8, st.z + 2.9]);
    // Train.
    const cars = [];
    const trainCols = ['#f2c21a', '#2a5ad8', '#c62828', '#2aa84a'];
    for (let c = 0; c < 4; c++) {
      const car = k.sub([0, 0, 0]);
      car.rbox('g:' + trainCols[c], [0, 0.35, 0], [1.3, 0.55, 1.6], 0.15);
      car.rbox('black', [0, 0.55, -0.2], [1.1, 0.35, 0.6], 0.1);
      car.torus('chrome', [0, 0.85, 0.3], 0.45, 0.04, [0, 0, 0], PI, 12);
      for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) car.cyl('dark', [s * 0.6, 0.05, z], 0.12, 0.1, X, { segs: 12 });
      const seatObj = new THREE.Object3D(); seatObj.position.set(0, 0.3, -0.1); car.group.add(seatObj);
      cars.push({ car, seatObj });
    }
    let u = 0, v = 3;
    const carGap = 1.9 / len;
    const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    const place = (car, uu) => {
      uu = ((uu % 1) + 1) % 1;
      curve.getPointAt(uu, tmpP); curve.getTangentAt(uu, tmpT);
      car.group.position.copy(tmpP);
      m4.lookAt(new THREE.Vector3(0, 0, 0), tmpT.clone().negate(), up);
      qq.setFromRotationMatrix(m4);
      car.group.quaternion.copy(qq);
    };
    k.tick((dt, t, dist) => {
      const uu = ((u % 1) + 1) % 1;
      const h = curve.getPointAt(uu).y;
      const onLift = uu > 0.08 && uu < 0.28, inStation = uu < 0.08 || uu > 0.97;
      const target = inStation ? 2.5 : onLift ? 3 : Math.sqrt(Math.max(9, 2 * 9.81 * (H + 0.5 - h)));
      v += (target - v) * Math.min(1, dt * (onLift || inStation ? 2 : 6));
      u += (v * dt) / len;
      cars.forEach((c, i) => place(c.car, u - i * carGap));
      if (dist < 80 && !onLift && !inStation && v > 12 && Math.random() < dt * 0.4 && G.audio) G.audio.play('whoosh', k.group.getWorldPosition(_v));
    });
    cars.forEach((c, i) => place(c.car, -i * carGap));
    return {
      name: 'Roller coaster', height: H + 2, flatten: false,
      interact: { label: () => 'Ride the roller coaster', action: (e, player) => { rideOn(cars[0].seatObj, player, [st.x, 1.9, st.z + 1.8], e.root, new THREE.Vector3(0, 0, 1)); sound(e, 'ding'); } },
    };
  },
  dropTower(k, a, r) {
    const H = clamp(35 * (a.sizeMul || 1), 15, 90);
    const col = k.body('painted', r.pick(['#c62828', '#2a5ad8', '#1a1a1c']));
    k.cyl('concrete', [0, 0.3, 0], 5, 0.6, null, { segs: 24 });
    k.box(col, [0, H / 2, 0], [1.6, H, 1.6]);
    k.cone(col, [0, H + 1.5, 0], 1.2, 3, [0, PI / 4, 0], 4);
    k.ball('led', [0, H + 3.1, 0], 0.3);
    for (let i = 0; i < Math.floor(H / 3); i++) k.box(i % 2 ? 'white' : col, [0, 1.5 + i * 3, 0.81], [1.4, 0.2, 0.02]);
    const ring = k.sub([0, 2, 0]);
    ring.cyl('m:#f2c21a', [0, 0, 0], 2.8, 0.8, null, { segs: 24, open: true });
    ring.torus('m:#f2c21a', [0, 0.4, 0], 2.8, 0.12, Z, TAU, 32);
    const seats = [];
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; const s = ring.sub([Math.cos(an) * 3.1, -0.3, Math.sin(an) * 3.1], [0, -an - HALF, 0]); s.rbox('black', [0, 0, 0], [0.6, 0.6, 0.5], 0.08); s.torus('chrome', [0, 0.5, 0.15], 0.25, 0.04, null, PI, 10); const so = new THREE.Object3D(); so.position.set(0, 0.0, 0); s.group.add(so); seats.push(so); }
    k.collideCyl(0, 0, 0, 0.6, 5);
    let phase = 0;
    k.tick((dt) => {
      phase = (phase + dt) % 20;
      let y;
      if (phase < 3) y = 2; else if (phase < 12) y = 2 + (H - 6) * ((phase - 3) / 9); else if (phase < 14) y = H - 4; else if (phase < 15.4) { const f = (phase - 14) / 1.4; y = H - 4 - (H - 6) * f * f; } else y = 2;
      ring.group.position.y = y;
    });
    return { name: 'Drop tower', height: H + 3, interact: { label: () => 'Ride the drop tower', action: (e, player) => { let b = seats[0], bd = Infinity; for (const s of seats) { s.getWorldPosition(_v); const d = _v.distanceTo(player.position); if (d < bd) { bd = d; b = s; } } rideOn(b, player, [0, 0.7, 6], e.root, new THREE.Vector3(0, 0, 1)); } } };
  },
  swingRide(k, a, r) {
    const col = k.body('painted', r.pick(['#2a5ad8', '#c62828', '#8a2aa8']));
    k.cyl('concrete', [0, 0.25, 0], 6, 0.5, null, { segs: 32 });
    k.cyl(col, [0, 5, 0], 0.5, 9, null, { segs: 16 });
    const top = k.sub([0, 9, 0]);
    top.cyl('m:#f2c21a', [0, 0.5, 0], 5, 1, null, { segs: 32, rTop: 1.5 });
    top.cyl(col, [0, 0, 0], 5.2, 0.4, null, { segs: 32 });
    bulbs(top, Array.from({ length: 36 }, (_, i) => { const an = i / 36 * TAU; return [Math.cos(an) * 5.25, -0.1, Math.sin(an) * 5.25]; }), 0.08);
    const chairs = [];
    for (let i = 0; i < 16; i++) {
      const an = i / 16 * TAU;
      const hang = top.sub([Math.cos(an) * 4.6, -0.2, Math.sin(an) * 4.6], [0, -an, 0]);
      const sw = hang.sub([0, 0, 0]);
      sw.seg('chrome', [-0.25, 0, 0], [-0.25, -4.5, 0], 0.012); sw.seg('chrome', [0.25, 0, 0], [0.25, -4.5, 0], 0.012);
      sw.rbox('g:' + hsl(i / 16, 0.8, 0.55), [0, -4.6, 0], [0.6, 0.1, 0.5], 0.04);
      sw.rbox('g:' + hsl(i / 16, 0.8, 0.55), [0, -4.3, -0.22], [0.6, 0.5, 0.06], 0.03);
      const so = new THREE.Object3D(); so.position.set(0, -4.55, 0); sw.group.add(so);
      chairs.push({ sw, so });
    }
    let w = 0;
    k.tick((dt, t) => { const target = (Math.sin(t * 0.15) > -0.3) ? 1.3 : 0; w += (target - w) * dt * 0.4; top.group.rotation.y += dt * w; for (const c of chairs) c.sw.group.rotation.x = -Math.min(0.9, w * w * 0.5); });
    k.collideCyl(0, 0, 0, 9, 0.6);
    return { name: 'Swing ride', height: 10.5, interact: { label: () => 'Ride the swings', action: (e, player) => { let b = chairs[0], bd = Infinity; for (const c of chairs) { c.so.getWorldPosition(_v); const d = _v.distanceTo(player.position); if (d < bd) { bd = d; b = c; } } rideOn(b.so, player, [0, 0.6, 6.5], e.root, new THREE.Vector3(0, 0, -1)); } } };
  },
  trampoline(k, a, r) {
    const R = clamp(1.8 * Math.sqrt(a.sizeMul || 1), 1, 6), hMat = 0.75;
    const col = k.body('painted', r.pick(['#2a5ad8', '#2aa84a', '#c62828']));
    k.torus(col, [0, hMat, 0], R, 0.06, Z, TAU, 40);
    k.torus('m:#f2c21a', [0, hMat + 0.02, 0], R - 0.12, 0.1, Z, TAU, 40);
    k.cyl('black', [0, hMat - 0.02, 0], R - 0.2, 0.02, null, { segs: 36 });
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.seg(col, [Math.cos(an) * R, hMat, Math.sin(an) * R], [Math.cos(an) * R * 1.05, 0, Math.sin(an) * R * 1.05], 0.04); k.seg(col, [Math.cos(an) * R, hMat, Math.sin(an) * R], [Math.cos(an) * R, hMat + 1.7, Math.sin(an) * R], 0.03); }
    k.cyl('glass', [0, hMat + 0.9, 0], R, 1.7, null, { segs: 36, open: true });
    k.torus(col, [0, hMat + 1.7, 0], R, 0.03, Z, TAU, 40);
    k.collide([-R * 0.7, 0, -R * 0.7], [R * 0.7, hMat, R * 0.7]);
    let cool = 0;
    return {
      name: 'Trampoline', height: hMat + 1.8,
      update: (e, dt) => {
        cool -= dt;
        const P = G.player;
        if (!P || G.world.id !== e.worldId || P.sitting || P.vehicle) return;
        const s = e.scale || 1;
        const dx = P.position.x - e.root.position.x, dz = P.position.z - e.root.position.z;
        const top = e.root.position.y + hMat * s;
        if (Math.hypot(dx, dz) < (R - 0.3) * s && Math.abs(P.position.y - top) < 0.25 && P.velocity.y <= 0.5 && cool <= 0) {
          P.velocity.y = 10 + Math.min(6, Math.abs(P.velocity.y) * 0.3);
          P.grounded = false; P.position.y = top + 0.05;
          cool = 0.3;
          if (G.audio) G.audio.play('bounce', e.root.position, { v: 8 });
        }
      },
    };
  },
};

export const rideGen = {
  maxCount: 4,
  estimate: (item) => (item.params.kind === 'rollerCoaster' ? 4 : 2),
  stages: () => [{ name: 'geometry', label: 'Assembling the ride', weight: 3 }, { name: 'textures', label: 'Lighting up', weight: 1 }],
  *build(ctx, item, rng) {
    const a = item.attrs;
    const kind = RIDES[item.params.kind] ? item.params.kind : 'ferrisWheel';
    const k = new Kit(a, rng);
    ctx.stage('geometry', 'Assembling the ' + (item.concept || kind));
    yield;
    const info = RIDES[kind](k, a, rng, item);
    ctx.stage('textures', 'Lighting up');
    yield;
    k.finish();
    const box = solidBounds(k.group);
    const ext = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z, 1);
    const data = {
      root: k.group, name: info.name, category: 'structure', icon: item.icon || '🎡', height: info.height || box.max.y,
      footprint: { radius: ext, rect: { hw: Math.max(box.max.x, -box.min.x), hd: Math.max(box.max.z, -box.min.z) } },
      colliderDefs: k.colliders, lights: k.lights, suppressGrass: false,
      flattenTerrain: info.flatten !== false, flattenFalloff: 4, alwaysUpdate: true,
    };
    if (info.interact) data.interact = info.interact;
    const ticks = k.ticks, upd = info.update;
    data.update = function (dt, t, dist) { for (const f of ticks) f(dt, t, dist ?? 0); if (upd) upd(this, dt, t); };
    return data;
  },
};

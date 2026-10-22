// Pedestrians and bus passengers. Articulated low-poly people rendered with
// one InstancedMesh per body part (procedural walk cycle, sitting, standing).
// Behaviours: sidewalk walkers, people waiting at Route 280 stops, boarding
// through the nearest open door (blocking the closing doors while in the
// doorway), riders seated/standing inside the bus who press STOP and alight.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { BUS, SEATS, STANDING, FRONT_Z } from '../vehicle/BusSpec.js';

const SKIN = [0xf1c8a8, 0xe6b591, 0xd9a07c, 0xc68b62, 0xf3d2bd, 0xa86f4c];
const HAIR = [0x1b1612, 0x3b2a1e, 0x6b4a2e, 0x9a7a52, 0xc9b38a, 0x8a8a88, 0x2a2420];
const TOPS = [0x2b3a55, 0x6e2a2a, 0x2f4d3b, 0x1f1f22, 0x8a8d90, 0xb5651d, 0x50606e, 0x7a3d6b, 0xd8d2c4, 0x3d5a80, 0x9b2c2c, 0x445544];
const LEGS = [0x23314d, 0x1c1c1e, 0x3a3f45, 0x5a6b85, 0x6e604c, 0x2b2b2b];

function partGeo(w, h, d, r = 0.04) {
  const g = new THREE.CapsuleGeometry(Math.min(w, d) / 2, Math.max(0.01, h - Math.min(w, d)), 3, 8);
  g.scale(w / Math.min(w, d), 1, d / Math.min(w, d));
  g.translate(0, -h / 2, 0); // joint at the top
  void r;
  return g;
}

const PARTS = [
  // name, geometry factory, colour slot
  ['torso', () => { const g = partGeo(0.36, 0.56, 0.22); g.translate(0, 0.56, 0); return g; }, 'top'],
  ['head', () => new THREE.SphereGeometry(0.11, 12, 10).scale(0.9, 1.08, 1).translate(0, 0.09, 0), 'skin'],
  ['hair', () => new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.11, 0.01), 'hair'],
  ['armUL', () => partGeo(0.1, 0.3, 0.1), 'top'], ['armUR', () => partGeo(0.1, 0.3, 0.1), 'top'],
  ['armLL', () => partGeo(0.085, 0.28, 0.085), 'top2'], ['armLR', () => partGeo(0.085, 0.28, 0.085), 'top2'],
  ['legUL', () => partGeo(0.15, 0.46, 0.15), 'legs'], ['legUR', () => partGeo(0.15, 0.46, 0.15), 'legs'],
  ['legLL', () => { const g = partGeo(0.12, 0.46, 0.12); const f = new THREE.BoxGeometry(0.1, 0.07, 0.24).translate(0, -0.47, -0.05); return mergeTwo(g, f); }, 'legs'],
  ['legLR', () => { const g = partGeo(0.12, 0.46, 0.12); const f = new THREE.BoxGeometry(0.1, 0.07, 0.24).translate(0, -0.47, -0.05); return mergeTwo(g, f); }, 'legs'],
  ['bag', () => new THREE.BoxGeometry(0.28, 0.36, 0.13).translate(0, 0.3, 0.16), 'bag'],
];

function mergeTwo(a, b) {
  const ga = a.index ? a.toNonIndexed() : a, gb = b.index ? b.toNonIndexed() : b;
  for (const g of [ga, gb]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const pos = new Float32Array(ga.attributes.position.count * 3 + gb.attributes.position.count * 3);
  pos.set(ga.attributes.position.array);
  pos.set(gb.attributes.position.array, ga.attributes.position.count * 3);
  const nrm = new Float32Array(pos.length);
  nrm.set(ga.attributes.normal.array);
  nrm.set(gb.attributes.normal.array, ga.attributes.normal.count * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

export class PedestrianManager {
  constructor({ scene, world, route, quality }) {
    this.scene = scene;
    this.world = world;
    this.route = route;
    this.rand = mulberry32(280);
    this.max = quality === 'balanced' ? 70 : quality === 'high' ? 130 : 180;
    this.walkerTarget = quality === 'balanced' ? 28 : quality === 'high' ? 50 : 70;
    this.peds = []; // world pedestrians
    this.buses = [];
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.parts = PARTS.map(([name, f, slot]) => {
      const im = new THREE.InstancedMesh(f(), mat, this.max);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      im.setColorAt(0, new THREE.Color());
      scene.add(im);
      return { name, im, slot };
    });
    this.M = new THREE.Matrix4();
    this.T = new THREE.Matrix4();
    this.R = new THREE.Matrix4();
    this.root = new THREE.Matrix4();
    this.C = new THREE.Color();
    this.sidewalks = (world.roadBuilder.sidewalkInfo || []).filter((s) => s.pts.length >= 6 && s.width > 1.4);
    this.stopCrowds = new Map(); // stop code -> [peds]
    this.campus = [[300, 1500], [-300, 1900], [-700, 2600], [-1350, -2780]]; // TU, UNSS, NSA/Studentski grad, SU
  }

  newLook() {
    const r = this.rand;
    return {
      skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)], top: TOPS[Math.floor(r() * TOPS.length)],
      top2: r() < 0.7 ? TOPS[Math.floor(r() * TOPS.length)] : SKIN[0], legs: LEGS[Math.floor(r() * LEGS.length)],
      bag: r() < 0.45 ? [0x2a2a2a, 0x5a3a2a, 0x2b4a6a, 0x7a2a2a][Math.floor(r() * 4)] : null,
      scale: 0.92 + r() * 0.14, speed: 1.15 + r() * 0.45, phase: r() * 10,
    };
  }

  attachBus(bus) {
    if (!this.buses.includes(bus)) this.buses.push(bus);
    bus.riders = bus.riders || [];
    bus.phys.passengers = bus.riders.length;
  }

  detachBus(bus) {
    this.buses = this.buses.filter((b) => b !== bus);
  }

  reset() {
    this.peds.length = 0;
    this.stopCrowds.clear();
    this.buses = [];
  }

  waitingAt(stop) {
    const c = this.stopCrowds.get(stop.code);
    return c ? c.filter((p) => p.state === 'wait').length : 0;
  }

  /** Walking position helpers. */
  spawnWalker(focus) {
    for (let k = 0; k < 8; k++) {
      const sw = this.sidewalks[Math.floor(this.rand() * this.sidewalks.length)];
      const n = sw.pts.length / 2;
      const i = Math.floor(this.rand() * (n - 1));
      const x = sw.pts[2 * i], z = sw.pts[2 * i + 1];
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 170 || d < 25) continue;
      let campus = 0;
      for (const [cx, cz] of this.campus) campus = Math.max(campus, 1 - Math.hypot(x - cx, z - cz) / 600);
      const look = this.newLook();
      if (campus > 0.3 && this.rand() < campus) look.bag = 0x2b4a6a;
      this.peds.push({ kind: 'walk', sw, i, t: 0, dir: this.rand() < 0.5 ? 1 : -1, x, z, yaw: 0, look, state: 'walk', anim: look.phase });
      return;
    }
  }

  stopPosition(st, k) {
    const so = (this.world.stopObjects || []).find((o) => o.code === st.code);
    const [fx, fz] = so ? so.dir : [1, 0];
    const [ox, oz] = so ? so.out : [0, 1];
    let bx, bz;
    if (so && so.shelter) { bx = so.shelter[0] - ox * 0.2; bz = so.shelter[2] - oz * 0.2; }
    else if (so && so.pole) { bx = so.pole[0]; bz = so.pole[1]; }
    else { bx = st.pole[0]; bz = st.pole[1]; }
    const along = ((k % 4) - 1.5) * 1.1 + (this.rand() - 0.5) * 0.5;
    const out = Math.floor(k / 4) * 0.9 + (this.rand() - 0.5) * 0.4;
    return { x: bx + fx * along + ox * out, z: bz + fz * along + oz * out, yaw: Math.atan2(ox, oz) };
  }

  /** Keep crowds at the stops near the camera and ahead of the buses. */
  manageStops(focus) {
    const wanted = new Set();
    for (const d of Object.values(this.route.dirs)) {
      for (const st of d.stops) {
        const dist = Math.hypot(st.pole[0] - focus.x, st.pole[1] - focus.z);
        if (dist < 260) wanted.add(st);
      }
    }
    for (const b of this.buses) {
      const n = b.stops.nextStop;
      if (n) wanted.add(n);
    }
    for (const st of wanted) {
      if (this.stopCrowds.has(st.code) || st.isLast) continue;
      let busy = /университет|УНСС|Студентски|СУ|Технически|НСА/.test(st.name) ? 6 : 3;
      if (this.night) busy = Math.ceil(busy / 2);
      const n = Math.floor(this.rand() * (busy + 1)) + (st.isFirst ? 2 : 0);
      const crowd = [];
      for (let k = 0; k < n; k++) {
        const pos = this.stopPosition(st, k);
        crowd.push({ kind: 'stop', stop: st, x: pos.x, z: pos.z, yaw: pos.yaw, look: this.newLook(), state: 'wait', anim: this.rand() * 10 });
      }
      this.stopCrowds.set(st.code, crowd);
    }
    for (const [code, crowd] of this.stopCrowds) {
      const st = crowd[0] ? crowd[0].stop : null;
      if (!st) continue;
      if (Math.hypot(st.pole[0] - focus.x, st.pole[1] - focus.z) > 420 && !this.buses.some((b) => b.stops.nextStop === st)) this.stopCrowds.delete(code);
    }
  }

  /** World position of a door threshold (outside) of a bus. */
  doorPoint(bus, door, out = 0.7) {
    const d = BUS.doors.find((q) => q.id === door.id);
    const sec = d.section === 'front' ? bus.model.front : bus.model.rear;
    const v = new THREE.Vector3(BUS.halfW + out, 0, (d.z0 + d.z1) / 2).applyMatrix4(sec.matrixWorld);
    return v;
  }

  onStopEvent(bus, e) {
    if (e.type === 'terminal') {
      // everybody leaves at the terminal
      for (const r of bus.riders || []) r.dest = e.index;
    }
  }

  update(dt, focus, camera) {
    this.manageStops(focus);
    // walkers
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > 220) this.peds.splice(i, 1);
    }
    const target = Math.round(this.walkerTarget * (this.night ? 0.35 : 1) * (this.rain ? 0.6 : 1));
    for (let k = 0; k < 2 && this.peds.filter((p) => p.kind === 'walk').length < target; k++) this.spawnWalker(focus);
    for (const p of this.peds) this.stepPed(p, dt);
    // bus interaction
    for (const bus of this.buses) this.busInteraction(bus, dt);
    this.render(camera);
  }

  stepPed(p, dt) {
    p.anim += dt * (p.state === 'walk' || p.state === 'toDoor' || p.state === 'leave' ? p.look.speed * 3.0 : 0.6);
    if (p.state === 'walk' && p.kind === 'walk') {
      const pts = p.sw.pts;
      const n = pts.length / 2;
      const j = p.i + p.dir;
      if (j < 0 || j >= n) { p.dir = -p.dir; return; }
      const tx = pts[2 * j], tz = pts[2 * j + 1];
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      const step = p.look.speed * dt;
      if (d <= step) { p.x = tx; p.z = tz; p.i = j; }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step; p.yaw = Math.atan2(-dx, -dz); }
    } else if (p.state === 'leave' && p.goal) {
      const dx = p.goal.x - p.x, dz = p.goal.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { p.state = 'walk'; p.kind = 'walk'; p.sw = this.nearestSidewalk(p.x, p.z); p.i = p.sw ? p.sw.i : 0; p.sw = p.sw ? p.sw.sw : this.sidewalks[0]; p.dir = 1; }
      else { const s = p.look.speed * dt; p.x += (dx / d) * s; p.z += (dz / d) * s; p.yaw = Math.atan2(-dx, -dz); }
    }
  }

  nearestSidewalk(x, z) {
    let best = null;
    for (const sw of this.sidewalks) {
      const p = sw.pts;
      for (let i = 0; i < p.length; i += 4) {
        const d = Math.abs(p[i] - x) + Math.abs(p[i + 1] - z);
        if (!best || d < best.d) best = { d, sw, i: i / 2 };
      }
    }
    return best;
  }

  busInteraction(bus, dt) {
    const riders = bus.riders || (bus.riders = []);
    const atStop = bus.stops.atStop >= 0 ? bus.dir.stops[bus.stops.atStop] : null;
    const doorsOpen = bus.doors.doors.filter((d) => d.state === 'open');
    // reset obstruction flags
    for (const d of bus.doors.doors) d.obstructed = false;
    // stop requests from riders approaching their stop
    const next = bus.stops.nextStop;
    if (next && !bus.stopRequested && riders.some((r) => r.dest === next.index) && bus.stops.distanceToNext(bus.routeS) < 300 && bus.stops.distanceToNext(bus.routeS) > 25) {
      bus.stopRequested = true;
      if (this.onStopRequest) this.onStopRequest(bus);
    }
    if (!atStop || Math.abs(bus.phys.v) > 0.2) {
      bus.boarding = 0;
      return;
    }
    bus.boardTimer = (bus.boardTimer || 0) - dt;
    // alighting
    if (doorsOpen.length && bus.boardTimer <= 0) {
      const leaving = riders.filter((r) => r.dest === atStop.index);
      if (leaving.length) {
        const r = leaving[0];
        riders.splice(riders.indexOf(r), 1);
        const door = doorsOpen[Math.floor(this.rand() * doorsOpen.length)];
        const pIn = this.doorPoint(bus, door, -0.4), pOut = this.doorPoint(bus, door, 2.5);
        this.peds.push({ kind: 'alight', x: pIn.x, z: pIn.z, yaw: 0, look: r.look, state: 'leave', goal: { x: pOut.x, z: pOut.z }, anim: 0, door, bus });
        bus.boardTimer = 0.9;
        bus.phys.passengers = riders.length;
      }
    }
    // boarding
    const crowd = this.stopCrowds.get(atStop.code) || [];
    let boarding = 0;
    for (const p of crowd) {
      if (p.state === 'wait' && doorsOpen.length) {
        // nearest open door
        let best = null;
        for (const d of doorsOpen) {
          const dp = this.doorPoint(bus, d, 0.9);
          const dist = Math.hypot(dp.x - p.x, dp.z - p.z);
          if (!best || dist < best.dist) best = { d, dp, dist };
        }
        if (best && best.dist < 26) { p.state = 'toDoor'; p.door = best.d; }
      }
      if (p.state === 'toDoor') {
        boarding++;
        if (p.door.state !== 'open' && p.door.state !== 'opening') { p.state = 'wait'; continue; }
        const dp = this.doorPoint(bus, p.door, 0.6);
        const dx = dp.x - p.x, dz = dp.z - p.z, d = Math.hypot(dx, dz);
        const step = p.look.speed * dt * 1.1;
        if (d < 1.2) p.door.obstructed = true;
        if (d <= step + 0.05) {
          // step in
          p.state = 'gone';
          riders.push({ look: p.look, dest: this.pickDest(bus, atStop), seat: this.freeSeat(bus), anim: this.rand() * 10 });
          bus.phys.passengers = riders.length;
        } else {
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.yaw = Math.atan2(-dx, -dz);
        }
      }
    }
    for (const p of this.peds) if (p.kind === 'alight' && p.bus === bus && p.state === 'leave') {
      const dp = this.doorPoint(bus, p.door, 0.6);
      if (Math.hypot(dp.x - p.x, dp.z - p.z) < 1.0) p.door.obstructed = true;
    }
    this.stopCrowds.set(atStop.code, crowd.filter((p) => p.state !== 'gone'));
    bus.boarding = boarding + riders.filter((r) => r.dest === atStop.index).length;
  }

  pickDest(bus, from) {
    const n = bus.dir.stops.length;
    const lo = from.index + 1;
    // students travel to Studentski grad / universities more often
    if (this.rand() < 0.35) return n - 1;
    return Math.min(n - 1, lo + Math.floor(this.rand() * (n - lo)));
  }

  freeSeat(bus) {
    const used = new Set((bus.riders || []).map((r) => r.seat));
    const free = SEATS.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length && this.rand() < 0.85) return free[Math.floor(this.rand() * free.length)];
    return -1 - Math.floor(this.rand() * 40); // standing
  }

  /** Test whether a pedestrian blocks a car's path: returns gap or null. */
  blocking(x, z, fx, fz, range) {
    let best = null;
    for (const p of this.peds) {
      const rx = p.x - x, rz = p.z - z;
      const along = rx * fx + rz * fz;
      if (along < 0 || along > range) continue;
      if (Math.abs(-rx * fz + rz * fx) > 1.4) continue;
      if (best == null || along < best) best = along;
    }
    return best;
  }

  // ---------------------------------------------------------------- rendering
  pose(p, mode) {
    const a = p.anim;
    if (mode === 'walk') {
      const s = Math.sin(a), c = Math.cos(a);
      return { legL: s * 0.55, legR: -s * 0.55, kneeL: -Math.max(0, -c) * 0.7, kneeR: -Math.max(0, c) * 0.7, armL: -s * 0.45, armR: s * 0.45, elbow: 0.25, bob: Math.abs(c) * 0.035, lean: -0.05 };
    }
    if (mode === 'sit') return { legL: 1.45, legR: 1.45, kneeL: -1.5, kneeR: -1.5, armL: 0.5, armR: 0.5, elbow: 0.9, bob: 0, lean: 0.05, sit: true };
    const sway = Math.sin(a * 0.5) * 0.03;
    return { legL: sway, legR: -sway, kneeL: -0.02, kneeR: -0.02, armL: 0.05, armR: mode === 'hold' ? 2.6 : 0.05, elbow: mode === 'hold' ? 0.2 : 0.12, bob: 0, lean: 0 };
  }

  writeHuman(idx, base, look, pose) {
    const parts = this.parts;
    const M = this.M, T = this.T, R = this.R;
    const set = (k, m) => parts[k].im.setMatrixAt(idx, m);
    const sc = look.scale;
    const root = this.root.copy(base).multiply(T.makeScale(sc, sc, sc));
    const hipY = pose.sit ? 0.47 : 0.93 + pose.bob;
    // torso
    M.copy(root).multiply(T.makeTranslation(0, hipY, 0)).multiply(R.makeRotationX(pose.lean));
    set(0, M);
    const torso = M.clone();
    set(1, M.clone().multiply(T.makeTranslation(0, 0.66, 0)));
    set(2, M.clone().multiply(T.makeTranslation(0, 0.66, 0)));
    // arms
    for (const [k, side, sw] of [[3, -1, pose.armL], [4, 1, pose.armR]]) {
      const ua = torso.clone().multiply(T.makeTranslation(side * 0.22, 0.52, 0)).multiply(R.makeRotationX(sw)).multiply(T.makeRotationZ(side * 0.08));
      set(k, ua);
      set(k + 2, ua.clone().multiply(T.makeTranslation(0, -0.3, 0)).multiply(R.makeRotationX(pose.elbow)));
    }
    // legs
    for (const [k, side, sw, knee] of [[7, -1, pose.legL, pose.kneeL], [8, 1, pose.legR, pose.kneeR]]) {
      const th = root.clone().multiply(T.makeTranslation(side * 0.1, hipY, 0)).multiply(R.makeRotationX(sw));
      set(k, th);
      set(k + 2, th.clone().multiply(T.makeTranslation(0, -0.46, 0)).multiply(R.makeRotationX(knee)));
    }
    // bag (hidden by scaling to zero when the person has none)
    set(11, look.bag ? torso : T.makeScale(0, 0, 0));
    const C = this.C;
    for (let k = 0; k < parts.length; k++) {
      const slot = parts[k].slot;
      C.setHex(slot === 'bag' ? look.bag || 0 : look[slot]);
      parts[k].im.setColorAt(idx, C);
    }
  }

  render(camera) {
    let n = 0;
    const base = new THREE.Matrix4();
    const hf = this.world.hf;
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const camPos = camera ? camera.position : null;
    const emit = (p, mode) => {
      if (n >= this.max) return;
      if (camPos && Math.abs(p.x - camPos.x) + Math.abs(p.z - camPos.z) > 190) return;
      q.setFromAxisAngle(up, p.yaw || 0);
      base.compose(pos.set(p.x, hf.heightAt(p.x, p.z) + 0.22, p.z), q, one);
      this.writeHuman(n++, base, p.look, this.pose(p, mode));
    };
    for (const p of this.peds) emit(p, 'walk');
    for (const crowd of this.stopCrowds.values()) for (const p of crowd) emit(p, p.state === 'toDoor' ? 'walk' : 'stand');
    // riders inside buses (in section space)
    for (const bus of this.buses) {
      const riders = bus.riders || [];
      if (bus.hideRiders) continue;
      for (const r of riders) {
        if (n >= this.max) break;
        if (!r.look) continue;
        let sec, local, yaw, mode;
        if (r.seat >= 0) {
          const s = SEATS[r.seat];
          sec = s.sec;
          local = new THREE.Vector3(s.x, s.fy - 0.05, s.z + 0.08);
          yaw = s.yaw;
          mode = 'sit';
        } else {
          const k = -r.seat - 1;
          const area = STANDING[k % STANDING.length];
          sec = area.sec;
          const fx = ((k * 0.37) % 1), fz = ((k * 0.61) % 1);
          local = new THREE.Vector3(area.x0 + (area.x1 - area.x0) * fx, BUS.floorY, area.z0 + (area.z1 - area.z0) * fz);
          yaw = (k % 3) * 0.8;
          mode = 'hold';
        }
        const g = sec === 'front' ? bus.model.front : bus.model.rear;
        q.setFromAxisAngle(up, yaw);
        base.compose(local, q, one).premultiply(g.matrixWorld);
        // never draw someone the camera (the player's eyes) is standing inside
        if (camPos && Math.hypot(base.elements[12] - camPos.x, base.elements[14] - camPos.z) < 0.55 && Math.abs(base.elements[13] + 1.6 - camPos.y) < 1) continue;
        r.anim = (r.anim || 0) + 0.016;
        this.writeHuman(n++, base, r.look, this.pose(r, mode));
      }
    }
    for (const p of this.parts) {
      p.im.count = n;
      p.im.instanceMatrix.needsUpdate = true;
      if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true;
    }
  }
}

export { FRONT_Z };

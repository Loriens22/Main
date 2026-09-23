// NPC behaviours on top of the instanced Humans renderer.
import * as THREE from 'three';
import { Humans } from './humans.js';
import { B } from '../bus/model.js';
import { makeRng, clamp, wrapAngle, lerp } from '../util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class People {
  constructor(humans, route, rig) {
    this.H = humans; this.route = route; this.rig = rig;
    this.npcs = [];
    this.rnd = makeRng(9);
    this.t = 0;
    this.visT = 0;
    this.pedPts = [];
    this.seats = rig.seats.map((s) => ({ ...s, npc: null }));
    // standing spots near doors (local coords per section)
    this.standSpots = [];
    for (const [sec, doors] of [['front', B.doorsF.slice(1)], ['rear', B.doorsR]]) for (const [d0, d1] of doors) {
      this.standSpots.push({ section: sec, x: 0.2, z: (d0 + d1) / 2 - 0.3, npc: null }, { section: sec, x: -0.3, z: (d0 + d1) / 2 + 0.4, npc: null });
    }
  }
  body(sec) { return sec === 'front' ? this.rig.frontBody : this.rig.rearBody; }
  mk(kind, opts = {}) {
    const h = this.H.add(opts); if (!h) return null;
    const n = { h, kind, state: 'idle', path: [], speed: opts.speed || 1.25 + this.rnd() * 0.3, t: this.rnd() * 10, anim: 'stand', yawT: 0 };
    this.npcs.push(n);
    return n;
  }
  /* --------------------------- spawning --------------------------- */
  spawn(reg, walkPaths) {
    const R = this.rnd;
    // terrace people
    for (const tr of reg.terraces.slice(0, 140)) {
      const n = this.mk('terrace', { old: R() < 0.3 });
      n.h.pos.copy(tr.p); n.h.yaw = tr.yaw + Math.PI; // stand facing outwards
      n.anim = ['lean', 'lean', 'smoke', 'phone', 'stand', 'laundry'][Math.floor(R() * 6)];
    }
    // market sellers
    for (const s of reg.sellers || []) { const n = this.mk('fixed', { old: R() < 0.5 }); n.h.pos.copy(s.p); n.h.pos.y = 0.02; n.h.yaw = s.yaw + Math.PI; n.anim = 'stand'; }
    // shoppers in front of the market
    if (reg.market) for (let k = 0; k < 4; k++) {
      const n = this.mk('fixed'); const M = reg.market.M;
      n.h.pos.copy(V(-6 + k * 4 + R(), 0.02, -1.7 - R()).applyMatrix4(M)); n.h.yaw = new THREE.Euler().setFromRotationMatrix(M, 'YXZ').y; n.anim = R() < 0.5 ? 'phone' : 'stand';
    }
    // benches
    for (const b of reg.benches) if (R() < 0.7) { const n = this.mk('fixed', { old: R() < 0.6 }); n.h.pos.copy(b.p); n.h.yaw = b.yaw; n.anim = 'sitBench'; }
    // playground kids + parents
    if (reg.playground) {
      const pg = reg.playground;
      pg.swings.forEach((sw, i) => { const n = this.mk('swing', { kid: true }); n.anchor = sw.clone(); n.swingPh = i * 1.3; });
      for (let k = 0; k < 4; k++) { const n = this.mk('kid', { kid: true }); n.area = pg.area; n.h.pos.copy(pg.area.c); n.h.pos.x += (R() - 0.5) * 6; n.h.pos.z += (R() - 0.5) * 6; n.speed = 1.6 + R(); }
      for (let k = 0; k < 2; k++) { const n = this.mk('fixed'); n.h.pos.copy(pg.area.c); n.h.pos.x += (R() - 0.5) * 12; n.h.pos.z += (R() - 0.5) * 8; n.h.pos.y = 0.03; n.h.yaw = R() * 6; n.anim = k ? 'phone' : 'stand'; }
    }
    // waiting passengers at stops
    this.stops = reg.stopsInfo.map((si) => ({ ...si, waiting: [] }));
    const counts = { borovo: 8, dcc20: 7, su36: 4 };
    for (const st of this.stops) {
      const n0 = counts[st.id] || 4;
      for (let k = 0; k < n0 && k < st.wait.length; k++) {
        const n = this.mk('waiter', { old: R() < 0.3 });
        n.stopId = st.id; n.home = st.wait[k];
        n.h.pos.copy(st.wait[k].p); n.h.yaw = st.wait[k].yaw; n.anim = R() < 0.35 ? 'phone' : 'stand';
        st.waiting.push(n);
      }
    }
    // pedestrians walking along sidewalks
    this.walkPaths = walkPaths.filter((w) => !w.ring && w.b - w.a > 30);
    for (let k = 0; k < 70; k++) {
      const wp = this.walkPaths[Math.floor(R() * this.walkPaths.length)];
      const n = this.mk('walker', { old: R() < 0.2 });
      n.wp = wp; n.s = wp.a + R() * (wp.b - wp.a); n.dir = R() < 0.5 ? 1 : -1; n.latOff = (R() - 0.5) * 2.2;
      this.placeWalker(n);
    }
  }
  placeWalker(n) {
    const o = n.wp.st.poly.at(n.s, n._o || (n._o = {}));
    const lat = n.wp.lat + n.latOff;
    n.h.pos.set(o.x - Math.sin(o.h) * lat, 0.15, o.z + Math.cos(o.h) * lat);
    const hh = o.h + (n.dir < 0 ? Math.PI : 0);
    n.h.yaw = Math.atan2(Math.cos(hh), Math.sin(hh));
  }
  /* ------------------------ bus passengers ------------------------ */
  /** Called while the bus stands at stop `stopId` with the listed door indices open. */
  serviceStop(stopId, openDoors, bus) {
    const st = this.stops.find((s) => s.id === stopId);
    // alighting first
    for (const n of this.npcs) {
      if (n.kind !== 'pax' || n.state !== 'seated' || n.dest !== stopId) continue;
      const door = this.nearestDoor(n.section, n.h.pos.z, openDoors);
      if (door) this.startAlight(n, door);
    }
    if (!st) return;
    const alighting = this.npcs.some((n) => n.kind === 'pax' && n.state === 'alight');
    for (const n of st.waiting.slice()) {
      if (n.state !== 'idle') continue;
      if (alighting && this.rnd() < 0.97) continue; // let people out first
      const door = this.nearestDoorWorld(n.h.pos, openDoors);
      if (!door) continue;
      const seat = this.freeSeat(door.section, (door.d0 + door.d1) / 2);
      this.startBoard(n, door, seat, bus);
      st.waiting.splice(st.waiting.indexOf(n), 1);
      break; // one at a time per frame keeps it natural
    }
  }
  nearestDoor(section, z, openDoors) {
    let best = null, bd = 1e9;
    for (const i of openDoors) { const d = this.rig.doors[i]; if (d.section !== section) continue; const dd = Math.abs((d.d0 + d.d1) / 2 - z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  nearestDoorWorld(p, openDoors) {
    let best = null, bd = 1e9;
    for (const i of openDoors) {
      const d = this.rig.doors[i]; if (d.open < 0.95) continue;
      const w = V(B.hw + 1.1, 0, (d.d0 + d.d1) / 2).applyMatrix4(this.body(d.section).matrixWorld);
      const dd = w.distanceTo(p); if (dd < bd && dd < 30) { bd = dd; best = d; }
    }
    return best;
  }
  freeSeat(section, z) {
    const free = this.seats.filter((s) => !s.npc && s.section === section);
    if (!free.length) return this.standSpots.find((s) => !s.npc && s.section === section) || null;
    free.sort((a, b) => Math.abs(a.z - z) + a.x * 0.1 - (Math.abs(b.z - z) + b.x * 0.1) + (this.rnd() - 0.5) * 3);
    return free[0];
  }
  startBoard(n, door, seat, bus) {
    const body = this.body(door.section);
    const zc = (door.d0 + door.d1) / 2 + (this.rnd() - 0.5) * 0.6;
    n.kind = 'pax'; n.state = 'board'; n.section = door.section; n.door = door; n.seat = seat;
    if (seat) seat.npc = n;
    n.dest = pickDest(n.stopId, this.rnd);
    n.path = [
      { p: V(B.hw + 1.0, 0.15, zc).applyMatrix4(body.matrixWorld), world: true },
      { p: V(B.hw + 0.35, 0.15, zc).applyMatrix4(body.matrixWorld), world: true, door: true },
      { p: V(0.85, B.yFloor, zc), local: true, door: true },
      { p: V(0.25, B.yFloor, zc), local: true },
    ];
    if (seat) {
      const base = seat.base ?? B.yFloor;
      n.path.push({ p: V(0.1 * Math.sign(seat.x || 1), B.yFloor, seat.z + (seat.yaw ? -0.45 : 0.45)), local: true });
      n.path.push({ p: V(seat.x, base, seat.z + (seat.yaw ? -0.02 : 0.02)), local: true, sit: true });
    }
    n.speed = 1.1 + this.rnd() * 0.3;
    bus.passengers++;
  }
  startAlight(n, door) {
    const zc = (door.d0 + door.d1) / 2;
    n.state = 'alight'; n.door = door;
    if (n.seat) { n.seat.npc = null; }
    const body = this.body(n.section);
    n.path = [
      { p: V(0.15, B.yFloor, n.h.pos.z), local: true },
      { p: V(0.3, B.yFloor, zc), local: true },
      { p: V(0.9, B.yFloor, zc), local: true, door: true },
      { p: V(B.hw + 0.4, 0.15, zc), toWorld: true, door: true },
      { p: V(B.hw + 3 + this.rnd() * 2, 0.15, zc + (this.rnd() - 0.5) * 8), bodyWorld: body },
    ];
    n.speed = 1.2;
  }
  /* ----------------------------- update ----------------------------- */
  update(dt, cam, bus, info, camera) {
    this.t += dt;
    this.H.begin(camera);
    this.H.shadowNear = cam;
    const R = this.rnd;
    this.visT -= dt;
    const doLod = this.visT <= 0; if (doLod) this.visT = 0.5;
    const doorsBlocked = new Set();
    const peds = this.pedPts; peds.length = 0;
    for (const n of this.npcs) {
      const h = n.h;
      n.t += dt;
      if (doLod) {
        if (h.parent) h.visible = true;
        else { const d = Math.hypot(h.pos.x - cam.x, h.pos.z - cam.z); h.visible = d < (n.kind === 'terrace' ? 230 : 170); }
      }
      switch (n.kind) {
        case 'terrace':
          if (!h.visible) break;
          if (Math.floor(n.t / 25 + h.seed * 10) !== n.phaseIdx) { n.phaseIdx = Math.floor(n.t / 25 + h.seed * 10); if (R() < 0.3) n.anim = ['lean', 'smoke', 'phone', 'stand'][Math.floor(R() * 4)]; }
          this.pose(n, n.anim);
          break;
        case 'fixed': this.pose(n, n.anim); break;
        case 'swing': {
          const a = Math.sin(this.t * 2.2 + n.swingPh) * 0.55;
          const L = 1.9;
          h.pos.set(n.anchor.x, n.anchor.y - Math.cos(a) * L - 0.55, n.anchor.z + Math.sin(a) * L * 0.8);
          h.yaw = Math.PI / 2;
          Humans.sit(h.pose, this.t, h.seed, 0.45);
          h.pose.spine = -a * 0.4; h.pose.knL = h.pose.knR = 1.2 + a * 0.6;
          h.pose.shL = [-2.6, 0.1]; h.pose.shR = [-2.6, 0.1]; h.pose.elL = h.pose.elR = -0.2;
          break;
        }
        case 'kid': {
          if (!n.target || n.h.pos.distanceTo(n.target) < 0.4) {
            const A = n.area; n.target = V(A.c.x + (R() - 0.5) * A.W * 0.8, 0.03, A.c.z + (R() - 0.5) * A.D * 0.8); n.pause = R() * 2;
          }
          if (n.pause > 0) { n.pause -= dt; Humans.stand(h.pose, this.t, h.seed); break; }
          this.moveTo(n, n.target, dt, 1.9);
          Humans.walk(h.pose, n.t * 11, 1.2);
          break;
        }
        case 'walker': {
          if (!h.visible && n.t % 1 > dt) { n.s += n.dir * n.speed * dt; break; }
          n.s += n.dir * n.speed * dt;
          if (n.s > n.wp.b - 2 || n.s < n.wp.a + 2) { n.dir *= -1; n.s = clamp(n.s, n.wp.a + 2, n.wp.b - 2); }
          if (n.stopT > 0) { n.stopT -= dt; n.s -= n.dir * n.speed * dt; Humans.phone(h.pose, this.t, h.seed); }
          else { if (R() < dt * 0.02) n.stopT = 3 + R() * 6; Humans.walk(h.pose, n.t * 5.6 * n.speed / 1.3, 0.9); }
          this.placeWalker(n);
          if (h.visible) peds.push(h.pos.x, h.pos.z);
          break;
        }
        case 'waiter': {
          const bs = info?.stopAt;
          if (bs === n.stopId && n.state === 'idle') { /* waiting for boarding turn */ }
          this.pose(n, n.anim);
          // face the arriving bus
          break;
        }
        case 'pax': this.updatePax(n, dt, bus, doorsBlocked); break;
        case 'gone': h.visible = false; break;
      }
      if (h.visible) this.H.write(h);
    }
    for (const d of this.rig.doors) d.blocked = doorsBlocked.has(d);
  }
  pose(n, anim) {
    const h = n.h;
    switch (anim) {
      case 'lean': Humans.lean(h.pose, this.t, h.seed); break;
      case 'smoke': Humans.smoke(h.pose, this.t, h.seed); break;
      case 'phone': Humans.phone(h.pose, this.t, h.seed); break;
      case 'laundry': Humans.laundry(h.pose, this.t, h.seed); break;
      case 'sitBench': Humans.sit(h.pose, this.t, h.seed, 0.45); break;
      default: Humans.stand(h.pose, this.t, h.seed);
    }
  }
  moveTo(n, target, dt, speed) {
    const h = n.h;
    const dx = target.x - h.pos.x, dz = target.z - h.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      const st = Math.min(d, speed * dt);
      h.pos.x += (dx / d) * st; h.pos.z += (dz / d) * st;
      const yawT = Math.atan2(dx, dz);
      h.yaw += wrapAngle(yawT - h.yaw) * Math.min(1, dt * 8);
    }
    h.pos.y = lerp(h.pos.y, target.y, Math.min(1, dt * 6));
    return d;
  }
  updatePax(n, dt, bus, blocked) {
    const h = n.h;
    if (n.state === 'seated') {
      if (n.seat && n.seat.base !== undefined) Humans.sit(h.pose, this.t, h.seed, 0.46); else Humans.stand(h.pose, this.t, h.seed);
      return;
    }
    if (n.state === 'board' || n.state === 'alight') {
      const wp = n.path[0];
      if (!wp) {
        if (n.state === 'board') { n.state = 'seated'; if (n.seat) h.yaw = (n.seat.yaw || 0) + Math.PI; }
        else { n.kind = 'walkaway'; n.state = 'gone'; n.kind = 'gone'; h.visible = false; }
        return;
      }
      if (wp.door) blocked.add(n.door);
      // doors closed in front of a boarding passenger → wait
      if (n.state === 'board' && wp.door && n.door.open < 0.9) { Humans.stand(h.pose, this.t, h.seed); return; }
      // coordinate frame switches
      const body = this.body(n.section);
      if (wp.local && !h.parent) {
        // entering: convert world position to bus-local
        const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
        h.pos.applyMatrix4(inv); h.parent = body; h.yaw = -Math.PI / 2;
      }
      if ((wp.toWorld || wp.bodyWorld) && h.parent) {
        h.pos.applyMatrix4(body.matrixWorld); h.parent = null; h.yaw = wrapAngle(h.yaw + new THREE.Euler().setFromRotationMatrix(body.matrixWorld, 'YXZ').y);
        if (wp.toWorld) wp.p = wp.p.clone().applyMatrix4(body.matrixWorld);
      }
      if (wp.bodyWorld) { wp.p = wp.p.clone().applyMatrix4(wp.bodyWorld.matrixWorld); wp.bodyWorld = null; wp.world = true; }
      if (wp.toWorld) { wp.toWorld = false; wp.world = true; }
      const d = this.moveTo(n, wp.p, dt, n.speed);
      Humans.walk(h.pose, n.t * 5.4, 0.8);
      if (d < 0.12) {
        n.path.shift();
        if (wp.sit) { n.state = 'seated'; h.yaw = (n.seat.yaw || 0) + Math.PI; }
      }
    }
  }
  /** Passengers still walking to/from doors (keeps doors open). */
  busy() { return this.npcs.some((n) => n.kind === 'pax' && (n.state === 'board' || n.state === 'alight')); }
  waitingAt(stopId) { const s = this.stops?.find((q) => q.id === stopId); return s ? s.waiting.length : 0; }
  onBoard() { return this.npcs.filter((n) => n.kind === 'pax' && n.state !== 'alight').length; }
  alightingFor(stopId) { return this.npcs.filter((n) => n.kind === 'pax' && n.state === 'seated' && n.dest === stopId).length; }
  /** Reset (restart route): remove passengers, re-seed waiting people */
  resetPax() {
    for (const n of this.npcs) if (n.kind === 'pax' || n.kind === 'gone') { n.kind = 'gone'; n.h.visible = false; n.h.parent = null; }
    for (const s of this.seats) s.npc = null;
  }
}

function pickDest(from, rnd) {
  if (from === 'borovo') return rnd() < 0.45 ? 'dcc20' : rnd() < 0.7 ? 'su36' : 'beyond';
  if (from === 'dcc20') return rnd() < 0.6 ? 'su36' : 'beyond';
  return 'beyond';
}

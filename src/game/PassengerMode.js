// Passenger mode: wait at a real stop, board bus 280 through an open door,
// walk through both articulated sections, sit or stand, press STOP and get
// off. The bus is driven by the AI; if you miss it, the next one comes.
import * as THREE from 'three';
import { BusEntity } from '../gameplay/BusEntity.js';
import { AIBusDriver } from '../gameplay/AIBusDriver.js';
import { BUS, FRONT_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z, REAR_Z } from '../vehicle/BusSpec.js';
import { SEATS } from '../vehicle/BusLayout.js';
import { clamp, damp } from '../core/math.js';
import { t, L } from '../ui/i18n.js';

const EYE = 1.63;
const HEADWAY_S = 120; // a 280 every ~2 minutes: the next one after you get off or miss one
const AVG_SPEED = 9.5; // m/s between stops when the bus only stops where needed (measured headless)

export class PassengerMode {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.dirId = opts.dirId || 'A';
    const dir = game.route.direction(this.dirId);
    this.startStop = dir.stops[Math.min(opts.stopIndex ?? 3, dir.stops.length - 2)];
    this.yaw = 0;
    this.pitch = -0.05;
    this.state = 'outside';
    this.camMode = 'eyes';
    this.buses = [];
    this.vel = new THREE.Vector3();
    this.sway = new THREE.Vector3();
    this.tmpV = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    // stand on the pavement a few metres before the stop, looking up the road for the bus
    const P = dir.path;
    const c = P.at(this.startStop.s);
    const t = P.tangent(this.startStop.s, 6);
    const rx = -t.tz, rz = t.tx;
    const hw = game.route.laneInfo(this.dirId, this.startStop.s).halfWidth;
    let off = hw + 1.9;
    for (let k = 0; k < 6 && game.world.bgrid.pointInAny(c.x + rx * off - t.tx * 7, c.z + rz * off - t.tz * 7) >= 0; k++) off -= 0.4;
    this.pos = new THREE.Vector3(c.x + rx * off - t.tx * 7, 0, c.z + rz * off - t.tz * 7);
    const vx = -t.tx * 0.8 - rx * 0.6, vz = -t.tz * 0.8 - rz * 0.6;
    this.yaw = Math.atan2(-vx, -vz);
    this.scheduleBus(70);
    game.hud.toast(L(`${this.startStop.name} — изчакайте автобус 280`, `${this.startStop.name} — wait for bus 280`), false, 5);
    game.rig.shake = 0;
  }

  /** Send the next bus so that it reaches the player's stop in about `eta` seconds. */
  scheduleBus(eta) {
    const stop = this.startStop;
    let s = stop.frontS - eta * AVG_SPEED;
    let hold = 0;
    if (s < 0) { hold = -s / AVG_SPEED; s = 0; } // it departs from the terminal a bit later
    const bus = this.spawnBus(s, { hold });
    bus.target = stop;
    return bus;
  }

  /** Buses of the player's direction that have not reached the player's stop yet. */
  approaching() {
    const st = this.startStop;
    return this.buses.filter((b) => b !== this.ride && b.dirId === this.dirId && b.routeS != null && b.routeS < st.frontS - 3 && !b.stops.served.has(st.index));
  }

  /** Seconds until the bus reaches the player's stop (rough, from distance and terminal wait). */
  etaOf(bus) {
    return Math.max(0, (bus.holdFor || 0) + (this.startStop.frontS - (bus.routeS ?? 0)) / AVG_SPEED);
  }

  spawnBus(s, { hold = 0 } = {}) {
    const g = this.game;
    const fleets = ['3145', '3153', '2319'];
    const bus = new BusEntity({ scene: g.scene, world: g.world, route: g.route, dirId: this.dirId, fleet: fleets[this.buses.length % 3], quality: g.quality });
    // advance the stop counter to where the bus is placed
    const dir = bus.dir;
    let idx = 0;
    while (idx < dir.stops.length - 1 && dir.stops[idx].frontS < s + 5) idx++;
    bus.stops.next = idx;
    bus.placeAt(Math.max(0, s));
    bus.routeS = Math.max(0, s); // known before its first update (ETA, scheduling)
    bus.lights.head = g.sky.night > 0.3;
    bus.driver = new AIBusDriver(bus, { traffic: g.traffic, signals: g.traffic && g.traffic.signals, peds: g.peds });
    if (s <= 0) {
      // waiting at the terminal with the doors open until its departure time
      bus.holdFor = hold;
      bus.doors.open(null, 0);
      bus.driver.state = 'dwell';
    }
    bus.forceServe = this.startStop.index;
    g.wireBus(bus);
    if (g.peds) g.peds.attachBus(bus);
    // a few riders already on board
    if (g.peds) for (let i = 0; i < 6 + Math.floor(Math.random() * 10); i++) bus.riders.push({ look: g.peds.newLook(), dest: Math.min(dir.stops.length - 1, idx + Math.floor(Math.random() * (dir.stops.length - idx))), seat: g.peds.freeSeat(bus), anim: Math.random() * 10 });
    bus.phys.v = s > 0 ? 9 : 0;
    this.buses.push(bus);
    g.extra = this.buses.filter((b) => b !== g.bus);
    if (!g.bus) g.bus = bus;
    return bus;
  }

  cycleCamera() {
    this.camMode = this.camMode === 'eyes' ? 'cinematic' : 'eyes';
    this.game.hud.toast(this.camMode === 'eyes' ? L('Изглед: от първо лице', 'View: first person') : L('Изглед: кинематографичен', 'View: cinematic'));
  }

  /** The bus the player is in (or the nearest one). */
  get myBus() {
    return this.ride || this.buses[0];
  }

  update(dt, inp) {
    const g = this.game;
    const I = g.input;
    // AI buses
    for (const bus of this.buses) {
      const ctl = bus.driver.update(dt);
      bus.update(dt, ctl);
      bus.syncVisual();
      for (const e of bus.events.splice(0)) g.onStopEvent(bus, e);
    }
    // the service: while the player waits there is always a 280 on its way, and it stops for them
    if (this.state === 'outside') for (const b of this.approaching()) b.forceServe = this.startStop.index;
    if (this.state === 'outside' && !this.approaching().length) {
      const missed = this.buses.some((b) => b.dirId === this.dirId && b.target === this.startStop && b.routeS > this.startStop.frontS + 30);
      this.scheduleBus(HEADWAY_S);
      if (missed) g.hud.toast(L(`Изпуснахте автобуса. Следващият 280 идва след ${HEADWAY_S / 60} мин`, `You missed the bus. The next 280 arrives in ${HEADWAY_S / 60} min`), false, 5);
    }
    for (let i = this.buses.length - 1; i >= 0; i--) {
      const b = this.buses[i];
      const far = b.camDist > 900;
      const gone = b.dirId !== this.dirId || b.routeS > this.startStop.frontS + 300;
      if (b !== this.ride && (b.stops.finished || (far && gone))) {
        if (g.peds) g.peds.detachBus(b);
        b.dispose();
        this.buses.splice(i, 1);
      }
    }
    const coming = this.state === 'outside' ? this.approaching().sort((a, b) => this.etaOf(a) - this.etaOf(b))[0] : null;
    g.bus = this.ride || coming || this.buses[0];
    g.extra = this.buses.filter((b) => b !== g.bus);
    // look
    this.yaw -= inp.lookX;
    this.pitch = clamp(this.pitch - inp.lookY, -1.35, 1.35);
    if (I.hit('Tab')) this.cycleCamera();
    if (this.state === 'outside') this.updateOutside(dt, inp);
    else this.updateInside(dt, inp);
    // HUD
    const bus = this.myBus;
    const camPos = g.camera.position;
    for (const b of this.buses) b.camDist = camPos.distanceTo(b.model.front.position);
    if (bus) {
      const next = bus.stops.nextStop;
      g.hud.update(dt, {
        headsign: bus.dir.headsign, nextStop: next ? next.name : '—', atStop: bus.stops.atStop >= 0,
        dist: this.ride && next ? next.frontS - bus.routeS : bus.camDist, delay: null, stopRequested: bus.stopRequested,
        fps: g.settings.showFps ? g.fpsAcc.fps : null, quality: g.quality,
      });
      g.hud.q.lbl.textContent = this.ride ? (bus.stops.atStop >= 0 ? t('stop') : t('nextStop')) : L(`Следващ 280 · ${this.startStop.name}`, `Next 280 · ${this.startStop.name}`);
      g.hud.q.name.textContent = this.ride ? (next ? next.name : '—') : `→ ${bus.dir.headsign}`;
      if (!this.ride) {
        const atStop = bus.target === this.startStop && bus.stops.atStop === this.startStop.index;
        const eta = this.etaOf(bus);
        const mm = Math.floor(eta / 60), ss = Math.floor(eta % 60);
        g.hud.q.dist.textContent = atStop ? L('На спирката — качете се!', 'At the stop — get on!') : eta < 20 ? L('Пристига…', 'Arriving…') : `${mm}:${String(ss).padStart(2, '0')} ${L('мин', 'min')} · ${Math.round(bus.camDist)} ${L('м', 'm')}`;
        this.boardT = (this.boardT || 0) - dt;
        if (this.boardT <= 0 && g.furniture && g.furniture.setBoard) {
          this.boardT = 1;
          g.furniture.setBoard(this.startStop.code, atStop || eta < 20 ? 0 : Math.ceil(eta / 60));
        }
      }
      this.mapT = (this.mapT || 0) - dt;
      if (this.mapT <= 0) {
        this.mapT = 0.15;
        const yawCam = Math.atan2(-g.camera.getWorldDirection(this.tmpV).x, -this.tmpV.z);
        g.hud.drawMap(g.route, bus.dirId, { x: camPos.x, z: camPos.z, yaw: yawCam }, bus.stops.next);
      }
    }
  }

  // ---------------------------------------------------------------- outside
  updateOutside(dt, inp) {
    const g = this.game;
    const speed = inp.run ? 3.2 : 1.45;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let mx = (fx * inp.moveY + rx * inp.moveX) * speed * dt, mz = (fz * inp.moveY + rz * inp.moveX) * speed * dt;
    const nx = this.pos.x + mx, nz = this.pos.z + mz;
    // collide with buildings and buses
    let blocked = g.world.bgrid.pointInAny(nx, nz) >= 0;
    let boardDoor = null;
    for (const bus of this.buses) {
      for (const box of bus.phys.boxes()) {
        const lx = (nx - box.cx) * box.fx + (nz - box.cz) * box.fz, lz = (nx - box.cx) * -box.fz + (nz - box.cz) * box.fx;
        if (Math.abs(lx) < box.hl + 0.25 && Math.abs(lz) < box.hw + 0.25) blocked = true;
      }
      // open door nearby -> board
      for (const d of bus.doors.doors) {
        if (d.openness < 0.6 || d.state === 'closing') continue;
        const dp = g.peds.doorPoint(bus, d, 0.35);
        const dd = Math.hypot(dp.x - nx, dp.z - nz);
        if ((dd < 0.8 && Math.hypot(inp.moveX, inp.moveY) > 0.2) || (dd < 2.2 && g.input.hit('KeyE'))) boardDoor = { bus, door: d };
      }
    }
    if (boardDoor) return this.board(boardDoor.bus, boardDoor.door);
    if (!blocked) { this.pos.x = nx; this.pos.z = nz; }
    const y = g.world.hf.heightAt(this.pos.x, this.pos.z) + (g.world.roads.onRoad(this.pos.x, this.pos.z) ? 0.07 : 0.22);
    this.pos.y = damp(this.pos.y || y, y, 12, dt);
    // prompt when a bus with open doors is close
    const near = this.buses.find((b) => b.doors.anyOpen && b.camDist < 15);
    g.hud.setPrompt(near ? L('<kbd>E</kbd>Качете се през отворената врата', '<kbd>E</kbd>Board through the open door') : null);
    const cam = g.camera;
    if (this.camMode === 'eyes') {
      const bob = Math.hypot(mx, mz) > 0 ? Math.sin(performance.now() * 0.009) * 0.025 : 0;
      cam.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
      cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      cam.fov = damp(cam.fov, 70, 6, dt);
    } else this.cinematic(dt);
    cam.updateProjectionMatrix();
    g.audio.setZone('outside');
    g.hud.cross.classList.toggle('show', this.camMode === 'eyes');
  }

  board(bus, door) {
    const d = BUS.doors.find((q) => q.id === door.id);
    this.ride = bus;
    this.state = 'standing';
    this.section = d.section;
    this.lx = BUS.halfW - 0.55;
    this.lz = (d.z0 + d.z1) / 2;
    this.yaw = Math.PI / 2; // facing into the bus (towards -x local)
    this.seat = -1;
    bus.forceServe = null;
    this.game.hud.toast(L('Добре дошли в автобус 280!', 'Welcome aboard bus 280!'));
    this.game.audio.setZone('cabin');
  }

  // ---------------------------------------------------------------- inside
  floorAt(sec, z) {
    if (sec === 'rear' && z > -0.45) return BUS.floorY + 0.46;
    if (sec === 'rear' && z > -0.75) return BUS.floorY + 0.2;
    return BUS.floorY;
  }

  updateInside(dt, inp) {
    const g = this.game;
    const I = g.input;
    const bus = this.ride;
    const secObj = () => (this.section === 'front' ? bus.model.front : bus.model.rear);
    if (I.hit('KeyB')) {
      if (!bus.stopRequested) {
        bus.stopRequested = true;
        g.audio.stopBell();
        g.hud.toast(L('Заявена спирка', 'Stop requested'));
      }
    }
    // sitting / standing
    if (I.hit('KeyE')) {
      if (this.state === 'seated') {
        this.state = 'standing';
        const s = SEATS[this.seat];
        this.lx = clamp(s.x * 0.3, -0.4, 0.4);
        this.lz = s.z;
        this.section = s.sec;
        bus.riders = bus.riders.filter((r) => r.player !== true);
        this.seat = -1;
      } else {
        const seat = this.lookSeat(bus);
        if (seat >= 0) {
          const taken = (bus.riders || []).some((r) => r.seat === seat);
          if (taken) g.hud.toast(L('Мястото е заето', 'This seat is taken'), true);
          else {
            this.state = 'seated';
            this.seat = seat;
            this.seatT = 0;
            this.yaw = 0;
          }
        }
      }
    }
    const p = bus.phys;
    if (this.state === 'standing') {
      const speed = 1.1;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = -fz, rz = fx;
      let nx = this.lx + (fx * inp.moveY + rx * inp.moveX) * speed * dt;
      let nz = this.lz + (fz * inp.moveY + rz * inp.moveX) * speed * dt;
      // inertia: unbraced standing passengers get pushed by the bus accelerations
      const hold = g.holdGrip || I.keys.has('KeyG');
      const k = hold ? 0.15 : 0.6;
      nz += clamp(p.aLong, -3, 3) * k * dt * 0.25;
      nx += clamp(p.aLat, -3, 3) * k * dt * 0.25;
      // exit through an open door
      const door = bus.doors.doors.find((dd) => {
        const d = BUS.doors.find((q) => q.id === dd.id);
        return d.section === this.section && dd.state === 'open' && nz > d.z0 && nz < d.z1;
      });
      if (door && (nx > BUS.halfW - 0.3 || (I.hit('KeyE') && nx > BUS.halfW - 1.2))) return this.exit(bus, door);
      // walkable area
      const zMin = this.section === 'front' ? FRONT_Z + 2.1 : REAR_BODY_START_Z - 0.3;
      const zMax = this.section === 'front' ? FRONT_BODY_END_Z + 0.4 : REAR_Z - 0.4;
      nx = clamp(nx, -1.05, door ? BUS.halfW : 1.05);
      // seats are obstacles
      for (const s of SEATS) {
        if (s.sec !== this.section) continue;
        const dx = nx - s.x, dz = nz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.36 && d > 1e-4) { nx = s.x + (dx / d) * 0.36; nz = s.z + (dz / d) * 0.36; }
      }
      // cross the articulation
      if (this.section === 'front' && nz > zMax) this.switchSection(bus, 'rear', nx, nz);
      else if (this.section === 'rear' && nz < zMin) this.switchSection(bus, 'front', nx, nz);
      else {
        this.lx = nx;
        this.lz = clamp(nz, zMin, zMax);
      }
      g.hud.setPrompt(this.lookSeat(bus) >= 0 ? L('<kbd>E</kbd>Седни', '<kbd>E</kbd>Sit down') : bus.doors.anyOpen ? L('Излезте през отворена врата · <kbd>B</kbd> СТОП', 'Exit through an open door · <kbd>B</kbd> STOP') : L('<kbd>B</kbd> СТОП · <kbd>G</kbd> дръж се', '<kbd>B</kbd> STOP · <kbd>G</kbd> hold on'));
    } else {
      g.hud.setPrompt(L('<kbd>E</kbd>Стани · <kbd>B</kbd> СТОП', '<kbd>E</kbd>Stand up · <kbd>B</kbd> STOP'));
      if (!bus.riders.some((r) => r.player)) bus.riders.push({ player: true, seat: this.seat, dest: -1, look: null });
    }
    // camera inside: bus section frame + head offsets
    const sec = secObj();
    sec.updateMatrixWorld();
    let local;
    let yawL = this.yaw;
    if (this.state === 'seated') {
      const s = SEATS[this.seat];
      this.seatT = Math.min(1, (this.seatT || 0) + dt * 2);
      const target = new THREE.Vector3(s.x, s.fy + 1.2, s.z + 0.1);
      if (this.section !== s.sec) this.section = s.sec;
      local = target;
      yawL = s.yaw + clamp(this.yaw, -1.6, 1.6);
    } else {
      local = this.tmpV.set(this.lx, this.floorAt(this.section, this.lz) + EYE, this.lz);
    }
    // gentle sway with the bus motion (stronger when standing)
    const swayK = this.state === 'seated' ? 0.4 : (g.holdGrip || I.keys.has('KeyG') ? 0.5 : 1);
    this.sway.x = damp(this.sway.x, clamp(p.aLat, -3, 3) * 0.012 * swayK, 4, dt);
    this.sway.z = damp(this.sway.z, clamp(p.aLong, -3, 3) * 0.015 * swayK, 4, dt);
    const camLocal = local.clone().add(new THREE.Vector3(this.sway.x, 0, this.sway.z));
    const cam = g.camera;
    if (this.camMode === 'eyes') {
      cam.position.copy(camLocal).applyMatrix4(sec.matrixWorld);
      sec.getWorldQuaternion(this.tmpQ);
      cam.quaternion.copy(this.tmpQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, yawL, -this.sway.x * 0.6, 'YXZ')));
      cam.fov = damp(cam.fov, 72, 6, dt);
    } else this.cinematic(dt);
    cam.updateProjectionMatrix();
    g.audio.setZone(this.camMode === 'eyes' ? 'cabin' : 'outside');
    this.sectionAudio = this.section;
    g.hud.cross.classList.toggle('show', this.camMode === 'eyes' && this.state === 'standing');
    // passenger's own destination reached at the terminal
    if (bus.stops.finished && bus.doors.anyOpen && !this.toldTerminal) {
      this.toldTerminal = true;
      g.hud.toast(L('Последна спирка — моля, слезте от автобуса', 'Last stop — please leave the bus'), false, 5);
    }
  }

  switchSection(bus, to, lx, lz) {
    // convert through world space so the position is continuous across the bellows
    const from = this.section === 'front' ? bus.model.front : bus.model.rear;
    const dest = to === 'front' ? bus.model.front : bus.model.rear;
    const w = new THREE.Vector3(lx, 1, lz).applyMatrix4(from.matrixWorld);
    const l = dest.worldToLocal(w);
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    from.getWorldQuaternion(qa);
    dest.getWorldQuaternion(qb);
    const e1 = new THREE.Euler().setFromQuaternion(qa, 'YXZ'), e2 = new THREE.Euler().setFromQuaternion(qb, 'YXZ');
    this.yaw += e1.y - e2.y;
    this.section = to;
    this.lx = clamp(l.x, -0.9, 0.9);
    this.lz = l.z;
  }

  lookSeat(bus) {
    let best = -1, bd = 1.3;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    SEATS.forEach((s, i) => {
      if (s.sec !== this.section) return;
      const dx = s.x - this.lx, dz = s.z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > bd) return;
      if ((dx * fx + dz * fz) / (d || 1) < 0.3 && d > 0.5) return;
      best = i;
      bd = d;
    });
    void bus;
    return best;
  }

  exit(bus, door) {
    const g = this.game;
    const p = g.peds.doorPoint(bus, door, 1.0);
    this.pos.set(p.x, g.world.hf.heightAt(p.x, p.z) + 0.22, p.z);
    const sec = BUS.doors.find((q) => q.id === door.id).section === 'front' ? bus.model.front : bus.model.rear;
    const q = new THREE.Quaternion();
    sec.getWorldQuaternion(q);
    this.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y - Math.PI / 2;
    bus.riders = bus.riders.filter((r) => !r.player);
    this.ride = null;
    this.state = 'outside';
    this.startStop = bus.stops.atStop >= 0 ? bus.dir.stops[bus.stops.atStop] : this.startStop;
    const here = this.startStop.name;
    if (this.startStop.isLast) {
      // end of the line: the next 280 leaves from the departure stop of the other direction
      this.dirId = g.route.other(this.dirId);
      this.startStop = g.route.direction(this.dirId).stops[0];
    }
    // the next 280 is ~2 minutes behind (keep one that is already closer)
    const soon = this.approaching().filter((b) => this.etaOf(b) < HEADWAY_S + 30);
    const nb = soon.length ? soon.sort((a, b) => this.etaOf(a) - this.etaOf(b))[0] : this.scheduleBus(HEADWAY_S);
    nb.forceServe = this.startStop.index;
    const mins = Math.max(1, Math.round(this.etaOf(nb) / 60));
    g.hud.toast(L(`Слязохте на спирка ${here}. Следващият 280 идва след ${mins} мин.`, `You got off at ${here}. The next 280 arrives in ${mins} min.`), false, 5);
  }

  cinematic(dt) {
    const g = this.game;
    const bus = this.myBus;
    if (!bus) return;
    const c = bus.model.front.position;
    const t = performance.now() * 0.00005;
    const want = new THREE.Vector3(c.x + Math.cos(t) * 24, c.y + 6, c.z + Math.sin(t) * 24);
    g.rig.clampToWorld(new THREE.Vector3(c.x, c.y + 2, c.z), want);
    g.camera.position.lerp(want, 1 - Math.exp(-2 * dt));
    g.camera.lookAt(c.x, c.y + 1.5, c.z);
    g.camera.fov = 50;
  }

  dispose() {
    for (const b of this.buses) {
      if (this.game.peds) this.game.peds.detachBus(b);
      b.dispose();
    }
    this.buses = [];
    this.game.bus = null;
  }
}

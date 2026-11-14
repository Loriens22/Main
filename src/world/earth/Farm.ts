import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { WheeledVehicle } from '../../vehicles/WheeledVehicle';
import { EarthMap, FARM, Field, FIELDS } from './EarthMap';
import { clamp, damp, moveToward, rng, wrapAngle } from '../../core/math';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';

export type MachineTask = 'idle' | 'harvest' | 'unload' | 'return' | 'route' | 'moveField' | 'refuel' | 'repair' | 'manual' | 'stopped' | 'fault';

export interface Machine {
  id: string;
  name: string;
  kind: 'tractor' | 'combine';
  vehicle: WheeledVehicle;
  task: MachineTask;
  /** task to resume after an interruption (refuel, unload, storm, repair) */
  resume: MachineTask | null;
  path: { x: number; z: number; work?: boolean }[];
  pathIndex: number;
  field: Field | null;
  pass: number;
  home: { x: number; z: number; yaw: number };
  speed: number;
  grain: number; // 0..1 (combine tank)
  fault: string | null;
  timer: number;
  blocked: number;
  workTime: number;
  nextFault: number;
  header: number; // 0 raised .. 1 working
  log: string[];
  sheltering: boolean;
}

const FAULTS: Record<string, string[]> = {
  combine: ['Feeder chain jammed with stalks', 'Rotor drive belt slipping', 'Radiator screen clogged with dust — engine temperature high', 'Grain elevator sensor fault'],
  tractor: ['Hydraulic pressure low', 'Air filter clogged with dust', 'Guidance receiver lost fix', 'Rear axle temperature high'],
};
const HARVEST_CELL = 2;

/** Per-field record of which ground has been cut. */
class HarvestMap {
  w: number; d: number; data: Uint8Array; cut = 0;
  constructor(public field: Field) {
    this.w = Math.ceil(field.w / HARVEST_CELL);
    this.d = Math.ceil(field.d / HARVEST_CELL);
    this.data = new Uint8Array(this.w * this.d);
  }
  private idx(x: number, z: number) {
    const i = Math.floor((x - (this.field.cx - this.field.w / 2)) / HARVEST_CELL), j = Math.floor((z - (this.field.cz - this.field.d / 2)) / HARVEST_CELL);
    return i < 0 || j < 0 || i >= this.w || j >= this.d ? -1 : j * this.w + i;
  }
  get(x: number, z: number) { const k = this.idx(x, z); return k >= 0 && this.data[k] === 1; }
  mark(x: number, z: number) { const k = this.idx(x, z); if (k >= 0 && !this.data[k]) { this.data[k] = 1; this.cut++; return true; } return false; }
  get fraction() { return this.cut / this.data.length; }
}

const _v = new THREE.Vector3();

/**
 * The working farm: autonomous tractors and combines that follow routes, harvest, haul, refuel, report
 * faults and take instructions from the player, plus the harvest state of every field.
 */
export class Farm {
  machines: Machine[] = [];
  harvest = new Map<string, HarvestMap>();
  fuelPoint = { x: FARM.x + 45, z: FARM.z - 6 };
  binPoint = { x: FARM.x + 46, z: FARM.z - 28 };
  private rand = rng(4242);
  stormShelter = false;
  /** notifies the crop renderer that an area changed */
  onCut: ((x0: number, z0: number, x1: number, z1: number) => void) | null = null;
  private cutBox: [number, number, number, number] | null = null;
  private cutTimer = 0;

  constructor(private game: Game, private map: EarthMap) {
    for (const f of FIELDS) this.harvest.set(f.id, new HarvestMap(f));
  }

  add(id: string, name: string, kind: 'tractor' | 'combine', vehicle: WheeledVehicle, home: { x: number; z: number; yaw: number }): Machine {
    const m: Machine = {
      id, name, kind, vehicle, task: 'idle', resume: null, path: [], pathIndex: 0, field: null, pass: 0, home, speed: 0, grain: 0, fault: null, timer: 0,
      blocked: 0, workTime: 0, nextFault: 240 + this.rand() * 360, header: 0, log: [], sheltering: false,
    };
    vehicle.setMode('rail');
    vehicle.ground = (x, z) => this.map.height(x, z);
    vehicle.place(home.x, this.map.height(home.x, home.z), home.z, home.yaw);
    this.machines.push(m);
    return m;
  }

  isHarvested = (x: number, z: number) => {
    for (const h of this.harvest.values()) {
      const f = h.field;
      if (Math.abs(x - f.cx) <= f.w / 2 && Math.abs(z - f.cz) <= f.d / 2) return h.get(x, z);
    }
    return false;
  };

  private note(m: Machine, text: string, kind: 'info' | 'warn' | 'good' = 'info', toast = true) {
    m.log.unshift(text);
    if (m.log.length > 12) m.log.pop();
    if (toast) ui.toast(`${m.name}: ${text}`, kind, 4);
    ui.refresh();
  }

  // --------------------------------------------------------------------------------- routing
  /** Path across the yard that swings around the house: via the gravel ring. */
  private yardRoute(from: { x: number; z: number }, to: { x: number; z: number }) {
    const R = 52, pts: { x: number; z: number }[] = [];
    const ang = (p: { x: number; z: number }) => Math.atan2(p.z - FARM.z, p.x - FARM.x);
    const distC = (p: { x: number; z: number }) => Math.hypot(p.x - FARM.x, p.z - FARM.z);
    if (distC(from) > R + 25 && distC(to) > R + 25 && Math.hypot(from.x - to.x, from.z - to.z) < 60) return [to];
    let a0 = ang(from), a1 = ang(to);
    let d = wrapAngle(a1 - a0);
    // avoid the north side where the house, tanks and shed stand: go the long way if the short arc crosses it
    const crossesNorth = (aa: number, dd: number) => { for (let k = 0; k <= 8; k++) { const a = wrapAngle(aa + (dd * k) / 8); if (a < -0.5 && a > -2.6) return true; } return false; };
    if (crossesNorth(a0, d) && !crossesNorth(a0, d - Math.sign(d) * Math.PI * 2)) d -= Math.sign(d) * Math.PI * 2;
    const n = Math.max(1, Math.ceil(Math.abs(d) / 0.35));
    for (let k = 0; k <= n; k++) { const a = a0 + (d * k) / n; pts.push({ x: FARM.x + Math.cos(a) * R, z: FARM.z + Math.sin(a) * R }); }
    pts.push(to);
    return pts;
  }

  private fieldGate(f: Field) {
    // the point on the field edge nearest the yard, pulled slightly inside
    const x = clamp(FARM.x, f.cx - f.w / 2 + 8, f.cx + f.w / 2 - 8), z = clamp(FARM.z, f.cz - f.d / 2 + 8, f.cz + f.d / 2 - 8);
    return { x, z };
  }

  private harvestPath(f: Field, fromPass: number, headerW: number) {
    const pts: { x: number; z: number; work?: boolean }[] = [];
    const alongX = f.rows === 'x';
    const len = alongX ? f.w : f.d, across = alongX ? f.d : f.w;
    const a0 = (alongX ? f.cx : f.cz) - len / 2 + 9, a1 = (alongX ? f.cx : f.cz) + len / 2 - 9;
    const b0 = (alongX ? f.cz : f.cx) - across / 2 + headerW / 2 + 1;
    const passes = Math.floor((across - 2) / headerW);
    for (let p = fromPass; p < passes; p++) {
      const b = b0 + p * headerW;
      const fwd = p % 2 === 0;
      const s = fwd ? a0 : a1, e = fwd ? a1 : a0;
      const P = (a: number, bb: number, work = false) => (alongX ? { x: a, z: bb, work } : { x: bb, z: a, work });
      pts.push(P(s, b), P(e, b, true));
      // headland turn: bulb out past the end so the machine can swing round to the next pass
      if (p < passes - 1) {
        const out = e + (fwd ? 7 : -7);
        pts.push(P(out, b + headerW * 0.5));
      }
    }
    return { pts, passes };
  }

  private routeLoop() {
    // perimeter lane around the home fields
    const x0 = FARM.x - 420, x1 = FARM.x + 420, z0 = FARM.z - 470, z1 = FARM.z + 425;
    const pts: { x: number; z: number }[] = [];
    const push = (x: number, z: number) => pts.push({ x, z });
    push(FARM.x + 60, FARM.z + 60); push(x1, FARM.z + 70); push(x1, z1); push(x0, z1); push(x0, z0); push(x1, z0); push(x1, FARM.z - 60); push(FARM.x + 70, FARM.z - 55);
    return pts;
  }

  // --------------------------------------------------------------------------------- commands
  command(m: Machine, cmd: string, arg?: string) {
    const here = { x: m.vehicle.position.x, z: m.vehicle.position.z };
    if (m.task === 'manual' && cmd !== 'manual') { this.note(m, 'Under manual control — leave the cab first', 'warn'); return; }
    if (m.fault && cmd !== 'repair' && cmd !== 'stop') { this.note(m, `Cannot comply: ${m.fault}. Repair required.`, 'warn'); return; }
    switch (cmd) {
      case 'harvest': {
        if (m.kind !== 'combine') { this.note(m, 'No harvesting head fitted', 'warn'); return; }
        const f = (arg && FIELDS.find((x) => x.id === arg)) || m.field || this.bestField();
        if (!f) { this.note(m, 'All fields are cut', 'info'); return; }
        const h = this.harvest.get(f.id)!;
        if (h.fraction > 0.97) { this.note(m, `${f.name} is already harvested`, 'info'); return; }
        if (m.field !== f) m.pass = 0;
        m.field = f;
        const hp = this.harvestPath(f, m.pass, 6.2);
        m.path = [...this.yardRoute(here, this.fieldGate(f)), ...hp.pts];
        m.pathIndex = 0;
        m.task = 'harvest';
        m.vehicle.engineOn = true;
        this.note(m, `Harvesting ${f.name}`, 'good');
        break;
      }
      case 'stop':
        m.task = 'stopped'; m.path = []; m.resume = null;
        this.note(m, 'Stopped', 'info');
        break;
      case 'return':
        m.path = this.yardRoute(here, m.home); m.pathIndex = 0; m.task = 'return'; m.resume = null; m.vehicle.engineOn = true;
        this.note(m, 'Returning to the yard', 'info');
        break;
      case 'route':
        m.path = [...this.yardRoute(here, this.routeLoop()[0]), ...this.routeLoop()]; m.pathIndex = 0; m.task = 'route'; m.vehicle.engineOn = true;
        this.note(m, 'Following the assigned perimeter route', 'info');
        break;
      case 'moveField': {
        const f = FIELDS.find((x) => x.id === arg) ?? FIELDS[0];
        m.field = f; m.pass = 0;
        m.path = this.yardRoute(here, this.fieldGate(f)); m.pathIndex = 0; m.task = 'moveField'; m.vehicle.engineOn = true;
        this.note(m, `Moving to ${f.name}`, 'info');
        break;
      }
      case 'refuel':
        m.resume = m.task === 'harvest' || m.task === 'route' ? m.task : null;
        m.path = this.yardRoute(here, this.fuelPoint); m.pathIndex = 0; m.task = 'refuel'; m.vehicle.engineOn = true;
        this.note(m, 'Heading to the fuel tank', 'info');
        break;
      case 'repair':
        if (!m.fault && m.vehicle.condition > 0.98) { this.note(m, 'No faults found', 'info'); return; }
        m.resume = m.resume ?? (m.task === 'fault' ? null : m.task);
        m.task = 'repair'; m.timer = 8; m.path = [];
        this.note(m, 'Diagnostics running — repair in progress', 'info');
        bus.emit('sfx', { id: 'repair', node: m.vehicle.root });
        break;
      case 'manual':
        bus.emit('farm:manual', m);
        break;
    }
    ui.refresh();
  }

  private bestField() {
    let best: Field | null = null, bf = 1;
    for (const f of FIELDS) { const fr = this.harvest.get(f.id)!.fraction; if (fr < 0.97 && fr < bf) { bf = fr; best = f; } }
    return best;
  }

  /** The player has taken (or released) the wheel. */
  setManual(m: Machine, manual: boolean) {
    if (manual) { m.resume = null; m.task = 'manual'; m.path = []; }
    else {
      m.task = 'idle';
      m.vehicle.setMode('rail');
      m.vehicle.engineOn = false;
      this.note(m, 'Autonomous control restored', 'info', false);
    }
    ui.refresh();
  }

  /** Weather hook: machines head home when a dust storm is announced and resume afterwards. */
  setStorm(active: boolean) {
    if (active === this.stormShelter) return;
    this.stormShelter = active;
    for (const m of this.machines) {
      if (m.task === 'manual') continue;
      if (active && (m.task === 'harvest' || m.task === 'route' || m.task === 'moveField')) {
        const r = m.task;
        this.command(m, 'return');
        m.resume = r; m.sheltering = true;
        this.note(m, 'Dust storm warning — returning to shelter', 'warn');
      } else if (!active && m.sheltering) {
        m.sheltering = false;
        const r = m.resume; m.resume = null;
        if (r === 'harvest') this.command(m, 'harvest', m.field?.id);
        else if (r === 'route') this.command(m, 'route');
      }
    }
  }

  // --------------------------------------------------------------------------------- simulation
  private obstacleAhead(m: Machine, look: number) {
    const v = m.vehicle;
    const fx = -Math.sin(v.railYaw), fz = -Math.cos(v.railYaw);
    const test = (px: number, pz: number, r: number) => {
      const dx = px - v.position.x, dz = pz - v.position.z;
      const along = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      return along > 1 && along < look + r && side < 3.4 + r;
    };
    const p = this.game.player.pos;
    if (test(p.x, p.z, 0.6)) return true;
    for (const o of this.machines) if (o !== m && test(o.vehicle.position.x, o.vehicle.position.z, 3.5)) return true;
    for (const o of this.extraObstacles) if (test(o.position.x, o.position.z, 2.5)) return true;
    return false;
  }

  extraObstacles: WheeledVehicle[] = [];

  fixedUpdate(dt: number) {
    for (const m of this.machines) this.step(m, dt);
    this.cutTimer -= dt;
    if (this.cutBox && this.cutTimer <= 0) {
      this.onCut?.(...this.cutBox);
      this.cutBox = null;
      this.cutTimer = 0.6;
    }
  }

  private step(m: Machine, dt: number) {
    const v = m.vehicle;
    if (m.task === 'manual') return;
    const working = m.task === 'harvest' || m.task === 'route' || m.task === 'moveField' || m.task === 'return' || m.task === 'refuel' || m.task === 'unload';
    let target = 0;
    let steer = 0;
    if (working && m.pathIndex < m.path.length) {
      const wp = m.path[m.pathIndex];
      const dx = wp.x - v.position.x, dz = wp.z - v.position.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      const err = wrapAngle(want - v.railYaw);
      const isWork = m.task === 'harvest' && !!wp.work;
      const cruise = isWork ? 2.6 : m.kind === 'combine' ? 5.2 : 6.5;
      target = cruise * clamp(1 - Math.abs(err) * 0.9, 0.25, 1);
      if (m.pathIndex === m.path.length - 1) target = Math.min(target, 0.6 + dist * 0.35);
      const maxRate = (Math.max(Math.abs(m.speed), 0.8) / 7.5);
      const turn = clamp(err, -maxRate * dt * 2.2, maxRate * dt * 2.2);
      v.railYaw += turn;
      steer = clamp(err * 1.4, -0.5, 0.5);
      if (dist < (isWork ? 2.5 : 4.5)) m.pathIndex++;
      if (this.obstacleAhead(m, 6 + Math.abs(m.speed) * 2.2)) {
        target = 0;
        m.blocked += dt;
        if (m.blocked > 5 && m.blocked - dt <= 5) { bus.emit('sfx', { id: 'horn', node: v.root }); this.note(m, 'Path obstructed — waiting', 'warn', false); }
        if (m.blocked > 10) {
          // sidestep: insert a detour point to one side, then carry on
          const side = this.rand() < 0.5 ? 1 : -1;
          m.path.splice(m.pathIndex, 0, { x: v.position.x + -Math.cos(v.railYaw) * 9 * side - Math.sin(v.railYaw) * 9, z: v.position.z + Math.sin(v.railYaw) * 9 * side - Math.cos(v.railYaw) * 9 });
          m.blocked = 0;
        }
      } else m.blocked = 0;
    } else if (working) {
      // arrived
      this.arrive(m);
    }
    m.speed = moveToward(m.speed, target, dt * (target > m.speed ? 0.9 : 2.2));
    v.railSpeed = m.speed;
    v.railSteer = steer;
    v.railPos.x += -Math.sin(v.railYaw) * m.speed * dt;
    v.railPos.z += -Math.cos(v.railYaw) * m.speed * dt;
    // consumables, wear, faults
    if (Math.abs(m.speed) > 0.1) {
      v.fuel = Math.max(0, v.fuel - v.tuning.burn * (0.4 + Math.abs(m.speed) / 8) * dt);
      m.workTime += dt;
      v.condition = Math.max(0, v.condition - dt * 0.00012);
      if (v.fuel <= v.tuning.fuelCapacity * 0.06 && m.task !== 'refuel') { this.note(m, 'Fuel low — going to refuel', 'warn'); this.command(m, 'refuel'); }
      if (m.workTime > m.nextFault && (m.task === 'harvest' || m.task === 'route')) {
        m.workTime = 0; m.nextFault = 260 + this.rand() * 420;
        const list = FAULTS[m.kind];
        m.fault = list[Math.floor(this.rand() * list.length)];
        m.resume = m.task; m.task = 'fault'; m.path = []; v.condition = Math.min(v.condition, 0.55);
        this.note(m, `Maintenance problem: ${m.fault}`, 'warn');
        bus.emit('sfx', { id: 'alarm_soft', node: v.root });
      }
    }
    // combine head: lower and spin while cutting
    if (m.kind === 'combine') {
      const cutting = m.task === 'harvest' && m.pathIndex < m.path.length && !!m.path[m.pathIndex]?.work && Math.abs(m.speed) > 0.3;
      m.header = damp(m.header, m.task === 'harvest' ? 1 : 0, 2, dt);
      const head = v.model.part('header'), auger = v.model.part('header_auger');
      if (head) head.position.y = (1 - m.header) * 0.9;
      if (auger && m.header > 0.3) auger.rotateX(dt * 9 * m.header);
      if (cutting && m.field) {
        const h = this.harvest.get(m.field.id)!;
        const fx = -Math.sin(v.railYaw), fz = -Math.cos(v.railYaw);
        const hx = v.position.x + fx * 5.2, hz = v.position.z + fz * 5.2;
        let cut = 0;
        for (let s = -3.1; s <= 3.1; s += 1.0) for (let a = -1; a <= 1; a += 1) if (h.mark(hx - fz * s + fx * a, hz + fx * s + fz * a)) cut++;
        if (cut) {
          m.grain = Math.min(1, m.grain + cut * HARVEST_CELL * HARVEST_CELL * 0.00009);
          const b = this.cutBox;
          this.cutBox = b ? [Math.min(b[0], hx - 5), Math.min(b[1], hz - 5), Math.max(b[2], hx + 5), Math.max(b[3], hz + 5)] : [hx - 5, hz - 5, hx + 5, hz + 5];
        }
        if (m.grain >= 1) {
          this.note(m, 'Grain tank full — unloading at the bins', 'info');
          m.pass = this.passOf(m);
          m.path = this.yardRoute({ x: v.position.x, z: v.position.z }, this.binPoint); m.pathIndex = 0; m.task = 'unload'; m.resume = 'harvest';
        }
      }
    }
    if (m.task === 'repair') {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.fault = null; v.condition = 1;
        this.note(m, 'Repair complete — all systems nominal', 'good');
        const r = m.resume; m.resume = null; m.task = 'idle';
        if (r === 'harvest') this.command(m, 'harvest', m.field?.id); else if (r === 'route') this.command(m, 'route');
      }
    }
    if ((m.task === 'refuel' || m.task === 'unload') && m.timer > 0) {
      m.timer -= dt;
      if (m.task === 'refuel') v.fuel = Math.min(v.tuning.fuelCapacity, v.fuel + (v.tuning.fuelCapacity / 10) * dt);
      else m.grain = Math.max(0, m.grain - dt / 14);
      if (m.timer <= 0) {
        this.note(m, m.task === 'refuel' ? 'Refuelled' : 'Unloaded', 'good');
        const r = m.resume; m.resume = null; m.task = 'idle';
        if (r === 'harvest') this.command(m, 'harvest', m.field?.id); else if (r === 'route') this.command(m, 'route'); else this.command(m, 'return');
      }
    }
    if (m.task === 'idle' || m.task === 'stopped' || m.task === 'fault') v.engineOn = m.task !== 'idle' ? v.engineOn : false;
  }

  private passOf(m: Machine) {
    const f = m.field!;
    const across = f.rows === 'x' ? m.vehicle.position.z - (f.cz - f.d / 2) : m.vehicle.position.x - (f.cx - f.w / 2);
    return Math.max(0, Math.floor((across - 1) / 6.2));
  }

  private arrive(m: Machine) {
    switch (m.task) {
      case 'harvest':
        this.note(m, `${m.field?.name ?? 'Field'} complete`, 'good');
        m.pass = 0;
        if (this.bestField()) this.command(m, 'harvest', this.bestField()!.id); else this.command(m, 'return');
        break;
      case 'route': m.pathIndex = 0; m.path = this.routeLoop(); break;
      case 'return': m.task = 'idle'; m.vehicle.engineOn = false; m.vehicle.railYaw = m.home.yaw; this.note(m, 'Parked', 'info', false); break;
      case 'moveField': m.task = 'idle'; this.note(m, `Standing by at ${m.field?.name}`, 'info'); break;
      case 'refuel': if (m.timer <= 0) { m.timer = 10; bus.emit('sfx', { id: 'refuel', node: m.vehicle.root }); this.note(m, 'Refuelling', 'info', false); } break;
      case 'unload': if (m.timer <= 0) { m.timer = 14; this.note(m, 'Unloading grain', 'info', false); } break;
    }
    ui.refresh();
  }

  statusText(m: Machine) {
    const t: Record<MachineTask, string> = { idle: 'Parked', harvest: 'Harvesting', unload: 'Unloading', return: 'Returning to farm', route: 'On route', moveField: 'Moving to field', refuel: 'Refuelling', repair: 'Under repair', manual: 'Manual control', stopped: 'Stopped', fault: 'Fault — awaiting repair' };
    return t[m.task];
  }

  serialize() {
    return {
      fields: Object.fromEntries([...this.harvest].map(([k, h]) => [k, Array.from(h.data).join('').replace(/0{16,}/g, (s) => `(${s.length})`)])),
      machines: this.machines.map((m) => ({ id: m.id, task: m.task === 'manual' ? 'idle' : m.task, field: m.field?.id ?? null, pass: m.pass, grain: m.grain, fault: m.fault, v: m.vehicle.serialize(), yaw: m.vehicle.railYaw })),
    };
  }

  deserialize(d: any) {
    if (!d) return;
    for (const [k, enc] of Object.entries(d.fields || {})) {
      const h = this.harvest.get(k);
      if (!h) continue;
      const s = (enc as string).replace(/\((\d+)\)/g, (_, n) => '0'.repeat(+n));
      h.cut = 0;
      for (let i = 0; i < h.data.length; i++) { h.data[i] = s.charCodeAt(i) === 49 ? 1 : 0; h.cut += h.data[i]; }
    }
    for (const s of d.machines || []) {
      const m = this.machines.find((x) => x.id === s.id);
      if (!m) continue;
      m.vehicle.deserialize({ ...s.v, mode: 'rail' });
      m.vehicle.railYaw = s.yaw ?? m.home.yaw;
      m.grain = s.grain ?? 0; m.fault = s.fault ?? null; m.pass = s.pass ?? 0;
      m.field = FIELDS.find((f) => f.id === s.field) ?? null;
      m.task = 'idle';
      if (s.task === 'harvest') this.command(m, 'harvest', m.field?.id);
      else if (s.task === 'route') this.command(m, 'route');
      else if (s.task === 'fault') m.task = 'fault';
    }
  }
}

void _v;

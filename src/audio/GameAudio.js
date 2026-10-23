// Glue between the game and the AudioManager: reads the buses, the camera and the listener
// zone every frame, detects the events that have a sound (engine start/stop, brakes, kneeling,
// indicator relay, bellows, air governor, doors, gear shifts) for EVERY bus, and describes each
// bus to the voice pool (distance, Doppler, pan, interior proximity). No game rules live here and
// nothing in the game state is modified.
import { clamp, cabinProx, ENGINE_Z, cullGain, panFor, shotOffsetDb, startRpm, START_DURATION, stepAir } from './dsp.js';

const FWD = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)]; // same convention as core/math fwdX/fwdZ
const RIGID_SPLIT_Z = -4.0; // rigid bus: front/rear half boundary, rear-axle frame (just ahead of the middle door)
const engineZ = (bus) => bus.spec.audio.engineZ ?? ENGINE_Z;
/** Acoustic section of a door: its body section, or on a rigid bus the half it opens into. */
function doorZone(bus, id) {
  const d = bus.spec.doors.find((q) => q.id === id);
  if (!d) return 'front';
  if (bus.spec.articulated) return d.section;
  return (d.z0 + d.z1) / 2 < RIGID_SPLIT_Z ? 'front' : 'rear';
}
const SKIP_DOOR_EVENTS = new Set(['closeRequest', 'opened', 'closed']); // part of the open/close recipes

export class GameAudio {
  constructor(game) {
    this.game = game;
    this.audio = game.audio;
    this.audio.gamePausedFn = () => game.paused;
    this.states = new WeakMap();
    this.nextId = 1;
    this.frame = 0;
    this.doorQ = [];
    this.camPrev = null;
    this.camV = { x: 0, y: 0, z: 0 };
    this.S = { buses: [], weather: 'clear', ambience: 1, parkFactor: 0.3, day: 1 };
  }

  state(bus) {
    let st = this.states.get(bus);
    if (!st) {
      st = {
        id: this.nextId++, inited: false, pressure: bus.player ? 8.0 : 9 + Math.random(), comp: false,
        engineOn: false, startT: Infinity, parking: false, stopBrake: false, brakeOut: 0, lastBrakeT: -9,
        kneel: 0, kneelDir: 0, ind: false, art: 0, artRate: 0, lastBellows: -9, surface: 'asphalt', surfT: 0,
        geomFrame: -1, L: { zone: 'out', prox: 0, section: 'front', dist: 30, pan: 0, radial: 0, cull: 1 },
      };
      this.states.set(bus, st);
    }
    return st;
  }

  // ------------------------------------------------------------- geometry
  /** Listener description for one bus (cached for the frame). */
  geom(bus, st) {
    if (st.geomFrame === this.frame) return st.L;
    st.geomFrame = this.frame;
    const g = this.game, p = bus.phys, cam = g.camera.position, L = st.L;
    const zone = this.audio.zone;
    const interior = (zone === 'cab' || zone === 'cabin') && bus === g.bus;
    const [fx, fz] = FWD(p.yaw), [rfx, rfz] = FWD(p.yawR);
    if (interior) {
      L.zone = zone; L.dist = 0; L.pan = 0; L.radial = 0; L.cull = 1;
      // listener in the rear section frame (x right, z backwards): distance to the engine and which
      // section (a rigid bus is split into a front and a rear half at RIGID_SPLIT_Z for the door sounds)
      const dx = cam.x - p.rx, dz = cam.z - p.rz;
      const lz = -(dx * rfx + dz * rfz), lx = dx * -rfz + dz * rfx;
      L.prox = zone === 'cab' ? 0 : cabinProx(Math.hypot(lx, lz - engineZ(bus)));
      L.section = zone === 'cab' || lz < (p.articulated ? 0.17 - p.L2 : RIGID_SPLIT_Z) ? 'front' : 'rear';
      return L;
    }
    // outside: nearest point of the body between the middle of the front section and the engine
    const fc = p.box[0].c, ez = engineZ(bus);
    const ax = p.x + fx * fc, az = p.z + fz * fc; // middle of the front section
    const bx = p.rx - rfx * ez, bz = p.rz - rfz * ez; // engine behind the rear axle
    const sx = bx - ax, sz = bz - az, len2 = sx * sx + sz * sz || 1;
    const u = clamp(((cam.x - ax) * sx + (cam.z - az) * sz) / len2, 0, 1);
    const px = ax + sx * u, pz = az + sz * u, py = bus.model.front.position.y + 1.2;
    const ox = px - cam.x, oy = py - cam.y, oz = pz - cam.z;
    const d = Math.hypot(ox, oy, oz);
    const q = g.camera.quaternion;
    const rx = 1 - 2 * (q.y * q.y + q.z * q.z), rz = 2 * (q.x * q.z - q.w * q.y); // camera right vector (x, z)
    L.zone = 'out'; L.prox = 0; L.dist = d + 1; L.section = 'front';
    L.pan = panFor(ox * rx + oz * rz);
    // approach speed: relative velocity of the bus and the listener along the line of sight
    const v = p.v, k = 1 / (d || 1);
    const rvx = fx * v - this.camV.x, rvz = fz * v - this.camV.z;
    L.radial = -(rvx * ox + rvz * oz) * k;
    L.cull = cullGain(d, bus === g.bus);
    return L;
  }

  /** {db, lp, pan, rattle} for a one-shot of this bus as heard by the listener, or null when inaudible. */
  where(bus, kind, o) {
    const st = this.state(bus), L = this.geom(bus, st);
    const w = shotOffsetDb(kind, L, o);
    if (!w) return null;
    return { db: w.db, lp: w.lp, pan: L.zone === 'out' ? L.pan : 0, rattle: L.zone !== 'out' };
  }

  // --------------------------------------------------------------- events
  /** Door events of every bus; doors that fire together are merged into one sound in update(). */
  door(bus, e) {
    if (SKIP_DOOR_EVENTS.has(e.type) || !this.audio.ready) return;
    this.doorQ.push({ bus, e });
  }

  flushDoors() {
    if (!this.doorQ.length) return;
    const groups = new Map();
    for (const { bus, e } of this.doorQ) {
      const key = `${this.state(bus).id}|${e.type}|${e.n || 0}`;
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = { bus, e, doors: [] }));
      gr.doors.push(e.door);
    }
    this.doorQ.length = 0;
    for (const { bus, e, doors } of groups.values()) {
      const L = this.geom(bus, this.state(bus));
      const kind = e.type === 'beep' ? 'doorBeep' : 'doorHiss';
      let sum = 0, best = null;
      for (const id of doors) {
        const w = shotOffsetDb(kind, L, { door: id, sec: doorZone(bus, id) });
        if (!w) continue;
        sum += Math.pow(10, w.db / 10);
        if (!best || w.db > best.db) best = w;
      }
      if (!best) continue;
      const db = Math.min(10 * Math.log10(sum), best.db + 3); // several doors: louder, but not by the full sum
      this.audio.doorEvent(e, { db, lp: best.lp, pan: L.zone === 'out' ? L.pan : 0 });
    }
  }

  /** phys.onShift of every bus. */
  shift(bus, gear, dir) {
    if (!this.audio.ready) return;
    this.audio.shift(this.state(bus).id, gear, dir, this.where(bus, 'gear'));
  }

  /** Edge detection for one bus; the first sight of a bus only records its state. */
  edges(bus, st, dt) {
    const a = this.audio, p = bus.phys, on = a.ready, now = this.game.time;
    const lights = bus.lights || {};
    if (!st.inited) {
      st.inited = true;
      st.engineOn = !!p.engineOn; st.parking = !!p.parkingBrake; st.stopBrake = !!p.stopBrake; st.brakeOut = p.brakeOut || 0;
      st.kneel = p.kneel || 0; st.ind = !!bus.indicatorOn; st.art = p.articulation || 0;
      return;
    }
    // engine start / stop
    if (p.engineOn !== st.engineOn) {
      st.engineOn = !!p.engineOn;
      if (st.engineOn) { st.startT = 0; if (on) a.engineStart(this.where(bus, 'starter')); }
      else { st.startT = Infinity; if (on) a.engineStop(this.where(bus, 'engine')); }
    }
    if (st.startT < START_DURATION) st.startT += dt;
    // parking brake and bus-stop brake (hiss when they apply or release)
    if (!!p.parkingBrake !== st.parking) {
      st.parking = !!p.parkingBrake; st.lastBrakeT = now;
      if (on) a.brakeEvent(st.parking ? 'parkApply' : 'parkRelease', this.where(bus, 'brake'));
    }
    if (!!p.stopBrake !== st.stopBrake) {
      st.stopBrake = !!p.stopBrake; st.lastBrakeT = now;
      if (on) a.brakeEvent(st.stopBrake ? 'stopApply' : 'stopRelease', this.where(bus, 'brake'));
    }
    // service brake released at standstill
    const bo = p.brakeOut || 0;
    if (st.brakeOut > 0.1 && bo < 0.05 && Math.abs(p.v) < 0.3 && now - st.lastBrakeT > 0.8) {
      st.lastBrakeT = now;
      if (on) a.brakeEvent('release', this.where(bus, 'brake'));
    }
    st.brakeOut = bo;
    // kneeling
    const dk = (p.kneel || 0) - st.kneel;
    const nd = dk > 1e-5 ? 1 : dk < -1e-5 ? -1 : p.kneel <= 0.001 || p.kneel >= 0.999 ? 0 : st.kneelDir;
    if (nd !== 0 && nd !== st.kneelDir && on) a.kneelEvent(nd > 0 ? 'down' : 'up', this.where(bus, 'kneel'));
    st.kneelDir = nd; st.kneel = p.kneel || 0;
    // indicator relay: tick on the on-edge, tock on the off-edge
    const ind = !!bus.indicatorOn;
    if (ind !== st.ind) {
      st.ind = ind;
      if (on && (lights.left || lights.right || lights.hazard)) a.indicatorTick(ind, this.where(bus, 'indicator'));
    }
    // articulation: bellows creak while the joint moves
    const art = p.articulation || 0;
    if (dt > 0) st.artRate += ((art - st.art) / dt - st.artRate) * Math.min(1, dt * 8);
    st.art = art;
    if (Math.abs(st.artRate) > 0.05 && now - st.lastBellows > 2.5 && Math.abs(p.v) > 0.3) {
      st.lastBellows = now;
      if (on) a.bellowsCreak(this.where(bus, 'bellows'), clamp(Math.abs(st.artRate) / 0.3, 0.4, 1.2));
    }
    // air system: compressor chug while the governor loads, dryer purge at cut-out
    if (stepAir(st, dt, { braking: (p.brakeOut || 0) > 0.2, engineOn: p.engineOn })) {
      if (on) a.purgeEvent(this.where(bus, 'purge'));
    }
  }

  // ----------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, a = this.audio, S = this.S;
    this.frame++;
    // camera velocity for the Doppler shift (ignores teleports)
    const cp = g.camera.position;
    if (this.camPrev && dt > 0) {
      const dx = cp.x - this.camPrev.x, dz = cp.z - this.camPrev.z;
      const k = Math.min(1, dt * 10), big = Math.hypot(dx, dz) > 6;
      this.camV.x += ((big ? 0 : dx / dt) - this.camV.x) * k;
      this.camV.z += ((big ? 0 : dz / dt) - this.camV.z) * k;
    }
    this.camPrev = this.camPrev || { x: 0, z: 0 };
    this.camPrev.x = cp.x; this.camPrev.z = cp.z;

    const buses = g.allBuses();
    S.buses.length = 0;
    this.flushDoors();
    for (const bus of buses) {
      const p = bus.phys, st = this.state(bus);
      this.edges(bus, st, dt);
      const L = this.geom(bus, st);
      st.surfT -= dt;
      if (st.surfT <= 0) {
        st.surfT = 0.3;
        const piece = g.world.roads.query(p.x, p.z, 12);
        const sf = piece ? piece.piece.surface : null;
        st.surface = sf === 'yellow_brick' || sf === 'sett' || sf === 'paving_stones' ? 'brick' : 'asphalt';
      }
      const cranking = st.startT < START_DURATION;
      const rpm = cranking ? startRpm(st.startT, p.rpm) : p.rpm;
      const retarder = p.selector === 'D' && Math.abs(p.v) > 1.5 ? clamp((p.brakeOut || 0) / 0.25, 0, 1) : 0;
      S.buses.push({
        id: st.id, profile: bus.spec.audio.profile, focus: bus === g.bus, interior: L.zone !== 'out', zone: L.zone, prox: L.prox, dist: L.dist, radial: L.radial, pan: L.pan, cull: L.cull,
        rpm, load: cranking && st.startT < 1.5 ? 0.05 : p.load, speed: p.v, engineOn: !!p.engineOn || p.rpm > 120, retarder, surface: st.surface, comp: st.comp,
      });
      if (bus === g.bus) {
        a.pressure = st.pressure; a.compressorOn = st.comp;
        // suspension bumps (Poisson) are the strongest "we are moving" cue on a phone
        const v = Math.abs(p.v);
        if (v > 2 && a.ready && Math.random() < dt * (st.surface === 'brick' ? 0.6 + 0.1 * v : 0.08 + 0.012 * v)) {
          a.bump(v, Math.random() < 0.15, this.where(bus, 'bump'));
        }
      }
    }
    S.weather = g.weather; S.day = g.sky.dayFactor ?? 1; S.parkFactor = g.parkFactor || 0.3;
    a.update(dt, S);
  }
}

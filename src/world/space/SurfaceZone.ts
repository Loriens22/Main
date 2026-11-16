import * as THREE from 'three';
import { Zone } from '../Zone';
import { EARTH_ATMOSPHERE, Sky } from '../../render/Sky';
import { StarField } from '../../render/Stars';
import { LightPool } from '../../render/LightPool';
import { assets } from '../../render/Assets';
import { SystemView } from '../../render/SystemView';
import type { Soundscape } from '../../audio/Audio';
import { Terrain, TerrainLayers } from '../terrain/Terrain';
import '../terrain/worlds';
import { MILLER_SEA_FLOOR } from '../terrain/worlds';
import { BODY, BodyDef, surfaceGravity } from '../../space/Bodies';
import { pole, state, surfacePoint } from '../../space/Ephemeris';
import { add, cross, dot, scale, sub, unit, V3 } from '../../space/Kepler';
import { atmosphereFor, exposureFor, irradianceAt } from '../../space/Worlds';
import { GuidedFlight, HANDOVER_ALT, planAscent, rangerPerf, spinVector } from '../../space/Descent';
import { behindTarget, FlightProgram, siteFunction } from '../../space/FlightProgram';
import { FlightEnv, RANGER_SPEC, Spacecraft } from '../../vehicles/Spacecraft';
import type { Autopilot, Flight } from '../../vehicles/Flight';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import type { OrbitZone } from './OrbitZone';
import { SeaSurface } from '../../render/Sea';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _z = new THREE.Vector3();

interface WorldLook { layers: TerrainLayers; ground: [number, number, number]; sea?: boolean }

/** Ground materials per landing site (texture sets in public/assets/textures; tints keep each world's colour). */
const LOOK: Record<string, WorldLook> = {
  moon: {
    layers: { sets: ['regolith', 'regolith', 'gravel', 'regolith', 'rock'], tiles: [4.6, 7.3, 2.6, 5.9, 9], tints: [[1, 1, 1], [0.8, 0.8, 0.82], [0.72, 0.73, 0.76], [1.05, 1.05, 1.05], [0.6, 0.6, 0.62]], aux: 'none', rockSlope: [0.55, 0.85] },
    ground: [0.12, 0.12, 0.12],
  },
  mars: {
    layers: { sets: ['mars_soil', 'mars_soil', 'desert_gravel', 'desert_rock', 'desert_rock'], tiles: [3.4, 5.3, 2.4, 7, 9], tints: [[1, 1, 1], [0.62, 0.5, 0.46], [1.0, 0.7, 0.52], [0.92, 0.62, 0.46], [0.86, 0.58, 0.44]], aux: 'none', rockSlope: [0.5, 0.75] },
    ground: [0.36, 0.21, 0.13],
  },
  miller: {
    layers: { sets: ['sand', 'sand', 'gravel', 'sand', 'rock'], tiles: [3, 4.7, 2.2, 3, 8], tints: [[0.72, 0.7, 0.66], [0.58, 0.58, 0.56], [0.6, 0.6, 0.6], [0.7, 0.7, 0.68], [0.55, 0.55, 0.56]], aux: 'none', rockSlope: [0.6, 0.85] },
    ground: [0.2, 0.24, 0.26], sea: true,
  },
  mann: {
    layers: { sets: ['snow', 'ice', 'ice', 'snow', 'rock'], tiles: [4, 6, 6, 4, 9], tints: [[0.94, 0.96, 1.0], [0.86, 0.93, 1.02], [0.62, 0.64, 0.68], [1, 1, 1], [0.55, 0.57, 0.6]], aux: 'none', rockSlope: [0.62, 0.86] },
    ground: [0.62, 0.66, 0.72],
  },
  edmunds: {
    layers: { sets: ['sand', 'desert_gravel', 'dirt', 'desert_rock', 'desert_rock'], tiles: [3.4, 2.6, 4.5, 7, 9], tints: [[1.04, 0.96, 0.86], [1, 0.95, 0.88], [1.02, 0.9, 0.78], [1, 0.9, 0.8], [0.95, 0.86, 0.76]], aux: 'none', rockSlope: [0.5, 0.74] },
    ground: [0.42, 0.34, 0.25],
  },
};

/** The program as an autopilot of the Flight system: controls are the computer's while it runs. */
class ProgramPilot implements Autopilot {
  carriedOk = true;
  name: string;
  constructor(public program: FlightProgram) { this.name = program.kind === 'descent' ? 'Automatic landing' : 'Automatic return'; }
  step() { return false; }
  status() { return this.program.status(); }
}
export { ProgramPilot };

/**
 * A landing site: streamed procedural ground centred on the pad (y up, x east, z south), the sky of the world with
 * the Sun (or Gargantua's light) placed from the ephemeris, the rest of the system and the planet's own globe drawn
 * beyond the terrain's edge, surface gravity, and Ranger 1 flown in by the guided descent program and out by the
 * ascent program.
 */
export class SurfaceZone extends Zone {
  body: BodyDef = BODY.moon;
  sky!: Sky;
  terrain: Terrain | null = null;
  stars!: StarField;
  view!: SystemView;
  lights!: LightPool;
  ranger!: Spacecraft;
  sea: SeaSurface | null = null;
  program: FlightProgram | null = null;
  /** height of the Ranger's model origin above the ground on its gear (m) */
  touchH = 1.1;
  private rot = new THREE.Matrix4();
  private camSys: V3 = [0, 0, 0];
  private siteSys: V3 = [0, 0, 0];
  private axes = { e: [1, 0, 0] as V3, u: [0, 1, 0] as V3, s: [0, 0, 1] as V3 };
  private hudT = 0;
  private landedAt = -1;
  /** the Ranger stands on the pad (engines safe) */
  landed = false;

  env: FlightEnv = {
    gravity: (_p, out) => out.set(0, -surfaceGravity(this.body), 0),
    density: (p) => { const a = this.body.atmosphere; return a ? a.rho0 * Math.exp(-Math.max(0, p.y) / a.H) : 0; },
    altitude: (p) => p.y - (this.terrain ? this.terrain.source.height(p.x, p.z) : 0),
  };

  get orbit() { return this.game.zones.get('orbit') as OrbitZone; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    progress?.(0.2, 'Sky');
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere, { ...EARTH_ATMOSPHERE, cloudCoverage: 0, cirrus: 0 });
    this.sky.freeSun = true;
    this.sky.setShadowQuality(g.settings.g.shadowQuality);
    this.sky.setVisible(false);
    this.stars = new StarField();
    this.view = new SystemView('sol');
    this.view.showSun = false;
    this.lights = new LightPool(this.root, 8, 3);
    progress?.(0.5, 'Ranger');
    const m = await assets.load('ranger');
    this.ranger = new Spacecraft('ranger1', RANGER_SPEC, m, this.phys, this.lights);
    const veh = m.marker('vehicle', 'ranger');
    if (veh && typeof veh.data.ground === 'number') this.touchH = -veh.data.ground;
    this.root.add(this.ranger.root);
    this.ranger.setCarried(true);
    this.ranger.onImpact = (dv) => { if (dv > 1.2) ui.toast(`Hard contact: ${dv.toFixed(1)} m/s`, 'warn', 3); };
    progress?.(1, 'Ready');
  }

  /** Build the ground and sky of a world (once per world visited). */
  setBody(id: string) {
    const b = BODY[id];
    const same = this.body.id === id && this.terrain;
    this.body = b;
    if (!same) {
      this.terrain?.dispose();
      this.terrain?.group.removeFromParent();
      const look = LOOK[id] ?? LOOK.moon;
      this.terrain = new Terrain(this.phys, { source: `surface:${id}`, layers: look.layers, rootSize: 65536, minSize: 64 });
      this.terrain.setDetail(this.game.settings.g.viewDistance);
      this.root.add(this.terrain.group);
      this.sky.groundColor.setRGB(...look.ground);
      this.sea?.dispose();
      this.sea = null;
      if (look.sea) { this.sea = new SeaSurface(b.R); this.root.add(this.sea.mesh); }
      if (this.view.system !== b.system) {
        const inScene = !!this.view.group.parent;
        this.view.dispose();
        this.view = new SystemView(b.system);
        this.view.showSun = false;
        if (inScene) this.game.renderer.spaceScene.add(this.view.group);
      }
    }
    const air = atmosphereFor(b, this.orbit.jd);
    this.sky.setParams({ ...air, fogDensity: b.atmosphere ? Math.min(2.5e-4, 2.2e-5 * (b.atmosphere.rho0 / 1.2) ** 0.5 * 4) : 0, fogFalloff: 0.0007 });
    this.sky.setStars(0);
    this.sky.invalidate();
    // the planet itself is drawn by the system view beyond the terrain; its atmosphere by the sky
    this.view.exclude.clear();
    this.view.noShell.clear();
    this.view.noShell.add(id);
  }

  override enter() {
    super.enter();
    const g = this.game;
    g.renderer.spaceScene.add(this.stars.group, this.view.group);
    this.sky.setVisible(true);
    g.renderer.preRender.push(this.place);
    g.renderer.setLook({ exposure: this.exposure(), saturation: 1.08, contrast: 1.18, bloom: 0.55, aoIntensity: 1.6, aoRadius: 1.4 }, true);
    g.interactions.occlusion = null;
    const flight = g.services.flight as Flight;
    flight.canLeave = () => (this.program && !this.landed ? 'The Ranger is flying.' : null);
    bus.on('flight:autopilot', this.onAutopilotKey);
    bus.on('flight:leave', this.onLeaveSeat);
  }

  override leave() {
    super.leave();
    const g = this.game;
    g.renderer.spaceScene.remove(this.stars.group, this.view.group);
    this.sky.setVisible(false);
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== this.place);
    bus.off('flight:autopilot', this.onAutopilotKey);
    bus.off('flight:leave', this.onLeaveSeat);
  }

  exposure() { return exposureFor(irradianceAt(this.body.id, this.orbit.jd), 0.9); }

  // ------------------------------------------------------------------------------------------- frames
  /** site and its east/up/south axes in the system frame, for the program's (or the mission's) time */
  private updateFrame() {
    const b = this.body, L = b.landing!;
    const jd = this.program ? this.program.jd : this.orbit.jd;
    const rel = surfacePoint(b.id, L.lat, L.lon, jd);
    const bp = state(b.id, jd).r;
    this.siteSys = add(bp, rel);
    const u = unit(rel), e = unit(cross(pole(b.id), u)), n = cross(u, e);
    this.axes.e = e; this.axes.u = u; this.axes.s = scale(n, -1);
    const { e: X, u: Y, s: Z } = this.axes;
    this.rot.set(X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, 0, 0, 0, 1);
  }

  /** a body-centred inertial vector (relative to the site) into the zone frame */
  private toZone(v: V3, out: THREE.Vector3) { return out.set(dot(v, this.axes.e), dot(v, this.axes.u), dot(v, this.axes.s)); }

  /** the camera in the system frame, the background placed around it */
  place = (cam: THREE.PerspectiveCamera) => {
    cam.getWorldPosition(_v);
    const { e, u, s } = this.axes;
    for (let i = 0; i < 3; i++) this.camSys[i] = this.siteSys[i] + e[i] * _v.x + u[i] * _v.y + s[i] * _v.z;
    const jd = this.program ? this.program.jd : this.orbit.jd;
    this.view.update(jd, this.camSys, this.rot, this.game.renderer.height / ((cam.fov * Math.PI) / 180));
    // stars: their catalogue is J2000 equatorial
    const obl = (23.4392911 * Math.PI) / 180;
    const m = new THREE.Matrix4().multiplyMatrices(this.rot, new THREE.Matrix4().makeRotationX(-obl)).elements;
    this.stars.orient(_x.set(m[0], m[4], m[8]), _z.set(m[1], m[5], m[9]), new THREE.Vector3(m[2], m[6], m[10]));
    // stars show in a black sky; an air-filled sky by day hides them
    const day = this.body.atmosphere ? clamp(this.sky.sunDir.y * 6 + 0.6, 0, 1) : 0;
    const look = cam.getWorldDirection(_w);
    const sunIn = clamp((look.dot(this.sky.sunDir) - 0.6) / 0.4, 0, 1);
    const adapt = 0.95 / this.game.renderer.look.exposure;
    this.stars.setVisibility(2.2 * (1 - day) * (1 - 0.8 * sunIn) * adapt * (this.body.atmosphere ? 1 : 0.35), 6.5);
  };

  private updateSun() {
    // light from the system origin (the Sun, or Gargantua's disk)
    const sunZ = this.toZone(scale(this.siteSys, -1), _v).normalize();
    this.sky.setSunDirection(sunZ);
    this.sky.params.sunE = 20 * irradianceAt(this.body.id, this.orbit.jd);
    if (this.sea) this.sea.setSun(sunZ, this.sky.sunColor);
  }

  // ------------------------------------------------------------------------------------------- the Ranger
  /** Hand-over from the orbit zone a few kilometres up: the program continues to the pad. */
  takeOver(program: FlightProgram) {
    this.program = program;
    this.setBody(program.body.id);
    program.f.touchH = this.touchH;
    this.landed = false;
    this.landedAt = -1;
    const flight = this.game.services.flight as Flight;
    const c = this.ranger;
    c.setCarried(true);
    c.setGear(false);
    c.gearT = 0;
    this.updateFrame();
    this.driveRanger(true);
    if (flight.craft !== c) { if (flight.craft) flight.leave(true); flight.enter(c, this.env, 'pilot_l'); }
    flight.engage(new ProgramPilot(program));
    flight.target = { name: this.body.landing!.site, pos: (out) => out.set(0, this.touchH, 0), vel: (out) => out.set(0, 0, 0) };
    this.terrain!.update(this.ranger.root.position);
  }

  /** Pose the Ranger from the guided flight (body-centred inertial -> zone, rotating with the ground). */
  private driveRanger(snap = false) {
    const f = this.program!.f, c = this.ranger;
    const st = f.site(f.t);
    const p = this.toZone(sub(f.r, st.r), new THREE.Vector3());
    const w = spinVector(this.body);
    const vRel = sub(f.v, cross(w, f.r));
    const v = this.toZone(vRel, new THREE.Vector3());
    const att = f.attitude();
    const fwd = this.toZone(att.fwd, new THREE.Vector3()).normalize();
    const up = this.toZone(att.up, new THREE.Vector3()).normalize();
    const back = fwd.clone().negate();
    const x = new THREE.Vector3().crossVectors(up, back).normalize();
    _m.makeBasis(x, up, back);
    _q.setFromRotationMatrix(_m);
    // rate-limit the attitude so phase changes swing the craft round rather than snapping it
    const cur = c.quaternion(new THREE.Quaternion());
    if (!snap) _q.copy(cur.slerp(_q, Math.min(1, 0.06 * Math.max(1, this.program!.warp()))));
    if (snap) c.place(p, _q, v);
    c.carry(p, _q, v);
    const firing = f.throttle > 0.002;
    c.plumeWhileCarried = firing;
    c.throttle = att.engines === 'main' ? f.throttle : 0;
    c.lift = att.engines === 'lift' ? f.throttle : 0;
    // gear down for the last few hundred metres
    if (this.program!.kind === 'descent' && f.height < 400 && !c.gearDown) c.setGear(true);
    if (this.program!.kind === 'ascent' && f.height > 120 && c.gearDown) c.setGear(false);
  }

  override fixedUpdate(dt: number) {
    const g = this.game, pr = this.program;
    if (pr) {
      pr.step(dt);
      // the mission clock follows the program (the player's own time)
      this.orbit.syncLocal(pr.met0 + pr.f.t, this.body.id);
      this.updateFrame();
      this.driveRanger();
      if (pr.kind === 'descent' && pr.f.phase === 'landed' && !this.landed) this.touchdown();
      if (pr.kind === 'ascent' && pr.f.phase !== 'landed' && pr.f.height > HANDOVER_ALT) this.handToOrbit();
    } else {
      this.orbit.advanceLocal(dt, this.body.id);
      this.updateFrame();
    }
    if (!this.program || this.landed) {
      // standing on the pad
      this.ranger.carry({ x: 0, y: this.touchH, z: 0 }, this.ranger.quaternion(_q), { x: 0, y: 0, z: 0 });
    }
    this.ranger.fixedUpdate(dt, this.env);
    const p = g.player.pos;
    this.terrain?.ensureCollision(p.x, p.z, 26);
  }

  private touchdown() {
    this.landed = true;
    this.landedAt = this.game.time;
    const f = this.program!.f;
    const flight = this.game.services.flight as Flight;
    flight.engage(null);
    this.ranger.throttle = 0; this.ranger.lift = 0; this.ranger.plumeWhileCarried = false;
    bus.emit('sfx', { id: 'thud', node: this.ranger.root, gain: 0.8 });
    mission.note(`Touchdown at ${this.body.landing!.site}, ${this.body.name}. Fuel ${(f.fuel / f.perf.fuel * 100).toFixed(0)}%.`);
    ui.toast(`Touchdown · ${this.body.landing!.site}`, 'good', 5);
    mission.setPhase('surface');
    this.orbit.rangerFuel = f.fuel;
    this.program = null;
  }

  /** Lift off for the Endurance: wait for the window on the pad, then climb into a rendezvous behind it. */
  launch(): string | null {
    if (this.program) return 'A program is already running.';
    const o = this.orbit;
    const jd0 = o.jd, met0 = o.met;
    const site = siteFunction(this.body, jd0);
    const g = o.currentGeometry();
    const endurance = (t: number) => o.parkState(g, o.phiE + o.n * t);
    const target = behindTarget(endurance, 1500);
    const perf = rangerPerf(RANGER_SPEC, o.rangerFuel);
    const plan = planAscent(this.body, site, target, perf);
    if (!plan) return 'No launch window within the next few days: the site is too far from the Endurance\'s orbit plane.';
    const s0 = site(0);
    const f = new GuidedFlight(this.body, add(s0.r, scale(s0.up, this.touchH)), s0.v, perf, 'ascent', site, target);
    f.touchH = this.touchH;
    f.phase = 'landed';
    const pr = new FlightProgram('ascent', f, this.body, jd0, met0);
    pr.launchAt = plan.tLaunch;
    this.program = pr;
    this.landed = false;
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== this.ranger) flight.enter(this.ranger, this.env, 'pilot_l');
    flight.engage(new ProgramPilot(pr));
    mission.note(`Ascent to the Endurance: launch window in ${(plan.tLaunch / 60).toFixed(0)} min, rendezvous ${((plan.tArrive - plan.tLaunch) / 60).toFixed(1)} min after lift-off.`);
    return null;
  }

  private handToOrbit() {
    const pr = this.program!;
    this.program = null;
    this.orbit.rangerFuel = pr.f.fuel;
    void this.game.gotoZone('orbit', { fade: false, onEnter: (z) => (z as OrbitZone).takeFlight(pr) });
  }

  private onAutopilotKey = () => {
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== this.ranger) return;
    if (this.program && flight.autopilot) { ui.toast(this.program.status(), 'info', 3); return; }
    this.game.openPanel('surfaceops');
  };

  /** Out of the seat: down the rear ramp onto the ground beside the Ranger. */
  private onLeaveSeat = (c: Spacecraft) => {
    if (this.game.zone !== this || c !== this.ranger) return;
    const q = this.ranger.quaternion(_q);
    const p = new THREE.Vector3(0, 0, 6.2).applyQuaternion(q).add(this.ranger.root.position);
    p.y = (this.terrain?.source.height(p.x, p.z) ?? 0) + 0.05;
    this.game.player.suited = true;
    this.game.player.stand(p, Math.atan2(-(p.x - this.ranger.root.position.x), -(p.z - this.ranger.root.position.z)) + Math.PI);
    ui.set({ mode: 'foot' });
  };

  /** Board: back into the pilot's seat. */
  board() {
    const flight = this.game.services.flight as Flight;
    flight.enter(this.ranger, this.env, 'pilot_l');
  }

  override update(dt: number) {
    const g = this.game;
    this.ranger.update(dt, g.alpha, this.body.atmosphere ? clamp(this.body.atmosphere.rho0 / 1.225, 0, 1) : 0);
    const cam = g.renderer.camera;
    cam.getWorldPosition(_v);
    this.terrain?.update(_v);
    this.updateSun();
    this.sea?.update(dt, _v);
    this.sky.shadowFocus.copy(_v.distanceTo(this.ranger.root.position) < 80 ? this.ranger.root.position : g.player.pos);
    this.sky.shadowRange = 40;
    const ground = this.terrain ? this.terrain.source.height(_v.x, _v.z) : 0;
    this.sky.update(dt, _v, Math.max(2, _v.y - ground + 2));
    this.lights.update(_v, dt);
    // boarding
    const flight = g.services.flight as Flight;
    if (!flight.craft && this.ranger.root.position.distanceTo(g.player.pos) < 7.5 && g.input.pressed('interact')) this.board();
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      const o = this.orbit;
      const clocks = o.missionClocks();
      if (this.program) clocks.push({ label: 'PROGRAM', value: this.program.status() });
      ui.set({ clocks, prompt: !flight.craft && this.ranger.root.position.distanceTo(g.player.pos) < 7.5 ? 'Board Ranger 1' : '', promptKey: 'E' });
      g.renderer.setLook({ exposure: this.exposure() });
    }
    void this.landedAt;
  }

  override gravityAt(_p: THREE.Vector3, out: THREE.Vector3) { return out.set(0, -surfaceGravity(this.body), 0); }

  override groundHeight(x: number, z: number) {
    const h = this.terrain ? this.terrain.source.height(x, z) : 0;
    return this.sea ? Math.max(h, MILLER_SEA_FLOOR) : h;
  }

  override soundscape(o: Soundscape) {
    const flight = this.game.services.flight as Flight;
    const inCraft = !!flight.craft;
    const air = this.body.atmosphere ? clamp(this.body.atmosphere.rho0 / 1.2, 0, 1) : 0;
    o.wind = inCraft ? 0 : air * 0.6; o.dust = this.body.id === 'mars' || this.body.id === 'edmunds' ? air * 0.4 : 0;
    o.rustle = 0; o.water = this.sea && !inCraft ? 0.7 : 0; o.rumble = this.program ? 0.4 : 0;
    o.indoors = inCraft ? 1 : 0; o.vacuum = !inCraft && !this.body.atmosphere ? 1 : 0;
    o.helmet = !inCraft ? 1 : 0;
    o.hum = inCraft ? 0.35 : 0.1; o.air = inCraft ? 0.4 : 0.5;
    o.reverb = inCraft ? 'ship' : 'helmet';
    o.music = 'orbit';
    o.intensity = this.program ? 0.6 : 0.3;
    return o;
  }

  override locationName() {
    const L = this.body.landing;
    if (this.program && !this.landed) return `${this.body.name} · ${this.program.status()}`;
    return `${this.body.name} · ${L?.site ?? 'surface'}`;
  }
}

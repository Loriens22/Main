import * as THREE from 'three';
import { Zone, type SpawnSpec } from '../Zone';
import { Frame } from '../Frame';
import type { Game } from '../../core/Game';
import type { RenderLayer } from '../../render/Renderer';
import { Starfield, SunDisc } from '../../render/Globe';
import { SolarSystem, helio, eclToThree } from '../../render/SolarSystem';
import { Gargantua, AlienSky } from '../../render/Gargantua';
import { BODIES } from '../../data/bodies';
import { SURFACES, handoverAltitude, type SurfaceDef } from '../../data/landing';
import { SPECS } from '../../data/vehicles';
import type { Spacecraft, FlightEnv } from '../../vehicles/Spacecraft';
import type { FlightControl } from '../../vehicles/FlightControl';
import { gmst, orbitSummary } from '../../space/earthFrame';
import { MILLER_FACTOR } from '../../core/MissionClock';
import type { V3 } from '../../space/kepler';
import { makeSite, inertialToLocal, localToInertial, localToInertialRot, localOmega, localToBF, localLatLon, bodyRot, type SurfaceSite } from '../../space/surfaceFrame';
import { PoweredDescent, LandHere, AscentToOrbit, brakingDistance, type SurfaceAPHost } from '../../space/Landing';
import { Terrain } from '../terrain/Terrain';
import { Heightmap } from '../terrain/Heightmap';
import { BodyMap, SurfaceGen } from '../surface/SurfaceGen';
import { surfaceShading, sunShadowPatch } from '../surface/surfaceShading';
import { Rocks } from '../surface/Rocks';
import { RangerVehicle } from '../RangerVehicle';
import { h } from '../../ui/UI';

/** Where the Ranger is on (or above) a body's surface — persisted in vehicles.ranger1.data.surface. */
export interface SurfaceState {
  body: string;
  lat: number;
  lon: number;
  name: string;
  /** continue with the powered-descent autopilot after the handover */
  autoland?: boolean;
}

/** Inertial craft state at a zone handover (relative to the body centre, three equatorial axes). */
export interface Handover {
  r: V3;
  v: V3;
  q: [number, number, number, number];
  t: number;
  /** autopilot to resume on the other side */
  program?: 'descent' | 'orbit-insertion';
  apTarget?: number;
}

const NEAR_SIZE = 4096;
const MID_SIZE = 32768;
const MAP_RES = 1025;

/**
 * The surface of any landable body (Moon, Mars, Mercury, the large moons…), in a landing site's local frame:
 * X east, Y up, Z south (metres), the body centre at (0, −R, 0). Terrain includes the sphere's curvature, gravity is
 * radial (plus centrifugal), so orbital mechanics stay exact through the descent; velocities are relative to the
 * rotating surface. The far layer is the full Solar-System renderer seen from the camera (sky, Sun, planets).
 */
export default class SurfaceZone extends Zone implements SurfaceAPHost {
  readonly id = 'surface' as const;
  readonly far = new THREE.Scene();
  readonly farCam = new THREE.PerspectiveCamera(60, 1, 1, 3e5);
  system!: SolarSystem;
  stars!: Starfield;
  sunDisc!: SunDisc;
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  site!: SurfaceSite;
  def!: SurfaceDef;
  map!: BodyMap;
  gen!: SurfaceGen;
  terrain!: Terrain;
  rocks!: Rocks;
  ground!: Frame;
  hHand = 40e3;
  readonly center = new THREE.Vector3();
  omegaL = new THREE.Vector3();
  target: V3 = [0, 0, 0];
  targetName = '';
  env!: FlightEnv;
  // Ranger 1
  ranger!: RangerVehicle;
  get craft() {
    return this.ranger?.craft;
  }
  get control() {
    return this.ranger?.control;
  }
  get rangerSite() {
    return this.ranger?.site ?? null;
  }
  get r1Root() {
    return this.ranger.root;
  }
  get r1Inst() {
    return this.ranger.inst;
  }
  private handing = false;
  private nearJob: Generator<number, import('../terrain/Heightmap').Heightmap> | null = null;
  private nearJobTier: 'near' | 'mid' = 'near';
  private nearCenter = new THREE.Vector2();
  private midCenter = new THREE.Vector2();
  private sunLocal = new THREE.Vector3(0, 1, 0);
  private sunVisCPU = 1;
  flux = 1;
  private envT = 0;
  private dustT = 0;
  private dust: THREE.Points | null = null;
  /** in the Gargantua system: the black hole, its galaxy, its disk-lit planets */
  garg = false;
  gargantua: Gargantua | null = null;
  alienSky: AlienSky | null = null;
  water: THREE.Mesh | null = null;

  constructor(game: Game) {
    super(game);
    this.music = 'space';
  }

  // ===================================================================================================== load
  async load(progress: (p: number, msg: string) => void) {
    const game = this.game;
    const st = game.state.vehicles.ranger1;
    const sd = (st.data.surface as SurfaceState | undefined) ?? { body: 'moon', lat: 0.674, lon: 23.473, name: 'Mare Tranquillitatis' };
    st.data.surface = sd;
    const body = BODIES[sd.body];
    this.def = SURFACES[sd.body];
    this.site = makeSite(sd.body, sd.lat, sd.lon);
    this.targetName = sd.name;
    this.hHand = handoverAltitude(sd.body, body.radius);
    this.center.set(0, -body.radius, 0);
    const t = game.state.clock.earthTime;
    this.omegaL = localOmega(this.site, t);
    progress(0.05, `${body.name}: surface maps`);
    this.map = await BodyMap.load(sd.body);
    // far map: the whole braking path plus the horizon from the handover altitude
    const aMax = SPECS.ranger.mainThrust / (SPECS.ranger.dryMass + SPECS.ranger.propMax);
    const need = Math.max(brakingDistance(body.mu, body.radius, 0.42 * aMax) * 1.3, Math.sqrt(2 * body.radius * this.hHand) * 1.05, 30e3);
    const farHalf = Math.min(need, 0.42 * body.radius);
    this.gen = new SurfaceGen({ site: this.site, map: this.map, farHalf });
    progress(0.15, 'terrain');
    await new Promise((r) => setTimeout(r, 0));
    this.gen.build([0, 0], Math.min(NEAR_SIZE, farHalf * 1.6), Math.min(MID_SIZE, farHalf * 1.6), MAP_RES);
    this.nearCenter.set(0, 0);
    this.midCenter.set(0, 0);
    this.target = [0, this.gen.field.height(0, 0), 0];
    progress(0.55, 'terrain renderer');
    const shading = surfaceShading(this.gen, game.materials);
    shading.uniforms.uShadowQ.value = game.settings.graphics.shadowQuality > 0 ? 1 : 0;
    this.terrain = new Terrain({
      field: this.gen.field, rootSize: farHalf * 2, rootCenter: [0, 0], leafSize: 64, lodBase: 120, shading,
      fragmentPatch: sunShadowPatch, cacheKey: 'surface', maxInstances: 1600,
    });
    this.scene.add(this.terrain.mesh);
    this.disposables.push(this.terrain);
    // ground frame: radial gravity toward the body centre plus the centrifugal term of the rotating surface
    const mu = body.mu;
    this.ground = this.addFrame(new Frame('surface', this.scene, (l, o) => {
      o.copy(l).sub(this.center);
      const r = o.length();
      const w = this.omegaL;
      const cen = new THREE.Vector3().crossVectors(w, new THREE.Vector3().crossVectors(w, o)).negate();
      return o.multiplyScalar(-mu / (r * r * r)).add(cen);
    }, body.name));
    this.ground.surfaceFn = () => (this.def.style === 'ocean' ? 'water' : this.def.style === 'icy' || this.def.style === 'europa' || this.def.style === 'glacier' ? 'ice' : 'dirt');
    this.ground.pressurizedFn = (l) => this.cabinPressurised(l);
    this.env = this.makeEnv();
    // light
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = game.settings.graphics.shadowQuality > 0;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 500;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x000000, 0x403a34, 0.3);
    this.scene.add(this.hemi);
    // far layer
    progress(0.65, 'sky');
    this.garg = body.system === 'gargantua';
    this.system = new SolarSystem(game.materials, this.garg ? ['miller', 'mann', 'edmunds'] : undefined);
    if (this.garg) {
      this.system.fluxRef = 6e12;
      this.alienSky = new AlienSky();
      this.far.add(this.alienSky.mesh);
      const sysN = new THREE.Vector3(...eclToThree([0, 0, 1]));
      this.gargantua = new Gargantua(BODIES.gargantua.radius / 1000, sysN.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.18).normalize());
      this.far.add(this.gargantua.mesh);
    }
    this.far.add(this.system.group);
    this.stars = new Starfield();
    this.far.add(this.stars.group);
    this.stars.group.visible = !this.garg;
    this.sunDisc = new SunDisc();
    this.far.add(this.sunDisc.mesh);
    // Ranger 1
    progress(0.75, 'Ranger 1');
    this.ranger = new RangerVehicle(this);
    await this.ranger.load();
    this.ranger.onTouchdown = () => {
      game.notify(`Ranger 1 down on ${BODIES[this.site.body].name} — ${this.targetName}. F to stand up.`, 'ok', 6);
      this.say('ward', `${BODIES[this.site.body].name}. ${this.targetName}. We're down.`);
    };
    progress(0.85, 'boulders');
    const rc = this.map.lumAt(sd.lat, sd.lon);
    const style = this.def.style;
    const rockColor = style === 'mars' ? new THREE.Color(0.32, 0.2, 0.14) : style === 'desert' ? new THREE.Color(0.2, 0.16, 0.13) : style === 'icy' || style === 'europa' || style === 'glacier' ? new THREE.Color(0.7, 0.7, 0.72) : style === 'titan' ? new THREE.Color(0.5, 0.42, 0.3) : new THREE.Color().setScalar(THREE.MathUtils.clamp(rc * 0.5, 0.08, 0.32));
    this.rocks = new Rocks(this.gen, rockColor);
    this.scene.add(this.rocks.group);
    this.buildDust();
    this.buildSkyDome();
    if (this.def.style === 'ocean') this.buildWater();
    progress(1, 'ready');
  }

  private makeEnv(): FlightEnv {
    const body = BODIES[this.site.body];
    const mu = body.mu, R = body.radius;
    const atm = ATMO_SURF[this.site.body];
    const c = this.center;
    return {
      gravity: (p) => {
        const x = p[0] - c.x, y = p[1] - c.y, z = p[2] - c.z;
        const r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
        const k = -mu / (r2 * r);
        const w = this.omegaL;
        // centrifugal: −ω × (ω × r)
        const wr = new THREE.Vector3().crossVectors(w, new THREE.Vector3(x, y, z));
        const cen = new THREE.Vector3().crossVectors(w, wr).negate();
        return [x * k + cen.x, y * k + cen.y, z * k + cen.z];
      },
      density: (p) => {
        if (!atm) return 0;
        const hgt = Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) - R;
        return atm.rho0 * Math.exp(-Math.max(0, hgt) / atm.H);
      },
      up: (p) => {
        const x = p[0] - c.x, y = p[1] - c.y, z = p[2] - c.z;
        const n = Math.hypot(x, y, z);
        return [x / n, y / n, z / n];
      },
      altitude: (p) => Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) - R,
      ground: (p) => {
        const hgt = this.gen.field.height(p[0], p[2]) + this.rocks.bumpAt(p[0], p[2]);
        const n = this.gen.field.normal(p[0], p[2], 2.5);
        // Spacecraft compares heights along env.up (radial here): express the ground point the same way
        const x = p[0] - c.x, y = p[1] - c.y, z = p[2] - c.z;
        const r = Math.hypot(x, y, z);
        const h = (p[0] * x + hgt * y + p[2] * z) / r;
        return { h, n: [n.x, n.y, n.z] };
      },
      fictitious: (_p, v) => {
        // Coriolis −2ω × v (the centrifugal part is in gravity)
        const w = this.omegaL;
        return [-2 * (w.y * v[2] - w.z * v[1]), -2 * (w.z * v[0] - w.x * v[2]), -2 * (w.x * v[1] - w.y * v[0])];
      },
    };
  }

  describe() {
    const b = BODIES[this.site.body];
    if (!this.craft) return { name: b.name.toUpperCase(), sub: this.targetName };
    const agl = this.craft.pos[1] - this.ground_(this.craft.pos[0], this.craft.pos[2]);
    const g = new THREE.Vector3(...this.env.gravity(this.craft.pos)).length() / 9.81;
    const ll = localLatLon(this.site, this.craft.pos);
    const where = `${Math.abs(ll.lat).toFixed(2)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(2)}°${ll.lon >= 0 ? 'E' : 'W'}`;
    if (this.craft.landed || agl < 3) return { name: b.name.toUpperCase(), sub: `${this.targetName} · ${where} · ${g < 0.05 ? g.toFixed(4) : g.toFixed(2)} g · ${this.def.temp}` };
    return { name: `${b.name.toUpperCase()} — DESCENT`, sub: `${(agl / 1000).toFixed(1)} km above ${this.targetName}` };
  }

  private ground_(x: number, z: number) {
    return this.gen.field.height(x, z);
  }

  groundHeight(x: number, z: number) {
    return this.gen.field.height(x, z);
  }

  altitude() {
    return this.craft ? this.env.altitude(this.craft.pos) : 2;
  }

  inVacuum() {
    return !ATMO_SURF[this.site.body] && !this.cabinPressurised(this.game.player.pos);
  }

  now() {
    return this.game.state.clock.earthTime;
  }

  say(who: string, text: string) {
    this.game.say(who, text);
    this.game.log('comms', who, text);
  }

  orbit(c: Spacecraft) {
    const R = BODIES[this.site.body].radius, mu = BODIES[this.site.body].mu;
    const r = new THREE.Vector3(c.pos[0] - this.center.x, c.pos[1] - this.center.y, c.pos[2] - this.center.z);
    const v = new THREE.Vector3(...c.vel).add(new THREE.Vector3().crossVectors(this.omegaL, r));
    return orbitSummary(r.toArray() as V3, v.toArray() as V3, mu, R);
  }

  clockContext() {
    // on Miller (and with the Endurance parked in Miller orbit) one hour is about seven Earth years
    if (this.site.body === 'miller') return { playerDilation: MILLER_FACTOR, enduranceDilation: MILLER_FACTOR };
    return {};
  }

  maxTimeWarp() {
    if (this.craft && !this.craft.landed && this.control && this.game.control === this.control) return 1;
    return 1000;
  }

  // ===================================================================================================== spawn
  spawn(spec: SpawnSpec) {
    const game = this.game;
    const st = game.state.vehicles.ranger1;
    const t = game.state.clock.earthTime;
    st.location = 'surface';
    st.docked = null;
    let at = spec.at ?? (st.landed ? 'landed' : 'flight');
    if (at === 'descent' && !st.data.handover) at = 'landed';
    let program: Handover['program'];
    if (at === 'descent') {
      const ho = st.data.handover as Handover;
      const L = inertialToLocal(this.site, t, ho.r, ho.v, new THREE.Quaternion(...ho.q));
      st.pos = [...L.p];
      st.vel = [...L.v];
      st.quat = [L.q.x, L.q.y, L.q.z, L.q.w];
      st.angVel = [0, 0, 0];
      st.landed = false;
      st.gearDown = false;
      program = ho.program;
      delete st.data.handover;
    } else if (at === 'landed' || at === 'eva') {
      const p = this.ranger.landedPose(0, 0, 0);
      st.pos = p.pos;
      st.vel = [0, 0, 0];
      st.quat = [p.q.x, p.q.y, p.q.z, p.q.w];
      st.angVel = [0, 0, 0];
      st.landed = true;
      st.gearDown = true;
    }
    this.ranger.create(st);
    this.ranger.seat();
    if (program === 'descent') this.control.setAutopilot(new PoweredDescent(this, this.targetName));
    // airborne: start in the chase view so the descent and the ground are visible (the Ranger's windows are overhead)
    if (!st.landed) this.control.camMode = 'chase';
    if (at === 'eva') this.beginEva(true);
  }

  /** Straight to the surface beside the ladder (debug / quick EVA). */
  beginEva(quiet = false) {
    this.ranger.beginEva(quiet);
  }

  removeRangerSite() {
    this.ranger.removeSite();
  }

  private cabinPressurised(l: THREE.Vector3) {
    return this.ranger ? this.ranger.cabinPressurised(l) : false;
  }

  groundNormal(x: number, z: number) {
    return this.gen.field.normal(x, z, 4);
  }

  // ===================================================================================================== HUD / menu
  hudInfo() {
    const c = this.craft;
    const agl = c.pos[1] - this.ground_(c.pos[0], c.pos[2]);
    const up = new THREE.Vector3(...this.env.up(c.pos));
    const v = new THREE.Vector3(...c.vel);
    const hs = v.clone().addScaledVector(up, -v.dot(up)).length();
    const tg = new THREE.Vector3(...this.target);
    const rng = new THREE.Vector3(c.pos[0] - tg.x, 0, c.pos[2] - tg.z).length();
    const s = this.orbit(c);
    return {
      orbit: agl > 15e3 ? { body: BODIES[this.site.body].name.toUpperCase(), ap: s.ap, pe: s.pe, period: s.period, inc: THREE.MathUtils.radToDeg(s.inc) } : null,
      target: null,
      extra: [
        ['AGL', agl > 2000 ? `${(agl / 1000).toFixed(2)} km` : `${agl.toFixed(1)} m`],
        ['H-SPD', `${hs.toFixed(1)} m/s`],
        ['SITE', rng > 2000 ? `${(rng / 1000).toFixed(1)} km` : `${rng.toFixed(0)} m`],
        ['Δv', `${(c.deltaV() / 1000).toFixed(2)} km/s`],
        ['G', `${(new THREE.Vector3(...this.env.gravity(c.pos)).length() / 9.81).toFixed(3)} g`],
      ] as [string, string][],
    };
  }

  /** Engage the ascent-to-orbit program (menu / tests). */
  /** Ascent targets: airless — a low orbit just above the handover; atmosphere — climb out steeply (≈4 scale
   * heights) before building speed, apoapsis above the atmosphere so the orbit does not decay. */
  ascentPlan() {
    const atm = ATMO_SURF[this.site.body];
    const top = ATMOS_TOP[this.site.body] ?? 0;
    const apT = atm ? Math.max(this.hHand + 15e3, top * 0.85) : this.hHand + Math.min(15e3, 0.5 * this.hHand);
    const climb = atm ? Math.min(Math.max(4 * atm.H, this.hHand + 8e3), apT * 0.7) : Math.max(this.hHand * 0.35, 3e3);
    return { apT, climb, maxVr: atm ? 320 : 160 };
  }

  ascend() {
    const p = this.ascentPlan();
    this.control.setAutopilot(new AscentToOrbit(this, p.apT, p.climb, p.maxVr));
  }

  openAutopilotMenu(ctrl: FlightControl) {
    const game = this.game;
    game.input.releaseLock();
    const c = this.craft;
    const agl = c.pos[1] - this.ground_(c.pos[0], c.pos[2]);
    const apT = this.ascentPlan().apT;
    game.ui.openPanel('RANGER 1 — FLIGHT COMPUTER', (b, p) => {
      const pick = (fn: () => void) => () => {
        fn();
        p.close();
        game.input.requestLock();
      };
      const add = (label: string, desc: string, ok: boolean, fn: () => void) => {
        const btn = game.ui.button(label, pick(fn), ok ? 'btn primary' : 'btn');
        btn.disabled = !ok;
        b.append(h('div', { style: { margin: '8px 0' } }, btn, h('div', { class: 'dim', style: { fontSize: '12px', marginTop: '4px' } }, desc)));
      };
      b.append(h('div', { class: 'mono', style: { marginBottom: '10px' } }, `${BODIES[this.site.body].name} · ${c.landed ? 'landed' : `${agl.toFixed(0)} m AGL`} · Δv ${(c.deltaV() / 1000).toFixed(2)} km/s`));
      add(`POWERED DESCENT — ${this.targetName.toUpperCase()}`, 'Braking burn to the high gate, pitch-over to the hover thrusters, approach and vertical touchdown at the site.', !c.landed && agl > 300, () => ctrl.setAutopilot(new PoweredDescent(this, this.targetName)));
      add('LAND HERE', 'Null the horizontal speed and descend vertically to touchdown below the current position.', !c.landed && agl > 3, () => {
        const v = new THREE.Vector3(...c.vel);
        const up = new THREE.Vector3(...this.env.up(c.pos));
        const hv = v.addScaledVector(up, -v.dot(up));
        const x = c.pos[0] + hv.x * hv.length() / 3, z = c.pos[2] + hv.z * hv.length() / 3;
        this.target = [x, this.ground_(x, z), z];
        this.targetName = 'touchdown point';
        ctrl.setAutopilot(new LandHere(this));
      });
      add('ASCENT TO ORBIT', `VTOL lift-off, pitch-over and main-engine ascent to a ${(apT / 1000).toFixed(0)} km apoapsis; orbit insertion continues in orbit.`, true, () => this.ascend());
      add('DISENGAGE AUTOPILOT', 'Manual flight: I/K hover thrust up/down, J/L/H/N translate, W/S pitch, A/D yaw, Q/E roll, G gear.', !!ctrl.autopilot, () => ctrl.setAutopilot(null));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }

  // ===================================================================================================== update
  update(dt: number, _dtEarth: number) {
    this.time += dt;
    const game = this.game;
    if (!this.craft) return;
    const t = game.state.clock.earthTime;
    this.omegaL = localOmega(this.site, t);
    const c = this.craft;
    // ---- the Ranger: physics with autopilot, touchdown, walkable site
    this.ranger.update(dt);
    this.updateDust(dt);
    // ---- ascent handover back to orbit
    const alt = this.env.altitude(c.pos);
    const ascAp = this.control.autopilot instanceof AscentToOrbit ? this.control.autopilot : null;
    if (!this.handing && !this.rangerSite && alt > this.hHand + Math.min(3e3, 0.15 * this.hHand) && ascAp?.phase !== 'hop') {
      const up = new THREE.Vector3(...this.env.up(c.pos));
      if (new THREE.Vector3(...c.vel).dot(up) > 0 || ascAp?.phase === 'orbit') this.handToOrbit();
    }
    // ---- terrain & streaming
    this.terrain.update(game.camera);
    this.streamNear();
    const pl = game.player;
    const focus = pl.frame === this.ground && pl.mode !== 'seat' ? pl.pos.clone() : new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]);
    const ph = this.ground.physics;
    if (pl.mode !== 'seat' && ph.terrainCenter.distanceTo(new THREE.Vector2(focus.x, focus.z)) > 60) {
      const cs = 1;
      const cx = Math.round(focus.x / cs) * cs, cz = Math.round(focus.z / cs) * cs;
      ph.setTerrainPatch(cx, cz, 192, cs, (x, z) => this.gen.field.height(x, z));
    }
    const camP = game.camera.position;
    this.rocks.update(camP.distanceTo(focus) < 600 ? focus : camP, pl.mode !== 'seat' ? ph : null);
    this.rocks.group.visible = this.env.altitude([camP.x, camP.y, camP.z]) - (this.gen.field.height(camP.x, camP.z) - this.center.y - BODIES[this.site.body].radius) < 3000;
    if (pl.frame === this.ground && pl.mode !== 'seat') ph.step(dt);
    // helmet visor outside the pressurised cabin
    const fx = game.renderer.fx;
    fx.visor = THREE.MathUtils.damp(fx.visor, pl.mode !== 'seat' && !this.cabinPressurised(pl.pos) ? 0.55 : 0, 3, dt);
    this.updateSky(dt);
  }

  private handToOrbit() {
    this.handing = true;
    const game = this.game;
    const c = this.craft;
    const st = game.state.vehicles.ranger1;
    const t = game.state.clock.earthTime;
    const I = localToInertial(this.site, t, c.pos as V3, c.vel as V3, c.quat);
    const asc = this.control.autopilot instanceof AscentToOrbit ? this.control.autopilot : null;
    const ho: Handover = { r: I.r, v: I.v, q: [I.q.x, I.q.y, I.q.z, I.q.w], t, program: asc && asc.phase !== 'orbit' ? 'orbit-insertion' : undefined, apTarget: asc?.apTarget };
    st.data.handover = ho;
    st.landed = false;
    st.location = 'space';
    this.control.setAutopilot(null);
    void game.goTo('space', { at: 'ascent' }, { fade: 0.6 });
  }

  // ===================================================================================================== terrain streaming
  /**
   * Re-centre the near (4 m) and mid (32 m) height maps under the focus, a few rows per frame, into a spare map of
   * the same size (double buffering: no allocation while streaming). Only below the altitudes where they matter.
   */
  private spare: { near: import('../terrain/Heightmap').Heightmap | null; mid: import('../terrain/Heightmap').Heightmap | null } = { near: null, mid: null };
  private streamNear() {
    const c = this.craft;
    const pl = this.game.player;
    const focus = pl.frame === this.ground && pl.mode !== 'seat' ? new THREE.Vector2(pl.pos.x, pl.pos.z) : new THREE.Vector2(c.pos[0], c.pos[2]);
    const agl = (pl.mode !== 'seat' ? pl.pos.y : c.pos[1]) - this.gen.field.height(focus.x, focus.y);
    if (this.nearJob) {
      const r = this.nearJob.next();
      if (r.done) {
        this.nearJob = null;
        this.swapMap(this.nearJobTier, r.value);
      }
      return;
    }
    const mk = (tier: 'near' | 'mid') => {
      const cur = this.gen[tier];
      let sp = this.spare[tier];
      if (!sp) sp = this.spare[tier] = new Heightmap(cur.minX, cur.minZ, cur.size, cur.res);
      return sp;
    };
    const mid = this.gen.mid;
    if (agl < 12000 && focus.distanceTo(this.midCenter) > mid.size * 0.22) {
      const cs = mid.cell;
      this.midCenter.set(Math.round(focus.x / cs) * cs, Math.round(focus.y / cs) * cs);
      this.nearJobTier = 'mid';
      this.nearJob = this.gen.fillMap(mk('mid'), this.midCenter.x, this.midCenter.y, 24);
      return;
    }
    const near = this.gen.near;
    if (agl > 2500) return;
    if (focus.distanceTo(this.nearCenter) < near.size * 0.28) return;
    const cs = near.cell;
    this.nearCenter.set(Math.round(focus.x / cs) * cs, Math.round(focus.y / cs) * cs);
    this.nearJobTier = 'near';
    this.nearJob = this.gen.fillMap(mk('near'), this.nearCenter.x, this.nearCenter.y, 40);
  }

  private swapMap(tier: 'near' | 'mid', hm: import('../terrain/Heightmap').Heightmap) {
    const u = this.terrain.uniforms;
    const old = this.gen[tier];
    this.spare[tier] = old;
    hm.touch();
    if (tier === 'near') {
      this.gen.near = hm;
      this.gen.field.near = hm;
      u.tHNear.value = hm.texture();
      (u.uNear.value as THREE.Vector4).set(hm.minX, hm.minZ, hm.size, hm.res);
      this.ground.physics.terrainCenter.set(1e9, 1e9);
    } else {
      this.gen.mid = hm;
      this.gen.field.mid = hm;
      u.tHMid.value = hm.texture();
      (u.uMid.value as THREE.Vector4).set(hm.minX, hm.minZ, hm.size, hm.res);
    }
  }

  // ===================================================================================================== sky dome
  private dome: THREE.Mesh | null = null;
  /** Dust/haze sky seen from inside a thick or dusty atmosphere (multiple scattering the far layer does not model). */
  private buildSkyDome() {
    const atm = ATMO_SURF[this.site.body];
    if (!atm) return;
    // drawn first in the opaque pass (transparent materials would sort after the terrain), blended over the far layer
    const mat = new THREE.ShaderMaterial({
      transparent: false, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color(...atm.zenith) }, uHor: { value: new THREE.Color(...atm.horizon) }, uGlow: { value: new THREE.Color(...atm.glow) }, uDay: { value: 1 }, uK: { value: 1 }, uAlpha: { value: atm.alpha } },
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vD; uniform vec3 uSun, uZen, uHor, uGlow; uniform float uDay, uK, uAlpha;
        void main(){
          vec3 d = normalize(vD); float hgt = d.y;
          float mu = dot(d, uSun);
          float tw = smoothstep(-0.25, 0.12, uSun.y);          // twilight
          vec3 c = mix(uHor, uZen, smoothstep(-0.02, 0.75, hgt)) * uDay;
          // forward-scattering aureole around the Sun (bluish on Mars), brighter toward the horizon at low sun
          c += uGlow * (pow(max(mu, 0.0), 6.0) * 0.55 + pow(max(mu, 0.0), 48.0) * 1.6) * tw;
          float a = uAlpha * clamp(uDay * 1.15 + 0.15 * tw, 0.0, 1.0);
          gl_FragColor = vec4(c * uK, a);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(12000, 48, 24), mat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.userData.owned = true;
    this.scene.add(this.dome);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...atm.horizon), atm.fog);
  }

  // ===================================================================================================== water (Miller)
  private waveTex: THREE.DataTexture | null = null;
  /** Shallow sea: a camera-following plane bent to the planet's curvature, tiled wave normals drifting with time. */
  private buildWater() {
    const N = 256;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let dx = 0, dz = 0;
        for (const [kx, kz, a] of [[3, 1, 1], [-2, 4, 0.7], [7, -5, 0.35], [-11, -3, 0.22], [13, 9, 0.14], [-21, 17, 0.08]]) {
          const ph = ((kx * i + kz * j) / N) * Math.PI * 2;
          dx += a * kx * Math.cos(ph);
          dz += a * kz * Math.cos(ph);
        }
        const n = new THREE.Vector3(-dx * 0.04, 1, -dz * 0.04).normalize();
        const k = (j * N + i) * 4;
        data[k] = (n.x * 0.5 + 0.5) * 255;
        data[k + 1] = (n.z * 0.5 + 0.5) * 255;
        data[k + 2] = (n.y * 0.5 + 0.5) * 255;
        data[k + 3] = 255;
      }
    }
    this.waveTex = new THREE.DataTexture(data, N, N);
    this.waveTex.wrapS = this.waveTex.wrapT = THREE.RepeatWrapping;
    this.waveTex.repeat.set(900, 900);
    this.waveTex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.13, 0.15), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.78, normalMap: this.waveTex, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false });
    const R = BODIES[this.site.body].radius;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSR = { value: R };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSR;').replace(
        '#include <project_vertex>',
        `vec4 wq = modelMatrix * vec4(transformed, 1.0);
         float rr = dot(wq.xz, wq.xz);
         wq.y = sqrt(max(uSR * uSR - rr, 0.0)) - uSR;
         vec4 mvPosition = viewMatrix * wq;
         gl_Position = projectionMatrix * mvPosition;`,
      );
    };
    const g = new THREE.PlaneGeometry(30000, 30000, 160, 160).rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, mat);
    this.water.frustumCulled = false;
    this.water.renderOrder = 5;
    this.water.userData.owned = true;
    this.scene.add(this.water);
  }

  private updateWater() {
    const w = this.water!;
    const cam = this.game.camera.position;
    w.position.set(Math.round(cam.x / 200) * 200, 0, Math.round(cam.z / 200) * 200);
    if (this.waveTex) {
      this.waveTex.offset.set(this.time * 0.0021 + w.position.x / 30000 * 900, this.time * 0.0013 - w.position.z / 30000 * 900);
    }
  }

  // ===================================================================================================== dust
  private buildDust() {
    const n = 900;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const style = this.def.style;
    const col = style === 'mars' ? new THREE.Color(0.75, 0.5, 0.33) : style === 'icy' || style === 'europa' ? new THREE.Color(0.85, 0.88, 0.92) : new THREE.Color(0.62, 0.6, 0.57);
    const m = new THREE.PointsMaterial({ color: col, size: 0.35, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.dust.userData.owned = true;
    this.scene.add(this.dust);
  }

  /** Plume-blown regolith: ballistic grains (no air on airless worlds — they fly far and flat). */
  private updateDust(dt: number) {
    if (!this.dust) return;
    const c = this.craft;
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const vel = this.dust.geometry.getAttribute('aV') as THREE.BufferAttribute;
    const n = pos.count;
    const gy = new THREE.Vector3(...this.env.gravity(c.pos)).length();
    const drag = ATMO_SURF[this.site.body] ? 1.4 : 0;
    const gh = this.gen.field.height(c.pos[0], c.pos[2]);
    const agl = c.pos[1] - gh;
    const power = this.rangerSite ? 0 : c.vtolLevel * THREE.MathUtils.clamp(1 - agl / 35, 0, 1);
    this.dustT += dt * power * 900;
    let spawn = Math.floor(this.dustT);
    this.dustT -= spawn;
    for (let i = 0; i < n; i++) {
      let life = vel.getW(i);
      if (life <= 0 && spawn > 0) {
        spawn--;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
        const x = c.pos[0] + Math.cos(a) * r, z = c.pos[2] + Math.sin(a) * r;
        pos.setXYZ(i, x, this.gen.field.height(x, z) + 0.1, z);
        const sp = 12 + Math.random() * 30 * power;
        vel.setXYZW(i, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 1.5 + Math.random() * 2);
        continue;
      }
      if (life <= 0) {
        pos.setY(i, -1e7);
        continue;
      }
      life -= dt;
      let vx = vel.getX(i), vy = vel.getY(i), vz = vel.getZ(i);
      vy -= gy * dt;
      const k = Math.exp(-drag * dt);
      vx *= k; vz *= k;
      let x = pos.getX(i) + vx * dt, y = pos.getY(i) + vy * dt, z = pos.getZ(i) + vz * dt;
      const hh = this.gen.field.height(x, z);
      if (y < hh) {
        y = hh;
        vy = 0;
        vx *= 0.3; vz *= 0.3;
        life = Math.min(life, 0.3);
      }
      pos.setXYZ(i, x, y, z);
      vel.setXYZW(i, vx, vy, vz, life);
    }
    pos.needsUpdate = true;
  }

  // ===================================================================================================== sky & light
  private updateSky(dt: number) {
    const game = this.game;
    const t = game.state.clock.earthTime;
    const cam = game.camera;
    const body = BODIES[this.site.body];
    const L2I = localToInertialRot(this.site, t);
    const camBF = localToBF(this.site, [cam.position.x, cam.position.y, cam.position.z]);
    const camI = camBF.applyMatrix3(bodyRot(this.site.body, t).transpose());
    const bh = helio(this.site.body, t).r;
    const camH: V3 = [bh[0] + camI.x, bh[1] + camI.y, bh[2] + camI.z];
    this.system.update(t, camH, gmst(t), this.time, game.renderer.canvas.clientHeight / THREE.MathUtils.degToRad(cam.fov));
    this.farQ.setFromRotationMatrix(L2I);
    const sunDist = Math.hypot(camH[0], camH[1], camH[2]);
    const sunI = new THREE.Vector3(-camH[0], -camH[1], -camH[2]).normalize();
    if (this.garg) {
      this.gargantua!.update(new THREE.Vector3(-camH[0], -camH[1], -camH[2]), this.time, 0.55);
      this.sunDisc.mesh.visible = false;
      this.flux = SolarSystem.flux(sunDist, 6e12);
    } else {
      this.sunDisc.update(sunI);
      this.sunDisc.mesh.scale.setScalar(THREE.MathUtils.clamp((50000 * (6.957e8 / sunDist)) / 0.038 / 6500, 0.03, 4));
      this.flux = SolarSystem.flux(sunDist);
    }
    // sun direction in local axes
    const Linv = L2I.clone().invert();
    this.sunLocal.copy(sunI).applyMatrix4(Linv).normalize();
    const shadeU = this.terrain.uniforms.uSunDir.value as THREE.Vector3;
    shadeU.copy(this.sunLocal);
    // is the focus point in terrain shadow (crater rims, hills, night)? — dims the Sun for craft/rocks/player too
    const pl = game.player;
    const focus = pl.frame === this.ground && pl.mode !== 'seat' ? pl.pos.clone() : new THREE.Vector3(...this.craft.pos);
    this.sunVisCPU = THREE.MathUtils.damp(this.sunVisCPU, this.cpuShadow(focus), 4, dt);
    const atm = ATMO_SURF[this.site.body];
    const elev = this.sunLocal.dot(new THREE.Vector3(...this.env.up([focus.x, focus.y, focus.z])));
    // atmospheric extinction toward the Sun
    const airmass = atm ? 1 / Math.max(0.05, elev + 0.15 * Math.exp(-elev * 8)) : 1;
    const ext = atm ? new THREE.Color(Math.exp(-atm.tau[0] * airmass), Math.exp(-atm.tau[1] * airmass), Math.exp(-atm.tau[2] * airmass)) : new THREE.Color(1, 1, 1);
    this.sun.color.copy(ext);
    this.sun.intensity = 3.1 * this.flux * this.sunVisCPU * (atm?.sunK ?? 1);
    if (!this.garg) this.sunDisc.mesh.visible = elev > -0.03;
    const fp = focus.clone();
    this.sun.target.position.copy(fp);
    this.sun.position.copy(fp).addScaledVector(this.sunLocal, 200);
    this.sun.target.updateMatrixWorld();
    // sky / ground bounce
    const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.2);
    const sAlb = this.map.lumAt(this.site.lat, this.site.lon);
    if (atm) {
      this.hemi.color.setRGB(atm.sky[0], atm.sky[1], atm.sky[2]);
      this.hemi.groundColor.setRGB(atm.sky[0] * 0.45, atm.sky[1] * 0.4, atm.sky[2] * 0.35);
      this.hemi.intensity = (0.08 + 0.9 * day) * this.flux * atm.skyK;
    } else {
      // airless: no sky light; sunlit ground bounces into shadows; planetshine handled by the far layer only
      this.hemi.color.setRGB(0.0, 0.0, 0.0);
      this.hemi.groundColor.setRGB(sAlb, sAlb * 0.97, sAlb * 0.93);
      this.hemi.intensity = (0.03 + 0.9 * day * Math.sqrt(Math.max(0, elev))) * this.flux * 1.1;
    }
    this.stars.setVisibility(atm ? (1 - day) * 0.9 : day > 0.5 ? 0.22 : 1);
    if (this.alienSky) this.alienSky.mat.uniforms.uK.value = atm ? 0.3 + 0.7 * (1 - day) : day > 0.5 ? 0.35 : 1;
    if (this.water) this.updateWater();
    if (this.dome && atm) {
      this.dome.position.copy(game.camera.position);
      const u = (this.dome.material as THREE.ShaderMaterial).uniforms;
      (u.uSun.value as THREE.Vector3).copy(this.sunLocal);
      u.uDay.value = day;
      u.uK.value = this.flux * atm.skyK * 0.72;
      const fog = this.scene.fog as THREE.FogExp2;
      fog.color.setRGB(atm.horizon[0], atm.horizon[1], atm.horizon[2]).multiplyScalar((0.06 + 0.94 * day) * this.flux * atm.skyK * 0.72);
    }
    // eye adaptation
    const base = THREE.MathUtils.clamp(1 / Math.pow(this.flux, 0.75), 0.4, 4);
    const night = 1 - day * this.sunVisCPU;
    this.exposure = THREE.MathUtils.damp(this.exposure, base * (1 + night * 2.2), 1.2, dt);
    this.envT -= dt;
    const envKey = this.sunLocal.x * 7 + this.sunLocal.y * 13 + this.sunLocal.z * 3 + day * 5 + this.sunVisCPU * 2;
    if (this.envT <= 0 && !this.game.skipRender && (Math.abs(envKey - this.envKey) > 0.03 || this.envT < -30)) {
      this.envT = 3;
      this.envKey = envKey;
      this.refreshEnvironment(day, atm ? atm.sky : [0, 0, 0], sAlb);
    }
  }
  private farQ = new THREE.Quaternion();
  private envKey = -1e9;

  /** CPU terrain-shadow test toward the Sun (same march as the shader, coarser). */
  private cpuShadow(p: THREE.Vector3) {
    const L = this.sunLocal;
    if (L.y < -0.02) return 0;
    const lh = Math.max(Math.hypot(L.x, L.z), 1e-4);
    const dx = L.x / lh, dz = L.z / lh, tanE = L.y / lh;
    let vis = 1, d = 3;
    for (let i = 0; i < 16; i++) {
      const x = p.x + dx * d, z = p.z + dz * d;
      const hr = p.y + 1 + d * tanE + d * 0.002;
      vis = Math.min(vis, THREE.MathUtils.clamp((hr - this.gen.field.height(x, z)) / (d * 0.012 + 0.4) + 0.5, 0, 1));
      if (vis <= 0) break;
      d *= 1.85;
    }
    return vis * THREE.MathUtils.smoothstep(L.y, -0.02, 0.02);
  }

  private envScene: THREE.Scene | null = null;
  private envMat: THREE.ShaderMaterial | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private refreshEnvironment(day: number, sky: number[], alb: number) {
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uSun: { value: new THREE.Vector3() }, uSky: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() } },
        vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vD; uniform vec3 uSun, uSky, uGround;
          void main(){
            float g = smoothstep(0.02, -0.06, vD.y);
            vec3 c = mix(uSky * (0.6 + 0.4 * max(vD.y, 0.0)), uGround, g) + vec3(30.0) * pow(max(dot(vD, uSun), 0.0), 1500.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.envMat));
    }
    const u = this.envMat!.uniforms;
    (u.uSun.value as THREE.Vector3).copy(this.sunLocal);
    (u.uSky.value as THREE.Vector3).set(sky[0] * day, sky[1] * day, sky[2] * day);
    (u.uGround.value as THREE.Vector3).setScalar(alb * 0.35 * day * this.sunVisCPU + 0.003);
    this.envRT?.dispose();
    this.envRT = this.game.renderer.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.5;
  }

  layers(camera: THREE.Camera): RenderLayer[] {
    const c = camera as THREE.PerspectiveCamera;
    this.farCam.fov = c.fov;
    this.farCam.aspect = c.aspect;
    this.farCam.near = 0.5;
    this.farCam.far = 3e5;
    this.farCam.updateProjectionMatrix();
    this.farCam.position.set(0, 0, 0);
    c.updateMatrixWorld();
    const q = new THREE.Quaternion();
    c.getWorldQuaternion(q);
    this.farCam.quaternion.copy(this.farQ).multiply(q);
    this.farCam.updateMatrixWorld(true);
    return [
      { scene: this.far, camera: this.farCam },
      { scene: this.scene, camera, clearDepth: true },
    ];
  }

  writeState() {
    const st = this.game.state.vehicles.ranger1;
    if (this.craft) this.craft.writeState();
    st.location = 'surface';
  }

  dispose() {
    this.control?.dispose();
    this.envRT?.dispose();
    this.rocks?.dispose(this.ground?.physics ?? null);
    this.far.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.userData.owned) m.geometry.dispose();
    });
    super.dispose();
  }
}

/** Near-surface atmosphere for flight and lighting (thin Mars, thick Titan). */
type C3 = [number, number, number];
/** top of the atmosphere (m), as the orbital zone models it (space/earthFrame ATMOS) */
const ATMOS_TOP: Record<string, number> = { mars: 150e3, titan: 600e3, miller: 110e3, mann: 80e3, edmunds: 100e3 };
const ATMO_SURF: Record<string, { rho0: number; H: number; tau: C3; sky: C3; skyK: number; sunK: number; zenith: C3; horizon: C3; glow: C3; alpha: number; fog: number }> = {
  // dusty butterscotch sky, blue aureole around the Sun (forward scattering by fine dust)
  mars: { rho0: 0.02, H: 11100, tau: [0.22, 0.33, 0.48], sky: [0.62, 0.44, 0.3], skyK: 0.75, sunK: 0.9, zenith: [0.46, 0.3, 0.2], horizon: [0.8, 0.58, 0.4], glow: [0.5, 0.58, 0.7], alpha: 0.93, fog: 1 / 38000 },
  // thick orange photochemical haze
  titan: { rho0: 5.4, H: 40000, tau: [0.9, 1.4, 2.4], sky: [0.55, 0.36, 0.14], skyK: 1.4, sunK: 0.45, zenith: [0.45, 0.28, 0.1], horizon: [0.7, 0.46, 0.2], glow: [0.9, 0.65, 0.3], alpha: 0.985, fog: 1 / 9000 },
  // Gargantua's worlds: thinner-looking skies so the black hole and its disk show through by day
  miller: { rho0: 1.4, H: 8500, tau: [0.1, 0.14, 0.2], sky: [0.42, 0.48, 0.52], skyK: 0.55, sunK: 0.8, zenith: [0.16, 0.2, 0.24], horizon: [0.5, 0.55, 0.58], glow: [0.12, 0.1, 0.08], alpha: 0.4, fog: 1 / 30000 },
  mann: { rho0: 1.0, H: 9000, tau: [0.14, 0.16, 0.2], sky: [0.62, 0.66, 0.7], skyK: 0.8, sunK: 0.9, zenith: [0.42, 0.47, 0.52], horizon: [0.74, 0.76, 0.79], glow: [0.25, 0.24, 0.22], alpha: 0.7, fog: 1 / 14000 },
  edmunds: { rho0: 1.1, H: 8500, tau: [0.12, 0.2, 0.34], sky: [0.42, 0.55, 0.78], skyK: 0.8, sunK: 0.95, zenith: [0.2, 0.34, 0.66], horizon: [0.62, 0.7, 0.8], glow: [0.3, 0.27, 0.22], alpha: 0.72, fog: 1 / 30000 },
};


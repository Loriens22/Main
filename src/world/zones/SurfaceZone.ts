import * as THREE from 'three';
import { fmtLatLon } from '../../util/format';
import { QENV } from '../../render/quality';
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
import { PoweredDescent, LandHere, AscentToOrbit, CloudCruise, brakingDistance, type SurfaceAPHost } from '../../space/Landing';
import { Terrain } from '../terrain/Terrain';
import { Heightmap } from '../terrain/Heightmap';
import { BodyMap, SurfaceGen } from '../surface/SurfaceGen';
import { surfaceShading, sunShadowPatch } from '../surface/surfaceShading';
import { Rocks } from '../surface/Rocks';
import { RangerVehicle } from '../RangerVehicle';
import { MillerWaves, WAVE_GLSL, WAVE_C, type TidalWave } from '../surface/MillerWaves';
import { LazarusSite } from '../surface/LazarusSites';
import { FaunaManager, type FaunaHost } from '../fauna/Fauna';
import { populateMars } from '../fauna/mars';
import { populateJupiter } from '../fauna/jupiter';
import { JovianSky } from '../surface/JovianSky';
import { lookQuat } from '../../space/Proximity';
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
const _camW = new THREE.Vector3();
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
    this.gen = new SurfaceGen({ site: this.site, map: this.map, farHalf, pads: LazarusSite.pads(this.site, this.def) });
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
      if (this.quietTouchdown) {
        this.quietTouchdown = false;
        return;
      }
      game.notify(`Ranger 1 down on ${BODIES[this.site.body].name} — ${this.targetName}. F to stand up.`, 'ok', 6);
      this.say('ward', `${BODIES[this.site.body].name}. ${this.targetName}. We're down.`);
    };
    progress(0.85, 'boulders');
    const rc = this.map.lumAt(sd.lat, sd.lon);
    const style = this.def.style;
    const rockColor = style === 'mars' ? new THREE.Color(0.32, 0.2, 0.14) : style === 'desert' ? new THREE.Color(0.42, 0.36, 0.3) : style === 'icy' || style === 'europa' || style === 'glacier' ? new THREE.Color(0.7, 0.7, 0.72) : style === 'titan' ? new THREE.Color(0.5, 0.42, 0.3) : new THREE.Color().setScalar(THREE.MathUtils.clamp(rc * 0.5, 0.08, 0.32));
    this.rocks = new Rocks(this.gen, rockColor);
    this.scene.add(this.rocks.group);
    this.buildDust();
    this.buildSkyDome();
    if (this.def.style === 'ocean') this.buildWater();
    if (this.gas) {
      this.jovian = new JovianSky(Math.round(sd.lat * 100 + sd.lon * 7) & 0xffff);
      this.jovian.onFlash = (at) => setTimeout(() => this.game.audio.thud(undefined, 0.35, 34), 600 + Math.random() * 1400);
      this.scene.add(this.jovian.group);
    }
    progress(0.95, 'beacon site');
    this.lazarus = await LazarusSite.create(this);
    if (this.site.body === 'mars') this.fauna = new FaunaManager(this.faunaHost(), populateMars);
    if (this.site.body === 'jupiter') this.fauna = new FaunaManager(this.faunaHost(), populateJupiter);
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
        // a gas giant: the deep cloud deck is not a surface — nothing to touch
        if (this.gas) return { h: -1e9, n: [0, 1, 0] };
        const hgt = this.terrainY(p[0], p[2]) + this.rocks.bumpAt(p[0], p[2]);
        const n = this.terrainNormal(p[0], p[2]);
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
    const where = fmtLatLon(ll.lat, ll.lon);
    if (this.craft.landed || agl < 3) return { name: b.name.toUpperCase(), sub: `${this.targetName} · ${where} · ${g < 0.05 ? g.toFixed(4) : g.toFixed(2)} g · ${this.def.temp}` };
    return { name: `${b.name.toUpperCase()} — DESCENT`, sub: `${(agl / 1000).toFixed(1)} km above ${this.targetName}` };
  }

  private ground_(x: number, z: number) {
    return this.terrainY(x, z);
  }

  groundHeight(x: number, z: number) {
    return this.terrainY(x, z);
  }

  /**
   * Terrain height (local y) at (x, z): the streamed height maps around the site, the analytic surface beyond the far
   * map (whose samples clamp at its edge — a craft hundreds of kilometres down-range would otherwise "touch" a
   * phantom ground far above the real one).
   */
  terrainY(x: number, z: number) {
    if (this.gen.far.edgeDistance(x, z) > 0) return this.gen.field.height(x, z);
    return this.gen.height(x, z, 4000);
  }

  private terrainNormal(x: number, z: number) {
    if (this.gen.far.edgeDistance(x, z) > 2000) return this.gen.field.normal(x, z, 2.5);
    const e = 400;
    return new THREE.Vector3(this.terrainY(x - e, z) - this.terrainY(x + e, z), 2 * e, this.terrainY(x, z - e) - this.terrainY(x, z + e)).normalize();
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
    // on Miller's surface (and in the descent below the hand-over) one hour is about seven Earth years
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
    } else if (at === 'cruise' || (this.gas && at !== 'descent')) {
      // the dive is over: level flight eastward at the 1-bar level
      const east = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), east, up));
      st.pos = [0, 1500, 0];
      st.vel = [150, 0, 0];
      st.quat = [q.x, q.y, q.z, q.w];
      st.angVel = [0, 0, 0];
      st.landed = false;
      st.gearDown = false;
      at = 'cruise';
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
    if (this.gas) {
      // scooped hydrogen feeds the engines' augmented mode: unlimited propellant, double thrust (2.5 g here)
      this.craft.unlimited = true;
      this.craft.efficiency = 2 * Math.max(0.5, st.damage.engines ?? 1);
      if (at === 'cruise') this.control.setAutopilot(new CloudCruise(1500, 150));
    }
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

  /** sine of the sun's elevation at the site (negative at night) */
  sunHeight() {
    return this.sunLocal.y;
  }

  /** inside the Ranger's sealed cabin (for the Lazarus sites' boarding check) */
  cabinPressurisedAt(l: THREE.Vector3) {
    return this.cabinPressurised(l);
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
        ...(this.tideHud ? [['WAVE', this.tideHud]] : []),
        ...(this.ranger.flooded > 0 ? [['ENGINES', `flooded · ${Math.ceil(this.ranger.flooded)} s`]] : []),
      ] as [string, string][],
    };
  }

  /** Engage the ascent-to-orbit program (menu / tests). */
  /** Ascent targets: airless — a low orbit just above the handover; atmosphere — climb out steeply (≈4 scale
   * heights) before building speed, apoapsis above the atmosphere so the orbit does not decay. */
  ascentPlan() {
    const atm = ATMO_SURF[this.site.body];
    const top = ATMOS_TOP[this.site.body] ?? 0;
    // apoapsis clear of the air: above the modelled top (no drag there), or where the density falls below
    // 1e-7 kg/m³ (+20 km) if that comes first (Titan's haze top is far above the air that matters)
    const hAir = atm ? atm.H * Math.log(atm.rho0 / 1e-7) + 20e3 : 0;
    const apT = atm ? Math.max(this.hHand + 15e3, Math.min(top + 15e3, hAir)) : this.hHand + Math.min(15e3, 0.5 * this.hHand);
    // climb well past the hand-over so the orbital zone takes over a craft still rising briskly
    const climb = atm ? Math.min(Math.max(4 * atm.H, this.hHand + 20e3), apT * 0.7) : Math.max(this.hHand * 0.35, 3e3);
    return { apT, climb, maxVr: atm ? 320 : 160 };
  }

  /**
   * Rough Δv to orbit (m/s): circular speed at the target apoapsis, less the ground's rotation, plus a gravity loss
   * (a quarter of g over the burn time) and, with air, a drag allowance.
   */
  ascentDv() {
    const B = BODIES[this.site.body];
    const apT = this.ascentPlan().apT;
    const vc = Math.sqrt(B.mu / (B.radius + apT));
    const g = B.mu / (B.radius * B.radius);
    const vrot = this.omegaL.length() * B.radius * Math.cos(THREE.MathUtils.degToRad(this.site.lat));
    const atm = ATMO_SURF[this.site.body];
    return Math.max(0, vc - vrot) + 0.25 * g * (vc / Math.max(1, this.craft.maxAccel())) + (atm ? 350 * Math.sqrt(atm.rho0) : 0);
  }

  ascend() {
    if (this.gas) {
      this.control.setAutopilot(new CloudCruise(GAS_EXIT + 4000, 160));
      this.say('computer', 'Climbing out. Above thirty kilometres I will take her the rest of the way to orbit.');
      return;
    }
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
      if (this.gas) {
        const alt = this.env.altitude(c.pos);
        b.append(h('div', { class: 'mono', style: { marginBottom: '10px' } }, `Jupiter · ${(alt / 1000).toFixed(1)} km above 1 bar · hull ${Math.round((game.state.vehicles.ranger1.damage.hull ?? 1) * 100)} %`));
        add('CLOUD CRUISE', 'Hold this altitude at 150 m/s on the hover thrusters; steer with yaw (A/D).', true, () => ctrl.setAutopilot(new CloudCruise(Math.max(-3000, alt), 150)));
        add('CLIMB TO ORBIT', 'Climb out of the cloud layer; above 30 km the flight computer flies the long climb back to orbit.', true, () => this.ascend());
        add('DISENGAGE AUTOPILOT', 'Manual flight: I/K hover thrust up/down, W/S pitch, A/D yaw, Q/E roll, Shift/Ctrl main engine.', !!ctrl.autopilot, () => ctrl.setAutopilot(null));
        return;
      }
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
      const need = this.ascentDv();
      const short = !game.state.creative.unlimitedResources && c.deltaV() < need;
      add('ASCENT TO ORBIT', `VTOL lift-off, pitch-over and main-engine ascent to a ${(apT / 1000).toFixed(0)} km apoapsis; orbit insertion continues in orbit. Needs about ${(need / 1000).toFixed(1)} km/s${short ? ` — only ${(c.deltaV() / 1000).toFixed(1)} km/s aboard: the Ranger cannot make orbit from here without more propellant` : ''}.`, true, () => this.ascend());
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
    // autopilot time compression (coasts, long brakes): the craft's physics and the mission clock run faster
    const ts = this.control.autopilot && game.control === this.control ? Math.max(1, this.control.timeScale) : 1;
    if (ts > 1 && dt > 0) game.clock.advance(dt * (ts - 1), { location: game.state.location, system: game.state.system, ...this.clockContext() });
    this.ranger.update(dt * ts);
    this.updateDust(dt);
    // ---- ascent handover back to orbit
    const alt = this.env.altitude(c.pos);
    if (this.gas) this.gasStep(dt, alt);
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
    this.updateTide(dt);
    this.lazarus?.update(dt);
    this.fauna?.update(dt);
  }

  /** Jupiter: climbing out hands the Ranger back to orbit; too deep, the pressure crushes the hull. */
  private crushWarned = 0;
  private gasStep(dt: number, alt: number) {
    const game = this.game;
    const c = this.craft;
    const st = game.state.vehicles.ranger1;
    const up = new THREE.Vector3(...this.env.up(c.pos));
    const vr = new THREE.Vector3(...c.vel).dot(up);
    this.jovian?.update(dt, game.camera.position, THREE.MathUtils.clamp(this.flux * 1.0, 0.05, 1));
    if (this.handing) return;
    // augmented hydrogen propulsion, less what the creatures do to it (spore-choked intakes, a discharge surge)
    c.efficiency = 2 * Math.max(0.5, st.damage.engines ?? 1) * (this.fauna?.active() ? this.fauna.thrustK : 1);
    if (!game.state.creative.damageProtection && (st.damage.hull ?? 1) <= 0 && alt >= GAS_CRUSH) {
      this.handing = true;
      const msg = "Ranger 1's hull failed in Jupiter's clouds — the wreck fell into the deep.";
      game.notify(msg, 'alert', 9);
      game.log('mission', 'computer', msg);
      void game.goTo('space', { at: 'docked' }, { fade: 1.5 });
      return;
    }
    if (alt > GAS_EXIT && vr > 0) {
      this.handing = true;
      this.control.setAutopilot(null);
      st.location = 'space';
      st.landed = false;
      game.notify('Clear of the cloud tops — the flight computer is taking Ranger 1 back to orbit.', 'ok', 6);
      void game.goTo('space', { at: 'orbit' }, { fade: 1.2 });
      return;
    }
    if (alt < GAS_CRUSH) {
      const depth = (GAS_CRUSH - alt) / 1000;
      const prot = game.state.creative.damageProtection;
      const hull = st.damage.hull ?? 1;
      st.damage.hull = Math.max(prot ? 0.2 : 0, hull - dt * 0.012 * (1 + depth) * (prot ? 0.3 : 1));
      game.renderer.fx.shake = Math.max(game.renderer.fx.shake, Math.min(0.8, 0.2 + depth * 0.15));
      if (this.time - this.crushWarned > 6) {
        this.crushWarned = this.time;
        game.audio.ui('alert');
        game.notify(`Pressure ${(1 + depth * 0.9).toFixed(1)} bar and rising — hull ${Math.round(st.damage.hull * 100)} %. Climb!`, 'alert', 5);
      }
      if (!prot && (st.damage.hull <= 0 || alt < GAS_CRUSH - 6000)) {
        this.handing = true;
        const msg = 'Ranger 1 was crushed in the deep clouds of Jupiter.';
        game.notify(msg, 'alert', 9);
        game.log('mission', 'computer', msg);
        void game.goTo('space', { at: 'docked' }, { fade: 1.5 });
      }
    }
  }

  get gas() {
    return this.def?.style === 'gas';
  }

  private handToOrbit() {
    this.handing = true;
    this.writeHandover();
    // the autopilot keeps flying through the fade-out; writeState() refreshes the hand-over with the final state
    void this.game.goTo('space', { at: 'ascent' }, { fade: 0.6 });
  }

  private writeHandover() {
    const game = this.game;
    const c = this.craft;
    const st = game.state.vehicles.ranger1;
    const t = game.state.clock.earthTime;
    const I = localToInertial(this.site, t, c.pos as V3, c.vel as V3, c.quat);
    const asc = this.control.autopilot instanceof AscentToOrbit ? this.control.autopilot : null;
    const prev = st.data.handover as Handover | undefined;
    const ho: Handover = { r: I.r, v: I.v, q: [I.q.x, I.q.y, I.q.z, I.q.w], t, program: asc ? (asc.phase !== 'orbit' ? 'orbit-insertion' : undefined) : prev?.program, apTarget: asc?.apTarget ?? prev?.apTarget };
    st.data.handover = ho;
    st.landed = false;
    st.location = 'space';
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
  waves: MillerWaves | null = null;
  lazarus: LazarusSite | null = null;
  /** Jupiter's cloud banks and lightning */
  jovian: JovianSky | null = null;
  /** alien life on this world (Settings → Alien life) */
  fauna: FaunaManager | null = null;

  private faunaHost(): FaunaHost {
    const zone = this;
    return {
      game: this.game,
      scene: this.scene,
      body: this.site.body,
      terrainY: (x, z) => this.terrainY(x, z),
      sunHeight: () => this.sunHeight(),
      get ground() {
        return zone.ground;
      },
      playerOnFoot: () => {
        const pl = this.game.player;
        return pl.frame === this.ground && pl.mode === 'walk' && !this.cabinPressurised(pl.pos);
      },
      rangerRoot: () => this.ranger.root,
      craft: () => (this.craft && !this.craft.landed ? this.craft : null),
      struggle: (on) => {
        if (this.control) this.control.struggle = on;
      },
      rangerFlying: () => !this.craft.landed,
      knockout: (msg) => {
        if (this.ranger.site || this.craft.landed) this.ranger.seat();
        this.game.notify(msg, 'alert', 8);
      },
      say: (who, text) => this.say(who, text),
    };
  }
  /** 0 outdoors … 1 inside a camp room (damped) */
  private indoorK = 0;
  /**
   * Shallow sea: a camera-centred polar grid (dense near the eye, out to ~60 km so incoming crests show through the
   * haze) bent to the planet's curvature and displaced by the tidal waves; tiled wave normals drift with time.
   */
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
    this.waves = new MillerWaves();
    const W = this.waves;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.13, 0.15), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.78, normalMap: this.waveTex, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false, side: THREE.DoubleSide });
    const R = BODIES[this.site.body].radius;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSR = { value: R };
      sh.uniforms.uWave0 = W.uniforms.uWave0;
      sh.uniforms.uWave1 = W.uniforms.uWave1;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uSR; varying vec2 vWP; varying float vWall;\n${WAVE_GLSL}`)
        .replace('#include <beginnormal_vertex>', `vec4 wq0 = modelMatrix * vec4(position, 1.0);
           vec4 tw = tide(wq0.xz);
           vec3 objectNormal = normalize(vec3(-tw.y, 1.0, -tw.z));
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`)
        .replace(
          '#include <project_vertex>',
          `vec4 wq = modelMatrix * vec4(transformed, 1.0);
           float rr = dot(wq.xz, wq.xz);
           wq.y = sqrt(max(uSR * uSR - rr, 0.0)) - uSR + tw.x;
           vWP = wq.xz;
           vWall = smoothstep(1.5, 25.0, tw.x);
           vec4 mvPosition = viewMatrix * wq;
           gl_Position = projectionMatrix * mvPosition;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec2 vWP; varying float vWall;\n${WAVE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           // white water per pixel (a per-vertex band zig-zags across the coarse far grid), broken up by streaks
           float vFoam = clamp(tide(vWP).w, 0.0, 1.0);
           vFoam *= smoothstep(0.25, 0.75, 0.65 * wNoise(vWP * 0.012) + 0.35 * wNoise(vWP * 0.047 + 7.0) + 0.15 * vFoam);
           // the wave body is a wall of deep water: darker, opaque; white water on the lip and at the toe
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.11, 0.12), vWall * 0.7);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.8, 0.82), vFoam);
           diffuseColor.a = mix(diffuseColor.a, 1.0, max(vWall, vFoam));`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, clamp(tide(vWP).w, 0.0, 1.0));')
        // the tiled ripple normals smear into bands where the planar mapping stretches up the steep face
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, vWall * 0.85));');
    };
    // polar grid: ring radii grow geometrically from 4 m to ~60 km around the camera
    const q = this.game.settings.graphics.water;
    const NA = q >= 2 ? 360 : q === 1 ? 256 : 160, NR = q >= 2 ? 200 : q === 1 ? 150 : 100;
    const rMax = 62000, r0 = 4;
    const k = Math.pow(rMax / r0, 1 / (NR - 1));
    const pos: number[] = [0, 0, 0], uv: number[] = [0.5, 0.5], idx: number[] = [];
    for (let r = 0; r < NR; r++) {
      const rad = r0 * Math.pow(k, r);
      for (let a = 0; a < NA; a++) {
        const th = (a / NA) * Math.PI * 2;
        const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
        pos.push(x, 0, z);
        uv.push(x / 30000 + 0.5, -z / 30000 + 0.5);
      }
    }
    const at = (r: number, a: number) => 1 + r * NA + (a % NA);
    for (let a = 0; a < NA; a++) idx.push(0, at(0, a + 1), at(0, a));
    for (let r = 0; r < NR - 1; r++) {
      for (let a = 0; a < NA; a++) {
        const i0 = at(r, a), i1 = at(r, a + 1), j0 = at(r + 1, a), j1 = at(r + 1, a + 1);
        idx.push(i0, i1, j0, i1, j1, j0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.water = new THREE.Mesh(g, mat);
    this.water.frustumCulled = false;
    this.water.renderOrder = 5;
    this.water.userData.owned = true;
    this.scene.add(this.water);
    this.ranger.hold = (dt) => this.rideStep(dt);
  }

  private updateWater() {
    const w = this.water!;
    const cam = this.game.camera.position;
    w.position.set(Math.round(cam.x / 200) * 200, 0, Math.round(cam.z / 200) * 200);
    if (this.waveTex) {
      this.waveTex.offset.set(this.time * 0.0021 + w.position.x / 30000 * 900, this.time * 0.0013 - w.position.z / 30000 * 900);
    }
    this.waves?.updateUniforms(this.time);
  }

  /** still-water level plus the tide at (x, z), local frame */
  waterLevel(x: number, z: number) {
    const R = BODIES[this.site.body].radius;
    return Math.sqrt(Math.max(R * R - x * x - z * z, 0)) - R + (this.waves ? this.waves.height(x, z, this.time) : 0);
  }

  private tideSaid = new Set<string>();
  private quietTouchdown = false;
  private tideHud: string | null = null;
  private ride: { t: number; dir: THREE.Vector2; startY: number; crest: number } | null = null;
  private sweptWave = -1;
  private sweepFade = 0;
  private swim: { t: number; dir: THREE.Vector2; d: number } | null = null;

  /** Warnings, the Ranger caught by a crest, the player swept off their feet, the camera under the water. */
  private updateTide(dt: number) {
    const W = this.waves;
    if (!W) return;
    const game = this.game;
    const t = this.time;
    const c = this.craft;
    const pl = game.player;
    const st = game.state.vehicles.ranger1;
    const onFoot = pl.frame === this.ground && pl.mode !== 'seat' && !this.cabinPressurised(pl.pos);
    if (W.first === null && (st.landed || onFoot)) W.schedule(t + 270);
    const fx = new THREE.Vector3(...(onFoot ? pl.pos.toArray() : c.pos));
    const nx = W.next(fx.x, fx.z, t);
    this.tideHud = null;
    if (nx) {
      const key = String(nx.wave.n);
      const from = new THREE.Vector2(-nx.wave.dir.x, -nx.wave.dir.y); // local x east, z south
      const brg = Math.round(((Math.atan2(from.x, -from.y) * 180) / Math.PI + 360) % 360);
      const Hkm = (nx.wave.H / 1000).toFixed(1);
      const tta = Math.max(0, nx.tta);
      if (tta < 600) this.tideHud = `${tta >= 60 ? `${Math.floor(tta / 60)} min ${Math.floor(tta % 60)} s` : `${tta.toFixed(0)} s`} · ${Hkm} km`;
      const once = (k: string, fn: () => void) => {
        if (!this.tideSaid.has(key + k)) {
          this.tideSaid.add(key + k);
          fn();
        }
      };
      const where = onFoot ? 'Get back aboard and close the hatch.' : st.landed ? 'Lift off and climb above two kilometres, or strap in and ride it out.' : 'Stay above two kilometres until it passes.';
      if (tta < 330 && tta > 125) once(':far', () => this.say('computer', `Swell on the horizon, bearing ${brg}. Crest about ${Hkm} kilometres high, arriving in ${Math.round(tta / 60)} minutes.`));
      if (tta <= 125 && tta > 35) once(':2', () => {
        this.say('computer', `Wave arrival in ${Math.round(tta / 60) <= 1 ? 'two minutes' : `${Math.round(tta / 60)} minutes`}. ${where}`);
        game.notify(`TIDAL WAVE — ${Math.round(tta)} s · ${Hkm} km · bearing ${brg}°`, 'warn', 6);
      });
      if (tta <= 35 && tta > 0) once(':30', () => game.notify(`WAVE IMPACT IN ${Math.round(tta)} s`, 'alert', 5));
      // a low rumble that grows as the crest closes in
      const near = THREE.MathUtils.clamp(1 - Math.abs(nx.dist) / 6000, 0, 1);
      game.renderer.fx.shake = Math.max(game.renderer.fx.shake, near * near * 0.5);
    }
    // ---- the Ranger: a crest reaching the hull lifts it (rideStep carries it over the wave)
    if (!this.ride) {
      const lvl = this.waterLevel(c.pos[0], c.pos[2]);
      const hW = W.height(c.pos[0], c.pos[2], t);
      if (hW > 2.5 && lvl > c.pos[1] - 1.0) this.startRide();
    }
    // ---- the player on foot
    if (this.swim) this.swimStep(dt);
    else if (onFoot && pl.mode !== 'ladder' && W.height(pl.pos.x, pl.pos.z, t) > 3) {
      const w = this.dominantWave(pl.pos.x, pl.pos.z);
      if (w && w.n !== this.sweptWave) this.sweepPlayer(w);
    }
    if (this.sweepFade > 0) {
      this.sweepFade -= dt;
      const f = game.renderer.fx;
      f.fadeColor.setRGB(0.02, 0.07, 0.08);
      f.fade = THREE.MathUtils.clamp(this.sweepFade / 1.5, 0, 0.9);
    }
    // ---- the camera inside the water body
    const cam = game.camera.position;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    const atm = ATMO_SURF[this.site.body];
    if (fog && atm) {
      const under = cam.y < this.waterLevel(cam.x, cam.z) - 0.1;
      fog.density = under ? 1 / 45 : atm.fog;
      if (under) fog.color.setRGB(0.01, 0.045, 0.05);
    }
  }

  private dominantWave(x: number, z: number) {
    const W = this.waves!;
    let best: TidalWave | null = null, hb = 0;
    for (const w of W.active(this.time)) {
      const h = w.H * MillerWaves.profile(MillerWaves.ahead(w, x, z, this.time));
      if (h >= hb) {
        hb = h;
        best = w;
      }
    }
    return best;
  }

  private startRide() {
    const c = this.craft;
    const game = this.game;
    const pl = game.player;
    const w = this.dominantWave(c.pos[0], c.pos[2]);
    if (!w) return;
    // on the ladder when the hull lifts: knocked off into the water (the sweep then carries them)
    if (pl.mode === 'ladder') pl.enterFrame(this.ground, new THREE.Vector3(pl.pos.x, this.gen.field.height(pl.pos.x, pl.pos.z) + 0.05, pl.pos.z), pl.yaw, 'walk');
    // anyone walking in the cabin is thrown into the pilot seat; the walkable site cannot ride a wave
    if (this.ranger.site) {
      if (pl.frame === this.ground && pl.mode !== 'seat' && this.cabinPressurised(pl.pos)) {
        this.ranger.seat();
        game.notify('The deck heaves — you are thrown into the pilot seat.', 'warn', 4);
      }
      this.ranger.removeSite();
    }
    this.control.setAutopilot(null);
    c.throttle = 0;
    c.vtol = 0;
    c.landed = false;
    this.ride = { t: 0, dir: w.dir.clone(), startY: c.pos[1], crest: 0 };
    this.say('computer', 'Wave contact.');
  }

  /** Kinematic ride over the crest: the Ranger floats up the face, over the top and down the back, drifting along. */
  private rideStep(dt: number) {
    const r = this.ride;
    if (!r) return false;
    const W = this.waves!;
    const c = this.craft;
    const t = this.time;
    r.t += dt;
    const h = W.height(c.pos[0], c.pos[2], t);
    r.crest = Math.max(r.crest, h);
    const u = 0.32 * WAVE_C * (h / (h + 150));
    const x = c.pos[0] + r.dir.x * u * dt, z = c.pos[2] + r.dir.y * u * dt;
    const R = BODIES[this.site.body].radius;
    const still = Math.sqrt(Math.max(R * R - x * x - z * z, 0)) - R;
    const y = Math.max(this.gen.field.height(x, z) + 1.5, still + h - 0.6);
    const nv = [(x - c.pos[0]) / dt, (y - c.pos[1]) / dt, (z - c.pos[2]) / dt];
    c.pos[0] = x;
    c.pos[1] = y;
    c.pos[2] = z;
    for (let k = 0; k < 3; k++) c.vel[k] = THREE.MathUtils.lerp(c.vel[k], nv[k], 0.5);
    c.angVel.set(0, 0, 0);
    c.landed = false;
    // pitch and roll with the water surface, heading kept (tilt limited: it tumbles in the white water otherwise)
    const g = W.gradient(x, z, t);
    const n = new THREE.Vector3(-g.x, 1, -g.y).normalize();
    const lim = 0.75;
    if (n.angleTo(new THREE.Vector3(0, 1, 0)) > lim) n.set(n.x, 0, n.z).normalize().multiplyScalar(Math.sin(lim)).add(new THREE.Vector3(0, Math.cos(lim), 0));
    const f = c.forward().addScaledVector(n, -c.forward().dot(n));
    if (f.lengthSq() > 1e-4) c.quat.slerp(lookQuat(f.normalize(), n), Math.min(1, dt * 2.5));
    this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, THREE.MathUtils.clamp(0.25 + g.length() * 0.6, 0.25, 1.1));
    if (h < 1.2 && r.t > 6) {
      this.ride = null;
      this.afterWave(r.crest);
      return false;
    }
    return true;
  }

  private afterWave(crest: number) {
    const game = this.game;
    const st = game.state.vehicles.ranger1;
    const prot = game.state.creative.damageProtection;
    const drain = prot ? 12 : 55;
    this.quietTouchdown = true;
    this.ranger.flooded = drain;
    const days = (drain * MILLER_FACTOR) / 86400;
    if (!prot) {
      st.damage.engines = Math.max(0.4, (st.damage.engines ?? 1) - 0.15);
      st.damage.hull = Math.max(0.3, (st.damage.hull ?? 1) - 0.1);
    }
    game.notify(`Ranger 1 rode a ${(crest / 1000).toFixed(1)} km crest. Engines flooded — draining for ${drain} s${prot ? ' (Creative: no damage)' : ''}.`, prot ? 'warn' : 'alert', 7);
    this.say('computer', `Engines flooded. Purge cycle ${drain} seconds — about ${days >= 365 ? `${(days / 365).toFixed(1)} years` : `${Math.round(days)} days`} back home.`);
  }

  /** The player on foot is knocked down and carried up and over the crest by the water. */
  private sweepPlayer(w: TidalWave) {
    const game = this.game;
    this.sweptWave = w.n;
    this.sweepFade = 2.5;
    const prot = game.state.creative.hazardProtection;
    const ps = game.state.player;
    if (!prot) ps.health = Math.max(0, (ps.health ?? 1) - 0.45);
    if (!prot && ps.health <= 0) {
      ps.health = 0.4;
      if (this.ranger.site || this.craft.landed) {
        this.ranger.seat();
        game.notify('The wave knocked you out. The suit tether winched you back to Ranger 1 — suit integrity 40 %.', 'alert', 8);
        return;
      }
    }
    this.swim = { t: 0, dir: w.dir.clone(), d: 0 };
    game.notify(prot ? 'Swept off your feet by the wave (Creative: no injury).' : `Swept off your feet by the wave. Suit integrity ${Math.round(ps.health * 100)} %.`, prot ? 'warn' : 'alert', 6);
  }

  /** Carried in the water like the Ranger: up the face, over the crest, set down behind it. */
  private swimStep(dt: number) {
    const sw = this.swim!;
    const pl = this.game.player;
    const W = this.waves!;
    sw.t += dt;
    const h = W.height(pl.pos.x, pl.pos.z, this.time);
    const u = 0.32 * WAVE_C * (h / (h + 150));
    const p = pl.pos.clone();
    p.x += sw.dir.x * u * dt;
    p.z += sw.dir.y * u * dt;
    sw.d += u * dt;
    const R = BODIES[this.site.body].radius;
    const still = Math.sqrt(Math.max(R * R - p.x * p.x - p.z * p.z, 0)) - R;
    const ground = this.gen.field.height(p.x, p.z);
    p.y = Math.max(ground + 0.05, still + h - 1.45);
    pl.carry(p);
    const fx = this.game.renderer.fx;
    fx.shake = Math.max(fx.shake, 0.5);
    fx.fadeColor.setRGB(0.02, 0.07, 0.08);
    fx.fade = Math.max(fx.fade, 0.25);
    if (h < 1.2 && sw.t > 6) {
      this.swim = null;
      pl.carry(new THREE.Vector3(p.x, ground + 0.05, p.z));
      this.game.notify(`The wave set you down ${Math.round(sw.d)} m from where it took you.`, 'info', 5);
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
    // indoors (a camp hab): the sky light and the outdoor eye adaptation give way to the room's lamps
    const indoor = this.lazarus?.indoorAt(game.camera.getWorldPosition(_camW)) ? 1 : 0;
    this.indoorK = THREE.MathUtils.damp(this.indoorK, indoor, 3, dt);
    this.hemi.intensity *= 1 - 0.75 * this.indoorK;
    this.scene.environmentIntensity = 0.5 * (1 - 0.8 * this.indoorK);
    // eye adaptation
    const base = THREE.MathUtils.clamp(1 / Math.pow(this.flux, 0.75), 0.4, 4);
    const night = 1 - day * this.sunVisCPU;
    this.exposure = THREE.MathUtils.damp(this.exposure, base * (1 + night * 2.2) * (1 - 0.3 * this.indoorK * (1 - night)), 1.2, dt);
    this.envT -= dt;
    const envKey = this.sunLocal.x * 7 + this.sunLocal.y * 13 + this.sunLocal.z * 3 + day * 5 + this.sunVisCPU * 2;
    if (this.envT <= 0 && !this.game.skipRender && (Math.abs(envKey - this.envKey) > 0.03 || this.envT < -30)) {
      this.envT = 3 * QENV.k;
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
    if (this.handing && st.data.handover && this.craft) {
      this.writeHandover();
      return;
    }
    st.location = 'surface';
  }

  dispose() {
    this.lazarus?.dispose();
    this.fauna?.dispose();
    this.fauna = null;
    this.jovian?.dispose();
    this.jovian = null;
    this.lazarus = null;
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
const ATMOS_TOP: Record<string, number> = { mars: 150e3, titan: 600e3, miller: 110e3, mann: 80e3, edmunds: 100e3, jupiter: 300e3 };
/** Jupiter: above this the computer flies the climb to orbit; below the crush level the pressure damages the hull */
const GAS_EXIT = 30e3;
const GAS_CRUSH = -4500;

const ATMO_SURF: Record<string, { rho0: number; H: number; tau: C3; sky: C3; skyK: number; sunK: number; zenith: C3; horizon: C3; glow: C3; alpha: number; fog: number }> = {
  // dusty butterscotch sky, blue aureole around the Sun (forward scattering by fine dust)
  mars: { rho0: 0.02, H: 11100, tau: [0.22, 0.33, 0.48], sky: [0.62, 0.44, 0.3], skyK: 0.75, sunK: 0.9, zenith: [0.46, 0.3, 0.2], horizon: [0.8, 0.58, 0.4], glow: [0.5, 0.58, 0.7], alpha: 0.93, fog: 1 / 38000 },
  // thick orange photochemical haze
  titan: { rho0: 5.4, H: 21000, tau: [0.9, 1.4, 2.4], sky: [0.55, 0.36, 0.14], skyK: 1.4, sunK: 0.45, zenith: [0.45, 0.28, 0.1], horizon: [0.7, 0.46, 0.2], glow: [0.9, 0.65, 0.3], alpha: 0.985, fog: 1 / 9000 },
  // Gargantua's worlds: thinner-looking skies so the black hole and its disk show through by day
  miller: { rho0: 1.4, H: 8500, tau: [0.1, 0.14, 0.2], sky: [0.42, 0.48, 0.52], skyK: 0.55, sunK: 0.8, zenith: [0.16, 0.2, 0.24], horizon: [0.5, 0.55, 0.58], glow: [0.12, 0.1, 0.08], alpha: 0.4, fog: 1 / 30000 },
  jupiter: { rho0: 0.17, H: 27000, tau: [0.06, 0.09, 0.16], sky: [0.66, 0.6, 0.5], skyK: 0.9, sunK: 0.8, zenith: [0.42, 0.47, 0.56], horizon: [0.86, 0.74, 0.56], glow: [0.36, 0.28, 0.18], alpha: 1, fog: 1 / 8000 },
  mann: { rho0: 1.0, H: 9000, tau: [0.14, 0.16, 0.2], sky: [0.62, 0.66, 0.7], skyK: 0.8, sunK: 0.9, zenith: [0.42, 0.47, 0.52], horizon: [0.74, 0.76, 0.79], glow: [0.25, 0.24, 0.22], alpha: 0.7, fog: 1 / 14000 },
  edmunds: { rho0: 1.1, H: 8500, tau: [0.12, 0.2, 0.34], sky: [0.42, 0.55, 0.78], skyK: 0.8, sunK: 0.95, zenith: [0.2, 0.34, 0.66], horizon: [0.62, 0.7, 0.8], glow: [0.3, 0.27, 0.22], alpha: 0.72, fog: 1 / 30000 },
};


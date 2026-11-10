import * as THREE from 'three';
import { Zone, type SpawnSpec } from '../Zone';
import { Frame } from '../Frame';
import type { Game } from '../../core/Game';
import type { RenderLayer } from '../../render/Renderer';
import type { ModelInstance } from '../../render/Assets';
import { Starfield, SunDisc } from '../../render/Globe';
import { SolarSystem, helio } from '../../render/SolarSystem';
import { BODIES } from '../../data/bodies';
import { SURFACES, handoverAltitude, type SurfaceDef } from '../../data/landing';
import { SPECS } from '../../data/vehicles';
import { Spacecraft, type FlightEnv } from '../../vehicles/Spacecraft';
import { FlightControl } from '../../vehicles/FlightControl';
import { CraftModel } from '../../vehicles/CraftModel';
import { gmst, orbitSummary } from '../../space/earthFrame';
import type { V3 } from '../../space/kepler';
import { makeSite, inertialToLocal, localToInertial, localToInertialRot, localOmega, localToBF, localLatLon, bodyRot, type SurfaceSite } from '../../space/surfaceFrame';
import { PoweredDescent, LandHere, AscentToOrbit, brakingDistance, type SurfaceAPHost } from '../../space/Landing';
import { Terrain } from '../terrain/Terrain';
import { Heightmap } from '../terrain/Heightmap';
import { BodyMap, SurfaceGen } from '../surface/SurfaceGen';
import { surfaceShading, sunShadowPatch } from '../surface/surfaceShading';
import { Rocks } from '../surface/Rocks';
import { Site } from '../Site';
import { h } from '../../ui/UI';
import type { Interactable } from '../../interact/Interaction';
import type { LadderRef } from '../../player/Player';

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
  r1Inst!: ModelInstance;
  readonly r1Root = new THREE.Group();
  r1Model!: CraftModel;
  craft!: Spacecraft;
  control!: FlightControl;
  readonly r1Com = new THREE.Vector3();
  rangerSite: Site | null = null;
  private landedT = 0;
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
    this.ground.surfaceFn = () => (this.def.style === 'icy' || this.def.style === 'europa' ? 'ice' : 'dirt');
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
    this.system = new SolarSystem(game.materials);
    this.far.add(this.system.group);
    this.stars = new Starfield();
    this.far.add(this.stars.group);
    this.sunDisc = new SunDisc();
    this.far.add(this.sunDisc.mesh);
    // Ranger 1
    progress(0.75, 'Ranger 1');
    this.r1Inst = await game.assets.instance('ranger');
    this.r1Root.add(this.r1Inst.root);
    this.scene.add(this.r1Root);
    this.r1Root.name = 'ranger1';
    this.r1Model = new CraftModel(this.r1Inst, 'ranger');
    this.r1Inst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (!/glass/i.test(m.name)) return;
      const swap = (mat: THREE.Material) => {
        if (!mat.name.startsWith('glass_dark')) return mat;
        const c = (mat as THREE.MeshPhysicalMaterial).clone();
        c.opacity = 0.18;
        c.color.setRGB(0.05, 0.06, 0.07);
        c.depthWrite = false;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    progress(0.85, 'boulders');
    const rc = this.map.lumAt(sd.lat, sd.lon);
    const style = this.def.style;
    const rockColor = style === 'mars' ? new THREE.Color(0.32, 0.2, 0.14) : style === 'icy' || style === 'europa' ? new THREE.Color(0.7, 0.7, 0.72) : style === 'titan' ? new THREE.Color(0.5, 0.42, 0.3) : new THREE.Color().setScalar(THREE.MathUtils.clamp(rc * 0.62, 0.1, 0.4));
    this.rocks = new Rocks(this.gen, rockColor);
    this.scene.add(this.rocks.group);
    this.buildDust();
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
        return { h: hgt, n: [n.x, n.y, n.z] };
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
    if (this.craft.landed || agl < 3) return { name: b.name.toUpperCase(), sub: `${this.targetName} · ${where} · ${g.toFixed(2)} g · ${this.def.temp}` };
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
      const p = this.landedPose(0, 0, 0);
      st.pos = p.pos;
      st.vel = [0, 0, 0];
      st.quat = [p.q.x, p.q.y, p.q.z, p.q.w];
      st.angVel = [0, 0, 0];
      st.landed = true;
      st.gearDown = true;
    }
    this.craft = new Spacecraft(SPECS.ranger, st);
    this.craft.unlimited = game.state.creative.unlimitedResources;
    this.craft.sas = 'stability';
    this.craft.onImpact = (s) => this.impact(s);
    if (st.landed) {
      this.craft.landed = true;
      this.craft.contact = true;
      this.craft.gearDown = true;
    }
    this.syncRanger();
    this.r1Model.gearT = this.craft.gearDown ? 1 : 0;
    this.seatPlayer();
    if (program === 'descent') this.control.setAutopilot(new PoweredDescent(this, this.targetName));
    if (at === 'eva') this.beginEva(true);
  }

  /** Craft pose resting on its gear at (x, z) with heading `yaw` (rad from north). */
  private landedPose(x: number, z: number, yaw: number) {
    const n = this.gen.field.normal(x, z, 4);
    const y = this.gen.field.height(x, z) + SPECS.ranger.gearHeight + 0.02;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    return { pos: [x, y, z] as V3, q };
  }

  private seatPlayer() {
    const game = this.game;
    const seat = this.r1Inst.nodes.get('seat_pilot');
    const eye = this.r1Inst.nodes.get('seat_pilot_eye');
    const p = game.player;
    p.enterFrame(this.ground, new THREE.Vector3(0, 0, 0), 0, 'walk');
    if (seat && eye) p.sit({ id: 'ranger1_pilot', anchor: seat, eye, frame: this.ground, exit: () => this.modelToLocal(new THREE.Vector3(0, 0.45, 1.1)), yawLimit: 1.6 });
    p.mode = 'seat';
    if (this.control) this.control.dispose();
    this.control = new FlightControl(game, 'ranger1', this.craft, this.r1Root, eye ?? null, this.env, 'RANGER 1');
    this.control.camModes = ['cockpit', 'chase', 'orbital'];
    this.control.infoFn = () => this.hudInfo();
    this.control.exitFn = () => this.leaveSeat();
    game.setControl(this.control);
  }

  /** model-space point of the Ranger (three axes, relative to the GLB root) → frame local */
  private modelToLocal(v: THREE.Vector3) {
    this.r1Inst.root.updateWorldMatrix(true, false);
    return v.clone().applyMatrix4(this.r1Inst.root.matrixWorld);
  }

  private leaveSeat(): boolean {
    if (!this.craft.landed) {
      this.game.notify('Land first — you cannot leave the pilot seat in flight.', 'warn', 2.5);
      return false;
    }
    this.makeRangerSite();
    // stand in the cabin aisle; FlightControl is released by the game
    setTimeout(() => {
      const pl = this.game.player;
      if (pl.mode === 'seat') pl.stand();
      this.game.notify('Cabin door, then the rear hatch (E) — the ladder takes you down to the surface.', 'info', 6);
    }, 0);
    return true;
  }

  /** Re-board: sit in the pilot seat and take the controls. */
  boardPilotSeat() {
    this.seatPlayer();
    this.game.audio.ui('click');
  }

  /** Straight to the surface beside the ladder (debug / quick EVA). */
  beginEva(quiet = false) {
    this.makeRangerSite();
    this.game.setControl(null);
    const foot = this.modelToLocal(new THREE.Vector3(0, -1.2, 10.4));
    foot.y = this.gen.field.height(foot.x, foot.z) + 0.05;
    this.game.player.stand?.();
    this.game.player.enterFrame(this.ground, foot, Math.PI, 'walk');
    this.game.input.context = 'walk';
    if (!quiet) this.game.notify('EVA — on the surface.', 'info', 3);
  }

  // ===================================================================================================== Ranger as a walkable site
  private makeRangerSite() {
    if (this.rangerSite) return;
    const inst = this.r1Inst;
    inst.root.updateWorldMatrix(true, false);
    const placement = inst.root.matrixWorld.clone();
    this.rangerSite = new Site(this.game, inst, {
      name: 'ranger1', frame: this.ground, parent: this.scene, placement, doorSound: 'hatch', colliders: 'all',
      handlers: {
        ladder: (n, site) => this.rangerLadder(n, site),
        hatch: (n, site) => {
          const d = site.registerDoor(n, 'hatch');
          d.locked = () => null;
          return null;
        },
      },
    });
    // the pilot seat: sit down and take the controls
    const seat = inst.nodes.get('seat_pilot');
    if (seat) {
      this.rangerSite.register({
        id: 'ranger1:pilot', targets: [seat], range: 2,
        label: () => 'Take the pilot seat',
        use: () => this.boardPilotSeat(),
      } as Interactable);
    }
  }

  private removeRangerSite() {
    const s = this.rangerSite;
    if (!s) return;
    for (const cols of s.colliderMap.values()) for (const c of cols) this.ground.physics.world.removeCollider(c, false);
    for (const id of ['ranger_rear_hatch', 'ranger_cabin_door']) this.ground.physics.doors.delete(id);
    // close the hatches for flight
    for (const d of s.doors.values()) {
      d.open = false;
      d.t = 0;
      d.node.quaternion.copy(d.baseQ);
    }
    s.dispose();
    this.rangerSite = null;
    this.r1Inst.root.position.copy(this.r1Com).negate();
    this.r1Inst.root.quaternion.identity();
    this.r1Inst.root.scale.setScalar(1);
    this.r1Root.add(this.r1Inst.root);
  }

  private rangerLadder(n: THREE.Object3D, site: Site): Interactable | null {
    const top = this.modelToLocal(new THREE.Vector3(0, 0.42, 8.62));
    const bottom = this.modelToLocal(new THREE.Vector3(0, -1.25, 8.62));
    const exitB = this.modelToLocal(new THREE.Vector3(0, 0.5, 7.85));
    const exitA = this.modelToLocal(new THREE.Vector3(0, -1.2, 9.5));
    exitA.y = this.gen.field.height(exitA.x, exitA.z) + 0.05;
    bottom.y = Math.max(bottom.y, exitA.y + 0.2);
    const face = this.modelToLocal(new THREE.Vector3(0, 0, 0)).sub(this.modelToLocal(new THREE.Vector3(0, 0, 1))).normalize();
    const ref: LadderRef = { id: 'ranger_ladder', frame: this.ground, a: bottom, b: top, exitA, exitB, face };
    return {
      id: 'ranger1:ladder', targets: [n], range: 2.4,
      label: () => {
        const d = site.doors.get('ranger_rear_hatch');
        return d && !d.open ? 'Open the rear hatch first' : 'Climb the ladder';
      },
      use: () => {
        const d = site.doors.get('ranger_rear_hatch');
        if (d && !d.open) {
          site.toggleDoor('ranger_rear_hatch', true);
          return;
        }
        this.game.player.grabLadder(ref);
      },
    } as Interactable;
  }

  private cabinPressurised(l: THREE.Vector3) {
    if (!this.r1Inst) return false;
    const inv = new THREE.Matrix4().copy(this.r1Inst.root.matrixWorld).invert();
    const m = l.clone().applyMatrix4(inv);
    const inside = Math.abs(m.x) < 2.3 && m.y > -0.2 && m.y < 2.6 && m.z > -2 && m.z < 8.4;
    const hatch = this.rangerSite?.doors.get('ranger_rear_hatch');
    return inside && !(hatch && hatch.t > 0.05);
  }

  // ===================================================================================================== HUD / menu
  private hudInfo() {
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
  ascend() {
    const apT = this.hHand + Math.min(15e3, 0.4 * this.hHand);
    this.control.setAutopilot(new AscentToOrbit(this, apT, Math.max(this.hHand * 0.35, 3e3)));
  }

  openAutopilotMenu(ctrl: FlightControl) {
    const game = this.game;
    game.input.releaseLock();
    const c = this.craft;
    const agl = c.pos[1] - this.ground_(c.pos[0], c.pos[2]);
    const apT = this.hHand + Math.min(15e3, 0.4 * this.hHand);
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
    const flying = game.control === this.control;
    // ---- leave the walkable-site mode when the craft is about to move
    if (this.rangerSite && flying && (c.throttle > 0.01 || c.vtol > 0.05 || this.control.autopilot)) {
      this.removeRangerSite();
      c.landed = false;
    }
    // ---- physics
    if (!this.rangerSite) {
      let rem = dt;
      let guard = 0;
      while (rem > 1e-6 && guard++ < 200) {
        const h = Math.min(rem, 0.02);
        if (this.control.autopilot) this.control.runAutopilot(h);
        c.step(h, this.env);
        rem -= h;
      }
      if (c.landed && c.throttle < 0.01 && c.vtol < 0.02) {
        this.landedT += dt;
        if (this.landedT > 0.6) {
          for (let k = 0; k < 3; k++) c.vel[k] = 0;
          c.angVel.set(0, 0, 0);
        }
      } else this.landedT = 0;
      c.writeState();
      if (this.landedT > 1.2 && !this.control.autopilot) {
        this.makeRangerSite();
        game.notify(`Ranger 1 down on ${BODIES[this.site.body].name} — ${this.targetName}. F to stand up.`, 'ok', 6);
        this.say('ward', `${BODIES[this.site.body].name}. ${this.targetName}. We're down.`);
      }
    }
    this.syncRanger();
    // ---- models & effects
    this.r1Model.update(dt, this.rangerSite ? null : c, 0);
    this.updateDust(dt);
    // ---- ascent handover back to orbit
    const alt = this.env.altitude(c.pos);
    if (!this.handing && !this.rangerSite && alt > this.hHand + 3e3) {
      const up = new THREE.Vector3(...this.env.up(c.pos));
      if (new THREE.Vector3(...c.vel).dot(up) > 0) this.handToOrbit();
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
    this.rangerSite?.update(dt);
    if (pl.frame === this.ground && pl.mode !== 'seat') ph.step(dt);
    // helmet visor outside the pressurised cabin
    const fx = game.renderer.fx;
    fx.visor = THREE.MathUtils.damp(fx.visor, pl.mode !== 'seat' && !this.cabinPressurised(pl.pos) ? 0.55 : 0, 3, dt);
    this.updateSky(dt);
  }

  private syncRanger() {
    const c = this.craft;
    if (this.rangerSite) return;
    this.r1Root.position.set(c.pos[0], c.pos[1], c.pos[2]);
    this.r1Root.quaternion.copy(c.quat);
    this.r1Inst.root.position.copy(this.r1Com).negate();
    this.r1Root.updateMatrixWorld(true);
  }

  private impact(speed: number) {
    if (speed < 3.5) return;
    const g = this.game;
    if (speed < 9) {
      g.notify(`Hard landing — ${speed.toFixed(1)} m/s. Gear stressed.`, 'warn', 4);
      const d = g.state.vehicles.ranger1.damage;
      d.gear = Math.max(0, (d.gear ?? 1) - (speed - 3.5) * 0.08);
      g.renderer.fx.shake = 0.6;
      return;
    }
    g.renderer.fx.shake = 1.2;
    if (g.state.creative.damageProtection) {
      g.notify(`Crash at ${speed.toFixed(0)} m/s — Creative mode: the Ranger survives.`, 'alert', 6);
      return;
    }
    g.notify(`Ranger 1 crashed at ${speed.toFixed(0)} m/s.`, 'alert', 8);
    const d = g.state.vehicles.ranger1.damage;
    d.hull = Math.max(0, (d.hull ?? 1) - speed * 0.03);
    d.engines = Math.max(0, (d.engines ?? 1) - speed * 0.02);
  }

  private handToOrbit() {
    this.handing = true;
    const game = this.game;
    const c = this.craft;
    const st = game.state.vehicles.ranger1;
    const t = game.state.clock.earthTime;
    const I = localToInertial(this.site, t, c.pos as V3, c.vel as V3, c.quat);
    const asc = this.control.autopilot instanceof AscentToOrbit ? this.control.autopilot : null;
    const ho: Handover = { r: I.r, v: I.v, q: [I.q.x, I.q.y, I.q.z, I.q.w], t, program: asc ? 'orbit-insertion' : undefined, apTarget: asc?.apTarget };
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
    this.sunDisc.update(sunI);
    this.sunDisc.mesh.scale.setScalar(THREE.MathUtils.clamp((50000 * (6.957e8 / sunDist)) / 0.038 / 6500, 0.03, 4));
    this.flux = SolarSystem.flux(sunDist);
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
    this.sunDisc.mesh.visible = elev > -0.03;
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
    // eye adaptation
    const base = THREE.MathUtils.clamp(1 / Math.pow(this.flux, 0.75), 1, 4);
    const night = 1 - day * this.sunVisCPU;
    this.exposure = THREE.MathUtils.damp(this.exposure, base * (1 + night * 2.2), 1.2, dt);
    this.envT -= dt;
    const envKey = this.sunLocal.x * 7 + this.sunLocal.y * 13 + this.sunLocal.z * 3 + day * 5 + this.sunVisCPU * 2;
    if (this.envT <= 0 && (Math.abs(envKey - this.envKey) > 0.03 || this.envT < -30)) {
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
const ATMO_SURF: Record<string, { rho0: number; H: number; tau: [number, number, number]; sky: [number, number, number]; skyK: number; sunK: number }> = {
  mars: { rho0: 0.02, H: 11100, tau: [0.22, 0.33, 0.48], sky: [0.62, 0.44, 0.3], skyK: 0.75, sunK: 0.9 },
  titan: { rho0: 5.4, H: 40000, tau: [0.9, 1.4, 2.4], sky: [0.55, 0.36, 0.14], skyK: 1.4, sunK: 0.45 },
};


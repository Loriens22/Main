import * as THREE from 'three';
import { fmtLatLon } from '../../util/format';
import { QENV } from '../../render/quality';
import { Zone, type SpawnSpec } from '../Zone';
import { Frame } from '../Frame';
import type { Game } from '../../core/Game';
import type { RenderLayer } from '../../render/Renderer';
import type { ModelInstance } from '../../render/Assets';
import { Starfield, SunDisc } from '../../render/Globe';
import { SolarSystem, WormholeLens, helio, eclToThree } from '../../render/SolarSystem';
import { Gargantua, AlienSky } from '../../render/Gargantua';
import { BODIES, systemCentre } from '../../data/bodies';
import { planTransfer, cruiseState, parkRadius, planetOf, fmtDuration, destinations, type TransferPlan } from '../../space/Navigation';
import { MissionClock } from '../../core/MissionClock';
import { G0 } from '../../data/vehicles';
import { Spacecraft, type FlightEnv } from '../../vehicles/Spacecraft';
import { FlightControl } from '../../vehicles/FlightControl';
import { CraftModel } from '../../vehicles/CraftModel';
import { Plume } from '../../vehicles/Plume';
import { SPECS, type SpacecraftSpec } from '../../data/vehicles';
import type { VehicleState } from '../../core/State';
import { R_EARTH, gmst, siteBasisECEF, ecefToEci, gravityAt, densityAt, orbitSummary, PRIMARY, setPrimary, safeOrbitAlt } from '../../space/earthFrame';
import { propagate, type V3 } from '../../space/kepler';
import { OrbitInsertion, Rendezvous, DockingApproach, type ProxHost, type DockGoal, type PortRelation } from '../../space/Proximity';
import { DeorbitLanding, brakingDistance } from '../../space/Landing';
import { SURFACES, isLandable, handoverAltitude } from '../../data/landing';
import { makeSite, bodyRot, bodyOmega } from '../../space/surfaceFrame';
import type { SurfaceState, Handover } from './SurfaceZone';
import { EARTH_HANDOVER, EARTH_TARGETS, earthLatLon, inertialToEarth, insideEarthMap, type EarthReentry } from '../earth/RangerReturn';
import { SITE } from '../../space/astro';
import { CHARACTERS, CREW } from '../../data/characters';
import { Humanoid } from '../../npc/Humanoid';
import { h } from '../../ui/UI';
import { Site } from '../Site';
import { LightPool } from '../../render/LightPool';
import type { Interactable } from '../../interact/Interaction';
import type { LadderRef } from '../../player/Player';

const STACK_COM = 25; // m, stack centre of mass above the base (same as the launch sequence)
const S2_SPEC: SpacecraftSpec = {
  kind: 'rocket', dryMass: 8000, propMax: 88000, mainThrust: 1.1e6, mainIsp: 450, vtolThrust: 0, vtolIsp: 1, rcsThrust: 30e3,
  rcsTorque: [2e7, 2e7, 8e6], rcsIsp: 300, inertia: [2.4e7, 2.4e7, 9e5], dragArea: 12, liftCoef: 0, length: 40, crew: 4, powerDraw: 0, gearHeight: 0, dockPorts: [], label: 'UPPER STAGE',
};
const RANGER_WET = 41000;
/** Gargantua's disk lights its planets like a much brighter sun: flux reference distance (m) */
const GARG_FLUX_REF = 6e12;
const AXIS_Z = new THREE.Vector3(0, 0, 1);

interface DockedBody {
  id: string;
  inst: ModelInstance;
  port: string;
}

/**
 * Earth orbit: the Endurance in its 420 km parking orbit, Ranger 1 arriving from the launch, rendezvous and docking.
 * Inertial frame (metres, +Y north) with a floating origin at the player's craft; the Earth, Sun and stars are drawn
 * in a kilometre-scale far layer.
 */
export default class SpaceZone extends Zone implements ProxHost {
  readonly id = 'space' as const;
  readonly far = new THREE.Scene();
  readonly farCam = new THREE.PerspectiveCamera(60, 1, 1, 3e5);
  system!: SolarSystem;
  lens!: WormholeLens;
  gargantua: Gargantua | null = null;
  alienSky: AlienSky | null = null;
  /** star system the zone was built for */
  sys: 'sol' | 'gargantua' = 'sol';
  stars!: Starfield;
  sunDisc!: SunDisc;
  sun!: THREE.DirectionalLight;
  earthLight!: THREE.HemisphereLight;
  readonly origin: V3 = [R_EARTH + 420e3, 0, 0];
  readonly env: FlightEnv = {
    gravity: (p) => gravityAt(p),
    density: (p) => densityAt(p),
    up: (p) => {
      const n = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / n, p[1] / n, p[2] / n];
    },
    altitude: (p) => Math.hypot(p[0], p[1], p[2]) - PRIMARY.R,
  };
  // Endurance
  eInst!: ModelInstance;
  eModel!: CraftModel;
  readonly eRoot = new THREE.Group();
  /** rotating Endurance body frame (spin gravity ω²r about the model +Z axis) and its walkable interior */
  eFrame!: Frame;
  site!: Site;
  lightPool!: LightPool;
  aboard = false;
  /** soft fill inside the modules (bounce light from the white linings) */
  readonly interiorFill = new THREE.HemisphereLight(0xe8eef5, 0x3a3c40, 0);
  ePos: V3 = [0, 0, 0];
  eVel: V3 = [0, 0, 0];
  readonly eQLvlh = new THREE.Quaternion();
  readonly eQ = new THREE.Quaternion();
  docked: DockedBody[] = [];
  // Ranger 1 (or the stack while the upper stage is attached)
  r1Inst!: ModelInstance;
  r1Model!: CraftModel;
  readonly r1Root = new THREE.Group();
  stackRoot: THREE.Group | null = null;
  stackInst: ModelInstance | null = null;
  s2Plume: Plume | null = null;
  craft!: Spacecraft;
  control!: FlightControl;
  r1Frame!: Frame;
  r1Docked = false;
  crew: Humanoid[] = [];
  /** Ranger 1 centre of mass in model space: on the port centreline, so a roll spins about the dock axis */
  readonly r1Com = new THREE.Vector3();
  private tSim = 0;
  private envT = 0;
  private sunVis = 1;
  flux = 1;
  private eclipseLast = -1;
  private dockRoll = 0;

  constructor(game: Game) {
    super(game);
    this.music = 'space';
    this.exposure = 1;
  }

  // ===================================================================================================== load
  async load(progress: (p: number, msg: string) => void) {
    const game = this.game;
    const mats = game.materials;
    progress(0.1, 'Earth');
    this.sys = game.state.system === 'gargantua' ? 'gargantua' : 'sol';
    const garg = this.sys === 'gargantua';
    this.system = new SolarSystem(mats, garg ? ['miller', 'mann', 'edmunds'] : undefined);
    if (garg) {
      this.system.fluxRef = GARG_FLUX_REF;
      this.alienSky = new AlienSky();
      this.far.add(this.alienSky.mesh);
      // disk plane: tilted from the planets' orbital plane so the inner worlds pass above and below it
      const sysN = new THREE.Vector3(...eclToThree([0, 0, 1]));
      const diskN = sysN.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.18).normalize();
      this.gargantua = new Gargantua(BODIES.gargantua.radius / 1000, diskN);
      this.far.add(this.gargantua.mesh);
    }
    this.far.add(this.system.group);
    this.lens = new WormholeLens();
    this.far.add(this.lens.mesh);
    this.stars = new Starfield();
    this.far.add(this.stars.group);
    this.stars.group.visible = !garg;
    this.sunDisc = new SunDisc();
    this.far.add(this.sunDisc.mesh);
    // near-field lighting: the Sun, earthshine and a trace of ambient
    this.sun = new THREE.DirectionalLight(0xfff6ec, 3.2);
    this.sun.castShadow = game.settings.graphics.shadowQuality > 0;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.scene.add(this.sun, this.sun.target);
    this.earthLight = new THREE.HemisphereLight(0x6f8fbf, 0x000000, 0.4);
    this.scene.add(this.earthLight);
    this.scene.add(new THREE.AmbientLight(0x101418, 0.25));
    this.scene.add(this.interiorFill);
    progress(0.3, 'Endurance');
    this.eInst = await game.assets.instance('endurance');
    this.eRoot.add(this.eInst.root);
    this.eRoot.name = 'endurance';
    this.scene.add(this.eRoot);
    this.eModel = new CraftModel(this.eInst, 'endurance');
    progress(0.4, 'Endurance interior');
    this.eFrame = this.addFrame(new Frame('endurance', this.eRoot, (l, o) => {
      const w = this.game.state.endurance.omega;
      return o.set(l.x * w * w, l.y * w * w, 0);
    }, 'Endurance'));
    this.eFrame.surfaceFn = () => 'metal';
    this.lightPool = new LightPool(this.eRoot, game.settings.graphics.shadowQuality >= 2 ? 8 : 6);
    const intInst = await game.assets.instance('endurance_int');
    this.site = new Site(game, intInst, {
      name: 'endurance', frame: this.eFrame, parent: this.eRoot, placement: new THREE.Matrix4(), lightPool: this.lightPool, groupsOn: ['*'],
      handlers: { ladder: (n, site) => this.ladderInteract(n, site) },
    });
    intInst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    // indicator LEDs and lit screens are small: keep them from blooming the whole room
    for (const [name, g] of this.site.groups) {
      if (!g.material) continue;
      g.material.emissiveIntensity = name === 'panel' ? 1.4 : name.startsWith('deck') || name.startsWith('ring') ? 2.6 : 3;
    }
    this.addReboard();
    this.addNavConsole();
    this.eInst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    progress(0.5, 'docked craft');
    const vs = game.state.vehicles;
    for (const id of ['ranger2', 'lander1', 'lander2']) {
      const v = vs[id];
      if (!v || v.location !== 'space' || v.docked?.ship !== 'endurance') continue;
      const inst = await game.assets.instance(v.type === 'ranger' ? 'ranger' : 'lander');
      this.stowGear(inst);
      this.eRoot.add(inst.root);
      this.docked.push({ id, inst, port: v.docked.port });
    }
    progress(0.7, 'Ranger 1');
    this.r1Inst = await game.assets.instance('ranger');
    this.stowGear(this.r1Inst);
    this.r1Root.add(this.r1Inst.root);
    const pr = new THREE.Vector3().setFromMatrixPosition(this.portLocal(this.r1Inst, 'dock_rear'));
    this.r1Com.set(pr.x, pr.y, 0);
    this.r1Inst.root.position.copy(this.r1Com).negate();
    this.r1Root.name = 'ranger1';
    this.scene.add(this.r1Root);
    this.r1Model = new CraftModel(this.r1Inst, 'ranger');
    // cockpit glazing: the exterior 'dark glass' look is too opaque from inside — the crew must see Earth and stars
    this.r1Inst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !/glass/i.test(m.name)) return;
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
    this.r1Frame = this.addFrame(new Frame('ranger1', this.r1Root, (_l, o) => o.set(0, 0, 0), 'Ranger 1'));
    progress(0.85, 'crew');
    for (const id of CREW) {
      const def = CHARACTERS[id];
      if (!def) continue;
      try {
        const hm = await Humanoid.create(game.assets, def, 'jumpsuit');
        this.crew.push(hm);
      } catch (e) {
        console.warn('[space] crew model', id, e);
      }
    }
    this.initEnduranceOrbit();
    this.tSim = game.state.clock.earthTime;
    this.placeDocked();
    progress(1, 'ready');
  }

  private stowGear(inst: ModelInstance) {
    for (const k of ['gear_FL', 'gear_FR', 'gear_RL', 'gear_RR']) {
      const g = inst.nodes.get(k);
      if (g) g.rotation.x = -Math.PI / 2;
    }
  }

  describe() {
    const s = this.craft ? orbitSummary(this.craft.pos, this.craft.vel) : null;
    const room = this.roomHere?.();
    const where = this.whereText();
    if (room) {
      const g = this.eFrame.gravity(this.game.player.pos, new THREE.Vector3()).length() / 9.81;
      return { name: 'ENDURANCE', sub: `${room} · ${g.toFixed(2)} g · ${where}` };
    }
    if (this.r1Docked) return { name: 'ENDURANCE', sub: `Docked · ${where}` };
    const free = PRIMARY.id === this.centre() ? (this.sys === 'gargantua' ? 'GARGANTUA SYSTEM' : 'INTERPLANETARY SPACE') : `${(BODIES[PRIMARY.id]?.name ?? '').toUpperCase()} ORBIT`;
    return { name: free, sub: s ? `Ranger 1 · ${(s.alt / 1000).toFixed(0)} km` : where };
  }

  /** Where the Endurance is, for status lines. */
  whereText() {
    const d = this.game.state.vehicles.endurance.data;
    if (d.cruise) {
      const pl = d.cruise as TransferPlan;
      return `Cruise to ${BODIES[pl.to]?.name ?? pl.to} · ${fmtDuration(Math.max(0, pl.tArr - this.game.state.clock.earthTime))} to go`;
    }
    if (d.hold) return (d.hold as { target: string }).target === 'wormhole_g' ? 'Station-keeping at the Anomaly, Gargantua side' : 'Station-keeping at the Anomaly, near Saturn';
    const alt = this.ePos ? Math.hypot(...this.ePos) - PRIMARY.R : 0;
    return `${BODIES[PRIMARY.id]?.name ?? PRIMARY.id} orbit ${alt > 1e7 ? (alt / 1e6).toFixed(0) + ' 000 km' : (alt / 1000).toFixed(0) + ' km'}`;
  }

  altitude() {
    return this.env.altitude(this.origin);
  }

  inVacuum() {
    return true;
  }

  // ===================================================================================================== orbits
  /** Endurance orbit: circular 420 km. Created on first entry in the plane of Ranger 1's ascent, 12° ahead. */
  private initEnduranceOrbit(ref?: { r: V3; v: V3 }) {
    const ev = this.game.state.vehicles.endurance;
    const t = this.game.state.clock.earthTime;
    if (ev.data.orbit && !ref) return;
    const rad = this.game.state.endurance.nav.parkRadius;
    let rHat: THREE.Vector3, hHat: THREE.Vector3;
    if (ref) {
      const r = new THREE.Vector3(...ref.r), v = new THREE.Vector3(...ref.v);
      hHat = new THREE.Vector3().crossVectors(r, v).normalize();
      rHat = r.normalize().applyAxisAngle(hHat, THREE.MathUtils.degToRad(12));
    } else {
      // default plane: launch-site latitude inclination, site directly under the orbit now
      const b = siteBasisECEF(SITE.lat, SITE.lon);
      const up = ecefToEci(b.up, t), east = ecefToEci(b.east, t);
      hHat = new THREE.Vector3().crossVectors(up, east).normalize();
      rHat = up.clone().applyAxisAngle(hHat, THREE.MathUtils.degToRad(12));
    }
    const vHat = new THREE.Vector3().crossVectors(hHat, rHat).normalize();
    const vc = Math.sqrt(PRIMARY.mu / rad);
    ev.data.orbit = { r0: rHat.clone().multiplyScalar(rad).toArray(), v0: vHat.multiplyScalar(vc).toArray(), t0: t, body: 'earth' };
  }

  /** Endurance state relative to the current primary: Kepler parking orbit, heliocentric cruise arc, or station-keeping. */
  targetState(t: number): { r: V3; v: V3 } {
    const d = this.game.state.vehicles.endurance.data;
    if (d.cruise) return cruiseState(d.cruise as TransferPlan, t);
    if (d.hold) {
      const h = d.hold as { target: string; offset: V3 };
      const W = helio(h.target, t), P = helio(PRIMARY.id, t);
      const w = W.r, sP = P.r;
      return { r: [w[0] - sP[0] + h.offset[0], w[1] - sP[1] + h.offset[1], w[2] - sP[2] + h.offset[2]], v: [W.v[0] - P.v[0], W.v[1] - P.v[1], W.v[2] - P.v[2]] };
    }
    const o = d.orbit as { r0: V3; v0: V3; t0: number };
    return propagate(o.r0, o.v0, PRIMARY.mu, t - o.t0);
  }

  now() {
    return this.tSim;
  }

  /** LVLH attitude: ring axis (model +Z, aft) along +velocity, so the forward port faces back along the orbit. */
  private lvlh(r: V3, v: V3, out: THREE.Quaternion) {
    const vv = new THREE.Vector3(...v);
    if (vv.lengthSq() < 1e-6) vv.set(...r).cross(new THREE.Vector3(0, 1, 0)); // station-keeping: any fixed tangential axis
    const z = vv.normalize();
    const y = new THREE.Vector3(...r).normalize();
    y.addScaledVector(z, -y.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  private updateEndurance(t: number) {
    const s = this.targetState(t);
    this.ePos = s.r;
    this.eVel = s.v;
    this.lvlh(s.r, s.v, this.eQLvlh);
    const spin = this.game.state.endurance.spinAngle;
    this.eQ.copy(this.eQLvlh).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, spin));
    const ev = this.game.state.vehicles.endurance;
    ev.pos = [...s.r];
    ev.vel = [...s.v];
  }

  // ===================================================================================================== docking geometry
  /** Port node matrix relative to its model root. */
  private portCache = new Map<string, THREE.Matrix4>();
  private portLocal(inst: ModelInstance, name: string) {
    const key = `${inst.root.uuid}:${name}`;
    let m = this.portCache.get(key);
    if (!m) {
      const n = inst.nodes.get(name)!;
      inst.root.updateMatrixWorld(true);
      m = new THREE.Matrix4().copy(inst.root.matrixWorld).invert().multiply(n.matrixWorld);
      this.portCache.set(key, m);
    }
    return m.clone();
  }

  /** Port matrix in the craft's simulation frame (Ranger 1: centre-of-mass frame; docked models: model root). */
  private craftPortLocal(inst: ModelInstance, name: string) {
    const m = this.portLocal(inst, name);
    if (inst === this.r1Inst) m.premultiply(new THREE.Matrix4().makeTranslation(-this.r1Com.x, -this.r1Com.y, -this.r1Com.z));
    return m;
  }

  /** Craft root transform (in the Endurance root space) that mates craftPort to the Endurance port with a roll phase. */
  private mateMatrix(port: string, inst: ModelInstance, craftPort: string, roll: number, d = 0) {
    const pe = this.portLocal(this.eInst, `dock_${port}`);
    const pc = this.craftPortLocal(inst, craftPort);
    return new THREE.Matrix4()
      .copy(pe)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -d))
      .multiply(new THREE.Matrix4().makeRotationZ(roll))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(pc.invert());
  }

  private placeDocked() {
    for (const d of this.docked) {
      const isRanger = d.inst.nodes.has('dock_rear');
      // landers lie along the spoke axis so their pods clear the Ranger ports
      const roll = isRanger ? 0 : Math.PI / 2;
      const m = this.mateMatrix(d.port, d.inst, isRanger ? 'dock_rear' : 'dock_top', roll);
      m.decompose(d.inst.root.position, d.inst.root.quaternion, d.inst.root.scale);
    }
  }

  dockGoal(craft: Spacecraft, d: number, spin: boolean, rollPhase: number): DockGoal {
    const q = spin ? this.eQ : this.eQLvlh;
    const m = this.mateMatrix('fwd', this.r1Inst, 'dock_rear', spin ? rollPhase : 0, d);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1)).multiply(m).decompose(pos, quat, sc);
    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(q); // forward port faces model −Z
    void craft;
    const omega = this.game.state.endurance.omega;
    // goal-point velocity: the Endurance's orbital velocity + the LVLH frame rotation (+ the spin when following it)
    const rE = new THREE.Vector3(...this.ePos), vE = new THREE.Vector3(...this.eVel);
    const wOrb = new THREE.Vector3().crossVectors(rE, vE).divideScalar(rE.lengthSq());
    const wSpin = new THREE.Vector3(0, 0, 1).applyQuaternion(this.eQLvlh).multiplyScalar(omega);
    const wTot = wOrb.clone().add(spin ? wSpin : new THREE.Vector3());
    const vRot = new THREE.Vector3().crossVectors(wTot, pos);
    return {
      pos: [this.ePos[0] + pos.x, this.ePos[1] + pos.y, this.ePos[2] + pos.z],
      vel: [this.eVel[0] + vRot.x, this.eVel[1] + vRot.y, this.eVel[2] + vRot.z],
      quat,
      w: wTot,
      axis,
    };
  }

  /** World pose (relative to the Endurance centre) of a port node of the Endurance. */
  private ePortWorld(port: string) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), this.eQ, new THREE.Vector3(1, 1, 1)).multiply(this.portLocal(this.eInst, `dock_${port}`));
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    return { p, q };
  }

  portRelation(craft: Spacecraft): PortRelation {
    const e = this.ePortWorld('fwd');
    const axE = new THREE.Vector3(0, 0, -1).applyQuaternion(e.q);
    const yE = new THREE.Vector3(0, 1, 0).applyQuaternion(e.q);
    const pcl = this.craftPortLocal(this.r1Inst, 'dock_rear');
    const mc = new THREE.Matrix4().compose(new THREE.Vector3(), craft.quat, new THREE.Vector3(1, 1, 1)).multiply(pcl);
    const pc = new THREE.Vector3(), qc = new THREE.Quaternion(), s = new THREE.Vector3();
    mc.decompose(pc, qc, s);
    // port positions relative to the Endurance centre
    const cRel = new THREE.Vector3(craft.pos[0] - this.ePos[0], craft.pos[1] - this.ePos[1], craft.pos[2] - this.ePos[2]).add(pc);
    const dv = cRel.clone().sub(e.p);
    const axial = dv.dot(axE);
    const lateral = dv.clone().addScaledVector(axE, -axial).length();
    const relVel = new THREE.Vector3(craft.vel[0] - this.eVel[0], craft.vel[1] - this.eVel[1], craft.vel[2] - this.eVel[2]);
    const dist = dv.length();
    const closing = dist > 1e-3 ? -relVel.dot(dv.clone().normalize()) : -relVel.dot(axE);
    const axC = new THREE.Vector3(0, 0, -1).applyQuaternion(qc);
    const alignErr = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-axC.dot(axE), -1, 1)));
    const yC = new THREE.Vector3(0, 1, 0).applyQuaternion(qc);
    const yCp = yC.clone().addScaledVector(axE, -yC.dot(axE)).normalize();
    let ang = Math.atan2(new THREE.Vector3().crossVectors(yE, yCp).dot(axE), yE.dot(yCp));
    const sym = (2 * Math.PI) / 3;
    ang = ((ang % sym) + sym) % sym;
    const rollErr = THREE.MathUtils.radToDeg(Math.min(ang, sym - ang));
    const wC = craft.angVel.clone().applyQuaternion(craft.quat);
    const omega = this.game.state.endurance.omega;
    const rateErr = Math.abs(wC.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(this.eQLvlh)) - omega);
    return { dist, axial, lateral, closing, relVel, alignErr, rollErr, rateErr };
  }

  aimOffset(t: number): V3 {
    // hold point 220 m behind the forward port, i.e. along −velocity
    const s = this.targetState(t);
    const v = new THREE.Vector3(...s.v).normalize().multiplyScalar(-(220 + 6));
    return [v.x, v.y, v.z];
  }

  capture(craft: Spacecraft) {
    const game = this.game;
    this.r1Docked = true;
    // latch phase: the nearest of the three petal positions to the craft's current roll
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const g = this.dockGoal(craft, 0, true, (k * 2 * Math.PI) / 3);
      const a = craft.quat.angleTo(g.quat);
      if (a < best) {
        best = a;
        this.dockRoll = (k * 2 * Math.PI) / 3;
      }
    }
    craft.rcsT.set(0, 0, 0);
    craft.throttle = 0;
    craft.sas = 'stability';
    craft.attRate = null;
    const st = game.state.vehicles.ranger1;
    st.docked = { ship: 'endurance', port: 'fwd' };
    game.state.mission.stage = 'docked';
    game.flag('dockedEndurance', true);
    game.audio.thud(undefined, 0.7, 70);
    game.audio.door('airlock');
    game.log('mission', 'WARD', 'Ranger 1 docked at the Endurance forward port. Hard capture confirmed.');
    this.say('computer', 'Contact. Capture latches engaged — hard dock confirmed. Equalising pressure.');
    setTimeout(() => this.say('sato', 'Welcome to the Endurance, Commander.'), 4500);
  }

  say(who: string, text: string) {
    this.game.say(who, text, Math.max(3, text.length * 0.06));
  }

  // ===================================================================================================== spawn
  spawn(spec: SpawnSpec) {
    const game = this.game;
    const t = game.state.clock.earthTime;
    const st = game.state.vehicles.ranger1;
    this.tSim = t;
    const ed = game.state.vehicles.endurance.data;
    const holdT = (ed.hold as { target?: string } | undefined)?.target;
    this.applyPrimary(ed.cruise ? this.centre() : ed.hold ? (holdT === 'wormhole_g' ? 'gargantua' : 'saturn') : ((ed.orbit as { body?: string } | undefined)?.body ?? 'earth'));
    let at = spec.at ?? (st.docked ? 'docked' : 'orbit');
    // 'endurance' / 'endurance:<room>' — aboard, with Ranger 1 docked at the forward port
    let aboardAt: string | null = null;
    if (at.startsWith('endurance')) {
      const room = at.split(':')[1] ?? 'hub';
      aboardAt = ({ hub: 'spawn_hub', command: 'spawn_command', galley: 'spawn_hab3', quarters: 'spawn_hab0', cryo: 'spawn_cryo' } as Record<string, string>)[room] ?? 'spawn_hub';
      at = 'docked';
    }
    let r: V3, v: V3;
    let q = new THREE.Quaternion();
    let stack = false;
    let resume: Handover['program'];
    let resumeAp = 0;
    if (at === 'ascent' && !st.data.handover) at = 'orbit';
    if (at === 'ascent') {
      const ho = st.data.handover as Handover;
      const sd = st.data.surface as SurfaceState | undefined;
      if (sd) this.applyPrimary(sd.body);
      this.updateEndurance(t);
      r = [...ho.r] as V3;
      v = [...ho.v] as V3;
      q = new THREE.Quaternion(...ho.q);
      resume = ho.program;
      resumeAp = ho.apTarget ?? 0;
      delete st.data.handover;
      st.landed = false;
    } else if (at === 'launch' && st.data.launch) {
      const L = st.data.launch as { x: number; y: number; z: number; vx: number; vy: number; vz: number; q: number[]; stage: number; s2fuel: number };
      const b = siteBasisECEF(SITE.lat, SITE.lon);
      const up = ecefToEci(b.up, t), east = ecefToEci(b.east, t), north = ecefToEci(b.north, t);
      const P = up.clone().multiplyScalar(L.y).addScaledVector(east, L.x).addScaledVector(north, -L.z);
      const Vv = east.clone().multiplyScalar(L.vx).addScaledVector(up, L.vy).addScaledVector(north, -L.vz);
      r = P.toArray() as V3;
      v = Vv.toArray() as V3;
      // launch-local axes (X east, Y up, Z south) → inertial
      const M = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
      q = new THREE.Quaternion().setFromRotationMatrix(M).multiply(new THREE.Quaternion(L.q[0], L.q[1], L.q[2], L.q[3]));
      stack = true;
      this.initEnduranceOrbit({ r, v });
      delete st.data.launch;
    } else if (at === 'approach' || at === 'docked') {
      this.updateEndurance(t);
      const g = this.dockGoal(null as unknown as Spacecraft, at === 'docked' ? 0 : 160, false, 0);
      r = g.pos;
      v = [...this.eVel] as V3;
      q = g.quat.clone();
    } else {
      // parking orbit at 290 km, coplanar, trailing the Endurance by ~14°
      this.updateEndurance(t);
      const rE = new THREE.Vector3(...this.ePos), vE = new THREE.Vector3(...this.eVel);
      const hh = new THREE.Vector3().crossVectors(rE, vE).normalize();
      const eAlt = rE.length() - PRIMARY.R;
      const alt = PRIMARY.id === 'earth' ? 290e3 : Math.max(eAlt * 0.88, safeOrbitAlt() * 1.6);
      const rr = rE.clone().normalize().applyAxisAngle(hh, -THREE.MathUtils.degToRad(14)).multiplyScalar(PRIMARY.R + alt);
      const vv = new THREE.Vector3().crossVectors(hh, rr).normalize().multiplyScalar(Math.sqrt(PRIMARY.mu / rr.length()));
      r = rr.toArray() as V3;
      v = vv.toArray() as V3;
      q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), vv.clone().normalize(), rr.clone().normalize()));
    }
    st.location = 'space';
    st.pos = [...r];
    st.vel = [...v];
    st.quat = [q.x, q.y, q.z, q.w];
    st.angVel = [0, 0, 0];
    if (stack) {
      const ss: VehicleState = { ...st, id: 'stack', fuel: (st.data.s2fuel as number) ?? S2_SPEC.propMax, fuelMax: S2_SPEC.propMax };
      this.craft = new Spacecraft(S2_SPEC, ss);
      this.craft.payload = RANGER_WET;
      void this.buildStack();
    } else {
      this.craft = new Spacecraft(SPECS.ranger, st);
    }
    this.craft.gearDown = false;
    this.craft.sas = 'stability';
    this.craft.unlimited = game.state.creative.unlimitedResources;
    this.r1Docked = at === 'docked';
    if (this.r1Docked) {
      st.docked = { ship: 'endurance', port: 'fwd' };
      this.dockRoll = 0;
    }
    this.origin[0] = r[0];
    this.origin[1] = r[1];
    this.origin[2] = r[2];
    this.updateEndurance(t);
    this.syncRoots();
    this.seatPlayer();
    if (resume === 'orbit-insertion') this.control.setAutopilot(new OrbitInsertion(this, resumeAp));
    if (game.state.flags.emerge) setTimeout(() => this.emerge(), 0);
    if (aboardAt) {
      this.game.setControl(null);
      this.boardEndurance(aboardAt);
    }
  }

  /** Upper stage + adapter under Ranger 1 until the stage is spent. */
  private async buildStack() {
    const inst = await this.game.assets.instance('rocket');
    this.stackInst = inst;
    const s1 = inst.nodes.get('stage1');
    if (s1) s1.visible = false;
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.set(0, -STACK_COM, 0);
    inner.add(inst.root);
    g.add(inner);
    inst.root.updateMatrixWorld(true);
    const s2n = inst.nodes.get('stage2');
    if (s2n) {
      this.s2Plume = new Plume({ radius: 1.3, length: 55, core: 0xf2f6ff, edge: 0x7a9cff, intensity: 6 });
      this.s2Plume.mesh.rotation.x = -Math.PI / 2;
      this.s2Plume.mesh.position.set(0, 0.8, 0);
      s2n.add(this.s2Plume.mesh);
    }
    // mount Ranger 1 nose-up on the adapter (same as on the pad)
    const mount = inst.nodes.get('ranger_mount');
    if (mount) {
      g.updateMatrixWorld(true);
      const mountL = g.worldToLocal(mount.getWorldPosition(new THREE.Vector3()));
      const r = this.r1Inst.root;
      r.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      r.position.set(0, 0, 0);
      r.updateMatrixWorld(true);
      const dockL = this.r1Inst.nodes.get('dock_rear')!.getWorldPosition(new THREE.Vector3());
      r.position.copy(mountL).sub(dockL).add(new THREE.Vector3(0, 0.15, 0));
      g.add(r);
    }
    this.stackRoot = g;
    this.scene.add(g);
  }

  /** Upper stage spent: Ranger 1 separates and continues on its own engines. */
  private separateStage() {
    if (!this.stackRoot) return;
    const r = this.r1Inst.root;
    // the Ranger's world pose becomes the new craft pose
    this.stackRoot.updateMatrixWorld(true);
    const wp = r.getWorldPosition(new THREE.Vector3()), wq = r.getWorldQuaternion(new THREE.Quaternion());
    const st = this.game.state.vehicles.ranger1;
    st.fuel = Math.max(st.fuel, SPECS.ranger.propMax * 0.97);
    const old = this.craft;
    const c = new Spacecraft(SPECS.ranger, st);
    wp.add(this.r1Com.clone().applyQuaternion(wq));
    c.pos[0] = this.origin[0] + wp.x;
    c.pos[1] = this.origin[1] + wp.y;
    c.pos[2] = this.origin[2] + wp.z;
    c.vel[0] = old.vel[0] + 0;
    c.vel[1] = old.vel[1];
    c.vel[2] = old.vel[2];
    c.quat.copy(wq);
    c.angVel.set(0, 0, 0);
    c.gearDown = false;
    c.unlimited = old.unlimited;
    this.craft = c;
    (this.control as any).craft = c;
    r.position.copy(this.r1Com).negate();
    r.quaternion.identity();
    this.r1Root.add(r);
    // the spent stage drifts away (kept briefly as a visual)
    const spent = this.stackRoot;
    this.stackRoot = null;
    const drift = { pos: [...old.pos] as V3, vel: [old.vel[0], old.vel[1], old.vel[2]] as V3, q: spent.quaternion.clone(), t: 0 };
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(wq).multiplyScalar(-1.2);
    drift.vel[0] += back.x;
    drift.vel[1] += back.y;
    drift.vel[2] += back.z;
    this.spent = { obj: spent, ...drift };
    this.game.audio.thud(undefined, 0.5, 120);
    this.say('computer', 'Upper stage depleted. Separation confirmed — Ranger main engines.');
  }
  private spent: { obj: THREE.Object3D; pos: V3; vel: V3; q: THREE.Quaternion; t: number } | null = null;

  private seatPlayer() {
    const game = this.game;
    const seat = this.r1Inst.nodes.get('seat_pilot');
    const eye = this.r1Inst.nodes.get('seat_pilot_eye');
    const p = game.player;
    p.enterFrame(this.r1Frame, new THREE.Vector3(0, 0, 0), 0, 'float');
    if (seat && eye) p.sit({ id: 'ranger1_pilot', anchor: seat, eye, frame: this.r1Frame, exit: () => new THREE.Vector3(0, 0.6, 2), yawLimit: 1.6 });
    p.mode = 'seat';
    // crew in their seats
    const seats = ['seat_copilot', 'seat_p1', 'seat_p2'];
    this.crew.forEach((hm, i) => {
      const s = this.r1Inst.nodes.get(seats[i]);
      if (!s) return;
      s.add(hm.root);
      hm.root.position.set(0, -0.05, 0.1);
      hm.root.rotation.set(0, 0, 0);
      hm.play('sit', 0);
    });
    if (this.control) this.control.dispose();
    this.control = new FlightControl(game, 'ranger1', this.craft, this.r1Root, eye ?? null, this.env, 'RANGER 1');
    this.control.camModes = ['cockpit', 'chase', 'orbital', 'docking'];
    this.control.dockingCamNode = this.r1Inst.nodes.get('dock_rear') ?? null;
    this.control.infoFn = () => this.hudInfo();
    this.control.exitFn = () => {
      if (this.r1Docked) return this.boardEndurance();
      game.notify('You cannot leave the pilot seat in flight.', 'warn', 2);
      return false;
    };
    game.setControl(this.control);
    if (this.stackRoot === null && this.stackInst === null && game.state.vehicles.ranger1.data.mounted === false && this.craft.spec === S2_SPEC) {
      /* stack is being built asynchronously */
    }
    if (this.craft.spec === S2_SPEC) {
      this.control.setAutopilot(new OrbitInsertion(this, 290e3, () => this.say('ward', 'We are in orbit. Endurance, this is Ranger 1 — on our way to you.')));
    }
  }

  private hudInfo() {
    const c = this.craft;
    const s = orbitSummary(c.pos, c.vel);
    const rel = this.portRelation(c);
    const ep = this.ePortWorld('fwd');
    const pcl = this.craftPortLocal(this.r1Inst, 'dock_rear');
    const pc = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().compose(new THREE.Vector3(), c.quat, new THREE.Vector3(1, 1, 1)).multiply(pcl));
    const relPos = new THREE.Vector3(this.ePos[0] - c.pos[0], this.ePos[1] - c.pos[1], this.ePos[2] - c.pos[2]).add(ep.p).sub(pc);
    const near = relPos.length() < 5000;
    return {
      orbit: { body: (BODIES[PRIMARY.id]?.name ?? PRIMARY.id).toUpperCase(), ap: s.ap, pe: s.pe, period: s.period, inc: THREE.MathUtils.radToDeg(s.inc) },
      target: this.r1Docked
        ? null
        : {
            name: 'ENDURANCE · FWD PORT',
            relPos,
            relVel: rel.relVel.clone().negate(),
            portAxis: new THREE.Vector3(0, 0, -1).applyQuaternion(ep.q),
            alignErr: near ? rel.alignErr : undefined,
            rollErr: near ? rel.rollErr : undefined,
            lateral: near ? rel.lateral : undefined,
          },
      extra: [
        ['ALT', `${(s.alt / 1000).toFixed(1)} km`],
        ['V', `${(c.speed() / 1000).toFixed(3)} km/s`],
        ['RANGE', relPos.length() > 2000 ? `${(relPos.length() / 1000).toFixed(1)} km` : `${relPos.length().toFixed(1)} m`],
        ['Δv', `${(c.deltaV() / 1000).toFixed(2)} km/s`],
        ['SUN', this.sunVis > 0.5 ? 'DAY' : 'ECLIPSE'],
      ] as [string, string][],
    };
  }

  // ===================================================================================================== autopilot menu
  openAutopilotMenu(ctrl: FlightControl) {
    const game = this.game;
    game.input.releaseLock();
    const s = orbitSummary(this.craft.pos, this.craft.vel);
    const rel = this.portRelation(this.craft);
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
      b.append(h('div', { class: 'mono', style: { marginBottom: '10px' } }, `Orbit ${(s.pe / 1000).toFixed(0)} × ${(s.ap / 1000).toFixed(0)} km · Endurance range ${rel.dist > 2000 ? (rel.dist / 1000).toFixed(1) + ' km' : rel.dist.toFixed(0) + ' m'}`));
      const safe = safeOrbitAlt();
      add('ORBIT INSERTION', `Burn to a stable parking orbit (periapsis above ${(safe / 1000).toFixed(0)} km).`, !this.r1Docked && s.pe < safe * 1.2, () => ctrl.setAutopilot(new OrbitInsertion(this, PRIMARY.id === 'earth' ? 290e3 : Math.max(safe * 1.6, 30e3))));
      add('RENDEZVOUS + DOCK', 'Plan a Lambert transfer to the Endurance, burn, correct, brake at the hold point, then dock at the forward port (time compressed).', !this.r1Docked && s.pe > safe, () => ctrl.setAutopilot(new Rendezvous(this, () => ctrl.setAutopilot(new DockingApproach(this)))));
      add('DOCKING APPROACH', 'From within 3 km: close to the 150 m hold point, align, match the ring\'s spin and dock.', !this.r1Docked && rel.dist < 3000, () => ctrl.setAutopilot(new DockingApproach(this)));
      const landable = this.landableHere();
      add(PRIMARY.id === 'earth' ? 'RETURN TO EARTH' : 'DEORBIT & LAND', PRIMARY.id === 'earth' ? 'Deorbit, re-entry belly-first (lift up), powered descent to the NASA facility or the farm.' : landable ? `Choose a landing site on ${BODIES[PRIMARY.id].name}: deorbit burn, descent coast and powered descent to touchdown.` : `${BODIES[PRIMARY.id]?.name ?? 'This body'} has no surface the Ranger can land on.`, !this.r1Docked && landable && s.pe > 0, () => setTimeout(() => this.openLandingPicker(ctrl), 30));
      add('UNDOCK', 'Release the capture latches and back away from the forward port at 0.3 m/s (the Ranger keeps the ring\'s spin until SAS damps it).', this.r1Docked, () => this.undock());
      add('ENDURANCE NAVIGATION', 'Interplanetary transfers: plan, engage, cruise (cryosleep or time warp), capture into orbit at the destination.', this.r1Docked, () => setTimeout(() => import('../../ui/Panels').then((P) => P.openMissionComputer(game, 'nav')), 50));
      add('DISENGAGE AUTOPILOT', 'Manual flight: W/S pitch, A/D yaw, Q/E roll, I/K/J/L/H/N translate, Shift/Ctrl throttle, T SAS mode.', !!ctrl.autopilot, () => ctrl.setAutopilot(null));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }

  maxTimeWarp() {
    if (this.r1Docked && this.game.state.vehicles.endurance.data.cruise) return 100000;
    if (this.r1Docked) return 1000;
    const rel = this.craft ? this.portRelation(this.craft) : null;
    return rel && rel.dist < 5000 ? 1 : 100;
  }

  /** central body of the current star system (patched conics during cruise) */
  centre() {
    return systemCentre(this.sys);
  }

  clockContext() {
    // Miller time (one hour ≈ seven Earth years) applies on the surface and in the descent below the hand-over
    // (SurfaceZone). In orbit the clock keeps the Endurance's rate: this zone integrates orbits on Earth time, and a
    // dilated clock here ran every orbit 61 000× too fast for the crew (a lap of Miller in a twelfth of a second).
    return {};
  }

  // ===================================================================================================== update
  update(dt: number, dtEarth: number) {
    this.time += dt;
    const game = this.game;
    if (!this.craft) return;
    // autopilot time compression also advances the mission clock
    const ts = this.control?.autopilot ? this.control.timeScale : 1;
    let dE = dtEarth;
    if (ts > 1 && dt > 0) dE += game.clock.advance(dt * (ts - 1), { location: 'space', system: game.state.system });
    const tEnd = game.state.clock.earthTime;
    let t = tEnd - dE;
    // Endurance spin
    const en = game.state.endurance;
    en.omega = THREE.MathUtils.damp(en.omega, en.targetOmega, 0.05, dE);
    en.spinAngle = (en.spinAngle + en.omega * dE) % (Math.PI * 2);
    // docked: the Endurance tops up Ranger 1's tanks through the port (≈120 kg/s)
    const r1s = game.state.vehicles.ranger1, evs = game.state.vehicles.endurance;
    if (this.r1Docked && r1s.fuel < r1s.fuelMax && evs.fuel > 0 && dE > 0) {
      const xfer = Math.min(r1s.fuelMax - r1s.fuel, 120 * dE, evs.fuel);
      r1s.fuel += xfer;
      evs.fuel -= xfer;
      if (r1s.fuel >= r1s.fuelMax - 0.5 && !this.refuelSaid) {
        this.refuelSaid = true;
        this.say('computer', 'Ranger 1 propellant transfer complete.');
      }
    }
    // ---- physics substeps (analytic Kepler propagation while coasting)
    let guard = 0;
    while (tEnd - t > 1e-6 && guard++ < 3000) {
      const rem = tEnd - t;
      this.tSim = t;
      let hStep = Math.min(rem, 0.05);
      if (this.r1Docked) {
        hStep = rem;
      } else {
        this.updateEndurance(t);
        if (this.control.autopilot) this.control.runAutopilot(hStep);
        const thrust = this.craft.throttle > 0 || this.craft.rcsT.lengthSq() > 1e-6 || this.craft.attRate !== null;
        // analytic Kepler coasting only in vacuum (inside an atmosphere the drag must be integrated)
        const inAir = PRIMARY.rho0 > 0 && this.env.altitude(this.craft.pos) < PRIMARY.top;
        const canCoast = !thrust && !inAir && (this.control.autopilot ? this.control.maxStep > 0.05 : rem > 0.5);
        if (canCoast) {
          hStep = Math.min(rem, this.control.autopilot ? this.control.maxStep : 2);
          const p = propagate(this.craft.pos as V3, this.craft.vel as V3, PRIMARY.mu, hStep);
          for (let k = 0; k < 3; k++) {
            this.craft.pos[k] = p.r[k];
            this.craft.vel[k] = p.v[k];
          }
          const tgt = this.craft.sasTarget(this.env);
          if (tgt && hStep > 0.2) {
            this.craft.quat.slerp(tgt, Math.min(1, hStep * 0.5));
            this.craft.angVel.multiplyScalar(0.5);
          } else this.craft.step(0, this.env);
        } else this.craft.step(hStep, this.env);
        if (this.craft.spec === S2_SPEC && this.craft.state.fuel <= 0 && this.stackRoot) this.separateStage();
        if (this.env.altitude(this.craft.pos) < 60e3 && !this.reentryWarned) {
          this.reentryWarned = true;
          game.notify('Warning: low perigee — atmospheric entry. Use ORBIT INSERTION (P).', 'alert', 6);
        }
      }
      t += hStep;
    }
    this.tSim = tEnd;
    this.updateEndurance(tEnd);
    if (!this.r1Docked && !this.handing && this.craft.spec !== S2_SPEC) this.checkSurface();
    if (this.r1Docked) {
      const g = this.dockGoal(this.craft, 0, true, this.dockRoll);
      for (let k = 0; k < 3; k++) {
        this.craft.pos[k] = g.pos[k];
        this.craft.vel[k] = this.eVel[k];
      }
      this.craft.quat.copy(g.quat);
      this.craft.angVel.copy(g.w.clone().applyQuaternion(g.quat.clone().invert()));
    }
    // write back the vehicle state
    const st = game.state.vehicles.ranger1;
    if (this.craft.spec !== S2_SPEC) {
      st.pos = [...this.craft.pos];
      st.vel = [...this.craft.vel];
      st.quat = [this.craft.quat.x, this.craft.quat.y, this.craft.quat.z, this.craft.quat.w];
    }
    // ---- floating origin & render transforms
    this.origin[0] = this.craft.pos[0];
    this.origin[1] = this.craft.pos[1];
    this.origin[2] = this.craft.pos[2];
    this.syncRoots();
    // models
    this.r1Model.update(dt, this.craft.spec === S2_SPEC ? null : this.craft, 0);
    this.s2Plume?.update(dt, this.craft.spec === S2_SPEC ? this.craft.mainLevel : 0, 0);
    this.burnLevel = THREE.MathUtils.damp(this.burnLevel, this.burnTarget, 1.5, dt);
    this.eModel.update(dt, null, 0, { mainLevel: this.burnLevel });
    this.navTick();
    for (const hm of this.crew) hm.update(dt);
    if (this.spent) {
      const s = this.spent;
      const p = propagate(s.pos, s.vel, PRIMARY.mu, dE);
      s.pos = p.r;
      s.vel = p.v;
      s.t += dt;
      s.obj.position.set(s.pos[0] - this.origin[0], s.pos[1] - this.origin[1], s.pos[2] - this.origin[2]);
      s.obj.rotateX(0.02 * dt);
      if (s.t > 240 || s.obj.position.length() > 25000) {
        s.obj.removeFromParent();
        this.spent = null;
      }
    }
    // interior: rotating-frame physics, lamps, doors
    if (this.game.player.frame === this.eFrame) this.eFrame.physics.step(dt);
    this.aboard = this.game.player.frame === this.eFrame;
    this.site.update(dt);
    this.lightPool.update(dt, this.game.camera.position);
    this.updateSky(dt);
  }
  private reentryWarned = false;
  private refuelSaid = false;
  private handing = false;

  /** Low over a landable body: hand over to the surface zone; into a gas giant / Venus: the Ranger is lost. */
  private checkSurface() {
    const alt = this.env.altitude(this.craft.pos);
    const id = PRIMARY.id;
    if (id === this.centre()) return;
    if (id === 'earth') {
      if (alt < EARTH_HANDOVER) this.handToEarth();
      return;
    }
    if (isLandable(id)) {
      if (alt < handoverAltitude(id, PRIMARY.R)) this.handToSurface();
      return;
    }
    const body = BODIES[id];
    const crush = body.kind === 'gas' || body.kind === 'ice' ? 0 : id === 'venus' ? 45e3 : -1;
    if (crush >= 0 && alt < crush) {
      this.handing = true;
      const msg = id === 'venus' ? 'Ranger 1 lost in the Venusian atmosphere: 90 bar and 460 °C below the clouds.' : `Ranger 1 lost below ${body.name}'s cloud tops — there is no surface to land on.`;
      this.game.notify(msg, 'alert', 9);
      this.game.log('mission', 'computer', msg);
      void this.game.goTo('space', { at: 'docked' }, { fade: 1.5 });
    }
  }

  private handToSurface() {
    this.handing = true;
    const game = this.game;
    const st = game.state.vehicles.ranger1;
    const t = this.tSim;
    const c = this.craft;
    const ap = this.control.autopilot;
    let sd: SurfaceState;
    if (ap instanceof DeorbitLanding) {
      sd = { body: PRIMARY.id, lat: ap.site.lat, lon: ap.site.lon, name: ap.siteName, autoland: true };
    } else {
      // manual descent: centre the surface on the point the craft will reach after braking
      const Rm = bodyRot(PRIMARY.id, t);
      const w = bodyOmega(PRIMARY.id, t);
      const r = new THREE.Vector3(...c.pos);
      const vRel = new THREE.Vector3(...c.vel).sub(new THREE.Vector3().crossVectors(w, r));
      const up = r.clone().normalize();
      const hv = vRel.clone().addScaledVector(up, -vRel.dot(up));
      const hs = hv.length();
      const d = Math.min((hs * hs) / (2 * 0.42 * c.maxAccel()) + 3e3, 0.3 * PRIMARY.R);
      const p = up.clone().multiplyScalar(Math.cos(d / PRIMARY.R)).addScaledVector(hs > 1 ? hv.normalize() : up, hs > 1 ? Math.sin(d / PRIMARY.R) : 0).applyMatrix3(Rm).normalize();
      const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)));
      const lon = THREE.MathUtils.radToDeg(Math.atan2(-p.z, p.x));
      sd = { body: PRIMARY.id, lat, lon, name: fmtLatLon(lat, lon, 1), autoland: false };
    }
    const ho: Handover = { r: [...c.pos] as V3, v: [...c.vel] as V3, q: [c.quat.x, c.quat.y, c.quat.z, c.quat.w], t, program: sd.autoland ? 'descent' : undefined };
    st.data.surface = sd;
    st.data.handover = ho;
    st.location = 'surface';
    this.control.setAutopilot(null);
    void game.goTo('surface', { at: 'descent' }, { fade: 0.6 });
  }

  /** Engage the deorbit-and-landing autopilot for a site on the current body. */
  landAt(lat: number, lon: number, name: string, tag = '') {
    if (!this.landableHere() || this.r1Docked) return false;
    const hh = PRIMARY.id === 'earth' ? EARTH_HANDOVER : handoverAltitude(PRIMARY.id, PRIMARY.R);
    const ap = new DeorbitLanding(this, makeSite(PRIMARY.id, lat, lon), name, hh);
    ap.tag = tag;
    this.control.setAutopilot(ap);
    return true;
  }

  /** Every SURFACES body, plus Earth (the mapped region around the NASA facility and the farm). */
  landableHere() {
    return isLandable(PRIMARY.id) || PRIMARY.id === 'earth';
  }

  /** Return to Earth: pick the NASA forecourt or the farm. */
  landOnEarth(target: 'nasa' | 'farm') {
    const tg = EARTH_TARGETS.find((x) => x.id === target)!;
    const ll = earthLatLon(tg.x, tg.z);
    return this.landAt(ll.lat, ll.lon, tg.name, tg.id);
  }

  /** Below the hand-over altitude over Earth: into the Earth zone if over the mapped region. */
  private handToEarth() {
    const game = this.game;
    const c = this.craft;
    const t = this.tSim;
    const ap = this.control.autopilot;
    const E = inertialToEarth(c.pos as V3, c.vel as V3, c.quat, t, 1.6);
    if (!insideEarthMap(E.p[0], E.p[2])) {
      if (!this.reentryWarned2) {
        this.reentryWarned2 = true;
        game.notify('Re-entry outside the mapped region: only the plains and foothills around the NASA facility are mapped. Use DEORBIT & LAND to come down there.', 'alert', 9);
      }
      if (this.env.altitude(c.pos) < 300) {
        this.handing = true;
        game.notify('Ranger 1 was lost on landing outside the mapped region.', 'alert', 9);
        void game.goTo('space', { at: 'docked' }, { fade: 1.5 });
      }
      return;
    }
    this.handing = true;
    const st = game.state.vehicles.ranger1;
    const tgt = ap instanceof DeorbitLanding && ap.tag ? (ap.tag as 'nasa' | 'farm') : EARTH_TARGETS.reduce((b, x) => (Math.hypot(x.x - E.p[0], x.z - E.p[2]) < Math.hypot(b.x - E.p[0], b.z - E.p[2]) ? x : b)).id;
    const re: EarthReentry = { r: [...c.pos] as V3, v: [...c.vel] as V3, q: [c.quat.x, c.quat.y, c.quat.z, c.quat.w], t, target: tgt, autoland: ap instanceof DeorbitLanding };
    st.data.reentry = re;
    delete st.data.surface;
    st.location = 'earth';
    this.control.setAutopilot(null);
    void game.goTo('earth', { at: 'reentry' }, { fade: 0.6 });
  }
  private reentryWarned2 = false;

  /** Landing-site picker for the current body. */
  private openLandingPicker(ctrl: FlightControl) {
    const game = this.game;
    const id = PRIMARY.id;
    const earth = id === 'earth';
    const def = earth ? { sites: EARTH_TARGETS.map((tg) => ({ ...earthLatLon(tg.x, tg.z), name: tg.name, tag: tg.id, note: tg.id === 'nasa' ? 'The paved forecourt outside the facility blast doors.' : 'The cornfield north of the farmhouse.' })) } : SURFACES[id];
    const c = this.craft;
    const s = orbitSummary(c.pos, c.vel);
    game.ui.openPanel(`LANDING SITE — ${(BODIES[id]?.name ?? id).toUpperCase()}`, (b, p) => {
      const engage = (lat: number, lon: number, name: string, tag = '') => {
        this.landAt(lat, lon, name, tag);
        p.close();
        game.input.requestLock();
      };
      const aB = 0.42 * c.maxAccel();
      const vOrb = Math.sqrt(PRIMARY.mu / (PRIMARY.R + Math.max(0, s.alt)));
      const est = vOrb * 1.08 + 150;
      b.append(h('div', { class: 'dim', style: { fontSize: '12px', marginBottom: '10px' } },
        `Deorbit, coast to the approach gate ${(handoverAltitude(id, PRIMARY.R) / 1000).toFixed(0)} km up and ${(brakingDistance(PRIMARY.mu, PRIMARY.R, aB) / 1000).toFixed(0)} km up-range, then powered descent. Descent Δv ≈ ${(est / 1000).toFixed(2)} km/s plus any plane change for sites off the ground track (the plan reports the exact figure); a return to orbit needs about the same. Ranger Δv ${(c.deltaV() / 1000).toFixed(2)} km/s.`));
      for (const site of def.sites as { name: string; lat: number; lon: number; note: string; tag?: string }[]) {
        const btn = game.ui.button(site.name.toUpperCase(), () => engage(site.lat, site.lon, site.name, site.tag ?? ''), 'btn primary');
        b.append(h('div', { style: { margin: '8px 0' } }, btn, h('div', { class: 'dim', style: { fontSize: '12px', marginTop: '4px' } }, `${site.note} · ${fmtLatLon(site.lat, site.lon, 1)}`)));
      }
      // a site under the ground track a third of an orbit ahead: no plane change at all (not on Earth: unmapped)
      if (earth) return;
      const P = Number.isFinite(s.period) ? s.period : 7200;
      const ahead = propagate(c.pos as V3, c.vel as V3, PRIMARY.mu, P * 0.33).r;
      const bf = new THREE.Vector3(...ahead).applyMatrix3(bodyRot(id, this.tSim + P * 0.33)).normalize();
      const la = THREE.MathUtils.radToDeg(Math.asin(bf.y)), lo = THREE.MathUtils.radToDeg(Math.atan2(-bf.z, bf.x));
      const gname = `Ground track ${fmtLatLon(la, lo, 1)}`;
      const gb = game.ui.button('UNDER THE GROUND TRACK', () => engage(la, lo, gname), 'btn');
      b.append(h('div', { style: { margin: '14px 0 6px' } }, gb, h('div', { class: 'dim', style: { fontSize: '12px', marginTop: '4px' } }, `${gname} — cheapest: no plane change.`)));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }

  // ===================================================================================================== navigation
  burnLevel = 0;
  get primaryId() {
    return PRIMARY.id;
  }
  burnTarget = 0;
  private navCache = new Map<string, TransferPlan | null>();

  private applyPrimary(id: string) {
    const b = BODIES[id];
    setPrimary(id, b.mu, b.radius);
  }

  /** Re-centre the local inertial frame on another body (patched conics); free craft keep their heliocentric state. */
  private switchPrimary(id: string) {
    const t = this.game.state.clock.earthTime;
    const old = PRIMARY.id;
    if (old === id) return;
    const ho = old === 'sun' ? { r: [0, 0, 0], v: [0, 0, 0] } : helio(old, t);
    const hn = id === 'sun' ? { r: [0, 0, 0], v: [0, 0, 0] } : helio(id, t);
    if (this.craft && !this.r1Docked) {
      for (let k = 0; k < 3; k++) {
        this.craft.pos[k] += ho.r[k] - hn.r[k];
        this.craft.vel[k] += ho.v[k] - hn.v[k];
      }
    }
    this.applyPrimary(id);
    this.navCache.clear();
  }

  /** Body the Endurance is currently parked at (or 'sun' in cruise). */
  parkedAt() {
    const d = this.game.state.vehicles.endurance.data;
    if (d.cruise) return this.centre();
    if (d.hold) return (d.hold as { target: string }).target;
    return PRIMARY.id;
  }

  private enduranceDv() {
    const ev = this.game.state.vehicles.endurance;
    const sp = SPECS.endurance;
    return sp.mainIsp * G0 * Math.log((sp.dryMass + ev.fuel) / sp.dryMass);
  }

  private propFor(dv: number) {
    const ev = this.game.state.vehicles.endurance;
    const sp = SPECS.endurance;
    const m0 = sp.dryMass + ev.fuel;
    return m0 * (1 - Math.exp(-dv / (sp.mainIsp * G0)));
  }

  computerTabs() {
    if (!this.r1Docked && !this.aboard) return [];
    return [{ id: 'nav', label: 'NAVIGATION', build: (b: HTMLElement) => this.navTab(b) }];
  }

  private navTab(b: HTMLElement) {
    const game = this.game;
    const st = game.state;
    const ev = st.vehicles.endurance;
    const d = ev.data;
    const t = st.clock.earthTime;
    b.innerHTML = '';
    const here = this.parkedAt();
    const cruise = d.cruise as TransferPlan | undefined;
    const pending = d.pending as TransferPlan | undefined;
    const head = h('div', { class: 'card' }, h('h3', {}, 'ENDURANCE — NAVIGATION'),
      h('div', { class: 'kv' },
        h('span', {}, 'Position'), h('span', {}, this.whereText()),
        h('span', {}, 'Earth date'), h('span', {}, MissionClock.formatDate(t)),
        h('span', {}, 'Propellant'), h('span', {}, `${Math.round(ev.fuel / 1000).toLocaleString()} t`),
        h('span', {}, 'Δv available'), h('span', {}, `${(this.enduranceDv() / 1000).toFixed(1)} km/s (Isp ${SPECS.endurance.mainIsp} s)`),
        h('span', {}, 'Ranger 1'), h('span', {}, this.r1Docked ? 'docked — forward port' : 'NOT DOCKED'),
      ));
    b.append(head);
    if (cruise) {
      const left = cruise.tArr - t;
      const c = h('div', { class: 'card' }, h('h3', {}, `CRUISE TO ${(BODIES[cruise.to]?.name ?? cruise.to).toUpperCase()}`),
        h('div', { class: 'kv' }, h('span', {}, 'Arrival'), h('span', {}, `${MissionClock.formatDate(cruise.tArr)} (${fmtDuration(left)})`),
          h('span', {}, 'Heliocentric distance'), h('span', {}, `${(Math.hypot(...this.ePos) / 1.496e11).toFixed(3)} AU`)));
      const row = h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
      row.append(game.ui.button('ENTER CRYOSLEEP UNTIL ARRIVAL', () => { game.ui.closeAllPanels(); void this.cryosleep(cruise.tArr - 2 * 86400); }, 'btn primary'));
      row.append(game.ui.button('STAY AWAKE (TIME WARP ×100 000)', () => { game.ui.closeAllPanels(); game.clock.timeScale = 100000; game.input.requestLock(); }, 'btn'));
      c.append(row);
      b.append(c);
      return;
    }
    if (pending) {
      const c = h('div', { class: 'card' }, h('h3', {}, `DEPARTURE PLANNED — ${(BODIES[pending.to]?.name ?? pending.to).toUpperCase()}`),
        h('div', { class: 'kv' }, h('span', {}, 'Departure'), h('span', {}, `${MissionClock.formatDate(pending.tDep)} (in ${fmtDuration(Math.max(0, pending.tDep - t))})`),
          h('span', {}, 'Arrival'), h('span', {}, MissionClock.formatDate(pending.tArr))));
      const row = h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
      if (pending.tDep - t > 600) row.append(game.ui.button('WAIT FOR THE WINDOW (SKIP AHEAD)', () => { game.ui.closeAllPanels(); void this.skipTo(pending.tDep - 30, 'Waiting for the departure window'); }, 'btn primary'));
      row.append(game.ui.button('CANCEL', () => { delete d.pending; st.endurance.nav.program = 'parking'; this.navTab(b); }, 'btn danger'));
      c.append(row);
      b.append(c);
      return;
    }
    const list = h('div', { class: 'list' });
    const detail = h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'dim' }, 'Choose a destination and a profile. Efficient waits for the launch window; Fast leaves within weeks and spends more propellant.'));
    const show = (to: string, profile: 'efficient' | 'fast') => {
      const key = `${here}>${to}>${profile}`;
      let plan = this.navCache.get(key);
      if (plan === undefined) {
        plan = planTransfer(here === 'wormhole' ? 'saturn' : here, to, game.state.clock.earthTime, profile, Math.min(this.sys === 'gargantua' ? 110e3 : 80e3, this.enduranceDv() * 0.7));
        this.navCache.set(key, plan);
      }
      detail.innerHTML = '';
      detail.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      if (!plan) {
        detail.append(h('div', { class: 'status-warn' }, 'No transfer within the Δv budget for this profile.'));
        return;
      }
      const prop = this.propFor(plan.dv);
      detail.append(h('h3', {}, `${(BODIES[here]?.name ?? here).toUpperCase()} → ${(BODIES[to]?.name ?? to).toUpperCase()} · ${profile.toUpperCase()}`),
        h('div', { class: 'kv' },
          h('span', {}, 'Departure'), h('span', {}, `${MissionClock.formatDate(plan.tDep)}${plan.tDep - game.state.clock.earthTime > 86400 ? ` (wait ${fmtDuration(plan.tDep - game.state.clock.earthTime)})` : ''}`),
          h('span', {}, 'Flight time'), h('span', {}, fmtDuration(plan.tArr - plan.tDep)),
          h('span', {}, 'Arrival'), h('span', {}, MissionClock.formatDate(plan.tArr)),
          h('span', {}, 'Δv departure / capture'), h('span', {}, `${(plan.dvDep / 1000).toFixed(2)} / ${(plan.dvArr / 1000).toFixed(2)} km/s`),
          h('span', {}, 'v∞ departure / arrival'), h('span', {}, plan.local ? 'local transfer' : `${(plan.vinfDep / 1000).toFixed(2)} / ${(plan.vinfArr / 1000).toFixed(2)} km/s`),
          h('span', {}, 'Propellant'), h('span', {}, `${Math.round(prop / 1000).toLocaleString()} t of ${Math.round(game.state.vehicles.endurance.fuel / 1000).toLocaleString()} t`),
          h('span', {}, 'Parking orbit'), h('span', {}, to === 'wormhole' || to === 'wormhole_g' ? 'station-keeping 6 km from the Anomaly' : `${((parkRadius(to) - BODIES[to].radius) / 1000).toFixed(0)} km altitude`),
        ));
      const go = game.ui.button('ENGAGE', () => { game.ui.closeAllPanels(); this.engage(plan!); }, 'btn primary');
      go.disabled = !this.r1Docked || prop > game.state.vehicles.endurance.fuel;
      detail.append(h('div', { style: { marginTop: '10px' } }, go, !this.r1Docked ? h('span', { class: 'status-warn', style: { marginLeft: '10px' } }, 'Dock Ranger 1 first') : ''));
    };
    // the Anomaly: traverse to the other side
    if (here === 'wormhole' || here === 'wormhole_g') {
      const other = here === 'wormhole' ? 'the Gargantua system' : 'the Solar System, near Saturn';
      const tc = h('div', { class: 'card' }, h('h3', {}, 'THE ANOMALY — TRAVERSE'),
        h('div', { class: 'dim', style: { fontSize: '12px' } }, `Fly the Endurance into the throat. A traversable wormhole (speculative physics): the far mouth opens in ${other}. Ranger 1 must be docked.`));
      const go = game.ui.button('ENTER THE WORMHOLE', () => { game.ui.closeAllPanels(); void this.traverse(); }, 'btn primary');
      go.disabled = !this.r1Docked;
      tc.append(h('div', { style: { marginTop: '10px' } }, go));
      b.append(tc);
    }
    const AUm = 1.496e11;
    for (const id of destinations(this.sys)) {
      if (id === here) continue;
      const bd = BODIES[id];
      const pa = planetOf(id);
      const dist = Math.hypot(...(() => { const a = helio(pa, t).r, c = helio(planetOf(here === 'wormhole' ? 'saturn' : here === 'sun' ? 'earth' : here === 'gargantua' ? 'wormhole_g' : here), t).r; return [a[0] - c[0], a[1] - c[1], a[2] - c[2]] as V3; })());
      const row = h('div', { class: 'item' },
        h('span', {}, h('b', {}, bd.name), h('span', { class: 'dim', style: { marginLeft: '8px', fontSize: '12px' } }, `${bd.kind === 'moon' ? 'moon of ' + BODIES[bd.parent!].name : bd.kind}${pa !== planetOf(here === 'wormhole' ? 'saturn' : here) ? ` · ${(dist / AUm).toFixed(2)} AU` : ' · local'}`)),
        h('span', {}, game.ui.button('EFFICIENT', () => show(id, 'efficient'), 'btn'), game.ui.button('FAST', () => show(id, 'fast'), 'btn')));
      list.append(row);
    }
    b.append(detail, h('div', { class: 'card' }, h('h3', {}, 'DESTINATIONS'), list));
  }

  /** Commit to a transfer: wait for the window (if any), then the departure burn. */
  engage(plan: TransferPlan) {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    d.pending = plan;
    game.state.endurance.nav.destination = plan.to;
    game.state.endurance.nav.departT = plan.tDep;
    game.state.endurance.nav.arriveT = plan.tArr;
    game.log('mission', 'NAV', `Transfer to ${BODIES[plan.to]?.name}: depart ${MissionClock.formatDate(plan.tDep)}, arrive ${MissionClock.formatDate(plan.tArr)}, Δv ${(plan.dv / 1000).toFixed(2)} km/s.`);
    this.say('computer', `Course to ${BODIES[plan.to]?.name} laid in. ${plan.tDep - game.state.clock.earthTime > 3600 ? `Departure window opens in ${fmtDuration(plan.tDep - game.state.clock.earthTime)}.` : 'Departure burn in thirty seconds.'}`);
  }

  /** Per-frame: departure when the window opens, arrival at the end of the cruise. */
  private navTick() {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    const t = game.state.clock.earthTime;
    if (this.navBusy) return;
    const pending = d.pending as TransferPlan | undefined;
    if (pending && t >= pending.tDep) void this.depart(pending);
    const cruise = d.cruise as TransferPlan | undefined;
    if (cruise && t >= cruise.tArr) void this.arrive(cruise);
  }
  private navBusy = false;

  /** External view of the Endurance with the main engines lit (departure / capture burns). */
  private burnCinematic(seconds: number, label: string): Promise<void> {
    const game = this.game;
    return new Promise((resolve) => {
      let tt = 0;
      this.burnTarget = 1;
      game.say('computer', label, 4);
      game.playCinematic({
        blocking: false,
        update: (dt, cam) => {
          tt += dt;
          this.eRoot.updateMatrixWorld(true);
          const k = tt / seconds;
          const off = new THREE.Vector3(Math.sin(0.6 + k * 0.8) * 120, 45 - k * 20, 150 + Math.cos(0.6 + k * 0.8) * 60);
          cam.position.copy(off.applyQuaternion(this.eQLvlh)).add(this.eRoot.position);
          cam.up.set(0, 1, 0).applyQuaternion(this.eQLvlh);
          cam.lookAt(this.eRoot.position);
          cam.updateMatrixWorld();
          if (tt >= seconds) {
            this.burnTarget = 0;
            resolve();
            return false;
          }
          return true;
        },
      });
    });
  }

  /**
   * Through the Anomaly: the Endurance closes on the throat (the lens swells until the other galaxy fills the
   * view), the screen warps, a white-out — and the zone is rebuilt on the other side, emerging from the far mouth.
   */
  async traverse() {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    const hold = d.hold as { target: string; offset: V3 } | undefined;
    if (this.navBusy || !hold || !this.r1Docked) return;
    this.navBusy = true;
    const from = hold.target;
    const off0 = new THREE.Vector3(...hold.offset);
    this.say('computer', 'Committing to the Anomaly. All hands, secure for transit.');
    game.log('mission', 'NAV', `Entering the wormhole — ${MissionClock.formatDate(game.state.clock.earthTime)}.`);
    const fx = game.renderer.fx;
    await new Promise<void>((resolve) => {
      let tt = 0;
      this.burnTarget = 0.6;
      game.playCinematic({
        blocking: true,
        update: (dt, cam) => {
          tt += dt;
          const k = THREE.MathUtils.smoothstep(tt, 0, 11);
          const o = off0.clone().multiplyScalar(1 - k);
          hold.offset = [o.x, o.y, o.z];
          this.updateEndurance(this.game.state.clock.earthTime);
          this.syncRoots();
          // chase camera behind the ship, looking at the throat
          const toThroat = off0.clone().negate().normalize();
          const side = new THREE.Vector3(0, 1, 0).cross(toThroat).normalize();
          cam.position.copy(this.eRoot.position).addScaledVector(toThroat, -260 + 120 * k).addScaledVector(side, 70 * (1 - k)).add(new THREE.Vector3(0, 55 * (1 - k) + 12, 0));
          cam.up.set(0, 1, 0);
          cam.lookAt(this.eRoot.position.clone().addScaledVector(toThroat, 400));
          cam.updateMatrixWorld();
          fx.warp = THREE.MathUtils.smoothstep(tt, 7, 12.5) * 1.4;
          fx.shake = THREE.MathUtils.smoothstep(tt, 6, 11) * 0.7;
          if (tt > 9.5 && tt - dt <= 9.5) this.say('ward', 'Here we go.');
          if (tt >= 12.8) {
            resolve();
            return false;
          }
          return true;
        },
      });
    });
    await game.fadeTo(1, 0.9, new THREE.Color(1, 1, 1));
    fx.warp = 0;
    fx.shake = 0;
    this.burnTarget = 0;
    // the far mouth: hold 6 km out on the side facing the new system's centre
    const toSys = from === 'wormhole' ? 'gargantua' : 'sol';
    const exit = from === 'wormhole' ? 'wormhole_g' : 'wormhole';
    const t = game.state.clock.earthTime;
    game.state.system = toSys;
    const w = helio(exit, t).r;
    const off = new THREE.Vector3(-w[0], -w[1], -w[2]).normalize().multiplyScalar(6e3);
    d.hold = { target: exit, offset: [off.x, off.y, off.z] };
    delete d.orbit;
    game.state.endurance.nav.parkBody = exit;
    game.state.flags.emerge = exit;
    if (!game.state.discoveries.includes('traversed_wormhole')) game.state.discoveries.push('traversed_wormhole');
    if (toSys === 'gargantua') game.state.mission.stage = 'gargantua';
    this.navBusy = false;
    const at = this.aboard ? 'endurance:command' : 'docked';
    await game.goTo('space', { at }, { fade: 0, color: new THREE.Color(1, 1, 1), fadeIn: 3 });
  }

  /** After a traversal: the Endurance drifts out of the far mouth (camera off to the side, the new sky behind). */
  private emerge() {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    const hold = d.hold as { target: string; offset: V3 } | undefined;
    if (!hold) return;
    delete game.state.flags.emerge;
    const off1 = new THREE.Vector3(...hold.offset);
    let tt = 0;
    const garg = this.sys === 'gargantua';
    game.playCinematic({
      blocking: true,
      skippable: true,
      skip: () => (tt = 99),
      update: (dt, cam) => {
        tt += dt;
        const k = THREE.MathUtils.smoothstep(tt, 0, 9);
        const o = off1.clone().multiplyScalar(0.02 + 0.98 * k);
        hold.offset = [o.x, o.y, o.z];
        this.updateEndurance(game.state.clock.earthTime);
        this.syncRoots();
        const out = off1.clone().normalize();
        const side = new THREE.Vector3(0, 1, 0).cross(out).normalize();
        // camera outside the mouth (the lens sphere is ~1 km): the ship slides out of the throat, then the view
        // moves in behind it as it heads for its hold point with the system's centre (Gargantua) ahead
        const throatPt = this.eRoot.position.clone().addScaledVector(out, -o.length());
        const pan = THREE.MathUtils.smoothstep(tt, 4.5, 10);
        const camA = throatPt.clone().addScaledVector(side, 6200).addScaledVector(out, 5200).add(new THREE.Vector3(0, 900, 0));
        const camB = this.eRoot.position.clone().addScaledVector(out, -260).addScaledVector(side, 90).add(new THREE.Vector3(0, 38, 0));
        cam.position.copy(camA).lerp(camB, pan);
        cam.up.set(0, 1, 0);
        const look = this.eRoot.position.clone().lerp(this.eRoot.position.clone().addScaledVector(out, 3000), pan * 0.9);
        cam.lookAt(look);
        cam.fov = THREE.MathUtils.lerp(14, game.settings.graphics.fov, pan);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        if (tt > 2 && tt - dt <= 2) this.say('sato', garg ? 'Gargantua…' : 'Saturn. We are home side.');
        if (tt > 6 && tt - dt <= 6) this.say('computer', garg ? 'Transit complete. Navigation is mapping the Gargantua system: Miller, Mann, Edmunds.' : 'Transit complete. Solar System navigation restored.');
        if (tt >= 11) {
          hold.offset = [off1.x, off1.y, off1.z];
          cam.fov = game.settings.graphics.fov;
          cam.updateProjectionMatrix();
          return false;
        }
        return true;
      },
    });
  }

  private async skipTo(tTarget: number, msg: string) {
    const game = this.game;
    const dt = tTarget - game.state.clock.earthTime;
    if (dt <= 0) return;
    await game.fadeTo(1, 0.8);
    game.clock.skipEarth(dt, { location: 'space', system: game.state.system });
    game.notify(`${msg} — ${fmtDuration(dt)} later`, 'info', 5);
    await game.fadeTo(0, 0.8);
  }

  async cryosleep(tWake: number) {
    const game = this.game;
    const dt = tWake - game.state.clock.earthTime;
    if (dt <= 0) return;
    this.say('computer', 'Cryosleep sequence. Pods sealed. Sleep well.');
    await game.fadeTo(1, 1.2);
    const d = game.state.endurance.cryo;
    d.active = true;
    game.clock.skipEarth(dt, { location: 'space', system: game.state.system });
    d.active = false;
    game.log('medical', 'CRYO', `Crew revived after ${fmtDuration(dt)} of cryosleep.`);
    if (this.aboard) this.boardEndurance('spawn_cryo');
    game.clock.timeScale = 1;
    await game.fadeTo(0, 1.6);
    this.say('computer', `Good morning. You have been asleep for ${fmtDuration(dt)}. Earth date ${MissionClock.formatDate(game.state.clock.earthTime)}.`);
  }

  private async depart(plan: TransferPlan) {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    this.navBusy = true;
    delete d.pending;
    game.state.endurance.nav.program = 'transfer';
    await this.burnCinematic(9, `Main engines. Departure burn — ${(plan.dvDep / 1000).toFixed(1)} kilometres per second.`);
    game.state.vehicles.endurance.fuel = Math.max(0, game.state.vehicles.endurance.fuel - this.propFor(plan.dvDep));
    if (plan.local) {
      // short local transfer inside one planet's sphere of influence
      await this.skipTo(plan.tArr, `Transfer to ${BODIES[plan.to]?.name}`);
      this.navBusy = false;
      await this.arrive(plan);
      return;
    }
    await game.fadeTo(1, 0.6);
    delete d.orbit;
    delete d.hold;
    d.cruise = plan;
    this.switchPrimary(this.centre());
    game.state.endurance.nav.program = 'coast';
    game.state.mission.stage = game.state.mission.stage === 'docked' ? 'solar' : game.state.mission.stage;
    await game.fadeTo(0, 0.6);
    this.say('ward', `We're on our way. ${fmtDuration(plan.tArr - plan.tDep)} to ${BODIES[plan.to]?.name}.`);
    this.navBusy = false;
  }

  private async arrive(plan: TransferPlan) {
    const game = this.game;
    const d = game.state.vehicles.endurance.data;
    if (this.navBusy) return;
    this.navBusy = true;
    const t = game.state.clock.earthTime;
    const to = plan.to;
    const throat = to === 'wormhole' || to === 'wormhole_g';
    const body = to === 'wormhole' ? 'saturn' : to === 'wormhole_g' ? 'gargantua' : to;
    await game.fadeTo(1, 0.5);
    delete d.cruise;
    this.switchPrimary(body);
    if (throat) {
      // station-keeping 6 km from the Anomaly (the mouth is ~2 km across), on the side facing the system's centre
      const w = helio(to, t).r;
      const off = new THREE.Vector3(-w[0], -w[1], -w[2]).normalize().multiplyScalar(6e3);
      d.hold = { target: to, offset: [off.x, off.y, off.z] };
      delete d.orbit;
    } else {
      // circular parking orbit, inclined to the body's equator (rings and poles in view at the giants)
      const f = SolarSystem.bodyFrame(body, t);
      const pole = f.pole.clone();
      const tilt = BODIES[body].rings ? 0.42 : 0.18;
      const axis = new THREE.Vector3(1, 0, 0).addScaledVector(pole, -pole.x).normalize();
      const nrm = pole.clone().applyAxisAngle(axis, tilt);
      const sunDir = new THREE.Vector3(...helio(body, t).r).negate().normalize();
      let rHat = sunDir.clone().addScaledVector(nrm, -sunDir.dot(nrm)).normalize().applyAxisAngle(nrm, -0.9);
      if (rHat.lengthSq() < 0.5) rHat = axis;
      const rad = parkRadius(body);
      const vHat = new THREE.Vector3().crossVectors(nrm, rHat).normalize();
      d.orbit = { r0: rHat.multiplyScalar(rad).toArray(), v0: vHat.multiplyScalar(Math.sqrt(BODIES[body].mu / rad)).toArray(), t0: t, body };
      delete d.hold;
    }
    game.state.endurance.nav.program = 'parking';
    game.state.endurance.nav.parkBody = body;
    game.state.endurance.nav.parkRadius = throat ? 0 : parkRadius(body);
    game.state.endurance.nav.dvUsed += plan.dv;
    game.state.vehicles.endurance.fuel = Math.max(0, game.state.vehicles.endurance.fuel - this.propFor(plan.dvArr));
    if (!game.state.discoveries.includes(`visited_${to}`)) game.state.discoveries.push(`visited_${to}`);
    if (body === 'saturn') game.state.mission.stage = 'saturn';
    this.updateEndurance(t);
    this.syncRoots();
    await game.fadeTo(0, 0.5);
    await this.burnCinematic(7, `Capture burn — ${(plan.dvArr / 1000).toFixed(1)} kilometres per second. ${throat ? 'Holding position at the Anomaly.' : `Entering orbit around ${BODIES[body]?.name}.`}`);
    game.log('mission', 'NAV', `Arrived at ${BODIES[to]?.name} — ${MissionClock.formatDate(game.state.clock.earthTime)}.`);
    this.say('sato', to === 'wormhole' ? 'There it is. A sphere — a hole in space. It is beautiful.' : `${BODIES[to]?.name}. ${BODIES[to]?.info ?? ''}`);
    if (to === 'miller') this.say('computer', 'Caution: gravitational time dilation on Miller — below the hand-over altitude and on the surface, one hour costs about seven years on Earth.');
    this.navBusy = false;
  }

  // ===================================================================================================== aboard the Endurance
  private localOf(name: string) {
    const n = this.site.node(name);
    return n ? new THREE.Vector3().setFromMatrixPosition(this.site.local(n)) : null;
  }

  private ladderInteract(n: THREE.Object3D, site: Site): Interactable | null {
    const id = n.userData.iid as string;
    const get = (k: string) => site.node(`${id}_${k}`);
    const a = get('a'), b = get('b');
    if (!a || !b) return null;
    const lp = (o: THREE.Object3D | null, fb: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(site.local(o ?? fb));
    const ref: LadderRef = { id, frame: this.eFrame, a: lp(a, a), b: lp(b, b), exitA: lp(get('ea'), a), exitB: lp(get('eb'), b) };
    if (a.userData.fx !== undefined) {
      // Blender (x, y, z) → frame-local three (x, z, −y)
      ref.face = new THREE.Vector3(a.userData.fx, a.userData.fz, -a.userData.fy).normalize();
    }
    const len = ref.a.distanceTo(ref.b);
    return {
      id: `endu_${id}`, targets: [n], range: 2.6,
      label: () => (this.game.player.mode === 'ladder' ? null : `Climb ladder (${len.toFixed(0)} m)`),
      use: () => this.game.player.grabLadder(ref),
    };
  }

  /** Release Ranger 1 from the forward port with a gentle separation push. */
  undock() {
    const game = this.game;
    if (!this.r1Docked) return;
    const g = this.dockGoal(this.craft, 0, true, this.dockRoll);
    this.r1Docked = false;
    game.state.vehicles.ranger1.docked = null;
    for (let k = 0; k < 3; k++) {
      this.craft.pos[k] = g.pos[k];
      this.craft.vel[k] = g.vel[k] + g.axis.getComponent(k) * 0.3;
    }
    this.craft.quat.copy(g.quat);
    this.craft.angVel.copy(g.w.clone().applyQuaternion(g.quat.clone().invert()));
    this.craft.sas = 'stability';
    this.craft.attRate = null;
    game.audio.thud(undefined, 0.4, 90);
    this.say('computer', 'Latches released. Separation 0.3 metres per second. Ranger 1 is free.');
    game.log('mission', 'RANGER 1', `Undocked from the Endurance at ${BODIES[PRIMARY.id]?.name ?? 'cruise'}.`);
  }

  /** Command-deck navigation console: opens the transfer planner. */
  private addNavConsole() {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7.0, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.owned = true;
    // in front of the flight console of module 9 (frame-local: x radial, z = −axial)
    hit.position.set(30.4, 0, -2.9);
    this.site.root.add(hit);
    this.game.interaction.add({
      id: 'endu_nav_console', targets: [hit], range: 2.8,
      label: () => (this.aboard ? 'Navigation console — plan an interplanetary transfer' : null),
      enabled: () => this.aboard,
      use: () => {
        this.game.input.releaseLock();
        void import('../../ui/Panels').then((P) => P.openMissionComputer(this.game, 'nav'));
      },
    });
  }

  /** Iris door at the forward port: board Ranger 1 again. */
  private addReboard() {
    const n = this.site.node('iris_fwd');
    if (!n) return;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.owned = true;
    n.add(hit);
    this.game.interaction.add({
      id: 'endu_board_r1', targets: [hit], range: 3,
      label: () => (this.r1Docked && this.aboard ? 'Forward iris — board Ranger 1 (pilot seat)' : null),
      enabled: () => this.r1Docked && this.aboard,
      use: () => this.reboard(),
    });
  }

  /** Leave the pilot seat through the docking tunnel into the hub (microgravity on the spin axis). */
  boardEndurance(at = 'spawn_hub'): boolean {
    const game = this.game;
    const pos = this.localOf(at) ?? new THREE.Vector3(0, 1.2, 0);
    game.player.seat = null;
    // in the hub look down the axis toward the command-side spoke well (frame −Z = forward port, +X = spoke 9)
    game.player.enterFrame(this.eFrame, pos, at === 'spawn_hub' ? -Math.PI / 2 : 0, at === 'spawn_hub' ? 'float' : 'walk');
    this.aboard = true;
    game.audio.door('airlock');
    game.state.player.frame = 'endurance';
    if (at === 'spawn_hub') this.say('computer', 'Transfer tunnel pressurised. Welcome aboard. Spin gravity: one g at the deck floors.');
    return true;
  }

  private reboard() {
    const game = this.game;
    const seat = this.r1Inst.nodes.get('seat_pilot');
    const eye = this.r1Inst.nodes.get('seat_pilot_eye');
    if (!seat || !eye) return;
    game.player.sit({ id: 'ranger1_pilot', anchor: seat, eye, frame: this.r1Frame, exit: () => new THREE.Vector3(0, 0.6, 2), yawLimit: 1.6 });
    game.player.mode = 'seat';
    this.aboard = false;
    game.audio.door('airlock');
    game.setControl(this.control);
  }

  /** Room name for the status line. */
  private roomHere(): string | null {
    if (!this.aboard) return null;
    const r = this.site.roomAt(this.game.player.pos.clone().add(this.game.player.up.clone().multiplyScalar(1.0)));
    if (!r) return 'Ring corridor';
    const names: Record<string, string> = { hub: 'Central hub (microgravity)', spoke3: 'Spoke — habitat side', spoke9: 'Spoke — command side', deck_9: 'Command module — flight deck', deck_3: 'Habitat module — galley', deck_0: 'Habitat module — crew quarters', deck_6: 'Cryo-lab' };
    if (names[r]) return names[r];
    if (r.startsWith('ring_')) {
      const k = +r.slice(5);
      return `Ring vestibule ${k} — ${({ habitat: 'habitat', pod: 'landing pod', engine: 'engine module', cryo: 'cryo-lab', command: 'command module' } as Record<string, string>)[['habitat', 'pod', 'engine', 'habitat', 'engine', 'pod', 'cryo', 'pod', 'engine', 'command', 'engine', 'pod'][k]]}`;
    }
    return r;
  }

  private syncRoots() {
    const o = this.origin;
    this.eRoot.position.set(this.ePos[0] - o[0], this.ePos[1] - o[1], this.ePos[2] - o[2]);
    this.eRoot.quaternion.copy(this.eQ);
    const target = this.stackRoot ?? this.r1Root;
    const q = this.craft.quat;
    this.r1Root.position.set(this.craft.pos[0] - o[0], this.craft.pos[1] - o[1], this.craft.pos[2] - o[2]);
    this.r1Root.quaternion.copy(q);
    if (this.stackRoot && target === this.stackRoot) {
      // stack group: +Y = stack up = craft body −Z
      this.stackRoot.position.copy(this.r1Root.position);
      this.stackRoot.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      // the camera/frames follow the Ranger inside the stack
      this.stackRoot.updateMatrixWorld(true);
      this.r1Inst.root.getWorldPosition(this.r1Root.position);
      this.r1Inst.root.getWorldQuaternion(this.r1Root.quaternion);
      this.r1Root.position.add(this.r1Com.clone().applyQuaternion(this.r1Root.quaternion));
      this.r1Root.updateMatrixWorld(true);
    }
    this.scene.updateMatrixWorld(true);
  }

  private updateSky(dt: number) {
    const game = this.game;
    const t = game.state.clock.earthTime;
    const cam = game.camera;
    // far layer: the whole Solar System around the camera (heliocentric, kilometre units, scaled space)
    const camW: V3 = [this.origin[0] + cam.position.x, this.origin[1] + cam.position.y, this.origin[2] + cam.position.z];
    const ph = helio(PRIMARY.id, t).r;
    const camH: V3 = [ph[0] + camW[0], ph[1] + camW[1], ph[2] + camW[2]];
    const garg = this.sys === 'gargantua';
    this.system.update(t, camH, gmst(t), this.time, game.renderer.canvas.clientHeight / THREE.MathUtils.degToRad(cam.fov));
    const wh = helio(garg ? 'wormhole_g' : 'wormhole', t).r;
    this.lens.update(new THREE.Vector3((wh[0] - camH[0]) / 1000, (wh[1] - camH[1]) / 1000, (wh[2] - camH[2]) / 1000), game.renderer.gl, this.far, dt, !game.skipRender);
    const sunDist = Math.hypot(camH[0], camH[1], camH[2]);
    const sunDir = new THREE.Vector3(-camH[0], -camH[1], -camH[2]).normalize();
    this.flux = SolarSystem.flux(sunDist, garg ? GARG_FLUX_REF : undefined);
    if (garg) {
      // the light source is Gargantua's accretion disk; the sky is another galaxy
      this.gargantua!.update(new THREE.Vector3(-camH[0], -camH[1], -camH[2]), this.time, 1);
      this.sunDisc.mesh.visible = false;
    } else {
      this.sunDisc.update(sunDir);
      this.sunDisc.mesh.scale.setScalar(THREE.MathUtils.clamp((50000 * (6.957e8 / sunDist)) / 0.038 / 6500, 0.03, 4));
    }
    // eclipse: is the Sun hidden by the Earth (with a soft penumbra through the atmosphere)?
    const pos = new THREE.Vector3(...camW);
    const b = pos.dot(sunDir);
    const perp = pos.clone().addScaledVector(sunDir, -b).length();
    const pr = PRIMARY.R, at = Math.max(PRIMARY.top * 0.4, 5e3);
    const atCentre = PRIMARY.id === this.centre();
    this.sunVis = atCentre || b > 0 ? 1 : THREE.MathUtils.smoothstep(perp, pr + at * 0.1, pr + at);
    const sunsetTint = atCentre || b > 0 || PRIMARY.rho0 === 0 ? 0 : 1 - THREE.MathUtils.smoothstep(perp, pr + at, pr + at * 3);
    if (garg) this.sun.color.setRGB(1, 0.84 - 0.3 * sunsetTint, 0.66 - 0.4 * sunsetTint);
    else this.sun.color.setRGB(1, 0.96 - 0.35 * sunsetTint, 0.92 - 0.6 * sunsetTint);
    this.sun.intensity = 3.2 * this.sunVis * this.flux;
    if (!garg) this.sunDisc.mesh.visible = this.sunVis > 0.02;
    const focus = this.focusPoint();
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(sunDir, 150);
    this.sun.target.updateMatrixWorld();
    // planetshine from the sunlit primary (fraction of the sky it fills × its albedo colour)
    const rHat = pos.clone().normalize();
    const day = atCentre ? 0 : THREE.MathUtils.smoothstep(rHat.dot(sunDir), -0.35, 0.55);
    const fill = atCentre ? 0 : 1 - Math.sqrt(Math.max(0, 1 - (PRIMARY.R / pos.length()) ** 2));
    const pc = BODIES[PRIMARY.id]?.color ?? [0.3, 0.4, 0.6];
    this.earthLight.position.copy(rHat).negate();
    this.earthLight.color.setRGB(pc[0] * 0.6 + 0.1, pc[1] * 0.6 + 0.1, pc[2] * 0.6 + 0.12);
    this.earthLight.intensity = (0.05 + 2.2 * day * fill) * this.flux * (this.aboard ? 0.12 : 1);
    // exposure: eye adaptation to the local sunlight and to orbital night
    const base = THREE.MathUtils.clamp(1 / Math.pow(this.flux, 0.75), 0.4, 4);
    this.exposure = THREE.MathUtils.damp(this.exposure, this.aboard ? 0.95 : this.sunVis > 0.5 ? base : 2.2 * base, 1.5, dt);
    this.interiorFill.intensity = this.aboard ? 0.55 : 0;
    // stars wash out when the sunlit Earth or the Sun is in view (camera exposure), full in orbital night
    const look = cam.getWorldDirection(new THREE.Vector3());
    const earthInView = THREE.MathUtils.smoothstep(look.dot(rHat.clone().negate()), -0.2, 0.5) * day;
    this.stars.setVisibility(this.sunVis > 0.5 ? 0.35 * (1 - 0.8 * earthInView) : 1);
    if (this.alienSky) this.alienSky.mat.uniforms.uK.value = this.sunVis > 0.5 ? 0.45 * (1 - 0.7 * earthInView) : 1;
    if (this.eclipseLast >= 0 && (this.sunVis > 0.5 ? 1 : 0) !== this.eclipseLast) this.game.notify(this.sunVis > 0.5 ? 'Orbital sunrise' : `Entering ${BODIES[PRIMARY.id]?.name ?? 'the planet'}'s shadow`, 'info', 3);
    this.eclipseLast = this.sunVis > 0.5 ? 1 : 0;
    // reflections: refresh a small environment from the far layer every few seconds
    this.envT -= dt;
    if (this.envT <= 0 && !this.game.skipRender) {
      this.envT = 4 * QENV.k;
      this.refreshEnvironment(rHat, sunDir, day);
    }
  }

  private envScene: THREE.Scene | null = null;
  private envMat: THREE.ShaderMaterial | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  /** Cheap environment for metal/paint reflections: dark space, the bright Earth below, the Sun. */
  private refreshEnvironment(rHat: THREE.Vector3, sun: THREE.Vector3, day: number) {
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uDown: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3() }, uDay: { value: 1 } },
        vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vD; uniform vec3 uDown, uSun; uniform float uDay;
          void main(){
            float e = smoothstep(0.25, 0.45, dot(vD, uDown));
            vec3 earth = mix(vec3(0.004, 0.006, 0.012), vec3(0.16, 0.22, 0.32), uDay) * e;
            float limb = exp(-pow((dot(vD, uDown) - 0.33) / 0.04, 2.0)) * uDay;
            vec3 c = earth + vec3(0.2, 0.32, 0.6) * limb * 0.4 + vec3(40.0, 38.0, 35.0) * pow(max(dot(vD, uSun), 0.0), 2000.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.envMat));
    }
    const u = this.envMat!.uniforms;
    (u.uDown.value as THREE.Vector3).copy(rHat).negate();
    (u.uSun.value as THREE.Vector3).copy(sun);
    u.uDay.value = day;
    this.envRT?.dispose();
    this.envRT = this.game.renderer.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.aboard ? 0.18 : 0.6;
  }

  private focusPoint() {
    // shadows around the Endurance when it is near, otherwise around the player's craft
    const d = this.eRoot.position.length();
    return d < 300 ? this.eRoot.position.clone() : new THREE.Vector3();
  }

  layers(camera: THREE.Camera): RenderLayer[] {
    const c = camera as THREE.PerspectiveCamera;
    this.farCam.fov = c.fov;
    this.farCam.aspect = c.aspect;
    this.farCam.near = 1;
    this.farCam.far = 3e5;
    this.farCam.updateProjectionMatrix();
    this.farCam.position.set(0, 0, 0);
    this.farCam.quaternion.copy(c.quaternion);
    this.farCam.updateMatrixWorld(true);
    return [
      { scene: this.far, camera: this.farCam },
      { scene: this.scene, camera, clearDepth: true },
    ];
  }

  writeState() {
    const st = this.game.state.vehicles.ranger1;
    if (this.craft && this.craft.spec !== S2_SPEC) {
      st.pos = [...this.craft.pos];
      st.vel = [...this.craft.vel];
    }
  }

  dispose() {
    this.control?.dispose();
    this.envRT?.dispose();
    this.far.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.userData.owned) m.geometry.dispose();
    });
    super.dispose();
  }
}

import * as THREE from 'three';
import { Zone } from '../Zone';
import { EARTH_ATMOSPHERE, Sky } from '../../render/Sky';
import { Globe } from '../../render/Globe';
import { StarField } from '../../render/Stars';
import { LightPool } from '../../render/LightPool';
import { assets } from '../../render/Assets';
import { Soundscape } from '../../audio/Audio';
import { D2R, LAUNCH_SITE, LocalFrame, meanMotion, OMEGA_EARTH, PARKING_ALT, R_EARTH, sunEci, thetaForLocalTime } from '../../space/Earth';
import { cwAccel, cwPropagate, OrbitPlane } from '../../space/Orbit';
import { EnduranceShip } from '../../space/Endurance';
import { FlightEnv, RANGER_SPEC, Spacecraft } from '../../vehicles/Spacecraft';
import { DockAutopilot, DockingSystem } from '../../vehicles/Docking';
import { GATE_DIST, OrbitContext, RendezvousAutopilot } from '../../space/Rendezvous';
import type { Flight } from '../../vehicles/Flight';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import { AscentSim } from '../../mission/Ascent';
import { LaunchStack } from '../../mission/LaunchStack';
import { Model } from '../../render/Assets';
import { Smoke } from '../../render/Smoke';
import { NPC, NPCManager } from '../../npc/NPC';
import { polarToLvlh } from '../../space/Orbit';
import { pressureRatio } from '../../space/Earth';
import { BODY, BodyDef, parkAlt, parkingOverride } from '../../space/Bodies';
import { equatorBasis, LAUNCH_JD, state, surfacePoint } from '../../space/Ephemeris';
import { SystemView } from '../../render/SystemView';
import { WormholeLens } from '../../render/Wormhole';
import { atmosphereFor, exposureFor, irradianceAt, toLight } from '../../space/Worlds';
import { distanceRemaining, ENDURANCE_DV, finalizeArrival, finalizeDeparture, fmtDistance, fmtDuration, ParkState, TransferPlan, voyagePosition } from '../../space/Voyage';
import { AU, DAY, R_G, WORMHOLE_PAIR } from '../../space/Bodies';
import { dilationAt, MILLER_R, kerrCircularDilation } from '../../space/Relativity';
import { add, cross, dot, norm, scale, sub, unit, V3 } from '../../space/Kepler';
import { GuidedFlight, HANDOVER_ALT, planDescent, rangerPerf } from '../../space/Descent';
import { FlightProgram, siteFunction } from '../../space/FlightProgram';
import { ProgramPilot } from './SurfaceZone';
import { EntryPlasma, PlasmaGas } from '../../render/EntryPlasma';
import type { SurfaceZone } from './SurfaceZone';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _qI = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m4b = new THREE.Matrix4();

/**
 * Time-lapse stabiliser for one rotation of the view (the zone frame against the stars, the Earth's attitude...).
 * Under heavy time compression these turn by tens of degrees between frames and the view would strobe; while
 * `hold` is set the last rotation shown is kept, and when it clears the view eases back onto the true one.
 */
class HeldRotation {
  /** shown <- true for this frame (identity when live) */
  delta = new THREE.Quaternion();
  private shown = new THREE.Quaternion();
  private state = 0;           // 0 live, 1 held, 2 easing back
  private seen = false;
  apply(q: THREE.Quaternion, hold: boolean, dt: number) {
    if (hold && this.seen) {
      this.state = 1;
      this.delta.copy(this.shown).multiply(_qb.copy(q).invert());
      return q.copy(this.shown);
    }
    if (this.state === 1) { this.state = 2; this.delta.copy(this.shown).multiply(_qb.copy(q).invert()); }
    if (this.state === 2) {
      this.delta.slerp(_qI, 1 - Math.exp(-dt * 2.5));
      if (Math.abs(this.delta.w) > 0.99999) { this.state = 0; this.delta.identity(); } else q.premultiply(this.delta);
    }
    this.shown.copy(q);
    this.seen = true;
    return q;
  }
}

/**
 * Earth orbit. The zone frame is the local-vertical / local-horizontal frame of the Endurance on its circular
 * parking orbit (X along-track, Y radial up, Z across); free-flying craft feel the frame's tidal and Coriolis
 * accelerations (Clohessy-Wiltshire), so relative motion behaves as it does in orbit. The Earth, its atmosphere,
 * the sun and the stars are placed from the real geometry of the orbit plane, the Earth's rotation and the
 * season, so the terminator, sunrises and the night side come and go once per 92-minute orbit.
 */
/** a parking orbit: its plane in body-centred inertial axes, those axes in the system frame, radius and rate */
export interface ParkingGeometry { plane: OrbitPlane; bci: { e1: THREE.Vector3; e2: THREE.Vector3; n: THREE.Vector3 }; rE: number; n: number; phase: number }

export class OrbitZone extends Zone implements OrbitContext {
  sky!: Sky;
  globe!: Globe;
  stars!: StarField;
  lights!: LightPool;
  docking = new DockingSystem();
  endurance!: EnduranceShip;
  ranger: Spacecraft | null = null;
  ranger2: Spacecraft | null = null;
  /** mission elapsed time since lift-off (s) */
  met = 0;
  /** day of year and local solar time at the launch site at lift-off */
  day = 196;
  hours = 15.3;
  theta0 = 0;
  plane!: OrbitPlane;
  frame = new LocalFrame();
  /** Endurance circular orbit */
  rE = R_EARTH + PARKING_ALT;
  n = meanMotion(R_EARTH + PARKING_ALT);
  /** in-plane angle of the Endurance at lift-off (rad) */
  phiE0 = 0;
  warp = 1;
  /** 'ascent': the frame rides with the climbing launch vehicle; 'orbit': the Endurance's LVLH frame */
  mode: 'orbit' | 'ascent' | 'cruise' | 'flight' = 'orbit';
  stack: LaunchStack | null = null;
  sim: AscentSim | null = null;
  npcs!: NPCManager;
  private stackModel!: Model;
  private smoke!: Smoke;
  /** radius and in-plane angle of the current frame origin */
  private originR = R_EARTH + PARKING_ALT;
  private originPhi = 0;
  private axis = new THREE.Vector3(0, 1, 0);
  private emitAcc = 0;
  private hudT = 0;
  private sunLocal = new THREE.Vector3();
  private earthCentre = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  /** the body the Endurance orbits (the Earth until the voyage starts) */
  body: BodyDef = BODY.earth;
  /** the rest of the system: planets, moons and the Sun, placed in double precision */
  view!: SystemView;
  /** Julian date (Earth reference) at met = 0 */
  jd0 = LAUNCH_JD;
  /**
   * Earth-reference time minus the Endurance's own (proper) time, s. Zero in the Solar System; it grows wherever
   * the ship's clock runs slow (Gargantua's gravity), and by years after a stay on Miller's planet.
   */
  earthOffset = 0;
  /** Earth-reference time since lift-off (s) */
  get earthT() { return this.met + this.earthOffset; }
  /** Julian date on Earth now: drives every ephemeris (coordinate time far from Gargantua) */
  get jd() { return this.jd0 + this.earthT / 86400; }
  /** zone frame <- system (ecliptic / Gargantua) frame, for the current frame origin */
  private rotSys = new THREE.Matrix4();
  private bci = { e1: new THREE.Vector3(1, 0, 0), e2: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1) };
  private camSys: [number, number, number] = [0, 0, 0];
  /** heavy time compression: the outside view is held steady (no strobing day, night and turning stars) */
  lapse = false;
  private lapseRate = 0;
  private lapseT = -1;
  private lapseQ = new THREE.Quaternion();
  private lapseSeen = false;
  private heldRot = new HeldRotation();
  private heldGlobe = new HeldRotation();
  private heldCam: [number, number, number] = [0, 0, 0];
  private heldCamOff: [number, number, number] = [0, 0, 0];
  private heldCamState = -1;
  private heldCamT = -1;
  private cloudShown = 0;
  private cloudEase = false;

  env: FlightEnv = {
    gravity: (_p, out) => out.set(0, 0, 0),
    density: () => 0,
    altitude: (p) => (this.mode === 'flight' && this.flightProg ? this.flightProg.f.height : this.rE - this.body.R + p.y),
    accel: (p, v, out) => (this.mode === 'cruise' ? out.set(0, 0, 0) : cwAccel(p, v, this.n, out)),
    // on the descent and ascent programs: speed through the air, in the frame on the Ranger
    velocity: (out) => {
      if (this.mode !== 'flight' || !this.flightProg) return null;
      const a = this.flightProg.f.airVel(), { X, Y, Z } = this.cruiseAxes;
      return out.set(a[0] * X.x + a[1] * X.y + a[2] * X.z, a[0] * Y.x + a[1] * Y.y + a[2] * Y.z, a[0] * Z.x + a[1] * Z.y + a[2] * Z.z);
    },
  };

  setWarp(w: number) { this.warp = w; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    progress?.(0.1, 'Earth orbit');
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere, { ...EARTH_ATMOSPHERE, cloudCoverage: 0, cirrus: 0, betaD: [0.3e-5, 0.25e-5, 0.15e-5], betaDAbs: [0.02e-5, 0.05e-5, 0.15e-5] });
    this.sky.groundColor.setRGB(0.16, 0.2, 0.28);
    this.sky.setOverGlobe(true);
    this.sky.freeSun = true;
    this.sky.setStars(0);
    this.sky.shadowRange = 48;
    this.sky.setVisible(false);
    this.globe = new Globe(R_EARTH, 256);
    this.stars = new StarField();
    this.view = new SystemView('sol');
    this.view.exclude.add('earth');
    this.view.showSun = false;   // the sky model draws the Sun's disc
    this.lights = new LightPool(this.root, 8, 4);
    progress?.(0.3, 'Endurance');
    this.endurance = new EnduranceShip(this.phys);
    await this.endurance.load(this.lights, this.docking);
    this.root.add(this.endurance.root);
    // spin axis along-track, the forward axial port facing back down the V-bar toward arriving craft
    this.endurance.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.endurance.root.updateMatrixWorld(true);
    progress?.(0.6, 'Rangers');
    const m2 = await assets.load('ranger');
    this.ranger2 = new Spacecraft('ranger2', RANGER_SPEC, m2, this.phys, this.lights);
    this.root.add(this.ranger2.root);
    this.docking.attachNow(this.ranger2, this.endurance.port('axial_aft')!);
    const m1 = await assets.load('ranger');
    this.ranger = new Spacecraft('ranger1', RANGER_SPEC, m1, this.phys, this.lights);
    this.root.add(this.ranger.root);
    this.docking.addCraft(this.ranger);
    // the plasma sheath of atmospheric entry, sized to the Ranger
    const rb = new THREE.Box3().setFromObject(this.ranger.root).getSize(new THREE.Vector3());
    this.plasma = new EntryPlasma(Math.max(rb.x, rb.y, rb.z));
    this.root.add(this.plasma.group);
    this.ranger.onImpact = (dv) => {
      if (dv > 0.4) { ui.toast(`Contact! ${dv.toFixed(2)} m/s — hull damage ${(this.ranger!.damage * 100).toFixed(0)}%`, 'warn', 3); bus.emit('sfx', { id: 'thud', node: this.ranger!.root, gain: clamp(dv, 0.3, 1) }); }
    };
    this.docking.onDocked = (l) => {
      bus.emit('ranger:docked', l);
      if (l.craft === this.ranger && g.settings.creative.autoRefuel && this.rangerFuel < RANGER_SPEC.fuelMax) {
        this.rangerFuel = RANGER_SPEC.fuelMax;
        this.ranger.fuel = RANGER_SPEC.fuelMax;
        mission.note('Creative Mode: Ranger 1 refuelled from the Endurance.');
      }
      void g.preload('endurance');
    };
    this.stackModel = await assets.load('launch_vehicle');
    this.smoke = new Smoke(1400);
    this.smoke.drag = 0.05;
    this.smoke.lift = 0;
    this.root.add(this.smoke.points);
    this.npcs = new NPCManager({ game: g, phys: this.phys, parent: this.root, weightless: () => true });
    this.setLaunch(this.day, this.hours);
    progress?.(1, 'Ready');
  }

  /** Geometry of the mission: orbit plane from the launch time, Endurance phased to meet the ascent. */
  setLaunch(day: number, hours: number, phiE0?: number) {
    this.day = day;
    this.hours = hours;
    this.theta0 = thetaForLocalTime(day, hours, LAUNCH_SITE.lon);
    this.plane = new OrbitPlane(LAUNCH_SITE.lat, LAUNCH_SITE.lon, this.theta0);
    if (phiE0 !== undefined) this.phiE0 = phiE0;
  }

  // ------------------------------------------------------------------------------------------- voyages
  /** velocity change spent by the Endurance's drive since its tanks were last full (m/s) */
  dvUsed = 0;
  /** the transfer being flown, and time since its departure burn (s) */
  voyage: TransferPlan | null = null;
  voyageT = 0;
  private cruiseShip: V3 = [0, 0, 0];
  private cruiseAxes = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
  /** largest time compression offered in cruise (one day per second) */
  static readonly MAX_WARP = 86400;

  /** Advance mission time by dt real seconds (time compression applies in orbit and in cruise). */
  advance(dt: number) {
    if (this.mode === 'ascent' || this.mode === 'flight') return;
    const step = dt * this.warp;
    this.met += step;
    if (this.pending && this.met >= this.pending.burnMet) { this.earthOffset += step * (this.dilation() - 1); this.startCruise(this.met - this.pending.burnMet); return; }
    this.earthOffset += step * (this.dilation() - 1);
    this.lookT -= dt;
    if (this.mode === 'cruise' && this.adaptLook && this.lookT <= 0) { this.lookT = 0.5; this.game.renderer.setLook(this.look()); }
    if (this.mode === 'cruise' && this.voyage) {
      this.voyageT += step;
      if (this.voyageT >= this.voyage.tof) this.arriveVoyage();
    }
  }

  /** Jump the voyage forward (cryo-sleep): everything is propagated analytically to the new time. */
  skipTo(t: number) {
    if (this.mode !== 'cruise' || !this.voyage) return;
    const dt = Math.max(0, Math.min(t, this.voyage.tof) - this.voyageT);
    // the clocks run at the mean rate along the leg (the dilation changes slowly with distance from Gargantua)
    const d0 = this.dilation();
    this.voyageT += dt / 2;
    const d1 = this.dilation();
    this.voyageT += dt / 2;
    const d2 = this.dilation();
    this.met += dt;
    this.earthOffset += dt * ((d0 + 4 * d1 + d2) / 6 - 1);
    if (this.voyageT >= this.voyage.tof - 1e-3) this.arriveVoyage();
  }

  /** a scheduled departure: the burn waits for the right point of the parking orbit */
  pending: { plan: TransferPlan; burnMet: number; geomArr: ParkingGeometry | null } | null = null;
  private geomArr: ParkingGeometry | null = null;

  /**
   * Schedule a planned transfer: the burn point on the parking orbit, the escape and capture legs and their true
   * costs. The ship coasts to the burn point under time compression and then burns. Both Rangers must be docked.
   */
  departVoyage(plan: TransferPlan): string | null {
    if (this.mode !== 'orbit') return 'The Endurance is not in a parking orbit.';
    for (const c of [this.ranger, this.ranger2]) if (c && !this.docking.isDocked(c)) return `${c === this.ranger ? 'Ranger 1' : 'Ranger 2'} is not docked.`;
    if (Math.abs(plan.jdDepart - this.jd) > 0.5) return 'The plan is out of date: the planets have moved. Recompute it.';
    const { plan: p, geomArr: ga } = this.prepareVoyage(plan);
    const need = p.dvDepart + p.dvArrive, left = ENDURANCE_DV - this.dvUsed;
    if (need > left && !this.game.settings.creative.unlimitedResources) return `Not enough propellant: the transfer needs ${(need / 1000).toFixed(1)} km/s and ${(left / 1000).toFixed(1)} km/s remain.`;
    const wait = p.wait ?? 0;
    this.pending = { plan: p, burnMet: this.met + wait, geomArr: ga };
    if (wait > 1) {
      // coast to the burn point: about eight seconds of compressed time
      this.warp = Math.max(1, Math.min(1000, Math.round(wait / 8)));
      mission.note(`Departure for ${BODY[p.to].name} scheduled: burn in ${fmtDuration(wait)} at the right point of the orbit, ${(p.dvDepart / 1000).toFixed(2)} km/s.`);
    } else this.startCruise(0);
    return null;
  }

  /** The transfer as it will be flown from this orbit: burn point, escape and capture legs, true costs. */
  prepareVoyage(plan: TransferPlan): { plan: TransferPlan; geomArr: ParkingGeometry | null } {
    const g = this.currentGeometry(), jd = this.jd;
    const period = this.n > 0 ? (2 * Math.PI) / this.n : Infinity;
    let p = finalizeDeparture(plan, jd, (t) => this.parkState(g, this.phiE + this.n * t), period);
    const ga = BODY[p.to].kind === 'wormhole' || BODY[p.to].GM > 0 ? this.parkingGeometry(p.to, p.jdDepart + p.tof / DAY) : null;
    if (ga) p = finalizeArrival(p, (phi) => this.parkState(ga, phi), ga.phase);
    return { plan: p, geomArr: ga };
  }

  cancelDeparture() {
    if (!this.pending) return;
    this.pending = null;
    this.warp = 1;
    mission.note('Scheduled departure cancelled.');
  }

  /** The departure burn: the ship leaves its parking orbit on the escape leg of the transfer. */
  private startCruise(late: number) {
    const pd = this.pending!;
    this.pending = null;
    const plan = pd.plan;
    this.geomArr = pd.geomArr;
    this.dvUsed += plan.dvDepart;
    this.voyage = plan;
    this.voyageT = late;
    this.mode = 'cruise';
    this.warp = 1;
    this.sky.dome.visible = false;
    this.view.exclude.clear();
    this.view.noShell.clear();
    this.globe.mesh.removeFromParent();
    this.sky.setParams(atmosphereFor({ ...BODY[plan.from], atmosphere: undefined } as BodyDef, this.jd));
    bus.emit('sfx', { id: 'blast', node: this.endurance.root, gain: 0.6 });
    this.game.renderer.shake = 0.004;
    setTimeout(() => { this.game.renderer.shake = 0; }, 6000);
    mission.note(`Departure burn: ${(plan.dvDepart / 1000).toFixed(2)} km/s. Course laid in for ${BODY[plan.to].name}, arrival in ${fmtDuration(plan.tof)}.`);
    mission.setPhase('transit');
    bus.emit('voyage:depart', plan);
    ui.toast(`Departure burn · ${BODY[plan.to].name}`, 'info', 4);
  }

  /** End of the arc: capture burn into the target's parking orbit (or station-keeping at the wormhole). */
  arriveVoyage() {
    const plan = this.voyage;
    if (!plan) return;
    this.voyage = null;
    this.mode = 'orbit';
    this.warp = 1;
    this.dvUsed += plan.dvArrive;
    this.setBody(plan.to, { phase: plan.arrPhase, geom: this.geomArr ?? undefined });
    this.geomArr = null;
    if (this.game.settings.creative.autoRefuel && this.dvUsed > 0) {
      this.dvUsed = 0;
      mission.note('Creative Mode: the Endurance\'s propellant is topped up on arrival.');
    }
    if (this.game.zone === this) this.game.renderer.setLook(this.look());
    mission.note(`Arrived at ${BODY[plan.to].name}${plan.dvArrive > 0 ? `: capture burn ${(plan.dvArrive / 1000).toFixed(2)} km/s` : ''}.`);
    if (BODY[plan.to].kind === 'wormhole') mission.setPhase('saturn');
    bus.emit('voyage:arrive', plan);
    ui.toast(`Arrived · ${BODY[plan.to].name}`, 'info', 5);
  }

  // ------------------------------------------------------------------------------------------- the wormhole
  lens: WormholeLens | null = null;
  private skyNear: THREE.Texture | null = null;
  private skyFar: THREE.Texture | null = null;
  /** the traversal under way: proper distance from the throat (m, signed: > 0 on the side we started from) */
  traverse: { l: number; v: number; manual: boolean; from: string; crossed: boolean; t: number; notes: number } | null = null;

  /** distance of the station from the mouth's throat (proper radial distance) */
  private stationL() { const b0 = this.body.R; return Math.sqrt(Math.max(0, this.rE * this.rE - b0 * b0)); }

  /**
   * Picture the sky around a point of a system (frame: that system's axes) into a cube map: the stars, planets, the
   * Sun or Gargantua, as they are there now. Used by the lens for each universe.
   */
  private captureSky(system: 'sol' | 'gargantua', posSys: V3): THREE.Texture {
    const r = this.game.renderer;
    const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cam = new THREE.CubeCamera(1, 1e7, rt);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);
    const I = new THREE.Matrix4();
    const view = system === this.view.system ? this.view : new SystemView(system);
    const prevParent = view.group.parent;
    view.showSun = system === 'sol';
    view.exposure = r.look.exposure;
    view.update(this.jd, posSys, I, 512 / (Math.PI / 2));
    scene.add(view.group);
    let starsParent: THREE.Object3D | null = null;
    if (system === 'sol') {
      starsParent = this.stars.group.parent;
      const keep = this.rotSys.clone();
      this.rotSys.identity();
      this.orientStars();
      this.rotSys.copy(keep);
      this.stars.setVisibility(1.6, 6.5);
      scene.add(this.stars.group);
    }
    cam.update(r.gl, scene);
    if (starsParent) starsParent.add(this.stars.group);
    if (view === this.view) { view.showSun = false; if (prevParent) prevParent.add(view.group); } else view.dispose();
    return rt.texture;
  }

  /** At a mouth: picture both skies and put the lens in the background scene. */
  private setupLens() {
    const b = this.body;
    if (b.kind !== 'wormhole') { this.lens?.dispose(); this.lens = null; return; }
    const other = BODY[WORMHOLE_PAIR[b.id]];
    this.skyNear = this.captureSky(b.system, state(b.id, this.jd).r);
    this.skyFar = this.captureSky(other.system, state(other.id, this.jd).r);
    if (!this.lens) this.lens = new WormholeLens(b.R);
    if (this.game.zone === this || this.game.zone?.id === 'endurance') this.game.renderer.spaceScene.add(this.lens.mesh);
  }

  /**
   * Identification of the two mouths' directions: the station's outward direction here maps to the other mouth's
   * station direction (so a ship going straight through comes out at the other station, and Gargantua sits at the
   * centre of the sphere seen from the Saturn side).
   */
  private mouthMap(): THREE.Matrix3 {
    const here = this.body, there = BODY[WORMHOLE_PAIR[here.id]];
    const gh = this.parkingGeometry(here.id, this.jd), gt = this.parkingGeometry(there.id, this.jd);
    const a = new THREE.Vector3(...this.parkState(gh, gh.phase).r).normalize();
    const c = new THREE.Vector3(...this.parkState(gt, gt.phase).r).normalize();
    return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(a, c)));
  }

  /** Begin the passage through the wormhole from the station at either mouth (automatic or manual speed). */
  startTraversal(manual = false): string | null {
    if (this.body.kind !== 'wormhole') return 'Not at the wormhole.';
    if (this.mode !== 'orbit' || this.traverse) return 'The ship is busy.';
    for (const c of [this.ranger, this.ranger2]) if (c && !this.docking.isDocked(c)) return `${c === this.ranger ? 'Ranger 1' : 'Ranger 2'} is not docked.`;
    this.traverse = { l: this.stationL(), v: 0, manual, from: this.body.id, crossed: false, t: 0, notes: 0 };
    mission.note(`${manual ? 'Manual' : 'Automatic'} approach to the wormhole: ${(this.stationL() / 1000).toFixed(1)} km to the throat.`);
    bus.emit('sfx', { id: 'chime', ui: true });
    return null;
  }

  /** advance the passage (fixed step); the ship's own frame stays at the origin, the mouth moves */
  traverseStep(dt: number) {
    const T = this.traverse!, b0 = this.body.R;
    T.t += dt;
    const aMax = 25;   // m/s^2: the Endurance's drive, gently
    if (T.manual) {
      const inp = this.game.input;
      if (inp.down('throttleUp')) T.v = Math.min(900, T.v + aMax * dt);
      if (inp.down('throttleDown')) T.v = Math.max(-200, T.v - aMax * dt);
    } else {
      // cruise in at up to 700 m/s, easing to 180 m/s through the throat region, then away to the far station
      const dist = T.crossed ? this.stationL() - T.l : T.l;
      const want = Math.min(700, 180 + Math.max(0, Math.abs(T.crossed ? T.l : T.l) - 2 * b0) * 0.06, Math.sqrt(2 * aMax * 0.5 * Math.max(dist, 0)) + 20);
      T.v += Math.max(-aMax * dt, Math.min(aMax * dt, want - T.v));
    }
    // signed: before the throat l decreases toward 0; after it l grows again from the other mouth
    if (!T.crossed) {
      T.l -= T.v * dt;
      if (T.l <= 0) {
        T.crossed = true;
        T.l = -T.l;
        this.crossThroat();
      } else if (T.l > this.stationL() * 1.02 && T.manual && T.v < 0) { this.traverse = null; mission.note('Approach to the wormhole aborted; back at the station.'); return; }
    } else {
      T.l += T.v * dt;
      if (T.l >= this.stationL()) {
        this.traverse = null;
        this.game.renderer.shake = 0;
        mission.note(`Through the wormhole: holding station ${(this.stationL() / 1000).toFixed(0)} km from the ${this.body.name.toLowerCase()}.`);
        ui.toast(this.body.system === 'gargantua' ? 'Through the wormhole · Gargantua system' : 'Through the wormhole · Saturn', 'good', 6);
        return;
      }
    }
    // the passage shakes the ship hardest in the throat (tidal stress of the curved space is small; the drive and
    // the structure ring), instruments lose their references near the throat
    const near = Math.exp(-((T.l / (3 * b0)) ** 2));
    this.game.renderer.shake = 0.0015 + 0.012 * near;
    if (near > 0.2 && T.notes === 0) { T.notes = 1; ui.toast('Star tracker: no lock · navigation references lost', 'warn', 4); bus.emit('sfx', { id: 'caution', ui: true }); }
    if (near > 0.6 && T.notes === 1) { T.notes = 2; ui.toast('Structural load · ring vibration', 'warn', 3); bus.emit('sfx', { id: 'blast', node: this.endurance.root, gain: 0.8 }); }
  }

  /** At the throat: the other universe becomes this one. */
  private crossThroat() {
    const from = this.body.id, to = WORMHOLE_PAIR[from];
    this.setBody(to);
    mission.setPhase(to === 'gate' ? 'gargantua' : 'saturn');
    bus.emit('sfx', { id: 'blast', node: this.endurance.root, gain: 1 });
    this.game.renderer.flash.set(0.12, 0.13, 0.15);
    this.flashFade = true;
  }

  /** the throat's flash fades over about half a second */
  private flashFade = false;

  /** Through the wormhole at once (the passage skipped: Creative fast travel). */
  traverseWormhole() {
    const other = WORMHOLE_PAIR[this.body.id];
    if (!other) return;
    this.setBody(other);
    mission.setPhase(other === 'gate' ? 'gargantua' : 'saturn');
  }

  /** the lens for this frame: the mouth below the station (or wherever the passage has taken us) */
  private placeLens(local: THREE.Vector3) {
    const L = this.lens;
    if (!L || this.body.kind !== 'wormhole') return;
    const l = this.traverse ? this.traverse.l : this.stationL();
    const b0 = this.body.R;
    const rc = Math.sqrt(b0 * b0 + l * l);
    const rel = new THREE.Vector3(0, -rc, 0).sub(local);
    if (this.skyRotation) rel.applyQuaternion(this.skyRotation);
    L.place(Math.max(rel.length() > rc ? Math.sqrt(Math.max(0, rel.lengthSq() - b0 * b0)) : l, 0), rel);
    const zoneToNear = new THREE.Matrix3().setFromMatrix4(_m4.extractRotation(this.rotSys)).transpose();
    const M = this.mouthMap();
    L.setSkies(this.skyNear!, this.skyFar!, zoneToNear, M);
    // during the passage the other universe's light fills more and more of the view
    if (this.traverse) {
      const there = BODY[WORMHOLE_PAIR[this.body.id]];
      const k = Math.exp(-((l / (4 * b0)) ** 2)) * 0.5;
      const e = Math.exp(Math.log(this.exposure()) * (1 - k) + Math.log(exposureFor(irradianceAt(there.id, this.jd))) * k);
      this.game.renderer.setLook({ ...this.look(), exposure: e });
    }
  }

  /** Cruise: frame along the velocity, the whole system placed from the ship's true position. */
  private updateSkyCruise() {
    const plan = this.voyage!;
    const p = voyagePosition(plan, this.voyageT);
    let r: V3, v: V3;
    if (p) { r = p.r; v = p.v; } else {
      // slingshot legs beyond the wormhole: a smooth arc between the two orbits (fiction, see Voyage.ts)
      const f = Math.min(1, this.voyageT / plan.tof), e = f * f * (3 - 2 * f);
      const a = state(plan.from, plan.jdDepart).r, b = state(plan.to, plan.jdDepart + plan.tof / DAY).r;
      r = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
      v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    }
    this.cruiseShip = r;
    const X = this.cruiseAxes.X.set(v[0], v[1], v[2]).normalize();
    const north = new THREE.Vector3(0, 0, 1);
    const Y = this.cruiseAxes.Y.copy(north).addScaledVector(X, -north.dot(X));
    if (Y.lengthSq() < 1e-8) Y.set(0, 1, 0);
    Y.normalize();
    this.cruiseAxes.Z.crossVectors(X, Y);
    const Z = this.cruiseAxes.Z;
    this.rotSys.set(X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, 0, 0, 0, 1);
    this.finishRot();
    const tl = toLight(r, this.voyage ? BODY[this.voyage.to].system : this.body.system);
    const sun = _s.set(tl[0], tl[1], tl[2]).normalize().applyMatrix4(_m4.extractRotation(this.rotSys));
    this.sunLocal.copy(sun);
    this.sunView.copy(sun);
    this.sky.lightRotation = null;
    this.sky.setSunDirection(sun);
    this.sky.params.sunE = 20 * this.irradiance();
    this.earthCentre.set(0, -1e12, 0);
    this.orientStars();
  }

  // ------------------------------------------------------------------------------------------- landing flights
  /** Ranger 1's guided descent or ascent while it is in this zone's view (the frame rides with it) */
  flightProg: FlightProgram | null = null;
  private enduranceBaseQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

  /** the Endurance's LVLH axes (system frame) and state, for converting the Ranger's relative state */
  private lvlh() {
    const g = this.currentGeometry();
    const e = this.parkState(g, this.phiE);
    const Y = unit(e.r), X = unit(sub(e.v, scale(Y, dot(e.v, Y)))), Z = cross(X, Y);
    // the frame turns about the orbit normal (-Z) once per orbit
    return { e, X, Y, Z, w: scale(Z, -this.n) };
  }

  /** a zone (LVLH) state near the Endurance -> body-centred inertial (system axes) */
  lvlhToInertial(p: THREE.Vector3, v: THREE.Vector3) {
    const L = this.lvlh();
    const rel = add(add(scale(L.X, p.x), scale(L.Y, p.y)), scale(L.Z, p.z));
    const vr = add(add(scale(L.X, v.x), scale(L.Y, v.y)), scale(L.Z, v.z));
    return { r: add(L.e.r, rel), v: add(add(L.e.v, vr), cross(L.w, rel)) };
  }

  /** Start the automatic landing from near the Endurance (the descent staging point). */
  beginDescent(): string | null {
    const b = this.body, c = this.ranger!;
    if (!b.landing) return `${b.name} has no landing site the Ranger can reach.`;
    if (this.mode !== 'orbit') return 'Not in orbit.';
    if (b.station && b.surveyAlt && Math.abs(parkAlt(b) - b.surveyAlt) > 1000) return `${b.station.name} is reached from the ${(b.surveyAlt / 1000).toFixed(0)} km survey orbit: bring the Endurance down first (Ranger docked).`;
    if (this.docking.linkOf(c)) return 'Undock first: the descent starts from the staging point near the Endurance.';
    const pos = c.position(new THREE.Vector3()).sub(c.comModel.clone().applyQuaternion(c.quaternion(new THREE.Quaternion())));
    if (pos.length() > 8000) return 'Too far from the Endurance: the descent is planned from the staging point within 8 km.';
    const s = this.lvlhToInertial(pos, c.velocity(new THREE.Vector3()));
    const jd0 = this.jd;
    const site = siteFunction(b, jd0);
    const perf = rangerPerf(RANGER_SPEC, this.rangerFuel);
    // land in daylight: the Sun (or Gargantua's light) at least 6 degrees above the site's horizon
    const daylight = (t: number) => {
      const jd = jd0 + t / 86400, st = site(t), bp = state(b.id, jd).r;
      const toSun = unit(scale(add(bp, st.r), -1));
      return dot(toSun, st.up) > Math.sin((6 * Math.PI) / 180);
    };
    let plan = planDescent(b, s.r, s.v, perf, site, { ok: daylight });
    let dark = false;
    if (!plan) { plan = planDescent(b, s.r, s.v, perf, site); dark = true; }
    if (!plan) return 'No landing window within the next month: the site never passes under the orbit.';
    if (dark) mission.note(`No daylight landing window at ${b.landing.site} within a month (polar night or a slow day): landing in darkness.`);
    const f = new GuidedFlight(b, s.r, s.v, perf, 'descent', site);
    f.infiniteFuel = this.game.settings.creative.unlimitedResources;
    f.armDescent(plan.tDeorbit, plan.rp);
    const pr = new FlightProgram('descent', f, b, jd0, this.met);
    this.startFlight(pr);
    mission.note(`Automatic landing at ${b.landing.site}: deorbit burn in ${(plan.tDeorbit / 60).toFixed(0)} min (periapsis ${((plan.rp - b.R) / 1000).toFixed(0)} km).`);
    return null;
  }

  /** set while an automatic landing waits for Ranger 1 to back away from its port (seconds since release) */
  private autoLanding: { t: number } | null = null;

  /**
   * The whole way down from one button of the Ranger's flight computer, docked or not. At a giant the Endurance
   * first takes Ranger 1 (docked) down to the survey orbit its station is reached from; then the latches release,
   * the Ranger backs away from the port to the staging point and the computer flies the descent (beginDescent).
   */
  landFromShip(): string | null {
    const b = this.body, c = this.ranger!;
    if (!b.landing) return `${b.name} has no landing site the Ranger can reach.`;
    if (this.mode !== 'orbit') return 'Not in orbit.';
    if (this.autoLanding) return null;
    const link = this.docking.linkOf(c);
    if (link && link.state !== 'docked') return 'Docking in progress: wait for the latches.';
    if (b.station && b.surveyAlt && Math.abs(parkAlt(b) - b.surveyAlt) > 1000) {
      if (!link) return `${b.station.name} is reached from the ${(b.surveyAlt / 1000).toFixed(0)} km survey orbit: dock with the Endurance first, it takes Ranger 1 down.`;
      const e = this.changeOrbit(b.surveyAlt);
      if (e) return e;
      ui.toast(`Endurance in the ${(b.surveyAlt / 1000).toFixed(0)} km survey orbit · undocking for the descent to ${b.station.name}`, 'info', 6);
    }
    if (!link) return this.beginDescent();
    this.autoLanding = { t: 0 };
    mission.note(`Automatic landing at ${b.landing.site}: Ranger 1 undocking from the Endurance.`);
    return null;
  }

  /** the automatic landing: once the Ranger is free and clear of the port, the descent program takes over */
  private autoLandStep(dt: number) {
    const a = this.autoLanding, c = this.ranger;
    if (!a || !c) return;
    if (this.mode !== 'orbit') { this.autoLanding = null; return; }
    // release the latches (as soon as the link is fully docked), then wait while the push carries the Ranger clear
    const l = this.docking.linkOf(c);
    if (l) { if (l.state === 'docked') this.docking.undock(c, 0.8); return; }
    a.t += dt;
    if (a.t < 5) return;
    this.autoLanding = null;
    const e = this.beginDescent();
    if (e) ui.toast(e, 'warn', 6);
  }

  /**
   * Move the Endurance between its parking orbit and another circular altitude round the same body (at a giant: the
   * low survey orbit the stations are reached from). A Hohmann transfer: the cost in drive delta-v and the half-orbit
   * it takes are shown before it is flown; time passes on all the clocks. The Rangers must be aboard.
   */
  orbitChange(alt: number) {
    const b = this.body, mu = b.GM;
    const r1 = this.rE, r2 = b.R + alt;
    const a = (r1 + r2) / 2;
    const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
    const vp = Math.sqrt(mu * (2 / r1 - 1 / a)), va = Math.sqrt(mu * (2 / r2 - 1 / a));
    return { dv: Math.abs(vp - v1) + Math.abs(v2 - va), time: Math.PI * Math.sqrt(a ** 3 / mu) };
  }

  changeOrbit(alt: number): string | null {
    const b = this.body;
    if (this.mode !== 'orbit' || this.pending) return 'Not in a parking orbit.';
    if (this.ranger && !this.docking.isDocked(this.ranger)) return 'Ranger 1 must be docked before the Endurance changes orbit.';
    const { dv, time } = this.orbitChange(alt);
    if (dv > ENDURANCE_DV - this.dvUsed) return `Not enough delta-v: the transfer needs ${(dv / 1000).toFixed(1)} km/s.`;
    this.dvUsed += dv;
    if (this.game.settings.creative.unlimitedResources) this.dvUsed -= dv;
    // the half-orbit passes (the clocks move on); the new orbit is laid over the station's site again
    this.earthOffset += time * (this.dilation() - 1);
    this.met += time;
    if (Math.abs(alt - b.parkingAlt) < 1) delete parkingOverride[b.id]; else parkingOverride[b.id] = alt;
    this.setBody(b.id);
    mission.note(`Endurance transferred to a ${(alt / 1000).toFixed(0)} km orbit round ${b.name}: ${(dv / 1000).toFixed(2)} km/s, ${fmtDuration(time)}.`);
    return null;
  }

  /** The ascent program arriving from the surface a few kilometres up. */
  takeFlight(pr: FlightProgram) {
    // the Endurance has stayed in its parking orbit (re-laying it would move the ship)
    if (this.body.id !== pr.body.id) this.setBody(pr.body.id);
    this.startFlight(pr);
  }

  private boosterModel: Model | null = null;
  private boosterDebris: { obj: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number } | null = null;

  /** the ascent booster on the Ranger while it is attached; dropped, it tumbles away and falls back */
  private async showBooster(pr: FlightProgram) {
    const st = pr.body.station;
    if (!st || !pr.f.staged) return;
    if (!this.boosterModel) this.boosterModel = await assets.load('booster');
    const m = this.boosterModel, c = this.ranger!;
    m.root.scale.setScalar(Math.cbrt(st.booster.fuel / 62000));
    m.root.position.set(0, 0, 0); m.root.quaternion.identity();
    c.model.root.add(m.root);
    pr.f.onJettison = () => {
      c.model.root.updateMatrixWorld(true);
      const wp = m.root.getWorldPosition(new THREE.Vector3()), wq = m.root.getWorldQuaternion(new THREE.Quaternion());
      this.root.add(m.root);
      m.root.position.copy(wp); m.root.quaternion.copy(wq);
      const down = new THREE.Vector3(0, -1, 0);
      this.boosterDebris = { obj: m.root, v: down.multiplyScalar(6), w: new THREE.Vector3(0.05, 0.02, 0.08), t: 0 };
      bus.emit('sfx', { id: 'clamp', node: c.root, gain: 1 });
      mission.note('Booster separation: the empty pods fall back into the clouds.');
    };
  }

  private updateDebris(dt: number) {
    const d = this.boosterDebris;
    if (!d) return;
    d.t += dt;
    // in the frame riding with the Ranger the spent booster falls behind and below (drag, no thrust)
    d.v.y -= 3 * dt; d.v.x -= 2 * dt;
    d.obj.position.addScaledVector(d.v, dt);
    d.obj.rotateX(d.w.x * dt); d.obj.rotateZ(d.w.z * dt);
    if (d.t > 40) { d.obj.removeFromParent(); this.boosterDebris = null; }
  }

  private startFlight(pr: FlightProgram) {
    const c = this.ranger!;
    const id = pr.body.id;
    void this.showBooster(pr);
    this.plasma?.setGas((id === 'titan' ? 'titan' : id === 'venus' || id === 'mars' ? 'co2' : 'air') as PlasmaGas);
    this.flightProg = pr;
    this.mode = 'flight';
    this.docking.detachNow(c);
    c.root.visible = true;
    c.setCarried(true);
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== c) { if (flight.craft) flight.leave(true); flight.enter(c, this.env, 'pilot_l'); }
    flight.engage(new ProgramPilot(pr));
    this.flightPose(true);
  }

  private flightStep(dt: number) {
    const pr = this.flightProg!, f = pr.f;
    pr.step(dt);
    this.syncLocal(pr.met0 + f.t, pr.body.id, f.height);
    this.flightPose();
    if (pr.kind === 'descent' && (f.phase === 'braking' || f.phase === 'terminal') && f.height < HANDOVER_ALT && f.rangeTo(f.site(f.t).r) < 14000) {
      // the ground is close enough to be drawn in detail: the surface zone takes over
      this.flightProg = null;
      this.mode = 'orbit';
      this.rangerFuel = f.fuel;
      this.ranger!.root.visible = false;
      this.game.renderer.shake = 0;
      this.plasma?.update(0, 0, _v.set(0, 0, 0), _v, 1);
      this.resetEndurancePose();
      void this.game.gotoZone('surface', { fade: false, onEnter: (z) => (z as SurfaceZone).takeOver(pr) });
      return;
    }
    if (pr.kind === 'ascent' && f.phase === 'done') this.finishAscent();
  }

  /** Back in the Endurance's frame a kilometre or so behind it: the docking autopilot takes over. */
  private finishAscent() {
    const pr = this.flightProg!, f = pr.f, c = this.ranger!;
    const L = this.lvlh();
    const rel = sub(f.r, L.e.r);
    const vr = sub(sub(f.v, L.e.v), cross(L.w, rel));
    const p = new THREE.Vector3(dot(rel, L.X), dot(rel, L.Y), dot(rel, L.Z));
    const v = new THREE.Vector3(dot(vr, L.X), dot(vr, L.Y), dot(vr, L.Z));
    this.rangerFuel = f.fuel;
    this.flightProg = null;
    this.mode = 'orbit';
    this.game.renderer.shake = 0;
    this.resetEndurancePose();
    const q = c.quaternion(new THREE.Quaternion());
    c.setCarried(false);
    c.place(p, q, v);
    c.throttle = 0; c.lift = 0; c.plumeWhileCarried = false;
    this.sky.dome.visible = this.sky.enabled && this.skyDome();
    mission.note(`Rendezvous: ${(p.length() / 1000).toFixed(2)} km from the Endurance, ${v.length().toFixed(1)} m/s relative. Automatic docking.`);
    this.engageAutoDock();
  }

  private resetEndurancePose() {
    this.endurance.root.position.set(0, 0, 0);
    this.endurance.root.quaternion.copy(this.enduranceBaseQ);
    this.endurance.root.visible = true;
    this.endurance.root.updateMatrixWorld(true);
  }

  /** zone frame on the flying Ranger: Y up from the body centre, X along the horizontal velocity */
  private flightPose(snap = false) {
    const f = this.flightProg!.f, c = this.ranger!;
    const Y = unit(f.r);
    let X = sub(f.v, scale(Y, dot(f.v, Y)));
    X = norm(X) > 1e-3 ? unit(X) : unit(cross([0, 0, 1], Y));
    const Z = cross(X, Y);
    this.cruiseAxes.X.set(...X); this.cruiseAxes.Y.set(...Y); this.cruiseAxes.Z.set(...Z);
    const toZ = (v: V3, out: THREE.Vector3) => out.set(dot(v, X), dot(v, Y), dot(v, Z));
    const att = f.attitude();
    const fwd = toZ(att.fwd, new THREE.Vector3()).normalize(), up = toZ(att.up, new THREE.Vector3()).normalize();
    const back = fwd.clone().negate();
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, back).normalize(), up, back);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (!snap) q.copy(c.quaternion(new THREE.Quaternion()).slerp(q, Math.min(1, 0.06 * Math.max(1, this.flightProg!.warp()))));
    // the Ranger sits at the frame origin (its velocity is the frame's: zero relative)
    const p0 = new THREE.Vector3(0, 0, 0);
    if (snap) c.place(p0, q); else c.carry(p0, q, p0);
    c.plumeWhileCarried = f.throttle > 0.002;
    c.throttle = att.engines === 'main' ? f.throttle : 0;
    c.lift = att.engines === 'lift' ? f.throttle : 0;
    this.entryHeat = f.heat;
    // the Endurance where it really is, relative to the Ranger (hidden beyond 60 km)
    const L = this.lvlh();
    const rel = sub(L.e.r, f.r);
    const d = norm(rel);
    const er = this.endurance.root;
    er.visible = d < 60000;
    toZ(d < 60000 ? rel : scale(rel, 60000 / d), er.position);
    // its attitude: the LVLH orientation carried into this frame
    const mL = new THREE.Matrix4().set(dot(L.X, X), dot(L.Y, X), dot(L.Z, X), 0, dot(L.X, Y), dot(L.Y, Y), dot(L.Z, Y), 0, dot(L.X, Z), dot(L.Y, Z), dot(L.Z, Z), 0, 0, 0, 0, 1);
    er.quaternion.setFromRotationMatrix(mL).multiply(this.enduranceBaseQ);
    er.updateMatrixWorld(true);
  }

  /** entry heating 0..1 for the plasma effects */
  entryHeat = 0;
  private plasma: EntryPlasma | null = null;

  /** the entry glow, buffeting and roar of the flight through the air */
  private entryEffects(dt: number) {
    const pl = this.plasma, g = this.game;
    if (!pl) return;
    const pr = this.mode === 'flight' ? this.flightProg : null;
    if (!pr) { if (pl.glow > 0) pl.update(dt, 0, _v.set(0, 0, 0), _v, 1); return; }
    const f = pr.f, { X, Y, Z } = this.cruiseAxes;
    const a = f.airVel();
    const flow = new THREE.Vector3(a[0] * X.x + a[1] * X.y + a[2] * X.z, a[0] * Y.x + a[1] * Y.y + a[2] * Y.z, a[0] * Z.x + a[1] * Z.y + a[2] * Z.z);
    pl.update(dt, f.heat, flow, this.ranger!.root.position, g.renderer.look.exposure);
    // the hull lit by the sheath (from the cockpit the light would leak through the cabin walls)
    if ((g.services.flight as Flight).cam === 'cockpit') pl.light.intensity = 0;
    // buffeting with the dynamic pressure (peaks of ~10-20 kPa in a lifting entry)
    g.renderer.shake = Math.min(0.006, f.q / 4e6 + pl.glow * 0.0012);
  }

  /** sky, Sun and stars around the flying Ranger */
  private updateSkyFlight() {
    const f = this.flightProg!.f;
    const bp = state(this.body.id, this.jd).r;
    this.cruiseShip = add(bp, f.r);
    const { X, Y, Z } = this.cruiseAxes;
    this.rotSys.set(X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, 0, 0, 0, 1);
    this.finishRot();
    const tl = toLight(this.cruiseShip, this.body.system);
    const sun = _s.set(tl[0], tl[1], tl[2]).normalize().applyMatrix4(_m4.extractRotation(this.rotSys));
    this.sunLocal.copy(sun);
    this.sunView.copy(sun);
    this.sky.lightRotation = null;
    this.sky.setSunDirection(sun);
    this.earthCentre.set(0, -norm(f.r), 0);
    this.orientStars();
  }

  look() { return { exposure: this.exposure(), saturation: 1.12, contrast: 1.2, bloom: 0.7, aoIntensity: 1.6, aoRadius: 1.6 }; }

  /** exposure for the local sunlight (Saturn: 1/90 of the Earth's) */
  exposure() { return this.body.id === 'earth' && this.mode !== 'cruise' ? 0.95 : exposureFor(this.irradiance()); }

  /** sunlight here relative to 1 au (the ship's true position in cruise) */
  irradiance() {
    if (this.mode === 'cruise' && this.voyage) {
      const to = BODY[this.voyage.to];
      if (to.system !== 'sol') return to.insolation ?? 0.3;
      const r = this.cruiseShip;
      const d = Math.hypot(r[0], r[1], r[2]);
      return d > 0 ? (AU / d) ** 2 : 1;
    }
    return this.body.id === 'earth' ? 1 : irradianceAt(this.body.id, this.jd);
  }

  /** eye adaptation follows the sunlight (off inside the ship, where the cabin lights set it) */
  adaptLook = true;
  private lookT = 0;

  /** Ranger 1's propellant while it is away from the Endurance (kg) */
  rangerFuel = RANGER_SPEC.fuelMax;
  /** the Endurance's clock minus the player's (met): grows while the player is deeper in Gargantua's well */
  endOffset = 0;
  get enduranceT() { return this.met + this.endOffset; }

  /**
   * Dilation where the player is, away from the Endurance: on Miller's planet the near-horizon value (one hour =
   * seven years); elsewhere the world's navigation-radius value. Descending to Miller it ramps in with depth
   * (fiction: the game keeps the Endurance in orbit near the planet, see docs/SPACE.md).
   */
  localDilation(bodyId: string, height = 0) {
    const b = BODY[bodyId];
    if (b.system !== 'gargantua') return 1;
    const far = dilationAt({ rOverM: (b.orbit?.a ?? 300 * R_G) / R_G });
    if (bodyId !== 'miller') return far;
    const deep = kerrCircularDilation(MILLER_R);
    const k = Math.max(0, Math.min(1, 1 - height / (b.parkingAlt || 1)));
    return Math.exp(Math.log(far) + (Math.log(deep) - Math.log(far)) * k * k);
  }

  /** The player's clock moves to metNew away from the ship: the Endurance's and Earth's clocks run at their rates. */
  syncLocal(metNew: number, bodyId: string, height = 0) {
    const d = metNew - this.met;
    if (d <= 0) return;
    const D = this.localDilation(bodyId, height), De = this.dilation();
    this.met = metNew;
    this.earthOffset += d * (D - 1);
    this.endOffset += d * (D / De - 1);
  }
  advanceLocal(dt: number, bodyId: string) { this.syncLocal(this.met + dt, bodyId); }

  /**
   * Coordinate (Earth-reference) seconds per second of the Endurance's clock where it is. Far from Gargantua the
   * weak-field value 1/sqrt(1 - 3M/r) at the navigation radius; Miller's near-horizon factor applies on the planet
   * itself (see the surface zone and docs/SPACE.md).
   */
  dilation() {
    const v = this.voyage;
    const inG = (id: string) => BODY[id].system === 'gargantua';
    const rOf = (id: string) => (BODY[id].orbit?.a ?? 300 * R_G) / R_G;
    if (this.mode === 'cruise' && v) {
      if (!inG(v.to) || !inG(v.from)) return 1;
      const f = Math.min(1, this.voyageT / v.tof);
      return dilationAt({ rOverM: rOf(v.from) + (rOf(v.to) - rOf(v.from)) * f });
    }
    return inG(this.body.id) ? dilationAt({ rOverM: rOf(this.body.id) }) : 1;
  }

  /** the HUD clocks shared by every zone aboard (the bridge displays read the same values) */
  missionClocks(): { label: string; value: string }[] {
    if (this.traverse && Math.abs(this.traverse.l) < 4 * this.body.R) {
      // instrument anomaly in the throat: the clock references disagree and the readouts scramble
      const junk = () => Array.from({ length: 8 }, (_, i) => (i === 2 || i === 5 ? ':' : '0123456789#'[Math.floor(Math.random() * 11)])).join('');
      return [{ label: 'MET', value: junk() }, { label: 'NAV', value: 'NO LOCK' }];
    }
    const split = Math.abs(this.endOffset) > 60, earth = Math.abs(this.earthOffset) > 60;
    const out = [{ label: split || earth ? 'LOCAL' : 'MET', value: fmtClock(this.met) }];
    if (split) out.push({ label: 'ENDURANCE', value: fmtClock(this.enduranceT) });
    if (earth) out.push({ label: 'EARTH', value: fmtClock(this.earthT) });
    if (this.mode === 'cruise' && this.voyage) {
      out.push({ label: 'ETA', value: fmtDuration(Math.max(0, this.voyage.tof - this.voyageT)) });
      out.push({ label: 'TO GO', value: fmtDistance(distanceRemaining(this.voyage, this.voyageT)) });
    }
    if (this.warp > 1) out.push({ label: 'TIME', value: `×${this.warp}` });
    return out;
  }

  /**
   * The parking orbit setBody lays out round a body at a date: over the landing site (the plane through the site
   * and its local east, so the inclination equals the site's latitude), else a 22 deg orbit starting on the
   * morning side. Pure: used to plan an arrival before the ship gets there.
   */
  parkingGeometry(id: string, jd: number): ParkingGeometry {
    const b = BODY[id];
    const rE = b.R + parkAlt(b), n = b.GM > 0 ? Math.sqrt(b.GM / rE ** 3) : 0;
    const { e1, e2, n: nn } = equatorBasis(id);
    const bci = { e1: new THREE.Vector3(...e1), e2: new THREE.Vector3(...e2), n: new THREE.Vector3(...nn) };
    const toB = (v: THREE.Vector3) => new THREE.Vector3(v.dot(bci.e1), v.dot(bci.e2), v.dot(bci.n));
    if (id === 'earth') return { plane: new OrbitPlane(LAUNCH_SITE.lat, LAUNCH_SITE.lon, this.theta0), bci, rE, n, phase: 0 };
    if (b.landing) {
      // lay the orbit over the site as it will be at its next mid-morning (sun 25-35 deg up), so the site passes
      // beneath the ship in daylight that day rather than at the same dark hour every rotation
      const elev = (j: number) => {
        const rel = surfacePoint(id, b.landing!.lat, b.landing!.lon, j), bp = state(id, j).r;
        const u = unit(rel), toSun = unit(scale(add(bp, rel), -1));
        return Math.asin(dot(u, toSun));
      };
      const span = Math.min(Math.abs(b.rotation || 86400 * 30), 86400 * 30) / 86400;
      let jdDay = jd;
      for (let k = 0; k < 200; k++) {
        const j0 = jd + (span * k) / 200, j1 = jd + (span * (k + 1)) / 200;
        if (elev(j0) < 0.5 && elev(j1) >= 0.5) { jdDay = j1; break; }
      }
      const site = surfacePoint(id, b.landing.lat, b.landing.lon, jdDay);
      const sv = new THREE.Vector3(site[0], site[1], site[2]).normalize();
      // the site's own direction of motion (east for a prograde spin, west for Venus): the orbit runs with it
      const sp = surfacePoint(id, b.landing.lat, b.landing.lon, jdDay + 60 / 86400);
      const east = new THREE.Vector3(sp[0] - site[0], sp[1] - site[1], sp[2] - site[2]);
      if (east.lengthSq() < 1e-8) east.crossVectors(bci.n, sv);
      east.addScaledVector(sv, -east.dot(sv)).normalize();
      return { plane: OrbitPlane.fromVectors(toB(sv), toB(east)), bci, rE, n, phase: -0.35 };
    }
    const bp = state(id, jd).r;
    if (b.kind === 'wormhole') {
      // hold station on the light's side of the mouth (sunward at Saturn, toward Gargantua beyond)
      const tl = toLight(bp, b.system);
      const P = toB(new THREE.Vector3(tl[0], tl[1], tl[2]).normalize());
      const E = new THREE.Vector3(0, 0, 1).cross(P);
      if (E.lengthSq() < 1e-6) E.set(1, 0, 0);
      return { plane: OrbitPlane.fromVectors(P, E.normalize()), bci, rE, n, phase: 0 };
    }
    const sun = toB(new THREE.Vector3(-bp[0], -bp[1], -bp[2]).normalize());
    const pole = new THREE.Vector3(0, 0, 1);
    const P = sun.addScaledVector(pole, -sun.dot(pole)).normalize().applyAxisAngle(pole, -0.6);
    const inc = (22 * Math.PI) / 180;
    const E = new THREE.Vector3().crossVectors(pole, P).multiplyScalar(Math.cos(inc)).addScaledVector(pole, Math.sin(inc));
    // start ~70 deg past the node: about 20 deg above the equator (ring) plane, still in daylight
    return { plane: OrbitPlane.fromVectors(P, E), bci, rE, n, phase: 1.2 };
  }

  /** State on a parking orbit at in-plane angle phi, relative to the body, in the system frame. */
  parkState(g: ParkingGeometry, phi: number): ParkState {
    const p = g.plane.eci(g.rE, phi, new THREE.Vector3());
    const v = g.plane.eci(g.n * g.rE, phi + Math.PI / 2, new THREE.Vector3());
    const B = g.bci;
    const sys = (x: THREE.Vector3): V3 => [x.x * B.e1.x + x.y * B.e2.x + x.z * B.n.x, x.x * B.e1.y + x.y * B.e2.y + x.z * B.n.y, x.x * B.e1.z + x.y * B.e2.z + x.z * B.n.z];
    return { r: sys(p), v: sys(v) };
  }

  /** the orbit the ship is in now */
  currentGeometry(): ParkingGeometry {
    const { e1, e2, n: nn } = equatorBasis(this.body.id);
    const bci = this.body.id === 'earth' ? { e1: new THREE.Vector3(...e1), e2: new THREE.Vector3(...e2), n: new THREE.Vector3(...nn) } : { e1: this.bci.e1.clone(), e2: this.bci.e2.clone(), n: this.bci.n.clone() };
    return { plane: this.plane, bci, rE: this.rE, n: this.n, phase: this.phiE };
  }

  /**
   * Put the Endurance in its parking orbit around a body. For a world with a landing site the orbit plane is laid
   * over the site (the plane through the site and its local east, so the inclination equals the site's latitude);
   * otherwise it is equatorial. The ship starts a little behind the point over the site.
   */
  setBody(id: string, opts: { phase?: number; geom?: ParkingGeometry } = {}) {
    const b = BODY[id];
    this.body = b;
    this.rE = b.R + parkAlt(b);
    this.n = Math.sqrt(b.GM / (this.rE ** 3));
    if (id === 'earth') { this.setLaunch(this.day, this.hours); }
    else {
      const g = opts.geom ?? this.parkingGeometry(id, this.jd);
      this.bci.e1.copy(g.bci.e1); this.bci.e2.copy(g.bci.e2); this.bci.n.copy(g.bci.n);
      this.plane = g.plane;
      this.phiE0 = (opts.phase ?? g.phase) - this.n * this.met;
    }
    if (this.view.system !== b.system) {
      this.view.dispose();
      this.view = new SystemView(b.system);
      this.view.showSun = false;
      if (this.game.zone === this || this.game.zone?.id === 'endurance') this.game.renderer.spaceScene.add(this.view.group);
    }
    this.view.exclude.clear();
    if (id === 'earth') this.view.exclude.add('earth');
    this.view.jdRef = 0;
    if (this.game.zone === this) {
      if (id === 'earth') this.game.renderer.spaceScene.add(this.globe.mesh); else this.globe.mesh.removeFromParent();
    }
    this.sky.setParams(id === 'earth' ? { ...this.sky.params } : atmosphereFor(b, this.jd));
    // the sky model's limb is for low orbits round rocky worlds with air; giants and airless bodies are drawn whole
    // by the system view (the sky keeps lighting the ship)
    this.view.noShell.clear();
    if (this.skyDome()) this.view.noShell.add(id);
    this.sky.setStars(0);
    this.sky.invalidate();
    this.sky.dome.visible = this.sky.enabled && this.skyDome();
    if (this.game.zone === this) this.game.renderer.setLook(this.look(), true);
    if (this.loaded || this.view) this.refreshLens();
  }

  /** at a wormhole mouth (or leaving one): the lens and the two skies */
  private refreshLens() {
    if (this.body.kind === 'wormhole') this.setupLens();
    else if (this.lens) { this.lens.dispose(); this.lens = null; }
  }

  /** whether the physical sky dome draws the atmosphere seen from this orbit */
  skyDome() { return this.body.id === 'earth' || (this.body.kind === 'rocky' && !!this.body.atmosphere); }

  /** system-frame vector -> body-centred inertial (equatorial) coordinates */
  private toBci(v: THREE.Vector3, out: THREE.Vector3) { return out.set(v.dot(this.bci.e1), v.dot(this.bci.e2), v.dot(this.bci.n)); }

  get phiE() { return this.phiE0 + this.n * this.met; }
  get theta() { return this.theta0 + OMEGA_EARTH * this.met; }

  override enter() {
    super.enter();
    const g = this.game;
    g.renderer.spaceScene.add(this.stars.group, this.view.group);
    if (this.body.id === 'earth') g.renderer.spaceScene.add(this.globe.mesh);
    if (this.lens) g.renderer.spaceScene.add(this.lens.mesh);
    this.sky.setVisible(true);
    this.sky.dome.visible = this.skyDome();
    g.renderer.preRender.push(this.place);
    g.renderer.setLook(this.look(), true);
    // dark sky: environment from the sky bake (black above, earthshine below)
    this.sky.invalidate();
    const flight = g.services.flight as Flight;
    flight.canLeave = (c) => (this.docking.isDocked(c) ? null : 'Stay strapped in while the Ranger is in free flight.');
    bus.on('flight:autopilot', this.onAutopilotKey);
    bus.on('flight:leave', this.onLeaveSeat);
  }

  override leave() {
    super.leave();
    this.autoLanding = null;
    const g = this.game;
    g.renderer.spaceScene.remove(this.stars.group, this.globe.mesh, this.view.group);
    if (this.lens) g.renderer.spaceScene.remove(this.lens.mesh);
    this.sky.setVisible(false);
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== this.place);
    bus.off('flight:autopilot', this.onAutopilotKey);
    bus.off('flight:leave', this.onLeaveSeat);
    ui.set({ dock: null });
  }

  /** Put the player in Ranger 1 at a relative position to the Endurance (LVLH, m) */
  startInRanger(p: THREE.Vector3, v = new THREE.Vector3(), facing: 'nose' | 'tail' = 'nose') {
    const c = this.ranger!;
    const q = new THREE.Quaternion();
    const toShip = _v.copy(p).negate().normalize();
    // nose toward the ship, or tail toward it (docking attitude)
    q.setFromUnitVectors(new THREE.Vector3(0, 0, facing === 'nose' ? -1 : 1), toShip);
    c.setCarried(false);
    c.place(p.clone().sub(c.comModel.clone().applyQuaternion(q)), q, v);
    c.setGear(false);
    c.gearT = 0;
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== c) { if (flight.craft) flight.leave(true); flight.enter(c, this.env, 'pilot_l'); }
    flight.target = {
      name: 'Endurance · axial port',
      pos: (out) => { const port = this.endurance.port('axial_fwd')!; return port.node.getWorldPosition(out); },
      vel: (out) => out.set(0, 0, 0),
    };
  }

  /** the automatic program: rendezvous to the gate when far, then dock */
  engageAutoDock() {
    const c = this.ranger!, flight = this.game.services.flight as Flight;
    if (flight.craft !== c || this.docking.linkOf(c)) return;
    const port = this.docking.nearestPort(c, 'ranger');
    if (!port) { ui.toast('No free Ranger port on the Endurance', 'warn', 4); return; }
    const pp = port.node.getWorldPosition(new THREE.Vector3());
    const near = c.position(_v).distanceTo(pp) < GATE_DIST + 40 && c.velocity(_w).length() < 1.5;
    flight.engage(near ? new DockAutopilot(this.docking) : new RendezvousAutopilot(this, true));
    mission.note(near ? 'Automatic docking engaged at the approach gate.' : 'Automatic rendezvous and docking engaged.');
  }

  /** Unbuckling in a docked Ranger: the walk continues inside the ship's own (rotating) frame, with no cut. */
  private onLeaveSeat = (c: Spacecraft) => {
    if (this.game.zone !== this || !this.docking.isDocked(c)) return;
    const cam = this.game.renderer.camera;
    const q = new THREE.Quaternion().copy(this.endurance.root.quaternion).multiply(this.endurance.spinNode.quaternion);
    const qi = q.clone().invert();
    const pos = cam.getWorldPosition(new THREE.Vector3()).sub(this.endurance.root.position).applyQuaternion(qi);
    const quat = cam.getWorldQuaternion(new THREE.Quaternion()).premultiply(qi);
    const craft: 'r1' | 'r2' = c === this.ranger ? 'r1' : 'r2';
    void this.game.gotoZone('endurance', { fade: false, onEnter: (z) => (z as any).arrive(pos, quat, craft) });
  };

  private onAutopilotKey = () => {
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== this.ranger) return;
    if (flight.autopilot) { flight.engage(null); return; }
    this.game.openPanel('docking');
  };

  // ------------------------------------------------------------------------------------------- simulation
  override fixedUpdate(dt: number) {
    this.advance(dt);
    if (this.mode === 'flight' && this.flightProg) this.flightStep(dt);
    if (this.traverse) this.traverseStep(dt);
    this.endurance.fixedUpdate(dt);
    this.npcs.fixedUpdate(dt);
    this.docking.fixedUpdate(dt);
    this.autoLandStep(dt);
    this.ranger2?.fixedUpdate(dt, this.env);
    this.ranger?.fixedUpdate(dt, this.env);
  }

  override gravityAt(_p: THREE.Vector3, out: THREE.Vector3) { return out.set(0, 0, 0); }

  /** rotation from the orbital frame into the frame being drawn (the interior of the spinning ship), or null */
  skyRotation: THREE.Quaternion | null = null;
  private sunView = new THREE.Vector3();

  /** Earth, sun and stars for the current time, in the zone frame. Runs every frame before drawing. */
  updateSky() {
    // the sky's light hold follows the view stabiliser here, not its own rate test
    this.sky.holdLight = false;
    if (this.mode === 'cruise') { this.updateSkyCruise(); return; }
    if (this.mode === 'flight') { this.updateSkyFlight(); return; }
    if (this.mode === 'orbit') { this.originR = this.rE; this.originPhi = this.phiE; }
    this.plane.frame(this.originPhi, this.frame);
    const dt = this.lapseDt();
    this.updateRot();
    if (this.body.id !== 'earth') { this.updateSkyGeneric(); return; }
    const s = sunEci(this.day + (this.hours + this.met / 3600) / 24, _s);
    this.frame.toLocal(s, this.sunLocal).normalize();
    // Earth: the sun is computed in the true local frame, so the sky holds it itself while the view is held
    this.sky.holdLight = this.lapse;
    this.sky.setSunDirection(this.sunLocal);
    // the globe is lit by the sun as shown
    this.sunView.copy(this.sky.sunDir);
    this.globe.setSun(this.sunView, 20);
    this.frame.globeQuaternion(this.theta, this.globe.mesh.quaternion);
    this.heldGlobe.apply(this.globe.mesh.quaternion, this.lapse, dt);
    const cloud = (this.met / 86400) * 0.6;
    if (this.lapse) this.cloudEase = true;
    else if (this.cloudEase && dt > 0) {
      const d = cloud - this.cloudShown, dd = d - Math.round(d);
      this.cloudShown += dd * (1 - Math.exp(-dt * 2.5));
      if (Math.abs(dd) < 1e-3) { this.cloudEase = false; this.cloudShown = cloud; }
    } else if (!this.cloudEase) this.cloudShown = cloud;
    this.globe.mat.uniforms.uCloudShift.value = this.cloudShown;
    this.stars.orient(this.frame.X, this.frame.Y, this.frame.Z);
    this.stars.group.quaternion.premultiply(this.heldRot.delta);
    this.earthCentre.set(0, -this.originR, 0);
    const R = this.skyRotation;
    this.sky.lightRotation = R;
    if (R) {
      this.globe.mesh.quaternion.premultiply(R);
      this.stars.group.quaternion.premultiply(R);
      this.earthCentre.applyQuaternion(R);
      this.sunView.applyQuaternion(R);
      this.globe.setSun(this.sunView, 20);
    }
  }

  /** real seconds since the last sky update (0 for a repeated call within the same frame) */
  private lapseDt() {
    return this.lapseT < 0 ? 0 : this.sky.clock - this.lapseT;
  }

  /**
   * Finish the zone <- system rotation: decide whether time runs too fast for the eye (the frame turning faster
   * than 45 degrees a second against the stars), hold or ease the view accordingly, then add the ship's spin.
   */
  private finishRot() {
    const dt = this.lapseDt();
    const q = _qa.setFromRotationMatrix(this.rotSys);
    if (dt > 1e-4 && this.lapseSeen) {
      this.lapseRate = (this.lapseQ.angleTo(q) / dt) * (180 / Math.PI);
      this.lapse = this.lapseRate > (this.lapse ? 30 : 45);
    }
    if (dt > 1e-4 || !this.lapseSeen) { this.lapseQ.copy(q); this.lapseSeen = true; this.lapseT = this.sky.clock; }
    if (this.warp < 100) this.lapse = false;
    const shown = this.heldRot.apply(q.copy(this.lapseQ), this.lapse, dt);
    this.rotSys.makeRotationFromQuaternion(shown);
    if (this.skyRotation) this.rotSys.premultiply(_m4b.makeRotationFromQuaternion(this.skyRotation));
  }

  /** zone frame <- system frame for the current origin: rows of the local frame (in BCI) times BCI <- system */
  private updateRot() {
    if (this.body.id === 'earth') {
      // the Earth's BCI is ECI: its equator basis is the vernal equinox / J2000 equator
      const { e1, e2, n } = equatorBasis('earth');
      this.bci.e1.set(...e1); this.bci.e2.set(...e2); this.bci.n.set(...n);
    }
    const F = this.frame, B = this.bci;
    const zb = new THREE.Matrix4().set(F.X.x, F.X.y, F.X.z, 0, F.Y.x, F.Y.y, F.Y.z, 0, F.Z.x, F.Z.y, F.Z.z, 0, 0, 0, 0, 1);
    const bs = new THREE.Matrix4().set(B.e1.x, B.e1.y, B.e1.z, 0, B.e2.x, B.e2.y, B.e2.z, 0, B.n.x, B.n.y, B.n.z, 0, 0, 0, 0, 1);
    this.rotSys.multiplyMatrices(zb, bs);
    this.finishRot();
  }

  /** sun, sky and stars around a body other than the Earth (its globe is drawn by the system view) */
  private updateSkyGeneric() {
    const pos = state(this.body.id, this.jd).r;
    // light from the system origin (the Sun, or Gargantua's disk)
    const tl = toLight(pos, this.body.system);
    const sun = _s.set(tl[0], tl[1], tl[2]).normalize().applyMatrix4(_m4.extractRotation(this.rotSys));
    this.sunLocal.copy(sun);
    this.sunView.copy(sun);
    this.sky.lightRotation = null;
    this.sky.setSunDirection(sun);
    this.earthCentre.set(0, -this.originR, 0);
    if (this.skyRotation) this.earthCentre.applyQuaternion(this.skyRotation);
    // stars: catalogued in J2000 equatorial coordinates
    this.orientStars();
  }

  private orientStars() {
    const obl = (23.4392911 * Math.PI) / 180;
    const eqToEcl = new THREE.Matrix4().makeRotationX(-obl);
    const m = new THREE.Matrix4().multiplyMatrices(_m4.extractRotation(this.rotSys), eqToEcl);
    const e = m.elements;
    this.stars.orient(_x.set(e[0], e[4], e[8]), _z.set(e[1], e[5], e[9]), new THREE.Vector3(e[2], e[6], e[10]));
  }

  /** the camera's place in the system frame, held with the view under heavy time compression and eased back after */
  private holdCam() {
    const c = this.camSys, h = this.heldCam, o = this.heldCamOff;
    const dt = this.heldCamT < 0 ? 0 : this.sky.clock - this.heldCamT;
    this.heldCamT = this.sky.clock;
    if (this.lapse && this.heldCamState !== -1) { this.heldCamState = 1; c[0] = h[0]; c[1] = h[1]; c[2] = h[2]; return; }
    if (this.heldCamState === 1) { this.heldCamState = 2; o[0] = h[0] - c[0]; o[1] = h[1] - c[1]; o[2] = h[2] - c[2]; }
    if (this.heldCamState === 2) {
      const k = Math.exp(-dt * 2.5);
      o[0] *= k; o[1] *= k; o[2] *= k;
      // eased back: the offset is negligible against the distance to the nearest body
      if (Math.hypot(o[0], o[1], o[2]) < 1) this.heldCamState = 0;
      else { c[0] += o[0]; c[1] += o[1]; c[2] += o[2]; }
    }
    h[0] = c[0]; h[1] = c[1]; h[2] = c[2];
    if (this.heldCamState === -1) this.heldCamState = 0;
  }

  /** background objects relative to the final camera of the frame */
  place = (cam: THREE.PerspectiveCamera) => {
    cam.getWorldPosition(_v);
    // the camera in the system frame: body centre + frame origin + camera offset (zone -> BCI -> system)
    const B = this.bci, F = this.frame;
    const local = _w.copy(_v);
    if (this.skyRotation) local.applyQuaternion(_q.copy(this.skyRotation).invert());
    if (this.mode === 'cruise' || this.mode === 'flight') {
      const S = this.cruiseShip, C = this.cruiseAxes;
      this.camSys[0] = S[0] + C.X.x * local.x + C.Y.x * local.y + C.Z.x * local.z;
      this.camSys[1] = S[1] + C.X.y * local.x + C.Y.y * local.y + C.Z.y * local.z;
      this.camSys[2] = S[2] + C.X.z * local.x + C.Y.z * local.y + C.Z.z * local.z;
    } else {
      const o = this.plane.eci(this.originR, this.originPhi, _s).add(F.toEci(local, new THREE.Vector3()));
      const bp = state(this.body.id, this.jd).r;
      this.camSys[0] = bp[0] + o.x * B.e1.x + o.y * B.e2.x + o.z * B.n.x;
      this.camSys[1] = bp[1] + o.x * B.e1.y + o.y * B.e2.y + o.z * B.n.y;
      this.camSys[2] = bp[2] + o.x * B.e1.z + o.y * B.e2.z + o.z * B.n.z;
    }
    this.holdCam();
    this.view.exposure = this.game.renderer.look.exposure;
    this.view.update(this.jd, this.camSys, this.rotSys, this.game.renderer.height / ((cam.fov * Math.PI) / 180));
    // beyond the wormhole the sky is another galaxy's (drawn, lensed, by the black hole pass)
    this.stars.group.visible = this.view.system === 'sol';
    this.placeLens(local);
    this.globe.mesh.position.copy(this.earthCentre).sub(_v);
    // eye adaptation: stars fade when the sunlit Earth or the sun fills the view
    const look = cam.getWorldDirection(_w);
    const toEarth = _s.copy(this.earthCentre).sub(_v).normalize();
    const earthIn = clamp((look.dot(toEarth) - 0.2) / 0.6, 0, 1);
    const irr = this.irradiance();
    const sunUp = this.sky.sunColor.r > 0.05 * Math.min(1, irr) ? 1 : 0;
    const sunIn = clamp((look.dot(this.sunView) - 0.6) / 0.4, 0, 1) * sunUp;
    const day = sunUp * (0.35 + 0.65 * earthIn) + sunIn;
    // the stars keep their screen brightness whatever the eye adaptation to the local sunlight
    const adapt = 0.95 / this.game.renderer.look.exposure;
    this.stars.setVisibility(2.4 * (1 - clamp(day, 0, 0.92)) * adapt, 6.8 - 3.2 * clamp(day, 0, 1));
    // our catalogue's stars are not those of Gargantua's galaxy (its sky is drawn by the black-hole pass)
    if (this.view.system !== 'sol') this.stars.group.visible = false;
  };

  override update(dt: number) {
    const g = this.game;
    if (this.flashFade) {
      const fl = g.renderer.flash;
      fl.multiplyScalar(Math.exp(-dt * 4));
      if (fl.length() < 0.002) { fl.set(0, 0, 0); this.flashFade = false; }
    }
    this.endurance.update(dt, g.alpha);
    this.ranger2?.update(dt, g.alpha, 0);
    this.ranger?.update(dt, g.alpha, 0);
    this.updateSky();
    const cam = g.renderer.camera;
    cam.getWorldPosition(_v);
    this.camTarget.copy(this.ranger ? this.ranger.root.position : _v);
    this.sky.shadowFocus.copy(this.camTarget.distanceTo(this.endurance.root.position) < 120 ? this.endurance.root.position : this.camTarget);
    this.sky.shadowRange = this.camTarget.distanceTo(this.endurance.root.position) < 120 ? 48 : 20;
    this.sky.update(dt, _v, this.mode === 'flight' && this.flightProg ? this.flightProg.f.alt + _v.y : this.originR - this.body.R + _v.y);
    this.npcs.update(dt);
    if (this.mode === 'ascent' || this.stack) this.ascentVisuals(dt);
    this.entryEffects(dt);
    this.updateDebris(dt);
    this.lights.update(_v, dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.dockHud(); this.clocks(); }
  }

  private clocks() {
    const clocks = this.missionClocks();
    if (this.mode === 'orbit' && this.n > 0) {
      const orbitFrac = ((this.phiE % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
      clocks.splice(1, 0, { label: 'ORBIT', value: `${(orbitFrac * 100).toFixed(0)}%` });
    }
    ui.set({ clocks });
  }

  /** the docking display while flying Ranger 1 near the Endurance */
  private dockHud() {
    const flight = this.game.services.flight as Flight;
    const c = this.ranger;
    if (!c || flight.craft !== c || this.mode !== 'orbit' || c.carried && !this.docking.linkOf(c) && !flight.autopilot) { ui.set({ dock: null }); return; }
    const link = this.docking.linkOf(c);
    const port = link?.port ?? this.endurance.ports.find((p) => p.reservedFor === c) ?? this.docking.nearestPort(c, 'ranger') ?? this.endurance.port('axial_fwd')!;
    const r = this.docking.measure(c, port);
    // a carried craft coasting under time compression moves warp times faster per real second than it flies
    if (c.carried && this.warp > 1 && !link) { r.relVel.multiplyScalar(1 / this.warp); r.closing /= this.warp; }
    const ap = flight.autopilot;
    const stateText = link ? ({ capture: 'SOFT CAPTURE', retract: 'RETRACTING', latch: 'LATCHING', equalize: 'EQUALIZING PRESSURE', docked: 'DOCKED', release: 'RELEASING' } as Record<string, string>)[link.state] : r.range > 400 ? 'FAR FIELD' : r.axial > GATE_DIST ? 'APPROACH' : 'FINAL APPROACH';
    const occupied = port.occupant && port.occupant !== c;
    const clearance = occupied ? 'PORT OCCUPIED' : link ? 'CAPTURED' : port.reservedFor && port.reservedFor !== c ? 'RESERVED' : r.range < 400 ? 'CLEARED TO DOCK' : 'CLEARED TO APPROACH';
    const rcs = c.fuel <= 0 ? 'NO PROPELLANT' : c.sas === 'off' ? 'DIRECT' : c.sas === 'rate' ? 'RATE DAMP' : 'ATT HOLD';
    ui.set({
      dock: {
        target: 'ENDURANCE', port: port.label, range: r.range, axial: r.axial, lx: r.lateral.x, ly: r.lateral.y, vx: r.relVel.x, vy: r.relVel.y,
        closing: r.closing, align: r.alignErr, tiltX: r.tilt.x, tiltY: r.tilt.y, roll: r.rollErr, rollRate: r.rollRate, fuel: c.fuel / c.spec.fuelMax,
        rcs, clearance, state: stateText, issues: link ? [] : r.issues, auto: ap ? `${ap.name.toUpperCase()} · ${ap.status?.() ?? ''}` : 'MANUAL',
        spin: this.endurance.rpm, time: ap && (ap as any).t !== undefined ? (ap as any).t : -1,
      },
    });
  }

  // ------------------------------------------------------------------------------------------- ascent
  /** Hand-over from the Earth zone above the cloud deck: the stack continues its climb in this frame. */
  beginAscent(sim: AscentSim, roll = 1) {
    this.mode = 'ascent';
    this.sim = sim;
    this.met = sim.t;
    // phase the Endurance so that a nominal ascent inserts a few kilometres behind it
    const pre = new AscentSim();
    pre.siloClear = sim.siloClear;
    while (!pre.done && pre.t < 900) pre.step(1 / 30);
    this.phiE0 = pre.phi + 4200 / this.rE - this.n * pre.t;
    this.stack?.dispose();
    this.stack = new LaunchStack(this.stackModel, this.lights);
    this.root.add(this.stack.root);
    const c = this.ranger!;
    if (this.docking.linkOf(c)) return;
    c.setCarried(true);
    this.stack.mount(c);
    c.setGear(false); c.gearT = 0;
    this.placeStack();
    this.stack.carryRanger(true);
    this.smoke.clear();
    void roll;
  }

  /** Stack pose in the frame that rides with it: origin at the engine plane, axis along the thrust. */
  private placeStack() {
    const s = this.sim!, st = this.stack!;
    this.originR = s.r;
    this.originPhi = s.phi;
    const p = s.pitch;
    this.axis.set(Math.cos(p), Math.sin(p), 0);
    // vehicle axes: X -> (sin p, -cos p, 0) (crew side faces up once pitched over), Y -> thrust axis, Z -> Z
    _m4.makeBasis(_x.set(Math.sin(p), -Math.cos(p), 0), this.axis, _z.set(0, 0, 1));
    st.root.quaternion.setFromRotationMatrix(_m4);
    st.root.position.set(0, 0, 0);
    st.root.updateMatrixWorld(true);
    // the Endurance where it really is relative to the stack (far away until the end of the climb)
    const d = this.phiE - s.phi;
    this.endurance.root.position.set(this.rE * Math.sin(d), this.rE * Math.cos(d) - s.r, 0);
  }

  /** fixed step of the ascent (sim already advanced by the director) */
  ascentFixed(dtSim: number, sim: AscentSim) {
    if (this.mode !== 'ascent' || !this.stack) return;
    this.sim = sim;
    this.met = sim.t;
    this.placeStack();
    const st = this.stack;
    st.level1 = sim.stage === 0 && sim.burning ? sim.throttle : 0;
    st.level2 = sim.stage === 1 && sim.burning ? sim.throttle : 0;
    if (sim.stage >= 2 && st.stage === 2) {
      // second stage depleted short of orbit: it falls away and the Ranger's engines finish the job
      st.separate(2, this.root, this.axis.clone().multiplyScalar(-1.5), new THREE.Vector3(0.02, 0.05, 0.03));
    }
    if (this.ranger) { this.ranger.plumeWhileCarried = sim.stage >= 2 && sim.burning; this.ranger.throttle = this.ranger.plumeWhileCarried ? 1 : 0; }
    st.carryRanger();
    void dtSim;
  }

  stageSeparation(stage: 1 | 2) {
    if (!this.stack || this.mode !== 'ascent') return;
    this.stack.separate(stage, this.root, this.axis.clone().multiplyScalar(-2.2), new THREE.Vector3(0.05, 0.11, 0.03));
    bus.emit('sfx', { id: 'blast', node: this.stack.root, gain: 0.8 });
  }

  /** Orbit insertion: the frame moves to the Endurance and the Ranger springs off the payload adapter. */
  separateRanger(done: () => void) {
    const s = this.sim!, st = this.stack!, c = this.ranger!;
    // the stack's state relative to the Endurance, exact in the orbit plane
    const P0 = new THREE.Vector3(), V0 = new THREE.Vector3();
    polarToLvlh(s.r, s.phi, s.vr, s.vt, this.rE, this.phiE, this.n, P0, V0);
    this.mode = 'orbit';
    this.met = s.t;
    this.endurance.root.position.set(0, 0, 0);
    // everything that flew with the stack moves to its place in the Endurance's frame
    for (const ch of this.root.children) {
      if (ch === this.endurance.root || ch === this.lights.group || ch === this.ranger2?.root || ch === c.root) continue;
      ch.position.add(P0);
    }
    for (const d of st.debris) d.vel.add(V0);
    st.root.updateMatrixWorld(true);
    const q = c.quaternion(new THREE.Quaternion());
    const pos = c.position(new THREE.Vector3()).add(P0).sub(c.comModel.clone().applyQuaternion(q));
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    c.plumeWhileCarried = false;
    c.throttle = 0;
    c.setCarried(false);
    c.place(pos, q, V0.clone().addScaledVector(nose, 0.6));
    st.releaseRanger();
    // the spent stage with its adapter drifts away behind
    st.separate(2, this.root, V0.clone().addScaledVector(nose, -0.25), new THREE.Vector3(0.01, 0.03, 0.02));
    bus.emit('sfx', { id: 'clamp', node: c.root, gain: 1 });
    bus.emit('sfx', { id: 'blast', node: c.root, gain: 0.5 });
    const flight = this.game.services.flight as Flight;
    flight.target = { name: 'Endurance · axial port', pos: (out) => this.endurance.port('axial_fwd')!.node.getWorldPosition(out), vel: (out) => out.set(0, 0, 0) };
    setTimeout(done, 3500);
  }

  /** crew NPCs ride along in their seats */
  seatCrew(crew: NPC[], seating: [string, string][]) {
    const c = this.ranger!;
    const earth = this.game.zones.get('earth') as any;
    for (const n of crew) {
      const L: NPC[] | undefined = earth?.nasaStaff?.npcs?.list;
      if (L && L.includes(n)) L.splice(L.indexOf(n), 1);
      this.npcs.adopt(n);
      const seat = seating.find(([id]) => id === n.id)?.[1];
      const node = seat ? c.model.node('seat', seat) : null;
      if (node) n.attach(node, 'sit', new THREE.Vector3(0, -0.5, 0.02));
    }
  }

  /** chase-plane view: off the stack's side, slightly behind and below */
  chasePlane(cam: THREE.PerspectiveCamera) {
    const st = this.stack;
    if (!st) return;
    st.root.updateMatrixWorld(true);
    const mid = _v.set(0, 34, 0).applyMatrix4(st.root.matrixWorld);
    cam.position.copy(mid).addScaledVector(_z.set(0, 0, 1), 170).addScaledVector(this.axis, -60).add(_x.set(0, -25, 0));
    cam.up.set(0, 1, 0);
    cam.lookAt(mid);
  }

  /** a camera on the second stage looking down the vehicle at the first stage and the Earth */
  stageCamera(cam: THREE.PerspectiveCamera) {
    const st = this.stack;
    if (!st) return;
    st.root.updateMatrixWorld(true);
    const side = _x.set(1, 0, 0).applyQuaternion(st.root.quaternion);
    cam.position.set(0, 40, 0).applyMatrix4(st.root.matrixWorld).addScaledVector(side, 3.35);
    cam.up.copy(side);
    cam.lookAt(_v.copy(cam.position).addScaledVector(this.axis, -10).addScaledVector(side, 0.6));
  }

  /** plumes, debris and the exhaust trail in the moving frame */
  private ascentVisuals(dt: number) {
    const st = this.stack;
    if (!st) return;
    const s = this.sim;
    const g = this.game;
    if (this.mode === 'ascent' && s) {
      st.vac = clamp(1 - pressureRatio(s.h) * 1.4, 0, 1);
      // the air streams past the vehicle: the exhaust trail stays where it was made
      const vAir = s.vt - OMEGA_EARTH * s.r * Math.cos(LAUNCH_SITE.lat * D2R);
      const shift = _s.set(-vAir * dt * (this.game.services.launch?.warp ?? 1), -s.vr * dt * (this.game.services.launch?.warp ?? 1), 0);
      const dens = clamp(1 - s.h / 45000, 0, 1);
      this.emitAcc += dt * 40 * dens * (st.level1 + st.level2 * 0.6);
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        const r = () => (Math.random() - 0.5);
        const p = _w.copy(this.axis).multiplyScalar(-(25 + Math.random() * 30));
        this.smoke.emit({ x: p.x + r() * 5, y: p.y + r() * 5, z: r() * 5 }, { x: r() * 3, y: r() * 3, z: r() * 3 }, 18, 8, 30 + 60 * (1 - dens), 0.15);
      }
      const accAxis = s.accel;
      st.update(dt, _v.copy(this.axis).multiplyScalar(accAxis));
      const cam = g.renderer.camera;
      this.smoke.update(dt, cam, this.sky.sunDir, _c.copy(this.sky.sunColor).multiplyScalar(this.sky.sun.intensity), _c2.setRGB(0.25, 0.32, 0.45), shift);
    } else {
      st.update(dt);
      this.smoke.update(dt, g.renderer.camera, this.sky.sunDir, _c.copy(this.sky.sunColor).multiplyScalar(this.sky.sun.intensity), _c2.setRGB(0.05, 0.06, 0.08));
      // spent stages that have drifted far away are gone for good
      for (const d of [...st.debris]) if (d.obj.position.length() > 8000) { d.obj.removeFromParent(); st.debris.splice(st.debris.indexOf(d), 1); }
    }
  }

  override soundscape(o: Soundscape) {
    const flight = this.game.services.flight as Flight;
    const inCraft = !!flight.craft;
    o.wind = 0; o.dust = 0; o.rustle = 0; o.water = 0; o.rumble = 0;
    o.indoors = inCraft ? 1 : 0; o.vacuum = inCraft ? 0 : 1; o.helmet = 0;
    o.hum = 0.45; o.air = 0.5;
    o.reverb = 'ship';
    o.music = this.docking.links.some((l) => l.craft === this.ranger) ? 'ship' : flight.autopilot ? 'dock' : 'orbit';
    if (this.mode === 'flight' && this.flightProg) {
      const f = this.flightProg.f;
      o.rumble = Math.min(1, f.q / 12000 + (this.plasma?.glow ?? 0) * 0.5);
      o.wind = Math.min(1, f.q / 8000);
      o.vacuum = f.q > 5 ? 0 : o.vacuum;
    }
    if (this.traverse) { o.rumble = 0.3 + 0.7 * Math.exp(-((this.traverse.l / (3 * this.body.R)) ** 2)); o.intensity = 0.8; o.music = 'gargantua'; }
    o.intensity = 0.4;
    return o;
  }

  override locationName() {
    if (this.mode === 'cruise' && this.voyage) {
      const r = this.cruiseShip, inSol = BODY[this.voyage.to].system === 'sol';
      return `Cruise to ${BODY[this.voyage.to].name}${inSol ? ` · ${(Math.hypot(r[0], r[1], r[2]) / AU).toFixed(2)} au from the Sun` : ''}`;
    }
    if (this.traverse) return Math.abs(this.traverse.l) < 3 * this.body.R ? 'Wormhole · throat' : `Wormhole · ${(this.traverse.l / 1000).toFixed(1)} km from the throat · ${this.traverse.v.toFixed(0)} m/s`;
    if (this.mode === 'ascent' && this.sim) return `Ascent · ${(this.sim.h / 1000).toFixed(0)} km · ${(this.sim.downrange / 1000).toFixed(0)} km downrange`;
    const c = this.ranger;
    if (c && this.docking.isDocked(c)) return 'Ranger 1 · docked to Endurance';
    const d = c ? c.position(_v).length() : 0;
    const where = `${this.body.id === 'earth' ? 'Earth' : this.body.name} orbit`;
    return d > 5 ? `${where} · ${(this.rE - this.body.R) / 1000 | 0} km · ${d < 2000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(1) + ' km'} from Endurance` : where;
  }

  override serialize() {
    return { met: this.met, earthOffset: this.earthOffset, dvUsed: this.dvUsed, body: this.body.id, voyage: this.voyage, voyageT: this.voyageT, day: this.day, hours: this.hours, phiE0: this.phiE0, endurance: this.endurance.serialize(), ranger: this.ranger?.serialize(), docked: this.ranger ? this.docking.isDocked(this.ranger) : false };
  }
}

void D2R; void cwPropagate; void _q;

/** elapsed time as days and hours:minutes:seconds (years once they pass) */
export function fmtClock(t: number) {
  const pad = (x: number) => String(Math.floor(x)).padStart(2, '0');
  const y = Math.floor(t / (365.25 * 86400));
  const d = Math.floor((t - y * 365.25 * 86400) / 86400);
  const s = t - y * 365.25 * 86400 - d * 86400;
  const hms = `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
  return y > 0 ? `${y}y ${d}d ${hms}` : d > 0 ? `${d}d ${hms}` : hms;
}

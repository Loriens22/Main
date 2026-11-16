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
import { BODY, BodyDef } from '../../space/Bodies';
import { equatorBasis, LAUNCH_JD, state, surfacePoint } from '../../space/Ephemeris';
import { SystemView } from '../../render/SystemView';
import { atmosphereFor, exposureFor, irradianceAt } from '../../space/Worlds';
import { distanceRemaining, ENDURANCE_DV, finalizeArrival, finalizeDeparture, fmtDistance, fmtDuration, ParkState, TransferPlan, voyagePosition } from '../../space/Voyage';
import { AU, DAY, R_G, WORMHOLE_PAIR } from '../../space/Bodies';
import { dilationAt } from '../../space/Relativity';
import type { V3 } from '../../space/Kepler';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color();

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
  mode: 'orbit' | 'ascent' | 'cruise' = 'orbit';
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

  env: FlightEnv = {
    gravity: (_p, out) => out.set(0, 0, 0),
    density: () => 0,
    altitude: (p) => this.rE - this.body.R + p.y,
    accel: (p, v, out) => (this.mode === 'cruise' ? out.set(0, 0, 0) : cwAccel(p, v, this.n, out)),
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
    this.ranger.onImpact = (dv) => {
      if (dv > 0.4) { ui.toast(`Contact! ${dv.toFixed(2)} m/s — hull damage ${(this.ranger!.damage * 100).toFixed(0)}%`, 'warn', 3); bus.emit('sfx', { id: 'thud', node: this.ranger!.root, gain: clamp(dv, 0.3, 1) }); }
    };
    this.docking.onDocked = (l) => { bus.emit('ranger:docked', l); void g.preload('endurance'); };
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
    if (this.mode === 'ascent') return;
    const step = dt * this.warp;
    this.met += step;
    if (this.pending && this.met >= this.pending.burnMet) { this.earthOffset += step * (this.dilation() - 1); this.startCruise(this.met - this.pending.burnMet); return; }
    this.earthOffset += step * (this.dilation() - 1);
    this.lookT -= dt;
    if (this.mode === 'cruise' && this.adaptLook && this.lookT <= 0) { this.lookT = 0.5; this.game.renderer.setLook({ exposure: this.exposure() }); }
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
    if (this.game.zone === this) this.game.renderer.setLook({ exposure: this.exposure() });
    mission.note(`Arrived at ${BODY[plan.to].name}${plan.dvArrive > 0 ? `: capture burn ${(plan.dvArrive / 1000).toFixed(2)} km/s` : ''}.`);
    if (BODY[plan.to].kind === 'wormhole') mission.setPhase('saturn');
    bus.emit('voyage:arrive', plan);
    ui.toast(`Arrived · ${BODY[plan.to].name}`, 'info', 5);
  }

  /** Through the wormhole: the ship comes out at the other mouth (the traversal itself is played by the director). */
  traverseWormhole() {
    const other = WORMHOLE_PAIR[this.body.id];
    if (!other) return;
    this.setBody(other);
    mission.setPhase(other === 'gate' ? 'gargantua' : 'saturn');
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
    if (this.skyRotation) this.rotSys.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(this.skyRotation));
    const sun = _s.set(-r[0], -r[1], -r[2]).normalize().applyMatrix4(_m4.extractRotation(this.rotSys));
    this.sunLocal.copy(sun);
    this.sunView.copy(sun);
    this.sky.lightRotation = null;
    this.sky.setSunDirection(sun);
    this.sky.params.sunE = 20 * this.irradiance();
    this.earthCentre.set(0, -1e12, 0);
    this.orientStars();
  }

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
    const out = [{ label: 'MET', value: fmtClock(this.met) }];
    if (Math.abs(this.earthOffset) > 60) out.push({ label: 'EARTH', value: fmtClock(this.earthT) });
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
    const rE = b.R + b.parkingAlt, n = b.GM > 0 ? Math.sqrt(b.GM / rE ** 3) : 0;
    const { e1, e2, n: nn } = equatorBasis(id);
    const bci = { e1: new THREE.Vector3(...e1), e2: new THREE.Vector3(...e2), n: new THREE.Vector3(...nn) };
    const toB = (v: THREE.Vector3) => new THREE.Vector3(v.dot(bci.e1), v.dot(bci.e2), v.dot(bci.n));
    if (id === 'earth') return { plane: new OrbitPlane(LAUNCH_SITE.lat, LAUNCH_SITE.lon, this.theta0), bci, rE, n, phase: 0 };
    if (b.landing) {
      const site = surfacePoint(id, b.landing.lat, b.landing.lon, jd);
      const sv = new THREE.Vector3(site[0], site[1], site[2]).normalize();
      const east = new THREE.Vector3().crossVectors(bci.n, sv).normalize();
      return { plane: OrbitPlane.fromVectors(toB(sv), toB(east)), bci, rE, n, phase: -0.35 };
    }
    const bp = state(id, jd).r;
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
    this.rE = b.R + b.parkingAlt;
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
    if (this.game.zone === this) this.game.renderer.setLook({ exposure: this.exposure(), saturation: 1.12, contrast: 1.2, bloom: 0.7, aoIntensity: 1.6, aoRadius: 1.6 }, true);
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
    this.sky.setVisible(true);
    this.sky.dome.visible = this.skyDome();
    g.renderer.preRender.push(this.place);
    g.renderer.setLook({ exposure: this.exposure(), saturation: 1.12, contrast: 1.2, bloom: 0.7, aoIntensity: 1.6, aoRadius: 1.6 }, true);
    // dark sky: environment from the sky bake (black above, earthshine below)
    this.sky.invalidate();
    const flight = g.services.flight as Flight;
    flight.canLeave = (c) => (this.docking.isDocked(c) ? null : 'Stay strapped in while the Ranger is in free flight.');
    bus.on('flight:autopilot', this.onAutopilotKey);
    bus.on('flight:leave', this.onLeaveSeat);
  }

  override leave() {
    super.leave();
    const g = this.game;
    g.renderer.spaceScene.remove(this.stars.group, this.globe.mesh, this.view.group);
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
    this.endurance.fixedUpdate(dt);
    this.npcs.fixedUpdate(dt);
    this.docking.fixedUpdate(dt);
    this.ranger2?.fixedUpdate(dt, this.env);
    this.ranger?.fixedUpdate(dt, this.env);
  }

  override gravityAt(_p: THREE.Vector3, out: THREE.Vector3) { return out.set(0, 0, 0); }

  /** rotation from the orbital frame into the frame being drawn (the interior of the spinning ship), or null */
  skyRotation: THREE.Quaternion | null = null;
  private sunView = new THREE.Vector3();

  /** Earth, sun and stars for the current time, in the zone frame. Runs every frame before drawing. */
  updateSky() {
    if (this.mode === 'cruise') { this.updateSkyCruise(); return; }
    if (this.mode === 'orbit') { this.originR = this.rE; this.originPhi = this.phiE; }
    this.plane.frame(this.originPhi, this.frame);
    this.updateRot();
    if (this.body.id !== 'earth') { this.updateSkyGeneric(); return; }
    const s = sunEci(this.day + (this.hours + this.met / 3600) / 24, _s);
    this.frame.toLocal(s, this.sunLocal).normalize();
    this.sky.setSunDirection(this.sunLocal);
    this.globe.setSun(this.sunLocal, 20);
    this.frame.globeQuaternion(this.theta, this.globe.mesh.quaternion);
    this.globe.mat.uniforms.uCloudShift.value = (this.met / 86400) * 0.6;
    this.stars.orient(this.frame.X, this.frame.Y, this.frame.Z);
    this.earthCentre.set(0, -this.originR, 0);
    this.sunView.copy(this.sunLocal);
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
    if (this.skyRotation) this.rotSys.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(this.skyRotation));
  }

  /** sun, sky and stars around a body other than the Earth (its globe is drawn by the system view) */
  private updateSkyGeneric() {
    const pos = state(this.body.id, this.jd).r;
    // light from the system origin (the Sun, or Gargantua's disk)
    const sun = _s.set(-pos[0], -pos[1], -pos[2]).normalize().applyMatrix4(_m4.extractRotation(this.rotSys));
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

  /** background objects relative to the final camera of the frame */
  place = (cam: THREE.PerspectiveCamera) => {
    cam.getWorldPosition(_v);
    // the camera in the system frame: body centre + frame origin + camera offset (zone -> BCI -> system)
    const B = this.bci, F = this.frame;
    const local = _w.copy(_v);
    if (this.skyRotation) local.applyQuaternion(_q.copy(this.skyRotation).invert());
    if (this.mode === 'cruise') {
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
    this.view.update(this.jd, this.camSys, this.rotSys, this.game.renderer.height / ((cam.fov * Math.PI) / 180));
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
  };

  override update(dt: number) {
    const g = this.game;
    this.endurance.update(dt, g.alpha);
    this.ranger2?.update(dt, g.alpha, 0);
    this.ranger?.update(dt, g.alpha, 0);
    this.updateSky();
    const cam = g.renderer.camera;
    cam.getWorldPosition(_v);
    this.camTarget.copy(this.ranger ? this.ranger.root.position : _v);
    this.sky.shadowFocus.copy(this.camTarget.distanceTo(this.endurance.root.position) < 120 ? this.endurance.root.position : this.camTarget);
    this.sky.shadowRange = this.camTarget.distanceTo(this.endurance.root.position) < 120 ? 48 : 20;
    this.sky.update(dt, _v, this.originR - this.body.R + _v.y);
    this.npcs.update(dt);
    if (this.mode === 'ascent' || this.stack) this.ascentVisuals(dt);
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
    o.intensity = 0.4;
    return o;
  }

  override locationName() {
    if (this.mode === 'cruise' && this.voyage) {
      const r = this.cruiseShip, inSol = BODY[this.voyage.to].system === 'sol';
      return `Cruise to ${BODY[this.voyage.to].name}${inSol ? ` · ${(Math.hypot(r[0], r[1], r[2]) / AU).toFixed(2)} au from the Sun` : ''}`;
    }
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

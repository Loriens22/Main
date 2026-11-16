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

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * Earth orbit. The zone frame is the local-vertical / local-horizontal frame of the Endurance on its circular
 * parking orbit (X along-track, Y radial up, Z across); free-flying craft feel the frame's tidal and Coriolis
 * accelerations (Clohessy-Wiltshire), so relative motion behaves as it does in orbit. The Earth, its atmosphere,
 * the sun and the stars are placed from the real geometry of the orbit plane, the Earth's rotation and the
 * season, so the terminator, sunrises and the night side come and go once per 92-minute orbit.
 */
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
  private hudT = 0;
  private sunLocal = new THREE.Vector3();
  private earthCentre = new THREE.Vector3();
  private camTarget = new THREE.Vector3();

  env: FlightEnv = {
    gravity: (_p, out) => out.set(0, 0, 0),
    density: () => 0,
    altitude: (p) => this.rE - R_EARTH + p.y,
    accel: (p, v, out) => cwAccel(p, v, this.n, out),
  };

  setWarp(w: number) { this.warp = w; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    progress?.(0.1, 'Earth orbit');
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere, { ...EARTH_ATMOSPHERE, cloudCoverage: 0, cirrus: 0, betaD: [0.3e-5, 0.25e-5, 0.15e-5], betaDAbs: [0.02e-5, 0.05e-5, 0.15e-5] });
    this.sky.groundColor.setRGB(0.16, 0.2, 0.28);
    this.sky.setOverGlobe(true);
    this.sky.setStars(0);
    this.sky.shadowRange = 48;
    this.sky.setVisible(false);
    this.globe = new Globe(R_EARTH, 256);
    this.stars = new StarField();
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
    this.docking.onDocked = (l) => bus.emit('ranger:docked', l);
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

  get phiE() { return this.phiE0 + this.n * this.met; }
  get theta() { return this.theta0 + OMEGA_EARTH * this.met; }

  override enter() {
    super.enter();
    const g = this.game;
    g.renderer.spaceScene.add(this.stars.group, this.globe.mesh);
    this.sky.setVisible(true);
    g.renderer.preRender.push(this.place);
    g.renderer.setLook({ exposure: 0.95, saturation: 1.12, contrast: 1.2, bloom: 0.7, aoIntensity: 1.6, aoRadius: 1.6 }, true);
    // dark sky: environment from the sky bake (black above, earthshine below)
    this.sky.invalidate();
    const flight = g.services.flight as Flight;
    flight.canLeave = (c) => (this.docking.isDocked(c) ? null : 'Stay strapped in while the Ranger is in free flight.');
    bus.on('flight:autopilot', this.onAutopilotKey);
  }

  override leave() {
    super.leave();
    const g = this.game;
    g.renderer.spaceScene.remove(this.stars.group, this.globe.mesh);
    this.sky.setVisible(false);
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== this.place);
    bus.off('flight:autopilot', this.onAutopilotKey);
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

  private onAutopilotKey = () => {
    const flight = this.game.services.flight as Flight;
    if (flight.craft !== this.ranger) return;
    if (flight.autopilot) { flight.engage(null); return; }
    this.game.openPanel('docking');
  };

  // ------------------------------------------------------------------------------------------- simulation
  override fixedUpdate(dt: number) {
    this.met += dt * this.warp;
    this.endurance.fixedUpdate(dt);
    this.docking.fixedUpdate(dt);
    this.ranger2?.fixedUpdate(dt, this.env);
    this.ranger?.fixedUpdate(dt, this.env);
  }

  override gravityAt(_p: THREE.Vector3, out: THREE.Vector3) { return out.set(0, 0, 0); }

  /** Earth, sun and stars for the current time, in the zone frame. Runs every frame before drawing. */
  private updateSky() {
    this.plane.frame(this.phiE, this.frame);
    const s = sunEci(this.day + (this.hours + this.met / 3600) / 24, _s);
    this.frame.toLocal(s, this.sunLocal).normalize();
    this.sky.setSunDirection(this.sunLocal);
    this.globe.setSun(this.sunLocal, 20);
    this.frame.globeQuaternion(this.theta, this.globe.mesh.quaternion);
    this.globe.mat.uniforms.uCloudShift.value = (this.met / 86400) * 0.6;
    this.stars.orient(this.frame.X, this.frame.Y, this.frame.Z);
    this.earthCentre.set(0, -this.rE, 0);
  }

  /** background objects relative to the final camera of the frame */
  private place = (cam: THREE.PerspectiveCamera) => {
    cam.getWorldPosition(_v);
    this.globe.mesh.position.copy(this.earthCentre).sub(_v);
    // eye adaptation: stars fade when the sunlit Earth or the sun fills the view
    const look = cam.getWorldDirection(_w);
    const toEarth = _s.copy(this.earthCentre).sub(_v).normalize();
    const earthIn = clamp((look.dot(toEarth) - 0.2) / 0.6, 0, 1);
    const sunUp = this.sky.sunColor.r > 0.05 ? 1 : 0;
    const sunIn = clamp((look.dot(this.sunLocal) - 0.6) / 0.4, 0, 1) * sunUp;
    const day = sunUp * (0.35 + 0.65 * earthIn) + sunIn;
    this.stars.setVisibility(2.4 * (1 - clamp(day, 0, 0.92)), 6.8 - 3.2 * clamp(day, 0, 1));
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
    this.sky.update(dt, _v, this.rE - R_EARTH + _v.y);
    this.lights.update(_v, dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.dockHud(); this.clocks(); }
  }

  private clocks() {
    const t = this.met;
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = Math.floor(t % 60);
    const pad = (x: number) => String(x).padStart(2, '0');
    const orbitFrac = ((this.phiE % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    const clocks = [{ label: 'MET', value: `${pad(hh)}:${pad(mm)}:${pad(ss)}` }, { label: 'ORBIT', value: `${(orbitFrac * 100).toFixed(0)}%` }];
    if (this.warp > 1) clocks.push({ label: 'TIME', value: `×${this.warp}` });
    ui.set({ clocks });
  }

  /** the docking display while flying Ranger 1 near the Endurance */
  private dockHud() {
    const flight = this.game.services.flight as Flight;
    const c = this.ranger;
    if (!c || flight.craft !== c) { ui.set({ dock: null }); return; }
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
    const c = this.ranger;
    if (c && this.docking.isDocked(c)) return 'Ranger 1 · docked to Endurance';
    const d = c ? c.position(_v).length() : 0;
    return d > 5 ? `Earth orbit · ${(this.rE - R_EARTH) / 1000 | 0} km · ${d < 2000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(1) + ' km'} from Endurance` : 'Earth orbit';
  }

  override serialize() {
    return { met: this.met, day: this.day, hours: this.hours, phiE0: this.phiE0, endurance: this.endurance.serialize(), ranger: this.ranger?.serialize(), docked: this.ranger ? this.docking.isDocked(this.ranger) : false };
  }
}

void D2R; void cwPropagate; void _q;

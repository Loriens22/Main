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

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color();

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
  /** 'ascent': the frame rides with the climbing launch vehicle; 'orbit': the Endurance's LVLH frame */
  mode: 'orbit' | 'ascent' = 'orbit';
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
    if (this.mode === 'orbit') this.met += dt * this.warp;
    this.endurance.fixedUpdate(dt);
    this.npcs.fixedUpdate(dt);
    this.docking.fixedUpdate(dt);
    this.ranger2?.fixedUpdate(dt, this.env);
    this.ranger?.fixedUpdate(dt, this.env);
  }

  override gravityAt(_p: THREE.Vector3, out: THREE.Vector3) { return out.set(0, 0, 0); }

  /** Earth, sun and stars for the current time, in the zone frame. Runs every frame before drawing. */
  private updateSky() {
    if (this.mode === 'orbit') { this.originR = this.rE; this.originPhi = this.phiE; }
    this.plane.frame(this.originPhi, this.frame);
    const s = sunEci(this.day + (this.hours + this.met / 3600) / 24, _s);
    this.frame.toLocal(s, this.sunLocal).normalize();
    this.sky.setSunDirection(this.sunLocal);
    this.globe.setSun(this.sunLocal, 20);
    this.frame.globeQuaternion(this.theta, this.globe.mesh.quaternion);
    this.globe.mat.uniforms.uCloudShift.value = (this.met / 86400) * 0.6;
    this.stars.orient(this.frame.X, this.frame.Y, this.frame.Z);
    this.earthCentre.set(0, -this.originR, 0);
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
    this.sky.update(dt, _v, this.originR - R_EARTH + _v.y);
    this.npcs.update(dt);
    if (this.mode === 'ascent' || this.stack) this.ascentVisuals(dt);
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
    if (this.mode === 'ascent' && this.sim) return `Ascent · ${(this.sim.h / 1000).toFixed(0)} km · ${(this.sim.downrange / 1000).toFixed(0)} km downrange`;
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

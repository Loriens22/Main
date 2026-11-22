import * as THREE from 'three';
import { Model } from '../render/Assets';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { Fixture, LightPool } from '../render/LightPool';
import { clamp, damp } from '../core/math';
import { bus } from '../core/events';

const G0 = 9.80665;

/** Performance data for a spacecraft. Forces in N, masses in kg, Isp in s. Local axes: +X right, +Y up, -Z forward. */
export interface CraftSpec {
  name: string;
  dryMass: number;
  fuelMax: number;
  /** main engines (total), thrust along the nose */
  main: { thrust: number; isp: number };
  /** ventral lift engines (total) for hovering and landing */
  lift: { thrust: number; isp: number };
  /** reaction control: force per translation axis, torque per rotation axis (pitch, yaw, roll) */
  rcs: { thrust: number; torque: [number, number, number]; isp: number };
  /** principal moments of inertia per kg of mass about local x (pitch), y (yaw), z (roll) */
  inertia: [number, number, number];
  /** drag area Cd*A seen along local x, y, z (m^2) and lift slope CL_alpha*S (m^2 per rad) */
  dragArea: [number, number, number];
  liftSlope: number;
}

/*
 * The Ranger flies single-stage to orbit and back from worlds of up to 1.3 g, as in the film. No chemical rocket
 * of its size can (it needs ~11 km/s from Miller's planet); the game gives it a fictional high-exhaust-velocity
 * drive (Isp ~5000 s main, 4200 s lift) with enough thrust to hover fully fuelled at 1.3 g. Documented in
 * docs/SPACE.md. Docking and orbital handling are unaffected (reaction control is conventional).
 */
export const RANGER_SPEC: CraftSpec = {
  name: 'Ranger 1',
  dryMass: 18000,
  fuelMax: 10000,
  main: { thrust: 420000, isp: 5000 },
  lift: { thrust: 640000, isp: 4200 },
  rcs: { thrust: 9000, torque: [70000, 70000, 50000], isp: 230 },
  inertia: [25.6, 28.2, 3.3],
  dragArea: [35, 125, 6.5],
  liftSlope: 120,
};

/** What the craft needs from the place it is flying in. Positions in the zone frame. */
export interface FlightEnv {
  gravity(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** air density kg/m^3 at p (0 in vacuum) */
  density(p: THREE.Vector3): number;
  /** wind velocity (m/s) at p */
  wind?(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** height above the ground under p, if there is a ground */
  altitude?(p: THREE.Vector3): number | null;
  /** velocity-dependent apparent acceleration of a rotating frame (Coriolis, tidal terms), m/s^2 */
  accel?(p: THREE.Vector3, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** the craft's velocity relative to the ground and air, when the zone flies it on a program (zone frame) */
  velocity?(out: THREE.Vector3): THREE.Vector3 | null;
}

interface Thruster { node: THREE.Object3D; dir: THREE.Vector3; pos: THREE.Vector3; level: number; sprite: THREE.Sprite; was: boolean }
interface Gear { node: THREE.Object3D; q0: THREE.Quaternion; axis: THREE.Vector3; angle: number; colliders: RAPIER.Collider[] }
interface Plume { node: THREE.Object3D; mesh: THREE.Mesh; light?: Fixture; kind: 'main' | 'lift'; w: number; h: number }

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _g = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const _rp = new THREE.Vector3(), _ra = new THREE.Vector3(), _ex = new THREE.Vector3(), _pv = new THREE.Vector3();
const blenderDir = (d: number[]) => new THREE.Vector3(d[0], d[2], -d[1]);

let puffTex: THREE.Texture | null = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(235,240,255,0.55)');
  gr.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

/** Additive exhaust: hot core near the nozzle fading to a long, faint, wider jet; expands in vacuum. */
export function plumeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uLevel: { value: 0 }, uTime: { value: 0 }, uVac: { value: 0 }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLevel, uTime, uVac, uGain;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float along = vUv.y;                           // 0 at the nozzle, 1 at the tail
        float rim = pow(abs(dot(vN, vV)), 1.6);        // brighter through the middle of the jet
        float core = exp(-along * mix(9.0, 4.0, uVac));
        float diamonds = 0.75 + 0.25 * sin(along * 46.0 - uTime * 30.0) * (1.0 - uVac);
        float flick = 0.88 + 0.12 * sin(uTime * 61.0 + along * 13.0);
        vec3 hot = vec3(0.85, 0.92, 1.0) * 6.0;
        vec3 mid = mix(vec3(1.0, 0.55, 0.22), vec3(0.45, 0.6, 1.0), uVac) * 2.2;
        vec3 col = mix(mid, hot, core);
        float a = (core * 1.4 + 0.35 * (1.0 - along)) * rim * diamonds * flick * uLevel;
        gl_FragColor = vec4(col * a * uGain, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export type SasMode = 'off' | 'rate' | 'hold';

/**
 * A rigid-body spacecraft built from an exported model: convex-hull colliders, mass properties that follow the
 * fuel load, main and lift engines, reaction control with individually animated thrusters, stability
 * augmentation, aerodynamic drag and lift, landing gear and exhaust effects.
 */
export class Spacecraft {
  root = new THREE.Group();
  body!: RAPIER.RigidBody;
  colliders: RAPIER.Collider[] = [];
  fuel: number;
  /** pilot / autopilot commands */
  throttle = 0;
  lift = 0;
  /** rotation command: x pitch (+ nose up), y yaw (+ nose left), z roll (+ right wing down), each -1..1 */
  rot = new THREE.Vector3();
  /** translation command in local axes: x right, y up, z forward (+ = toward the nose), each -1..1 */
  trans = new THREE.Vector3();
  sas: SasMode = 'rate';
  holdQ = new THREE.Quaternion();
  gearDown = true;
  gearT = 1;
  lightsOn = false;
  infiniteFuel = false;
  /** show the main-engine plume although the craft is carried (finishing an insertion on the launch vehicle) */
  plumeWhileCarried = false;
  /** last-step readouts */
  accel = new THREE.Vector3();
  gLoad = 0;
  mainFlow = 0;
  /** kinematic carriage (mounted on a launcher, docked): physics paused, root follows `carrier` */
  carried = false;
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private curPos = new THREE.Vector3();
  private curQuat = new THREE.Quaternion();
  private com = new THREE.Vector3();
  private thrusters: Thruster[] = [];
  private gears: Gear[] = [];
  private plumes: Plume[] = [];
  private navLights: Fixture[] = [];
  private landLights: Fixture[] = [];
  private time = 0;
  private lastMass = 0;
  private lastVel = new THREE.Vector3();
  /** velocity the integrator should produce this step without contacts; a larger change is an impact */
  private expectVel = new THREE.Vector3();
  private expectValid = false;
  /** structural damage 0..1 (Creative Mode: recoverable) */
  damage = 0;
  onImpact: ((dv: number, at: THREE.Vector3) => void) | null = null;

  constructor(public id: string, public spec: CraftSpec, public model: Model, private phys: PhysicsWorld, private lights: LightPool | null) {
    this.fuel = spec.fuelMax;
    this.root.name = `craft:${id}`;
    this.root.add(model.root);
    model.root.updateMatrixWorld(true);
    const cog = model.marker('cog', 'ranger') ?? model.ofKind('cog')[0];
    if (cog) cog.node.getWorldPosition(this.com);
    this.buildBody();
    // gear legs
    for (const m of model.ofKind('gear')) {
      const n = m.node;
      this.gears.push({ node: n, q0: n.quaternion.clone(), axis: blenderDir(m.data.axis ?? [1, 0, 0]).normalize(), angle: ((m.data.angle ?? 90) * Math.PI) / 180, colliders: [] });
    }
    // reaction control thrusters
    const tex = puffTexture();
    for (const m of model.ofKind('rcs')) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xe8eeff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sp.scale.setScalar(0.01);
      m.node.add(sp);
      const dir = blenderDir(m.data.dir ?? [0, 0, 1]).normalize();
      // markers carry no rotation, so their parent-space direction is the model direction
      this.thrusters.push({ node: m.node, dir, pos: m.node.getWorldPosition(new THREE.Vector3()).sub(this.com), level: 0, sprite: sp, was: false });
    }
    // engine plumes
    for (const m of model.ofKind('engine')) {
      const kind = m.id.startsWith('lift') ? 'lift' : 'main';
      const w = m.data.w ?? 1, h = m.data.h ?? 0.6;
      const geo = new THREE.CylinderGeometry(1, 0.55, 1, 20, 6, true);
      geo.translate(0, -0.5, 0);
      // uv.y must run from the nozzle (0) to the tail (1): CylinderGeometry has v = 1 at the top
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const mesh = new THREE.Mesh(geo, plumeMaterial());
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      const holder = new THREE.Object3D();
      const d = blenderDir(m.data.dir ?? [0, -1, 0]).normalize();
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
      holder.add(mesh);
      mesh.scale.set(w * 0.5, 0.01, h * 0.5);
      m.node.add(holder);
      const p: Plume = { node: holder, mesh, kind, w, h };
      if (lights) p.light = lights.add({ node: m.node, power: 0, dist: 30, color: new THREE.Color(1.0, 0.75, 0.5), on: true });
      this.plumes.push(p);
    }
    // nav and landing lights from the model markers
    if (lights) for (const m of model.ofKind('light')) {
      const g = m.data.group;
      if (g === 'ranger_nav' || g === 'ranger_land' || g === 'ranger_dock') {
        const f = lights.addFromMarker(m.node, m.data, g === 'ranger_nav');
        f.angle = 0.5;
        (g === 'ranger_nav' ? this.navLights : this.landLights).push(f);
      } else if (g === 'ranger_cabin') {
        lights.addFromMarker(m.node, m.data, true).room = 'cabin';
      }
    }
    // the visual model is offset so that the body origin (and this.root) is the centre of mass
    this.model.root.position.copy(this.com).negate();
  }

  private buildBody() {
    const w = this.phys.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setGravityScale(0).setCanSleep(false).setLinearDamping(0).setAngularDamping(0));
    this.body.enableCcd(true);
    const inv = new THREE.Matrix4().copy(this.model.root.matrixWorld).invert();
    for (const mesh of this.model.colliders) {
      const pos = mesh.geometry.attributes.position;
      _m.multiplyMatrices(inv, mesh.matrixWorld);
      const pts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(_m).sub(this.com);
        pts[i * 3] = _v.x; pts[i * 3 + 1] = _v.y; pts[i * 3 + 2] = _v.z;
      }
      const desc = RAPIER.ColliderDesc.convexHull(pts);
      if (!desc) continue;
      desc.setDensity(0).setFriction(0.9).setRestitution(0.02).setCollisionGroups(groups(GROUP.VEHICLE, GROUP.WORLD | GROUP.VEHICLE | GROUP.DYNAMIC));
      const c = w.createCollider(desc, this.body);
      (c as any).__name = mesh.parent?.name || mesh.name;
      this.colliders.push(c);
    }
    this.updateMass(true);
  }

  /**
   * Solid for people on foot (the craft standing on a planet's surface): the hull pieces again, touched by the player
   * only (the hull's own colliders meet the world and other craft; a seated player has no collider), and the deployed
   * gear legs, so nobody walks through the Ranger standing on its pad.
   */
  private peopleCols: RAPIER.Collider[] = [];
  setSolidForPeople(on: boolean, gear = true) {
    const w = this.phys.world;
    for (const c of this.peopleCols) w.removeCollider(c, false);
    this.peopleCols = [];
    if (!on) return;
    const grp = groups(GROUP.VEHICLE, GROUP.PLAYER);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const hull = (meshes: THREE.Mesh[]) => {
      const pts: number[] = [];
      for (const mesh of meshes) {
        const pos = mesh.geometry.attributes.position;
        _m.multiplyMatrices(inv, mesh.matrixWorld);
        for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(_m); pts.push(_v.x, _v.y, _v.z); }
      }
      const desc = pts.length >= 12 ? RAPIER.ColliderDesc.convexHull(new Float32Array(pts)) : null;
      if (desc) this.peopleCols.push(w.createCollider(desc.setDensity(0).setFriction(0.9).setCollisionGroups(grp), this.body));
    };
    for (const mesh of this.model.colliders) hull([mesh]);
    if (gear) for (const g of this.gears) {
      const ms: THREE.Mesh[] = [];
      g.node.traverse((o) => { if ((o as THREE.Mesh).isMesh) ms.push(o as THREE.Mesh); });
      hull(ms);
    }
  }

  get mass() { return this.spec.dryMass + this.fuel; }

  private updateMass(force = false) {
    const m = this.mass;
    if (!force && Math.abs(m - this.lastMass) < 25) return;
    this.lastMass = m;
    const I = this.spec.inertia;
    this.body.setAdditionalMassProperties(m, { x: 0, y: 0, z: 0 }, { x: I[0] * m, y: I[1] * m, z: I[2] * m }, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  /** Place the craft (zone frame). `pos` is the model origin (belly centre), not the centre of mass. */
  place(pos: THREE.Vector3Like, quat: THREE.Quaternion, vel?: THREE.Vector3Like) {
    _v.copy(this.com).applyQuaternion(quat).add(pos as THREE.Vector3);
    this.body.setTranslation(_v, true);
    this.body.setRotation(quat, true);
    this.body.setLinvel(vel ?? { x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.expectValid = false;
    this.syncFromBody(true);
  }

  /** Attach to something that moves it (launch stack, docking port): physics off, pose set every frame. */
  setCarried(on: boolean) {
    this.carried = on;
    this.expectValid = false;
    this.body.setBodyType(on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
    if (!on) this.updateMass(true);
  }

  /** Pose for a carried craft: model origin position and orientation. */
  carry(pos: THREE.Vector3Like, quat: THREE.Quaternion, vel?: THREE.Vector3Like) {
    _v.copy(this.com).applyQuaternion(quat).add(pos as THREE.Vector3);
    this.body.setNextKinematicTranslation(_v);
    this.body.setNextKinematicRotation(quat);
    if (vel) this.lastVel.set(vel.x, vel.y, vel.z);
    // the commanded pose is the pose: interpolate toward it now, in step with whatever carries the craft
    this.prevPos.copy(this.curPos); this.prevQuat.copy(this.curQuat);
    this.curPos.copy(_v); this.curQuat.copy(quat);
    this.carriedThisStep = true;
  }
  private carriedThisStep = false;

  // ------------------------------------------------------------------------------------------- readouts
  position(out = new THREE.Vector3()) { return out.copy(this.curPos); }
  quaternion(out = new THREE.Quaternion()) { return out.copy(this.curQuat); }
  velocity(out = new THREE.Vector3()) { const v = this.body.linvel(); return out.set(v.x, v.y, v.z); }
  angVel(out = new THREE.Vector3()) { const v = this.body.angvel(); return out.set(v.x, v.y, v.z); }
  /** world direction of a local axis */
  axis(local: THREE.Vector3Like, out = new THREE.Vector3()) { return out.set(local.x, local.y, local.z).applyQuaternion(this.curQuat); }
  forward(out = new THREE.Vector3()) { return this.axis({ x: 0, y: 0, z: -1 }, out); }
  up(out = new THREE.Vector3()) { return this.axis({ x: 0, y: 1, z: 0 }, out); }
  /** world position (physics pose) of a model-space point */
  pointWorld(modelPoint: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(modelPoint).sub(this.com).applyQuaternion(this.curQuat).add(this.curPos);
  }

  /** world velocity of a model-space point (translation plus rotation) */
  pointVelocity(modelPoint: THREE.Vector3, out = new THREE.Vector3()) {
    const r = _pv.copy(modelPoint).sub(this.com).applyQuaternion(this.curQuat);
    const w = this.body.angvel(), v = this.body.linvel();
    return out.set(w.y * r.z - w.z * r.y + v.x, w.z * r.x - w.x * r.z + v.y, w.x * r.y - w.y * r.x + v.z);
  }

  /** centre of mass in model space */
  get comModel() { return this.com; }

  /** position of a marker in model space (the GLB's own coordinates) */
  markerLocal(kind: string, id: string, out = new THREE.Vector3()) {
    const n = this.model.node(kind, id);
    if (!n) return null;
    this.root.updateMatrixWorld(true);
    n.getWorldPosition(out);
    return this.model.root.worldToLocal(out);
  }

  /** model-space point (engine coordinates of the GLB) to zone space */
  modelToWorld(p: THREE.Vector3) { return this.model.root.localToWorld(p); }

  setGear(down: boolean) {
    if (down === this.gearDown) return;
    this.gearDown = down;
    bus.emit('sfx', { id: 'hatch', node: this.root, gain: 0.5 });
  }

  setLights(on: boolean) {
    this.lightsOn = on;
    for (const f of this.landLights) f.on = on;
  }

  // ------------------------------------------------------------------------------------------- simulation
  fixedUpdate(dt: number, env: FlightEnv) {
    this.time += dt;
    if (this.carried) {
      this.expectValid = false;
      if (!this.carriedThisStep) this.syncFromBody();
      this.carriedThisStep = false;
      this.fireRcs(_v.set(0, 0, 0), _w.set(0, 0, 0), dt); this.mainFlow = 0; return;
    }
    const b = this.body, s = this.spec;
    const t = b.translation(), r = b.rotation();
    const p = _a.set(t.x, t.y, t.z);
    _q.set(r.x, r.y, r.z, r.w);
    const qi = _q2.copy(_q).invert();
    const m = this.mass;
    const lv = b.linvel(), av = b.angvel();
    const vel = _t.set(lv.x, lv.y, lv.z);
    if (this.expectValid) {
      const dv = _g.copy(vel).sub(this.expectVel).length();
      if (dv > 0.12) {
        this.damage = Math.min(1, this.damage + Math.max(0, dv - 0.25) * 0.06);
        this.onImpact?.(dv, p);
        bus.emit('craft:impact', { craft: this, dv });
      }
    }
    const angLocal = _w.set(av.x, av.y, av.z).applyQuaternion(qi);
    const fuelOk = this.fuel > 0 || this.infiniteFuel;
    // ---- engines
    const thr = fuelOk ? clamp(this.throttle, 0, 1) : 0;
    const lift = fuelOk ? clamp(this.lift, 0, 1) : 0;
    _f.set(0, lift * s.lift.thrust, -thr * s.main.thrust);
    let flow = (thr * s.main.thrust) / (s.main.isp * G0) + (lift * s.lift.thrust) / (s.lift.isp * G0);
    this.mainFlow = flow;
    // ---- reaction control: translation and stability augmentation
    const tcmd = _v.set(this.trans.x, this.trans.y, -this.trans.z);
    if (!fuelOk) tcmd.set(0, 0, 0);
    _f.addScaledVector(tcmd, s.rcs.thrust);
    const I = s.inertia;
    const tq = new THREE.Vector3();
    const want = new THREE.Vector3(this.rot.x, this.rot.y, this.rot.z);
    const manual = want.lengthSq() > 1e-4;
    if (this.sas === 'hold' && !manual) {
      // attitude hold: PD on the rotation that takes the current orientation to the held one
      const e = new THREE.Quaternion().copy(qi).multiply(this.holdQ);
      if (e.w < 0) { e.x = -e.x; e.y = -e.y; e.z = -e.z; e.w = -e.w; }
      const ang = 2 * Math.acos(clamp(e.w, -1, 1));
      const ax = new THREE.Vector3(e.x, e.y, e.z);
      if (ax.lengthSq() > 1e-10) ax.normalize().multiplyScalar(ang);
      for (let i = 0; i < 3; i++) {
        const Ii = I[i] * m, Ti = s.rcs.torque[i];
        const kp = 1.6, kd = 2.6;
        tq.setComponent(i, clamp((kp * ax.getComponent(i) - kd * angLocal.getComponent(i)) * Ii, -Ti, Ti));
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const Ti = s.rcs.torque[i];
        const cmd = want.getComponent(i);
        if (Math.abs(cmd) > 0.01) tq.setComponent(i, cmd * Ti);
        else if (this.sas !== 'off') tq.setComponent(i, clamp(-angLocal.getComponent(i) * I[i] * m * 3.0, -Ti, Ti));
      }
      if (manual && this.sas === 'hold') this.holdQ.copy(_q);
    }
    if (!fuelOk) tq.set(0, 0, 0);
    flow += (Math.abs(tcmd.x) + Math.abs(tcmd.y) + Math.abs(tcmd.z)) * s.rcs.thrust / (s.rcs.isp * G0);
    flow += (Math.abs(tq.x) / s.rcs.torque[0] + Math.abs(tq.y) / s.rcs.torque[1] + Math.abs(tq.z) / s.rcs.torque[2]) * 2 * s.rcs.thrust / (s.rcs.isp * G0);
    if (!this.infiniteFuel) this.fuel = Math.max(0, this.fuel - flow * dt);
    this.fireRcs(tcmd, tq, dt);
    // ---- aerodynamics in the body frame
    const rho = env.density(p);
    const aero = new THREE.Vector3();
    if (rho > 1e-6) {
      const air = vel.clone();
      if (env.wind) air.sub(env.wind(p, _g));
      const vl = air.applyQuaternion(qi);
      const sp = vl.length();
      if (sp > 0.05) {
        const q = 0.5 * rho;
        const A = s.dragArea;
        aero.set(-q * A[0] * vl.x * Math.abs(vl.x), -q * A[1] * vl.y * Math.abs(vl.y), -q * A[2] * vl.z * Math.abs(vl.z));
        // lifting body: lift perpendicular to the airflow in the symmetry plane, from the angle of attack
        const alpha = Math.atan2(-vl.y, -vl.z);
        if (vl.z < 0) {
          const L = q * sp * sp * s.liftSlope * clamp(alpha, -0.5, 0.5);
          aero.y += L * Math.cos(alpha);
          aero.z -= L * Math.sin(alpha);
        }
        // weathervane stability and rotational damping in air
        tq.x += -angLocal.x * q * sp * 2200 + q * sp * sp * -alpha * 9;
        tq.y += -angLocal.y * q * sp * 2200 - q * sp * sp * Math.atan2(vl.x, -vl.z) * 9;
        tq.z += -angLocal.z * q * sp * 400;
      }
    }
    _f.add(aero);
    // ---- apply (impulses over the step), gravity on the whole mass
    const F = _f.applyQuaternion(_q);
    env.gravity(p, _g);
    if (env.accel) _g.add(env.accel(p, vel, _ex));
    this.accel.copy(F).divideScalar(m);
    this.gLoad = this.accel.length() / G0;
    b.applyImpulse({ x: (F.x + _g.x * m) * dt, y: (F.y + _g.y * m) * dt, z: (F.z + _g.z * m) * dt }, true);
    this.expectVel.copy(vel).addScaledVector(this.accel, dt).addScaledVector(_g, dt);
    this.expectValid = true;
    const T = tq.applyQuaternion(_q);
    b.applyTorqueImpulse({ x: T.x * dt, y: T.y * dt, z: T.z * dt }, true);
    this.updateMass();
    this.syncFromBody();
  }

  /** Light up the thrusters whose push matches the commanded force and torque (local frame). */
  private fireRcs(force: THREE.Vector3, torque: THREE.Vector3, dt: number) {
    const s = this.spec;
    const fN = force.clone().divideScalar(1), tN = torque.clone();
    for (let i = 0; i < 3; i++) tN.setComponent(i, tN.getComponent(i) / s.rcs.torque[i]);
    for (const th of this.thrusters) {
      const push = _rp.copy(th.dir).negate();
      let lvl = Math.max(0, push.dot(fN));
      const arm = _ra.crossVectors(th.pos, push);
      if (arm.lengthSq() > 0.01) lvl = Math.max(lvl, Math.max(0, arm.normalize().dot(tN)) * 0.9);
      lvl = lvl > 0.08 ? Math.min(1, lvl) : 0;
      th.level = damp(th.level, lvl, lvl > th.level ? 40 : 18, dt);
      if (lvl > 0 && !th.was) bus.emit('sfx', { id: 'rcs', node: th.node, gain: 0.5 });
      th.was = lvl > 0;
    }
  }

  private syncFromBody(snap = false) {
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    const t = this.body.translation(), r = this.body.rotation();
    this.curPos.set(t.x, t.y, t.z);
    this.curQuat.set(r.x, r.y, r.z, r.w);
    if (snap) { this.prevPos.copy(this.curPos); this.prevQuat.copy(this.curQuat); }
  }

  update(dt: number, alpha: number, ambientPressure = 1) {
    this.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQuat, this.curQuat, alpha);
    // gear
    const tgt = this.gearDown ? 1 : 0;
    if (this.gearT !== tgt) {
      this.gearT = clamp(this.gearT + Math.sign(tgt - this.gearT) * dt / 3.2, 0, 1);
      const e = this.gearT * this.gearT * (3 - 2 * this.gearT);
      for (const g of this.gears) g.node.quaternion.copy(g.q0).multiply(_q.setFromAxisAngle(g.axis, g.angle * (1 - e)));
      for (const c of this.colliders) {
        const n = (c as any).__name as string;
        if (n && (n.includes('foot') || n.includes('pad'))) c.setEnabled(this.gearT > 0.95);
      }
    }
    // exhaust plumes: longer and wider in vacuum
    const vac = clamp(1 - ambientPressure, 0, 1);
    for (const p of this.plumes) {
      const lvl = p.kind === 'main' ? (this.carried && !this.plumeWhileCarried ? 0 : this.fuel > 0 || this.infiniteFuel ? clamp(this.throttle, 0, 1) : 0) : clamp(this.lift, 0, 1);
      const mat = p.mesh.material as THREE.ShaderMaterial;
      const cur = mat.uniforms.uLevel.value as number;
      const l = damp(cur, lvl, 12, dt);
      mat.uniforms.uLevel.value = l;
      mat.uniforms.uTime.value += dt;
      mat.uniforms.uVac.value = vac;
      const len = (p.kind === 'main' ? 9 : 4) * (0.25 + 0.75 * l) * (1 + vac * 0.8);
      p.mesh.scale.set(p.w * 0.5 * (1 + vac * 0.9 * l), Math.max(0.01, len), p.h * 0.5 * (1 + vac * 0.9 * l));
      p.mesh.visible = l > 0.01;
      if (p.light) p.light.power = l * 180;
    }
    // RCS puffs
    for (const th of this.thrusters) {
      const m = th.sprite.material as THREE.SpriteMaterial;
      m.opacity = th.level * (0.55 + 0.25 * Math.random()) * (0.35 + vac * 0.65);
      const sc = 0.4 + th.level * (1.0 + vac * 1.2);
      th.sprite.scale.setScalar(th.level > 0.01 ? sc : 0.001);
      th.sprite.position.copy(th.dir).multiplyScalar(0.2 + sc * 0.35);
    }
    // navigation strobes and steady position lights
    const blink = (this.time % 1.2) < 0.08;
    for (const f of this.navLights) f.level = (f as any).node?.userData?.id?.startsWith?.('strobe') || (f as any).node?.userData?.id?.startsWith?.('tail') ? (blink ? 1 : 0) : 1;
  }

  dispose() {
    if (this.phys.world.bodies.contains(this.body.handle)) this.phys.world.removeRigidBody(this.body);
    this.root.removeFromParent();
  }

  serialize() {
    return { pos: this.curPos.toArray(), quat: this.curQuat.toArray(), vel: this.velocity().toArray(), fuel: this.fuel, gear: this.gearDown, lights: this.lightsOn, sas: this.sas };
  }
}

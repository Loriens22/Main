import * as THREE from 'three';
import type { Model } from '../render/Assets';
import { plumeMaterial, Spacecraft } from '../vehicles/Spacecraft';
import type { Fixture, LightPool } from '../render/LightPool';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

/**
 * How Ranger 1 sits on the payload adapter, in the launch vehicle's local frame (+Y up the stack): the Ranger's
 * rear docking face on the adapter ring, nose up, its top facing the crew access arm (-X of the vehicle).
 * Columns are the images of the Ranger model axes: X -> +Z, Y -> -X, Z -> -Y.
 */
export const RANGER_ON_STACK = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)));

interface Plume { node: THREE.Object3D; mesh: THREE.Mesh; stage: 1 | 2; r: number }
export interface Debris { obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; age: number }

/**
 * The launch vehicle with Ranger 1 on top, as one assembly that either zone can fly: stage plumes that lengthen
 * and balloon with altitude, engine light, and the separations (first stage with its interstage, then the second
 * stage with the payload adapter) that turn into tumbling debris.
 */
export class LaunchStack {
  root = new THREE.Group();
  ranger: Spacecraft | null = null;
  plumes: Plume[] = [];
  /** visual engine levels 0..1 */
  level1 = 0;
  level2 = 0;
  vac = 0;
  debris: Debris[] = [];
  stage = 1;
  private rangerLocal = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private light: Fixture | null = null;
  private time = 0;
  stage1Nodes: THREE.Object3D[] = [];
  stage2Nodes: THREE.Object3D[] = [];

  constructor(public model: Model, private lights: LightPool | null) {
    this.root.name = 'launch-stack';
    this.root.add(model.root);
    for (const id of ['stage1', 'interstage']) { const n = model.part(id); if (n) this.stage1Nodes.push(n); }
    for (const id of ['stage2', 'adapter']) { const n = model.part(id); if (n) this.stage2Nodes.push(n); }
    for (const m of model.ofKind('plume')) {
      const stage: 1 | 2 = m.id.startsWith('s1') ? 1 : 2;
      const geo = new THREE.CylinderGeometry(1, 0.6, 1, 24, 8, true);
      geo.translate(0, -0.5, 0);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const mat = plumeMaterial();
      // five big engines overlap: keep the sum from burning out to white
      mat.uniforms.uGain.value = stage === 1 ? 0.3 : 0.45;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      mesh.visible = false;
      m.node.add(mesh);
      this.plumes.push({ node: m.node, mesh, stage, r: m.data.r ?? 1.1 });
    }
    if (lights) {
      const base = model.marker('plume', 's1_0')?.node;
      if (base) this.light = lights.add({ node: base, power: 0, dist: 140, color: new THREE.Color(1.0, 0.7, 0.42), on: true });
    }
  }

  /** Mount a Ranger on the adapter (it becomes a carried craft that follows the stack). */
  mount(c: Spacecraft) {
    this.ranger = c;
    c.setCarried(true);
    this.root.updateMatrixWorld(true);
    const mountR = this.model.node('mount', 'ranger');
    const mountM = c.markerLocal('mount', 'launcher');
    if (!mountR || !mountM) return;
    // the Ranger's model origin in the vehicle's local frame
    const inv = _m.copy(this.model.root.matrixWorld).invert();
    const pr = mountR.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    this.rangerLocal.quat.copy(RANGER_ON_STACK);
    this.rangerLocal.pos.copy(mountM).applyQuaternion(RANGER_ON_STACK).negate().add(pr);
    this.carryRanger(true);
  }

  /** Put the carried Ranger where the stack is now. */
  carryRanger(snap = false) {
    const c = this.ranger;
    if (!c || !c.carried) return;
    this.model.root.updateWorldMatrix(true, false);
    const wq = this.model.root.getWorldQuaternion(_q);
    const pos = _v.copy(this.rangerLocal.pos).applyMatrix4(this.model.root.matrixWorld);
    const quat = wq.clone().multiply(this.rangerLocal.quat);
    // world -> the craft's parent space (the zone root)
    const parent = c.root.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const pinv = _m.copy(parent.matrixWorld).invert();
      pos.applyMatrix4(pinv);
      quat.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    if (snap) c.place(pos, quat); else c.carry(pos, quat);
  }

  /** Release the Ranger: returns its current pose so the caller can hand it to free flight. */
  releaseRanger() {
    const c = this.ranger;
    this.ranger = null;
    return c;
  }

  /** First stage and interstage fall away; the caller supplies the zone root they belong to now. */
  separate(stage: 1 | 2, into: THREE.Object3D, vel: THREE.Vector3, spin: THREE.Vector3) {
    const nodes = stage === 1 ? this.stage1Nodes : this.stage2Nodes;
    const g = new THREE.Group();
    g.name = `debris-stage${stage}`;
    into.add(g);
    this.root.updateMatrixWorld(true);
    into.updateMatrixWorld(true);
    // the debris frame sits at the stage's own centre so it tumbles about it
    const box = new THREE.Box3();
    for (const n of nodes) box.expandByObject(n);
    const c = box.getCenter(new THREE.Vector3());
    g.position.copy(into.worldToLocal(c.clone()));
    into.updateMatrixWorld(true);
    for (const n of nodes) g.attach(n);
    for (const p of this.plumes) if (p.stage === stage) p.mesh.visible = false;
    this.debris.push({ obj: g, vel: vel.clone(), spin: spin.clone(), age: 0 });
    if (stage === 1) this.stage = 2; else this.stage = 3;
    return g;
  }

  /** Visual update. `frameAccel` is the acceleration of the frame the debris lives in (it falls back in it). */
  update(dt: number, frameAccel?: THREE.Vector3) {
    this.time += dt;
    for (const p of this.plumes) {
      const lvl = p.stage === 1 ? (this.stage === 1 ? this.level1 : 0) : (this.stage === 2 ? this.level2 : 0);
      const mat = p.mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uLevel.value = lvl;
      mat.uniforms.uTime.value = this.time;
      mat.uniforms.uVac.value = this.vac;
      p.mesh.visible = lvl > 0.01;
      // sea-level jets are long and narrow; in thin air the exhaust balloons out behind the vehicle
      const len = (p.stage === 1 ? 34 : 26) * (0.35 + 0.65 * lvl) * (1 + this.vac * 1.6);
      const wid = p.r * (1 + this.vac * (p.stage === 1 ? 5.5 : 9));
      p.mesh.scale.set(wid, len, wid);
    }
    if (this.light) this.light.power = Math.max(this.level1 * (this.stage === 1 ? 1 : 0), this.level2 * (this.stage === 2 ? 0.4 : 0)) * 2200 * (1 - this.vac * 0.7);
    for (const d of this.debris) {
      d.age += dt;
      if (frameAccel) d.vel.addScaledVector(frameAccel, -dt);
      d.obj.position.addScaledVector(d.vel, dt);
      _q.setFromEuler(new THREE.Euler(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt));
      d.obj.quaternion.multiply(_q);
    }
  }

  /** world position of the stack's base (engine plane) */
  base(out: THREE.Vector3) { return this.root.getWorldPosition(out); }

  dispose() {
    for (const d of this.debris) d.obj.removeFromParent();
    this.debris = [];
    this.root.removeFromParent();
    void _s;
  }
}

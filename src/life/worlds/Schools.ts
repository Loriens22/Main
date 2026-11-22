import * as THREE from 'three';
import type { Model } from '../../render/Assets';
import type { Contact, Habitat } from '../Creature';
import { hashRand } from '../Creature';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -1);

/**
 * A copy of a geometry with float positions and normals: compressed models store them quantised (normalised
 * integers, de-quantised by their node's transform), which cannot hold a baked world transform.
 */
export function floatGeometry(src: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as THREE.BufferAttribute;
    if (name === 'position' || name === 'normal' || (a as any).isInterleavedBufferAttribute) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i);
      g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    } else g.setAttribute(name, a);
  }
  if (src.index) g.setIndex(src.index);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  return g;
}

interface Fish { off: THREE.Vector3; pos: THREE.Vector3; vel: THREE.Vector3; size: number; alive: boolean; regrow: number }

/** a school of rift darters: one sensed contact for the predators, many animals for the eye */
export interface School {
  contact: Contact;
  home: THREE.Vector3;
  range: number;
  goal: THREE.Vector3;
  fish: Fish[];
  /** 0 tight .. 1 scattered */
  scatter: number;
  yaw: number;
}

/** something the fish react to: a light they gather at, a body they flee */
export interface SchoolStimulus { pos: THREE.Vector3; light: number; threat: number; size: number }

const WIGGLE = /* glsl */ `
#include <begin_vertex>
{
  // the body wave of a small swimmer: grows toward the tail (the model's +z), faster when the fish is hurried
  float tw = smoothstep( -0.14 * uFishL, 0.68 * uFishL, position.z );
  transformed.x += sin( uFishT * ( 11.0 + 6.0 * aPhase ) + aPhase * 6.2831 - position.z * ( 6.6 / uFishL ) ) * 0.064 * uFishL * tw;
}
`;

/**
 * Schools of rift darters: the canyon's forage animals, drawn instanced. Each school ranges over its own reach of the
 * rift, holding together in mid-water; it scatters from anything large moving close (predators, the submersible,
 * a swimmer), drifts toward steady lights (a siren's lure, the sub's lamps) and loses fish to predators, which
 * the reach slowly makes good.
 */
export class Schools {
  group = new THREE.Group();
  list: School[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private phase: THREE.InstancedBufferAttribute;
  private uT = { value: 0 };
  private per: number;
  private base: number;
  private uL: { value: number };

  /**
   * opts.base: the model's own length (m); opts.size: the members' length range; opts.cloud: the school's spread
   * (half-extents across, up, along the swimming direction)
   */
  constructor(model: Model, homes: { pos: THREE.Vector3; range: number }[], per = 44, opts: { base?: number; size?: [number, number]; cloud?: [number, number, number] } = {}) {
    this.per = per;
    this.base = opts.base ?? 0.22;
    this.uL = { value: this.base };
    const [s0, s1] = opts.size ?? [0.17, 0.26];
    const [cx, cy, cz] = opts.cloud ?? [1.1, 0.45, 1.6];
    const max = homes.length * per;
    const ph = new Float32Array(max);
    for (let i = 0; i < max; i++) ph[i] = hashRand('darter', i);
    this.phase = new THREE.InstancedBufferAttribute(ph, 1);
    model.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.root.matrixWorld).invert();
    const done = new Map<THREE.Material, THREE.Material>();
    model.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = floatGeometry(mesh.geometry).applyMatrix4(_m.multiplyMatrices(inv, mesh.matrixWorld));
      geo.setAttribute('aPhase', this.phase);
      const src = mesh.material as THREE.Material;
      let mat = done.get(src);
      if (!mat) { mat = this.wiggle(src); done.set(src, mat); }
      const im = new THREE.InstancedMesh(geo, mat, max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = true;
      im.count = 0;
      this.meshes.push(im);
      this.group.add(im);
    });
    homes.forEach((h, si) => {
      const fish: Fish[] = [];
      for (let i = 0; i < per; i++) {
        const id = `school${si}`;
        // a flattened, elongated cloud: wider than tall, longer along the swimming direction
        const off = new THREE.Vector3((hashRand(id, i * 3) - 0.5) * 2 * cx, (hashRand(id, i * 3 + 1) - 0.5) * 2 * cy, (hashRand(id, i * 3 + 2) - 0.5) * 2 * cz);
        fish.push({ off, pos: h.pos.clone().add(off), vel: new THREE.Vector3(), size: s0 + (s1 - s0) * hashRand(id, i + 99), alive: true, regrow: 0 });
      }
      const pos = h.pos.clone();
      this.list.push({
        contact: { id: `school${si}`, kind: 'prey', pos, vel: new THREE.Vector3(), size: this.base, light: 0, noise: 0.05 },
        home: h.pos.clone(), range: h.range, goal: h.pos.clone(), fish, scatter: 0, yaw: hashRand('s', si) * 6.28,
      });
    });
    for (const s of this.list) s.contact.ref = s;
  }

  /** a copy of the material with the swimming wave added to its (already patched) shader */
  private wiggle(src: THREE.Material) {
    const m = src.clone();
    const prev = src.onBeforeCompile;
    const uT = this.uT;
    m.onBeforeCompile = (shader, r) => {
      prev?.call(m, shader, r);
      shader.uniforms.uFishT = uT;
      shader.uniforms.uFishL = this.uL;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uFishT;\nuniform float uFishL;')
        .replace('#include <begin_vertex>', WIGGLE);
    };
    const key = src.customProgramCacheKey?.bind(src);
    m.customProgramCacheKey = () => 'fish|' + (key ? key() : '');
    return m;
  }

  /** a predator takes a fish: true if there was one to take */
  take(s: School) {
    const f = s.fish.find((x) => x.alive);
    if (!f) return false;
    f.alive = false;
    f.regrow = 90 + 60 * Math.random();
    s.scatter = 1;
    return true;
  }

  alive(s: School) { return s.fish.reduce((n, f) => n + (f.alive ? 1 : 0), 0); }

  update(dt: number, H: Habitat, cam: THREE.Vector3, stim: SchoolStimulus[]) {
    this.uT.value += dt;
    let n = 0;
    for (const s of this.list) {
      const near = s.contact.pos.distanceTo(cam) < 160;
      // the school's own course: away from threats, toward a steady light, otherwise roaming its reach
      let flee: THREE.Vector3 | null = null, lure: THREE.Vector3 | null = null, best = 1e9, lbest = 1e9;
      for (const t of stim) {
        const d = t.pos.distanceTo(s.contact.pos);
        if (t.threat > 0 && d < 6 + t.size * 2.2 && d < best) { best = d; flee = t.pos; }
        if (t.light > 0.2 && d < 22 && d < lbest) { lbest = d; lure = t.pos; }
      }
      const c = s.contact.pos;
      let speed = 0.55;
      if (flee) {
        _v.copy(c).sub(flee);
        _v.y *= 0.4;
        if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
        s.goal.copy(c).addScaledVector(_v.normalize(), 14);
        s.scatter = Math.min(1, s.scatter + dt * 3);
        speed = 2.2;
      } else if (lure) {
        // drawn to the light, holding a little off it
        _v.copy(c).sub(lure);
        const d = _v.length();
        s.goal.copy(lure).addScaledVector(_v.normalize(), Math.min(d, 2.2));
        speed = 0.8;
      } else if (c.distanceTo(s.goal) < 3 || s.goal.distanceTo(s.home) > s.range * 1.2) {
        const k = Math.floor(H.time / 23) + s.fish.length;
        const a = hashRand(s.contact.id, k) * Math.PI * 2, r = s.range * Math.sqrt(hashRand(s.contact.id, k + 1));
        s.goal.set(s.home.x + Math.cos(a) * r, 0, s.home.z + Math.sin(a) * r);
        const fl = H.floor(s.goal.x, s.goal.z), su = H.surface(s.goal.x, s.goal.z);
        if (su === null) s.goal.y = s.home.y + (hashRand(s.contact.id, k + 2) - 0.5) * 40;
        else s.goal.y = Math.min(su - 1.5, fl + 2 + (Math.min(14, su - fl - 4)) * hashRand(s.contact.id, k + 2));
      }
      s.scatter = Math.max(0, s.scatter - dt * 0.12);
      _v.copy(s.goal).sub(c);
      const d = _v.length();
      if (d > 0.01) _v.multiplyScalar(Math.min(speed, d) / d);
      s.contact.vel.lerp(_v, 1 - Math.exp(-1.5 * dt));
      c.addScaledVector(s.contact.vel, dt);
      // stay in the water (or in the air: no surface)
      const fl = H.floor(c.x, c.z), su = H.surface(c.x, c.z) ?? 1e9;
      c.y = Math.max(fl + 0.8, Math.min(su - 0.6, c.y));
      if (Math.hypot(s.contact.vel.x, s.contact.vel.z) > 0.1) {
        const want = Math.atan2(-s.contact.vel.x, -s.contact.vel.z);
        let dy = want - s.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.yaw += dy * Math.min(1, dt * 1.2);
      }
      // the fish: each holds its place in the cloud (spread wider when scattered), with its own lag and wobble
      const spread = 1 + s.scatter * 3;
      _q.setFromAxisAngle(_w.set(0, 1, 0), s.yaw);
      for (let i = 0; i < s.fish.length; i++) {
        const f = s.fish[i];
        if (!f.alive) { f.regrow -= dt; if (f.regrow <= 0) { f.alive = true; f.pos.copy(c); } continue; }
        if (!near) { f.pos.copy(c).add(_v.copy(f.off).applyQuaternion(_q)); continue; }
        const t = H.time * 0.4 + i;
        _v.copy(f.off).multiplyScalar(spread).applyQuaternion(_q).add(c);
        _v.x += Math.sin(t * 1.3) * 0.25; _v.y += Math.sin(t * 0.9 + 2) * 0.12; _v.z += Math.cos(t * 1.1) * 0.25;
        _w.copy(_v).sub(f.pos);
        const k = s.scatter > 0.5 ? 5 : 2.2;
        f.vel.addScaledVector(_w, k * dt).multiplyScalar(Math.exp(-2.2 * dt));
        const sp = f.vel.length(), max = 0.6 + speed * 1.4;
        if (sp > max) f.vel.multiplyScalar(max / sp);
        f.pos.addScaledVector(f.vel, dt);
        f.pos.y = Math.max(fl + 0.3, Math.min(su - 0.25, f.pos.y));
      }
      if (!near) continue;
      for (const f of s.fish) {
        if (!f.alive) continue;
        // face along the swim (the school's heading when drifting slowly)
        _v.copy(f.vel);
        if (_v.lengthSq() < 0.0025) _v.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
        _v.normalize();
        _q.setFromUnitVectors(FWD, _v);
        _m.compose(f.pos, _q, _s.setScalar(f.size / this.base));
        for (const im of this.meshes) im.setMatrixAt(n, _m);
        n++;
      }
    }
    for (const im of this.meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    void this.per;
  }

  dispose() {
    for (const im of this.meshes) { im.geometry.dispose(); im.dispose(); }
    this.group.removeFromParent();
  }
}

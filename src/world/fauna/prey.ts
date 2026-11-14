import * as THREE from 'three';
import type { FaunaManager } from './Fauna';
import { cloneSkinned } from '../../render/CreatureSkin';

/**
 * Small prey animals drawn as one instanced model each (blender/assets/fauna_miller_deep.py: prey_dart, prey_shrimp,
 * prey_krill). Positions live in a plain Float32Array owned by the predator's logic (so its hunting code can move,
 * eat — y < −500 hides one — and respawn individuals); the swarm turns each animal along its motion and swims it with
 * a body wave in the vertex shader. flock() gives a school real schooling: cohesion, separation, alignment by drift,
 * and flight from threats.
 */
export class PreySwarm {
  readonly group = new THREE.Group();
  readonly vel: Float32Array;
  private meshes: THREE.InstancedMesh[] = [];
  private quat: Float32Array;
  private prev: Float32Array;
  private readonly uT = { value: 0 };
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _q2 = new THREE.Quaternion();
  private _p = new THREE.Vector3();
  private _d = new THREE.Vector3();
  private _s = new THREE.Vector3();
  private static FWD = new THREE.Vector3(0, 0, -1);

  constructor(
    readonly f: FaunaManager,
    readonly model: string,
    readonly pos: Float32Array,
    readonly scale = 1,
    readonly wave = { amp: 0.08, freq: 12, len: 0.12 },
  ) {
    const n = pos.length / 3;
    this.vel = new Float32Array(n * 3);
    this.quat = new Float32Array(n * 4);
    this.prev = new Float32Array(pos);
    for (let i = 0; i < n; i++) this.quat[i * 4 + 3] = 1;
    this.group.visible = false;
    f.root.add(this.group);
  }

  get count() {
    return this.pos.length / 3;
  }

  async build() {
    const inst = await this.f.game.assets.instance(this.model);
    const n = this.count;
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = Math.random() * Math.PI * 2;
    const aPh = new THREE.InstancedBufferAttribute(ph, 1);
    const w = this.wave;
    const uT = this.uT;
    inst.root.updateMatrixWorld(true);
    inst.root.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      // the distance levels are for single animals; a school draws its full mesh instanced
      if (/_lod\d/.test(src.name) || /_lod\d/.test(src.parent?.name ?? '')) return;
      const geo = src.geometry.clone();
      geo.applyMatrix4(src.matrixWorld);
      geo.setAttribute('aPh', aPh);
      const mat = cloneSkinned(src.material as THREE.MeshStandardMaterial, this.f.game.materials.textureQuality);
      const prev = mat.onBeforeCompile;
      const key = mat.customProgramCacheKey.call(mat);
      mat.onBeforeCompile = (sh, r) => {
        prev.call(mat, sh, r);
        sh.uniforms.uPreyT = uT;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uPreyT; attribute float aPh;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            {
              // body wave: the head steady, the tail sweeping (model forward is -z)
              float tail = smoothstep(${(-0.25 * w.len).toFixed(4)}, ${(0.5 * w.len).toFixed(4)}, position.z);
              transformed.x += ${(w.amp * w.len).toFixed(5)} * tail * sin(uPreyT * ${w.freq.toFixed(2)} + aPh - position.z * ${(6.0 / w.len).toFixed(2)});
            }`,
          );
      };
      mat.customProgramCacheKey = () => key + ':prey';
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(m);
      this.group.add(m);
    });
    return this;
  }

  /** schooling round `center` within `spread` m; threats (world positions) within fleeR scatter it */
  flock(dt: number, center: THREE.Vector3, spread: number, threats: THREE.Vector3[], fleeR: number, maxSpeed: number) {
    const p = this.pos, v = this.vel, n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (p[o + 1] < -500) continue;
      let ax = 0, ay = 0, az = 0;
      // cohesion toward the school's centre (stronger outside its radius)
      const cx = center.x - p[o], cy = center.y - p[o + 1], cz = center.z - p[o + 2];
      const cd = Math.hypot(cx, cy, cz) + 1e-4;
      const pull = cd > spread ? 1.2 : 0.25;
      ax += (cx / cd) * pull;
      ay += (cy / cd) * pull * 0.6;
      az += (cz / cd) * pull;
      // separation from close neighbours, alignment with their heading
      let mx = 0, my = 0, mz = 0, mk = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const q = j * 3;
        if (p[q + 1] < -500) continue;
        const dx = p[o] - p[q], dy = p[o + 1] - p[q + 1], dz = p[o + 2] - p[q + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.16 && d2 > 1e-6) {
          ax += (dx / d2) * 0.12;
          ay += (dy / d2) * 0.12;
          az += (dz / d2) * 0.12;
        }
        if (d2 < 2.5) {
          mx += v[q];
          my += v[q + 1];
          mz += v[q + 2];
          mk++;
        }
      }
      if (mk) {
        ax += (mx / mk - v[o]) * 0.8;
        ay += (my / mk - v[o + 1]) * 0.8;
        az += (mz / mk - v[o + 2]) * 0.8;
      }
      // flight
      for (const t of threats) {
        const dx = p[o] - t.x, dy = p[o + 1] - t.y, dz = p[o + 2] - t.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < fleeR && d > 1e-3) {
          const k = ((fleeR - d) / fleeR) * 6;
          ax += (dx / d) * k;
          ay += (dy / d) * k * 0.5;
          az += (dz / d) * k;
        }
      }
      ax += (Math.random() - 0.5) * 0.6;
      ay += (Math.random() - 0.5) * 0.3;
      az += (Math.random() - 0.5) * 0.6;
      v[o] += ax * dt;
      v[o + 1] += ay * dt;
      v[o + 2] += az * dt;
      const s = Math.hypot(v[o], v[o + 1], v[o + 2]);
      const lim = Math.min(maxSpeed, Math.max(0.25, s));
      if (s > 1e-5) {
        v[o] *= lim / s;
        v[o + 1] *= lim / s;
        v[o + 2] *= lim / s;
      }
      p[o] += v[o] * dt;
      p[o + 1] += v[o + 1] * dt;
      p[o + 2] += v[o + 2] * dt;
    }
  }

  /** plankton: drift round `center` within `spread` (no neighbour pass: hundreds of them), wandering slowly */
  drift(dt: number, center: THREE.Vector3, spread: THREE.Vector3, speed: number) {
    const p = this.pos, v = this.vel, n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (p[o + 1] < -500) continue;
      v[o] += ((Math.random() - 0.5) * speed * 4 - ((p[o] - center.x) / spread.x) * speed) * dt;
      v[o + 1] += ((Math.random() - 0.5) * speed * 2 - ((p[o + 1] - center.y) / spread.y) * speed) * dt;
      v[o + 2] += ((Math.random() - 0.5) * speed * 4 - ((p[o + 2] - center.z) / spread.z) * speed) * dt;
      const s = Math.hypot(v[o], v[o + 1], v[o + 2]);
      if (s > speed) {
        v[o] *= speed / s;
        v[o + 1] *= speed / s;
        v[o + 2] *= speed / s;
      }
      p[o] += v[o] * dt;
      p[o + 1] += v[o + 1] * dt;
      p[o + 2] += v[o + 2] * dt;
    }
  }

  /** write the instance matrices: each animal faces along its motion (smoothed); eaten ones (y < −500) vanish */
  update(dt: number, visible: boolean) {
    this.group.visible = visible && this.meshes.length > 0;
    if (!this.group.visible) {
      this.prev.set(this.pos);
      return;
    }
    this.uT.value += dt;
    const p = this.pos, pv = this.prev, Q = this.quat, n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (p[o + 1] < -500) {
        this._m.makeScale(0, 0, 0);
      } else {
        this._d.set(p[o] - pv[o], p[o + 1] - pv[o + 1], p[o + 2] - pv[o + 2]);
        this._q.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]);
        const L = this._d.length();
        if (L > 1e-5 && L < 2) {
          this._d.divideScalar(L);
          // level-ish: animals do not swim belly-up
          this._d.y = THREE.MathUtils.clamp(this._d.y, -0.6, 0.6);
          this._q2.setFromUnitVectors(PreySwarm.FWD, this._d.normalize());
          this._q.slerp(this._q2, Math.min(1, dt * 6));
          Q[i * 4] = this._q.x;
          Q[i * 4 + 1] = this._q.y;
          Q[i * 4 + 2] = this._q.z;
          Q[i * 4 + 3] = this._q.w;
        }
        this._p.set(p[o], p[o + 1], p[o + 2]);
        this._s.setScalar(this.scale * (0.85 + 0.3 * ((i * 0.618) % 1)));
        this._m.compose(this._p, this._q, this._s);
      }
      for (const m of this.meshes) m.setMatrixAt(i, this._m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    pv.set(p);
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.group.removeFromParent();
  }
}

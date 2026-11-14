import * as THREE from 'three';
import { RAPIER } from '../../physics/Physics';
import type SurfaceZone from '../zones/SurfaceZone';
import type { TerrainPad } from './SurfaceGen';
import L from './marsRefuge.json';

/**
 * The Mars subsurface refuge — a game alternate-history extension, not a known feature of Mars: a sealed lava-tube
 * cavern under a small mesa beside every Mars landing site (layout: marsRefuge.json, geometry:
 * blender/assets/mars_refuge.py). A brine lake (shelf in the west, a deep basin under an ice shelf in the east), a
 * warm channel from vents in the west wall, an ice skylight, mineral columns, the entry tunnel and a ledge down the
 * wall. The terrain heightfield (4 m cells) cannot carry the floor's detail, so the floor is its own mesh (with a
 * collider and a sampled height grid for the animals) and the terrain is only carved out of sight beneath it.
 * The refuge's pressurised interior and its water are fictional conditions (see docs/SPECULATIVE_EVOLUTION.md).
 */
export const REFUGE = L;
type V3 = THREE.Vector3;

const ss = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** distance from (x, z) to the tunnel's centre line and its floor height there (refuge frame) */
export function tunnelAt(x: number, z: number) {
  const P = L.tunnel.pts;
  let best = { d: Infinity, y: 0, t: 0 };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az, ay] = P[i];
    const [bx, bz, by] = P[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best.d) best = { d, y: ay + (by - ay) * t, t: (i + t) / (P.length - 1) };
  }
  return best;
}

/** the levelled ground round the massif (SurfaceGen pad) */
export function refugePad(): TerrainPad {
  return { x: L.offset[0], z: L.offset[1], r: L.pad[0], blend: L.pad[1] };
}

/**
 * Terrain carving under the refuge's own floor mesh (zone frame; metres to add, ≤ 0): the heightfield drops out of
 * sight under the cavern and the tunnel. Every carved cell lies inside the rock shell, so the coarse steps never show.
 */
export function refugeCarve(x: number, z: number) {
  const rx = x - L.offset[0], rz = z - L.offset[1];
  const r = Math.hypot(rx, rz);
  if (r > L.mound.r) return 0;
  let d = 0;
  const Rc = L.cavern.r;
  if (r < Rc + 6) d = -48 * (1 - ss(Rc + 1.5, Rc + 6, r));
  const t = tunnelAt(rx, rz);
  if (t.d < L.tunnel.w * 0.5 + 5 && t.y < -0.5 && r < L.mound.r * 0.78) d = Math.min(d, t.y - 3.5);
  return d;
}

export class MarsRefuge {
  readonly group = new THREE.Group();
  /** the centre in the zone frame and the levelled ground's height */
  readonly c = new THREE.Vector3(L.offset[0], 0, L.offset[1]);
  y0 = 0;
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];
  private handles = new Set<number>();
  private floorGeo: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  /** the floor sampled at STEP m (refuge frame), NaN off the floor */
  private grid: Float32Array | null = null;
  private static readonly STEP = 0.5;
  private gx0 = -L.cavern.r - 2;
  private gz0 = L.tunnel.pts[0][1];
  private gnx = 0;
  private gnz = 0;
  water: THREE.Mesh | null = null;
  private lamps: THREE.SpotLight[] = [];
  private sky: THREE.SpotLight | null = null;
  private shaft: THREE.Mesh | null = null;
  private bubbles: THREE.Points | null = null;
  private bubbleV: Float32Array | null = null;
  private time = 0;
  private _d = new THREE.Vector3();
  private _n = new THREE.Vector3();
  private _p = new THREE.Vector3();

  constructor(private zone: SurfaceZone) {}

  /** zone → refuge frame */
  local(p: { x: number; y: number; z: number }, out = this._p) {
    return out.set(p.x - this.c.x, p.y - this.y0, p.z - this.c.z);
  }

  /** refuge frame → zone */
  world(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x + this.c.x, y + this.y0, z + this.c.z);
  }

  async build() {
    const zone = this.zone;
    // the pad is level ground: read its height just outside the massif
    this.y0 = zone.gen.field.height(this.c.x + L.mound.r + 4, this.c.z);
    this.c.y = this.y0;
    const ph = zone.ground.physics;
    for (const model of ['mars_refuge', 'mars_refuge_ice']) {
      const inst = await zone.game.assets.instance(model);
      inst.root.position.copy(this.c);
      this.group.add(inst.root);
      inst.root.updateMatrixWorld(true);
      inst.root.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.receiveShadow = true;
        m.castShadow = model === 'mars_refuge';
        const floor = m.name.includes('floor');
        if (floor) {
          // the floor wins any depth tie with the terrain at the tunnel mouth
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
          }
        }
        if (floor) this.floorGeo.push({ geo: m.geometry, m: m.matrixWorld.clone() });
        const c = ph?.addGeometry(m.geometry, m.matrixWorld, { cave: model });
        if (c) {
          this.colliders.push(c);
          this.handles.add(c.handle);
        }
      });
    }
    this.sampleFloor();
    this.buildWater();
    this.buildLights();
    this.buildBubbles();
    zone.scene.add(this.group);
    return this;
  }

  /**
   * The floor mesh rasterised into a height grid (the animals' ground — read from the mesh itself, no second copy of
   * the floor maths; independent of the physics world, whose ray queries only see new colliders after a step).
   */
  private sampleFloor() {
    const S = MarsRefuge.STEP;
    this.gnx = Math.ceil((L.cavern.r + 2 - this.gx0) / S) + 1;
    this.gnz = Math.ceil((L.cavern.r + 2 - this.gz0) / S) + 1;
    const nx = this.gnx, nz = this.gnz;
    const g = (this.grid = new Float32Array(nx * nz).fill(NaN));
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const { geo, m } of this.floorGeo) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const idx = geo.index;
      const tris = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < tris; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m).sub(this.c);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m).sub(this.c);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m).sub(this.c);
        const x0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - this.gx0) / S)), x1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - this.gx0) / S));
        const z0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - this.gz0) / S)), z1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - this.gz0) / S));
        const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(den) < 1e-9) continue;
        for (let j = z0; j <= z1; j++) {
          const pz = this.gz0 + j * S;
          for (let i = x0; i <= x1; i++) {
            const px = this.gx0 + i * S;
            const w0 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / den;
            const w1 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / den;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
            const y = w0 * a.y + w1 * b.y + w2 * c.y;
            const k = j * nx + i;
            if (Number.isNaN(g[k]) || y > g[k]) g[k] = y;
          }
        }
      }
    }
  }

  /** floor height (zone frame) at (x, z), or null off the refuge floor */
  floorY(x: number, z: number) {
    const g = this.grid;
    if (!g) return null;
    const S = MarsRefuge.STEP;
    const fx = (x - this.c.x - this.gx0) / S, fz = (z - this.c.z - this.gz0) / S;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.gnx - 1 || j >= this.gnz - 1) return null;
    const a = g[j * this.gnx + i], b = g[j * this.gnx + i + 1], c = g[(j + 1) * this.gnx + i], d = g[(j + 1) * this.gnx + i + 1];
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
      const v = [a, b, c, d].filter((q) => !Number.isNaN(q));
      return v.length ? this.y0 + Math.max(...v) : null;
    }
    const u = fx - i, w = fz - j;
    return this.y0 + (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
  }

  /** the lake's still surface (zone frame) at (x, z), −∞ outside the cavern */
  waterLevel(x: number, z: number) {
    return Math.hypot(x - this.c.x, z - this.c.z) < L.cavern.r ? this.y0 + L.lake.level : -Infinity;
  }

  /** 0 outside … 1 under the rock (the cavern or the tunnel) at p (zone frame) */
  inside(p: V3) {
    const q = this.local(p);
    const r = Math.hypot(q.x, q.z);
    if (r < L.cavern.r && q.y < L.cavern.ceil + 2) return 1;
    const t = tunnelAt(q.x, q.z);
    if (t.d < L.tunnel.w * 0.5 + 1 && q.y < t.y + L.tunnel.h + 1 && r < L.mound.r * 0.8) {
      // daylight reaches a little way in from the mouth
      return ss(0.0, 0.35, t.t);
    }
    return 0;
  }

  /** the skylight's daylight on the ice below (0..1) */
  skyK = 0;

  // ------------------------------------------------------------------------------------------------- water
  private buildWater() {
    const N = 128;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = (i / N) * Math.PI * 2, v = (j / N) * Math.PI * 2;
        const dx = 0.5 * Math.cos(u * 3 + v) + 0.3 * Math.cos(u * 7 - v * 2) + 0.2 * Math.sin(u * 2 + v * 9);
        const dz = 0.5 * Math.cos(v * 4 - u) + 0.3 * Math.sin(v * 6 + u * 3) + 0.2 * Math.cos(v * 11 + u);
        const n = new THREE.Vector3(-dx * 0.12, 1, -dz * 0.12).normalize();
        data.set([(n.x * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, n.y * 255, 255], (j * N + i) * 4);
      }
    }
    const tex = new THREE.DataTexture(data, N, N);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.needsUpdate = true;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.012, 0.03, 0.034), roughness: 0.04, metalness: 0, transparent: true, opacity: 0.86,
      normalMap: tex, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const w = new THREE.Mesh(new THREE.CircleGeometry(L.cavern.r + 1, 96), mat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(this.c.x, this.y0 + L.lake.level, this.c.z);
    w.renderOrder = 4;
    w.name = 'refuge_water';
    this.water = w;
    this.group.add(w);
  }

  // ------------------------------------------------------------------------------------------------- lights
  /** survey floodlights left by the robotic precursor survey (the cavern's only steady light), the skylight's day */
  private buildLights() {
    const lamp = (x: number, z: number, aim: [number, number, number], color: number, int: number) => {
      const fy = this.floorY(x + this.c.x, z + this.c.z) ?? this.y0 + L.cavern.floor;
      const mast = new THREE.Group();
      const legM = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.7 });
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.2, 6), legM);
        const a = (k * Math.PI * 2) / 3;
        leg.position.set(Math.cos(a) * 0.35, 1.05, Math.sin(a) * 0.35);
        leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        mast.add(leg);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.2), new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.4, metalness: 0.6 }));
      head.position.y = 2.15;
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.35) }));
      lens.position.z = 0.101;
      head.add(lens);
      mast.add(head);
      mast.position.set(x + this.c.x, fy, z + this.c.z);
      const tgt = new THREE.Vector3(aim[0] + this.c.x, this.y0 + aim[1], aim[2] + this.c.z);
      head.lookAt(tgt);
      const s = new THREE.SpotLight(color, int, 85, 0.62, 0.55, 1.4);
      s.position.set(x + this.c.x, fy + 2.15, z + this.c.z);
      s.target.position.copy(tgt);
      s.castShadow = false;
      this.group.add(mast, s, s.target);
      this.lamps.push(s);
    };
    // at the foot of the ledge, aimed across the lake; on the north shore at the grove; by the nest
    lamp(-44, -30, [6, -22, 4], 0xfff1dc, 90);
    lamp(-4, -34, [0, -25, 8], 0xeaf3ff, 70);
    lamp(-44, -6, [-28, -20, -22], 0xfff1dc, 45);
    lamp(34, -24, [16, -20, -40], 0xeaf3ff, 35);
    // the skylight: cold daylight through the ice plug, a faint shaft
    const [sx, sz] = L.skylight.c;
    const top = new THREE.Vector3(sx + this.c.x, this.y0 + 14, sz + this.c.z);
    const sky = new THREE.SpotLight(0xcfe3ff, 0, 60, 0.42, 0.7, 1.2);
    sky.position.copy(top);
    sky.target.position.set(top.x, this.y0 + L.lake.level, top.z);
    this.sky = sky;
    const shaftM = new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(L.skylight.r * 0.8, L.skylight.r * 1.25, 30, 32, 1, true), shaftM);
    shaft.position.set(top.x, this.y0 - 4, top.z);
    this.shaft = shaft;
    this.group.add(sky, sky.target, shaft);
  }

  // ------------------------------------------------------------------------------------------------- bubbles
  /** gas from the vents under the Ferric Cathedrals rises in strings to the surface */
  private buildBubbles() {
    const n = 360;
    const pos = new Float32Array(n * 3);
    this.bubbleV = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    for (let i = 0; i < n; i++) this.respawnBubble(pos, i, true);
    const mat = new THREE.PointsMaterial({ color: 0xcfe6f0, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    this.bubbles = new THREE.Points(geo, mat);
    this.bubbles.frustumCulled = false;
    this.group.add(this.bubbles);
  }

  private respawnBubble(pos: Float32Array, i: number, any: boolean) {
    const v = L.vents[i % L.vents.length];
    const fy = this.floorY(v[0] + this.c.x, v[1] + this.c.z) ?? this.y0 + L.lake.shelf;
    const top = this.y0 + L.lake.level;
    pos[i * 3] = v[0] + this.c.x + (Math.random() - 0.5) * 0.5;
    pos[i * 3 + 1] = any ? fy + Math.random() * (top - fy) : fy + 0.3;
    pos[i * 3 + 2] = v[1] + this.c.z + (Math.random() - 0.5) * 0.5;
    this.bubbleV![i] = 0.25 + Math.random() * 0.35;
  }

  // ------------------------------------------------------------------------------------------------- update
  /** daylight (0..1 at the surface, for the skylight); camK: how far the camera is inside */
  update(dt: number, day: number, camK: number) {
    this.time += dt;
    const w = this.water;
    if (w) {
      const t = (w.material as THREE.MeshPhysicalMaterial).normalMap!;
      t.offset.set(this.time * 0.004, this.time * 0.0027);
    }
    // the skylight's light only means anything inside
    this.skyK = day;
    if (this.sky) this.sky.intensity = 120 * day * camK;
    // a faint shaft (additive, seen through the cave's adapted exposure: kept very low)
    if (this.shaft) (this.shaft.material as THREE.MeshBasicMaterial).opacity = 0.01 * day * camK;
    for (const l of this.lamps) l.visible = camK > 0.02;
    const b = this.bubbles;
    if (b && camK > 0.02) {
      const pos = (b.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const top = this.y0 + L.lake.level - 0.05;
      for (let i = 0; i < pos.length / 3; i++) {
        pos[i * 3 + 1] += this.bubbleV![i] * dt;
        pos[i * 3] += Math.sin(this.time * 3 + i) * 0.02 * dt;
        if (pos[i * 3 + 1] > top) this.respawnBubble(pos, i, false);
      }
      (b.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /**
   * Keep a creature of radius r from passing through the shell, the floor or the ice on its way from → to (a ray cast
   * against the refuge colliders; on a hit the move stops r short and slides along). True if it moved `to`.
   */
  guard(from: V3, to: V3, r: number) {
    const ph = this.zone.ground.physics;
    if (!ph || !this.colliders.length) return false;
    if (Math.hypot(to.x - this.c.x, to.z - this.c.z) > L.mound.r + 10 && Math.hypot(from.x - this.c.x, from.z - this.c.z) > L.mound.r + 10) return false;
    const d = this._d.subVectors(to, from);
    const len = d.length();
    if (len < 1e-5) return false;
    d.divideScalar(len);
    const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: d.x, y: d.y, z: d.z });
    const hit = ph.world.castRayAndGetNormal(ray, len + r, true, undefined, undefined, undefined, undefined, (c) => this.handles.has(c.handle));
    if (!hit) return false;
    const allowed = Math.max(0, hit.timeOfImpact - r);
    const n = this._n.set(hit.normal.x, hit.normal.y, hit.normal.z);
    const slide = d.clone().multiplyScalar(len - allowed);
    slide.addScaledVector(n, -slide.dot(n));
    to.copy(from).addScaledVector(d, allowed).add(slide);
    return true;
  }

  dispose() {
    const ph = this.zone.ground.physics;
    if (ph) for (const c of this.colliders) ph.world.removeCollider(c, false);
    this.colliders.length = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        if (o.name === 'refuge_water' || (o as THREE.Points).isPoints || m.geometry?.type?.includes('Cylinder') || m.geometry?.type?.includes('Box') || m.geometry?.type?.includes('Plane')) m.geometry?.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

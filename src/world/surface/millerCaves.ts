import * as THREE from 'three';
import { RAPIER } from '../../physics/Physics';
import type SurfaceZone from '../zones/SurfaceZone';
import { millerSpots } from './millerBiome';

/**
 * Miller's overhangs and caves. The terrain is a heightfield and cannot overhang, so the rock shelters are separate
 * shells (blender/assets/miller_caves.py) seated into the slopes at the habitats that need them, each with a trimesh
 * collider so the diver can swim in under the roof and stand on top: a shelter on each rift wall where the Luminous
 * Sirens hang, a long overhanging ledge over each Abyssal Stalker post on the basin rim, a low den by the reef pool
 * for the Mimic Crawler. Independent of the alien-life setting: they are landforms.
 */
export class MillerCaves {
  readonly group = new THREE.Group();
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];
  private handles = new Set<number>();
  /** bounding spheres (centre, radius) for a cheap test before any ray cast */
  private bounds: { c: THREE.Vector3; r: number }[] = [];
  private _d = new THREE.Vector3();
  private _n = new THREE.Vector3();

  constructor(private zone: SurfaceZone) {}

  async build() {
    const zone = this.zone;
    const S = millerSpots();
    const items: [string, [number, number], [number, number], number, number][] = [];
    for (const s of S.siren) items.push(['miller_cave_shelter', s.at, s.face, 0, 1]);
    for (const s of S.stalker) items.push(['miller_cave_ledge', s.at, s.face, -2.5, 1]);
    items.push(['miller_cave_den', S.mimic.at, S.mimic.face, -0.4, 0.9]);
    for (const [model, at, face, back, scale] of items) {
      const inst = await zone.game.assets.instance(model);
      const L = Math.hypot(face[0], face[1]) || 1;
      const fx = face[0] / L, fz = face[1] / L;
      const x = at[0] - fx * back, z = at[1] - fz * back;
      const root = inst.root;
      // seated into the ground: the lowest of the footprint's samples, a little deeper for the low den
      let y = zone.terrainY(x, z);
      for (let k = 0; k < 8; k++) y = Math.min(y, zone.terrainY(x + Math.cos(k * 0.785) * 1.5, z + Math.sin(k * 0.785) * 1.5));
      if (model === 'miller_cave_den') y -= 0.45;
      root.position.set(x, y, z);
      root.rotation.y = Math.atan2(-fx, -fz); // the opening (model −Z) toward open water
      root.scale.setScalar(scale);
      this.group.add(root);
      root.updateMatrixWorld(true);
      root.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const c = zone.ground.physics?.addGeometry(m.geometry, m.matrixWorld, { cave: model });
        if (c) {
          this.colliders.push(c);
          this.handles.add(c.handle);
        }
        m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere!;
        this.bounds.push({ c: bs.center.clone().applyMatrix4(m.matrixWorld), r: bs.radius * root.scale.x });
      });
    }
    zone.scene.add(this.group);
    return this;
  }

  /**
   * Keep a creature of radius r from passing through a cave shell on its way from → to: a ray cast against the
   * cave colliders only; on a hit the move stops r short of the rock and slides along it. Returns true if it moved `to`.
   */
  guard(from: THREE.Vector3, to: THREE.Vector3, r: number) {
    const ph = this.zone.ground.physics;
    if (!ph || !this.colliders.length) return false;
    let near = false;
    for (const b of this.bounds) {
      if (b.c.distanceTo(to) < b.r + r + 1 || b.c.distanceTo(from) < b.r + r + 1) {
        near = true;
        break;
      }
    }
    if (!near) return false;
    const d = this._d.subVectors(to, from);
    const L = d.length();
    if (L < 1e-5) return false;
    d.divideScalar(L);
    const ray = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: d.x, y: d.y, z: d.z });
    const hit = ph.world.castRayAndGetNormal(ray, L + r, true, undefined, undefined, undefined, undefined, (c) => this.handles.has(c.handle));
    if (!hit) return false;
    const allowed = Math.max(0, hit.timeOfImpact - r);
    const n = this._n.set(hit.normal.x, hit.normal.y, hit.normal.z);
    // the rest of the move, minus its part into the rock: a slide along the wall
    const rest = L - allowed;
    const slide = d.clone().multiplyScalar(rest);
    slide.addScaledVector(n, -slide.dot(n));
    to.copy(from).addScaledVector(d, allowed).add(slide);
    return true;
  }

  dispose() {
    const ph = this.zone.ground.physics;
    if (ph) for (const c of this.colliders) ph.world.removeCollider(c, false);
    this.colliders.length = 0;
    this.group.removeFromParent();
  }
}

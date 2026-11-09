import * as THREE from 'three';

export interface LampSource {
  /** world position provider */
  pos: () => THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  on: () => boolean;
  flicker?: number;
}

/**
 * A fixed pool of point lights reassigned to the nearest active lamp sources.
 * Keeping the light count constant avoids shader recompiles when lamps switch on/off.
 */
export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  readonly sources = new Set<LampSource>();
  private t = 0;
  private tmp = new THREE.Vector3();

  constructor(parent: THREE.Object3D, count = 6) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false;
      parent.add(l);
      this.lights.push(l);
    }
  }

  add(s: LampSource) {
    this.sources.add(s);
    return s;
  }

  remove(s: LampSource) {
    this.sources.delete(s);
  }

  update(dt: number, viewer: THREE.Vector3) {
    this.t += dt;
    const ranked: [number, LampSource, THREE.Vector3][] = [];
    for (const s of this.sources) {
      if (!s.on()) continue;
      const p = s.pos();
      const d = p.distanceToSquared(viewer);
      if (d > (s.distance * 3) ** 2) continue;
      ranked.push([d, s, p.clone()]);
    }
    ranked.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = ranked[i];
      if (!r) {
        l.intensity = 0;
        continue;
      }
      const [, s, p] = r;
      l.parent?.worldToLocal(this.tmp.copy(p));
      l.position.copy(this.tmp);
      l.color.copy(s.color);
      const fl = s.flicker ? 1 - s.flicker * (0.5 + 0.5 * Math.sin(this.t * 37 + i * 13) * Math.sin(this.t * 11.3)) : 1;
      l.intensity = s.intensity * fl;
      l.distance = s.distance;
    }
  }

  clear() {
    this.sources.clear();
    for (const l of this.lights) l.intensity = 0;
  }
}

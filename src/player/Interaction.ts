import * as THREE from 'three';

export interface Interactable {
  /** world-space centre of the hit volume */
  position(out: THREE.Vector3): THREE.Vector3;
  radius: number;
  /** maximum use distance from the eye (default 2.6 m) */
  range?: number;
  /** prompt text, e.g. "Open door". Return '' to hide. */
  label(): string;
  use(): void;
  enabled?(): boolean;
  /** secondary action (hold / alternate key) */
  useAlt?(): void;
  altLabel?(): string;
}

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();

/** Looks along the view ray for the nearest usable object. Purely geometric so it works in every frame of reference. */
export class Interactions {
  private list = new Set<Interactable>();
  current: Interactable | null = null;
  currentLabel = '';
  /** optional occlusion test supplied by the active zone: returns distance to the first solid hit */
  occlusion: ((origin: THREE.Vector3, dir: THREE.Vector3, max: number) => number | null) | null = null;

  add(i: Interactable) { this.list.add(i); return i; }
  remove(i: Interactable) { this.list.delete(i); if (this.current === i) this.current = null; }
  clear() { this.list.clear(); this.current = null; }

  /** Helper: interactable anchored to a scene node. */
  node(node: THREE.Object3D, radius: number, label: string | (() => string), use: () => void, extra: Partial<Interactable> = {}): Interactable {
    return this.add({
      position: (out) => node.getWorldPosition(out),
      radius,
      label: typeof label === 'string' ? () => label : label,
      use,
      ...extra,
    });
  }

  update(cam: THREE.Camera) {
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    let best: Interactable | null = null;
    let bestT = Infinity;
    for (const it of this.list) {
      if (it.enabled && !it.enabled()) continue;
      it.position(_p);
      const range = it.range ?? 2.6;
      _p.sub(_o);
      const t = _p.dot(_d);
      if (t < -it.radius || t > range + it.radius) continue;
      const d2 = _p.lengthSq() - t * t;
      if (d2 > it.radius * it.radius) continue;
      const hitT = Math.max(0, t - Math.sqrt(Math.max(0, it.radius * it.radius - d2)));
      if (hitT > range) continue;
      // prefer the candidate whose centre is closest to the view axis, then the nearest
      const score = hitT + Math.sqrt(Math.max(d2, 0)) * 1.5;
      if (score < bestT) { bestT = score; best = it; }
    }
    if (best && this.occlusion) {
      best.position(_p);
      const dist = _p.distanceTo(_o);
      _p.sub(_o).normalize();
      const occ = this.occlusion(_o, _p, dist);
      if (occ !== null && occ < dist - best.radius - 0.15) best = null;
    }
    this.current = best;
    this.currentLabel = best ? best.label() : '';
    if (!this.currentLabel) this.current = null;
  }

  use() { if (this.current) { this.current.use(); return true; } return false; }
}

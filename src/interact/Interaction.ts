import * as THREE from 'three';

export interface Interactable {
  id: string;
  /** objects tested by the view ray (meshes or groups) */
  targets: THREE.Object3D[];
  /** prompt text (null hides) */
  label: () => string | null;
  use: () => void;
  enabled?: () => boolean;
  range?: number;
  /** optional secondary action (shown as F) */
  alt?: { label: () => string | null; use: () => void };
}

/**
 * View-ray interaction. Zones register interactables; each frame we raycast from the camera and expose
 * the focused item for the prompt; pressing "interact" triggers it.
 */
export class Interaction {
  private items = new Map<string, Interactable>();
  private raycaster = new THREE.Raycaster();
  private targetMap = new Map<THREE.Object3D, Interactable>();
  private targetList: THREE.Object3D[] = [];
  private dirty = true;
  focus: Interactable | null = null;
  focusPoint = new THREE.Vector3();

  add(i: Interactable) {
    this.items.set(i.id, i);
    this.dirty = true;
    return i;
  }

  remove(id: string) {
    this.items.delete(id);
    this.dirty = true;
  }

  clear() {
    this.items.clear();
    this.dirty = true;
    this.focus = null;
  }

  get(id: string) {
    return this.items.get(id);
  }

  private rebuild() {
    this.targetMap.clear();
    this.targetList = [];
    for (const it of this.items.values()) {
      for (const t of it.targets) {
        t.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            this.targetMap.set(o, it);
            this.targetList.push(o);
          }
        });
      }
    }
    this.dirty = false;
  }

  update(camera: THREE.Camera, maxRange = 3.0, ndc?: THREE.Vector2): Interactable | null {
    if (this.dirty) this.rebuild();
    if (ndc) this.raycaster.setFromCamera(ndc, camera);
    else {
      const o = camera.getWorldPosition(new THREE.Vector3());
      const d = camera.getWorldDirection(new THREE.Vector3());
      this.raycaster.set(o, d);
    }
    this.raycaster.far = Math.max(maxRange, 12);
    // include invisible hit-boxes
    const hits = this.raycaster.intersectObjects(this.targetList, false);
    this.focus = null;
    for (const h of hits) {
      const it = this.targetMap.get(h.object);
      if (!it) continue;
      if (h.distance > (it.range ?? maxRange)) break;
      if (it.enabled && !it.enabled()) continue;
      if (!it.label()) continue;
      this.focus = it;
      this.focusPoint.copy(h.point);
      break;
    }
    return this.focus;
  }
}

/** Create an invisible hit box (for raycast-only interaction targets). */
export function hitBox(size: THREE.Vector3, pos = new THREE.Vector3(), quat?: THREE.Quaternion): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.copy(pos);
  if (quat) m.quaternion.copy(quat);
  m.userData.hitbox = true;
  return m;
}

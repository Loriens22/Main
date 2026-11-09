import * as THREE from 'three';
import { PhysicsWorld } from '../physics/Physics';

export type Surface = 'wood' | 'gravel' | 'metal' | 'dirt' | 'concrete' | 'ice' | 'water' | 'rock';

/**
 * A Frame is a local physics space: a Rapier world + a render anchor + a gravity field.
 * Examples: Earth ground, Endurance body frame (rotating), a Ranger cabin, a planet surface.
 * Player and NPC positions are always expressed in their frame's local coordinates.
 */
export class Frame {
  readonly physics: PhysicsWorld;
  /** render-space transform of the frame origin */
  anchor: THREE.Object3D;
  /** angular velocity of the frame (rad/s, local) for rotating frames (Coriolis) */
  readonly omega = new THREE.Vector3();
  /** extra uniform acceleration felt in this frame (e.g. ship thrust → apparent gravity), local */
  readonly accel = new THREE.Vector3();
  gravityFn: (local: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;
  surfaceFn: (local: THREE.Vector3) => Surface = () => 'concrete';
  pressurizedFn: (local: THREE.Vector3) => boolean = () => true;
  /** name shown in the status line */
  label: string;

  constructor(readonly id: string, anchor: THREE.Object3D, gravity: THREE.Vector3 | ((l: THREE.Vector3, o: THREE.Vector3) => THREE.Vector3), label = id) {
    this.anchor = anchor;
    this.label = label;
    this.physics = new PhysicsWorld(gravity instanceof THREE.Vector3 ? gravity : new THREE.Vector3(0, -9.81, 0));
    if (gravity instanceof THREE.Vector3) {
      const g = gravity.clone();
      this.gravityFn = (_l, o) => o.copy(g);
    } else this.gravityFn = gravity;
  }

  /** Effective gravity at a local position (field + apparent acceleration). */
  gravity(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.gravityFn(local, out);
    return out.sub(this.accel);
  }

  localToWorld(p: THREE.Vector3, out = new THREE.Vector3()) {
    this.anchor.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(this.anchor.matrixWorld);
  }

  worldToLocal(p: THREE.Vector3, out = new THREE.Vector3()) {
    this.anchor.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(new THREE.Matrix4().copy(this.anchor.matrixWorld).invert());
  }

  dispose() {
    this.physics.dispose();
  }
}

/** Rotating-frame gravity: centripetal ω²r outward from the axis (local +Y axis through origin). */
export function spinGravity(getOmega: () => number) {
  return (l: THREE.Vector3, out: THREE.Vector3) => {
    const w = getOmega();
    return out.set(l.x * w * w, 0, l.z * w * w);
  };
}

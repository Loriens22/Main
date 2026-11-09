import type * as THREE from 'three';
import type { Input, InputContext } from './Input';

/** Anything the player can directly control (ground vehicle, spacecraft, a cinematic camera). */
export interface Controllable {
  readonly id: string;
  readonly context: InputContext;
  /** apply player input; dt real seconds */
  control(dt: number, input: Input): void;
  /** write the camera transform (world) */
  camera(cam: THREE.PerspectiveCamera, dt: number): void;
  /** player asked to leave (F); return false to refuse */
  exit(): boolean;
  /** optional per-frame HUD refresh */
  hud?(dt: number): void;
  /** camera mode cycling */
  cycleCamera?(): void;
}

export interface Cinematic {
  /** return false when finished */
  update(dt: number, cam: THREE.PerspectiveCamera): boolean;
  skippable?: boolean;
  skip?(): void;
  /** blocks player input while running */
  blocking: boolean;
}

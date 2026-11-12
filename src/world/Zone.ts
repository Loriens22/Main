import * as THREE from 'three';
import type { Game } from '../core/Game';
import { PhysicsWorld } from '../physics/Physics';

/**
 * A zone is one locally-simulated environment with its own frame of reference and physics world:
 * the Earth countryside, the space around a spacecraft, or a planetary landing region.
 * Only one zone is active (rendered and stepped) at a time; the rest of the universe keeps evolving
 * analytically through the mission clock and each system's logical state.
 */
export abstract class Zone {
  readonly root = new THREE.Group();
  phys = new PhysicsWorld();
  loaded = false;

  constructor(public game: Game, public id: string) {
    this.root.name = `zone:${id}`;
  }

  /** Load assets and build static content. Called once. */
  abstract load(progress?: (f: number, label: string) => void): Promise<void>;

  /** Called when the zone becomes the active one. */
  enter() {
    this.game.renderer.scene.add(this.root);
    this.game.player.attach(this.phys);
  }

  leave() {
    this.game.renderer.scene.remove(this.root);
    this.game.player.detach();
  }

  /** Fixed 60 Hz step, before the physics world is stepped. */
  fixedUpdate(_dt: number) {}

  /** Per rendered frame. */
  update(_dt: number) {}

  /** Effective gravity (m/s^2, zone frame) felt at a point. */
  gravityAt(_p: THREE.Vector3, out: THREE.Vector3) {
    return out.set(0, -9.81, 0);
  }

  /** Height of walkable ground under (x, z), if the zone has terrain. */
  groundHeight(_x: number, _z: number): number | null {
    return null;
  }

  /** Short human-readable location for the HUD and saves. */
  locationName() { return this.id; }

  serialize(): any { return {}; }
  deserialize(_d: any) {}
}

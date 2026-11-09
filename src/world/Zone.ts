import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { RenderLayer } from '../render/Renderer';
import { Frame } from './Frame';
import type { LocationId } from '../core/State';
import type { MusicMood } from '../audio/Audio';

export interface SpawnSpec {
  frame?: string;
  pos?: THREE.Vector3;
  yaw?: number;
  /** named spawn (zone-specific): e.g. 'farm', 'nasa', 'ranger1:seat_pilot' */
  at?: string;
}

/**
 * A Zone is one loaded location (Earth surface, space, a Lazarus planet). Exactly one is active.
 * It owns scenes, frames (physics spaces), NPC instances and vehicles currently present.
 */
export abstract class Zone {
  abstract readonly id: LocationId;
  readonly scene = new THREE.Scene();
  readonly frames = new Map<string, Frame>();
  readonly disposables: { dispose(): void }[] = [];
  music: MusicMood = 'earth';
  /** exposure target for the renderer's adaptation */
  exposure = 1.0;
  time = 0;

  constructor(readonly game: Game) {}

  abstract load(progress: (p: number, msg: string) => void): Promise<void>;
  /** Called every frame after input; dt = real seconds (player proper time), dtEarth = Earth-reference seconds. */
  abstract update(dt: number, dtEarth: number): void;
  /** Place the player at a spawn spec. */
  abstract spawn(spec: SpawnSpec): void;

  layers(camera: THREE.Camera): RenderLayer[] {
    return [{ scene: this.scene, camera }];
  }

  /** Name/subtitle used for the location card and status line. */
  abstract describe(): { name: string; sub: string };

  addFrame(f: Frame) {
    this.frames.set(f.id, f);
    return f;
  }

  frame(id: string) {
    return this.frames.get(id) ?? null;
  }

  /** Visual altitude for sky/fog purposes. */
  altitude(): number {
    return 2;
  }

  /** Is the camera currently in vacuum (affects audio). */
  inVacuum(): boolean {
    return false;
  }

  /** Called before saving: write live simulation back to GameState. */
  writeState(): void {}

  dispose() {
    for (const f of this.frames.values()) f.dispose();
    this.frames.clear();
    for (const d of this.disposables) d.dispose();
    // only geometry explicitly owned by the zone is disposed; model-instance geometry is shared via the asset cache
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.userData.owned) m.geometry.dispose();
    });
    this.scene.clear();
  }
}

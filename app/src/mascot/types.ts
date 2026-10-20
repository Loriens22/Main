// Public contract for the 3D mascot engine. UI code depends only on this file.

export type MascotId = 'maverick' | 'sparky';

export type Emotion =
  | 'idle'
  | 'happy'
  | 'excited'
  | 'thinking'
  | 'working'
  | 'listening'
  | 'speaking'
  | 'confused'
  | 'sad'
  | 'error'
  | 'celebrate'
  | 'sleepy'
  | 'surprised'
  | 'love';

export type MascotAction =
  | 'poke'
  | 'wave'
  | 'jump'
  | 'spin'
  | 'nod'
  | 'shake'
  | 'celebrate'
  | 'flinch'
  | 'peek';

export type RoamMode = 'off' | 'gentle' | 'explore';
export type Quality = 'auto' | 'high' | 'medium' | 'low';

/** Screen-space home position of a mascot, in CSS pixels (center point + diameter). */
export interface MascotAnchor {
  x: number;
  y: number;
  size: number;
}

export type InteractionKind = 'tap' | 'doubletap' | 'longpress' | 'drag-start' | 'drag-end';

export interface StageStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  quality: Exclude<Quality, 'auto'>;
  dpr: number;
}

export interface MascotStageOptions {
  canvas: HTMLCanvasElement;
  theme: 'light' | 'dark';
  quality?: Quality;
  reducedMotion?: boolean;
}

export interface MascotStageApi {
  setAnchor(id: MascotId, anchor: MascotAnchor | null, opts?: { immediate?: boolean }): void;
  setEmotion(id: MascotId, emotion: Emotion, opts?: { durationMs?: number; intensity?: number }): void;
  react(id: MascotId, action: MascotAction): void;
  /** 0..1 speech amplitude for mouth/body sync; call every animation frame while audio plays. */
  setSpeaking(id: MascotId, level: number): void;
  setLookAt(target: { x: number; y: number } | null): void;
  roam(id: MascotId, mode: RoamMode): void;
  moveTo(id: MascotId, point: { x: number; y: number }, opts?: { hop?: boolean; durationMs?: number }): Promise<void>;
  hitTest(x: number, y: number): MascotId | null;
  /** Current on-screen centre (CSS px) and rendered diameter, including roam/drag/hop offsets. */
  getPosition(id: MascotId): { x: number; y: number; size: number; visible: boolean } | null;
  onInteract(cb: (id: MascotId, kind: InteractionKind) => void): () => void;
  setTheme(theme: 'light' | 'dark'): void;
  setQuality(q: Quality): void;
  setReducedMotion(v: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): StageStats;
  dispose(): void;
}

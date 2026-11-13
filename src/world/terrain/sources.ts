import { EarthMap } from '../earth/EarthMap';

/** A height-field world description usable both on the main thread (physics, gameplay) and in the mesh worker. */
export interface TerrainSource {
  height(x: number, z: number): number;
  /** four surface-layer weights */
  splat(x: number, z: number, out: Float32Array | number[]): void;
  /** auxiliary mask 0..1 (crop cover on Earth, wetness on Miller, crevasse depth on Mann...) */
  aux(x: number, z: number): number;
  hole?(x: number, z: number): boolean;
}

const cache = new Map<string, TerrainSource>();
const factories: Record<string, () => TerrainSource> = {};

export function registerTerrainSource(id: string, make: () => TerrainSource) {
  factories[id] = make;
}

export function terrainSource(id: string): TerrainSource {
  let s = cache.get(id);
  if (!s) {
    const f = factories[id];
    if (!f) throw new Error(`unknown terrain source ${id}`);
    s = f();
    cache.set(id, s);
  }
  return s;
}

let earth: EarthMap | null = null;
export function earthMap(): EarthMap {
  if (!earth) earth = new EarthMap();
  return earth;
}

registerTerrainSource('earth', () => {
  const m = earthMap();
  return {
    height: (x, z) => m.height(x, z),
    splat: (x, z, out) => m.splat(x, z, out),
    aux: (x, z) => m.cornDensity(x, z),
    hole: (x, z) => m.hole(x, z),
  };
});

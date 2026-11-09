import * as THREE from 'three';
import { Noise, smoothstep, lerp } from '../../util/noise';
import { catmullRom, cumulative, type P2 } from '../../util/spline';
import { ROUTE, SIDE_ROADS, FIELDS, NEIGHBOURS, NASA, EARTH_TERRAIN, type RoadSegment, type Surface } from '../../data/earthLayout';
import { Heightmap, HeightField } from '../terrain/Heightmap';

export interface RoadPath {
  name: string;
  surface: Surface;
  width: number;
  pts: P2[]; // sampled spline (≈3 m)
  cum: Float64Array;
  heights: Float32Array; // smoothed road surface height per point
  route: boolean;
}

interface Flat {
  x: number;
  z: number;
  r: number; // radius (circle) or half-size when rect
  rect?: [number, number]; // half extents
  feather: number;
  h?: number; // forced height; undefined → base height at centre
  yard?: number; // yard gravel weight in mask
}

export const SURFACE_CODE: Record<Surface, number> = { gravel: 0.25, dirt: 0.5, asphalt: 1.0 };

/**
 * Procedural Earth terrain for the farm → NASA region.
 */
export class EarthGen {
  readonly noise = new Noise(2067);
  readonly n2 = new Noise(4021);
  readonly roads: RoadPath[] = [];
  readonly flats: Flat[] = [];
  field!: HeightField;
  mask!: THREE.DataTexture; // RGBA8 over the near map
  maskRes = 2048;
  portalLevel = 0;
  siloTop = 0;

  // mountain front: line through the portal heading WSW–ENE; positive = north (into the mountains)
  private frontP = new THREE.Vector2(NASA.portal.x, NASA.portal.z - 18);
  private frontN = new THREE.Vector2(0.22, -1).normalize();

  constructor() {}

  /** Signed distance north of the mountain front (with a wavy edge). */
  frontDist(x: number, z: number) {
    const d = (x - this.frontP.x) * this.frontN.x + (z - this.frontP.y) * this.frontN.y;
    const along = (x - this.frontP.x) * -this.frontN.y + (z - this.frontP.y) * this.frontN.x;
    const wave = this.n2.fbm(along / 1800, 0.37, 3) * 900 * smoothstep(250, 1600, Math.abs(along));
    return d + wave;
  }

  baseHeight(x: number, z: number): number {
    const n = this.noise;
    // rolling plains
    let h = 7 * n.fbm(x / 1400, z / 1400, 4) + 2.2 * n.fbm(x / 300, z / 300, 3) + 0.35 * n.n2(x / 55, z / 55);
    // drainage depressions
    h -= 3.0 * smoothstep(0.55, 0.85, Math.abs(n.fbm(x / 2600 + 4.1, z / 2600 - 2.3, 3)) * 1.6);
    // northern mountains (Cheyenne-style front range): rounded, eroded foothills rising to higher ridges
    const d = this.frontDist(x, z);
    const m = smoothstep(-80, 1400, d);
    if (m > 0) {
      const wx = x + 600 * n.fbm(x / 3000 + 1.7, z / 3000 - 4.2, 3);
      const wz = z + 600 * n.fbm(x / 3000 - 6.1, z / 3000 + 2.9, 3);
      const ridge = n.ridged(wx / 2600 + 11, wz / 2600 - 7, 4, 2.0, 0.45);
      const soft = 0.5 + 0.5 * n.fbm(wx / 1700, wz / 1700, 4);
      const bulk = 60 + 330 * (0.55 * soft + 0.45 * ridge * ridge) * (0.45 + 0.55 * smoothstep(300, 3500, d));
      const face = smoothstep(-30, 220, d); // foothill rise right behind the portal
      h += m * bulk + face * 55;
      h += m * 10 * n.fbm(x / 160, z / 160, 3);
    }
    // distant ranges on the horizon (west/south/east), beyond ~16 km: low, hazy, rounded (image 1)
    const cx = 1450, cz = -1450;
    const r = Math.hypot(x - cx, z - cz);
    const far = smoothstep(16000, 34000, r);
    if (far > 0) h += far * (180 + 520 * (0.5 + 0.5 * n.fbm(x / 9000 - 3, z / 9000 + 5, 4)) * (0.6 + 0.4 * n.ridged(x / 14000, z / 14000, 3)));
    return h;
  }

  /** Build heightmaps, roads and masks. */
  build(progress?: (p: number, msg: string) => void) {
    const T = EARTH_TERRAIN;
    // ---- sites flattened into the terrain
    this.portalLevel = this.baseHeight(NASA.portal.x, NASA.portal.z + 30);
    this.siloTop = this.portalLevel + 128;
    this.flats.push(
      { x: 0, z: 0, r: 0, rect: [62, 46], feather: 30, yard: 0.7 }, // farm yard
      { x: -30, z: -30, r: 0, rect: [22, 18], feather: 12, yard: 0.8 }, // barn pad
      { x: NASA.portal.x, z: NASA.portal.z + 45, r: 0, rect: [55, 60], feather: 25, h: this.portalLevel, yard: 0.7 }, // forecourt
      { x: NASA.gate.pos[0], z: NASA.gate.pos[2], r: 18, feather: 20, yard: 0.5 },
      { x: NASA.silo.x, z: NASA.silo.z, r: 34, feather: 40, h: this.siloTop, yard: 0.0 },
    );
    for (const nb of NEIGHBOURS) this.flats.push({ x: nb.pos[0], z: nb.pos[2], r: 0, rect: [40, 32], feather: 20, yard: 0.8 });
    for (const f of this.flats) if (f.h === undefined) f.h = this.baseHeight(f.x, f.z);

    // ---- roads (smoothed height profile along the centreline)
    const addRoad = (r: RoadSegment, route: boolean) => {
      const pts = catmullRom(r.points as P2[], 3);
      const cum = cumulative(pts);
      const raw = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i++) raw[i] = this.flatHeight(pts[i][0], pts[i][1]) ?? this.baseHeight(pts[i][0], pts[i][1]);
      const heights = new Float32Array(pts.length);
      const win = 14; // ≈ 42 m window
      for (let i = 0; i < pts.length; i++) {
        let s = 0, w = 0;
        for (let k = -win; k <= win; k++) {
          const j = Math.max(0, Math.min(pts.length - 1, i + k));
          const ww = 1 - Math.abs(k) / (win + 1);
          s += raw[j] * ww;
          w += ww;
        }
        heights[i] = s / w;
      }
      // ends that terminate in flats stay exactly on the flat
      this.roads.push({ name: r.name, surface: r.surface, width: r.width, pts, cum, heights, route });
    };
    ROUTE.forEach((r) => addRoad(r, true));
    SIDE_ROADS.forEach((r) => addRoad(r, false));
    progress?.(0.1, 'shaping terrain');

    // ---- near heightmap
    const near = Heightmap.generate(T.center[0], T.center[1], T.size, T.res, (x, z) => this.baseHeight(x, z));
    progress?.(0.45, 'carving roads');
    this.applyFlats(near);
    this.applyRoads(near);
    near.min = Infinity; near.max = -Infinity;
    for (const v of near.data) { if (v < near.min) near.min = v; if (v > near.max) near.max = v; }
    progress?.(0.6, 'distant mountains');
    const far = Heightmap.generate(T.center[0], T.center[1], T.farSize, T.farRes, (x, z) => this.baseHeight(x, z));
    this.field = new HeightField(near, far, 400);
    progress?.(0.7, 'surface masks');
    this.buildMask(near);
  }

  private flatHeight(x: number, z: number): number | null {
    for (const f of this.flats) {
      const inside = f.rect ? Math.abs(x - f.x) <= f.rect[0] && Math.abs(z - f.z) <= f.rect[1] : Math.hypot(x - f.x, z - f.z) <= f.r;
      if (inside) return f.h!;
    }
    return null;
  }

  private flatWeight(f: Flat, x: number, z: number) {
    let d: number;
    if (f.rect) {
      const dx = Math.max(0, Math.abs(x - f.x) - f.rect[0]);
      const dz = Math.max(0, Math.abs(z - f.z) - f.rect[1]);
      d = Math.hypot(dx, dz);
    } else d = Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
    return 1 - smoothstep(0, f.feather, d);
  }

  private applyFlats(hm: Heightmap) {
    const r = hm.res, c = hm.cell, d = hm.data;
    for (const f of this.flats) {
      const ext = (f.rect ? Math.max(f.rect[0], f.rect[1]) : f.r) + f.feather + c;
      const i0 = Math.max(0, Math.floor((f.x - ext - hm.minX) / c)), i1 = Math.min(r - 1, Math.ceil((f.x + ext - hm.minX) / c));
      const j0 = Math.max(0, Math.floor((f.z - ext - hm.minZ) / c)), j1 = Math.min(r - 1, Math.ceil((f.z + ext - hm.minZ) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = hm.minX + i * c, z = hm.minZ + j * c;
        const w = this.flatWeight(f, x, z);
        if (w > 0) d[j * r + i] = lerp(d[j * r + i], f.h!, w);
      }
    }
  }

  private applyRoads(hm: Heightmap) {
    const r = hm.res, c = hm.cell, d = hm.data;
    const best = new Float32Array(r * r).fill(1e9);
    const bestH = new Float32Array(r * r);
    const bestW = new Float32Array(r * r);
    for (const road of this.roads) {
      const half = road.width / 2;
      const infl = half + 10;
      for (let k = 1; k < road.pts.length; k++) {
        const [ax, az] = road.pts[k - 1], [bx, bz] = road.pts[k];
        const ha = road.heights[k - 1], hb = road.heights[k];
        const minx = Math.min(ax, bx) - infl, maxx = Math.max(ax, bx) + infl;
        const minz = Math.min(az, bz) - infl, maxz = Math.max(az, bz) + infl;
        const i0 = Math.max(0, Math.floor((minx - hm.minX) / c)), i1 = Math.min(r - 1, Math.ceil((maxx - hm.minX) / c));
        const j0 = Math.max(0, Math.floor((minz - hm.minZ) / c)), j1 = Math.min(r - 1, Math.ceil((maxz - hm.minZ) / c));
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = hm.minX + i * c, z = hm.minZ + j * c;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + dx * t, pz = az + dz * t;
          const dist = Math.hypot(x - px, z - pz);
          const idx = j * r + i;
          if (dist < best[idx]) {
            best[idx] = dist;
            bestH[idx] = ha + (hb - ha) * t;
            bestW[idx] = half;
          }
        }
      }
    }
    for (let idx = 0; idx < r * r; idx++) {
      const dist = best[idx];
      if (dist > 1e8) continue;
      const half = bestW[idx];
      const w = 1 - smoothstep(half + 1.5, half + 10, dist);
      if (w <= 0) continue;
      // slight crown and ditch
      const crown = dist < half ? 0.05 * (1 - (dist / half) ** 2) : -0.25 * smoothstep(half + 1, half + 4, dist) * (1 - smoothstep(half + 5, half + 9, dist));
      d[idx] = lerp(d[idx], bestH[idx] + crown, w);
    }
  }

  private buildMask(hm: Heightmap) {
    const R = this.maskRes;
    const buf = new Uint8Array(R * R * 4);
    const cell = hm.size / R;
    const put = (i: number, j: number, ch: number, v: number, mode: 'max' | 'set' = 'max') => {
      if (i < 0 || j < 0 || i >= R || j >= R) return;
      const k = (j * R + i) * 4 + ch;
      const b = Math.round(v * 255);
      buf[k] = mode === 'max' ? Math.max(buf[k], b) : b;
    };
    // roads → R (weight), G (surface)
    for (const road of this.roads) {
      const half = road.width / 2;
      for (let k = 1; k < road.pts.length; k++) {
        const [ax, az] = road.pts[k - 1], [bx, bz] = road.pts[k];
        const ext = half + 4;
        const i0 = Math.floor((Math.min(ax, bx) - ext - hm.minX) / cell), i1 = Math.ceil((Math.max(ax, bx) + ext - hm.minX) / cell);
        const j0 = Math.floor((Math.min(az, bz) - ext - hm.minZ) / cell), j1 = Math.ceil((Math.max(az, bz) + ext - hm.minZ) / cell);
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = hm.minX + (i + 0.5) * cell, z = hm.minZ + (j + 0.5) * cell;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dist = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
          const w = 1 - smoothstep(half - 1, half + 3.5, dist);
          if (w > 0) {
            const k0 = (j * R + i) * 4;
            if (i >= 0 && j >= 0 && i < R && j < R && w * 255 > buf[k0]) put(i, j, 1, SURFACE_CODE[road.surface], 'set');
            put(i, j, 0, w);
          }
        }
      }
    }
    // flats → B
    for (const f of this.flats) {
      if (!f.yard) continue;
      const ext = (f.rect ? Math.max(f.rect[0], f.rect[1]) : f.r) + f.feather;
      const i0 = Math.floor((f.x - ext - hm.minX) / cell), i1 = Math.ceil((f.x + ext - hm.minX) / cell);
      const j0 = Math.floor((f.z - ext - hm.minZ) / cell), j1 = Math.ceil((f.z + ext - hm.minZ) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = hm.minX + (i + 0.5) * cell, z = hm.minZ + (j + 0.5) * cell;
        const w = this.flatWeight({ ...f, feather: f.feather * 0.35 }, x, z) * f.yard;
        put(i, j, 2, w);
      }
    }
    // fields → A
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      const i0 = Math.floor((x0 - hm.minX) / cell), i1 = Math.ceil((x1 - hm.minX) / cell);
      const j0 = Math.floor((z0 - hm.minZ) / cell), j1 = Math.ceil((z1 - hm.minZ) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) put(i, j, 3, 1);
    }
    const t = new THREE.DataTexture(buf, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    this.mask = t;
  }

  height(x: number, z: number) {
    return this.field.height(x, z);
  }

  /** Field containing a point (or null). */
  fieldAt(x: number, z: number) {
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return f;
    }
    return null;
  }

  surfaceAt(x: number, z: number): 'gravel' | 'dirt' | 'concrete' | 'rock' {
    for (const road of this.roads) {
      // quick reject by bounding box
      const p = road.pts;
      const step = 6;
      for (let k = step; k < p.length; k += step) {
        const ax = p[k - step][0], az = p[k - step][1], bx = p[k][0], bz = p[k][1];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < road.width / 2 + 0.5) return road.surface === 'asphalt' ? 'concrete' : road.surface === 'gravel' ? 'gravel' : 'dirt';
      }
    }
    if (this.flatHeight(x, z) !== null) return 'gravel';
    return this.frontDist(x, z) > 40 ? 'rock' : 'dirt';
  }

  /** The GPS route as one polyline. */
  routePolyline(): P2[] {
    const out: P2[] = [];
    for (const r of this.roads.filter((r) => r.route)) {
      for (const p of r.pts) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.5) out.push(p);
      }
    }
    return out;
  }
}

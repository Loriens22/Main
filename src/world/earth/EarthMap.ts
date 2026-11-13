import { clamp, fbm2, hash2, lerp, smoothstep, vnoise } from '../../core/math';

/**
 * Geography of the Earth zone: a deterministic, analytic description of the countryside between the
 * farm and the concealed NASA facility. Everything (terrain meshes, physics, road, crops, GPS, NPC
 * routes) queries this one model, so visuals and simulation can never disagree.
 *
 * Zone frame: +X east, +Z south, +Y up, metres. The farm sits in the west, the facility ~6 km of
 * road to the east where the plains break up into rugged hills.
 */
export interface RoadSample { x: number; z: number; y: number; s: number; tx: number; tz: number; w: number; paved: number }
export interface Field { id: string; name: string; cx: number; cz: number; w: number; d: number; rows: 'x' | 'z' }

const ROAD_CTRL: [number, number][] = [
  [-2575, 34], [-2500, 42], [-2380, 40], [-2250, 70], [-1960, 150], [-1560, 96], [-1180, -70], [-860, -200], [-470, -170],
  [-60, -370], [250, -540], [640, -400], [900, -600], [1090, -880], [1440, -740], [1640, -960], [1740, -1250], [2070, -1190],
  [2270, -1380], [2400, -1530], [2466, -1616], [2520, -1686],
];

export const FARM = { x: -2600, z: -18, yardR: 62 };
/** Centre of the mountain that hides the facility; the tunnel portal sits at its foot. */
export const MOUNTAIN = { x: 3250, z: -2600 };
/** NASA: gate on the approach road, tunnel portal in the hillside; `dir` is the unit direction into the mountain. */
export const NASA = { gate: { x: 2420, z: -1556 }, portal: { x: 2520, z: -1686 }, dir: { x: 0.6097, z: -0.7926 }, silo: { x: 2800, z: -2050 } };

export const FIELDS: Field[] = [
  { id: 'south', name: 'South Field', cx: -2600, cz: 222, w: 620, d: 350, rows: 'x' },
  { id: 'west', name: 'West Field', cx: -3010, cz: -40, w: 380, d: 420, rows: 'z' },
  { id: 'north', name: 'North Field', cx: -2560, cz: -330, w: 560, d: 300, rows: 'x' },
  { id: 'east', name: 'East Field', cx: -2200, cz: -180, w: 300, d: 300, rows: 'z' },
];

const CELL = 24;

export class EarthMap {
  road: RoadSample[] = [];
  roadLength = 0;
  private grid = new Map<number, number[]>();
  farmY = 0;
  nasaY = 0;
  private ready = false;

  constructor() {
    this.farmY = this.natural(FARM.x, FARM.z);
    this.buildRoad();
    this.ready = true;
  }

  // ------------------------------------------------------------------------------- terrain
  /** Terrain before any man-made grading. */
  natural(x: number, z: number): number {
    const swell = (fbm2(x / 1100 + 3.1, z / 1100 - 1.7, 4) - 0.5) * 34;
    const roll = (fbm2(x / 210 - 8.3, z / 210 + 5.1, 4) - 0.5) * 7;
    const fine = (vnoise(x / 23, z / 23) - 0.5) * 0.5;
    // the plains break into rugged hills toward the east
    const rug = smoothstep(-300, 2300, x);
    const ridge = 1 - Math.abs(fbm2(x / 520 + 11, z / 520 + 4, 5) * 2 - 1);
    const hills = rug * rug * (ridge * ridge * 150 + (fbm2(x / 150, z / 150, 4) - 0.5) * 26 * rug);
    // the mountain that hides the facility
    const mx = x - MOUNTAIN.x, mz = z - MOUNTAIN.z;
    const md = Math.sqrt(mx * mx + mz * mz);
    const mnoise = 0.72 + 0.56 * fbm2(x / 330 - 2, z / 330 + 9, 5);
    const mountain = 310 * Math.pow(smoothstep(1500, 120, md), 1.6) * mnoise;
    // low rolling hills to the west and north-west (left of frame in reference 1)
    const wh = smoothstep(-3500, -5200, x) * (40 + 90 * fbm2(x / 800 + 5, z / 800, 4));
    // distant ranges all around, highest to the east (blue range in reference 1)
    const r = Math.sqrt(x * x + z * z);
    const ring = smoothstep(6500, 15000, r);
    const ranges = ring * (260 + 1300 * Math.pow(fbm2(x / 3900 + 1.3, z / 3900 - 7.7, 5), 1.5)) * (0.55 + 0.45 * smoothstep(-9000, 9000, x));
    return 60 + swell + roll + fine + hills + mountain + wh + ranges;
  }

  /** Final ground height including the graded farm yard, road bed, ditches and the NASA approach cut. */
  height(x: number, z: number): number {
    let h = this.natural(x, z);
    // farm yard pad
    const fd = Math.hypot(x - FARM.x, z - FARM.z);
    if (fd < 260) h = lerp(this.farmY, h, smoothstep(90, 260, fd));
    // plots are levelled a little compared to wild ground
    if (!this.ready) return h;
    // NASA approach cut and the cover above the tunnel
    const px = x - NASA.portal.x, pz = z - NASA.portal.z;
    const along = px * NASA.dir.x + pz * NASA.dir.z;
    const lat = Math.abs(-px * NASA.dir.z + pz * NASA.dir.x);
    if (along > -140 && along < 260 && lat < 90) {
      if (along <= 0) {
        // level forecourt in front of the portal, widening away from the mountain
        const half = 16 + Math.max(0, -along) * 0.22;
        const k = smoothstep(half, half + 22, lat);
        const endFade = smoothstep(-140, -70, along);
        h = lerp(h, lerp(this.nasaY, h, k), endFade);
      } else {
        // guarantee solid cover over the tunnel: the hillside climbs steeply behind the headwall
        const cover = this.nasaY + 11 + along * 0.75;
        const k = 1 - smoothstep(22, 60, lat);
        h = lerp(h, Math.max(h, cover), k);
      }
    }
    // concealed silo cap on the mountain flank: a shallow levelled bowl
    const sd = Math.hypot(x - NASA.silo.x, z - NASA.silo.z);
    if (sd < 90) h = lerp(this.siloY, h, smoothstep(34, 90, sd));
    // road bed
    const rd = this.roadQuery(x, z);
    if (rd) {
      const w = rd.w * 0.5 + 0.8;
      const d = rd.d;
      if (d < w + 16) {
        const ditch = 0.5 * smoothstep(w, w + 2.2, d) * (1 - smoothstep(w + 2.6, w + 6.5, d));
        h = lerp(rd.y - ditch, h, smoothstep(w + 1.0, w + 16, d));
      }
    }
    return h;
  }

  siloY = 0;

  /** True where the terrain surface must be removed (tunnel mouth, silo shaft). */
  hole(x: number, z: number): boolean {
    const px = x - NASA.portal.x, pz = z - NASA.portal.z;
    const along = px * NASA.dir.x + pz * NASA.dir.z;
    const lat = Math.abs(-px * NASA.dir.z + pz * NASA.dir.x);
    if (along > -1.5 && along < 46 && lat < 9.5) return true;
    if (Math.hypot(x - NASA.silo.x, z - NASA.silo.z) < 15.5) return true;
    return false;
  }

  // ------------------------------------------------------------------------------- road
  private buildRoad() {
    // Catmull-Rom through the control points, then resample at 2 m.
    const P = ROAD_CTRL;
    const dense: [number, number][] = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < 40; k++) {
        const t = k / 40, t2 = t * t, t3 = t2 * t;
        dense.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    dense.push(P[P.length - 1]);
    const pts: [number, number][] = [dense[0]];
    let carry = 0;
    const STEP = 2;
    for (let i = 1; i < dense.length; i++) {
      let [ax, az] = dense[i - 1];
      const [bx, bz] = dense[i];
      let seg = Math.hypot(bx - ax, bz - az);
      while (carry + seg >= STEP) {
        const t = (STEP - carry) / seg;
        ax += (bx - ax) * t; az += (bz - az) * t;
        pts.push([ax, az]);
        seg = Math.hypot(bx - ax, bz - az);
        carry = 0;
      }
      carry += seg;
    }
    const n = pts.length;
    // elevation profile: natural ground, heavily smoothed, pinned at both ends
    const raw = pts.map(([x, z]) => this.natural(x, z));
    raw[0] = this.farmY;
    let y = raw.slice();
    for (let pass = 0; pass < 3; pass++) {
      const out = y.slice();
      const R = 22;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum = 0;
        let c = 0;
        for (let k = -R; k <= R; k += 2) { const j = clamp(i + k, 0, n - 1); sum += y[j]; c++; }
        out[i] = sum / c;
      }
      y = out;
    }
    // limit the gradient to 8 % (cuttings and embankments take up the rest), then re-smooth
    const G = 0.08 * STEP;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - G, y[i - 1] + G);
      for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - G, y[i + 1] + G);
    }
    for (let pass = 0; pass < 2; pass++) {
      const out = y.slice();
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -8; k <= 8; k++) { sum += y[clamp(i + k, 0, n - 1)]; c++; }
        out[i] = sum / c;
      }
      y = out;
    }
    // keep the first stretch on the yard level and let the last stretch settle onto the forecourt level
    this.nasaY = y[n - 1];
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const a = smoothstep(40, 220, s);
      y[i] = lerp(this.farmY, y[i], a);
      const e = smoothstep((n - 1) * STEP - 150, (n - 1) * STEP - 30, s);
      y[i] = lerp(y[i], this.nasaY, e);
    }
    this.siloY = this.natural(NASA.silo.x, NASA.silo.z) - 3;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const s = i * STEP;
      const paved = smoothstep(300, 360, s);
      this.road.push({ x: pts[i][0], z: pts[i][1], y: y[i], s, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, w: lerp(4.6, 6.6, paved), paved });
      const key = this.key(pts[i][0], pts[i][1]);
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(i);
    }
    this.roadLength = (n - 1) * STEP;
  }

  private key(x: number, z: number) {
    return (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096);
  }

  /** Nearest point on the road within ~30 m: lateral distance d, arc length s, road height y, width w. */
  roadQuery(x: number, z: number): { d: number; s: number; y: number; w: number; i: number; side: number; paved: number } | null {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = 1e9, bi = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.grid.get((cx + dx + 4096) * 8192 + (cz + dz + 4096));
      if (!list) continue;
      for (const i of list) {
        const r = this.road[i];
        const d = (r.x - x) * (r.x - x) + (r.z - z) * (r.z - z);
        if (d < best) { best = d; bi = i; }
      }
    }
    if (bi < 0) return null;
    // refine against the two adjacent segments
    const R = this.road;
    let bd = Math.sqrt(best), bs = R[bi].s, by = R[bi].y;
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j >= R.length - 1) continue;
      const a = R[j], b = R[j + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez), 0, 1);
      const d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z);
      if (d < bd) { bd = d; bs = a.s + (b.s - a.s) * t; by = a.y + (b.y - a.y) * t; }
    }
    const r = R[bi];
    const side = Math.sign((x - r.x) * -r.tz + (z - r.z) * r.tx) || 1;
    return { d: bd, s: bs, y: by, w: r.w, i: bi, side, paved: r.paved };
  }

  /** Road frame at arc length s. */
  roadAt(s: number): RoadSample {
    const f = clamp(s / 2, 0, this.road.length - 1);
    const i = Math.min(this.road.length - 2, Math.floor(f)), t = f - i;
    const a = this.road[i], b = this.road[i + 1];
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), s, tx: lerp(a.tx, b.tx, t), tz: lerp(a.tz, b.tz, t), w: lerp(a.w, b.w, t), paved: lerp(a.paved, b.paved, t) };
  }

  // ------------------------------------------------------------------------------- land use
  /** How rugged / unfarmable the ground is here (0 plains .. 1 hills). */
  rugged(x: number, z: number) {
    const rug = smoothstep(350, 1500, x);
    const mx = x - MOUNTAIN.x, mz = z - MOUNTAIN.z;
    return Math.max(rug, smoothstep(1700, 900, Math.hypot(mx, mz)), smoothstep(-3700, -4700, x), smoothstep(5200, 6500, Math.hypot(x, z)));
  }

  /** Crop plot under a point: the named farm fields first, then the procedural patchwork of the county. */
  plot(x: number, z: number): { corn: number; rows: 'x' | 'z'; field: Field | null; edge: number } {
    for (const f of FIELDS) {
      const dx = Math.abs(x - f.cx) - f.w / 2, dz = Math.abs(z - f.cz) - f.d / 2;
      const e = Math.max(dx, dz);
      if (e < 0) return { corn: 1, rows: f.rows, field: f, edge: -e };
    }
    if (Math.hypot(x - FARM.x, z - FARM.z) < 520) return { corn: 0, rows: 'x', field: null, edge: 0 };
    const S = 430;
    const gx = Math.floor(x / S), gz = Math.floor(z / S);
    const lx = x - gx * S, lz = z - gz * S;
    const e = Math.min(lx, S - lx, lz, S - lz) - 7;
    if (e < 0) return { corn: 0, rows: 'x', field: null, edge: 0 };
    const hsh = hash2(gx * 3 + 11, gz * 7 - 5);
    const corn = hsh < 0.62 && this.rugged(gx * S + S / 2, gz * S + S / 2) < 0.22 ? 1 : 0;
    return { corn, rows: hash2(gx - 91, gz + 37) < 0.5 ? 'x' : 'z', field: null, edge: e };
  }

  /** 0..1 crop cover (0 on roads, the yard, lanes and rough ground). */
  cornDensity(x: number, z: number): number {
    const p = this.plot(x, z);
    if (!p.corn) return 0;
    if (Math.hypot(x - FARM.x, z - FARM.z) < FARM.yardR + 6) return 0;
    const rd = this.roadQuery(x, z);
    if (rd && rd.d < rd.w * 0.5 + 9) return 0;
    return smoothstep(0, 2.5, p.edge);
  }

  /** Surface type weights: [dirt, dry grass, tilled soil, gravel]. Rock is derived from slope in the shader. */
  splat(x: number, z: number, out: Float32Array | number[]) {
    const fd = Math.hypot(x - FARM.x, z - FARM.z);
    const yard = 1 - smoothstep(FARM.yardR - 8, FARM.yardR + 10, fd);
    const p = this.plot(x, z);
    const corn = p.corn ? smoothstep(-1, 2, p.edge) : 0;
    const rd = this.roadQuery(x, z);
    let shoulder = 0;
    if (rd) shoulder = 1 - smoothstep(rd.w * 0.5 + 0.5, rd.w * 0.5 + 4.5, rd.d);
    const n = fbm2(x / 37 + 9, z / 37 - 3, 3);
    const lane = !p.corn && this.rugged(x, z) < 0.3 ? smoothstep(0.55, 0.75, n) * 0.6 : 0;
    let gravel = Math.max(yard * (0.55 + 0.45 * smoothstep(0.35, 0.65, n)), shoulder * 0.9);
    let soil = corn * (1 - gravel);
    let dirt = Math.max(yard * 0.5, lane, shoulder * 0.3) * (1 - soil);
    gravel = Math.min(gravel, 1 - soil);
    let grass = Math.max(0, 1 - soil - dirt * 0.8 - gravel);
    const sum = dirt + grass + soil + gravel || 1;
    out[0] = dirt / sum; out[1] = grass / sum; out[2] = soil / sum; out[3] = gravel / sum;
    return out;
  }
}

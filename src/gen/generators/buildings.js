// ---------------------------------------------------------------------------
// Building generator.
//
// Houses are assembled from a floor plan of volumes (a modern house stacks
// a cantilevered upper box over the ground floor; traditional houses stack
// identical floors, optionally with a wing), then walls with window/door
// openings are laid out per facade according to the style, followed by
// slabs with stairwells, straight stairs, roofs (flat + parapet/terrace
// railings, gable, hip), porches, canopies, chimneys, interior furniture,
// automatic doors, lights and a landscaped garden (hedges, fences,
// stepping-stone paths, decks, flower beds, ornamental trees, pools,
// bollard lights). Everything is seeded; sizes/palettes/layouts vary.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { G, genPreset } from '../../core/context.js';
import { MeshBuilder, wallSegmentsX, wallSegmentsZ, windowFrame, slab, stairs, railing, gableRoof, hipRoof, flatRoof, coneRoof, roundWall } from './buildkit.js';
import { placePiece, furnitureMaterials, seatWorldFn, sitNearest, attachFire } from './furniture.js';
import { hedgeGeometry, hedgeMaterial, flowerBed, steppingPath, bollard, gardenTree, fence, pool } from './garden.js';
import { buildSpecial } from './buildings2.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------- Styles ----------------
const HOUSE_STYLES = {
  modern: {
    floors: (r) => r.weighted([[2, 5], [1, 1.5], [3, 1]]), w: [10.5, 14], d: [8.5, 11], floorH: 3.2, roof: 'flat', windows: 'modern', porch: false,
    palette: (r, a) => ({
      wall: ['stucco', { color: a.primaryColor || r.pick(['#f2f0ea', '#ebe7df', '#f4f4f2', '#dcd8d0']) }],
      accent: r.pick([['cladding', { seed: r.int(0, 2) }], ['concretePanels', {}], ['fieldstone', {}], ['woodSiding', { q: [0.7, 0] }]]),
      frame: ['painted', { color: r.pick(['#1f2124', '#2a2c30', '#3a3632']), roughness: 0.5 }],
      trim: ['metal', { color: '#3a3c40' }], roof: ['gravel', { color: '#8a8680' }], base: ['concrete', { color: '#8e8c88' }],
    }),
  },
  suburban: {
    floors: (r) => r.weighted([[2, 3], [1, 2]]), w: [9, 12], d: [7.5, 9.5], floorH: 2.9, roof: 'gable', pitch: [28, 36], windows: 'grid', porch: 0.6, chimney: 0.6, garage: 0.45, shutters: 0.5,
    palette: (r, a) => {
      const brick = r.chance(0.35);
      return {
        wall: brick ? ['brick', { color: a.primaryColor, seed: r.int(0, 2) }] : ['siding', { color: a.primaryColor || r.pick(['#dfe6ea', '#e8e0cc', '#c8d4c0', '#d8d8d0', '#b8c8d8', '#e8d8c0', '#9aa8a0']) }],
        accent: ['paint', { color: '#f4f4f0' }], frame: ['paint', { color: '#f6f6f2' }], trim: ['paint', { color: '#f4f4f0' }],
        roof: [r.pick(['shingles', 'slate', 'shingles', 'rooftiles']), { color: a.colors.find((c) => c.part === 'roof')?.color, seed: r.int(0, 2) }],
        base: ['brick', { color: '#6a3a2a' }], shutter: ['painted', { color: r.pick(['#1f2a3a', '#2a3a2a', '#5a1a1a', '#2a2a2a']) }],
      };
    },
  },
  cottage: {
    floors: (r) => r.weighted([[1, 3], [2, 1]]), w: [7, 9.5], d: [6, 7.5], floorH: 2.7, roof: 'gable', pitch: [44, 52], windows: 'cottage', porch: 0.2, chimney: 0.95,
    palette: (r, a) => ({
      wall: r.chance(0.55) ? ['fieldstone', { seed: r.int(0, 2) }] : ['stucco', { color: a.primaryColor || '#ece2cc' }],
      accent: ['darkWood', {}], frame: ['darkWood', {}], trim: ['darkWood', {}],
      roof: r.chance(0.5) ? ['thatch', {}] : ['slate', { seed: 1 }], base: ['fieldstone', {}], shutter: ['painted', { color: r.pick(['#3a5a3a', '#4a6a8a', '#8a3a2a']) }],
    }),
  },
  cabin: {
    floors: () => 1, w: [7, 10], d: [6, 8], floorH: 2.8, roof: 'gable', pitch: [32, 40], windows: 'cottage', porch: 0.9, chimney: 0.8, logs: true,
    palette: (r) => ({ wall: ['logs', { seed: r.int(0, 2) }], accent: ['darkWood', {}], frame: ['darkWood', {}], trim: ['darkWood', {}], roof: [r.pick(['shingles', 'slate']), { color: '#3a3430' }], base: ['fieldstone', {}] }),
  },
  victorian: {
    floors: () => 2, w: [9, 12], d: [8, 10], floorH: 3.1, roof: 'gable', pitch: [45, 52], windows: 'tall', porch: 1, chimney: 0.8, turret: 0.8, shutters: 0.3,
    palette: (r, a) => ({
      wall: ['siding', { color: a.primaryColor || r.pick(['#8aa898', '#d8c078', '#a8b8d0', '#d8a0a8', '#b8a0c8', '#e8e0d0']) }],
      accent: ['paint', { color: '#f4f0e8' }], frame: ['paint', { color: '#f2eee6' }], trim: ['paint', { color: r.pick(['#f2eee6', '#5a2a3a', '#2a3a5a']) }],
      roof: ['slate', { seed: 2 }], base: ['brick', { color: '#5a3028' }], shutter: ['painted', { color: '#2a2a3a' }],
    }),
  },
  mansion: {
    floors: () => 3, w: [18, 24], d: [11, 14], floorH: 3.4, roof: 'hip', pitch: [26, 32], windows: 'tall', porch: 0, portico: true, chimney: 1,
    palette: (r, a) => ({
      wall: r.chance(0.5) ? ['whiteBrick', {}] : ['stucco', { color: a.primaryColor || r.pick(['#f0e8d8', '#e8e4dc', '#d8cfc0']) }],
      accent: ['marble', {}], frame: ['paint', { color: '#f4f2ec' }], trim: ['paint', { color: '#f4f2ec' }], roof: ['slate', { seed: 0 }], base: ['granite', {}], shutter: ['painted', { color: '#1a2a1a' }],
    }),
  },
  farmhouse: {
    floors: () => 2, w: [10, 13], d: [7.5, 9], floorH: 2.9, roof: 'gable', pitch: [38, 45], windows: 'grid', porch: 1, chimney: 0.7,
    palette: (r, a) => ({ wall: ['siding', { color: a.primaryColor || '#f2f0ea' }], accent: ['paint', { color: '#2a2a2a' }], frame: ['paint', { color: '#1f1f1f' }], trim: ['paint', { color: '#f4f4f0' }], roof: ['metal', { color: '#3a3c40' }], base: ['fieldstone', {}] }),
  },
  medieval: {
    floors: () => 2, w: [7, 9], d: [6, 7.5], floorH: 2.8, roof: 'gable', pitch: [48, 55], windows: 'cottage', porch: 0, chimney: 0.7, timber: true,
    palette: () => ({ wall: ['stucco', { color: '#e8dcc0' }], accent: ['darkWood', {}], frame: ['darkWood', {}], trim: ['darkWood', {}], roof: [Math.random() < 0.5 ? 'thatch' : 'rooftiles', {}], base: ['fieldstone', {}] }),
  },
  haunted: {
    floors: () => 2, w: [9, 12], d: [8, 10], floorH: 3.1, roof: 'gable', pitch: [50, 56], windows: 'tall', porch: 1, chimney: 1, turret: 0.7, worn: true,
    palette: () => ({ wall: ['siding', { color: '#4a4640' }], accent: ['darkWood', {}], frame: ['darkWood', {}], trim: ['darkWood', {}], roof: ['slate', { color: '#2a2a2e' }], base: ['fieldstone', {}], shutter: ['painted', { color: '#1a1a1a' }] }),
  },
};

export function resolveStyle(item) {
  const a = item.attrs || {};
  let style = item.params.style || 'suburban';
  const s = a.style;
  if (item.concept === 'house' || item.concept === 'modern house') {
    if (s === 'modern' || s === 'futuristic' || s === 'brutalist' || s === 'cyberpunk' || s === 'luxury' && item.concept === 'modern house') style = s === 'futuristic' || s === 'cyberpunk' ? 'futuristicHouse' : 'modern';
    else if (s === 'medieval' || s === 'fantasy') style = 'medieval';
    else if (s === 'victorian' || s === 'gothic') style = 'victorian';
    else if (s === 'rustic') style = a.words.includes('farmhouse') ? 'farmhouse' : 'cottage';
    else if (s === 'spooky' || s === 'ruined' || a.flags.worn) style = 'haunted';
    else if (s === 'japanese') style = 'japanese';
    else if (s === 'luxury') style = 'mansion';
    else if (s === 'alien') style = 'alien';
    else if (s === 'egyptian' || s === 'ancient') style = 'greek';
    else if (s === 'arctic') style = 'igloo';
    else if (s === 'tropical') style = 'modern';
  }
  if (a.words && a.words.includes('farmhouse')) style = 'farmhouse';
  if (style === 'cottage' && a.words && a.words.includes('hobbit')) style = 'cottage';
  return style;
}

// ---------------- Window layouts ----------------
function layoutWall(len, h, kind, rng, o = {}) {
  const ops = [];
  const door = o.door; // {u, w}
  const add = (u0, u1, v0, v1, k = 'window') => { if (u1 - u0 > 0.3) ops.push({ u0, u1, v0, v1, kind: k }); };
  const avoid = (u0, u1) => !door || u1 < door.u - door.w / 2 - 0.3 || u0 > door.u + door.w / 2 + 0.3;
  if (door) add(door.u - door.w / 2, door.u + door.w / 2, 0.0, door.h || 2.2, 'door');
  if (kind === 'glasswall') {
    // Large glazing across most of the facade, leaving solid piers; a sliding opening in the middle.
    const g0 = o.g0 ?? 0.5, g1 = o.g1 ?? len - 0.5;
    const slider = o.slider;
    if (slider) {
      add(g0, slider.u - slider.w / 2, 0.05, h - 0.35);
      add(slider.u - slider.w / 2, slider.u + slider.w / 2, 0.0, h - 0.35, 'door');
      add(slider.u + slider.w / 2, g1, 0.05, h - 0.35);
    } else add(g0, g1, 0.05, h - 0.35);
    return ops;
  }
  if (kind === 'ribbon') { add(o.g0 ?? 0.6, o.g1 ?? len - 0.6, 0.85, h - 0.45); return ops; }
  if (kind === 'modern') {
    const n = clamp(Math.round(len / rng.range(3.2, 4.8)), 1, 4);
    const tall = rng.chance(0.5);
    for (let i = 0; i < n; i++) {
      const c = len * (i + 0.5) / n, w = tall ? rng.range(0.8, 1.1) : rng.range(1.4, 2.2);
      if (avoid(c - w / 2, c + w / 2)) add(c - w / 2, c + w / 2, tall ? 0.1 : 0.8, h - 0.4);
    }
    return ops;
  }
  const spec = { grid: [1.05, 1.45, 0.9, 2.6], cottage: [0.8, 1.0, 1.0, 2.8], tall: [0.95, 1.9, 0.6, 2.4], big: [1.8, 1.9, 0.5, 3.4] }[o.big ? 'big' : kind] || [1.0, 1.4, 0.9, 2.6];
  const [w, wh, sill, spacing] = spec;
  const n = Math.max(1, Math.floor((len - 0.6) / spacing));
  for (let i = 0; i < n; i++) {
    const c = len * (i + 0.5) / n;
    if (avoid(c - w / 2, c + w / 2)) add(c - w / 2, c + w / 2, sill, Math.min(h - 0.25, sill + wh));
  }
  return ops;
}

// Subtract covered intervals from [a,b].
function subtractIntervals(a, b, cuts) {
  let segs = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
      if (c0 > s0) next.push([s0, c0]);
      if (c1 < s1) next.push([c1, s1]);
    }
    segs = next;
  }
  return segs.filter(([s0, s1]) => s1 - s0 > 0.8);
}

// ---------------- House ----------------
function* buildHouse(ctx, item, rng, style) {
  const a = item.attrs;
  const gp = genPreset();
  const S = HOUSE_STYLES[style] || HOUSE_STYLES.suburban;
  const detail = ctx.detail * gp.detail;
  ctx.stage('plan', 'Designing floor plan');
  const floors = clamp(a.floors || item.params.floors || S.floors(rng), 1, 6);
  const sm = Math.sqrt(clamp(a.sizeMul || 1, 0.6, 3));
  let W = rng.range(S.w[0], S.w[1]) * sm, D = rng.range(S.d[0], S.d[1]) * sm;
  if (a.dims.width) W = clamp(a.dims.width, 5, 60);
  if (a.dims.length) D = clamp(a.dims.length, 5, 60);
  if (W < D) [W, D] = [D, W];
  const FH = S.floorH, T = 0.28, BASE = 0.15;
  const P = S.palette(rng, a);
  const wantGarden = a.features.includes('garden') || a.features.includes('lawn') || a.features.includes('trees') || a.features.includes('flowers') || (style !== 'cabin' && rng.chance(0.55));
  const wantPool = a.features.includes('pool') || a.features.includes('swimming pool') || (style === 'modern' && wantGarden && rng.chance(0.3)) || (style === 'mansion' && rng.chance(0.5));
  const bigWindows = !!a.flags.bigWindows || style === 'modern';
  // Volumes (house-local, front = +Z, centred on the house).
  const vols = [];
  vols.push({ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, f: 0 });
  let cantilever = null;
  for (let f = 1; f < floors; f++) {
    if (style === 'modern') {
      const wB = W * rng.range(0.6, 0.86), dB = D * rng.range(0.92, 1.12);
      const side = f % 2 ? rng.sign() : -(vols[f - 1].sideSign || 1);
      const over = rng.range(0.9, 2.6);
      const z1 = D / 2 + over, z0 = Math.max(-D / 2, z1 - dB);
      const x0 = side > 0 ? W / 2 - wB + rng.range(-0.6, 0.8) : -W / 2 + rng.range(-0.8, 0.6);
      const v = { x0, x1: x0 + wB, z0, z1, f, sideSign: side };
      vols.push(v);
      if (f === 1) cantilever = { over, v };
    } else vols.push({ ...vols[0], f });
  }
  const topVol = vols[vols.length - 1];
  // Stairs region: inside every volume at the back.
  const run = (FH / 0.175) * 0.27;
  let stair = null;
  if (floors > 1) {
    let ix0 = -Infinity, ix1 = Infinity, iz0 = -Infinity, iz1 = Infinity;
    for (const v of vols) { ix0 = Math.max(ix0, v.x0); ix1 = Math.min(ix1, v.x1); iz0 = Math.max(iz0, v.z0); iz1 = Math.min(iz1, v.z1); }
    const onLeft = rng.chance(0.5);
    const sx0 = onLeft ? ix0 + T / 2 + 0.05 : ix1 - T / 2 - 1.1;
    stair = { x0: sx0, x1: sx0 + 1.05, z0: iz0 + T / 2 + 0.25, run: Math.min(run, iz1 - iz0 - 1.5) };
  }
  // Door on the front of the ground floor.
  const doorW = style === 'mansion' ? 1.8 : 1.05;
  let doorU;
  if (style === 'modern') doorU = cantilever ? clamp((cantilever.v.x0 + cantilever.v.x1) / 2 - vols[0].x0 + rng.range(-1, 1), 1.2, W - 1.2) : rng.range(1.4, W * 0.3);
  else doorU = W / 2 + (style === 'suburban' || style === 'farmhouse' ? rng.range(-W * 0.2, W * 0.2) : 0);
  if (stair && Math.abs(vols[0].x0 + doorU - (stair.x0 + 0.5)) < 1.2 && D / 2 - (stair.z0 + stair.run) < 1.2) doorU = W - doorU;
  yield;

  // ---- Geometry ----
  ctx.stage('geometry', 'Raising walls');
  const b = new MeshBuilder();
  const K = { wall: 'wall', int: 'interior', accent: 'accent', frame: 'frame', glass: 'glass', floor: 'floor', ceil: 'ceiling', roof: 'roof', trim: 'trim', base: 'base', stairs: 'stairsMat', deck: 'deck', shutter: 'shutter', coping: 'coping', poolTiles: 'poolTiles', hedge: 'hedge', door: 'doorMat' };
  const openingsAll = [];
  // Plinth.
  b.box({ py: K.base, default: K.base }, [vols[0].x0 - 0.12, -0.8, vols[0].z0 - 0.12], [vols[0].x1 + 0.12, BASE, vols[0].z1 + 0.12], { collide: true });
  // Walls per volume/floor.
  const accentWall = style === 'modern' ? rng.int(0, 3) : -1;
  for (const v of vols) {
    const y0 = BASE + v.f * FH;
    const w = v.x1 - v.x0, d = v.z1 - v.z0;
    const ground = v.f === 0;
    const mk = (face) => {
      let kind = S.windows;
      const o = {};
      if (style === 'modern') {
        if (face === 'front') kind = ground ? 'glasswall' : 'ribbon';
        else if (face === 'back') kind = 'modern';
        else kind = rng.chance(0.4) && !ground ? 'ribbon' : 'modern';
        if (face === 'front' && ground) {
          o.g0 = Math.max(0.5, Math.min(doorU + doorW / 2 + 0.6, w * 0.35));
          o.g1 = w - 0.5;
          if (o.g1 - o.g0 < 2) { o.g0 = 0.5; }
          o.slider = { u: (o.g0 + o.g1) / 2 + rng.range(-0.5, 0.5), w: 1.8 };
          o.door = { u: doorU, w: doorW, h: 2.3 };
          if (doorU + doorW / 2 > o.g0 - 0.3) o.g0 = doorU + doorW / 2 + 0.35;
        }
        if (face === 'front' && !ground && rng.chance(0.4)) kind = 'glasswall';
      } else {
        if (face === 'front' && ground) o.door = { u: doorU, w: doorW, h: 2.2 };
        if (bigWindows && (face === 'front' || face === 'back')) o.big = true;
      }
      const len = face === 'front' || face === 'back' ? w : d;
      return layoutWall(len, FH, kind, rng.fork(face + v.f), o);
    };
    const faces = [
      { face: 'front', fn: () => wallSegmentsX(b, { x0: v.x0, x1: v.x1, z: v.z1 - T / 2, y0, h: FH, t: T, side: 1, ext: accentWall === 0 && !ground ? K.accent : K.wall, int: K.int, openings: mk('front') }) },
      { face: 'back', fn: () => wallSegmentsX(b, { x0: v.x0, x1: v.x1, z: v.z0 + T / 2, y0, h: FH, t: T, side: -1, ext: accentWall === 1 ? K.accent : K.wall, int: K.int, openings: mk('back').map((q) => ({ ...q, u0: w - q.u1, u1: w - q.u0 })) }) },
      { face: 'left', fn: () => wallSegmentsZ(b, { z0: v.z0 + T, z1: v.z1 - T, x: v.x0 + T / 2, y0, h: FH, t: T, side: -1, ext: accentWall === 2 ? K.accent : K.wall, int: K.int, openings: mk('left').map((q) => ({ ...q, u0: q.u0 - T, u1: q.u1 - T })) }) },
      { face: 'right', fn: () => wallSegmentsZ(b, { z0: v.z0 + T, z1: v.z1 - T, x: v.x1 - T / 2, y0, h: FH, t: T, side: 1, ext: accentWall === 3 ? K.accent : K.wall, int: K.int, openings: mk('right').map((q) => ({ ...q, u0: q.u0 - T, u1: q.u1 - T })) }) },
    ];
    for (const f of faces) for (const op of f.fn()) openingsAll.push({ ...op, face: f.face, floor: v.f });
    // Floor slab / ceiling.
    const holes = v.f > 0 && stair ? [[stair.x0 - 0.05, stair.z0 + 0.4, stair.x1 + 0.1, stair.z0 + stair.run + 0.15]] : [];
    if (v.f === 0) b.box({ py: K.floor, default: K.base }, [v.x0 + T, BASE - 0.02, v.z0 + T], [v.x1 - T, BASE, v.z1 - T]);
    else slab(b, v.x0, v.z0, v.x1, v.z1, y0 - 0.25, 0.25, { py: K.floor, ny: K.ceil, default: K.wall }, holes);
    // Cantilever underside & support columns.
    if (v.f === 1 && style === 'modern') {
      const v0 = vols[0];
      if (v.z1 > v0.z1 + 0.3) {
        b.box({ ny: K.ceil, default: K.wall }, [v.x0, y0 - 0.35, v0.z1], [v.x1, y0 - 0.25, v.z1]);
        if (v.z1 - v0.z1 > 1.8) for (const x of [v.x0 + 0.3, v.x1 - 0.3]) b.box(K.frame, [x - 0.08, BASE, v.z1 - 0.45], [x + 0.08, y0 - 0.35, v.z1 - 0.29], { collide: true });
      }
      if (v.x0 < v0.x0 - 0.3 || v.x1 > v0.x1 + 0.3) {
        const xa = v.x0 < v0.x0 ? [v.x0, v0.x0] : [v0.x1, v.x1];
        b.box({ ny: K.ceil, default: K.wall }, [xa[0], y0 - 0.35, v.z0], [xa[1], y0 - 0.25, Math.min(v.z1, v0.z1)]);
      }
    }
  }
  // Stairs.
  if (stair) {
    for (let f = 0; f < floors - 1; f++) {
      const y0 = BASE + f * FH;
      stairs(b, stair.x0, stair.x1, stair.z0, y0, FH, stair.run, { py: style === 'modern' ? K.floor : K.stairs, default: K.int }, { rail: false });
      railing(b, [[stair.x1 + 0.05, stair.z0 + stair.run * 0.35], [stair.x1 + 0.05, stair.z0 + stair.run + 0.1]], y0 + FH, 1, K.frame, { height: 1.0 });
    }
  }
  yield;

  // ---- Roofs ----
  ctx.stage('details', 'Adding roof & details');
  const topY = BASE + floors * FH;
  let roofTop = topY;
  if (S.roof === 'flat') {
    for (const v of vols) {
      const isTop = !vols.some((u) => u.f === v.f + 1);
      if (isTop) { const r = flatRoof(b, v.x0, v.z0, v.x1, v.z1, BASE + (v.f + 1) * FH - 0.02, { roof: K.roof, wall: v.f === 0 ? K.wall : (accentWall >= 0 && rng.chance(0.5) ? K.accent : K.wall), coping: K.coping }, { parapet: rng.range(0.25, 0.6) }); roofTop = Math.max(roofTop, r.top + 0.6); }
      else {
        // Terrace on the exposed part of this volume's roof.
        const up = vols.find((u) => u.f === v.f + 1);
        const yT = BASE + (v.f + 1) * FH;
        slab(b, v.x0, v.z0, v.x1, v.z1, yT - 0.25, 0.25, { py: K.deck, ny: K.ceil, default: K.wall }, []);
        const edges = [
          { a: [v.x0, v.z1], b: [v.x1, v.z1], axis: 'x', c: v.z1, cut: up.z1 > v.z1 - 0.1 ? [[up.x0, up.x1]] : [] },
          { a: [v.x0, v.z0], b: [v.x1, v.z0], axis: 'x', c: v.z0, cut: up.z0 < v.z0 + 0.1 ? [[up.x0, up.x1]] : [] },
          { a: [v.x0, v.z0], b: [v.x0, v.z1], axis: 'z', c: v.x0, cut: up.x0 < v.x0 + 0.1 ? [[up.z0, up.z1]] : [] },
          { a: [v.x1, v.z0], b: [v.x1, v.z1], axis: 'z', c: v.x1, cut: up.x1 > v.x1 - 0.1 ? [[up.z0, up.z1]] : [] },
        ];
        for (const e of edges) {
          const lo = e.axis === 'x' ? v.x0 : v.z0, hi = e.axis === 'x' ? v.x1 : v.z1;
          for (const [s0, s1] of subtractIntervals(lo, hi, e.cut)) {
            const p0 = e.axis === 'x' ? [s0, e.c] : [e.c, s0], p1 = e.axis === 'x' ? [s1, e.c] : [e.c, s1];
            railing(b, [p0, p1], yT, 1, K.frame, { glass: K.glass, height: 1.05 });
          }
        }
      }
    }
  } else {
    const v = topVol;
    const pitch = THREE.MathUtils.degToRad(rng.range(S.pitch[0], S.pitch[1]));
    const along = (v.x1 - v.x0) < (v.z1 - v.z0);
    const R = S.roof === 'hip' ? hipRoof(b, v.x0, v.z0, v.x1, v.z1, topY, pitch, { roof: K.roof, fascia: K.trim }, { overhang: 0.5 })
      : gableRoof(b, v.x0, v.z0, v.x1, v.z1, topY, pitch, { roof: K.roof, gable: K.wall, fascia: K.trim }, { overhang: style === 'cottage' ? 0.35 : 0.5, alongZ: along, ridgeCap: K.trim });
    roofTop = topY + R.ridgeH;
    // Ceiling of the top floor.
    b.box({ ny: K.ceil, default: K.ceil }, [v.x0 + T, topY - 0.02, v.z0 + T], [v.x1 - T, topY, v.z1 - T]);
    // Chimney.
    if (rng.chance(S.chimney || 0)) {
      const cx = rng.chance(0.5) ? v.x0 + 1.2 : v.x1 - 1.2, cz = rng.range(v.z0 + 1.5, v.z1 - 1.5);
      b.box({ default: 'chimney' }, [cx - 0.35, BASE, cz - 0.35], [cx + 0.35, roofTop + 1.0, cz + 0.35], { collide: true });
      b.box(K.trim, [cx - 0.42, roofTop + 1.0, cz - 0.42], [cx + 0.42, roofTop + 1.12, cz + 0.42]);
      if (style === 'cottage' || style === 'cabin' || rng.chance(0.4)) roofSmoke(b, cx, roofTop + 1.2, cz);
    }
  }
  // Timber framing (medieval): dark beams on the facade.
  if (S.timber) {
    for (const v of vols) {
      const y0 = BASE + v.f * FH;
      for (let x = v.x0; x <= v.x1 + 0.01; x += (v.x1 - v.x0) / 4) b.box(K.accent, [x - 0.1, y0, v.z1 - 0.02], [x + 0.1, y0 + FH, v.z1 + 0.06]);
      b.box(K.accent, [v.x0, y0 + FH - 0.2, v.z1 - 0.02], [v.x1, y0 + FH, v.z1 + 0.06]);
      b.box(K.accent, [v.x0, y0, v.z1 - 0.02], [v.x1, y0 + 0.2, v.z1 + 0.06]);
    }
  }
  // Windows & doors: frames, glass, sills, shutters.
  const winOpts = style === 'modern' ? { frameW: 0.05, frameD: 0.07, mullions: undefined, frame: K.frame, glass: K.glass } : { frameW: 0.07, frameD: 0.1, frame: K.frame, glass: K.glass, sill: K.trim, transom: true };
  const doors = [];
  for (const op of openingsAll) {
    const o = { ...winOpts };
    if (style !== 'modern' && op.kind === 'window') o.mullions = Math.max(1, Math.round((op.u1 - op.u0) / 0.55) - 1);
    if (style === 'modern' && op.kind === 'window') o.mullions = Math.max(0, Math.round((op.u1 - op.u0) / 2.4) - 1);
    if (op.kind === 'door' && op.u1 - op.u0 < 1.5 && op.face === 'front' && op.floor === 0) doors.push(op);
    windowFrame(b, op, o);
    if (S.shutters && rng.chance(S.shutters) && op.kind === 'window' && !op.axis) {
      for (const sx of [op.x0 - 0.42, op.x1 + 0.02]) b.box(K.shutter, [sx, op.y0, op.z + op.side * (op.t / 2 + 0.03) - 0.02], [sx + 0.4, op.y1, op.z + op.side * (op.t / 2 + 0.03) + 0.02]);
    }
  }
  // Entrance canopy (modern) / porch (traditional).
  const frontZ = vols[0].z1;
  const doorX = vols[0].x0 + doorU;
  if (style === 'modern' && !(cantilever && doorX > cantilever.v.x0 && doorX < cantilever.v.x1)) {
    b.box({ default: K.wall, ny: K.ceil }, [doorX - 1.4, BASE + 2.55, frontZ], [doorX + 1.4, BASE + 2.75, frontZ + 1.6]);
  }
  let porchDepth = 0;
  if (!S.logs && rng.chance(S.porch || 0) || S.porch === 1 || S.logs && rng.chance(S.porch)) {
    porchDepth = rng.range(1.8, 2.6);
    const px0 = style === 'victorian' || style === 'farmhouse' || style === 'haunted' || S.logs ? vols[0].x0 : Math.max(vols[0].x0, doorX - rng.range(1.8, 3)), px1 = style === 'victorian' || style === 'farmhouse' || style === 'haunted' || S.logs ? vols[0].x1 : Math.min(vols[0].x1, doorX + rng.range(1.8, 3));
    const py = BASE + 0.25;
    b.box({ py: K.deck, default: K.base }, [px0, -0.5, frontZ], [px1, py, frontZ + porchDepth], { collide: true });
    const nPosts = Math.max(2, Math.round((px1 - px0) / 2.4) + 1);
    for (let i = 0; i < nPosts; i++) {
      const x = px0 + 0.15 + (px1 - px0 - 0.3) * (i / (nPosts - 1));
      b.box(K.trim, [x - 0.09, py, frontZ + porchDepth - 0.3], [x + 0.09, BASE + 2.6, frontZ + porchDepth - 0.12], { collide: true });
    }
    // Porch roof (shed).
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const yHi = BASE + 2.95, yLo = BASE + 2.55;
    b.quad(K.roof, V(px0 - 0.2, yLo, frontZ + porchDepth + 0.3), V(px1 + 0.2, yLo, frontZ + porchDepth + 0.3), V(px1 + 0.2, yHi, frontZ), V(px0 - 0.2, yHi, frontZ));
    b.quad(K.trim, V(px1 + 0.2, yLo - 0.12, frontZ + porchDepth + 0.3), V(px0 - 0.2, yLo - 0.12, frontZ + porchDepth + 0.3), V(px0 - 0.2, yHi - 0.12, frontZ), V(px1 + 0.2, yHi - 0.12, frontZ));
    b.box(K.trim, [px0 - 0.2, yLo - 0.14, frontZ + porchDepth + 0.25], [px1 + 0.2, yLo, frontZ + porchDepth + 0.32]);
    // Steps.
    for (let i = 0; i < 2; i++) b.box({ py: K.deck, default: K.base }, [doorX - 0.9, -0.3, frontZ + porchDepth + i * 0.3], [doorX + 0.9, py - 0.14 * (i + 1), frontZ + porchDepth + (i + 1) * 0.3], { collide: true });
    // Railing with a gap at the steps.
    railing(b, [[px0 + 0.1, frontZ + porchDepth - 0.2], [doorX - 1.0, frontZ + porchDepth - 0.2]], py, 1, K.trim, { height: 0.9 });
    railing(b, [[doorX + 1.0, frontZ + porchDepth - 0.2], [px1 - 0.1, frontZ + porchDepth - 0.2]], py, 1, K.trim, { height: 0.9 });
  }
  if (S.portico) {
    // Classical portico with columns and pediment.
    const pw = Math.min(W * 0.45, 9), px0 = doorX - pw / 2, px1 = doorX + pw / 2, pd = 3;
    b.box({ py: 'marbleFloor', default: K.base }, [px0 - 0.4, -0.5, frontZ], [px1 + 0.4, BASE + 0.3, frontZ + pd + 0.6], { collide: true });
    const n = 4 + 2 * rng.int(0, 1);
    const colH = FH * 2 - 0.3;
    for (let i = 0; i < n; i++) {
      const x = px0 + (pw) * (i / (n - 1));
      const g = new THREE.CylinderGeometry(0.28, 0.32, colH, 16);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1.9, uv.getY(k) * colH);
      b.geometry(K.accent, g, new THREE.Matrix4().makeTranslation(x, BASE + 0.3 + colH / 2, frontZ + pd));
      b.cylCollider(x, frontZ + pd, BASE, BASE + colH, 0.3);
    }
    b.box(K.accent, [px0 - 0.5, BASE + 0.3 + colH, frontZ], [px1 + 0.5, BASE + 0.3 + colH + 0.6, frontZ + pd + 0.4]);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const yb = BASE + 0.9 + colH;
    b.tri(K.accent, V(px0 - 0.5, yb, frontZ + pd + 0.4), V(px1 + 0.5, yb, frontZ + pd + 0.4), V(doorX, yb + 1.6, frontZ + pd + 0.4));
    b.quad(K.roof, V(px0 - 0.6, yb, frontZ + pd + 0.45), V(doorX, yb + 1.65, frontZ + pd + 0.45), V(doorX, yb + 1.65, frontZ), V(px0 - 0.6, yb, frontZ));
    b.quad(K.roof, V(doorX, yb + 1.65, frontZ + pd + 0.45), V(px1 + 0.6, yb, frontZ + pd + 0.45), V(px1 + 0.6, yb, frontZ), V(doorX, yb + 1.65, frontZ));
  }
  // Victorian turret.
  if (S.turret && rng.chance(S.turret)) {
    const tx = rng.chance(0.5) ? vols[0].x0 + 0.2 : vols[0].x1 - 0.2, tz = vols[0].z1 - 0.2, tr = 1.6;
    roundWall(b, tx, tz, BASE, floors * FH + 0.8, tr, K.wall, 20);
    coneRoof(b, tx, tz, BASE + floors * FH + 0.8, tr * 1.08, tr * 2.4, K.roof, 20);
    for (let f = 0; f < floors; f++) for (let k = 0; k < 3; k++) {
      const ang = Math.PI * 0.25 + k * 0.6 * (tx > 0 ? 1 : -1);
      const wx = tx + Math.sin(ang) * (tr + 0.01), wz = tz + Math.cos(ang) * (tr + 0.01);
      const g = new THREE.PlaneGeometry(0.8, 1.4);
      b.geometry(K.glass, g, new THREE.Matrix4().makeTranslation(wx, BASE + f * FH + 1.6, wz).multiply(new THREE.Matrix4().makeRotationY(ang)));
      b.geometry(K.frame, new THREE.BoxGeometry(0.95, 0.08, 0.1), new THREE.Matrix4().makeTranslation(wx, BASE + f * FH + 0.86, wz).multiply(new THREE.Matrix4().makeRotationY(ang)));
    }
  }
  // Garage (suburban).
  let garage = null;
  if (S.garage && rng.chance(S.garage) && floors <= 2) {
    const gw = 3.6, gd = 6.2, side = doorX < 0 ? 1 : -1;
    const gx0 = side > 0 ? vols[0].x1 : vols[0].x0 - gw, gx1 = gx0 + gw;
    const gz1 = vols[0].z1 + 0.4, gz0 = gz1 - gd;
    const gh = 2.8;
    wallSegmentsX(b, { x0: gx0, x1: gx1, z: gz1 - T / 2, y0: BASE, h: gh, t: T, side: 1, ext: K.wall, int: K.int, openings: [{ u0: 0.35, u1: gw - 0.35, v0: 0, v1: 2.3, kind: 'hole' }] });
    wallSegmentsX(b, { x0: gx0, x1: gx1, z: gz0 + T / 2, y0: BASE, h: gh, t: T, side: -1, ext: K.wall, int: K.int });
    wallSegmentsZ(b, { z0: gz0 + T, z1: gz1 - T, x: side > 0 ? gx1 - T / 2 : gx0 + T / 2, y0: BASE, h: gh, t: T, side, ext: K.wall, int: K.int });
    b.box('garageDoor', [gx0 + 0.35, BASE, gz1 - T / 2 - 0.05], [gx1 - 0.35, BASE + 2.3, gz1 - T / 2 + 0.05], { collide: true });
    b.box({ py: K.floor, default: K.base }, [gx0, -0.5, gz0], [gx1, BASE, gz1], { collide: true });
    const R = gableRoof(b, gx0, gz0, gx1, gz1, BASE + gh, THREE.MathUtils.degToRad(25), { roof: K.roof, gable: K.wall, fascia: K.trim }, { overhang: 0.35, alongZ: true });
    void R;
    garage = { x: (gx0 + gx1) / 2, z1: gz1, w: gw };
  }
  yield;

  // ---- Interior ----
  const seats = [];
  const lights = [];
  const furnMats = furnitureMaterials(rng.fork('furn'), { woodType: style === 'modern' ? 'lightWood' : 'wood' });
  if (gp.interiors && detail > 0.45) {
    ctx.stage('interior', 'Furnishing interior');
    const fr = rng.fork('interior');
    const v0 = vols[0];
    const ix0 = v0.x0 + T + 0.3, ix1 = v0.x1 - T - 0.3, iz0 = v0.z0 + T + 0.3, iz1 = v0.z1 - T - 0.3;
    const stairSide = stair ? (stair.x0 < 0 ? -1 : 1) : 0;
    // Living zone (front, away from stairs), dining & kitchen (back).
    const livX = stairSide <= 0 ? (ix0 + ix1) / 2 + (ix1 - ix0) * 0.18 : (ix0 + ix1) / 2 - (ix1 - ix0) * 0.18;
    const livZ = iz1 - 2.0;
    const put = (kind, x, z, yaw, opts = {}) => { const info = placePiece(b, kind, fr.fork(kind + x + z), x, BASE, z, yaw, opts); if (info.seats) seats.push(...info.seats); if (info.light) lights.push({ ...info.light }); if (info.fire) attachFireLater.push(info.fire); return info; };
    const attachFireLater = [];
    put('rug', livX, livZ - 0.2, 0);
    put('sofa', livX, livZ - 1.4, 0, { fabric: 'fabric' });
    put('table', livX, livZ - 0.2, 0, { kind: 'coffee', w: 1.1, d: 0.6 });
    put('lamp', livX + 1.9, livZ - 1.5, 0, { floor: true });
    if (fr.chance(0.6) && ix1 - ix0 > 7) put('tv', livX, Math.min(iz1 - 0.1, livZ + 1.4), Math.PI);
    const dinX = stairSide <= 0 ? ix1 - 1.8 : ix0 + 1.8;
    const dinZ = iz0 + 2.2;
    if (Math.abs(dinZ - livZ) > 2.8) {
      const t = put('table', dinX, dinZ, Math.PI / 2, { kind: 'dining', w: 1.6, d: 0.9 });
      for (const [dx, dz, yaw] of [[-0.75, -0.45, 0], [-0.75, 0.45, Math.PI], [0.75, -0.45, 0], [0.75, 0.45, Math.PI]]) put('chair', dinX + dz * 1.3, dinZ + dx * 0.9, yaw + Math.PI / 2, { wood: 'wood', fabric: fr.chance(0.5) ? 'fabric' : null });
      void t;
    }
    // Kitchen counter along the back wall.
    const kx0 = stairSide <= 0 ? Math.max(ix0 + 1.6, (ix0 + ix1) / 2 - 1) : ix0 + 0.2, kx1 = stairSide <= 0 ? ix1 - 0.1 : Math.min(ix1 - 1.6, (ix0 + ix1) / 2 + 1);
    if (kx1 - kx0 > 1.5 && !(stair && stairSide > 0 && kx1 > stair.x0 - 0.2 && stairSide < 0)) {
      b.box({ py: 'counterTop', default: 'cabinet' }, [kx0, BASE, v0.z0 + T], [kx1, BASE + 0.9, v0.z0 + T + 0.62], { collide: true });
      b.box('cabinet', [kx0, BASE + 1.45, v0.z0 + T], [kx1, BASE + 2.2, v0.z0 + T + 0.36]);
      put('fridge', kx1 + 0.45 < ix1 ? kx1 + 0.4 : kx0 - 0.4, v0.z0 + T + 0.36, 0);
    }
    put('plant', ix0 + 0.3, iz1 - 0.2, 0);
    if (style !== 'modern' && fr.chance(0.6)) {
      const fx = stairSide <= 0 ? ix1 - 0.05 : ix0 + 0.05;
      put('fireplace', fx, (iz0 + iz1) / 2, stairSide <= 0 ? -Math.PI / 2 : Math.PI / 2);
    } else put('bookshelf', stairSide <= 0 ? ix1 - 0.2 : ix0 + 0.2, (iz0 + iz1) / 2 + 0.5, stairSide <= 0 ? -Math.PI / 2 : Math.PI / 2);
    // Upper floor bedroom.
    if (floors > 1) {
      const v = vols[1];
      const y1 = BASE + FH;
      const bx0 = v.x0 + T + 0.3, bx1 = v.x1 - T - 0.3, bz0 = v.z0 + T + 0.2, bz1 = v.z1 - T - 0.3;
      const bedX = stairSide <= 0 ? (bx0 + bx1) / 2 + (bx1 - bx0) * 0.2 : (bx0 + bx1) / 2 - (bx1 - bx0) * 0.2;
      const put2 = (kind, x, z, yaw, opts = {}) => { const info = placePiece(b, kind, fr.fork(kind + x + z + 'u'), x, y1, z, yaw, opts); if (info.seats) seats.push(...info.seats); if (info.light) lights.push({ ...info.light }); return info; };
      put2('rug', bedX, bz0 + 2.2, 0);
      put2('bed', bedX, bz0 + 1.15, 0);
      put2('lamp', bedX + 1.3, bz0 + 0.4, 0, { floor: false });
      put2('wardrobe', stairSide <= 0 ? bx1 - 0.35 : bx0 + 0.35, bz1 - 1.2, stairSide <= 0 ? -Math.PI / 2 : Math.PI / 2);
      put2('plant', stairSide <= 0 ? bx1 - 0.2 : bx0 + 0.2, bz0 + 0.2, 0);
      if (bz1 - bz0 > 6) put2('chair', bedX - 1.8, bz1 - 0.8, Math.PI, { fabric: 'fabric' });
    }
    for (const f of attachFireLater) lights.push({ pos: [f[0], f[1] + 0.4, f[2]], color: '#ff9a4a', intensity: 3, distance: 7, flicker: true });
    for (let f = 0; f < floors; f++) {
      const v = vols[Math.min(f, vols.length - 1)];
      const cy = BASE + (f + 1) * FH - 0.35;
      lights.push({ pos: [(v.x0 + v.x1) / 2, cy, (v.z0 + v.z1) / 2], color: '#ffe0b8', intensity: 2.2, distance: 10 });
      b.box('ceilingLamp', [(v.x0 + v.x1) / 2 - 0.25, cy + 0.08, (v.z0 + v.z1) / 2 - 0.25], [(v.x0 + v.x1) / 2 + 0.25, cy + 0.14, (v.z0 + v.z1) / 2 + 0.25]);
    }
    yield;
  }

  // ---- Garden ----
  ctx.stage('garden', 'Landscaping');
  const root = new THREE.Group();
  const gardenGroup = new THREE.Group();
  const terrainOps = [];
  const paint = [];
  const colliderExtra = [];
  const hx0 = Math.min(...vols.map((v) => v.x0), garage ? garage.x - garage.w / 2 : Infinity), hx1 = Math.max(...vols.map((v) => v.x1), garage ? garage.x + garage.w / 2 : -Infinity);
  const hz0 = Math.min(...vols.map((v) => v.z0)), hz1 = Math.max(...vols.map((v) => v.z1), frontZ + porchDepth);
  let plot = { x0: hx0 - 1, x1: hx1 + 1, z0: hz0 - 1, z1: hz1 + 2.5 };
  if (wantGarden) {
    const gr = rng.fork('garden');
    const side = gr.range(3, 5), back = gr.range(3.5, 6), front = gr.range(7, 10) + (wantPool ? 2 : 0);
    plot = { x0: hx0 - side - (wantPool ? 2 : 0), x1: hx1 + side, z0: hz0 - back, z1: hz1 + front };
    const gateX = doorX;
    // Boundary: hedge (modern/cottage), picket fence (suburban/farmhouse/victorian), stone wall (medieval/mansion).
    const boundary = style === 'suburban' || style === 'farmhouse' || style === 'victorian' ? 'picket' : style === 'mansion' || style === 'medieval' || style === 'haunted' ? 'wall' : 'hedge';
    const gap = 2.4;
    const segs = [
      [[plot.x0, plot.z1], [gateX - gap / 2, plot.z1]], [[gateX + gap / 2, plot.z1], [plot.x1, plot.z1]],
      [[plot.x1, plot.z1], [plot.x1, plot.z0]], [[plot.x1, plot.z0], [plot.x0, plot.z0]], [[plot.x0, plot.z0], [plot.x0, plot.z1]],
    ];
    if (boundary === 'hedge') {
      const hm = hedgeMaterial();
      for (const [p0, p1] of segs) {
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (len < 0.8) continue;
        const hh = gr.range(1.0, 1.5), hw = 0.8;
        const along = Math.abs(p1[0] - p0[0]) > Math.abs(p1[1] - p0[1]);
        const g = hedgeGeometry(along ? len : hw, hh, along ? hw : len, gr.int(1, 999));
        const m = new THREE.Mesh(g, hm);
        m.position.set((p0[0] + p1[0]) / 2, 0, (p0[1] + p1[1]) / 2);
        m.castShadow = m.receiveShadow = true;
        gardenGroup.add(m);
        colliderExtra.push({ type: 'box', x: m.position.x, z: m.position.z, y0: 0, y1: hh, hx: (along ? len : hw) / 2, hz: (along ? hw : len) / 2 });
      }
    } else {
      for (const [p0, p1] of segs) fence(b, [p0, p1], boundary, boundary === 'wall' ? 'fenceStone' : 'fenceWood');
    }
    // Path from the gate to the door (or porch steps).
    const doorFront = frontZ + (porchDepth ? porchDepth + 0.6 : 0.3);
    if (style === 'modern' || style === 'cottage') paint.push(steppingPath(gardenGroup, gr, [gateX, plot.z1 + 0.2], [doorX, doorFront]));
    else paint.push({ type: 'paint', shape: 'path', points: [[gateX, plot.z1 + 0.5], [doorX, doorFront]], radius: 0.8, channel: 0, value: 255, falloff: 0.4, x: 0, z: 0, alsoSuppressGrass: true });
    // Deck/terrace in front of the modern glass wall.
    let deck = null;
    if (style === 'modern') {
      const gw = openingsAll.filter((o) => o.face === 'front' && o.floor === 0 && (o.kind === 'window' || o.kind === 'door') && o.x1 - o.x0 > 0.8 && Math.abs(o.x0 + (o.x1 - o.x0) / 2 - doorX) > 0.9);
      if (gw.length) {
        const dx0 = Math.min(...gw.map((o) => o.x0)) - 0.3, dx1 = Math.max(...gw.map((o) => o.x1)) + 0.3;
        const dd = gr.range(3, 4.2);
        b.box({ py: K.deck, default: K.base }, [dx0, -0.4, frontZ + 0.12], [dx1, BASE, frontZ + dd], { collide: true });
        deck = { x0: dx0, x1: dx1, z1: frontZ + dd };
        const lx = (dx0 + dx1) / 2;
        const info1 = placePiece(b, 'chair', gr.fork('dc1'), lx - 0.9, BASE, frontZ + dd - 1.1, Math.PI - 0.3, { wood: 'deck', fabric: 'fabric' });
        const info2 = placePiece(b, 'chair', gr.fork('dc2'), lx + 0.9, BASE, frontZ + dd - 1.1, Math.PI + 0.3, { wood: 'deck', fabric: 'fabric' });
        placePiece(b, 'table', gr.fork('dt'), lx, BASE, frontZ + dd - 1.6, 0, { kind: 'coffee', w: 0.8, d: 0.6 });
        seats.push(...info1.seats, ...info2.seats);
      }
    }
    // Flower beds along the front wall (skipping the door/deck).
    const bedsZ = frontZ + (porchDepth || 0) + 0.2;
    const cuts = [[doorX - 1, doorX + 1]];
    if (deck) cuts.push([deck.x0, deck.x1]);
    for (const [s0, s1] of subtractIntervals(vols[0].x0, vols[0].x1, cuts)) flowerBed(gardenGroup, gr, [s0 + 0.2, bedsZ, s1 - 0.2, bedsZ + 0.8], 16 * detail + 4);
    // Corner beds & trees.
    const tspecies = style === 'modern' ? gr.pick(['cherry', 'birch', 'maple']) : gr.pick(['maple', 'oak', 'cherry', 'birch']);
    const spots = [[plot.x0 + 2.2, plot.z1 - 2.2], [plot.x1 - 2.2, plot.z1 - 2.5], [plot.x1 - 2, plot.z0 + 2], [plot.x0 + 2, plot.z0 + 2]];
    let nt = 0;
    for (const [x, z] of gr.shuffle(spots)) {
      if (nt >= (detail > 0.6 ? 3 : 2)) break;
      if (Math.abs(x - doorX) < 2.5 && z > frontZ) continue;
      if (x > hx0 - 1.5 && x < hx1 + 1.5 && z > hz0 - 1.5 && z < hz1 + 1) continue;
      colliderExtra.push(gardenTree(gardenGroup, gr.fork('t' + nt), x, z, tspecies, gr.range(0.45, 0.65)));
      nt++;
    }
    if (nt < 3) flowerBed(gardenGroup, gr, [plot.x1 - 3.2, plot.z1 - 3.2, plot.x1 - 1.2, plot.z1 - 1.2], 14 * detail + 4);
    // Pool.
    if (wantPool) {
      const pw = gr.range(6, 8.5), pd = gr.range(3, 4);
      const px = (plot.x0 + hx0) / 2 + 0.5, pz = frontZ + (plot.z1 - frontZ) / 2;
      const room = hx0 - plot.x0;
      const useSide = room > pd + 2.5;
      const cx = useSide ? plot.x0 + room / 2 : (deck ? (plot.x1 + deck.x1) / 2 : px);
      const cz = useSide ? (hz0 + hz1) / 2 : pz;
      const rotW = useSide ? pd : pw, rotD = useSide ? pw : pd;
      terrainOps.push(pool(gardenGroup, b, cx, cz, rotW, rotD, 1.4));
      b.box({ py: K.deck, default: K.base }, [cx - rotW / 2 - 1.3, -0.3, cz - rotD / 2 - 1.3], [cx - rotW / 2 - 0.5, 0.03, cz + rotD / 2 + 1.3], { collide: true });
    }
    // Garden lights along the path.
    const nl = detail > 0.6 ? 4 : 2;
    for (let i = 0; i < nl; i++) {
      const t = (i + 0.5) / nl;
      const z = plot.z1 - (plot.z1 - doorFront) * t;
      lights.push(bollard(gardenGroup, doorX + (i % 2 ? 0.9 : -0.9), z, 0.7));
    }
  }
  yield;

  // ---- Materials & meshes ----
  ctx.stage('textures', 'Baking materials');
  const M = G.materials;
  const mget = (spec, extra = {}) => M.get(spec[0], { ...spec[1], ...extra });
  const mats = {
    ...furnMats,
    wall: mget(P.wall), accent: mget(P.accent), frame: mget(P.frame), trim: mget(P.trim), roof: mget(P.roof), base: mget(P.base),
    interior: M.get('paint', { color: style === 'modern' ? '#f4f3f0' : style === 'cabin' ? '#c89a68' : rng.pick(['#f2eee6', '#e8e4da', '#dfe4e2', '#efe6d6']), envMapIntensity: 0.45 }),
    ceiling: M.get('paint', { color: '#f6f6f4', envMapIntensity: 0.4 }),
    floor: M.get(style === 'modern' ? 'floorWood' : rng.pick(['floorWood', 'planks', 'tiles']), { envMapIntensity: 0.55, seed: rng.int(0, 2) }),
    glass: M.get('glass', { color: style === 'modern' ? '#cfdde6' : '#dfeaf0', opacity: style === 'modern' ? 0.28 : 0.22 }),
    stairsMat: M.get('wood', {}), deck: M.get('deck', { seed: 1 }), shutter: P.shutter ? mget(P.shutter) : mget(P.frame),
    coping: M.get('concrete', { color: '#c8c6c0' }), poolTiles: M.get('poolTiles', {}), chimney: M.get('brick', { color: '#7a3a2a' }),
    garageDoor: M.get('painted', { color: '#e8e8e4' }), fenceWood: M.get('paint', { color: '#f4f4f0' }), fenceStone: M.get('fieldstone', {}),
    marbleFloor: M.get('marble', {}), counterTop: M.get(rng.pick(['granite', 'marble']), {}), cabinet: M.get(style === 'modern' ? 'glossyPlastic' : 'wood', { color: style === 'modern' ? rng.pick(['#f2f2f0', '#2a2c30', '#6a7a6a']) : undefined }),
    ceilingLamp: M.get('emissive', { color: '#fff0d8', emissiveIntensity: 1.5 }), smoke: M.plain('#888888'),
  };
  if (S.logs) mats.wall = M.get('logs', { world: 1.6 });
  yield;
  ctx.stage('optimize', 'Merging geometry');
  const meshes = b.build(mats);
  root.add(meshes);
  root.add(gardenGroup);
  // Automatic front doors.
  const doorObjs = [];
  for (const d of doors) {
    const pivot = new THREE.Group();
    const dw = d.x1 - d.x0 - 0.12, dh = d.y1 - d.y0 - 0.06;
    pivot.position.set(d.x0 + 0.06, d.y0, d.z + d.side * 0.02);
    const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.06), style === 'modern' ? M.get('painted', { color: rng.pick(['#1f2124', '#6a4a2a', '#2a3a4a', '#b0402a']) }) : M.get('darkWood', {}));
    slabMesh.geometry.translate(dw / 2, dh / 2, 0);
    slabMesh.castShadow = true; slabMesh.receiveShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.get('gold'));
    knob.position.set(dw - 0.1, 1.05, 0.05);
    pivot.add(slabMesh, knob);
    root.add(pivot);
    doorObjs.push({ pivot, open: 0, x: d.x0 + (d.x1 - d.x0) / 2, z: d.z, y: d.y0, colliderIndex: b.colliders.length });
    b.colliders.push({ type: 'box', x: d.x0 + (d.x1 - d.x0) / 2, z: d.z, y0: d.y0, y1: d.y1, hx: (d.x1 - d.x0) / 2, hz: 0.06, door: true });
  }
  // Centre the plot on the entity origin.
  const cx = (plot.x0 + plot.x1) / 2, cz = (plot.z0 + plot.z1) / 2;
  for (const c of root.children) c.position.x -= cx, c.position.z -= cz;
  const shift = (c) => ({ ...c, x: c.x - cx, z: c.z - cz });
  const colliderDefs = [...b.colliders, ...colliderExtra].map(shift);
  const lightsOut = lights.map((L) => ({ ...L, pos: [L.pos[0] - cx, L.pos[1], L.pos[2] - cz] }));
  const seatsOut = seats.map((s) => ({ ...s, x: s.x - cx, z: s.z - cz }));
  const paintOut = paint.map((p) => ({ ...p, points: p.points ? p.points.map(([x, z]) => [x - cx, z - cz]) : undefined, x: (p.x || 0) - cx, z: (p.z || 0) - cz }));
  const tOps = terrainOps.map((t) => ({ ...t, x: t.x - cx, z: t.z - cz }));
  for (const d of doorObjs) { d.x -= cx; d.z -= cz; }
  const hw = (plot.x1 - plot.x0) / 2, hd = (plot.z1 - plot.z0) / 2;
  const houseRect = { hw: (hx1 - hx0) / 2 + 0.5, hd: (hz1 - hz0) / 2 + 0.5, cx: (hx0 + hx1) / 2 - cx, cz: (hz0 + hz1) / 2 - cz };
  const label = { modern: 'Modern house', suburban: 'House', cottage: 'Cottage', cabin: 'Log cabin', victorian: 'Victorian house', mansion: 'Mansion', farmhouse: 'Farmhouse', medieval: 'Medieval house', haunted: 'Haunted house' }[style] || 'House';
  const data = {
    root, name: (floors > 1 ? `${floors}-story ` : '') + label.toLowerCase(), category: 'building', icon: item.icon,
    height: roofTop, footprint: { radius: Math.hypot(hw, hd), rect: { hw, hd } }, colliderDefs, lights: lightsOut, flattenTerrain: true, flattenFalloff: 7,
    paintGround: [...paintOut, { type: 'paint', shape: 'rect', x: houseRect.cx, z: houseRect.cz, hw: houseRect.hw, hd: houseRect.hd, yaw: 0, radius: Math.hypot(houseRect.hw, houseRect.hd), channel: 3, value: 255, falloff: 0.5 }],
    terrainOps: tOps, suppressGrass: false, interiorFloorY: BASE,
  };
  data.name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
  if (seatsOut.length) { data.seats = seatsOut; data.seatWorld = seatWorldFn(data); }
  if (doorObjs.length) {
    data.update = (dt) => {
      const P = G.player.position;
      const ent = root.userData.entity;
      const world = ent && G.worlds.get(ent.worldId);
      for (const d of doorObjs) {
        const wp = new THREE.Vector3(d.x, 0, d.z).applyMatrix4(root.matrixWorld);
        let near = Math.hypot(P.x - wp.x, P.z - wp.z) < 2.2 && Math.abs(P.y - (root.position.y + d.y)) < 2.5;
        if (!near && world) for (const e of world.entities) if (e.body && Math.hypot(e.body.x - wp.x, e.body.z - wp.z) < 2) { near = true; break; }
        d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
        d.pivot.rotation.y = -d.open * 1.75;
        const col = ent && ent.colliders[d.colliderIndex];
        if (col) col.disabled = d.open > 0.35;
        if (near && d.open < 0.05 && G.audio) G.audio.play('door', wp);
      }
    };
  }
  return data;
}

function roofSmoke(b, x, y, z) { b.smoke = b.smoke || []; b.smoke.push([x, y, z]); }

// ---------------- Generator entry ----------------
export const buildingGen = {
  maxCount: 6,
  estimate(item) {
    const st = resolveStyle(item);
    return { skyscraper: 5, castle: 10, mansion: 7, modern: 5, church: 6 }[st] || 4.5;
  },
  stages: () => [
    { name: 'plan', label: 'Designing floor plan', weight: 0.6 },
    { name: 'geometry', label: 'Raising walls', weight: 2 },
    { name: 'details', label: 'Adding roof & details', weight: 1.5 },
    { name: 'interior', label: 'Furnishing interior', weight: 1.2 },
    { name: 'garden', label: 'Landscaping', weight: 1 },
    { name: 'textures', label: 'Baking materials', weight: 1.2 },
    { name: 'optimize', label: 'Merging geometry', weight: 0.6 },
  ],
  *build(ctx, item, rng, env) {
    const style = resolveStyle(item);
    if (HOUSE_STYLES[style]) return yield* buildHouse(ctx, item, rng, style);
    return yield* buildSpecial(ctx, item, rng, style, env);
  },
};

export { HOUSE_STYLES, buildHouse };

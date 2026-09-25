// ---------------------------------------------------------------------------
// Special building types that are not "houses": skyscrapers, castles,
// towers, lighthouses, windmills, churches, temples, pagodas, pyramids,
// barns, shops, futuristic & alien structures, igloos, tents, huts,
// treehouses, ruins, gazebos and greenhouses.
//
// Every builder works in a local frame centred on the plot with the main
// entrance facing +Z, accumulates geometry per material in a MeshBuilder
// (few draw calls) and emits walkable/solid colliders along the way.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { MeshBuilder, wallSegmentsX, wallSegmentsZ, windowFrame, slab, stairs, railing, gableRoof, hipRoof, flatRoof, coneRoof, roundWall } from './buildkit.js';
import { placePiece, furnitureMaterials, seatWorldFn, sitNearest, attachFire } from './furniture.js';
import { gardenTree, flowerBed, bollard } from './garden.js';
import { buildTree, treeMaterials, buildRock } from '../../world/trees.js';
import { markNoAO } from '../../render/renderer.js';
import { obox, ocyl, beam, animate, labelTexture, makeFlag, glowSprite, hsl } from './common.js';
import { buildHouse } from './buildings.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Shared builder state.
export function makeState(ctx, item, rng) {
  return {
    ctx, item, rng, a: item.attrs || {}, b: new MeshBuilder(), root: new THREE.Group(), lights: [], seats: [], extraColliders: [],
    detail: ctx.detail ?? genPreset().detail, M: G.materials, updates: [],
  };
}

function userColor(a) { return a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined; }

// Assemble the standard generator result.
export function finish(S, mats, o) {
  S.ctx.stage('optimize', 'Merging geometry');
  const group = S.b.build(mats, { castShadow: true });
  S.root.add(group);
  const hw = o.hw, hd = o.hd;
  const data = {
    root: S.root, name: o.name, category: 'building', icon: S.item.icon, height: o.height,
    footprint: { radius: Math.hypot(hw, hd), rect: { hw, hd } },
    colliderDefs: [...S.b.colliders, ...S.extraColliders], lights: S.lights,
    flattenTerrain: o.flatten !== false, flattenFalloff: o.falloff ?? 6, suppressGrass: o.suppressGrass,
    paintGround: o.paint || [], terrainOps: o.terrainOps || [], interiorFloorY: o.floorY ?? 0,
  };
  if (S.seats.length) {
    data.seats = S.seats; data.seatWorld = seatWorldFn(data);
    data.interact = { label: () => 'Sit down', action: (e, player) => sitNearest(data, player) };
  }
  if (S.updates.length) data.update = (dt, t, dist) => { for (const u of S.updates) u(dt, t, dist); };
  if (o.lod) data.lod = o.lod;
  return data;
}

export function addLight(S, pos, color = '#ffd9a0', intensity = 2, distance = 8, nightOnly = true, flicker = false) {
  S.lights.push({ pos, color, intensity, distance, nightOnly, flicker });
}

// Crenellated parapet along a straight segment.
export function merlons(b, key, ax, az, bx, bz, y, h = 0.9, t = 0.6, w = 0.7, gap = 0.6) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(len / (w + gap)));
  const yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    obox(b, key, ax + (bx - ax) * f, y + h / 2, az + (bz - az) * f, step - gap, h, t, yaw);
  }
}

// Ring of merlons around a round tower.
export function roundMerlons(b, key, cx, cz, r, y, h = 0.8, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    obox(b, key, cx + Math.sin(a) * (r - 0.3), y + h / 2, cz + Math.cos(a) * (r - 0.3), (TAU * r / n) * 0.55, h, 0.6, a);
  }
}

// Dark window inset on a round wall (slit/arched window look).
function roundWindow(b, cx, cz, r, y, angle, w = 0.5, h = 1.2, key = 'windowDark', frameKey = null) {
  obox(b, key, cx + Math.sin(angle) * (r + 0.01), y, cz + Math.cos(angle) * (r + 0.01), w, h, 0.12, angle);
  if (frameKey) obox(b, frameKey, cx + Math.sin(angle) * (r + 0.05), y - h / 2 - 0.05, cz + Math.cos(angle) * (r + 0.05), w + 0.15, 0.1, 0.2, angle);
}

function spiralStairs(b, key, cx, cz, r0, r1, y0, y1, turns, startAngle = 0) {
  const n = Math.max(8, Math.round((y1 - y0) / 0.2));
  const dh = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i / n) * turns * TAU;
    const rm = (r0 + r1) / 2;
    const x = cx + Math.sin(a) * rm, z = cz + Math.cos(a) * rm;
    const w = (r1 - r0), d = Math.max(0.35, (turns * TAU * rm) / n + 0.05);
    const y = y0 + (i + 1) * dh;
    obox(b, key, x, y - 0.06, z, w, 0.12, d, a + Math.PI / 2);
    b.colliders.push({ type: 'box', x, z, y0: y - 0.12, y1: y, hx: w / 2, hz: d / 2, yaw: a + Math.PI / 2 });
  }
}

// ======================================================================
// Skyscraper
// ======================================================================
function* skyscraper(S) {
  const { a, rng, b, M } = S;
  const floors = clamp(a.floors || S.item.params.floors || rng.int(24, 45), 4, 90);
  const floorH = 3.7;
  const variant = a.style === 'futuristic' ? 'twist' : a.style === 'art deco' || a.style === 'classic' || a.style === 'old' ? 'deco' : rng.weighted([['glass', 4], ['deco', 1.6], ['setback', 2]]);
  const w = rng.range(18, 26), d = rng.range(16, 24);
  const glassCol = userColor(a) || rng.pick(['#5a7890', '#3e5a70', '#6a8aa0', '#34484e', '#7a8a7a', '#8a7a5a']);
  S.ctx.stage('geometry', 'Raising tower');
  const mats = {
    facade: M.get('facade', { color: glassCol, color2: variant === 'deco' ? '#b8b0a0' : '#2a2c30', p: [variant === 'deco' ? 3 : 4, 2, variant === 'deco' ? 0.12 : 0.04, rng.range(0.25, 0.5)], seed: rng.int(0, 3), world: variant === 'deco' ? 7.4 : floorH * 2 }),
    stone: M.get(variant === 'deco' ? 'stone' : 'concrete', { color: variant === 'deco' ? '#c8bca8' : '#a8a8a8' }),
    metal: M.get('steel'), glass: M.get('glass', { color: '#cfdde6', opacity: 0.3 }), lobbyFloor: M.get('marble'), roof: M.get('gravel', { color: '#7a7874' }),
    red: M.get('emissive', { color: '#ff2020', emissiveIntensity: 4 }), dark: M.plain('#1a1c20', 0.6, 0.4), trim: M.get('metal', { color: '#9aa0a8' }),
  };
  const lobbyH = 6;
  // Lobby: glass box with a stone frame and revolving-door gap.
  slab(b, -w / 2, -d / 2, w / 2, d / 2, 0, 0.3, { py: 'lobbyFloor', default: 'stone' });
  const inset = 1.2;
  const lx0 = -w / 2 + inset, lx1 = w / 2 - inset, lz0 = -d / 2 + inset, lz1 = d / 2 - inset;
  const doorW = 3.2;
  for (const [x0, x1] of [[lx0, -doorW / 2], [doorW / 2, lx1]]) {
    obox(b, 'glass', (x0 + x1) / 2, 0.3 + (lobbyH - 0.3) / 2, lz1, x1 - x0, lobbyH - 0.3, 0.04);
    b.collider([x0, 0.3, lz1 - 0.1], [x1, lobbyH, lz1 + 0.1]);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2))) obox(b, 'metal', x, lobbyH / 2, lz1, 0.1, lobbyH, 0.14);
  }
  obox(b, 'glass', 0, (lobbyH + 3.2) / 2, lz1, doorW, lobbyH - 3.2, 0.04);
  for (const [x, z, sx, sz] of [[0, lz0, lx1 - lx0, 0.04], [lx0, 0, 0.04, lz1 - lz0], [lx1, 0, 0.04, lz1 - lz0]]) {
    obox(b, 'glass', x, lobbyH / 2 + 0.15, z, sx, lobbyH - 0.3, sz);
    b.collider([x - sx / 2 - 0.05, 0.3, z - sz / 2 - 0.05], [x + sx / 2 + 0.05, lobbyH, z + sz / 2 + 0.05]);
  }
  // Corner columns & canopy.
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.box('stone', [x - (x < 0 ? 0 : 1.2), 0, z - (z < 0 ? 0 : 1.2)], [x + (x < 0 ? 1.2 : 0), lobbyH, z + (z < 0 ? 1.2 : 0)], { collide: true });
  b.box('trim', [-5, lobbyH - 0.6, lz1], [5, lobbyH - 0.3, lz1 + 3.5]);
  // Reception desk + benches inside the lobby.
  b.box({ py: 'lobbyFloor', default: 'dark' }, [-2.5, 0.3, lz0 + 3], [2.5, 1.4, lz0 + 3.8], { collide: true });
  addLight(S, [0, lobbyH - 0.5, 0], '#fff2dc', 2.4, 14, false);
  addLight(S, [0, lobbyH - 0.8, lz1 + 2.5], '#fff2dc', 1.6, 8, true);
  // Tiers.
  let y = lobbyH;
  let tw = w, td = d;
  const tiers = variant === 'setback' || variant === 'deco' ? rng.int(2, 4) : 1;
  let remaining = floors - 2;
  for (let t = 0; t < tiers; t++) {
    const nf = t === tiers - 1 ? remaining : Math.max(3, Math.round(remaining * rng.range(0.45, 0.65)));
    remaining -= nf;
    const h = nf * floorH;
    if (variant === 'twist') {
      // Rotated floor plates around a core: each floor box turned a little more.
      const twist = rng.range(0.8, 1.6) / nf;
      for (let f = 0; f < nf; f++) {
        const yy = y + f * floorH;
        obox(b, 'facade', 0, yy + floorH / 2, 0, tw, floorH - 0.02, td, f * twist);
        obox(b, 'trim', 0, yy + 0.08, 0, tw + 0.35, 0.16, td + 0.35, f * twist);
        if ((f & 7) === 0) yield;
      }
      b.collider([-tw * 0.4, y, -td * 0.4], [tw * 0.4, y + h, td * 0.4]);
    } else {
      b.box({ default: 'facade', py: 'roof', ny: 'stone' }, [-tw / 2, y, -td / 2], [tw / 2, y + h, td / 2], { collide: true });
      // Vertical fins / pilasters give depth to the curtain wall.
      const fins = variant === 'deco' ? Math.round(tw / 3) : Math.round(tw / 4.5);
      for (let i = 0; i <= fins; i++) {
        const x = -tw / 2 + (tw * i) / fins;
        b.box(variant === 'deco' ? 'stone' : 'trim', [x - 0.18, y, td / 2], [x + 0.18, y + h, td / 2 + (variant === 'deco' ? 0.5 : 0.3)]);
        b.box(variant === 'deco' ? 'stone' : 'trim', [x - 0.18, y, -td / 2 - (variant === 'deco' ? 0.5 : 0.3)], [x + 0.18, y + h, -td / 2]);
      }
      const finsZ = Math.round(td / 4.5);
      for (let i = 0; i <= finsZ; i++) {
        const z = -td / 2 + (td * i) / finsZ;
        b.box(variant === 'deco' ? 'stone' : 'trim', [tw / 2, y, z - 0.18], [tw / 2 + 0.3, y + h, z + 0.18]);
        b.box(variant === 'deco' ? 'stone' : 'trim', [-tw / 2 - 0.3, y, z - 0.18], [-tw / 2, y + h, z + 0.18]);
      }
      // Cornice.
      b.box('stone', [-tw / 2 - 0.5, y + h, -td / 2 - 0.5], [tw / 2 + 0.5, y + h + 0.6, td / 2 + 0.5], { collide: true });
      flatRoof(b, -tw / 2, -td / 2, tw / 2, td / 2, y + h + 0.6, { roof: 'roof', wall: 'stone' }, { parapet: 1.1 });
    }
    y += h + (variant === 'twist' ? 0 : 0.85);
    tw *= rng.range(0.66, 0.8); td *= rng.range(0.66, 0.8);
    yield;
  }
  S.ctx.stage('details', 'Rooftop details');
  // Rooftop: mechanical boxes, crown and antenna with blinking aviation light.
  if (variant !== 'twist') {
    for (let i = 0; i < 3; i++) b.box('stone', [rng.range(-tw / 2, tw / 4), y, rng.range(-td / 2, td / 4)], [rng.range(tw / 4, tw / 2), y + rng.range(1.5, 3.5), rng.range(td / 4, td / 2)].map((v, k) => (k === 1 ? v : v)), { collide: true });
  }
  if (variant === 'deco') {
    // Stepped crown with a spire.
    let cw = tw, cy = y;
    for (let k = 0; k < 4; k++) { b.box('stone', [-cw / 2, cy, -cw / 2], [cw / 2, cy + 3, cw / 2]); cy += 3; cw *= 0.72; }
    coneRoof(b, 0, 0, cy, cw / 2, 14, 'trim', 8);
    y = cy + 14;
  }
  const antH = rng.range(8, 20);
  ocyl(b, 'metal', 0, y, 0, 0.25, antH, 8, 0.08);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mats.red);
  beacon.position.set(0, y + antH, 0);
  const glow = glowSprite('#ff3030', 4, 0.9);
  glow.position.copy(beacon.position);
  S.root.add(beacon, glow);
  S.updates.push((dt, t) => { const on = Math.sin(t * 3) > 0.3; beacon.visible = on; glow.visible = on; });
  const top = y + antH;
  yield;
  const pad = 4;
  return finish(S, mats, {
    name: `${floors}-story skyscraper`, height: top, hw: w / 2 + pad, hd: d / 2 + pad, falloff: 8,
    paint: [{ type: 'paint', shape: 'rect', x: 0, z: 0, hw: w / 2 + pad, hd: d / 2 + pad, yaw: 0, radius: Math.hypot(w, d) / 2 + pad, channel: 0, value: 255, falloff: 1 }],
  });
}

// ======================================================================
// Castle
// ======================================================================
function* castle(S) {
  const { a, rng, b, M } = S;
  const size = rng.range(30, 40) * clamp(a.sizeMul || 1, 0.6, 2);
  const half = size / 2;
  const wallH = rng.range(8, 10), wallT = 2.4;
  const towerR = rng.range(3.2, 4.2), towerH = wallH + rng.range(4, 7);
  const stoneType = a.materials.find((m) => ['stone', 'marble', 'granite', 'brick', 'ice', 'gold', 'crystal'].includes(m));
  const fantasy = a.style === 'fantasy' || a.style === 'fairy tale' || a.words.includes('princess') || a.words.includes('disney') || a.words.includes('magical');
  const dark = a.style === 'spooky' || a.style === 'gothic' || a.words.includes('dark') || a.words.includes('vampire');
  const roofCol = userColor(a) && a.colors.find((c) => c.part === 'roof')?.color || (fantasy ? rng.pick(['#3a5ab8', '#b83a5a', '#5a3ab8']) : dark ? '#2a2a34' : rng.pick(['#5a3a2a', '#3a4a6a', '#7a2a2a']));
  S.ctx.stage('geometry', 'Raising curtain walls');
  const mats = {
    stone: stoneType ? M.get(stoneType === 'stone' ? 'castleStone' : stoneType, { color: userColor(a) }) : M.get('castleStone', { color: fantasy ? '#e8e0d4' : dark ? '#4a4850' : userColor(a) }),
    walk: M.get('cobble'), roof: M.get('slate', { color: roofCol }), wood: M.get('darkWood'), iron: M.get('iron'),
    windowDark: M.plain('#0e0c0a', 0.9), gold: M.get('gold'), floor: M.get('planks'), carpet: M.get('carpet', { color: '#7a1a1a' }), glow: M.get('emissive', { color: '#ffb060', emissiveIntensity: 2.5 }),
  };
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  // Curtain walls with a walkway on top and merlons on the outside edge.
  const gateW = 4.4, gateH = 5.5;
  const segs = [
    [[-half, half], [half, half], 'front'], [[half, -half], [-half, -half], 'back'], [[-half, -half], [-half, half], 'left'], [[half, half], [half, -half], 'right'],
  ];
  for (const [[ax, az], [bx, bz], face] of segs) {
    const alongX = Math.abs(bz - az) < 1e-3;
    if (alongX) {
      const z = az;
      const x0 = Math.min(ax, bx) + towerR * 0.7, x1 = Math.max(ax, bx) - towerR * 0.7;
      const openings = face === 'front' ? [{ u0: (x1 - x0) / 2 - gateW / 2, u1: (x1 - x0) / 2 + gateW / 2, v0: 0, v1: gateH, kind: 'hole' }] : [];
      wallSegmentsX(b, { x0, x1, z, y0: 0, h: wallH, t: wallT, ext: 'stone', int: 'stone', side: z > 0 ? 1 : -1, openings });
      b.box('walk', [x0, wallH, z - wallT / 2], [x1, wallH + 0.05, z + wallT / 2]);
      const zo = z + (z > 0 ? 1 : -1) * (wallT / 2 - 0.3);
      merlons(b, 'stone', x0, zo, x1, zo, wallH, 1.0, 0.6);
      b.collider([x0, wallH, zo - 0.3], [x1, wallH + 1, zo + 0.3], { walkable: false });
    } else {
      const x = ax;
      const z0 = Math.min(az, bz) + towerR * 0.7, z1 = Math.max(az, bz) - towerR * 0.7;
      wallSegmentsZ(b, { z0, z1, x, y0: 0, h: wallH, t: wallT, ext: 'stone', int: 'stone', side: x > 0 ? 1 : -1 });
      b.box('walk', [x - wallT / 2, wallH, z0], [x + wallT / 2, wallH + 0.05, z1]);
      const xo = x + (x > 0 ? 1 : -1) * (wallT / 2 - 0.3);
      merlons(b, 'stone', xo, z0, xo, z1, wallH, 1.0, 0.6);
      b.collider([xo - 0.3, wallH, z0], [xo + 0.3, wallH + 1, z1], { walkable: false });
    }
    yield;
  }
  // Gatehouse: arch, raised portcullis, flanking half-towers.
  b.box('stone', [-gateW / 2 - 2, gateH, half - wallT / 2 - 0.4], [gateW / 2 + 2, wallH + 2.5, half + wallT / 2 + 0.4], { collide: true });
  merlons(b, 'stone', -gateW / 2 - 2, half + wallT / 2 + 0.1, gateW / 2 + 2, half + wallT / 2 + 0.1, wallH + 2.5, 1, 0.6);
  for (let i = 0; i < 7; i++) b.box('iron', [-gateW / 2 + 0.3 + i * (gateW - 0.6) / 6 - 0.05, gateH - 1.1, half + 0.2], [-gateW / 2 + 0.3 + i * (gateW - 0.6) / 6 + 0.05, gateH, half + 0.3]);
  b.box('iron', [-gateW / 2, gateH - 0.9, half + 0.18], [gateW / 2, gateH - 0.8, half + 0.32]);
  // Corner towers.
  S.ctx.stage('details', 'Building towers');
  for (const [cx, cz] of corners) {
    roundWall(b, cx, cz, 0, towerH, towerR, 'stone', 24);
    b.box('walk', [cx - towerR * 0.8, towerH, cz - towerR * 0.8], [cx + towerR * 0.8, towerH + 0.05, cz + towerR * 0.8]);
    const conical = fantasy || rng.chance(0.55);
    if (conical) {
      ocyl(b, 'stone', cx, towerH, cz, towerR + 0.35, 1.2, 24);
      coneRoof(b, cx, cz, towerH + 1.2, towerR + 0.4, towerR * (fantasy ? 3.6 : 2.4), 'roof', 24);
      makeFlag(S.root, cx, towerH + 1.2 + towerR * (fantasy ? 3.6 : 2.4) - 0.2, cz, fantasy ? '#f0d040' : rng.pick(['#a01818', '#1a3a8a', '#e8e8e8']), 1.4, 0.9, 2.2);
    } else {
      ocyl(b, 'stone', cx, towerH, cz, towerR + 0.35, 0.5, 24);
      roundMerlons(b, 'stone', cx, cz, towerR + 0.35, towerH + 0.5, 1.0, 12);
    }
    for (let k = 0; k < 3; k++) {
      const ang = Math.atan2(cx, cz) + (k - 1) * 0.7;
      roundWindow(b, cx, cz, towerR, towerH * (0.45 + k * 0.12), ang, 0.35, 1.3);
    }
    yield;
  }
  // Keep.
  const kw = size * rng.range(0.34, 0.42), kd = size * rng.range(0.3, 0.38);
  const kz = -half * 0.25, kh = wallH * rng.range(1.9, 2.4);
  const k0 = [-kw / 2, kz - kd / 2], k1 = [kw / 2, kz + kd / 2];
  const doorOp = [{ u0: kw / 2 - 1.2, u1: kw / 2 + 1.2, v0: 0, v1: 3.4, kind: 'door' }];
  const floorsK = 3;
  const fh = kh / floorsK;
  for (let f = 0; f < floorsK; f++) {
    const y0 = f * fh;
    const wins = [];
    for (let i = 1; i < 4; i++) wins.push({ u0: (kw * i) / 4 - 0.45, u1: (kw * i) / 4 + 0.45, v0: fh * 0.35, v1: fh * 0.35 + 1.8, kind: 'hole' });
    wallSegmentsX(b, { x0: k0[0], x1: k1[0], z: k1[1], y0, h: fh, t: 1.2, ext: 'stone', int: 'stone', side: 1, openings: f === 0 ? doorOp : wins });
    wallSegmentsX(b, { x0: k0[0], x1: k1[0], z: k0[1], y0, h: fh, t: 1.2, ext: 'stone', int: 'stone', side: -1, openings: f === 0 ? [] : wins });
    wallSegmentsZ(b, { z0: k0[1] + 0.6, z1: k1[1] - 0.6, x: k0[0], y0, h: fh, t: 1.2, ext: 'stone', side: -1, openings: f === 0 ? [] : [{ u0: kd / 2 - 1.2, u1: kd / 2 - 0.4, v0: fh * 0.35, v1: fh * 0.35 + 1.8, kind: 'hole' }] });
    wallSegmentsZ(b, { z0: k0[1] + 0.6, z1: k1[1] - 0.6, x: k1[0], y0, h: fh, t: 1.2, ext: 'stone', side: 1, openings: f === 0 ? [] : [{ u0: kd / 2 - 1.2, u1: kd / 2 - 0.4, v0: fh * 0.35, v1: fh * 0.35 + 1.8, kind: 'hole' }] });
    if (f > 0) slab(b, k0[0] + 0.6, k0[1] + 0.6, k1[0] - 0.6, k1[1] - 0.6, y0 - 0.3, 0.3, { py: 'floor', default: 'stone' }, [[k1[0] - 3.4, k0[1] + 0.6, k1[0] - 0.6, k0[1] + 0.6 + 4.2]]);
    else slab(b, k0[0] + 0.6, k0[1] + 0.6, k1[0] - 0.6, k1[1] - 0.6, 0, 0.1, { py: 'floor', default: 'stone' });
    if (f < floorsK - 1) stairs(b, k1[0] - 3.2, k1[0] - 0.8, k0[1] + 0.6, y0, fh, 4.0, { default: 'wood' });
    addLight(S, [0, y0 + fh - 0.8, kz], '#ffb870', 2.2, 10, false, true);
  }
  // Throne room details on the ground floor.
  b.box('carpet', [-1, 0.1, kz - kd / 2 + 1.5], [1, 0.12, kz + kd / 2 - 0.6]);
  const tr = placePiece(b, 'chair', rng, 0, 0.1, kz - kd / 2 + 1.4, 0, {});
  S.seats.push(...tr.seats);
  flatRoof(b, k0[0], k0[1], k1[0], k1[1], kh, { roof: 'walk', wall: 'stone' }, { parapet: 0 });
  for (const [ax, az, bx, bz] of [[k0[0], k1[1] - 0.3, k1[0], k1[1] - 0.3], [k0[0], k0[1] + 0.3, k1[0], k0[1] + 0.3], [k0[0] + 0.3, k0[1], k0[0] + 0.3, k1[1]], [k1[0] - 0.3, k0[1], k1[0] - 0.3, k1[1]]]) merlons(b, 'stone', ax, az, bx, bz, kh + 0.25, 1.1, 0.6);
  // Keep corner turrets.
  for (const [cx, cz] of [[k0[0], k0[1]], [k1[0], k0[1]], [k0[0], k1[1]], [k1[0], k1[1]]]) {
    ocyl(b, 'stone', cx, kh - 3, cz, 1.4, 5, 16);
    coneRoof(b, cx, cz, kh + 2, 1.6, fantasy ? 6 : 3.5, 'roof', 16);
  }
  makeFlag(S.root, 0, kh + 0.25, kz, fantasy ? '#e8c030' : '#a01818', 2.4, 1.5, 5);
  // Torches by the gate.
  for (const x of [-gateW / 2 - 0.8, gateW / 2 + 0.8]) {
    b.box('iron', [x - 0.05, 3, half + wallT / 2], [x + 0.05, 3.6, half + wallT / 2 + 0.3]);
    attachFire(S.root, [x, 3.6, half + wallT / 2 + 0.3], 0.5);
    addLight(S, [x, 4, half + wallT / 2 + 0.6], '#ffa050', 2.5, 9, false, true);
  }
  // Wall-walk access stairs inside the courtyard.
  stairs(b, -half + wallT / 2 + 0.2, -half + wallT / 2 + 2.2, -half * 0.35, 0, wallH, wallH * 1.4, { default: 'stone' }, { solid: true });
  yield;
  // Moat: a ring of water around the walls.
  const terrainOps = [];
  const moat = a.features.includes('moat') || a.features.includes('drawbridge') || rng.chance(0.3);
  if (moat) {
    for (const [x, z, hw, hd] of [[0, half + 5.5, half + 9, 2.5], [0, -half - 5.5, half + 9, 2.5], [half + 5.5, 0, 2.5, half + 3], [-half - 5.5, 0, 2.5, half + 3]]) {
      terrainOps.push({ type: 'flatten', shape: 'rect', x, z, hw, hd, yaw: 0, radius: Math.hypot(hw, hd), heightRel: -2.2, falloff: 1.5 });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2), M.get('water', { color: '#2a4a48', opacity: 0.86 }));
      water.rotation.x = -Math.PI / 2; water.position.set(x, -0.6, z);
      water.receiveShadow = true;
      S.root.add(water);
    }
    // Drawbridge.
    b.box('wood', [-gateW / 2, -0.05, half + wallT / 2], [gateW / 2, 0.15, half + 9], { collide: true });
    for (let i = 0; i < 16; i++) b.box('iron', [-gateW / 2, 0.15, half + wallT / 2 + i * 0.4 + 0.1], [gateW / 2, 0.18, half + wallT / 2 + i * 0.4 + 0.14]);
  }
  const pad = moat ? 9.5 : 3;
  return finish(S, mats, {
    name: (fantasy ? 'Fairy-tale castle' : dark ? 'Dark castle' : 'Castle'), height: kh + 8, hw: half + towerR + pad, hd: half + towerR + pad, falloff: 10, terrainOps,
    paint: [{ type: 'paint', shape: 'rect', x: 0, z: 0, hw: half - wallT, hd: half - wallT, yaw: 0, radius: half, channel: 1, value: 200, falloff: 2 }],
  });
}

// ======================================================================
// Towers: wizard tower, watchtower, lighthouse
// ======================================================================
function* tower(S, kind = 'tower') {
  const { a, rng, b, M } = S;
  const lighthouse = kind === 'lighthouse';
  const wizard = !lighthouse && (a.words.includes('wizard') || a.words.includes('mage') || a.style === 'fantasy' || a.words.includes('magic') || rng.chance(0.4));
  const r0 = lighthouse ? rng.range(3.4, 4) : rng.range(3.2, 4.2);
  const r1 = lighthouse ? r0 * 0.68 : r0 * rng.range(0.88, 1);
  const H = (a.dims && a.dims.height) || (lighthouse ? rng.range(20, 28) : rng.range(16, 26)) * clamp(a.sizeMul || 1, 0.5, 3);
  S.ctx.stage('geometry', lighthouse ? 'Raising lighthouse' : 'Raising tower');
  const stripeA = userColor(a) || (lighthouse ? '#c82a24' : null);
  const mats = {
    wall: lighthouse ? M.get('stucco', { color: '#f2f0ea' }) : M.get(wizard ? 'castleStone' : 'fieldstone', { color: wizard && userColor(a) ? userColor(a) : undefined }),
    stripe: M.get('stucco', { color: stripeA || '#c82a24' }), roof: M.get('slate', { color: wizard ? (a.colors.find((c) => c.part === 'roof')?.color || rng.pick(['#3a2a6a', '#2a3a7a', '#5a2a5a'])) : '#3a3c40' }),
    wood: M.get('darkWood'), windowDark: M.plain('#0e0c0a', 0.9), windowLit: M.get('emissive', { color: '#ffc070', emissiveIntensity: 2 }), iron: M.get('iron'),
    glass: M.get('glass', { color: '#e8f4f8', opacity: 0.25 }), metal: M.get('metal', { color: '#2a2c2e' }), floor: M.get('planks'), stone: M.get('stone'), gold: M.get('gold'),
    lamp: M.get('emissive', { color: '#fff4c0', emissiveIntensity: 6 }), magic: M.get('emissive', { color: '#9a6aff', emissiveIntensity: 3 }),
  };
  // Tapered body made of stacked frustum rings (alternating stripes for lighthouses).
  const rings = lighthouse ? 6 : 1;
  const wallT = 0.5;
  for (let i = 0; i < rings; i++) {
    const y0 = (H * i) / rings, y1 = (H * (i + 1)) / rings;
    const ra = r0 + (r1 - r0) * (y0 / H), rb = r0 + (r1 - r0) * (y1 / H);
    ocyl(b, lighthouse && i % 2 ? 'stripe' : 'wall', 0, y0, 0, ra, y1 - y0, 32, rb, true);
    ocyl(b, 'wall', 0, y0, 0, ra - wallT, y1 - y0, 24, rb - wallT, true);
  }
  // Ring collider (wall pieces around, leaving a door gap at +Z).
  const nSeg = 16;
  for (let i = 0; i < nSeg; i++) {
    const ang = (i / nSeg) * TAU;
    if (Math.abs(Math.sin(ang / 2)) < 0.2) continue; // door gap
    const rm = r0 - wallT / 2;
    b.colliders.push({ type: 'box', x: Math.sin(ang) * rm, z: Math.cos(ang) * rm, y0: 0, y1: H, hx: (TAU * rm / nSeg) / 2 + 0.1, hz: wallT / 2, yaw: ang });
  }
  // Door and windows.
  obox(b, 'wood', 0, 1.25, r0 + 0.02, 1.4, 2.5, 0.12, 0);
  b.box('stone', [-0.95, 0, r0 - 0.2], [0.95, 0.2, r0 + 0.9], { collide: true });
  const nWin = Math.floor(H / 3.5);
  for (let i = 1; i < nWin; i++) {
    const y = i * 3.5 + 0.5;
    const rr = r0 + (r1 - r0) * (y / H);
    const ang = i * 2.1 + 0.4;
    roundWindow(b, 0, 0, rr, y, ang, 0.5, 1.2, rng.chance(0.35) ? 'windowLit' : 'windowDark');
  }
  // Interior: spiral stairs around a central column up to the top platform.
  ocyl(b, 'stone', 0, 0, 0, 0.45, H, 12);
  b.cylCollider(0, 0, 0, H, 0.45);
  spiralStairs(b, 'stone', 0, 0, 0.5, Math.min(r0, r1) - wallT - 0.05, 0, H, Math.max(2, Math.round(H / 6)), Math.PI * 0.9);
  slab(b, -r1 + wallT, -r1 + wallT, r1 - wallT, r1 - wallT, H - 0.2, 0.2, { py: 'floor', default: 'stone' }, [[-(r1 - wallT), -0.5, 0, r1 - wallT]]);
  addLight(S, [0, H * 0.5, 0], '#ffb870', 1.6, 8, false, true);
  let top = H;
  if (lighthouse) {
    // Gallery, lantern room, dome and rotating beam.
    b.box('stone', [-r1 - 1.1, H, -r1 - 1.1], [r1 + 1.1, H + 0.35, r1 + 1.1], { collide: true });
    const railPts = [];
    for (let i = 0; i <= 12; i++) { const ang = (i / 12) * TAU; railPts.push([Math.sin(ang) * (r1 + 1), Math.cos(ang) * (r1 + 1)]); }
    railing(b, railPts, H + 0.35, 1, 'metal');
    const lr = r1 * 0.7, lh = 3.2;
    ocyl(b, 'metal', 0, H + 0.35, 0, lr, 0.9, 16);
    ocyl(b, 'glass', 0, H + 1.25, 0, lr, lh - 0.9, 16, lr, true);
    for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU; ocyl(b, 'metal', Math.sin(ang) * lr, H + 1.25, Math.cos(ang) * lr, 0.05, lh - 0.9, 6); }
    coneRoof(b, 0, 0, H + 0.35 + lh, lr + 0.2, lr * 0.9, 'metal', 16, true);
    ocyl(b, 'metal', 0, H + 0.35 + lh + lr * 0.9 - 0.1, 0, 0.12, 0.8, 8, 0.03);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mats.lamp);
    lamp.position.set(0, H + 2.2, 0);
    S.root.add(lamp);
    // Light beam: two long additive cones rotating (visible mostly at night).
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beamGeo = new THREE.ConeGeometry(4, 60, 20, 1, true);
    beamGeo.translate(0, -30, 0); beamGeo.rotateZ(Math.PI / 2);
    const pivot = new THREE.Group();
    pivot.position.copy(lamp.position);
    const bm1 = new THREE.Mesh(beamGeo, beamMat), bm2 = new THREE.Mesh(beamGeo, beamMat);
    bm2.rotation.y = Math.PI;
    bm1.userData.noRaycast = bm2.userData.noRaycast = true;
    markNoAO(bm1); markNoAO(bm2);
    pivot.add(bm1, bm2);
    S.root.add(pivot);
    const glow = glowSprite('#fff0c0', 6, 0.9);
    glow.position.copy(lamp.position);
    S.root.add(glow);
    S.updates.push((dt, t) => {
      pivot.rotation.y = t * 0.8;
      const night = G.world && G.world.atmosphere ? G.world.atmosphere.night : 0;
      beamMat.opacity = 0.05 + 0.18 * night;
      glow.material.opacity = 0.3 + 0.6 * night;
    });
    addLight(S, [0, H + 2.2, 0], '#fff2c0', 6, 30, true);
    top = H + 0.35 + lh + lr * 0.9 + 0.7;
  } else {
    // Overhanging top room with a big cone roof (wizard) or crenellations (watchtower).
    if (wizard) {
      const rr = r1 + 0.8;
      ocyl(b, 'wall', 0, H - 0.2, 0, rr, 3.4, 24, rr + 0.1);
      for (let i = 0; i < 16; i++) { const ang = (i / 16) * TAU; obox(b, 'wood', Math.sin(ang) * (r1 + 0.3), H - 0.6, Math.cos(ang) * (r1 + 0.3), 0.2, 0.9, 1.2, ang, -0.6); }
      for (let i = 0; i < 4; i++) roundWindow(b, 0, 0, rr, H + 1.4, i * TAU / 4 + 0.3, 0.8, 1.4, 'windowLit');
      const coneH = rr * rng.range(2.6, 3.6);
      coneRoof(b, 0, 0, H + 3.2, rr + 0.5, coneH, 'roof', 24);
      // Floating magic orb above the spire.
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 2), mats.magic);
      const orbGlow = glowSprite('#b080ff', 3, 0.85);
      const oy = H + 3.2 + coneH + 1.2;
      orb.position.set(0, oy, 0); orbGlow.position.copy(orb.position);
      S.root.add(orb, orbGlow);
      S.updates.push((dt, t) => { orb.position.y = oy + Math.sin(t * 1.5) * 0.3; orbGlow.position.y = orb.position.y; orb.rotation.y = t; });
      addLight(S, [0, oy, 0], '#a070ff', 3, 16, false);
      addLight(S, [0, H + 1.2, 0], '#ffb060', 2, 8, false, true);
      top = oy + 0.5;
    } else {
      b.box('stone', [-r1 - 0.6, H, -r1 - 0.6], [r1 + 0.6, H + 0.3, r1 + 0.6], { collide: true });
      roundMerlons(b, 'wall', 0, 0, r1 + 0.6, H + 0.3, 1.1, 14);
      makeFlag(S.root, 0, H + 0.3, 0, userColor(a) || '#a01818', 1.6, 1, 4);
      top = H + 4.5;
    }
  }
  yield;
  const R = r0 + 2;
  return finish(S, mats, {
    name: lighthouse ? 'Lighthouse' : wizard ? "Wizard's tower" : 'Stone tower', height: top, hw: R, hd: R, falloff: 5,
  });
}

// ======================================================================
// Windmill
// ======================================================================
function* windmill(S) {
  const { a, rng, b, M } = S;
  const H = rng.range(10, 14), r0 = rng.range(3.2, 3.8), r1 = r0 * 0.62;
  const modern = a.style === 'modern' || a.style === 'futuristic' || a.words.includes('turbine') || a.words.includes('wind turbine');
  const mats = {
    wall: M.get(modern ? 'paint' : rng.pick(['fieldstone', 'stucco', 'woodSiding']), { color: userColor(a) }), roof: M.get(modern ? 'paint' : 'shingles', { color: modern ? '#f4f4f4' : '#3a3430' }),
    wood: M.get('wood'), sail: M.get('fabric', { color: '#e8e0cc', side: THREE.DoubleSide }), windowDark: M.plain('#0e0c0a', 0.9), stone: M.get('stone'), white: M.get('paint', { color: '#f6f6f6' }),
  };
  S.ctx.stage('geometry', modern ? 'Raising turbine' : 'Building windmill');
  let hubY, hubZ;
  const blades = new THREE.Group();
  if (modern) {
    // Wind turbine: tall tapered mast, nacelle and three blades.
    const TH = rng.range(38, 55);
    ocyl(b, 'white', 0, 0, 0, 1.6, TH, 24, 0.9);
    b.cylCollider(0, 0, 0, TH, 1.6);
    b.box('white', [-1.1, TH, -3.5], [1.1, TH + 2.2, 2.2]);
    hubY = TH + 1.1; hubZ = 2.4;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), mats.white);
    hub.scale.set(1, 1, 1.4);
    blades.add(hub);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(1.4, 22, 0.25);
      g.translate(0, 11.5, 0);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) { const yy = pos.getY(k); pos.setX(k, pos.getX(k) * (1.1 - yy / 26)); pos.setZ(k, pos.getZ(k) * (1.1 - yy / 26)); }
      g.computeVertexNormals();
      const bl = new THREE.Mesh(g, mats.white);
      bl.rotation.z = (i / 3) * TAU;
      bl.castShadow = true;
      blades.add(bl);
    }
    b.box('stone', [-3, 0, -3], [3, 0.4, 3], { collide: true });
  } else {
    // Traditional tower mill.
    const sides = 8;
    ocyl(b, 'wall', 0, 0, 0, r0, H, sides, r1);
    b.cylCollider(0, 0, 0, H, r0 * 0.95);
    coneRoof(b, 0, 0, H, r1 + 0.4, r1 * 1.6, 'roof', 16);
    obox(b, 'wood', 0, 1.2, r0 - 0.05, 1.3, 2.4, 0.15, 0);
    for (let i = 0; i < 3; i++) roundWindow(b, 0, 0, r0 - (r0 - r1) * ((3 + i * 3) / H), 3 + i * 3, 0.5 + i * 2, 0.6, 0.9);
    // Gallery ring.
    ocyl(b, 'wood', 0, H * 0.45, 0, r0 * 0.9 + 1.1, 0.2, 16);
    hubY = H - 0.4; hubZ = r1 + 1.2;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 10), mats.wood);
    axle.rotation.x = Math.PI / 2; axle.position.z = -0.6;
    blades.add(axle);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * TAU;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.5, 0.18), mats.wood);
      spar.position.y = 4.4;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 6.5), mats.sail);
      sail.position.set(1.05, 5, 0.05);
      arm.add(spar, sail);
      for (let k = 0; k < 7; k++) { const lat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.06), mats.wood); lat.position.set(1, 1.8 + k, 0.1); arm.add(lat); }
      arm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      blades.add(arm);
    }
  }
  blades.position.set(0, hubY, hubZ);
  S.root.add(blades);
  const speed = rng.range(0.5, 0.9) * (modern ? 1.2 : 1);
  S.updates.push((dt) => { blades.rotation.z -= dt * speed * (G.world && G.world.weather ? 0.6 + G.world.weather.cur.wind : 1); });
  yield;
  return finish(S, mats, { name: modern ? 'Wind turbine' : 'Windmill', height: hubY + 12, hw: r0 + 2, hd: r0 + 3, falloff: 5 });
}

// ======================================================================
// Church / cathedral
// ======================================================================
function* church(S) {
  const { a, rng, b, M } = S;
  const big = a.words.includes('cathedral') || (a.sizeMul || 1) > 1.4;
  const W = big ? rng.range(14, 18) : rng.range(9, 11), L = big ? rng.range(30, 38) : rng.range(18, 22);
  const wallH = big ? 12 : 7.5;
  const mats = {
    wall: M.get(rng.pick(['castleStone', 'fieldstone', 'stucco']), { color: userColor(a) }), roof: M.get('slate', { color: '#3a3e44' }), trim: M.get('stone', { color: '#c8c0b0' }),
    wood: M.get('darkWood'), floor: M.get('checker', { color: '#e8e4dc' }), stained: M.get('emissive', { color: '#6a8aff', emissiveIntensity: 0.9 }),
    stained2: M.get('emissive', { color: '#ff6a4a', emissiveIntensity: 0.9 }), stained3: M.get('emissive', { color: '#f0d040', emissiveIntensity: 0.9 }), gold: M.get('gold'), carpet: M.get('carpet', { color: '#8a1a1a' }),
    ...furnitureMaterials(rng, {}),
  };
  S.ctx.stage('geometry', 'Raising nave');
  const x0 = -W / 2, x1 = W / 2, z0 = -L / 2, z1 = L / 2;
  const t = 0.7;
  const winOps = [];
  const nWin = Math.floor(L / 3.6);
  for (let i = 1; i < nWin; i++) winOps.push({ u0: (L * i) / nWin - 0.6, u1: (L * i) / nWin + 0.6, v0: 2.2, v1: wallH - 1.2, kind: 'hole' });
  wallSegmentsZ(b, { z0, z1, x: x0, y0: 0, h: wallH, t, ext: 'wall', side: -1, openings: winOps });
  wallSegmentsZ(b, { z0, z1, x: x1, y0: 0, h: wallH, t, ext: 'wall', side: 1, openings: winOps });
  // Stained glass panes in the window holes.
  for (const q of winOps) for (const x of [x0, x1]) {
    const k = ['stained', 'stained2', 'stained3'][Math.floor(q.u0) % 3];
    b.box(k, [x - 0.05, q.v0, z0 + q.u0], [x + 0.05, q.v1, z0 + q.u1]);
    b.collider([x - 0.1, q.v0, z0 + q.u0], [x + 0.1, q.v1, z0 + q.u1]);
  }
  const doorW = big ? 3 : 2.2, doorH = big ? 5 : 3.6;
  wallSegmentsX(b, { x0: x0 - t / 2, x1: x1 + t / 2, z: z1, y0: 0, h: wallH, t, ext: 'wall', side: 1, openings: [{ u0: W / 2 + t / 2 - doorW / 2, u1: W / 2 + t / 2 + doorW / 2, v0: 0, v1: doorH, kind: 'hole' }] });
  wallSegmentsX(b, { x0: x0 - t / 2, x1: x1 + t / 2, z: z0, y0: 0, h: wallH, t, ext: 'wall', side: -1, openings: [] });
  // Rose window above the door.
  const rose = new THREE.Mesh(new THREE.CircleGeometry(W * 0.16, 24), mats.stained);
  rose.position.set(0, wallH + W * 0.18, z1 + t / 2 + 0.02);
  S.root.add(rose);
  slab(b, x0, z0, x1, z1, 0, 0.1, { py: 'floor', default: 'trim' });
  const pitch = THREE.MathUtils.degToRad(52);
  gableRoof(b, x0 - t / 2, z0 - t / 2, x1 + t / 2, z1 + t / 2, wallH, pitch, { roof: 'roof', wall: 'wall', trim: 'trim' }, { alongZ: true, overhang: 0.5 });
  // Buttresses.
  for (let i = 0; i <= nWin; i++) for (const s of [-1, 1]) {
    const z = z0 + (L * i) / nWin;
    b.box('wall', [s > 0 ? x1 + t / 2 : x0 - t / 2 - 1.2, 0, z - 0.4], [s > 0 ? x1 + t / 2 + 1.2 : x0 - t / 2, wallH * 0.75, z + 0.4], { collide: true });
  }
  yield;
  // Bell tower with spire at the entrance.
  S.ctx.stage('details', 'Building bell tower');
  const tw = W * 0.5, th = wallH * (big ? 2.4 : 2.1);
  const tz0 = z1 - tw * 0.5;
  const tzA = z1 + t / 2, tzB = tzA + tw * 0.6;
  b.box('wall', [-tw / 2, doorH + 0.5, tzA - 0.1], [tw / 2, th, tzB], { collide: true });
  b.box('wall', [-tw / 2, 0, tzA], [-doorW / 2 - 0.2, doorH + 0.5, tzB], { collide: true });
  b.box('wall', [doorW / 2 + 0.2, 0, tzA], [tw / 2, doorH + 0.5, tzB], { collide: true });
  void tz0;
  // Belfry openings (dark) and clock face.
  for (const s of [-1, 1]) obox(b, 'wood', s * (tw / 2 + 0.01), th - 3, (tzA + tzB) / 2, 0.05, 2.5, 1.2, Math.PI / 2);
  obox(b, 'wood', 0, th - 3, tzB + 0.01, 1.2, 2.5, 0.05);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(tw * 0.28, 32), M.get('paint', { color: '#f4f0e0' }));
  clock.position.set(0, th - 6.5, tzB + 0.03);
  S.root.add(clock);
  for (let i = 0; i < 12; i++) { const ang = (i / 12) * TAU; obox(b, 'wood', Math.sin(ang) * tw * 0.23, th - 6.5 + Math.cos(ang) * tw * 0.23, tzB + 0.05, 0.08, 0.3, 0.04, 0, 0, -ang); }
  const spireH = tw * (big ? 3.4 : 2.6);
  const sp = new THREE.ConeGeometry(tw * 0.72, spireH, 4);
  sp.rotateY(Math.PI / 4);
  b.geometry('roof', sp, new THREE.Matrix4().makeTranslation(0, th + spireH / 2, (tzA + tzB) / 2));
  // Cross.
  const cy = th + spireH;
  b.box('gold', [-0.08, cy, (tzA + tzB) / 2 - 0.08], [0.08, cy + 2, (tzA + tzB) / 2 + 0.08]);
  b.box('gold', [-0.6, cy + 1.2, (tzA + tzB) / 2 - 0.08], [0.6, cy + 1.4, (tzA + tzB) / 2 + 0.08]);
  // Pews & altar.
  S.ctx.stage('interior', 'Placing pews');
  b.box('carpet', [-0.8, 0.1, z0 + 3], [0.8, 0.12, z1 - 0.5]);
  const rows = Math.floor((L - 8) / 1.3);
  for (let i = 0; i < rows; i++) for (const s of [-1, 1]) {
    const info = placePiece(b, 'bench', rng, s * (W / 4 + 0.3), 0.1, z1 - 3 - i * 1.3, Math.PI, { w: W / 2 - 2 });
    S.seats.push(...info.seats);
  }
  b.box('trim', [-W / 2 + 0.4, 0.1, z0 + 0.4], [W / 2 - 0.4, 0.5, z0 + 3], { collide: true });
  b.box('wood', [-1.2, 0.5, z0 + 1.2], [1.2, 1.5, z0 + 2], { collide: true });
  b.box('gold', [-0.1, 1.5, z0 + 1.5], [0.1, 2.3, z0 + 1.7]);
  b.box('gold', [-0.35, 2, z0 + 1.5], [0.35, 2.12, z0 + 1.7]);
  for (const x of [-0.9, 0.9]) { attachFire(S.root, [x, 1.75, z0 + 1.6], 0.12); b.box('trim', [x - 0.05, 1.5, z0 + 1.55], [x + 0.05, 1.72, z0 + 1.65]); }
  addLight(S, [0, wallH - 2, 0], '#ffd8a0', 2.4, 16, false);
  addLight(S, [0, 2.5, z0 + 2], '#ffb060', 1.5, 6, false, true);
  yield;
  return finish(S, mats, { name: big ? 'Cathedral' : 'Church', height: cy + 2, hw: W / 2 + 2.5, hd: L / 2 + tw * 0.6 + 2, falloff: 6 });
}

// ======================================================================
// Greek temple
// ======================================================================
function* greekTemple(S) {
  const { a, rng, b, M } = S;
  const egyptian = a.style === 'egyptian';
  const cols = rng.pick([6, 8]);
  const spacing = rng.range(2.6, 3.2);
  const W = (cols - 1) * spacing + 3, L = W * rng.range(1.5, 1.9);
  const colH = spacing * 2.9, colR = spacing * 0.2;
  const mats = { marble: M.get(a.materials[0] || (egyptian ? 'sand' : 'marble'), { color: userColor(a) }), step: M.get(egyptian ? 'sand' : 'marble'), roof: M.get(egyptian ? 'sand' : 'rooftiles', { color: egyptian ? undefined : '#b86a4a' }), gold: M.get('gold'), dark: M.plain('#2a2622', 0.9) };
  S.ctx.stage('geometry', 'Laying stylobate');
  // Three steps.
  for (let i = 0; i < 3; i++) b.box('step', [-W / 2 - 1.5 + i * 0.5, i * 0.4, -L / 2 - 1.5 + i * 0.5], [W / 2 + 1.5 - i * 0.5, (i + 1) * 0.4, L / 2 + 1.5 - i * 0.5], { collide: true });
  const base = 1.2;
  // Peristyle columns with fluting (many-sided cylinders), base and capital.
  const colGeo = new THREE.CylinderGeometry(colR * 0.86, colR, colH, 20, 1);
  const positions = [];
  const nL = Math.round((L - 3) / spacing) + 1;
  for (let i = 0; i < cols; i++) { const x = -W / 2 + 1.5 + i * spacing; positions.push([x, -L / 2 + 1.5], [x, L / 2 - 1.5]); }
  for (let j = 1; j < nL - 1; j++) { const z = -L / 2 + 1.5 + j * ((L - 3) / (nL - 1)); positions.push([-W / 2 + 1.5, z], [W / 2 - 1.5, z]); }
  for (const [x, z] of positions) {
    b.geometry('marble', colGeo, new THREE.Matrix4().makeTranslation(x, base + colH / 2 + 0.25, z));
    b.box('marble', [x - colR * 1.2, base, z - colR * 1.2], [x + colR * 1.2, base + 0.25, z + colR * 1.2]);
    b.box('marble', [x - colR * 1.25, base + colH + 0.25, z - colR * 1.25], [x + colR * 1.25, base + colH + 0.55, z + colR * 1.25]);
    b.cylCollider(x, z, base, base + colH + 0.5, colR);
  }
  yield;
  // Entablature and pediment roof.
  const eY = base + colH + 0.55;
  b.box('marble', [-W / 2 + 0.6, eY, -L / 2 + 0.6], [W / 2 - 0.6, eY + 1.4, L / 2 - 0.6], { collide: true });
  for (let i = 0; i < Math.floor(W / 0.9); i++) for (const z of [L / 2 - 0.58, -L / 2 + 0.58]) b.box('dark', [-W / 2 + 0.9 + i * 0.9, eY + 0.5, z - 0.02], [-W / 2 + 1.15 + i * 0.9, eY + 1.1, z + 0.02]);
  if (!egyptian) gableRoof(b, -W / 2 + 0.6, -L / 2 + 0.6, W / 2 - 0.6, L / 2 - 0.6, eY + 1.4, THREE.MathUtils.degToRad(15), { roof: 'roof', wall: 'marble', trim: 'marble' }, { alongZ: true, overhang: 0.35 });
  else flatRoof(b, -W / 2 + 0.6, -L / 2 + 0.6, W / 2 - 0.6, L / 2 - 0.6, eY + 1.4, { roof: 'marble', wall: 'marble' }, { parapet: 0.6 });
  // Cella (inner room) with a statue-like golden figure placeholder (a glowing orb on a plinth).
  const cw = W - 6, cl = L - 8;
  wallSegmentsX(b, { x0: -cw / 2, x1: cw / 2, z: cl / 2, y0: base, h: colH, t: 0.6, ext: 'marble', side: 1, openings: [{ u0: cw / 2 - 1.4, u1: cw / 2 + 1.4, v0: 0, v1: colH * 0.6, kind: 'hole' }] });
  wallSegmentsX(b, { x0: -cw / 2, x1: cw / 2, z: -cl / 2, y0: base, h: colH, t: 0.6, ext: 'marble', side: -1 });
  wallSegmentsZ(b, { z0: -cl / 2, z1: cl / 2, x: -cw / 2, y0: base, h: colH, t: 0.6, ext: 'marble', side: -1 });
  wallSegmentsZ(b, { z0: -cl / 2, z1: cl / 2, x: cw / 2, y0: base, h: colH, t: 0.6, ext: 'marble', side: 1 });
  b.box('marble', [-1, base, -cl / 2 + 1], [1, base + 1.4, -cl / 2 + 3], { collide: true });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 3), M.get('gold'));
  orb.position.set(0, base + 2.2, -cl / 2 + 2);
  S.root.add(orb);
  S.updates.push((dt, t) => { orb.rotation.y = t * 0.5; orb.position.y = base + 2.2 + Math.sin(t) * 0.1; });
  for (const x of [-2.2, 2.2]) { b.box('marble', [x - 0.3, base, cl / 2 + 1.2], [x + 0.3, base + 1.1, cl / 2 + 1.8], { collide: true }); attachFire(S.root, [x, base + 1.1, cl / 2 + 1.5], 0.5); addLight(S, [x, base + 1.8, cl / 2 + 1.5], '#ffa050', 2, 8, false, true); }
  yield;
  return finish(S, mats, { name: egyptian ? 'Egyptian temple' : 'Greek temple', height: eY + 4, hw: W / 2 + 2.5, hd: L / 2 + 2.5, falloff: 6 });
}

// ======================================================================
// Japanese pagoda / house
// ======================================================================
// Flared roof: hip roof whose corners curl up (custom geometry).
function flaredRoof(b, key, cx, cz, y, hw, hd, h, flare = 0.6, segs = 10) {
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  const ridge = Math.max(0.01, (hw - hd) * 0.9);
  const ring = (t) => {
    // t = 0 at eaves, 1 at ridge. Corner lift is strongest at the eaves.
    const s = 1 - t;
    const lift = flare * s * s;
    const cw = ridge + (hw - ridge) * s, cd = hd * s;
    return [[cx - cw, cz - cd], [cx + cw, cz - cd], [cx + cw, cz + cd], [cx - cw, cz + cd]].map(([x, z], i) => {
      const cornerLift = lift;
      const yy = y + h * Math.pow(t, 0.75) + cornerLift * (1 - t);
      return { p: V(x, yy, z), i };
    });
  };
  // Edge mid-points sag compared to corners: build per edge with subdivided strips.
  const rings = [];
  for (let k = 0; k <= segs; k++) rings.push(ring(k / segs));
  for (let k = 0; k < segs; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let e = 0; e < 4; e++) {
      const a0 = A[e].p, a1 = A[(e + 1) % 4].p, b0 = B[e].p, b1 = B[(e + 1) % 4].p;
      // Subdivide each edge into 6 to add the sag between corners.
      const n = 6;
      for (let j = 0; j < n; j++) {
        const f0 = j / n, f1 = (j + 1) / n;
        const sag = (f) => Math.sin(f * Math.PI) * 0.25 * (1 - k / segs);
        const p00 = a0.clone().lerp(a1, f0); p00.y -= sag(f0);
        const p01 = a0.clone().lerp(a1, f1); p01.y -= sag(f1);
        const p10 = b0.clone().lerp(b1, f0); p10.y -= sag(f0) * 0.8;
        const p11 = b0.clone().lerp(b1, f1); p11.y -= sag(f1) * 0.8;
        b.quad(key, p00, p01, p11, p10);
        b.quad(key, p01.clone().setY(p01.y - 0.12), p00.clone().setY(p00.y - 0.12), p10.clone().setY(p10.y - 0.12), p11.clone().setY(p11.y - 0.12));
      }
    }
  }
}

function* japanese(S) {
  const { a, rng, b, M } = S;
  const pagoda = S.item.concept === 'pagoda' || a.words.includes('pagoda') || a.words.includes('temple') || a.words.includes('shrine');
  const mats = {
    wood: M.get('painted', { color: pagoda ? '#a82a1a' : '#5a3a22' }), dark: M.get('darkWood'), roof: M.get('slate', { color: '#2e3236' }), plaster: M.get('plaster', { color: '#f2ece0' }),
    shoji: M.get('emissive', { color: '#f4e8cc', emissiveIntensity: 0.25 }), floor: M.get('floorWood'), stone: M.get('fieldstone'), gold: M.get('gold'), tatami: M.get('fabric', { color: '#c8c090' }), gravel: M.get('gravel', { color: '#c8c4b8' }),
  };
  S.ctx.stage('geometry', pagoda ? 'Stacking pagoda tiers' : 'Framing the house');
  let top = 0, hw0 = 0;
  if (pagoda) {
    const tiers = clamp(a.floors || rng.pick([3, 5, 5, 7]), 2, 9);
    let w = rng.range(8, 10);
    hw0 = w / 2 + 3;
    b.box('stone', [-w / 2 - 1.5, 0, -w / 2 - 1.5], [w / 2 + 1.5, 0.8, w / 2 + 1.5], { collide: true });
    stairs(b, -1.2, 1.2, w / 2 + 1.5, 0, 0.8, 1.2, { default: 'stone' });
    let y = 0.8;
    for (let t = 0; t < tiers; t++) {
      const h = t === 0 ? 3.4 : 2.4;
      const hw = w / 2;
      // Posts, walls with shoji screens.
      for (const [x, z] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) b.box('wood', [x - 0.2, y, z - 0.2], [x + 0.2, y + h, z + 0.2], { collide: true });
      b.box('plaster', [-hw + 0.2, y, -hw + 0.05], [hw - 0.2, y + h, hw - 0.05], { collide: t === 0 ? false : true });
      for (const s of [-1, 1]) { b.box('shoji', [-hw * 0.6, y + 0.3, s * (hw - 0.02) - 0.03], [hw * 0.6, y + h - 0.4, s * (hw - 0.02) + 0.03]); b.box('shoji', [s * (hw - 0.02) - 0.03, y + 0.3, -hw * 0.6], [s * (hw - 0.02) + 0.03, y + h - 0.4, hw * 0.6]); }
      if (t === 0) { b.collider([-hw, y, -hw], [hw, y + h, -hw + 0.3]); b.collider([-hw, y, -hw], [-hw + 0.3, y + h, hw]); b.collider([hw - 0.3, y, -hw], [hw, y + h, hw]); b.collider([-hw, y, hw - 0.3], [-1, y + h, hw]); b.collider([1, y, hw - 0.3], [hw, y + h, hw]); }
      // Balcony railing on upper tiers.
      if (t > 0) railing(b, [[-hw - 0.6, hw + 0.6], [hw + 0.6, hw + 0.6], [hw + 0.6, -hw - 0.6], [-hw - 0.6, -hw - 0.6], [-hw - 0.6, hw + 0.6]], y, 0.8, 'wood', { height: 0.8 });
      b.box('dark', [-hw - 0.7, y - 0.15, -hw - 0.7], [hw + 0.7, y, hw + 0.7], { collide: true });
      y += h;
      const ov = 2.2 - t * 0.1;
      flaredRoof(b, 'roof', 0, 0, y, hw + ov, hw + ov, 1.2, 0.9);
      b.collider([-hw - 0.5, y, -hw - 0.5], [hw + 0.5, y + 1, hw + 0.5]);
      y += 1.0;
      w *= 0.82;
      yield;
    }
    // Sorin spire with rings.
    ocyl(b, 'gold', 0, y, 0, 0.18, 5, 10, 0.08);
    for (let i = 0; i < 7; i++) ocyl(b, 'gold', 0, y + 0.8 + i * 0.5, 0, 0.45 - i * 0.03, 0.1, 14);
    top = y + 5;
    addLight(S, [0, 2.4, 0], '#ffc080', 1.8, 8, false, true);
    // Stone lanterns.
    for (const x of [-4, 4]) {
      const lz = hw0 + 2;
      b.box('stone', [x - 0.3, 0, lz - 0.3], [x + 0.3, 0.3, lz + 0.3], { collide: true });
      b.box('stone', [x - 0.1, 0.3, lz - 0.1], [x + 0.1, 1.1, lz + 0.1]);
      b.box('shoji', [x - 0.25, 1.1, lz - 0.25], [x + 0.25, 1.5, lz + 0.25]);
      b.box('stone', [x - 0.4, 1.5, lz - 0.4], [x + 0.4, 1.65, lz + 0.4]);
      addLight(S, [x, 1.3, lz], '#ffc070', 1.2, 5, true, true);
    }
  } else {
    // Single-story house on a raised floor with an engawa veranda.
    const W = rng.range(11, 14), D = rng.range(8, 10), h = 3;
    hw0 = W / 2 + 2.5;
    b.box('stone', [-W / 2 - 1.3, 0, -D / 2 - 1.3], [W / 2 + 1.3, 0.25, D / 2 + 1.3], { collide: true });
    b.box({ py: 'floor', default: 'dark' }, [-W / 2 - 1.1, 0.25, -D / 2 - 1.1], [W / 2 + 1.1, 0.6, D / 2 + 1.1], { collide: true });
    stairs(b, -1, 1, D / 2 + 1.1, 0.25, 0.35, 0.6, { default: 'dark' });
    for (let i = 0; i <= 5; i++) for (const z of [-D / 2, D / 2]) b.box('dark', [-W / 2 + (W * i) / 5 - 0.12, 0.6, z - 0.12], [-W / 2 + (W * i) / 5 + 0.12, 0.6 + h, z + 0.12], { collide: true });
    for (let i = 0; i <= 3; i++) for (const x of [-W / 2, W / 2]) b.box('dark', [x - 0.12, 0.6, -D / 2 + (D * i) / 3 - 0.12], [x + 0.12, 0.6 + h, -D / 2 + (D * i) / 3 + 0.12], { collide: true });
    // Shoji screen walls (translucent glowing paper) with a lattice.
    b.box('shoji', [-W / 2 + 0.12, 0.6, D / 2 - 0.04], [-1, 0.6 + h - 0.4, D / 2 + 0.04]);
    b.box('shoji', [1, 0.6, D / 2 - 0.04], [W / 2 - 0.12, 0.6 + h - 0.4, D / 2 + 0.04]);
    b.box('shoji', [-W / 2 + 0.12, 0.6, -D / 2 - 0.04], [W / 2 - 0.12, 0.6 + h - 0.4, -D / 2 + 0.04]);
    b.box('shoji', [-W / 2 - 0.04, 0.6, -D / 2 + 0.12], [-W / 2 + 0.04, 0.6 + h - 0.4, D / 2 - 0.12]);
    b.box('shoji', [W / 2 - 0.04, 0.6, -D / 2 + 0.12], [W / 2 + 0.04, 0.6 + h - 0.4, D / 2 - 0.12]);
    for (let x = -W / 2; x < W / 2; x += 0.5) for (const z of [D / 2 + 0.05, -D / 2 - 0.05]) if (Math.abs(x) > 1 || z < 0) b.box('dark', [x, 0.6, z - 0.01], [x + 0.03, 0.6 + h - 0.4, z + 0.01]);
    for (let yy = 1; yy < h; yy += 0.5) for (const z of [D / 2 + 0.05, -D / 2 - 0.05]) b.box('dark', [-W / 2, 0.6 + yy, z - 0.01], [W / 2, 0.63 + yy, z + 0.01]);
    b.box('plaster', [-W / 2, 0.6 + h - 0.4, -D / 2], [W / 2, 0.6 + h, D / 2]);
    b.collider([-W / 2, 0.6, -D / 2 - 0.05], [W / 2, 0.6 + h, -D / 2 + 0.05]);
    b.collider([-W / 2 - 0.05, 0.6, -D / 2], [-W / 2 + 0.05, 0.6 + h, D / 2]);
    b.collider([W / 2 - 0.05, 0.6, -D / 2], [W / 2 + 0.05, 0.6 + h, D / 2]);
    b.collider([-W / 2, 0.6, D / 2 - 0.05], [-1, 0.6 + h, D / 2 + 0.05]);
    b.collider([1, 0.6, D / 2 - 0.05], [W / 2, 0.6 + h, D / 2 + 0.05]);
    flaredRoof(b, 'roof', 0, 0, 0.6 + h, W / 2 + 1.6, D / 2 + 1.6, 2.6, 0.55);
    b.box('tatami', [-W / 2 + 0.2, 0.61, -D / 2 + 0.2], [W / 2 - 0.2, 0.63, D / 2 - 0.2]);
    const tbl = placePiece(b, 'table', rng, 0, 0.63, 0, 0, { kind: 'coffee' });
    void tbl;
    addLight(S, [0, 0.6 + h - 0.6, 0], '#ffd9a0', 2, 9, false);
    top = 0.6 + h + 2.6;
    // Zen gravel garden with rocks and a cherry tree.
    const zg = new THREE.Group();
    S.extraColliders.push(gardenTree(zg, rng, W / 2 + 1.5, D / 2 + 3.5, 'cherry', 0.7));
    S.root.add(zg);
  }
  yield;
  return finish(S, mats, { name: pagoda ? 'Pagoda' : 'Japanese house', height: top, hw: hw0, hd: hw0 * (pagoda ? 1 : 0.8) + 2.5, falloff: 6 });
}

// ======================================================================
// Pyramid
// ======================================================================
function* pyramid(S) {
  const { a, rng, b, M } = S;
  const base = rng.range(28, 44) * clamp(a.sizeMul || 1, 0.3, 3);
  const stepped = a.words.includes('mayan') || a.words.includes('aztec') || a.words.includes('stepped') || rng.chance(0.3);
  const h = stepped ? base * 0.55 : base * 0.64;
  const mats = { stone: M.get(a.materials[0] || 'sand', { color: userColor(a) || (stepped ? '#9a9480' : '#d8c090'), world: 6 }), cap: M.get('gold'), dark: M.plain('#140f0a', 0.95), trim: M.get('stone', { color: '#b8a888' }) };
  S.ctx.stage('geometry', 'Stacking stones');
  if (stepped) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const s = base / 2 * (1 - i / (n + 1.5)), y0 = (h * i) / n, y1 = (h * (i + 1)) / n;
      b.box('stone', [-s, y0, -s], [s, y1, s], { collide: true });
    }
    // Front staircase.
    const topS = base / 2 * (1 - (n - 1) / (n + 1.5));
    for (let i = 0; i < 40; i++) {
      const f = i / 40, y = h * f, z = base / 2 - (base / 2 - topS) * f;
      b.box('trim', [-2.5, y, z - (base / 2 - topS) / 40], [2.5, y + h / 40, z + 0.5], { collide: true });
    }
    // Temple on top.
    b.box('trim', [-topS * 0.6, h, -topS * 0.6], [topS * 0.6, h + 4, topS * 0.6], { collide: true });
    b.box('dark', [-1, h, topS * 0.6 - 0.05], [1, h + 2.6, topS * 0.6 + 0.02]);
    b.box('stone', [-topS * 0.7, h + 4, -topS * 0.7], [topS * 0.7, h + 4.6, topS * 0.7], { collide: true });
    attachFire(S.root, [0, h + 4.6, 0], 1.2);
    addLight(S, [0, h + 5.5, 0], '#ff9040', 4, 20, false, true);
  } else {
    // Smooth-sided pyramid (four triangles) with stepped colliders so it can be climbed.
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const s = base / 2, apex = V(0, h, 0);
    b.tri('stone', V(-s, 0, s), V(s, 0, s), apex);
    b.tri('stone', V(s, 0, s), V(s, 0, -s), apex);
    b.tri('stone', V(s, 0, -s), V(-s, 0, -s), apex);
    b.tri('stone', V(-s, 0, -s), V(-s, 0, s), apex);
    const capH = h * 0.07;
    const cs = s * (capH / h);
    b.tri('cap', V(-cs, h - capH, cs + 0.02), V(cs, h - capH, cs + 0.02), V(0, h + 0.02, 0));
    b.tri('cap', V(cs + 0.02, h - capH, cs), V(cs + 0.02, h - capH, -cs), V(0, h + 0.02, 0));
    b.tri('cap', V(cs, h - capH, -cs - 0.02), V(-cs, h - capH, -cs - 0.02), V(0, h + 0.02, 0));
    b.tri('cap', V(-cs - 0.02, h - capH, -cs), V(-cs - 0.02, h - capH, cs), V(0, h + 0.02, 0));
    const steps = 24;
    for (let i = 0; i < steps; i++) { const f = (i + 1) / steps; const ss = s * (1 - f + 1 / steps); b.collider([-ss, 0, -ss], [ss, h * f, ss], { walkable: true }); }
    // Entrance.
    const ey = h * 0.12, ez = s * (1 - ey / h);
    b.box('dark', [-1, ey, ez - 0.3], [1, ey + 2.2, ez + 0.2]);
    b.box('trim', [-1.3, ey + 2.2, ez - 0.3], [1.3, ey + 2.6, ez + 0.4]);
  }
  yield;
  return finish(S, mats, { name: stepped ? 'Stepped pyramid' : 'Pyramid', height: h + 5, hw: base / 2 + 2, hd: base / 2 + 2, falloff: 8, paint: [{ type: 'paint', x: 0, z: 0, radius: base * 0.75, channel: 2, value: 200, falloff: 6 }] });
}

// ======================================================================
// Barn (with silo)
// ======================================================================
function* barn(S) {
  const { a, rng, b, M } = S;
  const W = rng.range(10, 13), L = rng.range(14, 18), wallH = 4.2;
  const red = userColor(a) || rng.pick(['#8a2a1e', '#9a3020', '#7a2418', '#5a5a5a']);
  const mats = { wall: M.get('woodSiding', { color: red }), trim: M.get('paint', { color: '#f4f0e8' }), roof: M.get('metal', { color: '#5a5c60' }), floor: M.get('planks'), hay: M.get('thatch'), silo: M.get('metal', { color: '#c8c8c4' }), siloRoof: M.get('metal', { color: '#8a8c90' }), stone: M.get('fieldstone') };
  S.ctx.stage('geometry', 'Framing barn');
  const x0 = -W / 2, x1 = W / 2, z0 = -L / 2, z1 = L / 2, t = 0.25;
  const doorW = 4, doorH = 3.8;
  wallSegmentsX(b, { x0, x1, z: z1, y0: 0, h: wallH, t, ext: 'wall', int: 'wall', side: 1, openings: [{ u0: W / 2 - doorW / 2, u1: W / 2 + doorW / 2, v0: 0, v1: doorH, kind: 'hole' }] });
  wallSegmentsX(b, { x0, x1, z: z0, y0: 0, h: wallH, t, ext: 'wall', int: 'wall', side: -1 });
  wallSegmentsZ(b, { z0, z1, x: x0, y0: 0, h: wallH, t, ext: 'wall', int: 'wall', side: -1, openings: [{ u0: 3, u1: 4.2, v0: 1.6, v1: 2.8, kind: 'window' }] });
  wallSegmentsZ(b, { z0, z1, x: x1, y0: 0, h: wallH, t, ext: 'wall', int: 'wall', side: 1, openings: [{ u0: L - 4.2, u1: L - 3, v0: 1.6, v1: 2.8, kind: 'window' }] });
  slab(b, x0, z0, x1, z1, 0, 0.1, { py: 'floor', default: 'stone' });
  // Gambrel roof: lower steep and upper shallow slopes on each side, gable ends filled.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const kneeX = W / 2 * 0.62, kneeY = wallH + 2.2, ridgeY = wallH + 3.6;
  const Z0 = z0 - 0.4, Z1 = z1 + 0.4;
  const prof = [[-W / 2 - 0.3, wallH - 0.2], [-kneeX, kneeY], [0, ridgeY], [kneeX, kneeY], [W / 2 + 0.3, wallH - 0.2]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [ax, ay] = prof[i], [bx, by] = prof[i + 1];
    b.quad('roof', V(ax, ay, Z1), V(bx, by, Z1), V(bx, by, Z0), V(ax, ay, Z0));
    b.quad('roof', V(bx, by - 0.1, Z1), V(ax, ay - 0.1, Z1), V(ax, ay - 0.1, Z0), V(bx, by - 0.1, Z0));
  }
  for (const z of [z1, z0]) {
    const s = z > 0 ? 1 : -1;
    const pts = [[-W / 2, wallH], [-kneeX, kneeY], [0, ridgeY], [kneeX, kneeY], [W / 2, wallH]];
    for (let i = 1; i < pts.length - 2; i++) {
      if (s > 0) b.tri('wall', V(pts[0][0], pts[0][1], z + s * t / 2), V(pts[i + 1][0], pts[i + 1][1], z + s * t / 2), V(pts[i][0], pts[i][1], z + s * t / 2));
      else b.tri('wall', V(pts[0][0], pts[0][1], z + s * t / 2), V(pts[i][0], pts[i][1], z + s * t / 2), V(pts[i + 1][0], pts[i + 1][1], z + s * t / 2));
    }
    if (s > 0) { b.tri('wall', V(pts[0][0], pts[0][1], z + t / 2), V(pts[4][0], pts[4][1], z + t / 2), V(pts[3][0], pts[3][1], z + t / 2)); }
    else { b.tri('wall', V(pts[0][0], pts[0][1], z - t / 2), V(pts[3][0], pts[3][1], z - t / 2), V(pts[4][0], pts[4][1], z - t / 2)); }
    // Hay loft door.
    b.box('trim', [-1, wallH + 0.4, z + s * 0.14 - 0.03], [1, wallH + 2, z + s * 0.14 + 0.03]);
  }
  for (let i = 0; i < 6; i++) b.collider([-(W / 2) * (1 - i / 6), wallH, z0], [(W / 2) * (1 - i / 6), wallH + ((ridgeY - wallH) * (i + 1)) / 6, z1], { walkable: true });
  // White trim: corner boards and the classic X on the (open) sliding doors.
  for (const [x, z] of [[x0, z1], [x1, z1], [x0, z0], [x1, z0]]) b.box('trim', [x - 0.16, 0, z - 0.16], [x + 0.16, wallH, z + 0.16]);
  for (const s of [-1, 1]) {
    const cx = s * (doorW / 2 + doorW / 2 + 0.05);
    b.box('wall', [cx - doorW / 2, 0, z1 + 0.15], [cx + doorW / 2, doorH, z1 + 0.25]);
    b.box('trim', [cx - doorW / 2, 0, z1 + 0.25], [cx + doorW / 2, 0.15, z1 + 0.3]);
    b.box('trim', [cx - doorW / 2, doorH - 0.15, z1 + 0.25], [cx + doorW / 2, doorH, z1 + 0.3]);
    b.box('trim', [cx - doorW / 2, 0, z1 + 0.25], [cx - doorW / 2 + 0.15, doorH, z1 + 0.3]);
    b.box('trim', [cx + doorW / 2 - 0.15, 0, z1 + 0.25], [cx + doorW / 2, doorH, z1 + 0.3]);
    const diag = Math.hypot(doorW, doorH);
    obox(b, 'trim', cx, doorH / 2, z1 + 0.28, 0.14, diag - 0.2, 0.05, 0, 0, Math.atan2(doorW, doorH));
    obox(b, 'trim', cx, doorH / 2, z1 + 0.28, 0.14, diag - 0.2, 0.05, 0, 0, -Math.atan2(doorW, doorH));
  }
  b.box('trim', [-W / 2 - 0.2, doorH + 0.05, z1 + 0.15], [W / 2 + 0.2, doorH + 0.2, z1 + 0.35]);
  // Hay bales stacked inside.
  S.ctx.stage('interior', 'Stacking hay');
  for (let i = 0; i < 10; i++) {
    const x = x0 + 1 + (i % 4) * 1.3, z = z0 + 1.2 + Math.floor(i / 4) * 0.95, y = 0.1;
    b.box('hay', [x - 0.6, y, z - 0.4], [x + 0.6, y + 0.5, z + 0.4], { collide: true });
  }
  for (let i = 0; i < 5; i++) b.box('hay', [x0 + 1.6 + i * 1.3 - 0.6, 0.6, z0 + 1.6 - 0.4], [x0 + 1.6 + i * 1.3 + 0.6, 1.1, z0 + 1.6 + 0.4], { collide: true });
  addLight(S, [0, wallH - 0.5, 0], '#ffd090', 1.8, 10, false);
  addLight(S, [0, doorH + 0.6, z1 + 0.7], '#ffd090', 1.4, 7, true);
  // Silo.
  const sx = x1 + 3.2, sz = z0 + 3, sr = 2.4, sh = rng.range(11, 14);
  roundWall(b, sx, sz, 0, sh, sr, 'silo', 28);
  for (let i = 1; i < sh / 1.2; i++) ocyl(b, 'siloRoof', sx, i * 1.2, sz, sr + 0.04, 0.06, 28);
  coneRoof(b, sx, sz, sh, sr + 0.1, sr * 0.9, 'siloRoof', 28, true);
  yield;
  return finish(S, mats, { name: 'Red barn', height: ridgeY, hw: W / 2 + 6, hd: L / 2 + 2, falloff: 6, paint: [{ type: 'paint', shape: 'rect', x: 0, z: z1 + 3, hw: 3, hd: 3, yaw: 0, radius: 4.5, channel: 1, value: 220, falloff: 2 }] });
}

// ======================================================================
// Shop / cafe / bakery storefront
// ======================================================================
const SHOP_NAMES = { bakery: ['Golden Crust Bakery', 'Rise & Shine', 'Le Petit Four'], cafe: ['Cafe Aroma', 'The Daily Grind', 'Bean There'], coffee: ['Cafe Aroma', 'Steam & Bean'], restaurant: ['Trattoria Sole', 'The Copper Pot'], pizza: ['Pizzeria Napoli'], book: ['Dog-Eared Books', 'Chapter & Verse'], flower: ['Petal & Stem'], toy: ['Wonder Toys'], candy: ['Sugar Rush Sweets'], ice: ['Scoops Ice Cream'], general: ['General Store', 'Corner Market', 'Miller & Sons', 'Main Street Goods'] };
function* shop(S) {
  const { a, rng, b, M } = S;
  const kind = Object.keys(SHOP_NAMES).find((k) => a.words.some((w) => w.startsWith(k))) || 'general';
  const name = a.label || a.name || rng.pick(SHOP_NAMES[kind]);
  const W = rng.range(8, 11), D = rng.range(8, 10), H = 4.2, floors = clamp(a.floors || rng.pick([1, 2]), 1, 3);
  const accent = userColor(a) || rng.pick(['#1f4a3a', '#6a1a2a', '#1a2a4a', '#2a2a2a', '#8a4a1a']);
  const mats = {
    wall: M.get(rng.pick(['brick', 'stucco', 'whiteBrick']), {}), accent: M.get('painted', { color: accent }), glass: M.get('glass', { opacity: 0.2 }), trim: M.get('paint', { color: '#f2f0ea' }),
    floor: M.get(rng.pick(['checker', 'floorWood', 'tiles'])), interior: M.get('paint', { color: '#f2ede0' }), roof: M.get('gravel'), awning: M.get('stripes', { color: '#ffffff', color2: accent, p: [5, 0.5, 0.5] }),
    shelf: M.get('wood'), counter: M.get('marble'), goods: M.get('books'), lampShade: M.get('emissive', { color: '#fff0d0', emissiveIntensity: 2 }),
  };
  S.ctx.stage('geometry', 'Building storefront');
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, t = 0.3;
  const doorU = W * 0.72;
  const front = [{ u0: 0.6, u1: doorU - 1.0, v0: 0.6, v1: H - 0.9, kind: 'window' }, { u0: doorU - 0.6, u1: doorU + 0.6, v0: 0, v1: 2.4, kind: 'door' }];
  const fr = wallSegmentsX(b, { x0, x1, z: z1, y0: 0, h: H, t, ext: 'accent', int: 'interior', side: 1, openings: front });
  for (const w of fr) windowFrame(b, w, { frame: 'trim', mullions: 1 });
  wallSegmentsX(b, { x0, x1, z: z0, y0: 0, h: H * floors, t, ext: 'wall', int: 'interior', side: -1 });
  wallSegmentsZ(b, { z0, z1, x: x0, y0: 0, h: H * floors, t, ext: 'wall', int: 'interior', side: -1 });
  wallSegmentsZ(b, { z0, z1, x: x1, y0: 0, h: H * floors, t, ext: 'wall', int: 'interior', side: 1 });
  for (let f = 1; f < floors; f++) {
    const wins = [{ u0: W * 0.2, u1: W * 0.2 + 1.2, v0: 1, v1: 2.8, kind: 'window' }, { u0: W * 0.6, u1: W * 0.6 + 1.2, v0: 1, v1: 2.8, kind: 'window' }];
    const ww = wallSegmentsX(b, { x0, x1, z: z1, y0: H * f, h: H, t, ext: 'wall', int: 'interior', side: 1, openings: wins });
    for (const w of ww) windowFrame(b, w, { frame: 'trim', sill: 'trim' });
    slab(b, x0, z0, x1, z1, H * f - 0.25, 0.25, { py: 'floor', default: 'interior' });
  }
  slab(b, x0, z0, x1, z1, 0, 0.1, { py: 'floor', default: 'trim' });
  flatRoof(b, x0 - t / 2, z0 - t / 2, x1 + t / 2, z1 + t / 2, H * floors, { roof: 'roof', wall: 'wall', coping: 'trim' }, { parapet: 0.8 });
  // Striped awning over the window.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  b.quad('awning', V(x0 + 0.3, H - 0.4, z1 + 1.6), V(x1 - 0.3, H - 0.4, z1 + 1.6), V(x1 - 0.3, H - 0.15, z1 + 0.16), V(x0 + 0.3, H - 0.15, z1 + 0.16), [[0, 0], [W, 0], [W, 1], [0, 1]]);
  b.quad('awning', V(x1 - 0.3, H - 0.45, z1 + 1.6), V(x0 + 0.3, H - 0.45, z1 + 1.6), V(x0 + 0.3, H - 0.2, z1 + 0.16), V(x1 - 0.3, H - 0.2, z1 + 0.16), [[W, 0], [0, 0], [0, 1], [W, 1]]);
  b.box('awning', [x0 + 0.3, H - 0.75, z1 + 1.58], [x1 - 0.3, H - 0.4, z1 + 1.62]);
  // Illuminated sign board.
  const tex = labelTexture(name, { bg: accent, fg: '#f8f0d8', border: '#d8b870', w: 1024, h: 200 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, W * 0.8 * 200 / 1024), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
  sign.position.set(0, H + 0.35, z1 + t / 2 + 0.03);
  S.root.add(sign);
  // Interior: counter, shelves with goods, pendant lamps, a couple of cafe tables.
  S.ctx.stage('interior', 'Stocking shelves');
  b.box({ py: 'counter', default: 'accent' }, [x0 + 1, 0.1, z0 + 2.2], [x0 + W * 0.55, 1.1, z0 + 2.9], { collide: true });
  for (let i = 0; i < 3; i++) {
    const z = z0 + 0.35;
    const xa = x0 + 0.6 + i * (W - 1.2) / 3;
    b.box('shelf', [xa, 0.1, z - 0.2], [xa + (W - 1.2) / 3 - 0.1, 2.4, z + 0.2], { collide: true });
    for (let k = 0; k < 4; k++) b.box('goods', [xa + 0.05, 0.4 + k * 0.5, z + 0.18], [xa + (W - 1.2) / 3 - 0.15, 0.7 + k * 0.5, z + 0.21]);
  }
  for (const x of [x0 + W * 0.3, x0 + W * 0.7]) {
    ocyl(b, 'trim', x, H - 0.8, 0, 0.01, 0.8, 4);
    ocyl(b, 'lampShade', x, H - 1.05, 0, 0.3, 0.3, 14, 0.12);
  }
  if (kind === 'cafe' || kind === 'coffee' || kind === 'bakery' || kind === 'restaurant' || kind === 'pizza' || kind === 'ice') {
    for (const [x, z] of [[x0 + W * 0.3, z1 - 2.2], [x0 + W * 0.3, z1 + 3.2], [x1 - 2, z1 + 3.2]]) {
      placePiece(b, 'table', rng, x, z > z1 ? 0 : 0.1, z, 0, { kind: 'round' });
      for (const s of [-1, 1]) { const ci = placePiece(b, 'chair', rng, x + s * 0.75, z > z1 ? 0 : 0.1, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, {}); S.seats.push(...ci.seats); }
    }
  }
  Object.assign(mats, furnitureMaterials(rng, {}));
  addLight(S, [0, H - 1, 0], '#ffe2b0', 2.4, 10, false);
  addLight(S, [0, H + 0.2, z1 + 1.2], '#ffe2b0', 1.5, 7, true);
  yield;
  return finish(S, mats, { name, height: H * floors + 1, hw: W / 2 + 1.5, hd: D / 2 + 4.5, falloff: 5, paint: [{ type: 'paint', shape: 'rect', x: 0, z: z1 + 2.5, hw: W / 2 + 1, hd: 2.5, yaw: 0, radius: W / 2 + 2, channel: 0, value: 255, falloff: 0.5 }] });
}

// ======================================================================
// Futuristic tower / house
// ======================================================================
function* futuristic(S, house = false) {
  const { a, rng, b, M } = S;
  const neonCol = userColor(a) || rng.pick(['#30e0ff', '#ff40c0', '#80ff60', '#ffb020', '#8060ff']);
  const mats = {
    white: M.get('glossyPlastic', { color: '#f2f4f6' }), panel: M.get('panels', { color: '#e8eaee', color3: neonCol }), dark: M.get('darkPanels', { color3: neonCol }),
    glass: M.get('tintedGlass', { color: '#20303a', opacity: 0.55 }), neon: M.get('emissive', { color: neonCol, emissiveIntensity: 4 }), chrome: M.get('chrome'), floor: M.get('marble', { color: '#f0f0f0' }),
    deck: M.get('concrete', { color: '#d8d8d8' }),
  };
  S.ctx.stage('geometry', house ? 'Printing pods' : 'Twisting tower');
  let top, hw;
  if (house) {
    // Stacked rounded pods cantilevered over a glass ground floor.
    hw = 11;
    b.box({ py: 'floor', default: 'deck' }, [-9, 0, -7], [9, 0.3, 7], { collide: true });
    // Ground floor glass drum.
    ocyl(b, 'glass', 0, 0.3, 0, 5, 3, 32, 5, true);
    ocyl(b, 'chrome', 0, 3.3, 0, 5.1, 0.12, 32);
    for (let i = 0; i < 24; i++) { const ang = (i / 24) * TAU; if (Math.abs(Math.sin(ang / 2)) < 0.12) continue; b.colliders.push({ type: 'box', x: Math.sin(ang) * 5, z: Math.cos(ang) * 5, y0: 0.3, y1: 3.3, hx: 0.7, hz: 0.1, yaw: ang }); }
    // Capsule pods.
    const pods = [[-3, 4.8, 0, 13, 0], [4, 7.9, -1, 10, 0.5]];
    for (const [x, y, z, len, yaw] of pods) {
      const g = new THREE.CapsuleGeometry(1.8, len - 3.6, 8, 24);
      g.rotateZ(Math.PI / 2);
      g.scale(1, 0.85, 1.35);
      b.geometry('white', g, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
      const band = new THREE.CapsuleGeometry(1.83, len - 3.6, 8, 24);
      band.rotateZ(Math.PI / 2); band.scale(1, 0.12, 1.37);
      b.geometry('neon', band, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y - 0.25, z));
      const win = new THREE.CapsuleGeometry(1.82, len - 4.4, 6, 24);
      win.rotateZ(Math.PI / 2); win.scale(0.96, 0.35, 1.36);
      b.geometry('glass', win, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y + 0.35, z));
      b.colliders.push({ type: 'box', x, z, y0: y - 1.55, y1: y + 1.55, hx: len / 2, hz: 2.4, yaw });
    }
    // Support columns + spiral ramp.
    for (const [x, z] of [[-7.5, 0], [8, -2]]) { ocyl(b, 'chrome', x, 0.3, z, 0.25, x < 0 ? 3.2 : 6.2, 12); b.cylCollider(x, z, 0.3, x < 0 ? 3.5 : 6.5, 0.25); }
    spiralStairs(b, 'white', 0, 0, 0.4, 1.6, 0.3, 3.3, 0.9, 0);
    // Infinity pool edge + neon ground strips.
    b.box('neon', [-9, 0.3, 6.9], [9, 0.36, 7]);
    b.box('neon', [-9, 0.3, -7], [9, 0.36, -6.9]);
    addLight(S, [0, 3, 0], '#e0f4ff', 2.5, 12, false);
    addLight(S, [-3, 4.2, 0], neonCol, 2, 10, true);
    top = 10.5;
  } else {
    // Twisting tower of rotated floor plates with neon edges and a glass core.
    const floors = clamp(a.floors || rng.int(18, 36), 5, 80);
    const fh = 3.8, R = rng.range(9, 12);
    const sides = rng.pick([3, 4, 5, 6]);
    const twist = rng.range(1.5, 3.2) / floors;
    hw = R + 5;
    ocyl(b, 'glass', 0, 0, 0, R * 0.55, floors * fh, 24, R * 0.4, true);
    b.cylCollider(0, 0, 0, floors * fh, R * 0.5);
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      const taper = 1 - (f / floors) * 0.35;
      const g = new THREE.CylinderGeometry(R * taper, R * taper, 0.5, sides);
      g.rotateY(f * twist);
      b.geometry(f % 4 === 0 ? 'neon' : 'white', g, new THREE.Matrix4().makeTranslation(0, y + fh, 0));
      const gl = new THREE.CylinderGeometry(R * taper * 0.92, R * taper * 0.92, fh - 0.5, sides, 1, true);
      gl.rotateY(f * twist);
      b.geometry('glass', gl, new THREE.Matrix4().makeTranslation(0, y + fh / 2 + 0.25, 0));
      if ((f & 7) === 7) yield;
    }
    // Crown ring and spire.
    const ring = new THREE.TorusGeometry(R * 0.7, 0.35, 10, 48);
    ring.rotateX(Math.PI / 2);
    b.geometry('neon', ring, new THREE.Matrix4().makeTranslation(0, floors * fh + 3, 0));
    ocyl(b, 'chrome', 0, floors * fh, 0, 0.8, 24, 12, 0.05);
    top = floors * fh + 24;
    addLight(S, [0, 3, R + 1], neonCol, 3, 14, true);
    // Plaza.
    b.box('deck', [-R - 4, 0, -R - 4], [R + 4, 0.2, R + 4], { collide: true });
    for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU; b.box('neon', [Math.sin(ang) * (R + 3) - 0.1, 0.2, Math.cos(ang) * (R + 3) - 0.1], [Math.sin(ang) * (R + 3) + 0.1, 1.1, Math.cos(ang) * (R + 3) + 0.1]); }
    const nameplate = labelTexture(a.label || a.name || rng.pick(['NEXUS', 'AETHER', 'HELIX', 'NOVA ONE', 'ZENITH']), { fg: neonCol, glow: neonCol, w: 1024, h: 256, font: 'Arial, sans-serif' });
    const np = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: nameplate, transparent: true, depthWrite: false }));
    np.position.set(0, 5, R * 0.56 + 0.5);
    S.root.add(np);
  }
  yield;
  return finish(S, mats, { name: house ? 'Futuristic house' : 'Futuristic tower', height: top, hw, hd: hw, falloff: 6 });
}

// ======================================================================
// Alien structure: organic lathe-grown spires with glowing ribs.
// ======================================================================
function* alien(S) {
  const { a, rng, b, M } = S;
  const hue = rng.range(0, 1);
  const glowCol = userColor(a) || hsl(hue + 0.5, 0.9, 0.6);
  const mats = {
    shell: M.get('scales', { color: hsl(hue, 0.35, 0.3), color2: hsl(hue + 0.1, 0.5, 0.18) }), glow: M.get('emissive', { color: glowCol, emissiveIntensity: 3.5 }),
    crystal: M.get('crystal', { color: glowCol, color2: hsl(hue + 0.6, 0.8, 0.4) }), dark: M.plain(hsl(hue, 0.3, 0.08), 0.3, 0.5),
  };
  S.ctx.stage('geometry', 'Growing alien spires');
  const n = rng.int(3, 6);
  let top = 0;
  for (let k = 0; k < n; k++) {
    const main = k === 0;
    const ang = rng.range(0, TAU), dist = main ? 0 : rng.range(6, 11);
    const cx = Math.sin(ang) * dist, cz = Math.cos(ang) * dist;
    const H = main ? rng.range(22, 34) : rng.range(8, 18);
    const R = main ? rng.range(4, 6) : rng.range(1.8, 3.2);
    const pts = [];
    const bulge = rng.range(0.2, 0.5), neck = rng.range(0.3, 0.6);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = R * (1 - t * 0.85) * (1 + bulge * Math.sin(t * Math.PI * 1.2)) * (1 - neck * Math.exp(-Math.pow((t - 0.65) * 7, 2))) + 0.05;
      pts.push(new THREE.Vector2(Math.max(0.05, r), t * H));
    }
    const g = new THREE.LatheGeometry(pts, 28);
    // Organic wobble.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const w = 1 + 0.08 * Math.sin(y * 0.8 + Math.atan2(z, x) * 3 + k);
      pos.setXYZ(i, x * w, y, z * w);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * R, uv.getY(i) * H);
    b.geometry('shell', g, new THREE.Matrix4().makeTranslation(cx, 0, cz));
    b.cylCollider(cx, cz, 0, H * 0.8, R * 0.85);
    // Glowing rib rings.
    for (let r = 1; r < 6; r++) {
      const t = r / 6;
      const rr = pts[Math.round(t * 24)].x * 1.02;
      const tor = new THREE.TorusGeometry(rr, 0.08 + R * 0.015, 8, 32);
      tor.rotateX(Math.PI / 2);
      b.geometry('glow', tor, new THREE.Matrix4().makeTranslation(cx, t * H, cz));
    }
    // Crystal tip.
    const tip = new THREE.OctahedronGeometry(R * 0.35, 0);
    tip.scale(1, 2.5, 1);
    b.geometry('crystal', tip, new THREE.Matrix4().makeTranslation(cx, H + R * 0.6, cz));
    addLight(S, [cx, H * 0.3, cz], glowCol, main ? 4 : 2, main ? 18 : 9, false);
    top = Math.max(top, H + R);
    // Arching bridges to the main spire.
    if (!main) {
      const a0 = new THREE.Vector3(cx, H * 0.5, cz), a1 = new THREE.Vector3(0, H * 0.7, 0);
      const mid = a0.clone().lerp(a1, 0.5).add(new THREE.Vector3(0, 3, 0));
      const curve = new THREE.QuadraticBezierCurve3(a0, mid, a1);
      const tube = new THREE.TubeGeometry(curve, 20, 0.35, 8, false);
      b.geometry('dark', tube, null);
    }
    yield;
  }
  // Entrance arch and pulsing floor sigil.
  const sig = new THREE.Mesh(new THREE.RingGeometry(3, 3.4, 48), mats.glow);
  sig.rotation.x = -Math.PI / 2; sig.position.y = 0.05;
  S.root.add(sig);
  S.updates.push((dt, t) => { sig.material.emissiveIntensity = 2 + Math.sin(t * 2) * 1.5; sig.rotation.z = t * 0.2; });
  return finish(S, mats, { name: 'Alien structure', height: top, hw: 14, hd: 14, falloff: 6, paint: [{ type: 'paint', x: 0, z: 0, radius: 14, channel: 1, value: 180, falloff: 4 }] });
}

// ======================================================================
// Igloo
// ======================================================================
function* igloo(S) {
  const { rng, b, M } = S;
  const R = rng.range(2.4, 3.2);
  const mats = { snow: M.get('snow'), ice: M.get('ice', { color: '#dfeef8' }), fur: M.get('fur', { color: '#e8e0d0' }), glow: M.get('emissive', { color: '#ffb060', emissiveIntensity: 1 }) };
  S.ctx.stage('geometry', 'Cutting snow blocks');
  // Rings of snow blocks with offset seams.
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const phi0 = (r / rows) * Math.PI / 2, phi1 = ((r + 1) / rows) * Math.PI / 2;
    const rr = R * Math.cos((phi0 + phi1) / 2), y = R * Math.sin((phi0 + phi1) / 2);
    const n = Math.max(3, Math.round((TAU * rr) / 0.9));
    for (let i = 0; i < n; i++) {
      const ang = ((i + (r % 2) * 0.5) / n) * TAU;
      if (r < 3 && Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 0.32) continue; // doorway
      const bh = R * (phi1 - phi0) * 0.96;
      obox(b, 'snow', Math.sin(ang) * rr, y, Math.cos(ang) * rr, (TAU * rr) / n * 0.95, bh, 0.45, ang, -((phi0 + phi1) / 2));
    }
  }
  // Collision ring leaving the doorway open.
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * TAU;
    if (Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 0.35) continue;
    b.colliders.push({ type: 'box', x: Math.sin(ang) * R, z: Math.cos(ang) * R, y0: 0, y1: R * 0.8, hx: 0.75, hz: 0.25, yaw: ang });
  }
  // Entrance tunnel.
  const tl = 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 5) * Math.PI;
    obox(b, 'snow', Math.cos(ang) * 0.95, Math.sin(ang) * 0.95 + 0.1, R + tl / 2 - 0.2, 0.55, 0.4, tl, 0, 0, ang - Math.PI / 2);
  }
  b.collider([-1.25, 0, R - 0.2], [-0.95, 1.2, R + tl]);
  b.collider([0.95, 0, R - 0.2], [1.25, 1.2, R + tl]);
  // Warm interior: fur rug and a small lamp glow.
  b.box('fur', [-1.2, 0.02, -1.2], [1.2, 0.06, 0.8]);
  addLight(S, [0, 1, 0], '#ffb060', 2, 5, false, true);
  yield;
  return finish(S, mats, { name: 'Igloo', height: R, hw: R + 0.6, hd: R + tl + 0.5, falloff: 3, paint: [{ type: 'paint', x: 0, z: 0, radius: R + 3, channel: 3, value: 255, falloff: 2 }] });
}

// ======================================================================
// Tent / yurt / hut
// ======================================================================
function* tent(S) {
  const { a, rng, b, M } = S;
  const circus = a.words.includes('circus') || a.words.includes('big top');
  const col = userColor(a) || rng.pick(['#3a6a3a', '#c86a20', '#2a4a8a', '#8a2a2a', '#e8d8b0']);
  const mats = { canvas: M.get('fabric', { color: col, side: THREE.DoubleSide }), canvas2: M.get('fabric', { color: '#f2eee4', side: THREE.DoubleSide }), pole: M.get('wood'), rope: M.plain('#c8b890', 0.9), rug: M.get('rug'), stripes: M.get('stripes', { color: '#f4f0e8', color2: col === '#e8d8b0' ? '#c02020' : col, p: [8, 0.5, 0.5], side: THREE.DoubleSide }) };
  S.ctx.stage('geometry', 'Pitching tent');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let top, hw, hd;
  if (circus) {
    const R = rng.range(9, 12), wallH = 3.4, H = R * 0.9;
    ocyl(b, 'stripes', 0, 0, 0, R, wallH, 32, R, true);
    const cone = new THREE.ConeGeometry(R + 0.3, H - wallH, 32, 1, true);
    const uv = cone.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 16, uv.getY(i) * 2);
    b.geometry('stripes', cone, new THREE.Matrix4().makeTranslation(0, wallH + (H - wallH) / 2, 0));
    ocyl(b, 'pole', 0, 0, 0, 0.2, H + 1.5, 10);
    makeFlag(S.root, 0, H + 1.4, 0, '#e8c020', 1.2, 0.7, 1.5);
    for (let i = 0; i < 20; i++) { const ang = (i / 20) * TAU; if (Math.abs(Math.sin(ang / 2)) < 0.12) continue; b.colliders.push({ type: 'box', x: Math.sin(ang) * R, z: Math.cos(ang) * R, y0: 0, y1: wallH, hx: (TAU * R) / 40 + 0.1, hz: 0.1, yaw: ang }); }
    b.box('rug', [-3, 0.02, -3], [3, 0.05, 3]);
    addLight(S, [0, H * 0.6, 0], '#ffd8a0', 3, 14, false);
    top = H + 3; hw = hd = R + 1.5;
  } else {
    const W = rng.range(2.4, 3.2), L = rng.range(3, 4), H = rng.range(1.8, 2.3);
    b.quad('canvas', V(-W / 2, 0, L / 2), V(0, H, L / 2), V(0, H, -L / 2), V(-W / 2, 0, -L / 2));
    b.quad('canvas', V(0, H, L / 2), V(W / 2, 0, L / 2), V(W / 2, 0, -L / 2), V(0, H, -L / 2));
    b.tri('canvas', V(-W / 2, 0, -L / 2), V(0, H, -L / 2), V(W / 2, 0, -L / 2));
    // Door flaps rolled open at the front.
    b.tri('canvas2', V(-W / 2, 0, L / 2), V(-W * 0.12, H * 0.76, L / 2 + 0.01), V(-W * 0.3, 0, L / 2 + 0.01));
    b.tri('canvas2', V(W / 2, 0, L / 2), V(W * 0.3, 0, L / 2 + 0.01), V(W * 0.12, H * 0.76, L / 2 + 0.01));
    ocyl(b, 'pole', 0, 0, L / 2 + 0.02, 0.03, H + 0.2, 6);
    ocyl(b, 'pole', 0, 0, -L / 2 - 0.02, 0.03, H + 0.2, 6);
    for (const z of [L / 2 + 0.02, -L / 2 - 0.02]) { const s = Math.sign(z); beam(b, 'rope', V(0, H + 0.15, z), V(0, 0, z + s * 1.4), 0.01, 4); }
    for (const [x, z] of [[-W / 2, L / 2], [W / 2, L / 2], [-W / 2, -L / 2], [W / 2, -L / 2]]) beam(b, 'rope', V(x * 0.6, H * 0.4, z), V(x * 1.4, 0, z), 0.008, 4);
    b.box('rug', [-W / 2 + 0.3, 0.02, -L / 2 + 0.2], [W / 2 - 0.3, 0.05, L / 2 - 0.2]);
    b.collider([-W / 2, 0, -L / 2], [-W / 2 + 0.3, H * 0.5, L / 2], { walkable: false });
    b.collider([W / 2 - 0.3, 0, -L / 2], [W / 2, H * 0.5, L / 2], { walkable: false });
    b.collider([-W / 2, 0, -L / 2 - 0.05], [W / 2, H, -L / 2 + 0.05], { walkable: false });
    top = H + 0.2; hw = W / 2 + 1.2; hd = L / 2 + 1.5;
    addLight(S, [0, H * 0.6, 0], '#ffc080', 0.8, 4, true, true);
  }
  yield;
  return finish(S, mats, { name: circus ? 'Circus tent' : 'Tent', height: top, hw, hd, falloff: 2, flatten: circus });
}

function* hut(S) {
  const { a, rng, b, M } = S;
  const R = rng.range(2.4, 3.2), wallH = 2.2;
  const mats = { wall: M.get(rng.pick(['stucco', 'logs', 'plaster']), { color: userColor(a) || '#a88a64' }), roof: M.get('thatch'), wood: M.get('darkWood'), dark: M.plain('#120d08', 0.9), floor: M.get('dirt'), rug: M.get('rug') };
  S.ctx.stage('geometry', 'Weaving thatch');
  ocyl(b, 'wall', 0, 0, 0, R, wallH, 20, R * 0.97, true);
  ocyl(b, 'wall', 0, 0, 0, R - 0.2, wallH, 20, R * 0.97 - 0.2, true);
  for (let i = 0; i < 16; i++) { const ang = (i / 16) * TAU; if (Math.abs(Math.sin(ang / 2)) < 0.14) continue; b.colliders.push({ type: 'box', x: Math.sin(ang) * (R - 0.1), z: Math.cos(ang) * (R - 0.1), y0: 0, y1: wallH, hx: (TAU * R) / 32 + 0.08, hz: 0.12, yaw: ang }); }
  obox(b, 'dark', 0, 0.9, R + 0.01, 0.9, 1.8, 0.1, 0);
  coneRoof(b, 0, 0, wallH - 0.1, R + 0.7, R * 1.3, 'roof', 20);
  for (let i = 0; i < 2; i++) roundWindow(b, 0, 0, R, 1.4, 1.6 + i * 3, 0.5, 0.5, 'dark');
  b.box('rug', [-1, 0.02, -1], [1, 0.04, 1]);
  attachFire(S.root, [0, 0.05, -0.6], 0.35);
  addLight(S, [0, 0.8, -0.6], '#ff9a40', 1.6, 6, false, true);
  yield;
  return finish(S, mats, { name: 'Hut', height: wallH + R * 1.3, hw: R + 1, hd: R + 1, falloff: 3 });
}

// ======================================================================
// Treehouse
// ======================================================================
function* treehouse(S) {
  const { a, rng, b, M } = S;
  const mats = { wood: M.get('planks'), dark: M.get('darkWood'), roof: M.get(rng.pick(['shingles', 'rooftiles', 'thatch'])), rope: M.plain('#b8a070', 0.9), wall: M.get('woodSiding', { color: userColor(a) }), glass: M.get('glass'), frame: M.get('paint', { color: '#f2f0ea' }) };
  S.ctx.stage('geometry', 'Growing the tree');
  // Big oak (non-instanced) at the centre.
  const tree = buildTree('oak', rng.nextU32(), S.detail, { scale: 1.45, height: [12, 14], trunkR: [0.55, 0.65] });
  const tm = treeMaterials('oak', rng.int(0, 1));
  const tg = new THREE.Group();
  if (tree.bark) { const m = new THREE.Mesh(tree.bark, tm.barkMat); m.castShadow = m.receiveShadow = true; tg.add(m); }
  if (tree.leaves) { const m = new THREE.Mesh(tree.leaves, tm.leafMat); m.castShadow = true; m.receiveShadow = true; markNoAO(m); tg.add(m); }
  S.root.add(tg);
  S.extraColliders.push({ type: 'cyl', x: 0, z: 0, y0: 0, y1: 8, r: tree.trunkRadius + 0.05 });
  yield;
  S.ctx.stage('details', 'Building the platform');
  const py = rng.range(4, 5.2), P = 2.6;
  b.box('wood', [-P, py, -P], [P, py + 0.18, P], { collide: true });
  for (const [x, z] of [[-P + 0.2, -P + 0.2], [P - 0.2, -P + 0.2], [-P + 0.2, P - 0.2], [P - 0.2, P - 0.2]]) {
    beam(b, 'dark', new THREE.Vector3(x, py, z), new THREE.Vector3(x * 0.2, py - 1.8, z * 0.2), 0.08, 6);
  }
  // Cabin on the platform with a window and doorway.
  const cw = 1.9, ch = 2.2;
  const y0 = py + 0.18;
  const ww = wallSegmentsX(b, { x0: -cw, x1: cw, z: cw * 0.8, y0, h: ch, t: 0.1, ext: 'wall', side: 1, openings: [{ u0: cw - 0.45, u1: cw + 0.45, v0: 0, v1: 1.9, kind: 'hole' }] });
  void ww;
  wallSegmentsX(b, { x0: -cw, x1: cw, z: -cw * 0.8, y0, h: ch, t: 0.1, ext: 'wall', side: -1 });
  const sw = wallSegmentsZ(b, { z0: -cw * 0.8, z1: cw * 0.8, x: -cw, y0, h: ch, t: 0.1, ext: 'wall', side: -1, openings: [{ u0: cw * 0.8 - 0.4, u1: cw * 0.8 + 0.4, v0: 0.9, v1: 1.6, kind: 'window' }] });
  for (const w of sw) windowFrame(b, w, { frame: 'frame', mullions: 1 });
  wallSegmentsZ(b, { z0: -cw * 0.8, z1: cw * 0.8, x: cw, y0, h: ch, t: 0.1, ext: 'wall', side: 1 });
  gableRoof(b, -cw, -cw * 0.8, cw, cw * 0.8, y0 + ch, THREE.MathUtils.degToRad(38), { roof: 'roof', wall: 'wall', trim: 'dark' }, { overhang: 0.3 });
  railing(b, [[-P, P], [-0.6, P]], y0, 0.9, 'dark', { height: 0.9 });
  railing(b, [[0.6, P], [P, P], [P, -P], [-P, -P], [-P, P]], y0, 0.9, 'dark', { height: 0.9 });
  // Rope ladder (steep climbable stair) at the front gap.
  const n = Math.round(py / 0.3);
  for (let i = 0; i < n; i++) {
    const y = (i + 1) * (py / n), z = P + 0.2 + (n - i) * 0.12;
    b.box('wood', [-0.45, y - 0.04, z - 0.05], [0.45, y, z + 0.05]);
    b.colliders.push({ type: 'box', x: 0, z: z - 0.1, y0: y - 0.2, y1: y, hx: 0.5, hz: 0.2 });
  }
  for (const x of [-0.47, 0.47]) beam(b, 'rope', new THREE.Vector3(x, 0, P + 0.2 + n * 0.12), new THREE.Vector3(x, py + 0.2, P + 0.2), 0.02, 4);
  addLight(S, [0, y0 + ch - 0.4, 0], '#ffd090', 1.4, 6, true);
  // Lantern string.
  for (let i = 0; i < 5; i++) { const s = glowSprite('#ffd070', 0.5, 0.9); s.position.set(-P + i * P / 2, y0 + 1.1 - Math.sin((i / 4) * Math.PI) * 0.2, P); S.root.add(s); }
  yield;
  return finish(S, mats, { name: 'Treehouse', height: tree.height, hw: 5, hd: 5, falloff: 3, flatten: false });
}

// ======================================================================
// Ruins
// ======================================================================
function* ruins(S) {
  const { a, rng, b, M } = S;
  const mats = { stone: M.get(a.materials[0] || rng.pick(['castleStone', 'marble', 'fieldstone']), { color: userColor(a) }), moss: M.get('grass', { color: '#3a5a2a' }), rubble: M.get('rock') };
  S.ctx.stage('geometry', 'Weathering stone');
  const W = rng.range(14, 20), L = rng.range(16, 24);
  const temple = mats.stone.name === 'marble' || rng.chance(0.4);
  // Broken wall runs with jagged tops.
  const walls = [[-W / 2, -L / 2, W / 2, -L / 2], [-W / 2, -L / 2, -W / 2, L / 2], [W / 2, -L / 2, W / 2, L * 0.1], [-W / 2, L / 2, -W * 0.1, L / 2]];
  for (const [ax, az, bx, bz] of walls) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 1.1);
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const h = Math.max(0.3, rng.range(0.2, 1) * (1 - Math.abs(f - rng.range(0.3, 0.7))) * 5.5);
      if (rng.chance(0.12)) continue;
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const alongX = Math.abs(bz - az) < 1e-3;
      const sx = alongX ? len / n + 0.02 : 0.9, sz = alongX ? 0.9 : len / n + 0.02;
      b.box('stone', [x - sx / 2, 0, z - sz / 2], [x + sx / 2, h, z + sz / 2], { collide: true });
      if (rng.chance(0.4)) b.box('moss', [x - sx / 2 - 0.01, h - 0.02, z - sz / 2 - 0.01], [x + sx / 2 + 0.01, h + 0.04, z + sz / 2 + 0.01]);
    }
    yield;
  }
  // Standing and fallen columns.
  if (temple) {
    const cr = 0.5;
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 2 + i * (W - 4) / 5, z = L / 2 - 1.5;
      if (rng.chance(0.35)) {
        // Fallen column drums.
        const ang = rng.range(0, TAU);
        for (let k = 0; k < 3; k++) { const g = new THREE.CylinderGeometry(cr, cr, 1.4, 16); g.rotateZ(Math.PI / 2); b.geometry('stone', g, new THREE.Matrix4().makeRotationY(ang).setPosition(x + Math.cos(ang) * k * 1.5, cr, z + 1.5 + Math.sin(ang) * k * 1.5)); }
        b.colliders.push({ type: 'box', x: x + Math.cos(ang) * 1.5, z: z + 1.5 + Math.sin(ang) * 1.5, y0: 0, y1: cr * 2, hx: 2.2, hz: cr, yaw: -ang });
      } else {
        const h = rng.range(2, 6);
        ocyl(b, 'stone', x, 0, z, cr, h, 16, cr * 0.9);
        b.box('stone', [x - 0.7, 0, z - 0.7], [x + 0.7, 0.3, z + 0.7]);
        b.cylCollider(x, z, 0, h, cr);
      }
    }
  }
  // An intact arch.
  const ax = rng.range(-W / 4, W / 4);
  b.box('stone', [ax - 2.2, 0, L / 2 - 0.5], [ax - 1.4, 4, L / 2 + 0.5], { collide: true });
  b.box('stone', [ax + 1.4, 0, L / 2 - 0.5], [ax + 2.2, 4, L / 2 + 0.5], { collide: true });
  for (let i = 0; i < 9; i++) { const ang = (i / 8) * Math.PI; obox(b, 'stone', ax + Math.cos(ang) * 1.8, 4 + Math.sin(ang) * 1.8, L / 2, 0.8, 0.7, 1, 0, 0, ang - Math.PI / 2); }
  // Rubble.
  const rg = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const geo = buildRock(rng.nextU32(), rng.range(0.2, 0.7), { detail: 2, moss: 0.8 });
    const m = new THREE.Mesh(geo, M.get('stone', { vertexColors: true }));
    m.position.set(rng.range(-W / 2, W / 2), 0, rng.range(-L / 2, L / 2));
    m.rotation.y = rng.range(0, TAU);
    m.castShadow = m.receiveShadow = true;
    rg.add(m);
  }
  S.root.add(rg);
  yield;
  return finish(S, mats, { name: temple ? 'Ancient temple ruins' : 'Ruins', height: 6, hw: W / 2 + 2, hd: L / 2 + 2, falloff: 4, suppressGrass: false, paint: [{ type: 'paint', shape: 'rect', x: 0, z: 0, hw: W / 2, hd: L / 2, yaw: 0, radius: Math.hypot(W, L) / 2, channel: 0, value: 140, falloff: 3 }] });
}

// ======================================================================
// Gazebo
// ======================================================================
function* gazebo(S) {
  const { a, rng, b, M } = S;
  const R = rng.range(2.4, 3.2), H = 2.6, sides = rng.pick([6, 8]);
  const mats = { wood: M.get(userColor(a) ? 'paint' : rng.pick(['paint', 'wood']), { color: userColor(a) || '#f4f2ec' }), floor: M.get('deck'), roof: M.get(rng.pick(['shingles', 'metal', 'slate']), { color: '#3a3e44' }), stone: M.get('fieldstone'), ...furnitureMaterials(rng, {}) };
  S.ctx.stage('geometry', 'Framing gazebo');
  const deck = new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.45, sides);
  b.geometry('floor', deck, new THREE.Matrix4().makeRotationY(Math.PI / sides).setPosition(0, 0.225, 0));
  b.collider([-R * 0.9, 0, -R * 0.9], [R * 0.9, 0.45, R * 0.9]);
  stairs(b, -0.7, 0.7, R, 0, 0.45, 0.5, { default: 'floor' });
  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * TAU;
    const x = Math.sin(ang) * R, z = Math.cos(ang) * R;
    ocyl(b, 'wood', x, 0.45, z, 0.08, H, 8);
    b.cylCollider(x, z, 0.45, 0.45 + H, 0.09);
    const nx = Math.sin(((i + 1) / sides) * TAU) * R, nz = Math.cos(((i + 1) / sides) * TAU) * R;
    if (i !== 0 && i !== sides - 1) railing(b, [[x, z], [nx, nz]], 0.45, 0.9, 'wood', { height: 0.85 });
    // Decorative brackets.
    beam(b, 'wood', new THREE.Vector3(x, 0.45 + H - 0.6, z), new THREE.Vector3((x + nx) / 2 * 0.98, 0.45 + H, (z + nz) / 2 * 0.98), 0.03, 4);
  }
  const roof = new THREE.ConeGeometry(R + 0.8, 1.8, sides, 1, false);
  b.geometry('roof', roof, new THREE.Matrix4().makeRotationY(Math.PI / sides * 0).setPosition(0, 0.45 + H + 0.9, 0));
  ocyl(b, 'wood', 0, 0.45 + H + 1.6, 0, 0.1, 0.8, 8, 0.02);
  // Benches inside.
  for (const ang of [Math.PI * 0.75, -Math.PI * 0.75, Math.PI]) {
    const info = placePiece(b, 'bench', rng, Math.sin(ang) * (R - 0.6), 0.45, Math.cos(ang) * (R - 0.6), ang + Math.PI, {});
    S.seats.push(...info.seats);
  }
  addLight(S, [0, 0.45 + H - 0.3, 0], '#ffd8a0', 1.5, 7, true);
  const lamp = glowSprite('#ffd8a0', 0.6, 0.9);
  lamp.position.set(0, 0.45 + H - 0.3, 0);
  S.root.add(lamp);
  yield;
  return finish(S, mats, { name: 'Gazebo', height: H + 3, hw: R + 1.2, hd: R + 1.5, falloff: 3 });
}

// ======================================================================
// Greenhouse
// ======================================================================
function* greenhouse(S) {
  const { rng, b, M } = S;
  const W = rng.range(5, 7), L = rng.range(8, 12), H = 2.4;
  const mats = { frame: M.get('paint', { color: '#f4f4f0' }), glass: M.get('glass', { color: '#e8f4ec', opacity: 0.18 }), floor: M.get('pavers'), soil: M.get('soil'), wood: M.get('wood'), pot: M.get('rooftiles', { color: '#b8603a' }) };
  S.ctx.stage('geometry', 'Glazing greenhouse');
  const x0 = -W / 2, x1 = W / 2, z0 = -L / 2, z1 = L / 2;
  slab(b, x0, z0, x1, z1, 0, 0.12, { py: 'floor', default: 'floor' });
  // Frame grid.
  for (let z = z0; z <= z1 + 0.01; z += L / Math.round(L / 1.2)) for (const x of [x0, x1]) b.box('frame', [x - 0.04, 0.12, z - 0.04], [x + 0.04, H, z + 0.04]);
  for (let x = x0; x <= x1 + 0.01; x += W / Math.round(W / 1.2)) for (const z of [z0, z1]) b.box('frame', [x - 0.04, 0.12, z - 0.04], [x + 0.04, H, z + 0.04]);
  // Glass walls.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  b.box('glass', [x0 - 0.01, 0.12, z0], [x0 + 0.01, H, z1]);
  b.box('glass', [x1 - 0.01, 0.12, z0], [x1 + 0.01, H, z1]);
  b.box('glass', [x0, 0.12, z0 - 0.01], [x1, H, z0 + 0.01]);
  b.box('glass', [x0, 0.12, z1 - 0.01], [-0.6, H, z1 + 0.01]);
  b.box('glass', [0.6, 0.12, z1 - 0.01], [x1, H, z1 + 0.01]);
  b.box('glass', [-0.6, 2.1, z1 - 0.01], [0.6, H, z1 + 0.01]);
  b.collider([x0 - 0.05, 0, z0], [x0 + 0.05, H, z1]); b.collider([x1 - 0.05, 0, z0], [x1 + 0.05, H, z1]); b.collider([x0, 0, z0 - 0.05], [x1, H, z0 + 0.05]);
  b.collider([x0, 0, z1 - 0.05], [-0.6, H, z1 + 0.05]); b.collider([0.6, 0, z1 - 0.05], [x1, H, z1 + 0.05]);
  const ridge = H + W * 0.35;
  b.quad('glass', V(x0, H, z1), V(0, ridge, z1), V(0, ridge, z0), V(x0, H, z0));
  b.quad('glass', V(0, ridge, z1), V(x1, H, z1), V(x1, H, z0), V(0, ridge, z0));
  b.tri('glass', V(x0, H, z1), V(x1, H, z1), V(0, ridge, z1));
  b.tri('glass', V(x1, H, z0), V(x0, H, z0), V(0, ridge, z0));
  for (let z = z0; z <= z1 + 0.01; z += L / Math.round(L / 1.2)) { beam(b, 'frame', V(x0, H, z), V(0, ridge, z), 0.035, 4); beam(b, 'frame', V(x1, H, z), V(0, ridge, z), 0.035, 4); }
  b.box('frame', [-0.05, ridge - 0.05, z0], [0.05, ridge + 0.05, z1]);
  // Planting tables with pots and plants.
  S.ctx.stage('interior', 'Potting plants');
  const plants = new THREE.Group();
  for (const s of [-1, 1]) {
    const tx = s * (W / 2 - 0.6);
    b.box('wood', [tx - 0.45, 0.8, z0 + 0.5], [tx + 0.45, 0.86, z1 - 0.8], { collide: true });
    for (let z = z0 + 0.8; z < z1 - 1; z += 0.55) {
      ocyl(b, 'pot', tx, 0.86, z, 0.14, 0.22, 10, 0.18);
      b.box('soil', [tx - 0.13, 1.06, z - 0.13], [tx + 0.13, 1.07, z + 0.13]);
      const sp = rng.pick(['bush', 'bush', 'cherry']);
      if (rng.chance(0.8)) gardenTree(plants, rng, tx, z, sp === 'cherry' ? 'bush' : sp, rng.range(0.25, 0.4)).y0 = 0;
    }
  }
  plants.children.forEach((c) => { c.position.y += 1.06; });
  S.root.add(plants);
  yield;
  return finish(S, mats, { name: 'Greenhouse', height: ridge, hw: W / 2 + 1, hd: L / 2 + 1.5, falloff: 3 });
}

// ======================================================================
// Dispatcher
// ======================================================================
export function* buildSpecial(ctx, item, rng, style, env) {
  const S = makeState(ctx, item, rng);
  ctx.stage('plan', 'Designing ' + style);
  yield;
  switch (style) {
    case 'skyscraper': return yield* skyscraper(S);
    case 'castle': return yield* castle(S);
    case 'tower': return yield* tower(S, 'tower');
    case 'lighthouse': return yield* tower(S, 'lighthouse');
    case 'windmill': return yield* windmill(S);
    case 'church': return yield* church(S);
    case 'greek': return yield* greekTemple(S);
    case 'japanese': return yield* japanese(S);
    case 'pyramid': return yield* pyramid(S);
    case 'barn': return yield* barn(S);
    case 'shop': return yield* shop(S);
    case 'futuristic': return yield* futuristic(S, false);
    case 'futuristicHouse': return yield* futuristic(S, true);
    case 'alien': return yield* alien(S);
    case 'igloo': return yield* igloo(S);
    case 'tent': return yield* tent(S);
    case 'hut': return yield* hut(S);
    case 'treehouse': return yield* treehouse(S);
    case 'ruins': return yield* ruins(S);
    case 'gazebo': return yield* gazebo(S);
    case 'greenhouse': return yield* greenhouse(S);
    default: return yield* buildHouse(ctx, item, rng, 'suburban');
  }
  void env;
}

// Shared kit for the hand-built institutional landmarks of line 280 (hospitals, universities,
// the military academy, schools, nurseries): window-grid facade textures whose bays are snapped
// to each wall so no window is cut at a corner, cornice ledges that follow any footprint,
// roof parapets and plant, lettered signs, bar fences, entrance canopies. Everything is
// procedural (canvas drawing), merged per material through LandmarkGeometry's MeshBuilder.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { orient, makeCanvas, toTexture, cached, pointInPoly, bbox } from './LandmarkGeometry.js';
import { facadeEdge } from './LandmarkFacade.js';

// ------------------------------------------------------------------ small helpers
export const ground = (world, pts) => {
  let mn = Infinity, mx = -Infinity, sum = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const h = world.hf.heightAt(pts[2 * i], pts[2 * i + 1]);
    mn = Math.min(mn, h); mx = Math.max(mx, h);
    sum += h;
  }
  return { avg: sum / n, min: mn, max: mx };
};
export const done = (b, M, x, z) => ({ x, z, meshes: b.meshes(M.m), tris: b.triangles });
export const rad = (d) => (d * Math.PI) / 180;

/** Edges of a polygon (positive area) with unit tangent t and outward normal n. */
export function edgesOf(poly) {
  const p = orient(poly);
  const n = p.length / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-4) continue;
    out.push({ i, ax, az, bx, bz, L, tx: (bx - ax) / L, tz: (bz - az) / L, nx: (bz - az) / L, nz: -(bx - ax) / L, yaw: Math.atan2((bz - az) / L, -(bx - ax) / L) });
  }
  return out;
}

/** Register a material once per LandmarkMaterials instance. */
export function mat(M, key, make) {
  if (!M.m[key]) M.m[key] = make();
  return M.m[key];
}

const S = THREE.MeshStandardMaterial;
export const std = (o) => new S(o);

/** Fine speckle noise over a canvas region. */
function speckle(g, w, h, rnd, amount, density = 0.05) {
  const cnt = Math.floor(w * h * density);
  for (let i = 0; i < cnt; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${amount * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + (rnd() < 0.3 ? 1 : 0), 1);
  }
}

// ------------------------------------------------------------------ facade textures
/**
 * Window-grid facade tile of `bays` x `floors` cells. style: 'ribbon' (horizontal strip window per
 * bay with a spandrel panel under it: 1970s institutional), 'punched' (one window per bay with a
 * surround), 'double' (two windows per bay), 'arch' (arched windows with keystones). Returns
 * {map, emissive, w, h} like LandmarkGeometry.facadeTexture; bay geometry is also returned in
 * `inst` so bayRing() can snap whole bays to every wall.
 */
export function instFacadeTexture(key, spec) {
  return cached(key, () => {
    const s = {
      bayW: 3.3, floorH: 3.3, bays: 6, floors: 2, ppm: 30, style: 'ribbon',
      wall: '#ddd5bf', pier: '#d3cab2', spandrel: '#cdc3a8', band: null, bandH: 0.28,
      glass: '#46576a', glass2: '#9db0bf', frame: '#ece8dc', reveal: 'rgba(40,36,30,0.55)', sill: '#d8d0bc',
      win: [2.3, 1.55], sillY: 0.92, mull: 3, fr: 0.05, blind: 0.25, lit: 0.3, litWarm: 0.7, seed: 7, grime: 0.07,
      surround: null, lintel: false, keystone: false, ashlar: null, rustic: null, shutter: null,
      ...spec,
    };
    const W = Math.round(s.bayW * s.bays * s.ppm), H = Math.round(s.floorH * s.floors * s.ppm);
    const px = s.ppm;
    // lit pattern is shared by the day (blinds drawn) and night (glow) textures
    const rnd0 = mulberry32(s.seed * 31 + 5);
    const cells = [];
    for (let i = 0; i < s.bays * s.floors; i++) cells.push({ lit: rnd0() < s.lit, warm: rnd0(), blind: rnd0() < s.blind, blindH: 0.25 + rnd0() * 0.6, curtain: rnd0() < 0.3, open: rnd0() < 0.04 });
    const winRect = (f, b, k = 0, cnt = 1) => {
      const bx = b * s.bayW * px;
      const ww = s.win[0] * px, wh = s.win[1] * px;
      let x, w;
      if (s.style === 'ribbon') { const m = (s.bayW - s.win[0]) / 2 * px; x = bx + m; w = ww; }
      else if (s.style === 'double') { const gap = (s.bayW - 2 * s.win[0]) / 3 * px; x = bx + gap + k * (ww + gap); w = ww; }
      else { x = bx + (s.bayW * px - ww) / 2; w = ww; }
      const y = H - ((f * s.floorH + s.sillY) * px + wh);
      return { x, y, w, h: wh };
    };
    const nWin = s.style === 'double' ? 2 : 1;
    const draw = (night) => {
      const [c, g] = makeCanvas(W, H);
      const rnd = mulberry32(s.seed + (night ? 99 : 1));
      if (night) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); } else {
        g.fillStyle = s.wall; g.fillRect(0, 0, W, H);
        speckle(g, W, H, rnd, 0.1, 0.06);
        if (s.ashlar) {
          g.strokeStyle = s.ashlar.line || 'rgba(0,0,0,0.10)'; g.lineWidth = 1;
          const ch = s.ashlar.h * px, cw = s.ashlar.w * px;
          let row = 0;
          for (let y = 0; y < H; y += ch, row++) {
            g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
            for (let x = (row % 2) * cw / 2; x < W; x += cw) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + ch); g.stroke(); }
          }
        }
        // piers: a slightly different tone at every bay boundary (half on each side, so any cut is symmetric)
        if (s.pier && s.style !== 'ribbon') {
          g.fillStyle = s.pier;
          const pw = (s.bayW - s.win[0] * (s.style === 'double' ? 2.4 : 1.5)) * px * 0.5;
          if (pw > 2) for (let b = 0; b <= s.bays; b++) { g.fillRect(b * s.bayW * px - pw / 2, 0, pw, H); }
        }
        if (s.style === 'ribbon') {
          // spandrel panels under the strip windows and slim piers between bays
          for (let f = 0; f < s.floors; f++) for (let b = 0; b < s.bays; b++) {
            const r = winRect(f, b);
            g.fillStyle = s.spandrel;
            g.fillRect(b * s.bayW * px, r.y + r.h, s.bayW * px, H - (f * s.floorH) * px - (r.y + r.h));
            g.fillStyle = s.pier;
            g.fillRect(b * s.bayW * px - 1.5, r.y - s.fr * px, 3, r.h + s.fr * px * 2);
          }
          // slab edge between floors
          g.fillStyle = s.slabCol || 'rgba(255,255,255,0.30)';
          for (let f = 0; f <= s.floors; f++) g.fillRect(0, H - f * s.floorH * px - 0.1 * px, W, 0.2 * px);
          g.fillStyle = 'rgba(0,0,0,0.10)';
          for (let f = 0; f <= s.floors; f++) g.fillRect(0, H - f * s.floorH * px + 0.1 * px, W, 1.5);
        }
        if (s.rustic) { // horizontal grooves on the lower floor(s)
          g.fillStyle = 'rgba(0,0,0,0.13)';
          for (let y = 0; y < s.rustic.floors * s.floorH * px; y += s.rustic.h * px) g.fillRect(0, H - y - 1, W, 1.5);
        }
      }
      let ci = 0;
      for (let f = 0; f < s.floors; f++) {
        for (let b = 0; b < s.bays; b++, ci++) {
          const cell = cells[ci];
          for (let k = 0; k < nWin; k++) {
            const r = winRect(f, b, k);
            if (night) {
              if (!cell.lit) continue;
              const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
              gr.addColorStop(0, cell.warm < s.litWarm * 0.6 ? '#f2c680' : cell.warm < s.litWarm ? '#f7e0b4' : '#cfe0ff');
              gr.addColorStop(1, cell.warm < s.litWarm * 0.6 ? '#7a5128' : cell.warm < s.litWarm ? '#8a6e55' : '#56627a');
              g.fillStyle = gr;
              const fr = s.fr * px;
              g.fillRect(r.x + fr, r.y + fr, r.w - 2 * fr, r.h - 2 * fr);
              if (cell.curtain) { g.fillStyle = 'rgba(40,28,18,0.5)'; g.fillRect(r.x + fr, r.y + fr, (r.w - 2 * fr) * 0.3, r.h - 2 * fr); g.fillRect(r.x + r.w - fr - (r.w - 2 * fr) * 0.3, r.y + fr, (r.w - 2 * fr) * 0.3, r.h - 2 * fr); }
              continue;
            }
            paintWindow(g, r, s, cell, rnd, f === s.floors - 1 && s.style === 'arch');
          }
        }
      }
      if (s.band && !night) {
        g.fillStyle = s.band;
        for (let f = 0; f <= s.floors; f++) g.fillRect(0, H - f * s.floorH * px - (f === 0 ? s.bandH * px : 0) - (f === s.floors ? 0 : 0.5 * s.bandH * px), W, s.bandH * px);
      }
      if (!night && s.grime) { // rain streaks under sills
        for (let i = 0; i < W / 6; i++) {
          const x = rnd() * W, y = rnd() * H;
          const gr = g.createLinearGradient(x, y, x, y + 40 + rnd() * 60);
          gr.addColorStop(0, `rgba(60,55,45,${s.grime * rnd()})`); gr.addColorStop(1, 'rgba(60,55,45,0)');
          g.fillStyle = gr; g.fillRect(x, y, 1 + rnd() * 2, 80);
        }
      }
      return toTexture(c);
    };
    return { map: draw(false), emissive: draw(true), w: s.bayW * s.bays, h: s.floorH * s.floors, inst: { bayW: s.bayW, bays: s.bays, floorH: s.floorH, floors: s.floors }, spec: s };
  });
}

function paintWindow(g, r, s, cell, rnd, topFloorArch) {
  const px = s.ppm, fr = Math.max(2, s.fr * px);
  const arch = s.style === 'arch';
  const path = (x, y, w, h, a) => {
    g.beginPath();
    if (a) { const rr = w / 2; g.moveTo(x, y + h); g.lineTo(x, y + rr); g.arc(x + rr, y + rr, rr, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); } else g.rect(x, y, w, h);
  };
  // surround / lintel / keystone for the stone styles
  if (s.surround) {
    g.fillStyle = s.surround;
    const sw = s.surroundW ? s.surroundW * px : fr * 2.2;
    path(r.x - sw, r.y - sw, r.w + 2 * sw, r.h + sw * 1.2, arch);
    g.fill();
    if (s.keystone && arch) { g.fillStyle = s.surroundDark || s.surround; g.fillRect(r.x + r.w / 2 - fr * 1.4, r.y - sw - fr * 1.2, fr * 2.8, fr * 3.6); }
    if (s.lintel && !arch) { g.fillStyle = s.surround; g.fillRect(r.x - sw * 1.6, r.y - sw * 1.9, r.w + sw * 3.2, sw * 0.9); }
  }
  g.fillStyle = s.reveal;
  path(r.x - 1, r.y - 1, r.w + 2, r.h + 2, arch);
  g.fill();
  g.fillStyle = s.frame;
  path(r.x, r.y, r.w, r.h, arch);
  g.fill();
  const n = s.mull;
  const gw = (r.w - fr * (n + 1)) / n;
  for (let k = 0; k < n; k++) {
    const x = r.x + fr + k * (gw + fr);
    const ft = Math.round(r.h * 0.26);
    const panes = arch && k === 0 && n === 1 ? [[r.y + fr, r.h - 2 * fr]] : [[r.y + fr, ft - fr * 0.5], [r.y + ft + fr * 0.5, r.h - ft - fr * 1.5]];
    for (const [py, ph] of panes) {
      const gr = g.createLinearGradient(0, py, 0, py + ph);
      gr.addColorStop(0, s.glass2); gr.addColorStop(1, s.glass);
      g.fillStyle = gr;
      if (arch && n === 1) path(x, py, gw, ph + (r.y + r.h - py - ph) * 0, true); else g.rect(x, py, gw, ph);
      g.fill();
      // slanted sky highlight
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath(); g.moveTo(x, py + ph); g.lineTo(x + gw * 0.55, py); g.lineTo(x + gw * 0.8, py); g.lineTo(x + gw * 0.25, py + ph); g.closePath(); g.fill();
      // blinds or curtain in some windows
      if (cell.blind && ph > 8) {
        g.fillStyle = cell.curtain ? 'rgba(235,225,200,0.78)' : 'rgba(225,222,212,0.82)';
        g.fillRect(x, py, gw, ph * cell.blindH);
        if (!cell.curtain) { g.fillStyle = 'rgba(120,115,105,0.5)'; for (let yy = py + 3; yy < py + ph * cell.blindH; yy += 3) g.fillRect(x, yy, gw, 0.6); }
      }
    }
  }
  // sill
  if (s.sill && !arch) {
    g.fillStyle = s.sill;
    g.fillRect(r.x - fr * 0.9, r.y + r.h, r.w + fr * 1.8, fr * 0.9);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(r.x - fr * 0.9, r.y + r.h + fr * 0.9, r.w + fr * 1.8, 1.2);
  }
  if (s.shutter) {
    g.fillStyle = s.shutter;
    g.fillRect(r.x - fr * 5, r.y, fr * 4.2, r.h); g.fillRect(r.x + r.w + fr * 0.8, r.y, fr * 4.2, r.h);
  }
}

/** Register a lit facade material (night glow). Returns the facade spec. */
export function facadeMat(M, key, spec, rough = 0.85) {
  if (M.m[key]) return M.m[key].userData.inst;
  const t = instFacadeTexture('in:' + key, spec);
  M.facade(key, t, rough);
  M.m[key].userData.inst = t.inst;
  M.m[key].userData.spec = t.spec;
  return t.inst;
}

const lin = (hex) => new THREE.Color(hex);

/**
 * The real-geometry version of a facadeMat spec (LandmarkFacade.js): openings with reveals, frames,
 * mullions and sills, stone surrounds, rusticated lower floors, slab bands on ribbon facades.
 */
function realSpec(M, key) {
  const mat = M.m[key];
  if (mat.userData.real) return mat.userData.real;
  const s = mat.userData.spec;
  const ribbon = s.style === 'ribbon', arch = s.style === 'arch', dbl = s.style === 'double';
  const wall = M.lf(s.ashlar ? 'ashlar' : 'plaster', ribbon ? s.spandrel : s.wall, s.seed);
  const trim = M.lf('trim', s.surround || s.sill || s.pier || s.wall, s.seed + 1);
  const g2 = lin(s.glass2 || '#a2b4c2');
  const real = {
    wall, wallTile: M.tile(wall), bayW: dbl ? s.bayW / 2 : s.bayW, endPier: 0.3,
    depth: ribbon ? 0.16 : s.ashlar ? 0.32 : 0.24,
    frame: M.lfColor(s.frame, 0.45, 0.1), glass: M.lfGlass('public', g2.getHex()), sill: M.lf('trim', s.sill || s.wall, s.seed + 2), reveal: wall,
    surround: s.surround ? { w: s.surroundW || 0.12, d: 0.05, key: trim, head: s.keystone && arch ? 'keystone' : s.lintel ? 'cornice' : null } : null,
    win: { w: s.win[0], h: s.win[1], sill: s.sillY, arch, cols: s.mull, rows: s.win[1] > 1.4 ? 2 : 1, frameW: Math.max(0.04, s.fr) },
    rustic: s.rustic ? { floors: s.rustic.floors, key: M.lf('rustic', s.wall, s.seed + 3) } : null,
    band: ribbon ? { h: 0.22, d: 0.07, key: M.lf('trim', s.pier || s.wall, s.seed + 4) } : s.band ? { h: s.bandH, d: 0.06, key: M.lf('trim', s.band, s.seed + 5) } : null,
    floorH: s.floorH,
  };
  if (real.rustic) M.tiles = { ...(M.tiles || {}), [real.rustic.key]: M.tile(real.rustic.key) };
  mat.userData.real = real;
  return real;
}

// ------------------------------------------------------------------ plain materials with tint
export function plasterMat(M, key, base, amount = 0.1, rough = 0.9) {
  return mat(M, key, () => {
    const t = cached('in:pl:' + key, () => {
      const [c, g] = makeCanvas(128, 128);
      g.fillStyle = base; g.fillRect(0, 0, 128, 128);
      speckle(g, 128, 128, mulberry32(key.length * 13 + 3), amount, 0.22);
      return toTexture(c);
    });
    return new S({ map: t, roughness: rough });
  });
}

/** Brick / stone block wall texture, tile 4 x 4 m. */
export function blockMat(M, key, { base = '#b4694d', joint = 'rgba(40,25,15,0.35)', w = 0.25, h = 0.075, seed = 3, rough = 0.9, tone = 0.16 } = {}) {
  return mat(M, key, () => {
    const t = cached('in:bl:' + key, () => {
      const ppm = 64, size = 4 * ppm;
      const [c, g] = makeCanvas(size, size);
      g.fillStyle = base; g.fillRect(0, 0, size, size);
      const rnd = mulberry32(seed);
      const bh = h * ppm, bw = w * ppm;
      let row = 0;
      for (let y = 0; y < size; y += bh, row++) for (let x = (row % 2) * bw / 2 - bw; x < size; x += bw) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,235,210' : '30,10,5'},${rnd() * tone})`;
        g.fillRect(x, y, bw, bh);
      }
      g.fillStyle = joint;
      for (let y = 0; y < size; y += bh) g.fillRect(0, y, size, 1);
      row = 0;
      for (let y = 0; y < size; y += bh, row++) for (let x = (row % 2) * bw / 2; x < size; x += bw) g.fillRect(x, y, 1, bh);
      return toTexture(c);
    });
    return new S({ map: t, roughness: rough });
  });
}

// ------------------------------------------------------------------ geometry on footprints
/** Wall bands with whole bays: every edge gets round(L / bayW) bays of the facade material `key`. */
export function bayRing(b, M, key, poly, y0, nFloors, o = {}) {
  const edges = edgesOf(poly);
  for (const e of edges) {
    const k = typeof key === 'function' ? key(e) : key;
    if (!k) continue;
    if (M.m[k].userData.spec && !o.flat && M.realFacades !== false) {
      // real openings in the wall instead of the painted grid
      const R = realSpec(M, k);
      const storeys = [];
      for (let f = 0; f < nFloors; f++) storeys.push({ h: R.floorH, win: R.win, wall: R.rustic && f < R.rustic.floors ? R.rustic.key : undefined });
      const bands = R.band ? storeys.slice(1).map((_, f) => ({ y: (f + 1) * R.floorH - R.band.h / 2, h: R.band.h, d: R.band.d, key: R.band.key })) : [];
      facadeEdge(b, e.ax, e.az, e.bx, e.bz, y0, { ...R, storeys, height: nFloors * R.floorH, bands, tiles: M.tiles }, 0, (o.seed || 7) * 97 + e.i);
      continue;
    }
    const s = M.m[k].userData.inst;
    const nb = Math.max(1, Math.round(e.L / s.bayW));
    const h = nFloors * s.floorH;
    b.wall(k, e.ax, e.az, e.bx, e.bz, y0, y0 + h, o.u0 || 0, (o.u0 || 0) + nb / s.bays, 0, nFloors / s.floors);
  }
}

/** Horizontal ledge (cornice, plinth, string course) projecting d metres out of every wall of a footprint. */
export function ledge(b, key, poly, y0, h, d, o = {}) {
  const tw = o.tw || 4, th = o.th || 4;
  for (const e of edgesOf(poly)) {
    if (o.skip && o.skip(e)) continue;
    const ext = o.ext ?? d;
    const A = [e.ax - e.tx * ext, e.az - e.tz * ext], B = [e.bx + e.tx * ext, e.bz + e.tz * ext];
    const Ao = [A[0] + e.nx * d, A[1] + e.nz * d], Bo = [B[0] + e.nx * d, B[1] + e.nz * d];
    b.wall(key, Ao[0], Ao[1], Bo[0], Bo[1], y0, y0 + h, 0, e.L / tw, 0, h / th);
    if (o.top !== false) b.cap(o.topKey || key, [A[0], A[1], B[0], B[1], Bo[0], Bo[1], Ao[0], Ao[1]], y0 + h, { s: tw });
    if (o.bottom !== false && d > 0.05) b.cap(key, [A[0], A[1], B[0], B[1], Bo[0], Bo[1], Ao[0], Ao[1]], y0, { up: false, s: tw });
  }
}

/** Flat roof with a parapet, coping and a few plant boxes. */
export function roofTop(b, poly, y, o = {}) {
  const par = o.parapet ?? 0.8;
  b.cap(o.roofKey || 'roofBitumen', poly, y, { s: 4 });
  b.ring(o.parapetKey || 'concrete', poly, y, y + par, { tw: 4, th: 4 });
  ledge(b, o.copingKey || 'stoneTrim', poly, y + par - 0.08, 0.1, 0.08, { top: true, bottom: false });
  if (o.plant) roofPlant(b, poly, y, o.plant);
}

/** Lift/stair housings, AC units, vent stacks and an antenna scattered on a roof (deterministic). */
export function roofPlant(b, poly, y, { n = 5, seed = 3, inset = 3, maxH = 3, antenna = false, housing = 'concrete' } = {}) {
  const rnd = mulberry32(seed);
  const bb = bbox(poly);
  let placed = 0, tries = 0;
  while (placed < n && tries++ < 400) {
    const x = bb.x0 + rnd() * bb.w, z = bb.z0 + rnd() * bb.d;
    const w = 2 + rnd() * 4, d = 2 + rnd() * 3;
    const pts = [[x - w, z - d], [x + w, z - d], [x + w, z + d], [x - w, z + d]];
    let inside = true;
    for (const [px, pz] of pts) { if (!pointInPoly(poly, px, pz)) inside = false; }
    if (!inside) continue;
    // keep away from the edges
    const m = inset;
    const ins = [[x - w - m, z - d - m], [x + w + m, z - d - m], [x + w + m, z + d + m], [x - w - m, z + d + m]].every(([px, pz]) => pointInPoly(poly, px, pz));
    if (!ins) continue;
    const k = rnd();
    if (k < 0.35) b.box(housing, x, y, z, w, 1.8 + rnd() * (maxH - 1.5), d, 0, { tw: 4, th: 4 });
    else if (k < 0.7) { b.box('galv', x, y, z, w * 0.7, 1.1, d * 0.6, 0, {}); b.cyl('steelDark', x - w * 0.2, y + 1.1, z, 0.5, 0.5, 0.25, 10); }
    else b.cyl('galv', x, y, z, 0.35, 0.3, 2.4 + rnd() * 1.5, 8);
    placed++;
  }
  if (antenna) {
    const c = [bb.x0 + bb.w * 0.5, bb.z0 + bb.d * 0.5];
    if (pointInPoly(poly, c[0], c[1])) { b.cyl('steel', c[0], y, c[1], 0.12, 0.05, 7, 6); b.box('white', c[0] + 0.3, y + 5.5, c[1], 0.5, 1.2, 0.12, 0, {}); }
  }
}

/** Plinth (stone base) along the walls from y0 up to y1, projecting a little. */
export function plinth(b, key, poly, y0, y1, d = 0.12) {
  ledge(b, key, poly, y0, y1 - y0, d, { top: true, bottom: false, tw: 3, th: 3 });
}

// ------------------------------------------------------------------ lettering and signs
/** Sign material from a canvas drawing. lines: see LandmarkGeometry.signTexture. glow = emissive at night. */
export function signMat(M, key, { w = 512, h = 128, bg = null, lines, glow = true, alpha = false, rough = 0.5, family, draw = null }) {
  return mat(M, key, () => {
    const [c, g] = makeCanvas(w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.textBaseline = 'middle';
    for (const ln of lines || []) {
      let size = ln.size || 40;
      const weight = ln.weight || 700;
      const font = (sz) => `${weight} ${sz}px ${ln.family || family || 'Roboto, Arial, "Helvetica Neue", "DejaVu Sans", sans-serif'}`;
      g.font = font(size);
      while (g.measureText(ln.text).width > (ln.max || w - 16) && size > 8) { size -= 2; g.font = font(size); }
      g.fillStyle = ln.color || '#fff';
      g.textAlign = ln.align || 'center';
      g.fillText(ln.text, ln.align === 'left' ? (ln.x ?? 10) : ln.align === 'right' ? w - (ln.x ?? 10) : (ln.x ?? w / 2), ln.y ?? h / 2);
    }
    if (draw) draw(g, w, h);
    const t = toTexture(c, { repeat: false, aniso: 8 });
    const m = new S({ map: t, roughness: rough, emissiveMap: glow ? t : null, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: 0, alphaTest: alpha ? 0.45 : 0, side: alpha ? THREE.DoubleSide : THREE.FrontSide });
    if (glow) M.night.push(m);
    return m;
  });
}

/** A sign quad centred at local (cx, cy, cz) facing +z of the current frame. */
export function signQuad(b, key, cx, cy, cz, w, h) {
  b.quad(key, [cx - w / 2, cy - h / 2, cz], [cx + w / 2, cy - h / 2, cz], [cx + w / 2, cy + h / 2, cz], [cx - w / 2, cy + h / 2, cz]);
}

// ------------------------------------------------------------------ bar fence with posts
/**
 * Fence strip along a polyline (flat [x, z, ...]) following the terrain. Uses an alpha-tested bar
 * texture (one quad per 2.4 m) plus posts. o: {h, post (spacing), key, y, off}
 */
export function fenceMat(M, key = 'decalFence', { bars = '#2f3a33', rail = '#2a332d', tile = 1.2, h = 1.6, spear = true } = {}) {
  return mat(M, key, () => {
    const t = cached('in:fence:' + key + bars, () => {
      const W = 128, H = 128;
      const [c, g] = makeCanvas(W, H);
      g.clearRect(0, 0, W, H);
      g.fillStyle = bars;
      const n = Math.round(tile / 0.12);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (W / n);
        g.fillRect(x - 1.5, H * 0.1, 3, H * 0.9);
        if (spear) { g.beginPath(); g.moveTo(x - 3, H * 0.12); g.lineTo(x, 0); g.lineTo(x + 3, H * 0.12); g.closePath(); g.fill(); }
      }
      g.fillStyle = rail;
      g.fillRect(0, H * 0.14, W, 5); g.fillRect(0, H * 0.82, W, 5);
      return toTexture(c);
    });
    return new S({ map: t, roughness: 0.6, metalness: 0.3, alphaTest: 0.5, side: THREE.DoubleSide });
  });
}

export function fenceRun(b, y, pts, { key = 'decalFence', h = 1.6, tile = 1.2, post = 4, postKey = 'steelDark', plinthH = 0, plinthKey = 'concrete', maxStep = 3 } = {}) {
  let acc = 0;
  for (let i = 0; i + 3 < pts.length + 0; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const n = Math.max(1, Math.ceil(L / maxStep));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = y(x0, z0), y1 = y(x1, z1);
      const u0 = (acc + L * t0) / tile, u1 = (acc + L * t1) / tile;
      b.quad(key, [x0, y0 + plinthH, z0], [x1, y1 + plinthH, z1], [x1, y1 + plinthH + h, z1], [x0, y0 + plinthH + h, z0], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      if (plinthH > 0) {
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        b.quad(plinthKey, [x0, y0 - 0.2, z0], [x1, y1 - 0.2, z1], [x1, y1 + plinthH, z1], [x0, y0 + plinthH, z0], [[u0, 0], [u1, 0], [u1, 0.3], [u0, 0.3]]);
        b.quad(plinthKey, [x1 - tz * 0.15, y1 - 0.2, z1 + tx * 0.15], [x0 - tz * 0.15, y0 - 0.2, z0 + tx * 0.15], [x0 - tz * 0.15, y0 + plinthH, z0 + tx * 0.15], [x1 - tz * 0.15, y1 + plinthH, z1 + tx * 0.15], [[u0, 0], [u1, 0], [u1, 0.3], [u0, 0.3]]);
      }
    }
    // posts
    const np = Math.max(1, Math.round(L / post));
    for (let k = 0; k <= np; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / np;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      b.box(postKey, px, y(px, pz) + plinthH - 0.1, pz, 0.12, h + 0.2, 0.12, 0, { tw: 2, th: 2 });
    }
    acc += L;
  }
}

// ------------------------------------------------------------------ entrance canopy on columns
/**
 * Flat canopy slab on slim columns, in the current frame: centred at x = 0, front edge at z = d,
 * reaching back to z = 0, slab underside at height y. Fascia strip with `fascia` material.
 */
export function canopy(b, { w, d, y, th = 0.45, cols = 4, colR = 0.2, slab = 'concrete', fascia = null, colKey = 'steel', colInset = 0.5, lights = true }) {
  b.box(slab, 0, y, d / 2, w, th, d, 0, { tw: 4, th: 4, bottom: true });
  if (fascia) b.box(fascia, 0, y + 0.02, d - 0.03, w + 0.04, th - 0.04, 0.08, 0, { top: false });
  const nc = Math.max(2, cols);
  for (let i = 0; i < nc; i++) {
    const x = -w / 2 + colInset + (i * (w - 2 * colInset)) / (nc - 1);
    b.cyl(colKey, x, 0, d - colInset, colR, colR, y, 12);
  }
  if (lights) for (let i = 0; i < Math.max(2, Math.round(w / 3)); i++) {
    const x = -w / 2 + (i + 0.5) * (w / Math.max(2, Math.round(w / 3)));
    b.box('lamp', x, y - 0.03, d * 0.7, 0.5, 0.04, 0.5, 0, {});
  }
}

/** Steps (run in +z): n risers of rise each, tread depth t, width w, starting at the building (z = 0). */
export function steps(b, key, { w, n, rise = 0.16, tread = 0.34, z0 = 0, x = 0 }) {
  for (let i = 0; i < n; i++) b.box(key, x, 0, z0 + (n - i - 0.5) * tread, w, (i + 1) * rise, tread, 0, { tw: 2, th: 2 });
}

/** Glazed double door set with dark frame in the current frame (front at z), centred on x. */
export function doors(b, { x = 0, y = 0, z = 0, w = 2.4, h = 2.5, frame = 'steelDark', glass = 'glassDark' }) {
  b.box(frame, x, y, z, w + 0.2, h + 0.15, 0.1, 0, { top: true });
  b.box(glass, x, y + 0.05, z + 0.06, w - 0.1, h - 0.1, 0.03, 0, {});
  b.box(frame, x, y + 0.05, z + 0.08, 0.06, h - 0.1, 0.03, 0, {});
}

/** A facade block: granite plinth, whole-bay ribbon/punched walls, plain stair-tower ends, cornice, parapet roof. */
export function ward(b, M, world, poly, o) {
  const g = ground(world, poly);
  const base = o.base ?? g.avg;
  const s = M.m[o.facade].userData.inst;
  const top = base + o.floors * s.floorH;
  const minBay = o.minBay ?? 9;
  plinth(b, 'granite', poly, g.min - 0.5, base + 0.9, 0.1);
  bayRing(b, M, (e) => (e.L >= minBay ? o.facade : null), poly, base, o.floors);
  b.ring((e) => (e.len < minBay ? o.endKey || 'oncoEnd' : null), poly, g.min - 0.5, top, { tw: 4, th: 4, v0: base });
  ledge(b, 'stoneTrim', poly, top - 0.4, 0.4, 0.22);
  roofTop(b, poly, top, { parapet: 0.8, plant: { n: o.plant ?? 5, seed: o.seed ?? 3, antenna: !!o.antenna } });
  return { g, base, top };
}

/** Nearest polygon edge to (x, z): the edge, the parameter t of the foot point and its position. */
export function nearestEdge(poly, x, z) {
  let best = null;
  for (const e of edgesOf(poly)) {
    const t = Math.max(0, Math.min(1, ((x - e.ax) * e.tx + (z - e.az) * e.tz) / e.L));
    const px = e.ax + e.tx * t * e.L, pz = e.az + e.tz * t * e.L;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { e, t, d, px, pz };
  }
  return best;
}


// ------------------------------------------------------------------ flags
/** Flag material: 'bg' tricolour, 'eu' twelve stars, or {text, bg, fg} for an institutional banner. */
export function flagMat(M, kind) {
  const key = 'flag_' + (typeof kind === 'string' ? kind : kind.text);
  return mat(M, key, () => {
    const [c, g] = makeCanvas(192, 128);
    if (kind === 'bg') {
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 192, 43); g.fillStyle = '#00966e'; g.fillRect(0, 43, 192, 43); g.fillStyle = '#d62612'; g.fillRect(0, 86, 192, 42);
    } else if (kind === 'eu') {
      g.fillStyle = '#003399'; g.fillRect(0, 0, 192, 128); g.fillStyle = '#ffcc00';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(96 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 5, 0, 7); g.fill(); }
    } else {
      g.fillStyle = kind.bg; g.fillRect(0, 0, 192, 128); g.fillStyle = kind.fg; g.font = '700 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kind.text, 96, 64);
    }
    return new S({ map: toTexture(c, { repeat: false }), roughness: 0.8, side: THREE.DoubleSide });
  });
}

/** Flagpoles in a row along +x of the current frame, flags streaming towards +x. */
export function flagpoles(b, M, kinds, { x = 0, z = 0, gap = 3.2, h = 9, y = 0 } = {}) {
  kinds.forEach((k, i) => {
    const px = x + i * gap;
    b.cyl('steel', px, y, z, 0.1, 0.06, h, 8);
    b.sphere('gold', px, y + h + 0.05, z, 0.12, 1, 1, 1, 6);
    const key = flagMat(M, k) && 'flag_' + (typeof k === 'string' ? k : k.text);
    b.quad(key, [px, y + h - 0.3, z], [px + 1.9, y + h - 0.42, z], [px + 1.9, y + h - 1.6, z], [px, y + h - 1.5, z], [[1, 1], [0, 1], [0, 0], [1, 0]]);
  });
}

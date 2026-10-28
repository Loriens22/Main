// Real-geometry facades for the hand-built landmarks: every window is an opening with reveals, the glass
// set back in it behind a frame with mullions, a projecting sill and (optionally) a stone surround, a
// cornice or pediment over it; walls carry pilasters, string courses, a rusticated base and a stepped
// cornice; curtain walls get real mullions and transoms in front of the glass. Surfaces use tiling PBR
// materials in metres (LandmarkMaterials.lf*), the glass an atlas of room interiors that light up at night.
//
// Wall frame: for an edge a -> b of a positive-area footprint the outward side is on the right of a -> b
// seen from above (MeshBuilder.wall). Locally x runs from b to a (left to right for a viewer facing the
// wall), y is up from the base, z points out of the wall.
import { orient } from './LandmarkGeometry.js';

const TAU = Math.PI * 2;

/** Deterministic [0, 1) hash of integers. */
function h3(a, b, c) {
  let x = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** Axis-aligned box in the current local frame from corner ranges, uv in metres (tile t). */
function box(b, k, x0, x1, y0, y1, z0, z1, t = 1, faces = 'fltbrk') {
  const u = (a) => a / t;
  if (faces.includes('f')) b.quad(k, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[u(x0), u(y0)], [u(x1), u(y0)], [u(x1), u(y1)], [u(x0), u(y1)]]);
  if (faces.includes('t')) b.quad(k, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[u(x0), u(z1)], [u(x1), u(z1)], [u(x1), u(z0)], [u(x0), u(z0)]]);
  if (faces.includes('b')) b.quad(k, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [[u(x0), u(z0)], [u(x1), u(z0)], [u(x1), u(z1)], [u(x0), u(z1)]]);
  if (faces.includes('l')) b.quad(k, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[u(z0), u(y0)], [u(z1), u(y0)], [u(z1), u(y1)], [u(z0), u(y1)]]);
  if (faces.includes('r')) b.quad(k, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[u(z1), u(y0)], [u(z0), u(y0)], [u(z0), u(y1)], [u(z1), u(y1)]]);
  if (faces.includes('k')) b.quad(k, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[u(x1), u(y0)], [u(x0), u(y0)], [u(x0), u(y1)], [u(x1), u(y1)]]);
}

/** Wall-plane rectangle (z), uv in metres with offset su along the wall. */
function rect(b, k, x0, x1, y0, y1, z, t, su = 0, sv = 0) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
  const tu = t[0] || t, tv = t[1] || t;
  b.quad(k, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [[(su + x0) / tu, (sv + y0) / tv], [(su + x1) / tu, (sv + y0) / tv], [(su + x1) / tu, (sv + y1) / tv], [(su + x0) / tu, (sv + y1) / tv]]);
}

/**
 * One opening (window or door) in a wall cell, everything but the wall surface around it.
 * o = {x0, x1, y0, y1, arch (radius of the semicircular head or 0), depth, frameKey, glassKey, frameW,
 *      cols, rows (mullions / transoms), sillKey, surround: {w, d, key}, head: 'cornice'|'pediment'|'keystone',
 *      revealKey, variant (glass atlas cell 0..15), door}
 */
function opening(b, o, tile) {
  const { x0, x1, y0, y1 } = o;
  const d = o.depth, r = o.arch || 0, ys = y1 - r; // arch springs at ys
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const rk = o.revealKey;
  // reveals: jambs, sill, head (or arch soffit)
  b.quad(rk, [x0, y0, 0], [x0, y0, -d], [x0, ys, -d], [x0, ys, 0], [[0, y0 / tile], [d / tile, y0 / tile], [d / tile, ys / tile], [0, ys / tile]]);
  b.quad(rk, [x1, y0, -d], [x1, y0, 0], [x1, ys, 0], [x1, ys, -d], [[d / tile, y0 / tile], [0, y0 / tile], [0, ys / tile], [d / tile, ys / tile]]);
  b.quad(rk, [x0, y0, 0], [x1, y0, 0], [x1, y0, -d], [x0, y0, -d], [[x0 / tile, 0], [x1 / tile, 0], [x1 / tile, d / tile], [x0 / tile, d / tile]]);
  const N = r > 0 ? Math.max(6, Math.round(r * 8)) : 0;
  const arc = (k) => { const a = Math.PI - (Math.PI * k) / N; return [cx + r * Math.cos(a), ys + r * Math.sin(a)]; };
  if (r > 0) {
    for (let k = 0; k < N; k++) {
      const [ax, ay] = arc(k), [bx, by] = arc(k + 1);
      b.quad(rk, [bx, by, 0], [ax, ay, 0], [ax, ay, -d], [bx, by, -d]);
    }
  } else {
    b.quad(rk, [x1, y1, 0], [x0, y1, 0], [x0, y1, -d], [x1, y1, -d], [[x1 / tile, 0], [x0 / tile, 0], [x0 / tile, d / tile], [x1 / tile, d / tile]]);
  }
  // glass with a room behind (atlas cell = variant)
  const gz = -d + 0.03;
  const cu = (o.variant % 4) / 4, cv = Math.floor(o.variant / 4) / 4;
  const gu = (x) => cu + ((x - x0) / w) * 0.25, gv = (y) => cv + ((y - y0) / (y1 - y0)) * 0.25;
  if (r > 0) {
    b.quad(o.glassKey, [x0, y0, gz], [x1, y0, gz], [x1, ys, gz], [x0, ys, gz], [[gu(x0), gv(y0)], [gu(x1), gv(y0)], [gu(x1), gv(ys)], [gu(x0), gv(ys)]]);
    for (let k = 0; k < N; k++) {
      const [ax, ay] = arc(k), [bx, by] = arc(k + 1);
      b.tri(o.glassKey, [cx, ys, gz], [bx, by, gz], [ax, ay, gz], [gu(cx), gv(ys)], [gu(bx), gv(by)], [gu(ax), gv(ay)]);
    }
  } else {
    b.quad(o.glassKey, [x0, y0, gz], [x1, y0, gz], [x1, y1, gz], [x0, y1, gz], [[gu(x0), gv(y0)], [gu(x1), gv(y0)], [gu(x1), gv(y1)], [gu(x0), gv(y1)]]);
  }
  // frame and glazing bars, just in front of the glass
  const fw = o.frameW || 0.06, fk = o.frameKey, fz0 = gz, fz1 = gz + 0.05;
  box(b, fk, x0, x0 + fw, y0, ys, fz0, fz1, 1, 'fr');
  box(b, fk, x1 - fw, x1, y0, ys, fz0, fz1, 1, 'fl');
  box(b, fk, x0 + fw, x1 - fw, y0, y0 + fw, fz0, fz1, 1, 'ft');
  if (r > 0) {
    for (let k = 0; k < N; k++) {
      const [ax, ay] = arc(k), [bx, by] = arc(k + 1);
      const ix = (p) => cx + (p[0] - cx) * (1 - fw / r), iy = (p) => ys + (p[1] - ys) * (1 - fw / r);
      b.quad(fk, [ix([ax, ay]), iy([ax, ay]), fz1], [ix([bx, by]), iy([bx, by]), fz1], [bx, by, fz1], [ax, ay, fz1]);
    }
    box(b, fk, x0 + fw, x1 - fw, ys - fw / 2, ys + fw / 2, fz0, fz1, 1, 'ftb'); // transom at the springing line
  } else {
    box(b, fk, x0 + fw, x1 - fw, y1 - fw, y1, fz0, fz1, 1, 'fb');
  }
  const cols = o.cols || 1, rows = o.rows || 1, mw = fw * 0.7;
  for (let i = 1; i < cols; i++) {
    const x = x0 + (w * i) / cols;
    box(b, fk, x - mw / 2, x + mw / 2, y0 + fw, (r > 0 ? ys : y1) - fw, fz0, fz1 - 0.01, 1, 'flr');
  }
  for (let j = 1; j < rows; j++) {
    const y = y0 + ((ys - y0) * j) / rows;
    box(b, fk, x0 + fw, x1 - fw, y - mw / 2, y + mw / 2, fz0, fz1 - 0.01, 1, 'ftb');
  }
  // sill (not under doors)
  if (!o.door && o.sillKey) box(b, o.sillKey, x0 - 0.06, x1 + 0.06, y0 - 0.07, y0, -0.02, 0.07, 1, 'ftblr');
  // stone surround and what crowns it
  const s = o.surround;
  if (s) {
    const sw = s.w, sd = s.d, sk = s.key;
    box(b, sk, x0 - sw, x0, o.door ? y0 : y0 - 0.0, ys, 0, sd, 1, 'flr');
    box(b, sk, x1, x1 + sw, o.door ? y0 : y0 - 0.0, ys, 0, sd, 1, 'flr');
    if (r > 0) {
      for (let k = 0; k < N; k++) {
        const [ax, ay] = arc(k), [bx, by] = arc(k + 1);
        const ox = (p) => cx + (p[0] - cx) * ((r + sw) / r), oy = (p) => ys + (p[1] - ys) * ((r + sw) / r);
        b.quad(sk, [ax, ay, sd], [bx, by, sd], [ox([bx, by]), oy([bx, by]), sd], [ox([ax, ay]), oy([ax, ay]), sd]);
        b.quad(sk, [ox([ax, ay]), oy([ax, ay]), sd], [ox([bx, by]), oy([bx, by]), sd], [ox([bx, by]), oy([bx, by]), 0], [ox([ax, ay]), oy([ax, ay]), 0]);
      }
    } else {
      box(b, sk, x0 - sw, x1 + sw, y1, y1 + sw, 0, sd, 1, 'ftlr');
    }
    const top = r > 0 ? y1 + sw : y1 + sw;
    if (s.head === 'cornice') box(b, sk, x0 - sw - 0.1, x1 + sw + 0.1, top, top + 0.16, 0, sd + 0.1, 1, 'ftblr');
    else if (s.head === 'pediment') {
      box(b, sk, x0 - sw - 0.08, x1 + sw + 0.08, top, top + 0.1, 0, sd + 0.08, 1, 'ftblr');
      const L = x0 - sw - 0.08, R = x1 + sw + 0.08, H = (R - L) * 0.22, z = sd + 0.08, yb = top + 0.1;
      b.tri(sk, [L, yb, z], [R, yb, z], [(L + R) / 2, yb + H, z]);
      b.quad(sk, [(L + R) / 2, yb + H, z], [R, yb, z], [R, yb, 0], [(L + R) / 2, yb + H, 0]);
      b.quad(sk, [L, yb, z], [(L + R) / 2, yb + H, z], [(L + R) / 2, yb + H, 0], [L, yb, 0]);
    } else if (s.head === 'keystone' && r > 0) {
      box(b, sk, cx - 0.14, cx + 0.14, y1 - 0.05, y1 + sw + 0.12, 0, sd + 0.06, 1, 'ftlr');
    }
  }
}

/** Wall surface of one storey band with openings cut out: horizontal strips plus piers, arch spandrels. */
function bandSurface(b, k, x0, x1, y0, y1, ops, t, su) {
  if (!ops.length) return rect(b, k, x0, x1, y0, y1, 0, t, su);
  const lo = Math.min(...ops.map((o) => o.y0)), hi = Math.max(...ops.map((o) => o.y1));
  rect(b, k, x0, x1, y0, lo, 0, t, su);
  rect(b, k, x0, x1, hi, y1, 0, t, su);
  let x = x0;
  for (const o of ops) {
    rect(b, k, x, o.x0, lo, hi, 0, t, su);
    // above / below an opening that is lower or shorter than the band's opening zone
    rect(b, k, o.x0, o.x1, lo, o.y0, 0, t, su);
    const r = o.arch || 0, ys = o.y1 - r;
    if (r > 0) {
      const N = Math.max(6, Math.round(r * 8)), cx = (o.x0 + o.x1) / 2;
      const tu = t[0] || t, tv = t[1] || t;
      const uv = (px, py) => [(su + px) / tu, py / tv];
      for (let i = 0; i < N; i++) {
        const a0 = Math.PI - (Math.PI * i) / N, a1 = Math.PI - (Math.PI * (i + 1)) / N;
        const p0 = [cx + r * Math.cos(a0), ys + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), ys + r * Math.sin(a1)];
        const c = (a0 + a1) / 2 > Math.PI / 2 ? [o.x0, o.y1] : [o.x1, o.y1];
        b.tri(k, [p0[0], p0[1], 0], [p1[0], p1[1], 0], [c[0], c[1], 0], uv(...p0), uv(...p1), uv(...c));
      }
    }
    rect(b, k, o.x0, o.x1, o.y1, hi, 0, t, su);
    x = o.x1;
  }
  rect(b, k, x, x1, lo, hi, 0, t, su);
}

/**
 * Builds a facade around a footprint.
 *  b: MeshBuilder; pts: footprint (any orientation); base: ground level; spec:
 *  { height, wall, wallTile, storeys: [{h, win?: {w, h, sill, arch, cols, rows, door}, wall?, blank?}],
 *    bayW, endPier, depth, frame, glass, sill, reveal, surround: {w, d, key, head}, plinth: {h, d, key},
 *    pilasters: {every, w, d, key, from (storey index)}, bands: [{y, h, d, key}],
 *    cornice: {h, d, key, steps}, attic: {h, key}, skip: (edgeIndex, len, ax, az, bx, bz) -> bool (plain wall),
 *    doors: (edgeIndex, len, ax, az, bx, bz) -> [{at (0..1 from b to a), w, h, arch?, key?}], seed }
 *  Returns the height of the top of the cornice / attic.
 */
export function facade(b, pts, base, spec) {
  const p = orient(pts);
  const n = p.length / 2;
  const seed = spec.seed || 1;
  const T = spec.wallTile || [2, 2];
  const H = spec.height;
  const storeys = spec.storeys;
  let s0 = 0; // running length: wall texture continues round the corners
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    b.push(bx, base, bz, Math.atan2(tz, -tx));
    wallFace(b, L, spec, storeys, T, s0, seed * 131 + i, spec.skip ? spec.skip(i, L, ax, az, bx, bz) : false, spec.doors ? spec.doors(i, L, ax, az, bx, bz) : []);
    b.pop();
    s0 += L;
  }
  const corn = spec.cornice ? spec.cornice.h : 0;
  return base + H + corn + (spec.attic ? spec.attic.h : 0);
}

/** One wall a -> b of a facade (see facade()), e.g. for walls chosen one by one. */
export function facadeEdge(b, ax, az, bx, bz, base, spec, su = 0, seed = 1, plain = false, doors = []) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.2) return;
  const tx = (bx - ax) / L, tz = (bz - az) / L;
  b.push(bx, base, bz, Math.atan2(tz, -tx));
  wallFace(b, L, spec, spec.storeys, spec.wallTile || [2, 2], su, seed, plain, doors);
  b.pop();
}

function wallFace(b, L, spec, storeys, T, su, seed, plain, doors) {
  const wk = spec.wall;
  const bayW = spec.bayW || 3.4, endPier = spec.endPier ?? 1.0;
  const nb = Math.max(0, Math.floor((L - 2 * endPier) / bayW + 1e-6));
  const m = (L - nb * bayW) / 2;
  const depth = spec.depth ?? 0.3;
  // plinth
  let y = 0;
  if (spec.plinth) {
    const pl = spec.plinth;
    box(b, pl.key, -0.02, L + 0.02, -1.2, pl.h, 0, pl.d, 2, 'ft');
  }
  // storeys
  const ops = [];
  for (let si = 0; si < storeys.length; si++) {
    const st = storeys[si];
    const y0 = y, y1 = y + st.h;
    const kk = st.wall || wk;
    const band = [];
    if (!plain && !st.blank && st.win && nb > 0) {
      for (let k = 0; k < nb; k++) {
        const cx = m + (k + 0.5) * bayW;
        const door = doors.find((d) => Math.abs(d.at * L - cx) < bayW / 2 && si === 0);
        const w = door ? door.w : st.win.w;
        const hh = door ? door.h : st.win.h;
        const sill = door ? 0 : st.win.sill;
        if (st.every && (k % st.every) !== (st.offset || 0)) continue;
        const o = {
          x0: cx - w / 2, x1: cx + w / 2, y0: y0 + sill, y1: y0 + sill + hh, arch: door ? door.arch || 0 : st.win.arch ? Math.min(w / 2, hh / 2) : 0,
          depth: door ? depth + 0.15 : depth, frameKey: door ? door.key || spec.door || spec.frame : spec.frame, glassKey: door ? spec.doorGlass || spec.glass : spec.glass,
          frameW: door ? 0.1 : st.win.frameW || 0.06, cols: door ? 2 : st.win.cols || 2, rows: door ? 1 : st.win.rows || 2,
          sillKey: spec.sill, surround: st.surround === undefined ? spec.surround : st.surround, revealKey: spec.reveal || kk,
          variant: Math.floor(h3(seed, si, k) * 16), door: !!door,
        };
        band.push(o);
      }
    }
    bandSurface(b, kk, 0, L, y0, y1, band, kk === wk ? T : spec.tiles?.[kk] || T, su);
    for (const o of band) ops.push(o);
    y = y1;
  }
  for (const o of ops) opening(b, o, 1);
  // pilasters between the bays (and at the ends)
  if (spec.pilasters && nb > 0) {
    const P = spec.pilasters;
    const yFrom = storeys.slice(0, P.from || 0).reduce((a, s) => a + s.h, 0);
    for (let k = 0; k <= nb; k += P.every || 1) {
      const x = m + k * bayW;
      box(b, P.key, x - P.w / 2, x + P.w / 2, yFrom, spec.height, 0, P.d, 2, 'flr');
      box(b, P.key, x - P.w / 2 - 0.06, x + P.w / 2 + 0.06, yFrom, yFrom + 0.35, 0, P.d + 0.05, 2, 'ftlr');
      if (P.capital) box(b, P.key, x - P.w / 2 - 0.08, x + P.w / 2 + 0.08, spec.height - 0.45, spec.height - 0.1, 0, P.d + 0.07, 2, 'fblr');
    }
  }
  // string courses
  for (const s of spec.bands || []) box(b, s.key, -s.d, L + s.d, s.y, s.y + s.h, 0, s.d, 2, 'ftblr');
  // stepped cornice, attic
  if (spec.cornice) {
    const c = spec.cornice, steps = c.steps || 3;
    let yy = spec.height;
    for (let k = 0; k < steps; k++) {
      const dd = (c.d * (k + 1)) / steps, hh = c.h / steps;
      box(b, c.key, -dd, L + dd, yy, yy + hh, 0, dd, 2, 'ftblr');
      yy += hh;
    }
    if (spec.attic) {
      box(b, spec.attic.key, -0.05, L + 0.05, yy, yy + spec.attic.h, -0.4, 0.0, 2, 'ft');
    }
  }
}

/**
 * Curtain wall around a footprint: glass behind a grid of real mullions and transoms, with opaque
 * spandrel panels at the slabs. spec = {height, bayW, floorH, glass, mullion, spandrel, mullD, spandH,
 * only: (edge {i, L, ax, az, bx, bz, nx, nz}) -> bool to glaze some walls only}
 */
export function curtainWall(b, pts, base, spec) {
  const p = orient(pts);
  const n = p.length / 2;
  const fh = spec.floorH, H = spec.height, nf = Math.max(1, Math.round(H / fh));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    if (spec.only && !spec.only({ i, L, ax, az, bx, bz, nx: tz, nz: -tx })) continue;
    b.push(bx, base, bz, Math.atan2(tz, -tx));
    const nb = Math.max(1, Math.round(L / spec.bayW)), bw = L / nb;
    const sh = spec.spandH ?? 0.9;
    for (let f = 0; f < nf; f++) {
      const y0 = f * (H / nf), y1 = (f + 1) * (H / nf);
      for (let k = 0; k < nb; k++) {
        const v = Math.floor(h3(i, f, k) * 16);
        const cu = (v % 4) / 4, cv = Math.floor(v / 4) / 4;
        b.quad(spec.glass, [k * bw, y0 + sh, -0.05], [(k + 1) * bw, y0 + sh, -0.05], [(k + 1) * bw, y1, -0.05], [k * bw, y1, -0.05],
          [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]]);
      }
      if (sh > 0) rect(b, spec.spandrel, 0, L, y0, y0 + sh, -0.04, spec.spandTile || 2);
      box(b, spec.mullion, 0, L, y0 + sh - 0.04, y0 + sh + 0.04, -0.05, spec.mullD * 0.6, 1, 'ftb');
      box(b, spec.mullion, 0, L, y0 - 0.05, y0 + 0.05, -0.05, spec.mullD * 0.6, 1, 'ftb');
    }
    for (let k = 0; k <= nb; k++) box(b, spec.mullion, k * bw - 0.04, k * bw + 0.04, 0, H, -0.05, spec.mullD, 1, 'flr');
    b.pop();
  }
  return base + H;
}

export { h3 as facadeHash, TAU };

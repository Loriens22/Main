// Real geometry for the facades a bus passenger sees up close: projecting
// balconies (slab, parapet or railing, owner-built glazing), entrance canopies
// with steps, cornices and string courses, roof copings and kiosk roofs.
// The facade shader (Buildings.js) draws everything else; this file mirrors
// its cell plan exactly (same integer hash, same archetype rules), so every
// balcony sits on a shader cell that leaves room for it.
import * as THREE from 'three';

// ---------------------------------------------------------------- shader mirror
const hu = (x) => {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
};
/** Same as hcell() in the facade shader: uniform [0, 1) per (bay, floor, building seed, salt). */
export function hcell(bx, fl, seedI, salt) {
  const s = Math.imul(salt, 0x9e3779b9) >>> 0;
  const h = hu(((bx + 8192) ^ hu(((fl + 64) ^ hu((seedI ^ s) >>> 0)) >>> 0)) >>> 0);
  return (h >>> 8) / 16777216;
}

/** Archetype as in archOf() of the shader (research kind, else from the style). */
export function archOf(style, kind, H, seedI) {
  if (kind > -0.5 && kind < 15.5) return kind;
  if (style === 0) return H > 17 ? (seedI < 450 ? 2 : 1) : seedI < 350 ? 2 : 0;
  if (style === 1) return seedI < 650 ? 2 : 9;
  if (style === 2) return H > 19 ? 4 : seedI < 550 ? 6 : 4;
  if (style === 3) return 8;
  if (style === 4) return 10;
  if (style === 5) return 12;
  if (style === 6) return 7;
  if (style === 7) return 16;
  if (style === 8) return 13;
  if (style === 9) return 9;   // modern residential
  if (style === 10) return 17; // villa
  if (style === 11) return 18; // interwar
  if (style === 12) return 4;  // socialist brick
  return 5;                    // Stalinist
}

const BAY = [3.0, 3.6, 3.6, 3.0, 3.2, 3.4, 2.9, 1.5, 1.55, 3.4, 3.6, 6.0, 6.0, 4.2, 2.4, 1.8, 3.0, 4.0, 2.8];

/** The facade layout the shader uses for one building. fac = aFacade + aFacade2 values. */
export function planOf(fac) {
  const [style, seed, H, fh, , winPat, gfl, kindRaw] = fac;
  const kind = kindRaw > 31.5 ? kindRaw - 64 : kindRaw;
  const seedI = Math.floor(Math.fround(seed) * 1000 + 0.5);
  const ar = archOf(style, kind, H, seedI);
  let bayW = BAY[ar] ?? 3.0;
  if (winPat === 1) bayW = 1.5;
  if (winPat === 2) bayW = 1.55;
  const block = ar <= 4 || ar === 9 || ar === 15;
  const shops = gfl > -0.5 ? gfl === 0 || winPat === 5 : (ar === 6 && seedI < 620) || ar === 16 || ar === 14 || (ar === 9 && seedI < 330) || (ar === 18 && seedI < 600);
  const plinth = block && !shops ? (ar === 9 ? 0.45 : 0.9) : ar === 18 && !shops ? 0.6 : 0;
  let gh = shops ? Math.max(fh, 4.2) : plinth + fh;
  if (ar === 14) gh = H;
  const stairN = Math.max(3, Math.floor(21 / Math.fround(bayW)));
  return { ar, bayW: Math.fround(bayW), fh: Math.fround(fh), H: Math.fround(H), seedI, winPat, gfl, block, shops, plinth, gh, stairN };
}

/** Projecting balcony (2), recessed loggia (1) or none (0) for a bay column, as the shader decides. */
export function columnType(plan, bx) {
  const { ar, winPat, block, H, seedI, stairN } = plan;
  if (block && ar < 9.5 && (bx + (seedI % 13)) % stairN === 0 && H > 8) return -1; // staircase
  const r = hcell(bx, 0, seedI, 1);
  let t = 0;
  if (ar === 0) t = r < 0.3 ? 2 : 0;
  else if (ar === 1 || ar === 2) t = r < 0.48 ? 1 : 0;
  else if (ar === 3) t = r < 0.55 ? 1 : 0;
  else if (ar === 4) t = r < 0.38 ? 2 : 0;
  else if (ar === 9) t = r < 0.42 ? 2 : 0;
  else if (ar === 15) t = r < 0.6 ? 2 : 0;
  else if (ar === 17) t = r > 0.62 ? 2 : 0;
  else if (ar === 18) t = r < 0.22 ? 2 : 0;
  if (winPat >= 0) {
    if (winPat <= 2 || winPat === 5) t = 0;
    else if (winPat === 3) t = r < 0.5 ? 1 : 0;
    else if (winPat === 4) t = 2;
  }
  return t;
}

/** Window rectangle (cell units) and loggia type of an upper-floor bay, as the shader sets them; null = no window. */
export function upperWindow(plan, bx) {
  const { ar, winPat, seedI } = plan;
  const colRnd = hcell(bx, 0, seedI, 1);
  let win = [0.27, 0.28, 0.73, 0.83], loggia = 0;
  if (ar === 0) { win = [0.28, 0.3, 0.72, 0.8]; if (colRnd < 0.3) { win = [0.1, 0, 0.9, 0.82]; loggia = 2; } }
  else if (ar <= 2) { if (colRnd < 0.48) { win = [0.05, 0, 0.95, 0.94]; loggia = 1; } else win = colRnd < 0.62 ? [0.36, 0.34, 0.64, 0.8] : [0.2, 0.28, 0.8, 0.82]; }
  else if (ar === 3) { if (colRnd < 0.55) { win = [0.04, 0, 0.96, 0.95]; loggia = 1; } else win = [0.22, 0.28, 0.78, 0.84]; }
  else if (ar === 4) { if (colRnd < 0.38) { win = [0.08, 0, 0.92, 0.85]; loggia = 2; } }
  else if (ar === 5) win = [0.3, 0.2, 0.7, 0.84];
  else if (ar === 6) win = [0.3, 0.18, 0.7, 0.86];
  else if (ar === 7) win = [0.13, 0.28, 0.87, 0.84];
  else if (ar === 9) { if (colRnd < 0.42) { win = [0.06, 0, 0.94, 0.9]; loggia = 2; } else win = colRnd < 0.74 ? [0.18, 0.28, 0.82, 0.88] : [0.3, 0.02, 0.7, 0.9]; }
  else if (ar === 10) win = [0.32, 0.32, 0.68, 0.8];
  else if (ar === 13) win = [0.36, 0.2, 0.64, 0.82];
  else if (ar === 15) { win = [0.12, 0.25, 0.88, 0.85]; if (colRnd < 0.6) loggia = 2; }
  else if (ar === 16) win = [0.2, 0.35, 0.8, 0.75];
  else if (ar === 17) { if (colRnd < 0.22) return null; win = [0.16, 0.26, 0.84, 0.9]; if (colRnd > 0.62) { win = [0.1, 0, 0.9, 0.9]; loggia = 2; } }
  else if (ar === 18) { win = [0.28, 0.22, 0.72, 0.86]; if (colRnd < 0.22) { win = [0.3, 0, 0.7, 0.86]; loggia = 2; } }
  else return null; // curtain walls, sheds, kiosks
  if (winPat >= 0) {
    if (winPat === 0) { win = [0.24, 0.28, 0.76, 0.84]; loggia = 0; }
    else if (winPat === 1) { win = [0, 0.32, 1, 0.82]; loggia = 0; }
    else if (winPat === 3) { if (colRnd < 0.5) { win = [0.05, 0, 0.95, 0.94]; loggia = 1; } else { win = [0.25, 0.3, 0.75, 0.84]; loggia = 0; } }
    else if (winPat === 4) { win = [0.08, 0, 0.92, 0.9]; loggia = 2; }
    else return null;
  }
  return { win, loggia };
}

// ---------------------------------------------------------------- kit placement (FacadeKit.js)
// Direction to the TV satellites seen from Sofia (azimuth ~190°): dishes hang only on walls facing it.
const SAT = [-0.174, 0.985];
const SAT_YAW = Math.atan2(SAT[0], SAT[1]);
const lin = (r, g, b) => [r, g, b].map((v) => Math.pow(v, 2.2));
const AWNING = [lin(0.16, 0.36, 0.2), lin(0.55, 0.1, 0.1), lin(0.12, 0.2, 0.42), lin(0.86, 0.78, 0.6), lin(0.8, 0.32, 0.1), lin(0.26, 0.27, 0.29), lin(0.62, 0.14, 0.24), lin(0.9, 0.9, 0.88)]
  .map((c) => c.map((v) => v / 0.75)); // the fabric's own albedo is ~0.75 linear
const PIPE = [null, null, lin(0.5, 0.33, 0.22).map((v) => v / 0.27), lin(0.9, 0.9, 0.88).map((v) => v / 0.27)];
const GRILLE = [lin(0.12, 0.12, 0.12), lin(0.12, 0.12, 0.12), lin(0.92, 0.92, 0.9), lin(0.16, 0.26, 0.18), lin(0.36, 0.22, 0.14)].map((c) => c.map((v) => v / 0.64));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The walls of a CCW ring in the facade frame of the shader (u0 = snapped facade coordinate at the start). */
function wallsOf(outer) {
  const n = outer.length / 2, out = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = outer[2 * i], az = outer[2 * i + 1], dx = outer[2 * j] - ax, dz = outer[2 * j + 1] - az;
    const L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const u0 = Math.round(u * 10) / 10;
    u += L + 0.7;
    out.push({ i, ax, az, L, u0, t: [dx / L, dz / L], nrm: [dz / L, -dx / L] });
  }
  for (let k = 0; k < out.length; k++) {
    const p = out[(k + out.length - 1) % out.length], w = out[k];
    w.convexStart = p.t[0] * w.t[1] - p.t[1] * w.t[0] > 0.2 && p.L > 2.5;
  }
  return out;
}

function inside(ring, x, z) {
  let c = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i], zi = ring[2 * i + 1], xj = ring[2 * j], zj = ring[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function edgeDist(ring, x, z) {
  let d = Infinity;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j] - ax, bz = ring[2 * j + 1] - az;
    const l2 = bx * bx + bz * bz || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
    d = Math.min(d, Math.hypot(x - ax - bx * k, z - az - bz * k));
  }
  return d;
}

/** Downpipe from the shoe at the pavement to the hopper under the roof edge; axis 0.1 m off the wall. */
function pipeRun(put, uu, H, col) {
  const v0 = 0.5, vTop = H - 0.48;
  if (vTop - v0 < 1.5) return;
  put('pipeShoe', uu, 0, 0.1, 1, 1, 1, col);
  const n = Math.max(1, Math.round((vTop - v0) / 2)), s = (vTop - v0) / (2 * n);
  for (let k = 0; k < n; k++) {
    put('pipe', uu, v0 + 2 * s * k, 0.1, 1, s, 1, col);
    put('pipeClamp', uu, v0 + 2 * s * k + 1.75 * s, 0.1, 1, 1, 1, col);
  }
  put('pipeHead', uu, vTop, 0.1, 1, 1, 1, col);
}

/** Kit pieces on one wall: downpipes, AC units, satellite dishes, entrance lamps, shop awnings. */
function kitWall(K, plan, w, yAt) {
  const { ar, bayW, fh, H, gh, plinth, block, shops, seedI } = plan;
  const { t, nrm, L, u0 } = w;
  const yaw = Math.atan2(nrm[0], nrm[1]);
  const put = (piece, uu, v, n, sx = 1, sy = 1, sz = 1, col = null, yw = yaw, tilt = 0) => {
    const x = w.ax + t[0] * (uu - u0) + nrm[0] * n, z = w.az + t[1] * (uu - u0) + nrm[1] * n;
    K.placer.add(K.tx, K.tz, piece, x, yAt(v), z, yw, sx, sy, sz, col, tilt);
  };
  // downpipes: on the convex corner this wall starts at, and on the piers of long classical facades
  const piped = ar === 4 || ar === 5 || ar === 6 || ar === 9 || ar === 10 || ar === 13 || ar === 15 || ar === 16 || ar === 17 || ar === 18;
  if (piped && H > 3.5 && L > 3) {
    const col = PIPE[Math.floor(hcell(0, 0, seedI, 26) * 4)];
    if (w.convexStart && hcell(w.i, 7, seedI, 25) < 0.75) pipeRun(put, u0 + 0.22, H, col);
    if ((ar === 5 || ar === 6 || ar === 13) && L > 14) {
      let last = u0;
      for (let k = Math.ceil((u0 + 4) / bayW); k * bayW < u0 + L - 4; k++) {
        if (k * bayW - last > 9 && hcell(k, 5, seedI, 27) < 0.3) { pipeRun(put, k * bayW, H, col); last = k * bayW; }
      }
    }
  }
  // yellow gas main along the walls with entrances, a regulator cabinet and riser at each entrance
  if (block && ar !== 9 && !shops && H > 8 && plinth > 0.2 && hcell(0, 0, seedI, 35) < 0.3 && L > 8) {
    const stairs = [];
    for (let bx = Math.ceil((u0 + 0.05) / bayW); (bx + 1) * bayW <= u0 + L - 0.05; bx++) if (columnType(plan, bx) === -1) stairs.push((bx + 0.5) * bayW);
    if (stairs.length) {
      const vg = plinth + fh - 0.12, a = u0 + 0.4, b = u0 + L - 0.4;
      const n = Math.max(1, Math.round((b - a) / 2)), seg = (b - a) / n;
      for (let k = 0; k < n; k++) put('gasPipe', a + seg * (k + 0.5), vg, 0.08, seg / 2, 1, 1);
      for (const us of stairs) {
        const ub = us + bayW * 0.42;
        put('gasBox', ub, 0.35, 0);
        const r0 = 1.3, len = vg - r0;
        if (len > 0.4) put('gasPipe', ub, r0 + len / 2, 0.12, len / 2, 1, 1, null, yaw, Math.PI / 2);
      }
    }
  }
  const facesSat = nrm[0] * SAT[0] + nrm[1] * SAT[1] > 0.3;
  const headYaw = yaw + Math.max(-0.85, Math.min(0.85, wrapPi(SAT_YAW - yaw)));
  const acP = ar <= 3 ? 0.11 : ar === 4 || ar === 15 ? 0.15 : ar === 9 ? 0.1 : ar === 5 || ar === 6 || ar === 13 || ar === 18 ? 0.1 : ar === 7 ? 0.08 : ar === 10 || ar === 16 || ar === 17 ? 0.06 : 0;
  const dishP = facesSat ? (block ? 0.06 : 0.03) : 0;
  const awnings = shops && !K.researched && gh >= 3.6;
  for (let bx = Math.ceil((u0 + 0.05) / bayW); (bx + 1) * bayW <= u0 + L - 0.05; bx++) {
    const uc = (bx + 0.5) * bayW;
    const type = columnType(plan, bx);
    if (type === -1) {
      if (block && !shops && H > 8) {
        put('lamp', uc, plinth + 2.2, 0);
        put('lampGlass', uc, plinth + 2.2, 0);
      }
      continue;
    }
    if (awnings && hcell(Math.floor(bx / 3), 0, seedI, 41) < 0.4) {
      const col = AWNING[Math.floor(hcell(Math.floor(bx / 3), 1, seedI, 42) * AWNING.length)];
      const sx = (bayW * 0.98) / 2.12;
      put('awning', uc, gh * 0.745, 0, sx, 1, 1, col);
      put('awningFrame', uc, gh * 0.745, 0, sx);
    } else if (shops && gh >= 3.6 && hcell(bx, -1, seedI, 33) < 0.55) {
      // roller shutter over the shop window (0.06..0.72 of the storey); some are down
      const top = gh * 0.72, h = gh * 0.66, w = bayW * 0.9;
      put('shutterBox', uc, top, 0, w, h / 2.0);
      const r = hcell(bx, -1, seedI, 34);
      if (r < 0.1) put('shutterPanel', uc, top, 0, w, r < 0.06 ? h : h * 0.35);
    }
    const wnd = upperWindow(plan, bx);
    if (!wnd) continue;
    const { win, loggia } = wnd;
    // bars over the ground-floor windows of the flats
    if (block && ar !== 9 && !shops && loggia === 0 && plinth > 0.2 && hcell(bx, -1, seedI, 31) < 0.55) {
      const ww = (win[2] - win[0]) * bayW, wh = (win[3] - win[1]) * fh;
      put('windowGrille', bx * bayW + ((win[0] + win[2]) / 2) * bayW, plinth + win[1] * fh, 0, ww / 1.224, wh / 1.4, 1, GRILLE[Math.floor(hcell(bx, -1, seedI, 32) * GRILLE.length)]);
    }
    if (!acP && !dishP) continue;
    const depth = ar === 9 ? 1.6 : ar === 17 ? 1.4 : ar === 18 ? 0.8 : ar === 4 ? 1.1 : 1.0;
    const hw = ar === 9 || ar === 17 ? bayW * 0.5 : ar === 18 ? bayW * 0.3 : bayW * 0.44;
    const balcony = loggia === 2 && (block || ar === 17 || ar === 18);
    for (let fl = 0; gh + (fl + 1) * fh <= H - 0.35; fl++) {
      const v0 = gh + fl * fh;
      const r = hcell(bx, fl, seedI, 21);
      const side = hcell(bx, fl, seedI, 22) < 0.5 ? -1 : 1;
      if (r < acP) {
        if (balcony) put('ac', uc + side * (hw - 0.47), v0 + 0.22, depth + 0.01);
        else if (loggia === 1) put('ac', uc + side * bayW * 0.22, v0 + 0.14, 0);
        else if (loggia === 0) {
          const right = (1 - win[2]) * bayW, left = win[0] * bayW;
          if (Math.max(left, right) >= 0.92) {
            const useRight = right > left + 0.05 || (Math.abs(right - left) <= 0.05 && side > 0);
            put('ac', bx * bayW + (useRight ? (win[2] + 1) / 2 : win[0] / 2) * bayW, v0 + ((win[1] + win[3]) / 2) * fh - 0.3, 0);
          } else if (win[1] * fh >= 0.72) put('ac', uc + side * 0.12 * bayW, v0 + win[1] * fh - 0.66, 0);
        }
      } else if (r < acP + 0.1 && (balcony || loggia === 1)) {
        // the washing out on the rack, or a geranium box, on the parapet
        const n = balcony ? depth + 0.01 : 0, top = balcony ? v0 + 1.0 : v0 + 0.4 * fh;
        const q = hcell(bx, fl, seedI, 24);
        if (q < 0.62) put(q < 0.31 ? 'clothesA' : 'clothesB', uc, top, n, Math.min(1, (bayW * 0.8) / 1.8));
        else put('flowerBox', uc + side * bayW * 0.18, top, n);
      } else if (loggia === 0 && r < acP + 0.04 && win[1] * fh > 0.5) {
        put('flowerBox', bx * bayW + ((win[0] + win[2]) / 2) * bayW, v0 + win[1] * fh, 0.02, Math.min(1.3, ((win[2] - win[0]) * bayW) / 0.86));
      } else if (r > 1 - dishP) {
        let uu, v, n;
        if (balcony) { uu = uc + side * (hw - 0.22); v = v0 + 0.72; n = depth + 0.01; }
        else if (loggia === 1) { uu = uc + side * bayW * 0.3; v = v0 + 0.62; n = 0; }
        else {
          const right = (1 - win[2]) * bayW, left = win[0] * bayW;
          if (Math.max(left, right) < 0.7) continue;
          uu = bx * bayW + (right >= left ? (win[2] + 1) / 2 : win[0] / 2) * bayW; v = v0 + ((win[1] + win[3]) / 2) * fh; n = 0;
        }
        put('dishMount', uu, v, n);
        put('dishHead', uu, v, n + 0.45, 1, 1, 1, null, headYaw);
      }
    }
  }
}

/**
 * Roof kit of a building along the route: lift machine rooms above the staircases of tall slabs, vent
 * heads, mushroom vents, TV masts and condenser rows on flat roofs; a chimney on hipped roofs.
 */
export function addRoofKit(K, outer, fac, top, inner, roofH) {
  const plan = planOf(fac);
  const { ar, bayW, H, block, seedI } = plan;
  const walls = wallsOf(outer);
  if (!walls.length) return;
  const W = walls.reduce((a, b) => (b.L > a.L ? b : a));
  const yaw = Math.atan2(W.nrm[0], W.nrm[1]);
  const add = (piece, x, y, z, yw = yaw, s = 1, col = null) => K.placer.add(K.tx, K.tz, piece, x, y, z, yw, s, s, s, col);
  const spot = (uu, inset) => [W.ax + W.t[0] * (uu - W.u0) - W.nrm[0] * inset, W.az + W.t[1] * (uu - W.u0) - W.nrm[1] * inset];
  const fits = (p, r) => inside(outer, p[0], p[1]) && edgeDist(outer, p[0], p[1]) > r;
  if (inner && roofH > 0) {
    if (hcell(1, 1, seedI, 60) > 0.85) return;
    let cx = 0, cz = 0;
    const n = inner.length / 2;
    for (let i = 0; i < n; i++) { cx += inner[2 * i]; cz += inner[2 * i + 1]; }
    cx /= n; cz /= n;
    const f = 0.62 + hcell(1, 2, seedI, 61) * 0.2, uu = W.u0 + W.L * (0.3 + hcell(1, 3, seedI, 62) * 0.4);
    const m = spot(uu, 0);
    const x = m[0] + (cx - m[0]) * f, z = m[1] + (cz - m[1]) * f;
    add('chimney', x, top + roofH * f - 0.35, z);
    return;
  }
  const lifts = [];
  if (block && H > 14 && ar < 9.5) {
    for (let bx = Math.ceil(W.u0 / bayW); (bx + 1) * bayW <= W.u0 + W.L; bx++) {
      if (columnType(plan, bx) !== -1) continue;
      const p = spot((bx + 0.5) * bayW, 3.6);
      if (!fits(p, 1.75)) continue;
      add('liftroom', p[0], top, p[1]);
      lifts.push(p);
      if (hcell(bx, 70, seedI, 63) < 0.45) add('antenna', p[0] + W.t[0] * 1.0, top + 2.63, p[1] + W.t[1] * 1.0, yaw + hcell(bx, 71, seedI, 64) * 6.28);
    }
  }
  const clear = (p, r) => lifts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > r);
  if (block) {
    for (let bx = Math.ceil(W.u0 / bayW); (bx + 1) * bayW <= W.u0 + W.L; bx++) {
      if (columnType(plan, bx) === -1 || hcell(bx, 50, seedI, 51) > 0.4) continue;
      const p = spot((bx + 0.5) * bayW, 2.0 + hcell(bx, 51, seedI, 52) * 2.5);
      if (fits(p, 0.7) && clear(p, 2.6)) add('vent', p[0], top, p[1]);
    }
  }
  const nm = 1 + Math.floor(hcell(2, 2, seedI, 53) * (W.L > 20 ? 5 : 3));
  for (let k = 0; k < nm; k++) {
    const p = spot(W.u0 + W.L * (0.08 + 0.84 * hcell(k, 3, seedI, 54)), 1.0 + hcell(k, 4, seedI, 55) * 6);
    if (fits(p, 0.5) && clear(p, 2.2)) add('mushroom', p[0], top, p[1]);
  }
  const na = block ? (H > 14 ? 1 : 2) : hcell(3, 3, seedI, 56) < 0.55 ? 1 : 0;
  for (let k = 0; k < na; k++) {
    const p = spot(W.u0 + W.L * (0.15 + 0.7 * hcell(k, 5, seedI, 57)), 1.5 + hcell(k, 6, seedI, 58) * 4);
    if (fits(p, 0.6) && clear(p, 2.5)) add('antenna', p[0], top, p[1], hcell(k, 7, seedI, 59) * 6.28);
  }
  // condenser rows on offices, institutes and shops
  if ((ar === 7 || ar === 8 || ar === 16 || ar === 11) && hcell(4, 4, seedI, 65) < 0.7) {
    const nc = 2 + Math.floor(hcell(4, 5, seedI, 66) * 4);
    const u1 = W.u0 + W.L * (0.2 + 0.3 * hcell(4, 6, seedI, 67));
    for (let k = 0; k < nc; k++) {
      const p = spot(u1 + k * 1.1, 2.6);
      if (fits(p, 0.6)) add('ac', p[0], top + 0.4, p[1], yaw + Math.PI);
    }
  }
}

// ---------------------------------------------------------------- materials
function railTexture() {
  // one 0.12 m bay of a painted steel railing: top rail, bottom rail, one bar
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 32, 8);
  g.fillRect(0, 116, 32, 12);
  g.fillRect(13, 0, 7, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glazingTexture() {
  // one 0.85 m sash of a balcony enclosure: frame around a tinted pane, transom at 70 %
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(28,36,42,0.5)';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 4, 128);
  g.fillRect(60, 0, 4, 128);
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 123, 64, 5);
  g.fillRect(0, 36, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function detailMaterials() {
  return {
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }),
    glazing: new THREE.MeshStandardMaterial({ vertexColors: true, map: glazingTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.08, metalness: 0.1 }),
  };
}

// ---------------------------------------------------------------- geometry
const srgb = (r, g, b) => [r, g, b].map((v) => Math.pow(v, 2.2));
const FRAME = [srgb(0.95, 0.95, 0.94), srgb(0.62, 0.64, 0.66), srgb(0.45, 0.3, 0.2)];
const RAIL = [srgb(0.18, 0.18, 0.19), srgb(0.32, 0.36, 0.33), srgb(0.55, 0.56, 0.56)];

/**
 * Axis-aligned box in the wall frame: centre c, t = along the wall, up, n = out of the wall.
 * Faces are CCW seen from outside.
 */
function box(buf, cx, cy, cz, t, n, ht, hh, hn, col, skipBack = true) {
  const faces = [
    [n, 1, 'up', 't'], [n, -1, 't', 'up'], [t, 1, 'n', 'up'], [t, -1, 'up', 'n'], ['up', 1, 't', 'n'], ['up', -1, 'n', 't'],
  ];
  const vec = { t: [t[0], 0, t[1]], n: [n[0], 0, n[1]], up: [0, 1, 0] };
  const half = { t: ht, n: hn, up: hh };
  for (const [ax, sg, A, B] of faces) {
    const key = ax === t ? 't' : ax === n ? 'n' : 'up';
    if (skipBack && key === 'n' && sg < 0) continue; // the face against the wall is never seen
    const N = vec[key].map((v) => v * sg);
    const a = vec[A].map((v) => v * half[A]), b = vec[B].map((v) => v * half[B]);
    const o = [cx + N[0] * half[key], cy + N[1] * half[key], cz + N[2] * half[key]];
    const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
      buf.vertex(o[0] + a[0] * i + b[0] * j, o[1] + a[1] * i + b[1] * j, o[2] + a[2] * i + b[2] * j, N[0], N[1], N[2], 0, 0, 0, 0, col));
    buf.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

/** Vertical quad in the wall frame (for railings and glazing), uv in metres along / up. */
function panel(buf, x0, z0, x1, z1, y0, y1, nx, nz, col, uScale = 1) {
  const L = Math.hypot(x1 - x0, z1 - z0) * uScale;
  const a = buf.vertex(x0, y0, z0, nx, 0, nz, 0, 0, 0, 0, col);
  const b = buf.vertex(x1, y0, z1, nx, 0, nz, L, 0, 0, 0, col);
  const c = buf.vertex(x1, y1, z1, nx, 0, nz, L, 1, 0, 0, col);
  const d = buf.vertex(x0, y1, z0, nx, 0, nz, 0, 1, 0, 0, col);
  buf.quad(a, d, c, b); // CCW seen from the side the normal points to
}

/**
 * Adds the detail geometry of one building.
 *  get(material) -> GeoBuffer for this building's tile; outer = CCW footprint ring (flat x,z);
 *  yAt(v) = world height of facade coordinate v; wallCol = linear rgb of the wall;
 *  K = {placer, tx, tz, researched} to place Blender kit pieces (FacadeKit.js) as well.
 */
export function addFacadeDetail(get, outer, fac, yAt, wallCol, accent, K = null, opts = {}) {
  const plan = planOf(fac);
  if (K) for (const w of wallsOf(outer)) kitWall(K, plan, w, yAt);
  const { ar, bayW, fh, H, gh, plinth, block, shops, seedI } = plan;
  const flat = get('dflat'), rail = get('rail'), glazing = get('glazing');
  const n = outer.length / 2;
  const light = (k) => wallCol.map((v) => Math.min(1, v * k));
  const panelBld = ar <= 3;
  let u = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = outer[2 * i], az = outer[2 * i + 1], bx2 = outer[2 * j], bz = outer[2 * j + 1];
    const dx = bx2 - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const t = [dx / L, dz / L], nrm = [dz / L, -dx / L];
    const u0 = Math.round(u * 10) / 10;
    u += L + 0.7;
    const at = (uu) => [ax + t[0] * (uu - u0), az + t[1] * (uu - u0)];
    // cornice and ground-floor string course on classical facades; a thin coping on the rest
    if (L > 2) {
      const [mx, mz] = at(u0 + L / 2);
      if (ar === 5 || ar === 6 || ar === 13 || ar === 18) {
        box(flat, mx + nrm[0] * 0.16, yAt(H - 0.28), mz + nrm[1] * 0.16, t, nrm, L / 2 + 0.3, 0.28, 0.16, light(1.06));
        box(flat, mx + nrm[0] * 0.24, yAt(H - 0.62), mz + nrm[1] * 0.24, t, nrm, L / 2 + 0.24, 0.07, 0.08, light(1.1));
        if (gh > 3 && H > gh + 3) box(flat, mx + nrm[0] * 0.07, yAt(gh + 0.08), mz + nrm[1] * 0.07, t, nrm, L / 2 + 0.07, 0.1, 0.07, light(1.08));
      } else if (ar === 14) {
        box(flat, mx + nrm[0] * 0.25, yAt(H - 0.1), mz + nrm[1] * 0.25, t, nrm, L / 2 + 0.25, 0.1, 0.25, srgb(0.82, 0.82, 0.8)); // kiosk roof overhang
      } else if (H > 5 && ar !== 8) {
        box(flat, mx + nrm[0] * 0.03, yAt(H + 0.04), mz + nrm[1] * 0.03, t, nrm, L / 2 + 0.03, 0.06, 0.05, srgb(0.62, 0.62, 0.6)); // parapet coping
      }
    }
    // roof terrace in front of a set-back top storey: glass guard on the parapet edge
    if (opts.terrace && L > 1.2) {
      const p0 = at(u0), p1 = at(u0 + L), yb = yAt(H + 0.1);
      panel(glazing, p0[0] + nrm[0] * 0.02, p0[1] + nrm[1] * 0.02, p1[0] + nrm[0] * 0.02, p1[1] + nrm[1] * 0.02, yb, yb + 1.05, nrm[0], nrm[1], srgb(0.72, 0.8, 0.84), 1 / 1.2);
      const [mx, mz] = at(u0 + L / 2);
      box(flat, mx + nrm[0] * 0.02, yb + 1.07, mz + nrm[1] * 0.02, t, nrm, L / 2, 0.025, 0.025, srgb(0.7, 0.71, 0.72), false);
    }
    // interwar bay windows (еркери): a box projecting from the first floor to below the top one; its front is
    // drawn by the facade shader (same window grid), sides, corbel and roof in plaster
    if (ar === 18 && opts.walls && L > 9 && H > gh + 2.5 * fh) {
      const nE = Math.floor((H - gh - 0.4) / fh) - 1;
      const cols = Math.floor((L - 0.1) / bayW);
      const places = cols >= 7 ? [0.28, 0.72] : cols >= 3 ? [0.5] : [];
      for (const f of places) {
        if (hcell(Math.round(f * 10), 3, seedI, 71) > 0.8) continue;
        const ub = Math.round((u0 + L * f) / bayW) * bayW; // centred on a pier: two windows on its front
        const w = bayW * 1.8, d = 0.85, ua = ub - w / 2, uz = ub + w / 2;
        if (ua < u0 + 0.6 || uz > u0 + L - 0.6) continue;
        const vb = gh, vt = gh + nE * fh;
        const A = at(ua), B = at(uz);
        const Ao = [A[0] + nrm[0] * (d + 0.004), A[1] + nrm[1] * (d + 0.004)], Bo = [B[0] + nrm[0] * (d + 0.004), B[1] + nrm[1] * (d + 0.004)];
        const W = opts.walls;
        const va = W.vertex(Ao[0], yAt(vb), Ao[1], nrm[0], 0, nrm[1], ua, vb, 0, 0, wallCol, fac);
        const vbv = W.vertex(Bo[0], yAt(vb), Bo[1], nrm[0], 0, nrm[1], uz, vb, 0, 0, wallCol, fac);
        const vc = W.vertex(Bo[0], yAt(vt), Bo[1], nrm[0], 0, nrm[1], uz, vt, 0, 0, wallCol, fac);
        const vd = W.vertex(Ao[0], yAt(vt), Ao[1], nrm[0], 0, nrm[1], ua, vt, 0, 0, wallCol, fac);
        W.idx.push(va, vc, vbv, va, vd, vc);
        const [mx, mz] = at(ub);
        box(flat, mx + nrm[0] * d / 2, (yAt(vb) + yAt(vt)) / 2, mz + nrm[1] * d / 2, t, nrm, w / 2, (vt - vb) / 2, d / 2, light(1.0));
        box(flat, mx + nrm[0] * (d / 2 + 0.03), yAt(vb) - 0.12, mz + nrm[1] * (d / 2 + 0.03), t, nrm, w / 2 + 0.06, 0.12, d / 2 + 0.03, light(1.04));
        box(flat, mx + nrm[0] * (d / 2 + 0.05), yAt(vt) + 0.08, mz + nrm[1] * (d / 2 + 0.05), t, nrm, w / 2 + 0.1, 0.08, d / 2 + 0.05, light(1.08));
      }
    }
    if (!block && ar !== 17 && ar !== 18) continue;
    // bay columns fully on this wall
    for (let bx = Math.ceil((u0 + 0.05) / bayW); (bx + 1) * bayW <= u0 + L - 0.05; bx++) {
      const type = columnType(plan, bx);
      const uc = (bx + 0.5) * bayW;
      const [cx, cz] = at(uc);
      if (type === -1 && !shops && H > 8) {
        // entrance: canopy over the door and steps up to the raised ground floor
        const y = yAt(plinth + 2.4);
        box(flat, cx + nrm[0] * 0.7, y + 0.07, cz + nrm[1] * 0.7, t, nrm, bayW * 0.36, 0.07, 0.7, srgb(0.72, 0.72, 0.7));
        if (plinth > 0.2) {
          const steps = 4;
          for (let k = 0; k < steps; k++) {
            const h = (plinth * (k + 1)) / steps, dep = 1.2 * (1 - k / steps);
            box(flat, cx + nrm[0] * dep / 2, yAt(0) + h / 2 - 0.05, cz + nrm[1] * dep / 2, t, nrm, bayW * 0.24, h / 2 + 0.05, dep / 2, srgb(0.6, 0.6, 0.58));
          }
        }
        continue;
      }
      if (type !== 2) continue;
      const depth = ar === 9 ? 1.6 : ar === 17 ? 1.4 : ar === 18 ? 0.8 : ar === 4 ? 1.1 : 1.0;
      // new buildings: neighbouring balconies join into one cantilevered band (railing only at its ends)
      const band = ar === 9 || ar === 17;
      const prevB = band && columnType(plan, bx - 1) === 2 && (bx - 1) * bayW >= u0 + 0.05;
      const nextB = band && columnType(plan, bx + 1) === 2 && (bx + 2) * bayW <= u0 + L - 0.05;
      const hw = band ? bayW * 0.5 : ar === 18 ? bayW * 0.3 : bayW * 0.44;
      for (let fl = 0; gh + (fl + 1) * fh <= H - 0.35; fl++) {
        const v0 = gh + fl * fh;
        const y0 = yAt(v0);
        const pr = hcell(bx, fl, seedI, 9);
        const enclosed = ar < 9 && hcell(bx, fl, seedI, 3) < (ar < 3.5 ? 0.6 : 0.45);
        // slab (thin, crisp edge on new buildings)
        box(flat, cx + nrm[0] * depth / 2, y0 - (band ? 0.1 : 0.07), cz + nrm[1] * depth / 2, t, nrm, hw, band ? 0.11 : 0.08, depth / 2, band ? srgb(0.92, 0.92, 0.9) : srgb(0.66, 0.66, 0.64));
        // parapet: concrete panel (panel blocks, filled-in), glass (modern) or steel railing
        const fx = cx + nrm[0] * (depth - 0.03), fz = cz + nrm[1] * (depth - 0.03);
        const solid = !band && ar !== 18 && (panelBld || ar === 15 || (ar === 4 && pr > 0.55));
        if (solid) {
          let col = panelBld ? (pr < 0.6 ? light(0.97) : srgb(0.86, 0.86, 0.84)) : light(1.0);
          if (accent && panelBld && pr < 0.75) col = accent;
          box(flat, fx, y0 + 0.5, fz, t, nrm, hw, 0.5, 0.04, col, false);
          for (const sd of [-1, 1]) {
            const sx = cx + t[0] * sd * (hw - 0.04) + nrm[0] * depth / 2, sz = cz + t[1] * sd * (hw - 0.04) + nrm[1] * depth / 2;
            box(flat, sx, y0 + 0.5, sz, t, nrm, 0.04, 0.5, depth / 2, col, false);
          }
        } else {
          // glass guards on new buildings, painted iron on the old ones
          const glassG = band || ar === 9;
          const col = glassG ? srgb(0.72, 0.8, 0.84) : ar === 18 ? RAIL[0] : RAIL[Math.floor(pr * 3) % 3];
          const buf = glassG ? glazing : rail;
          const sc = glassG ? 1 / 1.2 : 1 / 0.12;
          const p0 = [fx - t[0] * hw, fz - t[1] * hw], p1 = [fx + t[0] * hw, fz + t[1] * hw];
          const w0 = [cx - t[0] * hw, cz - t[1] * hw], w1 = [cx + t[0] * hw, cz + t[1] * hw];
          const gh2 = glassG ? 1.05 : 1.0;
          panel(buf, p0[0], p0[1], p1[0], p1[1], y0, y0 + gh2, nrm[0], nrm[1], col, sc);
          if (!prevB) panel(buf, w0[0], w0[1], p0[0], p0[1], y0, y0 + gh2, -t[0], -t[1], col, sc);
          if (!nextB) panel(buf, p1[0], p1[1], w1[0], w1[1], y0, y0 + gh2, t[0], t[1], col, sc);
          // stainless top rail over the glass
          if (glassG) box(flat, fx, y0 + gh2 + 0.02, fz, t, nrm, hw, 0.025, 0.025, srgb(0.7, 0.71, 0.72), false);
        }
        // glazing put in by the owners, from the parapet to the slab above
        if (enclosed && ar !== 9) {
          const col = FRAME[hcell(bx, fl, seedI, 5) < 0.6 ? 0 : hcell(bx, fl, seedI, 5) < 0.85 ? 1 : 2];
          const yb = y0 + 1.0, yt = y0 + fh - 0.16;
          const q0 = [fx - t[0] * hw, fz - t[1] * hw], q1 = [fx + t[0] * hw, fz + t[1] * hw];
          const w0 = [cx - t[0] * hw, cz - t[1] * hw], w1 = [cx + t[0] * hw, cz + t[1] * hw];
          panel(glazing, q0[0], q0[1], q1[0], q1[1], yb, yt, nrm[0], nrm[1], col, 1 / 0.85);
          panel(glazing, w0[0], w0[1], q0[0], q0[1], yb, yt, -t[0], -t[1], col, 1 / 0.85);
          panel(glazing, q1[0], q1[1], w1[0], w1[1], yb, yt, t[0], t[1], col, 1 / 0.85);
          // the topmost enclosed balcony gets its own little roof
          if (gh + (fl + 2) * fh > H - 0.35) box(flat, cx + nrm[0] * depth / 2, yt + 0.06, cz + nrm[1] * depth / 2, t, nrm, hw + 0.03, 0.05, depth / 2 + 0.03, srgb(0.5, 0.52, 0.53));
        }
        count++;
      }
    }
  }
  return count;
}

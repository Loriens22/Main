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
  return 13;
}

const BAY = [3.0, 3.6, 3.6, 3.0, 3.2, 3.4, 2.9, 1.5, 1.55, 3.4, 3.6, 6.0, 6.0, 4.2, 2.4, 1.8, 3.0];

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
  const shops = gfl > -0.5 ? gfl === 0 || winPat === 5 : (ar === 6 && seedI < 620) || ar > 15.5 || ar === 14;
  const plinth = block && !shops ? 0.9 : 0;
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
  else if (ar === 9) t = r < 0.5 ? 2 : 0;
  else if (ar === 15) t = r < 0.6 ? 2 : 0;
  if (winPat >= 0) {
    if (winPat <= 2 || winPat === 5) t = 0;
    else if (winPat === 3) t = r < 0.5 ? 1 : 0;
    else if (winPat === 4) t = 2;
  }
  return t;
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
 *  yAt(v) = world height of facade coordinate v; wallCol = linear rgb of the wall.
 */
export function addFacadeDetail(get, outer, fac, yAt, wallCol, accent) {
  const plan = planOf(fac);
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
      if (ar === 5 || ar === 6 || ar === 13) {
        box(flat, mx + nrm[0] * 0.16, yAt(H - 0.28), mz + nrm[1] * 0.16, t, nrm, L / 2 + 0.3, 0.28, 0.16, light(1.06));
        box(flat, mx + nrm[0] * 0.24, yAt(H - 0.62), mz + nrm[1] * 0.24, t, nrm, L / 2 + 0.24, 0.07, 0.08, light(1.1));
        if (gh > 3 && H > gh + 3) box(flat, mx + nrm[0] * 0.07, yAt(gh + 0.08), mz + nrm[1] * 0.07, t, nrm, L / 2 + 0.07, 0.1, 0.07, light(1.08));
      } else if (ar === 14) {
        box(flat, mx + nrm[0] * 0.25, yAt(H - 0.1), mz + nrm[1] * 0.25, t, nrm, L / 2 + 0.25, 0.1, 0.25, srgb(0.82, 0.82, 0.8)); // kiosk roof overhang
      } else if (H > 5 && ar !== 8) {
        box(flat, mx + nrm[0] * 0.03, yAt(H + 0.04), mz + nrm[1] * 0.03, t, nrm, L / 2 + 0.03, 0.06, 0.05, srgb(0.62, 0.62, 0.6)); // parapet coping
      }
    }
    if (!block) continue;
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
      const depth = ar === 9 ? 1.4 : ar === 4 ? 1.1 : 1.0;
      const hw = bayW * 0.44;
      for (let fl = 0; gh + (fl + 1) * fh <= H - 0.35; fl++) {
        const v0 = gh + fl * fh;
        const y0 = yAt(v0);
        const pr = hcell(bx, fl, seedI, 9);
        const enclosed = hcell(bx, fl, seedI, 3) < (ar < 3.5 ? 0.6 : 0.45);
        // slab
        box(flat, cx + nrm[0] * depth / 2, y0 - 0.07, cz + nrm[1] * depth / 2, t, nrm, hw, 0.08, depth / 2, srgb(0.66, 0.66, 0.64));
        // parapet: concrete panel (panel blocks, filled-in), glass (modern) or steel railing
        const fx = cx + nrm[0] * (depth - 0.03), fz = cz + nrm[1] * (depth - 0.03);
        const solid = panelBld || ar === 15 || (ar === 4 && pr > 0.55);
        if (solid) {
          let col = panelBld ? (pr < 0.6 ? light(0.97) : srgb(0.86, 0.86, 0.84)) : light(1.0);
          if (accent && panelBld && pr < 0.75) col = accent;
          box(flat, fx, y0 + 0.5, fz, t, nrm, hw, 0.5, 0.04, col, false);
          for (const sd of [-1, 1]) {
            const sx = cx + t[0] * sd * (hw - 0.04) + nrm[0] * depth / 2, sz = cz + t[1] * sd * (hw - 0.04) + nrm[1] * depth / 2;
            box(flat, sx, y0 + 0.5, sz, t, nrm, 0.04, 0.5, depth / 2, col, false);
          }
        } else {
          const col = ar === 9 ? srgb(0.55, 0.62, 0.65) : RAIL[Math.floor(pr * 3) % 3];
          const buf = ar === 9 ? glazing : rail;
          const sc = ar === 9 ? 1 / 0.85 : 1 / 0.12;
          const p0 = [fx - t[0] * hw, fz - t[1] * hw], p1 = [fx + t[0] * hw, fz + t[1] * hw];
          const w0 = [cx - t[0] * hw, cz - t[1] * hw], w1 = [cx + t[0] * hw, cz + t[1] * hw];
          panel(buf, p0[0], p0[1], p1[0], p1[1], y0, y0 + 1.0, nrm[0], nrm[1], col, sc);
          panel(buf, w0[0], w0[1], p0[0], p0[1], y0, y0 + 1.0, -t[0], -t[1], col, sc);
          panel(buf, p1[0], p1[1], w1[0], w1[1], y0, y0 + 1.0, t[0], t[1], col, sc);
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

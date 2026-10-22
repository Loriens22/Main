// Road topology: splits OSM ways at Overture connectors into pieces, builds
// junction nodes and computes junction trims / polygons. The same structure
// feeds the road mesh builder, traffic AI and surface queries.
import { clamp } from '../core/math.js';

export const DRIVE_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'unknown']);
export const CLASS_RANK = { trunk: 9, primary: 8, secondary: 7, tertiary: 6, unclassified: 5, residential: 4, living_street: 3, service: 2, unknown: 2 };
export const SIDEWALK_WIDTH = { trunk: 4.2, primary: 4.0, secondary: 3.6, tertiary: 3.0, unclassified: 2.4, residential: 2.2, living_street: 1.6, service: 0, unknown: 0 };

function resample(pts, step) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = out[out.length - 2], z0 = out[out.length - 1];
    const x1 = pts[i], z1 = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.05) continue;
    const n = Math.ceil(L / step);
    for (let k = 1; k <= n; k++) out.push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n);
  }
  return out;
}

function cumulative(pts) {
  const n = pts.length / 2;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  return s;
}

function subPolyline(pts, s, a, b) {
  const out = [];
  const n = pts.length / 2;
  const at = (v) => {
    let i = 1;
    while (i < n - 1 && s[i] < v) i++;
    const t = (v - s[i - 1]) / Math.max(1e-9, s[i] - s[i - 1]);
    return [pts[2 * i - 2] + (pts[2 * i] - pts[2 * i - 2]) * t, pts[2 * i - 1] + (pts[2 * i + 1] - pts[2 * i - 1]) * t];
  };
  out.push(...at(a));
  for (let i = 0; i < n; i++) if (s[i] > a + 0.01 && s[i] < b - 0.01) out.push(pts[2 * i], pts[2 * i + 1]);
  out.push(...at(b));
  return out;
}

/** Direction (unit) of a polyline at its start (fromStart=true) pointing INTO the line, averaged over `look` m. */
function endDir(pts, fromStart, look = 6) {
  const n = pts.length / 2;
  let x0, z0;
  if (fromStart) { x0 = pts[0]; z0 = pts[1]; } else { x0 = pts[2 * n - 2]; z0 = pts[2 * n - 1]; }
  let acc = 0;
  let px = x0, pz = z0;
  for (let k = 1; k < n; k++) {
    const i = fromStart ? k : n - 1 - k;
    const x = pts[2 * i], z = pts[2 * i + 1];
    acc += Math.hypot(x - px, z - pz);
    px = x; pz = z;
    if (acc >= look) break;
  }
  const dx = px - x0, dz = pz - z0, L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
}

export class RoadNetwork {
  constructor(world) {
    this.pieces = [];
    this.nodes = new Map();
    this.paths = []; // footways etc. (no junction logic)
    this.build(world);
    this.computeJunctions();
    this.buildIndex();
  }

  node(id, x, z) {
    let n = this.nodes.get(id);
    if (!n) {
      n = { id, x, z, ends: [], type: 'end', signal: false, poly: null };
      this.nodes.set(id, n);
    }
    return n;
  }

  build(world) {
    let synth = 1e7;
    for (const r of world.roads) {
      if (!DRIVE_CLASSES.has(r.cls) || r.crosswalk) {
        if (!r.crosswalk) this.paths.push({ cls: r.cls, width: r.width, pts: resample(Array.from(r.pts), 4), surface: r.surface, name: r.name });
        continue;
      }
      const pts = Array.from(r.pts);
      const s = cumulative(pts);
      const L = s[s.length - 1];
      if (L < 0.5) continue;
      let conns = (r.conn || []).map(([id, at]) => ({ id, at })).sort((a, b) => a.at - b.at);
      if (!conns.length || conns[0].at > 1e-4) conns.unshift({ id: synth++, at: 0 });
      if (conns[conns.length - 1].at < 1 - 1e-4) conns.push({ id: synth++, at: 1 });
      for (let k = 0; k < conns.length - 1; k++) {
        const a = conns[k].at * L, b = conns[k + 1].at * L;
        if (b - a < 0.3) continue;
        const sp = subPolyline(pts, s, a, b);
        // historic centre: paving stones are Sofia's yellow paving blocks
        let surface = r.surface;
        if ((surface === 'paving_stones' || surface === 'sett') && Math.hypot(sp[0] + 1300, sp[1] + 2700) < 900) surface = 'yellow_brick';
        const piece = {
          id: this.pieces.length,
          cls: r.cls, rank: CLASS_RANK[r.cls], width: r.width, hw: r.width / 2, oneway: r.oneway,
          name: r.name, surface, bridge: r.bridge, driveway: r.driveway, link: r.link, speed: r.speed || 50,
          pts: sp, a: conns[k].id, b: conns[k + 1].id, trimA: 0, trimB: 0, extA: 0, extB: 0,
          minor: r.driveway || r.cls === 'service' || r.cls === 'unknown',
        };
        piece.len = cumulative(sp).at(-1);
        const n = sp.length / 2;
        const na = this.node(piece.a, sp[0], sp[1]);
        const nb = this.node(piece.b, sp[2 * n - 2], sp[2 * n - 1]);
        na.ends.push({ piece, atStart: true, d: endDir(sp, true) });
        nb.ends.push({ piece, atStart: false, d: endDir(sp, false) });
        this.pieces.push(piece);
      }
    }
  }

  computeJunctions() {
    for (const n of this.nodes.values()) {
      const ends = n.ends;
      if (ends.length === 1) { n.type = 'end'; continue; }
      const major = ends.filter((e) => !e.piece.minor);
      const minor = ends.filter((e) => e.piece.minor);
      const core = major.length >= 2 ? major : ends;
      if (core.length === 2) {
        n.type = 'through';
        // miter extension so the two ribbons overlap without a wedge gap
        const [e1, e2] = core;
        const dot = clamp(-(e1.d[0] * e2.d[0] + e1.d[1] * e2.d[1]), -1, 1);
        const ang = Math.acos(dot); // deviation from straight
        for (const e of core) {
          const ext = Math.min(e.piece.hw, e.piece.hw * Math.tan(ang / 2) + 0.3);
          if (e.atStart) e.piece.extA = ext; else e.piece.extB = ext;
        }
        // minor roads (driveways) stop at the major road's kerb + sidewalk
        const hwMax = Math.max(e1.piece.hw, e2.piece.hw);
        for (const e of minor) this.setTrim(e, hwMax + SIDEWALK_WIDTH[e1.piece.cls] * 0.9);
        n.majorHw = hwMax;
        continue;
      }
      n.type = 'junction';
      this.junctionPolygon(n, core);
      let rmax = 0;
      for (const e of core) rmax = Math.max(rmax, e.atStart ? e.piece.trimA : e.piece.trimB);
      for (const e of minor) this.setTrim(e, rmax + 2);
    }
  }

  setTrim(e, t) {
    const lim = e.piece.len * 0.48;
    t = Math.min(t, lim);
    if (e.atStart) e.piece.trimA = Math.max(e.piece.trimA, t);
    else e.piece.trimB = Math.max(e.piece.trimB, t);
  }

  /** Builds the junction surface polygon and per-end trims (kerb corner fillets). */
  junctionPolygon(n, ends) {
    const c = [n.x, n.z];
    const sorted = ends.map((e) => ({ ...e, ang: Math.atan2(e.d[1], e.d[0]), hw: e.piece.hw })).sort((a, b) => a.ang - b.ang);
    const m = sorted.length;
    const right = (d) => [-d[1], d[0]];
    const left = (d) => [d[1], -d[0]];
    const trims = new Array(m).fill(0);
    const corners = [];
    const maxHw = Math.max(...sorted.map((e) => e.hw));
    for (let i = 0; i < m; i++) {
      const A = sorted[i], B = sorted[(i + 1) % m];
      let delta = B.ang - A.ang;
      if (delta <= 0) delta += Math.PI * 2;
      const rA = right(A.d), lB = left(B.d);
      const pA = [c[0] + rA[0] * A.hw, c[1] + rA[1] * A.hw];
      const pB = [c[0] + lB[0] * B.hw, c[1] + lB[1] * B.hw];
      // solve pA + t*dA = pB + s*dB
      const det = A.d[0] * -B.d[1] - A.d[1] * -B.d[0];
      let t = 0, s = 0, X = null;
      const reflex = delta > Math.PI * 0.94;
      if (!reflex && Math.abs(det) > 1e-3) {
        const rx = pB[0] - pA[0], rz = pB[1] - pA[1];
        t = (rx * -B.d[1] - rz * -B.d[0]) / det;
        s = (A.d[0] * rz - A.d[1] * rx) / det;
        X = [pA[0] + A.d[0] * t, pA[1] + A.d[1] * t];
      }
      const cap = 3.2 * maxHw + 6;
      t = clamp(t, 0, cap);
      s = clamp(s, 0, cap);
      // kerb radius grows with road class
      const radius = reflex ? 0 : clamp(Math.min(A.hw, B.hw) * 0.9 + 2.5, 3, 12) * clamp(Math.sin(delta) + 0.25, 0.25, 1);
      trims[i] = Math.max(trims[i], t + radius);
      trims[(i + 1) % m] = Math.max(trims[(i + 1) % m], s + radius);
      corners.push({ A: i, B: (i + 1) % m, X, reflex });
    }
    for (let i = 0; i < m; i++) {
      const e = sorted[i];
      const t = Math.max(trims[i], e.hw * 0.5);
      this.setTrim(e, t);
      e.trim = e.atStart ? e.piece.trimA : e.piece.trimB;
    }
    // polygon: for each end its left & right kerb points, then corner fillet to next end
    const poly = [];
    const fillets = [];
    for (let i = 0; i < m; i++) {
      const e = sorted[i];
      const lE = left(e.d), rE = right(e.d);
      const base = [c[0] + e.d[0] * e.trim, c[1] + e.d[1] * e.trim];
      const pl = [base[0] + lE[0] * e.hw, base[1] + lE[1] * e.hw];
      const pr = [base[0] + rE[0] * e.hw, base[1] + rE[1] * e.hw];
      poly.push(pl, pr);
      const nx = sorted[(i + 1) % m];
      const baseN = [c[0] + nx.d[0] * nx.trim, c[1] + nx.d[1] * nx.trim];
      const lN = left(nx.d);
      const plN = [baseN[0] + lN[0] * nx.hw, baseN[1] + lN[1] * nx.hw];
      const corner = corners[i];
      const pts = [];
      if (corner.X && !corner.reflex) {
        // quadratic Bézier with the kerb-line intersection as control point
        const K = 6;
        for (let k = 1; k < K; k++) {
          const t = k / K, u = 1 - t;
          pts.push([u * u * pr[0] + 2 * u * t * corner.X[0] + t * t * plN[0], u * u * pr[1] + 2 * u * t * corner.X[1] + t * t * plN[1]]);
        }
      }
      poly.push(...pts);
      fillets.push({ from: pr, to: plN, pts, dFrom: e.d, dTo: nx.d, clsA: e.piece.cls, clsB: nx.piece.cls, reflex: corner.reflex, pieceA: e.piece, pieceB: nx.piece });
    }
    n.poly = poly;
    n.fillets = fillets;
    n.sorted = sorted;
  }

  buildIndex() {
    this.cell = 40;
    this.grid = new Map();
    const add = (gx, gz, v) => {
      const k = gx * 92837111 ^ gz * 689287499;
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(v);
    };
    for (const p of this.pieces) {
      const pts = p.pts;
      for (let i = 0; i < pts.length - 2; i += 2) {
        const x0 = Math.min(pts[i], pts[i + 2]) - p.hw, x1 = Math.max(pts[i], pts[i + 2]) + p.hw;
        const z0 = Math.min(pts[i + 1], pts[i + 3]) - p.hw, z1 = Math.max(pts[i + 1], pts[i + 3]) + p.hw;
        for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx++)
          for (let gz = Math.floor(z0 / this.cell); gz <= Math.floor(z1 / this.cell); gz++) add(gx, gz, [p, i]);
      }
    }
  }

  /** Nearest drivable road piece to (x,z): {piece, d (to centreline), side, i} or null. */
  query(x, z, radius = 30, filter = null) {
    let best = null;
    const r = Math.ceil(radius / this.cell);
    const gx0 = Math.floor(x / this.cell), gz0 = Math.floor(z / this.cell);
    const seen = new Set();
    for (let gx = gx0 - r; gx <= gx0 + r; gx++)
      for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
        const a = this.grid.get(gx * 92837111 ^ gz * 689287499);
        if (!a) continue;
        for (const [p, i] of a) {
          const key = p.id * 100000 + i;
          if (seen.has(key)) continue;
          seen.add(key);
          if (filter && !filter(p)) continue;
          const ax = p.pts[i], az = p.pts[i + 1], bx = p.pts[i + 2], bz = p.pts[i + 3];
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
          const px = ax + dx * t, pz = az + dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d <= radius && (!best || d - p.hw < best.d - best.piece.hw)) {
            best = { piece: p, d, i, t, side: Math.sign(dx * (z - az) - dz * (x - ax)), dir: [dx / Math.sqrt(L2), dz / Math.sqrt(L2)] };
          }
        }
      }
    return best;
  }

  /** True if (x,z) lies on a drivable carriageway or junction. */
  onRoad(x, z, margin = 0) {
    const q = this.query(x, z, 25);
    if (q && q.d <= q.piece.hw + margin) return true;
    return false;
  }
}

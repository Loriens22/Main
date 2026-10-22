// The bus "drive line": route centre line shifted into the kerb-side lane,
// pulled towards the kerb at stops. Used by the AI driver, navigation and
// stop alignment checks.
import { PathSampler } from '../core/path.js';

export function buildDriveLine(route, dirId, { linkNext = true } = {}) {
  const d = route.direction(dirId);
  const P = d.path;
  const pts = [];
  const step = 3;
  const offs = [];
  for (let s = 0; s <= P.length; s += step) offs.push([s, route.laneOffset(dirId, s)]);
  // smooth lane offsets (moving average over +-24 m) to avoid lateral jumps
  const sm = offs.map(([s], i) => {
    let a = 0, n = 0;
    for (let k = -8; k <= 8; k++) {
      const j = Math.min(offs.length - 1, Math.max(0, i + k));
      a += offs[j][1];
      n++;
    }
    return [s, a / n];
  });
  const tmp = {};
  for (const [s, off] of sm) {
    // pull to the kerb near stops: 55 m before to 12 m after
    let o = off;
    for (const st of d.stops) {
      const ds = s - st.s;
      if (ds > -55 && ds < 14) {
        const target = route.laneOffset(dirId, st.s, true);
        const w = ds < -30 ? (ds + 55) / 25 : ds > 4 ? 1 - (ds - 4) / 10 : 1;
        o = o + (Math.max(o, target) - o) * Math.max(0, Math.min(1, w));
      }
    }
    P.at(s, tmp);
    const t = P.tangent(s, 6);
    // right of travel direction in x-east/z-south: (-tz, tx)
    pts.push([tmp.x - t.tz * o, tmp.z + t.tx * o]);
  }
  if (linkNext) {
    const link = route.terminalLinks[dirId === 'A' ? 'AtoB' : 'BtoA'] || [];
    for (const p of link) pts.push(p);
  }
  return new PathSampler(dedupe(pts));
}

function dedupe(pts) {
  const out = [pts[0]];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) out.push(p);
  }
  return out;
}

// Metro station Vitosha (M2, opened 20 July 2016, architect Irena Delripanska): the surface
// structures at the two underpass junctions of bul. Cherni vrah - the north one with four stair
// entrances at the corners of the Srebarna / Henrik Ibsen crossing, the south one with two at
// bul. Todor Kableshkov. Entrance positions are the OSM stair ways (highway=steps) mapped there; the
// canopies, "M" pylons and lift towers are modelled from the station's published description
// (see data/research/line64/landmarks/NOTES.md for what is verified).
import { MeshBuilder } from '../LandmarkGeometry.js';
import { topY, done } from './common.js';
import { baseMats, metroSigns, pavingMats } from './mats.js';

/** Stair entrances: top = street-level mouth, bottom = where the stair disappears under the junction. */
export const ENTRANCES = [
  { id: 'N1', group: 'N', top: [-2924.6, 1059.1], bottom: [-2926.0, 1069.2], W: 4.0, name: 'NW corner (Cherni vrah / Henrik Ibsen)' },
  { id: 'N2', group: 'N', top: [-2878.2, 1033.8], bottom: [-2886.9, 1038.6], W: 2.8, name: 'NE corner (Srebarna)' },
  { id: 'N3', group: 'N', top: [-2896.9, 1080.0], bottom: [-2901.2, 1085.7], W: 2.8, name: 'SE corner' },
  { id: 'N4', group: 'N', top: [-2932.3, 1142.3], bottom: [-2931.1, 1133.7], W: 2.8, name: 'SW corner (Cherni vrah)' },
  { id: 'N5', group: 'N', top: [-2969.5, 1130.9], bottom: [-2963.4, 1124.0], W: 4.0, name: 'plaza stair towards the mall' },
  { id: 'S1', group: 'S', top: [-2972.8, 1314.3], bottom: [-2963.0, 1324.0], W: 2.8, name: 'Todor Kableshkov, mall side' },
  { id: 'S2', group: 'S', top: [-2937.9, 1334.3], bottom: [-2935.4, 1316.2], W: 2.8, name: 'Todor Kableshkov, east kerb' },
];

/** One stair entrance with a glazed canopy, side screens, handrails and a lit "M" pylon. */
function entrance(b, world, e, o = {}) {
  const [tx, tz] = e.top, [bx, bz] = e.bottom;
  const dx0 = bx - tx, dz0 = bz - tz, L0 = Math.hypot(dx0, dz0);
  const L = Math.min(L0, 9.5), dx = (dx0 / L0) * L, dz = (dz0 / L0) * L;
  const yaw = Math.atan2(dx, dz);
  const y0 = topY(world, tx, tz);
  // the surface may rise beside the stair: keep the floor above the highest ground along it
  let ymax = y0;
  for (let i = 0; i <= 8; i++) ymax = Math.max(ymax, topY(world, tx + (dx * i) / 8, tz + (dz * i) / 8));
  const W = e.W, fl = ymax - y0 + 0.03;
  const cl = Math.min(L, e.canopyLen || 6.6); // canopy length from the mouth
  b.push(tx, y0, tz, yaw);
  // stair floor: dark, with step lines fading into the shaft
  b.quad('l64stairs', [-W / 2, fl, 0], [W / 2, fl, 0], [W / 2, fl, L], [-W / 2, fl, L], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // the shaft end: a granite cross wall, so the stair reads as a trough that dives under the junction
  b.box('l64granite', 0, -0.35, L + 0.2, W + 0.8, fl + 0.35 + 0.5, 0.4, 0, { tw: 2, th: 2 });
  // granite kerbs and handrails on both sides
  for (const s of [-1, 1]) {
    const sx = s * (W / 2 + 0.2);
    b.box('l64granite', sx, -0.35, L / 2, 0.4, fl + 0.35 + 0.5, L, 0, { tw: 2, th: 2 });
    const nP = Math.max(3, Math.round(L / 1.6));
    for (let i = 0; i <= nP; i++) b.box('l64steel', s * (W / 2 + 0.05), fl + 0.4, (L * i) / nP, 0.05, 0.62, 0.05, 0, {});
    b.box('l64steel', s * (W / 2 + 0.05), fl + 1.0, L / 2, 0.06, 0.05, L, 0, {});
    b.box('l64steel', s * (W / 2 + 0.05), fl + 0.72, L / 2, 0.04, 0.03, L, 0, {});
  }
  if (W > 3.4) b.box('l64steel', 0, fl + 0.95, L / 2, 0.06, 0.05, L, 0, {}), b.box('l64steel', 0, fl + 0.3, L / 2, 0.06, 0.65, L, 0, {});
  // canopy: steel frame on posts, glass roof sloping towards the shaft, white fascia
  const cw = W + 1.2, zf = -1.6, ze = cl;
  const hf = 3.35, he = 2.75;
  const roofY = (z) => hf + ((he - hf) * (z - zf)) / (ze - zf);
  const px = cw / 2 - 0.1;
  const zs = [zf + 0.1, (zf + ze) / 2 + 0.3, ze - 0.12];
  for (const s of [-1, 1]) for (const z of zs) b.box('l64steelDark', s * px, -0.3, z, 0.14, roofY(z) + 0.3 - 0.1, 0.14, 0, {});
  for (const s of [-1, 1]) {
    // longitudinal beams
    const L2 = ze - zf, a = Math.atan2(he - hf, L2);
    b.push(s * px, (hf + he) / 2 - 0.1, (zf + ze) / 2, 0);
    b.box('l64steelDark', 0, 0, 0, 0.16, 0.2, Math.hypot(L2, he - hf), 0, {});
    b.pop();
    void a;
  }
  for (const z of zs) b.box('l64steelDark', 0, roofY(z) - 0.2, z, cw, 0.14, 0.14, 0, {});
  // glass roof quad (slightly sloped)
  b.quad('glassL64', [-cw / 2 - 0.12, roofY(zf) - 0.04, zf], [cw / 2 + 0.12, roofY(zf) - 0.04, zf], [cw / 2 + 0.12, roofY(ze) - 0.04, ze], [-cw / 2 - 0.12, roofY(ze) - 0.04, ze]);
  // front fascia with the station name, side fascias
  b.box('l64offwhite', 0, roofY(zf) - 0.42, zf, cw + 0.3, 0.46, 0.2, 0, { tw: 2, th: 2 });
  b.quad('l64metroName', [0.95, roofY(zf) - 0.38, zf - 0.105], [-0.95, roofY(zf) - 0.38, zf - 0.105], [-0.95, roofY(zf) + 0.0, zf - 0.105], [0.95, roofY(zf) + 0.0, zf - 0.105]);
  b.quad('l64metroName', [-0.95, roofY(zf) - 0.38, zf + 0.105], [0.95, roofY(zf) - 0.38, zf + 0.105], [0.95, roofY(zf) + 0.0, zf + 0.105], [-0.95, roofY(zf) + 0.0, zf + 0.105]);
  for (const s of [-1, 1]) b.box('l64offwhite', s * (cw / 2 + 0.05), roofY((zf + ze) / 2) - 0.3, (zf + ze) / 2, 0.12, 0.24, ze - zf, 0, { tw: 2, th: 2 });
  // side glass screens (clear) from the mouth towards the shaft and a tinted back wall
  for (const s of [-1, 1]) {
    const x = s * (cw / 2 - 0.1);
    b.quad('glassL64', [x, 0.9, 0.2], [x, 0.9, ze], [x, roofY(ze) - 0.25, ze], [x, roofY(0.2) - 0.25, 0.2]);
    b.quad('glassL64', [x, 0.9, ze], [x, 0.9, 0.2], [x, roofY(0.2) - 0.25, 0.2], [x, roofY(ze) - 0.25, ze]);
  }
  b.quad('glassTintL64', [cw / 2 - 0.1, fl, ze], [-cw / 2 + 0.1, fl, ze], [-cw / 2 + 0.1, roofY(ze) - 0.25, ze], [cw / 2 - 0.1, roofY(ze) - 0.25, ze]);
  // lights under the roof
  for (const z of [0.4, cl * 0.5, cl - 0.8]) for (const s of [-1, 1]) b.box('l64glow', s * (W / 2 - 0.3), roofY(z) - 0.32, z, 0.12, 0.05, 0.9, 0, {});
  // "M" pylon beside the mouth: mast and a double-sided blue board facing along the street
  const mx = (e.pylonSide || 1) * (cw / 2 + 0.9);
  b.cyl('l64steelDark', mx, -0.2, -0.9, 0.07, 0.06, 4.9, 8);
  b.box('l64metroBlue', mx, 4.3, -0.9, 1.16, 1.16, 0.12, 0, { top: true });
  b.quad('l64metroM', [mx - 0.55, 4.33, -0.9 + 0.065], [mx + 0.55, 4.33, -0.9 + 0.065], [mx + 0.55, 5.43, -0.9 + 0.065], [mx - 0.55, 5.43, -0.9 + 0.065]);
  b.quad('l64metroM', [mx + 0.55, 4.33, -0.9 - 0.065], [mx - 0.55, 4.33, -0.9 - 0.065], [mx - 0.55, 5.43, -0.9 - 0.065], [mx + 0.55, 5.43, -0.9 - 0.065]);
  b.pop();
}

export function buildMetroVitosha(ctx) {
  const { world, M } = ctx;
  baseMats(M); metroSigns(M); pavingMats(M);
  const out = [];
  for (const grp of ['N', 'S']) {
    const b = new MeshBuilder();
    let sx = 0, sz = 0, n = 0;
    for (const e of ENTRANCES.filter((q) => q.group === grp)) {
      entrance(b, world, e);
      sx += e.top[0]; sz += e.top[1]; n++;
    }
    out.push(done(b, M, sx / n, sz / n));
  }
  return out;
}

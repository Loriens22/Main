// Children's institutions of Studentski grad on line 280: the kindergarten behind the "Детски дом" stops
// (0524 / 0530, 58 x 31 m, ul. Dr Yordan Yosifov) and the nursery complex behind the "Детски ясли" stops
// (0533 / 0534, U-shaped, ul. Ak. Boris Stefanov): pastel facades, coloured entrance canopies, bar fences with
// gates on the street side, playhouses on the lawn. Footprints are the pack's OSM footprints.
import { MeshBuilder } from './LandmarkGeometry.js';
import { done, facadeMat, plasterMat, ledge, signMat, fenceMat, fenceRun, canopy, steps, doors, ward, nearestEdge } from './LandmarkInstitutionsKit.js';

const parts = (replaced, re) => replaced.filter((r) => re.test(r.entry.note));

function kidsMaterials(M) {
  facadeMat(M, 'kidsWall', { bayW: 3.2, floorH: 3.4, bays: 6, floors: 2, ppm: 32, style: 'punched', wall: '#f1dfa2', pier: '#e8cf86', win: [1.9, 1.55], sillY: 0.95, mull: 2, lit: 0.1, blind: 0.5, seed: 71, glass: '#4c6272', glass2: '#a9bdc9', frame: '#ffffff', surround: '#f7efd2', sill: '#ffffff', fr: 0.05 });
  facadeMat(M, 'yasliWall', { bayW: 3.2, floorH: 3.4, bays: 6, floors: 2, ppm: 32, style: 'punched', wall: '#ead9ab', pier: '#dfc890', win: [1.9, 1.55], sillY: 0.95, mull: 2, lit: 0.08, blind: 0.5, seed: 73, glass: '#4c6272', glass2: '#a9bdc9', frame: '#ffffff', surround: '#f5ecd0', sill: '#ffffff', fr: 0.05 });
  plasterMat(M, 'kidsEnd', '#e9d38f', 0.12);
  plasterMat(M, 'kidsOrange', '#e88b3c', 0.06);
  plasterMat(M, 'kidsGreen', '#58a05a', 0.06);
  plasterMat(M, 'kidsBlue', '#3f7fc2', 0.06);
  plasterMat(M, 'kidsRed', '#cf4b3f', 0.06);
  plasterMat(M, 'kidsYellow', '#f0c93a', 0.06);
  signMat(M, 'kidsSign', { w: 768, h: 96, bg: '#58a05a', lines: [{ text: 'ДЕТСКА ГРАДИНА', size: 62, color: '#ffffff', y: 50 }] });
  signMat(M, 'yasliSign', { w: 768, h: 96, bg: '#e88b3c', lines: [{ text: 'ДЕТСКИ ЯСЛИ', size: 66, color: '#ffffff', y: 50 }] });
  signMat(M, 'kidsGateSign', { w: 512, h: 160, bg: '#f7efd2', glow: false, lines: [{ text: 'Детско заведение', size: 36, color: '#2f6a3a', y: 50 }, { text: 'Студентски град · София', size: 28, color: '#555', y: 100 }] });
  fenceMat(M, 'decalFenceKids', { bars: '#3a9a58', rail: '#2f7f47', tile: 1.2, h: 1.3, spear: false });
}

function entranceCanopy(b, near, y, base, signKey, accent) {
  const gy = y(near.px, near.pz);
  const FL = Math.max(0.15, base - gy + 0.15);
  b.push(near.px, gy, near.pz, near.e.yaw);
  canopy(b, { w: 7, d: 3.4, y: 2.9 + FL, th: 0.3, cols: 3, colR: 0.14, slab: accent, colKey: 'kidsYellow', lights: true });
  b.quad(signKey, [-3.5, 3.25 + FL, 3.42], [3.5, 3.25 + FL, 3.42], [3.5, 3.95 + FL, 3.42], [-3.5, 3.95 + FL, 3.42]);
  const n = Math.max(2, Math.round(FL / 0.15));
  steps(b, 'concrete', { w: 4.5, n, rise: FL / n, tread: 0.32, z0: 0.1 });
  doors(b, { x: 0, y: FL, z: 0.1, w: 2.4, h: 2.4, frame: 'kidsGreen' });
  b.pop();
}

// ------------------------------------------------------------------ kindergarten ("Детски дом" stops)
export function buildKindergarten({ world, M, y, replaced }) {
  const pp = parts(replaced, /^Kindergarten/);
  if (!pp.length) return null;
  kidsMaterials(M);
  const b = new MeshBuilder();
  const poly = Array.from(pp[0].b.pts);
  const r = ward(b, M, world, poly, { facade: 'kidsWall', floors: 2, minBay: 6, endKey: 'kidsEnd', plant: 2, seed: 2 });
  ledge(b, 'kidsOrange', poly, r.top - 1.1, 0.5, 0.08, { top: false, bottom: false });
  const near = nearestEdge(poly, -503, 1705);
  entranceCanopy(b, near, y, r.base, 'kidsSign', 'kidsOrange');
  // street-side garden fence with a gate and a small gate sign
  const fz = 1716.5;
  const gx = near.px;
  fenceRun(b, y, [-536, fz, gx - 2.0, fz], { key: 'decalFenceKids', h: 1.3, tile: 1.2, post: 3, postKey: 'kidsGreen' });
  fenceRun(b, y, [gx + 2.0, fz, -468, fz], { key: 'decalFenceKids', h: 1.3, tile: 1.2, post: 3, postKey: 'kidsGreen' });
  fenceRun(b, y, [-536, fz, -536, 1745], { key: 'decalFenceKids', h: 1.3, tile: 1.2, post: 3, postKey: 'kidsGreen' });
  fenceRun(b, y, [-468, fz, -468, 1745], { key: 'decalFenceKids', h: 1.3, tile: 1.2, post: 3, postKey: 'kidsGreen' });
  for (const dx of [-2.0, 2.0]) {
    b.box('kidsBlue', gx + dx, y(gx + dx, fz) - 0.1, fz, 0.35, 1.9, 0.35, 0, { tw: 2, th: 2 });
    b.box('kidsYellow', gx + dx, y(gx + dx, fz) + 1.8, fz, 0.5, 0.2, 0.5, 0, {});
  }
  b.box('kidsBlue', gx, y(gx, fz) + 1.75, fz, 4.0, 0.18, 0.18, 0, {});
  playhouses(b, y, [[-518, 1722.8], [-487, 1722.8]], ['kidsRed', 'kidsBlue']);
  return done(b, M, pp[0].cx, pp[0].cz);
}

// ------------------------------------------------------------------ nursery ("Детски ясли" stops)
export function buildNursery({ world, M, y, replaced }) {
  const pp = parts(replaced, /^Nursery/);
  if (!pp.length) return null;
  kidsMaterials(M);
  const b = new MeshBuilder();
  const poly = Array.from(pp[0].b.pts);
  const r = ward(b, M, world, poly, { facade: 'yasliWall', floors: 2, minBay: 6, endKey: 'kidsEnd', plant: 3, seed: 5 });
  ledge(b, 'kidsGreen', poly, r.top - 1.1, 0.5, 0.08, { top: false, bottom: false });
  const near = nearestEdge(poly, -830, 2330);
  entranceCanopy(b, near, y, r.base, 'yasliSign', 'kidsGreen');
  // the kindergarten area of the pack: fence along its road side with a gate in the middle
  const F = [[-823.5, 2293.6], [-826.5, 2348.2], [-849.5, 2346.8], [-844.7, 2369.8]];
  fenceRun(b, y, F.flat(), { key: 'decalFenceKids', h: 1.3, tile: 1.2, post: 3, postKey: 'kidsGreen' });
  const gx = -838, gz = 2347.6;
  for (const dx of [-1.6, 1.6]) {
    b.box('kidsOrange', gx + dx, y(gx + dx, gz) - 0.1, gz, 0.35, 1.9, 0.35, 0, { tw: 2, th: 2 });
    b.box('kidsYellow', gx + dx, y(gx + dx, gz) + 1.8, gz, 0.5, 0.2, 0.5, 0, {});
  }
  playhouses(b, y, [[-841, 2322], [-834, 2334], [-838.5, 2356]], ['kidsRed', 'kidsYellow', 'kidsBlue']);
  return done(b, M, pp[0].cx, pp[0].cz);
}

/** Small painted play-houses with pitched roofs (kids' garden). */
function playhouses(b, y, spots, colours) {
  spots.forEach(([x, z], i) => {
    const k = colours[i % colours.length], gy = y(x, z);
    b.push(x, gy, z, i * 0.7);
    b.box(k, 0, 0, 0, 2.2, 1.7, 2.0, 0, { tw: 2, th: 2 });
    b.gable('kidsOrange', 0, 1.7, 0, 2.2, 2.0, 0.8, 0, { overhang: 0.2, eave: 0.2, gableKey: k, s: 2 });
    b.box('doorDark', 0, 0, 1.01, 0.7, 1.1, 0.04, 0, {});
    b.pop();
  });
}

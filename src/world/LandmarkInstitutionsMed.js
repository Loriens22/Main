// Hospitals along line 280: the National Oncology Hospital (НСБАЛ по онкология, ul. Plovdivsko pole 6,
// stops 0764 / 0761) and the Sofiamed hospital block beside the "Републикански невродиспансер"
// stops (0494 / 0492). Footprints are the OSM/pack footprints, so the buildings stand where the
// real ones do; facade rhythm, colours and signage are researched/inferred (see
// data/research/world/institutions280/NOTES.md).
import { MeshBuilder, centroid } from './LandmarkGeometry.js';
import { ground, done, edgesOf, mat, std, facadeMat, plasterMat, ledge, plinth, bayRing, signMat, fenceMat, fenceRun, canopy, steps, doors, ward, nearestEdge } from './LandmarkInstitutionsKit.js';

// ------------------------------------------------------------------ shared materials
function oncoMaterials(M) {
  facadeMat(M, 'oncoWall', { bayW: 3.0, floorH: 3.3, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#e5ddca', pier: '#d3c9b0', spandrel: '#d6cdb4', win: [2.25, 1.5], sillY: 0.95, mull: 3, lit: 0.45, blind: 0.3, seed: 21, glass: '#4a5b6c', glass2: '#a2b4c2', frame: '#f1eee4' });
  facadeMat(M, 'oncoWard', { bayW: 3.0, floorH: 3.3, bays: 6, floors: 2, ppm: 30, style: 'punched', wall: '#e8e0cd', pier: '#ddd3bb', win: [1.5, 1.7], sillY: 0.85, mull: 2, lit: 0.5, blind: 0.35, seed: 24, glass: '#4a5b6c', glass2: '#a2b4c2', frame: '#f1eee4', surround: '#d3c8ae', sill: '#cfc4aa' });
  plasterMat(M, 'oncoEnd', '#c99a73', 0.12);
  plasterMat(M, 'oncoPlaster', '#e6dfcc', 0.1);
  plasterMat(M, 'oncoBlue', '#1d4f8f', 0.05, 0.6);
  mat(M, 'lobbyGlass', () => { const m = std({ color: 0x6c8798, roughness: 0.12, metalness: 0.35, emissive: 0xffdca0, emissiveIntensity: 0 }); M.night.push(m); return m; });
  mat(M, 'bollard', () => std({ color: 0x8d9094, roughness: 0.5, metalness: 0.5 }));
  signMat(M, 'oncoCanopySign', { w: 1024, h: 80, bg: '#17488f', lines: [{ text: 'НСБАЛ по онкология', size: 62, color: '#ffffff', y: 42 }] });
  signMat(M, 'oncoFrontSign', { w: 1024, h: 128, bg: '#f4f1e8', lines: [{ text: 'НАЦИОНАЛНА СПЕЦИАЛИЗИРАНА БОЛНИЦА', size: 40, color: '#17488f', y: 38 }, { text: 'ЗА АКТИВНО ЛЕЧЕНИЕ ПО ОНКОЛОГИЯ', size: 40, color: '#17488f', y: 90 }] });
  signMat(M, 'oncoPylon', {
    w: 256, h: 512, bg: '#17488f', glow: true,
    lines: [{ text: 'НСБАЛ', size: 74, color: '#ffffff', y: 150 }, { text: 'по онкология', size: 46, color: '#ffffff', y: 222 }, { text: 'ГЛАВЕН ВХОД', size: 30, color: '#cfe0f5', y: 290 }, { text: 'Приемен кабинет', size: 26, color: '#cfe0f5', y: 336 }],
    draw: (g) => { // white cross on a green disc: the hospital emblem on the pylon head
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 66, 42, 0, 7); g.fill();
      g.fillStyle = '#1a8a4a'; g.fillRect(118, 36, 20, 60); g.fillRect(98, 56, 60, 20);
      g.fillStyle = '#ffffff'; g.fillRect(0, 440, 256, 6); g.fillRect(0, 468, 256, 3);
    },
  });
  signMat(M, 'oncoEmergency', { w: 256, h: 64, bg: '#b3261e', lines: [{ text: 'СПЕШЕН ПРИЕМ', size: 36, color: '#ffffff', y: 34 }] });
}

// ------------------------------------------------------------------ National Oncology Hospital
export function buildOncology({ world, M, y, partsOf, replaced }) {
  const parts = replaced.filter((r) => /^Oncology/.test(r.entry.note));
  if (!parts.length) return null;
  oncoMaterials(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  for (const { b: bd, entry, cx, cz } of parts) {
    const poly = Array.from(bd.pts);
    sx += cx; sz += cz;
    const id = entry.note;
    if (/main block/.test(id)) mainBlock(b, M, world, poly, y);
    else if (/ward tower/.test(id)) ward(b, M, world, poly, { facade: 'oncoWard', floors: Math.max(3, Math.round(bd.h / 3.3)), minBay: 7, seed: bd.id, plant: 3, antenna: bd.h > 15 });
    else if (/pavilion/.test(id)) ward(b, M, world, poly, { facade: 'oncoWall', floors: Math.max(2, Math.round(bd.h / 3.3)), minBay: 7, seed: bd.id, plant: 2 });
    else if (/outpatient/.test(id)) outpatient(b, M, world, poly, bd.h);
  }
  gateAndFence(b, M, world, y);
  return done(b, M, sx / parts.length, sz / parts.length);
}

function mainBlock(b, M, world, poly, y) {
  const r = ward(b, M, world, poly, { facade: 'oncoWall', floors: 4, minBay: 10, seed: 5, plant: 8, antenna: true });
  const { base, top } = r;
  // blue name band across the top floor of the north wing, facing the boulevard
  const near = nearestEdge(poly, 597.6, 924.6); // where the service road from the boulevard ends
  const e = near.e;
  // the entrance sits on the wall nearest to the end of the access road
  const px = near.px, pz = near.pz, gy = y(px, pz);
  b.push(px, gy, pz, e.yaw);
  const FL = base - gy; // floor level above the local ground (the forecourt rises to the door)
  // glazed lobby 8 x 3 m, two storeys, with a flat roof
  b.box('lobbyGlass', 0, 0, 1.5, 8.2, 4.2 + FL, 3.0, 0, { top: false });
  for (let i = -4; i <= 4; i++) b.box('steelDark', i * 1.0, 0, 3.05, 0.07, 4.2 + FL, 0.07, 0, {});
  b.box('steelDark', 0, 2.3 + FL, 3.06, 8.2, 0.07, 0.07, 0, {});
  b.box('concrete', 0, 4.2 + FL, 1.5, 8.8, 0.35, 3.5, 0, { tw: 4, th: 4 });
  // porte-cochere canopy 12 x 7 m over the drive, four round columns, blue fascia with the name
  b.push(0, 0, 3.0, 0);
  canopy(b, { w: 12, d: 6.2, y: 4.0 + FL, th: 0.5, cols: 4, colR: 0.22, slab: 'concrete', fascia: null, colKey: 'steel' });
  b.quad('oncoCanopySign', [-6.05, 4.0 + FL + 0.52, 6.22], [6.05, 4.0 + FL + 0.52, 6.22], [6.05, 4.0 + FL + 1.0 + 0.0, 6.22], [-6.05, 4.0 + FL + 1.0, 6.22], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  b.pop();
  // steps and a ramp up to the doors, handrails
  for (let i = 0; i < 3; i++) b.box('concreteDark', 0, 0, 3.3 + (2 - i) * 0.4 + 0.2, 6.2, FL * (i + 1) / 3 + 0.01, 0.4, 0, { tw: 2, th: 2 });
  b.box('steel', -3.4, 0.9, 4.4, 0.05, 0.05, 2.2, 0, {});
  b.box('steel', 3.4, 0.9, 4.4, 0.05, 0.05, 2.2, 0, {});
  // bollards in front of the canopy
  for (const bx of [-5.4, -2.7, 2.7, 5.4]) b.cyl('bollard', bx, 0, 8.6, 0.1, 0.1, 0.85, 8);
  b.pop();
  // name band on the north wing face (wall of the edge nearest the road end), over the top two floors
  b.push(px, gy, pz, e.yaw);
  b.quad('oncoFrontSign', [-5.5, top - gy - 3.2, 0.34], [5.5, top - gy - 3.2, 0.34], [5.5, top - gy - 1.5, 0.34], [-5.5, top - gy - 1.5, 0.34]);
  b.pop();
  // emergency entrance canopy on the south-east wing
  const em = nearestEdge(poly, 735, 975);
  b.push(em.px, y(em.px, em.pz), em.pz, em.e.yaw);
  canopy(b, { w: 8, d: 4.5, y: 3.4, th: 0.4, cols: 3, colR: 0.18, slab: 'concrete', colKey: 'steel', lights: true });
  b.quad('oncoEmergency', [-2, 3.5, 4.62], [2, 3.5, 4.62], [2, 3.9, 4.62], [-2, 3.9, 4.62]);
  b.box('lobbyGlass', 0, 0, 0.5, 5.5, 3.0, 0.5, 0, {});
  b.pop();
}

function outpatient(b, M, world, poly, h) {
  const g = ground(world, poly);
  const base = g.avg, wallH = 3.4;
  plinth(b, 'granite', poly, g.min - 0.5, base + 0.7, 0.1);
  bayRing(b, M, 'oncoWall', poly, base, 1);
  const [cx, cz] = centroid(poly);
  b.hip('roofRed', poly, base + wallH, 1.6, 0.12, { s: 4, centre: [cx, cz] });
  ledge(b, 'stoneTrim', poly, base + wallH - 0.3, 0.3, 0.3);
}

function gateAndFence(b, M, world, y) {
  fenceMat(M, 'decalFence', { bars: '#2f3a33', rail: '#2a332d' });
  // campus boundary along the boulevard (east verge of the east carriageway), with openings for the two driveways
  const W = [
    [586.5, 836], [584.6, 880], [585.6, 912.5],
  ];
  const S1 = [[585.4, 937], [586.2, 957.7], [585.0, 982.8], [586.2, 1018.8]];
  fenceRun(b, y, W.flat(), { h: 1.7, plinthH: 0.45, postKey: 'concrete' });
  fenceRun(b, y, S1.flat(), { h: 1.7, plinthH: 0.45, postKey: 'concrete' });
  // main entrance from the boulevard, 4.6 m service road at z = 925: brick piers, barrier and guard booth
  const gx = 585.4, gz = 925;
  for (const dz of [-3.0, 3.0]) {
    b.box('stoneLight', gx, y(gx, gz + dz) - 0.2, gz + dz, 0.7, 2.6, 0.7, 0, { tw: 2, th: 2 });
    b.box('stoneTrim', gx, y(gx, gz + dz) + 2.4, gz + dz, 0.9, 0.18, 0.9, 0, {});
  }
  // barrier arm (red/white) lifted beside the road, post and booth
  const gy = y(gx + 3, gz);
  b.box('steelDark', gx + 3, gy, gz - 2.7, 0.3, 1.1, 0.3, 0, {});
  b.box('white', gx + 3, gy + 1.0, gz - 0.3, 0.1, 0.1, 4.8, 0, {});
  for (let k = 0; k < 4; k++) b.box('blueStripe', gx + 3, gy + 1.0, gz - 2.5 + k * 1.2, 0.11, 0.11, 0.6, 0, {});
  b.push(gx + 4.5, gy, gz + 5.0, 0);
  b.box('oncoPlaster', 0, 0, 0, 2.4, 2.5, 2.4, 0, { tw: 4, th: 4 });
  b.box('glassDark', 0, 0.8, 1.21, 2.0, 1.1, 0.04, 0, {});
  b.box('concrete', 0, 2.5, 0, 3.0, 0.2, 3.0, 0, { tw: 4, th: 4 });
  b.pop();
  // pylon: blue stele with the emblem, double sided, west of the gate piers beside the road
  const py = y(gx + 1.0, gz - 6.2);
  b.box('stoneLight', gx + 1.0, py - 0.2, gz - 6.2, 2.0, 0.5, 0.5, 0, { tw: 2, th: 2 });
  b.push(gx + 1.0, py, gz - 6.2, Math.PI / 2 * -1);
  for (const f of [1, -1]) b.quad('oncoPylon', [-0.8 * f, 0.4, 0.25 * f], [0.8 * f, 0.4, 0.25 * f], [0.8 * f, 4.4, 0.25 * f], [-0.8 * f, 4.4, 0.25 * f]);
  b.box('steelDark', 0, 0.3, 0, 1.7, 4.3, 0.46, 0, {});
  b.pop();
  // service driveways 3.4 m at z = 1022 / 1025 (to the south loop): plain gate posts and a swing barrier
  for (const dz of [1021.0, 1026.6]) b.box('stoneLight', 585.6, y(585.6, dz) - 0.2, dz, 0.5, 2.0, 0.5, 0, { tw: 2, th: 2 });
}

// ------------------------------------------------------------------ Sofiamed hospital (Dr G. M. Dimitrov 16)
function sofiaMaterials(M) {
  facadeMat(M, 'sofiaWall', { bayW: 3.2, floorH: 3.9, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#e9e8e2', pier: '#dcdcd5', spandrel: '#cfd5d6', win: [2.6, 1.95], sillY: 0.95, mull: 2, lit: 0.4, blind: 0.2, seed: 33, glass: '#587a8e', glass2: '#b4cad6', frame: '#f4f4f0', slabCol: 'rgba(255,255,255,0.45)' });
  facadeMat(M, 'sofiaClinic', { bayW: 3.0, floorH: 3.6, bays: 6, floors: 2, ppm: 30, style: 'punched', wall: '#e1ddd0', pier: '#d6d1c2', win: [1.7, 1.7], sillY: 0.95, mull: 2, lit: 0.3, blind: 0.3, seed: 35, glass: '#4a5b6c', glass2: '#a2b4c2', frame: '#f1eee4', surround: '#d0c9b6' });
  plasterMat(M, 'sofiaGlassBand', '#58788c', 0.05, 0.4);
  signMat(M, 'sofiaSign', { w: 1024, h: 128, bg: '#0b4f9c', lines: [{ text: 'СОФИЯМЕД', size: 92, color: '#ffffff', y: 68 }] });
  signMat(M, 'sofiaSubSign', { w: 512, h: 64, bg: '#f4f4f0', lines: [{ text: 'УМБАЛ · Блок 1 · Приемно отделение', size: 30, color: '#0b4f9c', y: 34 }] });
  signMat(M, 'clinicSign', { w: 512, h: 96, bg: '#f4f4f0', lines: [{ text: 'МЕДИЦИНСКИ ЦЕНТЪР', size: 44, color: '#0b4f9c', y: 32 }, { text: 'Специализирани амбулатории', size: 26, color: '#444', y: 72 }] });
}

export function buildSofiamed({ world, M, y, replaced }) {
  const parts = replaced.filter((r) => /^Sofiamed/.test(r.entry.note));
  if (!parts.length) return null;
  oncoMaterials(M);
  sofiaMaterials(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  for (const { b: bd, entry, cx, cz } of parts) {
    const poly = Array.from(bd.pts);
    sx += cx; sz += cz;
    if (/Block 1/.test(entry.note)) {
      const r = ward(b, M, world, poly, { facade: 'sofiaWall', floors: 6, minBay: 8, endKey: 'oncoPlaster', plant: 7, seed: 9, antenna: true });
      // entrance: glazed atrium and a canopy at the end of the access road from the boulevard side
      const near = nearestEdge(poly, 975.5, 236.5);
      const e = near.e, gy = y(near.px, near.pz), FL = Math.max(0, r.base - gy);
      b.push(near.px, gy, near.pz, e.yaw);
      b.box('lobbyGlass', 0, 0, 2.0, 10.4, 7.6 + FL, 4.0, 0, { top: false });
      for (let i = -5; i <= 5; i++) b.box('steelDark', i * 1.04, 0, 4.03, 0.08, 7.6 + FL, 0.08, 0, {});
      b.box('steelDark', 0, 3.6 + FL, 4.05, 10.4, 0.08, 0.08, 0, {});
      b.box('concrete', 0, 7.6 + FL, 2.0, 11, 0.4, 4.6, 0, { tw: 4, th: 4 });
      b.push(0, 0, 4.0, 0);
      canopy(b, { w: 13, d: 6, y: 4.6 + FL, th: 0.5, cols: 4, colR: 0.2, slab: 'white', colKey: 'steel', lights: true });
      b.quad('sofiaSign', [-6.5, 4.62 + FL + 0.5, 6.02], [6.5, 4.62 + FL + 0.5, 6.02], [6.5, 4.62 + FL + 1.4, 6.02], [-6.5, 4.62 + FL + 1.4, 6.02]);
      b.pop();
      if (FL > 0.15) steps(b, 'concreteDark', { w: 7, n: Math.max(2, Math.round(FL / 0.16)), rise: FL / Math.max(2, Math.round(FL / 0.16)), tread: 0.35, z0: 4.0 });
      b.quad('sofiaSubSign', [-2.5, 2.4 + FL, 4.1], [2.5, 2.4 + FL, 4.1], [2.5, 2.8 + FL, 4.1], [-2.5, 2.8 + FL, 4.1]);
      b.pop();
      // blue name band high on the long street-side wall
      const long = edgesOf(poly).filter((q) => q.L > 40).sort((p, q) => q.L - p.L)[0];
      if (long) {
        const mx = long.ax + long.tx * long.L * 0.5, mz = long.az + long.tz * long.L * 0.5;
        b.push(mx, y(mx, mz), mz, long.yaw);
        b.quad('sofiaSign', [-6, r.top - y(mx, mz) - 2.8, 0.3], [6, r.top - y(mx, mz) - 2.8, 0.3], [6, r.top - y(mx, mz) - 1.5, 0.3], [-6, r.top - y(mx, mz) - 1.5, 0.3]);
        b.pop();
      }
    } else if (/Block 2/.test(entry.note)) {
      ward(b, M, world, poly, { facade: 'sofiaWall', floors: 6, minBay: 8, endKey: 'oncoPlaster', plant: 4, seed: 12 });
    } else {
      const r = ward(b, M, world, poly, { facade: 'sofiaClinic', floors: 3, minBay: 6, endKey: 'oncoPlaster', plant: 2, seed: 15 });
      const near = nearestEdge(poly, 990, 262);
      const gy = y(near.px, near.pz);
      b.push(near.px, gy, near.pz, near.e.yaw);
      canopy(b, { w: 5.5, d: 3.2, y: 3.0, th: 0.35, cols: 2, colR: 0.14, slab: 'concrete', colKey: 'steel' });
      b.quad('clinicSign', [-2.75, 3.4, 3.22], [2.75, 3.4, 3.22], [2.75, 4.4, 3.22], [-2.75, 4.4, 3.22]);
      doors(b, { x: 0, y: 0, z: 0.1, w: 2.6, h: 2.5 });
      b.pop();
      void r;
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}

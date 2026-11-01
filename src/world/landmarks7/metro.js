// Entrances of the metro stations along line 7 (OSM railway=subway station points in the pack, names checked
// against the place data): Хан Кубрат and Княгиня Мария Луиза (M2), Опълченска (M1), НДК and Централна гара
// (M2), България (M3). Each gets two stair entrances (estimated positions either side of the station point,
// clear of roads, buildings and the tram tracks): the stair well with granite walls and steel railings, a
// glass and steel canopy, the blue "M" totem with the station name (Sofia metro's blue M, estimated design).
import * as THREE from 'three';
import { MeshBuilder } from '../LandmarkGeometry.js';
import { done, mat, std, signMat } from '../LandmarkInstitutionsKit.js';

const NAMES = [
  [-4171.9, -1143.5, 'България'], [-3707.3, -5961.5, 'Хан Кубрат'], [-3198.0, -5025.8, 'Княгиня Мария Луиза'],
  [-3344.6, -3410.5, 'Опълченска'], [-2800.0, -2232.6, 'НДК'], [-2703.4, -2133.3, 'НДК'], [-2548.8, -4621.5, 'Централна гара'],
];

function metroMats(M, name) {
  mat(M, 'l7mBlue', () => std({ color: 0x1351a8, roughness: 0.45 }));
  mat(M, 'l7mGlass', () => new THREE.MeshPhysicalMaterial({ color: 0xa9c4d0, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  signMat(M, 'l7mM', {
    w: 256, h: 256, bg: '#1351a8', lines: [],
    draw: (g) => { g.fillStyle = '#ffffff'; g.font = '800 200px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 128, 140); },
  });
  const key = 'l7mName:' + name;
  signMat(M, key, { w: 512, h: 128, bg: '#ffffff', lines: [{ text: name.toUpperCase(), size: 54, color: '#1351a8', y: 64, weight: 800 }] });
  return key;
}

/** One stair entrance in the current frame: the well along +z from z = 0, going down towards -y. */
function entrance(b, nameKey) {
  const W = 3.2, L = 8.0;
  // the opening of the stair well (the terrain is a height field: the stairs going down are drawn as the dark
  // opening with the first steps), a granite curb round it
  b.box('glassDark', 0, 0.02, L / 2, W, 0.02, L, 0, {});
  for (let i = 0; i < 3; i++) b.box('graniteLight', 0, 0.02, L - 0.2 - i * 0.34, W, 0.05 - i * 0.015, 0.32, 0, {});
  for (const sx of [-1, 1]) b.box('granite', sx * (W / 2 + 0.15), -0.3, L / 2, 0.3, 0.55, L, 0, { tw: 2, th: 2 });
  b.box('granite', 0, -0.3, -0.15, W + 0.6, 0.55, 0.3, 0, { tw: 2, th: 2 });
  // railings along the top of the well, canopy of glass on steel portals
  for (const sx of [-1, 1]) {
    b.box('steel', sx * (W / 2 + 0.15), 0.9, L / 2, 0.06, 0.06, L, 0, {});
    for (let z = 0.5; z < L; z += 1.5) b.box('steel', sx * (W / 2 + 0.15), 0, z, 0.05, 0.9, 0.05, 0, {});
    for (const z of [0.3, L / 2, L - 0.3]) b.box('steelDark', sx * (W / 2 + 0.3), 0, z, 0.14, 3.0, 0.14, 0, {});
  }
  b.box('steelDark', 0, 3.0, L / 2, W + 1.0, 0.18, L + 0.4, 0, { bottom: true });
  b.box('l7mGlass', 0, 3.18, L / 2, W + 0.9, 0.03, L + 0.3, 0, {});
  b.box('l7mBlue', 0, 2.6, L + 0.21, W + 1.0, 0.4, 0.04, 0, {});
  // the totem: blue M over the station name
  b.box('steelDark', W / 2 + 1.2, 0, L + 0.6, 0.12, 3.2, 0.12, 0, {});
  b.box('l7mM', W / 2 + 1.2, 3.2, L + 0.6, 0.9, 0.9, 0.12, 0, {});
  b.quad(nameKey, [-1.6, 2.62, L + 0.235], [1.6, 2.62, L + 0.235], [1.6, 2.98, L + 0.235], [-1.6, 2.98, L + 0.235]);
}

export function buildMetroEntrances({ world, M, route }) {
  const pts = (world.data.props && world.data.props.metro) || [];
  if (!pts.length) return null;
  const out = [];
  const lines = route ? ['A', 'B'].map((d) => route.direction(d).path) : [];
  const near = (x, z) => lines.reduce((m, P) => Math.min(m, P.nearest(x, z).d), Infinity);
  const clear = (x, z, yaw) => {
    // the whole well (8 m) clear of roads, buildings and the tracks
    for (let t = -1; t <= 9; t += 2) {
      const px = x + Math.sin(yaw) * t, pz = z + Math.cos(yaw) * t;
      if (world.roads.onRoad(px, pz, 1.2) || world.bgrid.pointInAny(px, pz) >= 0) return false;
      if (world.sweep && world.sweep.hits(px, pz, 2.2)) return false;
    }
    return true;
  };
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = pts[i] / 10, z = pts[i + 1] / 10;
    if (lines.length && near(x, z) > 450) continue;
    const nm = NAMES.find((q) => Math.hypot(q[0] - x, q[1] - z) < 40);
    if (!nm) continue;
    const key = metroMats(M, nm[2]);
    const b = new MeshBuilder();
    let placed = 0;
    // search a ring round the station point for two clear spots on the pavements
    for (let r = 18; r <= 70 && placed < 2; r += 6) {
      for (let k = 0; k < 16 && placed < 2; k++) {
        const a = (k / 16) * Math.PI * 2 + placed * 0.4;
        const ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r;
        const yaw = a + Math.PI / 2;
        if (!clear(ex, ez, yaw)) continue;
        b.push(ex, world.hf.heightAt(ex, ez), ez, yaw);
        entrance(b, key);
        b.pop();
        placed++;
        k += 6;
      }
    }
    if (placed) out.push(done(b, M, x, z));
  }
  return out.length ? out : null;
}

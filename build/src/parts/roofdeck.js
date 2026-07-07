// ---------------------------------------------------------------------------
// parts/roofdeck.js — a LUXURY ROOFTOP AMENITY DECK that crowns the building.
// A hero shared roof-terrace prop containing, arranged like a real high-end
// rooftop:
//   • composite/timber plank deck floor with a stone-inset pool surround
//   • a raised rectangular PLUNGE POOL with still reflective water, tile liner
//     and an overhanging stone coping edge
//   • 3 instanced SUN LOUNGERS with cushions + round side tables + 2 parasols
//   • an outdoor LOUNGE seating group (L-sofa) around a glowing FIRE-PIT table
//   • a BAR / kitchenette counter with 3 instanced stools
//   • several large PLANTERS with clumpy topiary + a low green hedge edge
//   • a slim PERGOLA strung with CATENARY string-lights over the lounge
//   • a frameless GLASS WIND-SCREEN / balustrade around the whole perimeter
//
//   import { createRoofDeck } from './roofdeck.js';
//   scene.add(createRoofDeck());              // 12 x 8 m, deck sits on roof y=0
//
// Metres, +Y up. Footprint centred on origin: x∈[-w/2,w/2], z∈[-d/2,d/2].
// The roof slab is y=0 (deck underside); the walking surface is y = DECK_TOP.
// Nothing dips below y=0. Repeated furniture / bulbs / shrubs are instanced,
// static hard-surface detail is merged by material to stay well under budget.
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, catenary, mat, palette, shadows, optimize,
  mergeGeometries
} from './kit.js';

// walking-surface height above the roof slab (deck plank thickness).
const DECK_TOP = 0.06;

// --- tiny geometry helpers -------------------------------------------------

// A rotated + translated bevelled-box geometry baked into local space (for
// merging / instancing).
function boxGeo(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 1) {
  const g = bevelBox(w, h, d, r, seg);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// Add a bevelled-box mesh straight into a group.
function box(parent, material, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 1) {
  const mesh = new THREE.Mesh(bevelBox(w, h, d, r, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// Add a cylinder mesh.
function cyl(parent, material, rt, rb, h, x, y, z, seg = 16, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function mergeGeos(list) { return list.length > 1 ? mergeGeometries(list, false) : list[0]; }

// Build an InstancedMesh from merged geometry + a list of [x,z,ry] transforms,
// offset by (ox, baseY, oz).
function makeInstanced(root, geos, material, xf, ox = 0, oz = 0, baseY = 0) {
  const geo = mergeGeos(geos);
  const inst = new THREE.InstancedMesh(geo, material, xf.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  xf.forEach(([x, z, ry], i) => {
    e.set(0, ry, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(ox + x, baseY, oz + z), q, s);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = inst.receiveShadow = true;
  root.add(inst);
  return inst;
}

// ---------------------------------------------------------------------------

export function createRoofDeck(width = 12, depth = 8) {
  const P = palette();
  const root = new THREE.Group();
  root.name = 'RoofDeck';

  const W = width, D = depth, hw = W / 2, hd = D / 2;

  // Extra bespoke materials (pool water, tile, travertine coping, fire glow).
  const M = {
    water: mat(0x1f6b7a, { roughness: 0.045, metalness: 0.15, envMapIntensity: 1.5 }),
    tile:  mat(0x9fd6e2, { roughness: 0.22, envMapIntensity: 0.7 }),
    stone: mat(0xd9d4c6, { roughness: 0.62, envMapIntensity: 0.4 }),
    stoneD:mat(0xbfb9a8, { roughness: 0.7 }),
    teak:  P.wood, teakD: P.woodDark,
    fire:  mat(0xff6a1e, { emissive: 0xff5410, emissiveIntensity: 3.2, roughness: 0.7 }),
    ember: mat(0x2a2320, { roughness: 0.9 })
  };

  // Static (non-instanced) geometry — deck, pool, balustrade, pergola — is
  // collected in S and merged at the end. Furniture that sits ON the deck is
  // collected in F, then lifted to the walking surface before merging.
  const S = new THREE.Group();
  const F = new THREE.Group();

  buildDeck(S, P, M, W, D, hw, hd);
  buildPool(F, P, M);
  buildLoungeGroup(F, P, M);
  buildBar(F, P, M);
  buildParasol(F, P, M, 5.55, 1.05, -2.35, 0.30);
  buildParasol(F, P, M, 5.55, -1.05, 2.35, 0.30);
  buildPlanters(F, P, M, hw, hd);
  buildPergola(S, P, M);
  buildBalustrade(S, P, M, hw, hd);

  // lift furniture onto the walking surface, then merge S (deck) + F together.
  F.position.y = DECK_TOP;
  S.add(F);
  root.add(optimize(S));

  // --- instanced repeated props (kept instanced, added after optimize) ------
  addLoungers(root, P, M);
  addStools(root, P, M);
  addStringLights(root, P);

  shadows(root);
  return root;
}

// ===========================================================================
// DECK — composite/timber planks along X + a stone inset frame around the pool.
// Planks occupy y∈[0, DECK_TOP] so the roof slab (underside) is exactly y=0.
// ===========================================================================
function buildDeck(S, P, M, W, D, hw, hd) {
  const plankPitch = 0.245, plankW = 0.225, h = DECK_TOP;
  const n = Math.max(4, Math.round(D / plankPitch));
  const z0 = -((n - 1) * plankPitch) / 2;
  for (let i = 0; i < n; i++) {
    const zc = z0 + i * plankPitch;
    const m = (i % 2 === 0) ? M.teak : M.teakD;
    box(S, m, W - 0.04, h, plankW, 0.006, 0, h / 2, zc);
  }
  // slim raised curb framing the whole deck.
  box(S, M.teakD, W, 0.09, 0.06, 0.01, 0, 0.045, -hd + 0.03);
  box(S, M.teakD, W, 0.09, 0.06, 0.01, 0, 0.045,  hd - 0.03);
  box(S, M.teakD, 0.06, 0.09, D, 0.01, -hw + 0.03, 0.045, 0);
  box(S, M.teakD, 0.06, 0.09, D, 0.01,  hw - 0.03, 0.045, 0);
  // pale stone paving apron around the pool (right half) for a wet-zone look.
  box(S, M.stoneD, 4.9, 0.065, 5.4, 0.01, 2.7, 0.0325, 0);
}

// ===========================================================================
// POOL — raised rectangular plunge pool: stone shell + tile liner + coping +
// a still, low-roughness reflective water plane. Built on the deck surface
// (y=0 local == walking surface), rim raised ~0.44m like a real plunge pool.
// ===========================================================================
function buildPool(F, P, M) {
  const cx = 2.7, cz = 0;
  const ihx = 1.70, ihz = 2.05;          // interior half-extents
  const t = 0.16;                        // wall thickness
  const wallH = 0.40;
  const ohx = ihx + t, ohz = ihz + t;    // outer half-extents

  // Outer stone shell walls (4).
  box(F, M.stone, ohx * 2, wallH, t, 0.02, cx, wallH / 2, cz + ihz + t / 2);
  box(F, M.stone, ohx * 2, wallH, t, 0.02, cx, wallH / 2, cz - ihz - t / 2);
  box(F, M.stone, t, wallH, ihz * 2, 0.02, cx + ihx + t / 2, wallH / 2, cz);
  box(F, M.stone, t, wallH, ihz * 2, 0.02, cx - ihx - t / 2, wallH / 2, cz);

  // Aqua tile liner: floor + 4 inner faces (gives real perceived depth).
  const floorY = 0.05;
  box(F, M.tile, ihx * 2, 0.05, ihz * 2, 0.004, cx, floorY, cz);
  const linH = wallH - floorY;
  box(F, M.tile, ihx * 2, linH, 0.03, 0.004, cx, floorY + linH / 2, cz + ihz - 0.015);
  box(F, M.tile, ihx * 2, linH, 0.03, 0.004, cx, floorY + linH / 2, cz - ihz + 0.015);
  box(F, M.tile, 0.03, linH, ihz * 2, 0.004, cx + ihx - 0.015, floorY + linH / 2, cz);
  box(F, M.tile, 0.03, linH, ihz * 2, 0.004, cx - ihx + 0.015, floorY + linH / 2, cz);

  // Still reflective water, seated just below the rim.
  const waterY = wallH - 0.07;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(ihx * 2 - 0.02, ihz * 2 - 0.02), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, waterY, cz);
  F.add(water);

  // Overhanging travertine coping cap (4 bars) crowning the walls.
  const capY = wallH + 0.03, capT = 0.06, ov = 0.07;
  const capW = t + 2 * ov;
  box(F, M.stone, ohx * 2 + 2 * ov, capT, capW, 0.012, cx, capY, cz + ihz + t / 2);
  box(F, M.stone, ohx * 2 + 2 * ov, capT, capW, 0.012, cx, capY, cz - ihz - t / 2);
  box(F, M.stone, capW, capT, ihz * 2, 0.012, cx + ihx + t / 2, capY, cz);
  box(F, M.stone, capW, capT, ihz * 2, 0.012, cx - ihx - t / 2, capY, cz);
}

// ===========================================================================
// LOUNGE GROUP — L-shaped sofa framing a glowing gas fire-pit table.
// ===========================================================================
function buildLoungeGroup(F, P, M) {
  // L-sofa in the back-left, opening toward +x/+z (toward the fire-pit).
  const baseH = 0.34, by = baseH / 2, seatMat = P.fabric, backMat = P.cushion;
  // segment A: runs along X (back edge, faces +z).
  const ax = -3.05, az = 0.15;
  box(F, M.teakD, 2.55, baseH, 0.95, 0.03, ax, by, az);
  // segment B: runs along Z (left edge, faces +x).
  const bx = -4.35, bz = 1.45;
  box(F, M.teakD, 0.95, baseH, 2.35, 0.03, bx, by, bz);

  const sy = baseH + 0.10;
  box(F, seatMat, 1.15, 0.18, 0.82, 0.06, ax - 0.62, sy, az, 0, 0, 0, 3);
  box(F, seatMat, 1.15, 0.18, 0.82, 0.06, ax + 0.62, sy, az, 0, 0, 0, 3);
  box(F, seatMat, 0.82, 0.18, 1.10, 0.06, bx, sy, bz + 0.55, 0, 0, 0, 3);
  // back cushions
  const bcy = baseH + 0.32;
  box(F, backMat, 1.18, 0.44, 0.20, 0.07, ax - 0.62, bcy, az - 0.36, -0.06, 0, 0, 3);
  box(F, backMat, 1.18, 0.44, 0.20, 0.07, ax + 0.62, bcy, az - 0.36, -0.06, 0, 0, 3);
  box(F, backMat, 0.20, 0.44, 1.15, 0.07, bx - 0.36, bcy, bz + 0.55, 0, 0, 0.06, 3);
  // throw pillows for warmth
  box(F, P.offwhite, 0.36, 0.36, 0.15, 0.07, ax - 0.9, sy + 0.12, az - 0.18, 0.15, 0.2, 0, 3);
  box(F, P.fabric,   0.36, 0.36, 0.15, 0.07, bx + 0.05, sy + 0.12, bz + 0.9, 0, 0.3, 0.15, 3);

  // FIRE-PIT table in the opening of the L.
  const fx = -2.7, fz = 1.75;
  box(F, M.stone, 1.05, 0.34, 1.05, 0.04, fx, 0.17, fz);      // stone plinth
  box(F, M.ember, 0.62, 0.06, 0.62, 0.02, fx, 0.36, fz);      // lava-rock bed
  box(F, M.fire,  0.5, 0.05, 0.5, 0.02, fx, 0.40, fz);        // glowing flame bed
  // frameless glass wind guard around the flame.
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20, 1, true), P.glassClear);
  guard.position.set(fx, 0.50, fz);
  F.add(guard);
}

// ===========================================================================
// BAR / kitchenette — timber-and-stone counter along the back (-z) edge.
// ===========================================================================
function buildBar(F, P, M) {
  const cx = -3.4, cz = -3.25, len = 2.6, h = 1.02, d = 0.62;
  // cabinet body (timber front) + stone worktop.
  box(F, M.teak, len, h - 0.05, d, 0.02, cx, (h - 0.05) / 2, cz);
  box(F, M.stone, len + 0.08, 0.06, d + 0.08, 0.012, cx, h, cz);      // worktop
  box(F, M.teakD, len - 0.1, 0.02, 0.02, 0.005, cx, 0.12, cz + d / 2 + 0.005); // kick toe line
  // recessed sink + tap suggestion on the worktop.
  box(F, P.darkMetal, 0.42, 0.02, 0.32, 0.01, cx + 0.7, h + 0.02, cz);
  cyl(F, P.steel, 0.02, 0.02, 0.24, cx + 0.7, h + 0.14, cz - 0.1, 10);
  cyl(F, P.steel, 0.02, 0.02, 0.12, cx + 0.7, h + 0.24, cz - 0.04, 10, Math.PI / 2, 0, 0);
  // two front panel seams for a cabinetry read.
  for (const dx of [-0.87, 0.0, 0.87])
    box(F, M.teakD, 0.02, h - 0.12, 0.02, 0.004, cx + dx, (h - 0.05) / 2, cz + d / 2 + 0.004);
}

// ===========================================================================
// PARASOL — pole + octagonal canopy + finial. Static (only two on the deck).
// ===========================================================================
function buildParasol(F, P, M, x, tilt, tiltAxisZ, z) {
  // (x,z) = base; a slight lean toward the loungers via tiltAxisZ.
  const poleH = 2.35;
  cyl(F, P.darkMetal, 0.16, 0.2, 0.05, x, 0.025, z, 16);       // weighted base
  cyl(F, P.steel, 0.028, 0.028, poleH, x, poleH / 2, z, 12);   // pole
  const cx2 = x, cz2 = z, cyTop = poleH;
  // octagonal canopy as a shallow cone.
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.4, 8, 1), P.fabric);
  canopy.position.set(cx2, cyTop + 0.16, cz2);
  F.add(canopy);
  // small hub band + finial.
  cyl(F, P.darkMetal, 0.05, 0.05, 0.06, cx2, cyTop + 0.02, cz2, 10);
  cyl(F, P.steel, 0.03, 0.03, 0.12, cx2, cyTop + 0.42, cz2, 8);
}

// ===========================================================================
// PLANTERS — large tapered pots with clumpy topiary + a low green hedge edge.
// ===========================================================================
function buildPlanters(F, P, M) {
  // Two big planters dividing the pool zone from the lounge zone.
  bigPlanter(F, P, M, 0.5, -1.55, 0.62, true);
  bigPlanter(F, P, M, 0.5, 1.55, 0.62, true);
  // Corner accent trees.
  bigPlanter(F, P, M, -5.35, 3.25, 0.58, false);
  bigPlanter(F, P, M, 5.4, -3.3, 0.55, false);

  // Low green hedge edge running along part of the front (+z) perimeter.
  const hx0 = -5.6, hx1 = -0.7, hz = 3.55;
  box(F, M.stoneD, hx1 - hx0 + 0.3, 0.42, 0.4, 0.02, (hx0 + hx1) / 2, 0.21, hz); // trough
  // hedge foliage as a merged run of clumps.
  const foliage = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hx = hx0 + (hx1 - hx0) * t;
    const r = 0.26 + (i % 2) * 0.04;
    foliage.push(clumpGeo(hx, 0.5, hz, r, i % 3 === 0 ? 0.1 : 0));
  }
  const hedge = new THREE.Mesh(mergeGeos(foliage), P.leaf);
  F.add(hedge);
}

function clumpGeo(x, y, z, r, dy = 0) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(1, 0.82, 1);
  g.translate(x, y + dy, z);
  return g;
}

function bigPlanter(F, P, M, cx, cz, potH, shrub) {
  // Tapered charcoal planter via lathe.
  const prof = [[0, 0], [0.36, 0], [0.37, 0.03], [0.30, potH], [0, potH]];
  const pot = new THREE.Mesh(lathe(prof, 20), P.charcoal);
  pot.position.set(cx, 0, cz);
  F.add(pot);
  cyl(F, P.soil, 0.29, 0.3, 0.05, cx, potH - 0.03, cz, 18);

  if (shrub) {
    // dense low topiary ball (merged clumps).
    const base = potH + 0.34, clumps = [];
    const spec = [
      [0, 0, 0, 0.5, 0], [0.34, -0.1, 0.14, 0.36, 0], [-0.3, -0.06, -0.12, 0.38, 1],
      [0.1, 0.28, -0.06, 0.34, 0], [-0.16, 0.2, 0.26, 0.32, 1], [0.2, -0.18, -0.28, 0.32, 1]
    ];
    for (const [dx, dy, dz, r, dark] of spec) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 0.9, 1); g.translate(cx + dx, base + dy, cz + dz);
      clumps.push([g, dark]);
    }
    F.add(new THREE.Mesh(mergeGeos(clumps.filter(c => !c[1]).map(c => c[0])), P.leaf));
    F.add(new THREE.Mesh(mergeGeos(clumps.filter(c => c[1]).map(c => c[0])), P.leafDark));
  } else {
    // small tree: trunk + airy canopy.
    const trunkH = 0.85;
    cyl(F, P.woodDark, 0.05, 0.07, trunkH, cx, potH + trunkH / 2, cz, 8);
    const base = potH + trunkH + 0.25, clumps = [], dk = [];
    const spec = [
      [0, 0, 0, 0.5, 0], [0.36, 0.05, 0.12, 0.4, 1], [-0.32, 0.02, -0.14, 0.42, 0],
      [0.08, 0.34, -0.05, 0.38, 0], [-0.12, 0.28, 0.28, 0.34, 1], [0.18, -0.14, -0.3, 0.34, 1],
      [-0.05, 0.42, 0.06, 0.32, 0]
    ];
    for (const [dx, dy, dz, r, dark] of spec) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 0.92, 1); g.translate(cx + dx, base + dy, cz + dz);
      (dark ? dk : clumps).push(g);
    }
    F.add(new THREE.Mesh(mergeGeos(clumps), P.leaf));
    F.add(new THREE.Mesh(mergeGeos(dk), P.leafDark));
  }
}

// ===========================================================================
// PERGOLA — slim dark-metal shade frame over the lounge group (left zone).
// Built in S (absolute coords); base sits on the deck surface.
// ===========================================================================
function buildPergola(S, P, M) {
  const y0 = DECK_TOP;
  const postH = 2.5, beamY = y0 + postH - 0.06;
  const xs = [-5.0, -0.7], zs = [-0.4, 3.05];
  for (const px of xs) for (const pz of zs) {
    box(S, P.darkMetal, 0.11, postH, 0.11, 0.02, px, y0 + postH / 2, pz);
    box(S, P.black, 0.22, 0.03, 0.22, 0.01, px, y0 + 0.015, pz);
  }
  const spanX = xs[1] - xs[0], midX = (xs[0] + xs[1]) / 2;
  const spanZ = zs[1] - zs[0], midZ = (zs[0] + zs[1]) / 2;
  // perimeter beams
  box(S, P.darkMetal, spanX + 0.12, 0.13, 0.10, 0.02, midX, beamY, zs[0]);
  box(S, P.darkMetal, spanX + 0.12, 0.13, 0.10, 0.02, midX, beamY, zs[1]);
  box(S, P.darkMetal, 0.10, 0.13, spanZ, 0.02, xs[0], beamY, midZ);
  box(S, P.darkMetal, 0.10, 0.13, spanZ, 0.02, xs[1], beamY, midZ);
  // cross rafters spanning Z
  for (let i = 0; i < 5; i++) {
    const rx = xs[0] + 0.4 + i * ((spanX - 0.8) / 4);
    box(S, P.darkMetal, 0.06, 0.09, spanZ + 0.08, 0.012, rx, beamY + 0.10, midZ);
  }
}

// String-lights strung under the pergola (catenary wire + instanced bulbs).
function addStringLights(root, P) {
  const y0 = DECK_TOP, beamY = y0 + 2.5 - 0.06 + 0.05;
  const x0 = -4.95, x1 = -0.75;
  const bulbMat = mat(0xfff0cf, {
    roughness: 0.3, emissive: 0xffcf7a, emissiveIntensity: 2.6, envMapIntensity: 0.3
  });
  const wireMat = P.black;
  const bulbGeo = new THREE.IcosahedronGeometry(0.05, 1);
  const bulbPos = [];
  for (const z of [-0.1, 0.85, 1.8, 2.75]) {
    const pts = catenary([x0, beamY, z], [x1, beamY, z], 0.34, 16);
    const wire = new THREE.Mesh(tube(pts, 0.008, 5), wireMat);
    wire.castShadow = true;
    root.add(wire);
    for (let i = 1; i < pts.length - 1; i += 2)
      bulbPos.push([pts[i][0], pts[i][1] - 0.055, pts[i][2]]);
  }
  const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPos.length);
  const m = new THREE.Matrix4();
  bulbPos.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m); });
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
}

// ===========================================================================
// BALUSTRADE — frameless glass wind-screen around the whole perimeter:
// continuous brushed base shoe, laminated clear glass panels, round top rail.
// Built in S (absolute); base at y=0.
// ===========================================================================
function buildBalustrade(S, P, M, hw, hd) {
  const H = 1.16, inset = 0.04;
  const shoeH = 0.10, shoeD = 0.08, railR = 0.024;
  const railY = H - railR, glassT = 0.016;
  const glassB = shoeH - 0.02, glassTop = railY, glassH = glassTop - glassB;

  // Each side: (fixed axis, coordinate, from, to, orientation).
  const sides = [
    { horiz: true,  fixed: hd - inset, a: -hw + inset, b: hw - inset },  // +z
    { horiz: true,  fixed: -hd + inset, a: -hw + inset, b: hw - inset }, // -z
    { horiz: false, fixed: hw - inset, a: -hd + inset, b: hd - inset },  // +x
    { horiz: false, fixed: -hw + inset, a: -hd + inset, b: hd - inset }  // -x
  ];

  for (const s of sides) {
    const len = s.b - s.a, mid = (s.a + s.b) / 2;
    // base shoe (single long box).
    if (s.horiz) box(S, P.steel, len, shoeH, shoeD, 0.01, mid, shoeH / 2, s.fixed);
    else         box(S, P.steel, shoeD, shoeH, len, 0.01, s.fixed, shoeH / 2, mid);
    // round top handrail.
    const railGeo = new THREE.CylinderGeometry(railR, railR, len, 14, 1);
    railGeo.rotateZ(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, P.steel);
    if (s.horiz) { rail.position.set(mid, railY, s.fixed); }
    else { railGeo.rotateY(Math.PI / 2); rail.position.set(s.fixed, railY, mid); }
    S.add(rail);
    // glass panels split into ~1.9 m lights with a slim reveal between.
    const nP = Math.max(1, Math.round(len / 1.9));
    const gap = 0.02, pw = (len - gap * (nP - 1)) / nP;
    for (let i = 0; i < nP; i++) {
      const c = s.a + pw / 2 + i * (pw + gap);
      if (s.horiz) box(S, P.glassClear, pw, glassH, glassT, 0.003, c, glassB + glassH / 2, s.fixed, 0, 0, 0, 1);
      else         box(S, P.glassClear, glassT, glassH, pw, 0.003, s.fixed, glassB + glassH / 2, c, 0, 0, 0, 1);
    }
  }
}

// ===========================================================================
// SUN LOUNGERS — one merged geometry per material, instanced 3x beside the
// pool. Local frame: length along X, reclined backrest at the -X (head) end.
// ===========================================================================
function addLoungers(root, P, M) {
  const wood = [], metal = [], cush = [];
  // teak frame slab.
  wood.push(boxGeo(1.78, 0.12, 0.60, 0.02, 0, 0.34, 0));
  // four metal feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    metal.push(boxGeo(0.06, 0.28, 0.06, 0.012, sx * 0.78, 0.14, sz * 0.24));
  // seat cushion (offset toward +x to leave room for the backrest).
  cush.push(boxGeo(1.42, 0.15, 0.54, 0.05, 0.12, 0.475, 0, 0, 0, 0, 3));
  // reclined back cushion at the -x head end.
  cush.push(boxGeo(0.66, 0.14, 0.54, 0.05, -0.72, 0.63, 0, 0, 0, 0.95, 3));
  // bolster pillow.
  cush.push(boxGeo(0.34, 0.13, 0.42, 0.06, -0.5, 0.6, 0, 0, 0, 0, 3));

  // 3 loungers in a column along Z beside the pool, facing -x (toward pool):
  // ry = +PI/2 turns the local +x (foot) toward -z... we instead rotate so the
  // length lies along Z and heads point +z. Use ry = -PI/2.
  const ox = 5.35;
  const xf = [[0, -2.15, -Math.PI / 2], [0, 0, -Math.PI / 2], [0, 2.15, -Math.PI / 2]];
  makeInstanced(root, wood, M.teakD, xf, ox, 0, DECK_TOP);
  makeInstanced(root, metal, P.darkMetal, xf, ox, 0, DECK_TOP);
  makeInstanced(root, cush, P.fabric, xf, ox, 0, DECK_TOP);

  // round side tables between the loungers (static-ish, instanced).
  const tGeo = [
    new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16).translate(0, 0.4, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10).translate(0, 0.2, 0)
  ];
  const tables = new THREE.InstancedMesh(mergeGeos(tGeo), P.darkMetal, 2);
  const m4 = new THREE.Matrix4();
  [[5.05, -1.07], [5.05, 1.07]].forEach(([x, z], i) => {
    m4.makeTranslation(x, DECK_TOP, z); tables.setMatrixAt(i, m4);
  });
  tables.instanceMatrix.needsUpdate = true;
  tables.castShadow = tables.receiveShadow = true;
  root.add(tables);
}

// ===========================================================================
// BAR STOOLS — instanced 3x in front of the bar counter.
// ===========================================================================
function addStools(root, P, M) {
  const legG = [], seatG = [];
  const seatY = 0.66;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    legG.push(boxGeo(0.035, seatY, 0.035, 0.008,
      Math.cos(a) * 0.15, seatY / 2, Math.sin(a) * 0.15));
  }
  legG.push(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14).translate(0, 0.32, 0)); // foot ring
  seatG.push(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 16).translate(0, seatY + 0.035, 0));

  const xf = [[-4.35, 0], [-3.4, 0], [-2.45, 0]];
  const oz = -2.55;
  makeInstanced(root, legG, P.darkMetal, xf.map(([x]) => [x, 0, 0]), 0, oz, DECK_TOP);
  makeInstanced(root, seatG, P.charcoal, xf.map(([x]) => [x, 0, 0]), 0, oz, DECK_TOP);
}

export default createRoofDeck;

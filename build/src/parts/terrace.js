// ---------------------------------------------------------------------------
// parts/terrace.js — a FULLY FURNISHED LUXURY ROOF / PENTHOUSE TERRACE.
// A hero outdoor-living prop: timber deck, modular L-sofa, coffee table,
// dining table + 4 chairs, chaise lounge, 2 olive-tree planters and a slim
// pergola strung with catenary string-lights.
//
//   import { createTerraceSet } from './terrace.js';
//   scene.add(createTerraceSet());          // 6.0 x 4.0 m, deck top at y = 0
//
// Metres, +Y up. Footprint centred on origin: x∈[-w/2,w/2], z∈[-d/2,d/2].
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, catenary, mat, palette, shadows, optimize
} from './kit.js';

// --- tiny geometry helpers -------------------------------------------------

// A rotated + translated bevelled-box geometry (baked into local space).
function boxGeo(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 2) {
  const g = bevelBox(w, h, d, r, seg);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// Add a bevelled box mesh straight into a group.
function box(parent, material, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 2) {
  const mesh = new THREE.Mesh(bevelBox(w, h, d, r, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------

export function createTerraceSet(width = 6.0, depth = 4.0) {
  const P = palette();
  const root = new THREE.Group();
  root.name = 'TerraceSet';

  // Static (non-instanced) furniture lives here and is merged at the end.
  const S = new THREE.Group();

  const W = width, D = depth;
  const hw = W / 2, hd = D / 2;

  // --- DECK -----------------------------------------------------------------
  // Individual timber planks running the long (X) axis with subtle gaps.
  const plankPitch = 0.205, plankW = 0.185, plankH = 0.05;
  const nPlanks = Math.max(4, Math.round(D / plankPitch));
  const z0 = -((nPlanks - 1) * plankPitch) / 2;
  for (let i = 0; i < nPlanks; i++) {
    const zc = z0 + i * plankPitch;
    const m = (i % 2 === 0) ? P.wood : P.woodDark;
    box(S, m, W - 0.04, plankH, plankW, 0.008, 0, -plankH / 2, zc);
  }
  // slim deck border/curb to frame the planks
  box(S, P.woodDark, W, 0.06, 0.04, 0.01, 0, -0.03, -hd + 0.02);
  box(S, P.woodDark, W, 0.06, 0.04, 0.01, 0, -0.03, hd - 0.02);
  box(S, P.woodDark, 0.04, 0.06, D, 0.01, -hw + 0.02, -0.03, 0);
  box(S, P.woodDark, 0.04, 0.06, D, 0.01, hw - 0.02, -0.03, 0);

  // --- L-SHAPED MODULAR SOFA (back-left) -----------------------------------
  buildSofa(S, P);

  // --- COFFEE TABLE (in front of the sofa) ---------------------------------
  buildCoffeeTable(S, P, -1.45, -0.30);

  // --- DINING TABLE (right half) -------------------------------------------
  const dtX = 1.45, dtZ = 0.0;
  buildDiningTable(S, P, dtX, dtZ);

  // --- CHAISE LOUNGE (front-left) ------------------------------------------
  buildChaise(S, P, -1.55, 1.35);

  // --- 2 PLANTERS w/ OLIVE TREES -------------------------------------------
  buildOliveTree(S, P, hw - 0.55, -1.45);
  buildOliveTree(S, P, hw - 0.55, 1.45);

  // --- PERGOLA FRAME --------------------------------------------------------
  const postX = hw - 0.22, postZ = hd - 0.22, postH = 2.45, beamY = 2.32;
  const posts = [[postX, postZ], [-postX, postZ], [postX, -postZ], [-postX, -postZ]];
  for (const [px, pz] of posts) {
    box(S, P.darkMetal, 0.10, postH, 0.10, 0.02, px, postH / 2, pz);
    // small foot plate
    box(S, P.black, 0.20, 0.03, 0.20, 0.01, px, 0.015, pz);
  }
  // perimeter beams
  box(S, P.darkMetal, postX * 2 + 0.12, 0.12, 0.10, 0.02, 0, beamY,  postZ);
  box(S, P.darkMetal, postX * 2 + 0.12, 0.12, 0.10, 0.02, 0, beamY, -postZ);
  box(S, P.darkMetal, 0.10, 0.12, postZ * 2, 0.02,  postX, beamY, 0);
  box(S, P.darkMetal, 0.10, 0.12, postZ * 2, 0.02, -postX, beamY, 0);
  // cross rafters (span Z)
  for (const rx of [-1.4, 0, 1.4]) {
    box(S, P.darkMetal, 0.07, 0.08, postZ * 2 + 0.10, 0.015, rx, beamY + 0.09, 0);
  }

  // Merge all the static geometry (huge draw-call + memory win).
  const merged = optimize(S);
  root.add(merged);

  // --- INSTANCED CHAIRS (x4) -----------------------------------------------
  addDiningChairs(root, P, dtX, dtZ);

  // --- CATENARY STRING-LIGHTS (wire + instanced bulbs) ---------------------
  addStringLights(root, P, postX, beamY - 0.06);

  shadows(root);
  return root;
}

// ===========================================================================
// SOFA — L-shaped, back-left corner. Timber base + pillowy fabric cushions.
// ===========================================================================
function buildSofa(S, P) {
  const baseH = 0.30, baseY = baseH / 2;
  // Segment A: long run along the back wall (-z), spanning x.
  box(S, P.woodDark, 2.30, baseH, 0.92, 0.03, -1.45, baseY, -1.38);
  // Segment B: the "chaise" arm running along the left wall (-x).
  box(S, P.woodDark, 0.92, baseH, 1.55, 0.03, -2.22, baseY, -0.45);

  const seatMat = P.fabric, backMat = P.cushion;
  const seatY = baseH + 0.09;      // seat cushion centre
  const seatR = 0.06;
  // Seat cushions — segment A (two) + segment B (one), rounded & thick.
  box(S, seatMat, 1.06, 0.17, 0.80, seatR, -1.95, seatY, -1.38, 0, 0, 0, 3);
  box(S, seatMat, 1.06, 0.17, 0.80, seatR, -0.85, seatY, -1.38, 0, 0, 0, 3);
  box(S, seatMat, 0.78, 0.17, 1.02, seatR, -2.22, seatY, -0.30, 0, 0, 0, 3);

  // Back cushions — upright, leaning against back (-z) and left (-x) edges.
  const backY = baseH + 0.30;
  box(S, backMat, 1.06, 0.42, 0.18, 0.06, -1.95, backY, -1.72, -0.06, 0, 0, 3);
  box(S, backMat, 1.06, 0.42, 0.18, 0.06, -0.85, backY, -1.72, -0.06, 0, 0, 3);
  box(S, backMat, 0.18, 0.42, 1.00, 0.06, -2.58, backY, -0.30, 0, 0, 0.06, 3);

  // Chunky armrest on the open (+z / right) ends.
  box(S, P.woodDark, 0.20, 0.46, 0.92, 0.03, -0.20, 0.23, -1.38);
  // throw pillow for warmth
  box(S, P.offwhite, 0.34, 0.34, 0.14, 0.07, -1.35, seatY + 0.10, -1.55, 0.2, 0.3, 0, 3);
}

// ===========================================================================
// COFFEE TABLE — low timber top on dark-metal legs + a lower shelf.
// ===========================================================================
function buildCoffeeTable(S, P, cx, cz) {
  const topY = 0.38, tw = 1.05, td = 0.62;
  box(S, P.wood, tw, 0.06, td, 0.02, cx, topY, cz);
  box(S, P.woodDark, tw - 0.20, 0.03, td - 0.16, 0.01, cx, 0.13, cz); // shelf
  const lx = tw / 2 - 0.07, lz = td / 2 - 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(S, P.darkMetal, 0.05, topY - 0.03, 0.05, 0.012, cx + sx * lx, (topY - 0.03) / 2, cz + sz * lz);
  }
}

// ===========================================================================
// DINING TABLE — timber top, four dark-metal legs + apron.
// ===========================================================================
function buildDiningTable(S, P, cx, cz) {
  const topY = 0.74, tw = 1.55, td = 0.92;
  box(S, P.wood, tw, 0.06, td, 0.02, cx, topY, cz);
  box(S, P.woodDark, tw - 0.10, 0.07, td - 0.10, 0.01, cx, topY - 0.07, cz); // apron
  const lx = tw / 2 - 0.10, lz = td / 2 - 0.10;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(S, P.darkMetal, 0.07, topY - 0.11, 0.07, 0.015,
      cx + sx * lx, (topY - 0.11) / 2, cz + sz * lz);
  }
}

// ===========================================================================
// DINING CHAIRS — one merged geometry, instanced 4x around the table.
// ===========================================================================
function addDiningChairs(root, P, cx, cz) {
  // Build a single chair in local space (faces +Z, seat centred at x=z=0).
  const metal = [], pad = [];
  const seatTop = 0.46;
  // front legs
  metal.push(boxGeo(0.05, seatTop, 0.05, 0.012,  0.19, seatTop / 2,  0.19));
  metal.push(boxGeo(0.05, seatTop, 0.05, 0.012, -0.19, seatTop / 2,  0.19));
  // rear uprights (rise to hold the backrest)
  metal.push(boxGeo(0.05, 0.78, 0.05, 0.012,  0.19, 0.39, -0.19));
  metal.push(boxGeo(0.05, 0.78, 0.05, 0.012, -0.19, 0.39, -0.19));
  // seat rails
  metal.push(boxGeo(0.44, 0.04, 0.05, 0.01, 0, seatTop - 0.02,  0.19));
  metal.push(boxGeo(0.44, 0.04, 0.05, 0.01, 0, seatTop - 0.02, -0.19));
  // seat cushion + back cushion (padded)
  pad.push(boxGeo(0.46, 0.09, 0.46, 0.04, 0, seatTop + 0.03, 0, 0, 0, 0, 3));
  pad.push(boxGeo(0.44, 0.40, 0.08, 0.03, 0, 0.72, -0.17, -0.08, 0, 0, 3));

  const chairXf = [
    [1.00, -0.72, 0],
    [1.85, -0.72, 0],
    [1.00,  0.72, Math.PI],
    [1.85,  0.72, Math.PI],
  ];

  makeInstanced(root, metal, P.darkMetal, chairXf, cx, cz);
  makeInstanced(root, pad,   P.cushion,   chairXf, cx, cz);
}

function makeInstanced(root, geos, material, xf, ox, oz) {
  const geo = geos.length > 1 ? mergeGeos(geos) : geos[0];
  const inst = new THREE.InstancedMesh(geo, material, xf.length);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  xf.forEach(([x, z, ry], i) => {
    e.set(0, ry, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(ox + x, 0, oz + z), q, s);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = inst.receiveShadow = true;
  root.add(inst);
}

// mergeGeometries is re-exported through kit but simplest to import lazily:
import { mergeGeometries } from './kit.js';
function mergeGeos(list) { return mergeGeometries(list, false); }

// ===========================================================================
// CHAISE LOUNGE — low timber frame, reclined back, thick fabric cushion.
// ===========================================================================
function buildChaise(S, P, cx, cz) {
  const len = 1.75, wid = 0.62;
  const frameY = 0.24, frameH = 0.24;
  box(S, P.woodDark, len, frameH, wid, 0.03, cx, frameY, cz);
  // low feet
  const lx = len / 2 - 0.10, lz = wid / 2 - 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(S, P.darkMetal, 0.06, 0.12, 0.06, 0.012, cx + sx * lx, 0.06, cz + sz * lz);
  }
  // seat cushion
  box(S, P.fabric, len - 0.10, 0.16, wid - 0.06, 0.06, cx, frameY + frameH / 2 + 0.08, cz, 0, 0, 0, 3);
  // reclined backrest at the -x (head) end
  const bx = cx - len / 2 + 0.06;
  box(S, P.woodDark, 0.10, 0.52, wid, 0.02, bx - 0.04, 0.50, cz, 0, 0, -0.32);
  box(S, P.fabric, 0.16, 0.50, wid - 0.08, 0.06, bx + 0.06, 0.55, cz, 0, 0, -0.32, 3);
  // small bolster pillow
  box(S, P.offwhite, 0.30, 0.16, wid - 0.14, 0.07, cx + len / 2 - 0.28, frameY + frameH / 2 + 0.14, cz, 0, 0, 0, 3);
}

// ===========================================================================
// OLIVE TREE — tapered planter + soil + trunk + clumpy topiary canopy.
// ===========================================================================
function buildOliveTree(S, P, cx, cz) {
  // Planter (solid tapered frustum via lathe): wider at the base.
  const potH = 0.56;
  const potProfile = [[0, 0], [0.30, 0], [0.31, 0.03], [0.245, potH], [0, potH]];
  const pot = new THREE.Mesh(lathe(potProfile, 20), P.charcoal);
  pot.position.set(cx, 0, cz);
  S.add(pot);
  // soil
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.235, 0.05, 18), P.soil);
  soil.position.set(cx, potH - 0.03, cz);
  S.add(soil);
  // trunk
  const trunkH = 0.72;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, trunkH, 8), P.woodDark);
  trunk.position.set(cx, potH + trunkH / 2 - 0.02, cz);
  S.add(trunk);

  // Canopy: overlapping icosphere clumps (leaf + leafDark) for an olive topiary.
  const baseY = potH + trunkH + 0.15;
  const clumps = [
    [0.00, 0.00, 0.00, 0.46, P.leaf],
    [0.34, -0.12, 0.14, 0.34, P.leafDark],
    [-0.30, -0.08, -0.10, 0.36, P.leaf],
    [0.10, 0.26, -0.06, 0.33, P.leaf],
    [-0.16, 0.18, 0.26, 0.30, P.leafDark],
    [0.20, -0.20, -0.28, 0.30, P.leafDark],
    [-0.05, 0.34, 0.05, 0.28, P.leaf],
  ];
  for (const [dx, dy, dz, r, m] of clumps) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
    c.position.set(cx + dx, baseY + dy, cz + dz);
    c.scale.y = 0.92;
    S.add(c);
  }
}

// ===========================================================================
// STRING-LIGHTS — catenary wires strung across the pergola + instanced bulbs.
// ===========================================================================
function addStringLights(root, P, spanX, topY) {
  const wireMat = P.black;
  const bulbMat = mat(0xfff0cf, {
    roughness: 0.3, emissive: 0xffcf7a, emissiveIntensity: 2.4, envMapIntensity: 0.3
  });
  const bulbGeo = new THREE.IcosahedronGeometry(0.045, 1);
  const bulbPos = [];

  const strandZ = [-1.15, 0.0, 1.15];
  const steps = 16;
  for (const z of strandZ) {
    const pts = catenary([-spanX + 0.05, topY, z], [spanX - 0.05, topY, z], 0.32, steps);
    const wire = new THREE.Mesh(tube(pts.map(p => p), 0.008, 5), wireMat);
    wire.castShadow = true;
    root.add(wire);
    // hang a bulb every other node (skip the two ends)
    for (let i = 1; i < pts.length - 1; i += 2) {
      bulbPos.push([pts[i][0], pts[i][1] - 0.05, pts[i][2]]);
    }
  }

  const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPos.length);
  const m = new THREE.Matrix4();
  bulbPos.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m); });
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
}

export default createTerraceSet;

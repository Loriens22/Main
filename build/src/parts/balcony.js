// ---------------------------------------------------------------------------
// parts/balcony.js — FURNISHED BALCONY SETS for the projecting balcony slabs.
// Each set is genuinely 3D outdoor furniture with real thickness, arranged to
// fit a SHALLOW real-world balcony (default 3.0 m wide x 1.6 m deep). Every
// piece sits on the balcony floor at y = 0.
//
//   import { createBalconyLounge, createBalconyDining, createBalconyGarden }
//     from './balcony.js';
//   scene.add(createBalconyLounge());        // 3.0 x 1.6 m, floor at y = 0
//
// Metres, +Y up. Footprint centred on origin: x∈[-w/2,w/2], z∈[-d/2,d/2].
// +Z is the balcony edge / outward, -Z is the wall side.
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, mat, palette, shadows, optimize, mergeGeometries
} from './kit.js';

// --- tiny geometry helpers -------------------------------------------------

// A rotated + translated bevelled-box geometry (baked into local space).
function boxGeo(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 1) {
  const g = bevelBox(w, h, d, r, seg);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// Add a bevelled box mesh straight into a group. seg=1 keeps rounded boxes
// cheap (~108 tris) while still catching highlights on the bevels.
function box(parent, material, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 1) {
  const mesh = new THREE.Mesh(bevelBox(w, h, d, r, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// Add a cylinder mesh.
function cyl(parent, material, rTop, rBot, h, x, y, z, seg = 20, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// Add an icosphere (leaf clump / foliage blob).
function blob(parent, material, r, x, y, z, sy = 0.9) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
  mesh.position.set(x, y, z);
  mesh.scale.y = sy;
  parent.add(mesh);
  return mesh;
}

// A leafy, slightly irregular shrub/canopy from overlapping clumps.
function foliage(parent, matA, matB, cx, cy, cz, spread, clumps) {
  for (const [dx, dy, dz, r, useB] of clumps) {
    const b = blob(parent, useB ? matB : matA, r * spread, cx + dx, cy + dy, cz + dz);
    b.rotation.set(dx, dz, dy);
  }
}

// ===========================================================================
// A small woven/timber outdoor arm-chair, built as a nested group so it can be
// rotated freely. Faces +Z (backrest at -z). ~0.80 m tall. Returns the group.
// ===========================================================================
function makeChair(P, opts = {}) {
  const g = new THREE.Group();
  const frame = opts.frame || P.woodDark;
  const seatMat = opts.seat || P.fabric;
  const backMat = opts.back || P.cushion;
  const arms = opts.arms !== false;
  const seatTop = 0.42, hw = 0.24, hd = 0.23;

  // four tapered legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, frame, 0.045, seatTop, 0.045, 0.012, sx * hw, seatTop / 2, sz * hd);
  }
  // seat rails (apron)
  box(g, frame, hw * 2 + 0.045, 0.045, 0.05, 0.012, 0, seatTop - 0.03, hd);
  box(g, frame, hw * 2 + 0.045, 0.045, 0.05, 0.012, 0, seatTop - 0.03, -hd);
  box(g, frame, 0.05, 0.045, hd * 2, 0.012, hw, seatTop - 0.03, 0);
  box(g, frame, 0.05, 0.045, hd * 2, 0.012, -hw, seatTop - 0.03, 0);
  // rear uprights rise to hold the backrest
  box(g, frame, 0.045, 0.42, 0.045, 0.012, hw, seatTop + 0.19, -hd);
  box(g, frame, 0.045, 0.42, 0.045, 0.012, -hw, seatTop + 0.19, -hd);
  // optional arm rails + front posts
  if (arms) {
    for (const sx of [-1, 1]) {
      box(g, frame, 0.05, 0.045, hd * 2 + 0.05, 0.012, sx * hw, seatTop + 0.20, 0.01);
      box(g, frame, 0.045, 0.20, 0.045, 0.012, sx * hw, seatTop + 0.10, hd);
    }
  }
  // plush seat cushion
  box(g, seatMat, hw * 2 - 0.02, 0.09, hd * 2 - 0.02, 0.04, 0, seatTop + 0.05, 0, 0, 0, 0, 1);
  // reclined back cushion
  box(g, backMat, hw * 2 - 0.04, 0.40, 0.10, 0.05, 0, seatTop + 0.24, -hd + 0.02, -0.10, 0, 0, 1);
  return g;
}

// ===========================================================================
// A terracotta / glazed plant pot (tapered) with soil. Returns a group.
// ===========================================================================
function makePot(P, potMat, rTop, rBot, h, cx, cz) {
  const g = new THREE.Group();
  const prof = [
    [0, 0], [rBot, 0], [rBot + 0.012, 0.02],
    [rTop, h - 0.02], [rTop + 0.02, h], [rTop - 0.015, h], [0, h - 0.02]
  ];
  const pot = new THREE.Mesh(lathe(prof, 16), potMat);
  pot.position.set(cx, 0, cz);
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(rTop - 0.02, rTop - 0.03, 0.04, 14), P.soil);
  soil.position.set(cx, h - 0.03, cz);
  g.add(soil);
  return g;
}

// ===========================================================================
// EXPORT 1 — createBalconyLounge
// 2-seat sofa + cushions + folded throw, a low round side table, a potted
// plant and a soft rug, all inside a shallow balcony.
// ===========================================================================
export function createBalconyLounge(width = 3.0, depth = 1.6) {
  const P = palette();
  const root = new THREE.Group();
  root.name = 'BalconyLounge';
  const S = new THREE.Group();      // merged static furniture
  const hw = width / 2, hd = depth / 2;

  const throwMat = mat(0xb8875c, { roughness: 0.9 });   // warm terracotta throw
  const cushWarm = mat(0x5f7a6b, { roughness: 0.95 });  // sage accent cushion

  // --- soft rug under the seating (thin, rounded) ---------------------------
  const rug = mat(0xcabfa8, { roughness: 1.0 });
  box(S, rug, width - 0.5, 0.014, depth - 0.34, 0.03, 0, 0.007, 0.02);
  box(S, mat(0xb0a48c, { roughness: 1.0 }), width - 0.62, 0.016, depth - 0.46, 0.03, 0, 0.009, 0.02);

  // --- 2-SEAT SOFA against the wall (-z) ------------------------------------
  const sofaW = 1.72, sofaCx = -0.42, sofaCz = -hd + 0.40, sofaD = 0.72;
  const baseH = 0.30, baseY = baseH / 2;
  // plinth base
  box(S, P.woodDark, sofaW, baseH, sofaD, 0.03, sofaCx, baseY, sofaCz);
  // arms
  box(S, P.woodDark, 0.16, 0.50, sofaD, 0.03, sofaCx - sofaW / 2 + 0.08, 0.25, sofaCz);
  box(S, P.woodDark, 0.16, 0.50, sofaD, 0.03, sofaCx + sofaW / 2 - 0.08, 0.25, sofaCz);
  // two seat cushions
  const seatY = baseH + 0.08, seatD = sofaD - 0.14;
  box(S, P.fabric, 0.72, 0.15, seatD, 0.06, sofaCx - 0.37, seatY, sofaCz + 0.03, 0, 0, 0, 2);
  box(S, P.fabric, 0.72, 0.15, seatD, 0.06, sofaCx + 0.37, seatY, sofaCz + 0.03, 0, 0, 0, 2);
  // two back cushions (leaning)
  const backY = baseH + 0.28;
  box(S, P.cushion, 0.74, 0.38, 0.16, 0.06, sofaCx - 0.37, backY, sofaCz - sofaD / 2 + 0.14, -0.10, 0, 0, 1);
  box(S, P.cushion, 0.74, 0.38, 0.16, 0.06, sofaCx + 0.37, backY, sofaCz - sofaD / 2 + 0.14, -0.10, 0, 0, 1);
  // two throw pillows
  box(S, cushWarm, 0.30, 0.30, 0.12, 0.06, sofaCx - 0.55, seatY + 0.14, sofaCz - 0.05, 0.18, 0.2, 0, 1);
  box(S, P.offwhite, 0.30, 0.30, 0.12, 0.06, sofaCx + 0.55, seatY + 0.14, sofaCz - 0.05, 0.18, -0.2, 0, 1);
  // folded throw draped over the right seat
  box(S, throwMat, 0.40, 0.06, seatD + 0.06, 0.03, sofaCx + 0.42, seatY + 0.11, sofaCz + 0.05, 0.03, 0, 0, 1);
  box(S, throwMat, 0.40, 0.14, 0.14, 0.03, sofaCx + 0.42, seatY + 0.07, sofaCz + seatD / 2 + 0.02, 0, 0, 0, 1);

  // --- LOW ROUND SIDE TABLE (right of sofa) ---------------------------------
  const stX = 0.86, stZ = -hd + 0.42, stTop = 0.40;
  cyl(S, P.wood, 0.24, 0.24, 0.05, stX, stTop, stZ, 20);
  cyl(S, P.darkMetal, 0.03, 0.03, stTop - 0.05, stX, (stTop - 0.05) / 2, stZ, 12);
  cyl(S, P.darkMetal, 0.16, 0.18, 0.02, stX, 0.01, stZ, 16);   // foot disc
  // a little book + cup on the table
  box(S, mat(0x7a4a52, { roughness: 0.8 }), 0.16, 0.03, 0.12, 0.006, stX - 0.04, stTop + 0.04, stZ + 0.02);
  cyl(S, P.white, 0.035, 0.03, 0.05, stX + 0.07, stTop + 0.05, stZ - 0.03, 14);

  // --- POTTED PLANT in the front-right corner -------------------------------
  const potX = hw - 0.30, potZ = hd - 0.30, potH = 0.34;
  S.add(makePot(P, P.charcoal, 0.18, 0.14, potH, potX, potZ));
  // leafy shrub
  const shrub = new THREE.Group();
  foliage(shrub, P.leaf, P.leafDark, potX, potH + 0.24, potZ, 1.0, [
    [0.00, 0.00, 0.00, 0.20, false],
    [0.14, 0.06, 0.05, 0.15, true],
    [-0.12, 0.04, -0.06, 0.16, false],
    [0.02, 0.18, -0.02, 0.15, true],
    [-0.06, 0.12, 0.13, 0.13, false],
    [0.10, -0.06, -0.12, 0.13, true],
  ]);
  S.add(shrub);

  const merged = optimize(S);
  root.add(merged);

  // --- one loose accent chair angled in the front-left corner ---------------
  const chair = makeChair(P, { frame: P.woodDark, seat: P.fabric, back: cushWarm });
  chair.position.set(-hw + 0.42, 0, hd - 0.44);
  chair.rotation.y = -Math.PI * 0.72;
  chair.scale.setScalar(0.92);
  root.add(chair);

  shadows(root);
  return root;
}

// ===========================================================================
// EXPORT 2 — createBalconyDining
// Compact bistro set: a round pedestal table + 2 chairs, two potted herbs and
// a small glowing lantern.
// ===========================================================================
export function createBalconyDining(width = 3.0, depth = 1.6) {
  const P = palette();
  const root = new THREE.Group();
  root.name = 'BalconyDining';
  const S = new THREE.Group();
  const hw = width / 2, hd = depth / 2;

  const tblX = 0.0, tblZ = -0.05, topY = 0.73, topR = 0.42;

  // --- subtle floor mat under the set ---------------------------------------
  box(S, mat(0xc7bda6, { roughness: 1.0 }), 1.7, 0.012, depth - 0.4, 0.03, tblX, 0.006, tblZ);

  // --- ROUND PEDESTAL BISTRO TABLE ------------------------------------------
  cyl(S, P.wood, topR, topR, 0.045, tblX, topY, tblZ, 24);
  cyl(S, P.woodDark, topR - 0.04, topR - 0.04, 0.02, tblX, topY - 0.045, tblZ, 24); // underside rim
  cyl(S, P.darkMetal, 0.045, 0.055, topY - 0.06, tblX, (topY - 0.06) / 2 + 0.01, tblZ, 16); // column
  cyl(S, P.darkMetal, 0.055, 0.055, 0.06, tblX, topY - 0.09, tblZ, 16); // collar under top
  cyl(S, P.darkMetal, 0.28, 0.30, 0.025, tblX, 0.013, tblZ, 24); // cast foot
  cyl(S, P.black, 0.30, 0.30, 0.006, tblX, 0.003, tblZ, 24);

  // --- a small glowing LANTERN on the table ---------------------------------
  const lanX = tblX + 0.02, lanZ = tblZ + 0.02, lanBase = topY + 0.045;
  cyl(S, P.darkMetal, 0.05, 0.06, 0.02, lanX, lanBase + 0.01, lanZ, 12);      // foot
  const glassMat = mat(0xfff3d8, { roughness: 0.15, transparent: true, opacity: 0.55, envMapIntensity: 1.0 });
  cyl(S, glassMat, 0.045, 0.045, 0.11, lanX, lanBase + 0.075, lanZ, 12);       // glass chimney
  const flame = mat(0xffd27a, { roughness: 0.3, emissive: 0xffb347, emissiveIntensity: 3.0 });
  cyl(S, flame, 0.02, 0.02, 0.05, lanX, lanBase + 0.06, lanZ, 10);             // candle glow
  cyl(S, P.darkMetal, 0.055, 0.045, 0.03, lanX, lanBase + 0.145, lanZ, 12);    // cap
  // top ring handle
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), P.darkMetal);
  ring.position.set(lanX, lanBase + 0.19, lanZ);
  ring.rotation.x = Math.PI / 2;
  S.add(ring);

  // --- two potted HERBS at the outer corners --------------------------------
  const herb = (cx, cz, matA) => {
    S.add(makePot(P, P.offwhite, 0.11, 0.085, 0.22, cx, cz));
    const g = new THREE.Group();
    // upright leafy herb tuft
    foliage(g, matA, P.leafDark, cx, 0.30, cz, 0.72, [
      [0.00, 0.03, 0.00, 0.15, false],
      [0.07, 0.11, 0.03, 0.12, true],
      [-0.06, 0.09, -0.04, 0.12, false],
      [-0.02, 0.18, 0.05, 0.11, true],
    ]);
    S.add(g);
  };
  herb(-hw + 0.28, -hd + 0.26, P.leaf);
  herb(hw - 0.28, -hd + 0.26, mat(0x6f9b4a, { roughness: 0.75 }));

  const merged = optimize(S);
  root.add(merged);

  // --- TWO CHAIRS across the table (along x) --------------------------------
  const chairMetal = { frame: P.darkMetal, seat: P.cushion, back: P.fabric, arms: false };
  const cA = makeChair(P, chairMetal);
  cA.position.set(tblX - 0.66, 0, tblZ + 0.02);
  cA.rotation.y = Math.PI / 2;      // faces +x toward table
  root.add(cA);
  const cB = makeChair(P, chairMetal);
  cB.position.set(tblX + 0.66, 0, tblZ + 0.02);
  cB.rotation.y = -Math.PI / 2;     // faces -x toward table
  root.add(cB);

  shadows(root);
  return root;
}

// ===========================================================================
// EXPORT 3 — createBalconyGarden
// A green balcony: a row of planters with shrubs / a small tree + trailing
// greenery, a watering can and a single chair. Lush but tidy.
// ===========================================================================
export function createBalconyGarden(width = 3.0, depth = 1.6) {
  const P = palette();
  const root = new THREE.Group();
  root.name = 'BalconyGarden';
  const S = new THREE.Group();
  const hw = width / 2, hd = depth / 2;

  const leafMid = mat(0x4f8f3e, { roughness: 0.75 });
  const leafPale = mat(0x84ad55, { roughness: 0.7 });

  // --- LONG TROUGH PLANTER along the wall (-z) ------------------------------
  const troughZ = -hd + 0.24, troughH = 0.30, troughW = width - 0.5;
  box(S, P.woodDark, troughW, troughH, 0.34, 0.02, 0, troughH / 2, troughZ);
  box(S, P.wood, troughW - 0.06, 0.05, 0.30, 0.015, 0, troughH - 0.02, troughZ); // top rim
  box(S, P.soil, troughW - 0.10, 0.06, 0.24, 0.01, 0, troughH - 0.06, troughZ);  // soil bed

  // shrubs planted along the trough
  const shrubX = [-0.95, -0.5, -0.05, 0.42, 0.9];
  shrubX.forEach((sx, i) => {
    const g = new THREE.Group();
    const alt = i % 2 === 0;
    foliage(g, alt ? leafMid : leafPale, P.leafDark, sx, troughH + 0.15, troughZ, 0.86, [
      [0.00, 0.02, 0.00, 0.18, false],
      [0.10, 0.10, 0.05, 0.14, true],
      [-0.09, 0.08, -0.05, 0.14, false],
    ]);
    S.add(g);
  });

  // --- a taller SLIM TREE at the right end ----------------------------------
  const treeX = hw - 0.34, treeZ = -hd + 0.30, potH = 0.40;
  S.add(makePot(P, P.charcoal, 0.20, 0.16, potH, treeX, treeZ));
  cyl(S, P.woodDark, 0.035, 0.05, 0.62, treeX, potH + 0.30, treeZ, 8);           // trunk
  const canopy = new THREE.Group();
  foliage(canopy, leafMid, P.leafDark, treeX, potH + 0.82, treeZ, 1.05, [
    [0.00, 0.00, 0.00, 0.27, false],
    [0.21, -0.07, 0.10, 0.20, true],
    [-0.18, -0.04, -0.08, 0.21, false],
    [0.05, 0.20, -0.04, 0.19, true],
    [-0.08, 0.15, 0.16, 0.18, false],
  ]);
  S.add(canopy);

  // --- trailing greenery spilling over the trough front edge ----------------
  const trailFrontZ = troughZ + 0.18;
  for (const tx of [-0.85, -0.15, 0.6]) {
    const g = new THREE.Group();
    // small blobs cascading downward at decreasing size
    let y = troughH - 0.02;
    for (let k = 0; k < 3; k++) {
      const r = 0.095 - k * 0.016;
      blob(g, k % 2 ? leafPale : leafMid, r, tx + (k % 2 ? 0.03 : -0.02), y, trailFrontZ + k * 0.02, 0.85);
      y -= 0.085;
    }
    S.add(g);
  }

  // --- WATERING CAN on the floor (front-left) -------------------------------
  const wcX = -hw + 0.40, wcZ = hd - 0.34;
  const canMat = P.steel;
  const canProf = [
    [0, 0], [0.115, 0], [0.12, 0.02], [0.11, 0.20], [0.095, 0.235], [0.06, 0.245], [0, 0.245]
  ];
  const canBody = new THREE.Mesh(lathe(canProf, 16), canMat);
  canBody.position.set(wcX, 0, wcZ);
  S.add(canBody);
  // spout
  const spout = new THREE.Mesh(tube([
    [wcX + 0.08, 0.10, wcZ], [wcX + 0.20, 0.14, wcZ], [wcX + 0.30, 0.24, wcZ]
  ], 0.022, 6, 8), canMat);
  S.add(spout);
  // rose head at spout tip
  cyl(S, canMat, 0.05, 0.035, 0.04, wcX + 0.31, 0.25, wcZ, 8, 0, 0, Math.PI / 2.4);
  // top arch handle
  const handle = new THREE.Mesh(tube([
    [wcX - 0.06, 0.22, wcZ], [wcX - 0.02, 0.34, wcZ], [wcX + 0.06, 0.34, wcZ], [wcX + 0.10, 0.22, wcZ]
  ], 0.016, 6, 10), canMat);
  S.add(handle);

  const merged = optimize(S);
  root.add(merged);

  // --- a single comfy chair in the front-right corner -----------------------
  const chair = makeChair(P, { frame: P.wood, seat: P.fabric, back: P.cushion });
  chair.position.set(hw - 0.44, 0, hd - 0.44);
  chair.rotation.y = -Math.PI * 0.78;
  root.add(chair);

  shadows(root);
  return root;
}

export default createBalconyLounge;

// ---------------------------------------------------------------------------
// parts/interiors.js — LUXURY INTERIOR ROOM SETS seen THROUGH the glazing.
// These rooms sit BEHIND the floor-to-ceiling glass and give the building a
// warm, richly furnished life when viewed from outside.
//
//   import { createLivingRoom, createKitchen, createBedroom } from './interiors.js';
//   scene.add(createLivingRoom());   // 3.2 x 3.0 x 4.5 m
//
// CONVENTIONS (integration depends on these):
//   Metres, +Y up. Room centred on X: x∈[-w/2, w/2].
//   FLOOR surface at y=0, up to CEILING at y=height.
//   GLASS/window plane is z=0; the room extends INTO −Z (back wall at z=−depth).
//   Furniture faces +Z, toward the viewer / glass.
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, mat, palette, shadows, optimize
} from './kit.js';

// --- tiny helpers ----------------------------------------------------------

// Add a bevelled-box mesh straight into a group. r=0 -> crisp slab (12 tris).
function box(parent, material, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 1) {
  const mesh = new THREE.Mesh(bevelBox(w, h, d, r, seg), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
// Crisp slab (no bevel) — for walls, floors, panels.
function slab(parent, material, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  return box(parent, material, w, h, d, 0, x, y, z, rx, ry, rz);
}
// Add an arbitrary geometry.
function put(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// Warm 2700K interior lighting materials + a few finishes not in the palette.
function interiorMats() {
  const P = palette();
  return {
    P,
    downlight:  mat(0xfff2d8, { emissive: 0xffcf8a, emissiveIntensity: 1.6, roughness: 0.4 }),
    coveGlow:   mat(0xffe9c6, { emissive: 0xffb968, emissiveIntensity: 0.85, roughness: 0.6 }),
    ceilGlow:   mat(0xfff4e6, { emissive: 0xffd9a6, emissiveIntensity: 0.32, roughness: 0.8 }),
    lampWarm:   mat(0xfff0d6, { emissive: 0xffc879, emissiveIntensity: 1.15, roughness: 0.5 }),
    screen:     mat(0x0a0d14, { roughness: 0.12, metalness: 0.4, emissive: 0x14243a, emissiveIntensity: 0.28, envMapIntensity: 1.2 }),
    porcelain:  mat(0xe9e7e1, { roughness: 0.3,  metalness: 0.0, envMapIntensity: 0.8 }),
    marble:     mat(0xecebe6, { roughness: 0.22, metalness: 0.0, envMapIntensity: 0.9 }),
    stoneWall:  mat(0xbcb6ab, { roughness: 0.85, envMapIntensity: 0.4 }),
    brass:      mat(0xc9a25a, { roughness: 0.32, metalness: 0.95, envMapIntensity: 1.1 }),
    linen:      mat(0xeae4d8, { roughness: 0.95 }),
    duvet:      mat(0xe7e1d4, { roughness: 0.92 }),
    accent:     mat(0x7d5a48, { roughness: 0.7 }),          // warm accent textile
    rugA:       mat(0xb8a892, { roughness: 0.97 }),
    rugB:       mat(0x8a7a64, { roughness: 0.97 }),
    art1:       mat(0x9a6b4f, { roughness: 0.8 }),
    art2:       mat(0x4a5f6b, { roughness: 0.8 }),
    art3:       mat(0xb08a52, { roughness: 0.8 })
  };
}

// ===========================================================================
// SHELL — floor, back feature wall, two side walls, ceiling + warm lighting.
// Returns nothing; adds into the static group S. Floor surface at y=0.
// ===========================================================================
function buildShell(S, M, W, H, D, opts = {}) {
  const { P } = M;
  const t = 0.06;                       // wall thickness
  const hw = W / 2, cz = -D / 2;
  const floorMat = opts.floorMat || P.wood;
  const wallMat  = opts.wallMat  || P.offwhite;

  // FLOOR — surface at y=0, thin slab below.
  if (opts.planks) {
    // oak planks running along X, subtle two-tone.
    const pitch = 0.24, pw = 0.222, ph = 0.05;
    const n = Math.max(4, Math.round(D / pitch));
    const z0 = -((n - 1) * pitch) / 2 + cz;
    for (let i = 0; i < n; i++) {
      const m = (i % 3 === 0) ? P.woodDark : floorMat;
      slab(S, m, W, ph, pw, 0, -ph / 2, z0 + i * pitch);
    }
  } else {
    slab(S, floorMat, W, 0.05, D, 0, -0.025, cz);
  }
  // thin skirting where floor meets back wall
  slab(S, wallMat, W, 0.09, 0.02, 0, 0.045, -D + t + 0.01);

  // BACK feature wall (behind furniture).
  slab(S, wallMat, W, H, t, 0, H / 2, -D + t / 2);
  if (opts.feature === 'slats') {
    // vertical timber slats over the back wall
    const sn = 15, sp = W / sn;
    for (let i = 0; i < sn; i++) {
      const x = -hw + sp * (i + 0.5);
      slab(S, i % 2 ? P.woodDark : P.wood, sp * 0.62, H - 0.16, 0.035, x, H / 2, -D + t + 0.017);
    }
  } else if (opts.feature === 'stone') {
    slab(S, M.stoneWall, W - 0.02, H - 0.02, 0.05, 0, H / 2, -D + t + 0.02);
  } else if (opts.feature === 'panel') {
    // upholstered / painted panelling — a grid of shallow raised panels
    const cols = 4, rows = 2, mgn = 0.12;
    const pw = (W - mgn * (cols + 1)) / cols;
    const ph = (H - mgn * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -hw + mgn + pw / 2 + c * (pw + mgn);
      const y = mgn + ph / 2 + r * (ph + mgn);
      slab(S, opts.panelMat || M.accent, pw, ph, 0.03, x, y, -D + t + 0.015);
    }
  }

  // SIDE walls (kept inside the footprint).
  for (const s of [-1, 1]) {
    slab(S, wallMat, t, H, D, s * (hw - t / 2), H / 2, cz);
  }

  // CEILING slab.
  slab(S, wallMat, W, t, D, 0, H - t / 2, cz);
  // faint full-ceiling glow so the room reads bright from outside.
  put(S, new THREE.PlaneGeometry(W - 0.3, D - 0.3), M.ceilGlow, 0, H - t - 0.005, cz, Math.PI / 2, 0, 0);

  // COVE glow — a soft emissive strip inset around the ceiling perimeter.
  const ins = 0.22, cy = H - 0.10;
  slab(S, M.coveGlow, W - ins * 2, 0.04, 0.05, 0, cy, -D + ins);
  slab(S, M.coveGlow, W - ins * 2, 0.04, 0.05, 0, cy, -ins);
  slab(S, M.coveGlow, 0.05, 0.04, D - ins * 2, -hw + ins, cy, cz);
  slab(S, M.coveGlow, 0.05, 0.04, D - ins * 2,  hw - ins, cy, cz);

  // RECESSED downlights — small warm discs flush with the ceiling.
  const dgeo = new THREE.CylinderGeometry(0.065, 0.075, 0.02, 14);
  for (const dx of [-W / 4, W / 4]) {
    for (const dz of [cz - D / 4, cz, cz + D / 4]) {
      put(S, dgeo, M.downlight, dx, H - t - 0.01, dz);
    }
  }
}

// ===========================================================================
// FRAMED ARTWORK — slim frame + canvas, on a wall facing +normal.
// ===========================================================================
function art(S, M, canvasMat, w, h, x, y, z, ry = 0) {
  slab(S, M.P.woodDark, w + 0.06, h + 0.06, 0.03, x, y, z, 0, ry, 0);
  const nx = Math.sin(ry) * 0.02, nz = Math.cos(ry) * 0.02;   // face-normal offset
  slab(S, canvasMat, w, h, 0.01, x + nx, y, z + nz, 0, ry, 0);
}

// ===========================================================================
// INDOOR PLANT — tapered planter + soil + slim trunk + leafy canopy clumps.
// ===========================================================================
function buildPlant(S, P, cx, cz, scale = 1) {
  const potH = 0.42 * scale, potR = 0.19 * scale;
  const pot = lathe([[0, 0], [potR, 0], [potR * 1.02, 0.03], [potR * 0.82, potH], [potR * 0.72, potH], [0, potH]], 18);
  put(S, pot, P.charcoal, cx, 0, cz);
  put(S, new THREE.CylinderGeometry(potR * 0.7, potR * 0.75, 0.04, 14), P.soil, cx, potH - 0.02, cz);
  const trunkH = 0.62 * scale;
  put(S, new THREE.CylinderGeometry(0.03 * scale, 0.045 * scale, trunkH, 6), P.woodDark, cx, potH + trunkH / 2 - 0.02, cz);
  const baseY = potH + trunkH + 0.16 * scale;
  const clumps = [
    [0, 0, 0, 0.40, P.leaf], [0.26, -0.10, 0.10, 0.30, P.leafDark],
    [-0.24, -0.06, -0.08, 0.30, P.leaf], [0.06, 0.24, -0.05, 0.28, P.leafDark],
    [-0.10, 0.16, 0.20, 0.25, P.leaf]
  ];
  for (const [dx, dy, dz, r, m] of clumps) {
    const c = put(S, new THREE.IcosahedronGeometry(r * scale, 1), m,
      cx + dx * scale, baseY + dy * scale, cz + dz * scale);
    c.scale.y = 1.15;
  }
}

// ===========================================================================
// createLivingRoom
// ===========================================================================
export function createLivingRoom(width = 3.2, height = 3.0, depth = 4.5) {
  const M = interiorMats(), P = M.P;
  const root = new THREE.Group(); root.name = 'LivingRoom';
  const S = new THREE.Group();
  const W = width, H = height, D = depth, hw = W / 2;

  buildShell(S, M, W, H, D, { planks: true, floorMat: P.wood, wallMat: P.offwhite, feature: 'slats' });

  // --- MEDIA WALL: low console + wall-mounted TV on the back wall -----------
  const bz = -D + 0.08;                                   // just off the back wall
  const consW = 1.9, consH = 0.36, consD = 0.42;
  box(S, P.woodDark, consW, consH, consD, 0.02, 0, consH / 2, -D + 0.06 + consD / 2);
  // console seam / drawer lines suggestion (thin insets)
  for (const dx of [-consW / 4, consW / 4]) slab(S, P.charcoal, consW / 2 - 0.06, consH - 0.1, 0.005, dx, consH / 2, -D + 0.06 + consD + 0.001);
  // TV
  const tvW = 1.5, tvH = 0.86, tvY = 1.62;
  slab(S, P.black, tvW + 0.05, tvH + 0.05, 0.05, 0, tvY, bz + 0.02);
  slab(S, M.screen, tvW, tvH, 0.01, 0, tvY, bz + 0.05);
  // framed artworks flanking the TV
  art(S, M, M.art1, 0.42, 0.6, -1.18, 1.7, bz + 0.04);
  art(S, M, M.art2, 0.42, 0.6,  1.18, 1.7, bz + 0.04);

  // --- MODULAR SOFA (faces +Z) ---------------------------------------------
  buildSofa(S, M, 0, -D + 0.9);

  // --- RUG + COFFEE TABLE ---------------------------------------------------
  const rugZ = -D + 2.15;
  slab(S, M.rugA, 2.6, 0.02, 2.5, 0, 0.011, rugZ);
  slab(S, M.rugB, 2.28, 0.006, 2.2, 0, 0.02, rugZ);       // inner border
  buildCoffeeTable(S, M, 0, -D + 2.45);

  // --- FLOOR LAMP (arc) beside the sofa -------------------------------------
  buildFloorLamp(S, M, -hw + 0.4, -D + 0.6);

  // --- INDOOR PLANT in the front corner -------------------------------------
  buildPlant(S, P, hw - 0.72, -1.0, 1.05);

  root.add(optimize(S));
  shadows(root);
  return root;
}

function buildSofa(S, M, cx, backZ) {
  const P = M.P;
  const totalW = 2.4, seatD = 0.98, baseH = 0.32;
  const midZ = backZ + seatD / 2;
  // plinth / base
  box(S, P.woodDark, totalW, baseH, seatD, 0.03, cx, baseH / 2, midZ);
  // seat cushions x3 (facing +Z)
  const seatY = baseH + 0.10, segW = totalW / 3;
  for (let i = 0; i < 3; i++) {
    const x = cx - totalW / 2 + segW * (i + 0.5);
    box(S, P.fabric, segW - 0.05, 0.18, seatD - 0.22, 0.06, x, seatY, midZ + 0.06, 0, 0, 0, 1);
  }
  // back cushions x3 (lean back toward −Z)
  const backY = baseH + 0.34, backZc = backZ + 0.14;
  for (let i = 0; i < 3; i++) {
    const x = cx - totalW / 2 + segW * (i + 0.5);
    box(S, P.cushion, segW - 0.05, 0.44, 0.20, 0.07, x, backY, backZc, -0.10, 0, 0, 1);
  }
  // chunky armrests on both ends
  for (const s of [-1, 1]) {
    box(S, P.woodDark, 0.22, 0.5, seatD, 0.03, cx + s * (totalW / 2 - 0.09), 0.25, midZ);
  }
  // two throw pillows for warmth
  box(S, M.accent, 0.36, 0.36, 0.14, 0.07, cx - 0.7, seatY + 0.16, backZc + 0.16, 0.18, 0.2, 0, 1);
  box(S, P.offwhite, 0.36, 0.36, 0.14, 0.07, cx + 0.7, seatY + 0.16, backZc + 0.16, 0.15, -0.2, 0, 1);
}

function buildCoffeeTable(S, M, cx, cz) {
  const P = M.P, topY = 0.4, tw = 1.15, td = 0.66;
  box(S, P.wood, tw, 0.06, td, 0.02, cx, topY, cz);
  box(S, P.woodDark, tw - 0.24, 0.03, td - 0.2, 0.01, cx, 0.14, cz);   // lower shelf
  const lx = tw / 2 - 0.08, lz = td / 2 - 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    box(S, M.brass, 0.04, topY - 0.03, 0.04, 0.01, cx + sx * lx, (topY - 0.03) / 2, cz + sz * lz);
  // a couple of decor objects on top
  put(S, lathe([[0, 0], [0.06, 0], [0.075, 0.02], [0.05, 0.16], [0.06, 0.2], [0, 0.2]], 16), P.charcoal, cx - 0.28, topY + 0.03, cz - 0.05);
  box(S, M.art3, 0.24, 0.03, 0.17, 0.01, cx + 0.22, topY + 0.045, cz + 0.04);   // stacked books
  box(S, M.art2, 0.22, 0.025, 0.15, 0.01, cx + 0.22, topY + 0.075, cz + 0.04);
}

function buildFloorLamp(S, M, cx, cz) {
  const P = M.P;
  put(S, new THREE.CylinderGeometry(0.14, 0.16, 0.04, 18), M.brass, cx, 0.02, cz);
  put(S, new THREE.CylinderGeometry(0.02, 0.02, 1.55, 10), M.brass, cx, 0.79, cz);
  // arc arm reaching over
  put(S, tube([[cx, 1.55, cz], [cx + 0.12, 1.68, cz], [cx + 0.45, 1.72, cz]], 0.018, 8), M.brass);
  // glowing drum shade
  put(S, lathe([[0.0, 0], [0.15, 0], [0.15, 0.24], [0.13, 0.26], [0.0, 0.26]], 20), M.lampWarm, cx + 0.45, 1.46, cz);
}

// ===========================================================================
// createKitchen
// ===========================================================================
export function createKitchen(width = 3.2, height = 3.0, depth = 4.5) {
  const M = interiorMats(), P = M.P;
  const root = new THREE.Group(); root.name = 'Kitchen';
  const S = new THREE.Group();
  const W = width, H = height, D = depth, hw = W / 2;

  buildShell(S, M, W, H, D, { floorMat: M.porcelain, wallMat: P.offwhite });

  const bz = -D + 0.06;         // back-wall plane (inner face ≈ -D+0.06)
  const cabD = 0.6, cabH = 0.9, counterY = 0.94;

  // --- BASE CABINET RUN + WORKTOP along the back wall -----------------------
  const runW = W - 0.84;        // leave the left end for the tall fridge
  const runCx = hw - runW / 2 - 0.02;
  box(S, P.white, runW, cabH, cabD, 0.01, runCx, cabH / 2, bz + cabD / 2);
  // cabinet door seams + slim handles
  const doors = 4, dw = runW / doors;
  for (let i = 0; i < doors; i++) {
    const x = runCx - runW / 2 + dw * (i + 0.5);
    slab(S, P.offwhite, dw - 0.03, cabH - 0.06, 0.006, x, cabH / 2, bz + cabD + 0.003);
    slab(S, M.brass, 0.02, 0.14, 0.02, x + dw / 2 - 0.05, cabH / 2, bz + cabD + 0.02);
  }
  // stone worktop (with a hint of overhang)
  box(S, M.marble, runW + 0.04, 0.05, cabD + 0.04, 0.01, runCx, counterY, bz + cabD / 2);
  // undermount sink recess suggestion + faucet
  slab(S, P.charcoal, 0.5, 0.01, 0.34, runCx + 0.4, counterY + 0.026, bz + cabD / 2);
  put(S, tube([[runCx + 0.4, counterY + 0.03, bz + 0.16], [runCx + 0.4, counterY + 0.28, bz + 0.16], [runCx + 0.4, counterY + 0.30, bz + 0.30], [runCx + 0.4, counterY + 0.22, bz + 0.34]], 0.014, 8), M.steel);

  // --- BACKSPLASH + UPPER CABINETS -----------------------------------------
  slab(S, M.marble, runW + 0.04, 0.62, 0.02, runCx, counterY + 0.36, bz + 0.02);   // backsplash slab
  const upY = 1.9, upH = 0.68, upD = 0.34;
  box(S, P.white, runW, upH, upD, 0.01, runCx, upY, bz + upD / 2);
  for (let i = 0; i < doors; i++) {
    const x = runCx - runW / 2 + dw * (i + 0.5);
    slab(S, P.offwhite, dw - 0.03, upH - 0.05, 0.006, x, upY, bz + upD + 0.003);
    slab(S, M.brass, 0.02, 0.12, 0.02, x, upY - upH / 2 + 0.1, bz + upD + 0.02);
  }
  // warm under-cabinet light strip
  slab(S, M.coveGlow, runW - 0.1, 0.03, 0.06, runCx, upY - upH / 2 - 0.02, bz + upD - 0.02);

  // --- TALL FRIDGE (stainless) at the left end -----------------------------
  const frW = 0.76, frH = 2.0, frD = 0.66, frX = -hw + frW / 2 + 0.05;
  box(S, M.steel, frW, frH, frD, 0.02, frX, frH / 2, bz + frD / 2);
  slab(S, P.charcoal, 0.02, frH - 0.12, 0.02, frX + frW / 2 - 0.06, frH / 2 + 0.28, bz + frD + 0.01);  // split handle
  slab(S, P.charcoal, frW - 0.06, 0.015, 0.02, frX, frH * 0.62, bz + frD + 0.01);                        // door split line

  // --- ISLAND with WATERFALL COUNTER ---------------------------------------
  const isW = 1.7, isD = 0.9, isH = 0.9, isZ = -D + 2.5, top = isH + 0.05;
  box(S, P.woodDark, isW - 0.1, isH, isD - 0.1, 0.01, 0, isH / 2, isZ);       // cabinet body
  // waterfall side panels (full height, flush to floor)
  for (const s of [-1, 1]) box(S, M.marble, 0.06, top, isD, 0.01, s * (isW / 2 - 0.03), top / 2, isZ);
  // countertop with overhang on the +Z (viewer) side for stools
  box(S, M.marble, isW, 0.05, isD + 0.34, 0.01, 0, top - 0.025, isZ + 0.17);
  // island drawers hint
  for (const dx of [-0.4, 0, 0.4]) slab(S, M.brass, 0.16, 0.02, 0.02, dx, isH * 0.62, isZ - isD / 2 + 0.02);

  // --- PENDANT LIGHTS over the island (x3) ----------------------------------
  for (const px of [-0.5, 0, 0.5]) {
    put(S, new THREE.CylinderGeometry(0.006, 0.006, H - top - 0.42, 6), P.black, px, top + (H - top - 0.42) / 2 + 0.42, isZ - 0.05);
    put(S, lathe([[0, 0.16], [0.1, 0.05], [0.12, 0], [0.11, -0.01], [0, -0.01]], 18), M.brass, px, H - 0.42, isZ - 0.05);
    put(S, new THREE.SphereGeometry(0.05, 10, 8), M.lampWarm, px, H - 0.5, isZ - 0.05);
  }

  // --- BAR STOOLS on the viewer side of the island --------------------------
  buildStool(S, M, -0.45, isZ + isD / 2 + 0.28);
  buildStool(S, M, 0.45, isZ + isD / 2 + 0.28);

  root.add(optimize(S));
  shadows(root);
  return root;
}

function buildStool(S, M, cx, cz) {
  const P = M.P, seatY = 0.66;
  put(S, new THREE.CylinderGeometry(0.19, 0.18, 0.05, 18), P.woodDark, cx, seatY, cz);
  box(S, M.accent, 0.32, 0.07, 0.3, 0.03, cx, seatY + 0.05, cz, 0, 0, 0, 1);   // cushion
  // four splayed metal legs + footrest ring
  const lr = 0.15;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    put(S, tube([[cx + sx * 0.08, seatY - 0.03, cz + sz * 0.08], [cx + sx * lr, 0.01, cz + sz * lr]], 0.012, 6), M.darkMetal);
  }
  put(S, new THREE.TorusGeometry(0.15, 0.01, 6, 18), M.darkMetal, cx, 0.24, cz, Math.PI / 2, 0, 0);
}

// ===========================================================================
// createBedroom
// ===========================================================================
export function createBedroom(width = 3.2, height = 3.0, depth = 4.5) {
  const M = interiorMats(), P = M.P;
  const root = new THREE.Group(); root.name = 'Bedroom';
  const S = new THREE.Group();
  const W = width, H = height, D = depth, hw = W / 2;

  buildShell(S, M, W, H, D, { planks: true, floorMat: P.woodDark, wallMat: P.offwhite,
                              feature: 'panel', panelMat: M.accent });

  // --- KING BED (headboard against back wall, foot toward +Z) --------------
  const bedW = 1.94, matL = 2.05, matH = 0.30, frameY = 0.22;
  const headZ = -D + 0.14;                 // headboard plane
  const matZ = headZ + 0.12 + matL / 2;    // mattress centre
  // upholstered headboard (tall)
  box(S, M.accent, bedW + 0.12, 1.05, 0.12, 0.03, 0, 0.62, headZ);
  // bed frame / base
  box(S, P.woodDark, bedW + 0.12, frameY, matL + 0.18, 0.02, 0, frameY / 2, matZ + 0.02);
  // mattress
  box(S, M.linen, bedW, matH, matL, 0.05, 0, frameY + matH / 2, matZ, 0, 0, 0, 1);
  // duvet (thick, draped over the foot)
  const duvY = frameY + matH + 0.06;
  box(S, M.duvet, bedW + 0.06, 0.14, matL * 0.66, 0.06, 0, duvY, matZ + matL * 0.17, 0, 0, 0, 1);
  // folded blanket runner at the foot
  box(S, M.accent, bedW + 0.06, 0.1, 0.5, 0.04, 0, duvY + 0.02, matZ + matL / 2 - 0.28, 0, 0, 0, 1);
  // pillows x4 (two rows)
  const pillY = frameY + matH + 0.10;
  for (const px of [-0.46, 0.46]) {
    box(S, P.offwhite, 0.7, 0.16, 0.4, 0.08, px, pillY, headZ + 0.42, -0.16, 0, 0, 1);
    box(S, M.linen,    0.62, 0.14, 0.34, 0.07, px, pillY + 0.14, headZ + 0.5, -0.28, 0, 0, 1);
  }
  box(S, M.accent, 0.9, 0.14, 0.24, 0.07, 0, pillY + 0.08, headZ + 0.44, -0.2, 0, 0, 1);  // lumbar cushion

  // --- NIGHTSTANDS + BEDSIDE LAMPS -----------------------------------------
  for (const s of [-1, 1]) {
    const nx = s * (bedW / 2 + 0.28);
    box(S, P.wood, 0.44, 0.46, 0.4, 0.02, nx, 0.23, headZ + 0.22);
    slab(S, M.brass, 0.3, 0.02, 0.02, nx, 0.28, headZ + 0.42);        // drawer handle
    // slim bedside lamp with a glowing shade
    put(S, new THREE.CylinderGeometry(0.09, 0.1, 0.02, 16), M.brass, nx, 0.47, headZ + 0.22);
    put(S, new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), M.brass, nx, 0.59, headZ + 0.22);
    put(S, lathe([[0, 0], [0.11, 0], [0.09, 0.2], [0, 0.2]], 18), M.lampWarm, nx, 0.72, headZ + 0.22);
  }

  // --- BENCH at the foot of the bed ----------------------------------------
  const benchZ = matZ + matL / 2 + 0.34;
  box(S, M.accent, 1.4, 0.14, 0.44, 0.05, 0, 0.44, benchZ, 0, 0, 0, 1);   // padded top
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    box(S, P.woodDark, 0.06, 0.37, 0.06, 0.01, sx * 0.63, 0.185, benchZ + sz * 0.17);

  // --- WARDROBE against the left side wall ---------------------------------
  const wbW = 0.58, wbH = 2.15, wbL = 1.3, wbX = -hw + wbW / 2 + 0.04, wbZ = -D + 1.5;
  box(S, P.wood, wbW, wbH, wbL, 0.02, wbX, wbH / 2, wbZ);
  for (const dz of [-wbL / 4, wbL / 4]) {
    slab(S, P.woodDark, 0.01, wbH - 0.1, wbL / 2 - 0.05, wbX + wbW / 2 + 0.006, wbH / 2, wbZ + dz);
    slab(S, M.brass, 0.02, 0.2, 0.02, wbX + wbW / 2 + 0.02, wbH / 2, wbZ + dz + (dz < 0 ? 0.14 : -0.14));
  }

  // --- RUG under the bed, extending toward +Z ------------------------------
  slab(S, M.rugB, 2.5, 0.02, 2.2, 0, 0.011, matZ + 0.5);

  // --- ARTWORK above the headboard -----------------------------------------
  art(S, M, M.art3, 1.0, 0.5, 0, 1.75, -D + 0.075);

  root.add(optimize(S));
  shadows(root);
  return root;
}

export default createLivingRoom;

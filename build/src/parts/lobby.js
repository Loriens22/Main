// ---------------------------------------------------------------------------
// parts/lobby.js — GROUND-FLOOR LUXURY LOBBY INTERIOR (seen through the glass).
//
// A bright, furnished residential concierge lobby that sits BEHIND the
// ground-floor glazing and fixes the dark/empty ground floor. Contains:
//   - large-format polished porcelain floor with subtle grout grid
//   - a feature back wall of vertical wood slats + a backlit building-name sign
//   - a reception / concierge desk (stone top, warm-wood front, brass toe-glow)
//     with an upholstered stool
//   - a lounge group: 2 camel armchairs + a velvet sofa + a low table + a rug
//   - two tall indoor planters
//   - a wall of brushed-metal mailboxes
//   - a pair of brushed-metal elevator doors on the back wall
//   - cluster pendant lights, a glowing luminous ceiling, perimeter cove light
//     and recessed warm downlights (emissive) + a few warm fill lights so the
//     whole room clearly glows through the glass in daylight.
//
//   import { createLobbyInterior } from './lobby.js';
//   scene.add(createLobbyInterior());        // 5.5 x 3.6 x 5.0 m
//
// Conventions: metres, +Y up. Centred on X (x∈[-w/2,w/2]). FLOOR top at y=0,
// ceiling at y=height. The glazing plane is z=0; the lobby extends into −Z
// (back wall inner face at z=-depth). Furniture faces +Z (toward the street).
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, mat, palette, shadows, optimize
} from './kit.js';

// Add a mesh (bevelled box unless a geometry is supplied) into a parent.
function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
// Shorthand bevelled box mesh.
function box(parent, material, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 2) {
  return add(parent, bevelBox(w, h, d, r, seg), material, x, y, z, rx, ry, rz);
}

export function createLobbyInterior(width = 5.5, height = 3.6, depth = 5.0) {
  const W = width, H = height, D = depth;
  const hw = W / 2;
  const root = new THREE.Group();
  root.name = 'LobbyInterior';

  // Static (mergeable) geometry accumulates here; instanced/lights added later.
  const S = new THREE.Group();
  const P = palette();

  // --- bespoke materials (shared instances so optimize() can merge) ---------
  const floorMat  = mat(0xd9d3c6, { roughness: 0.12, metalness: 0.0, envMapIntensity: 1.5 }); // polished porcelain
  const groutMat  = mat(0x9c968a, { roughness: 0.6 });
  const wallMat   = mat(0xe9e5dd, { roughness: 0.88, envMapIntensity: 0.4 });                 // warm plaster
  const ceilMat   = mat(0xdedad2, { roughness: 0.9,  envMapIntensity: 0.3 });
  const slatMat   = mat(0x9a6238, { roughness: 0.5,  envMapIntensity: 0.55 });
  const slatMat2  = mat(0x744628, { roughness: 0.55, envMapIntensity: 0.5 });
  const slatBack  = mat(0x3a2a1e, { roughness: 0.8 });
  const brass     = mat(0xb08a44, { roughness: 0.34, metalness: 0.9, envMapIntensity: 1.15 });
  const stoneTop  = mat(0xcabfa6, { roughness: 0.2,  metalness: 0.0, envMapIntensity: 1.0 }); // reception stone
  const camel     = mat(0xc39a67, { roughness: 0.5,  envMapIntensity: 0.6 });                 // armchair leather
  const camelDk   = mat(0xa9814f, { roughness: 0.55 });
  const velvet    = mat(0x3f544a, { roughness: 0.82, envMapIntensity: 0.35 });                // sofa
  const velvetLt  = mat(0x4a6154, { roughness: 0.85 });
  const rugMat    = mat(0xbcab8f, { roughness: 0.95 });
  const rugBorder = mat(0x8a795e, { roughness: 0.95 });

  // emissive "glow" materials (so it reads bright through the glass)
  const ceilGlow  = mat(0xffefd6, { emissive: 0xffe0b0, emissiveIntensity: 0.95, roughness: 0.9 });
  const dlLens    = mat(0xfff3df, { emissive: 0xffe2b4, emissiveIntensity: 2.6,  roughness: 0.5 });
  const coveGlow  = mat(0xffeccb, { emissive: 0xffcf90, emissiveIntensity: 1.15, roughness: 0.85 });
  const pendGlow  = mat(0xfff2dc, { emissive: 0xffdca0, emissiveIntensity: 1.9,  roughness: 0.6 });
  const signGlow  = mat(0xfff4e6, { emissive: 0xffe6bd, emissiveIntensity: 1.5,  roughness: 0.6 });
  const indGlow   = mat(0xdff0ff, { emissive: 0x9fd0ff, emissiveIntensity: 1.6,  roughness: 0.5 });
  const darkMetal = mat(0x2a2c31, { roughness: 0.4, metalness: 0.85, envMapIntensity: 0.9 });

  const wallT = 0.10;

  // =========================================================================
  // 1. SHELL — floor, three walls, ceiling
  // =========================================================================
  // Floor: single-sided plane, TOP exactly at y=0 (furniture sits on it).
  add(S, new THREE.PlaneGeometry(W, D), floorMat, 0, 0, -D / 2, -Math.PI / 2, 0, 0);
  // subtle grout grid — a few thin recessed lines suggesting large-format tiles
  for (let i = 1; i <= 4; i++) {
    const x = -hw + (W * i) / 5;
    box(S, groutMat, 0.012, 0.006, D, 0, x, 0.003, -D / 2, 0, 0, 0, 1);
  }
  for (let j = 1; j <= 4; j++) {
    const z = -(D * j) / 5;
    box(S, groutMat, W, 0.006, 0.012, 0, 0, 0.003, z, 0, 0, 0, 1);
  }

  // Back wall (inner face at z=-D, thickness extends behind)
  box(S, wallMat, W, H, wallT, 0, 0, H / 2, -D - wallT / 2, 0, 0, 0, 1);
  // Side walls (inner faces at x=±hw, extend outward)
  box(S, wallMat, wallT, H, D, 0, -hw - wallT / 2, H / 2, -D / 2, 0, 0, 0, 1);
  box(S, wallMat, wallT, H, D, 0,  hw + wallT / 2, H / 2, -D / 2, 0, 0, 0, 1);
  // Ceiling slab (inner face at y=H, extends up)
  box(S, ceilMat, W, wallT, D, 0, 0, H + wallT / 2, -D / 2, 0, 0, 0, 1);

  // =========================================================================
  // 2. LUMINOUS CEILING + COVE + DOWNLIGHTS
  // =========================================================================
  // Large recessed luminous panel (warm glow) framed by a shallow coffer.
  const panW = W - 1.0, panD = D - 1.0;
  box(S, darkMetal, panW + 0.12, 0.10, panD + 0.12, 0.02, 0, H - 0.05, -D / 2, 0, 0, 0, 1); // coffer frame
  add(S, new THREE.PlaneGeometry(panW, panD), ceilGlow, 0, H - 0.08, -D / 2, Math.PI / 2, 0, 0); // glowing face
  // faint mullion grid across the luminous panel for a hint of coffered detail
  for (const gx of [-panW / 4, panW / 4]) box(S, darkMetal, 0.03, 0.04, panD, 0, gx, H - 0.10, -D / 2, 0, 0, 0, 1);
  for (const gz of [-D / 2 - panD / 4, -D / 2 + panD / 4]) box(S, darkMetal, panW, 0.04, 0.03, 0, 0, H - 0.10, gz, 0, 0, 0, 1);

  // Perimeter cove light — a warm glowing line just below the ceiling on the walls.
  const coveY = H - 0.16;
  box(S, coveGlow, W - 0.3, 0.05, 0.04, 0, 0, coveY, -D + 0.14, 0, 0, 0, 1);           // back
  box(S, coveGlow, 0.04, 0.05, D - 0.3, 0, -hw + 0.12, coveY, -D / 2, 0, 0, 0, 1);      // left
  box(S, coveGlow, 0.04, 0.05, D - 0.3, 0,  hw - 0.12, coveY, -D / 2, 0, 0, 0, 1);      // right
  // a small shadow lip below the cove so the glow reads as indirect
  box(S, ceilMat, W - 0.3, 0.05, 0.06, 0, 0, coveY - 0.06, -D + 0.16, 0, 0, 0, 1);

  // Recessed downlights around the perimeter (housing + bright emissive lens).
  const dlY = H - 0.02;
  const dlPos = [];
  for (const dz of [-0.85, -D + 0.85]) for (const dx of [-hw + 0.7, 0, hw - 0.7]) dlPos.push([dx, dz]);
  for (const [dx, dz] of dlPos) {
    add(S, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), darkMetal, dx, dlY, dz);
    add(S, new THREE.CylinderGeometry(0.058, 0.058, 0.014, 12), dlLens, dx, dlY - 0.03, dz);
  }

  // =========================================================================
  // 3. FEATURE BACK WALL — vertical wood slats + backlit building name
  // =========================================================================
  const bz = -D + 0.02;                 // slat face just in front of the wall
  box(S, slatBack, W - 0.2, H - 0.2, 0.03, 0, 0, H / 2, bz - 0.03, 0, 0, 0, 1);
  const slatPitch = 0.16, slatW = 0.10, slatH = H - 0.5;
  const nSlats = Math.floor((W - 0.4) / slatPitch);
  const sx0 = -((nSlats - 1) * slatPitch) / 2;
  // Elevator opening on the back wall (right of centre) — skip slats there.
  const elvCx = 1.35, elvHalf = 0.95;
  for (let i = 0; i < nSlats; i++) {
    const x = sx0 + i * slatPitch;
    if (x > elvCx - elvHalf - 0.1 && x < elvCx + elvHalf + 0.1) continue; // clear the lift zone
    box(S, i % 2 ? slatMat2 : slatMat, slatW, slatH, 0.05, 0.008, x, slatH / 2 + 0.18, bz);
  }
  // Backlit building-name sign — a brushed panel with abstract raised lettering.
  const signX = -1.15, signY = 2.55;
  box(S, darkMetal, 1.9, 0.42, 0.04, 0.01, signX, signY, bz + 0.04, 0, 0, 0, 1);
  box(S, signGlow, 1.78, 0.30, 0.02, 0.005, signX, signY, bz + 0.065, 0, 0, 0, 1);
  // suggest a word ("THE RESIDENCES") with a row of slim brass block-glyphs
  const letters = [0.10, 0.06, 0.11, 0.05, 0.10, 0.08, 0.05, 0.11, 0.06, 0.10, 0.07, 0.10];
  let lx = signX - 0.80;
  for (const lh of letters) {
    box(S, brass, 0.045, lh, 0.02, 0.004, lx, signY, bz + 0.085, 0, 0, 0, 1);
    lx += 0.135;
  }

  // =========================================================================
  // 4. ELEVATORS — pair of brushed-metal doors + surround on the back wall
  // =========================================================================
  const elvW = 0.86, elvH = 2.35, elvGap = 0.06;
  const elvZ = -D + 0.05;
  // stone/steel surround frame
  box(S, stoneTop, elvW * 2 + elvGap + 0.34, elvH + 0.28, 0.10, 0.02, elvCx, elvH / 2 + 0.06, elvZ - 0.02, 0, 0, 0, 1);
  for (const s of [-1, 1]) {
    const cx = elvCx + s * (elvW + elvGap) / 2;
    box(S, P.steel, elvW, elvH, 0.05, 0.01, cx, elvH / 2 + 0.06, elvZ + 0.03);       // door leaf
    // centre reveal line of the two-leaf door
    box(S, darkMetal, 0.015, elvH - 0.05, 0.055, 0, cx, elvH / 2 + 0.06, elvZ + 0.045, 0, 0, 0, 1);
    // brushed horizontal grain hint (thin darker inset near the base)
    box(S, darkMetal, elvW - 0.1, 0.05, 0.052, 0, cx, 0.35, elvZ + 0.045, 0, 0, 0, 1);
  }
  // call panel + glowing floor indicator between/above
  box(S, darkMetal, 0.14, 0.34, 0.05, 0.01, elvCx + elvW + elvGap * 0.5 + 0.14, 1.25, elvZ + 0.05, 0, 0, 0, 1);
  box(S, indGlow, 0.09, 0.05, 0.03, 0, elvCx + elvW + elvGap * 0.5 + 0.14, 1.36, elvZ + 0.08, 0, 0, 0, 1);
  box(S, indGlow, 0.42, 0.07, 0.02, 0, elvCx, elvH + 0.10, elvZ + 0.06, 0, 0, 0, 1); // over-door position light

  // =========================================================================
  // 5. RECEPTION / CONCIERGE DESK + STOOL  (front-right, faces +Z)
  // =========================================================================
  const deskX = 1.55, deskZ = -1.55;
  const desk = new THREE.Group(); desk.position.set(deskX, 0, deskZ); S.add(desk);
  const dW = 1.9, dD = 0.62;
  // warm-wood body / front transaction panel
  box(desk, slatMat, dW, 1.02, dD, 0.02, 0, 0.51, 0);
  box(desk, slatMat2, dW + 0.04, 0.5, dD + 0.04, 0.015, 0, 0.30, 0); // recessed toe/base band
  // brass toe-kick glow line (welcoming under-counter light)
  box(desk, pendGlow, dW - 0.1, 0.03, 0.02, 0, 0, 0.06, dD / 2 + 0.005);
  // stone counter top with a small overhang
  box(desk, stoneTop, dW + 0.08, 0.06, dD + 0.10, 0.01, 0, 1.06, 0);
  // raised rear working shelf (lower, behind, toward -Z)
  box(desk, stoneTop, dW - 0.2, 0.05, 0.34, 0.01, 0, 0.80, -dD / 2 - 0.18);
  // brass trim line along the front top edge
  box(desk, brass, dW + 0.06, 0.02, 0.03, 0, 0, 1.10, dD / 2 + 0.05);
  // a couple of desk props: a small monitor + a tray
  box(desk, darkMetal, 0.42, 0.26, 0.03, 0.01, -0.35, 1.24, -0.05, -0.12, 0, 0);
  box(desk, darkMetal, 0.10, 0.10, 0.10, 0.01, -0.35, 1.10, -0.05);
  box(desk, brass, 0.28, 0.03, 0.18, 0.01, 0.45, 1.11, 0.02);

  // concierge stool (upholstered drum) behind the desk
  const stool = new THREE.Group(); stool.position.set(deskX + 0.2, 0, deskZ - 0.55); S.add(stool);
  add(stool, new THREE.CylinderGeometry(0.20, 0.19, 0.14, 20), camel, 0, 0.62, 0);
  add(stool, new THREE.CylinderGeometry(0.02, 0.02, 0.5, 10), darkMetal, 0, 0.30, 0);
  add(stool, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), darkMetal, 0, 0.03, 0);

  // =========================================================================
  // 6. LOUNGE GROUP — rug, sofa, 2 armchairs, low table  (centre-left)
  // =========================================================================
  const lounge = { x: -1.15, z: -3.05 };
  // rug (thin, top a hair above the floor)
  box(S, rugBorder, 2.9, 0.02, 2.5, 0.01, lounge.x, 0.011, lounge.z, 0, 0, 0, 1);
  box(S, rugMat,    2.72, 0.024, 2.32, 0.01, lounge.x, 0.013, lounge.z, 0, 0, 0, 1);

  // Sofa — back near the feature wall, faces +Z (toward the viewer/street).
  buildSofa(S, { velvet, velvetLt, brass }, lounge.x, -4.02, 0);
  // Two armchairs facing each other across the coffee table.
  buildArmchair(S, { camel, camelDk, brass }, lounge.x - 1.15, lounge.z, Math.PI / 2);   // left, faces +X
  buildArmchair(S, { camel, camelDk, brass }, lounge.x + 1.15, lounge.z, -Math.PI / 2);  // right, faces -X
  // Low coffee table.
  buildCoffeeTable(S, { top: slatMat, leg: brass, shelf: slatMat2 }, lounge.x, lounge.z);

  // =========================================================================
  // 7. MAILBOXES — wall of brushed boxes on the RIGHT wall (faces -X)
  // =========================================================================
  buildMailboxes(S, { body: P.steel, frame: brass, dark: darkMetal, num: brass },
    hw - 0.06, -3.35);

  // =========================================================================
  // 8. TALL INDOOR PLANTERS (two corners)
  // =========================================================================
  buildPlant(S, P, -2.25, -4.45);
  buildPlant(S, P,  2.35, -0.75);

  // =========================================================================
  // 9. PENDANT CLUSTER over the coffee table + a reception pendant
  // =========================================================================
  buildPendant(S, { cord: darkMetal, shade: darkMetal, glow: pendGlow }, lounge.x - 0.35, lounge.z - 0.15, H, 1.75);
  buildPendant(S, { cord: darkMetal, shade: darkMetal, glow: pendGlow }, lounge.x + 0.30, lounge.z + 0.10, H, 1.58);
  buildPendant(S, { cord: darkMetal, shade: brass, glow: pendGlow },     lounge.x - 0.05, lounge.z + 0.25, H, 1.92);
  buildPendant(S, { cord: darkMetal, shade: brass, glow: pendGlow },     deskX + 0.15, deskZ + 0.05, H, 1.95);

  // -------------------------------------------------------------------------
  // Merge static geometry, then add warm fill lights (kept out of optimize()).
  // -------------------------------------------------------------------------
  root.add(optimize(S));

  const fill = [
    [lounge.x, 2.5, lounge.z, 14, 0xffe3bd],   // over the lounge
    [deskX, 2.5, deskZ, 10, 0xffe6c6],         // over reception
    [0, 2.7, -D + 1.0, 12, 0xffe8cc],          // wash the feature wall
    [0, 2.4, -0.6, 9, 0xfff0da],               // lift the front/entry zone
  ];
  for (const [x, y, z, i, c] of fill) {
    const L = new THREE.PointLight(c, i, 9, 2.0);
    L.position.set(x, y, z);
    root.add(L);
  }

  shadows(root);
  return root;
}

// ===========================================================================
// SOFA — timber-ish plinth + plush velvet cushions + brass feet. Faces +Z.
// ===========================================================================
function buildSofa(S, M, cx, cz, ry) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; S.add(g);
  const w = 2.0, d = 0.86;
  // plinth base
  box(g, M.velvet, w, 0.30, d, 0.03, 0, 0.17, 0);
  // seat cushions (2)
  for (const sx of [-0.5, 0.5]) box(g, M.velvetLt, 0.94, 0.18, 0.72, 0.07, sx, 0.42, 0.04, 0, 0, 0, 3);
  // back cushions (2)
  for (const sx of [-0.5, 0.5]) box(g, M.velvet, 0.94, 0.46, 0.18, 0.07, sx, 0.63, -d / 2 + 0.12, -0.06, 0, 0, 3);
  // arms
  for (const sx of [-1, 1]) box(g, M.velvet, 0.18, 0.5, d, 0.06, sx * (w / 2 - 0.09), 0.44, 0, 0, 0, 0, 3);
  // throw pillows for warmth
  box(g, M.velvetLt, 0.34, 0.34, 0.14, 0.07, -0.55, 0.55, 0.14, 0.15, 0.2, 0, 3);
  box(g, M.velvetLt, 0.34, 0.34, 0.14, 0.07, 0.55, 0.55, 0.14, 0.1, -0.2, 0, 3);
  // brass feet
  const lx = w / 2 - 0.14, lz = d / 2 - 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    add(g, new THREE.CylinderGeometry(0.03, 0.025, 0.1, 8), M.brass, sx * lx, 0.05, sz * lz);
}

// ===========================================================================
// ARMCHAIR — plush camel-leather lounge chair on brass legs. Faces +Z (ry rot).
// ===========================================================================
function buildArmchair(S, M, cx, cz, ry) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; S.add(g);
  const w = 0.82, d = 0.8;
  box(g, M.camel, w, 0.30, d, 0.05, 0, 0.24, 0);                 // base block
  box(g, M.camelDk, w - 0.06, 0.16, d - 0.08, 0.06, 0, 0.44, 0.04, 0, 0, 0, 3); // seat cushion
  box(g, M.camel, w - 0.04, 0.52, 0.17, 0.07, 0, 0.62, -d / 2 + 0.1, -0.08, 0, 0, 3); // backrest
  for (const sx of [-1, 1]) box(g, M.camel, 0.15, 0.28, d - 0.06, 0.06, sx * (w / 2 - 0.07), 0.46, 0.02, 0, 0, 0, 3); // arms
  const lx = w / 2 - 0.12, lz = d / 2 - 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    add(g, new THREE.CylinderGeometry(0.028, 0.022, 0.12, 8), M.brass, sx * lx, 0.06, sz * lz, 0.06 * sz, 0, 0);
}

// ===========================================================================
// COFFEE TABLE — warm-wood top + lower shelf on slim brass legs.
// ===========================================================================
function buildCoffeeTable(S, M, cx, cz) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); S.add(g);
  const topY = 0.4, tw = 1.15, td = 0.66;
  box(g, M.top, tw, 0.06, td, 0.02, 0, topY, 0);
  box(g, M.shelf, tw - 0.24, 0.03, td - 0.18, 0.01, 0, 0.14, 0);
  const lx = tw / 2 - 0.08, lz = td / 2 - 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    box(g, M.leg, 0.045, topY - 0.03, 0.045, 0.01, sx * lx, (topY - 0.03) / 2, sz * lz);
  // a small decorative tray + stacked books
  box(g, M.leg, 0.4, 0.02, 0.26, 0.01, 0.0, topY + 0.04, 0);
  box(g, M.shelf, 0.24, 0.05, 0.18, 0.01, 0.02, topY + 0.075, 0);
}

// ===========================================================================
// MAILBOXES — a framed grid of small brushed doors mounted on the right wall.
// Mounted at x=wallX facing -X (into the room).
// ===========================================================================
function buildMailboxes(S, M, wallX, cz) {
  const g = new THREE.Group();
  g.position.set(wallX, 0, cz);
  g.rotation.y = -Math.PI / 2;          // panel faces -X
  S.add(g);
  const cols = 4, rows = 5;
  const bw = 0.26, bh = 0.19, gap = 0.02;
  const totW = cols * bw + (cols - 1) * gap;
  const totH = rows * bh + (rows - 1) * gap;
  const y0 = 0.85;                       // bottom row height
  // back panel + frame
  box(g, M.dark, totW + 0.12, totH + 0.12, 0.05, 0.01, 0, y0 + totH / 2, 0.0);
  box(g, M.frame, totW + 0.16, 0.03, 0.06, 0.01, 0, y0 + totH + 0.07, 0.005); // top trim
  box(g, M.frame, totW + 0.16, 0.03, 0.06, 0.01, 0, y0 - 0.07, 0.005);        // bottom trim
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -totW / 2 + bw / 2 + c * (bw + gap);
      const y = y0 + bh / 2 + r * (bh + gap);
      box(g, M.body, bw, bh, 0.03, 0.008, x, y, 0.04);               // door
      box(g, M.num, 0.03, 0.03, 0.02, 0.004, x - bw / 2 + 0.05, y + bh / 2 - 0.045, 0.06); // knob/number
      box(g, M.dark, bw - 0.06, 0.008, 0.02, 0, x, y - 0.04, 0.06, 0, 0, 0, 1);            // mail slot
    }
  }
}

// ===========================================================================
// PLANT — tapered pot + soil + trunk + clumpy foliage canopy (icospheres).
// ===========================================================================
function buildPlant(S, P, cx, cz) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); S.add(g);
  const potH = 0.5;
  const potProfile = [[0, 0], [0.26, 0], [0.27, 0.03], [0.2, potH], [0, potH]];
  add(g, lathe(potProfile, 20), P.charcoal, 0, 0, 0);
  add(g, new THREE.CylinderGeometry(0.185, 0.19, 0.05, 16), P.soil, 0, potH - 0.03, 0);
  const trunkH = 0.85;
  add(g, new THREE.CylinderGeometry(0.04, 0.055, trunkH, 8), P.woodDark, 0, potH + trunkH / 2 - 0.02, 0);
  const baseY = potH + trunkH + 0.28;
  const clumps = [
    [0.0, 0.0, 0.0, 0.42, P.leaf],
    [0.3, -0.14, 0.12, 0.32, P.leafDark],
    [-0.28, -0.06, -0.1, 0.33, P.leaf],
    [0.08, 0.26, -0.05, 0.3, P.leafDark],
    [-0.14, 0.2, 0.22, 0.28, P.leaf],
    [0.16, -0.2, -0.24, 0.27, P.leafDark],
  ];
  for (const [dx, dy, dz, r, m] of clumps) {
    const c = add(g, new THREE.IcosahedronGeometry(r, 1), m, dx, baseY + dy, dz);
    c.scale.y = 0.92;
  }
}

// ===========================================================================
// PENDANT — slim cord from the ceiling to a small shade with a glowing base.
// ===========================================================================
function buildPendant(S, M, cx, cz, H, shadeY) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); S.add(g);
  add(g, new THREE.CylinderGeometry(0.006, 0.006, H - shadeY, 6), M.cord, 0, (H + shadeY) / 2, 0);
  // canopy at the ceiling
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M.shade, 0, H - 0.03, 0);
  // shade: a small domed cone (lathe) with an emissive underside
  const shadeProfile = [[0, 0.14], [0.075, 0.13], [0.11, 0.02], [0.115, 0], [0.05, 0]];
  add(g, lathe(shadeProfile, 16), M.shade, 0, shadeY, 0);
  add(g, new THREE.SphereGeometry(0.05, 10, 6), M.glow, 0, shadeY + 0.01, 0);
}

export default createLobbyInterior;

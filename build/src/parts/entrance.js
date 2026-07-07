// ---------------------------------------------------------------------------
// parts/entrance.js — Ground-floor residential lobby entrance (HERO detail).
// Cantilevered canopy + recessed downlights, twin full-height glass doors with
// tubular pull handles, flanking sidelights, deep warm-wood reveal jambs, a
// stone facade frame, a backlit address plaque, flanking stone planters, a low
// threshold step, and a glowing lobby interior behind the glass.
//
// Conventions: metres, +Y up. Centered on X. Facade cladding face at z=0;
// glazing set back into a deep reveal (−Z = interior). Canopy, handles, step
// and planters project toward +Z (outward). Call shadows(group).
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, tube, mat, palette, shadows
} from './kit.js';

export function createEntrance(width = 4.5, height = 4.2) {
  const w = width, h = height;
  const g = new THREE.Group();
  g.name = 'entrance';
  const P = palette();

  // ---- bespoke materials (kept close to the shared palette) ---------------
  const stone     = mat(0xc9bda4, { roughness: 0.84, envMapIntensity: 0.5 });   // warm limestone cladding
  const stoneDark = mat(0x8f8672, { roughness: 0.8,  envMapIntensity: 0.5 });   // planter / reveal shadow line
  const woodJamb  = mat(0x8a5a34, { roughness: 0.5,  envMapIntensity: 0.6 });   // warm wood reveal
  const frameMtl  = P.darkMetal;                                                // slim door/mullion frames
  const glassMtl  = P.glass;
  const soffitMtl = mat(0x24262b, { roughness: 0.5, metalness: 0.5, envMapIntensity: 0.7 });
  const warmGlow  = mat(0xffe6bf, { emissive: 0xffca7a, emissiveIntensity: 1.15, roughness: 0.9 });
  const litDisc   = mat(0xfff2d6, { emissive: 0xffdca0, emissiveIntensity: 2.4, roughness: 0.5 });
  const signGlow  = mat(0xfff4e2, { emissive: 0xffe4bb, emissiveIntensity: 1.8, roughness: 0.6 });

  const add = (geo, material, x = 0, y = 0, z = 0, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    g.add(m);
    return m;
  };

  // ---- key dimensions -----------------------------------------------------
  const pierW    = Math.max(0.45, w * 0.13);          // stone pier each side
  const headerH  = Math.max(0.62, h * 0.19);          // stone lintel above opening
  const openW    = w - 2 * pierW;                     // clear glazed opening width
  const openTopY = h - headerH;                       // top of glazing
  const facadeZ0 = 0.0;                               // outer cladding face
  const facadeD  = 0.26;                              // cladding depth (into −Z)
  const facadeCz = facadeZ0 - facadeD / 2;
  const revealD  = 0.30;                              // depth of the reveal
  const glassZ   = -revealD;                          // glazing set-back plane
  const thickG   = 0.03;                              // glass thickness
  const half     = openW / 2;

  // ===== 1. STONE FACADE FRAME (piers + lintel) ============================
  const pierCx = (half + pierW / 2);
  add(bevelBox(pierW, h, facadeD, 0.02), stone, -pierCx, h / 2, facadeCz);
  add(bevelBox(pierW, h, facadeD, 0.02), stone,  pierCx, h / 2, facadeCz);
  add(bevelBox(openW + 2 * pierW, headerH, facadeD, 0.02), stone, 0, h - headerH / 2, facadeCz);
  // subtle recessed shadow-reveal groove around the opening face
  add(bevelBox(openW + 0.06, openTopY + 0.06, 0.02, 0.01), stoneDark, 0, openTopY / 2, facadeZ0 - 0.005);

  // ===== 2. DEEP WARM-WOOD REVEAL JAMBS ====================================
  const jambT = 0.09;                                  // reveal lining thickness
  // left & right vertical jambs (face inward)
  add(bevelBox(jambT, openTopY, revealD, 0.01), woodJamb, -half + jambT / 2, openTopY / 2, glassZ / 2 + 0.02);
  add(bevelBox(jambT, openTopY, revealD, 0.01), woodJamb,  half - jambT / 2, openTopY / 2, glassZ / 2 + 0.02);
  // head jamb (top)
  add(bevelBox(openW, jambT, revealD, 0.01), woodJamb, 0, openTopY - jambT / 2, glassZ / 2 + 0.02);

  // ===== 3. GLOWING LOBBY INTERIOR (behind the glass) ======================
  const interiorZ = glassZ - 0.28;
  add(new THREE.PlaneGeometry(openW - 0.05, openTopY - 0.05), warmGlow, 0, openTopY / 2, interiorZ);
  // brighter horizontal light line (suspended fixture / reception glow)
  add(bevelBox(openW - 0.5, 0.06, 0.04, 0.01), litDisc, 0, openTopY * 0.66, interiorZ + 0.12);
  // hint of a warm interior floor to add depth to the glow
  add(new THREE.PlaneGeometry(openW - 0.05, 0.32), warmGlow, 0, 0.02, interiorZ + 0.16, -Math.PI / 2, 0, 0);

  // ===== 4. GLAZING: twin doors, transom, sidelights + dark frame grid =====
  const gy0 = 0.07;                                    // sill top / glazing base
  const gh  = openTopY - gy0;                          // glazing height
  const doorTotW = Math.min(1.9, openW * 0.56);        // twin-door total width
  const doorHalf = doorTotW / 2;
  const doorTopY = gy0 + gh * 0.85;                    // top of door leaves
  const frameZ   = glassZ + 0.02;                      // frames sit just proud of glass (+Z)

  // glass fills (single set-back plane)
  const glassPanel = (cx, cw, y0, y1) =>
    add(bevelBox(cw, y1 - y0, thickG, 0.004), glassMtl, cx, (y0 + y1) / 2, glassZ);
  // sidelights
  glassPanel(-(doorHalf + (half - doorHalf) / 2), (half - doorHalf) - 0.02, gy0, openTopY);
  glassPanel( (doorHalf + (half - doorHalf) / 2), (half - doorHalf) - 0.02, gy0, openTopY);
  // twin doors
  glassPanel(-doorHalf / 2, doorHalf - 0.03, gy0, doorTopY);
  glassPanel( doorHalf / 2, doorHalf - 0.03, gy0, doorTopY);
  // transom above doors
  glassPanel(0, doorTotW - 0.04, doorTopY, openTopY);

  // ---- dark-metal frame grid ----
  const fW = 0.05;                                     // frame member width
  const fD = 0.07;                                     // frame member depth
  const vBar = (x, y0, y1) => add(bevelBox(fW, y1 - y0, fD, 0.008), frameMtl, x, (y0 + y1) / 2, frameZ);
  const hBar = (x0, x1, y) => add(bevelBox(x1 - x0, fW, fD, 0.008), frameMtl, (x0 + x1) / 2, y, frameZ);
  // outer perimeter of glazing
  hBar(-half, half, gy0);            // sill rail
  hBar(-half, half, openTopY);       // head rail
  vBar(-half, gy0, openTopY);        // left edge
  vBar( half, gy0, openTopY);        // right edge
  // mullions between sidelights and doors
  vBar(-doorHalf, gy0, openTopY);
  vBar( doorHalf, gy0, openTopY);
  // central meeting mullion between the twin doors
  vBar(0, gy0, doorTopY);
  // door leaf outer stiles + transom rail
  hBar(-doorHalf, doorHalf, doorTopY);
  // door bottom rails (heavier)
  add(bevelBox(doorHalf - 0.03, 0.12, fD, 0.008), frameMtl, -doorHalf / 2, gy0 + 0.06, frameZ);
  add(bevelBox(doorHalf - 0.03, 0.12, fD, 0.008), frameMtl,  doorHalf / 2, gy0 + 0.06, frameZ);

  // ===== 5. TUBULAR PULL HANDLES (tube) ====================================
  const hz = frameZ + 0.10;                             // handle standoff (+Z of glass)
  const hy0 = gy0 + 0.75, hy1 = doorTopY - 0.55;
  const makeHandle = (hx) => {
    add(tube([[hx, hy0, hz], [hx, hy1, hz]], 0.022, 10), P.steel);
    // standoff brackets to the glass at top & bottom
    add(tube([[hx, hy0 + 0.05, frameZ + 0.015], [hx, hy0 + 0.05, hz]], 0.012, 8), P.steel);
    add(tube([[hx, hy1 - 0.05, frameZ + 0.015], [hx, hy1 - 0.05, hz]], 0.012, 8), P.steel);
  };
  makeHandle(-0.14);                                    // left door, meeting stile
  makeHandle( 0.14);                                    // right door, meeting stile

  // ===== 6. CANTILEVERED CANOPY + RECESSED SOFFIT + DOWNLIGHTS =============
  const canY = openTopY + 0.10;                         // just below the lintel top region
  const canProj = 1.2;                                  // projection in +Z
  const canT = 0.20;                                    // slab thickness
  const canW = openW + 2 * pierW - 0.2;                 // slightly inset from facade edges
  const canCz = canProj / 2;                            // center from z=0 to +canProj
  add(bevelBox(canW, canT, canProj, 0.03), stone, 0, canY + canT / 2, canCz);
  // dark metal fascia trim on the leading edge
  add(bevelBox(canW + 0.01, 0.06, 0.03, 0.01), frameMtl, 0, canY + 0.02, canProj + 0.005);
  // recessed soffit panel (inset up into the slab underside)
  const sofW = canW - 0.14, sofD = canProj - 0.16;
  add(bevelBox(sofW, 0.05, sofD, 0.01), soffitMtl, 0, canY + 0.055, canCz - 0.01);
  // row of recessed downlights under the soffit
  const nLights = Math.max(5, Math.round(canW / 0.65));
  const lz = canCz - 0.02;
  for (let i = 0; i < nLights; i++) {
    const lx = -sofW / 2 + 0.28 + (i * (sofW - 0.56)) / (nLights - 1);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), soffitMtl, lx, canY + 0.055, lz); // housing
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 14), litDisc, lx, canY + 0.036, lz);  // emissive lens
  }

  // ===== 7. BACKLIT ADDRESS / SIGNAGE PLAQUE (on left pier) ================
  const sgW = Math.min(0.62, pierW * 0.9), sgH = 0.26;
  add(bevelBox(sgW + 0.03, sgH + 0.03, 0.03, 0.01), frameMtl, -pierCx, 1.62, facadeZ0 - 0.005); // frame
  add(bevelBox(sgW, sgH, 0.02, 0.005), signGlow, -pierCx, 1.62, facadeZ0 + 0.02);               // glowing face

  // ===== 8. THRESHOLD STEP + SILL =========================================
  const stepW = doorTotW + 2 * (half - doorHalf) * 0.55;
  add(bevelBox(stepW, 0.08, 0.5, 0.02), stone, 0, 0.04, 0.25);        // outer step (projects +Z)
  add(bevelBox(openW, 0.05, revealD + 0.02, 0.01), stoneDark, 0, 0.025, glassZ / 2 + 0.02); // inner sill

  // ===== 9. FLANKING STONE PLANTERS w/ clipped hedge ======================
  const planX = pierCx;
  const makePlanter = (px) => {
    add(bevelBox(0.5, 0.42, 0.5, 0.03), stone, px, 0.21, 0.62);          // planter box
    add(bevelBox(0.46, 0.06, 0.46, 0.02), stoneDark, px, 0.44, 0.62);    // rim shadow
    add(bevelBox(0.44, 0.30, 0.44, 0.10), P.leaf, px, 0.60, 0.62);       // clipped hedge
    add(bevelBox(0.30, 0.14, 0.30, 0.07), P.leafDark, px, 0.72, 0.62);   // hedge crown
  };
  makePlanter(-planX);
  makePlanter( planX);

  shadows(g);
  return g;
}

export default createEntrance;

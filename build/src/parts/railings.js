// ---------------------------------------------------------------------------
// parts/railings.js — balcony-edge railings for the luxury apartment complex.
// Three hard-surface, genuinely-3D balcony guards:
//   createGlassBalustrade  — frameless laminated glass in a brushed base shoe.
//   createSlatRailing      — horizontal-slat metal railing between end posts.
//   createPerforatedRailing— framed dark powder-coated perforated infill panel.
//
// Conventions: metres, +Y up. Centered on X (x∈[-w/2,w/2]); base at y=0 growing
// up; mounting plane z=0; visible face projects toward +Z (outward). Infill/glass
// sits roughly in z∈[-0.03,0.03], end posts at x=±w/2, base at y=0.
// ---------------------------------------------------------------------------
import { THREE, bevelBox, palette, shadows } from './kit.js';

// Small local helper: build an InstancedMesh from a geometry+material and a list
// of per-instance transforms (position + optional per-instance scale).
function instanced(geo, material, transforms) {
  const m = new THREE.InstancedMesh(geo, material, transforms.length);
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    p.set(t[0], t[1], t[2]);
    if (t[3] !== undefined) s.set(t[3], t[4], t[5]); else s.set(1, 1, 1);
    mat4.compose(p, q, s);
    m.setMatrixAt(i, mat4);
  }
  m.instanceMatrix.needsUpdate = true;
  return m;
}

// ===========================================================================
// 1) GLASS BALUSTRADE — frameless / point-fixed laminated glass.
// ===========================================================================
export function createGlassBalustrade(width = 3.2, height = 1.12) {
  const g = new THREE.Group();
  const P = palette();

  // --- Base shoe channel: brushed-metal U that grips the glass foot. ---------
  const shoeH = 0.105, shoeD = 0.075;
  const shoe = new THREE.Mesh(bevelBox(width, shoeH, shoeD, 0.012, 2), P.steel);
  shoe.position.set(0, shoeH / 2, 0);
  g.add(shoe);
  // A subtle recessed cover strip along the top of the shoe (the glazing slot).
  const slot = new THREE.Mesh(bevelBox(width - 0.03, 0.022, 0.028, 0.006, 1), P.black);
  slot.position.set(0, shoeH - 0.008, 0);
  g.add(slot);

  // --- Round top handrail spanning the full width. ---------------------------
  const railR = 0.024;
  const railY = height - railR;
  const railGeo = new THREE.CylinderGeometry(railR, railR, width, 18, 1);
  railGeo.rotateZ(Math.PI / 2);
  const rail = new THREE.Mesh(railGeo, P.steel);
  rail.position.set(0, railY, 0);
  g.add(rail);
  // Slightly domed steel end caps on the handrail.
  const capGeo = new THREE.SphereGeometry(railR, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.rotateZ(-Math.PI / 2);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, P.steel);
    cap.position.set(sx * width / 2, railY, 0);
    cap.scale.x = sx;
    g.add(cap);
  }

  // --- Laminated tinted glass, seated in the shoe & tucked under the rail. ----
  const glassThick = 0.014;
  const glassBottom = shoeH - 0.03;          // seated deep into the shoe
  const glassTop = railY;                     // hidden under the round handrail
  const glassH = glassTop - glassBottom;
  const endMargin = 0.014;
  const twoPanels = width >= 2.4;
  const panels = [];
  if (twoPanels) {
    const gap = 0.02;
    const pw = (width - 2 * endMargin - gap) / 2;
    panels.push([-(gap / 2 + pw / 2), pw]);
    panels.push([+(gap / 2 + pw / 2), pw]);
  } else {
    panels.push([0, width - 2 * endMargin]);
  }
  for (const [cx, pw] of panels) {
    const glass = new THREE.Mesh(bevelBox(pw, glassH, glassThick, 0.003, 1), P.glass);
    glass.position.set(cx, glassBottom + glassH / 2, 0);
    g.add(glass);
  }

  // --- Point-fixed standoff spigots: round bolt caps on the shoe front face. --
  const spigotGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.03, 14, 1);
  spigotGeo.rotateX(Math.PI / 2);           // axis along Z (points outward)
  const nSpig = Math.max(2, Math.round(width / 0.62));
  const spTf = [];
  for (let i = 0; i < nSpig; i++) {
    const x = -width / 2 + (i + 0.5) * (width / nSpig);
    spTf.push([x, shoeH * 0.5, shoeD / 2 + 0.012]);
  }
  g.add(instanced(spigotGeo, P.darkMetal, spTf));

  shadows(g);
  return g;
}

// ===========================================================================
// 2) SLAT RAILING — horizontal thin rectangular slats between end posts.
// ===========================================================================
export function createSlatRailing(width = 3.2, height = 1.12) {
  const g = new THREE.Group();
  const P = palette();
  const metal = P.darkMetal;

  // --- End posts. ------------------------------------------------------------
  const postW = 0.05, postD = 0.06;
  const postGeo = bevelBox(postW, height, postD, 0.008, 2);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, metal);
    post.position.set(sx * (width / 2 - postW / 2), height / 2, 0);
    g.add(post);
  }

  // --- Top & bottom rails spanning between the posts. ------------------------
  const innerW = width - 2 * postW;
  const topRail = new THREE.Mesh(bevelBox(innerW, 0.052, 0.07, 0.01, 2), metal);
  topRail.position.set(0, height - 0.026, 0);
  g.add(topRail);
  const botRail = new THREE.Mesh(bevelBox(innerW, 0.045, 0.06, 0.009, 2), metal);
  botRail.position.set(0, 0.06, 0);
  g.add(botRail);

  // --- Horizontal slats (InstancedMesh). -------------------------------------
  const slatH = 0.028, slatD = 0.032;
  const slatGeo = bevelBox(innerW, slatH, slatD, 0.006, 1);
  const fieldBottom = 0.06 + 0.045 / 2 + 0.05;      // just above bottom rail
  const fieldTop = height - 0.026 - 0.052 / 2 - 0.05; // just below top rail
  const spacing = 0.078;
  const nSlats = Math.max(1, Math.floor((fieldTop - fieldBottom) / spacing) + 1);
  const step = nSlats > 1 ? (fieldTop - fieldBottom) / (nSlats - 1) : 0;
  const tf = [];
  for (let i = 0; i < nSlats; i++) tf.push([0, fieldBottom + i * step, 0]);
  g.add(instanced(slatGeo, metal, tf));

  shadows(g);
  return g;
}

// ===========================================================================
// 3) PERFORATED RAILING — framed dark perforated-metal infill panel.
// ===========================================================================
export function createPerforatedRailing(width = 3.2, height = 1.12) {
  const g = new THREE.Group();
  const P = palette();
  const frameMat = P.darkMetal;
  const panelMat = P.charcoal;

  // --- Slim extruded frame (four bars) with real depth & bevel. --------------
  const fw = 0.045;          // frame face width
  const fd = 0.06;           // frame depth
  const railH = bevelBox(width, fw, fd, 0.008, 1);
  const top = new THREE.Mesh(railH, frameMat);
  top.position.set(0, height - fw / 2, 0);
  const bot = new THREE.Mesh(railH, frameMat);
  bot.position.set(0, fw / 2, 0);
  const innerH = height - 2 * fw;
  const railV = bevelBox(fw, innerH, fd, 0.008, 1);
  const styleGeoUse = railV;
  const left = new THREE.Mesh(styleGeoUse, frameMat);
  left.position.set(-width / 2 + fw / 2, height / 2, 0);
  const right = new THREE.Mesh(styleGeoUse, frameMat);
  right.position.set(width / 2 - fw / 2, height / 2, 0);
  g.add(top, bot, left, right);

  // --- Thin perforated infill panel recessed inside the frame. ---------------
  const infW = width - 2 * fw + 0.01;
  const infH = innerH + 0.01;
  const infThick = 0.008;
  const infill = new THREE.Mesh(bevelBox(infW, infH, infThick, 0.002, 1), panelMat);
  infill.position.set(0, height / 2, 0);
  g.add(infill);

  // --- Perforations suggested as a dense InstancedMesh grid of shallow holes.--
  // Short dark cylinders punched into the front face read as round perforations
  // while staying well under the triangle budget.
  const holeR = 0.016;
  const pitch = 0.07;
  const usableW = infW - 0.05, usableH = infH - 0.05;
  let cols = Math.floor(usableW / pitch);
  let rows = Math.floor(usableH / pitch);
  // Cap total instance count so tris stay < ~5k (flat disc = 8 tris each).
  const MAX_HOLES = 480;
  while (cols * rows > MAX_HOLES) { if (cols / usableW >= rows / usableH) cols--; else rows--; }
  // Flat dark discs sitting just proud of the recessed infill front face read as
  // punched perforations while keeping the triangle count tiny.
  const holeGeo = new THREE.CircleGeometry(holeR, 8);
  const holeMat = P.black;
  const holeTf = [];
  const x0 = -((cols - 1) * pitch) / 2;
  const y0 = height / 2 - ((rows - 1) * pitch) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holeTf.push([x0 + c * pitch, y0 + r * pitch, infThick / 2 + 0.001]);
    }
  }
  g.add(instanced(holeGeo, holeMat, holeTf));

  shadows(g);
  return g;
}

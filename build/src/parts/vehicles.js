// ---------------------------------------------------------------------------
// parts/vehicles.js — detailed vehicles, people and street furniture for the
// boulevard / courtyard of the luxury apartment complex.
//   createLuxurySUV(color) — modern premium SUV, ~4.7 m, faces +X.
//   createSedan(color)     — sleek executive sedan, ~4.8 m, faces +X.
//   createBicycle()        — detailed spoked bicycle, faces +X.
//   createPerson(kind)     — low-poly human with real limbs, ~1.7 m tall.
//   createBench2(length)   — slatted boulevard bench (optional).
//   createBollard(height)  — cast bollard (optional).
//
// Conventions: metres, +Y up. GROUND parts — centred at origin, feet/wheels on
// y=0. Cars face +X (length along X, front at +X, width along Z). shadows()
// applied to every group.
// ---------------------------------------------------------------------------
import { THREE, bevelBox, lathe, tube, mat, palette, shadows } from './kit.js';

// --- small local material helpers -----------------------------------------
function carPaint(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.32, metalness: 0.55, envMapIntensity: 1.25
  });
}
function emissive(color, intensity = 1.0) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    roughness: 0.3, metalness: 0.1, envMapIntensity: 0.6
  });
}
function instanced(geo, material, transforms) {
  const m = new THREE.InstancedMesh(geo, material, transforms.length);
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    p.set(t[0], t[1], t[2]);
    if (t.q) q.copy(t.q); else q.identity();
    if (t.s) s.set(t.s[0], t.s[1], t.s[2]); else s.set(1, 1, 1);
    mat4.compose(p, q, s);
    m.setMatrixAt(i, mat4);
  }
  m.instanceMatrix.needsUpdate = true;
  return m;
}

// ===========================================================================
// WHEEL — reusable tyre + alloy hub. Axis along Z, centred at origin, outer
// (styled) face toward +Z. Bottom of tyre at y = -R (so caller lifts by R).
// ===========================================================================
function makeWheel(R = 0.36, width = 0.26, opts = {}) {
  const g = new THREE.Group();
  const tyreMat = opts.tyre || mat(0x0d0d10, { roughness: 0.85, metalness: 0.0 });
  const alloyMat = opts.alloy || mat(0xb8bcc2, { roughness: 0.3, metalness: 0.92, envMapIntensity: 1.2 });
  const hubMat = opts.hub || mat(0x2a2c30, { roughness: 0.4, metalness: 0.8 });

  const rimR = R * 0.62;
  const sh = Math.min(0.055, width * 0.28);
  const hw = width / 2;
  // Tyre cross-section (radius,y) lathed around Y, then tipped so axis -> Z.
  const prof = [
    [rimR, -hw], [R - sh, -hw], [R, -hw + sh],
    [R, hw - sh], [R - sh, hw], [rimR, hw], [rimR, -hw]
  ];
  const tyre = new THREE.Mesh(lathe(prof, 28), tyreMat);
  tyre.rotation.x = Math.PI / 2;
  g.add(tyre);

  // Rim barrel (inside the tyre).
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR, rimR, width * 0.92, 24, 1), alloyMat);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);

  // Alloy face disc set just inboard of the outer tyre wall.
  const faceZ = hw - 0.03;
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.97, 0.02, 24, 1), alloyMat);
  face.rotation.x = Math.PI / 2; face.position.z = faceZ;
  g.add(face);

  // Five-spoke alloy: thin tapered boxes radiating in the wheel (X-Y) plane.
  const nSpk = 5, spokeGeo = bevelBox(rimR * 0.86, 0.05, 0.03, 0.008, 1);
  for (let i = 0; i < nSpk; i++) {
    const a = (i / nSpk) * Math.PI * 2;
    const s = new THREE.Mesh(spokeGeo, alloyMat);
    s.position.set(Math.cos(a) * rimR * 0.45, Math.sin(a) * rimR * 0.45, faceZ + 0.005);
    s.rotation.z = a;
    g.add(s);
  }
  // Hub cap.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.28, 0.05, 16, 1), hubMat);
  cap.rotation.x = Math.PI / 2; cap.position.z = faceZ + 0.02;
  g.add(cap);
  // Brake disc hint behind spokes.
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.7, rimR * 0.7, 0.015, 20, 1), hubMat);
  disc.rotation.x = Math.PI / 2; disc.position.z = -0.01;
  g.add(disc);

  return g;
}

// Place four wheels on a car body group; outer faces point outward on each side.
function mountWheels(g, R, width, axleX, trackZ, mats) {
  for (const sx of [-1, 1]) {        // rear (-1), front (+1)
    for (const sz of [-1, 1]) {      // right (-1), left (+1)
      const w = makeWheel(R, width, mats);
      w.position.set(sx * axleX, R, sz * trackZ);
      if (sz < 0) w.scale.z = -1;    // flip so styled face points outward
      g.add(w);
    }
  }
}

// Rounded fender-flare arch over a wheel (partial torus in the X-Y plane).
function wheelArch(R, axleX, trackZ, sz, mat) {
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.12, 0.055, 8, 16, Math.PI), mat);
  arch.position.set(axleX, R, sz * trackZ);
  return arch;
}

// ===========================================================================
// 1) LUXURY SUV
// ===========================================================================
export function createLuxurySUV(color = 0xffffff) {
  const g = new THREE.Group();
  const P = palette();
  const paint = carPaint(color);
  const glass = P.glass, black = P.black, trim = P.darkMetal, chrome = P.steel;

  const L = 4.7, W = 1.98, R = 0.37, track = 0.83, axle = 1.42;
  const wheelW = 0.28;

  // --- Lower body: tall, softly rounded SUV volume. --------------------------
  const bodyBotY = 0.28, bodyTopY = 1.34;
  const bodyH = bodyTopY - bodyBotY;
  const lower = new THREE.Mesh(bevelBox(L, bodyH, W, 0.24, 3), paint);
  lower.position.set(0, (bodyBotY + bodyTopY) / 2, 0);
  g.add(lower);

  // Lower cladding / sill (darker rocker) to ground the mass visually.
  const cladding = new THREE.Mesh(bevelBox(L * 0.99, 0.30, W + 0.02, 0.10, 2), trim);
  cladding.position.set(0, bodyBotY + 0.12, 0);
  g.add(cladding);

  // Skid plate hints front & rear.
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(bevelBox(0.5, 0.14, W * 0.7, 0.04, 1), chrome);
    skid.position.set(sx * (L / 2 - 0.28), bodyBotY + 0.02, 0);
    g.add(skid);
  }

  // --- Greenhouse (cabin) — tinted glass band with subtle tumblehome. --------
  const cabL = 2.95, cabW = W - 0.12, cabBotY = 1.24, cabTopY = 1.74;
  const cabH = cabTopY - cabBotY;
  const cabX = -0.12;   // cabin sits slightly rearward (short SUV hood)
  const green = new THREE.Mesh(bevelBox(cabL, cabH, cabW, 0.13, 2), glass);
  green.position.set(cabX, (cabBotY + cabTopY) / 2, 0);
  g.add(green);

  // Roof — solid paint slab capping the greenhouse, overhanging slightly.
  const roof = new THREE.Mesh(bevelBox(cabL + 0.04, 0.14, cabW + 0.03, 0.1, 3), paint);
  roof.position.set(cabX, cabTopY - 0.03, 0);
  g.add(roof);

  // Pillars (A/B/C) — slim paint uprights framing the side glass.
  const pillarMat = paint;
  const pillarZ = cabW / 2 - 0.01;
  const pillarDefs = [cabX + cabL / 2 - 0.06, cabX + 0.1, cabX - cabL / 2 + 0.06];
  for (const px of pillarDefs) {
    for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(bevelBox(0.10, cabH + 0.02, 0.05, 0.02, 1), pillarMat);
      pil.position.set(px, (cabBotY + cabTopY) / 2, sz * pillarZ);
      g.add(pil);
    }
  }

  // --- Belt-line chrome strip along the base of the glass. -------------------
  for (const sz of [-1, 1]) {
    const belt = new THREE.Mesh(bevelBox(cabL, 0.03, 0.02, 0.006, 1), chrome);
    belt.position.set(cabX, cabBotY + 0.01, sz * (cabW / 2 + 0.005));
    g.add(belt);
  }

  // --- Roof rails — two slim rails running along the roof edges. -------------
  for (const sz of [-1, 1]) {
    const railGeo = new THREE.CylinderGeometry(0.022, 0.022, cabL - 0.3, 10, 1);
    railGeo.rotateZ(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, trim);
    rail.position.set(cabX, cabTopY + 0.04, sz * (cabW / 2 - 0.12));
    g.add(rail);
    // small feet
    for (const ex of [-1, 1]) {
      const foot = new THREE.Mesh(bevelBox(0.06, 0.05, 0.05, 0.01, 1), trim);
      foot.position.set(cabX + ex * (cabL / 2 - 0.22), cabTopY + 0.01, sz * (cabW / 2 - 0.12));
      g.add(foot);
    }
  }

  // --- Wheels + arches (arch flares sit on the body's outer flanks). ---------
  mountWheels(g, R, wheelW, axle, track, { alloy: chrome });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const a = new THREE.Mesh(
        new THREE.TorusGeometry(R * 1.16, 0.06, 8, 18, Math.PI), trim);
      a.position.set(sx * axle, R, sz * (W / 2 - 0.02));
      g.add(a);
    }

  // --- Front end: grille, headlights, bumper. --------------------------------
  const frontX = L / 2;
  const grille = new THREE.Mesh(bevelBox(0.06, 0.42, 0.95, 0.03, 1), black);
  grille.position.set(frontX - 0.02, 0.78, 0);
  g.add(grille);
  // grille vertical slats
  const slatGeo = bevelBox(0.05, 0.36, 0.03, 0.006, 1);
  const slatTf = [];
  for (let i = -4; i <= 4; i++) slatTf.push([frontX + 0.005, 0.78, i * 0.1]);
  g.add(instanced(slatGeo, chrome, slatTf));
  // headlights — slim emissive units flanking the grille
  const hl = emissive(0xfdfbe8, 1.4);
  for (const sz of [-1, 1]) {
    const light = new THREE.Mesh(bevelBox(0.05, 0.16, 0.34, 0.02, 1), hl);
    light.position.set(frontX - 0.01, 0.9, sz * 0.62);
    g.add(light);
  }
  // front bumper
  const fbump = new THREE.Mesh(bevelBox(0.16, 0.26, W * 0.92, 0.06, 2), trim);
  fbump.position.set(frontX - 0.06, 0.5, 0);
  g.add(fbump);

  // --- Rear end: taillights, bumper. -----------------------------------------
  const rearX = -L / 2;
  const tl = emissive(0xd8232a, 1.1);
  for (const sz of [-1, 1]) {
    const light = new THREE.Mesh(bevelBox(0.05, 0.2, 0.28, 0.02, 1), tl);
    light.position.set(rearX + 0.01, 0.95, sz * 0.66);
    g.add(light);
  }
  // rear light bar linking them
  const bar = new THREE.Mesh(bevelBox(0.03, 0.05, 1.3, 0.015, 1), tl);
  bar.position.set(rearX + 0.02, 0.98, 0);
  g.add(bar);
  const rbump = new THREE.Mesh(bevelBox(0.16, 0.26, W * 0.92, 0.06, 2), trim);
  rbump.position.set(rearX + 0.06, 0.5, 0);
  g.add(rbump);

  // --- Side mirrors on the A-pillar base. ------------------------------------
  for (const sz of [-1, 1]) {
    const armMat = paint;
    const arm = new THREE.Mesh(bevelBox(0.1, 0.05, 0.09, 0.02, 1), armMat);
    arm.position.set(cabX + cabL / 2 - 0.02, cabBotY + 0.02, sz * (W / 2 + 0.02));
    g.add(arm);
    const cap = new THREE.Mesh(bevelBox(0.14, 0.11, 0.06, 0.03, 2), paint);
    cap.position.set(cabX + cabL / 2 - 0.02, cabBotY + 0.06, sz * (W / 2 + 0.10));
    g.add(cap);
    const mirror = new THREE.Mesh(bevelBox(0.1, 0.08, 0.01, 0.01, 1), chrome);
    mirror.position.set(cabX + cabL / 2 - 0.05, cabBotY + 0.06, sz * (W / 2 + 0.135));
    g.add(mirror);
  }

  // Door handles.
  for (const sz of [-1, 1]) {
    for (const hx of [cabX + 0.7, cabX - 0.6]) {
      const h = new THREE.Mesh(bevelBox(0.16, 0.03, 0.02, 0.008, 1), chrome);
      h.position.set(hx, cabBotY - 0.05, sz * (W / 2 + 0.005));
      g.add(h);
    }
  }

  shadows(g);
  return g;
}

// ===========================================================================
// 2) EXECUTIVE SEDAN
// ===========================================================================
export function createSedan(color = 0xd8d9dc) {
  const g = new THREE.Group();
  const P = palette();
  const paint = carPaint(color);
  const glass = P.glass, trim = P.darkMetal, chrome = P.steel, black = P.black;

  const L = 4.8, W = 1.84, R = 0.33, track = 0.78, axle = 1.42;
  const wheelW = 0.24;

  // --- Main lower body (3-box base volume). ----------------------------------
  const botY = 0.34, topY = 0.98, bodyH = topY - botY;
  const lower = new THREE.Mesh(bevelBox(L, bodyH, W, 0.24, 3), paint);
  lower.position.set(0, (botY + topY) / 2, 0);
  g.add(lower);

  // Sill / lower accent.
  const sill = new THREE.Mesh(bevelBox(L * 0.97, 0.14, W + 0.01, 0.05, 2), trim);
  sill.position.set(0, botY + 0.05, 0);
  g.add(sill);

  // --- Cabin greenhouse: sleek, raked, set back for a long hood. -------------
  const cabL = 2.15, cabW = W - 0.18, cabBotY = 0.94, cabTopY = 1.42;
  const cabH = cabTopY - cabBotY, cabX = -0.25;
  const green = new THREE.Mesh(bevelBox(cabL, cabH, cabW, 0.14, 2), glass);
  green.position.set(cabX, (cabBotY + cabTopY) / 2, 0);
  g.add(green);

  // Raked windshield & backlight — wedge fillers between hood/boot and roof so
  // the greenhouse flows into the body instead of reading as a stacked box.
  const wsGeo = bevelBox(0.62, 0.1, cabW - 0.03, 0.04, 1);
  const ws = new THREE.Mesh(wsGeo, glass);
  ws.position.set(cabX + cabL / 2 + 0.19, cabBotY + cabH * 0.42, 0);
  ws.rotation.z = 0.72; g.add(ws);
  const rw = new THREE.Mesh(wsGeo, glass);
  rw.position.set(cabX - cabL / 2 - 0.19, cabBotY + cabH * 0.42, 0);
  rw.rotation.z = -0.72; g.add(rw);

  // Roof — low, gently domed paint slab (wide enough to hide the wedge tops).
  const roof = new THREE.Mesh(bevelBox(cabL + 0.42, 0.1, cabW + 0.02, 0.06, 2), paint);
  roof.position.set(cabX, cabTopY, 0);
  g.add(roof);

  // Pillars framing the glass.
  const pillarZ = cabW / 2 - 0.005;
  for (const px of [cabX + cabL / 2 - 0.05, cabX - cabL / 2 + 0.05]) {
    for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(bevelBox(0.09, cabH, 0.05, 0.02, 1), paint);
      pil.position.set(px, (cabBotY + cabTopY) / 2, sz * pillarZ);
      g.add(pil);
    }
  }
  // Chrome window surround.
  for (const sz of [-1, 1]) {
    const belt = new THREE.Mesh(bevelBox(cabL, 0.025, 0.02, 0.005, 1), chrome);
    belt.position.set(cabX, cabBotY + 0.005, sz * (cabW / 2 + 0.004));
    g.add(belt);
  }

  // --- Wheels + subtle arches. -----------------------------------------------
  mountWheels(g, R, wheelW, axle, track, { alloy: chrome });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(wheelArch(R, sx * axle, track + 0.02, sz, trim));

  // --- Front: slim lights + low grille + bumper. -----------------------------
  const frontX = L / 2;
  const grille = new THREE.Mesh(bevelBox(0.05, 0.2, 0.7, 0.02, 1), black);
  grille.position.set(frontX - 0.01, 0.55, 0);
  g.add(grille);
  const slatGeo = bevelBox(0.04, 0.02, 0.66, 0.004, 1);
  const slatTf = [];
  for (let i = 0; i < 4; i++) slatTf.push([frontX, 0.48 + i * 0.045, 0]);
  g.add(instanced(slatGeo, chrome, slatTf));
  const hl = emissive(0xeaf2ff, 1.3);
  for (const sz of [-1, 1]) {
    const light = new THREE.Mesh(bevelBox(0.05, 0.1, 0.36, 0.02, 1), hl);
    light.position.set(frontX - 0.01, 0.7, sz * 0.6);
    g.add(light);
  }
  const fbump = new THREE.Mesh(bevelBox(0.12, 0.2, W * 0.94, 0.05, 2), trim);
  fbump.position.set(frontX - 0.04, 0.45, 0);
  g.add(fbump);

  // --- Rear: wraparound taillights + boot line. ------------------------------
  const rearX = -L / 2;
  const tl = emissive(0xd21e2a, 1.05);
  for (const sz of [-1, 1]) {
    const light = new THREE.Mesh(bevelBox(0.05, 0.12, 0.34, 0.02, 1), tl);
    light.position.set(rearX + 0.01, 0.72, sz * 0.6);
    g.add(light);
  }
  const bar = new THREE.Mesh(bevelBox(0.03, 0.03, 1.15, 0.01, 1), tl);
  bar.position.set(rearX + 0.02, 0.73, 0);
  g.add(bar);
  const rbump = new THREE.Mesh(bevelBox(0.12, 0.2, W * 0.94, 0.05, 2), trim);
  rbump.position.set(rearX + 0.04, 0.45, 0);
  g.add(rbump);

  // --- Mirrors. --------------------------------------------------------------
  for (const sz of [-1, 1]) {
    const cap = new THREE.Mesh(bevelBox(0.13, 0.09, 0.05, 0.025, 2), paint);
    cap.position.set(cabX + cabL / 2 - 0.05, cabBotY - 0.02, sz * (W / 2 + 0.09));
    g.add(cap);
    const mirror = new THREE.Mesh(bevelBox(0.09, 0.07, 0.01, 0.01, 1), chrome);
    mirror.position.set(cabX + cabL / 2 - 0.08, cabBotY - 0.02, sz * (W / 2 + 0.12));
    g.add(mirror);
  }
  // Door handles.
  for (const sz of [-1, 1]) {
    for (const hx of [cabX + 0.55, cabX - 0.55]) {
      const h = new THREE.Mesh(bevelBox(0.15, 0.025, 0.02, 0.006, 1), chrome);
      h.position.set(hx, cabBotY - 0.08, sz * (W / 2 + 0.004));
      g.add(h);
    }
  }

  shadows(g);
  return g;
}

// ===========================================================================
// 3) BICYCLE — spoked wheels, tube frame, bars, saddle, pedals. Faces +X.
// ===========================================================================
export function createBicycle() {
  const g = new THREE.Group();
  const frameMat = mat(0x1f6f8b, { roughness: 0.35, metalness: 0.6, envMapIntensity: 1.1 });
  const rubber = mat(0x111114, { roughness: 0.9 });
  const steel = mat(0xbfc4c9, { roughness: 0.3, metalness: 0.9, envMapIntensity: 1.1 });
  const seatMat = mat(0x161616, { roughness: 0.7 });

  const R = 0.34, hubY = R, base = 0.54;   // wheel centres at x=±base
  const tubeR = 0.022;

  // --- Spoked wheel builder (wheel plane = X-Y, axis along Z). ----------------
  function bikeWheel(cx) {
    const w = new THREE.Group();
    // Tyre (torus) + rim.
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R, 0.028, 10, 32), rubber);
    w.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.014, 8, 32), steel);
    w.add(rim);
    // Hub.
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12, 1), steel);
    hub.rotation.x = Math.PI / 2; w.add(hub);
    // Spokes — thin cylinders from hub to rim.
    const nS = 12, spokeGeo = new THREE.CylinderGeometry(0.004, 0.004, R - 0.04, 4, 1);
    for (let i = 0; i < nS; i++) {
      const a = (i / nS) * Math.PI * 2;
      const s = new THREE.Mesh(spokeGeo, steel);
      s.position.set(Math.cos(a) * (R - 0.04) / 2, Math.sin(a) * (R - 0.04) / 2, 0);
      s.rotation.z = a - Math.PI / 2;
      w.add(s);
    }
    w.position.set(cx, hubY, 0);
    return w;
  }
  g.add(bikeWheel(base));    // front
  g.add(bikeWheel(-base));   // rear

  // --- Frame joints (x,y). ---------------------------------------------------
  const rearHub = [-base, hubY], frontHub = [base, hubY];
  const bb = [-0.02, 0.30];                 // bottom bracket
  const seatTop = [-0.16, 0.92];
  const headBot = [base - 0.16, 0.50], headTop = [base - 0.07, 0.82];

  const P3 = (p, z = 0) => [p[0], p[1], z];
  const addTube = (a, b, r = tubeR, m = frameMat, z = 0) =>
    g.add(new THREE.Mesh(tube([P3(a, z), P3(b, z)], r, 8), m));

  addTube(bb, headBot);        // down tube
  addTube(bb, seatTop);        // seat tube
  addTube(seatTop, headTop);   // top tube
  addTube(headBot, headTop, tubeR * 1.1);  // head tube
  // Chain & seat stays (twin, offset in Z for a 3D read).
  for (const z of [-0.05, 0.05]) {
    addTube(bb, rearHub, 0.014, frameMat, z);
    addTube(seatTop, rearHub, 0.014, frameMat, z);
    // Fork legs.
    addTube(headBot, frontHub, 0.016, steel, z);
  }

  // --- Seat post + saddle. ---------------------------------------------------
  g.add(new THREE.Mesh(tube([P3(seatTop), P3([seatTop[0] - 0.02, seatTop[1] + 0.1])], 0.014), steel));
  const saddle = new THREE.Mesh(bevelBox(0.26, 0.05, 0.14, 0.03, 2), seatMat);
  saddle.position.set(seatTop[0] - 0.03, seatTop[1] + 0.13, 0);
  saddle.rotation.z = -0.06;
  g.add(saddle);

  // --- Stem + handlebars. ----------------------------------------------------
  g.add(new THREE.Mesh(tube([P3(headTop), P3([headTop[0] - 0.14, headTop[1] + 0.12])], 0.016, 8), steel));
  const barY = headTop[1] + 0.12, barX = headTop[0] - 0.14;
  g.add(new THREE.Mesh(tube([[barX, barY, -0.24], [barX, barY, 0.24]], 0.016, 8), steel));
  // Grips.
  for (const sz of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 10, 1), seatMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(barX, barY, sz * 0.19);
    g.add(grip);
  }

  // --- Crank + pedals. -------------------------------------------------------
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 20, 1), steel);
  chain.rotation.x = Math.PI / 2; chain.position.set(bb[0], bb[1], 0.05);
  g.add(chain);
  for (const [sz, ang] of [[1, 0.5], [-1, 0.5 + Math.PI]]) {
    const crank = new THREE.Mesh(bevelBox(0.17, 0.025, 0.02, 0.006, 1), steel);
    crank.position.set(bb[0] + Math.cos(ang) * 0.085, bb[1] + Math.sin(ang) * 0.085, sz * 0.07);
    crank.rotation.z = ang;
    g.add(crank);
    const pedal = new THREE.Mesh(bevelBox(0.1, 0.02, 0.05, 0.006, 1), seatMat);
    pedal.position.set(bb[0] + Math.cos(ang) * 0.17, bb[1] + Math.sin(ang) * 0.17, sz * 0.09);
    g.add(pedal);
  }

  shadows(g);
  return g;
}

// ===========================================================================
// 4) PERSON — real limbs, natural pose. ~1.7 m. kind varies build/pose/colour.
// ===========================================================================
export function createPerson(kind = 0) {
  const g = new THREE.Group();
  const K = ((kind % 4) + 4) % 4;

  // Palettes per kind.
  const skins = [0xd9a77f, 0xc98d63, 0x8a5a3b, 0xe7b892];
  const shirts = [0x2f5d8a, 0x8a3b3b, 0x3a6b4a, 0x4a4a55];
  const pants = [0x2b2f38, 0x555a63, 0x39332b, 0x1f2937];
  const skin = mat(skins[K], { roughness: 0.65 });
  const shirt = mat(shirts[K], { roughness: 0.85 });
  const trouser = mat(pants[K], { roughness: 0.9 });
  const shoe = mat(0x1a1a1e, { roughness: 0.7 });
  const hairMat = mat([0x2a1c12, 0x3a2a18, 0x704a2a, 0x151515][K], { roughness: 0.85 });

  const scale = [1.0, 1.05, 0.94, 1.02][K];   // slight build variation
  const stride = [0.08, 0.16, 0.0, 0.12][K];  // walking stride (x offset)
  const armSwing = [0.1, 0.22, 0.05, 0.16][K];

  // Capsule bone between two 3D points.
  function bone(a, b, r, m) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = Math.max(0.001, dir.length());
    const geo = new THREE.CapsuleGeometry(r, len, 3, 7);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return mesh;
  }

  const hipY = 0.92 * scale, shoulderY = 1.42 * scale, hipZ = 0.11 * scale;

  // --- Torso: pelvis + chest for a real waist. -------------------------------
  const pelvis = new THREE.Mesh(bevelBox(0.30, 0.24, 0.20, 0.08, 2), trouser);
  pelvis.position.set(0, hipY + 0.02, 0);
  g.add(pelvis);
  const chest = new THREE.Mesh(bevelBox(0.36, 0.42, 0.22, 0.1, 2), shirt);
  chest.position.set(0, hipY + 0.34, 0);
  g.add(chest);
  // Shoulders rounded.
  for (const sz of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), shirt);
    sh.position.set(0, shoulderY, sz * 0.16 * scale);
    g.add(sh);
  }

  // --- Neck + head. ----------------------------------------------------------
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 10, 1), skin);
  neck.position.set(0, shoulderY + 0.06, 0);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skin);
  head.scale.set(0.92, 1.05, 0.96);
  head.position.set(0.01, shoulderY + 0.2, 0);
  g.add(head);
  // Hair cap.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hair.position.set(0, shoulderY + 0.21, -0.01);
  hair.rotation.x = -0.15;
  g.add(hair);

  // --- Legs (with stride). front leg +X, rear leg -X. ------------------------
  for (const sz of [-1, 1]) {
    const sx = sz === 1 ? stride : -stride;  // one leg forward
    const hip = [sx * 0.4, hipY - 0.02, sz * hipZ];
    const knee = [sx * 0.9 + sx * 0.1, 0.5 * scale, sz * hipZ * 0.9];
    const ankle = [sx * 1.1, 0.08 * scale, sz * hipZ * 0.9];
    g.add(bone(hip, knee, 0.075 * scale, trouser));   // thigh
    g.add(bone(knee, ankle, 0.055 * scale, trouser)); // shin
    // Foot.
    const foot = new THREE.Mesh(bevelBox(0.24, 0.07, 0.11, 0.03, 2), shoe);
    foot.position.set(ankle[0] + 0.06, 0.035, ankle[2]);
    g.add(foot);
  }

  // --- Arms (opposite swing to legs). ----------------------------------------
  for (const sz of [-1, 1]) {
    const swing = sz === 1 ? -armSwing : armSwing;
    const shoulder = [0, shoulderY - 0.02, sz * 0.18 * scale];
    const elbow = [swing * 1.4, shoulderY - 0.30, sz * 0.2 * scale];
    const wrist = [swing * 2.6 + 0.02, shoulderY - 0.56, sz * 0.19 * scale];
    g.add(bone(shoulder, elbow, 0.05 * scale, shirt));  // upper arm
    g.add(bone(elbow, wrist, 0.042 * scale, skin));     // forearm
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    hand.position.set(wrist[0], wrist[1] - 0.04, wrist[2]);
    g.add(hand);
  }

  shadows(g);
  return g;
}

// ===========================================================================
// 5) BENCH — slatted boulevard bench (optional).
// ===========================================================================
export function createBench2(length = 1.8) {
  const g = new THREE.Group();
  const wood = mat(0x9a6238, { roughness: 0.6 });
  const metal = mat(0x26282d, { roughness: 0.4, metalness: 0.85 });

  const seatY = 0.44, depth = 0.5, backY = 0.86;
  // Slats — seat (horizontal) + back.
  const nSlat = 5, slatW = (depth) / nSlat - 0.015;
  for (let i = 0; i < nSlat; i++) {
    const z = -depth / 2 + slatW / 2 + i * (depth / nSlat);
    const s = new THREE.Mesh(bevelBox(length, 0.03, slatW, 0.008, 1), wood);
    s.position.set(0, seatY, z);
    g.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const y = seatY + 0.14 + i * 0.11;
    const s = new THREE.Mesh(bevelBox(length, 0.08, 0.03, 0.008, 1), wood);
    s.position.set(-depth / 2 + 0.03, y, 0);
    g.add(s);
  }

  // End frames (metal loops).
  for (const sx of [-1, 1]) {
    const x = sx * (length / 2 - 0.08);
    const legF = new THREE.Mesh(bevelBox(0.05, seatY, 0.05, 0.012, 1), metal);
    legF.position.set(x, seatY / 2, depth / 2 - 0.06);
    g.add(legF);
    const legB = new THREE.Mesh(bevelBox(0.05, backY, 0.05, 0.012, 1), metal);
    legB.position.set(x, backY / 2, -depth / 2 + 0.06);
    g.add(legB);
    const seatBar = new THREE.Mesh(bevelBox(0.05, 0.05, depth, 0.012, 1), metal);
    seatBar.position.set(x, seatY, 0);
    g.add(seatBar);
  }

  shadows(g);
  return g;
}

// ===========================================================================
// 6) BOLLARD — cast bollard (optional).
// ===========================================================================
export function createBollard(height = 0.9) {
  const g = new THREE.Group();
  const metal = mat(0x2a2c30, { roughness: 0.45, metalness: 0.8, envMapIntensity: 1.0 });
  const accent = mat(0xb8bcc2, { roughness: 0.3, metalness: 0.9 });

  const rBase = 0.11, rTop = 0.08;
  // Lathed body: base flare, shaft, domed cap.
  const prof = [
    [0, 0], [rBase, 0], [rBase, 0.05], [rBase * 0.82, 0.09],
    [rTop, 0.16], [rTop, height - 0.1],
    [rTop * 0.95, height - 0.05], [rTop * 0.6, height - 0.01], [0, height]
  ];
  const body = new THREE.Mesh(lathe(prof, 28), metal);
  g.add(body);
  // Reflective band near the top.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop + 0.004, rTop + 0.004, 0.05, 28, 1), accent);
  band.position.y = height - 0.18;
  g.add(band);

  shadows(g);
  return g;
}

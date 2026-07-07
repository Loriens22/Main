// ---------------------------------------------------------------------------
// Rooftop mechanical / equipment kit — HVAC condensers, ductwork, vent cowls,
// roof-access bulkhead, PV array, safety handrail, parapet coping.
// Units: METRES, +Y up. Footprint centered at origin; base sits on y=0 (roof).
// ---------------------------------------------------------------------------
import {
  THREE, bevelBox, lathe, tube, mat, palette, shadows
} from './kit.js';

// Shared, module-level materials so repeated parts merge / stay consistent.
const P = palette();
const HVAC_GREY   = mat(0x777a7e, { roughness: 0.45, metalness: 0.75, envMapIntensity: 0.9 });
const HVAC_DARK   = mat(0x54585c, { roughness: 0.5,  metalness: 0.7 });
const LOUVRE_MET  = mat(0x8b9095, { roughness: 0.35, metalness: 0.85 });
const FAN_GUARD   = mat(0x2a2c30, { roughness: 0.45, metalness: 0.7 });
const PIPE_STEEL  = P.steel;
const INSUL_DUCT  = mat(0xb7b9b2, { roughness: 0.85, metalness: 0.15 });   // insulated silver-grey lagging
const DUCT_METAL  = mat(0x9aa0a6, { roughness: 0.4,  metalness: 0.85 });
const COWL_MET    = mat(0x909699, { roughness: 0.4, metalness: 0.8 });
const CLAD_PANEL  = mat(0xd8d9d6, { roughness: 0.55, metalness: 0.2 });    // bulkhead cladding
const PV_GLASS    = mat(0x14284a, { roughness: 0.18, metalness: 0.5, envMapIntensity: 1.2 });
const PV_FRAME    = mat(0xb9bcc0, { roughness: 0.3,  metalness: 0.9 });
const RAIL_MET    = mat(0xc2c5c8, { roughness: 0.3,  metalness: 0.9 });
const COPING_MET  = mat(0x9fa2a6, { roughness: 0.4,  metalness: 0.7 });

// small helper: add a mesh from geometry + material at a transform
function put(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// ===========================================================================
// createHVAC — a rooftop condenser / air-handling unit.
//   Metal box housing, louvred side vents (thin instanced slats), recessed
//   circular top fan with radial blades + wire guard, pipe stubs, base feet.
// ===========================================================================
export function createHVAC(w = 1.4, h = 0.9, d = 1.1) {
  const g = new THREE.Group();
  g.name = 'HVAC';

  const footH = 0.08;                 // base foot height (unit floats on feet)
  const bodyH = h - footH;
  const bodyY = footH + bodyH / 2;

  // --- main housing (bevelled so edges catch light) -----------------------
  put(g, bevelBox(w, bodyH, d, 0.02), HVAC_GREY, 0, bodyY, 0);

  // slightly inset top deck rim
  put(g, bevelBox(w * 0.98, 0.04, d * 0.98, 0.015), HVAC_DARK, 0, footH + bodyH, 0);

  // corner posts / frame uprights for a fabricated look
  const postR = 0.03;
  const px = w / 2 - postR, pz = d / 2 - postR;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(g, bevelBox(0.06, bodyH * 0.98, 0.06, 0.01), HVAC_DARK,
        sx * px, bodyY, sz * pz);
  }

  // --- louvred side vents on the two long (±Z) faces ----------------------
  // Real thin angled slats via InstancedMesh inside a recessed frame.
  const ventW = w * 0.72, ventH = bodyH * 0.62;
  const slatCount = 11;
  const slatT = 0.012, slatDepth = 0.05;
  const slatGeo = new THREE.BoxGeometry(ventW, slatT, slatDepth);

  for (const sz of [-1, 1]) {
    const faceZ = sz * (d / 2 + 0.001);
    // recessed dark vent well
    put(g, bevelBox(ventW + 0.06, ventH + 0.06, 0.02, 0.008), HVAC_DARK,
        0, bodyY, sz * (d / 2 - 0.02));

    const inst = new THREE.InstancedMesh(slatGeo, LOUVRE_MET, slatCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(sz * -0.5, 0, 0));
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < slatCount; i++) {
      const t = i / (slatCount - 1);
      const yy = bodyY + (t - 0.5) * ventH;
      pos.set(0, yy, faceZ);
      m4.compose(pos, q, scl);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);
  }

  // --- recessed circular fan on the top deck ------------------------------
  const topY = footH + bodyH + 0.02;
  const fanR = Math.min(w, d) * 0.34;

  // fan well ring (raised collar) via lathe
  const collar = lathe([
    [fanR + 0.06, 0], [fanR + 0.08, 0.02], [fanR + 0.07, 0.05],
    [fanR + 0.02, 0.06], [fanR, 0.05], [fanR, 0]
  ], 40);
  put(g, collar, HVAC_DARK, 0, topY, 0);

  // dark recessed disc (the shroud interior)
  put(g, new THREE.CylinderGeometry(fanR, fanR, 0.04, 40), FAN_GUARD,
      0, topY + 0.005, 0);

  // central hub
  put(g, new THREE.CylinderGeometry(fanR * 0.16, fanR * 0.2, 0.08, 20),
      HVAC_DARK, 0, topY + 0.06, 0);

  // radial fan blades (instanced, slightly pitched)
  const bladeCount = 7;
  const bladeGeo = new THREE.BoxGeometry(fanR * 0.72, 0.008, fanR * 0.26);
  const blades = new THREE.InstancedMesh(bladeGeo, LOUVRE_MET, bladeCount);
  {
    const m4 = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < bladeCount; i++) {
      const a = (i / bladeCount) * Math.PI * 2;
      e.set(0, a, 0.32);                    // pitch the blade
      q.setFromEuler(e);
      pos.set(Math.cos(a) * fanR * 0.42, topY + 0.045, Math.sin(a) * fanR * 0.42);
      m4.compose(pos, q, scl);
      blades.setMatrixAt(i, m4);
    }
    blades.instanceMatrix.needsUpdate = true;
    blades.castShadow = true; blades.receiveShadow = true;
    g.add(blades);
  }

  // wire fan guard: concentric rings + radial spokes (thin tubes)
  const guardTop = topY + 0.08;
  for (const rr of [fanR * 0.45, fanR * 0.8, fanR]) {
    const ring = new THREE.TorusGeometry(rr, 0.006, 6, 32);
    put(g, ring, FAN_GUARD, 0, guardTop, 0, Math.PI / 2, 0, 0);
  }
  const spokeGeo = new THREE.CylinderGeometry(0.006, 0.006, fanR * 2, 6);
  for (let i = 0; i < 4; i++) {
    put(g, spokeGeo, FAN_GUARD, 0, guardTop, 0, Math.PI / 2, (i / 4) * Math.PI, 0);
  }

  // --- pipe stubs on one short (+X) end -----------------------------------
  const pipeMat = PIPE_STEEL;
  for (const sy of [-1, 1]) {
    const py = bodyY + sy * bodyH * 0.22;
    put(g, tube([
      [w / 2 - 0.02, py, 0.18 * sy],
      [w / 2 + 0.12, py, 0.18 * sy],
      [w / 2 + 0.16, py + 0.1 * sy, 0.18 * sy]
    ], 0.028, 10), pipeMat);
    // flange collar where pipe meets housing
    put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), HVAC_DARK,
        w / 2 - 0.005, py, 0.18 * sy, 0, 0, Math.PI / 2);
  }

  // small control/junction box on +X face
  put(g, bevelBox(0.04, 0.22, 0.16, 0.01), HVAC_DARK,
      w / 2 + 0.02, bodyY - 0.02, -0.22);

  // --- base feet (short steel channel supports) ---------------------------
  const footGeo = bevelBox(0.14, footH, d * 0.9, 0.01);
  for (const sx of [-1, 1]) {
    put(g, footGeo, HVAC_DARK, sx * (w / 2 - 0.12), footH / 2, 0);
  }

  shadows(g);
  return g;
}

// ===========================================================================
// Internal builders for the cluster
// ===========================================================================

// vent cowl / stack: pipe + lathe'd mushroom cap
function makeVentCowl(pipeR = 0.11, height = 0.7) {
  const g = new THREE.Group();
  // curb base
  put(g, bevelBox(pipeR * 3.4, 0.06, pipeR * 3.4, 0.01), HVAC_DARK, 0, 0.03, 0);
  // stack pipe
  put(g, new THREE.CylinderGeometry(pipeR, pipeR, height, 22), DUCT_METAL,
      0, height / 2 + 0.06, 0);
  // banded joint
  put(g, new THREE.CylinderGeometry(pipeR * 1.08, pipeR * 1.08, 0.03, 22),
      COWL_MET, 0, height * 0.55, 0);
  // lathe'd mushroom rain cowl on top
  const capY = height + 0.06;
  const cowl = lathe([
    [pipeR * 0.98, 0],
    [pipeR * 0.98, 0.02],
    [pipeR * 1.9, 0.03],
    [pipeR * 1.95, 0.09],
    [pipeR * 1.5, 0.14],
    [0, 0.16]
  ], 24);
  put(g, cowl, COWL_MET, 0, capY, 0);
  shadows(g);
  return g;
}

// insulated duct run raised on small supports, with two elbows
function makeDuctRun(len = 4.2) {
  const g = new THREE.Group();
  const dr = 0.16;                 // duct radius
  const runY = 0.42;               // height of the horizontal run
  // support legs
  const legGeo = bevelBox(0.06, runY, 0.06, 0.008);
  const legXs = [-len / 2 + 0.2, -len / 6, len / 6, len / 2 - 0.6];
  for (const lx of legXs) {
    put(g, legGeo, HVAC_DARK, lx, runY / 2, 0);
    // saddle
    put(g, bevelBox(0.16, 0.04, 0.16, 0.01), HVAC_DARK, lx, runY, 0);
  }
  // main horizontal insulated run (a tube path with an up-elbow at the end)
  const path = [
    [-len / 2, runY, 0],
    [len / 2 - 0.5, runY, 0],
    [len / 2 - 0.2, runY, 0],
    [len / 2 - 0.2, runY + 0.35, 0],
    [len / 2 - 0.2, runY + 0.7, 0]
  ];
  put(g, tube(path, dr, 16), INSUL_DUCT);
  // insulation banding rings along the run
  for (let i = 0; i < 6; i++) {
    const bx = -len / 2 + 0.3 + i * ((len - 1.0) / 5);
    put(g, new THREE.CylinderGeometry(dr * 1.04, dr * 1.04, 0.03, 18),
        DUCT_METAL, bx, runY, 0, 0, 0, Math.PI / 2);
  }
  // rectangular transition box at the start (plenum)
  put(g, bevelBox(0.4, 0.42, 0.42, 0.02), INSUL_DUCT, -len / 2 - 0.02, runY, 0);
  // cap on the vertical riser
  put(g, new THREE.CylinderGeometry(dr * 1.2, dr, 0.06, 18), DUCT_METAL,
      len / 2 - 0.2, runY + 0.72, 0);
  shadows(g);
  return g;
}

// roof-access bulkhead: clad box with a door and a coping cap
function makeBulkhead(w = 1.6, h = 2.2, d = 1.3) {
  const g = new THREE.Group();
  // clad body
  put(g, bevelBox(w, h, d, 0.02), CLAD_PANEL, 0, h / 2, 0);
  // vertical cladding seams (thin recessed lines) on front/back
  const seamGeo = bevelBox(0.02, h * 0.96, 0.01, 0.004);
  for (let i = 1; i < 4; i++) {
    const sx = -w / 2 + (i * w / 4);
    put(g, seamGeo, HVAC_DARK, sx, h / 2, d / 2 + 0.002);
    put(g, seamGeo, HVAC_DARK, sx, h / 2, -d / 2 - 0.002);
  }
  // parapet-style coping cap
  put(g, bevelBox(w + 0.1, 0.08, d + 0.1, 0.02), COPING_MET, 0, h + 0.03, 0);
  // door on +Z face
  const doorW = w * 0.5, doorH = h * 0.78;
  put(g, bevelBox(doorW, doorH, 0.04, 0.01), HVAC_DARK, 0, doorH / 2 + 0.05, d / 2 + 0.01);
  // door frame
  put(g, bevelBox(doorW + 0.1, doorH + 0.1, 0.03, 0.01), P.charcoal,
      0, doorH / 2 + 0.05, d / 2 + 0.005);
  // handle
  put(g, new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), PV_FRAME,
      doorW / 2 - 0.08, doorH / 2, d / 2 + 0.04, 0, 0, 0);
  shadows(g);
  return g;
}

// tilted photovoltaic array: framed dark-blue panels on angled rails (instanced)
function makePVArray(cols = 4, rows = 2) {
  const g = new THREE.Group();
  const panelW = 1.0, panelH = 0.66, panelT = 0.04;
  const gap = 0.04;
  const tilt = 0.42;                       // radians
  const railBaseY = 0.05;
  const arrayW = cols * (panelW + gap) - gap;
  const arrayDepthFlat = rows * (panelH + gap) - gap;

  // mounting rails (angled) — front low, back high
  const backY = railBaseY + Math.sin(tilt) * arrayDepthFlat;
  const railGeoLen = arrayDepthFlat / Math.cos(tilt) + 0.1;
  const railGeo = bevelBox(0.04, 0.06, railGeoLen, 0.008);
  for (let c = 0; c <= cols; c++) {
    const rx = -arrayW / 2 + c * (panelW + gap) - gap / 2 + (c === 0 ? gap / 2 : 0);
    const railX = -arrayW / 2 + c * (panelW + gap);
    // rail spans along tilt in the Z direction, centered
    const midY = railBaseY + Math.sin(tilt) * arrayDepthFlat / 2 + 0.03;
    put(g, railGeo, PV_FRAME, railX, midY, 0, -tilt, 0, 0);
  }
  // vertical posts front + back for the whole array
  for (const [pz, py] of [[-arrayDepthFlat / 2 * Math.cos(tilt), railBaseY],
                          [arrayDepthFlat / 2 * Math.cos(tilt), backY]]) {
    for (let c = 0; c <= cols; c += cols) {
      const railX = -arrayW / 2 + c * (panelW + gap);
      put(g, bevelBox(0.04, py + 0.02, 0.04, 0.008), HVAC_DARK,
          railX, (py + 0.02) / 2, pz);
    }
  }

  // instanced panels (glass) + instanced frames
  const total = cols * rows;
  const glassGeo = new THREE.BoxGeometry(panelW, panelT, panelH);
  const frameGeo = bevelBox(panelW + 0.03, panelT * 0.8, panelH + 0.03, 0.006);
  const glass = new THREE.InstancedMesh(glassGeo, PV_GLASS, total);
  const frames = new THREE.InstancedMesh(frameGeo, PV_FRAME, total);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, 0));
  const scl = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = -arrayW / 2 + c * (panelW + gap) + panelW / 2;
      // position along the tilted plane
      const flatZ = -arrayDepthFlat / 2 + r * (panelH + gap) + panelH / 2;
      const py = railBaseY + 0.06 + (flatZ + arrayDepthFlat / 2) * Math.sin(tilt);
      const pz = flatZ * Math.cos(tilt);
      pos.set(cx, py + 0.03, pz);
      m4.compose(pos, q, scl);
      frames.setMatrixAt(idx, m4);
      pos.set(cx, py + 0.045, pz);
      m4.compose(pos, q, scl);
      glass.setMatrixAt(idx, m4);
      idx++;
    }
  }
  glass.instanceMatrix.needsUpdate = true;
  frames.instanceMatrix.needsUpdate = true;
  for (const m of [glass, frames]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(frames, glass);
  shadows(g);
  return g;
}

// safety handrail: posts + horizontal tube rails, along a straight run in X
function makeHandrail(len = 4.0, height = 1.1) {
  const g = new THREE.Group();
  const postCount = Math.max(2, Math.round(len / 1.2) + 1);
  const postGeo = new THREE.CylinderGeometry(0.022, 0.026, height, 12);
  const baseGeo = bevelBox(0.12, 0.02, 0.12, 0.006);
  const xs = [];
  for (let i = 0; i < postCount; i++) {
    const x = -len / 2 + (i / (postCount - 1)) * len;
    xs.push(x);
    put(g, postGeo, RAIL_MET, x, height / 2, 0);
    put(g, baseGeo, HVAC_DARK, x, 0.01, 0);
  }
  // horizontal rails at two heights (top + mid) as continuous tubes
  for (const ry of [height, height * 0.55]) {
    put(g, tube([[xs[0], ry, 0], [xs[xs.length - 1], ry, 0]], 0.02, 10),
        RAIL_MET);
  }
  // toe/kick rail low
  put(g, tube([[xs[0], 0.12, 0], [xs[xs.length - 1], 0.12, 0]], 0.016, 8),
      RAIL_MET);
  shadows(g);
  return g;
}

// parapet coping cap strip (drip-edge profile) running along X
function makeCoping(len = 10, thick = 0.3) {
  const g = new THREE.Group();
  const capH = 0.09;
  // low parapet wall
  put(g, bevelBox(len, 0.5, thick, 0.01), P.concrete, 0, 0.25, 0);
  // metal coping cap, slightly wider with a small overhang each side
  put(g, bevelBox(len, capH, thick + 0.08, 0.02), COPING_MET, 0, 0.5 + capH / 2, 0);
  // subtle centre ridge on the cap
  put(g, bevelBox(len, 0.02, 0.04, 0.008), RAIL_MET, 0, 0.5 + capH + 0.005, 0);
  shadows(g);
  return g;
}

// ===========================================================================
// createRooftopCluster — a believable equipment roof within the footprint.
// ===========================================================================
export function createRooftopCluster(width = 10, depth = 6) {
  const g = new THREE.Group();
  g.name = 'RooftopCluster';
  const W = width, D = depth;

  // --- parapet coping along the front (+? use -Z as "front" edge) ---------
  const coping = makeCoping(W, 0.3);
  coping.position.set(0, 0, -D / 2 + 0.15);
  g.add(coping);
  // side coping strips (short returns) rotated
  for (const sx of [-1, 1]) {
    const side = makeCoping(D, 0.3);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx * (W / 2 - 0.15), 0, 0);
    g.add(side);
  }

  // --- HVAC units (2-3) ---------------------------------------------------
  const h1 = createHVAC(1.4, 0.9, 1.1);
  h1.position.set(-W / 2 + 1.2, 0, D / 2 - 1.1);
  g.add(h1);

  const h2 = createHVAC(1.2, 1.0, 1.0);
  h2.position.set(-W / 2 + 3.0, 0, D / 2 - 1.0);
  h2.rotation.y = Math.PI;
  g.add(h2);

  const h3 = createHVAC(1.0, 0.7, 0.9);
  h3.position.set(-W / 2 + 1.4, 0, D / 2 - 2.6);
  h3.rotation.y = 0.4;
  g.add(h3);

  // --- ductwork run linking the HVAC units --------------------------------
  const duct = makeDuctRun(3.6);
  duct.position.set(-W / 2 + 3.0, 0, D / 2 - 2.4);
  duct.rotation.y = Math.PI / 2;
  g.add(duct);

  // --- roof-access bulkhead (back corner) ---------------------------------
  const bulk = makeBulkhead(1.6, 2.2, 1.3);
  bulk.position.set(W / 2 - 1.3, 0, -D / 2 + 1.1);
  bulk.rotation.y = Math.PI;               // door faces into the roof
  g.add(bulk);

  // --- vent cowls / stacks -------------------------------------------------
  const c1 = makeVentCowl(0.11, 0.75);
  c1.position.set(0.4, 0, -D / 2 + 1.0);
  g.add(c1);
  const c2 = makeVentCowl(0.09, 0.55);
  c2.position.set(1.3, 0, -D / 2 + 0.9);
  g.add(c2);

  // --- photovoltaic array (centre / right, sunny side) --------------------
  const pv = makePVArray(4, 2);
  pv.position.set(W / 2 - 3.4, 0, D / 2 - 2.0);
  g.add(pv);
  const pv2 = makePVArray(3, 2);
  pv2.position.set(W / 2 - 3.4, 0, D / 2 - 4.2);
  g.add(pv2);

  // --- safety handrail along the front parapet edge -----------------------
  const rail = makeHandrail(W * 0.5, 1.1);
  rail.position.set(-W / 4 + 0.5, 0, -D / 2 + 0.55);
  g.add(rail);

  shadows(g);
  return g;
}

export default { createHVAC, createRooftopCluster };

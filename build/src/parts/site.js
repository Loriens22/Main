// ---------------------------------------------------------------------------
// parts/site.js — Trees & site furniture for the courtyard / boulevard.
// Realistic deciduous & potted trees, a designer slat bench, a bollard light.
// All units METRES, +Y up. Ground parts: base on y=0, centred at origin.
// ---------------------------------------------------------------------------
import {
  THREE, RoundedBoxGeometry, mergeGeometries, bevelBox, lathe, tube,
  mat, palette, shadows, optimize
} from './kit.js';

// --- small deterministic PRNG so a given tree looks the same each build -----
function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// --- a noised low-poly "leaf clump" blob (faceted icosphere) ----------------
function blobGeo(radius = 0.5, detail = 1, noise = 0.28, rand = Math.random) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  // per-geometry random phase so reused blobs differ
  const px = rand() * 6.28, py = rand() * 6.28, pz = rand() * 6.28;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + Math.sin(v.x * 3.3 + px) * 0.5 * noise
      + Math.cos(v.y * 2.7 + py) * 0.5 * noise
      + Math.sin(v.z * 3.9 + pz) * 0.5 * noise;
    v.multiplyScalar(n);
    // squash slightly toward flat-bottomed clump
    if (v.y < 0) v.y *= 0.8;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// --- tapered, bent trunk/branch from a polyline path + per-node radii --------
function taperedLimb(path, radii, radialSeg = 9) {
  const geos = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) continue;
    const cyl = new THREE.CylinderGeometry(radii[i + 1], radii[i], len, radialSeg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    cyl.applyMatrix4(m);
    geos.push(cyl);
  }
  return mergeGeometries(geos);
}

// --- build an InstancedMesh of leaf clumps with per-clump green variation ----
function makeCanopy(clumps, material, rand) {
  const geo = blobGeo(1.0, 1, 0.3, rand); // unit blob, scaled per instance
  const inst = new THREE.InstancedMesh(geo, material, clumps.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const e = new THREE.Euler();
  for (let i = 0; i < clumps.length; i++) {
    const c = clumps[i];
    e.set(rand() * 3.14, rand() * 6.28, rand() * 3.14);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(c.x, c.y, c.z), q,
      new THREE.Vector3(c.sx, c.sy, c.sz));
    inst.setMatrixAt(i, m);
    // green variation: hue 95-118, varied lightness/sat
    const h = (95 + rand() * 26) / 360;
    const s = 0.32 + rand() * 0.24;
    const l = 0.24 + rand() * 0.16 + (c.hi || 0) * 0.06; // sun-lit tops lighter
    col.setHSL(h, s, l);
    inst.setColorAt(i, col);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true; inst.receiveShadow = true;
  return inst;
}

// ============================================================================
// createTree — realistic deciduous tree. kind: 0 broad, 1 columnar, 2 low-wide
// ============================================================================
export function createTree(height = 6, kind = 0) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng((kind + 1) * 137 + Math.round(height * 10));

  const cfg = ({
    0: { crownW: 0.60, crownH: 0.52, cy: 0.72, branchN: 5, up: 0.5, nClump: 11, r0: 0.055 },
    1: { crownW: 0.34, crownH: 0.72, cy: 0.66, branchN: 4, up: 0.9, nClump: 11, r0: 0.045 },
    2: { crownW: 0.78, crownH: 0.34, cy: 0.62, branchN: 6, up: 0.28, nClump: 13, r0: 0.06 },
  })[kind] || null;
  const c = cfg || { crownW: 0.6, crownH: 0.52, cy: 0.72, branchN: 5, up: 0.5, nClump: 11, r0: 0.055 };

  const trunkH = height * (kind === 1 ? 0.42 : kind === 2 ? 0.34 : 0.40);
  const baseR = height * c.r0;
  const topR = baseR * 0.30;

  // --- trunk: slightly bent, tapered, multi-segment -------------------------
  const nSeg = 6;
  const bendDir = new THREE.Vector2(rand() - 0.5, rand() - 0.5).normalize();
  const bend = trunkH * 0.06;
  const tpath = [], tradii = [];
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    const sway = Math.sin(t * Math.PI * 0.9) * bend;
    tpath.push(new THREE.Vector3(bendDir.x * sway, t * trunkH, bendDir.y * sway));
    tradii.push(THREE.MathUtils.lerp(baseR, topR, Math.pow(t, 0.8)));
  }
  // slight root flare
  tradii[0] = baseR * 1.35;
  const trunkMesh = new THREE.Mesh(taperedLimb(tpath, tradii, 10), P.woodDark);
  g.add(trunkMesh);

  const trunkTop = tpath[nSeg].clone();

  // --- branches: flare from upper trunk up/outward, ending in the crown -----
  const crownCX = trunkTop.x, crownCZ = trunkTop.z;
  const crownCY = height * c.cy;
  const crownRX = height * c.crownW;
  const crownRY = height * c.crownH;
  const clumps = [];
  const branchGeos = [];

  for (let b = 0; b < c.branchN; b++) {
    const ang = (b / c.branchN) * Math.PI * 2 + rand() * 0.6;
    const startT = 0.55 + rand() * 0.4;         // where on trunk it forks
    const si = Math.min(nSeg, Math.round(startT * nSeg));
    const start = tpath[si].clone();
    const startR = tradii[si] * 0.85;
    const reach = crownRX * (0.7 + rand() * 0.4);
    const rise = crownRY * (0.4 + c.up * 0.8) + rand() * 0.3;
    const end = new THREE.Vector3(
      start.x + Math.cos(ang) * reach,
      start.y + rise,
      start.z + Math.sin(ang) * reach);
    // curved 3-point path (elbow) flaring upward
    const mid = new THREE.Vector3(
      start.x + Math.cos(ang) * reach * 0.5,
      start.y + rise * 0.65,
      start.z + Math.sin(ang) * reach * 0.5);
    mid.y += rise * 0.12;
    const bpath = [start, mid, end];
    const bradii = [startR, startR * 0.55, startR * 0.22];
    branchGeos.push(taperedLimb(bpath, bradii, 7));

    // clumps clustered at the branch end
    const nEnd = 2;
    for (let k = 0; k < nEnd; k++) {
      const rad = crownRX * (0.28 + rand() * 0.14);
      clumps.push({
        x: end.x + (rand() - 0.5) * rad * 1.1,
        y: end.y + (rand() - 0.4) * rad * 0.8,
        z: end.z + (rand() - 0.5) * rad * 1.1,
        sx: rad, sy: rad * (0.8 + rand() * 0.3), sz: rad,
        hi: (end.y - crownCY) / crownRY > 0 ? 1 : 0
      });
    }
  }
  if (branchGeos.length) g.add(new THREE.Mesh(mergeGeometries(branchGeos), P.woodDark));

  // a few central crown clumps to fill the interior (fuller crown)
  const nCentre = Math.max(0, c.nClump - clumps.length);
  for (let i = 0; i < nCentre; i++) {
    const a = rand() * Math.PI * 2;
    const rr = rand() * crownRX * 0.6;
    const yy = crownCY + (rand() - 0.35) * crownRY * 0.9;
    const rad = crownRX * (0.3 + rand() * 0.16);
    clumps.push({
      x: crownCX + Math.cos(a) * rr,
      y: yy,
      z: crownCZ + Math.sin(a) * rr,
      sx: rad, sy: rad * (0.75 + rand() * 0.3), sz: rad,
      hi: (yy - crownCY) / crownRY > 0 ? 1 : 0
    });
  }

  const leafMat = mat(0xffffff, { roughness: 0.85, envMapIntensity: 0.35, flatShading: true });
  g.add(makeCanopy(clumps, leafMat, rand));

  shadows(g);
  return g;
}

// ============================================================================
// createPlanterTree — potted ornamental / olive in a modern tapered planter
// ============================================================================
export function createPlanterTree(height = 2.4) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng(777);

  // planter: modern tapered pot (narrower at base), via lathe profile ---------
  const potH = Math.min(0.6, height * 0.28);
  const topR = height * 0.24;
  const botR = topR * 0.82;
  const rim = topR * 1.04;
  const profile = [
    [0, 0], [botR, 0], [botR, 0.012], [rim, 0.012],
    [topR, potH * 0.14], [rim, potH - 0.03], [rim, potH],
    [rim - 0.03, potH], [rim - 0.03, potH * 0.14],
    [topR - 0.03, 0.05], [0, 0.05]
  ];
  const potMat = mat(0x8f8f88, { roughness: 0.65, metalness: 0.1, envMapIntensity: 0.7 });
  const pot = new THREE.Mesh(lathe(profile, 40), potMat);
  g.add(pot);

  // soil disc
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(rim - 0.05, rim - 0.05, 0.04, 32), P.soil);
  soil.position.y = potH - 0.05;
  g.add(soil);

  // short olive-style trunk (a little gnarled) + a couple of forks -----------
  const trunkH = height - potH;
  const baseY = potH - 0.04;
  const nSeg = 5;
  const tpath = [], tradii = [];
  const bendDir = new THREE.Vector2(rand() - 0.5, rand() - 0.5).normalize();
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    const sway = Math.sin(t * Math.PI) * trunkH * 0.10;
    tpath.push(new THREE.Vector3(bendDir.x * sway, baseY + t * trunkH * 0.55, bendDir.y * sway));
    tradii.push(THREE.MathUtils.lerp(0.055, 0.022, t));
  }
  g.add(new THREE.Mesh(taperedLimb(tpath, tradii, 9), P.wood));

  const forkStart = tpath[nSeg].clone();
  const clumps = [];
  const branchGeos = [];
  const nFork = 4;
  const crownCY = baseY + trunkH * 0.82;
  const crownR = height * 0.26;
  for (let b = 0; b < nFork; b++) {
    const ang = (b / nFork) * Math.PI * 2 + rand();
    const reach = crownR * (0.55 + rand() * 0.4);
    const end = new THREE.Vector3(
      forkStart.x + Math.cos(ang) * reach,
      crownCY + rand() * trunkH * 0.18,
      forkStart.z + Math.sin(ang) * reach);
    branchGeos.push(taperedLimb([forkStart, end], [0.022, 0.01], 6));
    const nb = 2;
    for (let k = 0; k < nb; k++) {
      const rad = crownR * (0.30 + rand() * 0.14);
      clumps.push({
        x: end.x + (rand() - 0.5) * rad,
        y: end.y + (rand() - 0.3) * rad * 0.7,
        z: end.z + (rand() - 0.5) * rad,
        sx: rad, sy: rad * (0.7 + rand() * 0.25), sz: rad, hi: rand()
      });
    }
  }
  if (branchGeos.length) g.add(new THREE.Mesh(mergeGeometries(branchGeos), P.wood));

  // silvery olive foliage (cooler, lighter greens)
  const oliveMat = mat(0xffffff, { roughness: 0.9, envMapIntensity: 0.4, flatShading: true });
  const geo = blobGeo(1.0, 1, 0.32, rand);
  const inst = new THREE.InstancedMesh(geo, oliveMat, clumps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), e = new THREE.Euler();
  for (let i = 0; i < clumps.length; i++) {
    const cl = clumps[i];
    e.set(rand() * 3.14, rand() * 6.28, rand() * 3.14); q.setFromEuler(e);
    m.compose(new THREE.Vector3(cl.x, cl.y, cl.z), q, new THREE.Vector3(cl.sx, cl.sy, cl.sz));
    inst.setMatrixAt(i, m);
    col.setHSL((78 + rand() * 22) / 360, 0.18 + rand() * 0.15, 0.34 + rand() * 0.16);
    inst.setColorAt(i, col);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  g.add(inst);

  shadows(g);
  return g;
}

// ============================================================================
// createBench — designer timber-slat bench on a slim dark-metal frame
// ============================================================================
export function createBench(length = 2.0) {
  const g = new THREE.Group();
  const P = palette();

  const depth = 0.52;          // seat depth (Z)
  const seatY = 0.44;
  const slatT = 0.028;         // slat thickness
  const slatGap = 0.012;
  const legInset = 0.16;

  // --- seat slats (run lengthwise along X) ----------------------------------
  const nSeat = 6;
  const spanZ = depth;
  const slatW = (spanZ - (nSeat - 1) * slatGap) / nSeat;
  const seatLen = length - 0.04;
  const seatGrp = new THREE.Group();
  for (let i = 0; i < nSeat; i++) {
    const z = -spanZ / 2 + slatW / 2 + i * (slatW + slatGap);
    const s = new THREE.Mesh(bevelBox(seatLen, slatT, slatW, 0.006), P.wood);
    s.position.set(0, seatY, z);
    seatGrp.add(s);
  }
  g.add(seatGrp);

  // --- back slats (angled), 4 slats ----------------------------------------
  const nBack = 4;
  const backTilt = -0.16;           // lean back
  const backBaseY = seatY + 0.02;
  const backH = 0.42;
  const backZ = -depth / 2 + 0.02;
  for (let i = 0; i < nBack; i++) {
    const frac = i / (nBack - 1);
    const y = backBaseY + 0.05 + frac * backH;
    const z = backZ + Math.sin(backTilt) * (frac * backH) - frac * 0.06;
    const s = new THREE.Mesh(bevelBox(seatLen, slatW, slatT, 0.006), P.wood);
    s.rotation.x = backTilt;
    s.position.set(0, y, z);
    g.add(s);
  }

  // --- dark-metal frame: two end U-legs + connecting rails -------------------
  const legMat = P.darkMetal;
  const legT = 0.045;
  const legPositions = [-(length / 2 - legInset), (length / 2 - legInset)];
  for (const lx of legPositions) {
    const frame = new THREE.Group();
    // front & back vertical legs
    for (const lz of [-depth / 2 + 0.06, depth / 2 - 0.06]) {
      const leg = new THREE.Mesh(bevelBox(legT, seatY, legT, 0.01), legMat);
      leg.position.set(lx, seatY / 2, lz);
      frame.add(leg);
    }
    // foot bar joining front-back at floor
    const foot = new THREE.Mesh(bevelBox(legT, legT, depth - 0.1, 0.01), legMat);
    foot.position.set(lx, legT / 2, 0);
    frame.add(foot);
    // top cross bar under seat
    const top = new THREE.Mesh(bevelBox(legT, legT, depth - 0.14, 0.01), legMat);
    top.position.set(lx, seatY - legT / 2, 0);
    frame.add(top);
    g.add(frame);
  }
  // two long stretcher rails tying the ends together (front & back, under seat)
  for (const lz of [-depth / 2 + 0.08, depth / 2 - 0.08]) {
    const rail = new THREE.Mesh(
      bevelBox(length - 2 * legInset + legT, 0.035, 0.035, 0.008), legMat);
    rail.position.set(0, seatY - 0.05, lz);
    g.add(rail);
  }

  shadows(g);
  return g;
}

// ============================================================================
// createBollardLight — slim path bollard with a glowing emissive lens
// ============================================================================
export function createBollardLight(height = 0.9) {
  const g = new THREE.Group();
  const P = palette();

  const postR = 0.045;
  const bodyH = height - 0.10;

  // base plate
  const base = new THREE.Mesh(
    lathe([[0, 0], [postR * 2.2, 0], [postR * 2.2, 0.012],
           [postR * 1.5, 0.02], [postR * 1.5, 0.03], [postR, 0.05], [0, 0.05]], 32),
    P.darkMetal);
  g.add(base);

  // slim tapered post
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(postR * 0.92, postR, bodyH, 28, 1), P.darkMetal);
  post.position.y = 0.04 + bodyH / 2;
  g.add(post);

  // glowing lens band near the top (emissive, warm)
  const lensY = 0.04 + bodyH - 0.02;
  const lensMat = mat(0xfff0cf, {
    roughness: 0.25, metalness: 0.0,
    emissive: 0xffd98a, emissiveIntensity: 2.4, envMapIntensity: 0.4
  });
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(postR * 1.02, postR * 1.02, 0.075, 28, 1, true), lensMat);
  lens.position.y = lensY;
  g.add(lens);

  // dark cap over the lens (light shines down/around, top is capped)
  const cap = new THREE.Mesh(
    lathe([[0, 0], [postR * 1.12, 0], [postR * 1.12, 0.02],
           [postR * 0.6, 0.055], [0, 0.06]], 28), P.charcoal);
  cap.position.y = lensY + 0.0375;
  g.add(cap);

  // a soft actual light so it reads as emitting at night/shadow
  const pl = new THREE.PointLight(0xffd98a, 0.6, 3.0, 2.0);
  pl.position.y = lensY;
  g.add(pl);

  shadows(g);
  return g;
}

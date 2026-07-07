// ---------------------------------------------------------------------------
// parts/garden.js — Courtyard landscape detail for the luxury complex.
// Flower beds, ornamental grasses, a modern water feature, a children's play
// area, a path light and an abstract sculpture. Genuinely 3D, no billboards.
// All units METRES, +Y up. GROUND parts: footprint centred at origin, base y=0.
// ---------------------------------------------------------------------------
import {
  THREE, RoundedBoxGeometry, mergeGeometries, bevelBox, extrudeProfile,
  lathe, tube, catenary, mat, palette, shadows, optimize
} from './kit.js';

// --- small deterministic PRNG so a given part looks the same each build ------
function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// --- a noised low-poly leaf-clump blob (faceted icosphere) — house style -----
function blobGeo(radius = 0.5, detail = 1, noise = 0.28, rand = Math.random) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const px = rand() * 6.28, py = rand() * 6.28, pz = rand() * 6.28;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + Math.sin(v.x * 3.3 + px) * 0.5 * noise
      + Math.cos(v.y * 2.7 + py) * 0.5 * noise
      + Math.sin(v.z * 3.9 + pz) * 0.5 * noise;
    v.multiplyScalar(n);
    if (v.y < 0) v.y *= 0.7;                 // flatter underside
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// --- an arching, tapered grass/leaf blade ribbon (bends in +X, up in +Y) -----
// Returns a BufferGeometry centred on its base (0,0,0), tip up & forward.
function bladeGeo(length = 0.9, width = 0.03, bend = 0.35, segs = 6) {
  const rings = segs + 1;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < rings; i++) {
    const t = i / segs;
    // mostly vertical spine that arches forward as it rises
    const y = length * Math.sin(t * Math.PI * 0.5) * (1 - 0.12 * t);
    const x = bend * t * t;
    const w = width * Math.sqrt(Math.max(0, 1 - t)) * 0.5;   // taper to a point
    // blade faces roughly ±Z; edge offset along Z
    pos.push(x, y, -w, x, y, w);
    nor.push(0, 0, -1, 0, 0, -1);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- flower head: a small "mum/pompom" dome (squashed, noised icosphere) -----
function bloomGeo(radius = 0.05, rand = Math.random) {
  const g = blobGeo(radius, 1, 0.22, rand);
  g.scale(1, 0.72, 1);         // dome-ish
  g.translate(0, radius * 0.35, 0);
  return g;
}

// helper: build an InstancedMesh from a placement list [{m:Matrix4, c:Color}] --
function instanced(geo, material, placements) {
  const inst = new THREE.InstancedMesh(geo, material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    inst.setMatrixAt(i, placements[i].m);
    if (placements[i].c) inst.setColorAt(i, placements[i].c);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true; inst.receiveShadow = true;
  return inst;
}

// pleasing flower hues (H in 0..1, plus sat/light ranges)
const FLOWER_HUES = [0.005, 0.03, 0.09, 0.14, 0.86, 0.92, 0.78, 0.72, 0.55];

// ============================================================================
// createFlowerBed — raised soil bed packed with colourful planting + shrubs
// ============================================================================
export function createFlowerBed(width = 3, depth = 1.5) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng(Math.round(width * 31 + depth * 17) + 3);

  const wallH = 0.22;                      // raised edge height
  const wallT = 0.09;                      // edge thickness
  const hw = width / 2, hd = depth / 2;

  // --- tidy stone edging (a mitred low wall around the perimeter) ------------
  const edgeMat = mat(0xbdb6a6, { roughness: 0.85, envMapIntensity: 0.5 });
  const capMat  = mat(0xd7d1c4, { roughness: 0.7, envMapIntensity: 0.6 });
  const edges = new THREE.Group();
  const mkWall = (w, d, x, z) => {
    const wall = new THREE.Mesh(bevelBox(w, wallH, d, 0.012), edgeMat);
    wall.position.set(x, wallH / 2, z);
    edges.add(wall);
    const cap = new THREE.Mesh(bevelBox(w + 0.02, 0.03, d + 0.02, 0.008), capMat);
    cap.position.set(x, wallH + 0.014, z);
    edges.add(cap);
  };
  mkWall(width, wallT, 0, -hd + wallT / 2);
  mkWall(width, wallT, 0,  hd - wallT / 2);
  mkWall(wallT, depth - 2 * wallT, -hw + wallT / 2, 0);
  mkWall(wallT, depth - 2 * wallT,  hw - wallT / 2, 0);
  g.add(edges);

  // --- soil, mounded slightly, sitting just below the cap --------------------
  const soilTop = wallH - 0.03;
  const innerW = width - 2 * wallT, innerD = depth - 2 * wallT;
  const soilGeo = new THREE.BoxGeometry(innerW, 0.12, innerD, 12, 1, 8);
  const sp = soilGeo.attributes.position;
  const vv = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    vv.fromBufferAttribute(sp, i);
    if (vv.y > 0) {   // mound the top surface
      const m = Math.cos(vv.x / innerW * Math.PI) * Math.cos(vv.z / innerD * Math.PI);
      vv.y += Math.max(0, m) * 0.03;
    }
    sp.setXYZ(i, vv.x, vv.y, vv.z);
  }
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, P.soil);
  soil.position.y = soilTop - 0.06;
  g.add(soil);

  // helper: is (x,z) inside the plantable inner rectangle (with margin)?
  const mX = innerW / 2 - 0.05, mZ = innerD / 2 - 0.05;

  // --- leafy green base: mounds of foliage filling the bed -------------------
  const foliageMat = mat(0xffffff, { roughness: 0.85, envMapIntensity: 0.35, flatShading: true });
  const foliageGeo = blobGeo(1.0, 1, 0.34, rand);
  const foPlace = [];
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const nFol = Math.round(innerW * innerD * 26) + 12;
  for (let i = 0; i < nFol; i++) {
    const x = (rand() * 2 - 1) * mX, z = (rand() * 2 - 1) * mZ;
    const r = 0.10 + rand() * 0.09;
    e.set((rand() - 0.5) * 0.4, rand() * 6.28, (rand() - 0.5) * 0.4);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, soilTop + r * 0.45, z), q,
      new THREE.Vector3(r, r * (0.72 + rand() * 0.2), r));
    col.setHSL((0.24 + rand() * 0.08), 0.4 + rand() * 0.2, 0.22 + rand() * 0.12);
    foPlace.push({ m: m4.clone(), c: col.clone() });
  }
  g.add(instanced(foliageGeo, foliageMat, foPlace));

  // --- a few small shrubs (bigger, darker mounds) at the corners -------------
  const shrubGeo = blobGeo(1.0, 1, 0.3, rand);
  const shPlace = [];
  const corners = [[-mX * 0.8, -mZ * 0.6], [mX * 0.8, mZ * 0.55], [mX * 0.1, -mZ * 0.7]];
  for (const [cx, cz] of corners) {
    const r = 0.17 + rand() * 0.06;
    e.set(0, rand() * 6.28, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(cx, soilTop + r * 0.55, cz), q,
      new THREE.Vector3(r, r * 0.9, r));
    col.setHSL(0.28, 0.42, 0.2 + rand() * 0.05);
    shPlace.push({ m: m4.clone(), c: col.clone() });
  }
  g.add(instanced(shrubGeo, shrubGeo === foliageGeo ? foliageMat : foliageMat, shPlace));

  // --- flower stems (thin, green) + blooms (bright, colour-varied) -----------
  const stemMat = mat(0x4a7a30, { roughness: 0.7, envMapIntensity: 0.3 });
  const stemGeo = new THREE.CylinderGeometry(0.006, 0.009, 1, 5, 1);
  stemGeo.translate(0, 0.5, 0);            // base at origin
  const bloomMat = mat(0xffffff, { roughness: 0.6, envMapIntensity: 0.5, flatShading: true });
  const bGeo = bloomGeo(0.052, rand);

  const stemPlace = [], bloomPlace = [];
  const nFlower = Math.round(innerW * innerD * 42) + 20;
  for (let i = 0; i < nFlower; i++) {
    const x = (rand() * 2 - 1) * mX, z = (rand() * 2 - 1) * mZ;
    const h = 0.14 + rand() * 0.16;
    const lean = (rand() - 0.5) * 0.22;
    const la = rand() * 6.28;
    e.set(Math.cos(la) * lean, 0, Math.sin(la) * lean);
    q.setFromEuler(e);
    const base = new THREE.Vector3(x, soilTop - 0.01, z);
    m4.compose(base, q, new THREE.Vector3(1, h, 1));
    stemPlace.push({ m: m4.clone() });
    // bloom at stem tip
    const tip = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(base);
    const bs = 0.7 + rand() * 0.7;
    e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28); q.setFromEuler(e);
    m4.compose(tip, q, new THREE.Vector3(bs, bs, bs));
    const hue = FLOWER_HUES[(rand() * FLOWER_HUES.length) | 0] + (rand() - 0.5) * 0.03;
    const white = rand() < 0.14;
    col.setHSL((hue + 1) % 1, white ? 0.08 : 0.72 + rand() * 0.22,
      white ? 0.86 : 0.5 + rand() * 0.14);
    bloomPlace.push({ m: m4.clone(), c: col.clone() });
  }
  g.add(instanced(stemGeo, stemMat, stemPlace));
  g.add(instanced(bGeo, bloomMat, bloomPlace));

  shadows(g);
  return optimize(g);
}

// ============================================================================
// createOrnamentalGrass — an airy clump/drift of tall arching grasses
// ============================================================================
export function createOrnamentalGrass(radius = 1.2) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng(Math.round(radius * 71) + 5);

  // low soil/mulch mound so blades don't float on bare ground
  const moundGeo = new THREE.SphereGeometry(radius * 1.02, 20, 8,
    0, Math.PI * 2, 0, Math.PI * 0.5);
  moundGeo.scale(1, 0.10 / (radius * 1.02) * radius, 1); // ~0.10 high dome
  const mound = new THREE.Mesh(moundGeo, mat(0x2e2318, { roughness: 1.0 }));
  g.add(mound);

  const bladeMat = mat(0xffffff, {
    roughness: 0.7, envMapIntensity: 0.35, side: THREE.DoubleSide, flatShading: false
  });
  const geo = bladeGeo(1.0, 0.028, 0.42, 6);

  const place = [];
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const nBlade = Math.round(radius * radius * 210) + 60;
  for (let i = 0; i < nBlade; i++) {
    // denser toward centre (sqrt for area-uniform, then bias inward)
    const rr = Math.pow(rand(), 0.7) * radius;
    const a = rand() * 6.28;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const yaw = rand() * 6.28;
    const tilt = (rand() - 0.5) * 0.25;
    const len = (0.75 + rand() * 0.6) * (1 - rr / radius * 0.28); // taller in middle
    e.set(tilt, yaw, (rand() - 0.5) * 0.2);
    q.setFromEuler(e);
    const groundY = Math.max(0, (1 - (rr / radius) * (rr / radius)) * 0.10 - 0.005);
    m4.compose(new THREE.Vector3(x, groundY, z), q,
      new THREE.Vector3(1, len, 0.9 + rand() * 0.3));
    // warm-green to straw: hue 0.14 (straw) .. 0.26 (green)
    const straw = rand();
    col.setHSL(0.14 + straw * 0.12, 0.32 + rand() * 0.28,
      0.34 + rand() * 0.2 + straw * 0.1);
    place.push({ m: m4.clone(), c: col.clone() });
  }
  g.add(instanced(geo, bladeMat, place));

  // a scatter of pale seed-head plumes rising above the clump for airiness
  const plumeMat = mat(0xffffff, { roughness: 0.9, envMapIntensity: 0.3, flatShading: true });
  const plumeGeo = blobGeo(1.0, 1, 0.45, rand);
  plumeGeo.scale(0.5, 1.0, 0.5);
  const plPlace = [];
  const nPlume = Math.round(radius * radius * 22) + 8;
  for (let i = 0; i < nPlume; i++) {
    const rr = Math.pow(rand(), 0.6) * radius * 0.9;
    const a = rand() * 6.28;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = 0.9 + rand() * 0.5;
    e.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, h, z), q,
      new THREE.Vector3(0.05, 0.16 + rand() * 0.08, 0.05));
    col.setHSL(0.12 + rand() * 0.05, 0.25, 0.72 + rand() * 0.16); // pale straw
    plPlace.push({ m: m4.clone(), c: col.clone() });
  }
  g.add(instanced(plumeGeo, plumeMat, plPlace));

  shadows(g);
  return optimize(g);
}

// ============================================================================
// createWaterFeature — modern reflecting pool with a spill weir + pavers
// ============================================================================
export function createWaterFeature(size = 3) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng(Math.round(size * 53) + 7);

  const half = size / 2;
  const wallH = 0.34, wallT = 0.14;
  const stone = mat(0xb9b4a8, { roughness: 0.8, metalness: 0.05, envMapIntensity: 0.6 });
  const capMat = mat(0xd6d0c2, { roughness: 0.6, envMapIntensity: 0.7 });
  const darkStone = mat(0x54514b, { roughness: 0.55, metalness: 0.1, envMapIntensity: 0.7 });

  // --- outer basin: four capped walls forming a square rim ------------------
  const mkWall = (w, d, x, z) => {
    const wall = new THREE.Mesh(bevelBox(w, wallH, d, 0.015), stone);
    wall.position.set(x, wallH / 2, z);
    g.add(wall);
    const cap = new THREE.Mesh(bevelBox(w + 0.03, 0.05, d + 0.03, 0.01), capMat);
    cap.position.set(x, wallH + 0.02, z);
    g.add(cap);
  };
  mkWall(size, wallT, 0, -half + wallT / 2);
  mkWall(size, wallT, 0,  half - wallT / 2);
  mkWall(wallT, size - 2 * wallT, -half + wallT / 2, 0);
  mkWall(wallT, size - 2 * wallT,  half - wallT / 2, 0);

  // basin floor (dark) so the water reads as having depth
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(size - 2 * wallT + 0.02, 0.04, size - 2 * wallT + 0.02),
    darkStone);
  floor.position.y = 0.02;
  g.add(floor);

  // --- raised weir monolith along the back edge; water sheets off its face ---
  const weirW = size * 0.62, weirH = 0.62, weirD = 0.28;
  const weirZ = -half + wallT + weirD / 2 + 0.02;
  const weir = new THREE.Mesh(bevelBox(weirW, weirH, weirD, 0.02), darkStone);
  weir.position.set(0, weirH / 2, weirZ);
  g.add(weir);
  const weirCap = new THREE.Mesh(bevelBox(weirW + 0.02, 0.03, weirD + 0.02, 0.008), capMat);
  weirCap.position.set(0, weirH + 0.015, weirZ);
  g.add(weirCap);

  // --- still water plane (low-roughness, reflective) ------------------------
  const waterMat = mat(0x14343d, {
    roughness: 0.045, metalness: 0.55, envMapIntensity: 1.6, side: THREE.FrontSide
  });
  const waterLevel = wallH - 0.09;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size - 2 * wallT - 0.01, size - 2 * wallT - 0.01), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterLevel;
  g.add(water);

  // --- the falling water sheet down the front face of the weir --------------
  const sheetMat = mat(0xcfe6ea, {
    roughness: 0.08, metalness: 0.2, envMapIntensity: 1.3,
    transparent: true, opacity: 0.5, side: THREE.DoubleSide
  });
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(weirW * 0.9, weirH - waterLevel + 0.06), sheetMat);
  sheet.position.set(0, (weirH + waterLevel - 0.06) / 2 + 0.03,
    weirZ + weirD / 2 + 0.006);
  g.add(sheet);
  // a thin lip of water cresting the weir top
  const crest = new THREE.Mesh(
    new THREE.BoxGeometry(weirW * 0.9, 0.02, 0.05), sheetMat);
  crest.position.set(0, weirH + 0.005, weirZ + weirD / 2 - 0.02);
  g.add(crest);

  // --- surrounding pavers (a ring one tile deep at ground level) ------------
  const paverMat = mat(0xa8a397, { roughness: 0.85, envMapIntensity: 0.5 });
  const pv = 0.36, gap = 0.012, band = pv;
  const outerHalf = half + band;
  const perSide = Math.max(3, Math.round(size / (pv + gap)));
  const paverGeos = [];
  const addPaver = (x, z, w, d) => {
    const pg = bevelBox(w, 0.05, d, 0.006);
    pg.translate(x, 0.025, z);
    paverGeos.push(pg);
  };
  for (let i = 0; i < perSide; i++) {
    const t = -half + (i + 0.5) * (size / perSide);
    const w = size / perSide - gap;
    addPaver(t, -half - band / 2, w, band - gap);   // back
    addPaver(t,  half + band / 2, w, band - gap);   // front
    addPaver(-half - band / 2, t, band - gap, w);   // left
    addPaver( half + band / 2, t, band - gap, w);   // right
  }
  // corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    addPaver(sx * (half + band / 2), sz * (half + band / 2), band - gap, band - gap);
  g.add(new THREE.Mesh(mergeGeometries(paverGeos), paverMat));

  // --- a couple of plants: grass tufts at two front corners -----------------
  const tuftMat = mat(0xffffff, { roughness: 0.7, envMapIntensity: 0.35, side: THREE.DoubleSide });
  const tuftGeo = bladeGeo(1.0, 0.026, 0.4, 5);
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const tuftPlace = [];
  const tuftCentres = [[-half - band * 0.4, half + band * 0.4],
                       [ half + band * 0.4, half + band * 0.4]];
  for (const [cx, cz] of tuftCentres) {
    for (let i = 0; i < 42; i++) {
      const rr = Math.pow(rand(), 0.7) * 0.22;
      const a = rand() * 6.28;
      e.set((rand() - 0.5) * 0.2, rand() * 6.28, (rand() - 0.5) * 0.2);
      q.setFromEuler(e);
      const len = 0.28 + rand() * 0.22;
      m4.compose(new THREE.Vector3(cx + Math.cos(a) * rr, 0.02, cz + Math.sin(a) * rr),
        q, new THREE.Vector3(1, len, 1));
      col.setHSL(0.2 + rand() * 0.08, 0.4 + rand() * 0.2, 0.32 + rand() * 0.16);
      tuftPlace.push({ m: m4.clone(), c: col.clone() });
    }
  }
  g.add(instanced(tuftGeo, tuftMat, tuftPlace));

  shadows(g);
  return optimize(g);
}

// ============================================================================
// createPlayground — small children's play area: tower+slide, swings, rider
// ============================================================================
export function createPlayground(size = 5) {
  const g = new THREE.Group();
  const P = palette();
  const rand = rng(Math.round(size * 29) + 11);

  const half = size / 2;
  // bright accent materials
  const red    = mat(0xd23b34, { roughness: 0.5, envMapIntensity: 0.6 });
  const blue   = mat(0x2f74c0, { roughness: 0.5, envMapIntensity: 0.6 });
  const yellow = mat(0xf2c33d, { roughness: 0.55, envMapIntensity: 0.6 });
  const green  = mat(0x3f9d54, { roughness: 0.55, envMapIntensity: 0.6 });
  const slideMat = mat(0x39a0d8, { roughness: 0.3, metalness: 0.15, envMapIntensity: 0.9 });

  // --- safety surface pad: two-tone rubberised mat --------------------------
  const padA = new THREE.Mesh(
    new RoundedBoxGeometry(size, 0.05, size, 3, 0.12),
    mat(0x3d6d55, { roughness: 0.95, envMapIntensity: 0.2 }));
  padA.position.y = 0.025;
  g.add(padA);
  // a wavy contrast inlay
  const inlay = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.3, size * 0.3, 0.052, 32),
    mat(0xc98a3a, { roughness: 0.95, envMapIntensity: 0.2 }));
  inlay.position.set(size * 0.12, 0.026, size * 0.14);
  g.add(inlay);

  const timber = P.wood, timberD = P.woodDark;

  // === climbing tower with roof + slide (back-left quadrant) ================
  const tower = new THREE.Group();
  const tx = -half * 0.42, tz = -half * 0.34;
  const postSq = 0.09, deckY = 1.0, span = 0.92;
  const hs = span / 2;
  const postPos = [[-hs, -hs], [hs, -hs], [-hs, hs], [hs, hs]];
  for (const [px, pz] of postPos) {
    const post = new THREE.Mesh(bevelBox(postSq, deckY + 0.5, postSq, 0.01), timber);
    post.position.set(px, (deckY + 0.5) / 2, pz);
    tower.add(post);
    // post cap
    const capp = new THREE.Mesh(bevelBox(postSq + 0.02, 0.04, postSq + 0.02, 0.01), timberD);
    capp.position.set(px, deckY + 0.5 + 0.02, pz);
    tower.add(capp);
  }
  // deck (platform)
  const deck = new THREE.Mesh(bevelBox(span + postSq, 0.06, span + postSq, 0.01), timberD);
  deck.position.y = deckY;
  tower.add(deck);
  // guard rails on 3 sides (open toward slide, +X)
  const railY = deckY + 0.42;
  const mkRail = (x, z, w, d) => {
    const rail = new THREE.Mesh(bevelBox(w, 0.05, d, 0.01), timber);
    rail.position.set(x, railY, z);
    tower.add(rail);
    // vertical balusters
    const n = Math.max(2, Math.round(Math.max(w, d) / 0.2));
    for (let i = 0; i <= n; i++) {
      const f = i / n - 0.5;
      const b = new THREE.Mesh(bevelBox(0.03, railY - deckY, 0.03, 0.006), timber);
      b.position.set(x + (w > d ? f * w : 0), (deckY + railY) / 2, z + (d >= w ? f * d : 0));
      tower.add(b);
    }
  };
  mkRail(0, -hs, span + postSq, 0.05);            // back
  mkRail(-hs, 0, 0.05, span + postSq);            // left
  mkRail(0, hs, span + postSq, 0.05);             // front

  // pitched roof (two slabs) on short posts above the deck
  const roofBaseY = deckY + 0.5;
  const roofRise = 0.42, roofOverhang = 0.14;
  const rl = span + postSq + roofOverhang * 2;
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(bevelBox(rl, 0.05, hs + roofOverhang + 0.03, 0.008), red);
    const ang = Math.atan2(roofRise, hs + roofOverhang);
    slab.rotation.x = s * ang;
    slab.position.set(0, roofBaseY + roofRise / 2 + 0.04,
      s * (hs + roofOverhang) / 2);
    tower.add(slab);
  }
  // ridge
  const ridge = new THREE.Mesh(bevelBox(rl, 0.05, 0.06, 0.01), timberD);
  ridge.position.set(0, roofBaseY + roofRise + 0.05, 0);
  tower.add(ridge);

  // ladder up the back-left post pair (rungs)
  const ladX = -hs, ladZ0 = -hs, ladZ1 = -hs; // climb on the -X face using back posts
  for (let i = 0; i < 5; i++) {
    const y = 0.16 + i * ((deckY - 0.12) / 5);
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, span, 8), timberD);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(-hs - 0.02, y, 0);
    tower.add(rung);
  }
  // two stringers for the ladder
  for (const pz of [-hs, hs]) {
    const str = new THREE.Mesh(bevelBox(0.04, deckY, 0.04, 0.008), timber);
    str.position.set(-hs - 0.02, deckY / 2, pz);
    tower.add(str);
  }

  // --- the slide: chute + side rails from deck edge (+X) down to ground ------
  const slide = new THREE.Group();
  const run = 1.9, top = deckY - 0.02;
  const slideLen = Math.hypot(run, top);
  const slideAng = Math.atan2(top, run);
  const chuteW = 0.5;
  const chute = new THREE.Mesh(
    new THREE.BoxGeometry(slideLen, 0.05, chuteW), slideMat);
  const bed = new THREE.Group();
  // bed with low side walls
  const bedGrp = new THREE.Group();
  bedGrp.add(chute);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(slideLen, 0.14, 0.04), slideMat);
    wall.position.set(0, 0.09, s * (chuteW / 2 - 0.02));
    bedGrp.add(wall);
  }
  bedGrp.rotation.z = -slideAng;
  // position so the top sits at deck edge
  const midX = hs + Math.cos(slideAng) * slideLen / 2;
  const midY = top / 2 + 0.03;
  bedGrp.position.set(midX, midY, 0);
  slide.add(bedGrp);
  // little flat runout lip at the bottom
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, chuteW), slideMat);
  lip.position.set(hs + run + 0.14, 0.06, 0);
  slide.add(lip);
  tower.add(slide);

  tower.position.set(tx, 0, tz);
  g.add(tower);

  // === swing set (right side) ===============================================
  const swing = new THREE.Group();
  const beamY = 1.85, beamLen = 1.9, legSpread = 0.55;
  const legMat = P.steel;
  // two A-frames at each end of the beam (along Z)
  for (const bz of [-beamLen / 2, beamLen / 2]) {
    for (const s of [-1, 1]) {
      const foot = new THREE.Vector3(s * legSpread, 0, bz);
      const topP = new THREE.Vector3(0, beamY, bz);
      const dir = new THREE.Vector3().subVectors(topP, foot);
      const len = dir.length();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, len, 12), legMat);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      leg.quaternion.copy(q);
      leg.position.copy(foot).add(topP).multiplyScalar(0.5);
      swing.add(leg);
    }
  }
  // top beam (along Z)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, beamLen + 0.1, 12), legMat);
  beam.rotation.x = Math.PI / 2;
  beam.position.set(0, beamY, 0);
  swing.add(beam);
  // two swings hanging from the beam
  const seatMats = [blue, yellow];
  for (let k = 0; k < 2; k++) {
    const sz = (k === 0 ? -1 : 1) * 0.45;
    const seatY = 0.5;
    for (const rz of [sz - 0.16, sz + 0.16]) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, beamY - seatY, 6), P.darkMetal);
      rope.position.set(0, (beamY + seatY) / 2, rz);
      swing.add(rope);
    }
    const seat = new THREE.Mesh(bevelBox(0.42, 0.04, 0.18, 0.01), seatMats[k]);
    seat.position.set(0, seatY, sz);
    swing.add(seat);
  }
  swing.position.set(half * 0.4, 0, 0);
  g.add(swing);

  // === springy rider (front) ================================================
  const rider = new THREE.Group();
  // coil spring: a helix tube
  const helix = [];
  const coils = 3.2, springH = 0.34, springR = 0.07;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * coils * Math.PI * 2;
    helix.push([Math.cos(a) * springR, 0.03 + t * springH, Math.sin(a) * springR]);
  }
  rider.add(new THREE.Mesh(tube(helix, 0.018, 6), P.darkMetal));
  // seat + body
  const bodyY = 0.03 + springH;
  const body = new THREE.Mesh(bevelBox(0.5, 0.14, 0.2, 0.04), yellow);
  body.position.y = bodyY + 0.08;
  rider.add(body);
  // handle
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 8, 16, Math.PI), red);
  handle.rotation.set(Math.PI / 2, 0, 0);
  handle.position.set(0.12, bodyY + 0.2, 0);
  rider.add(handle);
  // animal head (simple rounded block + ears)
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.18, 3, 0.05), red);
  head.position.set(-0.22, bodyY + 0.16, 0);
  rider.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(bevelBox(0.05, 0.09, 0.06, 0.015), red);
    ear.position.set(-0.24, bodyY + 0.29, s * 0.06);
    rider.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), P.charcoal);
  nose.position.set(-0.33, bodyY + 0.15, 0);
  rider.add(nose);
  rider.position.set(half * 0.28, 0, half * 0.42);
  rider.rotation.y = -0.6;
  g.add(rider);

  shadows(g);
  return optimize(g);
}

// ============================================================================
// createPathLight — modern square-section garden light with a glowing lens
// ============================================================================
export function createPathLight(height = 0.9) {
  const g = new THREE.Group();
  const P = palette();

  const postSq = 0.06;
  const bodyH = height - 0.14;

  // base plate
  const base = new THREE.Mesh(bevelBox(0.16, 0.03, 0.16, 0.01), P.darkMetal);
  base.position.y = 0.015;
  g.add(base);
  const base2 = new THREE.Mesh(bevelBox(0.1, 0.04, 0.1, 0.01), P.charcoal);
  base2.position.y = 0.045;
  g.add(base2);

  // slim square tapered post
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(postSq * 0.62, postSq * 0.72, bodyH, 4, 1), P.darkMetal);
  post.rotation.y = Math.PI / 4;
  post.position.y = 0.06 + bodyH / 2;
  g.add(post);

  // head: a charcoal block cantilevered slightly, glowing lens on its underside
  const headY = 0.06 + bodyH;
  const head = new THREE.Mesh(bevelBox(0.14, 0.1, 0.11, 0.012), P.charcoal);
  head.position.set(0.03, headY + 0.03, 0);
  g.add(head);

  // emissive warm lens (frosted panel) facing down/out
  const lensMat = mat(0xfff0cf, {
    roughness: 0.25, metalness: 0.0,
    emissive: 0xffd98a, emissiveIntensity: 2.6, envMapIntensity: 0.4
  });
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.08), lensMat);
  lens.position.set(0.03, headY - 0.005, 0);
  g.add(lens);
  // a thin glowing side slit for a modern look
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.075), lensMat);
  slit.position.set(0.03 + 0.072, headY + 0.03, 0);
  g.add(slit);

  // soft warm light so it reads as emitting
  const pl = new THREE.PointLight(0xffd98a, 0.7, 3.2, 2.0);
  pl.position.set(0.03, headY - 0.06, 0);
  g.add(pl);

  shadows(g);
  return g;
}

// ============================================================================
// createSculpture — abstract twisted-ribbon public art on a stone plinth
// ============================================================================
export function createSculpture(height = 2.2) {
  const g = new THREE.Group();
  const P = palette();

  // --- plinth ---------------------------------------------------------------
  const plinthH = Math.min(0.42, height * 0.2);
  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(0.7, plinthH, 0.7, 4, 0.02),
    mat(0x6f6c66, { roughness: 0.5, metalness: 0.1, envMapIntensity: 0.7 }));
  plinth.position.y = plinthH / 2;
  g.add(plinth);
  // a lighter top slab
  const slab = new THREE.Mesh(bevelBox(0.62, 0.04, 0.62, 0.01),
    mat(0x8b877f, { roughness: 0.4, metalness: 0.15, envMapIntensity: 0.8 }));
  slab.position.y = plinthH + 0.02;
  g.add(slab);

  // --- twisted lofted ribbon ------------------------------------------------
  const ribH = height - plinthH - 0.04;
  const segs = 40, twist = Math.PI * 1.15, baseW = 0.5, baseT = 0.07;
  const pos = [], idx = [];
  const corners = [[+0.5, +0.5], [+0.5, -0.5], [-0.5, -0.5], [-0.5, +0.5]]; // (u,v)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = plinthH + 0.04 + t * ribH;
    const ang = twist * t;
    const w = baseW * (1 - 0.35 * t);       // taper width upward
    const th = baseT * (1 - 0.15 * t);
    const bend = Math.sin(t * Math.PI) * 0.14;  // gentle S-lean in +X
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const [u, v] of corners) {
      const uu = u * w, vv = v * th;
      const x = bend + uu * ca - vv * sa;
      const z = uu * sa + vv * ca;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k);
    }
  }
  // caps
  const bot = 0, topR = segs * 4;
  idx.push(bot, bot + 1, bot + 2, bot, bot + 2, bot + 3);
  idx.push(topR, topR + 2, topR + 1, topR, topR + 3, topR + 2);
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ribGeo.setIndex(idx);
  ribGeo.computeVertexNormals();
  const ribMat = mat(0xb8bcc0, { roughness: 0.22, metalness: 0.95, envMapIntensity: 1.3 });
  const ribbon = new THREE.Mesh(ribGeo, ribMat);
  g.add(ribbon);

  // a polished accent sphere resting in the twist
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18),
    mat(0xcc8a3a, { roughness: 0.25, metalness: 1.0, envMapIntensity: 1.4 }));
  orb.position.set(0.16, plinthH + 0.04 + ribH * 0.5, 0);
  g.add(orb);

  shadows(g);
  return g;
}

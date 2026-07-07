// ---------------------------------------------------------------------------
// parts/greenwall.js
// Volumetric vertical GREEN LIVING WALLS + cascading ivy, and an overflowing
// balcony planter TROUGH. The signature foliage of the complex.
//
// Foliage is built from real 3D geometry: a small folded low-poly leaf,
// scattered as a dense InstancedMesh with per-instance position/rotation/scale
// jitter and per-instance green colour variation — so it reads bushy, layered
// and three-dimensional, never a flat green mat.
//
// Conventions: metres, +Y up. Facade-mounted: centred on X, base y=0 growing up,
// substrate plane at z=0, foliage bushes OUT toward +Z.
// ---------------------------------------------------------------------------
import { THREE, RoundedBoxGeometry, bevelBox, tube, catenary, mat, palette, shadows } from './kit.js';

// A tiny low-poly leaf: two triangles folded along a central vein so it has a
// shallow V cross-section (volume + facets that catch light, no flat look).
// Local space: base at origin, tip at +Y, ~2 units long, cupped toward +Z.
function leafGeometry() {
  const L = 1.0, W = 0.42, midY = 0.42, cup = 0.16, tipZ = 0.05;
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 0, 0,             // 0 base
    -W, midY, cup,       // 1 mid-left (folded forward)
    0, L, tipZ,          // 2 tip
    W, midY, cup,        // 3 mid-right (folded forward)
  ]);
  const idx = [0, 1, 2, 0, 2, 3];
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A small four-sided pyramid-ish blossom blob for flowers (brighter dots).
function blossomGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.scale(1, 0.7, 1);
  return g;
}

// Green colour ramp: mix palette leaf tones plus lighter/darker highlights.
const GREENS = [
  new THREE.Color(0x2f5f28), // leafDark
  new THREE.Color(0x3f7d34), // leaf
  new THREE.Color(0x4f9440), // mid-bright
  new THREE.Color(0x6aa94e), // sun-lit
  new THREE.Color(0x86bd5c), // fresh new growth
  new THREE.Color(0x274e22), // deep shadow
];
function greenColor(target, rnd) {
  const a = GREENS[(rnd * GREENS.length) | 0];
  const b = GREENS[((rnd * 7.3) % 1 * GREENS.length) | 0];
  target.copy(a).lerp(b, (rnd * 13.7) % 1);
  // subtle per-leaf brightness jitter
  const j = 0.82 + ((rnd * 91.3) % 1) * 0.36;
  target.multiplyScalar(j);
  return target;
}

// Deterministic-ish pseudo random so results are stable between runs.
function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Fill an InstancedMesh from an array of {x,y,z,rx,ry,rz,s,seed} descriptors.
function fillLeaves(geo, material, list) {
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    _p.set(d.x, d.y, d.z);
    _e.set(d.rx, d.ry, d.rz);
    _q.setFromEuler(_e);
    const sc = d.s;
    _s.set(sc, sc, sc);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, greenColor(_c, d.seed != null ? d.seed : Math.random()));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A leaf material set to white base so per-instance colour shows through.
// flatShading keeps each little leaf crisp and faceted (reads as real 3D).
function leafMaterial() {
  return mat(0xffffff, {
    roughness: 0.78,
    metalness: 0.0,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

// ===========================================================================
// createGreenWall — a volumetric living wall / cascading ivy strip.
// ===========================================================================
export function createGreenWall(width = 1.0, height = 3.0, depth = 0.28) {
  const group = new THREE.Group();
  group.name = 'GreenWall';
  const rng = makeRng(1337);
  const P = palette();

  // --- dark thin substrate backing at z=0 (the felt/planting mat) ---
  const backT = 0.03;
  const back = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, backT, 2, 0.01),
    P.soil
  );
  back.position.set(0, height / 2, -backT / 2 + 0.001);
  back.castShadow = false;
  back.receiveShadow = true;
  group.add(back);

  // A slightly proud dark "moss base" plane just in front so gaps between
  // leaves read as deep shadow rather than bright ground behind.
  const moss = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    mat(0x1c2e18, { roughness: 1.0, envMapIntensity: 0.15 })
  );
  moss.position.set(0, height / 2, 0.02);
  moss.receiveShadow = true;
  group.add(moss);

  // --- dense leaf field ---
  const leaves = [];
  // Density scales with area; a few hundred leaves for a 1x3 strip.
  const area = width * height;
  const nCols = Math.max(4, Math.round(width / 0.11));
  const nRows = Math.max(10, Math.round(height / 0.11));
  const baseLeaf = 0.16; // ~16 cm leaves
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      // 1-2 leaves per cell for layering, more toward the front
      const perCell = 1 + (rng() < 0.7 ? 1 : 0);
      for (let k = 0; k < perCell; k++) {
        const gx = (c + 0.5) / nCols;        // 0..1
        const gy = (r + 0.5) / nRows;
        const x = (gx - 0.5) * width + (rng() - 0.5) * (width / nCols) * 1.6;
        const y = gy * height + (rng() - 0.5) * (height / nRows) * 1.6;
        if (y < 0.02 || y > height - 0.01) continue;
        const z = 0.02 + rng() * (depth - 0.02);
        // leaves generally point up & outward, with big random spread
        const rx = -0.35 - rng() * 0.9;               // pitch up/out toward +Z
        const ry = (rng() - 0.5) * Math.PI * 2.0;     // full yaw spin
        const rz = (rng() - 0.5) * 1.4;               // roll
        const s = baseLeaf * (0.7 + rng() * 0.8) * (0.9 + z / depth * 0.4);
        leaves.push({ x, y, z, rx, ry, rz, s, seed: rng() });
      }
    }
  }

  // --- trailing vine strands (cascading ivy) ---
  const vineMat = mat(0x3b5a2a, { roughness: 0.85, envMapIntensity: 0.3 });
  const nVines = Math.max(3, Math.round(width / 0.35));
  for (let v = 0; v < nVines; v++) {
    const vx = (rng() - 0.5) * width * 0.9;
    const topY = height * (0.55 + rng() * 0.4);
    const len = height * (0.35 + rng() * 0.45);
    const bot = Math.max(0.05, topY - len);
    const steps = 8;
    const pts = [];
    // gentle outward-then-down curve, waving in x, bushing out in +z
    const outZ = 0.06 + rng() * (depth * 0.8);
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = topY - t * (topY - bot);
      const x = vx + Math.sin(phase + t * 3.2) * 0.05 * (1 - t * 0.4);
      const z = 0.03 + outZ * Math.sin(t * Math.PI * 0.6) + t * 0.02;
      pts.push([x, y, z]);
    }
    const vineGeo = tube(pts, 0.012 + rng() * 0.006, 5);
    const vine = new THREE.Mesh(vineGeo, vineMat);
    vine.castShadow = true;
    vine.receiveShadow = true;
    group.add(vine);
    // little leaves along the vine
    const nLeaf = 8 + (rng() * 6 | 0);
    for (let i = 0; i < nLeaf; i++) {
      const t = 0.12 + (i / nLeaf) * 0.85;
      const y = topY - t * (topY - bot);
      const x = vx + Math.sin(phase + t * 3.2) * 0.05 * (1 - t * 0.4);
      const z = 0.03 + outZ * Math.sin(t * Math.PI * 0.6) + t * 0.02;
      const side = (i % 2 === 0) ? 1 : -1;
      leaves.push({
        x: x + side * 0.02, y, z: z + 0.01,
        rx: 0.2 + rng() * 0.5,               // droop down for trailing look
        ry: side * (0.6 + rng() * 0.8),
        rz: side * (0.4 + rng() * 0.5),
        s: baseLeaf * (0.55 + rng() * 0.4),
        seed: rng(),
      });
    }
  }

  group.add(fillLeaves(leafGeometry(), leafMaterial(), leaves));

  shadows(group);
  group.userData.dims = { width, height, depth };
  return group;
}

// ===========================================================================
// createTrough — a balcony planter that overflows with trailing greenery.
// ===========================================================================
export function createTrough(width = 2.4) {
  const group = new THREE.Group();
  group.name = 'Trough';
  const rng = makeRng(4242);
  const P = palette();

  const boxH = 0.24;        // planter height
  const boxD = 0.30;        // planter depth (Z)
  const wall = 0.02;

  // --- planter body: slim dark-metal box ---
  const bodyMat = P.darkMetal;
  const body = new THREE.Mesh(bevelBox(width, boxH, boxD, 0.01), bodyMat);
  body.position.set(0, boxH / 2, boxD / 2);
  group.add(body);

  // thin lip/rim on top for a crafted edge
  const rim = new THREE.Mesh(bevelBox(width + 0.02, 0.03, boxD + 0.02, 0.008), P.charcoal);
  rim.position.set(0, boxH - 0.005, boxD / 2);
  group.add(rim);

  // --- soil top, recessed just below the rim ---
  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(width - wall * 2, 0.03, boxD - wall * 2),
    P.soil
  );
  soil.position.set(0, boxH - 0.04, boxD / 2);
  group.add(soil);
  const soilTopY = boxH - 0.025;

  // --- foliage: mounded greenery on top + spilling over the front lip ---
  const leaves = [];
  const baseLeaf = 0.15;

  // 1) mounded bush sitting on the soil
  const nCols = Math.max(10, Math.round(width / 0.09));
  const nDepth = 4;
  for (let c = 0; c < nCols; c++) {
    for (let d = 0; d < nDepth; d++) {
      const perCell = 3 + (rng() < 0.6 ? 1 : 0);
      for (let k = 0; k < perCell; k++) {
        const x = ((c + 0.5) / nCols - 0.5) * (width - wall * 2) + (rng() - 0.5) * 0.06;
        const zc = wall + (d + 0.5) / nDepth * (boxD - wall * 2) + (rng() - 0.5) * 0.05;
        // mound: higher in the middle-back, tumbling toward front
        const mound = 0.06 + rng() * 0.12;
        const y = soilTopY + mound;
        leaves.push({
          x, y, z: zc,
          rx: -0.6 - rng() * 0.8,
          ry: (rng() - 0.5) * Math.PI * 2,
          rz: (rng() - 0.5) * 1.4,
          s: baseLeaf * (0.7 + rng() * 0.7),
          seed: rng(),
        });
      }
    }
  }

  // 2) trailing vines cascading down the FRONT face (+Z, boxD front) & below
  const vineMat = mat(0x3b5a2a, { roughness: 0.85, envMapIntensity: 0.3 });
  const nVines = Math.max(6, Math.round(width / 0.2));
  const frontZ = boxD;      // front face plane
  for (let v = 0; v < nVines; v++) {
    const vx = ((v + 0.5) / nVines - 0.5) * (width - 0.05) + (rng() - 0.5) * 0.05;
    const len = 0.35 + rng() * 0.55;      // drape length below lip
    const outZ = 0.03 + rng() * 0.09;     // bulge outward from front face
    const steps = 8;
    const phase = rng() * Math.PI * 2;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // start at the front lip, arc outward, then hang straight down below y=0
      const y = (boxH - 0.02) - t * (boxH - 0.02 + len);
      const z = frontZ + outZ * Math.sin(t * Math.PI * 0.75) * (1 - t * 0.3)
        + Math.sin(phase + t * 4) * 0.01;
      const x = vx + Math.sin(phase + t * 3) * 0.03;
      pts.push([x, y, z]);
    }
    const vine = new THREE.Mesh(tube(pts, 0.01 + rng() * 0.005, 5), vineMat);
    vine.castShadow = true; vine.receiveShadow = true;
    group.add(vine);
    // leaves down the vine
    const nLeaf = 9 + (rng() * 6 | 0);
    for (let i = 0; i < nLeaf; i++) {
      const t = 0.08 + (i / nLeaf) * 0.9;
      const y = (boxH - 0.02) - t * (boxH - 0.02 + len);
      const z = frontZ + outZ * Math.sin(t * Math.PI * 0.75) * (1 - t * 0.3) + 0.01;
      const x = vx + Math.sin(phase + t * 3) * 0.03;
      const side = (i % 2 === 0) ? 1 : -1;
      leaves.push({
        x: x + side * 0.015, y, z,
        rx: 0.3 + rng() * 0.5,
        ry: side * (0.6 + rng() * 0.9),
        rz: side * (0.4 + rng() * 0.5),
        s: baseLeaf * (0.55 + rng() * 0.4),
        seed: rng(),
      });
    }
  }

  group.add(fillLeaves(leafGeometry(), leafMaterial(), leaves));

  // 3) a couple of small flowering plants — brighter instanced blossom dots
  const flowerColors = [
    new THREE.Color(0xe8556f), // pink-red
    new THREE.Color(0xf2a63b), // orange
    new THREE.Color(0xf5d24a), // yellow
    new THREE.Color(0xd06fbf), // magenta
    new THREE.Color(0xf3f0e6), // white
  ];
  const blossoms = [];
  const nClusters = 4;
  for (let f = 0; f < nClusters; f++) {
    const cx = ((f + 0.5) / nClusters - 0.5) * (width - 0.3) + (rng() - 0.5) * 0.12;
    const col = flowerColors[(rng() * flowerColors.length) | 0];
    const petals = 7 + (rng() * 6 | 0);
    for (let i = 0; i < petals; i++) {
      // sit blossoms up ON TOP of the mound so they read above the leaves
      const y = soilTopY + 0.16 + rng() * 0.12;
      const x = cx + (rng() - 0.5) * 0.14;
      const z = wall + rng() * (boxD - wall * 2);
      blossoms.push({ x, y, z, s: 0.045 + rng() * 0.03, col });
    }
  }
  if (blossoms.length) {
    const fMat = mat(0xffffff, { roughness: 0.6, metalness: 0.0, envMapIntensity: 0.7, flatShading: true });
    const fMesh = new THREE.InstancedMesh(blossomGeometry(), fMat, blossoms.length);
    for (let i = 0; i < blossoms.length; i++) {
      const b = blossoms[i];
      _p.set(b.x, b.y, b.z);
      _e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
      _q.setFromEuler(_e);
      _s.set(b.s, b.s, b.s);
      _m.compose(_p, _q, _s);
      fMesh.setMatrixAt(i, _m);
      _c.copy(b.col).multiplyScalar(0.85 + rng() * 0.3);
      fMesh.setColorAt(i, _c);
    }
    fMesh.instanceMatrix.needsUpdate = true;
    if (fMesh.instanceColor) fMesh.instanceColor.needsUpdate = true;
    fMesh.castShadow = true; fMesh.receiveShadow = true;
    group.add(fMesh);
  }

  shadows(group);
  group.userData.dims = { width, height: boxH, depth: boxD };
  return group;
}

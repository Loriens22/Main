// ---------------------------------------------------------------------------
// Site & environment: courtyard lawns, winding paths, planting, trees, benches,
// street furniture, gabion walls, the boulevard with cars & people, plus the
// mountain backdrop and neighbouring buildings.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad); t = Math.imul(t ^ (t >>> 15), 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}

// ribbon mesh following a smooth curve (winding path / road markings)
function ribbon(points, width, y) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], y, p[1])));
  const N = 120;
  const pos = [], idx = [], uv = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, y, p.z - side.z);
    pos.push(p.x + side.x, y, p.z + side.z);
    uv.push(0, t * 10, 1, t * 10);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function windowFacadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cdd0d0'; ctx.fillRect(0, 0, 256, 256);
  const rnd = rng(9);
  // larger, calmer window bands so distant neighbours don't read as noise
  for (let y = 16; y < 256; y += 40) {
    for (let x = 14; x < 256; x += 40) {
      const lit = rnd();
      ctx.fillStyle = lit > 0.92 ? '#eaddc0' : (lit > 0.5 ? '#7683899a' : '#828e96');
      ctx.fillRect(x, y, 26, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, 26, 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildLandscape(scene, M, layout) {
  const g = new THREE.Group();
  scene.add(g);
  const rand = rng(4242);
  const windGroups = [];

  // ---------- ground planes ----------
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x6f7d55, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.05; far.receiveShadow = true; g.add(far);

  // site hardscape (plaza) under and around complex
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), M.paving);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.0, 0); plaza.receiveShadow = true; g.add(plaza);

  // courtyard lawn
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(54, 34), M.lawn);
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.04, -4); lawn.receiveShadow = true; g.add(lawn);

  // ---------- winding courtyard paths ----------
  const pathMat = M.paving.clone(); pathMat.color = new THREE.Color(0xe0e0da);
  const p1 = ribbon([[-24, 8], [-12, 2], [-2, -3], [8, -6], [20, -12]], 2.4, 0.06);
  const p2 = ribbon([[22, 6], [8, 3], [-2, -2], [-14, -8], [-22, -14]], 2.0, 0.06);
  const pmesh1 = new THREE.Mesh(p1, pathMat); pmesh1.receiveShadow = true; g.add(pmesh1);
  const pmesh2 = new THREE.Mesh(p2, pathMat); pmesh2.receiveShadow = true; g.add(pmesh2);

  // ---------- gabion retaining walls / seating blocks ----------
  const gabGeoms = [];
  for (let i = 0; i < 12; i++) {
    const w = 0.9, h = 0.7 + rand() * 0.6, d = 0.9;
    const gg = new THREE.BoxGeometry(w, h, d);
    gg.translate(-22 + rand() * 44, h / 2 + 0.05, -16 + rand() * 22);
    gabGeoms.push(gg);
  }
  const gab = new THREE.Mesh(mergeGeometries(gabGeoms), M.gabion);
  gab.castShadow = true; gab.receiveShadow = true; g.add(gab);

  // ---------- planting beds ----------
  const bedGeoms = [];
  for (let i = 0; i < 6; i++) {
    const w = 3 + rand() * 4, d = 2 + rand() * 3;
    const bb = new THREE.BoxGeometry(w, 0.25, d);
    bb.translate(-20 + rand() * 40, 0.13, -14 + rand() * 20);
    bedGeoms.push(bb);
  }
  const beds = new THREE.Mesh(mergeGeometries(bedGeoms), M.soil);
  beds.receiveShadow = true; g.add(beds);

  // ---------- trees (instanced trunks + canopies) ----------
  const treePos = [];
  // (courtyard trees are now detailed hero trees supplied by complex.js)
  // boulevard rows
  const bl = layout.boulevardZ;
  for (let x = -70; x <= 70; x += 9) {
    treePos.push([x + (rand() - 0.5) * 2, bl - 7, 2.6 + rand() * 1.2, 1]);
    treePos.push([x + (rand() - 0.5) * 2, bl + 10, 2.6 + rand() * 1.2, 2]);
  }
  // background greenery
  for (let i = 0; i < 40; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    treePos.push([side * (55 + rand() * 40), -60 + rand() * 120, 3 + rand() * 3, (rand() * 3) | 0]);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 8);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, M.trunk, treePos.length);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 3);
  // gentle noise on the canopy sphere so it reads as organic foliage, not a ball
  {
    const p = canopyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const n = 0.82 + (Math.sin(p.getX(i) * 9.1) * Math.cos(p.getY(i) * 7.7) * Math.sin(p.getZ(i) * 8.3)) * 0.18;
      p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
    }
    canopyGeo.computeVertexNormals();
  }
  const canopyMat = M.foliage.clone(); canopyMat.flatShading = false;
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, treePos.length * 2);
  trunkMesh.castShadow = canopyMesh.castShadow = true;
  trunkMesh.receiveShadow = canopyMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let ci = 0;
  treePos.forEach((t, i) => {
    const [x, z, scale, tone] = t;
    const trunkH = scale * 1.5;
    dummy.position.set(x, trunkH / 2, z);
    dummy.scale.set(1, trunkH, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    // two overlapping canopy blobs
    for (let k = 0; k < 2; k++) {
      dummy.position.set(x + (rand() - 0.5) * 0.6, trunkH + scale * (0.7 + k * 0.4), z + (rand() - 0.5) * 0.6);
      const s = scale * (1.1 - k * 0.3);
      dummy.scale.set(s, s * (0.9 + rand() * 0.3), s);
      dummy.rotation.set(rand(), rand() * 6, rand());
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(ci, dummy.matrix);
      const base = tone === 1 ? [0.32, 0.5, 0.22] : tone === 2 ? [0.42, 0.52, 0.24] : [0.28, 0.46, 0.2];
      const v = 0.8 + rand() * 0.4;
      col.setRGB(base[0] * v, base[1] * v, base[2] * v);
      canopyMesh.setColorAt(ci, col);
      ci++;
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceColor.needsUpdate = true;
  g.add(trunkMesh, canopyMesh);
  windGroups.push(canopyMesh);

  // ---------- shrubs / hedges (instanced) ----------
  const shrubGeo = new THREE.IcosahedronGeometry(0.6, 2);
  const shrubMat = M.hedge.clone(); shrubMat.flatShading = false;
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, 90);
  shrubs.castShadow = true; shrubs.receiveShadow = true;
  for (let i = 0; i < 90; i++) {
    dummy.position.set(-24 + rand() * 48, 0.4 + rand() * 0.2, -16 + rand() * 22);
    const s = 0.6 + rand() * 0.9;
    dummy.scale.set(s, s * 0.8, s);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
    col.setRGB(0.22 + rand() * 0.1, 0.4 + rand() * 0.12, 0.16 + rand() * 0.08);
    shrubs.setColorAt(i, col);
  }
  g.add(shrubs);

  // flower dots
  const flGeo = new THREE.SphereGeometry(0.12, 6, 5);
  const flowers = new THREE.InstancedMesh(flGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 200);
  const flCols = [[0.75, 0.22, 0.17], [0.85, 0.33, 0.55], [0.95, 0.8, 0.2], [0.6, 0.3, 0.7]];
  for (let i = 0; i < 200; i++) {
    dummy.position.set(-22 + rand() * 44, 0.28, -15 + rand() * 21);
    dummy.scale.setScalar(0.7 + rand());
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    const fc = flCols[(rand() * flCols.length) | 0];
    col.setRGB(fc[0], fc[1], fc[2]); flowers.setColorAt(i, col);
  }
  g.add(flowers);

  // ---------- benches ----------
  const benchPositions = [[-10, 3, 0.4], [6, -4, -0.6], [-16, -9, 1.1], [16, 2, 2.4], [0, 6, 0]];
  for (const [x, z, r] of benchPositions) g.add(makeBench(M, x, z, r));

  // ---------- boulevard ----------
  buildBoulevard(g, M, layout, rand);

  // ---------- neighbouring buildings ----------
  const winTex = windowFacadeTexture();
  buildNeighbors(g, M, winTex, rand, layout);

  // ---------- mountain backdrop ----------
  buildMountains(g, M, rand);

  // ---------- people ----------
  buildPeople(g, M, rand, layout);

  return { windGroups };
}

function makeBench(M, x, z, ry) {
  const b = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), M.benchWood);
  seat.position.y = 0.45; seat.castShadow = true; b.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.1), M.benchWood);
  back.position.set(0, 0.72, -0.2); back.castShadow = true; b.add(back);
  for (const sx of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), M.metalPost);
    leg.position.set(sx, 0.22, 0); b.add(leg);
  }
  b.position.set(x, 0.06, z); b.rotation.y = ry;
  b.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
  return b;
}

function makeStreetlight(M, x, z) {
  const s = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6, 8), M.metalPost);
  pole.position.y = 3; pole.castShadow = true; s.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), M.metalPost);
  arm.position.set(0.6, 5.9, 0); s.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), M.lampGlass);
  head.position.set(1.2, 5.8, 0); s.add(head);
  s.position.set(x, 0.05, z);
  return s;
}

function buildBoulevard(g, M, layout, rand) {
  const z = layout.boulevardZ;
  const road = new THREE.Mesh(new THREE.BoxGeometry(180, 0.08, 16), M.asphalt);
  road.position.set(0, 0.06, z); road.receiveShadow = true; g.add(road);
  // centre dashed line
  for (let x = -85; x < 85; x += 4) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.25), M.roadLine);
    dash.position.set(x, 0.11, z); dash.receiveShadow = true; g.add(dash);
  }
  // lane edge lines
  for (const dz of [-6.5, 6.5]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(180, 0.02, 0.2), M.roadLine);
    line.position.set(0, 0.11, z + dz); g.add(line);
  }
  // sidewalks
  for (const dz of [-11, 11]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(180, 0.22, 6), M.sidewalk);
    sw.position.set(0, 0.11, z + dz); sw.receiveShadow = true; g.add(sw);
  }
  // streetlights
  for (let x = -72; x <= 72; x += 16) {
    g.add(makeStreetlight(M, x, z - 9.5));
    g.add(makeStreetlight(M, x, z + 9.5));
  }
  // cars: moving lanes + parked
  const cars = [];
  for (let i = 0; i < 8; i++) {
    const c = makeCar(M, rand);
    c.position.set(-80 + rand() * 160, 0.35, z + (rand() > 0.5 ? -3.5 : 3.5));
    c.userData.speed = (c.position.z < z ? 1 : -1) * (6 + rand() * 4);
    g.add(c); cars.push(c);
  }
  // parked cars along complex front
  for (let i = 0; i < 6; i++) {
    const c = makeCar(M, rand);
    c.position.set(-30 + i * 11 + rand() * 2, 0.35, z - 13.5);
    c.rotation.y = Math.PI / 2;
    g.add(c);
  }
  layout._cars = cars;
}

function makeCar(M, rand) {
  const c = new THREE.Group();
  const color = M.carBodyColors[(rand() * M.carBodyColors.length) | 0];
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 1.9), bodyMat);
  body.position.y = 0.3; body.castShadow = true; c.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.75), bodyMat);
  cabin.position.set(-0.2, 0.95, 0); cabin.castShadow = true; c.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 1.65), M.carGlass);
  glass.position.set(-0.2, 0.98, 0); c.add(glass);
  for (const [wx, wz] of [[-1.4, 0.95], [-1.4, -0.95], [1.4, 0.95], [1.4, -0.95]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), M.tire);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, -0.05, wz); wheel.castShadow = true; c.add(wheel);
  }
  c.scale.setScalar(1.0);
  return c;
}

function buildNeighbors(g, M, winTex, rand, layout) {
  const winMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.6 });
  const place = (x, z, w, d, h) => {
    const t = winTex.clone(); t.repeat.set(Math.max(2, w / 7), Math.max(2, h / 6)); t.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.6 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
    // roof cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), M.roofDeck);
    cap.position.set(x, h + 0.2, z); g.add(cap);
  };
  // behind the complex
  place(-52, -46, 20, 16, 30);
  place(-20, -52, 18, 14, 22);
  place(30, -50, 22, 16, 40);
  place(58, -40, 18, 14, 34);
  // across the boulevard
  const bz = layout.boulevardZ + 30;
  place(-55, bz, 24, 18, 26);
  place(-22, bz + 6, 20, 16, 34);
  place(14, bz, 22, 16, 30);
  place(48, bz + 4, 26, 18, 44);
  // to the sides
  place(-78, -6, 20, 30, 36);
  place(80, 4, 20, 30, 30);
  // a construction crane for context
  const crane = makeCrane(M);
  crane.position.set(-70, 0, -46); g.add(crane);
}

function makeCrane(M) {
  const c = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1, 40, 1), new THREE.MeshStandardMaterial({ color: 0xffcc22, roughness: 0.6, metalness: 0.4 }));
  mast.position.y = 20; c.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(36, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xffcc22, roughness: 0.6 }));
  jib.position.set(8, 40, 0); c.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 1), new THREE.MeshStandardMaterial({ color: 0x333 }));
  counter.position.set(-10, 40, 0); c.add(counter);
  c.traverse(o => o.castShadow = true);
  return c;
}

function buildMountains(g, M, rand) {
  // A large displaced ridge far to the north-west (Vitosha-like backdrop).
  const build = (cx, cz, w, dpth, hmax, rot, colr) => {
    const seg = 60;
    const geo = new THREE.PlaneGeometry(w, dpth, seg, 20);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const ridge = Math.sin(x * 0.02) * 0.5 + Math.sin(x * 0.006 + 2) * 0.5;
      const falloff = Math.max(0, 1 - Math.abs(y) / (dpth / 2));
      let h = (ridge * 0.5 + 0.5) * hmax * falloff;
      h += (rand() - 0.5) * hmax * 0.12 * falloff;
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: colr, roughness: 1, metalness: 0, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
    m.position.set(cx, 0, cz);
    g.add(m);
  };
  build(-30, -240, 620, 150, 62, 0.0, 0x6a7a60);
  build(-260, -70, 380, 150, 52, Math.PI / 2, 0x71806a);
  // hazy blue distant range
  build(80, -300, 720, 130, 58, 0.05, 0x9aaab6);
}

function buildPeople(g, M, rand, layout) {
  const count = 46;
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.7, 3, 8);
  const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), count);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), count);
  bodies.castShadow = heads.castShadow = true;
  const d = new THREE.Object3D(); const col = new THREE.Color();
  const spots = [];
  for (let i = 0; i < count; i++) {
    let x, z;
    const r = rand();
    if (r < 0.5) { x = -24 + rand() * 48; z = -16 + rand() * 24; } // courtyard
    else if (r < 0.8) { x = -70 + rand() * 140; z = layout.boulevardZ + (rand() > 0.5 ? 11 : -11) + (rand() - 0.5) * 3; } // sidewalks
    else { x = -30 + rand() * 60; z = 16 + rand() * 6; } // front plaza
    spots.push([x, z]);
    d.position.set(x, 0.9, z); d.rotation.y = rand() * 6; d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    const cc = M.clothTones[(rand() * M.clothTones.length) | 0]; col.set(cc); bodies.setColorAt(i, col);
    d.position.set(x, 1.42, z); d.scale.setScalar(1); d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    const sk = M.skinTones[(rand() * M.skinTones.length) | 0]; col.set(sk); heads.setColorAt(i, col);
  }
  g.add(bodies, heads);
}

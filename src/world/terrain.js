// Ground plane, Vitosha mountain to the south, distant ridges and the Kopitoto TV tower.
import * as THREE from 'three';
import { WM } from './materials.js';
import { fbm, clamp, smoothstep, lerp, prepGeo } from '../util.js';

export function buildTerrain(scene, fogColor) {
  // ground (lawns/soil) — big plane, slightly below road level
  const gsize = 9000;
  // subdivided: two giant triangles lose depth precision after near-plane clipping and poke through the roads
  const g = new THREE.PlaneGeometry(gsize, gsize, 120, 120);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * gsize / 7, uv.getY(i) * gsize / 7);
  const ground = new THREE.Mesh(prepGeo(g), WM.grass);
  ground.position.set(500, -0.06, -1300);
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // ---- Vitosha (south) ----
  const W = 42000, D = 16000, nx = 220, nz = 90;
  const mg = new THREE.PlaneGeometry(W, D, nx, nz);
  mg.rotateX(-Math.PI / 2);
  const pos = mg.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const haze = new THREE.Color(0xaebfd0);
  const cForest = new THREE.Color(0x2f4630), cMeadow = new THREE.Color(0x6d7552), cRock = new THREE.Color(0x8a8378), cSnowless = new THREE.Color(0x9a927f);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); // local: z from -D/2 (north edge, towards city) to +D/2
    const t = (z + D / 2) / D; // 0 north edge .. 1 south
    const ridge = Math.exp(-(((x + 1500) / 13000) ** 2)); // main massif centred slightly west
    const prof = smoothstep(0.02, 0.55, t) * (1 - smoothstep(0.75, 1.0, t) * 0.4);
    const n = fbm(x / 2600 + 3, z / 2600, 5, 7);
    const n2 = fbm(x / 700, z / 700, 3, 9);
    let h = prof * (600 + 1150 * ridge) * (0.72 + n * 0.55) + n2 * 60 * prof - 40;
    // Kopitoto spur (north-west, lower) with the TV tower
    h += 520 * Math.exp(-(((x + 5200) / 2200) ** 2 + ((z + D / 2 - 2600) / 1500) ** 2));
    pos.setY(i, h);
    const hn = clamp(h / 1700, 0, 1);
    c.copy(cForest).lerp(cMeadow, smoothstep(0.35, 0.62, hn + (n2 - 0.5) * 0.15)).lerp(cRock, smoothstep(0.62, 0.85, hn)).lerp(cSnowless, smoothstep(0.85, 1, hn));
    // aerial perspective: distant = hazier
    c.lerp(haze, 0.42 + t * 0.2);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mg.computeVertexNormals();
  const mMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false, envMapIntensity: 0.3 });
  const mountain = new THREE.Mesh(mg, mMat);
  mountain.position.set(-500, 0, 4000 + D / 2);
  mountain.name = 'vitosha';
  scene.add(mountain);
  // TV tower on Kopitoto
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 150, 8), new THREE.MeshBasicMaterial({ color: 0x8e9aa6, fog: false }));
  const topH = 540;
  tower.position.set(-500 - 5200, topH + 75, 4000 + 2600);
  scene.add(tower);

  // ---- distant ridges (Stara Planina to the north, Lyulin west) ----
  const ridge = (cx, cz, len, height, rot, color) => {
    const rg = new THREE.PlaneGeometry(len, 3000, 120, 12);
    rg.rotateX(-Math.PI / 2);
    const p = rg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const tt = (z + 1500) / 3000;
      const hh = Math.sin(tt * Math.PI) * height * (0.6 + fbm(x / 3000, 1.3, 4, 3) * 0.8);
      p.setY(i, hh - 50);
    }
    rg.computeVertexNormals();
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.set(cx, 0, cz); m.rotation.y = rot;
    scene.add(m);
  };
  ridge(0, -26000, 60000, 1700, 0, 0xb4c3d2);
  ridge(-16000, -2000, 22000, 900, Math.PI / 2, 0xb7c5d3);
  return { ground, mountain };
}

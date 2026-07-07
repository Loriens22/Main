// ---------------------------------------------------------------------------
// Material library. Reflections come from scene.environment (a PMREM of the
// real sky), which MeshStandardMaterial picks up automatically — this is what
// keeps glass and metal from reading as flat "voxel" colour.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import * as TX from './textures.js';

// Simple, softly-lit windowed facade for the non-hero backs of the buildings
// so they never read as flat black slabs when the camera orbits behind them.
function coreFacadeTexture() {
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9cdc9'; ctx.fillRect(0, 0, s, s);
  let a = 12345;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const cols = 8, rows = 8, pad = 10;
  const cw = s / cols, ch = s / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const lit = rnd();
    ctx.fillStyle = lit > 0.9 ? '#f4e2b8' : (lit > 0.55 ? '#5f6d76' : '#48555e');
    ctx.fillRect(k * cw + pad, r * ch + pad, cw - pad * 2, ch - pad * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(k * cw + pad, r * ch + pad, cw - pad * 2, (ch - pad * 2) * 0.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMaterials() {
  const white = TX.whitePanelMaps();
  const woodH = TX.woodMaps(false);
  const woodV = TX.woodMaps(true);
  const ivy = TX.ivyMaps();
  const lawn = TX.lawnMaps();
  const paving = TX.concreteMaps([224, 225, 220]);
  const darkStone = TX.concreteMaps([70, 72, 78]);
  const gabion = TX.gabionMaps();
  const perf = TX.perforatedRailingTexture();
  const interior = TX.interiorTexture();

  for (const t of [white.map, woodH.map, woodV.map, ivy.map, lawn.map, paving.map, darkStone.map, gabion.map]) {
    t.colorSpace = THREE.SRGBColorSpace;
  }

  const M = {};

  M.whitePanel = new THREE.MeshStandardMaterial({
    map: white.map, normalMap: white.normalMap, roughnessMap: white.roughnessMap,
    color: 0xf3f4f2, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.55
  });
  M.whitePanel.normalScale.set(0.35, 0.35);

  M.woodH = new THREE.MeshStandardMaterial({
    map: woodH.map, normalMap: woodH.normalMap, color: 0xffffff,
    roughness: 0.62, metalness: 0.0, envMapIntensity: 0.5
  });
  M.woodH.normalScale.set(0.8, 0.8);
  M.woodV = new THREE.MeshStandardMaterial({
    map: woodV.map, normalMap: woodV.normalMap, color: 0xffffff,
    roughness: 0.62, metalness: 0.0, envMapIntensity: 0.5
  });
  M.woodV.normalScale.set(0.8, 0.8);

  M.ivy = new THREE.MeshStandardMaterial({
    map: ivy.map, normalMap: ivy.normalMap, color: 0xdfe8d8,
    roughness: 0.85, metalness: 0.0, envMapIntensity: 0.35
  });
  M.ivy.normalScale.set(1.2, 1.2);

  // Reflective low-E glass — dark, low roughness, strong env reflection, but
  // translucent enough to reveal the warm interiors behind it.
  M.glass = new THREE.MeshStandardMaterial({
    color: 0x142430, roughness: 0.07, metalness: 0.85,
    envMapIntensity: 1.3, transparent: true, opacity: 0.72
  });
  M.glassClear = new THREE.MeshStandardMaterial({
    color: 0x9fb8c4, roughness: 0.04, metalness: 0.6,
    envMapIntensity: 1.5, transparent: true, opacity: 0.35
  });

  // Dark metal — window frames, mullions, structure accents.
  M.darkMetal = new THREE.MeshStandardMaterial({
    color: 0x24262b, roughness: 0.42, metalness: 0.85, envMapIntensity: 0.9
  });
  M.charcoal = new THREE.MeshStandardMaterial({
    color: 0x2b2d31, roughness: 0.7, metalness: 0.25, envMapIntensity: 0.5
  });
  const coreTex = coreFacadeTexture();
  coreTex.repeat.set(1, 1);
  M.coreFacade = new THREE.MeshStandardMaterial({
    map: coreTex, color: 0xd6d8d4, roughness: 0.8, metalness: 0.1, envMapIntensity: 0.4
  });
  M.blackTrim = new THREE.MeshStandardMaterial({
    color: 0x131417, roughness: 0.55, metalness: 0.4, envMapIntensity: 0.6
  });

  // Perforated railing (double-sided, alpha-punched).
  M.perfRail = new THREE.MeshStandardMaterial({
    map: perf, alphaMap: perf, color: 0x2a2c30, roughness: 0.5, metalness: 0.7,
    transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.8
  });

  M.railGlass = new THREE.MeshStandardMaterial({
    color: 0x8ea3ad, roughness: 0.08, metalness: 0.3,
    transparent: true, opacity: 0.28, side: THREE.DoubleSide, envMapIntensity: 1.4
  });

  M.interiorGlow = new THREE.MeshStandardMaterial({
    map: interior, emissive: 0xffe6bc, emissiveMap: interior,
    emissiveIntensity: 1.15, roughness: 0.9, metalness: 0.0
  });

  M.lawn = new THREE.MeshStandardMaterial({
    map: lawn.map, color: 0x89a35a, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3
  });
  lawn.map.repeat.set(10, 10);

  M.paving = new THREE.MeshStandardMaterial({
    map: paving.map, normalMap: paving.normalMap, color: 0xf0efe9,
    roughness: 0.88, metalness: 0.0, envMapIntensity: 0.25
  });
  paving.map.repeat.set(6, 6); paving.normalMap.repeat.set(6, 6);
  paving.normalMap.wrapS = paving.normalMap.wrapT = THREE.RepeatWrapping;

  M.darkStone = new THREE.MeshStandardMaterial({
    map: darkStone.map, normalMap: darkStone.normalMap, color: 0x8f8880,
    roughness: 0.8, metalness: 0.1, envMapIntensity: 0.55
  });

  M.gabion = new THREE.MeshStandardMaterial({
    map: gabion.map, normalMap: gabion.normalMap, color: 0xffffff,
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3
  });
  M.gabion.normalScale.set(1.3, 1.3);

  M.asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.92, metalness: 0.0 });
  M.roadLine = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.7, metalness: 0.0 });
  M.sidewalk = new THREE.MeshStandardMaterial({
    map: paving.map, color: 0xbfc0ba, roughness: 0.9, metalness: 0.0
  });

  M.trunk = new THREE.MeshStandardMaterial({ color: 0x5a4231, roughness: 0.9, metalness: 0.0 });
  M.foliage = new THREE.MeshStandardMaterial({ color: 0x4c7a34, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4 });
  M.hedge = new THREE.MeshStandardMaterial({ color: 0x3f6b2c, roughness: 0.9, metalness: 0.0 });
  M.flowerRed = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 });
  M.flowerPink = new THREE.MeshStandardMaterial({ color: 0xd9538b, roughness: 0.8 });
  M.soil = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1.0 });

  M.benchWood = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.6, metalness: 0.0 });
  M.metalPost = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.7 });
  M.lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe6b0, emissiveIntensity: 0.6, roughness: 0.3 });

  M.solarPanel = new THREE.MeshStandardMaterial({ color: 0x0b1a33, roughness: 0.2, metalness: 0.6, envMapIntensity: 1.0 });
  M.hvac = new THREE.MeshStandardMaterial({ color: 0x777a7e, roughness: 0.6, metalness: 0.6, envMapIntensity: 0.6 });
  M.roofDeck = new THREE.MeshStandardMaterial({ color: 0x44464a, roughness: 0.9, metalness: 0.1 });

  M.carBodyColors = [0xf2f2f2, 0xd8d9dc, 0x9aa0a6, 0x3a3c40, 0xb8bcc0, 0xe8e8e8];
  M.carGlass = new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.1, metalness: 0.6, envMapIntensity: 1.2 });
  M.tire = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.9 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xcccdd0, roughness: 0.2, metalness: 1.0, envMapIntensity: 1.2 });

  M.skinTones = [0xe8c2a0, 0xd9a97e, 0xb5825c, 0x8a5a3a, 0xf0d0b8];
  M.clothTones = [0x2c3e50, 0x8e44ad, 0xc0392b, 0x27ae60, 0x34495e, 0xecf0f1, 0xe67e22, 0x2980b9];

  M.mountain = new THREE.MeshStandardMaterial({ color: 0x5a6b52, roughness: 1.0, metalness: 0.0, flatShading: true });
  M.neighbor = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.5 });
  M.neighborWin = new THREE.MeshStandardMaterial({ color: 0x2a3742, roughness: 0.2, metalness: 0.7, envMapIntensity: 0.9 });

  M._textures = { interior };
  return M;
}

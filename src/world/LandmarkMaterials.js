// Shared materials for the hand-built landmarks. Facade materials carry the tile size (metres)
// of their texture in userData.tile so builders can map UVs in metres.
import * as THREE from 'three';
import { facadeTexture, curtainTexture, panelTexture, ribbonGlassTexture, plasterTexture, tileRoofTexture, graniteTexture } from './LandmarkGeometry.js';

export class LandmarkMaterials {
  constructor() {
    const S = THREE.MeshStandardMaterial;
    this.m = {};
    this.night = []; // materials with an emissive map: lit windows at night
    const add = (k, mat) => ((this.m[k] = mat), mat);
    // --- stone, metal, roofs
    const gt = graniteTexture('lm:granite', '#8f8b84', [1.2, 0.6]);
    add('granite', new S({ map: gt, roughness: 0.82 }));
    add('graniteLight', new S({ map: graniteTexture('lm:granite2', '#a8a49c', [1.0, 0.5]), roughness: 0.8 }));
    add('graniteDark', new S({ color: 0x6f6d69, roughness: 0.85 }));
    add('bronze', new S({ color: 0x3f4a3a, roughness: 0.45, metalness: 0.7 }));
    add('brass', new S({ color: 0xb08d3c, roughness: 0.35, metalness: 0.85 }));
    add('gold', new S({ color: 0xf2c25a, roughness: 0.2, metalness: 1 }));
    add('steel', new S({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.8 }));
    add('galv', new S({ color: 0x8d9094, roughness: 0.45, metalness: 0.65 }));
    add('steelDark', new S({ color: 0x4a4f54, roughness: 0.5, metalness: 0.6 }));
    add('roofDark', new S({ color: 0x7a7e7a, roughness: 0.85 }));
    add('roofBitumen', new S({ color: 0x6f7378, roughness: 0.95 }));
    add('roofRed', new S({ map: tileRoofTexture('lm:tiles'), roughness: 0.8 }));
    add('lamp', new S({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0 }));
    add('concrete', new S({ map: plasterTexture('lm:conc', '#cfcbc3', 0.18, 128, 24), roughness: 0.92 }));
    add('concreteDark', new S({ color: 0x8f8f8b, roughness: 0.92 }));
    add('plasterCream', new S({ map: plasterTexture('lm:cream', '#e4d9bd', 0.1), roughness: 0.9 }));
    add('trimBrown', new S({ color: 0x8b7355, roughness: 0.85 }));
    add('stoneTrim', new S({ map: plasterTexture('lm:trim', '#c8b789', 0.1), roughness: 0.85 }));
    add('stoneLight', new S({ map: plasterTexture('lm:light', '#ece1c6', 0.08), roughness: 0.8 }));
    add('stonePale', new S({ map: plasterTexture('lm:pale', '#d9c797', 0.1), roughness: 0.85 }));
    add('doorDark', new S({ color: 0x2a2623, roughness: 0.6, metalness: 0.2 }));
    add('glassDark', new S({ color: 0x28323a, roughness: 0.15, metalness: 0.4 }));
    add('glass', new THREE.MeshPhysicalMaterial({ color: 0x9fb4bd, roughness: 0.08, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    add('grass', new S({ color: 0x5f8f43, roughness: 1 }));
    add('plaza', new S({ color: 0xaaa69d, roughness: 0.95 }));
    add('paint', new S({ color: 0xffffff, roughness: 0.6 }));
    add('blueStripe', new S({ color: 0x0a4aa0, roughness: 0.5 }));
    add('white', new S({ color: 0xf1f1ec, roughness: 0.55 }));
    add('podiumAl', new S({ color: 0xaab3b8, roughness: 0.4, metalness: 0.5 }));
    add('plantAl', new S({ color: 0x8f979b, roughness: 0.55, metalness: 0.4 }));
    add('roofSteel', new S({ color: 0x8f9599, roughness: 0.5, metalness: 0.45 }));
    add('wpBand', new S({ color: 0x6f7e8c, roughness: 0.6 }));
    add('dark', new S({ color: 0x23272a, roughness: 0.6, metalness: 0.4 }));
  }

  /** A window-grid facade; returns the tile size [w, h] in metres. */
  facade(key, tex, rough = 0.85) {
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: rough });
    this.m[key] = mat;
    mat.userData.tile = [tex.w, tex.h];
    this.night.push(mat);
    return mat.userData.tile;
  }

  curtain(key, spec = {}, name = key) {
    const t = curtainTexture('lm:' + name, spec);
    const mat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3, metalness: 0.15 });
    mat.userData.tile = [t.w, t.h];
    this.m[key] = mat;
    this.night.push(mat);
    return mat.userData.tile;
  }

  stoneWall(key, name, spec) {
    return this.facade(key, facadeTexture('lm:' + name, spec));
  }

  ribbon(key, name, spec) {
    const t = ribbonGlassTexture('lm:' + name, spec);
    const mat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 });
    mat.userData.tile = [t.w, t.h];
    this.m[key] = mat;
    this.night.push(mat);
    return mat.userData.tile;
  }

  panel(key, name, spec) {
    const t = panelTexture('lm:' + name, spec);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
    const tile = [spec.w || 6, spec.h || 6];
    mat.userData.tile = tile;
    this.m[key] = mat;
    return tile;
  }

  setNight(n) {
    const on = n > 0.3 ? 0.8 : 0;
    for (const m of this.night) m.emissiveIntensity = on;
    this.m.lamp.emissiveIntensity = n > 0.3 ? 4 : 0;
  }
}

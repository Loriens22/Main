// Materials of the line-84 battery buses' decals, liveries and fittings (mixed into TrolleyModel; makeMaterials
// calls makeEbusMaterials when the design has its own ends).
import * as THREE from 'three';
import {
  sorFrontTexture, sorCardTexture, sorRearTexture, sorGlassTexture, e12LiveryTexture, e12GlassTexture,
  e12FrontTexture, e12RearTexture, sideNumberTexture, plateTexture,
} from './EbusTextures.js';

const S = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
const decal = (map, o = {}) => new S({ map, transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o });

/** Black-and-yellow striped handrail texture (the SOR's door rails, ref05). */
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f2c414';
  for (let k = -2; k < 4; k++) { g.beginPath(); g.moveTo(k * 32, 64); g.lineTo(k * 32 + 16, 64); g.lineTo(k * 32 + 48, 0); g.lineTo(k * 32 + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 14);
  return t;
}

/** The E12's big rear window: dark glass with rounded upper corners, transparent round it. */
function rearWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 520;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 520);
  const r = 110;
  g.beginPath();
  g.moveTo(14, 510); g.lineTo(14, r + 10); g.quadraticCurveTo(14, 10, r + 14, 10); g.lineTo(1010 - r, 10);
  g.quadraticCurveTo(1010, 10, 1010, r + 10); g.lineTo(1010, 510); g.closePath();
  const gr = g.createLinearGradient(0, 0, 1024, 520);
  gr.addColorStop(0, '#20262c'); gr.addColorStop(0.5, '#090b0d'); gr.addColorStop(1, '#14181c');
  g.fillStyle = gr; g.fill();
  // the white "Wi-Fi zone" sticker at the top centre (ref09)
  g.fillStyle = '#eef0f2'; g.fillRect(420, 60, 120, 100);
  g.fillStyle = '#1d1f22'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('WiFi', 480, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const EbusMaterialsMixin = {
  makeEbusMaterials() {
    const G = this.G, m = this.mats, fleet = this.fleet;
    const fl = this.spec.fleets.find((f) => f.fleet === fleet) || this.spec.fleets[0];
    m.lampBlack = new S({ color: 0x0b0c0e, roughness: 0.35, metalness: 0.2 });
    m.lampBezel = new S({ color: 0xc9cdd1, roughness: 0.18, metalness: 0.9 });
    m.ebusPlate = new S({ map: plateTexture(fl.plate, fl.plateStyle === 'cz' ? 'CZ' : 'BG'), roughness: 0.5 });
    m.clearGrip = new P({ color: 0xe8f2f6, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false });
    m.gripStrap = new S({ color: 0x2b2e33, roughness: 0.8 });
    m.hazardRail = new S({ map: stripeTexture(), roughness: 0.35, metalness: 0.1 });
    m.doorWhite = new S({ color: 0xdfe4e8, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
    m.rail = new S({ color: G.railColor || 0xc9cdd1, roughness: 0.28, metalness: G.livery === 'sor' ? 0.85 : 0.35 });
    m.ebusNumber = decal(sideNumberTexture(fleet, '#ffffff'));
    m.ebusNumberDark = decal(sideNumberTexture(fleet, '#2b2e31'));
    if (G.livery === 'sor') {
      m.ebusFront = decal(sorFrontTexture(fleet));
      m.ebusCard = new S({ map: sorCardTexture('84'), transparent: true, alphaTest: 0.3, roughness: 0.6 }); // printed one side
      m.ebusRear = new P({ map: sorRearTexture(fleet), roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.sorSlogan = decal(sorGlassTexture('slogan'), { roughness: 0.3 });
      m.sorRoundel = decal(sorGlassTexture('roundel'), { roughness: 0.3 });
      m.sorBattery = decal(sorGlassTexture('battery'), { roughness: 0.3 });
    } else {
      const [zA, zB] = this.sideRange('front');
      const doors = this.spec.doors.map((d) => [d.z0 - zA, d.z1 - zA]);
      m.ebusFront = decal(e12FrontTexture(fleet));
      m.ebusRear = decal(e12RearTexture(fleet));
      m.ebusRearWin = new P({ map: rearWindowTexture(), transparent: true, alphaTest: 0.5, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.liveryR = decal(e12LiveryTexture(zB - zA, 1, doors), { roughness: 0.3 });
      m.liveryL = decal(e12LiveryTexture(zB - zA, -1, []), { roughness: 0.3 });
      m.e12en = decal(e12GlassTexture('en'), { roughness: 0.3 });
      m.e12bg = decal(e12GlassTexture('bg'), { roughness: 0.3 });
      m.e12icon = decal(e12GlassTexture('icon'), { roughness: 0.3 });
    }
  },
};

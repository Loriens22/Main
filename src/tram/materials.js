// Materials and small textures for the Pesa Swing 122NaSF tram (Sofia livery).
import * as THREE from 'three';
import * as TX from '../textures.js';
import { makeRng } from '../util.js';

export const TLIV = { white: '#eef0f0', yellow: '#f5a21f', blue: '#1d5cc0', grey: '#b3b8bd', charcoal: '#3f4348' };

/** Vertical livery band: v = y / 3.4 m (white skirt, yellow-orange stripe, cobalt blue body, grey roof). */
function tramBand() {
  const H = 1024;
  const c = TX.makeCanvas(4, H), ctx = c.getContext('2d');
  const y2p = (y) => H - (y / 3.4) * H;
  const band = (y0, y1, col) => { ctx.fillStyle = col; ctx.fillRect(0, y2p(y1), 4, y2p(y0) - y2p(y1)); };
  band(0, 0.8, TLIV.white);
  band(0.8, 1.0, TLIV.yellow);
  band(1.0, 2.93, TLIV.blue);
  band(2.93, 3.4, TLIV.grey);
  // light dirt / water streaks on the lower white skirt
  const g = ctx.createLinearGradient(0, y2p(0.18), 0, y2p(0.75));
  g.addColorStop(0, 'rgba(80,72,60,0.35)'); g.addColorStop(1, 'rgba(80,72,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y2p(0.75), 4, y2p(0.18) - y2p(0.75));
  const t = TX.toTex(c, { repeat: false });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/** Dark blue-grey woven seat cushion with a subtle dotted pattern. */
function tramFabric(size = 256) {
  const rnd = makeRng(123);
  const c = TX.makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#3b4258'; ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, w = ((x + y) % 2) * 9 + ((x >> 1) % 2) * 5 - 7;
    d[i] += w; d[i + 1] += w; d[i + 2] += w + 3;
  }
  ctx.putImageData(img, 0, 0);
  for (let y = 0; y < size; y += 8) for (let x = 0; x < size; x += 8) {
    const r = rnd();
    ctx.fillStyle = r < 0.3 ? '#c86b3a' : r < 0.55 ? '#6c79a8' : r < 0.7 ? '#9aa3b5' : '#262b3b';
    ctx.fillRect(x + ((rnd() * 4) | 0), y + ((rnd() * 4) | 0), 2, 2);
  }
  return TX.toTex(c);
}
/** Charcoal anti-slip floor with a lighter worn aisle and grain. */
function tramFloor(size = 512) {
  const rnd = makeRng(55);
  const c = TX.makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4f55'; ctx.fillRect(0, 0, size, size);
  // lighter worn aisle strip (u across the car)
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0.3, 'rgba(120,128,138,0)'); g.addColorStop(0.42, 'rgba(120,128,138,0.55)'); g.addColorStop(0.58, 'rgba(120,128,138,0.55)'); g.addColorStop(0.7, 'rgba(120,128,138,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 16000; k++) { const r = rnd(); ctx.fillStyle = r < 0.45 ? '#2f3338' : r < 0.8 ? '#7a828b' : '#9ba3ab'; ctx.fillRect(rnd() * size, rnd() * size, 1.2, 1.2); }
  return TX.toTex(c);
}
/** Grey accordion bellows (vertical ribs). */
function bellowsTex() {
  const c = TX.makeCanvas(64, 8), ctx = c.getContext('2d');
  for (let x = 0; x < 64; x++) { const k = 0.5 + 0.5 * Math.cos((x / 64) * Math.PI * 2 * 8); ctx.fillStyle = `rgb(${90 + k * 70 | 0},${94 + k * 70 | 0},${98 + k * 70 | 0})`; ctx.fillRect(x, 0, 1, 8); }
  return TX.toTex(c);
}
/** Louvre grille for the bogie fairings. */
function grilleTex() {
  const c = TX.makeCanvas(128, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#eef0f0'; ctx.fillRect(0, 0, 128, 64);
  for (let y = 8; y < 60; y += 7) { ctx.fillStyle = '#5b6066'; ctx.fillRect(10, y, 108, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(10, y + 3, 108, 1); }
  return TX.toTex(c, { repeat: false });
}

export function makeTramMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const emis = (color, intensity = 0) => std({ color: 0x222222, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.3 });
  const fab = tramFabric(); fab.repeat.set(3, 3);
  const fl = tramFloor(); fl.repeat.set(1, 1);
  const peel = TX.orangePeel(256); peel.repeat.set(3, 3);
  const bel = bellowsTex(); bel.repeat.set(1, 1);
  const M = {
    paint: phys({ name: 'tramPaint', map: tramBand(), roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08, normalMap: peel, normalScale: new THREE.Vector2(0.08, 0.08) }),
    yellow: phys({ name: 'tramYellow', color: TLIV.yellow, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
    blue: phys({ name: 'tramBlue', color: TLIV.blue, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
    white: phys({ name: 'tramWhite', color: TLIV.white, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    grey: std({ name: 'tramGrey', color: TLIV.grey, roughness: 0.45, metalness: 0.35 }),
    roof: std({ name: 'tramRoof', color: 0xa9aeb3, roughness: 0.55, metalness: 0.3 }),
    charcoal: std({ name: 'tramCharcoal', color: TLIV.charcoal, roughness: 0.55 }),
    black: std({ name: 'tramBlack', color: 0x0c0d0f, roughness: 0.3, metalness: 0.1 }),
    rubber: std({ name: 'tramRubber', color: 0x101112, roughness: 0.92 }),
    glassSide: phys({ name: 'tramGlass', color: 0x15202a, roughness: 0.03, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.7 }),
    glassFront: phys({ name: 'tramWind', color: 0xaebfc4, roughness: 0.02, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 }),
    glassTint: phys({ name: 'tramPartition', color: 0x9fbad3, roughness: 0.05, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.35 }),
    chrome: std({ name: 'tramChrome', color: 0xe6e9ec, metalness: 1.0, roughness: 0.12 }),
    steel: std({ name: 'tramSteel', color: 0x55595e, metalness: 0.7, roughness: 0.5 }),
    under: std({ name: 'tramUnder', color: 0x1c1d20, roughness: 0.9 }),
    wheel: std({ name: 'tramWheel', color: 0x5c5a57, metalness: 0.85, roughness: 0.4 }),
    bellows: std({ name: 'tramBellows', map: bel, roughness: 0.75, side: THREE.DoubleSide }),
    bellowsIn: std({ name: 'tramBellowsIn', map: bel, color: 0xc0c4c8, roughness: 0.7, side: THREE.DoubleSide }),
    grille: std({ name: 'tramGrille', map: grilleTex(), roughness: 0.5 }),
    carbon: std({ name: 'carbon', color: 0x222222, roughness: 0.7 }),
    insulator: std({ name: 'insulator', color: 0x6a3a28, roughness: 0.4 }),
    // lamps
    headLo: emis(0xfff4e0, 0), drl: emis(0xf6f9ff, 2.4), indL: emis(0xff8a00, 0), indR: emis(0xff8a00, 0),
    tail: emis(0xff1a10, 0.7), brake: emis(0xff1a10, 0), marker: emis(0xff9a20, 0.9), reverse: emis(0xffffff, 0),
    doorLamp: emis(0x3cff6a, 0),
    // interior
    floor: std({ name: 'tramFloor', map: fl, roughness: 0.85 }),
    wall: std({ name: 'tramWall', color: 0xd4d7d9, roughness: 0.55 }),
    wallDark: std({ name: 'tramWallDark', color: 0x7b8187, roughness: 0.6 }),
    wallDS: std({ name: 'tramWallDS', color: 0xc9cdd0, roughness: 0.55, side: THREE.DoubleSide }),
    ceiling: std({ name: 'tramCeiling', color: 0xeef0f1, roughness: 0.6 }),
    led: std({ name: 'tramLed', color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 1.7, roughness: 0.4 }),
    orange: phys({ name: 'tramOrange', color: 0xf0601a, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    seatShell: std({ name: 'tramSeatShell', color: 0x8e959b, roughness: 0.45 }),
    seatFabric: std({ name: 'tramFabric', map: fab, roughness: 0.97 }),
    seatDark: std({ name: 'tramSeatDark', color: 0x40454a, roughness: 0.55 }),
    validator: std({ name: 'tramValidator', color: 0xf2a313, roughness: 0.4 }),
    red: std({ name: 'tramRed', color: 0xc8161b, roughness: 0.4 }),
    yellowStrip: std({ name: 'tramYellowStrip', color: 0xf1c000, roughness: 0.55 }),
    dash: std({ name: 'tramDash', color: 0x2c3035, roughness: 0.6 }),
    dashDark: std({ name: 'tramDashDark', color: 0x121416, roughness: 0.5 }),
    driverSeat: std({ name: 'tramDriverSeat', color: 0x202226, roughness: 0.9 }),
    screen: std({ name: 'tramScreen', color: 0x050608, roughness: 0.15, emissive: 0x0a2a4a, emissiveIntensity: 0.7 }),
    mirrorGlass: std({ name: 'tramMirror', color: 0x9aa5ad, metalness: 1, roughness: 0.05 }),
  };
  for (const k of ['glassSide', 'glassFront', 'glassTint']) M[k].userData = { cast: false };
  return M;
}

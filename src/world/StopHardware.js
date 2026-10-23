// Route 280 bus-stop hardware (the Sofia municipal standard as far as the research
// found it): modular anthracite-framed shelters (opaque roof, glazed back and one end,
// back-lit city-light ad box on the other end, slat bench, LED departure board), the
// galvanised round stop pole with the blue bus sign, the stop-name plate and the line-280
// plate, litter bins on a post, free-standing benches and slim e-board posts for poles
// without a shelter. Placement follows the research files in data/research/world:
// poles stand 0.55 m behind the kerb of the bus's own carriageway (never in it), shelters
// sit behind the pole with their glass back to the building line.
import * as THREE from 'three';
import { MeshBuilder, makeCanvas, toTexture } from './LandmarkGeometry.js';
import { mulberry32 } from '../core/rng.js';

const WEST = { L: 4.9, D: 1.7, H: 2.5 }; // OSM footprints at Iztok (west half research)
const PLISKA = { L: 6.1, D: 2.1, H: 2.6 }; // OSM footprints at the Pliska stops
const EAST = { L: 4.5, D: 1.6, H: 2.55 }; // east half research: 4-5 m standard module
const SIZE = {
  1697: WEST, 1287: WEST, 1288: WEST, 1696: WEST, 1695: WEST, 1258: WEST, '0494': WEST, '0492': WEST, 2352: WEST, 2351: WEST, '0764': WEST, '0761': WEST,
  2326: PLISKA, 2327: PLISKA,
};

/** Per-stop overrides from stop_furniture.json / stop_<code>.md. */
const OPT = {
  1697: { wall: 0.4 }, // back panel 0.4 m from the university wall
  1287: { behind: 1.5 }, // shelter 1.5 m behind the pole
  1258: { centred: true }, // shelter centred on the pole, on the grass behind the footway
  1288: { maxGap: 4.5 }, // OSM node is 12.8 m off the carriageway beside the Metro lot (lay-by not modelled); kept reachable
  2326: { backLimit: 5.0 }, // strip between carriageway and guard fence
  2327: { backLimit: 5.0 },
  1696: { backLimit: 5.0 },
  1695: { backLimit: 5.0 },
};

const DEST = { A: 'Студентски град', B: 'СУ Св. Кл. Охридски' };

// ------------------------------------------------------------------ textures
function headSignTexture(code) {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#0b4f9c';
  const r = 22, m = 10, w = 256 - 2 * m;
  g.beginPath();
  g.moveTo(m + r, m); g.lineTo(m + w - r, m); g.quadraticCurveTo(m + w, m, m + w, m + r);
  g.lineTo(m + w, m + w - r); g.quadraticCurveTo(m + w, m + w, m + w - r, m + w);
  g.lineTo(m + r, m + w); g.quadraticCurveTo(m, m + w, m, m + w - r);
  g.lineTo(m, m + r); g.quadraticCurveTo(m, m, m + r, m);
  g.fill();
  // bus pictogram (side view)
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(52, 138); g.lineTo(52, 74); g.quadraticCurveTo(52, 62, 66, 62); g.lineTo(186, 62); g.quadraticCurveTo(204, 62, 206, 82); g.lineTo(206, 138); g.closePath();
  g.fill();
  g.fillStyle = '#0b4f9c';
  for (let i = 0; i < 4; i++) g.fillRect(62 + i * 33, 74, 25, 26);
  g.fillRect(168, 74, 28, 44);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(88, 142, 15, 0, 7); g.arc(170, 142, 15, 0, 7); g.fill();
  g.fillStyle = '#0b4f9c';
  g.beginPath(); g.arc(88, 142, 7, 0, 7); g.arc(170, 142, 7, 0, 7); g.fill();
  g.fillStyle = '#fff';
  g.font = '700 56px Roboto, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(code), 128, 204);
  return toTexture(c, { repeat: false, aniso: 8 });
}

function wrapName(name, max = 17) {
  const words = name.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length <= max || !cur) lines[lines.length - 1] = (cur + ' ' + w).trim();
    else lines.push(w);
  }
  return lines.slice(0, 3);
}

const NAME_TEX = new Map();
function namePlateTexture(name) {
  if (NAME_TEX.has(name)) return NAME_TEX.get(name);
  const t = makeNamePlate(name);
  NAME_TEX.set(name, t);
  return t;
}

function makeNamePlate(name) {
  const [c, g] = makeCanvas(512, 240);
  g.fillStyle = '#fafaf7';
  g.fillRect(0, 0, 512, 240);
  g.strokeStyle = '#15171a';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 500, 228);
  const lines = wrapName(name);
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = lines.length > 2 ? 62 : 76;
  let size = lines.length > 2 ? 52 : 62;
  g.font = `700 ${size}px Roboto, Arial, sans-serif`;
  while (Math.max(...lines.map((l) => g.measureText(l).width)) > 470 && size > 20) { size -= 2; g.font = `700 ${size}px Roboto, Arial, sans-serif`; }
  lines.forEach((l, i) => g.fillText(l, 256, 120 + (i - (lines.length - 1) / 2) * lh));
  return toTexture(c, { repeat: false, aniso: 8 });
}

function linePlateTexture() {
  const [c, g] = makeCanvas(256, 192);
  g.fillStyle = '#fafaf7';
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#c8102e';
  g.lineWidth = 14;
  g.strokeRect(10, 10, 236, 172);
  g.fillStyle = '#111';
  g.font = '700 104px Roboto, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('280', 128, 100);
  return toTexture(c, { repeat: false, aniso: 8 });
}

const AD_TEX = new Map();
export function adTexture(seed) {
  // generic city / nature posters (no third-party brands); five themes shared by all stops
  const theme = Math.floor(mulberry32(seed * 7 + 3)() * 5);
  if (!AD_TEX.has(theme)) AD_TEX.set(theme, makeAd(theme));
  return AD_TEX.get(theme);
}

function makeAd(seed) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const themes = [
    ['#1d5e8c', '#7fb8d8', 'Витоша', 'Природен парк'], ['#3a7d34', '#a7d48a', 'Борисова градина', 'Зелена София'],
    ['#8c2f1d', '#e8a87c', 'Театър', 'Сезон 2026/27'], ['#2d2d6b', '#9c8be0', 'Музика в парка', 'Всеки петък'],
    ['#0f6b5e', '#7fd8c4', 'Карай колело', 'Велоалеи в София'],
  ];
  const th = themes[seed % themes.length];
  const grd = g.createLinearGradient(0, 0, 0, 384);
  grd.addColorStop(0, th[1]);
  grd.addColorStop(1, th[0]);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(0, 300);
  for (let x = 0; x <= 256; x += 16) g.lineTo(x, 230 - Math.sin(x * 0.03 + r() * 3) * 40 - r() * 20);
  g.lineTo(256, 384);
  g.lineTo(0, 384);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 34px Roboto, Arial';
  g.textAlign = 'center';
  g.fillText(th[2], 128, 80);
  g.font = '22px Roboto, Arial';
  g.fillText(th[3], 128, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** LED board: black face, amber text. Returns {tex, draw(mins)} */
function boardTexture(st, dirId) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (mins) => {
    g.fillStyle = '#060606';
    g.fillRect(0, 0, 384, 128);
    g.fillStyle = '#ffae1a';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = '700 22px "Arial Narrow", Arial, sans-serif';
    g.fillText(`${st.code}`, 14, 20);
    g.textAlign = 'right';
    g.fillText(st.name.length > 26 ? st.name.slice(0, 25) + '…' : st.name, 372, 20);
    g.fillStyle = 'rgba(255,174,26,0.35)';
    g.fillRect(12, 38, 360, 2);
    g.fillStyle = '#ffae1a';
    g.textAlign = 'left';
    g.font = '700 46px "Arial Narrow", Arial, sans-serif';
    g.fillText('280', 14, 82);
    g.font = '700 25px "Arial Narrow", Arial, sans-serif';
    g.fillText(DEST[dirId], 100, 72);
    g.textAlign = 'right';
    g.font = '700 46px "Arial Narrow", Arial, sans-serif';
    g.fillText(mins <= 0 ? 'сега' : `${mins} мин`, 372, 108);
    // dot-matrix scan lines
    g.fillStyle = 'rgba(0,0,0,0.30)';
    for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 384, 1);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

function tactileTexture() {
  // yellow tactile paving: truncated-dome grid, 0.4 m tile
  const [c, g] = makeCanvas(64, 64);
  g.fillStyle = '#d8b72a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b8971a';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(8 + i * 16, 8 + j * 16, 4.5, 0, 7); g.fill(); }
  g.fillStyle = '#ecd35a';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(7 + i * 16, 7 + j * 16, 2.2, 0, 7); g.fill(); }
  const t = toTexture(c, { aniso: 4 });
  return t;
}

// ------------------------------------------------------------------ materials
function sharedMaterials() {
  const S = THREE.MeshStandardMaterial;
  return {
    frame: new S({ color: 0x3c4146, roughness: 0.5, metalness: 0.55 }),
    roofTop: new S({ color: 0x4a4f54, roughness: 0.7, metalness: 0.2 }),
    roofUnder: new S({ color: 0xd8d8d4, roughness: 0.8 }),
    galv: new S({ color: 0x8d9094, roughness: 0.42, metalness: 0.65 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xb9cdd4, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    slat: new S({ color: 0x6b5a46, roughness: 0.8 }),
    bin: new S({ color: 0x2f4a38, roughness: 0.55, metalness: 0.3 }),
    binDark: new S({ color: 0x1d1f21, roughness: 0.6, metalness: 0.4 }),
    led: new S({ color: 0x15171a, roughness: 0.5, metalness: 0.3 }),
    concrete: new S({ color: 0x9a9893, roughness: 0.95 }),
    line: new S({ map: linePlateTexture(), roughness: 0.45, metalness: 0.2 }),
    tactile: new S({ map: tactileTexture(), roughness: 0.8 }),
    // night: under-roof LED strip (only on lit stops)
    stripOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 0, roughness: 0.5 }),
    stripOff: new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.6 }),
  };
}

// ------------------------------------------------------------------ geometry
/** Sign plate sandwich on the pole axis: faces on +-x, centre y, width along z. */
function plate(b, k, y, w, h, t = 0.07) {
  b.box('galv', 0, y - h / 2, 0, t, h, w, 0, { top: false, sides: 'nsew' });
  // face towards -x (approaching bus): right-hand screen side is +z
  b.quad(k, [-t / 2 - 0.002, y - h / 2, -w / 2], [-t / 2 - 0.002, y - h / 2, w / 2], [-t / 2 - 0.002, y + h / 2, w / 2], [-t / 2 - 0.002, y + h / 2, -w / 2]);
  // face towards +x: right-hand screen side is -z
  b.quad(k, [t / 2 + 0.002, y - h / 2, w / 2], [t / 2 + 0.002, y - h / 2, -w / 2], [t / 2 + 0.002, y + h / 2, -w / 2], [t / 2 + 0.002, y + h / 2, w / 2]);
}

function pole(b, z = 0, H = 3.2) {
  b.cyl('galv', 0, -0.35, z, 0.034, 0.034, H + 0.35, 10);
  b.cyl('concrete', 0, -0.02, z, 0.09, 0.1, 0.05, 10);
  b.cyl('galv', 0, H, z, 0.04, 0.034, 0.03, 10);
}

function eboardPanel(b, x, y, z) {
  // double-faced LED panel 0.95 x 0.30, hung at (x, y, z), faces +-x
  const w = 0.95, h = 0.3, t = 0.08;
  b.box('led', x, y - h / 2, z, t, h, w, 0, { top: true });
  b.quad('boardF', [x - t / 2 - 0.002, y - h / 2, z - w / 2], [x - t / 2 - 0.002, y - h / 2, z + w / 2], [x - t / 2 - 0.002, y + h / 2, z + w / 2], [x - t / 2 - 0.002, y + h / 2, z - w / 2]);
  b.quad('boardF', [x + t / 2 + 0.002, y - h / 2, z + w / 2], [x + t / 2 + 0.002, y - h / 2, z - w / 2], [x + t / 2 + 0.002, y + h / 2, z - w / 2], [x + t / 2 + 0.002, y + h / 2, z + w / 2]);
}

function shelterGeo(b, sp, o) {
  const { L, D, H } = sp;
  const n = Math.round(L / 1.6);
  const bw = L / n;
  const zb = D / 2 - 0.05, zf = -D / 2 + 0.05;
  // roof slab: front overhang 0.2 over the pavement, 0.1 to the back
  b.box('roofTop', 0, H, -0.05, L + 0.3, 0.14, D + 0.3, 0, { top: true });
  b.quad('roofUnder', [-L / 2 - 0.14, H - 0.001, D / 2 + 0.08], [-L / 2 - 0.14, H - 0.001, -D / 2 - 0.18], [L / 2 + 0.14, H - 0.001, -D / 2 - 0.18], [L / 2 + 0.14, H - 0.001, D / 2 + 0.08]);
  // front fascia
  b.box('frame', 0, H - 0.1, -D / 2 - 0.19, L + 0.3, 0.22, 0.04, 0, {});
  // posts
  for (let i = 0; i <= n; i++) b.box('frame', -L / 2 + i * bw, -0.3, zb, 0.07, H + 0.3, 0.07, 0, {});
  b.box('frame', -L / 2, -0.3, zf, 0.07, H + 0.3, 0.07, 0, {});
  b.box('frame', L / 2, -0.3, zf, 0.07, H + 0.3, 0.07, 0, {});
  // back glazing + kick rail + top rail
  for (let i = 0; i < n; i++) {
    const cx = -L / 2 + (i + 0.5) * bw;
    b.quad('glass', [cx - bw / 2 + 0.04, 0.16, zb], [cx + bw / 2 - 0.04, 0.16, zb], [cx + bw / 2 - 0.04, H - 0.18, zb], [cx - bw / 2 + 0.04, H - 0.18, zb]);
  }
  b.box('frame', 0, 0.0, zb, L, 0.16, 0.05, 0, {});
  b.box('frame', 0, H - 0.18, zb, L, 0.06, 0.05, 0, {});
  // glazed end panel at the front (+x) end
  b.quad('glass', [L / 2, 0.16, zf + 0.04], [L / 2, 0.16, zb - 0.04], [L / 2, H - 0.18, zb - 0.04], [L / 2, H - 0.18, zf + 0.04]);
  b.box('frame', L / 2, 0.0, 0, 0.05, 0.16, D - 0.1, 0, {});
  // back-lit ad box at the trailing end (-x): faces +-x
  const aw = Math.min(1.25, D - 0.3), ah = 1.75, ay = 0.22;
  b.box('frame', -L / 2, ay, 0.02, 0.15, ah, aw + 0.08, 0, { top: true });
  b.quad('adA', [-L / 2 - 0.077, ay + 0.04, 0.02 - aw / 2], [-L / 2 - 0.077, ay + 0.04, 0.02 + aw / 2], [-L / 2 - 0.077, ay + ah - 0.04, 0.02 + aw / 2], [-L / 2 - 0.077, ay + ah - 0.04, 0.02 - aw / 2]);
  b.quad('adB', [-L / 2 + 0.077, ay + 0.04, 0.02 + aw / 2], [-L / 2 + 0.077, ay + 0.04, 0.02 - aw / 2], [-L / 2 + 0.077, ay + ah - 0.04, 0.02 - aw / 2], [-L / 2 + 0.077, ay + ah - 0.04, 0.02 + aw / 2]);
  // under-roof LED strip
  b.box(o.lit ? 'stripOn' : 'stripOff', 0, H - 0.03, -0.05, L - 0.5, 0.02, 0.18, 0, { sides: '', top: false, bottom: true });
  // bench against the back glass
  if (o.bench) {
    const bx = L > 5.5 ? 0.6 : 0.5;
    for (const dz of [-0.14, 0, 0.14]) b.box('slat', bx, 0.43, zb - 0.28 + dz, 1.8, 0.04, 0.11, 0, {});
    b.box('slat', bx, 0.62, zb - 0.1, 1.8, 0.12, 0.03, 0, {});
    for (const dx of [-0.8, 0.8]) b.box('frame', bx + dx, 0, zb - 0.26, 0.05, 0.43, 0.4, 0, {});
    b.box('frame', bx, 0.45, zb - 0.07, 1.8, 0.03, 0.03, 0, {});
  }
  // LED departure board hung from the roof at the front end, facing inwards / outwards
  if (o.board) {
    eboardPanel(b, L / 2 - 0.35, 2.05, zf + 0.55);
    b.box('frame', L / 2 - 0.35, 2.2, zf + 0.55 - 0.3, 0.02, 0.3, 0.02, 0, {});
    b.box('frame', L / 2 - 0.35, 2.2, zf + 0.55 + 0.3, 0.02, 0.3, 0.02, 0, {});
  }
}

function binGeo(b, x, z) {
  b.cyl('galv', x, -0.2, z, 0.025, 0.025, 1.25, 8);
  b.cyl('bin', x, 0.55, z + 0.0, 0.2, 0.19, 0.42, 12);
  b.cyl('binDark', x, 0.96, z, 0.215, 0.215, 0.04, 12);
  b.cyl('binDark', x, 0.5, z, 0.205, 0.205, 0.04, 12);
}

function benchGeo(b, x, z) {
  // free-standing 1.8 m slat bench, seat towards the road (-z), back-rest towards the pavement
  for (const dz of [-0.14, 0, 0.14]) b.box('slat', x, 0.45, z + dz, 1.8, 0.04, 0.12, 0, {});
  for (const dy of [0.7, 0.85]) b.box('slat', x, dy, z + 0.2, 1.8, 0.1, 0.03, 0, {});
  for (const dx of [-0.8, 0.8]) {
    b.box('frame', x + dx, 0, z, 0.05, 0.45, 0.42, 0, {});
    b.box('frame', x + dx, 0.45, z + 0.2, 0.05, 0.45, 0.04, 0, {});
  }
}

// ------------------------------------------------------------------ placement
/** Pavement surface height at (x, z) next to the kerb at (kx, kz); sidewalks are flat at kerb height. */
function surfaceY(sf, x, z, kx, kz, gap, swW) {
  const yK = sf.y(kx, kz) + 0.22;
  const yH = sf.y(x, z);
  return gap <= swW + 0.2 ? Math.max(yK, yH) : yH + 0.02;
}

export function buildStopHardware(sf) {
  const world = sf.world, route = sf.route;
  const out = [];
  const seen = new Set();
  const shared = sharedMaterials();
  sf.stopObjects = [];
  sf.boards = sf.boards || new Map();
  sf.adMats = [];
  sf.stopStrips = [shared.stripOn];
  const sw = world.roadBuilder && world.roadBuilder.sidewalkInfo ? world.roadBuilder.sidewalkInfo : [];
  for (const dir of Object.values(route.dirs)) {
    for (const st of dir.stops) {
      if (seen.has(st.code)) continue;
      seen.add(st.code);
      const opt = OPT[st.code] || {};
      const [opx, opz] = st.pole;
      const near = dir.path.nearest(opx, opz);
      const P = dir.path.at(near.s, {});
      const tg = dir.path.tangent(near.s, 5, {});
      const fx = tg.tx, fz = tg.tz;
      const rx = -fz, rz = fx; // right of travel = away from the road at a right-hand stop
      // the bus's own carriageway at the stop
      const q = world.roads.query(P.x, P.z, 8, (p) => !p.driveway);
      const hw = q ? q.piece.hw : 3.0;
      const kx = P.x + rx * hw, kz = P.z + rz * hw;
      // pole: at the mapped position, but never closer than 0.55 m behind the kerb
      const gapOsm = near.d - hw;
      let lat = gapOsm < 0.4 ? hw + 0.55 : Math.min(near.d, hw + (opt.maxGap ?? 5.0));
      // pavement width at the kerb (for the surface height)
      let swW = 3.0;
      for (const s of sw) {
        if (q && s.piece === q.piece && !s.median) {
          const pts = s.pts;
          for (let i = 0; i < pts.length; i += 2) if (Math.hypot(pts[i] - P.x, pts[i + 1] - P.z) < 12) { swW = s.width; i = pts.length; }
        }
      }
      const polX = P.x + rx * lat, polZ = P.z + rz * lat;
      const py = surfaceY(sf, polX, polZ, kx, kz, lat - hw, swW);
      const yaw = Math.atan2(-fz, fx);
      const g = new THREE.Group();
      g.name = `stop:${Math.floor(polX / 256)},${Math.floor(polZ / 256)}`;
      const b = new MeshBuilder();
      b.push(polX, py, polZ, yaw);
      const mats = { ...shared };
      mats.head = new THREE.MeshStandardMaterial({ map: headSignTexture(st.code), roughness: 0.4, metalness: 0.25 });
      mats.nameP = new THREE.MeshStandardMaterial({ map: namePlateTexture(st.name), roughness: 0.45, metalness: 0.2 });
      // ---- accessible stop (OSM wheelchair=yes): raised kerb block and a tactile guidance strip along the boarding edge
      if (st.wheelchair === 'yes') {
        const kz = hw - lat; // local z of the kerb line
        b.box('concrete', -3.5, 0.0, kz + 0.17, 12.0, 0.09, 0.34, 0, { tw: 4, th: 4 });
        const z0 = kz + 0.4, z1 = kz + 0.8, x0 = -9.5, x1 = 2.5, yy = 0.015;
        b.quad('tactile', [x0, yy, z1], [x1, yy, z1], [x1, yy, z0], [x0, yy, z0], [[0, 0], [(x1 - x0) / 0.4, 0], [(x1 - x0) / 0.4, 1], [0, 1]]);
      }
      // ---- pole + plates
      pole(b);
      plate(b, 'head', 2.93, 0.45, 0.45);
      plate(b, 'nameP', 2.48, 0.6, 0.28);
      plate(b, 'line', 2.2, 0.3, 0.225);
      // ---- shelter
      const so = { code: st.code, shelter: null, dir: [fx, fz], out: [rx, rz], pole: [polX, polZ] };
      let boardOnPost = st.departuresBoard && !st.shelter;
      let shelterPos = null;
      if (st.shelter) {
        const sp = SIZE[st.code] || EAST;
        let front = Math.max(lat + 0.1, hw + 0.9);
        // building line behind the stop
        const wd = world.bgrid.raycast(kx, kz, rx, rz, 16);
        const wallLat = wd < 16 ? hw + wd : Infinity;
        if (opt.wall != null && wallLat < Infinity) front = Math.max(hw + 0.9, wallLat - opt.wall - sp.D + 0.05);
        else if (front + sp.D + 0.25 > wallLat) front = Math.max(hw + 0.7, wallLat - sp.D - 0.3);
        if (opt.backLimit != null) front = Math.min(front, hw + opt.backLimit - sp.D);
        const dz = front + sp.D / 2 - lat; // local z of the shelter centre (away from the road)
        const along = opt.centred ? 0 : -(sp.L / 2 + (opt.behind ?? 0.6));
        b.push(along, 0, dz, 0);
        shelterGeo(b, sp, { bench: st.bench, board: !!st.departuresBoard, lit: st.lit !== false });
        b.pop();
        const sx = polX + fx * along + rx * dz, sz = polZ + fz * along + rz * dz;
        shelterPos = [sx, py, sz];
        so.shelter = shelterPos;
        so.len = sp.L;
        so.depth = sp.D;
        // keep lamps, trees and other props off the shelter
        if (sf.sweep) sf.sweep.addBox(sx, sz, fx, fz, sp.L / 2 + 0.25, sp.D / 2 + 0.3);
        // two ad posters for this shelter (light boxes)
        mats.adA = new THREE.MeshStandardMaterial({ map: adTexture(Number(st.code)), emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.5 });
        mats.adA.emissiveMap = mats.adA.map;
        mats.adB = new THREE.MeshStandardMaterial({ map: adTexture(Number(st.code) + 7), emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.5 });
        mats.adB.emissiveMap = mats.adB.map;
        if (st.lit !== false) sf.adMats.push(mats.adA, mats.adB);
      }
      // ---- e-board: on the shelter when there is one, else on a slim post by the pole
      if (st.departuresBoard) {
        const bt = boardTexture(st, dir.id);
        bt.draw(2 + (Number(st.code) % 9));
        sf.boards.set(st.code, { draw: bt.draw, last: null });
        mats.boardF = new THREE.MeshBasicMaterial({ map: bt.tex, color: new THREE.Color(1.5, 1.5, 1.5) });
      }
      if (boardOnPost) {
        // slim 2.6 m post 1.0 m behind the pole, panel hung on it
        b.push(-1.0, 0, 0.1, 0);
        b.cyl('galv', 0, -0.3, 0, 0.03, 0.03, 2.75, 8);
        eboardPanel(b, 0, 2.3, 0);
        b.pop();
        if (sf.sweep) sf.sweep.addBox(polX - fx * 1.0 + rx * 0.1, polZ - fz * 1.0 + rz * 0.1, fx, fz, 0.5, 0.3);
      }
      // ---- bin (OSM bin=yes): beside the pole, ahead of it, off the bus's sweep
      if (st.bin) {
        let bz = Math.max(0.35, hw + 1.15 - lat);
        let ok = false;
        const ba = st.shelter ? 1.5 : 1.7;
        for (let k = 0; k < 5 && !ok; k++, bz += 0.4) {
          const bx = polX + fx * ba + rx * bz, bzw = polZ + fz * ba + rz * bz;
          if (!sf.blocked(bx, bzw, 0.25)) { ok = true; break; }
        }
        b.push(ba, 0, bz, 0);
        binGeo(b, 0, 0);
        b.pop();
        if (sf.sweep) sf.sweep.addBox(polX + fx * ba + rx * bz, polZ + fz * ba + rz * bz, fx, fz, 0.3, 0.3);
      }
      // ---- free-standing bench where the stop has a bench but no shelter (0742)
      if (st.bench && !st.shelter) {
        const bz = Math.max(0.55, hw + 1.1 - lat + 0.25);
        b.push(-2.2, 0, bz, 0);
        benchGeo(b, 0, 0);
        b.pop();
        if (sf.sweep) sf.sweep.addBox(polX - fx * 2.2 + rx * bz, polZ - fz * 2.2 + rz * bz, fx, fz, 1.0, 0.35);
      }
      b.pop();
      for (const m of b.meshes(mats)) g.add(m);
      out.push(g);
      if (sf.sweep) sf.sweep.addBox(polX, polZ, fx, fz, 0.2, 0.2);
      sf.stopObjects.push(so);
    }
  }
  return out;
}

// Canvas textures of the two line-84 battery buses: decals, liveries, lettering and number plates, drawn from the
// reference photographs (data/research/ref_photos/line84). Manufacturer logos are not reproduced: the badges are
// plain round emblems and the lettering is set in a generic typeface. The Sofia arms are a simplified quartered
// shield with a mural crown, not the official drawing.
import * as THREE from 'three';

const FONT = 'Arial, "DejaVu Sans", "Liberation Sans", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { aniso = 8, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Plain round chrome emblem (no maker's mark). */
function badge(g, x, y, r, dark = '#1c1f23') {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.55, '#c6cacf');
  gr.addColorStop(1, '#7d8389');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = dark;
  g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d7dadd';
  g.lineWidth = r * 0.16;
  g.beginPath(); g.arc(x, y + r * 0.1, r * 0.4, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.beginPath(); g.arc(x, y + r * 0.45, r * 0.4, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
}

/** Accessibility pictograms on blue discs (wheelchair, pushchair, person), as stuck on the windscreens. */
export function pictograms(g, x, y, d) {
  const icons = ['wheel', 'person', 'pram'];
  icons.forEach((k, i) => {
    const cx = x + i * (d * 1.12) + d / 2, cy = y + d / 2;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, d * 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e5fbf'; g.beginPath(); g.arc(cx, cy, d * 0.44, 0, Math.PI * 2); g.fill();
    g.strokeStyle = g.fillStyle = '#ffffff';
    g.lineWidth = d * 0.07;
    if (k === 'wheel') {
      g.beginPath(); g.arc(cx - d * 0.02, cy + d * 0.12, d * 0.17, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx - d * 0.08, cy - d * 0.24, d * 0.06, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx - d * 0.08, cy - d * 0.15); g.lineTo(cx - d * 0.06, cy + d * 0.05); g.lineTo(cx + d * 0.14, cy + d * 0.05); g.lineTo(cx + d * 0.2, cy + d * 0.22); g.stroke();
    } else if (k === 'person') {
      g.beginPath(); g.arc(cx, cy - d * 0.24, d * 0.07, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx, cy - d * 0.14); g.lineTo(cx, cy + d * 0.08); g.moveTo(cx - d * 0.12, cy - d * 0.06); g.lineTo(cx + d * 0.12, cy - d * 0.06);
      g.moveTo(cx, cy + d * 0.08); g.lineTo(cx - d * 0.09, cy + d * 0.28); g.moveTo(cx, cy + d * 0.08); g.lineTo(cx + d * 0.09, cy + d * 0.28); g.stroke();
    } else {
      g.beginPath(); g.arc(cx - d * 0.02, cy - d * 0.02, d * 0.17, Math.PI, Math.PI * 2.05); g.closePath(); g.fill();
      g.beginPath(); g.arc(cx - d * 0.13, cy + d * 0.24, d * 0.05, 0, Math.PI * 2); g.arc(cx + d * 0.1, cy + d * 0.24, d * 0.05, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx + d * 0.15, cy - d * 0.02); g.lineTo(cx + d * 0.25, cy - d * 0.2); g.stroke();
    }
  });
}

/** Simplified arms of Sofia: a quartered shield under a mural crown (not the official drawing). */
export function crest(g, x, y, w) {
  const h = w * 1.25;
  g.fillStyle = '#9a9ea4';
  for (let k = 0; k < 3; k++) g.fillRect(x + w * (0.12 + k * 0.29), y, w * 0.18, h * 0.16);
  g.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.1);
  const sy = y + h * 0.22, sh = h * 0.78;
  g.save();
  g.beginPath();
  g.moveTo(x, sy); g.lineTo(x + w, sy); g.lineTo(x + w, sy + sh * 0.55);
  g.quadraticCurveTo(x + w, sy + sh, x + w / 2, sy + sh); g.quadraticCurveTo(x, sy + sh, x, sy + sh * 0.55);
  g.closePath();
  g.clip();
  const q = [['#c8272f', x, sy], ['#1f5fae', x + w / 2, sy], ['#2f8f4a', x, sy + sh / 2], ['#e8b923', x + w / 2, sy + sh / 2]];
  for (const [col, qx, qy] of q) { g.fillStyle = col; g.fillRect(qx, qy, w / 2, sh / 2); }
  g.fillStyle = '#f2efe6';
  g.fillRect(x + w * 0.16, sy + sh * 0.12, w * 0.18, sh * 0.26); // church
  g.beginPath(); g.moveTo(x + w * 0.62, sy + sh * 0.4); g.lineTo(x + w * 0.75, sy + sh * 0.12); g.lineTo(x + w * 0.88, sy + sh * 0.4); g.fill(); // mountain
  g.restore();
  g.strokeStyle = '#d4a52b';
  g.lineWidth = w * 0.05;
  g.beginPath();
  g.moveTo(x, sy); g.lineTo(x + w, sy); g.lineTo(x + w, sy + sh * 0.55);
  g.quadraticCurveTo(x + w, sy + sh, x + w / 2, sy + sh); g.quadraticCurveTo(x, sy + sh, x, sy + sh * 0.55);
  g.closePath(); g.stroke();
}

/** EU-style number plate: white with the blue band (country code), black characters. */
export function plateTexture(text, country = 'BG') {
  const c = canvas(512, 112), g = c.getContext('2d');
  g.fillStyle = '#f4f5f2'; roundRect(g, 2, 2, 508, 108, 10); g.fill();
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 4; roundRect(g, 4, 4, 504, 104, 9); g.stroke();
  g.fillStyle = '#1846a6'; g.fillRect(6, 6, 58, 100);
  g.strokeStyle = '#f3cf1c'; g.lineWidth = 3;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.arc(35 + Math.cos(a) * 15, 36 + Math.sin(a) * 15, 2, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#ffffff'; g.font = `bold 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(country, 35, 84);
  g.fillStyle = '#111111'; g.font = `bold 74px ${FONT}`;
  g.fillText(text, 288, 60, 420);
  return tex(c);
}

// ------------------------------------------------------------------ SOR EBN 11
/** Front mask decal (x -1..1 m, y 0.8..1.3 m): silver crescent, round emblem, fleet number (ref03). */
export function sorFrontTexture(fleet) {
  const c = canvas(1024, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  const gr = g.createLinearGradient(0, 100, 0, 240);
  gr.addColorStop(0, '#eef0f1'); gr.addColorStop(0.5, '#c9cdd1'); gr.addColorStop(1, '#a9aeb3');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(130, 98);
  g.quadraticCurveTo(512, 372, 894, 98);
  g.quadraticCurveTo(512, 240, 130, 98);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(140, 104); g.quadraticCurveTo(512, 246, 884, 104); g.stroke();
  badge(g, 512, 150, 26);
  g.fillStyle = '#ffffff';
  g.font = `bold 62px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText(fleet, 36, 216);
  return tex(c);
}

/** Inside the windscreen, lower left: the route card and the accessibility pictograms (ref03). */
export function sorCardTexture(route = '84') {
  const c = canvas(256, 192), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 192);
  g.fillStyle = '#f7f6f0'; g.fillRect(40, 4, 150, 104);
  g.fillStyle = '#111'; g.font = `bold 88px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(route, 115, 60);
  pictograms(g, 8, 118, 66);
  return tex(c);
}

/** The rear glazed panel (x -1.02..1.02 m, y 0.98..2.6 m): silver frame, black glass, lettering (ref04). */
export function sorRearTexture(fleet) {
  const W = 1024, H = 816, c = canvas(W, H), g = c.getContext('2d');
  const s = W / 2.04; // px per metre
  g.fillStyle = '#bfc3c7'; roundRect(g, 0, 0, W, H, 0.16 * s); g.fill();
  const f = 0.05 * s;
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#15191d'); gr.addColorStop(0.45, '#07090b'); gr.addColorStop(1, '#101317');
  g.fillStyle = gr; roundRect(g, f, f, W - 2 * f, H - 2 * f, 0.12 * s); g.fill();
  const yOf = (m) => (2.6 - m) * s;
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = `bold ${0.075 * s}px ${FONT}`; g.textAlign = 'left';
  g.fillText('ELEKTROBUS', 0.22 * s, yOf(2.24));
  g.font = `900 ${0.17 * s}px ${FONT}`;
  g.fillText('SOR', 0.3 * s, yOf(2.06), 0.62 * s);
  // battery icon
  const bx = 1.32 * s, by = yOf(2.12), bw = 0.3 * s, bh = 0.12 * s;
  g.strokeStyle = '#ffffff'; g.lineWidth = 0.014 * s; roundRect(g, bx, by, bw, bh, 0.015 * s); g.stroke();
  g.fillRect(bx + bw, by + bh * 0.3, 0.02 * s, bh * 0.4);
  for (let k = 0; k < 4; k++) g.fillRect(bx + 0.03 * s + k * 0.065 * s, by + 0.022 * s, 0.045 * s, bh - 0.044 * s);
  // speed limit sticker and the small type / fleet lettering
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0.24 * s, yOf(1.62), 0.07 * s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d0202a'; g.lineWidth = 0.016 * s; g.beginPath(); g.arc(0.24 * s, yOf(1.62), 0.06 * s, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111'; g.font = `bold ${0.06 * s}px ${FONT}`; g.textAlign = 'center'; g.fillText('80', 0.24 * s, yOf(1.62));
  g.fillStyle = '#d7dbe0'; g.font = `${0.04 * s}px ${FONT}`; g.textAlign = 'right';
  g.fillText('SOR  EBN 11', 1.88 * s, yOf(1.62));
  g.fillStyle = '#ffffff'; g.font = `bold ${0.06 * s}px ${FONT}`;
  g.fillText(fleet, 1.88 * s, yOf(1.52));
  return tex(c);
}

/** Lettering on the SOR's left windows (ref02, ref04): the slogan, the ELEKTROBUS roundel, the battery icon. */
export function sorGlassTexture(kind) {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'slogan') {
    g.font = `italic bold 44px ${FONT}`;
    g.fillText('Myslím na přírodu,', 256, 100, 480);
    g.fillText('jezdím bez emisí.', 256, 156, 480);
  } else if (kind === 'roundel') {
    g.fillStyle = '#3db04b'; g.beginPath(); g.arc(256, 92, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.beginPath(); g.arc(256, 92, 34, Math.PI * 0.75, Math.PI * 2.1); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `bold 46px ${FONT}`; g.fillText('ELEKTROBUS', 256, 204, 480);
  } else {
    g.fillStyle = '#f4f4f2'; roundRect(g, 120, 60, 272, 136, 18); g.fill();
    g.fillStyle = '#111'; roundRect(g, 140, 84, 220, 88, 10); g.fill();
    g.fillStyle = '#f4f4f2'; g.fillRect(360, 108, 16, 40);
    for (let k = 0; k < 4; k++) g.fillRect(152 + k * 52, 96, 38, 64);
  }
  return tex(c);
}

// ------------------------------------------------------------------ Yutong E12
const LEAF = ['#12366e', '#1d4f9e', '#2f8fc0', '#46b5bd', '#8fd3d2', '#2a76b6'];

/** One leaf: a pointed oval with a white midrib, centre (x, y), length L, width W, angle a. */
function leaf(g, x, y, L, W, a, col, rib = true) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-L / 2, 0);
  g.bezierCurveTo(-L / 4, -W, L / 4, -W, L / 2, 0);
  g.bezierCurveTo(L / 4, W, -L / 4, W, -L / 2, 0);
  g.fill();
  if (rib) {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(2, W * 0.08);
    g.beginPath(); g.moveTo(-L * 0.42, 0); g.quadraticCurveTo(0, -W * 0.18, L * 0.42, 0); g.stroke();
  }
  g.restore();
}

/** A drop: a round end tapering to a point. */
function drop(g, x, y, r, a, col) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = col;
  g.beginPath();
  g.arc(0, 0, r, Math.PI * 0.15, Math.PI * 1.85);
  g.lineTo(r * 1.9, 0);
  g.closePath();
  g.fill();
  g.restore();
}

/**
 * Leaf band of the lower body (ref07-ref09) for one side: u = 0..1 along the side (front to rear), v = 0 at the
 * skirt (0.3 m) to 1 at the belt (1.22 m). Clusters of large leaves under the windows between the doors, smaller
 * drops scattered below and between them; the two sides are drawn with different seeds, like the real wraps.
 */
export function e12LiveryTexture(len, side, doors = []) {
  const ppm = 300, W = Math.round(len * ppm), H = Math.round(0.92 * ppm);
  const c = canvas(Math.min(4096, W), H), g = c.getContext('2d');
  const k = c.width / W;
  g.clearRect(0, 0, c.width, H);
  g.scale(k, 1);
  const R = rng(side > 0 ? 8807 : 2808);
  const yOf = (m) => H - (m - 0.3) * ppm;
  // cluster centres: under the windows between the openings (doors), avoiding the doors themselves
  const blocked = (u) => doors.some(([a, b]) => u * len > a - 0.1 && u * len < b + 0.1);
  for (let x = 0.35; x < len - 0.3; x += 0.55 + R() * 0.75) {
    if (blocked(x / len)) continue;
    const n = 3 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const L = (0.38 + R() * 0.6) * ppm, Wd = L * (0.24 + R() * 0.12);
      const cx = (x + (R() - 0.5) * 0.8) * ppm, cy = yOf(0.86 + R() * 0.34);
      if (blocked(cx / ppm / len)) continue;
      leaf(g, cx, cy, L, Wd, -Math.PI / 2 + (R() - 0.5) * 2.2, LEAF[Math.floor(R() * LEAF.length)], R() > 0.35);
    }
    for (let i = 0; i < 4; i++) {
      const cx = (x + (R() - 0.3) * 1.0) * ppm, cy = yOf(0.42 + R() * 0.5);
      if (blocked(cx / ppm / len)) continue;
      drop(g, cx, cy, (0.025 + R() * 0.05) * ppm, R() * Math.PI * 2, LEAF[1 + Math.floor(R() * 4)]);
    }
  }
  return tex(c);
}

/** Window lettering: "ZERO EMISSION" / "НУЛЕВИ ЕМИСИИ" (first word turquoise, second white) and the plug-leaf
 *  roundel (ref07, ref08). */
export function e12GlassTexture(kind) {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  if (kind === 'icon') {
    g.strokeStyle = '#3cc3d3'; g.lineWidth = 12;
    g.beginPath(); g.arc(256, 128, 96, 0, Math.PI * 2); g.stroke();
    leaf(g, 256, 112, 120, 40, -Math.PI / 2, '#3cc3d3', false);
    g.fillStyle = '#3cc3d3'; g.fillRect(244, 170, 24, 46); g.fillRect(226, 160, 60, 16);
  } else {
    const [a, b] = kind === 'bg' ? ['НУЛЕВИ', 'ЕМИСИИ'] : ['ZERO', 'EMISSION'];
    g.font = `900 92px ${FONT}`;
    g.fillStyle = '#3cc3d3'; g.fillText(a, 18, 78, 476);
    g.fillStyle = '#ffffff'; g.fillText(b, 18, 184, 476);
  }
  return tex(c);
}

/** Front fascia decal (x -1.12..1.12 m, y 0.42..1.06 m): fleet number, round emblem, the V crease (ref08). */
export function e12FrontTexture(fleet) {
  const c = canvas(1024, 292), g = c.getContext('2d');
  const s = 1024 / 2.24;
  g.clearRect(0, 0, 1024, 292);
  const yOf = (m) => (1.06 - m) * s;
  g.strokeStyle = 'rgba(120,124,128,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0.06 * s, yOf(0.98)); g.lineTo(1.12 * s, yOf(0.8)); g.lineTo(2.18 * s, yOf(0.98)); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0.06 * s, yOf(0.975) + 3); g.lineTo(1.12 * s, yOf(0.795) + 3); g.lineTo(2.18 * s, yOf(0.975) + 3); g.stroke();
  badge(g, 1.12 * s, yOf(0.63), 0.07 * s, '#2a2d31');
  g.fillStyle = '#111111'; g.font = `bold ${0.12 * s}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(fleet, 0.2 * s, yOf(0.9));
  return tex(c);
}

/** Rear lower panel decal (x -1.15..1.15 m, y 0.6..1.7 m): arms, fleet number and type, a leaf spray (ref09). */
export function e12RearTexture(fleet) {
  const c = canvas(1024, 490), g = c.getContext('2d');
  const s = 1024 / 2.3;
  g.clearRect(0, 0, 1024, 490);
  const yOf = (m) => (1.7 - m) * s;
  crest(g, 0.18 * s, yOf(0.98), 0.17 * s);
  g.fillStyle = '#111'; g.font = `bold ${0.12 * s}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(fleet, 0.4 * s, yOf(0.82));
  g.font = `bold ${0.055 * s}px ${FONT}`; g.fillStyle = '#2a2d31';
  g.fillText('YUTONG', 0.9 * s, yOf(0.8));
  g.font = `italic bold ${0.06 * s}px ${FONT}`;
  g.fillText('E12LF', 1.0 * s, yOf(0.7));
  const R = rng(42);
  for (let i = 0; i < 5; i++) leaf(g, (1.5 + R() * 0.35) * s, yOf(1.0 + R() * 0.35), (0.22 + R() * 0.2) * s, 0.07 * s, -1.2 + R() * 1.5, LEAF[1 + Math.floor(R() * 4)], true);
  for (let i = 0; i < 4; i++) drop(g, (1.35 + R() * 0.2) * s, yOf(1.15 + R() * 0.3), 0.025 * s, R() * 6, LEAF[2]);
  return tex(c);
}

/** White side fleet number (on the black glazing band, ref02 / ref08). */
export function sideNumberTexture(fleet, color = '#ffffff') {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = color; g.font = `bold 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(fleet, 128, 34);
  return tex(c);
}

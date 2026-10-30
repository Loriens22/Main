// Canvas textures of the trams: roller-blind / backlit destination displays, fleet numbers, floors, seat
// fabric and roof louvres. Drawn at load time, no image files.
import * as THREE from 'three';
import { canvas, tex } from '../BusTextures.js';

/** Fits a text into width w with a bold font, returns the size used. */
function fit(g, text, w, size, weight = 'bold', family = 'Arial, Helvetica, sans-serif') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${family}`;
    if (g.measureText(text).width <= w) break;
    s -= 2;
  } while (s > 8);
  return s;
}

/**
 * Schindler front display (photos 1, 5, 6): a black box with two backlit white blinds, the line number large
 * above, the destination below. Returns {tex, draw(number, text)}.
 */
export function makeBlindDisplay({ w = 512, h = 400, split = 0.7, frame = 14 } = {}) {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const draw = (number, text) => {
    g.fillStyle = '#0b0c0d';
    g.fillRect(0, 0, w, h);
    const y1 = Math.round(h * split);
    g.fillStyle = '#f2f1ea';
    g.fillRect(frame, frame, w - 2 * frame, y1 - frame - 5);
    g.fillRect(frame, y1 + 5, w - 2 * frame, h - y1 - frame - 5);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = String(number || '');
    fit(g, n, w * 0.8, Math.round(y1 * 0.78), '900');
    g.fillText(n, w / 2, (frame + y1) / 2 + 4);
    const dt = String(text || '');
    fit(g, dt, w - 4 * frame, Math.round((h - y1) * 0.5), 'bold');
    g.fillText(dt, w / 2, (y1 + h - frame) / 2 + 2);
    t.needsUpdate = true;
  };
  draw('', '');
  return { tex: t, draw, canvas: c };
}

/** T6M number box (photos 8-10): a white backlit square with the black line number. */
export function makeNumberBox({ w = 256, h = 200 } = {}) {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const draw = (number) => {
    g.fillStyle = '#15171a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f3ec';
    g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#121212';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = String(number || '');
    fit(g, n, w * 0.8, Math.round(h * 0.72), '900');
    g.fillText(n, w / 2, h / 2 + 6);
    t.needsUpdate = true;
  };
  draw('');
  return { tex: t, draw };
}

/** Destination card behind a window (white card, line number in a box, destination text). */
export function makeRouteCard({ w = 512, h = 128, accent = '#111' } = {}) {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const draw = (number, text) => {
    g.fillStyle = '#f3f2ec';
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(8, 8, h - 16, h - 16);
    g.fillStyle = '#f3f2ec';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = String(number || '');
    fit(g, n, h - 30, Math.round(h * 0.62), '900');
    g.fillText(n, h / 2, h / 2 + 3);
    g.fillStyle = '#111';
    g.textAlign = 'left';
    const dt = String(text || '');
    fit(g, dt, w - h - 16, Math.round(h * 0.36), 'bold');
    g.fillText(dt, h + 4, h / 2 + 2);
    t.needsUpdate = true;
  };
  draw('', '');
  return { tex: t, draw };
}

/** Painted fleet number (transparent background). */
export function makeNumberDecal(text, { color = '#fff', w = 256, h = 96, weight = 'bold', family = 'Arial, Helvetica, sans-serif' } = {}) {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, text, w * 0.95, Math.round(h * 0.86), weight, family);
  g.fillText(text, w / 2, h / 2 + 3);
  return tex(c);
}

/** Ribbed rubber floor (Schindler high floor, photo 3) or speckled vinyl (low floor, T6M). */
export function makeFloor(kind = 'ribbed', base = '#3a3c3e') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  if (kind === 'ribbed') {
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, y, 256, 3);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, y + 3, 256, 1);
    }
  } else {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.10)';
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  const t = tex(c, { repeat: true });
  return t;
}

/** Seat moquette: dark blue with a fine pattern (Schindler, photos 2-3). */
export function makeMoquette(base = '#1f3a66', dot = 'rgba(120,160,220,0.22)') {
  const [c, g] = canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = dot;
  for (let y = 0; y < 128; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 128; x += 8) g.fillRect(x, y, 2, 2);
  return tex(c, { repeat: true });
}

/** Louvre grille (roof ventilation box above the Schindler cab, side vents). */
export function makeGrille(base = '#2c8f45', slots = 9) {
  const [c, g] = canvas(128, 64);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < slots; i++) {
    const y = 4 + (i * 56) / slots;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(6, y, 116, 3.4);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(6, y + 3.4, 116, 1);
  }
  return tex(c);
}

/** Instrument panel of the cab: speed, line current and voltage, controller position, telltales. */
export function drawTramDash(g, s) {
  const { w, h } = s;
  g.fillStyle = '#0a0b0c';
  g.fillRect(0, 0, w, h);
  const dial = (cx, cy, r, val, max, label, ticks, col = '#ff6a1f', fmt = null) => {
    g.strokeStyle = '#2b3034';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();
    g.strokeStyle = '#d6dadc';
    g.lineWidth = 2;
    for (let i = 0; i <= ticks; i++) {
      const a = Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.stroke();
    }
    const a = Math.PI * 0.75 + Math.max(0, Math.min(1, val / max)) * Math.PI * 1.5;
    g.strokeStyle = col;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
    g.stroke();
    g.fillStyle = '#9aa3a8';
    g.font = '15px Arial';
    g.textAlign = 'center';
    g.fillText(label, cx, cy + r * 0.62);
    if (fmt) {
      g.fillStyle = '#e8eef2';
      g.font = 'bold 22px Arial';
      g.fillText(fmt, cx, cy + r * 0.35);
    }
  };
  dial(108, 120, 92, s.speedKmh, 80, 'km/h', 8, '#ff6a1f', String(Math.round(s.speedKmh)));
  dial(w - 108, 120, 92, Math.abs(s.currentA), 800, 'A', 8, '#ffd21f', String(Math.round(s.currentA)));
  // line voltage bar
  g.fillStyle = '#9aa3a8';
  g.font = '14px Arial';
  g.textAlign = 'center';
  g.fillText(`${Math.round(s.volts)} V`, w / 2, 40);
  g.fillStyle = s.volts > 400 ? '#2fd15a' : '#ff3b30';
  g.fillRect(w / 2 - 50, 48, Math.max(0, Math.min(100, s.volts / 7)), 8);
  // controller position
  const notch = s.notch;
  g.font = 'bold 34px Arial';
  g.fillStyle = s.emergency ? '#ff3b30' : notch > 0 ? '#7fe08f' : notch < 0 ? '#ffb020' : '#e8eef2';
  g.fillText(s.emergency ? 'EB' : notch > 0 ? `P${notch}` : notch < 0 ? `B${-notch}` : '0', w / 2, 110);
  g.font = 'bold 22px Arial';
  g.fillStyle = s.selector === 'R' ? '#ff5a4a' : s.selector === 'N' ? '#e8eef2' : '#7fe08f';
  g.fillText(s.selector === 'D' ? 'V' : s.selector === 'R' ? 'R' : '0', w / 2, 145);
  const tell = [
    [!s.mainOn, '#ff3b30', 'HS'], [!s.pantoUp, '#ffb020', 'PG'], [s.doorsOpen, '#ffb020', '⇔'], [s.parking, '#ff3b30', 'P'],
    [s.slip > 0.2, '#ffb020', 'SL'], [s.head, '#2d8cff', '◐'], [s.sand, '#d9d9d9', 'SA'], [s.bell, '#ffd21f', '♪'],
  ];
  g.font = 'bold 15px Arial';
  tell.forEach(([on, col, txt], i) => {
    const x = w / 2 - 105 + (i % 4) * 70, y = 180 + Math.floor(i / 4) * 30;
    g.fillStyle = on ? col : '#1d2124';
    g.fillRect(x - 26, y - 13, 52, 22);
    g.fillStyle = on ? '#0a0b0c' : '#3a4044';
    g.fillText(txt, x, y + 4);
  });
}

export { THREE };

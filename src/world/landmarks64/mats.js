// Extra materials for the line 64 landmarks (procedural canvas textures only, no photographs).
// Every function is idempotent and registers its material in M.m under a key starting with "l64".
import * as THREE from 'three';
import { signMat, tileMat, rrect, fitText } from './common.js';
import { mulberry32 } from '../../core/rng.js';

const S = THREE.MeshStandardMaterial;

/** Plain colour / glass materials shared by every line 64 landmark. */
export function baseMats(M) {
  if (M.l64base) return;
  M.l64base = true;
  const add = (k, m) => { M.m[k] = m; return m; };
  add('l64metroBlue', new S({ color: 0x0b4f9c, roughness: 0.45 }));
  add('l64white', new S({ color: 0xf3f3ef, roughness: 0.5 }));
  add('l64offwhite', new S({ color: 0xe2e0d8, roughness: 0.7 }));
  add('l64steelDark', new S({ color: 0x2f3438, roughness: 0.5, metalness: 0.7 }));
  add('l64steel', new S({ color: 0xaeb4b8, roughness: 0.38, metalness: 0.85 }));
  add('l64alu', new S({ color: 0xc3c9cc, roughness: 0.42, metalness: 0.6 }));
  add('l64granite', new S({ color: 0x777a76, roughness: 0.55, metalness: 0.05 }));
  add('l64graniteGreen', new S({ color: 0x3f5648, roughness: 0.5 }));
  add('l64black', new S({ color: 0x101214, roughness: 0.8 }));
  add('l64wood', new S({ color: 0x9a6b3f, roughness: 0.7 }));
  add('l64red', new S({ color: 0xa8201e, roughness: 0.6 }));
  add('l64green', new S({ color: 0x2f6b3c, roughness: 0.6 }));
  add('l64yellow', new S({ color: 0xe6bd22, roughness: 0.55 }));
  // glazing: pale transparent pane and a darker tinted one
  add('glassL64', new THREE.MeshPhysicalMaterial({ color: 0xa9c4cf, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }));
  add('glassTintL64', new THREE.MeshPhysicalMaterial({ color: 0x52707c, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  // warm light inside canopies, lamps and shop windows (night only)
  const glow = add('l64glow', new S({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 0, roughness: 0.4 }));
  M.night.push({ get emissiveIntensity() { return glow.emissiveIntensity; }, set emissiveIntensity(v) { glow.emissiveIntensity = v * 3.2; } });
  const coolGlow = add('l64coolGlow', new S({ color: 0xe6f1ff, emissive: 0xcfe4ff, emissiveIntensity: 0, roughness: 0.4 }));
  M.night.push({ get emissiveIntensity() { return coolGlow.emissiveIntensity; }, set emissiveIntensity(v) { coolGlow.emissiveIntensity = v * 3.0; } });
}

/** Blue metro "M" board (square) and the station name board. */
export function metroSigns(M) {
  baseMats(M);
  signMat(M, 'l64metroM', 256, 256, (g, w, h) => {
    g.fillStyle = '#0b4f9c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; rrect(g, 10, 10, w - 20, h - 20, 18); g.stroke();
    g.fillStyle = '#ffffff';
    fitText(g, 'М', w / 2, h * 0.43, w * 0.8, 170, 800);
    fitText(g, 'МЕТРО', w / 2, h * 0.82, w * 0.74, 46, 700);
  });
  signMat(M, 'l64metroName', 512, 128, (g, w, h) => {
    g.fillStyle = '#0b4f9c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    fitText(g, 'ВИТОША', w * 0.56, h * 0.38, w * 0.74, 66, 800);
    fitText(g, 'METRO VITOSHA', w * 0.56, h * 0.76, w * 0.7, 30, 600);
    // the M mark at the left
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; rrect(g, 12, 14, 100, 100, 12); g.stroke();
    fitText(g, 'М', 62, 62, 80, 82, 800);
  });
  // stair floor: step nosings with a gradient into darkness (the stairwell reads as sunken)
  if (!M.m.l64stairs) {
    tileMat(M, 'l64stairs', 128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#7b7d7a'); gr.addColorStop(0.35, '#4c4e4d'); gr.addColorStop(1, '#0c0d0e');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const n = 16;
      for (let i = 0; i < n; i++) {
        const y = (i / n) * h;
        g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, y, w, 2);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + h / n * 0.5, w, h / n * 0.5);
      }
      g.fillStyle = '#d9c24a'; g.fillRect(0, 0, w, 6); // yellow nosing strip at the top step
    }, { rough: 0.7 });
  }
}

/** Paving: grey granite slabs with a dark-green stripe pattern (plaza at the metro and the mall). */
export function pavingMats(M) {
  baseMats(M);
  tileMat(M, 'decalPaving', 256, 256, (g, w, h) => {
    const rnd = mulberry32(5);
    g.fillStyle = '#b4b2ab'; g.fillRect(0, 0, w, h);
    const cell = w / 4;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
      const v = 160 + Math.floor(rnd() * 26);
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
      g.fillRect(q * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }
    // a dark band every 2 slabs
    g.fillStyle = '#6f736e';
    g.fillRect(0, cell * 2 - 1, w, cell * 0.5);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i <= 4; i++) { g.fillRect(i * cell - 1, 0, 2, h); g.fillRect(0, i * cell - 1, w, 2); }
  }, { offset: 2 });
  tileMat(M, 'decalTactile', 64, 64, (g, w, h) => {
    g.fillStyle = '#d9b73a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a98a1e';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
  }, { offset: 3 });
}

/** Bar fence: vertical bars between rails, alpha tested (tile 2.4 m wide, 1 m high in uv). */
export function barFenceMat(M, key, o = {}) {
  baseMats(M);
  if (M.m[key]) return M.m[key];
  const col = o.color || '#23282b', bars = o.bars || 20, rails = o.rails || [0.08, 0.5, 0.94];
  return tileMat(M, key, 512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = col;
    const bw = Math.max(3, w / bars / 4);
    for (let i = 0; i < bars; i++) g.fillRect(((i + 0.5) / bars) * w - bw / 2, 0, bw, h);
    // pointed tops
    for (let i = 0; i < bars; i++) { const x = ((i + 0.5) / bars) * w; g.beginPath(); g.moveTo(x - bw, 0.06 * h); g.lineTo(x, 0); g.lineTo(x + bw, 0.06 * h); g.closePath(); g.fill(); }
    for (const r of rails) g.fillRect(0, r * h - 4, w, 8);
    if (o.panelFrame) { g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h); }
  }, { alpha: true, rough: 0.55, metal: 0.4 });
}

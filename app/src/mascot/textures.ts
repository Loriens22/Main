import * as THREE from 'three';
import { rng } from './util';

/**
 * Tileable strand map for shell fur.
 * R: strand cone profile (1 at strand centre -> 0 at edge)
 * G: per-strand random value (colour variation)
 * B: per-strand length factor
 */
export function makeStrandTexture(size = 256, cells = 44, seed = 7): THREE.DataTexture {
  const rand = rng(seed);
  const data = new Uint8Array(size * size * 4);
  const best = new Float32Array(size * size);
  const cell = size / cells;
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 200;
    data[i * 4 + 3] = 255;
  }
  // Two passes: a dense undercoat of thin strands, then thicker guard hairs.
  const passes = [
    { count: cells * cells, rMin: 0.42, rMax: 0.62 },
    { count: Math.floor(cells * cells * 0.35), rMin: 0.55, rMax: 0.85 },
  ];
  for (const pass of passes) {
    for (let n = 0; n < pass.count; n++) {
      let cx: number;
      let cy: number;
      if (pass === passes[0]) {
        const gx = n % cells;
        const gy = Math.floor(n / cells);
        cx = (gx + 0.15 + rand() * 0.7) * cell;
        cy = (gy + 0.15 + rand() * 0.7) * cell;
      } else {
        cx = rand() * size;
        cy = rand() * size;
      }
      const r = (pass.rMin + rand() * (pass.rMax - pass.rMin)) * cell;
      const g = Math.floor(rand() * 255);
      const len = Math.floor((0.55 + rand() * 0.45) * 255);
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > r) continue;
          const v = 1 - d / r;
          const px = ((Math.floor(cx) + dx) % size + size) % size;
          const py = ((Math.floor(cy) + dy) % size + size) % size;
          const idx = py * size + px;
          if (v > best[idx]) {
            best[idx] = v;
            data[idx * 4] = Math.floor(v * 255);
            data[idx * 4 + 1] = g;
            data[idx * 4 + 2] = len;
          }
        }
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial blob used for contact shadows. */
export function makeShadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Particle atlas (4x2 cells of 64px):
 * 0 soft dot, 1 confetti square, 2 heart, 3 "Z", 4 "?", 5 sparkle star, 6 smoke puff, 7 note
 */
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
export function makeParticleAtlas(): THREE.Texture {
  const cs = 64;
  const c = document.createElement('canvas');
  c.width = cs * ATLAS_COLS;
  c.height = cs * ATLAS_ROWS;
  const g = c.getContext('2d')!;
  const cellOrigin = (i: number) => [(i % ATLAS_COLS) * cs, Math.floor(i / ATLAS_COLS) * cs] as const;

  // 0 soft dot
  {
    const [x, y] = cellOrigin(0);
    const grd = g.createRadialGradient(x + 32, y + 32, 0, x + 32, y + 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, cs, cs);
  }
  // 1 confetti (rounded rect)
  {
    const [x, y] = cellOrigin(1);
    g.fillStyle = '#fff';
    roundRect(g, x + 16, y + 8, 32, 48, 6);
    g.fill();
  }
  // 2 heart
  {
    const [x, y] = cellOrigin(2);
    g.save();
    g.translate(x + 32, y + 34);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, 18);
    g.bezierCurveTo(-30, -2, -20, -26, 0, -12);
    g.bezierCurveTo(20, -26, 30, -2, 0, 18);
    g.fill();
    g.restore();
  }
  // 3 Z
  {
    const [x, y] = cellOrigin(3);
    g.fillStyle = '#fff';
    g.font = '900 52px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', x + 32, y + 35);
  }
  // 4 ?
  {
    const [x, y] = cellOrigin(4);
    g.fillStyle = '#fff';
    g.font = '900 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', x + 32, y + 35);
  }
  // 5 sparkle
  {
    const [x, y] = cellOrigin(5);
    g.save();
    g.translate(x + 32, y + 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 28 : 7;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  // 6 smoke puff
  {
    const [x, y] = cellOrigin(6);
    const blobs = [
      [32, 36, 18],
      [22, 30, 13],
      [42, 28, 14],
      [32, 22, 12],
    ];
    for (const [bx, by, br] of blobs) {
      const grd = g.createRadialGradient(x + bx, y + by, 0, x + bx, y + by, br);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, cs, cs);
    }
  }
  // 7 music note
  {
    const [x, y] = cellOrigin(7);
    g.fillStyle = '#fff';
    g.font = '900 50px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♪', x + 32, y + 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

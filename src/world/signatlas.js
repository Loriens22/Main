// All shop/street/stop signs share one canvas atlas → one material, merged per chunk (few draw calls).
import * as THREE from 'three';
import { FONT, MAX_ANISO } from '../textures.js';

class Atlas {
  constructor(W = 2048, H = 2048) {
    this.W = W; this.H = H;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#777'; this.ctx.fillRect(0, 0, W, H);
    this.x = 0; this.y = 0; this.rowH = 0;
    this.map = new Map();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = MAX_ANISO;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = new THREE.MeshStandardMaterial({ name: 'signAtlas', map: this.tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.1, vertexColors: true });
    this.mat.userData = { cast: false };
    this.dirty = true;
  }
  /** Returns uv rect for a sign drawn at pixel size (w,h) (scaled to fit). */
  rect(lines, { w = 1024, h = 192, bg = '#1d4e9e', fg = '#fff', font = FONT, weight = 800, border = null, size = null } = {}) {
    const L = Array.isArray(lines) ? lines : [lines];
    const key = L.join('|') + bg + fg + w + h + font;
    if (this.map.has(key)) return this.map.get(key);
    const k = Math.min(1, 320 / w);
    const pw = Math.round(w * k), ph = Math.round(h * k);
    if (this.x + pw + 4 > this.W) { this.x = 0; this.y += this.rowH + 4; this.rowH = 0; }
    if (this.y + ph > this.H) { console.warn('sign atlas full'); return { u0: 0, v0: 0, u1: 0.01, v1: 0.01 }; }
    const x = this.x, y = this.y;
    this.x += pw + 4; this.rowH = Math.max(this.rowH, ph);
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, pw, ph);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = ph * 0.06; ctx.strokeRect(ph * 0.05, ph * 0.05, pw - ph * 0.1, ph - ph * 0.1); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = (size ? size * k : (ph / L.length) * 0.62);
    L.forEach((t, i) => {
      let s = fs; ctx.font = `${weight} ${s}px ${font}`;
      while (ctx.measureText(t).width > pw * 0.92 && s > 6) { s -= 1; ctx.font = `${weight} ${s}px ${font}`; }
      ctx.fillText(t, pw / 2, (ph / L.length) * (i + 0.5) + 1);
    });
    ctx.restore();
    const r = { u0: (x + 0.5) / this.W, u1: (x + pw - 0.5) / this.W, v0: 1 - (y + ph - 0.5) / this.H, v1: 1 - (y + 0.5) / this.H };
    this.map.set(key, r); window.SIGNSN = this.map.size;
    this.dirty = true;
    return r;
  }
  /** Plane geometry (w×h metres, facing +z) textured with the sign. */
  quad(w, h, lines, opts) {
    const r = this.rect(lines, opts);
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? r.u1 : r.u0, uv.getY(i) ? r.v1 : r.v0);
    return g;
  }
  finalize() { this.tex.needsUpdate = true; this.dirty = false; }
}
export const SIGNS = new Atlas();

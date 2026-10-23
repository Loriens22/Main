// Amber dot-matrix LED destination signs (Cyrillic-capable). Text is
// rasterised with the browser font engine at the native matrix resolution,
// thresholded to on/off pixels and redrawn as round LEDs with a soft glow.
import * as THREE from 'three';

export class LedSign {
  /**
   * @param {number} cols matrix columns
   * @param {number} rows matrix rows
   * @param {number} dot  pixel pitch in the output texture
   */
  constructor(cols = 160, rows = 19, dot = 8) {
    this.cols = cols;
    this.rows = rows;
    this.dot = dot;
    this.mask = document.createElement('canvas');
    this.mask.width = cols;
    this.mask.height = rows;
    this.mctx = this.mask.getContext('2d', { willReadFrequently: true });
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * dot;
    this.canvas.height = rows * dot;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.on = '#ff9a1a';
    this.key = '';
    this.scroll = 0;
  }

  /** Draw text segments into the 1-bit mask. segs: [{text, x, y, size, weight, condensed, align}] */
  rasterise(segs) {
    const g = this.mctx;
    g.clearRect(0, 0, this.cols, this.rows);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.cols, this.rows);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    for (const s of segs) {
      g.font = `${s.weight || 700} ${s.size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
      let w = g.measureText(s.text).width;
      let sx = s.condensed || 1;
      if (s.maxW && w * sx > s.maxW) sx = s.maxW / w;
      g.save();
      let x = s.x;
      if (s.align === 'center') x = s.x + (s.maxW - w * sx) / 2;
      if (s.align === 'right') x = s.x + s.maxW - w * sx;
      g.translate(Math.round(x), 0);
      g.scale(sx, 1);
      g.fillText(s.text, 0, s.y);
      g.restore();
    }
    const d = g.getImageData(0, 0, this.cols, this.rows).data;
    const bits = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4] > 110 ? 1 : 0;
    return bits;
  }

  paint(bits) {
    const g = this.ctx, dot = this.dot;
    g.fillStyle = '#0a0a0c';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const r = dot * 0.36;
    // unlit LEDs
    g.fillStyle = '#171310';
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        if (bits[y * this.cols + x]) continue;
        g.beginPath();
        g.arc(x * dot + dot / 2, y * dot + dot / 2, r * 0.85, 0, Math.PI * 2);
        g.fill();
      }
    // lit LEDs with halo
    g.fillStyle = 'rgba(200,99,10,0.30)';
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        if (!bits[y * this.cols + x]) continue;
        g.beginPath();
        g.arc(x * dot + dot / 2, y * dot + dot / 2, r * 1.5, 0, Math.PI * 2);
        g.fill();
      }
    g.fillStyle = this.on;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        if (!bits[y * this.cols + x]) continue;
        g.beginPath();
        g.arc(x * dot + dot / 2, y * dot + dot / 2, r, 0, Math.PI * 2);
        g.fill();
      }
    // hot centre of every lit LED
    g.fillStyle = '#ffd27a';
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        if (!bits[y * this.cols + x]) continue;
        g.beginPath();
        g.arc(x * dot + dot / 2, y * dot + dot / 2, r * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    this.texture.needsUpdate = true;
  }

  /** Route number (large, left) + destination (one or two lines, right). */
  showRoute(number, text) {
    const key = `R|${number}|${text}`;
    if (key === this.key) return;
    this.key = key;
    const rows = this.rows, cols = this.cols;
    const numW = number ? Math.round(cols * (cols < 100 ? 0.27 : 0.2)) : 0;
    const segs = [];
    // cap height about 75 % of the matrix (spec: 0.25 m text on a 0.32 m matrix)
    const sz = Math.round(rows * 1.08), base = rows - Math.max(2, Math.round(rows * 0.12));
    if (number) segs.push({ text: number, x: 0, y: base, size: sz + 1, weight: 800, maxW: numW - 3, align: 'center' });
    const avail = cols - numW - 1;
    const g = this.mctx;
    g.font = `700 ${sz}px Arial, sans-serif`;
    const w1 = g.measureText(text).width;
    const fit = avail / Math.max(1, w1);
    if (fit >= 0.45) {
      // single line, condensed as far as needed (down to 45 %)
      segs.push({ text, x: numW + 1, y: base, size: sz, condensed: Math.min(0.82, fit), maxW: avail, align: 'left' });
    } else {
      // split into two lines at the space nearest the middle
      const words = text.split(' ');
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const score = Math.abs(a.length - b.length);
        if (!best || score < best.score) best = { a, b, score };
      }
      const half = Math.floor(rows / 2);
      const sz = half + 1;
      if (best) {
        segs.push({ text: best.a, x: numW + 1, y: half - 1, size: sz, condensed: 0.9, maxW: avail, align: 'center' });
        segs.push({ text: best.b, x: numW + 1, y: rows - 1, size: sz, condensed: 0.9, maxW: avail, align: 'center' });
      } else segs.push({ text, x: numW + 1, y: rows - 2, size: rows - 4, maxW: avail, align: 'center' });
    }
    this.paint(this.rasterise(segs));
  }

  showText(text, size = null, align = 'center') {
    const key = `T|${text}|${size}`;
    if (key === this.key) return;
    this.key = key;
    const sz = size || this.rows - 2;
    this.paint(this.rasterise([{ text, x: 1, y: Math.round((this.rows + sz * 0.72) / 2), size: sz, maxW: this.cols - 2, align, condensed: 0.9 }]));
  }

  showLines(a, b) {
    const key = `L|${a}|${b}`;
    if (key === this.key) return;
    this.key = key;
    const half = Math.floor(this.rows / 2);
    this.paint(this.rasterise([
      { text: a, x: 1, y: half - 1, size: half + 1, maxW: this.cols - 2, align: 'left', condensed: 0.9 },
      { text: b, x: 1, y: this.rows - 1, size: half + 1, maxW: this.cols - 2, align: 'left', condensed: 0.9 },
    ]));
  }

  blank() {
    if (this.key === 'blank') return;
    this.key = 'blank';
    this.paint(new Uint8Array(this.cols * this.rows));
  }
}

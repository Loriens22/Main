// Shop signs of the real businesses along Route 280: names from Overture
// places (Meta, Foursquare, AllThePlaces...) and from the stop-by-stop
// research, mounted as fascia boards above the shopfront of the building they
// are in. All text is drawn into one or two canvas atlases; the boards are
// merged per 256 m tile and light up at night.
import * as THREE from 'three';

const ATLAS = 2048;
const BOARD_H = 0.62;

function hex(c) {
  return '#' + (c >>> 0).toString(16).padStart(6, '0');
}

function luma(c) {
  return (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
}

export class ShopSigns {
  constructor({ world, quality }) {
    this.world = world;
    this.quality = quality;
    const d = world.data;
    this.signs = (d.signs || []).map((s) => ({
      x: s[0] / 10, z: s[1] / 10, nx: s[2] / 100, nz: s[3] / 100, w: s[4] / 10,
      text: d.names[s[5]] || '', bg: s[6], fg: s[7], b: d.buildings[s[8]], kiosk: !!s[9], prio: s[10] || 0,
    })).filter((s) => s.text && s.b);
    // most important first, so the atlas budget drops the least useful ones
    this.signs.sort((a, b) => b.prio - a.prio);
    this.materials = [];
  }

  /** Packs the sign faces into atlases (shelf packing); returns [{canvas, rects}] */
  pack() {
    const low = this.quality === 'low';
    const ppm = low ? 44 : 62; // atlas pixels per metre of sign
    const rowH = Math.round(BOARD_H * ppm);
    const maxAtlases = low ? 1 : 2;
    const atlases = [];
    let cur = null, x = 0, y = 0;
    const next = () => {
      if (atlases.length >= maxAtlases) return false;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ATLAS;
      cur = { canvas, ctx: canvas.getContext('2d'), items: [] };
      atlases.push(cur);
      x = 0; y = 0;
      return true;
    };
    next();
    for (const s of this.signs) {
      const wpx = Math.min(ATLAS, Math.max(48, Math.round(s.w * ppm)));
      if (x + wpx > ATLAS) { x = 0; y += rowH + 2; }
      if (y + rowH > ATLAS) {
        if (!next()) break;
      }
      s.atlas = atlases.length - 1;
      s.rect = [x, y, wpx, rowH];
      cur.items.push(s);
      x += wpx + 2;
    }
    for (const a of atlases) for (const s of a.items) this.draw(a.ctx, s);
    return atlases;
  }

  draw(ctx, s) {
    const [x, y, w, h] = s.rect;
    ctx.fillStyle = hex(s.bg);
    ctx.fillRect(x, y, w, h);
    // light bevel at the top, shadow at the bottom
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w, Math.max(1, h * 0.06));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + h - Math.max(1, h * 0.07), w, Math.max(1, h * 0.07));
    const light = luma(s.bg) > 0.6;
    if (light) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    const text = s.text.length > 14 ? s.text : s.text.toUpperCase();
    let size = Math.round(h * 0.6);
    ctx.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    const room = w * 0.9;
    if (tw > room && tw > 0) {
      size = Math.max(9, Math.floor(size * Math.max(0.62, room / tw)));
      ctx.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif`;
    }
    ctx.fillStyle = hex(s.fg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h * 0.53, room);
  }

  /** Average terrain height under the building footprint (as Buildings.js uses for its base). */
  base(b) {
    if (b._base != null) return b._base;
    const hf = this.world.hf, p = b.pts;
    let sum = 0;
    for (let i = 0; i < p.length; i += 2) sum += hf.heightAt(p[i], p[i + 1]);
    return (b._base = sum / (p.length / 2));
  }

  build() {
    if (!this.signs.length) return [];
    const atlases = this.pack();
    this.materials = atlases.map((a) => {
      const tex = new THREE.CanvasTexture(a.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.generateMipmaps = true;
      return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: 0.05 });
    });
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
    // per tile: one face buffer per atlas + one frame buffer
    const tiles = new Map();
    const tileOf = (x, z) => {
      const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
      let t = tiles.get(key);
      if (!t) tiles.set(key, (t = { faces: atlases.map(() => ({ p: [], n: [], uv: [] })), frame: { p: [], n: [] } }));
      return t;
    };
    for (const s of this.signs) {
      if (s.rect == null) continue;
      const b = s.b;
      const base = this.base(b);
      const yc = s.kiosk ? base + Math.max(1.9, Math.min(b.h - 0.45, 2.7)) : base + 3.5;
      if (yc + BOARD_H / 2 > base + b.h + 0.05 && !s.kiosk) continue; // a sign must not stick out above a low building
      const tx = s.nz, tz = -s.nx; // along the wall, left to right as seen from the street
      const hw = s.w / 2, hh = BOARD_H / 2;
      const off = 0.09; // board stands off the wall
      const cx = s.x + s.nx * off, cz = s.z + s.nz * off;
      const t = tileOf(s.x, s.z);
      // face quad
      const [rx, ry, rw, rh] = s.rect;
      const u0 = rx / ATLAS, u1 = (rx + rw) / ATLAS, v1 = 1 - ry / ATLAS, v0 = 1 - (ry + rh) / ATLAS;
      const f = t.faces[s.atlas];
      const P = (a, h) => [cx + tx * a, yc + h, cz + tz * a];
      const quad = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, -hh), P(hw, hh), P(-hw, hh)];
      const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
      for (let k = 0; k < 6; k++) {
        f.p.push(...quad[k]);
        f.n.push(s.nx, 0, s.nz);
        f.uv.push(...uvs[k]);
      }
      // frame: a thin box behind the face (top, bottom, ends and back)
      const fr = t.frame;
      const d0 = -off + 0.01, d1 = -0.004, e = 0.03;
      const B = (a, h, dd) => [s.x + s.nx * (off + dd) + tx * a, yc + h, s.z + s.nz * (off + dd) + tz * a];
      const faceQuad = (a, bq, c, dq, n) => {
        for (const v of [a, bq, c, a, c, dq]) fr.p.push(...v);
        for (let k = 0; k < 6; k++) fr.n.push(...n);
      };
      const W = hw + e, H = hh + e;
      faceQuad(B(-W, H, d1), B(W, H, d1), B(W, H, d0), B(-W, H, d0), [0, 1, 0]); // top
      faceQuad(B(-W, -H, d0), B(W, -H, d0), B(W, -H, d1), B(-W, -H, d1), [0, -1, 0]); // bottom
      faceQuad(B(W, -H, d1), B(W, -H, d0), B(W, H, d0), B(W, H, d1), [tx, 0, tz]); // right end
      faceQuad(B(-W, -H, d0), B(-W, -H, d1), B(-W, H, d1), B(-W, H, d0), [-tx, 0, -tz]); // left end
      // rim around the face (slightly larger, just behind it)
      faceQuad(B(-W, -H, d1 - 0.002), B(W, -H, d1 - 0.002), B(W, H, d1 - 0.002), B(-W, H, d1 - 0.002), [s.nx, 0, s.nz]);
    }
    const out = [];
    for (const [key, t] of tiles) {
      const g = new THREE.Group();
      g.name = `signs:${key}`;
      t.faces.forEach((f, i) => {
        if (!f.p.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(f.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(f.n, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
        const m = new THREE.Mesh(geo, this.materials[i]);
        m.name = 'signface';
        m.matrixAutoUpdate = false;
        g.add(m);
      });
      if (t.frame.p.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(t.frame.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(t.frame.n, 3));
        const m = new THREE.Mesh(geo, this.frameMat);
        m.name = 'signframe';
        m.matrixAutoUpdate = false;
        g.add(m);
      }
      out.push(g);
    }
    return out;
  }

  setNight(v) {
    for (const m of this.materials) m.emissiveIntensity = v * 1.7; // backlit boxes / LED letters
  }
}

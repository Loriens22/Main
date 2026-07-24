/* =====================================================================
   PROCEDURAL TEXTURE FACTORY
   Paints every block texture at authentic 16x16 into one RGBA buffer that
   becomes a WebGL2 TEXTURE_2D_ARRAY layer per texture. No external assets.
   ===================================================================== */

(function (root) {
  'use strict';
  const TS = 16;                       // tile size

  /* ---------- tiny colour helpers ---------------------------------- */
  function hex(h) {
    if (typeof h !== 'string') return h;
    const s = h[0] === '#' ? h.slice(1) : h;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16),
    s.length > 6 ? parseInt(s.slice(6, 8), 16) : 255];
  }
  function sh(c, k) {                    // multiply brightness
    c = hex(c);
    return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), c[3]];
  }
  function mix(a, b, t) {
    a = hex(a); b = hex(b);
    return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t),
    clamp(a[2] + (b[2] - a[2]) * t), clamp(a[3] + (b[3] - a[3]) * t)];
  }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  /* ---------- painter canvas --------------------------------------- */
  function Canvas() {
    this.d = new Uint8Array(TS * TS * 4);
    this.s = 1;
  }
  Canvas.prototype.seed = function (n) { this.s = (n >>> 0) || 1; return this; };
  Canvas.prototype.r = function () {
    this.s ^= this.s << 13; this.s ^= this.s >>> 17; this.s ^= this.s << 5; this.s >>>= 0;
    return this.s / 4294967296;
  };
  Canvas.prototype.px = function (x, y, c) {
    if (x < 0 || y < 0 || x >= TS || y >= TS || !c) return;
    c = hex(c);
    const i = (y * TS + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3] === undefined ? 255 : c[3];
  };
  Canvas.prototype.blend = function (x, y, c, a) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    c = hex(c);
    const i = (y * TS + x) * 4;
    this.d[i] = clamp(this.d[i] * (1 - a) + c[0] * a);
    this.d[i + 1] = clamp(this.d[i + 1] * (1 - a) + c[1] * a);
    this.d[i + 2] = clamp(this.d[i + 2] * (1 - a) + c[2] * a);
  };
  Canvas.prototype.get = function (x, y) {
    const i = ((y + TS) % TS * TS + (x + TS) % TS) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  };
  Canvas.prototype.fill = function (c) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) this.px(x, y, c);
    return this;
  };
  Canvas.prototype.rect = function (x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, c);
    return this;
  };
  Canvas.prototype.frame = function (x0, y0, w, h, c) {
    for (let x = x0; x < x0 + w; x++) { this.px(x, y0, c); this.px(x, y0 + h - 1, c); }
    for (let y = y0; y < y0 + h; y++) { this.px(x0, y, c); this.px(x0 + w - 1, y, c); }
    return this;
  };
  Canvas.prototype.hline = function (y, x0, x1, c) { for (let x = x0; x <= x1; x++) this.px(x, y, c); return this; };
  Canvas.prototype.vline = function (x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.px(x, y, c); return this; };
  /** per-pixel brightness noise */
  Canvas.prototype.noise = function (amt, chunk) {
    chunk = chunk || 1;
    for (let y = 0; y < TS; y += chunk)
      for (let x = 0; x < TS; x += chunk) {
        const k = 1 + (this.r() - 0.5) * amt;
        for (let dy = 0; dy < chunk; dy++) for (let dx = 0; dx < chunk; dx++) {
          const i = ((y + dy) * TS + (x + dx)) * 4;
          if (y + dy >= TS || x + dx >= TS) continue;
          this.d[i] = clamp(this.d[i] * k); this.d[i + 1] = clamp(this.d[i + 1] * k); this.d[i + 2] = clamp(this.d[i + 2] * k);
        }
      }
    return this;
  };
  /** random dark/light specks */
  Canvas.prototype.specks = function (n, c, sz) {
    for (let i = 0; i < n; i++) {
      const x = (this.r() * TS) | 0, y = (this.r() * TS) | 0, s = sz || 1;
      this.rect(x, y, s, s, c);
    }
    return this;
  };
  Canvas.prototype.clear = function () { this.d.fill(0); return this; };

  /* ---------- pattern builders -------------------------------------- */
  function base(c, amt, seed) { const q = new Canvas().seed(seed || 7).fill(c).noise(amt === undefined ? 0.16 : amt); return q; }

  function brickPat(q, mortar, col, rowH, brickW, jitter) {
    q.fill(mortar);
    for (let ry = 0; ry < TS / rowH; ry++) {
      const off = (ry % 2) * (brickW / 2);
      for (let bx = -brickW; bx < TS; bx += brickW) {
        const x0 = bx + off, y0 = ry * rowH;
        const c = sh(col, 1 + (q.r() - 0.5) * (jitter === undefined ? 0.18 : jitter));
        q.rect(x0 + 1, y0 + 1, brickW - 1, rowH - 1, c);
      }
    }
    q.noise(0.10);
    return q;
  }

  function cobblePat(q, col, dark) {
    q.fill(dark);
    const cells = [[0, 0, 6, 5], [7, 0, 5, 4], [12, 0, 4, 6], [0, 6, 4, 5], [5, 5, 6, 6], [12, 7, 4, 4],
    [0, 12, 7, 4], [8, 12, 4, 4], [12, 12, 4, 4], [4, 11, 3, 4]];
    for (const [x, y, w, h] of cells) {
      const c = sh(col, 0.82 + q.r() * 0.36);
      q.rect(x, y, w - 1, h - 1, c);
      for (let i = 0; i < 4; i++) q.px(x + ((q.r() * (w - 1)) | 0), y + ((q.r() * (h - 1)) | 0), sh(c, 0.86));
    }
    q.noise(0.10);
    return q;
  }

  function plankPat(q, col, rowH, seamDark) {
    q.fill(col);
    for (let y = 0; y < TS; y++) {
      const row = (y / rowH) | 0;
      const k = 0.88 + ((row * 2654435761 >>> 0) % 100) / 100 * 0.24;
      for (let x = 0; x < TS; x++) q.px(x, y, sh(col, k));
    }
    for (let ry = 0; ry <= TS / rowH; ry++) q.hline(ry * rowH, 0, TS - 1, sh(col, seamDark || 0.6));
    // knots / grain
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++)
        if (q.r() < 0.16) q.blend(x, y, sh(col, 0.8), 0.4);
    for (let i = 0; i < 3; i++) {
      const x = (q.r() * TS) | 0, ry = (q.r() * (TS / rowH)) | 0;
      q.rect(x, ry * rowH + 2, 2, Math.max(1, rowH - 3), sh(col, 0.74));
    }
    return q;
  }

  function logSide(q, bark, dark) {
    q.fill(bark);
    for (let x = 0; x < TS; x++) {
      const k = 0.82 + ((x * 97 % 13) / 13) * 0.36;
      for (let y = 0; y < TS; y++) q.px(x, y, sh(bark, k));
    }
    for (let i = 0; i < 22; i++) {
      const x = (q.r() * TS) | 0, y = (q.r() * TS) | 0, h = 2 + ((q.r() * 4) | 0);
      q.rect(x, y, 1, h, sh(dark || bark, 0.7));
    }
    return q;
  }
  function logTop(q, ring, core) {
    q.fill(ring);
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const band = Math.sin(d * 1.9) * 0.5 + 0.5;
      q.px(x, y, mix(ring, core, band * 0.55));
    }
    q.noise(0.10);
    return q;
  }

  function tilePat(q, col, n, groutK) {
    const s = TS / n;
    q.fill(sh(col, groutK || 0.72));
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++)
      q.rect(tx * s, ty * s, s - 1, s - 1, sh(col, 0.9 + q.r() * 0.2));
    q.noise(0.08);
    return q;
  }

  function glassPat(q, col, a) {
    q.clear();
    const c = hex(col);
    const A = a === undefined ? 90 : a;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const i = (y * TS + x) * 4;
      q.d[i] = c[0]; q.d[i + 1] = c[1]; q.d[i + 2] = c[2]; q.d[i + 3] = A;
    }
    // frame + highlight
    const fr = [clamp(c[0] * 1.15 + 40), clamp(c[1] * 1.15 + 40), clamp(c[2] * 1.15 + 40), 210];
    q.frame(0, 0, TS, TS, fr);
    q.hline(2, 2, 6, [255, 255, 255, 150]);
    q.vline(2, 2, 6, [255, 255, 255, 110]);
    q.hline(13, 9, 13, [255, 255, 255, 60]);
    return q;
  }

  function leafPat(q, col, holes) {
    q.clear();
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (q.r() < (holes === undefined ? 0.17 : holes)) continue;
      const k = 0.62 + q.r() * 0.62;
      q.px(x, y, sh(col, k));
    }
    return q;
  }

  /* plant cross sprite: stem + leaves + flower head */
  function plantPat(q, stem, leaf, flower, h, headW, headStyle) {
    q.clear();
    const cx = 8, top = TS - h;
    for (let y = TS - 1; y >= top; y--) {
      const w = y > top + 2 ? 1 : 1;
      const xx = cx + (Math.sin(y * 0.6) > 0.7 ? 1 : 0);
      q.rect(xx - 1, y, w, 1, sh(stem, 0.85 + q.r() * 0.3));
      if (q.r() < 0.4 && y < TS - 2) {
        const dir = q.r() < 0.5 ? -1 : 1;
        q.px(xx - 1 + dir, y, sh(leaf || stem, 0.9));
        if (q.r() < 0.4) q.px(xx - 1 + dir * 2, y - (q.r() < 0.5 ? 1 : 0), sh(leaf || stem, 0.8));
      }
    }
    if (flower) {
      const hw = headW || 3;
      if (headStyle === 'ball') {
        for (let y = top - hw; y <= top + 1; y++)
          for (let x = cx - hw; x <= cx + hw - 1; x++) {
            const d = (x - cx + 0.5) * (x - cx + 0.5) + (y - top + hw / 2) * (y - top + hw / 2);
            if (d <= hw * hw * 0.9) q.px(x, y, sh(flower, 0.8 + q.r() * 0.45));
          }
      } else if (headStyle === 'spike') {
        for (let y = top - 4; y <= top + 1; y++) {
          const w = Math.max(1, 3 - Math.abs(y - (top - 1)));
          for (let x = cx - w; x < cx + w; x++) q.px(x, y, sh(flower, 0.8 + q.r() * 0.4));
        }
      } else {
        for (let y = top - 2; y <= top; y++)
          for (let x = cx - hw + 1; x <= cx + hw - 2; x++)
            if (q.r() < 0.88) q.px(x, y, sh(flower, 0.78 + q.r() * 0.5));
        q.px(cx - 1, top - 1, sh(flower, 1.25));
      }
    }
    return q;
  }

  /* ---------- dye colours ------------------------------------------- */
  const DYE = {
    white: '#e9ecec', lightgray: '#8e8e86', gray: '#3e4447', black: '#1d1c21',
    red: '#b02e26', orange: '#f9801d', yellow: '#fed83d', lime: '#80c71f',
    green: '#5e7c16', cyan: '#169c9c', lightblue: '#3ab3da', blue: '#3c44aa',
    purple: '#8932b8', magenta: '#c74ebd', pink: '#f38baa', brown: '#835432',
  };
  const TERRA = {
    plain: '#985e43', white: '#d1b1a1', lightgray: '#876b62', gray: '#3a2a24', black: '#251610',
    red: '#8f3d2f', orange: '#a15325', yellow: '#ba8524', lime: '#687433', green: '#4c532a',
    cyan: '#575b5b', lightblue: '#71699a', blue: '#4a3b5b', purple: '#764656', brown: '#4d3323',
    pink: '#a3585a', magenta: '#95576c',
  };

  /* ---------- the registry ------------------------------------------- */
  const P = {};   // name -> painter(q)
  let SEED = 1;
  function reg(name, fn) { P[name] = fn; }

  /* ===== stone family ===== */
  reg('stone', q => base('#7a7a7a', 0.20, 3));
  reg('smooth_stone', q => base('#9d9d9d', 0.07, 5));
  reg('smooth_stone_top', q => { base('#9d9d9d', 0.06, 6).frame(0, 0, 16, 16, '#787878'); return q; });
  reg('cobble', q => cobblePat(q, '#8a8a8a', '#6a6a6a'));
  reg('mossy_cobble', q => { cobblePat(q, '#7d8a72', '#5a6450'); q.specks(26, '#5b7a3c'); return q; });
  reg('cobbled_deepslate', q => cobblePat(q, '#5b5b60', '#3c3c42'));
  reg('deepslate', q => { base('#4f4f55', 0.22, 11); for (let i = 0; i < 10; i++) q.vline((q.r() * 16) | 0, 0, 15, '#43434a'); return q; });
  reg('polished_deepslate', q => base('#54545a', 0.09, 12));
  reg('deepslate_bricks', q => brickPat(q, '#38383e', '#4e4e55', 4, 8, 0.20));
  reg('deepslate_tiles', q => tilePat(q, '#3e3e45', 4, 0.7));
  reg('stone_bricks', q => brickPat(q, '#5f5f5f', '#7d7d7d', 8, 8, 0.16));
  reg('mossy_stone_bricks', q => { brickPat(q, '#556052', '#74806c', 8, 8, 0.16); q.specks(34, '#4f7233'); return q; });
  reg('cracked_stone_bricks', q => {
    brickPat(q, '#5a5a5a', '#787878', 8, 8, 0.2);
    for (let i = 0; i < 5; i++) { let x = (q.r() * 16) | 0, y = (q.r() * 16) | 0; for (let k = 0; k < 7; k++) { q.px(x, y, '#4a4a4a'); x += q.r() < 0.5 ? 1 : 0; y += q.r() < 0.6 ? 1 : -1; } }
    return q;
  });
  reg('chiseled_stone_bricks', q => {
    base('#767676', 0.10, 21).frame(0, 0, 16, 16, '#5c5c5c');
    q.frame(3, 2, 10, 12, '#616161'); q.rect(6, 4, 4, 8, '#6d6d6d');
    q.hline(7, 5, 10, '#5a5a5a'); q.vline(7, 5, 10, '#5a5a5a'); return q;
  });
  reg('bricks', q => brickPat(q, '#a5a5a5', '#96604a', 4, 8, 0.14));
  reg('mud_bricks', q => brickPat(q, '#785e4c', '#8c6b52', 4, 8, 0.16));
  reg('andesite', q => { base('#8a8a8d', 0.14, 31); q.specks(40, '#9a9a9d'); q.specks(30, '#77777a'); return q; });
  reg('polished_andesite', q => base('#8c8c8f', 0.06, 32));
  reg('diorite', q => { base('#c9c9c9', 0.12, 33); q.specks(46, '#e0e0e0'); q.specks(30, '#a8a8a8'); return q; });
  reg('polished_diorite', q => base('#cdcdcd', 0.05, 34));
  reg('granite', q => { base('#9a6a5a', 0.14, 35); q.specks(40, '#b08070'); q.specks(30, '#8a5a4a'); return q; });
  reg('polished_granite', q => base('#a06e5e', 0.06, 36));
  reg('tuff', q => { base('#6d6f63', 0.18, 37); q.specks(50, '#5c5e53'); return q; });
  reg('calcite', q => base('#dfdfd6', 0.07, 38));
  reg('blackstone', q => { base('#2b2825', 0.24, 39); q.specks(30, '#3a3630'); return q; });
  reg('bedrock', q => { base('#565656', 0.4, 41); q.specks(40, '#333'); q.specks(40, '#777'); return q; });
  reg('obsidian', q => { base('#150d1f', 0.35, 42); q.specks(24, '#3a2560'); return q; });
  reg('crying_obsidian', q => { base('#1a0f28', 0.3, 43); q.specks(20, '#6a2fb0'); q.specks(8, '#a24df0'); return q; });
  reg('netherrack', q => { base('#6c2828', 0.28, 44); q.specks(40, '#5a1e1e'); return q; });
  reg('nether_bricks', q => brickPat(q, '#20141a', '#33222a', 4, 8, 0.2));
  reg('red_nether_bricks', q => brickPat(q, '#2a0508', '#661012', 4, 8, 0.22));
  reg('magma', q => {
    base('#6e2c0c', 0.10, 45);
    for (let i = 0; i < 5; i++) {
      const x = (q.r() * 12) | 0, y = (q.r() * 12) | 0;
      q.rect(x, y, 3 + ((q.r() * 3) | 0), 2 + ((q.r() * 2) | 0), '#e8791c');
    }
    for (let i = 0; i < 3; i++) { const x = (q.r() * 14) | 0, y = (q.r() * 14) | 0; q.rect(x, y, 2, 2, '#ffc061'); }
    q.noise(0.08); return q;
  });
  reg('lava', q => {
    base('#e2620f', 0.08, 46);
    // broad molten pools, then a couple of cooler crusts — no confetti
    for (let i = 0; i < 5; i++) {
      const x = (q.r() * 12) | 0, y = (q.r() * 12) | 0;
      q.rect(x, y, 4 + ((q.r() * 3) | 0), 3 + ((q.r() * 3) | 0), '#ff9b23');
    }
    for (let i = 0; i < 3; i++) {
      const x = (q.r() * 13) | 0, y = (q.r() * 13) | 0;
      q.rect(x, y, 3, 2, '#b8460b');
    }
    for (let i = 0; i < 4; i++) { const x = (q.r() * 14) | 0, y = (q.r() * 14) | 0; q.rect(x, y, 2, 2, '#ffd071'); }
    q.noise(0.07);
    return q;
  });
  reg('soul_sand', q => { base('#523b31', 0.18, 47); for (let i = 0; i < 3; i++) { const x = 2 + ((q.r() * 10) | 0), y = 2 + ((q.r() * 10) | 0); q.rect(x, y, 3, 3, '#3d2b23'); q.px(x + 1, y + 1, '#2a1c16'); } return q; });
  reg('soul_soil', q => { base('#4b3830', 0.2, 48); q.specks(24, '#3a2a24'); return q; });
  reg('purpur', q => { base('#a779a7', 0.12, 49); q.specks(30, '#b98cb9'); return q; });

  /* ===== dirt / ground ===== */
  reg('dirt', q => { base('#8f6a4a', 0.22, 51); q.specks(30, '#7d5b3f'); return q; });
  reg('coarse_dirt', q => { base('#8a6242', 0.28, 52); q.specks(40, '#6e4c33'); q.specks(20, '#9b7350'); return q; });
  reg('rooted_dirt', q => { base('#946b4d', 0.2, 53); q.specks(22, '#c8ad8a'); return q; });
  reg('grass_top', q => { base('#5f9a3a', 0.13, 54); q.specks(22, '#6aa540'); q.specks(16, '#568e34'); return q; });
  reg('grass_side', q => {
    base('#8f6a4a', 0.22, 55); q.specks(24, '#7d5b3f');
    for (let x = 0; x < 16; x++) {
      const h = 3 + ((q.r() * 3) | 0);
      for (let y = 0; y < h; y++) q.px(x, y, sh('#5f9a3a', 0.85 + q.r() * 0.35));
    }
    return q;
  });
  reg('podzol_top', q => { base('#6b4c2a', 0.24, 56); q.specks(36, '#8a6a3a'); return q; });
  reg('podzol_side', q => {
    base('#8f6a4a', 0.22, 57);
    for (let x = 0; x < 16; x++) { const h = 3 + ((q.r() * 2) | 0); for (let y = 0; y < h; y++) q.px(x, y, sh('#6b4c2a', 0.85 + q.r() * 0.3)); }
    return q;
  });
  reg('path_top', q => { base('#9a7c4f', 0.16, 58); q.frame(0, 0, 16, 16, '#8a6c42'); q.specks(20, '#a98d5e'); return q; });
  reg('path_side', q => {
    base('#8f6a4a', 0.22, 59);
    for (let x = 0; x < 16; x++) q.px(x, 0, '#9a7c4f');
    return q;
  });
  reg('farmland', q => { base('#6b4a2c', 0.16, 61); for (let ry = 0; ry < 4; ry++) q.hline(ry * 4 + 3, 0, 15, '#563a22'); return q; });
  reg('farmland_wet', q => { base('#402a18', 0.14, 62); for (let ry = 0; ry < 4; ry++) q.hline(ry * 4 + 3, 0, 15, '#2f1f11'); return q; });
  reg('sand', q => { base('#dbcf9a', 0.12, 63); q.specks(30, '#cabf8a'); return q; });
  reg('sandstone_top', q => base('#dbcf9a', 0.08, 64));
  reg('sandstone', q => { base('#d6c88f', 0.1, 65); q.hline(3, 0, 15, '#c4b47c'); q.hline(11, 0, 15, '#c4b47c'); return q; });
  reg('gravel', q => {
    base('#7f7c78', 0.3, 66); q.specks(30, '#5d5a57', 2); q.specks(24, '#9b9895', 2); return q;
  });
  reg('clay', q => base('#a0a6b4', 0.1, 67));
  reg('moss', q => { base('#5a7331', 0.15, 68); q.specks(24, '#6a8639'); q.specks(14, '#4c6329'); return q; });
  reg('snow', q => base('#f2f6f7', 0.05, 69));
  reg('packed_ice', q => base('#a5c0f0', 0.08, 70));
  reg('ice', q => { glassPat(q, '#96b8f0', 190); return q; });
  reg('water', q => {
    base('#2f56b8', 0.12, 71);
    q.specks(20, '#4a72d8'); q.specks(12, '#8fb0ff');
    return q;
  });

  /* ===== ores ===== */
  function ore(name, spot, seed) {
    reg(name, q => {
      base('#7a7a7a', 0.2, seed);
      const blobs = [[3, 3], [10, 4], [5, 10], [11, 11], [2, 8]];
      for (const [x, y] of blobs) {
        if (q.r() < 0.25) continue;
        q.rect(x, y, 3, 3, spot); q.px(x, y, sh(spot, 0.8)); q.px(x + 2, y + 2, sh(spot, 1.2));
      }
      return q;
    });
  }
  ore('coal_ore', '#22201f', 72); ore('iron_ore', '#c8ab90', 73); ore('gold_ore', '#f2cd5c', 74);
  ore('diamond_ore', '#5decf5', 75); ore('redstone_ore', '#e02020', 76); ore('emerald_ore', '#2ce56a', 77);

  /* ===== wood ===== */
  reg('oak_planks', q => plankPat(q, '#b0854e', 4));
  reg('spruce_planks', q => plankPat(q, '#7a5c37', 4));
  reg('birch_planks', q => plankPat(q, '#d0bb8a', 4));
  reg('dark_oak_planks', q => plankPat(q, '#50361c', 4));
  reg('jungle_planks', q => plankPat(q, '#a97b57', 4));
  reg('acacia_planks', q => plankPat(q, '#b5643a', 4));
  reg('oak_log', q => logSide(q, '#6b5334', '#4d3b24'));
  reg('oak_log_top', q => logTop(q, '#b0854e', '#6b5334'));
  reg('spruce_log', q => logSide(q, '#3b2a18', '#2a1d10'));
  reg('spruce_log_top', q => logTop(q, '#7a5c37', '#3b2a18'));
  reg('birch_log', q => {
    q.fill('#d8d3c6'); q.noise(0.08);
    for (let i = 0; i < 9; i++) { const y = (q.r() * 16) | 0, x = (q.r() * 12) | 0, w = 2 + ((q.r() * 4) | 0); q.rect(x, y, w, 1, '#463f36'); }
    return q;
  });
  reg('birch_log_top', q => logTop(q, '#d0bb8a', '#a08e63'));
  reg('dark_oak_log', q => logSide(q, '#3a2a17', '#241a0e'));
  reg('dark_oak_log_top', q => logTop(q, '#50361c', '#3a2a17'));
  reg('stripped_oak_log', q => { plankPat(q, '#b0854e', 16); for (let i = 0; i < 6; i++) q.vline((q.r() * 16) | 0, 0, 15, sh('#b0854e', 0.86)); return q; });
  reg('stripped_spruce_log', q => { plankPat(q, '#7a5c37', 16); for (let i = 0; i < 6; i++) q.vline((q.r() * 16) | 0, 0, 15, sh('#7a5c37', 0.86)); return q; });
  reg('oak_leaves', q => leafPat(q, '#4c8b2b', 0.16));
  reg('birch_leaves', q => leafPat(q, '#76a94a', 0.18));
  reg('spruce_leaves', q => leafPat(q, '#33622f', 0.15));
  reg('dark_oak_leaves', q => leafPat(q, '#3c7226', 0.14));
  reg('azalea_leaves', q => leafPat(q, '#4f8836', 0.16));
  reg('flowering_azalea', q => { leafPat(q, '#4f8836', 0.16); for (let i = 0; i < 10; i++) { const x = (q.r() * 15) | 0, y = (q.r() * 15) | 0; q.rect(x, y, 2, 2, q.r() < 0.5 ? '#e58fc4' : '#f5c6e0'); } return q; });

  /* ===== quartz / metal ===== */
  reg('quartz', q => { base('#e6e1da', 0.07, 81); q.specks(20, '#f2eee8'); return q; });
  reg('smooth_quartz', q => base('#e9e4dd', 0.03, 82));
  reg('quartz_pillar', q => { base('#e6e1da', 0.05, 83); q.frame(0, 0, 16, 16, '#d3cdc4'); q.hline(0, 0, 15, '#cfc9c0'); q.hline(15, 0, 15, '#cfc9c0'); return q; });
  reg('quartz_pillar_top', q => { base('#e9e4dd', 0.04, 84); q.frame(2, 2, 12, 12, '#d0cac1'); return q; });
  reg('chiseled_quartz', q => { base('#e6e1da', 0.05, 85); q.frame(1, 1, 14, 14, '#d0cac1'); q.rect(5, 3, 6, 10, '#ded8d0'); q.vline(8, 4, 11, '#cbc5bc'); return q; });
  reg('quartz_bricks', q => brickPat(q, '#d2ccc3', '#eae5de', 8, 8, 0.06));
  reg('iron_block', q => { base('#d8d8d8', 0.06, 86); q.frame(0, 0, 16, 16, '#bdbdbd'); return q; });
  reg('gold_block', q => { base('#f6d33c', 0.07, 87); q.frame(0, 0, 16, 16, '#dcb524'); q.hline(2, 2, 13, '#ffe884'); return q; });
  reg('diamond_block', q => { base('#5decf5', 0.09, 88); q.specks(12, '#a8fbff', 2); q.frame(0, 0, 16, 16, '#3fbfc7'); return q; });
  reg('emerald_block', q => { base('#2ce56a', 0.1, 89); q.specks(12, '#7dffab', 2); q.frame(0, 0, 16, 16, '#1fa84e'); return q; });
  reg('copper_block', q => { base('#c06e4f', 0.08, 90); q.specks(18, '#d98a68'); return q; });
  reg('oxidized_copper', q => { base('#53a486', 0.1, 91); q.specks(22, '#6dbb9c'); return q; });
  reg('prismarine', q => { base('#5f9e8f', 0.16, 92); q.specks(30, '#74b6a5'); q.specks(20, '#4a8477'); return q; });
  reg('prismarine_bricks', q => brickPat(q, '#4c8a7c', '#63a494', 8, 8, 0.12));
  reg('dark_prismarine', q => { base('#33604f', 0.12, 93); q.specks(22, '#3d7460'); return q; });
  reg('sea_lantern', q => { base('#b8ddd6', 0.06, 94); q.rect(2, 2, 5, 5, '#e6f7f3'); q.rect(9, 2, 5, 5, '#dcf2ed'); q.rect(2, 9, 5, 5, '#dcf2ed'); q.rect(9, 9, 5, 5, '#e6f7f3'); return q; });
  reg('glowstone', q => { base('#a97b3a', 0.14, 95); for (let i = 0; i < 14; i++) { const x = (q.r() * 14) | 0, y = (q.r() * 14) | 0; q.rect(x, y, 2, 2, '#ffe9a8'); } return q; });
  reg('shroomlight', q => { base('#f0873a', 0.12, 96); q.specks(16, '#ffd07a', 2); q.specks(10, '#c05a20', 2); return q; });
  reg('ochre_froglight', q => { base('#f6e2a0', 0.1, 97); q.specks(14, '#fff6d0', 2); return q; });
  reg('redstone_lamp', q => { base('#9a6236', 0.12, 98); q.frame(0, 0, 16, 16, '#7a4c28'); q.rect(4, 4, 8, 8, '#ffb864'); q.rect(6, 6, 4, 4, '#ffe0a8'); return q; });
  reg('observer_top', q => { base('#4c4c50', 0.1, 99); q.rect(3, 3, 10, 10, '#5c5c60'); return q; });
  reg('observer_side', q => { base('#4c4c50', 0.1, 100); q.rect(2, 2, 12, 5, '#6a6a70'); q.rect(2, 9, 12, 5, '#3a3a3e'); q.rect(6, 10, 4, 3, '#e04040'); return q; });
  reg('piston_top', q => { plankPat(q, '#c2a877', 4); q.frame(0, 0, 16, 16, '#8a7a55'); return q; });
  reg('piston_bottom', q => { base('#8a8a8a', 0.12, 101); q.frame(3, 3, 10, 10, '#6a6a6a'); return q; });
  reg('piston_side', q => { base('#9a9a9a', 0.1, 102); q.rect(0, 0, 16, 4, '#c2a877'); q.hline(4, 0, 15, '#6a6a6a'); q.frame(0, 0, 16, 16, '#7a7a7a'); return q; });
  reg('target', q => { base('#e8e0d0', 0.06, 103); q.rect(4, 4, 8, 8, '#d04030'); q.rect(6, 6, 4, 4, '#e8e0d0'); return q; });
  reg('tnt_top', q => { base('#c33', 0.08, 104); q.frame(0, 0, 16, 16, '#8a2222'); return q; });
  reg('tnt_side', q => { base('#c33', 0.08, 105); q.rect(0, 5, 16, 6, '#f0f0f0'); q.rect(2, 6, 12, 4, '#d84040'); q.rect(4, 7, 8, 2, '#f0f0f0'); return q; });
  reg('slime', q => { glassPat(q, '#79c05a', 150); q.frame(3, 3, 10, 10, [110, 190, 90, 200]); return q; });
  reg('shulker_top', q => { base('#9a6f9a', 0.08, 106); q.frame(2, 2, 12, 12, '#7a4f7a'); return q; });
  reg('shulker_side', q => { base('#9a6f9a', 0.08, 107); q.rect(0, 0, 16, 6, '#b284b2'); q.hline(6, 0, 15, '#6a3f6a'); return q; });

  /* ===== concrete / terracotta / wool / glass families ===== */
  let fam = 200;
  for (const k in DYE) {
    const c = DYE[k];
    reg('c_' + k, ((cc, s) => q => base(cc, 0.05, s))(c, fam++));
    reg('w_' + k, ((cc, s) => q => {
      base(cc, 0.16, s);
      for (let y = 0; y < 16; y += 2) for (let x = (y / 2) % 2; x < 16; x += 2) q.blend(x, y, sh(cc, 0.85), 0.45);
      return q;
    })(c, fam++));
    reg('g_' + k, ((cc, s) => q => glassPat(q, cc, 105))(c, fam++));
  }
  for (const k in TERRA) {
    reg('t_' + k, ((cc, s) => q => {
      base(cc, 0.14, s);
      for (let i = 0; i < 8; i++) { const y = (q.r() * 16) | 0; q.hline(y, 0, 15, sh(cc, 0.86 + q.r() * 0.28)); }
      q.specks(20, sh(cc, 0.8)); return q;
    })(TERRA[k], fam++));
  }
  reg('glass', q => glassPat(q, '#c8e4ee', 46));
  reg('glass_tinted', q => glassPat(q, '#2a2530', 180));
  reg('iron_bars', q => {
    q.clear();
    q.rect(6, 0, 2, 16, '#b8b8b8'); q.rect(6, 0, 1, 16, '#d4d4d4');
    q.rect(1, 0, 1, 16, '#a0a0a0'); q.rect(13, 0, 1, 16, '#a0a0a0');
    return q;
  });

  /* ===== bee / honey ===== */
  reg('honeycomb', q => {
    q.fill('#e5a729');
    for (let ry = 0; ry < 4; ry++) for (let cx = 0; cx < 4; cx++) {
      const x = cx * 4 + (ry % 2 ? 2 : 0), y = ry * 4;
      q.rect(x + 1, y + 1, 2, 2, '#c98a14'); q.px(x + 1, y + 1, '#a86f0c');
    }
    q.noise(0.1); return q;
  });
  reg('honey', q => { glassPat(q, '#f0a81e', 200); q.specks(12, '#ffd070'); return q; });
  reg('bee_nest_top', q => { plankPat(q, '#c8a35a', 4); return q; });
  reg('bee_nest_side', q => {
    plankPat(q, '#c8a35a', 4);
    q.rect(5, 9, 6, 5, '#4a3218'); q.rect(6, 10, 4, 3, '#2a1c0c');
    q.rect(2, 2, 12, 5, '#e0b76a'); return q;
  });
  reg('beehive_top', q => plankPat(q, '#b0854e', 4));
  reg('beehive_side', q => { plankPat(q, '#b0854e', 4); q.rect(5, 10, 6, 4, '#3a2812'); q.hline(8, 0, 15, '#8a6538'); return q; });

  /* ===== utility block faces ===== */
  reg('furnace_top', q => { base('#7a7a7a', 0.12, 111); q.frame(2, 2, 12, 12, '#5a5a5a'); return q; });
  reg('furnace_side', q => base('#767676', 0.14, 112));
  reg('furnace_front', q => {
    base('#767676', 0.12, 113);
    q.rect(3, 6, 10, 8, '#3a3a3a'); q.rect(4, 8, 8, 5, '#141414');
    q.rect(4, 11, 8, 2, '#e07020'); q.rect(5, 12, 6, 1, '#ffbe4a');
    q.rect(3, 3, 10, 2, '#5c5c5c'); return q;
  });
  reg('blast_side', q => { base('#5e5e5e', 0.12, 114); q.frame(0, 0, 16, 16, '#4a4a4a'); return q; });
  reg('blast_front', q => {
    base('#5e5e5e', 0.1, 115);
    q.rect(2, 5, 12, 9, '#2e2e2e'); q.rect(3, 6, 10, 7, '#111');
    for (let x = 3; x < 13; x += 3) q.rect(x, 6, 1, 7, '#4a4a4a');
    q.rect(3, 11, 10, 2, '#4aa8ff'); q.rect(4, 12, 8, 1, '#c8e8ff'); return q;
  });
  reg('smoker_top', q => { logTop(q, '#7a5c37', '#3b2a18'); q.frame(4, 4, 8, 8, '#2a2a2a'); return q; });
  reg('smoker_side', q => { logSide(q, '#3b2a18', '#2a1d10'); q.hline(3, 0, 15, '#6a6a6a'); q.hline(12, 0, 15, '#6a6a6a'); return q; });
  reg('smoker_front', q => {
    logSide(q, '#3b2a18', '#2a1d10');
    q.rect(3, 6, 10, 8, '#2a2a2a'); q.rect(4, 8, 8, 5, '#0f0f0f');
    q.rect(4, 11, 8, 2, '#e06a20'); return q;
  });
  reg('dispenser_front', q => { base('#767676', 0.12, 116); q.rect(4, 4, 8, 8, '#3a3a3a'); q.rect(6, 6, 4, 4, '#101010'); return q; });
  reg('crafting_top', q => { plankPat(q, '#b0854e', 4); q.frame(0, 0, 16, 16, '#6a4f2c'); for (let i = 1; i < 4; i++) { q.vline(i * 4, 0, 15, '#7a5c37'); q.hline(i * 4, 0, 15, '#7a5c37'); } return q; });
  reg('crafting_side', q => { plankPat(q, '#a07a48', 4); q.rect(1, 3, 14, 4, '#6a4f2c'); q.rect(2, 9, 12, 4, '#8a6838'); return q; });
  reg('barrel_top', q => { plankPat(q, '#7a5c37', 4); q.frame(3, 3, 10, 10, '#5a4228'); q.rect(6, 6, 4, 4, '#4a3520'); return q; });
  reg('barrel_side', q => { plankPat(q, '#7a5c37', 5); q.hline(2, 0, 15, '#4a4a4a'); q.hline(3, 0, 15, '#6a6a6a'); q.hline(12, 0, 15, '#4a4a4a'); q.hline(13, 0, 15, '#6a6a6a'); return q; });
  reg('noteblock', q => { plankPat(q, '#6a4f2c', 4); q.specks(24, '#3a2a18'); return q; });
  reg('jukebox_top', q => { plankPat(q, '#6a4f2c', 4); q.rect(4, 4, 8, 8, '#2a2a2a'); q.rect(7, 7, 2, 2, '#c0c0c0'); return q; });
  reg('bookshelf', q => {
    plankPat(q, '#b0854e', 16);
    const cols = ['#a63a3a', '#3a5aa6', '#3a8a4a', '#c8a83a', '#8a3a8a', '#c86a2a', '#d8d8d8'];
    for (const y0 of [1, 9]) {
      let x = 1;
      while (x < 15) { const w = 1 + ((q.r() * 2) | 0); q.rect(x, y0, w, 6, cols[(q.r() * cols.length) | 0]); q.rect(x, y0, w, 1, '#e8e0c8'); x += w + 1; }
      q.hline(y0 + 6, 0, 15, '#6a4f2c');
    }
    return q;
  });
  reg('chiseled_bookshelf', q => { plankPat(q, '#a07a48', 16); q.rect(1, 2, 6, 5, '#3a2a18'); q.rect(9, 2, 6, 5, '#3a2a18'); q.rect(1, 9, 6, 5, '#3a2a18'); q.rect(9, 9, 6, 5, '#3a2a18'); return q; });
  reg('loom_top', q => { plankPat(q, '#c8bda0', 4); q.rect(4, 4, 8, 8, '#8a7a58'); return q; });
  reg('loom_side', q => { plankPat(q, '#b0854e', 4); q.rect(3, 2, 10, 8, '#d8d0b8'); for (let x = 4; x < 13; x += 2) q.vline(x, 3, 9, '#a89870'); return q; });
  reg('smithing_top', q => { base('#3a3a42', 0.1, 117); q.rect(3, 3, 10, 10, '#5a5a64'); return q; });
  reg('smithing_side', q => { base('#4a4a52', 0.1, 118); q.rect(0, 0, 16, 4, '#3a2a18'); q.rect(2, 6, 12, 6, '#6a6a74'); return q; });
  reg('cartography_top', q => { plankPat(q, '#c8bda0', 4); q.rect(3, 3, 10, 10, '#e8e0c8'); q.frame(3, 3, 10, 10, '#8a7a58'); return q; });
  reg('cartography_side', q => { plankPat(q, '#7a5c37', 4); q.rect(2, 3, 12, 6, '#e8e0c8'); q.hline(6, 3, 12, '#a86a3a'); return q; });
  reg('composter_top', q => { plankPat(q, '#6a4f2c', 4); q.rect(3, 3, 10, 10, '#4a6a28'); return q; });
  reg('composter_side', q => { plankPat(q, '#7a5c37', 4); for (let x = 2; x < 15; x += 4) q.vline(x, 0, 15, '#5a4228'); return q; });
  reg('hay_top', q => { base('#c8a83a', 0.14, 119); q.frame(0, 0, 16, 16, '#8a7020'); q.rect(6, 6, 4, 4, '#e0c860'); return q; });
  reg('hay_side', q => { base('#c8a83a', 0.16, 120); for (let y = 0; y < 16; y += 2) q.hline(y, 0, 15, sh('#c8a83a', 0.85)); q.vline(0, 0, 15, '#5a4a18'); q.vline(15, 0, 15, '#5a4a18'); return q; });
  reg('ench_top', q => { base('#1a0f28', 0.2, 121); q.rect(3, 3, 10, 10, '#c8202a'); q.rect(5, 5, 6, 6, '#e04050'); return q; });
  reg('ench_side', q => { base('#1a0f28', 0.2, 122); q.rect(0, 0, 16, 5, '#c8202a'); for (let i = 0; i < 8; i++) q.px((q.r() * 16) | 0, 6 + ((q.r() * 9) | 0), '#8a4ad8'); return q; });
  reg('chest', q => {
    base('#8a6538', 0.1, 123).frame(0, 0, 16, 16, '#5a4020');
    q.hline(4, 0, 15, '#5a4020'); q.hline(5, 0, 15, '#6a4c28');
    q.rect(6, 3, 4, 4, '#4a4a4a'); q.rect(7, 4, 2, 2, '#d8b040'); return q;
  });
  reg('chest_trapped', q => { P.chest(q); q.rect(6, 3, 4, 4, '#a03030'); q.rect(7, 4, 2, 2, '#e05050'); return q; });
  reg('ender_chest', q => {
    base('#1a2a2e', 0.14, 124).frame(0, 0, 16, 16, '#0e181a');
    q.hline(4, 0, 15, '#0e181a'); q.rect(6, 3, 4, 4, '#2a4a50'); q.rect(7, 4, 2, 2, '#5cf0c8');
    q.specks(10, '#3ad8b0'); return q;
  });
  reg('anvil', q => { base('#48484c', 0.12, 125); q.rect(0, 0, 16, 4, '#5a5a60'); q.rect(3, 4, 10, 8, '#3a3a3e'); q.rect(0, 12, 16, 4, '#52525a'); return q; });
  reg('cauldron', q => { base('#4a4a4e', 0.12, 126); q.frame(0, 0, 16, 16, '#2e2e32'); q.hline(2, 0, 15, '#5a5a60'); return q; });
  reg('brewing', q => { base('#8a8a90', 0.12, 127); q.rect(6, 0, 4, 10, '#c0c0c8'); q.rect(4, 10, 8, 6, '#6a5a4a'); q.rect(6, 3, 4, 3, '#e05a90'); return q; });
  reg('hopper', q => { base('#3a3a3e', 0.12, 128); q.rect(0, 0, 16, 3, '#5a5a60'); q.rect(5, 8, 6, 8, '#2a2a2e'); return q; });
  reg('lectern', q => { plankPat(q, '#7a5c37', 4); q.rect(2, 1, 12, 6, '#e8e0c8'); q.vline(8, 1, 6, '#a89870'); return q; });
  reg('flowerpot', q => { base('#a05a3a', 0.12, 129); q.rect(0, 0, 16, 3, '#b06a46'); q.rect(3, 3, 10, 13, '#8a4a2e'); return q; });
  reg('cake', q => { base('#f0e8d8', 0.06, 130); q.rect(0, 0, 16, 4, '#e0e0e8'); q.rect(0, 0, 16, 2, '#c84a5a'); q.specks(8, '#f04a6a'); return q; });
  reg('scaffold', q => {
    q.clear(); q.rect(0, 0, 16, 3, '#c8a35a');
    q.rect(0, 0, 2, 16, '#a08040'); q.rect(14, 0, 2, 16, '#a08040');
    q.rect(6, 0, 2, 16, '#b08a48'); return q;
  });
  reg('ladder', q => {
    q.clear(); q.rect(1, 0, 2, 16, '#8a6538'); q.rect(13, 0, 2, 16, '#8a6538');
    for (let y = 2; y < 16; y += 5) q.rect(1, y, 14, 2, '#a07a48');
    return q;
  });
  reg('rail', q => {
    q.clear(); q.rect(2, 0, 3, 16, '#8a8a90'); q.rect(11, 0, 3, 16, '#8a8a90');
    for (let y = 1; y < 16; y += 4) q.rect(0, y, 16, 2, '#6a5030');
    return q;
  });
  reg('powered_rail', q => { P.rail(q); for (let y = 1; y < 16; y += 4) q.rect(0, y, 16, 2, '#c8a020'); return q; });
  reg('redstone_wire', q => { q.clear(); q.rect(6, 0, 4, 16, '#c02020'); q.rect(0, 6, 16, 4, '#c02020'); return q; });
  reg('redstone_torch', q => { q.clear(); q.rect(7, 6, 2, 10, '#6a4f2c'); q.rect(6, 3, 4, 3, '#ff3030'); return q; });
  reg('armor_stand', q => { q.clear(); q.rect(7, 2, 2, 12, '#b0854e'); q.rect(4, 4, 8, 2, '#a07a48'); q.rect(5, 14, 6, 2, '#8a6538'); return q; });
  reg('item_frame', q => {
    q.clear(); q.frame(1, 1, 14, 14, '#8a6538'); q.frame(2, 2, 12, 12, '#a07a48');
    q.rect(4, 4, 8, 8, [200, 190, 170, 210]); q.rect(6, 6, 4, 4, '#7a7a90'); return q;
  });
  reg('map_frame', q => { q.clear(); q.frame(1, 1, 14, 14, '#8a6538'); q.rect(3, 3, 10, 10, '#e8e0c0'); q.rect(5, 5, 3, 3, '#6a9a4a'); q.rect(9, 8, 3, 4, '#4a7ab0'); return q; });
  reg('painting_a', q => { q.clear(); q.frame(0, 0, 16, 16, '#5a4020'); q.rect(1, 1, 14, 14, '#2a4a7a'); q.rect(3, 8, 10, 6, '#3a6a3a'); q.rect(10, 3, 3, 3, '#e8e070'); return q; });
  reg('painting_b', q => { q.clear(); q.frame(0, 0, 16, 16, '#5a4020'); q.rect(1, 1, 14, 14, '#7a3a3a'); q.rect(5, 4, 6, 9, '#e0c8a0'); q.rect(6, 6, 4, 2, '#2a2a2a'); return q; });
  reg('painting_c', q => { q.clear(); q.frame(0, 0, 16, 16, '#5a4020'); q.rect(1, 1, 14, 14, '#1a1a2a'); q.rect(2, 10, 12, 4, '#3a5a2a'); q.rect(11, 3, 3, 3, '#e8e8d0'); q.specks(10, '#ffffff'); return q; });
  reg('sign', q => { q.clear(); q.rect(0, 0, 16, 11, '#b0854e'); q.frame(0, 0, 16, 11, '#8a6538'); q.rect(7, 11, 2, 5, '#8a6538'); for (let i = 0; i < 3; i++) q.rect(3, 3 + i * 3, 10 - i * 2, 1, '#5a4020'); return q; });
  function signText(name, marks) {
    reg(name, q => { q.clear(); q.rect(0, 0, 16, 11, '#b0854e'); q.frame(0, 0, 16, 11, '#8a6538'); q.rect(7, 11, 2, 5, '#8a6538'); for (const [x, y, w] of marks) q.rect(x, y, w, 2, '#3a2a10'); return q; });
  }
  signText('sign_shop', [[3, 3, 10], [3, 6, 7]]);
  signText('sign_food', [[3, 3, 8], [3, 6, 10]]);
  signText('sign_gear', [[2, 3, 12], [4, 6, 6]]);
  signText('sign_trades', [[2, 3, 12], [2, 6, 12]]);
  signText('sign_spawn', [[2, 2, 12], [2, 5, 9], [2, 8, 11]]);

  /* ===== lights ===== */
  reg('torch', q => {
    q.clear(); q.rect(7, 6, 2, 10, '#8a6538'); q.rect(7, 6, 1, 10, '#a87f48');
    q.rect(6, 3, 4, 3, '#ffb43a'); q.rect(7, 2, 2, 2, '#fff0a0'); return q;
  });
  reg('soul_torch', q => { q.clear(); q.rect(7, 6, 2, 10, '#8a6538'); q.rect(6, 3, 4, 3, '#3ad8f0'); q.rect(7, 2, 2, 2, '#c0f8ff'); return q; });
  reg('lantern', q => {
    q.clear(); q.rect(5, 2, 6, 11, '#7a6a48'); q.rect(6, 4, 4, 7, '#ffd070');
    q.rect(6, 5, 4, 5, '#fff2b8'); q.rect(4, 2, 8, 2, '#8a7a58'); q.rect(4, 11, 8, 2, '#8a7a58');
    q.rect(7, 0, 2, 2, '#9a8a68'); return q;
  });
  reg('soul_lantern', q => { P.lantern(q); q.rect(6, 4, 4, 7, '#3ad8f0'); q.rect(6, 5, 4, 5, '#c0f8ff'); return q; });
  reg('campfire_top', q => {
    logTop(q, '#6a4f2c', '#3a2a18');
    q.rect(3, 3, 10, 10, '#2a1a0a'); q.rect(5, 5, 6, 6, '#ff8a20'); q.rect(6, 6, 4, 4, '#ffd070'); return q;
  });
  reg('campfire_side', q => { logSide(q, '#6a4f2c', '#3a2a18'); q.rect(0, 10, 16, 6, '#ff8a20'); q.rect(2, 12, 12, 4, '#ffd070'); return q; });
  reg('soul_campfire_top', q => { P.campfire_top(q); q.rect(5, 5, 6, 6, '#28c0e0'); q.rect(6, 6, 4, 4, '#c0f8ff'); return q; });
  reg('pumpkin_top', q => { base('#c07018', 0.12, 131); q.rect(6, 6, 4, 4, '#6a4a20'); return q; });
  reg('pumpkin_side', q => { base('#c07018', 0.1, 132); for (let x = 1; x < 16; x += 3) q.vline(x, 0, 15, '#a05a10'); return q; });
  reg('pumpkin_face', q => {
    P.pumpkin_side(q);
    q.rect(3, 4, 3, 3, '#3a2208'); q.rect(10, 4, 3, 3, '#3a2208');
    q.rect(4, 9, 8, 3, '#3a2208'); q.rect(6, 8, 2, 1, '#3a2208'); return q;
  });
  reg('jack_front', q => {
    P.pumpkin_side(q);
    q.rect(3, 4, 3, 3, '#ffd070'); q.rect(10, 4, 3, 3, '#ffd070');
    q.rect(4, 9, 8, 3, '#ffb43a'); q.rect(6, 8, 2, 1, '#ffd070'); return q;
  });
  reg('end_rod', q => { q.clear(); q.rect(6, 0, 4, 16, '#f0e8e0'); q.rect(7, 0, 2, 16, '#ffffff'); q.rect(5, 12, 6, 4, '#c8b8d0'); return q; });
  reg('chain', q => { q.clear(); for (let y = 0; y < 16; y += 4) { q.rect(6, y, 4, 3, '#4a4a52'); q.rect(7, y + 1, 2, 1, '#7a7a86'); } return q; });
  reg('candle', q => { q.clear(); q.rect(7, 5, 2, 11, '#e8e0c8'); q.rect(7, 2, 2, 3, '#ffc040'); return q; });
  reg('end_frame_top', q => { base('#dde6d8', 0.06, 133); q.rect(3, 3, 10, 10, '#3a4a3a'); return q; });
  reg('end_frame_bottom', q => base('#4a4a52', 0.1, 134));
  reg('end_frame_side', q => { base('#dde6d8', 0.07, 135); q.rect(0, 0, 16, 4, '#c8d4c4'); q.rect(0, 12, 16, 4, '#5a6a58'); return q; });

  /* ===== beds / banners ===== */
  for (const k of ['red', 'white', 'blue', 'green', 'yellow', 'purple']) {
    const c = DYE[k];
    reg('bed_' + k + '_top', ((cc, s) => q => { base(cc, 0.08, s); q.rect(3, 1, 10, 5, '#f0f0f0'); q.frame(0, 0, 16, 16, sh(cc, 0.8)); return q; })(c, fam++));
    reg('bed_' + k + '_side', ((cc, s) => q => { base(cc, 0.08, s); q.rect(0, 12, 16, 4, '#b0854e'); q.rect(0, 0, 16, 3, sh(cc, 1.12)); return q; })(c, fam++));
    reg('banner_' + k, ((cc, s) => q => {
      q.clear(); q.rect(2, 1, 12, 15, cc); q.noise(0.1);
      q.rect(1, 0, 14, 1, '#8a7a58'); q.rect(6, 4, 4, 4, sh(cc, 0.7)); q.rect(2, 12, 12, 2, sh(cc, 1.2)); return q;
    })(c, fam++));
  }

  /* ===== doors / trapdoors ===== */
  function doorTex(name, col) {
    reg(name, q => {
      q.clear(); plankPat(q, col, 8);
      q.frame(0, 0, 16, 16, sh(col, 0.7));
      q.rect(2, 2, 12, 5, sh(col, 1.1)); q.frame(2, 2, 12, 5, sh(col, 0.75));
      q.rect(12, 8, 2, 2, '#c8c8c8');
      return q;
    });
  }
  doorTex('door_oak', '#b0854e'); doorTex('door_spruce', '#7a5c37'); doorTex('door_dark_oak', '#50361c');
  reg('door_iron', q => { base('#c8c8c8', 0.06, 141); q.frame(0, 0, 16, 16, '#a0a0a0'); q.rect(2, 2, 12, 5, '#d4d4d4'); q.frame(2, 2, 12, 5, '#a8a8a8'); q.rect(12, 8, 2, 2, '#808080'); return q; });
  function tdTex(name, col) {
    reg(name, q => {
      q.clear(); q.rect(0, 0, 16, 3, col); q.rect(0, 13, 16, 3, col); q.rect(0, 0, 3, 16, col); q.rect(13, 0, 3, 16, col);
      q.rect(6, 3, 4, 10, sh(col, 0.9)); q.noise(0.12); return q;
    });
  }
  tdTex('trapdoor_oak', '#b0854e'); tdTex('trapdoor_spruce', '#7a5c37'); tdTex('trapdoor_dark_oak', '#50361c');
  reg('trapdoor_iron', q => { q.clear(); q.rect(0, 0, 16, 3, '#c0c0c0'); q.rect(0, 13, 16, 3, '#c0c0c0'); q.rect(0, 0, 3, 16, '#c0c0c0'); q.rect(13, 0, 3, 16, '#c0c0c0'); q.rect(5, 5, 6, 6, '#a8a8a8'); return q; });

  /* ===== plants ===== */
  reg('tall_grass', q => { plantPat(q, '#5f9a3a', '#6fae44', null, 12); for (let i = 0; i < 14; i++) { const x = 2 + ((q.r() * 12) | 0), y = 4 + ((q.r() * 11) | 0); q.px(x, y, sh('#5f9a3a', 0.8 + q.r() * 0.5)); } return q; });
  reg('fern', q => { plantPat(q, '#4d8a30', '#5f9a3a', null, 11); for (let i = 0; i < 18; i++) { const x = 2 + ((q.r() * 12) | 0), y = 5 + ((q.r() * 10) | 0); q.px(x, y, sh('#4d8a30', 0.8 + q.r() * 0.5)); } return q; });
  reg('large_fern', q => { P.fern(q); for (let i = 0; i < 16; i++) q.px(1 + ((q.r() * 14) | 0), 1 + ((q.r() * 10) | 0), sh('#4d8a30', 0.9)); return q; });
  reg('dead_bush', q => { plantPat(q, '#7a5a2a', '#8a6a34', null, 10); for (let i = 0; i < 12; i++) q.px(3 + ((q.r() * 10) | 0), 6 + ((q.r() * 9) | 0), '#6a4a22'); return q; });
  function flower(name, stem, col, style, h) { reg(name, q => plantPat(q, stem || '#3f7a2a', '#4f8a34', col, h || 11, 3, style)); }
  flower('poppy', null, '#d02020'); flower('dandelion', null, '#ffd83a');
  flower('blue_orchid', null, '#3ac0e0'); flower('allium', null, '#b06ad0', 'ball');
  flower('cornflower', null, '#4a6ad0'); flower('oxeye_daisy', null, '#f0f0e0', 'ball');
  flower('lily_valley', null, '#f0f0f0'); flower('tulip_red', null, '#d03030', 'spike');
  flower('tulip_pink', null, '#f0a0c0', 'spike'); flower('tulip_orange', null, '#f08030', 'spike');
  flower('tulip_white', null, '#f0f0f0', 'spike'); flower('wither_rose', '#2a2a2a', '#1a1a1a');
  reg('sunflower', q => { plantPat(q, '#3f7a2a', '#4f8a34', '#f0c020', 14, 4, 'ball'); q.rect(6, 1, 4, 4, '#8a5a20'); return q; });
  reg('rose_bush', q => { plantPat(q, '#3f7a2a', '#4f8a34', '#c02030', 14, 4, 'ball'); for (let i = 0; i < 5; i++) q.rect(2 + ((q.r() * 11) | 0), 2 + ((q.r() * 8) | 0), 2, 2, '#c02030'); return q; });
  reg('lilac', q => { plantPat(q, '#3f7a2a', '#4f8a34', '#c090e0', 14, 4, 'ball'); for (let i = 0; i < 5; i++) q.rect(3 + ((q.r() * 9) | 0), 1 + ((q.r() * 7) | 0), 2, 2, '#d0a8ee'); return q; });
  reg('mushroom_red', q => { q.clear(); q.rect(7, 9, 2, 6, '#e0d8c8'); q.rect(4, 5, 8, 4, '#c02020'); q.px(6, 6, '#f0f0f0'); q.px(9, 7, '#f0f0f0'); return q; });
  reg('mushroom_brown', q => { q.clear(); q.rect(7, 9, 2, 6, '#e0d8c8'); q.rect(4, 6, 8, 3, '#9a7048'); return q; });
  reg('berry_bush', q => { leafPat(q, '#3a6a28', 0.35); for (let i = 0; i < 6; i++) q.rect(2 + ((q.r() * 12) | 0), 4 + ((q.r() * 10) | 0), 2, 2, '#d03020'); return q; });
  reg('wheat', q => { q.clear(); for (let x = 2; x < 15; x += 4) { q.rect(x, 4, 1, 12, '#c8a83a'); q.rect(x - 1, 3, 3, 4, '#e0c860'); q.px(x, 2, '#f0dc90'); } return q; });
  reg('wheat_young', q => { q.clear(); for (let x = 2; x < 15; x += 4) q.rect(x, 8, 1, 8, '#6aa83a'); return q; });
  reg('carrots', q => { q.clear(); for (let x = 2; x < 15; x += 4) { q.rect(x, 6, 1, 10, '#3a8a2a'); q.rect(x - 1, 5, 3, 3, '#4aa03a'); } q.rect(6, 13, 3, 3, '#e08020'); return q; });
  reg('potatoes', q => { q.clear(); for (let x = 2; x < 15; x += 4) { q.rect(x, 7, 1, 9, '#4a8a2a'); q.rect(x - 1, 6, 3, 3, '#5a9a3a'); } q.rect(9, 13, 3, 2, '#c8a060'); return q; });
  reg('beetroots', q => { q.clear(); for (let x = 2; x < 15; x += 4) { q.rect(x, 8, 1, 8, '#3a7a2a'); q.rect(x - 1, 7, 3, 3, '#a02a3a'); } return q; });
  reg('sugar_cane', q => { q.clear(); q.rect(6, 0, 4, 16, '#8ac06a'); q.rect(6, 0, 1, 16, '#a0d880'); for (let y = 2; y < 16; y += 5) q.rect(6, y, 4, 1, '#6a9a4a'); return q; });
  reg('bamboo', q => { q.clear(); q.rect(7, 0, 3, 16, '#6a9a2a'); q.rect(7, 0, 1, 16, '#84b83a'); for (let y = 3; y < 16; y += 6) q.rect(6, y, 5, 1, '#4a7a1a'); return q; });
  reg('cactus_side', q => { base('#3f7a2a', 0.12, 151); q.vline(0, 0, 15, '#2f6a1a'); q.vline(15, 0, 15, '#2f6a1a'); for (let i = 0; i < 8; i++) q.px(3 + ((q.r() * 10) | 0), (q.r() * 16) | 0, '#d8e8c0'); return q; });
  reg('cactus_top', q => { base('#4a8a30', 0.1, 152); q.frame(1, 1, 14, 14, '#2f6a1a'); return q; });
  reg('vine', q => {
    q.clear();
    for (let x = 0; x < 16; x++) {
      const h = 6 + ((q.r() * 10) | 0);
      for (let y = 0; y < h; y++) if (q.r() < 0.72) q.px(x, y, sh('#3a7a28', 0.7 + q.r() * 0.55));
    }
    return q;
  });
  reg('lily_pad', q => { q.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.2 && !(x > 7 && y > 7 && d > 4)) q.px(x, y, sh('#3a8a3a', 0.8 + q.r() * 0.4)); } return q; });
  reg('seagrass', q => { plantPat(q, '#2a8a5a', '#3aa06a', null, 13); return q; });
  reg('glow_lichen', q => { q.clear(); for (let i = 0; i < 60; i++) q.px((q.r() * 16) | 0, (q.r() * 16) | 0, q.r() < 0.5 ? '#7ac0a0' : '#a8e8c8'); return q; });
  reg('spore_blossom', q => { q.clear(); q.rect(4, 0, 8, 3, '#e08ab0'); q.rect(6, 3, 4, 2, '#c86a90'); for (let i = 0; i < 6; i++) q.px(2 + ((q.r() * 12) | 0), 5 + ((q.r() * 8) | 0), '#e8a8c8'); return q; });
  reg('melon_top', q => base('#6a9a2a', 0.12, 153));
  reg('melon_side', q => { base('#6a9a2a', 0.1, 154); for (let x = 1; x < 16; x += 4) { q.vline(x, 0, 15, '#3a6a18'); q.vline(x + 1, 0, 15, '#8aba4a'); } return q; });
  reg('melon', q => P.melon_side(q));
  reg('stem_plant', q => { q.clear(); q.rect(7, 4, 2, 12, '#5a8a2a'); for (let i = 0; i < 6; i++) q.px(4 + ((q.r() * 8) | 0), 5 + ((q.r() * 9) | 0), '#6a9a3a'); return q; });

  /* ===== critter props ===== */
  function critter(name, body, accent, eye) {
    reg(name, q => {
      q.clear(); q.rect(2, 4, 12, 10, body); q.noise(0.1);
      q.rect(1, 6, 3, 6, accent); q.rect(12, 6, 3, 6, accent);
      q.rect(4, 2, 8, 4, body); q.px(6, 4, eye || '#101010'); q.px(9, 4, eye || '#101010');
      return q;
    });
  }
  critter('cat', '#c8a878', '#a88858'); critter('wolf', '#d8d8d0', '#b0b0a8');
  critter('sheep', '#f0f0f0', '#e0e0e0'); critter('cow', '#4a3a2a', '#f0f0f0');
  critter('chicken', '#f0f0f0', '#e0c020');
  reg('bee', q => {
    q.clear(); q.rect(2, 4, 12, 9, '#e8c020');
    q.rect(4, 4, 2, 9, '#2a2a2a'); q.rect(8, 4, 2, 9, '#2a2a2a'); q.rect(12, 4, 2, 9, '#2a2a2a');
    q.rect(3, 1, 10, 3, [230, 240, 255, 170]); q.px(3, 6, '#101010'); q.px(3, 9, '#101010');
    return q;
  });

  /* ------------------------------------------------------------------ */
  /* build the whole array                                               */
  /* ------------------------------------------------------------------ */
  function buildAtlas(texNames, onProgress) {
    const n = texNames.length;
    const out = new Uint8Array(TS * TS * 4 * n);
    const missing = [];
    for (let i = 0; i < n; i++) {
      const name = texNames[i];
      const q = new Canvas().seed(1000 + i * 7919);
      const fn = P[name];
      if (fn) { const r = fn(q); if (r && r !== q && r.d) q.d.set(r.d); }
      else { missing.push(name); q.fill('#ff00ff'); q.rect(0, 0, 8, 8, '#000000'); q.rect(8, 8, 8, 8, '#000000'); }
      out.set(q.d, i * TS * TS * 4);
      if (onProgress && (i & 31) === 0) onProgress(i / n);
    }
    return { data: out, size: TS, count: n, missing };
  }

  root.MCTextures = { buildAtlas, TS, PAINTERS: P };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCTextures;
})(typeof globalThis !== 'undefined' ? globalThis : this);

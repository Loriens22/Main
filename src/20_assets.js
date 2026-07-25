/* ============================================================================
 * STEVE THE PC REPAIR MAN — 20_assets.js                            (AGENT B)
 * STV.Tex  — procedural canvas textures (cached)
 * STV.Mat  — cached materials + live screen materials
 * STV.Geo  — mesh factories (metric, floor-origin, XZ-centred)
 *
 * Rules obeyed: ES2019, no import/export/require, no ?. or ??, no class fields,
 * no external assets, no console.log, single IIFE, attaches only STV.Tex/Mat/Geo.
 *
 * CONVENTIONS FOR INTEGRATORS
 *   - Every factory returns a THREE.Group whose origin is at FLOOR LEVEL and
 *     centred in XZ.  group.position.set(x, floorY, z) "just works".
 *   - group.userData.size      = THREE.Vector3(w,h,d)
 *   - group.userData.colliders = [{type:'box', c:Vector3, h:Vector3}] in LOCAL space
 *   - Characters face LOCAL +Z  (matches Object3D.lookAt for non-camera objects).
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  /* =========================================================================
   * 0. SMALL HELPERS
   * =====================================================================*/

  function mkCanvas(w, h) {
    var c = null;
    try { c = document.createElement('canvas'); } catch (e) { return null; }
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }
  function ctx2d(c) {
    if (!c) return null;
    try { return c.getContext('2d'); } catch (e) { return null; }
  }

  function hx(hex) { return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 }; }
  function css(hex, a) {
    var c = hx(hex);
    if (a === undefined || a === null) return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function rgba(r, g, b, a) {
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function grey(v, a) { return rgba(v, v, v, a); }
  function mixHex(a, b, t) {
    var A = hx(a), B = hx(b);
    var r = Math.round(A.r + (B.r - A.r) * t);
    var g = Math.round(A.g + (B.g - A.g) * t);
    var bl = Math.round(A.b + (B.b - A.b) * t);
    return (r << 16) | (g << 8) | bl;
  }
  function shadeHex(hex, f) {
    var c = hx(hex);
    var r = Math.max(0, Math.min(255, Math.round(c.r * f)));
    var g = Math.max(0, Math.min(255, Math.round(c.g * f)));
    var b = Math.max(0, Math.min(255, Math.round(c.b * f)));
    return (r << 16) | (g << 8) | b;
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function cl255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  /* ---- deterministic tileable value noise ---- */
  var latCache = {};
  function lat(seed, n) {
    var k = seed + '_' + n;
    if (latCache[k]) return latCache[k];
    var r = STV.rng(seed), a = new Float32Array(n * n), i;
    for (i = 0; i < a.length; i++) a[i] = r();
    latCache[k] = a;
    return a;
  }
  /* x,y in tile space (1.0 == one full wrap) */
  function nse(seed, n, x, y) {
    var fx = x * n, fy = y * n;
    var ix = Math.floor(fx), iy = Math.floor(fy);
    var tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    var a = lat(seed, n);
    var i0 = ((ix % n) + n) % n, i1 = (i0 + 1) % n;
    var j0 = ((iy % n) + n) % n, j1 = (j0 + 1) % n;
    var v00 = a[j0 * n + i0], v10 = a[j0 * n + i1];
    var v01 = a[j1 * n + i0], v11 = a[j1 * n + i1];
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  }
  function fbm(seed, x, y, base, oct, gain) {
    var amp = 1, sum = 0, norm = 0;
    var n = base || 4, o = oct || 4, g = gain === undefined ? 0.5 : gain, i;
    for (i = 0; i < o; i++) {
      sum += nse(seed + i * 7919, n, x, y) * amp;
      norm += amp;
      amp *= g;
      n *= 2;
    }
    return norm > 0 ? sum / norm : 0.5;
  }

  /* ---- per-pixel loop over a 2D context ---- */
  function pixels(ctx, w, h, fn) {
    if (!ctx) return;
    var img, d, x, y, o;
    try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    d = img.data;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        o = (y * w + x) * 4;
        fn(x, y, d, o);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---- speckle helper: n dots of varying grey ---- */
  function speckle(ctx, w, h, r, count, sizeMin, sizeMax, colFn) {
    var i, x, y, s;
    for (i = 0; i < count; i++) {
      x = r() * w; y = r() * h;
      s = sizeMin + r() * (sizeMax - sizeMin);
      ctx.fillStyle = colFn(r, i);
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---- wandering crack / scratch line ---- */
  function crack(ctx, r, x, y, len, step, jitter, width, style) {
    var a = r() * Math.PI * 2, i;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (i = 0; i < len; i++) {
      a += (r() - 0.5) * jitter;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /* =========================================================================
   * 1. STV.Tex — procedural textures
   * =====================================================================*/

  var texCache = {};
  var Tex = {};
  STV.Tex = Tex;

  Tex.cache = texCache;
  Tex.maxAniso = 4;

  /* opts: {srgb:bool(default true), repeat:bool(default true), aniso:n,
   *        mips:bool(default true), rx:number, ry:number} */
  Tex.make = function (key, w, h, drawFn, opts) {
    if (Object.prototype.hasOwnProperty.call(texCache, key)) return texCache[key];
    var o = opts || {};
    var tex = null;
    try {
      var c = mkCanvas(w, h);
      var ctx = ctx2d(c);
      if (ctx) {
        ctx.save();
        drawFn(ctx, w, h);
        ctx.restore();
      }
      tex = new THREE.CanvasTexture(c);
      if (o.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
      if (o.repeat !== false) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
      } else {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      if (o.rx || o.ry) tex.repeat.set(o.rx || 1, o.ry || 1);
      tex.anisotropy = o.aniso === undefined ? Tex.maxAniso : o.aniso;
      if (o.mips === false) {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
      }
      tex.userData.shared = true;
      tex.needsUpdate = true;
    } catch (e) {
      STV.warn('[Tex] failed for ' + key, e);
      tex = null;
    }
    texCache[key] = tex;
    return tex;
  };

  Tex.get = function (key) {
    return Object.prototype.hasOwnProperty.call(texCache, key) ? texCache[key] : null;
  };

  Tex.dispose = function () {
    for (var k in texCache) {
      if (texCache[k] && texCache[k].dispose) texCache[k].dispose();
    }
    texCache = Tex.cache = {};
  };

  /* ---------------------------------------------------------------- wood */
  var WOOD_TONES = {
    light: { base: 0xc19a63, dark: 0x8a6636, seam: 0x5d431f },
    mid: { base: 0x9c7042, dark: 0x6c4a26, seam: 0x3f2a12 },
    dark: { base: 0x5f4026, dark: 0x3a2413, seam: 0x201108 },
    oak: { base: 0xb08a55, dark: 0x7d5a2e, seam: 0x4a3316 },
    walnut: { base: 0x6b4a2f, dark: 0x40291a, seam: 0x24140b }
  };
  Tex.wood = function (tone) {
    var name = typeof tone === 'string' ? tone : 'mid';
    var t = WOOD_TONES[name] || WOOD_TONES.mid;
    return Tex.make('wood:' + name, 512, 512, function (ctx, w, h) {
      var seed = 1201 + name.length * 37;
      var r = STV.rng(seed);
      var planks = 4;
      var ph = h / planks;
      /* per-plank grain */
      var p, i;
      var knots = [];
      for (p = 0; p < planks; p++) {
        var y0 = p * ph;
        var hueShift = (r() - 0.5) * 0.18;
        var freq = 5 + r() * 4;              /* ring frequency for this plank */
        var kn = 1 + (r() < 0.5 ? 1 : 0);
        for (i = 0; i < kn; i++) {
          knots.push({ x: r() * w, y: y0 + 0.2 * ph + r() * ph * 0.6, r: 7 + r() * 12, p: p });
        }
        /* base fill */
        ctx.fillStyle = css(mixHex(t.dark, t.base, 0.5 + hueShift));
        ctx.fillRect(0, y0, w, ph);
      }
      /* grain via per-pixel ring function */
      pixels(ctx, w, h, function (x, y, d, o) {
        var p2 = Math.floor(y / ph);
        var ly = y - p2 * ph;
        var warp = fbm(seed + p2 * 313, x / w * 3.0, y / h * 1.0, 4, 4, 0.55);
        var fine = fbm(seed + 91 + p2 * 17, x / w * 8.0, y / h * 24.0, 8, 3, 0.5);
        /* rings run along X (plank length) — vary across Y */
        var u = (ly / ph) * (5 + (p2 % 3)) + warp * 2.6 + Math.sin(x / w * 6.283 * 0.7) * 0.25;
        var ring = Math.abs(Math.sin(u * Math.PI * 1.6));
        ring = Math.pow(ring, 0.55);
        /* knots pull the rings around them */
        var kk = 0, j, K, dx, dy, dist;
        for (j = 0; j < knots.length; j++) {
          K = knots[j];
          if (K.p !== p2) continue;
          dx = x - K.x; dy = (y - K.y) * 2.2;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < K.r * 3.2) {
            var rr = Math.abs(Math.sin(dist / K.r * 5.0));
            kk = Math.max(kk, (1 - dist / (K.r * 3.2)) * (0.55 + rr * 0.45));
          }
        }
        var v = ring * 0.55 + fine * 0.28 + 0.17;
        v = v * (1 - kk * 0.75) + kk * 0.12;
        var seamY = Math.abs(ly - 0) < 1.4 || Math.abs(ly - ph) < 1.4;
        var base = d[o] / 255, gg = d[o + 1] / 255, bb = d[o + 2] / 255;
        var mix = 0.32 + v * 0.78;
        var R = base * 255 * mix, G = gg * 255 * mix, B = bb * 255 * mix;
        if (seamY) { R *= 0.34; G *= 0.34; B *= 0.36; }
        d[o] = cl255(R); d[o + 1] = cl255(G); d[o + 2] = cl255(B);
      });
      /* seams + a few scratches on top */
      ctx.globalAlpha = 0.5;
      for (p = 1; p < planks; p++) {
        ctx.fillStyle = css(t.seam);
        ctx.fillRect(0, p * ph - 1, w, 2);
      }
      ctx.globalAlpha = 0.14;
      for (i = 0; i < 26; i++) {
        var sy = r() * h;
        ctx.strokeStyle = r() < 0.5 ? '#000' : '#fff';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(r() * w, sy);
        ctx.lineTo(r() * w, sy + (r() - 0.5) * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  };

  /* -------------------------------------------------------------- carpet */
  function carpetDraw(ctx, w, h, seed, baseHex, altHex, wearAmount) {
    var r = STV.rng(seed);
    ctx.fillStyle = css(baseHex);
    ctx.fillRect(0, 0, w, h);
    /* low-frequency blotch + traffic wear */
    pixels(ctx, w, h, function (x, y, d, o) {
      var blot = fbm(seed + 3, x / w, y / h, 3, 3, 0.55);
      var weaveX = (Math.floor(x / 3) % 2) === 0 ? 1.03 : 0.97;
      var weaveY = (Math.floor(y / 3) % 2) === 0 ? 1.02 : 0.98;
      var wear = wearAmount * fbm(seed + 44, x / w * 1.5, y / h * 0.7, 2, 2, 0.5);
      var m = (0.86 + blot * 0.3) * weaveX * weaveY * (1 - wear * 0.22);
      d[o] = cl255(d[o] * m);
      d[o + 1] = cl255(d[o + 1] * m);
      d[o + 2] = cl255(d[o + 2] * m);
    });
    /* fibre speckle — short strokes, two tones */
    var i, x, y, a, len;
    ctx.lineWidth = 1;
    for (i = 0; i < 9000; i++) {
      x = r() * w; y = r() * h;
      a = r() * Math.PI * 2;
      len = 1.2 + r() * 2.2;
      var lightness = r();
      if (lightness < 0.45) ctx.strokeStyle = css(shadeHex(baseHex, 0.7), 0.5);
      else if (lightness < 0.85) ctx.strokeStyle = css(altHex, 0.35);
      else ctx.strokeStyle = css(shadeHex(baseHex, 1.35), 0.4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    /* the faint grid of the weave backing */
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#000';
    for (i = 0; i < w; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  Tex.carpetOffice = function () {
    return Tex.make('carpetOffice', 256, 256, function (ctx, w, h) {
      carpetDraw(ctx, w, h, 7731, 0x3d4650, 0x525f6d, 0.35);
      /* office carpet tiles: faint 128px seam */
      var r = STV.rng(88);
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      ctx.globalAlpha = 1;
      /* a couple of flecks */
      speckle(ctx, w, h, r, 240, 0.4, 1.1, function (rr) {
        return rr() < 0.5 ? 'rgba(190,200,210,0.35)' : 'rgba(30,34,40,0.4)';
      });
    });
  };

  Tex.carpetShop = function () {
    return Tex.make('carpetShop', 256, 256, function (ctx, w, h) {
      carpetDraw(ctx, w, h, 4409, 0x6b5c46, 0x8a7959, 0.6);
      var r = STV.rng(551);
      /* worn patch + coffee-ish stain */
      var i;
      for (i = 0; i < 5; i++) {
        var x = r() * w, y = r() * h, rad = 12 + r() * 34;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(58,44,28,0.30)');
        g.addColorStop(1, 'rgba(58,44,28,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      speckle(ctx, w, h, r, 300, 0.4, 1.3, function (rr) {
        return rr() < 0.5 ? 'rgba(200,186,150,0.3)' : 'rgba(40,32,22,0.4)';
      });
    });
  };

  /* ------------------------------------------------------------ concrete */
  Tex.concrete = function () {
    return Tex.make('concrete', 512, 512, function (ctx, w, h) {
      var seed = 2207, r = STV.rng(seed);
      ctx.fillStyle = '#8e8d89';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var big = fbm(seed, x / w, y / h, 3, 3, 0.6);
        var mid = fbm(seed + 11, x / w * 2, y / h * 2, 6, 4, 0.5);
        var fine = fbm(seed + 29, x / w, y / h, 32, 2, 0.5);
        var v = 0.62 + big * 0.30 + mid * 0.20 + fine * 0.16;
        var t = 138 * v;
        d[o] = cl255(t * 1.02); d[o + 1] = cl255(t); d[o + 2] = cl255(t * 0.97);
      });
      /* aggregate */
      speckle(ctx, w, h, r, 1400, 0.4, 1.9, function (rr) {
        var v = rr();
        if (v < 0.4) return 'rgba(60,58,55,0.45)';
        if (v < 0.75) return 'rgba(175,173,168,0.4)';
        return 'rgba(120,116,110,0.5)';
      });
      /* pits */
      var i;
      for (i = 0; i < 60; i++) {
        var x = r() * w, y = r() * h, rad = 0.8 + r() * 2.4;
        ctx.fillStyle = 'rgba(52,50,48,0.45)';
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,198,192,0.28)';
        ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.35, rad * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      /* staining */
      for (i = 0; i < 9; i++) {
        var sx = r() * w, sy = r() * h, sr = 30 + r() * 90;
        var g = ctx.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
        g.addColorStop(0, 'rgba(70,68,64,0.16)');
        g.addColorStop(1, 'rgba(70,68,64,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      }
      /* micro-cracks */
      for (i = 0; i < 14; i++) {
        crack(ctx, r, r() * w, r() * h, 14 + (r() * 22) | 0, 5 + r() * 8, 0.85, 0.6 + r() * 0.6,
          'rgba(58,56,53,0.5)');
      }
      /* one control joint */
      ctx.strokeStyle = 'rgba(56,55,52,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,188,182,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h * 0.5 + 2); ctx.lineTo(w, h * 0.5 + 2); ctx.stroke();
    });
  };

  Tex.concretePolished = function () {
    return Tex.make('concretePolished', 512, 512, function (ctx, w, h) {
      var seed = 3307, r = STV.rng(seed);
      ctx.fillStyle = '#a9a9a6';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var big = fbm(seed, x / w, y / h, 2, 3, 0.6);
        var mid = fbm(seed + 5, x / w * 2, y / h * 2, 8, 3, 0.45);
        var v = 0.80 + big * 0.16 + mid * 0.10;
        var t = 172 * v;
        d[o] = cl255(t); d[o + 1] = cl255(t); d[o + 2] = cl255(t * 1.01);
      });
      /* polisher swirl arcs */
      var i;
      ctx.lineWidth = 1;
      for (i = 0; i < 170; i++) {
        var cx = r() * w, cy = r() * h, rad = 20 + r() * 90;
        var a0 = r() * Math.PI * 2, a1 = a0 + 0.25 + r() * 0.8;
        ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)';
        ctx.beginPath();
        ctx.arc(cx, cy, rad, a0, a1);
        ctx.stroke();
      }
      /* tiny aggregate showing through */
      speckle(ctx, w, h, r, 500, 0.3, 1.1, function (rr) {
        return rr() < 0.5 ? 'rgba(120,120,118,0.30)' : 'rgba(220,220,216,0.25)';
      });
    });
  };

  /* ------------------------------------------------------------- asphalt */
  Tex.asphalt = function () {
    return Tex.make('asphalt', 512, 512, function (ctx, w, h) {
      var seed = 5501, r = STV.rng(seed);
      ctx.fillStyle = '#2e2f31';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 16, 3, 0.5);
        var big = fbm(seed + 7, x / w, y / h, 3, 2, 0.5);
        var v = 0.7 + n * 0.55 + big * 0.2;
        var t = 46 * v;
        d[o] = cl255(t); d[o + 1] = cl255(t * 1.01); d[o + 2] = cl255(t * 1.05);
      });
      /* aggregate stones */
      speckle(ctx, w, h, r, 4200, 0.4, 2.0, function (rr) {
        var v = rr();
        if (v < 0.5) return 'rgba(120,120,122,0.35)';
        if (v < 0.8) return 'rgba(20,20,22,0.5)';
        return 'rgba(160,158,155,0.30)';
      });
      /* tar patches */
      var i;
      for (i = 0; i < 6; i++) {
        var x = r() * w, y = r() * h, rad = 20 + r() * 70;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(16,16,18,0.55)');
        g.addColorStop(1, 'rgba(16,16,18,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      /* cracks */
      for (i = 0; i < 10; i++) {
        crack(ctx, r, r() * w, r() * h, 20, 8 + r() * 10, 0.9, 1.1, 'rgba(14,14,16,0.65)');
      }
    });
  };

  /* ------------------------------------------------------------- drywall */
  Tex.drywall = function (tint) {
    var t = (tint === undefined || tint === null) ? 0xe8e5de : tint;
    return Tex.make('drywall:' + t.toString(16), 256, 256, function (ctx, w, h) {
      var seed = 6607 + (t & 0xffff), r = STV.rng(seed);
      ctx.fillStyle = css(t);
      ctx.fillRect(0, 0, w, h);
      /* orange-peel */
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 24, 3, 0.5);
        var big = fbm(seed + 3, x / w, y / h, 3, 2, 0.5);
        var m = 0.94 + n * 0.10 + big * 0.05;
        d[o] = cl255(d[o] * m);
        d[o + 1] = cl255(d[o + 1] * m);
        d[o + 2] = cl255(d[o + 2] * m);
      });
      /* a few scuffs */
      var i;
      ctx.globalAlpha = 0.05;
      for (i = 0; i < 22; i++) {
        ctx.strokeStyle = '#33302c';
        ctx.lineWidth = 0.6 + r() * 1.6;
        ctx.beginPath();
        var x = r() * w, y = r() * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  };

  /* --------------------------------------------------------- ceiling tile */
  Tex.ceilingTile = function () {
    return Tex.make('ceilingTile', 512, 512, function (ctx, w, h) {
      var seed = 7703, r = STV.rng(seed);
      ctx.fillStyle = '#e2e0d8';
      ctx.fillRect(0, 0, w, h);
      /* 2x2 tiles with grid runner */
      var i, j;
      var tw = w / 2, th = h / 2;
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 20, 3, 0.5);
        var m = 0.95 + n * 0.09;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      /* pinholes + fissures per tile */
      for (j = 0; j < 2; j++) {
        for (i = 0; i < 2; i++) {
          var ox = i * tw, oy = j * th;
          var k;
          for (k = 0; k < 900; k++) {
            var px = ox + 6 + r() * (tw - 12), py = oy + 6 + r() * (th - 12);
            ctx.fillStyle = 'rgba(150,147,138,' + (0.25 + r() * 0.35) + ')';
            ctx.beginPath(); ctx.arc(px, py, 0.7 + r() * 0.9, 0, Math.PI * 2); ctx.fill();
          }
          for (k = 0; k < 26; k++) {
            var sx = ox + 10 + r() * (tw - 20), sy = oy + 10 + r() * (th - 20);
            ctx.strokeStyle = 'rgba(150,147,138,0.5)';
            ctx.lineWidth = 1 + r() * 1.4;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            var a = r() * Math.PI * 2, len = 8 + r() * 26, seg;
            for (seg = 0; seg < 4; seg++) {
              a += (r() - 0.5) * 0.9;
              sx += Math.cos(a) * len / 4; sy += Math.sin(a) * len / 4;
              ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
        }
      }
      /* T-bar grid */
      ctx.fillStyle = '#c9c7bf';
      ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, h - 5, w, 5);
      ctx.fillRect(0, 0, 5, h); ctx.fillRect(w - 5, 0, 5, h);
      ctx.fillRect(tw - 2.5, 0, 5, h); ctx.fillRect(0, th - 2.5, w, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(tw - 2.5, 0, 1.5, h); ctx.fillRect(0, th - 2.5, w, 1.5);
      /* bevel shading around each tile edge */
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 3;
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) ctx.strokeRect(i * tw + 6, j * th + 6, tw - 12, th - 12);
    });
  };

  /* --------------------------------------------------------------- brick */
  Tex.brick = function () {
    return Tex.make('brick', 512, 512, function (ctx, w, h) {
      var seed = 8807, r = STV.rng(seed);
      var courses = 8;
      var bh = h / courses;
      var bw = w / 4;
      ctx.fillStyle = '#8d8378';
      ctx.fillRect(0, 0, w, h);
      /* mortar noise */
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 24, 3, 0.5);
        var m = 0.9 + n * 0.2;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      var mortar = 4;
      var j, i;
      for (j = 0; j < courses; j++) {
        var offset = (j % 2) ? bw * 0.5 : 0;
        for (i = -1; i < 5; i++) {
          var x = i * bw + offset + mortar * 0.5;
          var y = j * bh + mortar * 0.5;
          var bwid = bw - mortar, bhig = bh - mortar;
          var tone = 0.72 + r() * 0.5;
          var hue = r();
          var base = hue < 0.15 ? 0x7d4a3c : (hue < 0.75 ? 0x9c5a44 : 0xb06a4c);
          ctx.fillStyle = css(shadeHex(base, tone));
          ctx.fillRect(x, y, bwid, bhig);
          /* per-brick grit */
          var k;
          for (k = 0; k < 40; k++) {
            ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.09)';
            ctx.fillRect(x + r() * bwid, y + r() * bhig, 1 + r() * 2, 1 + r());
          }
          /* chipped corner sometimes */
          if (r() < 0.18) {
            ctx.fillStyle = 'rgba(140,132,120,0.75)';
            ctx.beginPath();
            var cx = x + (r() < 0.5 ? 0 : bwid), cy = y + (r() < 0.5 ? 0 : bhig);
            ctx.arc(cx, cy, 2 + r() * 4, 0, Math.PI * 2);
            ctx.fill();
          }
          /* top highlight / bottom shade */
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(x, y, bwid, 1.5);
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillRect(x, y + bhig - 2, bwid, 2);
        }
      }
      /* efflorescence */
      for (i = 0; i < 5; i++) {
        var sx = r() * w, sy = r() * h, sr = 24 + r() * 60;
        var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        g.addColorStop(0, 'rgba(230,228,220,0.18)');
        g.addColorStop(1, 'rgba(230,228,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      }
    });
  };

  /* --------------------------------------------------------------- metal */
  Tex.metalBrushed = function () {
    return Tex.make('metalBrushed', 512, 256, function (ctx, w, h) {
      var seed = 9901, r = STV.rng(seed);
      ctx.fillStyle = '#b6b9bd';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var streak = nse(seed, 256, x / w * 0.02 + y / h * 1.0, y / h * 1.0);
        var fine = nse(seed + 3, 512, x / w, y / h);
        var band = fbm(seed + 7, x / w, y / h, 3, 2, 0.5);
        var v = 0.86 + streak * 0.12 + fine * 0.10 + band * 0.10;
        var t = 186 * v;
        d[o] = cl255(t * 0.99); d[o + 1] = cl255(t); d[o + 2] = cl255(t * 1.03);
      });
      /* long brush lines */
      var i;
      for (i = 0; i < 900; i++) {
        var y = r() * h;
        ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 0.5 + r();
        ctx.beginPath();
        var x0 = r() * w;
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + 20 + r() * 200, y + (r() - 0.5) * 0.8);
        ctx.stroke();
      }
    });
  };

  Tex.metalPainted = function (color) {
    var c = (color === undefined || color === null) ? 0x8a9096 : color;
    return Tex.make('metalPainted:' + c.toString(16), 256, 256, function (ctx, w, h) {
      var seed = 1301 + (c & 0xffff), r = STV.rng(seed);
      ctx.fillStyle = css(c);
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 16, 3, 0.5);
        var m = 0.95 + n * 0.10;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      /* scratches through to bare metal */
      var i;
      for (i = 0; i < 40; i++) {
        var x = r() * w, y = r() * h;
        ctx.strokeStyle = 'rgba(200,204,208,' + (0.10 + r() * 0.3) + ')';
        ctx.lineWidth = 0.5 + r() * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 24);
        ctx.stroke();
      }
      /* chips */
      for (i = 0; i < 16; i++) {
        ctx.fillStyle = 'rgba(150,155,160,0.5)';
        ctx.beginPath();
        ctx.arc(r() * w, r() * h, 0.8 + r() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  /* ------------------------------------------------------------- plastic */
  Tex.plastic = function (color) {
    var c = (color === undefined || color === null) ? 0x2a2d31 : color;
    return Tex.make('plastic:' + c.toString(16), 256, 256, function (ctx, w, h) {
      var seed = 1409 + (c & 0xffff);
      ctx.fillStyle = css(c);
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = nse(seed, 128, x / w, y / h);
        var n2 = nse(seed + 5, 64, x / w, y / h);
        var m = 0.95 + n * 0.07 + n2 * 0.04;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
    });
  };

  /* 90s PC beige: yellowed, faint pebbled injection-mould grain */
  Tex.beigePlastic = function () {
    return Tex.make('beigePlastic', 256, 256, function (ctx, w, h) {
      var seed = 1987, r = STV.rng(seed);
      ctx.fillStyle = '#cfc3a2';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        /* pebble: high-frequency cellular-ish noise */
        var p = nse(seed, 96, x / w, y / h);
        var p2 = nse(seed + 13, 192, x / w, y / h);
        var pebble = Math.abs(p - 0.5) * 2 * 0.5 + Math.abs(p2 - 0.5) * 2 * 0.5;
        /* uneven UV yellowing, stronger toward the top */
        var yellow = fbm(seed + 31, x / w, y / h, 3, 3, 0.55);
        var age = 0.55 * yellow + 0.45 * (1 - y / h);
        var m = 0.94 + pebble * 0.11;
        var R = d[o] * m, G = d[o + 1] * m, B = d[o + 2] * m;
        R = R * (1 + age * 0.045);
        G = G * (1 + age * 0.012);
        B = B * (1 - age * 0.10);
        d[o] = cl255(R); d[o + 1] = cl255(G); d[o + 2] = cl255(B);
      });
      /* faint mould-line and a couple of scuffs */
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = '#6a6047';
      ctx.lineWidth = 1;
      var i;
      for (i = 0; i < 18; i++) {
        var x = r() * w, y = r() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 10);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      /* nicotine-ish blotch */
      for (i = 0; i < 3; i++) {
        var sx = r() * w, sy = r() * h, sr = 30 + r() * 60;
        var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        g.addColorStop(0, 'rgba(160,128,60,0.10)');
        g.addColorStop(1, 'rgba(160,128,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      }
    });
  };

  /* -------------------------------------------------------------- rubber */
  Tex.rubber = function () {
    return Tex.make('rubber', 256, 256, function (ctx, w, h) {
      var seed = 2113;
      ctx.fillStyle = '#26282a';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = nse(seed, 128, x / w, y / h);
        var n2 = fbm(seed + 3, x / w, y / h, 8, 3, 0.5);
        var m = 0.85 + n * 0.22 + n2 * 0.14;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      /* moulded diamond tread, very subtle */
      var i, j;
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 2;
      for (i = -h; i < w; i += 22) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
      }
      j = 0;
    });
  };

  /* --------------------------------------------------------- chair fabric */
  Tex.fabricChair = function (color) {
    var c = (color === undefined || color === null) ? 0x36435a : color;
    return Tex.make('fabricChair:' + c.toString(16), 256, 256, function (ctx, w, h) {
      var seed = 2617 + (c & 0xffff), r = STV.rng(seed);
      ctx.fillStyle = css(shadeHex(c, 0.75));
      ctx.fillRect(0, 0, w, h);
      /* woven warp/weft — 4px threads */
      var i, j, step = 4;
      for (j = 0; j < h; j += step) {
        for (i = 0; i < w; i += step) {
          var over = ((i / step) + (j / step)) % 2 === 0;
          var tone = 0.82 + (over ? 0.34 : 0.0) + (r() - 0.5) * 0.16;
          ctx.fillStyle = css(shadeHex(c, tone));
          if (over) ctx.fillRect(i, j, step, step - 1);
          else ctx.fillRect(i, j, step - 1, step);
        }
      }
      /* fuzz */
      speckle(ctx, w, h, r, 1800, 0.3, 0.9, function (rr) {
        return rr() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)';
      });
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed + 9, x / w, y / h, 3, 2, 0.5);
        var m = 0.93 + n * 0.14;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
    });
  };

  /* ----------------------------------------------------------------- PCB */
  Tex.pcb = function () {
    return Tex.make('pcb', 512, 512, function (ctx, w, h) {
      var seed = 3121, r = STV.rng(seed);
      /* solder mask */
      ctx.fillStyle = '#0d5a33';
      ctx.fillRect(0, 0, w, h);
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 12, 3, 0.5);
        var m = 0.93 + n * 0.14;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      /* copper pour hatch on the bottom half */
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = '#7fe0a8';
      ctx.lineWidth = 2;
      var i;
      for (i = -h; i < w; i += 10) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      }
      ctx.restore();

      /* traces: manhattan/45-degree routed walks */
      function trace(x, y, steps, wide) {
        ctx.strokeStyle = 'rgba(46,140,86,0.95)';
        ctx.lineWidth = wide + 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var pts = [[x, y]];
        var dir = Math.floor(r() * 8);
        var k;
        for (k = 0; k < steps; k++) {
          if (r() < 0.42) dir = (dir + (r() < 0.5 ? 1 : 7)) % 8;
          var a = dir * Math.PI / 4;
          var len = 8 + r() * 34;
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          x = Math.max(4, Math.min(w - 4, x));
          y = Math.max(4, Math.min(h - 4, y));
          pts.push([x, y]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(196,231,150,0.85)';
        ctx.lineWidth = wide;
        ctx.stroke();
        return pts;
      }
      var ends = [];
      for (i = 0; i < 46; i++) {
        var p = trace(r() * w, r() * h, 3 + ((r() * 5) | 0), 1.4 + r() * 2.2);
        ends.push(p[0]);
        ends.push(p[p.length - 1]);
      }
      /* vias */
      for (i = 0; i < ends.length; i++) {
        var vx = ends[i][0], vy = ends[i][1];
        ctx.fillStyle = '#cbb46a';
        ctx.beginPath(); ctx.arc(vx, vy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1b1c18';
        ctx.beginPath(); ctx.arc(vx, vy, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      /* IC pads / footprints */
      function footprint(x, y, cols, rows, pitch) {
        var a, b;
        ctx.fillStyle = '#d8c47e';
        for (b = 0; b < rows; b++) {
          for (a = 0; a < cols; a++) {
            ctx.fillRect(x + a * pitch, y + b * pitch * 3.2, pitch * 0.55, pitch * 1.1);
          }
        }
        ctx.strokeStyle = 'rgba(232,232,225,0.85)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - 3, y - 3, cols * pitch + 6, rows * pitch * 3.2 + 6);
      }
      for (i = 0; i < 7; i++) footprint(20 + r() * (w - 120), 20 + r() * (h - 90), 4 + ((r() * 8) | 0), 2, 7);
      /* SMD resistors */
      for (i = 0; i < 40; i++) {
        var rx = r() * w, ry = r() * h, hor = r() < 0.5;
        ctx.fillStyle = '#c9b071';
        if (hor) { ctx.fillRect(rx, ry, 10, 5); } else { ctx.fillRect(rx, ry, 5, 10); }
        ctx.fillStyle = '#241f16';
        if (hor) { ctx.fillRect(rx + 2.5, ry, 5, 5); } else { ctx.fillRect(rx, ry + 2.5, 5, 5); }
      }
      /* silkscreen */
      ctx.fillStyle = 'rgba(236,238,230,0.9)';
      ctx.font = '10px monospace';
      var labels = ['R14', 'C7', 'U3', 'J1', 'Q2', 'D5', 'JP1', 'IC1', 'TP4', 'L2', 'F1', 'SW1'];
      for (i = 0; i < 40; i++) {
        ctx.fillText(labels[(r() * labels.length) | 0], r() * (w - 24), 10 + r() * (h - 14));
      }
      ctx.strokeStyle = 'rgba(236,238,230,0.55)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.font = 'bold 13px monospace';
      ctx.fillText('KILBRIDE REV C', 14, h - 14);
    });
  };

  /* --------------------------------------------------------------- noise */
  Tex.noise = function (w, h, scale) {
    var W = w || 128, H = h || 128, S = scale || 8;
    return Tex.make('noise:' + W + 'x' + H + 'x' + S, W, H, function (ctx, cw, ch) {
      var seed = 4127 + S;
      pixels(ctx, cw, ch, function (x, y, d, o) {
        var v = fbm(seed, x / cw, y / ch, S, 4, 0.5);
        var t = cl255(v * 255);
        d[o] = t; d[o + 1] = t; d[o + 2] = t; d[o + 3] = 255;
      });
    }, { srgb: false });
  };

  /* ---------------------------------------------------------------- grid */
  Tex.grid = function (color, bg, cell) {
    var c = (color === undefined || color === null) ? 0x5fd3ff : color;
    var b = (bg === undefined || bg === null) ? 0x0a0c0f : bg;
    var k = cell || 32;
    return Tex.make('grid:' + c.toString(16) + ':' + b.toString(16) + ':' + k, 256, 256, function (ctx, w, h) {
      ctx.fillStyle = css(b);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(c, 0.55);
      ctx.lineWidth = 1;
      var i;
      for (i = 0; i <= w; i += k) {
        ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(w, i + 0.5); ctx.stroke();
      }
      ctx.strokeStyle = css(c, 0.95);
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
    });
  };

  /* ----------------------------------------------------------- tile floor */
  Tex.tileFloor = function () {
    return Tex.make('tileFloor', 512, 512, function (ctx, w, h) {
      var seed = 5231, r = STV.rng(seed);
      var n = 2, tw = w / n;
      var j, i;
      ctx.fillStyle = '#3c3e40';
      ctx.fillRect(0, 0, w, h);
      for (j = 0; j < n; j++) {
        for (i = 0; i < n; i++) {
          var x = i * tw + 3, y = j * tw + 3, s = tw - 6;
          var base = 0.9 + (r() - 0.5) * 0.1;
          ctx.fillStyle = css(shadeHex(0xb8b5ac, base));
          ctx.fillRect(x, y, s, s);
          /* VCT speckle */
          var k;
          for (k = 0; k < 2200; k++) {
            var px = x + r() * s, py = y + r() * s;
            var v = r();
            ctx.fillStyle = v < 0.35 ? 'rgba(90,88,82,0.5)'
              : (v < 0.7 ? 'rgba(220,218,210,0.5)' : 'rgba(150,146,138,0.5)');
            ctx.fillRect(px, py, 1 + r() * 2.4, 1 + r() * 2);
          }
          /* sheen */
          var g = ctx.createLinearGradient(x, y, x + s, y + s);
          g.addColorStop(0, 'rgba(255,255,255,0.10)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
          g.addColorStop(1, 'rgba(0,0,0,0.06)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, s, s);
          /* edge bevel */
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        }
      }
      /* scuff marks */
      for (i = 0; i < 30; i++) {
        ctx.strokeStyle = 'rgba(60,58,55,0.12)';
        ctx.lineWidth = 1 + r() * 2;
        var sx = r() * w, sy = r() * h, a = r() * Math.PI * 2, len = 10 + r() * 40;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        ctx.stroke();
      }
    });
  };

  /* ------------------------------------------------------- acoustic panel */
  Tex.acousticPanel = function () {
    return Tex.make('acousticPanel', 256, 256, function (ctx, w, h) {
      var seed = 6317, r = STV.rng(seed);
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(0, 0, w, h);
      var i, j;
      for (j = 0; j < h; j += 3) {
        for (i = 0; i < w; i += 3) {
          var over = ((i / 3) + (j / 3)) % 2 === 0;
          ctx.fillStyle = over ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
          ctx.fillRect(i, j, 3, 3);
        }
      }
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = fbm(seed, x / w, y / h, 16, 3, 0.5);
        var m = 0.9 + n * 0.2;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m);
      });
      speckle(ctx, w, h, r, 900, 0.3, 0.9, function (rr) {
        return rr() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      });
    });
  };

  /* ----------------------------------------------------------- glass dirt */
  Tex.glassDirt = function () {
    return Tex.make('glassDirt', 256, 256, function (ctx, w, h) {
      var seed = 7331, r = STV.rng(seed);
      ctx.clearRect(0, 0, w, h);
      /* smears */
      var i;
      for (i = 0; i < 28; i++) {
        var x = r() * w, y = r() * h, rad = 12 + r() * 50;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(220,225,230,' + (0.05 + r() * 0.10) + ')');
        g.addColorStop(1, 'rgba(220,225,230,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      /* wiper arcs */
      for (i = 0; i < 12; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2 + r() * 5;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 1.4, 60 + i * 14, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      /* droplets / grime specks */
      speckle(ctx, w, h, r, 320, 0.4, 1.8, function (rr) {
        return rr() < 0.6 ? 'rgba(200,205,210,0.16)' : 'rgba(60,58,54,0.18)';
      });
      /* dust in the corners */
      var g2 = ctx.createLinearGradient(0, 0, 0, h);
      g2.addColorStop(0, 'rgba(180,180,175,0.0)');
      g2.addColorStop(1, 'rgba(180,180,175,0.10)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    });
  };

  /* ------------------------------------------------------------ paperNote */
  Tex.paperNote = function (lines) {
    var arr = lines || ['NOTE'];
    if (typeof arr === 'string') arr = [arr];
    var key = 'paperNote:' + arr.join('|');
    return Tex.make(key, 512, 512, function (ctx, w, h) {
      var seed = 8419 + key.length * 13, r = STV.rng(seed);
      ctx.fillStyle = '#f0ead8';
      ctx.fillRect(0, 0, w, h);
      /* fibre */
      pixels(ctx, w, h, function (x, y, d, o) {
        var n = nse(seed, 128, x / w, y / h);
        var n2 = fbm(seed + 3, x / w, y / h, 4, 2, 0.5);
        var m = 0.96 + n * 0.05 + n2 * 0.04;
        d[o] = cl255(d[o] * m); d[o + 1] = cl255(d[o + 1] * m); d[o + 2] = cl255(d[o + 2] * m * 0.995);
      });
      /* aged edges */
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(190,170,120,0.10)');
      g.addColorStop(0.5, 'rgba(190,170,120,0.0)');
      g.addColorStop(1, 'rgba(190,170,120,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      /* ruled lines */
      ctx.strokeStyle = 'rgba(120,150,180,0.35)';
      ctx.lineWidth = 1;
      var i;
      for (i = 70; i < h - 20; i += 40) {
        ctx.beginPath(); ctx.moveTo(30, i + 0.5); ctx.lineTo(w - 30, i + 0.5); ctx.stroke();
      }
      /* text — biro blue, slight rotation per line */
      ctx.fillStyle = '#22337a';
      for (i = 0; i < arr.length; i++) {
        var txt = String(arr[i]);
        var px = STV.fitText(ctx, txt, w - 80, 34, 'system-ui, sans-serif');
        ctx.save();
        ctx.translate(40, 62 + i * 40);
        ctx.rotate((r() - 0.5) * 0.03);
        ctx.font = px + 'px system-ui, sans-serif';
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      }
      /* crease */
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.lineTo(w, h * 0.62 - 6); ctx.stroke();
    }, { repeat: false });
  };

  /* ------------------------------------------------------------ posterArt */
  function posterBase(ctx, w, h, bg1, bg2) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(bg1));
    g.addColorStop(1, css(bg2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  function posterGrain(ctx, w, h, seed, amt) {
    var r = STV.rng(seed), i;
    ctx.globalAlpha = amt || 0.05;
    for (i = 0; i < 2600; i++) {
      ctx.fillStyle = r() < 0.5 ? '#fff' : '#000';
      ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }
  function centreText(ctx, txt, cx, y, maxW, startPx, font, fill) {
    var px = STV.fitText(ctx, txt, maxW, startPx, font);
    ctx.font = px + 'px ' + font;
    ctx.fillStyle = fill;
    ctx.textAlign = 'center';
    ctx.fillText(txt, cx, y);
    ctx.textAlign = 'left';
    return px;
  }

  var POSTER_KINDS = ['127001', 'raid', 'cat', 'prague', 'meridian', 'safety', 'oleg'];

  Tex.posterArt = function (kind) {
    var k = POSTER_KINDS.indexOf(kind) >= 0 ? kind : '127001';
    return Tex.make('poster:' + k, 512, 768, function (ctx, w, h) {
      var r = STV.rng(9137 + k.length * 101);
      var i, j;
      if (k === '127001') {
        posterBase(ctx, w, h, 0x0d1b2a, 0x081018);
        /* a little house */
        ctx.strokeStyle = '#5fd3ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 130, h * 0.42);
        ctx.lineTo(w * 0.5, h * 0.28);
        ctx.lineTo(w * 0.5 + 130, h * 0.42);
        ctx.stroke();
        ctx.strokeRect(w * 0.5 - 100, h * 0.42, 200, 150);
        ctx.fillStyle = 'rgba(95,211,255,0.15)';
        ctx.fillRect(w * 0.5 - 100, h * 0.42, 200, 150);
        ctx.fillStyle = '#f0a24b';
        ctx.fillRect(w * 0.5 - 26, h * 0.50, 52, 82);
        centreText(ctx, "THERE'S NO PLACE LIKE", w * 0.5, h * 0.72, w - 60, 40, 'system-ui, sans-serif', '#e8f4ff');
        centreText(ctx, '127.0.0.1', w * 0.5, h * 0.80, w - 60, 74, 'monospace', '#5fd3ff');
        centreText(ctx, 'KILBRIDE COMPUTER REPAIR', w * 0.5, h * 0.90, w - 80, 20, 'monospace', 'rgba(232,244,255,0.5)');
      } else if (k === 'raid') {
        posterBase(ctx, w, h, 0x201512, 0x120b09);
        /* platters */
        for (i = 0; i < 3; i++) {
          var cy = h * 0.30 + i * 66;
          ctx.save();
          ctx.translate(w * 0.5, cy);
          ctx.scale(1, 0.32);
          var gg = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
          gg.addColorStop(0, '#5a6068');
          gg.addColorStop(0.6, '#b8bfc6');
          gg.addColorStop(1, '#71777e');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#12100e';
          ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        centreText(ctx, 'RAID IS NOT', w * 0.5, h * 0.68, w - 60, 66, 'system-ui, sans-serif', '#f0a24b');
        centreText(ctx, 'A BACKUP', w * 0.5, h * 0.77, w - 60, 66, 'system-ui, sans-serif', '#f0a24b');
        centreText(ctx, 'ask me how i know', w * 0.5, h * 0.86, w - 80, 22, 'system-ui, sans-serif', 'rgba(240,230,220,0.5)');
      } else if (k === 'cat') {
        posterBase(ctx, w, h, 0x2b2419, 0x14110c);
        /* stylised cat hanging from a branch */
        ctx.strokeStyle = '#6b563a';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(40, h * 0.24);
        ctx.bezierCurveTo(w * 0.4, h * 0.20, w * 0.7, h * 0.30, w - 30, h * 0.22);
        ctx.stroke();
        var bx = w * 0.5, by = h * 0.44;
        ctx.fillStyle = '#8b8177';
        /* body */
        ctx.beginPath(); ctx.ellipse(bx, by + 80, 76, 104, 0, 0, Math.PI * 2); ctx.fill();
        /* head */
        ctx.beginPath(); ctx.ellipse(bx, by - 12, 74, 62, 0, 0, Math.PI * 2); ctx.fill();
        /* ears */
        ctx.beginPath();
        ctx.moveTo(bx - 66, by - 48); ctx.lineTo(bx - 40, by - 96); ctx.lineTo(bx - 16, by - 54); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx + 66, by - 48); ctx.lineTo(bx + 40, by - 96); ctx.lineTo(bx + 16, by - 54); ctx.closePath(); ctx.fill();
        /* paws over the branch */
        ctx.fillStyle = '#9c9288';
        ctx.beginPath(); ctx.ellipse(bx - 44, h * 0.26, 22, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx + 44, h * 0.26, 22, 15, 0, 0, Math.PI * 2); ctx.fill();
        /* face */
        ctx.fillStyle = '#141210';
        ctx.beginPath(); ctx.ellipse(bx - 26, by - 18, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx + 26, by - 18, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d78ca0';
        ctx.beginPath();
        ctx.moveTo(bx - 9, by + 6); ctx.lineTo(bx + 9, by + 6); ctx.lineTo(bx, by + 18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(240,240,235,0.7)';
        ctx.lineWidth = 2;
        for (i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(bx - 20, by + 12 + i * 6); ctx.lineTo(bx - 84, by + 2 + i * 12); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx + 20, by + 12 + i * 6); ctx.lineTo(bx + 84, by + 2 + i * 12); ctx.stroke();
        }
        centreText(ctx, 'HANG IN THERE', w * 0.5, h * 0.86, w - 60, 56, 'system-ui, sans-serif', '#f0e6d2');
        centreText(ctx, "it's only tuesday", w * 0.5, h * 0.92, w - 80, 22, 'system-ui, sans-serif', 'rgba(240,230,210,0.55)');
      } else if (k === 'prague') {
        posterBase(ctx, w, h, 0xf0a24b, 0x8c3d2e);
        /* sun */
        ctx.fillStyle = 'rgba(255,225,170,0.85)';
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.34, 90, 0, Math.PI * 2); ctx.fill();
        /* skyline silhouette */
        ctx.fillStyle = '#241018';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.62);
        var sky = [
          [0.04, 0.56], [0.08, 0.56], [0.09, 0.50], [0.11, 0.50], [0.12, 0.56],
          [0.20, 0.56], [0.22, 0.44], [0.26, 0.44], [0.28, 0.56],
          [0.36, 0.56], [0.38, 0.38], [0.40, 0.32], [0.42, 0.38], [0.44, 0.56],
          [0.55, 0.56], [0.56, 0.46], [0.58, 0.40], [0.60, 0.46], [0.61, 0.56],
          [0.70, 0.56], [0.72, 0.48], [0.76, 0.48], [0.78, 0.56],
          [0.86, 0.56], [0.88, 0.42], [0.90, 0.36], [0.92, 0.42], [0.94, 0.56],
          [1.0, 0.56]
        ];
        for (i = 0; i < sky.length; i++) ctx.lineTo(sky[i][0] * w, sky[i][1] * h);
        ctx.lineTo(w, h * 0.62);
        ctx.closePath();
        ctx.fill();
        /* bridge arches */
        ctx.fillRect(0, h * 0.62, w, 26);
        ctx.fillStyle = '#f0a24b';
        for (i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(40 + i * 88, h * 0.62 + 26, 34, Math.PI, 0);
          ctx.fill();
        }
        /* river */
        ctx.fillStyle = 'rgba(60,26,40,0.75)';
        ctx.fillRect(0, h * 0.62 + 26, w, h * 0.14);
        ctx.strokeStyle = 'rgba(255,200,150,0.25)';
        ctx.lineWidth = 2;
        for (i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.moveTo(r() * w, h * 0.66 + r() * h * 0.09);
          ctx.lineTo(r() * w, h * 0.66 + r() * h * 0.09);
          ctx.stroke();
        }
        centreText(ctx, 'PRAHA', w * 0.5, h * 0.88, w - 60, 92, 'system-ui, sans-serif', '#fff2dd');
        centreText(ctx, 'FLY CZECHOSLOVAK AIRLINES', w * 0.5, h * 0.94, w - 60, 22, 'system-ui, sans-serif', 'rgba(255,242,221,0.7)');
      } else if (k === 'meridian') {
        posterBase(ctx, w, h, 0x0b1420, 0x050a10);
        /* meridian arc mark */
        ctx.strokeStyle = '#5fd3ff';
        ctx.lineWidth = 4;
        for (i = 0; i < 5; i++) {
          ctx.globalAlpha = 1 - i * 0.16;
          ctx.beginPath();
          ctx.ellipse(w * 0.5, h * 0.36, 150 - i * 8, 150, 0, Math.PI * 0.1 + i * 0.06, Math.PI * 0.9 - i * 0.06);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.36, 150, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(95,211,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        centreText(ctx, 'MERIDIAN', w * 0.5, h * 0.66, w - 60, 70, 'system-ui, sans-serif', '#e6f4ff');
        centreText(ctx, 'S Y S T E M S', w * 0.5, h * 0.72, w - 80, 30, 'monospace', '#5fd3ff');
        centreText(ctx, 'CONTINUITY OF RECORD', w * 0.5, h * 0.84, w - 80, 22, 'monospace', 'rgba(230,244,255,0.55)');
        centreText(ctx, 'PRAHA · ZÜRICH · SINGAPORE', w * 0.5, h * 0.89, w - 80, 18, 'monospace', 'rgba(230,244,255,0.35)');
      } else if (k === 'safety') {
        ctx.fillStyle = '#f2c400';
        ctx.fillRect(0, 0, w, h);
        /* hazard stripes top and bottom */
        ctx.fillStyle = '#141414';
        for (i = -h; i < w + h; i += 56) {
          ctx.beginPath();
          ctx.moveTo(i, 0); ctx.lineTo(i + 28, 0); ctx.lineTo(i + 28 + 60, 60); ctx.lineTo(i + 60, 60);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(i, h - 60); ctx.lineTo(i + 28, h - 60); ctx.lineTo(i + 28 + 60, h); ctx.lineTo(i + 60, h);
          ctx.closePath(); ctx.fill();
        }
        /* triangle */
        ctx.fillStyle = '#141414';
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.20);
        ctx.lineTo(w * 0.5 + 150, h * 0.48);
        ctx.lineTo(w * 0.5 - 150, h * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f2c400';
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.245);
        ctx.lineTo(w * 0.5 + 120, h * 0.462);
        ctx.lineTo(w * 0.5 - 120, h * 0.462);
        ctx.closePath();
        ctx.fill();
        /* bolt */
        ctx.fillStyle = '#141414';
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + 16, h * 0.30);
        ctx.lineTo(w * 0.5 - 26, h * 0.395);
        ctx.lineTo(w * 0.5 - 2, h * 0.395);
        ctx.lineTo(w * 0.5 - 18, h * 0.445);
        ctx.lineTo(w * 0.5 + 28, h * 0.35);
        ctx.lineTo(w * 0.5 + 2, h * 0.35);
        ctx.closePath();
        ctx.fill();
        centreText(ctx, 'DANGER', w * 0.5, h * 0.60, w - 80, 76, 'system-ui, sans-serif', '#141414');
        centreText(ctx, 'CAPACITORS HOLD CHARGE', w * 0.5, h * 0.68, w - 60, 28, 'system-ui, sans-serif', '#141414');
        centreText(ctx, 'DO NOT OPEN MONITOR', w * 0.5, h * 0.73, w - 60, 28, 'system-ui, sans-serif', '#141414');
        centreText(ctx, 'EVEN IF YOU THINK YOU KNOW BETTER', w * 0.5, h * 0.80, w - 60, 18, 'system-ui, sans-serif', 'rgba(20,20,20,0.7)');
      } else {
        /* oleg — a very expensive, very quiet business card blown up to poster size */
        posterBase(ctx, w, h, 0x14100c, 0x0a0806);
        ctx.strokeStyle = '#b8912f';
        ctx.lineWidth = 2;
        ctx.strokeRect(36, 36, w - 72, h - 72);
        ctx.strokeRect(44, 44, w - 88, h - 88);
        /* crest: a stag-ish geometric mark */
        ctx.save();
        ctx.translate(w * 0.5, h * 0.34);
        ctx.strokeStyle = '#b8912f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-60, 60); ctx.lineTo(0, -70); ctx.lineTo(60, 60);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-34, 22); ctx.lineTo(34, 22);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -10, 74, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.restore();
        centreText(ctx, 'T. THOMAS', w * 0.5, h * 0.60, w - 100, 58, 'system-ui, sans-serif', '#e8dfc8');
        centreText(ctx, 'IMPORT · EXPORT · LOGISTICS', w * 0.5, h * 0.67, w - 100, 22, 'monospace', '#b8912f');
        centreText(ctx, 'DISCRETION IN ALL THINGS', w * 0.5, h * 0.80, w - 100, 20, 'monospace', 'rgba(232,223,200,0.45)');
        centreText(ctx, 'EST. 1974', w * 0.5, h * 0.86, w - 100, 18, 'monospace', 'rgba(232,223,200,0.3)');
      }
      posterGrain(ctx, w, h, 313 + k.length, 0.045);
      /* print edge darkening */
      var vg = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.25, w * 0.5, h * 0.5, h * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }, { repeat: false });
  };

  /* ------------------------------------------------------------ bump maps */
  /* Cheap greyscale height texture derived from fbm; usable as bumpMap. */
  Tex.bump = function (key, scale, contrast) {
    var s = scale || 16, c = contrast === undefined ? 1 : contrast;
    return Tex.make('bump:' + key + ':' + s + ':' + c, 256, 256, function (ctx, w, h) {
      var seed = 1;
      var i;
      for (i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) & 0x7fffffff;
      pixels(ctx, w, h, function (x, y, d, o) {
        var v = fbm(seed, x / w, y / h, s, 4, 0.5);
        v = 0.5 + (v - 0.5) * c;
        var t = cl255(v * 255);
        d[o] = t; d[o + 1] = t; d[o + 2] = t; d[o + 3] = 255;
      });
    }, { srgb: false });
  };

  /* ------------------------------------------------- misc extra textures */
  /* Not required by contract but used internally by props. */
  Tex.label = function (id, text, bg, fg, w, h) {
    var W = w || 256, H = h || 128;
    return Tex.make('label:' + id, W, H, function (ctx, cw, ch) {
      ctx.fillStyle = css(bg === undefined ? 0xe8e6df : bg);
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = css(fg === undefined ? 0x1a1c20 : fg, 0.5);
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, cw - 8, ch - 8);
      var lines = Array.isArray(text) ? text : [text];
      var i;
      for (i = 0; i < lines.length; i++) {
        centreText(ctx, String(lines[i]), cw / 2, ch * (i + 1) / (lines.length + 1) + 8,
          cw - 24, Math.min(46, (ch / (lines.length + 1)) * 0.8), 'monospace',
          css(fg === undefined ? 0x1a1c20 : fg));
      }
    }, { repeat: false });
  };

  /* =========================================================================
   * 2. STV.Mat — materials
   * =====================================================================*/

  var matCache = {};
  var matDefs = {};
  var Mat = {};
  STV.Mat = Mat;
  Mat.cache = matCache;

  Mat.def = function (name, fn) { matDefs[name] = fn; };

  Mat.get = function (name) {
    if (Object.prototype.hasOwnProperty.call(matCache, name)) return matCache[name];
    var f = matDefs[name];
    var m = null;
    if (!f) {
      STV.warn('[Mat] unknown material "' + name + '" — using fallback');
      try {
        m = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.85, metalness: 0.0 });
      } catch (e) { m = null; }
    } else {
      try { m = f(); } catch (e) {
        STV.warn('[Mat] factory failed for "' + name + '"', e);
        try { m = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.9 }); } catch (e2) { m = null; }
      }
    }
    if (m) {
      m.userData.shared = true;
      m.name = name;
    }
    matCache[name] = m;
    return m;
  };

  /* small helper for the definitions below */
  function std(o) {
    var m = new THREE.MeshStandardMaterial(o);
    return m;
  }
  function withTex(o, tex, rx, ry) {
    if (tex) {
      o.map = tex;
      if (rx || ry) {
        /* Cloning keeps the shared canvas but lets us set an independent repeat. */
        var t = tex.clone();
        t.needsUpdate = true;
        t.userData.shared = true;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx || 1, ry || 1);
        o.map = t;
      }
    }
    return o;
  }

  /* ---- surfaces ---- */
  Mat.def('wood', function () {
    return std(withTex({ roughness: 0.72, metalness: 0.0, color: 0xffffff }, Tex.wood('mid'), 2, 2));
  });
  Mat.def('woodDark', function () {
    return std(withTex({ roughness: 0.66, metalness: 0.0, color: 0xffffff }, Tex.wood('walnut'), 2, 2));
  });
  Mat.def('woodLight', function () {
    return std(withTex({ roughness: 0.74, metalness: 0.0, color: 0xffffff }, Tex.wood('light'), 2, 2));
  });
  Mat.def('carpetShop', function () {
    return std(withTex({ roughness: 0.98, metalness: 0.0, color: 0xffffff }, Tex.carpetShop(), 8, 8));
  });
  Mat.def('carpetOffice', function () {
    return std(withTex({ roughness: 0.97, metalness: 0.0, color: 0xffffff }, Tex.carpetOffice(), 10, 10));
  });
  Mat.def('concrete', function () {
    return std(withTex({ roughness: 0.94, metalness: 0.0, color: 0xffffff }, Tex.concrete(), 4, 4));
  });
  Mat.def('concretePolished', function () {
    return std(withTex({ roughness: 0.30, metalness: 0.05, color: 0xffffff }, Tex.concretePolished(), 4, 4));
  });
  Mat.def('asphalt', function () {
    return std(withTex({ roughness: 0.96, metalness: 0.0, color: 0xffffff }, Tex.asphalt(), 12, 12));
  });
  Mat.def('drywall', function () {
    return std(withTex({ roughness: 0.93, metalness: 0.0, color: 0xffffff }, Tex.drywall(0xe8e5de), 3, 3));
  });
  Mat.def('drywallShop', function () {
    return std(withTex({ roughness: 0.94, metalness: 0.0, color: 0xffffff }, Tex.drywall(0xd9d0bb), 3, 3));
  });
  Mat.def('ceiling', function () {
    return std(withTex({ roughness: 0.99, metalness: 0.0, color: 0xffffff }, Tex.ceilingTile(), 3, 3));
  });
  Mat.def('brick', function () {
    return std(withTex({ roughness: 0.95, metalness: 0.0, color: 0xffffff }, Tex.brick(), 3, 3));
  });
  Mat.def('tileFloor', function () {
    return std(withTex({ roughness: 0.35, metalness: 0.0, color: 0xffffff }, Tex.tileFloor(), 6, 6));
  });
  Mat.def('acoustic', function () {
    return std(withTex({ roughness: 1.0, metalness: 0.0, color: 0xffffff }, Tex.acousticPanel(), 2, 2));
  });

  /* ---- metals ---- */
  Mat.def('steel', function () {
    return std(withTex({ roughness: 0.42, metalness: 0.85, color: 0xc6cad0 }, Tex.metalBrushed(), 2, 2));
  });
  Mat.def('steelDark', function () {
    return std(withTex({ roughness: 0.52, metalness: 0.80, color: 0x53585e }, Tex.metalBrushed(), 2, 2));
  });
  Mat.def('aluminium', function () {
    return std(withTex({ roughness: 0.28, metalness: 0.92, color: 0xd6dade }, Tex.metalBrushed(), 1, 1));
  });
  Mat.def('chrome', function () {
    return std({ roughness: 0.08, metalness: 1.0, color: 0xeef2f6 });
  });
  Mat.def('copper', function () {
    return std({ roughness: 0.35, metalness: 0.95, color: 0xc07a3e });
  });
  Mat.def('gold', function () {
    return std({ roughness: 0.30, metalness: 1.0, color: 0xc9a227 });
  });

  /* ---- plastics ---- */
  Mat.def('beige', function () {
    return std(withTex({ roughness: 0.68, metalness: 0.0, color: 0xffffff }, Tex.beigePlastic(), 1, 1));
  });
  Mat.def('beigeDark', function () {
    return std(withTex({ roughness: 0.70, metalness: 0.0, color: 0xb9ae90 }, Tex.beigePlastic(), 1, 1));
  });
  Mat.def('blackPlastic', function () {
    return std(withTex({ roughness: 0.58, metalness: 0.0, color: 0xffffff }, Tex.plastic(0x1c1e21), 1, 1));
  });
  Mat.def('greyPlastic', function () {
    return std(withTex({ roughness: 0.62, metalness: 0.0, color: 0xffffff }, Tex.plastic(0x6f7479), 1, 1));
  });
  Mat.def('rubber', function () {
    return std(withTex({ roughness: 0.99, metalness: 0.0, color: 0xffffff }, Tex.rubber(), 2, 2));
  });

  /* ---- glass ---- */
  Mat.def('glass', function () {
    var m = new THREE.MeshStandardMaterial({
      color: 0xcfe3ee, roughness: 0.06, metalness: 0.0,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide
    });
    m.depthWrite = false;
    return m;
  });
  Mat.def('glassTint', function () {
    var m = new THREE.MeshStandardMaterial({
      color: 0x2c4450, roughness: 0.10, metalness: 0.15,
      transparent: true, opacity: 0.55, side: THREE.DoubleSide
    });
    m.depthWrite = false;
    return m;
  });
  Mat.def('glassDirty', function () {
    var m = new THREE.MeshStandardMaterial({
      color: 0xbcd0da, roughness: 0.22, metalness: 0.0,
      transparent: true, opacity: 0.30, side: THREE.DoubleSide,
      map: Tex.glassDirt()
    });
    m.depthWrite = false;
    return m;
  });

  /* ---- screens + light ---- */
  Mat.def('screenOff', function () {
    return std({ color: 0x14181a, roughness: 0.24, metalness: 0.0 });
  });
  function emis(color, intensity) {
    return new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: color,
      emissiveIntensity: intensity === undefined ? 1.0 : intensity,
      roughness: 0.5, metalness: 0.0
    });
  }
  Mat.def('led', function () { return emis(0xffffff, 1.6); });
  Mat.def('ledRed', function () { return emis(0xff2a1e, 1.8); });
  Mat.def('ledGreen', function () { return emis(0x2bff6a, 1.8); });
  Mat.def('ledAmber', function () { return emis(0xffa32b, 1.8); });
  Mat.def('ledBlue', function () { return emis(0x3ba7ff, 1.8); });
  Mat.def('emissiveWhite', function () {
    return new THREE.MeshBasicMaterial({ color: 0xfff4e2, toneMapped: false });
  });
  Mat.def('neonCyan', function () {
    return new THREE.MeshBasicMaterial({ color: 0x5fd3ff, toneMapped: false });
  });
  Mat.def('neonMagenta', function () {
    return new THREE.MeshBasicMaterial({ color: 0xff5fd0, toneMapped: false });
  });

  /* ---- paper / card / cloth ---- */
  Mat.def('paper', function () {
    return std({ color: 0xf0ead8, roughness: 0.95, metalness: 0.0 });
  });
  Mat.def('cardboard', function () {
    return std(withTex({ roughness: 0.98, metalness: 0.0, color: 0xb08a56 }, Tex.noise(128, 128, 24), 2, 2));
  });
  Mat.def('fabricBlue', function () {
    return std(withTex({ roughness: 0.96, metalness: 0.0, color: 0xffffff }, Tex.fabricChair(0x36435a), 2, 2));
  });
  Mat.def('fabricGrey', function () {
    return std(withTex({ roughness: 0.96, metalness: 0.0, color: 0xffffff }, Tex.fabricChair(0x4c4f54), 2, 2));
  });
  Mat.def('fabricRed', function () {
    return std(withTex({ roughness: 0.96, metalness: 0.0, color: 0xffffff }, Tex.fabricChair(0x6a2b2b), 2, 2));
  });
  Mat.def('leatherTan', function () {
    return std({ color: 0x8a6039, roughness: 0.72, metalness: 0.0 });
  });
  Mat.def('leatherBlack', function () {
    return std({ color: 0x1e2023, roughness: 0.62, metalness: 0.0 });
  });

  /* ---- skin / hair / cloth colours for characters ---- */
  Mat.def('skinLight', function () { return std({ color: 0xe8b894, roughness: 0.78, metalness: 0.0 }); });
  Mat.def('skinMid', function () { return std({ color: 0xc08a5e, roughness: 0.78, metalness: 0.0 }); });
  Mat.def('skinDeep', function () { return std({ color: 0x7a4d31, roughness: 0.78, metalness: 0.0 }); });
  Mat.def('skinPale', function () { return std({ color: 0xf0cbb0, roughness: 0.80, metalness: 0.0 }); });
  Mat.def('hairGrey', function () { return std({ color: 0xcfcac2, roughness: 0.88, metalness: 0.0 }); });
  Mat.def('hairDark', function () { return std({ color: 0x2b2320, roughness: 0.90, metalness: 0.0 }); });
  Mat.def('hairBrown', function () { return std({ color: 0x5a3b24, roughness: 0.90, metalness: 0.0 }); });
  Mat.def('hairSandy', function () { return std({ color: 0x9c7644, roughness: 0.90, metalness: 0.0 }); });
  Mat.def('clothWhite', function () { return std({ color: 0xe9e9e4, roughness: 0.88, metalness: 0.0 }); });
  Mat.def('clothNavy', function () { return std({ color: 0x1e2a40, roughness: 0.86, metalness: 0.0 }); });
  Mat.def('clothBlack', function () { return std({ color: 0x16181b, roughness: 0.84, metalness: 0.0 }); });
  Mat.def('clothOlive', function () { return std({ color: 0x50553a, roughness: 0.88, metalness: 0.0 }); });
  Mat.def('clothTan', function () { return std({ color: 0xa08a63, roughness: 0.88, metalness: 0.0 }); });
  Mat.def('clothGrey', function () { return std({ color: 0x585c62, roughness: 0.87, metalness: 0.0 }); });
  Mat.def('clothMaroon', function () { return std({ color: 0x54262a, roughness: 0.88, metalness: 0.0 }); });
  Mat.def('denim', function () { return std({ color: 0x2f4360, roughness: 0.92, metalness: 0.0 }); });

  /* ---- cat ---- */
  Mat.def('catFur', function () { return std({ color: 0x8b8177, roughness: 0.94, metalness: 0.0 }); });
  Mat.def('catFurDark', function () { return std({ color: 0x3e3833, roughness: 0.94, metalness: 0.0 }); });
  Mat.def('catNose', function () { return std({ color: 0xd78ca0, roughness: 0.7, metalness: 0.0 }); });

  /* ---- misc ---- */
  Mat.def('pcb', function () {
    return std(withTex({ roughness: 0.66, metalness: 0.12, color: 0xffffff }, Tex.pcb(), 1, 1));
  });
  Mat.def('foliage', function () {
    return std({ color: 0x3f6b34, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
  });
  Mat.def('bark', function () {
    return std(withTex({ roughness: 0.96, metalness: 0.0, color: 0x5b4432 }, Tex.noise(128, 128, 20), 2, 4));
  });
  Mat.def('soil', function () { return std({ color: 0x38291d, roughness: 1.0, metalness: 0.0 }); });
  Mat.def('water', function () {
    var m = new THREE.MeshStandardMaterial({
      color: 0x25404a, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.75
    });
    return m;
  });
  Mat.def('roadPaint', function () {
    return std({ color: 0xe6e2d2, roughness: 0.85, metalness: 0.0 });
  });
  Mat.def('hazardYellow', function () { return std({ color: 0xf2c400, roughness: 0.7, metalness: 0.0 }); });
  Mat.def('safetyRed', function () { return std({ color: 0xb1281f, roughness: 0.55, metalness: 0.1 }); });

  /* dynamic colour material (cars, cables, bins...) — cached by hex+profile */
  Mat.color = function (hex, opts) {
    var o = opts || {};
    var key = 'dyn:' + (hex >>> 0).toString(16) + ':' + (o.rough === undefined ? 0.7 : o.rough) +
      ':' + (o.metal === undefined ? 0 : o.metal) + ':' + (o.emissive ? 1 : 0);
    if (Object.prototype.hasOwnProperty.call(matCache, key)) return matCache[key];
    var m;
    try {
      m = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: o.rough === undefined ? 0.7 : o.rough,
        metalness: o.metal === undefined ? 0.0 : o.metal
      });
      if (o.emissive) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = o.emissive; }
    } catch (e) { m = null; }
    if (m) { m.userData.shared = true; m.name = key; }
    matCache[key] = m;
    return m;
  };

  /* =========================================================================
   * 2b. STV.Mat.screen — live CRT / LCD surfaces
   * =====================================================================*/

  var screenList = [];
  Mat.screens = screenList;

  /* Pre-rendered scanline overlay, shared. */
  var scanCanvas = null;
  function scanlines() {
    if (scanCanvas) return scanCanvas;
    scanCanvas = mkCanvas(4, 4);
    var c = ctx2d(scanCanvas);
    if (c) {
      c.clearRect(0, 0, 4, 4);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(0, 1, 4, 1);
      c.fillStyle = 'rgba(0,0,0,0.10)';
      c.fillRect(0, 3, 4, 1);
    }
    return scanCanvas;
  }

  /**
   * STV.Mat.screen({w,h,crt,glow,bg})
   *  -> {mat, ctx, canvas, tex, flush(), setDirty(), dirty, mesh(w,h), clear(col), dispose()}
   */
  Mat.screen = function (opts) {
    var o = opts || {};
    var w = o.w || 256, h = o.h || 192;
    var crt = o.crt !== false;
    var glow = o.glow === undefined ? 0x33ff88 : o.glow;
    var s = {};

    var canvas = mkCanvas(w, h);
    var ctx = ctx2d(canvas);
    s.canvas = canvas;
    s.ctx = ctx;
    s.w = w; s.h = h;
    s.crt = crt;
    s.glow = glow;
    s.dirty = true;

    if (ctx) {
      ctx.fillStyle = o.bg === undefined ? '#050806' : css(o.bg);
      ctx.fillRect(0, 0, w, h);
    }

    var tex = null, mat = null;
    try {
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      mat.name = 'screen';
    } catch (e) {
      STV.warn('[Mat.screen] init failed', e);
    }
    s.tex = tex;
    s.mat = mat;

    /* CRT dressing baked once into a small overlay canvas we blit on flush */
    var overlay = null;
    if (crt) {
      overlay = mkCanvas(w, h);
      var oc = ctx2d(overlay);
      if (oc) {
        var pat = null;
        try { pat = oc.createPattern(scanlines(), 'repeat'); } catch (e2) { pat = null; }
        if (pat) { oc.fillStyle = pat; oc.fillRect(0, 0, w, h); }
        /* corner vignette + phosphor tint */
        var g = oc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28,
          w / 2, h / 2, Math.max(w, h) * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.42)');
        oc.fillStyle = g;
        oc.fillRect(0, 0, w, h);
        oc.fillStyle = css(glow, 0.05);
        oc.fillRect(0, 0, w, h);
      }
    }
    s.overlay = overlay;

    s.setDirty = function () { s.dirty = true; };

    s.clear = function (col) {
      if (!ctx) return s;
      ctx.fillStyle = col === undefined ? '#050806' : (typeof col === 'number' ? css(col) : col);
      ctx.fillRect(0, 0, w, h);
      s.dirty = true;
      return s;
    };

    s.flush = function () {
      if (!ctx || !tex) return s;
      if (overlay) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        try { ctx.drawImage(overlay, 0, 0); } catch (e3) {}
        ctx.restore();
      }
      tex.needsUpdate = true;
      s.dirty = false;
      return s;
    };

    /* Only pushes pixels when something changed. Safe to call every frame. */
    s.flushIfDirty = function () { if (s.dirty) s.flush(); return s; };

    s.mesh = function (mw, mh) {
      var pw = mw || 0.3, ph = mh || (pw * h / w);
      var g = new THREE.PlaneGeometry(pw, ph);
      var m = new THREE.Mesh(g, mat || Mat.get('screenOff'));
      m.userData.screen = s;
      return m;
    };

    s.dispose = function () {
      var i = screenList.indexOf(s);
      if (i >= 0) screenList.splice(i, 1);
      if (tex && tex.dispose) tex.dispose();
      if (mat && mat.dispose) mat.dispose();
    };

    screenList.push(s);
    return s;
  };

  /* Game may call this each frame; it throttles all screens to ~15fps. */
  var lastScreenTick = 0;
  Mat.updateScreens = function (nowMs) {
    var t = nowMs === undefined ? STV.now() : nowMs;
    if (t - lastScreenTick < 66) return;
    lastScreenTick = t;
    var i;
    for (i = 0; i < screenList.length; i++) {
      if (screenList[i].dirty) screenList[i].flush();
    }
  };

  /* =========================================================================
   * 3. STV.Geo — mesh factories
   *
   *  CONVENTIONS
   *   - Freestanding props: origin at FLOOR LEVEL, centred in XZ.
   *   - Wall-mounted panels (poster, vent, wallClock, badgeReader, signage,
   *     elevatorPanel, securityCamera, doorChime, pegboard): origin at the
   *     panel CENTRE, back face at z=0, facing +Z. These carry
   *     userData.mount === 'wall' so Levels can tell them apart.
   *   - userData.size      = THREE.Vector3(w,h,d)
   *   - userData.colliders = [{type:'box', c:Vector3, h:Vector3}] LOCAL space
   *   - Characters face LOCAL +Z.
   * =====================================================================*/

  var Geo = {};
  var geoCache = {};
  Geo.cache = geoCache;

  function r3(v) { return Math.round(v * 1000) / 1000; }
  function V3(x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); }

  /* Shared-geometry cache. Anything from here is marked shared so the engine's
   * disposal helper leaves it alone. */
  function gc(key, f) {
    if (Object.prototype.hasOwnProperty.call(geoCache, key)) return geoCache[key];
    var g = null;
    try { g = f(); } catch (e) {
      STV.warn('[Geo] geometry failed: ' + key, e);
      try { g = new THREE.BoxGeometry(0.1, 0.1, 0.1); } catch (e2) { g = null; }
    }
    if (g) { g.userData.shared = true; g.name = key; }
    geoCache[key] = g;
    return g;
  }

  Geo.disposeCache = function () {
    var k;
    for (k in geoCache) {
      if (geoCache[k] && geoCache[k].dispose) geoCache[k].dispose();
    }
    geoCache = Geo.cache = {};
  };

  /* ---- cached primitive geometries ---- */
  function BOXG(w, h, d) {
    return gc('b|' + r3(w) + '|' + r3(h) + '|' + r3(d), function () {
      return new THREE.BoxGeometry(w, h, d);
    });
  }
  function CYLG(rt, rb, h, seg, open) {
    var s = seg || 12;
    return gc('c|' + r3(rt) + '|' + r3(rb) + '|' + r3(h) + '|' + s + '|' + (open ? 1 : 0), function () {
      return new THREE.CylinderGeometry(rt, rb, h, s, 1, !!open);
    });
  }
  function SPHG(r, seg) {
    var s = seg || 12;
    return gc('s|' + r3(r) + '|' + s, function () {
      return new THREE.SphereGeometry(r, s, Math.max(4, s >> 1));
    });
  }
  function PLANEG(w, h) {
    return gc('p|' + r3(w) + '|' + r3(h), function () { return new THREE.PlaneGeometry(w, h); });
  }
  function CAPG(r, len, seg) {
    var s = seg || 8;
    return gc('k|' + r3(r) + '|' + r3(len) + '|' + s, function () {
      if (THREE.CapsuleGeometry) return new THREE.CapsuleGeometry(r, len, 2, s);
      return new THREE.CylinderGeometry(r, r, len + r * 2, s);
    });
  }
  function TORG(r, tube, seg) {
    var s = seg || 12;
    return gc('t|' + r3(r) + '|' + r3(tube) + '|' + s, function () {
      return new THREE.TorusGeometry(r, tube, 6, s);
    });
  }
  function CONEG(r, h, seg) {
    var s = seg || 12;
    return gc('n|' + r3(r) + '|' + r3(h) + '|' + s, function () {
      return new THREE.ConeGeometry(r, h, s, 1, true);
    });
  }

  /* Chamfered box — the workhorse silhouette. Beveled extrusion, 1 bevel seg. */
  function CHAMG(w, h, d, c) {
    var ch = Math.max(0.001, Math.min(c, Math.min(w, Math.min(h, d)) * 0.45));
    return gc('m|' + r3(w) + '|' + r3(h) + '|' + r3(d) + '|' + r3(ch), function () {
      var sw = Math.max(0.002, w - ch * 2), sh = Math.max(0.002, h - ch * 2);
      var sd = Math.max(0.002, d - ch * 2);
      var sp = new THREE.Shape();
      sp.moveTo(-sw / 2, -sh / 2);
      sp.lineTo(sw / 2, -sh / 2);
      sp.lineTo(sw / 2, sh / 2);
      sp.lineTo(-sw / 2, sh / 2);
      sp.lineTo(-sw / 2, -sh / 2);
      var g = new THREE.ExtrudeGeometry(sp, {
        depth: sd, bevelEnabled: true, bevelSegments: 1, curveSegments: 1,
        steps: 1, bevelSize: ch, bevelThickness: ch, bevelOffset: 0
      });
      g.translate(0, 0, -sd / 2);
      g.computeVertexNormals();
      return g;
    });
  }

  /* ---- mesh helpers ---- */
  var NOSHADOW = { shadow: false };
  function M(name) { return Mat.get(name); }

  function mk(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat || M('greyPlastic'));
    if (x || y || z) m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function box(p, w, h, d, mat, x, y, z) { var m = mk(BOXG(w, h, d), mat, x, y, z); p.add(m); return m; }
  function cbox(p, w, h, d, c, mat, x, y, z) { var m = mk(CHAMG(w, h, d, c), mat, x, y, z); p.add(m); return m; }
  function cyl(p, rt, rb, h, seg, mat, x, y, z) { var m = mk(CYLG(rt, rb, h, seg), mat, x, y, z); p.add(m); return m; }
  function sph(p, r, seg, mat, x, y, z) { var m = mk(SPHG(r, seg), mat, x, y, z); p.add(m); return m; }
  function pl(p, w, h, mat, x, y, z) {
    var m = new THREE.Mesh(PLANEG(w, h), mat || M('paper'));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = false; m.receiveShadow = false;
    p.add(m); return m;
  }
  function noShadow(m) { m.castShadow = false; m.receiveShadow = false; return m; }

  function col(cx, cy, cz, ex, ey, ez) {
    return { type: 'box', c: V3(cx, cy, cz), h: V3(ex, ey, ez) };
  }
  function grp(name) {
    var g = new THREE.Group();
    if (name) g.name = name;
    g.userData.colliders = [];
    return g;
  }
  function fin(g, w, h, d, colliders) {
    g.userData.size = V3(w, h, d);
    if (colliders) g.userData.colliders = colliders;
    else if (!g.userData.colliders) g.userData.colliders = [];
    return g;
  }
  function interact(g, label, key) {
    g.userData.interact = { label: label || 'Examine', key: key || 'e' };
    return g;
  }
  function num(v, dflt) {
    return (typeof v === 'number' && isFinite(v)) ? v : dflt;
  }
  function opt(o) { return o || {}; }
  function seedOf(o, dflt) { return STV.rng(num(opt(o).seed, dflt)); }

  /* Instanced repeats — used wherever a prop tiles (fences, racks, tiles). */
  function inst(geo, mat, count) {
    var im = new THREE.InstancedMesh(geo, mat, Math.max(1, count | 0));
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    return im;
  }
  var _mtx = new THREE.Matrix4();
  var _qt = new THREE.Quaternion();
  var _sc = new THREE.Vector3(1, 1, 1);
  var _ps = new THREE.Vector3();
  var _eu = new THREE.Euler();
  function setInst(im, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    _ps.set(x, y, z);
    _eu.set(rx || 0, ry || 0, rz || 0);
    _qt.setFromEuler(_eu);
    _sc.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    _mtx.compose(_ps, _qt, _sc);
    im.setMatrixAt(i, _mtx);
  }

  /* =========================================================================
   * 3a. STRUCTURE
   * =====================================================================*/

  var WALL_TEX = {
    drywall: 'drywall', drywallShop: 'drywallShop', brick: 'brick',
    concrete: 'concrete', steel: 'steel', wood: 'wood', tile: 'tileFloor',
    acoustic: 'acoustic'
  };

  /** wall(w,h,opts) — spans X, thickness in Z, origin floor-centre. */
  Geo.wall = function (w, h, opts) {
    var o = opt(opts);
    var W = num(w, 4), H = num(h, 2.7);
    var t = num(o.thick, 0.14);
    var g = grp('wall');
    var mat = o.material || M(WALL_TEX[o.tex] || o.mat || 'drywall');
    var m = box(g, W, H, t, mat, 0, H / 2, 0);
    m.receiveShadow = true;
    if (o.skirting !== false) {
      box(g, W, 0.10, t + 0.024, M(o.skirtMat || 'woodDark'), 0, 0.05, 0);
    }
    if (o.trim) box(g, W, 0.06, t + 0.02, M('clothWhite'), 0, H - 0.06, 0);
    fin(g, W, H, t, [col(0, H / 2, 0, W / 2, H / 2, t / 2 + 0.005)]);
    return g;
  };

  /** floorSlab(w,d,opts) — walking surface at y=0, slab hangs below. */
  Geo.floorSlab = function (w, d, opts) {
    var o = opt(opts);
    var W = num(w, 6), D = num(d, 6), t = num(o.thick, 0.14);
    var g = grp('floorSlab');
    var mat = o.material || M(o.mat || 'concrete');
    var m = box(g, W, t, D, mat, 0, -t / 2, 0);
    m.castShadow = false;
    m.receiveShadow = true;
    fin(g, W, t, D, o.solid === false ? [] : [col(0, -t / 2, 0, W / 2, t / 2, D / 2)]);
    g.userData.floor = true;
    return g;
  };

  /** ceilingSlab(w,d,opts) — underside sits at opts.y (default 2.7). */
  Geo.ceilingSlab = function (w, d, opts) {
    var o = opt(opts);
    var W = num(w, 6), D = num(d, 6), t = num(o.thick, 0.12);
    var y = num(o.y, 2.7);
    var g = grp('ceilingSlab');
    var mat = o.material || M(o.mat || 'ceiling');
    var m = box(g, W, t, D, mat, 0, y + t / 2, 0);
    m.castShadow = false;
    m.receiveShadow = true;
    /* Suspended-tile grid: one instanced T-bar set, cheap. */
    if (o.grid !== false && o.mat !== 'concrete') {
      var cx = Math.max(1, Math.round(W / 0.6)), cz = Math.max(1, Math.round(D / 0.6));
      var barX = inst(BOXG(W, 0.03, 0.025), M('aluminium'), cz + 1);
      var i;
      for (i = 0; i <= cz; i++) setInst(barX, i, 0, y - 0.014, -D / 2 + i * (D / cz), 0, 0, 0);
      barX.instanceMatrix.needsUpdate = true;
      barX.castShadow = false;
      g.add(barX);
      var barZ = inst(BOXG(0.025, 0.03, D), M('aluminium'), cx + 1);
      for (i = 0; i <= cx; i++) setInst(barZ, i, -W / 2 + i * (W / cx), y - 0.014, 0, 0, 0, 0);
      barZ.instanceMatrix.needsUpdate = true;
      barZ.castShadow = false;
      g.add(barZ);
    }
    fin(g, W, t, D, o.solid === false ? [] : [col(0, y + t / 2, 0, W / 2, t / 2, D / 2)]);
    return g;
  };

  /** doorway(w,h) — cased opening. Colliders are the jambs + header only. */
  Geo.doorway = function (w, h) {
    var W = num(w, 0.92), H = num(h, 2.05);
    var g = grp('doorway');
    var t = 0.16, j = 0.06;
    var mat = M('clothWhite');
    box(g, j, H + j, t, mat, -(W / 2 + j / 2), (H + j) / 2, 0);
    box(g, j, H + j, t, mat, (W / 2 + j / 2), (H + j) / 2, 0);
    box(g, W + j * 2, j, t, mat, 0, H + j / 2, 0);
    /* reveal lining */
    box(g, 0.02, H, t - 0.02, M('drywall'), -W / 2 + 0.01, H / 2, 0);
    box(g, 0.02, H, t - 0.02, M('drywall'), W / 2 - 0.01, H / 2, 0);
    fin(g, W + j * 2, H + j, t, [
      col(-(W / 2 + j / 2), (H + j) / 2, 0, j / 2, (H + j) / 2, t / 2),
      col((W / 2 + j / 2), (H + j) / 2, 0, j / 2, (H + j) / 2, t / 2),
      col(0, H + j / 2, 0, W / 2 + j, j / 2, t / 2)
    ]);
    return g;
  };

  /** door(w,h,opts) — hinged leaf. g.open(t), t 0..1. */
  Geo.door = function (w, h, opts) {
    var o = opt(opts);
    var W = num(w, 0.86), H = num(h, 2.05);
    var g = grp('door');
    var hingeLeft = o.hinge !== 'right';
    var pivot = new THREE.Group();
    pivot.position.set(hingeLeft ? -W / 2 : W / 2, 0, 0);
    g.add(pivot);
    var leaf = new THREE.Group();
    leaf.position.set(hingeLeft ? W / 2 : -W / 2, 0, 0);
    pivot.add(leaf);

    var mat = o.material || M(o.mat || 'wood');
    var t = num(o.thick, 0.045);
    cbox(leaf, W, H, t, 0.012, mat, 0, H / 2, 0);
    /* two recessed panels */
    if (o.panels !== false) {
      var pw = W - 0.16;
      box(leaf, pw, H * 0.42, 0.012, M('woodDark'), 0, H * 0.28, t / 2 - 0.004);
      box(leaf, pw, H * 0.28, 0.012, M('woodDark'), 0, H * 0.72, t / 2 - 0.004);
      box(leaf, pw, H * 0.42, 0.012, M('woodDark'), 0, H * 0.28, -t / 2 + 0.004);
      box(leaf, pw, H * 0.28, 0.012, M('woodDark'), 0, H * 0.72, -t / 2 + 0.004);
    }
    if (o.glass) {
      var gp = box(leaf, W - 0.18, H * 0.5, 0.01, M('glassTint'), 0, H * 0.66, 0);
      noShadow(gp);
    }
    /* handle both faces */
    var hx0 = hingeLeft ? W / 2 - 0.08 : -(W / 2 - 0.08);
    var hm = M('chrome');
    cyl(leaf, 0.018, 0.018, 0.05, 8, hm, hx0, 1.03, t / 2 + 0.025).rotation.x = Math.PI / 2;
    cyl(leaf, 0.014, 0.014, 0.11, 8, hm, hx0 - (hingeLeft ? 0.03 : -0.03), 1.03, t / 2 + 0.05).rotation.z = Math.PI / 2;
    cyl(leaf, 0.018, 0.018, 0.05, 8, hm, hx0, 1.03, -t / 2 - 0.025).rotation.x = Math.PI / 2;
    cyl(leaf, 0.014, 0.014, 0.11, 8, hm, hx0 - (hingeLeft ? 0.03 : -0.03), 1.03, -t / 2 - 0.05).rotation.z = Math.PI / 2;
    if (o.closer) box(leaf, 0.16, 0.05, 0.05, M('steelDark'), 0, H - 0.09, t / 2 + 0.03);

    var solid = [col(0, H / 2, 0, W / 2, H / 2, t / 2 + 0.01)];
    fin(g, W, H, t, solid.slice());
    g.pivot = pivot;
    g.leaf = leaf;
    g.userData.openAmount = 0;
    var maxAng = num(o.maxAngle, Math.PI * 0.52) * (hingeLeft ? -1 : 1) * (o.swing === 'in' ? -1 : 1);
    g.open = function (t01) {
      var k = STV.clamp(num(t01, 0), 0, 1);
      g.userData.openAmount = k;
      pivot.rotation.y = maxAng * STV.ease.inOutSine(k);
      /* stop blocking once it is meaningfully ajar */
      g.userData.colliders = k > 0.22 ? [] : solid.slice();
      return g;
    };
    interact(g, 'Open door', 'e');
    return g;
  };

  /** window(w,h) — wall-mounted; origin at pane centre, glass in the z=0 plane. */
  Geo.window = function (w, h) {
    var W = num(w, 1.4), H = num(h, 1.2);
    var g = grp('window');
    g.userData.mount = 'wall';
    var f = 0.06, t = 0.09;
    var mat = M('greyPlastic');
    box(g, W, f, t, mat, 0, H / 2 - f / 2, 0);
    box(g, W, f, t, mat, 0, -H / 2 + f / 2, 0);
    box(g, f, H - f * 2, t, mat, -W / 2 + f / 2, 0, 0);
    box(g, f, H - f * 2, t, mat, W / 2 - f / 2, 0, 0);
    box(g, 0.03, H - f * 2, t - 0.03, mat, 0, 0, 0);
    var glass = box(g, W - f * 2, H - f * 2, 0.008, M('glassDirty'), 0, 0, 0);
    noShadow(glass);
    box(g, W + 0.06, 0.05, 0.16, M('clothWhite'), 0, -H / 2 - 0.02, 0.04);
    fin(g, W, H, t, []);
    g.glass = glass;
    return g;
  };

  /** stairs(w,h,d,steps) — bottom step starts at z=-d/2, climbs toward +z. */
  Geo.stairs = function (w, h, d, steps) {
    var W = num(w, 1.2), H = num(h, 2.7), D = num(d, 3.0);
    var n = Math.max(2, num(steps, Math.max(2, Math.round(H / 0.175))));
    var g = grp('stairs');
    var rise = H / n, run = D / n;
    var tread = M('concrete'), riser = M('concretePolished');
    var stepG = BOXG(W, 0.05, run + 0.03);
    var riseG = BOXG(W, rise, 0.035);
    var im = inst(stepG, tread, n);
    var im2 = inst(riseG, riser, n);
    var i, cs = [];
    for (i = 0; i < n; i++) {
      var y = rise * (i + 1);
      var z = -D / 2 + run * (i + 0.5);
      setInst(im, i, 0, y - 0.025, z);
      setInst(im2, i, 0, y - rise / 2, z - run / 2);
      cs.push(col(0, y - rise / 2, z, W / 2, rise / 2, run / 2));
    }
    im.instanceMatrix.needsUpdate = true;
    im2.instanceMatrix.needsUpdate = true;
    g.add(im); g.add(im2);
    /* stringers */
    box(g, 0.06, 0.16, D * 1.02, M('steelDark'), -W / 2 - 0.03, H / 2, 0).rotation.x = -Math.atan2(H, D);
    box(g, 0.06, 0.16, D * 1.02, M('steelDark'), W / 2 + 0.03, H / 2, 0).rotation.x = -Math.atan2(H, D);
    fin(g, W, H, D, cs);
    g.userData.ramp = { h: H, d: D };
    return g;
  };

  /** railing(len) — spans X, 1.05m tall. */
  Geo.railing = function (len) {
    var L = num(len, 2), H = 1.05;
    var g = grp('railing');
    var n = Math.max(2, Math.round(L / 0.9) + 1);
    var postG = CYLG(0.018, 0.018, H, 8);
    var im = inst(postG, M('steel'), n);
    var i;
    for (i = 0; i < n; i++) setInst(im, i, -L / 2 + (L * i) / (n - 1), H / 2, 0);
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
    var top = cyl(g, 0.024, 0.024, L, 10, M('chrome'), 0, H, 0);
    top.rotation.z = Math.PI / 2;
    var mid = cyl(g, 0.014, 0.014, L, 8, M('steel'), 0, H * 0.52, 0);
    mid.rotation.z = Math.PI / 2;
    fin(g, L, H, 0.06, [col(0, H / 2, 0, L / 2, H / 2, 0.05)]);
    return g;
  };

  /** pillar(h,r) — round column with base and capital. */
  Geo.pillar = function (h, r) {
    var H = num(h, 2.7), R = num(r, 0.16);
    var g = grp('pillar');
    cyl(g, R, R, H, 14, M('concretePolished'), 0, H / 2, 0);
    box(g, R * 2.6, 0.07, R * 2.6, M('concrete'), 0, 0.035, 0);
    box(g, R * 2.6, 0.07, R * 2.6, M('concrete'), 0, H - 0.035, 0);
    fin(g, R * 2, H, R * 2, [col(0, H / 2, 0, R * 0.95, H / 2, R * 0.95)]);
    return g;
  };

  /** ceilingLight(w,d) — recessed troffer. Emissive plane + one PointLight. */
  Geo.ceilingLight = function (w, d) {
    var W = num(w, 0.6), D = num(d, 1.2);
    var g = grp('ceilingLight');
    g.userData.mount = 'ceiling';
    var housing = box(g, W, 0.09, D, M('clothWhite'), 0, 0.045, 0);
    housing.castShadow = false;
    var diff = new THREE.Mesh(PLANEG(W - 0.05, D - 0.05), M('emissiveWhite'));
    diff.rotation.x = Math.PI / 2;
    diff.position.y = -0.002;
    noShadow(diff);
    g.add(diff);
    var light = null;
    try {
      light = new THREE.PointLight(0xfff2d8, 4.0, Math.max(W, D) * 5.5, 2);
      light.position.set(0, -0.25, 0);
      light.castShadow = false;
      g.add(light);
    } catch (e) { light = null; }
    g.light = light;
    g.diffuser = diff;
    g.setOn = function (on, intensity) {
      var v = on === false ? 0 : num(intensity, 4.0);
      if (light) light.intensity = v;
      if (diff.material && diff.material.emissiveIntensity !== undefined) {
        /* shared material — swap instead of mutating */
        diff.material = on === false ? M('greyPlastic') : M('emissiveWhite');
      }
      return g;
    };
    fin(g, W, 0.09, D, []);
    return g;
  };

  /** fluorescentTube(len) — bare batten fitting, spans X, hangs from ceiling. */
  Geo.fluorescentTube = function (len) {
    var L = num(len, 1.2);
    var g = grp('fluorescentTube');
    g.userData.mount = 'ceiling';
    box(g, L, 0.05, 0.1, M('clothWhite'), 0, -0.03, 0).castShadow = false;
    var tube = cyl(g, 0.018, 0.018, L - 0.06, 8, M('emissiveWhite'), 0, -0.08, 0);
    tube.rotation.z = Math.PI / 2;
    noShadow(tube);
    box(g, 0.03, 0.06, 0.06, M('greyPlastic'), -L / 2 + 0.015, -0.08, 0);
    box(g, 0.03, 0.06, 0.06, M('greyPlastic'), L / 2 - 0.015, -0.08, 0);
    var light = null;
    try {
      light = new THREE.PointLight(0xeaf4ff, 2.4, L * 5, 2);
      light.position.set(0, -0.3, 0);
      g.add(light);
    } catch (e) { light = null; }
    g.light = light;
    g.tube = tube;
    g.setOn = function (on) {
      if (light) light.intensity = on === false ? 0 : 2.4;
      tube.material = on === false ? M('greyPlastic') : M('emissiveWhite');
      return g;
    };
    fin(g, L, 0.12, 0.1, []);
    return g;
  };

  /** vent(w,h) — wall/ceiling grille, origin at panel centre, faces +Z. */
  Geo.vent = function (w, h) {
    var W = num(w, 0.5), H = num(h, 0.35);
    var g = grp('vent');
    g.userData.mount = 'wall';
    box(g, W, H, 0.02, M('steelDark'), 0, 0, -0.012);
    box(g, W, 0.03, 0.03, M('aluminium'), 0, H / 2 - 0.015, 0);
    box(g, W, 0.03, 0.03, M('aluminium'), 0, -H / 2 + 0.015, 0);
    box(g, 0.03, H, 0.03, M('aluminium'), -W / 2 + 0.015, 0, 0);
    box(g, 0.03, H, 0.03, M('aluminium'), W / 2 - 0.015, 0, 0);
    var n = Math.max(3, Math.floor((H - 0.06) / 0.035));
    var louv = inst(BOXG(W - 0.06, 0.018, 0.026), M('aluminium'), n);
    var i;
    for (i = 0; i < n; i++) {
      setInst(louv, i, 0, H / 2 - 0.045 - i * ((H - 0.09) / Math.max(1, n - 1)), 0.002, -0.5, 0, 0);
    }
    louv.instanceMatrix.needsUpdate = true;
    g.add(louv);
    /* screws */
    var sc = inst(CYLG(0.006, 0.006, 0.008, 6), M('steel'), 4);
    setInst(sc, 0, -W / 2 + 0.02, H / 2 - 0.02, 0.014, Math.PI / 2, 0, 0);
    setInst(sc, 1, W / 2 - 0.02, H / 2 - 0.02, 0.014, Math.PI / 2, 0, 0);
    setInst(sc, 2, -W / 2 + 0.02, -H / 2 + 0.02, 0.014, Math.PI / 2, 0, 0);
    setInst(sc, 3, W / 2 - 0.02, -H / 2 + 0.02, 0.014, Math.PI / 2, 0, 0);
    sc.instanceMatrix.needsUpdate = true;
    g.add(sc);
    fin(g, W, H, 0.04, []);
    interact(g, 'Open vent', 'e');
    return g;
  };

  /** ductRun(len) — rectangular duct, spans X, origin at duct centre. */
  Geo.ductRun = function (len) {
    var L = num(len, 3);
    var g = grp('ductRun');
    g.userData.mount = 'ceiling';
    var W = 0.45, H = 0.32;
    box(g, L, H, W, M('aluminium'), 0, 0, 0).receiveShadow = false;
    var n = Math.max(2, Math.round(L / 1.2));
    var fl = inst(BOXG(0.035, H + 0.03, W + 0.03), M('steel'), n);
    var i;
    for (i = 0; i < n; i++) setInst(fl, i, -L / 2 + (L * (i + 0.5)) / n, 0, 0);
    fl.instanceMatrix.needsUpdate = true;
    g.add(fl);
    /* hanger straps */
    var st = inst(BOXG(0.02, 0.34, 0.02), M('steel'), n * 2);
    for (i = 0; i < n; i++) {
      var x = -L / 2 + (L * (i + 0.5)) / n;
      setInst(st, i * 2, x, H / 2 + 0.17, -W / 2);
      setInst(st, i * 2 + 1, x, H / 2 + 0.17, W / 2);
    }
    st.instanceMatrix.needsUpdate = true;
    g.add(st);
    fin(g, L, H, W, [col(0, 0, 0, L / 2, H / 2, W / 2)]);
    return g;
  };

  /** elevatorDoors(w,h) — two leaves, g.open(t). */
  Geo.elevatorDoors = function (w, h) {
    var W = num(w, 1.1), H = num(h, 2.15);
    var g = grp('elevatorDoors');
    var frame = M('steel');
    box(g, 0.09, H + 0.12, 0.12, frame, -W / 2 - 0.045, (H + 0.12) / 2, 0);
    box(g, 0.09, H + 0.12, 0.12, frame, W / 2 + 0.045, (H + 0.12) / 2, 0);
    box(g, W + 0.18, 0.12, 0.12, frame, 0, H + 0.06, 0);
    var left = new THREE.Group(), right = new THREE.Group();
    g.add(left); g.add(right);
    box(left, W / 2 - 0.006, H, 0.05, M('aluminium'), -W / 4, H / 2, 0);
    box(right, W / 2 - 0.006, H, 0.05, M('aluminium'), W / 4, H / 2, 0);
    /* brushed seam detail */
    box(left, 0.01, H, 0.055, M('steelDark'), -0.004, H / 2, 0);
    box(right, 0.01, H, 0.055, M('steelDark'), 0.004, H / 2, 0);
    var solid = [col(0, H / 2, 0, W / 2, H / 2, 0.04)];
    g.left = left; g.right = right;
    g.userData.openAmount = 0;
    g.open = function (t01) {
      var k = STV.clamp(num(t01, 0), 0, 1);
      g.userData.openAmount = k;
      var e = STV.ease.inOutCubic(k);
      left.position.x = -(W / 2 - 0.02) * e;
      right.position.x = (W / 2 - 0.02) * e;
      g.userData.colliders = k > 0.5 ? [] : solid.slice();
      return g;
    };
    fin(g, W + 0.18, H + 0.12, 0.12, solid.slice());
    interact(g, 'Call lift', 'e');
    return g;
  };

  /* =========================================================================
   * 3b. SHOP — furniture, benches, storage
   * =====================================================================*/

  var DESK_H = 0.75;

  /** workbench(w) — 0.75m deep repair bench, ply top, steel legs, lower shelf. */
  Geo.workbench = function (w) {
    var W = num(w, 2.0), D = 0.78, H = DESK_H;
    var g = grp('workbench');
    var top = cbox(g, W, 0.045, D, 0.006, M('wood'), 0, H - 0.0225, 0);
    top.receiveShadow = true;
    /* anti-static mat */
    var mat = box(g, W * 0.62, 0.004, D * 0.7, M('rubber'), 0, H + 0.002, 0.02);
    noShadow(mat);
    var legG = BOXG(0.05, H - 0.05, 0.05);
    var legs = inst(legG, M('steelDark'), 4);
    var ox = W / 2 - 0.07, oz = D / 2 - 0.07;
    setInst(legs, 0, -ox, (H - 0.05) / 2, -oz);
    setInst(legs, 1, ox, (H - 0.05) / 2, -oz);
    setInst(legs, 2, -ox, (H - 0.05) / 2, oz);
    setInst(legs, 3, ox, (H - 0.05) / 2, oz);
    legs.instanceMatrix.needsUpdate = true;
    g.add(legs);
    /* stretchers + lower shelf */
    box(g, W - 0.14, 0.04, 0.04, M('steelDark'), 0, 0.16, -oz);
    box(g, W - 0.14, 0.04, 0.04, M('steelDark'), 0, 0.16, oz);
    box(g, W - 0.1, 0.022, D - 0.14, M('woodDark'), 0, 0.2, 0);
    /* back lip so tiny parts do not roll off */
    box(g, W, 0.06, 0.02, M('wood'), 0, H + 0.03, -D / 2 + 0.01);
    fin(g, W, H, D, [
      col(0, H - 0.05, 0, W / 2, 0.05, D / 2),
      col(0, H / 2 - 0.1, 0, W / 2 - 0.03, H / 2 - 0.1, D / 2 - 0.06)
    ]);
    return g;
  };

  /** counter(w) — shop front counter, customer side has a kick panel. */
  Geo.counter = function (w) {
    var W = num(w, 1.8), D = 0.62, H = 0.98;
    var g = grp('counter');
    box(g, W, H - 0.05, D - 0.06, M('woodDark'), 0, (H - 0.05) / 2, -0.02);
    var top = cbox(g, W + 0.08, 0.05, D, 0.01, M('wood'), 0, H - 0.025, 0);
    top.receiveShadow = true;
    box(g, W + 0.04, 0.72, 0.02, M('wood'), 0, 0.42, D / 2 - 0.03);
    box(g, W - 0.1, 0.05, 0.02, M('steel'), 0, 0.06, D / 2 - 0.045);
    /* two drawers on the staff side */
    var i;
    for (i = 0; i < 2; i++) {
      box(g, W * 0.42, 0.16, 0.02, M('wood'), -W * 0.24 + i * W * 0.48, H - 0.16, -D / 2 + 0.03);
      cyl(g, 0.012, 0.012, 0.11, 8, M('chrome'),
        -W * 0.24 + i * W * 0.48, H - 0.16, -D / 2 + 0.02).rotation.z = Math.PI / 2;
    }
    fin(g, W + 0.08, H, D, [col(0, H / 2, 0, (W + 0.08) / 2, H / 2, D / 2)]);
    return g;
  };

  /** shelvingUnit(w,h) — boltless steel shelving. */
  Geo.shelvingUnit = function (w, h) {
    var W = num(w, 1.0), H = num(h, 1.9), D = 0.42;
    var g = grp('shelvingUnit');
    var uprights = inst(BOXG(0.04, H, 0.04), M('steelDark'), 4);
    var ox = W / 2 - 0.02, oz = D / 2 - 0.02;
    setInst(uprights, 0, -ox, H / 2, -oz);
    setInst(uprights, 1, ox, H / 2, -oz);
    setInst(uprights, 2, -ox, H / 2, oz);
    setInst(uprights, 3, ox, H / 2, oz);
    uprights.instanceMatrix.needsUpdate = true;
    g.add(uprights);
    var n = Math.max(2, Math.round(H / 0.42));
    var shelves = inst(BOXG(W, 0.022, D), M('woodDark'), n);
    var i;
    for (i = 0; i < n; i++) setInst(shelves, i, 0, 0.08 + i * ((H - 0.14) / (n - 1)), 0);
    shelves.instanceMatrix.needsUpdate = true;
    g.add(shelves);
    /* diagonal brace on the back */
    var br = box(g, Math.sqrt(W * W + H * H), 0.02, 0.015, M('steel'), 0, H / 2, -D / 2 + 0.01);
    br.rotation.z = Math.atan2(H, W);
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    g.shelfYs = (function () { var a = [], k; for (k = 0; k < n; k++) a.push(0.091 + k * ((H - 0.14) / (n - 1))); return a; })();
    return g;
  };

  /** pegboard(w,h) — wall-mounted, hooks and hanging tool silhouettes. */
  Geo.pegboard = function (w, h) {
    var W = num(w, 1.2), H = num(h, 0.9);
    var g = grp('pegboard');
    g.userData.mount = 'wall';
    var bd = box(g, W, H, 0.012, M('beige'), 0, 0, -0.006);
    bd.castShadow = false;
    /* hole grid, faked with a dark instanced dot sheet (cheap, reads right) */
    var cx = Math.min(24, Math.floor(W / 0.05)), cy = Math.min(20, Math.floor(H / 0.05));
    var holes = inst(CYLG(0.004, 0.004, 0.004, 5), M('blackPlastic'), cx * cy);
    var i, j, n = 0;
    for (j = 0; j < cy; j++) {
      for (i = 0; i < cx; i++) {
        setInst(holes, n++, -W / 2 + 0.025 + i * (W - 0.05) / Math.max(1, cx - 1),
          -H / 2 + 0.025 + j * (H - 0.05) / Math.max(1, cy - 1), 0.001, Math.PI / 2, 0, 0);
      }
    }
    holes.instanceMatrix.needsUpdate = true;
    noShadow(holes);
    g.add(holes);
    /* hooks + a few hanging tools */
    var rng = STV.rng(4711);
    var hooks = inst(CYLG(0.004, 0.004, 0.06, 5), M('chrome'), 8);
    for (i = 0; i < 8; i++) {
      setInst(hooks, i, -W / 2 + 0.12 + i * (W - 0.24) / 7, H / 2 - 0.12, 0.03, Math.PI / 2, 0, 0);
    }
    hooks.instanceMatrix.needsUpdate = true;
    g.add(hooks);
    for (i = 0; i < 6; i++) {
      var x = -W / 2 + 0.12 + i * (W - 0.24) / 7;
      var len = 0.14 + rng() * 0.12;
      var tool = box(g, 0.022, len, 0.018, i % 2 ? M('steel') : M('safetyRed'), x, H / 2 - 0.14 - len / 2, 0.03);
      tool.castShadow = false;
      if (i % 2) box(g, 0.03, 0.05, 0.028, M('blackPlastic'), x, H / 2 - 0.14 - len - 0.02, 0.03);
    }
    fin(g, W, H, 0.06, []);
    return g;
  };

  /** toolChest() — 5-drawer roller cab. */
  Geo.toolChest = function () {
    var W = 0.66, H = 0.98, D = 0.44;
    var g = grp('toolChest');
    var body = M('safetyRed');
    cbox(g, W, H - 0.1, D, 0.01, body, 0, 0.1 + (H - 0.1) / 2, 0);
    var top = box(g, W + 0.02, 0.02, D + 0.02, M('rubber'), 0, H + 0.01, 0);
    noShadow(top);
    var n = 5, i;
    var faces = inst(BOXG(W - 0.05, 0.13, 0.012), M('safetyRed'), n);
    var pulls = inst(BOXG(W - 0.22, 0.022, 0.022), M('chrome'), n);
    for (i = 0; i < n; i++) {
      var y = 0.2 + i * 0.155;
      setInst(faces, i, 0, y, D / 2 + 0.004);
      setInst(pulls, i, 0, y + 0.04, D / 2 + 0.018);
    }
    faces.instanceMatrix.needsUpdate = true;
    pulls.instanceMatrix.needsUpdate = true;
    g.add(faces); g.add(pulls);
    /* castors */
    var cast = inst(CYLG(0.045, 0.045, 0.03, 8), M('blackPlastic'), 4);
    setInst(cast, 0, -W / 2 + 0.07, 0.045, -D / 2 + 0.07, 0, 0, Math.PI / 2);
    setInst(cast, 1, W / 2 - 0.07, 0.045, -D / 2 + 0.07, 0, 0, Math.PI / 2);
    setInst(cast, 2, -W / 2 + 0.07, 0.045, D / 2 - 0.07, 0, 0, Math.PI / 2);
    setInst(cast, 3, W / 2 - 0.07, 0.045, D / 2 - 0.07, 0, 0, Math.PI / 2);
    cast.instanceMatrix.needsUpdate = true;
    g.add(cast);
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Open drawer', 'e');
    return g;
  };

  /** officeChair() — 5-star gas-lift task chair. g.spin(a) turns the seat. */
  Geo.officeChair = function (opts) {
    var o = opt(opts);
    var g = grp('officeChair');
    var fabric = M(o.fabric || 'fabricGrey');
    var base = new THREE.Group();
    g.add(base);
    var arms = inst(BOXG(0.30, 0.025, 0.05), M('blackPlastic'), 5);
    var i;
    for (i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2;
      setInst(arms, i, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, 0, -a, 0);
    }
    arms.instanceMatrix.needsUpdate = true;
    base.add(arms);
    var casts = inst(CYLG(0.028, 0.028, 0.02, 8), M('rubber'), 5);
    for (i = 0; i < 5; i++) {
      var a2 = (i / 5) * Math.PI * 2;
      setInst(casts, i, Math.cos(a2) * 0.29, 0.028, Math.sin(a2) * 0.29, 0, 0, Math.PI / 2);
    }
    casts.instanceMatrix.needsUpdate = true;
    base.add(casts);
    cyl(base, 0.032, 0.032, 0.30, 10, M('chrome'), 0, 0.2, 0);
    var seat = new THREE.Group();
    seat.position.y = 0.36;
    g.add(seat);
    cbox(seat, 0.46, 0.09, 0.44, 0.03, fabric, 0, 0.045, 0);
    box(seat, 0.30, 0.03, 0.30, M('blackPlastic'), 0, -0.01, 0);
    var backPivot = new THREE.Group();
    backPivot.position.set(0, 0.08, -0.20);
    seat.add(backPivot);
    backPivot.rotation.x = 0.14;
    cbox(backPivot, 0.42, 0.50, 0.08, 0.025, fabric, 0, 0.26, 0);
    cbox(backPivot, 0.36, 0.10, 0.06, 0.02, fabric, 0, 0.56, 0.01);
    /* armrests */
    var ar;
    for (i = 0; i < 2; i++) {
      ar = i ? 1 : -1;
      box(seat, 0.03, 0.20, 0.03, M('blackPlastic'), ar * 0.24, 0.14, -0.06);
      cbox(seat, 0.06, 0.03, 0.24, 0.012, M('blackPlastic'), ar * 0.24, 0.245, -0.02);
    }
    g.seat = seat;
    g.base = base;
    g.spin = function (a) { seat.rotation.y = a || 0; return g; };
    g.recline = function (t) { backPivot.rotation.x = 0.14 + STV.clamp(num(t, 0), 0, 1) * 0.3; return g; };
    fin(g, 0.62, 1.02, 0.62, [col(0, 0.25, 0, 0.24, 0.25, 0.24)]);
    g.userData.seatY = 0.45;
    return g;
  };

  /** stool() — shop stool, 0.62m seat. */
  Geo.stool = function () {
    var g = grp('stool');
    var H = 0.62;
    cyl(g, 0.17, 0.18, 0.06, 14, M('rubber'), 0, H - 0.03, 0);
    cyl(g, 0.03, 0.03, H - 0.06, 10, M('steel'), 0, (H - 0.06) / 2, 0);
    var legs = inst(BOXG(0.026, 0.026, 0.34), M('steel'), 3);
    var i;
    for (i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2;
      setInst(legs, i, Math.cos(a) * 0.13, 0.14, Math.sin(a) * 0.13, -0.42, -a, 0);
    }
    legs.instanceMatrix.needsUpdate = true;
    g.add(legs);
    var ring = cyl(g, 0.15, 0.15, 0.016, 12, M('steel'), 0, 0.24, 0);
    ring.geometry = TORG(0.15, 0.01, 10);
    ring.rotation.x = Math.PI / 2;
    fin(g, 0.36, H, 0.36, [col(0, H / 2, 0, 0.17, H / 2, 0.17)]);
    g.userData.seatY = H;
    return g;
  };

  /* =========================================================================
   * 3c. SHOP — computers and screens
   * =====================================================================*/

  /** crtMonitor(size) — chunky late-90s CRT. size = nominal inches (14/15/17/21). */
  Geo.crtMonitor = function (size, opts) {
    var o = opt(opts);
    var inch = num(size, 15);
    var s = inch / 15;
    var W = 0.38 * s, H = 0.37 * s, D = 0.42 * s;
    var g = grp('crtMonitor');
    var beige = M(o.dark ? 'blackPlastic' : 'beige');
    var beigeD = M(o.dark ? 'blackPlastic' : 'beigeDark');
    /* base / tilt-swivel foot */
    cbox(g, W * 0.82, 0.035, D * 0.72, 0.012, beigeD, 0, 0.018, 0.01);
    cyl(g, W * 0.24, W * 0.26, 0.03, 12, beigeD, 0, 0.048, 0.01);
    var body = new THREE.Group();
    body.position.y = 0.062;
    g.add(body);
    /* the big tapering box: front bezel + rear shroud */
    cbox(body, W, H, D * 0.42, 0.022, beige, 0, H / 2, D * 0.21 - 0.02);
    var shroud = cbox(body, W * 0.80, H * 0.80, D * 0.5, 0.03, beige, 0, H / 2, -D * 0.24);
    shroud.scale.set(1, 1, 1);
    /* rear taper: a second, smaller block further back */
    cbox(body, W * 0.56, H * 0.56, D * 0.12, 0.02, beigeD, 0, H / 2, -D * 0.46);
    /* vent slots on top */
    var vn = 7, i;
    var vents = inst(BOXG(W * 0.5, 0.004, 0.012), M('blackPlastic'), vn);
    for (i = 0; i < vn; i++) setInst(vents, i, 0, H - 0.004, D * 0.06 - i * 0.022);
    vents.instanceMatrix.needsUpdate = true;
    noShadow(vents);
    body.add(vents);
    /* screen: slightly inset, curved look via a bezel lip */
    var sw = W * 0.80, sh = H * 0.78;
    box(body, sw + 0.02, sh + 0.02, 0.01, M('blackPlastic'), 0, H / 2, D * 0.42 - 0.008);
    var scr = Mat.screen({
      w: 256, h: 192, crt: true, glow: o.glow === undefined ? 0x9fd8ff : o.glow,
      bg: o.bg === undefined ? 0x06090a : o.bg
    });
    var pane = new THREE.Mesh(PLANEG(sw, sh), scr.mat || M('screenOff'));
    pane.position.set(0, H / 2, D * 0.42);
    noShadow(pane);
    body.add(pane);
    g.screen = scr;
    g.pane = pane;
    /* brand strip, power LED, buttons */
    box(body, W * 0.34, 0.012, 0.008, beigeD, -W * 0.2, 0.055, D * 0.42 - 0.002);
    var led = box(body, 0.012, 0.008, 0.006, M('ledGreen'), W * 0.34, 0.05, D * 0.42);
    noShadow(led);
    g.led = led;
    var btns = inst(BOXG(0.016, 0.008, 0.006), M('beigeDark'), 4);
    for (i = 0; i < 4; i++) setInst(btns, i, -W * 0.02 + i * 0.024, 0.05, D * 0.42);
    btns.instanceMatrix.needsUpdate = true;
    body.add(btns);
    fin(g, W, H + 0.062, D, [col(0, (H + 0.062) / 2, 0, W / 2, (H + 0.062) / 2, D / 2)]);
    g.userData.screenSize = { w: sw, h: sh };
    interact(g, 'Use computer', 'e');
    return g;
  };

  /** lcdMonitor(size) — modern thin panel on a slim stand. */
  Geo.lcdMonitor = function (size, opts) {
    var o = opt(opts);
    var inch = num(size, 22);
    var W = 0.0221 * inch * 0.92, H = W * 0.6, D = 0.05;
    var g = grp('lcdMonitor');
    var shell = M('blackPlastic');
    cbox(g, W * 0.5, 0.016, 0.20, 0.008, shell, 0, 0.008, 0);
    var neck = box(g, 0.05, 0.22, 0.03, shell, 0, 0.13, -0.01);
    neck.rotation.x = -0.06;
    var head = new THREE.Group();
    head.position.set(0, 0.24 + H / 2, 0);
    head.rotation.x = -0.05;
    g.add(head);
    cbox(head, W, H, D * 0.4, 0.006, shell, 0, 0, -0.012);
    box(head, W, H, 0.006, shell, 0, 0, 0.004);
    var scr = Mat.screen({ w: 320, h: 200, crt: false, glow: o.glow === undefined ? 0x8fd0ff : o.glow, bg: 0x0a0d12 });
    var pane = new THREE.Mesh(PLANEG(W - 0.024, H - 0.03), scr.mat || M('screenOff'));
    pane.position.set(0, 0.006, 0.008);
    noShadow(pane);
    head.add(pane);
    var led = box(head, 0.01, 0.006, 0.004, M('ledBlue'), W / 2 - 0.03, -H / 2 + 0.006, 0.008);
    noShadow(led);
    g.screen = scr; g.pane = pane; g.head = head; g.led = led;
    fin(g, W, 0.24 + H, 0.20, [col(0, (0.24 + H) / 2, 0, W / 2, (0.24 + H) / 2, 0.1)]);
    interact(g, 'Use computer', 'e');
    return g;
  };

  /** pcTowerBeige() — the hero 1998 AT tower. Yellowed beige, 5.25" bays, turbo. */
  Geo.pcTowerBeige = function (opts) {
    var o = opt(opts);
    var W = 0.20, H = 0.44, D = 0.44;
    var g = grp('pcTowerBeige');
    var beige = M('beige'), dark = M('beigeDark');
    /* main case, front face at +Z */
    cbox(g, W, H, D, 0.006, beige, 0, H / 2, 0);
    /* front bezel, proud of the case */
    var bz = cbox(g, W + 0.004, H, 0.018, 0.004, beige, 0, H / 2, D / 2 + 0.008);
    bz.receiveShadow = false;
    var fz = D / 2 + 0.018;
    /* two 5.25" bays: CD-ROM + blank */
    var i;
    var bayY = [H - 0.055, H - 0.115];
    for (i = 0; i < 2; i++) {
      box(g, W * 0.78, 0.041, 0.008, dark, 0, bayY[i], fz - 0.004);
      if (i === 0) {
        /* CD-ROM: tray seam, eject button, headphone jack, activity LED */
        box(g, W * 0.62, 0.012, 0.006, M('blackPlastic'), -0.006, bayY[i] - 0.004, fz);
        box(g, 0.014, 0.006, 0.005, dark, W * 0.30, bayY[i] - 0.012, fz);
        cyl(g, 0.004, 0.004, 0.004, 6, M('blackPlastic'), -W * 0.34, bayY[i] - 0.012, fz).rotation.x = Math.PI / 2;
        noShadow(box(g, 0.006, 0.004, 0.004, M('ledAmber'), W * 0.20, bayY[i] - 0.012, fz));
      }
    }
    /* 3.5" floppy bay */
    box(g, W * 0.62, 0.028, 0.008, dark, 0, H - 0.168, fz - 0.004);
    box(g, W * 0.48, 0.009, 0.005, M('blackPlastic'), -0.004, H - 0.166, fz);
    box(g, 0.012, 0.008, 0.005, dark, W * 0.24, H - 0.176, fz);
    /* THAT grille: horizontal ribs down the lower bezel */
    var rn = 9;
    var ribs = inst(BOXG(W * 0.66, 0.006, 0.006), dark, rn);
    for (i = 0; i < rn; i++) setInst(ribs, i, 0, H - 0.215 - i * 0.0125, fz - 0.002);
    ribs.instanceMatrix.needsUpdate = true;
    noShadow(ribs);
    g.add(ribs);
    /* badge plate + turbo/reset + big power button + LEDs */
    box(g, W * 0.5, 0.022, 0.004, M('beigeDark'), -W * 0.14, 0.115, fz);
    var pwr = cbox(g, 0.036, 0.016, 0.012, 0.003, dark, -W * 0.22, 0.075, fz);
    var turbo = cbox(g, 0.016, 0.010, 0.010, 0.002, dark, W * 0.16, 0.075, fz);
    var reset = cbox(g, 0.010, 0.008, 0.008, 0.002, M('safetyRed'), W * 0.30, 0.075, fz);
    var ledP = box(g, 0.008, 0.005, 0.004, M('ledGreen'), -W * 0.30, 0.045, fz);
    var ledH = box(g, 0.008, 0.005, 0.004, M('ledRed'), -W * 0.22, 0.045, fz);
    noShadow(ledP); noShadow(ledH);
    /* tiny 2-digit "turbo" MHz display, because 1998 */
    var seg = box(g, 0.026, 0.014, 0.004, M('blackPlastic'), W * 0.22, 0.045, fz);
    noShadow(seg);
    /* rear: PSU fan grille, I/O plate, expansion slots */
    var rz = -D / 2 - 0.002;
    box(g, W * 0.9, 0.085, 0.006, M('beigeDark'), 0, H - 0.055, rz);
    cyl(g, 0.035, 0.035, 0.006, 12, M('blackPlastic'), W * 0.15, H - 0.055, rz - 0.003).rotation.x = Math.PI / 2;
    box(g, 0.09, 0.045, 0.005, M('steel'), -W * 0.18, H - 0.16, rz);
    var slots = inst(BOXG(0.075, 0.012, 0.004), M('steel'), 5);
    for (i = 0; i < 5; i++) setInst(slots, i, -W * 0.12, H - 0.215 - i * 0.021, rz);
    slots.instanceMatrix.needsUpdate = true;
    g.add(slots);
    /* side vent slots */
    var sv = inst(BOXG(0.004, 0.10, 0.006), M('beigeDark'), 6);
    for (i = 0; i < 6; i++) setInst(sv, i, W / 2 + 0.001, H * 0.55, -D * 0.2 + i * 0.03);
    sv.instanceMatrix.needsUpdate = true;
    noShadow(sv);
    g.add(sv);
    g.leds = { power: ledP, hdd: ledH };
    g.buttons = { power: pwr, turbo: turbo, reset: reset };
    g.userData.era = '1998';
    fin(g, W, H, D + 0.02, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Open case', 'e');
    if (o.onSide) { g.rotation.z = Math.PI / 2; g.position.y = W / 2; }
    return g;
  };

  /** pcTowerModern() — black steel, mesh front, one tasteful LED strip. */
  Geo.pcTowerModern = function (opts) {
    var o = opt(opts);
    var W = 0.21, H = 0.47, D = 0.46;
    var g = grp('pcTowerModern');
    var body = M('blackPlastic');
    cbox(g, W, H, D, 0.008, body, 0, H / 2, 0);
    var fz = D / 2 + 0.004;
    box(g, W * 0.9, H * 0.9, 0.008, M('steelDark'), 0, H / 2, fz);
    /* mesh dots */
    var dn = 7, i, j, n = 0;
    var dots = inst(CYLG(0.004, 0.004, 0.004, 5), M('greyPlastic'), dn * 12);
    for (j = 0; j < 12; j++) {
      for (i = 0; i < dn; i++) {
        setInst(dots, n++, -W * 0.33 + i * (W * 0.66 / (dn - 1)), 0.06 + j * (H * 0.82 / 11), fz + 0.003, Math.PI / 2, 0, 0);
      }
    }
    dots.instanceMatrix.needsUpdate = true;
    noShadow(dots);
    g.add(dots);
    var strip = box(g, 0.008, H * 0.7, 0.006, M(o.led || 'neonCyan'), -W / 2 + 0.014, H / 2, fz + 0.002);
    noShadow(strip);
    g.strip = strip;
    if (o.window !== false) {
      var win = box(g, 0.006, H * 0.72, D * 0.7, M('glassTint'), W / 2 + 0.002, H * 0.52, -0.02);
      noShadow(win);
      /* a hint of guts behind the glass */
      box(g, 0.004, H * 0.5, D * 0.5, M('pcb'), W / 2 - 0.05, H * 0.5, -0.03);
      var fan = cyl(g, 0.055, 0.055, 0.02, 10, M('blackPlastic'), W / 2 - 0.10, H * 0.62, D * 0.22);
      fan.rotation.x = Math.PI / 2;
      g.fan = fan;
    }
    box(g, W * 0.6, 0.012, 0.01, M('steel'), 0, H + 0.004, 0.02);
    noShadow(box(g, 0.01, 0.006, 0.004, M('ledBlue'), W * 0.3, H - 0.02, fz + 0.004));
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Open case', 'e');
    return g;
  };

  /** keyboard() — 104-key beige plank with real key rows (instanced). */
  Geo.keyboard = function (opts) {
    var o = opt(opts);
    var W = 0.45, D = 0.16, H = 0.028;
    var g = grp('keyboard');
    var shell = M(o.dark ? 'blackPlastic' : 'beige');
    var kc = M(o.dark ? 'greyPlastic' : 'beigeDark');
    var base = cbox(g, W, H, D, 0.004, shell, 0, H / 2, 0);
    base.rotation.x = -0.05;
    /* key field: 6 rows x 15 cols, minus a gap for the space bar row */
    var rows = 6, cols = 15;
    var keys = inst(BOXG(0.021, 0.008, 0.021), kc, rows * cols);
    var i, j, n = 0;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        var kx = -W / 2 + 0.032 + i * 0.0265;
        var kz = -D / 2 + 0.028 + j * 0.021;
        var ky = H + 0.004 + (D / 2 + kz) * 0.05;
        if (j === rows - 1 && i > 3 && i < 10) { setInst(keys, n++, 0, -9, 0); continue; }
        setInst(keys, n++, kx, ky, kz, -0.05, 0, 0);
      }
    }
    keys.instanceMatrix.needsUpdate = true;
    noShadow(keys);
    g.add(keys);
    var space = box(g, 0.16, 0.008, 0.021, kc, 0, H + 0.014, D / 2 - 0.03);
    space.rotation.x = -0.05;
    noShadow(space);
    /* status LEDs */
    var l = inst(BOXG(0.006, 0.003, 0.004), M('ledGreen'), 3);
    for (i = 0; i < 3; i++) setInst(l, i, W / 2 - 0.05 + i * 0.012, H + 0.006, -D / 2 + 0.012);
    l.instanceMatrix.needsUpdate = true;
    noShadow(l);
    g.add(l);
    /* coiled cable stub */
    var cbl = cyl(g, 0.004, 0.004, 0.06, 6, M('beigeDark'), 0, 0.012, -D / 2 - 0.03);
    cbl.rotation.x = Math.PI / 2;
    fin(g, W, 0.045, D, []);
    interact(g, 'Type', 'e');
    return g;
  };

  /** mouse() — two-button ball mouse (or modern if opts.modern). */
  Geo.mouse = function (opts) {
    var o = opt(opts);
    var g = grp('mouse');
    var shell = M(o.modern ? 'blackPlastic' : 'beige');
    var b = cbox(g, 0.058, 0.03, 0.098, 0.014, shell, 0, 0.018, 0);
    b.scale.set(1, 1, 1);
    box(g, 0.024, 0.006, 0.036, M(o.modern ? 'greyPlastic' : 'beigeDark'), -0.014, 0.034, 0.026);
    box(g, 0.024, 0.006, 0.036, M(o.modern ? 'greyPlastic' : 'beigeDark'), 0.014, 0.034, 0.026);
    if (o.modern) {
      var wh = cyl(g, 0.008, 0.008, 0.005, 8, M('rubber'), 0, 0.037, 0.028);
      wh.rotation.z = Math.PI / 2;
      noShadow(box(g, 0.02, 0.002, 0.03, M('ledRed'), 0, 0.002, 0));
    } else {
      var cbl2 = cyl(g, 0.003, 0.003, 0.05, 6, M('beigeDark'), 0, 0.02, -0.07);
      cbl2.rotation.x = Math.PI / 2;
    }
    var pad = pl(g, 0.22, 0.19, M('rubber'), 0, 0.001, 0.01);
    pad.rotation.x = -Math.PI / 2;
    fin(g, 0.06, 0.04, 0.10, []);
    return g;
  };

  /** laptop() — clamshell; g.open(t) 0=closed 1=open. */
  Geo.laptop = function (opts) {
    var o = opt(opts);
    var W = num(o.w, 0.34), D = num(o.d, 0.24);
    var g = grp('laptop');
    var shell = M(o.silver ? 'aluminium' : 'blackPlastic');
    cbox(g, W, 0.018, D, 0.004, shell, 0, 0.009, 0);
    var kb = box(g, W * 0.82, 0.003, D * 0.5, M('blackPlastic'), 0, 0.019, -D * 0.14);
    noShadow(kb);
    var kr = inst(BOXG(0.012, 0.003, 0.012), M('greyPlastic'), 5 * 12);
    var i, j, n = 0;
    for (j = 0; j < 5; j++) {
      for (i = 0; i < 12; i++) {
        setInst(kr, n++, -W * 0.38 + i * (W * 0.76 / 11), 0.021, -D * 0.34 + j * (D * 0.4 / 4));
      }
    }
    kr.instanceMatrix.needsUpdate = true;
    noShadow(kr);
    g.add(kr);
    box(g, W * 0.3, 0.002, D * 0.22, M('greyPlastic'), 0, 0.02, D * 0.26);
    var lid = new THREE.Group();
    lid.position.set(0, 0.018, -D / 2 + 0.008);
    g.add(lid);
    cbox(lid, W, D * 0.92, 0.012, 0.004, shell, 0, D * 0.46, -0.006);
    var scr = Mat.screen({ w: 320, h: 200, crt: false, glow: o.glow === undefined ? 0x86c8ff : o.glow, bg: 0x0b0f14 });
    var pane = new THREE.Mesh(PLANEG(W * 0.9, D * 0.82), scr.mat || M('screenOff'));
    pane.position.set(0, D * 0.46, 0.001);
    noShadow(pane);
    lid.add(pane);
    g.screen = scr; g.pane = pane; g.lid = lid;
    g.open = function (t) {
      var k = STV.clamp(num(t, 1), 0, 1);
      lid.rotation.x = (1 - k) * (-Math.PI / 2 + 0.06) - 0.12 * k;
      g.userData.openAmount = k;
      return g;
    };
    g.open(num(o.open, 1));
    fin(g, W, 0.24, D, []);
    interact(g, 'Use laptop', 'e');
    return g;
  };

  /* =========================================================================
   * 3d. SHOP — bench instruments and small props
   * =====================================================================*/

  /** solderingStation() — control box, iron in its stand, sponge, solder spool. */
  Geo.solderingStation = function () {
    var W = 0.17, H = 0.12, D = 0.20;
    var g = grp('solderingStation');
    var body = M('beige');
    cbox(g, W, H, D, 0.008, body, 0, H / 2, 0);
    box(g, W - 0.02, 0.05, 0.006, M('beigeDark'), 0, H - 0.035, D / 2 + 0.002);
    /* temperature readout */
    var scr = Mat.screen({ w: 64, h: 32, crt: false, glow: 0xff5522, bg: 0x120603 });
    if (scr.ctx) {
      scr.ctx.fillStyle = '#140704'; scr.ctx.fillRect(0, 0, 64, 32);
      scr.ctx.fillStyle = '#ff6a1e';
      scr.ctx.font = 'bold 20px monospace';
      scr.ctx.fillText('340', 8, 24);
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(0.05, 0.024), scr.mat || M('screenOff'));
    pane.position.set(-0.03, H - 0.035, D / 2 + 0.006);
    noShadow(pane);
    g.add(pane);
    g.screen = scr;
    /* temp knob + power rocker */
    var knob = cyl(g, 0.016, 0.016, 0.012, 10, M('blackPlastic'), 0.045, H - 0.035, D / 2 + 0.008);
    knob.rotation.x = Math.PI / 2;
    noShadow(box(g, 0.004, 0.010, 0.004, M('clothWhite'), 0.045, H - 0.023, D / 2 + 0.012));
    g.knob = knob;
    var rocker = box(g, 0.018, 0.012, 0.008, M('safetyRed'), -0.055, 0.028, D / 2 + 0.003);
    g.power = rocker;
    noShadow(box(g, 0.006, 0.004, 0.004, M('ledRed'), 0.03, 0.028, D / 2 + 0.004));
    /* iron stand: coiled steel cradle + brass sponge dish */
    var stand = new THREE.Group();
    stand.position.set(W / 2 + 0.09, 0, 0.0);
    g.add(stand);
    cbox(stand, 0.10, 0.012, 0.15, 0.004, M('steelDark'), 0, 0.006, 0);
    var cradle = mk(TORG(0.028, 0.005, 10), M('steel'), 0, 0.055, -0.02);
    cradle.rotation.x = Math.PI / 2;
    cradle.rotation.z = 0.5;
    stand.add(cradle);
    box(stand, 0.02, 0.05, 0.02, M('steelDark'), 0, 0.03, -0.02);
    cyl(stand, 0.032, 0.032, 0.012, 12, M('copper'), 0, 0.012, 0.045);
    var sponge = cyl(stand, 0.028, 0.028, 0.010, 10, Mat.color(0xd8e04a, { rough: 0.98 }), 0, 0.021, 0.045);
    g.sponge = sponge;
    /* the iron itself, resting in the cradle */
    var iron = new THREE.Group();
    iron.position.set(W / 2 + 0.09, 0.075, -0.02);
    iron.rotation.z = -0.55;
    g.add(iron);
    cyl(iron, 0.011, 0.013, 0.10, 10, M('blackPlastic'), 0, 0, 0).rotation.z = Math.PI / 2;
    cyl(iron, 0.009, 0.006, 0.05, 8, M('steel'), 0.072, 0, 0).rotation.z = Math.PI / 2;
    cyl(iron, 0.003, 0.0008, 0.022, 6, M('chrome'), 0.108, 0, 0).rotation.z = Math.PI / 2;
    cyl(iron, 0.013, 0.011, 0.02, 8, M('safetyRed'), -0.055, 0, 0).rotation.z = Math.PI / 2;
    g.iron = iron;
    g.tip = new THREE.Object3D();
    g.tip.position.set(0.118, 0, 0);
    iron.add(g.tip);
    /* solder spool on a wire spindle */
    var spool = new THREE.Group();
    spool.position.set(-W / 2 - 0.06, 0.055, 0);
    g.add(spool);
    cyl(spool, 0.045, 0.045, 0.004, 14, M('blackPlastic'), 0, 0, 0.014).rotation.x = Math.PI / 2;
    cyl(spool, 0.045, 0.045, 0.004, 14, M('blackPlastic'), 0, 0, -0.014).rotation.x = Math.PI / 2;
    cyl(spool, 0.038, 0.038, 0.024, 14, M('chrome'), 0, 0, 0).rotation.x = Math.PI / 2;
    cyl(spool, 0.004, 0.004, 0.055, 6, M('steel'), 0, -0.055, 0);
    fin(g, 0.46, 0.16, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Solder', 'e');
    return g;
  };

  /** oscilloscope() — bench scope with a live phosphor screen. */
  Geo.oscilloscope = function () {
    var W = 0.34, H = 0.22, D = 0.32;
    var g = grp('oscilloscope');
    var body = M('beigeDark');
    cbox(g, W, H, D, 0.01, body, 0, H / 2, 0);
    box(g, W - 0.01, H - 0.01, 0.008, M('beige'), 0, H / 2, D / 2 + 0.002);
    /* screen with a graticule + trace */
    var scr = Mat.screen({ w: 192, h: 144, crt: true, glow: 0x55ff99, bg: 0x03110a });
    if (scr.ctx) {
      var c = scr.ctx, i;
      c.fillStyle = '#03110a'; c.fillRect(0, 0, 192, 144);
      c.strokeStyle = 'rgba(120,255,180,0.18)'; c.lineWidth = 1;
      for (i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 24, 0); c.lineTo(i * 24, 144); c.stroke(); }
      for (i = 0; i <= 6; i++) { c.beginPath(); c.moveTo(0, i * 24); c.lineTo(192, i * 24); c.stroke(); }
      c.strokeStyle = '#7dffb4'; c.lineWidth = 2;
      c.beginPath();
      for (i = 0; i <= 192; i += 2) c.lineTo(i, 72 - Math.sin(i * 0.08) * 40);
      c.stroke();
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(W * 0.42, H * 0.56), scr.mat || M('screenOff'));
    pane.position.set(-W * 0.24, H * 0.56, D / 2 + 0.006);
    noShadow(pane);
    g.add(pane);
    box(g, W * 0.46, H * 0.6, 0.006, M('blackPlastic'), -W * 0.24, H * 0.56, D / 2 + 0.004);
    g.screen = scr; g.pane = pane;
    /* knob cluster */
    var kn = 6, i2;
    var knobs = inst(CYLG(0.014, 0.016, 0.014, 10), M('blackPlastic'), kn);
    for (i2 = 0; i2 < kn; i2++) {
      setInst(knobs, i2, W * 0.10 + (i2 % 3) * 0.05, H * 0.72 - Math.floor(i2 / 3) * 0.055, D / 2 + 0.010, Math.PI / 2, 0, 0);
    }
    knobs.instanceMatrix.needsUpdate = true;
    g.add(knobs);
    var btn = inst(BOXG(0.016, 0.008, 0.006), M('greyPlastic'), 5);
    for (i2 = 0; i2 < 5; i2++) setInst(btn, i2, -W * 0.4 + i2 * 0.026, 0.03, D / 2 + 0.006);
    btn.instanceMatrix.needsUpdate = true;
    g.add(btn);
    /* BNC inputs */
    var bnc = inst(CYLG(0.008, 0.008, 0.012, 8), M('chrome'), 2);
    setInst(bnc, 0, W * 0.14, 0.05, D / 2 + 0.008, Math.PI / 2, 0, 0);
    setInst(bnc, 1, W * 0.26, 0.05, D / 2 + 0.008, Math.PI / 2, 0, 0);
    bnc.instanceMatrix.needsUpdate = true;
    g.add(bnc);
    /* carry handle */
    var hb = mk(TORG(0.07, 0.008, 10), M('greyPlastic'), 0, H, -D * 0.1);
    hb.rotation.y = Math.PI / 2;
    g.add(hb);
    fin(g, W, H + 0.06, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Examine scope', 'e');
    return g;
  };

  /** multimeter() — handheld DMM with probes. */
  Geo.multimeter = function () {
    var W = 0.09, H = 0.03, D = 0.17;
    var g = grp('multimeter');
    cbox(g, W, H, D, 0.008, Mat.color(0xd8a12a, { rough: 0.7 }), 0, H / 2, 0);
    box(g, W * 0.7, 0.004, D * 0.28, M('blackPlastic'), 0, H + 0.001, -D * 0.28);
    var scr = Mat.screen({ w: 96, h: 48, crt: false, glow: 0x223322, bg: 0x9fb8a0 });
    if (scr.ctx) {
      scr.ctx.fillStyle = '#9fb8a0'; scr.ctx.fillRect(0, 0, 96, 48);
      scr.ctx.fillStyle = '#1b2a1c';
      scr.ctx.font = 'bold 30px monospace';
      scr.ctx.fillText('3.28', 6, 36);
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(W * 0.6, D * 0.2), scr.mat || M('screenOff'));
    pane.rotation.x = -Math.PI / 2;
    pane.position.set(0, H + 0.004, -D * 0.28);
    noShadow(pane);
    g.add(pane);
    g.screen = scr;
    var dial = cyl(g, 0.022, 0.022, 0.008, 12, M('blackPlastic'), 0, H + 0.004, D * 0.06);
    noShadow(box(g, 0.004, 0.004, 0.016, M('clothWhite'), 0, H + 0.009, D * 0.04));
    g.dial = dial;
    var jacks = inst(CYLG(0.005, 0.005, 0.006, 8), M('safetyRed'), 3);
    var i;
    for (i = 0; i < 3; i++) setInst(jacks, i, -0.026 + i * 0.026, H + 0.001, D * 0.38);
    jacks.instanceMatrix.needsUpdate = true;
    g.add(jacks);
    /* probes coiled beside it */
    var pr = new THREE.Group();
    pr.position.set(W * 0.9, 0.008, 0);
    g.add(pr);
    cyl(pr, 0.007, 0.007, 0.09, 8, M('safetyRed'), 0, 0, -0.03).rotation.x = Math.PI / 2;
    cyl(pr, 0.007, 0.007, 0.09, 8, M('blackPlastic'), 0.02, 0, 0.03).rotation.x = Math.PI / 2;
    fin(g, W, H + 0.02, D, []);
    interact(g, 'Take multimeter', 'e');
    return g;
  };

  /** cardboardBox(s) — s = edge length in metres. Flaps optional. */
  Geo.cardboardBox = function (s, opts) {
    var o = opt(opts);
    var S = num(s, 0.4);
    var g = grp('cardboardBox');
    var m = M('cardboard');
    cbox(g, S, S * 0.82, S * 0.9, 0.008, m, 0, S * 0.41, 0);
    if (o.open) {
      var fl = 0.9;
      var f1 = box(g, S, 0.008, S * 0.42, m, 0, S * 0.82, -S * 0.45 - S * 0.2);
      f1.rotation.x = -fl;
      var f2 = box(g, S, 0.008, S * 0.42, m, 0, S * 0.82, S * 0.45 + S * 0.2);
      f2.rotation.x = fl;
    } else {
      box(g, S * 0.999, 0.006, S * 0.899, m, 0, S * 0.822, 0);
      /* packing tape */
      noShadow(box(g, S * 0.14, 0.002, S * 0.9, M('clothWhite'), 0, S * 0.826, 0));
    }
    /* printed marks */
    if (o.label !== false) {
      noShadow(box(g, S * 0.44, S * 0.16, 0.002, Mat.color(0x7a5f3f, { rough: 1 }), 0, S * 0.5, S * 0.452));
    }
    fin(g, S, S * 0.83, S * 0.9, [col(0, S * 0.41, 0, S / 2, S * 0.41, S * 0.45)]);
    return g;
  };

  /** partsBin() — stack of 3 louvred parts bins on a rail. */
  Geo.partsBin = function (opts) {
    var o = opt(opts);
    var g = grp('partsBin');
    var W = 0.16, H = 0.12, D = 0.24;
    var colr = o.color === undefined ? 0xd05a24 : o.color;
    var m = Mat.color(colr, { rough: 0.8 });
    var body = cbox(g, W, H, D, 0.008, m, 0, H / 2, 0);
    /* open mouth: darker inset at the front-top */
    noShadow(box(g, W - 0.02, H * 0.5, D * 0.5, M('blackPlastic'), 0, H * 0.78, D * 0.22));
    box(g, W, 0.012, 0.012, m, 0, H * 0.98, D / 2);
    /* label window */
    noShadow(box(g, W * 0.6, 0.03, 0.003, M('paper'), 0, H * 0.28, D / 2 + 0.002));
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Search bin', 'e');
    return g;
  };

  /** coffeeMug() — with a coffee surface and a handle. */
  Geo.coffeeMug = function (opts) {
    var o = opt(opts);
    var g = grp('coffeeMug');
    var m = Mat.color(o.color === undefined ? 0x2f3a44 : o.color, { rough: 0.45 });
    cyl(g, 0.041, 0.036, 0.095, 14, m, 0, 0.0475, 0);
    var h = mk(TORG(0.026, 0.006, 8), m, 0.048, 0.055, 0);
    h.rotation.y = Math.PI / 2;
    g.add(h);
    if (o.empty !== true) {
      var cf = cyl(g, 0.036, 0.036, 0.002, 14, Mat.color(0x27180d, { rough: 0.25 }), 0, 0.082, 0);
      noShadow(cf);
    }
    fin(g, 0.095, 0.095, 0.082, []);
    interact(g, 'Coffee', 'e');
    return g;
  };

  /** rubberDuck() — the debugger. */
  Geo.rubberDuck = function () {
    var g = grp('rubberDuck');
    var y = Mat.color(0xf2c400, { rough: 0.55 });
    var b = sph(g, 0.042, 12, y, 0, 0.042, 0);
    b.scale.set(1.0, 0.86, 1.25);
    var hd = sph(g, 0.026, 12, y, 0, 0.086, 0.03);
    var nk = cyl(g, 0.016, 0.02, 0.03, 8, y, 0, 0.07, 0.026);
    var bk = mk(CONEG(0.013, 0.03, 8), Mat.color(0xe8801e, { rough: 0.6 }), 0, 0.084, 0.056);
    bk.rotation.x = Math.PI / 2;
    g.add(bk);
    var e1 = sph(g, 0.005, 6, M('blackPlastic'), -0.014, 0.094, 0.046);
    var e2 = sph(g, 0.005, 6, M('blackPlastic'), 0.014, 0.094, 0.046);
    var t = mk(CONEG(0.014, 0.03, 6), y, 0, 0.055, -0.05);
    t.rotation.x = -Math.PI / 2.4;
    g.add(t);
    g.head = hd;
    fin(g, 0.09, 0.10, 0.13, []);
    interact(g, 'Talk to the duck', 'e');
    g.userData.egg = 'duck';
    return g;
  };

  /** deskLamp() — articulated arm, warm spot. g.aim(x,y,z), g.setOn(bool). */
  Geo.deskLamp = function (opts) {
    var o = opt(opts);
    var g = grp('deskLamp');
    var m = Mat.color(o.color === undefined ? 0x2b3d33 : o.color, { rough: 0.5, metal: 0.3 });
    cyl(g, 0.075, 0.08, 0.018, 14, m, 0, 0.009, 0);
    var a1 = new THREE.Group();
    a1.position.set(0, 0.02, 0);
    a1.rotation.x = -0.5;
    g.add(a1);
    cyl(a1, 0.008, 0.008, 0.26, 8, m, 0, 0.13, 0);
    var a2 = new THREE.Group();
    a2.position.set(0, 0.26, 0);
    a2.rotation.x = 1.15;
    a1.add(a2);
    cyl(a2, 0.008, 0.008, 0.24, 8, m, 0, 0.12, 0);
    var head = new THREE.Group();
    head.position.set(0, 0.24, 0);
    head.rotation.x = 0.9;
    a2.add(head);
    var shade = mk(CYLG(0.055, 0.03, 0.08, 12, true), m, 0, 0.04, 0);
    shade.material = m;
    head.add(shade);
    var bulb = cyl(head, 0.03, 0.03, 0.006, 10, M('emissiveWhite'), 0, 0.006, 0);
    noShadow(bulb);
    var light = null;
    try {
      light = new THREE.PointLight(0xffd9a0, 2.0, 3.2, 2);
      light.position.set(0, 0.0, 0);
      head.add(light);
    } catch (e) { light = null; }
    g.light = light; g.bulb = bulb; g.head = head;
    g.setOn = function (on) {
      if (light) light.intensity = on === false ? 0 : 2.0;
      bulb.material = on === false ? M('greyPlastic') : M('emissiveWhite');
      return g;
    };
    fin(g, 0.16, 0.55, 0.3, []);
    interact(g, 'Lamp', 'e');
    return g;
  };

  /** wallClock() — analogue, ticking. g.setTime(h,m), g.update(dt). */
  Geo.wallClock = function (opts) {
    var o = opt(opts);
    var R = num(o.r, 0.14);
    var g = grp('wallClock');
    g.userData.mount = 'wall';
    cyl(g, R, R, 0.04, 20, M('blackPlastic'), 0, 0, 0.02).rotation.x = Math.PI / 2;
    var face = cyl(g, R - 0.008, R - 0.008, 0.004, 20, M('clothWhite'), 0, 0, 0.041);
    face.rotation.x = Math.PI / 2;
    noShadow(face);
    var ticks = inst(BOXG(0.004, 0.018, 0.002), M('blackPlastic'), 12);
    var i;
    for (i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      setInst(ticks, i, Math.sin(a) * (R - 0.022), Math.cos(a) * (R - 0.022), 0.044, 0, 0, -a);
    }
    ticks.instanceMatrix.needsUpdate = true;
    noShadow(ticks);
    g.add(ticks);
    var hourG = new THREE.Group(), minG = new THREE.Group(), secG = new THREE.Group();
    hourG.position.z = 0.045; minG.position.z = 0.047; secG.position.z = 0.049;
    g.add(hourG); g.add(minG); g.add(secG);
    noShadow(box(hourG, 0.008, R * 0.5, 0.003, M('blackPlastic'), 0, R * 0.25, 0));
    noShadow(box(minG, 0.006, R * 0.72, 0.003, M('blackPlastic'), 0, R * 0.36, 0));
    noShadow(box(secG, 0.003, R * 0.78, 0.002, M('safetyRed'), 0, R * 0.34, 0));
    cyl(g, 0.008, 0.008, 0.006, 8, M('blackPlastic'), 0, 0, 0.05).rotation.x = Math.PI / 2;
    var glass = cyl(g, R - 0.006, R - 0.006, 0.002, 20, M('glass'), 0, 0, 0.052);
    glass.rotation.x = Math.PI / 2;
    noShadow(glass);
    g.hands = { hour: hourG, minute: minG, second: secG };
    var tSec = 0;
    g.setTime = function (h, mm, ss) {
      var H = num(h, 10), MM = num(mm, 10), SS = num(ss, 0);
      hourG.rotation.z = -((H % 12) + MM / 60) * (Math.PI / 6);
      minG.rotation.z = -(MM + SS / 60) * (Math.PI / 30);
      secG.rotation.z = -SS * (Math.PI / 30);
      tSec = SS;
      return g;
    };
    g.setTime(num(o.h, 16), num(o.m, 25), 0);
    g.update = function (dt) {
      tSec += num(dt, 0);
      secG.rotation.z = -Math.floor(tSec % 60) * (Math.PI / 30);
      return g;
    };
    fin(g, R * 2, R * 2, 0.05, []);
    interact(g, 'Clock', 'e');
    g.userData.egg = 'clock';
    return g;
  };

  /** fishTank(w) — glass tank, gravel, water plane, one fish named TCP. */
  Geo.fishTank = function (w) {
    var W = num(w, 0.8), H = 0.42, D = 0.32;
    var g = grp('fishTank');
    /* stand */
    box(g, W + 0.04, 0.6, D + 0.04, M('woodDark'), 0, 0.3, 0);
    var y0 = 0.6;
    var frame = M('blackPlastic');
    box(g, W, 0.035, D, frame, 0, y0 + 0.017, 0);
    box(g, W, 0.03, D, frame, 0, y0 + H - 0.015, 0);
    var glassM = M('glass');
    var gl;
    gl = box(g, W - 0.02, H - 0.06, 0.006, glassM, 0, y0 + H / 2, D / 2 - 0.004); noShadow(gl);
    gl = box(g, W - 0.02, H - 0.06, 0.006, glassM, 0, y0 + H / 2, -D / 2 + 0.004); noShadow(gl);
    gl = box(g, 0.006, H - 0.06, D - 0.02, glassM, -W / 2 + 0.004, y0 + H / 2, 0); noShadow(gl);
    gl = box(g, 0.006, H - 0.06, D - 0.02, glassM, W / 2 - 0.004, y0 + H / 2, 0); noShadow(gl);
    /* gravel + water */
    box(g, W - 0.03, 0.05, D - 0.03, Mat.color(0x4c443a, { rough: 1 }), 0, y0 + 0.06, 0);
    var water = box(g, W - 0.03, H * 0.62, D - 0.03, M('water'), 0, y0 + 0.06 + H * 0.31, 0);
    noShadow(water);
    /* plants */
    var rng = STV.rng(9021);
    var i;
    for (i = 0; i < 5; i++) {
      var px = (rng() - 0.5) * (W - 0.14), pz = (rng() - 0.5) * (D - 0.12);
      var ph = 0.10 + rng() * 0.14;
      var pv = cyl(g, 0.006, 0.010, ph, 5, M('foliage'), px, y0 + 0.08 + ph / 2, pz);
      pv.rotation.z = (rng() - 0.5) * 0.4;
      noShadow(pv);
    }
    /* TCP */
    var fish = new THREE.Group();
    fish.position.set(0, y0 + 0.24, 0);
    g.add(fish);
    var fb = sph(fish, 0.028, 10, Mat.color(0xe07a2a, { rough: 0.4 }), 0, 0, 0);
    fb.scale.set(1.6, 0.9, 0.7);
    var ft = mk(CONEG(0.022, 0.04, 6), Mat.color(0xe07a2a, { rough: 0.4 }), -0.05, 0, 0);
    ft.rotation.z = Math.PI / 2;
    fish.add(ft);
    noShadow(sph(fish, 0.005, 6, M('blackPlastic'), 0.03, 0.008, 0.012));
    g.fish = fish;
    /* name plate */
    var plate = box(g, 0.12, 0.03, 0.004, M('paper'), 0, y0 - 0.05, D / 2 + 0.024);
    noShadow(plate);
    var lt = Tex.label('tcp', 'TCP', 0xe8e6df, 0x1a1c20, 128, 32);
    if (lt) {
      plate.material = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 });
      plate.material.userData.shared = false;
    }
    var tAcc = 0;
    g.update = function (dt) {
      tAcc += num(dt, 0);
      var r = W * 0.28;
      fish.position.x = Math.sin(tAcc * 0.5) * r;
      fish.position.z = Math.cos(tAcc * 0.31) * (D * 0.2);
      fish.position.y = y0 + 0.24 + Math.sin(tAcc * 0.9) * 0.03;
      fish.rotation.y = Math.atan2(
        Math.cos(tAcc * 0.5) * 0.5 * r, -Math.sin(tAcc * 0.31) * 0.31 * (D * 0.2)
      ) - Math.PI / 2;
      return g;
    };
    fin(g, W + 0.04, y0 + H, D + 0.04, [col(0, (y0 + H) / 2, 0, (W + 0.04) / 2, (y0 + H) / 2, (D + 0.04) / 2)]);
    interact(g, 'Look at TCP', 'e');
    g.userData.egg = 'tcp';
    return g;
  };

  /** vendingMachine() — lit front, 4x5 product grid, keypad. g.thunk(). */
  Geo.vendingMachine = function () {
    var W = 0.9, H = 1.85, D = 0.78;
    var g = grp('vendingMachine');
    var body = Mat.color(0x1b2a3a, { rough: 0.5, metal: 0.2 });
    cbox(g, W, H, D, 0.02, body, 0, H / 2, 0);
    var fz = D / 2 + 0.005;
    /* glass window with a backlit interior */
    var glass = box(g, W * 0.66, H * 0.62, 0.008, M('glassTint'), -W * 0.14, H * 0.6, fz);
    noShadow(glass);
    var inner = box(g, W * 0.64, H * 0.6, 0.02, Mat.color(0x0d1620, { rough: 0.9 }), -W * 0.14, H * 0.6, fz - 0.06);
    /* product rows, instanced cans */
    var cols = 5, rows = 4, i, j, n = 0;
    var cans = inst(CYLG(0.032, 0.032, 0.11, 8), Mat.color(0xc02a2a, { rough: 0.4, metal: 0.3 }), cols * rows);
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        setInst(cans, n++, -W * 0.14 + (i - (cols - 1) / 2) * 0.10,
          H * 0.36 + j * 0.155, fz - 0.10);
      }
    }
    cans.instanceMatrix.needsUpdate = true;
    g.add(cans);
    var shelves = inst(BOXG(W * 0.6, 0.008, 0.16), M('steel'), rows);
    for (j = 0; j < rows; j++) setInst(shelves, j, -W * 0.14, H * 0.36 - 0.058 + j * 0.155, fz - 0.10);
    shelves.instanceMatrix.needsUpdate = true;
    g.add(shelves);
    /* keypad column */
    box(g, W * 0.24, H * 0.62, 0.01, Mat.color(0x101820, { rough: 0.7 }), W * 0.32, H * 0.6, fz + 0.002);
    var keys = inst(BOXG(0.026, 0.026, 0.008), M('greyPlastic'), 12);
    n = 0;
    for (j = 0; j < 4; j++) {
      for (i = 0; i < 3; i++) {
        setInst(keys, n++, W * 0.32 + (i - 1) * 0.036, H * 0.72 - j * 0.036, fz + 0.008);
      }
    }
    keys.instanceMatrix.needsUpdate = true;
    g.add(keys);
    /* coin slot, coin return, price display */
    noShadow(box(g, 0.03, 0.008, 0.006, M('chrome'), W * 0.32, H * 0.86, fz + 0.006));
    box(g, 0.09, 0.05, 0.02, M('steelDark'), W * 0.32, H * 0.44, fz + 0.004);
    var scr = Mat.screen({ w: 96, h: 32, crt: false, glow: 0xff8a2b, bg: 0x140a02 });
    if (scr.ctx) {
      scr.ctx.fillStyle = '#140a02'; scr.ctx.fillRect(0, 0, 96, 32);
      scr.ctx.fillStyle = '#ffa63c'; scr.ctx.font = 'bold 20px monospace';
      scr.ctx.fillText('0.90', 12, 24);
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(0.13, 0.045), scr.mat || M('screenOff'));
    pane.position.set(W * 0.32, H * 0.9, fz + 0.007);
    noShadow(pane);
    g.add(pane);
    g.screen = scr;
    /* delivery flap */
    var flap = box(g, W * 0.5, 0.22, 0.02, Mat.color(0x0d1620, { rough: 0.8 }), -W * 0.1, 0.28, fz);
    g.flap = flap;
    /* branding band */
    noShadow(box(g, W * 0.94, 0.12, 0.006, M('safetyRed'), 0, H - 0.12, fz + 0.002));
    var light = null;
    try {
      light = new THREE.PointLight(0x9fd8ff, 1.2, 2.4, 2);
      light.position.set(-W * 0.14, H * 0.6, fz - 0.2);
      g.add(light);
    } catch (e) { light = null; }
    g.light = light;
    var hits = 0, shake = 0;
    g.thunk = function () { hits++; shake = 1; return hits; };
    g.update = function (dt) {
      if (shake > 0) {
        shake = Math.max(0, shake - num(dt, 0) * 4);
        g.position.x = Math.sin(shake * 40) * 0.006 * shake;
        flap.rotation.x = -shake * 0.4;
      }
      return g;
    };
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Use vending machine', 'e');
    g.userData.egg = 'vending';
    return g;
  };

  /** boombox() — twin deck, big speakers, handle, VU needle. */
  Geo.boombox = function () {
    var W = 0.52, H = 0.26, D = 0.16;
    var g = grp('boombox');
    var body = M('greyPlastic');
    cbox(g, W, H, D, 0.012, body, 0, H / 2, 0);
    var fz = D / 2 + 0.002;
    var i;
    for (i = 0; i < 2; i++) {
      var sx = (i ? 1 : -1) * W * 0.31;
      cyl(g, 0.072, 0.072, 0.01, 16, M('blackPlastic'), sx, H / 2, fz).rotation.x = Math.PI / 2;
      cyl(g, 0.055, 0.055, 0.006, 16, Mat.color(0x2a2a2a, { rough: 0.95 }), sx, H / 2, fz + 0.004).rotation.x = Math.PI / 2;
      cyl(g, 0.02, 0.02, 0.008, 10, M('steelDark'), sx, H / 2, fz + 0.008).rotation.x = Math.PI / 2;
    }
    /* centre stack: cassette door, tuner, buttons */
    box(g, W * 0.3, H * 0.32, 0.008, M('blackPlastic'), 0, H * 0.66, fz + 0.002);
    noShadow(box(g, W * 0.26, H * 0.24, 0.004, M('glassTint'), 0, H * 0.66, fz + 0.006));
    var scr = Mat.screen({ w: 128, h: 32, crt: false, glow: 0x54e0a0, bg: 0x06120c });
    if (scr.ctx) {
      scr.ctx.fillStyle = '#06120c'; scr.ctx.fillRect(0, 0, 128, 32);
      scr.ctx.fillStyle = '#6ff2b4'; scr.ctx.font = 'bold 18px monospace';
      scr.ctx.fillText('98.4 FM', 10, 23);
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(W * 0.26, H * 0.13), scr.mat || M('screenOff'));
    pane.position.set(0, H * 0.34, fz + 0.004);
    noShadow(pane);
    g.add(pane);
    g.screen = scr;
    var btn = inst(BOXG(0.026, 0.012, 0.008), M('blackPlastic'), 5);
    for (i = 0; i < 5; i++) setInst(btn, i, -W * 0.14 + i * 0.07, 0.045, fz + 0.004);
    btn.instanceMatrix.needsUpdate = true;
    g.add(btn);
    var handle = mk(TORG(0.12, 0.008, 10), M('blackPlastic'), 0, H, 0);
    handle.rotation.y = Math.PI / 2;
    handle.scale.set(1, 0.5, 1);
    g.add(handle);
    var ant = cyl(g, 0.003, 0.005, 0.34, 6, M('chrome'), W * 0.42, H + 0.16, -D * 0.2);
    ant.rotation.z = 0.3;
    g.station = 0;
    g.next = function () { g.station = (g.station + 1) % 4; return g.station; };
    fin(g, W, H + 0.05, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Change station', 'e');
    g.userData.egg = 'boombox';
    return g;
  };

  /** poster(kind,w,h) — wall art from Tex.posterArt. */
  Geo.poster = function (kind, w, h) {
    var W = num(w, 0.6), H = num(h, 0.9);
    var g = grp('poster');
    g.userData.mount = 'wall';
    var tex = null;
    try { tex = Tex.posterArt(kind); } catch (e) { tex = null; }
    var mat;
    if (tex) {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.0 });
      mat.name = 'poster:' + kind;
    } else {
      mat = M('paper');
    }
    var m = new THREE.Mesh(PLANEG(W, H), mat);
    m.position.z = 0.004;
    noShadow(m);
    g.add(m);
    noShadow(box(g, W + 0.01, H + 0.01, 0.004, M('paper'), 0, 0, 0.001));
    g.face = m;
    fin(g, W, H, 0.006, []);
    interact(g, 'Read poster', 'e');
    g.userData.posterKind = kind;
    return g;
  };

  /** stickyNote() — small square, optional text, slight curl. */
  Geo.stickyNote = function (opts) {
    var o = opt(opts);
    var S = num(o.size, 0.075);
    var g = grp('stickyNote');
    var tex = null;
    if (o.text) { try { tex = Tex.paperNote(Array.isArray(o.text) ? o.text : [o.text]); } catch (e) { tex = null; } }
    var mat;
    if (tex) {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xffe89a });
      mat.name = 'sticky';
    } else {
      mat = Mat.color(o.color === undefined ? 0xf5e07a : o.color, { rough: 0.95 });
    }
    var m = new THREE.Mesh(PLANEG(S, S), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.001;
    noShadow(m);
    g.add(m);
    /* curled corner */
    var c = new THREE.Mesh(PLANEG(S * 0.3, S * 0.3), mat);
    c.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
    c.position.set(S * 0.3, 0.004, -S * 0.34);
    noShadow(c);
    g.add(c);
    fin(g, S, 0.004, S, []);
    interact(g, 'Read note', 'e');
    return g;
  };

  /** floppyDisk() — 3.5", shutter, label. */
  Geo.floppyDisk = function (opts) {
    var o = opt(opts);
    var g = grp('floppyDisk');
    var m = Mat.color(o.color === undefined ? 0x24282e : o.color, { rough: 0.75 });
    cbox(g, 0.09, 0.0032, 0.094, 0.001, m, 0, 0.0016, 0);
    noShadow(box(g, 0.038, 0.0022, 0.03, M('chrome'), 0, 0.0032, 0.032));
    noShadow(box(g, 0.014, 0.0022, 0.026, M('blackPlastic'), 0.019, 0.0034, 0.032));
    var labMat = M('paper');
    if (o.label) {
      var lt = Tex.label('flp:' + String(o.label).slice(0, 18), String(o.label), 0xdfe3e6, 0x14171a, 256, 96);
      if (lt) {
        labMat = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.95 });
        labMat.name = 'floppyLabel';
      }
    }
    var lab = new THREE.Mesh(PLANEG(0.07, 0.046), labMat);
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(0, 0.0034, -0.018);
    noShadow(lab);
    g.add(lab);
    noShadow(box(g, 0.006, 0.002, 0.006, M('blackPlastic'), -0.04, 0.0032, -0.041));
    fin(g, 0.09, 0.005, 0.094, []);
    interact(g, 'Take disk', 'e');
    return g;
  };

  /** crowbar() — DO NOT USE (RESERVED). */
  Geo.crowbar = function () {
    var g = grp('crowbar');
    var m = Mat.color(0xb03a2a, { rough: 0.55, metal: 0.5 });
    var shaft = cyl(g, 0.011, 0.013, 0.86, 8, m, 0, 0.02, 0);
    shaft.rotation.z = Math.PI / 2;
    var bend = new THREE.Group();
    bend.position.set(-0.43, 0.02, 0);
    bend.rotation.z = -0.9;
    g.add(bend);
    cyl(bend, 0.011, 0.011, 0.10, 8, m, -0.045, 0.02, 0).rotation.z = Math.PI / 2;
    var claw = box(bend, 0.05, 0.026, 0.012, m, -0.10, 0.035, 0);
    claw.rotation.z = 0.5;
    noShadow(box(bend, 0.012, 0.008, 0.012, m, -0.12, 0.05, 0));
    /* chisel end */
    var tip = box(g, 0.05, 0.02, 0.012, m, 0.44, 0.02, 0);
    tip.rotation.z = 0.25;
    g.userData.egg = 'crowbar';
    fin(g, 0.95, 0.10, 0.05, []);
    interact(g, 'DO NOT USE (RESERVED)', 'e');
    return g;
  };

  /** cashRegister() — beige till with a drawer that opens. */
  Geo.cashRegister = function () {
    var W = 0.36, H = 0.24, D = 0.38;
    var g = grp('cashRegister');
    var m = M('beige');
    cbox(g, W, H * 0.55, D, 0.01, m, 0, H * 0.275, 0);
    var top = new THREE.Group();
    top.position.set(0, H * 0.55, -D * 0.06);
    g.add(top);
    cbox(top, W * 0.9, H * 0.42, D * 0.6, 0.01, m, 0, H * 0.21, 0);
    /* key grid */
    var keys = inst(BOXG(0.022, 0.008, 0.022), M('beigeDark'), 16);
    var i, j, n = 0;
    for (j = 0; j < 4; j++) {
      for (i = 0; i < 4; i++) {
        setInst(keys, n++, -0.05 + i * 0.033, H * 0.42, -0.05 + j * 0.033);
      }
    }
    keys.instanceMatrix.needsUpdate = true;
    top.add(keys);
    /* customer display on a post */
    var post = cyl(top, 0.014, 0.014, 0.14, 8, M('beigeDark'), 0, H * 0.42 + 0.07, -D * 0.2);
    var disp = box(top, 0.16, 0.07, 0.04, M('beigeDark'), 0, H * 0.42 + 0.16, -D * 0.2);
    var scr = Mat.screen({ w: 96, h: 32, crt: false, glow: 0x66ff99, bg: 0x02120a });
    if (scr.ctx) {
      scr.ctx.fillStyle = '#02120a'; scr.ctx.fillRect(0, 0, 96, 32);
      scr.ctx.fillStyle = '#7dffb4'; scr.ctx.font = 'bold 18px monospace';
      scr.ctx.fillText('  0.00', 4, 23);
      scr.flush();
    }
    var pane = new THREE.Mesh(PLANEG(0.13, 0.045), scr.mat || M('screenOff'));
    pane.position.set(0, H * 0.42 + 0.16, -D * 0.2 - 0.021);
    pane.rotation.y = Math.PI;
    noShadow(pane);
    top.add(pane);
    g.screen = scr;
    var drawer = new THREE.Group();
    g.add(drawer);
    box(drawer, W - 0.02, H * 0.24, 0.02, M('beigeDark'), 0, H * 0.16, D / 2 + 0.002);
    box(drawer, W - 0.04, H * 0.2, D - 0.06, M('beigeDark'), 0, H * 0.16, 0);
    g.drawer = drawer;
    g.open = function (t) {
      drawer.position.z = STV.clamp(num(t, 0), 0, 1) * 0.28;
      return g;
    };
    fin(g, W, H + 0.24, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Open till', 'e');
    return g;
  };

  /** plantPotted() — sad office ficus. */
  Geo.plantPotted = function (opts) {
    var o = opt(opts);
    var rng = seedOf(o, 771);
    var g = grp('plantPotted');
    var potH = num(o.potH, 0.26), potR = num(o.potR, 0.16);
    cyl(g, potR, potR * 0.78, potH, 14, Mat.color(o.pot === undefined ? 0x6b5140 : o.pot, { rough: 0.9 }), 0, potH / 2, 0);
    cyl(g, potR * 1.06, potR * 1.06, 0.03, 14, Mat.color(o.pot === undefined ? 0x6b5140 : o.pot, { rough: 0.9 }), 0, potH - 0.015, 0);
    cyl(g, potR * 0.94, potR * 0.94, 0.02, 12, M('soil'), 0, potH - 0.01, 0);
    var trunkH = num(o.h, 0.9);
    var trunk = cyl(g, 0.016, 0.026, trunkH, 8, M('bark'), 0, potH + trunkH / 2, 0);
    trunk.rotation.z = 0.04;
    var leaves = inst(SPHG(0.13, 8), M('foliage'), 7);
    var i;
    for (i = 0; i < 7; i++) {
      var a = rng() * Math.PI * 2, r = rng() * 0.14;
      setInst(leaves, i, Math.cos(a) * r, potH + trunkH * (0.6 + rng() * 0.45), Math.sin(a) * r,
        0, a, 0, 1.1 + rng() * 0.5, 0.62, 1.1 + rng() * 0.5);
    }
    leaves.instanceMatrix.needsUpdate = true;
    g.add(leaves);
    fin(g, potR * 2.2, potH + trunkH + 0.2, potR * 2.2, [col(0, potH / 2, 0, potR, potH / 2, potR)]);
    return g;
  };

  /** doorChime() — the shop bell over the door. g.ring() swings it. */
  Geo.doorChime = function () {
    var g = grp('doorChime');
    g.userData.mount = 'wall';
    box(g, 0.10, 0.014, 0.03, M('woodDark'), 0, 0, 0.015);
    var arm = new THREE.Group();
    arm.position.set(0, -0.008, 0.02);
    g.add(arm);
    var spring = cyl(arm, 0.004, 0.004, 0.08, 6, M('steel'), 0, -0.04, 0);
    var bell = sph(arm, 0.026, 12, M('gold'), 0, -0.095, 0);
    bell.scale.set(1, 0.85, 1);
    var clap = sph(arm, 0.008, 6, M('steelDark'), 0, -0.115, 0);
    g.bell = bell;
    g.arm = arm;
    var swing = 0, phase = 0;
    g.ring = function () { swing = 1; return g; };
    g.update = function (dt) {
      var d = num(dt, 0);
      if (swing > 0.001) {
        swing = Math.max(0, swing - d * 1.6);
        phase += d * 18;
        arm.rotation.z = Math.sin(phase) * 0.5 * swing;
        arm.rotation.x = Math.cos(phase * 0.7) * 0.2 * swing;
      } else if (arm.rotation.z !== 0) {
        arm.rotation.z = 0; arm.rotation.x = 0;
      }
      return g;
    };
    fin(g, 0.12, 0.16, 0.05, []);
    return g;
  };

  /* ---- small hardware ---- */

  /** hardDrive() — 3.5" IDE drive, PCB down, label up. */
  Geo.hardDrive = function (opts) {
    var o = opt(opts);
    var W = 0.102, H = 0.026, D = 0.147;
    var g = grp('hardDrive');
    cbox(g, W, H, D, 0.003, M('aluminium'), 0, H / 2, 0);
    var labMat = M('paper');
    var lt = Tex.label('hdd', ['SEA-QUEST', '6.4 GB'], 0xd9dde0, 0x181b1e, 256, 128);
    if (lt) { labMat = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }); labMat.name = 'hddLabel'; }
    var lab = new THREE.Mesh(PLANEG(W * 0.86, D * 0.62), labMat);
    lab.rotation.x = -Math.PI / 2;
    lab.position.y = H + 0.0006;
    noShadow(lab);
    g.add(lab);
    /* pcb underside + IDE header + molex */
    noShadow(box(g, W * 0.9, 0.003, D * 0.9, M('pcb'), 0, 0.0015, 0));
    box(g, 0.052, 0.006, 0.006, M('blackPlastic'), -0.018, 0.008, -D / 2 + 0.004);
    box(g, 0.022, 0.008, 0.006, M('clothWhite'), 0.033, 0.008, -D / 2 + 0.004);
    /* screws */
    var sc = inst(CYLG(0.003, 0.003, 0.003, 6), M('steel'), 4);
    setInst(sc, 0, -W / 2 + 0.008, H, -D / 2 + 0.02);
    setInst(sc, 1, W / 2 - 0.008, H, -D / 2 + 0.02);
    setInst(sc, 2, -W / 2 + 0.008, H, D / 2 - 0.02);
    setInst(sc, 3, W / 2 - 0.008, H, D / 2 - 0.02);
    sc.instanceMatrix.needsUpdate = true;
    noShadow(sc);
    g.add(sc);
    fin(g, W, H, D, []);
    interact(g, 'Take drive', 'e');
    return g;
  };

  /** motherboard() — ATX board with sockets, slots, caps, RAM. */
  Geo.motherboard = function (opts) {
    var o = opt(opts);
    var W = 0.305, D = 0.244;
    var g = grp('motherboard');
    var board = new THREE.Mesh(BOXG(W, 0.0016, D), M('pcb'));
    board.position.y = 0.0008;
    board.receiveShadow = true;
    g.add(board);
    /* CPU socket + heatsink */
    box(g, 0.055, 0.006, 0.055, M('blackPlastic'), -W * 0.16, 0.004, -D * 0.1);
    var fins = inst(BOXG(0.003, 0.026, 0.05), M('aluminium'), 11);
    var i;
    for (i = 0; i < 11; i++) setInst(fins, i, -W * 0.16 - 0.025 + i * 0.005, 0.02, -D * 0.1);
    fins.instanceMatrix.needsUpdate = true;
    g.add(fins);
    var fan = cyl(g, 0.026, 0.026, 0.008, 10, M('blackPlastic'), -W * 0.16, 0.037, -D * 0.1);
    g.fan = fan;
    /* RAM slots */
    var slots = inst(BOXG(0.008, 0.008, 0.13), Mat.color(0x1b2c4a, { rough: 0.6 }), 4);
    for (i = 0; i < 4; i++) setInst(slots, i, -W * 0.02 + i * 0.014, 0.005, -D * 0.06);
    slots.instanceMatrix.needsUpdate = true;
    g.add(slots);
    var ram = box(g, 0.004, 0.028, 0.126, M('pcb'), -W * 0.02, 0.018, -D * 0.06);
    var ram2 = box(g, 0.004, 0.028, 0.126, M('pcb'), -W * 0.02 + 0.014, 0.018, -D * 0.06);
    g.ram = [ram, ram2];
    /* PCI/ISA slots */
    var pci = inst(BOXG(0.007, 0.010, 0.09), Mat.color(0xd8d2c0, { rough: 0.7 }), 5);
    for (i = 0; i < 5; i++) setInst(pci, i, -W * 0.30 + i * 0.019, 0.006, D * 0.22);
    pci.instanceMatrix.needsUpdate = true;
    g.add(pci);
    var isa = inst(BOXG(0.007, 0.010, 0.11), Mat.color(0x1a1a1a, { rough: 0.7 }), 2);
    for (i = 0; i < 2; i++) setInst(isa, i, W * 0.02 + i * 0.019, 0.006, D * 0.2);
    isa.instanceMatrix.needsUpdate = true;
    g.add(isa);
    /* electrolytic caps */
    var caps = inst(CYLG(0.005, 0.005, 0.014, 8), Mat.color(0x1d3a6b, { rough: 0.5 }), 12);
    var rng = seedOf(o, 33);
    for (i = 0; i < 12; i++) {
      setInst(caps, i, -W * 0.36 + rng() * W * 0.5, 0.008, -D * 0.3 + rng() * D * 0.4);
    }
    caps.instanceMatrix.needsUpdate = true;
    g.add(caps);
    /* rear I/O + IDE headers */
    box(g, 0.09, 0.02, 0.012, M('steel'), -W * 0.28, 0.012, -D / 2 + 0.008);
    box(g, 0.008, 0.008, 0.05, Mat.color(0xffffff, { rough: 0.8 }), W * 0.34, 0.006, -D * 0.1);
    box(g, 0.008, 0.008, 0.05, Mat.color(0xffffff, { rough: 0.8 }), W * 0.38, 0.006, -D * 0.1);
    /* BIOS chip + battery seat */
    box(g, 0.016, 0.005, 0.03, M('blackPlastic'), W * 0.30, 0.004, D * 0.16);
    var bat = Geo.cmosBattery();
    bat.position.set(W * 0.36, 0.002, D * 0.30);
    g.add(bat);
    g.battery = bat;
    fin(g, W, 0.05, D, []);
    interact(g, 'Replace CMOS battery', 'e');
    return g;
  };

  /** cmosBattery() — CR2032 in a clip. */
  Geo.cmosBattery = function () {
    var g = grp('cmosBattery');
    var cell = cyl(g, 0.010, 0.010, 0.0032, 14, M('chrome'), 0, 0.0026, 0);
    noShadow(cyl(g, 0.007, 0.007, 0.0006, 12, M('steelDark'), 0, 0.0043, 0));
    /* holder clip */
    var clip = mk(TORG(0.0115, 0.0016, 12), M('steel'), 0, 0.0012, 0);
    clip.rotation.x = Math.PI / 2;
    g.add(clip);
    box(g, 0.006, 0.004, 0.004, M('steel'), 0, 0.004, -0.0115);
    g.cell = cell;
    fin(g, 0.024, 0.006, 0.024, []);
    interact(g, 'Take battery', 'e');
    return g;
  };

  /** screwdriver() — Phillips #2, magnetised, obviously. */
  Geo.screwdriver = function (opts) {
    var o = opt(opts);
    var g = grp('screwdriver');
    var handle = Mat.color(o.color === undefined ? 0xd6432c : o.color, { rough: 0.6 });
    var h = cyl(g, 0.014, 0.017, 0.10, 10, handle, 0, 0.017, -0.055);
    h.rotation.x = Math.PI / 2;
    /* grip ribs */
    var ribs = inst(BOXG(0.004, 0.004, 0.09), handle, 6);
    var i;
    for (i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      setInst(ribs, i, Math.cos(a) * 0.0155, 0.017 + Math.sin(a) * 0.0155, -0.055, 0, 0, 0);
    }
    ribs.instanceMatrix.needsUpdate = true;
    g.add(ribs);
    var shaft = cyl(g, 0.0035, 0.0035, 0.13, 8, M('chrome'), 0, 0.017, 0.065);
    shaft.rotation.x = Math.PI / 2;
    var tip = mk(CONEG(0.004, 0.014, 6), M('steelDark'), 0, 0.017, 0.137);
    tip.rotation.x = -Math.PI / 2;
    g.add(tip);
    fin(g, 0.034, 0.034, 0.24, []);
    interact(g, 'Take screwdriver', 'e');
    return g;
  };

  /** cableCoil() — loose loop of cable on the floor/bench. */
  Geo.cableCoil = function (opts) {
    var o = opt(opts);
    var R = num(o.r, 0.13);
    var g = grp('cableCoil');
    var m = Mat.color(o.color === undefined ? 0x14161a : o.color, { rough: 0.85 });
    var n = 3, i;
    for (i = 0; i < n; i++) {
      var t = mk(TORG(R - i * 0.012, 0.007, 14), m, 0, 0.008 + i * 0.014, 0);
      t.rotation.x = Math.PI / 2;
      t.rotation.z = i * 0.6;
      t.scale.set(1, 1, 1);
      g.add(t);
    }
    /* the loose end and a plug */
    var end = cyl(g, 0.007, 0.007, 0.10, 6, m, R * 0.7, 0.008, R * 0.5);
    end.rotation.set(Math.PI / 2, 0, 0.7);
    box(g, 0.018, 0.014, 0.03, M('blackPlastic'), R * 0.9, 0.012, R * 0.85);
    fin(g, R * 2, 0.05, R * 2, []);
    interact(g, 'Take cable', 'e');
    return g;
  };

  /* =========================================================================
   * 3e. EXTERIOR
   * =====================================================================*/

  var CAR_KINDS = {
    sedan: { l: 4.55, w: 1.78, h: 1.44, wheel: 0.32, cabF: 0.06, cabL: 0.46, roofH: 0.50, bonnet: 0.78, boot: 0.72 },
    suv: { l: 4.70, w: 1.90, h: 1.78, wheel: 0.37, cabF: 0.02, cabL: 0.56, roofH: 0.62, bonnet: 0.72, boot: 0.42 },
    van: { l: 5.20, w: 1.96, h: 2.10, wheel: 0.35, cabF: -0.22, cabL: 0.78, roofH: 0.86, bonnet: 0.52, boot: 0.10 },
    taxi: { l: 4.60, w: 1.80, h: 1.48, wheel: 0.32, cabF: 0.06, cabL: 0.48, roofH: 0.50, bonnet: 0.76, boot: 0.70 }
  };

  /** car(colorHex, kind) — front is +Z. Wheels on g.wheels for rolling. */
  Geo.car = function (colorHex, kind, opts) {
    var o = opt(opts);
    var k = CAR_KINDS[kind] ? kind : 'sedan';
    var s = CAR_KINDS[k];
    var hex = (typeof colorHex === 'number') ? colorHex : 0xb8bcc0;
    if (k === 'taxi') hex = (typeof colorHex === 'number') ? colorHex : 0xf2c400;
    var g = grp('car:' + k);
    var body = Mat.color(hex, { rough: 0.32, metal: 0.55 });
    var trim = M('blackPlastic');
    var glassM = M('glassTint');
    var L = s.l, W = s.w, H = s.h, wr = s.wheel;

    /* main body volume, sitting on the suspension */
    var sillY = wr * 0.72;
    var bodyH = (H - s.roofH) - sillY;
    cbox(g, W, bodyH, L, 0.10, body, 0, sillY + bodyH / 2, 0);
    /* bonnet + boot steps so the silhouette reads */
    if (s.bonnet > 0.6) {
      cbox(g, W * 0.96, bodyH * 0.34, L * 0.30, 0.06, body, 0, sillY + bodyH * 0.92, L * 0.32);
    }
    if (s.boot > 0.5) {
      cbox(g, W * 0.96, bodyH * 0.30, L * 0.24, 0.06, body, 0, sillY + bodyH * 0.90, -L * 0.36);
    }
    /* cabin */
    var cabY = sillY + bodyH;
    var cabL = L * s.cabL;
    var cab = cbox(g, W * 0.90, s.roofH, cabL, 0.10, body, 0, cabY + s.roofH / 2, L * s.cabF * 0.5);
    /* glasshouse: a slightly smaller dark box inside the cabin */
    var gh = cbox(g, W * 0.915, s.roofH * 0.68, cabL * 0.94, 0.06, glassM, 0, cabY + s.roofH * 0.40, L * s.cabF * 0.5);
    noShadow(gh);
    /* roof cap so the glass doesn't wrap over the top */
    cbox(g, W * 0.88, s.roofH * 0.22, cabL * 0.92, 0.05, body, 0, cabY + s.roofH * 0.90, L * s.cabF * 0.5);
    /* A/B pillars */
    var pil = inst(BOXG(W * 0.93, s.roofH * 0.66, 0.05), body, 3);
    setInst(pil, 0, 0, cabY + s.roofH * 0.4, L * s.cabF * 0.5 + cabL * 0.46);
    setInst(pil, 1, 0, cabY + s.roofH * 0.4, L * s.cabF * 0.5);
    setInst(pil, 2, 0, cabY + s.roofH * 0.4, L * s.cabF * 0.5 - cabL * 0.46);
    pil.instanceMatrix.needsUpdate = true;
    g.add(pil);

    /* wheels */
    var wheels = [];
    var wz = [L * 0.31, -L * 0.31];
    var wx = [-W / 2 + wr * 0.28, W / 2 - wr * 0.28];
    var i, j;
    var tyreG = CYLG(wr, wr, wr * 0.66, 14);
    var rimG = CYLG(wr * 0.60, wr * 0.60, wr * 0.68, 10);
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 2; j++) {
        var wgp = new THREE.Group();
        wgp.position.set(wx[j], wr, wz[i]);
        g.add(wgp);
        var ty = mk(tyreG, M('rubber'), 0, 0, 0);
        ty.rotation.z = Math.PI / 2;
        wgp.add(ty);
        var rm = mk(rimG, M('aluminium'), 0, 0, 0);
        rm.rotation.z = Math.PI / 2;
        wgp.add(rm);
        wheels.push(wgp);
        /* arch shadow */
        noShadow(box(g, 0.02, wr * 1.2, wr * 2.2, trim, wx[j] + (j ? -0.01 : 0.01) * 1, wr * 1.05, wz[i]));
      }
    }
    g.wheels = wheels;

    /* lights */
    var hlY = sillY + bodyH * 0.6;
    var hl = inst(BOXG(0.28, 0.11, 0.05), M('emissiveWhite'), 2);
    setInst(hl, 0, -W * 0.32, hlY, L / 2 - 0.02);
    setInst(hl, 1, W * 0.32, hlY, L / 2 - 0.02);
    hl.instanceMatrix.needsUpdate = true;
    noShadow(hl);
    g.add(hl);
    g.headlights = hl;
    var tl = inst(BOXG(0.26, 0.10, 0.05), M('ledRed'), 2);
    setInst(tl, 0, -W * 0.33, hlY, -L / 2 + 0.02);
    setInst(tl, 1, W * 0.33, hlY, -L / 2 + 0.02);
    tl.instanceMatrix.needsUpdate = true;
    noShadow(tl);
    g.add(tl);
    g.taillights = tl;
    /* bumpers, grille, mirrors, plate */
    box(g, W * 0.98, 0.16, 0.06, trim, 0, sillY + 0.06, L / 2 - 0.01);
    box(g, W * 0.98, 0.16, 0.06, trim, 0, sillY + 0.06, -L / 2 + 0.01);
    box(g, W * 0.5, 0.10, 0.04, M('steelDark'), 0, hlY - 0.02, L / 2 - 0.005);
    noShadow(box(g, 0.28, 0.08, 0.006, M('clothWhite'), 0, sillY + 0.14, L / 2 + 0.005));
    var mir = inst(BOXG(0.06, 0.05, 0.11), trim, 2);
    setInst(mir, 0, -W / 2 - 0.02, cabY + s.roofH * 0.18, L * s.cabF * 0.5 + cabL * 0.4);
    setInst(mir, 1, W / 2 + 0.02, cabY + s.roofH * 0.18, L * s.cabF * 0.5 + cabL * 0.4);
    mir.instanceMatrix.needsUpdate = true;
    g.add(mir);
    /* door seams */
    var seams = inst(BOXG(W * 1.002, bodyH * 0.7, 0.008), trim, 2);
    setInst(seams, 0, 0, sillY + bodyH * 0.5, L * s.cabF * 0.5 + cabL * 0.46);
    setInst(seams, 1, 0, sillY + bodyH * 0.5, L * s.cabF * 0.5 - cabL * 0.46);
    seams.instanceMatrix.needsUpdate = true;
    noShadow(seams);
    g.add(seams);

    if (k === 'taxi') {
      cbox(g, 0.46, 0.13, 0.20, 0.03, M('emissiveWhite'), 0, H + 0.06, L * s.cabF * 0.5 + cabL * 0.2);
      noShadow(box(g, W * 0.92, 0.22, 0.006, M('clothBlack'), 0, sillY + bodyH * 0.5, -0.001 + W * 0.5));
      g.userData.taxi = true;
    }
    if (k === 'van') {
      /* sliding-door handle + rear doors seam */
      box(g, 0.01, 0.05, 0.16, trim, W / 2 + 0.005, cabY - 0.14, 0);
      noShadow(box(g, 0.01, bodyH * 0.9, 0.01, trim, 0, sillY + bodyH * 0.5, -L / 2 + 0.02));
    }

    g.setLights = function (on) {
      hl.material = on === false ? M('greyPlastic') : M('emissiveWhite');
      tl.material = on === false ? M('blackPlastic') : M('ledRed');
      return g;
    };
    g.roll = function (dist) {
      var a = num(dist, 0) / wr;
      var q;
      for (q = 0; q < wheels.length; q++) wheels[q].rotation.x += a;
      return g;
    };
    g.steer = function (ang) {
      wheels[0].rotation.y = num(ang, 0);
      wheels[1].rotation.y = num(ang, 0);
      return g;
    };
    fin(g, W, H, L, [col(0, H / 2, 0, W / 2, H / 2, L / 2)]);
    interact(g, 'Car', 'e');
    return g;
  };

  /** streetLamp() — 5m column, curved arm, sodium head + PointLight. */
  Geo.streetLamp = function (opts) {
    var o = opt(opts);
    var H = num(o.h, 5.0);
    var g = grp('streetLamp');
    var m = Mat.color(0x4a5054, { rough: 0.6, metal: 0.4 });
    cyl(g, 0.10, 0.13, 0.14, 10, M('concrete'), 0, 0.07, 0);
    cyl(g, 0.055, 0.075, H, 10, m, 0, H / 2, 0);
    var arm = new THREE.Group();
    arm.position.set(0, H, 0);
    g.add(arm);
    var a1 = cyl(arm, 0.045, 0.05, 0.5, 8, m, 0.16, 0.16, 0);
    a1.rotation.z = -0.8;
    var a2 = cyl(arm, 0.04, 0.045, 0.62, 8, m, 0.62, 0.28, 0);
    a2.rotation.z = -Math.PI / 2 + 0.16;
    var head = new THREE.Group();
    head.position.set(0.95, 0.24, 0);
    arm.add(head);
    cbox(head, 0.52, 0.12, 0.24, 0.04, m, 0, 0, 0);
    var lens = box(head, 0.42, 0.03, 0.18, M('emissiveWhite'), 0, -0.06, 0);
    noShadow(lens);
    var light = null;
    try {
      light = new THREE.PointLight(0xffc07a, num(o.intensity, 6.0), num(o.dist, 14), 2);
      light.position.set(0, -0.2, 0);
      head.add(light);
    } catch (e) { light = null; }
    g.light = light; g.head = head; g.lens = lens;
    g.setOn = function (on) {
      if (light) light.intensity = on === false ? 0 : num(o.intensity, 6.0);
      lens.material = on === false ? M('greyPlastic') : M('emissiveWhite');
      return g;
    };
    fin(g, 1.2, H + 0.3, 0.3, [col(0, H / 2, 0, 0.1, H / 2, 0.1)]);
    return g;
  };

  /** bollard() — short steel post, reflective band. */
  Geo.bollard = function (opts) {
    var o = opt(opts);
    var H = num(o.h, 0.95);
    var g = grp('bollard');
    var m = Mat.color(o.color === undefined ? 0x2c3136 : o.color, { rough: 0.5, metal: 0.4 });
    cyl(g, 0.055, 0.065, H, 12, m, 0, H / 2, 0);
    cyl(g, 0.058, 0.058, 0.02, 12, M('emissiveWhite'), 0, H - 0.12, 0);
    sph(g, 0.055, 10, m, 0, H, 0).scale.set(1, 0.6, 1);
    cyl(g, 0.10, 0.11, 0.03, 12, M('steelDark'), 0, 0.015, 0);
    fin(g, 0.22, H, 0.22, [col(0, H / 2, 0, 0.07, H / 2, 0.07)]);
    return g;
  };

  /** treeSmall() — 4m street tree, 3 foliage masses. */
  Geo.treeSmall = function (opts) {
    var o = opt(opts);
    var rng = seedOf(o, 5150);
    var H = num(o.h, 4.0);
    var g = grp('treeSmall');
    var trunkH = H * 0.42;
    cyl(g, 0.07, 0.12, trunkH, 8, M('bark'), 0, trunkH / 2, 0);
    var br = 3, i;
    for (i = 0; i < br; i++) {
      var a = rng() * Math.PI * 2;
      var b = cyl(g, 0.03, 0.05, H * 0.24, 6, M('bark'),
        Math.cos(a) * 0.14, trunkH + H * 0.08, Math.sin(a) * 0.14);
      b.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    var canopy = inst(SPHG(H * 0.20, 9), M('foliage'), 4);
    setInst(canopy, 0, 0, trunkH + H * 0.28, 0, 0, 0, 0, 1.35, 1.0, 1.35);
    for (i = 1; i < 4; i++) {
      var a2 = (i / 3) * Math.PI * 2 + rng();
      setInst(canopy, i, Math.cos(a2) * H * 0.16, trunkH + H * 0.20 + rng() * H * 0.14,
        Math.sin(a2) * H * 0.16, 0, a2, 0, 1.0, 0.82, 1.0);
    }
    canopy.instanceMatrix.needsUpdate = true;
    g.add(canopy);
    /* tree pit */
    noShadow(cyl(g, 0.4, 0.4, 0.02, 10, M('soil'), 0, 0.01, 0));
    fin(g, H * 0.6, H, H * 0.6, [col(0, trunkH / 2, 0, 0.14, trunkH / 2, 0.14)]);
    return g;
  };

  /** hedge(len) — clipped box hedge, spans X. */
  Geo.hedge = function (len, opts) {
    var o = opt(opts);
    var L = num(len, 3), H = num(o.h, 0.8), D = num(o.d, 0.6);
    var g = grp('hedge');
    var m = M('foliage');
    cbox(g, L, H, D, 0.10, m, 0, H / 2, 0);
    /* lumpy top so it isn't a slab */
    var n = Math.max(2, Math.round(L / 0.5));
    var lumps = inst(SPHG(0.28, 7), m, n);
    var rng = seedOf(o, 606);
    var i;
    for (i = 0; i < n; i++) {
      setInst(lumps, i, -L / 2 + (L * (i + 0.5)) / n, H - 0.06 + rng() * 0.04, (rng() - 0.5) * D * 0.3,
        0, rng() * 3, 0, (L / n) * 2.0, 0.5, D * 1.4);
    }
    lumps.instanceMatrix.needsUpdate = true;
    g.add(lumps);
    fin(g, L, H, D, [col(0, H / 2, 0, L / 2, H / 2, D / 2)]);
    return g;
  };

  /** parkingLines(w,d) — instanced painted bays on one thin plane. */
  Geo.parkingLines = function (w, d, opts) {
    var o = opt(opts);
    var W = num(w, 20), D = num(d, 5.2);
    var g = grp('parkingLines');
    var bayW = num(o.bay, 2.5);
    var n = Math.max(1, Math.floor(W / bayW) + 1);
    var lines = inst(BOXG(0.12, 0.004, D), M('roadPaint'), n);
    var i;
    for (i = 0; i < n; i++) setInst(lines, i, -W / 2 + i * bayW, 0.002, 0);
    lines.instanceMatrix.needsUpdate = true;
    noShadow(lines);
    g.add(lines);
    /* kerb stop line */
    var stop = box(g, W, 0.004, 0.12, M('roadPaint'), 0, 0.002, -D / 2 + 0.06);
    noShadow(stop);
    if (o.wheelStops) {
      var ws = inst(BOXG(1.6, 0.10, 0.16), M('concrete'), n - 1);
      for (i = 0; i < n - 1; i++) setInst(ws, i, -W / 2 + bayW * (i + 0.5), 0.05, -D / 2 + 0.6);
      ws.instanceMatrix.needsUpdate = true;
      g.add(ws);
    }
    fin(g, W, 0.01, D, []);
    return g;
  };

  /** officeBlock(w,h,d,opts) — background building with instanced windows. */
  Geo.officeBlock = function (w, h, d, opts) {
    var o = opt(opts);
    var W = num(w, 18), H = num(h, 12), D = num(d, 12);
    var g = grp('officeBlock');
    var shell = M(o.mat || 'concrete');
    var m = box(g, W, H, D, shell, 0, H / 2, 0);
    m.receiveShadow = true;
    /* floor bands */
    var floors = Math.max(1, Math.floor(H / num(o.floorH, 3.4)));
    var bands = inst(BOXG(W + 0.06, 0.16, D + 0.06), M('concretePolished'), floors);
    var i, j;
    for (i = 0; i < floors; i++) setInst(bands, i, 0, (i + 1) * (H / floors) - 0.5, 0);
    bands.instanceMatrix.needsUpdate = true;
    g.add(bands);
    /* windows: two faces only (front +Z, right +X) to save draws */
    var cols = Math.max(1, Math.floor(W / 2.0));
    var wgeo = BOXG(1.35, 1.5, 0.06);
    var lit = num(o.lit, 0.18);
    var rng = seedOf(o, 2211);
    var glassMat = M('glassTint');
    var litMat = Mat.color(0xffd9a0, { rough: 0.4, emissive: 1.3 });
    var totF = cols * floors;
    var wf = inst(wgeo, glassMat, totF);
    var wl = inst(wgeo, litMat, totF);
    var nf = 0, nl = 0, k;
    for (j = 0; j < floors; j++) {
      for (i = 0; i < cols; i++) {
        var x = -W / 2 + (W / cols) * (i + 0.5);
        var y = (H / floors) * (j + 0.5);
        if (rng() < lit) { setInst(wl, nl++, x, y, D / 2 + 0.02); }
        else { setInst(wf, nf++, x, y, D / 2 + 0.02); }
      }
    }
    for (k = nf; k < totF; k++) setInst(wf, k, 0, -50, 0);
    for (k = nl; k < totF; k++) setInst(wl, k, 0, -50, 0);
    wf.instanceMatrix.needsUpdate = true;
    wl.instanceMatrix.needsUpdate = true;
    noShadow(wf); noShadow(wl);
    g.add(wf); g.add(wl);
    /* side face */
    var colsD = Math.max(1, Math.floor(D / 2.0));
    var totS = colsD * floors;
    var ws = inst(wgeo, glassMat, totS);
    var ns = 0;
    for (j = 0; j < floors; j++) {
      for (i = 0; i < colsD; i++) {
        setInst(ws, ns++, W / 2 + 0.02, (H / floors) * (j + 0.5), -D / 2 + (D / colsD) * (i + 0.5), 0, Math.PI / 2, 0);
      }
    }
    ws.instanceMatrix.needsUpdate = true;
    noShadow(ws);
    g.add(ws);
    /* roof plant */
    box(g, W * 0.3, 0.8, D * 0.25, M('steelDark'), -W * 0.2, H + 0.4, 0);
    box(g, W + 0.2, 0.3, D + 0.2, M('concrete'), 0, H + 0.15, 0);
    if (o.entrance !== false) {
      noShadow(box(g, 3.2, 2.6, 0.1, M('glassTint'), 0, 1.3, D / 2 + 0.05));
      box(g, 4.0, 0.25, 1.4, M('concretePolished'), 0, 2.9, D / 2 + 0.6);
    }
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    return g;
  };

  /** dumpster() — 1100L bin, lids g.open(t). */
  Geo.dumpster = function (opts) {
    var o = opt(opts);
    var W = 1.35, H = 1.15, D = 1.0;
    var g = grp('dumpster');
    var m = Mat.color(o.color === undefined ? 0x2f5a3c : o.color, { rough: 0.75, metal: 0.25 });
    cbox(g, W, H - 0.2, D, 0.03, m, 0, 0.2 + (H - 0.2) / 2, 0);
    /* ribs */
    var ribs = inst(BOXG(0.04, H - 0.3, 0.03), m, 4);
    var i;
    for (i = 0; i < 4; i++) setInst(ribs, i, -W / 2 + 0.2 + i * ((W - 0.4) / 3), 0.25 + (H - 0.3) / 2, D / 2 + 0.015);
    ribs.instanceMatrix.needsUpdate = true;
    g.add(ribs);
    var lids = new THREE.Group();
    lids.position.set(0, H - 0.02, -D / 2 + 0.02);
    g.add(lids);
    var lid = cbox(lids, W - 0.04, 0.04, D - 0.04, 0.015, M('blackPlastic'), 0, 0, (D - 0.04) / 2);
    /* castors */
    var cast = inst(CYLG(0.09, 0.09, 0.05, 8), M('rubber'), 4);
    setInst(cast, 0, -W / 2 + 0.14, 0.09, -D / 2 + 0.14, 0, 0, Math.PI / 2);
    setInst(cast, 1, W / 2 - 0.14, 0.09, -D / 2 + 0.14, 0, 0, Math.PI / 2);
    setInst(cast, 2, -W / 2 + 0.14, 0.09, D / 2 - 0.14, 0, 0, Math.PI / 2);
    setInst(cast, 3, W / 2 - 0.14, 0.09, D / 2 - 0.14, 0, 0, Math.PI / 2);
    cast.instanceMatrix.needsUpdate = true;
    g.add(cast);
    g.lid = lids;
    g.open = function (t) { lids.rotation.x = -STV.clamp(num(t, 0), 0, 1) * 1.9; return g; };
    fin(g, W, H, D, [col(0, H / 2, 0, W / 2, H / 2, D / 2)]);
    interact(g, 'Search dumpster', 'e');
    return g;
  };

  /** chainFence(len) — posts + rails + a chain-link mesh texture panel. */
  Geo.chainFence = function (len, opts) {
    var o = opt(opts);
    var L = num(len, 6), H = num(o.h, 2.2);
    var g = grp('chainFence');
    var m = Mat.color(0x8e959b, { rough: 0.5, metal: 0.6 });
    var n = Math.max(2, Math.round(L / 2.4) + 1);
    var posts = inst(CYLG(0.032, 0.032, H, 8), m, n);
    var i;
    for (i = 0; i < n; i++) setInst(posts, i, -L / 2 + (L * i) / (n - 1), H / 2, 0);
    posts.instanceMatrix.needsUpdate = true;
    g.add(posts);
    var rails = inst(CYLG(0.022, 0.022, L, 6), m, 2);
    setInst(rails, 0, 0, H - 0.03, 0, 0, 0, Math.PI / 2);
    setInst(rails, 1, 0, 0.06, 0, 0, 0, Math.PI / 2);
    rails.instanceMatrix.needsUpdate = true;
    g.add(rails);
    /* mesh: one alpha-tested plane using the grid texture */
    var meshMat = null;
    try {
      var t = Tex.grid(0xb9c0c6, 0x000000, 12);
      if (t) {
        var tt = t.clone();
        tt.needsUpdate = true;
        tt.userData.shared = true;
        tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
        tt.repeat.set(Math.max(1, L * 3), Math.max(1, H * 3));
        meshMat = new THREE.MeshStandardMaterial({
          map: tt, alphaMap: tt, transparent: true, alphaTest: 0.35,
          side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, color: 0xc8ced3
        });
        meshMat.name = 'chainlink';
      }
    } catch (e) { meshMat = null; }
    var panel = new THREE.Mesh(PLANEG(L, H - 0.08), meshMat || M('steel'));
    panel.position.set(0, H / 2 - 0.02, 0);
    noShadow(panel);
    g.add(panel);
    if (o.razor) {
      var rz = inst(TORG(0.09, 0.008, 6), m, Math.max(2, Math.round(L / 0.4)));
      var cnt = Math.max(2, Math.round(L / 0.4));
      for (i = 0; i < cnt; i++) setInst(rz, i, -L / 2 + (L * i) / (cnt - 1), H + 0.09, 0, 0, Math.PI / 2, 0);
      rz.instanceMatrix.needsUpdate = true;
      g.add(rz);
    }
    fin(g, L, H, 0.08, [col(0, H / 2, 0, L / 2, H / 2, 0.06)]);
    return g;
  };

  /** securityGate(w) — sliding vehicle gate. g.open(t). */
  Geo.securityGate = function (w, opts) {
    var o = opt(opts);
    var W = num(w, 4.5), H = num(o.h, 2.0);
    var g = grp('securityGate');
    var m = Mat.color(0x53585d, { rough: 0.5, metal: 0.6 });
    /* fixed posts */
    cyl(g, 0.07, 0.07, H + 0.3, 8, m, -W / 2 - 0.12, (H + 0.3) / 2, 0);
    cyl(g, 0.07, 0.07, H + 0.3, 8, m, W / 2 + 0.12, (H + 0.3) / 2, 0);
    var leaf = new THREE.Group();
    g.add(leaf);
    box(leaf, W, 0.08, 0.06, m, 0, H - 0.04, 0);
    box(leaf, W, 0.08, 0.06, m, 0, 0.06, 0);
    var bars = Math.max(4, Math.round(W / 0.22));
    var bi = inst(BOXG(0.03, H - 0.16, 0.03), m, bars);
    var i;
    for (i = 0; i < bars; i++) setInst(bi, i, -W / 2 + 0.04 + i * ((W - 0.08) / (bars - 1)), H / 2, 0);
    bi.instanceMatrix.needsUpdate = true;
    leaf.add(bi);
    /* diagonal brace + hazard chevrons */
    var d = box(leaf, Math.sqrt(W * W + H * H) * 0.98, 0.05, 0.03, m, 0, H / 2, 0);
    d.rotation.z = Math.atan2(H, W);
    noShadow(box(leaf, W * 0.3, 0.14, 0.02, M('hazardYellow'), W * 0.3, H * 0.5, 0.03));
    var solid = [col(0, H / 2, 0, W / 2, H / 2, 0.08)];
    g.leaf = leaf;
    g.open = function (t) {
      var k = STV.clamp(num(t, 0), 0, 1);
      leaf.position.x = -W * k * 0.98;
      g.userData.colliders = k > 0.6 ? [] : solid.slice();
      g.userData.openAmount = k;
      return g;
    };
    fin(g, W, H + 0.3, 0.12, solid.slice());
    interact(g, 'Gate', 'e');
    return g;
  };

  /** signPost(text) — post with a legible plate (canvas label). */
  Geo.signPost = function (text, opts) {
    var o = opt(opts);
    var H = num(o.h, 2.1);
    var W = num(o.w, 0.7), PH = num(o.plateH, 0.28);
    var g = grp('signPost');
    var m = Mat.color(0x8b9298, { rough: 0.5, metal: 0.5 });
    cyl(g, 0.03, 0.035, H, 8, m, 0, H / 2, 0);
    var txt = text === undefined ? 'MERIDIAN SYSTEMS' : String(text);
    var mat = M('clothWhite');
    var lt = Tex.label('sign:' + txt.slice(0, 24), txt,
      o.bg === undefined ? 0x1b4f8a : o.bg, o.fg === undefined ? 0xffffff : o.fg, 512, 160);
    if (lt) {
      mat = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.8, metalness: 0.1 });
      mat.name = 'sign';
    }
    var plate = new THREE.Mesh(BOXG(W, PH, 0.02), mat);
    plate.position.set(0, H - PH / 2 - 0.05, 0.012);
    plate.castShadow = true;
    g.add(plate);
    box(g, W, PH, 0.02, m, 0, H - PH / 2 - 0.05, 0);
    g.plate = plate;
    fin(g, W, H, 0.06, [col(0, H / 2, 0, 0.05, H / 2, 0.05)]);
    interact(g, 'Read sign', 'e');
    return g;
  };

  /** puddle(r) — flat reflective decal, slight ripple via scale wobble. */
  Geo.puddle = function (r, opts) {
    var o = opt(opts);
    var R = num(r, 0.9);
    var g = grp('puddle');
    var m = new THREE.Mesh(CYLG(R, R, 0.002, 18), M('water'));
    m.position.y = 0.001;
    noShadow(m);
    g.add(m);
    var edge = new THREE.Mesh(CYLG(R * 1.06, R * 1.06, 0.001, 18), Mat.color(0x2a2c2e, { rough: 0.95 }));
    edge.position.y = 0.0004;
    noShadow(edge);
    g.add(edge);
    g.surface = m;
    var t = 0;
    g.update = function (dt) {
      t += num(dt, 0);
      m.scale.set(1 + Math.sin(t * 0.7) * 0.004, 1, 1 + Math.cos(t * 0.5) * 0.004);
      return g;
    };
    fin(g, R * 2, 0.004, R * 2, []);
    return g;
  };

  /** bench() — slatted public bench. */
  Geo.bench = function (opts) {
    var o = opt(opts);
    var W = num(o.w, 1.7), H = 0.86, D = 0.62;
    var g = grp('bench');
    var wood = M('woodDark'), steel = M('steelDark');
    var slats = inst(BOXG(W, 0.03, 0.075), wood, 8);
    var i;
    for (i = 0; i < 4; i++) setInst(slats, i, 0, 0.45, -D / 2 + 0.12 + i * 0.10);
    for (i = 0; i < 4; i++) setInst(slats, 4 + i, 0, 0.52 + i * 0.10, -D / 2 + 0.06, -1.25, 0, 0);
    slats.instanceMatrix.needsUpdate = true;
    g.add(slats);
    var legs = inst(BOXG(0.05, 0.45, 0.05), steel, 4);
    setInst(legs, 0, -W / 2 + 0.14, 0.225, -D / 2 + 0.14);
    setInst(legs, 1, W / 2 - 0.14, 0.225, -D / 2 + 0.14);
    setInst(legs, 2, -W / 2 + 0.14, 0.225, D / 2 - 0.14);
    setInst(legs, 3, W / 2 - 0.14, 0.225, D / 2 - 0.14);
    legs.instanceMatrix.needsUpdate = true;
    g.add(legs);
    box(g, 0.04, 0.42, 0.04, steel, -W / 2 + 0.14, 0.66, -D / 2 + 0.08);
    box(g, 0.04, 0.42, 0.04, steel, W / 2 - 0.14, 0.66, -D / 2 + 0.08);
    fin(g, W, H, D, [col(0, 0.24, 0, W / 2, 0.24, D / 2)]);
    g.userData.seatY = 0.47;
    return g;
  };

  /** trashCan() — perforated street bin. */
  Geo.trashCan = function (opts) {
    var o = opt(opts);
    var H = num(o.h, 0.82), R = num(o.r, 0.22);
    var g = grp('trashCan');
    var m = Mat.color(o.color === undefined ? 0x3a4045 : o.color, { rough: 0.6, metal: 0.4 });
    cyl(g, R, R * 0.92, H, 14, m, 0, H / 2, 0);
    cyl(g, R * 1.05, R * 1.05, 0.03, 14, m, 0, H, 0);
    noShadow(cyl(g, R * 0.72, R * 0.72, 0.02, 12, M('blackPlastic'), 0, H + 0.005, 0));
    /* perforation band */
    var holes = inst(BOXG(0.02, 0.05, 0.01), M('blackPlastic'), 16);
    var i;
    for (i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2;
      setInst(holes, i, Math.cos(a) * R * 0.99, H * 0.6, Math.sin(a) * R * 0.99, 0, -a, 0);
    }
    holes.instanceMatrix.needsUpdate = true;
    noShadow(holes);
    g.add(holes);
    if (o.bag !== false) {
      var bag = cyl(g, R * 0.9, R * 0.8, 0.10, 12, Mat.color(0x16181b, { rough: 0.9 }), 0, H - 0.03, 0);
      noShadow(bag);
    }
    fin(g, R * 2.1, H, R * 2.1, [col(0, H / 2, 0, R, H / 2, R)]);
    interact(g, 'Search bin', 'e');
    return g;
  };

/*__APPEND__*/
})();

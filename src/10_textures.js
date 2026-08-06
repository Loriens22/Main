/* =====================================================================
 * 10_textures.js — every texture in the game, drawn on 2D canvases.
 * No image files, no data URIs, no network. Everything memoised.
 *
 * Conventions
 *   colour maps            -> THREE.SRGBColorSpace
 *   normal/rough/data maps -> THREE.NoColorSpace
 *   tiling surfaces        -> RepeatWrapping, seamless (periodic noise)
 *   posters/labels/screens -> ClampToEdgeWrapping
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;
  var tex = SG.tex;

  /* ================================================================== */
  /* 0. Tiny helpers                                                     */
  /* ================================================================== */

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }

  /* Deterministic, key-order-independent stringify for memo keys. */
  function stable(o) {
    if (o === null || o === undefined) return 'null';
    var t = typeof o;
    if (t === 'number' || t === 'boolean' || t === 'string') return JSON.stringify(o);
    if (Array.isArray(o)) {
      var a = [];
      for (var i = 0; i < o.length; i++) a.push(stable(o[i]));
      return '[' + a.join(',') + ']';
    }
    var keys = Object.keys(o).sort(), parts = [];
    for (var k = 0; k < keys.length; k++) {
      if (o[keys[k]] === undefined) continue;
      parts.push(JSON.stringify(keys[k]) + ':' + stable(o[keys[k]]));
    }
    return '{' + parts.join(',') + '}';
  }
  tex.__key = stable;

  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  function hex2rgb(h) {
    if (typeof h !== 'string') return [200, 200, 200];
    h = h.charAt(0) === '#' ? h.slice(1) : h;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [200, 200, 200];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbCss(r, g, b, a) {
    r = clamp255(r) | 0; g = clamp255(g) | 0; b = clamp255(b) | 0;
    return a === undefined
      ? 'rgb(' + r + ',' + g + ',' + b + ')'
      : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* out = a + (b-a)*t, arrays of 3 */
  function mix3(a, b, t, out) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }

  /* ---- periodic (seamless) value noise ------------------------------ */

  function ph(xi, yi, px, py, sd) {
    xi = xi % px; if (xi < 0) xi += px;
    yi = yi % py; if (yi < 0) yi += py;
    return util.hash2(xi + sd * 1013, yi + sd * 3571);
  }

  function pn(x, y, px, py, sd) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = util.smooth(xf), v = util.smooth(yf);
    var a = ph(xi, yi, px, py, sd), b = ph(xi + 1, yi, px, py, sd);
    var c = ph(xi, yi + 1, px, py, sd), d = ph(xi + 1, yi + 1, px, py, sd);
    return util.lerp(util.lerp(a, b, u), util.lerp(c, d, u), v) * 2 - 1;
  }

  /* Seamless fbm over the unit square. fx/fy are integer cell counts, so
   * the result tiles exactly at u,v = 0..1. Returns -1..1. */
  function nz(u, v, fx, fy, oct, sd) {
    oct = oct || 4; sd = sd || 0;
    fx = Math.max(1, fx | 0); fy = Math.max(1, fy | 0);
    var val = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      val += pn(u * fx * f, v * fy * f, fx * f, fy * f, sd + i * 41) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return val / norm;
  }

  /* Seamless worley, 0..1 (distance to nearest feature point). */
  function wor(u, v, fx, fy, sd) {
    fx = Math.max(1, fx | 0); fy = Math.max(1, fy | 0); sd = sd || 0;
    var x = u * fx, y = v * fy;
    var xi = Math.floor(x), yi = Math.floor(y), best = 8;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var cx = xi + ox, cy = yi + oy;
        var wx = cx % fx; if (wx < 0) wx += fx;
        var wy = cy % fy; if (wy < 0) wy += fy;
        var px = cx + util.hash2(wx + sd * 137, wy - sd * 71);
        var py = cy + util.hash2(wy + 911 + sd * 53, wx - 13 - sd * 29);
        var dx = px - x, dy = py - y;
        var d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  }

  tex.__noise = { nz: nz, wor: wor, pn: pn };

  /* ---- pixel pushing ------------------------------------------------ */

  /* fn(x, y, out, u, v) -> writes out[0..3] (0..255) */
  function fill(ctx, w, h, fn) {
    var img = ctx.createImageData(w, h);
    var d = img.data;
    var out = [0, 0, 0, 255];
    var iw = 1 / w, ih = 1 / h;
    for (var y = 0, i = 0; y < h; y++) {
      var v = y * ih;
      for (var x = 0; x < w; x++, i += 4) {
        out[3] = 255;
        fn(x, y, out, x * iw, v);
        d[i] = clamp255(out[0]);
        d[i + 1] = clamp255(out[1]);
        d[i + 2] = clamp255(out[2]);
        d[i + 3] = clamp255(out[3]);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* fn(x, y, u, v) -> scalar multiplier (or array of 3). */
  function modulate(ctx, w, h, fn) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data, iw = 1 / w, ih = 1 / h;
    for (var y = 0, i = 0; y < h; y++) {
      for (var x = 0; x < w; x++, i += 4) {
        var m = fn(x, y, x * iw, y * ih);
        if (typeof m === 'number') {
          d[i] = clamp255(d[i] * m);
          d[i + 1] = clamp255(d[i + 1] * m);
          d[i + 2] = clamp255(d[i + 2] * m);
        } else {
          d[i] = clamp255(d[i] * m[0]);
          d[i + 1] = clamp255(d[i + 1] * m[1]);
          d[i + 2] = clamp255(d[i + 2] * m[2]);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function grain(ctx, w, h, amt, seed) {
    if (!amt) return;
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    var r = util.rng(seed || 7);
    var k = amt * 255;
    for (var i = 0; i < d.length; i += 4) {
      var n = (r() - 0.5) * k;
      d[i] = clamp255(d[i] + n);
      d[i + 1] = clamp255(d[i + 1] + n);
      d[i + 2] = clamp255(d[i + 2] + n);
    }
    ctx.putImageData(img, 0, 0);
  }

  function tintPass(ctx, w, h, tint) {
    if (!tint) return;
    var c = hex2rgb(tint);
    var m = [c[0] / 190, c[1] / 190, c[2] / 190];
    modulate(ctx, w, h, function () { return m; });
  }

  /* ---- texture wrapping --------------------------------------------- */

  function wrapTex(canvas, opts) {
    opts = opts || {};
    var t = new THREE.CanvasTexture(canvas);
    var clamp = !!opts.clamp;
    t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.generateMipmaps = opts.mipmaps !== false;
    t.minFilter = t.generateMipmaps
      ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.anisotropy = opts.anisotropy === undefined ? 4 : opts.anisotropy;
    t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* Generic public helper. */
  tex.canvas = function (w, h, drawFn, opts) {
    opts = opts || {};
    var c = mkCanvas(w, h);
    var ctx = c.getContext('2d');
    if (drawFn) drawFn(ctx, c.width, c.height);
    return wrapTex(c, opts);
  };

  /* Resolve a working size: default `base`, halved on the low tier. */
  function S(opts, base) {
    var s = (opts && opts.size) || base;
    return SG.qpick(Math.max(32, s >> 1), s, s);
  }

  /* ---- factory registration + memoisation ---------------------------- */

  var CACHE = {};

  /* Registers SG.tex[name]. `gen(opts, w, h)` must return a canvas.
   * `repeat` is handled outside the generator: the pixels are produced once
   * and a cheap clone carries a different repeat. */
  function def(name, base, gen, texOpts) {
    var baseCache = {}, fullCache = {};
    CACHE[name] = { base: baseCache, full: fullCache };
    tex[name] = function (opts) {
      opts = opts || {};
      var fk = stable(opts);
      var got = fullCache[fk];
      if (got) return got;

      var bo = {}, k;
      for (k in opts) {
        if (k === 'repeat' || !Object.prototype.hasOwnProperty.call(opts, k)) continue;
        bo[k] = opts[k];
      }
      var bk = stable(bo);
      var t = baseCache[bk];
      if (!t) {
        var w = S(bo, base.w !== undefined ? base.w : base);
        var h = base.h !== undefined
          ? Math.max(8, Math.round(w * (base.h / base.w)))
          : w;
        var c = mkCanvas(w, h);
        gen(c.getContext('2d'), w, h, bo);
        t = wrapTex(c, texOpts);
        t.name = 'tex:' + name;
        baseCache[bk] = t;
      }

      var out = t;
      if (opts.repeat) {
        var rx = opts.repeat, ry = opts.repeat;
        if (Array.isArray(opts.repeat)) { rx = opts.repeat[0]; ry = opts.repeat[1]; }
        if (rx !== t.repeat.x || ry !== t.repeat.y) {
          out = t.clone();
          out.needsUpdate = true;
          out.repeat.set(rx, ry);
          out.name = t.name;
        }
      }
      fullCache[fk] = out;
      return out;
    };
  }

  /* ================================================================== */
  /* 1. Wood, laminate, floors                                           */
  /* ================================================================== */

  def('wood', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 3 : o.seed;
    var wear = o.wear === undefined ? 0.5 : o.wear;
    var planks = o.planks === undefined ? 3 : o.planks;
    var light = hex2rgb(o.light || '#a9743f');
    var dark = hex2rgb(o.dark || '#5e3618');
    var deep = hex2rgb(o.deep || '#2f1a0b');
    var c = [0, 0, 0];

    /* knots — a couple per board, they warp the ring field around them */
    var rnd = util.rng(seed * 977 + 11);
    var knots = [];
    var nK = 2 + Math.floor(rnd() * 2);
    for (var i = 0; i < nK; i++) {
      knots.push({ x: rnd(), y: rnd(), r: 0.02 + rnd() * 0.025, s: 0.4 + rnd() * 0.5 });
    }

    fill(ctx, w, h, function (x, y, out, u, v) {
      /* which plank am I on (planks run along +X) */
      var pf = v * planks;
      var pi = Math.floor(pf);
      var pfr = pf - pi;
      var poff = util.hash2(pi + seed * 31, 77) * 10;
      var phue = (util.hash2(pi * 7 + seed, 3) - 0.5) * 0.22;

      /* grain: slow along X, fast along Y */
      var gx = u * 3 + poff;
      var gy = v * planks;
      var warp = nz(u, v, 3, 12, 4, seed) * 0.35;

      /* ring coordinate — many thin latewood bands */
      var t = (v * planks * 9) + poff * 3 + nz(u, v, 2, 6, 4, seed + 5) * 2.2 + warp;

      /* knot distortion */
      var kb = 0;
      for (var ki = 0; ki < knots.length; ki++) {
        var K = knots[ki];
        var dx = (u - K.x), dy = (v - K.y) * 1.9;
        /* wrap shortest distance */
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        var d = Math.sqrt(dx * dx + dy * dy);
        t += K.s * 1.6 / (d * 14 + 0.55);
        if (d < K.r * 2.4) kb = Math.max(kb, 1 - d / (K.r * 2.4));
      }

      var ring = t - Math.floor(t);
      /* asymmetric ring profile: soft earlywood, hard dark latewood edge */
      var band = ring < 0.72 ? util.smooth(ring / 0.72) * 0.30
        : 1 - util.smooth((ring - 0.72) / 0.28);
      band = 1 - band;

      var fibre = nz(u, v, 6, 96, 3, seed + 9) * 0.5 + 0.5;
      var m = util.clamp(band * 0.85 + fibre * 0.25 - 0.08, 0, 1);

      mix3(light, dark, m, c);

      /* knot core */
      if (kb > 0) {
        var kk = Math.pow(kb, 1.7);
        mix3(c, deep, kk * 0.9, c);
      }

      /* per-plank hue shift */
      c[0] *= 1 + phue; c[1] *= 1 + phue * 0.8; c[2] *= 1 + phue * 0.5;

      /* plank seam */
      var seam = Math.min(pfr, 1 - pfr);
      if (seam < 0.012) {
        var sk = 1 - seam / 0.012;
        mix3(c, deep, sk * 0.85, c);
      } else if (seam < 0.035) {
        c[0] *= 0.94; c[1] *= 0.94; c[2] *= 0.94;
      }

      /* wear: scuffs and lighter high-traffic patches */
      if (wear > 0) {
        var sc = nz(u, v, 9, 9, 4, seed + 21) * 0.5 + 0.5;
        var k2 = 1 + (sc - 0.5) * 0.20 * wear;
        c[0] *= k2; c[1] *= k2; c[2] *= k2;
      }

      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    });

    grain(ctx, w, h, 0.028, seed);
    tintPass(ctx, w, h, o.tint);
  });

  def('laminate', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 12 : o.seed;
    var base = hex2rgb(o.color || '#b8b2a4');
    var fleckA = hex2rgb('#8c8578');
    var fleckB = hex2rgb('#d8d2c4');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var n = nz(u, v, 24, 24, 3, seed) * 0.5 + 0.5;
      var f = nz(u, v, 64, 64, 2, seed + 3);
      mix3(base, f > 0.25 ? fleckB : fleckA, Math.abs(f) * 0.45, c);
      var k = 0.9 + n * 0.2;
      /* faint horizontal print grain of the decor paper */
      k *= 1 + nz(u, v, 2, 40, 2, seed + 7) * 0.03;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.02, seed);
    tintPass(ctx, w, h, o.tint);
  });

  def('carpetOffice', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 5 : o.seed;
    var wear = o.wear === undefined ? 0.6 : o.wear;
    var hues = [
      hex2rgb(o.tint || '#4d5358'),
      hex2rgb('#3c4247'),
      hex2rgb('#5e6469'),
      hex2rgb('#4a4f46')
    ];
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* loop pile: tight worley cells make the individual loops */
      var loop = wor(u, v, 96, 96, seed);
      var loop2 = wor(u + 0.004, v + 0.004, 96, 96, seed);
      var lift = util.clamp((loop2 - loop) * 6 + 0.5, 0, 1);

      var pick = util.hash2((x * 1.5) | 0, (y * 1.5) | 0);
      var hi = (pick * hues.length) | 0;
      var col = hues[hi > 3 ? 3 : hi];
      mix3(hues[0], col, 0.55, c);

      var shade = 0.62 + loop * 0.75;
      shade *= 0.85 + lift * 0.3;
      /* broad mottling */
      shade *= 1 + nz(u, v, 5, 5, 3, seed + 2) * 0.10;
      /* traffic path — a worn lighter lane */
      if (wear > 0) {
        var lane = Math.exp(-Math.pow((v - 0.42) * 4.0, 2));
        shade *= 1 + lane * 0.13 * wear;
        shade *= 1 - Math.abs(nz(u, v, 3, 3, 2, seed + 8)) * 0.06 * wear;
      }
      out[0] = c[0] * shade; out[1] = c[1] * shade; out[2] = c[2] * shade;
    });
    grain(ctx, w, h, 0.05, seed + 1);
  });

  def('carpetHotel', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 17 : o.seed;
    var red = o.tint || '#5a1420';
    var gold = o.gold || '#a8873f';
    var dark = '#3a0c14';

    /* Damask-ish motif built in a cell canvas and used as a repeat pattern,
     * so the result is seamless by construction. */
    var cell = Math.max(32, w >> 1);
    var cc = mkCanvas(cell, cell);
    var cx = cc.getContext('2d');
    cx.fillStyle = red;
    cx.fillRect(0, 0, cell, cell);

    function motif(ox, oy) {
      var s = cell;
      cx.save();
      cx.translate(ox, oy);

      /* ogee lattice */
      cx.strokeStyle = gold;
      cx.lineWidth = s * 0.018;
      cx.globalAlpha = 0.85;
      cx.beginPath();
      cx.moveTo(s * 0.5, 0);
      cx.bezierCurveTo(s * 0.86, s * 0.14, s * 0.86, s * 0.36, s * 0.5, s * 0.5);
      cx.bezierCurveTo(s * 0.14, s * 0.36, s * 0.14, s * 0.14, s * 0.5, 0);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(s * 0.5, s);
      cx.bezierCurveTo(s * 0.86, s * 0.86, s * 0.86, s * 0.64, s * 0.5, s * 0.5);
      cx.bezierCurveTo(s * 0.14, s * 0.64, s * 0.14, s * 0.86, s * 0.5, s);
      cx.stroke();

      /* central palmette */
      cx.globalAlpha = 0.9;
      cx.fillStyle = gold;
      cx.beginPath();
      cx.moveTo(s * 0.5, s * 0.20);
      cx.bezierCurveTo(s * 0.62, s * 0.28, s * 0.62, s * 0.42, s * 0.5, s * 0.50);
      cx.bezierCurveTo(s * 0.38, s * 0.42, s * 0.38, s * 0.28, s * 0.5, s * 0.20);
      cx.fill();
      cx.beginPath();
      cx.arc(s * 0.5, s * 0.62, s * 0.055, 0, Math.PI * 2);
      cx.fill();

      /* side leaves */
      cx.globalAlpha = 0.55;
      var lv = [[0.18, 0.5], [0.82, 0.5]];
      for (var i = 0; i < 2; i++) {
        cx.beginPath();
        cx.ellipse(s * lv[i][0], s * lv[i][1], s * 0.055, s * 0.12,
          (i ? -0.5 : 0.5), 0, Math.PI * 2);
        cx.fill();
      }

      /* corner quatrefoils */
      cx.globalAlpha = 0.45;
      var corners = [[0, 0], [s, 0], [0, s], [s, s]];
      for (var k = 0; k < 4; k++) {
        cx.beginPath();
        cx.arc(corners[k][0], corners[k][1], s * 0.075, 0, Math.PI * 2);
        cx.fill();
      }
      cx.restore();
    }
    /* draw the motif with wrap-around copies so nothing is clipped */
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) motif(ox * cell, oy * cell);
    }
    cx.globalAlpha = 1;

    var pat = ctx.createPattern(cc, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);

    /* deep shadow between motifs + cut pile fibres */
    modulate(ctx, w, h, function (x, y, u, v) {
      var fib = wor(u, v, 110, 110, seed) * 0.55 + 0.65;
      fib *= 0.94 + nz(u, v, 40, 40, 2, seed + 3) * 0.10;
      fib *= 1 + nz(u, v, 4, 4, 3, seed + 6) * 0.09;
      return fib;
    });
    /* vignette the pile so it doesn't read flat */
    modulate(ctx, w, h, function (x, y, u, v) {
      var s = 0.92 + nz(u, v, 8, 8, 3, seed + 11) * 0.12;
      return s;
    });
    grain(ctx, w, h, 0.045, seed);
  });

  def('tileFloor', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 23 : o.seed;
    var n = o.tiles || 3;                     /* 3 x 300 mm tiles per metre */
    var base = hex2rgb(o.tint || '#c9c6bd');
    var groutC = hex2rgb(o.grout || '#7d7a72');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var tu = u * n, tv = v * n;
      var iu = Math.floor(tu), iv = Math.floor(tv);
      var fu = tu - iu, fv = tv - iv;
      var g = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv));
      var jitter = (util.hash2(iu + seed, iv - seed) - 0.5) * 0.10;

      var spec = nz(u, v, 60, 60, 3, seed + iu * 3 + iv) * 0.5 + 0.5;
      var mott = nz(u, v, 10, 10, 4, seed + 4) * 0.5 + 0.5;
      mix3(base, [base[0] * 0.82, base[1] * 0.82, base[2] * 0.80],
        spec * 0.35 + mott * 0.25, c);
      c[0] *= 1 + jitter; c[1] *= 1 + jitter; c[2] *= 1 + jitter;

      var gw = 0.022;
      if (g < gw) {
        var t = 1 - util.smooth(g / gw);
        mix3(c, groutC, t * 0.9, c);
      } else if (g < gw + 0.02) {
        /* bevelled edge highlight */
        c[0] *= 1.05; c[1] *= 1.05; c[2] *= 1.05;
      }
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    });
    grain(ctx, w, h, 0.018, seed);
  });

  /* ---- marble -------------------------------------------------------- */

  function marbleField(u, v, seed, k, oct) {
    var wx = nz(u, v, 2, 2, 3, seed + 1);
    var wy = nz(u, v, 2, 2, 3, seed + 40);
    return nz(u + wx * k, v + wy * k, 3, 3, oct || 5, seed);
  }

  function drawMarble(ctx, w, h, o, opts) {
    var seed = o.seed === undefined ? 31 : o.seed;
    var base = hex2rgb(o.tint || opts.base);
    var veinC = hex2rgb(o.vein || opts.vein);
    var haloC = hex2rgb(opts.halo);
    var warmC = hex2rgb(opts.warm);
    var c = [0, 0, 0];
    var K = opts.warp;

    fill(ctx, w, h, function (x, y, out, u, v) {
      var f = marbleField(u, v, seed, K, 5);
      var a = 1 - Math.abs(f);
      var vein = Math.pow(a, opts.sharp);
      var halo = Math.pow(a, 2.2) * 0.35;

      /* second, finer vein family at an angle */
      var f2 = marbleField(v * 0.8 + 0.31, u * 1.3 + 0.77, seed + 90, K * 0.7, 4);
      var vein2 = Math.pow(1 - Math.abs(f2), opts.sharp * 1.9) * 0.75;

      /* broad cloudy tonal drift */
      var cloud = nz(u, v, 2, 2, 4, seed + 12) * 0.5 + 0.5;

      mix3(base, warmC, cloud * 0.35, c);
      mix3(c, haloC, util.clamp(halo + vein2 * 0.25, 0, 1) * 0.55, c);
      mix3(c, veinC, util.clamp(vein * 1.15, 0, 1) * 0.92, c);
      mix3(c, veinC, util.clamp(vein2, 0, 1) * 0.55, c);

      /* micro speckle in the stone */
      var sp = nz(u, v, 80, 80, 2, seed + 33) * 0.05 + 1;
      out[0] = c[0] * sp; out[1] = c[1] * sp; out[2] = c[2] * sp;
    });
    grain(ctx, w, h, 0.012, seed);
  }

  def('marbleFloor', 256, function (ctx, w, h, o) {
    drawMarble(ctx, w, h, o, {
      base: '#e6e1d6', vein: '#4a4640', halo: '#b6ab99', warm: '#f2ecdf',
      warp: 0.55, sharp: 11
    });
    /* 600 mm slabs — a hairline joint, polished stone has almost no grout */
    var n = o.tiles === undefined ? 2 : o.tiles;
    if (n > 0) {
      modulate(ctx, w, h, function (x, y, u, v) {
        var fu = (u * n) % 1, fv = (v * n) % 1;
        var g = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv));
        if (g < 0.006) return 0.62 + g / 0.006 * 0.3;
        if (g < 0.012) return 1.03;
        return 1;
      });
    }
  });

  def('marbleWall', 256, function (ctx, w, h, o) {
    drawMarble(ctx, w, h, o, {
      base: '#ded4c0', vein: '#5c4a34', halo: '#c2ab86', warm: '#efe6d2',
      warp: 0.75, sharp: 9
    });
  });

  /* ================================================================== */
  /* 2. Masonry, plaster, ceilings                                       */
  /* ================================================================== */

  def('concrete', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 41 : o.seed;
    var wear = o.wear === undefined ? 0.5 : o.wear;
    var base = hex2rgb(o.tint || '#8d8b85');
    var dark = hex2rgb('#5f5d58');
    var light = hex2rgb('#a8a69e');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var blot = nz(u, v, 4, 4, 4, seed) * 0.5 + 0.5;
      var agg = wor(u, v, 26, 26, seed + 3);
      var fine = nz(u, v, 48, 48, 3, seed + 7) * 0.5 + 0.5;
      mix3(base, light, blot * 0.55, c);
      mix3(c, dark, (1 - agg) * 0.28, c);
      var k = 0.88 + fine * 0.24;
      /* pinholes / air pockets */
      var pore = wor(u, v, 70, 70, seed + 19);
      if (pore < 0.12) k *= 0.55 + pore * 2.5;
      /* staining */
      k *= 1 - util.clamp(nz(u, v, 3, 6, 3, seed + 25), 0, 1) * 0.13 * wear;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    /* hairline cracks */
    var rnd = util.rng(seed * 13 + 5);
    ctx.strokeStyle = 'rgba(60,58,54,0.55)';
    for (var i = 0; i < 3; i++) {
      var px = rnd() * w, py = rnd() * h;
      var ang = rnd() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineWidth = 0.8;
      for (var s = 0; s < 26; s++) {
        ang += (rnd() - 0.5) * 0.9;
        px += Math.cos(ang) * 5; py += Math.sin(ang) * 5;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    grain(ctx, w, h, 0.035, seed);
  });

  def('asphalt', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 47 : o.seed;
    var base = hex2rgb(o.tint || '#3a3a3c');
    var stone = hex2rgb('#6b6a66');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var agg = wor(u, v, 44, 44, seed);
      var agg2 = wor(u, v, 90, 90, seed + 5);
      var t = util.clamp(1 - agg * 2.2, 0, 1) * 0.5 + util.clamp(1 - agg2 * 2.6, 0, 1) * 0.3;
      mix3(base, stone, t, c);
      var k = 0.85 + (nz(u, v, 6, 6, 4, seed + 2) * 0.5 + 0.5) * 0.3;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.06, seed);
  });

  def('brickPainted', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 53 : o.seed;
    var paint = o.tint || '#cfc9bb';
    var mortar = '#b3ada0';
    var rows = o.rows || 6;                     /* ~65 mm brick + joint */
    var bh = h / rows;
    var bw = w / 2.5;
    var rnd = util.rng(seed);

    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, w, h);

    for (var r = 0; r < rows; r++) {
      var offset = (r % 2) * bw * 0.5;
      for (var b = -1; b < 4; b++) {
        var x = b * bw + offset;
        var y = r * bh;
        var jitter = (rnd() - 0.5) * 14;
        ctx.fillStyle = rgbCss.apply(null,
          hex2rgb(paint).map(function (v2) { return v2 + jitter; }).concat([1]));
        var pad = Math.max(1, h * 0.008);
        ctx.fillRect(x + pad, y + pad, bw - pad * 2, bh - pad * 2);
      }
    }

    /* paint has been rolled over everything: soften joints, add sag + texture */
    modulate(ctx, w, h, function (x, y, u, v) {
      var k = 0.93 + (nz(u, v, 30, 30, 3, seed + 1) * 0.5 + 0.5) * 0.16;
      k *= 1 + nz(u, v, 4, 4, 3, seed + 9) * 0.07;
      /* grime collecting in the joints */
      var rowf = (v * rows) % 1;
      var edge = Math.min(rowf, 1 - rowf);
      if (edge < 0.09) k *= 0.86 + edge / 0.09 * 0.14;
      return k;
    });
    grain(ctx, w, h, 0.03, seed);
  });

  def('drywall', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 61 : o.seed;
    var wear = o.wear === undefined ? 0.35 : o.wear;
    var base = hex2rgb(o.tint || '#e2ded4');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* orange peel: fine worley bumps from the roller stipple */
      var peel = wor(u, v, 56, 56, seed);
      var micro = nz(u, v, 120, 120, 2, seed + 3) * 0.5 + 0.5;
      var k = 0.94 + peel * 0.10 + micro * 0.04;
      /* roller lap marks — faint vertical banding */
      k *= 1 + nz(u, v, 5, 1, 2, seed + 11) * 0.022;
      /* broad tonal drift so big walls don't read flat */
      k *= 1 + nz(u, v, 3, 3, 3, seed + 17) * 0.03;
      c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
      /* the odd scuff */
      if (wear > 0) {
        var sc = nz(u, v, 14, 14, 3, seed + 23);
        if (sc > 0.62) {
          var t = (sc - 0.62) / 0.38;
          mix3(c, [148, 143, 134], t * wear * 0.7, c);
        }
      }
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.014, seed);
  });

  def('plasterCeiling', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 67 : o.seed;
    var base = hex2rgb(o.tint || '#efece5');
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* knockdown stipple */
      var a = wor(u, v, 34, 34, seed);
      var b = wor(u, v, 70, 70, seed + 4);
      var k = 0.90 + a * 0.13 + b * 0.06;
      k *= 1 + nz(u, v, 4, 4, 3, seed + 8) * 0.025;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });
    grain(ctx, w, h, 0.012, seed);
  });

  def('ceilingTile', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 71 : o.seed;
    var base = hex2rgb(o.tint || '#ddd9cd');
    var rnd = util.rng(seed * 3 + 1);

    fill(ctx, w, h, function (x, y, out, u, v) {
      var k = 0.96 + (nz(u, v, 40, 40, 3, seed) * 0.5 + 0.5) * 0.08;
      k *= 1 + nz(u, v, 5, 5, 3, seed + 6) * 0.03;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });

    /* mineral-fibre pinholes */
    ctx.fillStyle = 'rgba(120,116,106,0.55)';
    var holes = (w * h) / 90;
    for (var i = 0; i < holes; i++) {
      var px = rnd() * w, py = rnd() * h;
      var r = 0.5 + rnd() * (w / 220);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
    /* fissures */
    ctx.strokeStyle = 'rgba(110,106,97,0.45)';
    for (var f = 0; f < 26; f++) {
      var fx = rnd() * w, fy = rnd() * h, ang = rnd() * Math.PI * 2;
      ctx.lineWidth = 0.7 + rnd() * (w / 300);
      ctx.beginPath(); ctx.moveTo(fx, fy);
      for (var s = 0; s < 6; s++) {
        ang += (rnd() - 0.5) * 1.1;
        fx += Math.cos(ang) * (w / 40); fy += Math.sin(ang) * (w / 40);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }

    /* bevelled tegular edge: a darker recess band round the tile */
    var e = Math.max(2, w * 0.035);
    var g = ctx.createLinearGradient(0, 0, 0, e);
    g.addColorStop(0, 'rgba(70,66,58,0.55)');
    g.addColorStop(1, 'rgba(70,66,58,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, e);
    ctx.save();
    ctx.translate(0, h); ctx.scale(1, -1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, e);
    ctx.restore();
    ctx.save();
    ctx.translate(0, 0); ctx.rotate(Math.PI / 2); ctx.scale(1, -1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, h, e);
    ctx.restore();
    ctx.save();
    ctx.translate(w, 0); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, h, e);
    ctx.restore();

    grain(ctx, w, h, 0.02, seed);
  });

  def('ceilingLightPanel', 256, function (ctx, w, h, o) {
    var base = o.tint || '#fdf6e6';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    /* prismatic diffuser: a fine pyramid grid */
    var n = 20;
    var cw = w / n, chh = h / n;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var g = ctx.createLinearGradient(x * cw, y * chh, (x + 1) * cw, (y + 1) * chh);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.5, 'rgba(228,224,208,0.15)');
        g.addColorStop(1, 'rgba(186,182,166,0.5)');
        ctx.fillStyle = g;
        ctx.fillRect(x * cw, y * chh, cw, chh);
      }
    }
    /* tube shadows behind the diffuser */
    for (var t = 0; t < 2; t++) {
      var yy = h * (0.3 + t * 0.4);
      var gg = ctx.createLinearGradient(0, yy - h * 0.10, 0, yy + h * 0.10);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, yy - h * 0.10, w, h * 0.20);
    }
    /* frame */
    ctx.strokeStyle = 'rgba(140,138,132,0.9)';
    ctx.lineWidth = Math.max(2, w * 0.018);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }, { clamp: true });

  /* ================================================================== */
  /* 3. Metals                                                           */
  /* ================================================================== */

  def('steelBrushed', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 83 : o.seed;
    var base = hex2rgb(o.tint || '#b4b8bc');
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* extreme anisotropy: 4 cells across, 512 down -> horizontal streaks */
      var s1 = nz(u, v, 3, 220, 2, seed);
      var s2 = nz(u, v, 8, 96, 3, seed + 5);
      var s3 = nz(u, v, 2, 40, 2, seed + 9);
      var k = 1 + s1 * 0.11 + s2 * 0.06 + s3 * 0.035;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });
    /* a few deeper drag lines */
    var rnd = util.rng(seed + 3);
    for (var i = 0; i < 22; i++) {
      var y0 = rnd() * h;
      ctx.strokeStyle = 'rgba(' + (rnd() > 0.5 ? '255,255,255,0.10' : '40,42,46,0.13') + ')';
      ctx.lineWidth = 0.6 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0 + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
    grain(ctx, w, h, 0.02, seed);
  });

  def('aluminium', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 89 : o.seed;
    var base = hex2rgb(o.tint || '#cfd4d9');
    fill(ctx, w, h, function (x, y, out, u, v) {
      var s1 = nz(u, v, 4, 160, 2, seed);
      var s2 = nz(u, v, 60, 60, 3, seed + 4);
      var k = 1 + s1 * 0.055 + s2 * 0.05;
      out[0] = base[0] * k; out[1] = base[1] * k * 1.002; out[2] = base[2] * k * 1.01;
    });
    grain(ctx, w, h, 0.014, seed);
  });

  def('steelPainted', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 97 : o.seed;
    var wear = o.wear === undefined ? 0.4 : o.wear;
    var base = hex2rgb(o.tint || '#4c545c');
    var bare = [150, 152, 155];
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var peel = wor(u, v, 60, 60, seed);
      var k = 0.95 + peel * 0.09;
      k *= 1 + nz(u, v, 4, 4, 3, seed + 5) * 0.04;
      c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
      if (wear > 0) {
        var sc = nz(u, v, 30, 30, 3, seed + 13);
        if (sc > 0.68) mix3(c, bare, (sc - 0.68) / 0.32 * wear * 0.8, c);
      }
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.018, seed);
  });

  def('copperTrace', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 101 : o.seed;
    var base = hex2rgb(o.tint || '#b5713a');
    var ox = hex2rgb('#6d4a2a');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var g = nz(u, v, 70, 70, 3, seed) * 0.5 + 0.5;
      var patina = util.clamp(nz(u, v, 6, 6, 4, seed + 7) * 0.5 + 0.5, 0, 1);
      mix3(base, ox, patina * 0.35, c);
      var k = 0.88 + g * 0.26;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.02, seed);
  });

  /* ================================================================== */
  /* 4. Plastics + rubber                                                */
  /* ================================================================== */

  def('beigePlastic', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 103 : o.seed;
    /* 1998 computer beige, yellowed by a decade of window light */
    var fresh = hex2rgb(o.tint || '#d8d0bc');
    var yellow = hex2rgb(o.yellow || '#c2a468');
    var uv = o.uv === undefined ? 0.85 : o.uv;    /* how sun-bleached */
    var dir = o.uvDir === undefined ? 0 : o.uvDir; /* 0 = +U side yellows */
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* the UV gradient is uneven — that's the detail that sells it */
      var axis = dir ? v : u;
      var g = util.smooth(util.clamp((axis - 0.10) / 0.85, 0, 1));
      g *= 0.72 + (nz(u, v, 3, 3, 3, seed + 2) * 0.5 + 0.5) * 0.55;
      g = util.clamp(g * uv, 0, 1);
      mix3(fresh, yellow, g, c);

      /* fine pebbled / bead-blasted mould texture */
      var peb = wor(u, v, 84, 84, seed);
      var micro = nz(u, v, 150, 150, 2, seed + 3) * 0.5 + 0.5;
      var k = 0.93 + peb * 0.11 + micro * 0.035;
      /* faint mould flow lines */
      k *= 1 + nz(u, v, 2, 22, 2, seed + 8) * 0.018;

      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    /* a couple of grubby fingerprints near where hands go */
    grain(ctx, w, h, 0.014, seed);
  });

  def('blackPlastic', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 107 : o.seed;
    var base = hex2rgb(o.tint || '#1e2023');
    fill(ctx, w, h, function (x, y, out, u, v) {
      var peb = wor(u, v, 80, 80, seed);
      var micro = nz(u, v, 160, 160, 2, seed + 3) * 0.5 + 0.5;
      var k = 0.80 + peb * 0.34 + micro * 0.09;
      k *= 1 + nz(u, v, 4, 4, 3, seed + 7) * 0.05;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });
    grain(ctx, w, h, 0.02, seed);
  });

  def('rubber', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 109 : o.seed;
    var base = hex2rgb(o.tint || '#17181a');
    fill(ctx, w, h, function (x, y, out, u, v) {
      var g = nz(u, v, 90, 90, 3, seed) * 0.5 + 0.5;
      var w2 = wor(u, v, 30, 30, seed + 2);
      var k = 0.85 + g * 0.20 + w2 * 0.10;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });
    grain(ctx, w, h, 0.03, seed);
  });

  def('glassDirty', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 113 : o.seed;
    var rnd = util.rng(seed);
    ctx.clearRect(0, 0, w, h);
    /* dust film */
    fill(ctx, w, h, function (x, y, out, u, v) {
      var d = nz(u, v, 8, 8, 4, seed) * 0.5 + 0.5;
      var f = nz(u, v, 60, 60, 3, seed + 2) * 0.5 + 0.5;
      var a = util.clamp((d * 0.6 + f * 0.4 - 0.45) * 1.6, 0, 1) * 90;
      out[0] = 210; out[1] = 212; out[2] = 208; out[3] = a;
    });
    /* wipe streaks */
    ctx.globalCompositeOperation = 'source-over';
    for (var i = 0; i < 8; i++) {
      var y0 = rnd() * h;
      var g = ctx.createLinearGradient(0, y0 - 6, 0, y0 + 6);
      g.addColorStop(0, 'rgba(235,238,235,0)');
      g.addColorStop(0.5, 'rgba(235,238,235,' + (0.05 + rnd() * 0.10).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(235,238,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y0 - 8, w, 16);
    }
    /* fingerprints */
    for (var f2 = 0; f2 < 4; f2++) {
      var px = rnd() * w, py = rnd() * h;
      ctx.strokeStyle = 'rgba(230,232,228,0.10)';
      ctx.lineWidth = 1;
      for (var r = 2; r < 9; r++) {
        ctx.beginPath();
        ctx.ellipse(px, py, r * 1.4, r * 1.9, 0.4, -1.6, 1.6);
        ctx.stroke();
      }
    }
    /* specks */
    ctx.fillStyle = 'rgba(120,118,112,0.35)';
    for (var s = 0; s < 90; s++) {
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 0.4 + rnd() * 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  /* ================================================================== */
  /* 5. Fabric, paper, organic                                           */
  /* ================================================================== */

  function weave(ctx, w, h, o, cfg) {
    var seed = o.seed === undefined ? cfg.seed : o.seed;
    var warp = hex2rgb(o.tint || cfg.warp);
    var weft = hex2rgb(cfg.weft);
    var period = cfg.period;
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var over;
      if (cfg.kind === 'twill') {
        over = ((x + y * 2) % period) < period * 0.5;
      } else if (cfg.kind === 'herring') {
        var band = Math.floor(y / (period * 2)) % 2;
        over = ((band ? x - y : x + y) % period) < period * 0.5;
      } else {
        over = ((Math.floor(x / (period / 2)) + Math.floor(y / (period / 2))) % 2) === 0;
      }
      mix3(warp, weft, over ? 0.0 : 0.55, c);
      var k = over ? 1.06 : 0.90;
      k *= 0.94 + (nz(u, v, 100, 100, 2, seed) * 0.5 + 0.5) * 0.14;
      k *= 1 + nz(u, v, 5, 5, 3, seed + 4) * (cfg.mottle === undefined ? 0.07 : cfg.mottle);
      /* stray fibres */
      var fib = nz(u, v, 12, 140, 2, seed + 9);
      k *= 1 + fib * 0.05;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, cfg.grain === undefined ? 0.035 : cfg.grain, seed);
  }

  def('fabricSeat', 256, function (ctx, w, h, o) {
    weave(ctx, w, h, o, {
      seed: 127, warp: '#3f4753', weft: '#5b6472', period: 6, kind: 'plain', mottle: 0.10
    });
    /* upholstery fleck */
    var rnd = util.rng(131);
    for (var i = 0; i < 260; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(196,200,206,0.30)' : 'rgba(30,34,40,0.35)';
      ctx.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  });

  def('denim', 256, function (ctx, w, h, o) {
    weave(ctx, w, h, o, {
      seed: 137, warp: '#2f4363', weft: '#c9c6bb', period: 8, kind: 'twill', mottle: 0.09
    });
  });

  def('cotton', 256, function (ctx, w, h, o) {
    weave(ctx, w, h, o, {
      seed: 139, warp: '#dcd7cc', weft: '#f2eee6', period: 4, kind: 'plain',
      mottle: 0.05, grain: 0.02
    });
  });

  def('coverallBlue', 256, function (ctx, w, h, o) {
    weave(ctx, w, h, o, {
      seed: 149, warp: '#2c4a72', weft: '#3d5d87', period: 7, kind: 'twill', mottle: 0.08
    });
    /* faded knees / general workwear wash */
    modulate(ctx, w, h, function (x, y, u, v) {
      return 1 + nz(u, v, 3, 3, 3, 151) * 0.10;
    });
  });

  def('suitWool', 256, function (ctx, w, h, o) {
    weave(ctx, w, h, o, {
      seed: 157, warp: '#242830', weft: '#3a3f49', period: 6, kind: 'herring',
      mottle: 0.06, grain: 0.03
    });
  });

  def('cardboard', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 163 : o.seed;
    var base = hex2rgb(o.tint || '#b08a58');
    var dark = hex2rgb('#7d5f36');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var fib = nz(u, v, 90, 26, 3, seed) * 0.5 + 0.5;
      var blot = nz(u, v, 7, 7, 3, seed + 3) * 0.5 + 0.5;
      mix3(base, dark, blot * 0.30 + fib * 0.22, c);
      var k = 0.92 + fib * 0.16;
      /* the flutes show faintly through the liner */
      k *= 1 + Math.sin(u * Math.PI * 2 * 26) * 0.016;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.045, seed);
  });

  def('paper', 512, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 167 : o.seed;
    var base = hex2rgb(o.tint || '#efece2');
    var age = o.age === undefined ? 0.25 : o.age;
    var foxC = [176, 148, 106];
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var fib = nz(u, v, 120, 120, 3, seed) * 0.5 + 0.5;
      var soft = nz(u, v, 8, 8, 3, seed + 4) * 0.5 + 0.5;
      mix3(base, foxC, soft * age * 0.35, c);
      var k = 0.965 + fib * 0.055;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.012, seed);
  }, { clamp: true });

  /* ---- skin, hair, fur ----------------------------------------------- */

  var SKIN_TONES = {
    pale: { base: '#e9c4ac', deep: '#c98f74', flush: '#dc9384' },
    tan: { base: '#cf9d76', deep: '#a97350', flush: '#c07e62' },
    brown: { base: '#8b5a3b', deep: '#5f3a24', flush: '#8a4c34' }
  };

  def('skin', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 173 : o.seed;
    var tone = SKIN_TONES[o.tone] || SKIN_TONES.pale;
    var base = hex2rgb(o.tint || tone.base);
    var deep = hex2rgb(tone.deep);
    var flush = hex2rgb(tone.flush);
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* blotchy subsurface variation — nobody has one flat skin colour */
      var blotch = nz(u, v, 5, 5, 4, seed) * 0.5 + 0.5;
      var red = nz(u, v, 9, 9, 3, seed + 6) * 0.5 + 0.5;
      mix3(base, deep, blotch * 0.22, c);
      mix3(c, flush, util.clamp((red - 0.45) * 1.5, 0, 1) * 0.30, c);

      /* pores: fine cellular dimples */
      var pore = wor(u, v, 130, 130, seed + 2);
      var k = 0.955 + pore * 0.075;
      /* micro wrinkle lines */
      k *= 1 + nz(u, v, 40, 90, 2, seed + 11) * 0.022;
      /* the odd freckle / mole */
      var fr = wor(u, v, 22, 22, seed + 17);
      if (fr < 0.08) k *= 0.88 + fr;

      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.012, seed);
  });

  function hairTex(ctx, w, h, o, baseHex, tipHex, seed) {
    seed = o.seed === undefined ? seed : o.seed;
    var base = hex2rgb(o.tint || baseHex);
    var tip = hex2rgb(tipHex);
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* strands run along V */
      var strand = nz(u, v, 130, 5, 2, seed) * 0.5 + 0.5;
      var clump = nz(u, v, 22, 3, 3, seed + 4) * 0.5 + 0.5;
      mix3(base, tip, strand * 0.55 + clump * 0.25, c);
      var k = 0.80 + strand * 0.45;
      k *= 0.9 + clump * 0.25;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.03, seed);
  }

  def('hairGrey', 256, function (ctx, w, h, o) {
    hairTex(ctx, w, h, o, '#9a9895', '#d9d7d2', 179);
  });
  def('hairBrown', 256, function (ctx, w, h, o) {
    hairTex(ctx, w, h, o, '#4a3423', '#7d5c39', 181);
  });

  def('catFur', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 191 : o.seed;
    var base = hex2rgb(o.tint || '#8e857a');
    var dark = hex2rgb(o.dark || '#423c35');
    var light = hex2rgb(o.light || '#c3b9a9');
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      /* mackerel tabby: wavy stripes running across the body (along V) */
      var wobble = nz(u, v, 3, 4, 3, seed) * 0.09;
      var s = (u + wobble) * 9;
      var band = Math.abs((s - Math.floor(s)) - 0.5) * 2;   /* 0 at stripe centre */
      var stripe = util.clamp(1 - band * 2.1, 0, 1);
      stripe *= 0.55 + (nz(u, v, 6, 6, 3, seed + 5) * 0.5 + 0.5) * 0.6;

      /* agouti ticking — every hair banded light/dark */
      var tick = nz(u, v, 90, 34, 3, seed + 9) * 0.5 + 0.5;
      mix3(base, light, tick * 0.45, c);
      mix3(c, dark, util.clamp(stripe, 0, 1) * 0.8, c);

      /* individual hair strands */
      var strand = nz(u, v, 170, 26, 2, seed + 13) * 0.5 + 0.5;
      var k = 0.84 + strand * 0.34;
      /* paler belly */
      k *= 1 + util.clamp((v - 0.68) * 2.2, 0, 1) * 0.22;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    });
    grain(ctx, w, h, 0.025, seed);
  });

  /* ================================================================== */
  /* 6. Electronics                                                      */
  /* ================================================================== */

  def('pcb', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 197 : o.seed;
    var maskHex = o.tint || '#0e4d2a';
    var rnd = util.rng(seed * 7 + 3);
    var k = w / 256;

    /* --- solder mask base, mottled --------------------------------- */
    var mask = hex2rgb(maskHex);
    var maskDk = [mask[0] * 0.62, mask[1] * 0.62, mask[2] * 0.62];
    var c = [0, 0, 0];
    fill(ctx, w, h, function (x, y, out, u, v) {
      var n = nz(u, v, 40, 40, 3, seed) * 0.5 + 0.5;
      mix3(mask, maskDk, n * 0.22, c);
      var kk = 0.94 + n * 0.12;
      out[0] = c[0] * kk; out[1] = c[1] * kk; out[2] = c[2] * kk;
    });

    /* --- copper ground pour: mask sits brighter where copper is under */
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(30,74,34,0.55)';
    for (var p = 0; p < 5; p++) {
      var px = rnd() * w, py = rnd() * h;
      var pw = w * (0.25 + rnd() * 0.45), phh = h * (0.18 + rnd() * 0.4);
      ctx.fillRect(px, py, pw, phh);
      ctx.fillRect(px - w, py, pw, phh);
      ctx.fillRect(px, py - h, pw, phh);
      ctx.fillRect(px - w, py - h, pw, phh);
    }
    ctx.globalCompositeOperation = 'source-over';

    /* --- everything below is drawn 9x so the texture tiles ---------- */
    function layer(draw) {
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          ctx.save();
          ctx.translate(ox * w, oy * h);
          draw();
          ctx.restore();
        }
      }
    }

    /* routed traces: orthogonal + 45 degree polylines */
    var traceCol = 'rgba(58,140,80,0.95)';
    var traceHi = 'rgba(96,190,120,0.35)';
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

    var vias = [];
    layer(function () {
      var r2 = util.rng(seed * 7 + 3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (var t = 0; t < 46; t++) {
        var x = Math.round(r2() * w / (4 * k)) * 4 * k;
        var y = Math.round(r2() * h / (4 * k)) * 4 * k;
        var d = DIRS[(r2() * 8) | 0];
        ctx.lineWidth = (r2() < 0.25 ? 2.2 : 1.15) * k;
        ctx.strokeStyle = traceCol;
        ctx.beginPath();
        ctx.moveTo(x, y);
        var segs = 2 + ((r2() * 4) | 0);
        for (var s = 0; s < segs; s++) {
          var len = (6 + r2() * 34) * k;
          x += d[0] * len; y += d[1] * len;
          ctx.lineTo(x, y);
          d = DIRS[(r2() * 8) | 0];
        }
        ctx.stroke();
        ctx.strokeStyle = traceHi;
        ctx.lineWidth = 0.5 * k;
        ctx.stroke();
        if (r2() < 0.5) vias.push([x, y]);
      }

      /* bus bundles — parallel runs, the thing that reads as "routed" */
      for (var b = 0; b < 4; b++) {
        var bx = r2() * w, by = r2() * h;
        var horiz = r2() < 0.5;
        var n = 6 + ((r2() * 6) | 0);
        var len2 = (40 + r2() * 90) * k;
        ctx.strokeStyle = traceCol;
        ctx.lineWidth = 1.1 * k;
        for (var i = 0; i < n; i++) {
          var off = i * 3.2 * k;
          ctx.beginPath();
          if (horiz) {
            ctx.moveTo(bx, by + off);
            ctx.lineTo(bx + len2 * 0.6, by + off);
            ctx.lineTo(bx + len2 * 0.6 + 10 * k, by + off + 10 * k);
            ctx.lineTo(bx + len2, by + off + 10 * k);
          } else {
            ctx.moveTo(bx + off, by);
            ctx.lineTo(bx + off, by + len2 * 0.6);
            ctx.lineTo(bx + off + 10 * k, by + len2 * 0.6 + 10 * k);
            ctx.lineTo(bx + off + 10 * k, by + len2);
          }
          ctx.stroke();
        }
      }
    });

    /* vias */
    layer(function () {
      for (var i = 0; i < vias.length; i++) {
        var vx = vias[i][0], vy = vias[i][1];
        ctx.fillStyle = '#c9a648';
        ctx.beginPath(); ctx.arc(vx, vy, 2.1 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1207';
        ctx.beginPath(); ctx.arc(vx, vy, 0.85 * k, 0, Math.PI * 2); ctx.fill();
      }
    });

    /* component footprints: gold pads + white silkscreen + designators */
    var REF = ['C', 'R', 'U', 'Q', 'D', 'L', 'J'];
    layer(function () {
      var r3 = util.rng(seed * 31 + 9);
      ctx.textBaseline = 'middle';
      for (var i = 0; i < 26; i++) {
        var x = r3() * w, y = r3() * h;
        var kind = r3();
        ctx.save();
        ctx.translate(x, y);
        if (r3() < 0.5) ctx.rotate(Math.PI / 2);

        if (kind < 0.42) {
          /* 0805 two-pad passive */
          var pw = 3.4 * k, phh = 4.2 * k, gap = 3.0 * k;
          ctx.fillStyle = '#cba94e';
          ctx.fillRect(-gap / 2 - pw, -phh / 2, pw, phh);
          ctx.fillRect(gap / 2, -phh / 2, pw, phh);
          ctx.strokeStyle = 'rgba(228,230,224,0.75)';
          ctx.lineWidth = 0.6 * k;
          ctx.strokeRect(-gap / 2 - pw - 1.2 * k, -phh / 2 - 1.2 * k,
            (gap / 2 + pw + 1.2 * k) * 2, phh + 2.4 * k);
        } else if (kind < 0.72) {
          /* SOIC / small IC: two rows of pads */
          var n = 4 + ((r3() * 4) | 0);
          var pitch = 3.1 * k;
          var bw = n * pitch, bh = 11 * k;
          ctx.strokeStyle = 'rgba(232,234,228,0.85)';
          ctx.lineWidth = 0.7 * k;
          ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
          ctx.fillStyle = '#cba94e';
          for (var pi = 0; pi < n; pi++) {
            var pxx = -bw / 2 + pitch * pi + pitch * 0.25;
            ctx.fillRect(pxx, -bh / 2 - 2.6 * k, pitch * 0.5, 3.4 * k);
            ctx.fillRect(pxx, bh / 2 - 0.8 * k, pitch * 0.5, 3.4 * k);
          }
          /* pin-1 dot */
          ctx.fillStyle = 'rgba(232,234,228,0.9)';
          ctx.beginPath();
          ctx.arc(-bw / 2 + 1.8 * k, -bh / 2 + 1.8 * k, 0.9 * k, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind < 0.88) {
          /* electrolytic cap outline with polarity band */
          var r = 5.5 * k;
          ctx.strokeStyle = 'rgba(232,234,228,0.8)';
          ctx.lineWidth = 0.7 * k;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(232,234,228,0.55)';
          ctx.beginPath();
          ctx.arc(0, 0, r, Math.PI * 0.6, Math.PI * 1.4);
          ctx.lineTo(0, 0); ctx.fill();
          ctx.fillStyle = '#cba94e';
          ctx.beginPath(); ctx.arc(-r * 0.45, 0, 1.3 * k, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.45, 0, 1.3 * k, 0, Math.PI * 2); ctx.fill();
        } else {
          /* header: a row of square pads */
          var hn = 3 + ((r3() * 5) | 0);
          ctx.fillStyle = '#cba94e';
          for (var hi = 0; hi < hn; hi++) {
            ctx.fillRect(hi * 4 * k - hn * 2 * k, -1.8 * k, 2.6 * k, 3.6 * k);
          }
          ctx.strokeStyle = 'rgba(232,234,228,0.7)';
          ctx.lineWidth = 0.6 * k;
          ctx.strokeRect(-hn * 2 * k - 1.2 * k, -3.4 * k,
            hn * 4 * k + 2.4 * k, 6.8 * k);
        }
        ctx.restore();

        /* reference designator */
        ctx.fillStyle = 'rgba(228,232,224,0.8)';
        ctx.font = Math.max(5, 6.4 * k) + 'px monospace';
        ctx.fillText(REF[(r3() * REF.length) | 0] + (1 + ((r3() * 60) | 0)),
          x + 7 * k, y + 9 * k);
      }
    });

    /* silkscreen board markings */
    layer(function () {
      ctx.strokeStyle = 'rgba(226,230,222,0.5)';
      ctx.lineWidth = 0.8 * k;
      ctx.strokeRect(3 * k, 3 * k, w - 6 * k, h - 6 * k);
      ctx.fillStyle = 'rgba(226,230,222,0.55)';
      ctx.font = Math.max(6, 7.5 * k) + 'px monospace';
      ctx.fillText('REV 1.2', 8 * k, 14 * k);
      ctx.fillText('MADE IN TAIWAN', 8 * k, h - 8 * k);
    });

    /* solder mask gloss + slight vignette */
    modulate(ctx, w, h, function (x, y, u, v) {
      return 0.95 + (nz(u, v, 60, 60, 2, seed + 21) * 0.5 + 0.5) * 0.12;
    });
    grain(ctx, w, h, 0.02, seed);
  });

  def('silicon', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 199 : o.seed;
    var base = hex2rgb(o.tint || '#3b3f5c');
    ctx.fillStyle = rgbCss(base[0], base[1], base[2]);
    ctx.fillRect(0, 0, w, h);
    var rnd = util.rng(seed);
    var k = w / 256;

    /* functional blocks — a die photo is a city seen from orbit */
    for (var i = 0; i < 34; i++) {
      var bx = Math.floor(rnd() * 16) * (w / 16);
      var by = Math.floor(rnd() * 16) * (h / 16);
      var bw = (1 + (rnd() * 5 | 0)) * (w / 16);
      var bh = (1 + (rnd() * 5 | 0)) * (h / 16);
      var tone = 0.7 + rnd() * 0.75;
      ctx.fillStyle = rgbCss(base[0] * tone + 26, base[1] * tone + 24, base[2] * tone + 38);
      ctx.fillRect(bx, by, bw, bh);
      /* regular internal structure: SRAM-like striping */
      ctx.fillStyle = 'rgba(180,190,235,0.10)';
      var step = (rnd() < 0.5 ? 2 : 3) * k;
      for (var s = 0; s < bw; s += step * 2) ctx.fillRect(bx + s, by, step, bh);
      ctx.strokeStyle = 'rgba(200,210,255,0.22)';
      ctx.lineWidth = 0.8 * k;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
    /* top metal power grid */
    ctx.strokeStyle = 'rgba(215,220,240,0.20)';
    ctx.lineWidth = 1.6 * k;
    for (var g = 0; g < w; g += 16 * k) {
      ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(w, g); ctx.stroke();
    }
    /* iridescent sheen */
    modulate(ctx, w, h, function (x, y, u, v) {
      var n = nz(u, v, 4, 4, 3, seed + 3);
      return [1 + n * 0.10, 1 + n * 0.05, 1 - n * 0.06];
    });
    grain(ctx, w, h, 0.02, seed);
  });

  def('keycapSet', { w: 512, h: 192 }, function (ctx, w, h, o) {
    var beige = o.tint || '#cfc7b2';
    var dark = o.dark || '#3a3a3c';
    var legend = o.legend || '#4a4438';
    var isDark = !!o.dark;
    ctx.fillStyle = isDark ? '#1e1f21' : '#b9b1a0';
    ctx.fillRect(0, 0, w, h);

    var ROWS = [
      ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
      ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Back'],
      ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
      ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
      ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
      ['Ctrl', 'Alt', '', 'Alt', 'Ctrl']
    ];
    var pad = h * 0.03;
    var rowH = (h - pad * 2) / ROWS.length;

    for (var r = 0; r < ROWS.length; r++) {
      var keys = ROWS[r];
      var total = 0, wide = [];
      for (var i = 0; i < keys.length; i++) {
        var ww = keys[i].length > 2 ? 1.7 : 1;
        if (keys[i] === '') ww = 6;
        wide.push(ww); total += ww;
      }
      var unit = (w - pad * 2) / total;
      var x = pad;
      var y = pad + r * rowH;
      for (var kI = 0; kI < keys.length; kI++) {
        var kw = wide[kI] * unit - 1.5;
        var kh = rowH - 1.5;
        /* keycap body with a top-lit bevel */
        var g = ctx.createLinearGradient(x, y, x, y + kh);
        var top = isDark ? '#4a4b4f' : '#e0d8c4';
        var bot = isDark ? '#232427' : beige;
        g.addColorStop(0, top);
        g.addColorStop(0.35, isDark ? dark : beige);
        g.addColorStop(1, bot);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, kw, kh);
        ctx.strokeStyle = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(120,112,96,0.65)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
        /* dished top */
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + kw * 0.12, y + kh * 0.14, kw * 0.76, kh * 0.5);
        /* legend */
        if (keys[kI]) {
          ctx.fillStyle = isDark ? '#d6d2c8' : legend;
          ctx.font = (keys[kI].length > 2 ? kh * 0.30 : kh * 0.44) +
            'px Helvetica, Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(keys[kI], x + kw * 0.17, y + kh * 0.55);
        }
        /* homing bumps */
        if (keys[kI] === 'F' || keys[kI] === 'J') {
          ctx.fillStyle = 'rgba(90,84,72,0.55)';
          ctx.fillRect(x + kw * 0.3, y + kh * 0.82, kw * 0.4, 1.5);
        }
        x += wide[kI] * unit;
      }
    }
    /* years of finger grease on the home row */
    modulate(ctx, w, h, function (x2, y2, u, v) {
      var shine = Math.exp(-Math.pow((v - 0.62) * 5, 2)) * 0.10;
      return 1 - shine + nz(u, v, 30, 12, 2, 211) * 0.03;
    });
    grain(ctx, w, h, 0.02, 211);
  }, { clamp: true });

  /* ================================================================== */
  /* 7. Screens                                                          */
  /* ================================================================== */

  function scanlines(ctx, w, h, step, strength) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,' + strength + ')';
    for (var y = 0; y < h; y += step) ctx.fillRect(0, y, w, Math.max(1, step * 0.5));
    ctx.restore();
  }

  function phosphorTriads(ctx, w, h, cell, strength) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var third = cell / 3;
    for (var x = 0; x < w; x += cell) {
      ctx.fillStyle = 'rgba(255,' + (255 - strength) + ',' + (255 - strength) + ',1)';
      ctx.fillRect(x, 0, third, h);
      ctx.fillStyle = 'rgba(' + (255 - strength) + ',255,' + (255 - strength) + ',1)';
      ctx.fillRect(x + third, 0, third, h);
      ctx.fillStyle = 'rgba(' + (255 - strength) + ',' + (255 - strength) + ',255,1)';
      ctx.fillRect(x + third * 2, 0, third, h);
    }
    ctx.restore();
  }

  function crtVignette(ctx, w, h, amount) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25,
      w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.72, 'rgba(' + (255 - amount * 40) + ',' + (255 - amount * 40) +
      ',' + (255 - amount * 40) + ',1)');
    g.addColorStop(1, 'rgba(' + (255 - amount * 190) + ',' + (255 - amount * 190) +
      ',' + (255 - amount * 190) + ',1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    /* glass edge highlight */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g2 = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.55);
    g2.addColorStop(0, 'rgba(120,140,160,0.16)');
    g2.addColorStop(0.5, 'rgba(120,140,160,0.02)');
    g2.addColorStop(1, 'rgba(120,140,160,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  var CRT_DEFAULT = [
    'STEVE.SYS  v1.02   64K OK',
    '',
    'THE BENCH',
    'A cluttered workbench. A grey cat is',
    'asleep on the power supply. Exits:',
    'NORTH (counter), EAST (back room).',
    '',
    '> PET CAT',
    'The cat does not move. You feel',
    'trusted.',
    '',
    '> _'
  ];

  /* Draws phosphor text into an already-black screen rect. */
  function crtText(ctx, w, h, lines, colorHex, fontPx, pad) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fontPx + 'px "Courier New", monospace';
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = fontPx * 0.55;
    ctx.fillStyle = colorHex;
    var lh = fontPx * 1.35;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var y = pad + i * lh;
      if (y > h - pad * 0.5) break;
      ctx.fillText(lines[i], pad, y);
    }
    ctx.restore();
  }

  def('screenCRT', 512, function (ctx, w, h, o) {
    var lines = o.lines || CRT_DEFAULT;
    var col = o.color || '#7dffb0';
    var bg = o.bg || '#04120a';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* faint phosphor afterglow wash */
    var g0 = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.7);
    g0.addColorStop(0, 'rgba(30,90,55,0.35)');
    g0.addColorStop(1, 'rgba(6,24,14,0)');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, w, h);

    var fontPx = Math.max(8, w * (o.fontScale || 0.036));
    crtText(ctx, w, h, lines, col, fontPx, w * 0.06);

    /* blinking cursor block */
    if (o.cursor !== false) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      var lh = fontPx * 1.35;
      ctx.fillRect(w * 0.06 + fontPx * 1.3, w * 0.06 + (lines.length - 1) * lh,
        fontPx * 0.6, fontPx);
      ctx.globalAlpha = 1;
    }

    scanlines(ctx, w, h, Math.max(2, w / 160), 0.34);
    phosphorTriads(ctx, w, h, Math.max(3, w / 150), 46);
    crtVignette(ctx, w, h, 1);
    grain(ctx, w, h, 0.03, 223);
  }, { clamp: true, anisotropy: 2 });

  def('screenTerminal', 512, function (ctx, w, h, o) {
    var col = o.color || '#ffb347';
    var lines = o.lines || [
      'MERIDIAN GRAND — BUILDING SERVICES',
      'node hvac-04 .......... OK',
      'node lift-a  .......... OK',
      'node lift-b  .......... OK',
      'node vault   .......... LOCKED',
      'node cctv-7  .......... OK',
      '',
      'auth: T.BECKETT (contractor)',
      'session expires 04:12',
      '',
      '$ ls /mnt/halcyon',
      'ledger.db  keys.d  audit.log',
      '$ _'
    ];
    ctx.fillStyle = o.bg || '#0a0704';
    ctx.fillRect(0, 0, w, h);
    var fontPx = Math.max(8, w * 0.032);
    crtText(ctx, w, h, lines, col, fontPx, w * 0.05);
    scanlines(ctx, w, h, Math.max(2, w / 200), 0.18);
    crtVignette(ctx, w, h, 0.6);
    grain(ctx, w, h, 0.02, 227);
  }, { clamp: true, anisotropy: 2 });

  def('screenLCD', 512, function (ctx, w, h, o) {
    var accent = o.color || '#39d98a';
    ctx.fillStyle = o.bg || '#0d1116';
    ctx.fillRect(0, 0, w, h);

    /* title bar */
    ctx.fillStyle = '#182029';
    ctx.fillRect(0, 0, w, h * 0.09);
    ctx.fillStyle = accent;
    ctx.fillRect(0, h * 0.09 - 2, w, 2);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = (h * 0.045) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.title || 'SYSTEM DIAGNOSTIC', w * 0.03, h * 0.048);
    ctx.fillStyle = '#5b6672';
    ctx.fillText('— □ ×', w * 0.86, h * 0.048);

    /* a live-looking graph */
    var gx = w * 0.05, gy = h * 0.18, gw = w * 0.56, gh = h * 0.42;
    ctx.strokeStyle = '#212b35';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + gh * i / 6); ctx.lineTo(gx + gw, gy + gh * i / 6);
      ctx.stroke();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.4, w / 340);
    ctx.beginPath();
    for (var s = 0; s <= 60; s++) {
      var t = s / 60;
      var vv = 0.5 + util.fbm2(t * 6 + (o.phase || 0), 3.7, 4) * 0.42;
      var px = gx + gw * t, py = gy + gh * (1 - vv);
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(57,217,138,0.12)';
    ctx.lineTo(gx + gw, gy + gh); ctx.lineTo(gx, gy + gh); ctx.closePath(); ctx.fill();

    /* side readout */
    ctx.font = (h * 0.038) + 'px "Courier New", monospace';
    var rows = o.lines || [
      'CPU   42 C', 'SYS   31 C', 'FAN1 1840', 'FAN2 1210',
      '+12V  11.94', '+5V    5.02', '+3V3   3.31', 'MEM  128M'
    ];
    for (var r = 0; r < rows.length; r++) {
      ctx.fillStyle = r % 2 ? '#8b98a4' : '#c6d0d9';
      ctx.fillText(rows[r], w * 0.66, gy + h * 0.04 + r * h * 0.055);
    }

    /* status strip */
    ctx.fillStyle = '#151c23';
    ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.fillStyle = accent;
    ctx.font = (h * 0.04) + 'px "Courier New", monospace';
    ctx.fillText(o.status || 'ALL SENSORS NOMINAL', w * 0.03, h * 0.94);

    /* LCD subpixel grid + backlight unevenness */
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var cell = Math.max(3, w / 190);
    for (var x = 0; x < w; x += cell) {
      ctx.fillStyle = 'rgba(240,240,240,1)';
      ctx.fillRect(x + cell - 1, 0, 1, h);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bl = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.75);
    bl.addColorStop(0, 'rgba(120,140,170,0.10)');
    bl.addColorStop(1, 'rgba(120,140,170,0)');
    ctx.fillStyle = bl; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    grain(ctx, w, h, 0.012, 229);
  }, { clamp: true, anisotropy: 2 });

  /* Animated screen surface for monitors that need to change. */
  tex.screen = function (drawFn, w, h) {
    w = SG.qpick((w || 512) >> 1, w || 512, w || 512);
    h = SG.qpick((h || 384) >> 1, h || 384, h || 384);
    var c = mkCanvas(w, h);
    var ctx2 = c.getContext('2d');
    var t = wrapTex(c, { clamp: true, anisotropy: 2 });
    t.name = 'tex:screen';
    var api = {
      texture: t, canvas: c, ctx: ctx2, w: w, h: h, time: 0,
      update: function (time) {
        api.time = time === undefined ? util.now() : time;
        try { drawFn(ctx2, w, h, api.time); } catch (e) { /* a dead screen is fine */ }
        t.needsUpdate = true;
        return api;
      },
      dispose: function () { t.dispose(); }
    };
    /* Handy for callers: the CRT look, applied over whatever they drew. */
    api.crtPass = function (strength) {
      var s = strength === undefined ? 1 : strength;
      scanlines(ctx2, w, h, Math.max(2, w / 160), 0.30 * s);
      crtVignette(ctx2, w, h, s);
    };
    api.update(0);
    return api;
  };

  /* ================================================================== */
  /* 8. Text, posters, signs, labels                                     */
  /* ================================================================== */

  function measureTracked(ctx, s, ls) {
    var wpx = ctx.measureText(s).width;
    if (ls) wpx += ls * Math.max(0, s.length - 1);
    return wpx;
  }

  function drawTracked(ctx, s, x, y, ls, stroke) {
    if (!ls) {
      if (stroke) ctx.strokeText(s, x, y); else ctx.fillText(s, x, y);
      return;
    }
    var cx = x;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (stroke) ctx.strokeText(ch, cx, y); else ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + ls;
    }
  }

  function wrapText(ctx, str, maxW, ls) {
    var out = [];
    var paras = String(str).split('\n');
    for (var p = 0; p < paras.length; p++) {
      var words = paras[p].split(/\s+/);
      var clean = [];
      for (var wi = 0; wi < words.length; wi++) if (words[wi]) clean.push(words[wi]);
      if (!clean.length) { out.push(''); continue; }
      var line = clean[0];
      for (var i = 1; i < clean.length; i++) {
        var test = line + ' ' + clean[i];
        if (measureTracked(ctx, test, ls) <= maxW) line = test;
        else { out.push(line); line = clean[i]; }
      }
      out.push(line);
    }
    return out;
  }

  var textCache = {};
  var textCacheN = 0;

  /* The workhorse: transparent text on a canvas, word-wrapped, tracked,
   * optionally stroked and rotated. Used by every label and sign. */
  tex.text = function (str, opts) {
    opts = opts || {};
    var ck = null;
    if (textCacheN < 240) {
      ck = String(str) + '|' + stable(opts);
      if (textCache[ck]) return textCache[ck];
    }

    var w = SG.qpick((opts.w || 512) >> 1, opts.w || 512, opts.w || 512);
    var h = SG.qpick((opts.h || 256) >> 1, opts.h || 256, opts.h || 256);
    var c = mkCanvas(w, h);
    var ctx = c.getContext('2d');

    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, w, h); }
    else ctx.clearRect(0, 0, w, h);

    var pad = opts.pad === undefined ? Math.round(w * 0.05) : opts.pad;
    var family = opts.font || '"Helvetica Neue", Helvetica, Arial, sans-serif';
    var weight = opts.weight || '700';
    var maxW = w - pad * 2;
    var maxH = h - pad * 2;
    var size = opts.size || Math.round(h * 0.28);
    var ls = opts.letterSpacing || 0;
    var lhK = opts.lineHeight || 1.2;

    var source = opts.lines ? opts.lines.join('\n') : String(str === undefined ? '' : str);

    var lines, tries = 0;
    while (true) {
      ctx.font = weight + ' ' + size + 'px ' + family;
      lines = opts.wrap === false ? source.split('\n') : wrapText(ctx, source, maxW, ls);
      var widest = 0;
      for (var i = 0; i < lines.length; i++) {
        widest = Math.max(widest, measureTracked(ctx, lines[i], ls));
      }
      var totalH = lines.length * size * lhK;
      if (opts.fit === false) break;
      if ((widest <= maxW && totalH <= maxH) || size <= 6 || tries > 40) break;
      size = Math.max(6, Math.floor(size * 0.92));
      tries++;
    }

    ctx.save();
    if (opts.rotate) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(opts.rotate);
      ctx.translate(-w / 2, -h / 2);
    }

    ctx.font = weight + ' ' + size + 'px ' + family;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    var lineH = size * lhK;
    var blockH = lines.length * lineH;
    var vAlign = opts.valign || 'middle';
    var y0 = vAlign === 'top' ? pad
      : (vAlign === 'bottom' ? h - pad - blockH : (h - blockH) / 2);

    var align = opts.align || 'center';
    var col = opts.color || '#ffffff';

    if (opts.shadow) {
      ctx.shadowColor = opts.shadow.color || 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = opts.shadow.blur === undefined ? size * 0.25 : opts.shadow.blur;
      ctx.shadowOffsetY = opts.shadow.offsetY || 0;
    }
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = size * 0.6;
    }

    for (var li = 0; li < lines.length; li++) {
      var lw = measureTracked(ctx, lines[li], ls);
      var x = pad;
      if (align === 'center') x = (w - lw) / 2;
      else if (align === 'right') x = w - pad - lw;
      var y = y0 + li * lineH;

      if (opts.stroke) {
        ctx.strokeStyle = opts.stroke.color || '#000000';
        ctx.lineWidth = opts.stroke.width === undefined ? size * 0.12 : opts.stroke.width;
        ctx.lineJoin = 'round';
        drawTracked(ctx, lines[li], x, y, ls, true);
      }
      ctx.fillStyle = col;
      drawTracked(ctx, lines[li], x, y, ls, false);
    }
    ctx.restore();

    var t = wrapTex(c, { clamp: true });
    t.name = 'tex:text';
    if (ck) { textCache[ck] = t; textCacheN++; }
    return t;
  };

  /* ---- posters -------------------------------------------------------- */

  function ageAndTape(ctx, w, h, seed, bleach) {
    /* sun bleaching from one corner */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createLinearGradient(0, 0, w, h * 0.6);
    g.addColorStop(0, 'rgba(255,246,222,' + (0.20 * bleach).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,246,222,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    /* uneven yellowing + foxing spots */
    modulate(ctx, w, h, function (x, y, u, v) {
      var n = nz(u, v, 5, 5, 3, seed) * 0.5 + 0.5;
      var fox = wor(u, v, 16, 16, seed + 4);
      var k = 1 - (1 - n) * 0.09;
      if (fox < 0.10) k *= 0.90 + fox;
      return [k, k * 0.995, k * 0.965];
    });
    /* tape at the top corners */
    ctx.fillStyle = 'rgba(226,220,196,0.42)';
    ctx.save();
    ctx.translate(w * 0.10, h * 0.045); ctx.rotate(-0.5);
    ctx.fillRect(-w * 0.07, -h * 0.016, w * 0.14, h * 0.032);
    ctx.restore();
    ctx.save();
    ctx.translate(w * 0.90, h * 0.045); ctx.rotate(0.5);
    ctx.fillRect(-w * 0.07, -h * 0.016, w * 0.14, h * 0.032);
    ctx.restore();
    grain(ctx, w, h, 0.02, seed + 1);
  }

  def('posterA', { w: 512, h: 512 }, function (ctx, w, h, o) {
    /* Shop poster: type-led, cream stock, one accent */
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b4472e';
    ctx.fillRect(0, 0, w, h * 0.055);
    ctx.fillRect(0, h * 0.945, w, h * 0.055);

    ctx.fillStyle = '#22262b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (h * 0.115) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('WE FIX', w / 2, h * 0.24);
    ctx.fillText('WHAT OTHERS', w / 2, h * 0.37);
    ctx.fillStyle = '#b4472e';
    ctx.fillText('REPLACE', w / 2, h * 0.50);

    ctx.strokeStyle = '#22262b';
    ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.585); ctx.lineTo(w * 0.82, h * 0.585); ctx.stroke();

    /* a screwdriver, drawn flat */
    ctx.save();
    ctx.translate(w * 0.5, h * 0.71);
    ctx.rotate(-0.32);
    ctx.fillStyle = '#22262b';
    ctx.fillRect(-w * 0.20, -h * 0.022, w * 0.16, h * 0.044);
    ctx.fillStyle = '#8d949b';
    ctx.fillRect(-w * 0.04, -h * 0.009, w * 0.20, h * 0.018);
    ctx.fillRect(w * 0.16, -h * 0.014, w * 0.035, h * 0.028);
    ctx.restore();

    ctx.fillStyle = '#4a4f55';
    ctx.font = '400 ' + (h * 0.042) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('HARDWARE · DATA RECOVERY · NO APPOINTMENT', w / 2, h * 0.86);
    ctx.font = '400 ' + (h * 0.034) + 'px "Courier New", monospace';
    ctx.fillText('UNIT 4, ORCHARD BUSINESS PARK', w / 2, h * 0.905);

    ageAndTape(ctx, w, h, 233, o.bleach === undefined ? 0.8 : o.bleach);
  }, { clamp: true });

  def('posterB', { w: 512, h: 512 }, function (ctx, w, h, o) {
    /* A 1998 hardware advert, faded */
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b3d7a');
    g.addColorStop(1, '#0d1c3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* the obligatory perspective grid */
    ctx.strokeStyle = 'rgba(90,160,240,0.28)';
    ctx.lineWidth = 1;
    for (var i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5 + i * w * 0.06, h * 0.62);
      ctx.lineTo(w * 0.5 + i * w * 0.30, h);
      ctx.stroke();
    }
    for (var r = 0; r < 8; r++) {
      var yy = h * 0.62 + Math.pow(r / 8, 2.1) * h * 0.38;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd84d';
    ctx.font = '700 ' + (h * 0.14) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('PENTIUM II', w / 2, h * 0.17);
    ctx.fillStyle = '#e8eef8';
    ctx.font = '700 ' + (h * 0.075) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('400 MHz', w / 2, h * 0.29);
    ctx.font = '400 ' + (h * 0.05) + 'px "Courier New", monospace';
    ctx.fillText('128 MB SDRAM · 8.4 GB HDD', w / 2, h * 0.38);
    ctx.fillText('32× CD-ROM · 56K MODEM', w / 2, h * 0.44);

    /* starburst price */
    ctx.save();
    ctx.translate(w * 0.5, h * 0.60);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#d92f2f';
    ctx.beginPath();
    for (var s = 0; s < 24; s++) {
      var a = s / 24 * Math.PI * 2;
      var rad = (s % 2 ? 0.11 : 0.16) * h;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.font = '700 ' + (h * 0.062) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('$1,299', 0, 0);
    ctx.restore();

    ctx.fillStyle = 'rgba(200,216,240,0.75)';
    ctx.font = '400 ' + (h * 0.03) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('MONITOR SOLD SEPARATELY. WHILE STOCKS LAST.', w / 2, h * 0.93);

    ageAndTape(ctx, w, h, 239, o.bleach === undefined ? 1.0 : o.bleach);
  }, { clamp: true });

  def('posterC', { w: 512, h: 512 }, function (ctx, w, h, o) {
    /* Travel poster — Prague, duotone, hangs in the hotel */
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f0d9a8');
    g.addColorStop(0.55, '#e0b9a7');
    g.addColorStop(1, '#8f5b4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* sun */
    ctx.fillStyle = 'rgba(255,236,196,0.85)';
    ctx.beginPath(); ctx.arc(w * 0.66, h * 0.30, h * 0.11, 0, Math.PI * 2); ctx.fill();

    /* skyline silhouette with spires */
    ctx.fillStyle = '#4a2b33';
    ctx.beginPath();
    ctx.moveTo(0, h);
    var xs = 0;
    var rnd = util.rng(241);
    while (xs < w) {
      var bw = w * (0.04 + rnd() * 0.07);
      var bh = h * (0.10 + rnd() * 0.22);
      ctx.lineTo(xs, h - bh);
      ctx.lineTo(xs + bw, h - bh);
      /* the odd spire */
      if (rnd() < 0.28) {
        ctx.lineTo(xs + bw, h - bh);
        ctx.lineTo(xs + bw * 0.5 + bw, h - bh - h * 0.16);
        ctx.lineTo(xs + bw + 1, h - bh);
      }
      xs += bw;
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    /* bridge arches */
    ctx.fillStyle = '#3a2028';
    ctx.fillRect(0, h * 0.80, w, h * 0.05);
    for (var a = 0; a < 6; a++) {
      ctx.beginPath();
      ctx.arc(w * (a + 0.5) / 6, h * 0.85, w * 0.06, Math.PI, 0, true);
      ctx.fill();
    }
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a2028';
    ctx.font = '700 ' + (h * 0.17) + 'px Georgia, "Times New Roman", serif';
    ctx.fillText('PRAHA', w / 2, h * 0.14);
    ctx.font = '400 ' + (h * 0.045) + 'px Georgia, "Times New Roman", serif';
    ctx.fillText('THE CITY OF A HUNDRED SPIRES', w / 2, h * 0.235);

    ageAndTape(ctx, w, h, 251, o.bleach === undefined ? 0.6 : o.bleach);
  }, { clamp: true });

  /* ---- signs ---------------------------------------------------------- */

  def('signShop', { w: 512, h: 256 }, function (ctx, w, h, o) {
    ctx.fillStyle = o.bg || '#0b0d10';
    ctx.fillRect(0, 0, w, h);
    /* backing panel edge */
    ctx.strokeStyle = '#2b3138';
    ctx.lineWidth = Math.max(2, h * 0.03);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2,
      w - ctx.lineWidth, h - ctx.lineWidth);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var neon = o.color || '#ff5f4d';
    ctx.shadowColor = neon;
    ctx.shadowBlur = h * 0.14;
    ctx.fillStyle = '#fff0e6';
    ctx.font = '700 ' + (h * 0.30) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText("STEVE'S", w / 2, h * 0.32);
    ctx.fillText('PC REPAIR', w / 2, h * 0.62);

    /* neon tube outline behind the letters */
    ctx.shadowBlur = h * 0.22;
    ctx.strokeStyle = neon;
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.strokeText("STEVE'S", w / 2, h * 0.32);
    ctx.strokeText('PC REPAIR', w / 2, h * 0.62);

    ctx.shadowBlur = h * 0.08;
    ctx.shadowColor = '#4ad0ff';
    ctx.fillStyle = '#d6f4ff';
    ctx.font = '400 ' + (h * 0.085) + 'px "Courier New", monospace';
    ctx.fillText('HARDWARE  ·  DATA  ·  OPEN', w / 2, h * 0.87);
    ctx.shadowBlur = 0;
    grain(ctx, w, h, 0.02, 257);
  }, { clamp: true });

  def('signHotel', { w: 512, h: 256 }, function (ctx, w, h, o) {
    /* brushed brass plate */
    var base = hex2rgb(o.tint || '#c8a860');
    fill(ctx, w, h, function (x, y, out, u, v) {
      var s = nz(u, v, 3, 200, 2, 263);
      var k = 1 + s * 0.09 + nz(u, v, 40, 40, 2, 269) * 0.04;
      out[0] = base[0] * k; out[1] = base[1] * k; out[2] = base[2] * k;
    });
    /* soft directional sheen */
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,246,214,0.30)');
    g.addColorStop(0.45, 'rgba(255,246,214,0.02)');
    g.addColorStop(1, 'rgba(90,66,20,0.20)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(48,34,12,0.92)';
    ctx.font = '400 ' + (h * 0.21) + 'px Georgia, "Times New Roman", serif';
    /* engraved: dark fill with a light lower edge */
    ctx.fillText('MERIDIAN GRAND', w / 2, h * 0.42);
    ctx.fillStyle = 'rgba(255,246,214,0.35)';
    ctx.fillText('MERIDIAN GRAND', w / 2, h * 0.42 + Math.max(1, h * 0.008));

    ctx.strokeStyle = 'rgba(48,34,12,0.55)';
    ctx.lineWidth = Math.max(1, h * 0.008);
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.60); ctx.lineTo(w * 0.78, h * 0.60); ctx.stroke();

    ctx.fillStyle = 'rgba(48,34,12,0.8)';
    ctx.font = '400 ' + (h * 0.075) + 'px Georgia, "Times New Roman", serif';
    ctx.fillText('P R A H A   ·   E S T .  1 9 3 1', w / 2, h * 0.74);

    /* bezel */
    ctx.strokeStyle = 'rgba(60,44,16,0.5)';
    ctx.lineWidth = Math.max(2, h * 0.025);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    grain(ctx, w, h, 0.015, 271);
  }, { clamp: true });

  def('labelPart', { w: 512, h: 256 }, function (ctx, w, h, o) {
    ctx.fillStyle = o.bg || '#eeece4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b9b5a9';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    var rnd = util.rng(o.seed === undefined ? 277 : o.seed);
    ctx.fillStyle = '#1d2126';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    ctx.font = '700 ' + (h * 0.13) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(o.title || 'ORION MICRO', w * 0.045, h * 0.07);

    ctx.font = '400 ' + (h * 0.072) + 'px "Courier New", monospace';
    ctx.fillText('P/N  ' + (o.pn || '08K3363-A2'), w * 0.045, h * 0.27);
    ctx.fillText('S/N  ' + (o.sn || ('44' + (1000 + ((rnd() * 8999) | 0)) + '-KX')),
      w * 0.045, h * 0.38);
    ctx.fillText(o.spec || 'DC 12V 1.5A   MADE IN TAIWAN', w * 0.045, h * 0.49);

    /* barcode */
    var bx = w * 0.045, by = h * 0.62, bw = w * 0.62, bh = h * 0.24;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#101316';
    var x = bx + 3;
    while (x < bx + bw - 4) {
      var barW = 1 + ((rnd() * 3) | 0);
      ctx.fillRect(x, by, barW, bh * 0.82);
      x += barW + 1 + ((rnd() * 3) | 0);
    }
    ctx.font = '400 ' + (h * 0.055) + 'px "Courier New", monospace';
    ctx.fillText(o.pn || '08K3363A2', bx + 3, by + bh * 0.84);

    /* certification blob */
    ctx.strokeStyle = '#1d2126';
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.strokeRect(w * 0.72, h * 0.60, w * 0.22, h * 0.28);
    ctx.font = '700 ' + (h * 0.13) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#1d2126';
    ctx.fillText('CE', w * 0.755, h * 0.66);

    /* it has been handled */
    modulate(ctx, w, h, function (x2, y2, u, v) {
      return 0.97 + (nz(u, v, 20, 20, 3, 281) * 0.5 + 0.5) * 0.06;
    });
    grain(ctx, w, h, 0.015, 283);
  }, { clamp: true });

  /* ================================================================== */
  /* 9. Sky, city, particles, overlays                                   */
  /* ================================================================== */

  def('skyGradient', { w: 16, h: 256 }, function (ctx, w, h, o) {
    var stops = o.stops || [
      [0.00, '#0a1220'], [0.32, '#1d3050'], [0.55, '#4a5f7d'],
      [0.78, '#9aa4a8'], [0.92, '#d7bb92'], [1.00, '#e8cba4']
    ];
    var g = ctx.createLinearGradient(0, 0, 0, h);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 0.008, 293);
  }, { clamp: true, anisotropy: 1 });

  def('nightCity', { w: 512, h: 128 }, function (ctx, w, h, o) {
    /* Emissive skyline strip: the view from the plane and the hotel window.
     * 512x128 = the same pixel budget as a 256 square. Tiles horizontally. */
    var seed = o.seed === undefined ? 307 : o.seed;
    var rnd = util.rng(seed);

    /* sky + warm horizon haze */
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#05070f');
    g.addColorStop(0.45, '#0a1020');
    g.addColorStop(0.78, '#1d2233');
    g.addColorStop(0.93, '#4a3a34');
    g.addColorStop(1.00, '#6b4c33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* light-pollution glow blobs behind the skyline */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var b = 0; b < 7; b++) {
      var gx = rnd() * w, gy = h * (0.72 + rnd() * 0.2);
      var gr = h * (0.3 + rnd() * 0.5);
      var gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, 'rgba(255,190,120,0.22)');
      gg.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    ctx.restore();

    /* a few stars up top */
    for (var s = 0; s < 60; s++) {
      var a = 0.15 + rnd() * 0.5;
      ctx.fillStyle = 'rgba(220,230,255,' + a.toFixed(3) + ')';
      ctx.fillRect(rnd() * w, rnd() * h * 0.5, 1, 1);
    }

    /* buildings, back layer then front layer */
    function skyline(baseY, minH, maxH, col, winAlpha, step) {
      var x = -20;
      while (x < w + 20) {
        var bw = step * (0.6 + rnd() * 1.0);
        var bh = minH + rnd() * (maxH - minH);
        var top = baseY - bh;
        ctx.fillStyle = col;
        ctx.fillRect(x, top, bw, baseY - top);
        /* roof furniture */
        if (rnd() < 0.35) {
          ctx.fillRect(x + bw * 0.3, top - h * 0.05, bw * 0.18, h * 0.05);
        }
        /* lit windows */
        var cols = Math.max(1, Math.floor(bw / (h * 0.055)));
        var rows = Math.max(1, Math.floor(bh / (h * 0.075)));
        for (var cI = 0; cI < cols; cI++) {
          for (var rI = 0; rI < rows; rI++) {
            if (rnd() > winAlpha) continue;
            var wx = x + (cI + 0.32) * (bw / cols);
            var wy = top + (rI + 0.35) * (bh / rows);
            var warm = rnd();
            ctx.fillStyle = warm < 0.72
              ? 'rgba(255,214,140,' + (0.5 + rnd() * 0.5).toFixed(2) + ')'
              : (warm < 0.92
                ? 'rgba(190,225,255,' + (0.35 + rnd() * 0.45).toFixed(2) + ')'
                : 'rgba(255,255,235,0.95)');
            ctx.fillRect(wx, wy, Math.max(1, bw / cols * 0.4),
              Math.max(1, bh / rows * 0.38));
          }
        }
        /* the odd red aircraft-warning light */
        if (rnd() < 0.12) {
          ctx.fillStyle = 'rgba(255,70,60,0.9)';
          ctx.fillRect(x + bw * 0.45, top - 2, 2, 2);
        }
        x += bw + step * 0.12;
      }
    }

    skyline(h * 0.97, h * 0.18, h * 0.45, '#0d121c', 0.20, h * 0.16);
    skyline(h, h * 0.25, h * 0.72, '#070a11', 0.30, h * 0.22);

    /* street-level warmth */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createLinearGradient(0, h * 0.88, 0, h);
    sg.addColorStop(0, 'rgba(255,168,90,0)');
    sg.addColorStop(1, 'rgba(255,168,90,0.35)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.restore();
  }, { anisotropy: 2 });

  def('cloudSprite', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 311 : o.seed;
    var col = hex2rgb(o.tint || '#e8eef6');
    fill(ctx, w, h, function (x, y, out, u, v) {
      var dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
      var d = Math.sqrt(dx * dx + dy * dy);
      var n = nz(u, v, 4, 4, 4, seed) * 0.5 + 0.5;
      var n2 = nz(u, v, 10, 10, 3, seed + 3) * 0.5 + 0.5;
      var a = util.clamp((1 - d) * 1.6, 0, 1);
      a = Math.pow(a, 1.6) * (0.45 + n * 0.75) * (0.6 + n2 * 0.6);
      var lit = 0.82 + (1 - v) * 0.22 + n * 0.1;
      out[0] = col[0] * lit; out[1] = col[1] * lit; out[2] = col[2] * lit;
      out[3] = util.clamp(a, 0, 1) * 255;
    });
  }, { clamp: true });

  def('particleSoft', 64, function (ctx, w, h, o) {
    var col = o.tint || '#ffffff';
    var c = hex2rgb(col);
    fill(ctx, w, h, function (x, y, out, u, v) {
      var dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
      var d = Math.sqrt(dx * dx + dy * dy);
      var a = util.clamp(1 - d, 0, 1);
      a = Math.pow(a, 2.2);
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      out[3] = a * 255;
    });
  }, { clamp: true, anisotropy: 1 });

  /* ---- overlays other modules layer on top of props ------------------- */

  def('dust', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 313 : o.seed;
    var col = hex2rgb(o.tint || '#cfcabb');
    var amt = o.amount === undefined ? 1 : o.amount;
    fill(ctx, w, h, function (x, y, out, u, v) {
      var big = nz(u, v, 4, 4, 4, seed) * 0.5 + 0.5;
      var mid = nz(u, v, 16, 16, 3, seed + 3) * 0.5 + 0.5;
      var fine = nz(u, v, 64, 64, 2, seed + 7) * 0.5 + 0.5;
      var a = util.clamp((big * 0.55 + mid * 0.3 + fine * 0.15 - 0.42) * 2.1, 0, 1);
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
      out[3] = a * 190 * amt;
    });
    /* individual settled motes */
    var rnd = util.rng(seed + 1);
    ctx.fillStyle = 'rgba(220,216,204,0.55)';
    for (var i = 0; i < 160; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 0.4 + rnd() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  def('grime', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 317 : o.seed;
    var col = hex2rgb(o.tint || '#4a4034');
    var amt = o.amount === undefined ? 1 : o.amount;
    fill(ctx, w, h, function (x, y, out, u, v) {
      var edge = nz(u, v, 3, 3, 5, seed) * 0.5 + 0.5;
      var runs = nz(u, v, 8, 2, 4, seed + 5) * 0.5 + 0.5;
      var a = util.clamp((edge * 0.6 + runs * 0.4 - 0.52) * 2.6, 0, 1);
      /* grime collects in the lower half */
      a *= 0.4 + util.clamp(v, 0, 1) * 0.9;
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
      out[3] = a * 200 * amt;
    });
  });

  def('scratches', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 331 : o.seed;
    var amt = o.amount === undefined ? 1 : o.amount;
    var rnd = util.rng(seed);
    ctx.clearRect(0, 0, w, h);
    var n = Math.round(70 * amt);
    for (var i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * h;
      var ang = rnd() * Math.PI * 2;
      var len = (3 + rnd() * 40) * (w / 256);
      var bright = rnd() < 0.6;
      ctx.strokeStyle = bright
        ? 'rgba(235,238,242,' + (0.10 + rnd() * 0.35).toFixed(3) + ')'
        : 'rgba(24,22,20,' + (0.10 + rnd() * 0.35).toFixed(3) + ')';
      ctx.lineWidth = 0.4 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      var px = x, py = y;
      for (var s = 0; s < 4; s++) {
        ang += (rnd() - 0.5) * 0.35;
        px += Math.cos(ang) * len / 4;
        py += Math.sin(ang) * len / 4;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    /* a few deeper gouges */
    for (var d = 0; d < 5; d++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      var gx = rnd() * w, gy = rnd() * h;
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rnd() - 0.5) * w * 0.5, gy + (rnd() - 0.5) * h * 0.2);
      ctx.stroke();
    }
  });

  def('noise', 256, function (ctx, w, h, o) {
    var seed = o.seed === undefined ? 337 : o.seed;
    var oct = o.octaves || 5;
    var f = o.freq || 8;
    fill(ctx, w, h, function (x, y, out, u, v) {
      var n = nz(u, v, f, f, oct, seed) * 0.5 + 0.5;
      var g = n * 255;
      out[0] = g; out[1] = g; out[2] = g;
    });
  }, { data: true });

  /* ================================================================== */
  /* 10. Derived maps                                                    */
  /* ================================================================== */

  function sourceCanvas(src) {
    if (!src) return null;
    if (src.image) return src.image;
    return src;
  }

  function readPixels(canvas) {
    var c2 = canvas.getContext ? canvas.getContext('2d') : null;
    if (!c2) return null;
    return c2.getImageData(0, 0, canvas.width, canvas.height);
  }

  /* Sobel on luminance -> tangent-space normal map. */
  tex.normalFrom = function (src, strength) {
    var canvas = sourceCanvas(src);
    if (!canvas || !canvas.width) return null;
    strength = strength === undefined ? 1 : strength;

    var store = canvas.__sgNormals || (canvas.__sgNormals = {});
    var key = String(strength);
    if (store[key]) return store[key];

    var w = canvas.width, h = canvas.height;
    var img = readPixels(canvas);
    if (!img) return null;
    var s = img.data;

    /* luminance, premultiplied by alpha against mid-grey so decals behave */
    var lum = new Float32Array(w * h);
    for (var i = 0, p = 0; i < s.length; i += 4, p++) {
      var a = s[i + 3] / 255;
      lum[p] = (0.2126 * s[i] + 0.7152 * s[i + 1] + 0.0722 * s[i + 2]) / 255 * a +
        0.5 * (1 - a);
    }

    var out = mkCanvas(w, h);
    var octx = out.getContext('2d');
    var dst = octx.createImageData(w, h);
    var d = dst.data;
    var sc = strength * 4;

    for (var y = 0; y < h; y++) {
      var ym = ((y - 1) + h) % h, yp = (y + 1) % h;
      for (var x = 0; x < w; x++) {
        var xm = ((x - 1) + w) % w, xp = (x + 1) % w;
        var tl = lum[ym * w + xm], t = lum[ym * w + x], tr = lum[ym * w + xp];
        var ml = lum[y * w + xm], mr = lum[y * w + xp];
        var bl = lum[yp * w + xm], b = lum[yp * w + x], br = lum[yp * w + xp];

        var gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        var gy = (bl + 2 * b + br) - (tl + 2 * t + tr);

        var nx = -gx * sc, ny = -gy * sc, nz2 = 1;
        var len = Math.sqrt(nx * nx + ny * ny + nz2 * nz2);
        var o4 = (y * w + x) * 4;
        d[o4] = (nx / len * 0.5 + 0.5) * 255;
        d[o4 + 1] = (ny / len * 0.5 + 0.5) * 255;
        d[o4 + 2] = (nz2 / len * 0.5 + 0.5) * 255;
        d[o4 + 3] = 255;
      }
    }
    octx.putImageData(dst, 0, 0);

    var t2 = wrapTex(out, { data: true });
    t2.name = 'tex:normal';
    if (src && src.isTexture) {
      t2.wrapS = src.wrapS; t2.wrapT = src.wrapT;
    }
    store[key] = t2;
    return t2;
  };

  /* Greyscale roughness remapped into [lo,hi]. Dark = smooth. */
  tex.roughFrom = function (src, lo, hi) {
    var canvas = sourceCanvas(src);
    if (!canvas || !canvas.width) return null;
    lo = lo === undefined ? 0.3 : lo;
    hi = hi === undefined ? 0.9 : hi;

    var store = canvas.__sgRough || (canvas.__sgRough = {});
    var key = lo.toFixed(3) + ',' + hi.toFixed(3);
    if (store[key]) return store[key];

    var w = canvas.width, h = canvas.height;
    var img = readPixels(canvas);
    if (!img) return null;
    var s = img.data;

    var out = mkCanvas(w, h);
    var octx = out.getContext('2d');
    var dst = octx.createImageData(w, h);
    var d = dst.data;

    for (var i = 0; i < s.length; i += 4) {
      var a = s[i + 3] / 255;
      var l = (0.2126 * s[i] + 0.7152 * s[i + 1] + 0.0722 * s[i + 2]) / 255;
      l = l * a + 0.5 * (1 - a);
      var r = (lo + (hi - lo) * l) * 255;
      d[i] = r; d[i + 1] = r; d[i + 2] = r; d[i + 3] = 255;
    }
    octx.putImageData(dst, 0, 0);

    var t2 = wrapTex(out, { data: true });
    t2.name = 'tex:rough';
    if (src && src.isTexture) { t2.wrapS = src.wrapS; t2.wrapT = src.wrapT; }
    store[key] = t2;
    return t2;
  };

  /* ================================================================== */
  /* 11. Warm-up                                                         */
  /* ================================================================== */

  var warmed = false;
  tex.__warm = function () {
    if (warmed) return 0;
    warmed = true;
    var t0 = util.now();
    /* The dozen that every level touches. Level-specific stuff (marble,
     * carpetHotel, pcb, posters, screens) stays lazy. */
    var list = ['wood', 'laminate', 'carpetOffice', 'concrete', 'drywall',
      'ceilingTile', 'beigePlastic', 'blackPlastic', 'steelBrushed',
      'aluminium', 'noise', 'dust'];
    for (var i = 0; i < list.length; i++) {
      try { tex[list[i]](); } catch (e) { /* a missing texture must not stop boot */ }
    }
    var ms = (util.now() - t0) * 1000;
    tex.__warmMs = ms;
    return ms;
  };

  tex.__stats = function () {
    var n = 0, k;
    for (k in CACHE) {
      n += Object.keys(CACHE[k].base).length;
    }
    return { generated: n, textCached: textCacheN, warmMs: tex.__warmMs || 0 };
  };

})(window.SG, window.THREE);

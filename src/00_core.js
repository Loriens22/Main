/* ============================================================================
 * STEVE THE PC REPAIR MAN — 00_core.js
 * Core namespace: math, rng, event bus, device probe, tiny helpers.
 * No dependencies except THREE (which may be absent at load time).
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  STV.VERSION = '1.0.0';

  /* ---------- debug ---------- */
  var qs = (function () {
    var o = {};
    try {
      var s = window.location.search.replace(/^\?/, '').split('&');
      for (var i = 0; i < s.length; i++) {
        if (!s[i]) continue;
        var kv = s[i].split('=');
        o[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : '1';
      }
    } catch (e) {}
    return o;
  })();
  STV.qs = qs;
  STV.debug = qs.debug === '1';

  STV.log = function () {
    if (!STV.debug) return;
    try { console.log.apply(console, arguments); } catch (e) {}
  };
  STV.warn = function () {
    try { console.warn.apply(console, arguments); } catch (e) {}
  };

  /* ---------- math ---------- */
  STV.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  STV.lerp = function (a, b, t) { return a + (b - a) * t; };
  STV.invLerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  STV.smoothstep = function (a, b, x) {
    var t = STV.clamp((x - a) / (b - a || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };
  /* framerate-independent exponential smoothing */
  STV.damp = function (cur, target, lambda, dt) {
    return target + (cur - target) * Math.exp(-lambda * dt);
  };
  STV.dampAngle = function (cur, target, lambda, dt) {
    var d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * (1 - Math.exp(-lambda * dt));
  };
  STV.wrapAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  STV.moveTowards = function (cur, target, maxDelta) {
    var d = target - cur;
    if (Math.abs(d) <= maxDelta) return target;
    return cur + Math.sign(d) * maxDelta;
  };

  STV.ease = {
    linear:      function (t) { return t; },
    inQuad:      function (t) { return t * t; },
    outQuad:     function (t) { return t * (2 - t); },
    inOutQuad:   function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    inCubic:     function (t) { return t * t * t; },
    outCubic:    function (t) { return (--t) * t * t + 1; },
    inOutCubic:  function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    inQuart:     function (t) { return t * t * t * t; },
    outQuart:    function (t) { return 1 - (--t) * t * t * t; },
    inOutSine:   function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outSine:     function (t) { return Math.sin((t * Math.PI) / 2); },
    inSine:      function (t) { return 1 - Math.cos((t * Math.PI) / 2); },
    outBack:     function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic:  function (t) {
      var c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    outBounce:   function (t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  };
  STV.easeByName = function (name) { return STV.ease[name] || STV.ease.inOutSine; };

  /* ---------- deterministic rng (mulberry32) ---------- */
  STV.rng = function (seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  STV.randRange = function (r, a, b) { return a + (b - a) * r(); };
  STV.randInt = function (r, a, b) { return a + Math.floor(r() * (b - a + 1)); };
  STV.pick = function (r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; };
  STV.chance = function (r, p) { return r() < p; };
  STV.shuffle = function (r, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /* smooth 1D value noise, handy for shakes and flicker */
  STV.noise1 = function (x) {
    var i = Math.floor(x), f = x - i;
    function h(n) { n = (n << 13) ^ n; return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824; }
    var u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };

  /* ---------- event bus ---------- */
  var handlers = {};
  STV.bus = {
    on: function (evt, fn) {
      (handlers[evt] || (handlers[evt] = [])).push(fn);
      return function () { STV.bus.off(evt, fn); };
    },
    once: function (evt, fn) {
      var un = STV.bus.on(evt, function (p) { un(); fn(p); });
      return un;
    },
    off: function (evt, fn) {
      var l = handlers[evt];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    emit: function (evt, payload) {
      var l = handlers[evt];
      if (!l || !l.length) return;
      var copy = l.slice();
      for (var i = 0; i < copy.length; i++) {
        try { copy[i](payload); }
        catch (e) { STV.warn('[bus] handler error for "' + evt + '":', e); }
      }
    },
    clear: function (evt) { if (evt) delete handlers[evt]; else handlers = {}; }
  };

  /* ---------- device probe ---------- */
  function probeTouch() {
    try {
      return ('ontouchstart' in window) ||
             (navigator.maxTouchPoints > 0) ||
             (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }
  }
  function probeMobile() {
    var coarse = false;
    try { coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var small = Math.min(window.innerWidth, window.innerHeight) <= 820;
    var ua = /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(navigator.userAgent || '');
    return (coarse && small) || (ua && small) || (ua && coarse);
  }
  STV.isTouch = probeTouch();
  STV.isMobile = probeMobile();
  STV.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  STV.reduceMotion = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  })();

  /* quality tier — refined by Game after a real GL probe */
  STV.quality = (function () {
    if (qs.q === 'low' || qs.q === 'med' || qs.q === 'high') return qs.q;
    var mem = navigator.deviceMemory || (STV.isMobile ? 4 : 8);
    var cores = navigator.hardwareConcurrency || (STV.isMobile ? 4 : 8);
    if (STV.isMobile) {
      if (mem <= 3 || cores <= 4) return 'low';
      return 'med';
    }
    if (mem <= 4 || cores <= 4) return 'med';
    return 'high';
  })();
  STV.pixelRatioCap = function () {
    if (STV.quality === 'low') return 1.0;
    if (STV.quality === 'med') return 1.5;
    return 2.0;
  };

  /* ---------- time ---------- */
  STV.now = (function () {
    if (window.performance && window.performance.now) {
      return function () { return window.performance.now(); };
    }
    return function () { return Date.now(); };
  })();

  /* ---------- memo helper ---------- */
  STV.memo = function (cache, key, factory) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    var v = factory();
    cache[key] = v;
    return v;
  };

  /* ---------- persistent settings ---------- */
  var SKEY = 'stv.settings';
  STV.settings = {
    master: 0.9, sfx: 0.9, music: 0.6, voice: 1.0,
    voiceOn: true, subs: true, subSize: 1.0,
    invertY: false, sens: 1.0, motion: !STV.reduceMotion,
    contrast: false, quality: STV.quality, catmode: false
  };
  STV.loadSettings = function () {
    try {
      var raw = window.localStorage.getItem(SKEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      for (var k in o) if (Object.prototype.hasOwnProperty.call(STV.settings, k)) STV.settings[k] = o[k];
    } catch (e) {}
  };
  STV.saveSettings = function () {
    try { window.localStorage.setItem(SKEY, JSON.stringify(STV.settings)); } catch (e) {}
    STV.bus.emit('settings:changed', STV.settings);
  };
  STV.loadSettings();

  /* ---------- persistent progress (eggs, ending) ---------- */
  var PKEY = 'stv.progress';
  STV.progress = { eggs: {}, ending: null, seen: {} };
  STV.loadProgress = function () {
    try {
      var raw = window.localStorage.getItem(PKEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.eggs) STV.progress = o;
      }
    } catch (e) {}
  };
  STV.saveProgress = function () {
    try { window.localStorage.setItem(PKEY, JSON.stringify(STV.progress)); } catch (e) {}
  };
  STV.loadProgress();

  STV.EGGS = ['konami', 'win98', 'kernel10', 'bsod', 'crowbar', 'tcp', 'hunter2',
              'vending', 'poster127', 'duck', 'mom', 'ellisbackup', 'clock',
              'boombox', 'deadbeef', 'catmode'];

  STV.egg = function (id, name) {
    if (STV.progress.eggs[id]) return false;
    STV.progress.eggs[id] = 1;
    STV.saveProgress();
    var n = 0;
    for (var k in STV.progress.eggs) if (STV.progress.eggs[k]) n++;
    STV.bus.emit('egg:found', { id: id, name: name || id, count: n, total: STV.EGGS.length });
    return true;
  };
  STV.eggCount = function () {
    var n = 0;
    for (var i = 0; i < STV.EGGS.length; i++) if (STV.progress.eggs[STV.EGGS[i]]) n++;
    return n;
  };

  /* ---------- small object pool for vectors (avoid GC churn in hot loops) ---- */
  STV.vecPool = function () {
    if (!window.THREE) return null;
    var pool = [], idx = 0;
    return {
      get: function () {
        if (idx >= pool.length) pool.push(new THREE.Vector3());
        return pool[idx++].set(0, 0, 0);
      },
      reset: function () { idx = 0; }
    };
  };

  /* ---------- tween registry (simple, used by cine + levels) ---------- */
  var tweens = [];
  STV.tween = function (opts) {
    // {from, to, dur, ease, onUpdate(v,t), onDone, delay}
    var t = {
      from: opts.from != null ? opts.from : 0,
      to: opts.to != null ? opts.to : 1,
      dur: Math.max(0.0001, opts.dur || 1),
      ease: typeof opts.ease === 'function' ? opts.ease : STV.easeByName(opts.ease),
      onUpdate: opts.onUpdate, onDone: opts.onDone,
      delay: opts.delay || 0, el: 0, dead: false
    };
    tweens.push(t);
    return { cancel: function () { t.dead = true; } };
  };
  STV.updateTweens = function (dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var t = tweens[i];
      if (t.dead) { tweens.splice(i, 1); continue; }
      if (t.delay > 0) { t.delay -= dt; continue; }
      t.el += dt;
      var k = STV.clamp(t.el / t.dur, 0, 1);
      var e = t.ease(k);
      if (t.onUpdate) { try { t.onUpdate(t.from + (t.to - t.from) * e, k); } catch (err) { STV.warn(err); } }
      if (k >= 1) {
        if (t.onDone) { try { t.onDone(); } catch (err) { STV.warn(err); } }
        tweens.splice(i, 1);
      }
    }
  };
  STV.clearTweens = function () { tweens.length = 0; };

  /* ---------- deferred / promise-lite (no async syntax anywhere) ---------- */
  STV.defer = function () {
    var cbs = [], done = false, val;
    return {
      resolve: function (v) {
        if (done) return;
        done = true; val = v;
        for (var i = 0; i < cbs.length; i++) { try { cbs[i](val); } catch (e) { STV.warn(e); } }
        cbs.length = 0;
      },
      promise: {
        then: function (fn) {
          if (done) { try { fn(val); } catch (e) { STV.warn(e); } }
          else cbs.push(fn);
          return this;
        }
      }
    };
  };

  /* ---------- disposal helper ---------- */
  STV.disposeObject = function (obj) {
    if (!obj) return;
    obj.traverse(function (o) {
      if (o.geometry && o.geometry.dispose) {
        // shared geometries are marked so we don't nuke the cache
        if (!o.geometry.userData || !o.geometry.userData.shared) o.geometry.dispose();
      }
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          var m = mats[i];
          if (!m) continue;
          if (m.userData && m.userData.shared) continue;
          for (var k in m) {
            var v = m[k];
            if (v && v.isTexture && !(v.userData && v.userData.shared)) v.dispose();
          }
          if (m.dispose) m.dispose();
        }
      }
    });
  };

  /* ---------- text metrics helper for canvas art ---------- */
  STV.fitText = function (ctx, text, maxW, startPx, font) {
    var px = startPx;
    do {
      ctx.font = px + 'px ' + (font || 'sans-serif');
      if (ctx.measureText(text).width <= maxW) break;
      px -= 1;
    } while (px > 6);
    return px;
  };

  STV.log('core loaded v' + STV.VERSION, { mobile: STV.isMobile, touch: STV.isTouch, quality: STV.quality });
})();

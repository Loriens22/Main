/* =====================================================================
 * STEVE — THE PC REPAIR MAN
 * 00_core.js — namespace, math, deterministic noise, event bus, state.
 * Loaded first. Everything else hangs off SG.
 * ===================================================================== */
(function (global) {
  'use strict';

  var SG = global.SG || (global.SG = {});

  SG.version = '1.0.0';
  SG.title = 'STEVE — THE PC REPAIR MAN';

  /* Registries populated by later files. Declared here so load order between
   * siblings never matters. */
  SG.tex = SG.tex || {};
  SG.mat = SG.mat || {};
  SG.models = SG.models || {};
  SG.chars = SG.chars || {};
  SG.audio = SG.audio || {};
  SG.voice = SG.voice || {};
  SG.phys = SG.phys || {};
  SG.input = SG.input || {};
  SG.ui = SG.ui || {};
  SG.fx = SG.fx || {};
  SG.cinema = SG.cinema || {};
  SG.script = SG.script || { lines: {} };
  SG.levels = SG.levels || {};
  SG.eggs = SG.eggs || {};
  SG.player = SG.player || {};

  /* ------------------------------------------------------------------ */
  /* Quality tier                                                        */
  /* ------------------------------------------------------------------ */

  SG.isTouch = (function () {
    return ('ontouchstart' in global) ||
      (global.navigator && global.navigator.maxTouchPoints > 0);
  })();

  SG.quality = (function () {
    try {
      var saved = global.localStorage && global.localStorage.getItem('sg.quality');
      if (saved === 'low' || saved === 'med' || saved === 'high') return saved;
    } catch (e) { /* private mode */ }
    var mem = (global.navigator && global.navigator.deviceMemory) || 4;
    var cpu = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var px = Math.max(global.screen ? global.screen.width : 1280,
      global.screen ? global.screen.height : 720);
    if (SG.isTouch) return (mem >= 6 && cpu >= 6 && px >= 800) ? 'med' : 'low';
    if (mem >= 8 && cpu >= 8) return 'high';
    if (mem >= 4 && cpu >= 4) return 'med';
    return 'low';
  })();

  SG.setQuality = function (q) {
    SG.quality = q;
    try { global.localStorage.setItem('sg.quality', q); } catch (e) { /* noop */ }
  };

  SG.qpick = function (low, med, high) {
    return SG.quality === 'low' ? low : (SG.quality === 'med' ? med : high);
  };

  /* ------------------------------------------------------------------ */
  /* Math + random                                                       */
  /* ------------------------------------------------------------------ */

  var util = SG.util = {};

  util.TAU = Math.PI * 2;
  util.DEG = Math.PI / 180;

  util.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  util.lerp = function (a, b, t) { return a + (b - a) * t; };
  util.mix = util.lerp;
  util.inv = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  util.smooth = function (t) { t = util.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  util.smoother = function (t) {
    t = util.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10);
  };

  /* Frame-rate independent exponential approach. */
  util.damp = function (a, b, lambda, dt) {
    return util.lerp(a, b, 1 - Math.exp(-lambda * dt));
  };

  util.angleLerp = function (a, b, t) {
    var d = ((b - a + Math.PI) % util.TAU + util.TAU) % util.TAU - Math.PI;
    return a + d * t;
  };
  util.angleDamp = function (a, b, lambda, dt) {
    return util.angleLerp(a, b, 1 - Math.exp(-lambda * dt));
  };

  /* Easing curves used by the cinema module. */
  util.ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return t * (2 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return (--t) * t * t + 1; },
    inOutCubic: function (t) {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    },
    outQuart: function (t) { return 1 - (--t) * t * t * t; },
    inOutQuart: function (t) {
      return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;
    },
    outExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) {
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    outBack: function (t) {
      var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (util.TAU / 3)) + 1;
    }
  };
  util.easeFn = function (name) { return util.ease[name] || util.ease.inOutCubic; };

  /* Non-deterministic helpers (cosmetic only). */
  util.rand = function (a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + Math.random() * (b - a);
  };
  util.randi = function (a, b) { return Math.floor(util.rand(a, b + 1)); };
  util.chance = function (p) { return Math.random() < p; };
  util.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  /* Deterministic: mulberry32. Use this for anything that must look identical
   * every playthrough (textures, prop scatter, wear patterns). */
  util.rng = function (seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  util.hash2 = function (x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /* Value noise, -1..1. Cheap and plenty for texture work. */
  util.noise2 = function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = util.smooth(xf), v = util.smooth(yf);
    var a = util.hash2(xi, yi), b = util.hash2(xi + 1, yi);
    var c = util.hash2(xi, yi + 1), d = util.hash2(xi + 1, yi + 1);
    return (util.lerp(util.lerp(a, b, u), util.lerp(c, d, u), v) * 2) - 1;
  };

  util.fbm2 = function (x, y, oct) {
    oct = oct || 4;
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      v += util.noise2(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return v / (norm || 1);
  };

  /* Worley / cellular, 0..1 — good for tiles, marble, cracked concrete. */
  util.worley = function (x, y, jitter) {
    jitter = jitter === undefined ? 1 : jitter;
    var xi = Math.floor(x), yi = Math.floor(y), best = 8;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var cx = xi + ox, cy = yi + oy;
        var px = cx + util.hash2(cx, cy) * jitter;
        var py = cy + util.hash2(cy + 71, cx - 13) * jitter;
        var dx = px - x, dy = py - y;
        var d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  };

  util.now = function () {
    return (global.performance && global.performance.now
      ? global.performance.now() : Date.now()) / 1000;
  };

  util.fmtTime = function (s) {
    s = Math.max(0, s | 0);
    var m = (s / 60) | 0, r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };

  /* ------------------------------------------------------------------ */
  /* Three.js helpers (THREE is guaranteed present by build order)       */
  /* ------------------------------------------------------------------ */

  /* Merge every mesh in a group that shares a material into one geometry.
   * Static scenery only — this destroys per-mesh transforms. */
  util.mergeGroup = function (group, opts) {
    var THREE = global.THREE;
    if (!THREE) return group;
    opts = opts || {};
    var buckets = [];
    var byMat = new Map();
    group.updateMatrixWorld(true);
    var strays = [];

    group.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      /* Anything explicitly excluded is carried across untouched rather than
       * silently dropped — an animated part must survive a merge. */
      if (o.userData.noMerge) { strays.push(o); return; }
      var m = o.material;
      if (Array.isArray(m)) { strays.push(o); return; }
      var b = byMat.get(m);
      if (!b) { b = { mat: m, list: [] }; byMat.set(m, b); buckets.push(b); }
      b.list.push(o);
    });

    var out = new THREE.Group();
    out.name = group.name + '_merged';

    buckets.forEach(function (b) {
      if (b.list.length === 1) {
        var only = b.list[0];
        only.updateMatrixWorld(true);
        var g0 = only.geometry.clone();
        g0.applyMatrix4(only.matrixWorld);
        var m0 = new THREE.Mesh(g0, b.mat);
        m0.castShadow = only.castShadow; m0.receiveShadow = only.receiveShadow;
        out.add(m0);
        return;
      }
      var geos = [];
      for (var i = 0; i < b.list.length; i++) {
        var o = b.list[i];
        o.updateMatrixWorld(true);
        var g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        geos.push(g);
      }
      var merged = util.mergeGeometries(geos);
      geos.forEach(function (g) { g.dispose(); });
      if (!merged) return;
      var mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = opts.receiveShadow !== false;
      out.add(mesh);
    });

    strays.forEach(function (o) {
      o.updateMatrixWorld(true);
      var c = o.clone();
      c.position.setFromMatrixPosition(o.matrixWorld);
      c.quaternion.setFromRotationMatrix(o.matrixWorld);
      out.add(c);
    });

    return out;
  };

  /* Standalone BufferGeometry merge — the core build has no BufferGeometryUtils. */
  util.mergeGeometries = function (geometries) {
    var THREE = global.THREE;
    if (!geometries.length) return null;

    /* Intersect attribute sets so every geometry contributes the same ones. */
    var names = Object.keys(geometries[0].attributes);
    for (var i = 1; i < geometries.length; i++) {
      var have = geometries[i].attributes;
      names = names.filter(function (n) { return !!have[n]; });
    }
    if (names.indexOf('position') < 0) return null;

    var total = 0, idxTotal = 0, useIndex = true;
    for (i = 0; i < geometries.length; i++) {
      total += geometries[i].attributes.position.count;
      if (geometries[i].index) idxTotal += geometries[i].index.count;
      else { useIndex = false; }
    }
    if (!useIndex) {
      /* Normalise: give un-indexed geometries a trivial index. */
      idxTotal = 0;
      for (i = 0; i < geometries.length; i++) {
        if (!geometries[i].index) {
          var n = geometries[i].attributes.position.count;
          var arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
          for (var k = 0; k < n; k++) arr[k] = k;
          geometries[i].setIndex(new THREE.BufferAttribute(arr, 1));
        }
        idxTotal += geometries[i].index.count;
      }
      useIndex = true;
    }

    var out = new THREE.BufferGeometry();
    names.forEach(function (name) {
      var proto = geometries[0].attributes[name];
      var itemSize = proto.itemSize;
      var data = new Float32Array(total * itemSize);
      var off = 0;
      for (var g = 0; g < geometries.length; g++) {
        var a = geometries[g].attributes[name];
        for (var v = 0; v < a.count; v++) {
          for (var c = 0; c < itemSize; c++) {
            data[off++] = a.getComponent ? a.getComponent(v, c) : a.array[v * itemSize + c];
          }
        }
      }
      out.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
    });

    var IndexArray = total > 65535 ? Uint32Array : Uint16Array;
    var idx = new IndexArray(idxTotal);
    var io = 0, vo = 0;
    for (i = 0; i < geometries.length; i++) {
      var gi = geometries[i].index;
      for (var j = 0; j < gi.count; j++) idx[io++] = gi.getX(j) + vo;
      vo += geometries[i].attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  };

  /* Recursively free GPU memory for a subtree. Shared materials/textures owned
   * by SG.mat / SG.tex are never disposed — they are cached on purpose. */
  util.disposeTree = function (root) {
    if (!root) return;
    root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      var m = o.material;
      if (!m) return;
      var list = Array.isArray(m) ? m : [m];
      list.forEach(function (mm) {
        if (mm && mm.userData && mm.userData.shared) return;
        if (mm && mm.dispose) mm.dispose();
      });
    });
  };

  util.setShadow = function (obj, cast, receive) {
    obj.traverse(function (o) {
      if (o.isMesh) { o.castShadow = !!cast; o.receiveShadow = !!receive; }
    });
    return obj;
  };

  /* Bounding size of a subtree, cached onto userData.size. */
  util.measure = function (obj) {
    var THREE = global.THREE;
    var box = new THREE.Box3().setFromObject(obj);
    var s = new THREE.Vector3();
    box.getSize(s);
    obj.userData.size = { x: s.x, y: s.y, z: s.z };
    obj.userData.bbox = box;
    return obj.userData.size;
  };

  /* ------------------------------------------------------------------ */
  /* Event bus                                                           */
  /* ------------------------------------------------------------------ */

  var handlers = {};
  SG.bus = {
    on: function (name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
      return fn;
    },
    off: function (name, fn) {
      var l = handlers[name]; if (!l) return;
      var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    },
    once: function (name, fn) {
      var wrap = function (p) { SG.bus.off(name, wrap); fn(p); };
      SG.bus.on(name, wrap);
    },
    emit: function (name, payload) {
      var l = handlers[name]; if (!l) return;
      for (var i = 0; i < l.length; i++) {
        try { l[i](payload); } catch (e) {
          if (global.console) console.error('[bus:' + name + ']', e);
        }
      }
    },
    clear: function (name) { if (name) delete handlers[name]; else handlers = {}; }
  };

  /* ------------------------------------------------------------------ */
  /* Persistent state                                                    */
  /* ------------------------------------------------------------------ */

  SG.defaultState = function () {
    return {
      chapter: 'title',
      seen: {},
      flags: {},
      eggs: {},
      counters: {},
      settings: {
        master: 0.85, music: 0.55, sfx: 0.9, voice: 1.0,
        subtitles: true, voiceEnabled: true, invertY: false,
        sensitivity: 1.0, gyro: false, reduceMotion: false
      },
      stats: { started: 0, deaths: 0, playTime: 0 }
    };
  };

  SG.state = SG.defaultState();

  SG.save = function () {
    try {
      global.localStorage.setItem('sg.save', JSON.stringify(SG.state));
      return true;
    } catch (e) { return false; }
  };

  SG.load = function () {
    try {
      var raw = global.localStorage.getItem('sg.save');
      if (!raw) return false;
      var s = JSON.parse(raw);
      var base = SG.defaultState();
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) base[k] = s[k];
      for (var sk in SG.defaultState().settings) {
        if (base.settings[sk] === undefined) {
          base.settings[sk] = SG.defaultState().settings[sk];
        }
      }
      SG.state = base;
      return true;
    } catch (e) { return false; }
  };

  SG.resetSave = function () {
    SG.state = SG.defaultState();
    try { global.localStorage.removeItem('sg.save'); } catch (e) { /* noop */ }
  };

  SG.flag = function (name, value) {
    if (value === undefined) return !!SG.state.flags[name];
    SG.state.flags[name] = value;
    SG.bus.emit('state:change', { flag: name, value: value });
    return value;
  };

  SG.count = function (name, by) {
    SG.state.counters[name] = (SG.state.counters[name] || 0) + (by === undefined ? 1 : by);
    return SG.state.counters[name];
  };

  /* ------------------------------------------------------------------ */
  /* Easter egg registry                                                 */
  /* ------------------------------------------------------------------ */

  SG.eggs.all = SG.eggs.all || {};

  SG.eggs.define = function (id, title, hint) {
    SG.eggs.all[id] = { id: id, title: title, hint: hint || '' };
  };

  SG.eggs.find = function (id, title) {
    if (!SG.eggs.all[id]) SG.eggs.define(id, title || id);
    if (SG.state.eggs[id]) return false;
    SG.state.eggs[id] = 1;
    SG.bus.emit('egg:found', SG.eggs.all[id]);
    SG.save();
    return true;
  };

  SG.eggs.found = function () {
    var n = 0;
    for (var k in SG.state.eggs) if (SG.state.eggs[k]) n++;
    return n;
  };

  SG.eggs.total = function () { return Object.keys(SG.eggs.all).length; };

  /* ------------------------------------------------------------------ */
  /* Error trap — a broken subsystem must not take the game down.        */
  /* ------------------------------------------------------------------ */

  SG.errors = [];
  SG.safe = function (label, fn, fallback) {
    try { return fn(); } catch (e) {
      SG.errors.push({ label: label, error: e && (e.stack || e.message || String(e)) });
      if (global.console) console.error('[SG:' + label + ']', e);
      return fallback;
    }
  };

})(typeof window !== 'undefined' ? window : this);

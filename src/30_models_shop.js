/* =====================================================================
 * 30_models_shop.js — shop + computer-hardware prop factories.
 *
 * Everything here returns a FRESH THREE.Group per call, built around the
 * origin, +Y up, base at y = 0, facing +Z, measured with SG.util.measure.
 *
 * Geometry is cached at closure level and shared between instances;
 * materials are resolved lazily through SG.mat (Agent A) with local
 * fallbacks so this file renders standalone.
 *
 * Units are METRES. Real-world dimensions throughout:
 *   bench 1.80 x 0.75 x 0.90h   ATX tower 0.19w x 0.45h x 0.45d
 *   17" CRT 0.42 x 0.41 x 0.44  CR2032 20mm x 3.2mm   M3 screw 3mm
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var U = SG.util;
  var PI = Math.PI;
  var HP = PI / 2;

  /* ================================================================== */
  /* Geometry cache                                                     */
  /* ================================================================== */

  var GC = {};
  function cg(key, make) {
    var g = GC[key];
    if (!g) { g = GC[key] = make(); }
    return g;
  }
  function n3(v) { return Math.round(v * 10000) / 10000; }

  function B(w, h, d) {
    w = n3(w); h = n3(h); d = n3(d);
    return cg('B|' + w + '|' + h + '|' + d, function () {
      return new THREE.BoxGeometry(w, h, d);
    });
  }
  function CY(rt, rb, h, seg, open) {
    rt = n3(rt); rb = n3(rb); h = n3(h); seg = seg || 10;
    return cg('C|' + rt + '|' + rb + '|' + h + '|' + seg + '|' + (open ? 1 : 0), function () {
      return new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open);
    });
  }
  function SP(r, ws, hs) {
    r = n3(r); ws = ws || 12; hs = hs || 8;
    return cg('S|' + r + '|' + ws + '|' + hs, function () {
      return new THREE.SphereGeometry(r, ws, hs);
    });
  }
  function PL(w, h) {
    w = n3(w); h = n3(h);
    return cg('P|' + w + '|' + h, function () { return new THREE.PlaneGeometry(w, h); });
  }
  function TO(r, t, rs, ts) {
    r = n3(r); t = n3(t); rs = rs || 6; ts = ts || 14;
    return cg('T|' + r + '|' + t + '|' + rs + '|' + ts, function () {
      return new THREE.TorusGeometry(r, t, rs, ts);
    });
  }
  function CN(r, h, seg) {
    r = n3(r); h = n3(h); seg = seg || 8;
    return cg('N|' + r + '|' + h + '|' + seg, function () {
      return new THREE.ConeGeometry(r, h, seg);
    });
  }
  function RG(ri, ro, seg) {
    ri = n3(ri); ro = n3(ro); seg = seg || 16;
    return cg('R|' + ri + '|' + ro + '|' + seg, function () {
      return new THREE.RingGeometry(ri, ro, seg);
    });
  }

  /* ================================================================== */
  /* Material resolver — Agent A owns SG.mat.*; these are fallbacks.    */
  /* ================================================================== */

  var MC = {};
  function M(name, args, fallback) {
    var key = name + '|' + (args && args.length ? args.join('|') : '');
    var c = MC[key];
    if (c) return c;
    var m = null;
    if (SG.mat && typeof SG.mat[name] === 'function') {
      try { m = SG.mat[name].apply(SG.mat, args || []); } catch (e) { m = null; }
    }
    if (!m || !m.isMaterial) {
      var spec = typeof fallback === 'function' ? fallback() : fallback;
      m = new THREE.MeshStandardMaterial(spec || { color: 0x9aa0a6, roughness: 0.8 });
    }
    if (!m.userData) m.userData = {};
    m.userData.shared = true;
    MC[key] = m;
    return m;
  }

  /* Straight local material — used where exact PBR values matter and no
   * SG.mat family fits. Still cached and shared. */
  function raw(key, spec) {
    var c = MC['raw|' + key];
    if (c) return c;
    var m = new THREE.MeshStandardMaterial(spec);
    m.userData.shared = true;
    MC['raw|' + key] = m;
    return m;
  }

  /* Named families (textured by Agent A when present). */
  function mWood() { return M('wood', [], { color: 0x8a6440, roughness: 0.45, metalness: 0 }); }
  function mLam() { return M('laminate', [], { color: 0x9ba1a7, roughness: 0.33, metalness: 0 }); }
  function mBeige() { return M('beigePlastic', [], { color: 0xd9d0b2, roughness: 0.72, metalness: 0 }); }
  function mBlack() { return M('blackPlastic', [], { color: 0x24262a, roughness: 0.56, metalness: 0 }); }
  function mSteel() { return M('steelBrushed', [], { color: 0xa9b0b6, roughness: 0.42, metalness: 1 }); }
  function mSteelP() { return M('steelPainted', [], { color: 0x777e85, roughness: 0.62, metalness: 0 }); }
  function mAlu() { return M('aluminium', [], { color: 0xc6cbd0, roughness: 0.3, metalness: 1 }); }
  function mPcb() { return M('pcb', [], { color: 0x1c6b40, roughness: 0.5, metalness: 0 }); }
  function mPaper() { return M('paper', [], { color: 0xefe9dc, roughness: 0.93, metalness: 0 }); }
  function mCard() { return M('cardboard', [], { color: 0xb28a58, roughness: 0.95, metalness: 0 }); }
  function mFab() { return M('fabricSeat', [], { color: 0x4c5763, roughness: 0.96, metalness: 0 }); }
  function mRub() { return M('rubber', [], { color: 0x1b1c1e, roughness: 0.95, metalness: 0 }); }
  function mCarpet() { return M('carpetOffice', [], { color: 0x4a4a48, roughness: 0.98, metalness: 0 }); }
  function mChrome() { return M('chrome', [], { color: 0xe2e7ec, roughness: 0.12, metalness: 1 }); }
  function mCopper() { return M('copperTrace', [], { color: 0xb0703a, roughness: 0.36, metalness: 1 }); }
  function mSilicon() { return M('silicon', [], { color: 0x4a4e57, roughness: 0.3, metalness: 0.4 }); }
  function mGlass() {
    return M('glass', [], {
      color: 0xcfe1ea, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.26
    });
  }
  function mGlassDirty() {
    return M('glassDirty', [], {
      color: 0xb8c6cc, roughness: 0.22, metalness: 0,
      transparent: true, opacity: 0.4
    });
  }
  function mPlastic(hex) {
    return M('plastic', [hex], function () {
      return { color: new THREE.Color(hex), roughness: 0.6, metalness: 0 };
    });
  }
  function mMatte(hex) {
    return M('matte', [hex], function () {
      return { color: new THREE.Color(hex), roughness: 0.92, metalness: 0 };
    });
  }
  function mMetal(hex) {
    return M('metal', [hex], function () {
      return { color: new THREE.Color(hex), roughness: 0.42, metalness: 1 };
    });
  }
  function mEmis(hex, inten) {
    inten = inten === undefined ? 1 : inten;
    return M('emissive', [hex, inten], function () {
      return {
        color: 0x0a0b0c, roughness: 0.45, metalness: 0,
        emissive: new THREE.Color(hex), emissiveIntensity: inten
      };
    });
  }

  /* Frequently reused local mixes. */
  function mBeigeOld() { return raw('beigeOld', { color: 0xcbbf98, roughness: 0.8, metalness: 0 }); }
  function mBeigeGrime() { return raw('beigeGrime', { color: 0xa89c7a, roughness: 0.88, metalness: 0 }); }
  function mGold() { return raw('gold', { color: 0xc9a63c, roughness: 0.32, metalness: 1 }); }
  function mDarkPl() { return raw('darkpl', { color: 0x33373d, roughness: 0.62, metalness: 0 }); }
  function mScreenOff() {
    return raw('screenoff', { color: 0x101416, roughness: 0.16, metalness: 0 });
  }
  function mDust() { return raw('dust', { color: 0x8e8878, roughness: 1, metalness: 0 }); }

  /* ================================================================== */
  /* Text labels (Agent A owns SG.tex.text)                             */
  /* ================================================================== */

  function textTex(str, o) {
    if (SG.tex && typeof SG.tex.text === 'function') {
      try {
        var t = SG.tex.text(str, o || {});
        if (t) return t;
      } catch (e) { /* fall through to a plain plate */ }
    }
    return null;
  }

  var LM = {};
  function labelMat(str, o) {
    o = o || {};
    var key = str + '|' + (o.color || '') + '|' + (o.plate || '') + '|' + (o.size || '');
    if (LM[key]) return LM[key];
    var t = textTex(str, o);
    var m;
    if (t) {
      m = new THREE.MeshStandardMaterial({
        map: t, transparent: true, roughness: 0.9, metalness: 0,
        color: 0xffffff, depthWrite: false
      });
    } else {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.plate || '#e6e1d3'), roughness: 0.9, metalness: 0
      });
    }
    m.userData.shared = true;
    LM[key] = m;
    return m;
  }

  /* ================================================================== */
  /* Build helpers                                                      */
  /* ================================================================== */

  function grp(name) {
    var g = new THREE.Group();
    if (name) g.name = name;
    return g;
  }

  function bx(par, w, h, d, mat, x, y, z) {
    var o = new THREE.Mesh(B(w, h, d), mat);
    o.position.set(x || 0, y || 0, z || 0);
    par.add(o);
    return o;
  }
  function cy(par, rt, rb, h, seg, mat, x, y, z) {
    var o = new THREE.Mesh(CY(rt, rb, h, seg), mat);
    o.position.set(x || 0, y || 0, z || 0);
    par.add(o);
    return o;
  }
  function sp(par, r, mat, x, y, z, ws, hs) {
    var o = new THREE.Mesh(SP(r, ws, hs), mat);
    o.position.set(x || 0, y || 0, z || 0);
    par.add(o);
    return o;
  }
  function cn(par, r, h, seg, mat, x, y, z) {
    var o = new THREE.Mesh(CN(r, h, seg), mat);
    o.position.set(x || 0, y || 0, z || 0);
    par.add(o);
    return o;
  }
  function to(par, r, t, mat, x, y, z, rs, ts) {
    var o = new THREE.Mesh(TO(r, t, rs, ts), mat);
    o.position.set(x || 0, y || 0, z || 0);
    par.add(o);
    return o;
  }
  function lab(par, str, w, h, x, y, z, o) {
    var m = new THREE.Mesh(PL(w, h), labelMat(str, o));
    m.position.set(x || 0, y || 0, z || 0);
    par.add(m);
    return m;
  }

  function shade(root, cast, recv) {
    root.traverse(function (n) {
      if (!n.isMesh) return;
      var tr = n.material && n.material.transparent;
      n.castShadow = !!cast && !tr && !n.userData.noShadow;
      n.receiveShadow = !!recv;
    });
    return root;
  }

  /* Merge a static sub-group down to one draw call per material. */
  function MG(s) {
    return U.mergeGroup(s, { castShadow: true, receiveShadow: true });
  }

  function fin(g, cast, recv) {
    shade(g, cast === undefined ? true : cast, recv === undefined ? true : recv);
    U.measure(g);
    return g;
  }

  /* A ribbon / flat cable: boxes chained between points. */
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  function strip(par, pts, w, t, mat) {
    for (var i = 0; i < pts.length - 1; i++) {
      _a.fromArray(pts[i]); _b.fromArray(pts[i + 1]);
      var len = _a.distanceTo(_b);
      if (len < 1e-5) continue;
      var seg = new THREE.Mesh(B(w, t, len), mat);
      _c.addVectors(_a, _b).multiplyScalar(0.5);
      seg.position.copy(_c);
      seg.lookAt(_b);
      par.add(seg);
    }
    return par;
  }

  /* A single sagging cable through points. */
  function cable(par, pts, radius, mat, sag, seg) {
    var v = [];
    for (var i = 0; i < pts.length; i++) {
      v.push(new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]));
      if (sag && i < pts.length - 1) {
        var nx = pts[i + 1];
        var mid = new THREE.Vector3(
          (pts[i][0] + nx[0]) * 0.5,
          (pts[i][1] + nx[1]) * 0.5,
          (pts[i][2] + nx[2]) * 0.5);
        var d = Math.sqrt(
          (nx[0] - pts[i][0]) * (nx[0] - pts[i][0]) +
          (nx[2] - pts[i][2]) * (nx[2] - pts[i][2]));
        mid.y -= d * sag;
        v.push(mid);
      }
    }
    if (v.length < 2) return null;
    var curve = new THREE.CatmullRomCurve3(v);
    var tub = Math.max(8, Math.min(64, (seg || v.length * 5)));
    var geo = new THREE.TubeGeometry(curve, tub, radius, 6, false);
    var m = new THREE.Mesh(geo, mat);
    par.add(m);
    return m;
  }

  /* Small hardware bits reused everywhere. */
  function screwHead(par, x, y, z, r, mat, axis) {
    r = r || 0.0028;
    var h = new THREE.Mesh(CY(r, r, 0.0012, 8), mat || mSteel());
    h.position.set(x, y, z);
    if (axis === 'z') h.rotation.x = HP;
    else if (axis === 'x') h.rotation.z = HP;
    par.add(h);
    return h;
  }

  function vents(par, count, w, h, d, mat, x, y, z, pitch, axis) {
    for (var i = 0; i < count; i++) {
      var off = (i - (count - 1) / 2) * pitch;
      if (axis === 'x') bx(par, w, h, d, mat, x + off, y, z);
      else if (axis === 'y') bx(par, w, h, d, mat, x, y + off, z);
      else bx(par, w, h, d, mat, x, y, z + off);
    }
  }

  /* ================================================================== */
  /* FURNITURE                                                          */
  /* ================================================================== */

  SG.models.benchTable = function (opts) {
    opts = opts || {};
    var W = opts.width || 1.80, D = opts.depth || 0.75, H = opts.height || 0.90;
    var g = grp('benchTable');
    var s = grp();
    var steel = mSteelP(), lam = mLam(), rub = mRub(), st = mSteel();

    /* Top: 38 mm laminated worktop with a dark edge band. */
    var top = bx(s, W, 0.034, D, lam, 0, H - 0.017, 0);
    top.name = 'top';
    bx(s, W, 0.006, D + 0.002, mDarkPl(), 0, H - 0.036, 0);

    /* Legs — 50 mm square tube, inset, with levelling feet. */
    var lx = W / 2 - 0.075, lz = D / 2 - 0.075;
    for (var i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      bx(s, 0.05, H - 0.05, 0.05, steel, sx * lx, (H - 0.05) / 2 + 0.014, sz * lz);
      cy(s, 0.026, 0.03, 0.014, 8, rub, sx * lx, 0.007, sz * lz);
    }
    /* Aprons + stretchers. */
    bx(s, W - 0.10, 0.055, 0.028, steel, 0, H - 0.085, -lz);
    bx(s, W - 0.10, 0.055, 0.028, steel, 0, H - 0.085, lz);
    bx(s, 0.028, 0.055, D - 0.15, steel, -lx, H - 0.085, 0);
    bx(s, 0.028, 0.055, D - 0.15, steel, lx, H - 0.085, 0);

    /* Lower shelf, slightly bowed under a decade of spare parts. */
    var shelf = bx(s, W - 0.14, 0.016, D - 0.16, mWood(), 0, 0.19, 0);
    shelf.rotation.x = 0.004;
    bx(s, W - 0.10, 0.03, 0.02, steel, 0, 0.175, -lz + 0.02);
    bx(s, W - 0.10, 0.03, 0.02, steel, 0, 0.175, lz - 0.02);

    /* Pegboard back panel with a few hooks. */
    if (opts.pegboard !== false) {
      bx(s, W - 0.06, 0.62, 0.012, mMatte('#8d8577'), 0, H + 0.32, -D / 2 + 0.02);
      bx(s, 0.03, 0.66, 0.03, steel, -W / 2 + 0.06, H + 0.33, -D / 2 + 0.045);
      bx(s, 0.03, 0.66, 0.03, steel, W / 2 - 0.06, H + 0.33, -D / 2 + 0.045);
      for (i = 0; i < 7; i++) {
        cy(s, 0.0022, 0.0022, 0.035, 6, st,
          -0.5 + i * 0.16, H + 0.42, -D / 2 + 0.04).rotation.x = HP;
      }
    }

    /* Under-top drawer on the right, pulled out 15 mm. */
    var drawer = grp('drawer');
    bx(drawer, 0.42, 0.10, 0.55, steel, 0, 0, 0);
    bx(drawer, 0.44, 0.115, 0.014, mDarkPl(), 0, 0, 0.282);
    bx(drawer, 0.14, 0.014, 0.022, mChrome(), 0, 0, 0.296);
    drawer.position.set(W / 2 - 0.30, H - 0.10, 0.015);
    g.add(drawer);

    /* Wear: a scuff, a strip of masking tape, two zip ties on the leg. */
    bx(s, 0.22, 0.001, 0.14, mBeigeGrime(), -0.34, H + 0.0005, 0.06);
    bx(s, 0.06, 0.0012, 0.10, mMatte('#c9b57e'), 0.42, H + 0.0006, -0.16);
    for (i = 0; i < 2; i++) {
      to(s, 0.032, 0.0018, mBlack(), -lx, 0.42 + i * 0.09, -lz, 4, 10).rotation.x = HP;
    }

    g.add(MG(s));
    g.userData.parts = { top: top, drawer: drawer };
    g.userData.workTop = H;
    return fin(g);
  };

  SG.models.shelfUnit = function (opts) {
    opts = opts || {};
    var W = opts.width || 0.90, D = opts.depth || 0.45, H = opts.height || 1.98;
    var levels = opts.levels || 5;
    var g = grp('shelfUnit');
    var s = grp();
    var steel = mSteelP(), st = mSteel();

    /* Angle-iron uprights (two flanges each). */
    for (var i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      var px = sx * (W / 2 - 0.015), pz = sz * (D / 2 - 0.015);
      bx(s, 0.03, H, 0.004, steel, px, H / 2, pz - sz * 0.013);
      bx(s, 0.004, H, 0.03, steel, px - sx * 0.013, H / 2, pz);
      cy(s, 0.02, 0.022, 0.006, 6, mRub(), px, 0.003, pz);
      /* punched holes read as a dotted line of dark pips */
      for (var k = 0; k < 9; k++) {
        bx(s, 0.008, 0.008, 0.0045, mDarkPl(), px, 0.12 + k * 0.21, pz - sz * 0.013);
      }
    }

    /* Shelves. */
    var shelves = [];
    for (i = 0; i < levels; i++) {
      var y = 0.09 + i * ((H - 0.20) / (levels - 1));
      var sh = bx(s, W - 0.02, 0.016, D - 0.02, steel, 0, y, 0);
      /* lipped front + back edge */
      bx(s, W - 0.02, 0.022, 0.008, steel, 0, y + 0.012, D / 2 - 0.014);
      bx(s, W - 0.02, 0.022, 0.008, steel, 0, y + 0.012, -D / 2 + 0.014);
      shelves.push(sh);
      if (i === 2) sh.rotation.z = 0.006;    /* one shelf sags */
    }

    /* Back cross-braces. */
    var diag = Math.sqrt(W * W + (H * 0.5) * (H * 0.5));
    var d1 = bx(s, diag, 0.022, 0.003, steel, 0, H * 0.5, -D / 2 + 0.01);
    d1.rotation.z = Math.atan2(H * 0.5, W);
    var d2 = bx(s, diag, 0.022, 0.003, steel, 0, H * 0.5, -D / 2 + 0.01);
    d2.rotation.z = -Math.atan2(H * 0.5, W);

    /* Label holders. */
    for (i = 0; i < levels - 1; i++) {
      lab(s, opts.labels && opts.labels[i] ? opts.labels[i] : 'PSU / CABLES', 0.13, 0.026,
        -W / 2 + 0.12, 0.09 + i * ((H - 0.20) / (levels - 1)) + 0.028, D / 2 - 0.008,
        { color: '#20242a', plate: '#e8e2cf' });
    }

    g.add(MG(s));
    g.userData.parts = { shelves: shelves };
    return fin(g);
  };

  SG.models.partsBin = function (opts) {
    opts = opts || {};
    var W = opts.width || 0.15, H = opts.height || 0.13, D = opts.depth || 0.24;
    var col = opts.color || '#c8a12c';
    var g = grp('partsBin');
    var s = grp();
    var m = mPlastic(col);
    var t = 0.004;

    bx(s, W, t, D, m, 0, t / 2, 0);                          /* floor */
    bx(s, W, H, t, m, 0, H / 2, -D / 2 + t / 2);             /* back */
    bx(s, t, H, D, m, -W / 2 + t / 2, H / 2, 0);             /* sides */
    bx(s, t, H, D, m, W / 2 - t / 2, H / 2, 0);
    bx(s, W, H * 0.42, t, m, 0, H * 0.21, D / 2 - t / 2);    /* low front */
    /* front lip + label holder */
    var lip = bx(s, W, 0.016, 0.02, m, 0, H * 0.42 + 0.005, D / 2 - 0.006);
    lip.rotation.x = -0.35;
    bx(s, W - 0.02, 0.001, 0.026, mPaper(), 0, H * 0.36, D / 2 + 0.004).rotation.x = -0.35;
    /* stacking rail + hanging hook at the back */
    bx(s, W, 0.012, 0.012, m, 0, H - 0.006, -D / 2 + 0.02);
    bx(s, 0.03, 0.024, 0.006, m, 0, H - 0.01, -D / 2 - 0.002);

    if (opts.label) {
      lab(s, opts.label, W - 0.03, 0.018, 0, H * 0.36, D / 2 + 0.006,
        { color: '#1b1e22' }).rotation.x = -0.35;
    }
    /* contents */
    if (opts.full !== false) {
      var r = U.rng(opts.seed || 7);
      for (var i = 0; i < 9; i++) {
        cy(s, 0.0035, 0.0035, 0.012, 6, mSteel(),
          (r() - 0.5) * (W - 0.03), 0.012 + r() * 0.01, (r() - 0.5) * (D - 0.05))
          .rotation.set(r() * 3, r() * 3, r() * 3);
      }
    }

    g.add(MG(s));
    return fin(g);
  };

  SG.models.drawerUnit = function (opts) {
    opts = opts || {};
    var W = 0.42, D = 0.55, H = 0.60;
    var g = grp('drawerUnit');
    var s = grp();
    var body = mSteelP(), face = mMatte('#6d7379');

    bx(s, W, H, 0.01, body, 0, H / 2, -D / 2);
    bx(s, 0.012, H, D, body, -W / 2, H / 2, 0);
    bx(s, 0.012, H, D, body, W / 2, H / 2, 0);
    bx(s, W, 0.012, D, body, 0, H - 0.006, 0);
    bx(s, W, 0.012, D, body, 0, 0.036, 0);
    bx(s, W - 0.04, 0.03, D - 0.04, body, 0, 0.018, 0);

    var drawers = [];
    for (var i = 0; i < 3; i++) {
      var dr = grp('drawer' + i);
      bx(dr, W - 0.02, 0.16, 0.014, face, 0, 0, D / 2);
      bx(dr, W - 0.05, 0.14, D - 0.06, body, 0, -0.005, 0.02);
      bx(dr, 0.15, 0.016, 0.018, mChrome(), 0, 0.04, D / 2 + 0.014);
      lab(dr, i === 0 ? 'SCREWS' : (i === 1 ? 'ADAPTERS' : 'MISC'), 0.10, 0.016,
        -0.11, -0.03, D / 2 + 0.008, { color: '#e9e4d6', plate: '#3a3f44' });
      dr.position.set(0, 0.14 + i * 0.155, i === 1 ? 0.09 : 0);
      g.add(dr);
      drawers.push(dr);
    }

    for (i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      cy(s, 0.018, 0.018, 0.024, 8, mBlack(),
        sx * (W / 2 - 0.05), 0.012, sz * (D / 2 - 0.06)).rotation.z = HP;
    }

    g.add(MG(s));
    g.userData.parts = { drawers: drawers, drawer0: drawers[0], drawer1: drawers[1], drawer2: drawers[2] };
    return fin(g);
  };

  SG.models.counterDesk = function (opts) {
    opts = opts || {};
    var W = opts.width || 2.00, D = opts.depth || 0.70, H = 1.05;
    var g = grp('counterDesk');
    var s = grp();
    var wood = mWood(), lam = mLam();

    /* Lower work surface (customer side is the tall ledge). */
    bx(s, W, 0.032, D - 0.16, lam, 0, 0.74, -0.06);
    /* Carcass */
    bx(s, W, H - 0.08, 0.02, wood, 0, (H - 0.08) / 2 + 0.08, D / 2 - 0.01);
    bx(s, 0.02, H - 0.08, D, wood, -W / 2 + 0.01, (H - 0.08) / 2 + 0.08, 0);
    bx(s, 0.02, H - 0.08, D, wood, W / 2 - 0.01, (H - 0.08) / 2 + 0.08, 0);
    bx(s, W, 0.02, D, wood, 0, 0.09, 0);
    /* kick plate + shadow gap */
    bx(s, W - 0.06, 0.08, D - 0.10, mDarkPl(), 0, 0.04, -0.02);
    /* transaction ledge, overhangs the customer side */
    var ledge = bx(s, W + 0.05, 0.04, D + 0.06, lam, 0, H - 0.02, 0.02);
    ledge.name = 'ledge';
    bx(s, W + 0.05, 0.008, 0.012, mChrome(), 0, H - 0.045, D / 2 + 0.048);
    /* internal shelf + a divider */
    bx(s, W - 0.06, 0.018, D - 0.12, wood, 0, 0.42, -0.04);
    bx(s, 0.016, 0.62, D - 0.12, wood, 0.20, 0.44, -0.04);
    /* scuffs on the customer side */
    bx(s, 0.5, 0.10, 0.002, mBeigeGrime(), -0.2, 0.20, D / 2 + 0.001);

    if (opts.sign !== false) {
      lab(s, opts.sign || 'PLEASE RING BELL', 0.34, 0.07, 0.55, 0.62, D / 2 + 0.012,
        { color: '#20242a', plate: '#dcd6c4' });
    }

    g.add(MG(s));
    g.userData.parts = { ledge: ledge };
    return fin(g);
  };

  SG.models.toolChest = function (opts) {
    opts = opts || {};
    var W = 0.66, D = 0.46, H = 0.70;
    var g = grp('toolChest');
    var s = grp();
    var red = mPlastic('#8c2118'), dark = mMatte('#5e1810');

    bx(s, W, H - 0.10, D, red, 0, (H - 0.10) / 2 + 0.10, 0);
    /* top tray lid with a raised lip */
    var lid = grp('lid');
    bx(lid, W, 0.03, D, red, 0, 0, 0);
    bx(lid, W, 0.012, 0.012, dark, 0, 0.02, D / 2 - 0.008);
    bx(lid, 0.16, 0.02, 0.03, mChrome(), 0, 0.022, -D / 2 + 0.04);
    lid.position.y = H - 0.015;
    g.add(lid);

    var drawers = [];
    var hs = [0.10, 0.10, 0.14, 0.14, 0.18];
    var yy = 0.12;
    for (var i = 0; i < hs.length; i++) {
      var dr = grp('drawer' + i);
      bx(dr, W - 0.012, hs[i] - 0.008, 0.014, red, 0, 0, D / 2 - 0.006);
      bx(dr, W - 0.05, hs[i] - 0.02, D - 0.04, mSteelP(), 0, 0, 0);
      bx(dr, W * 0.55, 0.014, 0.02, mChrome(), 0, hs[i] * 0.22, D / 2 + 0.008);
      bx(dr, 0.03, 0.014, 0.016, mChrome(), -W * 0.28, hs[i] * 0.22, D / 2 + 0.006);
      bx(dr, 0.03, 0.014, 0.016, mChrome(), W * 0.28, hs[i] * 0.22, D / 2 + 0.006);
      dr.position.set(0, yy + hs[i] / 2, i === 3 ? 0.07 : 0);
      g.add(dr);
      drawers.push(dr);
      yy += hs[i];
    }

    /* casters */
    for (i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      var mount = bx(s, 0.05, 0.04, 0.05, mSteelP(), sx * (W / 2 - 0.06), 0.09, sz * (D / 2 - 0.06));
      cy(s, 0.035, 0.035, 0.022, 10, mRub(),
        sx * (W / 2 - 0.06), 0.037, sz * (D / 2 - 0.06)).rotation.z = HP;
      mount.name = 'casterMount';
    }
    /* side handle + a faded sticker */
    bx(s, 0.014, 0.03, 0.26, mChrome(), -W / 2 - 0.01, 0.48, 0);
    lab(s, 'STEVE', 0.14, 0.05, 0.2, 0.60, D / 2 + 0.008, { color: '#e8e2d0', plate: '#6f1d15' });

    g.add(MG(s));
    g.userData.parts = { drawers: drawers, lid: lid };
    return fin(g);
  };

  SG.models.waitingChair = function (opts) {
    opts = opts || {};
    var g = grp('waitingChair');
    var s = grp();
    var tube = mMetal('#8f969c'), fab = mFab();
    var SH = 0.45;

    /* Cantilever tube frame. */
    for (var i = 0; i < 2; i++) {
      var sx = i ? 1 : -1;
      cy(s, 0.011, 0.011, 0.46, 8, tube, sx * 0.21, 0.012, 0).rotation.x = HP;
      cy(s, 0.011, 0.011, SH, 8, tube, sx * 0.21, SH / 2, -0.20);
      cy(s, 0.011, 0.011, SH, 8, tube, sx * 0.21, SH / 2, 0.20);
      cy(s, 0.011, 0.011, 0.42, 8, tube, sx * 0.21, SH, 0).rotation.x = HP;
      /* back uprights */
      var up = cy(s, 0.011, 0.011, 0.40, 8, tube, sx * 0.20, SH + 0.19, -0.21);
      up.rotation.x = -0.16;
      cy(s, 0.014, 0.016, 0.02, 6, mRub(), sx * 0.21, 0.008, -0.21);
      cy(s, 0.014, 0.016, 0.02, 6, mRub(), sx * 0.21, 0.008, 0.21);
    }
    /* Seat pan + back, moulded. */
    var seat = bx(s, 0.44, 0.05, 0.42, fab, 0, SH + 0.03, 0.01);
    seat.rotation.x = -0.03;
    bx(s, 0.42, 0.012, 0.40, mDarkPl(), 0, SH + 0.004, 0.01);
    var back = bx(s, 0.42, 0.36, 0.05, fab, 0, SH + 0.25, -0.235);
    back.rotation.x = 0.16;
    bx(s, 0.40, 0.34, 0.012, mDarkPl(), 0, SH + 0.25, -0.268).rotation.x = 0.16;

    g.add(MG(s));
    g.userData.parts = { seat: seat, back: back };
    g.userData.seatHeight = SH + 0.055;
    return fin(g);
  };

  /* ================================================================== */
  /* SMALL HARDWARE                                                     */
  /* ================================================================== */

  SG.models.screw = function (opts) {
    opts = opts || {};
    var L = opts.length || 0.008;         /* M3 x 8 */
    var r = opts.r || 0.0015;
    var hr = opts.head || 0.0028;
    var g = grp('screw');
    var m = opts.black ? mMatte('#2a2c30') : mSteel();
    cy(g, r, r * 0.85, L, 8, m, 0, L / 2, 0);
    cy(g, hr, hr, 0.0013, 8, m, 0, L + 0.00065, 0);
    /* phillips cross */
    bx(g, hr * 1.6, 0.0004, 0.0006, mDarkPl(), 0, L + 0.0013, 0);
    bx(g, 0.0006, 0.0004, hr * 1.6, mDarkPl(), 0, L + 0.0013, 0);
    return fin(g, false, false);
  };

  SG.models.cr2032 = function (opts) {
    opts = opts || {};
    var g = grp('cr2032');
    var body = raw('coincell', { color: 0xd6dadd, roughness: 0.24, metalness: 1 });
    cy(g, 0.010, 0.010, 0.0032, 12, body, 0, 0.0016, 0);
    cy(g, 0.0082, 0.0082, 0.0034, 12, raw('coinface', {
      color: 0xbfc4c8, roughness: 0.35, metalness: 1
    }), 0, 0.0017, 0);
    lab(g, 'CR2032', 0.014, 0.005, 0, 0.0034, 0,
      { color: '#20242a', plate: '#c9ced2' }).rotation.x = -HP;
    return fin(g, false, false);
  };

  SG.models.cableRun = function (a, b) {
    var pts, opts;
    if (Object.prototype.toString.call(a) === '[object Array]') { pts = a; opts = b || {}; }
    else { opts = a || {}; pts = opts.points; }
    if (!pts || pts.length < 2) pts = [[0, 0, 0], [0.4, 0, 0], [0.8, 0, 0.2]];
    var g = grp('cableRun');
    var mat = opts.mat || raw('cablepvc' + (opts.color || 'k'), {
      color: new THREE.Color(opts.color || '#1a1b1d'), roughness: 0.82, metalness: 0
    });
    cable(g, pts, opts.radius || 0.004, mat,
      opts.sag === undefined ? 0.16 : opts.sag, opts.segments);
    if (opts.ties) {
      for (var i = 0; i < pts.length; i++) {
        to(g, (opts.radius || 0.004) + 0.0012, 0.0012, mBlack(),
          pts[i][0], pts[i][1], pts[i][2], 4, 8);
      }
    }
    return fin(g, false, false);
  };

  SG.models.powerStrip = function (opts) {
    opts = opts || {};
    var n = opts.sockets || 6;
    var W = 0.055 * n + 0.06, H = 0.038, D = 0.055;
    var g = grp('powerStrip');
    var s = grp();
    var body = mMatte('#e6e3da');
    bx(s, W, H, D, body, 0, H / 2, 0);
    for (var i = 0; i < n; i++) {
      var x = -W / 2 + 0.055 + i * 0.055;
      bx(s, 0.042, 0.004, 0.042, mDarkPl(), x, H, 0);
      cy(s, 0.0025, 0.0025, 0.006, 6, mDarkPl(), x - 0.0095, H, 0.004);
      cy(s, 0.0025, 0.0025, 0.006, 6, mDarkPl(), x + 0.0095, H, 0.004);
      bx(s, 0.004, 0.004, 0.009, mDarkPl(), x, H, -0.014);
    }
    /* illuminated rocker switch */
    var sw = bx(s, 0.022, 0.008, 0.016, mEmis('#e8402a', 1.4), -W / 2 + 0.024, H - 0.002, 0);
    sw.name = 'switch';
    sw.rotation.x = 0.15;
    /* strain relief + tail */
    cy(s, 0.008, 0.006, 0.02, 8, mBlack(), W / 2 + 0.008, H / 2, 0).rotation.z = HP;
    cable(s, [[W / 2 + 0.02, H / 2, 0], [W / 2 + 0.18, 0.012, 0.06], [W / 2 + 0.34, 0.006, -0.05]],
      0.004, mBlack(), 0.1);
    g.add(MG(s));
    g.userData.parts = { switch: sw };
    return fin(g, false, true);
  };

  /* ================================================================== */
  /* COMPUTER HARDWARE                                                  */
  /* ================================================================== */

  /* Electrolytic capacitor: aluminium can, dark sleeve, vented top.
   * Axis is +Z (standing off a board that lies in XY). */
  function capacitor(par, x, y, r, h, mat) {
    var c = new THREE.Mesh(CY(r, r, h, r > 0.004 ? 8 : 6), mat);
    c.position.set(x, y, h / 2 + 0.001);
    c.rotation.x = HP;
    par.add(c);
    var t = new THREE.Mesh(CY(r * 0.92, r * 0.92, 0.0008, 6), mDarkPl());
    t.position.set(x, y, h + 0.0012);
    t.rotation.x = HP;
    par.add(t);
    return c;
  }

  /* A pin-header / connector shell with a keyed notch. */
  function header(par, x, y, w, h, tall, mat) {
    bx(par, w, h, tall, mat, x, y, tall / 2 + 0.001);
    bx(par, w - 0.004, h - 0.003, tall - 0.002, mDarkPl(), x, y, tall / 2 + 0.002);
  }

  /* Card-edge slot: body + keying bar + latches at both ends. */
  function slot(par, x, y, len, wide, tall, mat, axis, latch) {
    var body;
    if (axis === 'y') body = bx(par, wide, len, tall, mat, x, y, tall / 2 + 0.001);
    else body = bx(par, len, wide, tall, mat, x, y, tall / 2 + 0.001);
    /* dark channel down the middle */
    if (axis === 'y') bx(par, wide * 0.45, len - 0.006, tall * 0.5, mDarkPl(), x, y, tall + 0.0005);
    else bx(par, len - 0.006, wide * 0.45, tall * 0.5, mDarkPl(), x, y, tall + 0.0005);
    if (latch) {
      var lm = mMatte('#dcd8cf');
      if (axis === 'y') {
        bx(par, wide * 0.8, 0.008, 0.012, lm, x, y + len / 2 + 0.004, 0.007);
        bx(par, wide * 0.8, 0.008, 0.012, lm, x, y - len / 2 - 0.004, 0.007);
      } else {
        bx(par, 0.008, wide * 0.8, 0.012, lm, x + len / 2 + 0.004, y, 0.007);
      }
    }
    return body;
  }

  SG.models.motherboard = function (opts) {
    opts = opts || {};
    var g = grp('motherboard');
    var s = grp();
    var BW = 0.244, BH = 0.305, BT = 0.0016;
    var pcb = mPcb();
    var blk = mBlack(), gold = mGold(), alu = mAlu(), sil = mSilicon();
    var can = raw('capcan', { color: 0xb9bec3, roughness: 0.3, metalness: 1 });

    /* ---- PCB ---- */
    bx(s, BW, BH, BT, pcb, 0, BH / 2, 0);
    /* mounting holes (ringed pads) */
    var holes = [[-0.108, 0.02], [0.108, 0.02], [-0.108, 0.148], [0.108, 0.148],
      [-0.108, 0.292], [0.108, 0.292], [0.0, 0.292], [0.0, 0.02], [0.04, 0.148]];
    for (var i = 0; i < holes.length; i++) {
      cy(s, 0.0035, 0.0035, BT + 0.0006, 6, mSteel(), holes[i][0], holes[i][1], 0)
        .rotation.x = HP;
    }
    /* copper trace hint + silkscreen */
    bx(s, BW - 0.02, 0.0004, 0.0002, mCopper(), 0, 0.165, BT / 2 + 0.0002);
    bx(s, 0.0004, BH - 0.03, 0.0002, mCopper(), -0.085, BH / 2, BT / 2 + 0.0002);
    lab(s, opts.silk || 'TX-PRO II  REV 2.1', 0.08, 0.012, -0.055, 0.012, BT / 2 + 0.0004,
      { color: '#e8efe6', plate: '#1c6b40' });

    /* ---- Rear I/O cluster (+X edge, upper 159 mm) ---- */
    var io = grp('ioShield');
    var shieldY0 = 0.146, shieldY1 = 0.3045;
    var shy = (shieldY0 + shieldY1) / 2;
    bx(io, 0.0008, shieldY1 - shieldY0, 0.0455, mSteel(), 0.1255, shy, 0.0238);
    function port(y0, y1, z0, z1, col) {
      var w = 0.032;
      var m = col ? mPlastic(col) : blk;
      bx(io, w, y1 - y0, z1 - z0, m, 0.1255 - w / 2 - 0.001, (y0 + y1) / 2, (z0 + z1) / 2);
      bx(io, 0.004, (y1 - y0) * 0.66, (z1 - z0) * 0.6, mDarkPl(),
        0.1245, (y0 + y1) / 2, (z0 + z1) / 2);
    }
    port(0.288, 0.3005, 0.019, 0.032, '#39c46a');       /* PS/2 mouse  — green  */
    port(0.288, 0.3005, 0.004, 0.017, '#8c5fd0');       /* PS/2 keybd  — purple */
    port(0.252, 0.2845, 0.004, 0.017, '#d24bb0');       /* parallel DB25 */
    port(0.252, 0.2845, 0.021, 0.034, '#2f7fd0');       /* VGA DB15 — blue */
    port(0.212, 0.244, 0.004, 0.017, '#1f9aa0');        /* serial COM1 */
    port(0.212, 0.244, 0.021, 0.034, '#1f9aa0');        /* serial COM2 */
    port(0.186, 0.204, 0.005, 0.021);                   /* USB stack */
    bx(io, 0.03, 0.016, 0.006, mMatte('#dedbd2'), 0.109, 0.195, 0.0125);
    for (i = 0; i < 3; i++) {                            /* audio jacks */
      var jy = 0.152 + i * 0.011;
      cy(io, 0.0042, 0.0042, 0.014, 8, i === 0 ? mPlastic('#7ec24a')
        : (i === 1 ? mPlastic('#f0a0b8') : mPlastic('#3aa8e0')), 0.117, jy, 0.014)
        .rotation.z = HP;
    }
    s.add(io);

    /* ---- CPU socket + heatsink ---- */
    var sockX = 0.055, sockY = 0.238;
    var sock = bx(s, 0.052, 0.052, 0.005, blk, sockX, sockY, 0.0035);
    sock.name = 'socket';
    bx(s, 0.044, 0.044, 0.002, mDarkPl(), sockX, sockY, 0.006);
    /* ZIF lever */
    var lev = bx(s, 0.06, 0.0025, 0.0025, mSteel(), sockX - 0.002, sockY - 0.029, 0.004);
    lev.name = 'zifLever';
    bx(s, 0.0025, 0.008, 0.0025, mSteel(), sockX + 0.028, sockY - 0.025, 0.004);
    /* heatsink + 60 mm fan on top */
    var hs = grp('cpuHeatsink');
    bx(hs, 0.06, 0.06, 0.004, alu, 0, 0, 0.008);
    for (i = 0; i < 11; i++) {
      bx(hs, 0.0016, 0.058, 0.022, alu, -0.027 + i * 0.0054, 0, 0.021);
    }
    bx(hs, 0.062, 0.062, 0.004, mDarkPl(), 0, 0, 0.034);
    var fanb = grp('cpuFanBlades');
    cy(fanb, 0.007, 0.007, 0.006, 8, blk, 0, 0, 0).rotation.x = HP;
    for (i = 0; i < 7; i++) {
      var bl = bx(fanb, 0.021, 0.0012, 0.009, mMatte('#3c4046'), 0, 0, 0);
      bl.rotation.z = i * (Math.PI * 2 / 7);
      bl.position.set(Math.cos(bl.rotation.z) * 0.016, Math.sin(bl.rotation.z) * 0.016, 0);
      bl.rotation.z += 0.4;
    }
    fanb.position.set(0, 0, 0.038);
    hs.add(fanb);
    hs.position.set(sockX, sockY, 0);
    g.add(hs);

    /* ---- DIMM slots (vertical, 133 mm) ---- */
    var dimm = [];
    for (i = 0; i < 4; i++) {
      var dx = -0.018 - i * 0.0105;
      slot(s, dx, 0.200, 0.133, 0.0075, 0.009, i < 2 ? blk : mMatte('#2b2f34'), 'y', true);
      dimm.push({ x: dx, y: 0.200, z: 0.004 });
    }

    /* ---- Expansion slots (horizontal, stacked) ---- */
    var rearX = 0.112;
    var agp = { x: rearX, y: 0.1355, z: 0.004 };
    var agpLen = 0.085;
    slot(s, rearX - agpLen / 2, agp.y, agpLen, 0.0085, 0.010, mPlastic('#6d3b1f'), 'x', true);
    var pci = [];
    for (i = 0; i < 3; i++) {
      var py = 0.1155 - i * 0.0203;
      slot(s, rearX - 0.0425, py, 0.085, 0.0085, 0.009, mMatte('#e4e0d6'), 'x', true);
      pci.push({ x: rearX, y: py, z: 0.004 });
    }
    for (i = 0; i < 2; i++) {
      var iy = 0.0525 - i * 0.0203;
      slot(s, rearX - 0.065, iy, 0.130, 0.009, 0.010, blk, 'x', false);
    }

    /* ---- Chipset + BIOS + assorted silicon ---- */
    bx(s, 0.028, 0.028, 0.003, sil, -0.005, 0.098, 0.0025);
    var chs = bx(s, 0.032, 0.032, 0.004, alu, -0.005, 0.098, 0.006);
    chs.name = 'chipsetHeatsink';
    for (i = 0; i < 6; i++) bx(s, 0.0016, 0.030, 0.008, alu, -0.019 + i * 0.0056, 0.098, 0.012);
    bx(s, 0.02, 0.010, 0.0025, blk, 0.062, 0.062, 0.0025);   /* BIOS */
    lab(s, 'BIOS', 0.016, 0.006, 0.062, 0.062, 0.0041, { color: '#d8d4c8', plate: '#1a1c20' });
    bx(s, 0.030, 0.008, 0.002, blk, -0.055, 0.062, 0.002);
    bx(s, 0.014, 0.014, 0.002, blk, 0.030, 0.090, 0.002);
    bx(s, 0.012, 0.006, 0.0018, blk, -0.080, 0.230, 0.0019);

    /* ---- Power + drive headers ---- */
    header(s, -0.098, 0.252, 0.011, 0.052, 0.012, mMatte('#e8e5da'));  /* ATX 20-pin */
    header(s, 0.030, 0.288, 0.010, 0.020, 0.010, blk);                 /* aux 12 V   */
    header(s, -0.100, 0.120, 0.010, 0.048, 0.010, blk);                /* IDE 0 */
    header(s, -0.100, 0.066, 0.010, 0.048, 0.010, blk);                /* IDE 1 */
    header(s, -0.100, 0.020, 0.009, 0.040, 0.009, mMatte('#2a2d31'));  /* floppy */
    /* front-panel pin block + a couple of jumpers */
    bx(s, 0.020, 0.006, 0.005, blk, 0.070, 0.014, 0.0035);
    bx(s, 0.005, 0.004, 0.006, mPlastic('#2f6fd0'), 0.068, 0.028, 0.004);
    bx(s, 0.005, 0.004, 0.006, mPlastic('#d0402f'), 0.080, 0.028, 0.004);

    /* ---- Capacitors: three sizes, clustered where the heat is ---- */
    var caps = [
      [0.020, 0.276, 0.005, 0.020], [0.032, 0.276, 0.005, 0.020],
      [0.008, 0.272, 0.004, 0.016], [0.086, 0.272, 0.004, 0.016],
      [0.092, 0.250, 0.005, 0.020], [0.092, 0.226, 0.004, 0.016],
      [0.014, 0.246, 0.004, 0.016], [0.014, 0.222, 0.003, 0.011],
      [0.026, 0.216, 0.003, 0.011], [-0.004, 0.212, 0.003, 0.011],
      [-0.072, 0.268, 0.004, 0.016], [-0.084, 0.286, 0.003, 0.011],
      [-0.062, 0.286, 0.003, 0.011], [-0.030, 0.150, 0.003, 0.011],
      [-0.048, 0.140, 0.004, 0.016], [0.030, 0.118, 0.003, 0.011],
      [0.048, 0.104, 0.003, 0.011], [-0.070, 0.088, 0.004, 0.016],
      [-0.086, 0.150, 0.005, 0.020], [-0.086, 0.176, 0.004, 0.016],
      [0.062, 0.166, 0.003, 0.011], [0.078, 0.180, 0.003, 0.011]
    ];
    for (i = 0; i < caps.length; i++) {
      capacitor(s, caps[i][0], caps[i][1], caps[i][2], caps[i][3], can);
    }
    /* VRM chokes + mosfets near the socket */
    for (i = 0; i < 3; i++) {
      bx(s, 0.009, 0.009, 0.006, mMatte('#2b2723'), 0.100, 0.290 - i * 0.013, 0.004);
      bx(s, 0.005, 0.010, 0.005, blk, 0.088, 0.290 - i * 0.013, 0.0035);
    }

    /* ---- Coin cell holder + CR2032 (the whole reason we are here) ---- */
    var holder = grp('batteryHolder');
    bx(holder, 0.024, 0.020, 0.002, mMatte('#2c3036'), 0, 0, 0.001);
    bx(holder, 0.024, 0.003, 0.006, mSteel(), 0, -0.0105, 0.004);
    bx(holder, 0.006, 0.004, 0.007, mSteel(), 0, 0.0105, 0.0045);
    holder.position.set(-0.086, 0.040, 0.001);
    s.add(holder);
    var bat = SG.models.cr2032();
    bat.name = 'battery';
    bat.rotation.x = -HP;
    bat.position.set(-0.086, 0.040, 0.0045);
    g.add(bat);

    g.add(MG(s));
    g.userData.parts = {
      battery: bat, holder: holder, socket: sock, heatsink: hs, fan: fanb,
      dimm: dimm, agp: agp, pci: pci, io: io
    };
    return fin(g, true, false);
  };

  SG.models.ramStick = function (opts) {
    opts = opts || {};
    var L = opts.length || 0.133, H = opts.height || 0.031, T = 0.0016;
    var g = grp('ramStick');
    var s = grp();
    var pcb = opts.dark ? mMatte('#123024') : mPcb();
    bx(s, L, H, T, pcb, 0, H / 2, 0);
    /* gold fingers with the keying notch */
    for (var side = -1; side <= 1; side += 2) {
      bx(s, L * 0.34, 0.004, 0.0004, mGold(), -L * 0.28, 0.002, side * (T / 2 + 0.0002));
      bx(s, L * 0.42, 0.004, 0.0004, mGold(), L * 0.22, 0.002, side * (T / 2 + 0.0002));
    }
    bx(s, 0.0025, 0.006, T + 0.001, mDarkPl(), -L * 0.05, 0.002, 0);
    /* chips: 8 packages, two rows if it is a double-sider */
    var chip = mMatte('#1b1d21');
    for (var i = 0; i < 8; i++) {
      bx(s, 0.0115, 0.0095, 0.0012, chip, -L / 2 + 0.012 + i * 0.0152, H * 0.62, T / 2 + 0.0006);
    }
    bx(s, 0.005, 0.004, 0.001, chip, L / 2 - 0.010, H * 0.30, T / 2 + 0.0005);
    lab(s, opts.label || '128MB PC100', 0.05, 0.008, -0.028, H * 0.24, T / 2 + 0.0007,
      { color: '#20242a', plate: '#e6e2d6' });
    if (opts.heatspreader) {
      bx(s, L - 0.004, H - 0.004, 0.0055, mMetal('#8d939a'), 0, H / 2 + 0.002, 0);
    }
    g.add(MG(s));
    return fin(g, true, false);
  };

  SG.models.gpuCard = function (opts) {
    opts = opts || {};
    var L = opts.length || 0.19, H = opts.height || 0.098, T = 0.0016;
    var g = grp('gpuCard');
    var s = grp();
    var pcb = opts.retro ? mMatte('#14512e') : mMatte('#101216');
    /* PCB — contact edge at y = 0, bracket at +X */
    bx(s, L, H, T, pcb, 0, H / 2, 0);
    bx(s, L * 0.55, 0.005, 0.0004, mGold(), -L * 0.14, 0.0025, T / 2 + 0.0003);
    bx(s, L * 0.16, 0.005, 0.0004, mGold(), L * 0.34, 0.0025, T / 2 + 0.0003);
    bx(s, 0.0025, 0.007, T + 0.001, mDarkPl(), L * 0.19, 0.0025, 0);
    /* GPU + memory under a shroud */
    bx(s, 0.026, 0.026, 0.0025, mSilicon(), -0.01, 0.042, T / 2 + 0.0012);
    for (var i = 0; i < 4; i++) {
      bx(s, 0.011, 0.011, 0.0012, mMatte('#1b1d21'), -0.048 + i * 0.018, 0.070, T / 2 + 0.0006);
    }
    /* heatsink + fan shroud on the +Z face */
    var shroud = mMatte('#2a2d32');
    bx(s, L - 0.03, H - 0.016, 0.004, shroud, -0.008, H * 0.5, 0.016);
    bx(s, L - 0.03, 0.006, 0.030, shroud, -0.008, H - 0.012, 0.004);
    bx(s, L - 0.03, 0.006, 0.030, shroud, -0.008, 0.010, 0.004);
    for (i = 0; i < 12; i++) {
      bx(s, 0.0014, H - 0.026, 0.012, mAlu(), -0.07 + i * 0.0075, H * 0.5, 0.010);
    }
    var fan = grp('gpuFan');
    cy(fan, 0.006, 0.006, 0.005, 8, mBlack(), 0, 0, 0).rotation.x = HP;
    for (i = 0; i < 9; i++) {
      var a = i * (Math.PI * 2 / 9);
      var bl = bx(fan, 0.018, 0.0011, 0.008, mMatte('#3a3e44'),
        Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0);
      bl.rotation.z = a + 0.45;
    }
    fan.position.set(0.038, H * 0.5, 0.019);
    g.add(fan);
    /* I/O bracket at +X with DVI + VGA */
    bx(s, 0.0015, 0.120, 0.018, mSteel(), L / 2 + 0.004, 0.055, 0.009);
    bx(s, 0.010, 0.026, 0.012, mPlastic('#e8e4d8'), L / 2 - 0.002, 0.030, 0.010);
    bx(s, 0.010, 0.022, 0.012, mPlastic('#2f7fd0'), L / 2 - 0.002, 0.062, 0.010);
    bx(s, 0.006, 0.014, 0.008, mDarkPl(), L / 2 - 0.001, 0.086, 0.010);
    /* 6-pin PCIe power on the top edge, and a bent capacitor */
    bx(s, 0.020, 0.008, 0.010, mMatte('#e8e5da'), -L / 2 + 0.03, H + 0.002, 0.006);
    g.add(MG(s));
    g.userData.parts = { fan: fan };
    g.userData.bracketX = L / 2 + 0.004;
    return fin(g, true, false);
  };

  SG.models.psu = function (opts) {
    opts = opts || {};
    var W = 0.15, H = 0.086, D = 0.14;
    var g = grp('psu');
    var s = grp();
    var shell = opts.dark ? mMatte('#26292d') : mSteel();

    bx(s, W, H, D, shell, 0, H / 2, 0);
    /* 80 mm exhaust fan + grille on the rear (-Z) */
    cy(s, 0.039, 0.039, 0.004, 12, mDarkPl(), 0.035, H / 2, -D / 2 - 0.001).rotation.x = HP;
    var fan = grp('psuFan');
    cy(fan, 0.008, 0.008, 0.008, 8, mBlack(), 0, 0, 0).rotation.x = HP;
    for (var i = 0; i < 7; i++) {
      var a = i * (Math.PI * 2 / 7);
      var bl = bx(fan, 0.028, 0.0014, 0.012, mMatte('#3a3e44'),
        Math.cos(a) * 0.021, Math.sin(a) * 0.021, 0);
      bl.rotation.z = a + 0.5;
    }
    fan.position.set(0.035, H / 2, -D / 2 + 0.008);
    g.add(fan);
    for (i = 0; i < 7; i++) {
      bx(s, 0.076, 0.003, 0.002, shell, 0.035, H / 2 - 0.033 + i * 0.011, -D / 2 - 0.002);
    }
    /* IEC inlet, passthrough, voltage switch, rocker */
    bx(s, 0.026, 0.024, 0.008, mBlack(), -0.045, 0.026, -D / 2 - 0.003);
    bx(s, 0.020, 0.018, 0.004, mDarkPl(), -0.045, 0.026, -D / 2 - 0.006);
    bx(s, 0.026, 0.024, 0.008, mBlack(), -0.045, 0.058, -D / 2 - 0.003);
    bx(s, 0.012, 0.008, 0.006, mPlastic('#c0392b'), -0.012, 0.058, -D / 2 - 0.003);
    bx(s, 0.018, 0.010, 0.006, mBlack(), -0.012, 0.026, -D / 2 - 0.003);
    lab(s, opts.label || '250W ATX', 0.09, 0.05, 0, H / 2 + 0.01, D / 2 + 0.001,
      { color: '#20242a', plate: '#d8d4c6' });
    /* top vent slots + a warranty sticker */
    for (i = 0; i < 9; i++) bx(s, 0.10, 0.002, 0.004, mDarkPl(), 0, H + 0.001, -0.05 + i * 0.012);
    lab(s, 'WARRANTY VOID', 0.05, 0.014, -0.05, H + 0.0015, 0.052,
      { color: '#7c6f52', plate: '#cfc7ad' }).rotation.x = -HP;

    /* Cable loom out of the front face. */
    if (opts.loom !== false) {
      var loom = grp('loom');
      var pv = mMatte('#e6e3da');
      cable(loom, [[-0.02, H * 0.6, D / 2], [-0.02, H * 0.45, D / 2 + 0.07],
        [0.01, H * 0.30, D / 2 + 0.13]], 0.009, mBlack(), 0.1, 18);
      cable(loom, [[0.02, H * 0.5, D / 2], [0.05, H * 0.34, D / 2 + 0.06],
        [0.03, H * 0.2, D / 2 + 0.12]], 0.005, mMatte('#c8b53a'), 0.12, 14);
      cable(loom, [[0.05, H * 0.45, D / 2], [0.08, H * 0.3, D / 2 + 0.05],
        [0.07, H * 0.16, D / 2 + 0.10]], 0.004, mMatte('#b02f28'), 0.12, 14);
      /* the 20-pin ATX head on the end of the fat bundle */
      var hd = bx(loom, 0.011, 0.052, 0.012, pv, 0.01, H * 0.30, D / 2 + 0.135);
      hd.name = 'atxPlug';
      loom.name = 'loom';
      g.add(loom);
    }

    g.add(MG(s));
    g.userData.parts = { fan: fan };
    return fin(g);
  };

  SG.models.hdd = function (opts) {
    opts = opts || {};
    var W = 0.1016, H = 0.0261, D = 0.147;
    var g = grp('hdd');
    var s = grp();
    var cast = mMetal('#9aa1a7');
    bx(s, W, H - 0.004, D, cast, 0, (H - 0.004) / 2 + 0.004, 0);
    bx(s, W - 0.004, 0.0025, D - 0.004, mPcb(), 0, 0.0022, 0);   /* controller PCB */
    for (var i = 0; i < 5; i++) {
      bx(s, 0.008, 0.0016, 0.006, mMatte('#1b1d21'), -0.03 + i * 0.016, 0.0008, -0.03);
    }
    /* top plate + 6 recessed torx screws */
    bx(s, W - 0.006, 0.002, D - 0.006, mMetal('#b6bcc1'), 0, H - 0.001, 0);
    var sc = [[-0.043, -0.065], [0.043, -0.065], [-0.043, 0.065], [0.043, 0.065],
      [-0.043, 0], [0.043, 0]];
    for (i = 0; i < sc.length; i++) screwHead(s, sc[i][0], H + 0.0005, sc[i][1], 0.0028, mSteel());
    /* breather hole + label */
    cy(s, 0.002, 0.002, 0.001, 6, mDarkPl(), 0.02, H + 0.0005, -0.05);
    lab(s, opts.label || 'DELTASTAR 8.4GB', W - 0.012, D - 0.03, 0, H + 0.0012, 0,
      { color: '#1b1e22', plate: '#dad6c8' }).rotation.x = -HP;
    /* rear: 40-pin IDE, jumper block, molex */
    bx(s, 0.052, 0.009, 0.008, mBlack(), -0.02, 0.012, -D / 2 - 0.002);
    bx(s, 0.012, 0.008, 0.006, mBlack(), 0.014, 0.012, -D / 2 - 0.002);
    bx(s, 0.021, 0.011, 0.008, mMatte('#e8e5da'), 0.035, 0.012, -D / 2 - 0.002);
    /* side mounting holes */
    for (i = 0; i < 3; i++) {
      screwHead(s, -W / 2 - 0.0005, 0.011, -0.05 + i * 0.05, 0.0026, mDarkPl(), 'x');
      screwHead(s, W / 2 + 0.0005, 0.011, -0.05 + i * 0.05, 0.0026, mDarkPl(), 'x');
    }
    g.add(MG(s));
    return fin(g);
  };

  SG.models.ssd = function (opts) {
    opts = opts || {};
    var W = 0.10, H = 0.007, D = 0.0699;
    var g = grp('ssd');
    var s = grp();
    bx(s, W, H, D, mMetal('#3c4148'), 0, H / 2, 0);
    bx(s, W - 0.004, 0.0012, D - 0.004, mMatte('#22262b'), 0, 0.0006, 0);
    lab(s, opts.label || 'SSD 480GB', 0.07, 0.04, 0, H + 0.0004, 0,
      { color: '#e6e2d6', plate: '#2a2e34' }).rotation.x = -HP;
    /* SATA data + power tabs */
    bx(s, 0.014, 0.0032, 0.005, mMatte('#1b1d21'), -0.026, 0.0035, -D / 2 - 0.001);
    bx(s, 0.021, 0.0032, 0.005, mMatte('#1b1d21'), -0.004, 0.0035, -D / 2 - 0.001);
    g.add(MG(s));
    return fin(g, true, false);
  };

  SG.models.cpuChip = function (opts) {
    opts = opts || {};
    var A = 0.0495;
    var g = grp('cpuChip');
    var s = grp();
    var sub = mMatte(opts.color || '#3a3630');
    /* pin field, approximated: dark plate + a border ring of pins */
    bx(s, A - 0.004, 0.0028, A - 0.004, mDarkPl(), 0, 0.0014, 0);
    for (var i = 0; i < 10; i++) {
      var t = -A / 2 + 0.006 + i * 0.0043;
      cy(s, 0.0004, 0.0004, 0.0028, 4, mGold(), t, 0.0014, -A / 2 + 0.005);
      cy(s, 0.0004, 0.0004, 0.0028, 4, mGold(), t, 0.0014, A / 2 - 0.005);
      cy(s, 0.0004, 0.0004, 0.0028, 4, mGold(), -A / 2 + 0.005, 0.0014, t);
      cy(s, 0.0004, 0.0004, 0.0028, 4, mGold(), A / 2 - 0.005, 0.0014, t);
    }
    /* ceramic substrate with a chamfered pin-1 corner */
    bx(s, A, 0.0022, A, sub, 0, 0.0039, 0);
    bx(s, 0.004, 0.0024, 0.004, mMatte('#c8a63c'), -A / 2 + 0.004, 0.0039, -A / 2 + 0.004);
    /* die + printed part number */
    bx(s, 0.0125, 0.0009, 0.0125, mSilicon(), 0, 0.0054, 0);
    lab(s, opts.label || 'PENTIUM II 400', 0.036, 0.010, 0, 0.0051, 0.014,
      { color: '#e2ded2', plate: '#3a3630' }).rotation.x = -HP;
    g.add(MG(s));
    return fin(g, true, false);
  };

  SG.models.heatsink = function (opts) {
    opts = opts || {};
    var A = opts.size || 0.06, fins = opts.fins || 13, HT = opts.height || 0.035;
    var g = grp('heatsink');
    var s = grp();
    var alu = mAlu();
    bx(s, A, 0.005, A, alu, 0, 0.0025, 0);
    for (var i = 0; i < fins; i++) {
      bx(s, 0.0016, HT - 0.005, A - 0.002, alu,
        -A / 2 + 0.004 + i * ((A - 0.008) / (fins - 1)), (HT - 0.005) / 2 + 0.005, 0);
    }
    if (opts.clip !== false) {
      bx(s, A + 0.012, 0.0015, 0.005, mSteel(), 0, HT * 0.35, 0);
    }
    if (opts.thermal !== false) {
      bx(s, A * 0.5, 0.0006, A * 0.5, mMatte('#d8d5cc'), 0, 0.0002, 0);
    }
    g.add(MG(s));
    return fin(g, true, false);
  };

  SG.models.caseFan = function (opts) {
    opts = opts || {};
    var A = opts.size || 0.08, T = opts.thick || 0.025;
    var g = grp('caseFan');
    var s = grp();
    var frame = opts.clear ? mPlastic('#b9c0c6') : mMatte('#26292e');
    /* frame: four rails + rounded corners, axis along +Z, base at y = 0 */
    bx(s, A, 0.009, T, frame, 0, A - 0.0045, 0);
    bx(s, A, 0.009, T, frame, 0, 0.0045, 0);
    bx(s, 0.009, A, T, frame, -A / 2 + 0.0045, A / 2, 0);
    bx(s, 0.009, A, T, frame, A / 2 - 0.0045, A / 2, 0);
    for (var i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sy = (i & 2) ? 1 : -1;
      screwHead(s, sx * (A / 2 - 0.005), A / 2 + sy * (A / 2 - 0.005), T / 2 + 0.0006,
        0.0032, mSteel(), 'z');
    }
    /* hub + blades */
    var blades = grp('blades');
    cy(blades, A * 0.21, A * 0.21, T - 0.006, 10, mMatte('#1e2126'), 0, 0, 0).rotation.x = HP;
    lab(blades, opts.label || '', A * 0.32, A * 0.32, 0, 0, (T - 0.006) / 2 + 0.0004,
      { plate: '#d8d4c8' });
    var bn = opts.blades || 7;
    for (i = 0; i < bn; i++) {
      var a = i * (Math.PI * 2 / bn);
      var bl = bx(blades, A * 0.30, 0.0014, T * 0.62, mMatte('#3b3f45'),
        Math.cos(a) * A * 0.28, Math.sin(a) * A * 0.28, 0);
      bl.rotation.z = a + 0.5;
      bl.rotation.y = 0.35;
    }
    blades.position.set(0, A / 2, 0);
    g.add(blades);
    /* wire tail */
    cable(s, [[A / 2 - 0.008, A - 0.004, 0], [A / 2 + 0.03, A - 0.02, 0.01],
      [A / 2 + 0.05, A - 0.06, -0.01]], 0.002, mBlack(), 0.05, 12);
    g.add(MG(s));
    g.userData.parts = { blades: blades };
    return fin(g, true, false);
  };

  /* ==SPLIT== */

})(window.SG, window.THREE);

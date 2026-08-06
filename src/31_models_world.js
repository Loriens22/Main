/* =====================================================================
 * STEVE — THE PC REPAIR MAN
 * 31_models_world.js — travel, hotel, server-vault and street props.
 *
 * Everything here is metric and built to the same contract:
 *   +Y up, base at y = 0, facing +Z, measured into userData.size,
 *   animated sub-objects named and listed in userData.parts.
 *
 * Materials and textures are resolved lazily so this file works whether or
 * not 10_textures.js / 11_materials.js have landed.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';
  if (!SG || !THREE) return;

  var U = SG.util;
  var MODELS = SG.models;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* Scratch — hoisted so the per-frame helpers never allocate. */
  var _v1 = new THREE.Vector3();

  /* ------------------------------------------------------------------ */
  /* Geometry cache                                                      */
  /* ------------------------------------------------------------------ */

  var GEO = {};

  function key(tag) {
    var s = tag;
    for (var i = 1; i < arguments.length; i++) {
      var a = arguments[i];
      s += ',' + (typeof a === 'number' ? Math.round(a * 1e4) / 1e4 : a);
    }
    return s;
  }

  function BOX(w, h, d) {
    var k = key('B', w, h, d);
    return GEO[k] || (GEO[k] = new THREE.BoxGeometry(w, h, d));
  }

  function CYL(rt, rb, h, seg, open, ts, tl) {
    seg = seg || 8;
    ts = ts || 0;
    tl = tl === undefined ? TAU : tl;
    var k = key('C', rt, rb, h, seg, open ? 1 : 0, ts, tl);
    return GEO[k] || (GEO[k] =
      new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open, ts, tl));
  }

  function CONE(r, h, seg) {
    seg = seg || 8;
    var k = key('N', r, h, seg);
    return GEO[k] || (GEO[k] = new THREE.ConeGeometry(r, h, seg, 1));
  }

  function SPH(r, w, h) {
    w = w || 8; h = h || 6;
    var k = key('S', r, w, h);
    return GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, w, h));
  }

  function PLN(w, h) {
    var k = key('P', w, h);
    return GEO[k] || (GEO[k] = new THREE.PlaneGeometry(w, h));
  }

  function CIR(r, seg) {
    seg = seg || 12;
    var k = key('R', r, seg);
    return GEO[k] || (GEO[k] = new THREE.CircleGeometry(r, seg));
  }

  function TOR(r, t, rs, ts) {
    rs = rs || 4; ts = ts || 12;
    var k = key('T', r, t, rs, ts);
    return GEO[k] || (GEO[k] = new THREE.TorusGeometry(r, t, rs, ts));
  }

  function LATHE(pts, seg) {
    /* pts: flat array [x0,y0, x1,y1, ...] */
    var k = key('L', pts.join('_'), seg || 10);
    if (GEO[k]) return GEO[k];
    var v = [];
    for (var i = 0; i < pts.length; i += 2) v.push(new THREE.Vector2(pts[i], pts[i + 1]));
    return (GEO[k] = new THREE.LatheGeometry(v, seg || 10));
  }

  /* ------------------------------------------------------------------ */
  /* Material + texture resolution (defensive, memoised)                 */
  /* ------------------------------------------------------------------ */

  var MATC = {};

  /* A 64x32 equirect gradient used as a fallback envMap so that metals do not
   * render black when no scene.environment has been installed. Only ever
   * applied to materials THIS file creates — never to Agent A's shared ones. */
  var _envTex;
  function ENV() {
    if (_envTex !== undefined) return _envTex;
    _envTex = null;
    if (typeof document === 'undefined') return null;
    try {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      var x = c.getContext('2d');
      var grd = x.createLinearGradient(0, 0, 0, 32);
      grd.addColorStop(0.00, '#93a9c6');
      grd.addColorStop(0.45, '#c8cfd6');
      grd.addColorStop(0.52, '#8d8579');
      grd.addColorStop(1.00, '#302c27');
      x.fillStyle = grd; x.fillRect(0, 0, 64, 32);
      /* a soft key highlight so brushed metal gets something to catch */
      var g2 = x.createRadialGradient(20, 8, 0, 20, 8, 14);
      g2.addColorStop(0, 'rgba(255,248,232,0.95)');
      g2.addColorStop(1, 'rgba(255,248,232,0)');
      x.fillStyle = g2; x.fillRect(0, 0, 64, 32);
      var t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      _envTex = t;
    } catch (e) { _envTex = null; }
    return _envTex;
  }

  /* Give a material we own an environment if it needs one to read correctly. */
  function envify(m) {
    if (!m || m.envMap) return m;
    var needs = (m.metalness !== undefined && m.metalness > 0.35) ||
      (m.transparent && m.roughness !== undefined && m.roughness < 0.2);
    if (!needs) return m;
    var e = ENV();
    if (e) {
      m.envMap = e;
      if (m.envMapIntensity === undefined || m.envMapIntensity === 1) {
        m.envMapIntensity = 0.85;
      }
    }
    return m;
  }

  function M(name, fallback, args) {
    var k = name + '|' + (args ? args.join('_') : '');
    if (MATC[k]) return MATC[k];
    var m = null;
    if (SG.mat && typeof SG.mat[name] === 'function') {
      try {
        m = args ? SG.mat[name].apply(SG.mat, args) : SG.mat[name]();
      } catch (e) { m = null; }
    }
    if (!m || !m.isMaterial) {
      m = envify(new THREE.MeshStandardMaterial(
        fallback || { color: 0x9aa0a6, roughness: 0.8 }));
    }
    m.userData.shared = true;
    MATC[k] = m;
    return m;
  }

  /* Local (contract-less) material, memoised by key. */
  function LM(k, opts) {
    var kk = 'L:' + k;
    if (MATC[kk]) return MATC[kk];
    var m = envify(new THREE.MeshStandardMaterial(opts));
    m.userData.shared = true;
    MATC[kk] = m;
    return m;
  }

  function TX(name, opts) {
    if (SG.tex && typeof SG.tex[name] === 'function') {
      try {
        var t = SG.tex[name](opts);
        if (t && t.isTexture) return t;
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  function TEXT(str, opts) {
    if (SG.tex && typeof SG.tex.text === 'function') {
      try {
        var t = SG.tex.text(str, opts);
        if (t && t.isTexture) return t;
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  function SCREEN(drawFn, w, h) {
    if (SG.tex && typeof SG.tex.screen === 'function') {
      try {
        var s = SG.tex.screen(drawFn, w, h);
        if (s && s.texture) return s;
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  /* Apply a texture to a memoised material variant without mutating the
   * shared one Agent A handed us. */
  function mapped(k, tex, opts) {
    var kk = 'X:' + k;
    if (MATC[kk]) return MATC[kk];
    var o = {};
    for (var p in opts) if (Object.prototype.hasOwnProperty.call(opts, p)) o[p] = opts[p];
    if (tex) o.map = tex;
    var m = envify(new THREE.MeshStandardMaterial(o));
    m.userData.shared = true;
    MATC[kk] = m;
    return m;
  }

  /* ------------------------------------------------------------------ */
  /* Palette                                                             */
  /* ------------------------------------------------------------------ */

  function mSteel() { return M('steelBrushed', { color: 0x9aa1a8, roughness: 0.42, metalness: 1 }); }
  function mSteelDark() { return LM('steelDark', { color: 0x4c5157, roughness: 0.55, metalness: 1 }); }
  function mAlu() { return M('aluminium', { color: 0xbec4c9, roughness: 0.34, metalness: 1 }); }
  function mChrome() { return M('chrome', { color: 0xdfe4e8, roughness: 0.12, metalness: 1 }); }
  function mPaintGrey() { return M('steelPainted', { color: 0x5d6268, roughness: 0.62, metalness: 0.9 }); }
  function mBlack() { return M('blackPlastic', { color: 0x1a1c1f, roughness: 0.62, metalness: 0 }); }
  function mBlackMatte() { return LM('blackMatte', { color: 0x0d0e10, roughness: 0.88, metalness: 0 }); }
  function mBeige() { return M('beigePlastic', { color: 0xd6cfb6, roughness: 0.75, metalness: 0 }); }
  function mRubber() { return M('rubber', { color: 0x141619, roughness: 0.95, metalness: 0 }); }
  function mGlass() {
    return M('glass', {
      color: 0xcbdde8, roughness: 0.05, metalness: 0,
      transparent: true, opacity: 0.24, side: THREE.DoubleSide
    });
  }
  function mGlassDark() {
    return LM('glassDark', {
      color: 0x121a20, roughness: 0.08, metalness: 0,
      transparent: true, opacity: 0.62
    });
  }
  function mBrass() { return LM('brass', { color: 0xb4912f, roughness: 0.3, metalness: 1 }); }
  function mBrassDark() { return LM('brassDark', { color: 0x6f5719, roughness: 0.48, metalness: 1 }); }
  function mBrassWorn() { return LM('brassWorn', { color: 0x8a7331, roughness: 0.52, metalness: 1 }); }
  function mMarble() { return M('marbleFloor', { color: 0xd8d3c8, roughness: 0.16, metalness: 0 }); }
  function mMarbleDark() { return M('marbleWall', { color: 0x2b2a2e, roughness: 0.18, metalness: 0 }); }
  function mWood() { return M('wood', { color: 0x5a3a22, roughness: 0.38, metalness: 0 }); }
  function mWoodDark() { return LM('woodDark', { color: 0x33200f, roughness: 0.34, metalness: 0 }); }
  function mCarpet() { return M('carpetHotel', { color: 0x6b2230, roughness: 0.96, metalness: 0 }); }
  function mFabric() { return M('fabricSeat', { color: 0x3a3f47, roughness: 0.92, metalness: 0 }); }
  function mPaper() { return M('paper', { color: 0xe8e3d6, roughness: 0.92, metalness: 0 }); }
  function mConcrete() { return M('concrete', { color: 0x8b8b88, roughness: 0.94, metalness: 0 }); }
  function mFoam() { return LM('foam', { color: 0x191b1e, roughness: 0.99, metalness: 0 }); }
  function mLeather(hex) {
    return LM('leather' + (hex || 0x2b2118),
      { color: hex || 0x2b2118, roughness: 0.66, metalness: 0 });
  }
  function mVelvet(hex) {
    return LM('velvet' + (hex || 0x5c1a26),
      { color: hex || 0x5c1a26, roughness: 0.98, metalness: 0 });
  }
  function mPaint(hex, rough) {
    return LM('paint' + hex + '_' + (rough || 0.7),
      { color: hex, roughness: rough === undefined ? 0.7 : rough, metalness: 0 });
  }
  function mMetal(hex, rough) {
    return LM('metal' + hex + '_' + (rough || 0.45),
      { color: hex, roughness: rough === undefined ? 0.45 : rough, metalness: 1 });
  }
  function mLeaf(hex) {
    return LM('leaf' + (hex || 0x2f5c2a), {
      color: hex || 0x2f5c2a, roughness: 0.86, metalness: 0, side: THREE.DoubleSide
    });
  }

  /* Shared emissive (never state-changed). */
  function mGlow(hex, inten) {
    return M('emissive', {
      color: 0x090909, emissive: hex, emissiveIntensity: inten,
      roughness: 0.9, metalness: 0
    }, [hex, inten]);
  }

  /* Per-instance emissive — for anything a level animates. */
  function newGlow(hex, inten, base) {
    var m = new THREE.MeshStandardMaterial({
      color: base === undefined ? 0x0a0a0a : base,
      emissive: hex, emissiveIntensity: inten,
      roughness: 0.55, metalness: 0
    });
    return m;
  }

  /* Soft round sprite for light bloom. Cached. */
  var _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    var t = TX('particleSoft');
    if (t) { _glowTex = t; return t; }
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    var grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    _glowTex.colorSpace = THREE.SRGBColorSpace;
    return _glowTex;
  }

  function glowSprite(hex, size, opacity) {
    var t = glowTexture();
    if (!t) return null;
    var m = new THREE.SpriteMaterial({
      map: t, color: hex, transparent: true,
      opacity: opacity === undefined ? 0.5 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    s.userData.noMerge = true;
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Build helpers                                                       */
  /* ------------------------------------------------------------------ */

  function add(parent, geo, mat, x, y, z, rx, ry, rz) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(m);
    return m;
  }

  /* Merge a detached scratch group into one draw call per material. */
  function bake(stat, cast, recv) {
    var m = U.mergeGroup(stat);
    U.setShadow(m, cast !== false, recv !== false);
    return m;
  }

  function finish(g, name) {
    if (name) g.name = name;
    if (!g.userData.parts) g.userData.parts = {};
    U.measure(g);
    return g;
  }

  /* A text decal plane. Materials memoised per (string, size, style). */
  function labelMat(str, o) {
    o = o || {};
    var k = 'lab:' + str + '|' + (o.color || '') + '|' + (o.bg || '') + '|' +
      (o.font || '') + '|' + (o.size || '');
    if (MATC[k]) return MATC[k];
    var t = TEXT(str, o);
    var m;
    if (t) {
      m = new THREE.MeshStandardMaterial({
        map: t, transparent: true, roughness: 0.9, metalness: 0,
        color: 0xffffff, side: THREE.FrontSide, depthWrite: false
      });
    } else {
      m = new THREE.MeshStandardMaterial({
        color: o.bg ? 0xe6e2d8 : 0xcfcabd, roughness: 0.9, metalness: 0
      });
    }
    m.userData.shared = true;
    MATC[k] = m;
    return m;
  }

  function decal(parent, str, w, h, x, y, z, o) {
    var m = new THREE.Mesh(PLN(w, h), labelMat(str, o));
    m.position.set(x || 0, y || 0, z || 0);
    m.userData.noMerge = true;
    parent.add(m);
    return m;
  }

  /* Emissive sign face: text over a lit panel. */
  function litLabelMat(str, hex, o) {
    o = o || {};
    var k = 'lit:' + str + '|' + hex + '|' + (o.size || '');
    if (MATC[k]) return MATC[k];
    var t = TEXT(str, o);
    var m = new THREE.MeshStandardMaterial({
      map: t || null, transparent: !!t,
      color: t ? 0xffffff : 0x111111,
      emissive: hex, emissiveIntensity: o.intensity === undefined ? 2.2 : o.intensity,
      emissiveMap: t || null,
      roughness: 0.7, metalness: 0, depthWrite: !t
    });
    m.userData.shared = true;
    MATC[k] = m;
    return m;
  }

  /* Point list normaliser for the *Run builders. */
  function toPts(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      out.push(p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
    }
    return out;
  }

  function curveOf(pts, tension) {
    var c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom',
      tension === undefined ? 0.4 : tension);
    return c;
  }

  function curveLen(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    return L;
  }

  /* Offset a polyline sideways in the horizontal plane. */
  function offsetPts(pts, dx, dy) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      _v1.set(b.x - a.x, 0, b.z - a.z);
      if (_v1.lengthSq() < 1e-8) _v1.set(0, 0, 1);
      _v1.normalize();
      out.push(new THREE.Vector3(
        pts[i].x + (-_v1.z) * dx,
        pts[i].y + (dy || 0),
        pts[i].z + (_v1.x) * dx));
    }
    return out;
  }

  /* =================================================================== */
  /* 1. TRAVEL — briefcase, burner, tickets, plane                        */
  /* =================================================================== */

  MODELS.briefcase = function (opts) {
    opts = opts || {};
    var W = 0.46, D = 0.34, HB = 0.058, HL = 0.05;
    var g = new THREE.Group();
    var alu = mAlu(), br = mBrass(), blk = mBlack(), foam = mFoam();
    var stat = new THREE.Group();
    var i, x;

    /* body shell + ribbed skin */
    add(stat, BOX(W, HB, D), alu, 0, HB / 2, 0);
    for (i = 0; i < 5; i++) {
      x = -W / 2 + 0.062 + i * 0.084;
      add(stat, BOX(0.013, HB * 0.86, D + 0.005), alu, x, HB / 2, 0);
    }
    /* corner caps */
    for (i = 0; i < 4; i++) {
      var sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      add(stat, BOX(0.05, HB + 0.004, 0.05), mMetal(0x8f959b, 0.4),
        sx * (W / 2 - 0.024), HB / 2, sz * (D / 2 - 0.024));
    }
    /* latches + a combination dial each */
    for (i = 0; i < 2; i++) {
      x = (i ? 1 : -1) * 0.128;
      add(stat, BOX(0.052, 0.03, 0.016), br, x, HB - 0.004, D / 2 + 0.006);
      for (var d = 0; d < 3; d++) {
        var dl = add(stat, CYL(0.006, 0.006, 0.009, 8), blk,
          x - 0.011 + d * 0.011, HB - 0.004, D / 2 + 0.013);
        dl.rotation.z = Math.PI / 2;
      }
    }
    /* fold-flat handle */
    add(stat, BOX(0.014, 0.028, 0.014), br, -0.062, HB + 0.012, D / 2 + 0.014);
    add(stat, BOX(0.014, 0.028, 0.014), br, 0.062, HB + 0.012, D / 2 + 0.014);
    add(stat, BOX(0.15, 0.02, 0.026), mLeather(0x2a1d14), 0, HB + 0.026, D / 2 + 0.014);
    /* foam insert with tool wells */
    add(stat, BOX(W - 0.022, 0.03, D - 0.022), foam, 0, HB - 0.015, 0);
    var wells = [
      [-0.15, -0.07, 0.13, 0.07], [0.0, -0.07, 0.11, 0.07],
      [0.15, -0.07, 0.12, 0.07], [-0.09, 0.08, 0.24, 0.11],
      [0.14, 0.08, 0.12, 0.11]
    ];
    for (i = 0; i < wells.length; i++) {
      add(stat, BOX(wells[i][2], 0.01, wells[i][3]), mBlackMatte(),
        wells[i][0], HB - 0.004, wells[i][1]);
    }

    /* lid on a rear hinge */
    var lid = new THREE.Group();
    lid.name = 'lid';
    lid.position.set(0, HB, -D / 2);
    var ls = new THREE.Group();
    add(ls, BOX(W, HL, D), alu, 0, HL / 2, D / 2);
    for (i = 0; i < 5; i++) {
      add(ls, BOX(0.013, 0.008, D * 0.9), alu, -W / 2 + 0.062 + i * 0.084, HL, D / 2);
    }
    /* inner liner + a document sleeve, seen once the lid is up */
    add(ls, BOX(W - 0.024, 0.005, D - 0.024), mLeather(0x241a12), 0, -0.003, D / 2);
    add(ls, BOX(W - 0.07, 0.004, 0.16), mPaint(0x1a1712, 0.95), 0, -0.007, D / 2 - 0.05);
    add(ls, BOX(0.012, 0.008, 0.16), mBrass(), -(W - 0.07) / 2, -0.008, D / 2 - 0.05);
    add(ls, BOX(0.012, 0.008, 0.16), mBrass(), (W - 0.07) / 2, -0.008, D / 2 - 0.05);
    lid.add(bake(ls));
    add(lid, CYL(0.007, 0.007, W - 0.04, 8), mSteel(), 0, 0, 0, 0, 0, Math.PI / 2);

    g.add(bake(stat));
    g.add(lid);

    if (opts.loaded) {
      var loot = new THREE.Group();
      loot.name = 'contents';
      var ph = MODELS.phoneBurner({ on: false });
      ph.rotation.y = Math.PI / 2;
      ph.position.set(-0.15, HB - 0.004, -0.07);
      loot.add(ph);
      var tk = MODELS.ticketFirstClass({ count: 2 });
      tk.position.set(0.0, HB - 0.004, -0.07);
      loot.add(tk);
      var bd = MODELS.badgeLanyard({ flat: true });
      bd.position.set(0.15, HB - 0.004, -0.07);
      loot.add(bd);
      var df = MODELS.dossierFolder({});
      df.scale.setScalar(0.78);
      df.position.set(-0.09, HB - 0.004, 0.08);
      loot.add(df);
      var cv = MODELS.coverallsFolded({ small: true });
      cv.position.set(0.14, HB - 0.004, 0.08);
      loot.add(cv);
      g.add(loot);
      g.userData.contents = loot;
    }

    g.userData.parts = { lid: lid };
    g.userData.setOpen = function (t) {
      t = U.clamp(t, 0, 1);
      g.userData.t = t;
      lid.rotation.x = -t * 1.95;
    };
    g.open = function () { g.userData.setOpen(1); };
    g.close = function () { g.userData.setOpen(0); };
    g.userData.open = g.open;
    g.userData.close = g.close;
    g.userData.setOpen(opts.open ? 1 : 0);
    return finish(g, 'briefcase');
  };

  MODELS.phoneBurner = function (opts) {
    opts = opts || {};
    var W = 0.048, H = 0.014, L = 0.112;
    var g = new THREE.Group();
    var blk = mBlack(), dk = mBlackMatte();
    var stat = new THREE.Group();
    /* body — lying face-up, long axis on Z */
    add(stat, BOX(W, H, L), blk, 0, H / 2, 0);
    add(stat, BOX(W - 0.004, 0.002, L - 0.004), dk, 0, H, 0);
    /* keypad — 4 rows x 3 */
    var kp = mPaint(0x2c2f33, 0.5);
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 3; c++) {
        add(stat, BOX(0.011, 0.0025, 0.0065), kp,
          -0.0135 + c * 0.0135, H + 0.001, 0.012 + r * 0.0105);
      }
    }
    /* soft keys + d-pad */
    add(stat, BOX(0.012, 0.0025, 0.006), kp, -0.014, H + 0.001, -0.001);
    add(stat, BOX(0.012, 0.0025, 0.006), kp, 0.014, H + 0.001, -0.001);
    add(stat, CYL(0.006, 0.006, 0.003, 8), kp, 0, H + 0.001, -0.001);
    /* stub antenna */
    add(stat, CYL(0.0025, 0.003, 0.012, 6), dk, W / 2 - 0.008, H, -L / 2 - 0.004);

    g.add(bake(stat));

    /* screen — its own material so a level can flip it on */
    var scr = SCREEN(null, 128, 128);
    var smat = new THREE.MeshStandardMaterial({
      map: scr ? scr.texture : (TEXT('HALCYON\nMERIDIAN GRAND\n21:40', { size: 34, color: '#8fe6b0' })),
      emissive: 0x37d98a, emissiveIntensity: opts.on === false ? 0.05 : 1.5,
      color: 0x101418, roughness: 0.35, metalness: 0
    });
    if (smat.map) smat.emissiveMap = smat.map;
    var sm = new THREE.Mesh(PLN(0.036, 0.03), smat);
    sm.rotation.x = -Math.PI / 2;
    sm.position.set(0, H + 0.0015, -0.028);
    sm.name = 'screen';
    g.add(sm);

    g.userData.parts = { screen: sm };
    g.userData.screen = scr;
    g.userData.setOn = function (on) { smat.emissiveIntensity = on ? 1.5 : 0.05; };
    return finish(g, 'phoneBurner');
  };

  MODELS.ticketFirstClass = function (opts) {
    opts = opts || {};
    var n = opts.count || 1;
    var W = 0.203, D = 0.083;
    var g = new THREE.Group();
    var pm = mapped('ticket', TX('paper') || TEXT('  ', {}), {
      color: 0xf1ece0, roughness: 0.9, metalness: 0
    });
    var stat = new THREE.Group();
    for (var i = 0; i < n; i++) {
      var y = 0.0006 + i * 0.0011;
      var t = add(stat, BOX(W, 0.001, D), pm, i * 0.004, y, i * 0.003);
      t.rotation.y = (i - (n - 1) / 2) * 0.05;
    }
    g.add(bake(stat, false, true));

    var face = new THREE.Group();
    face.position.set((n - 1) * 0.004, 0.0006 + (n - 1) * 0.0011 + 0.0007, (n - 1) * 0.003);
    face.rotation.y = ((n - 1) / 2) * 0.05;
    decal(face, opts.text || 'BOARDING PASS   FIRST', 0.13, 0.02, -0.03, 0, 0.024,
      { size: 30, color: '#1a1c22' }).rotation.x = -Math.PI / 2;
    decal(face, opts.name || 'BECKETT / T   PRG', 0.12, 0.018, -0.035, 0, 0.0,
      { size: 28, color: '#333740' }).rotation.x = -Math.PI / 2;
    decal(face, '1A', 0.03, 0.024, 0.075, 0, -0.02,
      { size: 44, color: '#8a1620' }).rotation.x = -Math.PI / 2;
    g.add(face);

    /* perforated stub line */
    var st = new THREE.Group();
    for (var k = 0; k < 9; k++) {
      add(st, BOX(0.0012, 0.0012, 0.004), mPaint(0xbdb6a4, 0.9),
        0.052, 0.0012 + (n - 1) * 0.0011, -D / 2 + 0.006 + k * 0.009);
    }
    g.add(bake(st, false, false));

    g.userData.parts = { face: face };
    return finish(g, 'ticketFirstClass');
  };

  MODELS.dossierFolder = function (opts) {
    opts = opts || {};
    var W = 0.235, D = 0.315;
    var g = new THREE.Group();
    var man = LM('manila', { color: 0xc9a870, roughness: 0.93, metalness: 0 });
    var stat = new THREE.Group();
    /* loose paper first so it peeks out */
    var rnd = U.rng(1201);
    for (var i = 0; i < 5; i++) {
      var p = add(stat, BOX(W - 0.012, 0.0008, D - 0.02), mPaper(),
        (rnd() - 0.5) * 0.006, 0.0035 + i * 0.0011, (rnd() - 0.5) * 0.012);
      p.rotation.y = (rnd() - 0.5) * 0.03;
    }
    /* folder: back leaf, spine fold, front leaf */
    add(stat, BOX(W, 0.0018, D), man, 0, 0.0009, 0);
    add(stat, BOX(W, 0.012, 0.006), man, 0, 0.006, -D / 2 + 0.003);
    add(stat, BOX(W, 0.0018, D - 0.004), man, 0, 0.0115, 0.002);
    /* index tab */
    add(stat, BOX(0.055, 0.0018, 0.018), man, 0.07, 0.0115, D / 2 + 0.008);
    /* elastic band */
    add(stat, BOX(0.008, 0.014, D + 0.006), mPaint(0x2a2c30, 0.85), -0.05, 0.006, 0);
    g.add(bake(stat, true, true));

    var top = 0.0126;
    decal(g, opts.title || 'HALCYON', 0.13, 0.026, -0.03, top, -0.09,
      { size: 46, color: '#26282e' }).rotation.x = -Math.PI / 2;
    decal(g, opts.sub || 'MERIDIAN GRAND / PRAHA', 0.15, 0.016, -0.02, top, -0.055,
      { size: 26, color: '#3c4048' }).rotation.x = -Math.PI / 2;
    decal(g, 'CONFIDENTIAL', 0.115, 0.024, 0.03, top, 0.09,
      { size: 40, color: '#a01a18' }).rotation.set(-Math.PI / 2, 0, -0.22);
    decal(g, opts.tab || 'B / 7', 0.04, 0.012, 0.07, top, D / 2 + 0.008,
      { size: 26, color: '#3c4048' }).rotation.x = -Math.PI / 2;
    return finish(g, 'dossierFolder');
  };

  MODELS.badgeLanyard = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var stat = new THREE.Group();
    var strapM = mPaint(0x1d2a3a, 0.95);

    if (opts.flat !== false) {
      /* coiled on a surface: badge on top of a loose loop of webbing */
      var seg = 22, R = 0.055;
      for (var i = 0; i < seg; i++) {
        var a = (i / seg) * TAU;
        var b = ((i + 1) / seg) * TAU;
        var r1 = R * (1 + 0.18 * Math.sin(a * 2.0));
        var r2 = R * (1 + 0.18 * Math.sin(b * 2.0));
        var x1 = Math.cos(a) * r1, z1 = Math.sin(a) * r1 * 1.35;
        var x2 = Math.cos(b) * r2, z2 = Math.sin(b) * r2 * 1.35;
        var mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        var len = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
        var s = add(stat, BOX(0.016, 0.0022, len + 0.002), strapM, mx, 0.0011, mz);
        s.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      }
    }
    /* clip */
    add(stat, BOX(0.014, 0.003, 0.026), mChrome(), 0, 0.004, 0.05);
    add(stat, CYL(0.007, 0.007, 0.004, 8), mChrome(), 0, 0.004, 0.064, Math.PI / 2);
    /* card 86 x 54 */
    add(stat, BOX(0.054, 0.0022, 0.086), mPaint(0xf2f2f0, 0.62), 0, 0.0045, 0.0);
    g.add(bake(stat, true, true));

    var y = 0.0057;
    decal(g, opts.org || 'MERIDIAN GRAND', 0.046, 0.009, 0, y, -0.034,
      { size: 22, color: '#1c2b45' }).rotation.x = -Math.PI / 2;
    var ph = add(g, PLN(0.026, 0.032), LM('badgePhoto',
      { color: 0x6d7480, roughness: 0.9, metalness: 0 }), -0.012, y, -0.006);
    ph.rotation.x = -Math.PI / 2;
    decal(g, opts.name || 'T. BECKETT', 0.024, 0.02, 0.014, y, -0.008,
      { size: 22, color: '#22262c' }).rotation.x = -Math.PI / 2;
    decal(g, opts.role || 'CONTRACT IT', 0.04, 0.012, 0, y, 0.02,
      { size: 20, color: '#4a505a' }).rotation.x = -Math.PI / 2;
    /* barcode */
    var bc = new THREE.Group();
    var rnd2 = U.rng(77);
    for (var k = 0; k < 22; k++) {
      add(bc, BOX(0.0008 + rnd2() * 0.0011, 0.0004, 0.012), mBlackMatte(),
        -0.02 + k * 0.0018, y, 0.036);
    }
    g.add(bake(bc, false, false));
    return finish(g, 'badgeLanyard');
  };

  MODELS.coverallsFolded = function (opts) {
    opts = opts || {};
    var s = opts.small ? 0.72 : 1;
    var W = 0.34 * s, D = 0.26 * s;
    var g = new THREE.Group();
    var cloth = mapped('coverall', TX('coverallBlue'),
      { color: 0x2f4f74, roughness: 0.95, metalness: 0 });
    var stat = new THREE.Group();
    /* four folded layers, each a touch smaller and offset */
    var lay = [
      [W, D, 0.028], [W - 0.02 * s, D - 0.018 * s, 0.024],
      [W - 0.045 * s, D - 0.036 * s, 0.02], [W - 0.075 * s, D - 0.06 * s, 0.016]
    ];
    var y = 0;
    for (var i = 0; i < lay.length; i++) {
      add(stat, BOX(lay[i][0], lay[i][2], lay[i][1]), cloth,
        (i % 2 ? 1 : -1) * 0.004 * s, y + lay[i][2] / 2, (i % 2 ? -1 : 1) * 0.005 * s);
      y += lay[i][2] * 0.72;
    }
    /* folded sleeve across the top + a zip pull */
    add(stat, BOX(W * 0.66, 0.012 * s, 0.05 * s), cloth, -0.02 * s, y + 0.006, 0.03 * s);
    add(stat, BOX(0.006, 0.004, 0.09 * s), mChrome(), 0.05 * s, y + 0.012, -0.01 * s);
    g.add(bake(stat, true, true));
    /* name patch */
    decal(g, opts.name || 'BECKETT', 0.07 * s, 0.018 * s, -0.05 * s, y + 0.0125, 0.03 * s,
      { size: 26, color: '#e8e2d0' }).rotation.x = -Math.PI / 2;
    return finish(g, 'coverallsFolded');
  };

  MODELS.planeSeatFirst = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var shell = mLeather(0x2c2622);
    var hide = mLeather(0x6d4a30);
    var trim = mMetal(0xb6a084, 0.35);
    var dark = mBlack();
    var stat = new THREE.Group();

    /* plinth */
    add(stat, BOX(0.9, 0.11, 1.42), dark, 0, 0.055, 0);
    add(stat, BOX(0.94, 0.02, 1.46), mPaint(0x24262a, 0.7), 0, 0.11, 0);
    /* pod shell: rear wall + shoulder wings */
    add(stat, BOX(0.9, 1.24, 0.07), shell, 0, 0.11 + 0.62, -0.68);
    add(stat, BOX(0.06, 0.86, 0.62), shell, -0.44, 0.11 + 0.43, -0.36);
    add(stat, BOX(0.06, 0.86, 0.62), shell, 0.44, 0.11 + 0.43, -0.36);
    /* shell top cap */
    add(stat, BOX(0.94, 0.05, 0.14), shell, 0, 1.37, -0.66);
    /* side console (right) with a table */
    add(stat, BOX(0.2, 0.46, 0.78), shell, 0.55, 0.11 + 0.23, -0.14);
    add(stat, BOX(0.23, 0.025, 0.44), mWoodDark(), 0.55, 0.585, 0.02);
    add(stat, BOX(0.23, 0.006, 0.44), trim, 0.55, 0.6, 0.02);
    /* seat pan + squab */
    add(stat, BOX(0.62, 0.13, 0.6), hide, 0, 0.45, 0.06);
    for (var i = 0; i < 3; i++) {
      add(stat, BOX(0.006, 0.012, 0.56), mLeather(0x53381f), -0.19 + i * 0.19, 0.518, 0.06);
    }
    /* backrest, reclined 13 deg */
    var back = add(stat, BOX(0.6, 0.76, 0.14), hide, 0, 0.9, -0.36);
    back.rotation.x = 12 * DEG;
    var bpad = add(stat, BOX(0.52, 0.66, 0.04), mLeather(0x7a5436), 0, 0.9, -0.28);
    bpad.rotation.x = 12 * DEG;
    /* headrest + wings */
    add(stat, BOX(0.34, 0.2, 0.13), hide, 0, 1.33, -0.44);
    add(stat, BOX(0.06, 0.18, 0.15), hide, -0.2, 1.31, -0.42, 0, 0.22, 0);
    add(stat, BOX(0.06, 0.18, 0.15), hide, 0.2, 1.31, -0.42, 0, -0.22, 0);
    /* armrests */
    add(stat, BOX(0.11, 0.1, 0.62), hide, -0.36, 0.6, -0.02);
    add(stat, BOX(0.11, 0.1, 0.62), hide, 0.36, 0.6, -0.02);
    add(stat, BOX(0.09, 0.012, 0.5), trim, -0.36, 0.652, -0.02);
    add(stat, BOX(0.09, 0.012, 0.5), trim, 0.36, 0.652, -0.02);
    /* ottoman / footrest */
    add(stat, BOX(0.56, 0.34, 0.34), hide, 0, 0.28, 0.6);
    add(stat, BOX(0.6, 0.03, 0.38), shell, 0, 0.46, 0.6);
    /* literature pocket */
    add(stat, BOX(0.3, 0.16, 0.015), mPaint(0x3b332c, 0.9), 0, 0.86, 0.775);
    /* screen arm */
    add(stat, CYL(0.012, 0.012, 0.26, 8), trim, 0.45, 0.72, 0.2, 0, 0, 0.4);
    g.add(bake(stat));

    /* IFE screen — animatable */
    var scr = SCREEN(null, 256, 160);
    var smat = new THREE.MeshStandardMaterial({
      map: scr ? scr.texture : TEXT('PRG  01:12\n— — — — —', { size: 40, color: '#a9d8ff' }),
      color: 0x0a0d12, emissive: 0x3d78b4, emissiveIntensity: 1.2,
      roughness: 0.28, metalness: 0
    });
    if (smat.map) smat.emissiveMap = smat.map;
    var screen = new THREE.Group();
    screen.name = 'screen';
    screen.position.set(0.4, 0.86, 0.28);
    screen.rotation.y = -0.5;
    add(screen, BOX(0.3, 0.19, 0.014), dark, 0, 0, 0);
    add(screen, PLN(0.272, 0.162), smat, 0, 0, 0.0075);
    g.add(screen);

    /* seatbelt */
    var belt = new THREE.Group();
    belt.name = 'belt';
    var bm = mPaint(0x24262b, 0.92);
    add(belt, BOX(0.26, 0.006, 0.045), bm, -0.14, 0.525, 0.06, 0, 0, 0.06);
    add(belt, BOX(0.26, 0.006, 0.045), bm, 0.14, 0.525, 0.06, 0, 0, -0.06);
    add(belt, BOX(0.075, 0.012, 0.05), mMetal(0xc9c2b0, 0.3), 0, 0.53, 0.06);
    U.setShadow(belt, true, false);
    g.add(belt);

    g.userData.parts = { screen: screen, belt: belt, ife: smat };
    g.userData.screen = scr;
    g.userData.setScreenOn = function (on) { smat.emissiveIntensity = on ? 1.2 : 0.02; };
    return finish(g, 'planeSeatFirst');
  };

  MODELS.planeCabinShell = function (opts) {
    opts = opts || {};
    var L = opts.length || 8;
    var HW = 1.72;            /* half cabin width at the sidewall */
    var WALL_TOP = 1.12;      /* where the sidewall becomes the arch */
    var CY = 0.42, R = 1.82;  /* arch centre + radius */
    var g = new THREE.Group();
    var panel = LM('cabinPanel', { color: 0xd8d2c6, roughness: 0.82, metalness: 0 });
    var panelWarm = LM('cabinPanelWarm', { color: 0xc4b8a4, roughness: 0.85, metalness: 0 });
    var floorM = mapped('cabinFloor', TX('carpetHotel'),
      { color: 0x3b3a42, roughness: 0.97, metalness: 0 });
    var stat = new THREE.Group();
    var i, s, a;

    /* floor + aisle runner */
    var fl = add(stat, PLN(HW * 2, L), floorM, 0, 0.002, 0);
    fl.rotation.x = -Math.PI / 2;
    var run = add(stat, PLN(0.62, L), LM('aisleRun',
      { color: 0x2a2930, roughness: 0.98, metalness: 0 }), 0, 0.004, 0);
    run.rotation.x = -Math.PI / 2;

    /* sidewalls */
    for (s = -1; s <= 1; s += 2) {
      var w = add(stat, PLN(WALL_TOP, L), panel, s * HW, WALL_TOP / 2, 0);
      w.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      /* dado rail + skirting */
      add(stat, BOX(0.03, 0.02, L), panelWarm, s * (HW - 0.015), 0.72, 0);
      add(stat, BOX(0.04, 0.09, L), LM('cabinSkirt',
        { color: 0x2f3036, roughness: 0.9, metalness: 0 }), s * (HW - 0.02), 0.045, 0);
    }

    /* arched ceiling built from flat panels — 12 per side */
    var a0 = Math.asin((WALL_TOP - CY) / R);
    var N = 12;
    for (s = -1; s <= 1; s += 2) {
      for (i = 0; i < N; i++) {
        var t0 = a0 + (Math.PI / 2 - a0) * (i / N);
        var t1 = a0 + (Math.PI / 2 - a0) * ((i + 1) / N);
        var x0 = Math.cos(t0) * R, y0 = CY + Math.sin(t0) * R;
        var x1 = Math.cos(t1) * R, y1 = CY + Math.sin(t1) * R;
        var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        var seg = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
        var p = add(stat, PLN(seg + 0.004, L), i > 7 ? panel : panelWarm,
          s * mx, my, 0);
        p.rotation.y = Math.PI / 2;
        p.rotation.x = s > 0 ? -Math.atan2(y1 - y0, x1 - x0) : Math.atan2(y1 - y0, x1 - x0);
        p.rotation.z = 0;
        if (s < 0) p.rotation.y = -Math.PI / 2;
      }
    }

    /* overhead bins */
    for (s = -1; s <= 1; s += 2) {
      add(stat, BOX(0.5, 0.42, L), panelWarm, s * 1.36, 1.68, 0);
      /* bin doors, one per 1.05 m, slightly proud */
      var nd = Math.max(2, Math.round(L / 1.05));
      for (i = 0; i < nd; i++) {
        var z = -L / 2 + (i + 0.5) * (L / nd);
        var door = add(stat, BOX(0.04, 0.36, L / nd - 0.02), panel,
          s * 1.61, 1.63, z);
        door.rotation.z = s * 0.12;
        add(stat, BOX(0.03, 0.02, 0.14), mMetal(0xa9a49a, 0.4), s * 1.635, 1.5, z);
      }
      /* cove light: emissive strip washing the arch */
      add(stat, BOX(0.06, 0.02, L - 0.05), mGlow(0x8ab4ff, 1.4), s * 1.2, 1.9, 0);
      /* under-bin reading strip */
      add(stat, BOX(0.3, 0.012, L - 0.05), mGlow(0xffd9a0, 0.5), s * 1.32, 1.462, 0);
    }

    /* aisle floor path lighting */
    var nl = Math.max(4, Math.round(L / 0.5));
    for (i = 0; i < nl; i++) {
      var lz = -L / 2 + (i + 0.5) * (L / nl);
      add(stat, BOX(0.02, 0.004, 0.05), mGlow(0xa8ffd0, 2.2), -0.32, 0.006, lz);
      add(stat, BOX(0.02, 0.004, 0.05), mGlow(0xa8ffd0, 2.2), 0.32, 0.006, lz);
    }

    if (opts.caps !== false) {
      for (s = -1; s <= 1; s += 2) {
        var cap = add(stat, PLN(HW * 2, 2.3), panelWarm, 0, 1.15, s * L / 2);
        if (s > 0) cap.rotation.y = Math.PI;
      }
    }

    g.add(bake(stat, false, true));
    g.userData.interiorWidth = HW * 2;
    return finish(g, 'planeCabinShell');
  };

  MODELS.planeWindow = function (opts) {
    opts = opts || {};
    var W = 0.235, H = 0.33;
    var g = new THREE.Group();
    var panel = LM('cabinPanel', { color: 0xd8d2c6, roughness: 0.82, metalness: 0 });
    var stat = new THREE.Group();
    var cy = H / 2 + 0.06;

    /* surround plate with an oval reveal built from a ring */
    var ring = add(stat, TOR(0.115, 0.026, 4, 16), panel, 0, cy, 0.008);
    ring.scale.set(1, 1.34, 1);
    /* reveal tube */
    var rv = add(stat, CYL(0.112, 0.112, 0.05, 16, true), panel, 0, cy, -0.018);
    rv.rotation.x = Math.PI / 2;
    rv.scale.set(1, 1, 1.34);
    rv.material = LM('cabinReveal', {
      color: 0xc9c2b4, roughness: 0.85, metalness: 0, side: THREE.DoubleSide
    });
    /* bleed hole */
    add(stat, CIR(0.004, 8), mBlackMatte(), 0, cy - 0.135, -0.041);
    g.add(bake(stat, false, true));

    /* outer + inner pane */
    var outer = add(g, CIR(0.108, 18), LM('paneOuter', {
      color: 0x0a0f18, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.55
    }), 0, cy, -0.045);
    outer.scale.set(1, 1.34, 1);
    var frost = add(g, CIR(0.106, 18), mapped('frost', TX('glassDirty'), {
      color: 0xcfe0ef, roughness: 0.9, metalness: 0,
      transparent: true, opacity: 0.16
    }), 0, cy, -0.03);
    frost.scale.set(1, 1.34, 1);
    var inner = add(g, CIR(0.107, 18), mGlass(), 0, cy, 0.004);
    inner.scale.set(1, 1.34, 1);
    outer.name = 'paneOuter'; inner.name = 'paneInner'; frost.name = 'frost';

    /* sliding shade */
    var shade = new THREE.Group();
    shade.name = 'shade';
    add(shade, BOX(0.235, 0.3, 0.012), panel, 0, 0, 0.02);
    add(shade, BOX(0.06, 0.014, 0.018), mPaint(0xb9b2a4, 0.7), 0, -0.15, 0.024);
    U.setShadow(shade, false, true);
    shade.position.y = cy + 0.31;
    g.add(shade);

    g.userData.parts = { shade: shade, pane: inner, frost: frost };
    g.userData.setShade = function (t) {
      t = U.clamp(t, 0, 1);
      shade.position.y = cy + 0.31 - t * 0.31;
      g.userData.shade = t;
    };
    g.userData.setShade(opts.shade === undefined ? 0 : opts.shade);
    return finish(g, 'planeWindow');
  };

  MODELS.trolleyCart = function (opts) {
    opts = opts || {};
    var W = 0.3, H = 1.03, D = 0.81;
    var g = new THREE.Group();
    var alu = mAlu(), dk = mBlack();
    var stat = new THREE.Group();
    var bodyH = H - 0.11;
    var i;

    add(stat, BOX(W, bodyH, D), alu, 0, 0.11 + bodyH / 2, 0);
    /* horizontal swage ribs */
    for (i = 0; i < 7; i++) {
      add(stat, BOX(W + 0.006, 0.012, D - 0.03), alu, 0, 0.2 + i * 0.11, 0);
    }
    /* two doors on the +Z face */
    for (i = 0; i < 2; i++) {
      var dz = D / 2 + 0.006;
      add(stat, BOX(W - 0.03, 0.42, 0.012), mMetal(0xa8aeb4, 0.38),
        0, 0.2 + i * 0.44, dz);
      add(stat, BOX(0.04, 0.016, 0.02), dk, 0.09, 0.2 + i * 0.44 + 0.16, dz + 0.008);
    }
    /* top tray with a lip */
    add(stat, BOX(W + 0.02, 0.016, D + 0.02), mMetal(0xc6ccd1, 0.3), 0, H, 0);
    add(stat, BOX(W + 0.02, 0.018, 0.012), alu, 0, H + 0.012, D / 2 + 0.004);
    add(stat, BOX(W + 0.02, 0.018, 0.012), alu, 0, H + 0.012, -D / 2 - 0.004);
    /* push handle */
    add(stat, CYL(0.011, 0.011, W - 0.02, 8), dk, 0, H - 0.1, -D / 2 - 0.03, 0, 0, Math.PI / 2);
    add(stat, BOX(0.014, 0.1, 0.03), alu, -W / 2 + 0.03, H - 0.06, -D / 2 - 0.02);
    add(stat, BOX(0.014, 0.1, 0.03), alu, W / 2 - 0.03, H - 0.06, -D / 2 - 0.02);
    /* castors */
    for (i = 0; i < 4; i++) {
      var cx = (i & 1 ? 1 : -1) * (W / 2 - 0.05);
      var cz = (i & 2 ? 1 : -1) * (D / 2 - 0.08);
      add(stat, BOX(0.03, 0.05, 0.03), mSteelDark(), cx, 0.085, cz);
      var wheel = add(stat, CYL(0.038, 0.038, 0.022, 10), mRubber(), cx, 0.038, cz);
      wheel.rotation.z = Math.PI / 2;
    }
    /* brake bar */
    add(stat, BOX(W - 0.06, 0.012, 0.03), mPaint(0xc23c22, 0.7), 0, 0.06, D / 2 - 0.02);
    g.add(bake(stat));

    decal(g, opts.label || 'MERIDIAN', 0.19, 0.03, 0, 0.86, D / 2 + 0.014,
      { size: 34, color: '#2b3038' });

    if (opts.served) {
      var tray = new THREE.Group();
      tray.name = 'service';
      for (i = 0; i < 4; i++) {
        add(tray, CYL(0.032, 0.026, 0.075, 10), mPaint(0xf0ece2, 0.5),
          -0.06 + (i % 2) * 0.12, H + 0.045, -0.16 + Math.floor(i / 2) * 0.13);
      }
      add(tray, CYL(0.055, 0.05, 0.17, 10), mSteel(), 0, H + 0.09, 0.18);
      U.setShadow(tray, true, true);
      g.add(tray);
      g.userData.parts = { service: tray };
    }
    return finish(g, 'trolleyCart');
  };

})(window.SG, window.THREE);

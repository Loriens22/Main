/* =====================================================================
 * 11_materials.js — SG.mat.*  every shared material in the game.
 *
 * Contract
 *   SG.mat.<name>(opts) -> THREE.MeshStandardMaterial, MEMOISED and SHARED.
 *   Every material carries userData.shared = true so SG.util.disposeTree
 *   walks past it instead of freeing it out from under the next level.
 *
 * Conventions
 *   colour maps            -> THREE.SRGBColorSpace   (tex.* already sets this)
 *   normal / roughness     -> THREE.NoColorSpace     (derived via tex.normalFrom
 *                                                     / tex.roughFrom)
 *   a textured surface uses color 0xffffff and lets the map carry the hue.
 *   where a roughnessMap exists, `roughness` is 1.0 and the range lives in the
 *   map (roughFrom(lo, hi)) — multiplying twice is the classic mistake.
 *   metalness is 0 or 1. Never 0.5. It is metal or it is not.
 *
 * Environment
 *   Metals are black without an environment. SG.mat.installEnvironment(
 *   renderer, scene) builds a small procedural equirect sky/room, runs it
 *   through PMREMGenerator once, caches it and assigns scene.environment.
 *   51_postfx.js calls it during SG.fx.init; levels may call it too — it is
 *   idempotent.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var mat = SG.mat;
  var tex = SG.tex;
  var util = SG.util;

  /* Extra texture fetches are not worth it on a phone. */
  var HAS_MAPS = SG.quality !== 'low';

  /* ================================================================== */
  /* 0. Keys, caches, helpers                                            */
  /* ================================================================== */

  function stable(o) {
    if (tex && typeof tex.__key === 'function') {
      try { return tex.__key(o === undefined ? {} : o); } catch (e) { /* fall */ }
    }
    try { return JSON.stringify(o === undefined ? {} : o); } catch (e2) {
      return String(o);
    }
  }

  var CACHES = {};
  var COUNT = 0;

  /* Registers SG.mat[name]; `build(opts)` returns a fresh THREE.Material. */
  function def(name, build) {
    var cache = {};
    CACHES[name] = cache;
    mat[name] = function (opts) {
      var k = stable(opts);
      var m = cache[k];
      if (m) return m;
      try {
        m = build(opts || {});
      } catch (e) {
        if (window.console) console.warn('[SG.mat:' + name + ']', e);
        m = null;
      }
      if (!m || !m.isMaterial) {
        m = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.85 });
      }
      m.name = 'mat:' + name;
      m.userData.shared = true;
      cache[k] = m;
      COUNT++;
      return m;
    };
  }

  /* Options that belong to the texture generator rather than the material. */
  var TEX_KEYS = ['repeat', 'seed', 'tint', 'wear', 'size', 'tiles', 'rows',
    'planks', 'light', 'dark', 'deep', 'color', 'age', 'tone', 'yellow', 'uv',
    'uvDir', 'grout', 'gold', 'mask', 'anisotropy'];

  function TO(o, defaults) {
    var out = {}, i, k;
    for (i = 0; i < TEX_KEYS.length; i++) {
      k = TEX_KEYS[i];
      if (o && o[k] !== undefined) out[k] = o[k];
    }
    if (defaults) {
      for (k in defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, k) &&
          out[k] === undefined) out[k] = defaults[k];
      }
    }
    return out;
  }

  function setCS(t, cs) {
    if (!t) return t;
    if (t.colorSpace !== cs) { t.colorSpace = cs; t.needsUpdate = true; }
    return t;
  }

  /* Colour map from SG.tex, guaranteed sRGB. Null if the family is missing. */
  function T(name, o) {
    if (!tex || typeof tex[name] !== 'function') return null;
    var t = null;
    try { t = tex[name](o); } catch (e) { t = null; }
    if (!t || !t.isTexture) return null;
    return setCS(t, THREE.SRGBColorSpace);
  }

  /* Derive a data map (normal / roughness) from a colour map.
   * tex.normalFrom/roughFrom memoise per source canvas, so a repeat-carrying
   * clone would otherwise scribble on a shared texture — clone when it differs. */
  function derive(fn, src, a, b) {
    if (!src || typeof fn !== 'function') return null;
    var d = null;
    try { d = fn(src, a, b); } catch (e) { d = null; }
    if (!d || !d.isTexture) return null;
    setCS(d, THREE.NoColorSpace);
    if (d.repeat.x !== src.repeat.x || d.repeat.y !== src.repeat.y) {
      var c = d.clone();
      c.repeat.copy(src.repeat);
      c.wrapS = src.wrapS; c.wrapT = src.wrapT;
      c.colorSpace = THREE.NoColorSpace;
      c.needsUpdate = true;
      d = c;
    }
    return d;
  }

  /* The single place a MeshStandardMaterial is born.
   *   cfg: { map, normal, normalScale, rough:[lo,hi], color, roughness,
   *          metalness, env, extra:{...} } */
  function build(cfg) {
    var spec = {
      color: cfg.color === undefined ? 0xffffff : cfg.color,
      roughness: cfg.roughness === undefined ? 0.8 : cfg.roughness,
      metalness: cfg.metalness === undefined ? 0 : cfg.metalness
    };
    var t = cfg.map || null;
    if (t) spec.map = t;
    /* No texture (family missing / canvas unavailable): fall back to a flat
     * colour rather than a white blob. */
    if (!t && cfg.color === undefined && cfg.fallbackColor !== undefined) {
      spec.color = cfg.fallbackColor;
    }

    if (t && HAS_MAPS && cfg.normal) {
      var n = derive(tex.normalFrom, t, cfg.normal);
      if (n) spec.normalMap = n;
    }
    if (t && HAS_MAPS && cfg.rough) {
      var r = derive(tex.roughFrom, t, cfg.rough[0], cfg.rough[1]);
      if (r) { spec.roughnessMap = r; spec.roughness = 1; }
    }
    spec.envMapIntensity = cfg.env === undefined
      ? (spec.metalness > 0.5 ? 1.0 : 0.75) : cfg.env;

    if (cfg.extra) {
      for (var k in cfg.extra) {
        if (Object.prototype.hasOwnProperty.call(cfg.extra, k)) {
          spec[k] = cfg.extra[k];
        }
      }
    }
    var m = new THREE.MeshStandardMaterial(spec);
    if (cfg.normalScale !== undefined && m.normalScale) {
      m.normalScale.set(cfg.normalScale, cfg.normalScale);
    }
    return m;
  }

  /* Declare a textured surface in one line. */
  function surface(name, texName, texDefaults, cfg) {
    def(name, function (o) {
      var c = {}, k;
      for (k in cfg) {
        if (Object.prototype.hasOwnProperty.call(cfg, k)) c[k] = cfg[k];
      }
      c.map = T(texName, TO(o, texDefaults));
      if (!c.map && cfg.fallbackColor !== undefined) c.color = cfg.fallbackColor;
      if (o.opacity !== undefined) {
        c.extra = c.extra || {};
        c.extra = mergeInto({}, c.extra);
        c.extra.transparent = true;
        c.extra.opacity = o.opacity;
      }
      return build(c);
    });
  }

  function mergeInto(dst, src) {
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) dst[k] = src[k];
    }
    return dst;
  }

  function colOr(c, dflt) {
    return new THREE.Color(c === undefined || c === null ? dflt : c);
  }

  /* ================================================================== */
  /* 1. Structure — floors, walls, ceilings                              */
  /* ================================================================== */

  /* Varnished wood: .4 / 0 */
  surface('wood', 'wood', null, {
    roughness: 0.42, metalness: 0, normal: 0.9, rough: [0.28, 0.58],
    fallbackColor: 0x8a6440
  });

  surface('woodDark', 'wood', {
    light: '#6a4526', dark: '#38200e', deep: '#180d05', seed: 8, wear: 0.35
  }, {
    roughness: 0.38, metalness: 0, normal: 0.9, rough: [0.26, 0.54],
    fallbackColor: 0x3a2413
  });

  /* Desk laminate — a harder, flatter sheen than varnish. */
  surface('laminate', 'laminate', null, {
    roughness: 0.33, metalness: 0, normal: 0.35, rough: [0.20, 0.42],
    fallbackColor: 0x9ba1a7
  });

  surface('carpetOffice', 'carpetOffice', null, {
    roughness: 0.98, metalness: 0, normal: 1.0, rough: [0.88, 1.0], env: 0.35,
    fallbackColor: 0x4a4a48
  });

  surface('carpetHotel', 'carpetHotel', null, {
    roughness: 0.96, metalness: 0, normal: 1.1, rough: [0.84, 1.0], env: 0.35,
    fallbackColor: 0x5a1420
  });

  /* Painted drywall: .92 / 0 */
  surface('drywall', 'drywall', null, {
    roughness: 0.92, metalness: 0, normal: 0.55, rough: [0.86, 0.97], env: 0.5,
    fallbackColor: 0xe2ded4
  });

  surface('concrete', 'concrete', null, {
    roughness: 0.9, metalness: 0, normal: 1.1, rough: [0.72, 0.96], env: 0.45,
    fallbackColor: 0x8d8b85
  });

  surface('brickPainted', 'brickPainted', null, {
    roughness: 0.9, metalness: 0, normal: 1.35, rough: [0.74, 0.96], env: 0.45,
    fallbackColor: 0xcfc9bb
  });

  surface('plasterCeiling', 'plasterCeiling', null, {
    roughness: 0.94, metalness: 0, normal: 0.5, env: 0.4,
    fallbackColor: 0xefece5
  });

  surface('ceilingTile', 'ceilingTile', null, {
    roughness: 0.95, metalness: 0, normal: 0.6, env: 0.4,
    fallbackColor: 0xddd9cd
  });

  /* Glazed ceramic — a real floor tile is nearly a mirror at grazing angles. */
  surface('tileFloor', 'tileFloor', null, {
    roughness: 0.2, metalness: 0, normal: 0.55, rough: [0.10, 0.34], env: 1.0,
    fallbackColor: 0xc9c6bd
  });

  surface('marbleFloor', 'marbleFloor', null, {
    roughness: 0.12, metalness: 0, normal: 0.35, rough: [0.05, 0.20], env: 1.15,
    fallbackColor: 0xe6e1d6
  });

  surface('marbleWall', 'marbleWall', null, {
    roughness: 0.22, metalness: 0, normal: 0.4, rough: [0.12, 0.34], env: 0.95,
    fallbackColor: 0xded4c0
  });

  surface('asphalt', 'asphalt', null, {
    roughness: 0.94, metalness: 0, normal: 1.3, rough: [0.78, 0.99], env: 0.35,
    fallbackColor: 0x3a3a3c
  });

  /* Semi-gloss painted joinery — shop door, skirting, window frames. */
  def('doorPaint', function (o) {
    var to = TO(o, { tint: '#8d8f92', wear: 0.25, seed: 211 });
    if (o.color !== undefined && o.tint === undefined) to.tint = o.color;
    return build({
      map: T('steelPainted', to),
      roughness: 0.45, metalness: 0, normal: 0.3, rough: [0.32, 0.58],
      color: 0xffffff, fallbackColor: 0x8d8f92
    });
  });

  /* Clipped box hedge outside the office park. */
  surface('hedge', 'carpetOffice', { tint: '#3c5233', wear: 0, seed: 401 }, {
    roughness: 1.0, metalness: 0, normal: 1.2, env: 0.3,
    fallbackColor: 0x3c5233
  });

  /* ================================================================== */
  /* 2. Metals — brushed aluminium .35/1, bare steel .5/1                */
  /* ================================================================== */

  surface('steelBrushed', 'steelBrushed', null, {
    roughness: 0.42, metalness: 1, normal: 0.5, rough: [0.26, 0.52], env: 1.0,
    fallbackColor: 0xa9b0b6
  });

  surface('aluminium', 'aluminium', null, {
    roughness: 0.35, metalness: 1, normal: 0.35, rough: [0.24, 0.44], env: 1.05,
    fallbackColor: 0xc6cbd0
  });

  /* Powder-coated steel is a dielectric shell over metal: metalness 0. */
  surface('steelPainted', 'steelPainted', null, {
    roughness: 0.62, metalness: 0, normal: 0.4, rough: [0.48, 0.76], env: 0.7,
    fallbackColor: 0x777e85
  });

  surface('steelDark', 'steelBrushed', { tint: '#63696f', seed: 84 }, {
    roughness: 0.55, metalness: 1, normal: 0.5, rough: [0.38, 0.64], env: 0.9,
    fallbackColor: 0x4c5157
  });

  surface('copperTrace', 'copperTrace', null, {
    roughness: 0.4, metalness: 1, normal: 0.5, rough: [0.24, 0.55], env: 1.0,
    fallbackColor: 0xb0703a
  });

  surface('brass', 'steelBrushed', { tint: '#b4912f', seed: 85 }, {
    roughness: 0.3, metalness: 1, normal: 0.4, rough: [0.18, 0.42], env: 1.1,
    fallbackColor: 0xb4912f
  });

  surface('brassWorn', 'steelBrushed', { tint: '#8a7331', seed: 86 }, {
    roughness: 0.52, metalness: 1, normal: 0.5, rough: [0.36, 0.66], env: 0.95,
    fallbackColor: 0x8a7331
  });

  surface('brassDark', 'steelBrushed', { tint: '#6f5719', seed: 87 }, {
    roughness: 0.48, metalness: 1, normal: 0.5, rough: [0.34, 0.62], env: 0.9,
    fallbackColor: 0x6f5719
  });

  /* ================================================================== */
  /* 3. Plastics, rubber, glass                                          */
  /* ================================================================== */

  /* 1998 beige: .75 / 0 */
  surface('beigePlastic', 'beigePlastic', null, {
    roughness: 0.75, metalness: 0, normal: 0.35, rough: [0.62, 0.84],
    fallbackColor: 0xd9d0b2
  });

  /* ABS: .6 / 0 */
  surface('blackPlastic', 'blackPlastic', null, {
    roughness: 0.6, metalness: 0, normal: 0.35, rough: [0.44, 0.70],
    fallbackColor: 0x24262a
  });

  surface('blackMatte', 'blackPlastic', { tint: '#0d0e10', seed: 108 }, {
    roughness: 0.88, metalness: 0, normal: 0.3, env: 0.4,
    fallbackColor: 0x0d0e10
  });

  surface('rubber', 'rubber', null, {
    roughness: 0.95, metalness: 0, normal: 0.6, rough: [0.86, 1.0], env: 0.3,
    fallbackColor: 0x1b1c1e
  });

  surface('foam', 'rubber', { tint: '#191b1e', seed: 110 }, {
    roughness: 1.0, metalness: 0, normal: 0.7, env: 0.2,
    fallbackColor: 0x191b1e
  });

  surface('leather', 'rubber', { tint: '#2b2118', seed: 112 }, {
    roughness: 0.55, metalness: 0, normal: 0.8, rough: [0.40, 0.72], env: 0.7,
    fallbackColor: 0x2b2118
  });

  /* Dirty window glass — the dust film is in the map's alpha. */
  def('glassDirty', function (o) {
    return build({
      map: T('glassDirty', TO(o)),
      color: colOr(o.color, '#b9c6cc'),
      roughness: 0.2, metalness: 0, env: 1.3,
      extra: {
        transparent: true,
        opacity: o.opacity === undefined ? 0.42 : o.opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      }
    });
  });

  /* ================================================================== */
  /* 4. Fabric, paper, organic                                           */
  /* ================================================================== */

  surface('fabricSeat', 'fabricSeat', null, {
    roughness: 0.96, metalness: 0, normal: 0.7, env: 0.35,
    fallbackColor: 0x4c5763
  });

  surface('velvet', 'fabricSeat', { tint: '#5c1a26', seed: 128 }, {
    roughness: 0.95, metalness: 0, normal: 0.6, env: 0.4,
    fallbackColor: 0x5c1a26
  });

  surface('denim', 'denim', null, {
    roughness: 0.94, metalness: 0, normal: 0.6, env: 0.35,
    fallbackColor: 0x2f4363
  });

  surface('cotton', 'cotton', null, {
    roughness: 0.95, metalness: 0, normal: 0.45, env: 0.35,
    fallbackColor: 0xdcd7cc
  });

  surface('coverallBlue', 'coverallBlue', null, {
    roughness: 0.93, metalness: 0, normal: 0.6, env: 0.35,
    fallbackColor: 0x2c4a72
  });

  surface('suitWool', 'suitWool', null, {
    roughness: 0.92, metalness: 0, normal: 0.6, env: 0.35,
    fallbackColor: 0x242830
  });

  surface('cardboard', 'cardboard', null, {
    roughness: 0.95, metalness: 0, normal: 0.6, env: 0.35,
    fallbackColor: 0xb28a58
  });

  surface('paper', 'paper', null, {
    roughness: 0.93, metalness: 0, normal: 0.25, env: 0.4,
    fallbackColor: 0xefe9dc
  });

  surface('manila', 'paper', { tint: '#c9a870', age: 0.5 }, {
    roughness: 0.93, metalness: 0, normal: 0.25, env: 0.4,
    fallbackColor: 0xc9a870
  });

  surface('skin', 'skin', null, {
    roughness: 0.62, metalness: 0, normal: 0.35, rough: [0.48, 0.74], env: 0.6,
    fallbackColor: 0xe9c4ac
  });

  surface('hairGrey', 'hairGrey', null, {
    roughness: 0.72, metalness: 0, normal: 0.5, env: 0.5,
    fallbackColor: 0x9a9895
  });

  surface('hairBrown', 'hairBrown', null, {
    roughness: 0.72, metalness: 0, normal: 0.5, env: 0.5,
    fallbackColor: 0x4a3423
  });

  surface('catFur', 'catFur', null, {
    roughness: 0.88, metalness: 0, normal: 0.45, env: 0.4,
    fallbackColor: 0x8e857a
  });

  def('leaf', function (o) {
    return build({
      color: colOr(o.color, '#2f5c2a'),
      roughness: 0.85, metalness: 0, env: 0.4,
      extra: { side: THREE.DoubleSide }
    });
  });

  /* ================================================================== */
  /* 5. Electronics                                                      */
  /* ================================================================== */

  surface('pcb', 'pcb', null, {
    roughness: 0.5, metalness: 0, normal: 0.9, rough: [0.32, 0.66], env: 0.8,
    fallbackColor: 0x1c6b40
  });

  /* Moulded epoxy IC package — dielectric, satin. */
  surface('silicon', 'silicon', null, {
    roughness: 0.4, metalness: 0, normal: 0.5, rough: [0.24, 0.56], env: 0.8,
    fallbackColor: 0x4a4e57
  });

  surface('keycapSet', 'keycapSet', null, {
    roughness: 0.68, metalness: 0, normal: 0.3, env: 0.5,
    fallbackColor: 0xd9d0b2
  });

  /* ================================================================== */
  /* 6. Print — posters, signs, labels                                   */
  /* ================================================================== */

  surface('posterA', 'posterA', null, { roughness: 0.86, metalness: 0, env: 0.4 });
  surface('posterB', 'posterB', null, { roughness: 0.86, metalness: 0, env: 0.4 });
  surface('posterC', 'posterC', null, { roughness: 0.86, metalness: 0, env: 0.4 });
  surface('labelPart', 'labelPart', null, {
    roughness: 0.7, metalness: 0, env: 0.4
  });

  /* Shop / hotel signage glows a little — bloom picks this up. */
  function litSign(name, texName, inten) {
    def(name, function (o) {
      var t = T(texName, TO(o));
      var e = o.intensity === undefined ? inten : o.intensity;
      var m = build({
        map: t, color: 0x1a1a1a, roughness: 0.55, metalness: 0, env: 0.5
      });
      m.emissive = colOr(o.emissive, '#ffffff');
      m.emissiveMap = t;
      m.emissiveIntensity = e;
      return m;
    });
  }
  litSign('signShop', 'signShop', 1.35);
  litSign('signHotel', 'signHotel', 1.0);

  /* Suspended fluorescent diffuser. */
  def('ceilingLightPanel', function (o) {
    var t = T('ceilingLightPanel', TO(o));
    var m = build({
      map: t, color: 0x0b0b0b, roughness: 0.9, metalness: 0, env: 0.3
    });
    m.emissive = colOr(o.emissive, '#fdf6e6');
    m.emissiveMap = t;
    m.emissiveIntensity = o.intensity === undefined ? 1.6 : o.intensity;
    return m;
  });

  /* ================================================================== */
  /* 7. Screens                                                          */
  /* ================================================================== */

  /* Unlit, self-lit, not tone mapped: a monitor is a light source, not a
   * surface. Drive brightness through material.emissiveIntensity. */
  function screenFrom(t, inten, tint) {
    var m = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: colOr(tint, '#ffffff'),
      emissiveMap: t || null,
      emissiveIntensity: inten === undefined ? 1.0 : inten,
      roughness: 0.35,
      metalness: 0,
      envMapIntensity: 0.2
    });
    m.toneMapped = false;
    return m;
  }

  var SCREEN_CACHE = {};
  mat.screenMat = function (texture, opts) {
    if (texture && texture.texture) texture = texture.texture;
    opts = opts || {};
    var k = (texture && texture.uuid ? texture.uuid : 'none') + '|' + stable(opts);
    var m = SCREEN_CACHE[k];
    if (m) return m;
    if (texture && texture.isTexture) setCS(texture, THREE.SRGBColorSpace);
    m = screenFrom(texture, opts.intensity, opts.tint);
    m.name = 'mat:screen';
    m.userData.shared = true;
    SCREEN_CACHE[k] = m;
    COUNT++;
    return m;
  };

  def('screenCRT', function (o) {
    return screenFrom(T('screenCRT', TO(o)), o.intensity === undefined ? 1.15 : o.intensity, o.tint);
  });
  def('screenLCD', function (o) {
    return screenFrom(T('screenLCD', TO(o)), o.intensity === undefined ? 1.0 : o.intensity, o.tint);
  });
  def('screenTerminal', function (o) {
    return screenFrom(T('screenTerminal', TO(o)), o.intensity === undefined ? 1.25 : o.intensity, o.tint);
  });

  /* ================================================================== */
  /* 8. Parametric helpers                                               */
  /* ================================================================== */

  function param(name, argc, build2) {
    var cache = {};
    CACHES[name] = cache;
    mat[name] = function () {
      var args = [], i;
      for (i = 0; i < argc; i++) args.push(arguments[i]);
      var k = stable(args);
      var m = cache[k];
      if (m) return m;
      try { m = build2.apply(null, args); } catch (e) { m = null; }
      if (!m || !m.isMaterial) {
        m = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 });
      }
      m.name = 'mat:' + name;
      m.userData.shared = true;
      cache[k] = m;
      COUNT++;
      return m;
    };
  }

  /* emissive(colour, intensity) — LEDs, standby lamps, phosphor glow. */
  param('emissive', 2, function (color, intensity) {
    var c = colOr(color, '#ffffff');
    var i = intensity === undefined ? 1.0 : intensity;
    var m = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: c,
      emissiveIntensity: i,
      roughness: 0.6,
      metalness: 0,
      envMapIntensity: 0.2
    });
    return m;
  });

  /* glass(opts) — .05 / 0 + transparent. */
  param('glass', 1, function (opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colOr(opts.color, '#cfe1ea'),
      roughness: opts.roughness === undefined ? 0.05 : opts.roughness,
      metalness: 0,
      transparent: true,
      opacity: opts.opacity === undefined ? 0.24 : opts.opacity,
      side: opts.side === undefined ? THREE.DoubleSide : opts.side,
      depthWrite: false,
      envMapIntensity: 1.4
    });
  });

  param('glassDark', 1, function (opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colOr(opts.color, '#141a1e'),
      roughness: opts.roughness === undefined ? 0.08 : opts.roughness,
      metalness: 0,
      transparent: true,
      opacity: opts.opacity === undefined ? 0.72 : opts.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.2
    });
  });

  param('chrome', 1, function (opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colOr(opts.color, '#eef2f5'),
      roughness: opts.roughness === undefined ? 0.06 : opts.roughness,
      metalness: 1,
      envMapIntensity: 1.35
    });
  });

  param('matte', 2, function (color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colOr(color, '#8a8f96'),
      roughness: opts.roughness === undefined ? 0.95 : opts.roughness,
      metalness: 0,
      envMapIntensity: 0.5
    });
  });

  param('plastic', 2, function (color, opts) {
    opts = opts || {};
    var m = new THREE.MeshStandardMaterial({
      color: colOr(color, '#b9bec4'),
      roughness: opts.roughness === undefined ? 0.6 : opts.roughness,
      metalness: 0,
      envMapIntensity: 0.7
    });
    if (opts.transparent) {
      m.transparent = true;
      m.opacity = opts.opacity === undefined ? 0.5 : opts.opacity;
      m.depthWrite = false;
    }
    if (opts.side !== undefined) m.side = opts.side;
    return m;
  });

  param('metal', 2, function (color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colOr(color, '#b6bcc2'),
      roughness: opts.roughness === undefined ? 0.45 : opts.roughness,
      metalness: 1,
      envMapIntensity: opts.env === undefined ? 1.0 : opts.env
    });
  });

  /* paint(colour, roughness) — sprayed enamel on anything. */
  param('paint', 2, function (color, roughness) {
    return new THREE.MeshStandardMaterial({
      color: colOr(color, '#9aa0a6'),
      roughness: roughness === undefined ? 0.7 : roughness,
      metalness: 0,
      envMapIntensity: 0.65
    });
  });

  /* decal(texture, opts) — stickers, part labels, warning plates. Sits a
   * fraction in front of its host surface without z-fighting. */
  var DECAL_CACHE = {};
  mat.decal = function (texture, opts) {
    if (texture && texture.texture) texture = texture.texture;
    opts = opts || {};
    var k = (texture && texture.uuid ? texture.uuid : 'none') + '|' + stable(opts);
    var m = DECAL_CACHE[k];
    if (m) return m;
    if (texture && texture.isTexture) setCS(texture, THREE.SRGBColorSpace);
    m = new THREE.MeshStandardMaterial({
      color: colOr(opts.color, '#ffffff'),
      map: texture || null,
      roughness: opts.roughness === undefined ? 0.78 : opts.roughness,
      metalness: 0,
      transparent: true,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      depthWrite: false,
      alphaTest: opts.alphaTest === undefined ? 0.01 : opts.alphaTest,
      side: opts.side === undefined ? THREE.FrontSide : opts.side,
      polygonOffset: true,
      polygonOffsetFactor: opts.offsetFactor === undefined ? -2 : opts.offsetFactor,
      polygonOffsetUnits: opts.offsetUnits === undefined ? -4 : opts.offsetUnits,
      envMapIntensity: 0.4
    });
    if (opts.emissive) {
      m.emissive = colOr(opts.emissive, '#ffffff');
      m.emissiveMap = texture || null;
      m.emissiveIntensity = opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity;
    }
    m.name = 'mat:decal';
    m.userData.shared = true;
    DECAL_CACHE[k] = m;
    COUNT++;
    return m;
  };

  /* Unlit helpers — skydome, sprites, particles. Not standard materials on
   * purpose: nothing about them should respond to a light. */
  var UNLIT_CACHE = {};
  mat.unlit = function (texture, opts) {
    if (texture && texture.texture) texture = texture.texture;
    opts = opts || {};
    var k = (texture && texture.uuid ? texture.uuid : 'none') + '|' + stable(opts);
    var m = UNLIT_CACHE[k];
    if (m) return m;
    if (texture && texture.isTexture) setCS(texture, THREE.SRGBColorSpace);
    m = new THREE.MeshBasicMaterial({
      color: colOr(opts.color, '#ffffff'),
      map: texture || null,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side === undefined ? THREE.FrontSide : opts.side,
      depthWrite: opts.depthWrite === undefined ? true : !!opts.depthWrite,
      fog: opts.fog === undefined ? true : !!opts.fog
    });
    if (opts.additive) m.blending = THREE.AdditiveBlending;
    m.toneMapped = opts.toneMapped === undefined ? true : !!opts.toneMapped;
    m.name = 'mat:unlit';
    m.userData.shared = true;
    UNLIT_CACHE[k] = m;
    COUNT++;
    return m;
  };

  mat.sky = function (opts) {
    opts = opts || {};
    var t = T(opts.night ? 'nightCity' : 'skyGradient', TO(opts));
    return mat.unlit(t, {
      side: THREE.BackSide, depthWrite: false, fog: false,
      toneMapped: false, color: opts.color
    });
  };

  mat.particle = function (name, opts) {
    opts = opts || {};
    var t = T(name || 'particleSoft', TO(opts));
    return mat.unlit(t, {
      transparent: true, depthWrite: false, additive: opts.additive !== false,
      opacity: opts.opacity === undefined ? 0.8 : opts.opacity,
      color: opts.color, side: THREE.DoubleSide, fog: false
    });
  };

  /* ================================================================== */
  /* 9. Environment — without this every metal is a black hole           */
  /* ================================================================== */

  var ENV = null;          /* PMREM texture */
  var ENV_RT = null;       /* its render target, kept alive on purpose */
  var ENV_TRIED = false;

  /* A 1930s-hotel-meets-office-park sky: cool overcast above, a warm floor
   * bounce below, one big soft window and a strip light. Metals need
   * *structure* to reflect, not a flat grey. */
  function envCanvas() {
    var w = 256, h = 128;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');

    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#93aecb');
    sky.addColorStop(0.32, '#c9d3dd');
    sky.addColorStop(0.48, '#eef0ee');
    sky.addColorStop(0.50, '#3a3730');   /* hard horizon: contrast is the point */
    sky.addColorStop(0.72, '#2a2723');
    sky.addColorStop(1.00, '#141210');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    var i, s;

    /* Hard-edged windows and strip lights. A mirror needs *shapes* to
     * reflect — a smooth gradient only ever reads as a white ball. */
    g.fillStyle = 'rgba(255,251,240,0.92)';
    for (i = 0; i < 4; i++) {
      var wx = w * (0.06 + i * 0.25);
      g.fillRect(wx, h * 0.16, w * 0.11, h * 0.20);
    }
    g.fillStyle = 'rgba(255,247,228,0.85)';
    g.fillRect(0, h * 0.02, w, h * 0.05);   /* ceiling strip, all the way round */

    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < 3; i++) {
      var yy = h * 0.10;
      var xx = w * (0.18 + i * 0.32);
      s = g.createRadialGradient(xx, yy, 0, xx, yy, w * 0.13);
      s.addColorStop(0, 'rgba(255,250,235,0.95)');
      s.addColorStop(0.5, 'rgba(255,246,220,0.35)');
      s.addColorStop(1, 'rgba(255,246,220,0)');
      g.fillStyle = s;
      g.fillRect(xx - w * 0.15, yy - w * 0.15, w * 0.3, w * 0.3);
    }

    /* the shop window: one big warm soft box just above the horizon */
    s = g.createRadialGradient(w * 0.72, h * 0.40, 0, w * 0.72, h * 0.40, w * 0.20);
    s.addColorStop(0, 'rgba(255,238,205,0.85)');
    s.addColorStop(0.55, 'rgba(255,236,200,0.28)');
    s.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);

    /* a cool bounce opposite it so metals are not one-sided */
    s = g.createRadialGradient(w * 0.20, h * 0.44, 0, w * 0.20, h * 0.44, w * 0.18);
    s.addColorStop(0, 'rgba(190,214,240,0.45)');
    s.addColorStop(1, 'rgba(190,214,240,0)');
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);

    /* subtle horizon break-up so the reflection is not a perfect band */
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.16;
    for (i = 0; i < 26; i++) {
      var r = util.rng(i * 977 + 13)();
      var bw = w * (0.02 + r * 0.05);
      g.fillStyle = r > 0.5 ? '#e8e4da' : '#3d3a34';
      g.fillRect((i / 26) * w, h * 0.5 - h * 0.03 * r, bw, h * 0.05);
    }
    g.globalAlpha = 1;

    return c;
  }

  mat.installEnvironment = function (renderer, scene) {
    if (!ENV && !ENV_TRIED) {
      ENV_TRIED = true;
      if (!renderer || !THREE.PMREMGenerator) return null;
      try {
        var t = new THREE.CanvasTexture(envCanvas());
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        var pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        ENV_RT = pmrem.fromEquirectangular(t);
        ENV = ENV_RT.texture;
        pmrem.dispose();
        t.dispose();
      } catch (e) {
        ENV = null; ENV_RT = null;
        if (window.console) {
          console.warn('[SG.mat] no environment map; metals will be flat', e);
        }
      }
    }
    if (ENV && scene) scene.environment = ENV;
    return ENV;
  };

  mat.environment = function () { return ENV; };

  /* ================================================================== */
  /* 10. Warm-up + stats                                                 */
  /* ================================================================== */

  var warmed = false;
  mat.__warm = function () {
    if (warmed) return 0;
    warmed = true;
    var t0 = util.now();
    var list = ['wood', 'laminate', 'carpetOffice', 'concrete', 'drywall',
      'ceilingTile', 'beigePlastic', 'blackPlastic', 'steelBrushed',
      'steelPainted', 'aluminium', 'rubber', 'cardboard', 'paper', 'pcb'];
    for (var i = 0; i < list.length; i++) {
      try { mat[list[i]](); } catch (e) { /* a missing family must not stop boot */ }
    }
    try { mat.chrome(); mat.glass(); mat.matte('#8a8f96'); } catch (e2) { /* noop */ }
    var ms = (util.now() - t0) * 1000;
    mat.__warmMs = ms;
    return ms;
  };

  mat.__stats = function () {
    return {
      families: Object.keys(CACHES).length,
      instances: COUNT,
      maps: HAS_MAPS,
      env: !!ENV,
      warmMs: mat.__warmMs || 0
    };
  };

  mat.__names = function () {
    var out = [], k;
    for (k in mat) {
      if (typeof mat[k] === 'function' && k.indexOf('__') !== 0) out.push(k);
    }
    return out.sort();
  };

})(window.SG, window.THREE);

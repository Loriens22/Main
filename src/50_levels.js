/* ============================================================================
 * STEVE THE PC REPAIR MAN — 50_levels.js
 * AGENT D — worlds, stealth AI, interactables, easter eggs.
 *
 * Attaches exactly one thing: STV.Levels
 *   STV.Levels.list            ordered level ids
 *   STV.Levels.build(id, ctx)  -> LevelObject   ctx={scene,camera,renderer,physics,rng}
 *
 * Everything geometric is routed through safeGeo() so a missing STV.Geo factory
 * degrades to a labelled box instead of taking the build down. Everything
 * placed goes through addProp() so collider baking is uniform.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};
  var T = window.THREE;

  /* ==========================================================================
   * 0. CONSTANTS
   * ========================================================================*/

  var MAX_LIGHTS = 6;                 /* dynamic (point/spot/dir) per level    */
  var EYE_STAND = 1.62;
  var EYE_CROUCH = 0.92;
  var HUMAN_FACING = 1;               /* +1 if Geo.human faces +Z, -1 for -Z   */
  var DEG = Math.PI / 180;

  var LEVEL_IDS = ['shop', 'flight', 'plaza', 'lobby', 'serverfloor', 'vault', 'escape', 'epilogue'];
  var NEXT_ID = {
    shop: 'flight', flight: 'plaza', plaza: 'lobby', lobby: 'serverfloor',
    serverfloor: 'vault', vault: 'escape', escape: 'epilogue', epilogue: null
  };

  /* Dry Steve lines used when alarm 3 kicks you back to a checkpoint. */
  var CAUGHT_LINES = [
    'Right. That’s a no, then.',
    'Different door, I think.',
    'I’ve been asked to leave better places.',
    'Noted. Louder than it looked.',
    'That corner is a mistake. I’ll remember it.',
    'Let’s pretend that was a rehearsal.',
    'Hm. Try it slower.'
  ];

  /* ==========================================================================
   * 1. LOW-LEVEL CACHES + SAFE WRAPPERS
   * ========================================================================*/

  var geoCache = {}, matCache = {}, screenCount = 0;

  function V(x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); }

  function boxGeo(w, h, d) {
    var k = 'b|' + w.toFixed(3) + '|' + h.toFixed(3) + '|' + d.toFixed(3);
    return STV.memo(geoCache, k, function () {
      var g = new T.BoxGeometry(w, h, d);
      g.userData.shared = true;
      return g;
    });
  }
  function planeGeo(w, h) {
    var k = 'p|' + w.toFixed(3) + '|' + h.toFixed(3);
    return STV.memo(geoCache, k, function () {
      var g = new T.PlaneGeometry(w, h);
      g.userData.shared = true;
      return g;
    });
  }
  function cylGeo(rt, rb, h, seg) {
    seg = seg || 10;
    var k = 'c|' + rt.toFixed(3) + '|' + rb.toFixed(3) + '|' + h.toFixed(3) + '|' + seg;
    return STV.memo(geoCache, k, function () {
      var g = new T.CylinderGeometry(rt, rb, h, seg);
      g.userData.shared = true;
      return g;
    });
  }
  function coneGeo(r, h, seg) {
    seg = seg || 10;
    var k = 'k|' + r.toFixed(3) + '|' + h.toFixed(3) + '|' + seg;
    return STV.memo(geoCache, k, function () {
      var g = new T.ConeGeometry(r, h, seg);
      g.userData.shared = true;
      return g;
    });
  }
  function sphereGeo(r, seg) {
    seg = seg || 10;
    var k = 's|' + r.toFixed(3) + '|' + seg;
    return STV.memo(geoCache, k, function () {
      var g = new T.SphereGeometry(r, seg, Math.max(4, seg >> 1));
      g.userData.shared = true;
      return g;
    });
  }
  /* flat floor "vision fan" sector, radius 1, opening `ang` radians, +Z centred */
  function fanGeo(ang, seg) {
    var k = 'f|' + ang.toFixed(4) + '|' + seg;
    return STV.memo(geoCache, k, function () {
      var g = new T.CircleGeometry(1, seg, Math.PI * 0.5 - ang * 0.5, ang);
      g.rotateX(-Math.PI * 0.5);
      g.userData.shared = true;
      return g;
    });
  }

  /* Fallback palette for when STV.Mat is not there yet (or lacks a name). */
  var MAT_FB = {
    wood: [0x8a6540, 0.85, 0.0], woodDark: [0x4b3625, 0.8, 0.0],
    carpetShop: [0x6d6459, 1.0, 0.0], carpetOffice: [0x3c4249, 1.0, 0.0],
    concrete: [0x8d8f8c, 0.95, 0.0], concretePolished: [0x6e7276, 0.35, 0.0],
    asphalt: [0x2e3134, 0.98, 0.0], drywall: [0xcfc9bf, 0.95, 0.0],
    drywallShop: [0xd8cfbd, 0.95, 0.0], ceiling: [0xe2e0d8, 0.98, 0.0],
    brick: [0x8a4f3d, 0.95, 0.0], steel: [0x9aa2a8, 0.45, 0.85],
    steelDark: [0x4a5157, 0.5, 0.8], aluminium: [0xb9c0c6, 0.3, 0.9],
    chrome: [0xe6ecf1, 0.08, 1.0], beige: [0xd9cfae, 0.75, 0.0],
    blackPlastic: [0x1d2024, 0.7, 0.0], greyPlastic: [0x6a7076, 0.7, 0.0],
    rubber: [0x24272a, 1.0, 0.0], glass: [0xbcd6e4, 0.05, 0.0],
    glassTint: [0x2b3a44, 0.1, 0.2], screenOff: [0x0d1114, 0.25, 0.0],
    led: [0xffffff, 0.4, 0.0], ledRed: [0xff3b30, 0.4, 0.0],
    ledGreen: [0x3ce07a, 0.4, 0.0], ledAmber: [0xf0a24b, 0.4, 0.0],
    paper: [0xeee7d6, 0.98, 0.0], cardboard: [0xb08f61, 1.0, 0.0],
    fabricBlue: [0x35516e, 0.98, 0.0], fabricGrey: [0x5c6169, 0.98, 0.0],
    skinLight: [0xe8bd9b, 0.8, 0.0], skinMid: [0xc08a5f, 0.8, 0.0],
    skinDeep: [0x7a4f34, 0.8, 0.0], hairGrey: [0xc9c6c0, 0.9, 0.0],
    hairDark: [0x2a2320, 0.9, 0.0], clothWhite: [0xe9e9e6, 0.95, 0.0],
    clothNavy: [0x222c3c, 0.95, 0.0], clothBlack: [0x191b1e, 0.95, 0.0],
    clothOlive: [0x4d5340, 0.95, 0.0], clothTan: [0xa89272, 0.95, 0.0],
    catFur: [0x8c8377, 0.95, 0.0], catFurDark: [0x40382f, 0.95, 0.0],
    neonCyan: [0x5fd3ff, 0.4, 0.0], neonMagenta: [0xff5fd3, 0.4, 0.0],
    emissiveWhite: [0xffffff, 0.4, 0.0]
  };

  function M(name, colOverride) {
    if (STV.Mat && typeof STV.Mat.get === 'function') {
      try {
        var m = STV.Mat.get(name);
        if (m && m.isMaterial) return m;
      } catch (e) { /* fall through */ }
    }
    var key = 'fb|' + name + '|' + (colOverride == null ? '-' : colOverride);
    return STV.memo(matCache, key, function () {
      var d = MAT_FB[name] || [0x8b939a, 0.9, 0.0];
      var col = colOverride == null ? d[0] : colOverride;
      var mm = new T.MeshStandardMaterial({ color: col, roughness: d[1], metalness: d[2] });
      mm.userData.shared = true;
      return mm;
    });
  }

  /* unlit colour — for glow panels, screens off, cones, indicators */
  function basic(color, opacity, additive, side) {
    var key = 'bs|' + color + '|' + (opacity == null ? 1 : opacity) + '|' + (additive ? 1 : 0) + '|' + (side || 0);
    return STV.memo(matCache, key, function () {
      var o = { color: color };
      if (opacity != null && opacity < 1) { o.transparent = true; o.opacity = opacity; }
      if (additive) { o.blending = T.AdditiveBlending; o.depthWrite = false; o.transparent = true; }
      if (side) o.side = side === 2 ? T.DoubleSide : T.BackSide;
      var m = new T.MeshBasicMaterial(o);
      m.userData.shared = true;
      return m;
    });
  }
  function emissiveMat(color, strength) {
    var key = 'em|' + color + '|' + strength;
    return STV.memo(matCache, key, function () {
      var m = new T.MeshStandardMaterial({
        color: 0x0a0a0a, emissive: color, emissiveIntensity: strength,
        roughness: 0.6, metalness: 0.0
      });
      m.userData.shared = true;
      return m;
    });
  }

  function normSize(s) {
    if (!s) return V(0.5, 0.5, 0.5);
    if (s.isVector3) return s.clone();
    if (s.length === 3) return V(s[0], s[1], s[2]);
    return V(s.x || 0.5, s.y || 0.5, s.z || 0.5);
  }

  /* --- the one geometry entry point ---------------------------------------
   * safeGeo(name, args, fallbackSize, fbOpts)
   * Never throws. Always returns a THREE.Group with userData.size set.
   * fbOpts: {color, solid:false, kind:'human'|'cat'|'flat'}
   * ----------------------------------------------------------------------*/
  function safeGeo(name, args, fallbackSize, fbOpts) {
    var g = null;
    if (STV.Geo && typeof STV.Geo[name] === 'function') {
      try {
        g = STV.Geo[name].apply(STV.Geo, args || []);
      } catch (e) {
        STV.warn('[levels] STV.Geo.' + name + ' threw:', e);
        g = null;
      }
    }
    if (!g || !g.isObject3D) {
      g = fallbackGroup(name, fallbackSize, fbOpts);
    } else {
      if (!g.userData) g.userData = {};
      if (!g.userData.size) g.userData.size = normSize(fallbackSize);
      if (!g.name) g.name = name;
    }
    g.userData.geoName = name;
    return g;
  }

  function fallbackGroup(name, size, opts) {
    opts = opts || {};
    var s = normSize(size);
    var g = new T.Group();
    var kind = opts.kind || 'box';
    var col = opts.color == null ? 0x767d84 : opts.color;

    if (kind === 'human') {
      var hh = s.y;
      var legs = new T.Mesh(boxGeo(s.x * 0.7, hh * 0.48, s.z * 0.8), M('clothNavy'));
      legs.position.y = hh * 0.24; g.add(legs);
      var torso = new T.Mesh(boxGeo(s.x, hh * 0.32, s.z), M(opts.mat || 'clothOlive'));
      torso.position.y = hh * 0.64; g.add(torso);
      var head = new T.Mesh(sphereGeo(hh * 0.088, 10), M('skinMid'));
      head.position.y = hh * 0.925; g.add(head);
      g.head = head;
    } else if (kind === 'cat') {
      var body = new T.Mesh(boxGeo(s.x * 0.55, s.y * 0.55, s.z), M('catFur'));
      body.position.y = s.y * 0.5; g.add(body);
      var chead = new T.Mesh(sphereGeo(s.y * 0.3, 10), M('catFur'));
      chead.position.set(0, s.y * 0.78, s.z * 0.42); g.add(chead);
      g.head = chead;
    } else if (kind === 'flat') {
      var pl = new T.Mesh(planeGeo(s.x, s.y), basic(col, 1, false, 2));
      pl.position.y = s.y * 0.5; g.add(pl);
    } else {
      var m = new T.Mesh(boxGeo(s.x, s.y, s.z), opts.mat ? M(opts.mat) : M('_fb', col));
      m.position.y = s.y * 0.5;
      m.receiveShadow = true;
      g.add(m);
    }

    g.userData.size = s.clone();
    g.userData.fallback = true;
    g.userData.colliders = (opts.solid === false || kind === 'flat' || kind === 'cat')
      ? []
      : [{ type: 'box', c: V(0, s.y * 0.5, 0), h: V(s.x * 0.5, s.y * 0.5, s.z * 0.5) }];
    g.name = 'fb_' + name;
    return g;
  }

  /* Make sure anything we treat as a character has the API we call. */
  function ensureHuman(g) {
    if (typeof g.setPose !== 'function') g.setPose = function () {};
    if (typeof g.update !== 'function') g.update = function () {};
    if (!g.rig) g.rig = { root: g, head: g.head || g, hips: g, chest: g };
    return g;
  }
  function ensureCat(g) {
    if (typeof g.update !== 'function') g.update = function () {};
    if (!g.head) g.head = g;
    return g;
  }
  /* door(w,h) must have .open(t); if the factory gave us none, fake a swing. */
  function ensureOpenable(g, w) {
    if (typeof g.open === 'function') return g;
    var pivot = new T.Group();
    var kids = g.children.slice();
    for (var i = 0; i < kids.length; i++) pivot.add(kids[i]);
    pivot.position.x = -(w || 1) * 0.5;
    var inner = new T.Group();
    inner.position.x = (w || 1) * 0.5;
    while (pivot.children.length) inner.add(pivot.children[0]);
    pivot.add(inner);
    g.add(pivot);
    g.open = function (t) { pivot.rotation.y = -STV.clamp(t, 0, 1) * Math.PI * 0.55; };
    return g;
  }

  /* --- textures / screens ------------------------------------------------ */
  function safeTex(name, args) {
    if (STV.Tex && typeof STV.Tex[name] === 'function') {
      try {
        var t2 = STV.Tex[name].apply(STV.Tex, args || []);
        if (t2) return t2;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  /* A guaranteed screen surface: prefers STV.Mat.screen, else builds its own. */
  function makeScreen(opts) {
    opts = opts || {};
    if (STV.Mat && typeof STV.Mat.screen === 'function') {
      try {
        var s = STV.Mat.screen(opts);
        if (s && s.mat && s.ctx) {
          if (typeof s.setDirty !== 'function') s.setDirty = function () { if (s.flush) s.flush(); };
          if (typeof s.mesh !== 'function') {
            s.mesh = function (w, h) { return new T.Mesh(planeGeo(w, h), s.mat); };
          }
          return s;
        }
      } catch (e) { /* fall through */ }
    }
    var w = opts.w || 256, h = opts.h || 192;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, w, h);
    var tex = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    var mat = new T.MeshBasicMaterial({ map: tex });
    screenCount++;
    var obj = {
      canvas: cv, ctx: ctx, tex: tex, mat: mat, _dirty: true,
      flush: function () { tex.needsUpdate = true; obj._dirty = false; },
      setDirty: function () { obj._dirty = true; },
      mesh: function (mw, mh) { return new T.Mesh(planeGeo(mw, mh), mat); }
    };
    return obj;
  }

  /* ==========================================================================
   * 2. PLACEMENT + COLLIDERS
   * ========================================================================*/

  function addCollider(level, cx, cy, cz, hx, hy, hz, tag) {
    var c = { type: 'box', c: V(cx, cy, cz), h: V(Math.abs(hx), Math.abs(hy), Math.abs(hz)) };
    if (tag) c.tag = tag;
    level.colliders.push(c);
    return c;
  }

  function bakeColliders(level, group, opts) {
    var ud = group.userData || {};
    var list = ud.colliders;
    var sc = (opts && opts.scale) ? opts.scale : 1;
    var yaw = group.rotation.y;
    var ca = Math.cos(yaw), sa = Math.sin(yaw);
    var px = group.position.x, py = group.position.y, pz = group.position.z;

    if ((!list || !list.length) && opts && opts.solid === true) {
      var s = ud.size ? ud.size : V(0.5, 0.5, 0.5);
      list = [{ type: 'box', c: V(0, s.y * 0.5, 0), h: V(s.x * 0.5, s.y * 0.5, s.z * 0.5) }];
    }
    if (!list || !list.length) return;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.c || !e.h) continue;
      var lx = e.c.x * sc, ly = e.c.y * sc, lz = e.c.z * sc;
      var wx = lx * ca + lz * sa;
      var wz = -lx * sa + lz * ca;
      var hx = Math.abs(e.h.x * sc * ca) + Math.abs(e.h.z * sc * sa);
      var hz = Math.abs(e.h.x * sc * sa) + Math.abs(e.h.z * sc * ca);
      addCollider(level, px + wx, py + ly, pz + wz, hx, e.h.y * sc, hz, group.userData.geoName);
    }
  }

  function budgetLights(level, group, allow) {
    var found = [];
    group.traverse(function (o) { if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight) found.push(o); });
    for (var i = 0; i < found.length; i++) {
      var L = found[i];
      if (allow === false || level.lights.length >= MAX_LIGHTS) {
        if (L.parent) L.parent.remove(L);
        continue;
      }
      L.castShadow = false;
      level.lights.push(L);
    }
  }

  function applyShadowFlags(level, group, opts) {
    var recv = !(opts && opts.receive === false);
    var cast = !!(opts && opts.cast) && STV.quality === 'high';
    group.traverse(function (o) {
      if (o.isMesh) { o.receiveShadow = recv; o.castShadow = cast; }
    });
  }

  /* THE placement helper. Everything in every level goes through here. */
  function addProp(level, group, x, y, z, yaw, opts) {
    if (!group) return null;
    opts = opts || {};
    var parent = opts.parent || level.root;
    group.position.set(x || 0, y || 0, z || 0);
    group.rotation.y = yaw || 0;
    if (opts.scale) group.scale.setScalar(opts.scale);
    if (opts.visible === false) group.visible = false;
    parent.add(group);
    budgetLights(level, group, opts.light);
    applyShadowFlags(level, group, opts);
    if (opts.solid !== false) bakeColliders(level, group, opts);
    if (opts.id) level.props[opts.id] = group;
    return group;
  }

  /* Convenience: create + place in one call. */
  function place(level, name, args, x, y, z, yaw, fbSize, opts) {
    var g = safeGeo(name, args, fbSize, opts);
    return addProp(level, g, x, y, z, yaw, opts);
  }

  /* ==========================================================================
   * 3. STRUCTURE BUILDERS (walls / floors / ceilings)
   * ========================================================================*/

  /* Wall along a line with optional openings.
   * openings: [{s, e, bottom, top}] measured in metres from (x1,z1). */
  function wallLine(level, x1, z1, x2, z2, h, opts) {
    opts = opts || {};
    var t = opts.t == null ? 0.16 : opts.t;
    var matName = opts.mat || 'drywall';
    var dx = x2 - x1, dz = z2 - z1;
    var L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.02) return;
    var ux = dx / L, uz = dz / L;
    var yaw = Math.atan2(-dz, dx);
    var baseY = opts.y || 0;

    function seg(s, e, y0, y1) {
      var w = e - s, hh = y1 - y0;
      if (w < 0.03 || hh < 0.03) return;
      var mid = s + w * 0.5;
      var cx = x1 + ux * mid, cz = z1 + uz * mid;
      var g = safeGeo('wall', [w, hh, { t: t, thickness: t, mat: matName, tex: matName, depth: t }],
        [w, hh, t], { mat: matName });
      addProp(level, g, cx, baseY + y0, cz, yaw, { solid: true, cast: !!opts.cast });
    }

    var ops = (opts.openings || []).slice().sort(function (a, b) { return a.s - b.s; });
    var cursor = 0;
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      var s = STV.clamp(o.s, 0, L), e = STV.clamp(o.e, 0, L);
      if (s > cursor) seg(cursor, s, 0, h);
      var bot = o.bottom || 0, top = o.top == null ? h : o.top;
      if (bot > 0.02) seg(s, e, 0, bot);
      if (top < h - 0.02) seg(s, e, top, h);
      cursor = Math.max(cursor, e);
    }
    if (cursor < L) seg(cursor, L, 0, h);
  }

  function floorSlab(level, cx, cz, w, d, matName, y, opts) {
    opts = opts || {};
    var g = safeGeo('floorSlab', [w, d, { mat: matName, tex: matName }], [w, 0.08, d], { mat: matName, solid: false });
    /* floorSlab sits at floor level; do not let it emit a body-blocking collider */
    if (g.userData) g.userData.colliders = [];
    addProp(level, g, cx, y || 0, cz, 0, { solid: false, receive: true, parent: opts.parent });
    return g;
  }

  function ceilingSlab(level, cx, cz, w, d, matName, y) {
    var g = safeGeo('ceilingSlab', [w, d, { mat: matName, tex: matName }], [w, 0.1, d], { mat: matName, solid: false });
    if (g.userData) g.userData.colliders = [];
    addProp(level, g, cx, y, cz, 0, { solid: false, receive: true });
    /* invisible ceiling collider so the player can never pop through */
    addCollider(level, cx, y + 0.3, cz, w * 0.5, 0.25, d * 0.5, 'ceiling');
    return g;
  }

  /* Rectangular room shell. sides: {n,s,e,w} each false to omit. */
  function roomShell(level, cfg) {
    var x0 = cfg.x0, x1 = cfg.x1, z0 = cfg.z0, z1 = cfg.z1, h = cfg.h || 2.9;
    var w = x1 - x0, d = z1 - z0;
    if (cfg.floor !== false) floorSlab(level, (x0 + x1) / 2, (z0 + z1) / 2, w, d, cfg.floorMat || 'concrete', cfg.y || 0);
    if (cfg.ceiling) ceilingSlab(level, (x0 + x1) / 2, (z0 + z1) / 2, w, d, cfg.ceilMat || 'ceiling', (cfg.y || 0) + h);
    var wm = cfg.wallMat || 'drywall';
    var op = cfg.openings || {};
    if (cfg.n !== false) wallLine(level, x0, z0, x1, z0, h, { mat: wm, openings: op.n, y: cfg.y, t: cfg.t });
    if (cfg.s !== false) wallLine(level, x0, z1, x1, z1, h, { mat: wm, openings: op.s, y: cfg.y, t: cfg.t });
    if (cfg.w !== false) wallLine(level, x0, z0, x0, z1, h, { mat: wm, openings: op.w, y: cfg.y, t: cfg.t });
    if (cfg.e !== false) wallLine(level, x1, z0, x1, z1, h, { mat: wm, openings: op.e, y: cfg.y, t: cfg.t });
  }

  /* A cheap unlit glow plane — this is how we fake most of the lighting. */
  function glowPanel(level, x, y, z, w, d, color, opacity, rotX) {
    var m = new T.Mesh(planeGeo(w, d), basic(color, opacity == null ? 0.55 : opacity, true));
    m.rotation.x = rotX == null ? Math.PI * 0.5 : rotX;
    m.position.set(x, y, z);
    m.renderOrder = 2;
    level.root.add(m);
    return m;
  }

  /* Registered so guards/cameras know how bright a spot is. */
  function addProbe(level, x, z, r, i) {
    level.probes.push({ x: x, z: z, r: r, i: i });
  }

  /* ==========================================================================
   * 4. GEOMETRY QUERIES (line of sight, distances)
   * ========================================================================*/

  /* segment vs AABB slab test — used for line of sight. */
  function segHitsBox(ax, ay, az, dx, dy, dz, c, h) {
    var tmin = 0, tmax = 1, t1, t2, tmp;
    /* X */
    if (Math.abs(dx) < 1e-8) { if (Math.abs(ax - c.x) > h.x) return false; }
    else {
      t1 = ((c.x - h.x) - ax) / dx; t2 = ((c.x + h.x) - ax) / dx;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    /* Y */
    if (Math.abs(dy) < 1e-8) { if (Math.abs(ay - c.y) > h.y) return false; }
    else {
      t1 = ((c.y - h.y) - ay) / dy; t2 = ((c.y + h.y) - ay) / dy;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    /* Z */
    if (Math.abs(dz) < 1e-8) { if (Math.abs(az - c.z) > h.z) return false; }
    else {
      t1 = ((c.z - h.z) - az) / dz; t2 = ((c.z + h.z) - az) / dz;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    return true;
  }

  /* true if something static blocks a->b. Ignores ceilings and floors. */
  function losBlocked(level, ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var cols = level.colliders;
    var lo = Math.min(ay, by), hi = Math.max(ay, by);
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      if (col.tag === 'ceiling' || col.noOcclude) continue;
      var c = col.c, h = col.h;
      if (c.y + h.y < lo - 0.02) continue;      /* entirely below the ray band */
      if (c.y - h.y > hi + 0.02) continue;      /* entirely above */
      if (segHitsBox(ax, ay, az, dx, dy, dz, c, h)) return true;
    }
    return false;
  }

  function flatDist(ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* ==========================================================================
   * 5. PLAYER ADAPTER — the Player module shape is not ours, so probe it.
   * ========================================================================*/

  var _pp = null;
  function playerPos(level, player) {
    if (!_pp) _pp = V();
    var o = null;
    if (player) {
      if (player.position && player.position.isVector3) o = player.position;
      else if (player.pos && player.pos.isVector3) o = player.pos;
      else if (player.object && player.object.position) o = player.object.position;
      else if (player.root && player.root.position) o = player.root.position;
    }
    if (o) { _pp.copy(o); if (_pp.y > 2.2) _pp.y -= EYE_STAND; return _pp; }
    var cam = level.ctx && level.ctx.camera;
    if (cam) { _pp.copy(cam.position); _pp.y = Math.max(0, _pp.y - EYE_STAND); return _pp; }
    _pp.set(0, 0, 0);
    return _pp;
  }
  function playerCrouch(player) {
    if (player && player.crouching != null) return !!player.crouching;
    if (player && player.crouch != null) return !!player.crouch;
    if (STV.UI && STV.UI.input) return !!STV.UI.input.crouch;
    return false;
  }
  function playerRunning(player) {
    if (player && player.running != null) return !!player.running;
    if (STV.UI && STV.UI.input) {
      var i = STV.UI.input;
      var moving = Math.abs(i.move.x) + Math.abs(i.move.y) > 0.25;
      return !!i.run && moving;
    }
    return false;
  }
  function playerMoving(player) {
    if (player && player.speed != null) return player.speed > 0.2;
    if (STV.UI && STV.UI.input) {
      var i = STV.UI.input;
      return Math.abs(i.move.x) + Math.abs(i.move.y) > 0.15;
    }
    return false;
  }
  function teleportPlayer(level, player, pos, yaw) {
    if (!pos) return;
    var done = false;
    if (player) {
      if (typeof player.teleport === 'function') { try { player.teleport(pos, yaw); done = true; } catch (e) {} }
      else if (typeof player.setPosition === 'function') { try { player.setPosition(pos, yaw); done = true; } catch (e) {} }
      if (!done) {
        var o = null;
        if (player.position && player.position.isVector3) o = player.position;
        else if (player.pos && player.pos.isVector3) o = player.pos;
        else if (player.object && player.object.position) o = player.object.position;
        else if (player.root && player.root.position) o = player.root.position;
        if (o) { o.set(pos.x, pos.y, pos.z); done = true; }
        if (player.velocity && player.velocity.set) player.velocity.set(0, 0, 0);
        if (yaw != null && player.yaw != null) player.yaw = yaw;
      }
    }
    if (!done && level.ctx && level.ctx.camera) {
      level.ctx.camera.position.set(pos.x, pos.y + EYE_STAND, pos.z);
    }
    STV.bus.emit('levels:teleport', { pos: pos, yaw: yaw });
  }

  /* ==========================================================================
   * 6. EVENT SUGAR
   * ========================================================================*/

  function say(who, text, ms, voice) {
    STV.bus.emit('dialogue:line', {
      speaker: who, text: text, ms: ms || Math.max(1800, text.length * 55), voice: voice || who.toLowerCase()
    });
  }
  function toast(text, icon, ms) { STV.bus.emit('toast', { text: text, icon: icon || '•', ms: ms || 2600 }); }
  function hint(text, ms) { STV.bus.emit('hint', { text: text, ms: ms || 4200 }); }
  function sfx(name, pos, vol) { STV.bus.emit('sfx', { name: name, pos: pos || null, vol: vol == null ? 1 : vol }); }
  function music(track, fade) { STV.bus.emit('music', { track: track, fade: fade == null ? 900 : fade }); }
  function objective(text, sub) { STV.bus.emit('objective:set', { text: text, sub: sub || '' }); }
  function objectiveDone(text) { STV.bus.emit('objective:done', { text: text }); }

  /* Guarded cutscene playback with a dialogue-only fallback. */
  function playCine(level, id, fallbackLines, onEnd) {
    if (STV.Cine && typeof STV.Cine.play === 'function' && (!STV.Cine.has || STV.Cine.has(id))) {
      var p = null;
      try {
        p = STV.Cine.play(id, {
          scene: level.ctx.scene, camera: level.ctx.camera, level: level, player: level._player
        });
      } catch (e) { p = null; }
      if (p && typeof p.then === 'function') { p.then(function () { if (onEnd) onEnd(); }); return; }
      if (p) { if (onEnd) onEnd(); return; }
    }
    /* fallback: play the lines on a timer so the beat still lands */
    var lines = fallbackLines || [];
    var i = 0, acc = 0;
    if (!lines.length) { if (onEnd) onEnd(); return; }
    level.addTimer(function step() {
      if (i >= lines.length) { STV.bus.emit('dialogue:end'); if (onEnd) onEnd(); return; }
      var L = lines[i++];
      say(L[0], L[1], L[2], L[3]);
      acc = (L[2] || Math.max(1900, L[1].length * 55)) / 1000;
      level.addTimer(step, acc);
    }, 0.35);
  }

  /* Minigame launcher that survives a missing UI module. */
  function openMinigame(level, id, opts, cb) {
    var fired = false, off = null;
    function finish(ok) {
      if (fired) return;
      fired = true;
      if (off) { off(); off = null; }
      sfx(ok ? 'success' : 'fail');
      if (cb) cb(!!ok);
    }
    off = STV.bus.on('minigame:result', function (p) {
      if (p && p.id === id) finish(p.success);
    });
    level._offs.push(off);
    STV.bus.emit('minigame:open', { id: id, opts: opts || {}, done: finish });
    if (!STV.UI || typeof STV.UI.minigame !== 'function') {
      /* nobody is listening — do not soft-lock the game */
      level.addTimer(function () { finish(true); }, 0.6);
    }
  }

  /* ==========================================================================
   * 7. INTERACTABLES
   * ========================================================================*/

  function addInteract(level, cfg) {
    var it = {
      obj: cfg.obj,
      label: cfg.label || 'Examine',
      key: cfg.key || 'e',
      radius: cfg.radius == null ? 2.2 : cfg.radius,
      enabled: cfg.enabled !== false,
      once: !!cfg.once,
      used: false,
      id: cfg.id || null,
      hint: cfg.hint || null,
      onUse: function (player, lv) {
        if (!it.enabled) return;
        if (it.once && it.used) return;
        it.used = true;
        if (cfg.sfx) sfx(cfg.sfx);
        if (cfg.onUse) cfg.onUse(player, lv, it);
        if (it.once) it.enabled = false;
      },
      onFocus: function (on) {
        if (cfg.onFocus) cfg.onFocus(on, it);
        if (on && it.hint) hint(it.hint, 2600);
      }
    };
    if (!it.obj) {
      /* proxy so the player has something to raycast */
      var p = new T.Mesh(boxGeo(0.4, 0.4, 0.4), basic(0xffffff, 0.001));
      p.visible = false;
      if (cfg.at) p.position.set(cfg.at[0], cfg.at[1], cfg.at[2]);
      level.root.add(p);
      it.obj = p;
    }
    it.obj.userData.interact = { label: it.label, key: it.key };
    it.obj.userData.interactable = it;
    level.interactables.push(it);
    return it;
  }

  /* ==========================================================================
   * 8. ALERT SYSTEM
   * ========================================================================*/

  function makeAlert(level) {
    var A = {
      level: 0,
      calmT: 0,
      floor: 0,          /* escape sets a permanent minimum */
      lastPos: V(),
      busy: false,
      raise: function (to, pos, by) {
        if (pos) A.lastPos.copy(pos);
        to = STV.clamp(Math.round(to), 0, 3);
        if (to <= A.level) { A.calmT = 0; return; }
        A.level = to;
        A.calmT = 0;
        STV.bus.emit('alarm', { level: A.level });
        if (A.level === 1) {
          sfx('alarmSoft');
          if (!level.noMusicSwitch) music('infiltrate', 600);
          if (!level._hintedAlert) {
            level._hintedAlert = true;
            hint('Someone heard something. Break line of sight and wait it out.', 5000);
          }
        } else if (A.level === 2) {
          sfx('detected');
          if (!level.noMusicSwitch) music('alert', 0);
          STV.bus.emit('player:detected', { by: by || 'guard' });
        } else if (A.level === 3) {
          sfx('alarmKlaxon');
          if (!level.noMusicSwitch) music('alert', 0);
          STV.bus.emit('player:detected', { by: by || 'guard' });
          A.fail();
        }
      },
      /* alarm 3 -> checkpoint, never a game over */
      fail: function () {
        if (A.busy) return;
        A.busy = true;
        var line = CAUGHT_LINES[level._caughtIdx % CAUGHT_LINES.length];
        level._caughtIdx++;
        level.addTimer(function () {
          say('Steve', line, 2600, 'steve');
          level.respawnAtCheckpoint();
          A.level = A.floor;
          A.calmT = 0;
          A.busy = false;
          STV.bus.emit('alarm', { level: A.level });
          for (var i = 0; i < level.actors.length; i++) {
            if (level.actors[i].reset) level.actors[i].reset();
          }
          if (!level.noMusicSwitch) music(level.env.music || 'infiltrate', 900);
        }, 1.35);
      },
      decay: function (dt, anyStimulus) {
        if (A.level <= A.floor || A.busy) return;
        if (anyStimulus) { A.calmT = 0; return; }
        A.calmT += dt;
        var need = A.level >= 2 ? 16 : 9;
        if (A.calmT > need) {
          A.level--;
          A.calmT = 0;
          STV.bus.emit('alarm', { level: A.level });
          if (A.level === 0) {
            sfx('stealthEnter');
            if (!level.noMusicSwitch) music(level.env.music || 'infiltrate', 1400);
          }
        }
      },
      reset: function () { A.level = A.floor; A.calmT = 0; STV.bus.emit('alarm', { level: A.level }); }
    };
    return A;
  }

  /* ==========================================================================
   * 9. STATE INDICATOR (the above-head readout — legibility first)
   * ========================================================================*/

  function makeIndicator() {
    var g = new T.Group();
    var back = new T.Mesh(planeGeo(0.56, 0.1), basic(0x05070a, 0.72));
    g.add(back);
    var fill = new T.Mesh(planeGeo(0.52, 0.06), basic(0xffffff, 0.95, true));
    fill.position.z = 0.002;
    g.add(fill);
    var pip = new T.Mesh(coneGeo(0.055, 0.11, 4), basic(0xffffff, 0.9, true));
    pip.position.y = 0.15;
    pip.rotation.y = Math.PI * 0.25;
    g.add(pip);
    g.renderOrder = 6;
    g.traverse(function (o) { if (o.material) { o.material.depthTest = true; } });

    g.set = function (t, state) {
      t = STV.clamp(t, 0, 1);
      fill.scale.x = Math.max(0.001, t);
      fill.position.x = -0.26 * (1 - t);
      var col;
      if (state === 'chase' || state === 'alarm') col = 0xff3b30;
      else if (state === 'search') col = 0xf0a24b;
      else if (state === 'suspicious') col = 0xffd479;
      else col = 0x5fd3ff;
      fill.material = basic(col, 0.95, true);
      pip.material = basic(col, 0.9, true);
      pip.visible = state !== 'patrol' && state !== 'idle';
      back.visible = t > 0.02 || pip.visible;
      fill.visible = t > 0.02;
      pip.rotation.z = state === 'chase' ? Math.PI : 0;
    };
    g.faceCamera = function (cam) {
      if (!cam) return;
      g.quaternion.copy(cam.quaternion);
    };
    g.set(0, 'patrol');
    return g;
  }

  /* ==========================================================================
   * 10. GUARD ACTOR
   * ========================================================================*/

  function makeGuard(level, cfg) {
    var rng = level.rng;
    var body = safeGeo('human', [{
      height: cfg.height || 1.8, build: cfg.build || 'avg', skin: cfg.skin || 'mid',
      hair: { style: cfg.hairStyle || 'buzz', color: cfg.hairColor == null ? 0x2e2823 : cfg.hairColor },
      outfit: cfg.outfit || 'guard', seed: cfg.seed || 4242
    }], [0.5, cfg.height || 1.8, 0.32], { kind: 'human', mat: 'clothNavy' });
    ensureHuman(body);

    var g = new T.Group();
    g.add(body);
    var ind = makeIndicator();
    ind.position.y = (cfg.height || 1.8) + 0.34;
    g.add(ind);

    /* floor vision fan — the single most legible thing in the level */
    var fanAng = (cfg.fov || 75) * DEG;
    var fan = new T.Mesh(fanGeo(fanAng, 20), basic(0x5fd3ff, 0.09, true));
    fan.position.y = 0.03;
    fan.scale.setScalar(cfg.range || 12);
    fan.renderOrder = 1;
    g.add(fan);

    var wps = [];
    for (var i = 0; i < (cfg.waypoints || []).length; i++) {
      var w = cfg.waypoints[i];
      wps.push({ p: V(w[0], 0, w[1]), wait: w[2] == null ? 1.2 : w[2], look: w[3] });
    }

    var A = {
      type: 'guard',
      name: cfg.name || 'Guard',
      obj: g,
      body: body,
      indicator: ind,
      fan: fan,
      home: wps.length ? wps[0].p.clone() : V(cfg.x || 0, 0, cfg.z || 0),
      pos: wps.length ? wps[0].p.clone() : V(cfg.x || 0, 0, cfg.z || 0),
      yaw: cfg.yaw || 0,
      targetYaw: cfg.yaw || 0,
      wps: wps, wi: 0, waitT: 0,
      speed: cfg.speed || 1.25,
      chaseSpeed: cfg.chaseSpeed || 2.35,
      range: cfg.range || 12,
      halfFov: fanAng * 0.5,
      hearBase: cfg.hear || 4.5,
      state: 'patrol',
      susp: 0,
      seeing: false,
      stateT: 0,
      losT: 0,
      lastKnown: V(),
      hasLK: false,
      searchPt: V(),
      searchT: 0,
      stepT: 0,
      talkT: STV.randRange(rng, 4, 20),
      disabled: false
    };

    A.setState = function (s) {
      if (A.state === s) return;
      A.state = s;
      A.stateT = 0;
      if (s === 'suspicious') sfx('clickSoft', A.pos, 0.5);
    };

    A.hear = function (pos, loud) {
      if (A.disabled) return;
      var d = flatDist(A.pos.x, A.pos.z, pos.x, pos.z);
      var r = A.hearBase + loud;
      if (d > r) return;
      /* walls muffle: a blocked path halves the effective radius */
      if (losBlocked(level, A.pos.x, 1.5, A.pos.z, pos.x, 1.2, pos.z) && d > r * 0.5) return;
      A.lastKnown.copy(pos); A.hasLK = true;
      if (A.state === 'patrol') {
        A.setState('suspicious');
        A.susp = Math.max(A.susp, 0.42);
        level.alert.raise(Math.max(1, level.alert.level), pos, A.name);
      } else if (A.state === 'suspicious') {
        A.setState('search');
        A.susp = Math.max(A.susp, 0.6);
      }
    };

    A.reset = function () {
      A.setState('patrol');
      A.susp = 0; A.hasLK = false; A.seeing = false;
      A.wi = 0; A.waitT = 0;
      A.pos.copy(A.home);
      A.disabled = false;
    };

    A.forward = function (out) {
      out.set(Math.sin(A.yaw), 0, Math.cos(A.yaw));
      return out;
    };

    var fwd = V(), tmp = V();

    A.canSee = function (ppos, crouch) {
      var d = flatDist(A.pos.x, A.pos.z, ppos.x, ppos.z);
      var range = A.range * level.detectMul(ppos, crouch);
      if (level.alert.level >= 2) range *= 1.25;
      if (d > range) return 0;
      if (d < 1.4) return 1;                       /* right in front of his face */
      A.forward(fwd);
      tmp.set(ppos.x - A.pos.x, 0, ppos.z - A.pos.z).normalize();
      var dot = fwd.x * tmp.x + fwd.z * tmp.z;
      var ang = Math.acos(STV.clamp(dot, -1, 1));
      if (ang > A.halfFov) return 0;
      var eyeY = crouch ? EYE_CROUCH : EYE_STAND;
      if (losBlocked(level, A.pos.x, EYE_STAND, A.pos.z, ppos.x, eyeY, ppos.z)) return 0;
      var byDist = 1 - STV.smoothstep(range * 0.45, range, d) * 0.75;
      var byAng = 1 - STV.smoothstep(A.halfFov * 0.35, A.halfFov, ang) * 0.55;
      return STV.clamp(byDist * byAng, 0.08, 1);
    };

    A.update = function (dt, lv, player) {
      var ppos = playerPos(lv, player);
      var crouch = playerCrouch(player);

      /* --- perception (staggered for cost) --- */
      A.losT -= dt;
      if (A.losT <= 0 && !A.disabled && !lv.stealthOff) {
        A.losT = 0.08;
        var vis = A.canSee(ppos, crouch);
        A.seeing = vis > 0;
        if (vis > 0) {
          A.lastKnown.set(ppos.x, 0, ppos.z);
          A.hasLK = true;
          A.susp += 0.09 * (0.5 + vis * 1.35) * (A.state === 'patrol' ? 1 : 1.6);
        } else {
          A.susp -= 0.09 * 0.42;
        }
        A.susp = STV.clamp(A.susp, 0, 1);
      }

      /* --- state machine --- */
      A.stateT += dt;
      if (A.state === 'patrol') {
        if (A.susp > 0.28) A.setState('suspicious');
      } else if (A.state === 'suspicious') {
        if (A.susp >= 1) {
          A.setState('chase');
          lv.alert.raise(Math.max(2, lv.alert.level + 1), A.lastKnown, A.name);
          sayGuard(A);
        } else if (A.susp < 0.05 && A.stateT > 1.5) {
          A.setState('patrol');
        } else if (A.stateT > 4.5 && A.hasLK) {
          A.setState('search');
        }
      } else if (A.state === 'search') {
        if (A.susp >= 1) {
          A.setState('chase');
          lv.alert.raise(Math.max(2, lv.alert.level + 1), A.lastKnown, A.name);
          sayGuard(A);
        } else if (A.stateT > 18) {
          A.setState('patrol'); A.hasLK = false;
        }
      } else if (A.state === 'chase') {
        if (!A.seeing && A.stateT > 7) { A.setState('search'); }
        if (A.seeing && A.stateT > 2.2) {
          /* sustained contact escalates one more step, then the checkpoint */
          A.stateT = 0;
          lv.alert.raise(lv.alert.level + 1, A.lastKnown, A.name);
        }
      }

      /* --- movement --- */
      var moveTo = null, sp = A.speed;
      if (A.state === 'patrol') {
        if (A.wps.length) {
          var wp = A.wps[A.wi];
          if (flatDist(A.pos.x, A.pos.z, wp.p.x, wp.p.z) < 0.4) {
            A.waitT += dt;
            if (wp.look != null) A.targetYaw = wp.look;
            if (A.waitT > wp.wait) { A.waitT = 0; A.wi = (A.wi + 1) % A.wps.length; }
          } else {
            moveTo = wp.p;
          }
        }
      } else if (A.state === 'suspicious') {
        if (A.hasLK) {
          A.targetYaw = Math.atan2(A.lastKnown.x - A.pos.x, A.lastKnown.z - A.pos.z);
        }
      } else if (A.state === 'search') {
        sp = A.speed * 1.35;
        if (flatDist(A.pos.x, A.pos.z, A.searchPt.x, A.searchPt.z) < 0.5 || A.searchT <= 0) {
          A.searchT = STV.randRange(level.rng, 2.2, 4.0);
          var base = A.hasLK ? A.lastKnown : A.home;
          var a = STV.randRange(level.rng, 0, Math.PI * 2);
          var rr = STV.randRange(level.rng, 1.5, 5.5);
          A.searchPt.set(base.x + Math.cos(a) * rr, 0, base.z + Math.sin(a) * rr);
        }
        A.searchT -= dt;
        moveTo = A.searchPt;
      } else if (A.state === 'chase') {
        sp = A.chaseSpeed;
        moveTo = A.hasLK ? A.lastKnown : A.home;
      }

      var moving = false;
      if (moveTo && !A.disabled) {
        var dx = moveTo.x - A.pos.x, dz = moveTo.z - A.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.12) {
          var step = Math.min(d, sp * dt);
          var nx = A.pos.x + (dx / d) * step, nz = A.pos.z + (dz / d) * step;
          if (!lv.blockedAt(nx, nz, 0.34)) { A.pos.x = nx; A.pos.z = nz; moving = true; }
          else if (!lv.blockedAt(A.pos.x + (dx / d) * step, A.pos.z, 0.34)) { A.pos.x += (dx / d) * step; moving = true; }
          else if (!lv.blockedAt(A.pos.x, A.pos.z + (dz / d) * step, 0.34)) { A.pos.z += (dz / d) * step; moving = true; }
          A.targetYaw = Math.atan2(dx, dz);
        }
      }
      if (A.disabled) moving = false;

      A.yaw = STV.dampAngle(A.yaw, A.targetYaw, 6, dt);
      g.position.set(A.pos.x, 0, A.pos.z);
      g.rotation.y = HUMAN_FACING > 0 ? A.yaw : A.yaw + Math.PI;

      /* footsteps */
      if (moving) {
        A.stepT -= dt * (sp / 1.3);
        if (A.stepT <= 0) { A.stepT = 0.52; sfx(lv.env.footstep === 'carpet' ? 'footstepCarpet' : 'footstepTile', A.pos, 0.35); }
      }

      /* bored radio chatter */
      A.talkT -= dt;
      if (A.talkT <= 0) {
        A.talkT = STV.randRange(level.rng, 14, 34);
        if (A.state === 'patrol' && lv.alert.level === 0) sfx('radioChatter', A.pos, 0.35);
      }

      /* --- readouts --- */
      body.update(dt, { speed: moving ? sp : 0, talking: false, look: null });
      if (typeof body.setPose === 'function' && A._pose !== (moving ? 'walk' : 'idle')) {
        A._pose = moving ? 'walk' : 'idle';
        body.setPose(A._pose);
      }
      ind.set(A.susp, A.state);
      ind.faceCamera(lv.ctx.camera);

      var fanCol, fanOp;
      if (A.state === 'chase') { fanCol = 0xff3b30; fanOp = 0.26; }
      else if (A.state === 'search') { fanCol = 0xf0a24b; fanOp = 0.2; }
      else if (A.state === 'suspicious') { fanCol = 0xffd479; fanOp = 0.16; }
      else { fanCol = 0x5fd3ff; fanOp = 0.085; }
      if (A._fanCol !== fanCol) { A._fanCol = fanCol; fan.material = basic(fanCol, fanOp, true); }
      fan.visible = !A.disabled && !lv.stealthOff && lv.showCones !== false;
      var rangeNow = A.range * lv.detectMul(ppos, crouch);
      fan.scale.setScalar(STV.damp(fan.scale.x, rangeNow, 4, dt));
    };

    addProp(level, g, A.pos.x, 0, A.pos.z, 0, { solid: false, id: cfg.id });
    level.actors.push(A);
    return A;
  }

  var GUARD_BARKS = [
    ['petr', 'Hey! Stop there!'],
    ['petr', 'Who is that? Show yourself.'],
    ['petr', 'Control, I have movement on two.'],
    ['petr', 'You are not supposed to be down here.']
  ];
  var _barkIdx = 0;
  function sayGuard(A) {
    var b = GUARD_BARKS[_barkIdx % GUARD_BARKS.length];
    _barkIdx++;
    say(A.name || 'Guard', b[1], 2000, b[0]);
  }

  /* ==========================================================================
   * 11. CAMERA ACTOR
   * ========================================================================*/

  function makeCameraActor(level, cfg) {
    var g = safeGeo('securityCamera', [], [0.34, 0.22, 0.5], { solid: false });
    var head = g.head || g;
    var cone = g.cone || null;
    if (!cone) {
      cone = new T.Mesh(coneGeo(1, 1, 14), basic(0x5fd3ff, 0.11, true));
      cone.rotation.x = Math.PI * 0.5;
      cone.geometry = coneGeo(1, 1, 14);
      cone.position.z = 0.5;
      cone.scale.set(1, 1, 1);
      head.add(cone);
    }
    var range = cfg.range || 11;
    var halfFov = (cfg.fov || 44) * DEG * 0.5;
    /* scale the cone so it reads as the real detection volume */
    var rad = Math.tan(halfFov) * range;
    cone.scale.set(rad, range, rad);
    cone.position.set(0, 0, 0);
    cone.rotation.set(Math.PI * 0.5, 0, 0);
    cone.position.z = range * 0.5;
    cone.renderOrder = 1;

    var A = {
      type: 'camera',
      name: cfg.name || 'Camera',
      obj: g, head: head, cone: cone,
      pos: V(cfg.x, cfg.y == null ? 2.6 : cfg.y, cfg.z),
      base: cfg.yaw || 0,
      swing: cfg.swing == null ? 0.7 : cfg.swing,
      period: cfg.period || 9,
      phase: cfg.phase || 0,
      range: range, halfFov: halfFov,
      acquire: 0, ackNeed: 1.2,
      state: 'idle',
      disabled: false, disableT: 0,
      t: 0
    };

    A.reset = function () { A.acquire = 0; A.state = 'idle'; };
    A.disableFor = function (s) {
      A.disabled = true; A.disableT = s; A.acquire = 0; A.state = 'off';
      sfx('powerDown', A.pos, 0.5);
    };

    var tmp2 = V(), fwd2 = V();

    A.update = function (dt, lv, player) {
      A.t += dt;
      if (A.disabled) {
        A.disableT -= dt;
        cone.visible = false;
        if (A.disableT <= 0) { A.disabled = false; A.state = 'idle'; sfx('relayClack', A.pos, 0.4); }
        return;
      }
      cone.visible = lv.showCones !== false && !lv.stealthOff;

      var yaw = A.base + Math.sin((A.t + A.phase) * (Math.PI * 2 / A.period)) * A.swing;
      head.rotation.y = yaw - (A.obj === head ? 0 : 0);
      if (A.obj !== head) A.obj.rotation.y = A.base * 0 + 0;
      A.obj.rotation.y = 0;
      head.rotation.y = yaw;
      if (Math.abs(Math.cos((A.t + A.phase) * (Math.PI * 2 / A.period))) > 0.985) sfx('cameraServo', A.pos, 0.22);

      var ppos = playerPos(lv, player);
      var crouch = playerCrouch(player);
      var d = flatDist(A.pos.x, A.pos.z, ppos.x, ppos.z);
      var range = A.range * lv.detectMul(ppos, crouch);
      var seen = false;
      if (d < range) {
        fwd2.set(Math.sin(yaw + A.worldYaw), 0, Math.cos(yaw + A.worldYaw));
        tmp2.set(ppos.x - A.pos.x, 0, ppos.z - A.pos.z).normalize();
        var dot = fwd2.x * tmp2.x + fwd2.z * tmp2.z;
        if (Math.acos(STV.clamp(dot, -1, 1)) < A.halfFov) {
          var eyeY = crouch ? EYE_CROUCH : EYE_STAND;
          if (!losBlocked(lv, A.pos.x, A.pos.y, A.pos.z, ppos.x, eyeY, ppos.z)) seen = true;
        }
      }

      if (seen) {
        A.acquire += dt;
        A.state = A.acquire >= A.ackNeed ? 'locked' : 'acquiring';
        if (A.state === 'acquiring' && !lv._hintedCam) {
          lv._hintedCam = true;
          hint('The camera needs a moment to be sure. Move before it turns red.', 4200);
        }
      } else {
        A.acquire = Math.max(0, A.acquire - dt * 0.9);
        if (A.state === 'locked' && A.acquire < 0.2) A.state = 'idle';
        else if (A.acquire <= 0.01) A.state = 'idle';
      }

      if (A.state === 'locked' && !A._fired) {
        A._fired = true;
        STV.bus.emit('player:detected', { by: 'camera' });
        lv.alert.raise(Math.max(2, lv.alert.level + 1), ppos, 'camera');
        lv.noise(ppos, 14, 'camera');
        sfx('detected');
      }
      if (A.state !== 'locked') A._fired = false;

      var col, op;
      if (A.state === 'locked') { col = 0xff3b30; op = 0.3; }
      else if (A.state === 'acquiring') { col = 0xf0a24b; op = 0.22; }
      else { col = 0x5fd3ff; op = 0.1; }
      if (A._col !== col) { A._col = col; cone.material = basic(col, op, true); }
    };

    A.worldYaw = cfg.yaw || 0;
    A.base = 0;
    addProp(level, g, cfg.x, A.pos.y, cfg.z, cfg.yaw || 0, { solid: false, id: cfg.id });
    /* the group carries world yaw; the head swings locally */
    level.actors.push(A);
    return A;
  }

  /* ==========================================================================
   * 12. AMBIENT / SCRIPTED ACTORS (non-threatening life)
   * ========================================================================*/

  function makeWalker(level, cfg) {
    var body = safeGeo('human', [{
      height: cfg.height || 1.74, build: cfg.build || 'avg', skin: cfg.skin || 'light',
      hair: { style: cfg.hairStyle || 'short', color: cfg.hairColor == null ? 0x3a2f28 : cfg.hairColor },
      outfit: cfg.outfit || 'traveller', seed: cfg.seed || 99
    }], [0.48, cfg.height || 1.74, 0.3], { kind: 'human' });
    ensureHuman(body);
    var g = new T.Group();
    g.add(body);
    var wps = [];
    for (var i = 0; i < (cfg.waypoints || []).length; i++) {
      wps.push({ p: V(cfg.waypoints[i][0], 0, cfg.waypoints[i][1]), wait: cfg.waypoints[i][2] || 1 });
    }
    var A = {
      type: 'walker', name: cfg.name || 'person', obj: g, body: body,
      pos: wps.length ? wps[0].p.clone() : V(cfg.x, 0, cfg.z),
      yaw: cfg.yaw || 0, targetYaw: cfg.yaw || 0,
      wps: wps, wi: 0, waitT: 0, speed: cfg.speed || 0.85,
      update: function (dt, lv) {
        var moving = false;
        if (A.wps.length) {
          var wp = A.wps[A.wi];
          var dx = wp.p.x - A.pos.x, dz = wp.p.z - A.pos.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          if (d < 0.3) {
            A.waitT += dt;
            if (A.waitT > wp.wait) { A.waitT = 0; A.wi = (A.wi + 1) % A.wps.length; }
          } else {
            var st = Math.min(d, A.speed * dt);
            A.pos.x += (dx / d) * st; A.pos.z += (dz / d) * st;
            A.targetYaw = Math.atan2(dx, dz);
            moving = true;
          }
        }
        A.yaw = STV.dampAngle(A.yaw, A.targetYaw, 5, dt);
        g.position.set(A.pos.x, 0, A.pos.z);
        g.rotation.y = HUMAN_FACING > 0 ? A.yaw : A.yaw + Math.PI;
        if (A._pose !== (moving ? 'walk' : (cfg.pose || 'idle'))) {
          A._pose = moving ? 'walk' : (cfg.pose || 'idle');
          body.setPose(A._pose);
        }
        body.update(dt, { speed: moving ? A.speed : 0, talking: false, look: null });
      },
      reset: function () {}
    };
    addProp(level, g, A.pos.x, 0, A.pos.z, 0, { solid: false, id: cfg.id });
    level.actors.push(A);
    return A;
  }

  /*__APPEND__*/

  STV.log('levels loaded');
})();

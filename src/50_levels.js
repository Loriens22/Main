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

  /* ==========================================================================
   * 13. LEVEL CORE — the object every builder starts from
   * ========================================================================*/

  function addLight(lv, L, wantShadow) {
    if (!L) return null;
    if (lv.lights.length >= MAX_LIGHTS) { return null; }
    L.castShadow = !!wantShadow && STV.quality === 'high' && lv._shadowCount < 2;
    if (L.castShadow) {
      lv._shadowCount++;
      if (L.shadow) {
        L.shadow.mapSize.width = 1024;
        L.shadow.mapSize.height = 1024;
        L.shadow.bias = -0.0016;
        if (L.shadow.camera) { L.shadow.camera.near = 0.4; L.shadow.camera.far = 34; }
      }
    }
    lv.root.add(L);
    lv.lights.push(L);
    return L;
  }

  function ambientPair(lv, skyCol, groundCol, intensity) {
    var h = new T.HemisphereLight(skyCol, groundCol, intensity == null ? 0.8 : intensity);
    lv.root.add(h);
    lv.hemi = h;
    return h;
  }

  /* Ground plane collider — every level needs one or the player falls forever. */
  function groundBox(lv, cx, cz, w, d, y) {
    addCollider(lv, cx, (y || 0) - 0.25, cz, w * 0.5, 0.25, d * 0.5, 'floor');
  }

  /* Slow-drifting dust / rain motes. One draw call, no lights, big mood. */
  function addMotes(lv, cfg) {
    var n = STV.quality === 'low' ? Math.round((cfg.count || 90) * 0.45) : (cfg.count || 90);
    var pos = new Float32Array(n * 3);
    var seedR = STV.rng(cfg.seed || 7788);
    var i;
    for (i = 0; i < n; i++) {
      pos[i * 3] = cfg.x + STV.randRange(seedR, -1, 1) * cfg.w * 0.5;
      pos[i * 3 + 1] = cfg.y + STV.randRange(seedR, 0, 1) * cfg.h;
      pos[i * 3 + 2] = cfg.z + STV.randRange(seedR, -1, 1) * cfg.d * 0.5;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m = STV.memo(matCache, 'mote|' + (cfg.color || 0xffe9c9) + '|' + (cfg.size || 0.02) + '|' + (cfg.opacity || 0.5), function () {
      var mm = new T.PointsMaterial({
        color: cfg.color || 0xffe9c9, size: cfg.size || 0.022,
        transparent: true, opacity: cfg.opacity == null ? 0.5 : cfg.opacity,
        depthWrite: false, sizeAttenuation: true
      });
      mm.userData.shared = true;
      return mm;
    });
    var pts = new T.Points(g, m);
    pts.frustumCulled = false;
    lv.root.add(pts);
    var fall = cfg.fall || 0.045;
    var swayA = cfg.sway == null ? 0.08 : cfg.sway;
    var t0 = 0;
    lv.addUpdater(function (dt) {
      t0 += dt;
      var arr = g.attributes.position.array;
      for (var k = 0; k < n; k++) {
        var j = k * 3;
        arr[j + 1] -= fall * dt;
        arr[j] += Math.sin(t0 * 0.6 + k) * swayA * dt;
        if (arr[j + 1] < cfg.y) arr[j + 1] = cfg.y + cfg.h;
      }
      g.attributes.position.needsUpdate = true;
    });
    return pts;
  }

  /* Ceiling strip light: emissive plane + probe + (budgeted) point light. */
  function stripLight(lv, x, y, z, len, yaw, cfg) {
    cfg = cfg || {};
    var col = cfg.color == null ? 0xfff2d8 : cfg.color;
    var g = safeGeo('fluorescentTube', [len], [len, 0.09, 0.16], { mat: 'emissiveWhite', solid: false });
    if (g.userData) g.userData.colliders = [];
    addProp(lv, g, x, y, z, yaw || 0, { solid: false, light: false });
    var pl = new T.Mesh(planeGeo(len * 0.94, 0.2), basic(col, cfg.glow == null ? 0.5 : cfg.glow, true));
    pl.rotation.x = Math.PI * 0.5;
    pl.rotation.z = yaw || 0;
    pl.position.set(x, y - 0.03, z);
    pl.renderOrder = 2;
    lv.root.add(pl);
    addProbe(lv, x, z, cfg.probe == null ? 4.2 : cfg.probe, cfg.probeI == null ? 0.75 : cfg.probeI);
    if (cfg.real) {
      var L = new T.PointLight(col, cfg.intensity == null ? 1.1 : cfg.intensity, cfg.dist == null ? 11 : cfg.dist, 1.7);
      L.position.set(x, y - 0.15, z);
      addLight(lv, L, cfg.shadow);
    }
    return g;
  }

  /* An emissive quad on the floor — "there is light here" without a light. */
  function pool(lv, x, z, r, color, opacity, y) {
    var m = new T.Mesh(planeGeo(r * 2, r * 2), basic(color == null ? 0xffe9c9 : color, opacity == null ? 0.14 : opacity, true));
    m.rotation.x = -Math.PI * 0.5;
    m.position.set(x, (y == null ? 0.012 : y), z);
    m.renderOrder = 1;
    lv.root.add(m);
    return m;
  }

  function makeLevel(id, ctx, cfg) {
    cfg = cfg || {};
    var lv = {};

    lv.id = id;
    lv.ctx = ctx || {};
    lv.root = new T.Group();
    lv.root.name = 'lvl_' + id;
    lv.rng = STV.rng(cfg.seed == null ? 0x51E7E : cfg.seed);
    lv.spawn = { pos: V(0, 0, 0), yaw: 0 };
    lv.bounds = new T.Box3(V(-70, -3, -70), V(70, 24, 70));

    lv.lights = [];
    lv.colliders = [];
    lv.interactables = [];
    lv.actors = [];
    lv.props = {};
    lv.probes = [];
    lv.screens = [];

    lv.env = {
      fog: null, sky: 0x05070a, ambient: 0.8, exposure: 1.0,
      footstep: 'concrete', ambience: null, music: null, baseLight: 0.3
    };

    lv.time = 0;
    lv.phase = null;
    lv._timers = [];
    lv._offs = [];
    lv._updaters = [];
    lv._keyHandlers = [];
    lv._caughtIdx = 0;
    lv._shadowCount = 0;
    lv._player = null;
    lv._done = false;
    lv._noiseT = 0;
    lv.showCones = true;
    lv.stealthOff = true;              /* levels with guards flip this off */
    lv.noMusicSwitch = false;
    lv.checkpoint = { pos: V(0, 0, 0), yaw: 0 };
    lv.alert = makeAlert(lv);

    /* ---- scheduling ---- */
    lv.addTimer = function (fn, delay) {
      var t = { fn: fn, d: delay == null ? 0 : delay };
      lv._timers.push(t);
      return t;
    };
    lv.addUpdater = function (fn) { lv._updaters.push(fn); return fn; };
    lv.on = function (evt, fn) { var o = STV.bus.on(evt, fn); lv._offs.push(o); return o; };

    /* ---- lighting queries ---- */
    lv.lightAt = function (x, z) {
      var l = lv.env.baseLight || 0;
      for (var i = 0; i < lv.probes.length; i++) {
        var p = lv.probes[i];
        var d = flatDist(x, z, p.x, p.z);
        if (d < p.r) l += p.i * (1 - d / p.r);
      }
      return STV.clamp(l, 0, 1.8);
    };

    /* The single fairness knob: how easy is the player to see right now. */
    lv.detectMul = function (ppos, crouch) {
      var lit = lv.lightAt(ppos.x, ppos.z);
      var dark = lit < 0.34;
      var m = 1;
      if (crouch) m *= dark ? 0.5 : 0.74;
      else m *= dark ? 0.84 : 1;
      if (playerRunning(lv._player)) m *= 1.2;
      if (lv.alert.level >= 2) m *= 1.1;
      return STV.clamp(m, 0.34, 1.5);
    };

    /* ---- world queries ---- */
    lv.blockedAt = function (x, z, r) {
      var ph = lv.ctx.physics;
      if (ph && typeof ph.isFree === 'function') return !ph.isFree(x, 0.15, z, r || 0.34, 1.5);
      for (var i = 0; i < lv.colliders.length; i++) {
        var c = lv.colliders[i];
        if (c.tag === 'floor' || c.tag === 'ceiling') continue;
        if (c.c.y + c.h.y < 0.3) continue;
        if (Math.abs(x - c.c.x) < c.h.x + (r || 0.34) && Math.abs(z - c.c.z) < c.h.z + (r || 0.34)) return true;
      }
      return false;
    };

    /* ---- noise propagation ---- */
    lv.noise = function (pos, loud, tag) {
      for (var i = 0; i < lv.actors.length; i++) {
        var a = lv.actors[i];
        if (a && a.hear) { try { a.hear(pos, loud || 0, tag); } catch (e) {} }
      }
    };

    /* ---- checkpoints ---- */
    lv.setCheckpoint = function (x, y, z, yaw, quiet) {
      lv.checkpoint.pos.set(x, y || 0, z);
      lv.checkpoint.yaw = yaw || 0;
      STV.bus.emit('checkpoint', { pos: lv.checkpoint.pos.clone(), yaw: lv.checkpoint.yaw, silent: !!quiet });
    };
    lv.respawnAtCheckpoint = function () {
      teleportPlayer(lv, lv._player, lv.checkpoint.pos, lv.checkpoint.yaw);
    };
    lv.onRespawn = function () {
      for (var i = 0; i < lv.actors.length; i++) if (lv.actors[i].reset) lv.actors[i].reset();
      lv.alert.level = lv.alert.floor;
      lv.alert.calmT = 0;
    };

    /* ---- completion ---- */
    lv.complete = function (delay) {
      if (lv._done) return;
      lv._done = true;
      sfx('stinger');
      lv.addTimer(function () {
        STV.bus.emit('level:complete', { id: lv.id });
      }, delay == null ? 1.1 : delay);
    };

    /* ---- lifecycle ---- */
    lv.onEnter = function (player, phase) {
      lv._player = player;
      if (phase && lv.setPhase) { try { lv.setPhase(phase); } catch (e) {} }
      var p = playerPos(lv, player);
      lv.setCheckpoint(p.x, p.y, p.z, player ? player.yaw : 0, true);
      if (lv.env.music) music(lv.env.music, 1200);
      if (cfg.onEnter) { try { cfg.onEnter(lv, player, phase); } catch (e) { STV.warn('[lvl]', e); } }
    };

    lv.update = function (dt, player) {
      lv._player = player;
      lv.time += dt;

      /* timers */
      var i;
      for (i = lv._timers.length - 1; i >= 0; i--) {
        var t = lv._timers[i];
        t.d -= dt;
        if (t.d <= 0) {
          lv._timers.splice(i, 1);
          try { t.fn(); } catch (e) { STV.warn('[timer]', e); }
        }
      }

      /* stealth bookkeeping */
      if (!lv.stealthOff) {
        lv._noiseT -= dt;
        if (lv._noiseT <= 0) {
          lv._noiseT = 0.3;
          var n = (player && player.noise != null) ? player.noise
            : (playerRunning(player) ? 1 : (playerMoving(player) ? 0.4 : 0));
          if (n > 0.3) lv.noise(playerPos(lv, player), n * 7.5 - 2.0, 'steps');
        }
        var stim = false;
        for (i = 0; i < lv.actors.length; i++) {
          var a = lv.actors[i];
          if (a && (a.seeing || a.state === 'chase' || a.state === 'search')) { stim = true; break; }
        }
        lv.alert.decay(dt, stim);
      }

      for (i = 0; i < lv._updaters.length; i++) {
        try { lv._updaters[i](dt, player, lv); } catch (e) { STV.warn('[lvl update]', e); }
      }
    };

    lv.dispose = function () {
      for (var i = 0; i < lv._offs.length; i++) { try { lv._offs[i](); } catch (e) {} }
      lv._offs.length = 0;
      for (i = 0; i < lv._keyHandlers.length; i++) {
        try { window.removeEventListener('keydown', lv._keyHandlers[i], true); } catch (e) {}
      }
      lv._keyHandlers.length = 0;
      lv._timers.length = 0;
      lv._updaters.length = 0;
      lv.actors.length = 0;
      lv.interactables.length = 0;
      if (cfg.onDispose) { try { cfg.onDispose(lv); } catch (e) {} }
    };

    return lv;
  }

  /* Game calls actor.update(dt, player); our actors want (dt, level, player). */
  function wrapActors(lv) {
    for (var i = 0; i < lv.actors.length; i++) {
      var a = lv.actors[i];
      if (!a || a._wrapped || typeof a.update !== 'function') continue;
      a._wrapped = true;
      a._ai = a.update;
      a.update = (function (act) {
        return function (dt, player) { act._ai(dt, lv, player || lv._player); };
      })(a);
    }
  }

  /* ==========================================================================
   * 14. EASTER EGG PLUMBING
   * ========================================================================*/

  var EGG_NAMES = {
    konami: 'Up Up Down Down',
    win98: 'It Still Boots',
    kernel10: 'Employee of the Month',
    bsod: 'Blue Screen of Life',
    crowbar: 'DO NOT USE (RESERVED)',
    tcp: 'TCP Always Comes Back',
    hunter2: 'my password is *******',
    vending: 'Percussive Maintenance',
    poster127: 'No Place Like 127.0.0.1',
    duck: 'Rubber Duck Debugging',
    mom: 'Call Your Mother',
    ellisbackup: 'ELLIS_BACKUP.IMG',
    clock: 'Five Past Dusk',
    boombox: 'Four Stations',
    deadbeef: '0xDEADBEEF',
    catmode: 'Everyone Is A Cat'
  };

  var PET_COUNT = 0;          /* Kernel pets, this session */
  var VEND_HITS = {};         /* per-machine thump counter */

  function gotEgg(id) {
    var fresh = STV.egg(id, EGG_NAMES[id] || id);
    if (fresh) {
      sfx('success');
      toast('Easter egg: ' + (EGG_NAMES[id] || id), 'egg', 3200);
      checkCatMode();
    }
    return fresh;
  }
  function hasEgg(id) { return !!STV.progress.eggs[id]; }

  function checkCatMode() {
    if (hasEgg('catmode')) return;
    for (var i = 0; i < STV.EGGS.length; i++) {
      var e = STV.EGGS[i];
      if (e === 'catmode') continue;
      if (!STV.progress.eggs[e]) return;
    }
    STV.egg('catmode', EGG_NAMES.catmode);
    STV.settings.catmodeUnlocked = true;
    STV.saveSettings();
    STV.bus.emit('settings:catmode', { unlocked: true });
    toast('CATMODE unlocked in settings. Yes, really.', 'cat', 5200);
    say('Steve', 'I regret every decision that led here.', 2600, 'steve');
  }

  /* --- konami, listening from the first level build onwards ---------------- */
  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var konamiIdx = 0, konamiInstalled = false;

  function fireKonami() {
    gotEgg('konami');
    STV.Levels._hat = true;
    STV.bus.emit('egg:konami', {});
    sfx('bootChime');
    toast('Kernel has acquired a hat.', 'cat', 3400);
  }

  function installKonami() {
    if (konamiInstalled) return;
    konamiInstalled = true;
    try {
      window.addEventListener('keydown', function (e) {
        var k = e.key;
        if (!k) return;
        if (k.length === 1) k = k.toLowerCase();
        if (k === KONAMI[konamiIdx]) {
          konamiIdx++;
          if (konamiIdx >= KONAMI.length) { konamiIdx = 0; fireKonami(); }
        } else {
          konamiIdx = (k === KONAMI[0]) ? 1 : 0;
        }
      }, false);
    } catch (e) { /* no window keyboard, no problem */ }
    STV.bus.on('egg:konami:trigger', fireKonami);
  }

  /* --- catmode: replace every human silhouette with a large, dignified cat -- */
  function applyCatMode(lv) {
    if (!STV.settings.catmode) return;
    for (var i = 0; i < lv.actors.length; i++) {
      var a = lv.actors[i];
      if (!a || !a.body || a.type === 'cat') continue;
      a.body.visible = false;
      var c = safeGeo('cat', [{ seed: 7 + i * 13 }], [0.28, 0.34, 0.7], { kind: 'cat' });
      ensureCat(c);
      c.scale.setScalar(2.6);
      c.position.y = 0.02;
      a.obj.add(c);
      a.catBody = c;
    }
  }

  /* Kernel — the shop cat. Used by `shop` and `epilogue`. */
  function makeKernel(lv, x, z, yaw, cfg) {
    cfg = cfg || {};
    var g = safeGeo('cat', [{ color: 0x8c8377, seed: 1010 }], [0.26, 0.32, 0.66], { kind: 'cat' });
    ensureCat(g);
    var holder = new T.Group();
    holder.add(g);

    /* the konami hat — permanent once earned */
    var hat = new T.Mesh(coneGeo(0.075, 0.15, 10), basic(0xff5fd3, 1));
    hat.position.set(0, 0.42, 0.16);
    hat.rotation.z = 0.12;
    hat.visible = !!(STV.Levels && STV.Levels._hat) || hasEgg('konami');
    holder.add(hat);

    var A = {
      type: 'cat', name: 'Kernel', obj: holder, body: g, hat: hat,
      pos: V(x, 0, z), state: cfg.state || 'sit', purr: 0, tail: 0,
      update: function (dt) {
        A.tail += dt;
        try { g.update(dt, { state: A.state }); } catch (e) {}
        holder.position.set(A.pos.x, 0, A.pos.z);
        if (A.purr > 0) {
          A.purr -= dt;
          holder.position.y = Math.sin(A.tail * 22) * 0.006;
        } else holder.position.y = 0;
        if (!hat.visible && (STV.Levels._hat || hasEgg('konami'))) hat.visible = true;
      },
      reset: function () {}
    };
    addProp(lv, holder, x, 0, z, yaw || 0, { solid: false, id: 'kernel' });
    lv.actors.push(A);

    /* --- egg 3: pet the cat ten times ------------------------------------ */
    var petLines = [
      'Hello, Kernel.', 'You are not helping.', 'That is my chair.',
      'You have never paid rent.', 'Yes. Very good.', 'I know. I know.',
      'You were asleep on the router again.', 'Do not eat the thermal paste.',
      'One day you will get a job.', ''
    ];
    addInteract(lv, {
      obj: holder,
      label: 'Pet Kernel',
      radius: 1.9,
      onUse: function () {
        PET_COUNT++;
        A.purr = 2.2;
        A.state = 'lick';
        sfx('catPurr', A.pos, 0.8);
        lv.addTimer(function () { A.state = cfg.state || 'sit'; }, 2.4);
        if (PET_COUNT < 10) {
          var l = petLines[(PET_COUNT - 1) % petLines.length];
          if (l) say('Steve', l, 1900, 'steve');
          if (PET_COUNT === 5) hint('He is keeping count. So is the game.', 3200);
        } else if (PET_COUNT === 10) {
          sfx('catMeow', A.pos, 1);
          say('Steve', 'What have you got there? …That is the M3 I have been looking for since March.', 4200, 'steve');
          /* he brings you the screw */
          var screw = place(lv, 'screwdriver', [], A.pos.x + 0.35, 0.02, A.pos.z + 0.3, 0.6, [0.02, 0.02, 0.16], { solid: false });
          if (screw) screw.scale.setScalar(0.5);
          toast('Kernel brought you an M3 screw.', 'cat', 3600);
          gotEgg('kernel10');
        }
      }
    });
    return A;
  }

  /* ==========================================================================
   * 15. SHARED SET DRESSING
   * ========================================================================*/

  /* A wall poster that can carry an egg. */
  function addPoster(lv, kind, x, y, z, yaw, w, h, cfg) {
    cfg = cfg || {};
    var g = safeGeo('poster', [kind, w || 0.6, h || 0.85], [w || 0.6, h || 0.85, 0.02], { kind: 'flat', color: 0x9aa6b2, solid: false });
    if (g.userData) g.userData.colliders = [];
    addProp(lv, g, x, y, z, yaw, { solid: false });
    if (cfg.label) {
      addInteract(lv, {
        obj: g, label: cfg.label, radius: cfg.radius || 2.2,
        onUse: function () { if (cfg.onUse) cfg.onUse(); }
      });
    }
    return g;
  }

  /* Handwritten sticky note. */
  function addNote(lv, x, y, z, yaw, cfg) {
    cfg = cfg || {};
    var g = safeGeo('stickyNote', [cfg.text || ''], [0.08, 0.08, 0.004], { kind: 'flat', color: 0xf4e58a, solid: false });
    if (g.userData) g.userData.colliders = [];
    addProp(lv, g, x, y, z, yaw || 0, { solid: false });
    if (cfg.label) {
      addInteract(lv, {
        obj: g, label: cfg.label, radius: cfg.radius || 1.7,
        onUse: function () { if (cfg.onUse) cfg.onUse(); }
      });
    }
    return g;
  }

  /* Cable spaghetti: a sagging catenary of little boxes. Cheap, reads great. */
  function cableRun(lv, x1, y1, z1, x2, y2, z2, sag, color, seed) {
    var r = STV.rng(seed || 4242);
    var segs = 9;
    var grp = new T.Group();
    var mat = M(color || 'rubber');
    for (var i = 0; i < segs; i++) {
      var t0 = i / segs, t1 = (i + 1) / segs;
      var p0 = catPt(t0), p1 = catPt(t1);
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var th = 0.012 + r() * 0.008;
      var m = new T.Mesh(boxGeo(th, th, len), mat);
      m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
      m.lookAt(p1[0], p1[1], p1[2]);
      grp.add(m);
    }
    function catPt(t) {
      var s = (sag == null ? 0.25 : sag) * Math.sin(Math.PI * t);
      return [STV.lerp(x1, x2, t), STV.lerp(y1, y2, t) - s, STV.lerp(z1, z2, t)];
    }
    grp.userData.colliders = [];
    lv.root.add(grp);
    return grp;
  }

  /* ==========================================================================
   * 16. LEVEL BUILDERS
   * ========================================================================*/

  var BUILDERS = {};

  /* Temporary placeholder used until a builder exists; also the crash net. */
  function buildStub(id, ctx, note) {
    var lv = makeLevel(id, ctx, {});
    lv.env.footstep = 'concrete';
    lv.env.ambience = 'shopRoom';
    lv.env.sky = 0x0b0e12;
    ambientPair(lv, 0x9fb6cc, 0x2a2620, 1.0);
    roomShell(lv, { x0: -6, x1: 6, z0: -6, z1: 6, h: 3, floorMat: 'concrete', ceiling: true });
    groundBox(lv, 0, 0, 12, 12, 0);
    stripLight(lv, 0, 2.85, 0, 2.4, 0, { real: true });
    lv.spawn.pos.set(0, 0, 3);
    addInteract(lv, {
      at: [0, 1.2, -2], label: 'Continue', once: true,
      onUse: function () { lv.complete(0.4); }
    });
    objective(note || 'Continue');
    wrapActors(lv);
    return lv;
  }

  /* ==========================================================================
   * 17. EXPORT
   * ========================================================================*/

  STV.Levels = {
    list: LEVEL_IDS.slice(),
    next: function (id) { return NEXT_ID[id] || null; },
    _hat: false,

    build: function (id, ctx) {
      installKonami();
      if (STV.progress.eggs.konami) STV.Levels._hat = true;
      var fn = BUILDERS[id];
      var lv = null;
      if (typeof fn === 'function') {
        try {
          lv = fn(ctx || {});
        } catch (e) {
          STV.warn('[levels] builder "' + id + '" failed:', e);
          lv = null;
        }
      } else {
        STV.warn('[levels] no builder for "' + id + '"');
      }
      if (!lv) lv = buildStub(id, ctx || {}, 'Continue');
      lv.id = id;
      applyCatMode(lv);
      wrapActors(lv);
      STV.log('[levels] built', id, {
        colliders: lv.colliders.length, actors: lv.actors.length,
        lights: lv.lights.length, interact: lv.interactables.length
      });
      return lv;
    },

    /* debug / cheats */
    egg: gotEgg,
    petCount: function () { return PET_COUNT; }
  };

  /* ==========================================================================
   * 18. LEVEL — shop / epilogue shared shell
   *   Kilbride Computer Repair. Unit 4, a nondescript office park.
   *   Interior  x[-5,5]  z[-6,4]   Back room x[-1,5] z[-11,-6]
   *   Forecourt z[4,17]
   * ========================================================================*/

  function shopShell(lv, opts) {
    opts = opts || {};
    var H = 2.9;

    /* --- floors ---------------------------------------------------------- */
    floorSlab(lv, 0, -1, 10, 10, 'carpetShop', 0);
    floorSlab(lv, 2, -8.5, 6, 5, 'concrete', 0);
    groundBox(lv, 0, -1, 10.4, 10.4, 0);
    groundBox(lv, 2, -8.5, 6.4, 5.4, 0);

    ceilingSlab(lv, 0, -1, 10, 10, 'ceiling', H);
    ceilingSlab(lv, 2, -8.5, 6, 5, 'ceiling', H - 0.35);

    /* --- walls ----------------------------------------------------------- */
    /* front (south, z=+4): shop window + glass door */
    wallLine(lv, -5, 4, 5, 4, H, {
      mat: 'drywallShop',
      openings: [
        { s: 0.8, e: 4.4, bottom: 0.95, top: 2.4 },
        { s: 5.6, e: 7.0, bottom: 0, top: 2.1 }
      ]
    });
    /* back (north, z=-6) with the back-room doorway */
    wallLine(lv, -5, -6, 5, -6, H, {
      mat: 'drywallShop',
      openings: [{ s: 6.8, e: 7.9, bottom: 0, top: 2.05 }]
    });
    wallLine(lv, -5, -6, -5, 4, H, { mat: 'drywallShop' });
    wallLine(lv, 5, -6, 5, 4, H, { mat: 'drywallShop' });

    /* back room */
    wallLine(lv, -1, -11, 5, -11, H - 0.35, { mat: 'drywall' });
    wallLine(lv, -1, -11, -1, -6, H - 0.35, { mat: 'drywall' });
    wallLine(lv, 5, -11, 5, -6, H - 0.35, { mat: 'drywall' });

    /* --- shop window glass + door ---------------------------------------- */
    place(lv, 'window', [3.6, 1.45], -2.4, 0.95, 4, 0, [3.6, 1.45, 0.08], { solid: false });
    var door = safeGeo('door', [1.35, 2.05, { glass: true, mat: 'glass' }], [1.35, 2.05, 0.06], { mat: 'glass', solid: false });
    ensureOpenable(door, 1.35);
    if (door.userData) door.userData.colliders = [];
    addProp(lv, door, 0.62, 0, 4, 0, { solid: false, id: 'frontDoor' });
    lv.frontDoor = door;
    place(lv, 'doorChime', [], 1.3, 2.16, 3.9, 0, [0.1, 0.12, 0.05], { solid: false, id: 'chime' });

    /* the door opens for you, like a real shop door */
    var doorT = 0, doorOpen = false;
    lv.addUpdater(function (dt, player) {
      if (!player) return;
      var p = playerPos(lv, player);
      var near = flatDist(p.x, p.z, 0.62, 4) < 2.0 && !lv.doorLocked;
      if (near !== doorOpen) {
        doorOpen = near;
        sfx(near ? 'doorOpen' : 'doorClose', V(0.62, 1, 4), 0.6);
        if (near) sfx('doorChime', V(0.62, 2, 4), 0.75);
      }
      doorT = STV.damp(doorT, doorOpen ? 1 : 0, 7, dt);
      try { door.open(doorT); } catch (e) {}
    });

    /* --- forecourt ------------------------------------------------------- */
    floorSlab(lv, 0, 10.5, 26, 13, 'asphalt', 0.0);
    groundBox(lv, 0, 10.5, 26, 13, 0);
    place(lv, 'parkingLines', [22, 11], 0, 0.012, 10.5, 0, [22, 0.01, 11], { solid: false });

    /* neighbouring units so the park reads as a park, not a diorama */
    place(lv, 'officeBlock', [14, 7, 12, { windows: true, tone: 0.6 }], -15.5, 0, -2, 0, [14, 7, 12], { solid: true });
    place(lv, 'officeBlock', [14, 6.4, 12, { windows: true, tone: 0.45 }], 15.5, 0, -2, 0, [14, 6.4, 12], { solid: true });
    place(lv, 'officeBlock', [30, 5.5, 8, { windows: true, tone: 0.3 }], 0, 0, 22.5, 0, [30, 5.5, 8], { solid: true });
    /* our own unit, seen from outside */
    place(lv, 'signPost', ['KILBRIDE COMPUTER REPAIR'], -3.2, 0, 4.5, 0, [2.2, 0.5, 0.1], { solid: false, id: 'shopSign' });

    place(lv, 'hedge', [9], -9, 0, 16.4, 0, [9, 0.9, 0.7], { solid: true });
    place(lv, 'hedge', [9], 9, 0, 16.4, 0, [9, 0.9, 0.7], { solid: true });
    place(lv, 'chainFence', [26], 0, 0, 17.2, 0, [26, 1.9, 0.08], { solid: true });
    place(lv, 'treeSmall', [], -10.5, 0, 12.5, 0, [1.6, 3.4, 1.6], { solid: true });
    place(lv, 'treeSmall', [], 10.8, 0, 13.6, 1.2, [1.6, 3.1, 1.6], { solid: true });
    place(lv, 'dumpster', [], 8.6, 0, 6.4, -0.35, [1.8, 1.25, 1.1], { solid: true });
    place(lv, 'bench', [], -6.2, 0, 5.6, 0, [1.6, 0.85, 0.6], { solid: true });
    place(lv, 'trashCan', [], -7.6, 0, 5.6, 0, [0.4, 0.9, 0.4], { solid: true });
    place(lv, 'bollard', [], 2.9, 0, 4.9, 0, [0.16, 0.9, 0.16], { solid: true });
    place(lv, 'bollard', [], -0.9, 0, 4.9, 0, [0.16, 0.9, 0.16], { solid: true });
    place(lv, 'puddle', [1.5], -4.5, 0.006, 9.0, 0, [3, 0.01, 3], { solid: false });

    /* Ms. Ellis's car: a beige saloon that has been beige for 22 years. */
    lv.props.ellisCar = place(lv, 'car', [0xd8cdb2, 'sedan'], -2.6, 0, 8.2, Math.PI * 0.5,
      [4.4, 1.45, 1.85], { solid: true, id: 'ellisCar' });
    place(lv, 'car', [0x39424b, 'van'], 4.4, 0, 8.4, Math.PI * 0.5, [5.0, 2.1, 2.0], { solid: true });
    if (opts.olegCar !== false) {
      lv.props.olegCar = place(lv, 'car', [0x14171a, 'suv'], 1.0, 0, 12.4, Math.PI * 0.5,
        [4.9, 1.75, 1.95], { solid: true, id: 'olegCar' });
    }

    place(lv, 'streetLamp', [], -8.5, 0, 8.0, 0, [0.2, 5.2, 0.2], { solid: true, light: false, id: 'lamp1' });
    place(lv, 'streetLamp', [], 8.5, 0, 8.0, 0, [0.2, 5.2, 0.2], { solid: true, light: false, id: 'lamp2' });

    return H;
  }

  /* The shop's light rig — 3 dynamic lights, everything else is faked. */
  function shopLighting(lv, mood) {
    var dusk = mood === 'dusk';
    var evening = mood === 'evening';

    lv.env.sky = dusk ? 0x2a3140 : (evening ? 0x38424f : 0x9fb7cf);
    lv.env.fog = { type: 'exp2', color: dusk ? 0x2a3140 : 0x9fb7cf, density: dusk ? 0.016 : 0.008 };
    lv.env.exposure = dusk ? 0.92 : 1.0;
    lv.env.baseLight = 0.42;

    var hemi = ambientPair(lv, dusk ? 0x4b5a72 : 0xbcd2e6, 0x3a3128, dusk ? 0.55 : 0.95);
    lv.hemi = hemi;

    var sun = new T.DirectionalLight(dusk ? 0xffb27a : 0xffeccf, dusk ? 0.55 : 1.35);
    sun.position.set(-7, dusk ? 5 : 13, 15);
    sun.target.position.set(0, 0, 0);
    lv.root.add(sun.target);
    addLight(lv, sun, true);
    lv.sun = sun;

    /* two fluorescent battens over the shop floor + one over the bench */
    stripLight(lv, -1.4, 2.82, 0.6, 2.6, 0, { real: true, intensity: 1.05, dist: 12, probe: 5, probeI: 0.7 });
    stripLight(lv, -1.4, 2.82, -3.4, 2.6, 0, { real: false, probe: 5, probeI: 0.6 });
    stripLight(lv, 2.0, 2.45, -8.6, 1.6, 0, { real: false, glow: 0.35, probe: 3.4, probeI: 0.5, color: 0xdfe8ee });

    /* one warm lamp on the workbench — the shop's heart */
    var lamp = new T.PointLight(0xffd9a0, 0.85, 5.5, 2.0);
    lamp.position.set(-3.9, 1.35, -1.2);
    addLight(lv, lamp, false);
    addProbe(lv, -3.9, -1.2, 3.2, 0.55);
    lv.benchLamp = lamp;

    /* fake sunlight through the shop window */
    var shaft = new T.Mesh(planeGeo(3.4, 3.2), basic(0xffe9c9, dusk ? 0.10 : 0.16, true));
    shaft.rotation.x = -Math.PI * 0.5;
    shaft.position.set(-2.2, 0.015, 1.4);
    shaft.renderOrder = 1;
    lv.root.add(shaft);
    lv.sunShaft = shaft;

    addMotes(lv, { x: -2.2, y: 0.2, z: 0.6, w: 5.5, h: 2.4, d: 5.0, count: 110, seed: 606, size: 0.018, opacity: 0.42 });

    lv.setMood = function (m) {
      var d = m === 'dusk';
      lv.hemi.intensity = d ? 0.5 : 0.95;
      lv.hemi.color.setHex(d ? 0x4b5a72 : 0xbcd2e6);
      sun.intensity = d ? 0.45 : 1.35;
      sun.color.setHex(d ? 0xff9d63 : 0xffeccf);
      sun.position.set(-11, d ? 3.2 : 13, 15);
      shaft.material = basic(d ? 0xff9d63 : 0xffe9c9, d ? 0.09 : 0.16, true);
      if (lv.ctx.scene) {
        if (lv.ctx.scene.background && lv.ctx.scene.background.setHex) lv.ctx.scene.background.setHex(d ? 0x2a3140 : 0x9fb7cf);
        if (lv.ctx.scene.fog && lv.ctx.scene.fog.color) lv.ctx.scene.fog.color.setHex(d ? 0x2a3140 : 0x9fb7cf);
      }
      if (lv.ctx.renderer) lv.ctx.renderer.toneMappingExposure = d ? 0.92 : 1.0;
    };
  }

  /* Footstep + ambience follow you out to the car park. */
  function shopSurfaceWatcher(lv) {
    var outside = null;
    lv.addUpdater(function (dt, player) {
      if (!player) return;
      var p = playerPos(lv, player);
      var out = p.z > 4.3;
      if (out !== outside) {
        outside = out;
        if (player.footSurface !== undefined) player.footSurface = out ? 'concrete' : 'carpet';
        lv.env.footstep = out ? 'concrete' : 'carpet';
        lv.env.ambience = out ? 'parkingLot' : 'shopRoom';
        if (STV.Audio && STV.Audio.ambience) {
          try { STV.Audio.ambience(out ? 'parkingLot' : 'shopRoom', 800); } catch (e) {}
        }
      }
    });
  }

  /* ==========================================================================
   * 19. EGG 2 — a working DOS prompt on Ms. Ellis's tower
   *   Renders to a real CRT in the world. Keyboard types; on touch the USE
   *   button runs the highlighted suggestion, so it is playable one-thumbed.
   * ========================================================================*/

  function makeDosTerminal(lv, cfg) {
    var scr = makeScreen({ w: 384, h: 288, crt: true, glow: 0x63ff9a });
    var mesh = scr.mesh(cfg.w || 0.30, cfg.h || 0.225);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.rotation.y = cfg.yaw || 0;
    mesh.renderOrder = 3;
    lv.root.add(mesh);

    var D = {
      mesh: mesh, screen: scr, on: false, active: false,
      lines: [], input: '', cursor: 0, blink: 0, busy: 0, ranOne: false,
      sugg: ['dir', 'ver', 'steve.exe', 'kernel', 'format c:', 'win', 'exit'],
      suggI: 0
    };

    var W = 384, H = 288, ROWS = 21, COLS = 44;

    function push(s) {
      if (s == null) s = '';
      while (s.length > COLS) { D.lines.push(s.slice(0, COLS)); s = s.slice(COLS); }
      D.lines.push(s);
      while (D.lines.length > ROWS) D.lines.shift();
      D.dirty = true;
    }
    D.push = push;

    function draw() {
      var c = scr.ctx;
      if (!c) return;
      c.fillStyle = '#050d07';
      c.fillRect(0, 0, W, H);
      c.font = '13px monospace';
      c.textBaseline = 'top';
      c.fillStyle = '#78ffae';
      var i;
      if (!D.on) {
        c.fillStyle = '#0b1a10';
        c.fillRect(0, 0, W, H);
      } else {
        for (i = 0; i < D.lines.length; i++) c.fillText(D.lines[i], 8, 6 + i * 13);
        var y = 6 + D.lines.length * 13;
        if (y < H - 26) {
          c.fillText((cfg.prompt || 'C:\\>') + D.input, 8, y);
          if (D.blink < 0.5 && D.active) {
            var wpx = c.measureText((cfg.prompt || 'C:\\>') + D.input).width;
            c.fillStyle = '#78ffae';
            c.fillRect(8 + wpx + 1, y + 1, 7, 11);
          }
        }
        if (D.active) {
          c.fillStyle = 'rgba(120,255,174,0.75)';
          c.fillRect(0, H - 18, W, 18);
          c.fillStyle = '#050d07';
          c.fillText('[USE] ' + D.sugg[D.suggI] + '   [ALT] exit', 8, H - 16);
        }
      }
      /* scanlines + a little bloom, because it is 1998 */
      c.fillStyle = 'rgba(0,0,0,0.16)';
      for (i = 0; i < H; i += 3) c.fillRect(0, i, W, 1);
      scr.flush();
    }
    D.draw = draw;

    function banner() {
      D.lines.length = 0;
      push('Starting Windows 98...');
      push('');
      push('Microsoft(R) Windows 98');
      push('   (C)Copyright Microsoft Corp 1981-1998.');
      push('');
      push('HIMEM is testing extended memory...done.');
      push('');
    }

    D.boot = function () {
      D.on = true;
      banner();
      draw();
      sfx('bootChime', null, 0.8);
      lv.addTimer(function () { sfx('floppySeek', null, 0.5); draw(); }, 0.9);
    };

    var FILES = [
      'AUTOEXEC BAT       412  03-14-99   9:02a',
      'CONFIG   SYS       288  03-14-99   9:02a',
      'STEVE    EXE     26112  06-02-99  11:40a',
      'SOL      EXE    180736  05-11-98   8:01a',
      'HAROLD   JPG    418304  11-22-01   6:17p',
      'ELLIS    TXT      1024  01-08-02   7:45p',
      'KERNEL   CAT         0  09-30-04   2:02a'
    ];

    function run(raw) {
      var line = (raw || '').replace(/\s+$/, '');
      push((cfg.prompt || 'C:\\>') + line);
      var cmd = line.trim().toLowerCase();
      var arg = '';
      var sp = cmd.indexOf(' ');
      if (sp > 0) { arg = cmd.slice(sp + 1).trim(); cmd = cmd.slice(0, sp); }
      sfx('keyType', null, 0.4);

      if (cmd === '') { draw(); return; }

      if (cmd === 'help' || cmd === '?') {
        push('DIR  CD  VER  CLS  ECHO  TYPE  WIN  EXIT');
        push('STEVE.EXE      diagnose everything');
        push('FORMAT C:      do not');
      } else if (cmd === 'dir') {
        push(' Volume in drive C is ELLIS');
        push(' Directory of C:\\');
        push('');
        for (var i = 0; i < FILES.length; i++) push(FILES[i]);
        push('        7 file(s)     626,876 bytes');
        push('                    1,204,224 bytes free');
      } else if (cmd === 'cd') {
        if (!arg || arg === '\\' || arg === '/') push('C:\\');
        else push('Directory not found. There never were any.');
      } else if (cmd === 'ver') {
        push('');
        push('Windows 98 [Version 4.10.1998]');
        push('Uptime since last battery: 0 days.');
      } else if (cmd === 'cls') {
        D.lines.length = 0;
      } else if (cmd === 'echo') {
        push(arg ? raw.trim().slice(5) : 'ECHO is on.');
      } else if (cmd === 'type' || cmd === 'cat') {
        if (arg.indexOf('ellis') === 0) {
          push('Harold set this up. I have not moved it.');
          push('The grandson says I should get a new one.');
          push('I do not want a new one.');
        } else if (arg.indexOf('kernel') === 0) {
          push('meow');
          sfx('catMeow', null, 0.7);
        } else push('File not found - ' + (arg || '').toUpperCase());
      } else if (cmd === 'steve.exe' || cmd === 'steve') {
        push('');
        push('STEVE.EXE  v1.0  (c) nobody');
        push('  scanning bus.............. OK');
        push('  reseating everything...... OK');
        push('  blowing dust out of fan... OK');
        push('  charging you for it....... SKIPPED');
        push('');
        push('Everything is fine. It usually is.');
        sfx('beepPC', null, 0.6);
      } else if (cmd === 'format') {
        push('');
        push('WARNING: ALL DATA ON DRIVE C: WILL BE LOST.');
        push('Proceed? (Y/N) N');
        push('');
        push('There are photographs on this drive.');
        push('No. Thank you for asking.');
        sfx('uiError', null, 0.5);
      } else if (cmd === 'win') {
        push('Loading Windows 98...');
        D.busy = 1.4;
        lv.addTimer(function () {
          push('...');
          push('No. Let us both stay here where it is quiet.');
          draw();
        }, 1.4);
      } else if (cmd === 'kernel' || cmd === 'meow') {
        push('    /\\_/\\');
        push('   ( o.o )   KERNEL.CAT loaded at 0000:0CAT');
        push('    > ^ <    (resident, will not unload)');
        sfx('catMeow', null, 0.8);
      } else if (cmd === 'exit') {
        push('Goodbye.');
        D.close();
      } else {
        push('Bad command or file name');
        sfx('uiError', null, 0.35);
      }

      if (!D.ranOne && cmd !== 'help' && cmd !== '?') {
        D.ranOne = true;
        gotEgg('win98');
        say('Steve', 'Twenty-six years old and it still knows exactly who it is.', 3800, 'steve');
      }
      D.suggI = (D.suggI + 1) % D.sugg.length;
      draw();
    }
    D.run = run;

    /* --- session control ------------------------------------------------- */
    var keyFn = function (e) {
      if (!D.active) return;
      var k = e.key;
      if (!k) return;
      if (k === 'Escape') { D.close(); }
      else if (k === 'Enter') { var v = D.input; D.input = ''; run(v); }
      else if (k === 'Backspace') { D.input = D.input.slice(0, -1); draw(); }
      else if (k === 'Tab') { D.input = D.sugg[D.suggI]; draw(); }
      else if (k.length === 1 && D.input.length < 38) { D.input += k; sfx('keyType', null, 0.22); draw(); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };

    D.open = function (player) {
      if (!D.on || D.active) return;
      D.active = true;
      lv._dosPlayer = player;
      if (player) player.locked = true;
      try { window.addEventListener('keydown', keyFn, true); } catch (e) {}
      lv._keyHandlers.push(keyFn);
      hint('Type a command and press ENTER. On touch, USE runs the suggestion. ALT / ESC to step back.', 6000);
      sfx('crtOn', null, 0.5);
      draw();
    };
    D.close = function () {
      if (!D.active) return;
      D.active = false;
      D.input = '';
      if (lv._dosPlayer) lv._dosPlayer.locked = false;
      try { window.removeEventListener('keydown', keyFn, true); } catch (e) {}
      draw();
    };

    /* touch / gamepad path: the level eats the USE edge while the session is up */
    var drawT = 0;
    lv.addUpdater(function (dt) {
      D.blink = (D.blink + dt) % 1;
      if (D.busy > 0) D.busy -= dt;
      if (!D.active) return;
      var inp = STV.UI && STV.UI.input;
      if (inp) {
        if (inp.use) { inp.use = false; var s = D.sugg[D.suggI]; D.input = ''; run(s); }
        if (inp.alt) { inp.alt = false; D.close(); }
      }
      drawT -= dt;
      if (drawT <= 0) { drawT = 1 / 12; draw(); }   /* canvas uploads are not free */
    });

    draw();
    return D;
  }

  /* ==========================================================================
   * 20. THE SHOP INTERIOR — fixtures, clutter, and most of the eggs
   * ========================================================================*/

  function shopFixtures(lv, opts) {
    opts = opts || {};
    var r = STV.rng(0x5A0B);
    var i;

    /* --- workbench, west wall ------------------------------------------- */
    var bench = place(lv, 'workbench', [3.6], -4.55, 0, -1.0, Math.PI * 0.5, [3.6, 0.9, 0.72], { solid: true, id: 'workbench' });
    place(lv, 'pegboard', [3.0, 1.05], -4.93, 1.35, -1.0, Math.PI * 0.5, [3.0, 1.05, 0.05], { solid: false, id: 'pegboard' });
    place(lv, 'stool', [], -3.55, 0, -0.7, 0.4, [0.4, 0.66, 0.4], { solid: true });
    place(lv, 'toolChest', [], -4.5, 0, 1.9, Math.PI * 0.5, [0.7, 0.95, 0.45], { solid: true });

    var BY = 0.92;   /* bench top */

    /* Ms. Ellis's tower — the reason we are all here */
    var tower = place(lv, 'pcTowerBeige', [], -4.42, BY, -0.35, Math.PI * 0.5, [0.2, 0.42, 0.45],
      { solid: false, id: 'ellisTower' });
    lv.props.ellisTower = tower;

    var crt = place(lv, 'crtMonitor', [15], -4.5, BY, 0.35, Math.PI * 0.5, [0.4, 0.38, 0.4], { solid: false, id: 'ellisCrt' });
    place(lv, 'keyboard', [], -4.05, BY, 0.35, Math.PI * 0.5, [0.42, 0.03, 0.15], { solid: false });
    place(lv, 'mouse', [], -4.02, BY, 0.05, Math.PI * 0.5, [0.06, 0.035, 0.1], { solid: false });

    var dos = makeDosTerminal(lv, { x: -4.30, y: BY + 0.26, z: 0.35, yaw: Math.PI * 0.5, w: 0.27, h: 0.20, prompt: 'C:\\>' });
    lv.dos = dos;

    /* the half-disassembled tower — cable spaghetti and honest mess */
    place(lv, 'pcTowerModern', [{ open: true }], -4.42, BY, -1.65, Math.PI * 0.5 + 0.18, [0.22, 0.45, 0.48], { solid: false });
    place(lv, 'motherboard', [], -4.15, BY, -1.15, Math.PI * 0.5 - 0.3, [0.3, 0.03, 0.24], { solid: false });
    place(lv, 'hardDrive', [], -4.05, BY, -2.05, Math.PI * 0.5 + 0.5, [0.1, 0.026, 0.147], { solid: false });
    place(lv, 'hardDrive', [], -4.18, BY + 0.03, -2.15, Math.PI * 0.5 + 0.9, [0.1, 0.026, 0.147], { solid: false });
    place(lv, 'solderingStation', [], -4.55, BY, -2.55, Math.PI * 0.5, [0.26, 0.14, 0.2], { solid: false, id: 'solderStation' });
    place(lv, 'oscilloscope', [], -4.6, BY, 1.05, Math.PI * 0.5, [0.32, 0.24, 0.28], { solid: false });
    place(lv, 'multimeter', [], -4.15, BY, -0.85, Math.PI * 0.5 + 0.2, [0.09, 0.04, 0.16], { solid: false });
    place(lv, 'screwdriver', [], -4.08, BY, -1.42, 1.9, [0.02, 0.02, 0.18], { solid: false });
    place(lv, 'cableCoil', [], -4.62, BY, -2.05, 0, [0.2, 0.07, 0.2], { solid: false });
    place(lv, 'cableCoil', [], -3.2, 0, -2.55, 0.6, [0.24, 0.08, 0.24], { solid: false });
    place(lv, 'deskLamp', [], -4.78, BY, -1.25, Math.PI * 0.5, [0.16, 0.42, 0.16], { solid: false, light: false });
    place(lv, 'coffeeMug', [], -4.05, BY, -0.62, 0, [0.08, 0.1, 0.08], { solid: false, id: 'mug' });
    place(lv, 'partsBin', [], -4.72, BY, 0.72, Math.PI * 0.5, [0.16, 0.1, 0.22], { solid: false });

    /* cable spaghetti: bench to wall, bench to floor */
    cableRun(lv, -4.85, BY - 0.02, -1.9, -4.92, 0.12, -2.6, 0.22, 'rubber', 11);
    cableRun(lv, -4.7, BY - 0.02, -0.2, -4.92, 0.35, 0.9, 0.3, 'rubber', 12);
    cableRun(lv, -4.6, 0.06, -1.2, -3.4, 0.05, -2.9, 0.05, 'rubber', 13);

    /* --- front counter --------------------------------------------------- */
    place(lv, 'counter', [3.0], 2.9, 0, 1.4, 0, [3.0, 1.05, 0.7], { solid: true, id: 'counter' });
    place(lv, 'cashRegister', [], 4.05, 1.06, 1.35, -0.2, [0.34, 0.24, 0.3], { solid: false });
    place(lv, 'laptop', [], 3.35, 1.06, 1.35, Math.PI, [0.33, 0.22, 0.24], { solid: false });
    var kbd2 = place(lv, 'keyboard', [], 2.25, 1.06, 1.3, Math.PI, [0.42, 0.03, 0.15], { solid: false, id: 'counterKbd' });
    place(lv, 'officeChair', [], 2.5, 0, 0.35, Math.PI, [0.6, 0.98, 0.6], { solid: true });
    place(lv, 'plantPotted', [], 4.55, 0, 3.3, 0, [0.45, 1.05, 0.45], { solid: true });
    place(lv, 'trashCan', [], -4.5, 0, 2.65, 0, [0.34, 0.62, 0.34], { solid: true });

    /* yellowing manuals, stacked because nobody ever throws a manual away */
    for (i = 0; i < 4; i++) {
      place(lv, 'cardboardBox', [0.26], 1.75, 1.06 + i * 0.045, 1.55 + r() * 0.04, r() * 0.4 - 0.2,
        [0.3, 0.045, 0.22], { solid: false });
    }

    /* --- shelving, back wall --------------------------------------------- */
    place(lv, 'shelvingUnit', [2.2, 2.1], -2.2, 0, -5.62, 0, [2.2, 2.1, 0.45], { solid: true, id: 'shelfA' });
    place(lv, 'shelvingUnit', [1.6, 2.1], 0.35, 0, -5.62, 0, [1.6, 2.1, 0.45], { solid: true, id: 'shelfB' });
    for (i = 0; i < 12; i++) {
      var sx = -3.1 + (i % 6) * 0.42;
      var sy = 0.42 + Math.floor(i / 6) * 0.52;
      place(lv, 'partsBin', [], sx, sy, -5.6, 0, [0.3, 0.16, 0.3], { solid: false });
    }
    for (i = 0; i < 5; i++) {
      place(lv, 'cardboardBox', [0.34 + r() * 0.12], 0.0 + r() * 1.1, 1.46 + Math.floor(i / 3) * 0.36, -5.6, r() * 0.5,
        [0.36, 0.34, 0.32], { solid: false });
    }

    /* --- the vending machine (egg 8) ------------------------------------- */
    var vend = place(lv, 'vendingMachine', [], 4.42, 0, -3.1, -Math.PI * 0.5, [0.95, 1.85, 0.75], { solid: true, id: 'vending', light: false });
    addProbe(lv, 4.4, -3.1, 2.4, 0.35);
    glowPanel(lv, 4.05, 1.2, -3.1, 1.0, 1.3, 0x5fd3ff, 0.16, 0);
    vendingEgg(lv, vend, 'shop', 3.9, 1.1, -3.1);

    /* --- the BSOD corner (egg 4) ----------------------------------------- */
    bsodEgg(lv, 3.9, -4.85);

    /* --- fish tank: TCP (egg 6) ------------------------------------------ */
    place(lv, 'counter', [1.4], -3.4, 0, 3.32, 0, [1.4, 0.95, 0.6], { solid: true });
    var tank = place(lv, 'fishTank', [1.0], -3.4, 0.96, 3.32, 0, [1.0, 0.5, 0.4], { solid: false, id: 'fishTank' });
    tcpEgg(lv, tank);

    /* --- posters, clock, notes ------------------------------------------- */
    var p127 = addPoster(lv, '127001', 4.92, 1.75, -0.8, -Math.PI * 0.5, 0.62, 0.86, {
      label: 'Read the poster',
      onUse: function () {
        say('Steve', 'There is no place like it. Harold had the same one. Different wall.', 4200, 'steve');
        gotEgg('poster127');
      }
    });
    lv.props.poster127 = p127;
    addPoster(lv, 'raid', 3.55, 1.85, -5.9, 0, 0.58, 0.8, {
      label: 'Read the poster',
      onUse: function () { say('Steve', 'RAID is not a backup. It says so. Nobody reads it.', 3400, 'steve'); }
    });
    addPoster(lv, 'cat', -4.92, 1.85, 2.4, Math.PI * 0.5, 0.5, 0.7, {
      label: 'Look at the photo',
      onUse: function () { say('Steve', 'He was smaller then. Marginally.', 2600, 'steve'); }
    });

    clockEgg(lv, 0.2, 2.32, -5.9);
    boomboxEgg(lv, -2.6, 2.16, -5.5);
    duckEgg(lv, -4.05, BY, -0.05);
    phoneEgg(lv, -4.02, BY, -1.95);
    hunter2Egg(lv, kbd2, 2.25, 1.02, 1.3);

    /* --- back room -------------------------------------------------------- */
    place(lv, 'shelvingUnit', [2.4, 2.1], 4.7, 0, -8.6, -Math.PI * 0.5, [2.4, 2.1, 0.45], { solid: true });
    place(lv, 'toolChest', [], 0.1, 0, -10.5, 0, [0.72, 0.98, 0.46], { solid: true });
    place(lv, 'crtMonitor', [17], -0.55, 0, -9.6, 0.7, [0.44, 0.42, 0.44], { solid: true });
    place(lv, 'crtMonitor', [15], -0.5, 0.44, -9.55, -0.4, [0.4, 0.38, 0.4], { solid: false });
    place(lv, 'pcTowerBeige', [], 0.9, 0, -9.9, 0.2, [0.2, 0.42, 0.45], { solid: true });
    place(lv, 'pcTowerBeige', [], 1.15, 0.43, -9.85, -0.3, [0.2, 0.42, 0.45], { solid: false });
    place(lv, 'trashCan', [], 4.5, 0, -6.7, 0, [0.34, 0.62, 0.34], { solid: true });
    place(lv, 'cableCoil', [], 3.4, 0, -10.4, 0.3, [0.26, 0.09, 0.26], { solid: false });
    addPoster(lv, 'safety', 0.6, 1.75, -10.88, 0, 0.5, 0.7, {});
    for (i = 0; i < 7; i++) {
      var bx = 1.4 + (i % 3) * 0.62 + r() * 0.12;
      var bz = -7.2 - Math.floor(i / 3) * 0.8;
      var by = (i === 6) ? 0.42 : 0;
      place(lv, 'cardboardBox', [0.42], bx, by, bz, r() * 0.7 - 0.35, [0.44, 0.42, 0.4], { solid: true });
    }
    crowbarEgg(lv, 2.6, 1.32, -10.86);

    /* --- dust, because nobody hoovers behind a workbench ------------------ */
    addMotes(lv, { x: 2.0, y: 0.15, z: -8.6, w: 5.5, h: 2.1, d: 4.6, count: 60, seed: 909, size: 0.016, opacity: 0.3 });

    return bench;
  }

  /* --- egg 4: the BSOD monitor ------------------------------------------- */
  function bsodEgg(lv, x, z) {
    place(lv, 'counter', [1.4], x, 0, z, 0, [1.4, 0.95, 0.6], { solid: true });
    var mon = place(lv, 'lcdMonitor', [22], x, 0.96, z + 0.05, 0, [0.52, 0.42, 0.18], { solid: false, id: 'bsodMonitor' });
    var twr = place(lv, 'pcTowerModern', [], x + 0.85, 0, z - 0.05, 0.2, [0.22, 0.45, 0.48], { solid: true, id: 'bsodTower' });

    var scr = makeScreen({ w: 320, h: 200, crt: false, glow: 0x2b57c8 });
    var mesh = scr.mesh(0.46, 0.29);
    mesh.position.set(x, 1.28, z + 0.14);
    mesh.renderOrder = 3;
    lv.root.add(mesh);

    var state = 0;   /* 0 bsod, 1 dimm out, 2 fixed */
    function draw() {
      var c = scr.ctx;
      if (!c) return;
      if (state === 0) {
        c.fillStyle = '#0b2ea8'; c.fillRect(0, 0, 320, 200);
        c.fillStyle = '#cfe0ff'; c.font = 'bold 12px monospace'; c.textBaseline = 'top';
        c.fillText('A problem has been detected and Windows has', 12, 26);
        c.fillText('been shut down to prevent damage.', 12, 40);
        c.fillText('MEMORY_MANAGEMENT', 12, 66);
        c.fillText('*** STOP: 0x0000001A (0x00041790,', 12, 92);
        c.fillText('    0xC0883000, 0x00000001, 0x00000000)', 12, 106);
        c.fillText('Beginning dump of physical memory...', 12, 138);
        c.fillText('Contact your system administrator.', 12, 158);
        c.fillStyle = '#8fb4ff';
        c.fillText('(that is you)', 12, 172);
      } else if (state === 1) {
        c.fillStyle = '#000000'; c.fillRect(0, 0, 320, 200);
        c.fillStyle = '#d8d8d8'; c.font = '12px monospace'; c.textBaseline = 'top';
        c.fillText('No boot device.', 12, 90);
      } else {
        c.fillStyle = '#04120a'; c.fillRect(0, 0, 320, 200);
        c.fillStyle = '#78ffae'; c.font = '12px monospace'; c.textBaseline = 'top';
        c.fillText('Memory test: 8192MB OK', 12, 60);
        c.fillText('Detecting IDE drives ... done', 12, 76);
        c.fillText('Booting.', 12, 100);
        c.fillStyle = '#f0a24b';
        c.fillText('It was never the software.', 12, 140);
      }
      scr.flush();
    }
    draw();

    addInteract(lv, {
      obj: twr,
      label: 'Reseat the RAM',
      radius: 2.0,
      onUse: function () {
        if (state === 0) {
          state = 1;
          sfx('caseOpen', null, 0.7);
          say('Steve', 'Out you come.', 1600, 'steve');
          hint('Now put it back. Firmly. Both clips.', 3600);
          draw();
        } else if (state === 1) {
          state = 2;
          sfx('latchClick', null, 0.8);
          lv.addTimer(function () { sfx('bootChime', null, 0.7); }, 0.5);
          say('Steve', 'Ninety per cent of a memory fault is a memory module that is only ninety per cent in.', 5200, 'steve');
          gotEgg('bsod');
          draw();
        }
      }
    });
    if (mon) mon.userData.bsod = true;
  }

  /* --- egg 8: percussive maintenance ------------------------------------- */
  function vendingEgg(lv, obj, key, ix, iy, iz) {
    if (!VEND_HITS[key]) VEND_HITS[key] = 0;
    var can = null;
    addInteract(lv, {
      obj: obj,
      at: [ix, iy, iz],
      label: 'Thump the machine',
      radius: 2.0,
      onUse: function (player, l, it) {
        VEND_HITS[key]++;
        sfx('metalDrag', null, 0.5);
        sfx('vendingThunk', null, 0.8);
        if (VEND_HITS[key] === 1) say('Steve', 'It owes me one pound twenty.', 2200, 'steve');
        else if (VEND_HITS[key] === 2) say('Steve', 'Nearly.', 1200, 'steve');
        else if (VEND_HITS[key] >= 3 && !can) {
          sfx('coinDrop', null, 0.9);
          can = place(lv, 'coffeeMug', [], ix - 0.25, 0.03, iz, 0, [0.07, 0.12, 0.07], { solid: false });
          if (can) can.scale.set(0.7, 1.1, 0.7);
          toast('One free Jolt.', 'can', 3000);
          say('Steve', 'Jolt. Still made. Somewhere.', 2600, 'steve');
          gotEgg('vending');
          it.label = 'Thump the machine (satisfied)';
        }
      }
    });
  }

  /* --- egg 6: TCP the fish ----------------------------------------------- */
  function tcpEgg(lv, tank) {
    var fish = new T.Mesh(boxGeo(0.08, 0.045, 0.03), M('ledAmber'));
    fish.position.set(-3.4, 1.18, 3.32);
    lv.root.add(fish);
    var t = 0, hidden = 0;
    lv.addUpdater(function (dt) {
      t += dt;
      if (hidden > 0) { hidden -= dt; fish.visible = false; return; }
      fish.visible = true;
      fish.position.x = -3.4 + Math.sin(t * 0.8) * 0.3;
      fish.position.y = 1.18 + Math.sin(t * 1.7) * 0.03;
      fish.rotation.y = Math.cos(t * 0.8) > 0 ? 0 : Math.PI;
    });
    addInteract(lv, {
      obj: tank,
      label: 'Look at the fish',
      radius: 1.9,
      onUse: function () {
        sfx('bubbles', null, 0.7);
        hidden = 2.6;
        say('Steve', 'That is TCP. He goes behind the castle when there is company. He always comes back.', 5000, 'steve');
        lv.addTimer(function () {
          sfx('bubbles', null, 0.4);
          toast('TCP came back.', 'fish', 2400);
          gotEgg('tcp');
        }, 2.8);
      }
    });
  }

  /* --- egg 7: hunter2 ----------------------------------------------------- */
  function hunter2Egg(lv, kbd, x, y, z) {
    var note = addNote(lv, x + 0.02, y + 0.005, z + 0.02, 0.3, { text: '*******' });
    note.visible = false;
    var lifted = false;
    addInteract(lv, {
      obj: kbd,
      label: 'Lift the keyboard',
      radius: 1.8,
      onUse: function (player, l, it) {
        if (!lifted) {
          lifted = true;
          note.visible = true;
          sfx('paperRustle', null, 0.6);
          it.label = 'Read the note';
          hint('There is always a note under the keyboard.', 3000);
        } else {
          say('Steve', 'It just says asterisks. Seven of them. She writes it down exactly as the screen shows it.', 5600, 'steve');
          lv.addTimer(function () { say('Steve', 'I have never had the heart to explain.', 2800, 'steve'); }, 5.8);
          gotEgg('hunter2');
        }
      }
    });
  }

  /* --- egg 5: DO NOT USE (RESERVED) --------------------------------------- */
  function crowbarEgg(lv, x, y, z) {
    var bar = place(lv, 'crowbar', [], x, y, z, 0, [0.06, 0.06, 0.9], { solid: false, id: 'crowbar' });
    addNote(lv, x, y + 0.22, z + 0.02, 0, { text: 'DO NOT USE (RESERVED)' });
    addInteract(lv, {
      obj: bar,
      label: 'Take the crowbar',
      radius: 2.0,
      onUse: function () {
        sfx('toolClink', null, 0.7);
        say('Steve', 'Reserved. It has been reserved since before I bought the place.', 4000, 'steve');
        lv.addTimer(function () { say('Steve', 'Feels wrong to be the one who finally uses it.', 3000, 'steve'); }, 4.2);
        gotEgg('crowbar');
      }
    });
  }

  /* --- egg 13: the clock -------------------------------------------------- */
  function clockEgg(lv, x, y, z) {
    var clock = place(lv, 'wallClock', [], x, y, z, 0, [0.3, 0.3, 0.06], { solid: false, id: 'wallClock' });
    var hits = 0;
    addInteract(lv, {
      obj: clock,
      label: 'Check the time',
      radius: 2.6,
      onUse: function () {
        hits++;
        sfx('clockTick', null, 0.8);
        if (hits === 1) say('Steve', 'Ten past four.', 1500, 'steve');
        else if (hits === 2) say('Steve', 'Still ten past four.', 1700, 'steve');
        else if (hits === 3) say('Steve', 'It has said ten past four since 2011.', 2600, 'steve');
        else if (hits === 4) say('Steve', 'I could fix it.', 1600, 'steve');
        else if (hits === 5) {
          say('Steve', 'There. Evening.', 1800, 'steve');
          if (lv.setMood) lv.setMood('dusk');
          sfx('whoosh', null, 0.5);
          toast('The light outside goes to dusk.', 'sun', 3200);
          gotEgg('clock');
        } else {
          say('Steve', 'That is as far as time goes in here.', 2600, 'steve');
        }
      }
    });
  }

  /* --- egg 14: the boombox ------------------------------------------------ */
  function boomboxEgg(lv, x, y, z) {
    var box = place(lv, 'boombox', [], x, y, z, 0.2, [0.52, 0.24, 0.18], { solid: false, id: 'boombox' });
    var STATIONS = [
      { t: 'shopIdle', n: 'KLBR 88.1 — Dust & Rhodes' },
      { t: 'travel', n: 'Nightline 101 — Departures' },
      { t: 'olegTheme', n: 'Longwave 3 — Something Low' },
      { t: 'epilogue', n: 'Community 96.4 — Tuesdays' }
    ];
    var st = -1, heard = {};
    addInteract(lv, {
      obj: box,
      label: 'Change station',
      radius: 2.2,
      onUse: function () {
        st++;
        sfx('click', null, 0.6);
        if (st >= STATIONS.length) {
          st = -1;
          music(lv.env.music || 'shopIdle', 600);
          toast('Off.', 'radio', 1600);
          return;
        }
        var s = STATIONS[st];
        heard[s.t] = 1;
        music(s.t, 400);
        toast(s.n, 'radio', 2800);
        var n = 0, k;
        for (k in heard) if (heard[k]) n++;
        if (n >= 4) gotEgg('boombox');
      }
    });
  }

  /* --- egg 10: the rubber duck -------------------------------------------- */
  function duckEgg(lv, x, y, z) {
    var duck = place(lv, 'rubberDuck', [], x, y, z, -0.5, [0.09, 0.09, 0.11], { solid: false, id: 'duck' });
    var said = 0;
    addInteract(lv, {
      obj: duck,
      label: 'Explain the problem to the duck',
      radius: 1.7,
      onUse: function () {
        said++;
        sfx('clickSoft', null, 0.5);
        if (said === 1) {
          say('Steve', 'Right. So it posts, it just will not hold the date.', 3200, 'steve');
          lv.addTimer(function () { say('Steve', 'Which means it is not the board, it is the—', 2400, 'steve'); }, 3.4);
          lv.addTimer(function () {
            say('Steve', '…battery. It is always the battery. Thank you.', 3200, 'steve');
            toast('The duck has solved it.', 'duck', 3000);
            if (lv.props.ellisTower) hint('The CMOS battery is a CR2032. Third bin from the left.', 4600);
            gotEgg('duck');
          }, 5.9);
        } else {
          say('Steve', 'You have done enough today.', 2200, 'steve');
        }
      }
    });
  }

  /* --- egg 11: 17 missed calls from MOM ----------------------------------- */
  function phoneEgg(lv, x, y, z) {
    var ph = place(lv, 'burnerPhone', [], x, y, z, 0.8, [0.07, 0.015, 0.14], { solid: false, id: 'stevePhone' });
    var seen = false;
    addInteract(lv, {
      obj: ph,
      label: 'Check your phone',
      radius: 1.7,
      onUse: function (player, l, it) {
        if (!seen) {
          seen = true;
          sfx('phoneBuzz', null, 0.7);
          toast('17 missed calls — MOM', 'phone', 4200);
          say('Steve', 'Seventeen. That is a Tuesday number.', 2800, 'steve');
          it.label = 'Call her back';
          hint('Call her back.', 3400);
        } else {
          sfx('phoneRing', null, 0.7);
          say('Steve', 'Hi Mum. No, I am at the shop. …Yes, still.', 4000, 'steve');
          lv.addTimer(function () { say('Steve', 'No, I ate. …I did. …A proper one.', 3400, 'steve'); }, 4.2);
          lv.addTimer(function () {
            say('Steve', 'I know. I will. Love you.', 2600, 'steve');
            gotEgg('mom');
          }, 7.8);
          it.label = 'Phone';
        }
      }
    });
  }

  /*__APPEND__*/

  STV.log('levels loaded');
})();

/* =====================================================================
 * 65_levelkit.js — shared construction kit for the levels.
 * Rooms, walls with openings, light rigs, NPCs, hold-actions, minigames,
 * restricted zones and the suspicion meter.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;
  var K = SG.kit = {};

  /* Lazy material resolver — art modules may load after this file. */
  function M(name, fallback) {
    if (SG.mat && typeof SG.mat[name] === 'function') {
      try {
        var m = SG.mat[name]();
        if (m) return m;
      } catch (e) { /* fall through to placeholder */ }
    }
    var f = new THREE.MeshStandardMaterial(fallback || { color: 0x8a8f96, roughness: 0.9 });
    f.userData.shared = true;
    return f;
  }
  K.M = M;

  function T(name, opts) {
    if (SG.tex && typeof SG.tex[name] === 'function') {
      try { return SG.tex[name](opts); } catch (e) { /* noop */ }
    }
    return null;
  }
  K.T = T;

  K.text = function (str, opts) {
    if (SG.tex && typeof SG.tex.text === 'function') {
      try { return SG.tex.text(str, opts); } catch (e) { /* noop */ }
    }
    return null;
  };

  /* Cheap cached box geometry — every wall segment in the game shares these
   * via scaling rather than allocating a new BoxGeometry each time. */
  var UNIT_BOX = null;
  K.unitBox = function () {
    if (!UNIT_BOX) UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
    return UNIT_BOX;
  };
  var UNIT_PLANE = null;
  K.unitPlane = function () {
    if (!UNIT_PLANE) UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
    return UNIT_PLANE;
  };

  /* A box built from the shared unit geometry. Position is the CENTRE. */
  K.box = function (parent, mat, cx, cy, cz, sx, sy, sz, yaw) {
    var m = new THREE.Mesh(K.unitBox(), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(cx, cy, cz);
    if (yaw) m.rotation.y = yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };

  K.plane = function (parent, mat, cx, cy, cz, sx, sz, rotX, yaw) {
    var m = new THREE.Mesh(K.unitPlane(), mat);
    m.scale.set(sx, sz, 1);
    m.rotation.x = rotX === undefined ? -Math.PI / 2 : rotX;
    if (yaw) m.rotation.z = yaw;
    m.position.set(cx, cy, cz);
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };

  /* ------------------------------------------------------------------ */
  /* Walls with openings                                                 */
  /* ------------------------------------------------------------------ */

  /* Build a straight wall running along X (yaw 0) or Z (yaw PI/2), with
   * rectangular openings cut out of it. `holes` are {at, w, y0, y1} in the
   * wall's own 1-D coordinate. Adds colliders for every segment. */
  K.wall = function (ctx, opts) {
    var mat = opts.mat || M('drywall', { color: 0xd9d4c8, roughness: 0.95 });
    var thick = opts.thick === undefined ? 0.16 : opts.thick;
    var h = opts.h === undefined ? 2.9 : opts.h;
    var a = opts.from, b = opts.to;          /* [x,z] endpoints */
    var dx = b[0] - a[0], dz = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dz * dz);
    var yaw = Math.atan2(dx, dz) - Math.PI / 2;
    var cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    var ux = dx / len, uz = dz / len;
    var g = new THREE.Group();
    g.name = opts.name || 'wall';

    var holes = (opts.holes || []).slice().sort(function (p, q) { return p.at - q.at; });
    var segs = [];
    var cursor = 0;
    holes.forEach(function (ho) {
      var s = ho.at - ho.w / 2, e = ho.at + ho.w / 2;
      if (s > cursor) segs.push({ s: cursor, e: s, y0: 0, y1: h });
      var y0 = ho.y0 === undefined ? 0 : ho.y0;
      var y1 = ho.y1 === undefined ? 2.05 : ho.y1;
      if (y0 > 0.001) segs.push({ s: s, e: e, y0: 0, y1: y0 });
      if (y1 < h - 0.001) segs.push({ s: s, e: e, y0: y1, y1: h });
      cursor = e;
    });
    if (cursor < len) segs.push({ s: cursor, e: len, y0: 0, y1: h });

    segs.forEach(function (sg) {
      var w = sg.e - sg.s;
      if (w <= 0.001) return;
      var mid = sg.s + w / 2;
      var px = a[0] + ux * mid, pz = a[1] + uz * mid;
      var py = (sg.y0 + sg.y1) / 2;
      var sy = sg.y1 - sg.y0;
      var m = new THREE.Mesh(K.unitBox(), mat);
      m.scale.set(w, sy, thick);
      m.position.set(px, py, pz);
      m.rotation.y = yaw;
      m.castShadow = opts.castShadow !== false;
      m.receiveShadow = true;
      g.add(m);
      ctx.box(px, py, pz, w, sy, thick, yaw, opts.tag || 'wall');
    });

    /* Door reveals so an opening does not read as a hole in cardboard. */
    holes.forEach(function (ho) {
      if (ho.noReveal) return;
      var px = a[0] + ux * ho.at, pz = a[1] + uz * ho.at;
      var y1 = ho.y1 === undefined ? 2.05 : ho.y1;
      var jam = M('steelPainted', { color: 0x6e7377, roughness: 0.6, metalness: 0.5 });
      var lm = new THREE.Mesh(K.unitBox(), jam);
      lm.scale.set(0.05, y1, thick + 0.02);
      lm.position.set(px - ux * ho.w / 2, y1 / 2, pz - uz * ho.w / 2);
      lm.rotation.y = yaw; g.add(lm);
      var rm = lm.clone();
      rm.position.set(px + ux * ho.w / 2, y1 / 2, pz + uz * ho.w / 2);
      g.add(rm);
      var hd = new THREE.Mesh(K.unitBox(), jam);
      hd.scale.set(ho.w + 0.1, 0.06, thick + 0.02);
      hd.position.set(px, y1, pz); hd.rotation.y = yaw; g.add(hd);
    });

    g.userData.yaw = yaw;
    g.userData.len = len;
    ctx.add(g);
    return g;
  };

  /* A rectangular room: floor, ceiling and four walls with optional openings.
   * openings: {n:[{at,w,...}], s:[], e:[], w:[]} where at is measured from the
   * wall's minimum coordinate. */
  K.room = function (ctx, opts) {
    var x0 = opts.x0, x1 = opts.x1, z0 = opts.z0, z1 = opts.z1;
    var h = opts.h === undefined ? 2.9 : opts.h;
    var y = opts.y || 0;
    var g = new THREE.Group();
    g.name = opts.name || 'room';

    var floorMat = opts.floorMat || M('concrete', { color: 0x6c6d70, roughness: 0.95 });
    var w = x1 - x0, d = z1 - z0;

    var floor = new THREE.Mesh(K.unitPlane(), floorMat);
    floor.scale.set(w, d, 1);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, y + 0.001, (z0 + z1) / 2);
    floor.receiveShadow = true;
    g.add(floor);
    ctx.box((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, w, 0.3, d, 0, opts.floorTag || 'floor');

    if (opts.ceiling !== false) {
      var ceilMat = opts.ceilMat || M('ceilingTile', { color: 0xdedbd2, roughness: 1 });
      var ceil = new THREE.Mesh(K.unitPlane(), ceilMat);
      ceil.scale.set(w, d, 1);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set((x0 + x1) / 2, y + h, (z0 + z1) / 2);
      ceil.receiveShadow = true;
      g.add(ceil);
      ctx.box((x0 + x1) / 2, y + h + 0.15, (z0 + z1) / 2, w, 0.3, d, 0, 'ceiling');
    }
    ctx.add(g);

    var op = opts.openings || {};
    var wm = opts.wallMat;
    var mk = function (from, to, holes, name) {
      return K.wall(ctx, {
        from: from, to: to, h: h, holes: holes || [], mat: wm,
        thick: opts.thick, name: name, tag: opts.wallTag
      });
    };
    var walls = {};
    if (opts.walls !== false) {
      if (opts.skip !== 'n') walls.n = mk([x0, z1], [x1, z1], op.n, 'wall_n');
      if (opts.skip !== 's') walls.s = mk([x1, z0], [x0, z0], op.s, 'wall_s');
      if (opts.skip !== 'e') walls.e = mk([x1, z1], [x1, z0], op.e, 'wall_e');
      if (opts.skip !== 'w') walls.w = mk([x0, z0], [x0, z1], op.w, 'wall_w');
    }
    g.userData.walls = walls;
    g.userData.bounds = { x0: x0, x1: x1, z0: z0, z1: z1, h: h, y: y };
    return g;
  };

  /* Skirting board — a two-centimetre detail that makes a room read as built
   * rather than extruded. */
  K.skirting = function (ctx, x0, x1, z0, z1, opts) {
    opts = opts || {};
    var mat = opts.mat || M('woodDark', { color: 0x3a2f26, roughness: 0.6 });
    var g = new THREE.Group();
    var hgt = opts.h || 0.11, t = 0.02, y = (opts.y || 0) + hgt / 2;
    K.box(g, mat, (x0 + x1) / 2, y, z0 + t, x1 - x0, hgt, t * 2);
    K.box(g, mat, (x0 + x1) / 2, y, z1 - t, x1 - x0, hgt, t * 2);
    K.box(g, mat, x0 + t, y, (z0 + z1) / 2, t * 2, hgt, z1 - z0);
    K.box(g, mat, x1 - t, y, (z0 + z1) / 2, t * 2, hgt, z1 - z0);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    ctx.add(g);
    return g;
  };

  /* ------------------------------------------------------------------ */
  /* Lighting rigs                                                       */
  /* ------------------------------------------------------------------ */

  /* Emissive fixture panels everywhere, but only a handful of real lights.
   * `real` is how many of the positions get an actual PointLight. */
  K.lightGrid = function (ctx, positions, opts) {
    opts = opts || {};
    var colour = opts.color === undefined ? 0xfff4e2 : opts.color;
    var g = new THREE.Group();
    g.name = 'lights';
    var fixMat = new THREE.MeshBasicMaterial({ color: colour });
    fixMat.userData.shared = true;
    var housing = M('steelPainted', { color: 0xdedede, roughness: 0.5, metalness: 0.3 });
    var real = opts.real === undefined ? SG.qpick(1, 2, 3) : opts.real;
    var step = Math.max(1, Math.floor(positions.length / Math.max(1, real)));

    positions.forEach(function (p, i) {
      var w = opts.w || 1.2, d = opts.d || 0.24;
      var y = p[1];
      var body = new THREE.Mesh(K.unitBox(), housing);
      body.scale.set(w + 0.06, 0.08, d + 0.06);
      body.position.set(p[0], y + 0.04, p[2]);
      if (p[3]) body.rotation.y = p[3];
      g.add(body);
      var panel = new THREE.Mesh(K.unitPlane(), fixMat);
      panel.scale.set(w, d, 1);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(p[0], y, p[2]);
      if (p[3]) panel.rotation.z = p[3];
      g.add(panel);

      if (i % step === 0 && real > 0) {
        var pl = new THREE.PointLight(colour, opts.intensity || 9, opts.dist || 9, 1.9);
        pl.position.set(p[0], y - 0.15, p[2]);
        pl.castShadow = opts.shadows !== false && SG.quality === 'high' && i === 0;
        if (pl.castShadow) {
          pl.shadow.mapSize.set(512, 512);
          pl.shadow.bias = -0.004;
        }
        g.add(pl);
      }
    });
    ctx.add(g);
    return g;
  };

  K.ambient = function (ctx, opts) {
    opts = opts || {};
    var hemi = new THREE.HemisphereLight(
      opts.sky === undefined ? 0xb8ccdd : opts.sky,
      opts.ground === undefined ? 0x3a3228 : opts.ground,
      opts.intensity === undefined ? 0.55 : opts.intensity);
    ctx.add(hemi);
    return hemi;
  };

  /* One shadow-casting key light per level. More than that on a phone is a
   * frame-rate cliff. */
  K.keyLight = function (ctx, pos, target, opts) {
    opts = opts || {};
    var l = new THREE.DirectionalLight(
      opts.color === undefined ? 0xffe9cc : opts.color,
      opts.intensity === undefined ? 1.6 : opts.intensity);
    l.position.set(pos[0], pos[1], pos[2]);
    if (target) l.target.position.set(target[0], target[1], target[2]);
    ctx.add(l.target);
    l.castShadow = SG.quality !== 'low';
    if (l.castShadow) {
      var r = opts.radius || 10;
      l.shadow.mapSize.set(SG.qpick(512, 1024, 2048), SG.qpick(512, 1024, 2048));
      l.shadow.camera.left = -r; l.shadow.camera.right = r;
      l.shadow.camera.top = r; l.shadow.camera.bottom = -r;
      l.shadow.camera.near = 0.5; l.shadow.camera.far = opts.far || 40;
      l.shadow.bias = -0.0015;
      l.shadow.normalBias = 0.02;
    }
    ctx.add(l);
    return l;
  };

  /* ------------------------------------------------------------------ */
  /* NPCs                                                                */
  /* ------------------------------------------------------------------ */

  K.npc = function (ctx, which, pos, yaw, opts) {
    opts = opts || {};
    var rig = null;
    if (SG.chars && typeof SG.chars[which] === 'function') {
      rig = SG.safe('chars.' + which, function () { return SG.chars[which](opts); }, null);
    }
    if (!rig) {
      /* Placeholder so a missing character never blocks a level. */
      var g = new THREE.Group();
      var body = K.box(g, M('cotton', { color: 0x556070, roughness: 0.9 }),
        0, 0.9, 0, 0.45, 1.8, 0.28);
      body.castShadow = true;
      rig = {
        root: g, bones: {}, height: 1.8,
        play: function () { }, update: function () { }, lookAt: function () { },
        setSpeed: function () { }, setMood: function () { }, speak: function () { },
        dispose: function () { }
      };
    }
    rig.root.position.set(pos[0], pos[1] || 0, pos[2]);
    rig.root.rotation.y = yaw || 0;
    ctx.add(rig.root);
    if (opts.clip !== false) rig.play(opts.clip || 'idle');
    ctx.every(function (dt) { rig.update(dt); });
    return rig;
  };

  /* Simple waypoint patrol with pauses and look-arounds. */
  K.patrol = function (ctx, rig, waypoints, opts) {
    opts = opts || {};
    var speed = opts.speed || 1.05;
    var i = 0, wait = opts.startDelay || 0, mode = 'walk';
    var pos = rig.root.position;
    var scratch = new THREE.Vector3();

    var state = {
      rig: rig, waypoints: waypoints, paused: false, alert: false,
      index: function () { return i; },
      goTo: function (p) { waypoints = [p]; i = 0; }
    };

    ctx.every(function (dt) {
      if (state.paused) { rig.setSpeed(0); return; }
      if (wait > 0) {
        wait -= dt;
        rig.setSpeed(0);
        if (mode === 'look') rig.play('lookAround', { loop: true });
        return;
      }
      if (mode === 'look') { mode = 'walk'; rig.play('walk'); }
      var w = waypoints[i];
      scratch.set(w[0] - pos.x, 0, w[2] - pos.z);
      var d = scratch.length();
      if (d < 0.28) {
        i = (i + 1) % waypoints.length;
        if (w[3]) { wait = w[3]; mode = w[4] ? 'look' : 'wait'; }
        return;
      }
      scratch.normalize();
      var sp = speed * (state.alert ? 1.7 : 1);
      pos.x += scratch.x * sp * dt;
      pos.z += scratch.z * sp * dt;
      rig.root.rotation.y = util.angleDamp(
        rig.root.rotation.y, Math.atan2(scratch.x, scratch.z), 7, dt);
      rig.setSpeed(sp);
    });
    return state;
  };

  /* ------------------------------------------------------------------ */
  /* Interaction sugar                                                   */
  /* ------------------------------------------------------------------ */

  /* Something you hold the button on for a while — unscrewing, splicing,
   * copying. Shows a progress bar and can be interrupted. */
  K.hold = function (ctx, opts) {
    var t = 0, active = false, doneOnce = false;
    var need = opts.seconds || 2;
    var it = ctx.interact({
      object: opts.object,
      label: opts.label,
      verb: opts.verb || 'Hold to work',
      radius: opts.radius || 1.7,
      condition: opts.condition,
      onUse: function () { /* handled in the updater */ }
    });

    ctx.every(function (dt) {
      if (doneOnce && opts.once !== false) return;
      var hovering = ctx._hover === it;
      var holding = hovering && SG.input && SG.input.down && SG.input.down('interact');
      if (holding) {
        if (!active) {
          active = true;
          if (opts.onStart) opts.onStart(ctx);
          if (opts.sfx) ctx.sfx(opts.sfx, { loop: true });
        }
        t += dt;
        if (SG.ui.hud) SG.ui.hud.progress(opts.label || 'Working', util.clamp(t / need, 0, 1));
        if (t >= need) {
          t = 0; active = false; doneOnce = true;
          if (SG.ui.hud) SG.ui.hud.progress(null, null);
          if (opts.sfxStop) ctx.sfx(opts.sfxStop);
          it.enabled = opts.repeat === true;
          SG.safe('hold.onDone', function () { opts.onDone(ctx, it); });
        }
      } else if (active || t > 0) {
        active = false;
        t = Math.max(0, t - dt * 2.2);
        if (SG.ui.hud) {
          SG.ui.hud.progress(t > 0.02 ? (opts.label || 'Working') : null,
            t > 0.02 ? util.clamp(t / need, 0, 1) : null);
        }
      }
    });
    return it;
  };

  /* A prop that can be picked up and shows in a small inventory strip. */
  K.pickup = function (ctx, opts) {
    return ctx.interact({
      object: opts.object,
      label: opts.label,
      verb: opts.verb || 'Take',
      radius: opts.radius || 1.5,
      once: true,
      condition: opts.condition,
      onUse: function () {
        if (opts.object && opts.hide !== false) opts.object.visible = false;
        ctx.sfx(opts.sfx || 'clipSnap', { vol: 0.6 });
        K.give(ctx, opts.item, opts.label);
        if (opts.onTake) opts.onTake(ctx);
      }
    });
  };

  K.give = function (ctx, item, label) {
    if (!item) return;
    ctx.state.flags['item.' + item] = true;
    if (label) ctx.toast('Picked up: ' + label, 'item');
  };
  K.has = function (ctx, item) { return !!ctx.state.flags['item.' + item]; };

  /* ------------------------------------------------------------------ */
  /* Screens                                                             */
  /* ------------------------------------------------------------------ */

  /* Attach an animated canvas texture to a mesh and tick it at 8 Hz. */
  K.screen = function (ctx, mesh, drawFn, opts) {
    opts = opts || {};
    var w = opts.w || 384, h = opts.h || 288;
    var s = null;
    if (SG.tex && SG.tex.screen) {
      s = SG.safe('tex.screen', function () { return SG.tex.screen(drawFn, w, h); }, null);
    }
    if (!s) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g2 = c.getContext('2d');
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      s = {
        texture: tex, canvas: c, ctx: g2,
        update: function (time) { drawFn(g2, w, h, time); tex.needsUpdate = true; }
      };
    }
    var mat = new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false });
    mat.userData.shared = false;
    if (mesh) mesh.material = mat;
    var acc = 0, time = 0;
    var rate = opts.hz ? 1 / opts.hz : 1 / 8;
    s.update(0);
    ctx.every(function (dt) {
      time += dt; acc += dt;
      if (acc < rate) return;
      acc = 0;
      s.update(time);
    });
    s.material = mat;
    s.setDraw = function (fn) { drawFn = fn; s.update(time); };
    return s;
  };

  /* House style for every in-world screen: phosphor on black, mono type. */
  K.termStyle = function (g, w, h, opts) {
    opts = opts || {};
    g.fillStyle = opts.bg || '#040806';
    g.fillRect(0, 0, w, h);
    g.font = (opts.size || 16) + 'px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'top';
    g.fillStyle = opts.fg || '#39d98a';
  };

  K.termLines = function (g, lines, x, y, lh, colour) {
    if (colour) g.fillStyle = colour;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === null || lines[i] === undefined) continue;
      g.fillText(String(lines[i]), x, y + i * lh);
    }
  };

  K.scanlines = function (g, w, h, alpha) {
    g.globalAlpha = alpha === undefined ? 0.16 : alpha;
    g.fillStyle = '#000';
    for (var y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.globalAlpha = 1;
  };

  /* ------------------------------------------------------------------ */
  /* Wire-splice minigame                                                */
  /* ------------------------------------------------------------------ */

  /* Used by the badge reader and the vault power feed. The player pairs
   * coloured wires; a wrong pair costs time and makes a spark. Works with a
   * single button, so it is identical on a phone. */
  K.wirePuzzle = function (ctx, opts) {
    opts = opts || {};
    var colours = opts.colours ||
      [0xd7263d, 0x2e86de, 0xf6c90e, 0x2ecc71, 0xffffff, 0x8e5a3a];
    var n = opts.pairs || 4;
    var root = new THREE.Group();
    root.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    root.rotation.y = opts.yaw || 0;
    ctx.add(root);

    var panel = K.box(root, M('steelBrushed', { color: 0x3f464c, roughness: 0.45, metalness: 0.9 }),
      0, 0, 0, 0.34, 0.26, 0.03);
    panel.receiveShadow = true;

    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    /* Deterministic shuffle so the puzzle is the same for everyone. */
    var rnd = util.rng(opts.seed || 1337);
    for (i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }

    var left = [], right = [], solved = [];
    var spacing = 0.2 / Math.max(1, n - 1);
    var y0 = 0.09;
    for (i = 0; i < n; i++) {
      var col = colours[i % colours.length];
      var lm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
      var a = K.box(root, lm, -0.12, y0 - i * spacing, 0.022, 0.05, 0.022, 0.022);
      var b = K.box(root, lm.clone(), 0.12, y0 - order.indexOf(i) * spacing, 0.022,
        0.05, 0.022, 0.022);
      b.material.color.setHex(col);
      a.userData.idx = i; b.userData.idx = i;
      left.push(a); right.push(b); solved.push(false);
    }

    var sel = 0, done = 0;
    var strand = [];

    function highlight() {
      for (var q = 0; q < n; q++) {
        var em = (q === sel && !solved[q]) ? 0.9 : 0.0;
        left[q].material.emissive = left[q].material.emissive || new THREE.Color();
        left[q].material.emissive.setHex(left[q].material.color.getHex());
        left[q].material.emissiveIntensity = em;
        right[q].material.emissive = right[q].material.emissive || new THREE.Color();
        right[q].material.emissive.setHex(right[q].material.color.getHex());
        right[q].material.emissiveIntensity = solved[q] ? 0.6 : 0;
      }
    }
    highlight();

    function joinWire(idx) {
      var a = left[idx].position, b = right[idx].position;
      var mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.03, 0.045);
      var curve = new THREE.CatmullRomCurve3([
        a.clone().setZ(0.03), mid, b.clone().setZ(0.03)]);
      var geo = new THREE.TubeGeometry(curve, 10, 0.006, 5, false);
      var m = new THREE.Mesh(geo, left[idx].material);
      root.add(m);
      strand.push(m);
    }

    var it = ctx.interact({
      object: panel,
      label: opts.label || 'Splice the loom',
      verb: 'Connect',
      radius: opts.radius || 1.5,
      condition: opts.condition,
      onUse: function () {
        /* One button: each press advances to the next unsolved wire and, on
         * the second press, commits the connection. Simple, tactile, and it
         * plays the same with a thumb as with a keyboard. */
        if (!solved[sel]) {
          solved[sel] = true;
          done++;
          joinWire(sel);
          ctx.sfx('relayClick', { vol: 0.7, rate: 1 + done * 0.06 });
        }
        var guard = 0;
        do { sel = (sel + 1) % n; guard++; } while (solved[sel] && guard <= n);
        highlight();
        if (done >= n) {
          it.enabled = false;
          ctx.sfx('badgeAccept');
          if (opts.onSolved) SG.safe('wire.onSolved', function () { opts.onSolved(ctx); });
        } else if (opts.onStep) {
          opts.onStep(ctx, done, n);
        }
      }
    });

    return { root: root, panel: panel, interact: it, progress: function () { return done / n; } };
  };

  /* ------------------------------------------------------------------ */
  /* Restricted zones + suspicion                                        */
  /* ------------------------------------------------------------------ */

  /* Detection that does not punish curiosity: guards notice you if you run,
   * crouch-skulk, or stand in a place staff have no reason to be. Walking
   * normally through a hotel in coveralls is, correctly, invisible. */
  K.suspicion = function (ctx, opts) {
    opts = opts || {};
    var S = {
      value: 0,
      zones: [],
      watchers: [],
      enabled: true,
      onCaught: opts.onCaught || function () { },
      rate: opts.rate || 0.34,
      decay: opts.decay || 0.28
    };

    S.zone = function (x0, z0, x1, z1, weight) {
      S.zones.push({ x0: x0, z0: z0, x1: x1, z1: z1, w: weight === undefined ? 1 : weight });
    };
    S.watcher = function (rig, opts2) {
      opts2 = opts2 || {};
      S.watchers.push({
        rig: rig, range: opts2.range || 9, fov: (opts2.fov || 100) * util.DEG,
        weight: opts2.weight === undefined ? 1 : opts2.weight
      });
    };

    var p = new THREE.Vector3(), toP = new THREE.Vector3(), fwd = new THREE.Vector3();
    var caught = false, lastBark = 0;

    ctx.every(function (dt) {
      if (!S.enabled || caught || !ctx.player) return;
      ctx.player.getPosition(p);

      var zoneW = 0;
      for (var i = 0; i < S.zones.length; i++) {
        var z = S.zones[i];
        if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) {
          zoneW = Math.max(zoneW, z.w);
        }
      }

      var seen = 0;
      for (i = 0; i < S.watchers.length; i++) {
        var wch = S.watchers[i];
        var r = wch.rig.root;
        toP.copy(p).sub(r.position); toP.y = 0;
        var d = toP.length();
        if (d > wch.range || d < 0.001) continue;
        toP.divideScalar(d);
        fwd.set(Math.sin(r.rotation.y), 0, Math.cos(r.rotation.y));
        var dot = fwd.dot(toP);
        if (dot < Math.cos(wch.fov / 2)) continue;
        if (SG.phys.world && SG.phys.world.raycast) {
          var hit = SG.phys.world.raycast(
            new THREE.Vector3(r.position.x, 1.55, r.position.z), toP, d - 0.35);
          if (hit && hit.tag !== 'floor') continue;
        }
        seen = Math.max(seen, wch.weight * (1 - d / wch.range) * (0.4 + dot * 0.6));
      }

      var speed = ctx.player.getSpeed ? ctx.player.getSpeed() : 0;
      var running = speed > 2.4 ? 1 : 0;
      var skulking = ctx.player.isCrouching && ctx.player.isCrouching() ? 0.5 : 0;
      var gain = seen * (zoneW * 1.0 + running * 0.9 + skulking * 0.5);

      if (gain > 0.02) S.value = util.clamp(S.value + gain * S.rate * dt, 0, 1);
      else S.value = util.clamp(S.value - S.decay * dt, 0, 1);

      if (SG.ui.hud && SG.ui.hud.progress && opts.showMeter !== false) {
        if (S.value > 0.03) SG.ui.hud.progress('Noticed', S.value);
        else SG.ui.hud.progress(null, null);
      }

      if (S.value > 0.45 && ctx.t - lastBark > 8) {
        lastBark = ctx.t;
        if (opts.bark) ctx.say(opts.bark);
      }
      if (S.value >= 1 && !caught) {
        caught = true;
        if (SG.ui.hud) SG.ui.hud.progress(null, null);
        SG.safe('suspicion.caught', function () { S.onCaught(ctx); });
      }
    });

    S.reset = function () { S.value = 0; caught = false; };
    return S;
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers levels reach for constantly                           */
  /* ------------------------------------------------------------------ */

  K.at = function (obj, x, y, z, yaw) {
    if (!obj) return obj;
    obj.position.set(x, y || 0, z);
    if (yaw) obj.rotation.y = yaw;
    return obj;
  };

  /* Invisible interaction anchor — for interacting with a spot rather than a
   * prop (a doorway, a patch of floor, a person). */
  K.anchor = function (ctx, x, y, z) {
    var a = new THREE.Object3D();
    a.position.set(x, y, z);
    ctx.add(a);
    return a;
  };

  K.marker = function (ctx, x, y, z, colour) {
    /* A soft floor decal that says "go here" without a floating arrow. */
    var mat = new THREE.MeshBasicMaterial({
      color: colour === undefined ? 0x39d98a : colour,
      transparent: true, opacity: 0.22, depthWrite: false
    });
    var m = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.02, z);
    ctx.add(m);
    var t = 0;
    ctx.every(function (dt) {
      t += dt;
      mat.opacity = 0.14 + Math.sin(t * 2.2) * 0.09;
      m.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
    });
    return m;
  };

  /* A door that swings. Returns {group, open(), close(), toggle(), isOpen} */
  K.door = function (ctx, opts) {
    var g = new THREE.Group();
    g.position.set(opts.pos[0], opts.pos[1] || 0, opts.pos[2]);
    g.rotation.y = opts.yaw || 0;
    ctx.add(g);
    var w = opts.w || 0.92, h = opts.h || 2.05, t = opts.thick || 0.045;
    var leaf = new THREE.Group();
    leaf.position.x = -w / 2;
    g.add(leaf);
    var mat = opts.mat || M('doorPaint', { color: 0x8d8f92, roughness: 0.65 });
    var slab = K.box(leaf, mat, w / 2, h / 2, 0, w, h, t);
    if (opts.handle !== false) {
      var hm = M('chrome', { color: 0xcfd4d8, roughness: 0.25, metalness: 1 });
      K.box(leaf, hm, w - 0.09, 1.05, t / 2 + 0.02, 0.11, 0.026, 0.026);
      K.box(leaf, hm, w - 0.09, 1.05, -t / 2 - 0.02, 0.11, 0.026, 0.026);
    }
    var colliderId = ctx.box(opts.pos[0], h / 2, opts.pos[2], w, h, t + 0.1,
      opts.yaw || 0, opts.tag || 'door');

    var state = { isOpen: false, group: g, leaf: leaf, slab: slab, target: 0, angle: 0 };
    state.open = function () {
      if (state.isOpen) return;
      state.isOpen = true;
      state.target = (opts.swing || 1) * Math.PI * 0.52;
      if (SG.phys.world && SG.phys.world.setEnabled) SG.phys.world.setEnabled(colliderId, false);
      ctx.sfx(opts.sfx || 'doorOpen');
    };
    state.close = function () {
      if (!state.isOpen) return;
      state.isOpen = false;
      state.target = 0;
      if (SG.phys.world && SG.phys.world.setEnabled) SG.phys.world.setEnabled(colliderId, true);
      ctx.sfx(opts.sfxClose || 'doorClose');
    };
    state.toggle = function () { if (state.isOpen) state.close(); else state.open(); };

    ctx.every(function (dt) {
      if (Math.abs(state.angle - state.target) < 0.001) return;
      state.angle = util.damp(state.angle, state.target, 6, dt);
      leaf.rotation.y = state.angle;
    });

    if (opts.interact !== false) {
      ctx.interact({
        object: slab,
        label: opts.label || 'Door',
        verb: 'Open',
        radius: 1.7,
        condition: opts.condition,
        onUse: function () {
          if (opts.onUse) { opts.onUse(ctx, state); return; }
          state.toggle();
        }
      });
    }
    return state;
  };

  /* Particle-free dust motes: a single Points cloud with a shared sprite.
   * One draw call, and it does more for a room's air than any light. */
  K.motes = function (ctx, opts) {
    opts = opts || {};
    if (SG.quality === 'low') return null;
    var n = opts.count || 140;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var seed = util.rng(opts.seed || 7);
    var b = opts.bounds || { x: 5, y: 2.6, z: 4, cx: 0, cy: 1.3, cz: 0 };
    for (var i = 0; i < n; i++) {
      pos[i * 3] = b.cx + (seed() - 0.5) * b.x * 2;
      pos[i * 3 + 1] = b.cy + (seed() - 0.5) * b.y;
      pos[i * 3 + 2] = b.cz + (seed() - 0.5) * b.z * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: opts.color === undefined ? 0xfff0d8 : opts.color,
      size: opts.size || 0.016, transparent: true, opacity: 0.5,
      depthWrite: false, sizeAttenuation: true,
      map: T('particleSoft'), blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    ctx.add(pts);
    var t = 0;
    var attr = geo.attributes.position;
    ctx.every(function (dt) {
      t += dt;
      if (SG.engine.frame % 3 !== 0) return;   /* 20 Hz is plenty for dust */
      for (var k = 0; k < n; k++) {
        var y = attr.array[k * 3 + 1] + dt * 3 * (0.006 + (k % 7) * 0.001);
        if (y > b.cy + b.y / 2) y = b.cy - b.y / 2;
        attr.array[k * 3 + 1] = y;
        attr.array[k * 3] += Math.sin(t * 0.35 + k) * 0.0009;
      }
      attr.needsUpdate = true;
    });
    return pts;
  };

  /* Merge a group of decorative meshes into one draw call and drop it in. */
  K.freeze = function (ctx, group) {
    var merged = SG.safe('mergeGroup', function () {
      return util.mergeGroup(group);
    }, group);
    ctx.add(merged);
    return merged;
  };

})(window.SG, window.THREE);

/* =====================================================================
 * 34_models_fill.js — the remaining props.
 *
 * Everything the five levels reach for that the earlier model files do not
 * already provide. Real dimensions in metres, low segment counts, shared
 * geometry, and the userData hooks the levels animate through.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var MODELS = SG.models;
  var util = SG.util;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function M(name, fallback) {
    if (SG.mat && typeof SG.mat[name] === 'function') {
      try { var m = SG.mat[name](); if (m) return m; } catch (e) { /* fall through */ }
    }
    var f = new THREE.MeshStandardMaterial(fallback || { color: 0x9aa0a6, roughness: 0.85 });
    f.userData.shared = true;
    return f;
  }

  function C(hex, rough, metal) {
    var key = 'c' + hex + '_' + (rough || 0.8) + '_' + (metal || 0);
    if (!cacheMat[key]) {
      var m = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough === undefined ? 0.8 : rough,
        metalness: metal === undefined ? 0 : metal
      });
      m.userData.shared = true;
      cacheMat[key] = m;
    }
    return cacheMat[key];
  }
  var cacheMat = {};

  function EM(hex, intensity) {
    var key = 'e' + hex + '_' + (intensity || 1);
    if (!cacheMat[key]) {
      var m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
      m.userData.shared = true;
      cacheMat[key] = m;
    }
    return cacheMat[key];
  }

  var BOX = null, CYL = {}, SPH = null, PLN = null;
  function boxGeo() { return BOX || (BOX = new THREE.BoxGeometry(1, 1, 1)); }
  function cylGeo(seg) {
    seg = seg || 10;
    return CYL[seg] || (CYL[seg] = new THREE.CylinderGeometry(0.5, 0.5, 1, seg));
  }
  function sphGeo() { return SPH || (SPH = new THREE.SphereGeometry(0.5, 12, 8)); }
  function plnGeo() { return PLN || (PLN = new THREE.PlaneGeometry(1, 1)); }

  /* Box: centre position, full size. */
  function B(p, mat, x, y, z, sx, sy, sz, ry) {
    var m = new THREE.Mesh(boxGeo(), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    if (p) p.add(m);
    return m;
  }

  /* Cylinder along Y by default; axis 'x'|'z' rotates it. */
  function CYm(p, mat, x, y, z, r, h, seg, axis) {
    var m = new THREE.Mesh(cylGeo(seg || 10), mat);
    m.scale.set(r * 2, h, r * 2);
    m.position.set(x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.castShadow = true; m.receiveShadow = true;
    if (p) p.add(m);
    return m;
  }

  function SP(p, mat, x, y, z, r) {
    var m = new THREE.Mesh(sphGeo(), mat);
    m.scale.setScalar(r * 2);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (p) p.add(m);
    return m;
  }

  /* Flat quad, used for labels and decals. */
  function QD(p, mat, x, y, z, w, h, rx, ry) {
    var m = new THREE.Mesh(plnGeo(), mat);
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (p) p.add(m);
    return m;
  }

  function label(text, opts) {
    if (SG.tex && SG.tex.text) {
      try { return SG.tex.text(text, opts); } catch (e) { /* noop */ }
    }
    return null;
  }

  function decalMat(tex) {
    if (!tex) return null;
    var m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2
    });
    return m;
  }

  function done(g, name) {
    g.name = name;
    util.measure(g);
    return g;
  }

  function pts(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      out.push(p && p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Runs — pipes, conduit, duct, tray, fibre                            */
  /* ------------------------------------------------------------------ */

  function tube(points, r, mat, radial, collars) {
    var g = new THREE.Group();
    var P = pts(points);
    if (P.length < 2) return g;
    var curve = new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.2);
    var seg = Math.max(8, Math.min(60, P.length * 8));
    var geo = new THREE.TubeGeometry(curve, seg, r, radial || 7, false);
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    if (collars !== false) {
      for (var i = 1; i < P.length - 1; i++) {
        var c = CYm(g, mat, P[i].x, P[i].y, P[i].z, r * 1.35, r * 1.1, 8);
        c.castShadow = false;
      }
    }
    return g;
  }

  MODELS.pipeRun = function (points, opts) {
    opts = opts || {};
    var g = tube(points, opts.r || 0.05,
      opts.mat || C(opts.color === undefined ? 0x7b7f84 : opts.color, 0.45, 0.85), 8);
    return done(g, 'pipeRun');
  };

  MODELS.conduitRun = function (points, opts) {
    opts = opts || {};
    var g = tube(points, opts.r || 0.028, opts.mat || C(0x5f6469, 0.55, 0.7), 6);
    return done(g, 'conduitRun');
  };

  MODELS.ductRun = function (points, opts) {
    opts = opts || {};
    var g = tube(points, opts.r || 0.25, opts.mat || C(0xa9adb1, 0.62, 0.55), 8);
    /* Ribs — a duct without ribs looks like a sausage. */
    var P = pts(points);
    if (P.length >= 2) {
      var curve = new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.2);
      var n = Math.min(24, Math.max(3, Math.round(curve.getLength() / 0.9)));
      for (var i = 1; i < n; i++) {
        var p = curve.getPointAt(i / n);
        var rib = CYm(g, C(0x9aa0a4, 0.55, 0.6), p.x, p.y, p.z,
          (opts.r || 0.25) * 1.09, 0.035, 10);
        rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          curve.getTangentAt(i / n));
        rib.castShadow = false;
      }
    }
    return done(g, 'ductRun');
  };

  MODELS.cableTray = function (points, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var P = pts(points);
    var w = opts.w || 0.3;
    var mat = C(0x83888d, 0.5, 0.8);
    for (var i = 0; i < P.length - 1; i++) {
      var a = P[i], b = P[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
      var yaw = Math.atan2(dx, dz);
      var base = B(g, mat, mx, my, mz, w, 0.012, len, yaw);
      base.castShadow = false;
      B(g, mat, mx, my + 0.035, mz, 0.012, 0.07, len, yaw)
        .translateX(-w / 2);
      B(g, mat, mx, my + 0.035, mz, 0.012, 0.07, len, yaw)
        .translateX(w / 2);
      /* The cables nobody ever removed. */
      var bundle = CYm(g, C(0x22242a, 0.85), mx, my + 0.045, mz, w * 0.28, len, 7, 'z');
      bundle.rotation.y = yaw;
      bundle.castShadow = false;
      var bundle2 = CYm(g, C(0x2f3a52, 0.85), mx + Math.cos(yaw) * w * 0.22,
        my + 0.04, mz - Math.sin(yaw) * w * 0.22, w * 0.19, len, 6, 'z');
      bundle2.rotation.y = yaw;
      bundle2.castShadow = false;
    }
    return done(g, 'cableTray');
  };

  MODELS.fiberBundle = function (points, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var cols = [0xffd23f, 0xff7a3d, 0x3fb6ff];
    for (var k = 0; k < 3; k++) {
      var off = (k - 1) * 0.022;
      var P = pts(points).map(function (p) {
        return new THREE.Vector3(p.x + off, p.y + off * 0.6, p.z);
      });
      g.add(tube(P, opts.r ? opts.r / 3 : 0.009, C(cols[k], 0.4), 5, false));
    }
    return done(g, 'fiberBundle');
  };

  /* ------------------------------------------------------------------ */
  /* Shop — the hero machines                                            */
  /* ------------------------------------------------------------------ */

  function caseShell(g, beige, w, h, d, openSide) {
    var body = beige ? C(0xd6cdb4, 0.72) : C(0x2a2c30, 0.55);
    B(g, body, 0, h / 2, -d * 0.02, w, h, d);
    /* Front bezel, slightly proud. */
    B(g, beige ? C(0xdcd3ba, 0.7) : C(0x232529, 0.5), 0, h / 2, d / 2, w * 0.99, h * 0.99, 0.02);
    /* Feet. */
    var fm = C(0x1a1a1c, 0.9);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      B(g, fm, s[0] * (w / 2 - 0.03), 0.008, s[1] * (d / 2 - 0.04), 0.03, 0.016, 0.03);
    });
    if (openSide) {
      /* Interior back plane so you are not looking at nothing. */
      B(g, C(0x4a4c50, 0.75, 0.4), -w / 2 + 0.012, h / 2, -d * 0.02, 0.008, h * 0.95, d * 0.95);
    }
    return body;
  }

  MODELS.pcTowerOpen = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var w = 0.19, h = 0.45, d = 0.45;
    caseShell(g, opts.beige !== false, w, h, d, true);

    var parts = {};

    /* Motherboard, on the far side panel. */
    var mobo = null;
    if (MODELS.motherboard) {
      mobo = MODELS.motherboard({ small: true });
      if (mobo) {
        mobo.rotation.z = Math.PI / 2;
        mobo.rotation.y = Math.PI / 2;
        mobo.position.set(-w / 2 + 0.028, h * 0.52, -0.02);
        mobo.scale.setScalar(0.92);
        g.add(mobo);
      }
    }
    if (!mobo) {
      mobo = B(g, C(0x1f4d2e, 0.7), -w / 2 + 0.03, h * 0.52, -0.02, 0.006, 0.3, 0.28);
    }
    parts.mobo = mobo;

    /* RAM. */
    var ram = new THREE.Group();
    for (var i = 0; i < 2; i++) {
      var stick = MODELS.ramStick ? MODELS.ramStick({}) : null;
      if (stick) {
        stick.rotation.z = Math.PI / 2;
        stick.position.set(-w / 2 + 0.045, h * 0.66, 0.04 + i * 0.02);
        ram.add(stick);
      } else {
        B(ram, C(0x1c5b3a, 0.6), -w / 2 + 0.045, h * 0.66, 0.04 + i * 0.02, 0.008, 0.13, 0.014);
      }
    }
    g.add(ram);
    parts.ram = ram;

    /* GPU, and the bent slot cover beside it. */
    var gpu = MODELS.gpuCard ? MODELS.gpuCard({}) : null;
    if (gpu) {
      gpu.rotation.y = Math.PI / 2;
      gpu.position.set(-w / 2 + 0.055, h * 0.44, 0.02);
      gpu.scale.setScalar(0.85);
      g.add(gpu);
    } else {
      gpu = B(g, C(0x18181c, 0.55), -w / 2 + 0.055, h * 0.44, 0.02, 0.02, 0.1, 0.2);
    }
    parts.gpu = gpu;
    var bent = B(g, C(0x9fa4a8, 0.45, 0.9), -w / 2 + 0.05, h * 0.33, -d / 2 + 0.02,
      0.012, 0.075, 0.016);
    bent.rotation.x = 0.28;

    /* PSU, top rear, with the 24-pin loom. */
    var psu = MODELS.psu ? MODELS.psu({}) : null;
    if (psu) {
      psu.scale.setScalar(0.85);
      psu.position.set(0, h - 0.075, -d / 2 + 0.09);
      g.add(psu);
    } else {
      psu = B(g, C(0x3b3d41, 0.5, 0.6), 0, h - 0.075, -d / 2 + 0.09, w * 0.85, 0.085, 0.15);
    }
    parts.psu = psu;
    var loom = tube([
      [0.02, h - 0.12, -d / 2 + 0.13], [0.0, h * 0.72, -0.02],
      [-0.03, h * 0.6, 0.04], [-w / 2 + 0.05, h * 0.58, 0.06]
    ], 0.012, C(0x1b1c20, 0.85), 6, false);
    g.add(loom);

    /* Drive cage + a 3.5" disk. */
    B(g, C(0x8f959a, 0.5, 0.8), 0.01, h * 0.24, d / 2 - 0.12, w * 0.8, 0.11, 0.16);
    var hdd = MODELS.hdd ? MODELS.hdd({}) : null;
    if (hdd) { hdd.position.set(0.01, h * 0.24, d / 2 - 0.12); g.add(hdd); }

    /* The coin cell, in a holder you can actually reach. */
    var holder = B(g, C(0xc9ced2, 0.4, 0.85), -w / 2 + 0.042, h * 0.5, -0.13,
      0.012, 0.026, 0.026);
    var cell = MODELS.cr2032 ? MODELS.cr2032({}) : null;
    if (cell) {
      cell.rotation.z = Math.PI / 2;
      cell.position.set(-w / 2 + 0.052, h * 0.5, -0.13);
      g.add(cell);
    } else {
      cell = CYm(g, C(0xd8dce0, 0.3, 1), -w / 2 + 0.052, h * 0.5, -0.13, 0.010, 0.0032, 12, 'x');
    }
    cell.name = 'battery';
    parts.battery = cell;

    /* Dust in the intake, because it is twenty-two years old. */
    for (var dq = 0; dq < 5; dq++) {
      var db = SP(g, C(0x6a6355, 1), -0.02 + dq * 0.01, 0.03 + (dq % 2) * 0.012,
        d / 2 - 0.05, 0.008 + (dq % 3) * 0.003);
      db.scale.y *= 0.5;
      db.castShadow = false;
    }

    /* The side panel, lifted away. This is the child the level animates. */
    var panel = new THREE.Group();
    var pm = B(panel, opts.beige !== false ? C(0xd2c9b0, 0.72) : C(0x2a2c30, 0.5),
      0, 0, 0, 0.008, h * 0.96, d * 0.95);
    B(panel, C(0xb9b1a0, 0.7), 0, 0, d * 0.4, 0.01, h * 0.3, 0.012);
    panel.position.set(-w / 2 - 0.09, h * 0.52, 0.06);
    panel.rotation.z = -0.12;
    panel.name = 'panel';
    g.add(panel);
    parts.panel = panel;

    g.userData.parts = parts;
    return done(g, 'pcTowerOpen');
  };

  MODELS.pcTowerGaming = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var w = 0.21, h = 0.48, d = 0.47;
    caseShell(g, false, w, h, d, false);
    /* Tempered side window with something glowing behind it. */
    var glass = B(g, new THREE.MeshStandardMaterial({
      color: 0x8fb6c8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.25
    }), -w / 2 - 0.002, h * 0.55, 0.02, 0.006, h * 0.7, d * 0.7);
    glass.castShadow = false;
    B(g, EM(0x9b5cff), -w / 2 + 0.03, h * 0.55, 0.02, 0.004, h * 0.5, d * 0.5);
    /* Front fans. */
    for (var i = 0; i < 2; i++) {
      var f = CYm(g, EM(0x36e0ff), 0, h * 0.3 + i * 0.14, d / 2 + 0.004, 0.055, 0.006, 12, 'z');
      f.castShadow = false;
    }
    return done(g, 'pcTowerGaming');
  };

  MODELS.crtMonitor = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var beige = C(0xd9d0b6, 0.74);
    var beigeYellow = C(0xcfc29e, 0.76);

    /* The fat back. */
    var back = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.185, 0.30, 4, 1),
      beigeYellow);
    back.rotation.x = Math.PI / 2;
    back.rotation.y = Math.PI / 4;
    back.position.set(0, 0.245, -0.16);
    back.castShadow = true;
    g.add(back);

    /* The front bezel. */
    B(g, beige, 0, 0.245, 0.005, 0.40, 0.385, 0.30);
    /* Vents on top. */
    for (var v = 0; v < 7; v++) {
      var sl = B(g, C(0xb9b09a, 0.8), -0.13 + v * 0.043, 0.437, -0.05, 0.03, 0.006, 0.13);
      sl.castShadow = false;
    }

    /* Curved glass. A flat plane here is what makes a CRT look fake. */
    var glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x11141a, roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.45
      }));
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, 0.245, 0.155);
    glass.scale.set(0.78, 1, 0.72);
    glass.castShadow = false;
    g.add(glass);

    /* The phosphor plane the level swaps a live canvas onto. */
    var screen = new THREE.Mesh(plnGeo(), C(0x0a1210, 1));
    screen.scale.set(0.30, 0.228, 1);
    screen.position.set(0, 0.247, 0.152);
    screen.name = 'screen';
    g.add(screen);
    g.userData.screen = screen;

    /* Chin, buttons, LED. */
    B(g, beige, 0, 0.055, 0.05, 0.40, 0.09, 0.30);
    for (var b = 0; b < 4; b++) {
      B(g, C(0xc4bca6, 0.7), -0.11 + b * 0.045, 0.052, 0.152, 0.028, 0.014, 0.012);
    }
    var led = B(g, EM(0x4dff88), 0.15, 0.052, 0.153, 0.012, 0.008, 0.008);
    led.castShadow = false;
    g.userData.parts = { screen: screen, led: led };

    /* Stand. */
    CYm(g, beigeYellow, 0, 0.012, -0.02, 0.115, 0.024, 12);
    return done(g, 'crtMonitor');
  };

  MODELS.keyboardBeige = function (opts) {
    var g = new THREE.Group();
    var base = C(0xd7cfb8, 0.76);
    B(g, base, 0, 0.012, 0, 0.45, 0.024, 0.16);
    /* Slight back rake, like every keyboard ever made. */
    var deck = B(g, C(0xd2c9b0, 0.74), 0, 0.026, -0.005, 0.44, 0.012, 0.15);
    deck.rotation.x = -0.05;

    var cap = C(0xe0d8c2, 0.72);
    var capDark = C(0xc3baa4, 0.72);
    var kw = 0.0165, kh = 0.008, gap = 0.0025;
    for (var r = 0; r < 5; r++) {
      var cols = [13, 13, 13, 12, 8];
      var startX = -0.205 + (r === 4 ? 0.02 : 0);
      for (var c = 0; c < cols[r]; c++) {
        var wide = (r === 4 && c === 4) ? 5.5 : 1;
        var k = B(g, (r === 0 || (r === 4 && c > 5)) ? capDark : cap,
          startX + c * (kw + gap) * (r === 4 && c > 4 ? 3 : 1) + (wide > 1 ? 0.03 : 0),
          0.034 + (4 - r) * 0.0012,
          -0.052 + r * 0.0225,
          kw * wide, kh, kw * 0.92);
        k.castShadow = false;
      }
    }
    /* Yellowed wrist area — the tell of an old keyboard. */
    var worn = B(g, C(0xcbbf9c, 0.8), 0, 0.0255, 0.062, 0.44, 0.006, 0.03);
    worn.castShadow = false;
    /* The coiled PS/2 lead. */
    g.add(tube([[0, 0.012, -0.08], [0.02, 0.02, -0.14], [-0.03, 0.01, -0.22],
    [0.02, 0.008, -0.3]], 0.004, C(0xc9c0aa, 0.8), 5, false));
    return done(g, 'keyboardBeige');
  };

  MODELS.mouseBall = function () {
    var g = new THREE.Group();
    var body = new THREE.Mesh(sphGeo(), C(0xd7cfb8, 0.7));
    body.scale.set(0.062, 0.036, 0.098);
    body.position.set(0, 0.018, 0);
    body.castShadow = true;
    g.add(body);
    B(g, C(0xcbc2ab, 0.68), -0.014, 0.034, -0.028, 0.024, 0.006, 0.036);
    B(g, C(0xcbc2ab, 0.68), 0.014, 0.034, -0.028, 0.024, 0.006, 0.036);
    g.add(tube([[0, 0.02, -0.05], [0.01, 0.016, -0.12], [-0.02, 0.008, -0.2]],
      0.0035, C(0xc9c0aa, 0.8), 5, false));
    return done(g, 'mouseBall');
  };

  MODELS.laptopOld = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var body = C(0x2b2b2d, 0.68);
    B(g, body, 0, 0.016, 0, 0.33, 0.032, 0.26);
    B(g, C(0x212123, 0.7), 0, 0.034, -0.02, 0.28, 0.004, 0.16);
    SP(g, C(0xd23b3b, 0.5), 0, 0.037, -0.02, 0.006);   /* trackpoint */
    var lid = new THREE.Group();
    B(lid, body, 0, 0.11, 0, 0.33, 0.22, 0.012);
    B(lid, C(0x10161c, 0.35), 0, 0.11, 0.008, 0.29, 0.19, 0.002);
    lid.position.z = -0.13;
    lid.rotation.x = opts.open === false ? -1.55 : -0.28;
    g.add(lid);
    g.userData.parts = { lid: lid };
    return done(g, 'laptopOld');
  };

  MODELS.laptopModern = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var alu = C(0xb8bcc0, 0.34, 0.95);
    B(g, alu, 0, 0.008, 0, 0.31, 0.016, 0.22);
    B(g, C(0x1c1e22, 0.6), 0, 0.017, -0.02, 0.26, 0.002, 0.12);
    var lid = new THREE.Group();
    B(lid, alu, 0, 0.105, 0, 0.31, 0.21, 0.008);
    B(lid, C(0x0c0f14, 0.25), 0, 0.105, 0.006, 0.29, 0.185, 0.001);
    lid.position.z = -0.11;
    lid.rotation.x = opts.open ? -0.22 : -1.565;
    g.add(lid);
    g.userData.parts = { lid: lid };
    return done(g, 'laptopModern');
  };

  MODELS.printerOld = function () {
    var g = new THREE.Group();
    var beige = C(0xd4cbb2, 0.76);
    B(g, beige, 0, 0.085, 0, 0.42, 0.17, 0.32);
    B(g, C(0xc6bda4, 0.74), 0, 0.175, -0.02, 0.36, 0.02, 0.22);
    /* Paper tray, permanently half-out. */
    var tray = B(g, C(0xcdc4ab, 0.72), 0, 0.06, 0.19, 0.34, 0.014, 0.16);
    tray.rotation.x = -0.12;
    B(g, C(0xf2eee2, 0.9), 0, 0.072, 0.2, 0.21, 0.002, 0.14);
    var led = B(g, EM(0x53e07a), 0.15, 0.176, 0.13, 0.01, 0.006, 0.006);
    led.castShadow = false;
    return done(g, 'printerOld');
  };

  MODELS.ups = function () {
    var g = new THREE.Group();
    B(g, C(0x25272b, 0.6), 0, 0.11, 0, 0.17, 0.22, 0.36);
    B(g, C(0x1b1d21, 0.55), 0, 0.16, 0.181, 0.13, 0.06, 0.006);
    var led = B(g, EM(0x53e07a), 0, 0.16, 0.185, 0.02, 0.012, 0.004);
    led.castShadow = false;
    return done(g, 'ups');
  };

  /* ------------------------------------------------------------------ */
  /* Shop — bench tools and dressing                                     */
  /* ------------------------------------------------------------------ */

  MODELS.screwdriverSet = function () {
    var g = new THREE.Group();
    /* A folding wallet with bits in it. */
    B(g, C(0x24262a, 0.85), 0, 0.008, 0, 0.19, 0.016, 0.11);
    var lid = B(g, C(0x2c2e33, 0.85), 0, 0.05, -0.062, 0.19, 0.09, 0.012);
    lid.rotation.x = 0.35;
    var bit = C(0xc3c8cc, 0.32, 1);
    for (var i = 0; i < 8; i++) {
      CYm(g, bit, -0.07 + i * 0.02, 0.02, 0.01, 0.0035, 0.024, 6);
    }
    /* The driver itself, lying across it. */
    CYm(g, C(0xd23b3b, 0.5), 0.02, 0.026, 0.055, 0.011, 0.085, 8, 'x');
    CYm(g, bit, 0.105, 0.026, 0.055, 0.0035, 0.075, 6, 'x');
    return done(g, 'screwdriverSet');
  };

  MODELS.multimeter = function () {
    var g = new THREE.Group();
    B(g, C(0xd8a021, 0.7), 0, 0.022, 0, 0.09, 0.044, 0.16);
    B(g, C(0x1a1d20, 0.5), 0, 0.045, 0.03, 0.062, 0.004, 0.04);
    B(g, EM(0x9fe8c0), 0, 0.047, 0.03, 0.055, 0.03, 0.001).rotation.x = -Math.PI / 2;
    CYm(g, C(0x2a2d31, 0.6), 0, 0.046, -0.025, 0.022, 0.008, 10);
    g.add(tube([[-0.03, 0.02, -0.08], [-0.06, 0.01, -0.14], [-0.02, 0.006, -0.2]],
      0.004, C(0xd23b3b, 0.7), 5, false));
    g.add(tube([[0.03, 0.02, -0.08], [0.06, 0.01, -0.14], [0.02, 0.006, -0.2]],
      0.004, C(0x1a1a1c, 0.7), 5, false));
    return done(g, 'multimeter');
  };

  MODELS.solderStation = function () {
    var g = new THREE.Group();
    B(g, C(0x2f3237, 0.65), 0, 0.045, 0, 0.16, 0.09, 0.14);
    CYm(g, C(0x22252a, 0.6), -0.04, 0.095, 0.02, 0.02, 0.012, 10);
    var led = B(g, EM(0xff5a2a), 0.04, 0.07, 0.071, 0.012, 0.008, 0.004);
    led.castShadow = false;
    /* Iron in its stand. */
    var stand = new THREE.Group();
    CYm(stand, C(0x8b9095, 0.4, 0.9), 0.13, 0.02, 0, 0.035, 0.04, 10);
    var iron = CYm(stand, C(0x1c1e22, 0.6), 0.13, 0.065, -0.01, 0.008, 0.11, 8);
    iron.rotation.x = 0.5;
    CYm(stand, C(0xb08a4a, 0.35, 0.9), 0.13, 0.115, 0.017, 0.003, 0.03, 6).rotation.x = 0.5;
    g.add(stand);
    /* Sponge tray. */
    B(g, C(0x3c8f5e, 0.95), 0.13, 0.008, 0.05, 0.05, 0.014, 0.04);
    g.add(tube([[0.05, 0.03, -0.06], [0.0, 0.02, -0.14], [0.06, 0.01, -0.2]],
      0.005, C(0x1a1a1c, 0.8), 5, false));
    return done(g, 'solderStation');
  };

  MODELS.antistaticMat = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var m = B(g, C(0x2c4a52, 0.92), 0, 0.001, 0, opts.w || 0.75, 0.002, opts.d || 0.5);
    m.castShadow = false;
    var stud = CYm(g, C(0xb0b6ba, 0.3, 1), (opts.w || 0.75) / 2 - 0.03, 0.004, -(opts.d || 0.5) / 2 + 0.03,
      0.008, 0.008, 8);
    stud.castShadow = false;
    return done(g, 'antistaticMat');
  };

  MODELS.cableCoil = function () {
    var g = new THREE.Group();
    var geo = new THREE.TorusGeometry(0.09, 0.014, 6, 20);
    for (var i = 0; i < 3; i++) {
      var t = new THREE.Mesh(geo, C(i === 1 ? 0x2f3a52 : 0x1b1c20, 0.85));
      t.rotation.x = Math.PI / 2 + (i - 1) * 0.12;
      t.position.y = 0.016 + i * 0.02;
      t.position.x = (i - 1) * 0.012;
      t.castShadow = true;
      g.add(t);
    }
    return done(g, 'cableCoil');
  };

  MODELS.rubberDuck = function () {
    var g = new THREE.Group();
    var yellow = C(0xffcf25, 0.55);
    var body = new THREE.Mesh(sphGeo(), yellow);
    body.scale.set(0.062, 0.05, 0.078);
    body.position.y = 0.028;
    body.castShadow = true;
    g.add(body);
    /* Tail. */
    var tail = new THREE.Mesh(sphGeo(), yellow);
    tail.scale.set(0.03, 0.036, 0.03);
    tail.position.set(0, 0.05, -0.042);
    tail.rotation.x = -0.5;
    g.add(tail);
    /* Head. */
    var head = new THREE.Mesh(sphGeo(), yellow);
    head.scale.setScalar(0.046);
    head.position.set(0, 0.068, 0.03);
    head.castShadow = true;
    g.add(head);
    /* Bill. */
    var bill = new THREE.Mesh(sphGeo(), C(0xff8a1f, 0.5));
    bill.scale.set(0.026, 0.011, 0.03);
    bill.position.set(0, 0.062, 0.058);
    g.add(bill);
    /* Eyes — one slightly worn away, as they always are. */
    SP(g, C(0x131313, 0.4), -0.014, 0.079, 0.046, 0.0045);
    var e2 = SP(g, C(0x2a2622, 0.6), 0.014, 0.079, 0.046, 0.004);
    e2.scale.multiplyScalar(0.8);
    return done(g, 'rubberDuck');
  };

  MODELS.coffeeMug = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var white = C(0xece7dd, 0.4);
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.041, 0.036, 0.095, 16, 1, true), white);
    body.position.y = 0.048;
    body.castShadow = true;
    body.material.side = THREE.DoubleSide;
    g.add(body);
    CYm(g, white, 0, 0.004, 0, 0.036, 0.008, 16);
    /* Coffee, gone cold. */
    var coffee = CYm(g, C(0x2b1a10, 0.25), 0, 0.078, 0, 0.038, 0.002, 16);
    coffee.castShadow = false;
    /* Handle. */
    var h = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14, Math.PI * 1.3), white);
    h.position.set(0.044, 0.05, 0);
    h.rotation.y = Math.PI / 2;
    h.rotation.z = -0.4;
    h.castShadow = true;
    g.add(h);
    /* The legend. */
    var tex = label(opts.text || "WORLD'S OKAYEST TECH", {
      w: 256, h: 64, size: 26, color: '#232323', align: 'center'
    });
    if (tex) {
      var dm = decalMat(tex);
      if (dm) {
        var q = new THREE.Mesh(plnGeo(), dm);
        q.scale.set(0.075, 0.02, 1);
        q.position.set(0, 0.052, 0.0405);
        g.add(q);
      }
    }
    return done(g, 'coffeeMug');
  };

  MODELS.coffeeMaker = function () {
    var g = new THREE.Group();
    B(g, C(0x232529, 0.6), 0, 0.14, -0.06, 0.19, 0.28, 0.14);
    B(g, C(0x2b2d31, 0.6), 0, 0.02, 0.03, 0.19, 0.04, 0.19);
    /* The pot. */
    var pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.05, 0.13, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xd8e0e2, roughness: 0.08, transparent: true, opacity: 0.34
      }));
    pot.position.set(0, 0.105, 0.04);
    pot.material.side = THREE.DoubleSide;
    g.add(pot);
    var brew = CYm(g, C(0x2e1a0e, 0.3), 0, 0.075, 0.04, 0.05, 0.055, 14);
    brew.castShadow = false;
    var led = B(g, EM(0xff5a2a), 0.06, 0.055, 0.126, 0.012, 0.008, 0.004);
    led.castShadow = false;
    return done(g, 'coffeeMaker');
  };

  MODELS.deskLamp = function () {
    var g = new THREE.Group();
    CYm(g, C(0x2f3237, 0.55, 0.5), 0, 0.008, 0, 0.075, 0.016, 14);
    var a1 = CYm(g, C(0x3a3d42, 0.5, 0.6), 0.05, 0.17, 0, 0.008, 0.32, 8);
    a1.rotation.z = -0.32;
    var a2 = CYm(g, C(0x3a3d42, 0.5, 0.6), 0.16, 0.36, 0, 0.008, 0.26, 8);
    a2.rotation.z = 1.15;
    var shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.09, 14, 1, true), C(0x3f4348, 0.5, 0.4));
    shade.position.set(0.27, 0.4, 0);
    shade.rotation.z = 2.5;
    shade.material.side = THREE.DoubleSide;
    shade.castShadow = true;
    g.add(shade);
    var bulb = SP(g, EM(0xfff0cc), 0.255, 0.375, 0, 0.022);
    bulb.castShadow = false;
    return done(g, 'deskLamp');
  };

  MODELS.cashRegister = function () {
    var g = new THREE.Group();
    B(g, C(0x3a3d42, 0.62), 0, 0.055, 0, 0.3, 0.11, 0.28);
    var head = B(g, C(0x33363b, 0.6), 0, 0.17, -0.06, 0.26, 0.13, 0.06);
    head.rotation.x = -0.22;
    B(g, EM(0x86e8b4), 0, 0.175, -0.028, 0.19, 0.06, 0.002).rotation.x = -0.22;
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 5; c++) {
        var k = B(g, C(0x53575c, 0.7), -0.09 + c * 0.045, 0.115, 0.02 + r * 0.04,
          0.032, 0.01, 0.03);
        k.castShadow = false;
      }
    }
    return done(g, 'cashRegister');
  };

  MODELS.binMetal = function () {
    var g = new THREE.Group();
    var m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.115, 0.36, 14, 1, true),
      C(0x7d8388, 0.55, 0.8));
    m.position.y = 0.18;
    m.material.side = THREE.DoubleSide;
    m.castShadow = true;
    g.add(m);
    CYm(g, C(0x6d7378, 0.6, 0.8), 0, 0.005, 0, 0.115, 0.01, 14);
    /* Something crumpled at the top. */
    var p = SP(g, C(0xe8e3d4, 0.95), 0.03, 0.34, -0.02, 0.045);
    p.scale.set(1, 0.7, 1);
    return done(g, 'binMetal');
  };

  MODELS.cardboardBox = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var s = opts.s || 0.34;
    var mat = M('cardboard', { color: 0xa8834f, roughness: 0.95 });
    B(g, mat, 0, s / 2, 0, s, s, s * 0.85);
    /* Tape seam. */
    var t = B(g, C(0xc9bda6, 0.7), 0, s + 0.001, 0, s * 0.14, 0.002, s * 0.85);
    t.castShadow = false;
    return done(g, 'cardboardBox');
  };

  MODELS.catBed = function () {
    var g = new THREE.Group();
    var d = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 7, 18), C(0x8a6f8f, 0.98));
    d.rotation.x = Math.PI / 2;
    d.position.y = 0.055;
    d.castShadow = true;
    g.add(d);
    var base = CYm(g, C(0x7a6280, 0.98), 0, 0.03, 0, 0.15, 0.03, 16);
    base.castShadow = false;
    return done(g, 'catBed');
  };

  MODELS.stickyNote = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var tex = label(opts.text || 'password', {
      w: 128, h: 128, size: 28, color: '#2b3a6b', align: 'center', bg: '#ffe86b'
    });
    var mat = tex
      ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
      : C(0xffe86b, 0.95);
    var q = new THREE.Mesh(plnGeo(), mat);
    q.scale.set(0.076, 0.076, 1);
    q.rotation.x = -Math.PI / 2;
    q.position.y = 0.001;
    g.add(q);
    /* One corner lifted. */
    var c = new THREE.Mesh(plnGeo(), mat);
    c.scale.set(0.03, 0.03, 1);
    c.rotation.set(-Math.PI / 2 + 0.5, 0, 0.4);
    c.position.set(0.026, 0.005, -0.03);
    g.add(c);
    return done(g, 'stickyNote');
  };

  MODELS.whiteboard = function (opts) {
    opts = opts || {};
    var w = opts.w || 1.6, h = opts.h || 1.0;
    var g = new THREE.Group();
    B(g, C(0xb9bec2, 0.4, 0.85), 0, 0, 0, w + 0.05, h + 0.05, 0.03);

    /* The diagram, drawn by hand in marker. */
    var cvs = document.createElement('canvas');
    cvs.width = 768; cvs.height = 480;
    var x = cvs.getContext('2d');
    x.fillStyle = '#f4f5f2'; x.fillRect(0, 0, 768, 480);
    var rnd = util.rng(4711);
    function jline(x1, y1, x2, y2, col, lw) {
      x.strokeStyle = col; x.lineWidth = lw || 3; x.lineCap = 'round';
      x.beginPath();
      var n = 6;
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var px = x1 + (x2 - x1) * t + (rnd() - 0.5) * 3;
        var py = y1 + (y2 - y1) * t + (rnd() - 0.5) * 3;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      /* Overshoot — nobody stops exactly on the corner. */
      x.lineTo(x2 + (rnd() - 0.5) * 8, y2 + (rnd() - 0.5) * 8);
      x.stroke();
    }
    function jbox(bx, by, bw, bh, col) {
      jline(bx, by, bx + bw, by, col); jline(bx + bw, by, bx + bw, by + bh, col);
      jline(bx + bw, by + bh, bx, by + bh, col); jline(bx, by + bh, bx, by, col);
    }
    function jtext(t, tx, ty, col, size) {
      x.fillStyle = col;
      x.font = (size || 22) + 'px "Comic Sans MS", ui-monospace, monospace';
      x.save(); x.translate(tx, ty); x.rotate((rnd() - 0.5) * 0.05);
      x.fillText(t, 0, 0); x.restore();
    }
    var BLUE = '#2a4a8f', BLACK = '#232323', RED = '#b33';
    jbox(60, 60, 170, 70, BLACK); jtext('BROKER', 88, 103, BLACK);
    jbox(300, 55, 160, 70, BLACK); jtext('MERIDIAN', 320, 98, BLACK);
    jbox(300, 250, 190, 80, RED); jtext('HALCYON', 322, 300, RED, 26);
    jbox(560, 250, 150, 70, BLUE); jtext('BUYERS', 588, 293, BLUE);
    jbox(60, 250, 160, 70, BLUE); jtext('“RETIRED”', 76, 293, BLUE);
    jline(230, 95, 300, 95, BLACK); jline(380, 125, 380, 250, BLACK);
    jline(490, 290, 560, 288, BLUE); jline(220, 288, 300, 290, BLUE);
    jtext('air-gapped??', 400, 200, RED, 20);
    jtext('no uplink — hands only', 386, 226, BLACK, 18);
    jtext('9 yrs', 392, 168, BLACK, 18);
    /* Half erased, and dated months before the job. */
    x.globalAlpha = 0.35;
    jtext('who pays for the room?', 300, 400, BLACK, 20);
    x.globalAlpha = 1;
    jtext('MAR', 660, 60, BLACK, 20);
    x.strokeStyle = 'rgba(210,210,205,0.85)'; x.lineWidth = 26;
    x.beginPath(); x.moveTo(280, 395); x.lineTo(520, 402); x.stroke();

    var tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    var face = new THREE.Mesh(plnGeo(),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28 }));
    face.scale.set(w, h, 1);
    face.position.z = 0.017;
    g.add(face);
    /* Marker tray. */
    B(g, C(0xa9aeb2, 0.45, 0.8), 0, -h / 2 - 0.03, 0.03, w * 0.6, 0.02, 0.05);
    return done(g, 'whiteboard');
  };

  MODELS.poster = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var tex = null;
    if (SG.tex && SG.tex[opts.which]) {
      try { tex = SG.tex[opts.which]({}); } catch (e) { tex = null; }
    }
    if (!tex && SG.tex && SG.tex.posterA) {
      try { tex = SG.tex.posterA({}); } catch (e) { tex = null; }
    }
    var mat = tex
      ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })
      : C(0xd8d2c0, 0.92);
    var q = new THREE.Mesh(plnGeo(), mat);
    q.scale.set(opts.w || 0.6, opts.h || 0.84, 1);
    q.position.z = 0.004;
    g.add(q);
    /* Yellowed tape at two corners, one lifting. */
    var tape = C(0xd9cfa8, 0.8);
    var t1 = B(g, tape, -(opts.w || 0.6) / 2 + 0.03, (opts.h || 0.84) / 2 - 0.02, 0.006,
      0.05, 0.02, 0.001);
    t1.rotation.z = 0.6; t1.castShadow = false;
    var t2 = B(g, tape, (opts.w || 0.6) / 2 - 0.03, (opts.h || 0.84) / 2 - 0.02, 0.006,
      0.05, 0.02, 0.001);
    t2.rotation.z = -0.6; t2.castShadow = false;
    return done(g, 'poster');
  };

  MODELS.calendar = function () {
    var g = new THREE.Group();
    var cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 320;
    var x = cvs.getContext('2d');
    x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, 256, 320);
    x.fillStyle = '#2b3a6b'; x.fillRect(0, 0, 256, 56);
    x.fillStyle = '#fff'; x.font = 'bold 28px ui-monospace, monospace';
    x.fillText('MARCH', 68, 38);
    x.fillStyle = '#444'; x.font = '18px ui-monospace, monospace';
    var d = 1;
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 7; c++) {
        if (d > 31) break;
        x.fillText(String(d), 18 + c * 33, 92 + r * 44);
        if (d === 14) {
          x.strokeStyle = '#c0392b'; x.lineWidth = 3;
          x.beginPath();
          x.ellipse(24 + c * 33, 86 + r * 44, 18, 15, 0.2, 0, Math.PI * 2);
          x.stroke();
        }
        d++;
      }
    }
    var tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    var q = new THREE.Mesh(plnGeo(),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    q.scale.set(0.28, 0.35, 1);
    g.add(q);
    return done(g, 'calendar');
  };

  MODELS.clockWall = function () {
    var g = new THREE.Group();
    CYm(g, C(0xe8e5dd, 0.6), 0, 0, 0, 0.14, 0.035, 20, 'z');
    var face = CYm(g, C(0xfbfaf6, 0.5), 0, 0, 0.019, 0.125, 0.002, 20, 'z');
    face.castShadow = false;
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      var t = B(g, C(0x2a2a2a, 0.6), Math.sin(a) * 0.105, Math.cos(a) * 0.105, 0.021,
        i % 3 === 0 ? 0.012 : 0.006, i % 3 === 0 ? 0.02 : 0.012, 0.002);
      t.rotation.z = -a;
      t.castShadow = false;
    }
    var hands = {};
    function hand(len, wid, col) {
      var pivot = new THREE.Group();
      var m = B(pivot, C(col, 0.5), 0, len / 2, 0.024, wid, len, 0.002);
      m.castShadow = false;
      g.add(pivot);
      return pivot;
    }
    hands.hour = hand(0.062, 0.008, 0x232323);
    hands.minute = hand(0.098, 0.006, 0x232323);
    hands.second = hand(0.105, 0.003, 0xc0392b);
    /* Twenty to six. */
    hands.hour.rotation.z = -(17 + 40 / 60) / 12 * Math.PI * 2;
    hands.minute.rotation.z = -(40 / 60) * Math.PI * 2;
    hands.second.rotation.z = -(12 / 60) * Math.PI * 2;
    CYm(g, C(0x1a1a1a, 0.4), 0, 0, 0.026, 0.008, 0.004, 10, 'z');
    g.userData.hands = hands;
    return done(g, 'clockWall');
  };

  MODELS.plantPotted = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var h = opts.h || 1.1;
    var pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.11, 0.26, 14), C(0x8a5a3f, 0.9));
    pot.position.y = 0.13;
    pot.castShadow = true;
    g.add(pot);
    CYm(g, C(0x3a2a1c, 1), 0, 0.25, 0, 0.14, 0.02, 14);
    /* Pothos: a few trailing vines, one leaf browning. */
    var rnd = util.rng(31);
    for (var v = 0; v < 7; v++) {
      var a = v / 7 * Math.PI * 2 + rnd();
      var lean = 0.25 + rnd() * 0.5;
      var top = 0.26 + (h - 0.3) * (0.55 + rnd() * 0.45);
      var stem = tube([
        [0, 0.26, 0],
        [Math.sin(a) * lean * 0.3, (top + 0.26) / 2, Math.cos(a) * lean * 0.3],
        [Math.sin(a) * lean, top, Math.cos(a) * lean]
      ], 0.006, C(0x4a6b32, 0.9), 5, false);
      g.add(stem);
      for (var lf = 0; lf < 3; lf++) {
        var t = 0.4 + lf * 0.3;
        var leaf = new THREE.Mesh(plnGeo(),
          C(v === 5 && lf === 2 ? 0x9a8236 : 0x3f7a34, 0.85));
        leaf.material.side = THREE.DoubleSide;
        leaf.scale.set(0.11, 0.08, 1);
        leaf.position.set(Math.sin(a) * lean * t, 0.26 + (top - 0.26) * t,
          Math.cos(a) * lean * t);
        leaf.rotation.set(-1.1 + rnd() * 0.6, a, rnd() * 0.5);
        leaf.castShadow = true;
        g.add(leaf);
      }
    }
    return done(g, 'plantPotted');
  };

  /* ------------------------------------------------------------------ */
  /* Hotel                                                               */
  /* ------------------------------------------------------------------ */

  MODELS.marbleColumn = function (opts) {
    opts = opts || {};
    var h = opts.h || 6.4;
    var g = new THREE.Group();
    var mat = M('marbleWall', { color: 0xc3b8a4, roughness: 0.2 });
    B(g, mat, 0, 0.09, 0, 0.72, 0.18, 0.72);
    CYm(g, mat, 0, h / 2, 0, 0.26, h - 0.36, 14);
    B(g, mat, 0, h - 0.11, 0, 0.66, 0.22, 0.66);
    B(g, M('metal', { color: 0xb08a3c, roughness: 0.3, metalness: 1 }),
      0, h - 0.26, 0, 0.58, 0.05, 0.58);
    return done(g, 'marbleColumn');
  };

  MODELS.chandelier = function (opts) {
    opts = opts || {};
    var tiers = opts.tiers || 3;
    var g = new THREE.Group();
    var brass = M('metal', { color: 0xc09a48, roughness: 0.28, metalness: 1 });
    var crystal = new THREE.MeshStandardMaterial({
      color: 0xf0f4f6, roughness: 0.05, metalness: 0,
      transparent: true, opacity: 0.55
    });
    crystal.userData.shared = true;

    CYm(g, brass, 0, -0.15, 0, 0.02, 0.9, 6);
    var drops = new THREE.Group();
    var bulbs = new THREE.Group();
    for (var t = 0; t < tiers; t++) {
      var r = 0.75 - t * 0.2;
      var y = -0.7 - t * 0.34;
      var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 5, 22), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
      var n = 14 - t * 3;
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        var px = Math.sin(a) * r, pz = Math.cos(a) * r;
        var d = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), crystal);
        d.position.set(px, y - 0.11, pz);
        d.scale.y = 1.7;
        drops.add(d);
        var b = new THREE.Mesh(sphGeo(), EM(0xffe2b0));
        b.scale.setScalar(0.05);
        b.position.set(px, y + 0.07, pz);
        bulbs.add(b);
      }
    }
    /* Merged: forty crystals and forty bulbs, two draw calls. */
    g.add(util.mergeGroup(drops, { castShadow: false }));
    g.add(util.mergeGroup(bulbs, { castShadow: false }));
    var glow = new THREE.Mesh(sphGeo(),
      new THREE.MeshBasicMaterial({
        color: 0xffcf8a, transparent: true, opacity: 0.10, depthWrite: false
      }));
    glow.scale.setScalar(2.2);
    glow.position.y = -1.0;
    g.add(glow);
    return done(g, 'chandelier');
  };

  MODELS.receptionCounter = function (opts) {
    opts = opts || {};
    var w = opts.w || 5.0;
    var g = new THREE.Group();
    var marble = M('marbleWall', { color: 0x3b3630, roughness: 0.18 });
    var brass = M('metal', { color: 0xc09a48, roughness: 0.3, metalness: 1 });
    B(g, marble, 0, 0.55, 0, w, 1.1, 0.7);
    B(g, brass, 0, 1.11, 0, w + 0.06, 0.03, 0.76);
    B(g, C(0x2b2723, 0.4), 0, 0.9, -0.42, w - 0.4, 0.04, 0.5);
    /* Bell. */
    var bell = new THREE.Mesh(sphGeo(), brass);
    bell.scale.set(0.09, 0.055, 0.09);
    bell.position.set(w / 2 - 0.5, 1.15, 0.12);
    g.add(bell);
    CYm(g, brass, w / 2 - 0.5, 1.185, 0.12, 0.008, 0.02, 6);
    g.userData.parts = { bell: bell };
    /* Card terminal. */
    var term = B(g, C(0x25272b, 0.6), -w / 2 + 0.6, 1.16, 0.1, 0.09, 0.06, 0.14);
    term.rotation.x = -0.3;
    return done(g, 'receptionCounter');
  };

  MODELS.hotelSofa = function () {
    var g = new THREE.Group();
    var velvet = M('fabricSeat', { color: 0x5a2230, roughness: 0.95 });
    B(g, velvet, 0, 0.22, 0, 1.9, 0.28, 0.82);
    B(g, velvet, 0, 0.44, 0, 1.78, 0.18, 0.7);
    B(g, velvet, 0, 0.55, -0.34, 1.9, 0.66, 0.16);
    B(g, velvet, -0.92, 0.44, 0, 0.16, 0.44, 0.8);
    B(g, velvet, 0.92, 0.44, 0, 0.16, 0.44, 0.8);
    var wood = C(0x3a2a1e, 0.5);
    [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]].forEach(function (p) {
      CYm(g, wood, p[0], 0.04, p[1], 0.025, 0.08, 6);
    });
    return done(g, 'hotelSofa');
  };

  MODELS.rugPersian = function (opts) {
    opts = opts || {};
    var w = opts.w || 4, d = opts.d || 3;
    var cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 192;
    var x = cvs.getContext('2d');
    x.fillStyle = '#7a2230'; x.fillRect(0, 0, 256, 192);
    /* Border. */
    x.strokeStyle = '#1f3c4a'; x.lineWidth = 14;
    x.strokeRect(12, 12, 232, 168);
    x.strokeStyle = '#c8a03c'; x.lineWidth = 4;
    x.strokeRect(26, 26, 204, 140);
    /* Central medallion. */
    x.fillStyle = '#1f3c4a';
    x.beginPath(); x.ellipse(128, 96, 52, 34, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#c8a03c';
    x.beginPath(); x.ellipse(128, 96, 34, 20, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#7a2230';
    x.beginPath(); x.ellipse(128, 96, 16, 9, 0, 0, Math.PI * 2); x.fill();
    /* Corner palmettes. */
    x.fillStyle = '#c8a03c';
    [[52, 52], [204, 52], [52, 140], [204, 140]].forEach(function (p) {
      x.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2;
        x.ellipse(p[0] + Math.cos(a) * 12, p[1] + Math.sin(a) * 9, 5, 3, a, 0, Math.PI * 2);
      }
      x.fill();
    });
    var tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    var g = new THREE.Group();
    var q = new THREE.Mesh(plnGeo(),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98 }));
    q.scale.set(w, d, 1);
    q.rotation.x = -Math.PI / 2;
    q.receiveShadow = true;
    g.add(q);
    return done(g, 'rugPersian');
  };

  MODELS.paintingFramed = function (opts) {
    opts = opts || {};
    var w = opts.w || 1.2, h = opts.h || 1.6;
    var g = new THREE.Group();
    B(g, M('metal', { color: 0xa5842f, roughness: 0.35, metalness: 1 }),
      0, 0, 0, w + 0.11, h + 0.11, 0.06);
    /* A dark landscape, painted in four brush-strokes of gradient. */
    var cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 170;
    var x = cvs.getContext('2d');
    var grd = x.createLinearGradient(0, 0, 0, 170);
    grd.addColorStop(0, '#2c3a48'); grd.addColorStop(0.55, '#6a5a3e');
    grd.addColorStop(1, '#2a2016');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 170);
    x.fillStyle = 'rgba(20,16,12,0.7)';
    x.beginPath(); x.moveTo(0, 120); x.lineTo(40, 86); x.lineTo(78, 118);
    x.lineTo(128, 92); x.lineTo(128, 170); x.lineTo(0, 170); x.fill();
    x.fillStyle = 'rgba(240,224,180,0.5)';
    x.beginPath(); x.ellipse(92, 40, 11, 11, 0, 0, Math.PI * 2); x.fill();
    var tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    var q = new THREE.Mesh(plnGeo(),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    q.scale.set(w, h, 1);
    q.position.z = 0.032;
    g.add(q);
    return done(g, 'paintingFramed');
  };

  MODELS.revolvingDoor = function () {
    var g = new THREE.Group();
    var brass = M('metal', { color: 0xb8933f, roughness: 0.3, metalness: 1 });
    var glass = new THREE.MeshStandardMaterial({
      color: 0xdceaee, roughness: 0.05, transparent: true, opacity: 0.2
    });
    glass.userData.shared = true;
    /* Drum. */
    var drum = new THREE.Group();
    for (var i = 0; i < 4; i++) {
      var leaf = new THREE.Group();
      B(leaf, glass, 0.6, 1.2, 0, 1.2, 2.3, 0.02);
      B(leaf, brass, 0.6, 2.36, 0, 1.24, 0.06, 0.05);
      B(leaf, brass, 1.19, 1.2, 0, 0.05, 2.3, 0.05);
      leaf.rotation.y = i / 4 * Math.PI * 2;
      drum.add(leaf);
    }
    drum.position.y = 0;
    g.add(drum);
    CYm(g, brass, 0, 1.2, 0, 0.05, 2.4, 8);
    /* Enclosure. */
    var arc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 2.4, 20, 1, true, 0.5, 2.1), glass);
    arc.position.y = 1.2;
    arc.material.side = THREE.DoubleSide;
    g.add(arc);
    var arc2 = arc.clone();
    arc2.rotation.y = Math.PI;
    g.add(arc2);
    CYm(g, brass, 0, 2.45, 0, 1.34, 0.1, 20);
    g.userData.parts = { drum: drum };
    return done(g, 'revolvingDoor');
  };

  MODELS.elevatorDoors = function (opts) {
    opts = opts || {};
    var freight = !!opts.freight;
    var w = freight ? 2.0 : 1.9, h = freight ? 2.2 : 2.3;
    var g = new THREE.Group();
    var mat = freight
      ? C(0x767c81, 0.55, 0.85)
      : M('metal', { color: 0xb08a3c, roughness: 0.32, metalness: 1 });
    B(g, C(0x4c5054, 0.6, 0.7), 0, h / 2 + 0.06, -0.04, w + 0.24, h + 0.12, 0.08);
    var left = new THREE.Group(), right = new THREE.Group();
    B(left, mat, -w / 4, h / 2, 0, w / 2 - 0.01, h, 0.05);
    B(right, mat, w / 4, h / 2, 0, w / 2 - 0.01, h, 0.05);
    g.add(left); g.add(right);
    if (freight) {
      /* Scuffed and dented where the carts hit it. */
      var scuff = B(g, C(0x5e6367, 0.75, 0.6), 0, 0.35, 0.028, w * 0.9, 0.22, 0.004);
      scuff.castShadow = false;
    }
    /* Floor indicator. */
    var ind = B(g, EM(0xffa23a), 0, h + 0.14, 0.01, 0.24, 0.1, 0.01);
    ind.castShadow = false;
    g.userData.parts = { left: left, right: right, indicator: ind };
    g.userData.setOpen = function (t) {
      t = Math.max(0, Math.min(1, t));
      left.position.x = -t * (w / 2 - 0.02);
      right.position.x = t * (w / 2 - 0.02);
    };
    return done(g, 'elevatorDoors');
  };

  MODELS.elevatorPanel = function () {
    var g = new THREE.Group();
    B(g, M('metal', { color: 0xb08a3c, roughness: 0.3, metalness: 1 }),
      0, 0, 0, 0.14, 0.3, 0.02);
    var up = CYm(g, EM(0xffcf8a), 0, 0.06, 0.014, 0.022, 0.006, 10, 'z');
    var dn = CYm(g, C(0x2a2c30, 0.5), 0, -0.06, 0.014, 0.022, 0.006, 10, 'z');
    up.castShadow = false; dn.castShadow = false;
    g.userData.parts = { up: up, down: dn };
    return done(g, 'elevatorPanel');
  };

  MODELS.keycardReader = function () {
    var g = new THREE.Group();
    var body = C(0x2b2e33, 0.55);
    B(g, body, 0, 0, 0, 0.085, 0.125, 0.025);
    /* Behind the plate: a terminal block and a loom. */
    B(g, C(0x1a1c1f, 0.7), 0, 0, -0.006, 0.07, 0.10, 0.012);
    var block = B(g, C(0x3f7a34, 0.6), 0, -0.02, 0.002, 0.055, 0.02, 0.012);
    block.castShadow = false;
    [0xd7263d, 0x2e86de, 0xf6c90e, 0xffffff].forEach(function (col, i) {
      var wsm = B(g, C(col, 0.6), -0.022 + i * 0.015, 0.015, 0.004, 0.004, 0.03, 0.004);
      wsm.castShadow = false;
    });
    /* The faceplate, held on by two screws. */
    var plate = new THREE.Group();
    B(plate, C(0x33373c, 0.5), 0, 0, 0.013, 0.085, 0.125, 0.008);
    var led = B(plate, EM(0xff4436), 0, 0.045, 0.019, 0.014, 0.006, 0.002);
    led.castShadow = false;
    var slot = B(plate, C(0x14161a, 0.6), 0, -0.01, 0.019, 0.05, 0.004, 0.002);
    slot.castShadow = false;
    plate.name = 'faceplate';
    g.add(plate);

    g.userData.parts = { faceplate: plate, led: led };
    g.userData.led = led;
    g.userData.setState = function (s) {
      var hex = s === 'accept' ? 0x35e07a : (s === 'deny' ? 0xff4436 : 0xff8a3a);
      led.material = EM(hex);
    };
    return done(g, 'keycardReader');
  };

  MODELS.cctvCamera = function () {
    var g = new THREE.Group();
    var mat = C(0xe6e6e4, 0.5);
    B(g, mat, 0, 0, -0.1, 0.07, 0.07, 0.06);
    var arm = CYm(g, mat, 0, -0.03, -0.05, 0.014, 0.11, 8, 'z');
    arm.rotation.x = 0.5;
    var head = new THREE.Group();
    B(head, mat, 0, 0, 0, 0.09, 0.08, 0.19);
    B(head, C(0x111316, 0.35), 0, 0, 0.098, 0.06, 0.05, 0.01);
    /* IR ring — the thing that reads as "watching". */
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 5, 14),
      EM(0x7a1414));
    ring.position.z = 0.1;
    ring.castShadow = false;
    head.add(ring);
    var led = B(head, EM(0xff3b3b), 0.03, 0.03, 0.096, 0.006, 0.006, 0.004);
    led.castShadow = false;
    head.position.set(0, -0.06, 0.02);
    g.add(head);
    g.userData.parts = { head: head };
    g.userData.aim = function (v) { if (v) head.lookAt(v); };
    return done(g, 'cctvCamera');
  };

  MODELS.luggageCart = function () {
    var g = new THREE.Group();
    var brass = M('metal', { color: 0xb8933f, roughness: 0.3, metalness: 1 });
    B(g, C(0x4a3226, 0.7), 0, 0.28, 0, 1.0, 0.05, 0.62);
    [[-0.46, -0.28], [0.46, -0.28], [-0.46, 0.28], [0.46, 0.28]].forEach(function (p) {
      CYm(g, brass, p[0], 0.75, p[1], 0.018, 1.5, 8);
      var wh = CYm(g, C(0x1c1c1e, 0.8), p[0], 0.06, p[1], 0.06, 0.03, 10, 'x');
      wh.castShadow = false;
    });
    var bar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 5, 16, Math.PI), brass);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 1.5;
    g.add(bar);
    B(g, C(0x5a2230, 0.95), 0, 0.31, 0, 0.9, 0.02, 0.55);
    return done(g, 'luggageCart');
  };

  MODELS.serviceCart = function () {
    var g = new THREE.Group();
    var steel = C(0x9aa0a4, 0.45, 0.85);
    B(g, steel, 0, 0.85, 0, 0.55, 0.03, 0.85);
    B(g, steel, 0, 0.45, 0, 0.52, 0.03, 0.82);
    [[-0.24, -0.38], [0.24, -0.38], [-0.24, 0.38], [0.24, 0.38]].forEach(function (p) {
      CYm(g, steel, p[0], 0.44, p[1], 0.014, 0.88, 6);
      var wh = CYm(g, C(0x1c1c1e, 0.8), p[0], 0.04, p[1], 0.04, 0.02, 8, 'x');
      wh.castShadow = false;
    });
    B(g, C(0xdfe3e6, 0.9), 0, 0.9, 0.1, 0.4, 0.07, 0.3);
    return done(g, 'serviceCart');
  };

  MODELS.velvetRope = function () {
    var g = new THREE.Group();
    var brass = M('metal', { color: 0xb8933f, roughness: 0.28, metalness: 1 });
    CYm(g, brass, 0, 0.02, 0, 0.15, 0.04, 12);
    CYm(g, brass, 0, 0.5, 0, 0.022, 0.94, 10);
    var top = SP(g, brass, 0, 1.0, 0, 0.04);
    /* The rope, hanging in a proper catenary. */
    var rope = tube([
      [0, 0.97, 0], [0.45, 0.78, 0], [0.9, 0.97, 0]
    ], 0.018, C(0x6a1f2c, 0.95), 6, false);
    g.add(rope);
    return done(g, 'velvetRope');
  };

  MODELS.wallSconce = function () {
    var g = new THREE.Group();
    var brass = M('metal', { color: 0xb8933f, roughness: 0.3, metalness: 1 });
    B(g, brass, 0, 0, 0, 0.09, 0.2, 0.03);
    var cup = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 12, 1, true), brass);
    cup.position.set(0, 0.06, 0.09);
    cup.rotation.x = Math.PI;
    cup.material.side = THREE.DoubleSide;
    g.add(cup);
    var b = SP(g, EM(0xffdca8), 0, 0.1, 0.09, 0.035);
    b.castShadow = false;
    return done(g, 'wallSconce');
  };

  MODELS.potPalm = function () {
    var g = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 14),
      C(0x8a7c68, 0.7));
    pot.position.y = 0.21;
    pot.castShadow = true;
    g.add(pot);
    CYm(g, C(0x2f2418, 1), 0, 0.4, 0, 0.26, 0.03, 14);
    var rnd = util.rng(88);
    for (var i = 0; i < 9; i++) {
      var a = i / 9 * Math.PI * 2 + rnd() * 0.4;
      var lean = 0.35 + rnd() * 0.35;
      var top = 1.0 + rnd() * 0.55;
      g.add(tube([
        [0, 0.4, 0],
        [Math.sin(a) * lean * 0.35, (top + 0.4) * 0.55, Math.cos(a) * lean * 0.35],
        [Math.sin(a) * lean, top, Math.cos(a) * lean]
      ], 0.012, C(0x4a6b32, 0.9), 5, false));
      var frond = new THREE.Mesh(plnGeo(), C(0x35682c, 0.88));
      frond.material.side = THREE.DoubleSide;
      frond.scale.set(0.14, 0.5, 1);
      frond.position.set(Math.sin(a) * lean * 1.15, top + 0.12, Math.cos(a) * lean * 1.15);
      frond.rotation.set(-0.5 + rnd() * 0.4, a, rnd() * 0.4);
      frond.castShadow = true;
      g.add(frond);
    }
    return done(g, 'potPalm');
  };

  MODELS.minibar = function () {
    var g = new THREE.Group();
    B(g, C(0x3a2a1e, 0.5), 0, 0.5, 0, 1.1, 1.0, 0.5);
    B(g, C(0x2b2723, 0.35), 0, 1.01, 0, 1.14, 0.03, 0.54);
    var glass = B(g, new THREE.MeshStandardMaterial({
      color: 0xcfe0e4, roughness: 0.08, transparent: true, opacity: 0.3
    }), 0, 0.5, 0.252, 0.9, 0.7, 0.01);
    glass.castShadow = false;
    B(g, M('metal', { color: 0xb8933f, roughness: 0.3, metalness: 1 }),
      0.42, 0.5, 0.27, 0.02, 0.3, 0.02);
    return done(g, 'minibar');
  };

  MODELS.waterBottle = function () {
    var g = new THREE.Group();
    var glass = new THREE.MeshStandardMaterial({
      color: 0xdff0f4, roughness: 0.04, transparent: true, opacity: 0.4
    });
    glass.userData.shared = true;
    var b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), glass);
    b.position.y = 0.1;
    g.add(b);
    CYm(g, glass, 0, 0.215, 0, 0.014, 0.04, 10);
    CYm(g, C(0x2b6ea8, 0.5), 0, 0.24, 0, 0.016, 0.018, 10);
    var lab = label('€18', { w: 64, h: 32, size: 22, color: '#1d3f5c', align: 'center' });
    if (lab) {
      var dm = decalMat(lab);
      if (dm) {
        var q = new THREE.Mesh(plnGeo(), dm);
        q.scale.set(0.05, 0.025, 1);
        q.position.set(0, 0.1, 0.036);
        g.add(q);
      }
    }
    return done(g, 'waterBottle');
  };

  MODELS.signExit = function () {
    var g = new THREE.Group();
    B(g, C(0x2a2c30, 0.6), 0, 0, 0, 0.3, 0.12, 0.03);
    var f = B(g, EM(0x2ee06a), 0, 0, 0.018, 0.27, 0.1, 0.002);
    f.castShadow = false;
    var t = label('EXIT', { w: 128, h: 48, size: 34, color: '#eafff2', align: 'center' });
    if (t) {
      var dm = decalMat(t);
      if (dm) {
        var q = new THREE.Mesh(plnGeo(), dm);
        q.scale.set(0.22, 0.08, 1);
        q.position.z = 0.021;
        g.add(q);
      }
    }
    return done(g, 'signExit');
  };

  MODELS.fireExtinguisher = function () {
    var g = new THREE.Group();
    var red = C(0xb32218, 0.45);
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), red);
    body.position.y = 0.23;
    body.castShadow = true;
    g.add(body);
    var dome = new THREE.Mesh(sphGeo(), red);
    dome.scale.setScalar(0.15); dome.position.y = 0.44;
    g.add(dome);
    CYm(g, C(0x2a2c30, 0.5, 0.7), 0, 0.51, 0, 0.018, 0.06, 8);
    var horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8, 1, true),
      C(0x1c1c1e, 0.7));
    horn.position.set(0.09, 0.36, 0);
    horn.rotation.z = -1.9;
    horn.material.side = THREE.DoubleSide;
    g.add(horn);
    g.add(tube([[0, 0.5, 0], [0.09, 0.44, 0.03], [0.09, 0.38, 0]], 0.012,
      C(0x1c1c1e, 0.8), 5, false));
    return done(g, 'fireExtinguisher');
  };

  /* ------------------------------------------------------------------ */
  /* Vault                                                               */
  /* ------------------------------------------------------------------ */

  MODELS.serverRack = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var W = 0.6, H = 2.0, D = 1.07;
    var frame = C(0x24262a, 0.5, 0.6);
    /* Uprights and rails. */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      B(g, frame, s[0] * (W / 2 - 0.03), H / 2, s[1] * (D / 2 - 0.04), 0.06, H, 0.06);
    });
    B(g, frame, 0, 0.02, 0, W, 0.04, D);
    B(g, frame, 0, H - 0.02, 0, W, 0.04, D);
    B(g, C(0x1c1e22, 0.55), 0, H / 2, -D / 2 + 0.02, W, H, 0.03);
    B(g, C(0x1c1e22, 0.55), -W / 2 + 0.015, H / 2, 0, 0.02, H, D);
    B(g, C(0x1c1e22, 0.55), W / 2 - 0.015, H / 2, 0, 0.02, H, D);

    /* Blades, and one bay left empty because somebody pulled a server. */
    var leds = [];
    var ledMat = new THREE.MeshBasicMaterial({ color: 0x35e07a, toneMapped: false });
    var amberMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, toneMapped: false });
    for (var i = 0; i < 20; i++) {
      var y = 0.14 + i * 0.088;
      if (i === 13) {
        /* Missing blanking plate — you can see straight in. */
        continue;
      }
      var blade = B(g, C(i % 5 === 0 ? 0x2f3237 : 0x35383d, 0.55, 0.35),
        0, y, D / 2 - 0.06, W - 0.08, 0.078, 0.1);
      for (var k = 0; k < 3; k++) {
        var led = B(g, k === 2 ? amberMat : ledMat,
          -W / 2 + 0.09 + k * 0.03, y, D / 2 - 0.008, 0.011, 0.006, 0.004);
        led.castShadow = false;
        leds.push(led);
      }
      /* Drive bays. */
      for (var b2 = 0; b2 < 4; b2++) {
        var bay = B(g, C(0x2a2d31, 0.6), 0.03 + b2 * 0.045, y, D / 2 - 0.007,
          0.04, 0.062, 0.003);
        bay.castShadow = false;
      }
    }

    /* Mesh front door — real slats read better than an alpha texture. */
    var door = new THREE.Group();
    B(door, frame, 0, H / 2, 0, W, H, 0.02);
    for (var s2 = 0; s2 < 26; s2++) {
      var sl = B(door, C(0x1a1c20, 0.6), 0, 0.08 + s2 * 0.073, 0.014, W - 0.05, 0.03, 0.006);
      sl.castShadow = false;
    }
    door.position.z = D / 2 + 0.02;
    door.visible = false;   /* left open — Steve is working */
    g.add(door);

    /* The asset tag, handwritten. */
    var tag = label(opts.label || 'A01', {
      w: 192, h: 48, size: 26, color: '#e8e4d8', align: 'center'
    });
    if (tag) {
      var dm = decalMat(tag);
      if (dm) {
        var q = new THREE.Mesh(plnGeo(), dm);
        q.scale.set(0.28, 0.07, 1);
        q.position.set(0, H - 0.12, D / 2 - 0.005);
        g.add(q);
      }
    }

    var activity = 1;
    g.userData.leds = leds;
    g.userData.parts = { door: door };
    g.userData.setActivity = function (a) {
      if (Math.abs(a - activity) < 0.02) return;
      activity = a;
      ledMat.color.setRGB(0.2 * a, 0.88 * a, 0.48 * a);
      amberMat.color.setRGB(1.0 * a, 0.64 * a, 0.23 * a);
    };
    return done(g, 'serverRack');
  };

  MODELS.patchPanel = function () {
    var g = new THREE.Group();
    B(g, C(0x2a2d31, 0.5, 0.6), 0, 0, 0, 0.5, 0.9, 0.12);
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 12; c++) {
        var p = B(g, C(0x14161a, 0.6), -0.22 + c * 0.04, 0.36 - r * 0.14, 0.062,
          0.028, 0.03, 0.006);
        p.castShadow = false;
        if ((r * 12 + c) % 3 === 0) {
          var lead = B(g, C([0x2e86de, 0xf6c90e, 0x35e07a][(r + c) % 3], 0.7),
            -0.22 + c * 0.04, 0.36 - r * 0.14, 0.075, 0.012, 0.012, 0.02);
          lead.castShadow = false;
        }
      }
    }
    /* The uplink, thicker and orange. */
    var up = CYm(g, C(0xff8a3a, 0.45), 0.0, -0.38, 0.09, 0.016, 0.06, 8, 'z');
    up.castShadow = false;
    return done(g, 'patchPanel');
  };

  MODELS.upsCabinet = function () {
    var g = new THREE.Group();
    B(g, C(0x2b2e33, 0.55, 0.4), 0, 1.0, 0, 0.7, 2.0, 0.9);
    B(g, C(0x1e2126, 0.5), 0, 1.45, 0.455, 0.5, 0.28, 0.01);
    var scr = B(g, EM(0x35e07a), 0, 1.45, 0.462, 0.4, 0.16, 0.002);
    scr.castShadow = false;
    for (var i = 0; i < 5; i++) {
      var v = B(g, C(0x1a1c20, 0.7), 0, 0.35 + i * 0.11, 0.452, 0.55, 0.05, 0.006);
      v.castShadow = false;
    }
    return done(g, 'upsCabinet');
  };

  MODELS.crac = function () {
    var g = new THREE.Group();
    B(g, C(0xcfd3d6, 0.5, 0.5), 0, 1.1, 0, 1.6, 2.2, 0.9);
    /* Intake grille. */
    for (var i = 0; i < 14; i++) {
      var s = B(g, C(0x8f9498, 0.6, 0.6), 0, 0.35 + i * 0.11, 0.455, 1.4, 0.06, 0.01);
      s.rotation.x = 0.32;
      s.castShadow = false;
    }
    /* Control head. */
    B(g, C(0x2b2e33, 0.5), 0.55, 1.75, 0.46, 0.34, 0.24, 0.04);
    var scr = B(g, EM(0x7fd6ff), 0.55, 1.78, 0.482, 0.24, 0.1, 0.002);
    scr.castShadow = false;
    var led = B(g, EM(0x35e07a), 0.55, 1.66, 0.482, 0.02, 0.012, 0.002);
    led.castShadow = false;
    /* Ducting up into the ceiling. */
    B(g, C(0xa9adb1, 0.6, 0.5), 0, 2.35, -0.1, 1.0, 0.3, 0.6);
    g.userData.parts = { screen: scr, led: led };
    return done(g, 'crac');
  };

  MODELS.raisedFloorTile = function () {
    var g = new THREE.Group();
    var t = B(g, C(0x585e63, 0.45, 0.85), 0, 0.01, 0, 0.6, 0.02, 0.6);
    t.receiveShadow = true;
    /* Lift hole. */
    var hole = CYm(g, C(0x1a1c20, 0.8), 0.2, 0.021, 0.2, 0.015, 0.004, 8);
    hole.castShadow = false;
    return done(g, 'raisedFloorTile');
  };

  MODELS.kvmConsole = function () {
    var g = new THREE.Group();
    B(g, C(0x2b2e33, 0.5, 0.5), 0, 0.45, 0, 0.62, 0.9, 0.6);
    var desk = B(g, C(0x35383d, 0.5), 0, 0.92, 0.05, 0.66, 0.04, 0.5);
    /* Screen on a short arm. */
    var scr = new THREE.Group();
    B(scr, C(0x1c1e22, 0.5), 0, 0, 0, 0.42, 0.28, 0.03);
    var face = B(scr, EM(0x2f6f5a), 0, 0, 0.018, 0.38, 0.24, 0.002);
    face.castShadow = false;
    scr.position.set(0, 1.22, -0.06);
    scr.rotation.x = -0.16;
    g.add(scr);
    CYm(g, C(0x8f9498, 0.4, 0.85), 0, 1.05, -0.12, 0.015, 0.24, 8);
    /* Keyboard tray, pulled out. */
    var kbd = B(g, C(0x1f2226, 0.6), 0, 0.95, 0.28, 0.42, 0.02, 0.15);
    kbd.castShadow = false;
    g.userData.parts = { screen: face };
    return done(g, 'kvmConsole');
  };

  MODELS.tapeLibrary = function () {
    var g = new THREE.Group();
    B(g, C(0x25282c, 0.55, 0.4), 0, 1.0, 0, 0.9, 2.0, 0.8);
    var win = B(g, new THREE.MeshStandardMaterial({
      color: 0x1b2a2e, roughness: 0.1, transparent: true, opacity: 0.65
    }), 0, 1.3, 0.405, 0.6, 0.7, 0.01);
    win.castShadow = false;
    /* Cartridges behind the glass. */
    var mat = new THREE.MeshBasicMaterial({ color: 0x1c3a33, toneMapped: false });
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 9; c++) {
        var t = B(g, mat, -0.26 + c * 0.065, 1.02 + r * 0.08, 0.39, 0.05, 0.06, 0.006);
        t.castShadow = false;
      }
    }
    var led = B(g, EM(0x35e07a), 0.36, 1.86, 0.405, 0.018, 0.01, 0.004);
    led.castShadow = false;
    var act = 1;
    g.userData.setActivity = function (a) {
      if (Math.abs(a - act) < 0.05) return;
      act = a;
      mat.color.setRGB(0.11 * a, 0.23 * a, 0.2 * a);
      led.material = EM(a > 0.3 ? 0x35e07a : 0x552222);
    };
    return done(g, 'tapeLibrary');
  };

  MODELS.breakerPanel = function () {
    var g = new THREE.Group();
    B(g, C(0x9aa0a4, 0.5, 0.7), 0, 0, 0, 0.4, 0.6, 0.1);
    var door = B(g, C(0xa8aeb2, 0.45, 0.7), 0, 0, 0.055, 0.38, 0.58, 0.01);
    door.castShadow = false;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 2; c++) {
        var b = B(g, C(r === 6 ? 0xd23b3b : 0x2a2c30, 0.6),
          -0.07 + c * 0.14, 0.22 - r * 0.055, 0.05, 0.09, 0.03, 0.014);
        b.castShadow = false;
      }
    }
    return done(g, 'breakerPanel');
  };

  MODELS.halcyonCore = function () {
    var g = new THREE.Group();
    var H = 2.1, W = 1.2, D = 0.8;
    var black = new THREE.MeshStandardMaterial({
      color: 0x0d0f12, roughness: 0.32, metalness: 0.6
    });
    black.userData.shared = true;
    B(g, black, 0, H / 2, 0, W, H, D);
    /* Plinth. */
    B(g, C(0x15181c, 0.6, 0.5), 0, 0.04, 0, W + 0.1, 0.08, D + 0.1);
    /* Seams, with light leaking out of them. */
    var seam = new THREE.MeshBasicMaterial({ color: 0xff9a2e, toneMapped: false });
    var seams = [];
    for (var i = 0; i < 4; i++) {
      var s = B(g, seam, 0, 0.35 + i * 0.48, D / 2 + 0.002, W * 0.86, 0.006, 0.002);
      s.castShadow = false;
      seams.push(s);
    }
    /* The status column. */
    var colMat = new THREE.MeshBasicMaterial({ color: 0xffa83a, toneMapped: false });
    var column = B(g, colMat, W / 2 - 0.07, H / 2, D / 2 + 0.003, 0.035, H - 0.36, 0.004);
    column.castShadow = false;
    /* Hardened console recess at chest height. */
    B(g, C(0x07080a, 0.5), -0.18, 1.28, D / 2 - 0.02, 0.52, 0.3, 0.06);
    var recess = B(g, new THREE.MeshBasicMaterial({ color: 0x30160a, toneMapped: false }),
      -0.18, 1.28, D / 2 + 0.012, 0.44, 0.22, 0.002);
    recess.castShadow = false;
    /* Armoured fibre entering the top. */
    g.add(tube([[0.1, H, -0.1], [0.1, H + 0.4, -0.1], [0.4, H + 0.8, -0.5]],
      0.055, C(0x1a1c20, 0.7), 8, false));
    g.add(tube([[-0.15, H, -0.15], [-0.15, H + 0.5, -0.15], [-0.5, H + 0.9, -0.6]],
      0.04, C(0x22242a, 0.7), 8, false));
    /* No badge, no vendor name, no model number. */

    var glow = new THREE.Mesh(plnGeo(),
      new THREE.MeshBasicMaterial({
        color: 0xff9a2e, transparent: true, opacity: 0.08, depthWrite: false
      }));
    glow.scale.set(W * 2.2, H * 1.4, 1);
    glow.position.set(0, H / 2, D / 2 + 0.02);
    g.add(glow);

    var state = 'idle';
    g.userData.parts = { column: column, recess: recess, glow: glow };
    g.userData.setState = function (s) {
      state = s;
      var hex = s === 'alert' ? 0xff5a2a
        : (s === 'dying' ? 0xff2a14 : (s === 'dead' ? 0x1a1210 : 0xffa83a));
      colMat.color.setHex(hex);
      seam.color.setHex(hex);
      glow.material.color.setHex(hex);
      glow.material.opacity = s === 'dead' ? 0 : (s === 'dying' ? 0.18 : 0.08);
      recess.material.color.setHex(s === 'dead' ? 0x0a0a0c : 0x30160a);
    };
    g.userData.getState = function () { return state; };
    return done(g, 'halcyonCore');
  };

  /* ------------------------------------------------------------------ */
  /* Structure — stairs, rails, catwalk                                  */
  /* ------------------------------------------------------------------ */

  MODELS.stairFlight = function (opts) {
    opts = opts || {};
    var rise = opts.rise || 3.5, run = opts.run || 5.0, w = opts.w || 1.8;
    var n = Math.max(6, Math.round(rise / 0.19));
    var g = new THREE.Group();
    var tread = C(0x8d9296, 0.7, 0.3);
    var riserM = C(0x7a7f83, 0.75, 0.3);
    for (var i = 0; i < n; i++) {
      var y = (i + 1) * (rise / n);
      var z = (i + 0.5) * (run / n);
      var t = B(g, tread, 0, y - 0.02, z, w, 0.04, run / n + 0.03);
      t.receiveShadow = true;
      B(g, riserM, 0, y - (rise / n) / 2, z - (run / n) / 2, w, rise / n, 0.02);
      /* Nosing strip. */
      var no = B(g, C(0xd8c23a, 0.7), 0, y + 0.001, z + (run / n) / 2 - 0.02,
        w * 0.96, 0.004, 0.03);
      no.castShadow = false;
    }
    /* Stringers. */
    for (var s = -1; s <= 1; s += 2) {
      var str = B(g, C(0x6a6f73, 0.7, 0.4), s * (w / 2 + 0.03), rise / 2, run / 2,
        0.05, 0.24, Math.sqrt(rise * rise + run * run));
      str.rotation.x = -Math.atan2(rise, run);
    }
    return done(g, 'stairFlight');
  };

  MODELS.railings = function (opts) {
    opts = opts || {};
    var len = opts.len || 5.0, rise = opts.rise || 0;
    var g = new THREE.Group();
    var m = C(0x8d9296, 0.45, 0.85);
    var n = Math.max(3, Math.round(len / 0.9));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      CYm(g, m, 0, rise * t + 0.5, len * t, 0.018, 1.0, 6);
    }
    var rail = tube([[0, 1.0, 0], [0, rise + 1.0, len]], 0.022, m, 6, false);
    g.add(rail);
    var mid = tube([[0, 0.55, 0], [0, rise + 0.55, len]], 0.014, m, 6, false);
    g.add(mid);
    return done(g, 'railings');
  };

  MODELS.catwalk = function (opts) {
    opts = opts || {};
    var len = opts.len || 8, w = opts.w || 0.9;
    var g = new THREE.Group();
    var m = C(0x777c80, 0.6, 0.7);
    var deck = B(g, m, 0, 0.16, 0, w, 0.03, len);
    deck.receiveShadow = true;
    /* Grating. */
    for (var i = 0; i < Math.floor(len / 0.14); i++) {
      var b = B(g, C(0x666b6f, 0.65, 0.7), 0, 0.175, -len / 2 + i * 0.14, w - 0.04, 0.008, 0.02);
      b.castShadow = false;
    }
    for (var s = -1; s <= 1; s += 2) {
      B(g, m, s * w / 2, 0.1, 0, 0.03, 0.14, len);
      for (var p = 0; p <= Math.floor(len / 1.5); p++) {
        CYm(g, m, s * w / 2, 0.66, -len / 2 + p * 1.5, 0.016, 1.0, 6);
      }
      g.add(tube([[s * w / 2, 1.16, -len / 2], [s * w / 2, 1.16, len / 2]],
        0.02, m, 6, false));
    }
    return done(g, 'catwalk');
  };

  /* ------------------------------------------------------------------ */
  /* Street and roof                                                     */
  /* ------------------------------------------------------------------ */

  MODELS.neonSign = function (text, opts) {
    opts = opts || {};
    if (typeof text !== 'string') { opts = text || {}; text = opts.text || 'OPEN'; }
    var w = opts.w || 3.0, h = opts.h || 0.6;
    var col = opts.color === undefined ? 0x39d98a : opts.color;
    var g = new THREE.Group();
    /* Backing box. */
    B(g, C(0x15171a, 0.7), 0, 0, -0.03, w + 0.12, h + 0.12, 0.06);
    var tex = label(text, {
      w: 1024, h: 200, size: 108, color: '#ffffff', align: 'center'
    });
    if (tex) {
      var q = new THREE.Mesh(plnGeo(), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, toneMapped: false, color: col
      }));
      q.scale.set(w, h, 1);
      g.add(q);
      /* Halo. */
      var halo = new THREE.Mesh(plnGeo(), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, toneMapped: false, color: col,
        opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      halo.scale.set(w * 1.12, h * 1.5, 1);
      halo.position.z = 0.01;
      g.add(halo);
    } else {
      B(g, EM(col), 0, 0, 0, w * 0.8, h * 0.4, 0.01);
    }
    return done(g, 'neonSign');
  };

  MODELS.streetLamp = function () {
    var g = new THREE.Group();
    var m = C(0x2f3337, 0.6, 0.5);
    CYm(g, m, 0, 0.06, 0, 0.09, 0.12, 8);
    CYm(g, m, 0, 2.1, 0, 0.045, 4.0, 8);
    var arm = CYm(g, m, 0.35, 4.02, 0, 0.035, 0.8, 8, 'x');
    arm.rotation.z = 0.35;
    var head = B(g, m, 0.68, 3.9, 0, 0.34, 0.1, 0.22);
    var lens = B(g, EM(0xffe0a8), 0.68, 3.84, 0, 0.3, 0.02, 0.18);
    lens.castShadow = false;
    return done(g, 'streetLamp');
  };

  MODELS.trafficCone = function () {
    var g = new THREE.Group();
    B(g, C(0xe4571f, 0.75), 0, 0.015, 0, 0.3, 0.03, 0.3);
    var c = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 10), C(0xe4571f, 0.75));
    c.position.y = 0.27;
    c.castShadow = true;
    g.add(c);
    var band = CYm(g, C(0xe8e8e4, 0.7), 0, 0.31, 0, 0.073, 0.07, 10);
    band.castShadow = false;
    return done(g, 'trafficCone');
  };

  function carBody(g, colour, style) {
    var body = C(colour, 0.28, 0.15);
    var glass = new THREE.MeshStandardMaterial({
      color: 0x18242c, roughness: 0.08, metalness: 0.2,
      transparent: true, opacity: 0.72
    });
    glass.userData.shared = true;
    var L = style === 'van' ? 5.4 : 4.8;
    var W = style === 'van' ? 2.0 : 1.82;
    var bodyH = style === 'van' ? 1.5 : 0.62;
    var floorY = 0.42;

    B(g, body, 0, floorY + bodyH / 2, 0, W, bodyH, L);
    if (style === 'van') {
      B(g, glass, 0, floorY + bodyH - 0.15, L / 2 - 0.06, W * 0.85, 0.5, 0.04);
      B(g, body, 0, floorY + bodyH + 0.02, 0, W * 0.99, 0.05, L * 0.99);
    } else {
      /* Greenhouse. */
      var cab = B(g, body, 0, floorY + bodyH + 0.26, -0.15, W * 0.9, 0.52, L * 0.46);
      B(g, glass, 0, floorY + bodyH + 0.28, -0.15 + L * 0.23, W * 0.84, 0.44, 0.03);
      B(g, glass, 0, floorY + bodyH + 0.28, -0.15 - L * 0.23, W * 0.84, 0.44, 0.03);
      B(g, glass, W * 0.45, floorY + bodyH + 0.28, -0.15, 0.03, 0.42, L * 0.42);
      B(g, glass, -W * 0.45, floorY + bodyH + 0.28, -0.15, 0.03, 0.42, L * 0.42);
    }
    /* Bumpers, lights. */
    B(g, C(0x8d9296, 0.4, 0.9), 0, 0.5, L / 2 + 0.02, W * 0.98, 0.14, 0.08);
    B(g, C(0x8d9296, 0.4, 0.9), 0, 0.5, -L / 2 - 0.02, W * 0.98, 0.14, 0.08);
    var hl = B(g, EM(0xfff4dc), -W * 0.33, 0.72, L / 2 + 0.01, 0.3, 0.14, 0.03);
    hl.castShadow = false;
    var hr = B(g, EM(0xfff4dc), W * 0.33, 0.72, L / 2 + 0.01, 0.3, 0.14, 0.03);
    hr.castShadow = false;
    B(g, C(0xa8221c, 0.4), -W * 0.35, 0.76, -L / 2 - 0.01, 0.26, 0.16, 0.03);
    B(g, C(0xa8221c, 0.4), W * 0.35, 0.76, -L / 2 - 0.01, 0.26, 0.16, 0.03);
    /* Wheels. */
    var tyre = C(0x131315, 0.9);
    var rim = C(0xb9bec2, 0.35, 1);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (s) {
      var wx = s[0] * (W / 2 - 0.03), wz = s[1] * (L * 0.31);
      var t = CYm(g, tyre, wx, 0.33, wz, 0.33, 0.2, 12, 'x');
      var r = CYm(g, rim, wx + s[0] * 0.045, 0.33, wz, 0.19, 0.12, 10, 'x');
      r.castShadow = false;
    });
    return L;
  }

  MODELS.taxiCar = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var L = carBody(g, opts.color === undefined ? 0xd8d2bd : opts.color,
      opts.style || 'sedan');
    if (opts.plate) {
      var tex = label(opts.plate, {
        w: 256, h: 64, size: 34, color: '#1a1a1a', align: 'center', bg: '#e8e6dc'
      });
      if (tex) {
        var q = new THREE.Mesh(plnGeo(),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
        q.scale.set(0.36, 0.09, 1);
        q.position.set(0, 0.58, -L / 2 - 0.07);
        q.rotation.y = Math.PI;
        g.add(q);
      }
    }
    return done(g, 'taxiCar');
  };

  MODELS.laundryVan = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    carBody(g, opts.color === undefined ? 0xe8e6dc : opts.color, 'van');
    var tex = label('MERIDIAN GRAND · LAUNDRY', {
      w: 512, h: 96, size: 40, color: '#2b3a6b', align: 'center'
    });
    if (tex) {
      var dm = decalMat(tex);
      if (dm) {
        [-1, 1].forEach(function (s) {
          var q = new THREE.Mesh(plnGeo(), dm);
          q.scale.set(2.2, 0.4, 1);
          q.position.set(s * 1.01, 1.4, -0.3);
          q.rotation.y = s * Math.PI / 2;
          g.add(q);
        });
      }
    }
    /* Back doors, open, with a laundry cart half-loaded. */
    var cart = B(g, C(0xcfd3d6, 0.8), 0, 1.0, -2.2, 1.0, 0.9, 0.7);
    cart.castShadow = false;
    return done(g, 'laundryVan');
  };

  MODELS.aircon = function () {
    var g = new THREE.Group();
    B(g, C(0x9aa0a4, 0.6, 0.6), 0, 0.45, 0, 1.5, 0.9, 1.2);
    var fan = CYm(g, C(0x6a6f73, 0.6, 0.6), 0, 0.93, 0, 0.42, 0.08, 14);
    fan.castShadow = false;
    for (var i = 0; i < 5; i++) {
      var bl = B(g, C(0x565b5f, 0.6, 0.6), 0, 0.95, 0, 0.7, 0.01, 0.14);
      bl.rotation.y = i / 5 * Math.PI * 2;
      bl.castShadow = false;
    }
    B(g, C(0x7d8388, 0.65, 0.5), 0, 0.06, 0, 1.6, 0.12, 1.3);
    return done(g, 'aircon');
  };

  MODELS.roofVent = function () {
    var g = new THREE.Group();
    B(g, C(0x8d9296, 0.65, 0.5), 0, 0.16, 0, 0.7, 0.32, 0.7);
    var cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.24, 4), C(0x777c80, 0.65, 0.5));
    cap.position.y = 0.46;
    cap.rotation.y = Math.PI / 4;
    cap.castShadow = true;
    g.add(cap);
    return done(g, 'roofVent');
  };

  MODELS.satelliteDish = function () {
    var g = new THREE.Group();
    CYm(g, C(0x6a6f73, 0.6, 0.6), 0, 0.3, 0, 0.05, 0.6, 8);
    B(g, C(0x6a6f73, 0.6, 0.6), 0, 0.03, 0, 0.5, 0.06, 0.5);
    var dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, 0.6),
      C(0xd8dadc, 0.6));
    dish.rotation.x = 2.2;
    dish.position.set(0, 0.75, 0.1);
    dish.material.side = THREE.DoubleSide;
    dish.castShadow = true;
    g.add(dish);
    CYm(g, C(0x4a4f53, 0.6), 0, 0.78, 0.42, 0.03, 0.3, 6, 'z');
    return done(g, 'satelliteDish');
  };

  /* ------------------------------------------------------------------ */

  SG.models.__fillCount = 70;

})(window.SG, window.THREE);

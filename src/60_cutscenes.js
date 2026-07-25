/* ============================================================================
 * STEVE THE PC REPAIR MAN — 60_cutscenes.js   (AGENT E)
 *
 *   STV.Cine   — the cinematic engine: timeline of shots, real camera language
 *                (dolly, push-in, rack focus, handheld, whip pan, hard cut),
 *                letterbox, grain, chromatic aberration, desaturation,
 *                posed + lip-synced actors, fully skippable.
 *
 *   STV.Script — the screenplay. Nine scenes. This is the soul of the thing.
 *
 * Plain ES2019. No imports, no external assets, no network. Safari 14 safe.
 * Everything is guarded: if Geo / UI / Audio / Voice are missing we degrade,
 * we never crash, and we always resolve so the game can never deadlock.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  var Cine = {};
  var Script = {};
  STV.Cine = Cine;
  STV.Script = Script;

  /* =========================================================================
   * 0.  Micro-helpers (all THREE access is lazy — THREE may load after us)
   * =====================================================================*/

  function T() { return window.THREE; }
  function hasT() { return !!window.THREE; }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOf(n) {
    if (typeof n === 'function') return n;
    if (STV.easeByName) return STV.easeByName(n);
    return function (t) { return t; };
  }

  function emit(evt, payload) {
    try { STV.bus.emit(evt, payload); } catch (e) { STV.warn('[cine] emit', evt, e); }
  }
  function sfx(name, vol) {
    if (!name) return;
    emit('sfx', { name: name, vol: vol == null ? 1 : vol });
  }
  function music(track, fade) {
    emit('music', { track: track, fade: fade == null ? 1200 : fade });
  }
  function ambience(name, fade) {
    if (STV.Audio && STV.Audio.ambience) {
      try { STV.Audio.ambience(name, fade == null ? 900 : fade); } catch (e) {}
    }
  }

  /* Line length -> milliseconds. Voice module wins if it is present. */
  function estimateMs(text) {
    if (!text) return 0;
    if (STV.Voice && typeof STV.Voice.estimateMs === 'function') {
      try {
        var v = STV.Voice.estimateMs(text);
        if (v && isFinite(v) && v > 0) return v;
      } catch (e) {}
    }
    return Math.max(1500, 380 + text.length * 58);
  }

  /* =========================================================================
   * 1.  The cast — display names + voice ids (matches CONTRACT §4)
   * =====================================================================*/

  var CAST = {
    steve:    { name: 'STEVE',        voice: 'steve' },
    ellis:    { name: 'MS. ELLIS',    voice: 'ellis' },
    oleg:     { name: 'OLEG',         voice: 'oleg' },
    halloran: { name: 'HALLORAN',     voice: 'halloran' },
    petr:     { name: 'GUARD',        voice: 'petr' },
    kestrel:  { name: 'KESTREL',      voice: 'kestrel' },
    dispatch: { name: 'DISPATCH',     voice: 'dispatch' },
    narr:     { name: '',             voice: 'narr' },
    cat:      { name: 'KERNEL',       voice: null }
  };
  Script.CAST = CAST;

  /* Human build recipes — used when STV.Geo.human exists. */
  var BODY = {
    steve:    { height: 1.80, build: 'avg',   skin: 'light', hair: { style: 'short', color: 0x4a3a2c }, outfit: 'steve',    seed: 1101 },
    ellis:    { height: 1.54, build: 'slim',  skin: 'light', hair: { style: 'perm',  color: 0xd8d4cc }, outfit: 'ellis',    seed: 9301 },
    oleg:     { height: 1.88, build: 'heavy', skin: 'mid',   hair: { style: 'buzz',  color: 0x3a3632 }, outfit: 'oleg',     seed: 4404 },
    halloran: { height: 1.76, build: 'slim',  skin: 'light', hair: { style: 'short', color: 0x2b2320 }, outfit: 'halloran', seed: 7707 },
    petr:     { height: 1.82, build: 'avg',   skin: 'mid',   hair: { style: 'buzz',  color: 0x2b2320 }, outfit: 'guard',    seed: 2202 },
    traveller:{ height: 1.70, build: 'avg',   skin: 'deep',  hair: { style: 'bun',   color: 0x1e1a18 }, outfit: 'traveller',seed: 3303 }
  };
  Script.BODY = BODY;

  /* =========================================================================
   * 2.  FX overlay — camera-locked quads (no post-processing pipeline needed)
   *
   *  The camera is not in the scene graph, so the overlay lives in the scene
   *  and copies the camera's world transform every frame. Everything is
   *  depthTest:false + renderOrder high, so it always composites last.
   * =====================================================================*/

  function noiseTexture(seed, size) {
    var TH = T();
    var c = document.createElement('canvas');
    c.width = c.height = size || 128;
    var g = c.getContext('2d');
    var img = g.createImageData(c.width, c.height);
    var r = STV.rng(seed);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 110 + Math.floor(r() * 145);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new TH.CanvasTexture(c);
    t.wrapS = t.wrapT = TH.RepeatWrapping;
    t.minFilter = TH.NearestFilter;
    t.magFilter = TH.NearestFilter;
    return t;
  }

  /* Soft radial falloff — used for the fake depth-of-field / rack focus and
     for the vignette. Transparent in the middle, opaque at the rim. */
  function radialTexture(seed, inner, tint) {
    var TH = T();
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(128, 128, 256 * inner * 0.5, 128, 128, 150);
    grd.addColorStop(0, 'rgba(' + tint + ',0)');
    grd.addColorStop(0.55, 'rgba(' + tint + ',0.34)');
    grd.addColorStop(1, 'rgba(' + tint + ',1)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    return new TH.CanvasTexture(c);
  }

  /* Two offset fringes, warm on one side, cold on the other. Additive. */
  function aberrationTexture() {
    var TH = T();
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    var i, grd;
    var cfg = [
      { x: 108, col: '255,60,40' },
      { x: 148, col: '40,180,255' }
    ];
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < cfg.length; i++) {
      grd = g.createRadialGradient(cfg[i].x, 128, 40, cfg[i].x, 128, 138);
      grd.addColorStop(0, 'rgba(' + cfg[i].col + ',0)');
      grd.addColorStop(0.72, 'rgba(' + cfg[i].col + ',0.10)');
      grd.addColorStop(1, 'rgba(' + cfg[i].col + ',0.42)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
    return new TH.CanvasTexture(c);
  }

  /* A title / location card, drawn to canvas. No external fonts. */
  function cardTexture(title, sub) {
    var TH = T();
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    var g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    var px = 74;
    if (STV.fitText) px = STV.fitText(g, title || '', 880, 74, 'system-ui, sans-serif');
    g.font = '500 ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillStyle = 'rgba(240,162,75,0.96)';
    if (title) g.fillText(title, 512, sub ? 228 : 256);

    if (sub) {
      g.font = '400 27px monospace';
      g.fillStyle = 'rgba(206,214,222,0.80)';
      g.fillText(sub, 512, 300);
      g.strokeStyle = 'rgba(240,162,75,0.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(512 - 130, 268); g.lineTo(512 + 130, 268);
      g.stroke();
    }
    var t = new TH.CanvasTexture(c);
    t.minFilter = TH.LinearFilter;
    return t;
  }

  function FX() {
    this.root = null;
    this.scene = null;
    this.layers = {};
    this.grainTex = [];
    this.grainIdx = 0;
    this.time = 0;
    /* animated values: current + target, damped */
    this.v = { dof: 0, dofRadius: 0.55, aberr: 0, desat: 0, grain: 0.05, vignette: 0.24, bars: 0, flashA: 0 };
    this.tgt = { dof: 0, dofRadius: 0.55, aberr: 0, desat: 0, grain: 0.05, vignette: 0.24, bars: 0, flashA: 0 };
    this.flashColor = 0xffffff;
    this.cardMat = null;
    this.cardOn = 0;
    this.cardTgt = 0;
  }

  FX.prototype._plane = function (mat, order) {
    var TH = T();
    var geo = new TH.PlaneGeometry(1, 1);
    var m = new TH.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 4000 + (order || 0);
    m.matrixAutoUpdate = true;
    this.root.add(m);
    return m;
  };

  FX.prototype.attach = function (scene) {
    if (!hasT() || !scene) return;
    var TH = T();
    this.scene = scene;
    this.root = new TH.Group();
    this.root.frustumCulled = false;
    scene.add(this.root);

    function basic(opts) {
      var m = new TH.MeshBasicMaterial(opts);
      m.depthTest = false; m.depthWrite = false;
      m.transparent = true; m.fog = false;
      m.toneMapped = false;
      return m;
    }

    /* --- fake DOF / rack focus: a soft ring that eats the frame edges --- */
    this.dofTexA = radialTexture(11, 0.30, '10,12,15');
    this.layers.dof = this._plane(basic({ map: this.dofTexA, opacity: 0, color: 0xffffff }), 1);

    /* --- vignette (always on, subtle) --- */
    this.vigTex = radialTexture(12, 0.55, '0,0,0');
    this.layers.vignette = this._plane(basic({ map: this.vigTex, opacity: 0.2 }), 2);

    /* --- chromatic aberration (tension) --- */
    this.abTex = aberrationTexture();
    var abm = basic({ map: this.abTex, opacity: 0 });
    abm.blending = TH.AdditiveBlending;
    this.layers.aberr = this._plane(abm, 3);

    /* --- desaturation wash (the twist) --- */
    this.layers.desat = this._plane(basic({ color: 0x9aa0a6, opacity: 0 }), 4);

    /* --- film grain --- */
    this.grainTex = [noiseTexture(0x51ee, 128), noiseTexture(0x9a12, 128), noiseTexture(0x3c77, 128)];
    var gm = basic({ map: this.grainTex[0], opacity: 0.05 });
    gm.blending = TH.AdditiveBlending;
    this.layers.grain = this._plane(gm, 5);

    /* --- flash --- */
    this.layers.flash = this._plane(basic({ color: 0xffffff, opacity: 0 }), 6);

    /* --- letterbox bars (fallback / reinforcement for UI.letterbox) --- */
    var bm = basic({ color: 0x000000, opacity: 1 });
    bm.transparent = false;
    this.layers.barT = this._plane(bm, 7);
    this.layers.barB = this._plane(bm, 7);
    this.layers.barT.visible = this.layers.barB.visible = false;

    /* --- card (titles / location slugs) --- */
    this.cardMat = basic({ opacity: 0, color: 0xffffff });
    this.layers.card = this._plane(this.cardMat, 8);
    this.layers.card.visible = false;
  };

  FX.prototype.setCard = function (title, sub) {
    if (!this.cardMat) return;
    if (this.cardMat.map && this.cardMat.map.dispose) this.cardMat.map.dispose();
    if (!title && !sub) { this.cardTgt = 0; return; }
    this.cardMat.map = cardTexture(title, sub);
    this.cardMat.needsUpdate = true;
    this.layers.card.visible = true;
    this.cardTgt = 1;
  };
  FX.prototype.hideCard = function () { this.cardTgt = 0; };

  FX.prototype.setFlashColor = function (hex) {
    this.flashColor = hex;
    if (this.layers.flash) this.layers.flash.material.color.setHex(hex);
  };

  FX.prototype.flash = function (color, strength) {
    this.flashColor = color == null ? 0xffffff : color;
    if (this.layers.flash) this.layers.flash.material.color.setHex(this.flashColor);
    this.v.flashA = strength == null ? 1 : strength;
    this.tgt.flashA = 0;
  };

  FX.prototype.update = function (dt, camera) {
    if (!this.root || !camera) return;
    var TH = T();
    this.time += dt;

    /* follow the camera exactly */
    camera.updateMatrixWorld();
    this.root.position.setFromMatrixPosition(camera.matrixWorld);
    this.root.quaternion.setFromRotationMatrix(camera.matrixWorld);

    /* damp every animated value */
    var k;
    for (k in this.tgt) {
      if (!Object.prototype.hasOwnProperty.call(this.tgt, k)) continue;
      this.v[k] = STV.damp(this.v[k], this.tgt[k], 6.5, dt);
    }
    this.cardOn = STV.damp(this.cardOn, this.cardTgt, 5.0, dt);

    /* frustum-filling plane size at distance d */
    var d = 0.32;
    var fov = camera.fov || 55;
    var h = 2 * d * Math.tan(fov * Math.PI / 360);
    var w = h * (camera.aspect || 1.777);

    var names = ['dof', 'vignette', 'aberr', 'desat', 'grain', 'flash', 'card'];
    for (var i = 0; i < names.length; i++) {
      var L = this.layers[names[i]];
      if (!L) continue;
      L.position.set(0, 0, -d);
      L.scale.set(w * 1.02, h * 1.02, 1);
    }

    /* rack focus: the blur ring tightens/loosens around the focus target */
    if (this.layers.dof) {
      this.layers.dof.material.opacity = clamp(this.v.dof, 0, 1) * 0.92;
      this.layers.dof.visible = this.v.dof > 0.004;
      var s = lerp(1.55, 0.72, clamp(this.v.dofRadius, 0, 1));
      this.layers.dof.scale.set(w * s, h * s, 1);
    }
    if (this.layers.vignette) this.layers.vignette.material.opacity = clamp(this.v.vignette, 0, 1);
    if (this.layers.aberr) {
      this.layers.aberr.material.opacity = clamp(this.v.aberr, 0, 1) * 0.85;
      this.layers.aberr.visible = this.v.aberr > 0.004;
      /* breathe the fringe so it reads as lens, not decal */
      var wob = 1 + 0.02 * Math.sin(this.time * 1.7);
      this.layers.aberr.scale.set(w * 1.04 * wob, h * 1.04 * wob, 1);
    }
    if (this.layers.desat) {
      this.layers.desat.material.opacity = clamp(this.v.desat, 0, 1) * 0.62;
      this.layers.desat.visible = this.v.desat > 0.004;
    }
    if (this.layers.flash) {
      this.layers.flash.material.opacity = clamp(this.v.flashA, 0, 1);
      this.layers.flash.visible = this.v.flashA > 0.004;
    }
    if (this.layers.grain) {
      var gl = this.layers.grain;
      gl.material.opacity = clamp(this.v.grain, 0, 1);
      gl.visible = this.v.grain > 0.004 && STV.quality !== 'low';
      /* cheap animation: swap between three tiles + jitter the offset */
      this.grainIdx += dt * 24;
      var gi = Math.floor(this.grainIdx) % this.grainTex.length;
      if (gl.material.map !== this.grainTex[gi]) {
        gl.material.map = this.grainTex[gi];
        gl.material.needsUpdate = true;
      }
      if (gl.material.map) {
        gl.material.map.offset.set(STV.noise1(this.time * 31) * 0.5, STV.noise1(this.time * 27 + 90) * 0.5);
        gl.material.map.repeat.set(3.2, 3.2 / ((camera.aspect || 1.777)));
      }
    }
    if (this.layers.card) {
      this.cardMat.opacity = clamp(this.cardOn, 0, 1);
      this.layers.card.visible = this.cardOn > 0.01;
      var cs = lerp(1.02, 1.0, clamp(this.cardOn, 0, 1));
      this.layers.card.scale.set(w * cs, h * 0.5 * cs, 1);
    }

    /* letterbox bars (our own, in case UI is absent) */
    var bars = clamp(this.v.bars, 0, 1);
    var bh = h * 0.115 * bars;
    if (this.layers.barT) {
      var on = bars > 0.005;
      this.layers.barT.visible = this.layers.barB.visible = on;
      if (on) {
        this.layers.barT.scale.set(w * 1.05, bh, 1);
        this.layers.barB.scale.set(w * 1.05, bh, 1);
        this.layers.barT.position.set(0, h * 0.5 - bh * 0.5, -d * 0.98);
        this.layers.barB.position.set(0, -h * 0.5 + bh * 0.5, -d * 0.98);
      }
    }
    if (TH) { /* keep the linter honest about TH usage */ }
  };

  FX.prototype.detach = function () {
    if (!this.root) return;
    if (this.root.parent) this.root.parent.remove(this.root);
    if (STV.disposeObject) { try { STV.disposeObject(this.root); } catch (e) {} }
    var i;
    for (i = 0; i < this.grainTex.length; i++) { if (this.grainTex[i].dispose) this.grainTex[i].dispose(); }
    this.grainTex.length = 0;
    this.root = null;
    this.layers = {};
  };

  /* =========================================================================
   * 3.  Stage — every cutscene builds its own actors and hero props so it can
   *     never depend on a level that might not be finished loading.
   * =====================================================================*/

  /* Fallback body when STV.Geo.human is unavailable: readable in silhouette,
     supports setPose/update so the rest of the engine does not care. */
  function fallbackHuman(cfg) {
    var TH = T();
    var g = new TH.Group();
    var hgt = (cfg && cfg.height) || 1.78;
    var mat = null;
    if (STV.Mat && STV.Mat.get) { try { mat = STV.Mat.get('clothNavy'); } catch (e) { mat = null; } }
    if (!mat) mat = new TH.MeshStandardMaterial({ color: 0x39414d, roughness: 0.9 });
    var skin = null;
    if (STV.Mat && STV.Mat.get) { try { skin = STV.Mat.get('skinLight'); } catch (e2) { skin = null; } }
    if (!skin) skin = new TH.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.8 });

    var body = new TH.Mesh(new TH.CylinderGeometry(0.17, 0.22, hgt * 0.55, 10), mat);
    body.position.y = hgt * 0.55;
    g.add(body);
    var head = new TH.Mesh(new TH.SphereGeometry(0.115, 12, 10), skin);
    head.position.y = hgt * 0.92;
    g.add(head);
    var legs = new TH.Mesh(new TH.CylinderGeometry(0.15, 0.13, hgt * 0.44, 8), mat);
    legs.position.y = hgt * 0.22;
    g.add(legs);

    g.rig = { head: head, root: g, jaw: null };
    g.userData.size = new TH.Vector3(0.5, hgt, 0.35);
    g._pose = 'idle';
    g.setPose = function (p) { g._pose = p; };
    g.update = function (dt, opts) {
      var t = (g._t = (g._t || 0) + dt);
      var talk = opts && opts.talking;
      head.position.y = hgt * 0.92 + (talk ? Math.sin(t * 22) * 0.006 : Math.sin(t * 1.3) * 0.003);
      body.rotation.y = Math.sin(t * 0.7) * 0.02;
    };
    return g;
  }

  function fallbackProp(w, h, d, color) {
    var TH = T();
    var g = new TH.Group();
    var m = new TH.Mesh(new TH.BoxGeometry(w || 0.4, h || 0.4, d || 0.4),
      new TH.MeshStandardMaterial({ color: color == null ? 0x4a4f56 : color, roughness: 0.8 }));
    m.position.y = (h || 0.4) * 0.5;
    g.add(m);
    g.userData.size = new TH.Vector3(w || 0.4, h || 0.4, d || 0.4);
    return g;
  }

  function Stage(scene, anchor, yaw) {
    var TH = T();
    this.group = new TH.Group();
    this.group.position.copy(anchor || new TH.Vector3());
    this.group.rotation.y = yaw || 0;
    this.actors = {};
    this.props = {};
    this._scene = scene;
    if (scene) scene.add(this.group);
  }

  /* Create (or fetch) an actor. id doubles as the CAST/BODY key. */
  Stage.prototype.actor = function (id, x, z, yawDeg, pose) {
    if (this.actors[id]) return this.actors[id];
    var TH = T();
    var cfg = BODY[id] || BODY.steve;
    var body = null;
    if (STV.Geo && typeof STV.Geo.human === 'function') {
      try { body = STV.Geo.human(cfg); } catch (e) { body = null; }
    }
    if (!body) body = fallbackHuman(cfg);
    var holder = new TH.Group();
    holder.add(body);
    holder.position.set(x || 0, 0, z || 0);
    holder.rotation.y = (yawDeg || 0) * Math.PI / 180;
    this.group.add(holder);
    var A = {
      id: id, obj: holder, body: body, talking: 0,
      look: null, pose: pose || 'idle'
    };
    if (body.setPose) { try { body.setPose(A.pose); } catch (e2) {} }
    this.actors[id] = A;
    return A;
  };

  Stage.prototype.cat = function (x, y, z, state) {
    if (this.props.__cat) return this.props.__cat;
    var TH = T();
    var g = null;
    if (STV.Geo && typeof STV.Geo.cat === 'function') {
      try { g = STV.Geo.cat({ seed: 6142 }); } catch (e) { g = null; }
    }
    if (!g) {
      g = fallbackProp(0.42, 0.26, 0.18, 0x8b8177);
      g.update = function () {};
    }
    g.position.set(x || 0, y || 0, z || 0);
    this.group.add(g);
    g.__state = state || 'sit';
    this.props.__cat = g;
    return g;
  };

  /* Place a Geo prop by name with a graceful box fallback. */
  Stage.prototype.prop = function (id, geoName, args, x, y, z, yawDeg, fb) {
    var TH = T();
    var g = null;
    if (STV.Geo && typeof STV.Geo[geoName] === 'function') {
      try { g = STV.Geo[geoName].apply(STV.Geo, args || []); } catch (e) { g = null; }
    }
    if (!g) {
      fb = fb || [0.4, 0.4, 0.4, 0x4a4f56];
      g = fallbackProp(fb[0], fb[1], fb[2], fb[3]);
    }
    g.position.set(x || 0, y || 0, z || 0);
    g.rotation.y = (yawDeg || 0) * Math.PI / 180;
    this.group.add(g);
    if (id) this.props[id] = g;
    return g;
  };

  Stage.prototype.ambient = function (sky, ground, intensity) {
    var TH = T();
    var L = new TH.HemisphereLight(sky == null ? 0x8fa4c0 : sky,
                                   ground == null ? 0x2a2622 : ground,
                                   intensity == null ? 0.7 : intensity);
    this.group.add(L);
    return L;
  };

  Stage.prototype.light = function (color, intensity, x, y, z, dist) {
    var TH = T();
    var L = new TH.PointLight(color == null ? 0xffe6c0 : color, intensity == null ? 1 : intensity, dist || 9, 2);
    L.position.set(x || 0, y == null ? 2.2 : y, z || 0);
    this.group.add(L);
    return L;
  };

  /* stage-local [x,y,z] -> world Vector3 */
  Stage.prototype.toWorld = function (p, out) {
    var TH = T();
    var v = out || new TH.Vector3();
    v.set(p[0], p[1], p[2]);
    this.group.updateMatrixWorld();
    return v.applyMatrix4(this.group.matrixWorld);
  };

  Stage.prototype.update = function (dt) {
    var id;
    for (id in this.actors) {
      if (!Object.prototype.hasOwnProperty.call(this.actors, id)) continue;
      var A = this.actors[id];
      if (!A.body || !A.body.update) continue;
      try {
        A.body.update(dt, { speed: A.speed || 0, talking: A.talking > 0, look: A.look || null });
      } catch (e) {}
      if (A.talking > 0) A.talking -= dt;
    }
    var c = this.props.__cat;
    if (c && c.update) { try { c.update(dt, { state: c.__state }); } catch (e2) {} }
  };

  Stage.prototype.dispose = function () {
    if (!this.group) return;
    if (this.group.parent) this.group.parent.remove(this.group);
    if (STV.disposeObject) { try { STV.disposeObject(this.group); } catch (e) {} }
    this.group = null;
    this.actors = {};
    this.props = {};
  };

  /* =========================================================================
   * 4.  The engine
   * =====================================================================*/

  var SCENES = {};
  var S = null;   /* live playback state */

  Cine.playing = false;

  Cine.register = function (id, def) {
    if (!id || !def) return;
    def.id = id;
    SCENES[id] = def;
  };
  Cine.has = function (id) { return !!SCENES[id]; };
  Cine.list = function () {
    var out = [], k;
    for (k in SCENES) if (Object.prototype.hasOwnProperty.call(SCENES, k)) out.push(k);
    return out;
  };
  Script.scenes = SCENES;

  function resolveAnchor(ctx) {
    var TH = T();
    var v = new TH.Vector3(0, 0, 0);
    var yaw = 0;
    if (ctx && ctx.level && ctx.level.spawn && ctx.level.spawn.pos) {
      v.copy(ctx.level.spawn.pos);
      if (typeof ctx.level.spawn.yaw === 'number') yaw = ctx.level.spawn.yaw;
    } else if (ctx && ctx.player && ctx.player.pos) {
      v.copy(ctx.player.pos);
      if (typeof ctx.player.yaw === 'number') yaw = ctx.player.yaw;
    }
    return { pos: v, yaw: yaw };
  }

  function lineMsOf(line) {
    if (!line || !line.text) return 0;
    if (line.ms) return Math.max(line.ms, estimateMs(line.text));
    return estimateMs(line.text);
  }

  function shotDuration(shot) {
    var base = shot.dur == null ? 2.6 : shot.dur;
    var lm = lineMsOf(shot.line) / 1000;
    var d = Math.max(base, lm + (shot.line ? 0.42 : 0));
    if (shot.hold) d += shot.hold;
    return Math.max(0.12, d);
  }

  /* ---- camera application ------------------------------------------------ */

  var _p0 = null, _p1 = null, _l0 = null, _l1 = null, _tmp = null, _look = null;
  function ensureVecs() {
    var TH = T();
    if (_p0) return;
    _p0 = new TH.Vector3(); _p1 = new TH.Vector3();
    _l0 = new TH.Vector3(); _l1 = new TH.Vector3();
    _tmp = new TH.Vector3(); _look = new TH.Vector3();
  }

  function applyCam(shot, k, dt) {
    if (!S || !S.camera || !shot.cam) return;
    ensureVecs();
    var cam = S.camera;
    var c = shot.cam;
    var from = c.from || c.to;
    var to = c.to || c.from;
    if (!from) return;

    var e = easeOf(c.ease || 'inOutSine')(clamp(k, 0, 1));

    /* whip pan: hold, snap, settle — a violent S curve on the look target */
    if (c.whip) {
      var w = clamp(k, 0, 1);
      e = w < 0.34 ? (w / 0.34) * 0.06
        : (w < 0.60 ? 0.06 + STV.ease.inOutCubic((w - 0.34) / 0.26) * 0.99
          : 1 + Math.sin((w - 0.60) / 0.40 * Math.PI) * 0.012);
    }

    S.stage.toWorld(from.pos || [0, 1.6, 0], _p0);
    S.stage.toWorld(to.pos || from.pos || [0, 1.6, 0], _p1);
    S.stage.toWorld(from.look || [0, 1.5, 1], _l0);
    S.stage.toWorld(to.look || from.look || [0, 1.5, 1], _l1);

    _tmp.copy(_p0).lerp(_p1, e);
    _look.copy(_l0).lerp(_l1, e);

    /* handheld micro-shake — always a little, more when asked */
    var amp = c.shake;
    if (amp == null) amp = shot.shake;
    if (amp == null) amp = 0.012;
    if (STV.reduceMotion) amp *= 0.25;
    if (amp > 0) {
      var t = S.clock * (c.shakeSpeed || 1.35);
      _tmp.x += STV.noise1(t) * amp;
      _tmp.y += STV.noise1(t + 31.7) * amp * 0.8;
      _tmp.z += STV.noise1(t + 71.3) * amp * 0.6;
      _look.x += STV.noise1(t * 0.7 + 11) * amp * 1.4;
      _look.y += STV.noise1(t * 0.7 + 53) * amp * 1.1;
    }

    cam.position.copy(_tmp);
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);

    /* dutch / roll */
    var r0 = from.roll || 0, r1 = to.roll == null ? r0 : to.roll;
    var roll = lerp(r0, r1, e);
    if (roll) cam.rotateZ(roll * Math.PI / 180);

    var f0 = from.fov || 40, f1 = to.fov == null ? f0 : to.fov;
    var nf = lerp(f0, f1, e);
    if (Math.abs(cam.fov - nf) > 0.001) { cam.fov = nf; cam.updateProjectionMatrix(); }
    if (dt) { /* nothing else per-frame */ }
  }

  /* ---- shot entry -------------------------------------------------------- */

  function enterShot(i) {
    if (!S) return;
    var shot = S.def.shots[i];
    if (!shot) return;
    S.index = i;
    S.shotT = 0;
    S.shotDur = shotDuration(shot);
    runShotSideEffects(shot, false);
    /* a hard CUT snaps the camera instantly, no interpolation from the last shot */
    if (shot.cut && shot.cam) applyCam(shot, 0, 0);
  }

  function runShotSideEffects(shot, skipping) {
    if (!shot || shot._ran) return;
    shot._ran = true;

    if (shot.sfx) sfx(shot.sfx, shot.sfxVol);
    if (shot.music) music(shot.music, shot.musicFade);
    if (shot.ambience) ambience(shot.ambience);

    /* poses */
    if (shot.pose) {
      var id;
      for (id in shot.pose) {
        if (!Object.prototype.hasOwnProperty.call(shot.pose, id)) continue;
        var A = S.stage.actors[id];
        if (A && A.body && A.body.setPose) {
          try { A.body.setPose(shot.pose[id]); A.pose = shot.pose[id]; } catch (e) {}
        }
      }
    }

    if (shot.do) {
      try { shot.do(S.ctx, S.stage, skipping); } catch (e2) { STV.warn('[cine] shot.do', S.def.id, e2); }
    }

    if (skipping) return;   /* no lines, no cards, no fx targets when skipping */

    if (shot.card !== undefined) {
      if (shot.card === null) S.fx.hideCard();
      else S.fx.setCard(shot.card.title, shot.card.sub);
    }
    if (shot.flashColor != null) S.fx.setFlashColor(shot.flashColor);
    if (shot.fxNow) {
      var fn = shot.fxNow, kn;
      for (kn in fn) {
        if (!Object.prototype.hasOwnProperty.call(fn, kn)) continue;
        if (S.fx.tgt[kn] === undefined) continue;
        S.fx.v[kn] = fn[kn];
        S.fx.tgt[kn] = fn[kn];
      }
    }
    if (shot.fx) {
      var f = shot.fx, kk;
      for (kk in f) {
        if (!Object.prototype.hasOwnProperty.call(f, kk)) continue;
        if (kk === 'flash') { S.fx.flash(f.flash.color, f.flash.strength); continue; }
        if (S.fx.tgt[kk] !== undefined) S.fx.tgt[kk] = f[kk];
      }
    }
    if (shot.dof) {
      S.fx.tgt.dof = shot.dof.blur == null ? 0 : shot.dof.blur;
      S.fx.tgt.dofRadius = shot.dof.focus == null ? 0.5 : clamp(shot.dof.focus, 0, 1);
    }

    if (shot.line && shot.line.text) speak(shot.line);
  }

  function speak(line) {
    var who = line.who || 'narr';
    var cast = CAST[who] || { name: who.toUpperCase(), voice: who };
    var ms = lineMsOf(line);
    var A = S.stage.actors[who];
    if (A) A.talking = ms / 1000;
    S.spokeCount++;
    emit('dialogue:line', {
      speaker: line.name || cast.name,
      text: line.text,
      ms: ms,
      voice: line.voice || cast.voice
    });
    if (STV.Audio && STV.Audio.duckFor) { try { STV.Audio.duckFor(ms); } catch (e) {} }
  }

  /* ---- input: one press skips ------------------------------------------- */

  var _unbind = null;
  function bindSkip() {
    unbindSkip();
    var armed = false;
    var armT = setTimeout(function () { armed = true; }, 380);

    function go(ev) {
      if (!armed || !Cine.playing) return;
      if (ev && ev.type === 'keydown') {
        var kc = ev.keyCode || 0;
        /* Esc, Space, Enter, E, or any key really — but let F-keys through */
        if (kc >= 112 && kc <= 123) return;
      }
      Cine.skip();
    }
    var opts = { passive: true };
    try {
      window.addEventListener('keydown', go, false);
      window.addEventListener('pointerdown', go, opts);
      window.addEventListener('touchstart', go, opts);
    } catch (e) {}
    var offBus = STV.bus.on('cine:skip', function () { if (armed) Cine.skip(); });

    _unbind = function () {
      clearTimeout(armT);
      try {
        window.removeEventListener('keydown', go, false);
        window.removeEventListener('pointerdown', go, opts);
        window.removeEventListener('touchstart', go, opts);
      } catch (e2) {}
      if (offBus) offBus();
    };
  }
  function unbindSkip() { if (_unbind) { _unbind(); _unbind = null; } }

  /* ---- play / update / finish ------------------------------------------- */

  Cine.play = function (id, ctx) {
    var d = STV.defer();

    if (Cine.playing) { try { Cine.skip(); } catch (e) {} }

    var def = SCENES[id];
    if (!def || !hasT() || !ctx || !ctx.camera) {
      /* never deadlock the game */
      STV.warn('[cine] cannot play "' + id + '" — resolving immediately');
      emit('cine:start', { id: id });
      emit('cine:end', { id: id, skipped: true });
      setTimeout(function () { d.resolve({ id: id, skipped: true }); }, 0);
      return d.promise;
    }

    var anchor = resolveAnchor(ctx);
    if (def.anchor) {
      /* scene may nudge its own origin, in level-local metres */
      anchor.pos.x += def.anchor[0] || 0;
      anchor.pos.y += def.anchor[1] || 0;
      anchor.pos.z += def.anchor[2] || 0;
    }
    if (typeof def.yaw === 'number') anchor.yaw = def.yaw;

    var i;
    for (i = 0; i < def.shots.length; i++) def.shots[i]._ran = false;

    S = {
      def: def, ctx: ctx, camera: ctx.camera, scene: ctx.scene,
      stage: new Stage(ctx.scene, anchor.pos, anchor.yaw),
      fx: new FX(),
      index: -1, shotT: 0, shotDur: 0, clock: 0,
      defer: d, done: false, spokeCount: 0,
      savedFov: ctx.camera.fov
    };
    S.fx.attach(ctx.scene);

    /* hide the player's own body — the cutscene stages its own Steve */
    if (ctx.player && ctx.player.setVisible) { try { ctx.player.setVisible(false); } catch (e2) {} }

    /* montage scenes own the whole frame: park the staging level */
    if (def.hideLevel && ctx.level && ctx.level.root) {
      S.hidLevel = ctx.level.root;
      S.hidLevelWas = ctx.level.root.visible;
      ctx.level.root.visible = false;
    }

    Cine.playing = true;
    emit('cine:start', { id: id });
    if (STV.UI && STV.UI.setMode) { try { STV.UI.setMode('cine'); } catch (e3) {} }

    if (def.letterbox !== false) {
      S.fx.tgt.bars = 1;
      if (STV.UI && STV.UI.letterbox) { try { STV.UI.letterbox(true, 520); } catch (e4) {} }
    }
    S.fx.tgt.grain = def.grain == null ? 0.055 : def.grain;
    S.fx.tgt.vignette = def.vignette == null ? 0.26 : def.vignette;

    if (def.music) music(def.music, def.musicFade == null ? 1400 : def.musicFade);
    if (def.ambience) ambience(def.ambience);

    if (def.build) {
      try { def.build(ctx, S.stage); } catch (e5) { STV.warn('[cine] build', id, e5); }
    }

    bindSkip();
    enterShot(0);
    return d.promise;
  };

  Cine.update = function (dt) {
    if (!S || !Cine.playing) return;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    S.clock += dt;
    S.shotT += dt;

    var shot = S.def.shots[S.index];
    if (shot) {
      var k = S.shotDur > 0 ? S.shotT / S.shotDur : 1;
      applyCam(shot, k, dt);
      if (shot.tick) { try { shot.tick(S.ctx, S.stage, clamp(k, 0, 1), dt); } catch (e) {} }
    }

    S.stage.update(dt);
    S.fx.update(dt, S.camera);

    if (S.shotT >= S.shotDur) {
      var next = S.index + 1;
      if (next >= S.def.shots.length) { finish(false); return; }
      enterShot(next);
    }
  };

  Cine.skip = function () {
    if (!S || !Cine.playing) return;
    finish(true);
  };

  function finish(skipped) {
    if (!S || S.done) return;
    S.done = true;
    var def = S.def;
    var ctx = S.ctx;
    var id = def.id;

    /* run every side effect the player did not see, so the world state is
       identical whether they watched or skipped */
    if (skipped) {
      var i;
      for (i = 0; i < def.shots.length; i++) {
        if (!def.shots[i]._ran) runShotSideEffects(def.shots[i], true);
      }
      if (STV.Voice && STV.Voice.cancel) { try { STV.Voice.cancel(); } catch (e) {} }
    }

    unbindSkip();
    emit('dialogue:end');

    if (def.onEnd) { try { def.onEnd(ctx, S.stage, skipped); } catch (e2) { STV.warn('[cine] onEnd', id, e2); } }

    if (STV.UI && STV.UI.letterbox) { try { STV.UI.letterbox(false, 420); } catch (e3) {} }

    if (S.camera && S.savedFov) {
      S.camera.fov = S.savedFov;
      S.camera.updateProjectionMatrix();
    }
    if (ctx && ctx.player && ctx.player.setVisible) { try { ctx.player.setVisible(true); } catch (e4) {} }
    if (S.hidLevel) S.hidLevel.visible = S.hidLevelWas !== false;

    S.fx.detach();
    S.stage.dispose();

    var d = S.defer;
    var spoke = S.spokeCount;
    S = null;
    Cine.playing = false;
    emit('cine:end', { id: id, skipped: !!skipped, lines: spoke });
    d.resolve({ id: id, skipped: !!skipped });
  }

  /* Emergency stop — used by Game when it tears down mid-scene. */
  Cine.stop = function () { if (S) finish(true); };

  /* =========================================================================
   * 5.  Authoring sugar for the screenplay below
   * =====================================================================*/

  function L(who, text, voice) {
    return { who: who, text: text, voice: voice || null };
  }
  function cam(fromPos, fromLook, toPos, toLook, fov, fov2) {
    return {
      from: { pos: fromPos, look: fromLook, fov: fov || 40 },
      to: { pos: toPos || fromPos, look: toLook || fromLook, fov: fov2 == null ? (fov || 40) : fov2 }
    };
  }
  function hold(pos, look, fov) {
    return { from: { pos: pos, look: look, fov: fov || 40 }, to: { pos: pos, look: look, fov: fov || 40 } };
  }
  Script.L = L;
  Script.cam = cam;
  Script.hold = hold;

  /* =========================================================================
   * 6.  SCENES — registered as stubs first so the game is always runnable,
   *     then replaced with the full staging below.
   * =====================================================================*/

  var SCENE_IDS = ['c_intro', 'c_ellis_out', 'c_oleg', 'c_depart', 'c_arrival',
                   'c_kestrel', 'c_twist', 'c_choice', 'c_epilogue'];
  Script.IDS = SCENE_IDS;

  (function registerStubs() {
    for (var i = 0; i < SCENE_IDS.length; i++) {
      (function (id) {
        Cine.register(id, {
          id: id, letterbox: true,
          shots: [{ dur: 1.2, cam: hold([0, 1.55, 0], [0, 1.5, 2], 42) }]
        });
      })(SCENE_IDS[i]);
    }
  })();

  /* =========================================================================
   * 7.  SETS
   *
   *  Every set is built in stage-local metres. The stage origin sits on the
   *  level spawn point, +Z runs "into" the room. Cutscene cameras are close
   *  and tight, so a set that disagrees slightly with the level geometry
   *  behind it still reads correctly.
   * =====================================================================*/

  /* Kilbride Computer Repair — bench, beige tower, the good lamp, the cat. */
  function setShop(st, opts) {
    opts = opts || {};
    st.prop('bench', 'workbench', [2.4], 0, 0, 3.35, 0, [2.4, 0.92, 0.72, 0x6b5744]);
    st.prop('stool', 'stool', [], 0.95, 0, 3.9, 0, [0.4, 0.62, 0.4, 0x33363b]);
    st.prop('chair', 'officeChair', [], -0.75, 0, 2.25, 180, [0.6, 0.95, 0.6, 0x2e3238]);
    st.prop('tower', 'pcTowerBeige', [], 0.30, 0.92, 3.30, -14, [0.19, 0.42, 0.45, 0xd9d2bd]);
    st.prop('crt', 'crtMonitor', [15], -0.55, 0.92, 3.45, -8, [0.42, 0.38, 0.40, 0xd9d2bd]);
    st.prop('keyb', 'keyboard', [], -0.50, 0.92, 3.02, -6, [0.44, 0.03, 0.16, 0xcfc8b4]);
    st.prop('lamp', 'deskLamp', [], 1.05, 0.92, 3.44, 200, [0.18, 0.42, 0.18, 0x2b2e33]);
    st.prop('iron', 'solderingStation', [], -1.45, 0.92, 3.40, 12, [0.28, 0.16, 0.22, 0x36393f]);
    st.prop('bin', 'partsBin', [], 1.55, 0.92, 3.30, 0, [0.30, 0.16, 0.22, 0x3d4147]);
    st.prop('duck', 'rubberDuck', [], 0.86, 0.92, 3.06, 30, [0.09, 0.09, 0.11, 0xf2c400]);
    st.prop('mug', 'coffeeMug', [], -1.02, 0.92, 3.06, 0, [0.09, 0.10, 0.09, 0x8a3b2e]);
    st.prop('cmos', 'cmosBattery', [], 0.30, 0.93, 2.98, 0, [0.03, 0.006, 0.03, 0xc9ccd2]);
    st.prop('driver', 'screwdriver', [], 0.62, 0.93, 3.00, 74, [0.02, 0.02, 0.20, 0xb43a2c]);
    st.prop('clock', 'wallClock', [], -1.9, 2.05, 4.35, 0, [0.28, 0.28, 0.05, 0xe4e0d6]);
    st.prop('peg', 'pegboard', [2.2, 1.2], 0.2, 1.35, 4.45, 0, [2.2, 1.2, 0.05, 0x8a6f4a]);
    st.prop('chime', 'doorChime', [], 1.62, 2.02, 0.15, 0, [0.06, 0.16, 0.02, 0xb08a3c]);
    if (opts.cat !== false) st.cat(-1.62, 0.92, 3.24, 'sleep');
    st.light(0xffe2b4, 1.25, 0.1, 2.45, 3.1, 8.5);
    st.light(0x9fc6ff, 0.42, 1.5, 2.3, 0.6, 7.0);
    return st;
  }

  /* The parking lot outside Unit 9. Ms. Ellis's twenty-year-old sedan. */
  function setLot(st) {
    st.prop('car', 'car', [0x8d3f36, 'sedan'], 3.60, 0, 2.10, 96, [4.4, 1.45, 1.8, 0x8d3f36]);
    st.prop('car2', 'car', [0x2b3138, 'van'], 6.90, 0, 3.40, 96, [4.9, 2.0, 2.0, 0x2b3138]);
    st.prop('lamp', 'streetLamp', [], 5.20, 0, -1.30, 0, [0.16, 5.0, 0.16, 0x4d5157]);
    st.prop('hedge', 'hedge', [5], 0.0, 0, 7.20, 0, [5.0, 0.9, 0.6, 0x3f5a34]);
    st.prop('bollard', 'bollard', [], 1.10, 0, 0.60, 0, [0.16, 0.9, 0.16, 0xf2c400]);
    st.prop('sign', 'signPost', ['UNIT 9'], -1.90, 0, 0.90, 24, [0.7, 1.9, 0.06, 0xcfd3d8]);
    st.prop('trash', 'trashCan', [], -2.70, 0, 1.60, 0, [0.5, 0.9, 0.5, 0x3a3f45]);
    st.light(0xfff2dd, 0.9, 1.5, 3.4, 2.0, 14);
    return st;
  }

  /* =========================================================================
   * 8.  ACT ONE — the shop
   * =====================================================================*/

  Cine.register('c_intro', {
    music: 'shopIdle',
    ambience: 'shopRoom',
    letterbox: true,
    grain: 0.06,

    build: function (ctx, st) {
      setShop(st);
      var steve = st.actor('steve', 0.30, 3.95, 180, 'idle');
      var ellis = st.actor('ellis', -0.62, 2.30, 0, 'sit');
      var oleg = st.actor('oleg', 1.62, 0.55, 8, 'idle');
      oleg.obj.visible = false;
      if (steve.body.setPose) { try { steve.body.setPose('type'); } catch (e) {} }
    },

    shots: [
      /* --- title over black -------------------------------------------- */
      { dur: 3.4,
        flashColor: 0x000000,
        fxNow: { flashA: 1, grain: 0.09, vignette: 0.30 },
        fx: { flashA: 1 },
        card: { title: 'STEVE THE PC REPAIR MAN', sub: 'KILBRIDE COMPUTER REPAIR  ·  UNIT 9' },
        cam: hold([0.0, 1.42, 1.55], [0.1, 1.30, 3.35], 42),
        sfx: 'crtHum'
      },

      /* --- fade up: a slow dolly along the bench ------------------------ */
      { dur: 5.0,
        card: null,
        fx: { flashA: 0, grain: 0.055 },
        dof: { focus: 0.44, blur: 0.30 },
        cam: cam([-1.55, 1.28, 1.85], [-0.4, 1.05, 3.35],
                 [0.55, 1.24, 1.90], [0.35, 1.02, 3.30], 44, 42),
        line: L('ellis', 'Harold bought this machine in ninety-nine. He said it would see us out.')
      },

      /* --- CUT: Steve's hands inside the case -------------------------- */
      { dur: 3.0, cut: true,
        dof: { focus: 0.66, blur: 0.44 },
        cam: cam([0.34, 1.16, 2.62], [0.31, 0.99, 3.28],
                 [0.34, 1.12, 2.44], [0.31, 0.98, 3.28], 34, 33),
        sfx: 'caseOpen',
        pose: { steve: 'type' },
        line: L('steve', 'It nearly did.')
      },

      /* --- over Ellis's shoulder --------------------------------------- */
      { dur: 3.6, cut: true,
        cam: cam([-1.02, 1.34, 2.10], [0.28, 1.30, 3.70],
                 [-0.94, 1.34, 2.22], [0.28, 1.30, 3.70], 40),
        pose: { ellis: 'sit' },
        line: L('ellis', "Is it the hard drive? My grandson says it's always the hard drive.")
      },

      /* --- macro on the coin cell, rack focus onto it ------------------- */
      { dur: 3.4, cut: true,
        dof: { focus: 0.92, blur: 0.62 },
        cam: cam([0.30, 1.06, 2.66], [0.30, 0.945, 3.00],
                 [0.30, 1.02, 2.78], [0.30, 0.945, 2.99], 30, 27),
        sfx: 'toolClink',
        line: L('steve', "It's a battery. Three dollars.")
      },

      { dur: 2.6, cut: true,
        cam: hold([-0.30, 1.36, 1.80], [-0.62, 1.32, 2.30], 38),
        line: L('ellis', 'Three dollars.')
      },

      /* --- push-in on Steve -------------------------------------------- */
      { dur: 4.0,
        dof: { focus: 0.70, blur: 0.34 },
        cam: cam([0.32, 1.52, 2.35], [0.30, 1.52, 3.72],
                 [0.32, 1.50, 2.86], [0.30, 1.52, 3.72], 40, 34),
        sfx: 'screwTurn',
        line: L('steve', 'The clock ran out, that’s all. It forgot what year it was.')
      },

      { dur: 3.2, cut: true, shake: 0.006,
        cam: cam([-0.34, 1.34, 1.86], [-0.62, 1.31, 2.30],
                 [-0.36, 1.33, 1.78], [-0.62, 1.31, 2.30], 36, 34),
        line: L('ellis', "Don't we all.")
      },

      /* --- the machine comes back -------------------------------------- */
      { dur: 2.9, cut: true,
        dof: { focus: 0.80, blur: 0.40 },
        fx: { vignette: 0.20 },
        cam: cam([-0.58, 1.30, 2.55], [-0.55, 1.20, 3.44],
                 [-0.56, 1.26, 2.78], [-0.55, 1.20, 3.44], 34, 31),
        sfx: 'bootChime',
        do: function (ctx, st) { sfx('crtOn', 0.8); }
      },

      { dur: 3.9, cut: true,
        cam: cam([-0.34, 1.36, 1.90], [-0.62, 1.30, 2.32],
                 [-0.40, 1.34, 1.98], [-0.62, 1.30, 2.32], 38, 36),
        pose: { ellis: 'point' },
        line: L('ellis', "Oh — that's Harold's fishing picture. I thought that was gone.")
      },

      { dur: 4.0, cut: true,
        dof: { focus: 0.62, blur: 0.30 },
        cam: cam([0.30, 1.50, 2.62], [0.30, 1.50, 3.74],
                 [0.30, 1.50, 2.50], [0.30, 1.50, 3.74], 36, 38),
        pose: { ellis: 'sit' },
        line: L('steve', "It was never gone. It just couldn't find it.")
      },

      /* --- the door chime: WHIP PAN ------------------------------------ */
      { dur: 1.9, shake: 0.03,
        cam: { from: { pos: [0.20, 1.52, 2.10], look: [0.30, 1.48, 3.60], fov: 40 },
               to:   { pos: [0.20, 1.52, 2.10], look: [1.62, 1.55, 0.30], fov: 40 },
               whip: true, ease: 'inOutCubic' },
        sfx: 'doorChime',
        do: function (ctx, st) {
          if (st.actors.oleg) st.actors.oleg.obj.visible = true;
        }
      },

      /* --- Oleg. He does not sit. -------------------------------------- */
      { dur: 3.0,
        fx: { aberr: 0.16, vignette: 0.30 },
        dof: { focus: 0.58, blur: 0.28 },
        music: 'olegTheme', musicFade: 2600,
        cam: cam([0.55, 1.58, 1.85], [1.62, 1.52, 0.55],
                 [0.72, 1.58, 1.60], [1.62, 1.52, 0.55], 44, 40),
        pose: { oleg: 'idle' }
      },

      { dur: 3.2, cut: true,
        cam: cam([1.20, 1.55, 1.55], [0.32, 1.55, 3.60],
                 [1.14, 1.55, 1.70], [0.32, 1.55, 3.60], 40),
        line: L('steve', "I'll be right with you, Mr. Thomas.")
      },

      { dur: 3.4, cut: true, shake: 0.005,
        cam: cam([0.90, 1.60, 1.30], [1.62, 1.58, 0.55],
                 [0.98, 1.59, 1.18], [1.62, 1.58, 0.55], 38, 36),
        line: L('oleg', 'Take your time. I have all morning.')
      },

      /* --- hold: Steve's hands stop for half a second ------------------- */
      { dur: 2.4, cut: true,
        fx: { aberr: 0.06 },
        dof: { focus: 0.88, blur: 0.50 },
        cam: cam([0.34, 1.14, 2.55], [0.31, 0.98, 3.26],
                 [0.34, 1.13, 2.62], [0.31, 0.98, 3.26], 32),
        pose: { steve: 'idle' }
      }
    ],

    onEnd: function (ctx) {
      emit('objective:set', { text: 'Finish Ms. Ellis’s machine', sub: 'Seat the new CMOS battery' });
    }
  });

  /* -----------------------------------------------------------------------
   * c_ellis_out — the walk to the car. Harold. Kevin. The change.
   * --------------------------------------------------------------------*/

  Cine.register('c_ellis_out', {
    music: 'shopIdle',
    ambience: 'parkingLot',
    letterbox: true,
    grain: 0.05,
    vignette: 0.22,

    build: function (ctx, st) {
      setLot(st);
      var steve = st.actor('steve', 0.10, 1.10, 84, 'walk');
      var ellis = st.actor('ellis', 0.55, 1.55, 84, 'walk');
      st.props.__walkT = 0;
      if (steve.body.setPose) { try { steve.body.setPose('walk'); } catch (e) {} }
      if (ellis.body.setPose) { try { ellis.body.setPose('walk'); } catch (e2) {} }
    },

    shots: [
      /* --- they walk. tracking dolly, handheld. ------------------------- */
      { dur: 4.6,
        card: { title: '', sub: 'TUESDAY IS SHORTBREAD DAY' },
        shake: 0.02,
        cam: cam([-0.30, 1.55, 3.60], [0.60, 1.45, 1.40],
                 [1.35, 1.55, 3.90], [1.95, 1.45, 1.70], 42),
        sfx: 'footstepConcrete',
        line: L('ellis', 'Kevin does something with computers too. Seattle. He’s very well thought of.'),
        tick: function (ctx, st, k, dt) {
          var a = st.actors.steve, b = st.actors.ellis;
          if (a) a.obj.position.x += dt * 0.44;
          if (b) b.obj.position.x += dt * 0.40;
        }
      },

      { dur: 2.6, cut: true, card: null, shake: 0.018,
        cam: cam([1.90, 1.62, 2.60], [1.10, 1.55, 1.35],
                 [2.05, 1.62, 2.62], [1.25, 1.55, 1.35], 40),
        line: L('steve', 'I’m sure he is.'),
        tick: function (ctx, st, k, dt) {
          var a = st.actors.steve, b = st.actors.ellis;
          if (a) a.obj.position.x += dt * 0.44;
          if (b) b.obj.position.x += dt * 0.40;
        }
      },

      { dur: 4.2, cut: true, shake: 0.02,
        dof: { focus: 0.52, blur: 0.24 },
        cam: cam([1.60, 1.50, 3.10], [2.10, 1.42, 1.55],
                 [2.35, 1.50, 3.15], [2.85, 1.42, 1.60], 44),
        line: L('ellis', 'He says I should throw that machine away and get a tablet.'),
        tick: function (ctx, st, k, dt) {
          var a = st.actors.steve, b = st.actors.ellis;
          if (a) a.obj.position.x += dt * 0.40;
          if (b) b.obj.position.x += dt * 0.36;
        }
      },

      { dur: 3.0, cut: true, shake: 0.012,
        cam: cam([3.00, 1.60, 2.90], [2.35, 1.52, 1.70],
                 [3.05, 1.60, 2.86], [2.40, 1.52, 1.70], 38),
        line: L('steve', 'You don’t need a tablet.'),
        do: function (ctx, st) {
          var a = st.actors.steve, b = st.actors.ellis;
          if (a) { a.obj.position.set(2.55, 0, 1.62); a.obj.rotation.y = 70 * Math.PI / 180; if (a.body.setPose) a.body.setPose('idle'); }
          if (b) { b.obj.position.set(3.05, 0, 1.92); b.obj.rotation.y = -110 * Math.PI / 180; if (b.body.setPose) b.body.setPose('idle'); }
        }
      },

      /* --- at the car -------------------------------------------------- */
      { dur: 3.4, cut: true,
        fx: { vignette: 0.24 },
        cam: cam([2.30, 1.58, 2.95], [3.05, 1.50, 1.95],
                 [2.42, 1.58, 2.88], [3.05, 1.50, 1.95], 40),
        sfx: 'carDoor',
        line: L('ellis', 'Now. What do I owe you?')
      },

      /* --- close on the money, rack focus ------------------------------ */
      { dur: 3.6, cut: true,
        dof: { focus: 0.90, blur: 0.55 },
        cam: cam([2.72, 1.14, 2.10], [2.80, 1.06, 1.80],
                 [2.74, 1.11, 2.02], [2.80, 1.06, 1.80], 30, 28),
        sfx: 'paperRustle',
        line: L('steve', 'Twelve. You’ve handed me sixty.')
      },

      { dur: 2.8, cut: true,
        cam: hold([2.45, 1.52, 2.35], [3.02, 1.48, 1.94], 36),
        line: L('ellis', 'Have I? My eyes.')
      },

      { dur: 3.8, cut: true,
        dof: { focus: 0.86, blur: 0.48 },
        cam: cam([2.70, 1.12, 2.14], [2.82, 1.05, 1.82],
                 [2.66, 1.16, 2.22], [2.82, 1.05, 1.82], 30, 33),
        line: L('steve', 'Forty-eight back. Don’t let it blow away.')
      },

      { dur: 3.4, cut: true,
        cam: cam([2.38, 1.54, 2.42], [3.02, 1.50, 1.94],
                 [2.44, 1.54, 2.34], [3.02, 1.50, 1.94], 38, 36),
        line: L('ellis', 'You’re a good boy. Harold liked you.')
      },

      { dur: 2.6, cut: true,
        cam: hold([2.92, 1.58, 2.60], [2.52, 1.54, 1.66], 38),
        line: L('steve', 'He owed me money.')
      },

      { dur: 4.6, cut: true,
        cam: cam([2.36, 1.55, 2.50], [3.02, 1.50, 1.94],
                 [2.30, 1.58, 2.66], [3.02, 1.50, 1.94], 38, 40),
        line: L('ellis', 'He owed everybody money. Tuesday, then — I’ll bring shortbread.')
      },

      { dur: 2.8, cut: true,
        cam: hold([2.90, 1.60, 2.70], [2.52, 1.55, 1.68], 38),
        line: L('steve', 'Bring the tower too, if it argues with you.')
      },

      /* --- the car leaves. Steve stays. -------------------------------- */
      { dur: 4.2, cut: true,
        fx: { vignette: 0.30 },
        cam: cam([1.20, 1.70, 4.20], [3.20, 1.30, 1.90],
                 [1.20, 1.72, 4.35], [4.60, 1.30, 1.70], 46),
        sfx: 'carStart',
        do: function (ctx, st) {
          var b = st.actors.ellis;
          if (b) b.obj.visible = false;
        },
        tick: function (ctx, st, k, dt) {
          var c = st.props.car;
          if (c && k > 0.35) c.position.x += dt * 3.4;
        }
      },

      /* --- and turns, and the shop window is not empty ------------------ */
      { dur: 4.4, cut: true,
        music: 'olegTheme', musicFade: 2200,
        fx: { aberr: 0.22, vignette: 0.36, grain: 0.075 },
        dof: { focus: 0.40, blur: 0.42 },
        cam: cam([0.90, 1.60, 3.10], [0.10, 1.55, 1.05],
                 [0.60, 1.58, 2.55], [0.10, 1.55, 1.05], 44, 33),
        sfx: 'carAway',
        do: function (ctx, st) {
          var a = st.actors.steve;
          if (a) { a.obj.rotation.y = -96 * Math.PI / 180; if (a.body.setPose) a.body.setPose('idle'); }
        }
      }
    ],

    onEnd: function (ctx) {
      emit('objective:set', { text: 'See what Mr. Thomas wants', sub: 'He’s waiting inside' });
    }
  });

/*__APPEND__*/

  STV.log('cutscenes loaded');
})();

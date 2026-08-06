/* =====================================================================
 * 60_cinema.js — the cutscene player.
 *
 * A cutscene is data: a list of camera SHOTS and a list of BEATS
 * (dialogue, sfx, music, prop actions, letterbox, fades). This file plays
 * that data back against SG.engine.camera and resolves a Promise when the
 * timeline ends — or the moment the player skips.
 *
 * Design rules that are not negotiable:
 *   - Every cutscene is skippable at any moment, and skipping leaves the
 *     world in EXACTLY the state the cutscene would have left it in:
 *     every remaining `action` runs immediately, voice is cancelled, the
 *     camera is restored, the letterbox drops.
 *   - Everything degrades. No SG.voice -> subtitles carry it. Missing prop
 *     -> the shot still plays against its authored fallback coordinates.
 *   - No allocation inside update(). All scratch is hoisted below.
 *
 * SHOT
 *   { t, dur, ease, lookEase, cut, blend, fov,
 *     from, to, path[],           position specs (see resolveVec)
 *     lookFrom, lookTo, lookAt,   look specs; lookAt follows a moving object
 *     shake, roll, dof, fx }
 *
 * BEAT
 *   { t, say, hold, sfx, music, stinger, action, anim, gaze,
 *     letterbox, fade, flash, shake, fx, wait }
 *
 * POSITION / LOOK SPEC
 *   [x,y,z] | THREE.Vector3 | 'propName' | ['nameA','nameB'] |
 *   { at:'propName'|['a','b']|'@player'|'@camera', off:[x,y,z],
 *     fallback:[x,y,z], eye:bool }
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;
  var C = SG.cinema;

  var defs = {};
  var UP = new THREE.Vector3(0, 1, 0);
  var DEG = util.DEG;

  /* ------------------------------------------------------------------ */
  /* Hoisted scratch — nothing below is ever allocated per frame.        */
  /* ------------------------------------------------------------------ */

  var _a = new THREE.Vector3();
  var _b = new THREE.Vector3();
  var _c = new THREE.Vector3();
  var _d = new THREE.Vector3();
  var _pos = new THREE.Vector3();
  var _look = new THREE.Vector3();
  var _smLook = new THREE.Vector3();
  var _prevPos = new THREE.Vector3();
  var _prevLook = new THREE.Vector3();
  var _wp = new THREE.Vector3();
  var _bv = new THREE.Vector3();
  var _savedPos = new THREE.Vector3();
  var _box = new THREE.Box3();
  var _m = new THREE.Matrix4();
  var _q = new THREE.Quaternion();
  var _q2 = new THREE.Quaternion();
  var _savedQuat = new THREE.Quaternion();
  var _e = new THREE.Euler(0, 0, 0, 'YXZ');

  /* Rotation offsets accumulated per frame (handheld + shake + roll). */
  var _rot = { x: 0, y: 0, z: 0 };

  /* ------------------------------------------------------------------ */
  /* Small guarded wrappers around other people's subsystems.            */
  /* ------------------------------------------------------------------ */

  function fxSet(name, value) {
    if (!SG.fx || !SG.fx.set) return;
    try { SG.fx.set(name, value); } catch (e) { /* fx is optional */ }
  }

  function sfx(name, opts) {
    if (!SG.audio || !SG.audio.sfx || !name) return;
    try { SG.audio.sfx(name, opts); } catch (e) { /* audio is optional */ }
  }

  function music(id, opts) {
    if (!SG.audio || !SG.audio.music) return;
    try { SG.audio.music(id, opts); } catch (e) { /* audio is optional */ }
  }

  function stinger(name) {
    if (!SG.audio || !SG.audio.stinger || !name) return;
    try { SG.audio.stinger(name); } catch (e) { /* audio is optional */ }
  }

  function letterbox(on, ms) {
    if (!SG.ui || !SG.ui.letterbox) return;
    try { SG.ui.letterbox(!!on, ms === undefined ? 420 : ms); } catch (e) { /* ui optional */ }
  }

  function fade(toBlack, ms) {
    if (!SG.ui || !SG.ui.fade) return Promise.resolve();
    try {
      var p = SG.ui.fade(!!toBlack, ms === undefined ? 600 : ms);
      return (p && p.then) ? p : Promise.resolve();
    } catch (e) { return Promise.resolve(); }
  }

  function flash(colour, ms) {
    if (!SG.ui || !SG.ui.flash) return;
    try { SG.ui.flash(colour || '#ffffff', ms === undefined ? 120 : ms); } catch (e) { /* ui */ }
  }

  function progress(label, t) {
    if (!SG.ui || !SG.ui.hud || !SG.ui.hud.progress) return;
    try { SG.ui.hud.progress(label, t); } catch (e) { /* ui optional */ }
  }

  function clearSubtitle() {
    if (!SG.ui || !SG.ui.hud || !SG.ui.hud.subtitle) return;
    try { SG.ui.hud.subtitle(null, '', { duration: 0 }); } catch (e) { /* ui optional */ }
  }

  function waitSec(s) {
    return new Promise(function (res) { setTimeout(res, Math.max(0, s) * 1000); });
  }

  /* Subtitle timing must match SG.engine.say so the timeline can plan
   * around a line even when there is no speech synthesis at all. */
  function lineDuration(id) {
    var line = (SG.script && SG.script.lines) ? SG.script.lines[id] : null;
    var text = line ? (line.text || '') : String(id || '');
    return Math.max(1.1, Math.min(9, text.length * 0.052 + 0.85));
  }

  function speakerOf(id) {
    var line = (SG.script && SG.script.lines) ? SG.script.lines[id] : null;
    return (line && line.speaker) || 'steve';
  }

  /* ------------------------------------------------------------------ */
  /* Playback state                                                      */
  /* ------------------------------------------------------------------ */

  var S = null;          /* active playback, or null */
  var sessionSeq = 0;
  var listening = false; /* skip-input listeners attached */

  /* Skip hold input. A tap must never skip a cutscene — people lose whole
   * scenes that way. 0.8 s of deliberate hold, with a visible indicator. */
  var HOLD_TIME = 0.8;
  var escDown = false;
  var ptrDown = false;

  function onKeyDown(ev) {
    if (!S) return;
    if (ev.key === 'Escape' || ev.code === 'Escape' || ev.keyCode === 27) {
      escDown = true;
      if (ev.preventDefault) ev.preventDefault();
    }
  }
  function onKeyUp(ev) {
    if (ev.key === 'Escape' || ev.code === 'Escape' || ev.keyCode === 27) escDown = false;
  }
  function onPtrDown() { if (S) ptrDown = true; }
  function onPtrUp() { ptrDown = false; }

  function attachSkipInput() {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPtrDown, true);
    window.addEventListener('pointerup', onPtrUp, true);
    window.addEventListener('pointercancel', onPtrUp, true);
    window.addEventListener('blur', onPtrUp, false);
  }

  function detachSkipInput() {
    if (!listening || typeof window === 'undefined') return;
    listening = false;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPtrDown, true);
    window.removeEventListener('pointerup', onPtrUp, true);
    window.removeEventListener('pointercancel', onPtrUp, true);
    window.removeEventListener('blur', onPtrUp, false);
    escDown = false; ptrDown = false;
  }

  /* ------------------------------------------------------------------ */
  /* Prop resolution                                                     */
  /* ------------------------------------------------------------------ */

  function findProp(at) {
    if (!at) return null;
    if (typeof at !== 'string') {
      /* array of candidate names — first one that exists wins */
      for (var i = 0; i < at.length; i++) {
        var got = findProp(at[i]);
        if (got) return got;
      }
      return null;
    }
    if (!S) return null;
    if (at.charAt(0) === '@') return null;   /* anchors handled separately */
    var ctx = S.ctx;
    if (ctx) {
      if (ctx.props && ctx.props[at]) return ctx.props[at];
      if (S.def && S.def.cast && S.def.cast[at] && ctx.props &&
        ctx.props[S.def.cast[at]]) return ctx.props[S.def.cast[at]];
      if (ctx.world && ctx.world.getObjectByName) {
        var o = ctx.world.getObjectByName(at);
        if (o) return o;
      }
    }
    if (S.props && S.props[at]) return S.props[at];
    return null;
  }

  function node(obj) {
    if (!obj) return null;
    if (obj.isObject3D) return obj;
    if (obj.root && obj.root.isObject3D) return obj.root;
    if (obj.group && obj.group.isObject3D) return obj.group;
    if (obj.object && obj.object.isObject3D) return obj.object;
    return null;
  }

  function worldPos(obj, out) {
    var n = node(obj);
    if (n) {
      n.updateWorldMatrix(true, false);
      n.getWorldPosition(out);
      return true;
    }
    if (obj && obj.position && obj.position.isVector3) { out.copy(obj.position); return true; }
    return false;
  }

  /* Where you aim when you "look at" a thing. Props are authored with their
   * base at y=0, so aiming at the origin points the lens at the floor.
   * Characters get eye height; everything else gets its bbox centre.
   * Cached per playback so no Box3 work happens on a steady frame. */
  function aimHeight(obj) {
    if (!obj) return 0;
    if (S && S.aimCache) {
      var hit = S.aimCache.get(obj);
      if (hit !== undefined) return hit;
    }
    var h = 0;
    if (typeof obj.height === 'number' && obj.height > 0.2) {
      h = obj.height * 0.93;                       /* eye line of a rig */
    } else {
      var n = node(obj);
      if (n && n.userData && n.userData.size && n.userData.size.y) {
        h = n.userData.size.y * 0.5;
      } else if (n) {
        try {
          _box.setFromObject(n);
          if (isFinite(_box.min.y) && isFinite(_box.max.y)) {
            _box.getCenter(_bv);
            n.getWorldPosition(_wp);
            h = _bv.y - _wp.y;
          }
        } catch (e) { h = 0; }
      }
    }
    if (!isFinite(h)) h = 0;
    if (S && S.aimCache) S.aimCache.set(obj, h);
    return h;
  }

  /* Anchors let an in-level cinematic frame itself around wherever the
   * player happens to be standing. Offsets are rotated into the anchor's
   * yaw so "1.2 m behind and to the left" means it. */
  function anchorVec(name, spec, out, isLook) {
    if (!S || !S.anchor) return false;
    var A = S.anchor;
    out.copy(name === '@camera' || name === '@cam' ? A.cam : A.player);
    var off = spec.off;
    if (off) {
      var cy = Math.cos(A.yaw), sy = Math.sin(A.yaw);
      out.x += off[0] * cy + off[2] * sy;
      out.y += off[1];
      out.z += -off[0] * sy + off[2] * cy;
    }
    if (isLook && spec.eye) out.y += 1.6;
    return true;
  }

  function resolveVec(spec, out, isLook) {
    if (spec === undefined || spec === null) { out.set(0, 0, 0); return out; }
    if (spec.isVector3) { out.copy(spec); return out; }
    if (Object.prototype.toString.call(spec) === '[object Array]') {
      if (typeof spec[0] === 'string') spec = { at: spec };
      else { out.set(+spec[0] || 0, +spec[1] || 0, +spec[2] || 0); return out; }
    }
    if (typeof spec === 'string') spec = { at: spec };

    var at = spec.at;
    if (typeof at === 'string' && at.charAt(0) === '@') {
      if (anchorVec(at, spec, out, isLook)) return out;
    }

    var obj = findProp(at);
    if (obj && worldPos(obj, out)) {
      var wantEye = spec.eye === undefined ? !!isLook : !!spec.eye;
      if (wantEye) out.y += aimHeight(obj);
      if (spec.off) { out.x += spec.off[0]; out.y += spec.off[1]; out.z += spec.off[2]; }
      return out;
    }

    /* Prop missing — the shot still plays, against authored coordinates. */
    if (spec.fallback) {
      out.set(+spec.fallback[0] || 0, +spec.fallback[1] || 0, +spec.fallback[2] || 0);
      return out;
    }
    if (S && S.anchor) {
      out.copy(isLook ? S.anchor.look : S.anchor.cam);
      if (spec.off) { out.x += spec.off[0]; out.y += spec.off[1]; out.z += spec.off[2]; }
      return out;
    }
    out.set(0, 1.6, 0);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Definition preparation                                              */
  /* ------------------------------------------------------------------ */

  function byT(a, b) { return (a.t || 0) - (b.t || 0); }

  function prepare(def) {
    if (def._prepared) return def;
    def._prepared = true;

    var shots = (def.shots || []).slice();
    var i, sh;

    /* CONTRACT.md writes shots as { t, cam:{...}, dof, fx }. Flatten that
     * form onto the shot so both spellings work. */
    for (i = 0; i < shots.length; i++) {
      sh = shots[i];
      if (sh.cam) {
        for (var k in sh.cam) {
          if (Object.prototype.hasOwnProperty.call(sh.cam, k) && sh[k] === undefined) {
            sh[k] = sh.cam[k];
          }
        }
      }
      if (sh.t === undefined) sh.t = 0;
      if (sh.dur === undefined) sh.dur = 4;
    }
    shots.sort(byT);

    var beats = (def.beats || []).slice();
    for (i = 0; i < beats.length; i++) if (beats[i].t === undefined) beats[i].t = 0;
    beats.sort(byT);

    def._shots = shots;
    def._beats = beats;

    var d = 0;
    for (i = 0; i < shots.length; i++) d = Math.max(d, shots[i].t + shots[i].dur);
    for (i = 0; i < beats.length; i++) {
      var b = beats[i], end = b.t;
      if (b.say) end += lineDuration(b.say);
      if (b.wait) end += b.wait;
      d = Math.max(d, end);
    }
    def._dur = def.dur !== undefined ? def.dur : d + (def.tail === undefined ? 0.9 : def.tail);
    return def;
  }

  /* Curves are built once per playback (props do not move between shots
   * often enough to justify per-frame rebuilds), never inside update(). */
  function buildCurves(def) {
    for (var i = 0; i < def._shots.length; i++) {
      var sh = def._shots[i];
      sh._curve = null;
      if (sh.path && sh.path.length >= 2) {
        var pts = [];
        for (var j = 0; j < sh.path.length; j++) {
          pts.push(resolveVec(sh.path[j], new THREE.Vector3(), false).clone());
        }
        try {
          sh._curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
        } catch (e) { sh._curve = null; }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Character rigs                                                      */
  /* ------------------------------------------------------------------ */

  function rigOf(name) {
    if (!name) return null;
    var obj = findProp(name);
    if (obj && (obj.play || obj.speak || obj.lookAt)) return obj;
    return null;
  }

  function setSpeaking(speaker, on) {
    var rig = rigOf(speaker);
    if (!rig) return;
    if (typeof rig.speak === 'function') {
      try { rig.speak(!!on); } catch (e) { /* rig optional */ }
    } else if (typeof rig.setSpeaking === 'function') {
      try { rig.setSpeaking(!!on); } catch (e) { /* rig optional */ }
    }
  }

  function silenceAll() {
    if (!S || !S.talking) return;
    for (var k in S.talking) {
      if (Object.prototype.hasOwnProperty.call(S.talking, k) && S.talking[k]) {
        setSpeaking(k, false);
        S.talking[k] = 0;
      }
    }
  }

  /* SG.voice tells us exactly when a mouth should move; the say-beat path
   * is the fallback when speech synthesis is unavailable. */
  SG.bus.on('voice:start', function (p) {
    if (!S || !p) return;
    var sp = (typeof p === 'string') ? p : p.speaker;
    if (!sp) return;
    S.talking[sp] = (S.talking[sp] || 0) + 1;
    setSpeaking(sp, true);
  });

  SG.bus.on('voice:end', function (p) {
    if (!S || !p) return;
    var sp = (typeof p === 'string') ? p : p.speaker;
    if (!sp) return;
    S.talking[sp] = Math.max(0, (S.talking[sp] || 0) - 1);
    if (!S.talking[sp]) setSpeaking(sp, false);
  });

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  function fireBeat(b) {
    if (!S) return;

    if (b.fx) {
      for (var k in b.fx) {
        if (Object.prototype.hasOwnProperty.call(b.fx, k)) fxSet(k, b.fx[k]);
      }
    }
    if (b.letterbox !== undefined) letterbox(b.letterbox, b.ms);
    if (b.fade !== undefined) fade(b.fade, b.ms);
    if (b.flash !== undefined) flash(b.flash === true ? '#ffffff' : b.flash, b.flashMs);
    if (b.music !== undefined) music(b.music);
    if (b.stinger) stinger(b.stinger);
    if (b.sfx) sfx(b.sfx, b.sfxOpts);
    if (b.shake) {
      S.impulse = Math.max(S.impulse, typeof b.shake === 'number' ? b.shake : b.shake.amount || 0.02);
      S.impulseFreq = (b.shake && b.shake.freq) || 9;
    }

    if (b.anim) {
      var list = (Object.prototype.toString.call(b.anim) === '[object Array]') ? b.anim : [b.anim];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        var rig = rigOf(a.who);
        if (rig && typeof rig.play === 'function') {
          try { rig.play(a.clip, a.opts); } catch (e) { /* rig optional */ }
        }
      }
    }

    if (b.gaze) {
      var g = rigOf(b.gaze.who);
      if (g && typeof g.lookAt === 'function') {
        resolveVec(b.gaze.at, _a, true);
        try { g.lookAt(_a); } catch (e) { /* rig optional */ }
      }
    }

    if (b.action) {
      SG.safe('cinema.action', function () { b.action(S.ctx, C); });
    }

    if (b.wait) {
      S.held = true;
      S.holdTimer = b.wait;
    }

    if (b.say) doSay(b);
  }

  function doSay(b) {
    var id = b.say;
    var sp = speakerOf(id);
    var session = S.session;

    S.pending++;
    S.talking[sp] = (S.talking[sp] || 0) + 1;
    setSpeaking(sp, true);

    if (b.hold) S.held = true;

    var p;
    if (SG.engine && SG.engine.say) {
      p = SG.safe('cinema.say', function () { return SG.engine.say(id); }, null);
    }
    if (!p || !p.then) p = waitSec(lineDuration(id));

    p.then(function () { endSay(session, sp, b); },
      function () { endSay(session, sp, b); });
  }

  function endSay(session, sp, b) {
    if (!S || S.session !== session) return;
    S.pending = Math.max(0, S.pending - 1);
    S.talking[sp] = Math.max(0, (S.talking[sp] || 0) - 1);
    if (!S.talking[sp]) setSpeaking(sp, false);
    if (b.hold && S.held && !S.holdTimer) S.held = false;
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */

  function shotPose(sh, t, outPos, outLook) {
    var u = sh.dur > 0 ? util.clamp((t - sh.t) / sh.dur, 0, 1) : 1;
    var e = util.easeFn(sh.ease)(u);

    if (sh._curve) {
      sh._curve.getPoint(e, outPos);
    } else if (sh.from !== undefined || sh.to !== undefined) {
      resolveVec(sh.from !== undefined ? sh.from : sh.to, _a, false);
      resolveVec(sh.to !== undefined ? sh.to : sh.from, _b, false);
      outPos.lerpVectors(_a, _b, e);
    } else {
      outPos.copy(S.anchor ? S.anchor.cam : _savedPos);
    }

    if (sh.lookAt !== undefined) {
      resolveVec(sh.lookAt, outLook, true);
    } else if (sh.lookFrom !== undefined || sh.lookTo !== undefined) {
      var le = util.easeFn(sh.lookEase || sh.ease)(u);
      resolveVec(sh.lookFrom !== undefined ? sh.lookFrom : sh.lookTo, _c, true);
      resolveVec(sh.lookTo !== undefined ? sh.lookTo : sh.lookFrom, _d, true);
      outLook.lerpVectors(_c, _d, le);
    } else {
      outLook.copy(S.anchor ? S.anchor.look : _savedPos);
    }
    return e;
  }

  function shotFov(sh, e) {
    var f = sh.fov;
    if (f === undefined) return S.baseFov;
    if (Object.prototype.toString.call(f) === '[object Array]') {
      return util.lerp(+f[0], +f[1], e);
    }
    return +f;
  }

  function onShotChange(i) {
    var sh = S.def._shots[i];
    S.shotIdx = i;

    if (sh.fx) {
      for (var k in sh.fx) {
        if (Object.prototype.hasOwnProperty.call(sh.fx, k)) fxSet(k, sh.fx[k]);
      }
    }
    if (sh.dof !== undefined && Object.prototype.toString.call(sh.dof) !== '[object Array]') {
      fxSet('dof', sh.dof);
    }
    if (sh.sfx) sfx(sh.sfx);

    /* First shot always cuts. After that, `cut: true` snaps and anything
     * else eases out of wherever the lens actually was. */
    if (sh.cut || S.first) {
      S.blendT = 1;
      S.snapLook = true;
    } else {
      S.blendT = 0;
      S.blendDur = sh.blend === undefined ? 0.55 : sh.blend;
      if (S.blendDur <= 0) S.blendT = 1;
      _prevPos.copy(S.lastPos);
      _prevLook.copy(S.lastLook);
      S.prevFov = S.lastFov;
    }
    S.first = false;
  }

  /* Handheld: a low-amplitude drift on ROTATION ONLY, about 0.15 deg at
   * ~0.3 Hz, so no shot ever sits perfectly still. Positional float reads
   * as a dolly on ice; rotational float reads as a person holding a lens. */
  function handheld(t, amt) {
    var a = 0.15 * DEG * amt;
    _rot.x += util.fbm2(t * 0.30, 3.10, 2) * a;
    _rot.y += util.fbm2(t * 0.27 + 41.0, 11.70, 2) * a * 1.25;
    _rot.z += util.fbm2(t * 0.21 + 93.0, 5.50, 2) * a * 0.55;
  }

  /* Shake: layered noise, again rotation only. Positional shake is an
   * earthquake; a camera operator's flinch is angular. */
  function shakeRot(t, amount, freq) {
    if (!amount) return;
    var f = freq || 7;
    _rot.x += (util.noise2(t * f, 7.3) * 0.7 + util.noise2(t * f * 2.4, 19.1) * 0.3) * amount;
    _rot.y += (util.noise2(t * f + 31, 3.7) * 0.7 + util.noise2(t * f * 2.7 + 5, 23.9) * 0.3) * amount * 1.1;
    _rot.z += (util.noise2(t * f * 1.6 + 77, 13.1)) * amount * 0.45;
  }

  function applyCamera(dt) {
    var cam = S.cam;
    if (!cam) return;
    var shots = S.def._shots;
    if (!shots.length) return;

    var i = 0;
    for (var j = 0; j < shots.length; j++) {
      if (shots[j].t <= S.t + 1e-6) i = j; else break;
    }
    if (i !== S.shotIdx) onShotChange(i);

    var sh = shots[i];
    var e = shotPose(sh, S.t, _pos, _look);
    var fov = shotFov(sh, e);

    if (S.blendT < 1) {
      S.blendT = Math.min(1, S.blendT + dt / Math.max(0.001, S.blendDur));
      var k = util.smoother(S.blendT);
      _pos.lerpVectors(_prevPos, _pos, k);
      _look.lerpVectors(_prevLook, _look, k);
      fov = util.lerp(S.prevFov, fov, k);
    }

    /* A followed target is damped so a walking actor does not drag the
     * lens around in lockstep — the operator lags a little, as they do. */
    if (S.snapLook) { _smLook.copy(_look); S.snapLook = false; }
    else {
      var lam = sh.followLag === undefined ? 9 : sh.followLag;
      _smLook.x = util.damp(_smLook.x, _look.x, lam, dt);
      _smLook.y = util.damp(_smLook.y, _look.y, lam, dt);
      _smLook.z = util.damp(_smLook.z, _look.z, lam, dt);
    }

    if (!isFinite(_pos.x) || !isFinite(_pos.y) || !isFinite(_pos.z) ||
      !isFinite(_smLook.x) || !isFinite(_smLook.y) || !isFinite(_smLook.z) ||
      !isFinite(fov) || fov <= 1) {
      return;                                   /* never write a NaN camera */
    }
    if (_pos.distanceToSquared(_smLook) < 1e-6) _smLook.z += 0.01;

    S.lastPos.copy(_pos);
    S.lastLook.copy(_smLook);
    S.lastFov = fov;

    /* Dynamic DOF ramp across the shot. */
    if (Object.prototype.toString.call(sh.dof) === '[object Array]') {
      fxSet('dof', util.lerp(+sh.dof[0], +sh.dof[1], e));
    }

    _m.lookAt(_pos, _smLook, UP);
    _q.setFromRotationMatrix(_m);

    _rot.x = 0; _rot.y = 0; _rot.z = 0;
    handheld(S.wall, S.handheld);
    var amt = 0, frq = 7;
    if (sh.shake) {
      if (typeof sh.shake === 'number') { amt = sh.shake; }
      else { amt = sh.shake.amount || 0; frq = sh.shake.freq || 7; }
    }
    if (S.impulse > 0.0001) { amt += S.impulse; frq = S.impulseFreq || frq; }
    shakeRot(S.wall, amt, frq);
    if (sh.roll) _rot.z += sh.roll * DEG;

    _e.set(_rot.x, _rot.y, _rot.z, 'YXZ');
    _q2.setFromEuler(_e);
    _q.multiply(_q2);

    cam.position.copy(_pos);
    cam.quaternion.copy(_q);
    if (Math.abs(cam.fov - fov) > 0.002) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  C.register = function (id, def) {
    def = def || {};
    def.id = id;
    defs[id] = def;
    return def;
  };

  C.get = function (id) { return defs[id] || null; };
  C.has = function (id) { return !!defs[id]; };
  C.ids = function () { return Object.keys(defs); };
  C.current = null;
  C.isPlaying = function () { return !!S; };

  C.play = function (id, ctx) {
    var def = defs[id];
    if (!def) {
      if (window.console) console.warn('[cinema] no such cutscene:', id);
      return Promise.resolve(false);
    }
    if (S) C.skip();

    prepare(def);

    var cam = (SG.engine && SG.engine.camera) || (ctx && ctx.camera) || null;

    S = {
      def: def,
      ctx: ctx || (SG.engine && SG.engine.ctx) || null,
      props: (def.props || null),
      cam: cam,
      session: ++sessionSeq,
      t: 0,
      wall: 0,
      dur: def._dur,
      beatIdx: 0,
      shotIdx: -1,
      first: true,
      held: false,
      holdTimer: 0,
      pending: 0,
      talking: {},
      aimCache: (typeof Map === 'function') ? new Map() : null,
      blendT: 1,
      blendDur: 0.55,
      prevFov: cam ? cam.fov : 50,
      lastFov: cam ? cam.fov : 50,
      baseFov: cam ? cam.fov : 50,
      lastPos: new THREE.Vector3(),
      lastLook: new THREE.Vector3(),
      snapLook: true,
      impulse: 0,
      impulseFreq: 7,
      handheld: def.handheld === undefined ? 1 : def.handheld,
      holdT: 0,
      skipped: false,
      done: false,
      resolve: null,
      anchor: null
    };

    C.current = def;

    /* Save the camera so we can put it back exactly as we found it. */
    if (cam) {
      _savedPos.copy(cam.position);
      _savedQuat.copy(cam.quaternion);
      S.savedFov = cam.fov;
      S.lastPos.copy(cam.position);
      cam.getWorldDirection(_a);
      S.lastLook.copy(cam.position).add(_a);
    }

    /* Anchors for in-level cinematics: where the player is standing now. */
    var apos = new THREE.Vector3(cam ? cam.position.x : 0, cam ? cam.position.y : 1.6,
      cam ? cam.position.z : 0);
    var ayaw = 0;
    var pl = (SG.engine && SG.engine.player) || (ctx && ctx.player) || null;
    if (pl && pl.getPosition) {
      try { pl.getPosition(_b); apos.copy(_b); } catch (e) { /* player optional */ }
    }
    if (cam) {
      cam.getWorldDirection(_a);
      ayaw = Math.atan2(_a.x, _a.z);
    }
    S.anchor = {
      cam: (cam ? cam.position.clone() : apos.clone()),
      player: apos.clone(),
      look: (cam ? cam.position.clone().add(_a) : apos.clone().add(new THREE.Vector3(0, 0, 1))),
      yaw: ayaw
    };

    buildCurves(def);

    attachSkipInput();
    SG.bus.emit('cinema:start', { id: id, def: def });

    if (def.letterbox !== false) letterbox(true, def.letterboxMs || 420);
    if (def.music !== undefined) music(def.music);
    if (def.fx) {
      for (var k in def.fx) {
        if (Object.prototype.hasOwnProperty.call(def.fx, k)) fxSet(k, def.fx[k]);
      }
    }
    if (def.dof !== undefined) fxSet('dof', def.dof);
    if (def.fadeIn) fade(false, def.fadeIn === true ? 800 : def.fadeIn);

    /* Frame the first shot before the first update so nothing is ever
     * rendered from the previous camera. */
    SG.safe('cinema.frame0', function () { applyCamera(0.016); });

    if (def.onStart) SG.safe('cinema.onStart', function () { def.onStart(S.ctx, C); });

    return new Promise(function (res) {
      if (!S) { res(false); return; }
      S.resolve = res;
    });
  };

  C.update = function (dt) {
    if (!S || S.done) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;

    S.wall += dt;

    /* ---- skip hold ------------------------------------------------- */
    var want = escDown || ptrDown;
    if (!want && SG.input && SG.input.down) {
      try { want = !!SG.input.down('cancel'); } catch (e) { want = false; }
    }
    if (want) {
      S.holdT += dt;
      progress('Skipping', util.clamp(S.holdT / HOLD_TIME, 0, 1));
      if (S.holdT >= HOLD_TIME) { C.skip(); return; }
    } else if (S.holdT > 0) {
      S.holdT = 0;
      progress('Skipping', null);
    }

    /* ---- clock ----------------------------------------------------- */
    if (S.held) {
      if (S.holdTimer > 0) {
        S.holdTimer -= dt;
        if (S.holdTimer <= 0) { S.holdTimer = 0; if (!S.pending) S.held = false; }
      }
      /* Safety valve: never let a broken voice promise strand a cutscene. */
      S.heldFor = (S.heldFor || 0) + dt;
      if (S.heldFor > 12) { S.held = false; S.heldFor = 0; }
    } else {
      S.heldFor = 0;
      S.t += dt * (S.def.rate || 1);
    }

    /* ---- beats ----------------------------------------------------- */
    var beats = S.def._beats;
    while (!S.held && S.beatIdx < beats.length && beats[S.beatIdx].t <= S.t) {
      var b = beats[S.beatIdx++];
      fireBeat(b);
    }

    /* ---- camera ---------------------------------------------------- */
    if (S.impulse > 0.0001) S.impulse = util.damp(S.impulse, 0, 4.5, dt);
    SG.safe('cinema.camera', function () { applyCamera(dt); });

    /* ---- end ------------------------------------------------------- */
    if (S.t >= S.dur && S.beatIdx >= beats.length && !S.held &&
      (S.pending === 0 || S.t > S.dur + 8)) {
      finish(false);
    }
  };

  C.skip = function () {
    if (!S || S.done) return;
    S.skipped = true;

    /* Run every remaining action immediately — the world must end up in
     * exactly the state the full cutscene would have left it in. Music
     * changes carry over too; sfx, stingers, lines and fades do not. */
    var beats = S.def._beats;
    var lastMusic;
    for (var i = S.beatIdx; i < beats.length; i++) {
      var b = beats[i];
      if (b.music !== undefined) lastMusic = b.music;
      if (b.anim) {
        var list = (Object.prototype.toString.call(b.anim) === '[object Array]') ? b.anim : [b.anim];
        for (var j = 0; j < list.length; j++) {
          var rig = rigOf(list[j].who);
          if (rig && typeof rig.play === 'function') {
            try { rig.play(list[j].clip, list[j].opts); } catch (e) { /* rig */ }
          }
        }
      }
      if (b.action) {
        (function (bb) {
          SG.safe('cinema.action(skip)', function () { bb.action(S.ctx, C); });
        })(b);
      }
    }
    S.beatIdx = beats.length;
    if (lastMusic !== undefined) music(lastMusic);

    if (SG.voice && SG.voice.cancel) {
      try { SG.voice.cancel(); } catch (e) { /* voice optional */ }
    }
    clearSubtitle();
    finish(true);
  };

  function finish(skipped) {
    if (!S || S.done) return;
    S.done = true;

    var def = S.def;
    var res = S.resolve;
    var ctx = S.ctx;
    var cam = S.cam;

    silenceAll();
    progress('Skipping', null);
    detachSkipInput();

    if (def.onEnd) SG.safe('cinema.onEnd', function () { def.onEnd(ctx, C, skipped); });

    letterbox(false, 260);
    fxSet('dof', 0);
    fxSet('glitch', 0);
    if (def.fxEnd) {
      for (var k in def.fxEnd) {
        if (Object.prototype.hasOwnProperty.call(def.fxEnd, k)) fxSet(k, def.fxEnd[k]);
      }
    }

    /* A skip must never leave the player staring at a black screen. */
    if (skipped) fade(false, 200);

    if (cam && def.keepCamera !== true) {
      cam.position.copy(_savedPos);
      cam.quaternion.copy(_savedQuat);
      if (S.savedFov !== undefined && Math.abs(cam.fov - S.savedFov) > 0.002) {
        cam.fov = S.savedFov;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld(true);
    }

    S = null;
    C.current = null;
    SG.bus.emit('cinema:end', { id: def.id, skipped: !!skipped });

    if (res) res(!skipped);
  }

  /* Author-time lint: every `say` id referenced by a registered cutscene
   * must exist in SG.script.lines. Returns the orphans. */
  C.lint = function () {
    var missing = [];
    var seen = {};
    Object.keys(defs).forEach(function (id) {
      var def = prepare(defs[id]);
      def._beats.forEach(function (b) {
        if (!b.say) return;
        var lines = (SG.script && SG.script.lines) || {};
        if (!lines[b.say] && !seen[b.say]) {
          seen[b.say] = 1;
          missing.push({ cutscene: id, line: b.say });
        }
      });
    });
    return missing;
  };

  /* Introspection for the chapter menu / debug overlay. */
  C.duration = function (id) {
    var def = defs[id];
    return def ? prepare(def)._dur : 0;
  };

  C.shotCount = function (id) {
    var def = defs[id];
    return def ? prepare(def)._shots.length : 0;
  };

})(window.SG, window.THREE);

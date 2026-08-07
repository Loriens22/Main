/* =====================================================================
 * 41_input.js — SG.input
 *
 * One input surface for keyboard+mouse, gamepad and touch. Mobile is a
 * first-class citizen: the touch overlay is built here, in the DOM, and
 * is a real control scheme (floating stick, drag-look, context button,
 * true multi-touch) rather than a stopgap.
 *
 * Contract:
 *   init(domElement) / update(dt)
 *   axes.move {x,y}   -1..1, dead-zoned + radially clamped
 *   axes.look {x,y}   radians accumulated since the last update()
 *                     +x = look right, +y = look up
 *   down(a) / pressed(a) / released(a)
 *   setSensitivity(n) / setInvertY(b) / setGyro(b)
 *   mode 'kbm' | 'touch' | 'gamepad'
 *   requestPointerLock() / exitPointerLock()
 *   mobileRoot, setTouchVisible(b), setContextVerb(text|null)
 *
 * Nothing here allocates per frame. Pointer events allocate one small
 * slot object on first use and then recycle it forever.
 * ===================================================================== */
(function (SG, W, D) {
  'use strict';

  var util = SG.util;
  var IN = SG.input;

  /* ------------------------------------------------------------------ */
  /* Tunables                                                            */
  /* ------------------------------------------------------------------ */

  var MOUSE_RAD_PER_PX = 0.0024;   /* at sensitivity 1.0                 */
  var DRAG_RAD_PER_PX = 0.0034;    /* unlocked mouse drag                */
  var TOUCH_RAD_PER_PX = 0.0042;   /* 1:1-ish thumb feel                 */
  var PAD_LOOK_RATE = 2.75;        /* rad/s at full right stick          */
  var PAD_DEAD = 0.18;
  var PAD_TRIGGER = 0.4;
  var TOUCH_DEAD = 0.12;           /* 12 % of the stick radius           */
  var KEY_DEAD = 0.0;
  var STICK_R = 48;                /* px, matches the CSS ring           */
  var LOOK_DEAD_PX = 3.0;          /* a tap must not become a flick      */
  var TAP_MS = 200;
  var TAP_PX = 10;
  var GYRO_GAIN = 1.35;

  /* ------------------------------------------------------------------ */
  /* Action table                                                        */
  /* ------------------------------------------------------------------ */

  var ACTIONS = ['interact', 'sprint', 'crouch', 'jump', 'cancel', 'pause',
    'look', 'zoom', 'flash', 'inventory', 'hint'];

  var kb = {};      /* held by keyboard    */
  var pad = {};     /* held by gamepad     */
  var tch = {};     /* held by touch UI    */
  var latch = {};   /* one-frame injection */
  var nowS = {};
  var prevS = {};

  (function () {
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i];
      kb[a] = false; pad[a] = false; tch[a] = false; latch[a] = false;
      nowS[a] = false; prevS[a] = false;
    }
  })();

  /* e.code -> action. Escape is special-cased (pause + cancel). */
  var KEYMAP = {
    KeyE: 'interact', KeyF: 'interact', Enter: 'interact', NumpadEnter: 'interact',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
    Space: 'jump',
    Backspace: 'cancel',
    Tab: 'inventory', KeyI: 'inventory',
    KeyQ: 'hint',
    KeyZ: 'zoom',
    KeyG: 'flash', KeyL: 'flash',
    AltLeft: 'look', AltRight: 'look'
  };

  /* Old browsers without KeyboardEvent.code. */
  var KEYCODEMAP = {
    69: 'KeyE', 70: 'KeyF', 13: 'Enter', 16: 'ShiftLeft', 17: 'ControlLeft',
    67: 'KeyC', 32: 'Space', 8: 'Backspace', 9: 'Tab', 73: 'KeyI',
    81: 'KeyQ', 90: 'KeyZ', 71: 'KeyG', 76: 'KeyL', 18: 'AltLeft',
    27: 'Escape', 87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD',
    38: 'ArrowUp', 37: 'ArrowLeft', 40: 'ArrowDown', 39: 'ArrowRight'
  };

  /* Movement keys, tracked separately so they compose into an axis. */
  var mvKeys = { f: false, b: false, l: false, r: false };

  /* Gamepad button -> action. Standard mapping. */
  var PADMAP = {
    0: 'jump', 1: 'cancel', 2: 'interact', 3: 'hint',
    4: 'inventory', 5: 'flash', 7: 'interact',
    8: 'inventory', 9: 'pause', 10: 'sprint', 11: 'crouch'
  };

  /* ------------------------------------------------------------------ */
  /* Public state                                                        */
  /* ------------------------------------------------------------------ */

  IN.axes = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
  IN.mode = SG.isTouch ? 'touch' : 'kbm';
  IN.mobileRoot = null;
  IN.enabled = true;
  IN.autoLock = true;

  var sens = 1.0;
  var invertY = false;
  var gyroOn = false;
  var inited = false;
  var dom = null;
  var locked = false;
  var lockFailed = false;

  /* look accumulator (radians, already scaled by sensitivity) */
  var accLX = 0, accLY = 0;
  /* per-source move, resolved in update() */
  var stickX = 0, stickY = 0, stickActive = false;
  var padMX = 0, padMY = 0, padActive = false;
  var padLX = 0, padLY = 0;

  var vw = 1280, vh = 720;

  function readViewport() {
    vw = W.innerWidth || (D.documentElement && D.documentElement.clientWidth) || 1280;
    vh = W.innerHeight || (D.documentElement && D.documentElement.clientHeight) || 720;
  }

  function setMode(m) {
    if (IN.mode === m) return;
    IN.mode = m;
    syncTouchVisible();
    SG.bus.emit('input:mode', m);
  }

  /* ------------------------------------------------------------------ */
  /* Listener bookkeeping — everything is removable                      */
  /* ------------------------------------------------------------------ */

  var bound = [];
  function on(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts === undefined ? false : opts);
    bound.push([target, type, fn, opts]);
  }
  function offAll() {
    for (var i = 0; i < bound.length; i++) {
      var b = bound[i];
      try { b[0].removeEventListener(b[1], b[2], b[3]); } catch (e) { /* gone */ }
    }
    bound.length = 0;
  }

  var PASSIVE_NO = { passive: false };

  /* ------------------------------------------------------------------ */
  /* Axis helpers                                                        */
  /* ------------------------------------------------------------------ */

  var _ax = 0, _ay = 0;   /* output of shapeAxis */

  function shapeAxis(x, y, dead) {
    var m = Math.sqrt(x * x + y * y);
    if (m < 1e-6) { _ax = 0; _ay = 0; return 0; }
    if (m > 1) { x /= m; y /= m; m = 1; }
    if (m <= dead) { _ax = 0; _ay = 0; return 0; }
    var s = ((m - dead) / (1 - dead)) / m;
    _ax = x * s; _ay = y * s;
    return m;
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                            */
  /* ------------------------------------------------------------------ */

  function codeOf(e) {
    if (e.code) return e.code;
    return KEYCODEMAP[e.keyCode] || '';
  }

  function typingInField() {
    var el = D.activeElement;
    if (!el) return false;
    var t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  }

  function onKeyDown(e) {
    if (!IN.enabled) return;
    if (e.metaKey) return;
    if (typingInField()) return;
    var c = codeOf(e);
    if (!c) return;
    setMode('kbm');

    switch (c) {
      case 'KeyW': case 'ArrowUp': mvKeys.f = true; e.preventDefault(); return;
      case 'KeyS': case 'ArrowDown': mvKeys.b = true; e.preventDefault(); return;
      case 'KeyA': case 'ArrowLeft': mvKeys.l = true; e.preventDefault(); return;
      case 'KeyD': case 'ArrowRight': mvKeys.r = true; e.preventDefault(); return;
      case 'Escape':
        if (!e.repeat) { latch.pause = true; latch.cancel = true; }
        kb.pause = true; kb.cancel = true;
        return;
      default: break;
    }

    var a = KEYMAP[c];
    if (!a) return;
    if (c === 'Tab' || c === 'Space') e.preventDefault();
    if (!e.repeat) latch[a] = true;
    kb[a] = true;
  }

  function onKeyUp(e) {
    var c = codeOf(e);
    if (!c) return;
    switch (c) {
      case 'KeyW': case 'ArrowUp': mvKeys.f = false; return;
      case 'KeyS': case 'ArrowDown': mvKeys.b = false; return;
      case 'KeyA': case 'ArrowLeft': mvKeys.l = false; return;
      case 'KeyD': case 'ArrowRight': mvKeys.r = false; return;
      case 'Escape': kb.pause = false; kb.cancel = false; return;
      default: break;
    }
    var a = KEYMAP[c];
    if (a) kb[a] = false;
  }

  function releaseAllKeys() {
    mvKeys.f = mvKeys.b = mvKeys.l = mvKeys.r = false;
    for (var i = 0; i < ACTIONS.length; i++) kb[ACTIONS[i]] = false;
  }

  /* ------------------------------------------------------------------ */
  /* Pointer lock + mouse look                                           */
  /* ------------------------------------------------------------------ */

  IN.requestPointerLock = function () {
    if (!dom || IN.mode === 'touch') return false;
    if (D.pointerLockElement === dom) return true;
    if (!dom.requestPointerLock) { lockFailed = true; return false; }
    try { dom.requestPointerLock(); return true; } catch (e) {
      lockFailed = true;
      return false;
    }
  };

  IN.exitPointerLock = function () {
    try { if (D.exitPointerLock && D.pointerLockElement) D.exitPointerLock(); }
    catch (e) { /* nothing to do */ }
  };

  IN.isPointerLocked = function () { return locked; };

  function onLockChange() {
    locked = (D.pointerLockElement === dom);
    if (!locked) mouseDrag = false;
  }
  function onLockError() { lockFailed = true; locked = false; }

  var mouseDrag = false, mLastX = 0, mLastY = 0;

  function wantsAutoLock() {
    if (!IN.autoLock || lockFailed || IN.mode === 'touch') return false;
    var E = SG.engine;
    if (!E) return false;
    return E.mode === 'level' && !E.paused;
  }

  function onMouseMove(e) {
    if (!IN.enabled) return;
    if (locked) {
      var mx = e.movementX || 0, my = e.movementY || 0;
      if (mx || my) {
        setMode('kbm');
        accLX += mx * MOUSE_RAD_PER_PX * sens;
        accLY -= my * MOUSE_RAD_PER_PX * sens;
      }
      return;
    }
    if (mouseDrag) {
      var dx = e.clientX - mLastX, dy = e.clientY - mLastY;
      mLastX = e.clientX; mLastY = e.clientY;
      accLX += dx * DRAG_RAD_PER_PX * sens;
      accLY -= dy * DRAG_RAD_PER_PX * sens;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Touch overlay                                                       */
  /* ------------------------------------------------------------------ */

  var STYLE = [
    '#sg-touch{position:fixed;inset:0;z-index:5;pointer-events:none;',
    'touch-action:none;-webkit-user-select:none;user-select:none;',
    '-webkit-touch-callout:none;display:none;',
    'font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
    'letter-spacing:.12em;color:#39d98a;}',
    '#sg-touch.on{display:block;}',
    '#sg-touch .sgi-stick{position:absolute;left:0;top:0;width:96px;height:96px;',
    'margin:-48px 0 0 -48px;border:1px solid #39d98a;border-radius:50%;',
    'background:rgba(0,0,0,.34);opacity:0;transition:opacity .12s linear;',
    'box-shadow:0 0 12px rgba(57,217,138,.16) inset;}',
    '#sg-touch .sgi-stick.on{opacity:.85;}',
    '#sg-touch .sgi-knob{position:absolute;left:50%;top:50%;width:38px;height:38px;',
    'margin:-19px 0 0 -19px;border:1px solid #39d98a;border-radius:50%;',
    'background:rgba(57,217,138,.18);}',
    '#sg-touch .sgi-pad{position:absolute;right:calc(14px + env(safe-area-inset-right));',
    'bottom:calc(14px + env(safe-area-inset-bottom));display:flex;',
    'flex-direction:column;align-items:flex-end;gap:12px;}',
    '#sg-touch .sgi-btn{pointer-events:auto;display:flex;align-items:center;',
    'justify-content:center;border:1px solid #39d98a;border-radius:50%;',
    'background:rgba(0,0,0,.45);color:#39d98a;opacity:.4;text-align:center;',
    'padding:0 4px;overflow:hidden;transition:opacity .1s linear,',
    'background-color .1s linear;-webkit-tap-highlight-color:transparent;',
    'touch-action:none;text-transform:uppercase;}',
    '#sg-touch .sgi-btn.on{opacity:.85;background:rgba(57,217,138,.22);}',
    '#sg-touch .sgi-ctx{width:76px;height:76px;font-size:13px;line-height:1.15;}',
    '#sg-touch .sgi-ctx.idle{opacity:.5;}',
    '#sg-touch .sgi-home{position:absolute;',
    'left:calc(72px + env(safe-area-inset-left));',
    'bottom:calc(96px + env(safe-area-inset-bottom));',
    'width:104px;height:104px;margin:0 0 -52px -52px;',
    'border:1px dashed rgba(57,217,138,.55);border-radius:50%;',
    'background:rgba(0,0,0,.26);opacity:.55;transition:opacity .15s linear;}',
    '#sg-touch .sgi-home.hide{opacity:0;}',
    '#sg-touch .sgi-home i{position:absolute;left:50%;top:50%;width:34px;height:34px;',
    'margin:-17px 0 0 -17px;border:1px solid rgba(57,217,138,.7);border-radius:50%;',
    'background:rgba(57,217,138,.12);font-style:normal;}',
    '#sg-touch .sgi-look{position:absolute;right:calc(20px + env(safe-area-inset-right));',
    'top:calc(50% - 10px);opacity:.34;font-size:11px;letter-spacing:.16em;',
    'transition:opacity .25s linear;}',
    '#sg-touch .sgi-look.hide{opacity:0;}',
    '#sg-touch .sgi-small{width:58px;height:58px;font-size:11px;opacity:.34;}',
    '#sg-touch .sgi-small.on{opacity:.85;}',
    '#sg-touch .sgi-small.latched{opacity:.8;background:rgba(57,217,138,.18);}',
    '@media (max-height:420px){',
    '#sg-touch .sgi-ctx{width:66px;height:66px;}',
    '#sg-touch .sgi-small{width:50px;height:50px;}}'
  ].join('');

  var elRoot = null, elStick = null, elKnob = null;
  var elHome = null, elLookHint = null;
  var homeRetired = false;
  var elCtx = null, elSprint = null, elCrouch = null;
  var touchVisible = true;
  var contextVerb = null;

  function mkEl(tag, cls, txt) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }

  function buildTouchUI() {
    if (elRoot) return elRoot;

    var st = D.createElement('style');
    st.setAttribute('data-sg', 'input');
    st.appendChild(D.createTextNode(STYLE));
    (D.head || D.documentElement).appendChild(st);

    elRoot = mkEl('div');
    elRoot.id = 'sg-touch';
    elRoot.setAttribute('aria-hidden', 'true');

    elHome = mkEl('div', 'sgi-home');
    elHome.appendChild(mkEl('i', ''));
    elRoot.appendChild(elHome);
    elLookHint = mkEl('div', 'sgi-look', 'DRAG TO LOOK');
    elRoot.appendChild(elLookHint);

    elStick = mkEl('div', 'sgi-stick');
    elKnob = mkEl('div', 'sgi-knob');
    elStick.appendChild(elKnob);
    elRoot.appendChild(elStick);

    var pad2 = mkEl('div', 'sgi-pad');
    elCrouch = mkEl('div', 'sgi-btn sgi-small', 'CRCH');
    elSprint = mkEl('div', 'sgi-btn sgi-small', 'RUN');
    elCtx = mkEl('div', 'sgi-btn sgi-ctx idle', 'USE');
    pad2.appendChild(elCrouch);
    pad2.appendChild(elSprint);
    pad2.appendChild(elCtx);
    elRoot.appendChild(pad2);

    bindButton(elCtx, 'interact', false);
    bindButton(elSprint, 'sprint', true);
    bindButton(elCrouch, 'crouch', true);

    D.body.appendChild(elRoot);
    IN.mobileRoot = elRoot;
    syncTouchVisible();
    return elRoot;
  }

  /* toggle=true -> a quick tap latches it on, a second tap releases it,
   * and holding the button works exactly as you would expect. */
  function bindButton(el, action, toggle) {
    var holdId = -1;
    var downT = 0;
    var toggled = false;
    var consumed = false;

    on(el, 'pointerdown', function (e) {
      if (!IN.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      setMode('touch');
      holdId = e.pointerId;
      downT = util.now();
      consumed = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }

      if (toggle && toggled) {
        /* second tap: release the latch */
        toggled = false;
        consumed = true;
        tch[action] = false;
        el.classList.remove('latched');
        el.classList.remove('on');
        return;
      }
      el.classList.add('on');
      tch[action] = true;
      if (!toggle) latch[action] = true;
    }, PASSIVE_NO);

    function up(e) {
      if (holdId !== -1 && holdId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      holdId = -1;
      el.classList.remove('on');
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* optional */ }
      if (consumed) { consumed = false; return; }
      if (toggle && (util.now() - downT) < 0.22) {
        toggled = true;
        tch[action] = true;
        el.classList.add('latched');
        return;
      }
      toggled = false;
      el.classList.remove('latched');
      tch[action] = false;
    }
    on(el, 'pointerup', up, PASSIVE_NO);
    on(el, 'pointercancel', up, PASSIVE_NO);
    on(el, 'contextmenu', function (e) { e.preventDefault(); }, PASSIVE_NO);
  }

  /* The resting ring is only an invitation — it gets out of the way the
   * moment a thumb lands, and the look hint retires once the player looks. */
  IN.homeUsed = function () { return homeRetired; };
  IN.setHomeHidden = function (hidden) {
    if (!elHome) return;
    if (hidden) elHome.classList.add('hide');
    else elHome.classList.remove('hide');
  };
  IN.retireLookHint = function () {
    if (elLookHint) elLookHint.classList.add('hide');
  };

  function syncTouchVisible() {
    if (!elRoot) return;
    var show = touchVisible && IN.mode === 'touch';
    if (show) elRoot.classList.add('on');
    else {
      elRoot.classList.remove('on');
      resetTouchState();
    }
  }

  IN.setTouchVisible = function (v) {
    touchVisible = !!v;
    syncTouchVisible();
  };

  IN.setContextVerb = function (text) {
    contextVerb = (text === undefined || text === null || text === '') ? null : String(text);
    if (!elCtx) return;
    var label = contextVerb || 'USE';
    if (label.length > 9) label = label.slice(0, 9);
    if (elCtx.textContent !== label) elCtx.textContent = label;
    if (contextVerb) elCtx.classList.remove('idle');
    else elCtx.classList.add('idle');
  };

  function resetTouchState() {
    stickActive = false; stickX = 0; stickY = 0;
    for (var i = 0; i < SLOTS; i++) slots[i].id = -1;
    if (elStick) elStick.classList.remove('on');
    for (i = 0; i < ACTIONS.length; i++) tch[ACTIONS[i]] = false;
    if (elSprint) { elSprint.classList.remove('on'); elSprint.classList.remove('latched'); }
    if (elCrouch) { elCrouch.classList.remove('on'); elCrouch.classList.remove('latched'); }
    if (elCtx) elCtx.classList.remove('on');
  }

  /* ------------------------------------------------------------------ */
  /* Pointer routing (canvas)                                            */
  /* ------------------------------------------------------------------ */

  var SLOTS = 10;
  var slots = [];
  (function () {
    for (var i = 0; i < SLOTS; i++) {
      slots.push({
        id: -1, role: 0,      /* 1 = stick, 2 = look */
        ox: 0, oy: 0, lx: 0, ly: 0, t0: 0, moved: 0, live: false
      });
    }
  })();

  function slotOf(id) {
    for (var i = 0; i < SLOTS; i++) if (slots[i].id === id) return slots[i];
    return null;
  }
  function freeSlot() {
    for (var i = 0; i < SLOTS; i++) if (slots[i].id === -1) return slots[i];
    return null;
  }
  function hasRole(role) {
    for (var i = 0; i < SLOTS; i++) if (slots[i].id !== -1 && slots[i].role === role) return true;
    return false;
  }

  function onPointerDown(e) {
    if (!IN.enabled) return;

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      setMode('touch');
      if (!touchVisible) return;
      e.preventDefault();
      var s = freeSlot();
      if (!s) return;
      s.id = e.pointerId;
      s.ox = e.clientX; s.oy = e.clientY;
      s.lx = e.clientX; s.ly = e.clientY;
      s.t0 = util.now();
      s.moved = 0;

      var leftHalf = e.clientX < vw * 0.5;
      if (leftHalf && !hasRole(1)) {
        s.role = 1;
        stickActive = true; stickX = 0; stickY = 0;
        if (elStick) {
          elStick.style.left = e.clientX + 'px';
          elStick.style.top = e.clientY + 'px';
          elStick.classList.add('on');
          if (elKnob) elKnob.style.transform = 'translate(0px,0px)';
        }
        if (elHome) { elHome.classList.add('hide'); homeRetired = true; }
      } else if (!hasRole(2)) {
        s.role = 2;
        if (elLookHint) elLookHint.classList.add('hide');
      } else {
        s.role = 0;
      }
      try { if (dom && dom.setPointerCapture) dom.setPointerCapture(e.pointerId); }
      catch (err) { /* optional */ }
      return;
    }

    /* mouse */
    setMode('kbm');
    if (e.button === 2) { pad.zoom = false; tch.zoom = true; latch.zoom = true; }
    if (e.button === 0) {
      if (wantsAutoLock() && !locked) IN.requestPointerLock();
      if (!locked) {
        mouseDrag = true;
        mLastX = e.clientX; mLastY = e.clientY;
        try { if (dom && dom.setPointerCapture) dom.setPointerCapture(e.pointerId); }
        catch (err2) { /* optional */ }
      }
    }
  }

  function onPointerMove(e) {
    if (!IN.enabled) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    var s = slotOf(e.pointerId);
    if (!s) return;
    e.preventDefault();

    var cx = e.clientX, cy = e.clientY;

    if (s.role === 1) {
      var dx = cx - s.ox, dy = cy - s.oy;
      var m = Math.sqrt(dx * dx + dy * dy);
      var kx = dx, ky = dy;
      if (m > STICK_R) { kx = dx / m * STICK_R; ky = dy / m * STICK_R; }
      if (elKnob) {
        elKnob.style.transform = 'translate(' + kx.toFixed(1) + 'px,' + ky.toFixed(1) + 'px)';
      }
      stickX = dx / STICK_R;
      stickY = -dy / STICK_R;
      return;
    }

    if (s.role === 2) {
      var ldx = cx - s.lx, ldy = cy - s.ly;
      s.lx = cx; s.ly = cy;
      s.moved += Math.abs(ldx) + Math.abs(ldy);
      if (s.moved < LOOK_DEAD_PX) return;
      accLX += ldx * TOUCH_RAD_PER_PX * sens;
      accLY -= ldy * TOUCH_RAD_PER_PX * sens;
    }
  }

  function onPointerUp(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
      if (e.button === 2) tch.zoom = false;
      if (mouseDrag) mouseDrag = false;
      return;
    }
    var s = slotOf(e.pointerId);
    if (!s) return;
    e.preventDefault();

    if (s.role === 1) {
      stickActive = false; stickX = 0; stickY = 0;
      if (elStick) elStick.classList.remove('on');
    } else if (s.role === 2) {
      var dt = util.now() - s.t0;
      var dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      if (dt < TAP_MS / 1000 && (dx * dx + dy * dy) < TAP_PX * TAP_PX) {
        latch.interact = true;
      }
    }
    s.id = -1; s.role = 0;
  }

  function onPointerCancel(e) {
    var s = slotOf(e.pointerId);
    if (s) {
      if (s.role === 1) {
        stickActive = false; stickX = 0; stickY = 0;
        if (elStick) elStick.classList.remove('on');
      }
      s.id = -1; s.role = 0;
    }
    mouseDrag = false;
  }

  /* ------------------------------------------------------------------ */
  /* Gamepad                                                             */
  /* ------------------------------------------------------------------ */

  var padIndex = -1;

  function getPads() {
    var n = W.navigator;
    if (!n) return null;
    if (n.getGamepads) return n.getGamepads();
    if (n.webkitGetGamepads) return n.webkitGetGamepads();
    return null;
  }

  function pollPad(dt) {
    padMX = 0; padMY = 0; padLX = 0; padLY = 0; padActive = false;
    var i;
    for (i = 0; i < ACTIONS.length; i++) pad[ACTIONS[i]] = false;

    var list = getPads();
    if (!list) return;

    var g = null;
    if (padIndex >= 0 && list[padIndex] && list[padIndex].connected) g = list[padIndex];
    if (!g) {
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].connected) { g = list[i]; padIndex = i; break; }
      }
    }
    if (!g) { padIndex = -1; return; }

    var used = false;
    var b = g.buttons, ax = g.axes;

    for (i = 0; i < b.length; i++) {
      var pressedB = typeof b[i] === 'object' ? (b[i].pressed || b[i].value > PAD_TRIGGER)
        : (b[i] > PAD_TRIGGER);
      if (!pressedB) continue;
      used = true;
      var a = PADMAP[i];
      if (a) pad[a] = true;
      if (i === 6) pad.zoom = true;
      if (i === 12) padMY += 1;
      if (i === 13) padMY -= 1;
      if (i === 14) padMX -= 1;
      if (i === 15) padMX += 1;
    }

    if (ax && ax.length >= 2) {
      if (shapeAxis(ax[0], -ax[1], PAD_DEAD) > 0) {
        padMX += _ax; padMY += _ay; used = true;
      }
    }
    if (ax && ax.length >= 4) {
      if (shapeAxis(ax[2], -ax[3], PAD_DEAD) > 0) {
        padLX = _ax; padLY = _ay; used = true;
      }
    }

    if (shapeAxis(padMX, padMY, 0) > 0) { padMX = _ax; padMY = _ay; padActive = true; }
    else { padMX = 0; padMY = 0; }

    if (padLX || padLY) {
      accLX += padLX * PAD_LOOK_RATE * sens * dt;
      accLY += padLY * PAD_LOOK_RATE * sens * dt;
    }

    if (used) setMode('gamepad');
  }

  /* ------------------------------------------------------------------ */
  /* Gyro (opt-in)                                                       */
  /* ------------------------------------------------------------------ */

  var gyroPrevA = null, gyroPrevB = null;

  function onOrient(e) {
    if (!gyroOn) return;
    var a = e.alpha, bb = e.beta;
    if (a === null || a === undefined || bb === null || bb === undefined) return;
    if (gyroPrevA === null) { gyroPrevA = a; gyroPrevB = bb; return; }
    var da = a - gyroPrevA;
    if (da > 180) da -= 360; else if (da < -180) da += 360;
    var db = bb - gyroPrevB;
    if (db > 180) db -= 360; else if (db < -180) db += 360;
    gyroPrevA = a; gyroPrevB = bb;
    accLX -= da * util.DEG * GYRO_GAIN * sens;
    accLY -= db * util.DEG * GYRO_GAIN * sens;
  }

  IN.setGyro = function (v) {
    v = !!v;
    if (v === gyroOn) return;
    gyroOn = v;
    gyroPrevA = null; gyroPrevB = null;
    if (!v) return;
    var DOE = W.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        DOE.requestPermission().then(function (r) {
          if (r !== 'granted') gyroOn = false;
        }).catch(function () { gyroOn = false; });
      } catch (e) { gyroOn = false; }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  IN.setSensitivity = function (n) {
    n = +n;
    if (!(n > 0)) n = 1;
    sens = util.clamp(n, 0.1, 6);
  };
  IN.getSensitivity = function () { return sens; };
  IN.setInvertY = function (b) { invertY = !!b; };

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

  IN.down = function (a) { return !!nowS[a]; };
  IN.pressed = function (a) { return !!nowS[a] && !prevS[a]; };
  IN.released = function (a) { return !nowS[a] && !!prevS[a]; };

  /* Let other systems inject a virtual press (menus, tutorials). */
  IN.press = function (a) { if (nowS[a] !== undefined) latch[a] = true; };

  IN.clear = function () {
    releaseAllKeys();
    resetTouchState();
    accLX = 0; accLY = 0;
    for (var i = 0; i < ACTIONS.length; i++) {
      pad[ACTIONS[i]] = false; latch[ACTIONS[i]] = false;
      nowS[ACTIONS[i]] = false; prevS[ACTIONS[i]] = false;
    }
    IN.axes.move.x = 0; IN.axes.move.y = 0;
    IN.axes.look.x = 0; IN.axes.look.y = 0;
  };

  /* ------------------------------------------------------------------ */
  /* Per-frame                                                           */
  /* ------------------------------------------------------------------ */

  IN.update = function (dt) {
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.25) dt = 0.25;

    pollPad(dt);

    var i, a;
    for (i = 0; i < ACTIONS.length; i++) {
      a = ACTIONS[i];
      prevS[a] = nowS[a];
      nowS[a] = !!(kb[a] || pad[a] || tch[a] || latch[a]);
      latch[a] = false;
    }

    /* ---- move ------------------------------------------------------- */
    var mx = 0, my = 0;
    if (stickActive) {
      shapeAxis(stickX, stickY, TOUCH_DEAD);
      mx = _ax; my = _ay;
    } else if (padActive) {
      mx = padMX; my = padMY;
    } else {
      var kx = (mvKeys.r ? 1 : 0) - (mvKeys.l ? 1 : 0);
      var ky = (mvKeys.f ? 1 : 0) - (mvKeys.b ? 1 : 0);
      if (kx || ky) { shapeAxis(kx, ky, KEY_DEAD); mx = _ax; my = _ay; }
    }
    if (!IN.enabled) { mx = 0; my = 0; }
    IN.axes.move.x = mx;
    IN.axes.move.y = my;

    /* ---- look ------------------------------------------------------- */
    if (!IN.enabled) { accLX = 0; accLY = 0; }
    IN.axes.look.x = accLX;
    IN.axes.look.y = invertY ? -accLY : accLY;
    accLX = 0; accLY = 0;
  };

  /* ------------------------------------------------------------------ */
  /* Init / dispose                                                      */
  /* ------------------------------------------------------------------ */

  IN.init = function (domElement) {
    if (inited) return IN;
    inited = true;
    dom = domElement || D.getElementById('gl') || D.body;

    var st = SG.state && SG.state.settings;
    if (st) {
      if (typeof st.sensitivity === 'number') IN.setSensitivity(st.sensitivity);
      invertY = !!st.invertY;
      if (st.gyro) IN.setGyro(true);
    }

    readViewport();
    buildTouchUI();

    /* keyboard */
    on(W, 'keydown', onKeyDown, PASSIVE_NO);
    on(W, 'keyup', onKeyUp, false);
    on(W, 'blur', function () { releaseAllKeys(); resetTouchState(); mouseDrag = false; }, false);

    /* pointers on the canvas */
    on(dom, 'pointerdown', onPointerDown, PASSIVE_NO);
    on(W, 'pointermove', onPointerMove, PASSIVE_NO);
    on(W, 'pointerup', onPointerUp, PASSIVE_NO);
    on(W, 'pointercancel', onPointerCancel, PASSIVE_NO);
    on(W, 'mousemove', onMouseMove, false);

    /* pointer lock */
    on(D, 'pointerlockchange', onLockChange, false);
    on(D, 'mozpointerlockchange', onLockChange, false);
    on(D, 'webkitpointerlockchange', onLockChange, false);
    on(D, 'pointerlockerror', onLockError, false);
    on(D, 'mozpointerlockerror', onLockError, false);

    /* gamepad */
    on(W, 'gamepadconnected', function (e) {
      if (e && e.gamepad) padIndex = e.gamepad.index;
    }, false);
    on(W, 'gamepaddisconnected', function () { padIndex = -1; }, false);

    /* gyro */
    on(W, 'deviceorientation', onOrient, false);

    /* viewport */
    on(W, 'resize', readViewport, false);
    on(W, 'orientationchange', function () {
      readViewport();
      resetTouchState();
      W.setTimeout(readViewport, 260);
    }, false);

    /* iOS / webview hostility */
    on(D, 'contextmenu', function (e) {
      if (e.target === dom || (elRoot && elRoot.contains(e.target))) e.preventDefault();
    }, PASSIVE_NO);
    on(D, 'gesturestart', function (e) { e.preventDefault(); }, PASSIVE_NO);
    on(D, 'gesturechange', function (e) { e.preventDefault(); }, PASSIVE_NO);
    on(D, 'gestureend', function (e) { e.preventDefault(); }, PASSIVE_NO);
    on(D, 'dblclick', function (e) {
      if (e.target === dom || (elRoot && elRoot.contains(e.target))) e.preventDefault();
    }, PASSIVE_NO);
    on(D, 'touchmove', function (e) {
      if (e.target === dom || (elRoot && elRoot.contains(e.target))) {
        if (e.cancelable) e.preventDefault();
      }
    }, PASSIVE_NO);
    on(D, 'touchstart', function (e) {
      /* Suppress the iOS double-tap-to-zoom without killing UI taps. */
      if (e.target === dom && e.touches && e.touches.length > 1 && e.cancelable) {
        e.preventDefault();
      }
    }, PASSIVE_NO);
    on(D, 'selectstart', function (e) {
      if (e.target === dom || (elRoot && elRoot.contains(e.target))) e.preventDefault();
    }, PASSIVE_NO);

    SG.bus.on('pause', function () { releaseAllKeys(); resetTouchState(); IN.exitPointerLock(); });

    return IN;
  };

  IN.dispose = function () {
    offAll();
    if (elRoot && elRoot.parentNode) elRoot.parentNode.removeChild(elRoot);
    elRoot = elStick = elKnob = elCtx = elSprint = elCrouch = null;
    elHome = elLookHint = null;
    IN.mobileRoot = null;
    inited = false;
  };

  IN.actions = ACTIONS;

})(window.SG, window, document);

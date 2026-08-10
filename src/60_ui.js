/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   60_ui.js - IP.UI, IP.Input, IP.Audio
   Agent G. Everything the player touches and hears.

   - No ES modules, no external libraries, no URLs, no assets.
   - Single IIFE. Exposes ONLY IP.UI, IP.Input, IP.Audio.
   - All visuals: DOM + injected CSS + Canvas2D. System font stacks only.
   - All audio: 100% WebAudio synthesis. Zero audio files.
   - Mobile-first touch control scheme (the primary play target is a phone).
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  /* ====================================================================== */
  /* ==  0.  SMALL LOCAL HELPERS                                          == */
  /* ====================================================================== */

  var U = (IP && IP.Util) ? IP.Util : null;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); }
  function now() {
    if (U && U.now) { return U.now(); }
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function emit(name, payload) { if (U && U.emit) { try { U.emit(name, payload); } catch (e) { } } }
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  function hasDoc() { return typeof document !== 'undefined' && !!document; }
  function hasWin() { return typeof window !== 'undefined' && !!window; }

  function warn(a, b) {
    if (typeof console !== 'undefined' && console.warn) {
      try { console.warn('[IP.UI]', a, b); } catch (e) { }
    }
  }

  /* Safe DOM element factory. Returns a live element or an inert stub. */
  var INERT = null;
  function inert() {
    if (INERT) { return INERT; }
    INERT = {
      style: {}, dataset: {}, children: [], nodeType: 1,
      className: '', id: '', textContent: '', innerHTML: '', value: '',
      classList: {
        add: function () { }, remove: function () { },
        toggle: function () { }, contains: function () { return false; }
      },
      appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
      insertBefore: function (c) { return c; },
      addEventListener: function () { }, removeEventListener: function () { },
      setAttribute: function () { }, removeAttribute: function () { },
      getAttribute: function () { return null; },
      querySelector: function () { return inert(); },
      querySelectorAll: function () { return []; },
      getBoundingClientRect: function () {
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
      },
      getContext: function () { return null; },
      focus: function () { }, blur: function () { }, click: function () { },
      requestPointerLock: function () { }, requestFullscreen: function () { },
      scrollTop: 0, scrollHeight: 0, offsetWidth: 0, offsetHeight: 0
    };
    return INERT;
  }

  function mk(tag, cls, parent, text) {
    var e;
    if (!hasDoc() || !document.createElement) { return inert(); }
    try { e = document.createElement(tag); } catch (err) { return inert(); }
    if (!e) { return inert(); }
    if (!e.style) { e.style = {}; }
    if (!e.classList) {
      e.classList = {
        add: function () { }, remove: function () { },
        toggle: function () { }, contains: function () { return false; }
      };
    }
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    if (parent && parent.appendChild) { try { parent.appendChild(e); } catch (err2) { } }
    return e;
  }

  function on(target, evt, fn, opts) {
    if (!target || !target.addEventListener) { return; }
    try { target.addEventListener(evt, fn, opts === undefined ? false : opts); } catch (e) { }
  }
  function off(target, evt, fn, opts) {
    if (!target || !target.removeEventListener) { return; }
    try { target.removeEventListener(evt, fn, opts === undefined ? false : opts); } catch (e) { }
  }
  function setText(el, t) { if (el) { try { el.textContent = String(t); } catch (e) { } } }
  function setHTML(el, t) { if (el) { try { el.innerHTML = String(t); } catch (e) { } } }
  function addC(el, c) { if (el && el.classList) { try { el.classList.add(c); } catch (e) { } } }
  function remC(el, c) { if (el && el.classList) { try { el.classList.remove(c); } catch (e) { } } }
  function togC(el, c, v) {
    if (!el) { return; }
    if (v) { addC(el, c); } else { remC(el, c); }
  }
  function sty(el, k, v) { if (el && el.style) { try { el.style[k] = v; } catch (e) { } } }
  function showEl(el, v) { sty(el, 'display', v ? '' : 'none'); }
  function rect(el) {
    if (el && el.getBoundingClientRect) {
      try {
        var r = el.getBoundingClientRect();
        if (r) { return r; }
      } catch (e) { }
    }
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  function fmt2(n) { n = Math.floor(n); return n < 10 ? '0' + n : '' + n; }
  function clockStr(sec) {
    if (!isFinite(sec) || sec < 0) { sec = 0; }
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return fmt2(m) + ':' + fmt2(s);
  }

  /* localStorage wrapper that never throws (private mode / file:// / node). */
  var LS = {
    get: function (k, dflt) {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) { return dflt; }
        var v = localStorage.getItem(k);
        return (v === null || v === undefined) ? dflt : v;
      } catch (e) { return dflt; }
    },
    set: function (k, v) {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) { return false; }
        localStorage.setItem(k, v); return true;
      } catch (e) { return false; }
    },
    getJSON: function (k, dflt) {
      var s = LS.get(k, null);
      if (s === null || s === undefined) { return dflt; }
      try { return JSON.parse(s); } catch (e) { return dflt; }
    },
    setJSON: function (k, o) {
      try { return LS.set(k, JSON.stringify(o)); } catch (e) { return false; }
    }
  };

  /* ====================================================================== */
  /* ==  1.  SETTINGS MODEL                                               == */
  /* ====================================================================== */

  var SETTINGS_KEY = 'islandProtocolSettings';

  var AIM_ASSIST_LEVELS = [
    { id: 'off', deg: 0, label: 'Off' },
    { id: 'light', deg: 4, label: 'Light (4 deg)' },
    { id: 'medium', deg: 8, label: 'Medium (8 deg)' },
    { id: 'strong', deg: 14, label: 'Strong (14 deg)' }
  ];

  var DEFAULT_SETTINGS = {
    /* audio */
    volMaster: 0.9, volMusic: 0.65, volSfx: 0.9, volVoice: 1.0,
    /* video */
    quality: 1, brightness: 1.0, fov: 62, hudScale: 1.0,
    /* input */
    sensitivity: 1.0, touchSensitivity: 1.1, invertY: false,
    aimAssistIdx: 2, gyroAssist: false, gyroStrength: 0.5,
    aimToggle: false, controlLayout: 'auto', leftHanded: false,
    vibration: true, stickDeadzone: 0.16, triggerThreshold: 0.45,
    autoSprint: true,
    /* accessibility */
    subtitles: true, subtitleSize: 1.0, subtitleBg: 0.55, captions: true,
    colorblind: 'none', gore: true, reduceMotion: false, highContrast: false,
    difficulty: 'normal',
    /* bindings */
    keys: null, pad: null
  };

  var S_ = null; /* live settings object */

  function defaultKeys() {
    return {
      forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
      sprint: 'ShiftLeft', crouch: 'ControlLeft',
      interact: 'KeyE', reload: 'KeyR', flashlight: 'KeyF',
      melee: 'Space', quickTurn: 'KeyQ', swap: 'KeyG',
      inventory: 'Tab', map: 'KeyM', pause: 'Escape',
      weapon1: 'Digit1', weapon2: 'Digit2', weapon3: 'Digit3',
      weapon4: 'Digit4', weapon5: 'Digit5',
      cmdFollow: 'KeyZ', cmdStay: 'KeyX', cmdHide: 'KeyC',
      cmdCome: 'KeyV', cmdInteract: 'KeyB',
      aim: 'Mouse2', fire: 'Mouse0'
    };
  }

  function defaultPad() {
    /* Standard Gamepad mapping indices. Negative = axis-as-button (trigger). */
    return {
      fire: 7, aim: 6, reload: 2, melee: 1, interact: 0, swap: 3,
      flashlight: 4, quickTurn: 5, inventory: 8, pause: 9,
      sprint: 10, crouch: 11,
      cmdFollow: 12, cmdStay: 13, cmdHide: 14, cmdCome: 15,
      cmdInteract: -1, map: -1,
      weapon1: -1, weapon2: -1, weapon3: -1, weapon4: -1, weapon5: -1
    };
  }

  var KEY_LABELS = {
    forward: 'Move Forward', back: 'Move Back', left: 'Strafe Left', right: 'Strafe Right',
    sprint: 'Sprint', crouch: 'Crouch', interact: 'Interact', reload: 'Reload',
    flashlight: 'Flashlight', melee: 'Melee / Dodge', quickTurn: 'Quick Turn',
    swap: 'Swap Weapon', inventory: 'Attache Case', map: 'Map', pause: 'Pause',
    weapon1: 'Weapon Slot 1', weapon2: 'Weapon Slot 2', weapon3: 'Weapon Slot 3',
    weapon4: 'Weapon Slot 4', weapon5: 'Weapon Slot 5',
    cmdFollow: 'Order: Follow', cmdStay: 'Order: Stay', cmdHide: 'Order: Hide',
    cmdCome: 'Order: Come', cmdInteract: 'Order: Interact',
    aim: 'Aim', fire: 'Fire'
  };
  var KEY_ORDER = [
    'forward', 'back', 'left', 'right', 'sprint', 'crouch',
    'aim', 'fire', 'reload', 'melee', 'interact', 'flashlight',
    'quickTurn', 'swap', 'inventory', 'map', 'pause',
    'weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5',
    'cmdFollow', 'cmdStay', 'cmdHide', 'cmdCome', 'cmdInteract'
  ];

  var PAD_LABELS = [
    'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start',
    'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide'
  ];

  function prettyKey(code) {
    if (!code) { return '--'; }
    if (code.indexOf('Mouse') === 0) {
      var n = parseInt(code.slice(5), 10);
      return n === 0 ? 'LMB' : (n === 1 ? 'MMB' : (n === 2 ? 'RMB' : 'M' + n));
    }
    if (code === 'Wheel+') { return 'Wheel Up'; }
    if (code === 'Wheel-') { return 'Wheel Down'; }
    if (code.indexOf('Key') === 0) { return code.slice(3); }
    if (code.indexOf('Digit') === 0) { return code.slice(5); }
    if (code.indexOf('Numpad') === 0) { return 'Num ' + code.slice(6); }
    if (code.indexOf('Arrow') === 0) { return code.slice(5) + ' Arrow'; }
    var map = {
      ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
      ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
      AltLeft: 'L Alt', AltRight: 'R Alt',
      Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      Backslash: '\\', CapsLock: 'Caps'
    };
    return map[code] || code;
  }

  function prettyPad(idx) {
    if (idx === undefined || idx === null || idx < 0) { return '--'; }
    return PAD_LABELS[idx] || ('B' + idx);
  }

  function loadSettings() {
    var raw = LS.getJSON(SETTINGS_KEY, null);
    var s = {}, k;
    for (k in DEFAULT_SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) { s[k] = DEFAULT_SETTINGS[k]; }
    }
    if (raw && typeof raw === 'object') {
      for (k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k) &&
            Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) {
          s[k] = raw[k];
        }
      }
    }
    var dk = defaultKeys(), dp = defaultPad();
    if (!s.keys || typeof s.keys !== 'object') { s.keys = dk; }
    else { for (k in dk) { if (!(k in s.keys)) { s.keys[k] = dk[k]; } } }
    if (!s.pad || typeof s.pad !== 'object') { s.pad = dp; }
    else { for (k in dp) { if (!(k in s.pad)) { s.pad[k] = dp[k]; } } }
    s.quality = clamp(s.quality | 0, 0, 2);
    s.aimAssistIdx = clamp(s.aimAssistIdx | 0, 0, AIM_ASSIST_LEVELS.length - 1);
    return s;
  }

  function saveSettings() { if (S_) { LS.setJSON(SETTINGS_KEY, S_); } }
  S_ = loadSettings();

  function aimAssistDeg() { return AIM_ASSIST_LEVELS[S_.aimAssistIdx].deg; }

  /* ====================================================================== */
  /* ==  2.  PALETTE / COLORBLIND                                         == */
  /* ====================================================================== */

  /* Base palette. Colorblind variants remap the semantic hues so that
     health/threat/status never rely on red-vs-green alone. */
  var PALETTES = {
    none: {
      hp: '#c8322a', hpGhost: '#5d1512', heal: '#3fbf72',
      stam: '#c8b25a', ammo: '#d8dde2', warn: '#e08a24',
      fear: '#8b5cc8', ok: '#4fa8d8', bad: '#d33b2c', good: '#3fbf72'
    },
    protan: {
      hp: '#e0a52a', hpGhost: '#5b4310', heal: '#38b0d6',
      stam: '#dcd06a', ammo: '#e6ecf2', warn: '#f0c040',
      fear: '#9d6ee0', ok: '#54b9e8', bad: '#f0b429', good: '#38b0d6'
    },
    deutan: {
      hp: '#e07b1e', hpGhost: '#5b3110', heal: '#3fa9e0',
      stam: '#ded27a', ammo: '#e6ecf2', warn: '#f2c945',
      fear: '#a071e8', ok: '#5cc0ef', bad: '#e07b1e', good: '#3fa9e0'
    },
    tritan: {
      hp: '#d63a48', hpGhost: '#5c1620', heal: '#2fc4a8',
      stam: '#e07fa0', ammo: '#f0e8ee', warn: '#e0616e',
      fear: '#c05fb0', ok: '#2fc4a8', bad: '#d63a48', good: '#2fc4a8'
    }
  };
  function pal() { return PALETTES[S_.colorblind] || PALETTES.none; }

  var SPEAKER_COLORS = {
    CALLEN: '#cfd6dc', WARDEN: '#cfd6dc',
    ELENA: '#e8c98a', PHOENIX: '#e8c98a',
    ANVIL: '#79b6d9', KOWALSKI: '#79b6d9',
    'CARRION-6': '#7fd4a8', DUBOIS: '#7fd4a8',
    SERRANO: '#a98fd0', MERSE: '#d08a6a', HALDANE: '#8fd0c4',
    RADIO: '#79b6d9', PA: '#c0a060', GANADO: '#9a8878',
    JUNE: '#d9a8c0', STANEK: '#c0b090', TOMAS: '#b0c8d0'
  };
  function speakerColor(sp) {
    if (!sp) { return '#cfd6dc'; }
    var k = String(sp).toUpperCase();
    return SPEAKER_COLORS[k] || '#b9c2ca';
  }

  /* ====================================================================== */
  /* ==  3.  CSS  (injected; no @import, no url(), no web fonts)          == */
  /* ====================================================================== */

  var FONT_UI = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  var FONT_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace";

  function buildCSS() {
    var css = [];
    css.push("#ip-ui,#ip-ui *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;" +
      "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}");
    css.push("#ip-ui{position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden;" +
      "font-family:" + FONT_UI + ";color:#cfd6dc;z-index:10;touch-action:none;overscroll-behavior:none;" +
      "-webkit-font-smoothing:antialiased;letter-spacing:.02em;}");
    css.push("#ip-ui.ip-nopointer{pointer-events:none;}");
    css.push("#ip-ui .pe{pointer-events:auto;}");
    css.push("html.ip-host,body.ip-host{margin:0;padding:0;width:100%;height:100%;overflow:hidden;" +
      "background:#05070a;touch-action:none;overscroll-behavior:none;position:fixed;" +
      "-webkit-text-size-adjust:100%;}");

    /* ---- layers ---- */
    css.push(".ip-layer{position:absolute;left:0;top:0;width:100%;height:100%;}");
    css.push("#ip-hudcv{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;}");
    css.push(".ip-safe{position:absolute;left:0;top:0;width:100%;height:100%;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
      "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);}");

    /* ---- generic panel chrome ---- */
    css.push(".ip-panel{background:linear-gradient(160deg,rgba(12,16,20,.96),rgba(7,10,13,.98));" +
      "border:1px solid rgba(120,140,150,.22);box-shadow:0 18px 60px rgba(0,0,0,.75)," +
      "inset 0 1px 0 rgba(200,220,230,.06);}");
    css.push(".ip-title{font-size:13px;letter-spacing:.34em;text-transform:uppercase;color:#7f8e98;}");
    css.push(".ip-rule{height:1px;background:linear-gradient(90deg,rgba(150,175,185,.45),rgba(150,175,185,0));}");
    css.push(".ip-mono{font-family:" + FONT_MONO + ";}");
    css.push(".ip-dim{color:#78868f;}");
    css.push(".ip-acc{color:#8fbf6a;}");
    css.push(".ip-red{color:#c8322a;}");

    /* ---- buttons ---- */
    css.push(".ip-btn{display:block;width:100%;text-align:left;background:rgba(20,26,31,.72);" +
      "border:1px solid rgba(130,150,160,.20);color:#c4ccd2;font:inherit;font-size:15px;" +
      "padding:13px 16px;margin:6px 0;cursor:pointer;letter-spacing:.14em;text-transform:uppercase;" +
      "transition:background .12s linear,border-color .12s linear,color .12s linear;min-height:44px;}");
    css.push(".ip-btn:hover,.ip-btn.sel{background:rgba(46,58,52,.85);border-color:rgba(150,200,120,.5);color:#eaf1e6;}");
    css.push(".ip-btn:active{background:rgba(70,88,74,.9);}");
    css.push(".ip-btn.dis{opacity:.35;pointer-events:none;}");
    css.push(".ip-btn.sm{font-size:12px;padding:8px 10px;min-height:36px;letter-spacing:.1em;width:auto;display:inline-block;}");
    css.push(".ip-btn.danger:hover{border-color:rgba(200,60,50,.6);background:rgba(60,24,22,.9);color:#f0c4c0;}");

    /* ---- rows / sliders ---- */
    css.push(".ip-row{display:flex;align-items:center;gap:12px;padding:9px 6px;" +
      "border-bottom:1px solid rgba(120,140,150,.10);min-height:44px;}");
    css.push(".ip-row .lab{flex:0 0 42%;font-size:13px;color:#9fabb3;letter-spacing:.08em;}");
    css.push(".ip-row .val{flex:0 0 76px;text-align:right;font-family:" + FONT_MONO + ";font-size:12px;color:#cfd6dc;}");
    css.push(".ip-row .ctl{flex:1 1 auto;display:flex;align-items:center;gap:8px;}");
    css.push(".ip-slider{position:relative;flex:1 1 auto;height:30px;cursor:pointer;touch-action:none;}");
    css.push(".ip-slider .trk{position:absolute;left:0;right:0;top:14px;height:3px;background:rgba(140,160,170,.22);}");
    css.push(".ip-slider .fil{position:absolute;left:0;top:14px;height:3px;background:#8fbf6a;}");
    css.push(".ip-slider .nub{position:absolute;top:8px;width:15px;height:15px;margin-left:-7px;" +
      "background:#cfe0c0;border:1px solid #2a3228;}");
    css.push(".ip-seg{display:flex;flex:1 1 auto;gap:4px;}");
    css.push(".ip-seg .o{flex:1 1 0;text-align:center;padding:8px 4px;font-size:11px;letter-spacing:.1em;" +
      "background:rgba(20,26,31,.7);border:1px solid rgba(130,150,160,.18);cursor:pointer;color:#8b979e;" +
      "text-transform:uppercase;min-height:36px;display:flex;align-items:center;justify-content:center;}");
    css.push(".ip-seg .o.on{background:rgba(52,70,50,.9);border-color:rgba(150,200,120,.55);color:#e6f0dd;}");
    css.push(".ip-tabs{display:flex;gap:2px;flex-wrap:wrap;margin-bottom:10px;}");
    css.push(".ip-tabs .t{padding:9px 14px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;" +
      "color:#7f8e98;cursor:pointer;border-bottom:2px solid transparent;min-height:40px;}");
    css.push(".ip-tabs .t.on{color:#dfe7ec;border-bottom-color:#8fbf6a;}");
    css.push(".ip-scroll{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}");
    css.push(".ip-scroll::-webkit-scrollbar{width:6px;}");
    css.push(".ip-scroll::-webkit-scrollbar-thumb{background:rgba(140,165,175,.3);}");

    /* ---- screens ---- */
    css.push(".ip-screen{position:absolute;left:0;top:0;width:100%;height:100%;display:none;" +
      "pointer-events:auto;z-index:40;}");
    css.push(".ip-screen.on{display:block;}");
    css.push(".ip-scrim{position:absolute;left:0;top:0;width:100%;height:100%;" +
      "background:radial-gradient(120% 90% at 50% 40%,rgba(6,9,12,.80),rgba(2,3,5,.96));}");
    css.push(".ip-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}");

    /* ---- title ---- */
    css.push("#ip-titlecv{position:absolute;left:0;top:0;width:100%;height:100%;}");
    css.push(".ip-titlewrap{position:absolute;left:max(6vw,env(safe-area-inset-left,0px));bottom:12vh;" +
      "max-width:min(560px,88vw);}");
    css.push(".ip-gamename{font-size:clamp(26px,6.2vw,58px);line-height:.98;letter-spacing:.02em;" +
      "font-weight:800;color:#e8eef2;text-shadow:0 4px 30px rgba(0,0,0,.9);}");
    css.push(".ip-gamename em{display:block;font-style:normal;font-size:.44em;letter-spacing:.44em;" +
      "color:#9fb0a0;margin-top:.7em;font-weight:600;}");
    css.push(".ip-tagline{margin:16px 0 22px;font-size:clamp(11px,2.4vw,14px);color:#8b9aa2;" +
      "letter-spacing:.1em;font-style:italic;}");
    css.push(".ip-menu{max-width:340px;}");
    css.push(".ip-ver{position:absolute;right:14px;bottom:calc(10px + env(safe-area-inset-bottom,0px));" +
      "font-size:10px;color:#4d5860;letter-spacing:.22em;font-family:" + FONT_MONO + ";}");

    /* ---- modal frames ---- */
    css.push(".ip-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "width:min(940px,94vw);height:min(680px,90vh);display:flex;flex-direction:column;padding:18px;}");
    css.push(".ip-modal .hd{display:flex;align-items:center;justify-content:space-between;" +
      "padding-bottom:10px;margin-bottom:8px;border-bottom:1px solid rgba(130,150,160,.2);}");
    css.push(".ip-modal .bd{flex:1 1 auto;min-height:0;display:flex;gap:16px;}");
    css.push(".ip-modal .ft{padding-top:10px;margin-top:8px;border-top:1px solid rgba(130,150,160,.15);" +
      "display:flex;gap:8px;flex-wrap:wrap;align-items:center;}");
    css.push(".ip-x{width:42px;height:42px;line-height:42px;text-align:center;font-size:18px;cursor:pointer;" +
      "color:#8b979e;border:1px solid rgba(130,150,160,.2);}");
    css.push(".ip-x:hover{color:#e0e8ee;border-color:rgba(200,60,50,.6);}");

    /* ---- inventory ---- */
    css.push(".ip-invwrap{display:flex;gap:16px;flex:1 1 auto;min-height:0;}");
    css.push(".ip-case{position:relative;background:linear-gradient(150deg,#171b17,#0c0f0c);" +
      "border:2px solid rgba(120,110,80,.35);box-shadow:inset 0 0 60px rgba(0,0,0,.85);" +
      "touch-action:none;flex:0 0 auto;}");
    css.push(".ip-cell{position:absolute;border:1px solid rgba(150,160,140,.10);}");
    css.push(".ip-item{position:absolute;background:linear-gradient(150deg,rgba(58,66,56,.94),rgba(28,34,28,.96));" +
      "border:1px solid rgba(170,185,150,.4);cursor:grab;overflow:hidden;touch-action:none;" +
      "transition:box-shadow .1s linear;}");
    css.push(".ip-item.drag{opacity:.85;cursor:grabbing;z-index:60;box-shadow:0 10px 30px rgba(0,0,0,.8);}");
    css.push(".ip-item.bad{border-color:rgba(200,60,48,.9);background:rgba(70,24,20,.9);}");
    css.push(".ip-item.ok{border-color:rgba(140,200,110,.95);}");
    css.push(".ip-item .nm{position:absolute;left:3px;top:2px;font-size:9px;letter-spacing:.04em;" +
      "color:#cdd6c8;text-shadow:0 1px 2px #000;pointer-events:none;line-height:1.05;}");
    css.push(".ip-item .ct{position:absolute;right:3px;bottom:1px;font-size:11px;font-family:" + FONT_MONO + ";" +
      "color:#e6eee0;text-shadow:0 1px 3px #000;pointer-events:none;}");
    css.push(".ip-item .ic{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;}");
    css.push(".ip-side{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:10px;}");
    css.push("#ip-prevcv{width:100%;height:180px;background:rgba(6,9,11,.7);border:1px solid rgba(120,140,150,.18);}");
    css.push(".ip-stats{font-size:12px;color:#9aa6ad;line-height:1.7;}");
    css.push(".ip-stats b{color:#dbe3e8;font-weight:600;}");
    css.push(".ip-bar{height:6px;background:rgba(140,160,170,.16);margin:3px 0 8px;position:relative;}");
    css.push(".ip-bar i{position:absolute;left:0;top:0;height:100%;background:#8fbf6a;display:block;}");
    css.push(".ip-bar u{position:absolute;top:0;height:100%;background:rgba(230,200,110,.75);display:block;}");
    css.push(".ip-tip{position:absolute;z-index:80;max-width:250px;padding:9px 11px;font-size:12px;" +
      "background:rgba(8,11,14,.97);border:1px solid rgba(140,160,170,.35);color:#c6ced4;pointer-events:none;" +
      "line-height:1.5;display:none;}");
    css.push(".ip-tip.on{display:block;}");
    css.push(".ip-tip h4{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#e6edf2;margin-bottom:4px;}");

    /* ---- subtitles ---- */
    css.push("#ip-subs{position:absolute;left:50%;transform:translateX(-50%);" +
      "bottom:calc(14% + env(safe-area-inset-bottom,0px));width:min(760px,84vw);text-align:center;" +
      "pointer-events:none;z-index:30;}");
    css.push(".ip-sub{display:inline-block;padding:6px 14px;margin:3px 0;line-height:1.42;" +
      "text-shadow:0 2px 6px rgba(0,0,0,.95);}");
    css.push(".ip-sub .sp{font-weight:700;letter-spacing:.13em;text-transform:uppercase;margin-right:8px;}");
    css.push(".ip-sub.cap{font-style:italic;color:#9dabb3;}");

    /* ---- prompts / toasts ---- */
    css.push("#ip-prompt{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);" +
      "display:none;align-items:center;gap:10px;pointer-events:none;z-index:28;}");
    css.push("#ip-prompt.on{display:flex;}");
    css.push(".ip-glyph{min-width:34px;height:34px;padding:0 8px;display:flex;align-items:center;" +
      "justify-content:center;border:2px solid rgba(215,225,232,.85);color:#eef3f7;font-size:13px;" +
      "font-weight:700;font-family:" + FONT_MONO + ";background:rgba(10,14,18,.55);border-radius:5px;}");
    css.push(".ip-glyph.pad{border-radius:50%;background:rgba(40,60,90,.7);}");
    css.push(".ip-glyph.touch{border-radius:50%;background:rgba(40,70,50,.6);}");
    css.push("#ip-prompt .tx{font-size:14px;letter-spacing:.13em;text-transform:uppercase;" +
      "text-shadow:0 2px 6px #000;color:#dde5ea;}");
    css.push("#ip-toasts{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));" +
      "top:calc(64px + env(safe-area-inset-top,0px));width:min(300px,60vw);z-index:32;pointer-events:none;}");
    css.push(".ip-toast{background:rgba(10,14,17,.9);border-left:3px solid #8fbf6a;padding:9px 12px;" +
      "margin-bottom:6px;font-size:12px;letter-spacing:.06em;color:#c8d2d8;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.6);}");

    /* ---- objective / countdown ---- */
    css.push("#ip-obj{position:absolute;left:calc(18px + env(safe-area-inset-left,0px));" +
      "top:calc(16px + env(safe-area-inset-top,0px));max-width:44vw;z-index:26;pointer-events:none;}");
    css.push("#ip-obj .k{font-size:9px;letter-spacing:.34em;color:#6f8072;text-transform:uppercase;}");
    css.push("#ip-obj .v{font-size:13px;color:#c3ccd2;margin-top:3px;line-height:1.35;text-shadow:0 2px 5px #000;}");
    css.push("#ip-clock{position:absolute;left:50%;transform:translateX(-50%);" +
      "top:calc(12px + env(safe-area-inset-top,0px));text-align:center;display:none;z-index:26;pointer-events:none;}");
    css.push("#ip-clock.on{display:block;}");
    css.push("#ip-clock .k{font-size:9px;letter-spacing:.34em;color:#8a6f62;text-transform:uppercase;}");
    css.push("#ip-clock .v{font-family:" + FONT_MONO + ";font-size:clamp(20px,4.4vw,30px);color:#e0c8a0;" +
      "text-shadow:0 0 18px rgba(220,120,60,.5);}");
    css.push("#ip-clock.crit .v{color:#f05a44;text-shadow:0 0 22px rgba(240,60,40,.75);}");

    /* ---- QTE ---- */
    css.push("#ip-qte{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;" +
      "z-index:44;text-align:center;}");
    css.push("#ip-qte.on{display:block;}");
    css.push("#ip-qtebtn{width:min(210px,46vw);height:min(210px,46vw);border-radius:50%;" +
      "border:4px solid rgba(230,90,70,.9);background:radial-gradient(circle at 50% 40%," +
      "rgba(120,30,24,.55),rgba(20,8,8,.35));display:flex;align-items:center;justify-content:center;" +
      "font-size:clamp(15px,4vw,22px);font-weight:800;letter-spacing:.2em;color:#ffd8cf;" +
      "text-transform:uppercase;pointer-events:auto;touch-action:none;box-shadow:0 0 60px rgba(220,60,40,.35);}");
    css.push("#ip-qtebtn.hit{background:radial-gradient(circle at 50% 40%,rgba(200,70,50,.85),rgba(60,16,12,.6));}");
    css.push("#ip-qtebar{width:min(260px,60vw);height:8px;margin:16px auto 0;background:rgba(120,40,32,.4);}");
    css.push("#ip-qtebar i{display:block;height:100%;background:#e8604a;width:0%;}");

    /* ---- touch controls ---- */
    css.push("#ip-touch{position:absolute;left:0;top:0;width:100%;height:100%;display:none;z-index:22;}");
    css.push("#ip-touch.on{display:block;}");
    css.push("#ip-stick{position:absolute;width:132px;height:132px;margin:-66px 0 0 -66px;display:none;" +
      "pointer-events:none;}");
    css.push("#ip-stick.on{display:block;}");
    css.push("#ip-stick .ring{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:50%;" +
      "border:2px solid rgba(190,205,215,.34);background:radial-gradient(circle," +
      "rgba(140,165,180,.10),rgba(140,165,180,.02) 70%,transparent);}");
    css.push("#ip-stick .nub{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;" +
      "border-radius:50%;background:radial-gradient(circle at 40% 35%,rgba(226,236,242,.62)," +
      "rgba(120,140,152,.34));border:1px solid rgba(232,240,246,.5);}");
    css.push("#ip-stick.sprint .ring{border-color:rgba(150,210,120,.75);box-shadow:0 0 22px rgba(120,200,90,.35);}");
    css.push(".ip-tb{position:absolute;display:flex;align-items:center;justify-content:center;" +
      "border-radius:50%;border:2px solid rgba(200,215,225,.34);background:radial-gradient(circle at 42% 34%," +
      "rgba(40,50,58,.62),rgba(12,17,21,.58));color:#dfe8ee;font-size:11px;font-weight:700;" +
      "letter-spacing:.06em;text-transform:uppercase;pointer-events:auto;touch-action:none;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.9);text-align:center;line-height:1.05;}");
    css.push(".ip-tb:before{content:'';position:absolute;left:-14px;top:-14px;right:-14px;bottom:-14px;}");
    css.push(".ip-tb.down{background:radial-gradient(circle at 42% 34%,rgba(120,150,110,.8),rgba(40,60,40,.7));" +
      "border-color:rgba(180,225,150,.9);}");
    css.push(".ip-tb.hot{border-color:rgba(230,120,90,.85);color:#ffd9cd;}");
    css.push(".ip-tb.on2{border-color:rgba(150,210,120,.9);color:#dcf2cc;}");
    css.push(".ip-tb.hide{display:none;}");
    css.push(".ip-tb .sub{position:absolute;bottom:5px;left:0;right:0;font-size:8px;color:#93a2ab;letter-spacing:.02em;}");
    css.push("#ip-look{position:absolute;top:0;height:100%;pointer-events:auto;touch-action:none;}");

    /* ---- radial companion wheel ---- */
    css.push("#ip-radial{position:absolute;left:0;top:0;width:100%;height:100%;display:none;z-index:46;" +
      "background:rgba(4,6,9,.5);pointer-events:auto;touch-action:none;}");
    css.push("#ip-radial.on{display:block;}");
    css.push("#ip-radialcv{position:absolute;left:0;top:0;width:100%;height:100%;}");

    /* ---- companion HUD icon ---- */
    css.push("#ip-comp{position:absolute;left:calc(16px + env(safe-area-inset-left,0px));" +
      "bottom:calc(16px + env(safe-area-inset-bottom,0px));width:78px;height:78px;z-index:27;" +
      "pointer-events:auto;touch-action:none;}");
    css.push("#ip-compcv{width:100%;height:100%;}");

    /* ---- orientation / gate ---- */
    css.push("#ip-orient{position:absolute;left:0;top:0;width:100%;height:100%;display:none;z-index:90;" +
      "background:#05070a;color:#c2cbd2;align-items:center;justify-content:center;text-align:center;" +
      "flex-direction:column;gap:20px;padding:24px;pointer-events:auto;}");
    css.push("#ip-orient.on{display:flex;}");
    css.push(".ip-rot{width:74px;height:112px;border:3px solid #7f8d95;border-radius:10px;" +
      "animation:ip-rotate 2.4s ease-in-out infinite;}");
    css.push("@keyframes ip-rotate{0%,32%{transform:rotate(0)}62%,100%{transform:rotate(-90deg)}}");
    css.push("#ip-gate{position:absolute;left:0;top:0;width:100%;height:100%;display:none;z-index:88;" +
      "background:rgba(4,6,9,.92);align-items:center;justify-content:center;flex-direction:column;gap:18px;" +
      "pointer-events:auto;text-align:center;padding:24px;}");
    css.push("#ip-gate.on{display:flex;}");
    css.push("#ip-gate .big{font-size:clamp(15px,4vw,22px);letter-spacing:.3em;text-transform:uppercase;color:#dde5ea;}");

    /* ---- doc reader ---- */
    css.push(".ip-doc{font-size:14px;line-height:1.75;color:#c0bda8;white-space:pre-wrap;" +
      "font-family:" + FONT_MONO + ";padding:18px 20px;background:rgba(24,22,16,.55);" +
      "border:1px solid rgba(150,135,90,.2);}");
    css.push(".ip-doclist .ip-btn{font-size:12px;padding:9px 12px;text-transform:none;letter-spacing:.05em;}");

    /* ---- map ---- */
    css.push("#ip-mapcv{width:100%;height:100%;background:rgba(6,10,12,.6);}");

    /* ---- results ---- */
    css.push(".ip-rank{font-size:clamp(64px,16vw,150px);font-weight:900;line-height:.9;color:#e6d4a2;" +
      "text-shadow:0 0 60px rgba(220,190,120,.35);}");
    css.push(".ip-resrow{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;" +
      "border-bottom:1px solid rgba(120,140,150,.12);color:#a6b1b8;}");
    css.push(".ip-resrow b{color:#dee6ec;font-family:" + FONT_MONO + ";font-weight:600;}");

    /* ---- gameover ---- */
    css.push(".ip-quote{font-size:clamp(15px,3.4vw,22px);font-style:italic;color:#9aa6ad;line-height:1.6;" +
      "max-width:min(620px,88vw);text-align:center;}");
    css.push(".ip-died{font-size:clamp(30px,8vw,64px);letter-spacing:.34em;color:#8e2018;font-weight:800;" +
      "text-transform:uppercase;text-shadow:0 0 50px rgba(140,20,14,.5);}");

    /* ---- responsive ---- */
    css.push("@media (max-width:820px){" +
      ".ip-modal{width:100vw;height:100%;transform:none;left:0;top:0;padding:12px;border:0;}" +
      ".ip-modal .bd{flex-direction:column;overflow-y:auto;}" +
      "#ip-obj{max-width:56vw;}" +
      ".ip-row .lab{flex:0 0 38%;font-size:12px;}" +
      "}");
    css.push("@media (max-width:420px){" +
      ".ip-row{flex-wrap:wrap;}" +
      ".ip-row .lab{flex:1 1 100%;margin-bottom:2px;}" +
      ".ip-row .val{flex:0 0 60px;}" +
      ".ip-titlewrap{bottom:8vh;}" +
      "}");
    css.push("@media (min-width:2200px){#ip-ui{font-size:18px;}.ip-modal{width:min(1280px,84vw);height:min(880px,84vh);}}");
    css.push("@media (prefers-reduced-motion:reduce){.ip-rot{animation:none;}}");
    return css.join('\n');
  }

  var styleEl = null;
  function injectCSS() {
    if (!hasDoc()) { return; }
    if (styleEl) { return; }
    styleEl = mk('style', null, null, null);
    if (!styleEl || styleEl === inert()) { return; }
    try { styleEl.setAttribute('id', 'ip-style'); } catch (e) { }
    setText(styleEl, buildCSS());
    var head = document.head || document.getElementsByTagName ? (document.head ||
      (document.getElementsByTagName('head') || [])[0]) : null;
    if (head && head.appendChild) { try { head.appendChild(styleEl); } catch (e2) { } }
    else if (document.body && document.body.appendChild) {
      try { document.body.appendChild(styleEl); } catch (e3) { }
    }
    if (document.documentElement) { addC(document.documentElement, 'ip-host'); }
    if (document.body) { addC(document.body, 'ip-host'); }
  }

  /* ====================================================================== */
  /* ==  4.  AUDIO  -  100% synthesized WebAudio                          == */
  /* ====================================================================== */

  var Audio_ = {};
  (function () {

    var ctx = null;
    var ready = false;
    var failed = false;
    var master = null, comp = null, dry = null, verbSend = null, verb = null;
    var busSfx = null, busMusic = null, busVoice = null, busAmb = null;
    var noiseW = null, noiseP = null, noiseB = null;
    var irBuf = null;
    var voices = 0, VOICE_CAP = 32;
    var lowQ = false;
    var listenerPos = [0, 0, 0];
    var t0Boot = 0;

    /* ---------------------------------------------------------- params -- */
    function P(node, name) {
      if (!node) { return null; }
      var p = node[name];
      return (p && typeof p === 'object') ? p : null;
    }
    function setV(p, v, t) {
      if (!p) { return; }
      try { if (p.setValueAtTime) { p.setValueAtTime(v, t); } else { p.value = v; } }
      catch (e) { try { p.value = v; } catch (e2) { } }
    }
    function lin(p, v, t) {
      if (!p) { return; }
      try { if (p.linearRampToValueAtTime) { p.linearRampToValueAtTime(v, t); } else { p.value = v; } }
      catch (e) { }
    }
    function expo(p, v, t) {
      if (!p) { return; }
      if (v <= 0) { v = 0.00001; }
      try { if (p.exponentialRampToValueAtTime) { p.exponentialRampToValueAtTime(v, t); } else { p.value = v; } }
      catch (e) { }
    }
    function conn(a, b) {
      if (!a || !a.connect || !b) { return; }
      try { a.connect(b); } catch (e) { }
    }
    function disc(a) { if (a && a.disconnect) { try { a.disconnect(); } catch (e) { } } }
    function T() { return ctx ? (ctx.currentTime || 0) : 0; }

    /* ------------------------------------------------------- node makers */
    function gain(v) {
      if (!ctx || !ctx.createGain) { return null; }
      var g;
      try { g = ctx.createGain(); } catch (e) { return null; }
      if (g) { setV(P(g, 'gain'), v === undefined ? 1 : v, T()); }
      return g;
    }
    function osc(type, freq) {
      if (!ctx || !ctx.createOscillator) { return null; }
      var o;
      try { o = ctx.createOscillator(); } catch (e) { return null; }
      if (!o) { return null; }
      try { o.type = type || 'sine'; } catch (e2) { }
      setV(P(o, 'frequency'), freq || 440, T());
      return o;
    }
    function filt(type, freq, q) {
      if (!ctx || !ctx.createBiquadFilter) { return null; }
      var f;
      try { f = ctx.createBiquadFilter(); } catch (e) { return null; }
      if (!f) { return null; }
      try { f.type = type || 'lowpass'; } catch (e2) { }
      setV(P(f, 'frequency'), freq || 1000, T());
      setV(P(f, 'Q'), q === undefined ? 1 : q, T());
      return f;
    }
    function delayN(t) {
      if (!ctx || !ctx.createDelay) { return null; }
      var d;
      try { d = ctx.createDelay(2.0); } catch (e) { return null; }
      if (d) { setV(P(d, 'delayTime'), t || 0.1, T()); }
      return d;
    }
    function shaper(amount) {
      if (!ctx || !ctx.createWaveShaper) { return null; }
      var w;
      try { w = ctx.createWaveShaper(); } catch (e) { return null; }
      if (!w) { return null; }
      var n = 1024, c = new Float32Array(n), k = amount || 12, i, x;
      for (i = 0; i < n; i++) {
        x = i * 2 / n - 1;
        c[i] = (1 + k) * x / (1 + k * Math.abs(x));
      }
      try { w.curve = c; w.oversample = '2x'; } catch (e2) { }
      return w;
    }
    function srcOf(buf) {
      if (!ctx || !ctx.createBufferSource) { return null; }
      var s;
      try { s = ctx.createBufferSource(); } catch (e) { return null; }
      if (!s) { return null; }
      try { s.buffer = buf; } catch (e2) { }
      return s;
    }
    function startStop(node, t, stopAt) {
      if (!node) { return; }
      try { if (node.start) { node.start(t); } } catch (e) { }
      if (stopAt !== undefined && stopAt !== null) {
        try { if (node.stop) { node.stop(stopAt); } } catch (e2) { }
      }
    }

    /* --------------------------------------------------- noise buffers -- */
    function makeNoise(kind, seconds) {
      if (!ctx || !ctx.createBuffer) { return null; }
      var sr = ctx.sampleRate || 44100;
      var len = Math.max(1, Math.floor(sr * (seconds || 2)));
      var b;
      try { b = ctx.createBuffer(1, len, sr); } catch (e) { return null; }
      if (!b || !b.getChannelData) { return b; }
      var d;
      try { d = b.getChannelData(0); } catch (e2) { return b; }
      if (!d) { return b; }
      var i, w;
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (i = 0; i < len; i++) {
        w = Math.random() * 2 - 1;
        if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else {
          d[i] = w;
        }
      }
      return b;
    }

    function makeIR(seconds, decay, bright) {
      if (!ctx || !ctx.createBuffer) { return null; }
      var sr = ctx.sampleRate || 44100;
      var len = Math.max(1, Math.floor(sr * (seconds || 1.8)));
      var b;
      try { b = ctx.createBuffer(2, len, sr); } catch (e) { return null; }
      if (!b || !b.getChannelData) { return b; }
      var ch, d, i, t, env, lp, a;
      a = clamp(bright === undefined ? 0.32 : bright, 0.02, 0.95);
      for (ch = 0; ch < 2; ch++) {
        try { d = b.getChannelData(ch); } catch (e2) { continue; }
        if (!d) { continue; }
        lp = 0;
        for (i = 0; i < len; i++) {
          t = i / len;
          env = Math.pow(1 - t, decay || 3.2);
          /* early reflection comb + exponentially decaying filtered noise */
          lp += a * ((Math.random() * 2 - 1) - lp);
          d[i] = lp * env * (1 + 0.6 * Math.exp(-t * 40) * Math.sin(t * 900 + ch));
        }
      }
      return b;
    }

    /* --------------------------------------------------------- graph ---- */
    function buildGraph() {
      master = gain(1);
      comp = null;
      if (ctx && ctx.createDynamicsCompressor) {
        try { comp = ctx.createDynamicsCompressor(); } catch (e) { comp = null; }
      }
      if (comp) {
        setV(P(comp, 'threshold'), -14, T());
        setV(P(comp, 'knee'), 22, T());
        setV(P(comp, 'ratio'), 5, T());
        setV(P(comp, 'attack'), 0.004, T());
        setV(P(comp, 'release'), 0.22, T());
      }
      busSfx = gain(1); busMusic = gain(1); busVoice = gain(1); busAmb = gain(1);
      dry = gain(1);
      verbSend = gain(0.24);
      conn(busSfx, dry); conn(busAmb, dry); conn(busVoice, dry); conn(busMusic, dry);
      conn(busSfx, verbSend); conn(busAmb, verbSend);
      if (!lowQ && ctx && ctx.createConvolver) {
        try { verb = ctx.createConvolver(); } catch (e2) { verb = null; }
        if (verb) {
          irBuf = makeIR(1.9, 3.4, 0.3);
          try { if (irBuf) { verb.buffer = irBuf; } } catch (e3) { }
          conn(verbSend, verb);
          conn(verb, comp || master);
        }
      }
      conn(dry, comp || master);
      if (comp) { conn(comp, master); }
      conn(master, ctx ? ctx.destination : null);
      applyVolumes();
    }

    function applyVolumes() {
      var t = T();
      setV(P(master, 'gain'), clamp(S_.volMaster, 0, 1), t);
      setV(P(busMusic, 'gain'), clamp(S_.volMusic, 0, 1) * 0.55, t);
      setV(P(busSfx, 'gain'), clamp(S_.volSfx, 0, 1) * 0.9, t);
      setV(P(busAmb, 'gain'), clamp(S_.volSfx, 0, 1) * 0.7, t);
      setV(P(busVoice, 'gain'), clamp(S_.volVoice, 0, 1) * 1.0, t);
    }

    /* --------------------------------------------------- spatial dest -- */
    function makeDest(opts) {
      /* Returns {input, cleanup} routing to the right bus, with optional
         3D panner + occlusion lowpass. Never throws. */
      var bus = busSfx;
      if (opts && opts.bus === 'music') { bus = busMusic; }
      else if (opts && opts.bus === 'voice') { bus = busVoice; }
      else if (opts && opts.bus === 'amb') { bus = busAmb; }
      if (!bus) { return null; }
      var head = null, tail = null;
      var occ = (opts && opts.occlusion) || 0;
      if (occ > 0.01) {
        var f = filt('lowpass', lerp(18000, 380, clamp(occ, 0, 1)), 0.8);
        if (f) {
          var og = gain(lerp(1, 0.45, clamp(occ, 0, 1)));
          conn(f, og || bus);
          if (og) { head = f; tail = og; } else { head = f; tail = f; }
        }
      }
      var pan = null;
      if (opts && opts.pos && !lowQ && ctx && ctx.createPanner) {
        try { pan = ctx.createPanner(); } catch (e) { pan = null; }
        if (pan) {
          try {
            pan.panningModel = 'equalpower';
            pan.distanceModel = 'inverse';
            pan.refDistance = opts.ref || 2.2;
            pan.maxDistance = opts.max || 90;
            pan.rolloffFactor = opts.rolloff || 1.1;
          } catch (e2) { }
          var px = opts.pos[0] || 0, py = opts.pos[1] || 0, pz = opts.pos[2] || 0;
          if (pan.positionX && pan.positionX.setValueAtTime) {
            setV(pan.positionX, px, T()); setV(pan.positionY, py, T()); setV(pan.positionZ, pz, T());
          } else if (pan.setPosition) {
            try { pan.setPosition(px, py, pz); } catch (e3) { }
          }
        }
      } else if (opts && opts.pan !== undefined && ctx && ctx.createStereoPanner) {
        try {
          pan = ctx.createStereoPanner();
          setV(P(pan, 'pan'), clamp(opts.pan, -1, 1), T());
        } catch (e4) { pan = null; }
      }
      var out = bus;
      if (pan) { conn(pan, bus); out = pan; }
      if (tail) { conn(tail, out); return head; }
      return out;
    }

    function trackVoice(node, dur) {
      voices++;
      if (node) {
        node.onended = function () {
          voices = Math.max(0, voices - 1);
          disc(node);
        };
      }
      /* Fallback decrement in case onended never fires (mock envs). */
      if (!node || !('onended' in node)) { voices = Math.max(0, voices - 1); }
      return dur;
    }

    function budgetOK(priority) {
      if (voices < VOICE_CAP) { return true; }
      return !!priority;
    }

    /* =================================================================== */
    /* == SYNTHESIS PRIMITIVES                                          == */
    /* =================================================================== */

    /* A short noise burst through a filter with a percussive envelope. */
    function burst(dest, o) {
      o = o || {};
      var t = (o.t || T()) + (o.delay || 0);
      var buf = o.noise === 'pink' ? noiseP : (o.noise === 'brown' ? noiseB : noiseW);
      var s = srcOf(buf);
      if (!s) { return; }
      var dur = o.dur || 0.12;
      setV(P(s, 'playbackRate'), o.rate || 1, t);
      var f = filt(o.type || 'bandpass', o.freq || 1200, o.q === undefined ? 1.2 : o.q);
      var g = gain(0);
      if (!g) { return; }
      setV(P(g, 'gain'), 0, t);
      lin(P(g, 'gain'), (o.vol === undefined ? 0.5 : o.vol), t + (o.atk || 0.002));
      if (o.f1 !== undefined && f) { expo(P(f, 'frequency'), o.f1, t + dur); }
      expo(P(g, 'gain'), 0.0005, t + dur);
      if (f) { conn(s, f); conn(f, g); } else { conn(s, g); }
      conn(g, dest);
      var off = Math.random() * 1.5;
      try { s.loopStart = 0; } catch (e) { }
      startStop(s, t, t + dur + 0.02);
      trackVoice(s, dur);
      if (o.offset) { /* offset handled by start(t, offset) when supported */
        try { if (s.start) { /* already started */ } } catch (e2) { }
      }
      void off;
    }

    /* A tonal voice with ADSR + optional pitch sweep + optional distortion. */
    function tone(dest, o) {
      o = o || {};
      var t = (o.t || T()) + (o.delay || 0);
      var oo = osc(o.wave || 'sine', o.f0 || 220);
      if (!oo) { return; }
      var dur = o.dur || 0.3;
      var g = gain(0);
      if (!g) { return; }
      var pk = o.vol === undefined ? 0.4 : o.vol;
      var a = o.atk === undefined ? 0.005 : o.atk;
      var d = o.dec === undefined ? dur * 0.5 : o.dec;
      var su = o.sus === undefined ? 0.0 : o.sus;
      setV(P(g, 'gain'), 0, t);
      lin(P(g, 'gain'), pk, t + a);
      expo(P(g, 'gain'), Math.max(0.0006, pk * su), t + a + d);
      expo(P(g, 'gain'), 0.0005, t + dur);
      if (o.f1 !== undefined) { expo(P(oo, 'frequency'), Math.max(1, o.f1), t + (o.sweep || dur)); }
      if (o.detune) { setV(P(oo, 'detune'), o.detune, t); }
      var node = oo;
      if (o.dist) {
        var w = shaper(o.dist);
        if (w) { conn(node, w); node = w; }
      }
      if (o.lp) {
        var lf = filt('lowpass', o.lp, o.lpq || 0.9);
        if (lf) {
          if (o.lp1 !== undefined) { expo(P(lf, 'frequency'), o.lp1, t + dur); }
          conn(node, lf); node = lf;
        }
      }
      if (o.hp) {
        var hf = filt('highpass', o.hp, 0.8);
        if (hf) { conn(node, hf); node = hf; }
      }
      conn(node, g); conn(g, dest);
      startStop(oo, t, t + dur + 0.03);
      trackVoice(oo, dur);
    }

    /* Formant filter chain (used for growls, shouts, radio voice). */
    function formant(dest, o) {
      o = o || {};
      var t = (o.t || T()) + (o.delay || 0);
      var dur = o.dur || 0.6;
      var base = o.f0 || 96;
      var src = osc(o.wave || 'sawtooth', base);
      if (!src) { return; }
      if (o.f1 !== undefined) { expo(P(src, 'frequency'), o.f1, t + dur); }
      var vib = osc('sine', o.vibHz || 5.5);
      var vibg = gain(o.vibDepth === undefined ? 6 : o.vibDepth);
      if (vib && vibg) { conn(vib, vibg); conn(vibg, P(src, 'detune')); startStop(vib, t, t + dur + 0.02); }
      var g = gain(0);
      if (!g) { return; }
      var pk = o.vol === undefined ? 0.32 : o.vol;
      setV(P(g, 'gain'), 0, t);
      lin(P(g, 'gain'), pk, t + (o.atk || 0.05));
      lin(P(g, 'gain'), pk * 0.8, t + dur * 0.6);
      expo(P(g, 'gain'), 0.0006, t + dur);
      var fs = o.formants || [520, 1180, 2500];
      var qs = o.qs || [7, 9, 11];
      var amps = o.amps || [1, 0.55, 0.28];
      var i, bp, bg, sum = gain(1);
      if (!sum) { return; }
      for (i = 0; i < fs.length; i++) {
        bp = filt('bandpass', fs[i], qs[i] || 8);
        bg = gain(amps[i] === undefined ? 0.4 : amps[i]);
        if (bp && bg) { conn(src, bp); conn(bp, bg); conn(bg, sum); }
      }
      /* breath layer */
      var nz = srcOf(noiseW);
      if (nz) {
        var nf = filt('bandpass', o.breathHz || 1500, 1.1);
        var ng = gain(o.breath === undefined ? 0.10 : o.breath);
        if (nf && ng) { conn(nz, nf); conn(nf, ng); conn(ng, sum); }
        startStop(nz, t, t + dur + 0.02);
      }
      var node = sum;
      if (o.dist) { var ws = shaper(o.dist); if (ws) { conn(node, ws); node = ws; } }
      conn(node, g); conn(g, dest);
      startStop(src, t, t + dur + 0.03);
      trackVoice(src, dur);
    }

    /* Radio band-limit + squelch grit, wraps any generator. */
    function radioChain(dest) {
      var hp = filt('highpass', 420, 0.9);
      var lp = filt('lowpass', 2900, 0.9);
      var ws = shaper(8);
      var g = gain(0.9);
      if (!hp || !lp || !g) { return dest; }
      conn(hp, lp);
      if (ws) { conn(lp, ws); conn(ws, g); } else { conn(lp, g); }
      conn(g, dest);
      return hp;
    }

    /* =================================================================== */
    /* == SFX REGISTRY                                                  == */
    /* =================================================================== */

    var SFX = {};

    /* ---- gunfire: layered transient click + body + tail ---------------- */
    function gunshot(dest, cfg, t) {
      /* transient */
      burst(dest, { t: t, dur: 0.02, freq: cfg.click, q: 0.9, type: 'highpass', vol: cfg.vol * 0.9 });
      /* body */
      tone(dest, {
        t: t, wave: 'square', f0: cfg.body, f1: cfg.body * 0.22, sweep: 0.06,
        dur: cfg.bodyDur, vol: cfg.vol * 0.95, atk: 0.001, dec: cfg.bodyDur * 0.5,
        dist: cfg.dist || 20, lp: cfg.lp || 4200, lp1: 500
      });
      /* punch noise */
      burst(dest, {
        t: t, dur: cfg.punch, freq: cfg.punchHz, f1: cfg.punchHz * 0.2, q: 0.7,
        type: 'bandpass', vol: cfg.vol * 1.0, noise: 'white'
      });
      /* tail / room slap */
      burst(dest, {
        t: t, delay: 0.012, dur: cfg.tail, freq: cfg.tailHz, f1: 180, q: 0.5,
        type: 'lowpass', vol: cfg.vol * cfg.tailVol, noise: 'pink'
      });
      /* mechanical action */
      burst(dest, { t: t, delay: 0.035, dur: 0.05, freq: 3400, q: 2.5, type: 'bandpass', vol: cfg.vol * 0.16 });
    }

    SFX.shot_pistol = function (d, o, t) {
      gunshot(d, { click: 5200, body: 210, bodyDur: 0.10, punch: 0.07, punchHz: 1500,
        tail: 0.30, tailHz: 900, tailVol: 0.35, vol: 0.55 * (o.vol || 1), dist: 22 }, t);
      return 0.4;
    };
    SFX.shot_magnum = function (d, o, t) {
      gunshot(d, { click: 4200, body: 130, bodyDur: 0.18, punch: 0.12, punchHz: 900,
        tail: 0.70, tailHz: 520, tailVol: 0.62, vol: 0.9 * (o.vol || 1), dist: 34, lp: 3200 }, t);
      tone(d, { t: t, wave: 'sine', f0: 62, f1: 30, dur: 0.35, vol: 0.5 * (o.vol || 1), atk: 0.002 });
      return 0.8;
    };
    SFX.shot_shotgun = function (d, o, t) {
      gunshot(d, { click: 3600, body: 150, bodyDur: 0.16, punch: 0.16, punchHz: 700,
        tail: 0.62, tailHz: 430, tailVol: 0.7, vol: 0.85 * (o.vol || 1), dist: 26, lp: 2600 }, t);
      burst(d, { t: t, dur: 0.20, freq: 2600, f1: 400, q: 0.6, type: 'bandpass',
        vol: 0.4 * (o.vol || 1), noise: 'white' });
      return 0.7;
    };
    SFX.shot_smg = function (d, o, t) {
      gunshot(d, { click: 6200, body: 260, bodyDur: 0.07, punch: 0.05, punchHz: 1900,
        tail: 0.18, tailHz: 1100, tailVol: 0.25, vol: 0.42 * (o.vol || 1), dist: 18 }, t);
      return 0.25;
    };
    SFX.shot_rifle = function (d, o, t) {
      gunshot(d, { click: 7400, body: 180, bodyDur: 0.11, punch: 0.09, punchHz: 2400,
        tail: 0.85, tailHz: 700, tailVol: 0.5, vol: 0.7 * (o.vol || 1), dist: 28, lp: 5200 }, t);
      /* supersonic crack */
      burst(d, { t: t, delay: 0.004, dur: 0.03, freq: 9000, q: 0.8, type: 'highpass',
        vol: 0.5 * (o.vol || 1) });
      return 0.9;
    };
    SFX.dryfire = function (d, o, t) {
      burst(d, { t: t, dur: 0.035, freq: 2800, q: 3.5, type: 'bandpass', vol: 0.35 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.02, dur: 0.03, freq: 5200, q: 5, type: 'bandpass', vol: 0.16 * (o.vol || 1) });
      return 0.1;
    };
    SFX.mag_out = function (d, o, t) {
      burst(d, { t: t, dur: 0.06, freq: 1800, q: 2.2, type: 'bandpass', vol: 0.3 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.09, dur: 0.10, freq: 900, f1: 300, q: 1.4, type: 'bandpass', vol: 0.26 * (o.vol || 1) });
      return 0.25;
    };
    SFX.mag_in = function (d, o, t) {
      burst(d, { t: t, dur: 0.05, freq: 1200, q: 1.6, type: 'bandpass', vol: 0.28 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.05, dur: 0.05, freq: 2600, q: 3.2, type: 'bandpass', vol: 0.34 * (o.vol || 1) });
      tone(d, { t: t, delay: 0.05, wave: 'square', f0: 180, f1: 90, dur: 0.06, vol: 0.16 * (o.vol || 1) });
      return 0.2;
    };
    SFX.slide_rack = function (d, o, t) {
      burst(d, { t: t, dur: 0.07, freq: 2200, f1: 1400, q: 1.4, type: 'bandpass', vol: 0.30 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.08, dur: 0.05, freq: 3400, q: 3.0, type: 'bandpass', vol: 0.34 * (o.vol || 1) });
      return 0.2;
    };
    SFX.pump = function (d, o, t) {
      burst(d, { t: t, dur: 0.09, freq: 1500, f1: 800, q: 1.1, type: 'bandpass', vol: 0.34 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.13, dur: 0.07, freq: 2400, f1: 1500, q: 1.6, type: 'bandpass', vol: 0.36 * (o.vol || 1) });
      return 0.3;
    };
    SFX.knife = function (d, o, t) {
      burst(d, { t: t, dur: 0.13, freq: 5200, f1: 900, q: 0.6, type: 'bandpass', vol: 0.30 * (o.vol || 1) });
      tone(d, { t: t, wave: 'sine', f0: 2400, f1: 600, dur: 0.10, vol: 0.10 * (o.vol || 1) });
      return 0.2;
    };
    SFX.flesh = function (d, o, t) {
      burst(d, { t: t, dur: 0.11, freq: 340, f1: 120, q: 0.8, type: 'lowpass', vol: 0.42 * (o.vol || 1), noise: 'brown' });
      burst(d, { t: t, delay: 0.01, dur: 0.06, freq: 1600, q: 1.0, type: 'bandpass', vol: 0.16 * (o.vol || 1) });
      return 0.2;
    };
    SFX.bone = function (d, o, t) {
      burst(d, { t: t, dur: 0.04, freq: 2600, q: 4.5, type: 'bandpass', vol: 0.38 * (o.vol || 1) });
      tone(d, { t: t, wave: 'triangle', f0: 320, f1: 90, dur: 0.09, vol: 0.24 * (o.vol || 1), dist: 30 });
      return 0.15;
    };
    SFX.headshot = function (d, o, t) {
      burst(d, { t: t, dur: 0.09, freq: 700, f1: 140, q: 0.5, type: 'lowpass', vol: 0.6 * (o.vol || 1), noise: 'brown' });
      tone(d, { t: t, wave: 'sine', f0: 180, f1: 40, dur: 0.20, vol: 0.4 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.02, dur: 0.25, freq: 900, f1: 200, q: 0.7, type: 'bandpass',
        vol: 0.22 * (o.vol || 1), noise: 'pink' });
      return 0.4;
    };
    SFX.parasite_burst = function (d, o, t) {
      tone(d, { t: t, wave: 'sawtooth', f0: 90, f1: 700, sweep: 0.16, dur: 0.36,
        vol: 0.34 * (o.vol || 1), dist: 40, lp: 3000, lp1: 700 });
      burst(d, { t: t, dur: 0.32, freq: 1400, f1: 300, q: 0.6, type: 'bandpass',
        vol: 0.36 * (o.vol || 1), noise: 'pink' });
      formant(d, { t: t, delay: 0.04, f0: 220, f1: 640, dur: 0.5, vol: 0.22 * (o.vol || 1),
        formants: [420, 1600, 3100], qs: [5, 6, 7], dist: 18 });
      return 0.7;
    };

    /* ---- footsteps ---------------------------------------------------- */
    var STEP_CFG = {
      concrete: { f: 900, q: 1.0, dur: 0.075, vol: 0.22, sub: 120, noise: 'white' },
      metal: { f: 2400, q: 3.0, dur: 0.16, vol: 0.24, sub: 240, noise: 'white', ring: 1 },
      gravel: { f: 3200, q: 0.5, dur: 0.13, vol: 0.20, sub: 90, noise: 'pink', crunch: 1 },
      water: { f: 1500, q: 0.4, dur: 0.22, vol: 0.24, sub: 70, noise: 'pink', splash: 1 },
      wood: { f: 620, q: 1.6, dur: 0.11, vol: 0.22, sub: 150, noise: 'pink', ring: 0.4 },
      dirt: { f: 700, q: 0.6, dur: 0.10, vol: 0.17, sub: 80, noise: 'brown' },
      grate: { f: 3000, q: 4.0, dur: 0.20, vol: 0.22, sub: 260, noise: 'white', ring: 1.4 }
    };
    function footstep(d, o, t, surf) {
      var c = STEP_CFG[surf] || STEP_CFG.concrete;
      var r = 0.85 + Math.random() * 0.3;
      var v = (o.vol === undefined ? 1 : o.vol) * (o.sprint ? 1.35 : (o.crouch ? 0.45 : 1));
      burst(d, { t: t, dur: c.dur * r, freq: c.f * r, f1: c.f * 0.35, q: c.q,
        type: 'bandpass', vol: c.vol * v, noise: c.noise, rate: r });
      tone(d, { t: t, wave: 'sine', f0: c.sub * r, f1: c.sub * 0.5, dur: 0.07, vol: 0.16 * v });
      if (c.ring) {
        tone(d, { t: t, delay: 0.006, wave: 'triangle', f0: 1800 * r, f1: 1500 * r,
          dur: 0.24 * c.ring, vol: 0.07 * v * c.ring, hp: 900 });
      }
      if (c.crunch) {
        burst(d, { t: t, delay: 0.02, dur: 0.09, freq: 5200 * r, q: 0.4, type: 'highpass', vol: 0.10 * v });
      }
      if (c.splash) {
        burst(d, { t: t, delay: 0.005, dur: 0.30, freq: 2600, f1: 600, q: 0.35,
          type: 'bandpass', vol: 0.18 * v, noise: 'white' });
      }
      return 0.3;
    }
    SFX.step_concrete = function (d, o, t) { return footstep(d, o, t, 'concrete'); };
    SFX.step_metal = function (d, o, t) { return footstep(d, o, t, 'metal'); };
    SFX.step_gravel = function (d, o, t) { return footstep(d, o, t, 'gravel'); };
    SFX.step_water = function (d, o, t) { return footstep(d, o, t, 'water'); };
    SFX.step_wood = function (d, o, t) { return footstep(d, o, t, 'wood'); };
    SFX.step_dirt = function (d, o, t) { return footstep(d, o, t, 'dirt'); };
    SFX.step_grate = function (d, o, t) { return footstep(d, o, t, 'grate'); };
    SFX.step = function (d, o, t) { return footstep(d, o, t, (o && o.surface) || 'concrete'); };

    SFX.cloth = function (d, o, t) {
      burst(d, { t: t, dur: 0.16, freq: 3800, f1: 1800, q: 0.5, type: 'bandpass',
        vol: 0.10 * (o.vol || 1), noise: 'pink', rate: 0.8 + Math.random() * 0.4 });
      return 0.2;
    };

    /* ---- world / props ------------------------------------------------ */
    SFX.door_open = function (d, o, t) {
      tone(d, { t: t, wave: 'sawtooth', f0: 70, f1: 42, sweep: 0.9, dur: 1.0,
        vol: 0.14 * (o.vol || 1), lp: 700, lp1: 260, dist: 6 });
      burst(d, { t: t, dur: 0.9, freq: 620, f1: 260, q: 4.0, type: 'bandpass',
        vol: 0.12 * (o.vol || 1), noise: 'pink' });
      burst(d, { t: t, delay: 0.85, dur: 0.09, freq: 1400, q: 2, type: 'bandpass', vol: 0.2 * (o.vol || 1) });
      return 1.1;
    };
    SFX.door_close = function (d, o, t) {
      burst(d, { t: t, dur: 0.14, freq: 420, f1: 120, q: 0.9, type: 'lowpass', vol: 0.4 * (o.vol || 1), noise: 'brown' });
      tone(d, { t: t, wave: 'sine', f0: 90, f1: 45, dur: 0.22, vol: 0.28 * (o.vol || 1) });
      return 0.3;
    };
    SFX.door_locked = function (d, o, t) {
      burst(d, { t: t, dur: 0.05, freq: 1100, q: 3, type: 'bandpass', vol: 0.3 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.11, dur: 0.05, freq: 1100, q: 3, type: 'bandpass', vol: 0.26 * (o.vol || 1) });
      return 0.2;
    };
    SFX.valve = function (d, o, t) {
      var i;
      for (i = 0; i < 7; i++) {
        burst(d, { t: t, delay: i * 0.11, dur: 0.07, freq: 900 + i * 60, q: 5,
          type: 'bandpass', vol: 0.16 * (o.vol || 1) });
      }
      tone(d, { t: t, wave: 'sawtooth', f0: 120, f1: 90, dur: 0.8, vol: 0.06 * (o.vol || 1), lp: 500 });
      return 0.9;
    };
    SFX.wood_break = function (d, o, t) {
      var i, n = 6;
      for (i = 0; i < n; i++) {
        burst(d, { t: t, delay: Math.random() * 0.16, dur: 0.06, freq: 500 + Math.random() * 2200,
          q: 2.5, type: 'bandpass', vol: 0.22 * (o.vol || 1), noise: 'pink' });
      }
      tone(d, { t: t, wave: 'triangle', f0: 180, f1: 60, dur: 0.28, vol: 0.26 * (o.vol || 1), dist: 14 });
      return 0.4;
    };
    SFX.glass_break = function (d, o, t) {
      var i;
      burst(d, { t: t, dur: 0.05, freq: 6000, q: 0.5, type: 'highpass', vol: 0.4 * (o.vol || 1) });
      for (i = 0; i < 10; i++) {
        tone(d, { t: t, delay: Math.random() * 0.5, wave: 'triangle',
          f0: 2400 + Math.random() * 4200, f1: 1800, dur: 0.10 + Math.random() * 0.2,
          vol: 0.07 * (o.vol || 1) });
      }
      return 0.7;
    };
    SFX.explosion = function (d, o, t) {
      tone(d, { t: t, wave: 'sine', f0: 90, f1: 24, sweep: 0.5, dur: 1.4, vol: 0.85 * (o.vol || 1), dist: 12 });
      burst(d, { t: t, dur: 0.28, freq: 1800, f1: 200, q: 0.4, type: 'lowpass', vol: 0.8 * (o.vol || 1) });
      burst(d, { t: t, delay: 0.05, dur: 1.6, freq: 700, f1: 120, q: 0.3, type: 'lowpass',
        vol: 0.42 * (o.vol || 1), noise: 'brown' });
      burst(d, { t: t, delay: 0.02, dur: 0.6, freq: 4000, f1: 500, q: 0.4, type: 'bandpass',
        vol: 0.24 * (o.vol || 1), noise: 'pink' });
      return 1.8;
    };
    SFX.fire = function (d, o, t) {
      burst(d, { t: t, dur: (o.dur || 1.4), freq: 900, f1: 500, q: 0.5, type: 'bandpass',
        vol: 0.14 * (o.vol || 1), noise: 'pink' });
      var i;
      for (i = 0; i < 5; i++) {
        burst(d, { t: t, delay: Math.random() * (o.dur || 1.4), dur: 0.05,
          freq: 2400 + Math.random() * 3000, q: 2, type: 'bandpass', vol: 0.07 * (o.vol || 1) });
      }
      return (o.dur || 1.4);
    };
    SFX.electric = function (d, o, t) {
      var i, n = 9;
      for (i = 0; i < n; i++) {
        burst(d, { t: t, delay: Math.random() * 0.4, dur: 0.02 + Math.random() * 0.05,
          freq: 1800 + Math.random() * 6000, q: 1.5, type: 'bandpass', vol: 0.20 * (o.vol || 1) });
      }
      tone(d, { t: t, wave: 'sawtooth', f0: 120, dur: 0.4, vol: 0.06 * (o.vol || 1), dist: 40, lp: 2400 });
      return 0.5;
    };
    SFX.spark = function (d, o, t) {
      burst(d, { t: t, dur: 0.05, freq: 7000, q: 0.7, type: 'highpass', vol: 0.18 * (o.vol || 1) });
      return 0.1;
    };
    SFX.thunder = function (d, o, t) {
      /* real rumble: layered brown noise swells + slow sub sweep + late claps */
      var far = o.far ? 1 : 0;
      tone(d, { t: t, wave: 'sine', f0: far ? 42 : 60, f1: 18, sweep: 2.2, dur: far ? 4.0 : 3.0,
        vol: (far ? 0.35 : 0.7) * (o.vol || 1), dist: 6 });
      burst(d, { t: t, dur: far ? 4.5 : 3.2, freq: far ? 220 : 520, f1: 70, q: 0.35,
        type: 'lowpass', vol: (far ? 0.30 : 0.62) * (o.vol || 1), noise: 'brown' });
      if (!far) {
        burst(d, { t: t, dur: 0.16, freq: 3200, f1: 700, q: 0.5, type: 'bandpass',
          vol: 0.4 * (o.vol || 1), noise: 'white' });
      }
      var i, n = far ? 2 : 4;
      for (i = 0; i < n; i++) {
        burst(d, { t: t, delay: 0.5 + Math.random() * 2.0, dur: 0.9 + Math.random(),
          freq: 300 + Math.random() * 400, f1: 60, q: 0.3, type: 'lowpass',
          vol: (far ? 0.14 : 0.28) * (o.vol || 1), noise: 'brown' });
      }
      return far ? 5.0 : 4.2;
    };
    SFX.alarm = function (d, o, t) {
      var i, n = o.count || 3;
      for (i = 0; i < n; i++) {
        tone(d, { t: t, delay: i * 0.85, wave: 'sawtooth', f0: 520, f1: 760, sweep: 0.35,
          dur: 0.42, vol: 0.20 * (o.vol || 1), dist: 8, lp: 2600 });
        tone(d, { t: t, delay: i * 0.85 + 0.42, wave: 'sawtooth', f0: 760, f1: 520, sweep: 0.35,
          dur: 0.40, vol: 0.18 * (o.vol || 1), dist: 8, lp: 2600 });
      }
      return n * 0.85;
    };
    SFX.radio_squelch = function (d, o, t) {
      var rd = radioChain(d);
      burst(rd, { t: t, dur: 0.07, freq: 2200, q: 0.6, type: 'bandpass', vol: 0.24 * (o.vol || 1) });
      burst(rd, { t: t, delay: 0.06, dur: 0.05, freq: 1400, q: 2, type: 'bandpass', vol: 0.12 * (o.vol || 1) });
      return 0.2;
    };
    SFX.radio_static = function (d, o, t) {
      var rd = radioChain(d);
      burst(rd, { t: t, dur: o.dur || 0.9, freq: 1600, q: 0.4, type: 'bandpass',
        vol: 0.13 * (o.vol || 1), noise: 'white' });
      return o.dur || 0.9;
    };
    SFX.radio_voice = function (d, o, t) {
      var rd = radioChain(d);
      var i, n = o.syll || (3 + ((Math.random() * 4) | 0));
      var base = o.f0 || (o.female ? 175 : 108);
      for (i = 0; i < n; i++) {
        formant(rd, {
          t: t, delay: i * 0.155, dur: 0.13 + Math.random() * 0.08,
          f0: base * (0.9 + Math.random() * 0.25), f1: base * (0.85 + Math.random() * 0.3),
          vol: 0.28 * (o.vol || 1),
          formants: o.female ? [640, 1900, 2900] : [480, 1300, 2450],
          qs: [8, 9, 10], amps: [1, 0.5, 0.22], breath: 0.06, dist: 6
        });
      }
      return n * 0.155 + 0.2;
    };
    SFX.geiger = function (d, o, t) {
      var i, n = o.count || 1;
      for (i = 0; i < n; i++) {
        burst(d, { t: t, delay: Math.random() * (o.spread || 0.1), dur: 0.012,
          freq: 5200 + Math.random() * 2600, q: 6, type: 'bandpass', vol: 0.14 * (o.vol || 1) });
      }
      return 0.15;
    };
    SFX.growl = function (d, o, t) {
      formant(d, {
        t: t, dur: o.dur || 0.9, f0: 62 * (o.pitch || 1), f1: 48 * (o.pitch || 1),
        vol: 0.30 * (o.vol || 1), formants: [340, 900, 1900], qs: [6, 7, 8],
        amps: [1, 0.6, 0.25], vibHz: 6.5, vibDepth: 22, breath: 0.14, dist: 16
      });
      return (o.dur || 0.9) + 0.1;
    };
    SFX.shout = function (d, o, t) {
      formant(d, {
        t: t, dur: o.dur || 0.7, f0: 150 * (o.pitch || 1), f1: 190 * (o.pitch || 1),
        vol: 0.34 * (o.vol || 1), formants: [720, 1250, 2600], qs: [7, 8, 9],
        amps: [1, 0.7, 0.35], vibHz: 5, vibDepth: 14, breath: 0.10, dist: 22, atk: 0.02
      });
      return (o.dur || 0.7) + 0.1;
    };
    SFX.scream = function (d, o, t) {
      formant(d, {
        t: t, dur: o.dur || 1.3, f0: 300 * (o.pitch || 1), f1: 420 * (o.pitch || 1),
        vol: 0.38 * (o.vol || 1), formants: [900, 1700, 3200], qs: [9, 10, 11],
        amps: [1, 0.8, 0.5], vibHz: 7.5, vibDepth: 40, breath: 0.16, dist: 26, atk: 0.03
      });
      return (o.dur || 1.3) + 0.2;
    };
    SFX.chant = function (d, o, t) {
      var i;
      for (i = 0; i < 3; i++) {
        formant(d, { t: t, delay: i * 0.02, dur: o.dur || 2.2, f0: 84 * (1 + i * 0.005),
          f1: 84, vol: 0.10 * (o.vol || 1), formants: [400, 800, 1500], qs: [8, 9, 10],
          vibHz: 4, vibDepth: 8, breath: 0.05 });
      }
      return (o.dur || 2.2);
    };
    SFX.breath = function (d, o, t) {
      var fear = clamp(o.fear === undefined ? 0 : o.fear, 0, 1);
      var dur = lerp(0.55, 0.26, fear);
      burst(d, { t: t, dur: dur, freq: lerp(900, 1500, fear), f1: lerp(500, 1100, fear),
        q: 0.9, type: 'bandpass', vol: lerp(0.05, 0.16, fear) * (o.vol || 1), noise: 'pink' });
      if (fear > 0.45) {
        formant(d, { t: t, delay: dur * 0.55, dur: 0.16, f0: 210, f1: 190,
          vol: 0.06 * fear * (o.vol || 1), formants: [700, 1500, 2600], qs: [6, 7, 8], breath: 0.3 });
      }
      return dur + 0.1;
    };
    SFX.heartbeat = function (d, o, t) {
      var v = (o.vol === undefined ? 1 : o.vol);
      tone(d, { t: t, wave: 'sine', f0: 64, f1: 34, sweep: 0.10, dur: 0.16, vol: 0.55 * v, atk: 0.004 });
      tone(d, { t: t, delay: 0.19, wave: 'sine', f0: 56, f1: 30, sweep: 0.10, dur: 0.20, vol: 0.38 * v, atk: 0.005 });
      return 0.45;
    };
    SFX.tinnitus = function (d, o, t) {
      tone(d, { t: t, wave: 'sine', f0: 4400, dur: o.dur || 3.2, vol: 0.07 * (o.vol || 1),
        atk: 0.02, dec: 0.4, sus: 0.7 });
      tone(d, { t: t, wave: 'sine', f0: 6200, dur: (o.dur || 3.2) * 0.8, vol: 0.035 * (o.vol || 1),
        atk: 0.02, dec: 0.4, sus: 0.6 });
      return o.dur || 3.2;
    };
    SFX.pickup = function (d, o, t) {
      tone(d, { t: t, wave: 'triangle', f0: 660, f1: 990, sweep: 0.08, dur: 0.16, vol: 0.16 * (o.vol || 1) });
      burst(d, { t: t, dur: 0.05, freq: 3200, q: 2, type: 'bandpass', vol: 0.10 * (o.vol || 1) });
      return 0.25;
    };
    SFX.ui_move = function (d, o, t) {
      tone(d, { t: t, wave: 'square', f0: 880, dur: 0.035, vol: 0.05 * (o.vol || 1), lp: 3000 });
      return 0.06;
    };
    SFX.ui_select = function (d, o, t) {
      tone(d, { t: t, wave: 'square', f0: 520, f1: 780, sweep: 0.05, dur: 0.09, vol: 0.07 * (o.vol || 1), lp: 3200 });
      return 0.12;
    };
    SFX.ui_back = function (d, o, t) {
      tone(d, { t: t, wave: 'square', f0: 460, f1: 260, sweep: 0.07, dur: 0.11, vol: 0.06 * (o.vol || 1), lp: 2400 });
      return 0.14;
    };
    SFX.ui_error = function (d, o, t) {
      tone(d, { t: t, wave: 'sawtooth', f0: 180, f1: 120, sweep: 0.12, dur: 0.18,
        vol: 0.10 * (o.vol || 1), lp: 1400, dist: 10 });
      return 0.2;
    };
    SFX.save = function (d, o, t) {
      tone(d, { t: t, wave: 'sine', f0: 392, dur: 0.5, vol: 0.10 * (o.vol || 1), dec: 0.3, sus: 0.4 });
      tone(d, { t: t, delay: 0.16, wave: 'sine', f0: 523.25, dur: 0.6, vol: 0.09 * (o.vol || 1), dec: 0.3, sus: 0.4 });
      tone(d, { t: t, delay: 0.32, wave: 'sine', f0: 659.25, dur: 0.9, vol: 0.08 * (o.vol || 1), dec: 0.4, sus: 0.4 });
      return 1.2;
    };
    SFX.hurt = function (d, o, t) {
      burst(d, { t: t, dur: 0.12, freq: 500, f1: 160, q: 0.7, type: 'lowpass',
        vol: 0.4 * (o.vol || 1), noise: 'brown' });
      tone(d, { t: t, wave: 'sine', f0: 120, f1: 52, dur: 0.24, vol: 0.28 * (o.vol || 1) });
      return 0.3;
    };
    SFX.grab = function (d, o, t) {
      burst(d, { t: t, dur: 0.2, freq: 420, f1: 140, q: 0.6, type: 'lowpass',
        vol: 0.34 * (o.vol || 1), noise: 'brown' });
      SFX.growl(d, { vol: 1.1 * (o.vol || 1), dur: 0.6, pitch: 0.9 }, t);
      return 0.7;
    };
    SFX.stinger_reveal = function (d, o, t) {
      tone(d, { t: t, wave: 'sawtooth', f0: 220, f1: 55, sweep: 0.7, dur: 1.5,
        vol: 0.24 * (o.vol || 1), dist: 24, lp: 1600, lp1: 300 });
      tone(d, { t: t, wave: 'square', f0: 55, dur: 1.8, vol: 0.16 * (o.vol || 1), lp: 400, dec: 1.0, sus: 0.5 });
      burst(d, { t: t, dur: 0.5, freq: 3000, f1: 400, q: 0.5, type: 'bandpass',
        vol: 0.18 * (o.vol || 1), noise: 'pink' });
      return 2.0;
    };
    SFX.stinger_grab = function (d, o, t) {
      tone(d, { t: t, wave: 'sawtooth', f0: 700, f1: 90, sweep: 0.35, dur: 1.0,
        vol: 0.26 * (o.vol || 1), dist: 30, lp: 2600, lp1: 400 });
      tone(d, { t: t, wave: 'triangle', f0: 1320, f1: 1300, dur: 1.2, vol: 0.09 * (o.vol || 1), hp: 800 });
      return 1.4;
    };
    SFX.stinger_danger = function (d, o, t) {
      var i;
      for (i = 0; i < 3; i++) {
        tone(d, { t: t, delay: i * 0.13, wave: 'square', f0: 1046 - i * 90, dur: 0.11,
          vol: 0.12 * (o.vol || 1), lp: 3000 });
      }
      tone(d, { t: t, wave: 'sine', f0: 70, f1: 40, dur: 1.1, vol: 0.2 * (o.vol || 1) });
      return 1.2;
    };
    SFX.upgrade = function (d, o, t) {
      var i, notes = [261.6, 329.6, 392.0, 523.3];
      for (i = 0; i < notes.length; i++) {
        tone(d, { t: t, delay: i * 0.09, wave: 'triangle', f0: notes[i], dur: 0.5,
          vol: 0.10 * (o.vol || 1), dec: 0.28, sus: 0.35 });
      }
      return 0.9;
    };

    /* ---- looping ambience -------------------------------------------- */
    var loops = {};
    function makeLoop(id, cfg) {
      if (!ctx) { return null; }
      var s = srcOf(cfg.noise === 'brown' ? noiseB : (cfg.noise === 'white' ? noiseW : noiseP));
      if (!s) { return null; }
      try { s.loop = true; } catch (e) { }
      var f = filt(cfg.type || 'bandpass', cfg.freq || 800, cfg.q === undefined ? 0.7 : cfg.q);
      var g = gain(0);
      if (!g) { return null; }
      var node = s;
      if (f) { conn(s, f); node = f; }
      conn(node, g);
      conn(g, busAmb || busSfx);
      startStop(s, T(), null);
      var L = { id: id, src: s, filt: f, g: g, target: 0, cfg: cfg };
      loops[id] = L;
      return L;
    }
    function loopSet(id, vol, ms) {
      var L = loops[id];
      if (!L) { return; }
      L.target = vol;
      var t = T();
      var gp = P(L.g, 'gain');
      if (gp) {
        try { if (gp.cancelScheduledValues) { gp.cancelScheduledValues(t); } } catch (e) { }
        setV(gp, gp.value === undefined ? 0 : gp.value, t);
        lin(gp, vol, t + (ms === undefined ? 1.2 : ms));
      }
    }
    function loopFreq(id, f, ms) {
      var L = loops[id];
      if (!L || !L.filt) { return; }
      var fp = P(L.filt, 'frequency');
      if (fp) { lin(fp, f, T() + (ms === undefined ? 1.0 : ms)); }
    }
    function buildLoops() {
      makeLoop('rain', { noise: 'pink', type: 'bandpass', freq: 2200, q: 0.45 });
      makeLoop('rain_low', { noise: 'brown', type: 'lowpass', freq: 700, q: 0.3 });
      makeLoop('wind', { noise: 'brown', type: 'lowpass', freq: 280, q: 0.4 });
      makeLoop('machinery', { noise: 'brown', type: 'bandpass', freq: 92, q: 6 });
      makeLoop('interior_hum', { noise: 'pink', type: 'bandpass', freq: 140, q: 8 });
      makeLoop('water_flow', { noise: 'white', type: 'bandpass', freq: 1400, q: 0.8 });
      makeLoop('fire_bed', { noise: 'pink', type: 'bandpass', freq: 800, q: 0.5 });
    }

    /* =================================================================== */
    /* == ADAPTIVE MUSIC                                                == */
    /* =================================================================== */

    var MUS = {
      state: 'explore', prevState: 'explore', danger: 0,
      layers: null, started: false, nextNote: 0, step: 0, bpm: 88, root: 55
    };

    /* target mix per state: [drone, arp, perc, strings, subpulse] */
    var MUS_MIX = {
      safe: [0.30, 0.05, 0.00, 0.10, 0.00],
      explore: [0.42, 0.14, 0.03, 0.10, 0.05],
      tension: [0.50, 0.30, 0.16, 0.26, 0.18],
      combat: [0.42, 0.46, 0.62, 0.34, 0.40],
      chase: [0.34, 0.62, 0.74, 0.24, 0.50],
      boss: [0.56, 0.40, 0.66, 0.58, 0.62],
      none: [0, 0, 0, 0, 0]
    };
    var MUS_BPM = { safe: 62, explore: 72, tension: 88, combat: 124, chase: 142, boss: 108, none: 72 };

    function buildMusic() {
      if (!ctx) { return; }
      var L = {};
      var i, k;
      var names = ['drone', 'arp', 'perc', 'strings', 'sub'];
      for (i = 0; i < names.length; i++) {
        k = names[i];
        L[k] = gain(0);
        if (L[k]) { conn(L[k], busMusic); }
      }
      /* persistent drone: three detuned saws through a slow lowpass */
      var dl = filt('lowpass', 380, 3.0);
      if (dl) { conn(dl, L.drone); }
      var dets = [-9, 0, 7];
      for (i = 0; i < dets.length; i++) {
        var o1 = osc('sawtooth', MUS.root * (i === 2 ? 1.5 : 1));
        if (o1) {
          setV(P(o1, 'detune'), dets[i], T());
          var og = gain(0.16);
          if (og) { conn(o1, og); conn(og, dl || L.drone); }
          startStop(o1, T(), null);
        }
      }
      /* slow LFO on drone filter */
      var lfo = osc('sine', 0.06), lg = gain(150);
      if (lfo && lg && dl) { conn(lfo, lg); conn(lg, P(dl, 'frequency')); startStop(lfo, T(), null); }
      /* strings-ish swell: two detuned triangles + bandpass */
      var sf = filt('bandpass', 640, 1.4);
      if (sf) { conn(sf, L.strings); }
      for (i = 0; i < 4; i++) {
        var o2 = osc('triangle', MUS.root * (i < 2 ? 2 : 3) * (1 + (i % 2) * 0.003));
        if (o2) {
          setV(P(o2, 'detune'), (i - 1.5) * 11, T());
          var og2 = gain(0.10);
          if (og2) { conn(o2, og2); conn(og2, sf || L.strings); }
          startStop(o2, T(), null);
        }
      }
      var slfo = osc('sine', 0.09), slg = gain(0.06);
      if (slfo && slg) { conn(slfo, slg); conn(slg, P(L.strings, 'gain')); startStop(slfo, T(), null); }
      /* sub pulse: sine driven by scheduler */
      MUS.layers = L;
      MUS.started = true;
      MUS.nextNote = T() + 0.1;
    }

    var SCALE = [0, 3, 5, 7, 10, 12, 15, 12, 10, 7, 5, 3];

    function musicTick() {
      if (!ctx || !MUS.started || !MUS.layers) { return; }
      var t = T();
      var spb = 60 / (MUS.bpm || 88) / 2; /* eighth notes */
      var guard = 0;
      while (MUS.nextNote < t + 0.35 && guard < 48) {
        guard++;
        var nt = MUS.nextNote;
        var st = MUS.step;
        /* arpeggio */
        if (MUS.layers.arp) {
          var deg = SCALE[st % SCALE.length];
          var f = MUS.root * 4 * Math.pow(2, deg / 12);
          tone(MUS.layers.arp, {
            t: nt, wave: 'square', f0: f, dur: spb * 1.6, vol: 0.14,
            atk: 0.004, dec: spb * 0.9, sus: 0.05, lp: 2600, lp1: 700
          });
        }
        /* percussion: kick / hat pattern */
        if (MUS.layers.perc) {
          if (st % 4 === 0) {
            tone(MUS.layers.perc, { t: nt, wave: 'sine', f0: 120, f1: 42, sweep: 0.08,
              dur: 0.19, vol: 0.42, atk: 0.002 });
          }
          if (st % 4 === 2 || st % 8 === 7) {
            burst(MUS.layers.perc, { t: nt, dur: 0.07, freq: 210, f1: 120, q: 0.9,
              type: 'bandpass', vol: 0.22, noise: 'white' });
          }
          if (st % 2 === 1) {
            burst(MUS.layers.perc, { t: nt, dur: 0.035, freq: 8200, q: 0.6,
              type: 'highpass', vol: 0.07 });
          }
        }
        /* sub pulse on the bar */
        if (MUS.layers.sub && st % 8 === 0) {
          tone(MUS.layers.sub, { t: nt, wave: 'sine', f0: MUS.root, f1: MUS.root * 0.5,
            sweep: spb * 6, dur: spb * 8, vol: 0.5, atk: 0.02, dec: spb * 4, sus: 0.25 });
        }
        MUS.step = (MUS.step + 1) % 64;
        MUS.nextNote = nt + spb;
      }
      if (MUS.nextNote < t) { MUS.nextNote = t + 0.05; }
    }

    function musicApply(fadeSec) {
      if (!MUS.layers) { return; }
      var mix = MUS_MIX[MUS.state] || MUS_MIX.explore;
      var d = clamp(MUS.danger, 0, 1);
      var t = T(), f = fadeSec === undefined ? 1.7 : fadeSec;
      var names = ['drone', 'arp', 'perc', 'strings', 'sub'];
      var boost = [1 + d * 0.15, 1 + d * 0.5, 1 + d * 0.85, 1 + d * 0.6, 1 + d * 0.7];
      var i, g, gp, v;
      for (i = 0; i < names.length; i++) {
        g = MUS.layers[names[i]];
        if (!g) { continue; }
        gp = P(g, 'gain');
        if (!gp) { continue; }
        v = clamp(mix[i] * boost[i], 0, 1.2);
        try { if (gp.cancelScheduledValues) { gp.cancelScheduledValues(t); } } catch (e) { }
        setV(gp, (gp.value === undefined ? 0 : gp.value), t);
        lin(gp, v, t + f);
      }
      MUS.bpm = (MUS_BPM[MUS.state] || 80) * (1 + d * 0.10);
    }

    /* =================================================================== */
    /* == PUBLIC AUDIO API                                              == */
    /* =================================================================== */

    var pendingUnlock = false;

    function makeCtx() {
      if (ctx || failed) { return ctx; }
      var AC = null;
      if (typeof AudioContext !== 'undefined') { AC = AudioContext; }
      else if (typeof window !== 'undefined' && window.AudioContext) { AC = window.AudioContext; }
      else if (typeof window !== 'undefined' && window.webkitAudioContext) { AC = window.webkitAudioContext; }
      if (!AC) { failed = true; return null; }
      try { ctx = new AC({ latencyHint: 'interactive' }); }
      catch (e) {
        try { ctx = new AC(); } catch (e2) { failed = true; ctx = null; }
      }
      return ctx;
    }

    Audio_.init = function (opts) {
      if (ready || failed) { return ready; }
      try {
        lowQ = !!(opts && opts.lowQuality) || S_.quality === 0;
        VOICE_CAP = lowQ ? 18 : 32;
        makeCtx();
        if (!ctx) { return false; }
        noiseW = makeNoise('white', 2);
        noiseP = makeNoise('pink', 2);
        noiseB = makeNoise('brown', 2);
        buildGraph();
        buildLoops();
        buildMusic();
        musicApply(0.01);
        ready = true;
        t0Boot = T();
        Audio_.resume();
      } catch (e) {
        failed = true;
        warn('audio init failed', e);
        return false;
      }
      return ready;
    };

    Audio_.resume = function () {
      if (!ctx) { return false; }
      try {
        if (ctx.state === 'suspended' && ctx.resume) {
          var p = ctx.resume();
          if (p && p.catch) { p.catch(function () { }); }
        }
      } catch (e) { return false; }
      return true;
    };

    Audio_.suspend = function () {
      if (!ctx) { return; }
      try { if (ctx.suspend) { var p = ctx.suspend(); if (p && p.catch) { p.catch(function () { }); } } }
      catch (e) { }
    };

    Audio_.isReady = function () { return ready; };
    Audio_.state = function () { return ctx ? (ctx.state || 'unknown') : 'none'; };

    /* Unlock on the first user gesture (autoplay policy). Never throws. */
    Audio_.unlock = function () {
      if (!ready) { Audio_.init(); }
      Audio_.resume();
      if (ready && !pendingUnlock) {
        pendingUnlock = true;
        /* a silent 1-sample blip satisfies iOS */
        try {
          var b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
          var s = srcOf(b);
          if (s) { conn(s, master); startStop(s, T(), T() + 0.01); }
        } catch (e) { }
      }
      return ready;
    };

    Audio_.setQuality = function (q) {
      lowQ = (q === 0);
      VOICE_CAP = lowQ ? 18 : 32;
      if (verb && verbSend) {
        setV(P(verbSend, 'gain'), lowQ ? 0 : 0.24, T());
      }
    };

    Audio_.setVolumes = function () { applyVolumes(); };

    Audio_.play = function (name, opts) {
      if (!ready) { return 0; }
      opts = opts || {};
      var fn = SFX[name];
      if (!fn) { return 0; }
      if (!budgetOK(opts.priority)) { return 0; }
      var dest;
      try { dest = makeDest(opts); } catch (e) { return 0; }
      if (!dest) { return 0; }
      var t = T() + (opts.when || 0);
      var dur = 0;
      try { dur = fn(dest, opts, t) || 0; } catch (e2) { warn('sfx ' + name, e2); }
      return dur;
    };

    Audio_.playAt = function (name, pos, opts) {
      opts = opts || {};
      opts.pos = pos;
      return Audio_.play(name, opts);
    };

    Audio_.has = function (name) { return !!SFX[name]; };
    Audio_.list = function () {
      var a = [], k;
      for (k in SFX) { if (Object.prototype.hasOwnProperty.call(SFX, k)) { a.push(k); } }
      a.sort();
      return a;
    };

    Audio_.loop = function (id, vol, fadeSec) { if (ready) { loopSet(id, vol, fadeSec); } };
    Audio_.loopFilter = function (id, hz, fadeSec) { if (ready) { loopFreq(id, hz, fadeSec); } };

    /* Rain/wind blend that changes with interior/exterior. */
    Audio_.setWeather = function (o) {
      if (!ready) { return; }
      o = o || {};
      var inside = clamp(o.interior || 0, 0, 1);
      var rain = clamp(o.rain === undefined ? 1 : o.rain, 0, 1);
      var wind = clamp(o.wind === undefined ? 0.5 : o.wind, 0, 1);
      loopSet('rain', rain * lerp(0.32, 0.05, inside), o.fade === undefined ? 1.5 : o.fade);
      loopSet('rain_low', rain * lerp(0.10, 0.20, inside), 1.5);
      loopFreq('rain', lerp(2400, 620, inside), 1.5);
      loopSet('wind', wind * lerp(0.24, 0.06, inside), 1.5);
      loopSet('interior_hum', inside * 0.14, 1.5);
      if (verbSend) {
        setV(P(verbSend, 'gain'), lowQ ? 0 : lerp(0.16, 0.42, inside), T());
      }
    };

    Audio_.music = function (state, danger) {
      if (!ready) { MUS.state = state || MUS.state; return; }
      if (danger !== undefined && danger !== null) { MUS.danger = clamp(danger, 0, 1); }
      if (state && state !== MUS.state) {
        MUS.prevState = MUS.state;
        MUS.state = state;
        MUS.step = 0;
      }
      musicApply(1.7);
    };
    Audio_.musicDanger = function (d) {
      MUS.danger = clamp(d || 0, 0, 1);
      if (ready) { musicApply(0.8); }
    };
    Audio_.musicState = function () { return MUS.state; };
    Audio_.stinger = function (kind, opts) {
      var n = 'stinger_' + (kind || 'reveal');
      if (!SFX[n]) { n = 'stinger_reveal'; }
      return Audio_.play(n, opts || { bus: 'music', priority: true });
    };

    Audio_.setListener = function (pos, quat) {
      if (!ready || !ctx || !ctx.listener) { return; }
      var L = ctx.listener;
      var px = (pos && pos[0]) || 0, py = (pos && pos[1]) || 0, pz = (pos && pos[2]) || 0;
      listenerPos[0] = px; listenerPos[1] = py; listenerPos[2] = pz;
      var fx = 0, fy = 0, fz = -1, ux = 0, uy = 1, uz = 0;
      if (quat && IP.Q && IP.Q.rotateVec3) {
        var f = IP.V3.TMP6, u = IP.V3.TMP7;
        IP.Q.rotateVec3(f, quat, [0, 0, -1]);
        IP.Q.rotateVec3(u, quat, [0, 1, 0]);
        fx = f[0]; fy = f[1]; fz = f[2];
        ux = u[0]; uy = u[1]; uz = u[2];
      }
      var t = T();
      try {
        if (L.positionX && L.positionX.setValueAtTime) {
          setV(L.positionX, px, t); setV(L.positionY, py, t); setV(L.positionZ, pz, t);
          setV(L.forwardX, fx, t); setV(L.forwardY, fy, t); setV(L.forwardZ, fz, t);
          setV(L.upX, ux, t); setV(L.upY, uy, t); setV(L.upZ, uz, t);
        } else {
          if (L.setPosition) { L.setPosition(px, py, pz); }
          if (L.setOrientation) { L.setOrientation(fx, fy, fz, ux, uy, uz); }
        }
      } catch (e) { }
    };

    /* Heartbeat driven by health; call every frame. */
    var hbT = 0;
    Audio_.heartbeat = function (health01, dt) {
      if (!ready) { return; }
      var h = clamp(health01, 0, 1);
      if (h > 0.55) { hbT = 0; return; }
      var intensity = smoothstep(0.55, 0.06, h);
      var period = lerp(1.15, 0.45, intensity);
      hbT -= dt;
      if (hbT <= 0) {
        hbT = period;
        Audio_.play('heartbeat', { vol: 0.35 + intensity * 0.75, bus: 'voice', priority: true });
      }
    };

    /* Elena breathing driven by fear. */
    var brT = 0;
    Audio_.companionBreath = function (fear01, dt, pos) {
      if (!ready) { return; }
      var f = clamp(fear01, 0, 1);
      brT -= dt;
      if (brT <= 0) {
        brT = lerp(3.4, 0.85, f);
        Audio_.play('breath', { fear: f, vol: 0.7 + f * 0.5, pos: pos, bus: 'voice' });
      }
    };

    Audio_.update = function (dt) {
      if (!ready) { return; }
      try { musicTick(); } catch (e) { }
      void dt;
    };

    Audio_.voiceCount = function () { return voices; };
    Audio_.ctx = function () { return ctx; };

  })();

  /* ======================================================================
     HUD / SCREEN / TOUCH-CONTROL CSS
     Appended as a second stylesheet so it cannot clash with buildCSS().
     ====================================================================== */
  var styleEl2 = null;
  function hudCSS() {
    var P = pal();
    return [
      '#ip-ui{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d7d3c8;}',
      '#ip-ui .h{position:absolute;pointer-events:none;}',
      '#ip-ui .pe{pointer-events:auto;}',
      /* ---- HUD ---- */
      '.ip-hud{position:absolute;inset:0;pointer-events:none;opacity:1;transition:opacity .25s;}',
      '.ip-hud.off{opacity:0;}',
      '.ip-vit{position:absolute;left:calc(18px + env(safe-area-inset-left));bottom:calc(18px + env(safe-area-inset-bottom));width:190px;}',
      '.ip-segs{display:flex;gap:3px;height:9px;}',
      '.ip-segs i{flex:1;background:#1b1f26;border:1px solid #2b3038;position:relative;overflow:hidden;}',
      '.ip-segs i b{position:absolute;inset:0;transform-origin:left;background:' + P.hp + ';transition:transform .12s linear;}',
      '.ip-segs i u{position:absolute;inset:0;transform-origin:left;background:' + P.hpGhost + ';opacity:.55;transition:transform .5s ease .25s;}',
      '.ip-stam{margin-top:5px;height:3px;background:#161a20;}',
      '.ip-stam b{display:block;height:100%;background:' + P.stam + ';transform-origin:left;}',
      '.ip-ammo{position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(18px + env(safe-area-inset-bottom));text-align:right;}',
      '.ip-ammo .mag{font-size:34px;font-weight:700;line-height:1;color:' + P.ammo + ';letter-spacing:.04em;}',
      '.ip-ammo .res{font-size:13px;opacity:.62;letter-spacing:.18em;}',
      '.ip-ammo .wep{font-size:11px;opacity:.5;letter-spacing:.26em;text-transform:uppercase;margin-bottom:4px;}',
      '.ip-ammo.low .mag{color:' + P.warn + ';}',
      /* companion */
      '.ip-comp{position:absolute;left:calc(18px + env(safe-area-inset-left));bottom:calc(62px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;}',
      '.ip-ring{width:34px;height:34px;border-radius:50%;border:2px solid ' + P.ok + ';position:relative;flex:0 0 auto;background:#0c1015;}',
      '.ip-ring b{position:absolute;left:2px;right:2px;bottom:2px;background:' + P.ok + ';opacity:.30;border-radius:0 0 16px 16px;}',
      '.ip-ring.warn{border-color:' + P.warn + ';} .ip-ring.warn b{background:' + P.warn + ';}',
      '.ip-ring.bad{border-color:' + P.bad + ';animation:ipPulse .7s infinite;} .ip-ring.bad b{background:' + P.bad + ';}',
      '@keyframes ipPulse{0%,100%{opacity:1}50%{opacity:.42}}',
      '.ip-ring i{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-style:normal;letter-spacing:.06em;}',
      '.ip-compname{font-size:10px;letter-spacing:.22em;opacity:.6;text-transform:uppercase;}',
      '.ip-arrow{position:absolute;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid ' + P.warn + ';opacity:0;transition:opacity .2s;}',
      /* objective + clock */
      '.ip-obj{position:absolute;top:calc(16px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);text-align:center;max-width:74vw;}',
      '.ip-obj .lbl{font-size:9px;letter-spacing:.42em;opacity:.42;text-transform:uppercase;}',
      '.ip-obj .txt{font-size:13px;letter-spacing:.06em;opacity:.86;margin-top:3px;}',
      '.ip-clock{position:absolute;top:calc(16px + env(safe-area-inset-top));right:calc(18px + env(safe-area-inset-right));font-size:20px;letter-spacing:.10em;color:' + P.bad + ';display:none;}',
      /* reticle */
      '.ip-ret{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;opacity:0;transition:opacity .12s;}',
      '.ip-ret.on{opacity:1;}',
      '.ip-ret span{position:absolute;background:' + P.ok + ';box-shadow:0 0 4px rgba(0,0,0,.9);}',
      '.ip-ret.hostile span{background:' + P.bad + ';}',
      '.ip-dot{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#ff2b1d;box-shadow:0 0 8px #ff2b1d,0 0 20px rgba(255,43,29,.55);opacity:0;}',
      '.ip-dot.on{opacity:1;}',
      /* prompts, toasts, subtitles */
      '.ip-prompt{position:absolute;left:50%;top:58%;transform:translateX(-50%);font-size:13px;letter-spacing:.10em;background:rgba(5,7,10,.72);padding:7px 14px;border:1px solid #2a3038;border-radius:3px;display:none;}',
      '.ip-prompt kbd{display:inline-block;min-width:19px;padding:1px 5px;margin-right:8px;border:1px solid #4a525c;border-radius:3px;background:#161a20;font:inherit;font-size:11px;}',
      '.ip-toasts{position:absolute;top:calc(74px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:5px;align-items:center;}',
      '.ip-toast2{font-size:11px;letter-spacing:.20em;text-transform:uppercase;background:rgba(5,7,10,.80);border-left:2px solid ' + P.warn + ';padding:6px 13px;opacity:0;transform:translateY(-6px);transition:opacity .3s,transform .3s;}',
      '.ip-toast2.on{opacity:1;transform:none;}',
      '.ip-subs{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(760px,86vw);text-align:center;}',
      '.ip-subline{display:inline-block;padding:5px 12px;border-radius:3px;line-height:1.45;}',
      '.ip-subline .sp{font-weight:700;letter-spacing:.16em;margin-right:9px;}',
      /* damage + horror overlays */
      '.ip-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 42%,rgba(120,0,0,.62) 100%);opacity:0;transition:opacity .28s;}',
      '.ip-dmgdir{position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -100px;opacity:0;}',
      '.ip-dmgdir b{position:absolute;left:50%;top:0;width:52px;height:16px;margin-left:-26px;background:linear-gradient(to bottom,rgba(220,40,30,.95),rgba(220,40,30,0));}',
      /* ---- TOUCH CONTROLS ---- */
      '.ip-touch{position:absolute;inset:0;display:none;}',
      '.ip-touch.on{display:block;}',
      '.ip-stick{position:absolute;width:132px;height:132px;border-radius:50%;border:2px solid rgba(215,211,200,.22);background:rgba(10,13,18,.28);opacity:0;transition:opacity .15s;}',
      '.ip-stick.on{opacity:1;}',
      '.ip-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(215,211,200,.30);border:1px solid rgba(215,211,200,.45);}',
      '.ip-tbtn{position:absolute;border-radius:50%;background:rgba(12,16,21,.52);border:1.5px solid rgba(215,211,200,.30);color:#d7d3c8;font-size:10px;letter-spacing:.10em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:auto;user-select:none;line-height:1.15;}',
      '.ip-tbtn.hit{background:rgba(184,35,43,.55);border-color:#e8564d;transform:scale(.94);}',
      '.ip-tbtn.big{width:82px;height:82px;font-size:12px;}',
      '.ip-tbtn.mid{width:62px;height:62px;}',
      '.ip-tbtn.sm{width:52px;height:52px;font-size:9px;}',
      '.ip-tbtn.ctx{background:rgba(20,40,30,.62);border-color:rgba(111,227,154,.55);}',
      '.ip-radial{position:absolute;width:224px;height:224px;margin:-112px 0 0 -112px;display:none;}',
      '.ip-radial.on{display:block;}',
      '.ip-radial b{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(12,16,21,.86);border:1.5px solid rgba(215,211,200,.34);display:flex;align-items:center;justify-content:center;font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:400;}',
      '.ip-radial b.sel{background:rgba(184,35,43,.62);border-color:#e8564d;}',
      '.ip-qte{position:absolute;left:50%;top:50%;width:180px;height:180px;margin:-90px 0 0 -90px;border-radius:50%;border:3px solid ' + P.bad + ';display:none;align-items:center;justify-content:center;font-size:16px;letter-spacing:.20em;text-transform:uppercase;background:rgba(120,10,10,.30);pointer-events:auto;}',
      '.ip-qte.on{display:flex;animation:ipPulse .35s infinite;}',
      /* ---- screens ---- */
      '.ip-scr{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,6,9,.90);pointer-events:auto;padding:24px;overflow-y:auto;}',
      '.ip-scr.on{display:flex;}',
      '.ip-scr>*{flex:0 0 auto;}',
      '.ip-scr h1{font-size:clamp(22px,5.6vw,46px);letter-spacing:.20em;text-transform:uppercase;margin-bottom:6px;text-align:center;}',
      '.ip-scr h3{font-size:10px;letter-spacing:.44em;text-transform:uppercase;color:' + P.bad + ';margin-bottom:26px;}',
      '.ip-mbtn{display:block;flex:0 0 auto;width:min(330px,82vw);margin:6px 0;padding:13px 18px;background:rgba(16,20,26,.9);border:1px solid #2b323b;border-left:3px solid ' + P.bad + ';color:#d7d3c8;font:inherit;font-size:12px;letter-spacing:.20em;text-transform:uppercase;text-align:left;cursor:pointer;pointer-events:auto;}',
      '.ip-mbtn:hover,.ip-mbtn:focus{background:rgba(30,36,45,.95);outline:none;}',
      '.ip-mbtn[disabled]{opacity:.35;cursor:default;}',
      '.ip-opt{display:flex;align-items:center;justify-content:space-between;gap:14px;width:min(430px,88vw);padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;letter-spacing:.12em;text-transform:uppercase;}',
      '.ip-opt input[type=range]{width:150px;}',
      '.ip-opt .val{min-width:66px;text-align:right;opacity:.7;}',
      '.ip-optbtn{padding:5px 11px;background:#161a20;border:1px solid #333b45;color:#d7d3c8;font:inherit;font-size:10px;letter-spacing:.12em;cursor:pointer;pointer-events:auto;}',
      '.ip-grid{display:grid;gap:2px;background:#0b0e13;border:1px solid #2b323b;padding:4px;}',
      '.ip-gcell{background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.05);}',
      '.ip-gitem{position:absolute;background:rgba(40,48,58,.95);border:1px solid #59636f;font-size:8px;letter-spacing:.04em;display:flex;align-items:center;justify-content:center;text-align:center;padding:2px;cursor:grab;pointer-events:auto;overflow:hidden;}',
      '.ip-gitem.sel{border-color:' + P.warn + ';background:rgba(70,58,32,.95);}'
    ].join('\n');
  }

  function injectHudCSS() {
    if (!hasDoc() || styleEl2) { return; }
    styleEl2 = mk('style', null, null, null);
    if (!styleEl2) { return; }
    try {
      styleEl2.textContent = hudCSS();
      (document.head || document.documentElement).appendChild(styleEl2);
    } catch (e) { warn('hud css', e); }
  }

  /* ======================================================================
     INPUT
     ====================================================================== */
  var IN = {
    ready: false, isTouch: false, canvas: null, root: null,
    keys: {}, keyEdge: {}, mouse: { x: 0, y: 0, dx: 0, dy: 0, b: [false, false, false] },
    mouseEdge: [false, false, false],
    locked: false, gamepadIdx: -1, padPrev: {},
    touchLook: { id: -1, lx: 0, ly: 0, dx: 0, dy: 0 },
    stick: { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false },
    buttons: {}, buttonEdge: {},
    radial: { open: false, sel: -1, cx: 0, cy: 0 },
    qte: false, qteTapEdge: false,
    aimHeld: false
  };

  var OUT = {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    aim: false, fire: false, firePressed: false, reload: false, sprint: false,
    crouch: false, interact: false, interactPressed: false, melee: false,
    meleePressed: false, swapPressed: false, inventoryPressed: false,
    flashlight: false, cmdFollow: false, cmdStay: false, cmdHide: false,
    cmdInteract: false, cmdCome: false, pausePressed: false, qteTapped: false,
    dt: 0, aimAssistDeg: 0
  };

  function keyOf(action) {
    var k = (S_ && S_.keys) || defaultKeys();
    return k[action] || defaultKeys()[action];
  }
  function keyDown(action) { return !!IN.keys[keyOf(action)]; }
  function keyPressed(action) {
    var c = keyOf(action);
    if (IN.keyEdge[c]) { IN.keyEdge[c] = false; return true; }
    return false;
  }

  function detectTouch() {
    if (S_ && S_.controlLayout === 'touch') { return true; }
    if (S_ && S_.controlLayout === 'desktop') { return false; }
    if (!hasWin()) { return false; }
    return ('ontouchstart' in window) ||
           (navigator && navigator.maxTouchPoints > 0);
  }

  function initInput(canvas, uiRoot) {
    if (IN.ready) { return; }
    IN.canvas = canvas; IN.root = uiRoot;
    IN.isTouch = detectTouch();
    Input_.isTouch = IN.isTouch;

    if (hasWin()) {
      on(window, 'keydown', function (e) {
        if (!e.code) { return; }
        if (!IN.keys[e.code]) { IN.keyEdge[e.code] = true; }
        IN.keys[e.code] = true;
        /* stop the browser stealing Tab / Space / arrows mid-game */
        if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
          if (e.preventDefault) { e.preventDefault(); }
        }
      });
      on(window, 'keyup', function (e) { if (e.code) { IN.keys[e.code] = false; } });
      on(window, 'blur', function () { IN.keys = {}; IN.mouse.b = [false, false, false]; });
    }

    if (canvas) {
      on(canvas, 'mousedown', function (e) {
        var b = e.button | 0;
        if (!IN.mouse.b[b]) { IN.mouseEdge[b] = true; }
        IN.mouse.b[b] = true;
        if (!IN.isTouch && !IN.locked && canvas.requestPointerLock) {
          try { canvas.requestPointerLock(); } catch (err) { }
        }
        if (e.preventDefault) { e.preventDefault(); }
      });
      on(window, 'mouseup', function (e) { IN.mouse.b[e.button | 0] = false; });
      on(canvas, 'mousemove', function (e) {
        if (IN.locked) {
          IN.mouse.dx += e.movementX || 0;
          IN.mouse.dy += e.movementY || 0;
        }
        IN.mouse.x = e.clientX; IN.mouse.y = e.clientY;
      });
      on(canvas, 'contextmenu', function (e) { if (e.preventDefault) { e.preventDefault(); } });
    }
    if (hasDoc()) {
      on(document, 'pointerlockchange', function () {
        IN.locked = (document.pointerLockElement === canvas);
      });
    }
    if (IN.isTouch) { initTouch(); }
    IN.ready = true;
  }

  /* ---- touch --------------------------------------------------------- */
  var touchLayer = null, stickEl = null, radialEl = null, qteEl = null;
  var RADIAL_CMDS = [
    { id: 'cmdFollow', label: 'Follow' }, { id: 'cmdStay', label: 'Stay' },
    { id: 'cmdHide', label: 'Hide' }, { id: 'cmdCome', label: 'Come' },
    { id: 'cmdInteract', label: 'Use' }
  ];

  function initTouch() {
    if (!IN.root) { return; }
    touchLayer = mk('div', 'ip-touch on', IN.root, null);
    stickEl = mk('div', 'ip-stick', touchLayer, null);
    mk('i', null, stickEl, null);

    var left = S_ && S_.leftHanded;
    var side = left ? 'left' : 'right';
    var far = left ? 'right' : 'left';

    function btn(id, label, cls, x, y) {
      var b = mk('div', 'ip-tbtn ' + cls, touchLayer, label);
      sty(b, side, x + 'px');
      sty(b, 'bottom', y + 'px');
      sty(b, 'position', 'absolute');
      b.setAttribute('data-act', id);
      IN.buttons[id] = false;
      return b;
    }
    /* thumb-reachable cluster, all >= 52px with generous spacing */
    btn('fire', 'Fire', 'big', 26, 34);
    btn('aim', 'Aim', 'big', 116, 96);
    btn('reload', 'Reload', 'mid', 34, 132);
    btn('melee', 'Knife', 'mid', 118, 14);
    btn('interact', 'Use', 'sm ctx', 200, 44);
    btn('swap', 'Swap', 'sm', 200, 116);
    var invB = mk('div', 'ip-tbtn sm', touchLayer, 'Case');
    sty(invB, side, '26px'); sty(invB, 'top', 'calc(84px + env(safe-area-inset-top))');
    sty(invB, 'position', 'absolute');
    invB.setAttribute('data-act', 'inventory');
    IN.buttons.inventory = false;

    var pauseB = mk('div', 'ip-tbtn sm', touchLayer, 'Menu');
    sty(pauseB, far, '18px'); sty(pauseB, 'top', 'calc(14px + env(safe-area-inset-top))');
    sty(pauseB, 'position', 'absolute');
    pauseB.setAttribute('data-act', 'pause');
    IN.buttons.pause = false;

    var compB = mk('div', 'ip-tbtn sm', touchLayer, 'Elena');
    sty(compB, far, '18px'); sty(compB, 'bottom', 'calc(148px + env(safe-area-inset-bottom))');
    sty(compB, 'position', 'absolute');
    compB.setAttribute('data-act', 'companion');
    IN.buttons.companion = false;

    radialEl = mk('div', 'ip-radial', touchLayer, null);
    for (var i = 0; i < RADIAL_CMDS.length; i++) {
      var seg = mk('b', null, radialEl, RADIAL_CMDS[i].label);
      var a = -Math.PI / 2 + i / RADIAL_CMDS.length * Math.PI * 2;
      sty(seg, 'left', (112 + Math.cos(a) * 76) + 'px');
      sty(seg, 'top', (112 + Math.sin(a) * 76) + 'px');
    }
    qteEl = mk('div', 'ip-qte', touchLayer, 'TAP!');

    /* One pointer handler set for the whole layer: a phone must track the
       stick, the look swipe and several buttons simultaneously. */
    var actOf = function (t) {
      var el = t && t.target;
      while (el && el !== touchLayer) {
        if (el.getAttribute && el.getAttribute('data-act')) { return el; }
        el = el.parentNode;
      }
      return null;
    };

    function down(e) {
      var touches = e.changedTouches || [e];
      for (var i = 0; i < touches.length; i++) {
        var t = touches[i];
        var id = t.identifier === undefined ? 'm' : t.identifier;
        var el = actOf(t);
        if (el) {
          var act = el.getAttribute('data-act');
          if (act === 'companion') {
            IN.radial.open = true; IN.radial.sel = -1;
            IN.radial.cx = t.clientX; IN.radial.cy = t.clientY;
            addC(radialEl, 'on');
            sty(radialEl, 'left', t.clientX + 'px');
            sty(radialEl, 'top', t.clientY + 'px');
            el.__id = id;
          } else {
            if (!IN.buttons[act]) { IN.buttonEdge[act] = true; }
            IN.buttons[act] = true;
            addC(el, 'hit');
            el.__id = id;
          }
          continue;
        }
        if (IN.qte) { IN.qteTapEdge = true; continue; }
        var half = (hasWin() ? window.innerWidth : 800) * 0.5;
        var leftSide = t.clientX < half;
        if (S_ && S_.leftHanded) { leftSide = !leftSide; }
        if (leftSide && IN.stick.id < 0) {
          IN.stick.id = id; IN.stick.ox = t.clientX; IN.stick.oy = t.clientY;
          IN.stick.x = 0; IN.stick.y = 0; IN.stick.active = true;
          sty(stickEl, 'left', (t.clientX - 66) + 'px');
          sty(stickEl, 'top', (t.clientY - 66) + 'px');
          addC(stickEl, 'on');
        } else if (IN.touchLook.id < 0) {
          IN.touchLook.id = id;
          IN.touchLook.lx = t.clientX; IN.touchLook.ly = t.clientY;
        }
      }
      if (e.preventDefault && e.cancelable) { e.preventDefault(); }
    }

    function move(e) {
      var touches = e.changedTouches || [e];
      for (var i = 0; i < touches.length; i++) {
        var t = touches[i];
        var id = t.identifier === undefined ? 'm' : t.identifier;
        if (id === IN.stick.id) {
          var dx = t.clientX - IN.stick.ox, dy = t.clientY - IN.stick.oy;
          var len = Math.sqrt(dx * dx + dy * dy);
          var max = 58;
          if (len > max) { dx = dx / len * max; dy = dy / len * max; len = max; }
          IN.stick.x = dx / max; IN.stick.y = dy / max;
          var nub = stickEl && stickEl.children && stickEl.children[0];
          if (nub) { sty(nub, 'transform', 'translate(' + dx + 'px,' + dy + 'px)'); }
        } else if (id === IN.touchLook.id) {
          IN.touchLook.dx += t.clientX - IN.touchLook.lx;
          IN.touchLook.dy += t.clientY - IN.touchLook.ly;
          IN.touchLook.lx = t.clientX; IN.touchLook.ly = t.clientY;
        } else if (IN.radial.open) {
          var rdx = t.clientX - IN.radial.cx, rdy = t.clientY - IN.radial.cy;
          if (Math.sqrt(rdx * rdx + rdy * rdy) > 34) {
            var ang = Math.atan2(rdy, rdx) + Math.PI / 2;
            while (ang < 0) { ang += Math.PI * 2; }
            IN.radial.sel = Math.floor(ang / (Math.PI * 2) * RADIAL_CMDS.length) % RADIAL_CMDS.length;
            for (var s = 0; s < radialEl.children.length; s++) {
              togC(radialEl.children[s], 'sel', s === IN.radial.sel);
            }
          } else { IN.radial.sel = -1; }
        }
      }
      if (e.preventDefault && e.cancelable) { e.preventDefault(); }
    }

    function up(e) {
      var touches = e.changedTouches || [e];
      for (var i = 0; i < touches.length; i++) {
        var t = touches[i];
        var id = t.identifier === undefined ? 'm' : t.identifier;
        if (id === IN.stick.id) {
          IN.stick.id = -1; IN.stick.x = 0; IN.stick.y = 0; IN.stick.active = false;
          remC(stickEl, 'on');
          var nub = stickEl && stickEl.children && stickEl.children[0];
          if (nub) { sty(nub, 'transform', 'translate(0,0)'); }
        } else if (id === IN.touchLook.id) {
          IN.touchLook.id = -1;
        }
        /* release any button this pointer was holding */
        var kids = touchLayer.children || [];
        for (var k = 0; k < kids.length; k++) {
          var el = kids[k];
          if (el.__id !== undefined && el.__id === id) {
            var act = el.getAttribute && el.getAttribute('data-act');
            if (act === 'companion') {
              if (IN.radial.sel >= 0) { IN.buttonEdge[RADIAL_CMDS[IN.radial.sel].id] = true; }
              IN.radial.open = false; IN.radial.sel = -1;
              remC(radialEl, 'on');
            } else if (act) {
              IN.buttons[act] = false;
              remC(el, 'hit');
            }
            el.__id = undefined;
          }
        }
      }
      if (e.preventDefault && e.cancelable) { e.preventDefault(); }
    }

    /* Safety net: if the page ends up with no live touches, release
       everything. A swallowed touchend otherwise leaves the stick jammed. */
    var releaseAll = function () {
      IN.stick.id = -1; IN.stick.x = 0; IN.stick.y = 0;
      IN.stick.active = false; IN.stick.sprintT = 0;
      remC(stickEl, 'on');
      var nub = stickEl && stickEl.children && stickEl.children[0];
      if (nub) { sty(nub, 'transform', 'translate(0,0)'); }
      IN.touchLook.id = -1; IN.touchLook.dx = 0; IN.touchLook.dy = 0;
      IN.radial.open = false; IN.radial.sel = -1;
      remC(radialEl, 'on');
      var kids = touchLayer.children || [];
      for (var k = 0; k < kids.length; k++) {
        var a = kids[k].getAttribute && kids[k].getAttribute('data-act');
        if (a) { IN.buttons[a] = false; remC(kids[k], 'hit'); }
        kids[k].__id = undefined;
      }
    };
    var globalUp = function (e) {
      if (!e.touches || e.touches.length === 0) { releaseAll(); }
    };
    if (hasWin()) {
      on(window, 'touchend', globalUp, { passive: true });
      on(window, 'touchcancel', globalUp, { passive: true });
      on(window, 'blur', releaseAll);
    }
    if (hasDoc()) {
      on(document, 'visibilitychange', function () {
        if (document.hidden) { releaseAll(); }
      });
    }
    Input_.releaseAllTouches = releaseAll;

    on(touchLayer, 'touchstart', down, { passive: false });
    on(touchLayer, 'touchmove', move, { passive: false });
    on(touchLayer, 'touchend', up, { passive: false });
    on(touchLayer, 'touchcancel', up, { passive: false });
    sty(touchLayer, 'pointerEvents', 'auto');
  }

  function btnEdge(id) {
    if (IN.buttonEdge[id]) { IN.buttonEdge[id] = false; return true; }
    return false;
  }

  function pollGamepad() {
    if (!hasWin() || !navigator.getGamepads) { return null; }
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { return pads[i]; } }
    return null;
  }

  function pollInput(dt) {
    var i;
    OUT.dt = dt;
    /* reset one-shot flags */
    OUT.firePressed = false; OUT.interactPressed = false; OUT.meleePressed = false;
    OUT.swapPressed = false; OUT.inventoryPressed = false; OUT.pausePressed = false;
    OUT.qteTapped = false;
    OUT.cmdFollow = OUT.cmdStay = OUT.cmdHide = OUT.cmdCome = OUT.cmdInteract = false;

    var mx = 0, my = 0, lookX = 0, lookY = 0;

    /* ---- keyboard + mouse ---- */
    if (keyDown('forward')) { my += 1; }
    if (keyDown('back')) { my -= 1; }
    if (keyDown('left')) { mx -= 1; }
    if (keyDown('right')) { mx += 1; }
    lookX += IN.mouse.dx; lookY += IN.mouse.dy;
    IN.mouse.dx = 0; IN.mouse.dy = 0;

    var aim = IN.mouse.b[2];
    var fire = IN.mouse.b[0];
    if (IN.mouseEdge[0]) { OUT.firePressed = true; IN.mouseEdge[0] = false; }

    OUT.reload = keyDown('reload');
    OUT.sprint = keyDown('sprint');
    OUT.crouch = keyDown('crouch');
    OUT.interact = keyDown('interact');
    if (keyPressed('interact')) { OUT.interactPressed = true; }
    OUT.melee = keyDown('melee');
    if (keyPressed('melee')) { OUT.meleePressed = true; OUT.qteTapped = true; }
    if (keyPressed('swap')) { OUT.swapPressed = true; }
    if (keyPressed('inventory')) { OUT.inventoryPressed = true; }
    if (keyPressed('pause')) { OUT.pausePressed = true; }
    if (keyPressed('flashlight')) { OUT.flashlight = !OUT.flashlight; }
    if (keyPressed('cmdFollow')) { OUT.cmdFollow = true; }
    if (keyPressed('cmdStay')) { OUT.cmdStay = true; }
    if (keyPressed('cmdHide')) { OUT.cmdHide = true; }
    if (keyPressed('cmdCome')) { OUT.cmdCome = true; }
    if (keyPressed('cmdInteract')) { OUT.cmdInteract = true; }

    /* ---- touch ---- */
    if (IN.isTouch) {
      if (IN.stick.active) {
        mx += IN.stick.x;
        my -= IN.stick.y;
        /* push past 85% for a moment to sprint - no separate button needed */
        var mag = Math.sqrt(IN.stick.x * IN.stick.x + IN.stick.y * IN.stick.y);
        if (mag > 0.85) { IN.stick.sprintT = (IN.stick.sprintT || 0) + dt; }
        else { IN.stick.sprintT = 0; }
        if ((IN.stick.sprintT || 0) > 0.3 && (S_ ? S_.autoSprint : true)) { OUT.sprint = true; }
      }
      var ts = (S_ ? S_.touchSensitivity : 1) * 1.35;
      lookX += IN.touchLook.dx * ts;
      lookY += IN.touchLook.dy * ts;
      IN.touchLook.dx = 0; IN.touchLook.dy = 0;

      if (S_ && S_.aimToggle) {
        if (btnEdge('aim')) { IN.aimHeld = !IN.aimHeld; }
        aim = aim || IN.aimHeld;
      } else {
        aim = aim || !!IN.buttons.aim;
      }
      fire = fire || !!IN.buttons.fire;
      if (btnEdge('fire')) { OUT.firePressed = true; }
      OUT.reload = OUT.reload || !!IN.buttons.reload;
      OUT.melee = OUT.melee || !!IN.buttons.melee;
      if (btnEdge('melee')) { OUT.meleePressed = true; }
      OUT.interact = OUT.interact || !!IN.buttons.interact;
      if (btnEdge('interact')) { OUT.interactPressed = true; }
      if (btnEdge('swap')) { OUT.swapPressed = true; }
      if (btnEdge('inventory')) { OUT.inventoryPressed = true; }
      if (btnEdge('pause')) { OUT.pausePressed = true; }
      for (i = 0; i < RADIAL_CMDS.length; i++) {
        if (btnEdge(RADIAL_CMDS[i].id)) { OUT[RADIAL_CMDS[i].id] = true; }
      }
      if (IN.qteTapEdge) { OUT.qteTapped = true; IN.qteTapEdge = false; }
    }

    /* ---- gamepad ---- */
    var pad = pollGamepad();
    if (pad) {
      var dz = (S_ ? S_.stickDeadzone : 0.16);
      var ax0 = pad.axes[0] || 0, ax1 = pad.axes[1] || 0;
      if (Math.abs(ax0) > dz) { mx += ax0; }
      if (Math.abs(ax1) > dz) { my -= ax1; }
      var ax2 = pad.axes[2] || 0, ax3 = pad.axes[3] || 0;
      var gs = (S_ ? S_.sensitivity : 1) * 13;
      if (Math.abs(ax2) > dz) { lookX += ax2 * gs; }
      if (Math.abs(ax3) > dz) { lookY += ax3 * gs; }
      var thr = (S_ ? S_.triggerThreshold : 0.45);
      var lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      var rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      if (lt > thr) { aim = true; }
      if (rt > thr) {
        fire = true;
        if (!IN.padPrev.rt) { OUT.firePressed = true; }
      }
      IN.padPrev.rt = rt > thr;
      function pb(idx) { return pad.buttons[idx] && pad.buttons[idx].pressed; }
      function pedge(idx, name) {
        var v = pb(idx);
        var was = IN.padPrev[name];
        IN.padPrev[name] = v;
        return v && !was;
      }
      if (pb(2)) { OUT.reload = true; }
      if (pedge(0, 'a')) { OUT.interactPressed = true; OUT.qteTapped = true; }
      if (pb(0)) { OUT.interact = true; }
      if (pedge(1, 'b')) { OUT.meleePressed = true; }
      if (pb(10)) { OUT.sprint = true; }
      if (pedge(3, 'y')) { OUT.swapPressed = true; }
      if (pedge(9, 'start')) { OUT.pausePressed = true; }
      if (pedge(8, 'back')) { OUT.inventoryPressed = true; }
      if (pedge(12, 'up')) { OUT.cmdFollow = true; }
      if (pedge(13, 'down')) { OUT.cmdStay = true; }
      if (pedge(14, 'lft')) { OUT.cmdHide = true; }
      if (pedge(15, 'rgt')) { OUT.cmdCome = true; }
    }

    var len2 = mx * mx + my * my;
    if (len2 > 1) { var l = Math.sqrt(len2); mx /= l; my /= l; }
    OUT.moveX = mx; OUT.moveY = my;
    OUT.lookX = lookX * (S_ ? S_.sensitivity : 1);
    OUT.lookY = lookY * (S_ ? S_.sensitivity : 1) * ((S_ && S_.invertY) ? -1 : 1);
    OUT.aim = !!aim;
    OUT.fire = !!fire;
    OUT.aimAssistDeg = aimAssistDeg();
    return OUT;
  }

  var Input_ = {
    init: initInput,
    poll: pollInput,
    isTouch: false,
    setMobileLayout: function (v) {
      IN.isTouch = !!v;
      Input_.isTouch = IN.isTouch;
      if (v && !touchLayer) { initTouch(); }
      if (touchLayer) { togC(touchLayer, 'on', !!v); }
    },
    setQTE: function (v) {
      IN.qte = !!v;
      if (qteEl) { togC(qteEl, 'on', !!v); }
    },
    settings: null,
    rebind: function (action, code) {
      if (!S_.keys) { S_.keys = defaultKeys(); }
      S_.keys[action] = code;
      saveSettings();
    },
    defaults: defaultKeys
  };

  /* ======================================================================
     UI
     ====================================================================== */
  var el = {};
  var uiRoot = null, currentScreen = 'title', toastQ = [], subQ = [], subT = 0;
  var hpGhost = 1, promptText = null;

  function initUI(root) {
    if (!root) { return; }
    uiRoot = root;
    injectCSS();
    injectHudCSS();

    /* ---- HUD ---- */
    el.hud = mk('div', 'ip-hud', root, null);
    el.vit = mk('div', 'ip-vit', el.hud, null);
    el.segs = mk('div', 'ip-segs', el.vit, null);
    el.segEls = [];
    for (var i = 0; i < 6; i++) {
      var seg = mk('i', null, el.segs, null);
      var ghost = mk('u', null, seg, null);
      var fill = mk('b', null, seg, null);
      el.segEls.push({ seg: seg, fill: fill, ghost: ghost });
    }
    el.stam = mk('div', 'ip-stam', el.vit, null);
    el.stamFill = mk('b', null, el.stam, null);

    el.comp = mk('div', 'ip-comp', el.hud, null);
    el.ring = mk('div', 'ip-ring', el.comp, null);
    el.ringFill = mk('b', null, el.ring, null);
    el.ringIcon = mk('i', null, el.ring, 'EV');
    el.compName = mk('div', 'ip-compname', el.comp, 'Elena');
    el.arrow = mk('div', 'ip-arrow', el.hud, null);

    el.ammo = mk('div', 'ip-ammo', el.hud, null);
    el.wep = mk('div', 'wep', el.ammo, 'Handgun');
    el.mag = mk('div', 'mag', el.ammo, '0');
    el.res = mk('div', 'res', el.ammo, '0');

    el.obj = mk('div', 'ip-obj', el.hud, null);
    mk('div', 'lbl', el.obj, 'Objective');
    el.objTxt = mk('div', 'txt', el.obj, '');
    el.clock = mk('div', 'ip-clock', el.hud, '00:00');

    el.ret = mk('div', 'ip-ret', el.hud, null);
    var parts = [['left:50%;top:0;width:1px;height:14px;margin-left:-.5px'],
                 ['left:50%;bottom:0;width:1px;height:14px;margin-left:-.5px'],
                 ['top:50%;left:0;height:1px;width:14px;margin-top:-.5px'],
                 ['top:50%;right:0;height:1px;width:14px;margin-top:-.5px']];
    el.retParts = [];
    for (var r = 0; r < 4; r++) {
      var sp = mk('span', null, el.ret, null);
      if (sp && sp.setAttribute) { sp.setAttribute('style', parts[r][0]); }
      el.retParts.push(sp);
    }
    el.dot = mk('div', 'ip-dot', el.hud, null);

    el.prompt = mk('div', 'ip-prompt', el.hud, null);
    el.toasts = mk('div', 'ip-toasts', el.hud, null);
    el.subs = mk('div', 'ip-subs', el.hud, null);
    el.vig = mk('div', 'ip-vig', el.hud, null);

    buildScreens(root);
    show('title');
  }

  function mbtn(parent, label, fn) {
    var b = mk('button', 'ip-mbtn', parent, label);
    on(b, 'click', function () {
      if (Audio_ && Audio_.play) { Audio_.play('ui_select'); }
      fn();
    });
    return b;
  }
  function cmd(name, value) { emit('ui_command', { cmd: name, value: value }); }

  function buildScreens(root) {
    /* title */
    el.title = mk('div', 'ip-scr', root, null);
    mk('h3', null, el.title, 'Island Protocol');
    mk('h1', null, el.title, 'Presidential Extraction');
    el.btnContinue = mbtn(el.title, 'Continue', function () { cmd('load'); });
    mbtn(el.title, 'New Game', function () { cmd('newgame'); show('hud'); });
    mbtn(el.title, 'Settings', function () { show('settings'); });
    el.titleTip = mk('div', 'ip-tip', el.title, '');
    sty(el.titleTip, 'marginTop', '20px');
    sty(el.titleTip, 'fontSize', '11px');
    sty(el.titleTip, 'opacity', '.5');
    sty(el.titleTip, 'maxWidth', '440px');
    sty(el.titleTip, 'textAlign', 'center');
    sty(el.titleTip, 'letterSpacing', '.08em');

    /* pause */
    el.pause = mk('div', 'ip-scr', root, null);
    mk('h1', null, el.pause, 'Paused');
    mbtn(el.pause, 'Resume', function () { cmd('resume'); });
    mbtn(el.pause, 'Save', function () { cmd('save'); });
    mbtn(el.pause, 'Settings', function () { show('settings'); });
    mbtn(el.pause, 'Restart Section', function () { cmd('restart'); });
    mbtn(el.pause, 'Quit to Title', function () { show('title'); });

    /* settings */
    el.settings = mk('div', 'ip-scr', root, null);
    mk('h1', null, el.settings, 'Settings');
    buildSettingsRows(el.settings);
    mbtn(el.settings, 'Back', function () { show(currentPrev || 'title'); });

    /* inventory */
    el.inv = mk('div', 'ip-scr', root, null);
    mk('h1', null, el.inv, 'Attache Case');
    el.invGridWrap = mk('div', null, el.inv, null);
    sty(el.invGridWrap, 'position', 'relative');
    el.invGrid = mk('div', 'ip-grid', el.invGridWrap, null);
    el.invInfo = mk('div', 'ip-tip', el.inv, '');
    sty(el.invInfo, 'marginTop', '14px');
    sty(el.invInfo, 'fontSize', '11px');
    sty(el.invInfo, 'opacity', '.7');
    mbtn(el.inv, 'Sort', function () {
      if (IP.Systems && lastState) { IP.Systems.Inventory.sort(lastState); renderInventory(lastState); }
    });
    mbtn(el.inv, 'Close', function () { cmd('resume'); });

    /* game over */
    el.gameover = mk('div', 'ip-scr', root, null);
    el.goTitle = mk('h1', null, el.gameover, 'Mission Failed');
    el.goText = mk('div', 'ip-quote', el.gameover, '');
    sty(el.goText, 'maxWidth', '520px');
    sty(el.goText, 'textAlign', 'center');
    sty(el.goText, 'fontSize', '12px');
    sty(el.goText, 'opacity', '.72');
    sty(el.goText, 'marginBottom', '22px');
    sty(el.goText, 'lineHeight', '1.7');
    mbtn(el.gameover, 'Retry', function () { cmd('restart'); });
    mbtn(el.gameover, 'Load Save', function () { cmd('load'); });
    mbtn(el.gameover, 'Quit to Title', function () { show('title'); });

    /* results */
    el.results = mk('div', 'ip-scr', root, null);
    el.resTitle = mk('h1', null, el.results, 'Extracted');
    el.resRank = mk('div', 'ip-rank', el.results, '');
    sty(el.resRank, 'fontSize', '58px');
    sty(el.resRank, 'letterSpacing', '.1em');
    sty(el.resRank, 'margin', '10px 0 18px');
    el.resText = mk('div', null, el.results, '');
    sty(el.resText, 'maxWidth', '520px');
    sty(el.resText, 'textAlign', 'center');
    sty(el.resText, 'fontSize', '12px');
    sty(el.resText, 'opacity', '.75');
    sty(el.resText, 'lineHeight', '1.7');
    sty(el.resText, 'marginBottom', '20px');
    mbtn(el.results, 'New Game +', function () { cmd('newgame'); show('hud'); });
    mbtn(el.results, 'Quit to Title', function () { show('title'); });

    /* document reader */
    el.doc = mk('div', 'ip-scr', root, null);
    el.docTitle = mk('h1', null, el.doc, '');
    el.docBody = mk('div', 'ip-scroll', el.doc, '');
    sty(el.docBody, 'maxWidth', '560px');
    sty(el.docBody, 'fontSize', '12px');
    sty(el.docBody, 'lineHeight', '1.85');
    sty(el.docBody, 'whiteSpace', 'pre-wrap');
    sty(el.docBody, 'opacity', '.82');
    sty(el.docBody, 'maxHeight', '52vh');
    sty(el.docBody, 'overflowY', 'auto');
    sty(el.docBody, 'marginBottom', '18px');
    mbtn(el.doc, 'Close', function () { cmd('resume'); });
  }

  function optRow(parent, label) {
    var row = mk('div', 'ip-opt', parent, null);
    mk('span', null, row, label);
    return row;
  }
  function sliderRow(parent, label, key, min, max, step, fmt) {
    var row = optRow(parent, label);
    var inp = mk('input', null, row, null);
    if (inp && inp.setAttribute) {
      inp.setAttribute('type', 'range');
      inp.setAttribute('min', String(min));
      inp.setAttribute('max', String(max));
      inp.setAttribute('step', String(step));
    }
    if (inp) { inp.value = String(S_[key]); }
    var val = mk('span', 'val', row, fmt ? fmt(S_[key]) : String(S_[key]));
    on(inp, 'input', function () {
      var v = parseFloat(inp.value);
      S_[key] = v;
      setText(val, fmt ? fmt(v) : String(v));
      saveSettings();
      applyLiveSettings(key, v);
    });
    return row;
  }
  function cycleRow(parent, label, key, options, labels) {
    var row = optRow(parent, label);
    var b = mk('button', 'ip-optbtn', row, '');
    function render() {
      var idx = options.indexOf(S_[key]);
      if (idx < 0) { idx = 0; }
      setText(b, labels ? labels[idx] : String(options[idx]));
    }
    on(b, 'click', function () {
      var idx = options.indexOf(S_[key]);
      S_[key] = options[(idx + 1) % options.length];
      render(); saveSettings(); applyLiveSettings(key, S_[key]);
    });
    render();
    return row;
  }

  function buildSettingsRows(parent) {
    var wrap = mk('div', null, parent, null);
    sty(wrap, 'maxHeight', '58vh');
    sty(wrap, 'overflowY', 'auto');
    sty(wrap, 'pointerEvents', 'auto');
    sty(wrap, 'marginBottom', '16px');
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    cycleRow(wrap, 'Graphics', 'quality', [0, 1, 2], ['Low', 'Medium', 'High']);
    cycleRow(wrap, 'Difficulty', 'difficulty', ['easy', 'normal', 'hard', 'pro'],
             ['Assisted', 'Standard', 'Veteran', 'Professional']);
    sliderRow(wrap, 'Brightness', 'brightness', 0.5, 1.8, 0.05, pct);
    sliderRow(wrap, 'Look Sensitivity', 'sensitivity', 0.3, 2.5, 0.05, pct);
    sliderRow(wrap, 'Touch Sensitivity', 'touchSensitivity', 0.4, 2.5, 0.05, pct);
    cycleRow(wrap, 'Aim Assist', 'aimAssistIdx', [0, 1, 2, 3], ['Off', 'Light', 'Medium', 'Strong']);
    cycleRow(wrap, 'Aim Mode', 'aimToggle', [false, true], ['Hold', 'Toggle']);
    cycleRow(wrap, 'Invert Y', 'invertY', [false, true], ['Off', 'On']);
    cycleRow(wrap, 'Controls', 'controlLayout', ['auto', 'touch', 'desktop'],
             ['Auto', 'Touch', 'Keyboard']);
    cycleRow(wrap, 'Left Handed', 'leftHanded', [false, true], ['Off', 'On']);
    sliderRow(wrap, 'Master Volume', 'volMaster', 0, 1, 0.05, pct);
    sliderRow(wrap, 'Music', 'volMusic', 0, 1, 0.05, pct);
    sliderRow(wrap, 'Effects', 'volSfx', 0, 1, 0.05, pct);
    cycleRow(wrap, 'Subtitles', 'subtitles', [true, false], ['On', 'Off']);
    sliderRow(wrap, 'Subtitle Size', 'subtitleSize', 0.7, 1.8, 0.1, pct);
    cycleRow(wrap, 'Colourblind', 'colorblind', ['none', 'protan', 'deutan', 'tritan'],
             ['Off', 'Protanopia', 'Deuteranopia', 'Tritanopia']);
    cycleRow(wrap, 'Gore', 'gore', [true, false], ['On', 'Off']);
    cycleRow(wrap, 'Reduce Motion', 'reduceMotion', [false, true], ['Off', 'On']);
    cycleRow(wrap, 'High Contrast', 'highContrast', [false, true], ['Off', 'On']);
  }

  function applyLiveSettings(key, v) {
    if (key === 'quality') { cmd('quality', v); }
    else if (key === 'controlLayout') {
      Input_.setMobileLayout(v === 'touch' ? true : (v === 'desktop' ? false : detectTouch()));
    } else if (key === 'colorblind' || key === 'highContrast') {
      if (styleEl2) { try { styleEl2.textContent = hudCSS(); } catch (e) { } }
    } else if (key.indexOf('vol') === 0) {
      if (Audio_ && Audio_.setVolumes) {
        Audio_.setVolumes({ master: S_.volMaster, music: S_.volMusic,
                            sfx: S_.volSfx, voice: S_.volVoice });
      }
    } else if (key === 'difficulty') {
      cmd('difficulty', v);
    }
  }

  /* ---- screens ---- */
  var currentPrev = 'title';
  var SCREEN_ELS = ['title', 'pause', 'settings', 'inv', 'gameover', 'results', 'doc'];
  function show(name, data) {
    if (name !== 'settings') { currentPrev = (name === 'hud') ? currentPrev : name; }
    var map = { inventory: 'inv', map: 'inv', upgrade: 'inv' };
    var target = map[name] || name;
    for (var i = 0; i < SCREEN_ELS.length; i++) {
      togC(el[SCREEN_ELS[i]], 'on', SCREEN_ELS[i] === target);
    }
    togC(el.hud, 'off', target !== 'hud');
    if (touchLayer) { togC(touchLayer, 'on', target === 'hud' && IN.isTouch); }
    currentScreen = name;

    if (target === 'title') {
      var has = IP.Systems && IP.Systems.Save && IP.Systems.Save.hasSave();
      if (el.btnContinue) {
        if (has) { el.btnContinue.removeAttribute('disabled'); }
        else { el.btnContinue.setAttribute('disabled', 'true'); }
      }
      if (IP.STORY && IP.STORY.loadingTips && IP.STORY.loadingTips.length) {
        var tips = IP.STORY.loadingTips;
        setText(el.titleTip, tips[Math.floor(Math.random() * tips.length)]);
      }
    }
    if (target === 'inv' && lastState) { renderInventory(lastState); }
    if (target === 'gameover') {
      var quote = '';
      if (IP.STORY && IP.STORY.memorial && IP.STORY.memorial.deathQuotes &&
          IP.STORY.memorial.deathQuotes.length) {
        var q = IP.STORY.memorial.deathQuotes;
        quote = q[Math.floor(Math.random() * q.length)];
        if (quote && quote.text) { quote = quote.text; }
      }
      setText(el.goTitle, (data && data.reason === 'elena_lost') ? 'Asset Lost' : 'Mission Failed');
      setText(el.goText, quote || '');
    }
    if (target === 'results' && data && data.ending) {
      setText(el.resTitle, data.ending.title || data.ending.name || 'Extracted');
      setText(el.resRank, data.ending.rank || '');
      setText(el.resText, data.ending.text || '');
    }
    if (Audio_ && Audio_.play && target !== 'hud') { Audio_.play('ui_move'); }
  }

  /* ---- inventory rendering ---- */
  var lastState = null;
  function renderInventory(S) {
    if (!el.invGrid || !S || !S.inventory) { return; }
    var inv = S.inventory;
    var cell = Math.min(46, Math.floor((hasWin() ? Math.min(window.innerWidth * 0.86, 560) : 400) / inv.w));
    sty(el.invGrid, 'gridTemplateColumns', 'repeat(' + inv.w + ',' + cell + 'px)');
    sty(el.invGrid, 'gridTemplateRows', 'repeat(' + inv.h + ',' + cell + 'px)');
    el.invGrid.replaceChildren();
    var i;
    for (i = 0; i < inv.w * inv.h; i++) { mk('div', 'ip-gcell', el.invGrid, null); }
    /* items float above the grid so they can span cells */
    var old = el.invGridWrap.querySelectorAll('.ip-gitem');
    for (i = 0; i < old.length; i++) { if (old[i].remove) { old[i].remove(); } }
    var ITEMS = IP.Systems && IP.Systems.ITEMS;
    for (i = 0; i < inv.items.length; i++) {
      var it = inv.items[i];
      var def = ITEMS && ITEMS[it.item];
      if (!def) { continue; }
      var w = it.rot ? def.h : def.w, h = it.rot ? def.w : def.h;
      var d = mk('div', 'ip-gitem', el.invGridWrap, def.name + (it.qty > 1 ? ' x' + it.qty : ''));
      sty(d, 'left', (4 + it.x * (cell + 2)) + 'px');
      sty(d, 'top', (4 + it.y * (cell + 2)) + 'px');
      sty(d, 'width', (w * cell + (w - 1) * 2) + 'px');
      sty(d, 'height', (h * cell + (h - 1) * 2) + 'px');
      (function (item, def2) {
        on(d, 'click', function () {
          setText(el.invInfo, def2.name + '  --  ' +
            (def2.kind === 'heal' ? 'Restores health' :
             def2.kind === 'ammo' ? 'Ammunition' :
             def2.kind === 'treasure' ? ('Value: ' + def2.value) : def2.kind));
          if (Audio_ && Audio_.play) { Audio_.play('ui_move'); }
        });
      })(it, def);
    }
  }

  /* ---- per-frame HUD update ---- */
  function updateUI(S, dt) {
    if (!S || !el.hud) { return; }
    lastState = S;
    var i;

    /* health segments */
    var h = S.player.health;
    if (h) {
      var segCount = h.segments || 6;
      var perSeg = h.max / segCount;
      var frac = h.hp / h.max;
      hpGhost += (frac - hpGhost) * Math.min(1, dt * 1.4);
      for (i = 0; i < el.segEls.length; i++) {
        var lo = i * perSeg;
        var f = Math.max(0, Math.min(1, (h.hp - lo) / perSeg));
        var g = Math.max(0, Math.min(1, (hpGhost * h.max - lo) / perSeg));
        showEl(el.segEls[i].seg, i < segCount);
        sty(el.segEls[i].fill, 'transform', 'scaleX(' + f + ')');
        sty(el.segEls[i].ghost, 'transform', 'scaleX(' + g + ')');
      }
      sty(el.vig, 'opacity', String(Math.max(0, 1 - frac * 1.5)));
    }
    sty(el.stamFill, 'transform', 'scaleX(' +
      Math.max(0, Math.min(1, (S.player.stamina || 0) / 100)) + ')');

    /* ammo */
    var pw = IP.Systems && IP.Systems.equippedWeapon ? IP.Systems.equippedWeapon(S) : null;
    if (pw) {
      var def = IP.Systems.WEAPONS[pw.id];
      setText(el.wep, def ? def.name || pw.id : pw.id);
      setText(el.mag, String(pw.mag));
      var ammoKey = { pistol: 'pistol', magnum: 'magnum', shotgun: 'shell', smg: 'smg',
                      rifle: 'rifle', grenade: 'grenade', flashbang: 'flash',
                      launcher: 'rocket' }[pw.id] || pw.id;
      setText(el.res, String((S.player.ammo && S.player.ammo[ammoKey]) || 0));
      togC(el.ammo, 'low', pw.mag <= 2);
    }

    /* companion */
    var elna = S.elena;
    if (elna) {
      var hf = Math.max(0, Math.min(1, elna.hp / elna.maxHp));
      sty(el.ringFill, 'height', (hf * 28) + 'px');
      remC(el.ring, 'warn'); remC(el.ring, 'bad');
      if (elna.grabbedBy >= 0 || elna.downed || hf < 0.3) { addC(el.ring, 'bad'); }
      else if (elna.fear > 0.62 || hf < 0.65) { addC(el.ring, 'warn'); }
      setText(el.ringIcon, elna.grabbedBy >= 0 ? '!!' : (elna.downed ? '--' : 'EV'));
      setText(el.compName, elna.behavior === 'Stay' ? 'Holding' :
                           elna.behavior === 'Hide' ? 'Hidden' :
                           elna.grabbedBy >= 0 ? 'TAKEN' : 'Following');
    }

    /* objective */
    if (S.objective) {
      var otxt = S.objective;
      if (IP.STORY && IP.STORY.objectives && IP.STORY.objectives[S.objective]) {
        otxt = IP.STORY.objectives[S.objective].text || S.objective;
      }
      setText(el.objTxt, otxt);
    }

    /* extraction clock */
    var ec = S.extractionClock;
    if (ec && ec.active) {
      showEl(el.clock, true);
      var t = Math.max(0, ec.timeLeft);
      setText(el.clock, Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2));
    } else { showEl(el.clock, false); }

    /* reticle */
    var aiming = !!S.player.aiming;
    togC(el.ret, 'on', aiming);
    togC(el.dot, 'on', aiming);
    if (aiming && IP.Systems && IP.Systems.getAimCone) {
      var cone = IP.Systems.getAimCone(S) || 0.05;
      var spread = 8 + cone * 260;
      for (i = 0; i < el.retParts.length; i++) {
        var p2 = el.retParts[i];
        if (!p2 || !p2.style) { continue; }
        var axis = i < 2 ? 'translateY' : 'translateX';
        var signed = (i === 0 || i === 2) ? -spread : spread;
        sty(p2, 'transform', axis + '(' + signed + 'px)');
      }
    }

    /* subtitle timer */
    if (subT > 0) {
      subT -= dt;
      if (subT <= 0) { el.subs.replaceChildren(); nextSub(); }
    } else if (subQ.length) { nextSub(); }

    /* toasts */
    for (i = toastQ.length - 1; i >= 0; i--) {
      toastQ[i].t -= dt;
      if (toastQ[i].t <= 0) {
        remC(toastQ[i].el, 'on');
        if (toastQ[i].t < -0.4) {
          if (toastQ[i].el.remove) { toastQ[i].el.remove(); }
          toastQ.splice(i, 1);
        }
      }
    }

    /* QTE prompt while grabbed */
    var grabbed = S.player.grabbedBy >= 0 || (elna && elna.grabbedBy >= 0);
    if (grabbed !== IN.qte) { Input_.setQTE(grabbed); }
  }

  function nextSub() {
    if (!subQ.length) { return; }
    var s = subQ.shift();
    el.subs.replaceChildren();
    var line = mk('div', 'ip-subline', el.subs, null);
    sty(line, 'background', 'rgba(5,7,10,' + (S_ ? S_.subtitleBg : 0.55) + ')');
    sty(line, 'fontSize', (12 * (S_ ? S_.subtitleSize : 1)) + 'px');
    var sp = mk('span', 'sp', line, s.speaker + ':');
    sty(sp, 'color', speakerColor(s.speaker));
    var tx = mk('span', null, line, s.text);
    if (tx) { tx.textContent = s.text; }
    subT = s.dur;
  }

  function subtitle(speaker, text, seconds) {
    if (!S_ || !S_.subtitles) { return; }
    if (!text) { return; }
    subQ.push({ speaker: speaker || '', text: text,
                dur: seconds || Math.max(1.8, text.length * 0.055) });
    if (subQ.length > 6) { subQ.shift(); }
  }

  function toast(text) {
    if (!el.toasts || !text) { return; }
    var t = mk('div', 'ip-toast2', el.toasts, text);
    toastQ.push({ el: t, t: 3.0 });
    if (hasWin()) { window.setTimeout(function () { addC(t, 'on'); }, 16); }
    else { addC(t, 'on'); }
    while (toastQ.length > 4) {
      var old = toastQ.shift();
      if (old.el && old.el.remove) { old.el.remove(); }
    }
  }

  function prompt(text) {
    if (!el.prompt) { return; }
    if (!text) { showEl(el.prompt, false); promptText = null; return; }
    if (text === promptText) { return; }
    promptText = text;
    el.prompt.replaceChildren();
    if (!IN.isTouch) {
      var k = mk('kbd', null, el.prompt, prettyKey(keyOf('interact')));
      if (k) { k.textContent = prettyKey(keyOf('interact')); }
    }
    var sp = mk('span', null, el.prompt, text);
    if (sp) { sp.textContent = text; }
    showEl(el.prompt, true);
  }

  var UI_ = {
    init: initUI,
    update: updateUI,
    show: show,
    subtitle: subtitle,
    toast: toast,
    prompt: prompt,
    renderInventory: renderInventory,
    showDocument: function (title, body) {
      setText(el.docTitle, title || 'Document');
      setText(el.docBody, body || '');
      show('doc');
    },
    resize: function () { if (lastState && currentScreen === 'inventory') { renderInventory(lastState); } },
    get settings() { return S_; },
    get screen() { return currentScreen; },
    defaultSettings: DEFAULT_SETTINGS
  };

  /* keep IP.UI.settings readable by the renderer/main loop */
  Input_.settings = S_;

  IP.UI = UI_;
  IP.Input = Input_;
  IP.Audio = Audio_;

})();
if (typeof window !== 'undefined') { window.IP = IP; }
if (typeof window !== 'undefined') { window.IP = IP; }

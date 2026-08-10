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

/*__APPEND__*/
})();
if (typeof window !== 'undefined') { window.IP = IP; }

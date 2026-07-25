/* ============================================================================
 * STEVE THE PC REPAIR MAN — 40_ui.js   (AGENT C)
 * STV.UI — every pixel outside the WebGL canvas.
 *
 *   HUD · title · pause · settings · dialogue · cinematic furniture ·
 *   desktop + touch input · nine minigames.
 *
 * Design language: precision instrument. Thin lines, monospace accents,
 * warm amber (#f0a24b) and cold cyan (#5fd3ff) on near-black (#0a0c0f).
 *
 * Plain ES2019. No imports, no external assets, no network. Safari 14 safe.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};
  var UI = {};
  STV.UI = UI;

  /* =========================================================================
   * 0.  Micro-helpers
   * =====================================================================*/

  var doc = document;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function now() { return (STV.now ? STV.now() : Date.now()); }

  function el(tag, klass, parent, text) {
    var n = doc.createElement(tag || 'div');
    if (klass) n.className = klass;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function on(node, evt, fn, opts) {
    if (!node) return function () {};
    var o = (opts === undefined) ? false : opts;
    try { node.addEventListener(evt, fn, o); } catch (e) { return function () {}; }
    return function () { try { node.removeEventListener(evt, fn, o); } catch (e2) {} };
  }
  function kill(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
  function empty(node) { if (node) { while (node.firstChild) node.removeChild(node.firstChild); } }
  function cls(node, name, yes) {
    if (!node) return;
    var cur = ' ' + (node.className || '') + ' ';
    var hasIt = cur.indexOf(' ' + name + ' ') >= 0;
    if (yes && !hasIt) node.className = ((node.className || '') + ' ' + name).replace(/^\s+/, '');
    else if (!yes && hasIt) node.className = cur.split(' ' + name + ' ').join(' ').replace(/^\s+|\s+$/g, '');
  }
  function has(node, name) { return !!node && (' ' + (node.className || '') + ' ').indexOf(' ' + name + ' ') >= 0; }
  function txt(node, s) { if (node) node.textContent = (s == null ? '' : String(s)); }
  function xf(node, s) { if (node) { node.style.webkitTransform = s; node.style.transform = s; } }
  function show(node, yes) { if (node) node.style.display = yes ? '' : 'none'; }

  function sfx(name) {
    if (!name) return;
    try { STV.bus.emit('sfx', { name: name }); } catch (e) {}
  }
  function buzz(ms) {
    try {
      if (STV.settings && STV.settings.motion === false) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }
  function emit(evt, payload) { try { STV.bus.emit(evt, payload); } catch (e) {} }
  function bind(evt, fn) { try { return STV.bus.on(evt, fn); } catch (e) { return function () {}; } }
  function motionOK() { return !(STV.settings && STV.settings.motion === false) && !STV.reduceMotion; }
  function settings() { return STV.settings || {}; }
  function saveSettings() { if (STV.saveSettings) { try { STV.saveSettings(); } catch (e) {} } }

  /* Deterministic rng for cosmetic UI noise (never affects world layout). */
  var uirand = (STV.rng ? STV.rng(0x5715) : function () { return 0.5; });

  /* ---- inline SVG icon set (authored here, never fetched) ---------------- */
  function ico(path, extra) {
    return '<svg class="stv-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' + (extra || '') + '</svg>';
  }
  var ICON = {
    ok:     ico('M4 12.5l5 5L20 6.5'),
    info:   ico('M12 3a9 9 0 100 18 9 9 0 000-18zM12 10.5v6M12 7.4v.2'),
    warn:   ico('M12 3.6L22 20H2L12 3.6zM12 9.5v5M12 17.2v.2'),
    star:   ico('M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8L12 3.5z'),
    disk:   ico('M4 4h12l4 4v12H4V4zM8 4v6h8V4M8 20v-6h8v6'),
    key:    ico('M14.5 4.5a5 5 0 11-4.2 7.7L3.5 19v2h3v-2h2v-2h2l1.3-1.3a5 5 0 012.7-11.2zM16.4 8.1v.2'),
    eye:    ico('M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z', '<circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    lock:   ico('M7 10.5V8a5 5 0 0110 0v2.5M5.5 10.5h13v9h-13v-9z'),
    gear:   ico('M12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6zM19.4 12c0-.5-.1-1-.2-1.5l1.7-1.3-1.7-3-2 .8a7.4 7.4 0 00-2.6-1.5L14.3 3H9.7l-.3 2.5A7.4 7.4 0 006.8 7l-2-.8-1.7 3 1.7 1.3a7.6 7.6 0 000 3L3.1 14.8l1.7 3 2-.8c.8.7 1.7 1.2 2.6 1.5l.3 2.5h4.6l.3-2.5c1-.3 1.8-.8 2.6-1.5l2 .8 1.7-3-1.7-1.3c.1-.5.2-1 .2-1.5z'),
    close:  ico('M5.5 5.5l13 13M18.5 5.5l-13 13'),
    play:   ico('M7.5 4.8l11 7.2-11 7.2V4.8z'),
    chev:   ico('M9 5.5l7 6.5-7 6.5'),
    skip:   ico('M5.5 5.5l9 6.5-9 6.5V5.5zM18 5v14'),
    cat:    ico('M4.5 9.5L6 4l4 3h4l4-3 1.5 5.5v6A4.5 4.5 0 0115 20H9a4.5 4.5 0 01-4.5-4.5v-6zM9.2 12v.2M14.8 12v.2M12 15l-1.2 1M12 15l1.2 1'),
    file:   ico('M6 3h8l4 4v14H6V3zM14 3v4h4'),
    chip:   ico('M8.5 8.5h7v7h-7v-7zM6 10.5H3.5M6 13.5H3.5M18 10.5h2.5M18 13.5h2.5M10.5 6V3.5M13.5 6V3.5M10.5 18v2.5M13.5 18v2.5'),
    bolt:   ico('M13.5 3L5.5 13.5h5L10 21l8.5-10.5h-5L13.5 3z'),
    radio:  ico('M12 12v.2M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.8 5.8a9 9 0 000 12.4M18.2 5.8a9 9 0 010 12.4'),
    crouch: ico('M9 4.2v.2M7.5 20l1.6-5.4-2.6-2.4V8.2l3.6-1.4 3.4 1.9 2.4 3.1M9.1 14.6L13 15l3.5 5'),
    run:    ico('M13 4.2v.2M9 20l2.4-4.6-2.2-2.6.6-4.2 3.6-1.2 2.8 2.6 3 .8M11.2 12.8L15 14l1.6 6M8.6 8.6L5 9.4'),
    jump:   ico('M12 20.5V7.5M12 7.5l-4 4M12 7.5l4 4M5 4h14')
  };

  /* =========================================================================
   * 1.  Stylesheet — assembled from three parts, injected once at init()
   * =====================================================================*/

  var CSS_CORE = `
  .stv-root, .stv-root * { box-sizing: border-box; -webkit-tap-highlight-color: rgba(0,0,0,0); }
  .stv-root {
    position: fixed; top:0; left:0; right:0; bottom:0;
    z-index: 20; pointer-events: none; overflow: hidden;
    color: #e6edf3;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.35;
    -webkit-user-select: none; -moz-user-select: none; user-select: none;
    -webkit-font-smoothing: antialiased;
    touch-action: none;
    --amber:#f0a24b; --cyan:#5fd3ff; --bg:#0a0c0f; --ink:#e6edf3;
    --dim:#8493a1; --red:#ff5a4e; --green:#6fe0a8;
    --line:rgba(95,211,255,0.20); --lineA:rgba(240,162,75,0.30);
    --panel:rgba(9,12,16,0.90);
    --sa-t: env(safe-area-inset-top, 0px);
    --sa-b: env(safe-area-inset-bottom, 0px);
    --sa-l: env(safe-area-inset-left, 0px);
    --sa-r: env(safe-area-inset-right, 0px);
  }
  .stv-root.hc { --line:rgba(95,211,255,0.55); --lineA:rgba(240,162,75,0.7); }
  .stv-layer { position:absolute; top:0; left:0; right:0; bottom:0; }
  .stv-ico { width:1em; height:1em; display:block; }
  .stv-mono { font-family: monospace; letter-spacing: .04em; }
  .stv-root button, .stv-root input, .stv-root select, .stv-root textarea {
    font-family: inherit; color: inherit; background: none; border: none;
    font-size: inherit; outline: none; touch-action: manipulation;
  }
  .stv-hide { display: none !important; }

  /* grain: one repeating conic-free CSS gradient stack, no images */
  .stv-grain {
    position:absolute; inset:0; pointer-events:none; opacity:.055; mix-blend-mode:overlay;
    background-image:
      repeating-linear-gradient(0deg, rgba(255,255,255,.9) 0 1px, rgba(0,0,0,0) 1px 3px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.6) 0 1px, rgba(0,0,0,0) 1px 4px);
    background-size: 3px 3px, 4px 4px;
  }

  /* ---------- generic panel / button language -------------------------- */
  .stv-panel {
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: 0 18px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04);
    -webkit-backdrop-filter: blur(9px) saturate(120%); backdrop-filter: blur(9px) saturate(120%);
  }
  .stv-btn {
    position: relative; pointer-events: auto; cursor: pointer;
    display:inline-flex; align-items:center; justify-content:center; gap:9px;
    padding: 11px 18px; min-height: 44px;
    background: rgba(16,21,27,.86);
    border: 1px solid var(--line); color: var(--ink);
    font-size: 14px; letter-spacing: .05em; text-transform: uppercase;
    transition: transform .13s ease, background .15s ease, border-color .15s ease, opacity .15s ease;
  }
  .stv-btn:before {
    content:''; position:absolute; left:-1px; top:-1px; width:7px; height:7px;
    border-left:1px solid var(--amber); border-top:1px solid var(--amber); opacity:.75;
  }
  .stv-btn:after {
    content:''; position:absolute; right:-1px; bottom:-1px; width:7px; height:7px;
    border-right:1px solid var(--amber); border-bottom:1px solid var(--amber); opacity:.75;
  }
  .stv-btn:hover { background: rgba(26,35,44,.94); border-color: var(--cyan); }
  .stv-btn.act { transform: scale(.965); }
  .stv-btn.pri { border-color: var(--lineA); color: var(--amber); }
  .stv-btn.pri:hover { background: rgba(48,32,14,.9); border-color: var(--amber); }
  .stv-btn.ghost { background: transparent; border-color: rgba(255,255,255,.13); }
  .stv-btn[disabled] { opacity:.35; pointer-events:none; }
  .stv-btn .stv-ico { font-size: 17px; opacity: .85; }

  .stv-h {
    font-family: monospace; font-size: 11px; letter-spacing: .22em;
    text-transform: uppercase; color: var(--dim);
  }
  .stv-rule { height:1px; background: linear-gradient(90deg, var(--line), rgba(0,0,0,0)); margin: 10px 0; }

  /* ---------- HUD ------------------------------------------------------- */
  .stv-hud { opacity: 0; transition: opacity .35s ease; }
  .stv-hud.on { opacity: 1; }

  .stv-obj {
    position:absolute; left: calc(18px + var(--sa-l)); top: calc(16px + var(--sa-t));
    max-width: 46%; padding-left: 12px;
    border-left: 2px solid var(--amber);
    opacity: 0; transform: translateX(-8px);
    transition: opacity .4s ease, transform .4s ease;
  }
  .stv-obj.in { opacity: 1; transform: translateX(0); }
  .stv-obj .k { font-family: monospace; font-size: 10px; letter-spacing:.24em; color: var(--amber); opacity:.85; }
  .stv-obj .t { font-size: 15px; font-weight: 500; margin-top: 3px; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
  .stv-obj .s { font-size: 12.5px; color: var(--dim); margin-top: 2px; text-shadow: 0 2px 8px rgba(0,0,0,.9); }
  .stv-obj.done .t { text-decoration: line-through; opacity:.55; }
  .stv-obj.done { border-left-color: var(--green); }

  .stv-eggs {
    position:absolute; right: calc(16px + var(--sa-r)); top: calc(60px + var(--sa-t));
    display:flex; align-items:center; gap:6px;
    font-family: monospace; font-size: 11px; letter-spacing:.12em; color: var(--dim);
    opacity:0; transition: opacity .3s ease;
  }
  .stv-eggs.in { opacity: .8; }
  .stv-eggs .stv-ico { font-size: 13px; color: var(--amber); }

  .stv-toasts {
    position:absolute; right: calc(16px + var(--sa-r)); top: calc(88px + var(--sa-t));
    display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    max-width: min(320px, 62%);
  }
  .stv-toast {
    display:flex; align-items:center; gap:9px;
    padding: 9px 13px; font-size: 13px;
    background: rgba(10,14,18,.92); border:1px solid var(--line);
    border-left: 2px solid var(--cyan);
    opacity:0; transform: translateX(14px);
    transition: opacity .28s ease, transform .28s ease;
  }
  .stv-toast.in { opacity:1; transform: translateX(0); }
  .stv-toast .stv-ico { font-size: 15px; color: var(--cyan); flex:0 0 auto; }
  .stv-toast.egg { border-left-color: var(--amber); }
  .stv-toast.egg .stv-ico { color: var(--amber); }
  .stv-toast.warn { border-left-color: var(--red); }
  .stv-toast.warn .stv-ico { color: var(--red); }

  .stv-hint {
    position:absolute; left:50%; bottom: 21%;
    transform: translate(-50%, 10px); opacity:0;
    padding: 8px 15px; font-size: 13px; color: var(--ink);
    background: rgba(8,11,15,.86); border: 1px solid var(--line);
    transition: opacity .3s ease, transform .3s ease; text-align:center;
    max-width: 78%;
  }
  .stv-hint.in { opacity:1; transform: translate(-50%, 0); }
  .stv-hint b { color: var(--amber); font-weight:600; font-family: monospace; }

  .stv-retic {
    position:absolute; left:50%; top:50%; width:26px; height:26px;
    margin:-13px 0 0 -13px; opacity:0; transition: opacity .2s ease;
  }
  .stv-retic.on { opacity: .9; }
  .stv-retic i {
    position:absolute; left:50%; top:50%; width:3px; height:3px; margin:-1.5px 0 0 -1.5px;
    background: rgba(255,255,255,.85); border-radius:50%;
  }
  .stv-retic u {
    position:absolute; inset:0; border:1px solid var(--cyan); border-radius:50%;
    opacity:0; transform: scale(.55); transition: opacity .18s ease, transform .18s ease;
  }
  .stv-retic.focus u { opacity:.85; transform: scale(1); }
  .stv-retic.focus i { background: var(--amber); }

  .stv-prompt {
    position:absolute; left:50%; top:calc(50% + 26px); transform: translate(-50%, 6px);
    display:flex; align-items:center; gap:8px; opacity:0;
    padding: 5px 11px; font-size: 12.5px; white-space:nowrap;
    background: rgba(8,11,15,.8); border:1px solid var(--lineA);
    transition: opacity .18s ease, transform .18s ease;
  }
  .stv-prompt.in { opacity:1; transform: translate(-50%, 0); }
  .stv-prompt .kb {
    font-family: monospace; font-size: 11px; color: var(--amber);
    border: 1px solid var(--lineA); padding: 1px 5px; min-width:18px; text-align:center;
  }

  .stv-progress {
    position:absolute; left:50%; bottom: 27%; transform: translate(-50%,0);
    width: min(300px, 66%); opacity:0; transition: opacity .25s ease;
  }
  .stv-progress.in { opacity:1; }
  .stv-progress .lab {
    font-family: monospace; font-size: 11px; letter-spacing:.18em; text-transform:uppercase;
    color: var(--cyan); margin-bottom: 6px; text-align:center;
  }
  .stv-progress .bar { height: 3px; background: rgba(255,255,255,.12); position:relative; overflow:hidden; }
  .stv-progress .bar i {
    position:absolute; left:0; top:0; bottom:0; width:100%; background: var(--cyan);
    transform-origin: 0 50%; transform: scaleX(0);
    transition: transform .12s linear;
    box-shadow: 0 0 12px rgba(95,211,255,.7);
  }

  .stv-noise-line { height:1px; background: var(--line); }
  `;

  var CSS_CINE = `
  /* ---------- letterbox / fade / flash / vignette / alarm --------------- */
  .stv-lb { position:absolute; inset:0; pointer-events:none; }
  .stv-lb i {
    position:absolute; left:0; right:0; height:11vh; background:#000;
    transform: scaleY(0); transition: transform .55s cubic-bezier(.22,.61,.36,1);
  }
  .stv-lb i.t { top:0; transform-origin: 50% 0; }
  .stv-lb i.b { bottom:0; transform-origin: 50% 100%; }
  .stv-lb.on i { transform: scaleY(1); }

  .stv-fade { position:absolute; inset:0; background:#000; opacity:0; pointer-events:none; }
  .stv-flash { position:absolute; inset:0; opacity:0; pointer-events:none; mix-blend-mode: screen; }

  .stv-vig {
    position:absolute; inset:0; pointer-events:none; opacity:0;
    transition: opacity .5s ease;
    background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 38%, rgba(0,0,0,.82) 100%);
  }
  .stv-alarm {
    position:absolute; inset:0; pointer-events:none; opacity:0;
    background: radial-gradient(ellipse at 50% 50%, rgba(255,40,30,0) 34%, rgba(255,40,30,.55) 100%);
    transition: opacity .3s ease;
  }
  .stv-alarm.p1 { opacity:.30; }
  .stv-alarm.p2 { opacity:.55; animation: stv-pulse 1.5s ease-in-out infinite; }
  .stv-alarm.p3 { opacity:.8;  animation: stv-pulse .72s ease-in-out infinite; }
  @keyframes stv-pulse { 0%,100% { opacity:.22; } 50% { opacity:.8; } }

  .stv-alarmbar {
    position:absolute; left:50%; top: calc(14px + var(--sa-t)); transform: translateX(-50%);
    display:none; align-items:center; gap:9px; padding:5px 14px;
    border:1px solid rgba(255,90,78,.55); background: rgba(30,6,5,.8);
    font-family: monospace; font-size: 11px; letter-spacing:.24em; color:#ff9b92;
  }
  .stv-alarmbar.on { display:flex; }
  .stv-alarmbar u { width:7px; height:7px; background:var(--red); border-radius:50%; animation: stv-pulse 1s ease-in-out infinite; }

  /* ---------- subtitles ------------------------------------------------- */
  .stv-subs {
    position:absolute; left:50%; bottom: calc(12% + var(--sa-b));
    transform: translate(-50%, 12px); opacity:0;
    width: min(760px, 88%); pointer-events:none;
    transition: opacity .26s ease, transform .26s ease;
  }
  .stv-subs.in { opacity:1; transform: translate(-50%, 0); }
  .stv-subs .box {
    position:relative; padding: 12px 18px 13px;
    background: linear-gradient(180deg, rgba(6,9,12,.90) 0%, rgba(6,9,12,.94) 100%);
    border: 1px solid rgba(255,255,255,.09);
    box-shadow: 0 10px 40px rgba(0,0,0,.75);
    -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);
  }
  .stv-subs .box:before {
    content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background: var(--amber); opacity:.8;
  }
  .stv-subs .who {
    font-family: monospace; font-size: 10.5px; letter-spacing:.24em; text-transform:uppercase;
    color: var(--amber); margin-bottom: 4px;
  }
  .stv-subs .line {
    font-size: calc(16px * var(--subScale, 1)); line-height: 1.42; color:#f2f6fa;
  }
  .stv-subs.nospk .who { display:none; }
  .stv-subs.narr .box:before { background: var(--cyan); }
  .stv-subs.narr .who { color: var(--cyan); }
  .stv-subs.narr .line { font-style: italic; color:#dbe6ee; }

  /* ---------- dialogue choices ----------------------------------------- */
  .stv-choices {
    position:absolute; left:50%; bottom: calc(22% + var(--sa-b)); transform: translateX(-50%);
    width: min(620px, 90%); display:none; flex-direction:column; gap:8px; pointer-events:auto;
  }
  .stv-choices.on { display:flex; }
  .stv-choice {
    display:flex; align-items:center; gap:11px; text-align:left; cursor:pointer;
    padding: 12px 15px; min-height:46px; font-size:14.5px;
    background: rgba(11,15,20,.9); border:1px solid var(--line);
    opacity:0; transform: translateY(8px);
    transition: opacity .25s ease, transform .25s ease, background .15s ease, border-color .15s ease;
  }
  .stv-choice.in { opacity:1; transform: translateY(0); }
  .stv-choice:hover, .stv-choice.sel { background: rgba(24,36,46,.95); border-color: var(--cyan); }
  .stv-choice .n {
    font-family: monospace; font-size:11px; color: var(--cyan);
    border:1px solid var(--line); min-width:20px; height:20px; flex:0 0 auto;
    display:inline-flex; align-items:center; justify-content:center;
  }

  /* ---------- rotate nudge --------------------------------------------- */
  .stv-rotate {
    position:absolute; inset:0; display:none; z-index: 40;
    align-items:center; justify-content:center; flex-direction:column;
    background: rgba(5,7,10,.96); text-align:center; padding:30px; pointer-events:auto;
  }
  .stv-rotate.on { display:flex; }
  .stv-rotate .ph {
    width:62px; height:100px; border:2px solid var(--cyan); border-radius:9px;
    margin-bottom:26px; position:relative;
    animation: stv-rot 2.6s ease-in-out infinite;
  }
  .stv-rotate .ph:after {
    content:''; position:absolute; left:50%; bottom:6px; width:18px; height:2px;
    margin-left:-9px; background: rgba(95,211,255,.6);
  }
  @keyframes stv-rot { 0%,25% { transform: rotate(0deg); } 60%,100% { transform: rotate(-90deg); } }
  .stv-rotate h3 { font-size:17px; margin:0 0 8px; font-weight:500; }
  .stv-rotate p { font-size:13px; color:var(--dim); margin:0 0 22px; max-width:300px; }

  /* ---------- loading --------------------------------------------------- */
  .stv-load {
    position:absolute; inset:0; display:none; z-index:34;
    align-items:center; justify-content:center; flex-direction:column;
    background:#05070a; pointer-events:auto;
  }
  .stv-load.on { display:flex; }
  .stv-load .lab {
    font-family: monospace; font-size:11px; letter-spacing:.3em; text-transform:uppercase;
    color: var(--dim); margin-bottom:14px;
  }
  .stv-load .bar { width: min(260px, 60vw); height:2px; background: rgba(255,255,255,.1); overflow:hidden; }
  .stv-load .bar i {
    display:block; height:100%; width:100%; background: var(--amber);
    transform-origin:0 50%; transform: scaleX(0); transition: transform .25s ease;
  }
  .stv-load .tag { margin-top:16px; font-family:monospace; font-size:10px; color:#3d4854; letter-spacing:.2em; }
  `;

  var CSS_TOUCH = `
  /* ---------- touch controls ------------------------------------------- */
  .stv-touch { position:absolute; inset:0; display:none; }
  .stv-touch.on { display:block; }

  .stv-stick { position:absolute; left:0; top:0; width:0; height:0; opacity:0; transition: opacity .16s ease; }
  .stv-stick.on { opacity:1; }
  .stv-stick .ring {
    position:absolute; left:-56px; top:-56px; width:112px; height:112px; border-radius:50%;
    border:1px solid rgba(95,211,255,.35);
    background: radial-gradient(circle at 50% 50%, rgba(95,211,255,.05) 0%, rgba(95,211,255,0) 70%);
  }
  .stv-stick .dead {
    position:absolute; left:-16px; top:-16px; width:32px; height:32px; border-radius:50%;
    border:1px dashed rgba(95,211,255,.18);
  }
  .stv-stick .nub {
    position:absolute; left:-25px; top:-25px; width:50px; height:50px; border-radius:50%;
    border:1px solid rgba(95,211,255,.8);
    background: radial-gradient(circle at 50% 35%, rgba(95,211,255,.28), rgba(95,211,255,.06));
    box-shadow: 0 0 18px rgba(95,211,255,.28);
  }
  .stv-stick .tick {
    position:absolute; left:-62px; top:-62px; width:124px; height:124px; border-radius:50%;
    border-top:1px solid rgba(240,162,75,.5); opacity:0; transition: opacity .15s ease;
  }
  .stv-stick.on .tick { opacity:.7; }

  .stv-tbtn {
    position:absolute; pointer-events:auto; cursor:pointer; border-radius:50%;
    display:flex; align-items:center; justify-content:center; flex-direction:column;
    border:1px solid var(--line); background: rgba(10,14,19,.5);
    color: var(--ink); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    transition: transform .12s ease, background .15s ease, border-color .15s ease, opacity .2s ease;
  }
  .stv-tbtn .stv-ico { font-size: 21px; opacity:.9; }
  .stv-tbtn .cap { font-family: monospace; font-size:8.5px; letter-spacing:.14em; opacity:.6; margin-top:2px; }
  .stv-tbtn.act { transform: scale(.9); background: rgba(95,211,255,.2); border-color: var(--cyan); }
  .stv-tbtn.lit { background: rgba(95,211,255,.15); border-color: var(--cyan); color:#cdf1ff; }

  .stv-act {
    right: calc(20px + var(--sa-r)); bottom: calc(96px + var(--sa-b));
    width: 84px; height: 84px; opacity:.42;
  }
  .stv-act .lbl {
    position:absolute; right: 100%; margin-right:12px; white-space:nowrap;
    font-size:12.5px; padding:5px 10px; background: rgba(8,11,15,.9);
    border:1px solid var(--lineA); color: var(--amber);
    opacity:0; transform: translateX(8px); transition: opacity .18s ease, transform .18s ease;
  }
  .stv-act.hot { opacity:1; border-color: var(--amber); color: var(--amber);
    background: rgba(48,31,10,.55); box-shadow: 0 0 26px rgba(240,162,75,.32);
    animation: stv-breathe 2.2s ease-in-out infinite; }
  .stv-act.hot .lbl { opacity:1; transform: translateX(0); }
  @keyframes stv-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.055); } }

  .stv-crouch { right: calc(118px + var(--sa-r)); bottom: calc(36px + var(--sa-b)); width:60px; height:60px; opacity:.8; }
  .stv-run    { right: calc(28px  + var(--sa-r)); bottom: calc(24px + var(--sa-b)); width:60px; height:60px; opacity:.8; }
  .stv-jump   { right: calc(30px  + var(--sa-r)); bottom: calc(196px + var(--sa-b)); width:52px; height:52px; opacity:.62; }

  .stv-sysbtn {
    position:absolute; pointer-events:auto; cursor:pointer;
    width:38px; height:38px; display:flex; align-items:center; justify-content:center;
    border:1px solid var(--line); background: rgba(9,12,16,.6); color: var(--dim);
    transition: color .15s ease, border-color .15s ease, transform .12s ease;
  }
  .stv-sysbtn:hover { color: var(--cyan); border-color: var(--cyan); }
  .stv-sysbtn.act { transform: scale(.92); }
  .stv-sysbtn .stv-ico { font-size:19px; }
  .stv-gear  { right: calc(14px + var(--sa-r)); top: calc(14px + var(--sa-t)); }
  .stv-pausebtn { right: calc(60px + var(--sa-r)); top: calc(14px + var(--sa-t)); }
  .stv-sysbtn.hidden { display:none; }

  .stv-skipcine {
    position:absolute; right: calc(16px + var(--sa-r)); bottom: calc(16px + var(--sa-b));
    display:none; align-items:center; gap:8px; pointer-events:auto; cursor:pointer;
    padding: 8px 14px; font-family:monospace; font-size:11px; letter-spacing:.2em;
    text-transform:uppercase; color: var(--dim);
    border:1px solid rgba(255,255,255,.14); background: rgba(6,9,12,.6);
  }
  .stv-skipcine.on { display:flex; }
  .stv-skipcine:hover { color: var(--cyan); border-color: var(--cyan); }
  `;

  var CSS_MENU = `
  /* ---------- shared full-screen scrim --------------------------------- */
  .stv-screen {
    position:absolute; inset:0; display:none; z-index:30;
    align-items:center; justify-content:center;
    background: rgba(4,6,9,.86); pointer-events:auto;
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  }
  .stv-screen.on { display:flex; }
  .stv-screen .inner { width: min(560px, 92%); max-height: 88%; overflow-y: auto; -webkit-overflow-scrolling: touch; }

  /* ---------- title ----------------------------------------------------- */
  .stv-title { background: #06080b; }
  .stv-title .inner { text-align:center; }
  .stv-title .kicker {
    font-family: monospace; font-size:10.5px; letter-spacing:.42em; color: var(--cyan);
    text-transform:uppercase; opacity:0; animation: stv-fadein .8s ease .2s forwards;
  }
  .stv-title h1 {
    margin: 14px 0 2px; font-size: clamp(30px, 8.4vw, 60px); font-weight: 300;
    letter-spacing: .04em; line-height: 1.02; color: #f6f9fc;
    opacity:0; animation: stv-fadein 1s ease .45s forwards;
  }
  .stv-title h1 em { font-style: normal; color: var(--amber); font-weight: 500; }
  .stv-title .sub {
    font-family: monospace; font-size:11px; letter-spacing:.3em; color: var(--dim);
    text-transform: uppercase; margin-top: 10px;
    opacity:0; animation: stv-fadein 1s ease .8s forwards;
  }
  .stv-title .scan {
    width: min(340px, 70%); height:1px; margin: 26px auto 24px;
    background: linear-gradient(90deg, rgba(0,0,0,0), var(--amber), rgba(0,0,0,0));
    transform: scaleX(0); animation: stv-scan 1.1s cubic-bezier(.22,.61,.36,1) 1s forwards;
  }
  .stv-title .menu { display:flex; flex-direction:column; gap:10px; align-items:center;
    opacity:0; animation: stv-fadein .8s ease 1.35s forwards; }
  .stv-title .menu .stv-btn { width: min(280px, 78%); }
  .stv-title .foot {
    margin-top: 26px; font-family: monospace; font-size:10px; letter-spacing:.16em; color:#3b4652;
    opacity:0; animation: stv-fadein .8s ease 1.8s forwards;
  }
  @keyframes stv-fadein { to { opacity: 1; } }
  @keyframes stv-scan { to { transform: scaleX(1); } }

  /* ---------- pause / settings ------------------------------------------ */
  .stv-pausebox .inner, .stv-setbox .inner { padding: 0; }
  .stv-card { padding: 22px 22px 20px; }
  .stv-card .hd {
    display:flex; align-items:baseline; justify-content:space-between; gap:12px;
    padding-bottom: 12px; margin-bottom: 16px; border-bottom:1px solid var(--line);
  }
  .stv-card .hd h2 { margin:0; font-size:17px; font-weight:500; letter-spacing:.06em; }
  .stv-card .hd .tag { font-family:monospace; font-size:10px; letter-spacing:.22em; color: var(--dim); }
  .stv-card .rows { display:flex; flex-direction:column; gap:9px; }
  .stv-card .rows .stv-btn { width:100%; justify-content: flex-start; }

  .stv-set-row {
    display:flex; align-items:center; gap:12px; padding: 9px 0;
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .stv-set-row .nm { flex: 1 1 auto; font-size:13.5px; }
  .stv-set-row .vl { font-family:monospace; font-size:11px; color: var(--cyan); min-width:42px; text-align:right; }
  .stv-set-row input[type=range] {
    -webkit-appearance:none; appearance:none; width: 132px; height: 22px; background:none;
    pointer-events:auto; flex: 0 0 auto;
  }
  .stv-set-row input[type=range]::-webkit-slider-runnable-track { height:2px; background: rgba(255,255,255,.18); }
  .stv-set-row input[type=range]::-webkit-slider-thumb {
    -webkit-appearance:none; width:16px; height:16px; margin-top:-7px; border-radius:50%;
    background: var(--amber); box-shadow: 0 0 10px rgba(240,162,75,.5);
  }
  .stv-set-row input[type=range]::-moz-range-track { height:2px; background: rgba(255,255,255,.18); }
  .stv-set-row input[type=range]::-moz-range-thumb {
    width:16px; height:16px; border:none; border-radius:50%; background: var(--amber);
  }
  .stv-tog {
    position:relative; width:46px; height:24px; flex:0 0 auto; cursor:pointer; pointer-events:auto;
    border:1px solid var(--line); background: rgba(255,255,255,.04); border-radius:13px;
    transition: background .16s ease, border-color .16s ease;
  }
  .stv-tog i {
    position:absolute; left:2px; top:2px; width:18px; height:18px; border-radius:50%;
    background: var(--dim); transition: transform .17s cubic-bezier(.22,.61,.36,1), background .17s ease;
  }
  .stv-tog.on { background: rgba(240,162,75,.18); border-color: var(--lineA); }
  .stv-tog.on i { transform: translateX(22px); background: var(--amber); }
  .stv-seg { display:flex; gap:0; flex:0 0 auto; pointer-events:auto; }
  .stv-seg button {
    cursor:pointer; padding:5px 11px; font-family:monospace; font-size:10.5px; letter-spacing:.14em;
    text-transform:uppercase; border:1px solid var(--line); border-right:none; color: var(--dim);
  }
  .stv-seg button:last-child { border-right:1px solid var(--line); }
  .stv-seg button.on { color: var(--bg); background: var(--cyan); border-color: var(--cyan); }

  /* ---------- end / credits --------------------------------------------- */
  .stv-end { background:#05070a; }
  .stv-end .inner { text-align:center; padding: 30px 4px; }
  .stv-end .badge {
    font-family:monospace; font-size:10.5px; letter-spacing:.36em; color: var(--cyan); text-transform:uppercase;
  }
  .stv-end h2 { margin:14px 0 6px; font-size: clamp(24px,6.4vw,40px); font-weight:300; color:#f6f9fc; }
  .stv-end h2 em { font-style:normal; color: var(--amber); }
  .stv-end .blurb { font-size:14px; color:#b9c6d1; max-width:440px; margin: 12px auto 0; line-height:1.55; }
  .stv-end .eggline { margin-top:22px; font-family:monospace; font-size:11px; color: var(--dim); letter-spacing:.14em; }
  .stv-end .eggbar { width:min(320px,80%); height:2px; margin:9px auto 0; background:rgba(255,255,255,.1); }
  .stv-end .eggbar i { display:block; height:100%; background: var(--amber); transform-origin:0 50%; }
  .stv-end .crew { margin-top:26px; font-family:monospace; font-size:10.5px; line-height:2; color:#4a5763; letter-spacing:.12em; }
  .stv-end .crew b { color: var(--dim); font-weight:400; }
  .stv-end .menu { margin-top:26px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
  `;

  var CSS_MG = `
  /* ---------- minigame shell -------------------------------------------- */
  .stv-mg {
    position:absolute; inset:0; display:none; z-index:32;
    align-items:center; justify-content:center; padding: 10px;
    background: rgba(3,5,7,.78); pointer-events:auto;
    -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
  }
  .stv-mg.on { display:flex; }
  .stv-mg .frame {
    position:relative; width: min(720px, 100%); max-height: 100%;
    display:flex; flex-direction:column;
    background: linear-gradient(180deg, rgba(11,15,20,.97), rgba(7,10,13,.98));
    border:1px solid var(--line);
    box-shadow: 0 26px 90px rgba(0,0,0,.75);
    margin-top: var(--sa-t); margin-bottom: var(--sa-b);
  }
  .stv-mg .frame:before, .stv-mg .frame:after {
    content:''; position:absolute; width:11px; height:11px; opacity:.8;
  }
  .stv-mg .frame:before { left:-1px; top:-1px; border-left:1px solid var(--amber); border-top:1px solid var(--amber); }
  .stv-mg .frame:after { right:-1px; bottom:-1px; border-right:1px solid var(--amber); border-bottom:1px solid var(--amber); }
  .stv-mg .top {
    display:flex; align-items:center; gap:12px; padding: 11px 15px;
    border-bottom:1px solid var(--line); flex:0 0 auto;
  }
  .stv-mg .top .id { font-family:monospace; font-size:10px; letter-spacing:.26em; color: var(--amber); text-transform:uppercase; }
  .stv-mg .top .fic { flex:1 1 auto; font-size:12.5px; color:#a9b8c5; font-style:italic; }
  .stv-mg .top .x { cursor:pointer; pointer-events:auto; color: var(--dim); padding:4px; }
  .stv-mg .top .x:hover { color: var(--red); }
  .stv-mg .body {
    position:relative; padding: 15px; overflow-y:auto; -webkit-overflow-scrolling: touch; flex: 1 1 auto;
  }
  .stv-mg .bot {
    display:flex; align-items:center; gap:10px; padding: 10px 14px;
    border-top:1px solid var(--line); flex:0 0 auto; min-height: 52px;
  }
  .stv-mg .bot .status { flex:1 1 auto; font-family:monospace; font-size:11px; color: var(--dim); letter-spacing:.08em; }
  .stv-mg .bot .status.ok { color: var(--green); }
  .stv-mg .bot .status.bad { color: var(--red); }
  .stv-mg .bot .stv-btn { padding: 8px 14px; min-height:38px; font-size:12px; }
  .stv-mg .skip { opacity:0; pointer-events:none; transition: opacity .3s ease; }
  .stv-mg .skip.on { opacity:1; pointer-events:auto; }
  .stv-mg canvas { display:block; width:100%; touch-action:none; }
  .stv-mg .shake { animation: stv-shake .32s ease; }
  @keyframes stv-shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-6px); } 40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); } 80% { transform: translateX(2px); }
  }
  .stv-mg .hintline { font-size:12px; color: var(--dim); margin-top:10px; text-align:center; }
  .stv-mg .hintline b { color: var(--cyan); font-family:monospace; }

  /* --- cmos --- */
  .stv-cmos .board {
    position:relative; width:100%; height: 268px; overflow:hidden;
    background:
      repeating-linear-gradient(0deg, rgba(0,255,180,.045) 0 1px, rgba(0,0,0,0) 1px 16px),
      repeating-linear-gradient(90deg, rgba(0,255,180,.045) 0 1px, rgba(0,0,0,0) 1px 16px),
      linear-gradient(160deg, #0d2a1e, #071711);
    border:1px solid rgba(110,220,170,.22);
  }
  .stv-cmos .socket {
    position:absolute; width:74px; height:74px; border-radius:50%;
    border:2px dashed rgba(240,162,75,.5); left:calc(50% - 37px); top:calc(50% - 37px);
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .stv-cmos .socket.hot { border-color: var(--amber); box-shadow: 0 0 26px rgba(240,162,75,.35); }
  .stv-cmos .socket.done { border-style: solid; border-color: var(--green); box-shadow: 0 0 30px rgba(111,224,168,.4); }
  .stv-cmos .cell {
    position:absolute; width:62px; height:62px; border-radius:50%; cursor:grab; pointer-events:auto;
    background: radial-gradient(circle at 38% 32%, #f2f5f7, #9aa4ab 62%, #6d767c);
    border:1px solid rgba(255,255,255,.35);
    box-shadow: 0 6px 18px rgba(0,0,0,.6), inset 0 -3px 8px rgba(0,0,0,.35);
    display:flex; align-items:center; justify-content:center;
    font-family:monospace; font-size:8.5px; color:#2b3238; letter-spacing:.06em;
    touch-action:none; transition: box-shadow .18s ease;
  }
  .stv-cmos .cell.old { background: radial-gradient(circle at 38% 32%, #b9ab8e, #7d7360 62%, #57503f); color:#2a2519; }
  .stv-cmos .cell.grab { cursor:grabbing; box-shadow: 0 14px 30px rgba(0,0,0,.7), 0 0 24px rgba(95,211,255,.3); }
  .stv-cmos .cell.snap { box-shadow: 0 0 34px rgba(111,224,168,.55); }
  .stv-cmos .clip { position:absolute; width:16px; height:34px; background:#7d868c; border-radius:2px;
    left:calc(50% - 8px); top:calc(50% - 54px); box-shadow: inset 0 0 6px rgba(0,0,0,.5); }
  .stv-cmos .caps { position:absolute; width:20px; height:20px; border-radius:50%;
    background: linear-gradient(180deg,#26303a,#131a20); border:1px solid rgba(255,255,255,.12); }
  .stv-cmos .tray {
    display:flex; align-items:center; gap:14px; margin-top:12px; padding: 10px;
    border:1px dashed rgba(255,255,255,.12);
  }
  .stv-cmos .tray .lab { font-family:monospace; font-size:10px; letter-spacing:.2em; color: var(--dim); }

  /* --- dossier --- */
  .stv-dos .page {
    position:relative; min-height: 300px; padding: 18px 20px;
    background: linear-gradient(180deg,#f4efe4,#e8e1d2); color:#2a2620;
    font-size:13.5px; line-height:1.62; overflow:hidden;
    box-shadow: inset 0 0 60px rgba(120,100,70,.22);
  }
  .stv-dos .page h4 {
    margin:0 0 4px; font-family:monospace; font-size:12px; letter-spacing:.22em; color:#7a2b22;
    text-transform:uppercase;
  }
  .stv-dos .page .meta { font-family:monospace; font-size:10px; color:#7b6f5c; letter-spacing:.14em; margin-bottom:14px; }
  .stv-dos .page p { margin: 0 0 11px; }
  .stv-dos .rd {
    position:relative; display:inline; background:#14161a; color:transparent;
    cursor:pointer; pointer-events:auto; padding: 0 3px; border-radius:1px;
    transition: background .5s ease, color .5s ease;
    -webkit-user-select:none; user-select:none;
  }
  .stv-dos .rd.wipe { background: rgba(20,22,26,0); color:#7a2b22; font-weight:600; }
  .stv-dos .stamp {
    position:absolute; right: 14px; top: 16px; transform: rotate(-11deg);
    border:2px solid rgba(122,43,34,.65); color: rgba(122,43,34,.72);
    font-family:monospace; font-size:12px; letter-spacing:.2em; padding:4px 9px;
  }
  .stv-dos .pager { display:flex; align-items:center; gap:6px; justify-content:center; margin-top:12px; }
  .stv-dos .pager u { width:22px; height:2px; background: rgba(255,255,255,.16); transition: background .2s ease; }
  .stv-dos .pager u.on { background: var(--amber); }
  .stv-dos .nav { display:flex; gap:8px; margin-top:10px; }
  .stv-dos .nav .stv-btn { flex:1 1 0; }

  /* --- security (packing grid) --- */
  .stv-sec .wrap { display:flex; gap:14px; flex-wrap:wrap; }
  .stv-sec .grid {
    position:relative; flex:1 1 300px; display:grid; gap:2px;
    grid-template-columns: repeat(6, 1fr); grid-auto-rows: 1fr;
    background: rgba(95,211,255,.08); border:1px solid var(--line); padding:2px;
  }
  .stv-sec .cellx { background: rgba(6,12,16,.8); position:relative; }
  .stv-sec .cellx.dz { background: rgba(255,90,78,.13); }
  .stv-sec .cellx.dz:after { content:''; position:absolute; inset:3px; border:1px dashed rgba(255,90,78,.4); }
  .stv-sec .piece {
    position:absolute; pointer-events:auto; cursor:grab; touch-action:none;
    border:1px solid rgba(95,211,255,.5); background: rgba(20,44,58,.86);
    display:flex; align-items:center; justify-content:center; text-align:center;
    font-family:monospace; font-size:9.5px; letter-spacing:.04em; color:#bfe8fb; padding:2px;
    transition: box-shadow .15s ease, border-color .15s ease, background .15s ease;
  }
  .stv-sec .piece.bad { border-color: var(--red); background: rgba(60,16,14,.9); color:#ffb3ac; }
  .stv-sec .piece.grab { box-shadow: 0 10px 28px rgba(0,0,0,.6); z-index:5; }
  .stv-sec .piece.sel { border-color: var(--amber); box-shadow: 0 0 18px rgba(240,162,75,.4); }
  .stv-sec .side { flex: 0 0 150px; }
  .stv-sec .side .rowk { font-family:monospace; font-size:10.5px; color: var(--dim); margin-bottom:6px; letter-spacing:.1em; }
  .stv-sec .keys { display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-top:8px; }
  .stv-sec .keys .stv-btn { padding:8px 0; min-height:38px; font-size:11px; }

  /* --- badge (oscilloscope) --- */
  .stv-badge .scope {
    position:relative; background:#04100c; border:1px solid rgba(110,220,170,.25); overflow:hidden;
  }
  .stv-badge .sliders { margin-top: 14px; display:flex; flex-direction:column; gap:11px; }
  .stv-badge .srow { display:flex; align-items:center; gap:11px; }
  .stv-badge .srow .nm { font-family:monospace; font-size:10.5px; letter-spacing:.16em; width:64px; flex:0 0 auto; }
  .stv-badge .srow input[type=range] { -webkit-appearance:none; appearance:none; flex:1 1 auto; height:26px; background:none; pointer-events:auto; }
  .stv-badge .srow input[type=range]::-webkit-slider-runnable-track { height:2px; background:rgba(255,255,255,.18); }
  .stv-badge .srow input[type=range]::-webkit-slider-thumb {
    -webkit-appearance:none; width:20px; height:20px; margin-top:-9px; border-radius:3px;
    background: var(--cyan); box-shadow: 0 0 12px rgba(95,211,255,.5);
  }
  .stv-badge .srow input[type=range]::-moz-range-track { height:2px; background:rgba(255,255,255,.18); }
  .stv-badge .srow input[type=range]::-moz-range-thumb { width:20px; height:20px; border:none; border-radius:3px; background: var(--cyan); }
  .stv-badge .srow .lk { font-family:monospace; font-size:10px; width:44px; text-align:right; color: var(--dim); }
  .stv-badge .srow.lock .lk { color: var(--green); }
  .stv-badge .srow.lock .nm { color: var(--green); }
  `;

  var CSS_MG2 = `
  /* --- wires --- */
  .stv-wires .harness { position:relative; }
  .stv-wires .wrow {
    display:flex; align-items:center; gap:10px; padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .stv-wires .wcol { width:16px; height:16px; border-radius:50%; flex:0 0 auto; box-shadow: 0 0 10px currentColor; }
  .stv-wires .wline { flex:1 1 auto; height:6px; position:relative; border-radius:3px; overflow:hidden;
    background: rgba(255,255,255,.06); }
  .stv-wires .wline i { position:absolute; inset:0; opacity:.85; transition: opacity .25s ease, transform .3s ease; transform-origin: 50% 50%; }
  .stv-wires .wrow.cut .wline i { opacity:.18; transform: scaleX(.5); }
  .stv-wires .wrow.bridged .wline i { opacity:1; box-shadow: 0 0 14px currentColor; }
  .stv-wires .wrow .tag { font-family:monospace; font-size:10px; letter-spacing:.14em; color:var(--dim); width:56px; flex:0 0 auto; }
  .stv-wires .wrow .rd { font-family:monospace; font-size:10px; color:var(--cyan); width:62px; text-align:right; flex:0 0 auto; }
  .stv-wires .wrow .acts { display:flex; gap:5px; flex:0 0 auto; }
  .stv-wires .wrow .acts .stv-btn { padding:5px 9px; min-height:32px; font-size:10.5px; }
  .stv-wires .probeon .rd { color: var(--amber); }
  .stv-wires .meter {
    display:flex; align-items:center; gap:10px; padding:9px 12px; margin-bottom:12px;
    border:1px solid var(--line); background: rgba(6,10,14,.7);
  }
  .stv-wires .meter .rdg { font-family:monospace; font-size:19px; color:var(--green); letter-spacing:.06em; min-width:110px; }
  .stv-wires .meter .nm { font-family:monospace; font-size:10px; letter-spacing:.2em; color:var(--dim); }

  /* --- terminal --- */
  .stv-term .scr {
    height: 300px; overflow-y:auto; -webkit-overflow-scrolling:touch;
    background: #030806; border:1px solid rgba(110,220,170,.2); padding: 12px 13px;
    font-family: monospace; font-size: 12.5px; line-height: 1.55; color:#7bf2b6;
    text-shadow: 0 0 8px rgba(110,240,180,.28);
  }
  .stv-term .scr .l { white-space: pre-wrap; word-break: break-word; }
  .stv-term .scr .l.cmd { color:#cfe9dc; }
  .stv-term .scr .l.err { color:#ff8d82; }
  .stv-term .scr .l.sys { color:#5fd3ff; }
  .stv-term .scr .l.kes { color:#f0a24b; }
  .stv-term .inline { display:flex; align-items:center; gap:8px; margin-top:10px;
    border:1px solid rgba(110,220,170,.25); background:#040a08; padding: 8px 10px; }
  .stv-term .inline span { font-family:monospace; font-size:12.5px; color:#7bf2b6; }
  .stv-term .inline input {
    flex:1 1 auto; font-family:monospace; font-size:12.5px; color:#cfe9dc;
    background:none; border:none; pointer-events:auto; min-width: 40px;
  }
  .stv-term .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
  .stv-term .chip {
    cursor:pointer; pointer-events:auto; font-family:monospace; font-size:11.5px;
    padding: 7px 11px; min-height:34px; display:inline-flex; align-items:center;
    border:1px solid rgba(110,220,170,.3); color:#8ef0c0; background: rgba(10,24,18,.7);
    transition: background .14s ease, transform .12s ease, border-color .14s ease;
  }
  .stv-term .chip:hover { background: rgba(20,48,36,.9); border-color:#7bf2b6; }
  .stv-term .chip.act { transform: scale(.94); }
  .stv-term .chip.hot { border-color: var(--amber); color: var(--amber); box-shadow: 0 0 14px rgba(240,162,75,.25); }
  .stv-term .cur { display:inline-block; width:7px; height:14px; background:#7bf2b6; vertical-align:-2px;
    animation: stv-blink 1.05s steps(1) infinite; }
  @keyframes stv-blink { 0%,50% { opacity:1; } 51%,100% { opacity:0; } }

  /* --- solder --- */
  .stv-sol .stage { position:relative; }
  .stv-sol .heat { display:flex; align-items:center; gap:10px; margin-top:12px; }
  .stv-sol .heat .nm { font-family:monospace; font-size:10px; letter-spacing:.2em; color:var(--dim); }
  .stv-sol .heat .bar { flex:1 1 auto; height:4px; background:rgba(255,255,255,.1); position:relative; overflow:hidden; }
  .stv-sol .heat .bar i { position:absolute; left:0; top:0; bottom:0; width:100%; transform-origin:0 50%;
    transform: scaleX(0); background: linear-gradient(90deg, var(--cyan), var(--amber), var(--red)); }
  .stv-sol .heat .bar u { position:absolute; top:-3px; bottom:-3px; width:1px; left:70%; background:rgba(255,255,255,.5); }

  /* --- lockpick --- */
  .stv-lock .stage { position:relative; }
  .stv-lock .ctrls { display:flex; gap:12px; margin-top:12px; align-items:stretch; }
  .stv-lock .pad {
    flex:1 1 0; position:relative; height: 108px; pointer-events:auto; touch-action:none;
    border:1px solid var(--line); background: rgba(8,12,16,.7); overflow:hidden;
  }
  .stv-lock .pad .lab {
    position:absolute; left:8px; top:7px; font-family:monospace; font-size:9.5px;
    letter-spacing:.2em; color:var(--dim);
  }
  .stv-lock .pad .knb {
    position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%;
    border:1px solid var(--cyan); background: radial-gradient(circle at 50% 35%, rgba(95,211,255,.28), rgba(95,211,255,.04));
  }
  .stv-lock .pad .trk { position:absolute; left:10%; right:10%; top:50%; height:1px; background: rgba(255,255,255,.12); }
  .stv-lock .pad.tension .trk { left:50%; right:auto; top:10%; bottom:10%; width:1px; height:auto; }
  .stv-lock .pins { display:flex; gap:6px; margin-top:12px; }
  .stv-lock .pins u { flex:1 1 0; height:3px; background: rgba(255,255,255,.12); transition: background .2s ease; }
  .stv-lock .pins u.set { background: var(--green); box-shadow: 0 0 10px rgba(111,224,168,.6); }

  /* --- panic (QTE) --- */
  .stv-panic .track {
    position:relative; height: 190px; border:1px solid var(--line); overflow:hidden;
    background: linear-gradient(180deg, rgba(8,12,16,.4), rgba(8,12,16,.9));
  }
  .stv-panic .lane { position:absolute; top:0; bottom:0; border-right:1px solid rgba(255,255,255,.05); }
  .stv-panic .hitline { position:absolute; left:0; right:0; bottom: 46px; height:2px; background: var(--amber);
    box-shadow: 0 0 16px rgba(240,162,75,.6); }
  .stv-panic .note {
    position:absolute; height: 16px; border-radius:2px; will-change: transform;
    background: rgba(95,211,255,.85); box-shadow: 0 0 14px rgba(95,211,255,.5);
  }
  .stv-panic .note.hit { background: var(--green); opacity:.25; }
  .stv-panic .note.miss { background: var(--red); opacity:.3; }
  .stv-panic .pads { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-top:12px; }
  .stv-panic .pad {
    pointer-events:auto; cursor:pointer; min-height: 62px; display:flex;
    align-items:center; justify-content:center; flex-direction:column; gap:3px;
    border:1px solid var(--line); background: rgba(12,18,24,.8);
    font-family:monospace; font-size:15px; color:#cfe9f7;
    transition: transform .08s ease, background .1s ease, border-color .1s ease;
  }
  .stv-panic .pad small { font-size:9px; letter-spacing:.16em; color:var(--dim); }
  .stv-panic .pad.act { transform: scale(.93); background: rgba(95,211,255,.24); border-color: var(--cyan); }
  .stv-panic .pad.good { background: rgba(111,224,168,.25); border-color: var(--green); }
  .stv-panic .pad.bad { background: rgba(255,90,78,.24); border-color: var(--red); }
  .stv-panic .combo {
    position:absolute; left:50%; top:14px; transform:translateX(-50%);
    font-family:monospace; font-size:12px; letter-spacing:.2em; color: var(--amber);
  }

  @media (max-height: 560px) {
    .stv-mg .body { padding: 10px; }
    .stv-cmos .board { height: 210px; }
    .stv-term .scr { height: 200px; }
    .stv-dos .page { min-height: 200px; }
  }
  `;

  function injectStyle() {
    if (doc.getElementById('stv-ui-style')) return;
    var s = doc.createElement('style');
    s.id = 'stv-ui-style';
    s.type = 'text/css';
    s.appendChild(doc.createTextNode(
      CSS_CORE + CSS_CINE + CSS_TOUCH + CSS_MENU + CSS_MG + CSS_MG2
    ));
    (doc.head || doc.documentElement).appendChild(s);

    /* page-level guards: no rubber band, no double-tap zoom, no selection */
    var g = doc.createElement('style');
    g.id = 'stv-ui-guard';
    g.appendChild(doc.createTextNode(
      'html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#05070a;' +
      'overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:none;}' +
      'body{position:fixed;left:0;top:0;right:0;bottom:0;}' +
      'canvas{display:block;touch-action:none;}'
    ));
    (doc.head || doc.documentElement).appendChild(g);
  }

  /* =========================================================================
   * 2.  Module state
   * =====================================================================*/

  var root = null, host = null;
  var D = {};                       /* named DOM nodes */
  var mode = 'boot';
  var started = false;
  var vw = window.innerWidth, vh = window.innerHeight;
  var offs = [];                    /* bus unsubscribers */
  var titleCb = null;
  var focusInfo = null;             /* current interact:focus payload */
  var paused = false;
  var alarmLevel = 0;
  var eggState = { n: 0, total: (STV.EGGS ? STV.EGGS.length : 16) };
  var hudOn = false;
  var cineOn = false;
  var toastList = [];
  var hintTimer = 0;
  var promptPulse = 0;

  /* ---- the input contract ------------------------------------------------ */
  UI.input = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    run: false,
    crouch: false,
    jump: false,
    use: false,
    alt: false,
    pause: false,
    pointer: { x: 0, y: 0, down: false }
  };
  var IN = UI.input;

  /* =========================================================================
   * 3.  DOM construction
   * =====================================================================*/

  function svgBtn(parent, klass, iconHTML, caption) {
    var b = el('div', klass, parent);
    var w = el('div', 'ic', b);
    w.innerHTML = iconHTML;
    if (caption) el('div', 'cap', b, caption);
    return b;
  }

  function build() {
    root = el('div', 'stv-root');
    root.id = 'stv-ui';
    if (settings().contrast) cls(root, 'hc', true);
    root.style.setProperty('--subScale', String(settings().subSize || 1));

    /* ---- grain ---- */
    D.grain = el('div', 'stv-grain', root);

    /* ---- HUD ---- */
    D.hud = el('div', 'stv-hud stv-layer', root);

    D.obj = el('div', 'stv-obj', D.hud);
    D.objK = el('div', 'k', D.obj, 'OBJECTIVE');
    D.objT = el('div', 't', D.obj, '');
    D.objS = el('div', 's', D.obj, '');

    D.eggs = el('div', 'stv-eggs', D.hud);
    D.eggsIco = el('span', '', D.eggs);
    D.eggsIco.innerHTML = ICON.star;
    D.eggsTxt = el('span', '', D.eggs, '0/16');

    D.toasts = el('div', 'stv-toasts', D.hud);

    D.retic = el('div', 'stv-retic', D.hud);
    el('u', '', D.retic);
    el('i', '', D.retic);

    D.prompt = el('div', 'stv-prompt', D.hud);
    D.promptKey = el('span', 'kb', D.prompt, 'E');
    D.promptTxt = el('span', 'lb', D.prompt, '');

    D.hint = el('div', 'stv-hint', D.hud);
    D.progress = el('div', 'stv-progress', D.hud);
    D.progressLab = el('div', 'lab', D.progress, '');
    var pbar = el('div', 'bar', D.progress);
    D.progressFill = el('i', '', pbar);

    /* ---- touch controls ---- */
    D.touch = el('div', 'stv-touch stv-layer', root);
    D.stick = el('div', 'stv-stick', D.touch);
    el('div', 'ring', D.stick);
    el('div', 'tick', D.stick);
    el('div', 'dead', D.stick);
    D.stickNub = el('div', 'nub', D.stick);

    D.actBtn = el('div', 'stv-tbtn stv-act', D.touch);
    D.actIco = el('div', '', D.actBtn);
    D.actIco.innerHTML = ICON.chev;
    D.actLbl = el('div', 'lbl', D.actBtn, 'Interact');

    D.crouchBtn = el('div', 'stv-tbtn stv-crouch', D.touch);
    D.crouchBtn.innerHTML = ICON.crouch + '<div class="cap">CROUCH</div>';
    D.runBtn = el('div', 'stv-tbtn stv-run', D.touch);
    D.runBtn.innerHTML = ICON.run + '<div class="cap">RUN</div>';
    D.jumpBtn = el('div', 'stv-tbtn stv-jump', D.touch);
    D.jumpBtn.innerHTML = ICON.jump;

    /* ---- system buttons ---- */
    D.gearBtn = el('div', 'stv-sysbtn stv-gear', root);
    D.gearBtn.innerHTML = ICON.gear;
    D.pauseBtn = el('div', 'stv-sysbtn stv-pausebtn', root);
    D.pauseBtn.innerHTML = '<svg class="stv-ico" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

    /* ---- cinematic furniture ---- */
    D.lb = el('div', 'stv-lb', root);
    el('i', 't', D.lb);
    el('i', 'b', D.lb);

    D.subs = el('div', 'stv-subs', root);
    var sbox = el('div', 'box', D.subs);
    D.subsWho = el('div', 'who', sbox, '');
    D.subsLine = el('div', 'line', sbox, '');

    D.choices = el('div', 'stv-choices', root);

    D.skipCine = el('div', 'stv-skipcine', root);
    D.skipCine.innerHTML = ICON.skip + '<span>Skip</span>';

    D.alarmBar = el('div', 'stv-alarmbar', root);
    el('u', '', D.alarmBar);
    D.alarmTxt = el('span', '', D.alarmBar, 'ALERT');

    /* ---- full-screen effects ---- */
    D.vig = el('div', 'stv-vig', root);
    D.alarmFx = el('div', 'stv-alarm', root);

    /* ---- minigame layer ---- */
    D.mg = el('div', 'stv-mg', root);

    /* ---- screens ---- */
    D.title = el('div', 'stv-screen stv-title', root);
    D.pauseScreen = el('div', 'stv-screen stv-pausebox', root);
    D.setScreen = el('div', 'stv-screen stv-setbox', root);
    D.end = el('div', 'stv-screen stv-end', root);

    /* ---- above everything ---- */
    D.flash = el('div', 'stv-flash', root);
    D.fade = el('div', 'stv-fade', root);

    D.load = el('div', 'stv-load', root);
    D.loadLab = el('div', 'lab', D.load, 'LOADING');
    var lbar = el('div', 'bar', D.load);
    D.loadFill = el('i', '', lbar);
    el('div', 'tag', D.load, 'KILBRIDE COMPUTER REPAIR');

    D.rotate = el('div', 'stv-rotate', root);
    el('div', 'ph', D.rotate);
    var rh = el('h3', '', D.rotate, 'Turn your device');
    if (rh) rh.style.marginTop = '0';
    el('p', '', D.rotate, 'Steve works best in landscape. You can carry on in portrait if you prefer — the controls will still reach.');
    D.rotateBtn = el('button', 'stv-btn ghost', D.rotate, 'Play in portrait anyway');

    (host || doc.body).appendChild(root);
  }

  /* =========================================================================
   * 4.  Mode / visibility
   * =====================================================================*/

  function applyMode() {
    var play = (mode === 'play');
    var showTouch = STV.isTouch && (play || mode === 'cine');
    cls(D.touch, 'on', showTouch && play);
    cls(D.hud, 'on', hudOn && play);
    cls(D.retic, 'on', play && !STV.isTouch);
    cls(D.gearBtn, 'hidden', !(play || mode === 'title' || mode === 'menu'));
    cls(D.pauseBtn, 'hidden', !play || !STV.isTouch);
    cls(D.skipCine, 'on', cineOn);
    if (!play) {
      IN.move.x = 0; IN.move.y = 0;
      IN.run = false; IN.crouch = false;
      cls(D.stick, 'on', false);
      cls(D.crouchBtn, 'lit', false);
      cls(D.runBtn, 'lit', false);
    }
  }

  UI.setMode = function (m) {
    if (!m || m === mode) return;
    mode = m;
    if (m === 'title') { cls(D.title, 'on', true); }
    else { cls(D.title, 'on', false); }
    if (m !== 'menu') { cls(D.pauseScreen, 'on', false); }
    if (m === 'play') { cls(D.end, 'on', false); }
    if (m === 'cine') { cineOn = true; }
    if (m === 'play' || m === 'menu') { cineOn = false; }
    applyMode();
    STV.log('[ui] mode', m);
  };
  UI.mode = function () { return mode; };

  UI.hud = function (showIt) {
    hudOn = !!showIt;
    cls(D.hud, 'on', hudOn && mode === 'play');
  };

  /* =========================================================================
   * 5.  Resize / orientation
   * =====================================================================*/

  function checkOrientation() {
    if (!STV.isMobile || !STV.isTouch) { cls(D.rotate, 'on', false); return; }
    if (UI._portraitOK) { cls(D.rotate, 'on', false); return; }
    var portrait = vh > vw * 1.05;
    var active = (mode === 'play' || mode === 'cine' || mode === 'minigame');
    cls(D.rotate, 'on', portrait && active);
  }

  UI.onResize = function (w, h) {
    vw = w || window.innerWidth;
    vh = h || window.innerHeight;
    checkOrientation();
    if (mgActive && mgActive.resize) { try { mgActive.resize(); } catch (e) {} }
  };

  /* =========================================================================
   * 6.  Input — desktop
   * =====================================================================*/

  var keys = {};
  var lockRequested = false;
  var mouseLook = false;
  var lookVel = { x: 0, y: 0 };
  var MOUSE_SENS = 0.0023;
  var TOUCH_SENS = 0.0042;

  function inputBlocked() {
    /* typing in a minigame field, or a modal is up */
    return (mode !== 'play') || paused;
  }

  function refreshMove() {
    var x = 0, y = 0;
    if (keys.w || keys.up) y += 1;
    if (keys.s || keys.down) y -= 1;
    if (keys.d || keys.right) x += 1;
    if (keys.a || keys.left) x -= 1;
    if (touchStick.active) return;      /* stick wins */
    IN.move.x = x; IN.move.y = y;
  }

  function isTypingTarget(t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
  }

  function onKeyDown(e) {
    var k = e.key;
    if (!k) return;
    var lower = ('' + k).toLowerCase();

    if (lower === 'escape') {
      e.preventDefault();
      IN.pause = true;
      handleEscape();
      return;
    }
    if (isTypingTarget(e.target)) return;

    /* konami / cheat sequence forwarding — Levels listens for key events too */
    emit('ui:key', { key: k, code: e.code });

    if (mgActive && mgActive.key) {
      var eaten = false;
      try { eaten = mgActive.key(lower, e); } catch (err) { STV.warn(err); }
      if (eaten) { e.preventDefault(); return; }
    }
    if (inputBlocked()) return;

    switch (lower) {
      case 'w': keys.w = 1; break;
      case 'a': keys.a = 1; break;
      case 's': keys.s = 1; break;
      case 'd': keys.d = 1; break;
      case 'arrowup': keys.up = 1; e.preventDefault(); break;
      case 'arrowdown': keys.down = 1; e.preventDefault(); break;
      case 'arrowleft': keys.left = 1; e.preventDefault(); break;
      case 'arrowright': keys.right = 1; e.preventDefault(); break;
      case 'shift': IN.run = true; break;
      case 'control': case 'c': IN.crouch = true; break;
      case ' ': IN.jump = true; e.preventDefault(); break;
      case 'e': case 'f': case 'enter': IN.use = true; break;
      case 'q': IN.alt = true; break;
      case 'tab': e.preventDefault(); break;
      default: return;
    }
    refreshMove();
  }

  function onKeyUp(e) {
    var k = e.key;
    if (!k) return;
    var lower = ('' + k).toLowerCase();
    switch (lower) {
      case 'w': keys.w = 0; break;
      case 'a': keys.a = 0; break;
      case 's': keys.s = 0; break;
      case 'd': keys.d = 0; break;
      case 'arrowup': keys.up = 0; break;
      case 'arrowdown': keys.down = 0; break;
      case 'arrowleft': keys.left = 0; break;
      case 'arrowright': keys.right = 0; break;
      case 'shift': IN.run = false; break;
      case 'control': case 'c': IN.crouch = false; break;
      default: return;
    }
    refreshMove();
  }

  function clearKeys() {
    keys = {};
    IN.run = false; IN.crouch = false;
    IN.move.x = 0; IN.move.y = 0;
  }

  function handleEscape() {
    if (mgActive) { return; }                 /* minigames own their own exit */
    if (mode === 'title' || mode === 'end') return;
    if (has(D.setScreen, 'on')) { closeSettings(); return; }
    UI.pause(!paused);
  }

  /* ---- pointer lock ---- */
  function havePointerLock() {
    return 'pointerLockElement' in doc || 'webkitPointerLockElement' in doc;
  }
  function lockEl() {
    return doc.pointerLockElement || doc.webkitPointerLockElement || null;
  }
  function requestLock() {
    if (STV.isTouch) return;
    if (!havePointerLock()) { mouseLook = true; return; }
    var target = host || doc.body;
    var fn = target.requestPointerLock || target.webkitRequestPointerLock;
    if (!fn) { mouseLook = true; return; }
    lockRequested = true;
    try { fn.call(target); } catch (e) { mouseLook = true; }
  }
  function exitLock() {
    var fn = doc.exitPointerLock || doc.webkitExitPointerLock;
    if (fn) { try { fn.call(doc); } catch (e) {} }
  }
  function onLockChange() {
    var locked = !!lockEl();
    mouseLook = locked;
    if (!locked && lockRequested && mode === 'play' && !paused && !mgActive) {
      /* the browser released the lock (usually ESC) — treat as pause */
      lockRequested = false;
      UI.pause(true);
    }
  }

  function onMouseMove(e) {
    var nx = (e.clientX / (vw || 1)) * 2 - 1;
    var ny = -((e.clientY / (vh || 1)) * 2 - 1);
    IN.pointer.x = clamp(nx, -1, 1);
    IN.pointer.y = clamp(ny, -1, 1);
    if (mode !== 'play' || paused || mgActive) return;
    var locked = !!lockEl();
    if (locked) {
      var dx = e.movementX || e.webkitMovementX || 0;
      var dy = e.movementY || e.webkitMovementY || 0;
      IN.look.x += dx * MOUSE_SENS;
      IN.look.y += dy * MOUSE_SENS;
    } else if (dragLook.on) {
      IN.look.x += (e.clientX - dragLook.x) * MOUSE_SENS * 1.35;
      IN.look.y += (e.clientY - dragLook.y) * MOUSE_SENS * 1.35;
      dragLook.x = e.clientX; dragLook.y = e.clientY;
    }
  }

  var dragLook = { on: false, x: 0, y: 0 };

  function onMouseDown(e) {
    IN.pointer.down = true;
    if (mode !== 'play' || paused || mgActive) return;
    if (e.button === 2) { IN.alt = true; return; }
    if (!lockEl()) {
      if (havePointerLock() && !STV.isTouch) requestLock();
      dragLook.on = true; dragLook.x = e.clientX; dragLook.y = e.clientY;
    } else {
      IN.use = true;
    }
  }
  function onMouseUp() { IN.pointer.down = false; dragLook.on = false; }

  function onWheel(e) {
    if (mode === 'play' && !mgActive) { try { e.preventDefault(); } catch (er) {} }
  }

  /* =========================================================================
   * 7.  Input — touch
   * =====================================================================*/

  var touchStick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  var touchLook = { active: false, id: null, x: 0, y: 0, t0: 0, moved: 0 };
  var STICK_MAX = 52, STICK_DEAD = 9;

  function placeStick(x, y) {
    D.stick.style.left = x + 'px';
    D.stick.style.top = y + 'px';
  }

  function stickUpdate(tx, ty) {
    var dx = tx - touchStick.ox, dy = ty - touchStick.oy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > STICK_MAX) {
      /* the origin follows the thumb once it leaves the ring — feels much better */
      touchStick.ox += dx * (1 - STICK_MAX / d);
      touchStick.oy += dy * (1 - STICK_MAX / d);
      placeStick(touchStick.ox, touchStick.oy);
      dx = tx - touchStick.ox; dy = ty - touchStick.oy; d = STICK_MAX;
    }
    xf(D.stickNub, 'translate(' + dx + 'px,' + dy + 'px)');
    var mag = d <= STICK_DEAD ? 0 : (d - STICK_DEAD) / (STICK_MAX - STICK_DEAD);
    mag = clamp(mag, 0, 1);
    /* light response curve so slow-walk is achievable */
    var curved = mag * mag * 0.55 + mag * 0.45;
    if (d < 0.0001) { IN.move.x = 0; IN.move.y = 0; return; }
    IN.move.x = (dx / d) * curved;
    IN.move.y = (-dy / d) * curved;
  }

  function stickEnd() {
    touchStick.active = false; touchStick.id = null;
    cls(D.stick, 'on', false);
    xf(D.stickNub, 'translate(0px,0px)');
    IN.move.x = 0; IN.move.y = 0;
    refreshMove();
  }

  function onTouchStart(e) {
    if (mode !== 'play' || paused || mgActive) return;
    var ts = e.changedTouches;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      var leftHalf = t.clientX < vw * 0.5;
      if (leftHalf && !touchStick.active) {
        touchStick.active = true; touchStick.id = t.identifier;
        touchStick.ox = t.clientX; touchStick.oy = t.clientY;
        placeStick(t.clientX, t.clientY);
        cls(D.stick, 'on', true);
        xf(D.stickNub, 'translate(0px,0px)');
        IN.move.x = 0; IN.move.y = 0;
      } else if (!leftHalf && !touchLook.active) {
        touchLook.active = true; touchLook.id = t.identifier;
        touchLook.x = t.clientX; touchLook.y = t.clientY;
        touchLook.t0 = now(); touchLook.moved = 0;
        lookVel.x = 0; lookVel.y = 0;
      }
      IN.pointer.x = clamp((t.clientX / (vw || 1)) * 2 - 1, -1, 1);
      IN.pointer.y = clamp(-((t.clientY / (vh || 1)) * 2 - 1), -1, 1);
      IN.pointer.down = true;
    }
    try { e.preventDefault(); } catch (er) {}
  }

  function onTouchMove(e) {
    if (mode !== 'play' || paused || mgActive) return;
    var ts = e.changedTouches;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (touchStick.active && t.identifier === touchStick.id) {
        stickUpdate(t.clientX, t.clientY);
      } else if (touchLook.active && t.identifier === touchLook.id) {
        var dx = t.clientX - touchLook.x, dy = t.clientY - touchLook.y;
        touchLook.moved += Math.abs(dx) + Math.abs(dy);
        touchLook.x = t.clientX; touchLook.y = t.clientY;
        IN.look.x += dx * TOUCH_SENS;
        IN.look.y += dy * TOUCH_SENS;
        /* remember velocity for a little post-release glide */
        lookVel.x = lerp(lookVel.x, dx * TOUCH_SENS * 12, 0.45);
        lookVel.y = lerp(lookVel.y, dy * TOUCH_SENS * 12, 0.45);
        IN.pointer.x = clamp((t.clientX / (vw || 1)) * 2 - 1, -1, 1);
        IN.pointer.y = clamp(-((t.clientY / (vh || 1)) * 2 - 1), -1, 1);
      }
    }
    try { e.preventDefault(); } catch (er) {}
  }

  function onTouchEnd(e) {
    var ts = e.changedTouches;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (touchStick.active && t.identifier === touchStick.id) stickEnd();
      else if (touchLook.active && t.identifier === touchLook.id) {
        touchLook.active = false; touchLook.id = null;
        /* a clean quick tap on the right half also triggers the focused action */
        if (touchLook.moved < 14 && (now() - touchLook.t0) < 260) {
          lookVel.x = 0; lookVel.y = 0;
          if (focusInfo) { IN.use = true; buzz(12); }
        }
      }
    }
    IN.pointer.down = false;
    try { e.preventDefault(); } catch (er) {}
  }

  /* ---- press helper used by every on-screen button --------------------- */
  function press(node, down, up, opts) {
    if (!node) return;
    opts = opts || {};
    var pressed = false;
    var pid = null;
    function begin(e, id) {
      if (pressed) return;
      pressed = true; pid = id;
      cls(node, 'act', true);
      if (opts.sfx !== false) sfx(opts.sfxName || 'click');
      if (opts.buzz !== false) buzz(10);
      if (down) { try { down(e); } catch (er) { STV.warn(er); } }
    }
    function finish(e) {
      if (!pressed) return;
      pressed = false; pid = null;
      cls(node, 'act', false);
      if (up) { try { up(e); } catch (er) { STV.warn(er); } }
    }
    on(node, 'touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      begin(e, e.changedTouches[0] ? e.changedTouches[0].identifier : 0);
    }, { passive: false });
    on(node, 'touchend', function (e) {
      e.preventDefault(); e.stopPropagation();
      var ts = e.changedTouches;
      for (var i = 0; i < ts.length; i++) if (ts[i].identifier === pid) { finish(e); return; }
      finish(e);
    }, { passive: false });
    on(node, 'touchcancel', function (e) { finish(e); }, { passive: false });
    on(node, 'mousedown', function (e) {
      if (STV.isTouch && !opts.alsoMouse) return;
      e.preventDefault(); e.stopPropagation(); begin(e, -1);
    });
    on(window, 'mouseup', function (e) { if (pid === -1) finish(e); });
    on(node, 'mouseleave', function (e) { if (pid === -1) finish(e); });
    on(node, 'click', function (e) { e.stopPropagation(); });
  }

  function setupTouch() {
    /* a transparent capture surface underneath the thumb buttons */
    var surf = el('div', 'stv-surface');
    surf.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:auto;touch-action:none;';
    D.touch.insertBefore(surf, D.touch.firstChild);
    D.surface = surf;

    on(surf, 'touchstart', onTouchStart, { passive: false });
    on(surf, 'touchmove', onTouchMove, { passive: false });
    on(surf, 'touchend', onTouchEnd, { passive: false });
    on(surf, 'touchcancel', onTouchEnd, { passive: false });

    press(D.actBtn, function () { IN.use = true; }, null, { sfxName: 'clickSoft' });
    press(D.jumpBtn, function () { IN.jump = true; }, null, { sfxName: 'clickSoft' });
    press(D.crouchBtn, function () {
      IN.crouch = !IN.crouch;
      cls(D.crouchBtn, 'lit', IN.crouch);
    }, null, {});
    press(D.runBtn, function () { IN.run = true; cls(D.runBtn, 'lit', true); },
                    function () { IN.run = false; cls(D.runBtn, 'lit', false); }, {});
    press(D.pauseBtn, function () { IN.pause = true; UI.pause(!paused); }, null, { sfxName: 'uiBack' });
    press(D.gearBtn, function () { openSettings(); }, null, { sfxName: 'uiConfirm' });
    press(D.skipCine, function () {
      emit('cine:skip', {});
      if (STV.Cine && STV.Cine.skip) { try { STV.Cine.skip(); } catch (e) {} }
    }, null, { sfxName: 'uiBack' });
    press(D.rotateBtn, function () {
      UI._portraitOK = true;
      cls(D.rotate, 'on', false);
    }, null, { sfxName: 'uiConfirm' });
  }

  function setupDesktop() {
    on(window, 'keydown', onKeyDown, false);
    on(window, 'keyup', onKeyUp, false);
    on(window, 'blur', function () { clearKeys(); stickEnd(); }, false);
    on(doc, 'mousemove', onMouseMove, false);
    on(doc, 'mousedown', onMouseDown, false);
    on(doc, 'mouseup', onMouseUp, false);
    on(doc, 'wheel', onWheel, { passive: false });
    on(doc, 'contextmenu', function (e) { if (mode === 'play') e.preventDefault(); }, false);
    on(doc, 'pointerlockchange', onLockChange, false);
    on(doc, 'webkitpointerlockchange', onLockChange, false);
    on(doc, 'pointerlockerror', function () { mouseLook = true; }, false);
    on(doc, 'visibilitychange', function () { if (doc.hidden) clearKeys(); }, false);
    /* click the world to (re)acquire the pointer lock */
    on(host || doc, 'click', function () {
      if (STV.isTouch) return;
      if (mode === 'play' && !paused && !mgActive && !lockEl()) requestLock();
    }, false);
    /* kill double-tap zoom / gesture zoom on iOS */
    var lastTouchEnd = 0;
    on(doc, 'touchend', function (e) {
      var t = now();
      if (t - lastTouchEnd < 320) { try { e.preventDefault(); } catch (er) {} }
      lastTouchEnd = t;
    }, { passive: false });
    on(doc, 'gesturestart', function (e) { try { e.preventDefault(); } catch (er) {} }, { passive: false });
    on(doc, 'dblclick', function (e) { try { e.preventDefault(); } catch (er) {} }, { passive: false });
    on(window, 'orientationchange', function () {
      setTimeout(function () {
        vw = window.innerWidth; vh = window.innerHeight;
        checkOrientation();
        if (mgActive && mgActive.resize) { try { mgActive.resize(); } catch (e) {} }
      }, 260);
    }, false);
    on(window, 'resize', function () {
      vw = window.innerWidth; vh = window.innerHeight;
      checkOrientation();
    }, false);
  }

  /* =========================================================================
   * 8.  HUD API
   * =====================================================================*/

  var objTimer = 0;

  UI.objective = function (text, sub) {
    if (!D.obj) return;
    if (!text) { cls(D.obj, 'in', false); return; }
    cls(D.obj, 'done', false);
    txt(D.objT, text);
    txt(D.objS, sub || '');
    show(D.objS, !!sub);
    cls(D.obj, 'in', true);
    objTimer = 0;
  };

  UI.objectiveDone = function (text) {
    if (!D.obj) return;
    if (text) txt(D.objT, text);
    cls(D.obj, 'done', true);
    objTimer = 2.6;
  };

  UI.toast = function (text, icon, ms) {
    if (!text || !D.toasts) return;
    var kind = '';
    if (icon === 'egg' || icon === 'star') kind = ' egg';
    else if (icon === 'warn' || icon === 'alert') kind = ' warn';
    var n = el('div', 'stv-toast' + kind, D.toasts);
    var ic = el('span', 'ic', n);
    ic.innerHTML = ICON[icon] || (kind === ' egg' ? ICON.star : (kind === ' warn' ? ICON.warn : ICON.info));
    el('span', 'tx', n, text);
    var rec = { node: n, life: (ms || 3200) / 1000 };
    toastList.push(rec);
    /* let layout settle, then transition in */
    setTimeout(function () { cls(n, 'in', true); }, 16);
    while (toastList.length > 4) {
      var old = toastList.shift();
      kill(old.node);
    }
    sfx(kind === ' egg' ? 'success' : 'clickSoft');
  };

  UI.hint = function (text, ms) {
    if (!D.hint) return;
    if (!text) { cls(D.hint, 'in', false); hintTimer = 0; return; }
    /* [E] style tokens become styled keycaps */
    D.hint.innerHTML = '';
    var parts = String(text).split(/(\[[^\]]{1,12}\])/);
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (parts[i].charAt(0) === '[' && parts[i].charAt(parts[i].length - 1) === ']') {
        el('b', '', D.hint, parts[i].substring(1, parts[i].length - 1));
      } else {
        D.hint.appendChild(doc.createTextNode(parts[i]));
      }
    }
    cls(D.hint, 'in', true);
    hintTimer = (ms || 3600) / 1000;
  };

  UI.eggCounter = function (n, total) {
    eggState.n = n || 0;
    eggState.total = total || eggState.total;
    txt(D.eggsTxt, eggState.n + '/' + eggState.total);
    cls(D.eggs, 'in', eggState.n > 0);
  };

  UI.progress = function (label, t) {
    if (t == null) { cls(D.progress, 'in', false); return; }
    txt(D.progressLab, label || '');
    xf(D.progressFill, 'scaleX(' + clamp(t, 0, 1) + ')');
    cls(D.progress, 'in', true);
  };

  UI.loading = function (t, label) {
    if (!D.load) return;
    var v = clamp(t == null ? 0 : t, 0, 1);
    txt(D.loadLab, label || 'LOADING');
    xf(D.loadFill, 'scaleX(' + v + ')');
    if (v >= 1) {
      setTimeout(function () { cls(D.load, 'on', false); }, 260);
    } else {
      cls(D.load, 'on', true);
    }
  };

  /* ---- interact prompt / context button ---- */
  function setFocus(info) {
    focusInfo = info || null;
    var label = focusInfo ? (focusInfo.label || 'Use') : '';
    cls(D.retic, 'focus', !!focusInfo);
    cls(D.prompt, 'in', !!focusInfo && !STV.isTouch);
    if (focusInfo) {
      txt(D.promptTxt, label);
      txt(D.promptKey, String(focusInfo.key || 'e').toUpperCase());
      txt(D.actLbl, label);
      if (!has(D.actBtn, 'hot')) sfx('uiHover');
    }
    cls(D.actBtn, 'hot', !!focusInfo);
  }

  /* =========================================================================
   * 9.  Cinematic / dialogue
   * =====================================================================*/

  var SPEAKERS = {
    steve: 'STEVE', ellis: 'MS. ELLIS', oleg: 'OLEG', halloran: 'HALLORAN',
    petr: 'GUARD', kestrel: 'KESTREL', dispatch: 'DISPATCH', narr: '',
    cat: 'KERNEL', duck: 'THE DUCK', phone: 'PHONE', pa: 'ANNOUNCEMENT'
  };
  var subTimer = 0;

  UI.subtitle = function (speaker, text, ms) {
    if (!D.subs) return;
    if (!text) { cls(D.subs, 'in', false); subTimer = 0; return; }
    if (settings().subs === false) { subTimer = 0; cls(D.subs, 'in', false); return; }
    var key = speaker ? String(speaker).toLowerCase() : '';
    var name = SPEAKERS.hasOwnProperty(key) ? SPEAKERS[key] : String(speaker || '').toUpperCase();
    cls(D.subs, 'narr', key === 'narr' || key === '');
    cls(D.subs, 'nospk', !name);
    txt(D.subsWho, name);
    txt(D.subsLine, text);
    root.style.setProperty('--subScale', String(settings().subSize || 1));
    cls(D.subs, 'in', true);
    var dur = ms;
    if (!dur) {
      if (STV.Voice && STV.Voice.estimateMs) { try { dur = STV.Voice.estimateMs(text); } catch (e) {} }
      if (!dur) dur = Math.max(1700, String(text).length * 52);
    }
    subTimer = dur / 1000;
  };

  UI.choices = function (list, cb) {
    if (!D.choices) return;
    empty(D.choices);
    if (!list || !list.length) { cls(D.choices, 'on', false); choiceNodes = []; choiceCb = null; return; }
    choiceCb = cb || null;
    choiceNodes = [];
    choiceSel = 0;
    for (var i = 0; i < list.length; i++) {
      (function (item, idx) {
        var b = el('div', 'stv-choice', D.choices);
        el('span', 'n', b, String(idx + 1));
        el('span', 'tx', b, item.text || item.label || ('Option ' + (idx + 1)));
        press(b, null, function () { pickChoice(idx); }, { sfxName: 'uiConfirm' });
        on(b, 'mouseenter', function () { highlightChoice(idx); }, false);
        choiceNodes.push({ node: b, id: (item.id != null ? item.id : idx) });
        setTimeout(function () { cls(b, 'in', true); }, 40 + idx * 70);
      })(list[i], i);
    }
    cls(D.choices, 'on', true);
    highlightChoice(0);
  };

  var choiceNodes = [], choiceCb = null, choiceSel = 0;

  function highlightChoice(i) {
    choiceSel = clamp(i, 0, choiceNodes.length - 1);
    for (var k = 0; k < choiceNodes.length; k++) cls(choiceNodes[k].node, 'sel', k === choiceSel);
  }
  function pickChoice(i) {
    if (!choiceNodes.length) return;
    var rec = choiceNodes[clamp(i, 0, choiceNodes.length - 1)];
    var cb = choiceCb;
    choiceCb = null;
    cls(D.choices, 'on', false);
    setTimeout(function () { empty(D.choices); }, 60);
    var nodes = choiceNodes;
    choiceNodes = [];
    if (nodes.length && cb) { try { cb(rec.id); } catch (e) { STV.warn(e); } }
  }
  UI.choiceKey = function (lower) {
    if (!choiceNodes.length) return false;
    if (lower === 'arrowup' || lower === 'w') { highlightChoice(choiceSel - 1); sfx('uiHover'); return true; }
    if (lower === 'arrowdown' || lower === 's') { highlightChoice(choiceSel + 1); sfx('uiHover'); return true; }
    if (lower === 'enter' || lower === ' ' || lower === 'e') { pickChoice(choiceSel); return true; }
    var n = parseInt(lower, 10);
    if (!isNaN(n) && n >= 1 && n <= choiceNodes.length) { pickChoice(n - 1); return true; }
    return false;
  };

  UI.letterbox = function (onFlag, ms) {
    if (!D.lb) return;
    var d = (ms == null ? 550 : ms) / 1000;
    var bars = D.lb.getElementsByTagName('i');
    for (var i = 0; i < bars.length; i++) bars[i].style.transitionDuration = d + 's';
    cls(D.lb, 'on', !!onFlag);
  };

  var fadeAnim = null;
  UI.fade = function (to, ms) {
    var d = STV.defer ? STV.defer() : null;
    var dur = (ms == null ? 500 : ms);
    var from = parseFloat(D.fade.style.opacity || '0') || 0;
    var target = clamp(to == null ? 1 : to, 0, 1);
    D.fade.style.pointerEvents = target > 0.94 ? 'auto' : 'none';
    if (fadeAnim) fadeAnim.dead = true;
    if (dur <= 0) {
      D.fade.style.opacity = String(target);
      if (d) d.resolve(true);
      return d ? d.promise : { then: function (f) { f(true); return this; } };
    }
    fadeAnim = { from: from, to: target, t: 0, dur: dur / 1000, dead: false, done: function () { if (d) d.resolve(true); } };
    return d ? d.promise : { then: function (f) { f(true); return this; } };
  };

  var flashAnim = null;
  UI.flash = function (color, ms) {
    if (!D.flash) return;
    D.flash.style.background = color || '#ffffff';
    flashAnim = { t: 0, dur: Math.max(0.05, (ms || 220) / 1000) };
    D.flash.style.opacity = '1';
  };

  UI.vignette = function (v) {
    if (!D.vig) return;
    D.vig.style.opacity = String(clamp(v || 0, 0, 1));
  };

  UI.alarm = function (level) {
    alarmLevel = clamp(level || 0, 0, 3);
    cls(D.alarmFx, 'p1', alarmLevel === 1);
    cls(D.alarmFx, 'p2', alarmLevel === 2);
    cls(D.alarmFx, 'p3', alarmLevel >= 3);
    cls(D.alarmBar, 'on', alarmLevel > 0);
    txt(D.alarmTxt, alarmLevel === 1 ? 'SUSPICIOUS' : (alarmLevel === 2 ? 'SEARCHING' : 'ALARM'));
    if (alarmLevel >= 2) buzz(alarmLevel >= 3 ? [30, 60, 30] : 25);
  };

  /* =========================================================================
   * 10.  Frame update
   * =====================================================================*/

  var lastExternalTick = 0;
  var internalLast = 0;

  function frameUpdate(dt) {
    if (!root) return;
    if (dt > 0.1) dt = 0.1;

    /* toasts */
    for (var i = toastList.length - 1; i >= 0; i--) {
      var t = toastList[i];
      t.life -= dt;
      if (t.life <= 0) {
        cls(t.node, 'in', false);
        var nd = t.node;
        setTimeout(function () { kill(nd); }, 320);
        toastList.splice(i, 1);
      }
    }

    /* hint */
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) cls(D.hint, 'in', false);
    }

    /* subtitle */
    if (subTimer > 0) {
      subTimer -= dt;
      if (subTimer <= 0) cls(D.subs, 'in', false);
    }

    /* completed objective fades away */
    if (objTimer > 0) {
      objTimer -= dt;
      if (objTimer <= 0) cls(D.obj, 'in', false);
    }

    /* fade */
    if (fadeAnim && !fadeAnim.dead) {
      fadeAnim.t += dt;
      var k = clamp(fadeAnim.t / fadeAnim.dur, 0, 1);
      var e = k * k * (3 - 2 * k);
      D.fade.style.opacity = String(lerp(fadeAnim.from, fadeAnim.to, e));
      if (k >= 1) {
        D.fade.style.pointerEvents = fadeAnim.to > 0.94 ? 'auto' : 'none';
        var f = fadeAnim; fadeAnim = null;
        if (f.done) f.done();
      }
    }

    /* flash */
    if (flashAnim) {
      flashAnim.t += dt;
      var fk = clamp(flashAnim.t / flashAnim.dur, 0, 1);
      D.flash.style.opacity = String((1 - fk) * (1 - fk));
      if (fk >= 1) { flashAnim = null; D.flash.style.opacity = '0'; }
    }

    /* look inertia (touch glide) */
    if (!touchLook.active && (Math.abs(lookVel.x) > 0.0001 || Math.abs(lookVel.y) > 0.0001)) {
      if (mode === 'play' && !paused && !mgActive) {
        IN.look.x += lookVel.x * dt;
        IN.look.y += lookVel.y * dt;
      }
      var decay = Math.exp(-9.5 * dt);
      lookVel.x *= decay; lookVel.y *= decay;
      if (Math.abs(lookVel.x) < 0.0002) lookVel.x = 0;
      if (Math.abs(lookVel.y) < 0.0002) lookVel.y = 0;
    }

    /* minigame */
    if (mgActive && mgActive.update) {
      try { mgActive.update(dt); } catch (er) { STV.warn('[mg]', er); }
    }

    /* clear latched edge flags — this runs AFTER the player has consumed them */
    IN.jump = false;
    IN.use = false;
    IN.alt = false;
    IN.pause = false;
  }

  UI.tick = function (dt) {
    lastExternalTick = now();
    frameUpdate(typeof dt === 'number' ? dt : 0.016);
  };

  function internalLoop() {
    if (!root) return;
    window.requestAnimationFrame(internalLoop);
    var t = now();
    var dt = internalLast ? (t - internalLast) / 1000 : 0.016;
    internalLast = t;
    /* only drive things ourselves if the game loop is not ticking us */
    if (t - lastExternalTick > 220) frameUpdate(dt);
  }

  /* =========================================================================
   * 11.  Bus wiring
   * =====================================================================*/

  function wire() {
    offs.push(bind('objective:set', function (p) { if (p) UI.objective(p.text, p.sub); }));
    offs.push(bind('objective:done', function (p) { UI.objectiveDone(p && p.text); }));
    offs.push(bind('hint', function (p) { if (p) UI.hint(p.text, p.ms); }));
    offs.push(bind('toast', function (p) { if (p) UI.toast(p.text, p.icon, p.ms); }));
    offs.push(bind('dialogue:line', function (p) {
      if (p) UI.subtitle(p.speaker || p.who, p.text, p.ms);
    }));
    offs.push(bind('dialogue:end', function () { UI.subtitle(null, null); }));
    offs.push(bind('dialogue:choices', function (p) {
      if (p && p.list) UI.choices(p.list, p.cb);
    }));
    offs.push(bind('interact:focus', function (p) { setFocus(p); }));
    offs.push(bind('alarm', function (p) { UI.alarm(p ? p.level : 0); }));
    offs.push(bind('player:detected', function (p) {
      UI.flash('rgba(255,70,55,0.55)', 260);
      UI.toast('Spotted' + (p && p.by ? ' — ' + p.by : ''), 'warn', 2400);
    }));
    offs.push(bind('egg:found', function (p) {
      if (!p) return;
      UI.eggCounter(p.count, p.total);
      UI.toast(p.name || p.id, 'egg', 3400);
    }));
    offs.push(bind('cine:start', function () {
      cineOn = true;
      UI.letterbox(true, 600);
      cls(D.skipCine, 'on', true);
      cls(D.hud, 'on', false);
      cls(D.touch, 'on', false);
      setFocus(null);
    }));
    offs.push(bind('cine:end', function () {
      cineOn = false;
      UI.letterbox(false, 500);
      cls(D.skipCine, 'on', false);
      UI.subtitle(null, null);
      applyMode();
    }));
    offs.push(bind('level:load', function () { setFocus(null); UI.progress(null, null); }));
    offs.push(bind('level:ready', function () { UI.eggCounter(STV.eggCount ? STV.eggCount() : 0, eggState.total); }));
    offs.push(bind('game:state', function (p) {
      if (p && p.state === 'play') { paused = false; }
    }));
    offs.push(bind('settings:changed', function () { applySettings(); }));
    offs.push(bind('ui:progress', function (p) { if (p) UI.progress(p.label, p.t); }));
    offs.push(bind('ui:vignette', function (p) { UI.vignette(p ? p.v : 0); }));
  }

  function applySettings() {
    var s = settings();
    if (root) {
      cls(root, 'hc', !!s.contrast);
      root.style.setProperty('--subScale', String(s.subSize || 1));
    }
    if (STV.Audio && STV.Audio.setVolume) {
      try {
        STV.Audio.setVolume('master', s.master);
        STV.Audio.setVolume('sfx', s.sfx);
        STV.Audio.setVolume('music', s.music);
        STV.Audio.setVolume('voice', s.voice);
      } catch (e) {}
    }
    if (STV.Voice && STV.Voice.setEnabled) { try { STV.Voice.setEnabled(!!s.voiceOn); } catch (e) {} }
  }

  /* =========================================================================
   * 12.  init
   * =====================================================================*/

  UI.init = function (container) {
    if (started) return;
    started = true;
    host = container || doc.body;
    injectStyle();
    build();
    setupTouch();
    setupDesktop();
    wire();
    buildPauseScreen();
    buildSettings();
    applySettings();
    UI.eggCounter(STV.eggCount ? STV.eggCount() : 0, eggState.total);
    vw = window.innerWidth; vh = window.innerHeight;
    applyMode();
    internalLast = now();
    window.requestAnimationFrame(internalLoop);
    STV.log('[ui] init', { touch: STV.isTouch, mobile: STV.isMobile });
  };

  /* =========================================================================
   * 13.  Title screen
   * =====================================================================*/

  UI.showTitle = function (cb) {
    titleCb = cb || null;
    empty(D.title);
    var inner = el('div', 'inner', D.title);
    el('div', 'kicker', inner, 'A quiet man · a small shop · one job');
    var h1 = el('h1', '', inner);
    h1.innerHTML = 'STEVE<br><em>THE PC REPAIR MAN</em>';
    el('div', 'sub', inner, 'Kilbride Computer Repair — est. 2003');
    el('div', 'scan', inner);

    var menu = el('div', 'menu', inner);
    var b1 = el('button', 'stv-btn pri', menu, 'Start');
    var b2 = el('button', 'stv-btn', menu, 'Settings');
    var b3 = el('button', 'stv-btn ghost', menu, 'Controls');

    press(b1, null, function () { startGame(); }, { sfxName: 'uiConfirm' });
    press(b2, null, function () { openSettings(); }, { sfxName: 'click' });
    press(b3, null, function () { showControls(); }, { sfxName: 'click' });

    var foot = el('div', 'foot', inner);
    foot.textContent = 'v' + (STV.VERSION || '1.0') + ' · ' +
      (STV.isTouch ? 'TOUCH: LEFT THUMB MOVES · RIGHT THUMB LOOKS' : 'WASD MOVE · MOUSE LOOK · E USE · SHIFT RUN · CTRL CROUCH · ESC PAUSE') +
      ' · EGGS ' + (STV.eggCount ? STV.eggCount() : 0) + '/' + eggState.total;

    cls(D.title, 'on', true);
    mode = 'title';
    applyMode();
  };

  function startGame() {
    cls(D.title, 'on', false);
    if (STV.Audio && STV.Audio.init) { try { STV.Audio.init(); } catch (e) {} }
    if (STV.Voice && STV.Voice.init) { try { STV.Voice.init(); } catch (e) {} }
    var cb = titleCb; titleCb = null;
    if (cb) { try { cb({}); } catch (e) { STV.warn(e); } }
  }

  function showControls() {
    var lines = STV.isTouch ? [
      ['Left thumb', 'Anywhere on the left half — the stick appears under your thumb.'],
      ['Right thumb', 'Drag to look. A quick tap uses whatever you are pointing at.'],
      ['Bottom right', 'The big ring is Interact. It lights up when something is there.'],
      ['Small buttons', 'Crouch (toggle), Run (hold), Jump.'],
      ['Pause', 'The bar icon, top right. Settings is the gear.']
    ] : [
      ['W A S D', 'Move'],
      ['Mouse', 'Look — click the world once to capture the pointer'],
      ['E / F', 'Use, examine, talk'],
      ['Shift', 'Run'],
      ['Ctrl / C', 'Crouch'],
      ['Space', 'Jump'],
      ['Q', 'Secondary action'],
      ['Esc', 'Pause']
    ];
    var body = el('div', 'stv-card');
    var hd = el('div', 'hd', body);
    el('h2', '', hd, 'Controls');
    el('div', 'tag', hd, 'REF 04-C');
    for (var i = 0; i < lines.length; i++) {
      var r = el('div', 'stv-set-row', body);
      var nm = el('div', 'nm', r, lines[i][1]);
      if (nm) nm.style.order = '2';
      var kk = el('div', 'vl stv-mono', r, lines[i][0]);
      if (kk) { kk.style.minWidth = '92px'; kk.style.textAlign = 'left'; kk.style.order = '1'; kk.style.color = 'var(--amber)'; }
    }
    var close = el('button', 'stv-btn', body, 'Back');
    close.style.marginTop = '16px'; close.style.width = '100%';
    modal(body, close);
  }

  /* =========================================================================
   * 14.  Generic modal
   * =====================================================================*/

  function modal(cardNode, closeBtn) {
    var scr = el('div', 'stv-screen', root);
    var inner = el('div', 'inner stv-panel', scr);
    inner.appendChild(cardNode);
    cls(scr, 'on', true);
    function close() {
      cls(scr, 'on', false);
      setTimeout(function () { kill(scr); }, 120);
    }
    if (closeBtn) press(closeBtn, null, close, { sfxName: 'uiBack' });
    return { close: close, node: scr };
  }

  /* =========================================================================
   * 15.  Pause menu
   * =====================================================================*/

  function buildPauseScreen() {
    empty(D.pauseScreen);
    var inner = el('div', 'inner stv-panel', D.pauseScreen);
    var card = el('div', 'stv-card', inner);
    var hd = el('div', 'hd', card);
    el('h2', '', hd, 'Paused');
    el('div', 'tag', hd, 'SYSTEM HOLD');
    var rows = el('div', 'rows', card);

    var bResume = el('button', 'stv-btn pri', rows);
    bResume.innerHTML = ICON.play + '<span>Resume</span>';
    var bSet = el('button', 'stv-btn', rows);
    bSet.innerHTML = ICON.gear + '<span>Settings</span>';
    var bCtl = el('button', 'stv-btn', rows);
    bCtl.innerHTML = ICON.key + '<span>Controls</span>';
    var bTitle = el('button', 'stv-btn ghost', rows);
    bTitle.innerHTML = ICON.close + '<span>Back to title</span>';

    press(bResume, null, function () { UI.pause(false); }, { sfxName: 'uiConfirm' });
    press(bSet, null, function () { openSettings(); }, { sfxName: 'click' });
    press(bCtl, null, function () { showControls(); }, { sfxName: 'click' });
    press(bTitle, null, function () {
      UI.pause(false);
      emit('ui:quit', {});
      if (STV.Game && STV.Game.setState) { try { STV.Game.setState('title'); } catch (e) {} }
      UI.showTitle(titleCb || function () { if (STV.Game && STV.Game.start) STV.Game.start({}); });
    }, { sfxName: 'uiBack' });

    var tip = el('div', '', card, STV.isTouch ? 'Tap outside to resume.' : 'ESC resumes.');
    tip.className = 'stv-h';
    tip.style.marginTop = '14px';
    tip.style.textAlign = 'center';

    press(D.pauseScreen, null, function (e) {
      if (e && e.target === D.pauseScreen) UI.pause(false);
    }, { sfx: false, buzz: false, alsoMouse: true });
  }

  UI.pause = function (showIt) {
    var want = !!showIt;
    if (want === paused) { cls(D.pauseScreen, 'on', want); return; }
    paused = want;
    cls(D.pauseScreen, 'on', paused);
    if (paused) {
      clearKeys();
      stickEnd();
      if (lockEl()) exitLock();
      sfx('uiBack');
    } else {
      cls(D.setScreen, 'on', false);
      sfx('uiConfirm');
      if (!STV.isTouch && mode === 'play') requestLock();
    }
    emit('ui:pause', { paused: paused });
    if (STV.Audio && STV.Audio.duckFor && paused) { try { STV.Audio.duckFor(200); } catch (e) {} }
  };
  UI.isPaused = function () { return paused; };

  /* =========================================================================
   * 16.  Settings panel
   * =====================================================================*/

  var setRows = {};

  function rowSlider(parent, key, label, min, max, step, fmt) {
    var r = el('div', 'stv-set-row', parent);
    el('div', 'nm', r, label);
    var inp = doc.createElement('input');
    inp.type = 'range';
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(settings()[key]);
    r.appendChild(inp);
    var v = el('div', 'vl', r, fmt ? fmt(settings()[key]) : String(settings()[key]));
    function upd() {
      var val = parseFloat(inp.value);
      settings()[key] = val;
      txt(v, fmt ? fmt(val) : String(val));
      saveSettings();
      applySettings();
    }
    on(inp, 'input', upd, false);
    on(inp, 'change', function () { upd(); sfx('clickSoft'); }, false);
    setRows[key] = { input: inp, val: v, fmt: fmt };
    return r;
  }

  function rowToggle(parent, key, label, onChange) {
    var r = el('div', 'stv-set-row', parent);
    el('div', 'nm', r, label);
    var t = el('div', 'stv-tog', r);
    el('i', '', t);
    cls(t, 'on', !!settings()[key]);
    press(t, null, function () {
      settings()[key] = !settings()[key];
      cls(t, 'on', !!settings()[key]);
      saveSettings();
      applySettings();
      if (onChange) { try { onChange(settings()[key]); } catch (e) {} }
    }, { sfxName: 'click' });
    setRows[key] = { tog: t };
    return r;
  }

  function rowSeg(parent, key, label, options, onChange) {
    var r = el('div', 'stv-set-row', parent);
    el('div', 'nm', r, label);
    var seg = el('div', 'stv-seg', r);
    var btns = [];
    function sync() {
      for (var i = 0; i < btns.length; i++) cls(btns[i].b, 'on', btns[i].v === settings()[key]);
    }
    for (var i = 0; i < options.length; i++) {
      (function (opt) {
        var b = el('button', '', seg, opt.label);
        btns.push({ b: b, v: opt.value });
        press(b, null, function () {
          settings()[key] = opt.value;
          sync(); saveSettings(); applySettings();
          if (onChange) { try { onChange(opt.value); } catch (e) {} }
        }, { sfxName: 'click' });
      })(options[i]);
    }
    sync();
    setRows[key] = { sync: sync };
    return r;
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function buildSettings() {
    empty(D.setScreen);
    var inner = el('div', 'inner stv-panel', D.setScreen);
    var card = el('div', 'stv-card', inner);
    var hd = el('div', 'hd', card);
    el('h2', '', hd, 'Settings');
    el('div', 'tag', hd, 'CAL 1.0');

    el('div', 'stv-h', card, 'AUDIO');
    rowSlider(card, 'master', 'Master volume', 0, 1, 0.05, pct);
    rowSlider(card, 'sfx', 'Effects', 0, 1, 0.05, pct);
    rowSlider(card, 'music', 'Music', 0, 1, 0.05, pct);
    rowSlider(card, 'voice', 'Voice', 0, 1, 0.05, pct);
    rowToggle(card, 'voiceOn', 'Spoken dialogue');

    var r1 = el('div', 'stv-rule', card);
    if (r1) r1.style.marginTop = '14px';
    el('div', 'stv-h', card, 'READABILITY');
    rowToggle(card, 'subs', 'Subtitles');
    rowSlider(card, 'subSize', 'Subtitle size', 0.8, 1.8, 0.1, function (v) { return v.toFixed(1) + 'x'; });
    rowToggle(card, 'contrast', 'High contrast targets');
    rowToggle(card, 'motion', 'Camera motion & shake');

    el('div', 'stv-rule', card);
    el('div', 'stv-h', card, 'CONTROL');
    rowToggle(card, 'invertY', 'Invert vertical look');
    rowSlider(card, 'sens', 'Look sensitivity', 0.3, 2.5, 0.05, function (v) { return v.toFixed(2); });

    el('div', 'stv-rule', card);
    el('div', 'stv-h', card, 'PERFORMANCE');
    rowSeg(card, 'quality', 'Quality', [
      { label: 'Low', value: 'low' }, { label: 'Med', value: 'med' }, { label: 'High', value: 'high' }
    ], function (v) { STV.quality = v; emit('quality:changed', { quality: v }); });

    /* catmode only appears once every egg is found */
    D.catRow = el('div', '', card);
    refreshCatRow();

    var close = el('button', 'stv-btn pri', card, 'Done');
    close.style.marginTop = '18px'; close.style.width = '100%';
    press(close, null, function () { closeSettings(); }, { sfxName: 'uiConfirm' });

    press(D.setScreen, null, function (e) {
      if (e && e.target === D.setScreen) closeSettings();
    }, { sfx: false, buzz: false, alsoMouse: true });
  }

  function refreshCatRow() {
    if (!D.catRow) return;
    empty(D.catRow);
    var all = true;
    if (STV.EGGS && STV.progress) {
      for (var i = 0; i < STV.EGGS.length; i++) {
        if (STV.EGGS[i] === 'catmode') continue;
        if (!STV.progress.eggs[STV.EGGS[i]]) { all = false; break; }
      }
    } else all = false;
    if (!all) return;
    el('div', 'stv-rule', D.catRow);
    el('div', 'stv-h', D.catRow, 'CLASSIFIED');
    rowToggle(D.catRow, 'catmode', 'Cat mode', function (v) {
      emit('catmode', { on: !!v });
      if (v && STV.egg) STV.egg('catmode', 'Cat mode');
      UI.toast(v ? 'Everyone is a cat now.' : 'Nobody is a cat any more.', 'cat', 3000);
    });
  }

  function openSettings() {
    refreshCatRow();
    for (var k in setRows) {
      if (!Object.prototype.hasOwnProperty.call(setRows, k)) continue;
      var r = setRows[k];
      if (r.input) { r.input.value = String(settings()[k]); txt(r.val, r.fmt ? r.fmt(settings()[k]) : String(settings()[k])); }
      if (r.tog) cls(r.tog, 'on', !!settings()[k]);
      if (r.sync) r.sync();
    }
    cls(D.setScreen, 'on', true);
    if (lockEl()) exitLock();
  }
  function closeSettings() {
    cls(D.setScreen, 'on', false);
    saveSettings();
    if (!paused && mode === 'play' && !STV.isTouch) requestLock();
  }
  UI.settingsPanel = function (showIt) { if (showIt === false) closeSettings(); else openSettings(); };

  /* =========================================================================
   * 17.  End / credits
   * =====================================================================*/

  var ENDINGS = {
    purge: {
      badge: 'ENDING · ASH',
      title: 'He <em>burned it all</em>',
      blurb: 'Every ledger, every file, every name. Including his own. Kestrel went dark at 04:11 ' +
             'and a man with no record walked out into the rain in Zbraslav. On Tuesday, someone ' +
             'who looks a lot like Steve opens a small shop in Kilbride. The kettle still works.'
    },
    copy: {
      badge: 'ENDING · CARRY',
      title: 'He <em>took it with him</em>',
      blurb: 'One floppy, one file, one life documented down to the cat\'s name. He never reads it. ' +
             'It sits in the drawer under the till, beside a rubber duck and a spare CR2032, and ' +
             'every so often he checks that it is still there.'
    },
    walk: {
      badge: 'ENDING · QUIET',
      title: 'He <em>went home</em>',
      blurb: 'The job was finished the moment he decided it was. Prague kept its secrets. ' +
             'Ms. Ellis\'s tower kept its clock. Some men are only ever as complicated as their Tuesday.'
    }
  };

  UI.showEnd = function (endingId, eggCount, eggTotal) {
    mode = 'end';
    applyMode();
    cls(D.hud, 'on', false);
    cls(D.touch, 'on', false);
    cls(D.mg, 'on', false);
    UI.subtitle(null, null);
    UI.letterbox(false, 300);
    UI.alarm(0);
    var info = ENDINGS[endingId] || ENDINGS.walk;
    var n = eggCount == null ? (STV.eggCount ? STV.eggCount() : 0) : eggCount;
    var tot = eggTotal || eggState.total;

    empty(D.end);
    var inner = el('div', 'inner', D.end);
    el('div', 'badge', inner, info.badge);
    var h = el('h2', '', inner);
    h.innerHTML = info.title;
    el('div', 'blurb', inner, info.blurb);

    el('div', 'eggline', inner, 'CURIOSITIES FOUND  ' + n + ' / ' + tot);
    var bar = el('div', 'eggbar', inner);
    var fill = el('i', '', bar);
    xf(fill, 'scaleX(' + (tot ? n / tot : 0) + ')');

    if (n >= tot && tot > 0) {
      var allm = el('div', 'eggline', inner, 'ALL FOUND — CAT MODE UNLOCKED IN SETTINGS');
      if (allm) allm.style.color = 'var(--amber)';
    }

    var crew = el('div', 'crew', inner);
    crew.innerHTML =
      '<b>STEVE THE PC REPAIR MAN</b><br>' +
      'WORLD, PROPS &amp; PEOPLE — GENERATED AT RUNTIME<br>' +
      'SOUND &amp; MUSIC — SYNTHESISED, NO SAMPLES<br>' +
      'EVERY PIXEL DRAWN BY CODE<br>' +
      '<br><b>FOR HAROLD</b>';

    var menu = el('div', 'menu', inner);
    var b1 = el('button', 'stv-btn pri', menu, 'Back to title');
    var b2 = el('button', 'stv-btn ghost', menu, 'Settings');
    press(b1, null, function () {
      cls(D.end, 'on', false);
      UI.showTitle(titleCb || function () { if (STV.Game && STV.Game.start) STV.Game.start({}); });
    }, { sfxName: 'uiConfirm' });
    press(b2, null, function () { openSettings(); }, { sfxName: 'click' });

    cls(D.end, 'on', true);
    if (STV.Audio && STV.Audio.music) { try { STV.Audio.music('epilogue', 2000); } catch (e) {} }
  };

  /* =========================================================================
   * 18.  Minigame shell
   * =====================================================================*/

  var mgActive = null;
  var mgPrevMode = 'play';

  var MG_FRAME = {
    cmos:     ['CMOS-01', 'The clock keeps forgetting the year. That is a three-volt problem.'],
    dossier:  ['FILE-07', 'Thirty-four thousand feet. Nobody reads over your shoulder up here.'],
    security: ['SEC-02',  'Everything in the roll is a tool. It only becomes a weapon on the screen.'],
    badge:    ['RF-11',   'Three traces. Match them and the door thinks you work here.'],
    wires:    ['HRN-03',  'Live harness. Probe first. Guessing sets off the room.'],
    terminal: ['KES-00',  'It answers. That is already more than the brief said it would do.'],
    solder:   ['IRON-05', 'Follow the joint. Steady. Heat is a budget, not a setting.'],
    lockpick: ['SVC-09',  'Service door. Tension low, pick high, listen for the give.'],
    panic:    ['EXF-12',  'The building has noticed. Keep the rhythm and keep moving.']
  };

  function mgFinish(ok) {
    if (!mgActive) return;
    var d = mgActive.done;
    var g = mgActive;
    mgActive = null;
    if (g.dispose) { try { g.dispose(); } catch (e) {} }
    cls(D.mg, 'on', false);
    setTimeout(function () { if (!mgActive) empty(D.mg); }, 140);
    mode = mgPrevMode;
    applyMode();
    sfx(ok ? 'success' : 'uiBack');
    if (d) { try { d(!!ok); } catch (e) { STV.warn('[mg done]', e); } }
  }

  function mgCanvas(parent, w, h) {
    var cv = doc.createElement('canvas');
    cv.style.width = '100%';
    parent.appendChild(cv);
    var ctx = cv.getContext('2d');
    var o = { cv: cv, ctx: ctx, w: w, h: h, dpr: 1 };
    o.fit = function () {
      var cw = cv.clientWidth || w;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      o.dpr = dpr;
      o.w = cw; o.h = h;
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    o.fit();
    return o;
  }

  /* pointer helper for canvases: gives local coords for mouse + touch */
  function canvasPointer(cv, handlers) {
    function local(cx, cy) {
      var r = cv.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    }
    var downId = null;
    on(cv, 'touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      downId = t.identifier;
      var p = local(t.clientX, t.clientY);
      if (handlers.down) handlers.down(p.x, p.y);
    }, { passive: false });
    on(cv, 'touchmove', function (e) {
      e.preventDefault();
      var ts = e.changedTouches;
      for (var i = 0; i < ts.length; i++) {
        if (ts[i].identifier !== downId) continue;
        var p = local(ts[i].clientX, ts[i].clientY);
        if (handlers.move) handlers.move(p.x, p.y);
      }
    }, { passive: false });
    function endT(e) {
      e.preventDefault();
      downId = null;
      if (handlers.up) handlers.up();
    }
    on(cv, 'touchend', endT, { passive: false });
    on(cv, 'touchcancel', endT, { passive: false });
    on(cv, 'mousedown', function (e) {
      e.preventDefault();
      var p = local(e.clientX, e.clientY);
      downId = -1;
      if (handlers.down) handlers.down(p.x, p.y);
    }, false);
    on(window, 'mousemove', function (e) {
      if (downId !== -1 && !handlers.hover) return;
      var p = local(e.clientX, e.clientY);
      if (downId === -1 && handlers.move) handlers.move(p.x, p.y);
      else if (handlers.hover) handlers.hover(p.x, p.y);
    }, false);
    on(window, 'mouseup', function () {
      if (downId !== -1) return;
      downId = null;
      if (handlers.up) handlers.up();
    }, false);
  }

  /* drag helper for absolutely positioned DOM pieces */
  function draggable(node, onStart, onMove, onEnd) {
    var id = null, sx = 0, sy = 0;
    function pt(e) {
      if (e.changedTouches && e.changedTouches.length) {
        var ts = e.changedTouches;
        for (var i = 0; i < ts.length; i++) if (id === null || ts[i].identifier === id) return ts[i];
        return null;
      }
      return e;
    }
    function begin(e) {
      var p = pt(e);
      if (!p) return;
      if (e.changedTouches) id = p.identifier; else id = -1;
      sx = p.clientX; sy = p.clientY;
      if (onStart) onStart(p.clientX, p.clientY);
    }
    function move(e) {
      if (id === null) return;
      var p = pt(e);
      if (!p) return;
      if (e.preventDefault) { try { e.preventDefault(); } catch (er) {} }
      if (onMove) onMove(p.clientX, p.clientY, p.clientX - sx, p.clientY - sy);
    }
    function end() {
      if (id === null) return;
      id = null;
      if (onEnd) onEnd();
    }
    on(node, 'touchstart', function (e) { e.preventDefault(); e.stopPropagation(); begin(e); }, { passive: false });
    on(window, 'touchmove', move, { passive: false });
    on(window, 'touchend', end, { passive: false });
    on(window, 'touchcancel', end, { passive: false });
    on(node, 'mousedown', function (e) { e.preventDefault(); e.stopPropagation(); begin(e); }, false);
    on(window, 'mousemove', move, false);
    on(window, 'mouseup', end, false);
  }

  UI.minigame = function (id, opts, done) {
    if (mgActive) { try { mgFinish(false); } catch (e) {} }
    opts = opts || {};
    var builder = MG[id];
    if (!builder) {
      STV.warn('[ui] unknown minigame', id);
      if (done) done(true);
      return;
    }

    mgPrevMode = (mode === 'minigame') ? 'play' : mode;
    mode = 'minigame';
    applyMode();
    setFocus(null);
    clearKeys(); stickEnd();
    if (lockEl()) exitLock();

    empty(D.mg);
    var frame = el('div', 'frame', D.mg);
    var top = el('div', 'top', frame);
    var meta = MG_FRAME[id] || [id.toUpperCase(), ''];
    el('div', 'id', top, meta[0]);
    el('div', 'fic', top, opts.framing || meta[1]);
    var x = el('div', 'x', top);
    x.innerHTML = ICON.close;

    var body = el('div', 'body stv-' + (MG_CLASS[id] || id), frame);
    var bot = el('div', 'bot', frame);
    var status = el('div', 'status', bot, '');
    var extra = el('div', 'x-btns', bot);
    extra.style.display = 'flex';
    extra.style.gap = '8px';
    var skip = el('button', 'stv-btn ghost skip', bot, 'Skip this');

    var fails = 0;
    var api = {
      id: id,
      opts: opts,
      body: body,
      frame: frame,
      status: function (text, kind) {
        txt(status, text || '');
        cls(status, 'ok', kind === 'ok');
        cls(status, 'bad', kind === 'bad');
      },
      button: function (label, cb, klass) {
        var b = el('button', 'stv-btn ' + (klass || ''), extra, label);
        press(b, null, cb, { sfxName: 'click' });
        return b;
      },
      shake: function () {
        if (!motionOK()) return;
        cls(frame, 'shake', false);
        void frame.offsetWidth;
        cls(frame, 'shake', true);
        setTimeout(function () { cls(frame, 'shake', false); }, 340);
      },
      fail: function (msg) {
        fails++;
        api.status(msg || 'Failed.', 'bad');
        api.shake();
        buzz([18, 40, 18]);
        sfx('uiError');
        if (fails >= 2) cls(skip, 'on', true);
      },
      fails: function () { return fails; },
      win: function (msg) {
        api.status(msg || 'Done.', 'ok');
        buzz(24);
        sfx('success');
        setTimeout(function () { mgFinish(true); }, 620);
      },
      lose: function () { mgFinish(false); },
      close: function (ok) { mgFinish(!!ok); }
    };

    press(x, null, function () { mgFinish(false); }, { sfxName: 'uiBack' });
    press(skip, null, function () {
      UI.toast('Skipped — Steve did it off-screen.', 'info', 2600);
      mgFinish(true);
    }, { sfxName: 'uiConfirm' });
    if (opts.skippable === true) cls(skip, 'on', true);

    var game = null;
    try { game = builder(api); } catch (e) { STV.warn('[mg build]', id, e); }
    if (!game) game = {};
    game.id = id;
    game.done = done;
    mgActive = game;

    cls(D.mg, 'on', true);
    sfx('caseOpen');
  };

  var MG_CLASS = {
    cmos: 'cmos', dossier: 'dos', security: 'sec', badge: 'badge', wires: 'wires',
    terminal: 'term', solder: 'sol', lockpick: 'lock', panic: 'panic'
  };

  var MG = {};

  /*__APPEND__*/

  STV.log('ui loaded');
})();

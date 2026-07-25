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

  /*__APPEND__*/

  STV.log('ui loaded');
})();

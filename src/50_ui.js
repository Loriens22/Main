/* =====================================================================
 * 50_ui.js — SG.ui : HUD, subtitles, menus, overlays.
 *
 * Design language: thin monospace, hairline rules, one accent (#39d98a
 * phosphor green) on near-black, a faint scanline. A diagnostic overlay
 * printed by Steve's oscilloscope, not a video-game HUD.
 *
 * Rules honoured here:
 *   - every DOM node lives inside #ui, which is pointer-events:none;
 *     only genuinely interactive elements turn pointer events back on
 *   - update(dt) runs 60x/second and NEVER writes to the DOM unless a
 *     value actually changed
 *   - tap targets >= 44px, text >= 16px (13px floor for secondary labels)
 *   - safe-area insets on all four sides, portrait + landscape
 *   - full keyboard nav, focus trap, aria, prefers-reduced-motion
 * ===================================================================== */
(function (SG, W, D) {
  'use strict';

  var UI = SG.ui;

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function el(tag, cls, txt) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  function on(node, ev, fn, opts) { node.addEventListener(ev, fn, opts || false); }
  function fn_(o, k) { return o && typeof o[k] === 'function'; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function css(node, k, v) { node.style[k] = v; }

  function sfx(name, opts) {
    if (fn_(SG.audio, 'sfx')) { try { SG.audio.sfx(name, opts); } catch (e) { /* silent */ } }
  }
  function touchVisible(v) {
    if (fn_(SG.input, 'setTouchVisible')) {
      try { SG.input.setTouchVisible(!!v); } catch (e) { /* silent */ }
    }
  }
  function contextVerb(t) {
    if (fn_(SG.input, 'setContextVerb')) {
      try { SG.input.setContextVerb(t); } catch (e) { /* silent */ }
    }
  }

  var mqReduce = false;
  try {
    if (W.matchMedia) {
      var mq = W.matchMedia('(prefers-reduced-motion: reduce)');
      mqReduce = !!mq.matches;
      if (mq.addEventListener) {
        mq.addEventListener('change', function (e) { mqReduce = !!e.matches; applyMotion(); });
      } else if (mq.addListener) {
        mq.addListener(function (e) { mqReduce = !!e.matches; applyMotion(); });
      }
    }
  } catch (e) { /* ancient browser */ }

  function reduced() {
    return mqReduce || !!(SG.state && SG.state.settings && SG.state.settings.reduceMotion);
  }

  var SPEAKERS = {
    steve: 'STEVE', oleg: 'OLEG', ellis: 'MS. ELLIS', guard: 'GUARD',
    concierge: 'CONCIERGE', halcyon: 'HALCYON', pa: 'ANNOUNCEMENT',
    phone: 'PHONE', brandt: 'BRANDT', passenger: 'PASSENGER', cat: 'KERNEL',
    radio: 'RADIO', terminal: 'TERMINAL'
  };
  function speakerName(s) {
    if (!s) return '';
    return SPEAKERS[s] || String(s).toUpperCase();
  }

  var TAGLINES = [
    'No appointment necessary.',
    'Payment in full, up front.',
    'We fix what the other shops won’t.',
    'No parts ordered. No data lost.',
    'Yes, we still take floppies.',
    'The computer is not out of internet.'
  ];

  /* ------------------------------------------------------------------ */
  /* Stylesheet                                                          */
  /* ------------------------------------------------------------------ */

  var STYLE = [
    /* ---- root + tokens ------------------------------------------- */
    '.sg-root{position:absolute;inset:0;pointer-events:none;',
    '  --acc:#39d98a;--acc-hi:#8cf0c4;--acc-dim:#2a7d57;',
    '  --ink:#e9f5ef;--dim:#8fada0;--red:#ff6b6b;--amber:#ffc46b;',
    '  --bg:#04070a;--panel:rgba(4,8,7,.93);--line:rgba(57,217,138,.30);',
    '  --sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);',
    '  --sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);',
    '  --lb:0px;--tpad:0px;',
    '  font-family:inherit;font-size:16px;line-height:1.45;color:var(--ink);',
    '  -webkit-font-smoothing:antialiased;font-variant-ligatures:none;}',
    '.sg-root *{box-sizing:border-box;}',
    '.sg-root button{font:inherit;color:inherit;background:none;border:0;margin:0;',
    '  text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none;}',

    /* ---- focus ring ---------------------------------------------- */
    '.sg-root :focus{outline:none;}',
    '.sg-root :focus-visible,.sg-root.kb :focus{outline:2px solid var(--acc);',
    '  outline-offset:2px;border-radius:2px;}',

    /* ---- layers --------------------------------------------------- */
    '.sg-hud,.sg-subwrap,.sg-lbwrap,.sg-cardwrap,.sg-choicewrap,.sg-menulayer,',
    '.sg-scan,.sg-flash,.sg-fade{position:absolute;inset:0;pointer-events:none;}',
    '.sg-hud{z-index:1;transition:opacity .25s ease;}',
    '.sg-subwrap{z-index:2;}.sg-lbwrap{z-index:3;}.sg-cardwrap{z-index:4;}',
    '.sg-choicewrap{z-index:5;}.sg-menulayer{z-index:6;}',
    '.sg-scan{z-index:7;}.sg-flash{z-index:8;}.sg-fade{z-index:9;}',
    '.sg-root.menu-open .sg-hud{opacity:0;}',
    '.sg-root.hud-off .sg-hud,.sg-root.hud-off .sg-subwrap{display:none;}',

    /* ---- scanline signature --------------------------------------- */
    '.sg-scan{background:repeating-linear-gradient(180deg,',
    '  rgba(0,0,0,.20) 0px,rgba(0,0,0,.20) 1px,rgba(0,0,0,0) 1px,rgba(0,0,0,0) 3px);',
    '  opacity:.5;mix-blend-mode:multiply;}',
    '.sg-scan::after{content:"";position:absolute;inset:0;',
    '  background:radial-gradient(120% 100% at 50% 50%,rgba(0,0,0,0) 52%,rgba(0,0,0,.42) 100%);}',

    /* ---- generic panel chrome ------------------------------------- */
    '.sg-plate{background:var(--panel);border:1px solid var(--line);',
    '  box-shadow:0 0 0 1px rgba(0,0,0,.55),0 18px 60px rgba(0,0,0,.65);}',
    '.sg-lbl{font-size:11px;letter-spacing:.26em;color:var(--acc-dim);',
    '  text-transform:uppercase;}',

    /* ---- objectives ----------------------------------------------- */
    '.sg-obj{position:absolute;top:calc(var(--sat) + 14px);left:calc(var(--sal) + 16px);',
    '  max-width:min(46vw,340px);}',
    '.sg-obj .hd{font-size:11px;letter-spacing:.26em;color:var(--acc-dim);',
    '  padding-bottom:5px;border-bottom:1px solid rgba(57,217,138,.22);margin-bottom:7px;',
    '  text-shadow:0 1px 3px #000;}',
    '.sg-obj .it{display:flex;gap:8px;align-items:flex-start;font-size:14px;',
    '  color:var(--ink);padding:2px 0;text-shadow:0 1px 4px rgba(0,0,0,.95);',
    '  transition:opacity .35s ease,color .35s ease;}',
    '.sg-obj .it .mk{color:var(--acc);flex:0 0 auto;width:1.35em;}',
    '.sg-obj .it.done{color:var(--dim);opacity:.55;}',
    '.sg-obj .it.done .tx{text-decoration:line-through;}',
    '.sg-obj .it.done .mk{color:var(--acc-dim);}',
    '.sg-obj .it.tick{color:var(--acc-hi);opacity:1;}',
    '.sg-root.compact .sg-obj{max-width:min(62vw,300px);}',

    /* ---- timer ----------------------------------------------------- */
    '.sg-timer{position:absolute;top:calc(var(--sat) + 12px);left:50%;',
    '  transform:translateX(-50%);display:none;text-align:center;',
    '  padding:6px 14px;background:rgba(4,8,7,.72);border:1px solid var(--line);}',
    '.sg-timer .k{font-size:11px;letter-spacing:.26em;color:var(--acc-dim);}',
    '.sg-timer .v{font-size:24px;letter-spacing:.10em;color:var(--acc);',
    '  font-variant-numeric:tabular-nums;}',
    '.sg-timer.warn .v{color:var(--red);}',
    '.sg-timer.warn{border-color:rgba(255,107,107,.55);}',
    '.sg-timer.warn.pulse{background:rgba(60,8,8,.72);}',

    /* ---- toasts ---------------------------------------------------- */
    '.sg-toasts{position:absolute;top:calc(var(--sat) + 12px);right:calc(var(--sar) + 14px);',
    '  display:flex;flex-direction:column;align-items:flex-end;gap:8px;',
    '  max-width:min(62vw,340px);}',
    '.sg-toast{display:flex;gap:10px;align-items:center;padding:9px 13px;',
    '  background:rgba(4,8,7,.90);border:1px solid var(--line);',
    '  border-left:2px solid var(--acc);font-size:14px;color:var(--ink);',
    '  opacity:1;transform:translateX(0);transition:opacity .3s ease,transform .3s ease;}',
    '.sg-toast .ic{color:var(--acc);font-size:14px;}',
    '.sg-toast.in{opacity:0;transform:translateX(14px);}',
    '.sg-toast.out{opacity:0;transform:translateX(14px);}',
    '.sg-root.compact .sg-toasts{max-width:min(74vw,300px);}',
    /* On a narrow screen the objective list already owns the top-left
     * and the toast column is wide enough to cover it. Drop toasts
     * below the list instead of on top of it. */
    '@media (max-width:560px){.sg-toasts{top:auto;bottom:calc(var(--sab) + 190px);',
    'right:calc(var(--sar) + 12px);left:calc(var(--sal) + 12px);',
    'max-width:none;align-items:stretch;}}',

    /* ---- crosshair -------------------------------------------------- */
    '.sg-cross{position:absolute;left:50%;top:50%;width:16px;height:16px;',
    '  margin:-8px 0 0 -8px;display:none;}',
    '.sg-cross i{position:absolute;background:rgba(233,245,239,.75);',
    '  box-shadow:0 0 4px rgba(0,0,0,.9);}',
    '.sg-cross i.d{left:7px;top:7px;width:2px;height:2px;background:var(--acc);}',
    '.sg-cross i.l{left:0;top:7.5px;width:5px;height:1px;}',
    '.sg-cross i.r{right:0;top:7.5px;width:5px;height:1px;}',
    '.sg-cross i.t{top:0;left:7.5px;height:5px;width:1px;}',
    '.sg-cross i.b{bottom:0;left:7.5px;height:5px;width:1px;}',

    /* ---- prompt ----------------------------------------------------- */
    '.sg-prompt{position:absolute;left:50%;top:57%;transform:translateX(-50%);',
    '  display:none;align-items:center;gap:10px;padding:8px 15px;',
    '  background:rgba(4,8,7,.80);border:1px solid var(--line);',
    '  font-size:16px;letter-spacing:.06em;color:var(--ink);white-space:nowrap;',
    '  max-width:calc(100vw - 40px);overflow:hidden;text-overflow:ellipsis;}',
    '.sg-prompt .kbd{color:#04120c;background:var(--acc);padding:2px 7px;',
    '  font-size:13px;letter-spacing:.10em;flex:0 0 auto;}',
    '.sg-root.touch .sg-prompt{top:auto;bottom:calc(var(--sab) + var(--tpad) + 78px);}',

    /* ---- progress --------------------------------------------------- */
    '.sg-prog{position:absolute;left:50%;top:64%;transform:translateX(-50%);',
    '  display:none;width:min(280px,68vw);text-align:center;}',
    '.sg-prog .k{font-size:13px;letter-spacing:.20em;color:var(--acc);',
    '  margin-bottom:6px;text-shadow:0 1px 4px #000;}',
    '.sg-prog .tr{height:3px;background:rgba(57,217,138,.18);overflow:hidden;}',
    '.sg-prog .br{height:100%;width:0%;background:var(--acc);',
    '  box-shadow:0 0 10px rgba(57,217,138,.7);}',
    '.sg-root.touch .sg-prog{top:auto;bottom:calc(var(--sab) + var(--tpad) + 128px);}',

    /* ---- hint ------------------------------------------------------- */
    '.sg-hint{position:absolute;left:calc(var(--sal) + 16px);',
    '  bottom:calc(var(--sab) + var(--tpad) + 14px);display:none;',
    '  font-size:13px;color:var(--dim);letter-spacing:.06em;',
    '  max-width:min(56vw,420px);text-shadow:0 1px 4px #000;}',
    '.sg-hint .b{color:var(--acc-dim);}',

    /* ---- subtitles --------------------------------------------------- */
    '.sg-sub{position:absolute;left:50%;transform:translateX(-50%);',
    '  bottom:calc(var(--lb) + var(--sab) + var(--tpad) + 20px);',
    '  width:min(760px,calc(100vw - 40px));text-align:center;opacity:0;',
    '  transition:opacity .22s ease;}',
    '.sg-sub.on{opacity:1;}',
    '.sg-sub .in{display:inline-block;max-width:100%;padding:10px 16px 11px;',
    '  background:rgba(3,6,5,.82);border-bottom:1px solid rgba(57,217,138,.35);',
    '  box-shadow:0 10px 34px rgba(0,0,0,.7);}',
    '.sg-sub .spk{display:block;font-size:12px;letter-spacing:.26em;',
    '  color:var(--acc);margin-bottom:4px;}',
    '.sg-sub .tx{display:block;font-size:17px;line-height:1.5;color:var(--ink);',
    '  letter-spacing:.01em;word-break:break-word;}',
    '.sg-sub .cur{color:var(--acc);opacity:.9;}',
    '.sg-root.compact .sg-sub .tx{font-size:16px;}',
    '.sg-root.short .sg-sub .tx{font-size:16px;}',

    /* ---- letterbox ---------------------------------------------------- */
    '.sg-lb{position:absolute;left:0;right:0;height:var(--lb);background:#000;',
    '  transition:height .55s cubic-bezier(.4,0,.2,1);}',
    '.sg-lb.t{top:0;}.sg-lb.b{bottom:0;}',

    /* ---- chapter card ------------------------------------------------- */
    '.sg-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);',
    '  width:min(760px,calc(100vw - 48px));text-align:center;opacity:0;',
    '  transition:opacity .6s ease;}',
    '.sg-card.on{opacity:1;}',
    '.sg-card .eb{font-size:12px;letter-spacing:.5em;color:var(--acc);',
    '  margin-bottom:12px;text-shadow:0 0 18px rgba(57,217,138,.5);}',
    '.sg-card .tt{font-size:clamp(24px,6.4vw,54px);letter-spacing:.16em;',
    '  color:var(--ink);line-height:1.22;text-shadow:0 6px 30px rgba(0,0,0,.9);}',
    '.sg-card .ru{height:1px;width:0;margin:16px auto 0;background:var(--acc);',
    '  box-shadow:0 0 12px rgba(57,217,138,.8);transition:width 1.4s cubic-bezier(.2,0,0,1);}',
    '.sg-card.on .ru{width:min(280px,52vw);}',

    /* ---- flash / fade -------------------------------------------------- */
    '.sg-flash{background:#fff;opacity:0;}',
    '.sg-fade{background:#000;opacity:0;}',

    /* ---- dialogue choice ------------------------------------------------ */
    '.sg-choice{position:absolute;left:50%;transform:translateX(-50%);',
    '  bottom:calc(var(--lb) + var(--sab) + var(--tpad) + 18px);',
    '  width:min(620px,calc(100vw - 32px));pointer-events:auto;',
    '  background:var(--panel);border:1px solid var(--line);padding:14px;',
    '  box-shadow:0 20px 60px rgba(0,0,0,.75);}',
    '.sg-choice .q{font-size:15px;color:var(--dim);letter-spacing:.04em;',
    '  padding-bottom:10px;margin-bottom:8px;border-bottom:1px solid rgba(57,217,138,.20);}',
    '.sg-choice .opt{display:flex;gap:10px;align-items:center;width:100%;',
    '  min-height:46px;padding:9px 10px;font-size:16px;color:var(--ink);',
    '  border-bottom:1px solid rgba(57,217,138,.10);}',
    '.sg-choice .opt:last-child{border-bottom:0;}',
    '.sg-choice .opt .n{color:var(--acc);flex:0 0 auto;min-width:1.6em;}',
    '.sg-choice .opt:hover,.sg-choice .opt:focus{background:rgba(57,217,138,.12);}',

    /* ---- menus ----------------------------------------------------------- */
    '.sg-menulayer.open{pointer-events:auto;}',
    '.sg-menu{position:absolute;inset:0;display:flex;pointer-events:auto;',
    '  padding:calc(var(--sat) + 14px) calc(var(--sar) + 16px)',
    '          calc(var(--sab) + 14px) calc(var(--sal) + 16px);}',
    '.sg-menu.hidden{display:none;}',

    /* pause/settings style dialog */
    '.sg-menu.dlg{align-items:center;justify-content:center;',
    '  background:radial-gradient(120% 120% at 50% 45%,rgba(3,6,5,.82),rgba(3,6,5,.95));}',
    '.sg-panel{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;',
    '  background:var(--panel);border:1px solid var(--line);',
    '  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 24px 80px rgba(0,0,0,.75);}',
    '.sg-panel .ph{display:flex;align-items:center;gap:10px;padding:12px 16px;',
    '  border-bottom:1px solid var(--line);flex:0 0 auto;}',
    '.sg-panel .ph .t{font-size:13px;letter-spacing:.30em;color:var(--acc);}',
    '.sg-panel .ph .r{flex:1 1 auto;height:1px;background:rgba(57,217,138,.25);}',
    '.sg-panel .ph .m{font-size:12px;letter-spacing:.14em;color:var(--dim);}',
    '.sg-panel .pb{padding:8px 12px 12px;overflow-y:auto;overflow-x:hidden;',
    '  -webkit-overflow-scrolling:touch;touch-action:pan-y;flex:1 1 auto;min-height:0;}',
    '.sg-panel .pf{padding:9px 16px;border-top:1px solid var(--line);flex:0 0 auto;',
    '  font-size:12px;letter-spacing:.10em;color:var(--acc-dim);',
    '  display:flex;justify-content:space-between;gap:10px;}',

    /* menu items */
    '.sg-item{display:flex;align-items:center;gap:12px;width:100%;min-height:46px;',
    '  padding:10px 12px;font-size:16px;letter-spacing:.12em;color:var(--ink);',
    '  border-bottom:1px solid rgba(57,217,138,.10);transition:background .12s ease;}',
    '.sg-item .mk{color:var(--acc-dim);flex:0 0 auto;width:1.1em;',
    '  transition:transform .12s ease,color .12s ease;}',
    '.sg-item .lb{flex:1 1 auto;}',
    '.sg-item .rt{font-size:12px;letter-spacing:.10em;color:var(--dim);flex:0 0 auto;}',
    '.sg-item:hover,.sg-item:focus{background:rgba(57,217,138,.12);}',
    '.sg-item:hover .mk,.sg-item:focus .mk{color:var(--acc);transform:translateX(3px);}',
    '.sg-item[disabled]{color:#4e6259;cursor:default;}',
    '.sg-item[disabled]:hover{background:none;}',
    '.sg-item[disabled] .mk{color:#33443c;}',
    '.sg-item.danger:hover,.sg-item.danger:focus{background:rgba(255,107,107,.14);}',
    '.sg-item.danger .lb{color:#ffb3b3;}',

    /* setting rows */
    '.sg-row{padding:9px 12px;border-bottom:1px solid rgba(57,217,138,.10);}',
    '.sg-row .hd{display:flex;align-items:baseline;justify-content:space-between;gap:12px;}',
    '.sg-row .lb{font-size:15px;letter-spacing:.10em;color:var(--ink);}',
    '.sg-row .val{font-size:13px;letter-spacing:.10em;color:var(--acc);',
    '  font-variant-numeric:tabular-nums;}',
    '.sg-row .nt{font-size:12px;color:var(--dim);letter-spacing:.03em;margin-top:4px;}',
    'button.sg-row{display:flex;align-items:center;justify-content:space-between;',
    '  gap:12px;width:100%;min-height:46px;transition:background .12s ease;}',
    'button.sg-row:hover,button.sg-row:focus{background:rgba(57,217,138,.12);}',
    '.sg-row .sw{font-size:14px;letter-spacing:.14em;color:var(--acc-dim);flex:0 0 auto;}',
    '.sg-row .sw.on{color:var(--acc);}',

    /* range */
    '.sg-range{-webkit-appearance:none;appearance:none;width:100%;height:34px;',
    '  margin:2px 0 0;background:transparent;display:block;touch-action:pan-y;}',
    '.sg-range::-webkit-slider-runnable-track{height:3px;background:rgba(57,217,138,.22);}',
    '.sg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;',
    '  width:18px;height:18px;margin-top:-8px;background:var(--acc);border:0;',
    '  box-shadow:0 0 10px rgba(57,217,138,.55);}',
    '.sg-range::-moz-range-track{height:3px;background:rgba(57,217,138,.22);}',
    '.sg-range::-moz-range-thumb{width:18px;height:18px;background:var(--acc);border:0;}',

    /* segmented */
    '.sg-seg{display:flex;gap:8px;margin-top:8px;}',
    '.sg-seg button{flex:1 1 0;min-height:44px;padding:6px 4px;text-align:center;',
    '  font-size:14px;letter-spacing:.12em;color:var(--dim);',
    '  border:1px solid rgba(57,217,138,.22);transition:all .12s ease;}',
    '.sg-seg button[aria-pressed="true"]{color:#04120c;background:var(--acc);',
    '  border-color:var(--acc);}',
    '.sg-seg button:hover:not([aria-pressed="true"]){color:var(--ink);',
    '  border-color:var(--acc);}',

    /* eggs list */
    '.sg-egg{display:flex;gap:10px;align-items:flex-start;padding:9px 12px;',
    '  border-bottom:1px solid rgba(57,217,138,.10);font-size:15px;}',
    '.sg-egg .mk{flex:0 0 auto;color:var(--acc);width:1.2em;}',
    '.sg-egg .bd{flex:1 1 auto;min-width:0;}',
    '.sg-egg .ti{color:var(--ink);word-break:break-word;}',
    '.sg-egg .hi{font-size:13px;color:var(--dim);margin-top:3px;}',
    '.sg-egg.lock .mk{color:#3c5349;}',
    '.sg-egg.lock .ti{color:#4e6259;background:rgba(57,217,138,.07);',
    '  letter-spacing:.08em;}',
    '.sg-counter{padding:10px 12px;font-size:13px;letter-spacing:.16em;',
    '  color:var(--acc);border-bottom:1px solid var(--line);}',
    '.sg-counter b{color:var(--ink);font-weight:normal;}',

    /* credits */
    '.sg-cred{padding:6px 12px 4px;font-size:14px;color:var(--dim);line-height:1.75;}',
    '.sg-cred h4{margin:16px 0 4px;font-size:11px;font-weight:normal;',
    '  letter-spacing:.26em;color:var(--acc-dim);}',
    '.sg-cred p{margin:0 0 6px;color:var(--ink);}',
    '.sg-cred .q{color:var(--acc);}',

    /* ---- title screen ------------------------------------------------------ */
    '.sg-menu.title{align-items:center;justify-content:flex-start;',
    '  background:radial-gradient(115% 110% at 26% 50%,rgba(3,7,6,.90) 0%,',
    '    rgba(3,7,6,.66) 44%,rgba(3,7,6,.20) 78%,rgba(3,7,6,.42) 100%);}',
    '.sg-titleinner{width:min(440px,100%);}',
    '.sg-wm{font-size:clamp(40px,10vw,84px);letter-spacing:.30em;color:var(--acc);',
    '  line-height:1;text-indent:.30em;text-shadow:0 0 40px rgba(57,217,138,.45),0 4px 24px #000;}',
    '.sg-wm2{display:flex;align-items:center;gap:10px;margin:14px 0 22px;}',
    '.sg-wm2 .r{flex:1 1 auto;height:1px;background:rgba(57,217,138,.4);}',
    '.sg-wm2 .t{font-size:clamp(11px,2.6vw,14px);letter-spacing:.34em;color:var(--ink);',
    '  white-space:nowrap;text-shadow:0 2px 10px #000;}',
    '.sg-nav{border-top:1px solid rgba(57,217,138,.22);}',
    '.sg-tag{margin-top:18px;font-size:14px;color:var(--dim);letter-spacing:.06em;',
    '  min-height:1.5em;transition:opacity .5s ease;text-shadow:0 2px 8px #000;}',
    '.sg-tag.out{opacity:0;}',
    '.sg-foot{margin-top:10px;font-size:12px;letter-spacing:.14em;color:var(--acc-dim);}',
    '.sg-root.compact .sg-menu.title,.sg-root.portrait .sg-menu.title{',
    '  justify-content:center;background:radial-gradient(120% 100% at 50% 56%,',
    '  rgba(3,7,6,.90) 0%,rgba(3,7,6,.70) 50%,rgba(3,7,6,.42) 100%);}',
    '.sg-root.short .sg-wm{font-size:clamp(30px,7vh,52px);}',
    '.sg-root.short .sg-wm2{margin:10px 0 12px;}',
    '.sg-root.short .sg-tag{margin-top:10px;}',
    '.sg-root.short .sg-item{min-height:44px;padding:7px 12px;}',
    '.sg-root.short .sg-titleinner{width:min(420px,100%);}',

    /* ---- motion ------------------------------------------------------------- */
    '@keyframes sg-blink2{0%,49%{opacity:1}50%,100%{opacity:0}}',
    '.sg-sub .cur{animation:sg-blink2 .9s steps(1) infinite;}',
    '@keyframes sg-tick{0%{transform:translateX(0)}40%{transform:translateX(4px)}',
    '  100%{transform:translateX(0)}}',
    '.sg-obj .it.tick{animation:sg-tick .5s ease;}',
    '.sg-root.reduce .sg-sub .cur,.sg-root.reduce .sg-obj .it.tick{animation:none;}',
    '.sg-root.reduce .sg-card .ru{transition:none;}',
    '.sg-root.reduce .sg-item,.sg-root.reduce .sg-item .mk,',
    '.sg-root.reduce .sg-toast,.sg-root.reduce .sg-lb{transition-duration:.001s;}',
    '@media (prefers-reduced-motion: reduce){',
    '  .sg-sub .cur{animation:none;}.sg-lb{transition-duration:.001s;}}'
  ].join('\n');

  /* ------------------------------------------------------------------ */
  /* Module state                                                        */
  /* ------------------------------------------------------------------ */

  var root = null, host = null;
  var elObj, elObjHd, elTimer, elTimerV, elToasts, elCross, elPrompt, elPromptK,
    elPromptT, elProg, elProgK, elProgB, elHint, elSub, elSubSpk, elSubTx,
    elSubCur, elLbT, elLbB, elCard, elCardEb, elCardTt, elFlash, elFade,
    elMenuLayer, elChoiceWrap, elHud;

  var vw = 1280, vh = 800;
  var inited = false;

  /* objectives */
  var objSig = '';
  var objRows = {};

  /* prompt */
  var promptCur = null;

  /* progress */
  var progLabel = null, progVal = -1, progShown = false;

  /* hint */
  var hintCur = null;

  /* timer */
  var timerLeft = null, timerShownSec = -1, timerWarn = false, timerPulse = false;

  /* toasts */
  var toasts = [];

  /* subtitles */
  var subQueue = [], subCur = null, subShownChars = -1, subCursorOn = false;

  /* chapter card */
  var cardT = 0, cardActive = false;

  /* tagline */
  var tagT = 0, tagIdx = 0, tagEl = null, tagFading = false;

  /* menus */
  var screens = [];          /* [{name, el, focusables, prevFocus}] */
  var menuKind = null;       /* 'title' | 'pause' | null */
  var choice = null;         /* active dialogChoice */

  /* fade */
  var fadeState = 0;

  /* ------------------------------------------------------------------ */
  /* Build                                                               */
  /* ------------------------------------------------------------------ */

  function applyMotion() {
    if (!root) return;
    root.classList.toggle('reduce', reduced());
  }

  UI.init = function () {
    if (inited) return;
    inited = true;

    var style = el('style');
    style.setAttribute('data-sg', 'ui');
    style.appendChild(D.createTextNode(STYLE));
    (D.head || D.documentElement).appendChild(style);

    host = D.getElementById('ui');
    if (!host) {
      host = el('div');
      host.id = 'ui';
      css(host, 'position', 'fixed');
      host.style.cssText += ';inset:0;pointer-events:none;z-index:10;';
      D.body.appendChild(host);
    }

    root = el('div', 'sg-root');
    if (SG.isTouch) root.classList.add('touch');
    host.appendChild(root);

    /* --- HUD ------------------------------------------------------- */
    elHud = el('div', 'sg-hud');
    root.appendChild(elHud);

    elObj = el('div', 'sg-obj');
    elObjHd = el('div', 'hd', 'WORK ORDER');
    elObj.appendChild(elObjHd);
    css(elObj, 'display', 'none');
    elHud.appendChild(elObj);

    elTimer = el('div', 'sg-timer');
    elTimer.appendChild(el('div', 'k', 'TIME'));
    elTimerV = el('div', 'v', '0:00');
    elTimer.appendChild(elTimerV);
    elTimer.setAttribute('role', 'timer');
    elTimer.setAttribute('aria-live', 'off');
    elHud.appendChild(elTimer);

    elToasts = el('div', 'sg-toasts');
    elToasts.setAttribute('role', 'status');
    elToasts.setAttribute('aria-live', 'polite');
    elHud.appendChild(elToasts);

    elCross = el('div', 'sg-cross');
    ['d', 'l', 'r', 't', 'b'].forEach(function (c) { elCross.appendChild(el('i', c)); });
    elHud.appendChild(elCross);

    elPrompt = el('div', 'sg-prompt');
    elPromptK = el('span', 'kbd', 'E');
    elPromptT = el('span', 'tx', '');
    elPrompt.appendChild(elPromptK);
    elPrompt.appendChild(elPromptT);
    elHud.appendChild(elPrompt);

    elProg = el('div', 'sg-prog');
    elProgK = el('div', 'k', '');
    var tr = el('div', 'tr');
    elProgB = el('div', 'br');
    tr.appendChild(elProgB);
    elProg.appendChild(elProgK);
    elProg.appendChild(tr);
    elHud.appendChild(elProg);

    elHint = el('div', 'sg-hint');
    elHud.appendChild(elHint);

    /* --- subtitles --------------------------------------------------- */
    var subWrap = el('div', 'sg-subwrap');
    elSub = el('div', 'sg-sub');
    elSub.setAttribute('role', 'status');
    elSub.setAttribute('aria-live', 'polite');
    var subIn = el('div', 'in');
    elSubSpk = el('span', 'spk', '');
    elSubTx = el('span', 'tx', '');
    elSubCur = el('span', 'cur', '▌');
    elSubTx.appendChild(D.createTextNode(''));
    subIn.appendChild(elSubSpk);
    var line = el('span', 'tx');
    line.appendChild(D.createTextNode(''));
    elSubTx = line;
    line.appendChild(elSubCur);
    subIn.appendChild(line);
    elSub.appendChild(subIn);
    subWrap.appendChild(elSub);
    root.appendChild(subWrap);

    /* --- letterbox --------------------------------------------------- */
    var lbWrap = el('div', 'sg-lbwrap');
    elLbT = el('div', 'sg-lb t');
    elLbB = el('div', 'sg-lb b');
    lbWrap.appendChild(elLbT);
    lbWrap.appendChild(elLbB);
    root.appendChild(lbWrap);

    /* --- chapter card ------------------------------------------------ */
    var cardWrap = el('div', 'sg-cardwrap');
    elCard = el('div', 'sg-card');
    elCardEb = el('div', 'eb', '');
    elCardTt = el('div', 'tt', '');
    elCard.appendChild(elCardEb);
    elCard.appendChild(elCardTt);
    elCard.appendChild(el('div', 'ru'));
    css(elCard, 'display', 'none');
    cardWrap.appendChild(elCard);
    root.appendChild(cardWrap);

    /* --- choice ------------------------------------------------------ */
    elChoiceWrap = el('div', 'sg-choicewrap');
    root.appendChild(elChoiceWrap);

    /* --- menus ------------------------------------------------------- */
    elMenuLayer = el('div', 'sg-menulayer');
    root.appendChild(elMenuLayer);

    /* --- scanlines / flash / fade ------------------------------------ */
    root.appendChild(el('div', 'sg-scan'));
    elFlash = el('div', 'sg-flash');
    root.appendChild(elFlash);
    elFade = el('div', 'sg-fade');
    root.appendChild(elFade);

    applyMotion();
    UI.resize(W.innerWidth || 1280, W.innerHeight || 800);

    on(W, 'keydown', onKeyDown, false);
    on(W, 'pointerdown', function () {
      if (root) root.classList.remove('kb');
    }, true);

    SG.bus.on('resume', function () {
      if (menuKind === 'pause') closeAll(false);
    });
    SG.bus.on('level:built', function (ctx) {
      if (ctx && ctx.id) {
        SG.state.seen[ctx.id] = 1;
        noteProgress();
      }
    });
  };

  UI.resize = function (w, h) {
    vw = w || W.innerWidth || 1280;
    vh = h || W.innerHeight || 800;
    if (!root) return;
    var portrait = vh >= vw;
    root.classList.toggle('portrait', portrait);
    root.classList.toggle('landscape', !portrait);
    root.classList.toggle('compact', vw < 560);
    root.classList.toggle('short', vh < 520);
    /* Room reserved at the bottom for Agent E's touch controls. */
    var pad = 0;
    if (SG.isTouch) pad = portrait ? 104 : 76;
    root.style.setProperty('--tpad', pad + 'px');
  };

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */

  var hud = UI.hud = UI.hud || {};

  hud.setVisible = function (v) {
    if (!root) return;
    root.classList.toggle('hud-off', !v);
  };

  /* --- objectives ---------------------------------------------------- */

  hud.objectives = function (list) {
    if (!elObj) return;
    list = list || [];
    var vis = [];
    for (var i = 0; i < list.length; i++) if (!list[i].hidden) vis.push(list[i]);

    var sig = vis.map(function (o) { return o.id + '' + o.text; }).join('');
    if (sig !== objSig) {
      objSig = sig;
      objRows = {};
      while (elObj.childNodes.length > 1) elObj.removeChild(elObj.lastChild);
      for (var j = 0; j < vis.length; j++) {
        var o = vis[j];
        var row = el('div', 'it');
        var mk = el('span', 'mk', '•');
        var tx = el('span', 'tx', o.text);
        row.appendChild(mk);
        row.appendChild(tx);
        elObj.appendChild(row);
        objRows[o.id] = { row: row, mk: mk, done: false };
      }
      css(elObj, 'display', vis.length ? 'block' : 'none');
    }
    for (var k = 0; k < vis.length; k++) setDone(vis[k].id, !!vis[k].done, false);
  };

  function setDone(id, done, animate) {
    var r = objRows[id];
    if (!r || r.done === done) return;
    r.done = done;
    r.row.classList.toggle('done', done);
    r.mk.textContent = done ? '✓' : '•';
    if (done && animate && !reduced()) {
      r.row.classList.add('tick');
      W.setTimeout(function () { r.row.classList.remove('tick'); }, 620);
    }
  }

  hud.completeObjective = function (id) { setDone(id, true, true); };

  hud.objective = function (text) {
    hud.objectives(text ? [{ id: 'main', text: text }] : []);
  };

  /* --- prompt --------------------------------------------------------- */

  hud.prompt = function (text) {
    if (!elPrompt) return;
    text = text || null;
    if (text === promptCur) return;
    promptCur = text;
    contextVerb(text ? shortVerb(text) : null);
    if (!text) { css(elPrompt, 'display', 'none'); return; }
    /* "Open — the case" style strings arrive as "Verb — Label" */
    elPromptK.textContent = SG.isTouch ? 'TAP' : 'E';
    elPromptT.textContent = text;
    css(elPrompt, 'display', 'flex');
  };

  function shortVerb(text) {
    var i = text.indexOf('—');
    if (i < 0) i = text.indexOf(' - ');
    var v = i > 0 ? text.slice(0, i) : text;
    v = v.replace(/^\s*[EF]\s*[-—]\s*/, '').trim();
    return v.length > 14 ? v.slice(0, 14) : v;
  }

  /* --- subtitles ------------------------------------------------------- */

  hud.subtitle = function (speaker, text, opts) {
    if (!elSub) return;
    opts = opts || {};
    if (SG.state.settings && SG.state.settings.subtitles === false) return;
    if (!text) return;
    var dur = opts.duration;
    if (!(dur > 0)) dur = clamp(text.length * 0.052 + 0.9, 1.2, 9);
    subQueue.push({
      speaker: speaker || '', text: String(text), dur: dur,
      colour: opts.colour || null
    });
    if (subQueue.length > 6) subQueue.splice(0, subQueue.length - 6);
    if (!subCur) nextSub();
  };

  hud.clearSubtitles = function () {
    subQueue.length = 0;
    if (subCur) { subCur = null; elSub.classList.remove('on'); }
  };

  function nextSub() {
    var s = subQueue.shift();
    if (!s) {
      subCur = null;
      elSub.classList.remove('on');
      return;
    }
    subCur = s;
    s.t = 0;
    s.phase = 'in';
    s.reveal = reduced() ? 0.001 : clamp(s.text.length * 0.028, 0.15, s.dur * 0.72);
    elSubSpk.textContent = speakerName(s.speaker);
    elSubTx.style.color = s.colour || '';
    subShownChars = -1;
    setSubChars(reduced() ? s.text.length : 0);
    elSub.classList.add('on');
  }

  function setSubChars(n) {
    if (!subCur) return;
    n = clamp(n | 0, 0, subCur.text.length);
    if (n === subShownChars) return;
    subShownChars = n;
    elSubTx.firstChild.nodeValue = subCur.text.slice(0, n);
    var wantCur = n < subCur.text.length;
    if (wantCur !== subCursorOn) {
      subCursorOn = wantCur;
      elSubCur.style.display = wantCur ? '' : 'none';
    }
  }

  function updateSubs(dt) {
    if (!subCur) return;
    var s = subCur;
    s.t += dt;
    if (s.phase === 'in') {
      setSubChars(Math.ceil(s.t / s.reveal * s.text.length));
      var hold = subQueue.length ? Math.min(s.dur, s.reveal + 0.25) : s.dur;
      if (s.t >= hold) { s.phase = 'out'; s.t = 0; elSub.classList.remove('on'); }
    } else {
      if (s.t >= 0.24) nextSub();
    }
  }

  /* --- toasts ----------------------------------------------------------- */

  var TOAST_ICON = {
    egg: '✦', info: '›', warn: '!', ok: '✓',
    item: '■', save: '●'
  };

  hud.toast = function (text, icon) {
    if (!elToasts || !text) return;
    var t = el('div', 'sg-toast in');
    var ic = el('span', 'ic', TOAST_ICON[icon] || (icon && icon.length <= 2 ? icon : '›'));
    t.appendChild(ic);
    t.appendChild(el('span', 'tx', String(text)));
    elToasts.appendChild(t);
    /* next frame -> slide in */
    W.requestAnimationFrame(function () { t.classList.remove('in'); });
    toasts.push({ el: t, t: 0, life: clamp(2.4 + String(text).length * 0.035, 2.4, 5.5), out: false });
    while (toasts.length > 4) {
      var old = toasts.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  };

  function updateToasts(dt) {
    for (var i = toasts.length - 1; i >= 0; i--) {
      var t = toasts[i];
      t.t += dt;
      if (!t.out && t.t >= t.life) { t.out = true; t.el.classList.add('out'); t.t = 0; }
      else if (t.out && t.t >= 0.34) {
        if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
        toasts.splice(i, 1);
      }
    }
  }

  /* --- crosshair --------------------------------------------------------- */

  var crossOn = false;
  hud.crosshair = function (v) {
    v = !!v;
    if (v === crossOn || !elCross) return;
    crossOn = v;
    css(elCross, 'display', v ? 'block' : 'none');
  };

  /* --- timer -------------------------------------------------------------- */

  hud.timer = function (seconds) {
    if (!elTimer) return;
    if (seconds === null || seconds === undefined) {
      timerLeft = null;
      timerShownSec = -1;
      css(elTimer, 'display', 'none');
      elTimer.classList.remove('warn', 'pulse');
      timerWarn = false; timerPulse = false;
      return;
    }
    timerLeft = Math.max(0, +seconds || 0);
    css(elTimer, 'display', 'block');
    paintTimer();
  };

  function paintTimer() {
    var s = Math.ceil(timerLeft);
    if (s !== timerShownSec) {
      timerShownSec = s;
      var m = (s / 60) | 0, r = s % 60;
      elTimerV.textContent = m + ':' + (r < 10 ? '0' : '') + r;
    }
    var warn = timerLeft <= 15;
    if (warn !== timerWarn) {
      timerWarn = warn;
      elTimer.classList.toggle('warn', warn);
      if (!warn) { elTimer.classList.remove('pulse'); timerPulse = false; }
    }
    if (warn) {
      var p = (timerLeft % 1) < 0.5;
      if (p !== timerPulse) {
        timerPulse = p;
        elTimer.classList.toggle('pulse', p);
      }
    }
  }

  function updateTimer(dt) {
    if (timerLeft === null) return;
    var was = timerLeft;
    timerLeft = Math.max(0, timerLeft - dt);
    paintTimer();
    if (was > 0 && timerLeft <= 0) SG.bus.emit('timer:end');
  }

  /* --- progress ------------------------------------------------------------ */

  hud.progress = function (label, t) {
    if (!elProg) return;
    if (t === null || t === undefined) {
      if (progShown) { progShown = false; css(elProg, 'display', 'none'); }
      progVal = -1; progLabel = null;
      return;
    }
    if (!progShown) { progShown = true; css(elProg, 'display', 'block'); }
    if (label !== progLabel) { progLabel = label; elProgK.textContent = label || ''; }
    var v = Math.round(clamp(t, 0, 1) * 100);
    if (v !== progVal) { progVal = v; elProgB.style.width = v + '%'; }
  };

  /* --- hint ---------------------------------------------------------------- */

  hud.hint = function (text) {
    if (!elHint) return;
    text = text || null;
    if (text === hintCur) return;
    hintCur = text;
    if (!text) { css(elHint, 'display', 'none'); return; }
    elHint.textContent = '';
    elHint.appendChild(el('span', 'b', '› '));
    elHint.appendChild(D.createTextNode(text));
    css(elHint, 'display', 'block');
  };

  /* --- chapter card --------------------------------------------------------- */

  hud.chapterCard = function (title) {
    if (!elCard || !title) return;
    var eb = '', tt = String(title);
    var i = tt.indexOf('—');
    if (i > 0) { eb = tt.slice(0, i).trim(); tt = tt.slice(i + 1).trim(); }
    elCardEb.textContent = eb.toUpperCase();
    css(elCardEb, 'display', eb ? 'block' : 'none');
    elCardTt.textContent = tt.toUpperCase();
    css(elCard, 'display', 'block');
    elCard.classList.remove('on');
    cardActive = true;
    cardT = 0;
    W.requestAnimationFrame(function () {
      if (cardActive) elCard.classList.add('on');
    });
  };

  function updateCard(dt) {
    if (!cardActive) return;
    cardT += dt;
    if (cardT > 3.0 && elCard.classList.contains('on')) elCard.classList.remove('on');
    if (cardT > 3.8) { cardActive = false; css(elCard, 'display', 'none'); }
  }

  /* ------------------------------------------------------------------ */
  /* Overlays                                                            */
  /* ------------------------------------------------------------------ */

  UI.letterbox = function (v, ms) {
    if (!elLbT) return;
    ms = ms === undefined ? 550 : ms;
    if (reduced()) ms = 1;
    var d = (ms / 1000) + 's';
    elLbT.style.transitionDuration = d;
    elLbB.style.transitionDuration = d;
    var h = v ? (vh < 520 ? '7vh' : '9.5vh') : '0px';
    root.style.setProperty('--lb', h);
  };

  UI.fade = function (toBlack, ms) {
    ms = ms === undefined ? 600 : ms;
    if (!elFade) return Promise.resolve();
    elFade.style.transitionDuration = (ms / 1000) + 's';
    elFade.style.transitionProperty = 'opacity';
    elFade.style.transitionTimingFunction = 'linear';
    /* force style flush so the transition always runs */
    void elFade.offsetWidth;
    fadeState = toBlack ? 1 : 0;
    elFade.style.opacity = fadeState;
    return new Promise(function (res) { W.setTimeout(res, ms + 20); });
  };

  UI.flash = function (colour, ms) {
    if (!elFlash) return;
    ms = ms === undefined ? 260 : ms;
    if (reduced()) ms = Math.min(ms, 120);
    elFlash.style.background = colour || '#ffffff';
    elFlash.style.transitionDuration = '0s';
    elFlash.style.opacity = '0.85';
    void elFlash.offsetWidth;
    elFlash.style.transitionProperty = 'opacity';
    elFlash.style.transitionTimingFunction = 'ease-out';
    elFlash.style.transitionDuration = (ms / 1000) + 's';
    elFlash.style.opacity = '0';
  };

  /* ------------------------------------------------------------------ */
  /* Dialogue choice                                                     */
  /* ------------------------------------------------------------------ */

  UI.dialogChoice = function (question, options) {
    options = options || [];
    if (choice) closeChoice(-1);
    return new Promise(function (resolve) {
      var wrap = el('div', 'sg-choice');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', question || 'Choose a reply');
      if (question) wrap.appendChild(el('div', 'q', question));
      var btns = [];
      options.forEach(function (o, i) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.appendChild(el('span', 'n', (i + 1) + '.'));
        b.appendChild(el('span', 'l', typeof o === 'string' ? o : (o.text || '')));
        on(b, 'click', function () { closeChoice(i); });
        wrap.appendChild(b);
        btns.push(b);
      });
      elChoiceWrap.appendChild(wrap);
      choice = { el: wrap, btns: btns, resolve: resolve };
      if (btns.length) btns[0].focus();
      sfx('uiHover', { vol: 0.35 });
    });
  };

  function closeChoice(index) {
    if (!choice) return;
    var c = choice;
    choice = null;
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
    if (index >= 0) sfx('uiSelect', { vol: 0.5 });
    c.resolve(index);
  }

  /* ------------------------------------------------------------------ */
  /* Menu framework                                                      */
  /* ------------------------------------------------------------------ */

  UI.isMenuOpen = function () { return screens.length > 0; };

  function focusables(node) {
    var list = node.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select,[tabindex="0"]');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n.offsetParent !== null || n === D.activeElement) out.push(n);
    }
    return out;
  }

  function top() { return screens.length ? screens[screens.length - 1] : null; }

  function push(name, node, label) {
    var t = top();
    if (t) t.el.classList.add('hidden');
    node.classList.add('sg-menu');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', label || name);
    elMenuLayer.appendChild(node);
    var prev = D.activeElement;
    screens.push({ name: name, el: node, prevFocus: prev });
    elMenuLayer.classList.add('open');
    root.classList.add('menu-open');
    touchVisible(false);
    var f = focusables(node);
    if (f.length) {
      var pick = f[0];
      for (var i = 0; i < f.length; i++) {
        if (f[i].getAttribute('data-autofocus') !== null &&
          f[i].getAttribute('data-autofocus') !== undefined &&
          f[i].hasAttribute('data-autofocus')) { pick = f[i]; break; }
      }
      try { pick.focus(); } catch (e) { /* silent */ }
    }
  }

  function pop() {
    var s = screens.pop();
    if (!s) return;
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    var t = top();
    if (t) {
      t.el.classList.remove('hidden');
      var f = focusables(t.el);
      var target = null;
      if (s.prevFocus && t.el.contains(s.prevFocus)) target = s.prevFocus;
      else if (f.length) target = f[0];
      if (target) { try { target.focus(); } catch (e) { /* silent */ } }
    } else {
      finishClose();
    }
    sfx('uiBack', { vol: 0.5 });
  }

  function closeAll(resume) {
    while (screens.length) {
      var s = screens.pop();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    finishClose();
    if (resume !== false && menuKindWas === 'pause' && fn_(SG.engine, 'resume')) {
      SG.engine.resume();
    }
    menuKindWas = null;
  }

  var menuKindWas = null;

  function finishClose() {
    menuKindWas = menuKind;
    menuKind = null;
    elMenuLayer.classList.remove('open');
    root.classList.remove('menu-open');
    var inLevel = SG.engine && (SG.engine.mode === 'level' || SG.engine.mode === 'cutscene');
    touchVisible(!!inLevel);
    try {
      if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    } catch (e) { /* silent */ }
  }

  UI.menu = UI.menu || {};

  UI.menu.close = function () {
    if (!screens.length) return;
    var wasPause = menuKind === 'pause';
    while (screens.length) {
      var s = screens.pop();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    finishClose();
    menuKindWas = null;
    if (wasPause && fn_(SG.engine, 'resume')) SG.engine.resume();
  };

  UI.menu.back = function () {
    if (screens.length > 1) pop();
    else if (menuKind === 'pause') UI.menu.close();
    else if (menuKind === 'title') { /* title is the floor */ }
    else UI.menu.close();
  };

  /* --- builders ------------------------------------------------------- */

  function panel(title, meta) {
    var wrap = el('div', 'dlg');
    var p = el('div', 'sg-panel');
    var hd = el('div', 'ph');
    hd.appendChild(el('span', 't', title));
    hd.appendChild(el('span', 'r'));
    if (meta) hd.appendChild(el('span', 'm', meta));
    var bd = el('div', 'pb');
    p.appendChild(hd);
    p.appendChild(bd);
    wrap.appendChild(p);
    return { wrap: wrap, panel: p, body: bd };
  }

  function footer(p, left, right) {
    var f = el('div', 'pf');
    f.appendChild(el('span', null, left || ''));
    f.appendChild(el('span', null, right || ''));
    p.panel.appendChild(f);
    return f;
  }

  function item(label, onUse, opts) {
    opts = opts || {};
    var b = el('button', 'sg-item' + (opts.danger ? ' danger' : ''));
    b.type = 'button';
    b.appendChild(el('span', 'mk', '›'));
    b.appendChild(el('span', 'lb', label));
    if (opts.right) b.appendChild(el('span', 'rt', opts.right));
    if (opts.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
    if (opts.aria) b.setAttribute('aria-label', opts.aria);
    if (opts.autofocus) b.setAttribute('data-autofocus', '');
    on(b, 'click', function (ev) {
      ev.preventDefault();
      if (b.disabled) return;
      sfx('uiSelect', { vol: 0.55 });
      onUse(b);
    });
    on(b, 'mouseenter', function () { if (!b.disabled) sfx('uiHover', { vol: 0.22 }); });
    return b;
  }

  function rowSlider(label, get, set, opts) {
    opts = opts || {};
    var row = el('div', 'sg-row');
    var hd = el('div', 'hd');
    var id = 'sg-r-' + Math.random().toString(36).slice(2, 8);
    var lb = el('label', 'lb', label);
    lb.setAttribute('for', id);
    var val = el('span', 'val', '');
    hd.appendChild(lb);
    hd.appendChild(val);
    row.appendChild(hd);
    var r = el('input', 'sg-range');
    r.type = 'range';
    r.id = id;
    r.min = opts.min === undefined ? 0 : opts.min;
    r.max = opts.max === undefined ? 1 : opts.max;
    r.step = opts.step === undefined ? 0.05 : opts.step;
    r.value = get();
    var fmt = opts.format || function (v) { return Math.round(v * 100) + '%'; };
    val.textContent = fmt(+r.value);
    on(r, 'input', function () {
      var v = +r.value;
      val.textContent = fmt(v);
      set(v);
    });
    on(r, 'change', function () { sfx('uiHover', { vol: 0.2 }); });
    row.appendChild(r);
    return row;
  }

  function rowToggle(label, get, set, note) {
    var b = el('button', 'sg-row');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    var lb = el('span', 'lb', label);
    var sw = el('span', 'sw', '');
    b.appendChild(lb);
    b.appendChild(sw);
    function paint() {
      var v = !!get();
      sw.textContent = v ? '■ ON' : '□ OFF';
      sw.classList.toggle('on', v);
      b.setAttribute('aria-checked', v ? 'true' : 'false');
    }
    paint();
    on(b, 'click', function (e) {
      e.preventDefault();
      set(!get());
      paint();
      sfx('uiSelect', { vol: 0.45 });
    });
    if (note) {
      var wrap = el('div', 'sg-row');
      wrap.style.padding = '0';
      wrap.style.borderBottom = '0';
      wrap.appendChild(b);
      var n = el('div', 'nt', note);
      n.style.padding = '0 12px 8px';
      wrap.appendChild(n);
      return wrap;
    }
    return b;
  }

  function rowSeg(label, options, get, set, note) {
    var row = el('div', 'sg-row');
    var hd = el('div', 'hd');
    hd.appendChild(el('span', 'lb', label));
    row.appendChild(hd);
    var seg = el('div', 'sg-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    var btns = [];
    options.forEach(function (o) {
      var b = el('button', null, o.label);
      b.type = 'button';
      b.setAttribute('aria-label', label + ': ' + o.label);
      on(b, 'click', function (e) {
        e.preventDefault();
        set(o.value);
        paint();
        sfx('uiSelect', { vol: 0.45 });
      });
      seg.appendChild(b);
      btns.push({ b: b, v: o.value });
    });
    function paint() {
      var cur = get();
      btns.forEach(function (x) {
        x.b.setAttribute('aria-pressed', x.v === cur ? 'true' : 'false');
      });
    }
    paint();
    row.appendChild(seg);
    if (note) row.appendChild(el('div', 'nt', note));
    return row;
  }

  /* ------------------------------------------------------------------ */
  /* Progress bookkeeping                                                */
  /* ------------------------------------------------------------------ */

  function chapters() { return SG.CHAPTERS || []; }

  function chapterIndex(id) {
    var c = chapters();
    for (var i = 0; i < c.length; i++) if (c[i].id === id) return i;
    return -1;
  }

  function noteProgress() {
    var i = chapterIndex(SG.state.chapter);
    var m = SG.state.counters.maxChapter || 0;
    if (i > m) { SG.state.counters.maxChapter = i; SG.save(); }
  }

  function maxChapter() {
    noteProgress();
    return SG.state.counters.maxChapter || 0;
  }

  function hasSave() {
    var id = SG.state.chapter;
    return !!id && id !== 'title' && chapterIndex(id) >= 0;
  }

  function currentChapterTitle() {
    var i = chapterIndex(SG.state.chapter);
    var c = chapters()[i];
    return c ? c.title : 'PROLOGUE';
  }

  /* ------------------------------------------------------------------ */
  /* Screens                                                             */
  /* ------------------------------------------------------------------ */

  UI.menu.title = function () {
    if (!inited) UI.init();
    if (menuKind === 'title' && screens.length) return;
    while (screens.length) {
      var s = screens.pop();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    menuKind = 'title';
    noteProgress();

    var wrap = el('div', 'title');
    var inner = el('div', 'sg-titleinner');

    inner.appendChild(el('div', 'sg-wm', 'STEVE'));
    var w2 = el('div', 'sg-wm2');
    w2.appendChild(el('span', 'r'));
    w2.appendChild(el('span', 't', 'THE PC REPAIR MAN'));
    w2.appendChild(el('span', 'r'));
    inner.appendChild(w2);

    var nav = el('nav', 'sg-nav');
    var cont = hasSave();
    nav.appendChild(item('CONTINUE', function () {
      startFrom(function () { SG.engine.continueGame(); });
    }, {
      disabled: !cont, autofocus: cont,
      right: cont ? shortTitle(currentChapterTitle()) : 'NO SAVE'
    }));
    nav.appendChild(item('NEW GAME', function () {
      if (cont) confirmNewGame(); else startFrom(function () { SG.engine.startNewGame(); });
    }, { autofocus: !cont }));
    nav.appendChild(item('CHAPTERS', function () { UI.menu.chapters(); }));
    nav.appendChild(item('SETTINGS', function () { UI.menu.settings(); }));
    nav.appendChild(item('EXTRAS', function () { extrasScreen(); }));
    inner.appendChild(nav);

    tagEl = el('div', 'sg-tag', TAGLINES[tagIdx % TAGLINES.length]);
    inner.appendChild(tagEl);
    inner.appendChild(el('div', 'sg-foot',
      SG.isTouch ? 'TAP TO SELECT' : '↑↓ SELECT · ENTER CONFIRM · ESC BACK'));

    wrap.appendChild(inner);
    push('title', wrap, 'Main menu');
    tagT = 0;
  };

  function shortTitle(t) {
    if (!t) return '';
    var i = t.indexOf('—');
    var s = i > 0 ? t.slice(i + 1).trim() : t;
    return s.length > 16 ? s.slice(0, 15) + '…' : s.toUpperCase();
  }

  function startFrom(go) {
    UI.menu.close();
    UI.fade(true, 260).then(function () {
      try { go(); } catch (e) { if (W.console) console.error(e); }
      return UI.fade(false, 500);
    });
  }

  function confirmNewGame() {
    var p = panel('NEW GAME', '');
    p.body.appendChild(el('div', 'sg-cred'))
      .appendChild(el('p', null,
        'Starting a new game overwrites the chapter you are on. Easter eggs you have found are kept.'));
    p.body.appendChild(item('START A NEW GAME', function () {
      startFrom(function () { SG.engine.startNewGame(); });
    }, { autofocus: true }));
    p.body.appendChild(item('CANCEL', function () { pop(); }));
    footer(p, 'ESC — BACK', '');
    push('confirm-new', p.wrap, 'Confirm new game');
  }

  /* --- pause -------------------------------------------------------------- */

  UI.menu.pause = function () {
    if (!inited) UI.init();
    if (menuKind === 'pause' && screens.length) return;
    while (screens.length) {
      var s = screens.pop();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    }
    menuKind = 'pause';
    noteProgress();

    var p = panel('PAUSED', shortTitle(currentChapterTitle()));
    p.body.appendChild(item('RESUME', function () { UI.menu.close(); },
      { autofocus: true, right: SG.isTouch ? '' : 'ESC' }));
    p.body.appendChild(item('SETTINGS', function () { UI.menu.settings(); }));
    p.body.appendChild(item('CHAPTERS', function () { UI.menu.chapters(); }));
    p.body.appendChild(item('EASTER EGGS', function () { UI.menu.eggs(); },
      { right: SG.eggs.found() + '/' + Math.max(SG.eggs.total(), SG.eggs.found()) }));
    p.body.appendChild(item('RESTART CHAPTER', function () {
      startFrom(function () { SG.engine.goto(SG.state.chapter); });
    }));
    p.body.appendChild(item('QUIT TO TITLE', function () {
      UI.menu.close();
      UI.fade(true, 300).then(function () {
        if (fn_(SG.engine, 'resume')) SG.engine.resume();
        if (fn_(SG.engine, 'goto')) SG.engine.goto('title');
        return UI.fade(false, 500);
      });
    }, { danger: true }));
    footer(p, 'ESC — RESUME', 'v' + SG.version);
    push('pause', p.wrap, 'Pause menu');
  };

  /* --- settings ------------------------------------------------------------ */

  UI.menu.settings = function () {
    if (!inited) UI.init();
    var st = SG.state.settings;

    function bus(name, v) {
      if (fn_(SG.audio, 'setBus')) { try { SG.audio.setBus(name, v); } catch (e) { /* silent */ } }
    }
    var saveT = 0;
    function persist() {
      if (saveT) W.clearTimeout(saveT);
      saveT = W.setTimeout(function () { saveT = 0; SG.save(); }, 220);
    }

    var p = panel('SETTINGS', 'DIAGNOSTIC');

    p.body.appendChild(el('div', 'sg-counter', 'AUDIO'));
    p.body.appendChild(rowSlider('MASTER', function () { return st.master; },
      function (v) { st.master = v; bus('master', v); persist(); }));
    p.body.appendChild(rowSlider('MUSIC', function () { return st.music; },
      function (v) { st.music = v; bus('music', v); persist(); }));
    p.body.appendChild(rowSlider('SOUND FX', function () { return st.sfx; },
      function (v) { st.sfx = v; bus('sfx', v); persist(); }));
    p.body.appendChild(rowSlider('VOICE', function () { return st.voice; },
      function (v) { st.voice = v; bus('voice', v); persist(); }));
    p.body.appendChild(rowToggle('SUBTITLES', function () { return st.subtitles !== false; },
      function (v) {
        st.subtitles = v;
        if (!v) hud.clearSubtitles();
        SG.save();
      }));
    p.body.appendChild(rowToggle('SPOKEN VOICE', function () { return st.voiceEnabled !== false; },
      function (v) {
        st.voiceEnabled = v;
        if (fn_(SG.voice, 'setEnabled')) { try { SG.voice.setEnabled(v); } catch (e) { /* silent */ } }
        if (!v && fn_(SG.voice, 'cancel')) { try { SG.voice.cancel(); } catch (e) { /* silent */ } }
        SG.save();
      }, 'Subtitles stay on either way.'));

    p.body.appendChild(el('div', 'sg-counter', 'CONTROLS'));
    p.body.appendChild(rowSlider('LOOK SENSITIVITY', function () { return st.sensitivity; },
      function (v) {
        st.sensitivity = v;
        if (fn_(SG.input, 'setSensitivity')) {
          try { SG.input.setSensitivity(v); } catch (e) { /* silent */ }
        }
        persist();
      }, {
      min: 0.2, max: 3, step: 0.05,
      format: function (v) { return (Math.round(v * 100) / 100).toFixed(2) + '×'; }
    }));
    p.body.appendChild(rowToggle('INVERT Y', function () { return !!st.invertY; },
      function (v) {
        st.invertY = v;
        if (fn_(SG.input, 'setInvertY')) { try { SG.input.setInvertY(v); } catch (e) { /* silent */ } }
        SG.save();
      }));
    p.body.appendChild(rowToggle('GYRO LOOK', function () { return !!st.gyro; },
      function (v) {
        st.gyro = v;
        if (fn_(SG.input, 'setGyro')) { try { SG.input.setGyro(v); } catch (e) { /* silent */ } }
        SG.save();
      }, SG.isTouch ? 'Tilt to look. Off by default.' : 'Phones and tablets only.'));

    p.body.appendChild(el('div', 'sg-counter', 'DISPLAY'));
    var qNote = el('div', 'nt', 'Applies when the next level loads.');
    var qRow = rowSeg('QUALITY', [
      { label: 'LOW', value: 'low' },
      { label: 'MED', value: 'med' },
      { label: 'HIGH', value: 'high' }
    ], function () { return SG.quality; }, function (v) {
      SG.setQuality(v);
      qNote.textContent = 'Set to ' + v.toUpperCase() +
        ' — applies when the next level loads.';
      if (fn_(SG.fx, 'rebuild')) { try { SG.fx.rebuild(); } catch (e) { /* silent */ } }
    });
    qRow.appendChild(qNote);
    p.body.appendChild(qRow);
    p.body.appendChild(rowToggle('REDUCE MOTION', function () { return !!st.reduceMotion; },
      function (v) { st.reduceMotion = v; applyMotion(); SG.save(); },
      'Turns off typewriter reveals, shake and drift.'));

    p.body.appendChild(el('div', 'sg-counter', 'DATA'));
    p.body.appendChild(item('RESET PROGRESS…', function () { confirmReset(); },
      { danger: true, right: 'ERASES SAVE' }));

    footer(p, 'ESC — BACK', SG.isTouch ? '' : '↑↓ MOVE · ←→ ADJUST');
    push('settings', p.wrap, 'Settings');
  };

  function confirmReset() {
    var p = panel('RESET PROGRESS', 'CONFIRM');
    var c = el('div', 'sg-cred');
    c.appendChild(el('p', null,
      'This erases your chapter progress, every easter egg you have found and all settings.'));
    c.appendChild(el('p', null, 'It cannot be undone.'));
    p.body.appendChild(c);
    p.body.appendChild(item('YES, ERASE EVERYTHING', function () {
      SG.resetSave();
      applyMotion();
      hud.toast('Progress erased', 'warn');
      pop();
      if (menuKind === 'title') { UI.menu.title(); }
    }, { danger: true }));
    p.body.appendChild(item('CANCEL', function () { pop(); }, { autofocus: true }));
    footer(p, 'ESC — CANCEL', '');
    push('reset', p.wrap, 'Confirm reset progress');
  }

  /* --- chapters -------------------------------------------------------------- */

  UI.menu.chapters = function () {
    if (!inited) UI.init();
    var list = chapters();
    var mx = maxChapter();
    var p = panel('CHAPTERS', (mx + 1) + '/' + Math.max(1, list.length));

    if (!list.length) {
      p.body.appendChild(el('div', 'sg-cred')).appendChild(
        el('p', null, 'No chapters registered.'));
    }

    list.forEach(function (c, i) {
      var unlocked = i <= mx || !!SG.state.seen[c.id];
      var kind = c.kind === 'cutscene' ? 'CUTSCENE' : 'LEVEL';
      var label = (i + 1 < 10 ? '0' : '') + (i + 1) + '  ' +
        (unlocked ? c.title : '██████████');
      p.body.appendChild(item(label, function () {
        startFrom(function () { SG.engine.goto(c.id); });
      }, {
        disabled: !unlocked,
        right: unlocked ? kind : 'LOCKED',
        aria: unlocked ? ('Chapter ' + (i + 1) + ': ' + c.title) :
          ('Chapter ' + (i + 1) + ': locked'),
        autofocus: i === mx
      }));
    });

    footer(p, 'ESC — BACK', 'PICKING A CHAPTER KEEPS YOUR EGGS');
    push('chapters', p.wrap, 'Chapter select');
  };

  /* --- easter eggs ------------------------------------------------------------ */

  UI.menu.eggs = function () {
    if (!inited) UI.init();
    var all = SG.eggs.all || {};
    var ids = Object.keys(all);
    var found = SG.eggs.found();
    var total = Math.max(ids.length, found);

    var p = panel('EASTER EGGS', 'CURIOSITY LOG');
    var counter = el('div', 'sg-counter');
    counter.appendChild(D.createTextNode('FOUND '));
    counter.appendChild(el('b', null, String(found)));
    counter.appendChild(D.createTextNode(' OF ' + total));
    p.body.appendChild(counter);

    if (!ids.length) {
      var c = el('div', 'sg-cred');
      c.appendChild(el('p', null,
        'Nothing registered yet. They turn up when you poke at things that look pokeable.'));
      p.body.appendChild(c);
    }

    ids.sort(function (a, b) {
      var fa = SG.state.eggs[a] ? 0 : 1, fb = SG.state.eggs[b] ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (all[a].title || a) < (all[b].title || b) ? -1 : 1;
    });

    ids.forEach(function (id) {
      var e = all[id];
      var got = !!SG.state.eggs[id];
      var row = el('div', 'sg-egg' + (got ? '' : ' lock'));
      row.appendChild(el('span', 'mk', got ? '✦' : '✖'));
      var bd = el('div', 'bd');
      if (got) {
        bd.appendChild(el('div', 'ti', e.title || id));
        if (e.hint) bd.appendChild(el('div', 'hi', e.hint));
      } else {
        var n = clamp((e.title || id).length, 6, 22);
        bd.appendChild(el('div', 'ti', new Array(n + 1).join('█')));
        bd.appendChild(el('div', 'hi', e.hint || 'No idea. Keep looking.'));
        row.setAttribute('aria-label', 'Undiscovered. Hint: ' + (e.hint || 'keep looking'));
      }
      row.appendChild(bd);
      p.body.appendChild(row);
    });

    footer(p, 'ESC — BACK', 'HINTS ARE FREE');
    push('eggs', p.wrap, 'Easter eggs');
  };

  /* --- extras / credits --------------------------------------------------------- */

  function extrasScreen() {
    var p = panel('EXTRAS', '');
    p.body.appendChild(item('EASTER EGGS', function () { UI.menu.eggs(); }, {
      autofocus: true,
      right: SG.eggs.found() + '/' + Math.max(SG.eggs.total(), SG.eggs.found())
    }));
    p.body.appendChild(item('CREDITS', function () { UI.menu.credits(); }));
    p.body.appendChild(item('ABOUT THIS BUILD', function () { aboutScreen(); }));
    footer(p, 'ESC — BACK', '');
    push('extras', p.wrap, 'Extras');
  }

  UI.menu.credits = function () {
    if (!inited) UI.init();
    var p = panel('CREDITS', 'ROLL IT');
    var c = el('div', 'sg-cred');
    function h(t) { c.appendChild(el('h4', null, t)); }
    function line(t, cls) { c.appendChild(el('p', cls || null, t)); }

    line('STEVE — THE PC REPAIR MAN');
    h('THE SHOP');
    line('Steve — proprietor, technician');
    line('Kernel — cat, quality assurance');
    line('Ms. Ellis — valued customer since 1998');
    h('OTHER CONTRACTS');
    line('Oleg — handler');
    line('Nikolai Brandt — the Archivist');
    line('HALCYON — itself');
    h('MADE OF');
    line('Every texture, model, sound, voice and note you met was generated ' +
      'on this device while you waited. There are no assets in this file.');
    h('HOUSE RULES');
    line('“No appointment necessary.”', 'q');
    line('“Payment in full, up front.”', 'q');
    line('“The computer is not out of internet.”', 'q');
    h('');
    line('Thanks for coming in.');
    p.body.appendChild(c);
    footer(p, 'ESC — BACK', 'v' + SG.version);
    push('credits', p.wrap, 'Credits');
  };

  function aboutScreen() {
    var p = panel('ABOUT', 'BUILD ' + SG.version);
    var c = el('div', 'sg-cred');
    c.appendChild(el('p', null, 'Renderer quality: ' + String(SG.quality).toUpperCase()));
    c.appendChild(el('p', null, 'Post-processing: ' +
      (SG.fx && SG.fx.enabled ? 'ON' : 'OFF')));
    c.appendChild(el('p', null, 'Input: ' + (SG.isTouch ? 'TOUCH + KEYBOARD' : 'KEYBOARD + MOUSE')));
    c.appendChild(el('p', null, 'Viewport: ' + vw + '×' + vh));
    c.appendChild(el('p', null,
      'This file is entirely self-contained. It makes no network requests. ' +
      'It works with the aeroplane mode on, which is the only way Steve travels.'));
    p.body.appendChild(c);
    footer(p, 'ESC — BACK', '');
    push('about', p.wrap, 'About this build');
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                            */
  /* ------------------------------------------------------------------ */

  function isRange(n) { return n && n.tagName === 'INPUT' && n.type === 'range'; }

  function segOf(n) {
    var p = n && n.parentNode;
    return (p && p.className === 'sg-seg') ? p : null;
  }

  function onKeyDown(e) {
    var k = e.key;
    if (root && (k === 'Tab' || k === 'ArrowUp' || k === 'ArrowDown' ||
      k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Enter' || k === 'Escape')) {
      root.classList.add('kb');
    }

    /* dialogue choice takes priority */
    if (choice) {
      if (k >= '1' && k <= '9') {
        var idx = (+k) - 1;
        if (idx < choice.btns.length) { e.preventDefault(); closeChoice(idx); }
        return;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        var bs = choice.btns;
        var cur = bs.indexOf(D.activeElement);
        var next = (cur + (k === 'ArrowDown' ? 1 : -1) + bs.length) % (bs.length || 1);
        if (bs[next]) bs[next].focus();
        return;
      }
      return;
    }

    if (screens.length) {
      var s = top();
      handleMenuKey(e, s);
      return;
    }

    if (k === 'Escape' || k === 'Esc') {
      var E = SG.engine;
      if (!E) return;
      if (SG.cinema && fn_(SG.cinema, 'isPlaying') && SG.cinema.isPlaying()) return;
      if (E.mode === 'level' && !E.paused) {
        e.preventDefault();
        SG.bus.emit('pause');
      }
    }
  }

  function handleMenuKey(e, s) {
    var k = e.key;
    var a = D.activeElement;

    if (k === 'Escape' || k === 'Esc') {
      e.preventDefault();
      UI.menu.back();
      return;
    }

    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (isRange(a)) return;                       /* native adjust */
      var seg = segOf(a);
      if (seg) {
        e.preventDefault();
        var kids = [], i;
        for (i = 0; i < seg.children.length; i++) kids.push(seg.children[i]);
        var ci = kids.indexOf(a);
        var ni = clamp(ci + (k === 'ArrowRight' ? 1 : -1), 0, kids.length - 1);
        kids[ni].focus();
        return;
      }
      return;
    }

    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Tab') {
      var f = focusables(s.el);
      if (!f.length) return;
      var cur = f.indexOf(a);
      var dir = (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) ? -1 : 1;
      if (k === 'Tab') {
        /* trap: wrap at the ends, otherwise let the browser do it */
        if (cur < 0) { e.preventDefault(); f[0].focus(); return; }
        if (dir > 0 && cur === f.length - 1) { e.preventDefault(); f[0].focus(); return; }
        if (dir < 0 && cur === 0) { e.preventDefault(); f[f.length - 1].focus(); return; }
        return;
      }
      e.preventDefault();
      var n = cur < 0 ? (dir > 0 ? 0 : f.length - 1) : (cur + dir + f.length) % f.length;
      try { f[n].focus(); } catch (err) { /* silent */ }
      sfx('uiHover', { vol: 0.2 });
      return;
    }

    if (k === ' ' || k === 'Spacebar') {
      if (a && a.tagName === 'BUTTON') { /* native */ return; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Frame update — value-change-gated DOM writes only                   */
  /* ------------------------------------------------------------------ */

  UI.update = function (dt) {
    if (!inited) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;

    var paused = !!(SG.engine && SG.engine.paused);

    if (!paused) {
      updateSubs(dt);
      updateTimer(dt);
    }
    updateToasts(dt);
    updateCard(dt);

    /* rotating tagline, title screen only */
    if (tagEl && tagEl.parentNode && screens.length &&
      top().name === 'title' && !reduced()) {
      tagT += dt;
      if (!tagFading && tagT > 6.4) {
        tagFading = true;
        tagEl.classList.add('out');
      } else if (tagFading && tagT > 6.9) {
        tagIdx++;
        tagEl.textContent = TAGLINES[tagIdx % TAGLINES.length];
        tagEl.classList.remove('out');
        tagFading = false;
        tagT = 0;
      }
    }
  };

  /* Kept for symmetry with the rest of the namespace. */
  UI.root = function () { return root; };

})(window.SG, window, window.document);

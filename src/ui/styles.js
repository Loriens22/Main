// All UI styles (injected once). Responsive for phones (landscape & portrait),
// foldables and display cut-outs via env(safe-area-inset-*).
export const CSS = /* css */ `
.ui-root{position:absolute;inset:0;pointer-events:none;z-index:5;font-size:calc(14px*var(--ui-scale))}
.ui-root *{pointer-events:auto}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,.35)}
.btn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);border-radius:12px;padding:12px 18px;font-weight:600;cursor:pointer;transition:background .15s,transform .1s,border-color .15s;font-size:1em;touch-action:manipulation}
.btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25)}
.btn:active{transform:scale(.97)}
.btn.primary{background:linear-gradient(180deg,#ffb52e,#f08c00);border-color:#ffc35c;color:#1b1406}
.btn.primary:hover{background:linear-gradient(180deg,#ffc04a,#ff9a0d)}
.btn.green{background:linear-gradient(180deg,#48b562,#2f8f45);border-color:#6fd187}
.btn:disabled{opacity:.4;cursor:default}
/* stacking: HUD < touch controls (z 2) < menus / pause (z 5) < trip result (z 6) */
/* ---------- main menu */
.menu{position:absolute;inset:0;display:flex;align-items:stretch;justify-content:space-between;gap:24px;
  padding:calc(24px + var(--safe-t)) calc(24px + var(--safe-r)) calc(24px + var(--safe-b)) calc(24px + var(--safe-l));
  background:linear-gradient(90deg,rgba(6,12,9,.88) 0%,rgba(6,12,9,.55) 40%,rgba(6,12,9,0) 70%)}
.menu .col{display:flex;flex-direction:column;gap:12px;max-width:420px;width:100%;justify-content:center}
.menu .logo{width:100%;max-width:400px;margin-bottom:6px}
.menu .tag{color:var(--dim);font-size:.95em;margin:-4px 0 12px}
.menu .big{font-size:1.15em;padding:16px 20px;text-align:left;display:flex;align-items:center;gap:14px}
.menu .big .ico{width:34px;height:34px;flex:none}
.menu .big small{display:block;font-weight:400;color:var(--dim);font-size:.78em;margin-top:2px}
.menu .big.primary small{color:rgba(27,20,6,.72)}
.menu .big.green small{color:rgba(255,255,255,.78)}
.menu .row{display:flex;gap:10px}
.menu .row .btn{flex:1}
.menu .foot{color:var(--dim);font-size:.75em;margin-top:8px;line-height:1.4}
.setup{position:absolute;right:calc(24px + var(--safe-r));top:calc(24px + var(--safe-t));bottom:calc(24px + var(--safe-b));width:min(460px,92vw);padding:20px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.setup h2{margin:0;font-size:1.3em}
.setup,.menu,.menu .col,.hud .result{touch-action:pan-y;-webkit-overflow-scrolling:touch}
.setup .go-row{position:sticky;bottom:-20px;margin:0 -20px -20px;padding:12px 20px 20px;background:linear-gradient(180deg,rgba(14,22,17,0),#0e1611 12px);z-index:2}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:.8em;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{flex:1 1 auto;min-width:64px;padding:9px 10px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--text);cursor:pointer;font:inherit;font-size:.9em}
.seg button.on{background:rgba(255,174,26,.18);border-color:var(--accent);color:#ffd28a}
.line-pick{margin:4px 0 2px}
.line-pick button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px}
.line-pick button b{font-size:1.35em;font-family:monospace;color:#ffae1a}
.line-pick button small{font-size:.72em;color:var(--dim);line-height:1.2}
.share-lab{font-size:.8em;color:var(--dim);margin:-2px 0 8px}
.field input[type=text]{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);font:inherit}
select,input[type=range]{width:100%;font:inherit}
select{background:#16211b;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px}
.bus-pick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bus-pick button{padding:10px 6px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);cursor:pointer;font:inherit;text-align:center}
.bus-pick button b{display:block;font-size:1.3em;font-family:monospace;color:#ffd28a}
.bus-pick button small{color:var(--dim);font-size:.75em}
.bus-pick button.on{border-color:var(--accent);background:rgba(255,174,26,.14)}
/* ---------- HUD */
.hud{position:absolute;inset:0;pointer-events:none}
.hud *{pointer-events:none}
.hud .route{position:absolute;left:calc(14px + var(--safe-l));top:calc(12px + var(--safe-t));display:flex;flex-direction:column;gap:8px;max-width:min(440px,60vw)}
.hud .route .top{display:flex;align-items:center;gap:10px;padding:8px 12px}
.badge{background:#f39200;color:#1a0f00;font-weight:800;font-family:monospace;font-size:1.25em;padding:4px 10px;border-radius:8px;letter-spacing:.02em}
.hud .dest{font-weight:600}
.hud .next{padding:10px 14px}
.hud .next .lbl{font-size:.72em;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.hud .next .name{font-size:1.15em;font-weight:700;margin-top:2px}
.hud .next .meta{display:flex;gap:12px;color:var(--dim);font-size:.85em;margin-top:4px}
.hud .late{color:#ff8a6a}.hud .early{color:#7fd6ff}.hud .ontime{color:var(--ok)}
.hud .stopreq{display:none;background:#c8102e;color:#fff;font-weight:800;padding:6px 12px;border-radius:8px;letter-spacing:.1em;align-self:flex-start;box-shadow:0 0 20px rgba(255,30,30,.6)}
.hud .stopreq.on{display:block}
.hud .dash{position:absolute;left:50%;bottom:calc(14px + var(--safe-b));transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:10px 16px}
.hud .spd{font-size:2.3em;font-weight:800;font-variant-numeric:tabular-nums;min-width:2.6ch;text-align:right;line-height:1}
.hud .spd small{font-size:.35em;font-weight:500;color:var(--dim);margin-left:4px}
.hud .gear{display:flex;gap:3px}
.hud .gear span{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;font-weight:800;font-size:.85em;background:rgba(255,255,255,.06);color:var(--dim)}
.hud .gear span.on{background:#2f8f45;color:#fff}
.hud .gear span.on.r{background:#c0392b}
.hud .doors{display:flex;gap:4px}
.hud .doors span{width:22px;height:30px;border-radius:5px;border:2px solid rgba(255,255,255,.25);display:grid;place-items:center;font-size:.7em;font-weight:700;color:var(--dim)}
.hud .doors span.open{border-color:#ffae1a;background:rgba(255,174,26,.25);color:#ffd28a}
.hud .doors span.warn{border-color:#ff5544;animation:blink .4s steps(2) infinite}
.hud .lamps{display:flex;gap:6px;align-items:center}
.lamp{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:.7em;font-weight:800;background:rgba(255,255,255,.05);color:rgba(255,255,255,.25)}
.lamp.on{color:#fff}
.lamp.p.on{background:#c0392b}.lamp.ind.on{background:#2f8f45}.lamp.hl.on{background:#2d6cdf}.lamp.sb.on{background:#d68910}
.hud .toast{position:absolute;left:50%;top:calc(18% + var(--safe-t));transform:translateX(-50%);width:max-content;padding:10px 18px;font-weight:600;opacity:0;transition:opacity .3s;text-align:center;max-width:80vw}
.hud .toast.show{opacity:1}
.hud .toast.bad{border-color:#ff5544}
.hud .sub{position:absolute;left:50%;bottom:calc(92px + var(--safe-b));transform:translateX(-50%);background:#0d0d0b;border:2px solid #2b2a24;border-radius:8px;
  padding:8px 18px;color:#ffae1a;font-family:"Arial Narrow",Arial,sans-serif;font-weight:700;font-size:1.25em;letter-spacing:.02em;text-shadow:0 0 8px rgba(255,150,20,.7);opacity:0;transition:opacity .4s;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
.hud .sub.show{opacity:1}
.hud .check{position:absolute;left:calc(14px + var(--safe-l));bottom:calc(14px + var(--safe-b));padding:12px 14px;min-width:230px}
.hud .check h4{margin:0 0 6px;font-size:.8em;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.hud .check div{display:flex;gap:8px;align-items:center;padding:3px 0;font-size:.9em}
.hud .check div i{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);flex:none}
.hud .check div.done{color:var(--dim);text-decoration:line-through}
.hud .check div.done i{background:var(--ok);border-color:var(--ok)}
.hud .check kbd{margin-left:auto;font-family:monospace;font-size:.8em;background:rgba(255,255,255,.1);padding:1px 6px;border-radius:4px}
.hud .map{position:absolute;right:calc(12px + var(--safe-r));top:calc(12px + var(--safe-t));width:190px;height:190px;border-radius:14px;overflow:hidden}
.hud .map canvas{width:100%;height:100%}
.hud .fps{position:absolute;right:calc(14px + var(--safe-r));top:calc(208px + var(--safe-t));font-family:monospace;font-size:.75em;color:var(--dim)}
.hud .prompt{position:absolute;left:50%;bottom:calc(40% + var(--safe-b));transform:translateX(-50%);width:max-content;max-width:90vw;padding:10px 16px;font-weight:600;display:none}
.hud .prompt.show{display:block}
.hud .prompt kbd{font-family:monospace;background:rgba(255,255,255,.15);padding:2px 7px;border-radius:5px;margin-right:6px}
.hud .help{position:absolute;right:calc(12px + var(--safe-r));bottom:calc(12px + var(--safe-b));padding:10px 12px;font-size:.78em;line-height:1.55;color:var(--dim);max-width:280px}
.hud .help b{color:var(--text)}
.hud .result{position:absolute;z-index:6;left:50%;top:50%;transform:translate(-50%,-50%);padding:22px 26px;min-width:min(420px,90vw);max-height:calc(100% - 20px - var(--safe-t) - var(--safe-b));overflow:auto;pointer-events:auto}
.hud .result *{pointer-events:auto}
.hud .result h2{margin:0 0 10px}
.hud .result table{width:100%;border-collapse:collapse;margin:8px 0 14px}
.hud .result td{padding:4px 0;border-bottom:1px solid var(--line)}
.hud .result td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.crosshair{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 4px #000;display:none}
.crosshair.show{display:block}
@keyframes blink{50%{opacity:.3}}
/* ---------- pause */
.pause{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
.pause .panel{padding:24px;display:flex;flex-direction:column;gap:10px;min-width:260px}
/* ---------- touch controls */
.touch{position:absolute;inset:0;pointer-events:none;z-index:2}
.touch .tc{position:absolute;pointer-events:auto;touch-action:none;user-select:none}
.touch .wheel{left:calc(16px + var(--safe-l));bottom:calc(16px + var(--safe-b));width:calc(150px*var(--tc));height:calc(150px*var(--tc));border-radius:50%;
  background:radial-gradient(circle,rgba(0,0,0,0) 52%,rgba(20,24,26,.75) 53%,rgba(20,24,26,.75) 70%,rgba(0,0,0,0) 71%),radial-gradient(circle,rgba(30,34,36,.6) 18%,transparent 19%);
  border:3px solid rgba(255,255,255,.2)}
.touch .wheel .spoke{position:absolute;left:50%;top:50%;width:70%;height:8px;margin:-4px 0 0 -35%;background:rgba(255,255,255,.35);border-radius:4px}
.touch .wheel .mark{position:absolute;left:50%;top:4%;width:10px;height:16px;margin-left:-5px;background:#ffae1a;border-radius:3px}
.touch .pedal{bottom:calc(16px + var(--safe-b));width:calc(70px*var(--tc));height:calc(120px*var(--tc));border-radius:14px;background:rgba(20,24,26,.7);border:2px solid rgba(255,255,255,.2);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.touch .pedal i{position:absolute;left:0;right:0;bottom:0;background:rgba(255,174,26,.45);height:0}
.touch .pedal.brake i{background:rgba(255,80,60,.5)}
.touch .pedal span{position:relative;font-size:.75em;font-weight:700;margin-bottom:6px;color:rgba(255,255,255,.75)}
.touch .gas{right:calc(16px + var(--safe-r))}
.touch .brake{right:calc(96px*var(--tc) + 16px + var(--safe-r))}
.touch .btns{right:calc(16px + var(--safe-r));bottom:calc(150px*var(--tc) + 22px + var(--safe-b));display:grid;grid-template-columns:repeat(4,calc(46px*var(--tc)));gap:6px}
.touch .lbtns{left:calc(16px + var(--safe-l));bottom:calc(150px*var(--tc) + 26px + var(--safe-b));display:grid;grid-template-columns:repeat(3,calc(46px*var(--tc)));gap:6px}
.touch .b{height:calc(46px*var(--tc));border-radius:12px;background:rgba(20,24,26,.72);border:1px solid rgba(255,255,255,.2);color:#fff;font-weight:700;font-size:.78em;display:grid;place-items:center;text-align:center;line-height:1.05}
.touch .b.on{background:rgba(255,174,26,.35);border-color:#ffae1a}
.touch .b.red{background:rgba(200,16,46,.6)}
.touch .b.sm{font-size:.62em;letter-spacing:-.01em}
.touch .top{top:calc(10px + var(--safe-t));right:calc(214px + var(--safe-r));display:flex;gap:6px}
.touch .stick{left:calc(20px + var(--safe-l));bottom:calc(20px + var(--safe-b));width:calc(140px*var(--tc));height:calc(140px*var(--tc));border-radius:50%;background:rgba(20,24,26,.45);border:2px solid rgba(255,255,255,.2)}
.touch .stick i{position:absolute;left:50%;top:50%;width:46%;height:46%;margin:-23% 0 0 -23%;border-radius:50%;background:rgba(255,255,255,.35)}
.touch .lookpad{right:0;top:0;width:55%;height:100%;pointer-events:auto}
.touch .pbtns{right:calc(16px + var(--safe-r));bottom:calc(20px + var(--safe-b));display:flex;flex-direction:column;gap:8px}
.touch .pbtns .b{width:calc(90px*var(--tc))}
@media (max-width:820px){
  .hud .help{display:none}
  .hud .map{width:130px;height:130px}
  .hud .fps{top:calc(148px + var(--safe-t))}
  .menu{flex-direction:column;justify-content:flex-start;background:rgba(6,12,9,.78);overflow:auto}
  .setup{position:static;width:100%;max-height:none}
}
/* ---------- touch layout: wheel bottom-left, pedals bottom-right, dash between them */
.is-touch .hud .help,.is-touch .hud .lamps{display:none}
.is-touch .hud .dash{bottom:calc(10px + var(--safe-b));padding:6px 12px;transform:translateX(-50%) scale(.85);transform-origin:50% 100%}
.is-touch .hud .sub{bottom:calc(78px + var(--safe-b));font-size:1em;max-width:56vw}
.is-touch .hud .route{max-width:min(320px,30vw)}
.is-touch .hud .route .top,.is-touch .hud .next{padding:6px 10px}
.is-touch .hud .next .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.is-touch .hud .map{width:110px;height:110px}
.is-touch .hud .fps{top:calc(128px + var(--safe-t))}
.is-touch .hud .toast{top:calc(60px + var(--safe-t));max-width:36vw;padding:8px 12px}
/* the preparation checklist shrinks to one chip: the next step */
.is-touch .hud .check{left:50%;top:calc(10px + var(--safe-t));bottom:auto;transform:translateX(-50%);min-width:0;max-width:40vw;padding:6px 12px;display:flex;align-items:center;gap:10px;white-space:nowrap}
.is-touch .hud .check h4{margin:0}
.is-touch .hud .check div.done,.is-touch .hud .check div:not(.done) ~ div,.is-touch .hud .check kbd{display:none}
.is-touch .touch .top{top:calc(10px + var(--safe-t));right:calc(128px + var(--safe-r));flex-direction:column}
@media (max-height:520px){
  :root{--ui-scale:.84}
  .touch .wheel{width:calc(132px*var(--tc));height:calc(132px*var(--tc))}
  .touch .pedal{height:calc(104px*var(--tc));width:calc(62px*var(--tc))}
  .touch .brake{right:calc(84px*var(--tc) + 16px + var(--safe-r))}
  .touch .b{height:calc(40px*var(--tc))}
  .touch .btns{grid-template-columns:repeat(4,calc(42px*var(--tc)));bottom:calc(104px*var(--tc) + 22px + var(--safe-b))}
  .touch .lbtns{grid-template-columns:repeat(3,calc(42px*var(--tc)));bottom:calc(132px*var(--tc) + 22px + var(--safe-b))}
  .touch .stick{width:calc(120px*var(--tc));height:calc(120px*var(--tc))}
  .touch .pbtns .b{width:calc(84px*var(--tc))}
  .is-touch .hud .map{width:96px;height:96px}
  .is-touch .touch .top{right:calc(114px + var(--safe-r))}
  .menu{padding:calc(10px + var(--safe-t)) calc(14px + var(--safe-r)) calc(10px + var(--safe-b)) calc(14px + var(--safe-l))}
  .menu .col{justify-content:flex-start;gap:8px;overflow-y:auto;max-width:380px}
  .menu .logo{max-width:230px;margin-bottom:0}
  .menu .tag{margin:-2px 0 4px}
  .menu .big{padding:10px 14px}
  .menu .big .ico{width:28px;height:28px}
  .menu .foot{font-size:.62em;margin-top:2px}
  .setup{top:calc(10px + var(--safe-t));bottom:calc(10px + var(--safe-b));padding:14px;gap:10px}
  .setup .go-row{bottom:-14px;margin:0 -14px -14px;padding:10px 14px 14px}
}
@media (orientation:portrait) and (pointer:coarse){
  .hud .route{max-width:70vw}
  .hud .map{display:none}
}
/* portrait phones: the controls fill the bottom, so the instruments stack under the route card */
@media (orientation:portrait){
  .is-touch .hud .map{display:none}
  .is-touch .hud .route{max-width:calc(100vw - 96px - var(--safe-l) - var(--safe-r))}
  .is-touch .touch .top{right:calc(12px + var(--safe-r))}
  .is-touch .hud .dash{top:calc(150px + var(--safe-t));bottom:auto;transform:translateX(-50%) scale(.8);transform-origin:50% 0}
  .is-touch .hud .check{top:calc(206px + var(--safe-t));max-width:88vw}
  .is-touch .hud .toast{top:calc(252px + var(--safe-t));max-width:88vw}
  .is-touch .hud .sub{bottom:auto;top:calc(300px + var(--safe-t));max-width:92vw}
}
`;

export function injectStyles() {
  if (document.getElementById('sofia-ui-css')) return;
  const s = document.createElement('style');
  s.id = 'sofia-ui-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

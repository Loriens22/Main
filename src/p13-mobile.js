/* ===== T2 — MOBILE TOUCH CONTROLS =========================================
   Owns its own DOM (appended to #ui) and its own touch pipeline. Nothing here
   depends on the legacy #skL/#skR sticks or on TOUCH — those are hidden when
   this module takes over. The flight model reads `mobAxes`.

   Layout (all measured from the bottom of the VISUAL viewport, so the iOS URL
   bar can never sit on top of a control):

     ┌───────────────────────────────────────────┐
     │  HUD (untouched)                          │
     │  ▓ throttle slider (left edge; right edge │
     │    in landscape, where #tl owns the left) │
     │              ( navball )                  │
     │  [SAS][RCS][GER][BRK][VIW][W-][W+][≡]     │  compact row
     │  ╭ left stick ╮   [↺][↻]   ╭ right stick ╮│  activation band
     └───────────────────────────────────────────┘

   Left stick  : RCS translation  (X = lateral, Y = vertical)
   Right stick : pitch / yaw
   Roll        : dedicated hold buttons OR a two-finger twist on the free area
   Throttle    : absolute vertical slider, detents at 0 / 50 / 100 %, holds
   Camera      : one-finger drag on the free area orbits; pinch dollies

   Both sticks are ALWAYS drawn at a resting home position at ~1/3 opacity, so a
   new player can see where the controls are; the ring then re-centres under the
   thumb (floating origin) anywhere inside its generous activation band.
   ========================================================================== */
const mobAxes={active:false,pitch:0,yaw:0,roll:0,tx:0,ty:0,throttle:0};
const mobCFG={R:54,knob:44,dead:0.11,expo:0.60,twistDead:0.10,twistFull:0.55};
const mobT=new Map();                      // Touch.identifier -> tracker record
const mobS={on:false,built:false,W:0,H:0,land:false,band:0,
 zL:[0,0,0,0],zR:[0,0,0,0],zT:[0,0,0,0],
 hLx:0,hLy:0,hRx:0,hRy:0,                  // stick home (resting) centres
 thrTop:0,thrH:1,thrSide:'L',
 rollBtn:0,twist:0,menu:false,
 cN:0,cIds:'',cX:0,cY:0,cD:0,cA:0,
 el:{}};

/* ---- helpers ---- */
function mobHit(z,x,y){return x>=z[0]&&x<=z[2]&&y>=z[1]&&y<=z[3];}
function mobHasKind(k){for(const r of mobT.values())if(r.kind===k)return true;return false;}
function mobFind(k){for(const r of mobT.values())if(r.kind===k)return r;return null;}
// dead zone + cubic expo, so small thumb wobble is nothing and the tips stay precise
function mobCurve(x){
 const d=mobCFG.dead, a=Math.abs(clamp(x,-1,1));
 if(a<=d)return 0;
 const n=(a-d)/(1-d), e=mobCFG.expo;
 return Math.sign(x)*(e*n*n*n+(1-e)*n);
}
/* A full-screen panel is up: the sticks must not steal its touches. */
function mobBlocked(){
 if(mobS.menu)return true;
 const p=$('pick'),d=$('docs');
 if(p&&p.style.display==='block')return true;
 if(d&&d.style.display==='block')return true;
 if(typeof UI!=='undefined'&&UI.mapOpen)return true;      // T2: star map (p12) owns the screen
 const m=$('map_root');
 return !!(m&&m.style.display==='block');
}

/* ---- CSS (injected; p1-shell.html keeps only the viewport meta fix) ---- */
const MOB_CSS=`
#mobRoot{position:absolute;inset:0;pointer-events:auto;z-index:11;touch-action:none}
#mobUI{position:absolute;inset:0;pointer-events:none;z-index:12;touch-action:none}
#pick,#docs{z-index:60}
/* p1-shell sets touch-action:none on <body> to kill browser gestures, which also
   kills touch scrolling inside every descendant — the documentation and the
   wormhole target list are both long scrolling panels, so give them it back. */
body.mobOn #docs,body.mobOn #pick{touch-action:pan-y;overscroll-behavior:contain;
 -webkit-overflow-scrolling:touch}
body.mobOn #stick,body.mobOn #row2,body.mobOn #btns,body.mobOn #thr{display:none!important}
body.mobOn #ui{bottom:auto;height:var(--mobH,100dvh)}
body.mobOn #fps{top:auto;bottom:1px;left:50%;transform:translateX(-50%);font-size:9px;opacity:.55}
body.mobOn #msg{top:30%}
body.mobOn #sub{bottom:auto;top:38%;transform:translateX(-50%);max-width:84vw;font-size:10.5px}
/* The resting affordance has to stay readable against a sunlit planet, so it gets
   a dark scrim and an outline as well as the cyan stroke. */
.mobStk{position:absolute;border-radius:50%;border:1.5px solid rgba(130,210,255,.55);
 background:radial-gradient(circle,rgba(4,12,22,.46),rgba(4,12,22,.06));
 box-shadow:0 0 0 1px rgba(0,0,0,.40),0 2px 12px rgba(0,0,0,.45);
 opacity:.55;transition:opacity .12s;pointer-events:none;will-change:transform,opacity}
.mobStk.a{opacity:1;border-color:rgba(170,235,255,.85)}
.mobStk>i{position:absolute;border-radius:50%;background:rgba(90,190,255,.30);
 border:1px solid rgba(150,225,255,.62);box-shadow:0 0 14px rgba(80,190,255,.28);
 will-change:transform}
.mobStk.a>i{background:rgba(90,190,255,.42);box-shadow:0 0 16px rgba(80,190,255,.45)}
.mobStk>u{position:absolute;inset:24%;border-radius:50%;border:1px dashed rgba(90,190,255,.20)}
.mobStk>b{position:absolute;left:-10px;right:-10px;top:-14px;text-align:center;font-size:8px;
 letter-spacing:.16em;color:#8fc4e8;font-weight:400;text-shadow:0 0 4px #000,0 0 8px #000}
/* landscape is only ~390 px tall: shrink the navball panel so the HUD, the
   message line and the control band all still fit without overlapping */
body.mobLand #ball{width:100px;height:100px}
body.mobLand #gauges{width:78px}
body.mobLand #nav{padding:4px;gap:5px}
#mobThr{position:absolute;pointer-events:auto;border:1px solid rgba(90,190,255,.38);
 border-radius:5px;background:rgba(4,10,20,.55);overflow:hidden;touch-action:none}
#mobThr>i{position:absolute;left:0;right:0;bottom:0;height:0%;
 background:linear-gradient(0deg,#ff7a1d,#ffd479)}
#mobThr>s{position:absolute;left:0;right:0;height:1px;background:rgba(160,220,255,.40)}
#mobThr>b{position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:8px;
 color:#eaf8ff;text-shadow:0 0 4px #000;font-weight:700;pointer-events:none}
#mobThr>e{position:absolute;left:0;right:0;top:2px;text-align:center;font-size:7px;
 letter-spacing:.12em;color:#5d86a8;pointer-events:none}
#mobThr>k{position:absolute;left:-2px;right:-2px;height:3px;border-radius:2px;
 background:#eaf8ff;box-shadow:0 0 8px rgba(120,210,255,.9)}
#mobRow{position:absolute;display:flex;gap:3px;pointer-events:none}
.mobB{pointer-events:auto;flex:1 1 0;min-width:0;background:rgba(8,20,36,.82);
 border:1px solid rgba(90,190,255,.42);color:#a8e4ff;border-radius:5px;
 font:inherit;font-size:9.5px;letter-spacing:.04em;padding:0;
 display:flex;align-items:center;justify-content:center;touch-action:none;
 -webkit-user-select:none;user-select:none}
.mobB:active,.mobB.on{background:rgba(30,140,220,.55);border-color:#7fe6ff;color:#eaf8ff}
#mobRoll{position:absolute;display:flex;gap:6px;pointer-events:none}
.mobR{pointer-events:auto;width:38px;height:38px;border-radius:9px;
 background:rgba(8,20,36,.72);border:1px solid rgba(90,190,255,.38);color:#a8e4ff;
 font:inherit;font-size:15px;display:flex;align-items:center;justify-content:center;
 touch-action:none;-webkit-user-select:none;user-select:none}
.mobR:active,.mobR.on{background:rgba(30,140,220,.55);border-color:#7fe6ff}
#mobMenu{position:absolute;inset:0;z-index:40;background:rgba(2,8,18,.94);display:none;
 pointer-events:auto;padding:16px;overflow:auto;touch-action:pan-y;
 -webkit-overflow-scrolling:touch}
#mobMenu.a{display:block}
#mobMenu h3{color:#c79bff;font-size:12px;letter-spacing:.28em;text-align:center;margin:6px 0 12px}
#mobMenu .g{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:520px;margin:0 auto}
#mobMenu .g button{pointer-events:auto;background:rgba(8,20,36,.9);
 border:1px solid rgba(90,190,255,.42);color:#a8e4ff;border-radius:6px;padding:14px 8px;
 font:inherit;font-size:11px;letter-spacing:.08em;touch-action:none}
#mobMenu .g button.wide{grid-column:1/-1}
#mobMenu .g button.wh{background:linear-gradient(180deg,rgba(120,40,200,.8),rgba(40,10,90,.9));
 border-color:#c79bff;color:#f0e0ff;font-weight:700}
#mobMenu .lg{max-width:520px;margin:14px auto 0;color:#5d86a8;font-size:10px;line-height:1.8}
`;

/* ---- DOM ---- */
function mobBuild(){
 if(mobS.built)return;
 const st=document.createElement('style');st.id='mobCSS';st.textContent=MOB_CSS;
 document.head.appendChild(st);
 const ui=$('ui');
 const mk=(tag,id,parent,html)=>{const e=document.createElement(tag);if(id)e.id=id;
  if(html!==undefined)e.innerHTML=html;(parent||ui).appendChild(e);return e;};
 const E=mobS.el;
 E.root=mk('div','mobRoot');
 E.wrap=mk('div','mobUI');
 // Invisible probe: the only reliable way to read env(safe-area-inset-*) from JS.
 // On a notched iPhone in landscape this is ~44 px of unusable screen edge.
 E.safe=mk('div','mobSafe',E.wrap,'');
 E.safe.style.cssText='position:absolute;left:0;bottom:0;visibility:hidden;pointer-events:none;'+
  'width:env(safe-area-inset-left,0px);height:env(safe-area-inset-bottom,0px)';
 E.safe2=mk('div','mobSafe2',E.wrap,'');
 E.safe2.style.cssText='position:absolute;right:0;top:0;visibility:hidden;pointer-events:none;'+
  'width:env(safe-area-inset-right,0px);height:env(safe-area-inset-top,0px)';
 E.sL=mk('div',null,E.wrap,'<u></u><i></i><b>TRANSLATE</b>');E.sL.className='mobStk';
 E.sR=mk('div',null,E.wrap,'<u></u><i></i><b>PITCH · YAW</b>');E.sR.className='mobStk';
 E.thr=mk('div','mobThr',E.wrap,
  '<i></i><s class="d0"></s><s class="d5"></s><k></k><e>THR</e><b>0%</b>');
 E.thrFill=E.thr.querySelector('i');E.thrKnob=E.thr.querySelector('k');
 E.thrTxt=E.thr.querySelector('b');
 E.d0=E.thr.querySelector('.d0');E.d5=E.thr.querySelector('.d5');
 E.row=mk('div','mobRow',E.wrap);
 const BT=[['sas','SAS'],['rcs','RCS'],['gear','GER'],['brk','BRK'],
           ['view','VIW'],['wl','W-'],['wm','W+'],['menu','MENU']];
 E.b={};
 for(const b of BT){const el=document.createElement('button');el.className='mobB';
  el.textContent=b[1];el.dataset.k=b[0];E.row.appendChild(el);E.b[b[0]]=el;}
 E.roll=mk('div','mobRoll',E.wrap);
 E.rl=document.createElement('button');E.rl.className='mobR';E.rl.textContent='↺';
 E.rr=document.createElement('button');E.rr.className='mobR';E.rr.textContent='↻';
 E.roll.appendChild(E.rl);E.roll.appendChild(E.rr);
 E.menu=mk('div','mobMenu',E.wrap,
  '<h3>SYSTEMS</h3><div class="g">'+
  '<button class="wide wh" data-k="wh">CREATE WORMHOLE</button>'+
  '<button data-k="scan">SURFACE SCAN</button>'+
  '<button data-k="map">STAR MAP</button>'+
  '<button data-k="docs">DOCUMENTATION</button>'+
  '<button data-k="cam">RESET CAMERA</button>'+
  '<button class="wide" data-k="close">CLOSE</button></div>'+
  '<div class="lg">Left stick&nbsp;— RCS translate&nbsp;· Right stick&nbsp;— pitch/yaw<br>'+
  'Slider&nbsp;— throttle (magnetic detents at 0/50/100%)<br>'+
  '↺↻ or a two-finger twist&nbsp;— roll<br>'+
  'Drag the sky to orbit the camera&nbsp;· pinch to zoom</div>');

 /* buttons: fire on touchstart for zero latency, with a click fallback for
    desktop / automated testing, de-duplicated by a short guard window. */
 const tap=(el,fn)=>{let t0=-1e9;
  const go=()=>{const n=performance.now();if(n-t0<220)return;t0=n;fn();};
  el.addEventListener('touchstart',e=>{if(e.cancelable)e.preventDefault();e.stopPropagation();go();},{passive:false});
  el.addEventListener('touchend',e=>{e.stopPropagation();},{passive:false});
  el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();go();});};
 const fwd=id=>()=>{const e=$(id);if(e)e.click();};
 tap(E.b.sas,fwd('b_sas'));tap(E.b.rcs,fwd('b_rcs'));tap(E.b.gear,fwd('b_gear'));
 tap(E.b.view,fwd('b_view'));
 tap(E.b.brk,()=>{if(typeof SHIP!=='undefined'){SHIP.brakes=!SHIP.brakes;
  message(SHIP.brakes?'BRAKES ON':'BRAKES OFF');}});
 tap(E.b.wm,()=>{if(typeof setWarp==='function')setWarp(1);});
 tap(E.b.wl,()=>{if(typeof setWarp==='function')setWarp(-1);});
 tap(E.b.menu,()=>mobMenu(true));
 E.menu.querySelectorAll('button').forEach(el=>{
  const k=el.dataset.k;
  tap(el,()=>{
   if(k==='close'){mobMenu(false);return;}
   if(k==='cam'){if(typeof CAM!=='undefined'){CAM.yaw=0.6;CAM.pitch=0.44;CAM.dist=82;}
    mobMenu(false);return;}
   mobMenu(false);
   const b=$('b_'+k);if(b)b.click();
  });});

 // hold-to-roll
 const hold=(el,v)=>{
  // mobAxesFromTouches() is called here as well as per-frame so press and release
  // reach mobAxes.roll in the same event, not one frame later.
  const dn=e=>{if(e.cancelable)e.preventDefault();e.stopPropagation();
   mobS.rollBtn=v;el.classList.add('on');mobAxesFromTouches();};
  const up=e=>{if(e&&e.stopPropagation)e.stopPropagation();
   if(mobS.rollBtn===v)mobS.rollBtn=0;el.classList.remove('on');mobAxesFromTouches();};
  el.addEventListener('touchstart',dn,{passive:false});
  el.addEventListener('touchend',up);el.addEventListener('touchcancel',up);
  // pointer events cover desktop-with-touchscreen and automated clicks; touch
  // events already fired above are de-duplicated because both set the same value.
  el.addEventListener('pointerdown',dn);el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up);
 };
 hold(E.rl,-1);hold(E.rr,1);

 // Throttle: absolute drag, tracked by identifier through the shared pipeline,
 // but it also grabs its own touches so a thumb landing exactly on it always wins.
 E.thr.addEventListener('touchstart',e=>{
  if(e.cancelable)e.preventDefault();e.stopPropagation();
  for(const t of e.changedTouches)mobThrGrab(t.identifier,t.clientX,t.clientY);
 },{passive:false});

 // the main touch pipeline
 E.root.addEventListener('touchstart',mobDown,{passive:false});
 addEventListener('touchmove',mobMove,{passive:false});
 addEventListener('touchend',mobUp,{passive:false});
 addEventListener('touchcancel',mobUp,{passive:false});
 // iOS Safari pinch-zoom / double-tap zoom
 addEventListener('gesturestart',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
 addEventListener('gesturechange',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
 addEventListener('dblclick',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
 // never leave an input latched when the page is backgrounded
 addEventListener('visibilitychange',()=>{if(document.hidden)mobClearAll();});
 addEventListener('blur',mobClearAll);
 // Anything that opens or closes a full-screen panel does it from a click handler
 // somewhere in p8/p12; re-evaluate right after, so the sticks stop eating touches
 // in the same tick rather than on the next frame.
 const sync=()=>{mobBlockSync();setTimeout(mobBlockSync,0);setTimeout(mobBlockSync,120);};
 document.addEventListener('click',sync,true);
 document.addEventListener('touchend',sync,true);
 mobS.built=true;
}
function mobMenu(open){
 mobS.menu=!!open;
 mobS.el.menu.classList.toggle('a',mobS.menu);
 if(mobS.menu)mobClearAll();
}

/* ---- layout: recomputed on every resize / orientation change ---- */
function mobLayout(){
 if(!mobS.on||!mobS.built)return;
 const vv=window.visualViewport;
 const W=Math.round(vv?vv.width:innerWidth), H=Math.round(vv?vv.height:innerHeight);
 if(W<2||H<2)return;
 mobS.W=W;mobS.H=H;mobS.land=W>H;
 const R=mobCFG.R, K=mobCFG.knob;
 // #ui is pinned to the VISUAL viewport height, so a shrinking iOS URL bar can
 // never park itself on top of the control band (the classic 100vh bug).
 const de=document.documentElement.style;
 de.setProperty('--mobH',H+'px');
 const E=mobS.el;
 const base=Math.round(mobS.land?Math.min(128,H*0.34):Math.min(158,H*0.21));
 // notch / home-indicator insets (viewport-fit=cover means the page runs under them)
 const sB=Math.min(E.safe?E.safe.offsetHeight:0,48);
 const sL=Math.min(E.safe?E.safe.offsetWidth:0,48);
 const sR=Math.min(E.safe2?E.safe2.offsetWidth:0,48);
 mobS.safe=[sL,sR,sB];
 const band=base+sB;                        // the band swallows the home indicator
 mobS.band=band;
 de.setProperty('--mobBand',band+'px');
 const rowH=38, rowB=band+6;
 const thrB=rowB+rowH+10, thrW=40;
 const thrH=Math.round(clamp(H-thrB-(mobS.land?52:96),110,240));
 // In landscape the left edge belongs to the #tl readout panel, so the throttle
 // moves to the right edge (where #tr is hidden anyway).
 mobS.thrSide=mobS.land?'R':'L';
 const thrX=mobS.land?(W-thrW-6-sR):(6+sL);
 // stick homes: bottom corners of the band, always drawn so they are discoverable
 mobS.hLx=Math.max(R+8+sL,Math.round(W*0.14));mobS.hLy=H-sB-Math.round(base*0.5);
 mobS.hRx=Math.min(W-R-8-sR,Math.round(W*0.86));mobS.hRy=mobS.hLy;
 // stick activation zones — generous; the ring re-centres wherever the thumb lands
 mobS.zL=[0,H-band,Math.round(W*0.42),H];
 mobS.zR=[Math.round(W*0.58),H-band,W,H];
 // Throttle grab zone: 16 px wider than the visual so fat thumbs still catch it, and
 // 10 px taller at the top. It deliberately does NOT extend below the slider — the
 // button row starts 10 px under it and the browser's own touch-adjustment already
 // snaps near-misses onto those buttons.
 mobS.zT=[thrX-16,H-thrB-thrH-10,thrX+thrW+16,H-thrB-2];
 mobS.thrTop=H-thrB-thrH;mobS.thrH=thrH;

 E.thr.style.cssText='position:absolute;left:'+thrX+'px;bottom:'+thrB+'px;width:'+thrW+
  'px;height:'+thrH+'px';
 E.d0.style.bottom='0px';E.d5.style.bottom=((thrH*0.5)|0)+'px';
 E.row.style.cssText='position:absolute;left:'+(4+sL)+'px;right:'+(4+sR)+'px;bottom:'+
  rowB+'px;height:'+rowH+'px';
 E.roll.style.cssText='position:absolute;left:50%;transform:translateX(-50%);bottom:'+
  (sB+Math.max(6,((base-38)*0.5)|0))+'px';
 for(const s of [E.sL,E.sR]){
  s.style.width=s.style.height=(R*2)+'px';
  const k=s.querySelector('i');
  k.style.width=k.style.height=K+'px';
  k.style.left=k.style.top=(R-K*0.5)+'px';
 }
 // keep the HUD clear of the control band
 document.body.classList.toggle('mobLand',mobS.land);
 const nav=$('nav'),tl=$('tl'),tr=$('tr'),msg=$('msg'),sub=$('sub');
 if(nav){
  nav.style.bottom=thrB+'px';
  // Portrait: navball centred. Landscape: pushed to the right (where #tr is
  // hidden) so the centre column stays free for the message lines.
  if(mobS.land){nav.style.left='auto';nav.style.right=(sR+52)+'px';nav.style.transform='none';}
  else {nav.style.left='50%';nav.style.right='auto';nav.style.transform='translateX(-50%)';}
 }
 if(mobS.land&&tr)tr.style.display='none';       // no room for the second panel in landscape
 else if(tr)tr.style.display='';
 if(tl)tl.style.maxWidth=(W*0.46)+'px';
 if(msg)msg.style.left=mobS.land?'40%':'50%';
 if(sub){sub.style.left=mobS.land?'40%':'50%';
  sub.style.maxWidth=Math.round(mobS.land?W*0.50:W*0.86)+'px';}
 E.sL._mobSig=E.sR._mobSig=null;            // invalidate the paint memo after a relayout
 mobPaintSticks();
 mobThrPaint(mobAxes.throttle);
}

/* ---- throttle ---- */
function mobThrRaw(y){return sat(1-(y-mobS.thrTop)/mobS.thrH);}
// Grabbing the knob itself drags relatively (no jump); grabbing anywhere else on
// the track jumps to that value, which is what a slider should do. Dragging all
// the way to either end always commits to that end, so a relative grab can never
// make 0 % or 100 % unreachable.
function mobThrVal(r,y){
 const raw=mobThrRaw(y), m=Math.max(0.01,6/mobS.thrH);   // last 6 px of the track
 if(raw<=m)return 0;
 if(raw>=1-m)return 1;
 return raw+r.off;
}
function mobThrGrab(id,x,y){
 if(mobHasKind('T'))return;                 // one finger owns the slider at a time
 const raw=mobThrRaw(y);
 const cur=(typeof SHIP!=='undefined')?SHIP.throttle:mobAxes.throttle;
 // relative only if the thumb landed within ~24 px of the knob
 const near=Math.abs(raw-cur)*mobS.thrH<24;
 const r={kind:'T',x:x,y:y,ox:x,oy:y,off:near?(cur-raw):0};
 mobT.set(id,r);
 mobThrSet(mobThrVal(r,y));
}
function mobThrSet(t){
 t=sat(t);
 // magnetic detents at 0 / 50 / 100 %
 if(t<0.045)t=0;else if(t>0.955)t=1;else if(Math.abs(t-0.5)<0.045)t=0.5;
 mobAxes.throttle=t;
 if(typeof SHIP!=='undefined')SHIP.throttle=t;   // single source of truth
 mobThrPaint(t);
}
function mobThrPaint(t){
 const E=mobS.el;if(!E.thrFill)return;
 const p=sat(t)*100;
 E.thrFill.style.height=p.toFixed(1)+'%';
 E.thrKnob.style.bottom=(sat(t)*(mobS.thrH-3)).toFixed(0)+'px';
 E.thrTxt.textContent=Math.round(p)+'%';
}

/* ---- touch pipeline ---- */
function mobDown(e){
 if(!mobS.on)return;
 if(mobBlocked())return;
 for(const t of e.changedTouches){
  const x=t.clientX,y=t.clientY;
  if(mobHit(mobS.zT,x,y)&&!mobHasKind('T')){mobThrGrab(t.identifier,x,y);continue;}
  let kind='C';
  if(mobHit(mobS.zL,x,y)&&!mobHasKind('L'))kind='L';
  else if(mobHit(mobS.zR,x,y)&&!mobHasKind('R'))kind='R';
  const R=mobCFG.R;
  const rec={kind:kind,x:x,y:y,ox:x,oy:y};
  if(kind==='L'||kind==='R'){                       // floating origin, kept on screen
   rec.ox=clamp(x,R+4,mobS.W-R-4);
   rec.oy=clamp(y,R+4,mobS.H-R-4);
  }
  mobT.set(t.identifier,rec);
 }
 mobCamStep(true);
 mobPaintSticks();
 if(e.cancelable)e.preventDefault();
}
function mobMove(e){
 if(!mobS.on)return;
 let touched=false;
 for(const t of e.changedTouches){
  const r=mobT.get(t.identifier);if(!r)continue;
  touched=true;r.x=t.clientX;r.y=t.clientY;
  if(r.kind==='T')mobThrSet(mobThrVal(r,t.clientY));
 }
 if(!touched)return;
 mobCamStep(false);
 mobPaintSticks();
 if(e.cancelable)e.preventDefault();       // stop scroll / pull-to-refresh
}
function mobUp(e){
 if(!mobS.on)return;
 for(const t of e.changedTouches)mobT.delete(t.identifier);
 // Belt and braces: rebuild from what the browser still reports live, so a finger
 // that slid off, was stolen by the system, or whose end event was dropped can
 // never leave an axis latched.
 const live=new Set();
 if(e.touches)for(const t of e.touches)live.add(t.identifier);
 for(const id of Array.from(mobT.keys()))if(!live.has(id))mobT.delete(id);
 mobCamStep(true);
 mobAxesFromTouches();                      // zero the released axis THIS event,
 mobPaintSticks();                          // not one frame later
}
function mobClearAll(){mobT.clear();mobS.rollBtn=0;mobS.twist=0;mobS.cN=0;mobS.cIds='';
 mobAxes.pitch=mobAxes.yaw=mobAxes.roll=mobAxes.tx=mobAxes.ty=0;
 if(mobS.el.rl){mobS.el.rl.classList.remove('on');mobS.el.rr.classList.remove('on');}
 mobPaintSticks();}

/* ---- camera: 1 finger orbits, 2 fingers pinch-zoom + twist-roll ---- */
function mobCamStep(reanchor){
 const c=[];
 for(const [id,r] of mobT)if(r.kind==='C')c.push([id,r]);
 c.sort((a,b)=>a[0]-b[0]);
 const n=Math.min(c.length,2);
 const ids=n?c.slice(0,n).map(a=>a[0]).join(','):'';
 const same=(n===mobS.cN&&ids===mobS.cIds&&!reanchor);
 if(n===0){mobS.cN=0;mobS.cIds='';mobS.twist=0;return;}
 if(n===1){
  const p=c[0][1];
  if(same&&typeof CAM!=='undefined'){
   CAM.yaw-=(p.x-mobS.cX)*0.0062;
   CAM.pitch=clamp(CAM.pitch+(p.y-mobS.cY)*0.0062,-1.35,1.35);
  }
  mobS.cX=p.x;mobS.cY=p.y;mobS.twist=0;
 } else {
  const a=c[0][1],b=c[1][1];
  const dx=b.x-a.x,dy=b.y-a.y;
  const d=Math.max(1e-3,Math.hypot(dx,dy)), ang=Math.atan2(dy,dx);
  if(same&&typeof CAM!=='undefined'){
   CAM.dist=clamp(CAM.dist*(mobS.cD/d),12,900);
   let da=ang-mobS.cA;
   while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
   mobS.twist=clamp(mobS.twist+da,-1.2,1.2);
  } else mobS.twist=0;
  mobS.cD=d;mobS.cA=ang;
 }
 mobS.cN=n;mobS.cIds=ids;
}

/* ---- visuals ---- */
function mobPaintSticks(){
 const E=mobS.el;if(!E.sL)return;
 const R=mobCFG.R, K=mobCFG.knob, reach=R-K*0.5-3;
 // memoised: this runs every frame, and a phone has no budget for style churn
 // on a control nobody is touching.
 const one=(el,kind,hx,hy)=>{
  const rec=mobFind(kind);
  const cx=rec?rec.ox:hx, cy=rec?rec.oy:hy;
  let dx=0,dy=0;
  if(rec){
   dx=(rec.x-rec.ox)/R;dy=(rec.y-rec.oy)/R;
   const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
  }
  const sig=cx+'|'+cy+'|'+dx.toFixed(3)+'|'+dy.toFixed(3)+'|'+(rec?1:0);
  if(el._mobSig===sig)return;
  el._mobSig=sig;
  el.classList.toggle('a',!!rec);
  el.style.left=(cx-R)+'px';el.style.top=(cy-R)+'px';
  el.querySelector('i').style.transform=
   'translate('+(dx*reach).toFixed(1)+'px,'+(dy*reach).toFixed(1)+'px)';
 };
 one(E.sL,'L',mobS.hLx,mobS.hLy);one(E.sR,'R',mobS.hRx,mobS.hRy);
}

/* ---- axis extraction (also called straight from touchend for zero latency) ---- */
function mobAxesFromTouches(){
 let lx=0,ly=0,rx=0,ry=0;
 for(const r of mobT.values()){
  if(r.kind==='L'){lx=(r.x-r.ox)/mobCFG.R;ly=(r.y-r.oy)/mobCFG.R;}
  else if(r.kind==='R'){rx=(r.x-r.ox)/mobCFG.R;ry=(r.y-r.oy)/mobCFG.R;}
 }
 const cl=(x,y)=>{const l=Math.hypot(x,y);return l>1?1/l:1;};
 let s=cl(lx,ly);lx*=s;ly*=s;
 s=cl(rx,ry);rx*=s;ry*=s;
 mobAxes.yaw=mobCurve(rx);
 mobAxes.pitch=mobCurve(ry);                 // screen-down = nose-up, like a stick
 mobAxes.tx=mobCurve(lx);
 mobAxes.ty=-mobCurve(ly);
 // roll: buttons win, otherwise the two-finger twist
 let roll=mobS.rollBtn;
 if(!roll&&Math.abs(mobS.twist)>mobCFG.twistDead){
  const t=(Math.abs(mobS.twist)-mobCFG.twistDead)/mobCFG.twistFull;
  roll=Math.sign(mobS.twist)*Math.min(1,t);
 }
 mobAxes.roll=roll;
}

/* ---- per-frame ---- */
function mobUpdate(dt){
 if(!mobS.on)return;
 mobAxesFromTouches();
 if(!mobHasKind('T')&&typeof SHIP!=='undefined'&&
    Math.abs(SHIP.throttle-mobAxes.throttle)>1e-4){
  mobAxes.throttle=SHIP.throttle;mobThrPaint(SHIP.throttle);   // the sim may cut it (no fuel)
 }
 mobPaintSticks();
 // reflect toggle state on our own buttons
 const E=mobS.el;
 if(E.b&&typeof SHIP!=='undefined'){
  E.b.sas.classList.toggle('on',!!SHIP.sas);
  E.b.rcs.classList.toggle('on',!!SHIP.rcsOn);
  E.b.gear.classList.toggle('on',!!SHIP.gearDown);
  E.b.brk.classList.toggle('on',!!SHIP.brakes);
  if(typeof CTX!=='undefined')E.b.view.classList.toggle('on',!CTX.view3rd);
 }
 mobBlockSync();
}
/* Hide + deactivate the controls while a full-screen panel (docs, wormhole
   picker, star map, systems menu) is up. Driven per-frame AND straight off the
   click that opens the panel, so it never waits a frame at 30 fps or less. */
function mobBlockSync(){
 if(!mobS.on||!mobS.built)return;
 const E=mobS.el, blocked=mobBlocked();
 if(blocked&&mobT.size)mobClearAll();
 E.wrap.style.visibility=(blocked&&!mobS.menu)?'hidden':'';
 E.root.style.pointerEvents=blocked?'none':'auto';
}

/* ---- enable / disable ---- */
function mobSetEnabled(on){
 mobAxes.active=mobS.on=!!on;
 document.body.classList.toggle('mobOn',mobS.on);
 if(mobS.on){
  mobBuild();
  mobS.el.root.style.display='';mobS.el.wrap.style.display='';
  mobLayout();
 } else if(mobS.built){
  mobClearAll();
  mobS.el.root.style.display='none';mobS.el.wrap.style.display='none';
  document.documentElement.style.removeProperty('--mobH');
  document.body.classList.remove('mobLand');
  const nav=$('nav');if(nav)nav.style.cssText='';
  const tr=$('tr');if(tr)tr.style.display='';
  const msg=$('msg'),sub=$('sub');
  if(msg)msg.style.left='';
  if(sub){sub.style.left='';sub.style.maxWidth='';}
 }
 return mobS.on;
}
/* Deciding whether this is a touch device.
   IS_MOBILE (p3-gl.js) is a UA sniff, and a UA sniff alone is not enough: an
   iPad reports a desktop UA, and every automated phone harness that does not
   forge a UA would silently get no controls at all. Require an actual touch
   digitiser AND either a coarse pointer or a phone-sized viewport, so a desktop
   with a touchscreen keeps its keyboard/mouse UI. */
function mobWantTouch(){
 try{
  if(/[?#&](touch|mobile)/i.test(location.search+location.hash))return true;
  if(localStorage.getItem('seg_touch')==='1')return true;
  if(/[?#&]desktop/i.test(location.search+location.hash))return false;
 }catch(e){}
 if(typeof IS_MOBILE!=='undefined'&&IS_MOBILE)return true;
 const touch=(navigator.maxTouchPoints|0)>0||('ontouchstart' in window);
 if(!touch)return false;
 const coarse=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
 const small=Math.min(innerWidth,innerHeight)<=820;
 return coarse||small;
}
function mobInit(){
 const want=mobWantTouch();
 mobBuild();
 mobSetEnabled(want);
 if(!want){mobS.el.root.style.display='none';mobS.el.wrap.style.display='none';}
 // any real touch turns the scheme on, even if the sniff said "desktop"
 addEventListener('touchstart',function once(){
  if(!mobS.on){mobSetEnabled(true);}
  removeEventListener('touchstart',once,true);
 },{capture:true,passive:true});
 const relay=()=>{mobClearAll();mobLayout();setTimeout(mobLayout,60);setTimeout(mobLayout,320);};
 addEventListener('resize',relay);
 addEventListener('orientationchange',relay);
 if(window.matchMedia){const mq=matchMedia('(orientation:portrait)');
  if(mq.addEventListener)mq.addEventListener('change',relay);}
 if(window.visualViewport){window.visualViewport.addEventListener('resize',mobLayout);
  window.visualViewport.addEventListener('scroll',mobLayout);}
 return mobS.on;
}

function mobSelfTest(){
 try{
  if(typeof mobAxes!=='object')return {ok:false,why:'mobAxes missing'};
  if(mobCurve(0.05)!==0)return {ok:false,why:'dead zone not applied'};
  if(Math.abs(mobCurve(1)-1)>1e-9)return {ok:false,why:'curve does not reach 1'};
  if(Math.abs(mobCurve(-1)+1)>1e-9)return {ok:false,why:'curve not odd'};
  if(mobCurve(0.6)>=0.6)return {ok:false,why:'expo should soften mid-stick'};
  if(!mobHit([0,0,10,10],5,5)||mobHit([0,0,10,10],11,5))return {ok:false,why:'hit test'};
  if(!isFinite(mobCurve(NaN)|0)) return {ok:false,why:'NaN leak'};
  if(mobS.built){
   if(!$('mobRoot')||!$('mobThr')||!$('mobRow'))return {ok:false,why:'DOM not built'};
   if(mobS.on){
    if(mobS.zL[2]<=0||mobS.zR[2]<=mobS.zR[0])return {ok:false,why:'zones not laid out'};
    if(mobS.zL[2]>=mobS.zR[0])return {ok:false,why:'stick zones overlap'};
    const r=$('mobRow').getBoundingClientRect();
    if(r.bottom>mobS.H+1||r.top<0)return {ok:false,why:'button row off screen'};
    const t=$('mobThr').getBoundingClientRect();
    if(t.bottom>mobS.H+1||t.top<0||t.width<10)return {ok:false,why:'throttle off screen'};
   }
  }
  return {ok:true};
 }catch(err){return {ok:false,why:String(err&&err.message||err)};}
}
// Test hook: everything in this build lives inside one IIFE, so a harness has no
// other way to observe the touch layer. Mirrors window.SEGDBG (p9b-main.js).
try{window.MOBDBG={axes:mobAxes,cfg:mobCFG,S:mobS,T:mobT,selfTest:mobSelfTest,
 layout:mobLayout,setEnabled:mobSetEnabled,get CAM(){return typeof CAM!=='undefined'?CAM:null;}};
}catch(e){}

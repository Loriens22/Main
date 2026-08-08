/* ===== M2 — MOBILE TOUCH CONTROLS ==========================================
   Owns its own DOM (appended to #ui) and its own touch pipeline. Nothing here
   depends on the legacy #skL/#skR sticks or on TOUCH — those are hidden when
   this module takes over. The flight model reads `mobAxes`.

   Layout (all measured from the bottom of the VISUAL viewport, so the iOS URL
   bar can never sit on top of a control):

     ┌───────────────────────────────────────────┐
     │  HUD (untouched)                          │
     │        ▓ throttle slider (left edge)      │
     │              ( navball )                  │
     │  [SAS][RCS][GER][BRK][VIW][W-][W+][MENU]  │  compact row
     │  ╭ left stick ╮   [RL◀][RL▶]  ╭ right ╮   │  activation band
     └───────────────────────────────────────────┘

   Left stick  : RCS translation  (X = lateral, Y = vertical)
   Right stick : pitch / yaw
   Roll        : dedicated hold buttons OR a two-finger twist anywhere on the
                 free (camera) area
   Throttle    : absolute vertical slider, detents at 0 / 50 / 100 %, holds
   Camera      : one-finger drag on the free area orbits; pinch dollies
   ========================================================================== */
const mobAxes={active:false,pitch:0,yaw:0,roll:0,tx:0,ty:0,throttle:0};
const mobCFG={R:54,dead:0.11,expo:0.60,twistDead:0.10,twistFull:0.55};
const mobT=new Map();                      // Touch.identifier -> tracker record
const mobS={on:false,built:false,W:0,H:0,land:false,band:0,
 zL:[0,0,0,0],zR:[0,0,0,0],zT:[0,0,0,0],
 thrTop:0,thrH:1,thrDrag:false,
 rollBtn:0,twist:0,menu:false,
 cN:0,cIds:'',cX:0,cY:0,cD:0,cA:0,
 el:{}};

/* ---- helpers ---- */
function mobHit(z,x,y){return x>=z[0]&&x<=z[2]&&y>=z[1]&&y<=z[3];}
function mobHasKind(k){for(const r of mobT.values())if(r.kind===k)return true;return false;}
// dead zone + cubic expo, so small thumb wobble is nothing and the tips stay precise
function mobCurve(x){
 const d=mobCFG.dead, a=Math.abs(clamp(x,-1,1));
 if(a<=d)return 0;
 const n=(a-d)/(1-d), e=mobCFG.expo;
 return Math.sign(x)*(e*n*n*n+(1-e)*n);
}
function mobBlocked(){
 if(mobS.menu)return true;
 const p=$('pick'),d=$('docs');
 return !!((p&&p.style.display==='block')||(d&&d.style.display==='block'));
}

/* ---- CSS (injected; p1-shell.html is untouched) ---- */
const MOB_CSS=`
#mobRoot{position:absolute;inset:0;pointer-events:auto;z-index:11;touch-action:none}
#mobUI{position:absolute;inset:0;pointer-events:none;z-index:12;touch-action:none}
#pick,#docs{z-index:60}
body.mobOn #stick,body.mobOn #row2,body.mobOn #btns,body.mobOn #thr{display:none!important}
body.mobOn #ui{bottom:auto;height:var(--mobH,100%)}
body.mobOn #fps{top:auto;bottom:2px;left:6px;transform:none;font-size:9px;opacity:.65}
.mobStk{position:absolute;border-radius:50%;border:1px solid rgba(90,190,255,.34);
 background:radial-gradient(circle,rgba(10,26,46,.34),rgba(6,14,26,.10));
 opacity:0;transition:opacity .13s;pointer-events:none;will-change:transform,opacity}
.mobStk.a{opacity:1}
.mobStk>i{position:absolute;border-radius:50%;background:rgba(90,190,255,.34);
 border:1px solid rgba(150,225,255,.72);box-shadow:0 0 14px rgba(80,190,255,.35)}
.mobStk>u{position:absolute;inset:22%;border-radius:50%;border:1px dashed rgba(90,190,255,.20)}
#mobThr{position:absolute;pointer-events:auto;border:1px solid rgba(90,190,255,.38);
 border-radius:5px;background:rgba(4,10,20,.55);overflow:hidden;touch-action:none}
#mobThr>i{position:absolute;left:0;right:0;bottom:0;height:0%;
 background:linear-gradient(0deg,#ff7a1d,#ffd479);transition:height .05s linear}
#mobThr>s{position:absolute;left:0;right:0;height:1px;background:rgba(160,220,255,.45)}
#mobThr>b{position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:8px;
 color:#eaf8ff;text-shadow:0 0 4px #000;font-weight:700}
#mobThr>k{position:absolute;left:-2px;right:-2px;height:3px;border-radius:2px;
 background:#eaf8ff;box-shadow:0 0 8px rgba(120,210,255,.9)}
#mobRow{position:absolute;display:flex;gap:3px;pointer-events:none}
.mobB{pointer-events:auto;flex:1 1 0;min-width:0;background:rgba(8,20,36,.82);
 border:1px solid rgba(90,190,255,.42);color:#a8e4ff;border-radius:5px;
 font:inherit;font-size:9.5px;letter-spacing:.04em;padding:0;
 display:flex;align-items:center;justify-content:center;touch-action:none;
 -webkit-user-select:none;user-select:none}
.mobB:active,.mobB.on{background:rgba(30,140,220,.55);border-color:#7fe6ff;color:#eaf8ff}
#mobRoll{position:absolute;display:flex;gap:5px;pointer-events:none}
.mobR{pointer-events:auto;width:42px;height:40px;border-radius:8px;
 background:rgba(8,20,36,.72);border:1px solid rgba(90,190,255,.38);color:#a8e4ff;
 font:inherit;font-size:15px;display:flex;align-items:center;justify-content:center;
 touch-action:none;-webkit-user-select:none;user-select:none}
.mobR:active,.mobR.on{background:rgba(30,140,220,.55);border-color:#7fe6ff}
#mobMenu{position:absolute;inset:0;z-index:40;background:rgba(2,8,18,.93);display:none;
 pointer-events:auto;padding:16px;overflow:auto;touch-action:pan-y}
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
@supports (height:100dvh){body.mobOn #ui{height:100dvh}}
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
 E.sL=mk('div',null,E.wrap,'<u></u><i></i>');E.sL.className='mobStk';
 E.sR=mk('div',null,E.wrap,'<u></u><i></i>');E.sR.className='mobStk';
 E.thr=mk('div','mobThr',E.wrap,'<i></i><s class="d0"></s><s class="d5"></s><k></k><b>0%</b>');
 E.thrFill=E.thr.querySelector('i');E.thrKnob=E.thr.querySelector('k');
 E.thrTxt=E.thr.querySelector('b');
 E.d0=E.thr.querySelector('.d0');E.d5=E.thr.querySelector('.d5');
 E.row=mk('div','mobRow',E.wrap);
 const BT=[['sas','SAS'],['rcs','RCS'],['gear','GER'],['brk','BRK'],
           ['view','VIW'],['wl','W-'],['wm','W+'],['menu','≡']];
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
  '<button data-k="map">MAP</button>'+
  '<button data-k="docs">DOCUMENTATION</button>'+
  '<button data-k="cam">RESET CAMERA</button>'+
  '<button class="wide" data-k="close">CLOSE</button></div>'+
  '<div class="lg">Left stick&nbsp;— RCS translate&nbsp;· Right stick&nbsp;— pitch/yaw<br>'+
  'Slider&nbsp;— throttle (detents at 0/50/100%)&nbsp;· ↺↻ or two-finger twist&nbsp;— roll<br>'+
  'Drag the sky to orbit the camera&nbsp;· pinch to zoom</div>');

 /* buttons: fire on touchstart for zero latency, with a click fallback for
    desktop / automated testing, de-duplicated by a short guard window. */
 const tap=(el,fn)=>{let t0=-1e9;
  const go=()=>{const n=performance.now();if(n-t0<220)return;t0=n;fn();};
  el.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();go();},{passive:false});
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
   if(k==='cam'){if(typeof CAM!=='undefined'){CAM.yaw=0.4;CAM.pitch=0.25;CAM.dist=78;}
    mobMenu(false);return;}
   mobMenu(false);
   const b=$('b_'+k);if(b)b.click();
  });});

 // hold-to-roll
 const hold=(el,v)=>{
  const dn=e=>{if(e.cancelable)e.preventDefault();e.stopPropagation();
   mobS.rollBtn=v;el.classList.add('on');};
  const up=()=>{if(mobS.rollBtn===v)mobS.rollBtn=0;el.classList.remove('on');};
  el.addEventListener('touchstart',dn,{passive:false});
  el.addEventListener('touchend',up);el.addEventListener('touchcancel',up);
  el.addEventListener('pointerdown',dn);el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up);
 };
 hold(E.rl,-1);hold(E.rr,1);

 // throttle: absolute drag, tracked by identifier through mobRoot's pipeline,
 // but also grab its own touches so a thumb starting exactly on it always wins.
 E.thr.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();
  for(const t of e.changedTouches){mobT.set(t.identifier,{kind:'T',x:t.clientX,y:t.clientY,
   ox:t.clientX,oy:t.clientY});mobThrFrom(t.clientY);}},{passive:false});

 // the main touch pipeline
 E.root.addEventListener('touchstart',mobDown,{passive:false});
 addEventListener('touchmove',mobMove,{passive:false});
 addEventListener('touchend',mobUp,{passive:false});
 addEventListener('touchcancel',mobUp,{passive:false});
 // iOS Safari pinch-zoom / double-tap zoom
 addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
 addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
 addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
 // never leave an input latched when the page is backgrounded
 addEventListener('visibilitychange',()=>{if(document.hidden)mobClearAll();});
 addEventListener('blur',mobClearAll);
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
 document.documentElement.style.setProperty('--mobH',H+'px');
 const E=mobS.el;
 const band=Math.round(Math.min(mobS.land?150:172,H*(mobS.land?0.40:0.22)));
 mobS.band=band;
 const rowH=34, rowB=band+6;
 const thrB=rowB+rowH+8, thrW=40;
 const thrH=Math.max(110,Math.min(230,H-thrB-64));
 // stick activation zones — generous, the stick centres wherever the thumb lands
 mobS.zL=[0,H-band,Math.round(W*0.40),H];
 mobS.zR=[Math.round(W*0.60),H-band,W,H];
 // throttle grab zone is 14 px wider than the visual so fat thumbs still catch it
 mobS.zT=[0,H-thrB-thrH,thrW+16,H-thrB];
 mobS.thrTop=H-thrB-thrH;mobS.thrH=thrH;

 E.thr.style.cssText='position:absolute;left:6px;bottom:'+thrB+'px;width:'+thrW+
  'px;height:'+thrH+'px';
 E.d0.style.bottom='0px';E.d5.style.bottom=(thrH*0.5|0)+'px';
 E.row.style.cssText='position:absolute;left:4px;right:4px;bottom:'+rowB+'px;height:'+rowH+'px';
 E.roll.style.cssText='position:absolute;left:50%;transform:translateX(-50%);bottom:'+
  Math.max(6,((band-40)*0.5)|0)+'px';
 const R=mobCFG.R;
 for(const s of [E.sL,E.sR]){
  s.style.width=s.style.height=(R*2)+'px';
  const k=s.querySelector('i');k.style.width=k.style.height='40px';
 }
 // keep the HUD clear of the control band
 const nav=$('nav'),tl=$('tl'),tr=$('tr');
 if(nav)nav.style.bottom=thrB+'px';
 if(mobS.land&&tr)tr.style.display='none';       // no room for the second panel in landscape
 else if(tr)tr.style.display='';
 if(tl)tl.style.maxWidth=(W*0.46)+'px';
 mobPaintSticks();
 mobThrPaint(typeof SHIP!=='undefined'?SHIP.throttle:0);
}

/* ---- throttle ---- */
function mobThrFrom(y){
 let t=sat(1-(y-mobS.thrTop)/mobS.thrH);
 // magnetic detents at 0 / 50 / 100 %
 if(t<0.045)t=0;else if(t>0.955)t=1;else if(Math.abs(t-0.5)<0.045)t=0.5;
 mobAxes.throttle=t;
 if(typeof SHIP!=='undefined')SHIP.throttle=t;   // single source of truth
 mobThrPaint(t);
}
function mobThrPaint(t){
 const E=mobS.el;if(!E.thrFill)return;
 const p=(sat(t)*100);
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
  let kind='C';
  if(mobHit(mobS.zT,x,y)&&!mobHasKind('T'))kind='T';
  else if(mobHit(mobS.zL,x,y)&&!mobHasKind('L'))kind='L';
  else if(mobHit(mobS.zR,x,y)&&!mobHasKind('R'))kind='R';
  const R=mobCFG.R;
  const rec={kind:kind,x:x,y:y,ox:x,oy:y};
  if(kind==='L'||kind==='R'){                       // floating origin, kept on screen
   rec.ox=clamp(x,R+4,mobS.W-R-4);
   rec.oy=clamp(y,R+4,mobS.H-R-4);
  }
  mobT.set(t.identifier,rec);
  if(kind==='T')mobThrFrom(y);
 }
 mobCamStep(true);
 if(e.cancelable)e.preventDefault();
}
function mobMove(e){
 if(!mobS.on)return;
 let touched=false;
 for(const t of e.changedTouches){
  const r=mobT.get(t.identifier);if(!r)continue;
  touched=true;r.x=t.clientX;r.y=t.clientY;
  if(r.kind==='T')mobThrFrom(t.clientY);
 }
 if(!touched)return;
 mobCamStep(false);
 if(e.cancelable)e.preventDefault();       // stop scroll / pull-to-refresh
}
function mobUp(e){
 if(!mobS.on)return;
 for(const t of e.changedTouches)mobT.delete(t.identifier);
 // Belt and braces: rebuild from what the browser still reports live, so a finger
 // that slid off, was stolen by the system, or whose end event was dropped can
 // never leave an axis latched.
 const live=new Set();
 for(const t of e.touches)live.add(t.identifier);
 for(const id of Array.from(mobT.keys()))if(!live.has(id))mobT.delete(id);
 if(!mobHasKind('T'))mobS.thrDrag=false;
 mobCamStep(true);
}
function mobClearAll(){mobT.clear();mobS.rollBtn=0;mobS.twist=0;mobS.cN=0;mobS.cIds='';
 mobAxes.pitch=mobAxes.yaw=mobAxes.roll=mobAxes.tx=mobAxes.ty=0;mobPaintSticks();}

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
 const R=mobCFG.R;
 const one=(el,kind)=>{
  let rec=null;
  for(const r of mobT.values())if(r.kind===kind){rec=r;break;}
  if(!rec){el.classList.remove('a');return;}
  el.classList.add('a');
  el.style.left=(rec.ox-R)+'px';el.style.top=(rec.oy-R)+'px';
  let dx=(rec.x-rec.ox)/R, dy=(rec.y-rec.oy)/R;
  const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
  const k=el.querySelector('i');
  k.style.left=(R-20+dx*(R-22))+'px';k.style.top=(R-20+dy*(R-22))+'px';
 };
 one(E.sL,'L');one(E.sR,'R');
}

/* ---- per-frame ---- */
function mobUpdate(dt){
 if(!mobS.on)return;
 let lx=0,ly=0,rx=0,ry=0,tOn=false;
 for(const r of mobT.values()){
  if(r.kind==='L'){lx=(r.x-r.ox)/mobCFG.R;ly=(r.y-r.oy)/mobCFG.R;}
  else if(r.kind==='R'){rx=(r.x-r.ox)/mobCFG.R;ry=(r.y-r.oy)/mobCFG.R;}
  else if(r.kind==='T')tOn=true;
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
 if(!tOn&&typeof SHIP!=='undefined'&&Math.abs(SHIP.throttle-mobAxes.throttle)>1e-4){
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
 // hide the controls while a full-screen panel is up
 const blocked=mobBlocked();
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
  const nav=$('nav');if(nav)nav.style.bottom='';
  const tr=$('tr');if(tr)tr.style.display='';
 }
 return mobS.on;
}
function mobInit(){
 let force=false;
 try{force=/[?#&]touch/i.test(location.search+location.hash)||
  localStorage.getItem('seg_touch')==='1';}catch(e){}
 const want=(typeof IS_MOBILE!=='undefined'&&IS_MOBILE)||force;
 mobBuild();
 mobSetEnabled(want);
 if(!want){mobS.el.root.style.display='none';mobS.el.wrap.style.display='none';}
 // any real touch turns the scheme on, even if the UA sniff said "desktop"
 addEventListener('touchstart',function once(){
  if(!mobS.on)mobSetEnabled(true);
  removeEventListener('touchstart',once,true);
 },{capture:true,passive:true});
 const relay=()=>{mobClearAll();setTimeout(mobLayout,0);setTimeout(mobLayout,260);};
 addEventListener('resize',relay);
 addEventListener('orientationchange',relay);
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
   if(mobS.on&&(mobS.zL[2]<=0||mobS.zR[2]<=mobS.zR[0]))return {ok:false,why:'zones not laid out'};
  }
  return {ok:true};
 }catch(err){return {ok:false,why:String(err&&err.message||err)};}
}

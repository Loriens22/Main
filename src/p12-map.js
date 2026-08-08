/* ===== STAR MAP — system (orbital / KSP map view) + galaxy (4096-system chart) =====
   Owner: agent M1.  Owns exactly one <canvas> of its own, drawn with the 2D API, plus a
   handful of DOM panels appended to #ui.  Every global here is prefixed `map`. */

const MAP_CSS=`
#map_root{position:absolute;inset:0;display:none;pointer-events:auto;z-index:60;
 font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:#cfe6ff;font-size:11px}
#map_cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.map_bar{position:absolute;display:flex;gap:5px;align-items:center;flex-wrap:wrap;z-index:2}
#map_tabs{top:8px;left:8px}
#map_tools{top:8px;right:8px;max-width:56vw;justify-content:flex-end}
.map_b{pointer-events:auto;background:rgba(8,20,36,.82);border:1px solid rgba(90,190,255,.4);
 color:#a8e4ff;border-radius:5px;min-height:34px;min-width:36px;padding:6px 10px;font:inherit;
 font-size:11px;letter-spacing:.08em;cursor:pointer;white-space:nowrap}
.map_b:active{background:rgba(30,120,200,.55)}
.map_b.on{background:rgba(30,140,220,.5);border-color:#7fe6ff;color:#eaf8ff}
.map_b.go{background:linear-gradient(180deg,rgba(120,40,200,.78),rgba(40,10,90,.9));
 border-color:#c79bff;color:#f0e0ff;font-weight:700;box-shadow:0 0 16px rgba(160,80,255,.4);
 width:100%;margin-top:8px;min-height:42px}
.map_b.go2{background:rgba(10,30,52,.9);border-color:#7fe6ff;color:#dff2ff;width:100%;
 margin-top:6px;min-height:38px}
#map_info{position:absolute;right:8px;top:52px;width:296px;max-height:calc(100% - 120px);
 overflow:auto;background:rgba(5,12,24,.9);border:1px solid rgba(90,190,255,.32);border-radius:6px;
 padding:10px 12px;backdrop-filter:blur(6px);display:none;z-index:3;
 box-shadow:0 0 30px rgba(0,120,255,.12) inset}
#map_info h3{font-size:14px;letter-spacing:.16em;color:#dff2ff;margin:0 0 2px;font-weight:600}
#map_info .k{color:#5d86a8;font-size:9px;letter-spacing:.14em;text-transform:uppercase}
#map_info .r{display:flex;justify-content:space-between;gap:10px;line-height:1.65}
#map_info .v{color:#a8e4ff;font-variant-numeric:tabular-nums}
#map_info .dsc{color:#8fc4e8;font-size:10px;line-height:1.6;margin:6px 0 2px;
 border-left:2px solid rgba(199,155,255,.45);padding-left:7px}
#map_info .warn{color:#ffb347;font-size:9.5px;margin-top:5px}
#map_search{position:absolute;top:52px;left:8px;width:236px;display:none;z-index:3}
#map_q{width:100%;background:rgba(5,12,24,.9);border:1px solid rgba(90,190,255,.35);border-radius:5px;
 color:#dff2ff;font:inherit;font-size:12px;padding:9px 10px;outline:none;min-height:38px}
#map_q:focus{border-color:#7fe6ff}
#map_res{margin-top:4px;max-height:40vh;overflow:auto;background:rgba(5,12,24,.92);
 border:1px solid rgba(90,190,255,.22);border-radius:5px;display:none}
#map_res div{padding:9px 10px;border-bottom:1px solid rgba(90,190,255,.12);cursor:pointer;
 color:#a8e4ff;min-height:36px}
#map_res div:active{background:rgba(40,20,70,.85);color:#f0e0ff}
#map_hint{position:absolute;left:8px;bottom:8px;color:#3d6a8f;font-size:9.5px;letter-spacing:.1em;
 line-height:1.6;pointer-events:none;z-index:2;max-width:52vw}
@media (max-width:600px){
 .map_b{min-height:44px;padding:9px 11px}
 #map_info{left:8px;right:8px;width:auto;top:auto;bottom:8px;max-height:47%}
 #map_search{width:calc(100% - 16px);top:60px}
 #map_hint{display:none}
}`;

/* ---- state ---- */
let mapRoot=null, mapCv=null, mapG=null, mapVisible=false, mapMode='sys', mapDPR=1;
let mapW=0, mapH=0, mapT=0, mapReady=false;
let mapFrame=null;                 // Body at the centre of the orbital view
let mapSel=null;                   // selected Body (system map)
let mapGalSel=-1, mapGalHover=-1;  // selected / hovered system id
let mapSysId=-1;                   // last SYSTEM.id we synced to
const mapCam={yaw:0.0,pitch:1.30,zoom:1,px:0,py:0,cy:1,sy:0,cp:0.27,sp:0.96};
const mapGalCam={yaw:0.6,pitch:0.55,zoom:1,px:0,py:0,dist:3.0,cy:1,sy:0,cp:1,sp:0,f:1,cx:0,cy0:0};
const mapView={r0:1,S:1,cx:0,cy:0,cyy:1,syy:0,cp:0,sp:1};
const mapHits=[];                  // {x,y,r,body}
const mapEl={};
let mapOrbCache=new WeakMap();
const mapP=[0,0,0], mapP2=[0,0,0], mapP3=[0,0,0];
const mapSN=192, mapShipPts=new Float64Array(mapSN*3);
const mapTmpA=new Float64Array(3), mapTmpB=new Float64Array(3), mapTmpC=new Float64Array(3);
/* galaxy tables */
let mapGalPos=null, mapGalSize=null, mapGalTint=null, mapGalNames=null, mapGalNeb=null;
let mapGalDirty=true, mapGalLast=-1e9, mapGlow=null, mapGlow2=null, mapGalQ='';
const mapInsetCam={yaw:0,pitch:1.3,zoom:1,px:0,py:0};
const mapRingR=[];
const MAP_GAL_LY=900;              // galaxy model radius 1.0 == 900 light years
const mapPalette=[];               // 24 precomputed star colour strings
/* input */
const mapPtrs=new Map();
let mapGest=null, mapDragged=false, mapDownT=0, mapDownX=0, mapDownY=0;
let mapCost=0, mapCostN=0, mapCostAvg=0;   // per-frame cost telemetry (ms)

/* ================= INIT ================= */
function mapInit(){
 if(mapRoot)return mapRoot;
 const st=document.createElement('style');st.textContent=MAP_CSS;document.head.appendChild(st);
 const host=document.getElementById('ui')||document.body;
 mapRoot=document.createElement('div');mapRoot.id='map_root';
 mapRoot.innerHTML=
  '<canvas id="map_cv"></canvas>'+
  '<div class="map_bar" id="map_tabs">'+
   '<button class="map_b on" id="map_tsys">SYSTEM</button>'+
   '<button class="map_b" id="map_tgal">GALAXY</button></div>'+
  '<div class="map_bar" id="map_tools">'+
   '<button class="map_b" id="map_rl">&#8634;</button>'+
   '<button class="map_b" id="map_rr">&#8635;</button>'+
   '<button class="map_b" id="map_tilt">TILT</button>'+
   '<button class="map_b" id="map_zo">&minus;</button>'+
   '<button class="map_b" id="map_zi">+</button>'+
   '<button class="map_b" id="map_home">RESET</button>'+
   '<button class="map_b" id="map_x">CLOSE</button></div>'+
  '<div id="map_search"><input id="map_q" placeholder="SEARCH SYSTEMS…" '+
   'autocomplete="off" spellcheck="false"><div id="map_res"></div></div>'+
  '<div id="map_info"></div>'+
  '<div id="map_hint"></div>';
 host.appendChild(mapRoot);
 const $m=id=>document.getElementById(id);
 mapCv=$m('map_cv');mapG=mapCv.getContext('2d',{alpha:true});
 mapEl.info=$m('map_info');mapEl.hint=$m('map_hint');mapEl.search=$m('map_search');
 mapEl.q=$m('map_q');mapEl.res=$m('map_res');
 mapEl.tsys=$m('map_tsys');mapEl.tgal=$m('map_tgal');mapEl.tilt=$m('map_tilt');
 mapEl.tsys.onclick=()=>mapSetMode('sys');
 mapEl.tgal.onclick=()=>mapSetMode('gal');
 $m('map_x').onclick=()=>mapToggle(false);
 $m('map_rl').onclick=()=>{mapCamOf().yaw-=0.26;mapGalDirty=true;};
 $m('map_rr').onclick=()=>{mapCamOf().yaw+=0.26;mapGalDirty=true;};
 mapEl.tilt.onclick=()=>{const c=mapCamOf();
  const P=[1.5533,1.05,0.62,0.22];let i=0,bd=9;
  for(let k=0;k<P.length;k++){const d=Math.abs(P[k]-c.pitch);if(d<bd){bd=d;i=k;}}
  c.pitch=P[(i+1)%P.length];mapGalDirty=true;};
 $m('map_zi').onclick=()=>mapZoom(1.45,mapW*0.5,mapH*0.5);
 $m('map_zo').onclick=()=>mapZoom(1/1.45,mapW*0.5,mapH*0.5);
 $m('map_home').onclick=()=>mapHome();
 mapEl.q.oninput=()=>mapSearch();
 mapEl.q.onkeydown=e=>{e.stopPropagation();};
 mapEl.q.onkeyup=e=>{e.stopPropagation();};
 mapBindInput();
 mapMakeGlow();
 mapHome();
 mapReady=true;
 return mapRoot;
}
function mapCamOf(){return mapMode==='sys'?mapCam:mapGalCam;}
function mapMakeGlow(){
 const mk=(r,g,b)=>{const c=document.createElement('canvas');c.width=c.height=64;
  const x=c.getContext('2d');const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+r+','+g+','+b+',1)');
  gr.addColorStop(0.35,'rgba('+r+','+g+','+b+',0.36)');
  gr.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
  x.fillStyle=gr;x.fillRect(0,0,64,64);return c;};
 mapGlow=mk(150,205,255);mapGlow2=mk(190,150,255);
}
function mapHome(){
 if(mapMode==='sys'){
  mapCam.yaw=0.0;mapCam.pitch=1.30;mapCam.zoom=1;mapCam.px=0;mapCam.py=0;
  mapFrame=(typeof SUN!=='undefined'&&SUN)?SUN:null;mapSel=null;
 } else {
  mapGalCam.yaw=0.6;mapGalCam.pitch=0.55;mapGalCam.zoom=1;mapGalCam.px=0;mapGalCam.py=0;
 }
 mapGalDirty=true;mapPanel();
}
function mapSetMode(m){
 mapMode=m;mapGalDirty=true;
 mapEl.tsys.classList.toggle('on',m==='sys');
 mapEl.tgal.classList.toggle('on',m==='gal');
 mapEl.search.style.display=(m==='gal')?'block':'none';
 if(m==='gal'&&!mapGalPos)mapBuildGalaxy();
 mapPanel();
}

/* ================= INPUT ================= */
function mapZoom(f,ax,ay){
 const c=mapCamOf();
 const z0=c.zoom;
 c.zoom=clamp(c.zoom*f,mapMode==='sys'?0.18:0.35,mapMode==='sys'?900:24);
 const k=c.zoom/z0;
 // keep the point under (ax,ay) fixed
 const cx=mapW*0.5+c.px, cy=mapH*0.5+c.py;
 c.px+=(cx-ax)*(k-1);c.py+=(cy-ay)*(k-1);
 mapGalDirty=true;
}
function mapBindInput(){
 const cv=mapCv;
 const loc=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
 cv.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();
  const p=loc(e);mapZoom(Math.pow(1.16,-Math.sign(e.deltaY)),p[0],p[1]);},{passive:false});
 cv.addEventListener('pointerdown',e=>{
  e.preventDefault();e.stopPropagation();
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  const p=loc(e);
  mapPtrs.set(e.pointerId,{x:p[0],y:p[1],sh:e.shiftKey||e.button===2});
  if(mapPtrs.size===1){mapDragged=false;mapDownT=performance.now();mapDownX=p[0];mapDownY=p[1];}
  if(mapPtrs.size===2)mapGestStart();
 });
 cv.addEventListener('pointermove',e=>{
  const p=loc(e);
  const rec=mapPtrs.get(e.pointerId);
  if(!rec){ if(mapMode==='gal'){mapHoverGal(p[0],p[1]);} return; }
  const dx=p[0]-rec.x, dy=p[1]-rec.y;
  rec.x=p[0];rec.y=p[1];
  if(Math.abs(p[0]-mapDownX)+Math.abs(p[1]-mapDownY)>10)mapDragged=true;
  if(mapPtrs.size===1){
   const c=mapCamOf();
   if(mapMode==='gal'||rec.sh){
    c.yaw-=dx*0.006;c.pitch=clamp(c.pitch+dy*0.006,-1.5533,1.5533);
   } else {c.px+=dx;c.py+=dy;}
   mapGalDirty=true;
  } else if(mapPtrs.size===2)mapGestMove();
  e.preventDefault();e.stopPropagation();
 });
 const up=e=>{
  const rec=mapPtrs.get(e.pointerId);
  mapPtrs.delete(e.pointerId);
  if(mapPtrs.size<2)mapGest=null;
  if(!rec)return;
  if(!mapDragged&&performance.now()-mapDownT<500&&mapPtrs.size===0)mapTap(rec.x,rec.y);
 };
 cv.addEventListener('pointerup',up);
 cv.addEventListener('pointercancel',up);
 cv.addEventListener('contextmenu',e=>e.preventDefault());
}
function mapGestStart(){
 const a=[...mapPtrs.values()];if(a.length<2)return;
 const c=mapCamOf();
 mapGest={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,
  ang:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x),
  mx:(a[0].x+a[1].x)*0.5,my:(a[0].y+a[1].y)*0.5,z:c.zoom,yaw:c.yaw};
}
function mapGestMove(){
 const a=[...mapPtrs.values()];if(a.length<2||!mapGest)return;
 const c=mapCamOf();
 const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1;
 const ang=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);
 const mx=(a[0].x+a[1].x)*0.5,my=(a[0].y+a[1].y)*0.5;
 c.px+=mx-mapGest.mx;c.py+=my-mapGest.my;
 const z0=c.zoom;
 c.zoom=clamp(mapGest.z*(d/mapGest.d),mapMode==='sys'?0.18:0.35,mapMode==='sys'?900:24);
 const k=c.zoom/z0;
 const ccx=mapW*0.5+c.px, ccy=mapH*0.5+c.py;
 c.px+=(ccx-mx)*(k-1);c.py+=(ccy-my)*(k-1);
 let da=ang-mapGest.ang; while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
 c.yaw=mapGest.yaw+da;
 mapGest.mx=mx;mapGest.my=my;mapGalDirty=true;
}
function mapTap(x,y){
 if(mapMode==='sys'){
  const b=mapPick(x,y);
  mapSel=b;mapPanel();
 } else {
  const id=mapPickGal(x,y);
  if(id>=0){mapGalSel=id;mapGalDirty=true;mapPanel();}
 }
}
function mapPick(x,y){
 let best=null,bd=1e9;
 for(let i=mapHits.length-1;i>=0;i--){
  const h=mapHits[i];
  const d=Math.hypot(h.x-x,h.y-y);
  const rr=Math.max(h.r+8,24);            // >=48 px touch target
  if(d<rr&&d<bd){bd=d;best=h.body;}
 }
 return best;
}
function mapHoverGal(x,y){
 const id=mapPickGal(x,y);
 if(id!==mapGalHover){mapGalHover=id;mapGalDirty=true;}
}

/* ================= RADIAL WARP + PROJECTION =================
   The solar system spans 0.39 AU (Mercury) to 39.5 AU (Pluto): a linear plot makes the
   inner system a single pixel. We map radius through  s(r) = ln(1 + r/r0)  where r0 is
   ~0.3 x the innermost semi-major axis of the current frame. Because the warp is purely
   radial and applied to the full 3-vector, direction is untouched — so orbital
   inclinations and the "star sits at a focus" geometry survive exactly, only the radial
   metric is compressed. Two decades of radius become a factor ~3.8 on screen. */
function mapPrj(dx,dy,dz,o){
 const r=Math.sqrt(dx*dx+dy*dy+dz*dz);
 const w=r>1e-9?Math.log1p(r/mapView.r0)/r:0;
 const X=dx*w,Y=dy*w,Z=dz*w;
 const rx=X*mapView.cyy-Z*mapView.syy;
 const fz=X*mapView.syy+Z*mapView.cyy;
 o[0]=mapView.cx+rx*mapView.S;
 o[1]=mapView.cy-(Y*mapView.cp-fz*mapView.sp)*mapView.S;
 o[2]=Y*mapView.sp+fz*mapView.cp;
 return o;
}
function mapKids(b){const o=[];if(typeof BODIES==='undefined')return o;
 for(const x of BODIES)if(x.parent===b)o.push(x);return o;}

/* orbit polyline of a body about its parent, cached (elements never change) */
function mapBodyOrb(b){
 let o=mapOrbCache.get(b);
 if(o)return o;
 const N=b.e>0.25?176:112;
 const pts=new Float64Array(N*3);
 const co=Math.cos(b.argp),so=Math.sin(b.argp),ci=Math.cos(b.inc),si=Math.sin(b.inc),
       cr=Math.cos(b.raan),sr=Math.sin(b.raan);
 const R11=cr*co-sr*so*ci, R12=-cr*so-sr*co*ci;
 const R21=sr*co+cr*so*ci, R22=-sr*so+cr*co*ci;
 const R31=so*si,          R32=co*si;
 const p=b.a*(1-b.e*b.e);
 for(let i=0;i<N;i++){
  const nu=i/N*TAU, r=p/(1+b.e*Math.cos(nu));
  const xp=r*Math.cos(nu), yp=r*Math.sin(nu);
  pts[i*3]=R11*xp+R12*yp;pts[i*3+1]=R31*xp+R32*yp;pts[i*3+2]=R21*xp+R22*yp;
 }
 const rp=b.a*(1-b.e), ra=b.a*(1+b.e);
 o={pts:pts,n:N,
    pe:[R11*rp,R31*rp,R21*rp],
    ap:[-R11*ra,-R31*ra,-R21*ra]};
 mapOrbCache.set(b,o);
 return o;
}
/* ship conic about `body`, sampled forward from the current true anomaly */
function mapShipConic(body){
 if(typeof SHIP==='undefined'||!body)return null;
 const r=mapTmpA, v=mapTmpB;
 vsub(r,SHIP.pos,body.pos);vsub(v,SHIP.vel,body.vel);
 const R=vlen(r);if(!(R>1)||!isFinite(R))return null;
 const h=mapTmpC;vcross(h,r,v);const H=vlen(h);
 if(!(H>1))return null;
 const mu=body.mu;
 const ex=(v[1]*h[2]-v[2]*h[1])/mu-r[0]/R;
 const ey=(v[2]*h[0]-v[0]*h[2])/mu-r[1]/R;
 const ez=(v[0]*h[1]-v[1]*h[0])/mu-r[2]/R;
 let e=Math.hypot(ex,ey,ez);
 let Px,Py,Pz;
 if(e>1e-6){Px=ex/e;Py=ey/e;Pz=ez/e;}
 else{e=0;Px=r[0]/R;Py=r[1]/R;Pz=r[2]/R;}
 // Q = normalize(h x P)
 let Qx=h[1]*Pz-h[2]*Py, Qy=h[2]*Px-h[0]*Pz, Qz=h[0]*Py-h[1]*Px;
 const ql=Math.hypot(Qx,Qy,Qz)||1;Qx/=ql;Qy/=ql;Qz/=ql;
 const pl=H*H/mu;
 const nu0=Math.atan2(r[0]*Qx+r[1]*Qy+r[2]*Qz, r[0]*Px+r[1]*Py+r[2]*Pz);
 let span=TAU, nuMax=Math.PI;
 if(e>=1){nuMax=Math.acos(clamp(-1/e,-1,1))*0.985;span=0;}
 const N=mapSN;
 let n=0;
 for(let i=0;i<N;i++){
  let nu;
  if(e<1){nu=nu0+i/(N-1)*TAU;}
  else{
   nu=nu0+i/(N-1)*(nuMax-nu0);
   if(nu>nuMax)break;
  }
  const rr=pl/(1+e*Math.cos(nu));
  if(!(rr>0)||rr>1e15)break;
  const c=Math.cos(nu),s=Math.sin(nu);
  mapShipPts[n*3]=Px*rr*c+Qx*rr*s;
  mapShipPts[n*3+1]=Py*rr*c+Qy*rr*s;
  mapShipPts[n*3+2]=Pz*rr*c+Qz*rr*s;
  n++;
 }
 const a=(e!==1)?pl/(1-e*e):Infinity;
 const rp=pl/(1+e), ra=e<1?pl/(1-e):Infinity;
 return {n:n,e:e,a:a,rp:rp,ra:ra,pl:pl,
  peX:Px*rp,peY:Py*rp,peZ:Pz*rp,
  apX:-Px*ra,apY:-Py*ra,apZ:-Pz*ra,
  period:(e<1&&a>0)?TAU*Math.sqrt(a*a*a/mu):Infinity,R:R};
}

/* ================= ORBITAL (SYSTEM) VIEW ================= */
function mapFmtR(m){
 if(!isFinite(m))return '—';
 const a=Math.abs(m);
 if(a>=0.004*AU)return (m/AU).toFixed(a<0.1*AU?3:(a<10*AU?2:1))+' AU';
 if(a>=1e9)return (m/1e9).toFixed(2)+' Gm';
 if(a>=1e6)return (m/1e6).toFixed(1)+' Mm';
 return (m/1e3).toFixed(0)+' km';
}
function mapCol(c,a){
 return 'rgba('+((c[0]*255)|0)+','+((c[1]*255)|0)+','+((c[2]*255)|0)+','+a+')';
}
function mapMarkPx(b){
 if(b.kind==='star')return 7.5;
 const l=Math.log10(Math.max(b.radius,1e4)/1e6);
 return clamp(2.6+l*2.6,2.2,8.0);
}
const MAP_DEC=[1,2,5];
function mapRenderOrbital(g,vx,vy,vw,vh,frame,cam,hits,inset){
 if(!frame)return;
 const kids=mapKids(frame);
 // radial reference: r0 sets the log knee, rRef the outer edge of the plot
 let aMin=Infinity,rRef=frame.radius*60;
 for(const k of kids){aMin=Math.min(aMin,k.a);rRef=Math.max(rRef,k.a*(1+k.e));}
 // if the ship orbits this body, let its periapsis pull the knee inward so low orbits
 // are not buried inside the primary's disc
 const domB=(typeof CTX!=='undefined'&&CTX.body)?CTX.body:null;
 if(domB===frame&&typeof SHIP!=='undefined'&&SHIP.pos)
  aMin=Math.min(aMin,Math.max(vdist(SHIP.pos,frame.pos),frame.radius));
 if(!isFinite(aMin))aMin=frame.radius*16;
 const r0=Math.max(aMin*0.30,frame.radius*1.6);
 const minD=Math.min(vw,vh);
 const S=cam.zoom*0.42*minD/Math.max(Math.log1p(rRef/r0),1e-6);
 mapView.r0=r0;mapView.S=S;
 mapView.cx=vx+vw*0.5+(inset?0:cam.px);mapView.cy=vy+vh*0.5+(inset?0:cam.py);
 mapView.cyy=Math.cos(cam.yaw);mapView.syy=Math.sin(cam.yaw);
 mapView.cp=Math.cos(cam.pitch);mapView.sp=Math.sin(cam.pitch);

 /* --- range rings: 1/2/5 x 10^k metres, kept ~64 px apart so they span the whole plot
       instead of bunching up in the compressed outer region. They make the log scale legible. --- */
 g.lineWidth=1;g.font='9px ui-monospace,Menlo,Consolas,monospace';
 mapRingR.length=0;
 let lastPx=-1e9;
 for(let k=5;k<=14&&mapRingR.length<8;k++)for(let m=0;m<3&&mapRingR.length<8;m++){
  const rr=MAP_DEC[m]*Math.pow(10,k);
  if(rr>rRef*2.0)break;
  const px=Math.log1p(rr/r0)*S;
  if(px<22||px>minD*2.4)continue;
  if(px-lastPx<Math.max(58,minD*0.10))continue;
  lastPx=px;mapRingR.push(rr);
 }
 for(let ri=0;ri<mapRingR.length;ri++){
  const rr=mapRingR[ri];
  const px=Math.log1p(rr/r0)*S;
  g.strokeStyle='rgba(90,190,255,0.10)';
  g.beginPath();
  let lx=0,ly=0,best=-1e9;
  for(let i=0;i<=48;i++){
   const a=i/48*TAU;
   mapPrj(Math.cos(a)*rr,0,Math.sin(a)*rr,mapP);
   if(i===0)g.moveTo(mapP[0],mapP[1]);else g.lineTo(mapP[0],mapP[1]);
   if(mapP[0]>best){best=mapP[0];lx=mapP[0];ly=mapP[1];}
  }
  g.stroke();
  if(!inset&&px>44){g.fillStyle='rgba(93,134,168,0.75)';g.fillText(mapFmtR(rr),lx+4,ly-3);}
 }
 /* --- orbits of the frame's children --- */
 for(const b of kids){
  const o=mapBodyOrb(b);
  const selq=(b===mapSel);
  g.strokeStyle=mapCol(b.color,selq?0.95:0.42);
  g.lineWidth=selq?2:1.1;
  g.beginPath();
  for(let i=0;i<o.n;i++){
   mapPrj(o.pts[i*3],o.pts[i*3+1],o.pts[i*3+2],mapP);
   if(i===0)g.moveTo(mapP[0],mapP[1]);else g.lineTo(mapP[0],mapP[1]);
  }
  g.closePath();g.stroke();
  if(selq&&b.e>0.008){
   mapPrj(o.ap[0],o.ap[1],o.ap[2],mapP);
   mapNode(g,mapP[0],mapP[1],'#7fe6ff','Ap '+mapFmtR(b.a*(1+b.e)));
   mapPrj(o.pe[0],o.pe[1],o.pe[2],mapP2);
   mapNode(g,mapP2[0],mapP2[1],'#ffd34d','Pe '+mapFmtR(b.a*(1-b.e)));
  }
 }
 /* --- the frame body itself --- */
 mapPrj(0,0,0,mapP);
 mapBodyDot(g,frame,mapP[0],mapP[1],0,hits,true);
 /* --- bodies --- */
 const fx=frame.pos[0],fy=frame.pos[1],fz=frame.pos[2];
 for(const b of kids){
  const dx=b.pos[0]-fx,dy=b.pos[1]-fy,dz=b.pos[2]-fz;
  mapPrj(dx,dy,dz,mapP);
  mapBodyDot(g,b,mapP[0],mapP[1],Math.hypot(dx,dy,dz),hits,false);
 }
 /* --- ship --- */
 if(typeof SHIP!=='undefined'&&SHIP.pos){
  const dom=(typeof CTX!=='undefined'&&CTX.body)?CTX.body:(SHIP.soi||null);
  if(dom===frame){
   const cn=mapShipConic(frame);
   if(cn&&cn.n>2){
    // predicted path: 14 chunks with stepped alpha (one stroke each) so the trajectory
    // reads as "ahead of you" without 190 separate draw calls
    g.lineWidth=1.7;
    const CH=14, per=Math.max(2,Math.ceil(cn.n/CH));
    for(let c0=0;c0<cn.n-1;c0+=per){
     const a=1-c0/cn.n;
     g.strokeStyle='rgba(127,230,255,'+(0.12+0.76*a*a).toFixed(3)+')';
     g.beginPath();
     const end=Math.min(cn.n-1,c0+per);
     for(let i=c0;i<=end;i++){
      mapPrj(mapShipPts[i*3],mapShipPts[i*3+1],mapShipPts[i*3+2],mapP);
      if(i===c0)g.moveTo(mapP[0],mapP[1]);else g.lineTo(mapP[0],mapP[1]);
     }
     g.stroke();
    }
    if(isFinite(cn.ra)){mapPrj(cn.apX,cn.apY,cn.apZ,mapP);
     mapNode(g,mapP[0],mapP[1],'#7fe6ff','Ap '+mapFmtR(cn.ra-frame.radius));}
    mapPrj(cn.peX,cn.peY,cn.peZ,mapP);
    mapNode(g,mapP[0],mapP[1],'#ffd34d','Pe '+mapFmtR(cn.rp-frame.radius));
   }
  }
  const sx=SHIP.pos[0]-fx, sy=SHIP.pos[1]-fy, sz=SHIP.pos[2]-fz;
  mapPrj(sx,sy,sz,mapP);
  // velocity vector: project a short step along v and normalise on screen
  const vx0=SHIP.vel[0]-frame.vel[0],vy0=SHIP.vel[1]-frame.vel[1],vz0=SHIP.vel[2]-frame.vel[2];
  const vl=Math.hypot(vx0,vy0,vz0);
  const rr=Math.hypot(sx,sy,sz);
  if(vl>0.01&&rr>1){
   const st=rr*0.03/vl;
   mapPrj(sx+vx0*st,sy+vy0*st,sz+vz0*st,mapP2);
   let ax=mapP2[0]-mapP[0],ay=mapP2[1]-mapP[1];
   const al=Math.hypot(ax,ay)||1;
   const L=inset?18:30;
   ax=ax/al*L;ay=ay/al*L;
   g.strokeStyle='rgba(255,211,77,0.9)';g.lineWidth=1.6;
   g.beginPath();g.moveTo(mapP[0],mapP[1]);g.lineTo(mapP[0]+ax,mapP[1]+ay);g.stroke();
   g.beginPath();g.moveTo(mapP[0]+ax,mapP[1]+ay);
   g.lineTo(mapP[0]+ax*0.72-ay*0.16,mapP[1]+ay*0.72+ax*0.16);
   g.lineTo(mapP[0]+ax*0.72+ay*0.16,mapP[1]+ay*0.72-ax*0.16);
   g.closePath();g.fillStyle='rgba(255,211,77,0.9)';g.fill();
  }
  g.strokeStyle='#eaf8ff';g.fillStyle='rgba(127,230,255,0.9)';g.lineWidth=1.5;
  g.beginPath();
  g.moveTo(mapP[0],mapP[1]-5.5);g.lineTo(mapP[0]+4.6,mapP[1]+4.4);
  g.lineTo(mapP[0],mapP[1]+1.8);g.lineTo(mapP[0]-4.6,mapP[1]+4.4);
  g.closePath();g.fill();g.stroke();
  if(!inset){g.fillStyle='#eaf8ff';g.font='9px ui-monospace,Menlo,Consolas,monospace';
   g.fillText('YOU',mapP[0]+7,mapP[1]-6);}
 }
}
function mapNode(g,x,y,col,txt){
 g.strokeStyle=col;g.lineWidth=1.4;
 g.beginPath();g.moveTo(x,y-4.6);g.lineTo(x+4.6,y);g.lineTo(x,y+4.6);g.lineTo(x-4.6,y);
 g.closePath();g.stroke();
 if(txt){g.fillStyle=col;g.font='9px ui-monospace,Menlo,Consolas,monospace';
  g.fillText(txt,x+7,y+3);}
}
function mapBodyDot(g,b,x,y,r,hits,isFrame){
 const mk=mapMarkPx(b);
 // at the centre of the frame the warp is strongly non-linear over the body's own radius,
 // so integrate it properly; elsewhere the local derivative of ln(1+r/r0) is accurate
 const disc=isFrame?Math.log1p(b.radius/mapView.r0)*mapView.S
                   :b.radius*mapView.S/(mapView.r0+r);
 const px=Math.max(mk,Math.min(disc,Math.min(mapW,mapH)*0.45));
 if(x<-90||x>mapW+90||y<-90||y>mapH+90)return;
 const sel=(b===mapSel);
 if(b.kind==='star'){
  g.globalCompositeOperation='lighter';
  g.globalAlpha=0.55;
  g.drawImage(mapGlow,x-px*4,y-px*4,px*8,px*8);
  g.globalAlpha=1;g.globalCompositeOperation='source-over';
 }
 g.beginPath();g.arc(x,y,px,0,TAU);
 g.fillStyle=mapCol(b.color,b.kind==='star'?1:0.92);g.fill();
 g.lineWidth=1;g.strokeStyle='rgba(10,20,34,0.9)';g.stroke();
 if(sel){g.strokeStyle='#c79bff';g.lineWidth=2;
  g.beginPath();g.arc(x,y,px+7,0,TAU);g.stroke();
  g.strokeStyle='rgba(199,155,255,0.45)';g.lineWidth=1;
  g.beginPath();g.arc(x,y,px+13,0,TAU);g.stroke();}
 g.font=(b.kind==='star'?'bold ':'')+'10px ui-monospace,Menlo,Consolas,monospace';
 g.fillStyle=sel?'#f0e0ff':(b.kind==='star'?'#ffe9c0':'#bcdcf4');
 g.fillText(b.name,x+px+5,y+3.5);
 if(hits)hits.push({x:x,y:y,r:px,body:b});
}

/* ================= GALAXY ================= */
let mapRandS=0;
function mapRand(){mapRandS=(mapRandS*1664525+1013904223)>>>0;return mapRandS/4294967296;}
/* Replays buildSystem()'s own PRNG so the chart agrees with the system you actually jump to. */
function mapSysInfo(id){
 if(id===0)return {cls:0.42,starR:6.957e8,temp:5772,col:[1,.95,.85],n:9,name:'SOL'};
 mapRandS=(id*2654435761)>>>0;
 const cls=mapRand();
 const n=2+Math.floor(mapRand()*7);
 const temp=mix(2800,9200,cls);
 return {cls:cls,starR:mix(3e8,1.6e9,cls*cls),temp:temp,n:n,
  col:[Math.min(1,Math.max(.35,1.4-cls*.5)),Math.min(1,.6+cls*.4),Math.min(1,.25+cls*.85)],
  name:systemName(id)};
}
function mapSpectral(T){
 return T>=30000?'O':T>=10000?'B':T>=7500?'A':T>=6000?'F':T>=5200?'G':T>=3700?'K':'M';
}
function mapBuildGalaxy(){
 const N=SYSTEM_COUNT;
 mapGalPos=new Float32Array(N*3);mapGalSize=new Float32Array(N);mapGalTint=new Uint8Array(N);
 for(let i=0;i<24;i++){
  const t=i/23;
  const R=Math.round(mix(255,150,t)),G=Math.round(mix(190,190,t)),B=Math.round(mix(120,255,t));
  mapPalette.push('rgb('+R+','+G+','+B+')');
 }
 const ARMS=4, INVTAN=1/Math.tan(0.36);   // ~21 degree pitch logarithmic spiral
 for(let id=0;id<N;id++){
  mapRandS=(id*2246822519+374761393)>>>0;
  const R=mapRand;
  const u=R(), arm=Math.floor(R()*ARMS);
  let x,y,z;
  if(u<0.15){                                   // central bulge
   const rr=0.30*Math.pow(R(),0.65), th=R()*TAU, ph=Math.acos(2*R()-1);
   const sp=Math.sin(ph);
   x=rr*sp*Math.cos(th);z=rr*sp*Math.sin(th);y=rr*Math.cos(ph)*0.62;
  } else {                                      // logarithmic spiral arms
   const rad=0.10+Math.pow(R(),0.62)*0.90;
   const g1=R()+R()+R()-1.5;
   const th=arm*TAU/ARMS+Math.log(rad/0.10)*INVTAN+g1*0.30;
   x=rad*Math.cos(th)+(R()+R()-1)*0.055;
   z=rad*Math.sin(th)+(R()+R()-1)*0.055;
   y=(R()+R()+R()-1.5)*0.070*Math.exp(-rad*0.8);
  }
  mapGalPos[id*3]=x;mapGalPos[id*3+1]=y;mapGalPos[id*3+2]=z;
  const inf=mapSysInfo(id);
  // luminosity ~ R^2 T^4, relative to Sol
  const L=Math.pow(inf.starR/6.957e8,2)*Math.pow(inf.temp/5772,4);
  mapGalSize[id]=clamp(0.9+1.5*(Math.log10(Math.max(L,1e-4))+2)/4,0.75,4.2);
  mapGalTint[id]=clamp(Math.round(((inf.temp-2800)/6400)*23),0,23);
 }
 mapGalNeb=[];
 for(let i=0;i<N;i+=17)mapGalNeb.push(i);
 mapGalDirty=true;
}
function mapGPrj(x,y,z,o){
 const c=mapGalCam;
 const rx=x*c.cy-z*c.sy, fz=x*c.sy+z*c.cy;
 const up=y*c.cp-fz*c.sp;
 const dep=y*c.sp+fz*c.cp;
 const zc=c.dist-dep;
 if(zc<0.12){o[2]=-1;return o;}
 const k=c.f/zc;
 o[0]=c.cx+rx*k;o[1]=c.cy0-up*k;o[2]=zc;
 return o;
}
function mapPickGal(x,y){
 if(!mapGalPos)return -1;
 let best=-1,bd=26*26;
 for(let id=0;id<SYSTEM_COUNT;id++){
  mapGPrj(mapGalPos[id*3],mapGalPos[id*3+1],mapGalPos[id*3+2],mapP);
  if(mapP[2]<0)continue;
  const dx=mapP[0]-x,dy=mapP[1]-y,d=dx*dx+dy*dy;
  if(d<bd){bd=d;best=id;}
 }
 return best;
}
function mapRenderGalaxy(g,W,H){
 if(!mapGalPos)mapBuildGalaxy();
 const c=mapGalCam;
 c.cy=Math.cos(c.yaw);c.sy=Math.sin(c.yaw);
 c.cp=Math.cos(c.pitch);c.sp=Math.sin(c.pitch);
 c.f=1.26*Math.min(W,H)*c.zoom;
 c.cx=W*0.5+c.px;c.cy0=H*0.5+c.py;
 const cur=(typeof SYSTEM!=='undefined')?SYSTEM.id:0;
 /* --- nebular haze --- */
 g.globalCompositeOperation='lighter';
 for(let i=0;i<mapGalNeb.length;i++){
  const id=mapGalNeb[i];
  mapGPrj(mapGalPos[id*3],mapGalPos[id*3+1],mapGalPos[id*3+2],mapP);
  if(mapP[2]<0)continue;
  const sz=c.f/mapP[2]*0.10;
  if(mapP[0]<-sz||mapP[0]>W+sz||mapP[1]<-sz||mapP[1]>H+sz)continue;
  g.globalAlpha=0.055;
  g.drawImage((i&3)?mapGlow:mapGlow2,mapP[0]-sz,mapP[1]-sz,sz*2,sz*2);
 }
 g.globalAlpha=1;g.globalCompositeOperation='source-over';
 /* --- galactic plane rings --- */
 g.strokeStyle='rgba(90,190,255,0.10)';g.lineWidth=1;
 for(let k=1;k<=4;k++){
  const rr=k*0.25;
  g.beginPath();let started=false;
  for(let i=0;i<=64;i++){
   const a=i/64*TAU;
   mapGPrj(Math.cos(a)*rr,0,Math.sin(a)*rr,mapP);
   if(mapP[2]<0){started=false;continue;}
   if(!started){g.moveTo(mapP[0],mapP[1]);started=true;}else g.lineTo(mapP[0],mapP[1]);
  }
  g.stroke();
 }
 /* --- stars --- */
 const q=mapGalQ;
 g.globalCompositeOperation='lighter';
 const labels=[];
 for(let id=0;id<SYSTEM_COUNT;id++){
  mapGPrj(mapGalPos[id*3],mapGalPos[id*3+1],mapGalPos[id*3+2],mapP);
  if(mapP[2]<0)continue;
  const x=mapP[0],y=mapP[1];
  if(x<-8||x>W+8||y<-8||y>H+8)continue;
  const dc=clamp(c.dist/mapP[2],0.35,2.8);          // depth cue
  let a=clamp(0.20+0.62*(dc-0.55),0.06,1);
  let px=mapGalSize[id]*dc*(0.8+0.3*Math.min(c.zoom,3));
  if(q){const hit=mapGalNames[id].indexOf(q)>=0;
   if(!hit){a*=0.13;px*=0.75;}else{a=1;px*=1.7;labels.push(id);}}
  g.globalAlpha=a;
  g.fillStyle=mapPalette[mapGalTint[id]];
  if(px<1.5)g.fillRect(x-0.7,y-0.7,1.5,1.5);
  else{g.beginPath();g.arc(x,y,px,0,TAU);g.fill();
   if(px>2.4){g.globalAlpha=a*0.5;g.drawImage(mapGlow,x-px*3.4,y-px*3.4,px*6.8,px*6.8);}}
  if(!q&&px>2.9&&labels.length<26)labels.push(id);
 }
 g.globalAlpha=1;g.globalCompositeOperation='source-over';
 /* --- labels (spaced out so they stay readable) --- */
 g.font='10px ui-monospace,Menlo,Consolas,monospace';
 const placed=[];
 for(let i=0;i<labels.length&&placed.length<24;i++){
  const id=labels[i];
  mapGPrj(mapGalPos[id*3],mapGalPos[id*3+1],mapGalPos[id*3+2],mapP);
  if(mapP[2]<0)continue;
  let ok=true;
  for(const p of placed)if(Math.abs(p[0]-mapP[0])<74&&Math.abs(p[1]-mapP[1])<15){ok=false;break;}
  if(!ok)continue;
  placed.push([mapP[0],mapP[1]]);
  g.fillStyle='rgba(168,228,255,0.62)';
  g.fillText(mapGalNames[id],mapP[0]+6,mapP[1]+3);
 }
 /* --- current / hovered / selected --- */
 const mark=(id,col,tag,pulse)=>{
  if(id<0||id>=SYSTEM_COUNT)return;
  mapGPrj(mapGalPos[id*3],mapGalPos[id*3+1],mapGalPos[id*3+2],mapP);
  if(mapP[2]<0)return;
  const r=10+(pulse?Math.sin(mapT*3)*2.4:0);
  g.strokeStyle=col;g.lineWidth=1.8;
  g.beginPath();g.arc(mapP[0],mapP[1],r,0,TAU);g.stroke();
  g.beginPath();
  g.moveTo(mapP[0]-r-6,mapP[1]);g.lineTo(mapP[0]-r-1,mapP[1]);
  g.moveTo(mapP[0]+r+1,mapP[1]);g.lineTo(mapP[0]+r+6,mapP[1]);
  g.moveTo(mapP[0],mapP[1]-r-6);g.lineTo(mapP[0],mapP[1]-r-1);
  g.moveTo(mapP[0],mapP[1]+r+1);g.lineTo(mapP[0],mapP[1]+r+6);
  g.stroke();
  g.fillStyle=col;g.font='10px ui-monospace,Menlo,Consolas,monospace';
  g.fillText(tag+' '+mapGalNames[id],mapP[0]+r+9,mapP[1]-r+2);
 };
 mark(cur,'#7fe6ff','◎',true);
 if(mapGalHover>=0&&mapGalHover!==mapGalSel)mark(mapGalHover,'rgba(199,155,255,0.65)','·');
 if(mapGalSel>=0)mark(mapGalSel,'#c79bff','▣');
 /* --- scale legend --- */
 g.fillStyle='rgba(93,134,168,0.8)';g.font='9px ui-monospace,Menlo,Consolas,monospace';
 g.fillText('GALACTIC DISC · '+SYSTEM_COUNT+' CHARTED SYSTEMS · '+
   (MAP_GAL_LY*2)+' ly ACROSS · 4 SPIRAL ARMS',10,H-12);
}
let mapGalQ='';
function mapSearch(){
 if(!mapGalNames)mapGalNamesBuild();
 mapGalQ=(mapEl.q.value||'').trim().toUpperCase();
 mapGalDirty=true;
 const res=mapEl.res;
 if(!mapGalQ){res.style.display='none';res.innerHTML='';return;}
 let h='',n=0;
 for(let id=0;id<SYSTEM_COUNT&&n<14;id++){
  if(mapGalNames[id].indexOf(mapGalQ)<0)continue;
  h+='<div data-i="'+id+'">'+mapGalNames[id]+'</div>';n++;
 }
 res.innerHTML=h||'<div style="color:#5d86a8">NO MATCH</div>';
 res.style.display='block';
 res.querySelectorAll('div[data-i]').forEach(el=>{el.onclick=()=>{
  mapGalSel=+el.dataset.i;mapGalDirty=true;mapPanel();};});
}
function mapGalNamesBuild(){
 mapGalNames=new Array(SYSTEM_COUNT);
 for(let i=0;i<SYSTEM_COUNT;i++)mapGalNames[i]=systemName(i);
}
function mapGalDist(a,b){
 if(!mapGalPos)mapBuildGalaxy();
 return Math.hypot(mapGalPos[a*3]-mapGalPos[b*3],mapGalPos[a*3+1]-mapGalPos[b*3+1],
  mapGalPos[a*3+2]-mapGalPos[b*3+2])*MAP_GAL_LY;
}

/* ================= READOUT PANEL ================= */
function mapPanel(){
 if(!mapEl.info)return;
 const E=mapEl.info;
 if(mapMode==='sys'){
  const b=mapSel;
  if(!b){E.style.display='none';E.innerHTML='';return;}
  const g0=(typeof G0!=='undefined')?G0:9.80665;
  const grav=b.mu/(b.radius*b.radius);
  const kids=mapKids(b);
  let dist=NaN;
  if(typeof SHIP!=='undefined'&&SHIP.pos)dist=vdist(SHIP.pos,b.pos);
  const row=(k,v)=>'<div class="r"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>';
  let h='<h3>'+b.name+'</h3><div class="k" style="margin-bottom:6px">'+
   b.kind.toUpperCase()+(b.parent?' · ORBITS '+b.parent.name:' · PRIMARY')+'</div>';
  h+=row('RADIUS',mapFmtR(b.radius));
  h+=row('GRAVITY',grav.toFixed(2)+' m/s² ('+(grav/g0).toFixed(2)+' g)');
  h+=row('ESCAPE',fmt(Math.sqrt(2*b.mu/b.radius),'m/s'));
  h+=row('ATMOSPHERE',b.atmo?((b.atmo.rho0*287*(b.dna?b.dna.temp:250)/1000).toFixed(1)+' kPa'):'vacuum');
  if(b.parent){
   h+=row('SEMI-MAJOR',mapFmtR(b.a));
   h+=row('ECCENTRICITY',b.e.toFixed(4));
   h+=row('INCLINATION',(b.inc/DEG).toFixed(2)+'°');
   h+=row('PERIOD',fmtT(TAU*Math.sqrt(b.a*b.a*b.a/b.parent.mu)));
  }
  h+=row('DAY',fmtT(Math.abs(b.rotPeriod)));
  h+=row('DISTANCE',isFinite(dist)?fmt(dist,'m'):'—');
  if(kids.length)h+=row('SATELLITES',kids.length);
  if(b.dna&&typeof describeDNA==='function')
   h+='<div class="dsc">'+describeDNA(b.dna)+'</div>';
  if(kids.length)h+='<button class="map_b go2" id="map_focus">FOCUS ON '+b.name+' SYSTEM</button>';
  if(b.parent&&mapFrame!==b.parent)
   h+='<button class="map_b go2" id="map_up">UP TO '+b.parent.name+'</button>';
  h+='<button class="map_b go" id="map_wh">WORMHOLE TO '+b.name+'</button>';
  if(typeof SHIP!=='undefined'&&SHIP.power<0.12)
   h+='<div class="warn">! reactor charge below 12% — throat will not form</div>';
  E.innerHTML=h;E.style.display='block';
  const f=document.getElementById('map_focus');
  if(f)f.onclick=()=>{mapFrame=b;mapCam.px=0;mapCam.py=0;mapCam.zoom=1;mapPanel();};
  const u=document.getElementById('map_up');
  if(u)u.onclick=()=>{mapFrame=b.parent;mapCam.px=0;mapCam.py=0;mapCam.zoom=1;mapPanel();};
  document.getElementById('map_wh').onclick=()=>{
   if(typeof startWarp==='function')startWarp(b,null);
   mapToggle(false);};
 } else {
  const id=mapGalSel;
  if(id<0){E.style.display='none';E.innerHTML='';return;}
  if(!mapGalNames)mapGalNamesBuild();
  const inf=mapSysInfo(id);
  const cur=(typeof SYSTEM!=='undefined')?SYSTEM.id:0;
  const d=mapGalDist(cur,id);
  const charge=Math.min(96,12+d/(MAP_GAL_LY*2)*74);
  const row=(k,v)=>'<div class="r"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>';
  let h='<h3>'+mapGalNames[id]+'</h3><div class="k" style="margin-bottom:6px">STAR SYSTEM · ID '+id+
   (id===cur?' · CURRENT':'')+'</div>';
  h+=row('CLASS',mapSpectral(inf.temp)+' · '+inf.temp.toFixed(0)+' K');
  h+=row('STAR RADIUS',mapFmtR(inf.starR)+' ('+(inf.starR/6.957e8).toFixed(2)+' R☉)');
  h+=row('LUMINOSITY',(Math.pow(inf.starR/6.957e8,2)*Math.pow(inf.temp/5772,4)).toFixed(2)+' L☉');
  h+=row('PLANETS',id===cur?String(mapKids(SUN).length):('~'+inf.n));
  h+=row('DISTANCE',d.toFixed(1)+' ly');
  h+=row('EST. CHARGE',charge.toFixed(0)+' %');
  h+=row('EST. TRANSIT',fmtT(4.2+d*0.004));
  if(id===cur)h+='<div class="dsc">You are here. Wormhole endpoints cannot terminate inside '+
   'their own origin system.</div>';
  else h+='<button class="map_b go" id="map_jump">JUMP &#8594; '+mapGalNames[id]+'</button>';
  if(typeof SHIP!=='undefined'&&SHIP.power<0.12)
   h+='<div class="warn">! reactor charge below 12% — throat will not form</div>';
  E.innerHTML=h;E.style.display='block';
  const j=document.getElementById('map_jump');
  if(j)j.onclick=()=>{if(typeof startWarp==='function')startWarp(null,id);mapToggle(false);};
 }
}

/* ================= FRAME ================= */
function mapSync(){
 const sid=(typeof SYSTEM!=='undefined')?SYSTEM.id:0;
 if(sid!==mapSysId){
  mapSysId=sid;mapOrbCache=new WeakMap();
  mapFrame=(typeof SUN!=='undefined'&&SUN)?SUN:null;mapSel=null;
  mapCam.px=0;mapCam.py=0;mapCam.zoom=1;mapGalSel=-1;mapGalDirty=true;mapPanel();
 }
 if(typeof BODIES!=='undefined'&&BODIES.length){
  if(!mapFrame||BODIES.indexOf(mapFrame)<0)mapFrame=SUN||BODIES[0];
  if(mapSel&&BODIES.indexOf(mapSel)<0){mapSel=null;mapPanel();}
 }
}
function mapResize(){
 const dpr=Math.min(window.devicePixelRatio||1,2);
 const w=mapRoot.clientWidth||window.innerWidth, h=mapRoot.clientHeight||window.innerHeight;
 if(mapW===w&&mapH===h&&mapDPR===dpr)return;
 mapW=w;mapH=h;mapDPR=dpr;
 mapCv.width=Math.max(1,Math.round(w*dpr));mapCv.height=Math.max(1,Math.round(h*dpr));
 mapGalDirty=true;
}
function mapToggle(on){
 if(!mapRoot)mapInit();
 on=!!on;
 mapVisible=on;
 mapRoot.style.display=on?'block':'none';
 if(typeof UI!=='undefined')UI.mapOpen=on;
 const bm=document.getElementById('b_map');if(bm)bm.classList.toggle('on',on);
 if(on){mapResize();mapSync();mapGalDirty=true;
  if(mapMode==='gal'&&!mapGalPos)mapBuildGalaxy();
  mapPanel();}
}
function mapUpdate(dt){
 if(typeof UI!=='undefined'&&!!UI.mapOpen!==mapVisible){mapToggle(UI.mapOpen);}
 if(!mapVisible||!mapG)return;
 const t0=performance.now();
 mapT+=dt||0;
 mapResize();mapSync();
 const g=mapG,W=mapW,H=mapH;
 // the galaxy chart is static geometry: repaint it only on interaction or at 20 Hz
 if(mapMode==='gal'&&!mapGalDirty&&performance.now()-mapGalLast<50)return;
 g.setTransform(mapDPR,0,0,mapDPR,0,0);
 g.clearRect(0,0,W,H);
 g.fillStyle='rgba(3,7,15,0.90)';g.fillRect(0,0,W,H);
 g.textBaseline='alphabetic';
 if(mapMode==='sys'){
  mapHits.length=0;
  mapRenderOrbital(g,0,0,W,H,mapFrame,mapCam,mapHits,false);
  /* --- inset: the moon system / local neighbourhood that is invisible at system scale --- */
  let ic=null;
  if(mapSel&&mapKids(mapSel).length)ic=mapSel;
  else{
   const dom=(typeof CTX!=='undefined'&&CTX.body)?CTX.body:null;
   if(dom&&dom!==mapFrame)ic=(mapKids(dom).length||dom.parent===mapFrame)?dom:dom.parent;
  }
  if(ic&&ic!==mapFrame){
   const s=Math.min(230,Math.min(W,H)*0.42);
   const ix=10, iy=H-s-26;
   g.save();
   g.beginPath();g.rect(ix,iy,s,s);g.clip();
   g.fillStyle='rgba(4,10,20,0.92)';g.fillRect(ix,iy,s,s);
   mapRenderOrbital(g,ix,iy,s,s,ic,{yaw:mapCam.yaw,pitch:mapCam.pitch,zoom:1,px:0,py:0},
     mapHits,true);
   g.restore();
   g.strokeStyle='rgba(90,190,255,0.32)';g.lineWidth=1;g.strokeRect(ix+.5,iy+.5,s,s);
   g.fillStyle='rgba(127,230,255,0.85)';g.font='9px ui-monospace,Menlo,Consolas,monospace';
   g.fillText(ic.name+' SYSTEM · DETAIL',ix+6,iy+13);
  }
  const fz=mapFrame?mapFrame.name:'—';
  g.fillStyle='rgba(93,134,168,0.85)';g.font='9px ui-monospace,Menlo,Consolas,monospace';
  g.fillText('FRAME '+fz+'  ·  RADIAL SCALE ln(1+r/r₀)  ·  ZOOM '+mapCam.zoom.toFixed(2)+'x'+
    '  ·  TILT '+(mapCam.pitch/DEG).toFixed(0)+'°',10,H-12);
  mapEl.hint.innerHTML='DRAG pan · WHEEL/PINCH zoom · TWO-FINGER twist rotate · TAP a body';
 } else {
  if(!mapGalNames)mapGalNamesBuild();
  if(mapGalDirty||performance.now()-mapGalLast>50){
   mapGalLast=performance.now();mapGalDirty=false;
   mapRenderGalaxy(g,W,H);
   mapGalCache=null;
  }
  mapEl.hint.innerHTML='DRAG rotate · WHEEL/PINCH zoom · TAP a star · SEARCH by name';
 }
 const c=performance.now()-t0;
 mapCost=c;mapCostAvg=mapCostAvg*0.92+c*0.08;mapCostN++;
}
let mapGalCache=null;
function mapSelectedBody(){return mapSel||null;}

/* ================= SELF TEST ================= */
function mapSelfTest(){
 try{
  if(!mapRoot)mapInit();
  if(!mapCv||!mapG)return {ok:false,why:'canvas/2d context missing'};
  if(!document.getElementById('map_root'))return {ok:false,why:'map root not in DOM'};
  // radial warp must be strictly monotonic and finite
  mapView.r0=1e10;
  let prev=-1;
  for(let k=6;k<14;k++){const s=Math.log1p(Math.pow(10,k)/mapView.r0);
   if(!isFinite(s)||s<=prev)return {ok:false,why:'radial warp not monotonic at 1e'+k};
   prev=s;}
  // orbit sampling for every body in the current system
  if(typeof BODIES!=='undefined'){
   for(const b of BODIES){
    if(!b.parent)continue;
    const o=mapBodyOrb(b);
    if(!o||o.n<8)return {ok:false,why:'orbit sample failed for '+b.name};
    for(let i=0;i<o.n*3;i++)if(!isFinite(o.pts[i]))
     return {ok:false,why:'non-finite orbit point for '+b.name};
    // periapsis must be closer than apoapsis
    const rp=Math.hypot(o.pe[0],o.pe[1],o.pe[2]), ra=Math.hypot(o.ap[0],o.ap[1],o.ap[2]);
    if(!(ra>=rp-1))return {ok:false,why:'ap/pe inverted for '+b.name};
   }
   // ship conic
   if(typeof SHIP!=='undefined'&&typeof CTX!=='undefined'&&CTX.body){
    const cn=mapShipConic(CTX.body);
    if(!cn)return {ok:false,why:'ship conic failed'};
    if(!isFinite(cn.rp)||cn.rp<=0)return {ok:false,why:'ship periapsis non-finite'};
   }
  }
  // galaxy distribution
  if(!mapGalPos)mapBuildGalaxy();
  let rmax=0,dup=0;
  for(let i=0;i<SYSTEM_COUNT;i++){
   const x=mapGalPos[i*3],y=mapGalPos[i*3+1],z=mapGalPos[i*3+2];
   if(!isFinite(x)||!isFinite(y)||!isFinite(z))return {ok:false,why:'non-finite star position '+i};
   rmax=Math.max(rmax,Math.hypot(x,y,z));
  }
  if(rmax<0.5||rmax>3)return {ok:false,why:'galaxy radius out of range: '+rmax.toFixed(2)};
  for(let i=1;i<64;i++)if(mapGalPos[i*3]===mapGalPos[(i-1)*3]&&
     mapGalPos[i*3+2]===mapGalPos[(i-1)*3+2])dup++;
  if(dup>2)return {ok:false,why:'degenerate galaxy hash (duplicates)'};
  // projection sanity
  mapView.r0=1e10;mapView.S=100;mapView.cx=100;mapView.cy=100;
  mapView.cyy=1;mapView.syy=0;mapView.cp=0;mapView.sp=1;
  mapPrj(1e11,0,0,mapP);
  if(!isFinite(mapP[0])||!isFinite(mapP[1]))return {ok:false,why:'projection produced NaN'};
  if(typeof startWarp!=='function')return {ok:false,why:'startWarp missing'};
  return {ok:true,cost:+mapCostAvg.toFixed(2)};
 }catch(e){return {ok:false,why:String(e&&e.message||e)};}
}

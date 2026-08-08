/* ===== HUD / NAVBALL / WORMHOLE UI ===== */
const UI={msgT:0,subT:0,scan:null,mapOpen:false,ballFrame:0};
const $=id=>document.getElementById(id);
function fmt(x,u){ // engineering notation with SI-ish suffixes
 const a=Math.abs(x);
 if(!isFinite(x))return '—';
 if(a>=1e9)return (x/1e9).toFixed(2)+' G'+u;
 if(a>=1e6)return (x/1e6).toFixed(2)+' M'+u;
 if(a>=1e3)return (x/1e3).toFixed(2)+' k'+u;
 return x.toFixed(a<10?2:0)+' '+u;
}
function fmtT(s){
 if(!isFinite(s)||s<0)return '—';
 s=Math.floor(s);const d=Math.floor(s/86400);s%=86400;
 const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);s%=60;
 return (d?d+'d ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function message(t,sub){
 $('msg').textContent=t||'';$('msg').style.opacity=t?1:0;UI.msgT=t?2.6:0;
 if(sub!==undefined){$('sub').innerHTML=sub||'';$('sub').style.opacity=sub?1:0;UI.subT=sub?5.0:0;}
}
const ROWS=[['ALT','alt'],['VEL','vel'],['V-SPD','vsp'],['APO','apo'],['PERI','per'],
 ['ORB-T','orbT'],['SOI','soi'],['MODE','mode']];
const ROWS2=[['BODY','bname'],['CLASS','bclass'],['RADIUS','brad'],['GRAV','bgrav'],
 ['SURF-P','bpres'],['DAY','bday'],['SYSTEM','bsys'],['WARP','twarp']];
function buildHUD(){
 $('tl').innerHTML=ROWS.map(r=>`<div class="row"><span class="lbl">${r[0]}</span><span class="val" id="h_${r[1]}">—</span></div>`).join('');
 $('tr').innerHTML=ROWS2.map(r=>`<div class="row" style="display:flex;justify-content:space-between;gap:12px"><span class="lbl">${r[0]}</span><span class="val" id="h_${r[1]}">—</span></div>`).join('');
 $('gauges').innerHTML=['fuel FUEL f','ox OXY o','hull HULL h','pwr PWR p'].map(s=>{
  const [id,lab,cls]=s.split(' ');
  return `<div><div class="lbl">${lab}</div><div class="bar ${cls}"><i id="g_${id}"></i></div></div>`;}).join('');
 const B=[['wh','CREATE WORMHOLE','big'],['scan','SCAN'],['map','MAP'],['docs','DOCS']];
 $('btns').innerHTML=B.map(b=>`<button class="btn ${b[2]||''}" id="b_${b[0]}">${b[1]}</button>`).join('');
 const B2=[['sas','SAS'],['rcs','RCS'],['gear','GEAR'],['view','VIEW'],['wm','WARP+'],['wl','WARP-']];
 $('row2').innerHTML=B2.map(b=>`<button class="btn" id="b_${b[0]}">${b[1]}</button>`).join('');
 $('b_wh').onclick=openPicker;
 $('b_scan').onclick=doScan;
 $('b_map').onclick=()=>{UI.mapOpen=!UI.mapOpen;$('b_map').classList.toggle('on',UI.mapOpen);};
 $('b_docs').onclick=()=>{const d=$('docs');const open=d.style.display!=='block';
  d.style.display=open?'block':'none';if(open&&!d.dataset.f){d.dataset.f='1';
   d.innerHTML='<button class="btn" id="dclose" style="position:fixed;top:10px;right:12px;z-index:5">CLOSE</button>'+
    ((typeof DOCS_HTML!=='undefined'?DOCS_HTML:'')+(typeof DOCS_HTML2!=='undefined'?DOCS_HTML2:'')
     ||'<div class="w"><h1>Documentation unavailable</h1></div>');
   $('dclose').onclick=()=>{d.style.display='none';};}};
 $('b_view').onclick=()=>{CTX.view3rd=!CTX.view3rd;$('b_view').classList.toggle('on',!CTX.view3rd);
  message(CTX.view3rd?'EXTERIOR VIEW':'COCKPIT VIEW');};
 $('b_sas').onclick=()=>{SHIP.sas=!SHIP.sas;$('b_sas').classList.toggle('on',SHIP.sas);};
 $('b_rcs').onclick=()=>{SHIP.rcsOn=!SHIP.rcsOn;$('b_rcs').classList.toggle('on',SHIP.rcsOn);};
 $('b_gear').onclick=()=>{SHIP.gearDown=!SHIP.gearDown;$('b_gear').classList.toggle('on',SHIP.gearDown);
  message(SHIP.gearDown?'GEAR DOWN':'GEAR UP');};
 $('b_wm').onclick=()=>setWarp(1);
 $('b_wl').onclick=()=>setWarp(-1);
 $('close').onclick=()=>{$('pick').style.display='none';};
 $('b_sas').classList.toggle('on',SHIP.sas);
 if(IS_MOBILE)$('stick').style.display='block';
}
const WARPS=[1,2,5,10,50,100,1000,10000,100000];
function setWarp(d){
 let i=WARPS.indexOf(CTX.timeWarp);if(i<0)i=0;
 i=clamp(i+d,0,WARPS.length-1);
 if(d>0&&CTX.altitude<(CTX.body?CTX.body.radius*0.02:1e4)&&WARPS[i]>10){
  message('WARP LIMITED','Too deep in the gravity well — climb higher to warp');return;}
 CTX.timeWarp=WARPS[i];message('TIME WARP '+CTX.timeWarp+'x');
}
function doScan(){
 const b=CTX.body;
 if(!b){message('SCAN: NO TARGET','Nothing within sensor range — approach a body');return;}
 const d=b.dna;
 const g=b.mu/(b.radius*b.radius);
 const rows=[
  'CLASS   '+describeDNA(d),
  'RADIUS  '+fmt(b.radius,'m')+'   GRAVITY '+g.toFixed(2)+' m/s² ('+(g/G0).toFixed(2)+' g)',
  'ESCAPE  '+fmt(Math.sqrt(2*b.mu/b.radius),'m/s')+'   DAY '+fmtT(Math.abs(b.rotPeriod)),
  'ATMOS   '+(b.atmo?('yes · '+b.atmo.rho0.toFixed(3)+' kg/m³ surface · scale height '+
    (b.atmo.scaleH/1000).toFixed(1)+' km'):'none — vacuum'),
  'HYDRO   '+(b.ocean?(b.ocean.kind+' ocean'):'no liquid surface'),
  'BIOSIG  '+(d.vegetation>0.4?'STRONG — chlorophyll-analogue absorption detected':
    (d.vegetation>0.1?'trace organics':'none detected'))
 ];
 UI.scan=b;
 message('SURFACE SCAN — '+b.name,rows.join('<br>'));
}
function openPicker(){
 const p=$('pick');p.style.display='block';
 const L=$('plist');
 let h='';
 for(const b of BODIES){
  if(b===CTX.body&&CTX.altitude<b.radius)continue;
  const d=vdist(SHIP.pos,b.pos);
  h+=`<div class="pit" data-k="b${b.name}"><div class="n">${b.name}</div>`+
     `<div class="d">${b.kind.toUpperCase()} · ${fmt(b.radius,'m')} radius · ${fmt(d,'m')} away<br>`+
     `${b.dna?describeDNA(b.dna):''}</div></div>`;
 }
 h+='<div style="grid-column:1/-1;height:8px"></div>';
 // a handful of other star systems, seeded from the procedural catalogue
 for(let i=0;i<8;i++){
  const id=((SYSTEM.id*97+i*1013904223+7)>>>0)%SYSTEM_COUNT;
  if(id===SYSTEM.id)continue;
  h+=`<div class="pit" data-k="s${id}" style="border-color:rgba(199,155,255,.4)">`+
     `<div class="n" style="color:#c79bff">${systemName(id)}</div>`+
     `<div class="d">STAR SYSTEM · interstellar jump · unexplored</div></div>`;
 }
 L.innerHTML=h;
 L.querySelectorAll('.pit').forEach(el=>{el.onclick=()=>{
  const k=el.dataset.k;p.style.display='none';
  if(k[0]==='s')startWarp(null,+k.slice(1));
  else startWarp(BODIES.find(b=>b.name===k.slice(1)),null);};});
}
/* ---- navball: KSP-style attitude sphere in the local horizon frame ---- */
const ballCv=$('ball'); ballCv.width=132;ballCv.height=132;
const ballCtx=ballCv.getContext('2d',{alpha:true});
const ballImg=ballCtx.createImageData(132,132);
const _nb=v3(),_nbU=v3(),_nbN=v3(),_nbE=v3(),_nbW=v3();
function drawNavball(){
 const S=132,R=S*0.5-3,cx=S*0.5,cy=S*0.5;
 const D=ballImg.data;
 // local horizon frame
 const b=CTX.body;
 if(b){vsub(_nbU,SHIP.pos,b.pos);vnorm(_nbU,_nbU);}else vset(_nbU,0,1,0);
 vset(_nbN,0,1,0);
 if(Math.abs(vdot(_nbN,_nbU))>0.98)vset(_nbN,1,0,0);
 vcross(_nbE,_nbN,_nbU);vnorm(_nbE,_nbE);
 vcross(_nbN,_nbU,_nbE);vnorm(_nbN,_nbN);
 const q=SHIP.quat;
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){
  const i=(y*S+x)*4;
  const dx=(x-cx)/R, dy=(cy-y)/R;
  const r2=dx*dx+dy*dy;
  if(r2>1){D[i+3]=0;continue;}
  const dz=Math.sqrt(1-r2);
  // screen->ship frame->world
  vset(_nb,dx,dy,dz);
  qrot(_nbW,q,_nb);
  const vy=vdot(_nbW,_nbU), vn=vdot(_nbW,_nbN), ve=vdot(_nbW,_nbE);
  const lat=Math.asin(clamp(vy,-1,1)), lon=Math.atan2(ve,vn);
  let r,g2,bl;
  if(vy>=0){r=42;g2=104;bl=168;}else{r=112;g2=76;bl=48;}
  // horizon band
  if(Math.abs(vy)<0.022){r=232;g2=238;bl=246;}
  // graticule every 10 degrees
  const latD=lat/DEG, lonD=lon/DEG;
  const gl1=Math.abs(latD%10)<0.9, gl2=Math.abs(((lonD%10)+10)%10)<0.9*Math.max(0.25,Math.cos(lat));
  if(gl1||gl2){r=Math.min(255,r+70);g2=Math.min(255,g2+70);bl=Math.min(255,bl+70);}
  if(Math.abs(latD%30)<1.3){r=Math.min(255,r+40);g2=Math.min(255,g2+40);bl=Math.min(255,bl+40);}
  // cardinal marks near the horizon
  const sh=0.55+0.45*dz;
  D[i]=r*sh;D[i+1]=g2*sh;D[i+2]=bl*sh;D[i+3]=255;
 }
 ballCtx.putImageData(ballImg,0,0);
 // markers
 const mk=(w,col,txt,filled)=>{
  qinvrot(_nb,q,w);
  const sx=cx+_nb[0]*R, sy=cy-_nb[1]*R;
  const front=_nb[2]>0;
  ballCtx.globalAlpha=front?1:0.32;
  ballCtx.strokeStyle=col;ballCtx.fillStyle=col;ballCtx.lineWidth=1.6;
  ballCtx.beginPath();ballCtx.arc(sx,sy,4.6,0,TAU);
  if(filled&&front)ballCtx.fill();else ballCtx.stroke();
  ballCtx.beginPath();ballCtx.moveTo(sx-8,sy);ballCtx.lineTo(sx-5,sy);
  ballCtx.moveTo(sx+5,sy);ballCtx.lineTo(sx+8,sy);ballCtx.moveTo(sx,sy-8);ballCtx.lineTo(sx,sy-5);
  ballCtx.stroke();ballCtx.globalAlpha=1;
 };
 // prograde / retrograde relative to the surface frame
 const vrel=_v5;
 if(b){vsub(vrel,SHIP.vel,b.vel);}else vcopy(vrel,SHIP.vel);
 if(vlen(vrel)>0.4){
  vnorm(_v6,vrel);mk(_v6,'#ffd34d',null,true);
  vscl(_v7,_v6,-1);mk(_v7,'#ffd34d',null,false);
 }
 if(b){
  vcopy(_v6,_nbU);mk(_v6,'#7fe6ff',null,false);            // radial out
  vcross(_v7,vrel,_nbU);if(vlen(_v7)>1e-6){vnorm(_v7,_v7);mk(_v7,'#c79bff',null,false);}
 }
 // fixed reticle
 ballCtx.strokeStyle='#eaf8ff';ballCtx.lineWidth=1.8;
 ballCtx.beginPath();ballCtx.moveTo(cx-16,cy);ballCtx.lineTo(cx-5,cy);
 ballCtx.moveTo(cx+5,cy);ballCtx.lineTo(cx+16,cy);ballCtx.moveTo(cx,cy-5);ballCtx.lineTo(cx,cy-13);
 ballCtx.stroke();
 ballCtx.beginPath();ballCtx.arc(cx,cy,3,0,TAU);ballCtx.stroke();
 ballCtx.strokeStyle='rgba(90,190,255,.55)';ballCtx.lineWidth=2;
 ballCtx.beginPath();ballCtx.arc(cx,cy,R+1.5,0,TAU);ballCtx.stroke();
}
function updateHUD(dt){
 const set=(id,v,cls)=>{const e=$('h_'+id);if(!e)return;e.textContent=v;
  e.className='val'+(cls?' '+cls:'');};
 const b=CTX.body;
 set('alt',isFinite(CTX.altitude)?fmt(CTX.altitude,'m'):'deep space',
   CTX.altitude<2000&&CTX.phase!=='landed'?'hot':'');
 set('vel',fmt(CTX.speed,'m/s'));
 let vsp=0;
 if(b){vsub(_v0,SHIP.pos,b.pos);vnorm(_v0,_v0);vsub(_v1,SHIP.vel,b.vel);vsp=vdot(_v1,_v0);}
 set('vsp',(vsp>=0?'+':'')+vsp.toFixed(1)+' m/s',vsp<-90?'bad':'');
 const o=SHIP.orbit;
 if(o&&isFinite(o.ra)&&b){set('apo',fmt(o.ra-b.radius,'m'));}else set('apo','—');
 if(o&&isFinite(o.rp)&&b){set('per',fmt(o.rp-b.radius,'m'),o.rp<b.radius?'bad':'');}else set('per','—');
 set('orbT',o&&isFinite(o.period)?fmtT(o.period):'—');
 set('soi',b?b.name:'—');
 set('mode',CTX.phase.toUpperCase(),CTX.phase==='reentry'?'hot':(CTX.phase==='landed'?'ok':''));
 if(b){
  set('bname',b.name);set('bclass',b.kind.toUpperCase());
  set('brad',fmt(b.radius,'m'));
  set('bgrav',(b.mu/(b.radius*b.radius)/G0).toFixed(2)+' g');
  set('bpres',b.atmo?(b.atmo.rho0*287*(b.dna?b.dna.temp:250)/1000).toFixed(1)+' kPa':'vacuum');
  set('bday',fmtT(Math.abs(b.rotPeriod)));
 } else {set('bname','—');set('bclass','—');set('brad','—');set('bgrav','—');set('bpres','—');set('bday','—');}
 set('bsys',SYSTEM.name);
 set('twarp',CTX.timeWarp+'x',CTX.timeWarp>1?'hot':'');
 const g=(id,v)=>{const e=$('g_'+id);if(e)e.style.width=(sat(v)*100).toFixed(1)+'%';};
 g('fuel',SHIP.fuel);g('ox',SHIP.oxygen);g('hull',SHIP.hull);g('pwr',SHIP.power);
 $('thr').firstElementChild.style.height=(SHIP.throttle*100).toFixed(0)+'%';
 $('thr').lastElementChild.textContent=(SHIP.throttle*100).toFixed(0)+'%';
 if((UI.ballFrame++ & 1)===0)drawNavball();
 if(UI.msgT>0){UI.msgT-=dt;if(UI.msgT<=0)$('msg').style.opacity=0;}
 if(UI.subT>0){UI.subT-=dt;if(UI.subT<=0)$('sub').style.opacity=0;}
}
/* ---- touch sticks ---- */
const TOUCH={lx:0,ly:0,rx:0,ry:0};
function bindSticks(){
 const bind=(el,ox,oy)=>{
  const knob=el.firstElementChild;let id=null,cx=0,cy=0;
  const set=(x,y)=>{const r=el.getBoundingClientRect();
   let dx=(x-r.left-r.width/2)/(r.width/2), dy=(y-r.top-r.height/2)/(r.height/2);
   const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
   TOUCH[ox]=dx;TOUCH[oy]=-dy;
   knob.style.transform='translate('+(dx*34)+'px,'+(dy*34)+'px)';};
  el.addEventListener('touchstart',e=>{id=e.changedTouches[0].identifier;
   set(e.changedTouches[0].clientX,e.changedTouches[0].clientY);e.preventDefault();},{passive:false});
  el.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(t.identifier===id)
   set(t.clientX,t.clientY);e.preventDefault();},{passive:false});
  const end=e=>{for(const t of e.changedTouches)if(t.identifier===id){id=null;TOUCH[ox]=0;TOUCH[oy]=0;
   knob.style.transform='';}};
  el.addEventListener('touchend',end);el.addEventListener('touchcancel',end);
 };
 bind($('skL'),'lx','ly');bind($('skR'),'rx','ry');
}

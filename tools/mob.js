/* T2 — mobile touch harness. Drives the real build with a phone context and
   REAL touch events (CDP Input.dispatchTouchEvent), asserting that the touch
   layer moves the sim. Usage: node tools/mob.js [--land] [--shot name.png] */
const {chromium}=require('playwright');
const LAND=process.argv.includes('--land');
const VW=LAND?844:390, VH=LAND?390:844;

function ok(n,c,extra){console.log((c?'  PASS ':'  FAIL ')+n+(extra!==undefined?'   '+extra:''));if(!c)process.exitCode=1;}

(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:VW,height:VH},hasTouch:true,isMobile:true,
  deviceScaleFactor:1,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '+
            '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
 const p=await ctx.newPage();
 const errs=[];
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 p.on('pageerror',e=>errs.push('PAGEERROR: '+(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html');
 await p.waitForTimeout(9000);

 const cdp=await ctx.newCDPSession(p);
 const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type:type,
   touchPoints:pts.map(q=>({x:q.x,y:q.y,id:q.id,radiusX:12,radiusY:12,force:1}))});
 const settle=ms=>p.waitForTimeout(ms||420);
 // headless SwiftShader runs at ~1-3 FPS, and the physics only sees an axis on the
 // next frame, so wait for the sim to actually pick a value up instead of guessing.
 const until=async(fn,label)=>{try{await p.waitForFunction(fn,null,{timeout:12000,polling:120});
   return true;}catch(e){console.log('   (timeout waiting for '+label+')');return false;}};

 console.log('== '+(LAND?'LANDSCAPE':'PORTRAIT')+' '+VW+'x'+VH+' ==');

 const geo=await p.evaluate(()=>{
  const r=id=>{const e=document.getElementById(id);if(!e)return null;
   const b=e.getBoundingClientRect();const s=getComputedStyle(e);
   return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),
           vis:s.visibility,disp:s.display,op:+s.opacity};};
  return {mobOn:MOBDBG.S.on,land:MOBDBG.S.land,
    IS_MOBILE:null,
    st:MOBDBG.selfTest(),
    zL:MOBDBG.S.zL,zR:MOBDBG.S.zR,zT:MOBDBG.S.zT,band:MOBDBG.S.band,
    thr:r('mobThr'),row:r('mobRow'),roll:r('mobRoll'),root:r('mobRoot'),
    sL:(()=>{const e=MOBDBG.S.el.sL,b=e.getBoundingClientRect(),s=getComputedStyle(e);
      return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),op:+s.opacity};})(),
    nav:r('nav'),tl:r('tl')};
 });
 console.log(JSON.stringify(geo));
 ok('mobile scheme enabled',geo.mobOn);
 ok('selfTest',geo.st&&geo.st.ok,JSON.stringify(geo.st));
 ok('throttle visible on screen',!!geo.thr&&geo.thr.w>10&&geo.thr.x>=0&&geo.thr.y>=0&&
    geo.thr.y+geo.thr.h<=VH&&geo.thr.disp!=='none');
 ok('button row on screen',!!geo.row&&geo.row.y>=0&&geo.row.y+geo.row.h<=VH);
 ok('stick resting affordance visible',geo.sL.op>0.02,'opacity='+geo.sL.op);

 const rst=await p.evaluate(()=>({rcs:Array.from(SEGDBG.SHIP.rcs),thr:SEGDBG.SHIP.throttle}));

 /* ---- 1. right stick -> SHIP.rcs -------------------------------------- */
 const rc={x:Math.round((geo.zR[0]+geo.zR[2])/2),y:Math.round((geo.zR[1]+geo.zR[3])/2)};
 await T('touchStart',[{x:rc.x,y:rc.y,id:1}]);
 await T('touchMove',[{x:rc.x,y:rc.y-44,id:1}]);
 await settle();
 await until(()=>Math.abs(SEGDBG.SHIP.rcs[0])>0.1,'SHIP.rcs[0]');
 const s1=await p.evaluate(()=>({rcs:Array.from(SEGDBG.SHIP.rcs),ax:Object.assign({},MOBDBG.axes),
   stickOp:+getComputedStyle(MOBDBG.S.el.sR).opacity}));
 ok('right stick up -> pitch axis',Math.abs(s1.ax.pitch)>0.2,JSON.stringify(s1.ax));
 ok('right stick up -> SHIP.rcs[0] moved',Math.abs(s1.rcs[0]-rst.rcs[0])>0.1,JSON.stringify(s1.rcs));
 ok('right stick knob rendered',s1.stickOp>0.5,s1.stickOp);
 await T('touchMove',[{x:rc.x+46,y:rc.y,id:1}]);
 await settle();
 await until(()=>Math.abs(SEGDBG.SHIP.rcs[1])>0.1,'SHIP.rcs[1]');
 const s1b=await p.evaluate(()=>({rcs:Array.from(SEGDBG.SHIP.rcs),ax:Object.assign({},MOBDBG.axes)}));
 ok('right stick right -> yaw axis >0',s1b.ax.yaw>0.2,JSON.stringify(s1b.ax));
 ok('yaw reaches SHIP.rcs[1]',Math.abs(s1b.rcs[1])>0.1,JSON.stringify(s1b.rcs));

 /* ---- 2. lifted finger returns to zero -------------------------------- */
 await T('touchEnd',[]);
 await settle();
 await until(()=>Math.abs(SEGDBG.SHIP.rcs[0])<1e-6&&Math.abs(SEGDBG.SHIP.rcs[1])<1e-6,'rcs->0');
 const s2=await p.evaluate(()=>({rcs:Array.from(SEGDBG.SHIP.rcs),ax:Object.assign({},MOBDBG.axes),
   n:MOBDBG.T.size,op:+getComputedStyle(MOBDBG.S.el.sR).opacity}));
 ok('finger up -> axes zero',s2.ax.pitch===0&&s2.ax.yaw===0,JSON.stringify(s2.ax));
 ok('finger up -> SHIP.rcs zeroed',Math.abs(s2.rcs[0])<1e-6&&Math.abs(s2.rcs[1])<1e-6,JSON.stringify(s2.rcs));
 ok('tracker map emptied',s2.n===0,'size='+s2.n);

 /* ---- 3. throttle slider --------------------------------------------- */
 const tr0=geo.thr;                       // the slider's own rect
 const tx=tr0.x+Math.round(tr0.w/2);
 await T('touchStart',[{x:tx,y:tr0.y+tr0.h-8,id:5}]);      // bottom = 0%
 await settle(200);
 await T('touchMove',[{x:tx,y:tr0.y+Math.round(tr0.h*0.5),id:5}]);  // middle
 await settle(200);
 const t1=await p.evaluate(()=>({t:SEGDBG.SHIP.throttle,a:MOBDBG.axes.throttle}));
 ok('throttle drag to middle ~= 0.5',Math.abs(t1.t-0.5)<0.06,JSON.stringify(t1));
 await T('touchMove',[{x:tx,y:tr0.y+3,id:5}]);             // top
 await settle(200);
 const t2=await p.evaluate(()=>({t:SEGDBG.SHIP.throttle}));
 ok('throttle drag to top = 1 (detent)',t2.t===1,JSON.stringify(t2));
 await T('touchEnd',[]);
 await settle(400);
 const t3=await p.evaluate(()=>({t:SEGDBG.SHIP.throttle,txt:document.querySelector('#mobThr b').textContent}));
 ok('throttle HOLDS after release',t3.t===1,JSON.stringify(t3));
 ok('throttle readout painted',t3.txt==='100%',t3.txt);
 // a 35 % target must NOT snap to a detent
 await T('touchStart',[{x:tx,y:tr0.y+Math.round(tr0.h*0.65),id:6}]);
 await settle(200);
 const t4=await p.evaluate(()=>SEGDBG.SHIP.throttle);
 ok('throttle is continuous between detents',Math.abs(t4-0.35)<0.05,t4);
 // fat-finger slop: a touch just OUTSIDE the slider still grabs it.
 // Park the knob at 0 first so this is an absolute jump, not a knob-relative grab.
 await T('touchEnd',[]);await settle(150);
 await T('touchStart',[{x:tx,y:tr0.y+tr0.h-2,id:9}]);await settle(150);
 await T('touchEnd',[]);await settle(150);
 ok('drag to the very bottom = 0 (detent)',await p.evaluate(()=>SEGDBG.SHIP.throttle)===0);
 const slopX=(tr0.x+tr0.w/2>VW/2)?(tr0.x-11):(tr0.x+tr0.w+11);
 await T('touchStart',[{x:slopX,y:tr0.y+Math.round(tr0.h*0.5),id:7}]);
 await settle(250);
 const t5=await p.evaluate(()=>({t:SEGDBG.SHIP.throttle,k:Array.from(MOBDBG.T.values()).map(r=>r.kind).join('')}));
 ok('slop zone beside the slider still grabs it',t5.k==='T'&&Math.abs(t5.t-0.5)<0.07,JSON.stringify(t5));
 const tHold=t5.t;
 await T('touchEnd',[]);await settle(200);
 // throttle survives an unrelated stick input (no cross-talk)
 await T('touchStart',[{x:rc.x,y:rc.y,id:8}]);
 await T('touchMove',[{x:rc.x,y:rc.y-40,id:8}]);
 await settle(300);
 const t6=await p.evaluate(()=>SEGDBG.SHIP.throttle);
 await T('touchEnd',[]);await settle(200);
 ok('throttle unchanged by a stick input',Math.abs(t6-tHold)<1e-9,t6+' vs '+tHold);

 /* ---- 4. two simultaneous touches ------------------------------------ */
 const lc={x:Math.round((geo.zL[0]+geo.zL[2])/2),y:Math.round((geo.zL[1]+geo.zL[3])/2)};
 await T('touchStart',[{x:lc.x,y:lc.y,id:11}]);
 await T('touchStart',[{x:lc.x,y:lc.y,id:11},{x:rc.x,y:rc.y,id:12}]);
 await T('touchMove',[{x:lc.x+44,y:lc.y,id:11},{x:rc.x,y:rc.y-44,id:12}]);
 await settle();
 await until(()=>Math.abs(SEGDBG.SHIP.translate[0])>0.2,'SHIP.translate[0]');
 const m1=await p.evaluate(()=>({ax:Object.assign({},MOBDBG.axes),n:MOBDBG.T.size,
   tr:Array.from(SEGDBG.SHIP.translate),rcs:Array.from(SEGDBG.SHIP.rcs),
   kinds:Array.from(MOBDBG.T.values()).map(r=>r.kind).sort().join('')}));
 ok('two fingers tracked',m1.n===2,'n='+m1.n+' kinds='+m1.kinds);
 ok('left stick -> translate X',Math.abs(m1.tr[0])>0.2,JSON.stringify(m1.tr));
 ok('right stick still -> pitch, simultaneously',Math.abs(m1.ax.pitch)>0.2,JSON.stringify(m1.ax));
 // lift only the LEFT finger; right must survive
 await T('touchEnd',[{x:rc.x,y:rc.y-44,id:12}]);
 await settle();
 const m2=await p.evaluate(()=>({ax:Object.assign({},MOBDBG.axes),n:MOBDBG.T.size}));
 ok('lifting the RIGHT finger zeroes pitch but keeps the LEFT stick',
    m2.n===1&&m2.ax.pitch===0&&Math.abs(m2.ax.tx)>0.2,JSON.stringify(m2));
 await T('touchCancel',[]);
 await settle();
 const m3=await p.evaluate(()=>({ax:Object.assign({},MOBDBG.axes),n:MOBDBG.T.size}));
 ok('touchcancel clears everything',m3.n===0&&m3.ax.pitch===0,JSON.stringify(m3));

 /* ---- 5. camera drag on empty sky ------------------------------------ */
 const c0=await p.evaluate(()=>({y:MOBDBG.CAM.yaw,p:MOBDBG.CAM.pitch,d:MOBDBG.CAM.dist}));
 const sky={x:Math.round(VW*0.5),y:Math.round(VH*0.42)};
 await T('touchStart',[{x:sky.x,y:sky.y,id:21}]);
 await T('touchMove',[{x:sky.x+70,y:sky.y+30,id:21}]);
 await settle(200);
 await T('touchEnd',[]);
 const c1=await p.evaluate(()=>({y:MOBDBG.CAM.yaw,p:MOBDBG.CAM.pitch,d:MOBDBG.CAM.dist}));
 ok('sky drag orbits camera',Math.abs(c1.y-c0.y)>0.05,JSON.stringify([c0,c1]));
 // pinch
 await T('touchStart',[{x:sky.x-40,y:sky.y,id:31}]);
 await T('touchStart',[{x:sky.x-40,y:sky.y,id:31},{x:sky.x+40,y:sky.y,id:32}]);
 await T('touchMove',[{x:sky.x-15,y:sky.y,id:31},{x:sky.x+15,y:sky.y,id:32}]);
 await settle(200);
 await T('touchEnd',[]);
 const c2=await p.evaluate(()=>MOBDBG.CAM.dist);
 ok('pinch changes MOBDBG.CAM.dist',Math.abs(c2-c1.d)>0.5,c1.d+' -> '+c2);

 /* ---- 6. buttons ------------------------------------------------------ */
 const before=await p.evaluate(()=>({sas:SEGDBG.SHIP.sas,gear:SEGDBG.SHIP.gearDown}));
 const bpos=await p.evaluate(()=>{const o={};
   document.querySelectorAll('#mobRow .mobB').forEach(e=>{const b=e.getBoundingClientRect();
    o[e.dataset.k]=[Math.round(b.x+b.width/2),Math.round(b.y+b.height/2),Math.round(b.width)];});
   return o;});
 for(const k of ['sas','gear']){
  await T('touchStart',[{x:bpos[k][0],y:bpos[k][1],id:41}]);
  await T('touchEnd',[]);
  await settle(200);
 }
 const after=await p.evaluate(()=>({sas:SEGDBG.SHIP.sas,gear:SEGDBG.SHIP.gearDown}));
 ok('SAS button toggles',after.sas!==before.sas,JSON.stringify([before,after]));
 ok('GEAR button toggles',after.gear!==before.gear);
 ok('buttons >= 34px wide',Object.values(bpos).every(v=>v[2]>=34),JSON.stringify(bpos.sas));

 /* ---- 7. roll --------------------------------------------------------- */
 const rp=await p.evaluate(()=>{const e=document.querySelectorAll('#mobRoll .mobR');
   return Array.from(e).map(x=>{const b=x.getBoundingClientRect();
    return [Math.round(b.x+b.width/2),Math.round(b.y+b.height/2)];});});
 await T('touchStart',[{x:rp[1][0],y:rp[1][1],id:51}]);
 await settle(200);
 const rAx=await p.evaluate(()=>MOBDBG.axes.roll);
 ok('roll button -> mobAxes.roll in the same event',Math.abs(rAx)>0.5,rAx);
 await until(()=>Math.abs(SEGDBG.SHIP.rcs[2])>0.2,'SHIP.rcs[2]');
 const r1=await p.evaluate(()=>({roll:MOBDBG.axes.roll,rcs2:SEGDBG.SHIP.rcs[2]}));
 ok('roll reaches SHIP.rcs[2]',Math.abs(r1.rcs2)>0.2,JSON.stringify(r1));
 await T('touchEnd',[]);
 await settle(200);
 const r2=await p.evaluate(()=>MOBDBG.axes.roll);
 ok('roll releases immediately',r2===0,r2);
 await until(()=>Math.abs(SEGDBG.SHIP.rcs[2])<1e-6,'SHIP.rcs[2] -> 0');
 ok('roll release reaches the sim',await p.evaluate(()=>Math.abs(SEGDBG.SHIP.rcs[2])<1e-6));

 /* ---- 8. overlays not blocked ---------------------------------------- */
 await p.evaluate(()=>{const b=document.getElementById('b_map');if(b)b.click();});
 await settle(500);
 const map=await p.evaluate(()=>{
  const el=document.elementFromPoint(innerWidth*0.5,innerHeight*0.35);
  const m=document.getElementById('map_root');
  return {open:!!(m&&getComputedStyle(m).display==='block'),top:el?(el.id||el.className||el.tagName):null,
    ctrl:getComputedStyle(document.getElementById('mobUI')).visibility,
    pe:getComputedStyle(document.getElementById('mobRoot')).pointerEvents};});
 ok('map opens',map.open,JSON.stringify(map));
 ok('map receives touches, not mobRoot',map.top==='map_cv'&&map.pe==='none',JSON.stringify(map));
 ok('controls hidden behind the map',map.ctrl==='hidden',map.ctrl);
 await p.evaluate(()=>{const b=document.getElementById('b_map');if(b)b.click();});
 await settle(300);
 await p.evaluate(()=>{const b=document.getElementById('b_docs');if(b)b.click();});
 await settle(500);
 const doc=await p.evaluate(()=>{
  const d=document.getElementById('docs');
  const el=document.elementFromPoint(innerWidth*0.5,innerHeight*0.5);
  return {open:d.style.display==='block',hit:el?(el.id||el.tagName):null,
    ctrlHidden:getComputedStyle(document.getElementById('mobUI')).visibility};});
 ok('docs opens and receives the touch',doc.open&&doc.hit!=='mobRoot',JSON.stringify(doc));
 ok('controls hidden behind docs',doc.ctrlHidden==='hidden',doc.ctrlHidden);
 await p.evaluate(()=>{const d=document.getElementById('dclose');if(d)d.click();});
 await settle(300);

 /* ---- 8b. docs must be scrollable by touch --------------------------- */
 await p.evaluate(()=>{const b=document.getElementById('b_docs');if(b)b.click();});
 await settle(600);
 const dta=await p.evaluate(()=>getComputedStyle(document.getElementById('docs')).touchAction);
 ok('docs panel allows touch scrolling',dta==='pan-y',dta);
 const dsc=await p.evaluate(()=>{const d=document.getElementById('docs');
   const h=d.scrollHeight>d.clientHeight; d.scrollTop=400; return {h:h,top:d.scrollTop};});
 ok('docs actually scrolls',dsc.h&&dsc.top>300,JSON.stringify(dsc));
 await p.evaluate(()=>{const d=document.getElementById('dclose');if(d)d.click();});
 await settle(400);

 /* ---- 8c. systems MENU ------------------------------------------------ */
 const mb=await p.evaluate(()=>{const e=document.querySelector('#mobRow .mobB[data-k=menu]');
   const b=e.getBoundingClientRect();return [Math.round(b.x+b.width/2),Math.round(b.y+b.height/2)];});
 await T('touchStart',[{x:mb[0],y:mb[1],id:61}]);await T('touchEnd',[]);
 await settle(400);
 const mo=await p.evaluate(()=>({open:document.getElementById('mobMenu').classList.contains('a'),
   blocked:getComputedStyle(document.getElementById('mobRoot')).pointerEvents,
   n:document.querySelectorAll('#mobMenu button').length}));
 ok('MENU opens the systems panel',mo.open&&mo.n===6,JSON.stringify(mo));
 ok('MENU disables the stick pipeline',mo.blocked==='none',mo.blocked);
 // wormhole picker from the menu
 const wb=await p.evaluate(()=>{const e=document.querySelector('#mobMenu button[data-k=wh]');
   const b=e.getBoundingClientRect();return [Math.round(b.x+b.width/2),Math.round(b.y+b.height/2)];});
 await T('touchStart',[{x:wb[0],y:wb[1],id:62}]);await T('touchEnd',[]);
 await settle(500);
 const wo=await p.evaluate(()=>({pick:document.getElementById('pick').style.display,
   menu:document.getElementById('mobMenu').classList.contains('a'),
   items:document.querySelectorAll('#plist .pit').length,
   ta:getComputedStyle(document.getElementById('pick')).touchAction}));
 ok('MENU > CREATE WORMHOLE opens the target picker',wo.pick==='block'&&wo.items>4,JSON.stringify(wo));
 ok('menu closed behind it',!wo.menu);
 ok('picker allows touch scrolling',wo.ta==='pan-y',wo.ta);
 await p.evaluate(()=>document.getElementById('close').click());
 await settle(400);

 /* ---- 8d. rotate mid-flight ------------------------------------------- */
 await T('touchStart',[{x:rc.x,y:rc.y,id:71}]);
 await T('touchMove',[{x:rc.x,y:rc.y-40,id:71}]);
 await settle(300);
 await p.setViewportSize({width:VH,height:VW});      // rotate WITH a finger down
 await settle(900);
 const rot=await p.evaluate(()=>({land:MOBDBG.S.land,W:MOBDBG.S.W,H:MOBDBG.S.H,
   ax:Object.assign({},MOBDBG.axes),n:MOBDBG.T.size,st:MOBDBG.selfTest(),
   row:(()=>{const b=document.getElementById('mobRow').getBoundingClientRect();
     return [Math.round(b.y),Math.round(b.bottom)];})(),
   thr:(()=>{const b=document.getElementById('mobThr').getBoundingClientRect();
     return [Math.round(b.x),Math.round(b.y),Math.round(b.bottom)];})()}));
 ok('orientationchange relayouts',rot.land===!LAND&&rot.W===VH&&rot.H===VW,JSON.stringify(rot));
 ok('rotation drops latched axes',rot.n===0&&rot.ax.pitch===0,JSON.stringify(rot.ax));
 ok('rotated layout still on screen',rot.st.ok&&rot.row[1]<=VW&&rot.thr[2]<=VW,JSON.stringify(rot));
 await T('touchEnd',[]);
 await p.setViewportSize({width:VW,height:VH});
 await settle(900);
 ok('rotates back',(await p.evaluate(()=>MOBDBG.S.land))===LAND);

 /* ---- 9. no page scroll ---------------------------------------------- */
 const sc=await p.evaluate(()=>({x:scrollX,y:scrollY,bw:document.body.scrollWidth,iw:innerWidth}));
 ok('page never scrolled',sc.x===0&&sc.y===0&&sc.bw<=sc.iw+1,JSON.stringify(sc));

 const shot=(process.argv.find(a=>a.startsWith('--shot='))||'').split('=')[1];
 if(shot){await p.screenshot({path:shot,timeout:120000});console.log('  shot -> '+shot);}
 console.log('ERRORS('+errs.length+')');errs.slice(0,8).forEach(e=>console.log('   '+e.slice(0,300)));
 if(errs.length)process.exitCode=1;
 await b.close();
})();

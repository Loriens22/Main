const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:900,height:600}});
 const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,180)));
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,180));});
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html');
 await p.waitForTimeout(6000);
 await p.click('#b_docs'); await p.waitForTimeout(1000);
 console.log('DOCS '+JSON.stringify(await p.evaluate(()=>{const e=document.getElementById('docs');
   return {len:e.innerHTML.length,h2:e.querySelectorAll('h2').length,
           pre:e.querySelectorAll('pre').length,tbl:e.querySelectorAll('table').length};})));
 await p.screenshot({path:'shot_docs.png'});
 await p.click('#dclose'); await p.waitForTimeout(300);
 // drive the wormhole to completion analytically (headless runs at ~1fps)
 const r=await p.evaluate(()=>{
   const D=window.SEGDBG;
   const mars=D.BODIES.find(b=>b.name==='MARS');
   D.startWarp(mars,null);
   for(let i=0;i<400;i++) D.warpUpdate(0.05);
   const dx=D.SHIP.pos[0]-mars.pos[0],dy=D.SHIP.pos[1]-mars.pos[1],dz=D.SHIP.pos[2]-mars.pos[2];
   const rr=Math.hypot(dx,dy,dz);
   const vx=D.SHIP.vel[0]-mars.vel[0],vy=D.SHIP.vel[1]-mars.vel[1],vz=D.SHIP.vel[2]-mars.vel[2];
   const vv=Math.hypot(vx,vy,vz), vc=Math.sqrt(mars.mu/rr);
   return {state:D.WARPST.state,r:rr,radii:rr/mars.radius,v:vv,vCirc:vc,err:Math.abs(vv-vc)/vc};
 });
 console.log('WARP '+JSON.stringify(r));
 console.log(r.err<0.01 ? 'PASS arrival orbit circular' : 'FAIL arrival orbit');
 await p.waitForTimeout(2500); await p.screenshot({path:'shot_mars.png'});
 console.log('ERRORS('+errs.length+') '+errs.slice(0,4).join(' | '));
 await b.close();
})();

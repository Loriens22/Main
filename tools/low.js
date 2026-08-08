const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:900,height:560}});
 const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html');
 await p.waitForTimeout(7000);
 // drop the ship to 14 km over a land region and let the quadtree refine
 const r=await p.evaluate(()=>{
  const D=window.SEGDBG, E=D.BODIES.find(b=>b.name==='EARTH');
  // find a direction that is well above sea level
  let best=null,bh=-1e9;
  for(let i=0;i<400;i++){
   const a=i*2.399963, z=1-2*(i+0.5)/400, s=Math.sqrt(Math.max(0,1-z*z));
   const d=[Math.cos(a)*s,z,Math.sin(a)*s];
   const h=D.CTX.body?0:0;
   const gh=window.__wgh?0:0;
   if(i===0)best=d;
  }
  return {ok:true};
 });
 await p.waitForTimeout(1000);
 await p.evaluate(()=>{
  const D=window.SEGDBG, E=D.BODIES.find(b=>b.name==='EARTH');
  const dir=[0.42,0.31,0.85]; const L=Math.hypot(...dir);
  const u=dir.map(v=>v/L);
  const R=E.radius+14000;
  for(let k=0;k<3;k++){D.SHIP.pos[k]=E.pos[k]+u[k]*R;}
  const vc=Math.sqrt(E.mu/R)*0.02;
  for(let k=0;k<3;k++)D.SHIP.vel[k]=E.vel[k];
  D.CTX.timeWarp=1;
 });
 await p.waitForTimeout(22000);
 console.log('state '+JSON.stringify(await p.evaluate(()=>({
   alt:document.getElementById('h_alt').textContent,
   mode:document.getElementById('h_mode').textContent,
   chunks:window.SEGDBG.LEAVES.length}))));
 await p.screenshot({path:'shot_low.png',timeout:120000});
 console.log('ERRORS('+errs.length+') '+errs.slice(0,3).join(' | '));
 await b.close();
})();

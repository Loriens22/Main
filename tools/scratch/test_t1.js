// SCRATCH harness (agent T1b) — loads stellar-expanse-t1.html, prints HUD, the
// in-browser fldSelfTest result, and drops the camera to low altitude for a
// terrain screenshot. Does not touch tools/test.js.
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:680}});
 const errs=[],logs=[];
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text());else logs.push(m.text());});
 p.on('pageerror',e=>errs.push('PAGEERROR: '+(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
 await p.goto('file://'+process.cwd()+'/stellar-expanse-t1.html');
 await p.waitForTimeout(9000);
 const st=await p.evaluate(()=>({boot:document.getElementById('bmsg').textContent,
   fps:document.getElementById('fps').textContent,
   alt:(document.getElementById('h_alt')||{}).textContent,
   mode:(document.getElementById('h_mode')||{}).textContent,
   body:(document.getElementById('h_bname')||{}).textContent}));
 console.log('STATE',JSON.stringify(st));
 logs.filter(l=>l.indexOf('FLDSELFTEST')>=0).forEach(l=>console.log(l));
 try{ await p.screenshot({path:'tools/scratch/t1_orbit.png',timeout:120000}); }catch(e){ console.log('ORBIT SHOT SKIPPED: '+e.message.split('\n')[0]); }

 // drop to low altitude over the body to inspect terrain
 const drop=await p.evaluate((km)=>{
  const G=window.SEGDBG; if(!G||!G.SHIP||!G.BODIES) return 'no SEGDBG';
  const S=G.SHIP, b=G.BODIES.find(x=>x.name==='EARTH')||G.CTX.body; if(!b) return 'no body';
  const r=b.radius+km*1000;
  const d=[0.42,0.31,0.85]; const l=Math.hypot(d[0],d[1],d[2]);
  S.pos[0]=b.pos[0]+d[0]/l*r; S.pos[1]=b.pos[1]+d[1]/l*r; S.pos[2]=b.pos[2]+d[2]/l*r;
  // near-circular orbital velocity so it does not immediately crash
  const v=Math.sqrt(b.mu/r); S.vel[0]=b.vel[0]-d[2]/l*v; S.vel[1]=b.vel[1]; S.vel[2]=b.vel[2]+d[0]/l*v;
  return 'ok r='+r.toFixed(0);
 }, Number(process.argv[2]||12));
 console.log('DROP',drop);
 await p.waitForTimeout(9000);
 const st2=await p.evaluate(()=>({fps:document.getElementById('fps').textContent,
   alt:(document.getElementById('h_alt')||{}).textContent,
   mode:(document.getElementById('h_mode')||{}).textContent,
   body:(document.getElementById('h_bname')||{}).textContent}));
 console.log('STATE_LOW',JSON.stringify(st2));
 console.log('ERRORS_AT_LOW('+errs.length+'):'); errs.slice(0,10).forEach(e=>console.log('  '+e.slice(0,300)));
 try{ await p.screenshot({path:'tools/scratch/t1_low.png',timeout:120000}); }catch(e){ console.log('SCREENSHOT SKIPPED (SwiftShader too slow at low altitude): '+e.message.split('\n')[0]); }
 console.log('ERRORS('+errs.length+'):'); errs.slice(0,10).forEach(e=>console.log('  '+e.slice(0,300)));
 await b.close();
})();

const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1100,height:680}});
 const errs=[],logs=[];
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text());else logs.push(m.text());});
 p.on('pageerror',e=>errs.push('PAGEERROR: '+(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html');
 await p.waitForTimeout(9000);
 const st=await p.evaluate(()=>({
   boot:document.getElementById('bmsg').textContent,
   bootVis:getComputedStyle(document.getElementById('boot')).display,
   fps:document.getElementById('fps').textContent,
   alt:(document.getElementById('h_alt')||{}).textContent,
   vel:(document.getElementById('h_vel')||{}).textContent,
   mode:(document.getElementById('h_mode')||{}).textContent,
   body:(document.getElementById('h_bname')||{}).textContent,
   apo:(document.getElementById('h_apo')||{}).textContent,
   per:(document.getElementById('h_per')||{}).textContent
 }));
 console.log('STATE',JSON.stringify(st,null,1));
 console.log('ERRORS('+errs.length+'):');errs.slice(0,10).forEach(e=>console.log('  '+e.slice(0,320)));
 await p.screenshot({path:'shot1.png'});
 await b.close();
})();

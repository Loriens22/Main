const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 // phone viewport with touch
 const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
   deviceScaleFactor:1});
 const p=await c.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
 p.setDefaultNavigationTimeout(120000);
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html',{waitUntil:'domcontentloaded'});
 await p.waitForTimeout(8000);
 await p.screenshot({path:'shot_phone.png',timeout:120000});
 console.log('selfTests '+JSON.stringify(await p.evaluate(()=>{
   const r={};
   for(const n of ['bioSelfTest','mapSelfTest','mobSelfTest'])
     try{r[n]=(typeof window[n]==='function')?window[n]():'not-global';}catch(e){r[n]='threw '+e.message;}
   return r;})));
 await p.click('#b_map'); await p.waitForTimeout(3500);
 await p.screenshot({path:'shot_map.png',timeout:120000});
 console.log('ERRORS('+errs.length+') '+errs.slice(0,4).join(' | '));
 await b.close();
})();

const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle',
  '--use-angle=swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:760,height:470}});
 p.on('pageerror',e=>console.log('ERR '+e.message.slice(0,200)));
 await p.goto('file://'+process.cwd()+'/stellar-expanse.html');
 await p.waitForTimeout(6000);
 for(const [name,cfg] of [['B_noComposite',{noComposite:true}],['C_noTerrain',{noTerrain:true}]]){
  await p.evaluate(c=>Object.assign(window.SEGDBG.DBG,
    {noComposite:false,noTerrain:false,noStars:false},c),cfg);
  await p.waitForTimeout(3000);
  await p.screenshot({path:'diag_'+name+'.png'});
 }
 console.log('chunks='+await p.evaluate(()=>window.SEGDBG.LEAVES.length));
 await b.close();
})();

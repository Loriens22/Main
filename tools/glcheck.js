const {chromium} = require('playwright');
(async () => {
  const b = await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
  const p = await b.newPage();
  await p.setContent('<canvas id=c></canvas>');
  const r = await p.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2');
    if(!gl) return 'NO WEBGL2';
    return {ver: gl.getParameter(gl.VERSION), sl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      cbf: !!gl.getExtension('EXT_color_buffer_float'), lin: !!gl.getExtension('OES_texture_float_linear'),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE)};
  });
  console.log(JSON.stringify(r));
  await b.close();
})();

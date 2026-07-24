const { chromium } = require('playwright');
const path = require('path');
const OUT = '/tmp/claude-0/-home-user-Main/d8597318-59eb-5c81-a34e-8a799814fbed/scratchpad/shots';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist','--enable-webgl','--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => logs.push(m.type()+': '+m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,6).join('\n')));
  await page.goto('file://' + path.resolve('dist/spawn-hub.html'));

  // wait for loading to finish (up to 180s: swiftshader is slow)
  let ok = false;
  for (let i = 0; i < 180; i++) {
    const st = await page.evaluate(() => {
      const l = document.getElementById('loader');
      const n = document.getElementById('note');
      const b = document.getElementById('bar');
      return { gone: l ? l.classList.contains('gone') : false,
               note: n ? n.textContent : '', bar: b ? b.style.width : '' };
    }).catch(e => ({err:String(e)}));
    if (st.err) { logs.push('EVAL '+st.err); break; }
    if (st.gone) { ok = true; break; }
    if (i % 15 === 0) console.log('  ...', st.bar, st.note);
    await page.waitForTimeout(1000);
  }
  console.log('loaded:', ok);
  console.log(logs.slice(0,40).join('\n'));
  if (!ok) { await page.screenshot({ path: OUT+'/00-stuck.png' }); await browser.close(); process.exit(1); }

  await page.waitForTimeout(2500);
  const pois = await page.evaluate(() => window.__pois || null);

  // shot each POI by driving the internal state
  const names = await page.evaluate(() => {
    const l = document.getElementById('placeList');
    return [...l.querySelectorAll('button')].map(b => b.textContent);
  });
  console.log('POIs:', names.length, names.join(' | '));

  for (let i = 0; i < names.length; i++) {
    await page.evaluate((idx) => {
      const l = document.getElementById('placeList');
      l.querySelectorAll('button')[idx].click();
    }, i);
    await page.waitForTimeout(1200);
    const safe = String(i).padStart(2,'0') + '-' + names[i].replace(/[^a-z0-9]+/gi,'_').toLowerCase();
    await page.screenshot({ path: `${OUT}/${safe}.png` });
  }
  const stats = await page.evaluate(() => document.getElementById('stats').textContent);
  console.log('stats:', stats);
  console.log('errors:', logs.filter(l=>/error/i.test(l)).join('\n') || 'none');
  await browser.close();
})();

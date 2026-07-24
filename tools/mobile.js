const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = '/tmp/claude-0/-home-user-Main/d8597318-59eb-5c81-a34e-8a799814fbed/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
  });
  for (const [name, dev] of [['iphone', devices['iPhone 13']], ['pixel', devices['Pixel 5']]]) {
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file://' + path.resolve('dist/spawn-hub.html'));
    let ok = false;
    for (let i = 0; i < 240; i++) {
      const g = await page.evaluate(() => document.getElementById('loader').classList.contains('gone'));
      if (g) { ok = true; break; }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => ({
      quality: [...document.querySelectorAll('[data-q].sel')].map(b => b.dataset.q)[0],
      stats: document.getElementById('stats').textContent,
      dpr: devicePixelRatio,
      canvas: [document.getElementById('gl').width, document.getElementById('gl').height],
      vw: innerWidth, vh: innerHeight,
      hOverflow: document.documentElement.scrollWidth > innerWidth,
      dockVisible: !!document.getElementById('dock').getBoundingClientRect().width,
    }));
    console.log(name, 'loaded:', ok, JSON.stringify(info));
    // open the places panel to check it fits
    await page.tap('#btnPlaces');
    await page.waitForTimeout(600);
    const pr = await page.evaluate(() => {
      const r = document.getElementById('places').getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
               bottom: Math.round(r.bottom), fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 };
    });
    console.log('  panel', JSON.stringify(pr));
    await page.screenshot({ path: `${OUT}/mobile-${name}.png` });
    // simulate a look-drag on the right half
    await page.touchscreen.tap(300, 400);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/mobile-${name}-b.png` });
    console.log('  errors:', errs.slice(0,5).join(' | ') || 'none');
    await ctx.close();
  }
  await browser.close();
})();

#!/usr/bin/env node
/* Concatenates vendor + src modules into one self-contained HTML file. */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'SteveThePCRepairMan.html');

var FILES = [
  'vendor/three.min.js',
  'src/00_core.js',
  'src/10_audio.js',
  'src/20_assets.js',
  'src/30_physics.js',
  'src/40_ui.js',
  'src/50_levels.js',
  'src/60_cutscenes.js',
  'src/70_player.js',
  'src/80_game.js'
];

function read(rel) {
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.warn('  !! MISSING ' + rel + ' — skipping');
    return null;
  }
  return fs.readFileSync(p, 'utf8');
}

/* A literal </script> inside JS would terminate the inline script tag. */
function safe(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

var parts = [];
var total = 0;
console.log('Building ' + path.basename(OUT));
for (var i = 0; i < FILES.length; i++) {
  var src = read(FILES[i]);
  if (src === null) continue;
  total += src.length;
  console.log('  + ' + FILES[i] + '  (' + (src.length / 1024).toFixed(1) + ' KB)');
  parts.push('\n/* ===== ' + FILES[i] + ' ===== */\n' + safe(src) + '\n');
}

var BOOT = [
  '',
  '/* ===== boot ===== */',
  '(function () {',
  "  'use strict';",
  '  function start() {',
  '    var splash = document.getElementById("splash");',
  '    if (!window.THREE) {',
  '      if (splash) splash.innerHTML = \'<div class="msg">three.js failed to load.</div>\';',
  '      return;',
  '    }',
  '    if (!window.STV || !window.STV.Game) {',
  '      if (splash) splash.innerHTML = \'<div class="msg">Engine failed to load.</div>\';',
  '      return;',
  '    }',
  '    try {',
  '      window.STV.Game.boot(document.getElementById("app"));',
  '      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);',
  '    } catch (e) {',
  '      if (splash) splash.innerHTML = \'<div class="msg">\' + (e && e.message ? e.message : e) + \'</div>\';',
  '      try { console.error(e); } catch (x) {}',
  '    }',
  '  }',
  '  if (document.readyState === "loading") {',
  '    document.addEventListener("DOMContentLoaded", start);',
  '  } else { start(); }',
  '})();'
].join('\n');

parts.push(BOOT);

var HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Steve The PC Repair Man</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0a0c0f">
<meta name="description" content="Steve fixes computers. Steve also fixes other things.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="color-scheme" content="dark">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    background: #0a0c0f; color: #e8eef4; overflow: hidden;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none; -webkit-user-select: none;
    overscroll-behavior: none; touch-action: none;
  }
  #app { position: fixed; inset: 0; overflow: hidden; }
  #app canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  #splash {
    position: fixed; inset: 0; z-index: 50; display: flex;
    align-items: center; justify-content: center; flex-direction: column;
    gap: 20px; background: #0a0c0f; color: #f0a24b;
  }
  #splash .mark {
    font: 500 13px/1 monospace; letter-spacing: 0.34em;
    text-transform: uppercase; color: #5fd3ff; opacity: .75;
  }
  #splash .bar {
    width: 148px; height: 2px; background: rgba(240,162,75,.16); overflow: hidden;
  }
  #splash .bar i {
    display: block; width: 40%; height: 100%; background: #f0a24b;
    animation: sweep 1.15s cubic-bezier(.6,0,.4,1) infinite;
  }
  #splash .msg { font: 400 13px/1.6 monospace; color: #ff7a6b; max-width: 80vw; text-align: center; }
  @keyframes sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
  @media (prefers-reduced-motion: reduce) { #splash .bar i { animation: none; width: 100%; } }
</style>
</head>
<body>
<div id="app"></div>
<div id="splash"><div class="mark">Kilbride Computer Repair</div><div class="bar"><i></i></div></div>
<script>
${parts.join('\n')}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, HTML, 'utf8');
console.log('  = ' + path.basename(OUT) + '  (' + (HTML.length / 1024 / 1024).toFixed(2) + ' MB)');

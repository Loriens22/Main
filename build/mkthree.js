// Wraps three.module.min.js in an IIFE and converts its ESM export block into a
// returned THREE namespace, so it can be inlined as a plain <script> with no
// identifier leakage into the game's scope.
const fs = require('fs');
const src = fs.readFileSync('/tmp/tdl/package/build/three.module.min.js', 'utf8');
const m = src.match(/export\{([^}]*)\};?\s*$/);
if (!m) throw new Error('export block not found');
const pairs = m[1].split(',').map(s => s.trim()).filter(Boolean).map(entry => {
  const p = entry.split(/\s+as\s+/);
  return `${JSON.stringify((p[1] || p[0]).trim())}:${p[0].trim()}`;
});
const body = src.slice(0, m.index);
const out = `var THREE=(function(){\n${body}\nreturn{${pairs.join(',')}};\n})();\n`;
fs.writeFileSync('/home/user/Main/build/three.inline.js', out);
console.log('ok', pairs.length, 'exports,', out.length, 'bytes');

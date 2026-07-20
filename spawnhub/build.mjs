// Bundles template.html + src/*.js + builds/*.js into dist/index.html (single file)
// and dist/bundle.js (for node smoke testing).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, process.argv[2] || 'dist');
const srcDir = join(root, 'src');
const buildsDir = join(root, 'builds');

const srcFiles = readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
let buildFiles = [];
try { buildFiles = readdirSync(buildsDir).filter(f => f.endsWith('.js')).sort(); } catch {}

// order: 00_blocks, 01_world, then builds (they only register), then engine, then main
const parts = [];
const push = (dir, f) => parts.push(`/* ==== ${f} ==== */\n` + readFileSync(join(dir, f), 'utf8'));
for (const f of srcFiles.filter(f => !f.startsWith('10_') && !f.startsWith('99_'))) push(srcDir, f);
for (const f of buildFiles) push(buildsDir, f);
for (const f of srcFiles.filter(f => f.startsWith('10_'))) push(srcDir, f);
for (const f of srcFiles.filter(f => f.startsWith('99_'))) push(srcDir, f);

const bundle = parts.join('\n');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'bundle.js'), bundle);

const template = readFileSync(join(root, 'template.html'), 'utf8');
const html = template.replace('<!--SCRIPTS-->', '<script>\n' + bundle.replace(/<\/script>/gi, '<\\/script>') + '\n</script>');
writeFileSync(join(outDir, 'index.html'), html);
console.log(outDir + '/index.html:', (html.length / 1024).toFixed(0) + ' KB;', 'src files:', srcFiles.length, 'build files:', buildFiles.length ? buildFiles.join(', ') : '(none)');

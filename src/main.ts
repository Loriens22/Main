import * as THREE from 'three';
import '@fontsource/archivo-black/400.css';
import '@fontsource/bodoni-moda/500.css';
import '@fontsource/bodoni-moda/500-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import { loadAssets } from './core/assets';
import { Director } from './core/director';
import { T } from './core/util';
import { ManorScene } from './scenes/manor';
import { LogoTexture, TvSpace } from './scenes/crt';
import { BotanicalScene } from './scenes/botanical';
import { FoldScene } from './scenes/fold';
import { CosmosScene } from './scenes/cosmos';
import { Player } from './ui/player';

const Q = new URLSearchParams(location.search);
const EXPORT = Q.has('export');
const ONLY = Q.get('only'); // dev: build only one act
const BASE = './';

async function fonts() {
  const faces = ['400 64px "Archivo Black"', '500 64px "Bodoni Moda"', 'italic 500 64px "Bodoni Moda"', 'italic 500 64px "Cormorant Garamond"', '500 20px "Golos Text"'];
  try { await Promise.all(faces.map((f) => document.fonts.load(f))); } catch (e) { console.warn('font load', e); }
}

async function boot() {
  const canvas = document.getElementById('film') as HTMLCanvasElement;
  const W = EXPORT ? +(Q.get('w') || 1920) : 1280;
  const H = EXPORT ? +(Q.get('h') || 1080) : 720;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: EXPORT, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const setLoad = (f: number, label: string) => {
    const bar = document.getElementById('loadbar');
    const txt = document.getElementById('loadtxt');
    if (bar) bar.style.width = `${Math.round(f * 100)}%`;
    if (txt) txt.textContent = label;
  };
  await fonts();
  const A = await loadAssets(BASE, (f, l) => setLoad(f * 0.8, `Loading ${l}`));
  setLoad(0.82, 'Building the manor');
  await new Promise((r) => setTimeout(r, 0));
  const logo = new LogoTexture();
  const want = (k: string) => !ONLY || ONLY === k;
  const S: any = {};
  if (want('manor')) S.manor = new ManorScene(A, renderer, logo);
  if (want('manor') || want('tv')) S.tv = new TvSpace(logo);
  setLoad(0.88, 'Painting the garden');
  await new Promise((r) => setTimeout(r, 0));
  if (want('botanical')) S.botanical = new BotanicalScene(A, renderer);
  setLoad(0.93, 'Assembling seven folds');
  await new Promise((r) => setTimeout(r, 0));
  if (want('fold')) S.fold = new FoldScene(A, renderer);
  setLoad(0.97, 'Lighting the cosmos');
  await new Promise((r) => setTimeout(r, 0));
  if (want('cosmos')) S.cosmos = new CosmosScene(A, renderer);
  const director = new Director(renderer, S, A, W, H);
  // compile everything up front so playback does not hitch
  for (const k of Object.values(S) as any[]) { try { k.update(k === S.cosmos ? 140 : k === S.fold ? 90 : k === S.botanical ? 60 : 20); renderer.compile(k.scene, k.camera); } catch (e) { console.warn(e); } }
  setLoad(1, 'Ready');
  const film = {
    duration: T.duration,
    fps: T.fps,
    ready: true,
    missing: (A as any).missing,
    renderAt: (t: number) => { director.render(t); return true; },
    capture: (type = 'image/jpeg', q = 0.94) => canvas.toDataURL(type, q),
    S,
    THREE,
  };
  (window as any).__film = film;
  if (!EXPORT) new Player(director, canvas, BASE);
  else director.render(0);
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('status');
  if (s) s.textContent = `The film could not start: ${e?.message || e}`;
  (window as any).__filmError = String(e?.stack || e);
});

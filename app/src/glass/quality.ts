export type GlassQuality = 'high' | 'balanced' | 'low';

let quality: GlassQuality = 'high';
const subs = new Set<(q: GlassQuality) => void>();

/**
 * SVG filters inside backdrop-filter only work in Chromium (Android WebView, Chrome).
 * WebKit (iOS) gets the frosted fallback.
 */
let refractionCache: boolean | null = null;
export function refractionSupported(): boolean {
  if (refractionCache !== null) return refractionCache;
  const ua = navigator.userAgent;
  const isWebKitOnly = /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
  refractionCache = !isWebKitOnly && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)');
  return refractionCache;
}

export function autoGlassQuality(): GlassQuality {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 4) return 'balanced';
  return 'high';
}

export function glassQuality(): GlassQuality {
  return quality;
}

export function setGlassQuality(q: GlassQuality): void {
  quality = q;
  document.documentElement.dataset.glass = q;
  for (const s of subs) s(q);
}

export function subscribeGlassQuality(fn: (q: GlassQuality) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/* ------------------------------------------------------------------ */
/* Light direction for specular rims: follows device tilt or pointer. */
/* ------------------------------------------------------------------ */
let started = false;
export function startGlassLighting(reducedMotion: boolean): () => void {
  if (started) return () => undefined;
  started = true;
  const root = document.documentElement;
  let target = { x: 0.3, y: 0 };
  const cur = { x: 0.3, y: 0 };
  let raf = 0;
  let running = false;

  const tick = () => {
    cur.x += (target.x - cur.x) * 0.12;
    cur.y += (target.y - cur.y) * 0.12;
    const angle = 90 + Math.atan2(cur.y - 0.5, cur.x - 0.5) * (180 / Math.PI);
    root.style.setProperty('--lg-angle', `${angle.toFixed(1)}deg`);
    root.style.setProperty('--lg-x', `${(cur.x * 100).toFixed(1)}%`);
    root.style.setProperty('--lg-y', `${(cur.y * 100).toFixed(1)}%`);
    if (Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.002) raf = requestAnimationFrame(tick);
    else running = false;
  };
  const kick = () => {
    if (running || reducedMotion) return;
    running = true;
    raf = requestAnimationFrame(tick);
  };

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    target = { x: 0.5 + Math.max(-1, Math.min(1, e.gamma / 35)) * 0.45, y: 0.5 - Math.max(-1, Math.min(1, (e.beta - 45) / 40)) * 0.5 };
    kick();
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    target = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
    kick();
  };
  window.addEventListener('deviceorientation', onOrient);
  window.addEventListener('pointermove', onPointer, { passive: true });
  return () => {
    started = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('pointermove', onPointer);
  };
}

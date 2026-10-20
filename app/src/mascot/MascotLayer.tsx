import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { MascotAnchor as Anchor, MascotId, MascotStageApi, Quality } from './types';

type Backend = 'webgl' | 'fallback' | 'disabled' | 'loading';

/** API that silently does nothing (WebGL unavailable / mascots disabled / not mounted yet). */
export const noopMascot: MascotStageApi = {
  setAnchor() {},
  setEmotion() {},
  react() {},
  setSpeaking() {},
  setLookAt() {},
  roam() {},
  moveTo: () => Promise.resolve(),
  hitTest: () => null,
  getPosition: () => null,
  onInteract: () => () => {},
  setTheme() {},
  setQuality() {},
  setReducedMotion() {},
  setPaused() {},
  resize() {},
  getStats: () => ({ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, quality: 'low', dpr: 1 }),
  dispose() {},
};

interface AnchorEntry {
  token: number;
  rect: Anchor | null;
}

interface Ctx {
  api: MascotStageApi;
  register(id: MascotId, token: number): void;
  unregister(id: MascotId, token: number): void;
  report(id: MascotId, token: number, rect: Anchor | null): void;
}

const MascotContext = createContext<Ctx | null>(null);
const BackendContext = createContext<Backend>('disabled');

export interface MascotLayerProps {
  theme: 'light' | 'dark';
  quality?: Quality;
  reducedMotion?: boolean;
  enabled?: boolean;
  zIndex?: number;
  children?: ReactNode;
}

/**
 * Mounts the full-screen transparent mascot canvas (pointer-events: none) and provides
 * the stage API to the tree. The heavy three.js engine is code-split and loaded lazily.
 */
export function MascotLayer({ theme, quality = 'auto', reducedMotion = false, enabled = true, zIndex = 40, children }: MascotLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<MascotStageApi | null>(null);
  const [backend, setBackend] = useState<Backend>(enabled ? 'loading' : 'disabled');
  const anchors = useRef(new Map<MascotId, AnchorEntry[]>());
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  // Stable proxy so consumers can keep a reference across stage (re)creation.
  const api = useMemo<MascotStageApi>(() => {
    const target = () => stageRef.current ?? noopMascot;
    const pendingListeners = new Set<{ cb: Parameters<MascotStageApi['onInteract']>[0]; off: () => void }>();
    const proxy: MascotStageApi = {
      setAnchor: (id, a, o) => target().setAnchor(id, a, o),
      setEmotion: (id, e, o) => target().setEmotion(id, e, o),
      react: (id, a) => target().react(id, a),
      setSpeaking: (id, l) => target().setSpeaking(id, l),
      setLookAt: (t) => target().setLookAt(t),
      roam: (id, m) => target().roam(id, m),
      moveTo: (id, p, o) => target().moveTo(id, p, o),
      hitTest: (x, y) => target().hitTest(x, y),
      getPosition: (id) => target().getPosition(id),
      onInteract: (cb) => {
        const entry = { cb, off: target().onInteract(cb) };
        pendingListeners.add(entry);
        return () => {
          entry.off();
          pendingListeners.delete(entry);
        };
      },
      setTheme: (t) => target().setTheme(t),
      setQuality: (q) => target().setQuality(q),
      setReducedMotion: (v) => target().setReducedMotion(v),
      setPaused: (p) => target().setPaused(p),
      resize: () => target().resize(),
      getStats: () => target().getStats(),
      dispose: () => {},
    };
    (proxy as MascotStageApi & { __rebind?: () => void }).__rebind = () => {
      for (const e of pendingListeners) {
        e.off();
        e.off = target().onInteract(e.cb);
      }
    };
    return proxy;
  }, []);

  // Create / destroy the engine. Canvases are created imperatively inside the host so
  // that swapping WebGL for the 2D fallback never fights React's DOM ownership.
  useEffect(() => {
    if (!enabled) {
      setBackend('disabled');
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let stage: MascotStageApi | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const mkCanvas = () => {
      const c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      host.appendChild(c);
      return c;
    };
    setBackend('loading');
    (async () => {
      const mod = await import('./MascotStage');
      if (cancelled) return;
      if (mod.supportsWebGL2()) {
        canvas = mkCanvas();
        try {
          stage = new mod.MascotStage({
            canvas,
            theme: themeRef.current,
            quality: qualityRef.current,
            reducedMotion: reducedRef.current,
          });
          setBackend('webgl');
        } catch (e) {
          console.warn('[mascot] WebGL stage failed, using 2D fallback', e);
          canvas.remove();
          canvas = null;
          stage = null;
        }
      }
      if (!stage) {
        const { Fallback2DStage } = await import('./Fallback2DStage');
        if (cancelled) return;
        canvas = mkCanvas();
        stage = new Fallback2DStage(canvas, themeRef.current, reducedRef.current);
        setBackend('fallback');
      }
      stageRef.current = stage;
      (api as MascotStageApi & { __rebind?: () => void }).__rebind?.();
      // Push current anchors.
      for (const [id, list] of anchors.current) {
        const top = list[list.length - 1];
        if (top?.rect) stage.setAnchor(id, top.rect, { immediate: true });
      }
    })();
    return () => {
      cancelled = true;
      if (stageRef.current === stage) stageRef.current = null;
      stage?.dispose();
      canvas?.remove();
    };
  }, [enabled, api]);

  useEffect(() => {
    stageRef.current?.setTheme(theme);
  }, [theme, backend]);
  useEffect(() => {
    stageRef.current?.setQuality(quality);
  }, [quality, backend]);
  useEffect(() => {
    stageRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, backend]);

  const ctx = useMemo<Ctx>(
    () => ({
      api,
      register(id, token) {
        const list = anchors.current.get(id) ?? [];
        list.push({ token, rect: null });
        anchors.current.set(id, list);
      },
      unregister(id, token) {
        const list = anchors.current.get(id);
        if (!list) return;
        const idx = list.findIndex((e) => e.token === token);
        if (idx < 0) return;
        const wasTop = idx === list.length - 1;
        list.splice(idx, 1);
        if (wasTop) {
          const next = list[list.length - 1];
          stageRef.current?.setAnchor(id, next?.rect ?? null);
        }
      },
      report(id, token, rect) {
        const list = anchors.current.get(id);
        if (!list) return;
        const entry = list.find((e) => e.token === token);
        if (!entry) return;
        entry.rect = rect;
        if (list[list.length - 1] === entry) stageRef.current?.setAnchor(id, rect);
      },
    }),
    [api],
  );

  const style: CSSProperties = {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100dvh',
    pointerEvents: 'none',
    zIndex,
    display: enabled ? 'block' : 'none',
    contain: 'strict',
  };

  return (
    <MascotContext.Provider value={ctx}>
      <BackendContext.Provider value={backend}>
        {children}
        <div ref={hostRef} style={style} aria-hidden="true" data-mascot-backend={backend} />
      </BackendContext.Provider>
    </MascotContext.Provider>
  );
}

/** The mascot stage API (a safe no-op proxy outside a MascotLayer or when disabled). */
export function useMascot(): MascotStageApi {
  return useContext(MascotContext)?.api ?? noopMascot;
}

/** Which renderer is active: 'webgl', 'fallback', 'disabled' or 'loading'. */
export function useMascotBackend(): Backend {
  return useContext(BackendContext);
}

let tokenSeq = 1;

export interface MascotAnchorProps {
  id: MascotId;
  size: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * An invisible box the mascot "lives" in. Its on-screen rect is tracked continuously
 * (ResizeObserver, scroll/resize, transitions, DOM mutations) and pushed to the stage.
 * When several anchors exist for the same mascot, the last mounted one wins.
 */
export function MascotAnchor({ id, size, className, style }: MascotAnchorProps) {
  const ctx = useContext(MascotContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ctx) return;
    const el = ref.current;
    if (!el) return;
    const token = tokenSeq++;
    ctx.register(id, token);
    let last = '';
    let pollUntil = 0;
    let raf = 0;
    let interval = 0;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const hidden = r.width === 0 && r.height === 0;
      const next: Anchor | null = hidden
        ? null
        : { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
      const key = next ? `${next.x.toFixed(1)},${next.y.toFixed(1)},${next.size.toFixed(1)}` : 'null';
      if (key !== last) {
        last = key;
        ctx.report(id, token, next);
      }
    };
    const tick = () => {
      raf = 0;
      measure();
      if (performance.now() < pollUntil) raf = requestAnimationFrame(tick);
    };
    const kick = (ms = 700) => {
      pollUntil = Math.max(pollUntil, performance.now() + ms);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onEvt = () => kick();
    measure();
    kick(900);

    const ro = new ResizeObserver(onEvt);
    ro.observe(el);
    const mo = new MutationObserver(() => kick(300));
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', onEvt, { passive: true });
    window.addEventListener('scroll', onEvt, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', onEvt, { passive: true });
    document.addEventListener('transitionrun', onEvt, true);
    document.addEventListener('transitionend', onEvt, true);
    document.addEventListener('animationstart', onEvt, true);
    document.addEventListener('animationend', onEvt, true);
    window.addEventListener('pointerup', onEvt, { passive: true, capture: true });
    // Safety net for anything the observers miss.
    interval = window.setInterval(measure, 400);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', onEvt);
      window.removeEventListener('scroll', onEvt, { capture: true });
      window.visualViewport?.removeEventListener('resize', onEvt);
      document.removeEventListener('transitionrun', onEvt, true);
      document.removeEventListener('transitionend', onEvt, true);
      document.removeEventListener('animationstart', onEvt, true);
      document.removeEventListener('animationend', onEvt, true);
      window.removeEventListener('pointerup', onEvt, { capture: true });
      ctx.unregister(id, token);
    };
  }, [ctx, id]);

  return (
    <div
      ref={ref}
      className={className}
      aria-hidden="true"
      data-mascot-anchor={id}
      style={{ width: size, height: size, flex: 'none', pointerEvents: 'none', ...style }}
    />
  );
}

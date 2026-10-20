import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { displacementMap } from './displacement';
import { glassQuality, refractionSupported, subscribeGlassQuality } from './quality';

/* ------------------------------------------------------------------ */
/* Shared SVG filter registry: one <filter> per (size, radius) pair.   */
/* ------------------------------------------------------------------ */
interface FilterEntry {
  id: string;
  refs: number;
  el: SVGFilterElement;
}
const registry = new Map<string, FilterEntry>();
let defs: SVGDefsElement | null = null;
let seq = 0;

function ensureDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

function acquireFilter(w: number, h: number, radius: number, bezel: number, scale: number): string {
  const key = `${Math.round(w)}x${Math.round(h)}r${Math.round(radius)}b${Math.round(bezel)}s${Math.round(scale)}`;
  const hit = registry.get(key);
  if (hit) {
    hit.refs++;
    return hit.id;
  }
  const id = `lg${++seq}`;
  const ns = 'http://www.w3.org/2000/svg';
  const f = document.createElementNS(ns, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', String(Math.round(w)));
  f.setAttribute('height', String(Math.round(h)));
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const img = document.createElementNS(ns, 'feImage');
  img.setAttribute('href', displacementMap(w, h, radius, bezel));
  img.setAttribute('x', '0');
  img.setAttribute('y', '0');
  img.setAttribute('width', String(Math.round(w)));
  img.setAttribute('height', String(Math.round(h)));
  img.setAttribute('preserveAspectRatio', 'none');
  img.setAttribute('result', 'map');
  const disp = document.createElementNS(ns, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(scale));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');
  f.append(img, disp);
  ensureDefs().appendChild(f);
  registry.set(key, { id, refs: 1, el: f });
  return id;
}

function releaseFilter(id: string): void {
  for (const [key, e] of registry) {
    if (e.id !== id) continue;
    if (--e.refs <= 0) {
      e.el.remove();
      registry.delete(key);
    }
    return;
  }
}

/* ------------------------------------------------------------------ */
/* <Glass> — Liquid Glass surface                                      */
/* ------------------------------------------------------------------ */
export type GlassVariant = 'regular' | 'strong' | 'accent' | 'clear' | 'danger';

export interface GlassProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'button' | 'nav' | 'header' | 'section' | 'span' | 'label' | 'footer';
  radius?: number;
  /** Bend the backdrop at the rim (Chromium/Android). Falls back to frosted blur elsewhere. */
  refract?: boolean;
  /** Blur radius of the frosted layer, px. */
  blur?: number;
  variant?: GlassVariant;
  interactive?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  children?: ReactNode;
}

export const Glass = forwardRef<HTMLElement, GlassProps>(function Glass(
  { as = 'div', radius = 22, refract = false, blur = 14, variant = 'regular', interactive = false, className = '', style, children, ...rest },
  ref,
) {
  const el = useRef<HTMLElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLElement);
  const [filterId, setFilterId] = useState<string | null>(null);
  const [quality, setQuality] = useState(glassQuality());

  useEffect(() => subscribeGlassQuality(setQuality), []);

  const wantRefraction = refract && refractionSupported() && quality === 'high';

  useLayoutEffect(() => {
    if (!wantRefraction || !el.current) {
      setFilterId(null);
      return;
    }
    let current: string | null = null;
    let raf = 0;
    const apply = () => {
      const node = el.current;
      if (!node) return;
      const { width, height } = node.getBoundingClientRect();
      if (width < 4 || height < 4) return;
      const r = Math.min(radius, width / 2, height / 2);
      const bezel = Math.min(Math.max(10, r * 0.9), 26);
      const next = acquireFilter(width, height, r, bezel, Math.min(46, bezel * 1.8));
      if (current) releaseFilter(current);
      current = next;
      setFilterId(next);
    };
    apply();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      if (current) releaseFilter(current);
    };
  }, [wantRefraction, radius]);

  const backdrop =
    quality === 'low'
      ? 'none'
      : filterId
        ? `url(#${filterId}) blur(${Math.max(1, blur * 0.25)}px) saturate(185%) brightness(1.05)`
        : `blur(${blur}px) saturate(180%)`;

  const s: CSSProperties = {
    borderRadius: radius,
    backdropFilter: backdrop,
    WebkitBackdropFilter: backdrop === 'none' || filterId ? backdrop : `blur(${blur}px) saturate(180%)`,
    ...style,
  };

  return createElement(
    as,
    {
      ...rest,
      ref: el,
      className: `glass glass--${variant}${interactive ? ' glass--interactive' : ''}${filterId ? ' glass--refract' : ''} ${className}`,
      style: s,
      'data-glass-quality': quality,
    },
    <span className="glass__sheen" aria-hidden="true" />,
    children,
  );
});

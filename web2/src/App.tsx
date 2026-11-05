import { lazy, Suspense, useEffect, useState } from 'react';

const Home = lazy(() => import('./pages/Home'));
const Explore = lazy(() => import('./pages/Explore'));
const Architecture = lazy(() => import('./pages/Architecture'));
const Results = lazy(() => import('./pages/Results'));
const DecoderLab = lazy(() => import('./pages/DecoderLab'));
const CoolingLab = lazy(() => import('./pages/CoolingLab'));
const Paper = lazy(() => import('./pages/Paper'));
const Compare = lazy(() => import('./pages/Compare'));
const Methods = lazy(() => import('./pages/Methods'));

export const ROUTES = [
  { id: 'home', label: 'Overview', C: Home },
  { id: 'explore', label: 'Explore 3D', C: Explore },
  { id: 'architecture', label: 'Architecture', C: Architecture },
  { id: 'results', label: 'Results', C: Results },
  { id: 'decoder', label: 'Decoder Lab', C: DecoderLab },
  { id: 'cooling', label: 'Cooling Lab', C: CoolingLab },
  { id: 'compare', label: 'Comparison', C: Compare },
  { id: 'paper', label: 'Paper', C: Paper },
  { id: 'methods', label: 'Methods', C: Methods },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

function current(): RouteId {
  const h = location.hash.replace(/^#/, '');
  const base = h.split('-')[0];
  return (ROUTES.find((r) => r.id === base)?.id ?? 'home') as RouteId;
}

export function App() {
  const [route, setRoute] = useState<RouteId>(current());
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => {
      const r = current();
      setRoute((prev) => { if (prev !== r) window.scrollTo({ top: 0 }); return r; });
      setMenu(false);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const Page = ROUTES.find((r) => r.id === route)!.C;
  return (
    <>
      <nav className="nav" aria-label="Primary">
        <div className="wrap">
          <a className="brand" href="#home" aria-label="AURORA-Q2 home">
            <span>AURORA<span className="q">-Q2</span></span>
            <small>TOROID · AURORA-CRYO</small>
          </a>
          <button className="btn sm menu-btn" type="button" aria-expanded={menu} aria-controls="nav-links" onClick={() => setMenu(!menu)}>Menu</button>
          <div id="nav-links" className={`nav-links ${menu ? 'open' : ''}`}>
            {ROUTES.map((r) => (
              <a key={r.id} href={`#${r.id}`} aria-current={route === r.id ? 'page' : undefined}>{r.label}</a>
            ))}
          </div>
        </div>
      </nav>
      <main>
        <Suspense fallback={<div className="wrap" style={{ paddingBlock: '4rem' }}><span className="eyebrow">Loading…</span></div>}>
          <Page />
        </Suspense>
      </main>
      <footer className="footer">
        <div className="wrap row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: '0.3rem', maxWidth: '62ch' }}>
            <strong style={{ color: 'var(--fg-2)' }}>AURORA-Q2 is a design study. Nothing here has been fabricated or measured.</strong>
            <span>Performance numbers are circuit-level simulations (Stim + BP-OSD) or analytical models with stated assumptions. Comparisons with other machines put reported hardware results next to our projections and label each one. The 3D models were generated procedurally in Blender 5.2 from the same layout engine as the simulations.</span>
          </div>
          <div className="stack" style={{ gap: '0.2rem' }}>
            <span className="mono">AURORA-Q2 · build 2026-11 · repository loriens22/main</span>
            <a href="#methods">Reproduce every number →</a>
            <a href="https://claude.ai/artifact/PvqLPMwbhB2j5bLreAyXQi" target="_blank" rel="noreferrer">AURORA-Q (first study) ↗</a>
          </div>
        </div>
      </footer>
    </>
  );
}

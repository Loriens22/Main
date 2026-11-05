import { lazy, Suspense, useEffect, useState } from 'react';

const Home = lazy(() => import('./pages/Home'));
const Explorer = lazy(() => import('./pages/Explorer'));
const Lab = lazy(() => import('./pages/Lab'));
const QuantumAI = lazy(() => import('./pages/QuantumAI'));
const Research = lazy(() => import('./pages/Research'));
const Architecture = lazy(() => import('./pages/Architecture'));
const Benchmarks = lazy(() => import('./pages/Benchmarks'));
const Docs = lazy(() => import('./pages/Docs'));
const Roadmap = lazy(() => import('./pages/Roadmap'));

export const ROUTES = [
  { id: 'home', label: 'Overview', C: Home },
  { id: 'explorer', label: '3D Explorer', C: Explorer },
  { id: 'lab', label: 'Quantum Lab', C: Lab },
  { id: 'ai', label: 'Quantum AI', C: QuantumAI },
  { id: 'architecture', label: 'Architecture', C: Architecture },
  { id: 'research', label: 'Research', C: Research },
  { id: 'benchmarks', label: 'Benchmarks', C: Benchmarks },
  { id: 'docs', label: 'Documentation', C: Docs },
  { id: 'roadmap', label: 'Roadmap', C: Roadmap },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

function current(): RouteId {
  const h = location.hash.replace(/^#/, '');
  const base = h.split(/[^a-z-]/)[0];
  return (ROUTES.find((r) => r.id === base)?.id ?? 'home') as RouteId;
}

export function go(id: RouteId) {
  location.hash = id;
}

export function App() {
  const [route, setRoute] = useState<RouteId>(current());
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => { setRoute(current()); setMenu(false); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const Page = ROUTES.find((r) => r.id === route)!.C;
  return (
    <>
      <nav className="nav" aria-label="Primary">
        <div className="wrap">
          <a className="brand" href="#home" aria-label="AURORA-Q home">
            <span>AURORA<span className="q">-Q</span></span>
            <small>RESEARCH PLATFORM</small>
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
          <div className="stack" style={{ gap: '0.3rem', maxWidth: '60ch' }}>
            <strong style={{ color: 'var(--fg-2)' }}>AURORA-Q is a research and simulation platform, not a fabricated quantum computer.</strong>
            <span>Every result on this site is labelled as reported literature, simulation (this work), analytical model, or engineering proposal. All 3D assets were generated procedurally in Blender 5.2; all quantum results come from simulators validated against Qiskit / Aer.</span>
          </div>
          <div className="stack" style={{ gap: '0.2rem' }}>
            <span className="mono">Build 2026-11 · source in repository loriens22/main</span>
            <a href="#docs">Reproduce the experiments →</a>
          </div>
        </div>
      </footer>
    </>
  );
}

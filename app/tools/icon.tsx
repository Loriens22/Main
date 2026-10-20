// Dev tool: renders the real 3D Maverick for app icons / splash (see tools/render-icons.cjs).
import { createRoot } from 'react-dom/client';
import { MascotAnchor, MascotLayer } from '../src/mascot/MascotLayer';

const params = new URLSearchParams(location.search);
const size = Number(params.get('size') || 700);
const offsetY = Number(params.get('dy') || 0);

createRoot(document.getElementById('root')!).render(
  <MascotLayer theme="dark" quality="high" reducedMotion enabled>
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', transform: `translateY(${offsetY}px)` }}>
      <MascotAnchor id="maverick" size={size} />
    </div>
    {params.get('sparky') ? (
      <div style={{ position: 'fixed', right: '9%', top: '9%' }}>
        <MascotAnchor id="sparky" size={Math.round(size * 0.36)} />
      </div>
    ) : (
      // Park Sparky off-screen so it doesn't orbit into the icon.
      <div style={{ position: 'fixed', left: -4000, top: 0 }}>
        <MascotAnchor id="sparky" size={20} />
      </div>
    )}
  </MascotLayer>,
);

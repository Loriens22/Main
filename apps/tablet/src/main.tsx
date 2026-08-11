import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Ornight: #root is missing from the document');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Keep the layout honest when the on-screen keyboard opens. iOS does not resize
 * the visual viewport the way `100vh` assumes, so the composer would otherwise
 * sit underneath the keyboard. Publishing the real height as a custom property
 * lets any fixed surface use `var(--on-viewport-height)` instead of `100vh`.
 */
const viewport = window.visualViewport;
if (viewport) {
  const publish = () => {
    document.documentElement.style.setProperty('--on-viewport-height', `${viewport.height}px`);
    document.documentElement.style.setProperty('--on-keyboard-inset', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
  };
  publish();
  viewport.addEventListener('resize', publish);
  viewport.addEventListener('scroll', publish);
} else {
  document.documentElement.style.setProperty('--on-viewport-height', '100dvh');
  document.documentElement.style.setProperty('--on-keyboard-inset', '0px');
}

// Double-tap zoom fights every control on a dense surface like a diff.
document.addEventListener(
  'gesturestart',
  (event) => event.preventDefault(),
  { passive: false },
);

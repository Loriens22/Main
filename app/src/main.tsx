import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './state/store';
import './styles/app.css';

void boot();
createRoot(document.getElementById('root')!).render(<App />);

// Installable PWA (iOS "Add to Home Screen" path); native builds don't need it.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/localhost/.test(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

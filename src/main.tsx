import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';
import '@fontsource/big-shoulders-display/latin-600';
import '@fontsource/big-shoulders-display/latin-800';
import './styles/tokens.css';
import './styles/runway.css';
import './styles/app.css';
import './styles/landing.css';
import { takeCallbackError } from './lib/callbackError';

// Two entry points share this bundle:
//   - signed out at the site root: the landing page (prerendered into index.html at build time,
//     then taken over by the same component here)
//   - everything else: the app, which checks the session and routes by hash
// The app is a separate chunk, so a visitor who only reads the landing page never downloads it.

const container = document.getElementById('root')!;
let root: Root | null = null;
let mounted: 'landing' | 'app' | null = null;

const hasSession = () => {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch {
    return false;
  }
};
const atRoot = () => location.hash === '' || location.hash === '#' || location.hash === '#/';
const authCallback = () =>
  /[?&](code|error|token_hash)=/.test(location.search) || /access_token=/.test(location.hash);

const wantsApp = () => !atRoot() || hasSession() || authCallback();

async function render() {
  const which = wantsApp() ? 'app' : 'landing';
  if (which === mounted) return;
  mounted = which;
  root?.unmount();
  root = createRoot(container);
  if (which === 'landing') {
    const { Landing } = await import('./landing/Landing');
    root.render(
      <StrictMode>
        <Landing />
      </StrictMode>,
    );
  } else {
    const { App } = await import('./App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    // Once the app is up it owns routing, including the root.
    window.removeEventListener('hashchange', render);
  }
}

// A failed OAuth callback lands on the sign-in screen with its message, not on the landing page.
takeCallbackError();
window.addEventListener('hashchange', render);
render();

// Offline shell (sw.js, generated per build). Production only: in dev it would cache stale modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // no service worker: the app still works online
    });
  });
}

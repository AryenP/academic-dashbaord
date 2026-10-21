import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SpotifyCues } from './components/SpotifyCues';
import { AuthProvider } from './lib/auth';
import { HistoryProvider } from './lib/history';
import { LiveSessionProvider } from './lib/liveSession';
import { SpotifyProvider } from './lib/useSpotify';
import { Home } from './views/Home';

// Only the runway is in the first bundle; the other views load when you open them.
const Focus = lazy(() => import('./views/Focus').then((m) => ({ default: m.Focus })));
const Log = lazy(() => import('./views/Log').then((m) => ({ default: m.Log })));
const Stats = lazy(() => import('./views/Stats').then((m) => ({ default: m.Stats })));
const Settings = lazy(() => import('./views/Settings').then((m) => ({ default: m.Settings })));
const Review = lazy(() => import('./views/Review').then((m) => ({ default: m.Review })));
const PhoneSetup = lazy(() => import('./views/PhoneSetup').then((m) => ({ default: m.PhoneSetup })));

export function App() {
  return (
    <AuthProvider>
      <LiveSessionProvider>
        <HistoryProvider>
          <SpotifyProvider>
            <SpotifyCues />
            <HashRouter>
              <Shell>
                <Suspense fallback={<div className="fx fx-loading" aria-busy="true" />}>
                  <Routes>
                    <Route path="/focus" element={<Focus />} />
                    <Route path="/log" element={<Log />} />
                    <Route path="/stats" element={<Stats />} />
                    <Route path="/review" element={<Review />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/setup/phone" element={<PhoneSetup />} />
                    <Route path="*" element={<Home />} />
                  </Routes>
                </Suspense>
              </Shell>
            </HashRouter>
          </SpotifyProvider>
        </HistoryProvider>
      </LiveSessionProvider>
    </AuthProvider>
  );
}

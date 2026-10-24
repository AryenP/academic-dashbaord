import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SpotifyCues } from './components/SpotifyCues';
import { AuthProvider } from './lib/auth';
import { HistoryProvider } from './lib/history';
import { LiveSessionProvider } from './lib/liveSession';
import { PlanProvider } from './lib/usePlan';
import { SpotifyProvider } from './lib/useSpotify';
import { Home } from './views/Home';

// Only the runway is in the first bundle; the other views load when you open them.
const Focus = lazy(() => import('./views/Focus').then((m) => ({ default: m.Focus })));
const Log = lazy(() => import('./views/Log').then((m) => ({ default: m.Log })));
const Stats = lazy(() => import('./views/Stats').then((m) => ({ default: m.Stats })));
const Settings = lazy(() => import('./views/Settings').then((m) => ({ default: m.Settings })));
const Review = lazy(() => import('./views/Review').then((m) => ({ default: m.Review })));
const PhoneSetup = lazy(() => import('./views/PhoneSetup').then((m) => ({ default: m.PhoneSetup })));
const SignIn = lazy(() => import('./views/SignIn').then((m) => ({ default: m.SignIn })));
const Privacy = lazy(() => import('./views/Privacy').then((m) => ({ default: m.Privacy })));
const Share = lazy(() => import('./views/Share').then((m) => ({ default: m.Share })));
const Connect = lazy(() => import('./views/Connect').then((m) => ({ default: m.Connect })));
const Courses = lazy(() => import('./views/Courses').then((m) => ({ default: m.Courses })));
const Friends = lazy(() => import('./views/Friends').then((m) => ({ default: m.Friends })));
const Now = lazy(() => import('./views/Now').then((m) => ({ default: m.Now })));
const Term = lazy(() => import('./views/Term').then((m) => ({ default: m.Term })));
const Try = lazy(() => import('./views/Try').then((m) => ({ default: m.Try })));

export function App() {
  return (
    <AuthProvider>
      <PlanProvider>
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
                      <Route path="/signin" element={<SignIn />} />
                      <Route path="/privacy" element={<Privacy />} />
                      <Route path="/u/:handle" element={<Share />} />
                      <Route path="/connect" element={<Connect />} />
                      <Route path="/courses" element={<Courses />} />
                      <Route path="/friends" element={<Friends />} />
                      <Route path="/now" element={<Now />} />
                      <Route path="/term" element={<Term />} />
                      <Route path="/try" element={<Try />} />
                      <Route path="*" element={<Home />} />
                    </Routes>
                  </Suspense>
                </Shell>
              </HashRouter>
            </SpotifyProvider>
          </HistoryProvider>
        </LiveSessionProvider>
      </PlanProvider>
    </AuthProvider>
  );
}

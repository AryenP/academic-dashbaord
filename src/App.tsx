import { HashRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { AuthProvider } from './lib/auth';
import { HistoryProvider } from './lib/history';
import { LiveSessionProvider } from './lib/liveSession';
import { Focus } from './views/Focus';
import { Home } from './views/Home';
import { PhoneSettings } from './components/PhoneSettings';
import { Log } from './views/Log';
import { PhoneSetup } from './views/PhoneSetup';
import { Settings } from './views/Settings';
import { Stats } from './views/Stats';

export function App() {
  return (
    <AuthProvider>
      <LiveSessionProvider>
        <HistoryProvider>
          <HashRouter>
            <Shell>
              <Routes>
                <Route path="/focus" element={<Focus />} />
                <Route path="/log" element={<Log />} />
                <Route path="/stats" element={<Stats />} />
                <Route
                  path="/settings"
                  element={
                    <Settings>
                      <PhoneSettings />
                    </Settings>
                  }
                />
                <Route path="/setup/phone" element={<PhoneSetup />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Shell>
          </HashRouter>
        </HistoryProvider>
      </LiveSessionProvider>
    </AuthProvider>
  );
}

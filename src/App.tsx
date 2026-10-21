import { HashRouter, Route, Routes } from 'react-router-dom';
import { Home } from './views/Home';

export function App() {
  return (
    <HashRouter>
      <div className="app-root">
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

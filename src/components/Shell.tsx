import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { courseVars } from '../lib/courses';
import { useLiveSession } from '../lib/liveSession';
import { hasBackend } from '../lib/supabase';
import { clock, timerState } from '../lib/timer';
import { useNow, usePlan } from '../lib/usePlan';
import { useQuickStart } from '../lib/useQuickStart';
import { BreakAlarm } from './BreakAlarm';
import { NowPlayingCompact } from './NowPlaying';
import { Shortcuts } from './Shortcuts';

const NAV = [
  { to: '/', label: 'Runway', end: true },
  { to: '/courses', label: 'Courses' },
  { to: '/focus', label: 'Focus' },
  { to: '/log', label: 'Log' },
  { to: '/stats', label: 'Stats' },
  { to: '/review', label: 'Week' },
  { to: '/settings', label: 'Settings' },
];

/** Compact live timer for the header: course and focus time, links to the focus screen. */
function LiveChip() {
  const live = useLiveSession();
  const { settings } = useAuth();
  const now = useNow(1000) + live.skewMs;
  if (!live.session) return null;
  const st = timerState(live.session, live.breaks, now, settings);
  const label = st.phase === 'break' ? 'Break' : st.phase === 'paused' ? 'Paused' : live.session.course;
  return (
    <Link to="/focus" className="live-chip" style={{ ...courseVars(live.session.course) } as CSSProperties}>
      <i aria-hidden="true" className={st.phase === 'focus' ? 'is-live' : undefined} />
      <span>{label}</span>
      <b>{clock(st.phase === 'break' ? (st.breakLeftSec ?? 0) : st.focusSec)}</b>
    </Link>
  );
}

function StartButton() {
  const plan = usePlan();
  const quickStart = useQuickStart(plan.plan);
  const live = useLiveSession();
  if (live.session || live.loading) return null;
  return (
    <button className="btn btn-primary" onClick={quickStart}>
      Start session
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();
  const focus = pathname === '/focus';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={`app-root${focus ? ' is-focus' : ''}`}>
      <header className="top">
        <Link to="/" className="wordmark" aria-label="Runway home">
          Runway
        </Link>
        {user ? (
          <nav className="top-nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        ) : (
          <span className="top-spacer" />
        )}
        <div className="top-actions">
          {user && (
            <>
              {!focus && <NowPlayingCompact />}
              <LiveChip />
              {!focus && <StartButton />}
            </>
          )}
          {!user && ready && hasBackend && (
            <Link to="/signin" className="btn btn-quiet">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main>{children}</main>
      <Shortcuts />
      {user && <BreakAlarm />}
    </div>
  );
}

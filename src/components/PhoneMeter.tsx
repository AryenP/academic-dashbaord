import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { OPEN_CAP_MS, computeFocus } from '../lib/focus';
import { usePhoneEvents } from '../lib/phone';
import type { Session, SessionBreak } from '../lib/supabase';
import { clock } from '../lib/timer';
import { Icon } from './Icon';

/** Live phone time, pickups and focus % under the session timer, with the formula one tap away. */
export function PhoneMeter({
  session,
  breaks,
  now,
}: {
  session: Session;
  breaks: SessionBreak[];
  now: number;
}) {
  const { profile } = useAuth();
  const [info, setInfo] = useState(false);
  const tracked = !!profile?.phone_token_hash;
  const since = new Date(Date.parse(session.started_at) - OPEN_CAP_MS).toISOString();
  const events = usePhoneEvents(tracked ? since : null);

  if (!tracked)
    return (
      <p className="fx-phone muted small">
        <Icon name="phone" size={16} /> <Link to="/settings">Track phone focus</Link> to see pickups here.
      </p>
    );

  const r = computeFocus(
    { start: Date.parse(session.started_at), end: null },
    breaks.map((b) => ({ start: Date.parse(b.started_at), end: b.ended_at ? Date.parse(b.ended_at) : null })),
    events,
    now,
  );

  return (
    <div className="fx-phone-wrap">
      <p className={`fx-phone${r.openApp ? ' is-open' : ''}`} aria-live="polite">
        <Icon name="phone" size={16} />
        {r.openApp ? (
          <span>
            <b>{r.openApp.app}</b> open · {clock((now - r.openApp.since) / 1000)}
          </span>
        ) : (
          <span>
            Phone <b>{clock(r.phoneSec)}</b>
          </span>
        )}
        <span>
          · <b>{r.pickups}</b> {r.pickups === 1 ? 'pickup' : 'pickups'}
        </span>
        {r.focusPct != null && (
          <span>
            · <b>{Math.round(r.focusPct)}%</b> focus
          </span>
        )}
        <button
          className="icon-btn icon-btn-sm"
          onClick={() => setInfo((v) => !v)}
          aria-expanded={info}
          aria-label="How focus is measured"
        >
          <Icon name="info" size={16} />
        </button>
      </p>
      {info && <FocusFormula />}
    </div>
  );
}

export function FocusFormula() {
  return (
    <div className="formula" role="note">
      <p>
        <b>Focus %</b> = 1 − phone time ÷ focus time.
      </p>
      <ul>
        <li>Focus time is the session minus breaks.</li>
        <li>
          Phone time is time a listed app was open during focus time. An app that never sends a close counts
          for at most 10 minutes.
        </li>
        <li>A pickup is opening a listed app when none was already open.</li>
        <li>Your laptop's other tabs never count against you: reading a PDF is studying.</li>
      </ul>
    </div>
  );
}

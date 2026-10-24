import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/sources';
import { supabase } from '../lib/supabase';
import { useNow } from '../lib/useNow';

// "What Runway holds about you": the person's own counts, read through their own policies
// (my_footprint runs as the caller), with the download and delete links right beside them. The
// point is not the numbers; it is that the student sees Runway counting.

export interface Footprint {
  since: string | null;
  share_level: 'off' | 'runway' | 'readiness' | 'totals' | null;
  timezone: string | null;
  courses: number;
  calendar_sources: number;
  last_synced_at: string | null;
  events: number;
  plan_items: number;
  sessions: number;
  session_breaks: number;
  phone_events: number;
  signals: number;
  weekly_reviews: number;
  friends: number;
  study_invites?: number;
  tokens: string[];
  phone_tracking: boolean;
  ai_calls_month: number;
  ai_events_month: number;
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

const SHARE: Record<string, string> = {
  off: 'Nobody can see your runway.',
  runway: 'Your share page shows your runway and nothing else.',
  readiness: 'Your share page shows your runway and exam readiness.',
  totals: 'Your share page shows your runway, readiness and daily totals.',
};

const TOKEN_NAMES: Record<string, string> = {
  feed: 'the plan feed',
  extension: 'the browser extension',
  shortcut: 'the iPhone Shortcut',
};

/** The sentences, from the numbers. Exported so they can be unit-tested without a browser. */
export function footprintLines(f: Footprint, now: number): string[] {
  const lines: string[] = [];
  lines.push(
    `${n(f.courses, 'course')}, ${n(f.plan_items, 'plan item')}, ${n(f.events, 'calendar event')} and ${n(f.sessions, 'session')} (${n(f.session_breaks, 'break')}).`,
  );
  lines.push(
    f.calendar_sources === 0
      ? 'There are no calendars connected.'
      : f.last_synced_at
        ? `${n(f.calendar_sources, 'calendar')} connected, last read ${ago(f.last_synced_at, now)}. The addresses are stored encrypted and never shown again.`
        : `${n(f.calendar_sources, 'calendar')} connected, not read yet.`,
  );
  lines.push(
    f.ai_calls_month === 0
      ? 'The model has read nothing this month.'
      : `This month the model was sent ${n(f.ai_events_month, 'event title')} with times and places, in ${n(f.ai_calls_month, 'call')}, and nothing else.`,
  );
  lines.push(
    `${n(f.phone_events, 'phone event')} and ${n(f.signals, 'phone signal')}${f.phone_tracking ? ', phone tracking on' : ', phone tracking off'}.`,
  );
  lines.push(
    `${n(f.weekly_reviews, 'weekly review')} kept; ${n(f.friends, 'friend')}${f.study_invites ? `; ${n(f.study_invites, 'study invitation')}` : ''}.`,
  );
  lines.push(
    f.tokens.length
      ? `Tokens for ${f.tokens.map((t) => TOKEN_NAMES[t] ?? t).join(', ')}; only their hashes are stored.`
      : 'No tokens made.',
  );
  lines.push(SHARE[f.share_level ?? 'off'] ?? SHARE.off);
  return lines;
}

export function FootprintPanel({ download }: { download?: React.ReactNode }) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [f, setF] = useState<Footprint | null | undefined>(undefined);
  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .rpc('my_footprint')
      .then(({ data, error }) => setF(error || !data ? null : (data as unknown as Footprint)));
  }, [user]);
  if (!f) return null;
  const since = f.since ? new Date(f.since) : null;
  return (
    <section className="card-section" aria-labelledby="fp-h">
      <h2 id="fp-h" className="mc-h2">
        What Runway holds about you
      </h2>
      <p className="mc-note">
        Counted just now, through the same rules that keep every row yours
        {since
          ? `, since ${since.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
          : ''}
        .
      </p>
      <ul className="fp-list">
        {footprintLines(f, now).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {download}
      <p className="row fp-links">
        <Link to="/privacy">How it's kept</Link>
        <a href="#del-h">Delete my account</a>
      </p>
    </section>
  );
}

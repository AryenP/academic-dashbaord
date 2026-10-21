import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { courseVars } from '../lib/courses';
import { focusSeconds, useHistory } from '../lib/history';
import { dayKey, iso, utc } from '../lib/plan';
import { weekReview } from '../lib/review';
import type { Session } from '../lib/supabase';
import { duration } from '../lib/timer';
import { useNow, usePlan } from '../lib/usePlan';
import { weeklyReview, type WeeklyResult } from '../lib/sources';

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (k: string) => `${MO[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`;
const when = (s: Session) =>
  new Date(s.started_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function Review() {
  const { user, ready } = useAuth();
  const { sessions } = useHistory();
  const data = usePlan();
  const now = useNow();
  const today = dayKey(new Date(now));
  const [anchor, setAnchor] = useState(today);
  const r = useMemo(
    () => weekReview(data.plan, data.exam_prep, sessions, anchor, now),
    [data, sessions, anchor, now],
  );

  const graded = useMemo(
    () => data.plan.filter((i) => i.score != null && !i.proposed && i.day >= r.from && i.day <= r.to),
    [data.plan, r.from, r.to],
  );

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your weekly review" />;

  const shift = (weeks: number) => setAnchor(iso(utc(r.from) + weeks * 7 * 864e5));
  const isThisWeek = today >= r.from && today <= r.to;
  const pct = r.plannedMin ? Math.round((r.actualMin / r.plannedMin) * 100) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-h">Week in review</h1>
          <p className="mc-note" style={{ margin: '6px 0 0' }}>
            {short(r.from)} to {short(r.to)}
            {isThisWeek && ' · this week, so far'}
          </p>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous week">
            <Icon name="back" />
          </button>
          <button
            className="icon-btn flip"
            onClick={() => shift(1)}
            aria-label="Next week"
            disabled={isThisWeek}
          >
            <Icon name="back" />
          </button>
        </div>
      </div>

      <section className="stat-tiles" aria-label="Summary">
        <div className="tile">
          <span className="tile-label">Studied</span>
          <span className="tile-n">{duration(r.actualMin * 60)}</span>
          <span className="tile-note">
            {r.plannedMin
              ? `of ${duration(r.plannedMin * 60)} on the calendar${pct != null ? ` (${pct}%)` : ''}`
              : 'Nothing was planned this week.'}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Sessions</span>
          <span className="tile-n">{r.sessions}</span>
          <span className="tile-note">Finished sessions, including time added by hand.</span>
        </div>
        <div className="tile">
          <span className="tile-label">Deadlines</span>
          <span className="tile-n">
            {r.deadlines.onTime + r.deadlines.late + r.deadlines.missed + r.deadlines.open === 0
              ? '—'
              : `${r.deadlines.onTime} on time`}
          </span>
          <span className="tile-note">
            {r.deadlines.late ? `${r.deadlines.late} late, ` : ''}
            {r.deadlines.missed ? `${r.deadlines.missed} missed, ` : ''}
            {r.deadlines.open ? `${r.deadlines.open} still open. ` : ''}
            Tick deadlines off on the runway as you submit.
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Streak</span>
          <span className="tile-n">
            {r.streak} {r.streak === 1 ? 'day' : 'days'}
          </span>
          <span className="tile-note">At the end of this week.</span>
        </div>
      </section>

      <AiReview key={r.from} week={r.from} isThisWeek={isThisWeek} />

      {graded.length > 0 && (
        <section className="card-section" aria-labelledby="rv-graded">
          <h2 id="rv-graded" className="mc-h2">
            Graded this week
          </h2>
          <p className="mc-note">
            Scores from the browser extension, next to the hours you put into that course this week.
          </p>
          <ul className="rv-graded">
            {graded.map((g) => (
              <li key={g.id} style={courseVars(g.course) as CSSProperties}>
                <span className="rv-course">{g.course}</span>
                <span>{g.title}</span>
                <span className="rv-num">
                  <b>
                    {g.score}
                    {g.maxScore ? ` / ${g.maxScore}` : ''}
                  </b>
                  {g.maxScore ? ` (${Math.round((g.score! / g.maxScore) * 100)}%)` : ''}
                </span>
                <span className="muted">
                  {duration((r.byCourse.find((c) => c.course === g.course)?.actualMin ?? 0) * 60)} studied
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.byCourse.length > 0 && (
        <section className="card-section" aria-labelledby="rv-courses">
          <h2 id="rv-courses" className="mc-h2">
            Hours vs. plan
          </h2>
          <ul className="rv-bars">
            {r.byCourse.map((c) => {
              const max = Math.max(c.plannedMin, c.actualMin, 1);
              return (
                <li key={c.course} style={courseVars(c.course) as CSSProperties}>
                  <span className="rv-course">{c.course}</span>
                  <span className="rv-track" aria-hidden="true">
                    <i className="rv-plan" style={{ width: `${(c.plannedMin / max) * 100}%` }} />
                    <i className="rv-act" style={{ width: `${(c.actualMin / max) * 100}%` }} />
                  </span>
                  <span className="rv-num">
                    <b>{duration(c.actualMin * 60)}</b> of {duration(c.plannedMin * 60)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {r.readiness.length > 0 && (
        <section className="card-section" aria-labelledby="rv-ready">
          <h2 id="rv-ready" className="mc-h2">
            Exam readiness
          </h2>
          <ul className="rv-ready">
            {r.readiness.map(({ exam, before, after }) => (
              <li key={exam.id} style={courseVars(exam.course) as CSSProperties}>
                <span className="rv-course">{exam.course}</span>
                <span>{exam.title}</span>
                <span className="rv-change">
                  {before.pct}% → <b>{after.pct}%</b>
                  {after.pct > before.pct && <span className="rv-up"> +{after.pct - before.pct}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-section" aria-labelledby="rv-focus">
        <h2 id="rv-focus" className="mc-h2">
          Best and worst focus
        </h2>
        {r.best.length ? (
          <div className="rv-cols">
            <SessionList title="Best" list={r.best} />
            {r.worst.length > 0 && <SessionList title="Worst" list={r.worst} />}
          </div>
        ) : (
          <p className="mc-note">
            No phone-measured sessions of 15 minutes or more this week. Focus % needs phone tracking
            (Settings).
          </p>
        )}
      </section>
    </div>
  );
}

function SessionList({ title, list }: { title: string; list: Session[] }) {
  return (
    <div>
      <h3 className="h3">{title}</h3>
      <ul className="rv-sessions">
        {list.map((s) => (
          <li key={s.id} style={courseVars(s.course) as CSSProperties}>
            <b className="rv-pct">{Math.round(Number(s.focus_pct))}%</b>
            <span>
              <span className="rv-course">{s.course}</span> {duration(focusSeconds(s))}
              <span className="muted"> · {when(s)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiReview({ week, isThisWeek }: { week: string; isThisWeek: boolean }) {
  // Keyed by week by the parent, so a new week starts fresh.
  const [state, setState] = useState<'idle' | 'loading' | 'writing'>('loading');
  const [result, setResult] = useState<WeeklyResult | null>(null);
  // Fetch what's written for this week; the function writes one if none exists.
  useEffect(() => {
    let alive = true;
    weeklyReview(week)
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult(null))
      .finally(() => alive && setState('idle'));
    return () => {
      alive = false;
    };
  }, [week]);
  const again = async () => {
    setState('writing');
    try {
      setResult(await weeklyReview(week, true));
    } finally {
      setState('idle');
    }
  };
  return (
    <section className="card-section rv-ai" aria-labelledby="rv-ai-h">
      <h2 id="rv-ai-h" className="mc-h2">
        In three sentences
      </h2>
      {state === 'loading' && <p className="muted">Writing…</p>}
      {state !== 'loading' && result?.ok && result.text && <p className="rv-ai-text">{result.text}</p>}
      {state !== 'loading' && result && !result.ok && (
        <p className="field-hint">{result.message ?? "The review couldn't be written."}</p>
      )}
      {state !== 'loading' && result?.ok && (
        <p className="row">
          <button className="btn btn-link" onClick={again} disabled={state === 'writing'}>
            {state === 'writing'
              ? 'Writing…'
              : isThisWeek
                ? 'Write it again with this week so far'
                : 'Write it again'}
          </button>
        </p>
      )}
    </section>
  );
}

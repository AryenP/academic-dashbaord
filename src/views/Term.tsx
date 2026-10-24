import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Patterns } from '../components/Patterns';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { courseVars } from '../lib/courses';
import { useHistory } from '../lib/history';
import { dayName, utc } from '../lib/plan';
import { supabase } from '../lib/supabase';
import { term, type TermItem } from '../lib/term';
import { useNow, usePlan } from '../lib/usePlan';

// The term in the student's own numbers. When the last exam has passed, the runway points here:
// hours, the week that went best, each course and each exam's prep next to its plan, and what
// tended to go with the best sessions. Kept as long as the account is; printable like the runway.

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (day: string) => {
  const d = new Date(utc(day));
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export function Term() {
  const { user, ready } = useAuth();
  const { timezone } = usePlan();
  const history = useHistory();
  const now = useNow(60_000);
  const [items, setItems] = useState<TermItem[] | null>(null);

  // The runway keeps 45 days of the plan; a term needs its whole length, so this page reads its own.
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 200 * 864e5).toISOString();
      const [it, cs] = await Promise.all([
        supabase!
          .from('plan_items')
          .select('id, kind, title, start_at, end_at, score, max_score, course_id')
          .eq('accepted', true)
          .gte('start_at', since)
          .order('start_at')
          .limit(5000),
        supabase!.from('courses').select('id, code'),
      ]);
      const code = new Map((cs.data ?? []).map((c) => [c.id, c.code]));
      if (alive)
        setItems(
          (it.data ?? []).map((r) => ({
            id: r.id,
            kind: r.kind,
            title: r.title,
            start_at: r.start_at,
            end_at: r.end_at,
            score: r.score,
            max_score: r.max_score,
            course: r.course_id ? (code.get(r.course_id) ?? null) : null,
          })),
        );
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const t = useMemo(
    () => (items ? term(items, history.sessions, timezone, now) : null),
    [items, history.sessions, timezone, now],
  );

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your term" />;
  if (!items) return <div className="fx fx-loading" aria-busy="true" />;
  if (!t)
    return (
      <div className="page">
        <h1 className="page-h">Your term</h1>
        <p>Nothing on the runway or in the log yet. The term fills in as you go.</p>
      </div>
    );
  const maxCourse = Math.max(1, ...t.courses.map((c) => c.hours));
  return (
    <div className="page tm">
      <h1 className="page-h">{t.over ? 'Your term' : 'Your term so far'}</h1>
      <p className="mc-lede">
        {short(t.start)} to {short(t.end)}, {t.weeks} {t.weeks === 1 ? 'week' : 'weeks'}.
        {t.over ? ' Every exam on the runway is behind you.' : ''}
      </p>

      <section className="stat-tiles" aria-label="The term in numbers">
        <div className="tile">
          <span className="tile-label">Focused</span>
          <span className="tile-n">{t.hours} h</span>
          <span className="tile-note">
            in {t.sessions} {t.sessions === 1 ? 'session' : 'sessions'}, breaks and pauses left out.
          </span>
        </div>
        {t.focusPct != null && (
          <div className="tile">
            <span className="tile-label">Focus</span>
            <span className="tile-n">{t.focusPct}%</span>
            <span className="tile-note">across the sessions your phone measured, weighted by length.</span>
          </div>
        )}
        {t.bestWeek && (
          <div className="tile">
            <span className="tile-label">The week that went best</span>
            <span className="tile-n">{t.bestWeek.hours} h</span>
            <span className="tile-note">the week of {short(t.bestWeek.start)}.</span>
          </div>
        )}
      </section>

      {t.courses.length > 0 && (
        <section className="card-section" aria-labelledby="tm-c-h">
          <h2 id="tm-c-h" className="mc-h2">
            By course
          </h2>
          <ul className="tm-courses">
            {t.courses.map((c) => (
              <li key={c.course} style={courseVars(c.course) as CSSProperties}>
                <span className="tm-code">{c.course}</span>
                <span className="tm-bar" aria-hidden="true">
                  <i style={{ width: `${(c.hours / maxCourse) * 100}%` }} />
                </span>
                <span className="tm-h">{c.hours} h</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.exams.length > 0 && (
        <section className="card-section" aria-labelledby="tm-x-h">
          <h2 id="tm-x-h" className="mc-h2">
            Exams
          </h2>
          <ul className="tm-exams">
            {t.exams.map((x) => (
              <li key={x.id} style={courseVars(x.course) as CSSProperties}>
                <span className="tm-code">{x.course}</span>
                <span>
                  <b>{x.title}</b>, {dayName(x.day, new Date(now))}
                </span>
                <span className="tm-prep">
                  {x.studied} h studied{x.planned > 0 ? ` of ${x.planned} h planned` : ''}
                  {x.score ? `. Scored ${x.score}` : ''}.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Patterns />

      <p className="mc-note tm-foot">
        Yours as long as your account is. Print this page to keep it on paper, or download everything from{' '}
        <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}

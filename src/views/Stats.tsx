import { useMemo, type CSSProperties } from 'react';
import { FocusStats } from '../components/FocusStats';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { courseVars } from '../lib/courses';
import { useHistory } from '../lib/history';
import { WD, dayKey, planDays, utc } from '../lib/plan';
import { lastNDays, minutesByCourse, plannedVsActual, streak, weekStart } from '../lib/stats';
import { duration } from '../lib/timer';
import { useNow, usePlan } from '../lib/usePlan';

export function Stats() {
  const { user, ready } = useAuth();
  const h = useHistory();
  const { plan } = usePlan();
  const now = useNow();
  const today = dayKey(new Date(now));

  const todayBy = useMemo(() => minutesByCourse(h.totals, today, today), [h.totals, today]);
  const weekBy = useMemo(() => minutesByCourse(h.totals, weekStart(today), today), [h.totals, today]);
  // Planned vs actual over the plan window if we're in it, else the last 14 days.
  const days = useMemo(() => {
    const pd = planDays(plan);
    return pd.length && today >= pd[0] && today <= pd[pd.length - 1] ? pd : lastNDays(today, 14);
  }, [plan, today]);
  const pva = useMemo(() => plannedVsActual(plan, h.totals, days), [plan, h.totals, days]);
  const run = streak(h.sessions, today);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your stats" />;

  const sum = (xs: { minutes: number }[]) => xs.reduce((s, x) => s + x.minutes, 0);
  const maxMin = Math.max(60, ...pva.map((d) => Math.max(d.plannedMin, d.actualMin)));

  return (
    <div className="page">
      <h1 className="page-h">Stats</h1>

      <section className="stat-tiles" aria-label="Totals">
        <Tile label="Today" value={duration(sum(todayBy) * 60)} by={todayBy} />
        <Tile label="This week" value={duration(sum(weekBy) * 60)} by={weekBy} />
        <div className="tile">
          <span className="tile-label">Streak</span>
          <span className="tile-n">
            {run} {run === 1 ? 'day' : 'days'}
          </span>
          <span className="tile-note">Days in a row with at least one finished session.</span>
        </div>
      </section>

      <section className="card-section" aria-labelledby="pva-h">
        <h2 id="pva-h" className="mc-h2">
          Planned vs. actual
        </h2>
        <p className="mc-note">
          Light bars are study blocks on the calendar. Solid bars are time you logged, focus time only.
        </p>
        <div className="pva" role="list">
          {pva.map((d) => {
            const dt = new Date(utc(d.day));
            return (
              <div
                key={d.day}
                role="listitem"
                className={`pva-col${d.day === today ? ' is-today' : ''}`}
                aria-label={`${d.day}: ${duration(d.plannedMin * 60)} planned, ${duration(d.actualMin * 60)} logged`}
              >
                <div className="pva-bars" aria-hidden="true">
                  <i className="pva-plan" style={{ height: `${(d.plannedMin / maxMin) * 100}%` }} />
                  <i className="pva-act" style={{ height: `${(d.actualMin / maxMin) * 100}%` }} />
                </div>
                <span className="pva-wd">{WD[dt.getUTCDay()][0]}</span>
                <span className="pva-dn">{dt.getUTCDate()}</span>
              </div>
            );
          })}
        </div>
      </section>
      <FocusStats today={today} />
    </div>
  );
}

function Tile({
  label,
  value,
  by,
}: {
  label: string;
  value: string;
  by: { course: string; minutes: number }[];
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-n">{value}</span>
      {by.length ? (
        <ul className="tile-by">
          {by.map((c) => (
            <li key={c.course} style={{ ...courseVars(c.course) } as CSSProperties}>
              <i aria-hidden="true" />
              {c.course} <b>{duration(c.minutes * 60)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <span className="tile-note">Nothing logged yet.</span>
      )}
    </div>
  );
}

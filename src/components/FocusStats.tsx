import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { colorOf } from '../lib/courses';
import { focusSeconds, useHistory } from '../lib/history';
import { dayKey, iso, utc } from '../lib/plan';
import { bestHours, focusTrend, pickupsPerHour } from '../lib/stats';
import { FocusFormula } from './PhoneMeter';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM – 11 PM
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h: number) => (h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`);

/** Focus %, pickups and best hours: only for sessions measured by the phone. */
export function FocusStats({ today }: { today: string }) {
  const { sessions } = useHistory();
  const tracked = useMemo(() => sessions.filter((s) => s.focus_pct != null), [sessions]);
  const weekAgo = iso(utc(today) - 6 * 864e5);
  const trend = useMemo(() => focusTrend(sessions), [sessions]);
  const cells = useMemo(() => bestHours(sessions, HOURS), [sessions]);
  const pph = pickupsPerHour(sessions, weekAgo);

  if (!tracked.length)
    return (
      <section className="card-section" aria-labelledby="focus-h">
        <h2 id="focus-h" className="mc-h2">
          Focus
        </h2>
        <p className="mc-note">
          No sessions measured by your phone yet. <Link to="/settings">Set up phone tracking</Link> and your
          focus %, pickups and best hours show up here.
        </p>
      </section>
    );

  // Week average, weighted by focus time.
  const recent = tracked.filter((s) => dayKey(new Date(s.started_at)) >= weekAgo);
  const w = recent.reduce((a, s) => a + focusSeconds(s), 0);
  const avg = w
    ? Math.round(recent.reduce((a, s) => a + Number(s.focus_pct) * focusSeconds(s), 0) / w)
    : null;
  const best = cells.filter((c) => c.pct != null && c.minutes >= 30).sort((a, b) => b.pct! - a.pct!)[0];

  return (
    <section className="card-section" aria-labelledby="focus-h">
      <h2 id="focus-h" className="mc-h2">
        Focus
      </h2>
      <div className="stat-tiles">
        <div className="tile">
          <span className="tile-label">Focus, last 7 days</span>
          <span className="tile-n">{avg == null ? '—' : `${avg}%`}</span>
          <span className="tile-note">Average over measured sessions, weighted by length.</span>
        </div>
        <div className="tile">
          <span className="tile-label">Pickups per hour, last 7 days</span>
          <span className="tile-n">{pph ?? '—'}</span>
          <span className="tile-note">Times you opened a listed app, per focused hour.</span>
        </div>
        {best && (
          <div className="tile">
            <span className="tile-label">Your best hour</span>
            <span className="tile-n">
              {WEEK[best.weekday]} {hourLabel(best.hour)}
            </span>
            <span className="tile-note">{best.pct}% focus on average, with at least 30 min logged.</span>
          </div>
        )}
      </div>

      <h3 className="h3">Focus % by session</h3>
      <div className="trend" role="list" aria-label="Focus percent, most recent sessions">
        {trend.map((p) => (
          <div
            key={p.id}
            role="listitem"
            className="trend-col"
            aria-label={`${p.day} ${p.course}: ${Math.round(p.pct)}%`}
            title={`${p.day} · ${p.course} · ${Math.round(p.pct)}%`}
          >
            <i style={{ height: `${p.pct}%`, '--c': colorOf(p.course) } as CSSProperties} />
          </div>
        ))}
      </div>
      <div className="trend-axis" aria-hidden="true">
        <span>{trend[0]?.day.slice(5)}</span>
        <span>{trend[trend.length - 1]?.day.slice(5)}</span>
      </div>

      <h3 className="h3">Best hours</h3>
      <p className="mc-note">
        Average focus % by weekday and hour. A stronger shade is more focused; an outline is no data.
      </p>
      <div className="heat-wrap">
        <table className="heat">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th key={h} scope="col">
                  {h % 3 === 0 ? hourLabel(h) : <span className="sr-only">{hourLabel(h)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK.map((d, wd) => (
              <tr key={d}>
                <th scope="row">{d}</th>
                {HOURS.map((h) => {
                  const c = cells.find((x) => x.weekday === wd && x.hour === h)!;
                  // 50% focus and below is the lightest shade; 100% the darkest.
                  const a = c.pct == null ? 0 : 0.12 + 0.88 * Math.max(0, (c.pct - 50) / 50);
                  return (
                    <td
                      key={h}
                      style={{ '--a': a } as CSSProperties}
                      className={c.pct == null ? 'is-empty' : undefined}
                      aria-label={
                        c.pct == null ? `${d} ${hourLabel(h)}: no data` : `${d} ${hourLabel(h)}: ${c.pct}%`
                      }
                      title={c.pct == null ? undefined : `${c.pct}% over ${c.minutes} min`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="formula-details">
        <summary>How focus is measured</summary>
        <FocusFormula />
      </details>
    </section>
  );
}

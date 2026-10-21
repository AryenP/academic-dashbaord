import type { CSSProperties } from 'react';
import { courseVars } from '../lib/courses';
import { dayKey, dayName, isNow, isPast, timePart, type PlanItem } from '../lib/plan';
import { usePlan } from '../lib/usePlan';

export function Today({ plan, now, self }: { plan: PlanItem[]; now: number; self?: boolean }) {
  const { setStatus } = usePlan();
  const today = dayKey(new Date(now));
  let day = today;
  let items = plan.filter((r) => r.day === today);
  let note: string;
  // Once today is done (or empty), show the next day that has anything on it.
  if (!items.length || items.every((r) => isPast(r, now))) {
    note = items.length
      ? 'Today is done. Here is what comes next.'
      : 'Nothing planned today. Here is what comes next.';
    const nxt = plan.find((r) => r.day > today);
    if (nxt) {
      day = nxt.day;
      items = plan.filter((r) => r.day === day);
    } else items = [];
  } else {
    const left = items.filter((r) => !isPast(r, now)).length;
    note = `${left} of ${items.length} left today.`;
  }

  return (
    <div id="today" className="td">
      <h2 className="mc-h2">{dayName(day, new Date(now))}</h2>
      <p className="mc-note">{note}</p>
      <ul className="td-list">
        {!items.length && <li className="td-empty">The plan is finished.</li>}
        {items.map((r) => {
          const past = isPast(r, now);
          const live = isNow(r, now);
          return (
            <li
              key={r.id}
              className={`td-item k-${r.kind.toLowerCase()}${past ? ' is-past' : ''}${live ? ' is-now' : ''}${r.proposed ? ' is-proposed' : ''}${r.status === 'submitted' ? ' is-submitted' : ''}`}
              style={{ ...courseVars(r.course) } as CSSProperties}
            >
              <span className="td-time">{timePart(r)}</span>
              <div className="td-what">
                <span className="w1">{r.title}</span>
                <span className="w2">
                  {r.course} {r.kind.toLowerCase()}
                  {r.proposed && ', proposed'}
                  {r.status === 'submitted' && ', submitted'}
                  {live && (
                    <>
                      , <span className="td-state">happening now</span>
                    </>
                  )}
                </span>
              </div>
              {self && r.kind === 'Deadline' && !r.proposed && (
                <label className="td-tick">
                  <input
                    type="checkbox"
                    checked={r.status === 'submitted'}
                    onChange={(e) => setStatus(r.id, e.target.checked ? 'submitted' : 'open')}
                  />
                  <span>Submitted</span>
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

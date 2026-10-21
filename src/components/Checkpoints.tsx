import type { CSSProperties } from 'react';
import type { Readiness } from '../lib/actuals';
import { courseVars } from '../lib/courses';
import { daysUntil, isNow, isPast, prepBlocks, round1, type ExamPrep, type PlanItem } from '../lib/plan';

interface Props {
  exams: ExamPrep[];
  plan: PlanItem[];
  now: number;
  /** Actual prep vs planned, per exam id. Absent when nothing has been logged or there's no backend. */
  ready?: Map<string, Readiness>;
}

export function Checkpoints({ exams, plan, now, ready }: Props) {
  return (
    <div className="cp-list">
      {exams.map((x) => {
        const n = daysUntil(x.day, new Date(now));
        const blocks = prepBlocks(plan, x);
        const done = round1(blocks.filter((r) => isPast(r, now)).reduce((s, r) => s + r.hours, 0));
        const rd = ready?.get(x.id);
        return (
          <div key={x.id} className="cp" style={{ ...courseVars(x.course) } as CSSProperties}>
            <div className="cp-count">
              {isPast(x, now) ? (
                <span className="cp-n is-word">Done</span>
              ) : n <= 0 ? (
                <span className="cp-n is-word is-soon">{isNow(x, now) ? 'Now' : 'Today'}</span>
              ) : (
                <>
                  <span className={`cp-n${n <= 3 ? ' is-soon' : ''}`}>{n}</span>
                  <span className="cp-u">{n === 1 ? 'day left' : 'days left'}</span>
                </>
              )}
            </div>
            <div className="cp-main">
              <div className="cp-top">
                <span className="cp-course">{x.course}</span>
                <span className="cp-title">{x.title}</span>
              </div>
              <div className="cp-meta">
                {x.when}, {x.location}
              </div>
              <div className="cp-bar" aria-hidden="true">
                {blocks.map((r) => (
                  <i
                    key={r.id}
                    className={isPast(r, now) ? 'done' : undefined}
                    style={{ '--h': r.hours } as CSSProperties}
                  />
                ))}
              </div>
              <div className="cp-prog">
                <b>{done}</b> of <b>{x.prep_hours}</b> prep hours done. Worth{' '}
                <b>{x.weight == null ? '—' : x.weight}</b>% of the grade.
              </div>
              {rd && (
                <div className="cp-ready">
                  <span className="cp-ready-n">{rd.pct}%</span>
                  <span className="cp-ready-t">
                    ready · <b>{rd.actualHours}</b> h actually studied of <b>{rd.plannedHours}</b> planned
                  </span>
                  <span
                    className="cp-ready-bar"
                    role="meter"
                    aria-label={`${x.course} readiness`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, rd.pct)}
                  >
                    <i style={{ width: `${Math.min(100, rd.pct)}%` }} />
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { colorOf } from '../lib/courses';
import { isNow, isPast, type Kind, type PlanItem } from '../lib/plan';

const FILTERS: { kind: Kind | 'All'; label: string }[] = [
  { kind: 'All', label: 'All' },
  { kind: 'Study', label: 'Study' },
  { kind: 'Exam', label: 'Exams' },
  { kind: 'Deadline', label: 'Deadlines' },
];

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (k: string) => `${MO[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`;

export function Agenda({ plan, now }: { plan: PlanItem[]; now: number }) {
  const [filter, setFilter] = useState<Kind | 'All'>('All');
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const rows = plan.filter((r) => filter === 'All' || r.kind === filter);
  const range = plan.length ? `${shortDate(plan[0].day)} to ${shortDate(plan[plan.length - 1].end)}` : '';

  // On first draw, scroll the table to the first item that hasn't happened yet.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (scrolled.current || !wrap) return;
    const firstUp = wrap.querySelector<HTMLTableRowElement>('tbody tr:not(.is-past)');
    if (firstUp) {
      wrap.scrollTop = Math.max(0, firstUp.offsetTop - 40);
      scrolled.current = true;
    }
  }, [rows]);

  return (
    <section id="agenda">
      <div className="mc-agenda-head">
        <div>
          <h2 className="mc-h2">Everything, in order</h2>
          <p className="mc-note" style={{ margin: 0 }}>
            Every study block, deadline and exam from {range}.
          </p>
        </div>
        <div className="mc-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.kind} aria-pressed={filter === f.kind} onClick={() => setFilter(f.kind)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mc-tablewrap" ref={wrapRef}>
        <table className="mc-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Course</th>
              <th>What</th>
              <th>Type</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`k-${r.kind.toLowerCase()}${isPast(r, now) ? ' is-past' : ''}${isNow(r, now) ? ' is-now' : ''}`}
                style={{ '--c': colorOf(r.course) } as CSSProperties}
              >
                <td>{r.when}</td>
                <td>{r.course}</td>
                <td>{r.title}</td>
                <td>{r.kind}</td>
                <td>{r.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

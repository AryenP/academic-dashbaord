import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Actuals } from '../lib/actuals';
import { colorOf } from '../lib/courses';
import {
  H0,
  H1,
  WD,
  dayKey,
  isNow,
  isPast,
  planDays,
  segmentsOf,
  shortCourse,
  utc,
  type PlanItem,
  type Segment,
} from '../lib/plan';

// Pixels per hour on the runway. Matches --mc-px in runway.css.
const PX = 19;

// Position of the hovered block relative to the runway box; the tooltip places itself beside it.
type Tip = { r: PlanItem; left: number; right: number; top: number } | null;

const hours = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;

export function Runway({ plan, now, actuals }: { plan: PlanItem[]; now: number; actuals?: Actuals }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const [intro, setIntro] = useState(true);
  const [tip, setTip] = useState<Tip>(null);

  const days = useMemo(() => planDays(plan), [plan]);
  const segs = useMemo(() => {
    const m = new Map<string, (Segment & { r: PlanItem })[]>();
    plan.forEach((r) =>
      segmentsOf(r).forEach((s) => {
        const list = m.get(s.day) ?? [];
        list.push({ ...s, r });
        m.set(s.day, list);
      }),
    );
    return m;
  }, [plan]);

  useLayoutEffect(() => {
    const t = setTimeout(() => setIntro(false), 2600);
    return () => clearTimeout(t);
  }, []);

  // On first draw, scroll the runway so today is the first column in view.
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const col = todayRef.current;
    if (scrolled.current || !sc) return;
    if (col && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, col.offsetLeft - 48);
    scrolled.current = true;
  }, [days]);

  // Keep the tooltip inside the runway box once its size is known.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const t = tipRef.current;
    if (!tip || !box || !t) return;
    const tw = t.offsetWidth;
    let left = tip.right + 6;
    if (left + tw > box.clientWidth) left = tip.left - tw - 6;
    left = Math.max(0, left);
    const top = Math.max(0, Math.min(box.clientHeight - t.offsetHeight, tip.top));
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
  }, [tip]);

  const showTip = (node: HTMLElement, r: PlanItem) => {
    const box = boxRef.current;
    if (!box) return;
    const br = box.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    setTip({ r, left: nr.left - br.left, right: nr.right - br.left, top: nr.top - br.top });
  };

  if (!plan.length) {
    return (
      <div className="mc-runway" ref={boxRef}>
        <div className="mc-fail">No study blocks found on the calendar</div>
      </div>
    );
  }

  const today = dayKey(new Date(now));
  const d = new Date(now);
  const nowMin = d.getHours() * 60 + d.getMinutes();
  let i = 0;

  return (
    <div
      className={`mc-runway${intro ? ' is-intro' : ''}`}
      ref={boxRef}
      aria-label="Day-by-day plan from 8 AM to midnight"
    >
      <div className="rw-scroll" ref={scrollRef}>
        <div className="rw-grid" style={{ '--n': days.length } as CSSProperties}>
          <div className="rw-axis">
            {[10, 12, 14, 16, 18, 20, 22].map((h) => (
              <span key={h} style={{ top: `${((h * 60 - H0) / 60) * PX}px` }}>
                {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const dt = new Date(utc(day));
            const daySegs = segs.get(day) ?? [];
            const ex = daySegs.find((s) => s.r.kind === 'Exam');
            const spans = actuals?.spans.get(day) ?? [];
            const dayMin = actuals?.dayMinutes.get(day) ?? 0;
            const cls = [
              'rw-day',
              dt.getUTCDay() === 1 && 'is-mon',
              day === today && 'is-today',
              day < today && 'is-past',
              (spans.length > 0 || dayMin > 0) && 'has-actual',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={day} className={cls} ref={day === today ? todayRef : undefined}>
                <div className="rw-head">
                  <span className="rw-wd">{day === today ? 'Today' : WD[dt.getUTCDay()]}</span>
                  <span className="rw-dn">{dt.getUTCDate()}</span>
                  {ex && (
                    <span className="rw-flag">
                      {shortCourse(ex.r.course)} {ex.first ? 'exam' : 'due'}
                    </span>
                  )}
                </div>
                <div className="rw-body">
                  {daySegs.map((s) => {
                    const a = Math.max(H0, s.a);
                    const b = Math.min(H1, s.b);
                    if (b <= a) return null;
                    const r = s.r;
                    const past = isPast(r, now);
                    const h = ((b - a) / 60) * PX - 2;
                    const style = {
                      top: `${((a - H0) / 60) * PX + 1}px`,
                      height: `${Math.max(6, h)}px`,
                      '--c': colorOf(r.course),
                      '--i': i++,
                      ...(past ? { '--o': '.32' } : {}),
                    } as CSSProperties;
                    return (
                      <div
                        key={`${r.id}-${s.day}`}
                        className={`rw-block k-${r.kind.toLowerCase()}${past ? ' is-past' : ''}${isNow(r, now) ? ' is-now' : ''}`}
                        style={style}
                        tabIndex={0}
                        role="button"
                        aria-label={`${r.course} ${r.kind}: ${r.title}, ${r.when}`}
                        onPointerEnter={(e) => showTip(e.currentTarget, r)}
                        onPointerLeave={() => setTip(null)}
                        onFocus={(e) => showTip(e.currentTarget, r)}
                        onBlur={() => setTip(null)}
                      >
                        {h >= 15 && <b>{shortCourse(r.course)}</b>}
                        {h >= 44 && <span>{r.title}</span>}
                      </div>
                    );
                  })}
                  {spans.length > 0
                    ? spans.map((sp) => {
                        const a = Math.max(H0, sp.a);
                        const b = Math.min(H1, sp.b);
                        if (b <= a) return null;
                        return (
                          <div
                            key={sp.id}
                            className={`rw-actual${sp.live ? ' is-live' : ''}`}
                            style={
                              {
                                top: `${((a - H0) / 60) * PX}px`,
                                height: `${Math.max(3, ((b - a) / 60) * PX)}px`,
                                '--c': colorOf(sp.course),
                              } as CSSProperties
                            }
                            title={`Studied ${sp.course}`}
                          />
                        );
                      })
                    : dayMin > 0 && (
                        // Visitors only get daily totals, not times: a gauge filling up from the bottom.
                        <div
                          className="rw-actual is-total"
                          style={{ height: `${Math.min(16, dayMin / 60) * PX}px` }}
                          title={`${hours(dayMin)} studied`}
                        />
                      )}
                  {dayMin > 0 && <span className="sr-only">{hours(dayMin)} studied this day.</span>}
                  {day === today && nowMin >= H0 && nowMin <= H1 && (
                    <div className="rw-now" style={{ top: `${((nowMin - H0) / 60) * PX}px` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {tip && (
        <div className="mc-tip" ref={tipRef}>
          <div className="t1">
            {tip.r.course} {tip.r.kind.toLowerCase()}
          </div>
          <div className="t2">{tip.r.title}</div>
          <div>
            {tip.r.when} ({tip.r.hours} h)
          </div>
        </div>
      )}
    </div>
  );
}

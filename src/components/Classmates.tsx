import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CourseInfo } from '../lib/courses';
import { classmatesOf, name, requestFriend, type Classmate } from '../lib/social';
import { supabase } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { duration } from '../lib/timer';

// On a course card: the "show me to classmates" switch and, once on, who else in the course
// uses Runway, with whatever each of them chose to share.

export function Classmates({ course }: { course: CourseInfo & { visible?: boolean } }) {
  const plan = usePlan();
  const [list, setList] = useState<Classmate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  // Optimistic: the switch flips at once, the server confirms through the plan refresh.
  const [on, setOn] = useState(!!course.visible);
  const [seen, setSeen] = useState(!!course.visible);
  if (!!course.visible !== seen) {
    setSeen(!!course.visible);
    setOn(!!course.visible);
  }
  const visible = on;

  // Fetch on the server's word (course.visible), not the optimistic switch: the list is only
  // answered once the database knows this course is visible.
  const serverVisible = !!course.visible;
  useEffect(() => {
    if (!serverVisible) return;
    let alive = true;
    classmatesOf(course.code).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [serverVisible, course.code]);

  const toggle = async () => {
    if (!supabase) return;
    setBusy(true);
    setOn(!visible);
    await supabase.from('courses').update({ visible: !visible }).eq('id', course.id);
    await plan.refresh();
    setBusy(false);
  };

  const ask = async (handle: string) => {
    await requestFriend(handle);
    setAsked(new Set([...asked, handle]));
  };

  return (
    <div className="cm">
      <label className="check cm-switch">
        <input type="checkbox" checked={visible} disabled={busy} onChange={toggle} />
        <span>
          Show me to classmates in {course.code}
          <span className="field-hint">
            {' '}
            Classmates at your school who also turned this on see your name and, at your{' '}
            <Link to="/settings">sharing level</Link>, your hours, readiness and streak. Never notes, phone
            data or grades.
          </span>
        </span>
      </label>
      {visible && list && (
        <div className="cm-list" aria-live="polite">
          {list.length === 0 ? (
            <p className="field-hint">No classmates on Runway yet for {course.code}. Tell one.</p>
          ) : (
            <>
              <p className="cm-head">
                <b>{list.length}</b> {list.length === 1 ? 'classmate' : 'classmates'} on Runway
                {list.some((c) => c.studied_min != null) && ' · readiness for the next exam'}
              </p>
              <ul className="cm-rows">
                {list.map((c) => {
                  const pct =
                    c.studied_min != null && c.planned_min
                      ? Math.min(150, Math.round((c.studied_min / c.planned_min) * 100))
                      : null;
                  return (
                    <li key={c.handle} className="cm-row">
                      <span className="cm-name">
                        {name(c)} <span className="muted">@{c.handle}</span>
                      </span>
                      <span className="cm-stats">
                        {c.week_minutes != null && <span>{duration(c.week_minutes * 60)} this week</span>}
                        {c.streak != null && c.streak > 0 && <span>{c.streak}-day streak</span>}
                        {pct != null && (
                          <span className="cm-ready" aria-label={`${pct}% ready`}>
                            <i style={{ width: `${Math.min(100, pct)}%` }} /> {pct}%
                          </span>
                        )}
                        {c.share_level === 'off' && <span className="muted">shares nothing yet</span>}
                      </span>
                      {!c.is_friend && (
                        <button
                          className="btn btn-link"
                          disabled={asked.has(c.handle)}
                          onClick={() => ask(c.handle)}
                        >
                          {asked.has(c.handle) ? 'Asked' : 'Add friend'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

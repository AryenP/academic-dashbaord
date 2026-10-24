import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CourseInfo } from '../lib/courses';
import {
  classmatesOf,
  hourFrom,
  name,
  proposeStudy,
  requestFriend,
  sharedFreeTime,
  type Classmate,
  type FreeWindow,
} from '../lib/social';
import { whenLabel } from '../lib/planBuild';
import { localIso } from '../lib/tz';
import { supabase } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { duration } from '../lib/timer';

// On a course card: the "show me to classmates" switch and, once on, who else in the course
// uses Runway, with whatever each of them chose to share.

export function Classmates({
  course,
}: {
  course: CourseInfo & { visible?: boolean; study_together?: boolean };
}) {
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
  // The study-together flag changes what the list says ("Find a time"), so it refetches on that too.
  const serverVisible = !!course.visible;
  const serverTogether = !!course.study_together;
  useEffect(() => {
    if (!serverVisible) return;
    let alive = true;
    classmatesOf(course.code).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [serverVisible, serverTogether, course.code]);

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

  // The second opt-in: letting classmates who made the same choice find a time with you.
  const [together, setTogether] = useState(!!course.study_together);
  const [seenTogether, setSeenTogether] = useState(!!course.study_together);
  if (!!course.study_together !== seenTogether) {
    setSeenTogether(!!course.study_together);
    setTogether(!!course.study_together);
  }
  const toggleTogether = async () => {
    if (!supabase) return;
    setBusy(true);
    setTogether(!together);
    await supabase.from('courses').update({ study_together: !together }).eq('id', course.id);
    await plan.refresh();
    setBusy(false);
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
      {visible && (
        <label className="check cm-switch">
          <input type="checkbox" checked={together} disabled={busy} onChange={toggleTogether} />
          <span>
            Let classmates who also turn this on find a time with me
            <span className="field-hint">
              {' '}
              Runway compares both runways and shows only the hours you're both free. Nothing goes on either
              runway until the other person says yes.
            </span>
          </span>
        </label>
      )}
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
                      {c.study_together && <FindATime handle={c.handle} who={name(c)} code={course.code} />}
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

/** Both opted in: the hours you're both free this week, and a one-tap invitation for one of them. */
function FindATime({ handle, who, code }: { handle: string; who: string; code: string }) {
  const { timezone } = usePlan();
  const [windows, setWindows] = useState<FreeWindow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = (w: FreeWindow) => whenLabel(localIso(w.start_at, timezone), localIso(w.end_at, timezone));
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      setWindows(await sharedFreeTime(handle, code));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not look.');
    } finally {
      setBusy(false);
    }
  };
  const invite = async (w: FreeWindow) => {
    const h = hourFrom(w);
    setBusy(true);
    setError(null);
    try {
      await proposeStudy(handle, code, h.start_at, h.end_at);
      setSent(label(h));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it.');
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <p className="cm-time" role="status">
        Asked {who} for {sent}. It shows on their runway; nothing is on yours until they say yes.
      </p>
    );
  if (!windows)
    return (
      <button className="btn btn-link" disabled={busy} onClick={open}>
        {busy ? 'Looking…' : `Find a time with ${who}`}
      </button>
    );
  return (
    <div className="cm-time">
      {windows.length === 0 ? (
        <p className="field-hint">No hour this week when you're both free in your study windows.</p>
      ) : (
        <>
          <p className="field-hint">You're both free:</p>
          <ul className="cm-windows" aria-label={`Times you and ${who} are both free`}>
            {windows.map((w) => (
              <li key={w.start_at}>
                <span>{label(w)}</span>
                <button className="btn btn-small" disabled={busy} onClick={() => invite(w)}>
                  Ask for an hour
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Classmates } from '../components/Classmates';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { courseVars, SLOTS, type CourseInfo } from '../lib/courses';
import { effective, unsure, type Readable } from '../lib/reading';
import { readSyllabusFile, readWithAi, rebuildSource, type ReadResult } from '../lib/sources';
import { supabase } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { localIso, whenLabel } from '../lib/planBuild';

// Spoken names for the six color slots, in tokens.css order.
const COLOR_NAMES = ['Blue', 'Teal', 'Purple', 'Orange', 'Pink', 'Gray'];

// "Your courses": how Runway read the calendar, one card per course, every reading editable.
// Changes write an override on the event and rebuild the plan for that source. This is where
// trust gets built, and where the AI pass gets its corrections.

interface Ev extends Readable {
  id: string;
  source_id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  ai_reason: string | null;
  ai_confidence: number | null;
  source_label: string;
}

const KINDS: { id: string; label: string }[] = [
  { id: 'class', label: 'Class' },
  { id: 'exam', label: 'Exam' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'study', label: 'Study block' },
  { id: 'commitment', label: 'Work or other' },
  { id: 'personal', label: 'Not on the runway' },
];

const SELECT =
  'id, source_id, hash, title, start_at, end_at, all_day, location, kind, course_code, confidence, override, ai_hash, ai_kind, ai_course_code, ai_reason, ai_confidence, calendar_sources(label)';

export function Courses() {
  const { user, ready, profile } = useAuth();
  const plan = usePlan();
  const tz = profile?.timezone ?? plan.timezone;
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [reading, setReading] = useState<'idle' | 'running'>('idle');
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const pendingRebuild = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const fetchEvents = useCallback(async (): Promise<Ev[] | null> => {
    if (!supabase || !user) return null;
    const { data } = await supabase
      .from('events')
      .select(SELECT)
      .is('deleted_at', null)
      .gte('end_at', new Date(Date.now() - 7 * 864e5).toISOString())
      .order('start_at')
      .limit(1500);
    return (
      (data ?? []) as unknown as (Omit<Ev, 'source_label'> & {
        calendar_sources: { label: string } | null;
      })[]
    ).map((r) => ({
      ...r,
      override: r.override as Ev['override'],
      source_label: r.calendar_sources?.label ?? 'calendar',
    }));
  }, [user]);

  const load = useCallback(async () => {
    const rows = await fetchEvents();
    if (rows) setEvents(rows);
  }, [fetchEvents]);

  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    fetchEvents().then((rows) => alive && rows && setEvents(rows));
    return () => {
      alive = false;
    };
  }, [ready, user, fetchEvents]);

  const read = useCallback(
    async (all: boolean) => {
      setReading('running');
      setReadMsg(null);
      try {
        const r: ReadResult = await readWithAi(all);
        if (!r.ok) setReadMsg(r.message ?? "The reading didn't go through.");
        else if (r.skipped === 'no_key')
          setReadMsg("Runway's AI isn't set up on this server yet; the title rules did the reading.");
        else if (r.skipped === 'off')
          setReadMsg("Runway's AI is turned off right now; the title rules did the reading.");
        else if (r.skipped) setReadMsg("This month's AI budget is used up; the title rules did the reading.");
        else if (!r.read) setReadMsg('Nothing new to read.');
        else setReadMsg(`Read ${r.read} ${r.read === 1 ? 'event' : 'events'}.`);
        await Promise.all([load(), plan.refresh()]);
      } catch (e) {
        setReadMsg(e instanceof Error ? e.message : "The reading didn't go through.");
      } finally {
        setReading('idle');
      }
    },
    [load, plan],
  );

  // Straight from the connect screen: read once, automatically.
  const auto = params.get('read') === '1';
  useEffect(() => {
    if (!auto || !user) return;
    const t = setTimeout(() => {
      setParams({}, { replace: true });
      read(false);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [auto, user]);

  const setOverride = useCallback(
    async (ev: Ev, patch: { kind?: string; course_code?: string | null }) => {
      if (!supabase) return;
      const next = { ...(ev.override ?? {}), ...patch };
      setEvents((list) => list?.map((e) => (e.id === ev.id ? { ...e, override: next } : e)) ?? null);
      await supabase.from('events').update({ override: next }).eq('id', ev.id);
      // Rebuild that source's plan, a moment after the last change.
      const t = pendingRebuild.current.get(ev.source_id);
      if (t) clearTimeout(t);
      pendingRebuild.current.set(
        ev.source_id,
        setTimeout(async () => {
          pendingRebuild.current.delete(ev.source_id);
          try {
            await rebuildSource(ev.source_id);
          } finally {
            plan.refresh();
          }
        }, 800),
      );
    },
    [plan],
  );

  const groups = useMemo(() => {
    const byCourse = new Map<string, Ev[]>();
    const commitments: Ev[] = [];
    const personal: Ev[] = [];
    const noCourse: Ev[] = [];
    for (const e of events ?? []) {
      const eff = effective(e);
      if (eff.kind === 'personal') personal.push(e);
      else if (eff.kind === 'commitment') commitments.push(e);
      else if (!eff.course) noCourse.push(e);
      else byCourse.set(eff.course, [...(byCourse.get(eff.course) ?? []), e]);
    }
    // One card per course the person has (from a calendar, the extension or by hand), with that
    // course's calendar events attached; a course with no events still gets a card.
    const known = new Map(plan.courses.map((c) => [c.code, c]));
    const codes = new Set([...plan.courses.map((c) => c.code), ...byCourse.keys()]);
    const cards = [...codes]
      .map((code) => ({ code, course: known.get(code) ?? null, events: byCourse.get(code) ?? [] }))
      .sort((a, b) => b.events.length - a.events.length || a.code.localeCompare(b.code));
    return { cards, commitments, personal, noCourse };
  }, [events, plan.courses]);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your courses" />;

  const total = events?.length ?? 0;
  const count = (k: string) => (events ?? []).filter((e) => effective(e).kind === k).length;
  const unsureN = (events ?? []).filter((e) => unsure(e)).length;

  return (
    <div className="page courses">
      <header className="page-head">
        <h1 className="page-h">Your courses</h1>
        <p className="mc-note">
          How Runway read your calendar. Fix anything it got wrong here; the runway updates as you go.
        </p>
      </header>

      {events === null ? (
        <div className="fx fx-loading" aria-busy="true" />
      ) : total === 0 && plan.courses.length === 0 ? (
        <section className="empty-runway">
          <p>
            No calendar events yet. <Link to="/connect">Connect a calendar</Link> and they show up here.
          </p>
        </section>
      ) : (
        <>
          {total === 0 && (
            <p className="mc-note">
              No calendar events yet: these courses come from what you added by hand.{' '}
              <Link to="/connect">Connect a calendar</Link> to fill them in.
            </p>
          )}
          <div className="cs-summary" role="status" aria-live="polite">
            <span className="cs-chip">
              <b>{groups.cards.length}</b> {groups.cards.length === 1 ? 'course' : 'courses'}
            </span>
            <span className="cs-chip">
              <b>{count('exam')}</b> exams
            </span>
            <span className="cs-chip">
              <b>{count('deadline')}</b> deadlines
            </span>
            <span className="cs-chip">
              <b>{count('class')}</b> classes
            </span>
            <span className="cs-chip">
              <b>{count('study')}</b> study blocks
            </span>
            {unsureN > 0 && (
              <span className="cs-chip is-unsure">
                <b>{unsureN}</b> to check
              </span>
            )}
          </div>
          <div className="row cs-actions">
            <button className="btn btn-quiet" onClick={() => read(false)} disabled={reading === 'running'}>
              {reading === 'running'
                ? 'Reading…'
                : unsureN > 0
                  ? `Read the ${unsureN} unsure ones`
                  : 'Read again'}
            </button>
            <button className="btn btn-link" onClick={() => read(true)} disabled={reading === 'running'}>
              Read everything again
            </button>
            {readMsg && <span className="field-hint">{readMsg}</span>}
          </div>

          {groups.cards.map((c) => (
            <CourseCard
              key={c.code}
              code={c.code}
              course={c.course}
              events={c.events}
              tz={tz}
              courses={plan.courses}
              onChange={setOverride}
            />
          ))}
          {groups.noCourse.length > 0 && (
            <section className="cs-card" aria-labelledby="cs-nocourse">
              <h2 id="cs-nocourse" className="mc-h2">
                Which course?
              </h2>
              <p className="mc-note">These look like schoolwork, but Runway couldn't tell the course.</p>
              <ul className="cs-list">
                {groups.noCourse.map((e) => (
                  <Row key={e.id} e={e} tz={tz} courses={plan.courses} onChange={setOverride} />
                ))}
              </ul>
            </section>
          )}
          <section className="cs-card" aria-labelledby="cs-commit">
            <h2 id="cs-commit" className="mc-h2">
              Work, research and other commitments
            </h2>
            <p className="mc-note">Fixed time the planner works around. Drawn in gray.</p>
            {groups.commitments.length ? (
              <ul className="cs-list">
                {groups.commitments.map((e) => (
                  <Row key={e.id} e={e} tz={tz} courses={plan.courses} onChange={setOverride} />
                ))}
              </ul>
            ) : (
              <p className="field-hint">
                None found. Move one here from “Not on the runway” if Runway missed it.
              </p>
            )}
          </section>
          <details className="cs-card cs-fold">
            <summary>
              Not on the runway <span className="muted">· {groups.personal.length}</span>
            </summary>
            <p className="mc-note">
              Everything else in your calendar. Change one if it's actually schoolwork or work.
            </p>
            <ul className="cs-list">
              {groups.personal.map((e) => (
                <Row key={e.id} e={e} tz={tz} courses={plan.courses} onChange={setOverride} />
              ))}
            </ul>
          </details>
          <p className="cs-done">
            <Link to="/" className="btn btn-primary">
              Show my runway
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function CourseCard({
  code,
  course,
  events,
  tz,
  courses,
  onChange,
}: {
  code: string;
  course: CourseInfo | null;
  events: Ev[];
  tz: string;
  courses: CourseInfo[];
  onChange: (e: Ev, patch: { kind?: string; course_code?: string | null }) => void;
}) {
  const plan = usePlan();
  const [name, setName] = useState(course?.name ?? '');
  const [seenName, setSeenName] = useState(course?.name ?? '');
  if ((course?.name ?? '') !== seenName) {
    // The course was renamed elsewhere (or just loaded): take the new name.
    setSeenName(course?.name ?? '');
    setName(course?.name ?? '');
  }
  const [confirmNot, setConfirmNot] = useState(false);
  const kinds = (k: string) => events.filter((e) => effective(e).kind === k);
  const classes = kinds('class');
  const save = async (patch: { name?: string | null; color?: number }) => {
    if (!course || !supabase) return;
    await supabase.from('courses').update(patch).eq('id', course.id);
    await plan.refresh();
  };
  const notACourse = async () => {
    for (const e of events) await onChange(e, { kind: 'personal' });
    // The course itself goes too; its plan items cascade. Events keep their 'personal' override.
    if (course && supabase) await supabase.from('courses').delete().eq('id', course.id);
    await plan.refresh();
    setConfirmNot(false);
  };
  return (
    <section className="cs-card" style={courseVars(code) as CSSProperties} aria-label={code}>
      <header className="cs-head">
        <span className="cs-code">{code}</span>
        {course ? (
          <input
            className="cs-name"
            type="text"
            placeholder="Course name (optional)"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== (course.name ?? '') && save({ name: name.trim() || null })}
            aria-label={`${code} name`}
          />
        ) : null}
        {course && (
          <div className="cs-colors" role="radiogroup" aria-label={`${code} color`}>
            {Array.from({ length: SLOTS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={course.color === n}
                aria-label={`${COLOR_NAMES[n - 1]}, color ${n}`}
                className="cs-swatch"
                style={{ background: `var(--course-${n})` }}
                onClick={() => save({ color: n })}
              />
            ))}
          </div>
        )}
        {!confirmNot ? (
          <button className="btn btn-link" onClick={() => setConfirmNot(true)}>
            Not a course
          </button>
        ) : (
          <span className="row">
            <button className="btn btn-danger btn-small" onClick={notACourse}>
              Take {events.length} off the runway
            </button>
            <button className="btn btn-quiet btn-small" onClick={() => setConfirmNot(false)}>
              Keep
            </button>
          </span>
        )}
      </header>
      {(['exam', 'deadline', 'study'] as const).map((k) =>
        kinds(k).length ? (
          <div key={k} className="cs-group">
            <h3 className="cs-h3">
              {k === 'exam' ? 'Exams' : k === 'deadline' ? 'Deadlines' : 'Study blocks'}
            </h3>
            <ul className="cs-list">
              {kinds(k).map((e) => (
                <Row key={e.id} e={e} tz={tz} courses={courses} onChange={onChange} />
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {course && <SyllabusUpload code={code} />}
      {course && <Classmates course={course} />}
      {classes.length > 0 && (
        <details className="cs-group cs-fold-inline">
          <summary>
            {classes.length} class {classes.length === 1 ? 'meeting' : 'meetings'}
            <span className="muted"> · {describePattern(classes, tz)}</span>
          </summary>
          <ul className="cs-list">
            {classes.map((e) => (
              <Row key={e.id} e={e} tz={tz} courses={courses} onChange={onChange} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue, Thu 2 PM" for a set of class meetings. */
function describePattern(evs: Ev[], tz: string): string {
  const days = new Set<number>();
  const times = new Set<string>();
  for (const e of evs) {
    const l = localIso(e.start_at, tz);
    const [y, m, d] = l.slice(0, 10).split('-').map(Number);
    days.add(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    const h = Number(l.slice(11, 13));
    const mi = l.slice(14, 16);
    times.add(`${h % 12 || 12}${mi === '00' ? '' : ':' + mi} ${h >= 12 ? 'PM' : 'AM'}`);
  }
  const ds = [...days]
    .sort()
    .map((d) => WD[d])
    .join(', ');
  const ts = [...times];
  return ts.length === 1 ? `${ds} ${ts[0]}` : ds;
}

function Row({
  e,
  tz,
  courses,
  onChange,
}: {
  e: Ev;
  tz: string;
  courses: CourseInfo[];
  onChange: (e: Ev, patch: { kind?: string; course_code?: string | null }) => void;
}) {
  const eff = effective(e);
  const flag = unsure(e);
  const when = e.all_day
    ? localIso(e.start_at, tz).slice(0, 10)
    : whenLabel(localIso(e.start_at, tz), localIso(e.end_at, tz));
  const options =
    eff.course && !courses.some((c) => c.code === eff.course)
      ? [...courses.map((c) => c.code), eff.course]
      : courses.map((c) => c.code);
  return (
    <li className={`cs-row${flag ? ' is-unsure' : ''}`}>
      <div className="cs-row-main">
        <span className="cs-title">{e.title}</span>
        <span className="cs-when">
          {when}
          {e.location && ` · ${e.location}`}
          <span className="muted"> · {e.source_label}</span>
        </span>
        {flag && <span className="cs-flag">Is this right?</span>}
        {eff.by === 'ai' && e.ai_reason && <span className="cs-reason">AI: {e.ai_reason}</span>}
      </div>
      <div className="cs-row-edit">
        <label>
          <span className="sr-only">Kind of {e.title}</span>
          <select value={eff.kind} onChange={(ev) => onChange(e, { kind: ev.target.value })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {eff.kind !== 'personal' && eff.kind !== 'commitment' && (
          <label>
            <span className="sr-only">Course of {e.title}</span>
            <select
              value={eff.course ?? ''}
              onChange={(ev) => onChange(e, { course_code: ev.target.value || null })}
            >
              <option value="">No course</option>
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </li>
  );
}

function SyllabusUpload({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMsg('That PDF is larger than 10 MB.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await readSyllabusFile(file, code);
      if (!r.ok) setMsg(r.message ?? "Runway couldn't read that syllabus.");
      else if (!r.proposed)
        setMsg(
          r.undated
            ? `Found ${r.undated} dated-later items but no dates to put on the runway yet.`
            : 'No exams or dated deadlines found in that syllabus.',
        );
      else
        setMsg(
          `Proposed ${r.proposed} ${r.proposed === 1 ? 'item' : 'items'} from the syllabus${r.undated ? ` (${r.undated} without a date)` : ''}. They're waiting on your runway, each with the page it came from.`,
        );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Runway couldn't read that syllabus.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cs-syllabus">
      <label className="btn btn-quiet btn-small cs-syllabus-btn">
        {busy ? 'Reading the syllabus…' : 'Upload the syllabus (PDF)'}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      <span className="field-hint">
        Runway reads exam dates, weights and dated deadlines, and proposes them with the page they came from.
      </span>
      {msg && (
        <p className="field-hint" role="status">
          {msg} {msg.startsWith('Proposed') && <Link to="/">See the runway.</Link>}
        </p>
      )}
    </div>
  );
}

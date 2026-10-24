import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddItem } from '../components/AddItem';
import { PlanBar } from '../components/PlanBar';
import { StudyInvites } from '../components/StudyInvites';
import { Agenda } from '../components/Agenda';
import { Checkpoints } from '../components/Checkpoints';
import { Runway } from '../components/Runway';
import { Today } from '../components/Today';
import { Landing } from '../landing/Landing';
import { buildActuals, readiness } from '../lib/actuals';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/courses';
import { useHistory, type DayCourseMinutes } from '../lib/history';
import { useLiveSession } from '../lib/liveSession';
import { type ExamPrep, type PlanData } from '../lib/plan';
import { headline, plain } from '../lib/headline';
import { narrate } from '../lib/narrate';
import { pace, paceWords } from '../lib/pace';
import { clearPending, loadPending, PENDING_ERROR_KEY } from '../lib/pending';
import { silence, staleness } from '../lib/stale';
import { forecast, overfull } from '../lib/weather';
import type { Session } from '../lib/supabase';
import { ago, useSources } from '../lib/sources';
import { useNow, usePlan } from '../lib/usePlan';

function Lede({ plan, exams, now }: { plan: PlanData['plan']; exams: ExamPrep[]; now: number }) {
  const parts = useMemo(() => headline(plan, exams, now), [plan, exams, now]);
  const over = plain(parts).startsWith('The term is over');
  return (
    <p className="mc-lede">
      {parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}
      {over && (
        <>
          {' '}
          <Link to="/term">See your term in numbers.</Link>
        </>
      )}
    </p>
  );
}

function Key({ courses, actual }: { courses: PlanData['courses']; actual: boolean }) {
  return (
    <div className="mc-key">
      {courses.map((c) => (
        <span key={c.id}>
          <i style={{ background: colorOf(c.code) }} />
          {c.code}
        </span>
      ))}
      <span>
        <i style={{ border: '1.5px dashed var(--color-fg-muted)' }} />
        Deadline
      </span>
      <span>
        <i
          style={{
            background: 'repeating-linear-gradient(135deg, var(--color-critical) 0 3px, transparent 3px 5px)',
          }}
        />
        Exam
      </span>
      {actual && (
        <span>
          <i className="k-actual" />
          Studied
        </span>
      )}
    </div>
  );
}

export interface RunwayPageProps {
  data: PlanData;
  sessions: Session[];
  totals: DayCourseMinutes[];
  live: Session | null;
  /** Prep minutes per `${course}|${exam start}` for a shared page; readiness is shown when set. */
  prep?: Map<string, number>;
  /** Readiness shows for the person themself even at 0 %. */
  self?: boolean;
  title: string;
  foot?: ReactNode;
  empty?: ReactNode;
  /** One line under the headline, for something that just happened. */
  notice?: ReactNode;
}

/** The runway view: shared by the signed-in home and the share page. */
export function RunwayPage({
  data,
  sessions,
  totals,
  live,
  prep,
  self,
  title,
  foot,
  empty,
  notice,
}: RunwayPageProps) {
  const now = useNow();
  const t = data.totals[0];
  const { settings } = useAuth();
  const planning = settings.planning;
  const shape = useMemo(() => forecast(data.plan, now, planning), [data.plan, now, planning]);
  const dayNotes = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of overfull(data.plan, now, planning))
      m.set(o.day, `Overfull: ${o.planned} h of study in ${o.free} free.`);
    return m;
  }, [data.plan, now, planning]);
  // The honest readiness, for the person themself: where the last week's pace lands by exam day.
  const paces = useMemo(() => {
    if (!self) return undefined;
    const m = new Map<string, string>();
    for (const x of data.exam_prep) {
      const p = pace(x, data.plan, sessions, now);
      if (p) m.set(x.id, paceWords(p, x, now));
    }
    return m;
  }, [self, data.exam_prep, data.plan, sessions, now]);
  const actuals = useMemo(() => buildActuals(sessions, totals, live, now), [sessions, totals, live, now]);
  const ready = useMemo(
    () =>
      self || prep?.size
        ? new Map(
            data.exam_prep.map((x) => [
              x.id,
              readiness(x, sessions, totals, prep?.get(`${x.course}|${x.start}`)),
            ]),
          )
        : undefined,
    [self, prep, sessions, totals, data.exam_prep],
  );
  return (
    <>
      <div className="mc">
        <header className="mc-head" id="overview">
          <h1 className="mc-title">{title}</h1>
          <Lede plan={data.plan} exams={data.exam_prep} now={now} />
          {t && data.plan.length > 0 && (
            <p className="mc-sub">
              <b>{t.study_hours}</b> study hours across <b>{t.study_blocks}</b> blocks, with{' '}
              <b>{t.deadlines}</b> deadlines to clear around <b>{t.exams}</b>{' '}
              {t.exams === 1 ? 'exam' : 'exams'}.{shape && <span className="mc-forecast"> {shape}</span>}
            </p>
          )}
          {notice}
        </header>

        {data.plan.length === 0 && empty ? (
          empty
        ) : (
          <>
            {self && <PlanBar />}
            {self && <StudyInvites />}
            <section className="mc-runway-wrap" id="runway">
              <Runway plan={data.plan} now={now} actuals={actuals} />
              <Key courses={data.courses} actual={actuals.spans.size > 0 || actuals.dayMinutes.size > 0} />
              <WeekInWords plan={data.plan} now={now} notes={dayNotes} />
            </section>

            <section className="mc-panels">
              <div id="checkpoints">
                <h2 className="mc-h2">Exam checkpoints</h2>
                <p className="mc-note">
                  Each bar is that course's study blocks. A segment fills in once its time has passed.
                </p>
                <Checkpoints exams={data.exam_prep} plan={data.plan} now={now} ready={ready} pace={paces} />
              </div>
              <Today plan={data.plan} now={now} self={self} />
            </section>

            <Agenda plan={data.plan} now={now} self={self} />
          </>
        )}
      </div>
      {foot && <p className="mc-foot">{foot}</p>}
    </>
  );
}

/** The same week as sentences, for screen readers and for anyone who would rather read. */
function WeekInWords({
  plan,
  now,
  notes,
}: {
  plan: PlanData['plan'];
  now: number;
  notes?: Map<string, string>;
}) {
  const days = useMemo(() => narrate(plan, now, 7, notes), [plan, now, notes]);
  // On paper the words are open: the strip is too wide to read at page width.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const before = () => setOpen(true);
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);
  return (
    <details className="mc-words" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>The week in words</summary>
      <dl>
        {days.map((d) => (
          <div key={d.day}>
            <dt>{d.heading}</dt>
            <dd>{d.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function EmptyRunway({ hasSources }: { hasSources: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="empty-runway" aria-labelledby="empty-h">
      <h2 id="empty-h" className="mc-h2">
        Nothing on your runway yet
      </h2>
      {hasSources ? (
        <p>
          Your calendar is connected but nothing in it reads as a class, exam, deadline or study block. Check
          it in <Link to="/settings">Settings</Link>, or add things by hand.
        </p>
      ) : (
        <p>Connect your calendar and the runway draws itself: classes, exams, deadlines, study blocks.</p>
      )}
      <div className="row">
        {!hasSources && (
          <Link to="/connect" className="btn btn-primary">
            Connect a calendar
          </Link>
        )}
        {!adding && (
          <button className="btn btn-quiet" onClick={() => setAdding(true)}>
            Add by hand
          </button>
        )}
      </div>
      {adding && <AddItem onDone={() => setAdding(false)} />}
    </section>
  );
}

function SourcesFoot() {
  const { sources, sync } = useSources();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  if (!sources?.length) return <AddItemFoot />;
  const bad = sources.find((s) => s.status === 'error');
  const st = staleness(sources, now);
  const syncNow = async () => {
    setBusy(true);
    try {
      for (const s of st.scheduled) await sync(s.id);
    } catch {
      // Settings → Calendars shows what went wrong on the source itself.
    } finally {
      setBusy(false);
    }
  };
  if (st.stale)
    return (
      <span className="mc-foot-warn" role="status">
        Your calendars haven't been read {st.latest ? `for ${silence(st.latest, now)}` : 'yet'}; the sync that
        runs every 15 minutes may have stopped.{' '}
        <button className="btn btn-link" onClick={syncNow} disabled={busy}>
          {busy ? 'Reading…' : 'Read them now'}
        </button>{' '}
        · <Link to="/settings">Calendars</Link>
      </span>
    );
  return (
    <>
      {bad
        ? `${bad.label} couldn't sync. `
        : st.latest
          ? `Synced from ${sources.map((s) => s.label).join(' and ')} ${ago(st.latest, now)}. Updates about every 15 minutes. `
          : `${sources.map((s) => s.label).join(' and ')} connected. `}
      <Link to="/settings">Calendars</Link> · <AddItemFoot />
    </>
  );
}

// Started once per page load, so React's development double-run can't add the calendar twice.
let joinStarted = false;

export function Home() {
  const { user, ready, profile, updateProfile } = useAuth();
  const data = usePlan();
  const history = useHistory();
  const live = useLiveSession();
  const { sources, loading: sourcesLoading, add } = useSources();
  const navigate = useNavigate();

  // A calendar tried on #/try before the account existed: add it the way Connect would, once,
  // then show the runway it makes. On failure, Connect takes over with the reason.
  const [pendingAtStart] = useState(() => loadPending());
  const [join, setJoin] = useState<'waiting' | 'busy' | 'done' | 'failed' | 'none'>(
    pendingAtStart ? 'waiting' : 'none',
  );
  const [joinNote, setJoinNote] = useState<string | null>(null);
  useEffect(() => {
    if (join !== 'waiting' || !user || !profile || !pendingAtStart || joinStarted) return;
    joinStarted = true;
    const run = async () => {
      setJoin('busy');
      try {
        const { result } = await add(pendingAtStart.kind, pendingAtStart.label, pendingAtStart.url);
        clearPending();
        await updateProfile({
          onboarding: { ...(profile.onboarding as object), connect_seen: true },
        }).catch(() => {});
        setJoinNote(
          result.ok
            ? null
            : `${result.error ?? 'The first read did not finish.'} The calendar is saved; Runway reads it again every 15 minutes.`,
        );
        setJoin('done');
      } catch (e) {
        clearPending();
        try {
          sessionStorage.setItem(
            PENDING_ERROR_KEY,
            e instanceof Error ? e.message : 'Runway could not add the calendar you tried.',
          );
        } catch {
          // no storage: Connect opens without the reason
        }
        setJoin('failed');
      }
    };
    void run();
  }, [join, user, profile, pendingAtStart, add, updateProfile]);

  // A brand-new account goes straight to the connect screen, once.
  const seen = !!(profile?.onboarding as { connect_seen?: boolean } | null)?.connect_seen;
  const joining = join === 'waiting' || join === 'busy';
  const sendToConnect =
    !!user &&
    !!profile &&
    !joining &&
    !data.loading &&
    !sourcesLoading &&
    data.plan.length === 0 &&
    !sources?.length &&
    (!seen || join === 'failed');
  useEffect(() => {
    if (sendToConnect) navigate('/connect', { replace: true });
  }, [sendToConnect, navigate]);

  if (!ready) return <div className="fx fx-loading" aria-busy="true" />;
  if (!user) return <Landing />;
  if (joining)
    return (
      <div className="fx fx-loading" aria-busy="true">
        <p className="fx-sub" role="status">
          Reading your calendar into your account…
        </p>
      </div>
    );
  if (data.loading || sendToConnect) return <div className="fx fx-loading" aria-busy="true" />;
  return (
    <RunwayPage
      data={data}
      sessions={history.sessions}
      totals={history.totals}
      live={live.session}
      self
      title="Your runway"
      notice={
        join === 'done' ? (
          <p className="mc-joined" role="status">
            Your calendar is connected; this runway is yours now.{' '}
            <Link to="/courses?read=1">Check how Runway read your courses</Link> before anything is planned.
            {joinNote && <span className="form-error"> {joinNote}</span>}
          </p>
        ) : undefined
      }
      empty={<EmptyRunway hasSources={!!sources?.length} />}
      foot={data.plan.length > 0 ? <SourcesFoot /> : undefined}
    />
  );
}

function AddItemFoot() {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="btn btn-link" onClick={() => setOpen(true)}>
        Add to the runway by hand
      </button>
    );
  return <AddItem onDone={() => setOpen(false)} />;
}

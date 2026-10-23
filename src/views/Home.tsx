import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddItem } from '../components/AddItem';
import { PlanBar } from '../components/PlanBar';
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
import { daysUntil, isNow, isPast, type ExamPrep, type PlanData } from '../lib/plan';
import { narrate } from '../lib/narrate';
import { pace, paceWords } from '../lib/pace';
import { forecast } from '../lib/weather';
import type { Session } from '../lib/supabase';
import { ago, useSources } from '../lib/sources';
import { useNow, usePlan } from '../lib/usePlan';

function Lede({ exams, now }: { exams: ExamPrep[]; now: number }) {
  const next = exams.find((x) => !isPast(x, now));
  if (!next)
    return (
      <p className="mc-lede">
        {exams.length ? 'Every exam on the runway is behind you.' : 'No exams on the runway yet.'}
      </p>
    );
  const n = daysUntil(next.day, new Date(now));
  const lead = isNow(next, now)
    ? 'Happening now: '
    : n <= 0
      ? 'Today: '
      : n === 1
        ? 'Tomorrow: '
        : `${n} days until `;
  return (
    <p className="mc-lede">
      {lead}
      <b>{next.course}</b> <b>{next.title}</b>, <span>{next.when}</span>. You have <b>{next.prep_hours}</b>{' '}
      hours of prep on the calendar for it.
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
}: RunwayPageProps) {
  const now = useNow();
  const t = data.totals[0];
  const shape = useMemo(() => forecast(data.plan, now), [data.plan, now]);
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
          <Lede exams={data.exam_prep} now={now} />
          {t && data.plan.length > 0 && (
            <p className="mc-sub">
              <b>{t.study_hours}</b> study hours across <b>{t.study_blocks}</b> blocks, with{' '}
              <b>{t.deadlines}</b> deadlines to clear around <b>{t.exams}</b>{' '}
              {t.exams === 1 ? 'exam' : 'exams'}.{shape && <span className="mc-forecast"> {shape}</span>}
            </p>
          )}
        </header>

        {data.plan.length === 0 && empty ? (
          empty
        ) : (
          <>
            {self && <PlanBar />}
            <section className="mc-runway-wrap" id="runway">
              <Runway plan={data.plan} now={now} actuals={actuals} />
              <Key courses={data.courses} actual={actuals.spans.size > 0 || actuals.dayMinutes.size > 0} />
              <WeekInWords plan={data.plan} now={now} />
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
function WeekInWords({ plan, now }: { plan: PlanData['plan']; now: number }) {
  const days = useMemo(() => narrate(plan, now), [plan, now]);
  return (
    <details className="mc-words">
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
  const { sources } = useSources();
  const now = useNow(30_000);
  if (!sources?.length) return <AddItemFoot />;
  const bad = sources.find((s) => s.status === 'error');
  const synced = sources.filter((s) => s.kind !== 'ics_upload' && s.last_synced_at);
  const latest =
    synced
      .map((s) => s.last_synced_at!)
      .sort()
      .at(-1) ?? null;
  return (
    <>
      {bad
        ? `${bad.label} couldn't sync. `
        : latest
          ? `Synced from ${sources.map((s) => s.label).join(' and ')} ${ago(latest, now)}. Updates about every 15 minutes. `
          : `${sources.map((s) => s.label).join(' and ')} connected. `}
      <Link to="/settings">Calendars</Link> · <AddItemFoot />
    </>
  );
}

export function Home() {
  const { user, ready, profile } = useAuth();
  const data = usePlan();
  const history = useHistory();
  const live = useLiveSession();
  const { sources, loading: sourcesLoading } = useSources();
  const navigate = useNavigate();

  // A brand-new account goes straight to the connect screen, once.
  const seen = !!(profile?.onboarding as { connect_seen?: boolean } | null)?.connect_seen;
  const sendToConnect =
    !!user &&
    !!profile &&
    !data.loading &&
    !sourcesLoading &&
    data.plan.length === 0 &&
    !sources?.length &&
    !seen;
  useEffect(() => {
    if (sendToConnect) navigate('/connect', { replace: true });
  }, [sendToConnect, navigate]);

  if (!ready) return <div className="fx fx-loading" aria-busy="true" />;
  if (!user) return <Landing />;
  if (data.loading || sendToConnect) return <div className="fx fx-loading" aria-busy="true" />;
  return (
    <RunwayPage
      data={data}
      sessions={history.sessions}
      totals={history.totals}
      live={live.session}
      self
      title="Your runway"
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

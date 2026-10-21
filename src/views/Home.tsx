import { useMemo, useState, type ReactNode } from 'react';
import { AddItem } from '../components/AddItem';
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
import type { Session } from '../lib/supabase';
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
              {t.exams === 1 ? 'exam' : 'exams'}.
            </p>
          )}
        </header>

        {data.plan.length === 0 && empty ? (
          empty
        ) : (
          <>
            <section className="mc-runway-wrap" id="runway">
              <Runway plan={data.plan} now={now} actuals={actuals} />
              <Key courses={data.courses} actual={actuals.spans.size > 0 || actuals.dayMinutes.size > 0} />
            </section>

            <section className="mc-panels">
              <div id="checkpoints">
                <h2 className="mc-h2">Exam checkpoints</h2>
                <p className="mc-note">
                  Each bar is that course's study blocks. A segment fills in once its time has passed.
                </p>
                <Checkpoints exams={data.exam_prep} plan={data.plan} now={now} ready={ready} />
              </div>
              <Today plan={data.plan} now={now} />
            </section>

            <Agenda plan={data.plan} now={now} />
          </>
        )}
      </div>
      {foot && <p className="mc-foot">{foot}</p>}
    </>
  );
}

function EmptyRunway() {
  const [adding, setAdding] = useState(true);
  return (
    <section className="empty-runway" aria-labelledby="empty-h">
      <h2 id="empty-h" className="mc-h2">
        Nothing on your runway yet
      </h2>
      <p>
        Add your next exam and a study block or two, and the runway draws itself. Connecting a calendar so
        this happens on its own is the next thing coming to Runway.
      </p>
      {adding ? <AddItem onDone={() => setAdding(true)} /> : null}
    </section>
  );
}

export function Home() {
  const { user, ready } = useAuth();
  const data = usePlan();
  const history = useHistory();
  const live = useLiveSession();
  if (!ready) return <div className="fx fx-loading" aria-busy="true" />;
  if (!user) return <Landing />;
  if (data.loading) return <div className="fx fx-loading" aria-busy="true" />;
  return (
    <RunwayPage
      data={data}
      sessions={history.sessions}
      totals={history.totals}
      live={live.session}
      self
      title="Your runway"
      empty={<EmptyRunway />}
      foot={data.plan.length > 0 ? <AddItemFoot /> : undefined}
    />
  );
}

function AddItemFoot() {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="btn btn-quiet" onClick={() => setOpen(true)}>
        Add to the runway
      </button>
    );
  return <AddItem onDone={() => setOpen(false)} />;
}

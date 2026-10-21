import { Agenda } from '../components/Agenda';
import { Checkpoints } from '../components/Checkpoints';
import { Runway } from '../components/Runway';
import { Today } from '../components/Today';
import { buildActuals, readiness } from '../lib/actuals';
import { useAuth } from '../lib/auth';
import { useHistory, usePublicPrep } from '../lib/history';
import { useLiveSession } from '../lib/liveSession';
import { COURSES, colorOf } from '../lib/courses';
import { useMemo } from 'react';
import { daysUntil, isNow, isPast, type ExamPrep } from '../lib/plan';
import { useNow, usePlan } from '../lib/usePlan';

function Lede({ exams, now }: { exams: ExamPrep[]; now: number }) {
  const next = exams.find((x) => !isPast(x, now));
  if (!next) return <p className="mc-lede">All three midterms are behind you.</p>;
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

function Key({ actual }: { actual: boolean }) {
  return (
    <div className="mc-key">
      {COURSES.map((c) => (
        <span key={c}>
          <i style={{ background: colorOf(c) }} />
          {c}
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

function syncedAgo(updated: string, now: number) {
  const d = new Date(updated);
  const m = Math.round((now - d.getTime()) / 60000);
  const ago =
    m < 1
      ? 'just now'
      : m < 60
        ? `${m} min ago`
        : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Synced from Google Calendar ${ago}. Updates about every 15 minutes.`;
}

export function Home() {
  const data = usePlan();
  const now = useNow();
  const t = data.totals[0];
  const { user } = useAuth();
  const history = useHistory();
  const live = useLiveSession();
  const actuals = useMemo(
    () => buildActuals(history.sessions, history.totals, live.session, now),
    [history.sessions, history.totals, live.session, now],
  );
  const prep = usePublicPrep(data.exam_prep, !user);
  // Readiness shows for the owner (even at 0%) and for visitors when the owner shares it.
  const ready = useMemo(
    () =>
      user || prep.size
        ? new Map(
            data.exam_prep.map((x) => [
              x.id,
              readiness(x, history.sessions, history.totals, prep.get(`${x.course}|${x.start}`)),
            ]),
          )
        : undefined,
    [user, prep, history.sessions, history.totals, data.exam_prep],
  );
  return (
    <>
      <div className="mc">
        <header className="mc-head" id="overview">
          <h1 className="mc-title">Midterm runway</h1>
          <Lede exams={data.exam_prep} now={now} />
          {t && (
            <p className="mc-sub">
              <b>{t.study_hours}</b> study hours across <b>{t.study_blocks}</b> blocks, with{' '}
              <b>{t.deadlines}</b> deadlines to clear around <b>{t.exams}</b> midterms.
            </p>
          )}
        </header>

        <section className="mc-runway-wrap" id="runway">
          <Runway plan={data.plan} now={now} actuals={actuals} />
          <Key actual={actuals.spans.size > 0 || actuals.dayMinutes.size > 0} />
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
      </div>
      <p className="mc-foot">{syncedAgo(data.updated, now)}</p>
    </>
  );
}

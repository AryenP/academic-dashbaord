import { useMemo, useState } from 'react';
import { useHistory } from '../lib/history';
import { daysUntil, isPast, round1, type ExamPrep } from '../lib/plan';
import { draftPlan, type DraftResult } from '../lib/sources';
import { useNow, usePlan } from '../lib/usePlan';
import { focusSeconds } from '../lib/history';
import { usePulse } from '../lib/social';
import { Icon } from './Icon';

// Above the runway: draft a plan, decide on proposals, catch up when behind, and answer
// "did you submit?" for deadlines that passed after you worked on them.

export function PlanBar() {
  const plan = usePlan();
  const history = useHistory();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pulse = usePulse();

  const proposals = plan.plan.filter((r) => r.proposed);
  const proposedHours = round1(proposals.reduce((t, r) => t + r.hours, 0));
  const upcoming = plan.exam_prep.filter((x) => !isPast(x, now));

  // Behind: for an exam under 10 days out, accepted study hours that have already passed minus
  // hours actually studied for the course since the first planned block.
  const behind = useMemo(() => {
    const out: { exam: ExamPrep; hours: number }[] = [];
    for (const x of upcoming) {
      if (daysUntil(x.day, new Date(now)) > 10) continue;
      const blocks = plan.plan.filter(
        (r) => r.kind === 'Study' && !r.proposed && r.course === x.course && Date.parse(r.end) <= now,
      );
      if (!blocks.length) continue;
      const planned = blocks.reduce((t, r) => t + r.hours, 0);
      const since = Math.min(...blocks.map((r) => Date.parse(r.start)));
      const actual =
        history.sessions
          .filter((s) => s.course === x.course && Date.parse(s.started_at) >= since)
          .reduce((t, s) => t + focusSeconds(s), 0) / 3600;
      const gap = round1(planned - actual);
      if (gap >= 2) out.push({ exam: x, hours: gap });
    }
    return out;
  }, [upcoming, plan.plan, history.sessions, now]);

  // Did you submit? A deadline that passed in the last 3 days, still open, with a study block for
  // its course in the 3 days before it.
  const asks = useMemo(
    () =>
      plan.plan.filter(
        (r) =>
          r.kind === 'Deadline' &&
          !r.proposed &&
          r.status === 'open' &&
          isPast(r, now) &&
          now - Date.parse(r.end) < 3 * 864e5 &&
          !dismissed.has(r.id) &&
          plan.plan.some(
            (s) =>
              s.kind === 'Study' &&
              !s.proposed &&
              s.course === r.course &&
              Date.parse(s.end) <= Date.parse(r.end) &&
              Date.parse(r.end) - Date.parse(s.start) < 3 * 864e5,
          ),
      ),
    [plan.plan, now, dismissed],
  );

  const draft = async (examId?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r: DraftResult = await draftPlan(examId);
      if (!r.ok) setMsg(r.message ?? "The draft didn't go through.");
      else if (!r.blocks) setMsg(r.message ?? 'Nothing to add.');
      else setMsg(null);
      await plan.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "The draft didn't go through.");
    } finally {
      setBusy(false);
    }
  };

  const nothingToShow =
    !proposals.length && !behind.length && !asks.length && !upcoming.length && !msg && !pulse;
  if (nothingToShow) return null;

  return (
    <div className="pb" aria-live="polite">
      {asks.map((d) => (
        <div key={d.id} className="pb-row pb-ask">
          <span>
            Did you submit <b>{d.title}</b> ({d.course})?
          </span>
          <span className="row">
            <button className="btn btn-small btn-primary" onClick={() => plan.setStatus(d.id, 'submitted')}>
              Yes
            </button>
            <button className="btn btn-small btn-quiet" onClick={() => plan.setStatus(d.id, 'missed')}>
              Not yet
            </button>
            <button
              className="btn btn-small btn-link"
              onClick={() => setDismissed(new Set([...dismissed, d.id]))}
            >
              Ask later
            </button>
          </span>
        </div>
      ))}
      {proposals.length > 0 ? (
        <div className="pb-row pb-proposal">
          <span>
            {proposals.every((p) => p.kind === 'Study') ? (
              <>
                Runway drafted <b>{proposals.length}</b> study {proposals.length === 1 ? 'block' : 'blocks'} (
                <b>{proposedHours} h</b>) before your {upcoming.length === 1 ? 'exam' : 'exams'}.
              </>
            ) : (
              <>
                Runway proposed <b>{proposals.length}</b> {proposals.length === 1 ? 'item' : 'items'}:{' '}
                {proposals.filter((p) => p.kind === 'Exam').length} exams,{' '}
                {proposals.filter((p) => p.kind === 'Deadline').length} deadlines,{' '}
                {proposals.filter((p) => p.kind === 'Study').length} study blocks.
              </>
            )}{' '}
            They're dashed on the runway; each one says where it came from.
          </span>
          <span className="row">
            <button className="btn btn-small btn-primary" onClick={() => plan.decide(true)}>
              <Icon name="check" /> Accept all
            </button>
            <button className="btn btn-small btn-quiet" onClick={() => plan.decide(false)}>
              Discard
            </button>
          </span>
        </div>
      ) : (
        behind.map((b) => (
          <div key={b.exam.id} className="pb-row pb-behind">
            <span>
              You're <b>{b.hours} h</b> behind on <b>{b.exam.course}</b> for {b.exam.title}.
            </span>
            <button className="btn btn-small btn-primary" onClick={() => draft(b.exam.id)} disabled={busy}>
              {busy ? 'Drafting…' : 'Find time to catch up'}
            </button>
          </div>
        ))
      )}
      {pulse > 0 && (
        <div className="pb-row pb-pulse">
          <span>
            <b>{pulse}</b> {pulse === 1 ? 'classmate' : 'classmates'} studied today.
          </span>
        </div>
      )}
      {!proposals.length && upcoming.length > 0 && (
        <div className="pb-row pb-draft">
          <span className="muted">
            {msg ??
              'Want help filling the runway? Runway drafts study blocks before each exam, around everything else.'}
          </span>
          <button className="btn btn-small btn-quiet" onClick={() => draft()} disabled={busy}>
            {busy ? 'Drafting…' : 'Draft a plan'}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { whenLabel } from '../lib/planBuild';
import { cancelStudy, name, respondStudy, useStudyInvites, type StudyInvite } from '../lib/social';
import { localIso } from '../lib/tz';
import { usePlan } from '../lib/usePlan';

// Invitations to study together, on the runway: what you were asked, what you asked, and what's
// agreed. Nothing reaches either runway until the person asked says yes.

export function StudyInvites() {
  const plan = usePlan();
  const { invites, refresh } = useStudyInvites();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = invites.filter((i) => !hidden.has(i.id));
  if (!shown.length && !error) return null;
  const when = (i: StudyInvite) =>
    whenLabel(localIso(i.start_at, plan.timezone), localIso(i.end_at, plan.timezone));
  const act = async (id: string, f: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await f();
      await Promise.all([refresh(), plan.refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through.');
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="pb si" aria-live="polite" aria-label="Study together">
      {shown.map((i) => (
        <div key={i.id} className={`pb-row si-${i.status}`}>
          {i.direction === 'received' && i.status === 'proposed' ? (
            <>
              <span>
                <b>{name(i)}</b> asks to study <b>{i.course_code}</b> together, {when(i)}.
              </span>
              <span className="row">
                <button
                  className="btn btn-small btn-primary"
                  disabled={busy === i.id}
                  onClick={() => act(i.id, () => respondStudy(i.id, true))}
                >
                  Accept
                </button>
                <button
                  className="btn btn-small btn-quiet"
                  disabled={busy === i.id}
                  onClick={() => act(i.id, () => respondStudy(i.id, false))}
                >
                  Not this time
                </button>
              </span>
            </>
          ) : i.status === 'proposed' ? (
            <>
              <span>
                You asked <b>{name(i)}</b> to study <b>{i.course_code}</b>, {when(i)}. Waiting for an answer.
              </span>
              <button
                className="btn btn-small btn-link"
                disabled={busy === i.id}
                onClick={() => act(i.id, () => cancelStudy(i.id))}
              >
                Call it off
              </button>
            </>
          ) : i.status === 'accepted' ? (
            <>
              <span>
                Studying <b>{i.course_code}</b> with <b>{name(i)}</b>, {when(i)}. It's on both runways.
              </span>
              <button
                className="btn btn-small btn-link"
                disabled={busy === i.id}
                onClick={() => act(i.id, () => cancelStudy(i.id))}
              >
                Call it off
              </button>
            </>
          ) : (
            <>
              <span>
                <b>{name(i)}</b> can't make {when(i)} for {i.course_code}.
              </span>
              <button
                className="btn btn-small btn-link"
                onClick={() => setHidden(new Set([...hidden, i.id]))}
              >
                OK
              </button>
            </>
          )}
        </div>
      ))}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

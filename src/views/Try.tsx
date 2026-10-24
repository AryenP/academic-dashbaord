import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Checkpoints } from '../components/Checkpoints';
import { Icon } from '../components/Icon';
import { Runway } from '../components/Runway';
import { GUIDES, type Guide } from '../connect/guides';
import { useAuth } from '../lib/auth';
import { setCourseSlots } from '../lib/courses';
import { clearPending, loadPending, savePending } from '../lib/pending';
import { isPast } from '../lib/plan';
import { previewPlan, type PreviewResult } from '../lib/preview';
import { previewSource } from '../lib/sources';
import { useNow } from '../lib/useNow';

// The first minute: before there's an account, paste the calendar address and see your own next
// three weeks drawn on the runway. Runway reads the address once and keeps nothing; "Keep this
// runway" holds it in this browser until the sign-in finishes, then it goes into the account.

const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const ADDRESS_GUIDES = GUIDES.filter((g) => g.kind === 'ical' || g.kind === 'canvas');

export function Try() {
  const { user, ready } = useAuth();
  const [guideId, setGuideId] = useState<Guide['id']>('canvas');
  const guide = ADDRESS_GUIDES.find((g) => g.id === guideId) ?? ADDRESS_GUIDES[0];
  const [result, setResult] = useState<{ r: PreviewResult; url: string; guide: Guide } | null>(null);

  if (!ready) return null;
  // Signed in already: the real thing is one screen away.
  if (user) return <Navigate to="/connect" replace />;

  return (
    <div className="page connect try">
      <header className="page-head">
        <h1 className="page-h">See your runway first</h1>
        <p className="mc-note">
          Paste the address of the calendar you already keep. Runway reads it once to draw your next three
          weeks, and keeps nothing until you sign up.
        </p>
      </header>

      {!result ? (
        <>
          <div className="cn-pick" role="radiogroup" aria-label="Where is your calendar?">
            {ADDRESS_GUIDES.map((g) => (
              <button
                key={g.id}
                role="radio"
                aria-checked={guideId === g.id}
                className="cn-opt"
                onClick={() => setGuideId(g.id)}
              >
                <span className="cn-opt-name">
                  {g.name}
                  {g.recommended && <span className="cn-tag">Start here</span>}
                </span>
                <span className="cn-opt-blurb">{g.blurb}</span>
              </button>
            ))}
          </div>
          <section className="cn-guide card-section" aria-labelledby="try-guide-h">
            <h2 id="try-guide-h" className="mc-h2">
              {guide.name}
            </h2>
            {guide.note && <p className="cn-note">{guide.note}</p>}
            <ol className="cn-steps">
              {guide.steps.map((s, i) => (
                <li key={i}>
                  <div className="cn-step-text">
                    <span>{s.text}</span>
                  </div>
                  {s.diagram}
                </li>
              ))}
            </ol>
            <TryBox key={guide.id} guide={guide} onRead={(r, url) => setResult({ r, url, guide })} />
          </section>
          <p className="cn-skip">
            Rather sign up first? <Link to="/signin">Sign in or sign up</Link>. A calendar file (.ics) can be
            uploaded after.
          </p>
        </>
      ) : (
        <Preview {...result} onAgain={() => setResult(null)} />
      )}
    </div>
  );
}

function TryBox({ guide, onRead }: { guide: Guide; onRead: (r: PreviewResult, url: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const v = url.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    try {
      const r = await previewSource(v, guide.kind as 'ical' | 'canvas', TZ);
      if (r.ok) onRead(r, v);
      else setError(r.message ?? 'That address did not work.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that address.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cn-paste" onSubmit={submit} aria-label={`Try ${guide.name}`}>
      <label className="field">
        <span className="field-label">Paste the address</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={guide.placeholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      {busy && (
        <p className="field-hint" role="status">
          Reading your calendar…
        </p>
      )}
      {error && (
        <p className="form-error" role="status">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || !url.trim()}>
          {busy ? 'Reading…' : 'Draw my runway'}
        </button>
      </div>
    </form>
  );
}

function Preview({
  r,
  url,
  guide,
  onAgain,
}: {
  r: PreviewResult;
  url: string;
  guide: Guide;
  onAgain: () => void;
}) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const tz = r.tz ?? TZ;
  const { data, courses } = useMemo(() => previewPlan(r, tz, new Date(now)), [r, tz, now]);
  useMemo(() => setCourseSlots(courses), [courses]);
  const exams = data.exam_prep.filter((x) => !isPast(x, now));
  const [kept, setKept] = useState(!!loadPending());
  const keep = () => {
    savePending({ kind: guide.kind as 'ical' | 'canvas', label: guide.name, url });
    setKept(true);
    navigate('/signin');
  };
  const forget = () => {
    clearPending();
    setKept(false);
    onAgain();
  };
  const n = r.courses?.length ?? 0;
  return (
    <section aria-labelledby="try-r-h" className="try-result">
      <h2 id="try-r-h" className="mc-h2">
        Your next three weeks
      </h2>
      <p className="cn-found-h" role="status">
        <Icon name="check" /> Runway found {n} {n === 1 ? 'course' : 'courses'} and {data.plan.length}{' '}
        {data.plan.length === 1 ? 'item' : 'items'}
        {r.name ? ` in “${r.name}”` : ''}.
      </p>
      {n > 0 && (
        <p className="cn-chips">
          {r.courses!.slice(0, 8).map((c) => (
            <span key={c.code} className="cn-chip">
              {c.code}
            </span>
          ))}
        </p>
      )}
      {data.plan.length > 0 ? (
        <div className="mc-runway-wrap try-board">
          <Runway plan={data.plan} now={now} />
        </div>
      ) : (
        <p className="mc-note">
          Nothing in the next three weeks reads as a class, exam, deadline or study block. Runway reads more
          once you sign up, and you can add things by hand.
        </p>
      )}
      {exams.length > 0 && <Checkpoints exams={exams.slice(0, 2)} plan={data.plan} now={now} />}
      <p className="field-hint">
        This is what Runway's title rules read on their own. After you sign up it reads what they weren't sure
        about, and you check every course before anything is planned.
      </p>

      <div className="try-keep card-section">
        <p className="ld-end-h">Keep this runway.</p>
        <p className="mc-note">
          Sign up with your school email (or Google) and this calendar goes straight onto your runway. Until
          then the address waits in this browser, for a day at most, and nowhere else.
        </p>
        <p className="row">
          <button className="btn btn-primary btn-big" onClick={keep}>
            Keep this runway
          </button>
          <button className="btn btn-link" onClick={onAgain}>
            Try another address
          </button>
          {kept && (
            <button className="btn btn-link" onClick={forget}>
              Forget it
            </button>
          )}
        </p>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SignInNeeded } from '../components/SignInNeeded';
import { GUIDES, type Guide } from '../connect/guides';
import { useAuth } from '../lib/auth';
import { useSources, type Validation } from '../lib/sources';
import { supabase } from '../lib/supabase';

// Connect a calendar: pick a source, follow three drawn steps, paste the address, see what Runway
// found, add it. Skippable, and reachable again from Settings.

interface School {
  name: string;
  canvas_url: string | null;
}

function useSchool(): { school: School | null; domain: string; loading: boolean } {
  const { user } = useAuth();
  const domain = user?.email?.split('@')[1]?.toLowerCase() ?? '';
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase || !domain) return;
    let alive = true;
    supabase
      .from('schools')
      .select('name, canvas_url')
      .contains('domains', [domain])
      .limit(1)
      .then(({ data }) => {
        if (!alive) return;
        setSchool(data?.[0] ?? null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [domain]);
  return { school, domain, loading };
}

export function Connect() {
  const { user, ready, profile, updateProfile } = useAuth();
  const [guideId, setGuideId] = useState<Guide['id']>('canvas');
  const guide = GUIDES.find((g) => g.id === guideId)!;

  // Remember that the person has seen this screen, so the runway stops sending them here.
  useEffect(() => {
    if (!profile || (profile.onboarding as { connect_seen?: boolean })?.connect_seen) return;
    updateProfile({ onboarding: { ...(profile.onboarding as object), connect_seen: true } }).catch(() => {});
  }, [profile, updateProfile]);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="connect a calendar" />;

  return (
    <div className="page connect">
      <header className="page-head">
        <h1 className="page-h">Connect a calendar</h1>
        <p className="mc-note">
          Runway reads your calendar and builds the runway from it: classes, exams, deadlines, study blocks.
          Pick where your schedule lives. You can add more later from Settings.
        </p>
      </header>

      <div className="cn-pick" role="radiogroup" aria-label="Where is your calendar?">
        {GUIDES.map((g) => (
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

      <GuidePanel key={guide.id} guide={guide} />

      <p className="cn-skip">
        <Link to="/">Skip for now</Link>. You can add things by hand, and come back to this from Settings.
      </p>
    </div>
  );
}

function GuidePanel({ guide }: { guide: Guide }) {
  const { school, domain, loading } = useSchool();
  return (
    <section className="cn-guide card-section" aria-labelledby="cn-guide-h">
      <h2 id="cn-guide-h" className="mc-h2">
        {guide.name}
      </h2>
      {guide.id === 'canvas' && !loading && (
        <p className="cn-school">
          {school?.canvas_url ? (
            <>
              Your school is <b>{school.name}</b>.{' '}
              <a href={`${school.canvas_url}/calendar`} target="_blank" rel="noreferrer">
                Open its Canvas calendar
              </a>{' '}
              in a new tab, then follow the steps.
            </>
          ) : (
            <UnknownSchool domain={domain} />
          )}
        </p>
      )}
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
      {guide.kind === 'ics_upload' ? <UploadBox /> : <PasteBox guide={guide} />}
      <details className="cn-trouble">
        <summary>This didn't work</summary>
        <ul>
          {guide.trouble.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function UnknownSchool({ domain }: { domain: string }) {
  const [url, setUrl] = useState('');
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await supabase?.from('school_requests').insert({ domain, canvas_url: url.trim() || null });
    setSent(true);
  };
  if (sent)
    return <>Thanks. Runway will know {domain} next time. The steps below work on any school's Canvas.</>;
  return (
    <>
      Runway doesn't know <b>{domain}</b> yet. The steps below work on any school's Canvas.{' '}
      <form className="cn-school-form" onSubmit={submit}>
        <label className="field grow">
          <span className="field-label">Your school's Canvas address (optional)</span>
          <input
            type="url"
            placeholder="https://canvas.yourschool.edu"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button className="btn btn-quiet">Tell Runway</button>
      </form>
    </>
  );
}

const KIND_WORDS: Record<string, string> = {
  class: 'classes',
  exam: 'exams',
  deadline: 'deadlines',
  study: 'study blocks',
  commitment: 'commitments',
  personal: 'other events',
};

function Found({ v }: { v: Validation }) {
  const s = v.summary!;
  const parts = Object.entries(s.counts)
    .filter(([k]) => k !== 'personal')
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${n === 1 ? KIND_WORDS[k].replace(/e?s$/, '') : KIND_WORDS[k]}`);
  return (
    <div className="cn-found" role="status">
      <p className="cn-found-h">
        <Icon name="check" /> Found {s.courses.length} {s.courses.length === 1 ? 'course' : 'courses'} and{' '}
        {s.events} {s.events === 1 ? 'item' : 'items'}
        {s.name ? ` in “${s.name}”` : ''}.
      </p>
      {s.courses.length > 0 && (
        <p className="cn-chips">
          {s.courses.slice(0, 8).map((c) => (
            <span key={c.code} className="cn-chip">
              {c.code}
            </span>
          ))}
        </p>
      )}
      {parts.length > 0 && <p className="field-hint">{parts.join(', ')} in the next six months.</p>}
      {v.hints?.includes('google_public') && (
        <p className="form-error">
          That's Google's public address. It only works if the calendar is public; the secret address always
          works.
        </p>
      )}
      {v.hints?.includes('looks_like_canvas') && (
        <p className="field-hint">
          This looks like a Canvas feed. Runway will read assignments from it either way.
        </p>
      )}
    </div>
  );
}

function PasteBox({ guide }: { guide: Guide }) {
  const { validate, add } = useSources();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Validation | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedFor = useRef('');

  const check = async (value = url) => {
    const v = value.trim();
    if (!v || v === checkedFor.current) return;
    checkedFor.current = v;
    setChecking(true);
    setError(null);
    try {
      setResult(await validate(v, guide.kind as 'ical' | 'canvas'));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Could not check that address.' });
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!result?.ok) {
      await check();
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const { result: r } = await add(guide.kind, guide.name, url.trim());
      if (!r.ok) setError(r.error ?? 'The first sync failed. Check Settings → Calendars.');
      navigate(r.ok ? '/courses?read=1' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that calendar.');
    } finally {
      setAdding(false);
    }
  };

  const status = useMemo(() => {
    if (checking) return 'Checking…';
    if (result && !result.ok) return result.message ?? 'That address did not work.';
    return null;
  }, [checking, result]);

  return (
    <form className="cn-paste" onSubmit={submit} aria-label={`Add ${guide.name}`}>
      <label className="field">
        <span className="field-label">Paste the address</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={guide.placeholder}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
          onBlur={() => check()}
          onPaste={(e) => setTimeout(() => check(e.clipboardData.getData('text')), 0)}
        />
      </label>
      {status && (
        <p className={result && !result.ok ? 'form-error' : 'field-hint'} role="status">
          {status}
        </p>
      )}
      {result?.ok && <Found v={result} />}
      <div className="row">
        <button className="btn btn-primary" disabled={checking || adding || !url.trim()}>
          {adding ? 'Adding…' : result?.ok ? 'Add this calendar' : 'Check'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function UploadBox() {
  const { upload } = useSources();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('That file is larger than 5 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { result } = await upload(file.name, await file.text());
      if (!result.ok) setError(result.error ?? "Runway couldn't read that file.");
      else navigate('/courses?read=1', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Runway couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cn-paste">
      <label className="field">
        <span className="field-label">Choose the file</span>
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {busy && <p className="field-hint">Reading…</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

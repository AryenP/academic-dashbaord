import { useCallback, useEffect, useState } from 'react';
import { CopyButton, CopyField } from './CopyButton';
import { SHORTCUT_STEPS, SIGNAL_KINDS } from '../connect/shortcut';
import { supabase } from '../lib/supabase';

// Sleep, exercise and steps from an iPhone, through a Shortcut the student builds once. The
// Shortcut posts one coarse number per day to the signals function with a token made here. Nothing
// is read from the phone by Runway; the phone sends. Android has no equivalent route yet.

const ENDPOINT = import.meta.env.VITE_SUPABASE_URL
  ? `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1/signals`
  : '';

interface SignalRow {
  day: string;
  kind: string;
  value: number | null;
  label: string | null;
}

function Recent({ rows }: { rows: SignalRow[] }) {
  if (rows.length === 0)
    return (
      <p className="field-hint" role="status">
        Nothing received yet. Run the shortcut once by hand to check it; the result shows here.
      </p>
    );
  return (
    <ul className="sig-recent" aria-label="Received from your phone">
      {rows.map((r) => {
        const k = SIGNAL_KINDS[r.kind] ?? { name: r.kind, unit: '' };
        return (
          <li key={`${r.day}-${r.kind}`}>
            <span className="sig-day">{r.day}</span>
            <span className="sig-kind">{k.name}</span>
            <span className="sig-val num">
              {r.kind === 'place'
                ? r.label
                : `${Number(r.value).toLocaleString()}${k.unit ? ` ${k.unit}` : ''}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The card. `where` only changes the heading level and whether it starts folded. */
export function SignalsSetup({ where }: { where: 'connect' | 'settings' }) {
  const [token, setToken] = useState<string | null>(null);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SignalRow[]>([]);
  // On Connect the card starts folded and its body (three drawings) isn't built until opened.
  const [open, setOpen] = useState(where === 'settings');

  const load = useCallback(() => {
    if (!supabase) return;
    supabase
      .from('access_tokens')
      .select('purpose')
      .eq('purpose', 'shortcut')
      .maybeSingle()
      .then(({ data }) => setHas(!!data));
    supabase
      .from('signals')
      .select('day, kind, value, label')
      .order('day', { ascending: false })
      .order('kind')
      .limit(8)
      .then(({ data }) => setRows((data as SignalRow[] | null) ?? []));
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const make = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('make_access_token', { p_purpose: 'shortcut' });
    if (error) setError(error.message);
    else {
      setToken(data as string);
      setHas(true);
    }
    setBusy(false);
  };

  const Heading = where === 'connect' ? 'h3' : 'h2';
  const body = (
    <>
      <p className="mc-note">
        Optional, iPhone only. A Shortcut you build once sends one number a day (hours slept, minutes of
        exercise, steps) to Runway. Never raw samples, never heart rate, never a location: just the number.
        The Stats page uses them to say what tends to go with a good session.
      </p>
      <ol className="cn-steps">
        {SHORTCUT_STEPS.map((s, i) => (
          <li key={i}>
            <div className="cn-step-text">
              <span>{s.text}</span>
            </div>
            {s.diagram}
          </li>
        ))}
      </ol>
      {ENDPOINT && <CopyField label="The address for Get Contents of URL" value={ENDPOINT} />}
      {token ? (
        <>
          <div className="form-row">
            <label className="field grow">
              <span className="field-label">Shortcut token (shown once)</span>
              <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
            </label>
            <CopyButton text={token} label="Copy token" />
          </div>
          <p className="field-hint">Paste it as the x-runway-token header value in the Shortcut.</p>
        </>
      ) : (
        <p className="row">
          <button className="btn btn-quiet" onClick={make} disabled={busy}>
            {busy
              ? 'Making…'
              : has
                ? 'Make a new shortcut token (the old one stops working)'
                : 'Make a shortcut token'}
          </button>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="sig-check">
        <div className="row">
          <Heading className="mc-h3">Received from your phone</Heading>
          <button type="button" className="btn btn-small" onClick={load}>
            Refresh
          </button>
        </div>
        <Recent rows={rows} />
      </div>
    </>
  );

  if (where === 'connect')
    return (
      <details className="card-section cn-more" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <Heading className="mc-h2">Sleep and exercise from your iPhone</Heading>
          <span className="field-hint">Optional. Set it up later from Settings.</span>
        </summary>
        {open && body}
      </details>
    );
  return (
    <section className="card-section" aria-labelledby="sig-h">
      <Heading id="sig-h" className="mc-h2">
        Sleep and exercise from your iPhone
      </Heading>
      {body}
    </section>
  );
}

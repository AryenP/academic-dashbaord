import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { makeFeedUrl } from '../lib/sources';
import { supabase } from '../lib/supabase';
import { CopyButton } from './CopyButton';

// Settings → Planning: what the planner is allowed to do with your days.
// Settings → Your plan as a calendar: a subscribe link for Google, Apple or Outlook.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PlanningSettings() {
  const { settings, updateSettings } = useAuth();
  const p = settings.planning ?? {};
  const hours = p.hours_per_day ?? 3;
  const earliest = p.earliest ?? '09:00';
  const latest = p.latest ?? '22:00';
  const block = p.block_min ?? 90;
  const off = new Set(p.days_off ?? []);
  const save = (patch: Partial<NonNullable<typeof settings.planning>>) =>
    updateSettings({ planning: { ...p, ...patch } });
  return (
    <section className="card-section" aria-labelledby="plan-h">
      <h2 id="plan-h" className="mc-h2">
        Planning
      </h2>
      <p className="mc-note">
        When Runway drafts study blocks it keeps to these. Classes, work and everything else on the runway are
        always worked around.
      </p>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Study hours per day, at most</span>
          <input
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            inputMode="decimal"
            defaultValue={hours}
            onBlur={(e) => save({ hours_per_day: Math.max(0.5, Math.min(12, Number(e.target.value) || 3)) })}
          />
        </label>
        <label className="field">
          <span className="field-label">Not before</span>
          <input
            type="time"
            defaultValue={earliest}
            onBlur={(e) => e.target.value && save({ earliest: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Not after</span>
          <input
            type="time"
            defaultValue={latest}
            onBlur={(e) => e.target.value && save({ latest: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Block length (min)</span>
          <input
            type="number"
            min={30}
            max={240}
            step={15}
            inputMode="numeric"
            defaultValue={block}
            onBlur={(e) => save({ block_min: Math.max(30, Math.min(240, Number(e.target.value) || 90)) })}
          />
        </label>
      </div>
      <div className="field">
        <span className="field-label" id="off-l">
          Days off
        </span>
        <div className="chips" role="group" aria-labelledby="off-l">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              className="chip"
              aria-pressed={off.has(i)}
              onClick={() => {
                const next = new Set(off);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                save({ days_off: [...next].sort() });
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FeedSettings() {
  const [url, setUrl] = useState<string | null>(null);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      ?.from('access_tokens')
      .select('purpose')
      .eq('purpose', 'feed')
      .maybeSingle()
      .then(({ data }) => alive && setHas(!!data));
    return () => {
      alive = false;
    };
  }, []);
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl(await makeFeedUrl());
      setHas(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the link.');
    } finally {
      setBusy(false);
    }
  };
  const webcal = url?.replace(/^https?:\/\//, 'webcal://') ?? null;
  return (
    <section className="card-section" aria-labelledby="feed-h">
      <h2 id="feed-h" className="mc-h2">
        Your plan as a calendar
      </h2>
      <p className="mc-note">
        Subscribe once and your accepted study blocks, exams and deadlines show up in Google Calendar, Apple
        Calendar or Outlook, and stay in step. The link is a secret: anyone who has it can read your plan.
      </p>
      {url ? (
        <>
          <div className="form-row">
            <label className="field grow">
              <span className="field-label">Subscribe link (shown once)</span>
              <input type="url" readOnly value={webcal ?? ''} onFocus={(e) => e.target.select()} />
            </label>
            <CopyButton text={webcal ?? ''} label="Copy link" />
          </div>
          <p className="field-hint">
            Google Calendar: Other calendars → + → From URL, paste it. Apple: File → New Calendar
            Subscription. Outlook: Add calendar → Subscribe from web. Google refreshes feeds every few hours.
          </p>
        </>
      ) : (
        <p className="row">
          <button className="btn btn-quiet" onClick={make} disabled={busy}>
            {busy ? 'Making…' : has ? 'Make a new link (the old one stops working)' : 'Make the link'}
          </button>
          {has && !url && (
            <span className="field-hint">You already have a link. Making a new one replaces it.</span>
          )}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

export function ExtensionSettings() {
  const [token, setToken] = useState<string | null>(null);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      ?.from('access_tokens')
      .select('purpose')
      .eq('purpose', 'extension')
      .maybeSingle()
      .then(({ data }) => alive && setHas(!!data));
    return () => {
      alive = false;
    };
  }, []);
  const make = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('make_access_token', { p_purpose: 'extension' });
    if (error) setError(error.message);
    else {
      setToken(data as string);
      setHas(true);
    }
    setBusy(false);
  };
  return (
    <section className="card-section" aria-labelledby="ext-h">
      <h2 id="ext-h" className="mc-h2">
        Gradescope and Canvas, through the browser extension
      </h2>
      <p className="mc-note">
        Optional. The Runway extension reads the Gradescope and Canvas pages you're already signed into and
        sends deadlines and whether you've submitted; released scores only if you switch that on in the
        extension. No password or cookie ever leaves your browser. Until it's in the store, install it from
        the <a href="https://github.com/AryenP/academic-dashbaord/tree/main/extension">extension folder</a>.
      </p>
      {token ? (
        <>
          <div className="form-row">
            <label className="field grow">
              <span className="field-label">Extension token (shown once)</span>
              <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
            </label>
            <CopyButton text={token} label="Copy token" />
          </div>
          <p className="field-hint">Paste it into the extension's popup and save.</p>
        </>
      ) : (
        <p className="row">
          <button className="btn btn-quiet" onClick={make} disabled={busy}>
            {busy
              ? 'Making…'
              : has
                ? 'Make a new extension token (the old one stops working)'
                : 'Make an extension token'}
          </button>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

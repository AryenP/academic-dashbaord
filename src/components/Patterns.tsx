import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MIN_DAYS, patternSentences, type PatternFacts } from '../lib/patterns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// What tends to go with a good session, in plain words, from sessions and the phone's signals.

export function Patterns() {
  const { user } = useAuth();
  const [facts, setFacts] = useState<PatternFacts | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase || !user) return;
    let alive = true;
    supabase
      .rpc('signal_patterns', { p_user: user.id })
      .then(({ data }) => alive && setFacts((data as PatternFacts | null) ?? null));
    return () => {
      alive = false;
    };
  }, [user]);

  const lines = patternSentences(facts);
  return (
    <section className="card-section" aria-labelledby="pat-h">
      <h2 id="pat-h" className="mc-h2">
        Patterns
      </h2>
      {lines.length > 0 ? (
        <ul className="patterns">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mc-note" role="status">
          {facts === undefined
            ? 'Looking…'
            : facts && facts.days >= MIN_DAYS
              ? 'Nothing stands out yet. Patterns need sleep, exercise or place signals from your phone next to a few sessions on both sides of a comparison.'
              : `Patterns appear after ${MIN_DAYS} days with sessions, read next to the sleep, exercise and place signals your phone sends. Set that up under `}
          {!(facts && facts.days >= MIN_DAYS) && facts !== undefined && (
            <>
              <Link to="/settings">Settings</Link>.
            </>
          )}
        </p>
      )}
      {lines.length > 0 && (
        <p className="field-hint">
          "Tends to" is the whole claim: a few weeks of your own numbers show a pattern, not a cause.
        </p>
      )}
    </section>
  );
}

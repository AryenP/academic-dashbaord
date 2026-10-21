import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ago, useSources, type SourceRow } from '../lib/sources';
import { useNow } from '../lib/useNow';
import { Icon } from './Icon';

// Settings → Calendars: every connected source, its last sync, and what to do about a failure.

const KIND: Record<string, string> = {
  canvas: 'Canvas',
  ical: 'Calendar address',
  ics_upload: 'Uploaded file',
};

export function SourcesSettings() {
  const api = useSources();
  const { sources, loading } = api;
  return (
    <section className="card-section" aria-labelledby="src-h">
      <h2 id="src-h" className="mc-h2">
        Calendars
      </h2>
      {loading ? null : !sources?.length ? (
        <p className="mc-note">
          No calendar connected yet. <Link to="/connect">Connect one</Link> and the runway builds itself.
        </p>
      ) : (
        <ul className="src-list">
          {sources.map((s) => (
            <SourceItem key={s.id} s={s} api={api} />
          ))}
        </ul>
      )}
      {!!sources?.length && (
        <p>
          <Link to="/connect" className="btn btn-quiet">
            <Icon name="plus" /> Add another
          </Link>
        </p>
      )}
    </section>
  );
}

// The list and its rows share one hook instance, so a sync or removal updates the list.
function SourceItem({ s, api }: { s: SourceRow; api: ReturnType<typeof useSources> }) {
  const { sync, remove } = api;
  const now = useNow(30_000);
  const [busy, setBusy] = useState<'sync' | 'remove' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doSync = async () => {
    setBusy('sync');
    setMsg(null);
    try {
      const r = await sync(s.id);
      setMsg(
        r.ok
          ? r.unchanged
            ? 'Nothing changed.'
            : `Synced ${r.events ?? 0} items.`
          : (r.error ?? 'Sync failed.'),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(null);
    }
  };
  const doRemove = async () => {
    setBusy('remove');
    try {
      await remove(s.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not remove it.');
      setBusy(null);
    }
  };

  const state = s.kind === 'ics_upload' ? 'file' : s.status;
  return (
    <li className={`src-item is-${state}`}>
      <div className="src-main">
        <span className="src-dot" aria-hidden="true" />
        <div>
          <div className="src-name">
            <b>{s.label}</b> <span className="muted">· {KIND[s.kind] ?? s.kind}</span>
            {s.host && <span className="muted"> · {s.host}</span>}
          </div>
          <div className="src-meta">
            {s.kind === 'ics_upload'
              ? `${s.event_count} items from the file. A file doesn't stay in sync.`
              : s.status === 'error'
                ? `Last try failed ${ago(s.last_synced_at ?? s.created_at, now)}.`
                : s.status === 'pending'
                  ? 'Waiting for the first sync.'
                  : `${s.event_count} items · synced ${ago(s.last_synced_at, now)}`}
          </div>
          {s.status === 'error' && s.last_error && <p className="form-error src-err">{s.last_error}</p>}
          {msg && (
            <p className="field-hint" role="status">
              {msg}
            </p>
          )}
        </div>
      </div>
      <div className="row src-actions">
        {s.kind !== 'ics_upload' && (
          <button className="btn btn-quiet btn-small" onClick={doSync} disabled={busy !== null}>
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        {!confirm ? (
          <button
            className="btn btn-quiet btn-small"
            onClick={() => setConfirm(true)}
            disabled={busy !== null}
          >
            Remove
          </button>
        ) : (
          <>
            <button className="btn btn-danger btn-small" onClick={doRemove} disabled={busy !== null}>
              {busy === 'remove' ? 'Removing…' : 'Remove it and its items'}
            </button>
            <button className="btn btn-quiet btn-small" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        )}
      </div>
    </li>
  );
}

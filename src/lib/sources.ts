import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase, type Tables } from './supabase';
import { usePlan } from './usePlan';

// Calendar sources: the person's connected calendars, and the calls that check, add, sync and
// remove them. Addresses go straight to the database function that puts them in Vault; the
// browser never reads one back.

export type SourceKind = 'ical' | 'canvas' | 'ics_upload';
export type SourceRow = Omit<
  Tables<'calendar_sources'>,
  'secret_id' | 'etag' | 'last_modified' | 'backoff_minutes'
>;

export interface Validation {
  ok: boolean;
  code?: string;
  message?: string;
  host?: string;
  hints?: string[];
  summary?: {
    name: string | null;
    events: number;
    truncated: boolean;
    counts: Record<string, number>;
    courses: { code: string; events: number }[];
    sample: { title: string; start: string }[];
  };
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  unchanged?: boolean;
  events?: number;
  planned?: number;
}

const SELECT =
  'id, user_id, kind, label, host, status, last_synced_at, last_error, next_sync_at, event_count, created_at';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('The backend is not set up.');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Supabase wraps non-2xx answers; the body still carries the message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        return (await ctx.json()) as T;
      } catch {
        // fall through
      }
    }
    throw new Error(error.message);
  }
  return data as T;
}

export function useSources() {
  const { user, ready } = useAuth();
  const plan = usePlan();
  const [sources, setSources] = useState<SourceRow[] | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from('calendar_sources').select(SELECT).order('created_at');
    setSources((data as SourceRow[] | null) ?? []);
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    let alive = true;
    supabase
      ?.from('calendar_sources')
      .select(SELECT)
      .order('created_at')
      .then(({ data }) => alive && setSources((data as SourceRow[] | null) ?? []));
    return () => {
      alive = false;
    };
  }, [user, ready]);

  const validate = useCallback(
    (url: string, kind: SourceKind) => invoke<Validation>('validate-source', { url, kind }),
    [],
  );

  const sync = useCallback(
    async (sourceId: string, ics?: string) => {
      const r = await invoke<SyncResult>(
        'sync-sources',
        ics == null ? { source_id: sourceId } : { source_id: sourceId, ics },
      );
      await Promise.all([refresh(), plan.refresh()]);
      return r;
    },
    [refresh, plan],
  );

  const add = useCallback(
    async (
      kind: SourceKind,
      label: string,
      url: string,
    ): Promise<{ source: SourceRow; result: SyncResult }> => {
      if (!supabase) throw new Error('The backend is not set up.');
      const { data, error } = await supabase.rpc('add_calendar_source', {
        p_kind: kind,
        p_label: label,
        p_url: url,
      });
      if (error) throw new Error(error.message);
      const source = data as unknown as SourceRow;
      const result = await sync(source.id);
      return { source, result };
    },
    [sync],
  );

  const upload = useCallback(
    async (label: string, ics: string) => {
      if (!supabase) throw new Error('The backend is not set up.');
      const { data, error } = await supabase.rpc('add_calendar_source', {
        p_kind: 'ics_upload',
        p_label: label,
        p_url: '',
      });
      if (error) throw new Error(error.message);
      const source = data as unknown as SourceRow;
      const result = await sync(source.id, ics);
      return { source, result };
    },
    [sync],
  );

  const rename = useCallback(
    async (id: string, label: string) => {
      await supabase!.from('calendar_sources').update({ label }).eq('id', id);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase!.from('calendar_sources').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await Promise.all([refresh(), plan.refresh()]);
    },
    [refresh, plan],
  );

  return {
    sources,
    loading: !!user && sources === null,
    refresh,
    validate,
    add,
    upload,
    sync,
    rename,
    remove,
  };
}

/** "5 min ago", "2 h ago", "Oct 21" */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 36 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface ReadResult {
  ok: boolean;
  read?: number;
  pending?: number;
  spent?: number;
  model?: string;
  skipped?: 'off' | 'user_budget' | 'global_budget' | 'no_key';
  message?: string;
}

/** Asks the AI to read this person's unsure events (or all of them), then rebuilds the plan. */
export const readWithAi = (all = false) => invoke<ReadResult>('classify-events', { all });

/** Rebuilds a source's plan items from its stored events and the person's overrides. */
export const rebuildSource = (sourceId: string) =>
  invoke<SyncResult>('sync-sources', { source_id: sourceId, rebuild: true });

export interface DraftResult {
  ok: boolean;
  draft_id?: string;
  blocks?: number;
  hours?: number;
  by?: 'ai' | 'rules';
  model?: string | null;
  dropped?: number;
  exams?: number;
  message?: string;
}

/** Asks the planner for study blocks before every upcoming exam (or one). */
export const draftPlan = (examId?: string) =>
  invoke<DraftResult>('draft-plan', examId ? { exam_id: examId } : {});

/** Makes (or replaces) the token behind the plan's calendar feed and returns the feed address. */
export async function makeFeedUrl(): Promise<string> {
  if (!supabase) throw new Error('The backend is not set up.');
  const { data, error } = await supabase.rpc('make_access_token', { p_purpose: 'feed' });
  if (error) throw new Error(error.message);
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  return `${base}/functions/v1/plan-feed?t=${data as string}`;
}

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth';
import { nextSlot, setCourseSlots, type CourseInfo } from './courses';
import type { PlanData } from './plan';
import { buildPlan, EMPTY_PLAN, type ItemRow } from './planBuild';
import { supabase } from './supabase';

// The signed-in person's plan: their courses and plan items from the database, built into the
// shape every view reads (src/lib/plan.ts). Visitors have no plan here; the landing page and share
// pages build their own PlanData and pass it down.

export type NewItem = {
  kind: 'study' | 'deadline' | 'exam' | 'class' | 'commitment';
  course: string | null; // course code; created if new
  title: string;
  start_at: string; // ISO
  end_at: string;
  location?: string;
  weight?: number | null;
};

interface PlanValue extends PlanData {
  loading: boolean;
  timezone: string;
  refresh(): Promise<void>;
  addItem(item: NewItem): Promise<void>;
  removeItem(id: string): Promise<void>;
  /** Accepts (or discards) planner proposals: all of them, or the given ids. */
  decide(accept: boolean, ids?: string[]): Promise<void>;
  /** Marks a deadline submitted (or open again), or missed. */
  setStatus(id: string, status: 'open' | 'submitted' | 'missed'): Promise<void>;
}

const PlanContext = createContext<PlanValue | null>(null);

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, ready, profile } = useAuth();
  const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const [rows, setRows] = useState<{ items: ItemRow[]; courses: CourseInfo[] } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return null;
    const [items, courses] = await Promise.all([
      supabase
        .from('plan_items')
        .select(
          'id, course_id, kind, title, start_at, end_at, location, weight, take_home, accepted, reason, for_item_id, status, submitted_at, score, max_score',
        )
        .gte('end_at', new Date(Date.now() - 45 * 864e5).toISOString())
        .order('start_at')
        .limit(3000),
      supabase.from('courses').select('id, code, name, color, hidden, visible').order('created_at'),
    ]);
    return { items: must(items) ?? [], courses: must(courses) ?? [] };
  }, [user]);

  // Rows belong to the user they were loaded for; a different (or no) user means an empty plan.
  const [rowsFor, setRowsFor] = useState<string | null>(null);
  const current = user && rowsFor === user.id ? rows : null;

  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    const pull = () =>
      load()
        .then((r) => {
          if (alive && r) {
            setRows(r);
            setRowsFor(user.id);
          }
        })
        .catch(() => {
          // offline or signed out mid-flight: keep what we have
        });
    pull();
    const onVis = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, ready, load]);

  const data = useMemo(() => {
    setCourseSlots(current?.courses ?? []);
    if (!current) return EMPTY_PLAN;
    return buildPlan(current.items, current.courses, timezone);
  }, [current, timezone]);

  const refresh = useCallback(async () => {
    const r = await load();
    if (r && user) {
      setRows(r);
      setRowsFor(user.id);
    }
  }, [load, user]);

  const addItem = useCallback(
    async (item: NewItem) => {
      if (!supabase || !user) throw new Error('Sign in first.');
      let course_id: string | null = null;
      if (item.course) {
        const code = item.course.trim().toUpperCase().replace(/\s+/g, ' ');
        const existing = current?.courses.find((c) => c.code === code);
        if (existing) course_id = existing.id;
        else {
          const c = must(
            await supabase
              .from('courses')
              .insert({ code, color: nextSlot(current?.courses ?? []) })
              .select('id')
              .single(),
          );
          course_id = c!.id;
        }
      }
      must(
        await supabase.from('plan_items').insert({
          course_id,
          kind: item.kind,
          title: item.title.trim(),
          start_at: item.start_at,
          end_at: item.end_at,
          location: item.location?.trim() ?? '',
          weight: item.weight ?? null,
        }),
      );
      await refresh();
    },
    [user, current, refresh],
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (!supabase) return;
      must(await supabase.from('plan_items').delete().eq('id', id));
      await refresh();
    },
    [refresh],
  );

  const decide = useCallback(
    async (accept: boolean, ids?: string[]) => {
      if (!supabase || !user) return;
      // Optimistic: the runway answers at once, the server confirms.
      setRows(
        (r) =>
          r && {
            ...r,
            items: r.items
              .filter((i) => accept || i.accepted !== false || (ids && !ids.includes(i.id)))
              .map((i) =>
                i.accepted === false && (!ids || ids.includes(i.id)) ? { ...i, accepted: true } : i,
              ),
          },
      );
      let q = accept
        ? supabase.from('plan_items').update({ accepted: true }).eq('accepted', false)
        : supabase.from('plan_items').delete().eq('accepted', false);
      if (ids?.length) q = q.in('id', ids);
      must(await q);
      await refresh();
    },
    [user, refresh],
  );

  const setStatus = useCallback(
    async (id: string, status: 'open' | 'submitted' | 'missed') => {
      if (!supabase) return;
      const at = status === 'submitted' ? new Date().toISOString() : null;
      setRows(
        (r) =>
          r && { ...r, items: r.items.map((i) => (i.id === id ? { ...i, status, submitted_at: at } : i)) },
      );
      must(
        await supabase
          .from('plan_items')
          .update({
            status,
            submitted_at: status === 'submitted' ? new Date().toISOString() : null,
            submitted_by: status === 'submitted' ? 'me' : null,
          })
          .eq('id', id),
      );
      await refresh();
    },
    [refresh],
  );

  const value: PlanValue = {
    ...data,
    loading: !!user && current === null,
    timezone,
    refresh,
    addItem,
    removeItem,
    decide,
    setStatus,
  };
  return createElement(PlanContext.Provider, { value }, children);
}

export function usePlan(): PlanValue {
  const v = useContext(PlanContext);
  if (!v) throw new Error('usePlan needs <PlanProvider>');
  return v;
}

export { useNow } from './useNow';

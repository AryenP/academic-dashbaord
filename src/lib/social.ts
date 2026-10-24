import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

// Classmates and friends: opt-in per course, stats at each person's share level.

export interface Classmate {
  handle: string;
  display_name: string | null;
  share_level: string;
  is_friend: boolean;
  week_minutes: number | null;
  streak: number | null;
  exam_title: string | null;
  exam_at: string | null;
  studied_min: number | null;
  planned_min: number | null;
  /** Both of you turned on studying together in this course. */
  study_together?: boolean;
}

export interface Friend {
  handle: string;
  display_name: string | null;
  status: 'requested' | 'accepted';
  direction: 'sent' | 'received';
  share_level: string;
  week_minutes: number | null;
  streak: number | null;
  courses: string[];
}

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export async function classmatesOf(code: string): Promise<Classmate[]> {
  if (!supabase) return [];
  return (must(await supabase.rpc('classmates', { p_code: code })) as Classmate[]) ?? [];
}

export const requestFriend = async (handle: string) => {
  if (!supabase) return;
  must(await supabase.rpc('request_friend', { p_handle: handle }));
};
export const respondFriend = async (handle: string, accept: boolean) => {
  if (!supabase) return;
  must(await supabase.rpc('respond_friend', { p_handle: handle, p_accept: accept }));
};
export const removeFriend = async (handle: string) => {
  if (!supabase) return;
  must(await supabase.rpc('remove_friend', { p_handle: handle }));
};

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.rpc('friends_overview');
    setFriends((data as Friend[] | null) ?? []);
  }, [user]);
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    supabase.rpc('friends_overview').then(({ data }) => alive && setFriends((data as Friend[] | null) ?? []));
    return () => {
      alive = false;
    };
  }, [user]);
  return { friends, refresh };
}

/** How many classmates studied today, for the runway's one-line nudge. */
export function usePulse(): number {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    supabase.rpc('classmate_pulse').then(({ data }) => alive && setN(typeof data === 'number' ? data : 0));
    return () => {
      alive = false;
    };
  }, [user]);
  return n;
}

export const name = (p: { display_name: string | null; handle: string }) => p.display_name || p.handle;

// ── Study together ──────────────────────────────────────────────────────────────
// Free-time windows are computed in the database from both runways; only the windows come back.

export interface FreeWindow {
  start_at: string;
  end_at: string;
}

export interface StudyInvite {
  id: string;
  direction: 'sent' | 'received';
  handle: string;
  display_name: string | null;
  course_code: string;
  start_at: string;
  end_at: string;
  status: 'proposed' | 'accepted' | 'declined';
}

export async function sharedFreeTime(handle: string, code: string): Promise<FreeWindow[]> {
  if (!supabase) return [];
  return (
    (must(await supabase.rpc('shared_free_time', { p_handle: handle, p_code: code })) as FreeWindow[]) ?? []
  );
}

export const proposeStudy = async (handle: string, code: string, start: string, end: string) => {
  if (!supabase) return;
  must(await supabase.rpc('propose_study', { p_handle: handle, p_code: code, p_start: start, p_end: end }));
};
export const respondStudy = async (id: string, accept: boolean) => {
  if (!supabase) return;
  must(await supabase.rpc('respond_study', { p_id: id, p_accept: accept }));
};
export const cancelStudy = async (id: string) => {
  if (!supabase) return;
  must(await supabase.rpc('cancel_study', { p_id: id }));
};

export function useStudyInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<StudyInvite[]>([]);
  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.rpc('my_study_invites');
    setInvites((data as StudyInvite[] | null) ?? []);
  }, [user]);
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    supabase
      .rpc('my_study_invites')
      .then(({ data }) => alive && setInvites((data as StudyInvite[] | null) ?? []));
    return () => {
      alive = false;
    };
  }, [user]);
  return { invites, refresh };
}

/** One hour from the start of a window, or the whole window when it is shorter. */
export function hourFrom(w: FreeWindow): FreeWindow {
  const a = Date.parse(w.start_at);
  const b = Math.min(Date.parse(w.end_at), a + 3_600_000);
  return { start_at: new Date(a).toISOString(), end_at: new Date(b).toISOString() };
}

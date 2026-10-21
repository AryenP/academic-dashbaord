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

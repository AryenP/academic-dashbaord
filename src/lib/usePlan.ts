import { useEffect, useState } from 'react';
import snapshot from '../../public/data.json';
import type { PlanData } from './plan';

// The build bundles the plan as it was at build time, so the page draws instantly and works offline.
// The live copy comes from data.json, which the sync Action rebuilds from Google Calendar every 15 minutes.
const SNAP = snapshot as PlanData;
const URL = `${import.meta.env.BASE_URL}data.json`;

export function usePlan(): PlanData {
  const [data, setData] = useState<PlanData>(SNAP);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(`${URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as PlanData;
        if (alive && d && Array.isArray(d.plan)) setData((old) => (old.updated === d.updated ? old : d));
      } catch {
        // offline: keep showing the last plan
      }
    };
    pull();
    const id = setInterval(pull, 5 * 60_000);
    const onVis = () => {
      if (!document.hidden) pull();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return data;
}

/** Current time, re-rendered every `ms` and whenever the tab comes back into view. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, ms);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

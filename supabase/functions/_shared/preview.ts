// The signed-out preview: a calendar read once, with the title rules and the context pass (no AI),
// into the events the runway would draw over the next three weeks. Pure, so it is tested on the
// same fixtures as the sync. Nothing here is stored anywhere.
import { classify, cleanTitle, placeByContext, type ContextEvent, type EventKind } from './classify.ts';
import { parseFeed } from './ical.ts';
import { planTimes } from './sync.ts';
import { atWallTime, localIso } from '../../../src/lib/tz.ts';

export const PREVIEW_DAYS = 21;
export const MAX_PREVIEW_EVENTS = 400;

export interface PreviewEvent {
  title: string;
  start: string; // local wall time with offset
  end: string;
  kind: Exclude<EventKind, 'personal'>;
  course: string | null;
  location: string;
}

export interface Preview {
  name: string | null;
  events: PreviewEvent[];
  courses: { code: string; events: number }[];
  counts: Record<string, number>;
  truncated: boolean;
}

/** A timezone the runtime knows, or UTC. */
export function safeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function preview(text: string, sourceKind: 'ical' | 'canvas', tz: string, now = new Date()): Preview {
  const from = new Date(now.getTime() - 864e5);
  const to = new Date(now.getTime() + PREVIEW_DAYS * 864e5);
  const feed = parseFeed(text, from, to);
  const occ = feed.events.slice(0, MAX_PREVIEW_EVENTS * 2);
  // Two passes: the codes the feed names outright help place the ones it only numbers ("(140A)").
  const first = occ.map((o) => classify({ title: o.title, allDay: o.allDay, uid: o.uid, sourceKind }));
  const known = [...new Set(first.map((r) => r.course).filter((c): c is string => !!c && / /.test(c)))];
  const read = occ.map((o) =>
    classify({ title: o.title, allDay: o.allDay, uid: o.uid, sourceKind, knownCourses: known }),
  );
  const startOf = (i: number) => (occ[i].allDay ? atWallTime(occ[i].start, 0, 0, tz) : occ[i].start);
  const ctx: ContextEvent[] = read.map((r, i) => ({
    key: String(i),
    start: startOf(i),
    kind: r.kind,
    course: r.course,
    confidence: r.confidence,
    sourceId: 'preview',
    sourceKind,
  }));
  for (const [key, r] of placeByContext(ctx)) read[Number(key)] = r;

  const events: PreviewEvent[] = [];
  const counts: Record<string, number> = {};
  const courses = new Map<string, number>();
  occ.forEach((o, i) => {
    const r = read[i];
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    if (r.course) courses.set(r.course, (courses.get(r.course) ?? 0) + 1);
    if (r.kind === 'personal') return;
    const t = planTimes(
      { start_at: startOf(i), end_at: o.allDay ? atWallTime(o.end, 0, 0, tz) : o.end, all_day: o.allDay },
      r.kind,
      tz,
    );
    if (!t || Date.parse(t.end_at) < from.getTime()) return;
    events.push({
      title: cleanTitle(o.title).slice(0, 200),
      start: localIso(t.start_at, tz),
      end: localIso(t.end_at, tz),
      kind: r.kind,
      course: r.course,
      location: o.location.slice(0, 200),
    });
  });
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return {
    name: feed.name,
    events: events.slice(0, MAX_PREVIEW_EVENTS),
    courses: [...courses.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, events: n })),
    counts,
    truncated: feed.truncated || events.length > MAX_PREVIEW_EVENTS,
  };
}

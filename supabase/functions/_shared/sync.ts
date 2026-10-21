// One source, one sync: fetch the feed, read every occurrence, write events, and keep the person's
// plan items in step with them. Pure over a Store so it can be tested with a fake database.
import { classify, cleanTitle, type EventKind } from './classify.ts';
import { occurrenceHash, parseFeed, type Occurrence } from './ical.ts';
import { checkUrl, fetchFeed, HttpError, NotACalendarLike, TooLarge } from './net.ts';
import { atWallTime, localIso } from '../../../src/lib/tz.ts';

export interface Source {
  id: string;
  user_id: string;
  kind: 'ical' | 'canvas' | 'ics_upload';
  etag: string | null;
  last_modified: string | null;
}

export interface EventRow {
  id: string;
  uid: string;
  recurrence_id: string;
  hash: string;
  kind: string;
  course_code: string | null;
  override: { kind?: string; course_code?: string | null } | null;
  plan_item_id: string | null;
  deleted_at: string | null;
}

export interface EventWrite {
  user_id: string;
  source_id: string;
  uid: string;
  recurrence_id: string;
  hash: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  kind: string;
  course_code: string | null;
  confidence: number;
  plan_item_id: string | null;
  deleted_at: null;
}

export interface PlanWrite {
  user_id: string;
  source_id: string;
  course_id: string | null;
  kind: Exclude<EventKind, 'personal'>;
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  source: 'calendar';
}

export interface Store {
  sourceUrl(sourceId: string): Promise<string | null>;
  timezone(userId: string): Promise<string>;
  events(sourceId: string): Promise<EventRow[]>;
  /** Upserts by (source_id, uid, recurrence_id) and returns ids in order. */
  upsertEvents(rows: EventWrite[]): Promise<string[]>;
  markDeleted(eventIds: string[]): Promise<void>;
  courses(userId: string): Promise<{ id: string; code: string; color: number }[]>;
  addCourse(
    userId: string,
    code: string,
    color: number,
  ): Promise<{ id: string; code: string; color: number }>;
  /** An existing plan item of this person with the same title within 5 minutes of this start. */
  duplicate(userId: string, title: string, startAt: string): Promise<string | null>;
  insertPlanItem(row: PlanWrite): Promise<string>;
  updatePlanItem(id: string, row: Partial<PlanWrite>): Promise<void>;
  /** Removes plan items of this source that no live event points at any more. */
  pruneOrphans(sourceId: string): Promise<number>;
  finish(
    sourceId: string,
    ok: boolean,
    error: string | null,
    count: number | null,
    etag: string | null,
    lastModified: string | null,
  ): Promise<void>;
}

export const WINDOW_BACK_DAYS = 30;
export const WINDOW_AHEAD_DAYS = 180;

/** Friendly words for what went wrong, for Settings → Sources. */
export function describeError(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 404)
      return "The address wasn't found (HTTP 404). Google's public address only works for a public calendar; use the secret one.";
    if (e.status === 401 || e.status === 403)
      return `The calendar refused the request (HTTP ${e.status}). The address may have been reset.`;
    return `The calendar's server answered HTTP ${e.status}.`;
  }
  if (e instanceof TooLarge) return 'The feed is larger than 5 MB.';
  if (e instanceof NotACalendarLike)
    return 'The address returned a web page, not a calendar. For Google, copy the secret address in iCal format, not the embed link.';
  if (e instanceof DOMException && e.name === 'TimeoutError')
    return "The calendar's server didn't answer in 15 seconds.";
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Turns an occurrence into the times a plan item should have, in the person's timezone. */
export function planTimes(
  o: Occurrence,
  kind: EventKind,
  tz: string,
): { start_at: string; end_at: string } | null {
  if (!o.allDay) return { start_at: o.start, end_at: o.end };
  // An all-day deadline is due at the end of that day; an all-day exam fills the study day.
  // Other all-day events (holidays, "no class") aren't drawn.
  if (kind === 'deadline')
    return { start_at: atWallTime(o.start, 23, 0, tz), end_at: atWallTime(o.start, 23, 59, tz) };
  if (kind === 'exam')
    return { start_at: atWallTime(o.start, 8, 0, tz), end_at: atWallTime(o.start, 22, 0, tz) };
  return null;
}

const DRAWN: ReadonlySet<string> = new Set(['study', 'deadline', 'exam', 'class', 'commitment']);

export interface SyncResult {
  ok: boolean;
  error?: string;
  unchanged?: boolean;
  events?: number;
  planned?: number;
}

/** Syncs one source. `text` is given for an uploaded .ics; otherwise the feed is fetched. */
export async function syncSource(
  store: Store,
  src: Source,
  opts: { now?: Date; text?: string; fetchImpl?: typeof fetch } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  try {
    let text = opts.text;
    let etag = src.etag;
    let lastModified = src.last_modified;
    if (text == null) {
      const url = await store.sourceUrl(src.id);
      if (!url) throw new Error('The calendar address is missing. Remove this source and add it again.');
      const c = checkUrl(url);
      if ('error' in c) throw new Error(`The address can't be used (${c.error}).`);
      const r = await fetchFeed(c.url, { etag, lastModified }, opts.fetchImpl);
      if (r.status === 304) {
        await store.finish(src.id, true, null, null, etag, lastModified);
        return { ok: true, unchanged: true };
      }
      if (/text\/html/i.test(r.contentType) && !/BEGIN:VCALENDAR/i.test(r.text.slice(0, 4000)))
        throw new NotACalendarLike();
      text = r.text;
      etag = r.etag;
      lastModified = r.lastModified;
    }
    const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 864e5);
    const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 864e5);
    const feed = parseFeed(text, from, to);
    const tz = await store.timezone(src.user_id);
    const existing = await store.events(src.id);
    const byKey = new Map(existing.map((e) => [`${e.uid}\u0001${e.recurrence_id}`, e]));
    const courses = await store.courses(src.user_id);
    const courseId = async (code: string | null) => {
      if (!code) return null;
      let c = courses.find((x) => x.code === code);
      if (!c) {
        const used = new Set(courses.map((x) => x.color));
        let color = 6;
        for (let n = 1; n < 6; n++)
          if (!used.has(n)) {
            color = n;
            break;
          }
        c = await store.addCourse(src.user_id, code, color);
        courses.push(c);
      }
      return c.id;
    };

    const writes: EventWrite[] = [];
    const planned: ({
      occ: Occurrence;
      kind: EventKind;
      course: string | null;
      prev: EventRow | undefined;
    } | null)[] = [];
    const seen = new Set<string>();
    for (const o of feed.events) {
      const key = `${o.uid}\u0001${o.recurrenceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = byKey.get(key);
      const hash = await occurrenceHash(o);
      let kind: string;
      let course: string | null;
      let confidence: number;
      if (prev && prev.hash === hash && !prev.deleted_at) {
        kind = prev.kind;
        course = prev.course_code;
        confidence = 1;
      } else {
        const r = classify({ title: o.title, allDay: o.allDay, uid: o.uid, sourceKind: src.kind });
        kind = r.kind;
        course = r.course;
        confidence = r.confidence;
      }
      if (prev?.override) {
        if (prev.override.kind) kind = prev.override.kind;
        if (prev.override.course_code !== undefined) course = prev.override.course_code;
      }
      writes.push({
        user_id: src.user_id,
        source_id: src.id,
        uid: o.uid,
        recurrence_id: o.recurrenceId,
        hash,
        title: o.title.slice(0, 200),
        start_at: o.allDay ? atWallTime(o.start, 0, 0, tz) : o.start,
        end_at: o.allDay ? atWallTime(o.end, 0, 0, tz) : o.end,
        all_day: o.allDay,
        location: o.location,
        kind,
        course_code: course,
        confidence: prev && prev.hash === hash ? Number(confidence) : confidence,
        plan_item_id: prev?.plan_item_id ?? null,
        deleted_at: null,
      });
      planned.push(DRAWN.has(kind) ? { occ: o, kind: kind as EventKind, course, prev } : null);
    }
    const ids = await store.upsertEvents(writes);

    // Plan items: create, update or link one per drawn event.
    let plannedCount = 0;
    const linkWrites: EventWrite[] = [];
    for (let i = 0; i < writes.length; i++) {
      const p = planned[i];
      const w = writes[i];
      if (!p) continue;
      const times = planTimes(p.occ, p.kind, tz);
      if (!times) continue;
      const row: PlanWrite = {
        user_id: src.user_id,
        source_id: src.id,
        course_id: await courseId(p.course),
        kind: p.kind as PlanWrite['kind'],
        title: cleanTitle(p.occ.title).slice(0, 200),
        ...times,
        location: p.occ.location,
        source: 'calendar',
      };
      const unchanged = p.prev && p.prev.hash === w.hash && !p.prev.deleted_at && p.prev.plan_item_id;
      if (unchanged) {
        plannedCount++;
        continue;
      }
      if (p.prev?.plan_item_id) {
        await store.updatePlanItem(p.prev.plan_item_id, row);
        plannedCount++;
        continue;
      }
      const dup = await store.duplicate(src.user_id, row.title, row.start_at);
      const planId = dup ?? (await store.insertPlanItem(row));
      linkWrites.push({ ...w, plan_item_id: planId });
      plannedCount++;
    }
    if (linkWrites.length) await store.upsertEvents(linkWrites);

    // Anything the feed no longer has.
    const gone = existing
      .filter((e) => !e.deleted_at && !seen.has(`${e.uid}\u0001${e.recurrence_id}`))
      .map((e) => e.id);
    if (gone.length) await store.markDeleted(gone);
    await store.pruneOrphans(src.id);
    void ids;
    await store.finish(src.id, true, null, writes.length, etag, lastModified);
    return { ok: true, events: writes.length, planned: plannedCount };
  } catch (e) {
    const msg = describeError(e);
    await store.finish(src.id, false, msg, null, null, null);
    return { ok: false, error: msg };
  }
}

/** For validate-source: what a feed contains, without storing anything. */
export function summarize(text: string, sourceKind: Source['kind'], now = new Date()) {
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 864e5);
  const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 864e5);
  const feed = parseFeed(text, from, to);
  const counts: Record<string, number> = {};
  const courses = new Map<string, number>();
  for (const o of feed.events) {
    const r = classify({ title: o.title, allDay: o.allDay, uid: o.uid, sourceKind });
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    if (r.course) courses.set(r.course, (courses.get(r.course) ?? 0) + 1);
  }
  return {
    name: feed.name,
    prodId: feed.prodId,
    events: feed.events.length,
    truncated: feed.truncated,
    counts,
    courses: [...courses.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, events: n })),
    sample: feed.events
      .slice(0, 5)
      .map((o) => ({ title: o.title, start: o.allDay ? o.start : localIso(o.start, 'UTC') })),
  };
}

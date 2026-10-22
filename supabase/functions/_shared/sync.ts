// One source, one sync: fetch the feed, read every occurrence, write events, and keep the person's
// plan items in step with them. Pure over a Store so it can be tested with a fake database.
//
// What an event *is* (kind, course) comes from, in order: the person's override, the AI reading
// (when it was made for the current version of the event), the title rules. `materialize` turns
// that into plan items and is shared by the sync and by the AI pass.
import { classify, cleanTitle, placeByContext, type ContextEvent, type EventKind } from './classify.ts';
import { occurrenceHash, parseFeed } from './ical.ts';
import { checkUrl, fetchFeed, HttpError, NotACalendarLike, TooLarge } from './net.ts';
import { effective } from '../../../src/lib/reading.ts';
import { atWallTime, localIso } from '../../../src/lib/tz.ts';

export interface Source {
  id: string;
  user_id: string;
  kind: 'ical' | 'canvas' | 'ics_upload';
  etag: string | null;
  last_modified: string | null;
}

/** An event row as stored. */
export interface EventRow {
  id: string;
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
  override: { kind?: string; course_code?: string | null } | null;
  ai_hash: string | null;
  ai_kind: string | null;
  ai_course_code: string | null;
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
  /** Every event row of the source, deleted ones included. */
  events(sourceId: string): Promise<EventRow[]>;
  /** The person's live events across all their sources, for reading one feed in the light of the others. */
  userEvents(userId: string): Promise<(EventRow & { source_id: string })[]>;
  /** Upserts by (source_id, uid, recurrence_id) and returns ids in order. */
  upsertEvents(rows: EventWrite[]): Promise<string[]>;
  linkEvents(links: { id: string; plan_item_id: string | null }[]): Promise<void>;
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

/** Friendly words for what went wrong, for Settings → Calendars. */
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

/** The times a plan item should have, in the person's timezone. `null`: not drawn. */
export function planTimes(
  e: { start_at: string; end_at: string; all_day: boolean },
  kind: EventKind,
  tz: string,
): { start_at: string; end_at: string } | null {
  if (!e.all_day) return { start_at: e.start_at, end_at: e.end_at };
  // An all-day deadline is due at the end of that day; an all-day exam fills the study day.
  // Other all-day events (holidays, "no class") aren't drawn.
  const day = localIso(e.start_at, tz).slice(0, 10);
  if (kind === 'deadline')
    return { start_at: atWallTime(day, 23, 0, tz), end_at: atWallTime(day, 23, 59, tz) };
  if (kind === 'exam') return { start_at: atWallTime(day, 8, 0, tz), end_at: atWallTime(day, 22, 0, tz) };
  return null;
}

const DRAWN: ReadonlySet<string> = new Set(['study', 'deadline', 'exam', 'class', 'commitment']);

export { effective } from '../../../src/lib/reading.ts';

/** One event as `materialize` needs it. */
export interface MaterialRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  kind: string;
  course: string | null;
  plan_item_id: string | null;
  /** True when nothing about the event or its reading changed since its plan item was made. */
  settled: boolean;
}

/** Creates, updates, links or unlinks one plan item per event. Returns how many are drawn. */
export async function materialize(
  store: Store,
  src: Source,
  tz: string,
  rows: MaterialRow[],
): Promise<number> {
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

  let drawn = 0;
  const links: { id: string; plan_item_id: string | null }[] = [];
  for (const r of rows) {
    const times = DRAWN.has(r.kind) ? planTimes(r, r.kind as EventKind, tz) : null;
    if (!times) {
      // Not drawn (personal, or an all-day class): let go of any plan item it had.
      if (r.plan_item_id) links.push({ id: r.id, plan_item_id: null });
      continue;
    }
    drawn++;
    if (r.settled && r.plan_item_id) continue;
    const row: PlanWrite = {
      user_id: src.user_id,
      source_id: src.id,
      course_id: await courseId(r.course),
      kind: r.kind as PlanWrite['kind'],
      title: cleanTitle(r.title).slice(0, 200),
      ...times,
      location: r.location,
      source: 'calendar',
    };
    if (r.plan_item_id) {
      await store.updatePlanItem(r.plan_item_id, row);
      continue;
    }
    const dup = await store.duplicate(src.user_id, row.title, row.start_at);
    links.push({ id: r.id, plan_item_id: dup ?? (await store.insertPlanItem(row)) });
  }
  if (links.length) await store.linkEvents(links);
  await store.pruneOrphans(src.id);
  return drawn;
}

/** Rebuilds a source's plan items from its stored events (after the AI pass or a review). */
export async function rebuildPlan(store: Store, src: Source): Promise<number> {
  const tz = await store.timezone(src.user_id);
  const rows = (await store.events(src.id))
    .filter((e) => !e.deleted_at)
    .map((e): MaterialRow => {
      const eff = effective(e);
      return { ...e, kind: eff.kind, course: eff.course, settled: false };
    });
  return materialize(store, src, tz, rows);
}

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
  opts: { now?: Date; text?: string; fetchImpl?: typeof fetch; force?: boolean } = {},
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
      const cond = opts.force ? {} : { etag, lastModified };
      const r = await fetchFeed(c.url, cond, opts.fetchImpl);
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
    const known = (await store.courses(src.user_id)).map((c) => c.code);

    const writes: EventWrite[] = [];
    const prevs: (EventRow | undefined)[] = [];
    const seen = new Set<string>();
    for (const o of feed.events) {
      const key = `${o.uid}\u0001${o.recurrenceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = byKey.get(key);
      const hash = await occurrenceHash(o);
      const same = !!prev && prev.hash === hash;
      const r = same
        ? { kind: prev.kind, course: prev.course_code, confidence: Number(prev.confidence) }
        : classify({
            title: o.title,
            allDay: o.allDay,
            uid: o.uid,
            sourceKind: src.kind,
            knownCourses: known,
          });
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
        kind: r.kind,
        course_code: r.course,
        confidence: r.confidence,
        plan_item_id: prev?.plan_item_id ?? null,
        deleted_at: null,
      });
      prevs.push(prev);
    }
    // What the title doesn't say, the other events might: the same exam from Canvas, the exam a
    // study block prepares for. Only fills a missing course; the AI reviews anything placed this way.
    const others = (await store.userEvents(src.user_id)).filter((e) => e.source_id !== src.id);
    const ctx: ContextEvent[] = [
      ...writes.map((w, i) => ({
        key: `w${i}`,
        start: w.start_at,
        kind: w.kind,
        course: w.course_code,
        confidence: w.confidence,
        sourceId: src.id,
        sourceKind: src.kind,
      })),
      ...others.map((e) => {
        const eff = effective(e);
        return { key: `o${e.id}`, start: e.start_at, kind: eff.kind, course: eff.course, confidence: 1 };
      }),
    ];
    for (const [key, r] of placeByContext(ctx)) {
      if (!key.startsWith('w')) continue;
      const w = writes[Number(key.slice(1))];
      w.course_code = r.course;
      w.confidence = r.confidence;
    }
    const ids = await store.upsertEvents(writes);

    const rows: MaterialRow[] = writes.map((w, i) => {
      const prev = prevs[i];
      const settled = !!prev && prev.hash === w.hash && !prev.deleted_at;
      const eff = effective({
        hash: w.hash,
        kind: w.kind,
        course_code: w.course_code,
        override: prev?.override ?? null,
        ai_hash: prev?.ai_hash,
        ai_kind: prev?.ai_kind,
        ai_course_code: prev?.ai_course_code,
      });
      return {
        id: ids[i],
        title: w.title,
        start_at: w.start_at,
        end_at: w.end_at,
        all_day: w.all_day,
        location: w.location,
        kind: eff.kind,
        course: eff.course,
        plan_item_id: w.plan_item_id,
        settled,
      };
    });

    // Anything the feed no longer has.
    const gone = existing
      .filter((e) => !e.deleted_at && !seen.has(`${e.uid}\u0001${e.recurrence_id}`))
      .map((e) => e.id);
    if (gone.length) await store.markDeleted(gone);
    const planned = await materialize(store, src, tz, rows);
    await store.finish(src.id, true, null, writes.length, etag, lastModified);
    return { ok: true, events: writes.length, planned };
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

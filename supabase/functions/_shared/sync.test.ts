import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  effective,
  planTimes,
  rebuildPlan,
  summarize,
  syncSource,
  type EventRow,
  type EventWrite,
  type PlanWrite,
  type Store,
} from './sync.ts';

const google = Deno.readTextFileSync(new URL('./fixtures/google.ics', import.meta.url));
const canvas = Deno.readTextFileSync(new URL('./fixtures/canvas.ics', import.meta.url));
const NOW = new Date('2026-10-21T18:00:00Z');

/** An in-memory database with the same shape the real store exposes. */
function fakeStore(url: string | null = 'https://calendar.example/secret.ics') {
  let nextId = 1;
  const id = (p: string) => `${p}${nextId++}`;
  type Row = EventRow & EventWrite;
  const events = new Map<string, Row>();
  const plans = new Map<string, PlanWrite & { id: string }>();
  const courses: { id: string; code: string; color: number }[] = [];
  const finished: unknown[][] = [];
  const key = (r: { source_id: string; uid: string; recurrence_id: string }) =>
    `${r.source_id}|${r.uid}|${r.recurrence_id}`;
  const store: Store = {
    sourceUrl: async () => url,
    timezone: async () => 'America/Los_Angeles',
    events: async (sourceId) => [...events.values()].filter((e) => e.source_id === sourceId),
    userEvents: async (userId) => [...events.values()].filter((e) => e.user_id === userId && !e.deleted_at),
    upsertEvents: async (rows) =>
      rows.map((r) => {
        const k = key(r);
        const prev = events.get(k);
        const row = {
          override: null,
          ai_hash: null,
          ai_kind: null,
          ai_course_code: null,
          ...prev,
          ...r,
          id: prev?.id ?? id('ev'),
        } as Row;
        events.set(k, row);
        return row.id;
      }),
    linkEvents: async (links) => {
      for (const l of links)
        for (const e of events.values()) if (e.id === l.id) e.plan_item_id = l.plan_item_id;
    },
    markDeleted: async (ids) => {
      for (const e of events.values())
        if (ids.includes(e.id)) (e as { deleted_at: string | null }).deleted_at = NOW.toISOString();
    },
    courses: async () => [...courses],
    addCourse: async (_u, code, color) => {
      const c = { id: id('c'), code, color };
      courses.push(c);
      return c;
    },
    duplicate: async (_u, title, startAt) => {
      for (const p of plans.values())
        if (p.title === title && Math.abs(Date.parse(p.start_at) - Date.parse(startAt)) <= 5 * 60_000)
          return p.id;
      return null;
    },
    insertPlanItem: async (row) => {
      const p = { ...row, id: id('p') };
      plans.set(p.id, p);
      return p.id;
    },
    updatePlanItem: async (pid, row) => {
      plans.set(pid, { ...plans.get(pid)!, ...row });
    },
    pruneOrphans: async (sourceId) => {
      let n = 0;
      for (const p of [...plans.values()]) {
        if (p.source_id !== sourceId) continue;
        const live = [...events.values()].some((e) => e.plan_item_id === p.id && !e.deleted_at);
        if (!live) {
          plans.delete(p.id);
          n++;
        }
      }
      return n;
    },
    finish: async (...args) => void finished.push(args),
  };
  return { store, events, plans, courses, finished };
}

const SRC = { id: 's1', user_id: 'u1', kind: 'ical' as const, etag: null, last_modified: null };
const serve = (body: string, init: ResponseInit = {}) =>
  ((_: URL | RequestInfo) =>
    Promise.resolve(
      new Response(init.status === 304 ? null : body, {
        headers: { 'content-type': 'text/calendar', etag: 'W/"v1"' },
        ...init,
      }),
    )) as typeof fetch;

Deno.test('first sync: events, courses with colors, and plan items for everything drawn', async () => {
  const f = fakeStore();
  const r = await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google) });
  assertEquals(r.ok, true);
  assert(r.events! >= 10);
  assertEquals(
    f.courses.map((c) => `${c.code}:${c.color}`),
    ['DSC 102:1', 'DSC 140A:2', 'CSE 151A:3'],
  );
  const kinds = [...f.plans.values()].reduce(
    (m, p) => ({ ...m, [p.kind]: (m[p.kind] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  assertEquals(kinds.exam, 2);
  assertEquals(kinds.deadline, 1);
  assertEquals(kinds.commitment, 1);
  assert(kinds.class >= 6);
  assertEquals(kinds.study, 1); // "📚 140A …" has no department: drawn in gray until Phase 2 groups it
  // The all-day deadline lands at 11 PM Pacific that day.
  const hw = [...f.plans.values()].find((p) => p.title === 'dsc140a HW 2 due')!;
  assertEquals(hw.start_at, '2026-10-27T06:00:00.000Z');
  assertEquals(hw.end_at, '2026-10-27T06:59:00.000Z');
  // Dinner is personal: an event row, no plan item.
  const dinner = [...f.events.values()].find((e) => e.uid === 'dinner@google.com')!;
  assertEquals(dinner.kind, 'personal');
  assertEquals(dinner.plan_item_id, null);
  assertEquals(f.finished.at(-1), ['s1', true, null, r.events, 'W/"v1"', null]);
});

Deno.test(
  'second sync with 304 changes nothing; a changed title updates the plan item in place',
  async () => {
    const f = fakeStore();
    await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google) });
    const before = new Map(f.plans);
    const r2 = await syncSource(
      f.store,
      { ...SRC, etag: 'W/"v1"' },
      { now: NOW, fetchImpl: serve('', { status: 304 }) },
    );
    assertEquals(r2, { ok: true, unchanged: true });
    assertEquals(f.plans.size, before.size);

    const renamed = google.replace('SUMMARY:DSC 140A Midterm 1', 'SUMMARY:DSC 140A Midterm 1 (new room)');
    await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(renamed) });
    assertEquals(f.plans.size, before.size);
    const mt = [...f.plans.values()].find(
      (p) => p.kind === 'exam' && p.title.startsWith('DSC 140A Midterm 1'),
    )!;
    assertEquals(mt.title, 'DSC 140A Midterm 1 (new room)');
  },
);

Deno.test('an event that leaves the feed is marked deleted and its plan item goes', async () => {
  const f = fakeStore();
  await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google) });
  const without = google.replace(
    /BEGIN:VEVENT\nDTSTART;TZID=America\/Los_Angeles:20261026T170000[\s\S]*?END:VEVENT\n/,
    '',
  );
  await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(without) });
  const mt = [...f.events.values()].find((e) => e.uid === 'mt1@google.com')!;
  assert(mt.deleted_at);
  assertEquals(
    [...f.plans.values()].some((p) => p.title === 'DSC 140A Midterm 1'),
    false,
  );
});

Deno.test("a person's override survives re-syncs", async () => {
  const f = fakeStore();
  await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google) });
  const dinner = [...f.events.values()].find((e) => e.uid === 'dinner@google.com')!;
  dinner.override = { kind: 'commitment' };
  await syncSource(f.store, SRC, {
    now: NOW,
    fetchImpl: serve(google.replace('Dinner with Sam', 'Dinner with Sam!')),
  });
  const again = [...f.events.values()].find((e) => e.uid === 'dinner@google.com')!;
  assertEquals(again.kind, 'personal'); // the rules' reading stays on the row…
  assertEquals(effective(again).kind, 'commitment'); // …the override is what counts
  assert(again.plan_item_id);
  assertEquals(f.plans.get(again.plan_item_id!)?.kind, 'commitment');
});

Deno.test('the same deadline from Canvas and Google becomes one plan item', async () => {
  const f = fakeStore();
  await syncSource(f.store, { ...SRC, kind: 'canvas' }, { now: NOW, fetchImpl: serve(canvas) });
  const n = f.plans.size;
  assertEquals(n, 3); // two HW 2 rows in the same feed collapse by title + time, plus checkpoint and midterm
  // Google has "dsc140a HW 2 due" as all-day (11 PM), Canvas has HW 2 at 11:59 PM: different titles, so
  // both stay; but the same title at the same minute from another source is linked, not duplicated.
  const g = { ...SRC, id: 's2' };
  const sameAsCanvas = google
    .replace('SUMMARY:dsc140a HW 2 due', 'SUMMARY:HW 2 [DSC 140A]')
    .replace(
      'DTSTART;VALUE=DATE:20261026\nDTEND;VALUE=DATE:20261027',
      'DTSTART:20261026T065900Z\nDTEND:20261026T070000Z',
    );
  await syncSource(f.store, g, { now: NOW, fetchImpl: serve(sameAsCanvas) });
  const hw = [...f.plans.values()].filter((p) => p.title === 'HW 2');
  assertEquals(hw.length, 1);
  const linked = [...f.events.values()].filter((e) => e.plan_item_id === hw[0].id && !e.deleted_at);
  assertEquals(linked.length, 3);
});

Deno.test('a study block with no course is placed by an exam from another calendar', async () => {
  const f = fakeStore();
  await syncSource(f.store, { ...SRC, kind: 'canvas' }, { now: NOW, fetchImpl: serve(canvas) });
  // Google: the midterm loses its course and the study block its number; Canvas has DSC 102's
  // midterm on Oct 28, six days after the block.
  const g = google
    .replace('SUMMARY:DSC 140A Midterm 1', 'SUMMARY:Midterm 1')
    .replace('SUMMARY:📚 140A practice problems + cheat sheet #1', 'SUMMARY:📚 final review');
  await syncSource(f.store, { ...SRC, id: 's2' }, { now: NOW, fetchImpl: serve(g) });
  const study = [...f.events.values()].find((e) => e.title === '📚 final review')!;
  assertEquals(study.course_code, 'DSC 102');
  assertEquals(study.confidence, 0.4);
  const item = f.plans.get(study.plan_item_id!)!;
  assertEquals(f.courses.find((c) => c.id === item.course_id)?.code, 'DSC 102');
  // The exam itself has nothing at its time in Canvas: left for the AI.
  const mt = [...f.events.values()].find((e) => e.title === 'Midterm 1')!;
  assertEquals(mt.course_code, null);
});

Deno.test('errors are recorded in plain words and nothing else changes', async () => {
  const f = fakeStore();
  const r = await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve('', { status: 404 }) });
  assertEquals(r.ok, false);
  assert(r.error!.includes('404'));
  assertEquals(f.finished.at(-1)?.[1], false);
  const html = await syncSource(f.store, SRC, {
    now: NOW,
    fetchImpl: serve('<!doctype html><html>Google Calendar</html>', {
      headers: { 'content-type': 'text/html' },
    }),
  });
  assert(html.error!.includes('web page'));
  const missing = await syncSource(fakeStore(null).store, SRC, { now: NOW, fetchImpl: serve(google) });
  assert(missing.error!.includes('missing'));
});

Deno.test('summarize reports courses and counts for the connect screen', () => {
  const s = summarize(canvas, 'canvas', NOW);
  assertEquals(s.events, 4);
  assertEquals(
    s.courses.map((c) => c.code),
    ['DSC 140A', 'DSC 102', 'DSC 106'],
  );
  assertEquals(s.counts, { deadline: 3, exam: 1 });
});

Deno.test('planTimes: all-day exams fill the day, other all-day events are not drawn', () => {
  const o = { start_at: '2026-10-26T07:00:00.000Z', end_at: '2026-10-27T07:00:00.000Z', all_day: true };
  assertEquals(planTimes(o, 'exam', 'America/Los_Angeles'), {
    start_at: '2026-10-26T15:00:00.000Z',
    end_at: '2026-10-27T05:00:00.000Z',
  });
  assertEquals(planTimes(o, 'class', 'America/Los_Angeles'), null);
});

Deno.test('effective: override beats the AI, the AI beats the rules, a stale AI reading is ignored', () => {
  const base = { hash: 'h1', kind: 'personal', course_code: null, override: null };
  assertEquals(effective(base).by, 'rules');
  const ai = { ...base, ai_hash: 'h1', ai_kind: 'commitment', ai_course_code: null };
  assertEquals(effective(ai), { kind: 'commitment', course: null, by: 'ai' });
  assertEquals(effective({ ...ai, ai_hash: 'old' }).by, 'rules');
  assertEquals(effective({ ...ai, override: { kind: 'study', course_code: 'DSC 140A' } }), {
    kind: 'study',
    course: 'DSC 140A',
    by: 'override',
  });
});

Deno.test(
  'an AI reading turns a personal event into a drawn one on rebuild, and a re-sync keeps it',
  async () => {
    const f = fakeStore();
    await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google) });
    const before = f.plans.size;
    const dinner = [...f.events.values()].find((e) => e.uid === 'dinner@google.com')!;
    dinner.ai_hash = dinner.hash;
    dinner.ai_kind = 'commitment';
    await rebuildPlan(f.store, SRC);
    assertEquals(f.plans.size, before + 1);
    assert(dinner.plan_item_id);
    await syncSource(
      f.store,
      { ...SRC, etag: 'W/"v1"' },
      { now: NOW, fetchImpl: serve('', { status: 304 }) },
    );
    await syncSource(f.store, SRC, { now: NOW, fetchImpl: serve(google), force: true });
    assertEquals(f.plans.size, before + 1);
    const study = [...f.events.values()].find((e) => e.uid === 'study1@google.com')!;
    study.ai_hash = study.hash;
    study.ai_kind = 'study';
    study.ai_course_code = 'DSC 140A';
    await rebuildPlan(f.store, SRC);
    const item = f.plans.get(study.plan_item_id!)!;
    assertEquals(f.courses.find((c) => c.id === item.course_id)?.code, 'DSC 140A');
    study.override = { kind: 'personal' };
    await rebuildPlan(f.store, SRC);
    assertEquals(study.plan_item_id, null);
    assertEquals(f.plans.size, before);
  },
);

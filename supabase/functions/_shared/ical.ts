// Reads an iCalendar feed into plain occurrences inside a window. Recurring events are expanded;
// all-day events become a date (the sync turns that into a time in the person's timezone).
import ICAL from 'npm:ical.js@2.1.0';

export interface Occurrence {
  uid: string;
  recurrenceId: string; // '' for single events
  title: string;
  start: string; // ISO instant, or YYYY-MM-DD when allDay
  end: string;
  allDay: boolean;
  location: string;
}

export interface Feed {
  name: string | null;
  prodId: string | null;
  events: Occurrence[];
  /** True when a recurring event or the feed hit the cap. */
  truncated: boolean;
}

export class NotACalendar extends Error {}

const MAX_EVENTS = 2000;
const MAX_PER_RULE = 400;

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Parses `text` and expands occurrences that overlap [from, to). Throws NotACalendar. */
export function parseFeed(text: string, from: Date, to: Date): Feed {
  const head = text.slice(0, 4000);
  if (/^\s*</.test(head) || !/BEGIN:VCALENDAR/i.test(head)) throw new NotACalendar('not an iCalendar file');
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch (e) {
    throw new NotACalendar(e instanceof Error ? e.message : 'could not parse');
  }
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(new ICAL.Timezone(tz));
    } catch {
      // a broken VTIMEZONE: events in it fall back to floating time
    }
  }
  const name = clean(comp.getFirstPropertyValue('x-wr-calname')) || null;
  const prodId = clean(comp.getFirstPropertyValue('prodid')) || null;
  const lo = ICAL.Time.fromJSDate(from, true);
  const hi = ICAL.Time.fromJSDate(to, true);
  const events: Occurrence[] = [];
  let truncated = false;

  // Overridden occurrences (RECURRENCE-ID) are attached to their master by ical.js when the
  // master is registered first; collect masters, then exceptions.
  const vevents = comp.getAllSubcomponents('vevent');
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    if (!ev.uid) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex);
    else push(ex, ex.startDate, ex.endDate, ex.recurrenceId?.toString() ?? '');
  }

  function push(ev: ICAL.Event, s: ICAL.Time, e: ICAL.Time, recurrenceId: string) {
    if (events.length >= MAX_EVENTS) {
      truncated = true;
      return;
    }
    const allDay = !!s.isDate;
    const sj = s.toJSDate();
    let ej = e ? e.toJSDate() : new Date(sj.getTime() + (allDay ? 864e5 : 3_600_000));
    if (ej <= sj) ej = new Date(sj.getTime() + (allDay ? 864e5 : 60_000));
    if (ej <= from || sj >= to) return;
    events.push({
      uid: ev.uid,
      recurrenceId,
      title: clean(ev.summary) || '(untitled)',
      start: allDay ? s.toString().slice(0, 10) : sj.toISOString(),
      end: allDay ? (e ?? s).toString().slice(0, 10) : ej.toISOString(),
      allDay,
      location: clean(ev.location).slice(0, 200),
    });
  }

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate, '');
      continue;
    }
    let n = 0;
    try {
      const it = ev.iterator();
      let next: ICAL.Time | null;
      while ((next = it.next())) {
        if (next.compare(hi) >= 0) break;
        const d = ev.getOccurrenceDetails(next);
        if (d.endDate.compare(lo) <= 0) continue;
        push(d.item, d.startDate, d.endDate, d.recurrenceId.toString());
        if (++n >= MAX_PER_RULE) {
          truncated = true;
          break;
        }
      }
    } catch {
      // a rule ical.js can't iterate: keep the first instance so nothing silently disappears
      push(ev, ev.startDate, ev.endDate, '');
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));
  return { name, prodId, events, truncated };
}

/** A stable fingerprint of what the feed says about one occurrence. */
export async function occurrenceHash(o: Occurrence): Promise<string> {
  const data = new TextEncoder().encode(
    [o.title, o.start, o.end, o.allDay ? 1 : 0, o.location].join('\u0001'),
  );
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

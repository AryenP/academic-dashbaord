// The "Patterns" sentences on Stats: what tends to go with a good session, from the numbers the
// signal_patterns function returns (sessions and phone signals of the last 60 days). Plain words,
// always "tends to", never "because": a few weeks of one person's data is a pattern, not proof.
// Nothing is said before a week of days with sessions, and each comparison needs both sides to
// have a few sessions and a difference worth mentioning.

export interface PatternFacts {
  days: number;
  late: { n: number; avg: number | null; other_n: number; other_avg: number | null };
  sleep: { good_n: number; good_avg: number | null; poor_n: number; poor_avg: number | null };
  exercise: {
    active_days: number;
    active_hours: number | null;
    rest_days: number;
    rest_hours: number | null;
  };
  places: { label: string; n: number; avg: number | null }[];
}

export const MIN_DAYS = 7;
const MIN_SIDE = 3; // sessions (or days) on each side of a comparison
const MIN_POINTS = 5; // focus-% difference worth a sentence
const MIN_HOURS = 0.5; // study-hours difference worth a sentence

const pct = (v: number) => `${Math.round(v)} %`;
const h1 = (v: number) => `${Math.round(v * 10) / 10} h`;
const points = (d: number) => `${Math.round(Math.abs(d))} points ${d > 0 ? 'higher' : 'lower'}`;

/** Zero to four sentences; an empty list means "not enough yet". */
export function patternSentences(f: PatternFacts | null | undefined): string[] {
  if (!f || f.days < MIN_DAYS) return [];
  const out: string[] = [];

  const l = f.late;
  if (l.n >= MIN_SIDE && l.other_n >= MIN_SIDE && l.avg != null && l.other_avg != null) {
    const d = Number(l.avg) - Number(l.other_avg);
    if (Math.abs(d) >= MIN_POINTS)
      out.push(
        `Focus after 11 PM tends to average ${pct(Number(l.avg))}, against ${pct(Number(l.other_avg))} earlier in the day.`,
      );
  }

  const s = f.sleep;
  if (s.good_n >= MIN_SIDE && s.poor_n >= MIN_SIDE && s.good_avg != null && s.poor_avg != null) {
    const d = Number(s.good_avg) - Number(s.poor_avg);
    if (Math.abs(d) >= MIN_POINTS)
      out.push(`After 7 hours of sleep or more, focus tends to run ${points(d)} than after less.`);
  }

  const e = f.exercise;
  if (
    e.active_days >= MIN_SIDE &&
    e.rest_days >= MIN_SIDE &&
    e.active_hours != null &&
    e.rest_hours != null
  ) {
    const d = Number(e.active_hours) - Number(e.rest_hours);
    if (Math.abs(d) >= MIN_HOURS)
      out.push(
        `Days with 30 minutes of exercise or more tend to get ${h1(Number(e.active_hours))} of study, against ${h1(Number(e.rest_hours))} on other days.`,
      );
  }

  const ps = f.places.filter((p) => p.n >= MIN_SIDE && p.avg != null);
  if (ps.length >= 2) {
    const [best, next] = ps;
    const d = Number(best.avg) - Number(next.avg);
    if (d >= MIN_POINTS)
      out.push(
        `Sessions at ${best.label} tend to average ${pct(Number(best.avg))}, ahead of ${next.label} at ${pct(Number(next.avg))}.`,
      );
  } else if (ps.length === 1 && out.length === 0) {
    out.push(`Sessions at ${ps[0].label} tend to average ${pct(Number(ps[0].avg))}.`);
  }

  return out;
}

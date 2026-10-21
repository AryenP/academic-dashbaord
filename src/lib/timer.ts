// Session timer math. Nothing here ticks: every number is derived from the session's stored
// timestamps and "now", so the timer is right after a reload, after the laptop sleeps, and on
// every device at once.

export type Mode = 'pomodoro' | 'fifty_ten' | 'custom' | 'flow';
export type BreakKind = 'short' | 'long';

export interface SessionTimes {
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  break_seconds: number;
  mode: string;
}

export interface BreakTimes {
  kind: string;
  started_at: string;
  ended_at: string | null;
  paused_before: number;
}

export interface ModeSettings {
  custom_work_min?: number;
  custom_break_min?: number;
}

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'pomodoro', label: 'Pomodoro', hint: '25 min focus, 5 min break, 15 after four' },
  { id: 'fifty_ten', label: '50 / 10', hint: '50 min focus, 10 min break' },
  { id: 'custom', label: 'Custom', hint: 'Your own lengths' },
  { id: 'flow', label: 'Flow', hint: 'No timer; a nudge at 90 min' },
];

export const FLOW_NUDGE_MIN = 90;

export interface Plan {
  workSec: number; // focus length before a break is due
  breakSec: (kind: BreakKind) => number;
  longEvery: number | null; // pomodoro: every 4th break is long
  timed: boolean; // false for flow: no countdown, only a nudge
}

export function planFor(mode: string, s: ModeSettings = {}): Plan {
  switch (mode) {
    case 'pomodoro':
      return { workSec: 25 * 60, breakSec: (k) => (k === 'long' ? 15 : 5) * 60, longEvery: 4, timed: true };
    case 'fifty_ten':
      return { workSec: 50 * 60, breakSec: () => 10 * 60, longEvery: null, timed: true };
    case 'custom': {
      const w = clampMin(s.custom_work_min, 40);
      const b = clampMin(s.custom_break_min, 8);
      return { workSec: w * 60, breakSec: () => b * 60, longEvery: null, timed: true };
    }
    default:
      return { workSec: FLOW_NUDGE_MIN * 60, breakSec: () => 10 * 60, longEvery: null, timed: false };
  }
}

const clampMin = (v: number | undefined, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(240, Math.max(1, Math.round(v))) : dflt;

const t = (s: string) => Date.parse(s);

export type Phase = 'focus' | 'paused' | 'break' | 'ended';

export interface TimerState {
  phase: Phase;
  /** Focus time: wall time minus pauses and breaks. */
  focusSec: number;
  /** Focus time since the last break ended (or the start): what the next break is measured against. */
  intervalSec: number;
  /** Seconds until the next break is due; negative once it's overdue. Null in flow mode. */
  toBreakSec: number | null;
  /** True once a break is due (or, in flow, once you've gone 90 min without one). */
  breakDue: boolean;
  /** The kind the next break should be. */
  nextBreak: BreakKind;
  /** During a break: seconds left (negative when it runs over). */
  breakLeftSec: number | null;
  currentBreak: BreakTimes | null;
  breaksTaken: number;
}

export function timerState(
  s: SessionTimes,
  breaks: BreakTimes[],
  now: number,
  settings: ModeSettings = {},
): TimerState {
  const plan = planFor(s.mode, settings);
  const end = s.ended_at ? t(s.ended_at) : now;
  const open = s.ended_at ? null : (breaks.find((b) => !b.ended_at) ?? null);
  const done = breaks.filter((b) => b.ended_at);

  // break_seconds holds finished breaks; add the one in progress. Same for pauses.
  const openBreakSec = open ? Math.max(0, (end - t(open.started_at)) / 1000) : 0;
  const openPauseSec = s.paused_at && !s.ended_at ? Math.max(0, (end - t(s.paused_at)) / 1000) : 0;
  const wall = Math.max(0, (end - t(s.started_at)) / 1000);
  const focusSec = Math.max(0, wall - s.paused_seconds - s.break_seconds - openBreakSec - openPauseSec);

  // Focus since the last break ended: the time after it, minus pauses taken since. Each break records
  // the session's paused_seconds when it began, so pauses since are the difference.
  const last = done.reduce<BreakTimes | null>(
    (m, b) => (!m || t(b.ended_at!) > t(m.ended_at!) ? b : m),
    null,
  );
  const lastEnd = last ? t(last.ended_at!) : t(s.started_at);
  const sinceLast = Math.max(0, (end - lastEnd) / 1000);
  const pausedSince = s.paused_seconds - (last?.paused_before ?? 0) + openPauseSec;
  const intervalSec = open ? 0 : Math.max(0, sinceLast - pausedSince);

  const breaksTaken = done.length + (open ? 1 : 0);
  const nextBreak: BreakKind = plan.longEvery && (done.length + 1) % plan.longEvery === 0 ? 'long' : 'short';
  const toBreakSec = plan.timed ? plan.workSec - intervalSec : null;
  const breakDue = intervalSec >= plan.workSec;
  const breakLeftSec = open ? plan.breakSec(open.kind as BreakKind) - openBreakSec : null;

  const phase: Phase = s.ended_at ? 'ended' : open ? 'break' : s.paused_at ? 'paused' : 'focus';
  return {
    phase,
    focusSec,
    intervalSec,
    toBreakSec,
    breakDue: phase === 'focus' && breakDue,
    nextBreak,
    breakLeftSec,
    currentBreak: open,
    breaksTaken,
  };
}

/** 1:05:09 for long sessions, 25:00 for short ones. Negative values get a leading minus. */
export function clock(sec: number): string {
  const neg = sec < 0;
  const s = Math.floor(Math.abs(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return neg ? `−${body}` : body;
}

/** "1 h 25 min", "40 min", "0 min". */
export function duration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Rotating break suggestions: one concrete thing to do, not a list.
export const BREAK_IDEAS = [
  'Drink a glass of water.',
  'Stand up and stretch your back and shoulders.',
  'Look at something 20 feet away for 20 seconds. Do it three times.',
  'Walk to the end of the hall and back.',
  'Roll your neck slowly, five times each way.',
  'Step outside for a minute of daylight.',
  'Refill your water and tidy your desk.',
];

/** Same idea for the whole break, a different one each break. */
export const breakIdea = (breakIndex: number) => BREAK_IDEAS[breakIndex % BREAK_IDEAS.length];

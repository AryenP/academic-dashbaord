import { describe, expect, it } from 'vitest';
import type { ExamPrep, PlanItem } from './plan';
import { weekReview } from './review';
import type { Session } from './supabase';

const sess = (start: string, min: number, course: string, pct: number | null = null): Session =>
  ({
    id: start + course,
    course,
    started_at: start,
    ended_at: new Date(Date.parse(start) + min * 60_000).toISOString(),
    paused_seconds: 0,
    break_seconds: 0,
    focus_pct: pct,
  }) as Session;

const plan = [
  { kind: 'Study', course: 'DSC 140A', day: '2026-10-20', hours: 2 },
  { kind: 'Study', course: 'DSC 140A', day: '2026-10-22', hours: 3 },
  { kind: 'Study', course: 'DSC 102', day: '2026-10-27', hours: 4 }, // next week
  { kind: 'Exam', course: 'DSC 140A', day: '2026-10-26', hours: 1 },
] as PlanItem[];
const exams = [
  {
    id: 'x',
    course: 'DSC 140A',
    start: '2026-10-26T17:00:00-07:00',
    end: '2026-10-26T18:00:00-07:00',
    prep_hours: 5,
  },
] as ExamPrep[];

describe('weekReview', () => {
  const sessions = [
    sess('2026-10-16T10:00:00-07:00', 60, 'DSC 140A', 80), // last week
    sess('2026-10-20T10:00:00-07:00', 90, 'DSC 140A', 95),
    sess('2026-10-21T10:00:00-07:00', 30, 'CSE 151A', 60),
    sess('2026-10-22T10:00:00-07:00', 10, 'DSC 140A', 99), // too short for best/worst
  ];
  const r = weekReview(plan, exams, sessions, '2026-10-22', Date.parse('2026-10-25T12:00:00-07:00'));

  it('covers Monday to Sunday', () => {
    expect([r.from, r.to]).toEqual(['2026-10-19', '2026-10-25']);
    expect(r.sessions).toBe(3);
  });

  it('compares planned and actual minutes per course, including off-plan courses', () => {
    expect(r.plannedMin).toBe(300);
    expect(r.actualMin).toBe(130);
    expect(r.byCourse).toEqual([
      { course: 'DSC 140A', plannedMin: 300, actualMin: 100 },
      { course: 'CSE 151A', plannedMin: 0, actualMin: 30 },
    ]);
  });

  it('best focus ignores sessions under 15 minutes', () => {
    expect(r.best.map((s) => Number(s.focus_pct))).toEqual([95, 60]);
    expect(r.worst).toEqual([]);
  });

  it('readiness moves from the start of the week to its end', () => {
    expect(r.readiness).toHaveLength(1);
    expect(r.readiness[0].before.actualHours).toBe(1);
    expect(r.readiness[0].after.actualHours).toBe(2.7);
  });
});

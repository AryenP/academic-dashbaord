import { describe, expect, it } from 'vitest';
import { previewPlan, type PreviewResult } from './preview';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-10-23T10:00:00-07:00');
const r: PreviewResult = {
  ok: true,
  courses: [
    { code: 'DSC 140A', events: 3 },
    { code: 'DSC 102', events: 1 },
  ],
  events: [
    {
      title: 'Lecture',
      start: '2026-10-23T14:00:00-07:00',
      end: '2026-10-23T15:20:00-07:00',
      kind: 'class',
      course: 'DSC 102',
      location: '',
    },
    {
      title: 'Practice',
      start: '2026-10-24T09:00:00-07:00',
      end: '2026-10-24T11:00:00-07:00',
      kind: 'study',
      course: 'DSC 140A',
      location: '',
    },
    {
      title: 'Midterm 1',
      start: '2026-10-26T17:00:00-07:00',
      end: '2026-10-26T18:00:00-07:00',
      kind: 'exam',
      course: 'DSC 140A',
      location: 'Center Hall 115',
    },
    {
      title: 'Lab meeting',
      start: '2026-10-24T13:00:00-07:00',
      end: '2026-10-24T14:00:00-07:00',
      kind: 'commitment',
      course: null,
      location: '',
    },
  ],
};

describe('the preview, drawn', () => {
  it('gives the most frequent course the first color and builds the runway’s plan', () => {
    const { data, courses } = previewPlan(r, TZ, NOW);
    expect(courses.map((c) => [c.code, c.color])).toEqual([
      ['DSC 140A', 1],
      ['DSC 102', 2],
    ]);
    expect(data.plan.map((p) => p.kind)).toEqual(['Class', 'Study', 'Commitment', 'Exam']);
    expect(data.plan.find((p) => p.kind === 'Commitment')?.course).toBe('General');
    expect(data.exam_prep).toHaveLength(1);
    expect(data.exam_prep[0]).toMatchObject({
      course: 'DSC 140A',
      title: 'Midterm 1',
      prep_hours: 2,
      location: 'Center Hall 115',
    });
  });

  it('is empty, not broken, when nothing came back', () => {
    const { data } = previewPlan({ ok: true }, TZ, NOW);
    expect(data.plan).toEqual([]);
    expect(data.exam_prep).toEqual([]);
  });
});

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { cleanName, gluedCode, importItems, type ExistingItem, type ImportStore } from './importer.ts';

const NOW = new Date('2026-10-21T18:00:00Z');

function fake(
  existing: ExistingItem[] = [],
  courses: { id: string; code: string; name: string | null; color: number }[] = [],
) {
  const inserted: Record<string, unknown>[] = [];
  const updates: [string, Record<string, unknown>][] = [];
  let n = 0;
  const store: ImportStore = {
    courses: async () => [...courses],
    addCourse: async (_u, code, name, color) => {
      const c = { id: `c${++n}`, code, name, color };
      courses.push(c);
      return c;
    },
    items: async () => existing,
    extensionSource: async () => 'src-ext',
    insert: async (row) => {
      inserted.push(row);
      return `p${++n}`;
    },
    update: async (id, patch) => void updates.push([id, patch]),
  };
  return { store, inserted, updates, courses };
}

Deno.test('new deadlines are created with their course, status and score', async () => {
  const f = fake([], [{ id: 'c140', code: 'DSC 140A', name: null, color: 1 }]);
  const r = await importItems(
    f.store,
    'u1',
    [
      {
        source: 'gradescope',
        course: 'DSC 140A',
        title: 'HW 3',
        due: '2026-11-10T07:59:00.000Z',
        status: 'open',
        score: null,
        max_score: null,
        url: null,
      },
      {
        source: 'gradescope',
        course: 'DSC 140A',
        title: 'HW 2',
        due: '2026-10-27T06:59:00.000Z',
        status: 'submitted',
        score: 18,
        max_score: 20,
        url: null,
      },
      {
        source: 'gradescope',
        course: 'DSC 140A',
        title: 'HW 1',
        due: '2026-08-01T06:59:00.000Z',
        status: 'submitted',
        score: 20,
        max_score: 20,
        url: null,
      }, // long past: skipped
      {
        source: 'canvas',
        course: 'COGS 1 - Intro (A00)',
        title: 'Reading 4',
        due: '2026-11-01T06:59:00.000Z',
        status: null,
        score: null,
        max_score: null,
        url: null,
      },
      {
        source: 'canvas',
        course: 'Mystery seminar',
        title: 'Essay',
        due: null,
        status: null,
        score: null,
        max_score: null,
        url: null,
      },
    ],
    NOW,
  );
  assertEquals(r, { created: 3, updated: 0, skipped: 2, unmatched_courses: ['Mystery seminar'] });
  assertEquals(f.inserted[0], {
    user_id: 'u1',
    source_id: 'src-ext',
    course_id: 'c140',
    kind: 'deadline',
    title: 'HW 3',
    start_at: '2026-11-10T07:58:00.000Z',
    end_at: '2026-11-10T07:59:00.000Z',
    location: '',
    source: 'extension',
    accepted: true,
    status: 'open',
    submitted_at: null,
    submitted_by: null,
    score: null,
    max_score: null,
  });
  assertEquals(f.inserted[1].status, 'submitted');
  assertEquals(f.inserted[1].submitted_by, 'extension');
  assertEquals(f.inserted[1].score, 18);
  // COGS 1 was unknown: a course was made for it.
  assert(f.courses.some((c) => c.code === 'COGS 1'));
  assertEquals(f.inserted[2].course_id, f.courses.find((c) => c.code === 'COGS 1')!.id);
});

Deno.test(
  'a deadline already on the runway (from a Canvas feed) gets its status and score, not a duplicate',
  async () => {
    const f = fake(
      [
        {
          id: 'd1',
          course_id: 'c140',
          kind: 'deadline',
          title: 'HW 2',
          start_at: '2026-10-27T06:00:00Z',
          end_at: '2026-10-27T06:59:00Z',
          status: 'open',
          source: 'calendar',
        },
      ],
      [{ id: 'c140', code: 'DSC 140A', name: 'Probabilistic Modeling', color: 1 }],
    );
    const r = await importItems(
      f.store,
      'u1',
      [
        {
          source: 'gradescope',
          course: 'Probabilistic Modeling',
          title: 'hw 2',
          due: '2026-10-27T06:59:00.000Z',
          status: 'submitted',
          score: 19,
          max_score: 20,
          url: null,
        },
      ],
      NOW,
    );
    assertEquals(r.created, 0);
    assertEquals(r.updated, 1);
    assertEquals(f.updates[0][0], 'd1');
    assertEquals(f.updates[0][1].status, 'submitted');
    assertEquals(f.updates[0][1].score, 19);
    assert(typeof f.updates[0][1].submitted_at === 'string');
    // A second visit with nothing new changes nothing.
    f.store.items = async () => [
      {
        ...(await Promise.resolve(f.updates[0])),
        id: 'd1',
        course_id: 'c140',
        kind: 'deadline',
        title: 'HW 2',
        start_at: '',
        end_at: '2026-10-27T06:59:00Z',
        status: 'submitted',
        source: 'calendar',
      } as ExistingItem,
    ];
    const r2 = await importItems(
      f.store,
      'u1',
      [
        {
          source: 'gradescope',
          course: 'DSC 140A',
          title: 'HW 2',
          due: '2026-10-27T06:59:00.000Z',
          status: 'submitted',
          score: null,
          max_score: null,
          url: null,
        },
      ],
      NOW,
    );
    assertEquals(r2.updated, 0);
    assertEquals(r2.skipped, 1);
  },
);

Deno.test(
  'Gradescope course names: the glued code is read, the term is not, the long name is kept',
  async () => {
    assertEquals(gluedCode('DSC106_FA26_001'), 'DSC 106');
    assertEquals(gluedCode('CSE151A_FA26_A00'), 'CSE 151A');
    assertEquals(gluedCode('FA26_001'), null);
    assertEquals(gluedCode('Theoretical Foundations'), null);
    assertEquals(
      cleanName('DSC 106 - Intro to Data Visualization - Liao [FA26]', 'DSC 106'),
      'Intro to Data Visualization',
    );
    assertEquals(
      cleanName('Theoretical Foundations of Data Science II [S226]', 'DSC 40BR'),
      'Theoretical Foundations of Data Science II',
    );
    assertEquals(cleanName(null, 'DSC 106'), null);

    const f = fake([], []);
    const r = await importItems(
      f.store,
      'u1',
      [
        {
          source: 'gradescope',
          course: 'DSC106_FA26_001',
          course_name: 'DSC 106 - Intro to Data Visualization - Liao [FA26]',
          title: 'Lab 4',
          due: '2026-10-25T06:59:00.000Z',
          status: 'submitted',
          score: null,
          max_score: null,
          url: null,
        },
        {
          source: 'gradescope',
          course: 'DSC106_FA26_001',
          course_name: null,
          title: 'Lab 5',
          due: '2026-11-01T06:59:00.000Z',
          status: 'open',
          score: null,
          max_score: null,
          url: null,
        },
      ],
      NOW,
    );
    assertEquals(r.created, 2);
    assertEquals(r.unmatched_courses, []);
    assertEquals(
      f.courses.map((c) => [c.code, c.name]),
      [['DSC 106', 'Intro to Data Visualization']],
    );
    assert(f.inserted.every((row) => row.course_id === 'c1'));
  },
);

// What an event is, after the person, the AI and the title rules have had their say. No imports,
// so the Edge Functions (Deno) share it with the browser.

export interface Readable {
  hash: string;
  kind: string;
  course_code: string | null;
  confidence?: number | string | null;
  override: { kind?: string; course_code?: string | null } | null;
  ai_hash?: string | null;
  ai_kind?: string | null;
  ai_course_code?: string | null;
}

export type ReadBy = 'override' | 'ai' | 'rules';

export function effective(e: Readable): { kind: string; course: string | null; by: ReadBy } {
  let kind = e.kind;
  let course = e.course_code;
  let by: ReadBy = 'rules';
  if (e.ai_hash && e.ai_hash === e.hash && e.ai_kind) {
    kind = e.ai_kind;
    course = e.ai_course_code ?? null;
    by = 'ai';
  }
  if (e.override) {
    if (e.override.kind) kind = e.override.kind;
    if (e.override.course_code !== undefined) course = e.override.course_code;
    by = 'override';
  }
  return { kind, course, by };
}

/** The rules weren't sure and nobody else has weighed in yet. */
export const unsure = (e: Readable, below = 0.85) =>
  effective(e).by === 'rules' && Number(e.confidence ?? 0) < below;

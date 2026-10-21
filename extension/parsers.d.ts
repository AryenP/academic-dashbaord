/// <reference lib="dom" />
export interface ParsedRow {
  source: 'gradescope' | 'canvas';
  course: string | null;
  title: string;
  due: string | null;
  status: 'submitted' | 'open' | null;
  score: number | null;
  max_score: number | null;
  url: string | null;
}
export function parseDue(s: string | null | undefined, now?: Date): string | null;
export function parseScore(s: string | null | undefined): { score: number | null; max_score: number | null };
export function parseGradescopeCourse(doc: Document, url: string, now?: Date): ParsedRow[];
export function parseGradescopeDashboard(doc: Document): { course: string; path: string }[];
export function parseCanvasAssignments(doc: Document, url: string, now?: Date): ParsedRow[];
export function parsePage(doc: Document, url: string, now?: Date): ParsedRow[];

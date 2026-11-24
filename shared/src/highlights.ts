import { z } from 'zod';

/**
 * Highlights: the teacher marks parts of a student's essay: a colour, a line
 * through, a straight or a wavy line under. A highlight is a range of the
 * answer's text (character positions) with its marks. They are kept apart
 * from the answer (the student saves the whole answer, so it would overwrite
 * them) and move with the text as the student edits it (rebaseHighlights).
 * Pure functions: the server keeps the truth, the clients use the same ones
 * to keep up between two server messages.
 *
 * The marks only add to the text, they never change its shape (no bold, no
 * italics: the letters would get wider), so a layer over the answer's
 * textarea can draw them.
 */

export const HIGHLIGHT_COLORS = ['green', 'red', 'yellow', 'blue'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export const UNDERLINES = ['line', 'wave'] as const;
export type Underline = (typeof UNDERLINES)[number];

/** The longest essay (EssayBlock) and so the largest position. */
export const ESSAY_MAX_LENGTH = 3000;
/** Most highlights on one answer. */
export const MAX_HIGHLIGHTS = 200;

/** What can be put on a part of the text; each mark is independent of the others (a part has at most one underline). */
export interface Marks {
  color?: HighlightColor;
  /** A line through the text. */
  strike?: true;
  underline?: Underline;
}

export interface Highlight extends Marks {
  /** First character (0-based). */
  start: number;
  /** After the last character: start < end. */
  end: number;
}

const position = z.number().int().min(0).max(ESSAY_MAX_LENGTH);
const range = { start: position, end: position, quote: z.string().min(1).max(ESSAY_MAX_LENGTH) };

/** The change to the marks of a part: a given field is set (`strike: false`, `underline: null`: taken off); the others stay. */
export const marksPatch = z
  .object({
    color: z.enum(HIGHLIGHT_COLORS).optional(),
    strike: z.boolean().optional(),
    underline: z.enum(UNDERLINES).nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), 'empty');
export type MarksPatch = z.infer<typeof marksPatch>;

/** POST …/highlights/:blockId: colour a part of the text, mark it (line through, line under), or clear its marks. */
export const editHighlightsInput = z.union([
  z.object({ paint: z.object({ ...range, color: z.enum(HIGHLIGHT_COLORS) }) }),
  z.object({ format: z.object({ ...range, patch: marksPatch }) }),
  z.object({ erase: z.object(range) }),
]);
export type EditHighlightsInput = z.infer<typeof editHighlightsInput>;

/** Highlights of the answer blocks of a lesson, by block id (only blocks that have any). */
export type LessonHighlights = Record<string, Highlight[]>;

/** Server → student and teachers `highlights`: the highlights of one answer changed. */
export interface HighlightsEvent {
  lessonId: number;
  studentId: number;
  blockId: string;
  highlights: Highlight[];
  /** teacher: a teacher marked it; edit: the text changed and they moved with it (the student's page has done it already). */
  reason: 'teacher' | 'edit';
}

const hasMarks = (h: Marks) => !!(h.color || h.strike || h.underline);
const sameMarks = (a: Marks, b: Marks) =>
  a.color === b.color && !!a.strike === !!b.strike && a.underline === b.underline;
const marksOf = ({ color, strike, underline }: Marks): Marks => ({
  ...(color && { color }),
  ...(strike && { strike }),
  ...(underline && { underline }),
});

/** Sorted, no overlaps, nothing without marks, touching parts with the same marks joined. */
function tidy(list: Highlight[]): Highlight[] {
  const sorted = list.filter((h) => h.start < h.end && hasMarks(h)).sort((a, b) => a.start - b.start);
  const out: Highlight[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && sameMarks(last, h) && last.end >= h.start) last.end = Math.max(last.end, h.end);
    else out.push({ ...h });
  }
  return out;
}

/** The list without any marks in [start, end): a highlight across the edge is cut. */
export function eraseHighlight(list: Highlight[], start: number, end: number): Highlight[] {
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= start || h.start >= end) out.push(h);
    else {
      if (h.start < start) out.push({ ...h, end: start });
      if (h.end > end) out.push({ ...h, start: end });
    }
  }
  return out;
}

/**
 * Changes the marks of [start, end) by `patch`, whatever was there (the other
 * marks stay): a colour replaces the colour like a marker, `strike: false` and
 * `underline: null` take theirs off.
 */
export function markHighlight(list: Highlight[], start: number, end: number, patch: MarksPatch): Highlight[] {
  if (start >= end) return list;
  const edges = new Set([start, end]);
  for (const h of list) for (const at of [h.start, h.end]) if (at > start && at < end) edges.add(at);
  const points = [...edges].sort((a, b) => a - b);
  const pieces: Highlight[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [from, to] = [points[i], points[i + 1]];
    const base = list.find((h) => h.start <= from && to <= h.end);
    const marks = { ...(base && marksOf(base)) } as Marks;
    if (patch.color) marks.color = patch.color;
    if (patch.strike === true) marks.strike = true;
    if (patch.strike === false) delete marks.strike;
    if (patch.underline) marks.underline = patch.underline;
    if (patch.underline === null) delete marks.underline;
    pieces.push({ start: from, end: to, ...marks });
  }
  return tidy([...eraseHighlight(list, start, end), ...pieces]);
}

/** Colours [start, end) over whatever colour was there, like a marker (its other marks stay). */
export function paintHighlight(list: Highlight[], start: number, end: number, color: HighlightColor): Highlight[] {
  return markHighlight(list, start, end, { color });
}

/** Whether every character of [start, end) is in a highlight that passes `test` (for a toggle: is it on already). */
export function isMarked(list: Highlight[], start: number, end: number, test: (h: Highlight) => boolean): boolean {
  let at = start;
  for (const h of [...list].sort((a, b) => a.start - b.start)) {
    if (h.end <= at) continue;
    if (h.start > at || !test(h)) return false;
    at = h.end;
    if (at >= end) return true;
  }
  return at >= end;
}

/**
 * Where the quoted text is now. Positions come from the page the teacher
 * looked at; if the text there is the quote, they are right. Otherwise the
 * student has edited meanwhile: the quote's nearest occurrence is taken, or
 * nothing if it is gone.
 */
export function locateQuote(
  text: string,
  { start, end, quote }: { start: number; end: number; quote: string },
): { start: number; end: number } | undefined {
  if (start >= end || !quote) return undefined;
  if (text.slice(start, end) === quote) return { start, end };
  let best: number | undefined;
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    if (best === undefined || Math.abs(at - start) < Math.abs(best - start)) best = at;
  }
  return best === undefined ? undefined : { start: best, end: best + quote.length };
}

/**
 * The highlights after the text changed from `oldText` to `newText`. The
 * change is taken as one replaced part (what the texts do not share at the
 * start and at the end), so two edits in different places in one go lose the
 * highlights between them rather than shifting them wrongly.
 * - before the change: stay; after it: move by the change in length;
 * - a change strictly inside a highlight (typing in the middle of a word)
 *   keeps it, longer or shorter;
 * - a change over an edge cuts the highlight back to the part left;
 * - a change that replaces all of it removes it (the student corrected it).
 */
export function rebaseHighlights(oldText: string, newText: string, list: Highlight[]): Highlight[] {
  if (oldText === newText || list.length === 0) return list;
  const shortest = Math.min(oldText.length, newText.length);
  let head = 0;
  while (head < shortest && oldText[head] === newText[head]) head += 1;
  let tail = 0;
  while (tail < shortest - head && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) {
    tail += 1;
  }
  const changedEnd = oldText.length - tail; // the old text's changed part is [head, changedEnd)
  const shift = newText.length - oldText.length;

  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= head) out.push(h);
    else if (h.start >= changedEnd) out.push({ ...h, start: h.start + shift, end: h.end + shift });
    else if (h.start < head && changedEnd < h.end) out.push({ ...h, end: h.end + shift });
    else {
      if (h.start < head) out.push({ ...h, end: head });
      if (h.end > changedEnd) out.push({ ...h, start: changedEnd + shift, end: h.end + shift });
    }
  }
  return tidy(out);
}

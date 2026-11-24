import { DROPDOWN_MARKUP, GAP_MARKUP, parseDropdown } from '@cuadrilo/shared/lesson';

/**
 * Helpers shared by the exercise components: answer normalization, the gap
 * markup used by fill-in and drag-into-gaps texts, and shuffling.
 */

/** Answers are compared case-insensitively, ignoring surrounding and repeated spaces. */
export const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export const matches = (value: string, answers: string[]) =>
  answers.some((answer) => normalize(answer) === normalize(value));

export type GapPart = { kind: 'text'; text: string } | { kind: 'gap'; index: number; answers: string[] };

/**
 * Text with gaps: `*answer*`, alternatives with `|` (`*goes|drives*`).
 * Paragraphs are separated by an empty line; a single newline is a line break
 * (kept in the text parts, rendered with `white-space: pre-line`).
 * Gap indexes run through the whole text.
 */
export function parseGapText(source: string): GapPart[][] {
  let index = 0;
  return source
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const parts: GapPart[] = [];
      let last = 0;
      for (const match of paragraph.matchAll(GAP_MARKUP)) {
        if (match.index > last) parts.push({ kind: 'text', text: paragraph.slice(last, match.index) });
        const answers = match[1]
          .split('|')
          .map((a) => a.trim())
          .filter(Boolean);
        parts.push({ kind: 'gap', index: index++, answers });
        last = match.index + match[0].length;
      }
      if (last < paragraph.length) parts.push({ kind: 'text', text: paragraph.slice(last) });
      return parts;
    });
}

export type DropdownPart =
  | { kind: 'text'; text: string }
  | { kind: 'gap'; index: number; options: string[]; answers: string[] };

/** Text with dropdowns (`{a|*b*|c}`); paragraphs and indexes as in parseGapText. */
export function parseDropdownText(source: string): DropdownPart[][] {
  let index = 0;
  return source
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const parts: DropdownPart[] = [];
      let last = 0;
      for (const match of paragraph.matchAll(DROPDOWN_MARKUP)) {
        if (match.index > last) parts.push({ kind: 'text', text: paragraph.slice(last, match.index) });
        const { options, answers } = parseDropdown(match[1]);
        // A dropdown with nothing to choose from or no right option is left as the text it was written.
        if (options.length >= 2 && answers.length > 0) parts.push({ kind: 'gap', index: index++, options, answers });
        else parts.push({ kind: 'text', text: match[0] });
        last = match.index + match[0].length;
      }
      if (last < paragraph.length) parts.push({ kind: 'text', text: paragraph.slice(last) });
      return parts;
    });
}

export const gapsOf = (paragraphs: GapPart[][]) =>
  paragraphs.flat().filter((part): part is Extract<GapPart, { kind: 'gap' }> => part.kind === 'gap');

function fisherYates<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffles; for 2+ items never returns the original order (the exercise would be solved already). */
export function shuffle<T>(
  items: T[],
  same: (a: T[], b: T[]) => boolean = (a, b) => a.every((x, i) => x === b[i]),
): T[] {
  if (items.length < 2) return [...items];
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = fisherYates(items);
    if (!same(result, items)) return result;
  }
  return [...items.slice(1), items[0]];
}

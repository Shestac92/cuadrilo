/**
 * Word search: the teacher gives the words, the platform hides them in a grid of letters. The grid is made
 * once, in the editor (`generateWordsearch`), and stored in the lesson, so every student gets the same one.
 * Words run only to the right or down. The letters that fill the rest of the grid are drawn evenly from the
 * letters the words themselves use, so no language is assumed; the teacher can change any of those letters
 * (never the letters of a word).
 *
 * Letters are upper case, exactly as in the word (an accent stays: "está" is ESTÁ); spaces and hyphens inside
 * a word are dropped. A cell is one code point.
 */

export const WORDSEARCH_MIN_WORDS = 5;
export const WORDSEARCH_MAX_WORDS = 30;
/** The longest word, in cells. */
export const WORDSEARCH_WORD_MAX = 20;
/** What the teacher may type for one word (spaces and hyphens included). */
export const WORDSEARCH_INPUT_MAX = 60;
export const WORDSEARCH_MIN_SIZE = 8;
export const WORDSEARCH_MAX_SIZE = 20;
/** Cells per letter of the words that the grid has at least (its side is the square root of letters × this). */
const ROOMINESS = 2.5;
/** New layouts tried on one grid size before the grid grows. */
const LAYOUTS_PER_SIZE = 20;

export const WORDSEARCH_DIRECTIONS = ['right', 'down'] as const;
export type WordsearchDirection = (typeof WORDSEARCH_DIRECTIONS)[number];

/** Where a word lies in the grid; `word` is as the teacher typed it (shown in the list). */
export interface WordsearchPlacement {
  word: string;
  row: number;
  col: number;
  dir: WordsearchDirection;
}

export interface Cell {
  row: number;
  col: number;
}

/** What the player saves: the words found so far (as in the placements). */
export interface WordsearchState {
  found: string[];
}

/** The cells of a word: its letters in upper case, without spaces and hyphens. */
export const wordLetters = (word: string): string[] => [
  ...word
    .normalize('NFC')
    .toLocaleUpperCase()
    .replace(/[\s\-‐-―]+/g, ''),
];

/** The grid's rows as arrays of cells. */
export const gridRows = (grid: readonly string[]): string[][] => grid.map((row) => [...row]);

/** The cells a placement covers. */
export function placementCells(placement: WordsearchPlacement): Cell[] {
  const length = wordLetters(placement.word).length;
  return Array.from({ length }, (_, i) => ({
    row: placement.row + (placement.dir === 'down' ? i : 0),
    col: placement.col + (placement.dir === 'right' ? i : 0),
  }));
}

/** Whether the word really lies where the placement says (it may not after a half-finished edit or a broken import). */
export function isPlacementIntact(rows: readonly string[][], placement: WordsearchPlacement): boolean {
  const letters = wordLetters(placement.word);
  if (letters.length < 2) return false;
  return placementCells(placement).every((cell, i) => rows[cell.row]?.[cell.col] === letters[i]);
}

/** The keys ("row,col") of the cells that belong to a word: the ones the teacher cannot change. */
export function lockedCells(placements: readonly WordsearchPlacement[]): Set<string> {
  const keys = new Set<string>();
  for (const placement of placements) for (const cell of placementCells(placement)) keys.add(`${cell.row},${cell.col}`);
  return keys;
}

/**
 * The straight line the student's drag selects: horizontal or vertical, whichever way the pointer moved more,
 * always listed to the right / downwards (dragging backwards selects the same cells).
 */
export function selectionCells(from: Cell, to: Cell): Cell[] {
  const horizontal = Math.abs(to.col - from.col) >= Math.abs(to.row - from.row);
  const start = horizontal ? Math.min(from.col, to.col) : Math.min(from.row, to.row);
  const end = horizontal ? Math.max(from.col, to.col) : Math.max(from.row, to.row);
  return Array.from({ length: end - start + 1 }, (_, i) =>
    horizontal ? { row: from.row, col: start + i } : { row: start + i, col: from.col },
  );
}

/** The word (of the given ones, as typed) that the selected cells spell, if any. */
export function wordInSelection(rows: readonly string[][], cells: readonly Cell[], words: readonly string[]) {
  const text = cells.map((cell) => rows[cell.row]?.[cell.col] ?? '').join('');
  return words.find((word) => wordLetters(word).join('') === text);
}

/** Whether the grid holds exactly the usable words: false when the teacher has changed the words since it was made. */
export function isGridCurrent(words: readonly string[], placements: readonly WordsearchPlacement[]): boolean {
  const wanted = new Set(usableWords(words).map((item) => item.letters.join('')));
  const placed = new Set(placements.map((placement) => wordLetters(placement.word).join('')));
  return wanted.size === placed.size && [...wanted].every((key) => placed.has(key));
}

export type WordsearchResult =
  | { ok: true; grid: string[]; placements: WordsearchPlacement[] }
  /** `tooFew`: under the minimum; `tooLong`: `word` is longer than a word may be; `noRoom`: `word` could not be placed even in the biggest grid. */
  | { ok: false; reason: 'tooFew' | 'tooLong' | 'noRoom'; word?: string };

export interface Prepared {
  word: string;
  letters: string[];
}

/** The usable words: trimmed, at least two cells, each once (the same letters count as the same word). */
export function usableWords(words: readonly string[]): Prepared[] {
  const seen = new Set<string>();
  const prepared: Prepared[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const letters = wordLetters(word);
    const key = letters.join('');
    if (letters.length < 2 || seen.has(key)) continue;
    seen.add(key);
    prepared.push({ word, letters });
  }
  return prepared;
}

type Layout = { cells: (string | null)[][]; placements: WordsearchPlacement[] } | { failed: string };

/** One random layout: the longest words first, each at a random place where it fits (crossing a word on the same letter is fine). */
function layOut(prepared: readonly Prepared[], size: number, random: () => number): Layout {
  const cells: (string | null)[][] = Array.from({ length: size }, () => new Array<string | null>(size).fill(null));
  const placements = new Map<Prepared, WordsearchPlacement>();
  const byLength = [...prepared].sort((a, b) => b.letters.length - a.letters.length);
  for (const item of byLength) {
    const fits: WordsearchPlacement[] = [];
    for (const dir of WORDSEARCH_DIRECTIONS) {
      const maxRow = dir === 'down' ? size - item.letters.length : size - 1;
      const maxCol = dir === 'right' ? size - item.letters.length : size - 1;
      for (let row = 0; row <= maxRow; row++) {
        for (let col = 0; col <= maxCol; col++) {
          const free = item.letters.every((letter, i) => {
            const current = cells[row + (dir === 'down' ? i : 0)][col + (dir === 'right' ? i : 0)];
            return current === null || current === letter;
          });
          if (free) fits.push({ word: item.word, row, col, dir });
        }
      }
    }
    if (fits.length === 0) return { failed: item.word };
    const chosen = fits[Math.floor(random() * fits.length)];
    item.letters.forEach((letter, i) => {
      cells[chosen.row + (chosen.dir === 'down' ? i : 0)][chosen.col + (chosen.dir === 'right' ? i : 0)] = letter;
    });
    placements.set(item, chosen);
  }
  return { cells, placements: prepared.map((item) => placements.get(item) as WordsearchPlacement) };
}

/**
 * Hides the words in a new grid. The side is chosen from the letters (at least 8, at most 20, at least the
 * longest word); if the words do not fit, the grid grows by one and tries again. `random` gives numbers in
 * [0, 1) (tests pass a seeded one).
 */
export function generateWordsearch(words: readonly string[], random: () => number = Math.random): WordsearchResult {
  const prepared = usableWords(words);
  if (prepared.length < WORDSEARCH_MIN_WORDS) return { ok: false, reason: 'tooFew' };
  const tooLong = prepared.find((item) => item.letters.length > WORDSEARCH_WORD_MAX);
  if (tooLong) return { ok: false, reason: 'tooLong', word: tooLong.word };

  const letterCount = prepared.reduce((sum, item) => sum + item.letters.length, 0);
  const longest = Math.max(...prepared.map((item) => item.letters.length));
  const start = Math.min(
    WORDSEARCH_MAX_SIZE,
    Math.max(WORDSEARCH_MIN_SIZE, longest, Math.ceil(Math.sqrt(letterCount * ROOMINESS))),
  );
  let failedWord = prepared[0].word;
  for (let size = start; size <= WORDSEARCH_MAX_SIZE; size++) {
    for (let attempt = 0; attempt < LAYOUTS_PER_SIZE; attempt++) {
      const layout = layOut(prepared, size, random);
      if ('failed' in layout) {
        failedWord = layout.failed;
        continue;
      }
      // The rest of the grid: letters of the words, evenly (no language, no frequencies).
      const alphabet = [...new Set(prepared.flatMap((item) => item.letters))];
      const grid = layout.cells.map((row) =>
        row.map((cell) => cell ?? alphabet[Math.floor(random() * alphabet.length)]).join(''),
      );
      return { ok: true, grid, placements: layout.placements };
    }
  }
  return { ok: false, reason: 'noRoom', word: failedWord };
}

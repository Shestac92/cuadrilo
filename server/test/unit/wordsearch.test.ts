import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAnswerType, toPlayableBlock } from '@cuadrilo/shared/lesson';
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';
import {
  type Cell,
  generateWordsearch,
  gridRows,
  isPlacementIntact,
  lockedCells,
  selectionCells,
  WORDSEARCH_MAX_SIZE,
  type WordsearchPlacement,
  wordInSelection,
  wordLetters,
} from '@cuadrilo/shared/wordsearch';

/** A repeatable random generator (mulberry32). */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'naranja', 'morado', 'rosa', 'gris'];

function generated(words: string[], seed = 1) {
  const result = generateWordsearch(words, seeded(seed));
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}

describe('wordsearch: generator', () => {
  it('every word lies in the grid where its placement says, to the right or down', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { grid, placements } = generated(COLORS, seed);
      const rows = gridRows(grid);
      assert.equal(placements.length, COLORS.length);
      for (const placement of placements) {
        assert.ok(isPlacementIntact(rows, placement), `${placement.word} (seed ${seed})`);
        assert.ok(['right', 'down'].includes(placement.dir));
      }
    }
  });

  it('the grid is square, between 8 and 20 cells, and holds only letters of the words', () => {
    const { grid } = generated(COLORS);
    const rows = gridRows(grid);
    assert.ok(rows.length >= 8 && rows.length <= WORDSEARCH_MAX_SIZE);
    assert.ok(rows.every((row) => row.length === rows.length));
    const allowed = new Set(COLORS.flatMap(wordLetters));
    assert.ok(rows.flat().every((cell) => allowed.has(cell)));
  });

  it('fills the rest with letters of the words only, whatever the language', () => {
    const words = ['привет', 'спасибо', 'пожалуйста', 'здравствуйте', 'до свидания'];
    const { grid } = generated(words);
    const allowed = new Set(words.flatMap(wordLetters));
    assert.ok(
      gridRows(grid)
        .flat()
        .every((cell) => allowed.has(cell)),
    );
  });

  it('keeps accents and ñ, drops spaces and hyphens, upper-cases', () => {
    assert.deepEqual(wordLetters('está'), ['E', 'S', 'T', 'Á']);
    assert.deepEqual(wordLetters('año'), ['A', 'Ñ', 'O']);
    assert.deepEqual(wordLetters('buenos días'), [...'BUENOSDÍAS']);
    assert.deepEqual(wordLetters('ex-novio'), [...'EXNOVIO']);
    // A decomposed accent is the same cell as a composed one.
    assert.deepEqual(wordLetters('está'), wordLetters('está'));
  });

  it('is repeatable with the same random numbers and different with others', () => {
    assert.deepEqual(generated(COLORS, 7), generated(COLORS, 7));
    assert.notDeepEqual(generated(COLORS, 7).grid, generated(COLORS, 8).grid);
  });

  it('needs five words; empty lines, one-letter words and repeats do not count', () => {
    assert.deepEqual(generateWordsearch(['uno', 'dos', 'tres', 'cuatro']), { ok: false, reason: 'tooFew' });
    assert.deepEqual(generateWordsearch(['uno', 'dos', 'tres', 'cuatro', '', ' ', 'a', 'UNO', 'Dos']), {
      ok: false,
      reason: 'tooFew',
    });
    assert.ok(generateWordsearch(['uno', 'dos', 'tres', 'cuatro', 'cinco']).ok);
  });

  it('a word longer than the grid can be is reported', () => {
    const long = 'electroencefalografista12345';
    assert.deepEqual(generateWordsearch([...COLORS.slice(0, 4), long]), { ok: false, reason: 'tooLong', word: long });
  });

  it('the grid grows for many words, and the 30 longest still fit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `palabra${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${i}`);
    const { grid, placements } = generated(many);
    const rows = gridRows(grid);
    assert.equal(placements.length, 30);
    assert.ok(placements.every((placement) => isPlacementIntact(rows, placement)));
  });

  it('words that cannot all fit are named', () => {
    // 30 words of 20 letters, all different: 600 cells of words in at most 400.
    const crowded = Array.from(
      { length: 30 },
      (_, i) => String.fromCharCode(97 + (i % 26)).repeat(19) + (i < 26 ? 'z' : 'y'),
    );
    const result = generateWordsearch(crowded, seeded(3));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'noRoom');
  });
});

describe('wordsearch: selection and the lock', () => {
  const grid = ['ROJOX', 'AZULX', 'XXXXX'];
  const rows = gridRows(grid);

  it('a drag snaps to a horizontal or a vertical line, listed to the right / down', () => {
    const cells = (list: Cell[]) => list.map((cell) => `${cell.row},${cell.col}`).join(' ');
    assert.equal(cells(selectionCells({ row: 0, col: 0 }, { row: 1, col: 3 })), '0,0 0,1 0,2 0,3');
    assert.equal(cells(selectionCells({ row: 0, col: 1 }, { row: 2, col: 2 })), '0,1 1,1 2,1');
    // Backwards is the same line.
    assert.equal(cells(selectionCells({ row: 0, col: 3 }, { row: 0, col: 0 })), '0,0 0,1 0,2 0,3');
    assert.equal(cells(selectionCells({ row: 1, col: 1 }, { row: 1, col: 1 })), '1,1');
  });

  it("a selection that spells a word finds it, in the teacher's spelling", () => {
    const find = (a: Cell, b: Cell) => wordInSelection(rows, selectionCells(a, b), ['Rojo', 'azul', 'verde']);
    assert.equal(find({ row: 0, col: 0 }, { row: 0, col: 3 }), 'Rojo');
    assert.equal(find({ row: 1, col: 0 }, { row: 1, col: 3 }), 'azul');
    assert.equal(find({ row: 0, col: 0 }, { row: 0, col: 2 }), undefined);
    assert.equal(find({ row: 0, col: 0 }, { row: 1, col: 0 }), undefined);
  });

  it('the cells of the words are locked, the rest is free to change', () => {
    const placements: WordsearchPlacement[] = [{ word: 'rojo', row: 0, col: 0, dir: 'right' }];
    const locked = lockedCells(placements);
    assert.deepEqual([...locked].sort(), ['0,0', '0,1', '0,2', '0,3']);
  });
});

describe('wordsearch: in the lesson', () => {
  const block = (changes: object) => ({
    id: 'b1',
    type: 'wordsearch' as const,
    words: ['rojo', 'azul'],
    grid: ['ROJOX', 'AZULX', 'XXXXX'],
    placements: [
      { word: 'rojo', row: 0, col: 0, dir: 'right' as const },
      { word: 'azul', row: 1, col: 0, dir: 'right' as const },
    ],
    ...changes,
  });

  it('is an answer block', () => assert.ok(isAnswerType('wordsearch')));

  it('is valid in a lesson, also half filled in', () => {
    const lesson = (b: object) => ({
      version: 2,
      chapters: [{ id: 'c1', exercises: [{ id: 'e1', title: 'Colores', blocks: [b] }] }],
    });
    assert.ok(lessonContentSchema.safeParse(lesson(block({}))).success);
    assert.ok(lessonContentSchema.safeParse(lesson(block({ words: [], grid: [], placements: [] }))).success);
    assert.ok(
      !lessonContentSchema.safeParse(lesson(block({ placements: [{ word: 'x', row: 0, col: 0, dir: 'up' }] }))).success,
    );
    assert.ok(!lessonContentSchema.safeParse(lesson(block({ words: Array(31).fill('a') }))).success);
  });

  it('plays only the words that really lie in the grid', () => {
    const whole = block({});
    assert.equal(toPlayableBlock(whole), whole);
    // A word the grid does not hold (the grid is older than the placement) is left out.
    const stale = toPlayableBlock(block({ grid: ['RXJOX', 'AZULX', 'XXXXX'] }));
    assert.ok(stale && stale.type === 'wordsearch');
    assert.deepEqual(
      stale.placements.map((p) => p.word),
      ['azul'],
    );
    // Nothing placed, or nothing left: nothing to show.
    assert.equal(toPlayableBlock(block({ placements: [] })), null);
    assert.equal(toPlayableBlock(block({ grid: ['XXXXX'] })), null);
    // A placement that sticks out of the grid is not intact.
    assert.equal(toPlayableBlock(block({ placements: [{ word: 'rojos', row: 0, col: 2, dir: 'right' }] })), null);
  });
});

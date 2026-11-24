import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  eraseHighlight,
  type Highlight,
  isMarked,
  locateQuote,
  markHighlight,
  paintHighlight,
  rebaseHighlights,
} from '@cuadrilo/shared/highlights';

const h = (start: number, end: number, color: Highlight['color'] = 'red'): Highlight => ({ start, end, color });

/** Highlights of an essay (shared/src/highlights.ts): painting, erasing, following the student's edits. */
describe('highlights', () => {
  describe('paint and erase', () => {
    it('paints over what was there, like a marker', () => {
      const list = [h(0, 5, 'red'), h(10, 20, 'green')];
      assert.deepEqual(paintHighlight(list, 3, 12, 'blue'), [h(0, 3, 'red'), h(3, 12, 'blue'), h(12, 20, 'green')]);
    });

    it('joins touching parts of one colour', () => {
      assert.deepEqual(paintHighlight([h(0, 5)], 5, 9, 'red'), [h(0, 9)]);
      assert.deepEqual(paintHighlight([h(0, 5)], 5, 9, 'green'), [h(0, 5), h(5, 9, 'green')]);
    });

    it('erases a part: the edges are cut, the middle splits one in two', () => {
      assert.deepEqual(eraseHighlight([h(0, 10)], 3, 6), [h(0, 3), h(6, 10)]);
      assert.deepEqual(eraseHighlight([h(0, 4), h(6, 9)], 3, 7), [h(0, 3), h(7, 9)]);
      assert.deepEqual(eraseHighlight([h(2, 4)], 0, 10), []);
    });

    it('an empty range changes nothing', () => {
      const list = [h(1, 3)];
      assert.equal(paintHighlight(list, 5, 5, 'red'), list);
    });
  });

  describe('lines through and under, next to the colour', () => {
    const strike = (start: number, end: number, more: Partial<Highlight> = {}): Highlight => ({
      start,
      end,
      strike: true,
      ...more,
    });

    it('a mark is added to a part without touching its colour, and a colour without touching the marks', () => {
      assert.deepEqual(markHighlight([h(0, 10, 'red')], 2, 6, { strike: true }), [
        h(0, 2, 'red'),
        strike(2, 6, { color: 'red' }),
        h(6, 10, 'red'),
      ]);
      assert.deepEqual(paintHighlight([strike(0, 10)], 2, 6, 'blue'), [
        strike(0, 2),
        strike(2, 6, { color: 'blue' }),
        strike(6, 10),
      ]);
    });

    it('marks go on the gaps too, and over several highlights', () => {
      assert.deepEqual(markHighlight([h(0, 3, 'red'), h(6, 9, 'green')], 1, 8, { underline: 'wave' }), [
        h(0, 1, 'red'),
        { start: 1, end: 3, color: 'red', underline: 'wave' },
        { start: 3, end: 6, underline: 'wave' },
        { start: 6, end: 8, color: 'green', underline: 'wave' },
        h(8, 9, 'green'),
      ]);
    });

    it('a part has one underline: the new one replaces the old; null takes it off', () => {
      assert.deepEqual(markHighlight([{ start: 0, end: 5, underline: 'line' }], 0, 5, { underline: 'wave' }), [
        { start: 0, end: 5, underline: 'wave' },
      ]);
      assert.deepEqual(
        markHighlight([{ start: 0, end: 5, underline: 'wave', color: 'red' }], 0, 5, { underline: null }),
        [h(0, 5, 'red')],
      );
    });

    it('taking the last mark off removes the highlight; the pieces join again', () => {
      assert.deepEqual(markHighlight([strike(0, 10)], 0, 10, { strike: false }), []);
      assert.deepEqual(
        markHighlight([strike(0, 2), strike(2, 6, { color: 'red' })], 2, 6, { color: undefined, strike: true }),
        [strike(0, 2), strike(2, 6, { color: 'red' })],
      );
      assert.deepEqual(markHighlight(markHighlight([strike(0, 10)], 3, 5, { strike: false }), 3, 5, { strike: true }), [
        strike(0, 10),
      ]);
    });

    it('the eraser clears every mark; an empty range changes nothing', () => {
      assert.deepEqual(eraseHighlight([strike(0, 10, { color: 'red', underline: 'line' })], 0, 4), [
        strike(4, 10, { color: 'red', underline: 'line' }),
      ]);
      const list = [strike(1, 3)];
      assert.equal(markHighlight(list, 4, 4, { strike: true }), list);
    });

    it('isMarked: every character of the range has the mark', () => {
      const list = [strike(0, 4), strike(4, 8, { color: 'red' }), strike(10, 12)];
      const on = (h: Highlight) => !!h.strike;
      assert.equal(isMarked(list, 1, 7, on), true, 'across two touching parts');
      assert.equal(isMarked(list, 6, 11, on), false, 'a gap');
      assert.equal(isMarked(list, 10, 12, on), true);
      assert.equal(isMarked([], 0, 3, on), false);
      assert.equal(
        isMarked(list, 0, 8, (h) => h.color === 'red'),
        false,
      );
    });

    it('marks follow the student editing like colours', () => {
      assert.deepEqual(rebaseHighlights('abcdefgh', 'XXabcdefgh', [strike(2, 5, { underline: 'wave' })]), [
        strike(4, 7, { underline: 'wave' }),
      ]);
    });
  });

  describe('locateQuote', () => {
    it('positions are right when the text there is the quote', () => {
      assert.deepEqual(locateQuote('the professor and the professor', { start: 22, end: 31, quote: 'professor' }), {
        start: 22,
        end: 31,
      });
    });

    it('after an edit: the quote nearest to where it was', () => {
      const text = 'Hola. the professor and the professor';
      // The teacher saw the second one at 22..31 before "Hola. " was added: now at 28..37.
      assert.deepEqual(locateQuote(text, { start: 22, end: 31, quote: 'professor' }), { start: 28, end: 37 });
      assert.deepEqual(locateQuote(text, { start: 5, end: 14, quote: 'professor' }), { start: 10, end: 19 });
    });

    it('gone: nothing', () => {
      assert.equal(locateQuote('Hola', { start: 0, end: 3, quote: 'profe' }), undefined);
    });
  });

  describe('rebaseHighlights follows the student editing', () => {
    // "Yo soy professor aqui": "professor" is 7..16.
    const text = 'Yo soy professor aqui';
    const list = [h(7, 16)];

    it('a text that did not change: the same list', () => {
      assert.equal(rebaseHighlights(text, text, list), list);
    });

    it('typing before moves it, typing after leaves it', () => {
      assert.deepEqual(rebaseHighlights(text, `Hola. ${text}`, list), [h(13, 22)]);
      assert.deepEqual(rebaseHighlights(text, `${text} mucho`, list), list);
    });

    it('typing at its edges does not take the new text in', () => {
      assert.deepEqual(rebaseHighlights(text, 'Yo soy  professor aqui', list), [h(8, 17)], 'right before');
      assert.deepEqual(rebaseHighlights(text, 'Yo soy professor! aqui', list), list, 'right after');
    });

    it('typing in the middle of it keeps it, longer or shorter', () => {
      assert.deepEqual(rebaseHighlights(text, 'Yo soy profesor aqui', list), [h(7, 15)], 'a letter deleted');
      assert.deepEqual(rebaseHighlights(text, 'Yo soy proffessor aqui', list), [h(7, 17)], 'a letter added');
    });

    it('deleting the end or the start cuts it back', () => {
      assert.deepEqual(rebaseHighlights(text, 'Yo soy professo aqui', list), [h(7, 15)]);
      assert.deepEqual(rebaseHighlights(text, 'Yo soy rofessor aqui', list), [h(7, 15)]);
    });

    it('replacing all of it removes it: the student corrected it', () => {
      assert.deepEqual(rebaseHighlights(text, 'Yo soy maestra aqui', list), []);
      assert.deepEqual(rebaseHighlights(text, 'Yo soy aqui', list), []);
    });

    it('a change over the edge cuts what is left', () => {
      assert.deepEqual(rebaseHighlights('abcdefghij', 'abcdXYZhij', [h(2, 5)]), [h(2, 4)]);
      assert.deepEqual(rebaseHighlights('abcdefghij', 'abcdXYZhij', [h(5, 9)]), [h(7, 9)]);
    });

    it('several highlights move together; the ones in a replaced part go', () => {
      const essay = 'one two six four';
      const marks = [h(0, 3, 'green'), h(4, 7, 'red'), h(12, 16, 'blue')];
      assert.deepEqual(rebaseHighlights(essay, 'one six four', marks), [h(0, 3, 'green'), h(8, 12, 'blue')]);
    });
  });
});

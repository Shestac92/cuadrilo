/**
 * Dictation: how what the student typed is compared with the right sentence.
 * Words are compared whole: the case does not matter, the accents and the
 * punctuation stuck to a word do ("esta" and "está", "casa," and "casa" are
 * different words). The two word lists are aligned (the longest common
 * subsequence), so one missed or extra word does not turn the rest of the
 * sentence red.
 */

export const DICTATION_MAX_SENTENCES = 30;
export const DICTATION_TEXT_MAX = 500;

/** A word of the student's answer as it is shown after the check. */
export interface DictationWord {
  text: string;
  /** 'missing': a word of the right sentence the student left out (marked where it belongs, never shown). */
  kind: 'ok' | 'wrong' | 'missing';
}

/** What the player saves, by sentence position: the last checked text of each and whether that sentence was checked. */
export interface DictationState {
  answers: string[];
  checked: boolean[];
}

const wordsOf = (text: string) => text.normalize('NFC').split(/\s+/).filter(Boolean);
const keyOf = (word: string) => word.toLocaleLowerCase('es');

/** The student's words, each right or wrong, with a "missing" mark wherever the right sentence has words they left out. */
export function alignDictation(expected: string, typed: string): DictationWord[] {
  const right = wordsOf(expected);
  const mine = wordsOf(typed);
  const n = right.length;
  const m = mine.length;
  // lcs[i][j]: the common words of right[i..] and mine[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = keyOf(right[i]) === keyOf(mine[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DictationWord[] = [];
  let i = 0;
  let j = 0;
  // Words of both lists since the last common word.
  let extra: string[] = [];
  let left = 0;
  const closeGap = () => {
    for (const text of extra) result.push({ text, kind: 'wrong' });
    // A wrong word stands in for a missing one: a mark is needed only for the words left over.
    for (let k = extra.length; k < left; k++) result.push({ text: '…', kind: 'missing' });
    extra = [];
    left = 0;
  };
  while (i < n || j < m) {
    if (i < n && j < m && keyOf(right[i]) === keyOf(mine[j]) && lcs[i][j] === lcs[i + 1][j + 1] + 1) {
      closeGap();
      result.push({ text: mine[j], kind: 'ok' });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      extra.push(mine[j++]);
    } else {
      left++;
      i++;
    }
  }
  closeGap();
  return result;
}

/** Whether the whole sentence is right. */
export const isDictationRight = (expected: string, typed: string) =>
  alignDictation(expected, typed).every((word) => word.kind === 'ok');

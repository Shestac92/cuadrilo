import { wordLetters } from '@cuadrilo/shared/lesson';
import { useDroppable } from '@dnd-kit/core';
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useMemo } from 'react';

import { t } from '../i18n';
import { Celebration, type ItemState } from './Exercise';
import { PlacementArea, type Word, WordChip, type WordDnd } from './placement';
import { useBlockState } from './sync';
import { shuffle } from './text';
import { useViewMode } from './viewMode';

interface WordState {
  /** The letters in their shuffled order (id: `<word>-<n>`, n = the place in the word), so the teacher sees the same pool. */
  letters: Word[];
  /** Letter id in each cell. */
  placed: (string | null)[];
  /** Set by the check button; any move clears it. */
  result: ItemState;
}

interface BuildState {
  words: WordState[];
}

const poolId = (word: number) => `pool-${word}`;
const cellId = (word: number, cell: number) => `cell-${word}-${cell}`;
const wordOf = (letterId: string) => Number(letterId.split('-')[0]);

const freshWord = (text: string, word: number): WordState => {
  const letters = wordLetters(text)
    .flat()
    .map((letter, i) => ({ id: `${word}-${i}`, text: letter }));
  return {
    // Never the word itself.
    letters: shuffle(letters, (a, b) => a.every((l, i) => l.text === b[i].text)),
    placed: letters.map(() => null),
    result: null,
  };
};

/**
 * Build words from their letters: each word has its letters shuffled in a
 * pool, and one cell per letter below; the student puts the letters into the
 * cells (drag, or a click: a letter in the pool goes to the first empty cell,
 * a placed one goes back). The result shows only after the check button, which
 * is active once all the cells are filled; a wrong word can be rebuilt. The
 * optional hint (e.g. the word in the student's language) is above the pool.
 *
 * The teacher's view is read-only: the right word at once, in grey cells, and
 * under it what the student has built (if the student has started).
 */
export function BuildWordBlock({ id, words }: { id: string; words: { text: string; hint?: string }[] }) {
  const fresh = useMemo(() => words.map((word, w) => freshWord(word.text, w)), [words]);
  const [state, setState, readOnly, hasState] = useBlockState<BuildState>(id, () => ({ words: fresh }));

  // A saved state of a word that was edited since (another number of letters) starts again.
  const wordAt = (s: BuildState, w: number): WordState => {
    const saved = s.words[w];
    return saved && saved.letters.length === fresh[w].letters.length ? saved : fresh[w];
  };
  const update = (w: number, change: (word: WordState) => WordState) =>
    setState((s) => ({ words: words.map((_, i) => (i === w ? change(wordAt(s, i)) : wordAt(s, i))) }));

  const teacherView = useViewMode() === 'teacher';
  const current = words.map((_, w) => wordAt(state, w));
  const letterById = (letterId: string | null) =>
    letterId ? current[wordOf(letterId)]?.letters.find((l) => l.id === letterId) : undefined;

  const isLocked = (letterId: string) => readOnly || current[wordOf(letterId)]?.result === 'ok';

  /** A letter into a cell or back into its own pool; a letter already in that cell goes back (or swaps places). */
  const move = (letterId: string, target: string) => {
    if (isLocked(letterId)) return;
    const w = wordOf(letterId);
    update(w, (word) => {
      const placed = [...word.placed];
      const from = placed.indexOf(letterId);
      if (target === poolId(w)) {
        if (from < 0) return word;
        placed[from] = null;
      } else {
        const match = new RegExp(`^cell-${w}-(\\d+)$`).exec(target);
        if (!match) return word;
        const to = Number(match[1]);
        if (from === to) return word;
        const previous = placed[to];
        placed[to] = letterId;
        if (from >= 0) placed[from] = previous;
      }
      return { ...word, placed, result: null };
    });
  };

  const clickLetter = (letterId: string) => {
    const word = current[wordOf(letterId)];
    if (word.placed.includes(letterId)) return move(letterId, poolId(wordOf(letterId)));
    const empty = word.placed.indexOf(null);
    if (empty >= 0) move(letterId, cellId(wordOf(letterId), empty));
  };

  const check = (w: number) =>
    update(w, (word) => {
      const built = word.placed.map((letterId) => word.letters.find((l) => l.id === letterId)?.text).join('');
      const right = wordLetters(words[w].text).flat().join('');
      return { ...word, result: built === right ? 'ok' : 'bad' };
    });

  const dnd: WordDnd = {
    bank: [],
    wordById: letterById,
    isLocked,
    move,
    clickWord: clickLetter,
    readOnly,
    letters: true,
  };

  return (
    <div className="ex-letters ex-interactive">
      <PlacementArea placement={dnd}>
        {words.map((word, w) => {
          const { letters, placed, result } = current[w];
          const groups = wordLetters(word.text);
          const hint = word.hint?.trim();
          const locked = readOnly || result === 'ok';
          let cell = 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's words in their fixed order: the position is their identity.
            <div key={w} className="letters-item">
              {hint && (
                <Text fw={600} size="lg" ta="center">
                  {hint}
                </Text>
              )}
              {/* The right word, built: grey cells. */}
              {teacherView && (
                <div className="letters-row key" title={t('viewMode.rightAnswer')}>
                  {groups.map((group, g) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the letters of the word, never reordered.
                    <span key={g} className="letters-group">
                      {group.map((letter, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: the letters of the word, never reordered.
                        <span key={i} className="drop-gap letter-cell filled">
                          <span className="word-chip locked">{letter}</span>
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              )}
              {(!teacherView || hasState) && (
                <div className="letters-board">
                  <LetterPool word={w} letters={letters} placed={placed} placement={dnd} />
                  <div className="letters-divider" />
                  <div className="letters-row">
                    {groups.map((group, g) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: the letters of the word, never reordered.
                      <span key={g} className="letters-group">
                        {group.map(() => {
                          const index = cell++;
                          return (
                            <LetterCell
                              key={index}
                              word={w}
                              index={index}
                              letter={letterById(placed[index])}
                              result={result}
                              locked={locked}
                              placement={dnd}
                            />
                          );
                        })}
                      </span>
                    ))}
                    {!locked && (
                      <Tooltip label={t('exercise.check')}>
                        <ActionIcon
                          variant="filled"
                          color={result === 'bad' ? 'red' : undefined}
                          size="lg"
                          radius="xl"
                          aria-label={t('exercise.checkWord', { n: w + 1 })}
                          disabled={placed.some((letterId) => letterId === null)}
                          onClick={() => check(w)}
                        >
                          <IconCheck size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </PlacementArea>
      <Celebration active={!readOnly && current.every((word) => word.result === 'ok')} />
    </div>
  );
}

/**
 * The letters, each in its own place (the same size and spacing as the cells
 * above, so they line up); a placed letter leaves its place empty. A placed
 * letter dropped on the pool goes back.
 */
function LetterPool({
  word,
  letters,
  placed,
  placement,
}: {
  word: number;
  letters: Word[];
  placed: (string | null)[];
  placement: WordDnd;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: poolId(word), disabled: placement.readOnly });
  return (
    <div ref={setNodeRef} className={`letter-pool ${isOver ? 'over' : ''}`}>
      {letters.map((letter) => (
        <span key={letter.id} className="letter-slot">
          {!placed.includes(letter.id) && <WordChip word={letter} placement={placement} />}
        </span>
      ))}
    </div>
  );
}

/** One cell: one letter. */
function LetterCell({
  word,
  index,
  letter,
  result,
  locked,
  placement,
}: {
  word: number;
  index: number;
  letter: Word | undefined;
  result: ItemState;
  locked: boolean;
  placement: WordDnd;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(word, index), disabled: locked });
  return (
    <span
      ref={setNodeRef}
      className={`drop-gap letter-cell ${isOver ? 'over' : ''} ${result ?? ''} ${letter ? 'filled' : ''}`}
    >
      {letter ? <WordChip word={letter} placement={placement} inSlot /> : <span aria-hidden>&nbsp;</span>}
    </span>
  );
}

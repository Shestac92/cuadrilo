import { useMemo } from 'react';

import { keyText } from './AnswerKey';
import { Celebration } from './Exercise';
import { initialPlacement, PlacementArea, usePlacement, WordBank, WordSlot } from './placement';
import { useBlockState } from './sync';
import { shuffle } from './text';
import { useViewMode } from './viewMode';

interface Pair {
  left: string;
  right: string;
}

/**
 * Match pairs: the left column is fixed; next to each left item there is a
 * slot, and the right items wait in a bank at the side. Each pair is checked as
 * soon as a word lands in its slot. Slots compare text, so repeated right items
 * ("una fruta" twice) are fine. Extra `distractors` go into the bank too.
 */
export function MatchBlock({ id, pairs, distractors = [] }: { id: string; pairs: Pair[]; distractors?: string[] }) {
  const slots = useMemo(() => pairs.map((pair) => ({ answers: [pair.right] })), [pairs]);
  const [state, setState, readOnly] = useBlockState(id, () =>
    initialPlacement(
      pairs.length,
      shuffle([
        ...pairs.map((pair, i) => ({ id: `r${i}`, text: pair.right })),
        ...distractors.map((d, i) => ({ id: `d${i}`, text: d })),
      ]),
    ),
  );
  const placement = usePlacement(slots, state, setState, readOnly);
  const teacherView = useViewMode() === 'teacher';
  // Bank words that belong to no pair (ids from the initial state above).
  const distractorIds = useMemo(
    () => new Set(state.words.filter((w) => w.id.startsWith('d')).map((w) => w.id)),
    [state.words],
  );

  return (
    <div className="ex-match ex-interactive">
      <PlacementArea placement={placement}>
        <div className="match-layout">
          <div className="match-grid">
            {pairs.map((pair, i) => {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's pairs in their fixed order: the position is their identity.
                <div key={i} className="match-row">
                  <div className="match-left">{pair.left}</div>
                  <div className="match-arrow" aria-hidden>
                    →
                  </div>
                  <WordSlot
                    index={i}
                    placement={placement}
                    wide
                    answerKey={teacherView ? keyText(slots[i].answers) : undefined}
                  />
                </div>
              );
            })}
          </div>
          <WordBank placement={placement} vertical distractorIds={teacherView ? distractorIds : undefined} />
        </div>
      </PlacementArea>
      <Celebration blockId={id} done={placement.allCorrect} />
    </div>
  );
}

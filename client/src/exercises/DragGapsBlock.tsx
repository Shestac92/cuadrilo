import { useMemo } from 'react';

import { keyText } from './AnswerKey';
import { Celebration } from './Exercise';
import { initialPlacement, PlacementArea, usePlacement, WordBank, WordSlot } from './placement';
import { useBlockState } from './sync';
import { gapsOf, parseGapText, shuffle } from './text';
import { useViewMode } from './viewMode';

/**
 * Drag words from a bank into the gaps of a text (`*answer*` marks a gap; the
 * first alternative is the word in the bank). Extra `distractors` go into the
 * bank too. Each gap is checked as soon as a word lands in it. A click also
 * works: a word in the bank goes to the first empty gap, a placed word goes back.
 */
export function DragGapsBlock({ id, text, distractors = [] }: { id: string; text: string; distractors?: string[] }) {
  const paragraphs = useMemo(() => parseGapText(text), [text]);
  const gaps = useMemo(() => gapsOf(paragraphs), [paragraphs]);
  const [state, setState, readOnly] = useBlockState(id, () =>
    initialPlacement(
      gaps.length,
      shuffle([
        ...gaps.map((gap) => ({ id: `w${gap.index}`, text: gap.answers[0] })),
        ...distractors.map((d, i) => ({ id: `d${i}`, text: d })),
      ]),
    ),
  );
  const placement = usePlacement(gaps, state, setState, readOnly);
  const teacherView = useViewMode() === 'teacher';
  // Bank words that belong to no gap (ids from the initial state above).
  const distractorIds = useMemo(
    () => new Set(state.words.filter((w) => w.id.startsWith('d')).map((w) => w.id)),
    [state.words],
  );

  return (
    <div className="ex-drag-gaps ex-interactive">
      <PlacementArea placement={placement}>
        <WordBank placement={placement} distractorIds={teacherView ? distractorIds : undefined} />
        <div className="ex-gap-text">
          {paragraphs.map((parts, p) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
            <p key={p}>
              {parts.map((part, i) => {
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
                if (part.kind === 'text') return <span key={i}>{part.text}</span>;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
                  <span key={i} className="gap-wrap">
                    <WordSlot
                      index={part.index}
                      placement={placement}
                      answerKey={teacherView ? keyText(part.answers) : undefined}
                    />
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      </PlacementArea>
      <Celebration active={!readOnly && placement.allCorrect} />
    </div>
  );
}

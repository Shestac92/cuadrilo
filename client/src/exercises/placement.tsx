import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';

import { t } from '../i18n';
import type { ItemState } from './Exercise';
import { matches } from './text';

/**
 * "Put words into slots" mechanics shared by DragGapsBlock (gaps in a text)
 * and MatchBlock (the right half of each pair): a bank of words, slots that
 * each accept one word, and a check as soon as a word lands in a slot.
 * A correct word locks; a wrong one stays (red) and can be moved again.
 */

export interface Word {
  id: string;
  text: string;
}

export const BANK = 'bank';
export const slotId = (index: number) => `slot-${index}`;

/** The whole state of a placement block: synced as is (useBlockState). */
export interface PlacementState {
  /** The words in their shuffled order, so the teacher sees the same bank. */
  words: Word[];
  /** Word id in each slot. */
  placed: (string | null)[];
}

export const initialPlacement = (slotCount: number, words: Word[]): PlacementState => ({
  words,
  placed: Array.from({ length: slotCount }, () => null),
});

/** Each slot checked: empty, right word, or wrong. */
export function placementItemStates(slots: { answers: string[] }[], state: PlacementState): ItemState[] {
  return slots.map((slot, i) => {
    const word = state.words.find((w) => w.id === state.placed[i]);
    if (!word) return null;
    if (matches(word.text, slot.answers)) return 'ok';
    return 'bad';
  });
}

/** `readOnly`: the teacher's view, nothing can be moved. */
export function usePlacement(
  slots: { answers: string[] }[],
  state: PlacementState,
  setState: Dispatch<SetStateAction<PlacementState>>,
  readOnly: boolean,
) {
  const { words, placed } = state;
  const setPlaced = (update: (current: (string | null)[]) => (string | null)[]) =>
    setState((s) => ({ ...s, placed: update(s.placed) }));

  const wordById = (id: string | null) => words.find((w) => w.id === id);
  const states = placementItemStates(slots, state);
  const isLocked = (wordId: string) => readOnly || states[placed.indexOf(wordId)] === 'ok';

  /** Puts a word into a slot (or back into the bank); a wrong word already in that slot swaps places with it. */
  const move = (wordId: string, target: string) => {
    if (isLocked(wordId)) return;
    setPlaced((current) => {
      const next = [...current];
      const from = next.indexOf(wordId);
      if (target === BANK) {
        if (from >= 0) next[from] = null;
        return next;
      }
      const to = Number(target.slice('slot-'.length));
      if (from === to || states[to] === 'ok') return current;
      const previous = next[to];
      next[to] = wordId;
      if (from >= 0) next[from] = previous; // swap; from the bank the previous word returns to the bank
      return next;
    });
  };

  /** Click: a word in the bank goes to the first empty slot, a placed word goes back. */
  const clickWord = (wordId: string) => {
    if (placed.includes(wordId)) return move(wordId, BANK);
    const empty = placed.indexOf(null);
    if (empty >= 0) move(wordId, slotId(empty));
  };

  return {
    placed,
    states,
    bank: words.filter((w) => !placed.includes(w.id)),
    wordById,
    isLocked,
    move,
    clickWord,
    readOnly,
    allCorrect: states.every((s) => s === 'ok'),
  };
}

export type Placement = ReturnType<typeof usePlacement>;

/** What the shared drag-and-drop pieces need of a block: SortBlock has its own state around it. */
export type WordDnd = Pick<Placement, 'bank' | 'wordById' | 'isLocked' | 'move' | 'clickWord' | 'readOnly'> & {
  /** The chips are single letters (not words to translate): a click on one never opens the translator. */
  letters?: boolean;
};

/** Drag-and-drop context for one element: sensors, drop handling and the dragged word's overlay. */
export function PlacementArea({ placement, children }: { placement: WordDnd; children: ReactNode }) {
  const [dragging, setDragging] = useState<Word>();
  const sensors = useSensors(
    // A small move starts a drag; a plain click stays a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = ({ active }: DragStartEvent) => setDragging(placement.wordById(String(active.id)));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(undefined);
    if (over) placement.move(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(undefined)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging && <span className="word-chip overlay">{dragging.text}</span>}
      </DragOverlay>
    </DndContext>
  );
}

export function WordBank({
  placement,
  vertical,
  distractorIds,
}: {
  placement: WordDnd;
  vertical?: boolean;
  /** The teacher's view: words that belong nowhere are marked. */
  distractorIds?: ReadonlySet<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK, disabled: placement.readOnly });
  return (
    // biome-ignore lint/a11y/useSemanticElements: a drop zone of word chips (dnd-kit), not a group of form fields: <fieldset> would bring form semantics and styling.
    <div
      ref={setNodeRef}
      className={`word-bank ${vertical ? 'vertical' : ''} ${isOver ? 'over' : ''}`}
      role="group"
      aria-label={t('exercise.words')}
    >
      {placement.bank.length === 0 && <span className="word-bank-empty">{t('exercise.allPlaced')}</span>}
      {placement.bank.map((word) => (
        <WordChip key={word.id} word={word} placement={placement} distractor={distractorIds?.has(word.id)} />
      ))}
    </div>
  );
}

/** A slot for one word: a gap in a text or the right half of a pair. */
export function WordSlot({
  index,
  placement,
  wide,
  answerKey,
}: {
  index: number;
  placement: Placement;
  wide?: boolean;
  /** The teacher's view: the right answer, in grey in an empty slot and next to a wrong word. */
  answerKey?: string;
}) {
  const state = placement.states[index];
  const word = placement.wordById(placement.placed[index]);
  const { setNodeRef, isOver } = useDroppable({
    id: slotId(index),
    disabled: placement.readOnly || state === 'ok',
  });
  return (
    <span
      ref={setNodeRef}
      className={`drop-gap ${wide ? 'wide' : ''} ${isOver ? 'over' : ''} ${state ?? ''} ${word ? 'filled' : ''}`}
    >
      {word ? (
        <WordChip word={word} placement={placement} inSlot />
      ) : answerKey ? (
        <span className="gap-key-ghost" title={t('viewMode.rightAnswer')}>
          {answerKey}
        </span>
      ) : (
        <span aria-hidden>&nbsp;</span>
      )}
      {answerKey && state === 'bad' && (
        <span className="gap-key" title={t('viewMode.rightAnswer')}>
          {answerKey}
        </span>
      )}
    </span>
  );
}

export function WordChip({
  word,
  placement,
  inSlot,
  distractor,
}: {
  word: Word;
  placement: WordDnd;
  inSlot?: boolean;
  distractor?: boolean;
}) {
  const locked = placement.isLocked(word.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: word.id, disabled: locked });
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: dnd-kit's `attributes` make it role="button" with tabIndex, and its KeyboardSensor handles the keys.
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`word-chip ${inSlot ? 'in-gap' : ''} ${isDragging ? 'dragging' : ''} ${locked ? 'locked' : ''} ${distractor ? 'distractor' : ''}`}
      title={distractor ? t('viewMode.distractor') : undefined}
      onClick={() => !locked && placement.clickWord(word.id)}
    >
      {word.text}
    </span>
  );
}

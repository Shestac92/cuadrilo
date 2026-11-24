import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { t } from '../i18n';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { normalize, shuffle } from './text';
import { useViewMode } from './viewMode';

interface OrderState {
  /** Word ids of each sentence in the student's order. */
  orders: string[][];
  states: ItemState[];
}

interface Sentence {
  /** Opening ¿ / ¡, shown fixed so they don't give away the first word. */
  start: string;
  words: string[];
  /** Final punctuation, shown fixed after the words. */
  end: string;
}

function splitSentence(sentence: string): Sentence {
  // Always matches (every part may be empty).
  const [, start = '', words = '', end = ''] = sentence.trim().match(/^([¿¡]*)(.*?)([.?!…]*)$/s) ?? [];
  return { start, words: words.trim().split(/\s+/), end };
}

/**
 * Put the words of each sentence in order ("como manzanas yo" → "Yo como
 * manzanas."). `sentences` are given in the correct order; words are shuffled
 * for the student. Each sentence has its own check button: a correct sentence
 * locks green, a wrong one turns red until its words are moved again.
 */
export function OrderBlock({ id, sentences }: { id: string; sentences: { text: string; hint?: string }[] }) {
  const [parsed] = useState(() => sentences.map((s) => splitSentence(s.text)));
  const correctIds = parsed.map((s, row) => s.words.map((_, i) => `${row}-${i}`));
  const textOf = (id: string) => {
    const [row, i] = id.split('-').map(Number);
    return parsed[row].words[i];
  };
  const sameText = (a: string[], b: string[]) => a.every((id, i) => normalize(textOf(id)) === normalize(textOf(b[i])));

  // Every reorder is part of the state, so the teacher sees the sentence being built.
  const [state, setState, readOnly, hasState] = useBlockState<OrderState>(id, () => ({
    orders: correctIds.map((ids) => shuffle(ids, sameText)),
    states: parsed.map(() => null),
  }));
  const { orders, states } = state;
  const teacherView = useViewMode() === 'teacher';

  const setRow = <T,>(list: T[], row: number, value: T) => list.map((old, r) => (r === row ? value : old));

  const reorder = (row: number, ids: string[]) =>
    // A moved sentence is unchecked again.
    setState((s) => ({ orders: setRow(s.orders, row, ids), states: setRow(s.states, row, null) }));

  const check = (row: number) =>
    setState((s) => ({
      ...s,
      states: setRow(s.states, row, sameText(s.orders[row], correctIds[row]) ? 'ok' : 'bad'),
    }));

  return (
    <div className="ex-order ex-interactive">
      {parsed.map((sentence, row) => {
        const itemState = states[row];
        const locked = readOnly || itemState === 'ok';
        const hint = sentences[row].hint?.trim();
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's sentences in their fixed order: the position is their identity.
          <div key={row} className="order-item">
            {/* The number is always on its own line above the sentence (never beside it, however the words wrap). */}
            <span className="order-number">{row + 1}.</span>
            <div className="order-row">
              {/* The teacher's view: the right sentence at once, in grey; the student's own order (if any) under it. */}
              {teacherView && (
                <div className="order-words key" title={t('viewMode.rightAnswer')}>
                  {sentence.start && <span className="order-punct">{sentence.start}</span>}
                  {sentence.words.map((word, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the words of the right sentence in their fixed order.
                    <span key={i} className="word-chip locked">
                      {word}
                    </span>
                  ))}
                  {sentence.end && <span className="order-punct">{sentence.end}</span>}
                </div>
              )}
              {(!teacherView || hasState) && (
                <SortableRow
                  ids={orders[row]}
                  textOf={textOf}
                  start={sentence.start}
                  end={sentence.end}
                  locked={locked}
                  state={itemState ?? ''}
                  onChange={(ids) => reorder(row, ids)}
                />
              )}
              {!locked && (
                <Tooltip label={t('exercise.check')}>
                  <ActionIcon
                    variant="filled"
                    color={itemState === 'bad' ? 'red' : undefined}
                    size="lg"
                    radius="xl"
                    aria-label={t('exercise.checkSentence', { n: row + 1 })}
                    onClick={() => check(row)}
                  >
                    <IconCheck size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
              {hint && (
                <Text size="sm" c="dimmed" className="order-hint">
                  {hint}
                </Text>
              )}
            </div>
          </div>
        );
      })}
      <Celebration active={!readOnly && states.every((s) => s === 'ok')} />
    </div>
  );
}

/** One sentence: its own drag-and-drop context, so words can't move to another sentence. */
function SortableRow({
  ids,
  textOf,
  start,
  end,
  locked,
  state,
  onChange,
}: {
  ids: string[];
  textOf: (id: string) => string;
  start: string;
  end: string;
  locked: boolean;
  state: string;
  onChange: (ids: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy} disabled={locked}>
        <div className={`order-words ${state}`}>
          {start && <span className="order-punct">{start}</span>}
          {ids.map((id) => (
            <SortableWord key={id} id={id} text={textOf(id)} locked={locked} />
          ))}
          {end && <span className="order-punct">{end}</span>}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableWord({ id, text, locked }: { id: string; text: string; locked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`word-chip ${isDragging ? 'dragging' : ''} ${locked ? 'locked' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {text}
    </span>
  );
}

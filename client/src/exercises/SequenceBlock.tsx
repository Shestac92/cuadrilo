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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconCheck, IconGripVertical } from '@tabler/icons-react';
import { t } from '../i18n';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { normalize, shuffle } from './text';
import { useViewMode } from './viewMode';

interface SequenceState {
  /** Item indexes (as strings: dnd ids) in the student's order. */
  order: string[];
  state: ItemState;
}

/**
 * Whole sentences or lines of a dialogue to put in order. `items` are given in
 * the right order and shuffled for the student, who drags them and checks the
 * order with the button: right locks green, wrong turns red until moved again.
 */
export function SequenceBlock({ id, items }: { id: string; items: string[] }) {
  const rightOrder = items.map((_, index) => String(index));
  // Two equal lines are interchangeable.
  const sameText = (a: string[], b: string[]) =>
    a.every((index, i) => normalize(items[Number(index)]) === normalize(items[Number(b[i])]));

  const [{ order, state }, setState, readOnly, hasState] = useBlockState<SequenceState>(id, () => ({
    order: shuffle(rightOrder, sameText),
    state: null,
  }));
  const locked = readOnly || state === 'ok';
  const teacherView = useViewMode() === 'teacher';
  // The teacher sees the student's order, or the right one when there is none; each line with its right number.
  const shown = teacherView && !hasState ? rightOrder : order;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    // A moved line unchecks the order again.
    setState((s) => ({
      order: arrayMove(s.order, s.order.indexOf(String(active.id)), s.order.indexOf(String(over.id))),
      state: null,
    }));
  };

  return (
    <div className="ex-sequence ex-interactive">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={locked}>
          <ol className={`sequence-list ${state ?? ''} ${teacherView && !hasState ? 'key' : ''}`}>
            {shown.map((index) => (
              <SequenceItem
                key={index}
                id={index}
                text={items[Number(index)]}
                locked={locked}
                rightNumber={teacherView ? Number(index) + 1 : undefined}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="ex-check">
        {!locked && (
          <Tooltip label={t('exercise.check')}>
            <ActionIcon
              variant="filled"
              color={state === 'bad' ? 'red' : undefined}
              size="lg"
              radius="xl"
              aria-label={t('exercise.checkOrder')}
              onClick={() => setState((s) => ({ ...s, state: sameText(s.order, rightOrder) ? 'ok' : 'bad' }))}
            >
              <IconCheck size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <Celebration blockId={id} done={state === 'ok'} />
    </div>
  );
}

function SequenceItem({
  id,
  text,
  locked,
  rightNumber,
}: {
  id: string;
  text: string;
  locked: boolean;
  /** The teacher's view: the line's place in the right order. */
  rightNumber?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`sequence-item ${isDragging ? 'dragging' : ''} ${locked ? 'locked' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {!locked && <IconGripVertical size={16} className="sequence-grip" aria-hidden />}
      <span>{text}</span>
      {rightNumber !== undefined && (
        <span className="sequence-key" title={t('viewMode.rightPlace')}>
          {rightNumber}
        </span>
      )}
    </li>
  );
}

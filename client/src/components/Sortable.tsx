import {
  type CollisionDetection,
  closestCenter,
  type DndContextProps,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/**
 * Lists the teacher reorders by dragging (dnd-kit): the lessons on the home
 * page, the exercises and the blocks of an exercise in the editor. An item moves only by its handle, so the
 * fields inside it keep working; the keyboard works too (the handle, space,
 * the arrows, space).
 */

/**
 * Mouse after 4 px (a click on the handle is not a drag), and the keyboard.
 * Items of very different heights take `itemKeyboardCoordinates` with `itemUnderPoint`.
 */
export function useSortSensors(coordinateGetter: KeyboardCoordinateGetter = sortableKeyboardCoordinates) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Instant scroll: with a smooth one the item under the dragged one is looked for before the page has moved.
    useSensor(KeyboardSensor, { coordinateGetter, scrollBehavior: 'auto' }),
  );
}

/**
 * Keyboard for tall items: ↓ / ↑ put the middle of what is dragged on the middle
 * of the next / previous item (dnd-kit's own step lands short of a tall item).
 */
export const itemKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  if (!step || !active || !collisionRect) return undefined;
  event.preventDefault();
  const rects = droppableContainers
    .getEnabled()
    .map((container) => ({ id: container.id, rect: droppableRects.get(container.id) }))
    .filter((entry) => entry.rect !== undefined)
    .sort((a, b) => (a.rect?.top ?? 0) - (b.rect?.top ?? 0));
  const from = rects.findIndex((entry) => entry.id === (over?.id ?? active.id));
  const target = rects[from + step]?.rect;
  if (from < 0 || !target) return currentCoordinates;
  return {
    x: currentCoordinates.x,
    y: currentCoordinates.y + (target.top + target.height / 2 - (collisionRect.top + collisionRect.height / 2)),
  };
};

/**
 * For items of very different heights (exercises): the item under the pointer
 * (with the keyboard, under the middle of what is dragged), else the closest one.
 * closestCenter alone compares centres, so a small preview dragged into the top
 * of a tall card would still count as over the card it came from.
 */
export const itemUnderPoint: CollisionDetection = (args) => {
  const { collisionRect, droppableRects, droppableContainers, pointerCoordinates } = args;
  const y = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2;
  const under = droppableContainers.find((container) => {
    const rect = droppableRects.get(container.id);
    return rect && y >= rect.top && y <= rect.bottom;
  });
  return under ? [{ id: under.id, data: { droppableContainer: under, value: 0 } }] : closestCenter(args);
};

/** The item of a sortable list on the page (`SortableItem` marks it). */
const itemTop = (id: string) =>
  document.querySelector(`[data-sort-id="${globalThis.CSS.escape(id)}"]`)?.getBoundingClientRect().top;

/**
 * A list of items of very different heights (exercises, blocks), reordered by
 * dragging. While one is dragged every item is folded to its header row
 * (`draggedId` is set: the list hides the rest of each item): otherwise the
 * places to drop moved under the pointer by a long item's height, and a short
 * drag jumped over two or three items. The page keeps its height while folded
 * and is scrolled so that the dragged item stays under the pointer when the
 * items fold and when they unfold after the drop. `onMove(id, overId)`: put
 * the item where `overId` is. Spread `dndProps` on the DndContext.
 */
export function useFoldingSort(onMove: (id: string, overId: string) => void) {
  const sensors = useSortSensors(itemKeyboardCoordinates);
  const [draggedId, setDraggedId] = useState<string>();
  /** The dragged item and where it is on the screen just before the items fold or unfold. */
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const keepInPlace = (id: string) => {
    const top = itemTop(id);
    anchor.current = top === undefined ? null : { id, top };
  };
  const end = (id: string) => {
    keepInPlace(id);
    setDraggedId(undefined);
  };
  useLayoutEffect(() => {
    if (!draggedId) document.documentElement.style.minHeight = '';
    const target = anchor.current;
    anchor.current = null;
    if (!target) return;
    const top = itemTop(target.id);
    if (top !== undefined) window.scrollBy(0, top - target.top);
  }, [draggedId]);

  const dndProps: DndContextProps = {
    sensors,
    collisionDetection: itemUnderPoint,
    // The items fold when the drag starts: their places are measured again.
    measuring: { droppable: { strategy: MeasuringStrategy.Always } },
    onDragStart: ({ active }) => {
      keepInPlace(String(active.id));
      // The folded page is much shorter: it keeps its height, so it can always be scrolled back under the pointer.
      document.documentElement.style.minHeight = `${document.documentElement.scrollHeight}px`;
      setDraggedId(String(active.id));
    },
    onDragEnd: ({ active, over }) => {
      end(String(active.id));
      if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
    },
    onDragCancel: ({ active }) => end(String(active.id)),
  };
  return { draggedId, dndProps };
}

/**
 * One item of a sortable list. `children` gets the handle (nothing when
 * `disabled`). `ghost`: while dragged, the item stays in place faded (a
 * DragOverlay shows what is being moved) instead of following the pointer.
 */
export function SortableItem({
  id,
  handleLabel,
  disabled = false,
  ghost = false,
  children,
}: {
  id: UniqueIdentifier;
  handleLabel: string;
  disabled?: boolean;
  ghost?: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const handle = !disabled && (
    <ActionIcon
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      variant="subtle"
      color="gray"
      aria-label={handleLabel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      <IconGripVertical size={18} />
    </ActionIcon>
  );
  return (
    <div
      ref={setNodeRef}
      data-sort-id={id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging && !ghost ? 1 : undefined,
        opacity: isDragging ? (ghost ? 0.4 : 0.85) : undefined,
      }}
    >
      {children(handle)}
    </div>
  );
}

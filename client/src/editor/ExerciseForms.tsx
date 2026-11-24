import type { Block, Exercise as LessonExercise } from '@cuadrilo/shared/lesson';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ActionIcon, Badge, Button, Group, Modal, Paper, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  type Icon,
  IconAbc,
  IconAlignLeft,
  IconArrowsLeftRight,
  IconArrowsSort,
  IconBrandYoutube,
  IconCategory,
  IconChartPie,
  IconCircleCheck,
  IconColumns2,
  IconEar,
  IconForms,
  IconHandGrab,
  IconHeadphones,
  IconLayoutGrid,
  IconListCheck,
  IconListNumbers,
  IconPhoto,
  IconPlus,
  IconPuzzle,
  IconSelector,
  IconTarget,
  IconTrash,
  IconWriting,
} from '@tabler/icons-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { SortableItem, useFoldingSort } from '../components/Sortable';
import { DialogTitle } from '../components/ui';
import { t } from '../i18n';
import { BlockForm, newBlock } from './BlockForms';

/** How each block type looks in the editor: its icon and name (every type must be here). */
const BLOCK_TYPE_INFO: Record<Block['type'], { icon: Icon; label: Parameters<typeof t>[0] }> = {
  text: { icon: IconAlignLeft, label: 'editor.blockType.text' },
  image: { icon: IconPhoto, label: 'editor.blockType.image' },
  compare: { icon: IconColumns2, label: 'editor.blockType.compare' },
  hotspots: { icon: IconTarget, label: 'editor.blockType.hotspots' },
  dictation: { icon: IconEar, label: 'editor.blockType.dictation' },
  wordsearch: { icon: IconLayoutGrid, label: 'editor.blockType.wordsearch' },
  genially: { icon: IconPuzzle, label: 'editor.blockType.genially' },
  video: { icon: IconBrandYoutube, label: 'editor.blockType.video' },
  audio: { icon: IconHeadphones, label: 'editor.blockType.audio' },
  essay: { icon: IconWriting, label: 'editor.blockType.essay' },
  gaps: { icon: IconForms, label: 'editor.blockType.gaps' },
  'drag-gaps': { icon: IconHandGrab, label: 'editor.blockType.dragGaps' },
  'dropdown-gaps': { icon: IconSelector, label: 'editor.blockType.dropdownGaps' },
  'build-word': { icon: IconAbc, label: 'editor.blockType.buildWord' },
  match: { icon: IconArrowsLeftRight, label: 'editor.blockType.match' },
  sort: { icon: IconCategory, label: 'editor.blockType.sort' },
  order: { icon: IconArrowsSort, label: 'editor.blockType.order' },
  choice: { icon: IconListCheck, label: 'editor.blockType.choice' },
  'true-false': { icon: IconCircleCheck, label: 'editor.blockType.trueFalse' },
  sequence: { icon: IconListNumbers, label: 'editor.blockType.sequence' },
  wheel: { icon: IconChartPie, label: 'editor.blockType.wheel' },
};

/** "+ Bloque" picker, in this order. */
const BLOCK_TYPES_IN_MENU = Object.keys(BLOCK_TYPE_INFO) as Block['type'][];

/** What changes the blocks of one exercise; the page behind it saves the document. */
export interface BlockEditing {
  /** → the new block's id. */
  onAddBlock: (type: Block['type']) => string;
  onChangeBlock: (blockId: string, changes: Partial<Block>) => void;
  onDeleteBlock: (blockId: string) => void;
  /** Puts the block where `toBlockId` is (dragging). */
  onMoveBlock: (blockId: string, toBlockId: string) => void;
}

/** The ways to change the blocks of an exercise, from the page's way to change that exercise. */
export function blockEditing(editExercise: (edit: (exercise: LessonExercise) => void) => void): BlockEditing {
  return {
    onAddBlock: (type) => {
      const block = newBlock(type);
      editExercise((draft) => void draft.blocks.push(block));
      return block.id;
    },
    onChangeBlock: (blockId, changes) =>
      editExercise((draft) => {
        const block = draft.blocks.find((candidate) => candidate.id === blockId);
        if (block) Object.assign(block, changes);
      }),
    onDeleteBlock: (blockId) =>
      editExercise((draft) => {
        draft.blocks = draft.blocks.filter((block) => block.id !== blockId);
      }),
    onMoveBlock: (blockId, toBlockId) =>
      editExercise((draft) => {
        const from = draft.blocks.findIndex((block) => block.id === blockId);
        const to = draft.blocks.findIndex((block) => block.id === toBlockId);
        if (from >= 0 && to >= 0) draft.blocks = arrayMove(draft.blocks, from, to);
      }),
  };
}

/**
 * The blocks of an exercise as forms, and "+ Bloque" (new blocks go at the end).
 * Blocks are reordered by dragging their handle; while one is dragged every
 * block is folded to its header row (`useFoldingSort`).
 */
export function ExerciseForms({
  exercise,
  onAddBlock,
  onChangeBlock,
  onDeleteBlock,
  onMoveBlock,
}: { exercise: LessonExercise } & BlockEditing) {
  const [newBlockId, setNewBlockId] = useState<string>();
  const { draggedId, dndProps } = useFoldingSort(onMoveBlock);
  const dragged = exercise.blocks.find((block) => block.id === draggedId);
  const draggedInfo = dragged && BLOCK_TYPE_INFO[dragged.type];
  const [picking, setPicking] = useState(false);
  const add = (type: Block['type']) => {
    setPicking(false);
    setNewBlockId(onAddBlock(type));
  };
  return (
    <>
      <Stack gap="sm" mt="md">
        {exercise.blocks.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('editor.noBlocks')}
          </Text>
        )}
        <DndContext {...dndProps}>
          <SortableContext items={exercise.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {exercise.blocks.map((block) => {
              const { icon: TypeIcon, label } = BLOCK_TYPE_INFO[block.type];
              const folded = draggedId !== undefined;
              return (
                <SortableItem
                  key={block.id}
                  id={block.id}
                  handleLabel={t('editor.dragBlock', { type: t(label) })}
                  disabled={exercise.blocks.length < 2}
                  ghost
                >
                  {(handle) => (
                    <div className="editor-block">
                      <Group justify="space-between" mb={folded ? 0 : 'xs'} wrap="nowrap">
                        <Group gap={4} wrap="nowrap">
                          {handle}
                          <Badge variant="light" color="gray" leftSection={<TypeIcon size={12} />}>
                            {t(label)}
                          </Badge>
                        </Group>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t('editor.deleteBlock', { type: t(label) })}
                          onClick={() => onDeleteBlock(block.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                      {/* Hidden, not unmounted, while a block is dragged: nothing in the form is lost. */}
                      <div hidden={folded}>
                        <BlockForm
                          block={block}
                          onChange={(changes) => onChangeBlock(block.id, changes)}
                          autoFocus={block.id === newBlockId}
                        />
                      </div>
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </SortableContext>
          {/* In the body: an ancestor with a transform (the exercise card while it moves) would misplace it. */}
          {createPortal(
            <DragOverlay>
              {draggedInfo && (
                <Paper withBorder p="xs" className="editor-drag-preview">
                  <Badge variant="light" color="gray" leftSection={<draggedInfo.icon size={12} />}>
                    {t(draggedInfo.label)}
                  </Badge>
                </Paper>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </Stack>
      <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} mt="sm" onClick={() => setPicking(true)}>
        {t('editor.addBlock')}
      </Button>
      {/* The types as tiles in a dialog in the middle of the window: all of them at once, wherever
          the button is (a dropdown of 21 items did not fit near the edges and shrank when the page scrolled). */}
      <Modal
        opened={picking}
        onClose={() => setPicking(false)}
        title={<DialogTitle>{t('editor.chooseBlock')}</DialogTitle>}
        size="xl"
        centered
      >
        <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
          {BLOCK_TYPES_IN_MENU.map((type) => {
            const { icon: TypeIcon, label } = BLOCK_TYPE_INFO[type];
            return (
              <UnstyledButton key={type} className="block-tile" onClick={() => add(type)}>
                <TypeIcon size={26} stroke={1.5} />
                <Text size="sm" ta="center" lh={1.25}>
                  {t(label)}
                </Text>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </Modal>
    </>
  );
}

import type { Exercise as LessonExercise } from '@cuadrilo/shared/lesson';
import { ActionIcon, Group, Menu, Paper, SegmentedControl, TextInput, Tooltip } from '@mantine/core';
import { IconFolderShare, IconTrash } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';

import { Exercise } from '../exercises/Exercise';
import '../exercises/exercises.css';
import { t } from '../i18n';
import { BlockView } from '../lesson/LessonView';
import { type BlockEditing, ExerciseForms } from './ExerciseForms';

/** A chapter the exercise can be moved to (its index in the lesson and its title as shown on the tab). */
export interface MoveTarget {
  index: number;
  title: string;
}

/**
 * One exercise in the editor: number, task, its blocks as forms (or, in
 * "Vista previa", as the student sees it; answers there are not saved) and
 * "+ Bloque". New blocks go at the end. `handle` drags it within its chapter;
 * "Mover a otro capítulo" puts it at the end of another chapter. `collapsed`
 * (while an exercise is dragged): only the header row, the blocks are hidden,
 * not unmounted, so nothing in them is lost.
 */
export function ExerciseEditor({
  exercise,
  number,
  isNew,
  onTaskChange,
  onDelete,
  handle,
  collapsed = false,
  moveTargets = [],
  onMove,
  onAddBlock,
  onChangeBlock,
  onDeleteBlock,
  onMoveBlock,
}: {
  exercise: LessonExercise;
  number: number;
  isNew: boolean;
  onTaskChange: (value: string) => void;
  onDelete: () => void;
  handle?: ReactNode;
  collapsed?: boolean;
  /** The other chapters of the lesson. */
  moveTargets?: MoveTarget[];
  onMove?: (chapterIndex: number) => void;
} & BlockEditing) {
  // A new exercise does not complain about its empty task until the field is left.
  const [touched, setTouched] = useState(!isNew);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  return (
    <Paper withBorder p="md" className="editor-exercise" data-item-id={exercise.id}>
      {/* On a narrow screen the buttons go to a second line, so the task field keeps its width. */}
      <Group gap="sm" align="flex-start">
        {handle && <div className="editor-handle">{handle}</div>}
        <span className="ex-number editor-number">{number}</span>
        <TextInput
          value={exercise.title}
          onChange={(e) => onTaskChange(e.currentTarget.value)}
          onBlur={() => setTouched(true)}
          placeholder={t('editor.taskPlaceholder')}
          aria-label={t('editor.task')}
          error={touched && !exercise.title.trim() && t('editor.taskMissing')}
          maxLength={500}
          autoFocus={isNew}
          style={{ flex: '1 1 200px' }}
        />
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as 'edit' | 'preview')}
          data={[
            { value: 'edit', label: t('editor.modeEdit') },
            { value: 'preview', label: t('editor.modePreview') },
          ]}
        />
        {onMove && moveTargets.length > 0 && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Tooltip label={t('editor.moveExercise', { number })}>
                <ActionIcon variant="default" size="lg" aria-label={t('editor.moveExercise', { number })}>
                  <IconFolderShare size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t('editor.moveTo')}</Menu.Label>
              {moveTargets.map((target) => (
                <Menu.Item key={target.index} onClick={() => onMove(target.index)}>
                  {target.index + 1}. {target.title}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
        <Tooltip label={t('editor.deleteExercise', { number })}>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label={t('editor.deleteExercise', { number })}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <div hidden={collapsed}>
        {mode === 'preview' ? (
          <div className="editor-preview">
            <Exercise number={number} title={exercise.title}>
              {exercise.blocks.map((block) => (
                <BlockView key={block.id} block={block} />
              ))}
            </Exercise>
          </div>
        ) : (
          <ExerciseForms
            exercise={exercise}
            onAddBlock={onAddBlock}
            onChangeBlock={onChangeBlock}
            onDeleteBlock={onDeleteBlock}
            onMoveBlock={onMoveBlock}
          />
        )}
      </div>
    </Paper>
  );
}

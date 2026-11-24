import { LESSON_TITLE_MAX } from '@cuadrilo/shared/api';
import { exerciseNumbers, newId } from '@cuadrilo/shared/lesson';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ActionIcon, Button, Group, Modal, Paper, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { IconEye, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { api, type Lesson } from '../api';
import { SortableItem, useFoldingSort } from '../components/Sortable';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, PageHeader } from '../components/ui';
import { combineAutosaves, useAutosave } from '../editor/autosave';
import { ExerciseEditor, type MoveTarget } from '../editor/ExerciseEditor';
import { blockEditing } from '../editor/ExerciseForms';
import { SaveIndicator } from '../editor/SaveIndicator';
import { useLessonDocument } from '../editor/useLessonDocument';
import { chapterTitle, t } from '../i18n';
import { useChapterFromUrl } from '../lesson/useChapterFromUrl';
import { lessonEditorPath, lessonPath, lessonsPath } from '../paths';

/**
 * Teacher: the lesson editor. Chapters on tabs (the first one is always
 * there), exercises with their task and blocks; every element can be deleted,
 * new ones go at the end. Exercises are reordered by dragging and moved to the
 * end of another chapter from their menu. Every change is saved by itself (the whole document,
 * PUT /content; the title separately). A half-filled lesson is fine: the
 * player skips empty blocks.
 */
export default function LessonEditor() {
  const lessonId = Number(useParams().id);
  const [lesson, setLesson] = useState<Lesson>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.getLesson(lessonId).then(setLesson, (e: Error) => setError(e.message));
  }, [lessonId]);

  if (!lesson) return error ? <ErrorAlert error={error} /> : <Hint>{t('common.loading')}</Hint>;
  return <Editor key={lesson.id} lesson={lesson} />;
}

function Editor({ lesson }: { lesson: Lesson }) {
  const { content: doc, editContent, editExercise, autosave: contentAutosave } = useLessonDocument(lesson);
  // The editor opens with the lesson loaded: the document is there from the first render.
  const content = doc ?? lesson.content;
  const [title, setTitle] = useState(lesson.title);
  const [chapterIndex, openChapter] = useChapterFromUrl(lessonEditorPath(lesson.id), content.chapters.length);
  const [confirmingChapterDelete, setConfirmingChapterDelete] = useState(false);
  // A just added exercise: its task field gets the focus.
  const [newExerciseId, setNewExerciseId] = useState<string>();

  const titleAutosave = useAutosave((value: string) => api.renameLesson(lesson.id, value));
  const autosave = combineAutosaves(contentAutosave, titleAutosave);

  const numbers = useMemo(() => exerciseNumbers(content), [content]);
  const chapter = content.chapters[chapterIndex];

  const addChapter = () => {
    editContent((draft) => void draft.chapters.push({ id: newId(), exercises: [] }));
    openChapter(content.chapters.length);
  };
  const deleteOpenChapter = () => {
    editContent((draft) => void draft.chapters.splice(chapterIndex, 1));
    openChapter(Math.max(0, chapterIndex - 1));
    setConfirmingChapterDelete(false);
  };
  const addExercise = () => {
    const id = newId();
    editContent((draft) => void draft.chapters[chapterIndex].exercises.push({ id, title: '', blocks: [] }));
    setNewExerciseId(id);
  };

  // Reordering the open chapter's exercises; while one is dragged they are folded to their header rows.
  const { draggedId, dndProps } = useFoldingSort((id, overId) =>
    editContent((draft) => {
      const exercises = draft.chapters[chapterIndex].exercises;
      const from = exercises.findIndex((exercise) => exercise.id === id);
      const to = exercises.findIndex((exercise) => exercise.id === overId);
      if (from >= 0 && to >= 0) draft.chapters[chapterIndex].exercises = arrayMove(exercises, from, to);
    }),
  );
  const dragged = chapter.exercises.find((exercise) => exercise.id === draggedId);

  /** The chapters an exercise of the open one can go to. */
  const moveTargets = useMemo<MoveTarget[]>(
    () =>
      content.chapters
        .map((c, index) => ({ index, title: chapterTitle(c, index) }))
        .filter((target) => target.index !== chapterIndex),
    [content.chapters, chapterIndex],
  );
  /** The exercise goes to the end of the other chapter; the editor stays on this one. */
  const moveExercise = (exerciseId: string, toChapter: number) =>
    editContent((draft) => {
      const exercises = draft.chapters[chapterIndex].exercises;
      const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
      if (index < 0 || !draft.chapters[toChapter]) return;
      const [exercise] = exercises.splice(index, 1);
      draft.chapters[toChapter].exercises.push(exercise);
    });

  const navigate = useNavigate();
  const [savingBeforeLeaving, setSavingBeforeLeaving] = useState(false);
  /** "Ver lección": that page loads the lesson, so the last change is saved first (stays here if it cannot be). */
  const viewAsStudent = async () => {
    setSavingBeforeLeaving(true);
    const allSaved = await autosave.saveAndWait();
    setSavingBeforeLeaving(false);
    if (allSaved) navigate(`${lessonPath(lesson.id)}/${chapterIndex + 1}`);
  };

  return (
    <section>
      <PageHeader
        title={t('editor.title', { lesson: title.trim() || lesson.title })}
        back={{ to: lessonsPath, label: t('nav.lessons') }}
      >
        <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.saveNow()} />
        <Button
          variant="default"
          leftSection={<IconEye size={16} />}
          loading={savingBeforeLeaving}
          onClick={() => void viewAsStudent()}
        >
          {t('editor.view')}
        </Button>
      </PageHeader>

      <fieldset className="editor-fieldset">
        <TextInput
          label={t('editor.lessonTitle')}
          value={title}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTitle(value);
            // An empty title is not saved (the lesson keeps the last one).
            if (value.trim()) titleAutosave.saveLater(value.trim());
          }}
          error={!title.trim() && t('errors.titleRequired')}
          maxLength={LESSON_TITLE_MAX}
          size="md"
          mb="lg"
          required
        />

        <Group gap="xs" mb="md" wrap="nowrap" align="flex-end">
          <Tabs
            value={String(chapterIndex)}
            onChange={(value) => value !== null && openChapter(Number(value))}
            className="editor-tabs"
          >
            <Tabs.List>
              {content.chapters.map((c, i) => (
                <Tabs.Tab key={c.id} value={String(i)}>
                  {i + 1}. {chapterTitle(c, i)}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
          <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={addChapter} mb={6}>
            {t('editor.addChapter')}
          </Button>
        </Group>

        <Group gap="xs" mb="lg" align="flex-end">
          <TextInput
            label={t('editor.chapterTitle')}
            value={chapter.title ?? ''}
            placeholder={t('lesson.chapter', { n: chapterIndex + 1 })}
            onChange={(e) => {
              const value = e.currentTarget.value;
              editContent((draft) => {
                if (value) draft.chapters[chapterIndex].title = value;
                else delete draft.chapters[chapterIndex].title;
              });
            }}
            maxLength={200}
            style={{ flex: 1 }}
          />
          {content.chapters.length > 1 && (
            <Tooltip label={t('editor.deleteChapter')}>
              <ActionIcon
                variant="default"
                size="lg"
                mb={2}
                aria-label={t('editor.deleteChapter')}
                // An empty chapter goes at once; one with exercises after a confirmation.
                onClick={() => (chapter.exercises.length ? setConfirmingChapterDelete(true) : deleteOpenChapter())}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        <Stack gap="md">
          {chapter.exercises.length === 0 && <Text c="dimmed">{t('editor.emptyChapter')}</Text>}
          <DndContext {...dndProps}>
            <SortableContext items={chapter.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {chapter.exercises.map((exercise) => (
                <SortableItem
                  key={exercise.id}
                  id={exercise.id}
                  handleLabel={t('editor.dragExercise', { number: numbers.get(exercise.id) ?? 0 })}
                  disabled={chapter.exercises.length < 2}
                  ghost
                >
                  {(handle) => (
                    <ExerciseEditor
                      exercise={exercise}
                      number={numbers.get(exercise.id) ?? 0}
                      isNew={exercise.id === newExerciseId}
                      handle={handle}
                      collapsed={draggedId !== undefined}
                      moveTargets={moveTargets}
                      onMove={(toChapter) => moveExercise(exercise.id, toChapter)}
                      onTaskChange={(task) =>
                        editExercise(exercise.id, (draft) => {
                          draft.title = task;
                        })
                      }
                      onDelete={() =>
                        editContent((draft) => {
                          const exercises = draft.chapters[chapterIndex].exercises;
                          exercises.splice(
                            exercises.findIndex((candidate) => candidate.id === exercise.id),
                            1,
                          );
                        })
                      }
                      {...blockEditing((edit) => editExercise(exercise.id, edit))}
                    />
                  )}
                </SortableItem>
              ))}
            </SortableContext>
            <DragOverlay>
              {dragged && (
                <Paper withBorder p="md" className="editor-drag-preview">
                  <span className="ex-number">{numbers.get(dragged.id)}</span>
                  <Text fw={600} truncate>
                    {dragged.title.trim() || t('editor.taskMissing')}
                  </Text>
                </Paper>
              )}
            </DragOverlay>
          </DndContext>
        </Stack>
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={addExercise} mt="md">
          {t('editor.addExercise')}
        </Button>

        <Modal
          opened={confirmingChapterDelete}
          onClose={() => setConfirmingChapterDelete(false)}
          title={
            <DialogTitle>
              {t('editor.deleteChapterTitle', { chapter: chapterTitle(chapter, chapterIndex) })}
            </DialogTitle>
          }
          centered
        >
          <Text size="sm">{t('editor.deleteChapterText', { count: chapter.exercises.length })}</Text>
          <DialogButtons onCancel={() => setConfirmingChapterDelete(false)}>
            <Button onClick={deleteOpenChapter}>{t('editor.deleteChapter')}</Button>
          </DialogButtons>
        </Modal>
      </fieldset>
    </section>
  );
}

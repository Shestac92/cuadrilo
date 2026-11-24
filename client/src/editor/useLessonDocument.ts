import type { Exercise, LessonContent } from '@cuadrilo/shared/lesson';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api, type Lesson } from '../api';
import { useAutosave } from './autosave';

/**
 * The lesson document open for editing, and its autosave (the whole document,
 * PUT /content, on the revision it was made on): the lesson editor and the
 * exercises edited in a class use it. `lesson` is the loaded lesson (undefined
 * until it is); another one replaces the document, after saving the last
 * change of the old one. The newest edit always wins: if the lesson was saved
 * meanwhile (elsewhere, or by this page whose answer got lost), the save is
 * made again on the revision that is there now.
 */
export function useLessonDocument(lesson: Lesson | undefined) {
  const [content, setContent] = useState(lesson?.content);
  const latestContent = useRef(content);
  // The revision the open document was made on.
  const savedRev = useRef(lesson?.rev ?? 0);
  const lessonId = lesson?.id;

  const autosave = useAutosave(async (value: LessonContent) => {
    if (lessonId === undefined) return;
    for (let attempt = 0; ; attempt += 1) {
      try {
        savedRev.current = (await api.saveLessonContent(lessonId, value, savedRev.current)).rev;
        return;
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'lesson_changed') || attempt >= 2) throw error;
        savedRev.current = (await api.getLesson(lessonId)).rev;
      }
    }
  });
  const { saveLater, saveNow } = autosave;

  useEffect(() => {
    latestContent.current = lesson?.content;
    savedRev.current = lesson?.rev ?? 0;
    setContent(lesson?.content);
    // The last change of the lesson being left goes out with that lesson's id (the autosave still holds its save).
    return () => void saveNow();
  }, [lesson, saveNow]);

  /** Every edit: a changed copy of the document, shown and saved. */
  const editContent = useCallback(
    (edit: (draft: LessonContent) => void) => {
      if (!latestContent.current) return;
      const next = structuredClone(latestContent.current);
      edit(next);
      latestContent.current = next;
      setContent(next);
      saveLater(next);
    },
    [saveLater],
  );

  /** An exercise, wherever in the document it is (ids are unique). */
  const editExercise = useCallback(
    (exerciseId: string, edit: (exercise: Exercise) => void) =>
      editContent((draft) => {
        for (const chapter of draft.chapters) {
          const exercise = chapter.exercises.find((candidate) => candidate.id === exerciseId);
          if (exercise) return edit(exercise);
        }
      }),
    [editContent],
  );

  return { content, editContent, editExercise, autosave };
}

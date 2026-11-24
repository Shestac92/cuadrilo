import type { LessonUpdatedEvent } from '@cuadrilo/shared/api';
import { type LessonContent, lockChapters } from '@cuadrilo/shared/lesson';

import { lessonContent } from './content';
import * as db from './db';
import { emitToStudent } from './live';

/**
 * Which chapters of a lesson a student may open (lesson_access.chapter_ids).
 * A chapter that is not open is neither sent to the student nor accepts their answers.
 */

/** The chapters open to the student; null: all of them (also for a lesson they have no access to: that is checked apart). */
export function openChapterIds(lessonId: number, studentId: number): ReadonlySet<string> | null {
  const ids = db.getChapterAccess(lessonId, studentId);
  return ids ? new Set(ids) : null;
}

/** The lesson as the student is sent it: the chapters that are not open are locked. */
export function contentForStudent(content: LessonContent, lessonId: number, studentId: number): LessonContent {
  return lockChapters(content, openChapterIds(lessonId, studentId));
}

/** The first chapter: where a student starts when a teacher gives them a lesson without choosing. */
export function firstChapterId(lessonId: number): string[] {
  const first = lessonContent(lessonId)?.chapters[0];
  return first ? [first.id] : [];
}

/** Opens chapters to students and tells those who got more that the lesson changed (their page loads it again). */
export function openChaptersFor(lessonId: number, studentIds: number[], chapterIds: string[]): void {
  if (chapterIds.length === 0 || studentIds.length === 0) return;
  tell(lessonId, db.openChapters(lessonId, studentIds, chapterIds));
}

export function tell(lessonId: number, studentIds: number[]): void {
  const lesson = db.getLesson(lessonId);
  if (!lesson) return;
  const event: LessonUpdatedEvent = { lessonId, rev: lesson.content_rev, reason: 'access' };
  for (const studentId of studentIds) emitToStudent(studentId, 'lessonUpdated', event);
}

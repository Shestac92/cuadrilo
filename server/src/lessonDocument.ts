import type { LessonUpdatedEvent } from '@cuadrilo/shared/api';
import type { LessonContent } from '@cuadrilo/shared/lesson';

import * as db from './db';
import { emitToStudent } from './live';

/**
 * Saves a lesson document made on revision `rev`: the one way the editor
 * (PUT /content) and the assistant (MCP tools) change a lesson. The students who
 * may open the lesson are told (lessonUpdated).
 * → the new revision, or null if the lesson was saved meanwhile.
 */
export function saveLessonDocument(lessonId: number, content: LessonContent, rev: number): number | null {
  const next = db.setLessonContent(lessonId, JSON.stringify(content), rev);
  if (next === null) return null;
  const updated: LessonUpdatedEvent = { lessonId, rev: next };
  for (const studentId of db.listLessonAccess(lessonId)) emitToStudent(studentId, 'lessonUpdated', updated);
  return next;
}

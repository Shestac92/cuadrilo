import type { LessonContent } from '@cuadrilo/shared/lesson';
import { parseContent } from '@cuadrilo/shared/lessonSchema';

import * as db from './db';

/**
 * Parsed lesson documents, refreshed when the document changes: by its
 * revision, which every save increments (updated_at has one-second precision,
 * two saves within a second would keep the older document).
 */
const cache = new Map<number, { rev: number; content: LessonContent }>();

/** The parsed document of a lesson; undefined if the lesson does not exist. */
export function lessonContent(lessonId: number): LessonContent | undefined {
  const lesson = db.getLesson(lessonId);
  if (!lesson) {
    cache.delete(lessonId);
    return undefined;
  }
  const cached = cache.get(lessonId);
  if (cached?.rev === lesson.content_rev) return cached.content;
  const content = parseContent(db.getLessonContent(lessonId));
  cache.set(lessonId, { rev: lesson.content_rev, content });
  return content;
}

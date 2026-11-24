import type { LessonSummary, Student, StudentGroup } from '@cuadrilo/shared/api';

import type * as db from './db';

/**
 * Database rows → API shapes (@cuadrilo/shared/api): camelCase, ISO times in UTC.
 * Only what the API promises goes out (no password hashes, no internal columns).
 */

/** SQLite datetime('now') "2026-10-15 20:41:03" (UTC) → "2026-10-15T20:41:03.000Z". */
export const isoTime = (sqlite: string) =>
  new Date(sqlite.includes('T') ? sqlite : `${sqlite.replace(' ', 'T')}Z`).toISOString();

export const toStudent = (user: db.User): Student => ({
  id: user.id,
  login: user.login,
  createdAt: isoTime(user.created_at),
});

export const toStudentGroup = (group: db.StudentGroup): StudentGroup => ({
  id: group.id,
  name: group.name,
  studentIds: group.studentIds,
  createdAt: isoTime(group.created_at),
});

export const toLessonSummary = (lesson: db.Lesson): LessonSummary => ({
  id: lesson.id,
  title: lesson.title,
  createdAt: isoTime(lesson.created_at),
  updatedAt: isoTime(lesson.updated_at),
});

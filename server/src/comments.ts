import { type LessonComments, saveCommentInput } from '@cuadrilo/shared/comments';
import { isAnswerBlock } from '@cuadrilo/shared/lesson';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import { lessonContent } from './content';
import * as db from './db';
import { notFound, parseBody, parseId, sendError, wrap } from './http';
import { t } from './i18n';
import { sendComment } from './live';

/**
 * The teacher's comments under students' answers (shared/src/comments.ts).
 * Written by teachers only, read by the student they are for. Mounted under /api/lessons.
 */

const LESSON_NOT_FOUND = t('errors.lessonNotFound');

/** The lesson of :id if the current user may open it; 404 otherwise. */
function findLesson(req: AuthedRequest, res: Response): db.Lesson | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const lesson = db.getLesson(id);
  if (!lesson || (req.user.role === 'student' && !db.hasLessonAccess(id, req.user.dbId))) {
    notFound(res, LESSON_NOT_FOUND);
    return undefined;
  }
  return lesson;
}

export function commentsRouter(): Router {
  const router = Router();

  // The student's own comments in the lesson.
  router.get(
    '/:id/comments',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const lesson = findLesson(req, res);
      if (lesson) res.json(db.listComments(lesson.id, req.user.dbId) satisfies LessonComments);
    }),
  );

  // Teacher: the comments to one student in the lesson.
  router.get(
    '/:id/students/:studentId/comments',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (db.getUser(studentId)?.role !== 'student') return notFound(res, t('errors.studentNotFound'));
      res.json(db.listComments(lesson.id, studentId) satisfies LessonComments);
    }),
  );

  // Teacher: sets (or, with an empty text, removes) the comment under a student's answer,
  // even before the student has answered; the student sees it at once.
  router.put(
    '/:id/students/:studentId/comments/:blockId',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (db.getUser(studentId)?.role !== 'student') return notFound(res, t('errors.studentNotFound'));
      const blockId = req.params.blockId as string;
      const content = lessonContent(lesson.id);
      if (!content || !isAnswerBlock(content, blockId)) return notFound(res, t('errors.exerciseNotFound'));
      const input = parseBody(saveCommentInput, req, res);
      if (!input) return;

      // A comment of blanks is no comment.
      const text = input.text.trim() === '' ? '' : input.text;
      db.setComment(lesson.id, studentId, blockId, text);
      sendComment({ lessonId: lesson.id, studentId, blockId, text });
      res.json({ text });
    }),
  );

  return router;
}

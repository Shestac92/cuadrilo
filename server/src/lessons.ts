import {
  type Lesson,
  type LessonAccess,
  type LessonContentSaved,
  lessonAccessInput,
  lessonOrderInput,
  lessonTitleInput,
} from '@cuadrilo/shared/api';
import { emptyContent } from '@cuadrilo/shared/lesson';
import { parseContent, saveLessonContentInput } from '@cuadrilo/shared/lessonSchema';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import { contentForStudent, tell } from './chapterAccess';
import * as db from './db';
import { notFound, parseBody, parseId, sendError, wrap } from './http';
import { t } from './i18n';
import { saveLessonDocument } from './lessonDocument';
import { isoTime, toLessonSummary } from './views';

const LESSON_NOT_FOUND = t('errors.lessonNotFound');

/**
 * The lesson of the :id param, if the current user may open it (teacher: any;
 * student: granted only). Otherwise answers 404 — the same for "missing" and
 * "no access", so other lessons are not revealed.
 */
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

/** A student gets the chapters open to them only; the teacher the whole document. */
const accessOf = (lessonId: number): LessonAccess => ({
  studentIds: db.listLessonAccess(lessonId),
  chapters: db.listChapterAccess(lessonId),
});

const withContent = (lesson: db.Lesson, studentId?: number): Lesson => ({
  ...toLessonSummary(lesson),
  content:
    studentId === undefined
      ? parseContent(db.getLessonContent(lesson.id))
      : contentForStudent(parseContent(db.getLessonContent(lesson.id)), lesson.id, studentId),
  rev: lesson.content_rev,
});

/** /api/lessons: everyone signed in reads what they can see; only teachers change. */
export function lessonsRouter(): Router {
  const router = Router();

  // Teacher: all lessons; student: the lessons opened to them.
  router.get(
    '/',
    wrap((req, res) => {
      const lessons = req.user.role === 'teacher' ? db.listLessons() : db.listLessonsForStudent(req.user.dbId);
      res.json(lessons.map(toLessonSummary));
    }),
  );

  // The teacher's drag and drop: the lessons in a new order (for everyone: students get the same order).
  router.put(
    '/order',
    requireTeacher,
    wrap((req, res) => {
      const input = parseBody(lessonOrderInput, req, res);
      if (!input) return;
      db.setLessonOrder(input.ids);
      res.status(204).end();
    }),
  );

  // The lesson with its document (chapters, items, blocks).
  router.get(
    '/:id',
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (lesson) res.json(withContent(lesson, req.user.role === 'student' ? req.user.dbId : undefined));
    }),
  );

  // A new lesson has one empty chapter.
  router.post(
    '/',
    requireTeacher,
    wrap((req, res) => {
      const input = parseBody(lessonTitleInput, req, res);
      if (!input) return;
      res.status(201).json(withContent(db.createLesson(input.title, JSON.stringify(emptyContent()))));
    }),
  );

  router.patch(
    '/:id',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const input = parseBody(lessonTitleInput, req, res);
      if (!input) return;
      res.json(toLessonSummary(db.existing(db.renameLesson(lesson.id, input.title), 'Lesson')));
    }),
  );

  // Replaces the lesson document (the editor saves the whole of it), if it was
  // made on the current revision; the students who may open it are told.
  router.put(
    '/:id/content',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const input = parseBody(saveLessonContentInput, req, res);
      if (!input) return;
      const rev = saveLessonDocument(lesson.id, input.content, input.rev);
      if (rev === null) return sendError(res, 'lesson_changed', t('errors.lessonChanged'));
      const saved: LessonContentSaved = {
        rev,
        updatedAt: isoTime(db.existing(db.getLesson(lesson.id), 'Lesson').updated_at),
      };
      res.json(saved);
    }),
  );

  // Also deletes its access, answers and homework; past classes keep their history.
  router.delete(
    '/:id',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      db.deleteLesson(lesson.id);
      res.status(204).end();
    }),
  );

  // ----- which students may open the lesson -----

  router.get(
    '/:id/access',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      res.json(accessOf(lesson.id));
    }),
  );

  // Replaces the list (and the chapters of each student: one not named in `chapters` gets the whole lesson).
  // The students who stay are told, their page loads the lesson again.
  router.put(
    '/:id/access',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const input = parseBody(lessonAccessInput, req, res);
      if (!input) return;
      const students = new Set(db.listUsers('student').map((s) => s.id));
      const unknown = input.studentIds.filter((id) => !students.has(id));
      if (unknown.length > 0)
        return sendError(res, 'invalid_input', `${t('errors.studentsNotFound')}: ${unknown.join(', ')}`);
      db.setLessonAccess(lesson.id, input.studentIds, input.chapters);
      tell(lesson.id, input.studentIds);
      res.json(accessOf(lesson.id));
    }),
  );

  return router;
}

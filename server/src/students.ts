import { createStudentInput, updateStudentInput } from '@cuadrilo/shared/api';
import { type Response, Router } from 'express';

import { type AuthedRequest, hashPassword, requireTeacher } from './auth';
import * as db from './db';
import { notFound, parseBody, parseId, sendError, wrap } from './http';
import { t } from './i18n';
import { isoTime, toStudent } from './views';

/** The student of the :id param; answers 404 otherwise. */
function findStudent(req: AuthedRequest, res: Response): db.User | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const user = db.getUser(id);
  if (user?.role !== 'student') {
    notFound(res, t('errors.studentNotFound'));
    return undefined;
  }
  return user;
}

const LOGIN_TAKEN = t('errors.loginTaken');

/** /api/students: student accounts, for the teacher only. */
export function studentsRouter(): Router {
  const router = Router();
  router.use(requireTeacher);

  router.get(
    '/',
    wrap((_req, res) => {
      res.json(db.listUsers('student').map(toStudent));
    }),
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const input = parseBody(createStudentInput, req, res);
      if (!input) return;
      if (db.isLoginTaken(input.login)) return sendError(res, 'login_taken', LOGIN_TAKEN);
      res.status(201).json(toStudent(db.createUser(input.login, await hashPassword(input.password), 'student')));
    }),
  );

  // Changing the password signs the student out everywhere.
  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const student = findStudent(req, res);
      if (!student) return;
      const input = parseBody(updateStudentInput, req, res);
      if (!input) return;
      if (input.login !== undefined && db.isLoginTaken(input.login, student.id)) {
        return sendError(res, 'login_taken', LOGIN_TAKEN);
      }
      if (input.login !== undefined) db.updateUserLogin(student.id, input.login);
      if (input.password !== undefined) {
        db.updateUserPassword(student.id, await hashPassword(input.password));
        db.deleteUserSessions(student.id);
      }
      res.json(toStudent(db.existing(db.getUser(student.id), 'Student')));
    }),
  );

  // Everything stored about the student, as a JSON file: the teacher's answer to a request for
  // access / portability of data (GDPR). Passwords and session tokens are not in it.
  router.get(
    '/:id/export',
    wrap((req, res) => {
      const student = findStudent(req, res);
      if (!student) return;
      const data = db.existing(db.collectStudentData(student.id), 'Student');
      const parse = (json: string): unknown => {
        try {
          return JSON.parse(json);
        } catch {
          return json;
        }
      };
      const time = (sqlite: string | null) => (sqlite === null ? null : isoTime(sqlite));
      const body = {
        exportedAt: new Date().toISOString(),
        account: {
          login: data.user.login,
          createdAt: isoTime(data.user.created_at),
          lastLesson: data.user.last_lesson_title,
          lastChapterId: data.user.last_chapter_id,
        },
        lessonAccess: data.lessonAccess.map((a) => ({
          lesson: a.lesson_title,
          chapterIds: a.chapter_ids === null ? null : parse(a.chapter_ids),
          grantedAt: isoTime(a.granted_at),
        })),
        homework: data.homework.map((h) => ({
          id: h.id,
          lesson: h.lesson_title,
          status: h.status,
          createdAt: isoTime(h.created_at),
          exerciseIds: parse(h.exercise_ids),
        })),
        answers: data.answers.map((a) => ({
          lesson: a.lesson_title,
          blockId: a.block_id,
          state: parse(a.state),
          updatedAt: isoTime(a.updated_at),
        })),
        teacherComments: data.comments.map((c) => ({ lesson: c.lesson_title, blockId: c.block_id, text: c.text })),
        teacherHighlights: data.highlights.map((h) => ({
          lesson: h.lesson_title,
          blockId: h.block_id,
          highlights: parse(h.highlights),
        })),
        vocabulary: data.vocabulary.map((v) => ({
          lang: v.lang,
          lemma: v.lemma,
          word: v.word,
          translation: v.translation,
          lesson: v.lesson_title,
          savedAt: isoTime(v.created_at),
        })),
        groups: data.groups.map((g) => g.name),
        classes: data.classes.map((c) => ({
          id: c.id,
          lesson: c.lesson_title,
          startedAt: isoTime(c.started_at),
          endedAt: time(c.ended_at),
          addedAt: isoTime(c.added_at),
          removedAt: time(c.removed_at),
          firstJoinedAt: time(c.first_joined_at),
        })),
        boardLines: data.boardLines,
      };
      res.setHeader('Content-Disposition', `attachment; filename="${student.login}-data.json"`);
      res.json(body);
    }),
  );

  // Also deletes their sessions, lesson access, answers, homework and vocabulary.
  router.delete(
    '/:id',
    wrap((req, res) => {
      const student = findStudent(req, res);
      if (!student) return;
      db.deleteUser(student.id);
      res.status(204).end();
    }),
  );

  return router;
}

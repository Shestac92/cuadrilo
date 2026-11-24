import {
  type Class,
  type ClassResume,
  classHomeworkInput,
  classResumeQuery,
  createClassInput,
  updateClassInput,
} from '@cuadrilo/shared/api';
import { chapterOfExercise, hasChapter, listExercises } from '@cuadrilo/shared/lesson';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import * as boards from './board/store';
import { firstChapterId, openChaptersFor, tell } from './chapterAccess';
import { lessonContent } from './content';
import * as db from './db';
import { broadcastHomeworkChange, toApiHomework } from './homework';
import { notFound, parseBody, parseId, parseQuery, sendError, wrap } from './http';
import { t } from './i18n';
import { forgetClassWheels, sendClassStateToStudents, studentClassOf } from './live';
import { isoTime } from './views';

/**
 * Live classes over HTTP: start, change the lesson, add / remove students,
 * end. Every change is pushed to the students over the socket (live.ts).
 *
 * Rules:
 * - a class is for a group or for one student, and writes to the board of that
 *   group / student (board/router.ts); students can be added to it only from
 *   that board's members;
 * - a teacher has one class on at a time; a student is in one class at a time;
 * - students in the class get access to its lesson (when added, and when the
 *   lesson changes); a student taken out of the class keeps it;
 * - only the class that is on can be changed (an ended one is not found).
 */

const CLASS_NOT_FOUND = t('errors.classNotFound');

function toView(cls: db.ClassSession): Class {
  const lesson = cls.lesson_id === null ? undefined : db.getLesson(cls.lesson_id);
  return {
    id: cls.id,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    startedAt: isoTime(cls.started_at),
    students: db.listClassStudents(cls.id).map((s) => ({
      id: s.student_id,
      login: s.login,
      joinedAt: s.first_joined_at && isoTime(s.first_joined_at),
    })),
    groupId: cls.group_id,
    boardId: cls.board_id,
    chapterId: db.getPositionOfClass(cls)?.chapterId ?? null,
    homeworkExerciseIds: lesson ? db.listClassHomeworkExerciseIds(cls.id, lesson.id) : [],
  };
}

/** The teacher's class of :id, if it is on; 404 otherwise. */
function findActiveClass(req: AuthedRequest, res: Response): db.ClassSession | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const cls = db.getActiveClassOfTeacher(req.user.dbId);
  if (cls?.id !== id) {
    notFound(res, CLASS_NOT_FOUND);
    return undefined;
  }
  return cls;
}

const isStudent = (id: number) => db.getUser(id)?.role === 'student';

/** A student who is in another class that is on. */
const busyIn = (studentId: number, classId?: number) => {
  const other = db.getActiveClassOfStudent(studentId);
  return other && other.id !== classId ? other : undefined;
};

const BUSY = t('errors.studentBusy');

/** /api/classes */
export function classesRouter(): Router {
  const router = Router();

  // Teacher: their class that is on. Student: the class they are in. null if none.
  router.get(
    '/current',
    wrap((req, res) => {
      if (req.user.role === 'student') return void res.json(studentClassOf(req.user.dbId));
      const cls = db.getActiveClassOfTeacher(req.user.dbId);
      res.json(cls ? toView(cls) : null);
    }),
  );

  // Where the last class of a group / of one student stopped: "continue" when starting a class.
  router.get(
    '/resume',
    requireTeacher,
    wrap((req, res) => {
      const query = parseQuery(classResumeQuery, req, res);
      if (!query) return;
      const position = db.getClassPosition(
        query.groupId !== undefined ? { groupId: query.groupId } : { studentId: query.studentId as number },
      );
      const lesson = position && db.getLesson(position.lessonId);
      if (!position || !lesson) return void res.json(null);
      // A chapter that is gone: continue from the first one.
      const chapters = lessonContent(lesson.id)?.chapters ?? [];
      const index = chapters.findIndex((c) => c.id === position.chapterId);
      const resume: ClassResume = {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        chapterId: index >= 0 ? chapters[index].id : null,
        chapterTitle: index >= 0 ? chapters[index].title || t('lesson.chapter', { n: index + 1 }) : null,
      };
      res.json(resume);
    }),
  );

  router.post(
    '/',
    requireTeacher,
    wrap((req, res) => {
      const input = parseBody(createClassInput, req, res);
      if (!input) return;
      if (db.getActiveClassOfTeacher(req.user.dbId)) {
        return sendError(res, 'class_active', t('errors.classActive'));
      }
      if (!db.getLesson(input.lessonId)) return notFound(res, t('errors.lessonNotFound'));
      let board: boards.Board;
      let studentIds: number[];
      let audience: Pick<db.ClassAudience, 'groupId' | 'soloStudentId'>;
      if (input.groupId !== undefined) {
        const group = db.getGroup(input.groupId);
        if (!group) return notFound(res, t('errors.groupNotFound'));
        if (group.studentIds.length === 0) return sendError(res, 'invalid_input', t('errors.groupEmpty'));
        studentIds = group.studentIds;
        board = boards.boardOfGroup(group.id);
        audience = { groupId: group.id, soloStudentId: null };
      } else {
        const studentId = input.studentId as number;
        if (!isStudent(studentId)) return sendError(res, 'invalid_input', t('errors.studentsNotFound'));
        studentIds = [studentId];
        board = boards.boardOfStudent(studentId);
        audience = { groupId: null, soloStudentId: studentId };
      }
      if (studentIds.some((id) => busyIn(id))) return sendError(res, 'student_busy', BUSY);

      const cls = db.createClass(req.user.dbId, input.lessonId, studentIds, { ...audience, boardId: board.id });
      // The class starts in the chapter asked for (if the lesson has it); from now on it is where the group / student stopped.
      const content = lessonContent(input.lessonId);
      const chapterId = input.chapterId && content && hasChapter(content, input.chapterId) ? input.chapterId : null;
      db.saveClassPosition(cls, input.lessonId, chapterId);
      // The students get the chapter the class starts in.
      openChaptersFor(input.lessonId, studentIds, chapterId ? [chapterId] : firstChapterId(input.lessonId));
      sendClassStateToStudents(studentIds);
      res.status(201).json(toView(cls));
    }),
  );

  // Another lesson: every student of the class gets access to it.
  router.patch(
    '/:id',
    requireTeacher,
    wrap((req, res) => {
      const cls = findActiveClass(req, res);
      if (!cls) return;
      const input = parseBody(updateClassInput, req, res);
      if (!input) return;
      if (!db.getLesson(input.lessonId)) return notFound(res, t('errors.lessonNotFound'));
      const studentIds = db.listClassStudents(cls.id).map((s) => s.student_id);
      if (cls.lesson_id !== input.lessonId) {
        db.setClassLesson(cls.id, input.lessonId);
        db.saveClassPosition(cls, input.lessonId, null);
        forgetClassWheels(cls.id);
        openChaptersFor(input.lessonId, studentIds, firstChapterId(input.lessonId));
        sendClassStateToStudents(studentIds);
      }
      res.json(toView(db.existing(db.getClass(cls.id), 'Class')));
    }),
  );

  // Adds a student (or brings one back); they get access to the lesson.
  router.put(
    '/:id/students/:studentId',
    requireTeacher,
    wrap((req, res) => {
      const cls = findActiveClass(req, res);
      if (!cls) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (!isStudent(studentId)) return notFound(res, t('errors.studentNotFound'));
      const board = cls.board_id === null ? undefined : boards.getBoard(cls.board_id);
      if (!board || !boards.isBoardMember(board, studentId)) {
        return sendError(res, 'invalid_input', t('errors.studentNotOnBoard'));
      }
      if (busyIn(studentId, cls.id)) return sendError(res, 'student_busy', BUSY);
      db.addClassStudent(cls.id, studentId);
      // They get the chapter the class is in.
      if (cls.lesson_id !== null) {
        const chapterId = db.getPositionOfClass(cls)?.chapterId;
        openChaptersFor(cls.lesson_id, [studentId], chapterId ? [chapterId] : firstChapterId(cls.lesson_id));
      }
      sendClassStateToStudents([studentId]);
      res.json(toView(cls));
    }),
  );

  // Takes a student out of the class (they keep access to the lesson).
  router.delete(
    '/:id/students/:studentId',
    requireTeacher,
    wrap((req, res) => {
      const cls = findActiveClass(req, res);
      if (!cls) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      db.removeClassStudent(cls.id, studentId);
      sendClassStateToStudents([studentId]);
      res.json(toView(cls));
    }),
  );

  // Homework set during the class: one exercise of the class's lesson, for everybody in the class's list. The first
  // one of a lesson makes a homework for each student; the next ones join it (db.addClassHomework). Only while the class is on.
  router.post(
    '/:id/homework',
    requireTeacher,
    wrap((req, res) => {
      const cls = findActiveClass(req, res);
      if (!cls) return;
      const input = parseBody(classHomeworkInput, req, res);
      if (!input) return;
      const content = cls.lesson_id === null ? undefined : lessonContent(cls.lesson_id);
      if (cls.lesson_id === null || !content) return notFound(res, t('errors.lessonNotFound'));
      if (!listExercises(content).some((ref) => ref.exercise.id === input.exerciseId)) {
        return sendError(res, 'invalid_input', t('errors.invalidExercises'));
      }
      const studentIds = db.listClassStudents(cls.id).map((s) => s.student_id);
      if (studentIds.length === 0) return sendError(res, 'invalid_input', t('errors.classNoStudents'));
      const results = db.addClassHomework(
        cls.id,
        cls.lesson_id,
        studentIds,
        input.exerciseId,
        chapterOfExercise(content, input.exerciseId) as string,
      );
      // Told like any homework: "assigned" for a new one, "updated" for an exercise added to the earlier one.
      const changed = results.filter((r) => r.added);
      tell(
        cls.lesson_id,
        changed.map((r) => r.studentId),
      );
      for (const r of changed) {
        broadcastHomeworkChange(toApiHomework(db.existing(db.getHomework(r.homeworkId), 'Homework')), {
          student: r.created ? 'assigned' : 'updated',
        });
      }
      res.json(toView(cls));
    }),
  );

  router.post(
    '/:id/end',
    requireTeacher,
    wrap((req, res) => {
      const cls = findActiveClass(req, res);
      if (!cls) return;
      const studentIds = db.listClassStudents(cls.id).map((s) => s.student_id);
      db.endClass(cls.id);
      forgetClassWheels(cls.id);
      sendClassStateToStudents(studentIds);
      res.status(204).end();
    }),
  );

  return router;
}

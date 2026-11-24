import {
  createHomeworkInput,
  type Homework,
  type HomeworkChange,
  type HomeworkDeletedEvent,
  type HomeworkEvent,
  type HomeworkStatus,
  homeworkListQuery,
  isWaitingForStudent,
  setHomeworkExercisesInput,
  updateHomeworkInput,
} from '@cuadrilo/shared/api';
import { chapterOfExercise, listExercises } from '@cuadrilo/shared/lesson';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import { tell } from './chapterAccess';
import { lessonContent } from './content';
import * as db from './db';
import { notFound, parseBody, parseId, parseQuery, sendError, wrap } from './http';
import { t } from './i18n';
import { emitToStudent, emitToTeachers } from './live';
import { isoTime } from './views';

/**
 * Homework: exercises of a lesson a teacher assigned to a student. The student
 * answers in the lesson as usual (answers are the lesson's, never locked) and
 * sends the homework when done; the teacher checks it and sets the result.
 *
 *   assigned ──student: submit──▶ submitted ──teacher──▶ needs_work / accepted
 *   needs_work ──student: submit──▶ submitted
 *   the teacher may set any status at any time, and change the exercises: adding one
 *   to a homework that was sent or accepted makes it the student's turn again (assigned)
 */

const HOMEWORK_NOT_FOUND = t('errors.homeworkNotFound');

/** Exercise number and title by id, per lesson. */
type LessonExercises = Map<string, { number: number; title: string }>;
/** Per request: a list of homework of the same lesson walks the lesson once. */
type ExercisesCache = Map<number, LessonExercises>;

function lessonExercisesById(lessonId: number, cache: ExercisesCache): LessonExercises {
  let byId = cache.get(lessonId);
  if (!byId) {
    const content = lessonContent(lessonId);
    byId = new Map(
      content
        ? listExercises(content).map((ref) => [ref.exercise.id, { number: ref.number, title: ref.exercise.title }])
        : [],
    );
    cache.set(lessonId, byId);
  }
  return byId;
}

/** API shape: exercises with their numbers and titles, in lesson order (ones deleted from the lesson left out). */
export function toApiHomework(homework: db.Homework, cache: ExercisesCache = new Map()): Homework {
  const byId = lessonExercisesById(homework.lesson_id, cache);
  const exercises: Homework['exercises'] = [];
  for (const id of homework.exercise_ids) {
    const exercise = byId.get(id);
    if (exercise) exercises.push({ id, ...exercise });
  }
  exercises.sort((a, b) => a.number - b.number);
  return {
    id: homework.id,
    lessonId: homework.lesson_id,
    lessonTitle: homework.lesson_title,
    studentId: homework.student_id,
    studentLogin: homework.student_login,
    status: homework.status,
    createdAt: isoTime(homework.created_at),
    exercises,
  };
}

/**
 * Live update after a change: the student and the teachers refresh what they
 * show; the one the change is for is also notified (reason).
 */
export function broadcastHomeworkChange(
  homework: Homework,
  notify: { student?: HomeworkChange; teachers?: HomeworkChange },
): void {
  emitToStudent(homework.studentId, 'homework', { homework, reason: notify.student ?? null } satisfies HomeworkEvent);
  emitToTeachers('homework', { homework, reason: notify.teachers ?? null } satisfies HomeworkEvent);
}

/** What the student is told when the teacher sets a status. */
const STUDENT_NOTICE_FOR_REVIEW: Partial<Record<HomeworkStatus, HomeworkChange>> = {
  needs_work: 'needs_work',
  accepted: 'accepted',
};

/**
 * The homework of :id if the current user may see it (teacher: any; student:
 * their own, while they have access to its lesson); 404 otherwise.
 */
function findHomework(req: AuthedRequest, res: Response): db.Homework | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const homework = db.getHomework(id);
  const visible =
    homework &&
    (req.user.role === 'teacher' ||
      (homework.student_id === req.user.dbId && db.hasLessonAccess(homework.lesson_id, req.user.dbId)));
  if (!visible) {
    notFound(res, HOMEWORK_NOT_FOUND);
    return undefined;
  }
  return homework;
}

/** /api/homework */
export function homeworkRouter(): Router {
  const router = Router();

  // Teacher: all homework (filters optional). Student: their own, in lessons they can open. Newest first.
  router.get(
    '/',
    wrap((req, res) => {
      const query = parseQuery(homeworkListQuery, req, res);
      if (!query) return;
      const list =
        req.user.role === 'teacher'
          ? db.listHomework(query)
          : db.listHomework({
              lessonId: query.lessonId,
              status: query.status,
              studentId: req.user.dbId,
              withAccess: true,
            });
      const cache: ExercisesCache = new Map();
      res.json(list.map((homework) => toApiHomework(homework, cache)));
    }),
  );

  router.get(
    '/:id',
    wrap((req, res) => {
      const homework = findHomework(req, res);
      if (homework) res.json(toApiHomework(homework));
    }),
  );

  // The same exercises to one or more students (one homework each); they get access to the lesson.
  router.post(
    '/',
    requireTeacher,
    wrap((req, res) => {
      const input = parseBody(createHomeworkInput, req, res);
      if (!input) return;
      const content = lessonContent(input.lessonId);
      if (!content) return notFound(res, t('errors.lessonNotFound'));
      const exercises = new Set(listExercises(content).map((ref) => ref.exercise.id));
      if (!input.exerciseIds.every((id) => exercises.has(id))) {
        return sendError(res, 'invalid_input', t('errors.invalidExercises'));
      }
      const studentIds = [...new Set(input.studentIds)];
      if (!studentIds.every((id) => db.getUser(id)?.role === 'student')) {
        return sendError(res, 'invalid_input', t('errors.studentsNotFound'));
      }
      // The chapters of the exercises open to the students.
      const exerciseIds = [...new Set(input.exerciseIds)];
      const chapterIds = [...new Set(exerciseIds.map((id) => chapterOfExercise(content, id) as string))];
      const ids = db.createHomework(input.lessonId, studentIds, exerciseIds, chapterIds);
      tell(input.lessonId, studentIds);
      const cache: ExercisesCache = new Map();
      const created = ids.map((id) => toApiHomework(db.existing(db.getHomework(id), 'Homework'), cache));
      for (const homework of created) broadcastHomeworkChange(homework, { student: 'assigned' });
      res.status(201).json(created);
    }),
  );

  // Teacher: the exercises this homework has from now on. A new one opens its chapter to the student and, in a
  // homework already sent or accepted, gives it back to the student. The other homework of the lesson is not touched.
  router.put(
    '/:id/exercises',
    requireTeacher,
    wrap((req, res) => {
      const homework = findHomework(req, res);
      if (!homework) return;
      const input = parseBody(setHomeworkExercisesInput, req, res);
      if (!input) return;
      const content = lessonContent(homework.lesson_id);
      if (!content) return notFound(res, t('errors.lessonNotFound'));
      const inLesson = new Set(listExercises(content).map((ref) => ref.exercise.id));
      if (!input.exerciseIds.every((id) => inLesson.has(id))) {
        return sendError(res, 'invalid_input', t('errors.invalidExercises'));
      }
      const exerciseIds = [...new Set(input.exerciseIds)];
      const added = exerciseIds.filter((id) => !homework.exercise_ids.includes(id));
      const chapterIds = [...new Set(exerciseIds.map((id) => chapterOfExercise(content, id) as string))];
      const backToStudent = added.length > 0 && (homework.status === 'submitted' || homework.status === 'accepted');
      db.setHomeworkExercises(
        { id: homework.id, lessonId: homework.lesson_id, studentId: homework.student_id },
        exerciseIds,
        chapterIds,
        backToStudent,
      );
      // A chapter that was opened: the student's page loads the lesson again.
      if (added.length > 0) tell(homework.lesson_id, [homework.student_id]);
      const updated = toApiHomework(db.existing(db.getHomework(homework.id), 'Homework'));
      broadcastHomeworkChange(updated, { student: added.length > 0 ? 'updated' : undefined });
      res.json(updated);
    }),
  );

  // Student: "Enviar al profesor" (empty exercises are fine; the teacher sorts them out).
  router.post(
    '/:id/submit',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const homework = findHomework(req, res);
      if (!homework) return;
      if (homework.status === 'accepted') return sendError(res, 'invalid_status', t('errors.homeworkAccepted'));
      // From the student's turn only (again after needs_work); sending it again changes nothing.
      const canSubmit = isWaitingForStudent(homework.status);
      if (canSubmit) db.setHomeworkStatus(homework.id, 'submitted');
      const updated = toApiHomework(db.existing(db.getHomework(homework.id), 'Homework'));
      if (canSubmit) broadcastHomeworkChange(updated, { teachers: 'submitted' });
      res.json(updated);
    }),
  );

  // Teacher: any status at any time.
  router.patch(
    '/:id',
    requireTeacher,
    wrap((req, res) => {
      const homework = findHomework(req, res);
      if (!homework) return;
      const input = parseBody(updateHomeworkInput, req, res);
      if (!input) return;
      db.setHomeworkStatus(homework.id, input.status);
      const updated = toApiHomework(db.existing(db.getHomework(homework.id), 'Homework'));
      if (input.status !== homework.status)
        broadcastHomeworkChange(updated, { student: STUDENT_NOTICE_FOR_REVIEW[input.status] });
      res.json(updated);
    }),
  );

  // The student's answers stay (they are the lesson's).
  router.delete(
    '/:id',
    requireTeacher,
    wrap((req, res) => {
      const homework = findHomework(req, res);
      if (!homework) return;
      db.deleteHomework(homework.id);
      const event: HomeworkDeletedEvent = { id: homework.id };
      emitToStudent(homework.student_id, 'homeworkDeleted', event);
      emitToTeachers('homeworkDeleted', event);
      res.status(204).end();
    }),
  );

  return router;
}

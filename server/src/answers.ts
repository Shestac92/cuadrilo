import {
  type BlockStateSaved,
  type LessonStates,
  MAX_BLOCK_STATE_BYTES,
  saveBlockStateInput,
} from '@cuadrilo/shared/api';
import {
  editHighlightsInput,
  eraseHighlight,
  type LessonHighlights,
  locateQuote,
  MAX_HIGHLIGHTS,
  markHighlight,
  paintHighlight,
  rebaseHighlights,
} from '@cuadrilo/shared/highlights';
import { chapterOfBlock, isAnswerBlock, isEssayBlock } from '@cuadrilo/shared/lesson';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import { openChapterIds } from './chapterAccess';
import { lessonContent } from './content';
import * as db from './db';
import { notFound, parseBody, parseId, sendError, wrap } from './http';
import { t } from './i18n';
import { relayAnswer, sendHighlights } from './live';
import { isoTime } from './views';

/**
 * Students' answers: the latest state of every answer block (block_states).
 * Written only here, over HTTP, by the student's page; a saved answer is also
 * shown live to the teacher of the student's class (live.ts). Mounted under /api/lessons.
 */

const LESSON_NOT_FOUND = t('errors.lessonNotFound');

/** The lesson of :id if the current user may open it; 404 otherwise (see lessons.ts). */
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

/** The text of an essay answer ('' while there is none). */
const essayText = (state: unknown): string =>
  typeof state === 'object' && state !== null && typeof (state as { text?: unknown }).text === 'string'
    ? (state as { text: string }).text
    : '';

const toLessonStates = (rows: db.BlockStateRow[]): LessonStates =>
  Object.fromEntries(
    rows.map((r) => [r.block_id, { state: JSON.parse(r.state) as unknown, updatedAt: isoTime(r.updated_at) }]),
  );

/** The text of an essay changed: the teacher's colours move with it. */
function moveHighlights(
  lessonId: number,
  studentId: number,
  blockId: string,
  oldText: string,
  newText: string,
  content: NonNullable<ReturnType<typeof lessonContent>>,
): void {
  if (oldText === newText || !isEssayBlock(content, blockId)) return;
  const before = db.getHighlights(lessonId, studentId, blockId);
  if (before.length === 0) return;
  const after = rebaseHighlights(oldText, newText, before);
  db.setHighlights(lessonId, studentId, blockId, after);
  sendHighlights({ lessonId, studentId, blockId, highlights: after, reason: 'edit' });
}

export function answersRouter(): Router {
  const router = Router();

  // The student's own answers in the lesson (restored when the page opens).
  router.get(
    '/:id/states',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const lesson = findLesson(req, res);
      if (lesson) res.json(toLessonStates(db.listBlockStates(lesson.id, req.user.dbId)));
    }),
  );

  // Saves the whole state of one answer block; shown to the teacher right away.
  router.put(
    '/:id/states/:blockId',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const blockId = req.params.blockId as string;
      const content = lessonContent(lesson.id);
      if (!content || !isAnswerBlock(content, blockId)) return notFound(res, t('errors.exerciseNotFound'));
      // A chapter that is not open to the student takes no answers.
      const open = openChapterIds(lesson.id, req.user.dbId);
      if (open && !open.has(chapterOfBlock(content, blockId) ?? '')) return notFound(res, t('errors.exerciseNotFound'));
      const input = parseBody(saveBlockStateInput, req, res);
      if (!input) return;
      const json = JSON.stringify(input.state);
      if (Buffer.byteLength(json) > MAX_BLOCK_STATE_BYTES)
        return sendError(res, 'too_large', t('errors.answerTooLarge'));

      // Validated: the teacher sees it without waiting for the database.
      relayAnswer(lesson.id, req.user.dbId, blockId, input.state);
      const oldText = isEssayBlock(content, blockId)
        ? essayText(db.getBlockState(lesson.id, req.user.dbId, blockId))
        : '';
      const saved: BlockStateSaved = { updatedAt: isoTime(db.saveBlockState(lesson.id, req.user.dbId, blockId, json)) };
      moveHighlights(lesson.id, req.user.dbId, blockId, oldText, essayText(input.state), content);
      res.json(saved);
    }),
  );

  // The student's own highlights (the teacher's colours on their essays).
  router.get(
    '/:id/highlights',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const lesson = findLesson(req, res);
      if (lesson) res.json(db.listHighlights(lesson.id, req.user.dbId) satisfies LessonHighlights);
    }),
  );

  // Teacher: one student's highlights in the lesson.
  router.get(
    '/:id/students/:studentId/highlights',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (db.getUser(studentId)?.role !== 'student') return notFound(res, t('errors.studentNotFound'));
      res.json(db.listHighlights(lesson.id, studentId) satisfies LessonHighlights);
    }),
  );

  // Teacher: colour a part of a student's essay, or take the colour off. The
  // positions come from the text the teacher saw; if the student changed it
  // meanwhile, the quote finds the part again (or 409 text_changed).
  router.post(
    '/:id/students/:studentId/highlights/:blockId',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (db.getUser(studentId)?.role !== 'student') return notFound(res, t('errors.studentNotFound'));
      const blockId = req.params.blockId as string;
      const content = lessonContent(lesson.id);
      if (!content || !isEssayBlock(content, blockId)) return notFound(res, t('errors.exerciseNotFound'));
      const input = parseBody(editHighlightsInput, req, res);
      if (!input) return;

      const text = essayText(db.getBlockState(lesson.id, studentId, blockId));
      const edit = 'paint' in input ? input.paint : 'format' in input ? input.format : input.erase;
      const found = locateQuote(text, edit);
      if (!found) return sendError(res, 'text_changed', t('errors.textChanged'));
      const before = db.getHighlights(lesson.id, studentId, blockId);
      const after =
        'paint' in input
          ? paintHighlight(before, found.start, found.end, input.paint.color)
          : 'format' in input
            ? markHighlight(before, found.start, found.end, input.format.patch)
            : eraseHighlight(before, found.start, found.end);
      if (after.length > MAX_HIGHLIGHTS) return sendError(res, 'invalid_input', t('errors.tooManyHighlights'));
      db.setHighlights(lesson.id, studentId, blockId, after);
      sendHighlights({ lessonId: lesson.id, studentId, blockId, highlights: after, reason: 'teacher' });
      res.json(after);
    }),
  );

  // Teacher: one student's answers in the lesson.
  router.get(
    '/:id/students/:studentId/states',
    requireTeacher,
    wrap((req, res) => {
      const lesson = findLesson(req, res);
      if (!lesson) return;
      const studentId = parseId(req, res, 'studentId');
      if (studentId === undefined) return;
      if (db.getUser(studentId)?.role !== 'student') return notFound(res, t('errors.studentNotFound'));
      res.json(toLessonStates(db.listBlockStates(lesson.id, studentId)));
    }),
  );

  return router;
}

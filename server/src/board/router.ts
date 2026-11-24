import {
  type BoardEvent,
  type BoardInfo,
  type BoardPage,
  type BoardRemovedEvent,
  boardEntryInput,
  boardPageQuery,
} from '@cuadrilo/shared/board';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from '../auth';
import * as db from '../db';
import { notFound, parseBody, parseId, parseQuery, sendError, wrap } from '../http';
import { t } from '../i18n';
import { emitToClass } from '../live';
import * as store from './store';

/**
 * /api/boards: the board (pizarra) of a group or of a student (shared/src/board.ts).
 *
 * - Read: a student reads their own board and those of their groups; the
 *   teacher reads any.
 * - Write: only during a class, by its teacher and its students, and only on
 *   the board the class was started for (a student must still belong to it).
 *   Outside a class nobody writes.
 * - Delete: only the teacher of the class the board was started for, to fix a
 *   typo (no editing); the others see the line go at once.
 */

/** The board of the :id param that this user may read; 404 otherwise (a stranger's board is "not found"). */
function findReadable(req: AuthedRequest, res: Response): store.Board | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const board = store.getBoard(id);
  if (!board || (req.user.role === 'student' && !store.isBoardMember(board, req.user.dbId))) {
    notFound(res, t('errors.boardNotFound'));
    return undefined;
  }
  return board;
}

/** The class this user writes to this board in, if any. */
function classWriting(req: AuthedRequest, board: store.Board): db.ClassSession | undefined {
  const { role, dbId } = req.user;
  const cls = role === 'teacher' ? db.getActiveClassOfTeacher(dbId) : db.getActiveClassOfStudent(dbId);
  return cls?.board_id === board.id ? cls : undefined;
}

export function boardsRouter(): Router {
  const router = Router();

  // Student: the boards they can read (to choose one outside a class).
  router.get(
    '/',
    wrap((req, res) => {
      if (req.user.role !== 'student') return sendError(res, 'forbidden', t('errors.studentOnly'));
      const boards: BoardInfo[] = store.listBoardsOfStudent(req.user.dbId);
      res.json(boards);
    }),
  );

  router.get(
    '/:id/entries',
    wrap((req, res) => {
      const board = findReadable(req, res);
      if (!board) return;
      const query = parseQuery(boardPageQuery, req, res);
      if (!query) return;
      const page: BoardPage = store.listEntries(board.id, query.before);
      res.json(page);
    }),
  );

  router.post(
    '/:id/entries',
    wrap((req, res) => {
      const board = findReadable(req, res);
      if (!board) return;
      const input = parseBody(boardEntryInput, req, res);
      if (!input) return;
      const cls = classWriting(req, board);
      if (!cls) return sendError(res, 'forbidden', t('errors.boardClosed'));
      const entry = store.addEntry(board.id, input.text);
      const event: BoardEvent = { boardId: board.id, entry };
      emitToClass(cls, 'board', event);
      res.status(201).json(entry);
    }),
  );

  router.delete(
    '/:id/entries/:entryId',
    requireTeacher,
    wrap((req, res) => {
      const board = findReadable(req, res);
      if (!board) return;
      const entryId = parseId(req, res, 'entryId');
      if (entryId === undefined) return;
      const cls = classWriting(req, board);
      if (!cls) return sendError(res, 'forbidden', t('errors.boardClosed'));
      if (!store.deleteEntry(board.id, entryId)) return notFound(res, t('errors.boardEntryNotFound'));
      const event: BoardRemovedEvent = { boardId: board.id, entryId };
      emitToClass(cls, 'boardRemoved', event);
      res.status(204).end();
    }),
  );

  return router;
}

import { z } from 'zod';

import { messageKey } from './i18n';

/**
 * The board (pizarra): a flat feed of plain one-line texts that the teacher
 * and the students write during a class. No author, no date, never edited;
 * only the teacher deletes a line (a typo), during a class. Kept after the class.
 *
 * A board belongs to one group (the class of a group) or to one student (a
 * solo class); a class writes to the board it was started for. Shown as plain
 * text only. The feed is read in pages, newest first, shown oldest first.
 */

export interface BoardEntry {
  id: number;
  text: string;
}

export const BOARD_TEXT_MAX = 1000;
/** Lines in a page of the feed. */
export const BOARD_PAGE_SIZE = 50;

/** A board a student can read (GET /api/boards): their own, or a group's. */
export interface BoardInfo {
  id: number;
  /** The group's name; null: the student's own board (solo classes). */
  groupName: string | null;
}

/** GET /api/boards/:id/entries?before=<entry id>: the lines before that one (the latest ones without it), oldest first. */
export interface BoardPage {
  entries: BoardEntry[];
  /** There are older lines. */
  hasMore: boolean;
}

export const boardPageQuery = z.object({ before: z.coerce.number().int().positive().optional() });

/** POST /api/boards/:id/entries */
export const boardEntryInput = z.object({
  text: z
    .string()
    .refine((t) => !/[\r\n]/.test(t), messageKey('errors.boardOneLine'))
    .transform((t) => t.trim())
    .pipe(z.string().min(1, messageKey('errors.boardEmpty')).max(BOARD_TEXT_MAX, messageKey('errors.boardTooLong'))),
});

/** Server → the class (socket `board`): a new line on the class's board. */
export interface BoardEvent {
  boardId: number;
  entry: BoardEntry;
}

/** Server → the class (socket `boardRemoved`): the teacher deleted a line. */
export interface BoardRemovedEvent {
  boardId: number;
  entryId: number;
}

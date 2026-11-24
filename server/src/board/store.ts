import { BOARD_PAGE_SIZE, type BoardEntry } from '@cuadrilo/shared/board';

import { db } from '../db';

/** The board's queries (the tables are in db.ts; the rules in router.ts). */

export interface Board {
  id: number;
  /** The group it belongs to; null: it is a student's own board. */
  group_id: number | null;
  student_id: number | null;
}

export function getBoard(id: number): Board | undefined {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as unknown as Board | undefined;
}

/** The board of a group, made on first use. */
export function boardOfGroup(groupId: number): Board {
  db.prepare('INSERT OR IGNORE INTO boards (group_id) VALUES (?)').run(groupId);
  return db.prepare('SELECT * FROM boards WHERE group_id = ?').get(groupId) as unknown as Board;
}

/** The board of a student's solo classes, made on first use. */
export function boardOfStudent(studentId: number): Board {
  db.prepare('INSERT OR IGNORE INTO boards (student_id) VALUES (?)').run(studentId);
  return db.prepare('SELECT * FROM boards WHERE student_id = ?').get(studentId) as unknown as Board;
}

/** Whether the student may read and write the board: it is theirs, or of a group they are in. */
export function isBoardMember(board: Board, studentId: number): boolean {
  if (board.student_id !== null) return board.student_id === studentId;
  return !!db
    .prepare('SELECT 1 FROM student_group_members WHERE group_id = ? AND student_id = ?')
    .get(board.group_id, studentId);
}

/** The boards a student belongs to: their own first, then their groups' by name. */
export function listBoardsOfStudent(studentId: number): { id: number; groupName: string | null }[] {
  return db
    .prepare(
      `SELECT b.id, NULL AS groupName FROM boards b WHERE b.student_id = ?
       UNION ALL
       SELECT * FROM (
         SELECT b.id, g.name AS groupName FROM boards b
         JOIN student_group_members m ON m.group_id = b.group_id AND m.student_id = ?
         JOIN student_groups g ON g.id = b.group_id
         ORDER BY g.name
       )`,
    )
    .all(studentId, studentId) as unknown as { id: number; groupName: string | null }[];
}

export function addEntry(boardId: number, text: string): BoardEntry {
  return db
    .prepare('INSERT INTO board_entries (board_id, text) VALUES (?, ?) RETURNING id, text')
    .get(boardId, text) as unknown as BoardEntry;
}

/** Deletes a line of the board; false: there is no such line on it. */
export function deleteEntry(boardId: number, entryId: number): boolean {
  return db.prepare('DELETE FROM board_entries WHERE board_id = ? AND id = ?').run(boardId, entryId).changes > 0;
}

/** A page of lines: the latest ones, or those before the entry `before`; oldest first. */
export function listEntries(boardId: number, before?: number): { entries: BoardEntry[]; hasMore: boolean } {
  const rows = db
    .prepare(`SELECT id, text FROM board_entries WHERE board_id = ? AND id < ? ORDER BY id DESC LIMIT ?`)
    .all(boardId, before ?? Number.MAX_SAFE_INTEGER, BOARD_PAGE_SIZE + 1) as unknown as BoardEntry[];
  const hasMore = rows.length > BOARD_PAGE_SIZE;
  return { entries: rows.slice(0, BOARD_PAGE_SIZE).reverse(), hasMore };
}

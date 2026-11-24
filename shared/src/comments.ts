import { z } from 'zod';

/**
 * The teacher's comment under a student's answer: plain text, written by the
 * teacher whenever they like (in a class or checking homework), read-only for
 * the student, and shown to them only while it is not empty. It belongs to one
 * student's answer block (every student of a group has their own), is kept
 * apart from the answer (the student saves the whole answer, so it would
 * overwrite the comment) and stays when the student answers again.
 */

export const COMMENT_MAX = 2000;

/** PUT …/students/:studentId/comments/:blockId: the whole text; empty removes the comment. */
export const saveCommentInput = z.object({ text: z.string().max(COMMENT_MAX) });
export type SaveCommentInput = z.infer<typeof saveCommentInput>;

/** Comments on the answer blocks of a lesson, by block id (only blocks that have one). */
export type LessonComments = Record<string, string>;

/** Server → student and teachers `comment`: the comment under one answer changed ('' = removed). */
export interface CommentEvent {
  lessonId: number;
  studentId: number;
  blockId: string;
  text: string;
}

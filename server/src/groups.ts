import { createGroupInput, updateGroupInput } from '@cuadrilo/shared/api';
import { type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from './auth';
import * as db from './db';
import { notFound, parseBody, parseId, sendError, wrap } from './http';
import { t } from './i18n';
import { toStudentGroup } from './views';

/** The group of the :id param; answers 404 otherwise. */
function findGroup(req: AuthedRequest, res: Response): db.StudentGroup | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const group = db.getGroup(id);
  if (!group) notFound(res, t('errors.groupNotFound'));
  return group;
}

/** Whether every id is a student's (a group holds nobody else). */
const allStudents = (ids: number[]) => ids.every((id) => db.getUser(id)?.role === 'student');

/**
 * /api/groups: named sets of students, for the teacher only. A group is a
 * shortcut for choosing several students (homework, lesson access) and the
 * audience of a class, which has the group's board (board/); homework and
 * lesson access still hold students, not groups.
 */
export function groupsRouter(): Router {
  const router = Router();
  router.use(requireTeacher);

  router.get(
    '/',
    wrap((_req, res) => {
      res.json(db.listGroups().map(toStudentGroup));
    }),
  );

  router.post(
    '/',
    wrap((req, res) => {
      const input = parseBody(createGroupInput, req, res);
      if (!input) return;
      if (db.isGroupNameTaken(input.name)) {
        return sendError(res, 'name_taken', t('errors.groupNameTaken', { name: input.name }));
      }
      if (!allStudents(input.studentIds)) return sendError(res, 'invalid_input', t('errors.studentsNotFound'));
      res.status(201).json(toStudentGroup(db.createGroup(input.name, input.studentIds)));
    }),
  );

  // The name and / or the whole list of members.
  router.patch(
    '/:id',
    wrap((req, res) => {
      const group = findGroup(req, res);
      if (!group) return;
      const input = parseBody(updateGroupInput, req, res);
      if (!input) return;
      if (input.name !== undefined && db.isGroupNameTaken(input.name, group.id)) {
        return sendError(res, 'name_taken', t('errors.groupNameTaken', { name: input.name }));
      }
      if (input.studentIds && !allStudents(input.studentIds)) {
        return sendError(res, 'invalid_input', t('errors.studentsNotFound'));
      }
      db.updateGroup(group.id, input);
      res.json(toStudentGroup(db.existing(db.getGroup(group.id), 'Group')));
    }),
  );

  // Only the group: its students stay.
  router.delete(
    '/:id',
    wrap((req, res) => {
      const group = findGroup(req, res);
      if (!group) return;
      db.deleteGroup(group.id);
      res.status(204).end();
    }),
  );

  return router;
}

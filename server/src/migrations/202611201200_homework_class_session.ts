import type { Migration } from '.';

/**
 * A homework made during a class remembers the class (`class_session_id`): the
 * next exercises the teacher sets in that class, in the same lesson, go into the
 * same homework instead of making a new one for each exercise.
 * NULL: assigned from "Asignar tarea" (all the older homework too). A deleted
 * class only forgets the link: the homework stays.
 */
export const homeworkClassSession: Migration = {
  id: '202611201200_homework_class_session',
  name: 'homework.class_session_id: the class a homework was set in',
  up: (db) => {
    db.exec(`
      ALTER TABLE homework ADD COLUMN class_session_id INTEGER REFERENCES class_sessions (id) ON DELETE SET NULL;
      -- Partial: the lookup "this class, this lesson, this student" and the cascade; most homework has no class.
      CREATE INDEX homework_class_session ON homework (class_session_id, lesson_id, student_id)
        WHERE class_session_id IS NOT NULL;
    `);
  },
};

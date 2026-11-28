/**
 * The demo database every new or reset demo starts from, into DATA_DIR (an empty folder): the teacher, the
 * students in one group, and the demo lessons open to them. Run by scripts/build.ts.
 */
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

import { hashPassword } from '../../server/src/auth';
import * as db from '../../server/src/db';
import { DEMO_LESSON_TITLE, demoLessonContent } from '../../server/test/fixtures/demoLesson';
import { importDemoMedia } from '../../server/test/fixtures/demoMedia';
import { DEMO_GROUP, DEMO_PASSWORD, DEMO_STUDENTS, DEMO_TEACHER } from '../src/demoAccounts';

async function main() {
  if (!process.env.DATA_DIR) throw new Error('set DATA_DIR to the (empty) folder of the demo database');
  const password = await hashPassword(DEMO_PASSWORD);
  db.createUser(DEMO_TEACHER, password, 'teacher');
  const studentIds = DEMO_STUDENTS.map((login) => db.createUser(login, password, 'student').id);
  db.createGroup(DEMO_GROUP, studentIds);

  // For now the test lesson; the demo's own lessons come later.
  const media = await importDemoMedia();
  const lesson = db.createLesson(
    DEMO_LESSON_TITLE,
    JSON.stringify(lessonContentSchema.parse(demoLessonContent(media))),
  );
  // The whole lesson, later chapters included.
  db.setLessonAccess(lesson.id, studentIds);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

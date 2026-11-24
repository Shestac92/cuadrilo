/**
 * Fills a fresh test database (DATA_DIR must point to a temporary
 * directory): a teacher, three students and the demo lesson. Prints the ids
 * as JSON for test/helpers.ts. The passwords are test-only constants.
 */
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

import { hashPassword } from '../src/auth';
import * as db from '../src/db';
import { DATA_DIR } from '../src/paths';
import { DEMO_LESSON_TITLE, demoLessonContent } from './fixtures/demoLesson';
import { importDemoMedia } from './fixtures/demoMedia';
import { TEST_PASSWORD, TEST_USERS } from './users';

async function main() {
  if (!process.env.DATA_DIR) throw new Error(`refusing to seed ${DATA_DIR}: set DATA_DIR`);
  const password = await hashPassword(TEST_PASSWORD);
  const users: Record<string, number> = {};
  for (const [login, role] of Object.entries(TEST_USERS)) users[login] = db.createUser(login, password, role).id;
  const media = await importDemoMedia();
  const lesson = db.createLesson(
    DEMO_LESSON_TITLE,
    JSON.stringify(lessonContentSchema.parse(demoLessonContent(media))),
  );
  console.log(JSON.stringify({ users, lessonId: lesson.id, media }));
}

void main();

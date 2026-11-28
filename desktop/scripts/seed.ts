/**
 * The demo database every new or reset demo starts from, into DATA_DIR (an empty folder): the teacher, the
 * students in one group, and the demo lesson (demo/lesson.ts) open to them. Run by scripts/build.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

import { hashPassword } from '../../server/src/auth';
import * as db from '../../server/src/db';
import { addMedia } from '../../server/src/mediaLibrary';
import { mediaUrl } from '../../server/src/mediaStore';
import { DEMO_LESSON_TITLE, DEMO_MEDIA_DIR, DEMO_MEDIA_FILES, type DemoMedia, demoLessonContent } from '../demo/lesson';
import { DEMO_GROUP, DEMO_PASSWORD, DEMO_STUDENTS, DEMO_TEACHER } from '../src/demoAccounts';

/** The lesson's files into the media library, as a teacher's upload would (pictures compressed); their URLs. */
async function importMedia(): Promise<DemoMedia> {
  const media: Partial<DemoMedia> = {};
  for (const [key, name] of Object.entries(DEMO_MEDIA_FILES) as [keyof DemoMedia, string][]) {
    const result = await addMedia(fs.readFileSync(path.join(DEMO_MEDIA_DIR, name)), name);
    if (!result.ok) throw new Error(`${name}: not added to the media library (${result.reason})`);
    media[key] = mediaUrl(result.media.file);
  }
  return media as DemoMedia;
}

async function main() {
  if (!process.env.DATA_DIR) throw new Error('set DATA_DIR to the (empty) folder of the demo database');
  const password = await hashPassword(DEMO_PASSWORD);
  db.createUser(DEMO_TEACHER, password, 'teacher');
  const studentIds = DEMO_STUDENTS.map((login) => db.createUser(login, password, 'student').id);
  db.createGroup(DEMO_GROUP, studentIds);

  const lesson = db.createLesson(
    DEMO_LESSON_TITLE,
    JSON.stringify(lessonContentSchema.parse(demoLessonContent(await importMedia()))),
  );
  // The whole lesson, later chapters included.
  db.setLessonAccess(lesson.id, studentIds);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

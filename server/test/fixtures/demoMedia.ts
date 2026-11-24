import fs from 'node:fs';
import path from 'node:path';

import { addMedia } from '../../src/mediaLibrary';
import { mediaUrl } from '../../src/mediaStore';
import { DEMO_MEDIA_DIR, DEMO_MEDIA_NAMES, type DemoMedia } from './demoLesson';

/** Puts the test lesson's image and audio into the library (once); their URLs for the lesson. */
export async function importDemoMedia(): Promise<DemoMedia> {
  const add = async (name: string) => {
    const result = await addMedia(fs.readFileSync(path.join(DEMO_MEDIA_DIR, name)), name);
    if (!result.ok) throw new Error(`${name}: not added to the media library (${result.reason})`);
    return mediaUrl(result.media.file);
  };
  return { kitchen: await add(DEMO_MEDIA_NAMES.kitchen), listening: await add(DEMO_MEDIA_NAMES.listening) };
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isEmptyBlock } from '@cuadrilo/shared/lesson';
import { formatTime, parseTime, parseYoutubeLink } from '@cuadrilo/shared/youtube';

import { makeGap } from '../src/editor/fields';

describe('lesson editor fields', () => {
  it('YouTube links as the teacher copies them', () => {
    const id = 'aqz-KE-bpKQ';
    for (const link of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=PL123&index=2`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `youtube.com/watch?v=${id}`,
      `  https://youtu.be/${id}  `,
    ]) {
      assert.deepEqual(parseYoutubeLink(link), { id }, link);
    }
    assert.deepEqual(parseYoutubeLink(`https://youtu.be/${id}?t=90`), { id, start: 90 });
    assert.deepEqual(parseYoutubeLink(`https://www.youtube.com/watch?v=${id}&t=1m30s`), { id, start: 90 });
    assert.deepEqual(parseYoutubeLink(`https://www.youtube.com/embed/${id}?start=15`), { id, start: 15 });
  });

  it('not YouTube videos', () => {
    for (const link of [
      '',
      'hola',
      'https://vimeo.com/123456789',
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=short',
      'https://evil.com/watch?v=aqz-KE-bpKQ',
      'https://youtube.com.evil.com/watch?v=aqz-KE-bpKQ',
    ]) {
      assert.equal(parseYoutubeLink(link), null, link);
    }
  });

  it('start time mm:ss', () => {
    assert.equal(parseTime(''), undefined);
    assert.equal(parseTime('90'), 90);
    assert.equal(parseTime('1:30'), 90);
    assert.equal(parseTime(' 0:05 '), 5);
    assert.equal(parseTime('1:75'), null);
    assert.equal(parseTime('abc'), null);
    assert.equal(formatTime(90), '1:30');
    assert.equal(formatTime(5), '0:05');
  });

  it('"Hacer hueco" wraps the selection, spaces stay outside', () => {
    const text = 'Tengo un perro.';
    assert.deepEqual(makeGap(text, 6, 8), { text: 'Tengo *un* perro.', cursor: 10 });
    assert.deepEqual(makeGap(text, 5, 9), { text: 'Tengo *un* perro.', cursor: 10 }, 'selection " un "');
    assert.deepEqual(
      makeGap(text, 6, 6),
      { text: 'Tengo **un perro.', cursor: 7 },
      'no selection: empty gap, cursor inside',
    );
  });
});

describe('new blocks', () => {
  it('every type starts valid and empty (the student sees it once filled in)', async () => {
    const { newBlock } = await import('../src/editor/BlockForms');
    const { lessonContentSchema } = await import('@cuadrilo/shared/lessonSchema');
    const types = [
      'text',
      'image',
      'video',
      'audio',
      'gaps',
      'drag-gaps',
      'match',
      'sort',
      'order',
      'choice',
      'true-false',
      'sequence',
      'wheel',
    ] as const;
    const blocks = types.map(newBlock);
    const doc = { version: 2, chapters: [{ id: 'c', exercises: [{ id: 'e', title: '', blocks }] }] };
    assert.ok(lessonContentSchema.safeParse(doc).success);
    for (const block of blocks) assert.ok(isEmptyBlock(block), block.type);
    const image = newBlock('image');
    assert.deepEqual(image.type === 'image' ? image.scale : undefined, 'm', 'a new image is medium');
  });
});

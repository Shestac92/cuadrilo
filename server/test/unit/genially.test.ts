import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { geniallyEmbedUrl, parseGeniallyLink } from '@cuadrilo/shared/genially';
import { toPlayableBlock } from '@cuadrilo/shared/lesson';
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

const ID = '6720c5563ae8449b359f1fd0';

describe('genially', () => {
  it('reads the id from the links and the embed code a teacher copies', () => {
    for (const input of [
      ID,
      ID.toUpperCase(),
      `https://view.genially.com/${ID}`,
      `view.genially.com/${ID}/interactive-content-los-muebles`,
      `https://view.genial.ly/${ID}?x=1`,
      `https://app.genially.com/${ID}`,
      `<div style="width: 100%"><iframe frameborder="0" width="1200" height="675" src="https://view.genially.com/${ID}" type="text/html" allowscriptaccess="always"></iframe></div>`,
    ]) {
      assert.equal(parseGeniallyLink(input), ID, input);
    }
    assert.equal(geniallyEmbedUrl(ID), `https://view.genially.com/${ID}`);
  });

  it('refuses anything that is not a Genially, so only view.genially.com is ever embedded', () => {
    for (const input of [
      '',
      'hola',
      `https://example.com/${ID}`,
      `https://genially.com.evil.test/${ID}`,
      `https://view.genially.com/short`,
      `<iframe src="https://evil.test/${ID}"></iframe>`,
    ]) {
      assert.equal(parseGeniallyLink(input), null, input);
    }
  });

  it('is shown only with an id, and the schema accepts a half filled block but not a bad id', () => {
    const block = { id: 'g', type: 'genially', geniallyId: ID, ratio: '1:1' } as const;
    assert.deepEqual(toPlayableBlock(block), block);
    assert.equal(toPlayableBlock({ ...block, geniallyId: '' }), null);
    const lesson = (b: unknown) => ({
      version: 2,
      chapters: [{ id: 'c', exercises: [{ id: 'e', title: 't', blocks: [b] }] }],
    });
    assert.equal(lessonContentSchema.safeParse(lesson(block)).success, true);
    assert.equal(lessonContentSchema.safeParse(lesson({ ...block, geniallyId: '' })).success, true);
    assert.equal(lessonContentSchema.safeParse(lesson({ ...block, geniallyId: 'javascript:1' })).success, false);
    assert.equal(lessonContentSchema.safeParse(lesson({ ...block, ratio: '5:1' })).success, false);
  });
});

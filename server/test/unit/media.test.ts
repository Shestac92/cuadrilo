import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { detectMedia } from '../../src/mediaStore';

/** Type detection of uploaded lesson media (src/media.ts): by content, not by name. */
describe('media type detection', () => {
  const bytes = (...parts: (string | number[])[]) =>
    Buffer.concat([
      ...parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))),
      Buffer.alloc(16),
    ]);

  it('images', () => {
    assert.deepEqual(detectMedia(bytes([0xff, 0xd8, 0xff, 0xe0])), { kind: 'image', ext: 'jpg' });
    assert.deepEqual(detectMedia(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), {
      kind: 'image',
      ext: 'png',
    });
    assert.deepEqual(detectMedia(bytes('GIF89a')), { kind: 'image', ext: 'gif' });
    assert.deepEqual(detectMedia(bytes('RIFF', [0, 0, 0, 0], 'WEBP')), { kind: 'image', ext: 'webp' });
  });

  it('audio', () => {
    assert.deepEqual(detectMedia(bytes('RIFF', [0, 0, 0, 0], 'WAVE')), { kind: 'audio', ext: 'wav' });
    assert.deepEqual(detectMedia(bytes('OggS')), { kind: 'audio', ext: 'ogg' });
    assert.deepEqual(detectMedia(bytes('ID3')), { kind: 'audio', ext: 'mp3' });
    assert.deepEqual(
      detectMedia(bytes([0xff, 0xfb, 0x90, 0x64])),
      { kind: 'audio', ext: 'mp3' },
      'MPEG frame without a tag',
    );
    assert.deepEqual(detectMedia(bytes([0, 0, 0, 0x1c], 'ftypM4A ')), { kind: 'audio', ext: 'm4a' });
  });

  it('the fixture files', () => {
    const demo = (file: string) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'media', file));
    assert.deepEqual(detectMedia(demo('cocina.png')), { kind: 'image', ext: 'png' });
    assert.deepEqual(detectMedia(demo('lucia.m4a')), { kind: 'audio', ext: 'm4a' });
  });

  it('rejects anything else, whatever its name', () => {
    for (const b of [
      bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      bytes('<html><script>alert(1)</script>'),
      bytes([0, 0, 0, 0x18], 'ftypisom'), // MP4 video
      bytes('%PDF-1.7'),
      bytes('PK', [3, 4]),
      Buffer.from('GIF89a'), // too short
      Buffer.alloc(0),
    ]) {
      assert.equal(detectMedia(b), undefined, b.subarray(0, 12).toString('latin1'));
    }
  });
});

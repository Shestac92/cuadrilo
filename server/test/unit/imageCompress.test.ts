import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import sharp from 'sharp';

import { compressImage, MAX_SIDE } from '../../src/imageCompress';
import { detectMedia } from '../../src/mediaStore';

/** Compression of lesson images before they are stored (src/imageCompress.ts): everything becomes a WebP. */
describe('image compression', () => {
  /** A picture of noise: it does not compress well, so it is heavy for its size. */
  const noise = (width: number, height: number) =>
    sharp({
      create: { width, height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } },
    });
  const sizeOf = async (bytes: Buffer) => {
    const { width, height } = await sharp(bytes).metadata();
    return { width, height };
  };
  const ext = (bytes: Buffer) => detectMedia(bytes)?.ext;

  it('a PNG becomes a WebP, a big one is scaled to the longest side MAX_SIDE', async () => {
    const original = await noise(2600, 2000).png().toBuffer();
    const result = await compressImage(original);
    assert.equal(ext(result), 'webp');
    assert.ok(result.length < original.length);
    assert.deepEqual(await sizeOf(result), { width: MAX_SIDE, height: Math.round((2000 * MAX_SIDE) / 2600) });
  });

  it('a JPEG becomes a WebP too, a picture that is within MAX_SIDE is not scaled', async () => {
    const original = await noise(1500, 1000).jpeg({ quality: 100 }).toBuffer();
    const result = await compressImage(original);
    assert.equal(ext(result), 'webp');
    assert.deepEqual(await sizeOf(result), { width: 1500, height: 1000 });
  });

  it('transparency becomes white', async () => {
    const original = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const result = await compressImage(original);
    assert.equal(ext(result), 'webp');
    assert.equal((await sharp(result).metadata()).hasAlpha, false);
    const { data } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
  });

  it('a small picture is converted as well', async () => {
    const small = await noise(120, 80).png().toBuffer();
    const result = await compressImage(small);
    assert.equal(ext(result), 'webp');
    assert.ok(result.length < small.length);
  });

  it('a file that would not get lighter stays as it is', async () => {
    // A tiny drawing: a PNG of one colour is smaller than any WebP of it.
    const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const result = await compressImage(tiny);
    assert.ok(result.length <= tiny.length);
    if (ext(result) === 'png') assert.equal(result, tiny);
  });

  it('a WebP that is made already is not packed again', async () => {
    const once = await compressImage(await noise(2400, 1200).jpeg({ quality: 100 }).toBuffer());
    assert.equal(ext(once), 'webp');
    assert.equal(await compressImage(once), once, 'no second pass over a compressed picture (it only loses quality)');
  });

  it('a heavy WebP is packed, a big WebP is scaled', async () => {
    const heavy = await noise(1500, 1000).webp({ quality: 100 }).toBuffer();
    const result = await compressImage(heavy);
    assert.ok(result.length < heavy.length * 0.8);
    const big = await noise(2400, 1200).webp({ quality: 100 }).toBuffer();
    assert.deepEqual(await sizeOf(await compressImage(big)), { width: MAX_SIDE, height: 900 });
  });

  it('an animated WebP stays as it is', async () => {
    const frame = await noise(200, 200).png().toBuffer();
    const red = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer();
    const animated = await sharp([frame, red], { join: { animated: true } })
      .webp({ quality: 100 })
      .toBuffer();
    assert.ok(((await sharp(animated, { animated: true }).metadata()).pages ?? 1) > 1, 'the test picture is animated');
    assert.equal(await compressImage(animated), animated);
  });

  it('the EXIF orientation is applied (the metadata is dropped)', async () => {
    // 3000×1500 stored sideways: shown as 1500×3000, so it ends up 900×1800.
    const original = await noise(3000, 1500).jpeg({ quality: 100 }).withMetadata({ orientation: 6 }).toBuffer();
    const result = await compressImage(original);
    assert.deepEqual(await sizeOf(result), { width: 900, height: 1800 });
    assert.equal((await sharp(result).metadata()).orientation, undefined);
  });

  it('the same picture gives the same bytes (the library stores it once)', async () => {
    const original = await noise(2800, 1800).jpeg({ quality: 100 }).toBuffer();
    assert.ok((await compressImage(original)).equals(await compressImage(original)));
  });

  it('GIFs, audio and what is not a picture come back untouched', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(600 * 1024)]);
    assert.equal(await compressImage(gif), gif);
    const mp3 = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(64)]);
    assert.equal(await compressImage(mp3), mp3);
    const text = Buffer.from('not a picture at all, just text');
    assert.equal(await compressImage(text), text);
  });

  it('a broken picture is not an error: it comes back as it is', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(600 * 1024, 7),
    ]);
    assert.equal(await compressImage(png), png);
  });
});

import sharp from 'sharp';

import { detectMedia } from './mediaStore';

/**
 * Compression of lesson images before they are stored (the library is served
 * to every student, and the server is small): every picture becomes a WebP of
 * quality 80 with its longest side at most MAX_SIDE px, transparency replaced
 * by white (a PNG of a drawing, a screenshot, a JPEG and a WebP all end the
 * same way). Exceptions: a GIF (it may be animated) and an animated WebP stay
 * as they are, and so does everything this cannot read; so does a WebP that
 * would save less than a fifth when it is not scaled (a second pass over a
 * compressed picture only loses quality: running this twice changes nothing),
 * and any file that would not get smaller. The result is deterministic: the
 * same picture gives the same bytes, so the library still stores it once
 * (names are the SHA-256 of the stored content: mediaStore.ts). No database or
 * HTTP here.
 */

/** The longest side of a stored picture, px. */
export const MAX_SIDE = 1800;
/** A WebP has to come out at least this much lighter (a share of the original), or it stays. */
const MIN_SAVING = 0.2;
/** More pixels than this is not decoded (a decompression bomb): the file stays as it is. */
const MAX_INPUT_PIXELS = 100_000_000;
const QUALITY = 80;

// A small server: no cache of decoded pictures, one thread.
sharp.cache(false);
sharp.concurrency(1);

/** The picture to store: a WebP if that is lighter, the very same buffer if not. */
export async function compressImage(bytes: Buffer): Promise<Buffer> {
  const detected = detectMedia(bytes);
  if (detected?.kind !== 'image' || detected.ext === 'gif') return bytes;
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, animated: true }).metadata();
    if ((metadata.pages ?? 1) > 1) return bytes; // animated: only the first frame would be kept
    const { width = 0, height = 0 } = metadata;
    const tooBig = Math.max(width, height) > MAX_SIDE;

    // rotate(): apply the EXIF orientation, because the metadata is dropped. flatten(): white instead of transparency.
    const result = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();
    // A WebP is already what this makes: it is only worth a pass if it is scaled or the gain is big.
    const allowed = detected.ext === 'webp' && !tooBig ? bytes.length * (1 - MIN_SAVING) : bytes.length;
    return result.length < allowed ? result : bytes;
  } catch {
    // Not a picture this can read (broken, too large in pixels): stored as it came.
    return bytes;
  }
}

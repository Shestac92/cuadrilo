import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { AUDIO_TYPES, IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, type MediaKind } from '@cuadrilo/shared/api';

import { DATA_DIR } from './paths';

/**
 * Storage of lesson images and audio: files in data/media named by the
 * SHA-256 of their content (the same file is stored once, a name never
 * changes). The type is detected from the content, not from the name.
 * Files only: no database or HTTP here (names and rules: mediaLibrary.ts;
 * routes: media.ts), so pure modules may import it.
 */

export const MEDIA_DIR = path.join(DATA_DIR, 'media');

/** Content-Type by file extension. */
export const MEDIA_TYPES: Record<string, string> = { ...IMAGE_TYPES, ...AUDIO_TYPES };

/** A stored file name: <sha256>.<ext>. */
export const FILE_NAME = new RegExp(`^[a-f0-9]{64}\\.(${Object.keys(MEDIA_TYPES).join('|')})$`);

interface Detected {
  kind: MediaKind;
  ext: string;
}

const ascii = (bytes: Buffer, start: number, end: number) => bytes.subarray(start, end).toString('latin1');

/** The file type from its first bytes; undefined if it is not an allowed image or audio. */
export function detectMedia(bytes: Buffer): Detected | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: 'image', ext: 'jpg' };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { kind: 'image', ext: 'png' };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { kind: 'image', ext: 'gif' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { kind: 'image', ext: 'webp' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return { kind: 'audio', ext: 'wav' };
  if (ascii(bytes, 0, 4) === 'OggS') return { kind: 'audio', ext: 'ogg' };
  // MPEG-4 audio: an "ftyp" box with an audio brand (a video brand is not accepted).
  if (ascii(bytes, 4, 8) === 'ftyp' && ['M4A ', 'M4B '].includes(ascii(bytes, 8, 12)))
    return { kind: 'audio', ext: 'm4a' };
  // MP3: an ID3 tag, or an MPEG audio frame (11 sync bits, layer III).
  if (ascii(bytes, 0, 3) === 'ID3') return { kind: 'audio', ext: 'mp3' };
  if (bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2) return { kind: 'audio', ext: 'mp3' };
  return undefined;
}

const MAX_BYTES: Record<MediaKind, number> = { image: MAX_IMAGE_BYTES, audio: MAX_AUDIO_BYTES };

/** The /media/… URL of a stored file (what lesson blocks hold). */
export const mediaUrl = (file: string) => `/media/${file}`;

export type InspectResult = { ok: true; file: string; kind: MediaKind } | { ok: false; reason: 'type' | 'size' };

/** What the bytes are and the file they are stored as (<sha256>.<ext>); nothing is written. */
export function inspectMedia(bytes: Buffer): InspectResult {
  const detected = detectMedia(bytes);
  if (!detected) return { ok: false, reason: 'type' };
  if (bytes.length > MAX_BYTES[detected.kind]) return { ok: false, reason: 'size' };
  const file = `${crypto.createHash('sha256').update(bytes).digest('hex')}.${detected.ext}`;
  return { ok: true, file, kind: detected.kind };
}

/** Writes the file unless it is there already (the same name is the same content). */
export function writeMediaFile(file: string, bytes: Buffer): void {
  const target = path.join(MEDIA_DIR, file);
  if (fs.existsSync(target)) return;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  // Written aside and renamed: a half-written file is never served.
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, target);
}

export function deleteMediaFile(file: string): void {
  fs.rmSync(path.join(MEDIA_DIR, file), { force: true });
}

/** The stored files (<sha256>.<ext>) in data/media. */
export function listStoredFiles(): string[] {
  if (!fs.existsSync(MEDIA_DIR)) return [];
  return fs.readdirSync(MEDIA_DIR).filter((name) => FILE_NAME.test(name));
}

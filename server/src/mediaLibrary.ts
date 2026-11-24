import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_TYPES, type MediaFile } from '@cuadrilo/shared/api';

import * as db from './db';
import { compressImage } from './imageCompress';
import { deleteMediaFile, inspectMedia, listStoredFiles, MEDIA_DIR, mediaUrl, writeMediaFile } from './mediaStore';
import { isoTime } from './views';

/**
 * The media library: the stored files (mediaStore.ts) with the names they
 * were uploaded under (table media). One record per file; names are unique,
 * so the teacher and the assistant can refer to a file by its name.
 */

type LessonRef = MediaFile['usedIn'][number];

/** A stored file's URL inside a lesson document (its JSON). */
const MEDIA_URL_IN_DOCUMENT = /\/media\/([a-f0-9]{64}\.[a-z0-9]+)/g;

/** Where each file is used: file → the lessons that show it. One pass over the lesson documents. */
export function mediaUsage(): Map<string, LessonRef[]> {
  const usage = new Map<string, LessonRef[]>();
  for (const lesson of db.listLessonDocuments()) {
    if (!lesson.content) continue;
    for (const [, file] of lesson.content.matchAll(MEDIA_URL_IN_DOCUMENT)) {
      let lessons = usage.get(file);
      if (!lessons) {
        lessons = [];
        usage.set(file, lessons);
      }
      if (!lessons.some((ref) => ref.lessonId === lesson.id))
        lessons.push({ lessonId: lesson.id, title: lesson.title });
    }
  }
  return usage;
}

export function toMediaFile(media: db.Media, usage: Map<string, LessonRef[]>): MediaFile {
  return {
    id: media.id,
    name: media.name,
    kind: media.kind,
    url: mediaUrl(media.file),
    bytes: media.bytes,
    uploadedAt: isoTime(media.uploaded_at),
    usedIn: usage.get(media.file) ?? [],
  };
}

/** The whole library, newest first, with where each file is used. */
export function listMediaFiles(): MediaFile[] {
  const usage = mediaUsage();
  return db.listMedia().map((media) => toMediaFile(media, usage));
}

export type AddMediaResult =
  | { ok: true; media: db.Media; existed: boolean }
  | { ok: false; reason: 'type' | 'size' | 'name_taken' };

/**
 * Adds a file under a name. A picture is compressed first (imageCompress.ts),
 * and the library holds that: the size limit is checked on what came in, the
 * file name is the hash of what is stored. The same content already in the
 * library comes back as it is (under its own name); a name another file has
 * is refused.
 */
export async function addMedia(bytes: Buffer, name: string): Promise<AddMediaResult> {
  const incoming = inspectMedia(bytes);
  if (!incoming.ok) return incoming;
  const stored = incoming.kind === 'image' ? await compressImage(bytes) : bytes;
  const inspected = stored === bytes ? incoming : inspectMedia(stored);
  if (!inspected.ok) return inspected;
  // No await from here on: the check and the insert cannot interleave with another upload.
  const existing = db.getMediaByFile(inspected.file);
  if (existing) return { ok: true, media: existing, existed: true };
  if (db.isMediaNameTaken(name)) return { ok: false, reason: 'name_taken' };
  writeMediaFile(inspected.file, stored);
  const media = db.insertMedia({ file: inspected.file, name, kind: inspected.kind, bytes: stored.length });
  return { ok: true, media, existed: false };
}

/** Removes the record and the file (the caller checks the file is not in a lesson). */
export function removeMedia(media: db.Media): void {
  db.deleteMedia(media.id);
  deleteMediaFile(media.file);
}

/**
 * Files in data/media without a record (stored before the library existed)
 * are recorded at start under their file name (the teacher can rename them).
 */
export function registerStoredFiles(): void {
  for (const file of listStoredFiles()) {
    if (db.getMediaByFile(file)) continue;
    const ext = file.slice(file.lastIndexOf('.') + 1);
    db.insertMedia({
      file,
      name: file,
      kind: ext in IMAGE_TYPES ? 'image' : 'audio',
      bytes: fs.statSync(path.join(MEDIA_DIR, file)).size,
    });
  }
}

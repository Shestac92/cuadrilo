import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, type MediaUploaded, mediaNameInput } from '@cuadrilo/shared/api';
import express, { type Request, type Response, Router } from 'express';

import { requireTeacher, requireUser } from './auth';
import * as db from './db';
import { notFound, parseBody, parseId, parseQuery, sendError, wrap } from './http';
import { t } from './i18n';
import { addMedia, listMediaFiles, mediaUsage, removeMedia, toMediaFile } from './mediaLibrary';
import { FILE_NAME, MEDIA_DIR, MEDIA_TYPES } from './mediaStore';

/**
 * Lesson images and audio over HTTP: served at /media/<name> to anyone signed
 * in; the teacher's media library at /api/media. Files: mediaStore.ts; names
 * and rules: mediaLibrary.ts.
 */

/** GET /media/<name>: for anyone signed in; cached forever (a name never changes). */
export function mediaRouter(): Router {
  const router = Router();
  router.get('/:name', requireUser, (req, res, next) => {
    const name = req.params.name as string;
    if (!FILE_NAME.test(name)) return notFound(res);
    const type = MEDIA_TYPES[name.slice(name.lastIndexOf('.') + 1)];
    // sendFile answers Range requests (seeking in audio) and 404s a missing file via next().
    res.sendFile(
      name,
      {
        root: MEDIA_DIR,
        headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable' },
        dotfiles: 'deny',
      },
      (error) => {
        if (error && !res.headersSent) notFound(res);
        else if (error) next(error);
      },
    );
  });
  return router;
}

/**
 * /api/media (teacher): the media library. GET the files; POST one (the file
 * is the request body, any Content-Type; ?name= the name it is listed under;
 * a big picture is scaled down and compressed, see mediaLibrary.addMedia);
 * PATCH /:id { name } renames; DELETE /:id removes a file no lesson shows.
 */
export function mediaLibraryRouter(): Router {
  const router = Router();
  router.use(requireTeacher);

  router.get(
    '/',
    wrap((_req, res) => {
      res.json(listMediaFiles());
    }),
  );

  router.post(
    '/',
    express.raw({ type: () => true, limit: Math.max(MAX_IMAGE_BYTES, MAX_AUDIO_BYTES) }),
    wrap(async (req, res) => {
      const query = parseQuery(mediaNameInput, req, res);
      if (!query) return;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await addMedia(body, query.name);
      if (!result.ok) {
        if (result.reason === 'type') return sendError(res, 'invalid_input', t('errors.mediaFormat'));
        if (result.reason === 'size') return sendError(res, 'too_large', t('errors.mediaTooLarge'));
        return sendError(res, 'name_taken', t('errors.mediaNameTaken', { name: query.name }));
      }
      const uploaded: MediaUploaded = { ...toMediaFile(result.media, mediaUsage()), existed: result.existed };
      res.status(result.existed ? 200 : 201).json(uploaded);
    }),
  );

  router.patch(
    '/:id',
    wrap((req, res) => {
      const media = findMedia(req, res);
      if (!media) return;
      const input = parseBody(mediaNameInput, req, res);
      if (!input) return;
      if (db.isMediaNameTaken(input.name, media.id)) {
        return sendError(res, 'name_taken', t('errors.mediaNameInUse', { name: input.name }));
      }
      db.renameMedia(media.id, input.name);
      res.json(toMediaFile(db.existing(db.getMedia(media.id), 'Media'), mediaUsage()));
    }),
  );

  router.delete(
    '/:id',
    wrap((req, res) => {
      const media = findMedia(req, res);
      if (!media) return;
      const usedIn = mediaUsage().get(media.file) ?? [];
      if (usedIn.length > 0) {
        const lessons = usedIn.map((lesson) => `«${lesson.title}»`).join(', ');
        return sendError(res, 'media_in_use', t('errors.mediaInUse', { lessons }));
      }
      removeMedia(media);
      res.status(204).end();
    }),
  );

  return router;
}

/** The library file of :id; 404 otherwise. */
function findMedia(req: Request, res: Response): db.Media | undefined {
  const id = parseId(req, res);
  if (id === undefined) return undefined;
  const media = db.getMedia(id);
  if (!media) notFound(res, t('errors.mediaNotFound'));
  return media;
}

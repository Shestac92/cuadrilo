import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import {
  type LookupResult,
  lookupQuery,
  saveVocabularyInput,
  VOCABULARY_TRANSLATIONS,
  type VocabularyEntry,
} from '@cuadrilo/shared/api';
import { type Response, Router } from 'express';

import { requireStudent } from './auth';
import * as db from './db';
import { DICTIONARY_FILE, lookupWord, openDictionary, TRANSLATION_LANG } from './dictionaryDb';
import { notFound, parseBody, parseId, parseQuery, sendError, wrap } from './http';
import { LANG, t } from './i18n';
import { isoTime } from './views';

/**
 * The translator (/api/dictionary, everyone signed in) and a student's
 * vocabulary (/api/vocabulary). The dictionary is dictionaries/<APP_LANG>-<TRANSLATION_LANG>.db, built
 * outside this repository; this server only reads it.
 */

/** Whether this installation has a dictionary: TRANSLATION_LANG is set and the file of the pair exists (else the translator is off). */
export const dictionaryAvailable = () => DICTIONARY_FILE !== undefined && fs.existsSync(DICTIONARY_FILE);

let opened: { dictionary: DatabaseSync; mtimeMs: number } | undefined;

/** The dictionary, reopened when the file is rebuilt; undefined if it is not built. */
function dictionary(): DatabaseSync | undefined {
  if (!DICTIONARY_FILE) return undefined;
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(DICTIONARY_FILE).mtimeMs;
  } catch {
    opened?.dictionary.close();
    opened = undefined;
    return undefined;
  }
  if (opened?.mtimeMs !== mtimeMs) {
    opened?.dictionary.close();
    opened = { dictionary: openDictionary(DICTIONARY_FILE), mtimeMs };
  }
  return opened.dictionary;
}

/** The word's results, or undefined after answering 503 (no dictionary). */
function lookup(word: string, res: Response): LookupResult[] | undefined {
  const dict = dictionary();
  if (!dict || !TRANSLATION_LANG) {
    sendError(res, 'dictionary_unavailable', t('errors.dictionaryUnavailable'));
    return undefined;
  }
  return lookupWord(dict, word, LANG, TRANSLATION_LANG);
}

const toEntry = (row: db.VocabularyRow): VocabularyEntry => ({
  id: row.id,
  lemma: row.lemma,
  word: row.word,
  translation: row.translation,
  lessonId: row.lesson_id,
  lessonTitle: row.lesson_title,
  createdAt: isoTime(row.created_at),
});

/** /api/dictionary */
export function dictionaryRouter(): Router {
  const router = Router();

  // A word in any form → its lemmas with translations ([] if unknown).
  router.get(
    '/',
    wrap((req, res) => {
      const query = parseQuery(lookupQuery, req, res);
      if (!query) return;
      const results = lookup(query.word, res);
      if (results) res.json(results.filter((r) => r.translations.length > 0));
    }),
  );

  return router;
}

/** /api/vocabulary: the student's own saved words. */
export function vocabularyRouter(): Router {
  const router = Router();
  router.use(requireStudent);

  router.get(
    '/',
    wrap((req, res) => {
      res.json(db.listVocabulary(req.user.dbId).map(toEntry));
    }),
  );

  // Saves a word as the translator showed it; the same lemma again refreshes it.
  router.post(
    '/',
    wrap((req, res) => {
      const input = parseBody(saveVocabularyInput, req, res);
      if (!input) return;
      if (
        input.lessonId !== undefined &&
        !(db.getLesson(input.lessonId) && db.hasLessonAccess(input.lessonId, req.user.dbId))
      ) {
        return notFound(res, t('errors.lessonNotFound'));
      }
      const results = lookup(input.word, res);
      if (!results) return;
      const result = results.find((r) => r.lemma === input.lemma && r.translations.length > 0);
      if (!result) return sendError(res, 'invalid_input', t('errors.wordNotInDictionary'));

      const existed = db.hasVocabularyLemma(req.user.dbId, LANG, result.lemma);
      const saved = db.saveVocabularyEntry({
        student_id: req.user.dbId,
        lang: LANG,
        lemma: result.lemma,
        translation: result.translations.slice(0, VOCABULARY_TRANSLATIONS).join(', '),
        word: input.word,
        lesson_id: input.lessonId ?? null,
      });
      res.status(existed ? 200 : 201).json(toEntry(db.existing(db.getVocabularyEntry(saved.id), 'Vocabulary entry')));
    }),
  );

  router.delete(
    '/:id',
    wrap((req, res) => {
      const id = parseId(req, res);
      if (id === undefined) return;
      if (!db.deleteVocabularyEntry(req.user.dbId, id)) return notFound(res, t('errors.wordNotFound'));
      res.status(204).end();
    }),
  );

  return router;
}

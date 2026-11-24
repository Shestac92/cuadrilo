import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { LANG } from './i18n';
import { DICTIONARIES_DIR } from './paths';

/**
 * The offline dictionary: reference data, kept apart from lessons.db in
 * dictionaries/<words>-<translations>.db (one file per pair of languages, in git). Built outside this app, from Wiktionary
 * dumps (kaikki.org extracts), and never written by the app. Its ids change on
 * every rebuild: nothing in lessons.db refers to them (students' vocabulary
 * stores the words themselves).
 *
 * Only plain translations: a word in any form → its lemma(s) → the list of
 * translations. No grammar, senses or labels.
 */

/** The file of a pair of languages: dictionaries/es-ru.db. */
export const dictionaryFile = (lang: string, targetLang: string) =>
  path.join(DICTIONARIES_DIR, `${lang}-${targetLang}.db`);

/**
 * The language of the translations, the students' own: TRANSLATION_LANG, with no default. Not set: there is no
 * translator.
 */
export const TRANSLATION_LANG: string | undefined = process.env.TRANSLATION_LANG?.trim() || undefined;

/** The file of the pair the translator uses: the words of the installation's language (APP_LANG) and TRANSLATION_LANG. */
export const DICTIONARY_FILE: string | undefined = TRANSLATION_LANG
  ? dictionaryFile(LANG, TRANSLATION_LANG)
  : undefined;

export const DICTIONARY_SCHEMA = `
  PRAGMA foreign_keys = ON;

  -- A lemma (dictionary form) that has translations: "tener", "casa".
  CREATE TABLE IF NOT EXISTS dict_lemmas (
    id    INTEGER PRIMARY KEY,
    lang  TEXT NOT NULL,           -- language of the word: 'es'
    lemma TEXT NOT NULL,
    UNIQUE (lang, lemma)
  );

  -- Every form of a lemma, the lemma itself included, so a lookup always
  -- starts here: "tengo" → tener, "casas" → casa, "vino" → vino and venir.
  -- form_key: the form lowercased (a word at the start of a sentence is capitalized).
  CREATE TABLE IF NOT EXISTS dict_forms (
    lang     TEXT    NOT NULL,
    form_key TEXT    NOT NULL,
    lemma_id INTEGER NOT NULL REFERENCES dict_lemmas (id) ON DELETE CASCADE,
    PRIMARY KEY (lang, form_key, lemma_id)
  ) WITHOUT ROWID;

  -- Translations of a lemma, best first: confirmed by more sources first.
  CREATE TABLE IF NOT EXISTS dict_translations (
    lemma_id    INTEGER NOT NULL REFERENCES dict_lemmas (id) ON DELETE CASCADE,
    target_lang TEXT    NOT NULL,  -- language of the translation
    translation TEXT    NOT NULL,
    rank        INTEGER NOT NULL,
    PRIMARY KEY (lemma_id, target_lang, rank)
  ) WITHOUT ROWID;

  -- About the build: sources and their dump files, build time (attribution, updates).
  CREATE TABLE IF NOT EXISTS dict_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/** Opens a dictionary file (read-only for the app; the build script writes its own). */
export function openDictionary(file: string, readOnly = true): DatabaseSync {
  return new DatabaseSync(file, { readOnly });
}

export interface LookupResult {
  lemma: string;
  translations: string[];
}

/**
 * A word as clicked in a lesson → its lemmas with their translations. Several
 * results for ambiguous forms ("vino": vino, venir) and contractions ("del":
 * de, el). Empty if unknown.
 */
export function lookupWord(dictionary: DatabaseSync, word: string, lang: string, targetLang: string): LookupResult[] {
  const lemmas = dictionary
    .prepare(
      `SELECT l.id, l.lemma FROM dict_forms f JOIN dict_lemmas l ON l.id = f.lemma_id
       WHERE f.lang = ? AND f.form_key = ?
       ORDER BY l.lemma = ? DESC, l.lemma`,
    )
    .all(lang, word.trim().toLowerCase(), word.trim()) as unknown as { id: number; lemma: string }[];
  const translations = dictionary.prepare(
    'SELECT translation FROM dict_translations WHERE lemma_id = ? AND target_lang = ? ORDER BY rank',
  );
  // Proper nouns ("Bueno" for "bueno") only when no common word matches ("España").
  const isProper = (lemma: string) => lemma[0] !== lemma[0].toLowerCase();
  const shown = lemmas.some((l) => !isProper(l.lemma)) ? lemmas.filter((l) => !isProper(l.lemma)) : lemmas;
  return shown.map((l) => ({
    lemma: l.lemma,
    translations: (translations.all(l.id, targetLang) as unknown as { translation: string }[]).map(
      (t) => t.translation,
    ),
  }));
}

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DICTIONARY_SCHEMA, dictionaryFile } from '../../src/dictionaryDb';

/**
 * A tiny dictionary for the API tests of the translator, written straight into the file of its pair of
 * languages (no build tool involved). [lemma, its forms besides the lemma itself in lower case, translations best first].
 * "vino" is two lemmas (the wine, a form of "venir"), "del" and "al" are contractions, "Bueno" and "España" are
 * proper nouns, "bueno" has more translations than a vocabulary entry keeps.
 */
const ENTRIES: [string, string[], string[]][] = [
  ['Bueno', [], ['Буэно']],
  ['España', [], ['Испания']],
  ['a', ['al'], ['в', 'к']],
  ['audio', [], ['а́удио']],
  [
    'bueno',
    [],
    [
      'хоро́ший',
      'добрый',
      'годный',
      'пригодный',
      'здоровый',
      'хорошо',
      'ладно',
      'подходящий',
      'большой',
      'значительный',
    ],
  ],
  ['casa', ['casas'], ['до́м', 'жили́ще']],
  ['de', ['del'], ['из', 'от']],
  ['el', ['al', 'del'], ['этот']],
  ['hablar', ['hablamos'], ['говорить', 'разговаривать']],
  ['malo', [], ['плохой']],
  ['tener', ['tengo', 'tienes'], ['иметь', 'владеть']],
  ['uno', [], ['один']],
  ['venir', ['vino'], ['приходи́ть', 'годиться', 'хорошо сидеть']],
  ['vino', [], ['вино']],
];

/** Writes dictionaries/<lang>-<target>.db into `dir`. */
export function writeTestDictionary(dir: string, lang = 'es', targetLang = 'ru'): void {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, path.basename(dictionaryFile(lang, targetLang))));
  db.exec(DICTIONARY_SCHEMA);
  const lemma = db.prepare('INSERT INTO dict_lemmas (lang, lemma) VALUES (?, ?) RETURNING id');
  const form = db.prepare('INSERT OR IGNORE INTO dict_forms (lang, form_key, lemma_id) VALUES (?, ?, ?)');
  const translation = db.prepare(
    'INSERT INTO dict_translations (lemma_id, target_lang, translation, rank) VALUES (?, ?, ?, ?)',
  );
  for (const [word, forms, translations] of ENTRIES) {
    const { id } = lemma.get(lang, word) as { id: number };
    for (const key of [word.toLowerCase(), ...forms]) form.run(lang, key, id);
    for (const [index, text] of translations.entries()) translation.run(id, targetLang, text, index + 1);
  }
  db.close();
}

# Translator

An offline dictionary for the words of a lesson: one file per pair of languages, `dictionaries/<words>-<translations>.db` (in git, separate from `lessons.db`; from Wiktionary, CC BY-SA 4.0, see `dictionaries/README.md`; `DICTIONARIES_DIR` moves the folder). The pair is `APP_LANG` → `TRANSLATION_LANG`, which has no default. The files are built outside this repository. Only simple translations, no grammar or labels; vulgar words are dropped.

- **The translator** (`client/src/components/Translator.tsx`): click a word → its base form (or several: `vino` → vino, venir) and up to 10 translations. Inputs and buttons keep their own clicks; selecting text opens nothing. Word chips (the movable words of `drag-gaps`, `match`, `sort`, `order`, and the letters) are never translated: a press on them starts a drag, so it must not compete with the dictionary (they are in `NOT_TRANSLATED`). It works for students, and for the teacher in the preview, the class page and the board; only a student gets "save".
- **Vocabulary** (`/vocabulario`): "Guardar en mi vocabulario" stores the base form with the first 5 translations (taken by the server); saving again updates it. It is personal: the teacher does not see it.
- **Review on the dashboard** (`components/VocabularyReview.tsx`): one saved word at a time in random order. "Palabra" shows the word and reveals the translation, "Traducción" the reverse. "Ya lo sé" deletes the word after a confirmation; arrows go back or restart; "Ver todas" opens the vocabulary. Nothing about the review is stored.
- **Without a dictionary** the API answers 503 `dictionary_unavailable` and the rest of the app works.
- Wiktionary is credited in the translation window and the vocabulary.

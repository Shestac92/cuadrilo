# Dictionaries

Offline dictionaries for the lesson translator: one file per pair of languages, `<words>-<translations>.db` (ISO 639-1). They are reference data in git, only read by the server; the installation's own data is in `data/`.

The installation uses the pair `APP_LANG` → `TRANSLATION_LANG`. Without its file the translator is off (`/api/config` says `dictionary: false`) and the rest works. The files are built outside this repository; `DICTIONARIES_DIR` moves the folder.

## License

Derived from Wiktionary (**CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/) with wiktextract (kaikki.org). The `.db` files are under the same license: credit Wiktionary and share changes under CC BY-SA 4.0 (the credit is also shown in the translator window). The license of the code does not cover these files, and theirs does not cover the code.

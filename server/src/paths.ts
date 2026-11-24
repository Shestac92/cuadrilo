import path from 'node:path';

/** Repository root (server/src -> ../..). */
export const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * lessons.db and media/. DATA_DIR moves them elsewhere (a relative path is
 * from the repository root, not from the folder the server was started in): the
 * tests run the server on a temporary directory, never on data/.
 */
export const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || 'data');

/**
 * The dictionaries (dictionaries/<language of the words>-<language of the translations>.db): reference
 * data kept in git, not per-installation data. DICTIONARIES_DIR moves them (the tests use a temporary one).
 */
export const DICTIONARIES_DIR = path.resolve(ROOT_DIR, process.env.DICTIONARIES_DIR || 'dictionaries');

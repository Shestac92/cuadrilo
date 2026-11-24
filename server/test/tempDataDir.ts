import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Import first in a test that loads the database module (src/db.ts) without a
 * server: the database goes to a temporary directory, never to data/.
 */
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));

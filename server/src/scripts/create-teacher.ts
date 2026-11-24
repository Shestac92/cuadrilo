/**
 * Creates a teacher account, or sets a new password for an existing one.
 * Teachers are not managed in the UI; this is the only way to add one.
 *
 * Usage: npm run create-teacher -w server -- <login>
 * Prints a generated password once; it is stored only as a hash.
 */
import crypto from 'node:crypto';

import { LOGIN_PATTERN } from '@cuadrilo/shared/api';

import { hashPassword } from '../auth';
import * as db from '../db';

async function main(): Promise<void> {
  const login = process.argv[2];
  if (!login || !LOGIN_PATTERN.test(login)) {
    console.error('Usage: npm run create-teacher -w server -- <login>');
    console.error('Login: 3-32 chars, latin letters, digits, dot, dash, underscore.');
    process.exit(1);
  }

  const password = crypto.randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password);
  const existing = db.getUserWithHashByLogin(login);

  if (existing && existing.role !== 'teacher') {
    console.error(`"${login}" is a student login. Choose another login.`);
    process.exit(1);
  }
  if (existing) {
    db.updateUserPassword(existing.id, passwordHash);
    db.deleteUserSessions(existing.id);
    console.log(`New password for teacher "${existing.login}": ${password}`);
  } else {
    db.createUser(login, passwordHash, 'teacher');
    console.log(`Teacher "${login}" created. Password: ${password}`);
  }
  console.log('It is shown only once; only a hash is stored.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

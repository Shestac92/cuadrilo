import type { DatabaseSync } from 'node:sqlite';

import { homeworkClassSession } from './202611201200_homework_class_session';

/**
 * Changes to a database made after the baseline: the schema and the lesson
 * documents stored in it.
 *
 * The baseline is the schema in db.ts. A database starts from it and every
 * migration here is applied on top, in the order of their ids, **also to a
 * new database** (so a change is written once, here, and a new installation
 * takes the same road as an old one).
 *
 * - Once the app is released, the schema in db.ts is frozen: a change goes
 *   only into a new migration. Before the first release it may still change.
 * - A migration is a file `<YYYYMMDDHHMM>_<what>.ts` in this folder that
 *   exports a function getting the database (raw SQL through `db.exec`, or a
 *   read, change in code and write of the JSON documents), and an entry in
 *   the list below. The id is the file name without `.ts`: it sorts by time
 *   and two changes made at once do not collide.
 * - Never change or remove a released migration: databases have it recorded.
 *   They are never squashed: a database that skipped a release must still be
 *   able to catch up.
 * - Each one runs once, in a transaction (all applied or not at all), and is
 *   recorded in the table `schema_migrations`.
 */
export interface Migration {
  /** `<YYYYMMDDHHMM>_<what>`, the file's name: unique, the order is the sort order. */
  id: string;
  /** What it does, for the table and the log. */
  name: string;
  up: (db: DatabaseSync) => void;
}

/** Recorded when a database is first seen by the migrations: everything in db.ts is already there. */
export const BASELINE_ID = 'baseline';

export const MIGRATIONS: Migration[] = [homeworkClassSession];

/** Applies the migrations that the database has not had yet; returns how many ran. */
export function migrate(db: DatabaseSync, migrations: Migration[]): number {
  const ids = migrations.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length || ids.includes(BASELINE_ID)) {
    throw new Error('Migration ids must be unique');
  }
  const ordered = [...migrations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  const record = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as unknown as { id: string }[]).map((row) => row.id),
  );

  const known = new Set([BASELINE_ID, ...ids]);
  const unknown = [...applied].filter((id) => !known.has(id)).sort();
  if (unknown.length > 0) {
    throw new Error(
      `The database is from a newer version of the app (it has ${unknown.join(', ')}, which this one does not know): update the app`,
    );
  }

  if (!applied.has(BASELINE_ID)) record.run(BASELINE_ID, 'the schema of db.ts');

  let ran = 0;
  for (const migration of ordered) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      record.run(migration.id, migration.name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.id} (${migration.name}) failed: ${(e as Error).message}`, { cause: e });
    }
    ran++;
  }
  return ran;
}

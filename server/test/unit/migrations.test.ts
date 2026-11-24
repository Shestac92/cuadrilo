import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';

import { BASELINE_ID, type Migration, migrate } from '../../src/migrations';

const memory = () => new DatabaseSync(':memory:');
const applied = (db: DatabaseSync) =>
  (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as unknown as { id: string }[]).map((r) => r.id);

describe('migrations', () => {
  it('the baseline is recorded once; the migrations run once, in the order of their ids', () => {
    const db = memory();
    const log: string[] = [];
    // Listed out of order on purpose: the ids decide.
    const list: Migration[] = [
      { id: '202601020000_b', name: 'b', up: () => log.push('b') },
      { id: '202601010000_a', name: 'a', up: () => log.push('a') },
    ];
    assert.equal(migrate(db, list), 2);
    assert.equal(migrate(db, list), 0);
    list.push({ id: '202601030000_c', name: 'c', up: () => log.push('c') });
    assert.equal(migrate(db, list), 1);
    assert.deepEqual(log, ['a', 'b', 'c']);
    assert.deepEqual(applied(db), ['202601010000_a', '202601020000_b', '202601030000_c', BASELINE_ID]);
  });

  it('run on a new database too: the baseline is db.ts, the rest is applied on top of it', () => {
    const db = memory();
    db.exec('CREATE TABLE t (n INTEGER)');
    const list: Migration[] = [{ id: '202601010000_a', name: 'a', up: (d) => d.exec('INSERT INTO t VALUES (1)') }];
    assert.equal(migrate(db, list), 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n, 1);
  });

  it('one that was added with an older id than the applied ones still runs', () => {
    const db = memory();
    const late: Migration = { id: '202601050000_late', name: 'late', up: () => {} };
    migrate(db, [late]);
    const early: Migration = { id: '202601010000_early', name: 'early', up: () => {} };
    assert.equal(migrate(db, [early, late]), 1);
    assert.deepEqual(applied(db), ['202601010000_early', '202601050000_late', BASELINE_ID]);
  });

  it('a failed one is rolled back whole and the next start tries it again', () => {
    const db = memory();
    db.exec('CREATE TABLE t (n INTEGER)');
    let broken = true;
    const list: Migration[] = [
      {
        id: '202601010000_half',
        name: 'half',
        up: (d) => {
          d.exec('INSERT INTO t VALUES (1)');
          if (broken) throw new Error('boom');
        },
      },
    ];
    assert.throws(() => migrate(db, list), /Migration 202601010000_half \(half\) failed: boom/);
    assert.deepEqual(applied(db), [BASELINE_ID]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n, 0);
    broken = false;
    assert.equal(migrate(db, list), 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n, 1);
  });

  it('refuse a database from a newer version', () => {
    const db = memory();
    migrate(db, [{ id: '202601010000_a', name: 'a', up: () => {} }]);
    assert.throws(() => migrate(db, []), /newer version[\s\S]*202601010000_a|202601010000_a[\s\S]*newer version/);
  });

  it('refuse duplicate ids', () => {
    const one: Migration = { id: '202601010000_a', name: 'a', up: () => {} };
    assert.throws(() => migrate(memory(), [one, one]), /unique/);
  });
});

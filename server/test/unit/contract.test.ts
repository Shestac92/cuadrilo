import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createClassInput,
  createHomeworkInput,
  createStudentInput,
  homeworkListQuery,
  lessonTitleInput,
  lookupQuery,
} from '@cuadrilo/shared/api';

import { boardEntryInput } from '@cuadrilo/shared/board';

import { isoTime } from '../../src/views';

/** Request schemas of the API contract (shared/src/api.ts) and the response helpers. */
describe('API contract', () => {
  it('student credentials', () => {
    assert.ok(createStudentInput.safeParse({ login: 'ana.b_2-x', password: '12345678' }).success);
    assert.ok(!createStudentInput.safeParse({ login: 'ab', password: '12345678' }).success, 'login too short');
    assert.ok(!createStudentInput.safeParse({ login: 'ana maría', password: '12345678' }).success, 'space');
    assert.ok(!createStudentInput.safeParse({ login: 'ana', password: '1234567' }).success, 'password too short');
  });

  it('lesson title is trimmed', () => {
    assert.deepEqual(lessonTitleInput.parse({ title: '  Hola  ' }), { title: 'Hola' });
    assert.ok(!lessonTitleInput.safeParse({ title: '   ' }).success);
    assert.ok(!lessonTitleInput.safeParse({ title: 'a'.repeat(201) }).success);
  });

  it('homework: at least one student and exercise; list query coerces numbers', () => {
    assert.ok(!createHomeworkInput.safeParse({ lessonId: 1, studentIds: [], exerciseIds: ['e'] }).success);
    assert.ok(!createHomeworkInput.safeParse({ lessonId: 1, studentIds: [1], exerciseIds: [] }).success);
    assert.deepEqual(homeworkListQuery.parse({ lessonId: '7', status: 'submitted' }), {
      lessonId: 7,
      status: 'submitted',
    });
    assert.ok(!homeworkListQuery.safeParse({ status: 'done' }).success);
  });

  it('board line: one trimmed line of 1–1000 characters', () => {
    assert.deepEqual(boardEntryInput.parse({ text: '  hola  ' }), { text: 'hola' });
    assert.equal(
      boardEntryInput.parse({ text: `  ${'a'.repeat(1000)}  ` }).text.length,
      1000,
      'trimmed before the limit',
    );
    for (const text of ['', '   ', 'a\nb', 'a\r\nb', 'a'.repeat(1001)]) {
      assert.ok(!boardEntryInput.safeParse({ text }).success, JSON.stringify(text.slice(0, 10)));
    }
  });

  it('class: for a group or for one student, not both and not neither', () => {
    assert.ok(createClassInput.safeParse({ lessonId: 1, groupId: 2 }).success);
    assert.ok(createClassInput.safeParse({ lessonId: 1, studentId: 2 }).success);
    assert.ok(!createClassInput.safeParse({ lessonId: 1 }).success);
    assert.ok(!createClassInput.safeParse({ lessonId: 1, groupId: 2, studentId: 3 }).success);
    assert.ok(!createClassInput.safeParse({ lessonId: 1, studentIds: [2, 3] }).success);
  });

  it('translator: one word, letters and at most one hyphen', () => {
    for (const word of ['casa', 'Tengo', 'árbol', 'ñandú', 'medio-día', '  casa  '])
      assert.ok(lookupQuery.safeParse({ word }).success, word);
    for (const word of ['', 'dos palabras', 'casa1', 'a-b-c', '-casa', "l'eau", 'a'.repeat(65)]) {
      assert.ok(!lookupQuery.safeParse({ word }).success, word);
    }
  });

  it('times are ISO in UTC', () => {
    assert.equal(isoTime('2026-10-15 20:41:03'), '2026-10-15T20:41:03.000Z', 'SQLite datetime() is UTC');
    assert.equal(isoTime('2026-10-15T20:41:03.123Z'), '2026-10-15T20:41:03.123Z');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMode } from '../src/lesson/exerciseModes';

describe('resolveMode', () => {
  const available = ['teacher', 'edit'] as const;

  it('uses the chosen mode', () => {
    assert.equal(resolveMode('edit', 'teacher', available), 'edit');
  });

  it('falls back to the default when nothing is chosen', () => {
    assert.equal(resolveMode(undefined, 'teacher', available), 'teacher');
  });

  it('ignores a mode the page does not allow (the student view outside the editor)', () => {
    assert.equal(resolveMode('student', 'teacher', available), 'teacher');
  });
});

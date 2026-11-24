import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Homework, HomeworkEvent } from '@cuadrilo/shared/api';

import { noticesAfterEvent, replaceOrAddHomework } from '../src/homeworkList';

const hw = (id: number, status: Homework['status'] = 'assigned'): Homework => ({
  id,
  lessonId: 1,
  lessonTitle: 'L',
  studentId: 2,
  studentLogin: 's',
  status,
  createdAt: '2026-10-19T10:00:00.000Z',
  exercises: [],
});
const event = (homework: Homework, reason: HomeworkEvent['reason']): HomeworkEvent => ({ homework, reason });

describe('live homework list', () => {
  it('replaces a homework in place, adds a new one first, waits for the load', () => {
    const list = [hw(2), hw(1)];
    assert.deepEqual(
      replaceOrAddHomework(list, hw(1, 'submitted'))?.map((h) => `${h.id}:${h.status}`),
      ['2:assigned', '1:submitted'],
    );
    assert.deepEqual(
      replaceOrAddHomework(list, hw(3))?.map((h) => h.id),
      [3, 2, 1],
    );
    assert.equal(replaceOrAddHomework(undefined, hw(3)), undefined, 'not loaded yet: the load brings it');
  });

  it('notices: one per homework, the newest replaces, silent updates drop stale ones', () => {
    let notices: HomeworkEvent[] = [];
    notices = noticesAfterEvent(notices, event(hw(1, 'needs_work'), 'needs_work'));
    notices = noticesAfterEvent(notices, event(hw(2), 'assigned'));
    assert.deepEqual(
      notices.map((n) => n.homework.id),
      [1, 2],
    );

    notices = noticesAfterEvent(notices, event(hw(1, 'accepted'), 'accepted'));
    assert.deepEqual(
      notices.map((n) => `${n.homework.id}:${n.reason}`),
      ['2:assigned', '1:accepted'],
      'replaced, now the newest',
    );

    const same = noticesAfterEvent(notices, event(hw(2), null));
    assert.equal(same, notices, 'a silent update with the same status keeps the notice (and the list)');

    notices = noticesAfterEvent(notices, event(hw(2, 'submitted'), null));
    assert.deepEqual(
      notices.map((n) => n.homework.id),
      [1],
      'the student sent it from another tab: "Nueva tarea" is out of date',
    );
  });
});

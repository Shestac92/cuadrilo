/** Pure updates of the live homework list and its notices (liveConnection.tsx; tested in client/test/homework.test.ts). */

import type { HomeworkEvent } from '@cuadrilo/shared/api';

import type { Homework } from './api';

/** The list with this homework replaced, or added first (the newest) if new. Not loaded yet: the load brings it. */
export function replaceOrAddHomework(list: Homework[] | undefined, homework: Homework): Homework[] | undefined {
  if (!list) return list;
  let found = false;
  const next = list.map((h) => {
    if (h.id !== homework.id) return h;
    found = true;
    return homework;
  });
  return found ? next : [homework, ...next];
}

/**
 * Notices after a homework event, in one pass: a notice of that homework is
 * replaced by a newer one (reason) or dropped by a silent update that makes it
 * out of date (another status).
 */
export function noticesAfterEvent(list: HomeworkEvent[], event: HomeworkEvent): HomeworkEvent[] {
  const next: HomeworkEvent[] = [];
  let droppedAny = false;
  for (const notice of list) {
    const isOutdated =
      notice.homework.id === event.homework.id &&
      (event.reason !== null || notice.homework.status !== event.homework.status);
    if (isOutdated) droppedAny = true;
    else next.push(notice);
  }
  if (event.reason) return [...next, event];
  return droppedAny ? next : list;
}

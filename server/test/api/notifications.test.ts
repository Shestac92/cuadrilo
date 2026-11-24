import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { HomeworkDeletedEvent, HomeworkEvent } from '@cuadrilo/shared/api';

import { type Client, type RecordingSocket, signIn, startServer, type TestServer, until, wait } from '../helpers';

const homeworkEvents = (s: RecordingSocket) =>
  s.events.filter((e) => e.name === 'homework').map((e) => e.data as HomeworkEvent);
const reasons = (s: RecordingSocket) => homeworkEvents(s).map((e) => `${e.homework.status}:${e.reason}`);

/** Live homework updates over the socket (/live): who is told what. */
describe('homework notifications', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let st: RecordingSocket;
  let sa: RecordingSocket;
  let sb: RecordingSocket;
  let id: number;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    [st, sa, sb] = await Promise.all([teacher.connect(), ana.connect(), ben.connect()]);
  });
  after(() => {
    for (const client of [teacher, ana, ben]) client.close();
    server.stop();
  });

  it('assigned: the student is notified, the teachers refresh', async () => {
    const r = await teacher.call('POST', '/api/homework', {
      lessonId: server.lessonId,
      studentIds: [server.users.ana],
      exerciseIds: ['ex-orden', 'ex-un-una'],
    });
    id = r.body[0].id;
    await until(() => homeworkEvents(sa).length === 1 && homeworkEvents(st).length === 1);
    const [event] = homeworkEvents(sa);
    assert.equal(event.reason, 'assigned');
    assert.equal(event.homework.id, id);
    assert.equal(event.homework.lessonTitle, 'Los artículos');
    assert.deepEqual(
      event.homework.exercises.map((e) => e.number),
      [1, 6],
    );
    assert.deepEqual(reasons(st), ['assigned:null']);
    await wait();
    assert.equal(homeworkEvents(sb).length, 0, 'other students hear nothing');
  });

  it('submitted: the teachers are notified, once', async () => {
    await ana.call('POST', `/api/homework/${id}/submit`);
    await until(() => homeworkEvents(st).length === 2);
    assert.deepEqual(reasons(st).at(-1), 'submitted:submitted');
    await until(() => homeworkEvents(sa).length === 2);
    assert.deepEqual(reasons(sa).at(-1), 'submitted:null', 'the student’s other tabs refresh');

    await ana.call('POST', `/api/homework/${id}/submit`);
    await wait();
    assert.equal(homeworkEvents(st).length, 2, 'sent again: nothing new');
  });

  it('reviewed: the student is notified of needs_work and accepted only', async () => {
    for (const status of ['needs_work', 'accepted', 'accepted', 'assigned']) {
      await teacher.call('PATCH', `/api/homework/${id}`, { status });
    }
    await until(() => homeworkEvents(sa).length === 5);
    await wait();
    assert.deepEqual(
      reasons(sa).slice(2),
      ['needs_work:needs_work', 'accepted:accepted', 'assigned:null'],
      'the same status twice: no event',
    );
    assert.deepEqual(reasons(st).slice(2), ['needs_work:null', 'accepted:null', 'assigned:null']);
  });

  it('deleted: the student and the teachers drop it', async () => {
    await teacher.call('DELETE', `/api/homework/${id}`);
    const deleted = (s: RecordingSocket) =>
      s.events.filter((e) => e.name === 'homeworkDeleted').map((e) => (e.data as HomeworkDeletedEvent).id);
    await until(() => deleted(sa).length === 1 && deleted(st).length === 1);
    assert.deepEqual(deleted(sa), [id]);
    await wait();
    assert.equal(sb.events.filter((e) => e.name.startsWith('homework')).length, 0);
  });
});

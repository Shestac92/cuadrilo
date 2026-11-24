import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, lastEvent, type RecordingSocket, signIn, startServer, type TestServer, until } from '../helpers';

/** A saved lesson document: the students who may open the lesson are told to reload. */
describe('lessonUpdated', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let anaSocket: RecordingSocket;
  let benSocket: RecordingSocket;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, { studentIds: [server.users.ana] });
    anaSocket = await ana.connect();
    benSocket = await ben.connect();
  });
  after(() => {
    teacher.close();
    ana.close();
    ben.close();
    return server.stop();
  });

  it('goes to the students with access, not to the others', async () => {
    const lesson = (await teacher.call('GET', `/api/lessons/${server.lessonId}`)).body as {
      content: unknown;
      rev: number;
    };
    const saved = await teacher.call('PUT', `/api/lessons/${server.lessonId}/content`, {
      content: lesson.content,
      rev: lesson.rev,
    });
    assert.equal(saved.status, 200);
    await until(() => !!lastEvent(anaSocket, 'lessonUpdated'));
    assert.deepEqual(lastEvent(anaSocket, 'lessonUpdated'), {
      lessonId: server.lessonId,
      rev: (saved.body as { rev: number }).rev,
    });
    assert.equal(lastEvent(benSocket, 'lessonUpdated'), undefined);
  });
});

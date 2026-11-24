import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, lastEvent, type RecordingSocket, signIn, startServer, type TestServer, until } from '../helpers';

/** The teacher's comment under a student's answer: stored apart, only the teacher writes, only that student reads. */
describe('answer comments', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let teacherSocket: RecordingSocket;
  let anaSocket: RecordingSocket;
  const BLOCK = 'ex-cocina-essay';
  const put = (studentId: number, text: unknown, blockId = BLOCK) =>
    teacher.call('PUT', `/api/lessons/${server.lessonId}/students/${studentId}/comments/${blockId}`, { text });
  const own = async (client: Client) =>
    (await client.call('GET', `/api/lessons/${server.lessonId}/comments`)).body as Record<string, string>;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, {
      studentIds: [server.users.ana, server.users.ben],
    });
    teacherSocket = await teacher.connect();
    anaSocket = await ana.connect();
  });
  after(() => {
    teacher.close();
    ana.close();
    ben.close();
    return server.stop();
  });

  it('the teacher writes before any answer; the student reads their own, others see nothing', async () => {
    const r = await put(server.users.ana, 'Lee la regla primero.\nLuego escribe.');
    assert.equal(r.status, 200);
    assert.deepEqual(await own(ana), { [BLOCK]: 'Lee la regla primero.\nLuego escribe.' });
    assert.deepEqual(await own(ben), {});
    const seen = (await teacher.call('GET', `/api/lessons/${server.lessonId}/students/${server.users.ana}/comments`))
      .body;
    assert.deepEqual(seen, { [BLOCK]: 'Lee la regla primero.\nLuego escribe.' });
  });

  it('stays when the student answers, and is changed and removed by the teacher only', async () => {
    await ana.call('PUT', `/api/lessons/${server.lessonId}/states/${BLOCK}`, { state: { text: 'Hola' } });
    assert.equal((await own(ana))[BLOCK], 'Lee la regla primero.\nLuego escribe.');
    await put(server.users.ana, 'Mejor.');
    assert.equal((await own(ana))[BLOCK], 'Mejor.');
    const blank = await put(server.users.ana, '  \n ');
    assert.deepEqual(blank.body, { text: '' });
    assert.deepEqual(await own(ana), {});
  });

  it('is sent live to the student and the teachers; an empty text says "removed"', async () => {
    await put(server.users.ana, 'Hola, Ana.');
    await until(() => !!lastEvent(anaSocket, 'comment') && !!lastEvent(teacherSocket, 'comment'));
    for (const socket of [anaSocket, teacherSocket]) {
      assert.deepEqual(lastEvent(socket, 'comment'), {
        lessonId: server.lessonId,
        studentId: server.users.ana,
        blockId: BLOCK,
        text: 'Hola, Ana.',
      });
    }
    await put(server.users.ana, '');
    await until(() => (lastEvent(anaSocket, 'comment') as { text: string }).text === '');
  });

  it('the student cannot write or read others; only answer blocks, students and short texts', async () => {
    const write = await ana.call(
      'PUT',
      `/api/lessons/${server.lessonId}/students/${server.users.ana}/comments/${BLOCK}`,
      { text: 'me' },
    );
    assert.equal(write.status, 403);
    assert.equal(
      (await ben.call('GET', `/api/lessons/${server.lessonId}/students/${server.users.ana}/comments`)).status,
      403,
    );
    assert.equal((await put(server.users.ana, 'x', 'no-such-block')).status, 404);
    assert.equal((await put(server.users.teacher, 'x')).status, 404);
    assert.equal((await put(server.users.ana, 'x'.repeat(2001))).status, 400);
    assert.equal((await put(server.users.ana, 5)).status, 400);
  });
});

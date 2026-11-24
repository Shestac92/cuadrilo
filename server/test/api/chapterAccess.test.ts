import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  type Client,
  lastEvent,
  type RecordingSocket,
  signIn,
  startServer,
  type TestServer,
  until,
  wait,
} from '../helpers';

interface Chapter {
  id: string;
  exercises: unknown[];
  locked?: true;
  exerciseCount?: number;
}

/** A student can be given some chapters of a lesson instead of all of it. */
describe('chapter access', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let anaSocket: RecordingSocket;
  let lesson: string;
  const chaptersOf = async (client: Client) =>
    ((await client.call('GET', lesson)).body.content.chapters as Chapter[]).map((c) => [c.id, !c.locked] as const);

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    lesson = `/api/lessons/${server.lessonId}`;
    anaSocket = await ana.connect();
    // Ana: the first and the third chapter; Ben: all of it.
    const r = await teacher.call('PUT', `${lesson}/access`, {
      studentIds: [server.users.ana, server.users.ben],
      chapters: { [server.users.ana]: ['ch-indefinido', 'ch-practica'] },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.chapters, { [server.users.ana]: ['ch-indefinido', 'ch-practica'] });
  });
  after(() => {
    teacher.close();
    ana.close();
    ben.close();
    return server.stop();
  });

  it('the student is sent the open chapters only, the others are locked and empty', async () => {
    assert.deepEqual(await chaptersOf(ana), [
      ['ch-indefinido', true],
      ['ch-definido', false],
      ['ch-practica', true],
    ]);
    const closed = ((await ana.call('GET', lesson)).body.content.chapters as Chapter[])[1];
    assert.deepEqual(closed.exercises, []);
    assert.equal(closed.exerciseCount, 2, 'the exercises are counted, so the numbers of the next ones stay');
    assert.ok(!JSON.stringify(closed).includes('ex-el-la'), 'nothing of the chapter is sent');
    assert.ok(
      (await chaptersOf(ben)).every(([, open]) => open),
      'a student with the whole lesson',
    );
    assert.ok(
      (await chaptersOf(teacher)).every(([, open]) => open),
      'the teacher',
    );
  });

  it('answers are taken from the open chapters only', async () => {
    const put = (blockId: string) => ana.call('PUT', `${lesson}/states/${blockId}`, { state: { text: 'x' } });
    assert.equal((await put('ex-cocina-essay')).status, 200);
    assert.equal((await put('ex-video-essay')).status, 200);
    assert.equal((await put('ex-escucha-gaps')).status, 404, 'closed chapter');
  });

  it('opening a chapter tells the student, and closing keeps the answers', async () => {
    const r = await teacher.call('PUT', `${lesson}/access`, {
      studentIds: [server.users.ana, server.users.ben],
      chapters: { [server.users.ana]: ['ch-indefinido', 'ch-definido', 'ch-practica'] },
    });
    assert.equal(r.status, 200);
    await until(() => (lastEvent<{ reason?: string }>(anaSocket, 'lessonUpdated')?.reason ?? '') === 'access');
    assert.ok((await chaptersOf(ana)).every(([, open]) => open));
    assert.equal(
      (await ana.call('PUT', `${lesson}/states/ex-escucha-gaps`, { state: { values: ['a'], states: [null] } })).status,
      200,
    );
    await teacher.call('PUT', `${lesson}/access`, {
      studentIds: [server.users.ana],
      chapters: { [server.users.ana]: ['ch-indefinido'] },
    });
    assert.equal((await ana.call('GET', `${lesson}/states`)).body['ex-escucha-gaps'].state.values[0], 'a');
    assert.equal((await ana.call('PUT', `${lesson}/states/ex-escucha-gaps`, { state: {} })).status, 404);
  });

  it('homework opens the chapters of its exercises', async () => {
    const r = await teacher.call('POST', '/api/homework', {
      lessonId: server.lessonId,
      studentIds: [server.users.ana],
      exerciseIds: ['ex-orden'],
    });
    assert.equal(r.status, 201);
    assert.deepEqual(await chaptersOf(ana), [
      ['ch-indefinido', true],
      ['ch-definido', false],
      ['ch-practica', true],
    ]);
  });

  it('a class opens the chapter it is in, and no more', async () => {
    await teacher.call('PUT', `${lesson}/access`, { studentIds: [], chapters: {} });
    const started = await teacher.call('POST', '/api/classes', {
      lessonId: server.lessonId,
      studentId: server.users.ana,
    });
    assert.equal(started.status, 201);
    assert.deepEqual(
      await chaptersOf(ana),
      [
        ['ch-indefinido', true],
        ['ch-definido', false],
        ['ch-practica', false],
      ],
      'the first chapter',
    );
    (await teacher.connect()).emit('chapter', { lessonId: server.lessonId, chapterId: 'ch-practica' });
    await wait();
    const after = await chaptersOf(ana);
    assert.deepEqual(
      after.map(([, open]) => open),
      [true, false, true],
    );
  });
});

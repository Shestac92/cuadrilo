import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, type RecordingSocket, signIn, startServer, type TestServer, until } from '../helpers';

/** API part 6: homework set during a class (POST /api/classes/:id/homework). */
describe('class homework', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let sa: RecordingSocket;
  let sb: RecordingSocket;
  let st: RecordingSocket;
  let classId: number;
  const set = (exerciseId: unknown, id = classId) =>
    teacher.call('POST', `/api/classes/${id}/homework`, { exerciseId });
  const reasons = (s: RecordingSocket) =>
    s.events.filter((e) => e.name === 'homework').map((e) => (e.data as { reason: string | null }).reason);
  const homeworkOf = async (c: Client) =>
    (await c.call('GET', '/api/homework')).body as {
      id: number;
      status: string;
      exercises: { id: string }[];
    }[];

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    [sa, sb, st] = await Promise.all([ana.connect(), ben.connect(), teacher.connect()]);
    const groupId = (
      await teacher.call('POST', '/api/groups', { name: 'A1', studentIds: [server.users.ana, server.users.ben] })
    ).body.id;
    const cls = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, groupId });
    assert.equal(cls.status, 201);
    assert.deepEqual(cls.body.homeworkExerciseIds, []);
    classId = cls.body.id;
  });
  after(async () => {
    for (const client of [teacher, ana, ben]) client.close();
    await server.stop();
  });

  it('only the teacher, only a real exercise of the class’s lesson', async () => {
    assert.equal((await ana.call('POST', `/api/classes/${classId}/homework`, { exerciseId: 'ex-un-una' })).status, 403);
    for (const [body, name] of [
      [undefined, 'missing'],
      ['', 'empty'],
      ['ex-unknown', 'not in the lesson'],
    ] as const) {
      const r = await set(body);
      assert.equal(r.status, 400, name);
      assert.equal(r.body.code, 'invalid_input');
    }
    assert.equal((await set('ex-un-una', classId + 1000)).status, 404, 'not the teacher’s class');
    assert.deepEqual(await homeworkOf(ana), [], 'nothing was made');
  });

  it('the first exercise makes a homework for everybody in the class, the next ones join it', async () => {
    const first = await set('ex-un-una');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.homeworkExerciseIds, ['ex-un-una']);
    for (const c of [ana, ben]) {
      const list = await homeworkOf(c);
      assert.equal(list.length, 1);
      assert.deepEqual(
        list[0].exercises.map((e) => e.id),
        ['ex-un-una'],
      );
      assert.equal(list[0].status, 'assigned');
    }
    await until(() => reasons(sa).includes('assigned') && reasons(sb).includes('assigned') && reasons(st).length >= 2);
    assert.equal(reasons(sa).at(-1), 'assigned', 'the student is told like with "Asignar tarea"');
    assert.equal(reasons(st).at(-1), null, 'the teacher’s pages refresh without a notice');

    const second = await set('ex-orden');
    assert.deepEqual([...second.body.homeworkExerciseIds].sort(), ['ex-orden', 'ex-un-una']);
    const [h] = await homeworkOf(ana);
    assert.equal((await homeworkOf(ana)).length, 1, 'the same homework, not a new one');
    assert.deepEqual(
      h.exercises.map((e) => e.id),
      ['ex-un-una', 'ex-orden'],
    );
    await until(() => reasons(sa).at(-1) === 'updated' && reasons(sb).at(-1) === 'updated');
  });

  it('the same exercise again changes and says nothing; a student taken out gets no more', async () => {
    const heard = reasons(sa).length;
    assert.equal((await set('ex-un-una')).status, 200);
    assert.equal((await homeworkOf(ana))[0].exercises.length, 2);
    assert.equal(reasons(sa).length, heard);

    await teacher.call('DELETE', `/api/classes/${classId}/students/${server.users.ben}`);
    assert.equal((await set('ex-test')).status, 200);
    assert.deepEqual((await homeworkOf(ana))[0].exercises.map((e) => e.id).sort(), [
      'ex-orden',
      'ex-test',
      'ex-un-una',
    ]);
    assert.equal((await homeworkOf(ben))[0].exercises.length, 2, 'Ben is not in the class: nothing new');
  });

  it('a homework that was sent is the student’s turn again when it gets an exercise', async () => {
    const [h] = await homeworkOf(ana);
    assert.equal((await ana.call('POST', `/api/homework/${h.id}/submit`)).status, 200);
    assert.equal((await homeworkOf(ana))[0].status, 'submitted');
    assert.equal((await set('ex-test')).status, 200, 'already in it');
    assert.equal((await homeworkOf(ana))[0].status, 'submitted', 'nothing added: not reopened');
    assert.equal((await set('ex-pares')).status, 200);
    assert.equal((await homeworkOf(ana))[0].status, 'assigned');
  });

  it('only while the class is on', async () => {
    assert.equal((await teacher.call('POST', `/api/classes/${classId}/end`)).status, 204);
    assert.equal((await set('ex-un-una')).status, 404);
  });

  it('a class with nobody in it makes nothing', async () => {
    const solo = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, studentId: server.users.eva });
    assert.equal(solo.status, 201);
    await teacher.call('DELETE', `/api/classes/${solo.body.id}/students/${server.users.eva}`);
    const r = await set('ex-un-una', solo.body.id);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'invalid_input');
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, lastEvent, type RecordingSocket, signIn, startServer, type TestServer, until } from '../helpers';

/** API part 2: students' answers (block states), relayed to the teacher of the class. */
describe('answers', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let states: string;
  const state = (path: string) => `${states}/${path}`;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    states = `/api/lessons/${server.lessonId}/states`;
    await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, { studentIds: [server.users.ana] });
  });
  after(async () => {
    teacher.close();
    ana.close();
    await server.stop();
  });

  it('a student saves and reads their answers', async () => {
    let r = await ana.call('PUT', state('ex-un-una-gaps'), { state: { values: ['un', ''], states: ['ok', null] } });
    assert.equal(r.status, 200);
    assert.match(r.body.updatedAt, /Z$/);
    r = await ana.call('PUT', state('ex-un-una-gaps'), { state: { values: ['un', 'una'], states: ['ok', 'ok'] } });
    assert.equal(r.status, 200, 'the new state replaces the old one');

    r = await ana.call('GET', states);
    assert.deepEqual(r.body['ex-un-una-gaps'].state.values, ['un', 'una']);
    assert.ok(!('status' in r.body['ex-un-una-gaps']), 'no block statuses');
  });

  it('answers to a test, true / false and a sequence', async () => {
    const answers = {
      'ex-test-choice': { picks: [[1], [0, 2]], states: ['ok', 'ok'] },
      'ex-vf-true-false': { answers: [true, null], states: ['ok', null] },
      'ex-dialogo-sequence': { order: ['1', '0', '2', '3'], state: 'bad' },
    };
    for (const [blockId, value] of Object.entries(answers)) {
      assert.equal((await ana.call('PUT', state(blockId), { state: value })).status, 200, blockId);
    }
    const saved = (await ana.call('GET', states)).body;
    for (const [blockId, value] of Object.entries(answers)) assert.deepEqual(saved[blockId].state, value, blockId);
  });

  it('rejects what is not an answer', async () => {
    assert.equal((await ana.call('PUT', state('th-indefinido-text'), { state: {} })).status, 404, 'theory block');
    assert.equal((await ana.call('PUT', state('nope'), { state: {} })).status, 404, 'unknown block');
    assert.equal((await ana.call('PUT', state('ex-un-una-gaps'), {})).status, 400, 'no state');
    const big = await ana.call('PUT', state('ex-un-una-gaps'), { state: { text: 'a'.repeat(17_000) } });
    assert.equal(big.status, 413);
    assert.equal(big.body.code, 'too_large');
  });

  it('access and roles', async () => {
    assert.equal((await ben.call('PUT', state('ex-un-una-gaps'), { state: {} })).status, 404, 'no access');
    assert.equal((await ben.call('GET', states)).status, 404);
    assert.equal((await teacher.call('PUT', state('ex-un-una-gaps'), { state: {} })).status, 403);
    assert.equal((await teacher.call('GET', states)).status, 403);
  });

  it('the teacher reads a student’s answers', async () => {
    const url = `/api/lessons/${server.lessonId}/students`;
    const r = await teacher.call('GET', `${url}/${server.users.ana}/states`);
    assert.deepEqual(r.body['ex-un-una-gaps'].state.values, ['un', 'una']);
    assert.equal((await teacher.call('GET', `${url}/${server.users.teacher}/states`)).status, 404, 'not a student');
    assert.equal((await ana.call('GET', `${url}/${server.users.ana}/states`)).status, 403);
    assert.equal(
      (await teacher.call('GET', `/api/lessons/${server.lessonId}/progress`)).status,
      404,
      'no progress summary',
    );
  });

  describe('live relay', () => {
    let watching: RecordingSocket;

    before(async () => {
      watching = await teacher.connect();
    });

    it('not relayed outside a class (homework)', async () => {
      await ana.call('PUT', state('ex-cocina-essay'), { state: { text: 'Hola' } });
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(lastEvent(watching, 'answer'), undefined);
    });

    it('relayed to the teacher of the class', async () => {
      const cls = await teacher.call('POST', '/api/classes', {
        lessonId: server.lessonId,
        studentId: server.users.ana,
      });
      await ana.call('PUT', state('ex-cocina-essay'), { state: { text: 'Hola, ¿qué tal?' } });
      await until(() => !!lastEvent(watching, 'answer'));
      assert.deepEqual(lastEvent(watching, 'answer'), {
        studentId: server.users.ana,
        blockId: 'ex-cocina-essay',
        state: { text: 'Hola, ¿qué tal?' },
      });
      await teacher.call('POST', `/api/classes/${cls.body.id}/end`);
    });
  });
});

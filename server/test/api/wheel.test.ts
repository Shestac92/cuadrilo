import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SPIN_DURATION_MS, type WheelUpdate } from '@cuadrilo/shared/wheel';

import {
  type Client,
  emitAck,
  lastEvent,
  type RecordingSocket,
  signIn,
  startServer,
  type TestServer,
  until,
} from '../helpers';

/** The wheel of a live class: anyone spins it, everyone sees the same spin, a late page learns where it is. */
describe('wheel in a class', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let eva: Client;
  let lessonId: number;
  let teacherSocket: RecordingSocket;
  let anaSocket: RecordingSocket;
  let benSocket: RecordingSocket;
  let evaSocket: RecordingSocket;
  const BLOCK = 'wheel1';
  const request = { lessonId: 0, blockId: BLOCK };
  const wheelEvents = (socket: RecordingSocket) =>
    socket.events.filter((e) => e.name === 'wheel').map((e) => e.data as WheelUpdate);

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    eva = await signIn(server, 'eva');
    // A lesson with a wheel (and a half-empty one, which is not a wheel for the student).
    const created = await teacher.call('POST', '/api/lessons', { title: 'Ruleta' });
    lessonId = created.body.id;
    request.lessonId = lessonId;
    const content = {
      version: 2,
      chapters: [
        {
          id: 'c',
          exercises: [
            {
              id: 'e',
              title: 'Gira',
              blocks: [
                { id: BLOCK, type: 'wheel', items: ['Uno', 'Dos', 'Tres', '', 'Cinco'] },
                { id: 'empty', type: 'wheel', items: ['Solo uno', ''] },
                { id: 'essay', type: 'essay' },
              ],
            },
          ],
        },
      ],
    };
    const saved = await teacher.call('PUT', `/api/lessons/${lessonId}/content`, { content, rev: created.body.rev });
    assert.equal(saved.status, 200);
    await teacher.call('PUT', `/api/lessons/${lessonId}/access`, { studentIds: [server.users.ana, server.users.ben] });
    teacherSocket = await teacher.connect();
    anaSocket = await ana.connect();
    benSocket = await ben.connect();
    evaSocket = await eva.connect();
  });
  after(() => {
    for (const client of [teacher, ana, ben, eva]) client.close();
    return server.stop();
  });

  it('outside a class there is nothing to spin together: the answer is null', async () => {
    assert.equal(await emitAck(anaSocket, 'wheelSpin', request), null);
    assert.equal(await emitAck(teacherSocket, 'wheelState', request), null);
  });

  describe('in a class', () => {
    let classId: number;

    before(async () => {
      const group = await teacher.call('POST', '/api/groups', {
        name: 'wheel',
        studentIds: [server.users.ana, server.users.ben],
      });
      const cls = await teacher.call('POST', '/api/classes', { lessonId, groupId: group.body.id });
      assert.equal(cls.status, 201);
      classId = cls.body.id;
    });

    it('nobody has spun it: the state is empty; not a wheel, a block that is not there, and a stranger get null', async () => {
      const state = (await emitAck(anaSocket, 'wheelState', request)) as WheelUpdate;
      assert.equal(state.state, null);
      assert.ok(Math.abs(state.serverNow - Date.now()) < 5000, 'the server says its clock');
      for (const blockId of ['essay', 'empty', 'nope']) {
        assert.equal(await emitAck(anaSocket, 'wheelSpin', { lessonId, blockId }), null, blockId);
      }
      assert.equal(
        await emitAck(anaSocket, 'wheelSpin', { lessonId: 999_999, blockId: BLOCK }),
        null,
        'another lesson',
      );
      assert.equal(await emitAck(evaSocket, 'wheelSpin', request), null, 'a student who is not in the class');
      assert.equal(await emitAck(anaSocket, 'wheelSpin', { lessonId }), null, 'a broken request');
    });

    it('a student spins: everyone in the class gets the same spin, the one outside does not', async () => {
      const answer = (await emitAck(anaSocket, 'wheelSpin', request)) as WheelUpdate;
      assert.equal(answer.started, true);
      assert.equal(answer.state?.seq, 1);
      assert.equal(answer.state?.spin.durationMs, SPIN_DURATION_MS);
      await until(() => [teacherSocket, anaSocket, benSocket].every((s) => wheelEvents(s).length === 1));
      for (const socket of [teacherSocket, anaSocket, benSocket]) {
        assert.deepEqual(wheelEvents(socket)[0].state, answer.state, 'the same spin for everybody');
      }
      assert.equal(wheelEvents(evaSocket).length, 0);
    });

    it('while it turns nobody can spin it again; a late page asks and gets the spin in progress', async () => {
      const again = (await emitAck(benSocket, 'wheelSpin', request)) as WheelUpdate;
      assert.equal(again.started, false);
      assert.equal(again.state?.seq, 1);
      const late = (await emitAck(teacherSocket, 'wheelState', request)) as WheelUpdate;
      assert.deepEqual(late.state, wheelEvents(anaSocket)[0].state);
      assert.equal(wheelEvents(benSocket).length, 1, 'no second spin was sent');
    });

    it('when it has stopped the teacher can spin it, from where it rests', async () => {
      const first = wheelEvents(anaSocket)[0].state;
      assert.ok(first);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, first.spin.startedAt + SPIN_DURATION_MS - Date.now()) + 100),
      );
      const answer = (await emitAck(teacherSocket, 'wheelSpin', request)) as WheelUpdate;
      assert.equal(answer.started, true);
      assert.equal(answer.state?.seq, 2);
      assert.ok(Math.abs((answer.state?.spin.from ?? -1) - (((first.spin.to % 360) + 360) % 360)) < 1e-6);
      await until(() => wheelEvents(benSocket).length === 2);
      assert.deepEqual(lastEvent(benSocket, 'wheel'), answer);
    });

    it('a class that has ended forgets its wheels', async () => {
      await teacher.call('POST', `/api/classes/${classId}/end`);
      assert.equal(await emitAck(anaSocket, 'wheelState', request), null, 'no class');
      // A new class on the same lesson starts with the wheel at its start.
      const next = await teacher.call('POST', '/api/classes', { lessonId, studentId: server.users.ana });
      assert.equal(next.status, 201);
      const state = (await emitAck(anaSocket, 'wheelState', request)) as WheelUpdate;
      assert.equal(state.state, null);
      await teacher.call('POST', `/api/classes/${next.body.id}/end`);
    });
  });
});

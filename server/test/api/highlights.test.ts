import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, lastEvent, type RecordingSocket, signIn, startServer, type TestServer, until } from '../helpers';

interface Mark {
  start: number;
  end: number;
  color: string;
}

/** The teacher's colours on a student's essay: stored apart, moved with the student's edits, sent live. */
describe('answer highlights', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let teacherSocket: RecordingSocket;
  let anaSocket: RecordingSocket;
  const BLOCK = 'ex-cocina-essay';
  const edit = (studentId: number, blockId = BLOCK) =>
    `/api/lessons/${server.lessonId}/students/${studentId}/highlights/${blockId}`;
  const answer = (text: string) =>
    ana.call('PUT', `/api/lessons/${server.lessonId}/states/${BLOCK}`, { state: { text } });
  const own = async () =>
    (await ana.call('GET', `/api/lessons/${server.lessonId}/highlights`)).body as Record<string, Mark[]>;

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
    return server.stop();
  });

  it('the teacher colours and erases; the student reads their own', async () => {
    await answer('Yo soy professor y tengo un professor.');
    const painted = await teacher.call('POST', edit(server.users.ana), {
      paint: { start: 7, end: 16, quote: 'professor', color: 'red' },
    });
    assert.equal(painted.status, 200);
    assert.deepEqual(painted.body, [{ start: 7, end: 16, color: 'red' }]);
    const more = await teacher.call('POST', edit(server.users.ana), {
      paint: { start: 28, end: 37, quote: 'professor', color: 'green' },
    });
    assert.deepEqual(more.body, [
      { start: 7, end: 16, color: 'red' },
      { start: 28, end: 37, color: 'green' },
    ]);
    assert.deepEqual((await own())[BLOCK], more.body);
    const seen = (await teacher.call('GET', `/api/lessons/${server.lessonId}/students/${server.users.ana}/highlights`))
      .body;
    assert.deepEqual(seen[BLOCK], more.body);
    const erased = await teacher.call('POST', edit(server.users.ana), {
      erase: { start: 7, end: 16, quote: 'professor' },
    });
    assert.deepEqual(erased.body, [{ start: 28, end: 37, color: 'green' }]);
  });

  it('lines through and under: set and taken off, next to the colour; the student gets them as they are', async () => {
    await answer('Yo soy professor y tengo un professor.');
    const post = (body: object) => teacher.call('POST', edit(server.users.ana), body);
    const mark = (patch: object) => ({ format: { start: 7, end: 16, quote: 'professor', patch } });
    await post({ paint: { start: 7, end: 16, quote: 'professor', color: 'red' } });
    const struck = await post(mark({ strike: true, underline: 'wave' }));
    const green = { start: 28, end: 37, color: 'green' }; // from the test before, left alone
    assert.deepEqual(struck.body, [{ start: 7, end: 16, color: 'red', strike: true, underline: 'wave' }, green]);
    assert.deepEqual((await own())[BLOCK], struck.body);
    const off = await post(mark({ strike: false, underline: null }));
    assert.deepEqual(off.body, [{ start: 7, end: 16, color: 'red' }, green]);
    const onlyMarks = await post({ erase: { start: 7, end: 16, quote: 'professor' } });
    assert.deepEqual(onlyMarks.body, [green]);
    assert.equal((await post(mark({}))).status, 400, 'a change that changes nothing');
    assert.equal((await post(mark({ underline: 'dots' }))).status, 400);
    assert.equal((await ana.call('POST', edit(server.users.ana), mark({ strike: true }))).status, 403);
  });

  it('the student cannot colour; another student sees nothing of it', async () => {
    const r = await ana.call('POST', edit(server.users.ana), {
      paint: { start: 0, end: 2, quote: 'Yo', color: 'red' },
    });
    assert.equal(r.status, 403);
    assert.deepEqual((await ben.call('GET', `/api/lessons/${server.lessonId}/highlights`)).body, {});
    assert.equal(
      (await ben.call('GET', `/api/lessons/${server.lessonId}/students/${server.users.ana}/highlights`)).status,
      403,
    );
  });

  it('is sent live to the student and the teachers', async () => {
    const event = { lessonId: server.lessonId, studentId: server.users.ana, blockId: BLOCK, reason: 'teacher' };
    await teacher.call('POST', edit(server.users.ana), { paint: { start: 0, end: 2, quote: 'Yo', color: 'blue' } });
    await until(() => !!lastEvent(anaSocket, 'highlights') && !!lastEvent(teacherSocket, 'highlights'));
    for (const socket of [anaSocket, teacherSocket]) {
      assert.deepEqual(lastEvent(socket, 'highlights'), {
        ...event,
        highlights: [
          { start: 0, end: 2, color: 'blue' },
          { start: 28, end: 37, color: 'green' },
        ],
      });
    }
  });

  it('moves with the student editing the text, and says so', async () => {
    await answer('Hola. Yo soy professor y tengo un professor.');
    assert.deepEqual((await own())[BLOCK], [
      { start: 6, end: 8, color: 'blue' },
      { start: 34, end: 43, color: 'green' },
    ]);
    await until(() => (lastEvent(teacherSocket, 'highlights') as { reason: string }).reason === 'edit');
    assert.deepEqual((lastEvent(teacherSocket, 'highlights') as { highlights: Mark[] }).highlights.length, 2);
  });

  it('a colour on text the student has since changed: found by its quote, or 409', async () => {
    // The teacher saw the old text (the second "professor" at 28..37); it is now at 34..43.
    const moved = await teacher.call('POST', edit(server.users.ana), {
      paint: { start: 28, end: 37, quote: 'professor', color: 'yellow' },
    });
    assert.equal(moved.status, 200);
    assert.ok((moved.body as Mark[]).some((m) => m.start === 34 && m.end === 43 && m.color === 'yellow'));
    const gone = await teacher.call('POST', edit(server.users.ana), {
      paint: { start: 0, end: 5, quote: 'maestra', color: 'red' },
    });
    assert.equal(gone.status, 409);
    assert.equal(gone.body.code, 'text_changed');
  });

  it('only essays of the lesson and students; the input is checked', async () => {
    assert.equal(
      (
        await teacher.call('POST', edit(server.users.ana, 'ex-un-una-gaps'), {
          erase: { start: 0, end: 1, quote: 'a' },
        })
      ).status,
      404,
    );
    assert.equal(
      (await teacher.call('POST', edit(server.users.teacher), { erase: { start: 0, end: 1, quote: 'a' } })).status,
      404,
    );
    const bad = [
      {},
      { paint: { start: 0, end: 2, quote: 'Yo', color: 'pink' } },
      { paint: { start: 0, end: 2, quote: '', color: 'red' } },
      { paint: { start: -1, end: 2, quote: 'Yo', color: 'red' } },
    ];
    for (const body of bad) assert.equal((await teacher.call('POST', edit(server.users.ana), body)).status, 400);
  });

  it('taking all the colour off leaves nothing', async () => {
    const mine = (await own())[BLOCK];
    for (const m of mine) {
      await teacher.call('POST', edit(server.users.ana), {
        erase: { start: m.start, end: m.end, quote: m.start === 6 ? 'Yo' : 'professor' },
      });
    }
    assert.deepEqual(await own(), {});
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, type RecordingSocket, signIn, startServer, type TestServer, until, wait } from '../helpers';

/** API part 5: the boards (pizarra) of groups and of single students. */
describe('boards', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let eva: Client;
  let sa: RecordingSocket;
  let sb: RecordingSocket;
  let st: RecordingSocket;
  let groupId: number;
  const lines = (s: RecordingSocket) =>
    s.events.filter((e) => e.name === 'board').map((e) => (e.data as { entry: { text: string } }).entry.text);
  const feed = async (c: Client, boardId: number, before?: number) =>
    (await c.call('GET', `/api/boards/${boardId}/entries${before ? `?before=${before}` : ''}`)).body as {
      entries: { id: number; text: string }[];
      hasMore: boolean;
    };
  const texts = async (c: Client, boardId: number) => (await feed(c, boardId)).entries.map((e) => e.text);
  const startClass = async (audience: object) => {
    const r = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, ...audience });
    assert.equal(r.status, 201);
    return r.body as { id: number; boardId: number };
  };
  const end = (classId: number) => teacher.call('POST', `/api/classes/${classId}/end`);
  const write = (c: Client, boardId: number, text: unknown) =>
    c.call('POST', `/api/boards/${boardId}/entries`, { text });

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    eva = await signIn(server, 'eva');
    [sa, sb, st] = await Promise.all([ana.connect(), ben.connect(), teacher.connect()]);
    groupId = (
      await teacher.call('POST', '/api/groups', { name: 'A1', studentIds: [server.users.ana, server.users.ben] })
    ).body.id;
  });
  after(async () => {
    for (const client of [teacher, ana, ben, eva]) client.close();
    await server.stop();
  });

  it('the student’s list of boards is for students only and empty at first', async () => {
    assert.deepEqual((await ana.call('GET', '/api/boards')).body, []);
    assert.equal((await teacher.call('GET', '/api/boards')).status, 403);
  });

  it('a group’s class: everyone writes, everyone of the class sees it live', async () => {
    const c1 = await startClass({ groupId });
    const boardId = c1.boardId;

    const fromTeacher = await write(teacher, boardId, '  Hola, clase  ');
    assert.equal(fromTeacher.status, 201);
    assert.deepEqual(Object.keys(fromTeacher.body).sort(), ['id', 'text'], 'no author');
    assert.equal(fromTeacher.body.text, 'Hola, clase');
    assert.equal((await write(ana, boardId, 'Hola, profe')).status, 201);
    await until(() => [sa, sb, st].every((s) => lines(s).includes('Hola, clase') && lines(s).includes('Hola, profe')));
    assert.equal((sa.events.find((e) => e.name === 'board')!.data as { boardId: number }).boardId, boardId);

    assert.deepEqual(await texts(ben, boardId), ['Hola, clase', 'Hola, profe']);
    assert.deepEqual(await texts(teacher, boardId), ['Hola, clase', 'Hola, profe']);
    assert.deepEqual((await ben.call('GET', '/api/boards')).body, [{ id: boardId, groupName: 'A1' }]);

    for (const [text, name] of [
      ['   ', 'empty'],
      ['a\nb', 'newline'],
      ['a'.repeat(1001), 'over 1000'],
      [undefined, 'missing'],
    ]) {
      const bad = await write(teacher, boardId, text);
      assert.equal(bad.status, 400, name as string);
      assert.equal(bad.body.code, 'invalid_input');
    }
    assert.equal((await write(teacher, boardId, 'a'.repeat(1000))).status, 201);
    assert.equal((await write(teacher, boardId, '<b>no html</b>')).body.text, '<b>no html</b>', 'stored as is');

    assert.equal((await write(teacher, boardId + 1000, 'x')).status, 404);
    assert.equal(
      (await teacher.call('PUT', `/api/boards/${boardId}/entries/1`, { text: 'x' })).status,
      404,
      'no editing',
    );

    // Removed from the class: no new lines, no writing.
    await teacher.call('DELETE', `/api/classes/${c1.id}/students/${server.users.ben}`);
    await write(teacher, boardId, 'after ben left');
    await until(() => lines(sa).includes('after ben left'));
    await wait(100);
    assert.ok(!lines(sb).includes('after ben left'), 'a removed student gets no new lines');
    assert.equal((await write(ben, boardId, 'x')).status, 403);
    assert.deepEqual((await texts(ben, boardId)).at(-1), 'after ben left', 'but still reads the board of the group');
    await end(c1.id);
  });

  it('the teacher deletes a line (typo) during a class: it goes from every page, nobody else may', async () => {
    const c = await startClass({ groupId });
    const typo = (await write(teacher, c.boardId, 'Holla')).body as { id: number };
    const ana1 = (await write(ana, c.boardId, 'mine')).body as { id: number };
    const removedIds = (s: RecordingSocket) =>
      s.events.filter((e) => e.name === 'boardRemoved').map((e) => (e.data as { entryId: number }).entryId);

    assert.equal((await ana.call('DELETE', `/api/boards/${c.boardId}/entries/${typo.id}`)).status, 403, 'a student');
    assert.equal((await ben.call('DELETE', `/api/boards/${c.boardId}/entries/${typo.id}`)).status, 403);
    assert.ok((await texts(teacher, c.boardId)).includes('Holla'));

    assert.equal((await teacher.call('DELETE', `/api/boards/${c.boardId}/entries/${typo.id}`)).status, 204);
    await until(() => [sa, sb, st].every((s) => removedIds(s).includes(typo.id)));
    assert.ok(!(await texts(ana, c.boardId)).includes('Holla'));
    assert.ok((await texts(ana, c.boardId)).includes('mine'), 'the other lines stay');
    assert.equal((await teacher.call('DELETE', `/api/boards/${c.boardId}/entries/${typo.id}`)).status, 404, 'twice');
    assert.equal((await teacher.call('DELETE', `/api/boards/${c.boardId}/entries/abc`)).status, 400);
    assert.equal((await teacher.call('DELETE', `/api/boards/${c.boardId + 1000}/entries/${ana1.id}`)).status, 404);
    await end(c.id);
    assert.equal((await teacher.call('DELETE', `/api/boards/${c.boardId}/entries/${ana1.id}`)).status, 403, 'no class');
    assert.ok((await texts(ana, c.boardId)).includes('mine'));
  });

  it('nobody writes outside a class; a stranger sees nothing', async () => {
    const { boardId } = (await teacher.call('GET', '/api/classes/current')).body ?? {};
    assert.equal(boardId, undefined);
    const boards = (await ana.call('GET', '/api/boards')).body as { id: number }[];
    const id = boards[0].id;
    assert.equal((await write(teacher, id, 'late')).status, 403, 'teacher, no class');
    assert.equal((await write(ana, id, 'late')).status, 403, 'student, no class');
    assert.ok(!(await texts(ana, id)).includes('late'));

    assert.equal(((await feed(eva, id)) as unknown as { code: string }).code, 'not_found');
    assert.equal((await write(eva, id, 'x')).status, 404);
    assert.deepEqual((await eva.call('GET', '/api/boards')).body, []);
  });

  it('a class of one student has the student’s own board, apart from the group’s', async () => {
    const group = (await ana.call('GET', '/api/boards')).body as { id: number }[];
    const solo = await startClass({ studentId: server.users.ana });
    assert.ok(!group.some((b) => b.id === solo.boardId));
    assert.equal((await write(ana, solo.boardId, 'solo line')).status, 201);
    assert.equal((await write(ana, group[0].id, 'wrong board')).status, 403, 'the class is on another board');
    assert.equal((await write(teacher, group[0].id, 'wrong board')).status, 403);
    assert.deepEqual(await texts(ana, solo.boardId), ['solo line']);
    assert.equal((await ben.call('GET', `/api/boards/${solo.boardId}/entries`)).status, 404, 'ben has no access to it');

    const mine = (await ana.call('GET', '/api/boards')).body as { id: number; groupName: string | null }[];
    assert.deepEqual(mine, [
      { id: solo.boardId, groupName: null },
      { id: group[0].id, groupName: 'A1' },
    ]);
    assert.equal((await ana.call('GET', '/api/classes/current')).body.boardId, solo.boardId);
    await end(solo.id);

    // The same board again in the next solo class: the history is there.
    const again = await startClass({ studentId: server.users.ana });
    assert.equal(again.boardId, solo.boardId);
    assert.deepEqual(await texts(ana, again.boardId), ['solo line']);
    await end(again.id);
  });

  it('members of a group change: newcomers read all, the one who left loses it', async () => {
    const [{ id }] = (await ana.call('GET', '/api/boards')).body.filter(
      (b: { groupName: string | null }) => b.groupName,
    );
    assert.equal((await texts(ana, id)).length >= 4, true);
    await teacher.call('PATCH', `/api/groups/${groupId}`, { studentIds: [server.users.ana, server.users.eva] });
    assert.ok((await texts(eva, id)).includes('Hola, clase'), 'a newcomer reads the whole history');
    assert.equal((await ben.call('GET', `/api/boards/${id}/entries`)).status, 404, 'ben left the group');
    assert.deepEqual((await ben.call('GET', '/api/boards')).body, []);

    const c = await startClass({ groupId });
    assert.deepEqual(c.boardId, id);
    assert.equal((await write(eva, id, 'hi from eva')).status, 201);
    await teacher.call('PATCH', `/api/groups/${groupId}`, { studentIds: [server.users.ana] });
    assert.equal((await write(eva, id, 'x')).status, 404, 'left the group during the class: no writing');
    await end(c.id);
  });

  it('pages of 50, the latest first, older ones by `before`', async () => {
    const c = await startClass({ studentId: server.users.ben });
    for (let i = 1; i <= 120; i++) await write(teacher, c.boardId, `line ${i}`);
    const latest = await feed(ben, c.boardId);
    assert.equal(latest.entries.length, 50);
    assert.equal(latest.entries[0].text, 'line 71');
    assert.equal(latest.entries.at(-1)?.text, 'line 120');
    assert.equal(latest.hasMore, true);
    const older = await feed(ben, c.boardId, latest.entries[0].id);
    assert.deepEqual([older.entries[0].text, older.entries.at(-1)?.text], ['line 21', 'line 70']);
    assert.equal(older.hasMore, true);
    const oldest = await feed(ben, c.boardId, older.entries[0].id);
    assert.deepEqual([oldest.entries.length, oldest.entries[0].text, oldest.hasMore], [20, 'line 1', false]);
    assert.equal((await ben.call('GET', `/api/boards/${c.boardId}/entries?before=abc`)).status, 400);
    await end(c.id);
  });

  it('deleting the group deletes its board', async () => {
    const [{ id }] = (await ana.call('GET', '/api/boards')).body.filter(
      (b: { groupName: string | null }) => b.groupName,
    );
    assert.equal((await teacher.call('DELETE', `/api/groups/${groupId}`)).status, 204);
    assert.equal((await teacher.call('GET', `/api/boards/${id}/entries`)).status, 404);
  });
});

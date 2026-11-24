import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  type Client,
  emitAck,
  lastEvent,
  type RecordingSocket,
  signIn,
  startServer,
  type TestServer,
  until,
  wait,
} from '../helpers';

/** API part 4: live classes over HTTP and the /class socket. */
describe('classes', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let sa: RecordingSocket;
  let sb: RecordingSocket;
  let st: RecordingSocket;
  let classId: number;
  const access = async (lessonId = server.lessonId) =>
    (await teacher.call('GET', `/api/lessons/${lessonId}/access`)).body.studentIds as number[];

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
    sa = await ana.connect();
    sb = await ben.connect();
  });
  after(async () => {
    for (const client of [teacher, ana, ben]) client.close();
    await server.stop();
  });

  it('a student’s socket starts with no class', async () => {
    await until(() => sa.events.some((e) => e.name === 'class'));
    assert.equal(lastEvent(sa, 'class'), null);
  });

  it('validates the start', async () => {
    const start = (body: object) => teacher.call('POST', '/api/classes', body);
    const lessonId = server.lessonId;
    assert.equal((await ana.call('POST', '/api/classes', { lessonId, studentId: server.users.ana })).status, 403);
    assert.equal((await start({ lessonId: 999999, studentId: server.users.ana })).status, 404);
    assert.equal((await start({ lessonId, studentId: server.users.teacher })).status, 400, 'not a student');
    assert.equal((await start({ lessonId })).status, 400, 'for nobody');
    assert.equal(
      (await start({ lessonId, studentIds: [server.users.ana, server.users.ben] })).status,
      400,
      'several single students: make a group',
    );
    assert.equal((await start({ lessonId, groupId: 1, studentId: server.users.ana })).status, 400, 'both');
    assert.equal((await start({ lessonId, groupId: 999999 })).status, 404);
    const empty = await teacher.call('POST', '/api/groups', { name: 'empty', studentIds: [] });
    assert.equal((await start({ lessonId, groupId: empty.body.id })).status, 400, 'a group with no students');
  });

  it('starts: students told and given access', async () => {
    const r = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, studentId: server.users.ana });
    assert.equal(r.status, 201);
    assert.equal(r.body.lessonId, server.lessonId);
    assert.equal(r.body.groupId, null);
    assert.ok(r.body.boardId > 0, 'the student’s own board');
    assert.deepEqual(
      r.body.students.map((s: { id: number }) => s.id),
      [server.users.ana],
    );
    assert.equal(r.body.students[0].joinedAt, null);
    classId = r.body.id;

    await until(() => (lastEvent<{ id: number }>(sa, 'class')?.id ?? null) === classId);
    assert.ok((await access()).includes(server.users.ana));
    const second = await teacher.call('POST', '/api/classes', {
      lessonId: server.lessonId,
      studentId: server.users.ben,
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'class_active');
  });

  it('current class for the teacher and the students', async () => {
    assert.equal((await teacher.call('GET', '/api/classes/current')).body.id, classId);
    const mine = await ana.call('GET', '/api/classes/current');
    assert.equal(mine.body.id, classId);
    assert.ok(!('students' in mine.body));
    const other = await ben.call('GET', '/api/classes/current');
    assert.equal(other.status, 200);
    assert.equal(other.body, null);
  });

  it('presence and position', async () => {
    st = await teacher.connect();
    let list = await emitAck<{ online: boolean; inLesson: boolean }[]>(st, 'presence');
    assert.equal(list.length, 1);
    assert.ok(list[0].online && !list[0].inLesson);

    sa.emit('position', { lessonId: server.lessonId, chapterId: 'ch-definido', itemId: 'ex-el-la' });
    await until(() => lastEvent<{ inLesson: boolean }>(st, 'presence')?.inLesson === true);
    const p = lastEvent<{ studentId: number; chapterId: string; itemId: string; itemIds: string[] }>(st, 'presence')!;
    assert.deepEqual([p.studentId, p.chapterId, p.itemId], [server.users.ana, 'ch-definido', 'ex-el-la']);
    assert.deepEqual(p.itemIds, ['ex-el-la'], 'an older page sends one item');
    sa.emit('position', {
      lessonId: server.lessonId,
      chapterId: 'ch-definido',
      itemId: 'ex-el-la',
      itemIds: ['ex-el-la', 'ex-escucha'],
    });
    await until(() => (lastEvent<{ itemIds: string[] }>(st, 'presence')?.itemIds.length ?? 0) === 2);
    assert.deepEqual(
      lastEvent<{ itemIds: string[] }>(st, 'presence')?.itemIds,
      ['ex-el-la', 'ex-escucha'],
      'the screen holds two',
    );
    assert.match((await teacher.call('GET', '/api/classes/current')).body.students[0].joinedAt, /Z$/);

    sa.emit('position', { lessonId: null });
    await until(() => lastEvent<{ inLesson: boolean }>(st, 'presence')?.inLesson === false);
    list = await emitAck(st, 'presence');
    assert.ok(list[0].online);
  });

  it('navigate and call', async () => {
    assert.equal(
      await emitAck(st, 'navigate', { studentId: server.users.ana, chapterId: 'ch-practica', itemId: 'ex-orden' }),
      true,
    );
    await until(() => !!lastEvent(sa, 'navigate'));
    assert.deepEqual(lastEvent(sa, 'navigate'), { chapterId: 'ch-practica', itemId: 'ex-orden' });
    assert.equal(
      await emitAck(st, 'navigate', { studentId: server.users.ana, chapterId: 'ch-practica', itemId: 'ex-el-la' }),
      false,
      'item of another chapter',
    );
    assert.equal(
      await emitAck(st, 'navigate', { studentId: server.users.ben, chapterId: 'ch-practica' }),
      false,
      'not in the class',
    );

    assert.equal(await emitAck(st, 'call', { studentId: server.users.ana }), true);
    await until(() => !!lastEvent(sa, 'call'));
    assert.deepEqual(lastEvent(sa, 'call'), { lessonId: server.lessonId });
  });

  it('answers are relayed only for students in the class', async () => {
    await ana.call('PUT', `/api/lessons/${server.lessonId}/states/ex-un-una-gaps`, { state: { values: ['un'] } });
    await until(() => lastEvent<{ studentId: number }>(st, 'answer')?.studentId === server.users.ana);
  });

  it('a class of one student takes nobody else', async () => {
    const r = await teacher.call('PUT', `/api/classes/${classId}/students/${server.users.ben}`);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'invalid_input');
    assert.ok(!(await access()).includes(server.users.ben));
    assert.equal(
      (await teacher.call('PUT', `/api/classes/${classId}/students/${server.users.teacher}`)).status,
      404,
      'not a student',
    );
    assert.equal(
      (await teacher.call('PUT', `/api/classes/${classId + 1000}/students/${server.users.ben}`)).status,
      404,
      'other class',
    );
    assert.equal((await ana.call('PUT', `/api/classes/${classId}/students/${server.users.ben}`)).status, 403);
  });

  it('changes the lesson: access for the students, presence reset', async () => {
    const other = (await teacher.call('POST', '/api/lessons', { title: 'Otra lección' })).body;
    sa.emit('position', { lessonId: server.lessonId, chapterId: null, itemId: null });
    await until(() => lastEvent<{ inLesson: boolean }>(st, 'presence')?.inLesson === true);

    const r = await teacher.call('PATCH', `/api/classes/${classId}`, { lessonId: other.id });
    assert.equal(r.body.lessonId, other.id);
    await until(() => lastEvent<{ lessonId: number }>(sa, 'class')?.lessonId === other.id);
    assert.ok((await access(other.id)).includes(server.users.ana));
    await until(() => lastEvent<{ inLesson: boolean }>(st, 'presence')?.inLesson === false);
    assert.equal((await teacher.call('PATCH', `/api/classes/${classId}`, { lessonId: 999999 })).status, 404);
    await teacher.call('PATCH', `/api/classes/${classId}`, { lessonId: server.lessonId });
  });

  it('ends', async () => {
    assert.equal((await ana.call('POST', `/api/classes/${classId}/end`)).status, 403);
    assert.equal((await teacher.call('POST', `/api/classes/${classId}/end`)).status, 204);
    await until(() => lastEvent(sa, 'class') === null);
    assert.equal((await teacher.call('GET', '/api/classes/current')).body, null);
    assert.equal(
      (await teacher.call('PUT', `/api/classes/${classId}/students/${server.users.ben}`)).status,
      404,
      'ended class',
    );
  });

  it('a class of a group: its students, removed and brought back, nobody else', async () => {
    const group = (
      await teacher.call('POST', '/api/groups', { name: 'g1', studentIds: [server.users.ana, server.users.ben] })
    ).body;
    const r = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, groupId: group.id });
    assert.equal(r.status, 201);
    const id = r.body.id as number;
    assert.equal(r.body.groupId, group.id);
    assert.equal(r.body.students.length, 2);
    await until(() => lastEvent<{ id: number }>(sb, 'class')?.id === id);
    assert.ok((await access()).includes(server.users.ben));

    const removed = await teacher.call('DELETE', `/api/classes/${id}/students/${server.users.ben}`);
    assert.equal(removed.body.students.length, 1);
    await until(() => lastEvent(sb, 'class') === null);
    assert.ok((await access()).includes(server.users.ben), 'keeps access');
    const before = st.events.length;
    await ben.call('PUT', `/api/lessons/${server.lessonId}/states/ex-un-una-gaps`, { state: { values: ['x'] } });
    await wait(200);
    assert.ok(!st.events.slice(before).some((e) => e.name === 'answer'), 'removed student’s answers not relayed');

    const back = await teacher.call('PUT', `/api/classes/${id}/students/${server.users.ben}`);
    assert.equal(back.body.students.length, 2);
    await until(() => lastEvent<{ id: number }>(sb, 'class')?.id === id);
    assert.equal(
      (await teacher.call('PUT', `/api/classes/${id}/students/${server.users.eva}`)).status,
      400,
      'not in the group',
    );
    await teacher.call('POST', `/api/classes/${id}/end`);
  });

  it('the group and the student keep where their last class stopped; "continue" starts there', async () => {
    const content = (await teacher.call('GET', `/api/lessons/${server.lessonId}`)).body.content as {
      chapters: { id: string; title: string }[];
    };
    const [first, second] = content.chapters;
    const group = (
      await teacher.call('POST', '/api/groups', { name: 'g2', studentIds: [server.users.ana, server.users.ben] })
    ).body;
    const resume = async (audience: string) => (await teacher.call('GET', `/api/classes/resume?${audience}`)).body;
    assert.equal(await resume(`groupId=${group.id}`), null, 'no class yet');
    assert.equal((await teacher.call('GET', '/api/classes/resume')).status, 400);
    assert.equal((await ana.call('GET', `/api/classes/resume?groupId=${group.id}`)).status, 403);

    // Start in the second chapter; the students are told where, at once.
    const c = await teacher.call('POST', '/api/classes', {
      lessonId: server.lessonId,
      groupId: group.id,
      chapterId: second.id,
    });
    assert.equal(c.body.chapterId, second.id);
    await until(() => lastEvent<{ chapterId: string }>(sb, 'class')?.chapterId === second.id);
    assert.deepEqual(await resume(`groupId=${group.id}`), {
      lessonId: server.lessonId,
      lessonTitle: (await teacher.call('GET', `/api/lessons/${server.lessonId}`)).body.title,
      chapterId: second.id,
      chapterTitle: second.title,
    });

    // The teacher moves on: from the page's `chapter` event.
    const mine = await teacher.connect();
    mine.emit('chapter', { lessonId: server.lessonId, chapterId: first.id });
    for (let i = 0; i < 50 && (await resume(`groupId=${group.id}`)).chapterId !== first.id; i++) await wait(50);
    assert.equal((await resume(`groupId=${group.id}`)).chapterId, first.id);
    mine.emit('chapter', { lessonId: server.lessonId, chapterId: 'nope' });
    mine.emit('chapter', { lessonId: server.lessonId + 1, chapterId: second.id });
    await wait(150);
    assert.equal((await resume(`groupId=${group.id}`)).chapterId, first.id, 'a wrong chapter or lesson is ignored');
    assert.equal((await teacher.call('GET', '/api/classes/current')).body.chapterId, first.id);
    assert.equal((await ben.call('GET', '/api/classes/current')).body.chapterId, first.id);
    mine.close();

    // Another lesson: the pointer follows (no chapter yet); a class ended keeps it.
    const other = (await teacher.call('POST', '/api/lessons', { title: 'Otra' })).body;
    await teacher.call('PATCH', `/api/classes/${c.body.id}`, { lessonId: other.id });
    assert.equal((await resume(`groupId=${group.id}`)).lessonId, other.id);
    await teacher.call('POST', `/api/classes/${c.body.id}/end`);
    assert.equal((await resume(`groupId=${group.id}`)).lessonId, other.id);

    // A deleted lesson: nothing to continue; a chapter that is gone: the lesson from the start.
    await teacher.call('DELETE', `/api/lessons/${other.id}`);
    assert.equal(await resume(`groupId=${group.id}`), null);

    // Solo students have their own pointer; a chapter unknown to the lesson at the start is not kept.
    const solo = await teacher.call('POST', '/api/classes', {
      lessonId: server.lessonId,
      studentId: server.users.ana,
      chapterId: 'nope',
    });
    assert.equal(solo.body.chapterId, null);
    await teacher.call('POST', `/api/classes/${solo.body.id}/end`);
    const soloResume = await resume(`studentId=${server.users.ana}`);
    assert.deepEqual(
      [soloResume.lessonId, soloResume.chapterId, soloResume.chapterTitle],
      [server.lessonId, null, null],
    );
    assert.equal(await resume(`groupId=${group.id}`), null, 'the group is untouched by a solo class');
  });

  it('a class left without its teacher for 30 minutes ends by itself', async () => {
    st.close();
    await wait(100);
    const r = await teacher.call('POST', '/api/classes', { lessonId: server.lessonId, studentId: server.users.ana });
    await until(() => lastEvent<{ id: number }>(sa, 'class')?.id === r.body.id);
    server
      .db()
      .prepare('UPDATE class_sessions SET teacher_seen_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 31 * 60_000).toISOString(), r.body.id);
    await until(() => lastEvent(sa, 'class') === null, 3000);
    assert.equal((await teacher.call('GET', '/api/classes/current')).body, null);
  });
});

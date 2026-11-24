import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

/** API part 3: homework and its statuses. */
describe('homework', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  let hwAna: number;
  let hwBen: number;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
  });
  after(() => server.stop());

  it('validates the assignment', async () => {
    const L = server.lessonId;
    const cases: [unknown, number, string][] = [
      [{ lessonId: L, studentIds: [server.users.ana], exerciseIds: [] }, 400, 'no exercises'],
      [{ lessonId: L, studentIds: [], exerciseIds: ['ex-un-una'] }, 400, 'no students'],
      [
        { lessonId: L, studentIds: [server.users.ana], exerciseIds: ['ex-unknown'] },
        400,
        'not an exercise of the lesson',
      ],
      [{ lessonId: L, studentIds: [server.users.teacher], exerciseIds: ['ex-un-una'] }, 400, 'teacher as student'],
      [{ lessonId: 999999, studentIds: [server.users.ana], exerciseIds: ['ex-un-una'] }, 404, 'unknown lesson'],
    ];
    for (const [body, status, name] of cases)
      assert.equal((await teacher.call('POST', '/api/homework', body)).status, status, name);
    assert.equal((await ana.call('POST', '/api/homework', cases[0][0])).status, 403);
  });

  it('one homework per student, exercises in lesson order, access granted', async () => {
    const r = await teacher.call('POST', '/api/homework', {
      lessonId: server.lessonId,
      studentIds: [server.users.ana, server.users.ben],
      exerciseIds: ['ex-orden', 'ex-un-una'],
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.length, 2);
    const [first] = r.body;
    assert.equal(first.status, 'assigned');
    assert.deepEqual(
      first.exercises.map((e: { number: number; id: string }) => `${e.number}:${e.id}`),
      ['1:ex-un-una', '6:ex-orden'],
    );
    assert.equal(first.lessonTitle, 'Los artículos');
    [hwAna, hwBen] = r.body.map((h: { id: number }) => h.id);
    const access = await teacher.call('GET', `/api/lessons/${server.lessonId}/access`);
    assert.deepEqual([...access.body.studentIds].sort(), [server.users.ana, server.users.ben].sort());
  });

  it('lists newest first, with filters', async () => {
    const newer = await teacher.call('POST', '/api/homework', {
      lessonId: server.lessonId,
      studentIds: [server.users.ana],
      exerciseIds: ['ex-pares'],
    });
    const ids = (await teacher.call('GET', '/api/homework')).body.map((h: { id: number }) => h.id);
    assert.ok(ids.indexOf(newer.body[0].id) < ids.indexOf(hwAna));

    const mine = await teacher.call('GET', `/api/homework?studentId=${server.users.ana}&lessonId=${server.lessonId}`);
    assert.ok(mine.body.every((h: { studentId: number }) => h.studentId === server.users.ana));
    assert.equal((await teacher.call('GET', '/api/homework?status=bogus')).status, 400);
    const assigned = (await teacher.call('GET', '/api/homework?status=assigned')).body as { status: string }[];
    assert.ok(assigned.length > 0 && assigned.every((h) => h.status === 'assigned'), 'status filter');
    assert.deepEqual((await teacher.call('GET', '/api/homework?lessonId=999999')).body, [], 'lesson filter');
    await teacher.call('DELETE', `/api/homework/${newer.body[0].id}`);
  });

  it('a student sees only their own', async () => {
    const r = await ana.call('GET', `/api/homework?studentId=${server.users.ben}`);
    assert.ok(
      r.body.length > 0 && r.body.every((h: { studentId: number }) => h.studentId === server.users.ana),
      'studentId ignored',
    );
    assert.equal((await ana.call('GET', `/api/homework/${hwBen}`)).status, 404);
    assert.equal((await ana.call('GET', `/api/homework/${hwAna}`)).body.id, hwAna);
  });

  it('status flow', async () => {
    const submit = () => ana.call('POST', `/api/homework/${hwAna}/submit`);
    const set = (status: string) => teacher.call('PATCH', `/api/homework/${hwAna}`, { status });

    assert.equal((await teacher.call('POST', `/api/homework/${hwAna}/submit`)).status, 403, 'teacher cannot submit');
    assert.equal((await ben.call('POST', `/api/homework/${hwAna}/submit`)).status, 404, 'another student');
    assert.equal((await submit()).body.status, 'submitted');
    assert.equal((await submit()).body.status, 'submitted', 'again: no change');
    assert.equal((await set('needs_work')).body.status, 'needs_work');
    assert.equal((await submit()).body.status, 'submitted', 'resubmitted after needs_work');
    assert.equal((await set('accepted')).body.status, 'accepted');
    const late = await submit();
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'invalid_status');
    assert.equal((await set('assigned')).body.status, 'assigned', 'the teacher may set any status');
    assert.equal((await set('done')).status, 400);
    assert.equal((await ana.call('PATCH', `/api/homework/${hwAna}`, { status: 'accepted' })).status, 403);
    const filtered = await ana.call('GET', '/api/homework?status=assigned');
    assert.ok(filtered.body.every((h: { status: string }) => h.status === 'assigned'));
  });

  it('the teacher edits the exercises of a given homework', async () => {
    const url = `/api/homework/${hwAna}/exercises`;
    const ids = (r: { body: { exercises: { id: string }[] } }) => r.body.exercises.map((e) => e.id);
    // Validation: teacher only, at least one exercise, only the lesson's.
    assert.equal((await ana.call('PUT', url, { exerciseIds: ['ex-un-una'] })).status, 403);
    assert.equal((await teacher.call('PUT', url, { exerciseIds: [] })).status, 400);
    assert.equal((await teacher.call('PUT', url, { exerciseIds: ['ex-unknown'] })).status, 400);
    assert.equal(
      (await teacher.call('PUT', '/api/homework/999999/exercises', { exerciseIds: ['ex-orden'] })).status,
      404,
    );

    await teacher.call('PATCH', `/api/homework/${hwAna}`, { status: 'accepted' });
    // Removing keeps the status; the answers stay.
    const removed = await teacher.call('PUT', url, { exerciseIds: ['ex-un-una'] });
    assert.equal(removed.status, 200);
    assert.deepEqual(ids(removed), ['ex-un-una']);
    assert.equal(removed.body.status, 'accepted');
    // Adding to an accepted homework sends it back to the student.
    const added = await teacher.call('PUT', url, { exerciseIds: ['ex-orden', 'ex-un-una'] });
    assert.deepEqual(ids(added), ['ex-un-una', 'ex-orden']);
    assert.equal(added.body.status, 'assigned');
    // The other student's homework is untouched.
    assert.deepEqual(ids(await teacher.call('GET', `/api/homework/${hwBen}`)), ['ex-un-una', 'ex-orden']);
  });

  it('hidden from a student without access to the lesson', async () => {
    await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, { studentIds: [server.users.ben] });
    assert.deepEqual((await ana.call('GET', '/api/homework')).body, []);
    assert.equal((await ana.call('GET', `/api/homework/${hwAna}`)).status, 404);
  });

  it('only the teacher deletes; answers stay', async () => {
    await ben.call('PUT', `/api/lessons/${server.lessonId}/states/ex-un-una-gaps`, { state: { values: ['un'] } });
    assert.equal((await ben.call('DELETE', `/api/homework/${hwBen}`)).status, 403);
    assert.equal((await teacher.call('DELETE', `/api/homework/${hwBen}`)).status, 204);
    assert.equal((await teacher.call('GET', `/api/homework/${hwBen}`)).status, 404);
    const states = await ben.call('GET', `/api/lessons/${server.lessonId}/states`);
    assert.ok(states.body['ex-un-una-gaps']);
  });
});

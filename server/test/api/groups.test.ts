import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

interface Group {
  id: number;
  name: string;
  studentIds: number[];
}

/** Student groups: named sets of students, a shortcut for choosing several at once. */
describe('student groups', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  const ids = () => server.users;
  const list = async () => (await teacher.call('GET', '/api/groups')).body as Group[];

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  it('is for the teacher only', async () => {
    assert.equal((await ana.call('GET', '/api/groups')).status, 403);
    assert.equal((await ana.call('POST', '/api/groups', { name: 'x' })).status, 403);
  });

  it('creates a group with students, or an empty one; a student may be in several', async () => {
    assert.deepEqual(await list(), []);
    const duo = await teacher.call('POST', '/api/groups', { name: 'Pareja', studentIds: [ids().ana, ids().ben] });
    assert.equal(duo.status, 201);
    assert.deepEqual((duo.body as Group).studentIds.sort(), [ids().ana, ids().ben].sort());
    const empty = await teacher.call('POST', '/api/groups', { name: '  Vacío ' });
    assert.equal(empty.status, 201);
    assert.deepEqual(empty.body, { ...(empty.body as object), name: 'Vacío', studentIds: [] });
    const club = await teacher.call('POST', '/api/groups', { name: 'Club', studentIds: [ids().ana, ids().ana] });
    assert.deepEqual((club.body as Group).studentIds, [ids().ana], 'a repeated id counts once');
    assert.deepEqual(
      (await list()).map((g) => g.name),
      ['Club', 'Pareja', 'Vacío'],
      'by name',
    );
  });

  it('validates the input', async () => {
    const cases: [unknown, number, string][] = [
      [{ name: '' }, 400, 'no name'],
      [{ name: '   ' }, 400, 'only spaces'],
      [{ name: 'a'.repeat(61) }, 400, 'too long'],
      [{ name: 'Nuevo', studentIds: [ids().teacher] }, 400, 'a teacher is not a student'],
      [{ name: 'Nuevo', studentIds: [999_999] }, 400, 'unknown id'],
      [{ name: 'pareja' }, 409, 'name taken, case aside'],
    ];
    for (const [body, status, why] of cases) {
      const r = await teacher.call('POST', '/api/groups', body);
      assert.equal(r.status, status, why);
    }
    assert.equal((await teacher.call('POST', '/api/groups', { name: 'pareja' })).body.code, 'name_taken');
    assert.equal((await list()).length, 3, 'nothing was added');
  });

  it('renames and replaces the members', async () => {
    const [club] = await list();
    const renamed = await teacher.call('PATCH', `/api/groups/${club.id}`, { name: 'Club de conversación' });
    assert.equal(renamed.status, 200);
    assert.deepEqual((renamed.body as Group).studentIds, club.studentIds, 'members kept when not given');
    const members = await teacher.call('PATCH', `/api/groups/${club.id}`, { studentIds: [ids().ben, ids().eva] });
    assert.deepEqual((members.body as Group).studentIds.sort(), [ids().ben, ids().eva].sort());
    assert.equal((members.body as Group).name, 'Club de conversación', 'name kept when not given');
    const same = await teacher.call('PATCH', `/api/groups/${club.id}`, { name: 'CLUB DE CONVERSACIÓN' });
    assert.equal(same.status, 200, 'a group may change the case of its own name');
    const taken = await teacher.call('PATCH', `/api/groups/${club.id}`, { name: 'Pareja' });
    assert.equal(taken.status, 409);
    assert.equal((await teacher.call('PATCH', `/api/groups/${club.id}`, { studentIds: [ids().teacher] })).status, 400);
    assert.equal((await teacher.call('PATCH', '/api/groups/999999', { name: 'x' })).status, 404);
  });

  it('a deleted student leaves the groups; a deleted group leaves the students', async () => {
    const created = await teacher.call('POST', '/api/students', { login: 'temporal', password: 'password-123' });
    const temporal = (created.body as { id: number }).id;
    const group = await teacher.call('POST', '/api/groups', {
      name: 'Con temporal',
      studentIds: [temporal, ids().ana],
    });
    assert.equal((group.body as Group).studentIds.length, 2);
    assert.equal((await teacher.call('DELETE', `/api/students/${temporal}`)).status, 204);
    const after = (await list()).find((g) => g.name === 'Con temporal');
    assert.deepEqual(after?.studentIds, [ids().ana]);
    assert.equal((await teacher.call('DELETE', `/api/groups/${after?.id}`)).status, 204);
    assert.equal((await teacher.call('DELETE', `/api/groups/${after?.id}`)).status, 404);
    const students = (await teacher.call('GET', '/api/students')).body as { id: number }[];
    assert.ok(
      students.some((s) => s.id === ids().ana),
      'the student is still there',
    );
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

interface Summary {
  id: number;
  title: string;
}

/** The teacher's drag and drop: the order of the lesson lists. */
describe('lesson order', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  const titles = async (who: Client) => ((await who.call('GET', '/api/lessons')).body as Summary[]).map((l) => l.title);

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  it('new lessons go last; renaming does not move a lesson', async () => {
    const ids: number[] = [];
    for (const title of ['Uno', 'Dos', 'Tres']) {
      ids.push(((await teacher.call('POST', '/api/lessons', { title })).body as Summary).id);
    }
    const all = (await teacher.call('GET', '/api/lessons')).body as Summary[];
    const mine = all.filter((l) => ids.includes(l.id)).map((l) => l.title);
    assert.deepEqual(mine, ['Uno', 'Dos', 'Tres']);
    assert.equal(all.at(-1)?.title, 'Tres');
    await teacher.call('PATCH', `/api/lessons/${ids[0]}`, { title: 'Uno bis' });
    assert.equal((await titles(teacher)).at(-3), 'Uno bis');
  });

  it('is saved, for the teacher and the students; unlisted lessons stay after the listed ones', async () => {
    const all = (await teacher.call('GET', '/api/lessons')).body as Summary[];
    const [first, second, ...rest] = all.map((l) => l.id);
    for (const id of all.slice(-3).map((l) => l.id)) {
      await teacher.call('PUT', `/api/lessons/${id}/access`, { studentIds: [server.users.ana] });
    }
    // The last lesson goes to the top; an unknown id and a repeat change nothing.
    const last = rest.at(-1) as number;
    const r = await teacher.call('PUT', '/api/lessons/order', { ids: [last, 999_999, last, first] });
    assert.equal(r.status, 204);
    const now = ((await teacher.call('GET', '/api/lessons')).body as Summary[]).map((l) => l.id);
    assert.deepEqual(now, [last, first, second, ...rest.slice(0, -1)]);
    const seen = ((await ana.call('GET', '/api/lessons')).body as Summary[]).map((l) => l.id);
    assert.deepEqual(
      seen,
      now.filter((id) => seen.includes(id)),
      'a student sees the teacher’s order',
    );
  });

  it('is for the teacher only and needs a list of ids', async () => {
    assert.equal((await ana.call('PUT', '/api/lessons/order', { ids: [] })).status, 403);
    assert.equal((await teacher.call('PUT', '/api/lessons/order', { ids: ['x'] })).status, 400);
    assert.equal((await teacher.call('PUT', '/api/lessons/order', {})).status, 400);
  });
});

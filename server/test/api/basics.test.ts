import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { anonymous, type Client, signIn, startServer, type TestServer } from '../helpers';

/** API parts 0–1: conventions, sign-in, students, lessons and access. */
describe('conventions, students, lessons', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  describe('errors and security', () => {
    it('401 without a session', async () => {
      const r = await anonymous(server, 'GET', '/api/lessons');
      assert.equal(r.status, 401);
      assert.equal(r.body.code, 'unauthorized');
    });

    it('API answers are not cached by browsers', async () => {
      for (const url of ['/api/config', '/api/lessons']) {
        const r = await fetch(server.base + url);
        assert.equal(r.headers.get('cache-control'), 'no-store', url);
      }
    });

    it('wrong password → 401', async () => {
      const r = await anonymous(
        server,
        'POST',
        '/api/auth/login',
        JSON.stringify({ login: 'teacher', password: 'wrong-password' }),
      );
      assert.equal(r.status, 401);
      assert.equal(r.body.code, 'unauthorized');
    });

    it('cross-site request → 403', async () => {
      const r = await anonymous(server, 'POST', '/api/auth/login', '{}', 'https://evil.example');
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'forbidden');
    });

    it('signed in, but the request comes from another site → 403', async () => {
      const r = await teacher.call('POST', '/api/lessons', { title: 'x' }, { 'Sec-Fetch-Site': 'same-site' });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'forbidden');
    });

    it('broken JSON → 400', async () => {
      const r = await teacher.raw('POST', '/api/lessons', '{not json');
      assert.equal(r.status, 400);
      assert.equal(r.body.code, 'invalid_input');
    });

    it('body over 2 MB → 413', async () => {
      const r = await teacher.raw(
        'PUT',
        `/api/lessons/${server.lessonId}/content`,
        JSON.stringify({ big: 'a'.repeat(3_000_000) }),
      );
      assert.equal(r.status, 413);
      assert.equal(r.body.code, 'too_large');
    });

    it('unknown route → 404', async () => {
      const r = await teacher.call('GET', '/api/nothing-here');
      assert.equal(r.status, 404);
      assert.equal(r.body.code, 'not_found');
    });

    it('me', async () => {
      const r = await teacher.call('GET', '/api/auth/me');
      assert.equal(r.body.role, 'teacher');
    });
  });

  describe('students', () => {
    it('only for the teacher', async () => {
      assert.equal((await ana.call('GET', '/api/students')).status, 403);
    });

    it('list in camelCase, no internal fields', async () => {
      const r = await teacher.call('GET', '/api/students');
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 3);
      for (const s of r.body) {
        assert.match(s.createdAt, /Z$/);
        assert.ok(!('created_at' in s) && !('role' in s) && !('password_hash' in s));
      }
    });

    it('validation: every issue reported', async () => {
      const r = await teacher.call('POST', '/api/students', { login: 'a', password: 'short' });
      assert.equal(r.status, 400);
      assert.equal(r.body.issues.length, 2);
    });

    it('taken login → 409', async () => {
      const r = await teacher.call('POST', '/api/students', { login: 'ana', password: 'longenough1' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'login_taken');
    });

    it('create, rename, delete', async () => {
      let r = await teacher.call('POST', '/api/students', { login: 'new-student', password: 'longenough1' });
      assert.equal(r.status, 201);
      const id = r.body.id;
      r = await teacher.call('PATCH', `/api/students/${id}`, { login: 'new-student-2' });
      assert.equal(r.body.login, 'new-student-2');
      assert.equal((await teacher.call('DELETE', `/api/students/${id}`)).status, 204);
      assert.equal((await teacher.call('PATCH', `/api/students/${id}`, { login: 'x-y-z' })).status, 404);
    });

    it("export: all the student's data as a file, for the teacher only", async () => {
      const { ana: anaId, ben } = server.users;
      const db = server.db();
      db.prepare(`INSERT INTO block_states (lesson_id, user_id, block_id, state) VALUES (?, ?, 'b-export', ?)`).run(
        server.lessonId,
        anaId,
        '{"text":"mi ensayo"}',
      );
      db.prepare(
        `INSERT INTO answer_comments (lesson_id, student_id, block_id, text) VALUES (?, ?, 'b-export', 'bien')`,
      ).run(server.lessonId, anaId);
      assert.equal((await ana.call('GET', `/api/students/${anaId}/export`)).status, 403);
      assert.equal((await teacher.call('GET', `/api/students/${server.users.teacher}/export`)).status, 404);
      const r = await teacher.call('GET', `/api/students/${anaId}/export`);
      assert.equal(r.status, 200);
      const file = await teacher.fetch(`/api/students/${anaId}/export`);
      assert.match(file.headers.get('content-disposition') ?? '', /attachment; filename="ana-data\.json"/);
      assert.equal(r.body.account.login, 'ana');
      assert.deepEqual(r.body.answers.find((a: { blockId: string }) => a.blockId === 'b-export')?.state, {
        text: 'mi ensayo',
      });
      assert.equal(r.body.teacherComments[0].text, 'bien');
      const text = JSON.stringify(r.body);
      assert.ok(!text.includes('password') && !text.includes('token'), 'no secrets');
      const other = await teacher.call('GET', `/api/students/${ben}/export`);
      assert.ok(!JSON.stringify(other.body).includes('mi ensayo'), "only that student's data");
    });

    it('bad id → 400', async () => {
      assert.equal((await teacher.call('PATCH', '/api/students/abc', { login: 'zzz' })).status, 400);
    });
  });

  describe('lessons and access', () => {
    it('empty title → 400 with a message for the user', async () => {
      const r = await teacher.call('POST', '/api/lessons', { title: '   ' });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'Escribe un título');
    });

    it('create, rename, save content, delete', async () => {
      let r = await teacher.call('POST', '/api/lessons', { title: '  API test  ' });
      assert.equal(r.status, 201);
      assert.equal(r.body.title, 'API test');
      assert.equal(r.body.content.chapters.length, 1);
      const id = r.body.id;
      assert.equal(r.body.rev, 0, 'a new lesson: revision 0');

      r = await teacher.call('PATCH', `/api/lessons/${id}`, { title: 'API test 2' });
      assert.equal(r.body.title, 'API test 2');
      assert.ok(!('content' in r.body));

      const content = {
        version: 2,
        chapters: [
          {
            id: 'c1',
            title: 'Uno',
            exercises: [{ id: 'i1', title: 'Lee.', blocks: [{ id: 'b1', type: 'text', markdown: 'hola' }] }],
          },
        ],
      };
      r = await teacher.call('PUT', `/api/lessons/${id}/content`, { content, rev: 0 });
      assert.match(r.body.updatedAt, /Z$/);
      assert.equal(r.body.rev, 1);

      // Half filled in: the editor saves every change.
      const draft = {
        version: 2,
        chapters: [
          { id: 'c1', exercises: [{ id: 'i1', title: '', blocks: [{ id: 'b1', type: 'image', src: '', alt: '' }] }] },
          { id: 'c2', exercises: [{ id: 'i2', title: '', blocks: [{ id: 'b2', type: 'match', pairs: [] }] }] },
        ],
      };
      assert.equal((await teacher.call('PUT', `/api/lessons/${id}/content`, { content: draft, rev: 1 })).status, 200);
      const saved = (await teacher.call('GET', `/api/lessons/${id}`)).body;
      assert.deepEqual([saved.content, saved.rev], [draft, 2]);
      r = await teacher.call('PUT', `/api/lessons/${id}/content`, {
        content: { ...content, chapters: [{ ...content.chapters[0], id: 'b1' }] },
        rev: 2,
      });
      assert.equal(r.status, 400, 'duplicate ids');

      assert.equal((await teacher.call('DELETE', `/api/lessons/${id}`)).status, 204);
      assert.equal((await teacher.call('GET', `/api/lessons/${id}`)).status, 404);
    });

    it('a save made on an older revision is refused', async () => {
      const { id } = (await teacher.call('POST', '/api/lessons', { title: 'Revisions' })).body;
      const content = { version: 2, chapters: [{ id: 'c', exercises: [] }] };
      const first = await teacher.call('PUT', `/api/lessons/${id}/content`, { content, rev: 0 });
      assert.equal(first.body.rev, 1);

      // Another window still on revision 0.
      const stale = await teacher.call('PUT', `/api/lessons/${id}/content`, { content, rev: 0 });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, 'lesson_changed');
      assert.equal((await teacher.call('GET', `/api/lessons/${id}`)).body.rev, 1, 'nothing saved');
      await teacher.call('DELETE', `/api/lessons/${id}`);
    });

    it('students cannot change lessons', async () => {
      assert.equal((await ana.call('POST', '/api/lessons', { title: 'nope' })).status, 403);
      assert.equal(
        (
          await ana.call('PUT', `/api/lessons/${server.lessonId}/content`, {
            content: { version: 2, chapters: [{ id: 'c', exercises: [] }] },
            rev: 0,
          })
        ).status,
        403,
      );
    });

    it('a student sees a lesson only with access (404 otherwise)', async () => {
      const url = `/api/lessons/${server.lessonId}`;
      const r = await ana.call('GET', url);
      assert.equal(r.status, 404);
      assert.equal(r.body.code, 'not_found');
      assert.deepEqual((await ana.call('GET', '/api/lessons')).body, []);

      assert.equal((await teacher.call('PUT', `${url}/access`, { studentIds: [999999] })).status, 400);
      const set = await teacher.call('PUT', `${url}/access`, { studentIds: [server.users.ana] });
      assert.deepEqual(set.body.studentIds, [server.users.ana]);

      const list = await ana.call('GET', '/api/lessons');
      assert.equal(list.body.length, 1);
      assert.ok(!('content' in list.body[0]));
      assert.equal((await ana.call('GET', url)).body.content.version, 2);

      await teacher.call('PUT', `${url}/access`, { studentIds: [] });
    });

    it('the H5P outline is gone', async () => {
      assert.equal((await teacher.call('GET', `/api/lessons/${server.lessonId}/outline`)).status, 404);
    });
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { anonymous, type Client, signIn, startServer, type TestServer } from '../helpers';

/** The installation's language (APP_LANG): messages of the API; error codes stay English. */
for (const lang of ['es', 'en'] as const) {
  describe(`messages in ${lang}`, () => {
    let server: TestServer;
    let teacher: Client;
    const expected = {
      es: {
        wrong: 'Usuario o contraseña incorrectos',
        short: 'Contraseña: al menos 8 caracteres',
        title: 'Título: como máximo 200 caracteres',
      },
      en: {
        wrong: 'Wrong username or password',
        short: 'Password: at least 8 characters',
        title: 'Title: at most 200 characters',
      },
    }[lang];

    before(async () => {
      server = await startServer({ lang });
      teacher = await signIn(server, 'teacher');
    });
    after(() => server.stop());

    it('GET /api/config tells the language, without signing in', async () => {
      assert.deepEqual((await anonymous(server, 'GET', '/api/config')).body, {
        lang,
        dictionary: false,
        theme: 'classic',
      });
    });

    it('messages in the language, codes in English', async () => {
      const r = await anonymous(
        server,
        'POST',
        '/api/auth/login',
        JSON.stringify({ login: 'teacher', password: 'wrong-password' }),
      );
      assert.equal(r.body.code, 'unauthorized');
      assert.equal(r.body.error, expected.wrong);
    });

    it('validation messages with their limits', async () => {
      let r = await teacher.call('POST', '/api/students', { login: 'new-one', password: 'short' });
      assert.equal(r.body.code, 'invalid_input');
      assert.equal(r.body.error, expected.short);
      r = await teacher.call('POST', '/api/lessons', { title: 'a'.repeat(201) });
      assert.equal(r.body.error, expected.title);
    });
  });
}

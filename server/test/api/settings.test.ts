import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

/** The platform's settings (the theme): chosen by any teacher, the same for everyone. */
describe('settings', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  const publicTheme = async () =>
    ((await (await fetch(`${server.base}/api/config`)).json()) as { theme: string }).theme;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  it('starts with the default theme, public through /api/config', async () => {
    assert.deepEqual((await teacher.call('GET', '/api/settings')).body, { theme: 'classic' });
    assert.equal(await publicTheme(), 'classic');
  });

  it('is for teachers only', async () => {
    assert.equal((await ana.call('GET', '/api/settings')).status, 403);
    assert.equal((await ana.call('PATCH', '/api/settings', { theme: 'blush' })).status, 403);
    assert.equal(await publicTheme(), 'classic');
  });

  it('a teacher changes the theme for everyone; an empty change keeps it', async () => {
    const changed = await teacher.call('PATCH', '/api/settings', { theme: 'blush' });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body, { theme: 'blush' });
    assert.equal(await publicTheme(), 'blush', 'seen without signing in');
    assert.deepEqual((await teacher.call('PATCH', '/api/settings', {})).body, { theme: 'blush' });
  });

  it('rejects a theme that does not exist', async () => {
    for (const theme of ['neon', '', 7, null]) {
      assert.equal((await teacher.call('PATCH', '/api/settings', { theme })).status, 400, String(theme));
    }
    assert.equal(await publicTheme(), 'blush');
  });

  it('a stored theme that is no longer known reads as the default', async () => {
    server.db().prepare("UPDATE app_settings SET value = 'gone' WHERE key = 'theme'").run();
    assert.equal(await publicTheme(), 'classic');
  });
});

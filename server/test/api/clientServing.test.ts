import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { startServer, type TestServer } from '../helpers';

/**
 * The desktop app: the server also serves the built client (CLIENT_DIR) and listens on HOST only. Without
 * CLIENT_DIR (a server behind Caddy, development) it answers the API only.
 */
describe('serving the client (CLIENT_DIR)', () => {
  let server: TestServer;
  let clientDir: string;

  before(async () => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-'));
    fs.mkdirSync(path.join(clientDir, 'assets'));
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>app</title>');
    fs.writeFileSync(path.join(clientDir, 'assets', 'main-abc123.js'), 'console.log(1)');
    fs.writeFileSync(path.join(clientDir, 'favicon.svg'), '<svg/>');
    server = await startServer({ serverEnv: { CLIENT_DIR: clientDir, HOST: '127.0.0.1' } });
  });
  after(async () => {
    await server.stop();
    fs.rmSync(clientDir, { recursive: true, force: true });
  });

  it('index.html for the app and for its routes, never cached', async () => {
    for (const route of ['/', '/lessons/1', '/class']) {
      const r = await fetch(server.base + route);
      assert.equal(r.status, 200, route);
      assert.match(await r.text(), /<title>app<\/title>/);
      assert.equal(r.headers.get('cache-control'), 'no-cache');
    }
  });

  it('the build files, the hashed ones cached for good', async () => {
    const asset = await fetch(`${server.base}/assets/main-abc123.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
    const icon = await fetch(`${server.base}/favicon.svg`);
    assert.equal(await icon.text(), '<svg/>');
  });

  it('the API stays the API', async () => {
    // Signed out: 401 from the API, not the app's page.
    const r = await fetch(`${server.base}/api/no-such-thing`);
    assert.equal(r.status, 401);
    assert.match(r.headers.get('content-type') ?? '', /json/);
    assert.equal((await fetch(`${server.base}/api/config`)).status, 200);
  });
});

describe('without CLIENT_DIR', () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('the API only', async () => {
    assert.equal((await fetch(`${server.base}/`)).status, 404);
  });
});

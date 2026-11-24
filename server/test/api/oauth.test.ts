import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

/**
 * OAuth for the MCP server (server/src/oauth), the way ChatGPT and Claude go
 * through it: discovery, client registration (DCR) or a client metadata
 * document (CIMD), authorization with PKCE and the teacher's consent, tokens,
 * refresh, revocation.
 */
describe('assistants: OAuth', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  const REDIRECT = 'http://127.0.0.1:9/callback';

  /** A CIMD client: its metadata document, served at a local URL. */
  let documents: http.Server;
  let documentUrl: string;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    documents = http.createServer((req, res) => {
      const url = `http://127.0.0.1:${(documents.address() as AddressInfo).port}${req.url}`;
      const clientId = req.url === '/wrong-id.json' ? 'https://elsewhere.example/client.json' : url;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ client_id: clientId, client_name: 'CIMD assistant', redirect_uris: [REDIRECT] }));
    });
    await new Promise<void>((resolve) => documents.listen(0, '127.0.0.1', resolve));
    documentUrl = `http://127.0.0.1:${(documents.address() as AddressInfo).port}/client.json`;
  });
  after(async () => {
    documents.close();
    await server.stop();
  });

  const resource = () => `${server.base}/mcp`;
  const pkce = () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
  };
  const form = (url: string, fields: Record<string, string>) =>
    fetch(server.base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  /** /oauth/authorize → the consent page's request id. */
  async function startAuthorization(clientId: string, challenge: string, extra: Record<string, string> = {}) {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'lessons',
      resource: resource(),
      ...extra,
    });
    const r = await fetch(`${server.base}/oauth/authorize?${query}`, { redirect: 'manual' });
    return { status: r.status, location: r.headers.get('location') ?? '' };
  }
  const requestIdOf = (location: string) => new URL(location, server.base).searchParams.get('request') ?? '';

  async function registerClient() {
    const r = await fetch(`${server.base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test assistant',
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    assert.equal(r.status, 201);
    return ((await r.json()) as { client_id: string }).client_id;
  }

  /** The whole way to tokens for a client. */
  async function connect(clientId: string) {
    const { verifier, challenge } = pkce();
    const { location } = await startAuthorization(clientId, challenge);
    const decision = await teacher.call('POST', `/api/oauth/requests/${requestIdOf(location)}/approve`);
    const code = new URL(decision.body.redirectTo).searchParams.get('code') ?? '';
    const tokens = await form('/oauth/token', {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
      resource: resource(),
    });
    assert.equal(tokens.status, 200);
    return tokens.body as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  }
  const callMcp = (token?: string) =>
    fetch(`${server.base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: '{}',
    });

  it('discovery: the MCP resource and its authorization server', async () => {
    const prm = await fetch(`${server.base}/.well-known/oauth-protected-resource/mcp`).then((r) => r.json());
    assert.deepEqual(
      [prm.resource, prm.authorization_servers, prm.scopes_supported],
      [resource(), [server.base], ['lessons']],
    );
    const as = await fetch(`${server.base}/.well-known/oauth-authorization-server`).then((r) => r.json());
    assert.equal(as.issuer, server.base);
    assert.equal(as.authorization_endpoint, `${server.base}/oauth/authorize`);
    assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
    assert.equal(as.client_id_metadata_document_supported, true);
    assert.equal(as.authorization_response_iss_parameter_supported, true);

    const unauthorized = await callMcp();
    assert.equal(unauthorized.status, 401);
    assert.match(
      unauthorized.headers.get('www-authenticate') ?? '',
      /resource_metadata=".*\/\.well-known\/oauth-protected-resource\/mcp"/,
    );
  });

  it('DCR → consent → code (PKCE, once) → tokens for /mcp', async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const { status, location } = await startAuthorization(clientId, challenge);
    assert.equal(status, 302);
    assert.match(location, /^\/oauth\/consent\?request=/);
    const requestId = requestIdOf(location);

    const asked = await teacher.call('GET', `/api/oauth/requests/${requestId}`);
    assert.deepEqual(asked.body, { clientName: 'Test assistant', redirectHost: '127.0.0.1:9', scopes: ['lessons'] });
    assert.equal(
      (await ana.call('POST', `/api/oauth/requests/${requestId}/approve`)).status,
      403,
      'a student cannot allow',
    );

    const decision = await teacher.call('POST', `/api/oauth/requests/${requestId}/approve`);
    const back = new URL(decision.body.redirectTo);
    assert.equal(back.origin + back.pathname, REDIRECT);
    assert.deepEqual([back.searchParams.get('state'), back.searchParams.get('iss')], ['xyz', server.base]);
    const code = back.searchParams.get('code') ?? '';
    assert.equal((await teacher.call('GET', `/api/oauth/requests/${requestId}`)).status, 404, 'a request is used once');

    const exchange = (codeVerifier: string) =>
      form('/oauth/token', {
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: clientId,
        redirect_uri: REDIRECT,
        resource: resource(),
      });
    assert.equal((await exchange(pkce().verifier)).body.error, 'invalid_grant', 'a wrong code_verifier');
    const tokens = await exchange(verifier);
    assert.equal(tokens.status, 200);
    assert.deepEqual([tokens.body.token_type, tokens.body.expires_in, tokens.body.scope], ['Bearer', 3600, 'lessons']);
    assert.equal((await exchange(verifier)).body.error, 'invalid_grant', 'a code is used once');

    assert.notEqual((await callMcp(tokens.body.access_token)).status, 401, 'the token opens /mcp');
    assert.equal((await callMcp('not-a-token')).status, 401);
  });

  it('refresh replaces both tokens; the old ones stop working', async () => {
    const clientId = await registerClient();
    const first = await connect(clientId);
    const refreshed = await form('/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
      client_id: clientId,
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.access_token, first.access_token);
    assert.notEqual((await callMcp(refreshed.body.access_token)).status, 401);
    assert.equal((await callMcp(first.access_token)).status, 401, 'the old access token');
    const again = await form('/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
      client_id: clientId,
    });
    assert.equal(again.body.error, 'invalid_grant', 'the old refresh token');
  });

  it('the teacher sees and ends connections; a client can revoke its token', async () => {
    const clientId = await registerClient();
    const tokens = await connect(clientId);
    const list = (await teacher.call('GET', '/api/oauth/connections')).body as { id: number; clientName: string }[];
    assert.ok(list.length >= 1);
    assert.equal(list[0].clientName, 'Test assistant');
    assert.equal((await ana.call('GET', '/api/oauth/connections')).status, 403);

    assert.equal((await teacher.call('DELETE', `/api/oauth/connections/${list[0].id}`)).status, 204);
    assert.equal((await callMcp(tokens.access_token)).status, 401, 'disconnected');

    const other = await connect(clientId);
    const revoked = await form('/oauth/revoke', { token: other.access_token, client_id: clientId });
    assert.equal(revoked.status, 200);
    assert.equal((await callMcp(other.access_token)).status, 401, 'revoked by the client');
  });

  it('a refusal goes back with access_denied', async () => {
    const clientId = await registerClient();
    const { location } = await startAuthorization(clientId, pkce().challenge);
    const decision = await ana.call('POST', `/api/oauth/requests/${requestIdOf(location)}/deny`);
    const back = new URL(decision.body.redirectTo);
    assert.deepEqual(
      [back.searchParams.get('error'), back.searchParams.get('state'), back.searchParams.has('code')],
      ['access_denied', 'xyz', false],
    );
  });

  it('only the lessons scope, for this MCP server only', async () => {
    const clientId = await registerClient();
    const otherScope = await startAuthorization(clientId, pkce().challenge, { scope: 'students' });
    assert.match(otherScope.location, /error=invalid_scope/);
    const otherResource = await startAuthorization(clientId, pkce().challenge, {
      resource: 'https://elsewhere.example/mcp',
    });
    assert.match(otherResource.location, /error=invalid_target/);
    const unknownRedirect = await startAuthorization(clientId, pkce().challenge, {
      redirect_uri: 'https://evil.example/cb',
    });
    assert.equal(unknownRedirect.status, 400, 'an unregistered redirect_uri is not followed');
  });

  it('CIMD: the client id is the URL of its metadata document', async () => {
    const tokens = await connect(documentUrl);
    assert.notEqual((await callMcp(tokens.access_token)).status, 401);
    const list = (await teacher.call('GET', '/api/oauth/connections')).body as { clientName: string }[];
    assert.ok(list.some((connection) => connection.clientName === 'CIMD assistant'));

    const wrongId = documentUrl.replace('client.json', 'wrong-id.json');
    assert.equal(
      (await startAuthorization(wrongId, pkce().challenge)).status,
      400,
      'the document names another client_id',
    );
  });
});

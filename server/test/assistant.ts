import crypto from 'node:crypto';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { Client, TestServer } from './helpers';

const REDIRECT = 'http://127.0.0.1:9/callback';

/**
 * Connects a test assistant the way ChatGPT and Claude do (registration, the
 * teacher's consent, PKCE, code → tokens) → its access token for /mcp.
 */
export async function connectAssistant(server: TestServer, teacher: Client): Promise<string> {
  const registered = await fetch(`${server.base}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test assistant',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  }).then((r) => r.json() as Promise<{ client_id: string }>);
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const authorize = await fetch(
    `${server.base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: registered.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'lessons',
      resource: `${server.base}/mcp`,
    })}`,
    { redirect: 'manual' },
  );
  const requestId = new URL(authorize.headers.get('location') ?? '', server.base).searchParams.get('request');
  const decision = await teacher.call('POST', `/api/oauth/requests/${requestId}/approve`);
  const code = new URL(decision.body.redirectTo).searchParams.get('code') ?? '';
  const tokens = await fetch(`${server.base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: registered.client_id,
      redirect_uri: REDIRECT,
      resource: `${server.base}/mcp`,
    }),
  }).then((r) => r.json() as Promise<{ access_token: string }>);
  return tokens.access_token;
}

/** An MCP client (the SDK's) on /mcp with the token. */
export async function mcpClient(server: TestServer, token: string): Promise<McpClient> {
  const client = new McpClient({ name: 'tests', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

import crypto from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  AccessDeniedError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';

import * as db from '../db';
import { fetchClientMetadataDocument, isClientMetadataDocumentUrl } from './clientMetadataDocument';
import { ISSUER_URL, LESSONS_SCOPE, MCP_RESOURCE_URL } from './config';

/**
 * OAuth 2.1 for the MCP server, on SQLite: a teacher connects an AI assistant
 * to their lessons. The SDK's router (router.ts) handles the protocol (request
 * checks, PKCE verification, rate limits); this file decides and stores.
 *
 *   /oauth/authorize → a waiting request → the consent page (the teacher signs
 *   in and allows) → a one-time code → /oauth/token: a connection with an
 *   access token (1 hour) and a refresh token (30 days, replaced on use).
 */

const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A self-registered client nobody connected within a day is forgotten. */
const UNUSED_CLIENT_MS = 24 * 60 * 60 * 1000;
/** last_used_at is written at most this often (every MCP request checks the token). */
const TOUCH_EVERY_MS = 60 * 1000;

const randomSecret = () => crypto.randomBytes(32).toString('base64url');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** The resource tokens are for: the MCP server (a client may name it with or without a trailing slash). */
function checkResource(resource: URL | undefined): string {
  const requested = resource?.href.replace(/\/$/, '') ?? MCP_RESOURCE_URL.href;
  if (requested !== MCP_RESOURCE_URL.href)
    throw new InvalidTargetError(`Tokens are issued for ${MCP_RESOURCE_URL.href} only`);
  return requested;
}

function checkScopes(scopes: string[] | undefined): string {
  const requested = scopes?.length ? scopes : [LESSONS_SCOPE];
  if (requested.some((scope) => scope !== LESSONS_SCOPE))
    throw new InvalidScopeError(`Supported scope: ${LESSONS_SCOPE}`);
  return LESSONS_SCOPE;
}

const clientName = (client: OAuthClientInformationFull) =>
  client.client_name?.trim() || new URL(client.redirect_uris[0]).host;

/** Registered clients: CIMD (fetched by their URL id) or self-registered (DCR, stored). */
const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    if (isClientMetadataDocumentUrl(clientId)) return fetchClientMetadataDocument(clientId);
    const stored = db.getOAuthClient(clientId);
    return stored ? (JSON.parse(stored) as OAuthClientInformationFull) : undefined;
  },
  registerClient(client) {
    // Typed without client_id, but the SDK's register handler has already set it (a random UUID).
    const registered = client as OAuthClientInformationFull;
    db.insertOAuthClient(registered.client_id, JSON.stringify(registered), Date.now());
    return registered;
  },
};

/** New tokens: the secrets for the client and their hashes and expiry for the database. */
function newTokens(now: number) {
  const access = randomSecret();
  const refresh = randomSecret();
  return {
    secrets: { access, refresh },
    stored: {
      access_hash: sha256(access),
      access_expires_at: now + ACCESS_TTL_MS,
      refresh_hash: sha256(refresh),
      refresh_expires_at: now + REFRESH_TTL_MS,
    },
  };
}

const tokenResponse = (secrets: { access: string; refresh: string }, scopes: string): OAuthTokens => ({
  access_token: secrets.access,
  token_type: 'Bearer',
  expires_in: ACCESS_TTL_MS / 1000,
  refresh_token: secrets.refresh,
  scope: scopes,
});

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  /** Keeps the request and sends the browser to the consent page (signing in first if needed). */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    const now = Date.now();
    db.deleteExpiredOAuthData(now, now - UNUSED_CLIENT_MS);
    const id = randomSecret();
    db.insertOAuthRequest({
      id,
      client_id: client.client_id,
      client_name: clientName(client),
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      state: params.state ?? null,
      scopes: checkScopes(params.scopes),
      resource: checkResource(params.resource),
      expires_at: now + REQUEST_TTL_MS,
    });
    res.redirect(302, `/oauth/consent?request=${encodeURIComponent(id)}`);
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    const code = db.getOAuthCode(sha256(authorizationCode));
    if (!code || code.client_id !== client.client_id || code.expires_at <= Date.now()) {
      throw new InvalidGrantError('Invalid or expired authorization code');
    }
    return code.code_challenge;
  },

  /** The code (once, PKCE already checked by the SDK) → a new connection with its tokens. */
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    const now = Date.now();
    const codeHash = sha256(authorizationCode);
    const code = db.getOAuthCode(codeHash);
    if (!code || !db.deleteOAuthCode(codeHash)) throw new InvalidGrantError('Invalid authorization code');
    const valid =
      code.client_id === client.client_id &&
      code.expires_at > now &&
      (redirectUri === undefined || redirectUri === code.redirect_uri) &&
      (resource === undefined || checkResource(resource) === code.resource);
    if (!valid) throw new InvalidGrantError('Invalid authorization code');
    const { secrets, stored } = newTokens(now);
    db.insertOAuthGrant({
      user_id: code.user_id,
      client_id: client.client_id,
      client_name: code.client_name,
      scopes: code.scopes,
      resource: code.resource,
      created_at: now,
      ...stored,
    });
    return tokenResponse(secrets, code.scopes);
  },

  /** A refresh token (once) → both tokens replaced. */
  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const now = Date.now();
    const grant = db.getOAuthGrantByRefresh(sha256(refreshToken));
    if (!grant || grant.client_id !== client.client_id || grant.refresh_expires_at <= now) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    if (resource !== undefined && checkResource(resource) !== grant.resource)
      throw new InvalidGrantError('Invalid resource');
    if (scopes?.length) checkScopes(scopes);
    const { secrets, stored } = newTokens(now);
    db.replaceOAuthGrantTokens(grant.id, stored, now);
    return tokenResponse(secrets, grant.scopes);
  },

  /** Every MCP request: a live connection of a user who is still a teacher. */
  async verifyAccessToken(token): Promise<AuthInfo> {
    const now = Date.now();
    const grant = db.getOAuthGrantByAccess(sha256(token));
    if (!grant || grant.access_expires_at <= now) throw new InvalidTokenError('Invalid or expired access token');
    if (db.getUser(grant.user_id)?.role !== 'teacher') throw new InvalidTokenError('Not a teacher');
    if (!grant.last_used_at || now - grant.last_used_at > TOUCH_EVERY_MS) db.touchOAuthGrant(grant.id, now);
    return {
      token,
      clientId: grant.client_id,
      scopes: grant.scopes.split(' '),
      expiresAt: Math.floor(grant.access_expires_at / 1000),
      resource: new URL(grant.resource),
      extra: { userId: grant.user_id },
    };
  },

  async revokeToken(client, request) {
    db.deleteOAuthGrantByToken(sha256(request.token), client.client_id);
  },
};

/** The waiting request for the consent page: who asks, and where the browser goes back to. */
export function describeAuthorizationRequest(requestId: string) {
  const request = db.getOAuthRequest(requestId, Date.now());
  if (!request) return undefined;
  return {
    clientName: request.client_name,
    redirectHost: new URL(request.redirect_uri).host,
    scopes: request.scopes.split(' '),
  };
}

/** Where the browser goes back to the client: with the code, or with an error; always with state and iss. */
function redirectBack(request: db.OAuthRequest, params: Record<string, string>): string {
  const url = new URL(request.redirect_uri);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (request.state !== null) url.searchParams.set('state', request.state);
  // RFC 9207: the client checks it came from the authorization server it started with.
  url.searchParams.set('iss', ISSUER_URL.href.replace(/\/$/, ''));
  return url.href;
}

/** The teacher allowed: a one-time code for the client. → where the browser goes. */
export function approveAuthorizationRequest(requestId: string, userId: number): string | undefined {
  const now = Date.now();
  const request = db.getOAuthRequest(requestId, now);
  if (!request) return undefined;
  db.deleteOAuthRequest(requestId);
  const code = randomSecret();
  db.insertOAuthCode({
    code_hash: sha256(code),
    user_id: userId,
    client_id: request.client_id,
    client_name: request.client_name,
    redirect_uri: request.redirect_uri,
    code_challenge: request.code_challenge,
    scopes: request.scopes,
    resource: request.resource,
    expires_at: now + CODE_TTL_MS,
  });
  return redirectBack(request, { code });
}

/** The teacher (or a student, who may not) refused. → where the browser goes. */
export function denyAuthorizationRequest(requestId: string): string | undefined {
  const request = db.getOAuthRequest(requestId, Date.now());
  if (!request) return undefined;
  db.deleteOAuthRequest(requestId);
  const error = new AccessDeniedError('The user did not allow access');
  return redirectBack(request, { error: error.errorCode, error_description: error.message });
}

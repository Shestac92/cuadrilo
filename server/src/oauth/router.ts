import type { AssistantAccessDecision, AssistantAccessRequest, AssistantConnection } from '@cuadrilo/shared/api';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { type Request, type RequestHandler, type Response, Router } from 'express';

import { type AuthedRequest, requireTeacher } from '../auth';
import * as db from '../db';
import { notFound, parseId, wrap } from '../http';
import { t } from '../i18n';
import { PLATFORM_NAME } from '../platform';
import { ISSUER_URL, LESSONS_SCOPE, MCP_RESOURCE_URL } from './config';
import {
  approveAuthorizationRequest,
  denyAuthorizationRequest,
  describeAuthorizationRequest,
  oauthProvider,
} from './provider';

/** The issuer as clients compare it: the origin, no trailing slash (metadata, iss, resource metadata). */
const ISSUER = ISSUER_URL.origin;
const RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource/mcp`;

/** RFC 8414, with Client ID Metadata Documents and the iss parameter announced (ChatGPT, Claude). */
const authorizationServerMetadata: OAuthMetadata & Record<string, unknown> = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  registration_endpoint: `${ISSUER}/oauth/register`,
  revocation_endpoint: `${ISSUER}/oauth/revoke`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  scopes_supported: [LESSONS_SCOPE],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
};

/** RFC 9728: the MCP server and who issues its tokens. */
const protectedResourceMetadata: OAuthProtectedResourceMetadata = {
  resource: MCP_RESOURCE_URL.href,
  authorization_servers: [ISSUER],
  scopes_supported: [LESSONS_SCOPE],
  bearer_methods_supported: ['header'],
  resource_name: PLATFORM_NAME,
};

/**
 * The OAuth endpoints and metadata: mounted at the root, before the
 * same-origin check and the JSON parser (assistants call them from their
 * servers; the token endpoint takes a form body). The SDK's handlers check the
 * requests, PKCE and rates; the decisions are in provider.ts.
 */
export function oauthRouter(): Router {
  const router = Router();
  router.use('/.well-known/oauth-authorization-server', metadataHandler(authorizationServerMetadata));
  // Path-specific (RFC 9728) and at the root, for clients that look there.
  router.use('/.well-known/oauth-protected-resource/mcp', metadataHandler(protectedResourceMetadata));
  router.use('/.well-known/oauth-protected-resource', metadataHandler(protectedResourceMetadata));
  router.use('/oauth/authorize', authorizationHandler({ provider: oauthProvider }));
  router.use('/oauth/token', tokenHandler({ provider: oauthProvider }));
  router.use('/oauth/register', clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }));
  router.use('/oauth/revoke', revocationHandler({ provider: oauthProvider }));
  return router;
}

/** /mcp: only with a live access token for this server and the lessons scope (401 tells where to sign in). */
export const requireAssistantToken: RequestHandler = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [LESSONS_SCOPE],
  resourceMetadataUrl: RESOURCE_METADATA_URL,
  expectedResource: MCP_RESOURCE_URL,
});

/** A request id from the consent page's address (random base64url). */
function requestIdOf(req: Request, res: Response): string | undefined {
  const id = String(req.params.id);
  if (/^[A-Za-z0-9_-]{20,100}$/.test(id)) return id;
  notFound(res, t('errors.assistantRequestExpired'));
  return undefined;
}

/**
 * /api/oauth (signed in, origin-checked like the rest of /api): the consent page
 * and the teacher's "Conexiones".
 */
export function assistantAccessRouter(): Router {
  const router = Router();

  router.get(
    '/requests/:id',
    wrap((req, res) => {
      const id = requestIdOf(req, res);
      if (!id) return;
      const request = describeAuthorizationRequest(id);
      if (!request) return notFound(res, t('errors.assistantRequestExpired'));
      res.json(request satisfies AssistantAccessRequest);
    }),
  );

  router.post(
    '/requests/:id/approve',
    requireTeacher,
    wrap((req, res) => {
      const id = requestIdOf(req, res);
      if (!id) return;
      const redirectTo = approveAuthorizationRequest(id, (req as AuthedRequest).user.dbId);
      if (!redirectTo) return notFound(res, t('errors.assistantRequestExpired'));
      res.json({ redirectTo } satisfies AssistantAccessDecision);
    }),
  );

  // Anyone signed in may refuse (a student cannot allow).
  router.post(
    '/requests/:id/deny',
    wrap((req, res) => {
      const id = requestIdOf(req, res);
      if (!id) return;
      const redirectTo = denyAuthorizationRequest(id);
      if (!redirectTo) return notFound(res, t('errors.assistantRequestExpired'));
      res.json({ redirectTo } satisfies AssistantAccessDecision);
    }),
  );

  router.get(
    '/connections',
    requireTeacher,
    wrap((req, res) => {
      const connections: AssistantConnection[] = db.listOAuthGrants((req as AuthedRequest).user.dbId).map((grant) => ({
        id: grant.id,
        clientName: grant.client_name,
        connectedAt: new Date(grant.created_at).toISOString(),
        lastUsedAt: grant.last_used_at === null ? null : new Date(grant.last_used_at).toISOString(),
      }));
      res.json(connections);
    }),
  );

  router.delete(
    '/connections/:id',
    requireTeacher,
    wrap((req, res) => {
      const id = parseId(req, res);
      if (id === undefined) return;
      if (!db.deleteOAuthGrant(id, (req as AuthedRequest).user.dbId)) {
        return notFound(res, t('errors.assistantConnectionNotFound'));
      }
      res.status(204).end();
    }),
  );

  return router;
}

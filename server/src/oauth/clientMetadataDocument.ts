import { type OAuthClientInformationFull, OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';

import { ALLOW_LOCAL_FETCH, fetchPublic } from '../publicFetch';

/**
 * OAuth Client ID Metadata Documents (CIMD): a client's id is the https URL of
 * a JSON document describing it (ChatGPT: https://chatgpt.com/oauth/client.json).
 * Nothing is registered here; the document is fetched — carefully, as the URL
 * comes from outside — and cached for a while.
 */

const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 16 * 1024;

const cache = new Map<string, { client: OAuthClientInformationFull; expiresAt: number }>();

/** Whether a client id is a metadata document URL (not an id we issued by registration). */
export function isClientMetadataDocumentUrl(clientId: string): boolean {
  return clientId.startsWith('https://') || (ALLOW_LOCAL_FETCH && clientId.startsWith('http://'));
}

/**
 * The client described by the document at `url`, or undefined if it cannot be
 * used: not https, a non-public host, a redirect, no answer within 5 s, larger than 16 KB,
 * not valid client metadata, or a client_id that is not this very URL.
 */
export async function fetchClientMetadataDocument(url: string): Promise<OAuthClientInformationFull | undefined> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const response = await fetchPublic(url, {
    maxBytes: MAX_BYTES,
    timeoutMs: TIMEOUT_MS,
    maxRedirects: 0,
    accept: 'application/json',
  });
  if (!response.ok) return undefined;
  try {
    const document = JSON.parse(response.bytes.toString('utf8')) as { client_id?: unknown };
    const metadata = OAuthClientMetadataSchema.safeParse(document);
    if (!metadata.success || document.client_id !== url || metadata.data.redirect_uris.length === 0) return undefined;
    // A public client: it proves itself with PKCE, not with a secret.
    const client: OAuthClientInformationFull = { ...metadata.data, client_id: url, token_endpoint_auth_method: 'none' };
    cache.set(url, { client, expiresAt: Date.now() + CACHE_MS });
    return client;
  } catch {
    return undefined;
  }
}

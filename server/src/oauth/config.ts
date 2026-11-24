/**
 * Where this server is reached from outside (PUBLIC_URL: the ngrok or
 * production address; in dev, Vite on localhost:5173). OAuth clients see it as
 * the authorization server (issuer) and the MCP server is the resource /mcp.
 */
export const PUBLIC_URL = new URL(process.env.PUBLIC_URL ?? 'http://localhost:5173');

/** This server as the OAuth authorization server. */
export const ISSUER_URL = new URL(PUBLIC_URL.origin);

/** The MCP server: tokens are issued for it only (RFC 8707 resource). */
export const MCP_RESOURCE_URL = new URL('/mcp', PUBLIC_URL.origin);

/** The only scope: the teacher's lessons and media library. */
export const LESSONS_SCOPE = 'lessons';

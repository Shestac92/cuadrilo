import { DEFAULT_PLATFORM_NAME } from '@cuadrilo/shared/platform';

/** The platform's name (PLATFORM_NAME): in the MCP server's title, the OAuth resource name, the User-Agent. */
export const PLATFORM_NAME = process.env.PLATFORM_NAME || DEFAULT_PLATFORM_NAME;

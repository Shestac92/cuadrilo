import { DEFAULT_PLATFORM_NAME } from '@cuadrilo/shared/platform';

/** The platform's name, set when the client is built (PLATFORM_NAME, vite.config.ts); not defined outside a Vite build (tests). */
export const PLATFORM_NAME = typeof __PLATFORM_NAME__ === 'undefined' ? DEFAULT_PLATFORM_NAME : __PLATFORM_NAME__;

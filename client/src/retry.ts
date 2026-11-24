import { ApiError } from './api';

/**
 * When a failed request is tried again by itself: answers (exercises/sync.tsx)
 * and the lesson editor's autosave (editor/autosave.ts) follow the same rules.
 */

/** No response, a server error or the rate limit: worth trying again later. Other errors would fail again. */
export function isWorthRetrying(error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : 0;
  return status === 0 || status >= 500 || status === 429;
}

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

/** Backoff: 1 s after the first failure, doubling up to 15 s. */
export const retryDelayMs = (failures: number, firstMs = FIRST_RETRY_MS, maxMs = MAX_RETRY_MS) =>
  Math.min(firstMs * 2 ** (failures - 1), maxMs);

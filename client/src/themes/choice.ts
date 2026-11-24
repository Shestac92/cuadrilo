import { DEFAULT_THEME, isThemeId, type ThemeId } from '@cuadrilo/shared/themes';

/**
 * The theme shown: the server's choice once it has answered (GET /api/config);
 * before that, the one this browser saw last time, so a page does not open in
 * one theme and turn into another; then the default.
 */
export const pickTheme = (fromServer: unknown, cached: unknown): ThemeId =>
  isThemeId(fromServer) ? fromServer : isThemeId(cached) ? cached : DEFAULT_THEME;

const CACHE_KEY = 'platform-theme';

/** The last theme this browser saw; null if none (or the storage is blocked). */
export function readCachedTheme(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

export function cacheTheme(id: ThemeId): void {
  try {
    localStorage.setItem(CACHE_KEY, id);
  } catch {
    // a blocked storage only costs the first paint of the next visit
  }
}

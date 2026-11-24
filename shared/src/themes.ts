/**
 * The platform's visual themes (branding), chosen by the teachers for everyone.
 * Only the ids live here: the server validates a stored/received id against
 * this list, the client maps each id to a Mantine theme. A new theme is an id
 * here plus its definition in the client. Light/dark is the user's own choice
 * and is not part of a theme's id.
 */
export const THEME_IDS = ['classic', 'blush'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** The theme of an installation where the teachers have not chosen one. */
export const DEFAULT_THEME: ThemeId = 'classic';

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);

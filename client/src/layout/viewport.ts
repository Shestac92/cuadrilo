/**
 * The one switch between the desktop and the phone layout, for the whole platform.
 * Below this width (a phone, a tablet held upright) the menu is a burger, the board is a bottom sheet and the
 * pages stack. At and above it everything stays desktop. It is as low as a lesson allows: with the menu as
 * icons (76 px) and the side column (240 px) a lesson keeps about 500 px, which its widgets need.
 * Code reads it through `useIsMobile()`; styles through `html[data-viewport="mobile"]` (see `useIsMobile.ts`).
 */
export const MOBILE_BELOW = 990;

/** A media query for "narrower than `width`" (widths are whole pixels; the gap keeps `width` itself outside). */
export const narrowerThan = (width: number) => `(max-width: ${width - 0.02}px)`;

export const MOBILE_QUERY = narrowerThan(MOBILE_BELOW);

/**
 * Not a second switch, only density: a desktop window narrower than this (half a screen, a tablet)
 * has no room for the full menu next to a lesson and its side column, so the menu shows icons only.
 */
export const COMPACT_BELOW = 1200;

export const COMPACT_QUERY = narrowerThan(COMPACT_BELOW);

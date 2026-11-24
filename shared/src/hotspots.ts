import type { BlockOf } from './lesson';

/**
 * The hotspots block: a picture with zones the student has to find by clicking.
 * Zones are stored as fractions of the picture, so they stay in place at any size:
 * `x`, `y` — of the width and the height (a circle's centre, a rectangle's top
 * left corner), `w`, `h` — of the width and the height, `r` — of the WIDTH (the
 * circle stays round whatever the picture's proportions).
 */
export type Hotspot = BlockOf<'hotspots'>['hotspots'][number];

/** One block holds at most this many zones. */
export const HOTSPOTS_MAX = 30;
/** Zones smaller than this are too small to hit with a finger (fractions of the picture's width). */
export const HOTSPOT_MIN_RADIUS = 0.02;
export const HOTSPOT_MIN_SIDE = 0.04;

/** What a click does. */
export type HotspotClick = { kind: 'found'; hotspot: Hotspot } | { kind: 'again' } | { kind: 'miss' };

/** Whether the point (fractions of the picture) is inside the zone; `aspect` is the picture's height / width. */
export function insideHotspot(hotspot: Hotspot, x: number, y: number, aspect: number): boolean {
  if (hotspot.shape === 'circle') {
    return Math.hypot(x - hotspot.x, (y - hotspot.y) * aspect) <= hotspot.r;
  }
  return x >= hotspot.x && x <= hotspot.x + hotspot.w && y >= hotspot.y && y <= hotspot.y + hotspot.h;
}

/**
 * A click on the picture: finds a zone that was not found yet (zones may
 * overlap: a click that is in several finds the first one not found), or
 * lands on zones that are all found already, or misses.
 */
export function clickHotspots(
  hotspots: readonly Hotspot[],
  found: ReadonlySet<string>,
  x: number,
  y: number,
  aspect: number,
): HotspotClick {
  const hit = hotspots.filter((hotspot) => insideHotspot(hotspot, x, y, aspect));
  const next = hit.find((hotspot) => !found.has(hotspot.id));
  if (next) return { kind: 'found', hotspot: next };
  return hit.length > 0 ? { kind: 'again' } : { kind: 'miss' };
}

/** What a student's saved state of a hotspots block holds: the zones found, with where the student clicked. */
export interface HotspotsState {
  found: { id: string; x: number; y: number }[];
}

/**
 * The wheel of fortune (the `wheel` block): the arithmetic of a spin, shared by
 * the page that draws it and the server that decides it in a live class.
 *
 * Angles are degrees, clockwise, and cumulative: a wheel that has turned twice
 * is at 720 + something, so it always turns forward. The pointer is fixed at
 * 3 o'clock (POINTER_ANGLE: the item under it has its text level, so it reads
 * left to right); item 0 starts at 12 o'clock and the items follow clockwise. Every
 * client works out where the wheel is at any moment from the same few numbers
 * (`Spin`) and the same curve, so they all see the same turn, and a page opened
 * in the middle of it joins at the right place.
 */

/** Where the pointer is, in degrees clockwise from the top: 3 o'clock. */
export const POINTER_ANGLE = 90;

/** How long a spin lasts. */
export const SPIN_DURATION_MS = 5000;
/** Whole turns a spin makes at least, before it settles. */
const MIN_TURNS = 4;
/** The part of a segment on each side where the pointer may not stop (not on the line between two). */
const EDGE = 0.15;

/** One spin, from the wheel's resting angle `from` to `to`, starting at `startedAt` (ms, the server's clock). */
export interface Spin {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
}

const normalize = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Slows down towards the end (a wheel running out of speed). */
export const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/** Where the wheel is `now` (ms): between `from` and `to` by the curve, `to` once it is over. */
export function angleAt(spin: Spin, now: number): number {
  const t = Math.min(Math.max((now - spin.startedAt) / spin.durationMs, 0), 1);
  return spin.from + (spin.to - spin.from) * easeOutQuart(t);
}

/** Whether the spin is over at `now`. */
export const isSpinOver = (spin: Spin, now: number) => now >= spin.startedAt + spin.durationMs;

/** The item under the pointer when the wheel stands at `angle` (`count` items). */
export function itemAt(angle: number, count: number): number {
  return Math.floor(normalize(POINTER_ANGLE - angle) / (360 / count)) % count;
}

/**
 * A new spin from the resting angle `rest`: every item is equally likely, and the
 * pointer stops inside the chosen segment, away from its edges. `random` is
 * Math.random, or a fixed one in a test.
 */
export function planSpin(
  rest: number,
  count: number,
  startedAt: number,
  random: () => number = Math.random,
): Spin & { item: number } {
  const item = Math.min(Math.floor(random() * count), count - 1);
  const segment = 360 / count;
  const inside = segment * (EDGE + random() * (1 - 2 * EDGE));
  // The wheel must turn so that this point of the wheel is under the pointer.
  const target = normalize(POINTER_ANGLE - (item * segment + inside));
  const forward = normalize(target - normalize(rest));
  return { from: rest, to: rest + MIN_TURNS * 360 + forward, startedAt, durationMs: SPIN_DURATION_MS, item };
}

// ----- the wheel of a live class (server/src/wheelStore.ts, live.ts) -----

/** The latest spin of a wheel in a class. `seq` counts the spins (a page ignores an older one than it has). */
export interface WheelState {
  seq: number;
  spin: Spin;
}

/**
 * What the server says about one wheel: the server → page `wheel` event and the answers to `wheelState`
 * and `wheelSpin`. `state` is null while nobody has spun it. `serverNow` is the server's clock when it said
 * it, so a page can tell how far its own clock is off (`Spin.startedAt` is on the server's clock).
 */
export interface WheelUpdate {
  lessonId: number;
  blockId: string;
  state: WheelState | null;
  serverNow: number;
  /** In the answer to `wheelSpin`: whether this call started the spin (false: it was already turning). */
  started?: boolean;
}

/** Page → server `wheelState` / `wheelSpin`. */
export interface WheelRequest {
  lessonId: number;
  blockId: string;
}

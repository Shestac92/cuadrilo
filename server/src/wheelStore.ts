import { isSpinOver, planSpin, type WheelState } from '@cuadrilo/shared/wheel';

/**
 * Local state cache of the wheels of live classes: the latest spin of each wheel (a `wheel` block) in each
 * class, in the server's memory only.
 *
 * Why it exists: a spin is told to the class's pages as an event, but a page that opens the exercise later (or
 * reconnects) has missed it and must still show the wheel where it is now, so the server keeps the last spin
 * and answers `wheelState` with it. Why memory and not the database: it is live state of a class (like
 * presence), and losing it when the server restarts only puts the wheels back at their start.
 *
 * Rules:
 * - the state belongs to a class (not to the lesson): two classes on one lesson have separate wheels;
 * - one spin at a time: a wheel that is turning cannot be spun again, the call gets the spin in progress;
 * - the server chooses the item and the angle (shared/src/wheel.ts), so there is one source of truth;
 * - `forgetClass` when a class ends or changes its lesson; entries nobody touched for `ttlMs` are dropped as
 *   well, so nothing can pile up;
 * - the clock is injected, so tests control time. Nothing here knows sockets, the database or HTTP.
 */
export class WheelStore {
  private readonly entries = new Map<string, { state: WheelState; touchedAt: number }>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly ttlMs = 12 * 60 * 60 * 1000,
  ) {}

  private static key(classId: number, blockId: string) {
    return `${classId}:${blockId}`;
  }

  /** The latest spin of the wheel, if it has been spun. */
  get(classId: number, blockId: string): WheelState | undefined {
    this.prune();
    return this.entries.get(WheelStore.key(classId, blockId))?.state;
  }

  /**
   * Spins the wheel of `count` items unless it is turning. `started: false` means it was turning already
   * and `state` is that spin.
   */
  spin(classId: number, blockId: string, count: number): { started: boolean; state: WheelState } {
    this.prune();
    const now = this.clock();
    const key = WheelStore.key(classId, blockId);
    const current = this.entries.get(key);
    if (current && !isSpinOver(current.state.spin, now)) return { started: false, state: current.state };
    // From where it rests, kept under one turn so the numbers do not grow for ever (the picture is the same).
    const rest = current ? ((current.state.spin.to % 360) + 360) % 360 : 0;
    const { item: _chosen, ...spin } = planSpin(rest, count, now);
    const state: WheelState = { seq: (current?.state.seq ?? 0) + 1, spin };
    this.entries.set(key, { state, touchedAt: now });
    return { started: true, state };
  }

  /** The class is over (or on another lesson): its wheels start again. */
  forgetClass(classId: number): void {
    for (const key of this.entries.keys()) if (key.startsWith(`${classId}:`)) this.entries.delete(key);
  }

  /** How many wheels are remembered (for tests). */
  get size(): number {
    return this.entries.size;
  }

  private prune(): void {
    const oldest = this.clock() - this.ttlMs;
    for (const [key, entry] of this.entries) if (entry.touchedAt < oldest) this.entries.delete(key);
  }
}

/** The one cache of the server. */
export const wheelStore = new WheelStore();

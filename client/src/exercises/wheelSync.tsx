import type { Spin, WheelState, WheelUpdate } from '@cuadrilo/shared/wheel';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { useLive } from '../liveConnection';

/**
 * The wheel of a live class on a page: the spin comes from the server (the one source of truth: it picks the
 * item and the angle), so everyone in the class sees the same turn. Outside a class there is no provider and
 * the wheel spins by itself (WheelBlock).
 */

/** What WheelBlock draws and calls, wherever the spin comes from. */
export interface WheelController {
  /** The spin to show (null: never spun). */
  spin: Spin | null;
  /** The clock `spin.startedAt` is on: the server's, in a class. */
  now: () => number;
  start: () => void;
  canStart: boolean;
}

const WheelSyncContext = createContext<{ socket: Socket; lessonId: number } | null>(null);

/** Around the lesson of a live class: the wheels in it are the class's. `active` false (no class on this lesson): not. */
export function WheelSync({ lessonId, active, children }: { lessonId: number; active: boolean; children: ReactNode }) {
  const { socket } = useLive();
  const value = useMemo(() => (active && socket ? { socket, lessonId } : null), [active, socket, lessonId]);
  return <WheelSyncContext.Provider value={value}>{children}</WheelSyncContext.Provider>;
}

/** The wheel `blockId` of the class, or null when the page is not in a live class (the wheel is local then). */
export function useRemoteWheel(blockId: string): WheelController | null {
  const sync = useContext(WheelSyncContext);
  const { connected } = useLive();
  const [state, setState] = useState<WheelState | null>(null);
  const latestSeq = useRef(0);
  /** The server's clock minus ours (ms), measured on every answer; the spin is on the server's clock. */
  const offset = useRef<number | null>(null);

  /**
   * An answer about this wheel. `asked`: when we asked (the clock offset is taken as if the server answered
   * halfway); `authoritative`: a reply to "where is it now" replaces what we have even if its number is lower
   * (a new class starts at 1 again); an event or the answer to a spin only if it is newer.
   */
  const apply = useCallback(
    (update: WheelUpdate | null, asked: number | undefined, authoritative: boolean) => {
      if (!sync || !update || update.lessonId !== sync.lessonId || update.blockId !== blockId) return;
      if (asked !== undefined) offset.current = update.serverNow - (asked + Date.now()) / 2;
      else offset.current ??= update.serverNow - Date.now();
      if (authoritative || (update.state && update.state.seq > latestSeq.current)) {
        latestSeq.current = update.state?.seq ?? 0;
        setState(update.state);
      }
    },
    [sync, blockId],
  );

  useEffect(() => {
    if (!sync) return;
    const { socket, lessonId } = sync;
    const onWheel = (update: WheelUpdate) => apply(update, undefined, false);
    socket.on('wheel', onWheel);
    // Where the wheel is now: on opening the exercise and after a reconnection (what was missed).
    if (connected) {
      const asked = Date.now();
      socket.emit('wheelState', { lessonId, blockId }, (update: WheelUpdate | null) => apply(update, asked, true));
    }
    return () => {
      socket.off('wheel', onWheel);
    };
  }, [sync, blockId, connected, apply]);

  const start = useCallback(() => {
    if (!sync?.socket.connected) return;
    const asked = Date.now();
    sync.socket.emit('wheelSpin', { lessonId: sync.lessonId, blockId }, (update: WheelUpdate | null) =>
      apply(update, asked, false),
    );
  }, [sync, blockId, apply]);

  const now = useCallback(() => Date.now() + (offset.current ?? 0), []);
  if (!sync) return null;
  return { spin: state?.spin ?? null, now, start, canStart: connected };
}

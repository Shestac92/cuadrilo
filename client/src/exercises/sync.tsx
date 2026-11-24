import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { api } from '../api';
import { getOrCreate } from '../collections';
import { isWorthRetrying, retryDelayMs } from '../retry';
import { forgetSolution } from './savedState';
import { useViewMode } from './viewMode';

/**
 * Sync of exercise blocks.
 *
 * Every interactive block keeps its whole state in useBlockState(id, …):
 * - outside a sync provider it is plain local state;
 * - on the student's page (StudentSync) every change sends the full state of
 *   the block to the server (PUT …/states/:blockId, server/src/answers.ts),
 *   retried until saved;
 * - on the teacher's page (TeacherSync) the block is read-only and shows the
 *   student's state; an update re-renders only that block.
 */

export type SyncMode = 'student' | 'teacher';

/** Send the state at most once per throttleMs (essay drafts); 0 = right away. */
type Report = (blockId: string, state: unknown, throttleMs: number) => void;

interface BlockStore {
  get: (blockId: string) => unknown;
  subscribe: (blockId: string, onChange: () => void) => () => void;
}

interface SyncContextValue {
  mode: SyncMode;
  /**
   * Latest known state per block (student): the saved ones when the page
   * opened, then every change. A block that unmounts (another chapter) and
   * mounts again starts from here.
   */
  latest: Map<string, unknown>;
  report?: Report;
  store?: BlockStore;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const noSubscribe = () => () => {};

/**
 * State of one block. Returns [state, setState, readOnly, hasState]; readOnly is
 * true on the teacher's page, hasState is false there while there is no state of
 * the student's to show (the state is then the block's initial one). `throttleMs` decides per state how soon it is sent.
 */
export function useBlockState<S>(
  blockId: string,
  init: () => S,
  throttleMs: (state: S) => number = () => 0,
): [S, Dispatch<SetStateAction<S>>, boolean, boolean] {
  const sync = useContext(SyncContext);
  // The teacher's view never answers, with or without a student's states to show (the lesson's preview).
  const viewMode = useViewMode();
  const teacherView = sync?.mode === 'teacher' || viewMode === 'teacher';
  // Stable fallback (also what the teacher sees before the student's first change).
  const [fallback] = useState(init);
  const [local, setLocal] = useState<S>(() => (sync?.latest.get(blockId) as S | undefined) ?? fallback);

  const store = sync?.mode === 'teacher' ? sync.store : undefined;
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(blockId, onChange) : noSubscribe()),
    [store, blockId],
  );
  const remote = useSyncExternalStore(subscribe, () => store?.get(blockId) as S | undefined);

  // Student: every state, the initial one included (the teacher needs e.g. the
  // shuffled word bank before the first answer); not a state that is already
  // saved (restored when the page opened, or after another chapter).
  const report = sync?.mode === 'student' ? sync.report : undefined;
  const latest = sync?.latest;
  const [restored] = useState(() => local);
  // Often a new function on every render: the latest one is read when a state goes out.
  const throttleOf = useRef(throttleMs);
  useEffect(() => {
    throttleOf.current = throttleMs;
  });
  useEffect(() => {
    if (local === restored && latest?.has(blockId)) return;
    report?.(blockId, local, throttleOf.current(local));
  }, [report, latest, restored, blockId, local]);

  if (teacherView) return [remote ?? fallback, () => {}, true, remote !== undefined];
  return [local, setLocal, false, true];
}

// ----- student -----

/** Sends one block state: 'saved', 'retry' (try again later) or 'rejected' (will not help). */
export type SendState = (blockId: string, state: unknown) => Promise<'saved' | 'retry' | 'rejected'>;

/**
 * Lessons: PUT /api/lessons/:id/states/:blockId. `onResult` hears every outcome
 * (the error, or undefined once an answer is saved), so the page can tell the student when answers are not kept.
 */
export const sendOverHttp =
  (lessonId: number, onResult?: (error: Error | undefined) => void): SendState =>
  async (blockId, state) => {
    try {
      await api.saveBlockState(lessonId, blockId, state);
      onResult?.(undefined);
      return 'saved';
    } catch (error) {
      onResult?.(error as Error);
      // Not worth retrying: no access, unknown block, too large, signed out.
      if (isWorthRetrying(error)) return 'retry';
      console.warn(`Answer ${blockId} not saved:`, error);
      return 'rejected';
    }
  };

/**
 * Latest state per block, sent until saved. At most one request per block is
 * in flight: a newer state waits and replaces any older one still waiting, so
 * a block's states reach the server in order (HTTP requests may overtake each
 * other) and intermediate ones are skipped.
 */
export function createSender(
  send: SendState,
  { retryMs, maxRetryMs }: { retryMs?: number; maxRetryMs?: number } = {},
): Report & { flushAll: () => void } {
  const pending = new Map<string, unknown>();
  /** Throttle of the waiting state (essay drafts: 1 s). */
  const throttle = new Map<string, number>();
  const inFlight = new Set<string>();
  const lastSent = new Map<string, number>();
  const failures = new Map<string, number>();
  const timers = new Map<string, { at: number; timer: ReturnType<typeof setTimeout> }>();

  const schedule = (blockId: string, delay: number) => {
    const at = Date.now() + delay;
    const current = timers.get(blockId);
    if (current && current.at <= at) return;
    if (current) clearTimeout(current.timer);
    timers.set(blockId, {
      at,
      timer: setTimeout(() => {
        timers.delete(blockId);
        void flush(blockId);
      }, delay),
    });
  };

  /** When the waiting state of the block may go: its throttle after the last send. */
  const delayOf = (blockId: string) =>
    Math.max(0, (lastSent.get(blockId) ?? 0) + (throttle.get(blockId) ?? 0) - Date.now());

  const flush = async (blockId: string) => {
    if (inFlight.has(blockId) || !pending.has(blockId)) return;
    const state = pending.get(blockId);
    pending.delete(blockId);
    inFlight.add(blockId);
    lastSent.set(blockId, Date.now());
    const result = await send(blockId, state);
    inFlight.delete(blockId);
    if (result === 'retry') {
      // Unless a newer state is already waiting, this one goes again (with backoff).
      if (!pending.has(blockId)) pending.set(blockId, state);
      const count = (failures.get(blockId) ?? 0) + 1;
      failures.set(blockId, count);
      return schedule(blockId, retryDelayMs(count, retryMs, maxRetryMs));
    }
    failures.delete(blockId);
    // A state that came meanwhile goes when its throttle allows (not at once: drafts stay at 1/s).
    if (pending.has(blockId)) schedule(blockId, delayOf(blockId));
  };

  const report: Report = (blockId, state, throttleMs) => {
    pending.set(blockId, state);
    throttle.set(blockId, throttleMs);
    schedule(blockId, delayOf(blockId));
  };
  /** Everything waiting goes now, throttle or not (the page is being closed). */
  const flushAll = () => pending.forEach((_, blockId) => void flush(blockId));
  return Object.assign(report, { flushAll });
}

/** Student's page: blocks start from the saved states and send every change. */
export function StudentSync({
  send,
  initial,
  children,
}: {
  send: SendState;
  /** blockId → saved state. */
  initial: Record<string, unknown>;
  children: ReactNode;
}) {
  const [value] = useState<SyncContextValue & { flushAll: () => void }>(() => {
    const latest = new Map(Object.entries(initial).map(([blockId, state]) => [blockId, forgetSolution(state)]));
    const sender = createSender(send);
    return {
      mode: 'student',
      latest,
      flushAll: sender.flushAll,
      report: (blockId, state, throttleMs) => {
        latest.set(blockId, state);
        sender(blockId, state, throttleMs);
      },
    };
  });
  // A draft still waiting for its throttle is sent when the page is closed
  // (requests are keepalive, so they outlive the page). What failed meanwhile is tried
  // again as soon as the network is back or the tab is looked at again, not only on the backoff.
  useEffect(() => {
    const whenVisible = () => document.visibilityState === 'visible' && value.flushAll();
    window.addEventListener('pagehide', value.flushAll);
    window.addEventListener('online', value.flushAll);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.removeEventListener('pagehide', value.flushAll);
      window.removeEventListener('online', value.flushAll);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [value]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// ----- teacher -----

/** Block states of one student, updated live; subscribers are per block. */
export function createBlockStore(initial: Record<string, unknown>) {
  const states = new Map(Object.entries(initial).map(([blockId, state]) => [blockId, forgetSolution(state)]));
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (blockId: string) => states.get(blockId),
    set: (blockId: string, state: unknown) => {
      states.set(blockId, forgetSolution(state));
      for (const listener of listeners.get(blockId) ?? []) listener();
    },
    subscribe: (blockId: string, onChange: () => void) => {
      getOrCreate(listeners, blockId, () => new Set()).add(onChange);
      return () => listeners.get(blockId)?.delete(onChange);
    },
  };
}

export type LiveBlockStore = ReturnType<typeof createBlockStore>;

/** Teacher's page: blocks are read-only and show the student's live states. */
export function TeacherSync({ store, children }: { store: LiveBlockStore; children: ReactNode }) {
  // Another store (another student): the blocks re-subscribe and show its states, without remounting.
  const value = useMemo<SyncContextValue>(() => ({ mode: 'teacher', latest: new Map(), store }), [store]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { isWorthRetrying, retryDelayMs } from '../retry';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface Autosave<T> {
  status: SaveStatus;
  /** The last failure's message, while it is not saved. */
  error: string | undefined;
  /** A new value: saved `delayMs` after the last change. */
  saveLater: (value: T) => void;
  /** Saves what is waiting now, without the delay ("Reintentar"). */
  saveNow: () => Promise<void>;
  /** saveNow, and waits for every request: → whether everything is saved. */
  saveAndWait: () => Promise<boolean>;
  /** Forgets the value not sent yet (it would be refused: the lesson changed elsewhere). */
  discardWaiting: () => void;
}

/**
 * Autosave of one value (the lesson document, its title): the latest value is
 * saved `delayMs` after the last change. One request at a time, so saves reach
 * the server in order; values changed meanwhile are skipped. Network and
 * server errors are retried with backoff; others wait for saveNow(). Leaving
 * the page with something unsaved asks first; leaving the editor in the app
 * saves at once.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delayMs = 800): Autosave<T> {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string>();
  const saveRef = useRef(save);
  const saver = useRef<{
    /** The value not sent yet. */
    waiting?: { value: T };
    sending: boolean;
    /** The request being sent, settled either way (to wait for it). */
    request?: Promise<void>;
    timer?: ReturnType<typeof setTimeout>;
    failures: number;
  }>({ sending: false, failures: 0 });

  useEffect(() => {
    saveRef.current = save;
  });

  const saveNow = useCallback(async () => {
    const state = saver.current;
    clearTimeout(state.timer);
    state.timer = undefined;
    if (state.sending || !state.waiting) return;
    const { value } = state.waiting;
    state.waiting = undefined;
    state.sending = true;
    setStatus('saving');
    const request = saveRef.current(value);
    state.request = request.then(
      () => {},
      () => {},
    );
    try {
      await request;
      state.sending = false;
      state.failures = 0;
      setError(undefined);
      // A change made meanwhile: its timer is running, unless it already fired during the request.
      if (!state.waiting) setStatus('saved');
      else if (!state.timer) void saveNow();
    } catch (failure) {
      state.sending = false;
      state.waiting ??= { value };
      state.failures += 1;
      setStatus('error');
      setError((failure as Error).message);
      if (isWorthRetrying(failure)) state.timer = setTimeout(saveNow, retryDelayMs(state.failures));
    }
  }, []);

  const saveLater = useCallback(
    (value: T) => {
      const state = saver.current;
      state.waiting = { value };
      clearTimeout(state.timer);
      state.timer = setTimeout(saveNow, delayMs);
      if (!state.failures) setStatus('saving');
    },
    [saveNow, delayMs],
  );

  const saveAndWait = useCallback(async () => {
    const state = saver.current;
    for (let attempt = 0; attempt < 3 && (state.sending || state.waiting); attempt += 1) {
      if (state.sending) await state.request;
      else await saveNow();
    }
    return !state.sending && !state.waiting;
  }, [saveNow]);

  const discardWaiting = useCallback(() => {
    const state = saver.current;
    clearTimeout(state.timer);
    state.timer = undefined;
    state.waiting = undefined;
    state.failures = 0;
    setError(undefined);
    setStatus('saved');
  }, []);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (saver.current.waiting || saver.current.sending) event.preventDefault();
    };
    const retry = () => void saveNow();
    const retryWhenVisible = () => document.visibilityState === 'visible' && retry();
    window.addEventListener('beforeunload', warnIfUnsaved);
    // A failed save is tried again when the network is back or the tab is looked at again.
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.removeEventListener('beforeunload', warnIfUnsaved);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retryWhenVisible);
      void saveNow();
    };
  }, [saveNow]);

  return { status, error, saveLater, saveNow, saveAndWait, discardWaiting };
}

/** Several autosaves (the lesson's title and document) seen as one: status, error, retry and waiting. */
export function combineAutosaves(
  ...autosaves: Autosave<never>[]
): Omit<Autosave<never>, 'saveLater' | 'discardWaiting'> {
  const statuses = autosaves.map((autosave) => autosave.status);
  return {
    status: statuses.includes('error') ? 'error' : statuses.includes('saving') ? 'saving' : 'saved',
    error: autosaves.find((autosave) => autosave.error)?.error,
    saveNow: async () => void (await Promise.all(autosaves.map((autosave) => autosave.saveNow()))),
    saveAndWait: async () => (await Promise.all(autosaves.map((autosave) => autosave.saveAndWait()))).every(Boolean),
  };
}

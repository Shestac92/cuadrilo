import type { BoardEntry, BoardEvent, BoardRemovedEvent } from '@cuadrilo/shared/board';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api';
import { useLive } from '../liveConnection';

/**
 * The lines of a board, oldest first: the latest page when the board is
 * opened, older pages on request (`loadOlder`), new lines from the socket
 * (each line once). `onLive` is told of a line that arrives live from the socket
 * (not of the first page, not of an older page, not of a line the page itself wrote).
 * A line the teacher deletes goes from every page at once (`boardRemoved`).
 */
export function useBoardFeed(boardId: number | null, onLive?: (entry: BoardEntry) => void) {
  const { socket } = useLive();
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string>();
  const loadingOlder = useRef(false);
  const live = useRef(onLive);
  live.current = onLive;

  useEffect(() => {
    setEntries([]);
    setHasMore(false);
    setError(undefined);
    if (!socket || boardId === null) return;
    const known = new Set<number>();
    const add = (event: BoardEvent) => {
      if (event.boardId !== boardId || known.has(event.entry.id)) return;
      known.add(event.entry.id);
      append(event.entry);
      live.current?.(event.entry);
    };
    const remove = (entryId: number) => setEntries((list) => list.filter((e) => e.id !== entryId));
    const append = (entry: BoardEntry) =>
      setEntries((list) => (list.some((e) => e.id === entry.id) ? list : [...list, entry]));
    // Listen first, then load: a line written meanwhile is not lost.
    const removed = (event: BoardRemovedEvent) => {
      if (event.boardId === boardId) remove(event.entryId);
    };
    socket.on('board', add);
    socket.on('boardRemoved', removed);
    let current = true;
    api.getBoardPage(boardId).then(
      (page) => {
        if (!current) return;
        setEntries((now) => [...page.entries, ...now.filter((e) => !page.entries.some((l) => l.id === e.id))]);
        setHasMore(page.hasMore);
      },
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
      socket.off('board', add);
      socket.off('boardRemoved', removed);
    };
  }, [socket, boardId]);

  /** The page before the oldest line shown. */
  const loadOlder = useCallback(async () => {
    const oldest = entries[0];
    if (boardId === null || !oldest || !hasMore || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const page = await api.getBoardPage(boardId, oldest.id);
      setEntries((list) => [...page.entries.filter((e) => !list.some((l) => l.id === e.id)), ...list]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingOlder.current = false;
    }
  }, [boardId, entries, hasMore]);

  /** A line the page itself wrote (the socket event confirms it a moment later). */
  const append = useCallback(
    (entry: BoardEntry) => setEntries((list) => (list.some((e) => e.id === entry.id) ? list : [...list, entry])),
    [],
  );

  /** A line the page itself deleted (the socket event tells the others). */
  const remove = useCallback((entryId: number) => setEntries((list) => list.filter((e) => e.id !== entryId)), []);

  return { entries, hasMore, error, loadOlder, append, remove };
}

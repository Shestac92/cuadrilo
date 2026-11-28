import type { AppSettings, HomeworkDeletedEvent, HomeworkEvent, StudentClass } from '@cuadrilo/shared/api';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { api, type Homework } from './api';
import { loadConfig, updateConfig } from './config';
import { noticesAfterEvent, replaceOrAddHomework } from './homeworkList';

/**
 * The live connection (socket.io namespace /live, server/src/live.ts), open
 * on every page while signed in:
 * - a student learns here that a class is on (and in which lesson), and that
 *   the teacher calls them to the lesson;
 * - the user's homework list lives here (student: their own; teacher: all),
 *   loaded on (re)connect and kept up to date by the homework events, so pages
 *   and the nav counters read it instead of fetching it each;
 * - the changes worth telling stay as notices until closed (components/LiveNotices);
 * - the platform's settings a teacher changes reach every page here (the theme changes without a reload);
 * - the teacher's class page and the student's lesson page use the same socket.
 */

interface LiveConnection {
  socket: Socket | undefined;
  connected: boolean;
  /** Student: the class they are in now; null if none (undefined until known). */
  studentClass: StudentClass | null | undefined;
  /** Student: the lesson the teacher called them to (null: no call); cleared by dismissCall. */
  calledToLessonId: number | null;
  dismissCall: () => void;
  /** The user's homework, newest first (undefined until loaded). */
  homework: Homework[] | undefined;
  homeworkError: string | undefined;
  /** A homework the page itself changed (the event confirms it a moment later). */
  updateHomework: (homework: Homework) => void;
  removeHomework: (id: number) => void;
  /** Homework changes to tell the user about, newest last; one per homework. */
  notices: HomeworkEvent[];
  /** Closes the notices that match. */
  dismissNotices: (match: (notice: HomeworkEvent) => boolean) => void;
}

const LiveContext = createContext<LiveConnection | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket>();
  const [connected, setConnected] = useState(false);
  const [studentClass, setStudentClass] = useState<StudentClass | null>();
  const [calledToLessonId, setCalledToLessonId] = useState<number | null>(null);
  const [homework, setHomework] = useState<Homework[]>();
  const [homeworkError, setHomeworkError] = useState<string>();
  const [notices, setNotices] = useState<HomeworkEvent[]>([]);

  useEffect(() => {
    // Same origin: in dev Vite proxies /socket.io to the backend.
    const socket = io('/live', { withCredentials: true });
    socket.on('connect', () => {
      setConnected(true);
      // First load, and again after a reconnect: events may have been missed meanwhile.
      api.listHomework().then(
        (list) => {
          setHomework(list);
          setHomeworkError(undefined);
        },
        (e: Error) => setHomeworkError(e.message),
      );
    });
    socket.on('disconnect', () => setConnected(false));
    // After a lost connection: a change of the settings may have been missed meanwhile.
    socket.io.on('reconnect', () => {
      loadConfig().catch(() => undefined);
    });
    socket.on('settings', (settings: AppSettings) => updateConfig(settings));
    socket.on('class', (nextClass: StudentClass | null) => {
      setStudentClass(nextClass);
      // A call to a lesson that is no longer the class's is stale.
      setCalledToLessonId((lessonId) => (nextClass && nextClass.lessonId === lessonId ? lessonId : null));
    });
    socket.on('call', ({ lessonId }: { lessonId: number }) => setCalledToLessonId(lessonId));
    socket.on('homework', (event: HomeworkEvent) => {
      setHomework((list) => replaceOrAddHomework(list, event.homework));
      setNotices((list) => noticesAfterEvent(list, event));
    });
    socket.on('homeworkDeleted', ({ id }: HomeworkDeletedEvent) => {
      setHomework((list) => list?.filter((item) => item.id !== id));
      setNotices((list) => list.filter((notice) => notice.homework.id !== id));
    });
    setSocket(socket);
    return () => {
      socket.disconnect();
      setSocket(undefined);
    };
  }, []);

  const dismissCall = useCallback(() => setCalledToLessonId(null), []);
  const updateHomework = useCallback(
    (changed: Homework) => setHomework((list) => replaceOrAddHomework(list, changed)),
    [],
  );
  const removeHomework = useCallback((id: number) => setHomework((list) => list?.filter((item) => item.id !== id)), []);
  const dismissNotices = useCallback(
    (match: (notice: HomeworkEvent) => boolean) =>
      setNotices((list) => {
        const next = list.filter((notice) => !match(notice));
        return next.length === list.length ? list : next;
      }),
    [],
  );

  // One object while nothing changed: a render of the parent (a page change) does not wake every reader.
  const value = useMemo(
    () => ({
      socket,
      connected,
      studentClass,
      calledToLessonId,
      dismissCall,
      homework,
      homeworkError,
      updateHomework,
      removeHomework,
      notices,
      dismissNotices,
    }),
    [
      socket,
      connected,
      studentClass,
      calledToLessonId,
      dismissCall,
      homework,
      homeworkError,
      updateHomework,
      removeHomework,
      notices,
      dismissNotices,
    ],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveConnection {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}

/** Calls `handler` on every homework event (assigned, sent, checked: by anyone, in any tab). */
export function useHomeworkEvent(handler: (event: HomeworkEvent) => void): void {
  const { socket } = useLive();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (event: HomeworkEvent) => latest.current(event);
    socket.on('homework', listener);
    return () => {
      socket.off('homework', listener);
    };
  }, [socket]);
}

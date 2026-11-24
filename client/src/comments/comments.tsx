import { COMMENT_MAX, type CommentEvent, type LessonComments } from '@cuadrilo/shared/comments';
import { Textarea } from '@mantine/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import './comments.css';

/**
 * The teacher's comments under a student's answers (shared/src/comments.ts):
 * the student's page loads them and follows the teacher's changes (the
 * `comment` event of /live); the teacher's page shows one student's comments
 * as a field under each answer block and saves what is typed.
 */

interface CommentsContextValue {
  /** The comment under an answer block ('' while there is none). */
  of: (blockId: string) => string;
  /** The teacher's page: sets the comment (rejects with the server's message). */
  save?: (blockId: string, text: string) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

/** Loads comments and keeps them up to date from the socket; `matches` tells which events are for this page. */
function useComments(key: string, load: () => Promise<LessonComments>, matches: (event: CommentEvent) => boolean) {
  const { socket } = useLive();
  const [all, setAll] = useState<LessonComments>({});
  // The page's own loader and filter change with its props: the effects below follow `deps`.
  const loadRef = useRef(load);
  loadRef.current = load;
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the lesson and student the loader is for.
  useEffect(() => {
    let current = true;
    setAll({});
    loadRef.current().then(
      (loaded) => current && setAll(loaded),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [key]);

  useEffect(() => {
    if (!socket) return;
    const onComment = (event: CommentEvent) => {
      if (!matchesRef.current(event)) return;
      setAll((current) => {
        const { [event.blockId]: _, ...rest } = current;
        return event.text === '' ? rest : { ...rest, [event.blockId]: event.text };
      });
    };
    socket.on('comment', onComment);
    return () => {
      socket.off('comment', onComment);
    };
  }, [socket]);

  return [all, setAll] as const;
}

/** Student's lesson page: the comments to them, read-only. */
export function StudentComments({ lessonId, children }: { lessonId: number; children: ReactNode }) {
  const [all] = useComments(
    `${lessonId}`,
    () => api.getLessonComments(lessonId),
    (event) => event.lessonId === lessonId,
  );
  const value = useMemo<CommentsContextValue>(() => ({ of: (blockId) => all[blockId] ?? '' }), [all]);
  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
}

/** Teacher's page: the comments to one student, which the teacher can write. */
function TeacherComments({
  lessonId,
  studentId,
  children,
}: {
  lessonId: number;
  studentId: number;
  children: ReactNode;
}) {
  const [all, setAll] = useComments(
    `${lessonId}/${studentId}`,
    () => api.getStudentComments(lessonId, studentId),
    (event) => event.lessonId === lessonId && event.studentId === studentId,
  );

  const save = useCallback(
    async (blockId: string, text: string) => {
      const saved = await api.saveComment(lessonId, studentId, blockId, text);
      setAll((current) => {
        const { [blockId]: _, ...rest } = current;
        return saved.text === '' ? rest : { ...rest, [blockId]: saved.text };
      });
    },
    [lessonId, studentId, setAll],
  );

  const value = useMemo<CommentsContextValue>(() => ({ of: (blockId) => all[blockId] ?? '', save }), [all, save]);
  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
}

/** The comments to a student when there is a lesson and a student; plain children otherwise. */
export function MaybeComments({
  lessonId,
  studentId,
  children,
}: {
  lessonId: number | null | undefined;
  studentId: number | undefined;
  children: ReactNode;
}) {
  if (lessonId === null || lessonId === undefined || studentId === undefined) return children;
  return (
    <TeacherComments lessonId={lessonId} studentId={studentId}>
      {children}
    </TeacherComments>
  );
}

const SAVE_DELAY_MS = 800;

/** The teacher's field: a plain textarea, saved a moment after typing stops and on leaving it. */
function CommentField({
  blockId,
  text,
  save,
}: {
  blockId: string;
  text: string;
  save: NonNullable<CommentsContextValue['save']>;
}) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string>();
  const focused = useRef(false);
  const saved = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Changed elsewhere (another tab, another teacher): follow it, unless the teacher is typing here.
  useEffect(() => {
    saved.current = text;
    if (!focused.current) setDraft(text);
  }, [text]);

  const flush = useCallback(
    (value: string) => {
      clearTimeout(timer.current);
      if (value === saved.current) return;
      saved.current = value;
      save(blockId, value).then(
        () => setError(undefined),
        (e: unknown) => {
          saved.current = text;
          setError(e instanceof Error ? e.message : String(e));
        },
      );
    },
    [save, blockId, text],
  );

  // Leaving the page with unsaved typing: save it.
  const latest = useRef({ draft, flush });
  latest.current = { draft, flush };
  useEffect(() => () => latest.current.flush(latest.current.draft), []);

  return (
    <Textarea
      className="comment-field"
      aria-label={t('comments.teacherLabel')}
      placeholder={t('comments.placeholder')}
      value={draft}
      error={error}
      autosize
      minRows={1}
      maxLength={COMMENT_MAX}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const value = e.currentTarget.value;
        setDraft(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(value), SAVE_DELAY_MS);
      }}
      onBlur={(e) => {
        focused.current = false;
        flush(e.currentTarget.value);
      }}
    />
  );
}

/**
 * Under an answer block: the teacher's field (teacher's page), or the comment
 * as read-only text, and nothing at all when there is none (student's page).
 */
export function BlockComment({ blockId }: { blockId: string }) {
  const ctx = useContext(CommentsContext);
  if (!ctx) return null;
  const text = ctx.of(blockId);
  if (ctx.save) return <CommentField blockId={blockId} text={text} save={ctx.save} />;
  if (text === '') return null;
  return (
    <div className="comment-note">
      <div className="comment-note-title">{t('comments.fromTeacher')}</div>
      <div className="comment-note-text">{text}</div>
    </div>
  );
}

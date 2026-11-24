import type { LessonUpdatedEvent } from '@cuadrilo/shared/api';
import { homeworkContent, type LessonContent } from '@cuadrilo/shared/lesson';
import { Box, Group, Text } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { api, type Homework, type Lesson } from '../api';
import { useUser } from '../auth';
import { BoardPanel } from '../board/BoardPanel';
import { StudentComments } from '../comments/comments';
import { HomeworkSubmit } from '../components/HomeworkWidget';
import { SideDock } from '../components/SideDock';
import { TranslatorArea } from '../components/Translator';
import { ErrorAlert, Hint, LinkButton, PageHeader } from '../components/ui';
import { SaveIndicator } from '../editor/SaveIndicator';
import { useLessonDocument } from '../editor/useLessonDocument';
import { StudentHighlights } from '../exercises/highlights';
import { StudentSync, sendOverHttp } from '../exercises/sync';
import { WheelSync } from '../exercises/wheelSync';
import { t } from '../i18n';
import { ExerciseModes, TEACHER_EDIT_MODES } from '../lesson/exerciseModes';
import { LessonUpdatedNotice } from '../lesson/LessonUpdatedNotice';
import { LessonView } from '../lesson/LessonView';
import { scrollToItem, useVisibleItem } from '../lesson/live';
import { useChapterFromUrl } from '../lesson/useChapterFromUrl';
import { useLive } from '../liveConnection';
import { lessonEditorPath, lessonPath, lessonsPath } from '../paths';

const FLASH_MS = 2400;

export default function LessonPlayer() {
  const lessonId = Number(useParams().id);
  const isTeacher = useUser().role === 'teacher';
  const [lesson, setLesson] = useState<Lesson>();
  const [error, setError] = useState<string>();

  // Another lesson in the address: a late answer for the one left must not replace it.
  useEffect(() => {
    let current = true;
    setError(undefined);
    api.getLesson(lessonId).then(
      (loaded) => current && setLesson(loaded),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [lessonId]);

  // Student: the teacher opened chapters; the lesson is loaded again (the answers on the page stay).
  const { socket } = useLive();
  useEffect(() => {
    if (!socket || isTeacher) return;
    let current = true;
    const onUpdated = (event: LessonUpdatedEvent) => {
      if (event.lessonId === lessonId && event.reason === 'access') {
        api.getLesson(lessonId).then(
          (loaded) => current && setLesson(loaded),
          () => {},
        );
      }
    };
    socket.on('lessonUpdated', onUpdated);
    return () => {
      current = false;
      socket.off('lessonUpdated', onUpdated);
    };
  }, [socket, lessonId, isTeacher]);

  return (
    <section>
      <ErrorAlert error={error} />
      {lesson?.content &&
        (isTeacher ? (
          <TeacherPreview lesson={lesson} />
        ) : (
          // One page per lesson: the answer sender (StudentSync) and the saved states are bound to the lesson they
          // were made for; without the key, going to another lesson in the app sent its answers to the old one (404).
          <StudentLesson key={lesson.id} lesson={lesson} content={lesson.content} />
        ))}
    </section>
  );
}

/** Teacher opening the lesson: works locally, nothing is sent. */
function TeacherPreview({ lesson }: { lesson: Lesson }) {
  const { content: doc, editExercise, autosave } = useLessonDocument(lesson);
  const content = doc ?? lesson.content;
  const [chapterIndex, setChapterIndex] = useChapterFromUrl(lessonPath(lesson.id), content.chapters.length);
  return (
    <>
      <PageHeader title={lesson.title} back={{ to: lessonsPath, label: t('nav.lessons') }}>
        <LinkButton to={`${lessonEditorPath(lesson.id)}/${chapterIndex + 1}`} leftSection={<IconPencil size={16} />}>
          {t('teacherHome.edit')}
        </LinkButton>
      </PageHeader>
      <Group justify="space-between" mb="md">
        <Hint>{t('lesson.preview')}</Hint>
        {autosave.status !== 'saved' && (
          <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.saveNow()} />
        )}
      </Group>
      <TranslatorArea>
        <ExerciseModes defaultMode="teacher" available={TEACHER_EDIT_MODES}>
          <LessonView
            content={content}
            chapterIndex={chapterIndex}
            onChapterChange={setChapterIndex}
            editing={{ editExercise }}
          />
        </ExerciseModes>
      </TranslatorArea>
    </>
  );
}

/**
 * Student: answers are restored after a reload and sent on every change; the
 * page reports where the student is and follows the teacher's "show to the
 * student" (opens the chapter, scrolls to the exercise and highlights it).
 */
function StudentLesson({ lesson, content: fullContent }: { lesson: Lesson; content: LessonContent }) {
  const { socket, studentClass, homework: allHomework, updateHomework } = useLive();
  // In a class on this lesson: the teacher sees where the student is and may show them an exercise.
  const inClass = studentClass?.lessonId === lesson.id;
  const [states, setStates] = useState<Record<string, unknown>>();
  const [error, setError] = useState<string>();
  const homeworkParam = Number(useSearchParams()[0].get('homework'));
  // This lesson's homework (the shared list follows every change live) and,
  // in the same pass, the exercises of the ones not yet accepted: marked in the lesson.
  const { homework: lessonHomework, homeworkItemIds } = useMemo(() => {
    const ofLesson: Homework[] = [];
    const ids = new Set<string>();
    for (const hw of allHomework ?? []) {
      if (hw.lessonId !== lesson.id) continue;
      ofLesson.push(hw);
      if (hw.status !== 'accepted') for (const e of hw.exercises) ids.add(e.id);
    }
    return { homework: ofLesson, homeworkItemIds: ids };
  }, [allHomework, lesson.id]);
  // ?homework=<id>: the homework is the lesson with only its exercises. An
  // unknown id (deleted homework) or one with no exercises left opens the whole lesson.
  const { openHomework, content } = useMemo(() => {
    const hw = lessonHomework.find((h) => h.id === homeworkParam);
    const part = hw && homeworkContent(fullContent, new Set(hw.exercises.map((e) => e.id)));
    return part && part.chapters.length > 0
      ? { openHomework: hw, content: part }
      : { openHomework: undefined, content: fullContent };
  }, [fullContent, lessonHomework, homeworkParam]);
  // The homework list is not there yet: do not flash the whole lesson first.
  const waitingForHomework = !!homeworkParam && !allHomework;
  const [chapterIndex, setChapterIndex] = useChapterFromUrl(lessonPath(lesson.id), content.chapters.length);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [flashItemId, setFlashItemId] = useState<string>();
  // An item to scroll to once its chapter is rendered.
  const pendingScroll = useRef<string | null>(null);
  const chapter = content.chapters[chapterIndex];
  // Why answers are not being saved, while they are not: said on the page (otherwise the student would learn it after a reload).
  const [saveError, setSaveError] = useState<string>();
  const send = useMemo(
    () => sendOverHttp(lesson.id, (e) => setSaveError(e ? e.message || e.name : undefined)),
    [lesson.id],
  );

  useEffect(() => {
    api.getLessonStates(lesson.id).then(
      (saved) => setStates(Object.fromEntries(Object.entries(saved).map(([blockId, s]) => [blockId, s.state]))),
      (e: Error) => setError(e.message),
    );
  }, [lesson.id]);

  // Position: chapter + item in view, sent when it changes (and on reconnect).
  const position = useRef<{ chapterId: string; itemId: string | null; itemIds: string[] }>({
    chapterId: chapter.id,
    itemId: null,
    itemIds: [],
  });
  const sendPosition = useCallback(
    () => socket?.emit('position', { lessonId: lesson.id, ...position.current }),
    [socket, lesson.id],
  );
  useVisibleItem(box, chapter.id, (itemIds) => {
    const itemId = itemIds[0] ?? null;
    // A homework is one page: the item's own chapter in the lesson is what the teacher sees.
    const own = fullContent.chapters.find((c) => c.exercises.some((e) => e.id === itemId));
    position.current = { chapterId: own?.id ?? chapter.id, itemId, itemIds };
    sendPosition();
  });
  useEffect(() => {
    if (!socket) return;
    socket.on('connect', sendPosition);
    if (socket.connected) sendPosition();
    return () => {
      socket.off('connect', sendPosition);
      // Left the lesson page (the socket stays open on other pages).
      socket.emit('position', { lessonId: null });
    };
  }, [socket, sendPosition]);

  // A class that is on opens this lesson in the chapter the teacher is in (unless the address already names a chapter).
  const classChapterId = inClass ? studentClass?.chapterId : null;
  const chapterInUrl = !!useParams().chapter;
  const openedClassChapter = useRef<string | null>(null);
  useEffect(() => {
    if (!classChapterId || chapterInUrl || openedClassChapter.current === classChapterId || openHomework) return;
    openedClassChapter.current = classChapterId;
    const index = content.chapters.findIndex((c) => c.id === classChapterId);
    if (index > 0) setChapterIndex(index);
  }, [classChapterId, chapterInUrl, openHomework, content, setChapterIndex]);

  /** Opens a chapter and scrolls to the item in it (or to the top). */
  const goTo = useCallback(
    (index: number, itemId: string | null) => {
      if (index < 0) return;
      pendingScroll.current = itemId;
      setChapterIndex(index);
      if (!itemId) window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setChapterIndex],
  );

  // The teacher shows a chapter / exercise.
  useEffect(() => {
    if (!socket) return;
    const onNavigate = (target: { chapterId: string; itemId: string | null }) => {
      const { chapterId, itemId } = target;
      // By the exercise when there is one: a homework has no chapters of the lesson.
      const index = content.chapters.findIndex((c) =>
        itemId ? c.exercises.some((e) => e.id === itemId) : c.id === chapterId && !c.locked,
      );
      // The chapter was just opened to the student: the lesson comes again in a moment, then it is shown.
      if (index < 0) pendingNavigate.current = target;
      else goTo(index, itemId);
    };
    socket.on('navigate', onNavigate);
    return () => {
      socket.off('navigate', onNavigate);
    };
  }, [socket, content, goTo]);
  const pendingNavigate = useRef<{ chapterId: string; itemId: string | null } | null>(null);
  useEffect(() => {
    const target = pendingNavigate.current;
    if (!target) return;
    const index = content.chapters.findIndex((c) =>
      target.itemId ? c.exercises.some((e) => e.id === target.itemId) : c.id === target.chapterId && !c.locked,
    );
    if (index < 0) return;
    pendingNavigate.current = null;
    goTo(index, target.itemId);
  }, [content, goTo]);

  // After a render with the chapter open: scroll to the shown item and highlight it.
  useEffect(() => {
    const itemId = pendingScroll.current;
    if (!itemId) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollToItem(itemId));
    setFlashItemId(itemId);
  });

  useEffect(() => {
    if (!flashItemId) return;
    const timer = setTimeout(() => setFlashItemId(undefined), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashItemId]);

  return (
    <>
      <PageHeader
        title={lesson.title}
        back={
          openHomework
            ? { to: '/homework', label: t('studentHome.homework') }
            : { to: lessonsPath, label: t('lesson.back') }
        }
      />
      <LessonUpdatedNotice lessonId={lesson.id} />
      <ErrorAlert error={error} />
      {/* Stays in view while the page is scrolled: a student must not go on answering without knowing they are not saved. */}
      <div className="sticky-notice">
        <ErrorAlert error={saveError && t('lesson.notSaved', { error: saveError })} />
      </div>
      {openHomework && <Hint mb="md">{t('lesson.homeworkOnly')}</Hint>}
      {/* Answers are saved over HTTP; the socket is only for the live class. */}
      {states && !waitingForHomework && (
        <div className={inClass ? 'player-layout docked' : undefined}>
          {inClass && (
            <SideDock>
              <BoardPanel boardId={studentClass?.boardId ?? null} canWrite translate />
            </SideDock>
          )}
          <div ref={setBox}>
            <StudentSync send={send} initial={states}>
              <StudentHighlights lessonId={lesson.id}>
                <StudentComments lessonId={lesson.id}>
                  <WheelSync lessonId={lesson.id} active={inClass}>
                    <TranslatorArea lessonId={lesson.id}>
                      <LessonView
                        content={content}
                        chapterIndex={chapterIndex}
                        onChapterChange={setChapterIndex}
                        flashItemId={flashItemId}
                        homeworkItemIds={openHomework ? undefined : homeworkItemIds}
                        numberedFrom={openHomework ? fullContent : undefined}
                      />
                    </TranslatorArea>
                  </WheelSync>
                </StudentComments>
              </StudentHighlights>
            </StudentSync>
            {chapter.exercises.length === 0 && <Text c="dimmed">{t('lesson.emptyChapter')}</Text>}
            {openHomework && (
              <Box mt="xl">
                <HomeworkSubmit homework={openHomework} onChange={updateHomework} />
              </Box>
            )}
          </div>
        </div>
      )}
    </>
  );
}

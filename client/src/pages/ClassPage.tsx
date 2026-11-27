import type { AnswerEvent, Presence } from '@cuadrilo/shared/api';
import { exerciseNumbers, type LessonContent } from '@cuadrilo/shared/lesson';
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBell,
  IconDots,
  IconMapPin,
  IconNotebook,
  IconPresentation,
  IconUserMinus,
  IconUsers,
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';

import { ApiError, api, type Class, type Lesson, type LessonSummary, type Student } from '../api';
import { BoardPanel } from '../board/BoardPanel';
import { getOrCreate } from '../collections';
import { MaybeComments } from '../comments/comments';
import { SideDock, useSideMode } from '../components/SideDock';
import { StartClassCard } from '../components/StartClassCard';
import { StudentPicker, useGroups } from '../components/StudentPicker';
import { avatarInitials, avatarStyle } from '../components/studentAvatar';
import { TranslatorArea } from '../components/Translator';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, PageHeader } from '../components/ui';
import { SaveIndicator } from '../editor/SaveIndicator';
import { useLessonDocument } from '../editor/useLessonDocument';
import { MaybeHighlights } from '../exercises/highlights';
import { createBlockStore, type LiveBlockStore, TeacherSync } from '../exercises/sync';
import { WheelSync } from '../exercises/wheelSync';
import { chapterTitle, t } from '../i18n';
import { ExerciseModes, TEACHER_EDIT_MODES } from '../lesson/exerciseModes';
import { type LessonEditing, LessonView } from '../lesson/LessonView';
import { useLive } from '../liveConnection';

/**
 * Teacher: the live class. Without one, a form to start it. During it: the
 * lesson (it can be changed), the students with where they are (called to the
 * lesson, removed, brought back), the board, and one student's answers live. "Show"
 * opens a chapter or an exercise for every student of the class at once.
 */
export default function ClassPage() {
  const [cls, setCls] = useState<Class | null>();
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api.getCurrentClass(), api.listLessons(), api.listStudents()]).then(
      ([current, l, s]) => {
        setCls(current);
        setLessons(l);
        setStudents(s);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (cls === undefined) return error ? <ErrorAlert error={error} /> : <Hint>{t('common.loading')}</Hint>;
  if (cls === null) {
    return (
      <section>
        <PageHeader title={t('classPage.newClass')} />
        <StartClassCard className="start-class-standalone" lessons={lessons} students={students} onStarted={setCls} />
      </section>
    );
  }
  return <ActiveClass cls={cls} onChange={setCls} lessons={lessons} students={students} />;
}

function ActiveClass({
  cls,
  onChange,
  lessons,
  students,
}: {
  cls: Class;
  onChange: (cls: Class | null) => void;
  lessons: LessonSummary[];
  students: Student[];
}) {
  const { socket, connected } = useLive();
  const groups = useGroups();
  const [lesson, setLesson] = useState<Lesson>();
  const [presence, setPresence] = useState<Map<number, Presence>>(new Map());
  const [selectedId, setSelectedId] = useState<number>();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setLesson(undefined);
    if (cls.lessonId !== null) api.getLesson(cls.lessonId).then(setLesson, (e: Error) => setError(e.message));
  }, [cls.lessonId]);

  // The selected student: the first one by default, another one if they leave the class.
  useEffect(() => {
    if (!cls.students.some((s) => s.id === selectedId)) setSelectedId(cls.students[0]?.id);
  }, [cls.students, selectedId]);

  // Where the students are: the list on (re)connect and when the class changes, then each change.
  const studentKey = cls.students.map((s) => s.id).join();
  const stores = useStudentAnswers(
    socket,
    connected,
    cls.lessonId,
    cls.students.map((s) => s.id),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list is asked for again when the students or the lesson change.
  useEffect(() => {
    if (!socket) return;
    const load = () =>
      socket.emit('presence', (list: Presence[]) => setPresence(new Map(list.map((p) => [p.studentId, p]))));
    // The server repeats a position at every move of the student; an unchanged one is not a change of the page.
    const onPresence = (p: Presence) =>
      setPresence((map) => {
        const known = map.get(p.studentId);
        return known && JSON.stringify(known) === JSON.stringify(p) ? map : new Map(map).set(p.studentId, p);
      });
    socket.on('connect', load);
    socket.on('presence', onPresence);
    if (socket.connected) load();
    return () => {
      socket.off('connect', load);
      socket.off('presence', onPresence);
    };
  }, [socket, studentKey, cls.lessonId]);

  /** A change of the class; if it ended meanwhile (another tab, or by itself), the page shows the current state. */
  const act = useCallback(
    async (action: () => Promise<Class | null>) => {
      setError(undefined);
      try {
        onChange(await action());
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_found') return onChange(await api.getCurrentClass());
        setError((e as Error).message);
      }
    },
    [onChange],
  );

  const end = async () => {
    await act(async () => {
      await api.endClass(cls.id);
      return null;
    });
    setEnding(false);
  };

  /** "Show": the chapter (and exercise) opens for every student of the class. */
  const showToAll = useCallback(
    (chapterId: string, itemId?: string) => {
      for (const student of cls.students) socket?.emit('navigate', { studentId: student.id, chapterId, itemId });
    },
    [cls.students, socket],
  );
  const anyoneInLesson = cls.students.some((s) => presence.get(s.id)?.inLesson);

  const { content, editExercise, autosave } = useLessonDocument(lesson);
  const editing = useMemo<LessonEditing>(() => ({ editExercise }), [editExercise]);
  const selected = cls.students.find((s) => s.id === selectedId);
  // The lesson below is memoised: what it gets must keep its identity while nothing about it changed
  // (a student's presence, the notices, a line on the board render this page, not the lesson).
  const selectedStudentId = selected?.id;
  const selectedLogin = selected?.login;
  const selectedStudent = useMemo(
    () =>
      selectedStudentId === undefined || selectedLogin === undefined
        ? undefined
        : { id: selectedStudentId, login: selectedLogin },
    [selectedStudentId, selectedLogin],
  );
  const studentLogins = useMemo(() => cls.students.map((s) => s.login), [cls.students]);
  const setHomework = useCallback(
    (exerciseId: string) => act(() => api.setClassHomework(cls.id, exerciseId)),
    [act, cls.id],
  );
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);

  return (
    <section>
      {/* The lesson's select is the page's title: the name is in one place, and the lesson is changed there. */}
      <div className="class-bar">
        <Select
          className="class-bar-lesson"
          aria-label={t('classPage.changeLesson')}
          data={lessons.map((l) => ({ value: String(l.id), label: l.title }))}
          value={cls.lessonId !== null ? String(cls.lessonId) : null}
          placeholder={t('classPage.chooseLesson')}
          onChange={(value) => value && act(() => api.changeClassLesson(cls.id, Number(value)))}
          allowDeselect={false}
          searchable
          size="md"
          styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
        />
        <div className="class-bar-actions">
          {/* Only while something is being saved or failed: edits made in an exercise's editing mode. */}
          {autosave.status !== 'saved' && (
            <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.saveNow()} />
          )}
          {!connected && (
            <Badge color="gray" variant="light">
              {t('classPage.offline')}
            </Badge>
          )}
          {/* "Show the chapter to everyone" joins the buttons from the lesson below. */}
          <span ref={setBarSlot} className="class-bar-slot" />
          <Button color="red" variant="light" onClick={() => setEnding(true)}>
            {t('classPage.end')}
          </Button>
        </div>
      </div>
      <ErrorAlert error={error} />

      <div className="player-layout docked">
        <SideDock>
          <StudentsCard
            cls={cls}
            students={students}
            groupStudentIds={groups.find((g) => g.id === cls.groupId)?.studentIds ?? []}
            presence={presence}
            content={content}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCall={(studentId) => socket?.emit('call', { studentId })}
            onRemove={(studentId) => act(() => api.removeClassStudent(cls.id, studentId))}
            onAdd={(studentIds) =>
              act(async () => {
                let updated: Class = cls;
                for (const studentId of studentIds) updated = await api.addClassStudent(cls.id, studentId);
                return updated;
              })
            }
          />
          <BoardPanel boardId={cls.boardId} canWrite canDelete translate />
        </SideDock>
        <div>
          {cls.lessonId === null && <Text c="dimmed">{t('classPage.lessonGone')}</Text>}
          {content && (
            <LiveLesson
              // Another lesson: fresh blocks. Another student: the same blocks, another store of answers.
              key={cls.lessonId}
              lessonId={cls.lessonId}
              content={content}
              store={stores.of(selectedId)}
              student={selectedStudent}
              presence={selectedId !== undefined ? presence.get(selectedId) : undefined}
              initialChapterId={
                cls.chapterId ?? (selectedId !== undefined ? presence.get(selectedId)?.chapterId : undefined)
              }
              canShow={anyoneInLesson}
              onShow={showToAll}
              homeworkIds={cls.homeworkExerciseIds}
              studentLogins={studentLogins}
              onSetHomework={setHomework}
              editing={editing}
              barSlot={barSlot}
            />
          )}
        </div>
      </div>

      <Modal
        opened={ending}
        onClose={() => setEnding(false)}
        title={<DialogTitle>{t('classPage.endTitle')}</DialogTitle>}
        centered
      >
        <Text size="sm">{t('classPage.endText')}</Text>
        <DialogButtons onCancel={() => setEnding(false)}>
          <Button onClick={end}>{t('classPage.end')}</Button>
        </DialogButtons>
      </Modal>
    </section>
  );
}

/** "Cap. 2 · ej. 5" for a student's position in the lesson. */
function positionLabel(content: LessonContent | undefined) {
  const numbers = content ? exerciseNumbers(content) : new Map<string, number>();
  return (p: Presence) => {
    const index = content?.chapters.findIndex((c) => c.id === p.chapterId) ?? -1;
    if (index < 0) return '';
    // Everything on the student's screen: "ej. 4–5" when it holds several exercises.
    const seen = p.itemIds.flatMap((id) => numbers.get(id) ?? []);
    if (seen.length === 0) return t('classPage.placeChapter', { chapter: index + 1 });
    const [from, to] = [Math.min(...seen), Math.max(...seen)];
    return t('classPage.place', { chapter: index + 1, exercise: from === to ? String(from) : `${from}–${to}` });
  };
}

/** The students of the class: where each one is; select one to see their answers. */
function StudentsCard({
  cls,
  students,
  groupStudentIds,
  presence,
  content,
  selectedId,
  onSelect,
  onCall,
  onRemove,
  onAdd,
}: {
  cls: Class;
  students: Student[];
  /** The students of the class's group (none for a class of one student): only they can be brought into the class. */
  groupStudentIds: number[];
  presence: Map<number, Presence>;
  content: LessonContent | undefined;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
  onCall: (id: number) => void;
  onRemove: (id: number) => void;
  onAdd: (ids: number[]) => void;
}) {
  const describe = useMemo(() => positionLabel(content), [content]);
  const { layout } = useSideMode();
  // The page keeps clear of the phone's column of students (styles.css asks by this attribute on <html>).
  const railOn = layout === 'sheet';
  useLayoutEffect(() => {
    if (!railOn) return;
    const root = document.documentElement;
    root.dataset.dockRail = '';
    return () => {
      delete root.dataset.dockRail;
    };
  }, [railOn]);
  const [studentsOpen, { open: openStudents, close: closeStudents }] = useDisclosure(false);
  const inClass = new Set(cls.students.map((s) => s.id));
  const inGroup = new Set(groupStudentIds);
  const addable = students.filter((s) => inGroup.has(s.id) && !inClass.has(s.id));

  const whereOf = (id: number) => {
    const p = presence.get(id);
    const state = p?.inLesson ? 'in-lesson' : p?.online ? 'online' : 'offline';
    const where = p?.inLesson ? describe(p) : p?.online ? t('classPage.outsideLesson') : t('classPage.offlineStudent');
    return { state, where };
  };

  const rows = (
    <>
      {cls.students.length === 0 && (
        <Text size="sm" c="dimmed" mb="xs">
          {t('classPage.noStudents')}
        </Text>
      )}
      <Stack gap={2} mb="xs">
        {cls.students.map((s) => {
          const { state, where } = whereOf(s.id);
          return (
            <Group
              key={s.id}
              gap={4}
              wrap="nowrap"
              className={`class-student ${selectedId === s.id ? 'selected' : ''}`}
            >
              <UnstyledButton
                className="class-student-main"
                onClick={() => {
                  onSelect(s.id);
                  closeStudents();
                }}
                aria-pressed={selectedId === s.id}
              >
                <Group gap="xs" wrap="nowrap">
                  <span className={`presence-dot ${state}`} aria-hidden />
                  <div>
                    <Text size="sm" fw={600}>
                      {s.login}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {where}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
              {state === 'online' && (
                <Tooltip label={t('classPage.call')}>
                  <ActionIcon variant="light" onClick={() => onCall(s.id)} aria-label={t('classPage.call')}>
                    <IconBell size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={t('classPage.actions', { login: s.login })}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item color="red" leftSection={<IconUserMinus size={16} />} onClick={() => onRemove(s.id)}>
                    {t('classPage.remove')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          );
        })}
      </Stack>
      {addable.length > 0 && <AddStudents students={addable} onAdd={onAdd} />}
    </>
  );

  // A phone: a narrow column of the students floats at the right edge, one tap switches the view to a student.
  // Calling, removing and adding are in the full list, which opens from the first button.
  if (layout === 'sheet') {
    return (
      <>
        <div className="dock-rail">
          <Tooltip label={t('classPage.studentsCount', { count: cls.students.length })} position="left">
            <ActionIcon
              variant="light"
              color="gray"
              radius="xl"
              size={36}
              onClick={openStudents}
              aria-label={t('classPage.students')}
            >
              <IconUsers size={18} />
            </ActionIcon>
          </Tooltip>
          {cls.students.map((s) => {
            const { state, where } = whereOf(s.id);
            return (
              <UnstyledButton
                key={s.id}
                className={`rail-item ${selectedId === s.id ? 'selected' : ''}`}
                onClick={() => onSelect(s.id)}
                aria-pressed={selectedId === s.id}
                aria-label={`${s.login} · ${where}`}
                title={`${s.login} · ${where}`}
              >
                <span className="rail-avatar" style={avatarStyle(s.login)}>
                  {avatarInitials(s.login)}
                  <span className={`presence-dot ${state}`} aria-hidden />
                </span>
                <span className="rail-name">{s.login}</span>
              </UnstyledButton>
            );
          })}
        </div>
        <Drawer
          opened={studentsOpen}
          onClose={closeStudents}
          position="right"
          size="sm"
          title={t('classPage.studentsCount', { count: cls.students.length })}
        >
          {rows}
        </Drawer>
      </>
    );
  }

  return (
    <Paper p="sm" className="card-edge">
      <Title order={5} mb="xs">
        {t('classPage.studentsCount', { count: cls.students.length })}
      </Title>
      {rows}
    </Paper>
  );
}

/**
 * The answers of every student of the class in the lesson, one store each:
 * loaded once and kept live (answer events), so switching students is instant.
 * A new lesson starts from scratch.
 */
function useStudentAnswers(
  socket: Socket | undefined,
  connected: boolean,
  lessonId: number | null,
  studentIds: number[],
) {
  // A new lesson starts from empty stores.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lessonId is the reset trigger.
  const stores = useMemo(() => new Map<number, LiveBlockStore>(), [lessonId]);
  // Students whose saved answers are loaded (or loading); a live answer may create a store before that.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lessonId is the reset trigger.
  const loaded = useMemo(() => new Set<number>(), [lessonId]);
  const [empty] = useState(() => createBlockStore({}));
  const storeOf = useCallback((id: number) => getOrCreate(stores, id, () => createBlockStore({})), [stores]);

  // Live answers of everyone in the class.
  useEffect(() => {
    if (!socket) return;
    // Live: the teacher sees the celebration when the student completes an element now.
    const onAnswer = (event: AnswerEvent) => storeOf(event.studentId).set(event.blockId, event.state, true);
    socket.on('answer', onAnswer);
    return () => {
      socket.off('answer', onAnswer);
    };
  }, [socket, storeOf]);

  // The socket was down for a while: the answers made meanwhile were not heard, so they are loaded again.
  const [reloads, setReloads] = useState(0);
  const dropped = useRef(false);
  useEffect(() => {
    if (!connected) {
      dropped.current = true;
      return;
    }
    if (!dropped.current) return;
    dropped.current = false;
    loaded.clear();
    setReloads((n) => n + 1);
  }, [connected, loaded]);

  // Saved answers of each student (once per lesson; students added later are loaded when they come).
  const key = studentIds.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: studentIds is a new array on every render; key stands for it.
  useEffect(() => {
    if (lessonId === null) return;
    for (const id of studentIds) {
      if (loaded.has(id)) continue;
      loaded.add(id);
      const store = storeOf(id);
      api.getStudentLessonStates(lessonId, id).then(
        (states) =>
          Object.entries(states).forEach(([blockId, saved]) => {
            // A live answer that came meanwhile is newer: keep it. After a reconnect the saved one is the newer.
            if (reloads > 0 || store.get(blockId) === undefined) store.set(blockId, saved.state);
          }),
        () => loaded.delete(id),
      );
    }
  }, [lessonId, key, storeOf, loaded, reloads]);

  return { of: (id: number | undefined) => (id === undefined ? empty : storeOf(id)) };
}

/**
 * The lesson with one student's answers (read-only, updated live). Switching
 * students only swaps the store: the open chapter and the scroll stay. "Show"
 * buttons open a chapter or an exercise for everyone in the class.
 */
const LiveLesson = memo(function LiveLesson({
  lessonId,
  content,
  store,
  student,
  presence,
  initialChapterId,
  canShow,
  onShow,
  homeworkIds,
  studentLogins,
  onSetHomework,
  editing,
  barSlot,
}: {
  lessonId: number | null;
  content: LessonContent;
  store: LiveBlockStore;
  student: { id: number; login: string } | undefined;
  presence: Presence | undefined;
  initialChapterId: string | null | undefined;
  canShow: boolean;
  onShow: (chapterId: string, itemId?: string) => void;
  /** Exercises of this lesson already set as homework in this class. */
  homeworkIds: string[];
  /** The students of the class: who gets a homework set now. */
  studentLogins: string[];
  onSetHomework: (exerciseId: string) => Promise<void>;
  editing: LessonEditing;
  /** Where the "show" button goes: the page's top bar. */
  barSlot: HTMLElement | null;
}) {
  // The exercise the teacher is about to set as homework (the dialog asks first: a click next to "show" must not send it).
  const [assigning, setAssigning] = useState<{ id: string; number: number }>();
  const homeworkSet = useMemo(() => new Set(homeworkIds), [homeworkIds]);
  const numbers = useMemo(() => exerciseNumbers(content), [content]);
  // The teacher's own chapter; starts where the first selected student is.
  const [chapterIndex, setChapterIndex] = useState(() =>
    Math.max(
      0,
      content.chapters.findIndex((c) => c.id === initialChapterId),
    ),
  );
  const chapter = content.chapters[chapterIndex];
  // The chapter the teacher has open is where the group / student stop: the server keeps it.
  const { socket, connected } = useLive();
  const chapterId = chapter?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `connected`: said again after a reconnect.
  useEffect(() => {
    if (lessonId !== null && chapterId) socket?.emit('chapter', { lessonId, chapterId });
  }, [socket, connected, lessonId, chapterId]);
  const showHint = canShow ? undefined : t('classPage.nobodyInLesson');
  const here = presence?.inLesson ? presence : undefined;

  return (
    <>
      {barSlot &&
        createPortal(
          <Tooltip label={showHint} disabled={!showHint}>
            <Button
              className="class-bar-show"
              variant="light"
              leftSection={<IconPresentation size={16} />}
              disabled={!canShow}
              onClick={() => onShow(chapter.id)}
            >
              {t('classPage.showChapter', { chapter: chapterTitle(chapter, chapterIndex) })}
            </Button>
          </Tooltip>,
          barSlot,
        )}
      {/* A click on a word shows its translation (the teacher cannot save words: that is the student's vocabulary). */}
      <TranslatorArea>
        <MaybeHighlights lessonId={lessonId} studentId={student?.id}>
          <MaybeComments lessonId={lessonId} studentId={student?.id}>
            <WheelSync lessonId={lessonId ?? 0} active={lessonId !== null}>
              <TeacherSync store={store}>
                <ExerciseModes defaultMode="teacher" available={TEACHER_EDIT_MODES}>
                  <LessonView
                    content={content}
                    chapterIndex={chapterIndex}
                    onChapterChange={setChapterIndex}
                    editing={editing}
                    chapterLabel={(c) =>
                      here?.chapterId === c.id && student ? (
                        <Tooltip label={t('classPage.here', { login: student.login })}>
                          <IconMapPin size={14} color="var(--mantine-primary-color-7)" />
                        </Tooltip>
                      ) : null
                    }
                    homeworkItemIds={homeworkSet}
                    itemActions={(c, item) => (
                      <>
                        {here?.itemIds.includes(item.id) && student && (
                          <Badge variant="light" size="sm">
                            {t('classPage.here', { login: student.login })}
                          </Badge>
                        )}
                        <Tooltip label={showHint ?? t('classPage.showItem')}>
                          <ActionIcon
                            variant="light"
                            aria-label={t('classPage.showItem')}
                            disabled={!canShow}
                            onClick={() => onShow(c.id, item.id)}
                          >
                            <IconPresentation size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip
                          label={
                            homeworkSet.has(item.id)
                              ? t('classPage.homeworkSet')
                              : studentLogins.length === 0
                                ? t('classPage.noStudents')
                                : t('classPage.setHomework')
                          }
                        >
                          <ActionIcon
                            variant="light"
                            color="orange"
                            aria-label={t('classPage.setHomework')}
                            disabled={homeworkSet.has(item.id) || studentLogins.length === 0}
                            onClick={() => setAssigning({ id: item.id, number: numbers.get(item.id) ?? 0 })}
                          >
                            <IconNotebook size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                  />
                </ExerciseModes>
              </TeacherSync>
            </WheelSync>
          </MaybeComments>
        </MaybeHighlights>
      </TranslatorArea>
      <Modal
        opened={assigning !== undefined}
        onClose={() => setAssigning(undefined)}
        title={<DialogTitle>{t('classPage.homeworkTitle', { number: assigning?.number ?? 0 })}</DialogTitle>}
        centered
      >
        <Text size="sm">{t('classPage.homeworkText', { students: studentLogins.join(', ') })}</Text>
        <DialogButtons onCancel={() => setAssigning(undefined)}>
          <Button
            onClick={() => {
              if (assigning) void onSetHomework(assigning.id);
              setAssigning(undefined);
            }}
          >
            {t('classPage.homeworkSend')}
          </Button>
        </DialogButtons>
      </Modal>
    </>
  );
});

/** "+ Añadir estudiantes": a dialog to pick students of the group to bring (back) into the class. */
function AddStudents({ students, onAdd }: { students: Student[]; onAdd: (ids: number[]) => void }) {
  const [opened, setOpened] = useState(false);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const close = () => {
    setOpened(false);
    setChosen(new Set());
  };

  return (
    <>
      <Button variant="default" size="sm" fullWidth onClick={() => setOpened(true)}>
        + {t('classPage.addStudent')}
      </Button>
      <Modal opened={opened} onClose={close} title={<DialogTitle>{t('classPage.addStudents')}</DialogTitle>} centered>
        <StudentPicker students={students} groups={[]} selected={chosen} onChange={setChosen} autoFocus />
        <DialogButtons onCancel={close}>
          <Button
            disabled={chosen.size === 0}
            onClick={() => {
              onAdd([...chosen]);
              close();
            }}
          >
            {t('classPage.addChosen', { count: chosen.size })}
          </Button>
        </DialogButtons>
      </Modal>
    </>
  );
}

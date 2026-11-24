import { LESSON_TITLE_MAX } from '@cuadrilo/shared/api';
import type { Chapter } from '@cuadrilo/shared/lesson';
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  ActionIcon,
  Anchor,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Notification,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconDots, IconKey, IconPencil, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { api, type Class, type LessonSummary, type Student, type StudentGroup } from '../api';
import { ClassSessionCard } from '../components/ClassSessionCard';
import { SortableItem, useSortSensors } from '../components/Sortable';
import { StudentPicker } from '../components/StudentPicker';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, LinkButton, Row, RowList } from '../components/ui';
import { chapterTitle, formatDate, t } from '../i18n';
import { useLive } from '../liveConnection';
import { matchesQuery } from '../search';
import type { AssignedState } from './AssignHomework';

/** How long "Tarea asignada" stays. */
const TOAST_MS = 6000;

/**
 * Teacher's lessons (`/lessons`): the class (going on, or start one) and the
 * lessons with a quick filter by title. Creating, renaming and deleting a
 * lesson happen in dialogs here. The start page is the dashboard.
 */
export default function TeacherHome() {
  const [lessons, setLessons] = useState<LessonSummary[]>();
  const [cls, setCls] = useState<Class | null>();
  const { homeworkError } = useLive();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LessonSummary | 'new'>();
  const [deleting, setDeleting] = useState<LessonSummary>();
  const [accessOf, setAccessOf] = useState<LessonSummary>();
  // "Tarea asignada a N estudiantes" after coming back from assigning homework.
  const location = useLocation();
  const navigate = useNavigate();
  const [assignedTo, setAssignedTo] = useState(() => (location.state as AssignedState | null)?.assignedTo);
  useEffect(() => {
    if (!assignedTo) return;
    // Not shown again on a reload.
    navigate('.', { replace: true, state: null });
    const timer = setTimeout(() => setAssignedTo(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [assignedTo, navigate]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const fail = (e: Error) => setError(e.message);
    api.listLessons().then(setLessons, fail);
    api.getCurrentClass().then(setCls, fail);
  }, []);

  const shown = useMemo(() => lessons?.filter((l) => matchesQuery(l.title, query)) ?? [], [lessons, query]);
  // Dragging works on the whole list: with a filter on, the order of the shown part would be ambiguous.
  const canSort = query.trim() === '';
  const sensors = useSortSensors();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!lessons || !over || active.id === over.id) return;
    const from = lessons.findIndex((l) => l.id === active.id);
    const to = lessons.findIndex((l) => l.id === over.id);
    const reordered = arrayMove(lessons, from, to);
    setLessons(reordered);
    api.setLessonOrder(reordered.map((l) => l.id)).catch((e: Error) => {
      setError(e.message);
      api.listLessons().then(setLessons, () => {});
    });
  };

  return (
    <Stack gap="xl">
      <ErrorAlert error={error ?? homeworkError} />

      <ClassCard cls={cls} />

      <section>
        <Group justify="space-between" mb="md" gap="sm">
          <Title order={2}>{t('teacherHome.lessons')}</Title>
          <Group gap="sm">
            {lessons && lessons.length > 0 && (
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder={t('teacherHome.search')}
                aria-label={t('teacherHome.search')}
                leftSection={<IconSearch size={16} />}
                w={280}
              />
            )}
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              {t('teacherHome.newLesson')}
            </Button>
          </Group>
        </Group>

        {!lessons && !error && <Hint>{t('common.loading')}</Hint>}
        {lessons?.length === 0 && (
          <Paper className="card-edge" p="lg">
            <Text fw={600}>{t('teacherHome.noLessons')}</Text>
            <Text size="sm" c="dimmed">
              {t('teacherHome.noLessonsHint')}
            </Text>
          </Paper>
        )}
        {lessons && lessons.length > 0 && shown.length === 0 && <Text c="dimmed">{t('teacherHome.noMatches')}</Text>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((l) => l.id)} strategy={verticalListSortingStrategy} disabled={!canSort}>
            <RowList>
              {shown.map((lesson) => (
                <SortableItem key={lesson.id} id={lesson.id} handleLabel={t('teacherHome.drag')} disabled={!canSort}>
                  {(handle) => (
                    <Row
                      leading={handle}
                      actions={
                        <>
                          <LinkButton to={`/lessons/${lesson.id}`}>{t('teacherHome.open')}</LinkButton>
                          <LinkButton to={`/lessons/${lesson.id}/edit`}>{t('teacherHome.edit')}</LinkButton>
                          <LinkButton to={`/lessons/${lesson.id}/homework/new`}>{t('teacherHome.assign')}</LinkButton>
                          <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                              <ActionIcon variant="default" size="lg" aria-label={t('teacherHome.more')}>
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setAccessOf(lesson)}>
                                {t('teacherHome.access')}
                              </Menu.Item>
                              <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setEditing(lesson)}>
                                {t('teacherHome.rename')}
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                onClick={() => setDeleting(lesson)}
                              >
                                {t('teacherHome.delete')}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </>
                      }
                    >
                      <Anchor component={Link} to={`/lessons/${lesson.id}`} fw={600} c="inherit">
                        {lesson.title}
                      </Anchor>
                      <Hint>{t('teacherHome.modified', { date: formatDate(lesson.updatedAt) })}</Hint>
                    </Row>
                  )}
                </SortableItem>
              ))}
            </RowList>
          </SortableContext>
        </DndContext>
      </section>

      <LessonTitleDialog
        lesson={editing}
        onClose={() => setEditing(undefined)}
        onSaved={(saved) => {
          // A new lesson opens in the editor.
          if (editing === 'new') return navigate(`/lessons/${saved.id}/edit`);
          // A renamed lesson keeps its place.
          setLessons((list) => list?.map((l) => (l.id === saved.id ? saved : l)));
          setEditing(undefined);
        }}
      />
      <LessonAccessDialog lesson={accessOf} onClose={() => setAccessOf(undefined)} />
      {assignedTo && (
        <Notification className="toast" withCloseButton onClose={() => setAssignedTo(undefined)}>
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Text size="sm">{t('assign.assigned', { count: assignedTo })}</Text>
            <Anchor component={Link} to="/homework?status=assigned" size="sm">
              {t('assign.seeHomework')}
            </Anchor>
          </Group>
        </Notification>
      )}
      <DeleteLessonDialog
        lesson={deleting}
        onClose={() => setDeleting(undefined)}
        onDeleted={(id) => {
          setLessons((list) => list?.filter((l) => l.id !== id));
          setDeleting(undefined);
        }}
      />
    </Stack>
  );
}

/** The class going on, or a way to start one. */
function ClassCard({ cls }: { cls: Class | null | undefined }) {
  if (cls === undefined) return <Paper className="card-edge" p="md" />;
  if (!cls) {
    return (
      <Paper className="card-edge" p="md">
        <Group justify="space-between" gap="sm">
          <Text c="dimmed">{t('teacherHome.noClass')}</Text>
          <LinkButton to="/class" variant="filled">
            {t('teacherHome.startClass')}
          </LinkButton>
        </Group>
      </Paper>
    );
  }
  return (
    <ClassSessionCard
      title={cls.lessonTitle}
      detail={t('teacherHome.classStudents', { count: cls.students.length })}
      to="/class"
      actionLabel={t('teacherHome.goToClass')}
    />
  );
}

/** Creates a lesson (lesson = 'new') or renames one: a dialog with the title. */
function LessonTitleDialog({
  lesson,
  onClose,
  onSaved,
}: {
  lesson: LessonSummary | 'new' | undefined;
  onClose: () => void;
  onSaved: (lesson: LessonSummary) => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const isNew = lesson === 'new';

  useEffect(() => {
    setTitle(lesson && lesson !== 'new' ? lesson.title : '');
    setError(undefined);
  }, [lesson]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    setSaving(true);
    setError(undefined);
    try {
      const saved = lesson === 'new' ? await api.createLesson(title) : await api.renameLesson(lesson.id, title);
      onSaved({ id: saved.id, title: saved.title, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={!!lesson}
      onClose={onClose}
      title={<DialogTitle>{isNew ? t('teacherHome.newLesson') : t('teacherHome.renameTitle')}</DialogTitle>}
      centered
    >
      <form onSubmit={save}>
        <TextInput
          label={t('teacherHome.titleLabel')}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={LESSON_TITLE_MAX}
          error={error}
          data-autofocus
          required
        />
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={saving} disabled={!title.trim()}>
            {isNew ? t('teacherHome.create') : t('teacherHome.save')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

/** Deletes a lesson after confirmation (answers and homework of the lesson go too). */
function DeleteLessonDialog({
  lesson,
  onClose,
  onDeleted,
}: {
  lesson: LessonSummary | undefined;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another lesson starts without the last error.
  useEffect(() => setError(undefined), [lesson]);

  const remove = async () => {
    if (!lesson) return;
    setDeleting(true);
    try {
      await api.deleteLesson(lesson.id);
      onDeleted(lesson.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      opened={!!lesson}
      onClose={onClose}
      title={<DialogTitle>{lesson && t('teacherHome.deleteTitle', { title: lesson.title })}</DialogTitle>}
      centered
    >
      <Text size="sm">{t('teacherHome.deleteText')}</Text>
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={deleting} onClick={remove}>
          {t('teacherHome.delete')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}

/**
 * Which students may open the lesson, and which of its chapters: the students
 * (a search, groups), then a table of chapters for the chosen ones. A student
 * added now gets the first chapter; "whole lesson" also covers chapters added later.
 */
function LessonAccessDialog({ lesson, onClose }: { lesson: LessonSummary | undefined; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>();
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  /** Student → the open chapters; null: the whole lesson. */
  const [access, setAccess] = useState<Map<number, Set<string> | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!lesson) return;
    setStudents(undefined);
    setError(undefined);
    Promise.all([api.listStudents(), api.getLessonAccess(lesson.id), api.listGroups(), api.getLesson(lesson.id)]).then(
      ([all, current, allGroups, full]) => {
        setStudents(all);
        setGroups(allGroups);
        setChapters(full.content.chapters);
        setAccess(
          new Map(current.studentIds.map((id) => [id, current.chapters[id] ? new Set(current.chapters[id]) : null])),
        );
      },
      (e: Error) => setError(e.message),
    );
  }, [lesson]);

  const several = chapters.length > 1;
  const granted = useMemo(() => new Set(access.keys()), [access]);
  const first = chapters[0] ? new Set([chapters[0].id]) : new Set<string>();

  /** Students ticked / unticked in the picker: a new one starts with the first chapter. */
  const pick = (picked: Set<number>) =>
    setAccess((old) => new Map([...picked].map((id) => [id, old.has(id) ? (old.get(id) ?? null) : new Set(first)])));
  const setStudent = (id: number, open: Set<string> | null) => setAccess((old) => new Map(old).set(id, open));
  const toggle = (id: number, chapterId: string, on: boolean) => {
    const open = new Set(access.get(id) ?? chapters.map((c) => c.id));
    if (on) open.add(chapterId);
    else open.delete(chapterId);
    setStudent(id, open);
  };
  /** One chapter for all the chosen students at once. */
  const toggleColumn = (chapterId: string, on: boolean) =>
    setAccess(
      (old) =>
        new Map(
          [...old].map(([id, open]) => {
            const next = new Set(open ?? chapters.map((c) => c.id));
            if (on) next.add(chapterId);
            else next.delete(chapterId);
            return [id, next];
          }),
        ),
    );

  const save = async () => {
    if (!lesson) return;
    setSaving(true);
    setError(undefined);
    try {
      const open: Record<string, string[]> = {};
      if (several) for (const [id, set] of access) if (set) open[id] = [...set];
      await api.setLessonAccess(lesson.id, [...access.keys()], open);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chosen = (students ?? []).filter((s) => access.has(s.id));
  const hasChapter = (id: number, chapterId: string) => access.get(id) === null || !!access.get(id)?.has(chapterId);

  return (
    <Modal
      opened={!!lesson}
      onClose={onClose}
      title={<DialogTitle>{lesson && t('access.title', { lesson: lesson.title })}</DialogTitle>}
      centered
      size={several ? 'xl' : 'md'}
    >
      <Text size="sm" c="dimmed" mb="md">
        {t('access.hint')}
      </Text>
      {!students && !error && <Hint>{t('common.loading')}</Hint>}
      {students?.length === 0 && (
        <Text size="sm">
          {t('access.noStudents')}{' '}
          <Anchor component={Link} to="/students">
            {t('access.addStudents')}
          </Anchor>
        </Text>
      )}
      {students && students.length > 0 && (
        <>
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <Button size="compact-sm" variant="default" onClick={() => pick(new Set(students.map((s) => s.id)))}>
                {t('access.all')}
              </Button>
              <Button size="compact-sm" variant="default" onClick={() => pick(new Set())}>
                {t('access.none')}
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {t('access.count', { granted: granted.size, total: students.length })}
            </Text>
          </Group>
          <StudentPicker students={students} groups={groups} selected={granted} onChange={pick} maxHeight={220} />
          {several && chosen.length > 0 && (
            <>
              <Text fw={600} size="sm" mt="md" mb="xs">
                {t('access.chapters')}
              </Text>
              <ScrollArea.Autosize mah={280}>
                <Table withRowBorders fz="sm" stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('access.student')}</Table.Th>
                      <Table.Th>{t('access.wholeLesson')}</Table.Th>
                      {chapters.map((c, i) => (
                        <Table.Th key={c.id} title={chapterTitle(c, i)}>
                          <Checkbox
                            size="xs"
                            label={i + 1}
                            aria-label={chapterTitle(c, i)}
                            checked={chosen.every((s) => hasChapter(s.id, c.id))}
                            indeterminate={
                              !chosen.every((s) => hasChapter(s.id, c.id)) && chosen.some((s) => hasChapter(s.id, c.id))
                            }
                            onChange={(e) => toggleColumn(c.id, e.currentTarget.checked)}
                          />
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {chosen.map((s) => (
                      <Table.Tr key={s.id}>
                        <Table.Td>{s.login}</Table.Td>
                        <Table.Td>
                          <Checkbox
                            size="xs"
                            aria-label={t('access.wholeLesson')}
                            checked={access.get(s.id) === null}
                            onChange={(e) => setStudent(s.id, e.currentTarget.checked ? null : new Set(first))}
                          />
                        </Table.Td>
                        {chapters.map((c, i) => (
                          <Table.Td key={c.id}>
                            <Checkbox
                              size="xs"
                              aria-label={`${s.login} · ${chapterTitle(c, i)}`}
                              checked={hasChapter(s.id, c.id)}
                              onChange={(e) => toggle(s.id, c.id, e.currentTarget.checked)}
                            />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </>
          )}
        </>
      )}
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={saving} disabled={!students} onClick={save}>
          {t('access.save')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}

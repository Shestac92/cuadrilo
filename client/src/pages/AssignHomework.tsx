import { type ExerciseRef, listExercises } from '@cuadrilo/shared/lesson';
import { ActionIcon, Badge, Button, Checkbox, Group, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { api, type Lesson, type Student } from '../api';
import { withToggled } from '../collections';
import { StudentPicker, useGroups } from '../components/StudentPicker';
import { ErrorAlert, Hint, PageHeader } from '../components/ui';
import { t } from '../i18n';
import { ExerciseModes, TEACHER_VIEW_MODES } from '../lesson/exerciseModes';
import { LessonView } from '../lesson/LessonView';
import { scrollToItem } from '../lesson/live';
import { useLive } from '../liveConnection';
import { homeworkReviewPath, lessonsPath } from '../paths';

/** After assigning: the lessons page shows "Tarea asignada a N estudiantes" (see TeacherHome). */
export interface AssignedState {
  assignedTo: number;
}

/**
 * Teacher: assign homework from a lesson. The lesson is shown as the student
 * sees it (exercises can be tried, nothing is saved) with "En la tarea" on
 * each exercise; at the side the chosen exercises, the student(s) and the
 * button. Usually one student: a search finds them quickly.
 */
export default function AssignHomework() {
  const params = useParams();
  const navigate = useNavigate();
  // Edit mode (/homework/:homeworkId/edit): the exercises of a homework already given to one student.
  const editingId = params.homeworkId === undefined ? undefined : Number(params.homeworkId);
  const { homework: allHomework, homeworkError, updateHomework } = useLive();
  const editing = useMemo(
    () => (editingId === undefined ? undefined : allHomework?.find((item) => item.id === editingId)),
    [allHomework, editingId],
  );
  const lessonId = editingId === undefined ? Number(params.id) : (editing?.lessonId ?? -1);
  const [lesson, setLesson] = useState<Lesson>();
  const [students, setStudents] = useState<Student[]>();
  const [chosenExerciseIds, setChosenExerciseIds] = useState<Set<string>>(new Set());
  const [studentIds, setStudentIds] = useState<Set<number>>(new Set());
  const groups = useGroups();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // An exercise to scroll to once its chapter is open.
  const pendingScroll = useRef<string | null>(null);

  // Edit mode: start from the exercises the homework has now (once, when it first appears).
  const startedFrom = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!editing || startedFrom.current === editing.id) return;
    startedFrom.current = editing.id;
    setChosenExerciseIds(new Set(editing.exercises.map((exercise) => exercise.id)));
  }, [editing]);

  useEffect(() => {
    if (lessonId < 0) return;
    Promise.all([api.getLesson(lessonId), api.listStudents()]).then(
      ([loadedLesson, allStudents]) => {
        setLesson(loadedLesson);
        setStudents(allStudents);
      },
      (e: Error) => setError(e.message),
    );
  }, [lessonId]);

  useEffect(() => {
    const itemId = pendingScroll.current;
    if (!itemId) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollToItem(itemId));
  });

  const exerciseRefs = useMemo(() => (lesson ? listExercises(lesson.content) : []), [lesson]);
  // One pass: the chosen exercises (lesson order) and, per chapter, its exercises and how many are chosen.
  const { chosenRefs, byChapter } = useMemo(() => {
    const chosenRefs: ExerciseRef[] = [];
    const byChapter: { exerciseIds: string[]; chosenCount: number }[] = [];
    for (const ref of exerciseRefs) {
      byChapter[ref.chapterIndex] ??= { exerciseIds: [], chosenCount: 0 };
      const chapter = byChapter[ref.chapterIndex];
      chapter.exerciseIds.push(ref.exercise.id);
      if (chosenExerciseIds.has(ref.exercise.id)) {
        chapter.chosenCount += 1;
        chosenRefs.push(ref);
      }
    }
    return { chosenRefs, byChapter };
  }, [exerciseRefs, chosenExerciseIds]);

  /** Opens the exercise's chapter and scrolls to it (from the list of chosen ones). */
  const showExercise = (exerciseId: string) => {
    const ref = exerciseRefs.find((candidate) => candidate.exercise.id === exerciseId);
    if (!ref) return;
    // Same chapter: no re-render, so no effect to scroll from.
    if (ref.chapterIndex === chapterIndex) return scrollToItem(exerciseId);
    pendingScroll.current = exerciseId;
    setChapterIndex(ref.chapterIndex);
  };

  const assign = async () => {
    setSaving(true);
    setError(undefined);
    try {
      if (editing) {
        updateHomework(
          await api.setHomeworkExercises(
            editing.id,
            chosenRefs.map((ref) => ref.exercise.id),
          ),
        );
        navigate(homeworkReviewPath(editing.id));
        return;
      }
      // Lesson order, whatever order the boxes were ticked in.
      await api.createHomework(
        lessonId,
        [...studentIds],
        chosenRefs.map((ref) => ref.exercise.id),
      );
      const state: AssignedState = { assignedTo: studentIds.size };
      navigate(lessonsPath, { state });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (homeworkError) return <ErrorAlert error={homeworkError} />;
  if (editingId !== undefined && allHomework && !editing) return <ErrorAlert error={t('errors.homeworkNotFound')} />;
  if (!lesson) return error ? <ErrorAlert error={error} /> : <Hint>{t('common.loading')}</Hint>;

  const chapterExerciseIds = byChapter[chapterIndex]?.exerciseIds ?? [];
  const isWholeChapterChosen =
    chapterExerciseIds.length > 0 && byChapter[chapterIndex].chosenCount === chapterExerciseIds.length;

  return (
    <section>
      <PageHeader
        title={
          editing
            ? t('assign.editTitle', { student: editing.studentLogin, lesson: lesson.title })
            : t('assign.title', { lesson: lesson.title })
        }
        back={
          editing
            ? { to: homeworkReviewPath(editing.id), label: t('assign.backToHomework') }
            : { to: lessonsPath, label: t('nav.lessons') }
        }
      />
      <ErrorAlert error={error} />
      {exerciseRefs.length === 0 && <Text c="dimmed">{t('assign.lessonWithoutExercises')}</Text>}

      <div className="player-layout plain">
        <div className="player-side">
          <Paper className="card-edge" p="sm">
            <Title order={5} mb="xs">
              {t('assign.exercisesCount', { count: chosenRefs.length })}
            </Title>
            {chosenRefs.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('assign.noExercises')}
              </Text>
            ) : (
              <Stack gap={2}>
                {chosenRefs.map((ref) => (
                  <Group key={ref.exercise.id} gap={4} wrap="nowrap">
                    <UnstyledButton className="hw-item" onClick={() => showExercise(ref.exercise.id)}>
                      <span className="hw-status" aria-hidden>
                        {ref.number}.
                      </span>
                      <span className="hw-title">{ref.exercise.title}</span>
                    </UnstyledButton>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setChosenExerciseIds((set) => withToggled(set, ref.exercise.id, false))}
                      aria-label={t('assign.remove', { exercise: ref.number })}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper className="card-edge" p="sm">
            {editing ? (
              <>
                <Title order={5} mb="xs">
                  {t('assign.student')}
                </Title>
                <Text>{editing.studentLogin}</Text>
                <Text size="xs" c="dimmed" mt="xs">
                  {t('assign.editHint')}
                </Text>
                <Button fullWidth mt="md" loading={saving} disabled={chosenRefs.length === 0} onClick={assign}>
                  {t('assign.save')}
                </Button>
              </>
            ) : (
              <>
                <Title order={5} mb="xs">
                  {t('assign.students')}
                </Title>
                <StudentPicker
                  students={students ?? []}
                  groups={groups}
                  selected={studentIds}
                  onChange={setStudentIds}
                  autoFocus
                />
                <Text size="xs" c="dimmed" mt="xs">
                  {t('assign.accessHint')}
                </Text>
                <Button
                  fullWidth
                  mt="md"
                  loading={saving}
                  disabled={chosenRefs.length === 0 || studentIds.size === 0}
                  onClick={assign}
                >
                  {t('assign.submit', {
                    count: chosenRefs.length,
                    students: t('assign.studentsCount', { count: studentIds.size }),
                  })}
                </Button>
              </>
            )}
          </Paper>
        </div>

        <div>
          {chapterExerciseIds.length > 0 && (
            <Group justify="flex-end" mb="xs">
              <Button
                size="xs"
                variant="light"
                onClick={() =>
                  setChosenExerciseIds((set) => {
                    const next = new Set(set);
                    for (const id of chapterExerciseIds) {
                      if (isWholeChapterChosen) next.delete(id);
                      else next.add(id);
                    }
                    return next;
                  })
                }
              >
                {isWholeChapterChosen ? t('assign.excludeChapter') : t('assign.includeChapter')}
              </Button>
            </Group>
          )}
          {/* No student's states: the exercises are the teacher's read-only view. */}
          <ExerciseModes defaultMode="teacher" available={TEACHER_VIEW_MODES}>
            <LessonView
              content={lesson.content}
              chapterIndex={chapterIndex}
              onChapterChange={setChapterIndex}
              highlightItemIds={chosenExerciseIds}
              chapterLabel={(_c, index) => {
                const count = byChapter[index]?.chosenCount ?? 0;
                return count > 0 ? (
                  <Badge size="sm" circle>
                    {count}
                  </Badge>
                ) : null;
              }}
              itemActions={(_c, exercise) => (
                <Checkbox
                  label={t('assign.inHomework')}
                  checked={chosenExerciseIds.has(exercise.id)}
                  onChange={(e) => {
                    // Read now: the event's target is gone when the state updater runs.
                    const checked = e.currentTarget.checked;
                    setChosenExerciseIds((set) => withToggled(set, exercise.id, checked));
                  }}
                />
              )}
            />
          </ExerciseModes>
        </div>
      </div>
    </section>
  );
}

import { HOMEWORK_STATUSES, type HomeworkStatus as Status } from '@cuadrilo/shared/api';
import { type ExerciseRef, type LessonContent, listExercises } from '@cuadrilo/shared/lesson';
import { Button, Menu, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { api } from '../api';
import { MaybeComments } from '../comments/comments';
import { HomeworkStatus, homeworkStatusLabel } from '../components/HomeworkWidget';
import { ErrorAlert, Hint, LinkButton, PageHeader } from '../components/ui';
import { Exercise } from '../exercises/Exercise';
import { MaybeHighlights } from '../exercises/highlights';
import { createBlockStore, TeacherSync } from '../exercises/sync';
import { formatDate, t } from '../i18n';
import { ExerciseModeScope, ExerciseModeSwitch, ExerciseModes, TEACHER_VIEW_MODES } from '../lesson/exerciseModes';
import { BlockView } from '../lesson/LessonView';
import { useLive } from '../liveConnection';
import { homeworkEditPath } from '../paths';
import '../exercises/exercises.css';

/**
 * Teacher: one homework's answers — only its exercises, in lesson order, with
 * their lesson numbers, in the same widgets read-only. The status is set for
 * the whole homework: "Por corregir" or "Aprobar" (any other from the menu).
 */
export default function HomeworkReview() {
  const homeworkId = Number(useParams().homeworkId);
  // From the shared list, so changes made elsewhere show at once (another tab,
  // the student sending it again, a deletion).
  const { homework: allHomework, homeworkError, updateHomework } = useLive();
  const homework = useMemo(() => allHomework?.find((item) => item.id === homeworkId), [allHomework, homeworkId]);
  const lessonId = homework?.lessonId;
  const studentId = homework?.studentId;
  const [content, setContent] = useState<LessonContent>();
  const [store] = useState(() => createBlockStore({}));
  const [savingStatus, setSavingStatus] = useState<Status>();
  const [error, setError] = useState<string>();

  // The lesson and the student's answers in it, both at once.
  useEffect(() => {
    if (lessonId === undefined || studentId === undefined) return;
    Promise.all([api.getLesson(lessonId), api.getStudentLessonStates(lessonId, studentId)]).then(
      ([lesson, states]) => {
        for (const [blockId, saved] of Object.entries(states)) store.set(blockId, saved.state);
        setContent(lesson.content);
      },
      (e: Error) => setError(e.message),
    );
  }, [lessonId, studentId, store]);

  // The homework's exercises with their numbers, in lesson order, in one walk of the lesson
  // (ones deleted from the lesson are not in the homework anymore).
  const exercises = useMemo(() => {
    if (!content || !homework) return [];
    const chosenIds = new Set(homework.exercises.map((exercise) => exercise.id));
    const chosen: ExerciseRef[] = [];
    for (const ref of listExercises(content)) if (chosenIds.has(ref.exercise.id)) chosen.push(ref);
    return chosen;
  }, [content, homework]);

  const changeStatus = async (status: Status) => {
    if (!homework) return;
    setSavingStatus(status);
    setError(undefined);
    try {
      updateHomework(await api.setHomeworkStatus(homework.id, status));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingStatus(undefined);
    }
  };

  if (homeworkError) return <ErrorAlert error={homeworkError} />;
  // The list has loaded and it is not there: deleted (or a wrong address).
  if (allHomework && !homework) return <ErrorAlert error={t('errors.homeworkNotFound')} />;
  if (error && !content) return <ErrorAlert error={error} />;
  if (!homework || !content) return <Hint>{t('common.loading')}</Hint>;

  // "Por corregir" and "Aprobar" have their own buttons; the menu has the rest.
  const otherStatuses = HOMEWORK_STATUSES.filter(
    (status) => status !== homework.status && status !== 'needs_work' && status !== 'accepted',
  );

  return (
    <section>
      <PageHeader
        title={t('homeworkReview.title', { student: homework.studentLogin, lesson: homework.lessonTitle })}
        back={{ to: `/homework?status=${homework.status}`, label: t('homeworkPage.title') }}
      >
        <HomeworkStatus homework={homework} />
        <LinkButton to={homeworkEditPath(homework.id)} variant="default">
          {t('homeworkReview.editExercises')}
        </LinkButton>
        <Button
          variant="light"
          color="orange"
          loading={savingStatus === 'needs_work'}
          disabled={homework.status === 'needs_work'}
          onClick={() => changeStatus('needs_work')}
        >
          {t('homeworkReview.needsWork')}
        </Button>
        <Button
          loading={savingStatus === 'accepted'}
          disabled={homework.status === 'accepted'}
          onClick={() => changeStatus('accepted')}
        >
          {t('homeworkReview.accept')}
        </Button>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button variant="default" rightSection={<IconChevronDown size={14} />}>
              {t('homeworkReview.otherStatus')}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {otherStatuses.map((status) => (
              <Menu.Item key={status} onClick={() => changeStatus(status)}>
                {t('homeworkReview.setStatus', {
                  status: homeworkStatusLabel(status),
                })}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </PageHeader>
      <Hint mb="md">
        {t('homeworkReview.assignedOn', { date: formatDate(homework.createdAt) })} · {t('homeworkReview.statusHint')}
      </Hint>
      <ErrorAlert error={error} />

      {exercises.length === 0 && <Text c="dimmed">{t('homeworkReview.noExercises')}</Text>}
      <MaybeHighlights lessonId={lessonId} studentId={studentId}>
        <MaybeComments lessonId={lessonId} studentId={studentId}>
          <TeacherSync store={store}>
            <ExerciseModes defaultMode="teacher" available={TEACHER_VIEW_MODES}>
              {exercises.map(({ exercise, number }) => (
                <Exercise
                  key={exercise.id}
                  itemId={exercise.id}
                  number={number}
                  title={exercise.title}
                  actions={<ExerciseModeSwitch exerciseId={exercise.id} />}
                >
                  <ExerciseModeScope exerciseId={exercise.id}>
                    {exercise.blocks.map((block) => (
                      <BlockView key={block.id} block={block} />
                    ))}
                  </ExerciseModeScope>
                </Exercise>
              ))}
            </ExerciseModes>
          </TeacherSync>
        </MaybeComments>
      </MaybeHighlights>
    </section>
  );
}

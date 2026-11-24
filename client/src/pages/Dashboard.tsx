import { isWaitingForTeacher } from '@cuadrilo/shared/api';
import { Accordion, Anchor, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconChalkboard } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { api, type Class, type Homework } from '../api';
import { useUser } from '../auth';
import { StudentBoards } from '../board/BoardPage';
import { ClassSessionCard } from '../components/ClassSessionCard';
import { CountBadge } from '../components/CountBadge';
import { HomeworkStatus } from '../components/HomeworkWidget';
import { StartClassCard } from '../components/StartClassCard';
import { ErrorAlert, Hint, RowList } from '../components/ui';
import { VocabularyReview } from '../components/VocabularyReview';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import { homeworkReviewPath, lessonPath, studentHomeworkPath } from '../paths';

/** How many homework items the dashboard shows before "Ver todas". */
const PREVIEW = 4;

const AFFIRMATIONS = [
  'dashboard.affirmation.a1',
  'dashboard.affirmation.a2',
  'dashboard.affirmation.a3',
  'dashboard.affirmation.a4',
  'dashboard.affirmation.a5',
  'dashboard.affirmation.a6',
  'dashboard.affirmation.a7',
  'dashboard.affirmation.a8',
] as const;

/** One affirmation a day, the same one until midnight (local time). */
function affirmationKey(now = new Date()): (typeof AFFIRMATIONS)[number] {
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Math.floor((today - start) / 86_400_000);
  return AFFIRMATIONS[day % AFFIRMATIONS.length];
}

/** Buenos días until noon, buenas tardes until 20:00, buenas noches overnight. */
function greetingKey(hour: number) {
  if (hour < 6 || hour >= 20) return 'dashboard.greetingEvening' as const;
  if (hour < 12) return 'dashboard.greetingMorning' as const;
  return 'dashboard.greetingAfternoon' as const;
}

/**
 * Homework the dashboard lists: the teacher's turn (sent, to review), or the
 * student's (to correct first, then to start). The list is already newest first.
 */
function pendingHomework(list: Homework[], forTeacher: boolean): Homework[] {
  if (forTeacher) return list.filter((hw) => isWaitingForTeacher(hw.status));
  const toCorrect: Homework[] = [];
  const toStart: Homework[] = [];
  for (const hw of list) {
    if (hw.status === 'needs_work') toCorrect.push(hw);
    else if (hw.status === 'assigned') toStart.push(hw);
  }
  return toCorrect.concat(toStart);
}

/**
 * Start page for both roles: a greeting and an affirmation, and homework that
 * waits for this user. A student also has a word review and the board, folded
 * away. A teacher starts a class from the invitation card, or opens the one in progress.
 */
export default function Dashboard() {
  const user = useUser();
  const isTeacher = user.role === 'teacher';
  const { homework, homeworkError, studentClass } = useLive();
  const [cls, setCls] = useState<Class | null>();
  const [error, setError] = useState<string>();

  // The class may be started or ended in another tab: ask again when this one is shown again.
  useEffect(() => {
    if (!isTeacher) return;
    const load = () => api.getCurrentClass().then(setCls, (e: Error) => setError(e.message));
    const onShown = () => {
      if (document.visibilityState === 'visible') void load();
    };
    void load();
    document.addEventListener('visibilitychange', onShown);
    return () => document.removeEventListener('visibilitychange', onShown);
  }, [isTeacher]);

  const now = new Date();

  return (
    <Stack gap="xl">
      <ErrorAlert error={error ?? homeworkError} />

      <div>
        <Title order={2}>{t(greetingKey(now.getHours()), { name: user.login })}</Title>
        <Text className="dashboard-affirmation" mt="sm" size="lg">
          {t(affirmationKey(now))}
        </Text>
      </div>

      {!isTeacher && studentClass?.lessonId != null && (
        <ClassSessionCard
          title={studentClass.lessonTitle}
          to={lessonPath(studentClass.lessonId)}
          actionLabel={t('classAlert.enter')}
        />
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        {isTeacher ? (
          <ClassInvite cls={cls} failed={!!error} />
        ) : (
          <HomeworkPreview forTeacher={false} homework={homework} failed={!!homeworkError} />
        )}
        {isTeacher ? <HomeworkPreview forTeacher homework={homework} failed={!!homeworkError} /> : <VocabularyReview />}
      </SimpleGrid>

      {!isTeacher && <BoardAccordion />}
    </Stack>
  );
}

function HomeworkPreview({
  forTeacher,
  homework,
  failed,
}: {
  forTeacher: boolean;
  homework: Homework[] | undefined;
  failed: boolean;
}) {
  const items = homework ? pendingHomework(homework, forTeacher) : [];
  const shown = items.slice(0, PREVIEW);
  const title = forTeacher ? t('homeworkPage.toReview') : t('studentHome.toDo');
  const empty = forTeacher ? t('dashboard.nothingToReview') : t('studentHome.nothingToDo');

  return (
    <section>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Title order={3}>{title}</Title>
          {items.length > 0 && (
            <CountBadge
              count={items.length}
              label={
                forTeacher
                  ? t('notices.toReviewCount', { count: items.length })
                  : t('notices.pendingCount', { count: items.length })
              }
            />
          )}
        </Group>
        <Anchor component={Link} to="/homework" size="sm">
          {t('dashboard.seeAll')}
        </Anchor>
      </Group>
      {!homework && !failed && <Hint>{t('common.loading')}</Hint>}
      {homework && items.length === 0 && <Text c="dimmed">{empty}</Text>}
      {shown.length > 0 && (
        <RowList>
          {shown.map((hw) =>
            forTeacher ? (
              <TeacherHomeworkLink key={hw.id} homework={hw} />
            ) : (
              <StudentHomeworkLink key={hw.id} homework={hw} />
            ),
          )}
        </RowList>
      )}
      {items.length > PREVIEW && <Hint mt="xs">{t('dashboard.more', { count: items.length - PREVIEW })}</Hint>}
    </section>
  );
}

function TeacherHomeworkLink({ homework: hw }: { homework: Homework }) {
  return (
    <Paper
      component={Link}
      to={homeworkReviewPath(hw.id)}
      className="lesson-card card-edge dashboard-preview-card"
      radius="md"
      p="md"
    >
      <Text fw={600} truncate>
        {hw.studentLogin}
      </Text>
      <Group gap="sm" mt={6} wrap="nowrap">
        <HomeworkStatus homework={hw} />
        <Text size="sm" c="dimmed" truncate>
          {hw.lessonTitle}
        </Text>
      </Group>
    </Paper>
  );
}

function StudentHomeworkLink({ homework: hw }: { homework: Homework }) {
  return (
    <Paper
      component={Link}
      to={studentHomeworkPath(hw.lessonId, hw.id)}
      className="lesson-card card-edge dashboard-preview-card"
      radius="md"
      p="md"
    >
      <Text fw={600} truncate>
        {hw.lessonTitle}
      </Text>
      <Group gap="sm" mt={6} wrap="nowrap">
        <HomeworkStatus homework={hw} />
        <Text size="sm" c="dimmed" truncate>
          {t('studentHome.exerciseCount', { count: hw.exercises.length })}
        </Text>
      </Group>
    </Paper>
  );
}

/**
 * Teacher's column on the left: the form that starts a class,
 * or the class that is already on. Only as tall as its content.
 */
function ClassInvite({ cls, failed }: { cls: Class | null | undefined; failed: boolean }) {
  const navigate = useNavigate();
  return (
    <section className="dashboard-invite">
      <Title order={3} mb="sm">
        {t('nav.class')}
      </Title>
      {cls === undefined && !failed && <Hint>{t('common.loading')}</Hint>}
      {cls === null && <StartClassCard onStarted={() => navigate('/class')} />}
      {cls && (
        <ClassSessionCard
          plate
          title={cls.lessonTitle}
          detail={t('teacherHome.classStudents', { count: cls.students.length })}
          to="/class"
          actionLabel={t('teacherHome.goToClass')}
        />
      )}
    </section>
  );
}

/** The student's boards, closed until they open the accordion. */
function BoardAccordion() {
  return (
    <Accordion variant="contained" radius="md" className="dashboard-accordion">
      <Accordion.Item value="board">
        <Accordion.Control icon={<IconChalkboard size={20} stroke={1.5} />}>
          <Text span fw={600} display="block">
            {t('nav.board')}
          </Text>
          <Text span size="xs" c="dimmed" display="block">
            {t('dashboard.boardHint')}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <div className="dashboard-board">
            <StudentBoards />
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

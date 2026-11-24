import { isWaitingForStudent } from '@cuadrilo/shared/api';
import { Group, Paper, Stack, Tabs, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { Homework } from '../api';
import { CountBadge } from '../components/CountBadge';
import { HomeworkStatus } from '../components/HomeworkWidget';
import { ErrorAlert, Hint, LinkButton, PageHeader, RowList } from '../components/ui';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import { studentHomeworkPath } from '../paths';

/** Before the shared list has loaded (the same array every time, so the memo below holds). */
const NO_HOMEWORK: Homework[] = [];

type Tab = 'todo' | 'done';

const TABS: { value: Tab; label: string }[] = [
  { value: 'todo', label: t('studentHome.toDo') },
  { value: 'done', label: t('studentHome.done') },
];

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value);

/**
 * To do (the student's turn): to correct first, then to start; the rest is
 * done (sent or accepted). Newest first within each (the list's order). One pass.
 */
function splitToDoAndDone(list: Homework[]): { toDo: Homework[]; done: Homework[] } {
  const toCorrect: Homework[] = [];
  const toStart: Homework[] = [];
  const done: Homework[] = [];
  for (const homework of list) {
    if (!isWaitingForStudent(homework.status)) done.push(homework);
    else if (homework.status === 'needs_work') toCorrect.push(homework);
    else toStart.push(homework);
  }
  return { toDo: toCorrect.concat(toStart), done };
}

/**
 * Student's homework list: pending work and finished work in two tabs
 * (same pattern as the teacher's HomeworkPage).
 */
export default function StudentHomework() {
  const [params, setParams] = useSearchParams();
  const tabInUrl = params.get('tab');
  const tab: Tab = isTab(tabInUrl) ? tabInUrl : 'todo';
  const { homework = NO_HOMEWORK, homeworkError } = useLive();
  const { toDo, done } = useMemo(() => splitToDoAndDone(homework), [homework]);
  const rows = tab === 'todo' ? toDo : done;

  return (
    <Stack gap="md">
      <PageHeader title={t('studentHome.homework')} />
      <ErrorAlert error={homeworkError} />

      {homework.length > 0 && (
        <Tabs value={tab} onChange={(value) => isTab(value) && setParams({ tab: value }, { replace: true })}>
          <Tabs.List>
            {TABS.map(({ value, label }) => (
              <Tabs.Tab
                key={value}
                value={value}
                rightSection={value === 'todo' && toDo.length > 0 ? <CountBadge count={toDo.length} /> : null}
              >
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      {homework.length === 0 && <Text c="dimmed">{t('studentHome.nothingToDo')}</Text>}
      {homework.length > 0 && rows.length === 0 && (
        <Text c="dimmed">{tab === 'todo' ? t('studentHome.nothingToDo') : t('studentHome.nothingDone')}</Text>
      )}
      {rows.length > 0 && (
        <RowList>
          {rows.map((hw) => (
            <HomeworkCard key={hw.id} homework={hw} />
          ))}
        </RowList>
      )}
    </Stack>
  );
}

/** One homework as a card: title + badge, count, numbered exercise titles, action. */
function HomeworkCard({ homework: hw }: { homework: Homework }) {
  const path = studentHomeworkPath(hw.lessonId, hw.id);
  const waiting = isWaitingForStudent(hw.status);
  const body = hw.exercises.map((e) => `${e.number}. ${e.title}`).join(' · ') || undefined;

  return (
    <Paper radius="md" p="md" className="card-edge">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
        <Text fw={600} style={{ minWidth: 0 }}>
          {hw.lessonTitle}
        </Text>
        <HomeworkStatus homework={hw} />
      </Group>

      <Hint mt="xs">{t('studentHome.exerciseCount', { count: hw.exercises.length })}</Hint>
      {body && (
        <Text size="sm" mt={6}>
          {body}
        </Text>
      )}

      <LinkButton to={path} variant="filled" fullWidth mt="md" tt="uppercase">
        {waiting ? t('studentHome.do') : t('studentHome.open')}
      </LinkButton>
    </Paper>
  );
}

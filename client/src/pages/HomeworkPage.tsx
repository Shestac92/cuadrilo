import type { HomeworkStatus as Status } from '@cuadrilo/shared/api';
import { ActionIcon, Button, Menu, Modal, Select, Tabs, Text } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { api, type Homework } from '../api';
import { CountBadge } from '../components/CountBadge';
import { HomeworkStatus } from '../components/HomeworkWidget';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, LinkButton, PageHeader, Row, RowList } from '../components/ui';
import { formatDate, t } from '../i18n';
import { useLive } from '../liveConnection';
import { homeworkEditPath } from '../paths';

type Tab = Status | 'all';

const TABS: { value: Tab; label: string }[] = [
  { value: 'submitted', label: t('homeworkPage.toReview') },
  { value: 'assigned', label: t('homeworkPage.assigned') },
  { value: 'needs_work', label: t('homeworkPage.needsWork') },
  { value: 'accepted', label: t('homeworkPage.accepted') },
  { value: 'all', label: t('homeworkPage.all') },
];

/** Tabs with something for the teacher to do or follow up on: only these show a count. */
const TABS_WITH_COUNT: ReadonlySet<Tab> = new Set(['submitted', 'needs_work']);

/**
 * One pass over the list: the student filter's logins, the counts of the
 * student's homework by status and the rows of the open tab.
 */
function splitHomeworkForTab(list: Homework[], studentLogin: string | null, tab: Tab) {
  const studentLogins = new Set<string>();
  const countByStatus: Partial<Record<Status, number>> = {};
  const rowsInTab: Homework[] = [];
  for (const item of list) {
    studentLogins.add(item.studentLogin);
    if (studentLogin && item.studentLogin !== studentLogin) continue;
    countByStatus[item.status] = (countByStatus[item.status] ?? 0) + 1;
    if (tab === 'all' || item.status === tab) rowsInTab.push(item);
  }
  return { studentLogins: [...studentLogins].sort(), countByStatus, rowsInTab };
}

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value);

/**
 * Teacher: all homework by status ("Por revisar" first), filtered by student.
 * A homework opens on its review page; the status is of the whole homework.
 * New homework is assigned from the list of lessons.
 */
export default function HomeworkPage() {
  const [params, setParams] = useSearchParams();
  const statusInUrl = params.get('status');
  const tab: Tab = isTab(statusInUrl) ? statusInUrl : 'submitted';
  // The shared list: it follows every change live (liveConnection.tsx).
  const { homework, homeworkError, removeHomework } = useLive();
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Homework>();
  const [error, setError] = useState<string>();

  const { studentLogins, countByStatus, rowsInTab } = useMemo(
    () => splitHomeworkForTab(homework ?? [], studentFilter, tab),
    [homework, studentFilter, tab],
  );
  const tabCount = (value: Tab) => (TABS_WITH_COUNT.has(value) ? (countByStatus[value as Status] ?? 0) : 0);

  const deleteConfirmed = async () => {
    if (!deleting) return;
    try {
      await api.deleteHomework(deleting.id);
      removeHomework(deleting.id);
      setDeleting(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section>
      <PageHeader title={t('homeworkPage.title')}>
        <Select
          value={studentFilter}
          onChange={setStudentFilter}
          data={studentLogins}
          placeholder={t('homeworkPage.allStudents')}
          aria-label={t('homeworkPage.student')}
          clearable
          searchable
          w={220}
        />
      </PageHeader>
      <ErrorAlert error={error ?? homeworkError} />

      <Tabs value={tab} onChange={(value) => isTab(value) && setParams({ status: value }, { replace: true })} mb="md">
        <Tabs.List>
          {TABS.map(({ value, label }) => (
            <Tabs.Tab
              key={value}
              value={value}
              rightSection={tabCount(value) > 0 ? <CountBadge count={tabCount(value)} /> : null}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {!homework && !homeworkError && <Hint>{t('common.loading')}</Hint>}
      {homework?.length === 0 && <Text c="dimmed">{t('homeworkPage.noHomework')}</Text>}
      {homework && homework.length > 0 && rowsInTab.length === 0 && <Text c="dimmed">{t('homeworkPage.empty')}</Text>}

      <RowList>
        {rowsInTab.map((hw) => (
          <Row
            key={hw.id}
            actions={
              <>
                <HomeworkStatus homework={hw} />
                <LinkButton to={`/homework/${hw.id}`} variant={hw.status === 'submitted' ? 'filled' : 'default'}>
                  {hw.status === 'submitted' ? t('homeworkPage.review') : t('homeworkPage.view')}
                </LinkButton>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="default" size="lg" aria-label={t('homeworkPage.more')}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item component={Link} to={homeworkEditPath(hw.id)} leftSection={<IconPencil size={16} />}>
                      {t('homeworkPage.editExercises')}
                    </Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => setDeleting(hw)}>
                      {t('homeworkPage.delete')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            }
          >
            <Text fw={600}>
              {hw.studentLogin} · {hw.lessonTitle}
            </Text>
            <Hint>
              {t('homeworkPage.exercises', { list: hw.exercises.map((e) => e.number).join(', ') })} ·{' '}
              {t('homeworkPage.assignedOn', { date: formatDate(hw.createdAt) })}
            </Hint>
          </Row>
        ))}
      </RowList>

      <Modal
        opened={!!deleting}
        onClose={() => setDeleting(undefined)}
        title={
          <DialogTitle>{deleting && t('homeworkPage.deleteTitle', { student: deleting.studentLogin })}</DialogTitle>
        }
        centered
      >
        <Text size="sm">{deleting && t('homeworkPage.deleteText', { lesson: deleting.lessonTitle })}</Text>
        <DialogButtons onCancel={() => setDeleting(undefined)}>
          <Button onClick={deleteConfirmed}>{t('homeworkPage.delete')}</Button>
        </DialogButtons>
      </Modal>
    </section>
  );
}

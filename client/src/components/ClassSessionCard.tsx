import { Group, Paper, Text } from '@mantine/core';

import { t } from '../i18n';
import { LinkButton } from './ui';

/**
 * The class that is on: the live dot, the lesson and a way in. One card for the student's dashboard,
 * the teacher's lessons page and the teacher's dashboard.
 * - row (default): a wide bar, lesson on one line (`detail` goes after it).
 * - plate: the pink plate in the dashboard column, `detail` on its own line.
 */
export function ClassSessionCard({
  title,
  detail,
  to,
  actionLabel,
  plate,
}: {
  title: string | null;
  detail?: string;
  to: string;
  actionLabel: string;
  plate?: boolean;
}) {
  const lesson = title ?? '—';

  if (plate) {
    return (
      <Paper radius="md" p="lg" className="card-edge dashboard-invite-card" bg="var(--plate-bg)">
        <Group gap="sm" wrap="nowrap">
          <span className="live-dot" aria-hidden />
          <Text fw={700}>{t('teacherHome.classOn')}</Text>
        </Group>
        <div className="dashboard-invite-lesson">
          <Text truncate title={lesson}>
            {lesson}
          </Text>
          {detail && (
            <Text size="sm" c="dimmed">
              {detail}
            </Text>
          )}
        </div>
        <LinkButton to={to} variant="filled">
          {actionLabel}
        </LinkButton>
      </Paper>
    );
  }

  const line = detail ? `${lesson} · ${detail}` : lesson;
  return (
    <Paper p="md" bg="var(--plate-bg)" className="card-edge class-session-card">
      <div className="class-session-card__layout">
        <div className="class-session-card__info">
          <span className="live-dot" aria-hidden />
          <div className="class-session-card__text">
            <Text fw={700}>{t('teacherHome.classOn')}</Text>
            <Text size="sm" truncate title={line}>
              {line}
            </Text>
          </div>
        </div>
        <LinkButton to={to} variant="filled" className="class-session-card__action">
          {actionLabel}
        </LinkButton>
      </div>
    </Paper>
  );
}

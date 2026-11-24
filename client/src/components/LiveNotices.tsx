import type { HomeworkEvent } from '@cuadrilo/shared/api';
import { Button, Notification, Text } from '@mantine/core';
import { IconCircleCheck, IconInbox, IconNotebook, IconPencil } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import { homeworkReviewPath, isOnPageOrBelow, studentHomeworkPath } from '../paths';

/** Where the notice leads: the review for the teacher, the homework for the student. Being there already makes it pointless. */
const noticeLink = ({ homework, reason }: HomeworkEvent) =>
  reason === 'submitted' ? homeworkReviewPath(homework.id) : studentHomeworkPath(homework.lessonId, homework.id);

/** What the notice shows for its reason: title, text, look and the button (if any). */
function describeNotice(event: HomeworkEvent) {
  const { homework, reason } = event;
  const lesson = t('notices.lesson', { lesson: homework.lessonTitle });
  const withExercises = t('notices.lessonExercises', {
    lesson: homework.lessonTitle,
    exercises: homework.exercises.map((e) => e.number).join(', '),
  });
  switch (reason) {
    case 'assigned':
      return {
        title: t('notices.assigned'),
        text: withExercises,
        color: 'var(--mantine-primary-color-filled)',
        icon: IconNotebook,
        action: t('notices.open'),
      };
    case 'updated':
      return {
        title: t('notices.updated'),
        text: withExercises,
        color: 'var(--mantine-primary-color-filled)',
        icon: IconNotebook,
        action: t('notices.open'),
      };
    case 'needs_work':
      return {
        title: t('notices.needsWork'),
        text: lesson,
        color: 'orange',
        icon: IconPencil,
        action: t('notices.open'),
      };
    case 'accepted':
      return { title: t('notices.accepted'), text: lesson, color: 'green', icon: IconCircleCheck };
    case 'submitted':
      return {
        title: t('notices.submitted', { student: homework.studentLogin }),
        text: withExercises,
        color: 'var(--mantine-primary-color-filled)',
        icon: IconInbox,
        action: t('notices.review'),
      };
    default:
      return undefined;
  }
}

/**
 * Homework notices (useLive().notices): bottom right, one per homework,
 * until closed or followed. Not shown on the page they lead to.
 */
export function LiveNotices() {
  const { notices, dismissNotices } = useLive();
  const { pathname } = useLocation();
  const dismiss = (homeworkId: number) => dismissNotices((notice) => notice.homework.id === homeworkId);

  // Already there (or went there by other means): nothing to tell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: new notices for the page already open are closed too.
  useEffect(() => {
    dismissNotices((notice) => isOnPageOrBelow(pathname, noticeLink(notice).split('?')[0]));
  }, [notices, pathname, dismissNotices]);

  if (notices.length === 0) return null;
  return (
    <div className="live-notices" aria-live="polite">
      {notices.map((event) => {
        const notice = describeNotice(event);
        if (!notice) return null;
        const Icon = notice.icon;
        return (
          <Notification
            key={event.homework.id}
            title={notice.title}
            color={notice.color}
            icon={<Icon size={18} />}
            withBorder
            onClose={() => dismiss(event.homework.id)}
          >
            <Text size="sm">{notice.text}</Text>
            {notice.action && (
              <Button
                component={Link}
                to={noticeLink(event)}
                size="compact-sm"
                variant="light"
                color={notice.color}
                mt={6}
                onClick={() => dismiss(event.homework.id)}
              >
                {notice.action}
              </Button>
            )}
          </Notification>
        );
      })}
    </div>
  );
}

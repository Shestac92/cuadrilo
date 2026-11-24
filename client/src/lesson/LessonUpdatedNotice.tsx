import type { LessonUpdatedEvent } from '@cuadrilo/shared/api';
import { Button, Notification } from '@mantine/core';
import { useEffect, useState } from 'react';

import { t } from '../i18n';
import { useLive } from '../liveConnection';

/**
 * Student: the teacher saved the lesson (edited it in a class, or in the
 * editor). The open page keeps the old version, so its answers stay valid; the
 * student is asked to reload.
 */
export function LessonUpdatedNotice({ lessonId }: { lessonId: number }) {
  const { socket } = useLive();
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onUpdated = (event: LessonUpdatedEvent) => {
      // Opened chapters are loaded by the page itself.
      if (event.lessonId === lessonId && event.reason !== 'access') setUpdated(true);
    };
    socket.on('lessonUpdated', onUpdated);
    return () => {
      socket.off('lessonUpdated', onUpdated);
    };
  }, [socket, lessonId]);

  if (!updated) return null;
  return (
    <Notification className="toast" color="orange" withCloseButton onClose={() => setUpdated(false)}>
      {t('lesson.updated')}
      <Button size="compact-sm" color="orange" mt="xs" onClick={() => window.location.reload()}>
        {t('lesson.reload')}
      </Button>
    </Notification>
  );
}

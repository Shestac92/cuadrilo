import { Avatar, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { api, type LessonSummary } from '../api';
import { ErrorAlert, Hint, RowList } from '../components/ui';
import { t } from '../i18n';
import { useHomeworkEvent } from '../liveConnection';

/** Pastel Avatar colours — cycle by title so the same lesson keeps the same tint. */
const AVATAR_COLORS = ['lime', 'orange', 'pink', 'grape', 'teal', 'cyan', 'violet', 'blue'] as const;

function avatarColor(title: string): (typeof AVATAR_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Student's lessons (`/lessons`). The class in progress is the banner above
 * this page. Homework lives on /homework; the start page is the dashboard.
 */
export default function StudentHome() {
  const [lessons, setLessons] = useState<LessonSummary[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.listLessons().then(setLessons, (e: Error) => setError(e.message));
  }, []);
  // A homework in a lesson not on the list yet: assigning it opened the lesson.
  useHomeworkEvent(({ homework: hw }) => {
    if (lessons && !lessons.some((l) => l.id === hw.lessonId)) api.listLessons().then(setLessons, () => {});
  });

  return (
    <Stack gap="xl">
      <ErrorAlert error={error} />

      <section>
        <Title order={2} mb="md">
          {t('studentHome.lessons')}
        </Title>
        {!lessons && !error && <Hint>{t('common.loading')}</Hint>}
        {lessons?.length === 0 && <Text c="dimmed">{t('studentHome.noLessons')}</Text>}
        {lessons && lessons.length > 0 && (
          <RowList>
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </RowList>
        )}
      </section>
    </Stack>
  );
}

/** One lesson: letter avatar + title; lifted like the homework cards. */
export function LessonCard({ lesson, className }: { lesson: LessonSummary; className?: string }) {
  const letter = lesson.title.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <Paper
      component={Link}
      to={`/lessons/${lesson.id}`}
      radius="md"
      p="md"
      className={['lesson-card', 'card-edge', className].filter(Boolean).join(' ')}
    >
      <Group gap="md" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
        <Avatar radius="md" size={40} color={avatarColor(lesson.title)} variant="light">
          {letter}
        </Avatar>
        <Text fw={600} style={{ minWidth: 0 }}>
          {lesson.title}
        </Text>
      </Group>
    </Paper>
  );
}

import type { ClassResume } from '@cuadrilo/shared/api';
import { Alert, Button, Group, Paper, Select, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconPlayerPlay, IconPresentation } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { api, type Class, type LessonSummary, type Student } from '../api';
import { t } from '../i18n';
import { useGroups } from './StudentPicker';
import { Hint } from './ui';

/** The audience as the API takes it: the choice in the form is "g:<group id>" or "s:<student id>". */
const audienceOf = (choice: string) => {
  const [kind, id] = choice.split(':');
  return kind === 'g' ? { groupId: Number(id) } : { studentId: Number(id) };
};

/**
 * The pink plate that starts a class: icon, short note, lesson, who it is for.
 * The dashboard and the class page both use it. The page passes lessons and
 * students it already loaded; the dashboard lets the card load them.
 */
export function StartClassCard({
  lessons: givenLessons,
  students: givenStudents,
  onStarted,
  className,
}: {
  lessons?: LessonSummary[];
  students?: Student[];
  onStarted: (cls: Class) => void;
  /** Extra class on the plate, for example a max width on the class page. */
  className?: string;
}) {
  return (
    <Paper
      radius="md"
      p="lg"
      className={className ? `card-edge dashboard-invite-card ${className}` : 'card-edge dashboard-invite-card'}
      bg="var(--plate-bg)"
    >
      <ThemeIcon size={46} radius="md" variant="light" aria-hidden>
        <IconPresentation size={26} stroke={1.5} />
      </ThemeIcon>
      <div>
        <Text fw={700}>{t('teacherHome.noClass')}</Text>
        <Text size="sm" mt={4}>
          {t('dashboard.inviteText')}
        </Text>
      </div>
      <StartClassFields lessons={givenLessons} students={givenStudents} onStarted={onStarted} />
    </Paper>
  );
}

function StartClassFields({
  lessons: givenLessons,
  students: givenStudents,
  onStarted,
}: {
  lessons?: LessonSummary[];
  students?: Student[];
  onStarted: (cls: Class) => void;
}) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [resume, setResume] = useState<ClassResume | null>(null);
  const [loaded, setLoaded] = useState<{ lessons: LessonSummary[]; students: Student[] }>();
  const groups = useGroups();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const ownsData = givenLessons === undefined;
  useEffect(() => {
    if (!ownsData) return;
    Promise.all([api.listLessons(), api.listStudents()]).then(
      ([lessons, students]) => setLoaded({ lessons, students }),
      (e: Error) => setError(e.message),
    );
  }, [ownsData]);

  const lessons = givenLessons ?? loaded?.lessons;
  const students = givenStudents ?? loaded?.students;

  // Where their last class stopped, for the "continue" button.
  useEffect(() => {
    setResume(null);
    if (!audience) return;
    let current = true;
    api.getClassResume(audienceOf(audience)).then(
      (found) => current && setResume(found),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [audience]);

  /** Starts the class: in the lesson chosen, or (continuing) in the lesson and chapter where the last one stopped. */
  const start = async (from?: ClassResume) => {
    setStarting(true);
    setError(undefined);
    try {
      onStarted(
        await api.startClass(from?.lessonId ?? Number(lessonId), audienceOf(audience as string), from?.chapterId),
      );
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <Stack className="start-class-form" gap="sm">
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      {lessons === undefined && !error && <Hint>{t('common.loading')}</Hint>}
      {lessons && students && (
        <>
          <Select
            label={t('classPage.lesson')}
            data={lessons.map((l) => ({ value: String(l.id), label: l.title }))}
            value={lessonId}
            onChange={setLessonId}
            searchable
          />
          <Select
            label={t('classPage.audience')}
            description={t('classPage.audienceHint')}
            data={[
              {
                group: t('classPage.groupsGroup'),
                items: groups
                  .filter((g) => g.studentIds.length > 0)
                  .map((g) => ({ value: `g:${g.id}`, label: g.name })),
              },
              {
                group: t('classPage.studentsGroup'),
                items: students.map((s) => ({ value: `s:${s.id}`, label: s.login })),
              },
            ].filter((entry) => entry.items.length > 0)}
            value={audience}
            onChange={setAudience}
            searchable
          />
          {resume && (
            <Alert variant="light" icon={<IconPlayerPlay size={18} />} title={t('classPage.lastTime')}>
              <Text size="sm" mb="xs">
                {resume.chapterTitle
                  ? t('classPage.lastTimeAt', { lesson: resume.lessonTitle, chapter: resume.chapterTitle })
                  : resume.lessonTitle}
              </Text>
              <Button size="xs" onClick={() => start(resume)} loading={starting}>
                {t('classPage.continue')}
              </Button>
            </Alert>
          )}
          <Group>
            <Button onClick={() => start()} disabled={!lessonId || !audience} loading={starting}>
              {t('classPage.start')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

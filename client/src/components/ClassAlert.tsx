import { Alert, Button, Modal, Stack, Text, Title } from '@mantine/core';
import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import { isOnPageOrBelow, lessonPath } from '../paths';
import { PLATFORM_NAME } from '../platform';

/** Where the tab remembers the class whose alert the student already saw. */
const SEEN_CLASS_KEY = 'classSeen';

function readSeenClass(): number | null {
  try {
    return Number(sessionStorage.getItem(SEEN_CLASS_KEY)) || null;
  } catch {
    return null;
  }
}

/**
 * The class whose alert the student already saw in this tab (so a reload does
 * not bring it back), and marking a class as seen.
 */
function useSeenClass() {
  const [seenClassId, setSeenClassId] = useState(readSeenClass);
  const markClassSeen = useCallback((classId: number) => {
    try {
      sessionStorage.setItem(SEEN_CLASS_KEY, String(classId));
    } catch {
      // Storage blocked: the alert may show again after a reload.
    }
    setSeenClassId(classId);
  }, []);
  return [seenClassId, markClassSeen] as const;
}

/** A short two-note chime, made on the spot (no audio file). Browsers allow it after the user has clicked on the page. */
function playChime(): void {
  try {
    const ctx = new AudioContext();
    [880, 1318.5].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // No audio: the modal is enough.
  }
}

/** While `on` and the tab is in the background, its title blinks. */
function useBlinkingTitle(on: boolean, text: string): void {
  useEffect(() => {
    if (!on) return;
    const original = document.title;
    let blink = false;
    const timer = setInterval(() => {
      blink = document.hidden && !blink;
      document.title = blink ? text : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [on, text]);
}

/**
 * Student: the class is on. When it starts (or the student is added to it,
 * or opens the app during it) a modal with a chime asks them in; the
 * teacher's "call" brings it back. After "Más tarde" a green banner stays
 * until they join or the class ends (on the dashboard: a ClassCard-style
 * plate instead). Nothing while they are on the class's lesson.
 */
export function ClassAlert() {
  const { studentClass, calledToLessonId, dismissCall } = useLive();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [seenClassId, markClassSeen] = useSeenClass();

  const classId = studentClass?.id;
  const lessonId = studentClass?.lessonId ?? null;
  const isInClassLesson = lessonId !== null && isOnPageOrBelow(pathname, lessonPath(lessonId));

  /** The student answered the alert (or is in the lesson already): no modal for this class any more, nor for the call. */
  const acknowledge = useCallback(() => {
    if (classId === undefined) return;
    markClassSeen(classId);
    dismissCall();
  }, [classId, markClassSeen, dismissCall]);

  useEffect(() => {
    if (isInClassLesson) acknowledge();
  }, [isInClassLesson, acknowledge]);

  const isClassWaiting = classId !== undefined && lessonId !== null && !isInClassLesson;
  const isModalOpen = isClassWaiting && (seenClassId !== classId || calledToLessonId !== null);

  useEffect(() => {
    if (isModalOpen) playChime();
  }, [isModalOpen]);
  useBlinkingTitle(isModalOpen, t('classAlert.tabTitle', { name: PLATFORM_NAME }));

  if (!isClassWaiting || !studentClass) return null;

  const enterClass = () => {
    acknowledge();
    navigate(lessonPath(lessonId));
  };
  const lesson = studentClass.lessonTitle ?? '';

  return (
    <>
      <Modal
        opened={isModalOpen}
        onClose={acknowledge}
        centered
        size="md"
        withCloseButton={false}
        radius="lg"
        padding="xl"
      >
        <Stack align="center" gap="sm" ta="center">
          <span className="live-dot big" aria-hidden />
          <Title order={3}>{calledToLessonId !== null ? t('classAlert.called') : t('classAlert.started')}</Title>
          <Text c="dimmed">{t('classAlert.text', { lesson })}</Text>
          <Button size="lg" mt="sm" onClick={enterClass} data-autofocus>
            {t('classAlert.enter')}
          </Button>
          <Button variant="subtle" color="gray" onClick={acknowledge}>
            {t('classAlert.later')}
          </Button>
        </Stack>
      </Modal>
      {/* On the dashboard the class is a ClassCard-style plate; elsewhere a green bar. */}
      {!isModalOpen && pathname !== '/' && (
        <Alert
          color="sage"
          variant="filled"
          mb="md"
          radius="lg"
          className="class-banner"
          styles={{ message: { overflow: 'visible' } }}
          style={
            {
              '--alert-bg': 'var(--accent-sage)',
              '--alert-color': 'var(--accent-sage-contrast)',
              padding: '12px 16px',
            } as CSSProperties
          }
        >
          <div className="class-banner__layout">
            <div className="class-banner__top">
              <span className="live-dot" aria-hidden />
              <Text size="sm" c="var(--accent-sage-contrast)" fw={700} className="class-banner__label">
                {t('classAlert.banner')}
              </Text>
              {lesson ? (
                <Text
                  size="sm"
                  c="var(--accent-sage-contrast)"
                  truncate
                  className="class-banner__lesson-inline"
                  title={lesson}
                >
                  · {lesson}
                </Text>
              ) : null}
            </div>
            {lesson ? (
              <Text
                size="sm"
                c="var(--accent-sage-contrast)"
                truncate
                className="class-banner__lesson-stacked"
                title={lesson}
              >
                {lesson}
              </Text>
            ) : null}
            <Button
              size="sm"
              variant="white"
              className="class-banner__action"
              onClick={enterClass}
              style={
                {
                  '--button-color': 'var(--accent-sage)',
                  '--button-hover-color': 'var(--accent-sage)',
                } as CSSProperties
              }
            >
              {t('classAlert.bannerEnter')}
            </Button>
          </div>
        </Alert>
      )}
    </>
  );
}

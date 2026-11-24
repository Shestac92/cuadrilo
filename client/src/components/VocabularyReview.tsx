import { ActionIcon, Anchor, Button, Group, Modal, Paper, SegmentedControl, Text, Title, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { api, type VocabularyEntry } from '../api';
import { t } from '../i18n';
import { DialogButtons, DialogTitle, Hint } from './ui';

type Direction = 'to-translation' | 'to-lemma';

/** The two sides of a card: the large line and the one "Mostrar" reveals. */
function sides(entry: VocabularyEntry, direction: Direction) {
  return direction === 'to-translation'
    ? { prompt: entry.lemma, answer: entry.translation }
    : { prompt: entry.translation, answer: entry.lemma };
}

/**
 * Prompt and answer. The answer stays in the layout when it is hidden, so
 * revealing it does not change the height.
 */
function Slide({
  word,
  direction,
  concealed,
  className,
}: {
  word: VocabularyEntry;
  direction: Direction;
  /** The answer is laid out, but not shown yet. */
  concealed?: boolean;
  className?: string;
}) {
  const { prompt, answer } = sides(word, direction);
  return (
    <div className={className ? `vocabulary-review__slide ${className}` : 'vocabulary-review__slide'}>
      <Text className="vocabulary-review__word" fw={700} size="lg" lh={1.3}>
        {prompt}
      </Text>
      <Text
        className={concealed ? 'vocabulary-review__word is-concealed' : 'vocabulary-review__word'}
        size="sm"
        mt={4}
        aria-hidden={concealed || undefined}
      >
        {answer}
      </Text>
    </div>
  );
}

/** How many of the longest cards hold the plate's height (see `tallestCards`). */
const SIZER_CARDS = 3;

/**
 * The cards that decide how tall the plate is. Every card in both directions would put twice the
 * words in the page; the longest few (the prompt is the larger type, so it weighs more) are enough.
 */
function tallestCards(words: VocabularyEntry[]): { word: VocabularyEntry; direction: Direction }[] {
  const cards = words.flatMap((word) =>
    (['to-translation', 'to-lemma'] as const).map((direction) => {
      const { prompt, answer } = sides(word, direction);
      return { word, direction, weight: prompt.length * 1.4 + answer.length };
    }),
  );
  return cards.sort((a, b) => b.weight - a.weight).slice(0, SIZER_CARDS);
}

/** A new order each visit: the list from the server is newest first. */
function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * One saved word at a time, on the same short plate as the teacher's class
 * invitation. The widget loads and deletes on its own, so a page only renders it.
 * The first mode shows the word and reveals the translation; the second does the opposite. The labels name
 * what is shown, not a language: the translation language is the installation's (`TRANSLATION_LANG`).
 */
export function VocabularyReview({
  heading = true,
  onRemoved,
}: {
  /** The section title and the link to the full list. Off when the page already has them. */
  heading?: boolean;
  /** Another list of the same words on this page can drop the one just deleted. */
  onRemoved?: (entry: VocabularyEntry) => void;
}) {
  const [words, setWords] = useState<VocabularyEntry[]>();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>('to-translation');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<VocabularyEntry>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => {
    api.listVocabulary().then(
      (list) => setWords(shuffle(list)),
      (e: Error) => setError(e.message),
    );
  }, []);

  const entry = words?.[index];
  const sizerCards = useMemo(() => tallestCards(words ?? []), [words]);

  const changeDirection = (value: string) => {
    setDirection(value as Direction);
    setRevealed(false);
  };

  const next = () => {
    if (!words?.length) return;
    setIndex((i) => (i + 1) % words.length);
    setRevealed(false);
  };

  const previous = () => {
    if (!words?.length || index === 0) return;
    setIndex((i) => i - 1);
    setRevealed(false);
  };

  /** A new order, back at the first word. The direction the student picked stays. */
  const restart = () => {
    if (!words) return;
    setWords(shuffle(words));
    setIndex(0);
    setRevealed(false);
  };

  const remove = async () => {
    if (!pending || !words) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await api.deleteWord(pending.id);
      const nextWords = words.filter((w) => w.id !== pending.id);
      setWords(nextWords);
      setIndex((i) => (nextWords.length === 0 ? 0 : Math.min(i, nextWords.length - 1)));
      setRevealed(false);
      onRemoved?.(pending);
      setPending(undefined);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="dashboard-invite">
      {heading && (
        <Group justify="space-between" mb="sm">
          <Title order={3}>{t('vocabulary.title')}</Title>
          <Anchor component={Link} to="/vocabulario" size="sm">
            {t('dashboard.seeAll')}
          </Anchor>
        </Group>
      )}

      {words === undefined && !error && <Hint>{t('common.loading')}</Hint>}
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}

      {words?.length === 0 && (
        <Paper
          radius="md"
          p="lg"
          className="card-edge dashboard-invite-card vocabulary-review-card"
          bg="var(--plate-bg)"
        >
          <Text fw={700}>{t('vocabulary.empty')}</Text>
          <Text size="sm">{t('vocabulary.emptyHint')}</Text>
        </Paper>
      )}

      {words && entry && (
        <Paper
          radius="md"
          p="lg"
          className="card-edge dashboard-invite-card vocabulary-review-card"
          bg="var(--plate-bg)"
          data-no-translate
        >
          <Group justify="space-between" align="center" gap="xs" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={direction}
              onChange={changeDirection}
              aria-label={t('vocabulary.review.direction')}
              data={[
                { value: 'to-translation', label: t('vocabulary.review.toTranslation') },
                { value: 'to-lemma', label: t('vocabulary.review.toLemma') },
              ]}
            />
            <Group gap={2} wrap="nowrap" align="center">
              <Text size="xs" c="dimmed">
                {t('vocabulary.review.progress', { current: index + 1, total: words.length })}
              </Text>
              <Tooltip label={t('vocabulary.review.restart')} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={t('vocabulary.review.restart')}
                  onClick={restart}
                >
                  <IconRefresh size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {/*
           * The longest cards of both directions are stacked in the sizer, so the plate is
           * as tall as the tallest one and switching does not resize it.
           * The shown card sits on top and only paints.
           */}
          <div className="vocabulary-review__stage">
            <div className="vocabulary-review__sizer" aria-hidden>
              {sizerCards.map(({ word, direction: dir }) => (
                <Slide key={`${word.id}-${dir}`} word={word} direction={dir} />
              ))}
            </div>
            <Slide className="vocabulary-review__current" word={entry} direction={direction} concealed={!revealed} />
          </div>

          <div className="vocabulary-review__actions">
            <Tooltip label={t('vocabulary.review.previous')} withArrow disabled={index === 0}>
              <ActionIcon
                className="vocabulary-review__prev"
                variant="default"
                radius="xl"
                size="lg"
                aria-label={t('vocabulary.review.previous')}
                disabled={index === 0}
                onClick={previous}
              >
                <IconChevronLeft size={18} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
            <Button onClick={revealed ? next : () => setRevealed(true)}>
              {/* Both labels stay in the layout, so the button does not change size. */}
              <span className="vocabulary-review__next-label">
                <span className={revealed ? 'is-concealed' : undefined} aria-hidden={revealed || undefined}>
                  {t('vocabulary.review.show')}
                </span>
                <span className={revealed ? undefined : 'is-concealed'} aria-hidden={!revealed || undefined}>
                  {t('vocabulary.review.next')}
                </span>
              </span>
            </Button>
            <Tooltip label={t('vocabulary.review.know')} withArrow>
              <ActionIcon
                className="vocabulary-review__forget"
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={t('vocabulary.review.know')}
                onClick={() => {
                  setDeleteError(undefined);
                  setPending(entry);
                }}
              >
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Paper>
      )}

      <Modal
        opened={!!pending}
        onClose={() => setPending(undefined)}
        title={<DialogTitle>{pending && t('vocabulary.review.deleteTitle', { word: pending.lemma })}</DialogTitle>}
        centered
      >
        <Text size="sm">{t('vocabulary.review.deleteText')}</Text>
        {deleteError && (
          <Text size="sm" c="red" mt="sm">
            {deleteError}
          </Text>
        )}
        <DialogButtons onCancel={() => setPending(undefined)}>
          <Button loading={deleting} onClick={remove}>
            {t('vocabulary.review.delete')}
          </Button>
        </DialogButtons>
      </Modal>
    </section>
  );
}

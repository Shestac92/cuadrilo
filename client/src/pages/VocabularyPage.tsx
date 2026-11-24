import { DICTIONARY_SOURCE } from '@cuadrilo/shared/api';
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Notification,
  Paper,
  SegmentedControl,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconSearch, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { api, type VocabularyEntry } from '../api';
import { ErrorAlert, Hint, PageHeader } from '../components/ui';
import { lang, t } from '../i18n';
import { matchesQuery } from '../search';

type Order = 'recent' | 'alphabetical';

/** How long "Deshacer" stays after a word is deleted. */
const UNDO_MS = 6000;

/**
 * Student: the words saved from the translator (lessons and the board).
 * Search in the word and in the translation, recent or A–Z; a deleted word can
 * be brought back for a few seconds.
 */
export default function VocabularyPage() {
  const [words, setWords] = useState<VocabularyEntry[]>();
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order>('recent');
  const [deleted, setDeleted] = useState<VocabularyEntry>();
  const [error, setError] = useState<string>();
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api.listVocabulary().then(setWords, (e: Error) => setError(e.message));
    return () => clearTimeout(undoTimer.current);
  }, []);

  const shown = useMemo(() => {
    if (!words) return [];
    const found = words.filter((w) => matchesQuery(`${w.lemma} ${w.word} ${w.translation}`, query));
    // The server's order is newest first.
    return order === 'alphabetical' ? [...found].sort((a, b) => a.lemma.localeCompare(b.lemma, lang)) : found;
  }, [words, query, order]);

  const remove = async (entry: VocabularyEntry) => {
    setError(undefined);
    try {
      await api.deleteWord(entry.id);
      setWords((list) => list?.filter((w) => w.id !== entry.id));
      setDeleted(entry);
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setDeleted(undefined), UNDO_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Saved again from the dictionary: it comes back as a new entry (first among the recent ones).
  const undo = async () => {
    if (!deleted) return;
    clearTimeout(undoTimer.current);
    setDeleted(undefined);
    try {
      const restored = await api.saveWord(deleted.word, deleted.lemma, deleted.lessonId ?? undefined);
      setWords((list) => [restored, ...(list ?? []).filter((w) => w.id !== restored.id)]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title={words && words.length > 0 ? `${t('vocabulary.title')} · ${words.length}` : t('vocabulary.title')}
      />
      <ErrorAlert error={error} />
      {!words && !error && <Hint>{t('common.loading')}</Hint>}

      {words?.length === 0 && (
        <Paper className="card-edge" p="lg">
          <Text fw={600}>{t('vocabulary.empty')}</Text>
          <Text size="sm" c="dimmed">
            {t('vocabulary.emptyHint')}
          </Text>
        </Paper>
      )}

      {words && words.length > 0 && (
        <>
          <Group justify="space-between" mb="md" gap="sm">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={t('vocabulary.search')}
              aria-label={t('vocabulary.search')}
              leftSection={<IconSearch size={16} />}
              w={360}
            />
            <SegmentedControl
              value={order}
              onChange={(value) => setOrder(value as Order)}
              data={[
                { value: 'recent', label: t('vocabulary.recent') },
                { value: 'alphabetical', label: t('vocabulary.alphabetical') },
              ]}
            />
          </Group>

          {shown.length === 0 ? (
            <Text c="dimmed">{t('vocabulary.noMatches')}</Text>
          ) : (
            <Paper className="card-edge">
              <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w="25%">{t('vocabulary.word')}</Table.Th>
                    <Table.Th>{t('vocabulary.translation')}</Table.Th>
                    <Table.Th w="22%">{t('vocabulary.lesson')}</Table.Th>
                    <Table.Th w={48} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shown.map((w) => (
                    <Table.Tr key={w.id}>
                      <Table.Td>
                        <Text fw={600}>{w.lemma}</Text>
                        {w.word.toLowerCase() !== w.lemma.toLowerCase() && (
                          <Text size="sm" c="dimmed">
                            {w.word}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{w.translation}</Table.Td>
                      <Table.Td>
                        {w.lessonId !== null ? (
                          <Anchor component={Link} to={`/lessons/${w.lessonId}`} size="sm">
                            {w.lessonTitle}
                          </Anchor>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => remove(w)}
                          aria-label={t('vocabulary.delete', { word: w.lemma })}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          <Text size="xs" c="dimmed" mt="md">
            {t('vocabulary.source', { source: DICTIONARY_SOURCE })}
          </Text>
        </>
      )}

      {deleted && (
        <Notification
          className="toast"
          withCloseButton
          onClose={() => setDeleted(undefined)}
          closeButtonProps={{ 'aria-label': t('common.close') }}
        >
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Text size="sm">{t('vocabulary.deleted', { word: deleted.lemma })}</Text>
            <Button size="compact-sm" variant="light" onClick={undo}>
              {t('vocabulary.undo')}
            </Button>
          </Group>
        </Notification>
      )}
    </section>
  );
}

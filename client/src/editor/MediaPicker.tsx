import type { MediaKind } from '@cuadrilo/shared/api';
import { Modal, ScrollArea, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconHeadphones, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { api, type MediaFile } from '../api';
import { DialogTitle, ErrorAlert, Hint } from '../components/ui';
import { formatBytes, t } from '../i18n';
import { matchesQuery } from '../search';

/**
 * "Elegir de Archivos": a file of the media library for an image or audio
 * block, chosen by its name or picture; no upload again. The list is loaded
 * each time it opens (files may have been added on the Archivos page).
 */
export function MediaPicker({
  kind,
  opened,
  onClose,
  onPick,
}: {
  kind: MediaKind;
  opened: boolean;
  onClose: () => void;
  onPick: (file: MediaFile) => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!opened) return;
    setQuery('');
    setError(undefined);
    api.listMedia().then(setFiles, (e: Error) => setError(e.message));
  }, [opened]);

  const shown = useMemo(
    () => files?.filter((file) => file.kind === kind && matchesQuery(file.name, query)) ?? [],
    [files, kind, query],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<DialogTitle>{t('files.pickTitle')}</DialogTitle>}
      size="lg"
      centered
    >
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={t('files.search')}
        aria-label={t('files.search')}
        leftSection={<IconSearch size={16} />}
        mb="sm"
        data-autofocus
      />
      <ErrorAlert error={error} />
      {!files && !error && <Hint>{t('common.loading')}</Hint>}
      {files && shown.length === 0 && <Text c="dimmed">{t('files.pickEmpty')}</Text>}
      <ScrollArea.Autosize mah={420}>
        {kind === 'image' ? (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            {shown.map((file) => (
              <UnstyledButton key={file.id} className="media-pick" onClick={() => onPick(file)}>
                <img src={file.url} alt="" className="media-pick-image" loading="lazy" />
                <Text size="xs" truncate="end" mt={4}>
                  {file.name}
                </Text>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap={4}>
            {shown.map((file) => (
              <UnstyledButton key={file.id} className="media-pick media-pick-row" onClick={() => onPick(file)}>
                <IconHeadphones size={18} />
                <Text size="sm" fw={500}>
                  {file.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatBytes(file.bytes)}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </ScrollArea.Autosize>
    </Modal>
  );
}

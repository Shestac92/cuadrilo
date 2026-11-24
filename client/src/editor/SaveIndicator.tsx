import { Button, Group, Loader, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';

import { t } from '../i18n';
import type { SaveStatus } from './autosave';

/** "Guardando…" / "Guardado" / the failure with its retry. */
export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error?: string; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <Group gap={6} c="red">
        <IconAlertTriangle size={16} />
        <Tooltip label={error} disabled={!error}>
          <Text size="sm">{t('editor.saveError')}</Text>
        </Tooltip>
        <Button size="compact-sm" variant="light" color="red" onClick={onRetry}>
          {t('editor.retry')}
        </Button>
      </Group>
    );
  }
  return (
    <Group gap={6} c="dimmed" aria-live="polite">
      {status === 'saving' ? <Loader size={14} /> : <IconCheck size={16} />}
      <Text size="sm">{status === 'saving' ? t('editor.saving') : t('editor.saved')}</Text>
    </Group>
  );
}

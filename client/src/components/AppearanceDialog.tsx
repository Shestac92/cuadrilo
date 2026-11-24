import { THEME_IDS, type ThemeId } from '@cuadrilo/shared/themes';
import { ColorSwatch, Group, Modal, Radio, SegmentedControl, Stack, Text, useMantineColorScheme } from '@mantine/core';
import { useState } from 'react';

import { ApiError, api } from '../api';
import { updateConfig } from '../config';
import { t } from '../i18n';
import { themes } from '../themes';
import { useThemeId } from '../themes/PlatformThemeProvider';
import { DialogTitle, ErrorAlert } from './ui';

/** Whether the user can choose light or dark: not in a theme that has no dark variant. */
export const useCanChooseScheme = () => !themes[useThemeId()].lightOnly;

/**
 * "Apariencia": the platform's theme (teachers only; it changes for everyone and
 * is kept by the server) and the user's own light / dark mode (kept in their browser).
 */
export function AppearanceDialog({
  opened,
  onClose,
  isTeacher,
}: {
  opened: boolean;
  onClose: () => void;
  isTeacher: boolean;
}) {
  const current = useThemeId();
  const canChooseScheme = useCanChooseScheme();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [error, setError] = useState<string>();

  const names: Record<ThemeId, string> = { classic: t('appearance.classic'), blush: t('appearance.blush') };

  async function choose(theme: ThemeId) {
    setError(undefined);
    try {
      updateConfig(await api.updateSettings({ theme }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.networkError'));
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<DialogTitle>{t('appearance.title')}</DialogTitle>} centered>
      <Stack gap="lg">
        <ErrorAlert error={error} />
        {isTeacher && (
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('appearance.theme')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('appearance.themeHint')}
            </Text>
            <Radio.Group value={current} onChange={(value) => choose(value as ThemeId)}>
              <Stack gap="xs">
                {THEME_IDS.map((id) => (
                  <Radio.Card key={id} value={id} p="sm" withBorder>
                    <Group wrap="nowrap" justify="space-between">
                      <Group wrap="nowrap" gap="sm">
                        <Radio.Indicator />
                        <Text>{names[id]}</Text>
                      </Group>
                      <Group gap={4} wrap="nowrap" aria-hidden>
                        {themes[id].swatch.map((color) => (
                          <ColorSwatch key={color} color={color} size={20} withShadow />
                        ))}
                      </Group>
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>
          </Stack>
        )}
        {canChooseScheme && (
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('appearance.scheme')}
            </Text>
            <SegmentedControl
              value={colorScheme}
              onChange={(value) => setColorScheme(value as 'light' | 'dark' | 'auto')}
              data={[
                { value: 'light', label: t('appearance.light') },
                { value: 'dark', label: t('appearance.dark') },
                { value: 'auto', label: t('appearance.auto') },
              ]}
            />
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

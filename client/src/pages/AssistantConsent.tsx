import type { AssistantAccessRequest } from '@cuadrilo/shared/api';
import { Button, Group, List, Paper, Stack, Text, Title } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert, Hint } from '../components/ui';
import { t } from '../i18n';

/**
 * /oauth/consent?request=…: an AI assistant (ChatGPT, Claude) asks to work
 * with the teacher's lessons through the MCP server. The teacher signs in
 * first if needed (the app shows the login on any address), then allows or
 * refuses; either way the browser goes back to the assistant. A student can
 * only refuse.
 */
export default function AssistantConsent() {
  const requestId = useSearchParams()[0].get('request') ?? '';
  const isTeacher = useAuth().user?.role === 'teacher';
  const [request, setRequest] = useState<AssistantAccessRequest>();
  const [deciding, setDeciding] = useState<'allow' | 'deny'>();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.getAssistantAccessRequest(requestId).then(setRequest, (e: Error) => setError(e.message));
  }, [requestId]);

  const decide = async (decision: 'allow' | 'deny') => {
    setDeciding(decision);
    setError(undefined);
    try {
      const { redirectTo } =
        decision === 'allow' ? await api.approveAssistantAccess(requestId) : await api.denyAssistantAccess(requestId);
      setLeaving(true);
      window.location.assign(redirectTo);
    } catch (e) {
      setError((e as Error).message);
      setDeciding(undefined);
    }
  };

  if (!request) return error ? <ErrorAlert error={error} /> : <Hint>{t('common.loading')}</Hint>;
  if (leaving) return <Hint>{t('assistants.redirecting', { host: request.redirectHost })}</Hint>;

  return (
    <Paper className="card-edge" p="xl" maw={520} mx="auto" mt="xl">
      <Stack gap="md">
        <Group gap="sm">
          <IconPlugConnected size={26} color="var(--mantine-primary-color-filled)" />
          <Title order={3}>{t('assistants.consentTitle')}</Title>
        </Group>
        <Text fw={600}>{t('assistants.consentText', { client: request.clientName })}</Text>
        {isTeacher ? (
          <>
            <div>
              <Text size="sm">{t('assistants.canDo')}</Text>
              <List size="sm" mt={4}>
                <List.Item>{t('assistants.permissionLessons')}</List.Item>
                <List.Item>{t('assistants.permissionFiles')}</List.Item>
              </List>
            </div>
            <Text size="sm" c="dimmed">
              {t('assistants.cannotDo')}
            </Text>
          </>
        ) : (
          <Text size="sm" c="red">
            {t('assistants.teacherOnly')}
          </Text>
        )}
        <Text size="sm" c="dimmed">
          {t('assistants.returnTo', { host: request.redirectHost })}
        </Text>
        <ErrorAlert error={error} />
        <Group justify="flex-end">
          <Button
            variant="default"
            loading={deciding === 'deny'}
            disabled={!!deciding}
            onClick={() => void decide('deny')}
          >
            {t('assistants.cancel')}
          </Button>
          {isTeacher && (
            <Button loading={deciding === 'allow'} disabled={!!deciding} onClick={() => void decide('allow')}>
              {t('assistants.allow')}
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

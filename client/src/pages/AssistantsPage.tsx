import { ActionIcon, Button, Code, CopyButton, Group, Modal, Paper, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconPlugConnectedX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { type AssistantConnection, api } from '../api';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, PageHeader, Row, RowList } from '../components/ui';
import { formatDate, formatDateTime, t } from '../i18n';

/** What the teacher pastes into ChatGPT or Claude: this server's MCP address. */
const MCP_ADDRESS = `${window.location.origin}/mcp`;

/**
 * Teacher: AI assistants (ChatGPT, Claude) connected to their lessons through
 * the MCP server — the address to connect one, and the connections, each of
 * which can be ended at once.
 */
export default function AssistantsPage() {
  const [connections, setConnections] = useState<AssistantConnection[]>();
  const [disconnecting, setDisconnecting] = useState<AssistantConnection>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.listAssistantConnections().then(setConnections, (e: Error) => setError(e.message));
  }, []);

  return (
    <section>
      <PageHeader title={t('assistants.title')} />
      <Paper className="card-edge" p="md" mb="lg">
        <Text fw={600} mb={4}>
          {t('assistants.address')}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Code fz="sm">{MCP_ADDRESS}</Code>
          <CopyButton value={MCP_ADDRESS}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? t('assistants.copied') : t('assistants.copy')}>
                <ActionIcon variant="subtle" onClick={copy} aria-label={t('assistants.copy')}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Hint mt="xs">{t('assistants.addressHint')}</Hint>
      </Paper>

      <ErrorAlert error={error} />
      {!connections && !error && <Hint>{t('common.loading')}</Hint>}
      {connections?.length === 0 && <Text c="dimmed">{t('assistants.empty')}</Text>}
      <RowList>
        {connections?.map((connection) => (
          <Row
            key={connection.id}
            actions={
              <Button
                variant="default"
                color="red"
                leftSection={<IconPlugConnectedX size={16} />}
                onClick={() => setDisconnecting(connection)}
              >
                {t('assistants.disconnect')}
              </Button>
            }
          >
            <Text fw={600}>{connection.clientName}</Text>
            <Hint>
              {t('assistants.connectedOn', { date: formatDate(connection.connectedAt) })} ·{' '}
              {connection.lastUsedAt
                ? t('assistants.lastUsed', { date: formatDateTime(connection.lastUsedAt) })
                : t('assistants.neverUsed')}
            </Hint>
          </Row>
        ))}
      </RowList>

      <DisconnectDialog
        connection={disconnecting}
        onClose={() => setDisconnecting(undefined)}
        onDisconnected={(id) => {
          setConnections((list) => list?.filter((connection) => connection.id !== id));
          setDisconnecting(undefined);
        }}
      />
    </section>
  );
}

function DisconnectDialog({
  connection,
  onClose,
  onDisconnected,
}: {
  connection: AssistantConnection | undefined;
  onClose: () => void;
  onDisconnected: (id: number) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another connection starts without the last error.
  useEffect(() => setError(undefined), [connection]);

  const disconnect = async () => {
    if (!connection) return;
    setWorking(true);
    try {
      await api.disconnectAssistant(connection.id);
      onDisconnected(connection.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      opened={!!connection}
      onClose={onClose}
      title={
        <DialogTitle>{connection && t('assistants.disconnectTitle', { client: connection.clientName })}</DialogTitle>
      }
      centered
    >
      <Text size="sm">{t('assistants.disconnectText')}</Text>
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={working} onClick={disconnect}>
          {t('assistants.disconnect')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}

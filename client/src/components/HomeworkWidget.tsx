import { isWaitingForStudent } from '@cuadrilo/shared/api';
import { Badge, Button, Modal, Text } from '@mantine/core';
import { useState } from 'react';

import { api, type Homework, type HomeworkStatus as Status } from '../api';
import { t } from '../i18n';
import { DialogButtons, DialogTitle } from './ui';

const LABELS: Record<Status, { label: string; color: string }> = {
  assigned: { label: t('homeworkStatus.assigned'), color: 'blue' },
  submitted: { label: t('homeworkStatus.submitted'), color: 'grape' },
  needs_work: { label: t('homeworkStatus.needsWork'), color: 'orange' },
  accepted: { label: t('homeworkStatus.accepted'), color: 'green' },
};

/** The status as the interface names it: "Pendiente", "Por corregir"… */
export const homeworkStatusLabel = (status: Status) => LABELS[status].label;

/** The homework's status as a badge. */
export function HomeworkStatus({ homework }: { homework: Homework }) {
  const { label, color } = LABELS[homework.status];
  return (
    <Badge color={color} variant="outline">
      {label}
    </Badge>
  );
}

/** "Enviar al profesor" with its confirmation; shown only while the homework waits for the student. */
export function HomeworkSubmit({ homework, onChange }: { homework: Homework; onChange: (updated: Homework) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  if (!isWaitingForStudent(homework.status)) return null;

  const submit = async () => {
    setSending(true);
    setError(undefined);
    try {
      onChange(await api.submitHomework(homework.id));
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button size="xs" mt="xs" fullWidth onClick={() => setConfirming(true)}>
        {t('homework.submit')}
      </Button>
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title={<DialogTitle>{t('homework.confirmTitle')}</DialogTitle>}
        centered
      >
        <Text size="sm">{t('homework.confirmText')}</Text>
        {error && (
          <Text size="sm" c="red" mt="sm">
            {error}
          </Text>
        )}
        <DialogButtons onCancel={() => setConfirming(false)}>
          <Button loading={sending} onClick={submit}>
            {t('homework.confirm')}
          </Button>
        </DialogButtons>
      </Modal>
    </>
  );
}

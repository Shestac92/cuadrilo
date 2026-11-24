import { Alert, Anchor, Button, type ButtonProps, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { t } from '../i18n';

/** Page title with actions on the right; `back`: a small link above it to the page one level up. */
export function PageHeader({
  title,
  back,
  children,
}: {
  title: ReactNode;
  back?: { to: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      {back && (
        <Anchor component={Link} to={back.to} size="sm" c="dimmed" className="page-back">
          <IconChevronLeft size={14} />
          {back.label}
        </Anchor>
      )}
      <Group justify="space-between" align="center" gap="sm" mb="md">
        <Title order={2}>{title}</Title>
        {children && <Group gap="xs">{children}</Group>}
      </Group>
    </div>
  );
}

/** A request error, if any. */
export function ErrorAlert({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <Alert color="red" variant="light" mb="md">
      {error}
    </Alert>
  );
}

/** A Mantine button that navigates (react-router Link). */
export function LinkButton({ to, ...props }: ButtonProps & { to: string; children?: ReactNode }) {
  return <Button component={Link} to={to} variant="default" {...props} />;
}

/** Secondary text: hints, dates, "Cargando…". */
export function Hint({ children, ...props }: { children: ReactNode; mb?: string; mt?: string }) {
  return (
    <Text c="dimmed" size="sm" {...props}>
      {children}
    </Text>
  );
}

/** A vertical list of rows (lessons, students, homework). */
export function RowList({ children }: { children: ReactNode }) {
  return <Stack gap="xs">{children}</Stack>;
}

/** One row: content on the left, actions on the right. */
export function Row({
  children,
  actions,
  dimmed,
  leading,
  pinned,
}: {
  children: ReactNode;
  actions?: ReactNode;
  dimmed?: boolean;
  /** The actions stay on the right, centred in height, and never wrap under the text (the text shrinks instead). */
  pinned?: boolean;
  /** Before the content, e.g. a drag handle. */
  leading?: ReactNode;
}) {
  return (
    <Paper radius="md" p="sm" className="card-edge" opacity={dimmed ? 0.7 : 1}>
      <Group justify="space-between" align="center" gap="sm" wrap={pinned ? 'nowrap' : 'wrap'}>
        <Group gap="sm" wrap="nowrap" style={pinned ? { flex: 1, minWidth: 0 } : undefined}>
          {leading}
          <div style={pinned ? { minWidth: 0 } : undefined}>{children}</div>
        </Group>
        {actions && (
          <Group gap="xs" wrap={pinned ? 'nowrap' : 'wrap'} style={pinned ? { flex: 'none' } : undefined}>
            {actions}
          </Group>
        )}
      </Group>
    </Paper>
  );
}

/** A dialog's title (the Modal's `title`). */
export function DialogTitle({ children }: { children: ReactNode }) {
  return <Text fw={700}>{children}</Text>;
}

/** A dialog's buttons, on the right: "Cancelar" and the action. */
export function DialogButtons({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (
    <Group justify="flex-end" mt="lg">
      <Button variant="default" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      {children}
    </Group>
  );
}

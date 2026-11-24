import {
  ActionIcon,
  Button,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconDots,
  IconDownload,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { api, type Student, type StudentGroup } from '../api';
import { generatePassword } from '../auth';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, PageHeader, Row, RowList } from '../components/ui';
import { formatDate, t } from '../i18n';
import { matchesQuery } from '../search';
import { DeleteGroupDialog, GroupDialog, GroupList } from './StudentGroups';

/** Credentials to hand out to the student; shown once (the server keeps only a hash). */
interface Issued {
  login: string;
  password: string;
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'issued'; issued: Issued }
  | { kind: 'reset'; student: Student }
  | { kind: 'rename'; student: Student }
  | { kind: 'delete'; student: Student }
  | { kind: 'group'; group?: StudentGroup }
  | { kind: 'deleteGroup'; group: StudentGroup };

/**
 * Teacher: student accounts and, on the second tab, groups of students. Logins
 * and passwords are given by the teacher (no personal data); a new password is
 * shown once, with copy buttons. Every action is in a dialog.
 */
export default function Students() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'groups' ? 'groups' : 'students';
  const [students, setStudents] = useState<Student[]>();
  const [groups, setGroups] = useState<StudentGroup[]>();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.listStudents().then(setStudents, (e: Error) => setError(e.message));
    api.listGroups().then(setGroups, (e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => students?.filter((s) => matchesQuery(s.login, query)) ?? [], [students, query]);
  const close = () => setDialog(undefined);
  const sortGroups = (list: StudentGroup[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  const replace = (updated: Student) => setStudents((list) => list?.map((s) => (s.id === updated.id ? updated : s)));

  return (
    <section>
      <PageHeader title={t('students.title')}>
        {(tab === 'students' ? students : groups)?.length ? (
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={tab === 'students' ? t('students.search') : t('students.searchGroups')}
            aria-label={tab === 'students' ? t('students.search') : t('students.searchGroups')}
            leftSection={<IconSearch size={16} />}
            w={240}
          />
        ) : null}
        {tab === 'students' ? (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setDialog({ kind: 'add' })}>
            {t('students.add')}
          </Button>
        ) : (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setDialog({ kind: 'group' })}>
            {t('students.addGroup')}
          </Button>
        )}
      </PageHeader>
      <ErrorAlert error={error} />
      <Tabs
        value={tab}
        onChange={(value) => {
          setQuery('');
          setParams(value === 'groups' ? { tab: 'groups' } : {}, { replace: true });
        }}
        mb="md"
      >
        <Tabs.List>
          <Tabs.Tab value="students">
            {t('students.tabStudents')}
            {students ? ` · ${students.length}` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="groups">
            {t('students.tabGroups')}
            {groups ? ` · ${groups.length}` : ''}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === 'students' && !students && !error && <Hint>{t('common.loading')}</Hint>}
      {tab === 'groups' && !groups && !error && <Hint>{t('common.loading')}</Hint>}
      {tab === 'students' && students?.length === 0 && (
        <Paper className="card-edge" p="lg">
          <Text c="dimmed">{t('students.empty')}</Text>
        </Paper>
      )}
      {tab === 'students' && students && students.length > 0 && shown.length === 0 && (
        <Text c="dimmed">{t('students.noMatches')}</Text>
      )}
      {tab === 'groups' && (
        <GroupList
          groups={groups}
          students={students ?? []}
          query={query}
          onEdit={(group) => setDialog({ kind: 'group', group })}
          onDelete={(group) => setDialog({ kind: 'deleteGroup', group })}
        />
      )}

      <RowList>
        {(tab === 'students' ? shown : []).map((s) => (
          <Row
            key={s.id}
            actions={
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="default" size="lg" aria-label={t('students.more', { login: s.login })}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconKey size={16} />}
                    onClick={() => setDialog({ kind: 'reset', student: s })}
                  >
                    {t('students.newPassword')}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconPencil size={16} />}
                    onClick={() => setDialog({ kind: 'rename', student: s })}
                  >
                    {t('students.changeLogin')}
                  </Menu.Item>
                  <Menu.Item
                    component="a"
                    href={`/api/students/${s.id}/export`}
                    leftSection={<IconDownload size={16} />}
                  >
                    {t('students.exportData')}
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setDialog({ kind: 'delete', student: s })}
                  >
                    {t('students.delete')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            }
          >
            <Text fw={600}>{s.login}</Text>
            <Hint>{t('students.since', { date: formatDate(s.createdAt) })}</Hint>
          </Row>
        ))}
      </RowList>

      <AddStudentDialog
        opened={dialog?.kind === 'add'}
        onClose={close}
        onCreated={(student, password) => {
          setStudents((list) => [...(list ?? []), student].sort((a, b) => a.login.localeCompare(b.login)));
          setDialog({ kind: 'issued', issued: { login: student.login, password } });
        }}
      />
      <IssuedDialog issued={dialog?.kind === 'issued' ? dialog.issued : undefined} onClose={close} />
      <ResetPasswordDialog
        student={dialog?.kind === 'reset' ? dialog.student : undefined}
        onClose={close}
        onReset={(issued) => setDialog({ kind: 'issued', issued })}
      />
      <RenameDialog
        student={dialog?.kind === 'rename' ? dialog.student : undefined}
        onClose={close}
        onRenamed={(updated) => {
          replace(updated);
          close();
        }}
      />
      <DeleteDialog
        student={dialog?.kind === 'delete' ? dialog.student : undefined}
        onClose={close}
        onDeleted={(id) => {
          setStudents((list) => list?.filter((s) => s.id !== id));
          setGroups((list) => list?.map((g) => ({ ...g, studentIds: g.studentIds.filter((sid) => sid !== id) })));
          close();
        }}
      />
      <GroupDialog
        opened={dialog?.kind === 'group'}
        group={dialog?.kind === 'group' ? dialog.group : undefined}
        students={students ?? []}
        onClose={close}
        onSaved={(saved) => {
          setGroups((list) => sortGroups([...(list ?? []).filter((g) => g.id !== saved.id), saved]));
          close();
        }}
      />
      <DeleteGroupDialog
        group={dialog?.kind === 'deleteGroup' ? dialog.group : undefined}
        onClose={close}
        onDeleted={(id) => {
          setGroups((list) => list?.filter((g) => g.id !== id));
          close();
        }}
      />
    </section>
  );
}

function AddStudentDialog({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (student: Student, password: string) => void;
}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setLogin('');
    setPassword(generatePassword());
    setError(undefined);
  }, [opened]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      onCreated(await api.createStudent(login.trim(), password), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<DialogTitle>{t('students.add')}</DialogTitle>} centered>
      <form onSubmit={create}>
        <Stack>
          <TextInput
            label={t('students.login')}
            description={t('students.loginHint')}
            value={login}
            onChange={(e) => setLogin(e.currentTarget.value)}
            autoCapitalize="none"
            spellCheck={false}
            data-autofocus
            required
          />
          <TextInput
            label={t('students.password')}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            spellCheck={false}
            required
            rightSection={
              <ActionIcon
                variant="subtle"
                onClick={() => setPassword(generatePassword())}
                aria-label={t('students.generate')}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            }
          />
          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}
        </Stack>
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={saving} disabled={!login.trim() || !password}>
            {t('students.create')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

/** The login and password to hand out: after creating a student or a new password. */
function IssuedDialog({ issued, onClose }: { issued: Issued | undefined; onClose: () => void }) {
  return (
    <Modal opened={!!issued} onClose={onClose} title={<DialogTitle>{t('students.issuedTitle')}</DialogTitle>} centered>
      {issued && (
        <Stack gap="sm">
          <Text size="sm">
            {t('students.login')}: <Code fz="sm">{issued.login}</Code>
          </Text>
          <Text size="sm">
            {t('students.password')}: <Code fz="sm">{issued.password}</Code>
          </Text>
          {/* One button for the pair, as one line to paste into a message: "login - password". */}
          <CopyButton value={`${issued.login} - ${issued.password}`}>
            {({ copied, copy }) => (
              <Button
                variant={copied ? 'light' : 'default'}
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                onClick={copy}
              >
                {copied ? t('students.copied') : t('students.copyBoth')}
              </Button>
            )}
          </CopyButton>
          <Hint>{t('students.issuedHint')}</Hint>
        </Stack>
      )}
      <Group justify="flex-end" mt="lg">
        <Button onClick={onClose}>{t('students.done')}</Button>
      </Group>
    </Modal>
  );
}

function ResetPasswordDialog({
  student,
  onClose,
  onReset,
}: {
  student: Student | undefined;
  onClose: () => void;
  onReset: (issued: Issued) => void;
}) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another student starts without the last error.
  useEffect(() => setError(undefined), [student]);

  const reset = async () => {
    if (!student) return;
    const password = generatePassword();
    setSaving(true);
    try {
      const updated = await api.updateStudent(student.id, { password });
      onReset({ login: updated.login, password });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={!!student}
      onClose={onClose}
      title={student && <DialogTitle>{t('students.resetTitle', { login: student.login })}</DialogTitle>}
      centered
    >
      <Text size="sm">{student && t('students.resetText', { login: student.login })}</Text>
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={saving} onClick={reset}>
          {t('students.reset')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}

function RenameDialog({
  student,
  onClose,
  onRenamed,
}: {
  student: Student | undefined;
  onClose: () => void;
  onRenamed: (student: Student) => void;
}) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLogin(student?.login ?? '');
    setError(undefined);
  }, [student]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (login.trim() === student.login) return onClose();
    setSaving(true);
    setError(undefined);
    try {
      onRenamed(await api.updateStudent(student.id, { login: login.trim() }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!student} onClose={onClose} title={<DialogTitle>{t('students.changeLogin')}</DialogTitle>} centered>
      <form onSubmit={save}>
        <TextInput
          label={t('students.login')}
          description={t('students.loginHint')}
          value={login}
          onChange={(e) => setLogin(e.currentTarget.value)}
          autoCapitalize="none"
          spellCheck={false}
          error={error}
          data-autofocus
          required
        />
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={saving} disabled={!login.trim()}>
            {t('students.save')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  student,
  onClose,
  onDeleted,
}: {
  student: Student | undefined;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another student starts without the last error and the typed login.
  useEffect(() => {
    setError(undefined);
    setTyped('');
  }, [student]);

  const remove = async () => {
    if (!student) return;
    setDeleting(true);
    try {
      await api.deleteStudent(student.id);
      onDeleted(student.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      opened={!!student}
      onClose={onClose}
      title={student && <DialogTitle>{t('students.deleteTitle', { login: student.login })}</DialogTitle>}
      centered
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (student && typed === student.login) remove();
        }}
      >
        <Text size="sm">{t('students.deleteText')}</Text>
        {/* Like GitHub's danger zone: the login is typed exactly to confirm. */}
        <TextInput
          mt="md"
          label={student && t('students.deleteConfirm', { login: student.login })}
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          data-autofocus
        />
        {error && (
          <Text size="sm" c="red" mt="sm">
            {error}
          </Text>
        )}
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={deleting} disabled={!student || typed !== student.login}>
            {t('students.deleteForever')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

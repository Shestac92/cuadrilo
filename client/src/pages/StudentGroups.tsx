import {
  ActionIcon,
  Button,
  Checkbox,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconDots, IconPencil, IconSearch, IconTrash } from '@tabler/icons-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { api, type Student, type StudentGroup } from '../api';
import { DialogButtons, DialogTitle, Hint, Row, RowList } from '../components/ui';
import { t } from '../i18n';
import { matchesQuery } from '../search';

/** How many logins a group's row lists before "…". */
const LISTED_LOGINS = 6;

/** Teacher: the groups tab of the students page: a row per group, its students named. */
export function GroupList({
  groups,
  students,
  query,
  onEdit,
  onDelete,
}: {
  groups: StudentGroup[] | undefined;
  students: Student[];
  query: string;
  onEdit: (group: StudentGroup) => void;
  onDelete: (group: StudentGroup) => void;
}) {
  const loginOf = useMemo(() => new Map(students.map((s) => [s.id, s.login])), [students]);
  const logins = (group: StudentGroup) => group.studentIds.map((id) => loginOf.get(id) ?? '');
  const shown = groups?.filter((g) => matchesQuery(g.name, query) || logins(g).some((l) => matchesQuery(l, query)));

  return (
    <>
      {groups?.length === 0 && (
        <Paper className="card-edge" p="lg">
          <Text c="dimmed">{t('students.groupsEmpty')}</Text>
        </Paper>
      )}
      {groups && groups.length > 0 && shown?.length === 0 && <Text c="dimmed">{t('students.groupsNoMatches')}</Text>}
      <RowList>
        {shown?.map((group) => {
          const names = logins(group);
          return (
            <Row
              key={group.id}
              actions={
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="default" size="lg" aria-label={t('students.groupMore', { name: group.name })}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => onEdit(group)}>
                      {t('students.editGroup')}
                    </Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => onDelete(group)}>
                      {t('students.deleteGroup')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              }
            >
              <Text fw={600}>
                {group.name} · {t('students.groupCount', { count: group.studentIds.length })}
              </Text>
              <Hint>
                {names.length === 0
                  ? t('students.groupNoMembers')
                  : names.slice(0, LISTED_LOGINS).join(', ') + (names.length > LISTED_LOGINS ? '…' : '')}
              </Hint>
            </Row>
          );
        })}
      </RowList>
    </>
  );
}

/** Create (no `group`) or edit a group: its name and which students are in it. */
export function GroupDialog({
  opened,
  group,
  students,
  onClose,
  onSaved,
}: {
  opened: boolean;
  group: StudentGroup | undefined;
  students: Student[];
  onClose: () => void;
  onSaved: (group: StudentGroup) => void;
}) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(group?.name ?? '');
    setChosen(new Set(group?.studentIds));
    setQuery('');
    setError(undefined);
  }, [opened, group]);

  const shown = students.filter((s) => matchesQuery(s.login, query));
  const toggle = (id: number) =>
    setChosen((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const studentIds = [...chosen];
      onSaved(
        group
          ? await api.updateGroup(group.id, { name: name.trim(), studentIds })
          : await api.createGroup(name.trim(), studentIds),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<DialogTitle>{group ? t('students.editGroup') : t('students.addGroup')}</DialogTitle>}
      centered
    >
      <form onSubmit={save}>
        <Stack gap="sm">
          <TextInput
            label={t('students.groupName')}
            description={t('students.groupNameHint')}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={60}
            data-autofocus
            required
          />
          <div>
            <Title order={6} mb={4}>
              {t('students.groupMembers')} · {chosen.size}
            </Title>
            {students.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('students.groupNoStudents')}
              </Text>
            ) : (
              <>
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  placeholder={t('students.groupMembersSearch')}
                  aria-label={t('students.groupMembersSearch')}
                  leftSection={<IconSearch size={16} />}
                  mb="xs"
                />
                <ScrollArea.Autosize mah={240}>
                  <Stack gap="xs" py={4}>
                    {shown.map((s) => (
                      <Checkbox key={s.id} label={s.login} checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
                    ))}
                    {shown.length === 0 && (
                      <Text size="sm" c="dimmed">
                        {t('students.noMatches')}
                      </Text>
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              </>
            )}
          </div>
          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}
        </Stack>
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            {group ? t('students.save') : t('students.create')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

export function DeleteGroupDialog({
  group,
  onClose,
  onDeleted,
}: {
  group: StudentGroup | undefined;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another group starts without the last error.
  useEffect(() => setError(undefined), [group]);

  const remove = async () => {
    if (!group) return;
    setDeleting(true);
    try {
      await api.deleteGroup(group.id);
      onDeleted(group.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      opened={!!group}
      onClose={onClose}
      title={group && <DialogTitle>{t('students.groupDeleteTitle', { name: group.name })}</DialogTitle>}
      centered
    >
      <Text size="sm">{t('students.groupDeleteText')}</Text>
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={deleting} onClick={remove}>
          {t('students.deleteGroup')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}

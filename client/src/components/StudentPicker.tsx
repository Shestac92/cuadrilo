import { Checkbox, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { api, type Student, type StudentGroup } from '../api';
import { withToggled } from '../collections';
import { t } from '../i18n';
import { matchesQuery } from '../search';

/** The teacher's groups (an empty list while they load or when they cannot be loaded: the students can still be picked). */
export function useGroups(): StudentGroup[] {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  useEffect(() => {
    api.listGroups().then(setGroups, () => {});
  }, []);
  return groups;
}

/**
 * Choosing students: a search, then the groups, then the students. A group is
 * only a shortcut: ticking it ticks its students (which can be unticked one by
 * one) and unticking it unticks them. Nothing is remembered about the group.
 * `students` are the ones that can be chosen; a group counts only those of its
 * students, and a group with none of them is not shown.
 */
export function StudentPicker({
  students,
  groups,
  selected,
  onChange,
  maxHeight = 240,
  autoFocus,
}: {
  students: Student[];
  groups: StudentGroup[];
  selected: ReadonlySet<number>;
  onChange: (selected: Set<number>) => void;
  maxHeight?: number;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');

  const available = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  // The groups with their choosable students.
  const usable = useMemo(
    () =>
      groups
        .map((group) => ({ group, ids: group.studentIds.filter((id) => available.has(id)) }))
        .filter((entry) => entry.ids.length > 0),
    [groups, available],
  );
  const shownGroups = usable.filter((entry) => matchesQuery(entry.group.name, query));
  const shownStudents = students.filter((s) => matchesQuery(s.login, query));

  const toggleGroup = (ids: number[]) => {
    const all = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (all) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  };

  return (
    <div>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={t('picker.search')}
        aria-label={t('picker.search')}
        leftSection={<IconSearch size={16} />}
        mb="xs"
        data-autofocus={autoFocus ? true : undefined}
      />
      <ScrollArea.Autosize mah={maxHeight}>
        <Stack gap="xs" py={4}>
          {shownGroups.length > 0 && (
            <>
              <Title order={6} c="dimmed">
                {t('picker.groups')}
              </Title>
              {shownGroups.map(({ group, ids }) => {
                const chosen = ids.filter((id) => selected.has(id)).length;
                return (
                  <Checkbox
                    key={`group-${group.id}`}
                    label={
                      <>
                        {group.name}{' '}
                        <Text span size="sm" c="dimmed">
                          · {t('picker.studentsCount', { count: ids.length })}
                        </Text>
                      </>
                    }
                    checked={chosen === ids.length}
                    indeterminate={chosen > 0 && chosen < ids.length}
                    onChange={() => toggleGroup(ids)}
                  />
                );
              })}
              <Title order={6} c="dimmed" mt={4}>
                {t('picker.students')}
              </Title>
            </>
          )}
          {shownStudents.map((s) => (
            <Checkbox
              key={s.id}
              label={s.login}
              checked={selected.has(s.id)}
              onChange={() => onChange(withToggled(selected, s.id))}
            />
          ))}
          {shownGroups.length === 0 && shownStudents.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('picker.noMatches')}
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </div>
  );
}

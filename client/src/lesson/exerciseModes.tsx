import { SegmentedControl, Tooltip } from '@mantine/core';
import { IconKey, IconPencil, IconUser } from '@tabler/icons-react';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { type ViewMode, ViewModeScope } from '../exercises/viewMode';
import { t } from '../i18n';

/**
 * The teacher's view modes, one per exercise (client/src/exercises/viewMode.ts).
 * A page puts ExerciseModes around its exercises: the mode they start in and
 * the ones it allows. A choice lives in the page only and is not saved anywhere.
 * Outside of ExerciseModes every exercise is shown as the student sees it.
 */

/** The modes of the teacher's pages: the student's view is only in the editor's preview. */
export const TEACHER_VIEW_MODES: readonly ViewMode[] = ['teacher'];

/** The same, on a page where the exercises can be edited in place. */
export const TEACHER_EDIT_MODES: readonly ViewMode[] = ['teacher', 'edit'];

interface ModesValue {
  defaultMode: ViewMode;
  available: readonly ViewMode[];
  chosen: Readonly<Record<string, ViewMode>>;
  choose: (exerciseId: string, mode: ViewMode) => void;
}

const ModesContext = createContext<ModesValue | null>(null);

/** The chosen mode, unless the page does not allow it (any more): then the page's default. */
export function resolveMode(
  chosen: ViewMode | undefined,
  defaultMode: ViewMode,
  available: readonly ViewMode[],
): ViewMode {
  return chosen !== undefined && available.includes(chosen) ? chosen : defaultMode;
}

export function ExerciseModes({
  defaultMode,
  available,
  children,
}: {
  defaultMode: ViewMode;
  /** A constant, so the value below stays the same between renders. */
  available: readonly ViewMode[];
  children: ReactNode;
}) {
  const [chosen, setChosen] = useState<Record<string, ViewMode>>({});
  const choose = useCallback(
    (exerciseId: string, mode: ViewMode) => setChosen((c) => ({ ...c, [exerciseId]: mode })),
    [],
  );
  const value = useMemo(() => ({ defaultMode, available, chosen, choose }), [defaultMode, available, chosen, choose]);
  return <ModesContext.Provider value={value}>{children}</ModesContext.Provider>;
}

export function useExerciseMode(exerciseId: string): ViewMode {
  const modes = useContext(ModesContext);
  return modes ? resolveMode(modes.chosen[exerciseId], modes.defaultMode, modes.available) : 'student';
}

/** Gives the blocks inside the mode of their exercise. */
export function ExerciseModeScope({ exerciseId, children }: { exerciseId: string; children: ReactNode }) {
  return <ViewModeScope value={useExerciseMode(exerciseId)}>{children}</ViewModeScope>;
}

const MODE_ICONS = {
  student: IconUser,
  teacher: IconKey,
  edit: IconPencil,
} as const;

const MODE_LABELS = {
  student: () => t('viewMode.student'),
  teacher: () => t('viewMode.teacher'),
  edit: () => t('viewMode.edit'),
} as const;

/** The switch in an exercise's header; nothing when the page allows only one mode. */
export function ExerciseModeSwitch({ exerciseId }: { exerciseId: string }) {
  const modes = useContext(ModesContext);
  const mode = useExerciseMode(exerciseId);
  if (!modes || modes.available.length < 2) return null;
  return (
    <SegmentedControl
      size="xs"
      value={mode}
      onChange={(value) => modes.choose(exerciseId, value as ViewMode)}
      data={modes.available.map((m) => {
        const Icon = MODE_ICONS[m];
        const label = MODE_LABELS[m]();
        return {
          value: m,
          label: (
            <Tooltip label={label}>
              <span role="img" aria-label={label} style={{ display: 'inline-flex' }}>
                <Icon size={14} />
              </span>
            </Tooltip>
          ),
        };
      })}
    />
  );
}

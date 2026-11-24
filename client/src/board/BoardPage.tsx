import type { BoardInfo } from '@cuadrilo/shared/board';
import { SegmentedControl, Text } from '@mantine/core';
import { useEffect, useState } from 'react';

import { api } from '../api';
import { Hint, PageHeader } from '../components/ui';
import { t } from '../i18n';
import { useLive } from '../liveConnection';
import { BoardPanel } from './BoardPanel';

/**
 * The boards a student belongs to, one at a time: their own (solo classes)
 * and their groups'. Writing is possible only on the board of the class going on.
 * The same block on the board page (`tall`) and inside the dashboard accordion.
 */
export function StudentBoards({ tall }: { tall?: boolean }) {
  const { studentClass } = useLive();
  const [boards, setBoards] = useState<BoardInfo[]>();
  const [chosen, setChosen] = useState<number>();
  const [error, setError] = useState<string>();

  // Again when a class starts or ends: its board may be new.
  // biome-ignore lint/correctness/useExhaustiveDependencies: studentClass?.id is the reload trigger.
  useEffect(() => {
    api.listBoards().then(setBoards, (e: Error) => setError(e.message));
  }, [studentClass?.id]);

  // The board of the class going on, else the one chosen, else the first.
  const current = boards?.find((b) => b.id === (chosen ?? studentClass?.boardId)) ?? boards?.[0];

  return (
    <>
      {error && (
        <Text size="sm" c="red" mb="sm">
          {error}
        </Text>
      )}
      {boards && boards.length > 1 && (
        <SegmentedControl
          mb="md"
          aria-label={t('board.choose')}
          value={String(current?.id)}
          onChange={(value) => setChosen(Number(value))}
          data={boards.map((b) => ({ value: String(b.id), label: b.groupName ?? t('board.own') }))}
        />
      )}
      <BoardPanel
        key={current?.id}
        boardId={current?.id ?? null}
        canWrite={!!current && current.id === studentClass?.boardId}
        translate
        tall={tall}
        title={false}
        welcome={t('board.welcome')}
      />
    </>
  );
}

/** Student: the boards they belong to, one at a time. */
export default function BoardPage() {
  return (
    <section>
      <PageHeader title={t('board.title')} />
      <Hint mb="md">{t('board.pageHint')}</Hint>
      <StudentBoards tall />
    </section>
  );
}

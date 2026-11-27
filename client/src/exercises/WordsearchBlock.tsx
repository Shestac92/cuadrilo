import {
  type Cell,
  gridRows,
  placementCells,
  selectionCells,
  type WordsearchPlacement,
  type WordsearchState,
  wordInSelection,
} from '@cuadrilo/shared/wordsearch';
import { Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type CSSProperties, type PointerEvent, useMemo, useState } from 'react';

import { t } from '../i18n';
import { Celebration } from './Exercise';
import { useBlockState } from './sync';
import { useViewMode } from './viewMode';

const keyOf = (cell: Cell) => `${cell.row},${cell.col}`;
const keysOf = (placements: readonly WordsearchPlacement[]) =>
  new Set(placements.flatMap((placement) => placementCells(placement).map(keyOf)));

interface Props {
  /** The grid's rows and where the words lie (the block's own fields). */
  grid: string[];
  placements: WordsearchPlacement[];
}

/**
 * A word search: the student drags over the letters (or taps the first and the last letter) to mark a
 * word; a right word stays marked green and is struck off the list. Words run to the right or down. The
 * teacher's view marks all the words grey as the key, the found ones green.
 */
export function WordsearchBlock({ id, grid, placements }: { id: string } & Props) {
  const [state, setState, readOnly] = useBlockState<WordsearchState>(id, () => ({ found: [] }));
  const teacherView = useViewMode() === 'teacher';
  const rows = useMemo(() => gridRows(grid), [grid]);
  const words = useMemo(() => placements.map((placement) => placement.word), [placements]);
  // A word the teacher has removed since is not counted.
  const found = useMemo(() => new Set(state.found.filter((word) => words.includes(word))), [state.found, words]);
  const done = found.size >= words.length;
  const locked = readOnly || done;

  const foundKeys = useMemo(() => keysOf(placements.filter((p) => found.has(p.word))), [placements, found]);
  const answerKeys = useMemo(() => (teacherView ? keysOf(placements) : new Set<string>()), [teacherView, placements]);

  const [drag, setDrag] = useState<{ from: Cell; to: Cell }>();
  // After a tap on a letter: the first letter of a word that the next tap finishes.
  const [anchor, setAnchor] = useState<Cell>();
  const selectedKeys = useMemo(() => {
    if (drag) return new Set(selectionCells(drag.from, drag.to).map(keyOf));
    return new Set(anchor ? [keyOf(anchor)] : []);
  }, [drag, anchor]);

  const cellAt = (e: PointerEvent<HTMLDivElement>): Cell | undefined => {
    const element = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]');
    if (!element || !e.currentTarget.contains(element)) return undefined;
    return { row: Number(element.dataset.row), col: Number(element.dataset.col) };
  };

  const mark = (from: Cell, to: Cell) => {
    const word = wordInSelection(
      rows,
      selectionCells(from, to),
      words.filter((candidate) => !found.has(candidate)),
    );
    if (word) setState((s) => ({ found: [...s.found.filter((w) => w !== word), word] }));
  };

  const finish = (from: Cell, to: Cell) => {
    if (from.row !== to.row || from.col !== to.col) {
      setAnchor(undefined);
      return mark(from, to);
    }
    // A tap: the first letter, or the last one of the word started by the previous tap.
    if (!anchor) return setAnchor(from);
    setAnchor(undefined);
    if (anchor.row !== from.row || anchor.col !== from.col) mark(anchor, from);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellAt(e);
    if (locked || !cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: cell, to: cell });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const cell = cellAt(e);
    if (cell && (cell.row !== drag.to.row || cell.col !== drag.to.col)) setDrag({ ...drag, to: cell });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const cell = cellAt(e) ?? drag.to;
    setDrag(undefined);
    finish(drag.from, cell);
  };

  return (
    <div className="ex-wordsearch ex-interactive">
      <Text size="sm" fw={500} mb={6} aria-live="polite">
        {done
          ? t('exercise.wordsearchDone')
          : t('exercise.wordsearchFound', { found: found.size, total: words.length })}
      </Text>
      <div className="wordsearch-layout">
        <div
          className={`wordsearch-grid ${locked ? '' : 'pointing'}`}
          style={{ '--n': rows.length } as CSSProperties}
          // The letters are not words to translate (the translator skips what has this).
          data-no-translate
          // No text selection while dragging, in any browser.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDrag(undefined)}
          role="img"
          aria-label={t('exercise.wordsearchHint')}
        >
          {rows.map((row, r) =>
            row.map((letter, c) => {
              const key = `${r},${c}`;
              const classes = ['wordsearch-cell'];
              if (foundKeys.has(key)) classes.push('found');
              else if (answerKeys.has(key)) classes.push('key');
              if (selectedKeys.has(key)) classes.push('selected');
              return (
                <div key={key} className={classes.join(' ')} data-row={r} data-col={c}>
                  {letter}
                </div>
              );
            }),
          )}
        </div>
        <ul className="wordsearch-words">
          {placements.map((placement) => (
            <li key={placement.word} className={found.has(placement.word) ? 'found' : ''}>
              {found.has(placement.word) && <IconCheck size={16} aria-hidden />}
              <span>{placement.word}</span>
            </li>
          ))}
        </ul>
      </div>
      <Celebration blockId={id} done={done} />
    </div>
  );
}

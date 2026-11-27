import type { BlockOf } from '@cuadrilo/shared/lesson';
import { Button } from '@mantine/core';
import { t } from '../i18n';
import { AnswerKey } from './AnswerKey';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { useViewMode } from './viewMode';

type Statement = BlockOf<'true-false'>['statements'][number];

interface TrueFalseState {
  /** The student's answer per statement; null — not answered yet. */
  answers: (boolean | null)[];
  states: ItemState[];
}

/**
 * Statements to mark "Verdadero" or "Falso", each checked as soon as it is
 * answered: a right answer locks green, a wrong one stays and can be changed.
 */
export function TrueFalseBlock({ id, statements }: { id: string; statements: Statement[] }) {
  const [state, setState, readOnly] = useBlockState<TrueFalseState>(id, () => ({
    answers: statements.map(() => null),
    states: statements.map(() => null),
  }));
  const { answers, states } = state;
  const teacherView = useViewMode() === 'teacher';

  const setRow = <T,>(list: T[], row: number, value: T) => list.map((old, r) => (r === row ? value : old));

  const answer = (row: number, value: boolean) =>
    setState((s) => ({
      answers: setRow(s.answers, row, value),
      states: setRow(s.states, row, value === statements[row].true ? 'ok' : 'bad'),
    }));

  return (
    <div className="ex-true-false ex-interactive">
      {statements.map((statement, row) => {
        const itemState = states[row];
        const locked = readOnly || itemState === 'ok';
        const option = (value: boolean) => {
          const chosen = answers[row] === value;
          return (
            <Button
              size="xs"
              variant={chosen ? 'filled' : 'default'}
              color={chosen ? resultColor(itemState) : undefined}
              disabled={locked && !chosen}
              aria-pressed={chosen}
              onClick={() => !locked && answer(row, value)}
            >
              {value ? t('exercise.true') : t('exercise.false')}
            </Button>
          );
        };
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's statements in their fixed order: the position is their identity.
          <div key={row} className={`tf-row ${itemState ?? ''}`}>
            <span className="tf-number">{row + 1}.</span>
            <span className="tf-text">{statement.text}</span>
            <span className="tf-buttons">
              {option(true)}
              {option(false)}
            </span>
            {teacherView && <AnswerKey answers={[statement.true ? t('exercise.true') : t('exercise.false')]} />}
          </div>
        );
      })}
      <Celebration blockId={id} done={states.every((s) => s === 'ok')} />
    </div>
  );
}

/** The chosen button: green / red; the theme's color while unchecked. */
function resultColor(state: ItemState): string | undefined {
  switch (state) {
    case 'ok':
      return 'green';
    case 'bad':
      return 'red';
    default:
      return undefined;
  }
}

import type { BlockOf } from '@cuadrilo/shared/lesson';
import { ActionIcon, Checkbox, Radio, Tooltip } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { t } from '../i18n';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { useViewMode } from './viewMode';

type Question = BlockOf<'choice'>['questions'][number];

interface ChoiceState {
  /** Indexes of the options the student picked, per question. */
  picks: number[][];
  states: ItemState[];
}

const rightOptions = (question: Question) =>
  question.options.flatMap((option, index) => (option.correct ? [index] : []));

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((index) => b.includes(index));

/**
 * A test. A question with one right option is a radio group, checked as soon
 * as an option is picked; with several right ones the student ticks all of
 * them and checks the question with its button (checking each tick would give
 * the answer away). A right answer locks green, a wrong one stays editable.
 */
export function ChoiceBlock({ id, questions }: { id: string; questions: Question[] }) {
  const [state, setState, readOnly] = useBlockState<ChoiceState>(id, () => ({
    picks: questions.map(() => []),
    states: questions.map(() => null),
  }));
  const { picks, states } = state;
  const teacherView = useViewMode() === 'teacher';

  /** The option's text; in the teacher's view the right ones are marked. */
  const optionLabel = (option: Question['options'][number]) =>
    teacherView && option.correct ? (
      <span className="choice-right" title={t('viewMode.rightAnswer')}>
        {option.text}
        <IconCheck size={14} aria-hidden />
      </span>
    ) : (
      option.text
    );

  const setRow = <T,>(list: T[], row: number, value: T) => list.map((old, r) => (r === row ? value : old));
  const verdict = (row: number, picked: number[]): ItemState =>
    sameSet(picked, rightOptions(questions[row])) ? 'ok' : 'bad';

  const pickOne = (row: number, option: number) =>
    setState((s) => ({ picks: setRow(s.picks, row, [option]), states: setRow(s.states, row, verdict(row, [option])) }));

  const toggle = (row: number, option: number) =>
    setState((s) => {
      const picked = s.picks[row].includes(option)
        ? s.picks[row].filter((index) => index !== option)
        : [...s.picks[row], option];
      // A changed answer is unchecked again.
      return { picks: setRow(s.picks, row, picked), states: setRow(s.states, row, null) };
    });

  const check = (row: number) => setState((s) => ({ ...s, states: setRow(s.states, row, verdict(row, s.picks[row])) }));

  return (
    <div className="ex-choice ex-interactive">
      {questions.map((question, row) => {
        const itemState = states[row];
        const locked = readOnly || itemState === 'ok';
        const several = rightOptions(question).length > 1;
        const picked = picks[row];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's questions in their fixed order: the position is their identity.
          <fieldset key={row} className={`choice-question ${itemState ?? ''}`} disabled={locked}>
            <legend className="choice-text">
              <span className="choice-number">{row + 1}.</span> {question.question}
              {several && <span className="choice-hint"> {t('exercise.pickAll')}</span>}
            </legend>
            <div className="choice-body">
              <div className="choice-options">
                {question.options.map((option, index) =>
                  several ? (
                    <Checkbox
                      // biome-ignore lint/suspicious/noArrayIndexKey: options in their fixed order.
                      key={index}
                      label={optionLabel(option)}
                      checked={picked.includes(index)}
                      onChange={() => toggle(row, index)}
                    />
                  ) : (
                    <Radio
                      // biome-ignore lint/suspicious/noArrayIndexKey: options in their fixed order.
                      key={index}
                      name={`${id}-${row}`}
                      label={optionLabel(option)}
                      checked={picked.includes(index)}
                      onChange={() => pickOne(row, index)}
                    />
                  ),
                )}
              </div>
              {several && !locked && (
                <Tooltip label={t('exercise.check')}>
                  <ActionIcon
                    className="choice-check"
                    variant="filled"
                    color={itemState === 'bad' ? 'red' : undefined}
                    size="lg"
                    radius="xl"
                    disabled={picked.length === 0}
                    aria-label={t('exercise.checkQuestion', { n: row + 1 })}
                    onClick={() => check(row)}
                  >
                    <IconCheck size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          </fieldset>
        );
      })}
      <Celebration blockId={id} done={states.every((s) => s === 'ok')} />
    </div>
  );
}

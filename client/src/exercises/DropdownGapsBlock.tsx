import { useMemo } from 'react';
import { t } from '../i18n';
import { AnswerKey } from './AnswerKey';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { type DropdownPart, matches, parseDropdownText } from './text';
import { useViewMode } from './viewMode';

interface DropdownGapsState {
  /** The option chosen in each gap ('' = none yet). */
  values: string[];
  states: ItemState[];
}

const setAt = <T,>(list: T[], index: number, value: T) => list.map((v, i) => (i === index ? value : v));

/**
 * Fill in the gaps by choosing one of the options of a dropdown. `text` marks
 * a gap with `{tengo|*tienes*|tiene}` (the right option between asterisks).
 * A choice is checked at once: a correct one locks green, a wrong one turns
 * red and can be changed.
 */
export function DropdownGapsBlock({ id, text }: { id: string; text: string }) {
  const paragraphs = useMemo(() => parseDropdownText(text), [text]);
  const gapCount = useMemo(() => paragraphs.flat().filter((part) => part.kind === 'gap').length, [paragraphs]);
  const [state, setState, readOnly] = useBlockState<DropdownGapsState>(id, () => ({
    values: Array.from({ length: gapCount }, () => ''),
    states: Array.from({ length: gapCount }, () => null),
  }));

  const teacherView = useViewMode() === 'teacher';

  const choose = (part: Extract<DropdownPart, { kind: 'gap' }>, value: string) =>
    setState((s) => ({
      values: setAt(s.values, part.index, value),
      states: setAt<ItemState>(s.states, part.index, !value ? null : matches(value, part.answers) ? 'ok' : 'bad'),
    }));

  return (
    <div className="ex-gap-text ex-interactive">
      {paragraphs.map((parts, p) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
        <p key={p}>
          {parts.map((part, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
            if (part.kind === 'text') return <span key={i}>{part.text}</span>;
            const itemState = state.states[part.index];
            const locked = readOnly || itemState === 'ok';
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
              <span key={i} className="gap-wrap">
                <select
                  className={`gap-input gap-select ${itemState ?? ''}`}
                  value={state.values[part.index] ?? ''}
                  onChange={(e) => choose(part, e.target.value)}
                  disabled={locked}
                  aria-label={t('exercise.gap', { n: part.index + 1 })}
                  aria-invalid={itemState === 'bad'}
                >
                  <option value="" />
                  {part.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {/* A dropdown cannot hold a placeholder: the key stands next to it. */}
                {teacherView && <AnswerKey answers={part.answers} />}
              </span>
            );
          })}
        </p>
      ))}
      <Celebration active={!readOnly && gapCount > 0 && state.states.every((s) => s === 'ok')} />
    </div>
  );
}

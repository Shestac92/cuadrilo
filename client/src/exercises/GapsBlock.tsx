import { useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { AnswerKey, keyText } from './AnswerKey';
import { Celebration, type ItemState } from './Exercise';
import { useBlockState } from './sync';
import { gapsOf, matches, parseGapText } from './text';
import { useViewMode } from './viewMode';

interface GapsState {
  /** Finished answers (what was checked). */
  values: string[];
  states: ItemState[];
}

const setAt = <T,>(list: T[], index: number, value: T) => list.map((v, i) => (i === index ? value : v));

/**
 * Fill in the gaps by typing. `text` marks gaps with `*answer*`, alternatives
 * with `|`: "Todas las mañanas *tomo* un café." Works for one sentence or a long
 * text with paragraphs.
 *
 * Each gap is checked on its own when the student finishes it (Enter or leaving
 * the field): a correct answer locks green, a wrong one turns red and can be
 * retyped. An empty gap is not checked. Only finished answers are part of the
 * block state (and sent to the teacher), not every keystroke.
 */
export function GapsBlock({ id, text }: { id: string; text: string }) {
  const paragraphs = useMemo(() => parseGapText(text), [text]);
  const gaps = useMemo(() => gapsOf(paragraphs), [paragraphs]);
  const [state, setState, readOnly] = useBlockState<GapsState>(id, () => ({
    values: gaps.map(() => ''),
    states: gaps.map(() => null),
  }));
  // What is in the inputs right now, finished or not.
  const [drafts, setDrafts] = useState<string[]>(() => state.values);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const teacherView = useViewMode() === 'teacher';
  const shown = readOnly ? state.values : drafts;

  const check = (index: number) => {
    const value = drafts[index] ?? '';
    const result: ItemState = !value.trim() ? null : matches(value, gaps[index].answers) ? 'ok' : 'bad';
    setState((s) => ({ values: setAt(s.values, index, value), states: setAt(s.states, index, result) }));
  };

  /** Enter: check and move on to the next gap that still needs an answer. */
  const finishWithEnter = (index: number) => {
    check(index);
    const next = state.states.findIndex((s, i) => i > index && s !== 'ok');
    if (next >= 0) inputs.current[next]?.focus();
    else inputs.current[index]?.blur();
  };

  return (
    <div className="ex-gap-text ex-interactive">
      {paragraphs.map((parts, p) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
        <p key={p}>
          {parts.map((part, i) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
            if (part.kind === 'text') return <span key={i}>{part.text}</span>;
            const longest = Math.max(...part.answers.map((a) => a.length), 3);
            // A gap being retyped looks neutral until it is finished again.
            const editing = !readOnly && drafts[part.index] !== state.values[part.index];
            const itemState = editing ? null : state.states[part.index];
            const locked = readOnly || itemState === 'ok';
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of the lesson text, never reordered: the position is their identity.
              <span key={i} className="gap-wrap">
                <input
                  ref={(el) => {
                    inputs.current[part.index] = el;
                  }}
                  className={`gap-input ${itemState ?? ''}`}
                  style={{ width: `${longest + 2}ch` }}
                  value={shown[part.index] ?? ''}
                  // The teacher sees the key in a gap nobody filled in.
                  placeholder={teacherView ? keyText(part.answers) : undefined}
                  onChange={(e) => setDrafts((list) => setAt(list, part.index, e.target.value))}
                  onBlur={() => !locked && editing && check(part.index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !locked) {
                      e.preventDefault();
                      finishWithEnter(part.index);
                    }
                  }}
                  readOnly={locked}
                  aria-label={t('exercise.gap', { n: part.index + 1 })}
                  aria-invalid={itemState === 'bad'}
                  autoComplete="off"
                  spellCheck={false}
                />
                {teacherView && itemState === 'bad' && <AnswerKey answers={part.answers} />}
              </span>
            );
          })}
        </p>
      ))}
      <Celebration active={!readOnly && state.states.every((s) => s === 'ok')} />
    </div>
  );
}

import { Text, Textarea } from '@mantine/core';
import { useRef, useState } from 'react';

import { t } from '../i18n';
import { HighlightLayer, HighlightToolbar, targetOf, useBlockHighlights } from './highlights';
import { useBlockState } from './sync';

const MAX_LENGTH = 3000;
/** The character counter appears only near the limit, so it doesn't distract. */
const COUNTER_FROM = 2700;
/** The text reaches the teacher at most once per second while the student types. */
const DRAFT_SYNC_MS = 1000;

interface EssayState {
  text: string;
}

/**
 * Free answer (essay, answers to questions). Not checked automatically: the
 * teacher reads it, live, and may colour parts of it (highlights.tsx). Up to
 * 3000 characters. There is no "send": the text is saved as it is typed, and
 * the homework is handed in as a whole.
 */
export function EssayBlock({ id, placeholder }: { id: string; placeholder?: string }) {
  const [state, setState, readOnly] = useBlockState<EssayState>(
    id,
    () => ({ text: '' }),
    () => DRAFT_SYNC_MS,
  );
  const { text } = state;
  const { highlights, moveBy, edit } = useBlockHighlights(id);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // What the teacher has selected in the text (the textarea keeps it while a toolbar button is pressed).
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  return (
    <div className="ex-essay-block">
      {/* Grows with the text instead of scrolling inside a small box. */}
      <div className="ex-essay-field">
        <Textarea
          ref={textarea}
          value={text}
          onChange={(e) => {
            const next = e.currentTarget.value;
            // The teacher's colours follow what is typed.
            moveBy(text, next);
            setState({ text: next });
          }}
          placeholder={readOnly ? t('exercise.noAnswerYet') : (placeholder ?? t('exercise.answerPlaceholder'))}
          readOnly={readOnly}
          onSelect={(e) => setSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
          maxLength={MAX_LENGTH}
          autosize
          minRows={4}
          aria-label={t('exercise.yourAnswer')}
        />
        <HighlightLayer textarea={textarea} text={text} highlights={highlights} />
      </div>
      {readOnly && edit && text && (
        <HighlightToolbar
          text={text}
          highlights={highlights}
          target={targetOf(selection, highlights, text.length)}
          edit={edit}
        />
      )}
      {text.length >= COUNTER_FROM && (
        <Text size="sm" c={text.length >= MAX_LENGTH ? 'red' : 'dimmed'} ta="right">
          {text.length} / {MAX_LENGTH}
        </Text>
      )}
    </div>
  );
}

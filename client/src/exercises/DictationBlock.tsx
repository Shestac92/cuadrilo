import { alignDictation, type DictationState, isDictationRight } from '@cuadrilo/shared/dictation';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconCheck, IconPlayerPauseFilled, IconVolume, IconX } from '@tabler/icons-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { Celebration } from './Exercise';
import { SLOW_RATE } from './MediaBlocks';
import { useBlockState } from './sync';
import { useViewMode } from './viewMode';

interface Sentence {
  src: string;
  text: string;
}

/** The sentence that is playing now: starting another one (or leaving the page) stops it. */
let playing: HTMLAudioElement | null = null;

/**
 * The two buttons of a sentence: listen, and listen slowly (the player's slow mode,
 * SLOW_RATE). Pressing the one that is playing pauses it. There is no limit of plays.
 */
function SentenceAudio({
  src,
  n,
  reserve,
  children,
}: {
  src: string;
  n: number;
  reserve?: boolean;
  children?: ReactNode;
}) {
  const audio = useRef<HTMLAudioElement | undefined>(undefined);
  // 1 = normal, SLOW_RATE = slow; null: nothing is playing.
  const [rate, setRate] = useState<number | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (playing === audio.current) playing = null;
    },
    [],
  );

  const play = (wanted: number) => {
    let element = audio.current;
    if (!element) {
      element = new Audio(src);
      element.addEventListener('ended', () => setRate(null));
      element.addEventListener('pause', () => setRate(null));
      audio.current = element;
    }
    if (rate === wanted) return element.pause();
    if (playing && playing !== element) playing.pause();
    playing = element;
    element.currentTime = 0;
    element.playbackRate = wanted;
    setRate(wanted);
    void element.play().catch(() => setRate(null));
  };

  return (
    <div className={`dictation-audio ${reserve ? 'reserve' : ''}`}>
      <Tooltip label={t('exercise.playAudio')}>
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          radius="xl"
          aria-label={t('exercise.listenSentence', { n })}
          onClick={() => play(1)}
        >
          {rate === 1 ? <IconPlayerPauseFilled size={18} /> : <IconVolume size={18} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t('exercise.slower')}>
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          radius="xl"
          aria-label={t('exercise.listenSentenceSlowly', { n })}
          onClick={() => play(SLOW_RATE)}
        >
          {rate === SLOW_RATE ? <IconPlayerPauseFilled size={18} /> : '🐢'}
        </ActionIcon>
      </Tooltip>
      {children}
    </div>
  );
}

/**
 * Dictation: the student listens to each sentence and types it. Each sentence has
 * its own check button, which marks the typed words of that sentence, green when it is where the right sentence has it, red
 * when not (shared/src/dictation.ts); a word left out is marked "…" where it
 * belongs. A sentence that is right is locked; the others stay open: the student
 * listens again, corrects the field (its marks go away while they type) and
 * checks that sentence again, until everything is right. The right sentence is not shown to
 * the student. The teacher sees it under each sentence, as the key.
 */
export function DictationBlock({ id, sentences }: { id: string; sentences: Sentence[] }) {
  const [state, setState, readOnly] = useBlockState<DictationState>(id, () => ({
    answers: sentences.map(() => ''),
    checked: sentences.map(() => false),
  }));
  const [drafts, setDrafts] = useState<string[]>(() => state.answers);
  const teacherView = useViewMode() === 'teacher';
  const saved = (i: number) => state.answers[i] ?? '';
  const wasChecked = (i: number) => state.checked[i] === true;
  const isRight = (i: number) => wasChecked(i) && isDictationRight(sentences[i].text, saved(i));
  const allRight = sentences.every((_, i) => isRight(i));
  // Something typed (or corrected) in this sentence that has not been checked yet.
  const hasNew = (i: number) =>
    !isRight(i) && (drafts[i] ?? '').trim() !== '' && (!wasChecked(i) || drafts[i] !== saved(i));
  const check = (i: number) =>
    setState({
      answers: sentences.map((_, k) => (k === i ? (drafts[k] ?? '') : saved(k))),
      checked: sentences.map((_, k) => k === i || wasChecked(k)),
    });

  return (
    <div className="ex-dictation ex-interactive">
      {sentences.map((sentence, i) => {
        const locked = readOnly || isRight(i);
        // The marks belong to the checked text: they go away while the student corrects it.
        const marked = wasChecked(i) && (readOnly || drafts[i] === saved(i));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the sentences have no ids; the answers are saved by position.
          <div key={i} className="dictation-row">
            <SentenceAudio src={sentence.src} n={i + 1} reserve={!readOnly && !allRight}>
              {!readOnly && !isRight(i) && (
                <Tooltip label={t('exercise.check')}>
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    radius="xl"
                    aria-label={t('exercise.check')}
                    disabled={!hasNew(i)}
                    onClick={() => check(i)}
                  >
                    <IconCheck size={18} />
                  </ActionIcon>
                </Tooltip>
              )}
            </SentenceAudio>
            <div className="dictation-main">
              <input
                className="dictation-input"
                value={readOnly ? saved(i) : (drafts[i] ?? '')}
                onChange={(e) => setDrafts((list) => list.map((v, k) => (k === i ? e.target.value : v)))}
                readOnly={locked}
                aria-label={t('exercise.sentence', { n: i + 1 })}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {marked && (
                <div className="dictation-result">
                  {alignDictation(sentence.text, saved(i)).map((word, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: words of an answer, never reordered: the position is their identity.
                    <span key={k} className={`dictation-word ${word.kind === 'ok' ? 'ok' : 'bad'} ${word.kind}`}>
                      {word.text}
                      {word.kind === 'ok' ? <IconCheck size={14} /> : <IconX size={14} />}
                    </span>
                  ))}
                </div>
              )}
              {teacherView && (
                <span className="gap-key" title={t('viewMode.rightAnswer')}>
                  {sentence.text}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <Celebration blockId={id} done={allRight} />
    </div>
  );
}

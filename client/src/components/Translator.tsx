import { DICTIONARY_SOURCE, type LookupResult, VOCABULARY_TRANSLATIONS } from '@cuadrilo/shared/api';
import { Button, CloseButton, Group, Loader, Paper, Text } from '@mantine/core';
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '../api';
import { useUser } from '../auth';
import { useConfig } from '../config';
import { t } from '../i18n';

/**
 * The translator: a click on a word of the lesson shows its lemma(s) with
 * translations (offline dictionary, server/src/dictionary.ts), for students
 * and teachers; only a student can save a lemma to their vocabulary. Controls (inputs, buttons, draggable
 * word chips) are never translated: a press on them is a drag or a move, so it must not compete with the
 * dictionary. Selecting text does not open it.
 */

/** Clicks on these keep their own meaning (a click never translates them). */
const NOT_TRANSLATED = 'input, textarea, select, button, a, [role="button"], .word-chip, [data-no-translate]';
const LETTER = /[\p{L}-]/u;
const ONE_WORD = /^\p{L}+(?:-\p{L}+)?$/u;

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** The word under the point (letters, maybe one hyphen), if the point is really on it. */
function wordAt(x: number, y: number): string | undefined {
  const doc = document as CaretDocument;
  let node: Node | undefined;
  let offset = 0;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range) return undefined;
    node = range.startContainer;
    offset = range.startOffset;
  }
  if (node.nodeType !== Node.TEXT_NODE) return undefined;
  const { text, pieces } = textAround(node as Text);
  const caret = (pieces.find((piece) => piece.node === node)?.from ?? 0) + offset;
  let start = caret;
  let end = caret;
  while (start > 0 && LETTER.test(text[start - 1])) start--;
  while (end < text.length && LETTER.test(text[end])) end++;
  // Hyphens at the edges are dashes, not part of the word.
  while (text[start] === '-' && start < end) start++;
  while (text[end - 1] === '-' && end > start) end--;
  const word = text.slice(start, end);
  if (!ONE_WORD.test(word)) return undefined;
  // The caret is the nearest one: a click in the space between words must not count.
  const first = pieces.filter((piece) => piece.from <= start).pop();
  const last = pieces.filter((piece) => piece.from < end).pop();
  if (!first || !last) return undefined;
  const range = document.createRange();
  range.setStart(first.node, start - first.from);
  range.setEnd(last.node, end - last.from);
  const inside = [...range.getClientRects()].some(
    (rect) => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1,
  );
  return inside ? word : undefined;
}

/** What breaks a word even when no space is there: a gap, a line break, a picture, a box of its own. */
const WORD_BREAKS = new Set(['BR', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'IMG', 'AUDIO', 'VIDEO', 'SVG']);

/**
 * The text of the node's block as one string, with where each text node starts in
 * it: a word cut by markup (le<b>y</b>endo) is still one word. A break between
 * two nodes shows as a newline.
 */
function textAround(node: Text): { text: string; pieces: { node: Text; from: number }[] } {
  let block = node.parentElement;
  while (block?.parentElement && getComputedStyle(block).display === 'inline') block = block.parentElement;
  const pieces: { node: Text; from: number }[] = [];
  let text = '';
  if (!block) return { text: node.data, pieces: [{ node, from: 0 }] };
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.nodeType === Node.TEXT_NODE) {
      pieces.push({ node: current as Text, from: text.length });
      text += (current as Text).data;
    } else if (WORD_BREAKS.has((current as Element).tagName.toUpperCase()) || isBox(current as Element)) {
      text += '\n';
    }
  }
  return { text, pieces };
}

/** An element that is not part of the line of text: a block, an inline-block (a chip, a gap), a flex box. */
const isBox = (element: Element) => {
  const display = getComputedStyle(element).display;
  return display !== 'inline' && display !== 'contents' && display !== 'none';
};

interface Lookup {
  word: string;
  /** Where the popup goes (viewport coordinates). */
  x: number;
  y: number;
}

/** Wraps lesson content: a click on a word opens the translation. */
export function TranslatorArea({
  lessonId,
  className,
  children,
}: {
  lessonId?: number;
  className?: string;
  children: ReactNode;
}) {
  const [lookup, setLookup] = useState<Lookup>();
  const close = useCallback(() => setLookup(undefined), []);
  // No dictionary for this installation's pair of languages: words do nothing (until the server answers, they do).
  const translating = useConfig()?.dictionary !== false;

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!translating) return;
    if ((e.target as Element).closest(NOT_TRANSLATED)) return;
    if (!window.getSelection()?.isCollapsed) return;
    const word = wordAt(e.clientX, e.clientY);
    if (word) setLookup({ word, x: e.clientX, y: e.clientY });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: not a control: it catches clicks on words in the text inside (event delegation) to show their translation.
    <div className={className} onClick={onClick}>
      {children}
      {lookup && (
        <TranslationPopup
          key={`${lookup.word}:${lookup.x}:${lookup.y}`}
          {...lookup}
          lessonId={lessonId}
          onClose={close}
        />
      )}
    </div>
  );
}

const POPUP_WIDTH = 320;

function TranslationPopup({ word, x, y, lessonId, onClose }: Lookup & { lessonId?: number; onClose: () => void }) {
  const isStudent = useUser().role === 'student';
  const [results, setResults] = useState<LookupResult[]>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .lookupWord(word)
      .then(setResults, (e: Error) =>
        setError(
          e instanceof ApiError && e.code === 'dictionary_unavailable' ? t('errors.dictionaryUnavailable') : e.message,
        ),
      );
  }, [word]);

  // Closes on Escape, scrolling, or a click elsewhere (a click on another word opens a new popup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, { passive: true });
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const save = async (lemma: string) => {
    try {
      await api.saveWord(word, lemma, lessonId);
      setSaved((set) => new Set(set).add(lemma));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Below the word, kept inside the viewport.
  const left = Math.max(8, Math.min(x - 24, window.innerWidth - POPUP_WIDTH - 8));
  const below = y + 16;
  const style = below + 200 > window.innerHeight ? { left, bottom: window.innerHeight - y + 16 } : { left, top: below };

  return (
    <Paper
      ref={box}
      shadow="md"
      withBorder
      radius="md"
      p="sm"
      className="translator-popup"
      style={{ ...style, width: POPUP_WIDTH }}
      role="dialog"
      aria-label={t('translator.dialog', { word })}
      // Clicks inside do not reach the lesson (they would look up words of the popup).
      onClick={(e) => e.stopPropagation()}
      data-no-translate
    >
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Text fw={700}>{word}</Text>
        <CloseButton size="sm" onClick={onClose} aria-label={t('common.close')} />
      </Group>
      {!results && !error && <Loader size="xs" />}
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      {results?.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('translator.notFound')}
        </Text>
      )}
      {results?.map((r) => (
        <div key={r.lemma} className="translator-result">
          {r.lemma.toLowerCase() !== word.toLowerCase() && (
            <Text size="sm" c="dimmed">
              {r.lemma}
            </Text>
          )}
          <Text size="sm">{r.translations.join(', ')}</Text>
          {isStudent && (
            <Button
              size="compact-xs"
              variant="light"
              mt={4}
              disabled={saved.has(r.lemma)}
              onClick={() => save(r.lemma)}
              title={t('translator.saveHint', { n: VOCABULARY_TRANSLATIONS })}
            >
              {saved.has(r.lemma) ? t('translator.saved') : t('translator.save')}
            </Button>
          )}
        </div>
      ))}
      <Text size="xs" c="dimmed" mt="xs">
        {t('translator.source', { source: DICTIONARY_SOURCE })}
      </Text>
    </Paper>
  );
}

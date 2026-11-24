import {
  type EditHighlightsInput,
  HIGHLIGHT_COLORS,
  type Highlight,
  type HighlightColor,
  type HighlightsEvent,
  isMarked,
  type LessonHighlights,
  type MarksPatch,
  rebaseHighlights,
} from '@cuadrilo/shared/highlights';
import { ActionIcon, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconEraser, IconStrikethrough, IconUnderline, IconWaveSine } from '@tabler/icons-react';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../api';
import { t } from '../i18n';
import { useLive } from '../liveConnection';

/**
 * The teacher's colours on the essays of a lesson, for the student's page: the
 * saved ones at load, then every change the teacher makes (the `highlights`
 * event of /live). The student's own typing moves them at once (`moveBy`);
 * the server does the same on its side, so its events for that (`reason:
 * edit`) are not needed here.
 */

interface HighlightsContextValue {
  /** The highlights of an answer block ([] while there are none). */
  of: (blockId: string) => Highlight[];
  /** The text of an answer changed in this page: its highlights follow. */
  moveBy: (blockId: string, oldText: string, newText: string) => void;
  /** The teacher's page: colour or uncolour a part of the answer (rejects with the server's message). */
  edit?: (blockId: string, edit: EditHighlightsInput) => Promise<void>;
}

const NO_HIGHLIGHTS: Highlight[] = [];
const HighlightsContext = createContext<HighlightsContextValue | null>(null);

/** Student's lesson page: loads and follows the teacher's highlights. */
export function StudentHighlights({ lessonId, children }: { lessonId: number; children: ReactNode }) {
  const { socket } = useLive();
  const [all, setAll] = useState<LessonHighlights>({});

  useEffect(() => {
    api.getLessonHighlights(lessonId).then(setAll, () => {});
  }, [lessonId]);

  useEffect(() => {
    if (!socket) return;
    const onHighlights = (event: HighlightsEvent) => {
      if (event.lessonId !== lessonId || event.reason !== 'teacher') return;
      setAll((current) => ({ ...current, [event.blockId]: event.highlights }));
    };
    socket.on('highlights', onHighlights);
    return () => {
      socket.off('highlights', onHighlights);
    };
  }, [socket, lessonId]);

  const moveBy = useCallback((blockId: string, oldText: string, newText: string) => {
    setAll((current) => {
      const list = current[blockId];
      if (!list) return current;
      return { ...current, [blockId]: rebaseHighlights(oldText, newText, list) };
    });
  }, []);

  const value = useMemo<HighlightsContextValue>(
    () => ({ of: (blockId) => all[blockId] ?? NO_HIGHLIGHTS, moveBy }),
    [all, moveBy],
  );
  return <HighlightsContext.Provider value={value}>{children}</HighlightsContext.Provider>;
}

/** Teacher's page: one student's essays with their colours, which the teacher can change. */
export function TeacherHighlights({
  lessonId,
  studentId,
  children,
}: {
  lessonId: number;
  studentId: number;
  children: ReactNode;
}) {
  const { socket } = useLive();
  const [all, setAll] = useState<LessonHighlights>({});

  // Another student or lesson: theirs.
  useEffect(() => {
    let current = true;
    setAll({});
    api.getStudentHighlights(lessonId, studentId).then(
      (loaded) => current && setAll(loaded),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [lessonId, studentId]);

  // Every change, by this teacher in another tab, by another teacher, or by the student's typing.
  useEffect(() => {
    if (!socket) return;
    const onHighlights = (event: HighlightsEvent) => {
      if (event.lessonId !== lessonId || event.studentId !== studentId) return;
      setAll((current) => ({ ...current, [event.blockId]: event.highlights }));
    };
    socket.on('highlights', onHighlights);
    return () => {
      socket.off('highlights', onHighlights);
    };
  }, [socket, lessonId, studentId]);

  const edit = useCallback(
    async (blockId: string, change: EditHighlightsInput) => {
      const highlights = await api.editHighlights(lessonId, studentId, blockId, change);
      setAll((current) => ({ ...current, [blockId]: highlights }));
    },
    [lessonId, studentId],
  );

  const value = useMemo<HighlightsContextValue>(
    () => ({ of: (blockId) => all[blockId] ?? NO_HIGHLIGHTS, moveBy: () => {}, edit }),
    [all, edit],
  );
  return <HighlightsContext.Provider value={value}>{children}</HighlightsContext.Provider>;
}

/** The teacher's highlights of a student's essays when there is a lesson and a student; plain children otherwise. */
export function MaybeHighlights({
  lessonId,
  studentId,
  children,
}: {
  lessonId: number | null | undefined;
  studentId: number | undefined;
  children: ReactNode;
}) {
  if (lessonId === null || lessonId === undefined || studentId === undefined) return children;
  return (
    <TeacherHighlights lessonId={lessonId} studentId={studentId}>
      {children}
    </TeacherHighlights>
  );
}

/** The highlights of an answer block, the way to tell they must move with the text, and (teacher) to change them. */
export function useBlockHighlights(blockId: string) {
  const ctx = useContext(HighlightsContext);
  return {
    highlights: ctx?.of(blockId) ?? NO_HIGHLIGHTS,
    moveBy: (oldText: string, newText: string) => ctx?.moveBy(blockId, oldText, newText),
    edit: ctx?.edit && ((change: EditHighlightsInput) => ctx.edit?.(blockId, change)),
  };
}

/** The text metrics of the textarea the layer must repeat exactly. */
const MIRRORED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'wordSpacing',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

/**
 * Colours over a textarea: a layer on top of it with the same text laid out
 * the same way, the letters invisible and the highlighted parts on a
 * translucent background. It takes no clicks, so the textarea is used as
 * usual. The textarea grows with its text and never scrolls inside, so the
 * two lay out alike.
 */
export function HighlightLayer({
  textarea,
  text,
  highlights,
}: {
  textarea: RefObject<HTMLTextAreaElement | null>;
  text: string;
  highlights: Highlight[];
}) {
  const [style, setStyle] = useState<Record<string, string>>({});

  // Repeat the textarea's font and spacing (and keep up when it is resized).
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    const copy = () => {
      const computed = getComputedStyle(element);
      setStyle(Object.fromEntries(MIRRORED.map((key) => [key, computed[key]])));
    };
    copy();
    const observer = new ResizeObserver(copy);
    observer.observe(element);
    return () => observer.disconnect();
  }, [textarea]);

  if (highlights.length === 0) return null;

  const parts: ReactNode[] = [];
  let at = 0;
  for (const h of highlights) {
    const start = Math.min(h.start, text.length);
    const end = Math.min(h.end, text.length);
    if (start >= end || start < at) continue;
    if (start > at) parts.push(text.slice(at, start));
    // The underline outside, the line through inside: two lines of different kinds in one place need two elements.
    const shown = h.strike ? <span className="ex-strike">{text.slice(start, end)}</span> : text.slice(start, end);
    const classes = [
      'ex-highlight',
      h.color && `ex-highlight-tinted ex-highlight-${h.color}`,
      h.underline && `ex-underline-${h.underline}`,
    ];
    parts.push(
      <mark key={`${h.start}-${h.end}`} className={classes.filter(Boolean).join(' ')}>
        {shown}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));

  return (
    <div className="ex-highlight-layer" aria-hidden>
      <div className="ex-highlight-text" style={style}>
        {parts}
      </div>
    </div>
  );
}

/** The part of the text the teacher is pointing at: the selection, or the highlight the cursor is in (to uncolour it). */
export interface Target {
  start: number;
  end: number;
  /** The cursor is in a coloured part and nothing is selected: it can only be uncoloured. */
  fromCursor: boolean;
}

export function targetOf(selection: { start: number; end: number }, highlights: Highlight[], length: number) {
  const start = Math.min(selection.start, length);
  const end = Math.min(selection.end, length);
  if (start < end) return { start, end, fromCursor: false } satisfies Target;
  const inside = highlights.find((h) => h.start <= start && start < h.end);
  return inside ? ({ start: inside.start, end: inside.end, fromCursor: true } satisfies Target) : undefined;
}

/** Four colours, a line through, two kinds of line under and an eraser, under an answer the teacher is reading. */
export function HighlightToolbar({
  text,
  highlights,
  target,
  edit,
}: {
  text: string;
  highlights: Highlight[];
  target: Target | undefined;
  edit: (change: EditHighlightsInput) => Promise<void> | undefined;
}) {
  const [error, setError] = useState<string>();
  // A new selection is a new start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the target is the trigger.
  useEffect(() => setError(undefined), [target?.start, target?.end]);

  const apply = async (change: (quote: string, target: Target) => EditHighlightsInput) => {
    if (!target) return;
    setError(undefined);
    try {
      await edit(change(text.slice(target.start, target.end), target));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const quoted = target ? text.slice(target.start, target.end) : '';

  return (
    <div className="ex-highlight-toolbar" role="toolbar" aria-label={t('highlights.toolbar')}>
      <Group gap="xs" wrap="wrap">
        {HIGHLIGHT_COLORS.map((color) => (
          <Tooltip key={color} label={t(`highlights.${color}`)}>
            <UnstyledButton
              className={`ex-swatch ex-highlight-${color}`}
              disabled={!target || target.fromCursor}
              aria-label={t(`highlights.${color}`)}
              // The selection stays in the text when a button is pressed.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                apply((quote, { start, end }) => ({
                  paint: { start, end, quote, color: color satisfies HighlightColor },
                }))
              }
            />
          </Tooltip>
        ))}
        {/* Toggles: on the whole selection already → off, otherwise on. */}
        {(
          [
            ['strike', IconStrikethrough, (h: Highlight) => !!h.strike, (on: boolean): MarksPatch => ({ strike: !on })],
            [
              'underline',
              IconUnderline,
              (h: Highlight) => h.underline === 'line',
              (on: boolean): MarksPatch => ({ underline: on ? null : 'line' }),
            ],
            [
              'wave',
              IconWaveSine,
              (h: Highlight) => h.underline === 'wave',
              (on: boolean): MarksPatch => ({ underline: on ? null : 'wave' }),
            ],
          ] as const
        ).map(([name, Icon, isOn, patch]) => {
          const on = !!target && !target.fromCursor && isMarked(highlights, target.start, target.end, isOn);
          return (
            <Tooltip key={name} label={t(`highlights.${name}`)}>
              <ActionIcon
                variant={on ? 'filled' : 'default'}
                disabled={!target || target.fromCursor}
                aria-label={t(`highlights.${name}`)}
                aria-pressed={on}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply((quote, { start, end }) => ({ format: { start, end, quote, patch: patch(on) } }))}
              >
                <Icon size={16} />
              </ActionIcon>
            </Tooltip>
          );
        })}
        <Tooltip label={t('highlights.erase')}>
          <ActionIcon
            variant="default"
            disabled={!target}
            aria-label={t('highlights.erase')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply((quote, { start, end }) => ({ erase: { start, end, quote } }))}
          >
            <IconEraser size={16} />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" c={error ? 'red' : 'dimmed'} className="ex-highlight-hint">
          {error ?? (target ? `«${quoted.length > 40 ? `${quoted.slice(0, 40)}…` : quoted}»` : t('highlights.select'))}
        </Text>
      </Group>
    </div>
  );
}

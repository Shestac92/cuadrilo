import { BOARD_TEXT_MAX, type BoardEntry } from '@cuadrilo/shared/board';
import { ActionIcon, Paper, Text, TextInput, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { api } from '../api';
import { useSideMode } from '../components/SideDock';
import { TranslatorArea } from '../components/Translator';
import { t } from '../i18n';
import './board.css';
import { useBoardFeed } from './useBoardFeed';

/** How long a new line stays lit (board.css: board-fresh). */
const FRESH_MS = 4200;

/**
 * A board (pizarra): the feed of plain one-line texts, newest at the bottom,
 * with an input under it when the user can write (during a class: Enter sends).
 * The same panel for the teacher and the students, in the side column of the
 * lesson page (always in view) and on the student's board page (`tall`).
 * Older lines load when the feed is scrolled to its top. A line that someone else
 * writes meanwhile is lit for a few seconds. While the sheet is collapsed to its bar, a count
 * of those lines stays until the lines are on screen.
 * Memoised: the class page renders often (presence of students), and the props are plain values.
 */
export const BoardPanel = memo(function BoardPanel({
  boardId,
  canWrite,
  canDelete,
  translate,
  tall,
  title = true,
  welcome,
}: {
  /** null: no board (a class from before boards were bound to classes). */
  boardId: number | null;
  canWrite: boolean;
  /** The teacher of the class: a 🗑 on every line (to fix a typo: delete it and write it again). */
  canDelete?: boolean;
  /** A click on a word shows its translation. */
  translate?: boolean;
  /** Fills the page's height instead of a small panel. */
  tall?: boolean;
  title?: boolean;
  /** A first line from the platform (not written by anyone). */
  welcome?: string;
}) {
  const { mode, layout, expand } = useSideMode();
  // A new line counts only while the feed is hidden (the collapsed sheet).
  const peeking = mode === 'bar';
  const peekingRef = useRef(peeking);
  peekingRef.current = peeking;
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [unread, setUnread] = useState(0);
  // Lines of this page itself: not lit, not counted (the socket may bring them before the answer of the server).
  const writing = useRef(0);
  const own = useRef(new Set<number>());
  const { entries, hasMore, error, loadOlder, append, remove } = useBoardFeed(boardId, (entry) => {
    if (writing.current > 0 || own.current.has(entry.id)) return;
    setFresh((ids) => new Set(ids).add(entry.id));
    setTimeout(
      () =>
        setFresh((ids) => {
          const rest = new Set(ids);
          rest.delete(entry.id);
          return rest;
        }),
      FRESH_MS,
    );
    if (peekingRef.current) setUnread((count) => count + 1);
  });
  useEffect(() => {
    if (!peeking) setUnread(0);
  }, [peeking]);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string>();
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<{ first?: number; last?: number; height: number }>({ height: 0 });
  // Opening the feed (the sheet) mounts this node: start at the newest line.
  // Stable, so a re-render (typing) does not reset the scroll.
  const setBox = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Keeps the feed where the reader is: at the bottom for a new line (and at the start), in place when older lines arrive on top.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const first = entries[0]?.id;
    const last = entries.at(-1)?.id;
    const before = seen.current;
    if (before.first !== undefined && first !== before.first && last === before.last) {
      el.scrollTop += el.scrollHeight - before.height;
    } else {
      el.scrollTop = el.scrollHeight;
    }
    seen.current = { first, last, height: el.scrollHeight };
  }, [entries]);

  // The input is cleared at once and stays usable: the next line may be typed while this one is sent.
  const send = async () => {
    const line = text;
    if (!line.trim() || boardId === null) return;
    setText('');
    setSendError(undefined);
    writing.current += 1;
    try {
      const entry = await api.writeBoard(boardId, line);
      own.current.add(entry.id);
      append(entry);
    } catch (e) {
      setSendError((e as Error).message);
      // Not lost: back in the input unless another line is already being typed.
      setText((current) => current || line);
    } finally {
      writing.current -= 1;
    }
  };

  const removeLine = useCallback(
    async (entryId: number) => {
      if (boardId === null) return;
      setSendError(undefined);
      try {
        await api.deleteBoardEntry(boardId, entryId);
        remove(entryId);
      } catch (e) {
        setSendError((e as Error).message);
      }
    },
    [boardId, remove],
  );

  const lines = (
    <BoardLines
      entries={entries}
      fresh={fresh}
      canDelete={!!canDelete}
      tall={!!tall}
      welcome={welcome}
      showEmpty={entries.length === 0 && !welcome && !error}
      hasMore={hasMore}
      loadOlder={loadOlder}
      onRemove={removeLine}
      setBox={setBox}
    />
  );

  const badge = unread > 0 ? <span className="board-new">{t('board.newCount', { count: unread })}</span> : null;

  const field =
    (canWrite && (
      <TextInput
        mt="xs"
        size={tall ? 'sm' : 'xs'}
        value={text}
        // One line: a pasted text with line breaks becomes one line.
        onChange={(e) => setText(e.currentTarget.value.replace(/[\r\n]+/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void send();
        }}
        maxLength={BOARD_TEXT_MAX}
        placeholder={t('board.placeholder')}
        aria-label={t('board.newLine')}
        error={sendError ?? error}
      />
    )) ||
    null;

  // The phone, collapsed: one last line. A tap opens the sheet.
  if (mode === 'bar') {
    const last = entries.at(-1);
    return (
      <Paper radius={0} p="sm" className="board board-bar">
        <button type="button" className="board-bar-main" onClick={expand} aria-expanded={false}>
          <span className="board-bar-title">{t('board.title')}</span>
          <span className={`board-bar-text ${last && fresh.has(last.id) ? 'fresh' : ''}`}>
            {last ? last.text : t('board.empty')}
          </span>
        </button>
        {badge}
      </Paper>
    );
  }

  return (
    <Paper radius={layout === 'sheet' ? 0 : 'md'} p={tall ? 'lg' : 'sm'} className="board">
      {title && (
        <Title order={5} mb="xs">
          {t('board.title')}
        </Title>
      )}
      {error && !canWrite ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : translate ? (
        <TranslatorArea className="board-feed">{lines}</TranslatorArea>
      ) : (
        <div className="board-feed">{lines}</div>
      )}
      {field}
    </Paper>
  );
});

/**
 * The lines of the feed. Memoised: typing in the input under it renders the panel again at every key,
 * and a feed of many lines (with a 🗑 on each for the teacher) must not follow.
 */
const BoardLines = memo(function BoardLines({
  entries,
  fresh,
  canDelete,
  tall,
  welcome,
  showEmpty,
  hasMore,
  loadOlder,
  onRemove,
  setBox,
}: {
  entries: BoardEntry[];
  fresh: ReadonlySet<number>;
  canDelete: boolean;
  tall: boolean;
  welcome?: string;
  showEmpty: boolean;
  hasMore: boolean;
  loadOlder: () => Promise<void>;
  onRemove: (entryId: number) => Promise<void>;
  setBox: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={setBox}
      className={`board-lines ${tall ? 'tall' : ''}`}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop < 40 && hasMore) void loadOlder();
      }}
    >
      {welcome && <p className="board-welcome">{welcome}</p>}
      {/* Plain text: React escapes it, no Markdown or links. */}
      {entries.map((e) => (
        <p
          key={e.id}
          className={[fresh.has(e.id) ? 'fresh' : '', canDelete ? 'deletable' : ''].join(' ').trim() || undefined}
        >
          <span>{e.text}</span>
          {canDelete && (
            <ActionIcon
              className="board-delete"
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => void onRemove(e.id)}
              aria-label={t('board.deleteLine')}
              title={t('board.deleteLine')}
              data-no-translate
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </p>
      ))}
      {showEmpty && (
        <Text size="sm" c="dimmed">
          {t('board.empty')}
        </Text>
      )}
    </div>
  );
});

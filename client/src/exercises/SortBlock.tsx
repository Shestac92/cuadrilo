import { useDroppable } from '@dnd-kit/core';

import { t } from '../i18n';
import { Celebration } from './Exercise';
import { BANK, PlacementArea, type Word, WordBank, WordChip, type WordDnd } from './placement';
import { useBlockState } from './sync';
import { shuffle } from './text';
import { useViewMode } from './viewMode';

interface Group {
  title: string;
  items: string[];
}

/** The whole state of the block (synced as is): the shuffled words and the group each one was put into. */
interface SortState {
  words: Word[];
  /** Word id → group index; a word not listed is still in the bank. */
  placed: Record<string, number>;
}

const GROUP = 'group-';
const groupTarget = (index: number) => `${GROUP}${index}`;
/** A word's id carries the group it belongs to: `<group>-<item>`. */
const wordId = (group: number, item: number) => `${group}-${item}`;
const rightGroup = (id: string) => Number(id.slice(0, id.indexOf('-')));

/**
 * Sorting: every word waits in the bank and goes into the group it belongs to
 * (singular / plural). A word is checked as soon as it lands: the right one
 * locks, a wrong one stays red and can be moved again. Words are told apart by
 * id, so the same word in two groups is two words.
 */
export function SortBlock({ id, groups }: { id: string; groups: Group[] }) {
  const [state, setState, readOnly, hasState] = useBlockState<SortState>(id, () => ({
    words: shuffle(groups.flatMap((group, g) => group.items.map((text, i): Word => ({ id: wordId(g, i), text })))),
    placed: {},
  }));

  const teacherView = useViewMode() === 'teacher';

  const wordById = (wid: string | null) => state.words.find((w) => w.id === wid);
  const resultOf = (wid: string) => {
    const group = state.placed[wid];
    if (group === undefined) return null;
    return group === rightGroup(wid) ? 'ok' : 'bad';
  };
  const isLocked = (wid: string) => readOnly || resultOf(wid) === 'ok';

  const move = (wid: string, target: string) => {
    if (isLocked(wid)) return;
    setState((s) => {
      const { [wid]: _from, ...rest } = s.placed;
      if (target === BANK) return { ...s, placed: rest };
      if (!target.startsWith(GROUP)) return s;
      return { ...s, placed: { ...rest, [wid]: Number(target.slice(GROUP.length)) } };
    });
  };

  const placement: WordDnd = {
    readOnly,
    wordById,
    isLocked,
    move,
    bank: state.words.filter((w) => state.placed[w.id] === undefined),
    // From the bank a click cannot know the group: only a placed word goes back.
    clickWord: (wid) => state.placed[wid] !== undefined && move(wid, BANK),
  };
  const allCorrect = state.words.every((w) => resultOf(w.id) === 'ok');

  return (
    <div className="ex-sort ex-interactive">
      <PlacementArea placement={placement}>
        {(!teacherView || hasState) && <WordBank placement={placement} />}
        <div className="sort-groups">
          {groups.map((group, g) => (
            <SortGroup
              // biome-ignore lint/suspicious/noArrayIndexKey: the lesson's groups in their fixed order: the position is their identity.
              key={g}
              index={g}
              title={group.title}
              words={state.words.filter((w) => state.placed[w.id] === g)}
              placement={placement}
              resultOf={resultOf}
              // The teacher's view: the group's right words not (rightly) placed yet, in grey; a wrong word names its group.
              ghosts={teacherView ? group.items.filter((_, i) => state.placed[wordId(g, i)] !== g) : undefined}
              rightGroupOf={teacherView ? (wid) => groups[rightGroup(wid)]?.title : undefined}
            />
          ))}
        </div>
      </PlacementArea>
      <Celebration blockId={id} done={allCorrect} />
    </div>
  );
}

function SortGroup({
  index,
  title,
  words,
  placement,
  resultOf,
  ghosts,
  rightGroupOf,
}: {
  index: number;
  title: string;
  words: Word[];
  placement: WordDnd;
  resultOf: (wordId: string) => 'ok' | 'bad' | null;
  ghosts?: string[];
  rightGroupOf?: (wordId: string) => string | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupTarget(index), disabled: placement.readOnly });
  return (
    // biome-ignore lint/a11y/useSemanticElements: a drop zone of word chips (dnd-kit), not a group of form fields.
    <div ref={setNodeRef} className={`sort-group ${isOver ? 'over' : ''}`} role="group" aria-label={title}>
      <div className="sort-group-title">{title}</div>
      <div className="sort-group-items">
        {words.map((word) => (
          <span key={word.id} className={`sort-item ${resultOf(word.id) ?? ''}`}>
            <WordChip word={word} placement={placement} />
            {resultOf(word.id) === 'bad' && rightGroupOf && (
              <span className="gap-key" title={t('viewMode.rightAnswer')}>
                {rightGroupOf(word.id)}
              </span>
            )}
          </span>
        ))}
        {ghosts?.map((text, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the group's words in their fixed order.
          <span key={i} className="word-chip locked ghost">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

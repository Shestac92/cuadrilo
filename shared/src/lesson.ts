import type { Block, Chapter, Exercise, LessonContent } from './lessonSchema';
import { gridRows, isPlacementIntact } from './wordsearch';

/**
 * The lesson document, stored as JSON in lessons.content.
 *
 *   Lesson content
 *   └─ chapters (pages the student flips through; title optional)
 *      └─ exercises (numbered across the lesson, with a task)
 *         └─ blocks: text (Markdown), image, compare, hotspots, video, genially, audio, essay, gaps,
 *                    dictation, wordsearch, drag-gaps, dropdown-gaps, build-word, match, sort, order, choice, true-false, sequence, wheel
 *
 * There is no separate theory: a rule is a text block, an image is an image
 * block, in whatever exercise they belong to.
 *
 * Every chapter, exercise and block has an id that never changes when the
 * lesson is edited: students' answers (block_states), homework and the
 * teacher's "show to student" refer to them. Exercise numbers are not stored;
 * they follow the order in the document.
 *
 * The lesson may be half filled in (the editor saves every change); the player
 * skips empty blocks (isEmptyBlock).
 *
 * Types and helpers for both sides; the validation is in ./lessonSchema.ts.
 */
export type { Block, Chapter, Exercise, LessonContent };

export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;

export const CONTENT_VERSION = 2;

/**
 * The size an image block is shown at: small, medium and large are fixed
 * widths (so pictures of the same size look alike in a row of exercises);
 * 'original' is the picture's own size, down to the page width. A block
 * without `scale` is 'original' (that is how every image looked before the
 * setting existed); a new block gets DEFAULT_IMAGE_SCALE.
 */
export const IMAGE_SCALES = ['s', 'm', 'l', 'original'] as const;
export type ImageScale = (typeof IMAGE_SCALES)[number];
export const DEFAULT_IMAGE_SCALE: ImageScale = 'm';

/**
 * The direction of the line that divides the two pictures of a compare block:
 * 'vertical' (the slider moves left and right, the default) or 'horizontal' (up and down).
 */
export const COMPARE_ORIENTATIONS = ['vertical', 'horizontal'] as const;
export type CompareOrientation = (typeof COMPARE_ORIENTATIONS)[number];

/** The proportions of the frame a Genially is shown in (width : height); 16:9 is the default, as in Genially's own embed code. */
export const GENIALLY_RATIOS = ['16:9', '4:3', '1:1', '3:4'] as const;
export type GeniallyRatio = (typeof GENIALLY_RATIOS)[number];

/** The scale an image block is shown at (an old block has none: original). */
export const imageScaleOf = (block: { scale?: ImageScale }): ImageScale => block.scale ?? 'original';

/** Block types the student answers (the rest is shown only; the wheel is played, nothing of it is saved). */
const ANSWER_BLOCKS: ReadonlySet<Block['type']> = new Set([
  'essay',
  'gaps',
  'drag-gaps',
  'dropdown-gaps',
  'build-word',
  'match',
  'sort',
  'order',
  'choice',
  'true-false',
  'sequence',
  'hotspots',
  'dictation',
  'wordsearch',
]);

/** Whether blocks of this type are answered by the student. */
export const isAnswerType = (type: Block['type']): boolean => ANSWER_BLOCKS.has(type);

export const newId = () => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** A new lesson: one empty chapter. */
export const emptyContent = (): LessonContent => ({
  version: CONTENT_VERSION,
  chapters: [{ id: newId(), exercises: [] }],
});

export interface ExerciseRef {
  exercise: Exercise;
  /** 1-based, across the lesson. */
  number: number;
  chapterIndex: number;
}

/** Exercises in lesson order with their numbers. */
export function listExercises(content: LessonContent): ExerciseRef[] {
  const refs: ExerciseRef[] = [];
  let numbered = 0;
  content.chapters.forEach((chapter, chapterIndex) => {
    for (const exercise of chapter.exercises) refs.push({ exercise, number: numbered + refs.length + 1, chapterIndex });
    // A chapter closed to the student: its exercises are not sent, but they take their numbers.
    numbered += chapter.exerciseCount ?? 0;
  });
  return refs;
}

/** Exercise number (1-based, across the lesson) by exercise id. */
export const exerciseNumbers = (content: LessonContent): Map<string, number> =>
  new Map(listExercises(content).map((ref) => [ref.exercise.id, ref.number]));

/**
 * A homework as a lesson: the given exercises in lesson order on one page (a
 * single chapter, no tabs: splitting a few exercises by chapters is a nuisance).
 * Numbers are those of the whole lesson: take them from `exerciseNumbers` of the
 * full content. No exercises → no chapters.
 */
export const homeworkContent = (content: LessonContent, ids: ReadonlySet<string>): LessonContent => {
  const chapters = content.chapters.filter((chapter) => chapter.exercises.some((e) => ids.has(e.id)));
  const exercises = chapters.flatMap((chapter) => chapter.exercises.filter((e) => ids.has(e.id)));
  return { ...content, chapters: chapters.length > 0 ? [{ ...chapters[0], title: undefined, exercises }] : [] };
};

/**
 * What a student is sent of a lesson: the chapters not in `open` (null: all are open)
 * are empty and marked `locked`; the title and the count of exercises stay.
 */
export function lockChapters(content: LessonContent, open: ReadonlySet<string> | null): LessonContent {
  if (!open) return content;
  return {
    ...content,
    chapters: content.chapters.map((chapter) =>
      open.has(chapter.id)
        ? chapter
        : {
            id: chapter.id,
            title: chapter.title,
            exercises: [],
            locked: true,
            exerciseCount: chapter.exercises.length,
          },
    ),
  };
}

/** The chapter that has the block (answers are accepted only from the chapters that are open). */
export function chapterOfBlock(content: LessonContent, blockId: string): string | undefined {
  return content.chapters.find((c) => c.exercises.some((e) => e.blocks.some((b) => b.id === blockId)))?.id;
}

/** The chapter that has the exercise. */
export function chapterOfExercise(content: LessonContent, exerciseId: string): string | undefined {
  return content.chapters.find((c) => c.exercises.some((e) => e.id === exerciseId))?.id;
}

/** The block with this id (nested loops, stopping at the match: answers are checked against it on every save). */
function findBlock(content: LessonContent, blockId: string): Block | undefined {
  for (const chapter of content.chapters) {
    for (const exercise of chapter.exercises) {
      for (const block of exercise.blocks) if (block.id === blockId) return block;
    }
  }
  return undefined;
}

/** Whether the block is an essay of the lesson (the teacher may colour parts of its text). */
export function isEssayBlock(content: LessonContent, blockId: string): boolean {
  return findBlock(content, blockId)?.type === 'essay';
}

/** The items of the wheel block with this id as the student gets them (filled-in ones); undefined if it is not a wheel. */
export function playableWheelItems(content: LessonContent, blockId: string): string[] | undefined {
  const block = findBlock(content, blockId);
  if (block?.type !== 'wheel') return undefined;
  const playable = toPlayableBlock(block);
  return playable?.type === 'wheel' ? playable.items : [];
}

/** Whether a chapter / exercise id exists (teacher's "show to student"). */
export function hasChapter(content: LessonContent, chapterId: string): boolean {
  return content.chapters.some((c) => c.id === chapterId);
}

export function hasExercise(content: LessonContent, chapterId: string, exerciseId: string): boolean {
  return content.chapters.some((c) => c.id === chapterId && c.exercises.some((e) => e.id === exerciseId));
}

/** Whether the block is an answer block of the lesson (answers to other ids are rejected). */
export function isAnswerBlock(content: LessonContent, blockId: string): boolean {
  const block = findBlock(content, blockId);
  return block !== undefined && ANSWER_BLOCKS.has(block.type);
}

const isFilled = (text: string) => text.trim() !== '';

type Pair = { left: string; right: string };
const isCompletePair = (pair: Pair) => isFilled(pair.left) && isFilled(pair.right);

type Group = BlockOf<'sort'>['groups'][number];
/** A group with a title and at least one filled item; empty items are left out. */
function toPlayableGroup(group: Group): Group | null {
  if (!isFilled(group.title)) return null;
  const items = keepOnly(group.items, isFilled);
  if (items.length === 0) return null;
  return items === group.items ? group : { ...group, items };
}

type Question = BlockOf<'choice'>['questions'][number];
/** A question with its text, filled options and at least one right one; empty options are left out. */
function toPlayableQuestion(question: Question): Question | null {
  if (!isFilled(question.question)) return null;
  const options = keepOnly(question.options, (option) => isFilled(option.text));
  if (!options.some((option) => option.correct)) return null;
  return options === question.options ? question : { ...question, options };
}

/**
 * Gap markup in fill-in and drag-into-gaps texts: `*answer*`, alternatives
 * `*goes|drives*`. Global: use with matchAll / match (client/src/exercises/text.ts).
 */
export const GAP_MARKUP = /\*([^*]+)\*/g;

/**
 * Dropdown markup in dropdown-gaps texts: `{tengo|*tienes*|tiene}`, the options
 * split by `|`, the right one(s) between asterisks. Global, like GAP_MARKUP.
 */
export const DROPDOWN_MARKUP = /\{([^{}]+)\}/g;

/** One dropdown's body (what is between the braces): its options and which of them are right. */
export function parseDropdown(body: string): { options: string[]; answers: string[] } {
  const options: string[] = [];
  const answers: string[] = [];
  for (const raw of body.split('|')) {
    const marked = /^\s*\*([^*]*)\*\s*$/.exec(raw);
    const option = (marked ? marked[1] : raw).trim();
    if (!option) continue;
    options.push(option);
    if (marked) answers.push(option);
  }
  return { options, answers };
}

/** Whether the text has a dropdown with a choice (two options) and a right option. */
function hasDropdown(text: string): boolean {
  for (const [, body] of text.matchAll(DROPDOWN_MARKUP)) {
    const { options, answers } = parseDropdown(body);
    if (options.length >= 2 && answers.length > 0) return true;
  }
  return false;
}

/** Words to build: at most this many in a block, each at most this long (spaces included). */
export const BUILD_WORD_MAX_WORDS = 20;
export const BUILD_WORD_MAX_LENGTH = 30;

/**
 * The letters of a word to build, in groups: one group per word of a phrase
 * (a space is not a letter, only a gap between groups). Letters are characters
 * of the composed (NFC) text, so `ñ` or `á` is one letter, never two.
 */
export function wordLetters(text: string): string[][] {
  return text
    .normalize('NFC')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word));
}

/** Whether the text has a gap with at least one answer (`* *` is not one). */
function hasGapWithAnswer(text: string): boolean {
  for (const [, answers] of text.matchAll(GAP_MARKUP)) if (answers.split('|').some(isFilled)) return true;
  return false;
}

/** The list without the items that fail the check; the same array if all pass (so memos keyed on it hold). */
function keepOnly<T>(list: T[], passes: (item: T) => boolean): T[] {
  const kept = list.filter(passes);
  return kept.length === list.length ? list : kept;
}

/**
 * The block as the student gets it, or null while there is nothing to show
 * (just added in the editor, half filled in). Half-filled match pairs, sort
 * groups, order sentences, test questions (no text or no right option), true/false
 * statements and sequence items are left out. The player shows only these.
 */
export function toPlayableBlock(block: Block): Block | null {
  switch (block.type) {
    case 'text':
      return isFilled(block.markdown) ? block : null;
    case 'image':
    case 'audio':
      return block.src ? block : null;
    case 'compare':
      return block.before && block.after ? block : null;
    case 'hotspots':
      return block.src && block.hotspots.length > 0 ? block : null;
    case 'video':
      return block.youtubeId ? block : null;
    case 'genially':
      return block.geniallyId ? block : null;
    case 'essay':
      return block;
    case 'gaps':
    case 'drag-gaps':
      return hasGapWithAnswer(block.text) ? block : null;
    case 'dropdown-gaps':
      return hasDropdown(block.text) ? block : null;
    case 'build-word': {
      const words = keepOnly(block.words, (word) => isFilled(word.text));
      if (words.length === 0) return null;
      return words === block.words ? block : { ...block, words };
    }
    case 'dictation': {
      const sentences = keepOnly(block.sentences, (sentence) => !!sentence.src && isFilled(sentence.text));
      if (sentences.length === 0) return null;
      return sentences === block.sentences ? block : { ...block, sentences };
    }
    case 'wordsearch': {
      // Only the words that really lie in the grid (the teacher may have changed the words or a letter since).
      const rows = gridRows(block.grid);
      const placements = keepOnly(block.placements, (placement) => isPlacementIntact(rows, placement));
      if (placements.length === 0) return null;
      return placements === block.placements ? block : { ...block, placements };
    }
    case 'match': {
      const pairs = keepOnly(block.pairs, isCompletePair);
      if (pairs.length === 0) return null;
      return pairs === block.pairs ? block : { ...block, pairs };
    }
    case 'sort': {
      // Sorting needs at least two groups to choose between.
      const playable = block.groups.map(toPlayableGroup);
      const groups = playable.filter((group): group is Group => group !== null);
      if (groups.length < 2) return null;
      return playable.every((group, i) => group === block.groups[i]) ? block : { ...block, groups };
    }
    case 'order': {
      const sentences = keepOnly(block.sentences, (sentence) => isFilled(sentence.text));
      if (sentences.length === 0) return null;
      return sentences === block.sentences ? block : { ...block, sentences };
    }
    case 'choice': {
      const playable = block.questions.map(toPlayableQuestion);
      const questions = playable.filter((question): question is Question => question !== null);
      if (questions.length === 0) return null;
      return playable.every((question, i) => question === block.questions[i]) ? block : { ...block, questions };
    }
    case 'true-false': {
      const statements = keepOnly(block.statements, (statement) => isFilled(statement.text));
      if (statements.length === 0) return null;
      return statements === block.statements ? block : { ...block, statements };
    }
    case 'sequence': {
      // Ordering needs at least two.
      const items = keepOnly(block.items, isFilled);
      if (items.length < 2) return null;
      return items === block.items ? block : { ...block, items };
    }
    case 'wheel': {
      // A wheel needs at least two items to choose between.
      const items = keepOnly(block.items, isFilled);
      if (items.length < 2) return null;
      return items === block.items ? block : { ...block, items };
    }
  }
}

/** Nothing to show yet (see toPlayableBlock). */
export const isEmptyBlock = (block: Block) => toPlayableBlock(block) === null;

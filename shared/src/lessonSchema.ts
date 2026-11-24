import { z } from 'zod';

import { AUDIO_TYPES, IMAGE_TYPES } from './api';
import { DICTATION_MAX_SENTENCES, DICTATION_TEXT_MAX } from './dictation';
import { HOTSPOT_MIN_RADIUS, HOTSPOT_MIN_SIDE, HOTSPOTS_MAX } from './hotspots';
import {
  BUILD_WORD_MAX_LENGTH,
  BUILD_WORD_MAX_WORDS,
  COMPARE_ORIENTATIONS,
  CONTENT_VERSION,
  emptyContent,
  GENIALLY_RATIOS,
  IMAGE_SCALES,
} from './lesson';
import { WORDSEARCH_DIRECTIONS, WORDSEARCH_INPUT_MAX, WORDSEARCH_MAX_SIZE, WORDSEARCH_MAX_WORDS } from './wordsearch';

/**
 * Validation of the lesson document (structure: ./lesson.ts). Server-side: the
 * client imports only the types from here, so zod stays out of its bundle.
 */

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
/**
 * Only files stored by the server (/media/<sha256>.<ext>): nothing is loaded
 * from other sites. Empty until the teacher uploads the file.
 */
const mediaUrl = (types: Record<string, string>) =>
  z
    .string()
    .regex(new RegExp(`^(/media/[a-f0-9]{64}\\.(${Object.keys(types).join('|')}))?$`), 'Not a stored media file');
const text = (max: number) => z.string().max(max);
const fraction = z.number().min(0).max(1);
const hotspot = z.discriminatedUnion('shape', [
  z.object({ id, shape: z.literal('circle'), x: fraction, y: fraction, r: z.number().min(HOTSPOT_MIN_RADIUS).max(1) }),
  z.object({
    id,
    shape: z.literal('rect'),
    x: fraction,
    y: fraction,
    w: z.number().min(HOTSPOT_MIN_SIDE).max(1),
    h: z.number().min(HOTSPOT_MIN_SIDE).max(1),
  }),
]);

/** The wheel: at most this many items (like the hours on a clock), each a few words. */
export const WHEEL_MAX_ITEMS = 12;
export const WHEEL_ITEM_MAX = 80;

// The teacher's editor saves on every change, so a lesson may be half filled
// in: empty texts, lists and media are valid (the player skips empty blocks).
const block = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('text'), markdown: text(20_000) }),
  z.object({
    id,
    type: z.literal('image'),
    src: mediaUrl(IMAGE_TYPES),
    alt: text(500).optional(),
    caption: text(500).optional(),
    // How big the picture is shown (shared/src/lesson.ts); missing = 'original', as before it existed.
    scale: z.enum(IMAGE_SCALES).optional(),
  }),
  // Two pictures with a slider between them (before / after); nothing is answered or saved.
  z.object({
    id,
    type: z.literal('compare'),
    before: mediaUrl(IMAGE_TYPES),
    after: mediaUrl(IMAGE_TYPES),
    // The direction of the dividing line: 'vertical' (moves left and right) is the default, as in H5P.
    orientation: z.enum(COMPARE_ORIENTATIONS).optional(),
    caption: text(500).optional(),
    scale: z.enum(IMAGE_SCALES).optional(),
  }),
  // A picture with zones to find by clicking (shared/src/hotspots.ts: the zones are fractions of the picture).
  z.object({
    id,
    type: z.literal('hotspots'),
    src: mediaUrl(IMAGE_TYPES),
    hotspots: z.array(hotspot).max(HOTSPOTS_MAX),
    caption: text(500).optional(),
    scale: z.enum(IMAGE_SCALES).optional(),
  }),
  z.object({
    id,
    type: z.literal('video'),
    youtubeId: z.string().regex(/^([A-Za-z0-9_-]{11})?$/, 'Invalid YouTube id'),
    title: text(300),
    start: z.number().int().min(0).optional(),
  }),
  // A Genially (genially.com) shown in a frame; the exercise is played inside it, nothing is answered or saved here.
  z.object({
    id,
    type: z.literal('genially'),
    geniallyId: z.string().regex(/^([0-9a-f]{24})?$/, 'Invalid Genially id'),
    ratio: z.enum(GENIALLY_RATIOS).optional(),
  }),
  z.object({ id, type: z.literal('audio'), src: mediaUrl(AUDIO_TYPES), title: text(300).optional() }),
  z.object({ id, type: z.literal('essay'), placeholder: text(300).optional() }),
  // Gap markup: `*answer*`, alternatives `*a|b*` (client/src/exercises/text.ts).
  z.object({ id, type: z.literal('gaps'), text: text(20_000) }),
  z.object({
    id,
    type: z.literal('drag-gaps'),
    text: text(20_000),
    distractors: z.array(text(200)).max(50).optional(),
  }),
  // Text with dropdowns: `{tengo|*tienes*|tiene}` (the right option between asterisks).
  z.object({ id, type: z.literal('dropdown-gaps'), text: text(20_000) }),
  // Words to build from shuffled letters; `hint` is shown above the letters (e.g. the word in the student's language).
  z.object({
    id,
    type: z.literal('build-word'),
    words: z
      .array(z.object({ text: text(BUILD_WORD_MAX_LENGTH), hint: text(500).optional() }))
      .max(BUILD_WORD_MAX_WORDS),
  }),
  // Dictation: the student listens to each sentence and types it; the check marks the words (shared/src/dictation.ts).
  z.object({
    id,
    type: z.literal('dictation'),
    sentences: z
      .array(z.object({ src: mediaUrl(AUDIO_TYPES), text: text(DICTATION_TEXT_MAX) }))
      .max(DICTATION_MAX_SENTENCES),
  }),
  // Word search (shared/src/wordsearch.ts): `words` is what the teacher typed; `grid` (rows of letters) and
  // `placements` are the last generated field, which the student plays. They may lag behind `words` until the
  // teacher presses "Generar", and the player shows only the words that really lie in the grid.
  z.object({
    id,
    type: z.literal('wordsearch'),
    words: z.array(text(WORDSEARCH_INPUT_MAX)).max(WORDSEARCH_MAX_WORDS),
    grid: z.array(text(WORDSEARCH_MAX_SIZE * 2)).max(WORDSEARCH_MAX_SIZE),
    placements: z
      .array(
        z.object({
          word: text(WORDSEARCH_INPUT_MAX),
          row: z
            .number()
            .int()
            .min(0)
            .max(WORDSEARCH_MAX_SIZE - 1),
          col: z
            .number()
            .int()
            .min(0)
            .max(WORDSEARCH_MAX_SIZE - 1),
          dir: z.enum(WORDSEARCH_DIRECTIONS),
        }),
      )
      .max(WORDSEARCH_MAX_WORDS),
  }),
  z.object({
    id,
    type: z.literal('match'),
    pairs: z.array(z.object({ left: text(300), right: text(300) })).max(50),
    distractors: z.array(text(300)).max(50).optional(),
  }),
  z.object({
    id,
    type: z.literal('order'),
    // `hint`: a light-grey line under the sentence, e.g. its translation (is it a question, in what order).
    sentences: z.array(z.object({ text: text(500), hint: text(500).optional() })).max(50),
  }),
  // Sorting: the student puts every item into the group it belongs to (singular / plural); the groups' titles are the columns.
  z.object({
    id,
    type: z.literal('sort'),
    groups: z.array(z.object({ title: text(300), items: z.array(text(300)).max(50) })).max(10),
  }),
  // A test: one right option → the student picks one; several → all of them.
  z.object({
    id,
    type: z.literal('choice'),
    questions: z
      .array(
        z.object({
          question: text(500),
          options: z.array(z.object({ text: text(300), correct: z.boolean().optional() })).max(20),
        }),
      )
      .max(50),
  }),
  z.object({
    id,
    type: z.literal('true-false'),
    statements: z.array(z.object({ text: text(500), true: z.boolean() })).max(50),
  }),
  // Whole sentences (lines of a dialogue, parts of a text) in the right order; `order` is words in a sentence.
  z.object({ id, type: z.literal('sequence'), items: z.array(text(1000)).max(50) }),
  // A wheel of fortune for speaking practice: its fixed order of short questions; nothing is answered or saved.
  z.object({ id, type: z.literal('wheel'), items: z.array(text(WHEEL_ITEM_MAX)).max(WHEEL_MAX_ITEMS) }),
]);

const exercise = z.object({ id, title: text(500), blocks: z.array(block).max(50) });

// `locked` / `exerciseCount` are never stored: a student is sent a chapter that is not open to them as
// an empty one with these (the title stays, the exercises do not leave the server); see lockChapters.
const chapter = z.object({
  id,
  title: text(200).optional(),
  exercises: z.array(exercise).max(200),
  locked: z.literal(true).optional(),
  exerciseCount: z.number().int().min(0).max(200).optional(),
});

export const lessonContentSchema = z
  .object({ version: z.literal(CONTENT_VERSION), chapters: z.array(chapter).min(1).max(50) })
  .superRefine((content, ctx) => {
    // Ids must be unique in the whole lesson: answers and homework refer to them.
    const seen = new Set<string>();
    const check = (value: string) => {
      if (seen.has(value)) ctx.addIssue({ code: 'custom', message: `Duplicate id: ${value}` });
      seen.add(value);
    };
    for (const c of content.chapters) {
      check(c.id);
      for (const e of c.exercises) {
        check(e.id);
        for (const block of e.blocks) check(block.id);
      }
    }
  });

/** PUT /api/lessons/:id/content: the document and the revision it was made on. */
export const saveLessonContentInput = z.object({
  content: lessonContentSchema,
  rev: z.number().int().min(0),
});

export type LessonContent = z.infer<typeof lessonContentSchema>;
export type Chapter = LessonContent['chapters'][number];
export type Exercise = Chapter['exercises'][number];
export type Block = Exercise['blocks'][number];

/** Parses stored JSON; a missing or broken document is an empty lesson. */
export function parseContent(json: string | null): LessonContent {
  if (!json) return emptyContent();
  const parsed = lessonContentSchema.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : emptyContent();
}

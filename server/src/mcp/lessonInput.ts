import { DICTATION_MAX_SENTENCES, DICTATION_TEXT_MAX } from '@cuadrilo/shared/dictation';
import { geniallyEmbedUrl, parseGeniallyLink } from '@cuadrilo/shared/genially';
import {
  type Block,
  type BlockOf,
  BUILD_WORD_MAX_LENGTH,
  BUILD_WORD_MAX_WORDS,
  type Chapter,
  COMPARE_ORIENTATIONS,
  DEFAULT_IMAGE_SCALE,
  type Exercise,
  GENIALLY_RATIOS,
  IMAGE_SCALES,
  imageScaleOf,
  isEmptyBlock,
  newId,
} from '@cuadrilo/shared/lesson';
import { WHEEL_ITEM_MAX, WHEEL_MAX_ITEMS } from '@cuadrilo/shared/lessonSchema';
import {
  generateWordsearch,
  isGridCurrent,
  WORDSEARCH_INPUT_MAX,
  WORDSEARCH_MAX_WORDS,
  WORDSEARCH_MIN_WORDS,
  WORDSEARCH_WORD_MAX,
} from '@cuadrilo/shared/wordsearch';
import { parseTime, parseYoutubeLink } from '@cuadrilo/shared/youtube';
import { z } from 'zod';

import * as db from '../db';
import { mediaUrl } from '../mediaStore';

/**
 * Lessons as the assistant writes and reads them (MCP tools): no ids to
 * invent (the server makes them), media by their name in the library, videos
 * by a YouTube link. Converted to the lesson document (shared/src/lesson.ts)
 * with errors the model can act on.
 */

const keepId = z
  .string()
  .max(64)
  .optional()
  .describe("The block's id from get_lesson: keeps the students' answers to it. Leave out for a new block.");

const fileRef = z.string().min(1).describe('A file of the media library by its name (list_media), or its /media/… URL');

export const blockInput = z.discriminatedUnion('type', [
  z.object({
    id: keepId,
    type: z.literal('text'),
    markdown: z
      .string()
      .min(1)
      .max(20_000)
      .describe('Markdown: **bold**, *italics*, > quote, tables with |, coloured words :red[words]'),
  }),
  z.object({
    id: keepId,
    type: z.literal('image'),
    file: fileRef,
    alt: z.string().max(500).optional().describe('Not used; may be left out'),
    caption: z.string().max(500).optional(),
    scale: z
      .enum(IMAGE_SCALES)
      .optional()
      .describe(
        'How big it is shown: s (200 px wide), m (360, the default), l (560) or original (its own size, for a scan or a diagram that must stay legible). Pictures of one size look alike in a row.',
      ),
  }),
  z.object({
    id: keepId,
    type: z.literal('compare'),
    before: fileRef.describe('The first image (shown left or top), a media library file'),
    after: fileRef.describe('The second image (shown right or bottom), a media library file'),
    orientation: z
      .enum(COMPARE_ORIENTATIONS)
      .optional()
      .describe(
        'The dividing line: vertical (the default; the slider moves left and right) or horizontal (up and down)',
      ),
    caption: z.string().max(500).optional(),
    scale: z.enum(IMAGE_SCALES).optional().describe('As for an image block: s, m, l (the default here) or original'),
  }),
  z.object({
    id: keepId,
    type: z.literal('hotspots'),
    description: z
      .string()
      .max(500)
      .optional()
      .describe(
        'For a NEW block: what the exercise is (what to find in which picture), written into a reminder for the teacher',
      ),
  }),
  z.object({ id: keepId, type: z.literal('audio'), file: fileRef, title: z.string().max(300).optional() }),
  z.object({
    id: keepId,
    type: z.literal('genially'),
    link: z.string().min(1).describe('The link of a published Genially (view.genially.com/…), or its embed code'),
    ratio: z.enum(GENIALLY_RATIOS).optional().describe('Proportions of the frame, "16:9" by default'),
  }),
  z.object({
    id: keepId,
    type: z.literal('video'),
    youtube: z.string().min(1).describe('A YouTube link (any form) or video id'),
    title: z.string().max(300),
    start: z
      .union([z.number().int().min(0), z.string()])
      .optional()
      .describe('Start at: seconds, or "m:ss"'),
  }),
  z.object({
    id: keepId,
    type: z.literal('essay'),
    placeholder: z.string().max(300).optional().describe('A hint in the empty answer field'),
  }),
  z.object({
    id: keepId,
    type: z.literal('gaps'),
    text: z
      .string()
      .min(1)
      .max(20_000)
      .describe('Text with gaps the student types into: *answer*, several right answers *va|viene*'),
  }),
  z.object({
    id: keepId,
    type: z.literal('dropdown-gaps'),
    text: z
      .string()
      .min(1)
      .max(20_000)
      .describe(
        'Text with dropdowns: {option|*right option*|option}; at least two options, the right one between asterisks',
      ),
  }),
  z.object({
    id: keepId,
    type: z.literal('build-word'),
    words: z
      .array(
        z.object({
          text: z
            .string()
            .min(1)
            .max(BUILD_WORD_MAX_LENGTH)
            .describe(
              'The word (or a short phrase: spaces separate its words) whose letters the student puts in order',
            ),
          hint: z
            .string()
            .max(500)
            .optional()
            .describe("Optional line above the letters, e.g. the word in the student's language"),
        }),
      )
      .min(1)
      .max(BUILD_WORD_MAX_WORDS)
      .describe('Words to build; each is shown as shuffled letters to put into cells'),
  }),
  z.object({
    id: keepId,
    type: z.literal('drag-gaps'),
    text: z.string().min(1).max(20_000).describe('Text with gaps the student drags words into: *answer*'),
    distractors: z.array(z.string().max(200)).max(50).optional().describe('Extra wrong words in the word bank'),
  }),
  z.object({
    id: keepId,
    type: z.literal('dictation'),
    sentences: z
      .array(
        z.object({
          file: fileRef.describe('The audio of the sentence: a media library file'),
          text: z.string().min(1).max(DICTATION_TEXT_MAX).describe('The right sentence, as the student has to type it'),
        }),
      )
      .min(1)
      .max(DICTATION_MAX_SENTENCES),
  }),
  z.object({
    id: keepId,
    type: z.literal('match'),
    pairs: z
      .array(z.object({ left: z.string().min(1).max(300), right: z.string().min(1).max(300) }))
      .min(1)
      .max(50),
    distractors: z.array(z.string().max(300)).max(50).optional().describe('Extra wrong options on the right'),
  }),
  z.object({
    id: keepId,
    type: z.literal('sort'),
    groups: z
      .array(
        z.object({
          title: z.string().min(1).max(300),
          items: z.array(z.string().min(1).max(300)).min(1).max(50),
        }),
      )
      .min(2)
      .max(10)
      .describe('Groups (columns) with the words that belong to each; the student sorts the shuffled words into them'),
  }),
  z.object({
    id: keepId,
    type: z.literal('order'),
    sentences: z
      .array(
        z.object({
          text: z.string().min(1).max(500).describe('The sentence in the right order'),
          hint: z
            .string()
            .max(500)
            .optional()
            .describe("Optional light-grey line under the sentence, e.g. its translation into the student's language"),
        }),
      )
      .min(1)
      .max(50)
      .describe('Sentences in the right order; the student puts the words of each in order'),
  }),
  z.object({
    id: keepId,
    type: z.literal('choice'),
    questions: z
      .array(
        z.object({
          question: z.string().min(1).max(500),
          options: z
            .array(z.object({ text: z.string().min(1).max(300), correct: z.boolean().optional() }))
            .min(2)
            .max(20),
        }),
      )
      .min(1)
      .max(50)
      .describe('A test. Mark the right option(s) with correct: true; several right ones → the student picks all'),
  }),
  z.object({
    id: keepId,
    type: z.literal('true-false'),
    statements: z
      .array(z.object({ text: z.string().min(1).max(500), true: z.boolean() }))
      .min(1)
      .max(50)
      .describe('Statements the student marks true or false'),
  }),
  z.object({
    id: keepId,
    type: z.literal('sequence'),
    items: z
      .array(z.string().min(1).max(1000))
      .min(2)
      .max(50)
      .describe('Whole sentences or lines of a dialogue in the right order; the student puts them in order'),
  }),
  z.object({
    id: keepId,
    type: z.literal('wordsearch'),
    words: z
      .array(z.string().min(1).max(WORDSEARCH_INPUT_MAX))
      .min(WORDSEARCH_MIN_WORDS)
      .max(WORDSEARCH_MAX_WORDS)
      .describe(
        `The words to find (${WORDSEARCH_MIN_WORDS} to ${WORDSEARCH_MAX_WORDS}, at most ${WORDSEARCH_WORD_MAX} letters each); the server hides them in a grid`,
      ),
  }),
  z.object({
    id: keepId,
    type: z.literal('wheel'),
    items: z
      .array(z.string().min(1).max(WHEEL_ITEM_MAX))
      .min(2)
      .max(WHEEL_MAX_ITEMS)
      .describe('Short questions or tasks, a few words each, in the fixed order they sit on the wheel (2 to 12)'),
  }),
]);
export type BlockInput = z.infer<typeof blockInput>;

export const exerciseInput = z.object({
  title: z.string().min(1).max(500).describe('The task, in the language of the lesson ("Completa con «un» o «una».")'),
  blocks: z.array(blockInput).min(1).max(50),
});
export type ExerciseInput = z.infer<typeof exerciseInput>;

export const chapterInput = z.object({
  title: z.string().max(200).optional(),
  exercises: z.array(exerciseInput).max(200),
});

/** The media library by name (any case) and by stored file, for one tool call. */
export class MediaLookup {
  private readonly byName = new Map<string, db.Media>();
  private readonly byFile = new Map<string, db.Media>();

  constructor(files = db.listMedia()) {
    for (const media of files) {
      this.byName.set(media.name.toLowerCase(), media);
      this.byFile.set(media.file, media);
    }
  }

  /** A file by its name or /media/… URL (a full URL too); with up to five names of that kind if not found. */
  find(ref: string, kind: db.Media['kind']): { media: db.Media } | { suggestions: string[] } {
    const fromUrl = /\/media\/([a-f0-9]{64}\.[a-z0-9]+)$/.exec(ref.trim())?.[1];
    const media = fromUrl ? this.byFile.get(fromUrl) : this.byName.get(ref.trim().toLowerCase());
    if (media && media.kind === kind) return { media };
    const stem = ref
      .trim()
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '');
    const ofKind = [...this.byName.values()].filter((item) => item.kind === kind);
    const similar = ofKind.filter((item) => item.name.toLowerCase().includes(stem));
    return { suggestions: (similar.length ? similar : ofKind).slice(0, 5).map((item) => item.name) };
  }

  /** How the assistant sees a stored file: its name, or the URL if it is not in the library. */
  nameOf(url: string): string {
    const file = url.slice(url.lastIndexOf('/') + 1);
    return this.byFile.get(file)?.name ?? url;
  }
}

/** Collects what is wrong, each at its place: "chapter 1 › exercise 2 › block 1 (match): …". */
export class Problems {
  readonly list: string[] = [];
  add(where: string, message: string): void {
    this.list.push(`${where}: ${message}`);
  }
  get any(): boolean {
    return this.list.length > 0;
  }
}

/**
 * The assistant cannot draw the zones of a hotspots block: a block it gives back as it read it
 * (same id) stays as it is; any other becomes a reminder text for the teacher to replace by hand.
 */
function hotspotsOrReminder(input: Extract<BlockInput, { type: 'hotspots' }>, kept: Block | undefined): Block {
  if (kept?.type === 'hotspots') return kept;
  const what = input.description?.trim();
  return {
    id: input.id ?? newId(),
    type: 'text',
    markdown: `> **Aviso para el profesor:** aquí debe ir un bloque «Encontrar zonas» (hotspots)${
      what ? `: ${what}` : ''
    }. El asistente no puede crearlo: añádelo a mano en el editor y borra este aviso.`,
  };
}

function toBlock(
  input: BlockInput,
  where: string,
  media: MediaLookup,
  problems: Problems,
  /** The blocks of the exercise being replaced, by id. */
  existing: ReadonlyMap<string, Block> = new Map(),
): Block | undefined {
  const id = input.id ?? newId();
  let block: Block;
  switch (input.type) {
    case 'image':
    case 'audio': {
      const found = media.find(input.file, input.type);
      if (!('media' in found)) {
        const hint = found.suggestions.length
          ? ` Files of this kind: ${found.suggestions.join(', ')}.`
          : ' The library has none.';
        // A link to the file: it can be added under a name first.
        const link = /^https?:\/\//.test(input.file) && !/\/media\/[a-f0-9]{64}\./.test(input.file);
        const upload = link ? ' To use a file from a link, add it with upload_media_from_url and use its name.' : '';
        problems.add(where, `no ${input.type} "${input.file}" in the media library.${hint}${upload}`);
        return undefined;
      }
      const src = mediaUrl(found.media.file);
      block =
        input.type === 'image'
          ? {
              id,
              type: 'image',
              src,
              scale: input.scale ?? DEFAULT_IMAGE_SCALE,
              ...(input.caption ? { caption: input.caption } : {}),
            }
          : { id, type: 'audio', src, ...(input.title ? { title: input.title } : {}) };
      break;
    }
    case 'hotspots':
      return hotspotsOrReminder(input, input.id ? existing.get(input.id) : undefined);
    case 'dictation': {
      const sentences: BlockOf<'dictation'>['sentences'] = [];
      input.sentences.forEach((sentence, i) => {
        const found = media.find(sentence.file, 'audio');
        if ('media' in found) sentences.push({ src: mediaUrl(found.media.file), text: sentence.text });
        else {
          const hint = found.suggestions.length
            ? ` Files of this kind: ${found.suggestions.join(', ')}.`
            : ' The library has none.';
          problems.add(where, `sentence ${i + 1}: no audio "${sentence.file}" in the media library.${hint}`);
        }
      });
      if (sentences.length < input.sentences.length) return undefined;
      block = { id, type: 'dictation', sentences };
      break;
    }
    case 'compare': {
      const urls: string[] = [];
      for (const [name, file] of [
        ['before', input.before],
        ['after', input.after],
      ] as const) {
        const found = media.find(file, 'image');
        if ('media' in found) urls.push(mediaUrl(found.media.file));
        else {
          const hint = found.suggestions.length
            ? ` Files of this kind: ${found.suggestions.join(', ')}.`
            : ' The library has none.';
          problems.add(where, `${name}: no image "${file}" in the media library.${hint}`);
        }
      }
      if (urls.length < 2) return undefined;
      block = {
        id,
        type: 'compare',
        before: urls[0],
        after: urls[1],
        ...(input.orientation ? { orientation: input.orientation } : {}),
        scale: input.scale ?? 'l',
        ...(input.caption ? { caption: input.caption } : {}),
      };
      break;
    }
    case 'genially': {
      const geniallyId = parseGeniallyLink(input.link);
      if (!geniallyId) {
        problems.add(where, `"${input.link}" is not a Genially link`);
        return undefined;
      }
      block = { id, type: 'genially', geniallyId, ...(input.ratio ? { ratio: input.ratio } : {}) };
      break;
    }
    case 'video': {
      const link = parseYoutubeLink(input.youtube);
      if (!link) {
        problems.add(where, `"${input.youtube}" is not a YouTube video link`);
        return undefined;
      }
      const start = typeof input.start === 'string' ? parseTime(input.start) : (input.start ?? link.start);
      if (start === null) {
        problems.add(where, `start "${input.start}" is not seconds or "m:ss"`);
        return undefined;
      }
      block = { id, type: 'video', youtubeId: link.id, title: input.title, ...(start ? { start } : {}) };
      break;
    }
    case 'wordsearch': {
      // The same words in a block given back by its id keep their grid (and the teacher's letters in it).
      const kept = input.id ? existing.get(input.id) : undefined;
      if (kept?.type === 'wordsearch' && kept.grid.length > 0 && isGridCurrent(input.words, kept.placements)) {
        block = { ...kept, words: input.words };
        break;
      }
      const result = generateWordsearch(input.words);
      if (!result.ok) {
        problems.add(
          where,
          result.reason === 'tooFew'
            ? `a word search needs at least ${WORDSEARCH_MIN_WORDS} different words of two letters or more`
            : result.reason === 'tooLong'
              ? `the word "${result.word}" is longer than ${WORDSEARCH_WORD_MAX} letters`
              : `no room in the grid for "${result.word}": use fewer or shorter words`,
        );
        return undefined;
      }
      block = { id, type: 'wordsearch', words: input.words, grid: result.grid, placements: result.placements };
      break;
    }
    default: {
      const { id: _given, ...rest } = input;
      block = { id, ...rest } as Block;
    }
  }
  if (block.type === 'choice') {
    const withoutAnswer = block.questions.flatMap((question, index) =>
      question.options.some((option) => option.correct) ? [] : [index + 1],
    );
    if (withoutAnswer.length) {
      problems.add(where, `question(s) ${withoutAnswer.join(', ')} have no option with correct: true`);
      return undefined;
    }
  }
  // A block the student would not see (e.g. gaps text without a single *gap*).
  if (isEmptyBlock(block)) {
    problems.add(
      where,
      'has nothing to show (gaps text needs at least one *answer*; a dropdown needs two options and a *right* one)',
    );
    return undefined;
  }
  return block;
}

/** An exercise of the assistant's → a lesson exercise (a new id unless given); undefined if it has problems. */
export function toExercise(
  input: ExerciseInput,
  where: string,
  media: MediaLookup,
  problems: Problems,
  id = newId(),
  /** The blocks the exercise has now (when it is replaced): a hotspots block given back by its id stays. */
  current: readonly Block[] = [],
): Exercise | undefined {
  const existing = new Map(current.map((block) => [block.id, block]));
  const blocks = input.blocks.map((block, index) =>
    toBlock(block, `${where} › block ${index + 1} (${block.type})`, media, problems, existing),
  );
  if (blocks.some((block) => block === undefined)) return undefined;
  return { id, title: input.title.trim(), blocks: blocks as Block[] };
}

/** Chapters of the assistant's → lesson chapters. */
export function toChapters(inputs: z.infer<typeof chapterInput>[], media: MediaLookup, problems: Problems): Chapter[] {
  return inputs.map((chapter, chapterIndex) => ({
    id: newId(),
    ...(chapter.title?.trim() ? { title: chapter.title.trim() } : {}),
    exercises: chapter.exercises
      .map((exercise, index) =>
        toExercise(exercise, `chapter ${chapterIndex + 1} › exercise ${index + 1}`, media, problems),
      )
      .filter((exercise): exercise is Exercise => exercise !== undefined),
  }));
}

/** A stored block as the assistant reads it (get_lesson): media by name, video as a link. */
export function describeBlock(block: Block, media: MediaLookup): Record<string, unknown> {
  switch (block.type) {
    case 'image':
      // A block saved before the setting existed is shown at its own size: say so, so that writing it back keeps it.
      return {
        id: block.id,
        type: 'image',
        file: media.nameOf(block.src),
        caption: block.caption,
        scale: imageScaleOf(block),
      };
    case 'dictation':
      return {
        id: block.id,
        type: 'dictation',
        sentences: block.sentences.map((sentence) => ({ file: media.nameOf(sentence.src), text: sentence.text })),
      };
    case 'compare':
      return {
        id: block.id,
        type: 'compare',
        before: media.nameOf(block.before),
        after: media.nameOf(block.after),
        orientation: block.orientation ?? 'vertical',
        caption: block.caption,
        scale: imageScaleOf(block),
      };
    case 'wordsearch':
      // The grid is made by the server from the words; to keep this one (and the teacher's letters), give the block back by its id.
      return { id: block.id, type: 'wordsearch', words: block.words };
    case 'hotspots':
      // The zones are drawn by hand in the editor: give the block back by its id to keep it as it is.
      return {
        id: block.id,
        type: 'hotspots',
        file: media.nameOf(block.src),
        zones: block.hotspots.length,
        caption: block.caption,
        note: 'Made by hand in the editor. To keep it, give it back as {"type":"hotspots","id":"<this id>"}.',
      };
    case 'audio':
      return { id: block.id, type: 'audio', file: media.nameOf(block.src), title: block.title };
    case 'genially':
      return {
        id: block.id,
        type: 'genially',
        link: geniallyEmbedUrl(block.geniallyId),
        ratio: block.ratio,
      };
    case 'video':
      return {
        id: block.id,
        type: 'video',
        youtube: `https://youtu.be/${block.youtubeId}`,
        title: block.title,
        start: block.start,
      };
    default:
      return { ...block };
  }
}

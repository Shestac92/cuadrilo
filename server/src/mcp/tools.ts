import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MEDIA_NAME_MAX } from '@cuadrilo/shared/api';
import { exerciseNumbers, type LessonContent, newId } from '@cuadrilo/shared/lesson';
import { lessonContentSchema, parseContent } from '@cuadrilo/shared/lessonSchema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import * as db from '../db';
import { MAX_SIDE } from '../imageCompress';
import { saveLessonDocument } from '../lessonDocument';
import { addMedia } from '../mediaLibrary';
import { mediaUrl } from '../mediaStore';
import { PUBLIC_URL } from '../oauth/config';
import { fetchPublic, type PublicFetchResult } from '../publicFetch';
import { LESSON_FORMAT } from './lessonFormat';
import {
  chapterInput,
  describeBlock,
  exerciseInput,
  MediaLookup,
  Problems,
  toChapters,
  toExercise,
} from './lessonInput';

/**
 * The MCP tools: the teacher's AI assistant reads and writes lessons, reads
 * the media library and adds files to it from a link. Whole exercises at a time; ids are made here. Every change
 * goes the editor's way (saveLessonDocument): checked against the lesson
 * schema, a new revision, open editors told. Deleting a lesson, access,
 * homework and classes are not here (the "lessons" scope).
 */

const lessonId = z.number().int().positive().describe('From list_lessons or create_lesson');

const ok = (summary: string, data: object): CallToolResult => ({
  content: [{ type: 'text', text: `${summary}\n${JSON.stringify(data, null, 1)}` }],
});
const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] });
const problemsReport = (problems: Problems) =>
  failure(`Nothing was saved. Fix these and call again:\n- ${problems.list.join('\n- ')}`);

/** Where the teacher checks the result: the lesson editor at a chapter. */
const MB = 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_AUDIO_BYTES);

/** Why a link could not be downloaded, for the model. */
function downloadProblem(result: Exclude<PublicFetchResult, { ok: true }>): string {
  switch (result.reason) {
    case 'url':
      return 'Not a public https link.';
    case 'address':
      return 'That host is not on the public internet.';
    case 'status':
      return `The site answered ${result.status}.`;
    case 'too_large':
      return `The file is larger than ${MAX_DOWNLOAD_BYTES / MB} MB.`;
    case 'timeout':
      return `The download did not finish within ${DOWNLOAD_TIMEOUT_MS / 1000} s.`;
    case 'redirects':
      return 'Too many redirects.';
    case 'network':
      return 'Could not connect to the site.';
  }
}

const editorUrl = (id: number, chapterIndex = 0) => `${PUBLIC_URL.origin}/lessons/${id}/edit/${chapterIndex + 1}`;

/** A note for changes to a lesson students already see. */
function studentsNote(id: number): string {
  const students = db.listLessonAccess(id).length;
  return students ? ` Note: ${students} student(s) can see this lesson; they see the change now.` : '';
}

/** The validator's issues in words the model can act on. */
function schemaProblems(content: LessonContent): string | undefined {
  const parsed = lessonContentSchema.safeParse(content);
  if (parsed.success) return undefined;
  return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'lesson'}: ${issue.message}`).join('; ');
}

type EditResult = { done: true; result: CallToolResult } | { done: false; result: CallToolResult };

/**
 * Changes a lesson's document: `edit` gets a copy and says what happened (or
 * fails). Saved on the revision it was read on; saved meanwhile (the teacher's
 * editor) → read again once.
 */
function editLesson(id: number, edit: (content: LessonContent) => EditResult): CallToolResult {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const lesson = db.getLesson(id);
    if (!lesson) return failure(`No lesson ${id}. Use list_lessons.`);
    const content = structuredClone(parseContent(db.getLessonContent(id)));
    const outcome = edit(content);
    if (!outcome.done) return outcome.result;
    const invalid = schemaProblems(content);
    if (invalid) return failure(`Nothing was saved: ${invalid}`);
    if (saveLessonDocument(id, content, lesson.content_rev) !== null) return outcome.result;
  }
  return failure('The lesson is being edited right now; nothing was saved. Try again in a moment.');
}

/** An exercise by id with its chapter. */
function findExercise(content: LessonContent, exerciseId: string) {
  for (const [chapterIndex, chapter] of content.chapters.entries()) {
    const index = chapter.exercises.findIndex((exercise) => exercise.id === exerciseId);
    if (index >= 0) return { chapter, chapterIndex, index };
  }
  return undefined;
}

export function registerLessonTools(server: McpServer): void {
  server.registerTool(
    'lesson_format',
    {
      title: 'Lesson format',
      description:
        'How lessons are built: chapters → exercises (a task + blocks) → blocks, every block type with an example. Read it before creating or changing lessons.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: 'text', text: LESSON_FORMAT }] }),
  );

  server.registerTool(
    'list_lessons',
    {
      title: 'List lessons',
      description: 'All lessons of the platform, recently changed first.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const lessons = db.listLessons().map((lesson) => {
        const content = parseContent(db.getLessonContent(lesson.id));
        return {
          lessonId: lesson.id,
          title: lesson.title,
          chapters: content.chapters.length,
          exercises: content.chapters.reduce((sum, chapter) => sum + chapter.exercises.length, 0),
          studentsWithAccess: db.listLessonAccess(lesson.id).length,
          updatedAt: lesson.updated_at,
        };
      });
      return ok(`${lessons.length} lesson(s).`, lessons);
    },
  );

  server.registerTool(
    'get_lesson',
    {
      title: 'Get a lesson',
      description:
        'A lesson with its chapters, numbered exercises and blocks, with their ids (needed to change or delete them). Media are shown by their library name.',
      inputSchema: { lessonId },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id }) => {
      const lesson = db.getLesson(id);
      if (!lesson) return failure(`No lesson ${id}. Use list_lessons.`);
      const content = parseContent(db.getLessonContent(id));
      const numbers = exerciseNumbers(content);
      const media = new MediaLookup();
      return ok(`Lesson "${lesson.title}".`, {
        lessonId: id,
        title: lesson.title,
        editorUrl: editorUrl(id),
        studentsWithAccess: db.listLessonAccess(id).length,
        chapters: content.chapters.map((chapter) => ({
          chapterId: chapter.id,
          title: chapter.title ?? null,
          exercises: chapter.exercises.map((exercise) => ({
            exerciseId: exercise.id,
            number: numbers.get(exercise.id),
            title: exercise.title,
            blocks: exercise.blocks.map((block) => describeBlock(block, media)),
          })),
        })),
      });
    },
  );

  server.registerTool(
    'list_media',
    {
      title: 'List media files',
      description:
        'Images and audio in the media library, by name. Use a name (or url) as `file` of image and audio blocks. Files come from the teacher (the Archivos page) or from upload_media_from_url.',
      inputSchema: {
        kind: z.enum(['image', 'audio']).optional(),
        search: z.string().max(200).optional().describe('Part of the name'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ kind, search }) => {
      const needle = search?.trim().toLowerCase();
      const files = db
        .listMedia()
        .filter((media) => (!kind || media.kind === kind) && (!needle || media.name.toLowerCase().includes(needle)))
        .map((media) => ({ name: media.name, kind: media.kind, url: mediaUrl(media.file) }));
      return ok(`${files.length} file(s).`, files);
    },
  );

  server.registerTool(
    'upload_media_from_url',
    {
      title: 'Add a media file from a link',
      description: `Downloads an image (JPG, PNG, WebP, GIF, up to ${MAX_IMAGE_BYTES / MB} MB; it is compressed to WebP and a big picture is scaled down to ${MAX_SIDE} px, so the stored file may differ from the original) or audio (MP3, M4A, OGG, WAV, up to ${MAX_AUDIO_BYTES / MB} MB) from a public https link into the media library under the given name; then use the name as \`file\` of an image or audio block. The same file already in the library is not added twice: its existing name comes back.`,
      inputSchema: {
        url: z.string().min(1).max(2000).describe('A public https link to the file itself'),
        name: z
          .string()
          .trim()
          .min(1)
          .max(MEDIA_NAME_MAX)
          .describe('A short name with the extension, unique in the library ("tiempo-lluvia.jpg")'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ url, name }) => {
      const download = await fetchPublic(url, {
        maxBytes: MAX_DOWNLOAD_BYTES,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 3,
      });
      if (!download.ok) return failure(`Nothing was added: ${downloadProblem(download)}`);
      const added = await addMedia(download.bytes, name);
      if (!added.ok) {
        switch (added.reason) {
          case 'type':
            return failure('Nothing was added: not an image (JPG, PNG, WebP, GIF) or audio (MP3, M4A, OGG, WAV).');
          case 'size':
            return failure(
              `Nothing was added: too large (images up to ${MAX_IMAGE_BYTES / MB} MB, audio up to ${MAX_AUDIO_BYTES / MB} MB).`,
            );
          case 'name_taken':
            return failure(`Nothing was added: the name "${name}" belongs to another file. Choose another name.`);
        }
      }
      const { media, existed } = added;
      const file = { name: media.name, kind: media.kind, url: mediaUrl(media.file) };
      return ok(
        existed
          ? `This file is already in the library as "${media.name}"; use that name.`
          : `Added "${media.name}" (${media.kind}).`,
        file,
      );
    },
  );

  server.registerTool(
    'create_lesson',
    {
      title: 'Create a lesson',
      description:
        'Creates a whole new lesson: chapters with exercises. Each exercise is a task (title) and blocks; every block type and its fields are in lesson_format (read it first). Check list_lessons first: do not duplicate a lesson that exists. Students do not see the new lesson until the teacher gives them access.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        chapters: z.array(chapterInput).min(1).max(50),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, chapters: inputs }) => {
      const problems = new Problems();
      const chapters = toChapters(inputs, new MediaLookup(), problems);
      if (problems.any) return problemsReport(problems);
      const content: LessonContent = { version: 2, chapters };
      const invalid = schemaProblems(content);
      if (invalid) return failure(`Nothing was saved: ${invalid}`);
      const lesson = db.createLesson(title, JSON.stringify(content));
      const exercises = chapters.reduce((sum, chapter) => sum + chapter.exercises.length, 0);
      return ok(
        `Created lesson "${lesson.title}" with ${exercises} exercise(s). The teacher can check it in the editor.`,
        {
          lessonId: lesson.id,
          editorUrl: editorUrl(lesson.id),
        },
      );
    },
  );

  server.registerTool(
    'add_exercises',
    {
      title: 'Add exercises',
      description:
        'Adds exercises at the end of a chapter: an existing one (chapterId), a new one (newChapterTitle), or else the last chapter. Block types and their fields: lesson_format (read it first).',
      inputSchema: {
        lessonId,
        chapterId: z.string().optional().describe('From get_lesson'),
        newChapterTitle: z.string().max(200).optional().describe('Adds a new chapter at the end with this title'),
        exercises: z.array(exerciseInput).min(1).max(200),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ lessonId: id, chapterId, newChapterTitle, exercises: inputs }) =>
      editLesson(id, (content) => {
        let chapterIndex = content.chapters.length - 1;
        if (newChapterTitle !== undefined) {
          content.chapters.push({
            id: newId(),
            ...(newChapterTitle.trim() ? { title: newChapterTitle.trim() } : {}),
            exercises: [],
          });
          chapterIndex = content.chapters.length - 1;
        } else if (chapterId !== undefined) {
          chapterIndex = content.chapters.findIndex((chapter) => chapter.id === chapterId);
          if (chapterIndex < 0)
            return { done: false, result: failure(`No chapter ${chapterId} in lesson ${id}. Use get_lesson.`) };
        }
        const problems = new Problems();
        const media = new MediaLookup();
        const added = inputs.map((input, index) => toExercise(input, `exercise ${index + 1}`, media, problems));
        if (problems.any) return { done: false, result: problemsReport(problems) };
        for (const exercise of added) if (exercise) content.chapters[chapterIndex].exercises.push(exercise);
        return {
          done: true,
          result: ok(`Added ${added.length} exercise(s).${studentsNote(id)}`, {
            editorUrl: editorUrl(id, chapterIndex),
          }),
        };
      }),
  );

  server.registerTool(
    'update_exercise',
    {
      title: 'Replace an exercise',
      description:
        "Replaces an exercise's task and/or all its blocks. Give a block the id it has in get_lesson to keep the students' answers to it. Block types and their fields: lesson_format.",
      inputSchema: {
        lessonId,
        exerciseId: z.string().describe('From get_lesson'),
        title: exerciseInput.shape.title.optional(),
        blocks: exerciseInput.shape.blocks.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id, exerciseId, title, blocks }) =>
      editLesson(id, (content) => {
        const found = findExercise(content, exerciseId);
        if (!found)
          return { done: false, result: failure(`No exercise ${exerciseId} in lesson ${id}. Use get_lesson.`) };
        const current = found.chapter.exercises[found.index];
        const problems = new Problems();
        const replaced = toExercise(
          { title: title ?? current.title, blocks: blocks ?? [] },
          'exercise',
          new MediaLookup(),
          problems,
          current.id,
          current.blocks,
        );
        if (!replaced) return { done: false, result: problemsReport(problems) };
        found.chapter.exercises[found.index] = blocks ? replaced : { ...current, title: replaced.title };
        return {
          done: true,
          result: ok(`Replaced the exercise.${studentsNote(id)}`, { editorUrl: editorUrl(id, found.chapterIndex) }),
        };
      }),
  );

  server.registerTool(
    'delete_exercise',
    {
      title: 'Delete an exercise',
      description: "Deletes an exercise (the students' answers to it go too).",
      inputSchema: { lessonId, exerciseId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id, exerciseId }) =>
      editLesson(id, (content) => {
        const found = findExercise(content, exerciseId);
        if (!found) return { done: false, result: failure(`No exercise ${exerciseId} in lesson ${id}.`) };
        found.chapter.exercises.splice(found.index, 1);
        return {
          done: true,
          result: ok(`Deleted the exercise.${studentsNote(id)}`, { editorUrl: editorUrl(id, found.chapterIndex) }),
        };
      }),
  );

  server.registerTool(
    'add_chapter',
    {
      title: 'Add a chapter',
      description: 'Adds an empty chapter at the end of a lesson (fill it with add_exercises).',
      inputSchema: { lessonId, title: z.string().max(200).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ lessonId: id, title }) =>
      editLesson(id, (content) => {
        const chapter = { id: newId(), ...(title?.trim() ? { title: title.trim() } : {}), exercises: [] };
        content.chapters.push(chapter);
        return {
          done: true,
          result: ok('Added a chapter.', {
            chapterId: chapter.id,
            editorUrl: editorUrl(id, content.chapters.length - 1),
          }),
        };
      }),
  );

  server.registerTool(
    'rename_chapter',
    {
      title: 'Rename a chapter',
      description: 'Sets a chapter title (empty: "Capítulo N").',
      inputSchema: { lessonId, chapterId: z.string(), title: z.string().max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id, chapterId, title }) =>
      editLesson(id, (content) => {
        const chapter = content.chapters.find((item) => item.id === chapterId);
        if (!chapter) return { done: false, result: failure(`No chapter ${chapterId} in lesson ${id}.`) };
        if (title.trim()) chapter.title = title.trim();
        else delete chapter.title;
        return { done: true, result: ok('Renamed the chapter.', { editorUrl: editorUrl(id) }) };
      }),
  );

  server.registerTool(
    'delete_chapter',
    {
      title: 'Delete a chapter',
      description: 'Deletes a chapter with all its exercises. A lesson keeps at least one chapter.',
      inputSchema: { lessonId, chapterId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id, chapterId }) =>
      editLesson(id, (content) => {
        const index = content.chapters.findIndex((chapter) => chapter.id === chapterId);
        if (index < 0) return { done: false, result: failure(`No chapter ${chapterId} in lesson ${id}.`) };
        if (content.chapters.length === 1)
          return { done: false, result: failure('A lesson keeps at least one chapter.') };
        content.chapters.splice(index, 1);
        return { done: true, result: ok(`Deleted the chapter.${studentsNote(id)}`, { editorUrl: editorUrl(id) }) };
      }),
  );

  server.registerTool(
    'rename_lesson',
    {
      title: 'Rename a lesson',
      inputSchema: { lessonId, title: z.string().trim().min(1).max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId: id, title }) => {
      const renamed = db.renameLesson(id, title);
      if (!renamed) return failure(`No lesson ${id}.`);
      return ok(`Renamed to "${renamed.title}".`, { editorUrl: editorUrl(id) });
    },
  );
}

const promptMessage = (lines: (string | false | undefined)[]) => ({
  messages: [
    {
      role: 'user' as const,
      content: { type: 'text' as const, text: lines.filter(Boolean).join('\n') },
    },
  ],
});

/** The prompts: ready scenarios for the teacher (a lesson from a document or a topic, more exercises, a check). */
export function registerLessonPrompts(server: McpServer): void {
  server.registerPrompt(
    'lesson_from_topic',
    {
      title: 'Lesson from a topic',
      description: 'Make a new lesson on a topic, for a level, from scratch.',
      argsSchema: {
        topic: z.string().describe('What the lesson is about ("el tiempo y las estaciones")'),
        level: z.string().optional().describe('The students’ level (A1, A2, B1…)'),
        notes: z.string().optional().describe('Wishes: number of exercises, types, which media files to use…'),
      },
    },
    ({ topic, level, notes }) =>
      promptMessage([
        `Make a new lesson on the topic: ${topic}.`,
        level && `The students' level: ${level}.`,
        notes && `My wishes: ${notes}`,
        'Steps: 1) read lesson_format; 2) list_lessons: tell me if a similar lesson already exists before you make another; 3) list_media: use the pictures and audio that fit, by name (I do not want you to invent files);',
        '4) plan the lesson in short (chapters, what each exercise practises) and show me the plan; make it after I agree;',
        '5) call create_lesson, in parts for a long lesson; if it reports problems, fix them and call again;',
        '6) give me the editor link, a short list of what you made and anything I have to add myself (pictures, audio, hotspots).',
      ]),
  );

  server.registerPrompt(
    'add_exercises_to_lesson',
    {
      title: 'Add exercises to a lesson',
      description: 'Add more exercises to a lesson that exists.',
      argsSchema: {
        lesson: z.string().describe('The lesson’s title or number'),
        request: z.string().describe('What to add ("five gap exercises on ser and estar")'),
      },
    },
    ({ lesson, request }) =>
      promptMessage([
        `Add exercises to the lesson "${lesson}": ${request}.`,
        'Steps: 1) read lesson_format; 2) find the lesson with list_lessons and read it with get_lesson, to match its language, level and style and not to repeat what it has;',
        '3) if students can already see it (studentsWithAccess above zero), tell me they will see the change at once and wait for my yes;',
        '4) add the exercises at the end of the chapter that fits (add_exercises); do not change or delete the exercises that are there;',
        '5) give me the editor link and a short list of what you added.',
      ]),
  );

  server.registerPrompt(
    'review_lesson',
    {
      title: 'Review a lesson',
      description: 'Read a lesson and report mistakes and improvements; change nothing until you agree.',
      argsSchema: { lesson: z.string().describe('The lesson’s title or number') },
    },
    ({ lesson }) =>
      promptMessage([
        `Review the lesson "${lesson}".`,
        'Read it with get_lesson (find it with list_lessons) and report, chapter by chapter: mistakes in the language or in the answers (accents and special punctuation, a gap with a wrong or missing answer), unclear tasks, exercises that are too hard or too easy for each other, media that does not fit.',
        'Give me a list of what you would change and why. Change nothing until I say which items to do; if students can see the lesson, remind me that they will see the changes at once.',
      ]),
  );

  server.registerPrompt(
    'lesson_from_document',
    {
      title: 'Lesson from a document',
      description: 'Turn a lesson plan, a textbook page or a screenshot into a lesson.',
      argsSchema: {
        title: z.string().optional().describe('The lesson title, if you already know it'),
        notes: z.string().optional().describe('Wishes: level, number of exercises, which media files to use…'),
      },
    },
    ({ title, notes }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Create a lesson from the document I attach or paste (a lesson plan, a textbook page, a screenshot).',
              title ? `Lesson title: ${title}.` : 'Choose a short title from the document.',
              notes ? `My wishes: ${notes}` : '',
              'Steps: 1) read lesson_format; 2) if I mention images or audio, find them with list_media and use their names (files given as public links: add them with upload_media_from_url first);',
              '3) keep the language of the document for tasks and texts; one clear task per exercise; a rule or table as a text block in the exercise it belongs to;',
              '4) call create_lesson once with all chapters and exercises; if it reports problems, fix them and call again;',
              '5) give me the editor link and a short list of what you created, and what you could not take from the document.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        },
      ],
    }),
  );
}

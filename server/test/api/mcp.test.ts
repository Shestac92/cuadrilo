import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import sharp from 'sharp';

import { connectAssistant, mcpClient } from '../assistant';
import { type Client, signIn, startServer, type TestServer } from '../helpers';

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/** The MCP server (server/src/mcp): what an assistant can do with the teacher's lessons. */
describe('assistants: MCP tools', () => {
  let server: TestServer;
  let teacher: Client;
  let mcp: McpClient;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    mcp = await mcpClient(server, await connectAssistant(server, teacher));
  });
  after(async () => {
    await mcp.close();
    teacher.close();
    await server.stop();
  });

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await mcp.callTool({ name, arguments: args })) as ToolResult;
  /** A tool's data: the JSON after the summary line. */
  const dataOf = (result: ToolResult) => {
    const text = result.content[0].text;
    return JSON.parse(text.slice(text.indexOf('\n') + 1));
  };
  const lessonOf = async (id: number) => (await teacher.call('GET', `/api/lessons/${id}`)).body;

  const allBlocks = [
    { type: 'text', markdown: 'Usamos **un** con masculinos.' },
    { type: 'image', file: 'COCINA.png', alt: 'Una cocina' },
    { type: 'audio', file: '', title: 'Lucía' }, // the URL is filled in below
    { type: 'video', youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=95', title: 'Vídeo' },
    {
      type: 'genially',
      link: 'https://view.genially.com/6720c5563ae8449b359f1fd0/interactive-content-muebles',
      ratio: '4:3',
    },
    { type: 'essay', placeholder: 'En la cocina hay…' },
    { type: 'gaps', text: 'Tengo *un* perro y *una|la* gata.' },
    { type: 'drag-gaps', text: '*El* sol sale.', distractors: ['un'] },
    { type: 'match', pairs: [{ left: 'libro', right: 'el' }] },
    {
      type: 'sort',
      groups: [
        { title: 'Singular', items: ['el coche'] },
        { title: 'Plural', items: ['los tés', 'las camisetas'] },
      ],
    },
    { type: 'order', sentences: [{ text: 'Tengo un perro.' }] },
    {
      type: 'choice',
      questions: [{ question: 'En verano hace', options: [{ text: 'calor', correct: true }, { text: 'frío' }] }],
    },
    { type: 'true-false', statements: [{ text: 'En el sur hace frío.', true: false }] },
    { type: 'sequence', items: ['¡Qué calor!', 'En agosto es normal.'] },
    {
      type: 'wheel',
      items: ['¿Qué tiempo hace hoy?', '¿Prefieres el calor o el frío?', 'Describe tu estación favorita'],
    },
  ];

  it('tools, their hints and the prompt', async () => {
    const tools = (await mcp.listTools()).tools;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ['lesson_format', 'list_lessons', 'get_lesson', 'list_media']) {
      assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
    }
    for (const name of ['delete_exercise', 'delete_chapter']) {
      assert.equal(byName.get(name)?.annotations?.destructiveHint, true, name);
    }
    assert.ok(!byName.has('delete_lesson'), 'no deleting whole lessons');

    const prompt = await mcp.getPrompt({ name: 'lesson_from_document', arguments: { title: 'Los colores' } });
    assert.match((prompt.messages[0].content as { text: string }).text, /Lesson title: Los colores/);
    assert.match(
      (await call('lesson_format')).content[0].text,
      /drag-gaps[\s\S]*- sort[\s\S]*true-false[\s\S]*sequence[\s\S]*wheel/,
    );
  });

  it('the guidance: instructions, the working rules and every prompt', async () => {
    assert.match(mcp.getInstructions() ?? '', /list_lessons[\s\S]*studentsWithAccess/);
    const guide = (await call('lesson_format')).content[0].text;
    assert.match(guide, /## How to work[\s\S]*## Care with a lesson students already see[\s\S]*## What you cannot do/);
    const names = (await mcp.listPrompts()).prompts.map((prompt) => prompt.name).sort();
    assert.deepEqual(names, ['add_exercises_to_lesson', 'lesson_from_document', 'lesson_from_topic', 'review_lesson']);
    const topic = await mcp.getPrompt({ name: 'lesson_from_topic', arguments: { topic: 'el tiempo', level: 'A2' } });
    assert.match((topic.messages[0].content as { text: string }).text, /el tiempo[\s\S]*A2[\s\S]*lesson_format/);
  });

  it('the media library by name', async () => {
    const files = dataOf(await call('list_media', { kind: 'audio' })) as { name: string; url: string }[];
    assert.deepEqual(
      files.map((file) => file.name),
      ['lucia.m4a'],
    );
    assert.equal(files[0].url, server.media.listening);
  });

  it('create_lesson: every block type, media by name or URL, ids made by the server', async () => {
    const blocks = allBlocks.map((block) =>
      block.type === 'audio' ? { ...block, file: server.media.listening } : block,
    );
    const result = await call('create_lesson', {
      title: 'Creado por el asistente',
      chapters: [{ title: 'Uno', exercises: [{ title: 'Todo junto.', blocks }] }],
    });
    assert.ok(!result.isError, result.content[0].text);
    const { lessonId, editorUrl } = dataOf(result);
    assert.equal(editorUrl, `${server.base}/lessons/${lessonId}/edit/1`);

    const lesson = await lessonOf(lessonId);
    const saved = lesson.content.chapters[0].exercises[0].blocks;
    assert.deepEqual(
      saved.map((block: { type: string }) => block.type),
      allBlocks.map((block) => block.type),
    );
    assert.equal(saved[1].src, server.media.kitchen, 'image by name, any case');
    assert.equal(saved[1].scale, 'm', 'an image the assistant did not size is medium');
    assert.equal(saved[2].src, server.media.listening, 'audio by URL');
    assert.deepEqual([saved[3].youtubeId, saved[3].start], ['aqz-KE-bpKQ', 95], 'the start from the link');
    assert.ok(saved.every((block: { id: string }) => /^[a-f0-9]{12}$/.test(block.id)));
    assert.equal(lesson.rev, 0);
    assert.deepEqual((await teacher.call('GET', `/api/lessons/${lessonId}/access`)).body.studentIds, [], 'no access');
  });

  it('a compare block: two library images, the line vertical by default, a missing file is named', async () => {
    const blocks = [
      { type: 'compare', before: 'cocina.png', after: 'cocina.png', caption: 'Antes y después' },
      { type: 'compare', before: 'cocina.png', after: 'cocina.png', orientation: 'horizontal', scale: 's' },
    ];
    const created = await call('create_lesson', {
      title: 'Antes y después',
      chapters: [{ exercises: [{ title: 'Mira.', blocks }] }],
    });
    assert.ok(!created.isError, created.content[0].text);
    const { lessonId } = dataOf(created);
    const stored = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks;
    assert.ok(stored[0].before.startsWith('/media/') && stored[0].after.startsWith('/media/'));
    assert.equal(stored[0].orientation, undefined, 'the default is not written');
    assert.equal(stored[0].scale, 'l');
    assert.equal(stored[1].orientation, 'horizontal');
    const read = dataOf(await call('get_lesson', { lessonId })).chapters[0].exercises[0].blocks;
    assert.deepEqual(
      read.map((b: { before: string; orientation: string; scale: string }) => [b.before, b.orientation, b.scale]),
      [
        ['cocina.png', 'vertical', 'l'],
        ['cocina.png', 'horizontal', 's'],
      ],
    );
    const bad = await call('create_lesson', {
      title: 'Sin archivo',
      chapters: [
        { exercises: [{ title: 'x', blocks: [{ type: 'compare', before: 'cocina.png', after: 'nada.png' }] }] },
      ],
    });
    assert.ok(bad.isError);
    assert.match(bad.content[0].text, /after: no image "nada\.png"/);
  });

  it('a dictation block: audio by name with the right text, read back the same, a missing file is named', async () => {
    const sentences = [
      { file: 'lucia.m4a', text: 'Vengo del colegio.' },
      { file: 'lucia.m4a', text: '¿Dónde está la biblioteca?' },
    ];
    const created = await call('create_lesson', {
      title: 'Dictado',
      chapters: [{ exercises: [{ title: 'Escribe.', blocks: [{ type: 'dictation', sentences }] }] }],
    });
    assert.ok(!created.isError, created.content[0].text);
    const { lessonId } = dataOf(created);
    const stored = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks[0];
    assert.equal(stored.type, 'dictation');
    assert.deepEqual(
      stored.sentences,
      sentences.map((sentence) => ({ src: server.media.listening, text: sentence.text })),
    );
    const read = dataOf(await call('get_lesson', { lessonId })).chapters[0].exercises[0].blocks[0];
    assert.deepEqual(read.sentences, sentences);
    const bad = await call('create_lesson', {
      title: 'Sin audio',
      chapters: [
        {
          exercises: [
            { title: 'x', blocks: [{ type: 'dictation', sentences: [{ file: 'nada.mp3', text: 'Hola.' }] }] },
          ],
        },
      ],
    });
    assert.ok(bad.isError);
    assert.match(bad.content[0].text, /sentence 1: no audio "nada\.mp3"/);
  });

  it('hotspots: the assistant leaves a reminder, and keeps a block it is given back by its id', async () => {
    const created = await call('create_lesson', {
      title: 'Zonas',
      chapters: [
        {
          exercises: [
            {
              title: 'Encuentra las frutas.',
              blocks: [{ type: 'hotspots', description: 'las frutas de la cocina' }],
            },
          ],
        },
      ],
    });
    assert.ok(!created.isError, created.content[0].text);
    const { lessonId } = dataOf(created);
    const reminder = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks[0];
    assert.equal(reminder.type, 'text');
    assert.match(reminder.markdown, /hotspots.*las frutas de la cocina/s);

    // The teacher draws one in the editor (here: saved as the editor does).
    const lesson = await lessonOf(lessonId);
    const src = (await lessonOf(server.lessonId)).content.chapters
      .flatMap((c: { exercises: { blocks: { type: string; src?: string }[] }[] }) => c.exercises)
      .flatMap((e: { blocks: { type: string; src?: string }[] }) => e.blocks)
      .find((b: { type: string }) => b.type === 'image').src;
    lesson.content.chapters[0].exercises[0].blocks.push({
      id: 'zonas1',
      type: 'hotspots',
      src,
      hotspots: [{ id: 'z1', shape: 'circle', x: 0.5, y: 0.5, r: 0.1 }],
    });
    assert.equal(
      (await teacher.call('PUT', `/api/lessons/${lessonId}/content`, { content: lesson.content, rev: lesson.rev }))
        .status,
      200,
    );
    const read = dataOf(await call('get_lesson', { lessonId })).chapters[0].exercises[0];
    const shown = read.blocks.find((b: { type: string }) => b.type === 'hotspots');
    assert.equal(shown.id, 'zonas1');
    assert.equal(shown.zones, 1);
    assert.match(shown.note, /give it back/i);

    // Given back by its id, it stays as it is (zones included); another id becomes a reminder.
    const kept = await call('update_exercise', {
      lessonId,
      exerciseId: read.exerciseId,
      blocks: [
        { type: 'hotspots', id: 'zonas1' },
        { type: 'hotspots', id: 'otro' },
      ],
    });
    assert.ok(!kept.isError, kept.content[0].text);
    const blocks = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks;
    assert.equal(blocks[0].type, 'hotspots');
    assert.deepEqual(blocks[0].hotspots, [{ id: 'z1', shape: 'circle', x: 0.5, y: 0.5, r: 0.1 }]);
    assert.equal(blocks[1].type, 'text');
  });

  it('a word search: the server makes the grid from the words and keeps it when the block is given back', async () => {
    const words = ['rojo', 'azul', 'verde', 'amarillo', 'negro'];
    const created = await call('create_lesson', {
      title: 'Sopa',
      chapters: [{ exercises: [{ title: 'Busca los colores.', blocks: [{ type: 'wordsearch', words }] }] }],
    });
    assert.ok(!created.isError, created.content[0].text);
    const { lessonId } = dataOf(created);
    const stored = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks[0];
    assert.equal(stored.type, 'wordsearch');
    assert.deepEqual(stored.words, words);
    assert.equal(stored.placements.length, 5);
    assert.ok(stored.grid.length >= 8 && stored.grid.every((row: string) => [...row].length === stored.grid.length));

    // Read back as the words and the id; given back with the same words, the grid stays; other words: a new grid.
    const read = dataOf(await call('get_lesson', { lessonId })).chapters[0].exercises[0];
    assert.deepEqual(read.blocks[0], { id: stored.id, type: 'wordsearch', words });
    const same = await call('update_exercise', {
      lessonId,
      exerciseId: read.exerciseId,
      blocks: [{ type: 'wordsearch', id: stored.id, words }],
    });
    assert.ok(!same.isError, same.content[0].text);
    assert.deepEqual((await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks[0].grid, stored.grid);
    await call('update_exercise', {
      lessonId,
      exerciseId: read.exerciseId,
      blocks: [{ type: 'wordsearch', id: stored.id, words: [...words, 'gris'] }],
    });
    assert.equal((await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks[0].placements.length, 6);

    // Too few different words, or a word that is too long.
    for (const bad of [
      ['a', 'b', 'c', 'd', 'e'],
      ['uno', 'dos', 'tres', 'cuatro', 'uno'],
      [...words.slice(1), 'x'.repeat(25)],
    ]) {
      const result = await call('create_lesson', {
        title: 'Mal',
        chapters: [{ exercises: [{ title: 'x', blocks: [{ type: 'wordsearch', words: bad }] }] }],
      });
      assert.ok(result.isError, JSON.stringify(bad));
    }
  });

  it('an image has a size: the assistant sets it, an old block reads as original, and it survives a rewrite', async () => {
    const sized = (scale?: string) => ({ type: 'image', file: 'cocina.png', ...(scale && { scale }) });
    const created = await call('create_lesson', {
      title: 'Con tama\u00f1os',
      chapters: [
        {
          exercises: [{ title: 'Tama\u00f1os.', blocks: [sized('s'), sized('l'), sized('original'), sized()] }],
        },
      ],
    });
    assert.ok(!created.isError, created.content[0].text);
    const { lessonId } = dataOf(created);
    const exercise = dataOf(await call('get_lesson', { lessonId })).chapters[0].exercises[0];
    assert.deepEqual(
      exercise.blocks.map((block: { scale: string }) => block.scale),
      ['s', 'l', 'original', 'm'],
    );

    // A block saved before the setting existed: no `scale` in the document, `original` for the assistant.
    const demo = dataOf(await call('get_lesson', { lessonId: server.lessonId }));
    const oldImage = demo.chapters
      .flatMap((c: { exercises: { blocks: { type: string; scale?: string }[] }[] }) => c.exercises)
      .flatMap((e: { blocks: { type: string; scale?: string }[] }) => e.blocks)
      .find((b: { type: string }) => b.type === 'image');
    assert.equal(oldImage.scale, 'original');
    const stored = (await lessonOf(server.lessonId)).content.chapters
      .flatMap((c: { exercises: { blocks: { type: string }[] }[] }) => c.exercises)
      .flatMap((e: { blocks: { type: string; scale?: string }[] }) => e.blocks)
      .find((b: { type: string }) => b.type === 'image');
    assert.equal(stored.scale, undefined, 'the stored block is untouched');

    // Writing a block back as get_lesson showed it keeps its size (and its id).
    const rewritten = await call('update_exercise', {
      lessonId,
      exerciseId: exercise.exerciseId,
      blocks: exercise.blocks,
    });
    assert.ok(!rewritten.isError, rewritten.content[0].text);
    const after = (await lessonOf(lessonId)).content.chapters[0].exercises[0].blocks;
    assert.deepEqual(
      after.map((block: { scale: string }) => block.scale),
      ['s', 'l', 'original', 'm'],
    );

    const wrong = await call('create_lesson', {
      title: 'x',
      chapters: [{ exercises: [{ title: 'x', blocks: [sized('xl')] }] }],
    });
    assert.equal(wrong.isError, true, 'an unknown size is refused');
  });

  it('problems come back in words; nothing is saved', async () => {
    const before = (await teacher.call('GET', '/api/lessons')).body.length;
    const result = await call('create_lesson', {
      title: 'Con errores',
      chapters: [
        {
          exercises: [
            {
              title: 'Mira.',
              blocks: [
                { type: 'image', file: 'cocina2.png', alt: 'x' },
                { type: 'gaps', text: 'Sin huecos.' },
                { type: 'video', youtube: 'https://vimeo.com/1', title: 'x' },
                { type: 'genially', link: 'https://example.com/6720c5563ae8449b359f1fd0' },
                { type: 'choice', questions: [{ question: '¿Sí?', options: [{ text: 'sí' }, { text: 'no' }] }] },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(result.isError, true);
    const text = result.content[0].text;
    assert.match(text, /chapter 1 › exercise 1 › block 1 \(image\): no image "cocina2.png".*cocina\.png/);
    assert.match(text, /block 2 \(gaps\): has nothing to show/);
    assert.match(text, /block 3 \(video\): .* not a YouTube video link/);
    assert.match(text, /block 4 \(genially\): .* not a Genially link/);
    assert.match(text, /block 5 \(choice\): question\(s\) 1 have no option with correct: true/);
    assert.equal((await teacher.call('GET', '/api/lessons')).body.length, before);

    const shortSequence = await call('create_lesson', {
      title: 'x',
      chapters: [{ exercises: [{ title: 'x', blocks: [{ type: 'sequence', items: ['Solo una.'] }] }] }],
    });
    assert.equal(shortSequence.isError, true, 'a sequence needs at least two items');

    for (const items of [['Solo una.'], Array.from({ length: 13 }, (_, i) => `Pregunta ${i + 1}`)]) {
      const wheel = await call('create_lesson', {
        title: 'x',
        chapters: [{ exercises: [{ title: 'x', blocks: [{ type: 'wheel', items }] }] }],
      });
      assert.equal(wheel.isError, true, `a wheel has 2 to 12 items (${items.length} given)`);
    }

    const oneGroup = await call('create_lesson', {
      title: 'x',
      chapters: [
        {
          exercises: [{ title: 'x', blocks: [{ type: 'sort', groups: [{ title: 'Singular', items: ['el coche'] }] }] }],
        },
      ],
    });
    assert.equal(oneGroup.isError, true, 'sorting needs at least two groups');

    const invalidInput = await call('create_lesson', {
      title: 'x',
      chapters: [{ exercises: [{ title: 'x', blocks: [] }] }],
    });
    assert.equal(invalidInput.isError, true, 'the input schema is checked too');
  });

  it('adds, replaces (keeping a block id) and deletes exercises', async () => {
    const { lessonId } = dataOf(
      await call('create_lesson', {
        title: 'Para editar',
        chapters: [{ exercises: [{ title: 'Uno.', blocks: [{ type: 'gaps', text: 'Hay *una* mesa.' }] }] }],
      }),
    );
    const added = await call('add_exercises', {
      lessonId,
      newChapterTitle: 'Dos',
      exercises: [{ title: 'Dos.', blocks: [{ type: 'essay' }] }],
    });
    assert.ok(!added.isError, added.content[0].text);
    assert.equal(dataOf(added).editorUrl, `${server.base}/lessons/${lessonId}/edit/2`);

    const lesson = dataOf(await call('get_lesson', { lessonId }));
    assert.deepEqual(
      lesson.chapters.map((chapter: { title: string | null }) => chapter.title),
      [null, 'Dos'],
    );
    const first = lesson.chapters[0].exercises[0];
    assert.equal(first.number, 1);
    const gapsId = first.blocks[0].id;

    const replaced = await call('update_exercise', {
      lessonId,
      exerciseId: first.exerciseId,
      title: 'Uno, otra vez.',
      blocks: [
        { id: gapsId, type: 'gaps', text: 'Hay *una* silla.' },
        { type: 'text', markdown: 'Nuevo.' },
      ],
    });
    assert.ok(!replaced.isError, replaced.content[0].text);
    const after = (await lessonOf(lessonId)).content.chapters[0].exercises[0];
    assert.equal(after.title, 'Uno, otra vez.');
    assert.equal(after.blocks[0].id, gapsId, 'the given id is kept');
    assert.notEqual(after.blocks[1].id, gapsId);

    assert.ok(!(await call('delete_exercise', { lessonId, exerciseId: first.exerciseId })).isError);
    assert.equal((await lessonOf(lessonId)).content.chapters[0].exercises.length, 0);
    assert.equal((await call('delete_exercise', { lessonId, exerciseId: first.exerciseId })).isError, true);
    teacher.close();
  });

  it('chapters and the lesson title', async () => {
    const { lessonId } = dataOf(await call('create_lesson', { title: 'Capítulos', chapters: [{ exercises: [] }] }));
    const { chapterId } = dataOf(await call('add_chapter', { lessonId, title: 'Segundo' }));
    assert.ok(!(await call('rename_chapter', { lessonId, chapterId, title: 'Práctica' })).isError);
    assert.equal((await lessonOf(lessonId)).content.chapters[1].title, 'Práctica');
    assert.ok(!(await call('delete_chapter', { lessonId, chapterId })).isError);
    const onlyChapter = (await lessonOf(lessonId)).content.chapters[0].id;
    assert.match(
      (await call('delete_chapter', { lessonId, chapterId: onlyChapter })).content[0].text,
      /at least one chapter/,
    );
    assert.ok(!(await call('rename_lesson', { lessonId, title: 'Capítulos 2' })).isError);
    assert.equal((await lessonOf(lessonId)).title, 'Capítulos 2');
  });

  it('upload_media_from_url: a file from a link into the library', async () => {
    // A tiny "PNG" (detected by its signature) that is not in the library yet.
    const png = () =>
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(32)]);
    const files: Record<string, Buffer> = {
      '/new.png': png(),
      '/other.png': png(),
      '/third.png': png(),
      '/notes.txt': Buffer.from('hola'),
    };
    const site = http.createServer((req, res) => {
      if (req.url === '/moved') return res.writeHead(302, { Location: '/other.png' }).end();
      if (req.url === '/loop') return res.writeHead(302, { Location: '/loop' }).end();
      const file = files[req.url ?? ''];
      if (!file) return res.writeHead(404).end();
      res.end(file);
    });
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    const at = (path: string) => `http://127.0.0.1:${(site.address() as AddressInfo).port}${path}`;
    const upload = (url: string, name: string) => call('upload_media_from_url', { url, name });

    try {
      const added = await upload(at('/new.png'), 'nueva.png');
      assert.ok(!added.isError, added.content[0].text);
      assert.match(added.content[0].text, /^Added "nueva.png" \(image\)/);
      const listed = dataOf(await call('list_media', { search: 'nueva' }));
      assert.deepEqual(listed, [dataOf(added)]);

      assert.ok(!(await upload(at('/moved'), 'movida.png')).isError, 'a redirect is followed');
      assert.match((await upload(at('/new.png'), 'otra.png')).content[0].text, /already in the library as "nueva.png"/);

      const problems = {
        nameTaken: await upload(at('/third.png'), 'NUEVA.png'),
        notMedia: await upload(at('/notes.txt'), 'notas.txt'),
        missing: await upload(at('/nope.png'), 'nope.png'),
        loop: await upload(at('/loop'), 'loop.png'),
      };
      for (const result of Object.values(problems)) assert.equal(result.isError, true);
      assert.match(problems.nameTaken.content[0].text, /belongs to another file/);
      assert.match(problems.notMedia.content[0].text, /not an image .* or audio/);
      assert.match(problems.missing.content[0].text, /answered 404/);
      assert.match(problems.loop.content[0].text, /Too many redirects/);

      const lesson = await call('create_lesson', {
        title: 'Con un archivo nuevo',
        chapters: [{ exercises: [{ title: 'Mira.', blocks: [{ type: 'image', file: 'nueva.png' }] }] }],
      });
      assert.ok(!lesson.isError, lesson.content[0].text);
      const linked = await call('create_lesson', {
        title: 'x',
        chapters: [
          { exercises: [{ title: 'x', blocks: [{ type: 'image', file: 'https://example.com/a.png', alt: 'x' }] }] },
        ],
      });
      assert.match(linked.content[0].text, /add it with upload_media_from_url/, 'a link as `file` points to the tool');
    } finally {
      site.close();
    }
  });

  it('upload_media_from_url: a heavy picture is compressed on the way in', async () => {
    const heavy = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    const site = http.createServer((_req, res) => res.end(heavy));
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${(site.address() as AddressInfo).port}/heavy.jpg`;
      const added = await call('upload_media_from_url', { url, name: 'pesada.jpg' });
      assert.ok(!added.isError, added.content[0].text);
      const stored = (await teacher.call('GET', '/api/media')).body.find(
        (file: { name: string }) => file.name === 'pesada.jpg',
      );
      assert.ok(stored.bytes < heavy.length / 3, `stored ${stored.bytes} of ${heavy.length} bytes`);
    } finally {
      site.close();
    }
  });

  it('a change to a lesson students see says so', async () => {
    const result = await call('add_exercises', {
      lessonId: server.lessonId,
      exercises: [{ title: 'Extra.', blocks: [{ type: 'essay' }] }],
    });
    assert.doesNotMatch(result.content[0].text, /student\(s\) can see/, 'the demo lesson: nobody has access yet');
    await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, { studentIds: [server.users.ana] });
    const seen = await call('add_exercises', {
      lessonId: server.lessonId,
      exercises: [{ title: 'Extra 2.', blocks: [{ type: 'essay' }] }],
    });
    assert.match(seen.content[0].text, /1 student\(s\) can see this lesson/);
  });
});

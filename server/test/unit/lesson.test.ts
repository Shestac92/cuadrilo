import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_IMAGE_SCALE,
  emptyContent,
  exerciseNumbers,
  hasChapter,
  hasExercise,
  homeworkContent,
  IMAGE_SCALES,
  imageScaleOf,
  isAnswerBlock,
  isEmptyBlock,
  listExercises,
  newId,
  parseDropdown,
  toPlayableBlock,
  wordLetters,
} from '@cuadrilo/shared/lesson';
import { lessonContentSchema, parseContent } from '@cuadrilo/shared/lessonSchema';

import { demoLessonContent as demoLesson } from '../fixtures/demoLesson';

const hash = 'a'.repeat(64);
const demoLessonContent = demoLesson({ kitchen: `/media/${hash}.png`, listening: `/media/${hash}.m4a` });

const wheelLesson = {
  version: 2 as const,
  chapters: [
    { id: 'c', exercises: [{ id: 'e', title: '', blocks: [{ id: 'w', type: 'wheel' as const, items: ['a', 'b'] }] }] },
  ],
};

/** The lesson format (shared/src/lesson.ts, lessonSchema.ts) on the demo lesson. */
describe('lesson format', () => {
  it('the demo lesson is valid', () => {
    assert.ok(lessonContentSchema.safeParse(demoLessonContent).success);
  });

  it('exercises are numbered across chapters', () => {
    const refs = listExercises(demoLessonContent);
    assert.deepEqual(
      refs.map((r) => `${r.number}:${r.exercise.id}:${r.chapterIndex}`),
      [
        '1:ex-un-una:0',
        '2:ex-cocina:0',
        '3:ex-el-la:1',
        '4:ex-escucha:1',
        '5:ex-pares:2',
        '6:ex-orden:2',
        '7:ex-video:2',
        '8:ex-test:2',
        '9:ex-vf:2',
        '10:ex-dialogo:2',
      ],
    );
    assert.equal(exerciseNumbers(demoLessonContent).get('ex-orden'), 6);
    assert.equal(exerciseNumbers(demoLessonContent).get('ex-un-una-rule'), undefined, 'a block is not an exercise');
  });

  it('a compare block is shown only with both pictures', () => {
    const compare = (before: string, after: string) => ({ id: 'c', type: 'compare' as const, before, after });
    assert.ok(toPlayableBlock(compare('/media/a.png', '/media/b.png')));
    assert.equal(toPlayableBlock(compare('/media/a.png', '')), null);
    assert.equal(toPlayableBlock(compare('', '')), null);
  });

  it('dropdown gaps: options, right ones, and when the block is playable', () => {
    assert.deepEqual(parseDropdown('*tengo*|tienes| tiene |'), {
      options: ['tengo', 'tienes', 'tiene'],
      answers: ['tengo'],
    });
    assert.deepEqual(parseDropdown(' *va* | *viene* |otro'), {
      options: ['va', 'viene', 'otro'],
      answers: ['va', 'viene'],
    });
    const block = (text: string) => ({ id: 'd', type: 'dropdown-gaps' as const, text });
    assert.ok(toPlayableBlock(block('Yo {*tengo*|tienes|tiene} un gato.')));
    assert.equal(toPlayableBlock(block('Yo {tengo|tienes} un gato.')), null, 'no right option');
    assert.equal(toPlayableBlock(block('Yo {*tengo*} un gato.')), null, 'nothing to choose from');
    assert.equal(toPlayableBlock(block('Yo *tengo* un gato.')), null, 'gaps markup is not a dropdown');
    assert.ok(
      isAnswerBlock(
        { version: 2, chapters: [{ id: 'a', exercises: [{ id: 'e', title: '', blocks: [block('')] }] }] },
        'd',
      ),
    );
  });

  it('build-word: letters of a word, a phrase and composed characters; empty words are left out', () => {
    assert.deepEqual(wordLetters('gato'), [['g', 'a', 't', 'o']]);
    assert.deepEqual(wordLetters('  la   casa '), [
      ['l', 'a'],
      ['c', 'a', 's', 'a'],
    ]);
    // "ñ" written as n + a combining tilde is still one letter.
    assert.deepEqual(wordLetters('man\u0303ana'), [['m', 'a', '\u00f1', 'a', 'n', 'a']]);
    const block = { id: 'w', type: 'build-word' as const, words: [{ text: 'gato', hint: 'кот' }, { text: '  ' }] };
    assert.deepEqual(toPlayableBlock(block), { ...block, words: [block.words[0]] });
    assert.equal(toPlayableBlock({ ...block, words: [{ text: ' ' }] }), null);
  });

  it('answer blocks are the ones a student answers', () => {
    assert.ok(isAnswerBlock(demoLessonContent, 'ex-un-una-gaps'));
    assert.ok(isAnswerBlock(demoLessonContent, 'ex-cocina-essay'));
    assert.ok(!isAnswerBlock(demoLessonContent, 'ex-cocina-image'), 'an image is shown only');
    assert.ok(!isAnswerBlock(demoLessonContent, 'ex-un-una-rule'));
    assert.ok(!isAnswerBlock(demoLessonContent, 'nope'));
    const blocks = [
      { id: 'c', type: 'choice' as const, questions: [] },
      { id: 't', type: 'true-false' as const, statements: [] },
      { id: 's', type: 'sequence' as const, items: [] },
    ];
    const content = { version: 2 as const, chapters: [{ id: 'a', exercises: [{ id: 'e', title: '', blocks }] }] };
    for (const block of blocks) assert.ok(isAnswerBlock(content, block.id), block.type);
  });

  it('chapters and exercises', () => {
    assert.ok(hasChapter(demoLessonContent, 'ch-practica'));
    assert.ok(hasExercise(demoLessonContent, 'ch-practica', 'ex-orden'));
    assert.ok(!hasExercise(demoLessonContent, 'ch-practica', 'ex-el-la'), 'an exercise of another chapter');
  });

  it('ids must be unique in the whole lesson', () => {
    const content = structuredClone(demoLessonContent);
    content.chapters[1].exercises[0].id = 'ex-un-una';
    const parsed = lessonContentSchema.safeParse(content);
    assert.ok(!parsed.success);
    assert.match(parsed.error.issues[0].message, /Duplicate id: ex-un-una/);
  });

  it('images and audio only from the server’s media store', () => {
    const withSrc = (type: 'image' | 'audio', src: string) => ({
      version: 2,
      chapters: [{ id: 'a', exercises: [{ id: 'i', title: '', blocks: [{ id: 'b', type, src, alt: 'x' }] }] }],
    });
    assert.ok(lessonContentSchema.safeParse(withSrc('image', `/media/${hash}.webp`)).success);
    assert.ok(lessonContentSchema.safeParse(withSrc('audio', `/media/${hash}.mp3`)).success);
    for (const [type, src] of [
      ['image', 'https://example.com/a.png'],
      ['image', `/media/${hash}.svg`],
      ['image', `/media/${hash}.m4a`],
      ['audio', `/media/${hash}.png`],
      ['image', `/media/../${hash}.png`],
      ['image', '/demo/cocina.svg'],
    ] as const) {
      assert.ok(!lessonContentSchema.safeParse(withSrc(type, src)).success, `${type} ${src}`);
    }
  });

  it('an image block has a scale: s, m, l or original; none (an old block) means original', () => {
    const doc = (block: object) => ({
      version: 2,
      chapters: [
        { id: 'a', exercises: [{ id: 'i', title: '', blocks: [{ id: 'b', type: 'image', src: '', ...block }] }] },
      ],
    });
    for (const scale of IMAGE_SCALES) assert.ok(lessonContentSchema.safeParse(doc({ scale })).success, scale);
    assert.ok(lessonContentSchema.safeParse(doc({})).success, 'a block saved before the setting existed');
    for (const scale of ['xl', 'M', '', 360, null]) {
      assert.ok(!lessonContentSchema.safeParse(doc({ scale })).success, String(scale));
    }
    assert.deepEqual([...IMAGE_SCALES], ['s', 'm', 'l', 'original']);
    assert.equal(DEFAULT_IMAGE_SCALE, 'm', 'a new block');
    assert.equal(imageScaleOf({}), 'original', 'an old block');
    assert.equal(imageScaleOf({ scale: 's' }), 's');
  });

  it('an image block stays empty or not by its picture, whatever its scale', () => {
    assert.ok(isEmptyBlock({ id: 'b', type: 'image', src: '', scale: 'm' }));
    const src = `/media/${hash}.png`;
    assert.ok(!isEmptyBlock({ id: 'b', type: 'image', src, scale: 's' }));
    const block = { id: 'b', type: 'image' as const, src, scale: 'l' as const };
    assert.equal(toPlayableBlock(block), block, 'the scale goes to the player as it is');
  });

  it('rejects malformed documents', () => {
    const bad = [
      { version: 1, chapters: [{ id: 'a', items: [] }] },
      { version: 2, chapters: [] },
      { version: 2, chapters: [{ id: 'bad id!', exercises: [] }] },
      { version: 2, chapters: [{ id: 'a', exercises: [{ id: 'e', blocks: [] }] }] },
      {
        version: 2,
        chapters: [
          {
            id: 'a',
            exercises: [{ id: 'v', title: '', blocks: [{ id: 'b', type: 'video', youtubeId: 'short', title: 'x' }] }],
          },
        ],
      },
      {
        version: 2,
        chapters: [{ id: 'a', exercises: [{ id: 'e', title: '', blocks: [{ id: 'b', type: 'unknown' }] }] }],
      },
    ];
    for (const doc of bad) assert.ok(!lessonContentSchema.safeParse(doc).success, JSON.stringify(doc));
  });

  it('a new lesson has one empty chapter; a broken stored document is an empty lesson', () => {
    const empty = emptyContent();
    assert.equal(empty.chapters.length, 1);
    assert.equal(empty.chapters[0].exercises.length, 0);
    assert.match(newId(), /^[a-f0-9]{12}$/);
    assert.equal(parseContent(null).chapters.length, 1);
    assert.equal(parseContent('{"version":9}').chapters[0].exercises.length, 0);
  });

  it('a half-filled lesson is valid (the editor saves every change)', () => {
    const blocks = [
      { id: 'b1', type: 'text', markdown: '' },
      { id: 'b2', type: 'image', src: '' },
      { id: 'b3', type: 'video', youtubeId: '', title: '' },
      { id: 'b4', type: 'audio', src: '' },
      { id: 'b5', type: 'gaps', text: '' },
      { id: 'b6', type: 'drag-gaps', text: '', distractors: [] },
      { id: 'b7', type: 'match', pairs: [{ left: 'libro', right: '' }] },
      { id: 'b8', type: 'order', sentences: [] },
      { id: 'b9', type: 'choice', questions: [{ question: '', options: [{ text: '' }, { text: '' }] }] },
      { id: 'b10', type: 'true-false', statements: [{ text: ' ', true: true }] },
      { id: 'b11', type: 'sequence', items: ['', ''] },
      { id: 'b13', type: 'wheel', items: ['', ''] },
      {
        id: 'b12',
        type: 'sort',
        groups: [
          { title: 'singular', items: ['libro'] },
          { title: '', items: [] },
        ],
      },
    ];
    const doc = { version: 2, chapters: [{ id: 'a', exercises: [{ id: 'e', title: '', blocks }] }] };
    const parsed = lessonContentSchema.safeParse(doc);
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
    for (const block of parsed.data.chapters[0].exercises[0].blocks) assert.ok(isEmptyBlock(block), block.type);
  });

  it('empty blocks are the ones with nothing to show', () => {
    assert.ok(!isEmptyBlock({ id: 'b', type: 'essay' }), 'an essay is just a text field');
    assert.ok(isEmptyBlock({ id: 'b', type: 'gaps', text: 'Sin huecos todavía.' }));
    assert.ok(isEmptyBlock({ id: 'b', type: 'gaps', text: 'Un ** hueco vacío' }));
    assert.ok(!isEmptyBlock({ id: 'b', type: 'gaps', text: 'Tengo *un* perro.' }));
    assert.ok(isEmptyBlock({ id: 'b', type: 'match', pairs: [{ left: ' ', right: 'el' }] }));
    assert.ok(!isEmptyBlock({ id: 'b', type: 'match', pairs: [{ left: 'libro', right: 'el' }] }));
    const group = (title: string, ...items: string[]) => ({ title, items });
    assert.ok(
      isEmptyBlock({ id: 'b', type: 'sort', groups: [group('singular', 'libro')] }),
      'one group is not a choice',
    );
    assert.ok(isEmptyBlock({ id: 'b', type: 'sort', groups: [group('singular', 'libro'), group('plural', ' ')] }));
    assert.ok(
      !isEmptyBlock({ id: 'b', type: 'sort', groups: [group('singular', 'libro'), group('plural', 'libros')] }),
    );
    assert.ok(isEmptyBlock({ id: 'b', type: 'order', sentences: [{ text: '  ' }] }));
    assert.ok(!isEmptyBlock({ id: 'b', type: 'text', markdown: 'Hola' }));
    const question = (correct?: boolean) => ({
      question: 'En verano hace',
      options: [{ text: 'calor', correct }, { text: 'frío' }],
    });
    assert.ok(isEmptyBlock({ id: 'b', type: 'choice', questions: [question()] }), 'no right option yet');
    assert.ok(!isEmptyBlock({ id: 'b', type: 'choice', questions: [question(true)] }));
    assert.ok(!isEmptyBlock({ id: 'b', type: 'true-false', statements: [{ text: 'Hace sol.', true: false }] }));
    assert.ok(isEmptyBlock({ id: 'b', type: 'sequence', items: ['Hola.', ''] }), 'one item is not a sequence');
    assert.ok(!isEmptyBlock({ id: 'b', type: 'sequence', items: ['Hola.', 'Adiós.'] }));
    assert.ok(isEmptyBlock({ id: 'b', type: 'wheel', items: ['¿Qué tiempo hace?', ' '] }), 'one item is not a wheel');
    assert.ok(!isEmptyBlock({ id: 'b', type: 'wheel', items: ['¿Qué tiempo hace?', 'Describe tu casa'] }));
    assert.ok(!isAnswerBlock(wheelLesson, 'w'), 'a wheel is played, not answered');
  });

  it('playable blocks: half-filled rows left out, the same block when nothing is', () => {
    const match = {
      id: 'm',
      type: 'match' as const,
      pairs: [
        { left: 'libro', right: 'el' },
        { left: 'mesa', right: '' },
      ],
    };
    assert.deepEqual(toPlayableBlock(match), { ...match, pairs: [{ left: 'libro', right: 'el' }] });
    const sort = {
      id: 's',
      type: 'sort' as const,
      groups: [
        { title: 'singular', items: ['libro', ' '] },
        { title: 'plural', items: ['libros'] },
        { title: '', items: ['mesas'] },
        { title: 'sin palabras', items: [] },
      ],
    };
    assert.deepEqual(toPlayableBlock(sort), {
      ...sort,
      groups: [
        { title: 'singular', items: ['libro'] },
        { title: 'plural', items: ['libros'] },
      ],
    });
    const filled = {
      id: 's2',
      type: 'sort' as const,
      groups: [
        { title: 'singular', items: ['libro'] },
        { title: 'plural', items: ['libros'] },
      ],
    };
    assert.equal(toPlayableBlock(filled), filled, 'nothing to leave out: the same object');
    const order = {
      id: 'o',
      type: 'order' as const,
      sentences: [{ text: 'Tengo un perro.', hint: 'У меня есть собака.' }, { text: ' ' }],
    };
    assert.deepEqual(toPlayableBlock(order), { ...order, sentences: [order.sentences[0]] });
    const complete = { id: 'c', type: 'order' as const, sentences: [{ text: 'Hola.' }] };
    assert.equal(toPlayableBlock(complete), complete, 'nothing to leave out: the same object (memos keyed on it hold)');
    assert.equal(
      toPlayableBlock({ id: 'g', type: 'gaps', text: 'Un * * hueco' }),
      null,
      'a gap without an answer is not one',
    );
    assert.ok(toPlayableBlock({ id: 'g', type: 'gaps', text: 'Va *a|al* cine' }));

    const right = { question: 'En verano hace', options: [{ text: 'calor', correct: true }, { text: 'frío' }] };
    const test = {
      id: 't',
      type: 'choice' as const,
      questions: [
        { ...right, options: [...right.options, { text: ' ' }] },
        { question: 'Sin respuesta', options: [{ text: 'a' }, { text: 'b' }] },
      ],
    };
    assert.deepEqual(
      toPlayableBlock(test),
      { ...test, questions: [right] },
      'empty options and unanswerable questions',
    );
    const completeTest = { id: 't', type: 'choice' as const, questions: [right] };
    assert.equal(toPlayableBlock(completeTest), completeTest);
    const statements = {
      id: 's',
      type: 'true-false' as const,
      statements: [
        { text: 'Hace sol.', true: true },
        { text: '', true: false },
      ],
    };
    assert.deepEqual(toPlayableBlock(statements), { ...statements, statements: [statements.statements[0]] });
  });

  it('a homework is the lesson with only its exercises on one page; numbers stay', () => {
    const refs = listExercises(demoLessonContent);
    const picked = refs.filter((ref) => ref.number === 2 || ref.number === refs.length);
    assert.notEqual(picked[0].chapterIndex, picked[1].chapterIndex, 'the pair is from different chapters');
    const part = homeworkContent(demoLessonContent, new Set(picked.map((ref) => ref.exercise.id)));
    assert.equal(part.chapters.length, 1);
    assert.deepEqual(
      part.chapters[0].exercises.map((e) => e.id),
      picked.map((ref) => ref.exercise.id),
    );
    const numbers = exerciseNumbers(demoLessonContent);
    assert.deepEqual(
      picked.map((ref) => numbers.get(ref.exercise.id)),
      [2, refs.length],
    );
    assert.equal(homeworkContent(demoLessonContent, new Set()).chapters.length, 0);
  });
});

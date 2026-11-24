import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { alignDictation, isDictationRight } from '@cuadrilo/shared/dictation';
import { isAnswerType, toPlayableBlock } from '@cuadrilo/shared/lesson';
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

const marks = (expected: string, typed: string) =>
  alignDictation(expected, typed)
    .map((w) => `${w.text}:${w.kind}`)
    .join(' ');

describe('dictation', () => {
  it('a right sentence is all green; the case does not matter', () => {
    assert.equal(marks('Vengo del colegio.', 'vengo DEL Colegio.'), 'vengo:ok DEL:ok Colegio.:ok');
    assert.ok(isDictationRight('Vengo del colegio.', '  vengo   del colegio. '));
  });

  it('accents and punctuation are part of a word', () => {
    assert.equal(marks('¿Dónde está?', 'donde esta'), 'donde:wrong esta:wrong');
    assert.equal(marks('Hola, Ana.', 'hola Ana.'), 'hola:wrong Ana.:ok');
    assert.ok(!isDictationRight('está', 'esta'));
  });

  it('a composed and a decomposed accent are the same letter', () => {
    assert.ok(isDictationRight('está', 'está'));
  });

  it('a missed word is marked where it belongs, and the rest stays green', () => {
    assert.equal(marks('el gato come pescado', 'gato come pescado'), '…:missing gato:ok come:ok pescado:ok');
    assert.equal(marks('el gato come pescado', 'el gato pescado'), 'el:ok gato:ok …:missing pescado:ok');
    assert.equal(marks('el gato come', 'el gato'), 'el:ok gato:ok …:missing');
  });

  it('an extra word is red and the rest stays green', () => {
    assert.equal(marks('vengo del colegio', 'vengo de el colegio'), 'vengo:ok de:wrong el:wrong colegio:ok');
    assert.equal(marks('vengo del colegio', 'vengo muy del colegio'), 'vengo:ok muy:wrong del:ok colegio:ok');
  });

  it('a wrong word takes the place of the missing one (no mark besides it)', () => {
    assert.equal(marks('el gato come pescado', 'el perro come pescado'), 'el:ok perro:wrong come:ok pescado:ok');
  });

  it('an empty answer shows only what is missing, never the words', () => {
    assert.equal(marks('el gato come', ''), '…:missing …:missing …:missing');
    assert.ok(!isDictationRight('el gato', ''));
  });

  it('is an answer block, shown only with audio and a text', () => {
    assert.ok(isAnswerType('dictation'));
    const a = { src: `/media/${'a'.repeat(64)}.mp3`, text: 'Hola.' };
    const block = (sentences: unknown[]) => ({ id: 'd', type: 'dictation', sentences }) as never;
    assert.equal(toPlayableBlock(block([])), null);
    assert.equal(
      toPlayableBlock(
        block([
          { src: '', text: 'Hola.' },
          { ...a, text: ' ' },
        ]),
      ),
      null,
    );
    assert.deepEqual((toPlayableBlock(block([a, { src: '', text: 'x' }])) as { sentences: unknown[] }).sentences, [a]);
  });

  it('the schema takes a half filled block and not a bad audio address', () => {
    const lesson = (sentences: unknown[]) => ({
      version: 2,
      chapters: [
        { id: 'c', exercises: [{ id: 'e', title: 't', blocks: [{ id: 'd', type: 'dictation', sentences }] }] },
      ],
    });
    assert.ok(lessonContentSchema.safeParse(lesson([{ src: '', text: '' }])).success);
    assert.ok(!lessonContentSchema.safeParse(lesson([{ src: 'https://evil.test/a.mp3', text: 'x' }])).success);
  });
});

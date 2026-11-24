import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { colorText, uncolorText } from '../src/editor/textColor';

const ph = 'texto';
const at = (text: string, word: string) => [text.indexOf(word), text.indexOf(word) + word.length] as const;

/** The text block's colour buttons: the Markdown written for the teacher. */
describe('colorText', () => {
  it('wraps the selection', () => {
    const text = 'Usamos un con masculinos.';
    const [s, e] = at(text, 'un');
    const r = colorText(text, s, e, 'red', ph);
    assert.equal(r.text, 'Usamos :red[un] con masculinos.');
    assert.equal(r.text.slice(r.start, r.end), ':red[un]');
  });

  it('spaces at the edges of the selection stay outside', () => {
    assert.equal(colorText('a  hola  b', 1, 9, 'blue', ph).text, 'a  :blue[hola]  b');
  });

  it('nothing selected: a placeholder to type over', () => {
    assert.equal(colorText('Hola ', 5, 5, 'green', ph).text, 'Hola :green[texto]');
  });

  it('each line apart; list, heading and quote markers stay outside', () => {
    const text = '- uno\n- dos\n\n## Título\n> cita';
    assert.equal(
      colorText(text, 0, text.length, 'teal', ph).text,
      '- :teal[uno]\n- :teal[dos]\n\n## :teal[Título]\n> :teal[cita]',
    );
  });

  it('table cells one by one, so the table stays a table', () => {
    const text = '| a | b |\n|---|---|\n| un | una |';
    const r = colorText(text, 0, text.length, 'orange', ph).text;
    assert.equal(r, '| :orange[a] | :orange[b] |\n|---|---|\n| :orange[un] | :orange[una] |');
  });

  it('the whole of a coloured part, or the cursor inside one: the colour changes, nothing nests', () => {
    const text = 'a :red[hola] b';
    const [s, e] = at(text, 'hola');
    assert.equal(colorText(text, s, e, 'blue', ph).text, 'a :blue[hola] b');
    assert.equal(colorText(text, s + 2, s + 2, 'blue', ph).text, 'a :blue[hola] b');
  });

  it('a part of a coloured part is coloured on its own, inside', () => {
    const text = ':red[uno dos]';
    const [s, e] = at(text, 'dos');
    assert.equal(colorText(text, s, e, 'blue', ph).text, ':red[uno :blue[dos]]');
  });

  it('brackets inside the words are matched', () => {
    const text = ':red[a [b] c] d';
    assert.equal(colorText(text, 5, 5, 'green', ph).text, ':green[a [b] c] d');
  });
});

describe('uncolorText', () => {
  it('takes the colour off the part the selection is in', () => {
    const text = 'a :red[hola] b';
    const [s, e] = at(text, 'hola');
    const r = uncolorText(text, s, e);
    assert.equal(r?.text, 'a hola b');
    assert.equal(r?.text.slice(r.start, r.end), 'hola');
  });

  it('the cursor inside is enough; the inner one first when nested', () => {
    assert.equal(uncolorText('a :red[hola] b', 8, 8)?.text, 'a hola b');
    assert.equal(uncolorText(':red[uno :blue[dos]]', 15, 15)?.text, ':red[uno dos]');
  });

  it('nothing coloured there: nothing to do; other directives are not ours', () => {
    assert.equal(uncolorText('hola', 1, 3), undefined);
    assert.equal(uncolorText('Nota:casa[x]', 8, 9), undefined);
  });
});

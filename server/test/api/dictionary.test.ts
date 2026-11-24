import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { type Client, signIn, startServer, type TestServer } from '../helpers';

/** API part 6: the translator and the vocabulary (dictionary built from test/fixtures/dictionary). */
describe('translator and vocabulary', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  let ben: Client;
  const lookup = (c: Client, word: string) => c.call('GET', `/api/dictionary?word=${encodeURIComponent(word)}`);
  const lemmas = (r: { body: { lemma: string }[] }) => r.body.map((x) => x.lemma);

  before(async () => {
    server = await startServer({ dictionary: true });
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
    ben = await signIn(server, 'ben');
  });
  after(() => server.stop());

  describe('lookup', () => {
    it('any form, any case → the lemma', async () => {
      const r = await lookup(ana, 'Tengo');
      assert.equal(r.status, 200);
      assert.deepEqual(lemmas(r), ['tener']);
      assert.ok(r.body[0].translations.length > 0 && r.body[0].translations.length <= 10);
    });

    it('for the teacher too; ambiguous forms and contractions give several', async () => {
      assert.deepEqual(lemmas(await lookup(teacher, 'vino')).sort(), ['venir', 'vino']);
      assert.deepEqual(lemmas(await lookup(ana, 'del')).sort(), ['de', 'el']);
    });

    it('unknown word → []', async () => {
      assert.deepEqual((await lookup(ana, 'qwertyzx')).body, []);
    });

    it('only one word', async () => {
      for (const word of ['dos palabras', '', 'casa1', 'a'.repeat(65), '<b>']) {
        const r = await lookup(ana, word);
        assert.equal(r.status, 400, word);
        assert.equal(r.body.code, 'invalid_input');
      }
      assert.equal((await ana.call('GET', '/api/dictionary')).status, 400);
    });
  });

  describe('vocabulary', () => {
    it('only for students', async () => {
      assert.equal((await teacher.call('GET', '/api/vocabulary')).status, 403);
    });

    it('saves with the dictionary’s first 5 translations; the same lemma again updates', async () => {
      const r = await ana.call('POST', '/api/vocabulary', { word: 'buenas', lemma: 'bueno', translation: 'hack' });
      assert.equal(r.status, 400, 'buenas is not a form of bueno in the fixtures');

      const saved = await ana.call('POST', '/api/vocabulary', { word: 'tengo', lemma: 'tener', translation: 'hack' });
      assert.equal(saved.status, 201);
      const fromDictionary = (await lookup(ana, 'tengo')).body[0].translations.slice(0, 5).join(', ');
      assert.equal(saved.body.translation, fromDictionary, 'the client’s translation is ignored');
      assert.equal(saved.body.word, 'tengo');
      assert.equal(saved.body.lessonId, null);

      const again = await ana.call('POST', '/api/vocabulary', { word: 'tienes', lemma: 'tener' });
      assert.equal(again.status, 200);
      assert.equal(again.body.id, saved.body.id);
      assert.equal(again.body.word, 'tienes');

      const bueno = await ana.call('POST', '/api/vocabulary', { word: 'bueno', lemma: 'bueno' });
      assert.equal(bueno.body.translation.split(', ').length, 5, 'at most 5 translations');
    });

    it('validates the word and the lemma', async () => {
      assert.equal((await ana.call('POST', '/api/vocabulary', { word: 'tengo', lemma: 'casa' })).status, 400);
      assert.equal((await ana.call('POST', '/api/vocabulary', { word: 'qwertyzx', lemma: 'qwertyzx' })).status, 400);
      const noAccess = await ana.call('POST', '/api/vocabulary', {
        word: 'casas',
        lemma: 'casa',
        lessonId: server.lessonId,
      });
      assert.equal(noAccess.status, 404, 'a lesson without access');
    });

    it('saved in a lesson: its title is shown', async () => {
      await teacher.call('PUT', `/api/lessons/${server.lessonId}/access`, { studentIds: [server.users.ana] });
      const r = await ana.call('POST', '/api/vocabulary', { word: 'casas', lemma: 'casa', lessonId: server.lessonId });
      assert.equal(r.body.lessonTitle, 'Los artículos');
    });

    it('newest first, private, deletable only by the owner', async () => {
      const list = (await ana.call('GET', '/api/vocabulary')).body;
      assert.deepEqual(
        list.map((e: { lemma: string }) => e.lemma),
        ['casa', 'bueno', 'tener'],
      );
      assert.deepEqual((await ben.call('GET', '/api/vocabulary')).body, []);
      assert.equal((await ben.call('DELETE', `/api/vocabulary/${list[0].id}`)).status, 404);
      assert.equal((await ana.call('DELETE', `/api/vocabulary/${list[0].id}`)).status, 204);
      assert.equal((await ana.call('DELETE', `/api/vocabulary/${list[0].id}`)).status, 404);
    });

    it('without a dictionary: 503, the vocabulary list still works', async () => {
      const file = path.join(server.dictionariesDir, 'es-ru.db');
      fs.renameSync(file, `${file}.away`);
      try {
        const r = await lookup(ana, 'casa');
        assert.equal(r.status, 503);
        assert.equal(r.body.code, 'dictionary_unavailable');
        assert.equal((await ana.call('POST', '/api/vocabulary', { word: 'casa', lemma: 'casa' })).status, 503);
        assert.equal((await ana.call('GET', '/api/vocabulary')).status, 200);
      } finally {
        fs.renameSync(`${file}.away`, file);
      }
      assert.equal((await lookup(ana, 'casa')).status, 200, 'back once the file is there');
    });
  });
});

/** The dictionary is the file of the installation's pair of languages (APP_LANG and the students' language). */
describe('which dictionary', () => {
  const config = async (server: TestServer) => (await fetch(`${server.base}/api/config`)).json();

  it('Spanish installation: dictionaries/es-ru.db is used, /api/config says so', async () => {
    const server = await startServer({ dictionary: true });
    try {
      assert.deepEqual(await config(server), { lang: 'es', dictionary: true, theme: 'classic' });
      assert.ok(fs.existsSync(path.join(server.dictionariesDir, 'es-ru.db')));
    } finally {
      await server.stop();
    }
  });

  it('English installation has no en-ru.db: the translator is off, the rest works', async () => {
    const server = await startServer({ dictionary: true, lang: 'en' });
    try {
      assert.deepEqual(await config(server), { lang: 'en', dictionary: false, theme: 'classic' });
      const ana = await signIn(server, 'ana');
      const r = await ana.call('GET', '/api/dictionary?word=casa');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'dictionary_unavailable');
      assert.equal((await ana.call('GET', '/api/vocabulary')).status, 200);
    } finally {
      await server.stop();
    }
  });

  it('TRANSLATION_LANG not set (it has no default): the translator is off even though a dictionary file is there', async () => {
    const server = await startServer({ dictionary: true, translationLang: '' });
    try {
      assert.ok(fs.existsSync(path.join(server.dictionariesDir, 'es-ru.db')));
      assert.deepEqual(await config(server), { lang: 'es', dictionary: false, theme: 'classic' });
      const ana = await signIn(server, 'ana');
      const r = await ana.call('GET', '/api/dictionary?word=casa');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'dictionary_unavailable');
      assert.equal((await ana.call('GET', '/api/vocabulary')).status, 200);
    } finally {
      await server.stop();
    }
  });
});

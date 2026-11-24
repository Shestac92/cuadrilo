import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';

import sharp from 'sharp';

import { compressImage } from '../../src/imageCompress';
import { anonymous, type Client, signIn, startServer, type TestServer } from '../helpers';

/** Lesson media: upload (teacher) and serving (/media, signed in). */
describe('media', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;
  const demoFile = (file: string) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'media', file));
  /** A tiny valid GIF (1×1). */
  const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  describe('serving', () => {
    it('the demo lesson refers to stored files', async () => {
      const lesson = (await teacher.call('GET', `/api/lessons/${server.lessonId}`)).body;
      const srcs = lesson.content.chapters.flatMap((c: { exercises: { blocks: { src?: string }[] }[] }) =>
        c.exercises.flatMap((e) => e.blocks.map((b) => b.src).filter(Boolean)),
      );
      assert.deepEqual(srcs.sort(), [server.media.kitchen, server.media.listening].sort());
      // The picture was a PNG: the library stores it as a WebP.
      assert.match(server.media.kitchen, /^\/media\/[a-f0-9]{64}\.webp$/);
    });

    it('any signed-in user gets the file, cached for good', async () => {
      const r = await ana.fetch(server.media.kitchen);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'image/webp');
      assert.match(r.headers.get('cache-control') ?? '', /immutable/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(await compressImage(demoFile('cocina.png'))));
    });

    it('audio supports seeking (Range)', async () => {
      const r = await ana.fetch(server.media.listening, { Range: 'bytes=0-99' });
      assert.equal(r.status, 206);
      assert.equal(r.headers.get('content-type'), 'audio/mp4');
      assert.match(r.headers.get('content-range') ?? '', /^bytes 0-99\//);
      assert.equal((await r.arrayBuffer()).byteLength, 100);
    });

    it('not without a session', async () => {
      const r = await anonymous(server, 'GET', server.media.kitchen);
      assert.equal(r.status, 401);
    });

    it('only stored file names', async () => {
      const missing = `/media/${'b'.repeat(64)}.png`;
      for (const url of [missing, '/media/cocina.png', '/media/..%2Flessons.db', `/media/${'a'.repeat(64)}.svg`]) {
        assert.equal((await ana.fetch(url)).status, 404, url);
      }
    });
  });

  describe('upload', () => {
    const upload = (client: Client, name: string, bytes: Buffer, type = 'application/octet-stream') =>
      client.upload(`/api/media?name=${encodeURIComponent(name)}`, bytes, type);

    it('only the teacher', async () => {
      assert.equal((await upload(ana, 'punto.gif', gif, 'image/gif')).status, 403);
      assert.equal((await ana.call('GET', '/api/media')).status, 403);
    });

    it('stores a file once, under the name it was uploaded with', async () => {
      const first = await upload(teacher, 'punto.gif', gif, 'image/gif');
      assert.equal(first.status, 201);
      assert.match(first.body.url, /^\/media\/[a-f0-9]{64}\.gif$/);
      assert.deepEqual(
        [first.body.name, first.body.kind, first.body.bytes, first.body.existed, first.body.usedIn],
        ['punto.gif', 'image', gif.length, false, []],
      );

      const again = await upload(teacher, 'otro-nombre.gif', gif);
      assert.equal(again.status, 200, 'the same content: already there');
      assert.deepEqual([again.body.id, again.body.name, again.body.existed], [first.body.id, 'punto.gif', true]);

      const served = await ana.fetch(first.body.url);
      assert.equal(served.headers.get('content-type'), 'image/gif');
      assert.ok(Buffer.from(await served.arrayBuffer()).equals(gif));
    });

    it('a name another file has is refused (ignoring case)', async () => {
      const r = await upload(teacher, 'COCINA.png', demoFile('lucia.m4a').subarray(0, 20_000));
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'name_taken');
      assert.equal((await upload(teacher, '', gif)).status, 400, 'a name is required');
      assert.equal((await teacher.upload('/api/media', gif, 'image/gif')).status, 400, 'no ?name=');
    });

    it('the type comes from the content, not from the Content-Type', async () => {
      const r = await upload(teacher, 'audio.png', demoFile('lucia.m4a'), 'image/png');
      assert.equal(r.body.url, server.media.listening);
      assert.equal(r.body.kind, 'audio');
    });

    it('rejects other formats', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      for (const [bytes, type] of [
        [svg, 'image/svg+xml'],
        [Buffer.from('hola, esto es texto plano'), 'text/plain'],
        [Buffer.alloc(0), 'image/png'],
      ] as const) {
        const r = await upload(teacher, `file-${type}`, bytes, type);
        assert.equal(r.status, 400, type);
        assert.equal(r.body.code, 'invalid_input');
      }
    });

    it('size limits: 40 MB images (they are compressed), 30 MB audio', async () => {
      const png = Buffer.concat([demoFile('cocina.png').subarray(0, 16), Buffer.alloc(40 * 1024 * 1024)]);
      let r = await upload(teacher, 'grande.png', png, 'image/png');
      assert.equal(r.status, 413);
      assert.equal(r.body.code, 'too_large');

      const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(30 * 1024 * 1024)]);
      r = await upload(teacher, 'grande.mp3', audio, 'audio/mpeg');
      assert.equal(r.status, 413);
      assert.equal(r.body.code, 'too_large');
    });
  });

  describe('library', () => {
    it('lists the files, newest first, with the lessons that show them', async () => {
      const list = (await teacher.call('GET', '/api/media')).body as { name: string; usedIn: { title: string }[] }[];
      const byName = new Map(list.map((file) => [file.name, file]));
      assert.equal(list[0].name, 'punto.gif', 'the last upload first');
      assert.deepEqual(
        byName.get('cocina.png')?.usedIn.map((lesson) => lesson.title),
        ['Los artículos'],
        'the demo files are in the library under their names',
      );
      assert.deepEqual(byName.get('punto.gif')?.usedIn, []);
    });

    it('renames; a taken name is refused', async () => {
      const gifFile = (await teacher.call('GET', '/api/media')).body.find(
        (f: { name: string }) => f.name === 'punto.gif',
      );
      let r = await teacher.call('PATCH', `/api/media/${gifFile.id}`, { name: '  pixel.gif ' });
      assert.equal(r.body.name, 'pixel.gif');
      r = await teacher.call('PATCH', `/api/media/${gifFile.id}`, { name: 'Lucia.m4a' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'name_taken');
      assert.equal((await teacher.call('PATCH', '/api/media/999999', { name: 'x' })).status, 404);
    });

    it('a file a lesson shows cannot be deleted; an unused one goes with its file', async () => {
      const list = (await teacher.call('GET', '/api/media')).body as { id: number; name: string; url: string }[];
      const kitchen = list.find((f) => f.name === 'cocina.png');
      const pixel = list.find((f) => f.name === 'pixel.gif');
      assert.ok(kitchen && pixel);

      const refused = await teacher.call('DELETE', `/api/media/${kitchen.id}`);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, 'media_in_use');
      assert.match(refused.body.error, /Los artículos/);

      assert.equal((await teacher.call('DELETE', `/api/media/${pixel.id}`)).status, 204);
      assert.equal((await ana.fetch(pixel.url)).status, 404, 'the file is gone too');
      assert.equal((await teacher.call('DELETE', `/api/media/${pixel.id}`)).status, 404);
    });
  });

  describe('lessons', () => {
    it('a lesson may refer only to stored files', async () => {
      const content = (src: string) => ({
        version: 2,
        chapters: [
          { id: 'c', exercises: [{ id: 'i', title: '', blocks: [{ id: 'b', type: 'image', src, alt: 'x' }] }] },
        ],
      });
      const created = (await teacher.call('POST', '/api/lessons', { title: 'Media' })).body;
      const url = `/api/lessons/${created.id}/content`;
      assert.equal(
        (await teacher.call('PUT', url, { content: content('https://example.com/a.png'), rev: 0 })).status,
        400,
      );
      assert.equal((await teacher.call('PUT', url, { content: content(server.media.kitchen), rev: 0 })).status, 200);
    });
  });
});

/** Files stored before the media library existed get a record when the server starts. */
describe('media library: files from before it', () => {
  let server: TestServer;
  let teacher: Client;
  const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  const strayFile = `${crypto.createHash('sha256').update(gif).digest('hex')}.gif`;

  before(async () => {
    server = await startServer({
      prepare: (dataDir) => {
        // As an older version left it: the files are there, the library is empty.
        const database = new DatabaseSync(path.join(dataDir, 'lessons.db'));
        database.exec('DELETE FROM media');
        database.close();
        fs.writeFileSync(path.join(dataDir, 'media', strayFile), gif);
      },
    });
    teacher = await signIn(server, 'teacher');
  });
  after(() => server.stop());

  it('files stored before the library are recorded under their file names', async () => {
    const list = (await teacher.call('GET', '/api/media')).body as { name: string; kind: string; bytes: number }[];
    const names = list.map((file) => file.name).sort();
    const stored = fs.readdirSync(path.join(server.dataDir, 'media')).filter((file) => file !== '.gitkeep');
    assert.deepEqual(names, stored.sort());
    assert.equal(names.length, 3, 'the two fixture files and the stray one');
    const stray = list.find((file) => file.name === strayFile);
    assert.deepEqual([stray?.kind, stray?.bytes], ['image', gif.length]);
  });
});

describe('media: pictures are compressed on upload', () => {
  let server: TestServer;
  let teacher: Client;
  let ana: Client;

  before(async () => {
    server = await startServer();
    teacher = await signIn(server, 'teacher');
    ana = await signIn(server, 'ana');
  });
  after(() => server.stop());

  it('a heavy picture (over the old 10 MB limit) is stored scaled down, and once', async () => {
    const original = await sharp({
      create: {
        width: 3600,
        height: 2600,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    assert.ok(original.length > 10 * 1024 * 1024, 'the test picture is over the old limit');

    const first = await teacher.upload('/api/media?name=grande.jpg', original, 'image/jpeg');
    assert.equal(first.status, 201);
    assert.match(first.body.url, /^\/media\/[a-f0-9]{64}\.webp$/);
    assert.ok(first.body.bytes < original.length / 4, `stored ${first.body.bytes} of ${original.length} bytes`);

    const served = Buffer.from(await (await ana.fetch(first.body.url)).arrayBuffer());
    assert.equal(served.length, first.body.bytes, 'the library records the size of what is stored');
    const { width, height } = await sharp(served).metadata();
    assert.deepEqual([width, height], [1800, 1300]);

    const again = await teacher.upload('/api/media?name=otra.jpg', original, 'image/jpeg');
    assert.equal(again.status, 200, 'the same picture again: the same stored file');
    assert.deepEqual([again.body.id, again.body.existed], [first.body.id, true]);
  });

  it('a heavy PNG photo is stored as a WebP', async () => {
    const photo = await sharp({
      create: {
        width: 2400,
        height: 2400,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();
    const r = await teacher.upload('/api/media?name=foto.png', photo, 'image/png');
    assert.equal(r.status, 201);
    assert.match(r.body.url, /\.webp$/);
    assert.ok(r.body.bytes * 2 <= photo.length);
  });
});

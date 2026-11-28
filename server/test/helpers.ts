import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { io, type Socket } from 'socket.io-client';

import { writeTestDictionary } from './fixtures/testDictionary';
import { TEST_PASSWORD, type TestLogin } from './users';

/**
 * Integration tests run the real server as a child process on a temporary
 * data directory (DATA_DIR): its own lessons.db, seeded by seed.ts,
 * and a small dictionary (fixtures/testDictionary.ts). data/ is never used.
 */

const SERVER_DIR = path.resolve(__dirname, '..');
const TSX_CLI = require.resolve('tsx/cli');

/** Runs a server script with tsx; resolves with its stdout. */
export function runScript(script: string, env: NodeJS.ProcessEnv, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, script, ...args], {
      cwd: SERVER_DIR,
      env: { ...process.env, ...env },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${script} exited ${code}: ${err}`))));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export interface TestServer {
  base: string;
  dataDir: string;
  /** The temporary dictionaries folder (DICTIONARIES_DIR); with `dictionary: true` it holds the test dictionary file. */
  dictionariesDir: string;
  /** User ids by login. */
  users: Record<TestLogin, number>;
  /** The demo lesson (ids like ex-un-una-gaps, see fixtures/demoLesson.ts). */
  lessonId: number;
  /** /media/… URLs of the demo lesson's image and audio. */
  media: { kitchen: string; listening: string };
  /** Direct access to the test database, for setups the API can't make (e.g. an old class). */
  db: () => DatabaseSync;
  stop: () => Promise<void>;
}

export async function startServer({
  dictionary = false,
  lang = 'es',
  translationLang = dictionary ? 'ru' : undefined,
  prepare,
  serverEnv,
}: {
  /** Writes the test dictionary (a test pair of languages) into the temporary dictionaries folder. */
  dictionary?: boolean;
  lang?: string;
  /** TRANSLATION_LANG of the server: the test pair's language when there is a dictionary; '' or undefined: not set (no translator). */
  translationLang?: string;
  /** Runs on the data folder after seeding, before the server starts (state left by an older version). */
  prepare?: (dataDir: string) => void;
  /** More environment for the server process (e.g. the desktop app's CLIENT_DIR). */
  serverEnv?: NodeJS.ProcessEnv;
} = {}): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  const dictionariesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictionaries-'));
  const env = {
    DATA_DIR: dataDir,
    DICTIONARIES_DIR: dictionariesDir,
    HOUSEKEEPING_MS: '200',
    NODE_ENV: 'test',
    APP_LANG: lang,
    TRANSLATION_LANG: translationLang ?? '',
  };
  const seeded = JSON.parse(await runScript('test/seed.ts', env)) as Pick<TestServer, 'users' | 'lessonId' | 'media'>;
  if (dictionary) writeTestDictionary(dictionariesDir);
  prepare?.(dataDir);

  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [TSX_CLI, 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      // OAuth: the issuer and the MCP resource are this server; client documents (CIMD) may be local.
      PUBLIC_URL: `http://127.0.0.1:${port}`,
      ALLOW_LOCAL_FETCH: '1',
      ...serverEnv,
    },
  });
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 15_000);
    const onData = (d: Buffer) => {
      log += d;
      if (log.includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', onData);
    child.stderr!.on('data', onData);
    child.on('exit', (code) => reject(new Error(`server exited ${code}:\n${log}`)));
  });

  let database: DatabaseSync | undefined;
  return {
    base: `http://127.0.0.1:${port}`,
    dataDir,
    dictionariesDir,
    ...seeded,
    db: () => (database ??= new DatabaseSync(path.join(dataDir, 'lessons.db'))),
    stop: async () => {
      database?.close();
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      });
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.rmSync(dictionariesDir, { recursive: true, force: true });
    },
  };
}

export interface Reply {
  status: number;
  body: any;
}

/** A signed-in user: call(method, url, body?) with the session cookie; connect() a /live socket. */
export interface Client {
  id: number;
  call: (method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<Reply>;
  /** Sends a raw body (not JSON-encoded). */
  raw: (method: string, url: string, body: string) => Promise<Reply>;
  /** Uploads bytes as the request body (POST). */
  upload: (url: string, bytes: Uint8Array, contentType?: string) => Promise<Reply>;
  /** A plain GET with the session cookie (headers and bytes of the response). */
  fetch: (url: string, headers?: Record<string, string>) => Promise<Response>;
  connect: () => Promise<RecordingSocket>;
  /** Closes the sockets opened by connect(). */
  close: () => void;
}

export type RecordingSocket = Socket & { events: { name: string; data: unknown }[] };

export async function signIn(server: TestServer, login: TestLogin): Promise<Client> {
  const { base } = server;
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ login, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${login}: ${res.status}`);
  const me = (await res.json()) as { id: number };
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const send = async (method: string, url: string, body: string | undefined, headers: Record<string, string> = {}) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body,
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : undefined };
  };
  const sockets: Socket[] = [];
  return {
    id: me.id,
    call: (method, url, body, headers) =>
      send(method, url, body === undefined ? undefined : JSON.stringify(body), headers),
    raw: (method, url, body) => send(method, url, body),
    upload: async (url, bytes, contentType = 'application/octet-stream') => {
      const r = await fetch(base + url, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: base, 'Content-Type': contentType },
        body: new Blob([new Uint8Array(bytes)]),
      });
      const text = await r.text();
      return { status: r.status, body: text ? JSON.parse(text) : undefined };
    },
    fetch: (url, headers = {}) => fetch(base + url, { headers: { Cookie: cookie, ...headers } }),
    connect: async () => {
      const s = io(`${base}/live`, {
        extraHeaders: { Cookie: cookie, Origin: base },
        transports: ['websocket'],
      }) as RecordingSocket;
      s.events = [];
      s.onAny((name: string, data: unknown) => s.events.push({ name, data }));
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.on('connect', () => resolve());
        s.on('connect_error', reject);
      });
      return s;
    },
    close: () => {
      for (const socket of sockets) socket.close();
    },
  };
}

/** Plain request without a session. */
export async function anonymous(
  server: TestServer,
  method: string,
  url: string,
  body?: string,
  origin = server.base,
): Promise<Reply> {
  const r = await fetch(server.base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
}

export const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/** The latest event of that name the socket received. */
export const lastEvent = <T = unknown>(s: RecordingSocket, name: string) =>
  s.events.filter((e) => e.name === name).at(-1)?.data as T | undefined;

/** Emits with an acknowledgement and resolves with its value. */
export const emitAck = <T = unknown>(s: Socket, name: string, data?: unknown) =>
  new Promise<T>((resolve) => (data === undefined ? s.emit(name, resolve) : s.emit(name, data, resolve)));

/** Waits until the condition holds (live events arrive asynchronously). */
export async function until(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await wait(20);
  }
}

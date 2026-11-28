/**
 * Cuadrilo Demo App, the main process: the platform runs on this computer, on a copy of the demo
 * database, and one window shows the teacher and a student side by side.
 *
 * - The server (build/server/server.cjs) runs as a utility process on a free port of 127.0.0.1 only (no
 *   firewall question), and serves the built client as well (CLIENT_DIR).
 * - The data is the user's own: <userData>/data, copied from build/seed on the first start, on "Reset demo",
 *   and on the first start of another version (seedStamp.ts).
 * - Each half of the window has its own session (partition), so its own cookies: two different users.
 *   Both are signed in by the app itself with the demo accounts (demoAccounts.ts).
 * - A toolbar on top (toolbar.html, through preload.ts): what to show, which student, reset.
 * - `--smoke-test` (CI, on the packaged app): starts on an empty profile of its own, checks that both halves
 *   are signed in and that sharp's native part loads, and quits with 0, or 1 on a failure.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  app,
  BaseWindow,
  dialog,
  ipcMain,
  shell,
  type UtilityProcess,
  utilityProcess,
  WebContentsView,
} from 'electron';

import { DEMO_PASSWORD, DEMO_STUDENTS, DEMO_TEACHER, type DemoStudent } from './demoAccounts';
import { SEED_STAMP_FILE, type SeedStamp } from './seedStamp';
import { CHANNELS, type Layout, type Prompt, type ToolbarState } from './toolbarApi';

const APP_NAME = 'Cuadrilo Demo App';
const TOOLBAR_HEIGHT = 44;
/** The toolbar's second line, for a question or a notice (state.prompt). */
const PROMPT_HEIGHT = 40;
/** Between the halves. */
const GAP = 2;

/** What `npm run build -w desktop` made: next to this file. */
const BUILD_DIR = __dirname;
const SEED_DIR = path.join(BUILD_DIR, 'seed');

app.setName(APP_NAME);

const SMOKE_TEST = process.argv.includes('--smoke-test');
const SMOKE_PREFIX = 'cuadrilo-demo-smoke-';
if (SMOKE_TEST) {
  // What earlier smoke tests left: Chromium writes a few files of the profile while it quits, after
  // endSmokeTest has deleted it.
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(SMOKE_PREFIX)) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch {
      // In use (a smoke test running now) or not ours to delete: left.
    }
  }
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), SMOKE_PREFIX)));
}

let server: UtilityProcess | undefined;
/** The server's address, e.g. http://127.0.0.1:54321 (a new port on every start). */
let base = '';
let window: BaseWindow | undefined;
let toolbar: WebContentsView | undefined;
let teacherView: WebContentsView | undefined;
let studentView: WebContentsView | undefined;
const state: ToolbarState = {
  layout: 'both',
  student: DEMO_STUDENTS[0],
  students: DEMO_STUDENTS,
  busy: true,
  prompt: null,
  version: '',
};

const dataDir = () => path.join(app.getPath('userData'), 'data');

/** A free TCP port of 127.0.0.1 (the system picks one; it is released right away for the server). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')),
      );
    });
  });
}

/** The stamp of the demo database in `dir`, if it has one. */
function readSeedStamp(dir: string): SeedStamp | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, SEED_STAMP_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * The demo database in the user's data folder: a fresh copy if there is none yet, if it comes from another
 * version of the app (its stamp is not the seed's), or always with `fresh`. Says whether the user's data of
 * another version was replaced.
 */
function prepareData(fresh = false): 'kept' | 'new' | 'replaced' {
  const dir = dataDir();
  const exists = fs.existsSync(path.join(dir, 'lessons.db'));
  const outdated = exists && readSeedStamp(dir)?.id !== readSeedStamp(SEED_DIR)?.id;
  if (exists && !outdated && !fresh) return 'kept';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(SEED_DIR, dir, { recursive: true });
  return outdated && !fresh ? 'replaced' : 'new';
}

/** Starts the server; resolves with its address once it listens. */
async function startServer(): Promise<string> {
  const port = await freePort();
  const child = utilityProcess.fork(path.join(BUILD_DIR, 'server/server.cjs'), [], {
    serviceName: 'Cuadrilo server',
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir(),
      DICTIONARIES_DIR: path.join(BUILD_DIR, 'dictionaries'),
      CLIENT_DIR: path.join(BUILD_DIR, 'client'),
      APP_LANG: 'en',
      PUBLIC_URL: `http://127.0.0.1:${port}`,
    },
  });
  server = child;
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      log += text;
      process.stdout.write(text);
      if (log.includes('listening')) resolve();
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => reject(new Error(`The server stopped (code ${code}).\n\n${log}`)));
  });
  return `http://127.0.0.1:${port}`;
}

/** Stops the server and waits for it (the database files must be closed before a reset deletes them). */
function stopServer(): Promise<void> {
  const child = server;
  server = undefined;
  if (!child?.pid) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

/**
 * Signs a half in as `login` and opens the app in it. The sign-in request goes through this half's own
 * session, so the session cookie lands there (and nothing is shown before the app).
 */
async function signIn(view: WebContentsView, login: string): Promise<void> {
  const response = await view.webContents.session.fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password: DEMO_PASSWORD }),
    credentials: 'include',
  });
  if (response.status !== 200) console.warn(`Signing in as ${login}: ${response.status}`);
  await view.webContents.loadURL(base);
}

/** A half of the window: the app's pages only; links to other sites open in the user's browser. */
function createAppView(partition: string): WebContentsView {
  const view = new WebContentsView({ webPreferences: { partition } });
  const isOwn = (url: string) => url.startsWith(`${base}/`) || url === base;
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwn(url)) return { action: 'allow' };
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (isOwn(url)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  return view;
}

function sendState(): void {
  toolbar?.webContents.send(CHANNELS.state, state);
}

function setBusy(busy: boolean): void {
  state.busy = busy;
  sendState();
}

/** Shows (or hides, with null) the toolbar's second line. */
function setPrompt(prompt: Prompt | null): void {
  state.prompt = prompt;
  layout();
  sendState();
}

/** Places the toolbar and the halves for the current layout. */
function layout(): void {
  if (!window || !toolbar || !teacherView || !studentView) return;
  const { width, height } = window.getContentBounds();
  const top = TOOLBAR_HEIGHT + (state.prompt ? PROMPT_HEIGHT : 0);
  toolbar.setBounds({ x: 0, y: 0, width, height: top });
  const area = { y: top, height: Math.max(0, height - top) };
  teacherView.setVisible(state.layout !== 'student');
  studentView.setVisible(state.layout !== 'teacher');
  if (state.layout === 'both') {
    const half = Math.floor((width - GAP) / 2);
    teacherView.setBounds({ x: 0, width: half, ...area });
    studentView.setBounds({ x: half + GAP, width: width - half - GAP, ...area });
  } else {
    (state.layout === 'teacher' ? teacherView : studentView).setBounds({ x: 0, width, ...area });
  }
}

async function createWindow(): Promise<void> {
  window = new BaseWindow({
    width: 1600,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#dee2e6',
  });
  toolbar = new WebContentsView({
    webPreferences: { preload: path.join(BUILD_DIR, 'preload.cjs'), sandbox: true, contextIsolation: true },
  });
  teacherView = createAppView('persist:teacher');
  studentView = createAppView('persist:student');
  for (const view of [toolbar, teacherView, studentView]) window.contentView.addChildView(view);
  layout();
  window.on('resize', layout);
  window.on('closed', () => {
    for (const view of [toolbar, teacherView, studentView]) view?.webContents.close();
    window = toolbar = teacherView = studentView = undefined;
  });
  await toolbar.webContents.loadFile(path.join(BUILD_DIR, 'toolbar.html'));
}

/** Signs both halves in (after a start or a reset: a new server, a new port). */
async function signInBoth(): Promise<void> {
  if (!teacherView || !studentView) return;
  await Promise.all([signIn(teacherView, DEMO_TEACHER), signIn(studentView, state.student)]);
}

async function switchStudent(student: DemoStudent): Promise<void> {
  if (state.busy || !studentView || student === state.student || !DEMO_STUDENTS.includes(student)) return;
  state.student = student;
  setBusy(true);
  try {
    await signIn(studentView, student);
  } finally {
    setBusy(false);
  }
}

/** Once confirmed in the toolbar (its own question: state.prompt 'reset'). */
async function resetDemo(): Promise<void> {
  if (state.busy || state.prompt !== 'reset') return;
  setPrompt(null);
  setBusy(true);
  try {
    await stopServer();
    prepareData(true);
    base = await startServer();
    await signInBoth();
  } catch (error) {
    dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

ipcMain.on(CHANNELS.ready, sendState);
ipcMain.on(CHANNELS.layout, (_event, value: Layout) => {
  if (value !== 'both' && value !== 'teacher' && value !== 'student') return;
  state.layout = value;
  layout();
  sendState();
});
ipcMain.on(CHANNELS.student, (_event, student: DemoStudent) => void switchStudent(student));
ipcMain.on(CHANNELS.prompt, (_event, prompt: Prompt | null) => {
  // The toolbar asks for its question, or closes what it shows; the notice of an update comes from here only.
  if (prompt === 'reset' && !state.busy) setPrompt('reset');
  else if (prompt === null) setPrompt(null);
});
ipcMain.on(CHANNELS.reset, () => void resetDemo());

/** `--smoke-test`: what a working package does. Throws on a failure. */
async function smokeTest(): Promise<void> {
  const logins = await Promise.all(
    [teacherView, studentView].map((view) =>
      view?.webContents.executeJavaScript(
        "fetch('/api/auth/me').then((response) => (response.ok ? response.json() : {})).then((user) => user.login)",
      ),
    ),
  );
  console.log(`Signed in: ${logins.join(', ')}`);
  if (logins[0] !== DEMO_TEACHER || logins[1] !== state.student) throw new Error('the halves are not signed in');
  // Loaded at run time from the app's node_modules (not bundled), as the server does.
  const sharp: typeof import('sharp') = require('sharp');
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#12b886' } })
    .webp()
    .toBuffer();
  console.log(`sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}: a WebP of ${image.length} bytes`);
}

/** Quits after the smoke test, without the profile it made. */
async function endSmokeTest(code: number): Promise<void> {
  try {
    await stopServer();
    // Best effort: on Windows Chromium still has files of the profile open until the app is gone, and an open
    // file cannot be deleted there; and it writes a few more while it quits (the next smoke test removes them).
    // A temporary folder: never a reason to fail the test.
    fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
  } catch (error) {
    console.warn(`Left the temporary profile: ${error instanceof Error ? error.message : String(error)}`);
  }
  app.exit(code);
}

app.whenReady().then(async () => {
  try {
    state.version = readSeedStamp(SEED_DIR)?.version ?? app.getVersion();
    const data = prepareData();
    base = await startServer();
    await createWindow();
    await signInBoth();
    setBusy(false);
    // Says so in the toolbar (not a native dialog: one closes by itself when a page takes the focus).
    if (data === 'replaced' && !SMOKE_TEST) setPrompt('updated');
    if (SMOKE_TEST) {
      await smokeTest();
      console.log('Smoke test passed');
      await endSmokeTest(0);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (SMOKE_TEST) {
      console.error(`Smoke test failed: ${message}`);
      await endSmokeTest(1);
      return;
    }
    dialog.showErrorBox(APP_NAME, message);
    app.quit();
  }
});
if (SMOKE_TEST) {
  setTimeout(() => {
    console.error('Smoke test failed: no answer in 2 minutes');
    server?.kill();
    app.exit(1);
  }, 120_000).unref();
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  server?.kill();
});

/**
 * Builds what the desktop app runs, into desktop/build:
 * - main.cjs, preload.cjs, toolbar.html: Electron's main process and the window's toolbar (src/);
 * - server/server.cjs: the platform's server in one file (sharp stays outside: it has native parts);
 * - client/: the client built in English, without this installation's branding;
 * - seed/: the demo database every new or reset demo starts from (scripts/seed.ts), with its stamp
 *   (src/seedStamp.ts);
 * - dictionaries/: empty (there is no dictionary for English yet: no translator).
 *
 * Run with `npm run build -w desktop`, then `npm start -w desktop`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

import { SEED_STAMP_FILE, type SeedStamp } from '../src/seedStamp';

const DESKTOP_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(DESKTOP_DIR, '..');
const OUT_DIR = path.join(DESKTOP_DIR, 'build');

/** Settings baked into the client: the demo's own, never the ones of this installation's .env (it is read too). */
const CLIENT_ENV = {
  APP_LANG: 'en',
  PLATFORM_NAME: '',
  FAVICON: '',
  CONTROLLER_NAME: '',
  CONTROLLER_CONTACT: '',
  HOST_NAME: '',
  HOSTING_COUNTRY: '',
  TRANSFER_NOTE: '',
};

/** A Node script of a package, run with this very Node (no npm, no shell: the same on Windows). */
function runNode(script: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  execFileSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('· main process and toolbar');
  for (const [entry, out] of [
    ['src/main.ts', 'main.cjs'],
    ['src/preload.ts', 'preload.cjs'],
  ]) {
    await build({
      entryPoints: [path.join(DESKTOP_DIR, entry)],
      outfile: path.join(OUT_DIR, out),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      external: ['electron', 'sharp'],
      logLevel: 'warning',
    });
  }
  fs.copyFileSync(path.join(DESKTOP_DIR, 'src/toolbar.html'), path.join(OUT_DIR, 'toolbar.html'));

  console.log('· server');
  await build({
    entryPoints: [path.join(ROOT_DIR, 'server/src/index.ts')],
    outfile: path.join(OUT_DIR, 'server/server.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    // Native binaries: loaded from node_modules at run time.
    external: ['sharp'],
    logLevel: 'warning',
  });

  console.log('· client');
  const clientDir = path.join(ROOT_DIR, 'client');
  // Not exported by the package: found from its package.json.
  const vitePackage = require.resolve('vite/package.json', { paths: [clientDir] });
  const vite = path.join(path.dirname(vitePackage), 'bin/vite.js');
  runNode(vite, ['build', '--outDir', path.join(OUT_DIR, 'client'), '--emptyOutDir'], {
    cwd: clientDir,
    env: CLIENT_ENV,
  });

  console.log('· demo database');
  const seedDir = path.join(OUT_DIR, 'seed');
  fs.mkdirSync(seedDir, { recursive: true });
  const tsx = require.resolve('tsx/cli', { paths: [DESKTOP_DIR] });
  runNode(tsx, ['scripts/seed.ts'], { cwd: DESKTOP_DIR, env: { DATA_DIR: seedDir } });
  const stamp: SeedStamp = {
    id: randomUUID(),
    version: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(seedDir, SEED_STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);

  fs.mkdirSync(path.join(OUT_DIR, 'dictionaries'), { recursive: true });
  console.log(`Built into ${path.relative(ROOT_DIR, OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

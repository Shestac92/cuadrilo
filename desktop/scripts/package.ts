/**
 * Packs what `npm run build -w desktop` made (desktop/build) into an installer for one system and processor,
 * into desktop/dist/release:
 *
 *   npm run package -w desktop -- mac arm64     Cuadrilo-Demo-App-mac-arm64.dmg
 *   npm run package -w desktop -- mac x64       Cuadrilo-Demo-App-mac-x64.dmg
 *   npm run package -w desktop -- win x64       ...-win-x64-setup.exe and ...-win-x64-portable.exe
 *
 * The names have no version: the landing page links to them as releases/latest/download/<name>.
 *
 * The app is staged in desktop/dist/app with a package.json of its own and sharp installed for the target
 * (its native part differs per system and processor), so a Mac can pack both of its processors; a Windows
 * package is packed on Windows. Nothing is signed with a certificate: the Mac app gets an ad-hoc signature
 * (without one an Apple-silicon Mac calls a downloaded app "damaged"), so macOS asks the user to allow it once;
 * Windows SmartScreen asks too.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Arch, build, type Configuration, Platform } from 'electron-builder';
import sharp from 'sharp';

const DESKTOP_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(DESKTOP_DIR, '..');
const BUILD_DIR = path.join(DESKTOP_DIR, 'build');
const DIST_DIR = path.join(DESKTOP_DIR, 'dist');
const APP_DIR = path.join(DIST_DIR, 'app');
const ICONS_DIR = path.join(DIST_DIR, 'icons');

const TARGETS = {
  mac: { platform: Platform.MAC, os: 'darwin', archs: ['arm64', 'x64'] },
  win: { platform: Platform.WINDOWS, os: 'win32', archs: ['x64'] },
} as const;
type Target = keyof typeof TARGETS;

const desktopPackage = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
const electronVersion: string = JSON.parse(
  fs.readFileSync(require.resolve('electron/package.json', { paths: [DESKTOP_DIR] }), 'utf8'),
).version;
const sharpVersion: string = desktopPackage.dependencies.sharp;
/** The platform's version (root package.json): the app is released with it, under the same tag v<version>. */
const version: string = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version;

function usage(): never {
  console.error(
    [
      'Usage, one package per call:',
      '  npm run package -w desktop -- mac arm64',
      '  npm run package -w desktop -- mac x64',
      '  npm run package -w desktop -- win x64     (on Windows)',
    ].join('\n'),
  );
  process.exit(1);
}

/** The app as it goes into the package: the build, its package.json, and sharp for the target. */
function stageApp(target: Target, arch: string): void {
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  fs.cpSync(BUILD_DIR, APP_DIR, { recursive: true });
  const appPackage = {
    name: 'cuadrilo-demo-app',
    productName: 'Cuadrilo Demo App',
    version,
    description: 'Cuadrilo, the platform for language lessons, with a demo class on your own computer',
    author: 'Cuadrilo',
    license: 'UNLICENSED',
    private: true,
    main: 'main.cjs',
    dependencies: { sharp: sharpVersion },
  };
  fs.writeFileSync(path.join(APP_DIR, 'package.json'), `${JSON.stringify(appPackage, null, 2)}\n`);
  // npm of this very run (npm_execpath), so no shell: the same on Windows. Only sharp's prebuilt parts for
  // the target are installed (--os, --cpu); its install script would only check them.
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('run it through npm: npm run package -w desktop -- …');
  execFileSync(
    process.execPath,
    [
      npm,
      'install',
      '--omit=dev',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      `--os=${TARGETS[target].os}`,
      `--cpu=${arch}`,
    ],
    { cwd: APP_DIR, stdio: 'inherit' },
  );
}

/**
 * The icons, drawn from the platform's favicon: on a Mac the square sits inside a margin like the system's own
 * icons (824 of 1024); on Windows it fills the icon.
 */
async function drawIcons(): Promise<void> {
  fs.rmSync(ICONS_DIR, { recursive: true, force: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const svg = fs.readFileSync(path.join(ROOT_DIR, 'client/public/favicon.svg'));
  const square = await sharp(svg, { density: 1200 }).resize(824, 824).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: square, gravity: 'center' }])
    .png()
    .toFile(path.join(ICONS_DIR, 'icon-mac.png'));
  await sharp(svg, { density: 600 }).resize(256, 256).png().toFile(path.join(ICONS_DIR, 'icon-win.png'));
}

function config(): Configuration {
  return {
    appId: 'app.cuadrilo.demo',
    productName: 'Cuadrilo Demo App',
    electronVersion,
    directories: { app: APP_DIR, output: path.join(DIST_DIR, 'release'), buildResources: ICONS_DIR },
    // Plain files, not an asar archive: the server reads and copies them (client, seed) with plain fs, and
    // sharp's native parts stay loadable.
    asar: false,
    // sharp is installed for the target already (stageApp); nothing to compile.
    npmRebuild: false,
    publish: null,
    mac: {
      category: 'public.app-category.education',
      icon: 'icon-mac.png',
      identity: '-',
      hardenedRuntime: false,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own placeholders
      artifactName: 'Cuadrilo-Demo-App-mac-${arch}.${ext}',
    },
    dmg: { title: 'Cuadrilo Demo App' },
    win: { icon: 'icon-win.png' },
    // For the user only, no administrator: in the user's profile, with a shortcut on the desktop.
    nsis: {
      oneClick: true,
      perMachine: false,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own placeholders
      artifactName: 'Cuadrilo-Demo-App-win-${arch}-setup.${ext}',
    },
    portable: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own placeholders
      artifactName: 'Cuadrilo-Demo-App-win-${arch}-portable.${ext}',
    },
  };
}

async function main() {
  const [target, arch] = process.argv.slice(2);
  if (!(target === 'mac' || target === 'win')) usage();
  if (!(TARGETS[target].archs as readonly string[]).includes(arch ?? '')) usage();
  if (target === 'win' && process.platform !== 'win32') throw new Error('a Windows package is packed on Windows');
  if (target === 'mac' && process.platform !== 'darwin') throw new Error('a Mac package is packed on a Mac');
  if (!fs.existsSync(path.join(BUILD_DIR, 'main.cjs'))) throw new Error('build it first: npm run build -w desktop');

  console.log(`· app for ${target} ${arch}`);
  stageApp(target, arch);
  console.log('· icons');
  await drawIcons();
  console.log('· package');
  const targets = TARGETS[target].platform.createTarget(
    target === 'mac' ? ['dmg'] : ['nsis', 'portable'],
    arch === 'arm64' ? Arch.arm64 : Arch.x64,
  );
  await build({ projectDir: DESKTOP_DIR, targets, config: config() });
  console.log(`Packed into ${path.relative(ROOT_DIR, path.join(DIST_DIR, 'release'))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

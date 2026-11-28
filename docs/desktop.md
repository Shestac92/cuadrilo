# Desktop demo app

**Cuadrilo Demo App** (`desktop/`, Electron) is the platform on the user's own computer, for a teacher to try it without a server: a demo database of its own (a sandbox nobody else touches) and one window with the teacher and a student side by side, so a live class can be played alone. Work in progress (branch `elctron-demo-app`): the stages are a working skeleton, the window's controls, the packages for macOS (arm64, x64) and Windows (x64), and the download page (done). The demo lessons come later; for now the seed has the test lesson.

## How it works

- **The server** is the platform's own, bundled into one file (`build/server/server.cjs`, esbuild; `sharp` stays in `node_modules` for its native parts). Electron runs it as a utility process on a free port of `127.0.0.1` only (`HOST`, so no firewall question) and it serves the built client too (`CLIENT_DIR`): there is no Caddy or Vite here.
- **The data** is in the user's profile, `<userData>/data` (macOS: `~/Library/Application Support/Cuadrilo Demo App/data`), not in the app: removing or reinstalling the app keeps it, and `npm start` uses the same profile as an installed app. It is copied from `build/seed` on the first start and on **Reset demo**.
- **Another version starts again.** The build stamps the seed (`demo-seed.json`, a new id on every build: `src/seedStamp.ts`) and the stamp is copied with it. At start-up, data whose stamp is not the seed's (another build, or none) is replaced by the seed, whatever the user did in it: the new version's demo lessons, and no database of an older version that may not fit. The toolbar then says so.
- **The demo database** (`desktop/scripts/seed.ts`, run by the build): the teacher `teacher`, the students `ana` and `ben` in the group "Demo class", and the demo lessons open to both. The accounts and their shared password are in `desktop/src/demoAccounts.ts`; nobody types them, the app signs in by itself.
- **The window** has a toolbar on top and two views, each with its own session (`partition`), so its own cookies: two different users. The main process signs each one in (a login request through the view's session, then the app's page).
- **The toolbar** (`src/toolbar.html`, talking to the main process through `src/preload.ts`; the toolbar only, the app's pages get no bridge):
  - **Both / Teacher / Student**: both halves side by side, or one on the whole width.
  - **Signed in as**: which student the right half is (signs it in again).
  - **Reset demo**: after a confirmation, stops the server, copies the seed over the data again, starts a new server and signs both halves in again.
  - **A second line** under it for the confirmation of a reset and for the notice of a new version. Not native dialogs: on macOS one closes by itself, with its first button, as soon as a page of the window takes the focus.
- **Links** to other sites open in the user's browser, not in the window.
- **The client** is built in English without this installation's branding (the build script overrides `.env`'s `PLATFORM_NAME`, `FAVICON` and the privacy values). There is no dictionary for English yet, so no translator.

## Build and run

```bash
npm run build -w desktop
```

```bash
npm start -w desktop
```

`build` writes `desktop/build/` (git-ignored): `main.cjs`, `preload.cjs`, `toolbar.html`, `server/`, `client/`, `seed/` (the demo database), `dictionaries/` (empty). Electron downloads its binary on the first `start`. Every build has a new seed stamp, so the first start after a build begins again from its seed.

## Packages

After `build`, one package per call (`scripts/package.ts`, electron-builder), into `desktop/dist/release/` (git-ignored):

```bash
npm run package -w desktop -- mac arm64
```

`mac arm64` and `mac x64` give `Cuadrilo-Demo-App-mac-<arch>.dmg` and are packed on a Mac (either processor); `win x64` gives `…-win-x64-setup.exe` (installs for the user only, no administrator) and `…-win-x64-portable.exe`, and is packed on Windows. The names have no version, so the landing page links to the newest ones as `https://github.com/Shestac92/cuadrilo/releases/latest/download/<name>`.

- The app is staged in `desktop/dist/app` with a `package.json` of its own and `sharp` installed for the target (`npm install --os --cpu`): its native part differs per system and processor.
- No asar archive: the files are plain, so the server reads and copies them with plain `fs` and sharp's native part loads.
- The icons are drawn from `client/public/favicon.svg` (with sharp): with a margin on a Mac, full on Windows.
- **No certificate.** The Mac app has an ad-hoc signature (without one, an Apple-silicon Mac calls a downloaded app "damaged"), so the first start needs System Settings → Privacy & Security → **Open Anyway**. On Windows, SmartScreen warns about an unknown app: **More info → Run anyway**.
- `--smoke-test` starts a package on an empty profile of its own, checks that both halves are signed in and that sharp works, and quits with 0 (or 1). For example: `"desktop/dist/release/mac-arm64/Cuadrilo Demo App.app/Contents/MacOS/Cuadrilo Demo App" --smoke-test`.

**Releases** (`.github/workflows/desktop.yml`) run only when a release tag `v<version>` is pushed, the platform's own (the version of the root `package.json`; the app has no version of its own). Each package is packed and smoke-tested on its own system: macOS Apple silicon (`macos-latest`), macOS Intel (`macos-15-intel`), Windows x64 (`windows-latest`). Then the four files are attached to the GitHub release of the tag, next to GitHub's own source archives: added to it if the release is there already (made by hand, with its own notes), or a new release with the install notes if not. The tag must match `package.json`, or nothing is packed.

A **trial** without a release: run the workflow by hand (Actions → Desktop app → Run workflow, once it is on `main`; or `gh workflow run desktop.yml --ref <branch>`). The packages are then only the run's artifacts (a zip per system on the run's page, kept 14 days, deletable there), never on a release or the landing page.

## Download page

The landing page (`site/`) puts the demo first: a **Try the demo** button in the header, and on the first screen a large download button for the visitor's own system (`site/app.js`: Windows, or a Mac: Intel when Chrome or Edge say so, otherwise Apple silicon; on a phone, a tablet or Linux it leads to the downloads). The section `#demo` has the three downloads, the portable version and how to open the app the first time. Every download link (`a[data-os]`) first opens the dialog `#first-run` with the steps of the first start on that system; the file comes only with **Got it, download**, and the steps stay open while it downloads. Without JavaScript the links download at once. The links are `releases/latest/download/<name>`: they work once a release has the packages.

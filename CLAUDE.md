# Cuadrilo

npm-workspaces monorepo: `shared` (lesson format, API contract, i18n), `server` (Express 5, `node:sqlite`), `client` (React 19, Mantine 9, Vite). Details are in README.md and `docs/` (one file per topic); keep them in step with code changes.

## Commands

- `npm run dev`: backend :8080 + client :5173. `npm run share`: build + preview :4173 (for a tunnel and MCP assistants).
- `npm test` (server + client), `npm run typecheck`, `npm run lint`. Format: `./node_modules/.bin/biome check --write <path>`.
- Settings live in `.env` (template `.env.example`); a variable set in the shell wins over the file.
- Run tools only through npm scripts or `node_modules/.bin`. Bare `npx` downloads packages: do not use it.

## Gotchas

- The server is CommonJS (NodeNext): no `import.meta`, no top-level `await`; use `__dirname` and `main().catch(...)`. The Vite config is ESM.
- Tests must run on a temporary `DATA_DIR` and never touch `data/`. A test that imports the database module imports `server/test/tempDataDir.ts` first.
- UI strings go into both `shared/src/i18n/es.ts` and `en.ts` with the same keys.
- A lesson-format change touches `shared/src/lessonSchema.ts`, `shared/src/lesson.ts`, the editor forms, the player, `server/src/mcp/lessonInput.ts` and `lessonFormat.ts`, and README. Prefer optional new fields; once the app is released, a change that breaks stored lessons needs a migration (next gotcha).
- `site/` is the static landing page (published by `.github/workflows/pages.yml`); its list of blocks repeats the README table, so a new block type goes into both. A new block type also needs: `shared/package.json` export, `toPlayableBlock`/`ANSWER_BLOCKS` in `lesson.ts`, `client/src/lesson/LessonView.tsx`, `BLOCK_TYPE_INFO` in `editor/ExerciseForms.tsx`, `newBlock`/`BlockForm` in `editor/BlockForms.tsx`, the description in `mcp/tools.ts`. Then add one exercise of it to the production demo lesson «DEMO: стенд виджетов» (lesson 31, via MCP `add_exercises`).
- Old browsers: the build targets Vite's default (Safari 16.4+, Chrome/Edge 111+, Firefox 114+; README "Supported browsers"). A browser below that fails to parse the bundle and shows a white page, so the notice in `client/index.html` is plain old JavaScript (no arrows, no `const`): it reads the user agent (engine, version, iOS version) and compares it with these minimums, never with load time (slow connections must not see it). Its texts come from `app.browserTooOld` / `app.noScript` in both i18n files. Raising the floor or adding a dependency with newer syntax (lookbehind regexes, as in `remark-gfm`) changes the README line, the minimums in that script and the versions named in `app.browserTooOld`.
- The translator (click on a word) skips elements inside `[data-no-translate]`: put it on anything that is not text to read (letter grids). Safari ignores `user-select` without `-webkit-user-select`.
- Database changes: the schema in `db.ts` is the baseline and `server/src/migrations/` is applied on top of it, also on new databases. Until the first release the baseline may change; after it, only a new migration `<YYYYMMDDHHMM>_<what>.ts` (id = file name, listed in `index.ts`, never changed, removed or squashed), run once at start-up in a transaction, recorded in `schema_migrations`. Lessons that change format are rewritten by a migration (`content_rev` goes up). Back up `data/` before running a new version on real data.
- A student's homework is the lesson page `/lessons/:id?homework=:id` (`homeworkContent` in `shared/src/lesson.ts`), not a separate page.
- Never expose `npm run dev` through a tunnel: it serves the repository files, including `data/lessons.db`.
- `.local/` is git-ignored: personal deployment files, private tools and `.local/dev-credentials.txt` (local test accounts; never print or repeat the passwords). Nothing from it, and no name of a person, school or other private project, goes into a tracked file or `.gitignore`.
- Never run anything on the user's real servers: the user does it themselves, and you write the commands.
- Third-party passwords are never typed by the agent: the user signs in themselves.

- The backend serves only the API; the client (`client/dist`) is served by Vite (`dev`, `share`) or by Caddy (servers), and each forwards the same list of backend paths (`proxyRoutes` in `client/vite.config.ts`, `@backend` in `deploy/Caddyfile`): a new backend path goes into both.
- On a server everything is in one folder, `/opt/cuadrilo`: the code, `.env` and the data (`data/`, `DATA_DIR`). One platform per server, one process per data folder. `deploy/INSTALL.md` is the step-by-step guide (install, backup and restore, update); `deploy/Caddyfile` and `deploy/cuadrilo.service` must stay in step with it and with each other (paths, port 8080 = `PORT`).
- The branding settings (`APP_LANG`, `PLATFORM_NAME`, `FAVICON`, the privacy-policy values) are baked into the client when it is built: a change needs `npm run build -w client` and a restart. A client-side setting goes into `.env.example`, the README table and the install guide.

## Built-in browser

- After scrolling, clicks by coordinates or ref can land on the wrong element: click through the DOM (`element.click()` in the JavaScript tool) and check what a dialog is about before confirming.
- Screenshots can come back blank while an `<audio>` element is in view: measure with `getBoundingClientRect` instead.
- Do not stop servers with `pkill -f`: it also kills the user's dev server. Stop only what you started (`preview_stop`).
- Temporary teacher UI without touching `data/`: `export DATA_DIR=$(mktemp -d) DICTIONARIES_DIR=$DATA_DIR/dict` (export, not a prefix of one command), `tsx test/seed.ts` in `server/`, then `PORT=8090 tsx src/index.ts` in `server/` and `PORT=8090 vite --port 5199` in `client/`; log in as `teacher` with `TEST_PASSWORD` from `server/test/users.ts`. Stop only these (`kill $(lsof -tiTCP:8090 -sTCP:LISTEN)`).
- Screenshots are scaled (viewport 1024 wide → 800): click and drag coordinates are in the screenshot's frame, not `getBoundingClientRect`'s. A screenshot taken right after typing can show the old state: check the DOM.

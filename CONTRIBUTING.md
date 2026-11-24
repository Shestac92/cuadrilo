# Contributing to Cuadrilo

Cuadrilo is a small project run by one person: a focused contribution is the easiest to review. Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing you agree that your work is released under the [MIT License](LICENSE).

## Before you start

- Search the [issues](../../issues): your problem may be there.
- For anything bigger than a small fix, **open an issue first**. Describe the problem, not only the solution.
- Read [what Cuadrilo is not](docs/why.md#where-it-is-going): no marketplace, no public catalogue, no large LMS.
- Security problems are not issues: see [SECURITY.md](SECURITY.md).

## Bugs and ideas

Use the issue forms. A good bug report has the steps, what you expected, what happened, the version, how you run it, and the browser console or server log (`journalctl -u cuadrilo -n 50 --no-pager`). **Do not post** a database, `.env`, passwords or students' data. For a feature, describe the situation of the teacher or student; that matters more than the solution.

## Setting up

Node.js 22.13+ and npm.

```bash
git clone https://github.com/Shestac92/cuadrilo.git
cd cuadrilo
npm install
npm run dev                                  # backend :8080, client :5173
npm run create-teacher -w server -- teacher
```

Monorepo: `shared` (lesson format, API contract, texts), `server` (Express 5, `node:sqlite`), `client` (React 19, Mantine, Vite). Map: [Architecture](docs/architecture.md).

## Making a change

1. Fork, branch from `main`.
2. One thing per pull request; a tidy-up goes in its own.
3. Add or update tests (`server/test/`, `client/test/`).
4. `npm run lint`, `npm run typecheck` and `npm test` must pass (`npm run format` fixes style).
5. Update the docs the change touches, and `.env.example` for a new setting.
6. Open the pull request and fill in the template.

Commit messages: a short imperative sentence (`Fix punctuation in the order block`).

## Where changes go wrong

- Tests never touch `data/`: a test that imports the database imports `server/test/tempDataDir.ts` first.
- Interface texts go into both `shared/src/i18n/es.ts` and `en.ts` with the same keys.
- A lesson-format change touches `shared/src/lessonSchema.ts`, `lesson.ts`, the editor forms, the player, `server/src/mcp/lessonInput.ts` and `lessonFormat.ts`, and the docs. Prefer optional fields; breaking stored lessons needs a migration.
- A new block type also needs the `shared/package.json` export, `toPlayableBlock` and `ANSWER_BLOCKS` in `lesson.ts`, `LessonView.tsx`, `BLOCK_TYPE_INFO` in `editor/ExerciseForms.tsx`, `newBlock` and `BlockForm` in `editor/BlockForms.tsx`, and `mcp/tools.ts`.
- Database changes are migrations, never edits of the schema: [Migrations](docs/development.md#database-migrations). A released migration is never changed.
- A new backend path goes into `proxyRoutes` in `client/vite.config.ts` and `@backend` in `deploy/Caddyfile`.
- Anything that is not text to read (letter grids) gets `data-no-translate`.
- Run tools through npm scripts or `node_modules/.bin`, not bare `npx`.
- Dependencies are pinned to exact versions; a new one needs a reason.

Code style: [Development](docs/development.md#code-style).

## Languages and dictionaries

A new interface language: a file in `shared/src/i18n/` with every key of `es.ts`, a privacy policy `docs/privacy.<code>.md`, and an entry where languages are listed. Open an issue first. A dictionary is `dictionaries/<words>-<translations>.db`, derived from Wiktionary under **CC BY-SA 4.0** ([details](dictionaries/README.md)).

## AI assistants

You may use them. You are responsible for the result: read it, run it, make sure the tests pass.

## After the pull request

Reviews happen in the maintainer's free time, so a reply can take a while. A pull request abandoned by its author for a long time may be closed; it can be reopened.

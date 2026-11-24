# Development

## Sharing a local copy (ngrok)

The teacher's version of this: [Give students access from your computer](share-from-your-computer.md).

In `.env`:

```bash
SHARE_HOSTS=your-name.ngrok-free.app
PUBLIC_URL=https://your-name.ngrok-free.app
```

```bash
npm run share
ngrok http --url=your-name.ngrok-free.app 4173
```

`npm run share` builds the client, starts the backend on 8080 and `vite preview` on 4173, which serves only `client/dist` and proxies `/api` and `/socket.io`. `PUBLIC_URL` is needed for [AI assistants](ai-assistants.md). Several domains in `SHARE_HOSTS` are comma-separated. Restart after client changes: the preview has no hot reload.

**Never open `npm run dev` through a tunnel:** it serves the repository's files, including `data/lessons.db`.

## Code style

[Biome](https://biomejs.dev) 2.5.15, one `biome.json` for all packages.

- `npm run lint` checks formatting, import order and the linter; `npm run format` also fixes.
- 2-space indent, width 120, single quotes (double in JSX), semicolons, trailing commas.
- Linter: the `recommended` set. In `**/test/**`, `!` and `any` are allowed.
- Exceptions only as `// biome-ignore <rule>: <why>` in place.
- `strict: true` in every `tsconfig`; `npm run typecheck` checks types.

## Tests

```bash
npm test
```

`node:test` through `tsx`, a few seconds in all.

- **Integration** (`server/test/api/`): one file per part of the API. Each starts a real server as a child process on a temporary `DATA_DIR`, seeded by `server/test/seed.ts` (a teacher, three students, the lesson «Los artículos», a small dictionary). Tests never touch `data/`.
- **Unit** (`server/test/unit/`): lesson format, contract schemas, downloads. A test that imports the database module imports `server/test/tempDataDir.ts` first.
- **Client** (`client/test/`): the answer-sending queue.
- Separately: `npm run test:unit -w server`, `npm run test:api -w server`, `npm test -w client`.

## The landing page

`site/` is static (HTML, CSS, a little JS, no build), published to GitHub Pages by `.github/workflows/pages.yml` when `site/` changes on `main`. Set **Pages → Source** to *GitHub Actions* once. Locally: `python3 -m http.server 4188 --directory site`. The block list repeats the README table: change both when a block is added. The pictures and the demo clip are in `site/images/` (the clip is `demo.mp4`, about 1 MB: the teacher's and the student's windows stacked, cropped and cut from screen recordings with ffmpeg; keep it small, it loads with the page). `og:image` is a TODO comment in `index.html`.

## Dependencies

The workflow `.github/workflows/audit.yml` runs `npm audit --audit-level=high` when a `package.json` or the lock file changes and every Monday; its badge is in the README. Updates are made by hand: look at `npm outdated` now and then, and before merging a change run `npm test`, `npm run typecheck` and `npm run build -w client` (CI does it); read the changelog of a major update.

## Releasing

A release is a git tag; the install guide downloads its archive, so a tag must install and run.

1. `main` is green in CI.
2. Pick the version ([SemVer](https://semver.org/)): a fix is a patch; a new block or setting that changes nothing for existing installations is a minor; a change needing steps from the owner (a new required setting, a manual migration) is a major.
3. In [CHANGELOG.md](../CHANGELOG.md) turn `Unreleased` into the version and date; note what the owner must do when updating.
4. Set the same `version` in the four `package.json` files and run `npm install`.
5. Commit, then:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```

6. Create a GitHub **Release** from the tag with the changelog entry. Attach no build: the client is built on the server (name, language and privacy values are baked in).

## Database migrations

The schema in `server/src/db.ts` is the **baseline**; `server/src/migrations/` holds the changes after it, applied in id order **also on a new database**.

- Until the first release `db.ts` may change. After it, schema changes go only into a new migration.
- A migration is `<YYYYMMDDHHMM>_<what>.ts` exporting a function that gets the database (raw SQL, or read, change and write the JSON documents), plus an entry in `index.ts`. The id is the file name without `.ts`.
- Never change, remove or squash a released migration.
- At start-up pending migrations run once each, in one transaction, and are recorded in `schema_migrations`. A database with a migration this version does not know makes the app refuse to start.
- Back up `data/` before running a new version on real data.

## Tools for AI agents (Claude Code)

- `.mcp.json`: the Mantine documentation MCP server (`@mantine/mcp-server`, pinned).
- `.claude/skills/`: Mantine skills from [mantinedev/skills](https://github.com/mantinedev/skills) (commit `607846d`, MIT). Update by hand.

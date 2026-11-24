# Architecture

Install on a VPS (Caddy, systemd, backup, update): [`deploy/INSTALL.md`](../deploy/INSTALL.md).

## Running

```bash
npm ci
npm run build -w client
npm start -w server
```

Production must run behind HTTPS: the session cookie is `Secure` when `NODE_ENV=production`. The data is not in git: `data/lessons.db` (lessons, users, access, answers, homework, classes, boards, vocabularies) and `data/media/` (images and audio). Back up the whole `data/` folder. The dictionaries in `dictionaries/` (about 20 MB each) are in git.

### Who serves what

The backend (Express) answers only `/api/*`, `/media/*`, `/mcp`, `/oauth/{authorize,token,register,revoke}`, `/.well-known/*` and `/socket.io`. Something in front of it serves the built client (`client/dist`, `index.html` for every app route) and forwards those paths, keeping `Host`:

| How it runs | Serves the client | List of forwarded paths |
|---|---|---|
| `npm run dev` | Vite (:5173) | `client/vite.config.ts` (`proxyRoutes`) |
| `npm run share` | `vite preview` (:4173) | the same |
| a server | **Caddy** | `deploy/Caddyfile` (`@backend path …`) |

The list is written twice: a new backend path goes into both.

## Structure

```
├─ shared/src/        # @cuadrilo/shared (TS sources, no build)
│  ├─ api.ts          # request schemas (zod), response types, error codes
│  ├─ lesson.ts, lessonSchema.ts   # lesson types, helpers, validation
│  ├─ highlights.ts   # essay highlights
│  └─ i18n/           # es.ts (the reference), en.ts
├─ server/src/
│  ├─ index.ts        # Express: middleware, routes
│  ├─ auth.ts, students.ts, groups.ts, settings.ts
│  ├─ lessons.ts, lessonDocument.ts, content.ts    # lessons; saving (shared with MCP)
│  ├─ answers.ts, homework.ts, comments.ts
│  ├─ classes.ts, live.ts, realtime.ts, board/     # classes, the /live socket, the board
│  ├─ dictionary.ts, dictionaryDb.ts               # translator, vocabulary
│  ├─ media.ts, mediaStore.ts, mediaLibrary.ts, imageCompress.ts
│  ├─ mcp/, oauth/    # the MCP server, OAuth 2.1
│  ├─ publicFetch.ts  # downloads from external links, no internal network
│  ├─ security.ts, http.ts, views.ts, db.ts, migrations/, paths.ts
│  └─ scripts/create-teacher.ts
├─ server/test/       # api/ (integration), unit/, fixtures/, seed.ts
├─ client/src/
│  ├─ pages/          # one file per page
│  ├─ exercises/, lesson/, editor/, board/, components/, themes/
│  ├─ api.ts, auth.tsx, liveConnection.tsx, App.tsx, main.tsx
├─ dictionaries/      # offline dictionaries, one file per pair of languages
├─ deploy/            # INSTALL.md, Caddyfile, cuadrilo.service
└─ site/              # the landing page
```

## Versions

- React 19.3, Vite 8.3, Mantine 9.7, Express 5.3, TypeScript 5.9, react-router 7.
- The interface uses Mantine (`MantineProvider` in `client/src/main.tsx`, PostCSS preset in `client/postcss.config.cjs`). Own styles: `client/src/styles.css` and `client/src/exercises/exercises.css`; colours come from Mantine theme variables.
- Dependencies are pinned to exact versions (`.npmrc` has `save-exact=true`); `overrides` pins `@types/express`. `package-lock.json` is committed and servers install with `npm ci`.

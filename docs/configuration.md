# Configuration

## Settings (.env)

Settings live in `.env` in the repository root (not committed). Template: `.env.example`.

```bash
cp .env.example .env
```

| Variable | What it does | Default |
|---|---|---|
| `PORT` | backend port | `8080` |
| `APP_LANG` | interface language, `es` or `en` (fixed when the client is built) | `es` |
| `PUBLIC_URL` | the address assistants reach the server at, no trailing `/`; OAuth and the MCP address are built from it | `http://localhost:<PORT>` |
| `PLATFORM_NAME` | the platform's name: title, header, login, notices, assistants, privacy policy | `Cuadrilo` |
| `FAVICON` | path of a `.ico`, `.svg` or `.png` for the tab icon (relative to the repository root), copied in at client build; a missing file stops the build | the platform's icon |
| `CONTROLLER_NAME`, `CONTROLLER_CONTACT`, `HOST_NAME`, `HOSTING_COUNTRY`, `TRANSFER_NOTE` | fill the privacy policy (`docs/privacy.<code>.md`, shown at `/privacy`, also signed out; one file per language, `?lang=ru`). Read at client build, which warns about missing ones | none |
| `SHARE_HOSTS` | domains `npm run share` answers to, comma-separated | only `localhost` |
| `TRANSLATION_LANG` | the students' language; picks `dictionaries/<APP_LANG>-<TRANSLATION_LANG>.db`; not set means no translator | not set |
| `DATA_DIR` | where `lessons.db` and `media/` live | `./data` |

Backend and Vite config both read the file; a variable set in the shell wins (`PORT=9000 npm run dev`). Restart after editing. The client-side values (`APP_LANG`, `PLATFORM_NAME`, `FAVICON`, privacy values) need a rebuild: `npm run build -w client`. Tests do not read `.env`.

## Interface language

One language per installation. Two languages are two separate instances (own code folder, `data/`, port). Lesson content does not depend on it.

- **Client:** the language is fixed at build time (only its dictionary goes into the bundle).
- **Server:** reads `APP_LANG` at start and returns error messages in it; error `code`s are always English. `GET /api/config` → `{lang, dictionary, theme}` (no sign-in); the client warns in the console if its language differs.
- **Texts:** `shared/src/i18n/es.ts` is the reference, `en.ts` has exactly the same keys (a missing one is a type error and a failing test). Use `t('login.submit')`, `{name}` substitutions and plurals `{ one, other }` by `count`. Request schemas hold `errors.*` keys and the server translates them.
- **Translator:** needs `TRANSLATION_LANG` and the file of the pair. Without either, `/api/config` says `dictionary: false` and the rest works.

## Themes

The look (colours, radii, fonts) is one **theme** for everyone, chosen by any teacher; students choose only light or dark. It is the `theme` setting in the table `app_settings` (`server/src/settings.ts`), sent by `GET /api/config`; teachers use `GET`/`PATCH /api/settings`. An unknown stored id reads as the default.

- **Ids:** `shared/src/themes.ts` (`THEME_IDS`, `DEFAULT_THEME`); definitions: `client/src/themes/` (a Mantine theme plus CSS variables if needed). A new theme is an id, a file and a line in its `index.ts`.
- **Client:** `PlatformThemeProvider` uses the theme from `/api/config`, and until it arrives the one this browser saw last (localStorage `platform-theme`). "Apariencia" in the user menu sets the theme (teachers) and the user's own mode (light, dark, system). A theme with `lightOnly: true` (`blush`) has no dark variant.
- **Fonts:** system stacks only (`client/src/themes/fonts.ts`): nothing is downloaded.
- **Colours:** screens use the theme's primary colour (`var(--mantine-primary-color-*)`, never `teal`). Colours with a meaning (red for errors, green for "accepted", text colours) stay fixed.

# AI assistants

A teacher connects Claude, ChatGPT or another assistant to their lessons. The assistant works through the platform's MCP server (`/mcp`), signed in as the teacher. Code: `server/src/mcp/`, `server/src/oauth/`.

## How to connect

1. The server must be reachable over https. On a server installed by the [guide](../deploy/INSTALL.md) it is. Locally, set `PUBLIC_URL` in `.env` to a tunnel address, run `npm run share` and point the tunnel at port **4173** (never at the dev server: it serves `data/lessons.db`).
2. Sign in as the teacher and open "Asistentes IA" (`/assistants`): it shows `https://<your-address>/mcp`, the connected assistants and "Desconectar".
3. Claude: Settings → Connectors → Add custom connector. ChatGPT: Connectors → your own MCP server. Paste the address.
4. On the first connection the consent page `/oauth/consent` opens: sign in as the teacher and confirm.
5. After a server restart or an address change, reconnect the connector.

Without `PUBLIC_URL` the address is `http://localhost:<PORT>`, which assistants cannot reach.

## OAuth

OAuth 2.1 per the MCP 2026-07-28 specification; the server is both authorization server and protected resource.

- **Metadata:** `/.well-known/oauth-protected-resource/mcp` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414).
- **Endpoints:** `/oauth/authorize`, `/token`, `/register`, `/revoke` are `@modelcontextprotocol/sdk` handlers (validation, PKCE S256, rate limiting); decisions and storage are in `oauth/provider.ts`.
- **Clients:** CIMD (the `client_id` is an https URL of the client's description, for example ChatGPT's `https://chatgpt.com/oauth/client.json`, fetched through `publicFetch.ts`: no redirects, 5 s, 16 KB, cached an hour) or DCR (an unused registration is deleted after a day).
- **Consent:** `/oauth/authorize` sends the browser to `/oauth/consent`. The teacher signs in and sees "«ChatGPT» quiere acceder a tus lecciones… · Permitir / Cancelar"; a student can only decline.
- **Tokens:** random, only their SHA-256 is stored. Access 1 hour, refresh 30 days, both replaced on refresh. A token is valid only for `<PUBLIC_URL>/mcp` and the `lessons` scope (lessons and media; students, answers and homework are unreachable). Changing a password or deleting a user disconnects their assistants.
- `PUBLIC_URL` builds the issuer and the resource address. In dev, Vite proxies `/.well-known`, the `/oauth/*` endpoints and `/mcp`; `/oauth/consent` is a client page.
- `/oauth/*` and `/mcp` are mounted before the origin check: assistants call them with a Bearer token and no cookie.

## The MCP server

Streamable HTTP without sessions (`POST /mcp`, JSON answers, a new `McpServer` per request). The tools have strict schemas: the model assembles the JSON of a whole exercise or lesson.

- **Reading:** `lesson_format`, `list_lessons`, `get_lesson`, `list_media`.
- **Media:** `upload_media_from_url` downloads an image or audio from a public https link (`publicFetch.ts`: up to 3 redirects, 60 s, 30 MB) into the library, by the rules of an upload on "Archivos"; the same file is not added twice. If `create_lesson` gets a link instead of a file name, the error points to this tool.
- **Writing:** `create_lesson`, `add_exercises`, `update_exercise` (replaces the exercise; a block `id` from `get_lesson` keeps the students' answers), `delete_exercise`, `add_chapter`, `rename_chapter`, `delete_chapter`, `rename_lesson`. Whole lessons cannot be deleted by an assistant.
- **What guides the assistant** is in the server, the same for every client: the `instructions` (look first, ask before changing what students see), the `lesson_format` tool (`mcp/lessonFormat.ts`: every block with an example, how to work, which block to choose, what it cannot do) and the prompts `lesson_from_document`, `lesson_from_topic`, `add_exercises_to_lesson`, `review_lesson`. A new block type goes into `lesson_format`; tool descriptions point there.
- The assistant does not invent ids, names media by their library name (or `/media/…`) and gives video as a YouTube link. Errors name the place ("chapter 1 › exercise 2 › block 1 (image): …"); on any error nothing is saved.
- Saving takes the editor's path (`lessonDocument.ts`): the revision grows and students get `lessonUpdated`. On a revision race the tool rereads and repeats once. A new lesson has no student access.

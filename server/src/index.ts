import type { AppConfig } from '@cuadrilo/shared/api';
import express, { type NextFunction, type Request, type Response } from 'express';

import { answersRouter } from './answers';
import { authRouter, requireUser, sessionMiddleware } from './auth';
import { boardsRouter } from './board/router';
import { classesRouter } from './classes';
import { commentsRouter } from './comments';
import { dictionaryAvailable, dictionaryRouter, vocabularyRouter } from './dictionary';
import { groupsRouter } from './groups';
import { homeworkRouter } from './homework';
import { sendError, wrap } from './http';
import { LANG, t } from './i18n';
import { lessonsRouter } from './lessons';
import { handleMcpRequest } from './mcp/server';
import { mediaLibraryRouter, mediaRouter } from './media';
import { registerStoredFiles } from './mediaLibrary';
import { assistantAccessRouter, oauthRouter, requireAssistantToken } from './oauth/router';
import { attachRealtime } from './realtime';
import { sameOriginOnly, securityHeaders } from './security';
import { getSettings, settingsRouter } from './settings';
import { studentsRouter } from './students';

const PORT = Number(process.env.PORT ?? 8080);

function main(): void {
  // Files stored before the media library existed get a record (and a name).
  registerStoredFiles();

  const app = express();
  // req.ip from X-Forwarded-For of a local reverse proxy (Vite in dev, nginx in prod).
  app.set('trust proxy', 'loopback');

  app.use(securityHeaders);

  // ----- AI assistants: OAuth and the MCP server (server/src/oauth) -----
  // Called by the assistants' servers with a bearer token, never with the
  // session cookie: before the same-origin check and the JSON parser.
  app.use(oauthRouter());
  // The MCP server: POST only (no sessions, so no server-sent stream to GET).
  app.post('/mcp', requireAssistantToken, express.json({ limit: '4mb' }), wrap(handleMcpRequest));
  app.all('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').end();
  });

  // State-changing requests from other sites are rejected outright (security.ts).
  app.use(sameOriginOnly);
  app.use(express.json({ limit: '2mb' })); // lesson documents
  // Sets req.user from the session cookie.
  app.use(sessionMiddleware);

  // Answers, states and lists are the user's own and change all the time: no browser (Safari caches
  // a GET without cache headers) may show an old copy after a reload.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ----- public: no sign-in needed -----

  app.use('/api/auth', authRouter());
  // The language the client checks its build against, the platform's settings (the theme: the login page has it too).
  app.get('/api/config', (_req, res) => {
    const config: AppConfig = { lang: LANG, dictionary: dictionaryAvailable(), ...getSettings() };
    res.json(config);
  });

  // ----- signed in only; roles are checked by the routers -----

  // Lesson images and audio (signed in only; checked by the router).
  app.use('/media', mediaRouter());

  app.use('/api', requireUser);
  app.use('/api/lessons', answersRouter());
  app.use('/api/lessons', commentsRouter());
  app.use('/api/lessons', lessonsRouter());
  app.use('/api/students', studentsRouter());
  app.use('/api/groups', groupsRouter());
  app.use('/api/homework', homeworkRouter());
  app.use('/api/classes', classesRouter());
  app.use('/api/boards', boardsRouter());
  app.use('/api/dictionary', dictionaryRouter());
  app.use('/api/vocabulary', vocabularyRouter());
  app.use('/api/media', mediaLibraryRouter());
  app.use('/api/oauth', assistantAccessRouter());
  app.use('/api/settings', settingsRouter());

  app.use('/api', (_req, res) => sendError(res, 'not_found', t('errors.notFound')));

  // Errors thrown by handlers and by express.json() (body too large or not JSON).
  // Internal details are logged, not sent.
  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    // The client left in the middle of its request (a closed tab): nobody to answer.
    if (err.type === 'request.aborted' || res.headersSent) return;
    if (err.type === 'entity.too.large') return sendError(res, 'too_large', t('errors.tooLarge'));
    if (err.type === 'entity.parse.failed') return sendError(res, 'invalid_input', t('errors.invalidJson'));
    console.error(err);
    sendError(res, 'internal', t('errors.internal'));
  });

  // Express 5 gives a failed listen (a busy port) to the callback instead of throwing: without a check the
  // process would say "listening" and then quietly exit.
  const server = app.listen(PORT, (error?: Error & { code?: string }) => {
    if (error) {
      console.error(
        error.code === 'EADDRINUSE'
          ? `Port ${PORT} is busy: another server (npm run dev?) is running. Stop it or set another PORT.`
          : error,
      );
      process.exit(1);
    }
    console.log(`API server listening on http://localhost:${PORT}`);
  });
  // Live events for teachers (socket.io on the same port, path /socket.io).
  attachRealtime(server);
}

main();

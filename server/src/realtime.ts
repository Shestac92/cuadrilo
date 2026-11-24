import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { attachLive } from './live';
import { isSameOrigin } from './security';

/**
 * socket.io on the same port as the API (path /socket.io). Sessions come from
 * the same cookie as HTTP requests; each namespace checks it itself.
 */
export function attachRealtime(server: HttpServer): void {
  const io = new Server(server, {
    serveClient: false,
    // Same-origin only: protects the cookie-authenticated handshake from
    // other sites (cross-site WebSocket hijacking).
    allowRequest: (req, callback) => callback(null, isSameOrigin(req.headers)),
  });

  // Nothing is served on the default namespace.
  io.use((_socket, next) => next(new Error('not found')));

  // Live classes (presence, positions, answers, "show to student", "call")
  // and homework notifications: namespace /live.
  attachLive(io);
}

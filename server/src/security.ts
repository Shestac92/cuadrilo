import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { sendError } from './http';
import { t } from './i18n';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Helmet defaults, except:
 * - Referrer-Policy: helmet's "no-referrer" makes YouTube embeds fail with
 *   Error 153 (YouTube requires a Referer).
 * - Content-Security-Policy: this server only serves API responses; the app
 *   page is served by Vite / a static server, which is where a full CSP
 *   belongs. Only directives that cannot break anything are set here.
 * - Cross-Origin-Embedder-Policy is off by default in helmet 8 and must stay
 *   off: it would block the YouTube iframe.
 */
export const securityHeaders = helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      // No default-src: the full CSP belongs to the app page (see above).
      'default-src': helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'self'"],
    },
  },
});

/** Whether the request comes from our own origin (best effort, from browser headers). */
export function isSameOrigin(headers: Request['headers']): boolean {
  // Sent by all current browsers (Safari since 16.4).
  const site = headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return false;
  const origin = headers.origin;
  if (origin && origin !== 'null') {
    try {
      // Requires the proxy to keep the Host header (vite.config.ts, nginx).
      return new URL(origin).host === headers.host;
    } catch {
      return false;
    }
  }
  // No Origin: not a browser cross-site request (browsers send Origin on POST
  // and on WebSocket handshakes).
  return origin !== 'null';
}

/** Rejects state-changing requests from other sites (login and logout included). */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req.headers)) {
    sendError(res, 'forbidden', t('errors.requestRejected'));
    return;
  }
  next();
}

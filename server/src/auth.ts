import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { loginInput } from '@cuadrilo/shared/api';
import { type NextFunction, type Request, type Response, Router } from 'express';

import * as db from './db';
import { parseBody, sendError } from './http';
import { t } from './i18n';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// ----- passwords -----

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

/** Format: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, N, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

/** Verified against when the login does not exist, so timing does not reveal valid logins. */
const dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));

// ----- sessions -----

const COOKIE_NAME = 'app_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Secure cookies need HTTPS; production must run behind HTTPS.
const SECURE_COOKIE = process.env.NODE_ENV === 'production';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function sessionTokenFromCookies(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Starts a session; returns the session token. */
function startSession(res: Response, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.createSession(sha256(token), userId, expiresAt);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    path: '/',
    expires: new Date(expiresAt),
  });
  return token;
}

// ----- request user -----

/** The signed-in user on req. */
export interface AppUser {
  /** users.id as a string. */
  id: string;
  dbId: number;
  /** The login: we store no names or other personal data. */
  name: string;
  role: db.Role;
}

export type AuthedRequest = Request & { user: AppUser };

function toAppUser(user: db.User): AppUser {
  return {
    id: String(user.id),
    dbId: user.id,
    role: user.role,
    name: user.login,
  };
}

/** The signed-in user for a Cookie header (also used for socket.io handshakes). */
export function userFromCookies(cookieHeader: string | undefined): AppUser | undefined {
  const token = sessionTokenFromCookies(cookieHeader);
  if (!token) return undefined;
  const user = db.getSessionUser(sha256(token), Date.now());
  return user ? toAppUser(user) : undefined;
}

/** Sets req.user from the session cookie (if any). */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const user = userFromCookies(req.headers.cookie);
  if (user) (req as AuthedRequest).user = user;
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!(req as Partial<AuthedRequest>).user) {
    sendError(res, 'unauthorized', t('errors.signInRequired'));
    return;
  }
  next();
}

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Partial<AuthedRequest>).user;
  if (!user) {
    sendError(res, 'unauthorized', t('errors.signInRequired'));
    return;
  }
  if (user.role !== 'student') {
    sendError(res, 'forbidden', t('errors.studentOnly'));
    return;
  }
  next();
}

export function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Partial<AuthedRequest>).user;
  if (!user) {
    sendError(res, 'unauthorized', t('errors.signInRequired'));
    return;
  }
  if (user.role !== 'teacher') {
    sendError(res, 'forbidden', t('errors.teacherOnly'));
    return;
  }
  next();
}

// ----- login rate limit (in memory, per IP + login) -----
// Per IP + login, so one student mistyping does not lock out a whole class
// behind the same school NAT.

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function isRateLimited(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.since > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.since > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, since: Date.now() });
  } else {
    entry.count++;
  }
}

// ----- routes -----

export function authRouter(): Router {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const input = parseBody(loginInput, req, res);
      if (!input) return;
      const { login, password } = input;
      const limitKey = `${req.ip ?? 'unknown'}|${login.toLowerCase()}`;
      if (isRateLimited(limitKey)) {
        sendError(res, 'rate_limited', t('errors.tooManyAttempts', { minutes: FAILURE_WINDOW_MS / 60_000 }));
        return;
      }
      const user = db.getUserWithHashByLogin(login);
      const passwordOk = await verifyPassword(password, user?.password_hash ?? (await dummyHashPromise));
      if (!user || !passwordOk) {
        recordFailure(limitKey);
        sendError(res, 'unauthorized', t('errors.wrongCredentials'));
        return;
      }
      failures.delete(limitKey);
      db.deleteExpiredSessions(Date.now());
      startSession(res, user.id);
      res.json({ id: user.id, login: user.login, role: user.role });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (req, res) => {
    const token = sessionTokenFromCookies(req.headers.cookie);
    if (token) db.deleteSession(sha256(token));
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json({ id: user.dbId, login: user.name, role: user.role });
  });

  return router;
}

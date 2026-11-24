import type { ApiErrorBody, ErrorCode } from '@cuadrilo/shared/api';
import type { MessageKey } from '@cuadrilo/shared/i18n';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

import type { AuthedRequest } from './auth';
import { t } from './i18n';

/** A handler of a signed-in route (Express 5 forwards rejected promises itself). */
export const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void> | void): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthedRequest, res)).catch(next);
  };

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  login_taken: 409,
  invalid_status: 409,
  class_active: 409,
  student_busy: 409,
  lesson_changed: 409,
  name_taken: 409,
  media_in_use: 409,
  text_changed: 409,
  too_large: 413,
  rate_limited: 429,
  internal: 500,
  dictionary_unavailable: 503,
};

/** Answers with an error in the API format (@cuadrilo/shared/api ApiErrorBody). */
export function sendError(res: Response, code: ErrorCode, error: string, issues?: ApiErrorBody['issues']): void {
  const body: ApiErrorBody = { error, code, ...(issues && { issues }) };
  res.status(STATUS[code]).json(body);
}

export const notFound = (res: Response, error = t('errors.notFound')) => sendError(res, 'not_found', error);

/** The request body parsed by the schema; answers 400 and returns undefined otherwise. */
export const parseBody = <S extends z.ZodType>(schema: S, req: Request, res: Response) =>
  parse(schema, req.body ?? {}, res);

/** The query string parsed by the schema (values are strings: coerce numbers); 400 otherwise. */
export const parseQuery = <S extends z.ZodType>(schema: S, req: Request, res: Response) =>
  parse(schema, req.query, res);

/**
 * The message of a validation issue in the installation's language: schemas
 * of the contract carry message keys (errors.*), with min / max from the issue.
 * zod's own messages (types, unknown values) stay as they are.
 */
function issueMessage(issue: z.core.$ZodIssue): string {
  if (!issue.message.startsWith('errors.')) return issue.message;
  const limits = issue as { minimum?: unknown; maximum?: unknown };
  const params: Record<string, number> = {};
  if (typeof limits.minimum === 'number') params.min = limits.minimum;
  if (typeof limits.maximum === 'number') params.max = limits.maximum;
  return t(issue.message as MessageKey, params);
}

function parse<S extends z.ZodType>(schema: S, value: unknown, res: Response): z.output<S> | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
    message: issueMessage(issue),
  }));
  sendError(res, 'invalid_input', issues[0]?.message ?? t('errors.invalidData'), issues);
  return undefined;
}

/** Positive integer route param (default :id); answers 400 and returns undefined otherwise. */
export function parseId(req: Request, res: Response, param = 'id'): number | undefined {
  const id = Number(req.params[param]);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(res, 'invalid_input', t('errors.invalidId'));
    return undefined;
  }
  return id;
}

const stubbed = new Set<string>();

/**
 * Placeholder for business logic that is not written yet: returns `value` and
 * logs once per name. Find them all with `grep -rn "stub(" server/src`.
 */
export function stub<T>(name: string, value: T): T {
  if (!stubbed.has(name)) {
    stubbed.add(name);
    console.warn(`[stub] ${name}`);
  }
  return value;
}

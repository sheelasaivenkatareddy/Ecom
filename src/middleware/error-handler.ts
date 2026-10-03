import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Environment } from '../config.js';
import { HttpError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found`));
};

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status < 500
  );
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

/** Converts any thrown error into a consistent `{ error: { message, details? } }` response. */
export function errorHandler(env: Environment): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          message: 'Some of the information provided is invalid',
          details: err.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: { message: err.message, ...(err.details === undefined ? {} : { details: err.details }) },
      });
      return;
    }

    if (isBodyParserError(err)) {
      const message =
        err.type === 'entity.too.large' ? 'Request body is too large' : 'Request body must be valid JSON';
      res.status(err.status).json({ error: { message } });
      return;
    }

    if (isUniqueViolation(err)) {
      res.status(409).json({ error: { message: 'That record already exists' } });
      return;
    }

    if (env !== 'test') console.error(err);
    res.status(500).json({ error: { message: 'Something went wrong. Please try again.' } });
  };
}

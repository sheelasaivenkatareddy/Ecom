import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '../lib/errors.js';

export type Role = 'customer' | 'admin';

export interface AuthUser {
  id: number;
  role: Role;
}

/** Reads an optional `Authorization: Bearer <token>` header and stores the user on `res.locals`. */
export function authenticate(jwtSecret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization');
    if (!header) return next();

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return next(unauthorized('Malformed Authorization header'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || !payload.sub) throw new Error('Invalid token payload');
      const user: AuthUser = {
        id: Number(payload.sub),
        role: payload.role === 'admin' ? 'admin' : 'customer',
      };
      res.locals.user = user;
      next();
    } catch {
      next(unauthorized('Your session has expired. Please sign in again.'));
    }
  };
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  next(res.locals.user ? undefined : unauthorized());
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) return next(unauthorized());
  next(user.role === 'admin' ? undefined : forbidden());
};

/** The signed-in user. Only call this behind `requireAuth`. */
export function currentUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) throw unauthorized();
  return user;
}

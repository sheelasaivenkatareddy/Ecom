import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export function authRouter(auth: AuthService): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const result = await auth.register(registerSchema.parse(req.body));
    res.status(201).json(result);
  });

  router.post('/login', async (req, res) => {
    res.json(await auth.login(loginSchema.parse(req.body)));
  });

  router.get('/me', requireAuth, async (_req, res) => {
    res.json({ user: await auth.getUser(currentUser(res).id) });
  });

  return router;
}

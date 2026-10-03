import { Router } from 'express';
import { currentUser, requireAdmin, requireAuth } from '../../middleware/auth.js';
import { createOrderSchema, orderIdParam, updateStatusSchema } from './orders.schemas.js';
import type { OrderService } from './orders.service.js';

export function ordersRouter(orders: OrderService): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const all = req.query.scope === 'all';
    res.json({ orders: await orders.list(currentUser(res), { all }) });
  });

  router.post('/', async (req, res) => {
    const order = await orders.create(currentUser(res), createOrderSchema.parse(req.body));
    res.status(201).json({ order });
  });

  router.get('/:id', async (req, res) => {
    res.json({ order: await orders.getForUser(orderIdParam.parse(req.params.id), currentUser(res)) });
  });

  router.post('/:id/cancel', async (req, res) => {
    const order = await orders.updateStatus(
      orderIdParam.parse(req.params.id),
      'cancelled',
      currentUser(res),
    );
    res.json({ order });
  });

  router.patch('/:id/status', requireAdmin, async (req, res) => {
    const { status } = updateStatusSchema.parse(req.body);
    const order = await orders.updateStatus(orderIdParam.parse(req.params.id), status, currentUser(res));
    res.json({ order });
  });

  return router;
}

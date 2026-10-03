import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import type { Config } from './config.js';
import type { Database } from './db/index.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { createOrderService } from './modules/orders/orders.service.js';
import { catalogRouter } from './modules/products/products.routes.js';
import { createProductService } from './modules/products/products.service.js';

export interface AppDependencies {
  db: Database;
  config: Config;
}

export function createApp({ db, config }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

  app.get('/health', async (_req, res) => {
    await db.pool.query('SELECT 1');
    res.json({ status: 'ok', database: db.mode });
  });

  app.use('/api', authenticate(config.jwtSecret));
  app.use('/api/auth', authRouter(createAuthService(db.pool, config)));
  app.use('/api', catalogRouter(createProductService(db.pool)));
  app.use('/api/orders', ordersRouter(createOrderService(db.pool)));

  app.use(notFoundHandler);
  app.use(errorHandler(config.env));

  return app;
}

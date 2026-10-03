import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import {
  createProductSchema,
  listProductsQuery,
  productIdParam,
  updateProductSchema,
} from './products.schemas.js';
import type { ProductService } from './products.service.js';

/** Public catalogue endpoints plus admin-only product management. */
export function catalogRouter(products: ProductService): Router {
  const router = Router();

  router.get('/categories', async (_req, res) => {
    res.json({ categories: await products.listCategories() });
  });

  router.get('/products', async (req, res) => {
    res.json(await products.list(listProductsQuery.parse(req.query)));
  });

  router.get('/products/:slug', async (req, res) => {
    res.json({ product: await products.getBySlug(req.params.slug) });
  });

  router.post('/products', requireAdmin, async (req, res) => {
    const product = await products.create(createProductSchema.parse(req.body));
    res.status(201).json({ product });
  });

  router.patch('/products/:id', requireAdmin, async (req, res) => {
    const product = await products.update(
      productIdParam.parse(req.params.id),
      updateProductSchema.parse(req.body),
    );
    res.json({ product });
  });

  router.delete('/products/:id', requireAdmin, async (req, res) => {
    await products.remove(productIdParam.parse(req.params.id));
    res.status(204).end();
  });

  return router;
}

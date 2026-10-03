import { beforeEach, describe, expect, it } from 'vitest';
import { seedCategories, seedProducts } from '../src/db/seed.js';
import { type Api, bearer, createTestApi, signInAdmin, signUpCustomer } from './helpers.js';

const newProduct = {
  name: 'Linen Cushion Cover',
  description: 'A soft, washable linen cushion cover in a natural oat colour.',
  categorySlug: 'home-living',
  pricePaise: 69_900,
  stock: 40,
  imageUrl: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2',
};

describe('catalogue', () => {
  let api: Api;
  beforeEach(async () => {
    api = await createTestApi();
  });

  it('paginates the product list', async () => {
    const res = await api.get('/api/products?limit=5&page=2').expect(200);
    expect(res.body).toMatchObject({
      page: 2,
      limit: 5,
      total: seedProducts.length,
      totalPages: Math.ceil(seedProducts.length / 5),
    });
    expect(res.body.items).toHaveLength(5);
  });

  it('searches product names and descriptions', async () => {
    const res = await api.get('/api/products?q=lamp').expect(200);
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(['adjustable-desk-lamp']);
  });

  it('filters by category and sorts by price', async () => {
    const res = await api.get('/api/products?category=electronics&sort=price_asc').expect(200);
    const prices = res.body.items.map((p: { pricePaise: number }) => p.pricePaise);

    expect(res.body.items.every((p: { category: { slug: string } }) => p.category.slug === 'electronics')).toBe(true);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(res.body.total).toBe(seedProducts.filter((p) => p.category === 'electronics').length);
  });

  it('filters by price range and featured flag', async () => {
    const range = await api.get('/api/products?minPrice=100000&maxPrice=500000&limit=48').expect(200);
    for (const product of range.body.items) {
      expect(product.pricePaise).toBeGreaterThanOrEqual(100_000);
      expect(product.pricePaise).toBeLessThanOrEqual(500_000);
    }

    const featured = await api.get('/api/products?featured=true&limit=48').expect(200);
    expect(featured.body.total).toBe(seedProducts.filter((p) => p.isFeatured).length);
  });

  it('rejects invalid list parameters', async () => {
    await api.get('/api/products?limit=1000').expect(400);
    await api.get('/api/products?sort=random').expect(400);
  });

  it('returns a product by slug and 404 for unknown slugs', async () => {
    const res = await api.get('/api/products/ceramic-coffee-mug').expect(200);
    expect(res.body.product).toMatchObject({
      name: 'Ceramic Coffee Mug 350 ml',
      pricePaise: 34_900,
      inStock: true,
      category: { slug: 'home-living' },
    });
    await api.get('/api/products/does-not-exist').expect(404);
  });

  it('lists categories with product counts', async () => {
    const res = await api.get('/api/categories').expect(200);
    expect(res.body.categories).toHaveLength(seedCategories.length);
    const electronics = res.body.categories.find((c: { slug: string }) => c.slug === 'electronics');
    expect(electronics.productCount).toBe(seedProducts.filter((p) => p.category === 'electronics').length);
  });
});

describe('product management', () => {
  let api: Api;
  let adminToken: string;
  beforeEach(async () => {
    api = await createTestApi();
    adminToken = await signInAdmin(api);
  });

  it('only lets admins create products', async () => {
    const customer = await signUpCustomer(api);
    await api.post('/api/products').send(newProduct).expect(401);
    await api.post('/api/products').set(bearer(customer.token)).send(newProduct).expect(403);

    const res = await api.post('/api/products').set(bearer(adminToken)).send(newProduct).expect(201);
    expect(res.body.product).toMatchObject({
      slug: 'linen-cushion-cover',
      category: { slug: 'home-living' },
      isFeatured: false,
    });
  });

  it('rejects duplicate slugs and unknown categories', async () => {
    await api.post('/api/products').set(bearer(adminToken)).send(newProduct).expect(201);
    await api.post('/api/products').set(bearer(adminToken)).send(newProduct).expect(409);
    await api
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ ...newProduct, slug: 'other-slug', categorySlug: 'toys' })
      .expect(400);
  });

  it('updates a product and hides it from the catalogue when deleted', async () => {
    const { body } = await api.get('/api/products/adjustable-desk-lamp').expect(200);
    const id = body.product.id;

    const updated = await api
      .patch(`/api/products/${id}`)
      .set(bearer(adminToken))
      .send({ pricePaise: 129_900, stock: 5 })
      .expect(200);
    expect(updated.body.product).toMatchObject({ pricePaise: 129_900, stock: 5 });

    await api.patch(`/api/products/${id}`).set(bearer(adminToken)).send({}).expect(400);

    await api.delete(`/api/products/${id}`).set(bearer(adminToken)).expect(204);
    await api.get('/api/products/adjustable-desk-lamp').expect(404);
    const list = await api.get('/api/products?q=lamp').expect(200);
    expect(list.body.total).toBe(0);
    await api.delete(`/api/products/${id}`).set(bearer(adminToken)).expect(404);
  });
});

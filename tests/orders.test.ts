import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Api,
  bearer,
  createTestApi,
  getProduct,
  signInAdmin,
  signUpCustomer,
  validShipping,
} from './helpers.js';

describe('orders', () => {
  let api: Api;
  let token: string;
  beforeEach(async () => {
    api = await createTestApi();
    ({ token } = await signUpCustomer(api));
  });

  const placeOrder = (authToken: string, items: { productId: number; quantity: number }[]) =>
    api.post('/api/orders').set(bearer(authToken)).send({ items, shipping: validShipping });

  it('requires the customer to be signed in', async () => {
    await api.post('/api/orders').send({ items: [], shipping: validShipping }).expect(401);
    await api.get('/api/orders').expect(401);
  });

  it('prices orders from the catalogue, not the client, and reserves stock', async () => {
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const lamp = await getProduct(api, 'adjustable-desk-lamp');

    const res = await api
      .post('/api/orders')
      .set(bearer(token))
      .send({
        items: [
          { productId: mug.id, quantity: 2, pricePaise: 1 },
          { productId: lamp.id, quantity: 1 },
        ],
        shipping: validShipping,
      })
      .expect(201);

    const subtotal = mug.pricePaise * 2 + lamp.pricePaise;
    expect(res.body.order).toMatchObject({
      status: 'pending',
      paymentMethod: 'cod',
      subtotalPaise: subtotal,
      shippingPaise: 0,
      totalPaise: subtotal,
      itemCount: 3,
      shipping: validShipping,
    });
    expect(res.body.order.items[0]).toMatchObject({
      productSlug: 'ceramic-coffee-mug',
      unitPricePaise: mug.pricePaise,
      lineTotalPaise: mug.pricePaise * 2,
    });

    expect((await getProduct(api, 'ceramic-coffee-mug')).stock).toBe(mug.stock - 2);
    expect((await getProduct(api, 'adjustable-desk-lamp')).stock).toBe(lamp.stock - 1);
  });

  it('charges delivery below ₹999 and ships free above it', async () => {
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const small = await placeOrder(token, [{ productId: mug.id, quantity: 1 }]).expect(201);
    expect(small.body.order).toMatchObject({ shippingPaise: 4_900, totalPaise: mug.pricePaise + 4_900 });

    const headphones = await getProduct(api, 'wireless-over-ear-headphones');
    const large = await placeOrder(token, [{ productId: headphones.id, quantity: 1 }]).expect(201);
    expect(large.body.order.shippingPaise).toBe(0);
  });

  it('rejects the whole order when one item is out of stock', async () => {
    const adminToken = await signInAdmin(api);
    const watch = await getProduct(api, 'chronograph-leather-watch');
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    await api.patch(`/api/products/${watch.id}`).set(bearer(adminToken)).send({ stock: 1 }).expect(200);

    const res = await placeOrder(token, [
      { productId: mug.id, quantity: 1 },
      { productId: watch.id, quantity: 2 },
    ]).expect(409);
    expect(res.body.error).toMatchObject({
      message: 'Only 1 left in stock for "Chronograph Leather Watch"',
      details: { productId: watch.id, available: 1 },
    });

    // The mug's stock was rolled back with the rest of the order.
    expect((await getProduct(api, 'ceramic-coffee-mug')).stock).toBe(mug.stock);
    expect((await getProduct(api, 'chronograph-leather-watch')).stock).toBe(1);
  });

  it('validates the delivery address and quantity limits', async () => {
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const res = await api
      .post('/api/orders')
      .set(bearer(token))
      .send({ items: [{ productId: mug.id, quantity: 1 }], shipping: { ...validShipping, pincode: '12' } })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'shipping.pincode', message: 'Enter a valid 6-digit PIN code' },
    ]);

    await placeOrder(token, [
      { productId: mug.id, quantity: 6 },
      { productId: mug.id, quantity: 6 },
    ]).expect(400);
    await placeOrder(token, []).expect(400);
  });

  it('shows customers only their own orders', async () => {
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const placed = await placeOrder(token, [{ productId: mug.id, quantity: 1 }]).expect(201);
    const orderId = placed.body.order.id;

    const mine = await api.get('/api/orders').set(bearer(token)).expect(200);
    expect(mine.body.orders.map((o: { id: number }) => o.id)).toEqual([orderId]);
    await api.get(`/api/orders/${orderId}`).set(bearer(token)).expect(200);

    const other = await signUpCustomer(api);
    const theirs = await api.get('/api/orders').set(bearer(other.token)).expect(200);
    expect(theirs.body.orders).toEqual([]);
    await api.get(`/api/orders/${orderId}`).set(bearer(other.token)).expect(404);
  });

  it('lets a customer cancel a pending order and restores stock', async () => {
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const placed = await placeOrder(token, [{ productId: mug.id, quantity: 3 }]).expect(201);
    const orderId = placed.body.order.id;

    const cancelled = await api.post(`/api/orders/${orderId}/cancel`).set(bearer(token)).expect(200);
    expect(cancelled.body.order.status).toBe('cancelled');
    expect((await getProduct(api, 'ceramic-coffee-mug')).stock).toBe(mug.stock);

    await api.post(`/api/orders/${orderId}/cancel`).set(bearer(token)).expect(409);
  });

  it('lets admins move orders through the fulfilment steps', async () => {
    const adminToken = await signInAdmin(api);
    const mug = await getProduct(api, 'ceramic-coffee-mug');
    const placed = await placeOrder(token, [{ productId: mug.id, quantity: 1 }]).expect(201);
    const orderId = placed.body.order.id;
    const setStatus = (authToken: string, status: string) =>
      api.patch(`/api/orders/${orderId}/status`).set(bearer(authToken)).send({ status });

    await setStatus(token, 'confirmed').expect(403);
    await setStatus(adminToken, 'delivered').expect(409);
    await setStatus(adminToken, 'confirmed').expect(200);
    await setStatus(adminToken, 'shipped').expect(200);

    // Once shipped, the customer can no longer cancel.
    await api.post(`/api/orders/${orderId}/cancel`).set(bearer(token)).expect(409);

    const delivered = await setStatus(adminToken, 'delivered').expect(200);
    expect(delivered.body.order.status).toBe('delivered');

    const all = await api.get('/api/orders?scope=all').set(bearer(adminToken)).expect(200);
    expect(all.body.orders.map((o: { id: number }) => o.id)).toContain(orderId);
  });
});

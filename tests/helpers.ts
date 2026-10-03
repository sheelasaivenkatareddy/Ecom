import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryDatabase } from '../src/db/index.js';

export const ADMIN = { email: 'admin@test.dev', password: 'Admin@12345' } as const;

export const validShipping = {
  name: 'Ravi Kumar',
  phone: '9876543210',
  address: '12 MG Road, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560038',
};

export type Api = ReturnType<typeof request>;

/** A fresh app backed by its own seeded in-memory database. */
export async function createTestApi(): Promise<Api> {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-that-is-at-least-thirty-two-characters',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
  });
  const db = await createMemoryDatabase(config.admin);
  return request(createApp({ db, config }));
}

let customerCount = 0;

export async function signUpCustomer(api: Api): Promise<{ token: string; userId: number }> {
  customerCount += 1;
  const res = await api
    .post('/api/auth/register')
    .send({ name: 'Test Customer', email: `customer${customerCount}@test.dev`, password: 'Password123' })
    .expect(201);
  return { token: res.body.token, userId: res.body.user.id };
}

export async function signInAdmin(api: Api): Promise<string> {
  const res = await api.post('/api/auth/login').send(ADMIN).expect(200);
  return res.body.token;
}

export async function getProduct(api: Api, slug: string) {
  const res = await api.get(`/api/products/${slug}`).expect(200);
  return res.body.product as { id: number; pricePaise: number; stock: number; name: string };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

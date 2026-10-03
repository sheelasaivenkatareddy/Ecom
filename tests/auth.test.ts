import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, type Api, bearer, createTestApi } from './helpers.js';

describe('auth', () => {
  let api: Api;
  beforeEach(async () => {
    api = await createTestApi();
  });

  it('registers a customer and returns a token without exposing the password', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: '  Asha@Example.com ', password: 'Password123' })
      .expect(201);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com', role: 'customer' });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('rejects a second account with the same email', async () => {
    const body = { name: 'Asha Rao', email: 'asha@example.com', password: 'Password123' };
    await api.post('/api/auth/register').send(body).expect(201);
    const res = await api.post('/api/auth/register').send({ ...body, email: 'ASHA@example.com' }).expect(409);
    expect(res.body.error.message).toMatch(/already exists/);
  });

  it('explains which registration fields are invalid', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' })
      .expect(400);
    const paths = res.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('signs in with the right password and rejects a wrong one', async () => {
    await api.post('/api/auth/login').send(ADMIN).expect(200);
    const res = await api
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password');
    await api.post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'whatever1' }).expect(401);
  });

  it('returns the signed-in user and rejects missing or invalid tokens', async () => {
    const { body } = await api.post('/api/auth/login').send(ADMIN).expect(200);

    const me = await api.get('/api/auth/me').set(bearer(body.token)).expect(200);
    expect(me.body.user).toMatchObject({ email: ADMIN.email, role: 'admin' });

    await api.get('/api/auth/me').expect(401);
    await api.get('/api/auth/me').set(bearer('not-a-real-token')).expect(401);
  });
});

describe('app', () => {
  it('reports health and returns JSON for unknown routes and bad JSON', async () => {
    const api = await createTestApi();
    await api.get('/health').expect(200, { status: 'ok', database: 'memory' });

    const missing = await api.get('/api/nope').expect(404);
    expect(missing.body.error.message).toMatch(/not found/);

    const badJson = await api
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(badJson.body.error.message).toBe('Request body must be valid JSON');
  });
});

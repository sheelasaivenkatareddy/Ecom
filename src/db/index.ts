import pg from 'pg';
import type { Pool, PoolClient } from 'pg';
import { newDb } from 'pg-mem';
import type { Config } from '../config.js';
import { schemaSql } from './schema.js';
import { seedDatabase } from './seed.js';

export type { Queryable } from './types.js';

export interface Database {
  pool: Pool;
  mode: 'postgres' | 'memory';
  close(): Promise<void>;
}

/** Connects to PostgreSQL when DATABASE_URL is set, otherwise starts the in-memory demo database. */
export async function createDatabase(
  config: Pick<Config, 'databaseUrl' | 'admin'>,
): Promise<Database> {
  if (!config.databaseUrl) return createMemoryDatabase(config.admin);

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  return { pool, mode: 'postgres', close: () => pool.end() };
}

/** An in-memory PostgreSQL emulation, migrated and seeded, so the API runs with zero setup. */
export async function createMemoryDatabase(admin: Config['admin']): Promise<Database> {
  const memory = newDb();
  const adapter = memory.adapters.createPg() as { Pool: new () => Pool };
  const pool = new adapter.Pool();

  await pool.query(schemaSql);
  await seedDatabase(pool, admin);

  return { pool, mode: 'memory', close: () => pool.end() };
}

/** Runs `work` inside a transaction, rolling back if it throws. */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

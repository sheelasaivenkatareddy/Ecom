import pg from 'pg';
import { loadConfig } from '../config.js';
import { schemaSql } from './schema.js';
import { seedDatabase } from './seed.js';

// Creates the tables and demo data in the PostgreSQL database at DATABASE_URL.
const config = loadConfig();

if (!config.databaseUrl) {
  console.error('Set DATABASE_URL to the PostgreSQL database you want to set up.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  await pool.query(schemaSql);
  await seedDatabase(pool, config.admin);
  console.log('Database is ready.');
} finally {
  await pool.end();
}

import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  JWT_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  ),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ADMIN_EMAIL: z.email().default('admin@ecom.dev'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
});

export type Environment = 'development' | 'test' | 'production';

export interface Config {
  env: Environment;
  port: number;
  /** When undefined the API runs on an in-memory demo database. */
  databaseUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  admin: { email: string; password: string };
}

// Only ever used when JWT_SECRET is not set outside production.
const DEVELOPMENT_JWT_SECRET = 'development-only-secret-do-not-use-in-production';

/**
 * Reads configuration from environment variables. When no explicit environment
 * is passed, a local `.env` file is loaded first (if one exists).
 */
export function loadConfig(env?: Record<string, string | undefined>): Config {
  if (!env) {
    try {
      process.loadEnvFile();
    } catch {
      // No .env file: rely on the process environment.
    }
  }

  const parsed = envSchema.safeParse(env ?? process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }

  const vars = parsed.data;
  if (vars.NODE_ENV === 'production' && (!vars.DATABASE_URL || !vars.JWT_SECRET)) {
    throw new Error('DATABASE_URL and JWT_SECRET must be set in production.');
  }

  return {
    env: vars.NODE_ENV,
    port: vars.PORT,
    databaseUrl: vars.DATABASE_URL,
    jwtSecret: vars.JWT_SECRET ?? DEVELOPMENT_JWT_SECRET,
    jwtExpiresIn: vars.JWT_EXPIRES_IN,
    corsOrigins: vars.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    admin: { email: vars.ADMIN_EMAIL.toLowerCase(), password: vars.ADMIN_PASSWORD },
  };
}

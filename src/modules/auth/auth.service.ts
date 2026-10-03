import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db/types.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import type { Role } from '../../middleware/auth.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: Date;
}

const toUser = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

export type User = ReturnType<typeof toUser>;

const USER_COLUMNS = 'id, name, email, role, created_at';

// Compared against when an email is unknown, so failed logins take the same time either way.
let dummyHash: string | undefined;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', 10));

export function createAuthService(db: Queryable, config: Pick<Config, 'jwtSecret' | 'jwtExpiresIn'>) {
  function issueToken(user: User): string {
    return jwt.sign({ role: user.role }, config.jwtSecret, {
      subject: String(user.id),
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }

  async function register(input: RegisterInput) {
    const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
    if (existing.rows.length > 0) throw conflict('An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [input.name, input.email, passwordHash],
    );
    const user = toUser(rows[0]!);
    return { token: issueToken(user), user };
  }

  async function login(input: LoginInput) {
    const { rows } = await db.query<UserRow & { password_hash: string }>(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
      [input.email],
    );
    const row = rows[0];
    const passwordMatches = await bcrypt.compare(
      input.password,
      row?.password_hash ?? (await getDummyHash()),
    );
    if (!row || !passwordMatches) throw unauthorized('Invalid email or password');

    const user = toUser(row);
    return { token: issueToken(user), user };
  }

  async function getUser(id: number): Promise<User> {
    const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound('Account not found');
    return toUser(rows[0]);
  }

  return { register, login, getUser };
}

export type AuthService = ReturnType<typeof createAuthService>;

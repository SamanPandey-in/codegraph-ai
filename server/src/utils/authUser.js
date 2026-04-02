import jwt from 'jsonwebtoken';
import { pgPool } from '../infrastructure/connections.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_REGEX.test(String(value || ''));
}

export function getAuthUser(req) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function resolveDatabaseUserId(authUser) {
  const authId = String(authUser?.id || '').trim();
  if (!authId) return null;

  if (isUuid(authId)) {
    const existing = await pgPool.query(
      `
        SELECT id
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [authId],
    );

    if (existing.rowCount > 0) return existing.rows[0].id;

    const inserted = await pgPool.query(
      `
        INSERT INTO users (id, github_id, username, email, avatar_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [
        authId,
        null,
        authUser?.username || 'unknown-user',
        authUser?.email || null,
        authUser?.avatar || null,
      ],
    );

    return inserted.rows[0]?.id || null;
  }

  const upserted = await pgPool.query(
    `
      INSERT INTO users (github_id, username, email, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (github_id)
      DO UPDATE
      SET username = COALESCE(EXCLUDED.username, users.username),
          email = COALESCE(EXCLUDED.email, users.email),
          avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
          updated_at = NOW()
      RETURNING id
    `,
    [
      authId,
      authUser?.username || `github-${authId}`,
      authUser?.email || null,
      authUser?.avatar || null,
    ],
  );

  return upserted.rows[0]?.id || null;
}

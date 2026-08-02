import 'server-only';

import { randomUUID } from 'crypto';
import {
  readPlatformStore,
  runPostgresQuery,
  runPostgresTransaction,
  updatePlatformStore,
} from '@/lib/db/client';
import type { UserRecord } from '@/lib/db/schema';

interface UpsertGoogleUserInput {
  googleSub: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface CreateClassroomGuestUserInput {
  displayName: string;
  emailHint: string;
}

interface UserRow {
  id: string;
  google_sub: string | null;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export class GoogleAccountLinkConflictError extends Error {
  readonly code = 'ACCOUNT_LINK_CONFLICT';

  constructor() {
    super('Google identity conflicts with an existing account');
    this.name = 'GoogleAccountLinkConflictError';
  }
}

export function isGoogleAccountLinkConflictError(
  error: unknown,
): error is GoogleAccountLinkConflictError {
  return (
    error instanceof GoogleAccountLinkConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ACCOUNT_LINK_CONFLICT')
  );
}

function isPostgresUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const rows = await runPostgresQuery<UserRow>(
    `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  if (rows) {
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  const store = await readPlatformStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await runPostgresQuery<UserRow>(
    `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [normalizedEmail],
  );

  if (rows) {
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  const store = await readPlatformStore();
  return store.users.find((user) => user.email.toLowerCase() === normalizedEmail) ?? null;
}

export async function findUserByGoogleSub(googleSub: string): Promise<UserRecord | null> {
  const rows = await runPostgresQuery<UserRow>(
    `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
     FROM users
     WHERE google_sub = $1
     LIMIT 1`,
    [googleSub],
  );

  if (rows) {
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  const store = await readPlatformStore();
  return store.users.find((user) => user.googleSub === googleSub) ?? null;
}

export async function upsertGoogleUser(input: UpsertGoogleUserInput): Promise<UserRecord> {
  const now = new Date().toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim() || normalizedEmail;
  const avatarUrl = input.avatarUrl?.trim() || null;
  const postgresUser = await runPostgresTransaction(async (executor) => {
    const bySubject = await executor.unsafe<UserRow>(
      `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
       FROM users
       WHERE google_sub = $1
       LIMIT 1
       FOR UPDATE`,
      [input.googleSub],
    );

    if (bySubject[0]) {
      const emailOwner = await executor.unsafe<UserRow>(
        `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
         FROM users
         WHERE lower(email) = $1
         LIMIT 1
         FOR UPDATE`,
        [normalizedEmail],
      );
      if (emailOwner[0] && emailOwner[0].id !== bySubject[0].id) {
        throw new GoogleAccountLinkConflictError();
      }

      const updated = await executor.unsafe<UserRow>(
        `UPDATE users
         SET email = $2,
             display_name = $3,
             avatar_url = $4,
             updated_at = $5,
             last_login_at = $5
         WHERE id = $1
         RETURNING id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at`,
        [bySubject[0].id, normalizedEmail, displayName, avatarUrl, now],
      );
      return mapUserRow(updated[0]);
    }

    const byEmail = await executor.unsafe<UserRow>(
      `SELECT id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
       FROM users
       WHERE lower(email) = $1
       LIMIT 1
       FOR UPDATE`,
      [normalizedEmail],
    );

    if (byEmail[0]) {
      if (byEmail[0].google_sub !== null) {
        throw new GoogleAccountLinkConflictError();
      }

      const linked = await executor.unsafe<UserRow>(
        `UPDATE users
         SET google_sub = $2,
             display_name = $3,
             avatar_url = $4,
             updated_at = $5,
             last_login_at = $5
         WHERE id = $1
           AND google_sub IS NULL
         RETURNING id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at`,
        [byEmail[0].id, input.googleSub, displayName, avatarUrl, now],
      );
      if (!linked[0]) {
        throw new GoogleAccountLinkConflictError();
      }
      return mapUserRow(linked[0]);
    }

    const inserted = await executor.unsafe<UserRow>(
      `INSERT INTO users (
          id,
          google_sub,
          email,
          display_name,
          avatar_url,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
        RETURNING id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at`,
      [randomUUID(), input.googleSub, normalizedEmail, displayName, avatarUrl, now],
    );
    return mapUserRow(inserted[0]);
  }).catch((error: unknown) => {
    if (isPostgresUniqueConstraintViolation(error)) {
      throw new GoogleAccountLinkConflictError();
    }
    throw error;
  });

  if (postgresUser) return postgresUser;

  return updatePlatformStore((store) => {
    const bySubject = store.users.find((user) => user.googleSub === input.googleSub);
    const byEmail = store.users.find((user) => user.email.toLowerCase() === normalizedEmail);

    if (bySubject) {
      if (byEmail && byEmail.id !== bySubject.id) {
        throw new GoogleAccountLinkConflictError();
      }
      bySubject.email = normalizedEmail;
      bySubject.displayName = displayName;
      bySubject.avatarUrl = avatarUrl;
      bySubject.updatedAt = now;
      bySubject.lastLoginAt = now;
      return bySubject;
    }

    if (byEmail) {
      if (byEmail.googleSub !== null) {
        throw new GoogleAccountLinkConflictError();
      }
      byEmail.googleSub = input.googleSub;
      byEmail.displayName = displayName;
      byEmail.avatarUrl = avatarUrl;
      byEmail.updatedAt = now;
      byEmail.lastLoginAt = now;
      return byEmail;
    }

    const user: UserRecord = {
      id: randomUUID(),
      googleSub: input.googleSub,
      email: normalizedEmail,
      displayName,
      avatarUrl,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    store.users.push(user);
    return user;
  });
}

export async function createClassroomGuestUser(
  input: CreateClassroomGuestUserInput,
): Promise<UserRecord> {
  const now = new Date().toISOString();
  const displayName = input.displayName.trim() || 'Student';
  const normalizedHint = input.emailHint
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const email = `${normalizedHint || 'student'}-${randomUUID()}@classroom.raic.local`;

  const rows = await runPostgresQuery<UserRow>(
    `INSERT INTO users (
        id,
        google_sub,
        email,
        display_name,
        avatar_url,
        created_at,
        updated_at,
        last_login_at
      )
      VALUES ($1, NULL, $2, $3, NULL, $4, $4, NULL)
      RETURNING id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at`,
    [randomUUID(), email, displayName, now],
  );

  if (rows) {
    return mapUserRow(rows[0]);
  }

  return updatePlatformStore((store) => {
    const user: UserRecord = {
      id: randomUUID(),
      googleSub: null,
      email,
      displayName,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    store.users.push(user);
    return user;
  });
}

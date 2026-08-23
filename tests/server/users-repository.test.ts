import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PLATFORM_STORE, type PlatformStore, type UserRecord } from '@/lib/db/schema';

const runPostgresTransactionMock = vi.fn();
const updatePlatformStoreMock = vi.fn();
let store: PlatformStore;

vi.mock('@/lib/db/client', () => ({
  readPlatformStore: vi.fn(),
  runPostgresQuery: vi.fn(),
  runPostgresTransaction: runPostgresTransactionMock,
  updatePlatformStore: updatePlatformStoreMock,
}));

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    googleSub: null,
    email: 'teacher@example.com',
    displayName: 'Teacher',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

describe('Google user identity linking', () => {
  beforeEach(() => {
    vi.resetModules();
    store = structuredClone(EMPTY_PLATFORM_STORE);
    runPostgresTransactionMock.mockReset();
    runPostgresTransactionMock.mockResolvedValue(null);
    updatePlatformStoreMock.mockReset();
    updatePlatformStoreMock.mockImplementation(async (updater: (value: PlatformStore) => unknown) =>
      updater(store),
    );
  });

  it('updates an established account by immutable Google subject', async () => {
    store.users.push(user({ googleSub: 'google-sub-1', email: 'old@example.com' }));
    const { upsertGoogleUser } = await import('@/lib/db/repositories/users');

    const result = await upsertGoogleUser({
      googleSub: 'google-sub-1',
      email: 'new@example.com',
      displayName: 'New Name',
      avatarUrl: null,
    });

    expect(result.id).toBe('user-1');
    expect(result.googleSub).toBe('google-sub-1');
    expect(result.email).toBe('new@example.com');
  });

  it('allows a one-time link for a legacy email without a Google subject', async () => {
    store.users.push(user());
    const { upsertGoogleUser } = await import('@/lib/db/repositories/users');

    const result = await upsertGoogleUser({
      googleSub: 'google-sub-1',
      email: 'TEACHER@example.com',
      displayName: 'Teacher',
      avatarUrl: null,
    });

    expect(result.id).toBe('user-1');
    expect(result.googleSub).toBe('google-sub-1');
    expect(store.users).toHaveLength(1);
  });

  it('rejects an email already linked to another Google subject without mutation', async () => {
    const existing = user({ googleSub: 'old-google-sub' });
    store.users.push(existing);
    const snapshot = structuredClone(existing);
    const { upsertGoogleUser } = await import('@/lib/db/repositories/users');

    await expect(
      upsertGoogleUser({
        googleSub: 'new-google-sub',
        email: 'teacher@example.com',
        displayName: 'Attacker',
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LINK_CONFLICT' });
    expect(store.users[0]).toEqual(snapshot);
  });

  it('maps a concurrent unique-constraint race to an account-link conflict', async () => {
    runPostgresTransactionMock.mockRejectedValue(
      Object.assign(new Error('duplicate key value leaks schema detail'), { code: '23505' }),
    );
    const { upsertGoogleUser } = await import('@/lib/db/repositories/users');

    await expect(
      upsertGoogleUser({
        googleSub: 'google-sub-1',
        email: 'teacher@example.com',
        displayName: 'Teacher',
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LINK_CONFLICT' });
    expect(updatePlatformStoreMock).not.toHaveBeenCalled();
  });
});

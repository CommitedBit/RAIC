import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createGuestUserMock = vi.fn();
const createOrganizationMock = vi.fn();
const ensureMembershipMock = vi.fn();
const createWebSessionMock = vi.fn();
const isPostgresConfiguredMock = vi.fn();
const runTransactionMock = vi.fn();
const requireBlobTokenMock = vi.fn();
const headBlobMock = vi.fn();
const delBlobMock = vi.fn();
const loggerWarnMock = vi.fn();
const transactionUnsafeMock = vi.fn();

vi.mock('@/lib/db/repositories/users', () => ({
  createClassroomGuestUser: createGuestUserMock,
}));
vi.mock('@/lib/db/repositories/organizations', () => ({
  findOrCreatePersonalOrganization: createOrganizationMock,
}));
vi.mock('@/lib/db/repositories/memberships', () => ({ ensureMembership: ensureMembershipMock }));
vi.mock('@/lib/auth/session', () => ({ createWebSession: createWebSessionMock }));
vi.mock('@/lib/db/client', () => ({
  isPostgresConfigured: isPostgresConfiguredMock,
  runPostgresTransaction: runTransactionMock,
}));
vi.mock('@/lib/server/source-document-storage', () => ({
  requireSourceDocumentBlobToken: requireBlobTokenMock,
}));
vi.mock('@vercel/blob', () => ({ head: headBlobMock, del: delBlobMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: loggerWarnMock }),
}));

const smokeSecret = 'preview-smoke-secret-with-at-least-32-characters';

function request(body: object, secret = smokeSecret) {
  return new NextRequest('http://localhost/api/internal/preview-smoke-session', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('preview smoke session route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RAIC_PREVIEW_SMOKE_SECRET', smokeSecret);
    createGuestUserMock.mockReset().mockResolvedValue({
      id: 'user-1',
      email: 'preview-source-smoke@classroom.raic.local',
      displayName: 'Preview Smoke Teacher',
    });
    createOrganizationMock.mockReset().mockResolvedValue({ id: 'org-1' });
    ensureMembershipMock.mockReset().mockResolvedValue({ id: 'membership-1' });
    createWebSessionMock.mockReset().mockResolvedValue({ token: 'session-secret' });
    isPostgresConfiguredMock.mockReset().mockReturnValue(true);
    requireBlobTokenMock.mockReset().mockReturnValue('private-blob-secret');
    headBlobMock.mockReset();
    delBlobMock.mockReset().mockResolvedValue(undefined);
    loggerWarnMock.mockReset();
    transactionUnsafeMock.mockReset().mockResolvedValue([]);
    runTransactionMock.mockReset().mockImplementation(async (handler) => {
      const executor = { unsafe: transactionUnsafeMock };
      return handler(executor);
    });
  });

  it('stays hidden outside preview even when a secret is configured', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');
    const response = await POST(request({ action: 'create' }));

    expect(response.status).toBe(404);
    expect(createGuestUserMock).not.toHaveBeenCalled();
  });

  it('rejects requests without the exact preview smoke secret', async () => {
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');
    const response = await POST(request({ action: 'create' }, 'wrong-secret'));

    expect(response.status).toBe(401);
    expect(createGuestUserMock).not.toHaveBeenCalled();
  });

  it('creates a disposable teacher session and cleans every owned record', async () => {
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');
    const created = await POST(request({ action: 'create' }));
    const createdBody = await created.json();

    expect(created.status).toBe(201);
    expect(createdBody.sessionToken).toBe('session-secret');
    expect(createdBody.cleanupToken).toEqual(expect.any(String));
    expect(ensureMembershipMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'teacher',
    });

    const cleaned = await POST(
      request({ action: 'cleanup', cleanupToken: createdBody.cleanupToken }),
    );
    expect(cleaned.status).toBe(200);
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(transactionUnsafeMock).toHaveBeenCalledWith(
      'DELETE FROM classrooms WHERE owner_user_id = $1',
      ['user-1'],
    );
    expect(transactionUnsafeMock).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [
      'user-1',
    ]);
    expect(transactionUnsafeMock).toHaveBeenCalledWith('DELETE FROM organizations WHERE id = $1', [
      'org-1',
    ]);
  });

  it('rejects tampered cleanup tokens without running cleanup', async () => {
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');
    const response = await POST(request({ action: 'cleanup', cleanupToken: 'tampered.value' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Invalid smoke request' });
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('independently verifies deletion and bounds emergency Blob cleanup paths', async () => {
    const notFound = new Error('not found');
    notFound.name = 'BlobNotFoundError';
    headBlobMock.mockRejectedValue(notFound);
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');

    const verified = await POST(
      request({
        action: 'verify-source-blob-deleted',
        pathname: 'source-documents/uploads/smoke.pdf',
      }),
    );
    await expect(verified.json()).resolves.toMatchObject({ success: true, deleted: true });

    const rejected = await POST(
      request({ action: 'delete-source-blob', pathname: '../classroom-assets/private.pdf' }),
    );
    expect(rejected.status).toBe(400);
    expect(delBlobMock).not.toHaveBeenCalled();
  });

  it('sanitizes infrastructure failures', async () => {
    createGuestUserMock.mockRejectedValue(
      new Error('DATABASE_URL=secret providerRaw=private-source-text'),
    );
    const { POST } = await import('@/app/api/internal/preview-smoke-session/route');
    const response = await POST(request({ action: 'create' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('private-source-text');
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain('providerRaw');
  });
});

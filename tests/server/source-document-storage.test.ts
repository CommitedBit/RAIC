import { beforeEach, describe, expect, it, vi } from 'vitest';

const delMock = vi.fn();
const listMock = vi.fn();

vi.mock('@vercel/blob', () => ({ del: delMock, list: listMock }));
vi.mock('@/lib/server/encrypted-secrets', () => ({
  requireEncryptionKey: () => Buffer.alloc(32, 7),
}));

const teacher = {
  user: { id: 'teacher-1' },
  session: { role: 'teacher' },
  organization: { id: 'org-1' },
  memberships: [],
  activeMembership: null,
};

describe('source-document private storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delMock.mockReset();
    listMock.mockReset();
    vi.stubEnv('RAIC_SOURCE_BLOB_READ_WRITE_TOKEN', 'private-store-token');
    vi.stubEnv('RAIC_SECRET_ENCRYPTION_KEY', 'signing-key');
  });

  it('signs upload ownership and rejects another teacher or expired claims', async () => {
    const { createSourceDocumentUploadIntent, verifySourceDocumentUploadCapability } =
      await import('@/lib/server/source-document-storage');
    const now = Date.parse('2026-07-15T12:00:00.000Z');
    const intent = createSourceDocumentUploadIntent(teacher as never, now);

    expect(
      verifySourceDocumentUploadCapability({
        capability: intent.capability,
        auth: teacher as never,
        expectedPathname: intent.pathname,
        now,
      }),
    ).toMatchObject({ userId: 'teacher-1', organizationId: 'org-1' });
    expect(() =>
      verifySourceDocumentUploadCapability({
        capability: intent.capability,
        auth: { ...teacher, user: { id: 'teacher-2' } } as never,
        expectedPathname: intent.pathname,
        now,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_UPLOAD_CAPABILITY' }));
    expect(() =>
      verifySourceDocumentUploadCapability({
        capability: intent.capability,
        auth: teacher as never,
        expectedPathname: intent.pathname,
        now: now + 60 * 60 * 1000 + 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'UPLOAD_EXPIRED' }));
  });

  it('reports capability readiness only when signing and the private store are configured', async () => {
    const { getSourceDocumentsV2Readiness } = await import('@/lib/server/source-document-storage');
    expect(getSourceDocumentsV2Readiness()).toEqual({
      ready: true,
      privateBlobConfigured: true,
      signingConfigured: true,
      reason: null,
    });
    vi.stubEnv('RAIC_SOURCE_BLOB_READ_WRITE_TOKEN', '');
    expect(getSourceDocumentsV2Readiness()).toMatchObject({
      ready: false,
      privateBlobConfigured: false,
    });
  });

  it('deletes only uploads older than one hour across list pages', async () => {
    const now = Date.parse('2026-07-15T12:00:00.000Z');
    listMock
      .mockResolvedValueOnce({
        blobs: [
          {
            pathname: 'source-documents/uploads/stale.pdf',
            uploadedAt: new Date(now - 60 * 60 * 1000 - 1),
          },
          {
            pathname: 'source-documents/uploads/fresh.pdf',
            uploadedAt: new Date(now - 1_000),
          },
        ],
        hasMore: true,
        cursor: 'next',
      })
      .mockResolvedValueOnce({ blobs: [], hasMore: false });
    delMock.mockResolvedValue(undefined);

    const { cleanupAbandonedSourceDocumentUploads } =
      await import('@/lib/server/source-document-storage');
    await expect(cleanupAbandonedSourceDocumentUploads(now)).resolves.toEqual({
      scanned: 2,
      deleted: 1,
    });
    expect(delMock).toHaveBeenCalledWith(['source-documents/uploads/stale.pdf'], {
      token: 'private-store-token',
    });
  });
});

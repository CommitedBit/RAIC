import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const requireRequestRoleMock = vi.fn();
const createIntentMock = vi.fn();
const verifyCapabilityMock = vi.fn();
const requireBlobTokenMock = vi.fn();
const cleanupMock = vi.fn();
const handleUploadMock = vi.fn();
const getBlobMock = vi.fn();
const delBlobMock = vi.fn();
const extractArtifactMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock('@/lib/auth/authorize', () => ({ requireRequestRole: requireRequestRoleMock }));
vi.mock('@/lib/server/source-document-storage', () => ({
  createSourceDocumentUploadIntent: createIntentMock,
  verifySourceDocumentUploadCapability: verifyCapabilityMock,
  requireSourceDocumentBlobToken: requireBlobTokenMock,
  cleanupAbandonedSourceDocumentUploads: cleanupMock,
}));
vi.mock('@vercel/blob/client', () => ({ handleUpload: handleUploadMock }));
vi.mock('@vercel/blob', () => ({ get: getBlobMock, del: delBlobMock }));
vi.mock('@/lib/documents/extractors/registry', () => ({
  extractDocumentArtifact: extractArtifactMock,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

const auth = {
  user: { id: 'teacher-1' },
  session: { role: 'teacher' },
  organization: { id: 'org-1' },
};
const artifact = {
  version: 2,
  id: 'doc_fixture',
  mediaType: 'application/pdf',
  pageCount: 1,
  characterCount: 7,
  truncated: false,
  blocks: [],
  assets: [],
  citations: [],
  diagnostics: [],
  context: { text: 'fixture', characterCount: 7, truncated: false, pageNumbers: [1] },
};

function extractionRequest(body: object) {
  return new NextRequest('http://localhost/api/source-documents/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('source-document routes', () => {
  beforeEach(() => {
    vi.resetModules();
    requireRequestRoleMock.mockReset();
    createIntentMock.mockReset();
    verifyCapabilityMock.mockReset();
    requireBlobTokenMock.mockReset();
    cleanupMock.mockReset();
    handleUploadMock.mockReset();
    getBlobMock.mockReset();
    delBlobMock.mockReset();
    extractArtifactMock.mockReset();
    loggerWarnMock.mockReset();
    requireRequestRoleMock.mockResolvedValue(auth);
    requireBlobTokenMock.mockReturnValue('private-token');
    verifyCapabilityMock.mockReturnValue({ expiresAt: Date.now() + 60_000 });
    delBlobMock.mockResolvedValue(undefined);
    extractArtifactMock.mockResolvedValue(artifact);
  });

  it('requires a teacher before issuing an upload intent', async () => {
    requireRequestRoleMock.mockResolvedValue(
      NextResponse.json({ errorCode: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/source-documents/upload-intent/route');
    const response = await POST(
      new NextRequest('http://localhost/api/source-documents/upload-intent', { method: 'POST' }),
    );

    expect(response.status).toBe(401);
    expect(createIntentMock).not.toHaveBeenCalled();
  });

  it('binds a private multipart upload token to the signed pathname', async () => {
    handleUploadMock.mockImplementation(async (options) => {
      const constraints = await options.onBeforeGenerateToken(
        'source-documents/uploads/id.pdf',
        'cap',
        true,
      );
      expect(constraints).toMatchObject({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return { type: 'blob.generate-client-token', clientToken: 'client-token' };
    });
    const { POST } = await import('@/app/api/source-documents/upload/route');
    const response = await POST(
      new NextRequest('http://localhost/api/source-documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'blob.generate-client-token',
          payload: {
            pathname: 'source-documents/uploads/id.pdf',
            multipart: true,
            clientPayload: 'cap',
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(verifyCapabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPathname: 'source-documents/uploads/id.pdf',
        capability: 'cap',
      }),
    );
  });

  it('extracts a private PDF and always deletes the raw Blob', async () => {
    getBlobMock.mockResolvedValue({
      stream: new Blob(['%PDF-1.7\nfixture'], { type: 'application/pdf' }).stream(),
      blob: { size: 16, contentType: 'application/pdf' },
    });
    const { POST } = await import('@/app/api/source-documents/extract/route');
    const response = await POST(extractionRequest({ pathname: 'source.pdf', capability: 'cap' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artifact.id).toBe('doc_fixture');
    expect(delBlobMock).toHaveBeenCalledWith('source.pdf', { token: 'private-token' });
  });

  it('rejects malformed PDFs after deleting the raw Blob', async () => {
    getBlobMock.mockResolvedValue({
      stream: new Blob(['not a pdf'], { type: 'application/pdf' }).stream(),
      blob: { size: 9, contentType: 'application/pdf' },
    });
    const { POST } = await import('@/app/api/source-documents/extract/route');
    const response = await POST(extractionRequest({ pathname: 'source.pdf', capability: 'cap' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('The uploaded file is not a valid PDF');
    expect(delBlobMock).toHaveBeenCalled();
    expect(extractArtifactMock).not.toHaveBeenCalled();
  });

  it('fails closed when immediate raw-Blob deletion fails', async () => {
    getBlobMock.mockResolvedValue({
      stream: new Blob(['%PDF-1.7\nfixture'], { type: 'application/pdf' }).stream(),
      blob: { size: 16, contentType: 'application/pdf' },
    });
    delBlobMock.mockRejectedValue(new Error('private token and filename leaked here'));
    const { POST } = await import('@/app/api/source-documents/extract/route');
    const response = await POST(extractionRequest({ pathname: 'source.pdf', capability: 'cap' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('The uploaded PDF could not be removed after extraction');
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain('filename leaked');
  });

  it('sanitizes extractor failures and does not log provider messages', async () => {
    getBlobMock.mockResolvedValue({
      stream: new Blob(['%PDF-1.7\nfixture'], { type: 'application/pdf' }).stream(),
      blob: { size: 16, contentType: 'application/pdf' },
    });
    extractArtifactMock.mockRejectedValue(
      new Error('providerRaw: secret source text from private-file.pdf'),
    );
    const { POST } = await import('@/app/api/source-documents/extract/route');
    const response = await POST(extractionRequest({ pathname: 'source.pdf', capability: 'cap' }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('PDF extraction failed');
    expect(JSON.stringify(body)).not.toContain('providerRaw');
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain('private-file.pdf');
  });

  it('protects cleanup with CRON_SECRET and returns bounded counts', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    cleanupMock.mockResolvedValue({ scanned: 3, deleted: 2 });
    const { GET } = await import('@/app/api/cron/source-document-cleanup/route');
    const forbidden = await GET(
      new NextRequest('http://localhost/api/cron/source-document-cleanup'),
    );
    const allowed = await GET(
      new NextRequest('http://localhost/api/cron/source-document-cleanup', {
        headers: { authorization: 'Bearer cron-secret' },
      }),
    );

    expect(forbidden.status).toBe(403);
    await expect(allowed.json()).resolves.toMatchObject({ success: true, scanned: 3, deleted: 2 });
  });
});

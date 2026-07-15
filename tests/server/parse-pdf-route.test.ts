import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const parsePDFMock = vi.fn();
const resolveGovernedProviderConfigMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock('@/lib/pdf/pdf-providers', () => ({ parsePDF: parsePDFMock }));
vi.mock('@/lib/auth/current-user', () => ({ getRequestAuth: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/ai-governance', () => ({
  resolveGovernedProviderConfig: resolveGovernedProviderConfigMock,
  toGovernedProviderApiErrorResponse: () => null,
}));
vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

function requestFor(file: File) {
  const form = new FormData();
  form.append('pdf', file);
  form.append('providerId', 'unpdf');
  return new NextRequest('http://localhost/api/parse-pdf', { method: 'POST', body: form });
}

describe('legacy PDF parser route', () => {
  beforeEach(() => {
    vi.resetModules();
    parsePDFMock.mockReset();
    resolveGovernedProviderConfigMock.mockReset();
    loggerWarnMock.mockReset();
    resolveGovernedProviderConfigMock.mockResolvedValue({});
  });

  it('rejects MIME and signature mismatches before provider parsing', async () => {
    const { POST } = await import('@/app/api/parse-pdf/route');
    const wrongMime = await POST(
      requestFor(new File(['%PDF-1.7'], 'source.pdf', { type: 'text/plain' })),
    );
    const wrongSignature = await POST(
      requestFor(new File(['not-pdf'], 'source.pdf', { type: 'application/pdf' })),
    );

    expect(wrongMime.status).toBe(415);
    expect(wrongSignature.status).toBe(400);
    expect(parsePDFMock).not.toHaveBeenCalled();
  });

  it('bounds inline image output while keeping the legacy response shape', async () => {
    const smallImage = 'data:image/png;base64,abc';
    const oversizedImage = `data:image/png;base64,${'a'.repeat(1024 * 1024)}`;
    parsePDFMock.mockResolvedValue({
      text: 'source text',
      images: [smallImage, oversizedImage],
      metadata: {
        pageCount: 1,
        parser: 'unpdf',
        imageMapping: { img_1: smallImage, img_2: oversizedImage },
        pdfImages: [
          { id: 'img_1', src: smallImage, pageNumber: 1 },
          { id: 'img_2', src: oversizedImage, pageNumber: 1 },
        ],
      },
    });
    const { POST } = await import('@/app/api/parse-pdf/route');
    const response = await POST(
      requestFor(new File(['%PDF-1.7\nfixture'], 'source.pdf', { type: 'application/pdf' })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.images).toEqual([smallImage]);
    expect(body.data.metadata.pdfImages).toHaveLength(1);
    expect(body.data.metadata.imageMapping).toEqual({ img_1: smallImage });
  });

  it('does not return or log raw provider errors or filenames', async () => {
    parsePDFMock.mockRejectedValue(
      new Error('provider says secret content from private-student-record.pdf'),
    );
    const { POST } = await import('@/app/api/parse-pdf/route');
    const response = await POST(
      requestFor(
        new File(['%PDF-1.7\nfixture'], 'private-student-record.pdf', {
          type: 'application/pdf',
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('PDF extraction failed');
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain('student-record');
    expect(JSON.stringify(body)).not.toContain('secret content');
  });
});

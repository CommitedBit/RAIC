import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocumentProxyMock = vi.fn();
const extractTextMock = vi.fn();

vi.mock('unpdf', () => ({
  getDocumentProxy: getDocumentProxyMock,
  extractText: extractTextMock,
}));

describe('document extraction registry', () => {
  beforeEach(() => {
    vi.resetModules();
    getDocumentProxyMock.mockReset();
    extractTextMock.mockReset();
    getDocumentProxyMock.mockResolvedValue({ numPages: 2 });
    extractTextMock.mockResolvedValue({ totalPages: 2, text: ['First page', 'Second page'] });
  });

  it('creates bounded page blocks, citations, and generation context', async () => {
    const { extractDocumentArtifact } = await import('@/lib/documents/extractors/registry');
    const artifact = await extractDocumentArtifact('application/pdf', Buffer.from('%PDF-fixture'));

    expect(artifact).toMatchObject({
      version: 2,
      mediaType: 'application/pdf',
      pageCount: 2,
      characterCount: 21,
      truncated: false,
    });
    expect(artifact.blocks.map((block) => block.pageNumber)).toEqual([1, 2]);
    expect(artifact.citations.map((citation) => citation.pageNumber)).toEqual([1, 2]);
    expect(artifact.context.text).toContain('[Page 1]\nFirst page');
    expect(artifact.context.text).toContain('[Page 2]\nSecond page');
  });

  it('rejects page-limit and empty extraction results', async () => {
    const { extractDocumentArtifact } = await import('@/lib/documents/extractors/registry');
    getDocumentProxyMock.mockResolvedValueOnce({ numPages: 201 });
    await expect(
      extractDocumentArtifact('application/pdf', Buffer.from('%PDF-many')),
    ).rejects.toMatchObject({ code: 'PDF_PAGE_LIMIT' });

    getDocumentProxyMock.mockResolvedValueOnce({ numPages: 1 });
    extractTextMock.mockResolvedValueOnce({ totalPages: 1, text: ['   '] });
    await expect(
      extractDocumentArtifact('application/pdf', Buffer.from('%PDF-empty')),
    ).rejects.toMatchObject({ code: 'PDF_EMPTY' });
  });

  it('caps artifact and context text and emits diagnostics', async () => {
    const { extractDocumentArtifact } = await import('@/lib/documents/extractors/registry');
    getDocumentProxyMock.mockResolvedValueOnce({ numPages: 2 });
    extractTextMock.mockResolvedValueOnce({
      totalPages: 2,
      text: ['a'.repeat(150_000), 'b'.repeat(150_000)],
    });
    const artifact = await extractDocumentArtifact('application/pdf', Buffer.from('%PDF-large'));

    expect(artifact.characterCount).toBe(200_000);
    expect(artifact.context.characterCount).toBe(50_000);
    expect(artifact.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['artifact_truncated', 'context_truncated']),
    );
  });

  it('preserves aborts and applies a deterministic timeout', async () => {
    const { extractDocumentArtifact } = await import('@/lib/documents/extractors/registry');
    extractTextMock.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    const aborted = extractDocumentArtifact('application/pdf', Buffer.from('%PDF-abort'), {
      signal: controller.signal,
      timeoutMs: 5_000,
    });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'EXTRACTION_ABORTED' });

    getDocumentProxyMock.mockResolvedValueOnce({ numPages: 1 });
    extractTextMock.mockReturnValueOnce(new Promise(() => undefined));
    await expect(
      extractDocumentArtifact('application/pdf', Buffer.from('%PDF-timeout'), { timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'EXTRACTION_TIMEOUT' });
  });
});

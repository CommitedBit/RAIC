// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { DocumentArtifact } from '@/lib/documents/types';

const uploadMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@vercel/blob/client', () => ({ upload: uploadMock }));
vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: (selector: (state: object) => unknown) =>
    selector({
      pdfProviderId: 'unpdf',
      pdfProvidersConfig: { unpdf: {} },
      setPDFProvider: vi.fn(),
    }),
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => <span>unpdf</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const artifact: DocumentArtifact = {
  version: 2,
  id: 'doc_fixture',
  mediaType: 'application/pdf',
  pageCount: 2,
  characterCount: 20,
  truncated: false,
  blocks: [],
  assets: [],
  citations: [],
  diagnostics: [],
  context: { text: 'fixture', characterCount: 7, truncated: false, pageNumbers: [1] },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPicker(overrides: Record<string, unknown> = {}) {
  const { SourceDocumentPicker } = await import('@/components/generation/source-document-picker');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const props = {
    mode: 'governed' as const,
    artifact: null,
    onArtifactChange: vi.fn(),
    pdfFile: null,
    onPdfFileChange: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  await act(async () => root?.render(<SourceDocumentPicker {...props} />));
  return props;
}

async function chooseFile(file: File) {
  const input = container?.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

describe('SourceDocumentPicker', () => {
  beforeEach(() => {
    vi.resetModules();
    uploadMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  it('uploads directly, reports progress, extracts, and returns the artifact', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            intent: {
              uploadId: 'id',
              pathname: 'source-documents/uploads/id.pdf',
              capability: 'cap',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, artifact }), { status: 200 }),
      );
    uploadMock.mockImplementation(async (_pathname, _file, options) => {
      options.onUploadProgress?.({ loaded: 10, total: 10, percentage: 100 });
      return { pathname: 'source-documents/uploads/id.pdf' };
    });
    const props = await renderPicker();

    await chooseFile(new File(['%PDF-1.7'], 'lesson.pdf', { type: 'application/pdf' }));

    expect(uploadMock).toHaveBeenCalledWith(
      'source-documents/uploads/id.pdf',
      expect.any(File),
      expect.objectContaining({
        access: 'private',
        multipart: true,
        clientPayload: 'cap',
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/source-documents/extract',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(props.onArtifactChange).toHaveBeenLastCalledWith(artifact);
    expect(props.onError).toHaveBeenCalledWith(null);
  });

  it('rejects non-PDF and oversized files before network access', async () => {
    const props = await renderPicker();
    await chooseFile(new File(['plain'], 'notes.txt', { type: 'text/plain' }));
    expect(props.onError).toHaveBeenLastCalledWith('sourceDocuments.pdfOnly');

    const oversized = new File(['%PDF-1.7'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 50 * 1024 * 1024 + 1 });
    await chooseFile(oversized);
    expect(props.onError).toHaveBeenLastCalledWith('sourceDocuments.governedSizeLimit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the picker when private source storage is unavailable', async () => {
    await renderPicker({ mode: 'unavailable' });
    const button = container?.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(container?.textContent).toContain('sourceDocuments.unavailable');
  });
});
